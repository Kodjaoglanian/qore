import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { PtyHandle } from "../../core/connections/ssh.js";
import { colors } from "../theme.js";
import { ScrollIndicator } from "./ScrollIndicator.js";

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

const ANSI_FG: Record<number, string> = {
  0: colors.text,
  1: colors.red,
  2: colors.green,
  3: colors.yellow,
  4: colors.blue,
  5: colors.purple,
  6: colors.cyan,
  7: colors.text,
  9: colors.text,
};

function colorFromCell(cell: any): string | undefined {
  const mode = cell.getFgColorMode();
  const color = cell.getFgColor();
  if (mode === 1) return ANSI_FG[color] ?? colors.text;
  if (mode === 2) return undefined;
  return undefined;
}

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

  const termW = Math.max(20, (stdout.columns || process.stdout.columns || 80) - 2);
  const termH = Math.max(8, (stdout.rows || process.stdout.rows || 24) - 6);

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

    if (key.ctrl && input === "c") {
      try { pty.send("\x03"); } catch {}
      return;
    }

    if (key.ctrl && input === "d") {
      try { pty.send("\x04"); } catch {}
      return;
    }

    if (key.upArrow) {
      scrollOffset.current = Math.max(0, scrollOffset.current - 1);
      setShowScroll(true);
      renderScreen();
      return;
    }
    if (key.downArrow) {
      scrollOffset.current += 1;
      setShowScroll(true);
      renderScreen();
      return;
    }
    if (key.pageUp) {
      scrollOffset.current = Math.max(0, scrollOffset.current - 10);
      setShowScroll(true);
      renderScreen();
      return;
    }
    if (key.pageDown) {
      scrollOffset.current += 10;
      setShowScroll(true);
      renderScreen();
      return;
    }

    scrollOffset.current = 0;
    setShowScroll(false);

    if (finishedRef.current !== null) return;

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

  return (
    <Box flexDirection="column" height={termH + 2}>
      <Box marginBottom={0} flexDirection="row" justifyContent="space-between">
        <Text color={finished !== null ? colors.green : colors.purpleBright} bold>
          {"  > "}{title}{finished !== null ? ` [done exit=${finished} · esc/q to return]` : " [terminal — type to interact · esc to exit]"}
        </Text>
        {showScroll && (
          <ScrollIndicator
            offset={scrollOffset.current}
            total={totalLines}
            visible={termH}
          />
        )}
      </Box>
      <Box flexDirection="column" height={termH} overflow="hidden">
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
    </Box>
  );
}
