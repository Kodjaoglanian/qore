import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { StyledBox } from "./components/Box.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import type { Vault } from "../core/vault/vault.js";
import type { ConnectionConfig } from "../core/vault/types.js";
import { CONNECTION_ICONS, CONNECTION_LABELS } from "../core/vault/types.js";
import { getManager, type QuickStatus } from "../core/connections/manager.js";
import {
  addHealthCheck,
  getHealthHistory,
  getAllHealthHistory,
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
}

interface HealthEntry {
  conn: ConnectionConfig;
  latest: HealthCheck | null;
  history: HealthCheck[];
  loading: boolean;
}

export function HealthScreen({ vault, onConnect, onBack }: HealthScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.03));
  const availH = Math.max(6, termHeight - 8);

  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [config, setConfig] = useState(getHealthConfig());
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

    const results = await Promise.allSettled(
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
          return { connId: conn.id, online: false, latency: 0, message: "No manager" };
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
          return { connId: conn.id, online: qs.online, latency: qs.latency ?? latency, message: qs.info };
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
          return { connId: conn.id, online: false, latency, message: (err as Error).message };
        }
      }),
    );

    const newEntries = conns.map((conn, i) => {
      const result = results[i];
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

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      setSelectedIdx((i) => Math.min(entries.length - 1, i + 1));
    }
  });

  const handleSubmit = useCallback((value: string) => {
    const trimmed = value.trim().toLowerCase();
    const parts = trimmed.split(/\s+/);
    const command = parts[0];

    if (command === "refresh" || command === "check") {
      setStatus("Running health checks...");
      runChecks();
      setStatus("[ok] Health checks completed");
      return;
    }

    if (command === "monitor") {
      setMonitoring((prev) => {
        setStatus(`Monitoring ${!prev ? "started" : "stopped"} (interval: ${config.intervalSec}s)`);
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
  }, [entries, selectedIdx, onConnect, onBack, runChecks, config.intervalSec]);

  const onlineCount = entries.filter((e) => e.latest?.online).length;
  const offlineCount = entries.filter((e) => e.latest && !e.latest.online).length;
  const loadingCount = entries.filter((e) => e.loading).length;
  const avgLatency = entries.filter((e) => e.latest?.online && e.latest.latency).reduce((sum, e) => sum + (e.latest?.latency ?? 0), 0) / (onlineCount || 1);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} paddingX={margin} overflow="hidden">
      <Box marginBottom={1} height={1}>
        <Breadcrumb items={["Home", "Health Check"]} />
      </Box>

      <Box flexDirection="column" height={availH} overflow="hidden">
        <StyledBox title="Health Check Dashboard" focused padding={1} height={availH} overflow="hidden">
          <Box flexDirection="column">
            <Box marginBottom={1} flexDirection="row" justifyContent="space-between">
              <Box flexDirection="row">
                <Text color={colors.green} bold>{"  ● "}{onlineCount}{" online"}</Text>
                {offlineCount > 0 && <Text color={colors.red} bold>{"  ● "}{offlineCount}{" offline"}</Text>}
                {loadingCount > 0 && <Text color={colors.yellow}>{"  ● "}{loadingCount}{" checking..."}</Text>}
                {onlineCount > 0 && <Text color={colors.textMuted}>{"  avg "}{Math.round(avgLatency)}{"ms"}</Text>}
              </Box>
              <Box flexDirection="row">
                <Text color={colors.textMuted}>
                  {"monitor: "}{monitoring ? "ON" : "OFF"}{" · interval: "}{config.intervalSec}{"s"}
                </Text>
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

                  const uptimeCount = entry.history.filter((h) => h.online).length;
                  const uptimePct = entry.history.length > 0 ? Math.round((uptimeCount / entry.history.length) * 100) : 0;

                  return (
                    <Box key={entry.conn.id} flexDirection="column">
                      <Box flexDirection="row">
                        <Text color={isSelected ? colors.purple : colors.textDim}>
                          {isSelected ? ">" : " "}{" "}
                        </Text>
                        <Text color={dotColor} bold>{dot}</Text>
                        <Text color={colors.textDim}>{" "}{i + 1}{"."}</Text>
                        <Text color={isSelected ? colors.textBright : colors.text}>
                          {" "}{CONNECTION_ICONS[entry.conn.type]} {entry.conn.name}
                        </Text>
                        <Text color={isSelected ? colors.purpleBright : colors.textMuted}>
                          {"  "}{CONNECTION_LABELS[entry.conn.type]} · {entry.conn.host}:{entry.conn.port}
                        </Text>
                        {latest && (
                          <Text color={latest.online ? colors.green : colors.red}>
                            {"  "}{latest.message}{latest.latency ? ` (${latest.latency}ms)` : ""}
                          </Text>
                        )}
                      </Box>
                      {sparkline && (
                        <Box flexDirection="row">
                          <Text color={colors.textMuted}>{"      spark: "}</Text>
                          <Text color={colors.cyan}>{sparkline}</Text>
                          <Text color={colors.textMuted}>{"  uptime: "}</Text>
                          <Text color={uptimePct >= 90 ? colors.green : uptimePct >= 50 ? colors.yellow : colors.red}>
                            {uptimePct}{"%"}
                          </Text>
                          <Text color={colors.textMuted}>{"  ("}{entry.history.length}{" checks)"}</Text>
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
          placeholder="refresh · monitor · interval <s> · clear · connect <n> · back"
        />
      </Box>

      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "Up/Dn", label: "select" },
            { key: "Enter", label: "connect" },
            { key: "esc", label: "back" },
          ]}
        />
      </Box>
    </Box>
  );
}
