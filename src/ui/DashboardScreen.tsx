import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

interface DashboardScreenProps {
  vault: Vault;
  onConnect: (conn: ConnectionConfig) => void;
  onBack: () => void;
  onOpenHealth?: () => void;
  focused?: boolean;
}

interface StatusEntry {
  conn: ConnectionConfig;
  status: QuickStatus | null;
  loading: boolean;
  error: string | null;
}

const DASH_COMPLETIONS = ["refresh", "auto", "health", "filter ", "connect ", "back", "quit"];

export function DashboardScreen({
  vault,
  onConnect,
  onBack,
  onOpenHealth,
  focused = true,
}: DashboardScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.03));
  const availH = Math.max(6, termHeight - 8);

  const [entries, setEntries] = useState<StatusEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAll = useCallback(async () => {
    const conns = vault.getConnections();
    if (conns.length === 0) {
      setEntries([]);
      return;
    }

    setEntries(conns.map((conn) => ({ conn, status: null, loading: true, error: null })));

    const results = await Promise.allSettled(
      conns.map(async (conn) => {
        const manager = getManager(conn.type);
        if (!manager) {
          return { conn, status: null, loading: false, error: "No manager" };
        }
        const start = Date.now();
        if (manager.quickStatus) {
          try {
            const qs = await manager.quickStatus(conn);
            return {
              conn,
              status: { ...qs, latency: qs.latency ?? Date.now() - start },
              loading: false,
              error: null,
            };
          } catch (err) {
            return { conn, status: null, loading: false, error: (err as Error).message };
          }
        }
        try {
          const ok = await manager.testConnection(conn);
          return {
            conn,
            status: { online: ok, latency: Date.now() - start, info: ok ? "Connected" : "Connection failed" },
            loading: false,
            error: ok ? null : "Connection failed",
          };
        } catch (err) {
          return { conn, status: null, loading: false, error: (err as Error).message };
        }
      }),
    );

    const newEntries = results.map((r, i) =>
      r.status === "fulfilled"
        ? { conn: r.value.conn, status: r.value.status, loading: false, error: r.value.error }
        : { conn: conns[i], status: null, loading: false, error: "Unknown error" },
    );

    setEntries(newEntries);
    setLastRefresh(Date.now());
  }, [vault]);

  useEffect(() => {
    checkAll();
  }, [checkAll]);

  useEffect(() => {
    if (autoRefresh) {
      refreshTimer.current = setInterval(() => checkAll(), 10000);
    }
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [autoRefresh, checkAll]);

  const filtered = useMemo(() => {
    if (!filter) return entries;
    const f = filter.toLowerCase();
    return entries.filter(
      (e) =>
        e.conn.name.toLowerCase().includes(f) ||
        e.conn.type.toLowerCase().includes(f) ||
        e.conn.host.toLowerCase().includes(f)
    );
  }, [entries, filter]);

  useEffect(() => {
    if (selectedIdx >= filtered.length && filtered.length > 0) {
      setSelectedIdx(filtered.length - 1);
    }
  }, [filtered.length, selectedIdx]);

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
        setSelectedIdx((i) => Math.min(Math.max(0, filtered.length - 1), i + 1));
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

    if (command === "refresh") {
      setStatus("Refreshing...");
      checkAll();
      setStatus(null);
      return;
    }

    if (command === "auto") {
      setAutoRefresh((prev) => {
        setStatus(`Auto-refresh ${!prev ? "enabled (10s)" : "disabled"}`);
        return !prev;
      });
      return;
    }

    if (command === "health" && onOpenHealth) {
      onOpenHealth();
      return;
    }

    if (command === "filter" || command === "search") {
      const q = trimmed.slice(command.length).trim();
      setFilter(q || null);
      setStatus(q ? `[ok] Filter: "${q}"` : "[ok] Filter cleared");
      return;
    }

    if (command === "connect") {
      const idx = parseInt(parts[1], 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= filtered.length) {
        setStatus(`[!] Invalid number. Type 1-${filtered.length}`);
        return;
      }
      onConnect(filtered[idx].conn);
      return;
    }

    if (command === "back" || command === "quit") {
      onBack();
      return;
    }

    if (!trimmed && filtered.length > 0) {
      onConnect(filtered[selectedIdx].conn);
      return;
    }
  }, [filtered, selectedIdx, onConnect, onBack, onOpenHealth, checkAll]);

  const onlineCount = entries.filter((e) => e.status?.online).length;
  const offlineCount = entries.filter((e) => (e.status && !e.status.online) || (e.error && !e.loading)).length;
  const loadingCount = entries.filter((e) => e.loading).length;
  const onlinePct = entries.length > 0 ? Math.round((onlineCount / entries.length) * 100) : 0;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} paddingX={margin} overflow="hidden">
      <Box marginBottom={1} height={1} justifyContent="space-between">
        <Breadcrumb items={["Home", "Dashboard"]} />
        {filter && <Text color={colors.cyan}>filter: {filter}</Text>}
      </Box>

      <Box flexDirection="column" height={availH} overflow="hidden">
        <StyledBox
          title="Multi-Service Dashboard"
          rightTitle={`auto: ${autoRefresh ? "ON 10s" : "OFF"} · ${lastRefresh > 0 ? new Date(lastRefresh).toLocaleTimeString() : "—"}`}
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
                {loadingCount > 0 && <Spinner label={`${loadingCount} checking`} color={colors.yellow} />}
              </Box>
              {entries.length > 0 && (
                <MeterBar
                  label="Availability"
                  percent={onlinePct}
                  width={10}
                  color={onlinePct >= 90 ? colors.green : onlinePct >= 50 ? colors.yellow : colors.red}
                />
              )}
            </Box>

            {filtered.length === 0 ? (
              <Box flexDirection="column">
                <Text color={colors.textMuted}>
                  {entries.length === 0 ? "  No connections in vault." : "  No connections match filter."}
                </Text>
                {entries.length === 0 && (
                  <Box marginTop={1}>
                    <Text color={colors.purple} bold>{"  Go to Connections to add some."}</Text>
                  </Box>
                )}
              </Box>
            ) : (
              <Box flexDirection="column">
                {filtered.map((entry, i) => {
                  const isSelected = i === selectedIdx;
                  const st = entry.status;
                  const dot = entry.loading ? "○" : st?.online ? "●" : st || entry.error ? "✗" : "?";
                  const dotColor = entry.loading ? colors.yellow : st?.online ? colors.green : st || entry.error ? colors.red : colors.textMuted;

                  return (
                    <Box key={entry.conn.id} flexDirection="row">
                      <Text color={isSelected ? colors.purpleBright : colors.textDim} bold={isSelected}>
                        {isSelected ? "▸ " : "  "}
                      </Text>
                      <Text color={dotColor} bold>{dot}</Text>
                      <Text color={colors.textDim}> {String(i + 1).padStart(2)}.</Text>
                      <Text color={isSelected ? colors.textBright : colors.text} bold={isSelected}>
                        {" "}{CONNECTION_ICONS[entry.conn.type]} {entry.conn.name.padEnd(18)}
                      </Text>
                      <Text color={isSelected ? colors.purpleBright : colors.textMuted}>
                        {" "}{CONNECTION_LABELS[entry.conn.type].padEnd(10)} · {entry.conn.host}:{entry.conn.port}
                      </Text>
                      {st && (
                        <>
                          <Text color={st.online ? colors.green : colors.red}>
                            {"  "}{st.info}
                          </Text>
                          {typeof st.latency === "number" && (
                            <Text color={latencyColor(st.latency)} bold>
                              {" "}({st.latency}ms)
                            </Text>
                          )}
                        </>
                      )}
                      {entry.error && !entry.loading && !st && (
                        <Text color={colors.red}>{"  "}{entry.error}</Text>
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
          completions={DASH_COMPLETIONS}
          history={cmdHistory}
          focused={focused}
          placeholder="connect <n> · filter <text> · health · refresh · auto · back"
        />
      </Box>

      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "↑/↓", label: "select" },
            { key: "Enter", label: "connect" },
            { key: "health", label: "sparklines" },
            { key: "^K", label: "palette" },
            { key: "esc", label: "back" },
          ]}
        />
      </Box>
    </Box>
  );
}
