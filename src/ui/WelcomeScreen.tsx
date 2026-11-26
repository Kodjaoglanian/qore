import React, { useState, useCallback } from "react";
import { Box, Text } from "ink";
import { Logo } from "./components/Logo.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { StyledBox } from "./components/Box.js";
import { MeterBar } from "./components/ProgressBar.js";
import { Spinner } from "./components/Spinner.js";
import { colors, THEME_NAMES, getActiveTheme } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { formatBytes } from "../core/probe/system.js";
import type { ProbeResult } from "../core/types.js";

interface WelcomeScreenProps {
  onCommand: (cmd: string) => void;
  vaultUnlocked?: boolean;
  savedConnCount?: number;
  probe?: ProbeResult | null;
  scanning?: boolean;
  focused?: boolean;
}

const MENU_ITEMS = [
  { cmd: "discover", icon: "◆", label: "discover", desc: "scan local ports, Docker, processes, services & network", color: () => colors.cyan },
  { cmd: "connections", icon: "◈", label: "connections", desc: "encrypted vault — Redis, Postgres, MySQL, Mongo, S3, HTTP, SSH, Git, VMware", color: () => colors.purpleBright },
  { cmd: "dashboard", icon: "▣", label: "dashboard", desc: "multi-service live status overview & quick connect", color: () => colors.green },
  { cmd: "health", icon: "♥", label: "health", desc: "periodic health monitor with latency sparklines & uptime %", color: () => colors.cyan },
  { cmd: "storage", icon: "▤", label: "storage", desc: "manage Local Emulated S3 (SQLite) & AWS S3 buckets/files", color: () => colors.blue },
  { cmd: "providers", icon: "⇄", label: "providers", desc: "switch hybrid storage & Pub/Sub messaging providers", color: () => colors.yellow },
  { cmd: "wiki", icon: "▥", label: "wiki", desc: "Qore documentation book", color: () => colors.blue },
  { cmd: "help", icon: "?", label: "help", desc: "searchable command reference & shortcuts", color: () => colors.purple },
  { cmd: "theme", icon: "◐", label: "theme", desc: `cycle TrueColor theme (${THEME_NAMES.join(" · ")})`, color: () => colors.purpleDim },
  { cmd: "quit", icon: "✕", label: "quit", desc: "lock vault & exit Qore", color: () => colors.red },
];

const COMPLETIONS = [
  ...MENU_ITEMS.map((m) => m.cmd),
  ...THEME_NAMES.map((t) => `theme ${t}`),
  "lock",
  "refresh",
];

export function WelcomeScreen({
  onCommand,
  vaultUnlocked,
  savedConnCount = 0,
  probe,
  scanning = false,
  focused = true,
}: WelcomeScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(2, Math.floor(termWidth * 0.06));
  const [selectedIdx, setSelectedIdx] = useState(0);

  const compactLogo = termHeight < 30;
  const hostInfo = probe?.hostInfo ?? null;
  const containers = probe?.containers ?? [];
  const runningCtrs = containers.filter((c) => c.state === "running").length;
  const portCount = probe?.ports.length ?? 0;
  const memPct = hostInfo && hostInfo.memoryTotal > 0
    ? Math.round((hostInfo.memoryUsed / hostInfo.memoryTotal) * 100)
    : 0;

  const handleNavigate = useCallback((dir: "up" | "down") => {
    setSelectedIdx((prev) =>
      dir === "up"
        ? (prev - 1 + MENU_ITEMS.length) % MENU_ITEMS.length
        : (prev + 1) % MENU_ITEMS.length
    );
  }, []);

  const handleEmptySubmit = useCallback(() => {
    const item = MENU_ITEMS[selectedIdx];
    if (item) onCommand(item.cmd);
  }, [selectedIdx, onCommand]);

  const innerW = Math.max(40, termWidth - margin * 2);
  const descMax = Math.max(18, innerW - 28);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" justifyContent="center">
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Logo compact={compactLogo} />
      </Box>

      {/* Live System Telemetry Strip */}
      <Box marginX={margin} marginBottom={1}>
        <StyledBox
          title={hostInfo ? `Host · ${hostInfo.hostname}` : "Live Telemetry"}
          rightTitle={`theme: ${getActiveTheme()}`}
          focused={false}
          padding={0}
          overflow="hidden"
        >
          <Box flexDirection="row" justifyContent="space-between" paddingX={1} overflow="hidden">
            {scanning && !probe ? (
              <Spinner label="Probing local infrastructure..." color={colors.cyan} />
            ) : (
              <>
                <Box gap={2}>
                  <Text color={runningCtrs > 0 ? colors.green : colors.textMuted}>
                    ▣ <Text bold>{runningCtrs}</Text>/{containers.length} Docker
                  </Text>
                  <Text color={portCount > 0 ? colors.cyan : colors.textMuted}>
                    ◆ <Text bold>{portCount}</Text> Ports
                  </Text>
                  <Text color={vaultUnlocked ? colors.green : colors.textDim}>
                    ◈ Vault: <Text bold>{vaultUnlocked ? `open (${savedConnCount})` : "locked"}</Text>
                  </Text>
                </Box>
                {hostInfo && termWidth >= 82 && (
                  <MeterBar
                    label="RAM"
                    percent={memPct}
                    width={10}
                    detail={`${formatBytes(hostInfo.memoryUsed)}/${formatBytes(hostInfo.memoryTotal)}`}
                  />
                )}
              </>
            )}
          </Box>
        </StyledBox>
      </Box>

      {/* Interactive Command Menu */}
      <Box flexDirection="column" marginX={margin} marginBottom={1}>
        <Box marginBottom={1} justifyContent="space-between">
          <Breadcrumb items={["Home"]} />
          <Text color={colors.textMuted}>↑/↓ select · Enter open · ^K palette</Text>
        </Box>

        <StyledBox title="Control Center" focused padding={0} overflow="hidden">
          <Box flexDirection="column" paddingX={1}>
            {MENU_ITEMS.map((item, idx) => {
              const isSelected = idx === selectedIdx;
              const desc = item.desc.length > descMax
                ? item.desc.slice(0, descMax - 1) + "…"
                : item.desc;
              return (
                <Box key={item.cmd} flexDirection="row">
                  <Text color={isSelected ? colors.purpleBright : colors.textDim} bold={isSelected}>
                    {isSelected ? "▸ " : "  "}
                  </Text>
                  <Text color={item.color()} bold={isSelected}>
                    {item.icon} {item.label.padEnd(13)}
                  </Text>
                  <Text color={isSelected ? colors.text : colors.textMuted}>
                    {" — "}{desc}
                  </Text>
                </Box>
              );
            })}
          </Box>
        </StyledBox>
      </Box>

      <Box marginX={margin} marginBottom={1}>
        <InputBar
          onSubmit={onCommand}
          onEmptySubmit={handleEmptySubmit}
          onNavigate={handleNavigate}
          completions={COMPLETIONS}
          focused={focused}
          placeholder="Type a command or press Enter on selected item · Tab autocomplete"
        />
      </Box>

      <Box marginX={margin}>
        <ShortcutBar
          shortcuts={[
            { key: "↑/↓", label: "navigate" },
            { key: "Enter", label: "run" },
            { key: "Tab", label: "autocomplete" },
            { key: "^K", label: "palette" },
            { key: "^C", label: "quit" },
          ]}
        />
      </Box>
    </Box>
  );
}
