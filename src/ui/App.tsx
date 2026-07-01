import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { colors } from "./theme.js";
import pkg from "../../package.json" with { type: "json" };
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { WelcomeScreen } from "./WelcomeScreen.js";
import { DiscoverScreen } from "./DiscoverScreen.js";
import { HelpScreen } from "./HelpScreen.js";
import { ConnectionsScreen } from "./ConnectionsScreen.js";
import { ServiceScreen } from "./ServiceScreen.js";
import { StatusBar } from "./components/StatusBar.js";
import { Orchestrator } from "../core/orchestrator.js";
import { Vault } from "../core/vault/vault.js";
import type { ConnectionConfig } from "../core/vault/types.js";
import type { ProbeResult } from "../core/types.js";

type Screen = "welcome" | "discover" | "help" | "connections" | "service";

export function App() {
  const { exit } = useApp();
  const { setRawMode } = useStdin();
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [dockerStatus, setDockerStatus] = useState<"connected" | "disconnected" | "scanning">("disconnected");
  const [orchestrator] = useState(() => new Orchestrator());
  const [vault, setVault] = useState<Vault | null>(null);
  const [activeConn, setActiveConn] = useState<ConnectionConfig | null>(null);

  useEffect(() => {
    setRawMode(true);
    orchestrator.isDockerAvailable().then((avail) => {
      setDockerStatus(avail ? "connected" : "disconnected");
    });
  }, []);

  const runDiscovery = useCallback(async () => {
    setScanning(true);
    setDockerStatus("scanning");
    try {
      const result = await orchestrator.runProbe();
      setProbe(result);
      setDockerStatus(result.dockerInfo ? "connected" : "disconnected");
    } catch {
      // never crash the TUI
    } finally {
      setScanning(false);
    }
  }, [orchestrator]);

  const handleCommand = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim().toLowerCase();
      const command = trimmed.split(/\s+/)[0];

      switch (command) {
        case "discover":
        case "containers":
          setScreen("discover");
          runDiscovery();
          break;
        case "connections":
        case "conn":
        case "vault":
          setScreen("connections");
          break;
        case "back":
        case "home":
          if (screen === "service") {
            setActiveConn(null);
            setScreen("connections");
          } else {
            setScreen("welcome");
          }
          break;
        case "help":
          setScreen("help");
          break;
        case "quit":
        case "exit":
          if (vault) vault.lock();
          exit();
          break;
        case "":
          break;
        default:
          break;
      }
    },
    [runDiscovery, exit, vault, screen]
  );

  const handleVaultUnlock = useCallback((v: Vault) => {
    setVault(v);
  }, []);

  const handleConnect = useCallback((conn: ConnectionConfig) => {
    setActiveConn(conn);
    setScreen("service");
  }, []);

  useInput((input, key) => {
    // Only handle escape on help screen — DiscoverScreen manages its own escape
    if (key.escape && screen === "help") {
      setScreen("welcome");
    }
    if (key.ctrl && input === "c") {
      if (vault) vault.lock();
      exit();
    }
  });

  const portCount = probe?.ports.length ?? 0;
  const containerCount = probe?.containers.length ?? 0;

  const contentHeight = Math.max(3, termHeight - 4);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} overflow="hidden">
      <StatusBar
        mode={screen.charAt(0).toUpperCase() + screen.slice(1)}
        dockerStatus={dockerStatus}
        portCount={portCount}
        containerCount={containerCount}
        storageProvider={vault?.isUnlocked() ? "Vault [on]" : "--"}
        vaultUnlocked={vault?.isUnlocked()}
      />
      <Box width={termWidth} height={1}>
        <Text color={colors.borderMuted}>{"─".repeat(termWidth)}</Text>
      </Box>

      <Box flexDirection="column" width={termWidth} height={contentHeight} overflow="hidden">
        {screen === "welcome" && <WelcomeScreen onCommand={handleCommand} vaultUnlocked={vault?.isUnlocked()} />}
        {screen === "discover" && (
          <DiscoverScreen probe={probe} scanning={scanning} onCommand={handleCommand} onRefresh={runDiscovery} />
        )}
        {screen === "help" && <HelpScreen onCommand={handleCommand} />}
        {screen === "connections" && (
          <ConnectionsScreen
            vault={vault}
            onVaultUnlock={handleVaultUnlock}
            onConnect={handleConnect}
            onBack={() => setScreen("welcome")}
          />
        )}
        {screen === "service" && activeConn && (
          <ServiceScreen conn={activeConn} onBack={() => { setActiveConn(null); setScreen("connections"); }} />
        )}
      </Box>

      <Box width={termWidth} height={1}>
        <Text color={colors.borderMuted}>{"─".repeat(termWidth)}</Text>
      </Box>
      <Box width={termWidth} height={1} paddingX={1} justifyContent="space-between">
        <Text color={colors.purpleDim}>Qore</Text>
        <Text color={colors.textMuted}>v{pkg.version}</Text>
        <Text color={colors.borderMuted}>│</Text>
        <Text color={colors.textMuted}>Vault {vault?.isUnlocked() ? "[unlocked]" : "[locked]"}</Text>
      </Box>
    </Box>
  );
}
