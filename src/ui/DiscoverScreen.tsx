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
} from "../core/probe/docker.js";
import { formatBytes } from "../core/probe/system.js";
import type { ProbeResult } from "../core/types.js";

interface DiscoverScreenProps {
  probe: ProbeResult | null;
  scanning: boolean;
  onCommand: (cmd: string) => void;
  onRefresh: () => void;
}

type Section = "ports" | "containers" | "images" | "daemons" | "system" | "network";
type Overlay = null | "logs" | "inspect";

const SECTION_ORDER: Section[] = ["ports", "containers", "images", "daemons", "system", "network"];
const SECTION_LABELS: Record<Section, string> = {
  ports: "Ports",
  containers: "Containers",
  images: "Images",
  daemons: "Daemons",
  system: "System",
  network: "Network",
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

  // Active list for the current section
  const activeList = useMemo(() => {
    switch (section) {
      case "containers": return fContainers;
      case "ports": return fPorts;
      case "images": return fImages;
      case "daemons": return fDaemons;
      default: return [];
    }
  }, [section, fContainers, fPorts, fImages, fDaemons]);

  // Height calculations
  const availH = Math.max(8, termHeight - HEADER - FOOTER);
  const focusedH = Math.floor(availH * 0.55);
  const otherH = Math.floor((availH - focusedH - 4) / 5);

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

  const handleSubmit = useCallback((cmd: string) => {
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

    const localCmds = ["start", "stop", "restart", "remove", "rm", "logs", "inspect", "prune", "refresh", "rm-image", "prune-images"];
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
      if (section === "images") return;
      handleContainerAction(lower);
      return;
    }

    onCommand(lower);
  }, [handleContainerAction, handleImageAction, handlePrune, onRefresh, onCommand, section]);

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

    // Number keys 1-6 to jump to sections
    if (input >= "1" && input <= "6") {
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

      <Box marginTop={1}>
        <InputBar
          onSubmit={handleSubmit}
          placeholder="start · stop · rm · logs · inspect · prune · rm-image · prune-images · filter <text> · 1-6 · back"
          focused={true}
        />
      </Box>
      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "Up/Dn", label: "select" },
            { key: "tab", label: "switch section" },
            { key: "1-6", label: "jump section" },
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
