import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { colors } from "./theme.js";
import pkg from "../../package.json" with { type: "json" };
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { WelcomeScreen } from "./WelcomeScreen.js";
import { DiscoverScreen } from "./DiscoverScreen.js";
import { HelpScreen } from "./HelpScreen.js";
import { WikiScreen } from "./WikiScreen.js";
import { ConnectionsScreen } from "./ConnectionsScreen.js";
import { DashboardScreen } from "./DashboardScreen.js";
import { ServiceScreen } from "./ServiceScreen.js";
import { StatusBar } from "./components/StatusBar.js";
import { Orchestrator } from "../core/orchestrator.js";
import { Vault } from "../core/vault/vault.js";
import { SocketBridge } from "../core/vault/socket-bridge.js";
import type { ConnectionConfig } from "../core/vault/types.js";
import { CONNECTION_ICONS } from "../core/vault/types.js";
import type { ProbeResult } from "../core/types.js";

interface ActiveSession {
  sessionId: string;
  conn: ConnectionConfig;
}

type Screen = "welcome" | "discover" | "help" | "wiki" | "connections" | "service" | "dashboard";

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
  const [socketBridge, setSocketBridge] = useState<SocketBridge | null>(null);
  const [activeConns, setActiveConns] = useState<ActiveSession[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const sessionCounter = useRef(0);

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
        case "dashboard":
        case "dash":
          if (vault && vault.isUnlocked()) {
            setScreen("dashboard");
          } else {
            setScreen("connections");
          }
          break;
        case "back":
        case "home":
          if (screen === "service") {
            setScreen("connections");
          } else {
            setScreen("welcome");
          }
          break;
        case "help":
          setScreen("help");
          break;
        case "wiki":
        case "docs":
        case "book":
          setScreen("wiki");
          break;
        case "quit":
        case "exit":
          if (socketBridge) socketBridge.stop();
          if (vault) vault.lock();
          exit();
          process.exit(0);
          break;
        case "":
          break;
        default:
          break;
      }
    },
    [runDiscovery, exit, vault, socketBridge, screen]
  );

  const handleVaultUnlock = useCallback((v: Vault) => {
    setVault(v);
    const bridge = new SocketBridge(v);
    if (bridge.start()) {
      setSocketBridge(bridge);
    }
  }, []);

  const handleCloseConn = useCallback(() => {
    setActiveConns((conns) => {
      const remaining = conns.filter((_, i) => i !== activeIdx);
      if (remaining.length === 0) {
        setScreen("connections");
      } else {
        setActiveIdx(Math.max(0, activeIdx - 1));
      }
      return remaining;
    });
  }, [activeIdx]);

  const handleConnect = useCallback((conn: ConnectionConfig) => {
    sessionCounter.current += 1;
    const sessionId = `session-${sessionCounter.current}`;
    setActiveConns((prev) => {
      setActiveIdx(prev.length);
      return [...prev, { sessionId, conn }];
    });
    setScreen("service");
  }, []);

  useInput((input, key) => {
    // Only handle escape on help screen — DiscoverScreen manages its own escape
    if (key.escape && screen === "help") {
      setScreen("welcome");
    }
    if (key.ctrl && input === "c") {
      if (socketBridge) socketBridge.stop();
      if (vault) vault.lock();
      exit();
    }
    if (screen === "service" && activeConns.length > 1) {
      if ((key.ctrl && key.tab) || (key.shift && key.tab)) {
        setActiveIdx((i) => (i + 1) % activeConns.length);
      }
      if (key.leftArrow && key.ctrl) {
        setActiveIdx((i) => (i - 1 + activeConns.length) % activeConns.length);
      }
      if (key.rightArrow && key.ctrl) {
        setActiveIdx((i) => (i + 1) % activeConns.length);
      }
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
        {screen === "wiki" && <WikiScreen onBack={() => setScreen("welcome")} />}
        {screen === "connections" && (
          <ConnectionsScreen
            key={vault ? "unlocked" : "locked"}
            vault={vault}
            onVaultUnlock={handleVaultUnlock}
            onConnect={handleConnect}
            onBack={() => setScreen("welcome")}
            activeConns={activeConns}
          />
        )}
        {screen === "dashboard" && vault && vault.isUnlocked() && (
          <DashboardScreen
            vault={vault}
            onConnect={handleConnect}
            onBack={() => setScreen("welcome")}
          />
        )}
        {screen === "service" && activeConns.length > 0 && (
          <>
            {activeConns.length > 1 && (
              <Box flexDirection="column" width={termWidth} flexShrink={0}>
                <Box flexDirection="row" height={1} width={termWidth} overflow="hidden">
                  {activeConns.map((s, i) => (
                    <Box key={s.sessionId} marginRight={1}>
                      <Text color={i === activeIdx ? colors.purpleBright : colors.textMuted}>
                        {i === activeIdx ? "▸ " : "  "}{CONNECTION_ICONS[s.conn.type]} {s.conn.name}
                        {i === activeIdx ? " ◂" : ""}
                      </Text>
                    </Box>
                  ))}
                </Box>
                <Box height={1} width={termWidth} overflow="hidden">
                  <Text color={colors.textDim}> {"Ctrl+Tab switch · close to close tab · back for connections"}</Text>
                </Box>
              </Box>
            )}
            {activeConns.map((s, i) => (
              <Box
                key={s.sessionId}
                display={i === activeIdx ? "flex" : "none"}
                width={termWidth}
                overflow="hidden"
              >
                <ServiceScreen
                  conn={s.conn}
                  onBack={() => setScreen("connections")}
                  onClose={handleCloseConn}
                  onNewSession={() => handleConnect(s.conn)}
                  tabCount={activeConns.length}
                  tabIdx={i}
                  focused={i === activeIdx}
                  heightOffset={4 + (activeConns.length > 1 ? 2 : 0)}
                />
              </Box>
            ))}
          </>
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
