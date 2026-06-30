import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface ProgressBarProps {
  current: number;
  total: number;
  width?: number;
}

export function ProgressBar({ current, total, width = 10 }: ProgressBarProps) {
  const filled = Math.min(current, total);
  const empty = Math.max(0, total - filled);
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

  return (
    <Box flexDirection="row">
      <Text color={colors.purple}>{bar}</Text>
      <Text color={colors.textDim}> {filled}/{total}</Text>
      <Text color={colors.textMuted}> {pct}%</Text>
    </Box>
  );
}
