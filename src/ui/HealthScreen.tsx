import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { colors, latencyColor } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { StyledBox } from "./components/Box.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { MeterBar } from "./components/ProgressBar.js";
import { Spinner } from "./components/Spinner.js";
import type { Vault } from "../core/vault/vault.js";
import type { ConnectionConfig } from "../core/vault/types.js";
import { CONNECTION_ICONS, CONNECTION_LABELS } from "../core/vault/types.js";
import { getManager, type QuickStatus } from "../core/connections/manager.js";
import {
  addHealthCheck,
  getHealthHistory,
  getHealthConfig,
  setHealthConfig,
  clearHealthHistory,
  renderSparkline,
  type HealthCheck,
} from "../core/health.js";

interface HealthScreenProps {
  vault: Vault;
  onConnect: (conn: ConnectionConfig) => void;
  onBack: () => void;
  onOpenDashboard?: () => void;
  focused?: boolean;
}

interface HealthEntry {
  conn: ConnectionConfig;
  latest: HealthCheck | null;
  history: HealthCheck[];
  loading: boolean;
}

const HEALTH_COMPLETIONS = ["refresh", "check", "monitor", "interval ", "clear", "connect ", "dashboard", "back", "quit"];

export function HealthScreen({
  vault,
  onConnect,
  onBack,
  onOpenDashboard,
  focused = true,
}: HealthScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.03));
  const availH = Math.max(6, termHeight - 8);

  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [config, setConfig] = useState(getHealthConfig());
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const monitorTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const runChecks = useCallback(async () => {
    const conns = vault.getConnections();
    if (conns.length === 0) {
      setEntries([]);
      return;
    }

    const existingHistory: Record<string, HealthCheck[]> = {};
    for (const conn of conns) {
      existingHistory[conn.id] = getHealthHistory(conn.id);
    }

    setEntries(conns.map((conn) => ({
      conn,
      latest: existingHistory[conn.id].at(-1) ?? null,
      history: existingHistory[conn.id],
      loading: true,
    })));

    await Promise.allSettled(
      conns.map(async (conn) => {
        const manager = getManager(conn.type);
        const start = Date.now();
        if (!manager) {
          addHealthCheck({
            connId: conn.id,
            connName: conn.name,
            connType: conn.type,
            timestamp: new Date().toISOString(),
            online: false,
            latency: 0,
            message: "No manager",
          });
          return;
        }
        try {
          let qs: QuickStatus;
          if (manager.quickStatus) {
            qs = await manager.quickStatus(conn);
          } else {
            const ok = await manager.testConnection(conn);
            qs = { online: ok, info: ok ? "Connected" : "Failed" };
          }
          const latency = Date.now() - start;
          addHealthCheck({
            connId: conn.id,
            connName: conn.name,
            connType: conn.type,
            timestamp: new Date().toISOString(),
            online: qs.online,
            latency: qs.latency ?? latency,
            message: qs.info,
          });
        } catch (err) {
          const latency = Date.now() - start;
          addHealthCheck({
            connId: conn.id,
            connName: conn.name,
            connType: conn.type,
            timestamp: new Date().toISOString(),
            online: false,
            latency,
            message: (err as Error).message,
          });
        }
      }),
    );

    const newEntries = conns.map((conn) => {
      const history = getHealthHistory(conn.id);
      return {
        conn,
        latest: history.at(-1) ?? null,
        history,
        loading: false,
      };
    });

    setEntries(newEntries);
  }, [vault]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  useEffect(() => {
    if (monitoring) {
      monitorTimer.current = setInterval(() => runChecks(), config.intervalSec * 1000);
    }
    return () => {
      if (monitorTimer.current) clearInterval(monitorTimer.current);
    };
  }, [monitoring, config.intervalSec, runChecks]);

  useInput(
    (_input, key) => {
      if (key.escape) {
        onBack();
        return;
      }
      if (key.upArrow) {
        setSelectedIdx((i) => Math.max(0, i - 1));
      }
      if (key.downArrow) {
        setSelectedIdx((i) => Math.min(Math.max(0, entries.length - 1), i + 1));
      }
    },
    { isActive: focused }
  );

  const handleSubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) setCmdHistory((prev) => [...prev.slice(-49), trimmed]);
    const lower = trimmed.toLowerCase();
    const parts = lower.split(/\s+/);
    const command = parts[0];

    if (command === "refresh" || command === "check") {
      setStatus("Running health checks...");
      runChecks().then(() => setStatus("[ok] Health checks completed"));
      return;
    }

    if (command === "monitor") {
      setMonitoring((prev) => {
        setStatus(`[ok] Monitoring ${!prev ? "started" : "stopped"} (interval: ${config.intervalSec}s)`);
        return !prev;
      });
      return;
    }

    if (command === "interval") {
      const sec = parseInt(parts[1], 10);
      if (isNaN(sec) || sec < 5 || sec > 3600) {
        setStatus("[!] Usage: interval <seconds> (5-3600)");
        return;
      }
      const newConfig = setHealthConfig({ intervalSec: sec });
      setConfig(newConfig);
      setStatus(`[ok] Interval set to ${sec}s`);
      return;
    }

    if (command === "clear") {
      clearHealthHistory();
      setStatus("[ok] Health history cleared");
      runChecks();
      return;
    }

    if (command === "dashboard" && onOpenDashboard) {
      onOpenDashboard();
      return;
    }

    if (command === "connect") {
      const idx = parseInt(parts[1], 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= entries.length) {
        setStatus(`[!] Invalid number. Type 1-${entries.length}`);
        return;
      }
      onConnect(entries[idx].conn);
      return;
    }

    if (command === "back" || command === "quit") {
      onBack();
      return;
    }

    if (!trimmed && entries.length > 0) {
      onConnect(entries[selectedIdx].conn);
      return;
    }
  }, [entries, selectedIdx, onConnect, onBack, onOpenDashboard, runChecks, config.intervalSec]);

  const onlineCount = entries.filter((e) => e.latest?.online).length;
  const offlineCount = entries.filter((e) => e.latest && !e.latest.online).length;
  const loadingCount = entries.filter((e) => e.loading).length;
  const onlineLatencies = entries.filter((e) => e.latest?.online && e.latest.latency).map((e) => e.latest!.latency);
  const avgLatency = onlineLatencies.length > 0
    ? Math.round(onlineLatencies.reduce((a, b) => a + b, 0) / onlineLatencies.length)
    : 0;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} paddingX={margin} overflow="hidden">
      <Box marginBottom={1} height={1}>
        <Breadcrumb items={["Home", "Health Monitor"]} />
      </Box>

      <Box flexDirection="column" height={availH} overflow="hidden">
        <StyledBox
          title="Health Check & Sparkline Monitor"
          rightTitle={`monitor: ${monitoring ? "ON" : "OFF"} · interval: ${config.intervalSec}s`}
          focused
          padding={1}
          height={availH}
          overflow="hidden"
        >
          <Box flexDirection="column">
            <Box marginBottom={1} flexDirection="row" justifyContent="space-between">
              <Box flexDirection="row" gap={2}>
                <Text color={colors.green} bold>● {onlineCount} online</Text>
                {offlineCount > 0 && <Text color={colors.red} bold>● {offlineCount} offline</Text>}
                {loadingCount > 0 && <Spinner label={`${loadingCount} probing`} color={colors.yellow} />}
                {onlineCount > 0 && (
                  <Text color={latencyColor(avgLatency)}>avg {avgLatency}ms</Text>
                )}
              </Box>
            </Box>

            {entries.length === 0 ? (
              <Box flexDirection="column">
                <Text color={colors.textMuted}>{"  No connections in vault."}</Text>
                <Box marginTop={1}>
                  <Text color={colors.purple} bold>{"  Go to Connections to add some."}</Text>
                </Box>
              </Box>
            ) : (
              <Box flexDirection="column">
                {entries.map((entry, i) => {
                  const isSelected = i === selectedIdx;
                  const latest = entry.latest;
                  const dot = entry.loading ? "○" : latest?.online ? "●" : latest ? "✗" : "?";
                  const dotColor = entry.loading ? colors.yellow : latest?.online ? colors.green : latest ? colors.red : colors.textMuted;

                  const latencies = entry.history.filter((h) => h.online).map((h) => h.latency);
                  const sparkline = renderSparkline(latencies);
                  const minLat = latencies.length > 0 ? Math.min(...latencies) : 0;
                  const maxLat = latencies.length > 0 ? Math.max(...latencies) : 0;

                  const uptimeCount = entry.history.filter((h) => h.online).length;
                  const uptimePct = entry.history.length > 0 ? Math.round((uptimeCount / entry.history.length) * 100) : 0;
                  const upColor = uptimePct >= 90 ? colors.green : uptimePct >= 50 ? colors.yellow : colors.red;

                  return (
                    <Box key={entry.conn.id} flexDirection="column" marginBottom={0}>
                      <Box flexDirection="row">
                        <Text color={isSelected ? colors.purpleBright : colors.textDim} bold={isSelected}>
                          {isSelected ? "▸ " : "  "}
                        </Text>
                        <Text color={dotColor} bold>{dot}</Text>
                        <Text color={colors.textDim}> {i + 1}.</Text>
                        <Text color={isSelected ? colors.textBright : colors.text} bold={isSelected}>
                          {" "}{CONNECTION_ICONS[entry.conn.type]} {entry.conn.name.padEnd(16)}
                        </Text>
                        <Text color={isSelected ? colors.purpleBright : colors.textMuted}>
                          {" "}{CONNECTION_LABELS[entry.conn.type]} · {entry.conn.host}:{entry.conn.port}
                        </Text>
                        {latest && (
                          <Text color={latest.online ? latencyColor(latest.latency) : colors.red}>
                            {"  "}{latest.message}{latest.latency ? ` (${latest.latency}ms)` : ""}
                          </Text>
                        )}
                      </Box>
                      {entry.history.length > 0 && (
                        <Box flexDirection="row" paddingLeft={6} gap={2}>
                          {sparkline && (
                            <Text color={colors.cyan}>
                              {sparkline} <Text color={colors.textMuted}>({minLat}-{maxLat}ms)</Text>
                            </Text>
                          )}
                          <MeterBar
                            label="up"
                            percent={uptimePct}
                            width={8}
                            color={upColor}
                            detail={`(${entry.history.length} checks)`}
                          />
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}

            {status && (
              <Box marginTop={1}>
                <Text color={status.startsWith("[ok]") ? colors.green : status.startsWith("[!]") ? colors.red : colors.textMuted}>
                  {"  "}{status}
                </Text>
              </Box>
            )}
          </Box>
        </StyledBox>
      </Box>

      <Box marginTop={1}>
        <InputBar
          onSubmit={handleSubmit}
          completions={HEALTH_COMPLETIONS}
          history={cmdHistory}
          focused={focused}
          placeholder="refresh · monitor · interval <s> · clear · connect <n> · dashboard · back"
        />
      </Box>

      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "↑/↓", label: "select" },
            { key: "Enter", label: "connect" },
            { key: "monitor", label: "toggle" },
            { key: "^K", label: "palette" },
            { key: "esc", label: "back" },
          ]}
        />
      </Box>
    </Box>
  );
}
