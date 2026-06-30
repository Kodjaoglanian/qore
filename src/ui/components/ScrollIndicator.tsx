import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface ScrollIndicatorProps {
  offset: number;
  total: number;
  visible: number;
}

export function ScrollIndicator({ offset, total, visible }: ScrollIndicatorProps) {
  if (total <= visible) return null;

  const canUp = offset > 0;
  const canDown = offset + visible < total;
  const position = `${offset + 1}-${Math.min(offset + visible, total)}/${total}`;

  return (
    <Box flexDirection="row">
      <Text color={canUp ? colors.purple : colors.borderMuted}>▲</Text>
      <Text color={canDown ? colors.purple : colors.borderMuted}>▼</Text>
      <Text color={colors.textMuted}> {position}</Text>
    </Box>
  );
}
