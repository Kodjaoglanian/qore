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

type Section = "overview" | "ports" | "containers" | "images" | "daemons" | "system" | "network" | "processes" | "services";
type Overlay = null | "logs" | "inspect" | "stats" | "exec";

const SECTION_ORDER: Section[] = ["overview", "ports", "containers", "images", "daemons", "system", "network", "processes", "services"];
const SECTION_LABELS: Record<Section, string> = {
  overview: "Overview",
  ports: "Ports",
  containers: "Containers",
  images: "Images",
  daemons: "Daemons",
  system: "System",
  network: "Network",
  processes: "Procs",
  services: "Services",
};
const SECTION_ICONS: Record<Section, string> = {
  overview: "■",
  ports: "◆",
  containers: "▣",
  images: "◇",
  daemons: "◉",
  system: "●",
  network: "▲",
  processes: "▼",
  services: "◐",
};

const HEADER = 2;
const FOOTER = 4;

export function DiscoverScreen({ probe, scanning, onCommand, onRefresh }: DiscoverScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.02));
  const innerWidth = Math.max(30, termWidth - margin * 2 - 4);

  const [section, setSection] = useState<Section>("overview");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [overlayContent, setOverlayContent] = useState<string>("");
  const [overlayScroll, setOverlayScroll] = useState(0);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

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

  const sidebarW = 22;
  const mainW = innerWidth - sidebarW - 1;
  const availH = Math.max(8, termHeight - HEADER - FOOTER - 2);
  const maxItems = Math.max(1, availH - 6);

  useEffect(() => {
    if (selectedIdx >= activeList.length && activeList.length > 0) {
      setSelectedIdx(activeList.length - 1);
    }
    if (activeList.length === 0) setSelectedIdx(0);
  }, [activeList.length]);

  useEffect(() => {
    if (selectedIdx < scrollOffset) setScrollOffset(selectedIdx);
    if (selectedIdx >= scrollOffset + maxItems) setScrollOffset(selectedIdx - maxItems + 1);
  }, [selectedIdx, section]);

  useEffect(() => {
    if (actionMsg) {
      const t = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [actionMsg]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => onRefresh(), 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, onRefresh]);

  const handleContainerAction = useCallback(async (action: string) => {
    if (fContainers.length === 0) return;
    const c = fContainers[selectedIdx];
    if (!c) return;
    switch (action) {
      case "start":
        setActionMsg(`starting ${c.name}...`);
        if (await startContainer(c.id)) { setActionMsg(`✓ started ${c.name}`); onRefresh(); }
        else setActionMsg(`✗ failed to start ${c.name}`);
        break;
      case "stop":
        setActionMsg(`stopping ${c.name}...`);
        if (await stopContainer(c.id)) { setActionMsg(`✓ stopped ${c.name}`); onRefresh(); }
        else setActionMsg(`✗ failed to stop ${c.name}`);
        break;
      case "restart":
        setActionMsg(`restarting ${c.name}...`);
        if (await restartContainer(c.id)) { setActionMsg(`✓ restarted ${c.name}`); onRefresh(); }
        else setActionMsg(`✗ failed to restart ${c.name}`);
        break;
      case "remove":
        setActionMsg(`removing ${c.name}...`);
        if (await removeContainer(c.id)) { setActionMsg(`✓ removed ${c.name}`); onRefresh(); }
        else setActionMsg(`✗ failed to remove ${c.name}`);
        break;
      case "logs": {
        setOverlay("logs"); setOverlayContent("Loading logs..."); setOverlayScroll(0);
        const logs = await getContainerLogs(c.id, 80);
        setOverlayContent(logs || "No logs available.");
        return;
      }
      case "inspect": {
        setOverlay("inspect"); setOverlayContent("Loading info..."); setOverlayScroll(0);
        const info = await inspectContainer(c.id);
        setOverlayContent(info);
        return;
      }
      case "stats": {
        setOverlay("stats"); setOverlayContent("Loading stats..."); setOverlayScroll(0);
        const stats = await getContainerStats(c.id);
        if (stats) setOverlayContent(formatStats(c.name, stats));
        else setOverlayContent("Failed to get stats. Container may be stopped.");
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
        if (await removeImage(img.id)) { setActionMsg(`✓ removed ${img.tags[0]}`); onRefresh(); }
        else setActionMsg(`✗ failed to remove image`);
        break;
      case "prune-images":
        setActionMsg("pruning unused images...");
        const count = await pruneImages();
        setActionMsg(count > 0 ? `✓ pruned ${count} images` : "nothing to prune");
        if (count > 0) onRefresh();
        break;
    }
  }, [fImages, selectedIdx, onRefresh]);

  const handlePrune = useCallback(async () => {
    setActionMsg("pruning stopped containers...");
    const count = await pruneStoppedContainers();
    setActionMsg(count > 0 ? `✓ pruned ${count} containers` : "nothing to prune");
    if (count > 0) onRefresh();
  }, [onRefresh]);

  const handleProcessAction = useCallback(async (action: string) => {
    if (fProcesses.length === 0) return;
    const p = fProcesses[selectedIdx];
    if (!p) return;
    switch (action) {
      case "kill":
        setActionMsg(`killing PID ${p.pid}...`);
        if (await killProcess(p.pid)) { setActionMsg(`✓ killed PID ${p.pid}`); onRefresh(); }
        else setActionMsg(`✗ failed to kill PID ${p.pid}`);
        break;
      case "kill-9":
        setActionMsg(`force killing PID ${p.pid}...`);
        if (await killProcess(p.pid, "KILL")) { setActionMsg(`✓ force killed PID ${p.pid}`); onRefresh(); }
        else setActionMsg(`✗ failed to force kill PID ${p.pid}`);
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
        if (await controlService(s.name, "start")) { setActionMsg(`✓ started ${s.name}`); onRefresh(); }
        else setActionMsg(`✗ failed to start ${s.name}`);
        break;
      case "svc-stop":
        setActionMsg(`stopping ${s.name}...`);
        if (await controlService(s.name, "stop")) { setActionMsg(`✓ stopped ${s.name}`); onRefresh(); }
        else setActionMsg(`✗ failed to stop ${s.name}`);
        break;
      case "svc-restart":
        setActionMsg(`restarting ${s.name}...`);
        if (await controlService(s.name, "restart")) { setActionMsg(`✓ restarted ${s.name}`); onRefresh(); }
        else setActionMsg(`✗ failed to restart ${s.name}`);
        break;
      case "svc-logs": {
        setOverlay("logs"); setOverlayContent("Loading service logs..."); setOverlayScroll(0);
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
    setActionMsg(`✓ ${result.success} succeeded, ${result.failed} failed`);
    onRefresh();
  }, [fContainers, onRefresh]);

  const handleSubmit = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();

    if (lower.startsWith("filter ") || lower.startsWith("search ")) {
      const query = trimmed.slice(7).trim();
      setFilter(query || null);
      setActionMsg(query ? `filter: "${query}"` : "filter cleared");
      return;
    }
    if (lower === "filter" || lower === "search") {
      setFilter(null); setActionMsg("filter cleared"); return;
    }

    if (SECTION_LABELS[lower as Section]) {
      setSection(lower as Section); setSelectedIdx(0); setScrollOffset(0); return;
    }

    const localCmds = ["start", "stop", "restart", "remove", "rm", "logs", "inspect", "prune", "refresh", "rm-image", "prune-images", "kill", "kill-9", "svc-start", "svc-stop", "svc-restart", "svc-logs", "stats", "batch-start", "batch-stop", "batch-restart", "auto"];
    if (lower.startsWith("exec ")) {
      const execCmd = trimmed.slice(5);
      if (section === "containers" && fContainers.length > 0) {
        const c = fContainers[selectedIdx];
        if (c) {
          setOverlay("exec"); setOverlayContent(`Executing: ${execCmd}`); setOverlayScroll(0);
          const result = await execInContainer(c.id, execCmd);
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
      if (lower === "auto") { setAutoRefresh(a => !a); setActionMsg(autoRefresh ? "auto-refresh off" : "auto-refresh on (5s)"); return; }
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
  }, [handleContainerAction, handleImageAction, handlePrune, handleProcessAction, handleServiceAction, handleBatchAction, onRefresh, onCommand, section, autoRefresh, fContainers, selectedIdx]);

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
      setSelectedIdx(0); setScrollOffset(0); return;
    }
    if (input >= "1" && input <= "9") {
      const idx = parseInt(input) - 1;
      if (idx < SECTION_ORDER.length) {
        setSection(SECTION_ORDER[idx]); setSelectedIdx(0); setScrollOffset(0);
      }
      return;
    }
    if (activeList.length > 0) {
      if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setSelectedIdx(i => Math.min(activeList.length - 1, i + 1));
      if (key.pageUp) setSelectedIdx(i => Math.max(0, i - maxItems));
      if (key.pageDown) setSelectedIdx(i => Math.min(activeList.length - 1, i + maxItems));
    }
  });

  // --- Overlay view ---
  if (overlay) {
    const allLines = overlayContent.split("\n");
    const overlayH = termHeight - HEADER - FOOTER - 4;
    const visibleLines = allLines.slice(overlayScroll, overlayScroll + overlayH);
    const c = fContainers[selectedIdx];
    const title = overlay === "logs" ? "Logs" : overlay === "inspect" ? "Inspect" : overlay === "stats" ? "Stats" : "Exec Output";

    return (
      <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin}>
        <Box marginBottom={1} height={1} flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row">
            <Text color={colors.purple} bold>[{title}]</Text>
            <Text color={colors.textDim}> {truncate(c?.name ?? "", 30)}</Text>
          </Box>
          <ScrollIndicator offset={overlayScroll} total={allLines.length} visible={overlayH} />
        </Box>
        <StyledBox title={title} focused variant="overlay" height={overlayH + 4} overflow="hidden" padding={1}>
          <Box flexDirection="column" overflow="hidden">
            {visibleLines.map((line, i) => (
              <Box key={i}><Text color={i % 2 === 0 ? colors.text : colors.textMuted} wrap="truncate">{line.slice(0, innerWidth)}</Text></Box>
            ))}
          </Box>
        </StyledBox>
        <Box marginTop={1}>
          <ShortcutBar shortcuts={[
            { key: "↑/↓", label: "scroll" },
            { key: "esc", label: "back" },
            { key: "^c", label: "quit" },
          ]} />
        </Box>
      </Box>
    );
  }

  // --- Sidebar counts ---
  const counts: Record<Section, number> = {
    overview: 0, ports: ports.length, containers: containers.length,
    images: images.length, daemons: daemons.length, system: 0,
    network: netIfaces.length, processes: processes.length, services: services.length,
  };

  const runningContainers = containers.filter(c => c.state === "running").length;
  const activeServices = services.filter(s => s.activeState === "active").length;

  // --- Main panel content ---
  function renderMainPanel(): React.ReactNode {
    if (section === "overview") {
      return (
        <Box flexDirection="column" overflow="hidden" height={availH - 4}>
          {hostInfo && (
            <Box flexDirection="column" marginBottom={1}>
              <Text color={colors.purple} bold>System</Text>
              <Text color={colors.text}>  {hostInfo.hostname} · {truncate(hostInfo.os, 20)} · {hostInfo.kernel}</Text>
              <Text color={colors.textDim}>  CPU {hostInfo.cpuCores}c · {truncate(hostInfo.cpuModel, 35)}</Text>
              <Text color={colors.textDim}>  Mem {formatBytes(hostInfo.memoryUsed)}/{formatBytes(hostInfo.memoryTotal)} · Load {hostInfo.loadAvg.map(l => l.toFixed(2)).join(" ")}</Text>
              <Text color={colors.textDim}>  Uptime {hostInfo.uptime} · Swap {formatBytes(hostInfo.swapUsed)}/{formatBytes(hostInfo.swapTotal)}</Text>
            </Box>
          )}
          <Box flexDirection="column">
            <Text color={colors.purple} bold>Summary</Text>
            <Text color={runningContainers > 0 ? colors.green : colors.textMuted}>  ▣ {containers.length} containers ({runningContainers} running)</Text>
            <Text color={images.length > 0 ? colors.blue : colors.textMuted}>  ◇ {images.length} images</Text>
            <Text color={ports.length > 0 ? colors.cyan : colors.textMuted}>  ◆ {ports.length} open ports</Text>
            <Text color={daemons.length > 0 ? colors.yellow : colors.textMuted}>  ◉ {daemons.length} daemons</Text>
            <Text color={processes.length > 0 ? colors.text : colors.textMuted}>  ▼ {processes.length} processes</Text>
            <Text color={activeServices > 0 ? colors.green : colors.textMuted}>  ◐ {services.length} services ({activeServices} active)</Text>
            <Text color={netIfaces.length > 0 ? colors.cyan : colors.textMuted}>  ▲ {netIfaces.length} interfaces · {routes.length} routes · {firewall.length} fw rules</Text>
          </Box>
          {hostInfo && hostInfo.disks.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={colors.purple} bold>Disks</Text>
              {hostInfo.disks.slice(0, 6).map((d, i) => {
                const pct = parseInt(d.usePercent);
                const color = pct > 90 ? colors.red : pct > 70 ? colors.yellow : colors.green;
                return (
                  <Text key={i} color={colors.textDim}>  {truncate(d.mount, 16).padEnd(16)} <Text color={color}>{d.usePercent}</Text> · {d.size}</Text>
                );
              })}
            </Box>
          )}
          <Box marginTop={1}>
            <Text color={colors.textMuted}>  Press 2-9 or Tab to explore sections · type "filter" to search</Text>
          </Box>
        </Box>
      );
    }

    if (section === "system") {
      return (
        <Box flexDirection="column" overflow="hidden" height={availH - 4}>
          {hostInfo ? (
            <>
              <Text color={colors.purple} bold>Host Information</Text>
              <Text color={colors.text}>  Hostname    {hostInfo.hostname}</Text>
              <Text color={colors.text}>  OS          {hostInfo.os}</Text>
              <Text color={colors.text}>  Kernel      {hostInfo.kernel}</Text>
              <Text color={colors.text}>  Uptime      {hostInfo.uptime}</Text>
              <Text color={colors.text}>  CPU         {hostInfo.cpuCores} cores · {hostInfo.cpuModel}</Text>
              <Text color={colors.text}>  Memory      {formatBytes(hostInfo.memoryUsed)} / {formatBytes(hostInfo.memoryTotal)}</Text>
              <Text color={colors.text}>  Swap        {formatBytes(hostInfo.swapUsed)} / {formatBytes(hostInfo.swapTotal)}</Text>
              <Text color={colors.text}>  Load        {hostInfo.loadAvg.map(l => l.toFixed(2)).join("  ")}</Text>
              <Box marginTop={1}>
                <Text color={colors.purple} bold>Disks</Text>
              </Box>
              {hostInfo.disks.map((d, i) => {
                const pct = parseInt(d.usePercent);
                const color = pct > 90 ? colors.red : pct > 70 ? colors.yellow : colors.green;
                return (
                  <Text key={i} color={colors.text}>  {truncate(d.mount, 20).padEnd(20)} <Text color={color}>{d.usePercent.padStart(4)}</Text> · {truncate(d.filesystem, 20)} · {d.size}</Text>
                );
              })}
            </>
          ) : (
            <Text color={colors.textMuted}>System info unavailable.</Text>
          )}
        </Box>
      );
    }

    if (section === "network") {
      return (
        <Box flexDirection="column" overflow="hidden" height={availH - 4}>
          <Text color={colors.purple} bold>Network Interfaces ({netIfaces.length})</Text>
          {netIfaces.length > 0 ? netIfaces.slice(0, Math.floor(maxItems / 2)).map((iface, i) => (
            <Text key={i} color={i % 2 === 0 ? colors.text : colors.textMuted}>
              {"  "}<Text color={iface.state === "UP" ? colors.green : colors.textMuted}>{truncate(iface.name, 12).padEnd(12)}</Text>
              {" "}{iface.state.padEnd(6)}
              {" "}{iface.ipv4.join(", ") || "no IPv4"}
              {" "}<Text color={colors.textDim}>{iface.mac}</Text>
            </Text>
          )) : <Text color={colors.textMuted}>  No interfaces found.</Text>}
          <Box marginTop={1}>
            <Text color={colors.purple} bold>Routes ({routes.length})</Text>
          </Box>
          {routes.slice(0, Math.floor(maxItems / 3)).map((r, i) => (
            <Text key={i} color={colors.textDim}>  {truncate(r.destination, 18).padEnd(18)} via {truncate(r.gateway, 15).padEnd(15)} on {truncate(r.interface, 10)}</Text>
          ))}
          {firewall.length > 0 && (
            <>
              <Box marginTop={1}>
                <Text color={colors.purple} bold>Firewall ({firewall.length})</Text>
              </Box>
              {firewall.slice(0, Math.floor(maxItems / 3)).map((f, i) => (
                <Text key={i} color={colors.textDim}>  {truncate(f.chain, 8).padEnd(8)} {truncate(f.target, 8).padEnd(8)} {truncate(f.protocol, 5).padEnd(5)} {truncate(f.source, 16)} → {truncate(f.destination, 16)}</Text>
              ))}
            </>
          )}
        </Box>
      );
    }

    const list = activeList;
    if (list.length === 0) {
      const emptyMsg = section === "containers"
        ? (probe?.dockerInfo === null ? "Docker: permission denied. Run: sudo usermod -aG docker $USER && relogin" : filter ? "No containers match filter." : "No containers found.")
        : filter ? "No items match filter." : "No items found.";
      return <Text color={colors.textMuted}>  {emptyMsg}</Text>;
    }

    const visible = list.slice(scrollOffset, scrollOffset + maxItems);

    return (
      <Box flexDirection="column" overflow="hidden" height={availH - 4}>
        {visible.map((item, i) => {
          const realIdx = scrollOffset + i;
          const isSelected = realIdx === selectedIdx;
          return renderRow(section, item, i, isSelected, mainW);
        })}
        {list.length > maxItems && (
          <Box marginTop={0}>
            <ScrollIndicator offset={scrollOffset} total={list.length} visible={maxItems} />
          </Box>
        )}
      </Box>
    );
  }

  function renderRow(s: Section, item: any, i: number, selected: boolean, w: number): React.ReactNode {
    const fg = selected ? colors.textBright : (i % 2 === 0 ? colors.text : colors.textMuted);
    const marker = selected ? "▸ " : "  ";

    if (s === "containers") {
      const stateColor = item.state === "running" ? colors.green : colors.red;
      return (
        <Box key={item.id} width={w}>
          <Text color={selected ? colors.purple : stateColor}>{marker}</Text>
          <Text color={fg} bold={selected}>{truncate(item.name, 22).padEnd(22)}</Text>
          <Text color={colors.textDim}> {truncate(item.image, Math.floor(w * 0.4)).padEnd(Math.floor(w * 0.4))}</Text>
          <Text color={stateColor}> {truncate(item.state, 9).padStart(9)}</Text>
          <Text color={colors.textMuted}> {truncate(item.status, w - 22 - Math.floor(w * 0.4) - 10)}</Text>
        </Box>
      );
    }
    if (s === "ports") {
      return (
        <Box key={i} width={w}>
          <Text color={selected ? colors.purple : colors.cyan}>{marker}</Text>
          <Text color={fg} bold={selected}>{String(item.port).padEnd(7)}</Text>
          <Text color={colors.textDim}> {truncate(item.service, 18).padEnd(18)}</Text>
          <Text color={colors.textMuted}> PID {String(item.pid).padEnd(7)}</Text>
          <Text color={colors.textMuted}> {truncate(item.command, w - 40)}</Text>
        </Box>
      );
    }
    if (s === "images") {
      const tag = item.tags[0] ?? "<none>";
      return (
        <Box key={item.id + i} width={w}>
          <Text color={selected ? colors.purple : colors.blue}>{marker}</Text>
          <Text color={fg} bold={selected}>{truncate(tag, 35).padEnd(35)}</Text>
          <Text color={colors.textDim}> {item.id.padEnd(12)}</Text>
          <Text color={colors.textMuted}> {formatBytes(item.size).padStart(10)}</Text>
        </Box>
      );
    }
    if (s === "daemons") {
      return (
        <Box key={i} width={w}>
          <Text color={selected ? colors.purple : colors.yellow}>{marker}</Text>
          <Text color={fg} bold={selected}>{truncate(item.name, 24).padEnd(24)}</Text>
          <Text color={colors.textDim}> {truncate(item.manager, 8).padEnd(8)}</Text>
          <Text color={colors.textMuted}> PID {String(item.pid).padEnd(7)}</Text>
          <Text color={colors.textMuted}> {truncate(item.status, w - 48)}</Text>
        </Box>
      );
    }
    if (s === "processes") {
      return (
        <Box key={item.pid} width={w}>
          <Text color={selected ? colors.purple : colors.red}>{marker}</Text>
          <Text color={fg} bold={selected}>{String(item.pid).padEnd(7)}</Text>
          <Text color={colors.textDim}> {truncate(item.user, 10).padEnd(10)}</Text>
          <Text color={colors.yellow}> {String(item.cpu.toFixed(1)).padStart(5)}%</Text>
          <Text color={colors.blue}> {String(item.mem.toFixed(1)).padStart(5)}%</Text>
          <Text color={colors.textMuted}> {truncate(item.command, w - 40)}</Text>
        </Box>
      );
    }
    if (s === "services") {
      const isActive = item.activeState === "active";
      return (
        <Box key={item.name + i} width={w}>
          <Text color={selected ? colors.purple : (isActive ? colors.green : colors.textMuted)}>{marker}</Text>
          <Text color={fg} bold={selected}>{truncate(item.name, 26).padEnd(26)}</Text>
          <Text color={isActive ? colors.green : colors.textMuted}> {truncate(item.activeState, 10).padEnd(10)}</Text>
          <Text color={colors.textDim}> {truncate(item.subState, 10)}</Text>
          <Text color={colors.textMuted}> {truncate(item.description, w - 55)}</Text>
        </Box>
      );
    }
    return null;
  }

  function renderSidebar() {
    return (
      <Box flexDirection="column" width={sidebarW} overflow="hidden">
        {SECTION_ORDER.map((s, i) => {
          const active = s === section;
          const num = i + 1;
          const count = counts[s];
          const icon = SECTION_ICONS[s];
          const label = SECTION_LABELS[s];
          const countStr = count > 0 ? String(count) : (s === "overview" || s === "system") ? "·" : "0";
          const line = `${active ? "▸" : " "} ${num}:${icon} ${truncate(label, 8).padEnd(8)} ${countStr.padStart(3)}`;
          return (
            <Box key={s} width={sidebarW} overflow="hidden">
              <Text color={active ? colors.textBright : colors.textDim} bold={active} wrap="truncate">{line}</Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  function getContextShortcuts() {
    const base = [
      { key: "↑/↓", label: "select" },
      { key: "tab", label: "switch" },
      { key: "1-9", label: "jump" },
      { key: "esc", label: "back" },
    ];
    if (section === "containers") return [...base, { key: "start/stop/rm", label: "actions" }, { key: "stats/logs", label: "inspect" }];
    if (section === "images") return [...base, { key: "rm", label: "remove" }, { key: "prune-images", label: "prune" }];
    if (section === "processes") return [...base, { key: "kill", label: "kill" }, { key: "kill-9", label: "force" }];
    if (section === "services") return [...base, { key: "svc-start/stop", label: "control" }, { key: "svc-logs", label: "logs" }];
    return base;
  }

  const mainTitle = section === "overview"
    ? "Overview"
    : `${SECTION_LABELS[section]}${activeList.length > 0 ? ` (${activeList.length})` : ""}`;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin}>
      {/* Header */}
      <Box marginBottom={1} height={1} flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row">
          <Breadcrumb items={["Home", "Discovery"]} />
          {scanning && <Text color={colors.yellow}> scanning...</Text>}
          {filter && <Text color={colors.cyan}> · filter:{filter}</Text>}
          {autoRefresh && <Text color={colors.green}> ⟳auto</Text>}
          {actionMsg && <Text color={colors.textDim}> · {actionMsg}</Text>}
        </Box>
      </Box>

      {/* Main layout: sidebar + content */}
      <Box flexDirection="row" height={availH} overflow="hidden">
        {/* Sidebar */}
        <StyledBox title="Sections" focused={false} height={availH} width={sidebarW} overflow="hidden" padding={0} marginRight={1}>
          {renderSidebar()}
        </StyledBox>

        {/* Main panel */}
        <StyledBox title={mainTitle} focused height={availH} overflow="hidden" padding={1}>
          {renderMainPanel()}
        </StyledBox>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <InputBar
          onSubmit={handleSubmit}
          placeholder="filter <text> · start · stop · rm · stats · exec <cmd> · kill · svc-start · prune · auto · 1-9 · back"
          focused={true}
        />
      </Box>
      <Box marginTop={1}>
        <ShortcutBar shortcuts={getContextShortcuts()} />
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
