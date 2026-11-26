import React from "react";
import { Box, Text } from "ink";
import { colors, getActiveTheme } from "../theme.js";
import { Spinner } from "./Spinner.js";

interface StatusBarProps {
  mode: string;
  dockerStatus: "connected" | "disconnected" | "scanning";
  portCount: number;
  containerCount: number;
  storageProvider: string;
  vaultUnlocked?: boolean;
  activeTabs?: number;
  updateVersion?: string | null;
}

export function StatusBar({
  mode,
  dockerStatus,
  portCount,
  containerCount,
  storageProvider,
  vaultUnlocked,
  activeTabs = 0,
  updateVersion = null,
}: StatusBarProps) {
  const dockerColor =
    dockerStatus === "connected"
      ? colors.green
      : dockerStatus === "scanning"
        ? colors.yellow
        : colors.red;

  const themeName = getActiveTheme();

  return (
    <Box justifyContent="space-between" width="100%" paddingX={1} overflow="hidden">
      <Box gap={1}>
        <Text color={colors.purpleBright} bold>◈ {mode}</Text>
        <Text color={colors.borderMuted}>│</Text>
        {dockerStatus === "scanning" ? (
          <Spinner label="Docker" color={colors.yellow} />
        ) : (
          <Text color={dockerColor}>
            {dockerStatus === "connected" ? "●" : "○"} Docker
          </Text>
        )}
        <Text color={colors.borderMuted}>│</Text>
        <Text color={colors.textDim}>
          ◆ <Text color={colors.cyan} bold>{portCount}</Text> ports
        </Text>
        <Text color={colors.borderMuted}>│</Text>
        <Text color={colors.textDim}>
          ▣ <Text color={colors.textBright} bold>{containerCount}</Text> ctrs
        </Text>
        {activeTabs > 0 && (
          <>
            <Text color={colors.borderMuted}>│</Text>
            <Text color={colors.purpleBright} bold>
              ⊞ {activeTabs} {activeTabs === 1 ? "tab" : "tabs"}
            </Text>
          </>
        )}
      </Box>
      <Box gap={1}>
        {updateVersion && (
          <>
            <Text color={colors.yellow} bold>⬆ {updateVersion} · type update</Text>
            <Text color={colors.borderMuted}>│</Text>
          </>
        )}
        <Text color={colors.textDim}>
          Vault:{" "}
          <Text color={vaultUnlocked ? colors.green : colors.textMuted} bold={vaultUnlocked}>
            {vaultUnlocked ? "● open" : "○ locked"}
          </Text>
        </Text>
        <Text color={colors.borderMuted}>│</Text>
        <Text color={colors.textDim}>
          S3: <Text color={colors.purple}>{storageProvider}</Text>
        </Text>
        <Text color={colors.borderMuted}>│</Text>
        <Text color={colors.purpleDim}>{themeName}</Text>
        <Text color={colors.borderMuted}>│</Text>
        <Text color={colors.purple} bold>^K</Text>
      </Box>
    </Box>
  );
}
