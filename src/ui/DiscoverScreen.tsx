import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { StyledBox } from "./components/Box.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { ScrollIndicator } from "./components/ScrollIndicator.js";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import {
  startContainer, stopContainer, restartContainer, removeContainer,
  getContainerLogs, inspectContainer, pruneStoppedContainers,
} from "../core/probe/docker.js";
import type { ProbeResult } from "../core/types.js";

interface DiscoverScreenProps {
  probe: ProbeResult | null;
  scanning: boolean;
  onCommand: (cmd: string) => void;
  onRefresh: () => void;
}

type Section = "ports" | "containers" | "daemons";
type Overlay = null | "logs" | "inspect";

// border(2) + padding(2) + title(1)
const BOX_OVERHEAD = 5;
const HEADER = 2;
const FOOTER = 4; // input(1) + shortcuts(1) + margins(2)

export function DiscoverScreen({ probe, scanning, onCommand, onRefresh }: DiscoverScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.03));
  const innerWidth = Math.max(30, termWidth - margin * 2 - 4);

  const [section, setSection] = useState<Section>("containers");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [overlayContent, setOverlayContent] = useState<string>("");
  const [overlayScroll, setOverlayScroll] = useState(0);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const containers = probe?.containers ?? [];
  const ports = probe?.ports ?? [];
  const daemons = probe?.daemons ?? [];

  // Height calculations — no gap prop (Ink 5 doesn't support it)
  const availH = Math.max(8, termHeight - HEADER - FOOTER);
  const focusedH = Math.floor(availH * 0.60);
  const otherH = Math.floor((availH - focusedH - 2) / 2); // -2 for marginBottom on each

  const portH = section === "ports" ? focusedH : otherH;
  const containerH = section === "containers" ? focusedH : otherH;
  const daemonH = section === "daemons" ? focusedH : otherH;

  const maxPorts = Math.max(1, portH - BOX_OVERHEAD);
  const maxContainers = Math.max(1, containerH - BOX_OVERHEAD - 1); // -1 for pagination line
  const maxDaemons = Math.max(1, daemonH - BOX_OVERHEAD);

  useEffect(() => {
    if (selectedIdx >= containers.length && containers.length > 0) {
      setSelectedIdx(containers.length - 1);
    }
    if (containers.length === 0) setSelectedIdx(0);
  }, [containers.length]);

  useEffect(() => {
    if (selectedIdx < scrollOffset) setScrollOffset(selectedIdx);
    if (selectedIdx >= scrollOffset + maxContainers) setScrollOffset(selectedIdx - maxContainers + 1);
  }, [selectedIdx, maxContainers]);

  useEffect(() => {
    if (actionMsg) {
      const t = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [actionMsg]);

  const handleAction = useCallback(async (action: string) => {
    if (containers.length === 0) return;
    const c = containers[selectedIdx];
    if (!c) return;

    switch (action) {
      case "start":
        setActionMsg(`starting ${c.name}...`);
        if (await startContainer(c.id)) { setActionMsg(`[ok] started ${c.name}`); onRefresh(); }
        else setActionMsg(`[!] failed to start ${c.name}`);
        break;
      case "stop":
        setActionMsg(`stopping ${c.name}...`);
        if (await stopContainer(c.id)) { setActionMsg(`[ok] stopped ${c.name}`); onRefresh(); }
        else setActionMsg(`[!] failed to stop ${c.name}`);
        break;
      case "restart":
        setActionMsg(`restarting ${c.name}...`);
        if (await restartContainer(c.id)) { setActionMsg(`[ok] restarted ${c.name}`); onRefresh(); }
        else setActionMsg(`[!] failed to restart ${c.name}`);
        break;
      case "remove":
        setActionMsg(`removing ${c.name}...`);
        if (await removeContainer(c.id)) { setActionMsg(`[ok] removed ${c.name}`); onRefresh(); }
        else setActionMsg(`[!] failed to remove ${c.name}`);
        break;
      case "logs": {
        setOverlay("logs");
        setOverlayContent("Loading logs...");
        setOverlayScroll(0);
        const logs = await getContainerLogs(c.id, 80);
        setOverlayContent(logs || "No logs available.");
        return;
      }
      case "inspect": {
        setOverlay("inspect");
        setOverlayContent("Loading info...");
        setOverlayScroll(0);
        const info = await inspectContainer(c.id);
        setOverlayContent(info);
        return;
      }
    }
  }, [containers, selectedIdx, onRefresh]);

  const handlePrune = useCallback(async () => {
    setActionMsg("pruning stopped containers...");
    const count = await pruneStoppedContainers();
    setActionMsg(count > 0 ? `[ok] pruned ${count} containers` : "nothing to prune");
    if (count > 0) onRefresh();
  }, [onRefresh]);

  // Handle local commands typed in the InputBar
  const handleSubmit = useCallback((cmd: string) => {
    const trimmed = cmd.trim().toLowerCase();
    if (!trimmed) return;

    // Local commands (don't pass to App)
    const localCmds = ["start", "stop", "restart", "remove", "rm", "logs", "inspect", "prune", "refresh"];
    if (localCmds.includes(trimmed)) {
      if (trimmed === "prune") { handlePrune(); return; }
      if (trimmed === "refresh") { onRefresh(); return; }
      if (trimmed === "rm") { handleAction("remove"); return; }
      handleAction(trimmed);
      return;
    }

    // Pass navigation commands to App
    onCommand(trimmed);
  }, [handleAction, handlePrune, onRefresh, onCommand]);

  // Only handle non-printable keys for navigation.
  // Printable characters go to InputBar (always focused).
  useInput((input, key) => {
    if (overlay) {
      if (key.escape) {
        setOverlay(null);
        setOverlayContent("");
      }
      if (key.upArrow) setOverlayScroll(o => Math.max(0, o - 1));
      if (key.downArrow) setOverlayScroll(o => o + 1);
      if (key.pageUp) setOverlayScroll(o => Math.max(0, o - 10));
      if (key.pageDown) setOverlayScroll(o => o + 10);
      return;
    }

    // Escape with no overlay -> back to welcome
    if (key.escape) {
      onCommand("back");
      return;
    }

    // Only special keys — no printable chars (those go to InputBar)
    if (key.tab) {
      setSection(s => s === "ports" ? "containers" : s === "containers" ? "daemons" : "ports");
      return;
    }

    if (section === "containers" && containers.length > 0) {
      if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setSelectedIdx(i => Math.min(containers.length - 1, i + 1));
      if (key.pageUp) setSelectedIdx(i => Math.max(0, i - maxContainers));
      if (key.pageDown) setSelectedIdx(i => Math.min(containers.length - 1, i + maxContainers));
    }
  });

  // --- Overlay view ---
  if (overlay) {
    const allLines = overlayContent.split("\n");
    const overlayH = termHeight - HEADER - FOOTER - 4;
    const visibleLines = allLines.slice(overlayScroll, overlayScroll + overlayH);
    const c = containers[selectedIdx];

    return (
      <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin}>
        <Box marginBottom={1} height={1} flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row">
            <Text color={colors.purple} bold>{overlay === "logs" ? "[Logs]" : "[Inspect]"}</Text>
            <Text color={colors.textDim}> {truncate(c?.name ?? "", 30)}</Text>
          </Box>
          <ScrollIndicator offset={overlayScroll} total={allLines.length} visible={overlayH} />
        </Box>
        <StyledBox title={overlay === "logs" ? "Container Logs" : "Container Details"} focused variant="overlay" height={overlayH + 4} overflow="hidden" padding={1}>
          <Box flexDirection="column" overflow="hidden">
            {visibleLines.map((line, i) => (
              <Box key={i}><Text color={i % 2 === 0 ? colors.text : colors.textMuted} wrap="truncate">{line.slice(0, innerWidth)}</Text></Box>
            ))}
          </Box>
        </StyledBox>
        <Box marginTop={1}>
          <ShortcutBar shortcuts={[
            { key: "Up/Dn", label: "scroll" },
            { key: "esc", label: "back" },
            { key: "^c", label: "quit" },
          ]} />
        </Box>
      </Box>
    );
  }

  // --- Main view ---
  const dockerMsg =
    probe?.dockerInfo === null
      ? "Docker socket not available or permission denied."
      : containers.length === 0
        ? "No containers found."
        : null;

  const visibleContainers = containers.slice(scrollOffset, scrollOffset + maxContainers);
  const nameW = 20;
  const stateW = 9;
  const rowFixed = nameW + stateW + 5;
  const remaining = Math.max(15, innerWidth - rowFixed);
  const imageW = Math.floor(remaining * 0.5);
  const statusW = remaining - imageW;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin}>
      <Box marginBottom={1} height={1} flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row">
          <Breadcrumb items={["Home", "Discovery"]} />
          {scanning && <Text color={colors.yellow}> {" scanning..."}</Text>}
          {actionMsg && <Text color={colors.textDim}> {" · "}{actionMsg}</Text>}
        </Box>
      </Box>

      {/* Network Ports */}
      <StyledBox
        title={`Network Ports${ports.length > 0 ? ` (${ports.length})` : ""}`}
        focused={section === "ports"}
        height={portH}
        overflow="hidden"
        padding={1}
        marginBottom={1}
      >
        {ports.length > 0 ? (
          <Box flexDirection="column" overflow="hidden">
            {ports.slice(0, maxPorts).map((p, i) => (
              <Box key={i} justifyContent="space-between" width={innerWidth}>
                <Box>
                  <Text color={i % 2 === 0 ? colors.purple : colors.purpleDim}>{">"} </Text>
                  <Text color={i % 2 === 0 ? colors.text : colors.textMuted} bold={i % 2 === 0}>{String(p.port).padEnd(7)}</Text>
                  <Text color={colors.textDim}>{truncate(p.service, 18)}</Text>
                </Box>
                <Text color={colors.textMuted}>PID {p.pid} · {truncate(p.command, 14)}</Text>
              </Box>
            ))}
            {ports.length > maxPorts && (
              <Text color={colors.textMuted}>  ...{ports.length - maxPorts} more</Text>
            )}
          </Box>
        ) : (
          <Text color={colors.textMuted}>{scanning ? "Scanning ports..." : "No ports discovered."}</Text>
        )}
      </StyledBox>

      {/* Docker Containers */}
      <StyledBox
        title={`Docker Containers${containers.length > 0 ? ` (${containers.length})` : ""}`}
        focused={section === "containers"}
        height={containerH}
        overflow="hidden"
        padding={1}
        marginBottom={1}
      >
        {dockerMsg ? (
          <Text color={colors.textMuted}>{dockerMsg}</Text>
        ) : (
          <Box flexDirection="column" overflow="hidden">
            {visibleContainers.map((c, i) => {
              const realIdx = scrollOffset + i;
              const isSelected = section === "containers" && realIdx === selectedIdx;
              return (
                <Box key={c.id} width={innerWidth}>
                  <Text color={isSelected ? colors.purple : (c.state === "running" ? colors.green : colors.red)}>
                    {isSelected ? "> " : c.state === "running" ? "* " : "- "}
                  </Text>
                  <Text
                    color={isSelected ? colors.textBright : (i % 2 === 0 ? colors.text : colors.textMuted)}
                    bold={isSelected}
                  >
                    {truncate(c.name, nameW).padEnd(nameW)}
                  </Text>
                  <Text color={colors.textDim}> {truncate(c.image, imageW).padEnd(imageW)}</Text>
                  <Text color={c.state === "running" ? colors.green : colors.textMuted}>
                    {truncate(c.state, stateW).padStart(stateW)}
                  </Text>
                  <Text color={colors.textMuted}> {truncate(c.status, statusW)}</Text>
                </Box>
              );
            })}
            {containers.length > maxContainers && (
              <Box marginTop={0}>
                <ScrollIndicator offset={scrollOffset} total={containers.length} visible={maxContainers} />
              </Box>
            )}
          </Box>
        )}
      </StyledBox>

      {/* Daemons */}
      <StyledBox
        title={`Daemons${daemons.length > 0 ? ` (${daemons.length})` : ""}`}
        focused={section === "daemons"}
        height={daemonH}
        overflow="hidden"
        padding={1}
      >
        {daemons.length > 0 ? (
          <Box flexDirection="column" overflow="hidden">
            {daemons.slice(0, maxDaemons).map((d, i) => (
              <Box key={i} justifyContent="space-between" width={innerWidth}>
                <Box>
                  <Text color={i % 2 === 0 ? colors.cyan : colors.blue}>{"* "}</Text>
                  <Text color={i % 2 === 0 ? colors.text : colors.textMuted} bold={i % 2 === 0}>{truncate(d.name, 24)}</Text>
                </Box>
                <Text color={colors.textMuted}>{d.manager} · PID {d.pid} · {truncate(d.status, 18)}</Text>
              </Box>
            ))}
          </Box>
        ) : (
          <Text color={colors.textMuted}>No daemons detected.</Text>
        )}
      </StyledBox>

      <Box marginTop={1}>
        <InputBar
          onSubmit={handleSubmit}
          placeholder="start · stop · restart · rm · logs · inspect · prune · refresh · back"
          focused={true}
        />
      </Box>
      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "Up/Dn", label: "select" },
            { key: "pgUp/Dn", label: "page" },
            { key: "tab", label: "switch section" },
            { key: "Enter", label: "execute cmd" },
            { key: "esc", label: "back" },
          ]}
        />
      </Box>
    </Box>
  );
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, Math.max(1, len - 1)) + "…";
}

function ServiceIcon(service: string): string {
  const s = service.toLowerCase();
  if (s.includes("http") || s.includes("nginx") || s.includes("apache")) return "HTTP";
  if (s.includes("postgres")) return "PG";
  if (s.includes("mysql") || s.includes("maria")) return "MY";
  if (s.includes("redis")) return "RD";
  if (s.includes("mongo")) return "MG";
  if (s.includes("docker")) return "DK";
  return "--";
}
