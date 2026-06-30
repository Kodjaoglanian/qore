import React from "react";
import { Box, Text } from "ink";
import { StyledBox } from "./components/Box.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import type { ProviderType } from "../core/types.js";

interface ProvidersScreenProps {
  currentStorage: ProviderType;
  currentMessaging: ProviderType;
  onCommand: (cmd: string) => void;
}

export function ProvidersScreen({
  currentStorage,
  currentMessaging,
  onCommand,
}: ProvidersScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.05));

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin} justifyContent="center">
      <Box marginBottom={1} height={1}>
        <Text color={colors.purple} bold>
          {"│ Providers"}
        </Text>
      </Box>

      <StyledBox title="Storage Provider" focused padding={1} marginBottom={1}>
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Box>
              <Text color={currentStorage === "local" ? colors.purple : colors.textDim}>
                {currentStorage === "local" ? "> " : "  "}
              </Text>
              <Text color={currentStorage === "local" ? colors.text : colors.textMuted} bold={currentStorage === "local"}>
                Local Emulated S3
              </Text>
            </Box>
            <Text color={currentStorage === "local" ? colors.green : colors.textMuted}>
              {currentStorage === "local" ? "[active]" : "[inactive]"}
            </Text>
          </Box>
          <Text color={colors.textDim}>  ~/.qore/storage/ + bun:sqlite metadata</Text>

          <Box justifyContent="space-between" marginTop={1}>
            <Box>
              <Text color={currentStorage === "aws" ? colors.purple : colors.textDim}>
                {currentStorage === "aws" ? "> " : "  "}
              </Text>
              <Text color={currentStorage === "aws" ? colors.text : colors.textMuted} bold={currentStorage === "aws"}>
                AWS S3 (Cloud)
              </Text>
            </Box>
            <Text color={currentStorage === "aws" ? colors.green : colors.textMuted}>
              {currentStorage === "aws" ? "[active]" : "[inactive]"}
            </Text>
          </Box>
          <Text color={colors.textDim}>  Uses ~/.aws/credentials</Text>
        </Box>
      </StyledBox>

      <StyledBox title="Messaging Provider" focused={false} padding={1} marginBottom={1}>
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Box>
              <Text color={currentMessaging === "local" ? colors.purple : colors.textDim}>
                {currentMessaging === "local" ? "> " : "  "}
              </Text>
              <Text color={currentMessaging === "local" ? colors.text : colors.textMuted} bold={currentMessaging === "local"}>
                Local Pub/Sub (in-memory)
              </Text>
            </Box>
            <Text color={currentMessaging === "local" ? colors.green : colors.textMuted}>
              {currentMessaging === "local" ? "[active]" : "[inactive]"}
            </Text>
          </Box>

          <Box justifyContent="space-between" marginTop={1}>
            <Box>
              <Text color={currentMessaging === "aws" ? colors.purple : colors.textDim}>
                {currentMessaging === "aws" ? "> " : "  "}
              </Text>
              <Text color={currentMessaging === "aws" ? colors.text : colors.textMuted} bold={currentMessaging === "aws"}>
                AWS SNS+SQS (Cloud)
              </Text>
            </Box>
            <Text color={currentMessaging === "aws" ? colors.green : colors.textMuted}>
              {currentMessaging === "aws" ? "[active]" : "[inactive]"}
            </Text>
          </Box>
        </Box>
      </StyledBox>

      <Box marginTop={1}>
        <InputBar
          onSubmit={onCommand}
          placeholder="use local · use aws · back · quit"
        />
      </Box>
      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "Enter", label: "execute" },
            { key: "esc", label: "back" },
            { key: "^c", label: "quit" },
          ]}
        />
      </Box>
    </Box>
  );
}
