import React, { useState, useCallback, useEffect, useMemo } from "react";
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
  removeImage, pruneImages,
  getContainerStats, execInContainer, batchAction,
  type ContainerStats,
} from "../core/probe/docker.js";
import { formatBytes } from "../core/probe/system.js";
import { killProcess } from "../core/probe/processes.js";
import { controlService, getServiceLogs } from "../core/probe/services.js";
import type { ProbeResult } from "../core/types.js";

interface DiscoverScreenProps {
  probe: ProbeResult | null;
  scanning: boolean;
  onCommand: (cmd: string) => void;
  onRefresh: () => void;
}

type Section = "ports" | "containers" | "images" | "daemons" | "system" | "network" | "processes" | "services";
type Overlay = null | "logs" | "inspect" | "stats" | "exec";

const SECTION_ORDER: Section[] = ["ports", "containers", "images", "daemons", "system", "network", "processes", "services"];
const SECTION_LABELS: Record<Section, string> = {
  ports: "Ports",
  containers: "Containers",
  images: "Images",
  daemons: "Daemons",
  system: "System",
  network: "Network",
  processes: "Procs",
  services: "Services",
};

const BOX_OVERHEAD = 5;
const HEADER = 2;
const FOOTER = 4;

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
  const [filter, setFilter] = useState<string | null>(null);

  const containers = probe?.containers ?? [];
  const ports = probe?.ports ?? [];
  const daemons = probe?.daemons ?? [];
  const images = probe?.dockerImages ?? [];
  const hostInfo = probe?.hostInfo ?? null;
  const netIfaces = probe?.networkInterfaces ?? [];
  const routes = probe?.routes ?? [];
  const firewall = probe?.firewallRules ?? [];
  const processes = probe?.processes ?? [];
  const services = probe?.services ?? [];

  // Apply filter to list-based sections
  const fContainers = useMemo(() => {
    if (!filter) return containers;
    const f = filter.toLowerCase();
    return containers.filter(c => c.name.toLowerCase().includes(f) || c.image.toLowerCase().includes(f) || c.state.toLowerCase().includes(f));
  }, [containers, filter]);

  const fPorts = useMemo(() => {
    if (!filter) return ports;
    const f = filter.toLowerCase();
    return ports.filter(p => p.service.toLowerCase().includes(f) || String(p.port).includes(f) || p.command.toLowerCase().includes(f));
  }, [ports, filter]);

  const fImages = useMemo(() => {
    if (!filter) return images;
    const f = filter.toLowerCase();
    return images.filter(img => img.tags.some(t => t.toLowerCase().includes(f)) || img.id.toLowerCase().includes(f));
  }, [images, filter]);

  const fDaemons = useMemo(() => {
    if (!filter) return daemons;
    const f = filter.toLowerCase();
    return daemons.filter(d => d.name.toLowerCase().includes(f) || d.status.toLowerCase().includes(f));
  }, [daemons, filter]);

  const fProcesses = useMemo(() => {
    if (!filter) return processes;
    const f = filter.toLowerCase();
    return processes.filter(p => p.command.toLowerCase().includes(f) || p.user.toLowerCase().includes(f) || String(p.pid).includes(f));
  }, [processes, filter]);

  const fServices = useMemo(() => {
    if (!filter) return services;
    const f = filter.toLowerCase();
    return services.filter(s => s.name.toLowerCase().includes(f) || s.activeState.toLowerCase().includes(f) || s.description.toLowerCase().includes(f));
  }, [services, filter]);

  // Active list for the current section
  const activeList = useMemo(() => {
    switch (section) {
      case "containers": return fContainers;
      case "ports": return fPorts;
      case "images": return fImages;
      case "daemons": return fDaemons;
      case "processes": return fProcesses;
      case "services": return fServices;
      default: return [];
    }
  }, [section, fContainers, fPorts, fImages, fDaemons, fProcesses, fServices]);

  // Height calculations
  const availH = Math.max(8, termHeight - HEADER - FOOTER);
  const focusedH = Math.floor(availH * 0.50);
  const otherH = Math.floor((availH - focusedH - 6) / 7);

  const sectionH = (s: Section) => s === section ? focusedH : Math.max(3, otherH);
  const maxItems = (s: Section) => Math.max(1, sectionH(s) - BOX_OVERHEAD);

  useEffect(() => {
    if (selectedIdx >= activeList.length && activeList.length > 0) {
      setSelectedIdx(activeList.length - 1);
    }
    if (activeList.length === 0) setSelectedIdx(0);
  }, [activeList.length]);

  useEffect(() => {
    if (selectedIdx < scrollOffset) setScrollOffset(selectedIdx);
    if (selectedIdx >= scrollOffset + maxItems(section)) setScrollOffset(selectedIdx - maxItems(section) + 1);
  }, [selectedIdx, section]);

  useEffect(() => {
    if (actionMsg) {
      const t = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [actionMsg]);

  const handleContainerAction = useCallback(async (action: string) => {
    if (fContainers.length === 0) return;
    const c = fContainers[selectedIdx];
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
      case "stats": {
        setOverlay("stats");
        setOverlayContent("Loading stats...");
        setOverlayScroll(0);
        const stats = await getContainerStats(c.id);
        if (stats) {
          setOverlayContent(formatStats(c.name, stats));
        } else {
          setOverlayContent("Failed to get stats. Container may be stopped.");
        }
        return;
      }
    }
  }, [fContainers, selectedIdx, onRefresh]);

  const handleImageAction = useCallback(async (action: string) => {
    if (fImages.length === 0) return;
    const img = fImages[selectedIdx];
    if (!img) return;

    switch (action) {
      case "rm-image":
        setActionMsg(`removing image ${img.tags[0]}...`);
        if (await removeImage(img.id)) { setActionMsg(`[ok] removed ${img.tags[0]}`); onRefresh(); }
        else setActionMsg(`[!] failed to remove image`);
        break;
      case "prune-images":
        setActionMsg("pruning unused images...");
        const count = await pruneImages();
        setActionMsg(count > 0 ? `[ok] pruned ${count} images` : "nothing to prune");
        if (count > 0) onRefresh();
        break;
    }
  }, [fImages, selectedIdx, onRefresh]);

  const handlePrune = useCallback(async () => {
    setActionMsg("pruning stopped containers...");
    const count = await pruneStoppedContainers();
    setActionMsg(count > 0 ? `[ok] pruned ${count} containers` : "nothing to prune");
    if (count > 0) onRefresh();
  }, [onRefresh]);

  const handleProcessAction = useCallback(async (action: string) => {
    if (fProcesses.length === 0) return;
    const p = fProcesses[selectedIdx];
    if (!p) return;

    switch (action) {
      case "kill":
        setActionMsg(`killing PID ${p.pid}...`);
        if (await killProcess(p.pid)) { setActionMsg(`[ok] killed PID ${p.pid}`); onRefresh(); }
        else setActionMsg(`[!] failed to kill PID ${p.pid}`);
        break;
      case "kill-9":
        setActionMsg(`force killing PID ${p.pid}...`);
        if (await killProcess(p.pid, "KILL")) { setActionMsg(`[ok] force killed PID ${p.pid}`); onRefresh(); }
        else setActionMsg(`[!] failed to force kill PID ${p.pid}`);
        break;
    }
  }, [fProcesses, selectedIdx, onRefresh]);

  const handleServiceAction = useCallback(async (action: string) => {
    if (fServices.length === 0) return;
    const s = fServices[selectedIdx];
    if (!s) return;

    switch (action) {
      case "svc-start":
        setActionMsg(`starting ${s.name}...`);
        if (await controlService(s.name, "start")) { setActionMsg(`[ok] started ${s.name}`); onRefresh(); }
        else setActionMsg(`[!] failed to start ${s.name}`);
        break;
      case "svc-stop":
        setActionMsg(`stopping ${s.name}...`);
        if (await controlService(s.name, "stop")) { setActionMsg(`[ok] stopped ${s.name}`); onRefresh(); }
        else setActionMsg(`[!] failed to stop ${s.name}`);
        break;
      case "svc-restart":
        setActionMsg(`restarting ${s.name}...`);
        if (await controlService(s.name, "restart")) { setActionMsg(`[ok] restarted ${s.name}`); onRefresh(); }
        else setActionMsg(`[!] failed to restart ${s.name}`);
        break;
      case "svc-logs": {
        setOverlay("logs");
        setOverlayContent("Loading service logs...");
        setOverlayScroll(0);
        const logs = await getServiceLogs(s.name, 80);
        setOverlayContent(logs);
        return;
      }
    }
  }, [fServices, selectedIdx, onRefresh]);

  const handleBatchAction = useCallback(async (action: "start" | "stop" | "restart") => {
    if (fContainers.length === 0) return;
    setActionMsg(`batch ${action}ing ${fContainers.length} containers...`);
    const result = await batchAction(action, fContainers.map(c => c.id));
    setActionMsg(`[ok] ${result.success} succeeded, ${result.failed} failed`);
    onRefresh();
  }, [fContainers, onRefresh]);

  const handleSubmit = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();

    // Filter command
    if (lower.startsWith("filter ") || lower.startsWith("search ")) {
      const query = trimmed.slice(7).trim();
      setFilter(query || null);
      setActionMsg(query ? `filter: "${query}"` : "filter cleared");
      return;
    }
    if (lower === "filter" || lower === "search") {
      setFilter(null);
      setActionMsg("filter cleared");
      return;
    }

    // Section navigation
    if (SECTION_LABELS[lower as Section]) {
      setSection(lower as Section);
      setSelectedIdx(0);
      setScrollOffset(0);
      return;
    }

    const localCmds = ["start", "stop", "restart", "remove", "rm", "logs", "inspect", "prune", "refresh", "rm-image", "prune-images", "kill", "kill-9", "svc-start", "svc-stop", "svc-restart", "svc-logs", "stats", "batch-start", "batch-stop", "batch-restart"];
    if (lower.startsWith("exec ")) {
      const cmd = trimmed.slice(5);
      if (section === "containers" && fContainers.length > 0) {
        const c = fContainers[selectedIdx];
        if (c) {
          setOverlay("exec");
          setOverlayContent(`Executing: ${cmd}`);
          setOverlayScroll(0);
          const result = await execInContainer(c.id, cmd);
          setOverlayContent(result);
        }
      }
      return;
    }
    if (localCmds.includes(lower)) {
      if (lower === "prune") { handlePrune(); return; }
      if (lower === "prune-images") { handleImageAction("prune-images"); return; }
      if (lower === "rm-image") { handleImageAction("rm-image"); return; }
      if (lower === "refresh") { onRefresh(); return; }
      if (lower === "rm") {
        if (section === "images") handleImageAction("rm-image");
        else handleContainerAction("remove");
        return;
      }
      if (lower === "kill") { handleProcessAction("kill"); return; }
      if (lower === "kill-9") { handleProcessAction("kill-9"); return; }
      if (lower === "svc-start") { handleServiceAction("svc-start"); return; }
      if (lower === "svc-stop") { handleServiceAction("svc-stop"); return; }
      if (lower === "svc-restart") { handleServiceAction("svc-restart"); return; }
      if (lower === "svc-logs") { handleServiceAction("svc-logs"); return; }
      if (lower === "stats") { handleContainerAction("stats"); return; }
      if (lower === "batch-start") { handleBatchAction("start"); return; }
      if (lower === "batch-stop") { handleBatchAction("stop"); return; }
      if (lower === "batch-restart") { handleBatchAction("restart"); return; }
      if (section === "images") return;
      if (section === "processes" || section === "services") return;
      handleContainerAction(lower);
      return;
    }

    onCommand(lower);
  }, [handleContainerAction, handleImageAction, handlePrune, handleProcessAction, handleServiceAction, handleBatchAction, onRefresh, onCommand, section]);

  useInput((input, key) => {
    if (overlay) {
      if (key.escape) { setOverlay(null); setOverlayContent(""); }
      if (key.upArrow) setOverlayScroll(o => Math.max(0, o - 1));
      if (key.downArrow) setOverlayScroll(o => o + 1);
      if (key.pageUp) setOverlayScroll(o => Math.max(0, o - 10));
      if (key.pageDown) setOverlayScroll(o => o + 10);
      return;
    }

    if (key.escape) { onCommand("back"); return; }

    if (key.tab) {
      setSection(s => {
        const idx = SECTION_ORDER.indexOf(s);
        return SECTION_ORDER[(idx + 1) % SECTION_ORDER.length];
      });
      setSelectedIdx(0);
      setScrollOffset(0);
      return;
    }

    // Number keys 1-8 to jump to sections
    if (input >= "1" && input <= "8") {
      const idx = parseInt(input) - 1;
      if (idx < SECTION_ORDER.length) {
        setSection(SECTION_ORDER[idx]);
        setSelectedIdx(0);
        setScrollOffset(0);
      }
      return;
    }

    if (activeList.length > 0) {
      if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setSelectedIdx(i => Math.min(activeList.length - 1, i + 1));
      if (key.pageUp) setSelectedIdx(i => Math.max(0, i - maxItems(section)));
      if (key.pageDown) setSelectedIdx(i => Math.min(activeList.length - 1, i + maxItems(section)));
    }
  });

  // --- Overlay view ---
  if (overlay) {
    const allLines = overlayContent.split("\n");
    const overlayH = termHeight - HEADER - FOOTER - 4;
    const visibleLines = allLines.slice(overlayScroll, overlayScroll + overlayH);
    const c = fContainers[selectedIdx];

    return (
      <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin}>
        <Box marginBottom={1} height={1} flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row">
            <Text color={colors.purple} bold>{overlay === "logs" ? "[Logs]" : overlay === "inspect" ? "[Inspect]" : overlay === "stats" ? "[Stats]" : "[Exec]"}</Text>
            <Text color={colors.textDim}> {truncate(c?.name ?? "", 30)}</Text>
          </Box>
          <ScrollIndicator offset={overlayScroll} total={allLines.length} visible={overlayH} />
        </Box>
        <StyledBox title={overlay === "logs" ? "Container Logs" : overlay === "inspect" ? "Container Details" : overlay === "stats" ? "Container Stats" : "Exec Output"} focused variant="overlay" height={overlayH + 4} overflow="hidden" padding={1}>
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
      : fContainers.length === 0
        ? filter ? "No containers match filter." : "No containers found."
        : null;

  const visibleContainers = fContainers.slice(scrollOffset, scrollOffset + maxItems("containers"));
  const visibleImages = fImages.slice(0, maxItems("images"));
  const nameW = 20;
  const stateW = 9;
  const rowFixed = nameW + stateW + 5;
  const remaining = Math.max(15, innerWidth - rowFixed);
  const imageW = Math.floor(remaining * 0.5);
  const statusW = remaining - imageW;

  // Section tabs
  const tabStr = SECTION_ORDER.map((s, i) => {
    const label = SECTION_LABELS[s];
    const active = s === section;
    const num = i + 1;
    return active ? `[${num}:${label}]` : ` ${num}:${label} `;
  }).join(" ");

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin}>
      {/* Header with breadcrumb + filter indicator */}
      <Box marginBottom={1} height={1} flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row">
          <Breadcrumb items={["Home", "Discovery"]} />
          {scanning && <Text color={colors.yellow}> {" scanning..."}</Text>}
          {filter && <Text color={colors.cyan}> {" · filter:"} {filter}</Text>}
          {actionMsg && <Text color={colors.textDim}> {" · "}{actionMsg}</Text>}
        </Box>
      </Box>

      {/* Section tabs */}
      <Box height={1} marginBottom={1}>
        <Text color={colors.purpleDim} bold>{tabStr}</Text>
      </Box>

      {/* Network Ports */}
      <StyledBox
        title={`Network Ports${fPorts.length > 0 ? ` (${fPorts.length})` : ""}`}
        focused={section === "ports"}
        height={sectionH("ports")}
        overflow="hidden"
        padding={1}
        marginBottom={1}
      >
        {fPorts.length > 0 ? (
          <Box flexDirection="column" overflow="hidden">
            {fPorts.slice(0, maxItems("ports")).map((p, i) => (
              <Box key={i} justifyContent="space-between" width={innerWidth}>
                <Box>
                  <Text color={i % 2 === 0 ? colors.purple : colors.purpleDim}>{">"} </Text>
                  <Text color={i % 2 === 0 ? colors.text : colors.textMuted} bold={i % 2 === 0}>{String(p.port).padEnd(7)}</Text>
                  <Text color={colors.textDim}>{truncate(p.service, 18)}</Text>
                </Box>
                <Text color={colors.textMuted}>PID {p.pid} · {truncate(p.command, 14)}</Text>
              </Box>
            ))}
            {fPorts.length > maxItems("ports") && (
              <Text color={colors.textMuted}>  ...{fPorts.length - maxItems("ports")} more</Text>
            )}
          </Box>
        ) : (
          <Text color={colors.textMuted}>{scanning ? "Scanning ports..." : filter ? "No ports match filter." : "No ports discovered."}</Text>
        )}
      </StyledBox>

      {/* Docker Containers */}
      <StyledBox
        title={`Docker Containers${fContainers.length > 0 ? ` (${fContainers.length})` : ""}`}
        focused={section === "containers"}
        height={sectionH("containers")}
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
            {fContainers.length > maxItems("containers") && (
              <Box marginTop={0}>
                <ScrollIndicator offset={scrollOffset} total={fContainers.length} visible={maxItems("containers")} />
              </Box>
            )}
          </Box>
        )}
      </StyledBox>

      {/* Docker Images */}
      <StyledBox
        title={`Docker Images${fImages.length > 0 ? ` (${fImages.length})` : ""}`}
        focused={section === "images"}
        height={sectionH("images")}
        overflow="hidden"
        padding={1}
        marginBottom={1}
      >
        {fImages.length > 0 ? (
          <Box flexDirection="column" overflow="hidden">
            {visibleImages.map((img, i) => {
              const isSelected = section === "images" && i === selectedIdx;
              const tag = img.tags[0] ?? "<none>";
              return (
                <Box key={img.id + i} width={innerWidth}>
                  <Text color={isSelected ? colors.purple : colors.blue}>
                    {isSelected ? "> " : "  "}
                  </Text>
                  <Text color={isSelected ? colors.textBright : (i % 2 === 0 ? colors.text : colors.textMuted)} bold={isSelected}>
                    {truncate(tag, 30).padEnd(30)}
                  </Text>
                  <Text color={colors.textDim}> {img.id.padEnd(12)}</Text>
                  <Text color={colors.textMuted}> {formatBytes(img.size).padStart(8)}</Text>
                </Box>
              );
            })}
          </Box>
        ) : (
          <Text color={colors.textMuted}>{filter ? "No images match filter." : "No images found."}</Text>
        )}
      </StyledBox>

      {/* Daemons */}
      <StyledBox
        title={`Daemons${fDaemons.length > 0 ? ` (${fDaemons.length})` : ""}`}
        focused={section === "daemons"}
        height={sectionH("daemons")}
        overflow="hidden"
        padding={1}
        marginBottom={1}
      >
        {fDaemons.length > 0 ? (
          <Box flexDirection="column" overflow="hidden">
            {fDaemons.slice(0, maxItems("daemons")).map((d, i) => (
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

      {/* System Info */}
      <StyledBox
        title="System Info"
        focused={section === "system"}
        height={sectionH("system")}
        overflow="hidden"
        padding={1}
        marginBottom={1}
      >
        {hostInfo ? (
          <Box flexDirection="column" overflow="hidden">
            <Text color={colors.text}><Text color={colors.purple}>Host:</Text> {truncate(hostInfo.hostname, 20)} <Text color={colors.textDim}>·</Text> {truncate(hostInfo.os, 24)}</Text>
            <Text color={colors.text}><Text color={colors.purple}>Kernel:</Text> {hostInfo.kernel} <Text color={colors.textDim}>·</Text> <Text color={colors.purple}>Uptime:</Text> {hostInfo.uptime}</Text>
            <Text color={colors.text}><Text color={colors.purple}>CPU:</Text> {hostInfo.cpuCores} cores <Text color={colors.textDim}>·</Text> {truncate(hostInfo.cpuModel, 30)}</Text>
            <Text color={colors.text}><Text color={colors.purple}>Mem:</Text> {formatBytes(hostInfo.memoryUsed)}/{formatBytes(hostInfo.memoryTotal)} <Text color={colors.textDim}>·</Text> <Text color={colors.purple}>Swap:</Text> {formatBytes(hostInfo.swapUsed)}/{formatBytes(hostInfo.swapTotal)}</Text>
            <Text color={colors.text}><Text color={colors.purple}>Load:</Text> {hostInfo.loadAvg.map(l => l.toFixed(2)).join(" ")}</Text>
            {hostInfo.disks.length > 0 && (
              <Text color={colors.textMuted}>Disks: {hostInfo.disks.map(d => `${d.mount} ${d.usePercent}`).join(" · ")}</Text>
            )}
          </Box>
        ) : (
          <Text color={colors.textMuted}>System info unavailable.</Text>
        )}
      </StyledBox>

      {/* Network */}
      <StyledBox
        title={`Network${netIfaces.length > 0 ? ` (${netIfaces.length} ifaces, ${routes.length} routes, ${firewall.length} fw rules)` : ""}`}
        focused={section === "network"}
        height={sectionH("network")}
        overflow="hidden"
        padding={1}
      >
        {netIfaces.length > 0 ? (
          <Box flexDirection="column" overflow="hidden">
            {netIfaces.slice(0, maxItems("network")).map((iface, i) => (
              <Box key={i} justifyContent="space-between" width={innerWidth}>
                <Box>
                  <Text color={i % 2 === 0 ? colors.cyan : colors.blue}>{"* "}</Text>
                  <Text color={i % 2 === 0 ? colors.text : colors.textMuted} bold={i % 2 === 0}>{truncate(iface.name, 12)}</Text>
                  <Text color={colors.textDim}> {iface.state}</Text>
                </Box>
                <Text color={colors.textMuted}>{iface.ipv4.join(", ") || "no IPv4"} · {truncate(iface.mac, 17)}</Text>
              </Box>
            ))}
            {netIfaces.length > maxItems("network") && (
              <Text color={colors.textMuted}>  ...{netIfaces.length - maxItems("network")} more</Text>
            )}
          </Box>
        ) : (
          <Text color={colors.textMuted}>Network info unavailable.</Text>
        )}
      </StyledBox>

      {/* Processes */}
      <StyledBox
        title={`Processes${fProcesses.length > 0 ? ` (${fProcesses.length})` : ""}`}
        focused={section === "processes"}
        height={sectionH("processes")}
        overflow="hidden"
        padding={1}
        marginBottom={1}
      >
        {fProcesses.length > 0 ? (
          <Box flexDirection="column" overflow="hidden">
            {fProcesses.slice(0, maxItems("processes")).map((p, i) => {
              const isSelected = section === "processes" && i === selectedIdx;
              return (
                <Box key={p.pid} width={innerWidth}>
                  <Text color={isSelected ? colors.purple : colors.red}>{isSelected ? "> " : "  "}</Text>
                  <Text color={isSelected ? colors.textBright : (i % 2 === 0 ? colors.text : colors.textMuted)} bold={isSelected}>
                    {String(p.pid).padEnd(7)}
                  </Text>
                  <Text color={colors.textDim}> {truncate(p.user, 10).padEnd(10)}</Text>
                  <Text color={colors.yellow}> {String(p.cpu.toFixed(1)).padStart(5)}%</Text>
                  <Text color={colors.blue}> {String(p.mem.toFixed(1)).padStart(5)}%</Text>
                  <Text color={colors.textMuted}> {truncate(p.command, innerWidth - 40)}</Text>
                </Box>
              );
            })}
          </Box>
        ) : (
          <Text color={colors.textMuted}>{filter ? "No processes match filter." : "No processes found."}</Text>
        )}
      </StyledBox>

      {/* Services */}
      <StyledBox
        title={`Services${fServices.length > 0 ? ` (${fServices.length})` : ""}`}
        focused={section === "services"}
        height={sectionH("services")}
        overflow="hidden"
        padding={1}
        marginBottom={1}
      >
        {fServices.length > 0 ? (
          <Box flexDirection="column" overflow="hidden">
            {fServices.slice(0, maxItems("services")).map((s, i) => {
              const isSelected = section === "services" && i === selectedIdx;
              const isActive = s.activeState === "active";
              return (
                <Box key={s.name + i} width={innerWidth}>
                  <Text color={isSelected ? colors.purple : (isActive ? colors.green : colors.textMuted)}>
                    {isSelected ? "> " : isActive ? "* " : "- "}
                  </Text>
                  <Text color={isSelected ? colors.textBright : (i % 2 === 0 ? colors.text : colors.textMuted)} bold={isSelected}>
                    {truncate(s.name, 24).padEnd(24)}
                  </Text>
                  <Text color={isActive ? colors.green : colors.textMuted}> {truncate(s.activeState, 10).padEnd(10)}</Text>
                  <Text color={colors.textDim}> {truncate(s.subState, 10)}</Text>
                  <Text color={colors.textMuted}> {truncate(s.description, innerWidth - 55)}</Text>
                </Box>
              );
            })}
          </Box>
        ) : (
          <Text color={colors.textMuted}>{filter ? "No services match filter." : "No services found (systemd required)."}</Text>
        )}
      </StyledBox>

      <Box marginTop={1}>
        <InputBar
          onSubmit={handleSubmit}
          placeholder="start · stop · rm · kill · stats · exec <cmd> · batch-start · batch-stop · svc-start · svc-logs · prune · filter <text> · 1-8 · back"
          focused={true}
        />
      </Box>
      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "Up/Dn", label: "select" },
            { key: "tab", label: "switch section" },
            { key: "1-8", label: "jump section" },
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

function formatStats(name: string, stats: ContainerStats): string {
  const lines = [
    `Container: ${name}`,
    "",
    `CPU:     ${stats.cpuPercent.toFixed(2)}%`,
    `Memory:  ${formatBytes(stats.memUsage)} / ${formatBytes(stats.memLimit)} (${stats.memPercent.toFixed(1)}%)`,
    `Network: ↓ ${formatBytes(stats.netInput)}  ↑ ${formatBytes(stats.netOutput)}`,
    `Block:   read ${formatBytes(stats.blockRead)}  write ${formatBytes(stats.blockWrite)}`,
    `PIDs:    ${stats.pids}`,
  ];
  return lines.join("\n");
}
