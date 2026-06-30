import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface Shortcut {
  key: string;
  label: string;
}

interface ShortcutBarProps {
  shortcuts: Shortcut[];
}

export function ShortcutBar({ shortcuts }: ShortcutBarProps) {
  return (
    <Box paddingX={1}>
      {shortcuts.map((s, i) => (
        <React.Fragment key={s.key}>
          {i > 0 && <Text color={colors.textMuted}> · </Text>}
          <Text color={colors.purple} bold>
            {s.key}
          </Text>
          <Text color={colors.textDim}> {s.label}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}
