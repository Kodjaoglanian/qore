import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme.js";
import { StyledBox } from "./Box.js";
import { fuzzyMatch } from "../utils.js";

export { fuzzyMatch };

export interface PaletteItem {
  id: string;
  label: string;
  category: string;
  description: string;
  icon: string;
  color?: string;
  action: () => void;
}

interface CommandPaletteProps {
  items: PaletteItem[];
  onClose: () => void;
  width: number;
  height: number;
}

export function CommandPalette({ items, onClose, width, height }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    return items
      .map((item) => {
        const labelHit = fuzzyMatch(query, item.label);
        const catHit = fuzzyMatch(query, item.category);
        const descHit = fuzzyMatch(query, item.description);
        const best = Math.max(
          labelHit.match ? labelHit.score + 20 : -1,
          catHit.match ? catHit.score + 5 : -1,
          descHit.match ? descHit.score : -1
        );
        return { item, score: best };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);
  }, [items, query]);

  useEffect(() => {
    if (selectedIdx >= filtered.length) {
      setSelectedIdx(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIdx]);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "k")) {
      onClose();
      return;
    }
    if (key.return) {
      const picked = filtered[selectedIdx];
      onClose();
      if (picked) picked.action();
      return;
    }
    if (key.upArrow) {
      setSelectedIdx((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setSelectedIdx(0);
      return;
    }
    if (key.ctrl && input === "u") {
      setQuery("");
      setSelectedIdx(0);
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.tab) {
      setQuery((q) => q + input);
      setSelectedIdx(0);
    }
  });

  const modalW = Math.min(76, Math.max(44, width - 8));
  const maxVisible = Math.max(5, Math.min(12, height - 10));
  const scrollStart = Math.max(0, Math.min(selectedIdx - Math.floor(maxVisible / 2), Math.max(0, filtered.length - maxVisible)));
  const visible = filtered.slice(scrollStart, scrollStart + maxVisible);

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width={width}
      height={height}
      overflow="hidden"
    >
      <StyledBox
        title="Command Palette"
        rightTitle={`${filtered.length}/${items.length}`}
        variant="overlay"
        focused
        width={modalW}
        padding={1}
        overflow="hidden"
      >
        <Box
          borderStyle="round"
          borderColor={colors.purple}
          paddingX={1}
          marginTop={1}
          marginBottom={1}
        >
          <Text color={colors.purpleBright} bold>⌕ </Text>
          {query ? (
            <Text color={colors.textBright}>{query}</Text>
          ) : (
            <Text color={colors.textMuted}>Search screens, themes, connections, actions...</Text>
          )}
          <Text color={colors.purpleBright}>▎</Text>
        </Box>

        <Box flexDirection="column" height={maxVisible} overflow="hidden">
          {visible.length === 0 ? (
            <Text color={colors.textMuted}>  No matching commands.</Text>
          ) : (
            visible.map((item, idx) => {
              const realIdx = scrollStart + idx;
              const isSelected = realIdx === selectedIdx;
              const descMax = Math.max(10, modalW - 38);
              const desc = item.description.length > descMax
                ? item.description.slice(0, descMax - 1) + "…"
                : item.description;

              return (
                <Box key={item.id} flexDirection="row" justifyContent="space-between" width="100%">
                  <Box flexDirection="row">
                    <Text color={isSelected ? colors.purpleBright : colors.textDim} bold={isSelected}>
                      {isSelected ? "▸ " : "  "}
                    </Text>
                    <Text color={item.color ?? colors.purple}>{item.icon} </Text>
                    <Text color={isSelected ? colors.textBright : colors.text} bold={isSelected}>
                      {item.label.padEnd(20)}
                    </Text>
                    <Text color={colors.textMuted}>{desc}</Text>
                  </Box>
                  <Text color={colors.purpleDim}>[{item.category}]</Text>
                </Box>
              );
            })
          )}
        </Box>

        <Box marginTop={1} justifyContent="space-between">
          <Text color={colors.textDim}>
            <Text color={colors.purple} bold>↑/↓</Text> navigate · <Text color={colors.purple} bold>Enter</Text> run · <Text color={colors.purple} bold>Esc</Text> close
          </Text>
          <Text color={colors.textMuted}>^K</Text>
        </Box>
      </StyledBox>
    </Box>
  );
}
