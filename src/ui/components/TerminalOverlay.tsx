import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { PtyHandle } from "../../core/connections/ssh.js";
import { colors } from "../theme.js";
import { ScrollIndicator } from "./ScrollIndicator.js";
import { StyledBox } from "./Box.js";
import { ShortcutBar } from "./ShortcutBar.js";
import { Spinner } from "./Spinner.js";

interface TerminalOverlayProps {
  pty: PtyHandle;
  title: string;
  width?: number;
  height?: number;
  onDone: (result: { exitCode: number; stdout: string; stderr: string }) => void;
  onCancel: () => void;
}

interface StyledSpan {
  text: string;
  fg?: string;
  bg?: string;
  bold: boolean;
  dim: boolean;
}

function getAnsi16Color(code: number): string {
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

function xterm256ToHex(n: number): string {
  if (n < 16) return getAnsi16Color(n);
  if (n >= 232) {
    const gray = 8 + (n - 232) * 10;
    const h = gray.toString(16).padStart(2, "0");
    return `#${h}${h}${h}`;
  }
  const idx = n - 16;
  const r = Math.floor(idx / 36);
  const g = Math.floor((idx % 36) / 6);
  const b = idx % 6;
  const levels = [0, 95, 135, 175, 215, 255];
  return `#${levels[r].toString(16).padStart(2, "0")}${levels[g].toString(16).padStart(2, "0")}${levels[b].toString(16).padStart(2, "0")}`;
}

function fgFromCell(cell: any): string | undefined {
  const mode = cell.getFgColorMode();
  const color = cell.getFgColor();
  if (mode === 1) return xterm256ToHex(color);
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
  b: "\x02",
  c: "\x03",
  d: "\x04",
  e: "\x05",
  f: "\x06",
  k: "\x0b",
  l: "\x0c",
  n: "\x0e",
  p: "\x10",
  r: "\x12",
  u: "\x15",
  w: "\x17",
  z: "\x1a",
};

export function TerminalOverlay({
  pty,
  title,
  width,
  height,
  onDone,
  onCancel,
}: TerminalOverlayProps) {
  const { stdout } = useStdout();
  const termRef = useRef<any>(null);
  const [, forceRender] = useState(0);
  const renderTick = useRef(0);
  const scrollOffset = useRef(0);
  const [showScroll, setShowScroll] = useState(false);
  const [finished, setFinished] = useState<number | null>(null);
  const finishedRef = useRef<number | null>(null);
  const renderPending = useRef(false);

  const availW = width ?? Math.max(30, (stdout.columns || process.stdout.columns || 80) - 4);
  const availH = height ?? Math.max(10, (stdout.rows || process.stdout.rows || 24) - 6);

  // StyledBox has 2 cols border + 2 cols paddingX = 4 cols horizontal overhead
  // Footer has 1 line marginTop + 1 line ShortcutBar = 2 lines
  // StyledBox has 2 lines border + 1 line title = 3 lines vertical overhead
  const boxH = Math.max(7, availH - 2);
  const innerCols = Math.max(20, availW - 4);
  const innerRows = Math.max(4, boxH - 3);

  const isInteractiveSession = title.startsWith("shell:") || title.startsWith("edit:");

  const scheduleRender = useCallback(() => {
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
    let stderrHandler: ((d: Buffer) => void) | null = null;
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
        cols: innerCols,
        rows: innerRows,
        scrollback: 2000,
        convertEol: false,
        allowProposedApi: true,
      });
      termRef.current = term;

      pty.resize(innerCols, innerRows);

      dataHandler = (d: Buffer) => {
        term.write(d.toString("utf8"), () => scheduleRender());
        scheduleRender();
      };
      stderrHandler = (d: Buffer) => {
        term.write(d.toString("utf8"), () => scheduleRender());
        scheduleRender();
      };
      closeHandler = (code: number) => {
        finishedRef.current = code ?? 0;
        setFinished(code ?? 0);
        scheduleRender();
      };

      pty.stream.on("data", dataHandler);
      pty.stream.stderr?.on("data", stderrHandler);
      pty.stream.on("close", closeHandler);

      // Replay any MOTD / login prompt chunks emitted before Terminal mounted
      const buffered = pty.consumeBuffer?.() ?? [];
      if (buffered.length > 0) {
        term.write(buffered.join(""), () => scheduleRender());
      }

      const existingExit = pty.getExitCode?.() ?? null;
      if (existingExit !== null) {
        finishedRef.current = existingExit;
        setFinished(existingExit);
      }

      scheduleRender();
    })();

    return () => {
      cancelled = true;
      if (term) term.dispose();
      if (dataHandler) try { pty.stream.off("data", dataHandler); } catch {}
      if (stderrHandler) try { pty.stream.stderr?.off("data", stderrHandler); } catch {}
      if (closeHandler) try { pty.stream.off("close", closeHandler); } catch {}
    };
  }, []);

  // Keep xterm-headless & remote PTY dimensions synced when terminal resizes
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    try {
      term.resize(innerCols, innerRows);
      pty.resize(innerCols, innerRows);
      scheduleRender();
    } catch {}
  }, [innerCols, innerRows, pty, scheduleRender]);

  useInput((input, key) => {
    const term = termRef.current;
    if (!term) return;

    // Ctrl+] (GS, 0x1d) always force-closes the PTY cleanly (standard ssh/telnet escape)
    if (input === "\x1d" || (key.ctrl && input === "]")) {
      if (finishedRef.current !== null) {
        onDone({ exitCode: finishedRef.current, stdout: "", stderr: "" });
      } else {
        try { pty.cancel(); } catch {}
        onCancel();
      }
      return;
    }

    if (key.escape || input === "\x1b") {
      if (finishedRef.current !== null) {
        onDone({ exitCode: finishedRef.current, stdout: "", stderr: "" });
        return;
      }
      if (isInteractiveSession) {
        // Forward Esc to vim/nano/bash inside interactive sessions
        try { pty.send("\x1b"); } catch {}
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
      scrollOffset.current += Math.max(5, Math.floor(innerRows / 2));
      setShowScroll(true);
      scheduleRender();
      return;
    }
    if (key.pageDown) {
      scrollOffset.current = Math.max(0, scrollOffset.current - Math.max(5, Math.floor(innerRows / 2)));
      setShowScroll(scrollOffset.current > 0);
      scheduleRender();
      return;
    }

    if (finishedRef.current !== null) {
      if (key.upArrow) {
        scrollOffset.current += 1;
        setShowScroll(true);
        scheduleRender();
      } else if (key.downArrow) {
        scrollOffset.current = Math.max(0, scrollOffset.current - 1);
        setShowScroll(scrollOffset.current > 0);
        scheduleRender();
      }
      return;
    }

    // Snap back to live bottom on any interactive key
    if (showScroll) {
      scrollOffset.current = 0;
      setShowScroll(false);
    }

    if (key.ctrl && input) {
      const seq = CTRL_MAP[input.toLowerCase()];
      if (seq) {
        try { pty.send(seq); } catch {}
      }
      return;
    }

    if (key.upArrow) { try { pty.send("\x1b[A"); } catch {} return; }
    if (key.downArrow) { try { pty.send("\x1b[B"); } catch {} return; }
    if (key.rightArrow) { try { pty.send("\x1b[C"); } catch {} return; }
    if (key.leftArrow) { try { pty.send("\x1b[D"); } catch {} return; }

    if (key.return) {
      try { pty.send("\r"); } catch {}
    } else if (key.backspace) {
      try { pty.send("\x7f"); } catch {}
    } else if (key.delete) {
      try { pty.send("\x1b[3~"); } catch {}
    } else if (key.tab) {
      try { pty.send("\t"); } catch {}
    } else if (input && !key.ctrl && !key.meta) {
      try { pty.send(input); } catch {}
    }
  });

  const term = termRef.current;
  if (!term) {
    return (
      <Box flexDirection="column" width={availW} height={availH} overflow="hidden">
        <StyledBox title={`>_ ${title}`} focused height={boxH} padding={1} overflow="hidden">
          <Spinner label="Starting SSH PTY session..." color={colors.cyan} />
        </StyledBox>
      </Box>
    );
  }

  const buffer = term.buffer.active;
  const cursorX = Math.min(innerCols - 1, Math.max(0, buffer.cursorX));
  const cursorY = buffer.cursorY;

  const totalLines = buffer.length;
  const baseY = buffer.baseY;
  const maxScroll = Math.max(0, baseY);
  if (scrollOffset.current > maxScroll) {
    scrollOffset.current = maxScroll;
  }

  const startLine = showScroll ? Math.max(0, baseY - scrollOffset.current) : baseY;
  const renderedRows: StyledSpan[][] = [];

  for (let row = 0; row < innerRows; row++) {
    const lineIdx = startLine + row;
    const line = buffer.getLine(lineIdx);
    const isCursorRow = !showScroll && row === cursorY && finished === null;

    if (!line) {
      if (isCursorRow) {
        renderedRows.push([
          { text: " ".repeat(cursorX), bold: false, dim: false },
          { text: " ", bg: colors.purpleBright, fg: colors.bg, bold: true, dim: false },
        ]);
      } else {
        renderedRows.push([{ text: " ", bold: false, dim: false }]);
      }
      continue;
    }

    const spans: StyledSpan[] = [];
    let currentSpan: StyledSpan | null = null;
    let colCount = 0;

    // Determine last non-space column (or cursorX if on cursor row)
    let lastCol = Math.min(line.length, innerCols);
    if (isCursorRow && cursorX + 1 > lastCol) {
      lastCol = Math.min(innerCols, cursorX + 1);
    }

    for (let col = 0; col < lastCol && colCount < innerCols; col++) {
      const cell = line.getCell(col);
      const w = cell ? cell.getWidth() : 1;
      if (w === 0) continue; // trailing cell of wide char
      if (colCount + w > innerCols) break;

      const ch = (cell?.getChars() || " ").replace(/[\x00-\x1f]/g, " ");
      const isCursorCell = isCursorRow && col === cursorX;
      const fg = isCursorCell ? colors.bg : fgFromCell(cell);
      const bg = isCursorCell ? colors.purpleBright : undefined;
      const bold = isCursorCell || Boolean(cell?.isBold());
      const dim = !isCursorCell && Boolean(cell?.isDim());

      if (
        currentSpan &&
        currentSpan.fg === fg &&
        currentSpan.bg === bg &&
        currentSpan.bold === bold &&
        currentSpan.dim === dim
      ) {
        currentSpan.text += ch;
      } else {
        currentSpan = { text: ch, fg, bg, bold, dim };
        spans.push(currentSpan);
      }
      colCount += w;
    }

    if (spans.length === 0) {
      spans.push({ text: " ", bold: false, dim: false });
    }
    renderedRows.push(spans);
  }

  const statusBadge =
    finished === null
      ? `● LIVE · ${innerCols}x${innerRows}`
      : finished === 0
        ? `✓ EXIT 0 · esc/q`
        : `✗ EXIT ${finished} · esc/q`;

  return (
    <Box flexDirection="column" width={availW} height={availH} overflow="hidden">
      <StyledBox
        title={`>_ ${title}`}
        rightTitle={statusBadge}
        focused
        borderColor={finished === null ? colors.purple : finished === 0 ? colors.green : colors.red}
        width={availW}
        height={boxH}
        padding={0}
        overflow="hidden"
      >
        <Box flexDirection="column" width={availW - 2} height={innerRows} paddingX={1} overflow="hidden">
          {renderedRows.map((spans, rowIdx) => (
            <Box key={rowIdx} height={1} width={innerCols} overflow="hidden">
              {spans.map((sp, spIdx) => (
                <Text
                  key={spIdx}
                  color={sp.fg || colors.text}
                  backgroundColor={sp.bg}
                  bold={sp.bold}
                  dimColor={sp.dim}
                  wrap="truncate"
                >
                  {sp.text}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      </StyledBox>

      <Box marginTop={1} height={1} width={availW} flexDirection="row" justifyContent="space-between" overflow="hidden">
        <ShortcutBar
          shortcuts={
            finished !== null
              ? [
                  { key: "↑/↓", label: "scroll" },
                  { key: "esc/q", label: "return" },
                ]
              : isInteractiveSession
                ? [
                    { key: "↑↓←→", label: "shell" },
                    { key: "PgUp/Dn", label: "scrollback" },
                    { key: "^D", label: "exit" },
                    { key: "^]", label: "force close" },
                  ]
                : [
                    { key: "PgUp/Dn", label: "scrollback" },
                    { key: "^C", label: "interrupt" },
                    { key: "esc", label: "close" },
                  ]
          }
        />
        {showScroll && (
          <ScrollIndicator
            offset={scrollOffset.current}
            total={totalLines}
            visible={innerRows}
          />
        )}
      </Box>
    </Box>
  );
}
