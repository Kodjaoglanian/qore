import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { StyledBox } from "./components/Box.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { ScrollIndicator } from "./components/ScrollIndicator.js";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";

interface HelpRow {
  cmd: string;
  desc: string;
}

interface HelpSection {
  title: string;
  color: string;
  rows: HelpRow[];
}

interface HelpScreenProps {
  onCommand: (cmd: string) => void;
  focused?: boolean;
}

function sectionHeight(s: HelpSection): number {
  return 4 + s.rows.length;
}

export function HelpScreen({ onCommand, focused = true }: HelpScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.05));
  const twoColumn = termWidth > 120;
  const [sectionOffset, setSectionOffset] = useState(0);
  const [search, setSearch] = useState("");

  const allSections = useMemo(() => createSections(), []);

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allSections;
    return allSections
      .map((s) => ({
        ...s,
        rows: s.rows.filter(
          (r) =>
            r.cmd.toLowerCase().includes(q) ||
            r.desc.toLowerCase().includes(q) ||
            s.title.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.rows.length > 0);
  }, [allSections, search]);

  const overhead = 6;
  const availHeight = Math.max(8, termHeight - 4 - overhead);

  const maxOffset = useMemo(() => {
    const step = twoColumn ? 2 : 1;
    let max = 0;
    for (let start = 0; start < sections.length; start += step) {
      let used = 0;
      for (let i = start; i < sections.length; i += step) {
        const end = Math.min(i + step, sections.length);
        const slice = sections.slice(i, end);
        const h = Math.max(...slice.map(sectionHeight)) + 1;
        if (used + h > availHeight && used > 0) break;
        used += h;
      }
      if (used > 0) max = start;
    }
    if (twoColumn && max % 2 !== 0) max = Math.max(0, max - 1);
    return max;
  }, [sections, availHeight, twoColumn]);

  const visibleSections = useMemo(() => {
    const step = twoColumn ? 2 : 1;
    let start = Math.min(sectionOffset, maxOffset);
    if (twoColumn && start % 2 !== 0) start = Math.max(0, start - 1);
    const result: HelpSection[] = [];
    let used = 0;
    for (let i = start; i < sections.length; i += step) {
      const end = Math.min(i + step, sections.length);
      const slice = sections.slice(i, end);
      const h = Math.max(...slice.map(sectionHeight)) + 1;
      if (used + h > availHeight && result.length > 0) break;
      used += h;
      for (let j = i; j < end; j++) result.push(sections[j]);
    }
    return result;
  }, [sections, sectionOffset, maxOffset, availHeight, twoColumn]);

  const alignedOffset = twoColumn && sectionOffset % 2 !== 0 ? Math.max(0, sectionOffset - 1) : sectionOffset;

  useInput(
    (input, key) => {
      if (key.escape) {
        if (search) {
          setSearch("");
          setSectionOffset(0);
        } else {
          onCommand("back");
        }
        return;
      }
      const step = twoColumn ? 2 : 1;
      if (key.upArrow || key.pageUp) {
        const amount = key.pageUp ? Math.max(step, Math.floor(availHeight / 8) * step) : step;
        setSectionOffset((o) => Math.max(0, o - amount));
        return;
      }
      if (key.downArrow || key.pageDown) {
        const amount = key.pageDown ? Math.max(step, Math.floor(availHeight / 8) * step) : step;
        setSectionOffset((o) => Math.min(maxOffset, o + amount));
        return;
      }
      const k = key as { home?: boolean; end?: boolean };
      if (k.home) { setSectionOffset(0); return; }
      if (k.end) { setSectionOffset(maxOffset); return; }
      if (key.backspace || key.delete) {
        setSearch((s) => s.slice(0, -1));
        setSectionOffset(0);
        return;
      }
      if (key.ctrl && input === "u") {
        setSearch("");
        setSectionOffset(0);
        return;
      }
      if (input && !key.ctrl && !key.meta && !key.tab && !key.return) {
        setSearch((s) => s + input);
        setSectionOffset(0);
      }
    },
    { isActive: focused }
  );

  const visibleCount = twoColumn ? Math.ceil(visibleSections.length / 2) : visibleSections.length;
  const totalCount = twoColumn ? Math.ceil(sections.length / 2) : sections.length;
  const scrollPos = twoColumn ? Math.floor(alignedOffset / 2) : alignedOffset;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin}>
      <Box marginBottom={1} height={1} justifyContent="space-between">
        <Breadcrumb items={["Home", "Help"]} />
        <Text color={colors.textDim}>
          ⌕{" "}
          {search ? (
            <Text color={colors.cyan} bold>{search}▎</Text>
          ) : (
            <Text color={colors.textMuted}>type to filter commands...</Text>
          )}
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleSections.length === 0 ? (
          <Text color={colors.textMuted}>  No commands match "{search}". Press Esc to clear.</Text>
        ) : twoColumn ? (
          renderTwoColumn(visibleSections)
        ) : (
          renderOneColumn(visibleSections)
        )}
      </Box>

      <Box marginTop={1} width="100%" justifyContent="space-between">
        <Box>
          <Text color={colors.textMuted}>Type to filter · </Text>
          <Text color={colors.purple} bold>↑/↓</Text>
          <Text color={colors.textMuted}> scroll · </Text>
          <Text color={colors.purple} bold>^K</Text>
          <Text color={colors.textMuted}> palette · </Text>
          <Text color={colors.purple} bold>esc</Text>
          <Text color={colors.textMuted}> {search ? "clear" : "back"}</Text>
        </Box>
        <ScrollIndicator offset={scrollPos} total={totalCount} visible={visibleCount} />
      </Box>
    </Box>
  );
}

function renderOneColumn(sections: HelpSection[]) {
  return (
    <Box flexDirection="column">
      {sections.map((s) => (
        <StyledBox key={s.title} title={s.title} focused padding={1} marginBottom={1} borderColor={s.color}>
          <Box flexDirection="column">
            {s.rows.map((r) => (
              <Row key={r.cmd} cmd={r.cmd} desc={r.desc} color={s.color} />
            ))}
          </Box>
        </StyledBox>
      ))}
    </Box>
  );
}

function renderTwoColumn(sections: HelpSection[]) {
  const pairs: [HelpSection, HelpSection | null][] = [];
  for (let i = 0; i < sections.length; i += 2) {
    pairs.push([sections[i], sections[i + 1] ?? null]);
  }
  return (
    <Box flexDirection="column">
      {pairs.map(([left, right]) => (
        <Box key={left.title} flexDirection="row" marginBottom={1}>
          <Box flexGrow={1} marginRight={right ? 1 : 0}>
            <StyledBox title={left.title} focused padding={1} borderColor={left.color}>
              <Box flexDirection="column">
                {left.rows.map((r) => (
                  <Row key={r.cmd} cmd={r.cmd} desc={r.desc} color={left.color} compact />
                ))}
              </Box>
            </StyledBox>
          </Box>
          {right && (
            <Box flexGrow={1} marginLeft={1}>
              <StyledBox title={right.title} focused padding={1} borderColor={right.color}>
                <Box flexDirection="column">
                  {right.rows.map((r) => (
                    <Row key={r.cmd} cmd={r.cmd} desc={r.desc} color={right.color} compact />
                  ))}
                </Box>
              </StyledBox>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

function Row({ cmd, desc, color, compact }: { cmd: string; desc: string; color: string; compact?: boolean }) {
  const cmdWidth = compact ? 17 : 22;
  const descWidth = compact ? 35 : 50;
  return (
    <Box justifyContent="space-between">
      <Text color={color} bold>{"  "}{cmd.padEnd(cmdWidth)}</Text>
      <Text color={colors.textMuted}>{desc.slice(0, descWidth)}</Text>
    </Box>
  );
}

function createSections(): HelpSection[] {
  return [
    {
      title: "Global Commands",
      color: colors.purple,
      rows: [
        { cmd: "Ctrl+K", desc: "open fuzzy Command Palette from any screen" },
        { cmd: "discover (containers)", desc: "scan ports, Docker, processes, services & network" },
        { cmd: "connections (conn, vault)", desc: "manage saved connections & encrypted vault" },
        { cmd: "dashboard (dash)", desc: "multi-service live status overview" },
        { cmd: "health", desc: "periodic health monitor with sparklines & uptime %" },
        { cmd: "storage", desc: "manage Local Emulated S3 & AWS S3 buckets/files" },
        { cmd: "providers", desc: "switch storage & Pub/Sub messaging providers" },
        { cmd: "theme [name]", desc: "switch or cycle TrueColor theme (torlink/cyber/emerald/amber/rose)" },
        { cmd: "lock", desc: "lock vault & zero encryption key in memory" },
        { cmd: "wiki (docs, book)", desc: "Qore documentation book" },
        { cmd: "help", desc: "show this searchable help screen" },
        { cmd: "back (home)", desc: "go back to previous screen" },
        { cmd: "quit (exit)", desc: "exit Qore" },
      ],
    },
    {
      title: "Connections & Vault",
      color: colors.purple,
      rows: [
        { cmd: "add", desc: "add a new connection" },
        { cmd: "connect <n>", desc: "connect to saved connection #n" },
        { cmd: "test <n>", desc: "test connection #n" },
        { cmd: "edit <n>", desc: "edit connection #n" },
        { cmd: "rm <n>", desc: "remove connection #n" },
        { cmd: "groups / group <n>", desc: "organize & batch-open connection groups" },
        { cmd: "snippet / run <n>", desc: "record & replay command sequences" },
        { cmd: "changepw", desc: "change vault master password" },
        { cmd: "export / import", desc: "encrypted connection bundles" },
      ],
    },
    {
      title: "Docker & Discovery",
      color: colors.cyan,
      rows: [
        { cmd: "start / stop / restart", desc: "control selected container" },
        { cmd: "rm / prune", desc: "remove container or prune stopped containers" },
        { cmd: "logs / inspect / stats", desc: "inspect container logs, details & live metrics" },
        { cmd: "exec <cmd>", desc: "run command inside selected container" },
        { cmd: "filter <text>", desc: "filter active section rows" },
        { cmd: "kill / kill-9", desc: "terminate selected process" },
        { cmd: "svc-start / svc-stop", desc: "control systemd service" },
        { cmd: "auto / refresh", desc: "toggle 5s auto-refresh or re-scan now" },
      ],
    },
    {
      title: "Storage & Providers",
      color: colors.blue,
      rows: [
        { cmd: "create <bucket>", desc: "create a bucket in active S3 provider" },
        { cmd: "delete <bucket>", desc: "delete a bucket" },
        { cmd: "open <bucket>", desc: "browse objects inside bucket" },
        { cmd: "upload <path> [key]", desc: "upload local file to open bucket" },
        { cmd: "rm <key>", desc: "delete object from open bucket" },
        { cmd: "use local | aws", desc: "switch both storage & messaging providers" },
        { cmd: "publish <topic> <msg>", desc: "publish event to Pub/Sub topic" },
      ],
    },
    {
      title: "Services (Redis / DB / S3 / HTTP / Git / SSH / VMware)",
      color: colors.green,
      rows: [
        { cmd: "Redis: get/set/del/keys", desc: "key-value inspection & server info" },
        { cmd: "DB: tables/desc/query", desc: "SQL queries, EXPLAIN, CSV export, slow-queries" },
        { cmd: "S3: ls/upload/presign", desc: "bucket & object ops with SigV4 presigned URLs" },
        { cmd: "HTTP: get/post/put/del", desc: "REST client with request history" },
        { cmd: "Git: status/diff/log", desc: "branches, stage, commit, merge, rebase, blame" },
        { cmd: "SSH: shell/exec/sftp", desc: "interactive PTY bash, Docker, UFW, snapshots, audit" },
        { cmd: "VMware: vms/power-on", desc: "vSphere VMs, hosts, datastores, snapshots, alarms" },
      ],
    },
    {
      title: "Tabs & Navigation",
      color: colors.yellow,
      rows: [
        { cmd: "Ctrl+Tab / Ctrl+Arrows", desc: "switch between open service tabs" },
        { cmd: "close (disconnect)", desc: "close current tab & disconnect" },
        { cmd: "new (new-session)", desc: "open duplicate session of same connection" },
        { cmd: "Tab", desc: "accept / cycle inline ghost autocomplete" },
        { cmd: "↑/↓ / PgUp / PgDn", desc: "navigate items or command history" },
        { cmd: "Esc / ^C", desc: "back / close overlay / quit Qore" },
      ],
    },
  ];
}
