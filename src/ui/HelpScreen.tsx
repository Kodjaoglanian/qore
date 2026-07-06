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
        { cmd: "discover (containers)", desc: "scan ports, Docker & daemons" },
        { cmd: "connections (conn, vault)", desc: "manage saved connections & vault" },
        { cmd: "dashboard (dash)", desc: "multi-service status & health checks" },
        { cmd: "help", desc: "show this help screen" },
        { cmd: "back (home)", desc: "go back to previous screen" },
        { cmd: "quit (exit)", desc: "exit Qore" },
      ],
    },
    {
      title: "Connections",
      color: colors.purple,
      rows: [
        { cmd: "add", desc: "add a new connection" },
        { cmd: "connect <n>", desc: "connect to saved connection #n" },
        { cmd: "test <n>", desc: "test connection #n" },
        { cmd: "edit <n>", desc: "edit connection #n" },
        { cmd: "rm <n>", desc: "remove connection #n" },
        { cmd: "refresh", desc: "reload connection list" },
        { cmd: "groups", desc: "view & manage connection groups" },
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
      title: "Vault",
      color: colors.purpleDim,
      rows: [
        { cmd: "changepw", desc: "change vault master password" },
        { cmd: "export", desc: "export connections as encrypted bundle" },
        { cmd: "import", desc: "import connections from encrypted bundle" },
      ],
    },
    {
      title: "Favorites & Snippets",
      color: colors.yellow,
      rows: [
        { cmd: "star <cmd>", desc: "save command to favorites" },
        { cmd: "unstar <cmd>", desc: "remove command from favorites" },
        { cmd: "favorites", desc: "list starred commands" },
        { cmd: "snippet <name>", desc: "record a multi-command snippet" },
        { cmd: "snippets", desc: "list saved snippets" },
        { cmd: "run <name>", desc: "execute a saved snippet" },
        { cmd: "snippet-rm <name>", desc: "delete a snippet" },
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
      title: "Redis",
      color: colors.blue,
      rows: [
        { cmd: "get <key>", desc: "get value for key" },
        { cmd: "set <k> <v>", desc: "set key to value" },
        { cmd: "del <key>", desc: "delete a key" },
        { cmd: "keys <pattern>", desc: "list keys matching pattern" },
        { cmd: "flushdb", desc: "clear current database" },
        { cmd: "info", desc: "show Redis server info" },
      ],
    },
    {
      title: "S3",
      color: colors.blue,
      rows: [
        { cmd: "ls <bucket>", desc: "list objects in bucket" },
        { cmd: "mkbucket <name>", desc: "create a new bucket" },
        { cmd: "rmbucket <name>", desc: "delete a bucket" },
        { cmd: "upload <local> <bk/key>", desc: "upload file to bucket" },
        { cmd: "download <bk/key> <local>", desc: "download file from bucket" },
        { cmd: "rm <bucket> <key>", desc: "delete an object" },
        { cmd: "presign <bucket> <key>", desc: "generate pre-signed URL" },
        { cmd: "info", desc: "show S3 connection info" },
      ],
    },
    {
      title: "HTTP",
      color: colors.cyan,
      rows: [
        { cmd: "get <path>", desc: "send GET request" },
        { cmd: "post <path> [body]", desc: "send POST request with body" },
        { cmd: "put <path> [body]", desc: "send PUT request with body" },
        { cmd: "patch <path> [body]", desc: "send PATCH request with body" },
        { cmd: "delete <path>", desc: "send DELETE request" },
        { cmd: "info", desc: "show HTTP connection info" },
        { cmd: "logs", desc: "view request logs" },
      ],
    },
    {
      title: "Database (Postgres / MySQL / Mongo)",
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
        { cmd: "query <db> <sql>", desc: "run custom SQL query" },
        { cmd: "export <db> <table>", desc: "export table to CSV" },
        { cmd: "explain <db> <sql>", desc: "show query execution plan" },
        { cmd: "slow-queries", desc: "list slow running queries" },
        { cmd: "logs", desc: "view database logs" },
      ],
    },
    {
      title: "Git",
      color: colors.yellow,
      rows: [
        { cmd: "status", desc: "show staged, unstaged, untracked files" },
        { cmd: "diff [--staged]", desc: "show working tree or staged diff" },
        { cmd: "log (graph)", desc: "commit graph with branch tree" },
        { cmd: "branches", desc: "list all branches with details" },
        { cmd: "checkout <b>", desc: "switch to branch" },
        { cmd: "branch <n>", desc: "create and switch to new branch" },
        { cmd: "branch -d <n>", desc: "delete a branch" },
        { cmd: "stage (add) [f]", desc: "stage files or all changes" },
        { cmd: "unstage (reset) [f]", desc: "unstage files" },
        { cmd: "commit <msg>", desc: "create a commit" },
        { cmd: "amend [msg]", desc: "amend last commit" },
        { cmd: "merge <b>", desc: "merge branch into current" },
        { cmd: "rebase <b>", desc: "rebase onto branch" },
        { cmd: "fetch [remote]", desc: "fetch from remote" },
        { cmd: "pull [r] [b]", desc: "pull from remote" },
        { cmd: "push [r] [b]", desc: "push to remote" },
        { cmd: "cherry-pick <h>", desc: "cherry-pick a commit" },
        { cmd: "revert <h>", desc: "revert a commit" },
        { cmd: "blame <f>", desc: "show blame for file" },
        { cmd: "tags", desc: "list tags" },
        { cmd: "tag <n> [msg]", desc: "create a tag" },
        { cmd: "remotes", desc: "list remotes" },
        { cmd: "remote-add <n> <url>", desc: "add a remote" },
        { cmd: "exec <args>", desc: "run raw git command" },
      ],
    },
    {
      title: "SSH",
      color: colors.cyan,
      rows: [
        { cmd: "shell", desc: "open interactive bash terminal" },
        { cmd: "exec <cmd>", desc: "run command on remote server" },
        { cmd: "sysinfo", desc: "show system information" },
        { cmd: "disk", desc: "show disk usage (df -h)" },
        { cmd: "mem", desc: "show memory usage (free)" },
        { cmd: "procs", desc: "show running processes" },
        { cmd: "net", desc: "show network connections" },
        { cmd: "ports", desc: "list listening ports" },
        { cmd: "firewall [status|allow|deny]", desc: "UFW firewall management" },
        { cmd: "top", desc: "top processes by CPU" },
        { cmd: "netstat", desc: "active network connections" },
        { cmd: "tail <f> [-f]", desc: "view or follow file" },
        { cmd: "edit <f>", desc: "edit file in nano/vim" },
        { cmd: "ls [path]", desc: "list directory contents" },
        { cmd: "cat <file>", desc: "view file contents" },
        { cmd: "find <p> [path]", desc: "search for files" },
        { cmd: "du [path]", desc: "directory disk usage" },
        { cmd: "services", desc: "list running services" },
        { cmd: "svc <a> <n>", desc: "service control (start/stop/restart)" },
        { cmd: "users", desc: "show logged-in users" },
        { cmd: "cron", desc: "show crontab" },
        { cmd: "env", desc: "show environment variables" },
        { cmd: "pkgs [search]", desc: "list or search packages" },
        { cmd: "kill <pid> [sig]", desc: "kill a process" },
        { cmd: "ping <host>", desc: "ping a host" },
        { cmd: "upload <local> <remote>", desc: "SFTP upload file" },
        { cmd: "download <remote> <local>", desc: "SFTP download file" },
        { cmd: "deploy <script>", desc: "run deploy script" },
        { cmd: "git-status", desc: "find git repos and show status" },
        { cmd: "compose <action>", desc: "Docker Compose management" },
        { cmd: "docker <cmd>", desc: "Docker container management" },
        { cmd: "security-audit", desc: "8-point security checklist" },
        { cmd: "snapshot", desc: "capture server state snapshot" },
        { cmd: "diff <s1> <s2>", desc: "compare two snapshots" },
        { cmd: "snapshots", desc: "list saved snapshots" },
        { cmd: "logs [service]", desc: "view system or docker logs" },
        { cmd: "reboot / shutdown", desc: "restart or power off server" },
      ],
    },
    {
      title: "Dashboard & Health",
      color: colors.green,
      rows: [
        { cmd: "refresh", desc: "re-check all connections" },
        { cmd: "auto", desc: "toggle auto-refresh (10s interval)" },
        { cmd: "monitor <n>", desc: "toggle health monitoring for conn #n" },
        { cmd: "interval <s>", desc: "set health check interval (5-3600s)" },
        { cmd: "clear", desc: "clear health history" },
        { cmd: "connect <n>", desc: "open connection #n from dashboard" },
      ],
    },
    {
      title: "Tab Management",
      color: colors.textMuted,
      rows: [
        { cmd: "close (disconnect)", desc: "close current tab & disconnect" },
        { cmd: "new (new-session)", desc: "open duplicate session of same conn" },
        { cmd: "back (home)", desc: "return to connections screen" },
        { cmd: "Ctrl+Tab / Ctrl+Arrows", desc: "switch between open tabs" },
      ],
    },
    {
      title: "Navigation Keys",
      color: colors.textMuted,
      rows: [
        { cmd: "↑/↓", desc: "select item / scroll sections" },
        { cmd: "PgUp/PgDn", desc: "scroll one page" },
        { cmd: "Home/End", desc: "jump to first/last section" },
        { cmd: "Tab", desc: "autocomplete command" },
        { cmd: "Enter", desc: "execute typed command" },
        { cmd: "Esc", desc: "back / close overlay" },
        { cmd: "^C", desc: "quit Qore" },
      ],
    },
  ];
}
