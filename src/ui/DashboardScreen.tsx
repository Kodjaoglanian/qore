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
  getHealthConfig,
  setHealthConfig,
  clearHealthHistory,
  renderSparkline,
  type HealthCheck,
} from "../core/health.js";

interface DashboardScreenProps {
  vault: Vault;
  onConnect: (conn: ConnectionConfig) => void;
  onBack: () => void;
}

interface StatusEntry {
  conn: ConnectionConfig;
  status: QuickStatus | null;
  loading: boolean;
  error: string | null;
  history: HealthCheck[];
}

export function DashboardScreen({ vault, onConnect, onBack }: DashboardScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.03));
  const availH = Math.max(6, termHeight - 8);

  const [entries, setEntries] = useState<StatusEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [config, setConfig] = useState(getHealthConfig());
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAll = useCallback(async () => {
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
      status: null,
      loading: true,
      error: null,
      history: existingHistory[conn.id] ?? [],
    })));

    const results = await Promise.allSettled(
      conns.map(async (conn) => {
        const manager = getManager(conn.type);
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
          return { conn, status: null, loading: false, error: "No manager" };
        }
        const start = Date.now();
        if (manager.quickStatus) {
          try {
            const qs = await manager.quickStatus(conn);
            addHealthCheck({
              connId: conn.id,
              connName: conn.name,
              connType: conn.type,
              timestamp: new Date().toISOString(),
              online: qs.online,
              latency: qs.latency ?? (Date.now() - start),
              message: qs.info,
            });
            return { conn, status: qs, loading: false, error: null };
          } catch (err) {
            addHealthCheck({
              connId: conn.id,
              connName: conn.name,
              connType: conn.type,
              timestamp: new Date().toISOString(),
              online: false,
              latency: Date.now() - start,
              message: (err as Error).message,
            });
            return { conn, status: null, loading: false, error: (err as Error).message };
          }
        }
        try {
          const ok = await manager.testConnection(conn);
          const latency = Date.now() - start;
          addHealthCheck({
            connId: conn.id,
            connName: conn.name,
            connType: conn.type,
            timestamp: new Date().toISOString(),
            online: ok,
            latency,
            message: ok ? "Connected" : "Connection failed",
          });
          return {
            conn,
            status: { online: ok, info: ok ? "Connected" : "Connection failed", latency },
            loading: false,
            error: ok ? null : "Connection failed",
          };
        } catch (err) {
          addHealthCheck({
            connId: conn.id,
            connName: conn.name,
            connType: conn.type,
            timestamp: new Date().toISOString(),
            online: false,
            latency: Date.now() - start,
            message: (err as Error).message,
          });
          return { conn, status: null, loading: false, error: (err as Error).message };
        }
      }),
    );

    const newEntries = results.map((r, i) => {
      const conn = conns[i];
      const history = getHealthHistory(conn.id);
      return r.status === "fulfilled"
        ? { ...r.value, history }
        : { conn, status: null, loading: false, error: "Unknown error", history };
    });

    setEntries(newEntries);
    setLastRefresh(Date.now());
  }, [vault]);

  useEffect(() => {
    checkAll();
  }, [checkAll]);

  useEffect(() => {
    if (autoRefresh) {
      refreshTimer.current = setInterval(() => checkAll(), config.intervalSec * 1000);
    }
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [autoRefresh, checkAll, config.intervalSec]);

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

    if (command === "refresh") {
      setStatus("Refreshing...");
      checkAll();
      setStatus(null);
      return;
    }

    if (command === "auto") {
      setAutoRefresh((prev) => {
        setStatus(`Auto-refresh ${!prev ? "enabled" : "disabled"}`);
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
      setStatus("[ok] History cleared");
      checkAll();
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
  }, [entries, selectedIdx, onConnect, onBack, checkAll, config.intervalSec]);

  const onlineCount = entries.filter((e) => e.status?.online).length;
  const offlineCount = entries.filter((e) => e.status && !e.status.online).length;
  const loadingCount = entries.filter((e) => e.loading).length;
  const avgLatency = entries.filter((e) => e.status?.online && e.status?.latency).reduce((sum, e) => sum + (e.status?.latency ?? 0), 0) / (onlineCount || 1);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} paddingX={margin} overflow="hidden">
      <Box marginBottom={1} height={1}>
        <Breadcrumb items={["Home", "Dashboard"]} />
      </Box>

      <Box flexDirection="column" height={availH} overflow="hidden">
        <StyledBox title="Multi-Service Dashboard" focused padding={1} height={availH} overflow="hidden">
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
                  {"auto-refresh: "}{autoRefresh ? `ON (${config.intervalSec}s)` : "OFF"}{" · last: "}{lastRefresh > 0 ? new Date(lastRefresh).toLocaleTimeString() : "—"}
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
                  const st = entry.status;
                  const dot = entry.loading ? "○" : st?.online ? "●" : st ? "✗" : "?";
                  const dotColor = entry.loading ? colors.yellow : st?.online ? colors.green : st ? colors.red : colors.textMuted;

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
                        {st && (
                          <Text color={st.online ? colors.green : colors.red}>
                            {"  "}{st.info}{st.latency ? ` (${st.latency}ms)` : ""}
                          </Text>
                        )}
                        {entry.error && !entry.loading && (
                          <Text color={colors.red}>{"  "}{entry.error}</Text>
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
          placeholder="connect <n> · refresh · auto · interval <s> · clear · back"
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
