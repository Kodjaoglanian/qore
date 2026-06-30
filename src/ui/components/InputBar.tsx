import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme.js";

interface InputBarProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  focused?: boolean;
  prompt?: string;
}

export function InputBar({
  onSubmit,
  placeholder = "Type a command...",
  focused = true,
  prompt = ">",
}: InputBarProps) {
  const [value, setValue] = useState("");

  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit(value);
        setValue("");
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
        <Text color={colors.text}>{value}</Text>
      ) : (
        <Text color={colors.textMuted}>{placeholder}</Text>
      )}
      {focused && <Text color={colors.purple}>▎</Text>}
    </Box>
  );
}
