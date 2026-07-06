import React, { useEffect } from "react";
import { Box, Text } from "ink";
import { Logo } from "./components/Logo.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { setMouseHandler } from "./mouseBus.js";

interface WelcomeScreenProps {
  onCommand: (cmd: string) => void;
  vaultUnlocked?: boolean;
}

export function WelcomeScreen({ onCommand, vaultUnlocked }: WelcomeScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(2, Math.floor(termWidth * 0.08));
  const innerWidth = Math.max(40, termWidth - margin * 2);

  const commands = [
    { cmd: "discover", desc: "scan ports, Docker & daemons", color: colors.cyan },
    { cmd: "connections", desc: "vault & manage Redis, Postgres, MySQL, Mongo, S3, HTTP, SSH, Git, VMware", color: colors.purple },
    { cmd: "dashboard", desc: "multi-service status, health & sparklines", color: colors.green },
    { cmd: "wiki", desc: "Qore documentation (wiki book)", color: colors.blue },
    { cmd: "help", desc: "show all commands & shortcuts", color: colors.blue },
    { cmd: "quit", desc: "exit Qore", color: colors.red },
  ];

  useEffect(() => {
    setMouseHandler((event) => {
      if (event.type !== "click") return;
      const logoH = 16;
      const headerRows = 2 + logoH + 3;
      const totalContent = 32;
      const centerOff = Math.max(0, Math.floor((termHeight - 4 - totalContent) / 2));
      const listStartY = headerRows + centerOff;
      const idx = event.y - listStartY;
      if (idx >= 0 && idx < commands.length) {
        onCommand(commands[idx].cmd);
      }
    });
    return () => setMouseHandler(null);
  }, [termHeight, onCommand]);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" justifyContent="center">
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Logo />
      </Box>

      <Box flexDirection="column" marginX={margin} marginBottom={1}>
        <Box marginBottom={1}>
          <Breadcrumb items={["Home"]} />
        </Box>

        <Box flexDirection="column">
          {commands.map((c) => (
            <Box key={c.cmd} flexDirection="row" marginBottom={0}>
              <Text color={c.color}>{"  > "}</Text>
              <Text color={colors.purple} bold>{c.cmd.padEnd(14)}</Text>
              <Text color={colors.textMuted}>{"  — "}{c.desc}</Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Text color={colors.textDim}>
            {"  In Discover: "}<Text color={colors.purple}>start</Text>{" · "}<Text color={colors.purple}>stop</Text>{" · "}<Text color={colors.purple}>restart</Text>{" · "}<Text color={colors.purple}>rm</Text>{" · "}<Text color={colors.purple}>logs</Text>{" · "}<Text color={colors.purple}>inspect</Text>
          </Text>
        </Box>

        {vaultUnlocked !== undefined && (
          <Box marginTop={0}>
            <Text color={colors.textDim}>
              {"  Vault: "}<Text color={vaultUnlocked ? colors.green : colors.textMuted} bold>{vaultUnlocked ? "[unlocked]" : "[locked]"}</Text>
            </Text>
          </Box>
        )}
      </Box>

      <Box marginX={margin} marginBottom={1}>
        <InputBar onSubmit={onCommand} placeholder="discover · connections · dashboard · wiki · help · quit" />
      </Box>

      <Box marginX={margin}>
        <ShortcutBar
          shortcuts={[
            { key: "Enter", label: "execute" },
            { key: "^c", label: "quit" },
            { key: "tab", label: "autocomplete" },
          ]}
        />
      </Box>
    </Box>
  );
}
