import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { StyledBox } from "./components/Box.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
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

export function HelpScreen({ onCommand }: HelpScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.05));

  const sections = useMemo(() => createSections(), []);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin} justifyContent="center">
      <Box marginBottom={1} height={1}>
        <Breadcrumb items={["Home", "Help"]} />
      </Box>

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
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

      <Box marginTop={1}>
        <Text color={colors.textMuted}>Press </Text>
        <Text color={colors.purple} bold>esc</Text>
        <Text color={colors.textMuted}> to go back</Text>
      </Box>
    </Box>
  );
}

function Row({ cmd, desc, color }: { cmd: string; desc: string; color: string }) {
  return (
    <Box justifyContent="space-between">
      <Text color={color} bold>{"  "}{cmd.padEnd(22)}</Text>
      <Text color={colors.textMuted}>{desc.slice(0, 50)}</Text>
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
