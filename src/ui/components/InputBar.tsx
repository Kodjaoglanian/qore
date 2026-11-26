import React, { useState, useRef, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme.js";

interface InputBarProps {
  onSubmit: (value: string) => void;
  onEmptySubmit?: () => void;
  onNavigate?: (direction: "up" | "down") => void;
  onChange?: (value: string) => void;
  placeholder?: string;
  focused?: boolean;
  prompt?: string;
  masked?: boolean;
  history?: string[];
  completions?: string[];
}

export function InputBar({
  onSubmit,
  onEmptySubmit,
  onNavigate,
  onChange,
  placeholder = "Type a command...",
  focused = true,
  prompt = "❯",
  masked = false,
  history = [],
  completions = [],
}: InputBarProps) {
  const [value, setValue] = useState("");
  const histIdx = useRef(history.length);
  const draft = useRef("");
  const tabIdx = useRef(-1);

  const updateValue = (next: string) => {
    setValue(next);
    onChange?.(next);
  };

  // Compute inline ghost suggestion for the first matching completion
  const ghostSuggestion = useMemo(() => {
    if (masked || !value.trim() || completions.length === 0) return "";
    const lower = value.toLowerCase();
    const match = completions.find(
      (c) => c.toLowerCase().startsWith(lower) && c.length > value.length
    );
    return match ? match.slice(value.length) : "";
  }, [value, completions, masked]);

  useInput(
    (input, key) => {
      if (key.return) {
        if (value.trim()) {
          onSubmit(value);
        } else if (onEmptySubmit) {
          onEmptySubmit();
        } else {
          onSubmit("");
        }
        updateValue("");
        histIdx.current = history.length;
        draft.current = "";
        tabIdx.current = -1;
        return;
      }
      if (key.tab && !key.ctrl && completions.length > 0) {
        const prefix = value.trim().toLowerCase();
        if (prefix) {
          const matches = completions.filter((c) => c.toLowerCase().startsWith(prefix));
          if (matches.length > 0) {
            tabIdx.current = (tabIdx.current + 1) % matches.length;
            updateValue(matches[tabIdx.current]);
            return;
          }
        }
      }
      if (key.upArrow) {
        if (value.length > 0 && history.length > 0) {
          if (histIdx.current === history.length) draft.current = value;
          histIdx.current = Math.max(0, histIdx.current - 1);
          updateValue(history[histIdx.current] ?? "");
        } else if (onNavigate) {
          onNavigate("up");
        }
        return;
      }
      if (key.downArrow) {
        if (value.length > 0 && history.length > 0) {
          histIdx.current = Math.min(history.length, histIdx.current + 1);
          updateValue(histIdx.current === history.length ? draft.current : (history[histIdx.current] ?? ""));
        } else if (onNavigate) {
          onNavigate("down");
        }
        return;
      }
      if (key.backspace || key.delete) {
        tabIdx.current = -1;
        updateValue(value.slice(0, -1));
        return;
      }
      if (key.ctrl && input === "u") {
        tabIdx.current = -1;
        updateValue("");
        return;
      }
      if (key.ctrl && input === "w") {
        tabIdx.current = -1;
        updateValue(value.replace(/\s*\S+\s*$/, ""));
        return;
      }
      if (input && !key.ctrl && !key.meta && !key.escape && !key.tab) {
        tabIdx.current = -1;
        updateValue(value + input);
      }
    },
    { isActive: focused }
  );

  const displayValue = masked ? "•".repeat(value.length) : value;

  const maxW = Math.max(20, (process.stdout.columns || 80) - 8);
  const truncatedValue = displayValue.length > maxW
    ? displayValue.slice(0, maxW - 1) + "…"
    : displayValue;
  const remainingW = Math.max(0, maxW - truncatedValue.length);
  const truncatedGhost = ghostSuggestion.slice(0, remainingW);
  const truncatedPlaceholder = placeholder.length > maxW
    ? placeholder.slice(0, maxW - 1) + "…"
    : placeholder;

  return (
    <Box
      borderStyle="round"
      borderColor={focused ? colors.border : colors.borderMuted}
      paddingX={1}
      width="100%"
      flexShrink={0}
      overflow="hidden"
    >
      <Text color={focused ? colors.purpleBright : colors.textMuted} bold>
        {prompt}{" "}
      </Text>
      {value.length > 0 ? (
        <>
          <Text color={colors.textBright} wrap="truncate">{truncatedValue}</Text>
          {focused && <Text color={colors.purpleBright}>▎</Text>}
          {truncatedGhost && (
            <Text color={colors.textMuted} wrap="truncate">{truncatedGhost}</Text>
          )}
        </>
      ) : (
        <>
          {focused && <Text color={colors.purpleBright}>▎</Text>}
          <Text color={colors.textMuted} wrap="truncate">{truncatedPlaceholder}</Text>
        </>
      )}
    </Box>
  );
}
