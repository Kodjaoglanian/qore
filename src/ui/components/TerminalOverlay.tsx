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

  const termW = Math.min(process.stdout.columns || 80, 200);
  const termH = Math.max(8, (process.stdout.rows || 24) - 6);

  const renderScreen = useCallback(() => {
    renderTick.current++;
    forceRender(renderTick.current);
  }, []);

  useEffect(() => {
    let term: any = null;

    (async () => {
      if (typeof (globalThis as any).window === "undefined") {
        (globalThis as any).window = globalThis;
      }
      const { Terminal } = await import("xterm-headless");
      term = new Terminal({
        cols: termW,
        rows: termH,
        convertEol: false,
        allowProposedApi: true,
      });
      termRef.current = term;

      pty.resize(termW, termH);

      const dataHandler = (data: string) => {
        term.write(data);
        renderScreen();
      };

      pty.stream.on("data", (d: Buffer) => dataHandler(d.toString()));

      const closeHandler = (code: number) => {
        setFinished(code ?? 0);
        renderScreen();
      };

      pty.stream.on("close", closeHandler);
      renderScreen();
    })();

    return () => {
      if (term) term.dispose();
    };
  }, []);

  useInput((input, key) => {
    const term = termRef.current;
    if (!term) return;

    if (key.escape) {
      if (finished !== null) {
        onDone({ exitCode: finished, stdout: "", stderr: "" });
      } else {
        pty.cancel();
        onCancel();
      }
      return;
    }

    if (key.ctrl && input === "c") {
      pty.send("\x03");
      return;
    }

    if (key.ctrl && input === "d") {
      pty.send("\x04");
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

    if (finished !== null) return;

    if (key.return) {
      pty.send("\r");
    } else if (key.backspace || key.delete) {
      pty.send("\x7f");
    } else if (key.tab) {
      pty.send("\t");
    } else if (input && !key.ctrl && !key.meta) {
      pty.send(input);
    }
  });

  const term = termRef.current;
  if (!term) return null;

  const buffer = term.buffer.active;
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
          {"  > "}{title}{finished !== null ? ` [done exit=${finished} · esc to return]` : " [terminal — type to interact · esc to exit]"}
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
        {lines.map((line, i) => (
          <Box key={i}>
            <Text
              color={line.fg || colors.text}
              bold={line.bold}
              dimColor={line.dim}
            >
              {line.text}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
