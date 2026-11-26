import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { colors, setActiveTheme, cycleTheme, getActiveTheme, THEME_NAMES, THEMES } from "./theme.js";
import pkg from "../../package.json" with { type: "json" };
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { WelcomeScreen } from "./WelcomeScreen.js";
import { DiscoverScreen } from "./DiscoverScreen.js";
import { HelpScreen } from "./HelpScreen.js";
import { WikiScreen } from "./WikiScreen.js";
import { ConnectionsScreen } from "./ConnectionsScreen.js";
import { DashboardScreen } from "./DashboardScreen.js";
import { HealthScreen } from "./HealthScreen.js";
import { StorageScreen } from "./StorageScreen.js";
import { ProvidersScreen } from "./ProvidersScreen.js";
import { ServiceScreen } from "./ServiceScreen.js";
import { StatusBar } from "./components/StatusBar.js";
import { CommandPalette, type PaletteItem } from "./components/CommandPalette.js";
import { Orchestrator } from "../core/orchestrator.js";
import { Vault } from "../core/vault/vault.js";
import { SocketBridge } from "../core/vault/socket-bridge.js";
import { loadConfig, saveConfig, type ThemeName } from "../core/config.js";
import { LocalS3Provider } from "../core/providers/localS3.js";
import { AwsS3Provider } from "../core/providers/awsS3.js";
import { LocalPubSub } from "../core/providers/messaging.js";
import type { ConnectionConfig } from "../core/vault/types.js";
import { CONNECTION_ICONS } from "../core/vault/types.js";
import type { ProbeResult, ProviderType, StorageProvider, MessagingProvider } from "../core/types.js";

interface ActiveSession {
  sessionId: string;
  conn: ConnectionConfig;
}

type Screen =
  | "welcome"
  | "discover"
  | "help"
  | "wiki"
  | "connections"
  | "service"
  | "dashboard"
  | "health"
  | "storage"
  | "providers";

const SCREEN_TITLES: Record<Screen, string> = {
  welcome: "Home",
  discover: "Discover",
  help: "Help",
  wiki: "Wiki",
  connections: "Connections",
  service: "Service",
  dashboard: "Dashboard",
  health: "Health",
  storage: "Storage",
  providers: "Providers",
};

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [ptyActive, setPtyActive] = useState(false);
  const [themeTick, setThemeTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // Hybrid providers state
  const [storageType, setStorageType] = useState<ProviderType>("local");
  const [messagingType, setMessagingType] = useState<ProviderType>("local");
  const localS3Ref = useRef<LocalS3Provider | null>(null);
  const awsS3Ref = useRef<AwsS3Provider | null>(null);
  const localPubSubRef = useRef<LocalPubSub | null>(null);

  const sessionCounter = useRef(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const getStorageProvider = useCallback((): StorageProvider => {
    if (storageType === "aws") {
      if (!awsS3Ref.current) awsS3Ref.current = new AwsS3Provider();
      return awsS3Ref.current;
    }
    if (!localS3Ref.current) localS3Ref.current = new LocalS3Provider();
    return localS3Ref.current;
  }, [storageType]);

  const getMessagingProvider = useCallback((): MessagingProvider => {
    if (!localPubSubRef.current) localPubSubRef.current = new LocalPubSub();
    return localPubSubRef.current;
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

  useEffect(() => {
    try {
      setRawMode(true);
    } catch {
      // ignore if terminal does not support raw mode
    }
    const cfg = loadConfig();
    if (cfg.theme && THEME_NAMES.includes(cfg.theme)) {
      setActiveTheme(cfg.theme);
      setThemeTick((t) => t + 1);
    }
    if (cfg.autoProbeOnStart) {
      runDiscovery();
    } else {
      orchestrator.isDockerAvailable().then((avail) => {
        setDockerStatus(avail ? "connected" : "disconnected");
      });
    }
  }, []);

  const applyTheme = useCallback((name?: string) => {
    if (name && THEME_NAMES.includes(name as ThemeName)) {
      setActiveTheme(name as ThemeName);
      saveConfig({ theme: name as ThemeName });
      setThemeTick((t) => t + 1);
      showToast(`Theme: ${THEMES[name as ThemeName].label}`);
    } else {
      const next = cycleTheme();
      saveConfig({ theme: next });
      setThemeTick((t) => t + 1);
      showToast(`Theme: ${THEMES[next].label}`);
    }
  }, [showToast]);

  const shutdownApp = useCallback(() => {
    if (socketBridge) socketBridge.stop();
    if (vault) vault.lock();
    localS3Ref.current?.close();
    try {
      setRawMode(false);
      if (typeof process.stdin.setRawMode === "function") process.stdin.setRawMode(false);
      if (typeof process.stdin.pause === "function") process.stdin.pause();
    } catch {}
    exit();
    process.exit(0);
  }, [socketBridge, vault, setRawMode, exit]);

  const lockVault = useCallback(() => {
    if (socketBridge) {
      socketBridge.stop();
      setSocketBridge(null);
    }
    if (vault) {
      vault.lock();
      setVault(null);
      setActiveConns([]);
      setScreen("welcome");
      showToast("Vault locked");
    }
  }, [socketBridge, vault, showToast]);

  const handleCommand = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim().toLowerCase();
      const parts = trimmed.split(/\s+/);
      const command = parts[0];

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
            showToast("Unlock vault to view Dashboard");
            setScreen("connections");
          }
          break;
        case "health":
          if (vault && vault.isUnlocked()) {
            setScreen("health");
          } else {
            showToast("Unlock vault to view Health Monitor");
            setScreen("connections");
          }
          break;
        case "storage":
        case "s3":
          setScreen("storage");
          break;
        case "providers":
        case "provider":
          setScreen("providers");
          break;
        case "theme":
          applyTheme(parts[1]);
          break;
        case "lock":
          lockVault();
          break;
        case "refresh":
          runDiscovery();
          showToast("Refreshing local telemetry...");
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
          shutdownApp();
          break;
        case "":
          break;
        default:
          break;
      }
    },
    [runDiscovery, exit, vault, socketBridge, screen, applyTheme, lockVault, showToast]
  );

  const handleVaultUnlock = useCallback((v: Vault) => {
    setVault(v);
    const bridge = new SocketBridge(v);
    if (bridge.start()) {
      setSocketBridge(bridge);
    }
    showToast("Vault unlocked");
  }, [showToast]);

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

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [
      { id: "nav-home", label: "Home", category: "Screen", description: "Welcome & live telemetry", icon: "◈", color: colors.purpleBright, action: () => setScreen("welcome") },
      { id: "nav-discover", label: "Discover", category: "Screen", description: "Scan ports, Docker, processes & services", icon: "◆", color: colors.cyan, action: () => { setScreen("discover"); runDiscovery(); } },
      { id: "nav-connections", label: "Connections & Vault", category: "Screen", description: "Manage saved services & credentials", icon: "◈", color: colors.purple, action: () => setScreen("connections") },
      { id: "nav-dashboard", label: "Dashboard", category: "Screen", description: "Multi-service live status overview", icon: "▣", color: colors.green, action: () => handleCommand("dashboard") },
      { id: "nav-health", label: "Health Monitor", category: "Screen", description: "Sparklines, latency & uptime %", icon: "♥", color: colors.cyan, action: () => handleCommand("health") },
      { id: "nav-storage", label: "Storage (S3)", category: "Screen", description: "Local Emulated S3 & AWS buckets", icon: "▤", color: colors.blue, action: () => setScreen("storage") },
      { id: "nav-providers", label: "Hybrid Providers", category: "Screen", description: "Switch Storage & Pub/Sub providers", icon: "⇄", color: colors.yellow, action: () => setScreen("providers") },
      { id: "nav-wiki", label: "Wiki Documentation", category: "Screen", description: "Built-in Qore documentation book", icon: "▥", color: colors.blue, action: () => setScreen("wiki") },
      { id: "nav-help", label: "Help Reference", category: "Screen", description: "Searchable command cheat sheet", icon: "?", color: colors.purple, action: () => setScreen("help") },
      { id: "act-refresh", label: "Refresh Probe", category: "Action", description: "Re-scan local host, ports & Docker", icon: "⟳", color: colors.cyan, action: () => handleCommand("refresh") },
    ];

    if (vault && vault.isUnlocked()) {
      for (const conn of vault.getConnections()) {
        items.push({
          id: `conn-${conn.id}`,
          label: conn.name,
          category: conn.type.toUpperCase(),
          description: `Connect to ${conn.host}:${conn.port}`,
          icon: CONNECTION_ICONS[conn.type] ?? "●",
          color: colors.green,
          action: () => handleConnect(conn),
        });
      }
      items.push({
        id: "act-lock",
        label: "Lock Vault",
        category: "Action",
        description: "Zero encryption key & close sessions",
        icon: "○",
        color: colors.yellow,
        action: lockVault,
      });
    }

    for (const t of THEME_NAMES) {
      items.push({
        id: `theme-${t}`,
        label: `Theme: ${THEMES[t].label}`,
        category: "Theme",
        description: `Switch palette to ${t}`,
        icon: "◐",
        color: THEMES[t].palette.purple,
        action: () => applyTheme(t),
      });
    }

    items.push({
      id: "act-quit",
      label: "Quit Qore",
      category: "Action",
      description: "Lock vault and exit",
      icon: "✕",
      color: colors.red,
      action: () => handleCommand("quit"),
    });

    return items;
  }, [vault, themeTick, runDiscovery, handleCommand, handleConnect, lockVault, applyTheme]);

  useInput((input, key) => {
    // Allow Ctrl+C to exit from anywhere (except inside an active remote SSH PTY, where it sends \x03)
    if (key.ctrl && input === "c") {
      if (!(screen === "service" && ptyActive)) {
        shutdownApp();
      }
      return;
    }
    if (key.ctrl && input === "k") {
      setPaletteOpen((open) => !open);
      return;
    }
    if (paletteOpen) return;

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
  const savedConnCount = vault?.isUnlocked() ? vault.getConnections().length : 0;

  const contentHeight = Math.max(3, termHeight - 4);
  const screenFocused = !paletteOpen;

  return (
    <Box key={`theme-${themeTick}`} flexDirection="column" width={termWidth} height={termHeight} overflow="hidden">
      <StatusBar
        mode={SCREEN_TITLES[screen]}
        dockerStatus={dockerStatus}
        portCount={portCount}
        containerCount={containerCount}
        storageProvider={storageType}
        vaultUnlocked={vault?.isUnlocked()}
        activeTabs={activeConns.length}
      />
      <Box width={termWidth} height={1}>
        <Text color={colors.borderMuted}>{"─".repeat(termWidth)}</Text>
      </Box>

      <Box flexDirection="column" width={termWidth} height={contentHeight} overflow="hidden">
        {paletteOpen && (
          <CommandPalette
            items={paletteItems}
            onClose={() => setPaletteOpen(false)}
            width={termWidth}
            height={contentHeight}
          />
        )}
        <Box
          flexDirection="column"
          width={termWidth}
          height={contentHeight}
          display={paletteOpen ? "none" : "flex"}
          overflow="hidden"
        >
            {screen === "welcome" && (
              <WelcomeScreen
                onCommand={handleCommand}
                vaultUnlocked={vault?.isUnlocked()}
                savedConnCount={savedConnCount}
                probe={probe}
                scanning={scanning}
                focused={screenFocused}
              />
            )}
            {screen === "discover" && (
              <DiscoverScreen
                probe={probe}
                scanning={scanning}
                onCommand={handleCommand}
                onRefresh={runDiscovery}
                focused={screenFocused}
              />
            )}
            {screen === "help" && <HelpScreen onCommand={handleCommand} focused={screenFocused} />}
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
                onOpenHealth={() => setScreen("health")}
                focused={screenFocused}
              />
            )}
            {screen === "health" && vault && vault.isUnlocked() && (
              <HealthScreen
                vault={vault}
                onConnect={handleConnect}
                onBack={() => setScreen("welcome")}
                onOpenDashboard={() => setScreen("dashboard")}
                focused={screenFocused}
              />
            )}
            {screen === "storage" && (
              <StorageScreen
                provider={getStorageProvider()}
                onCommand={handleCommand}
                focused={screenFocused}
              />
            )}
            {screen === "providers" && (
              <ProvidersScreen
                currentStorage={storageType}
                currentMessaging={messagingType}
                messagingProvider={getMessagingProvider()}
                onSwitchStorage={setStorageType}
                onSwitchMessaging={setMessagingType}
                onCommand={handleCommand}
                focused={screenFocused}
              />
            )}
            {screen === "service" && activeConns.length > 0 && (
              <>
                {activeConns.length > 1 && (
                  <Box flexDirection="column" width={termWidth} flexShrink={0}>
                    <Box flexDirection="row" height={1} width={termWidth} overflow="hidden">
                      {activeConns.map((s, i) => (
                        <Box key={s.sessionId} marginRight={1}>
                          <Text color={i === activeIdx ? colors.purpleBright : colors.textMuted} bold={i === activeIdx}>
                            {i === activeIdx ? "▸ " : "  "}[{i + 1}] {CONNECTION_ICONS[s.conn.type]} {s.conn.name}
                            {i === activeIdx ? " ◂" : ""}
                          </Text>
                        </Box>
                      ))}
                    </Box>
                    <Box height={1} width={termWidth} overflow="hidden">
                      <Text color={colors.textDim}>{" Ctrl+Tab switch · close to close tab · new for duplicate session · back for connections"}</Text>
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
                      onPtyActiveChange={setPtyActive}
                      tabCount={activeConns.length}
                      tabIdx={i}
                      focused={screenFocused && i === activeIdx}
                      heightOffset={4 + (activeConns.length > 1 ? 2 : 0)}
                    />
                  </Box>
                ))}
              </>
            )}
        </Box>
      </Box>

      <Box width={termWidth} height={1}>
        <Text color={colors.borderMuted}>{"─".repeat(termWidth)}</Text>
      </Box>
      <Box width={termWidth} height={1} paddingX={1} justifyContent="space-between">
        <Box gap={1}>
          <Text color={colors.purpleBright} bold>◈ Qore</Text>
          <Text color={colors.textMuted}>v{pkg.version}</Text>
          {toast && (
            <>
              <Text color={colors.borderMuted}>│</Text>
              <Text color={colors.cyan} bold>{toast}</Text>
            </>
          )}
        </Box>
        <Box gap={1}>
          <Text color={colors.textMuted}>Theme: <Text color={colors.purple}>{getActiveTheme()}</Text></Text>
          <Text color={colors.borderMuted}>│</Text>
          <Text color={colors.textMuted}>
            Vault <Text color={vault?.isUnlocked() ? colors.green : colors.textMuted}>{vault?.isUnlocked() ? "[unlocked]" : "[locked]"}</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
