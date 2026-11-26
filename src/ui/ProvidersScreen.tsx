import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { StyledBox } from "./components/Box.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import type { ProviderType, MessagingProvider } from "../core/types.js";

interface ProvidersScreenProps {
  currentStorage: ProviderType;
  currentMessaging: ProviderType;
  messagingProvider: MessagingProvider;
  onSwitchStorage: (type: ProviderType) => void;
  onSwitchMessaging: (type: ProviderType) => void;
  onCommand: (cmd: string) => void;
  focused?: boolean;
}

const PROVIDER_COMPLETIONS = [
  "use local", "use aws", "storage local", "storage aws",
  "messaging local", "messaging aws", "publish ", "topics",
  "storage", "back", "quit",
];

export function ProvidersScreen({
  currentStorage,
  currentMessaging,
  messagingProvider,
  onSwitchStorage,
  onSwitchMessaging,
  onCommand,
  focused = true,
}: ProvidersScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.04));

  const [status, setStatus] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [recentMessages, setRecentMessages] = useState<{ topic: string; body: string; time: string }[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);

  useInput(
    (_input, key) => {
      if (key.escape) onCommand("back");
    },
    { isActive: focused }
  );

  const handleSubmit = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setCmdHistory((prev) => [...prev.slice(-49), trimmed]);
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts[1]?.toLowerCase();

    if (cmd === "use" && (arg === "local" || arg === "aws")) {
      onSwitchStorage(arg);
      onSwitchMessaging(arg);
      setStatus(`[ok] Switched Storage & Messaging to ${arg.toUpperCase()}`);
      return;
    }

    if (cmd === "storage" && (arg === "local" || arg === "aws")) {
      onSwitchStorage(arg);
      setStatus(`[ok] Storage provider switched to ${arg.toUpperCase()}`);
      return;
    }

    if (cmd === "messaging" && (arg === "local" || arg === "aws")) {
      onSwitchMessaging(arg);
      setStatus(`[ok] Messaging provider switched to ${arg.toUpperCase()}`);
      return;
    }

    if (cmd === "publish" && parts.length >= 3) {
      const topic = parts[1];
      const body = trimmed.slice(trimmed.indexOf(topic) + topic.length).trim();
      await messagingProvider.publish(topic, Buffer.from(body, "utf-8"));
      const nextTopics = await messagingProvider.listTopics();
      setTopics(nextTopics);
      setRecentMessages((prev) => [
        { topic, body, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 4),
      ]);
      setStatus(`[ok] Published message to topic "${topic}"`);
      return;
    }

    if (cmd === "topics") {
      const nextTopics = await messagingProvider.listTopics();
      setTopics(nextTopics);
      setStatus(`[ok] ${nextTopics.length} active topic(s)`);
      return;
    }

    onCommand(trimmed);
  }, [messagingProvider, onSwitchStorage, onSwitchMessaging, onCommand]);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin} justifyContent="center">
      <Box marginBottom={1} height={1}>
        <Breadcrumb items={["Home", "Hybrid Providers"]} />
      </Box>

      <StyledBox title="Storage Provider" rightTitle="storage local|aws" focused padding={1} marginBottom={1}>
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Box>
              <Text color={currentStorage === "local" ? colors.purpleBright : colors.textDim}>
                {currentStorage === "local" ? "▸ " : "  "}
              </Text>
              <Text color={currentStorage === "local" ? colors.textBright : colors.textMuted} bold={currentStorage === "local"}>
                Local Emulated S3
              </Text>
              <Text color={colors.textDim}>  ~/.qore/storage/ + bun:sqlite</Text>
            </Box>
            <Text color={currentStorage === "local" ? colors.green : colors.textMuted} bold={currentStorage === "local"}>
              {currentStorage === "local" ? "● ACTIVE" : "○ inactive"}
            </Text>
          </Box>

          <Box justifyContent="space-between" marginTop={1}>
            <Box>
              <Text color={currentStorage === "aws" ? colors.purpleBright : colors.textDim}>
                {currentStorage === "aws" ? "▸ " : "  "}
              </Text>
              <Text color={currentStorage === "aws" ? colors.textBright : colors.textMuted} bold={currentStorage === "aws"}>
                AWS S3 (Cloud)
              </Text>
              <Text color={colors.textDim}>  ~/.aws/credentials</Text>
            </Box>
            <Text color={currentStorage === "aws" ? colors.green : colors.textMuted} bold={currentStorage === "aws"}>
              {currentStorage === "aws" ? "● ACTIVE" : "○ inactive"}
            </Text>
          </Box>
        </Box>
      </StyledBox>

      <StyledBox title="Messaging Provider (Pub/Sub)" rightTitle="messaging local|aws" focused={false} padding={1} marginBottom={1}>
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Box>
              <Text color={currentMessaging === "local" ? colors.purpleBright : colors.textDim}>
                {currentMessaging === "local" ? "▸ " : "  "}
              </Text>
              <Text color={currentMessaging === "local" ? colors.textBright : colors.textMuted} bold={currentMessaging === "local"}>
                Local Pub/Sub (in-memory)
              </Text>
              <Text color={colors.textDim}>  {topics.length} topics</Text>
            </Box>
            <Text color={currentMessaging === "local" ? colors.green : colors.textMuted} bold={currentMessaging === "local"}>
              {currentMessaging === "local" ? "● ACTIVE" : "○ inactive"}
            </Text>
          </Box>

          <Box justifyContent="space-between" marginTop={1}>
            <Box>
              <Text color={currentMessaging === "aws" ? colors.purpleBright : colors.textDim}>
                {currentMessaging === "aws" ? "▸ " : "  "}
              </Text>
              <Text color={currentMessaging === "aws" ? colors.textBright : colors.textMuted} bold={currentMessaging === "aws"}>
                AWS SNS+SQS (Cloud)
              </Text>
            </Box>
            <Text color={currentMessaging === "aws" ? colors.green : colors.textMuted} bold={currentMessaging === "aws"}>
              {currentMessaging === "aws" ? "● ACTIVE" : "○ inactive"}
            </Text>
          </Box>

          {recentMessages.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={colors.purpleDim} bold>  Recent Pub/Sub Events:</Text>
              {recentMessages.map((m, idx) => (
                <Text key={idx} color={colors.textDim}>
                  {"    "}<Text color={colors.cyan}>[{m.topic}]</Text> {m.body} <Text color={colors.textMuted}>({m.time})</Text>
                </Text>
              ))}
            </Box>
          )}
        </Box>
      </StyledBox>

      {status && (
        <Box marginBottom={1}>
          <Text color={status.startsWith("[ok]") ? colors.green : colors.red}>{"  "}{status}</Text>
        </Box>
      )}

      <Box marginTop={0}>
        <InputBar
          onSubmit={handleSubmit}
          completions={PROVIDER_COMPLETIONS}
          history={cmdHistory}
          focused={focused}
          placeholder="use local · use aws · storage local · publish <topic> <msg> · topics · back"
        />
      </Box>
      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "Enter", label: "execute" },
            { key: "Tab", label: "autocomplete" },
            { key: "^K", label: "palette" },
            { key: "esc", label: "back" },
          ]}
        />
      </Box>
    </Box>
  );
}
