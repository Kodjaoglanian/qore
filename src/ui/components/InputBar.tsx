import React, { useState, useCallback, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme.js";

interface InputBarProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  focused?: boolean;
  prompt?: string;
  masked?: boolean;
  history?: string[];
}

export function InputBar({
  onSubmit,
  placeholder = "Type a command...",
  focused = true,
  prompt = ">",
  masked = false,
  history = [],
}: InputBarProps) {
  const [value, setValue] = useState("");
  const histIdx = useRef(history.length);
  const draft = useRef("");

  useInput(
    (input, key) => {
      if (key.return) {
        if (value.trim()) onSubmit(value);
        setValue("");
        histIdx.current = history.length;
        draft.current = "";
        return;
      }
      if (key.upArrow && history.length > 0) {
        if (histIdx.current === history.length) draft.current = value;
        histIdx.current = Math.max(0, histIdx.current - 1);
        setValue(history[histIdx.current] ?? "");
        return;
      }
      if (key.downArrow && history.length > 0) {
        histIdx.current = Math.min(history.length, histIdx.current + 1);
        setValue(histIdx.current === history.length ? draft.current : (history[histIdx.current] ?? ""));
        return;
      }
      if (key.backspace || key.delete) {
        setValue((v) => v.slice(0, -1));
        return;
      }
      if (key.ctrl && input === "u") {
        setValue("");
        return;
      }
      if (input && !key.ctrl && !key.meta && !key.escape) {
        setValue((v) => v + input);
      }
    },
    { isActive: focused }
  );

  const displayValue = masked ? "*".repeat(value.length) : value;

  return (
    <Box
      borderStyle="round"
      borderColor={focused ? colors.border : colors.borderMuted}
      paddingX={1}
      width="100%"
    >
      <Text color={colors.purple} bold>
        {prompt}{" "}
      </Text>
      {value.length > 0 ? (
        <Text color={colors.text}>{displayValue}</Text>
      ) : (
        <Text color={colors.textMuted}>{placeholder}</Text>
      )}
      {focused && <Text color={colors.purple}>▎</Text>}
    </Box>
  );
}
