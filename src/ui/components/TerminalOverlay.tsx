import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { PtyHandle } from "../../core/connections/ssh.js";
import { colors } from "../theme.js";
import { ScrollIndicator } from "./ScrollIndicator.js";
import { StyledBox } from "./Box.js";
import { ShortcutBar } from "./ShortcutBar.js";

interface TerminalOverlayProps {
  pty: PtyHandle;
  title: string;
  onDone: (result: { exitCode: number; stdout: string; stderr: string }) => void;
  onCancel: () => void;
}

interface ScreenLine {
  text: string;
  fg: string | undefined;
  bold: boolean;
  dim: boolean;
}

function getAnsiColor(code: number): string {
  const palette: Record<number, string> = {
    0: colors.textDim,
    1: colors.red,
    2: colors.green,
    3: colors.yellow,
    4: colors.blue,
    5: colors.purple,
    6: colors.cyan,
    7: colors.text,
    8: colors.textMuted,
    9: colors.red,
    10: colors.green,
    11: colors.yellow,
    12: colors.blue,
    13: colors.purpleBright,
    14: colors.cyan,
    15: colors.textBright,
  };
  return palette[code] ?? colors.text;
}

function colorFromCell(cell: any): string | undefined {
  const mode = cell.getFgColorMode();
  const color = cell.getFgColor();
  // xterm-headless color modes: 0 = default, 1 = palette (16/256), 2 = RGB 24-bit
  if (mode === 1) {
    if (color >= 0 && color <= 15) return getAnsiColor(color);
    return colors.text;
  }
  if (mode === 2) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  return undefined;
}

const CTRL_MAP: Record<string, string> = {
  a: "\x01",
  c: "\x03",
  d: "\x04",
  e: "\x05",
  k: "\x0b",
  l: "\x0c",
  r: "\x12",
  u: "\x15",
  w: "\x17",
  z: "\x1a",
};

export function TerminalOverlay({ pty, title, onDone, onCancel }: TerminalOverlayProps) {
  const { stdout } = useStdout();
  const termRef = useRef<any>(null);
  const [, forceRender] = useState(0);
  const renderTick = useRef(0);
  const scrollOffset = useRef(0);
  const [showScroll, setShowScroll] = useState(false);
  const [finished, setFinished] = useState<number | null>(null);
  const finishedRef = useRef<number | null>(null);
  const renderPending = useRef(false);

  const termW = Math.max(24, (stdout.columns || process.stdout.columns || 80) - 8);
  const termH = Math.max(8, (stdout.rows || process.stdout.rows || 24) - 10);

  const renderScreen = useCallback(() => {
    if (renderPending.current) return;
    renderPending.current = true;
    setTimeout(() => {
      renderPending.current = false;
      renderTick.current++;
      forceRender(renderTick.current);
    }, 16);
  }, []);

  useEffect(() => {
    let term: any = null;
    let dataHandler: ((d: Buffer) => void) | null = null;
    let closeHandler: ((code: number) => void) | null = null;
    let cancelled = false;

    (async () => {
      if (cancelled) return;
      if (typeof (globalThis as any).window === "undefined") {
        (globalThis as any).window = globalThis;
      }
      const { Terminal } = await import("xterm-headless");
      if (cancelled) return;
      term = new Terminal({
        cols: termW,
        rows: termH,
        convertEol: true,
        allowProposedApi: true,
      });
      termRef.current = term;

      pty.resize(termW, termH);

      dataHandler = (d: Buffer) => {
        term.write(d.toString());
        renderScreen();
      };

      pty.stream.on("data", dataHandler);

      closeHandler = (code: number) => {
        finishedRef.current = code ?? 0;
        setFinished(code ?? 0);
        renderScreen();
      };

      pty.stream.on("close", closeHandler);
      renderScreen();
    })();

    return () => {
      cancelled = true;
      if (term) term.dispose();
      if (dataHandler) try { pty.stream.off("data", dataHandler); } catch {}
      if (closeHandler) try { pty.stream.off("close", closeHandler); } catch {}
    };
  }, []);

  useInput((input, key) => {
    const term = termRef.current;
    if (!term) return;

    if (key.escape || input === "\x1b") {
      if (finishedRef.current !== null) {
        onDone({ exitCode: finishedRef.current, stdout: "", stderr: "" });
      } else {
        try { pty.cancel(); } catch {}
        onCancel();
      }
      return;
    }

    if (finishedRef.current !== null && (input === "q" || input === "Q")) {
      onDone({ exitCode: finishedRef.current, stdout: "", stderr: "" });
      return;
    }

    // PgUp / PgDn scrollback
    if (key.pageUp) {
      scrollOffset.current += 10;
      setShowScroll(true);
      renderScreen();
      return;
    }
    if (key.pageDown) {
      scrollOffset.current = Math.max(0, scrollOffset.current - 10);
      setShowScroll(scrollOffset.current > 0);
      renderScreen();
      return;
    }

    // If finished, allow Up/Down arrows to scroll output
    if (finishedRef.current !== null) {
      if (key.upArrow) {
        scrollOffset.current += 1;
        setShowScroll(true);
        renderScreen();
      } else if (key.downArrow) {
        scrollOffset.current = Math.max(0, scrollOffset.current - 1);
        setShowScroll(scrollOffset.current > 0);
        renderScreen();
      }
      return;
    }

    // Any live input snaps back to bottom of terminal
    if (showScroll) {
      scrollOffset.current = 0;
      setShowScroll(false);
    }

    // Forward Ctrl+key combinations to PTY
    if (key.ctrl && input) {
      const seq = CTRL_MAP[input.toLowerCase()];
      if (seq) {
        try { pty.send(seq); } catch {}
      }
      return;
    }

    // Forward full navigation & arrow keys to PTY (bash history, vim, nano, htop)
    if (key.upArrow) {
      try { pty.send("\x1b[A"); } catch {}
      return;
    }
    if (key.downArrow) {
      try { pty.send("\x1b[B"); } catch {}
      return;
    }
    if (key.rightArrow) {
      try { pty.send("\x1b[C"); } catch {}
      return;
    }
    if (key.leftArrow) {
      try { pty.send("\x1b[D"); } catch {}
      return;
    }

    if (key.return) {
      try { pty.send("\r"); } catch {}
    } else if (key.backspace || key.delete) {
      try { pty.send("\x7f"); } catch {}
    } else if (key.tab) {
      try { pty.send("\t"); } catch {}
    } else if (input && !key.ctrl && !key.meta) {
      try { pty.send(input); } catch {}
    }
  });

  const term = termRef.current;
  if (!term) return null;

  const buffer = term.buffer.active;
  const cursorX = buffer.cursorX;
  const cursorY = buffer.cursorY;
  const lines: ScreenLine[] = [];

  const totalLines = buffer.length;
  const baseY = buffer.baseY;
  const maxScroll = Math.max(0, totalLines - termH);

  if (scrollOffset.current > maxScroll) {
    scrollOffset.current = maxScroll;
  }

  const startLine = showScroll ? Math.max(0, baseY - scrollOffset.current) : baseY;

  for (let row = 0; row < termH; row++) {
    const lineIdx = startLine + row;
    const line = buffer.getLine(lineIdx);
    if (!line) {
      lines.push({ text: "", fg: undefined, bold: false, dim: false });
      continue;
    }

    let text = "";
    let lineFg: string | undefined = undefined;
    let lineBold = false;
    let lineDim = false;

    for (let col = 0; col < Math.min(line.length, termW); col++) {
      const cell = line.getCell(col);
      if (!cell) {
        text += " ";
        continue;
      }
      const w = cell.getWidth();
      if (w === 0) continue;
      const chars = cell.getChars() || " ";
      text += chars;

      if (!lineFg) {
        const c = colorFromCell(cell);
        if (c) lineFg = c;
      }
      if (cell.isBold()) lineBold = true;
      if (cell.isDim()) lineDim = true;
    }

    lines.push({
      text: text.replace(/\s+$/, "") || " ",
      fg: lineFg,
      bold: lineBold,
      dim: lineDim,
    });
  }

  const statusBadge =
    finished === null
      ? `● LIVE PTY · ${termW}×${termH}`
      : finished === 0
        ? `✓ EXIT 0 · esc/q to return`
        : `✗ EXIT ${finished} · esc/q to return`;

  return (
    <Box flexDirection="column" height={termH + 5} overflow="hidden">
      <StyledBox
        title={`>_ ${title}`}
        rightTitle={statusBadge}
        focused
        borderColor={finished === null ? colors.purple : finished === 0 ? colors.green : colors.red}
        height={termH + 3}
        padding={0}
        overflow="hidden"
      >
        <Box flexDirection="column" height={termH} paddingX={1} overflow="hidden">
          {lines.map((line, i) => {
            const isCursorLine = !showScroll && i === cursorY && finished === null;

            if (isCursorLine && cursorX < line.text.length) {
              const before = line.text.slice(0, cursorX);
              const cursorChar = line.text.charAt(cursorX);
              const after = line.text.slice(cursorX + 1);
              return (
                <Box key={i}>
                  <Text color={line.fg || colors.text} bold={line.bold} dimColor={line.dim}>{before}</Text>
                  <Text backgroundColor={line.fg || colors.purpleBright} bold>{cursorChar}</Text>
                  <Text color={line.fg || colors.text} bold={line.bold} dimColor={line.dim}>{after}</Text>
                </Box>
              );
            } else if (isCursorLine) {
              const padded = line.text + " ".repeat(Math.max(0, cursorX - line.text.length));
              return (
                <Box key={i}>
                  <Text color={line.fg || colors.text} bold={line.bold} dimColor={line.dim}>{padded}</Text>
                  <Text backgroundColor={colors.purpleBright}> </Text>
                </Box>
              );
            }

            return (
              <Box key={i}>
                <Text
                  color={line.fg || colors.text}
                  bold={line.bold}
                  dimColor={line.dim}
                >
                  {line.text}
                </Text>
              </Box>
            );
          })}
        </Box>
      </StyledBox>

      <Box marginTop={1} flexDirection="row" justifyContent="space-between">
        <ShortcutBar
          shortcuts={
            finished !== null
              ? [
                  { key: "↑/↓", label: "scroll" },
                  { key: "esc/q", label: "return" },
                ]
              : [
                  { key: "↑↓←→", label: "terminal" },
                  { key: "PgUp/Dn", label: "scrollback" },
                  { key: "^D", label: "exit shell" },
                  { key: "esc", label: "close PTY" },
                ]
          }
        />
        {showScroll && (
          <ScrollIndicator
            offset={scrollOffset.current}
            total={totalLines}
            visible={termH}
          />
        )}
      </Box>
    </Box>
  );
}
