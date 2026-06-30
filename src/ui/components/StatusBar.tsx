import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface StatusBarProps {
  mode: string;
  dockerStatus: "connected" | "disconnected" | "scanning";
  portCount: number;
  containerCount: number;
  storageProvider: string;
  vaultUnlocked?: boolean;
}

export function StatusBar({
  mode,
  dockerStatus,
  portCount,
  containerCount,
  storageProvider,
  vaultUnlocked,
}: StatusBarProps) {
  const dockerColor =
    dockerStatus === "connected"
      ? colors.green
      : dockerStatus === "scanning"
        ? colors.yellow
        : colors.red;

  const dockerLabel =
    dockerStatus === "connected"
      ? "[up]"
      : dockerStatus === "scanning"
        ? "[~]"
        : "[dn]";

  return (
    <Box justifyContent="space-between" width="100%" paddingX={1} overflow="hidden">
      <Box gap={1}>
        <Text color={colors.purple} bold>
          {mode}
        </Text>
        <Text color={colors.borderMuted}>│</Text>
        <Text color={dockerColor}>{dockerLabel} Docker</Text>
        <Text color={colors.borderMuted}>│</Text>
        <Text color={colors.textDim}>
          Ports: <Text color={colors.text}>{portCount}</Text>
        </Text>
        <Text color={colors.borderMuted}>│</Text>
        <Text color={colors.textDim}>
          Containers: <Text color={colors.text}>{containerCount}</Text>
        </Text>
      </Box>
      <Box gap={1}>
        <Text color={colors.textDim}>
          Vault: <Text color={vaultUnlocked ? colors.green : colors.textMuted} bold>{vaultUnlocked ? "[unlocked]" : "[locked]"}</Text>
        </Text>
        <Text color={colors.borderMuted}>│</Text>
        <Text color={colors.textDim}>
          Storage: <Text color={colors.purple}>{storageProvider}</Text>
        </Text>
      </Box>
    </Box>
  );
}
