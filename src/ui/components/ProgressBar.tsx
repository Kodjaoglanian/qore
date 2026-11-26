import React from "react";
import { Box, Text } from "ink";
import { colors, percentColor } from "../theme.js";
import { renderMeterString } from "../utils.js";

export { renderMeterString };

interface ProgressBarProps {
  current: number;
  total: number;
  width?: number;
  label?: string;
  showCounts?: boolean;
  thresholdColor?: boolean;
}

export function ProgressBar({
  current,
  total,
  width = 12,
  label,
  showCounts = true,
  thresholdColor = false,
}: ProgressBarProps) {
  const safeTotal = Math.max(0, total);
  const safeCurrent = Math.max(0, Math.min(current, safeTotal));
  const pct = safeTotal > 0 ? Math.round((safeCurrent / safeTotal) * 100) : 0;
  const bar = renderMeterString(pct, width);
  const barColor = thresholdColor ? percentColor(pct) : colors.purple;

  return (
    <Box flexDirection="row">
      {label && <Text color={colors.textDim}>{label} </Text>}
      <Text color={barColor}>{bar}</Text>
      {showCounts && (
        <Text color={colors.textDim}> {safeCurrent}/{safeTotal}</Text>
      )}
      <Text color={thresholdColor ? barColor : colors.textMuted}> {String(pct).padStart(3)}%</Text>
    </Box>
  );
}

interface MeterBarProps {
  percent: number;
  width?: number;
  label?: string;
  detail?: string;
  color?: string;
}

export function MeterBar({ percent, width = 14, label, detail, color }: MeterBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const barColor = color ?? percentColor(clamped);
  const bar = renderMeterString(clamped, width);

  return (
    <Box flexDirection="row" height={1} overflow="hidden">
      {label && <Text color={colors.textDim} wrap="truncate">{label} </Text>}
      <Text color={barColor} wrap="truncate">{bar}</Text>
      <Text color={barColor} bold wrap="truncate"> {String(clamped).padStart(3)}%</Text>
      {detail && <Text color={colors.textMuted} wrap="truncate"> {detail}</Text>}
    </Box>
  );
}
