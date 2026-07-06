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
}

function sectionHeight(s: HelpSection): number {
  return 4 + s.rows.length;
}

export function HelpScreen({ onCommand }: HelpScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.05));
  const twoColumn = termWidth > 120;
  const [sectionOffset, setSectionOffset] = useState(0);

  const sections = useMemo(() => createSections(), []);

  const overhead = 5;
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
    let start = sectionOffset;
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
  }, [sections, sectionOffset, availHeight, twoColumn]);

  const alignedOffset = twoColumn && sectionOffset % 2 !== 0 ? Math.max(0, sectionOffset - 1) : sectionOffset;

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onCommand("back");
      return;
    }
    const step = twoColumn ? 2 : 1;
    if (key.upArrow || key.pageUp) {
      const amount = key.pageUp ? Math.max(step, Math.floor(availHeight / 8) * step) : step;
      setSectionOffset((o) => Math.max(0, o - amount));
    }
    if (key.downArrow || key.pageDown) {
      const amount = key.pageDown ? Math.max(step, Math.floor(availHeight / 8) * step) : step;
      setSectionOffset((o) => Math.min(maxOffset, o + amount));
    }
    if (key.home) setSectionOffset(0);
    if (key.end) setSectionOffset(maxOffset);
  });

  const visibleCount = twoColumn ? Math.ceil(visibleSections.length / 2) : visibleSections.length;
  const totalCount = twoColumn ? Math.ceil(sections.length / 2) : sections.length;
  const scrollPos = twoColumn ? Math.floor(alignedOffset / 2) : alignedOffset;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin}>
      <Box marginBottom={1} height={1}>
        <Breadcrumb items={["Home", "Help"]} />
      </Box>

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {twoColumn ? renderTwoColumn(visibleSections) : renderOneColumn(visibleSections)}
      </Box>

      <Box marginTop={1} width="100%" justifyContent="space-between">
        <Box>
          <Text color={colors.textMuted}>Press </Text>
          <Text color={colors.purple} bold>esc</Text>
          <Text color={colors.textMuted}> to go back</Text>
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
          <Box flex={1} marginRight={right ? 1 : 0}>
            <StyledBox title={left.title} focused padding={1} borderColor={left.color}>
              <Box flexDirection="column">
                {left.rows.map((r) => (
                  <Row key={r.cmd} cmd={r.cmd} desc={r.desc} color={left.color} compact />
                ))}
              </Box>
            </StyledBox>
          </Box>
          {right && (
            <Box flex={1} marginLeft={1}>
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
      title: "Commands",
      color: colors.purple,
      rows: [
        { cmd: "discover", desc: "scan ports, Docker & daemons" },
        { cmd: "connections", desc: "manage saved connections" },
        { cmd: "dashboard", desc: "multi-service status, health & sparklines" },
        { cmd: "vault", desc: "unlock / create credential vault" },
        { cmd: "help", desc: "show this help screen" },
        { cmd: "back", desc: "go back to welcome" },
        { cmd: "quit", desc: "exit Qore" },
      ],
    },
    {
      title: "Docker Actions",
      color: colors.cyan,
      rows: [
        { cmd: "start", desc: "start selected container" },
        { cmd: "stop", desc: "stop selected container" },
        { cmd: "restart", desc: "restart selected container" },
        { cmd: "rm", desc: "remove selected container" },
        { cmd: "logs", desc: "view container logs" },
        { cmd: "inspect", desc: "inspect container details" },
        { cmd: "prune", desc: "remove stopped containers" },
        { cmd: "refresh", desc: "re-scan all resources" },
      ],
    },
    {
      title: "Connections",
      color: colors.purple,
      rows: [
        { cmd: "add", desc: "add a new connection" },
        { cmd: "connect <n>", desc: "connect to saved connection #n" },
        { cmd: "test <n>", desc: "test connection #n" },
        { cmd: "rm <n>", desc: "remove connection #n" },
        { cmd: "groups", desc: "view connection groups" },
        { cmd: "group <name>", desc: "create a new group" },
        { cmd: "group-add <name>", desc: "add selected conn to group" },
        { cmd: "group-rm <name>", desc: "remove a group" },
        { cmd: "group-open <name>", desc: "open all conns in group" },
        { cmd: "snippet <name>", desc: "create a command snippet" },
        { cmd: "snippets", desc: "list saved snippets" },
        { cmd: "run <name>", desc: "execute a saved snippet" },
        { cmd: "snippet-rm <name>", desc: "remove a snippet" },
      ],
    },
    {
      title: "Redis",
      color: colors.blue,
      rows: [
        { cmd: "get <key>", desc: "get value for key" },
        { cmd: "set <k> <v>", desc: "set key to value" },
        { cmd: "del <key>", desc: "delete a key" },
        { cmd: "keys <pattern>", desc: "list keys matching pattern" },
        { cmd: "flushdb", desc: "clear current database" },
      ],
    },
    {
      title: "S3",
      color: colors.blue,
      rows: [
        { cmd: "ls <bucket>", desc: "list objects in bucket" },
        { cmd: "mkbucket <name>", desc: "create a new bucket" },
        { cmd: "rmbucket <name>", desc: "delete a bucket" },
      ],
    },
    {
      title: "Postgres / MySQL / MongoDB",
      color: colors.green,
      rows: [
        { cmd: "tables <db>", desc: "list tables/collections" },
        { cmd: "desc <db> <table>", desc: "describe table structure" },
        { cmd: "count <db> <table>", desc: "count rows in table" },
        { cmd: "sample <db> <t> [n]", desc: "show sample rows (default 10)" },
        { cmd: "size <db>", desc: "table sizes in database" },
        { cmd: "indexes <db> <table>", desc: "list indexes" },
        { cmd: "views <db>", desc: "list views" },
        { cmd: "funcs <db>", desc: "list functions" },
        { cmd: "conns", desc: "active connections" },
        { cmd: "queries", desc: "running queries" },
        { cmd: "query <db> <sql>", desc: "run custom query" },
      ],
    },
    {
      title: "Git",
      color: colors.yellow,
      rows: [
        { cmd: "status", desc: "show staged, unstaged, untracked" },
        { cmd: "diff [--staged]", desc: "show working tree or staged diff" },
        { cmd: "log", desc: "commit graph with branch tree" },
        { cmd: "branches", desc: "list all branches with details" },
        { cmd: "checkout <b>", desc: "switch to branch" },
        { cmd: "branch <n>", desc: "create and switch to branch" },
        { cmd: "stage [f]", desc: "stage files or all changes" },
        { cmd: "commit <msg>", desc: "create a commit" },
        { cmd: "merge <b>", desc: "merge branch into current" },
        { cmd: "push [r] [b]", desc: "push to remote" },
        { cmd: "pull [r] [b]", desc: "pull from remote" },
        { cmd: "blame <f>", desc: "show blame for file" },
        { cmd: "tags", desc: "list tags" },
        { cmd: "exec <args>", desc: "run raw git command" },
      ],
    },
    {
      title: "SSH",
      color: colors.cyan,
      rows: [
        { cmd: "shell", desc: "open interactive terminal (bash)" },
        { cmd: "exec <cmd>", desc: "run command on remote server" },
        { cmd: "tail <file> [-f]", desc: "view or follow file" },
        { cmd: "edit <file>", desc: "edit file in nano/vim" },
        { cmd: "docker ps", desc: "list containers" },
        { cmd: "compose <cmd>", desc: "docker compose operations" },
        { cmd: "security-audit", desc: "run security audit" },
        { cmd: "snapshot", desc: "capture server state" },
      ],
    },
    {
      title: "Dashboard",
      color: colors.green,
      rows: [
        { cmd: "refresh", desc: "re-check all connections" },
        { cmd: "auto", desc: "toggle auto-refresh" },
      ],
    },
    {
      title: "Navigation Keys",
      color: colors.textMuted,
      rows: [
        { cmd: "Up/Dn", desc: "select item" },
        { cmd: "pg up/down", desc: "scroll one page" },
        { cmd: "tab", desc: "switch section" },
        { cmd: "Enter", desc: "execute typed command" },
        { cmd: "esc", desc: "back / close overlay" },
        { cmd: "^c", desc: "quit Qore" },
      ],
    },
  ];
}
