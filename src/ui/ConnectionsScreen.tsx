import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { StyledBox } from "./components/Box.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { ProgressBar } from "./components/ProgressBar.js";
import { Vault } from "../core/vault/vault.js";
import type { ConnectionConfig, ConnectionType } from "../core/vault/types.js";
import { CONNECTION_LABELS, CONNECTION_ICONS, DEFAULT_PORTS } from "../core/vault/types.js";
import { getManager } from "../core/connections/manager.js";

interface ConnectionsScreenProps {
  vault: Vault | null;
  onVaultUnlock: (vault: Vault) => void;
  onConnect: (conn: ConnectionConfig) => void;
  onBack: () => void;
  activeConns?: ConnectionConfig[];
}

type View = "list" | "add" | "edit" | "changepw" | "export" | "import" | "unlock";

export function ConnectionsScreen({ vault, onVaultUnlock, onConnect, onBack, activeConns = [] }: ConnectionsScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.03));
  const innerWidth = Math.max(40, termWidth - margin * 2 - 4);

  const vaultReady = vault !== null && vault.isUnlocked();
  const [view, setView] = useState<View>(vaultReady ? "list" : "unlock");
  const [connections, setConnections] = useState<ConnectionConfig[]>(vaultReady ? vault!.getConnections() : []);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const [pwStep, setPwStep] = useState(0);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [bundlePw, setBundlePw] = useState("");
  const [bundleData, setBundleData] = useState("");
  const [exportedBundle, setExportedBundle] = useState<string | null>(null);

  // Vault unlock state
  const vaultInitialized = Vault.isInitialized();
  const [vaultMode, setVaultMode] = useState<"init" | "confirm" | "unlock">(vaultInitialized ? "unlock" : "init");
  const [vaultPw, setVaultPw] = useState("");
  const [vaultError, setVaultError] = useState<string | null>(null);

  // Add form state
  const [formStep, setFormStep] = useState(0);
  const [formData, setFormData] = useState<Partial<ConnectionConfig>>({
    type: undefined,
    host: "localhost",
    port: undefined,
    useTls: false,
  });

  const refreshList = useCallback(() => {
    if (vault && vault.isUnlocked()) setConnections(vault.getConnections());
  }, [vault]);

  const handleVaultSubmit = useCallback((value: string) => {
    setVaultError(null);

    if (vaultMode === "init") {
      setVaultPw(value);
      setVaultMode("confirm");
      return;
    }

    if (vaultMode === "confirm") {
      if (value !== vaultPw) {
        setVaultError("Passwords do not match.");
        setVaultPw("");
        setVaultMode("init");
        return;
      }
      try {
        const v = Vault.init(value);
        onVaultUnlock(v);
      } catch {
        setVaultError("Failed to create vault.");
        setVaultPw("");
        setVaultMode("init");
      }
      return;
    }

    if (vaultMode === "unlock") {
      try {
        const v = Vault.unlock(value);
        if (v) {
          onVaultUnlock(v);
        } else {
          setVaultError("Wrong password.");
        }
      } catch {
        setVaultError("Failed to unlock vault.");
      }
      return;
    }
  }, [vaultMode, vaultPw, onVaultUnlock]);

  const testConnection = useCallback(async (conn: ConnectionConfig) => {
    setTesting(conn.id);
    setStatus(`Testing ${conn.name}...`);
    try {
      const manager = getManager(conn.type);
      if (!manager) {
        setStatus(`No manager for type: ${conn.type}`);
        return;
      }
      const ok = await manager.testConnection(conn);
      setStatus(ok ? `[ok] ${conn.name} — connected` : `[!] ${conn.name} — failed`);
    } catch (err) {
      setStatus(`[!] ${conn.name} — ${(err as Error).message}`);
    } finally {
      setTesting(null);
    }
  }, []);

  const handleFormInput = useCallback((value: string) => {
    if (!vault) return;
    const lower = value.toLowerCase();

    if (formStep === 0) {
      const validTypes: ConnectionType[] = ["redis", "postgres", "mysql", "mongo", "s3", "http", "ssh"];
      if (validTypes.includes(lower as ConnectionType)) {
        const type = lower as ConnectionType;
        setFormData((d) => ({ ...d, type, port: DEFAULT_PORTS[type] }));
        setFormStep(1);
        setStatus(`[ok] Type: ${CONNECTION_LABELS[type]} · Enter connection name:`);
      } else {
        setStatus(`Invalid type. Use: ${validTypes.join(" · ")}`);
      }
      return;
    }

    if (formStep === 1) {
      if (!value) {
        setStatus("Name is required. Enter a connection name:");
        return;
      }
      setFormData((d) => ({ ...d, name: value }));
      setFormStep(2);
      setStatus(`[ok] Name: ${value} · Enter host (default: localhost):`);
      return;
    }

    if (formStep === 2) {
      const host = value || "localhost";
      setFormData((d) => ({ ...d, host }));
      setFormStep(3);
      setStatus(`[ok] Host: ${host} · Enter port (default: ${formData.port}):`);
      return;
    }

    if (formStep === 3) {
      const port = parseInt(value, 10);
      const finalPort = isNaN(port) ? formData.port : port;
      setFormData((d) => ({ ...d, port: finalPort }));
      setFormStep(4);
      setStatus(`[ok] Port: ${finalPort} · Enter username (or Enter to skip):`);
      return;
    }

    if (formStep === 4) {
      setFormData((d) => ({ ...d, username: value || undefined }));
      setFormStep(5);
      setStatus("Enter password (or Enter to skip):");
      return;
    }

    if (formStep === 5) {
      setFormData((d) => ({ ...d, password: value || undefined }));
      if (formData.type === "s3") {
        setFormStep(6);
        setStatus("Enter API key:");
        return;
      }
      if (formData.type === "ssh") {
        setFormStep(5.5);
        setStatus("SSH key file path (e.g. ~/.ssh/id_rsa) or Enter for password auth:");
        return;
      }
      setFormStep(7);
      setStatus("Use TLS? (yes/no):");
      return;
    }

    if (formStep === 5.5) {
      if (value) {
        setFormData((d) => ({ ...d, extra: { ...d.extra, keyPath: value } }));
        setFormStep(5.6);
        setStatus("Key passphrase (or Enter to skip):");
      } else {
        setFormStep(7);
        setStatus("Use TLS? (yes/no):");
      }
      return;
    }

    if (formStep === 5.6) {
      setFormData((d) => ({ ...d, apiSecret: value || undefined }));
      setFormStep(7);
      setStatus("Use TLS? (yes/no):");
      return;
    }

    if (formStep === 6) {
      setFormData((d) => ({ ...d, apiKey: value || undefined }));
      setFormStep(6.5);
      setStatus("Enter API secret:");
      return;
    }

    if (formStep === 6.5) {
      setFormData((d) => ({ ...d, apiSecret: value || undefined }));
      setFormStep(7);
      setStatus("Use TLS? (yes/no):");
      return;
    }

    if (formStep === 7) {
      const useTls = lower === "yes" || lower === "y" || lower === "true";
      const finalData = { ...formData, useTls };
      try {
        vault.addConnection(finalData as Omit<ConnectionConfig, "id">);
        refreshList();
        setView("list");
        setFormStep(0);
        setStatus(`[ok] Added: ${finalData.name}`);
      } catch (err) {
        setStatus(`Error: ${(err as Error).message}`);
      }
      return;
    }
  }, [formStep, formData, vault, refreshList]);

  const handlePwInput = useCallback((value: string) => {
    if (!vault) return;
    if (view === "changepw") {
      if (pwStep === 0) {
        setOldPw(value);
        setPwStep(1);
        setStatus("[ok] Current password accepted. Enter new password:");
        return;
      }
      if (pwStep === 1) {
        if (value.length < 8) {
          setStatus("[!] Password must be at least 8 characters. Try again:");
          return;
        }
        setNewPw(value);
        setPwStep(2);
        setStatus("[ok] New password set. Confirm new password:");
        return;
      }
      if (pwStep === 2) {
        if (value !== newPw) {
          setStatus("[!] Passwords do not match. Try again:");
          setNewPw("");
          setPwStep(1);
          return;
        }
        try {
          vault.changePassword(oldPw, newPw);
          setStatus("[ok] Vault password changed successfully.");
          setView("list");
          setPwStep(0);
          setOldPw("");
          setNewPw("");
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
          setView("list");
          setPwStep(0);
          setOldPw("");
          setNewPw("");
        }
        return;
      }
    }

    if (view === "export") {
      if (!bundlePw) {
        if (value.length < 8) {
          setStatus("[!] Password must be at least 8 characters. Try again:");
          return;
        }
        setBundlePw(value);
        setStatus("[ok] Password set. Confirm password:");
        return;
      }
      if (value !== bundlePw) {
        setStatus("[!] Passwords do not match. Try again:");
        setBundlePw("");
        return;
      }
      try {
        const bundle = vault.exportConnections(value);
        setExportedBundle(bundle);
        setStatus("[ok] Export complete. Bundle shown above. Copy it to transfer.");
      } catch (err) {
        setStatus(`[!] ${(err as Error).message}`);
      }
      return;
    }

    if (view === "import") {
      if (!bundleData) {
        setBundleData(value);
        setStatus("[ok] Bundle received. Enter decryption password:");
        return;
      }
      if (!bundlePw) {
        setBundlePw(value);
        try {
          const count = vault.importConnections(bundleData, value);
          refreshList();
          setStatus(`[ok] Imported ${count} connection(s) successfully.`);
          setView("list");
          setBundleData("");
          setBundlePw("");
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
          setView("list");
          setBundleData("");
          setBundlePw("");
        }
        return;
      }
    }
  }, [view, pwStep, oldPw, newPw, bundlePw, bundleData, vault, refreshList]);

  const isPasswordStep = useCallback((): boolean => {
    if (view === "unlock") return true;
    if (view === "changepw") return true;
    if (view === "export" && !exportedBundle) return true;
    if (view === "import" && bundleData) return true;
    if (view === "add" && (formStep === 5 || formStep === 5.6 || (formStep === 6 && formData.type === "s3") || (formStep === 6.5 && formData.type === "s3"))) return true;
    return false;
  }, [view, exportedBundle, bundleData, formStep, formData.type]);

  const handleSubmit = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    const lower = trimmed.toLowerCase();

    if (view === "unlock") {
      handleVaultSubmit(trimmed);
      return;
    }

    if (view === "add") {
      handleFormInput(trimmed);
      return;
    }

    if (view === "changepw" || view === "export" || view === "import") {
      handlePwInput(trimmed);
      return;
    }

    // Empty submit = connect to selected
    if (!trimmed) {
      if (connections.length > 0) {
        onConnect(connections[selectedIdx]);
      }
      return;
    }

    const parts = lower.split(/\s+/);
    const command = parts[0];

    if (command === "add") {
      setView("add");
      setFormStep(0);
      setFormData({ type: undefined, host: "localhost", port: undefined, useTls: false });
      setStatus("Type: redis · postgres · mysql · mongo · s3 · http · ssh");
      return;
    }

    if (command === "back" || command === "home") {
      onBack();
      return;
    }

    if (command === "connect") {
      if (parts[1]) {
        const idx = parseInt(parts[1], 10) - 1;
        if (idx >= 0 && idx < connections.length) {
          onConnect(connections[idx]);
        }
      } else if (connections.length > 0) {
        onConnect(connections[selectedIdx]);
      }
      return;
    }

    if (command === "test") {
      if (parts[1]) {
        const idx = parseInt(parts[1], 10) - 1;
        if (idx >= 0 && idx < connections.length) {
          testConnection(connections[idx]);
        }
      } else if (connections.length > 0) {
        testConnection(connections[selectedIdx]);
      }
      return;
    }

    if (command === "rm" && parts[1]) {
      const idx = parseInt(parts[1], 10) - 1;
      if (idx >= 0 && idx < connections.length && vault) {
        vault.removeConnection(connections[idx].id);
        refreshList();
        setStatus(`Removed: ${connections[idx].name}`);
      }
      return;
    }

    if (command === "changepw") {
      setView("changepw");
      setPwStep(0);
      setOldPw("");
      setNewPw("");
      setStatus("Enter current master password:");
      return;
    }

    if (command === "export") {
      setView("export");
      setBundlePw("");
      setExportedBundle(null);
      setStatus("Enter a password to encrypt the export bundle:");
      return;
    }

    if (command === "import") {
      setView("import");
      setBundlePw("");
      setBundleData("");
      setStatus("Paste the encrypted bundle string:");
      return;
    }

    if (command === "refresh") {
      refreshList();
      setStatus("Refreshed");
      return;
    }
  }, [view, connections, selectedIdx, vault, onBack, refreshList, handleFormInput, handlePwInput, testConnection, onConnect]);

  useInput((input, key) => {
    if (key.escape) {
      if (view === "unlock") {
        onBack();
        return;
      }
      if (view !== "list") {
        setView("list");
        setFormStep(0);
        setPwStep(0);
        setOldPw("");
        setNewPw("");
        setBundlePw("");
        setBundleData("");
        setExportedBundle(null);
        setStatus(null);
      } else {
        onBack();
      }
      return;
    }
    if (view !== "list") return;
    if (key.upArrow) setSelectedIdx((i) => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx((i) => Math.min(connections.length - 1, i + 1));
  });

  const headerH = 2;
  const footerH = 5;
  const availH = Math.max(6, termHeight - headerH - footerH);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} paddingX={margin} overflow="hidden">
      <Box marginBottom={1} height={1}>
        <Breadcrumb items={["Home", view === "add" ? "Add Connection" : view === "unlock" ? (vaultMode === "unlock" ? "Unlock Vault" : "Create Vault") : "Connections"]} />
      </Box>

      <Box flexDirection="column" height={availH} overflow="hidden">
        {view === "unlock" && (
          <StyledBox title={vaultMode === "unlock" ? "Unlock Vault" : "Create Vault"} focused padding={1} height={availH} overflow="hidden">
            <Box flexDirection="column">
              <Box marginBottom={1}>
                <Text color={colors.purple} bold>
                  {"  "}{vaultMode === "init" ? "Step 1/2 — Set password" : vaultMode === "confirm" ? "Step 2/2 — Confirm" : "Unlock"}
                </Text>
              </Box>

              {vaultMode === "init" && (
                <Text color={colors.textMuted}>
                  {"  No vault found. Enter a master password to create one."}
                </Text>
              )}
              {vaultMode === "confirm" && (
                <Text color={colors.green}>{"  [ok] Password set. Confirm it:"}</Text>
              )}
              {vaultMode === "unlock" && (
                <Text color={colors.textMuted}>
                  {"  Enter your master password to unlock."}
                </Text>
              )}

              {vaultError && (
                <Box marginTop={1}>
                  <Text color={colors.red} bold>{"  [!] "}{vaultError}</Text>
                </Box>
              )}

              <Box marginTop={1}>
                <Text color={colors.textDim}>
                  {"  AES-256-GCM · scrypt · never stored in plaintext"}
                </Text>
              </Box>
            </Box>
          </StyledBox>
        )}

        {view === "list" && (
          <StyledBox title="Saved Connections" focused padding={1} height={availH} overflow="hidden">
            <Box flexDirection="column">
              {connections.length === 0 ? (
                <Box flexDirection="column">
                  <Text color={colors.textMuted}>{"  No connections saved."}</Text>
                  <Box marginTop={1}>
                    <Text color={colors.purple} bold>{"  Type \"add\" to create one"}</Text>
                  </Box>
                  <Box marginTop={1}>
                    <Text color={colors.textDim}>{"  Or type \"back\" to return to menu"}</Text>
                  </Box>
                </Box>
              ) : (
                connections.map((conn, i) => {
                  const isOpen = activeConns.some((c) => c.id === conn.id);
                  return (
                  <Box key={conn.id} flexDirection="row">
                    <Text color={i === selectedIdx ? colors.purple : colors.textDim}>
                      {i === selectedIdx ? ">" : " "}{" "}
                    </Text>
                    <Text color={colors.textDim}>{i + 1}{"."}</Text>
                    <Text color={i === selectedIdx ? colors.textBright : (i % 2 === 0 ? colors.text : colors.textMuted)}>
                      {" "}{CONNECTION_ICONS[conn.type]} {conn.name}
                    </Text>
                    <Text color={i === selectedIdx ? colors.purpleBright : colors.textMuted}>
                      {"  "}{conn.type} · {conn.host}:{conn.port}
                    </Text>
                    {isOpen && (
                      <Text color={colors.green} bold>{"  [open]"}</Text>
                    )}
                    {testing === conn.id && (
                      <Text color={colors.yellow}>{"  testing..."}</Text>
                    )}
                  </Box>
                  );
                })
              )}
              {status && (
                <Box marginTop={1}>
                  <Text color={status.startsWith("[ok]") ? colors.green : status.startsWith("[!]") ? colors.red : colors.textMuted}>
                    {"  "}{status}
                  </Text>
                </Box>
              )}
            </Box>
          </StyledBox>
        )}

        {view === "add" && (
          <StyledBox title="Add Connection" focused padding={1} height={availH} overflow="hidden">
            <Box flexDirection="column">
              <Box marginBottom={1} flexDirection="row" justifyContent="space-between">
                <Text color={colors.purple} bold>
                  {"  Step "}{Math.floor(formStep) + 1}{"/8"}{" — "}
                  {formStep === 0 && "Connection type"}
                  {formStep === 1 && "Name"}
                  {formStep === 2 && "Host"}
                  {formStep === 3 && "Port"}
                  {formStep === 4 && "Username"}
                  {formStep === 5 && "Password"}
                  {formStep === 5.5 && "SSH Key Path"}
                  {formStep === 5.6 && "Key Passphrase"}
                  {formStep === 6 && "API Key"}
                  {formStep === 6.5 && "API Secret"}
                  {formStep === 7 && "TLS"}
                </Text>
                <ProgressBar current={Math.floor(formStep) + 1} total={8} />
              </Box>

              <Box flexDirection="column" marginBottom={1}>
                <Text color={colors.textDim}>{"  Checklist:"}</Text>
                <Text color={formData.type ? colors.green : colors.textMuted}>{"    "}{formData.type ? "[ok]" : "[  ]"}{" type: "}<Text color={formData.type ? colors.purple : colors.textDim}>{formData.type ?? "—"}</Text></Text>
                <Text color={formData.name ? colors.green : colors.textMuted}>{"    "}{formData.name ? "[ok]" : "[  ]"}{" name: "}<Text color={formData.name ? colors.purple : colors.textDim}>{formData.name ?? "—"}</Text></Text>
                <Text color={formData.host ? colors.green : colors.textMuted}>{"    "}{formData.host ? "[ok]" : "[  ]"}{" host: "}<Text color={formData.host ? colors.purple : colors.textDim}>{formData.host ?? "—"}</Text></Text>
                <Text color={formData.port ? colors.green : colors.textMuted}>{"    "}{formData.port ? "[ok]" : "[  ]"}{" port: "}<Text color={formData.port ? colors.purple : colors.textDim}>{formData.port ?? "—"}</Text></Text>
                <Text color={formData.username ? colors.green : colors.textMuted}>{"    "}{formData.username ? "[ok]" : "[  ]"}{" user: "}<Text color={formData.username ? colors.purple : colors.textDim}>{formData.username ?? "(skip)"}</Text></Text>
                <Text color={formData.password ? colors.green : colors.textMuted}>{"    "}{formData.password ? "[ok]" : "[  ]"}{" pass: "}<Text color={formData.password ? colors.purple : colors.textDim}>{formData.password ? "****" : "(skip)"}</Text></Text>
                {formData.type === "ssh" && (
                  <Text color={formData.extra?.keyPath ? colors.green : colors.textMuted}>{"    "}{formData.extra?.keyPath ? "[ok]" : "[  ]"}{" key: "}<Text color={formData.extra?.keyPath ? colors.purple : colors.textDim}>{formData.extra?.keyPath ?? "(password auth)"}</Text></Text>
                )}
                {formData.type === "s3" && (
                  <>
                    <Text color={formData.apiKey ? colors.green : colors.textMuted}>{"    "}{formData.apiKey ? "[ok]" : "[  ]"}{" key: "}<Text color={formData.apiKey ? colors.purple : colors.textDim}>{formData.apiKey ?? "—"}</Text></Text>
                    <Text color={formData.apiSecret ? colors.green : colors.textMuted}>{"    "}{formData.apiSecret ? "[ok]" : "[  ]"}{" secret: "}<Text color={formData.apiSecret ? colors.purple : colors.textDim}>{formData.apiSecret ? "****" : "—"}</Text></Text>
                  </>
                )}
                <Text color={formStep > 7 ? colors.green : colors.textMuted}>{"    "}{formStep > 7 ? "[ok]" : "[  ]"}{" tls: "}<Text color={formStep > 7 ? colors.purple : colors.textDim}>{formStep > 7 ? String(formData.useTls) : "—"}</Text></Text>
              </Box>

              {formStep === 0 && (
                <Text color={colors.textMuted}>{"  Options: redis · postgres · mysql · mongo · s3 · http · ssh"}</Text>
              )}

              {status && (
                <Box marginTop={1}>
                  <Text color={status.startsWith("[ok]") ? colors.green : status.startsWith("[!]") ? colors.red : colors.textMuted}>
                    {"  "}{status}
                  </Text>
                </Box>
              )}
            </Box>
          </StyledBox>
        )}

        {view === "changepw" && (
          <StyledBox title="Change Vault Password" focused padding={1} height={availH} overflow="hidden">
            <Box flexDirection="column">
              <Box marginBottom={1} flexDirection="row" justifyContent="space-between">
                <Text color={colors.purple} bold>
                  {"  Step "}{pwStep + 1}{"/3"}{" — "}
                  {pwStep === 0 && "Current password"}
                  {pwStep === 1 && "New password"}
                  {pwStep === 2 && "Confirm new password"}
                </Text>
                <ProgressBar current={pwStep + 1} total={3} />
              </Box>

              <Box flexDirection="column" marginBottom={1}>
                <Text color={colors.textDim}>{"  Progress:"}</Text>
                <Text color={pwStep > 0 ? colors.green : colors.textMuted}>{"    "}{pwStep > 0 ? "[ok]" : "[  ]"}{" current password"}</Text>
                <Text color={pwStep > 1 ? colors.green : colors.textMuted}>{"    "}{pwStep > 1 ? "[ok]" : "[  ]"}{" new password"}</Text>
                <Text color={pwStep > 2 ? colors.green : colors.textMuted}>{"    "}{pwStep > 2 ? "[ok]" : "[  ]"}{" confirmed"}</Text>
              </Box>

              <Box marginTop={1}>
                <Text color={colors.textMuted}>{"  Min 8 characters. All credentials re-encrypted on change."}</Text>
              </Box>

              {status && (
                <Box marginTop={1}>
                  <Text color={status.startsWith("[ok]") ? colors.green : status.startsWith("[!]") ? colors.red : colors.textMuted}>
                    {"  "}{status}
                  </Text>
                </Box>
              )}
            </Box>
          </StyledBox>
        )}

        {view === "export" && (
          <StyledBox title="Export Connections" focused padding={1} height={availH} overflow="hidden">
            <Box flexDirection="column">
              <Text color={colors.textMuted}>{"  Export all connections into an encrypted bundle."}</Text>
              <Text color={colors.textMuted}>{"  The bundle is encrypted with a separate password."}</Text>
              <Box marginTop={1}>
                <Text color={colors.textDim}>{"  Steps: password -> confirm -> generate bundle"}</Text>
              </Box>

              {exportedBundle && (
                <Box marginTop={1} flexDirection="column">
                  <Text color={colors.green} bold>{"  [ok] Encrypted bundle (copy this):"}</Text>
                  <Box marginTop={1} paddingX={1}>
                    <Text color={colors.text} wrap="truncate">{exportedBundle.slice(0, 500)}{exportedBundle.length > 500 ? "..." : ""}</Text>
                  </Box>
                </Box>
              )}

              {status && (
                <Box marginTop={1}>
                  <Text color={status.startsWith("[ok]") ? colors.green : status.startsWith("[!]") ? colors.red : colors.textMuted}>
                    {"  "}{status}
                  </Text>
                </Box>
              )}
            </Box>
          </StyledBox>
        )}

        {view === "import" && (
          <StyledBox title="Import Connections" focused padding={1} height={availH} overflow="hidden">
            <Box flexDirection="column">
              <Text color={colors.textMuted}>{"  Import connections from an encrypted bundle."}</Text>
              <Text color={colors.textMuted}>{"  Steps: paste bundle -> enter password -> import"}</Text>

              <Box marginTop={1} flexDirection="column">
                <Text color={bundleData ? colors.green : colors.textMuted}>
                  {"  "}{bundleData ? "[ok]" : "[  ]"}{" bundle received"}
                </Text>
                <Text color={bundlePw ? colors.green : colors.textMuted}>
                  {"  "}{bundlePw ? "[ok]" : "[  ]"}{" password entered"}
                </Text>
              </Box>

              {status && (
                <Box marginTop={1}>
                  <Text color={status.startsWith("[ok]") ? colors.green : status.startsWith("[!]") ? colors.red : colors.textMuted}>
                    {"  "}{status}
                  </Text>
                </Box>
              )}
            </Box>
          </StyledBox>
        )}
      </Box>

      <Box marginTop={1}>
        <InputBar
          onSubmit={handleSubmit}
          masked={isPasswordStep()}
          placeholder={view === "unlock" ? (vaultMode === "confirm" ? "Confirm password" : "Master password") : view === "add" ? getFormPlaceholder(formStep) : view === "changepw" ? getPwPlaceholder(pwStep) : view === "export" ? (exportedBundle ? "done - press esc to return" : "Encryption password (min 8 chars)") : view === "import" ? (bundleData ? "Decryption password" : "Paste bundle string") : "connect · add · test · rm <n> · changepw · export · import · back"}
        />
      </Box>

      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "Up/Dn", label: "select" },
            { key: "Enter", label: view === "unlock" ? "confirm" : "connect" },
            { key: "esc", label: view === "add" ? "cancel" : "back" },
          ]}
        />
      </Box>
    </Box>
  );
}

function getFormPlaceholder(step: number): string {
  switch (step) {
    case 0: return "redis · postgres · mysql · mongo · s3 · http · ssh";
    case 1: return "Connection name (e.g. My Redis)";
    case 2: return "Host (default: localhost)";
    case 3: return "Port (default shown above)";
    case 4: return "Username (or Enter to skip)";
    case 5: return "Password (or Enter to skip)";
    case 5.5: return "~/.ssh/id_rsa (or Enter for password auth)";
    case 5.6: return "Key passphrase (or Enter to skip)";
    case 6: return "API Key";
    case 6.5: return "API Secret";
    case 7: return "Use TLS? (yes/no)";
    default: return "...";
  }
}

function getPwPlaceholder(step: number): string {
  switch (step) {
    case 0: return "Current master password";
    case 1: return "New master password (min 8 chars)";
    case 2: return "Confirm new master password";
    default: return "...";
  }
}
