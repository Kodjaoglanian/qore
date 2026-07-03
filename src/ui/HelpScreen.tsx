import React from "react";
import { Box, Text, useInput } from "ink";
import { StyledBox } from "./components/Box.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";

interface HelpScreenProps {
  onCommand: (cmd: string) => void;
}

export function HelpScreen({ onCommand }: HelpScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.05));

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onCommand("back");
    }
  });

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin} justifyContent="center">
      <Box marginBottom={1} height={1}>
        <Breadcrumb items={["Home", "Help"]} />
      </Box>

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <StyledBox title="Commands" focused padding={1} marginBottom={1}>
          <Box flexDirection="column">
            <CmdRow cmd="discover" desc="scan ports, Docker & daemons" />
            <CmdRow cmd="connections" desc="manage saved connections" />
            <CmdRow cmd="dashboard" desc="multi-service status overview" />
            <CmdRow cmd="health" desc="health checks with history & sparklines" />
            <CmdRow cmd="vault" desc="unlock / create credential vault" />
            <CmdRow cmd="help" desc="show this help screen" />
            <CmdRow cmd="back" desc="go back to welcome" />
            <CmdRow cmd="quit" desc="exit Qore" />
          </Box>
        </StyledBox>

        <StyledBox title="Docker Actions" focused={false} padding={1} marginBottom={1}>
          <Box flexDirection="column">
            <CmdRow cmd="start" desc="start selected container" />
            <CmdRow cmd="stop" desc="stop selected container" />
            <CmdRow cmd="restart" desc="restart selected container" />
            <CmdRow cmd="rm" desc="remove selected container" />
            <CmdRow cmd="logs" desc="view container logs" />
            <CmdRow cmd="inspect" desc="inspect container details" />
            <CmdRow cmd="prune" desc="remove stopped containers" />
            <CmdRow cmd="refresh" desc="re-scan all resources" />
          </Box>
        </StyledBox>

        <StyledBox title="Connections" focused={false} padding={1} marginBottom={1}>
          <Box flexDirection="column">
            <CmdRow cmd="add" desc="add a new connection" />
            <CmdRow cmd="connect <n>" desc="connect to saved connection #n" />
            <CmdRow cmd="test <n>" desc="test connection #n" />
            <CmdRow cmd="rm <n>" desc="remove connection #n" />
            <CmdRow cmd="groups" desc="view connection groups" />
            <CmdRow cmd="group <name>" desc="create a new group" />
            <CmdRow cmd="group-add <name>" desc="add selected conn to group" />
            <CmdRow cmd="group-rm <name>" desc="remove a group" />
            <CmdRow cmd="group-open <name>" desc="open all conns in group" />
            <CmdRow cmd="snippet <name>" desc="create a command snippet" />
            <CmdRow cmd="snippets" desc="list saved snippets" />
            <CmdRow cmd="run <name>" desc="execute a saved snippet" />
            <CmdRow cmd="snippet-rm <name>" desc="remove a snippet" />
          </Box>
        </StyledBox>

        <StyledBox title="Redis" focused={false} padding={1} marginBottom={1}>
          <Box flexDirection="column">
            <CmdRow cmd="get <key>" desc="get value for key" />
            <CmdRow cmd="set <k> <v>" desc="set key to value" />
            <CmdRow cmd="del <key>" desc="delete a key" />
            <CmdRow cmd="keys <pattern>" desc="list keys matching pattern" />
            <CmdRow cmd="flushdb" desc="clear current database" />
          </Box>
        </StyledBox>

        <StyledBox title="S3" focused={false} padding={1} marginBottom={1}>
          <Box flexDirection="column">
            <CmdRow cmd="ls <bucket>" desc="list objects in bucket" />
            <CmdRow cmd="mkbucket <name>" desc="create a new bucket" />
            <CmdRow cmd="rmbucket <name>" desc="delete a bucket" />
          </Box>
        </StyledBox>

        <StyledBox title="Postgres / MySQL / MongoDB" focused={false} padding={1} marginBottom={1}>
          <Box flexDirection="column">
            <CmdRow cmd="tables <db>" desc="list tables/collections" />
            <CmdRow cmd="desc <db> <table>" desc="describe table structure" />
            <CmdRow cmd="count <db> <table>" desc="count rows in table" />
            <CmdRow cmd="sample <db> <t> [n]" desc="show sample rows (default 10)" />
            <CmdRow cmd="size <db>" desc="table sizes in database" />
            <CmdRow cmd="indexes <db> <table>" desc="list indexes" />
            <CmdRow cmd="views <db>" desc="list views" />
            <CmdRow cmd="funcs <db>" desc="list functions" />
            <CmdRow cmd="conns" desc="active connections" />
            <CmdRow cmd="queries" desc="running queries" />
            <CmdRow cmd="query <db> <sql>" desc="run custom query" />
          </Box>
        </StyledBox>

        <StyledBox title="Git" focused={false} padding={1} marginBottom={1}>
          <Box flexDirection="column">
            <CmdRow cmd="status" desc="show staged, unstaged, untracked" />
            <CmdRow cmd="diff [--staged]" desc="show working tree or staged diff" />
            <CmdRow cmd="log" desc="commit graph with branch tree" />
            <CmdRow cmd="branches" desc="list all branches with details" />
            <CmdRow cmd="checkout <b>" desc="switch to branch" />
            <CmdRow cmd="branch <n>" desc="create and switch to branch" />
            <CmdRow cmd="stage [f]" desc="stage files or all changes" />
            <CmdRow cmd="commit <msg>" desc="create a commit" />
            <CmdRow cmd="merge <b>" desc="merge branch into current" />
            <CmdRow cmd="push [r] [b]" desc="push to remote" />
            <CmdRow cmd="pull [r] [b]" desc="pull from remote" />
            <CmdRow cmd="blame <f>" desc="show blame for file" />
            <CmdRow cmd="tags" desc="list tags" />
            <CmdRow cmd="exec <args>" desc="run raw git command" />
          </Box>
        </StyledBox>

        <StyledBox title="SSH" focused={false} padding={1} marginBottom={1}>
          <Box flexDirection="column">
            <CmdRow cmd="shell" desc="open interactive terminal (bash)" />
            <CmdRow cmd="exec <cmd>" desc="run command on remote server" />
            <CmdRow cmd="tail <file> [-f]" desc="view or follow file" />
            <CmdRow cmd="edit <file>" desc="edit file in nano/vim" />
            <CmdRow cmd="docker ps" desc="list containers" />
            <CmdRow cmd="compose <cmd>" desc="docker compose operations" />
            <CmdRow cmd="security-audit" desc="run security audit" />
            <CmdRow cmd="snapshot" desc="capture server state" />
          </Box>
        </StyledBox>

        <StyledBox title="Dashboard & Health" focused={false} padding={1} marginBottom={1}>
          <Box flexDirection="column">
            <CmdRow cmd="refresh" desc="re-check all connections" />
            <CmdRow cmd="auto" desc="toggle auto-refresh (dashboard)" />
            <CmdRow cmd="monitor" desc="toggle monitoring (health)" />
            <CmdRow cmd="interval <s>" desc="set check interval (health)" />
            <CmdRow cmd="clear" desc="clear health history" />
          </Box>
        </StyledBox>

        <StyledBox title="Navigation Keys" focused={false} padding={1}>
          <Box flexDirection="column">
            <KeyRow keyLabel="Up/Dn" desc="select item" />
            <KeyRow keyLabel="pg up/down" desc="scroll one page" />
            <KeyRow keyLabel="tab" desc="switch section" />
            <KeyRow keyLabel="Enter" desc="execute typed command" />
            <KeyRow keyLabel="esc" desc="back / close overlay" />
            <KeyRow keyLabel="^c" desc="quit Qore" />
          </Box>
        </StyledBox>
      </Box>

      <Box marginTop={1}>
        <Text color={colors.textMuted}>Press </Text>
        <Text color={colors.purple} bold>esc</Text>
        <Text color={colors.textMuted}> to go back</Text>
      </Box>
    </Box>
  );
}

function CmdRow({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <Box justifyContent="space-between">
      <Text color={colors.purple} bold>{"  "}{cmd.padEnd(18)}</Text>
      <Text color={colors.textMuted}>{desc.slice(0, 45)}</Text>
    </Box>
  );
}

function KeyRow({ keyLabel, desc }: { keyLabel: string; desc: string }) {
  return (
    <Box justifyContent="space-between">
      <Text color={colors.purple} bold>{"  "}{keyLabel.padEnd(14)}</Text>
      <Text color={colors.textMuted}>{desc.slice(0, 45)}</Text>
    </Box>
  );
}
