import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { StyledBox } from "./components/Box.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { ProgressBar } from "./components/ProgressBar.js";
import { Vault } from "../core/vault/vault.js";
import type { ConnectionConfig, ConnectionGroup, ConnectionType } from "../core/vault/types.js";
import { CONNECTION_LABELS, CONNECTION_ICONS, DEFAULT_PORTS } from "../core/vault/types.js";
import { getManager } from "../core/connections/manager.js";
import { loadSnippets, createSnippet, removeSnippet, getSnippetByName, type SnippetCommand, type Snippet } from "../core/snippets.js";

interface ActiveSession {
  sessionId: string;
  conn: ConnectionConfig;
}

interface ConnectionsScreenProps {
  vault: Vault | null;
  onVaultUnlock: (vault: Vault) => void;
  onConnect: (conn: ConnectionConfig) => void;
  onBack: () => void;
  activeConns?: ActiveSession[];
}

type View = "list" | "add" | "edit" | "changepw" | "export" | "import" | "unlock" | "groups";

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

  // Vault unlock state — re-check on every render to prevent stale init mode
  const vaultInitialized = Vault.isInitialized();
  const [vaultMode, setVaultMode] = useState<"init" | "confirm" | "unlock">(vaultInitialized ? "unlock" : "init");

  // Safety: if vault becomes initialized while in init/confirm mode, switch to unlock
  if (vaultInitialized && (vaultMode === "init" || vaultMode === "confirm")) {
    setVaultMode("unlock");
  }
  const [vaultPw, setVaultPw] = useState("");
  const [vaultError, setVaultError] = useState<string | null>(null);

  // Add/edit form state
  const [formStep, setFormStep] = useState(0);
  const [formData, setFormData] = useState<Partial<ConnectionConfig>>({
    type: undefined,
    host: "localhost",
    port: undefined,
    useTls: false,
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  // Group state
  const [groups, setGroups] = useState<ConnectionGroup[]>(vaultReady ? vault!.getGroups() : []);
  const [groupFormStep, setGroupFormStep] = useState(0);
  const [groupFormData, setGroupFormData] = useState<{ name: string; selectedIds: Set<string> }>({ name: "", selectedIds: new Set() });

  // Snippet state
  const [snippets, setSnippets] = useState<Snippet[]>(loadSnippets());
  const [recordingSnippet, setRecordingSnippet] = useState(false);
  const [snippetName, setSnippetName] = useState("");
  const [snippetCommands, setSnippetCommands] = useState<SnippetCommand[]>([]);
  const [snippetsView, setSnippetsView] = useState(false);

  const refreshGroups = useCallback(() => {
    if (vault && vault.isUnlocked()) setGroups(vault.getGroups());
  }, [vault]);

  const refreshList = useCallback(() => {
    if (vault && vault.isUnlocked()) setConnections(vault.getConnections());
  }, [vault]);

  const handleVaultSubmit = useCallback((value: string) => {
    setVaultError(null);

    if (vaultMode === "init") {
      if (Vault.isInitialized()) {
        setVaultError("Vault already exists. Use unlock instead.");
        setVaultMode("unlock");
        return;
      }
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
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("already exists")) {
          setVaultError("Vault already exists. Please use unlock with your password.");
          setVaultMode("unlock");
        } else {
          setVaultError("Failed to create vault.");
          setVaultPw("");
          setVaultMode("init");
        }
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
    const isEdit = view === "edit";

    if (formStep === 0) {
      const validTypes: ConnectionType[] = ["redis", "postgres", "mysql", "mongo", "s3", "http", "ssh", "git", "vmware"];
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
      const name = value || formData.name || "";
      if (!name) {
        setStatus("Name is required. Enter a connection name:");
        return;
      }
      setFormData((d) => ({ ...d, name }));
      setFormStep(2);
      setStatus(`[ok] Name: ${name} · Enter host (default: localhost):`);
      return;
    }

    if (formStep === 2) {
      const host = value || formData.host || "localhost";
      setFormData((d) => ({ ...d, host }));
      if (formData.type === "git") {
        setFormStep(7);
        setStatus(`[ok] Path: ${host} · Use TLS? (yes/no):`);
        return;
      }
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
      if (formData.type === "vmware") {
        setFormStep(5.7);
        setStatus("Allow insecure TLS? (recommended for self-signed certs) (yes/no, default: yes):");
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

    if (formStep === 5.7) {
      const insecure = lower === "yes" || lower === "y" || lower === "true" || value === "";
      setFormData((d) => ({ ...d, extra: { ...d.extra, insecure: insecure ? "true" : "false" }, useTls: true }));
      const finalData = { ...formData, extra: { ...(formData.extra ?? {}), insecure: insecure ? "true" : "false" }, useTls: true };
      try {
        if (isEdit && editingId) {
          vault.updateConnection(editingId, finalData as Partial<ConnectionConfig>);
          setStatus(`[ok] Updated: ${finalData.name}`);
        } else {
          vault.addConnection(finalData as Omit<ConnectionConfig, "id">);
          setStatus(`[ok] Added: ${finalData.name}`);
        }
        refreshList();
        setView("list");
        setFormStep(0);
        setEditingId(null);
      } catch (err) {
        setStatus(`Error: ${(err as Error).message}`);
      }
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
        if (isEdit && editingId) {
          vault.updateConnection(editingId, finalData as Partial<ConnectionConfig>);
          setStatus(`[ok] Updated: ${finalData.name}`);
        } else {
          vault.addConnection(finalData as Omit<ConnectionConfig, "id">);
          setStatus(`[ok] Added: ${finalData.name}`);
        }
        refreshList();
        setView("list");
        setFormStep(0);
        setEditingId(null);
      } catch (err) {
        setStatus(`Error: ${(err as Error).message}`);
      }
      return;
    }
  }, [formStep, formData, vault, refreshList, view, editingId]);

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

    if (view === "add" || view === "edit") {
      handleFormInput(trimmed);
      return;
    }

    if (view === "changepw" || view === "export" || view === "import") {
      handlePwInput(trimmed);
      return;
    }

    if (view === "groups") {
      if (groupFormStep === 0) {
        if (!trimmed) {
          setStatus("[!] Group name cannot be empty");
          return;
        }
        if (groups.some((g) => g.name === trimmed)) {
          setStatus(`[!] Group "${trimmed}" already exists`);
          return;
        }
        setGroupFormData((prev) => ({ ...prev, name: trimmed }));
        setGroupFormStep(1);
        setStatus(`Select connections to add to "${trimmed}" (type number or 'done'):`);
        return;
      }
      if (groupFormStep === 1) {
        if (trimmed === "done" || trimmed === "save") {
          if (!vault) return;
          const g = vault.addGroup(groupFormData.name);
          for (const cid of groupFormData.selectedIds) {
            vault.addToGroup(g.id, cid);
          }
          refreshGroups();
          setView("list");
          setGroupFormStep(0);
          setStatus(`[ok] Created group "${groupFormData.name}" with ${groupFormData.selectedIds.size} connection(s)`);
          return;
        }
        const idx = parseInt(trimmed, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= connections.length) {
          setStatus(`[!] Invalid number. Type 1-${connections.length} or 'done'`);
          return;
        }
        const conn = connections[idx];
        setGroupFormData((prev) => {
          const newIds = new Set(prev.selectedIds);
          if (newIds.has(conn.id)) {
            newIds.delete(conn.id);
            setStatus(`Removed "${conn.name}" from selection`);
          } else {
            newIds.add(conn.id);
            setStatus(`Added "${conn.name}" to selection (${newIds.size} selected)`);
          }
          return { ...prev, selectedIds: newIds };
        });
        return;
      }
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
      setStatus("Type: redis · postgres · mysql · mongo · s3 · http · ssh · git · vmware");
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

    if (command === "rm") {
      const idx = parts[1] ? parseInt(parts[1], 10) - 1 : selectedIdx;
      if (idx >= 0 && idx < connections.length && vault) {
        vault.removeConnection(connections[idx].id);
        refreshList();
        setStatus(`Removed: ${connections[idx].name}`);
      }
      return;
    }

    if (command === "edit") {
      const idx = parts[1] ? parseInt(parts[1], 10) - 1 : selectedIdx;
      if (idx >= 0 && idx < connections.length) {
        const conn = connections[idx];
        setEditingId(conn.id);
        setFormData({ ...conn });
        setFormStep(1);
        setView("edit");
        setStatus(`Editing: ${conn.name} · Enter connection name (or Enter to keep):`);
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
      refreshGroups();
      setStatus("Refreshed");
      return;
    }

    if (command === "groups") {
      refreshGroups();
      setView("groups");
      setStatus(null);
      return;
    }

    if (command === "group") {
      setView("groups");
      setGroupFormStep(0);
      setGroupFormData({ name: "", selectedIds: new Set() });
      setStatus("Enter group name (e.g. production, staging, dev):");
      return;
    }

    if (command === "group-add") {
      const groupName = parts[1];
      if (!groupName || !vault || connections.length === 0) {
        setStatus("[!] Usage: group-add <name> (select a connection first)");
        return;
      }
      const g = groups.find((g) => g.name === groupName);
      if (!g) {
        setStatus(`[!] Group "${groupName}" not found. Use 'group' to create it.`);
        return;
      }
      const conn = connections[selectedIdx];
      vault.addToGroup(g.id, conn.id);
      refreshGroups();
      setStatus(`[ok] Added "${conn.name}" to group "${groupName}"`);
      return;
    }

    if (command === "group-rm") {
      const groupName = parts.slice(1).join(" ");
      if (!groupName || !vault) {
        setStatus("[!] Usage: group-rm <name>");
        return;
      }
      const g = groups.find((g) => g.name === groupName);
      if (!g) {
        setStatus(`[!] Group "${groupName}" not found`);
        return;
      }
      vault.removeGroup(g.id);
      refreshGroups();
      setStatus(`[ok] Removed group "${groupName}"`);
      return;
    }

    if (command === "group-open") {
      const groupName = parts.slice(1).join(" ");
      if (!groupName || !vault) {
        setStatus("[!] Usage: group-open <name>");
        return;
      }
      const g = groups.find((g) => g.name === groupName);
      if (!g) {
        setStatus(`[!] Group "${groupName}" not found`);
        return;
      }
      const conns = vault.getGroupConnections(g.id);
      if (conns.length === 0) {
        setStatus(`[!] Group "${groupName}" has no connections`);
        return;
      }
      for (const c of conns) {
        onConnect(c);
      }
      setStatus(`[ok] Opened ${conns.length} connection(s) from group "${groupName}"`);
      return;
    }

    if (command === "snippet") {
      if (recordingSnippet) {
        setStatus("[!] Already creating. Type 'snippet-save' to finish or 'snippet-cancel' to abort.");
        return;
      }
      const name = parts.slice(1).join(" ");
      if (!name) {
        setStatus("[!] Usage: snippet <name>");
        return;
      }
      if (getSnippetByName(name)) {
        setStatus(`[!] Snippet "${name}" already exists`);
        return;
      }
      setSnippetName(name);
      setSnippetCommands([]);
      setRecordingSnippet(true);
      setSnippetsView(true);
      setStatus(`Creating "${name}" — type 'add <conn_num> <command>' or 'done' to save`);
      return;
    }

    if (command === "snippet-save" || (recordingSnippet && command === "done")) {
      if (!recordingSnippet) {
        setStatus("[!] Not creating a snippet");
        return;
      }
      if (snippetCommands.length === 0) {
        setStatus("[!] No commands added. Type 'snippet-cancel' to abort.");
        return;
      }
      createSnippet(snippetName, snippetCommands);
      setSnippets(loadSnippets());
      setRecordingSnippet(false);
      setSnippetsView(false);
      setSnippetName("");
      setSnippetCommands([]);
      setStatus(`[ok] Saved snippet "${snippetName}" with ${snippetCommands.length} command(s)`);
      return;
    }

    if (command === "snippet-cancel") {
      if (!recordingSnippet) {
        setStatus("[!] Not creating a snippet");
        return;
      }
      setRecordingSnippet(false);
      setSnippetsView(false);
      setSnippetName("");
      setSnippetCommands([]);
      setStatus("[ok] Snippet creation cancelled");
      return;
    }

    if (recordingSnippet && command === "add") {
      const rest = trimmed.slice(4).trim();
      const spaceIdx = rest.indexOf(" ");
      if (spaceIdx === -1) {
        setStatus("[!] Usage: add <conn_num> <command>");
        return;
      }
      const numStr = rest.slice(0, spaceIdx);
      const cmdText = rest.slice(spaceIdx + 1).trim();
      const idx = parseInt(numStr, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= connections.length) {
        setStatus(`[!] Invalid connection number. Type 1-${connections.length}`);
        return;
      }
      if (!cmdText) {
        setStatus("[!] Command cannot be empty");
        return;
      }
      const conn = connections[idx];
      setSnippetCommands((prev) => [...prev, { connId: conn.id, connName: conn.name, command: cmdText }]);
      setStatus(`[ok] Added command "${cmdText}" for "${conn.name}" (${snippetCommands.length + 1} total)`);
      return;
    }

    if (command === "snippets") {
      setSnippets(loadSnippets());
      setSnippetsView(true);
      setStatus(null);
      return;
    }

    if (command === "snippet-rm") {
      const name = parts.slice(1).join(" ");
      if (!name) {
        setStatus("[!] Usage: snippet-rm <name>");
        return;
      }
      const snip = getSnippetByName(name);
      if (!snip) {
        setStatus(`[!] Snippet "${name}" not found`);
        return;
      }
      removeSnippet(snip.id);
      setSnippets(loadSnippets());
      setStatus(`[ok] Removed snippet "${name}"`);
      return;
    }

    if (command === "run") {
      const name = parts.slice(1).join(" ");
      if (!name) {
        setStatus("[!] Usage: run <snippet-name>");
        return;
      }
      const snip = getSnippetByName(name);
      if (!snip) {
        setStatus(`[!] Snippet "${name}" not found`);
        return;
      }
      if (!vault) {
        setStatus("[!] Vault not unlocked");
        return;
      }
      let executed = 0;
      let skipped = 0;
      for (const cmd of snip.commands) {
        const conn = vault.getConnections().find((c) => c.id === cmd.connId);
        if (!conn) {
          skipped++;
          continue;
        }
        onConnect(conn);
        executed++;
      }
      setStatus(`[ok] Running snippet "${name}" — ${executed} connection(s) opened${skipped > 0 ? `, ${skipped} skipped (not found)` : ""}`);
      return;
    }
  }, [view, connections, selectedIdx, vault, onBack, refreshList, refreshGroups, handleFormInput, handlePwInput, handleVaultSubmit, testConnection, onConnect, groups, snippets, recordingSnippet, snippetName, snippetCommands]);

  useInput((input, key) => {
    if (key.escape) {
      if (view === "unlock") {
        onBack();
        return;
      }
      if (view !== "list") {
        setView("list");
        setFormStep(0);
        setEditingId(null);
        setPwStep(0);
        setOldPw("");
        setNewPw("");
        setBundlePw("");
        setBundleData("");
        setExportedBundle(null);
        setGroupFormStep(0);
        setSnippetsView(false);
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
        <Breadcrumb items={["Home", view === "add" ? "Add Connection" : view === "edit" ? "Edit Connection" : view === "unlock" ? (vaultMode === "unlock" ? "Unlock Vault" : "Create Vault") : view === "groups" ? "Connection Groups" : "Connections"]} />
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
                  const openCount = activeConns.filter((s) => s.conn.id === conn.id).length;
                  const connGroups = groups.filter((g) => g.connectionIds.includes(conn.id));
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
                    {connGroups.length > 0 && (
                      <Text color={colors.cyan}>{"  [:"}{connGroups.map((g) => g.name).join(", ")}{":]"}</Text>
                    )}
                    {openCount > 0 && (
                      <Text color={colors.green} bold>{"  [open" + (openCount > 1 ? ` x${openCount}` : "") + "]"}</Text>
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

        {(view === "add" || view === "edit") && (
          <StyledBox title={view === "edit" ? "Edit Connection" : "Add Connection"} focused padding={1} height={availH} overflow="hidden">
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
                <Text color={colors.textMuted}>{"  Options: redis · postgres · mysql · mongo · s3 · http · ssh · git · vmware"}</Text>
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

        {view === "groups" && (
          <StyledBox title="Connection Groups" focused padding={1} height={availH} overflow="hidden">
            <Box flexDirection="column">
              {groupFormStep === 0 && groups.length === 0 && (
                <Box flexDirection="column">
                  <Text color={colors.textMuted}>{"  No groups created."}</Text>
                  <Box marginTop={1}>
                    <Text color={colors.purple} bold>{"  Type a name to create one (e.g. production)"}</Text>
                  </Box>
                </Box>
              )}

              {groupFormStep === 0 && groups.length > 0 && (
                <Box flexDirection="column">
                  <Text color={colors.textDim}>{"  Groups:"}</Text>
                  {groups.map((g, i) => (
                    <Box key={g.id} flexDirection="row">
                      <Text color={colors.textDim}>{"  "}{i + 1}{"."}</Text>
                      <Text color={colors.purpleBright}>{"  "}{g.name}</Text>
                      <Text color={colors.textMuted}>{"  ("}{g.connectionIds.length}{" connections)"}</Text>
                    </Box>
                  ))}
                  <Box marginTop={1}>
                    <Text color={colors.textDim}>{"  Commands: group <name> · group-add <name> · group-rm <name> · group-open <name> · back"}</Text>
                  </Box>
                </Box>
              )}

              {groupFormStep === 1 && (
                <Box flexDirection="column">
                  <Text color={colors.purple} bold>{"  Creating group: "}{groupFormData.name}</Text>
                  <Box marginTop={1}>
                    <Text color={colors.textDim}>{"  Select connections (type number to toggle, 'done' to save):"}</Text>
                  </Box>
                  {connections.map((conn, i) => {
                    const selected = groupFormData.selectedIds.has(conn.id);
                    return (
                      <Box key={conn.id} flexDirection="row">
                        <Text color={selected ? colors.green : colors.textDim}>
                          {"  "}{selected ? "[ok]" : "[  ]"}{" "}{i + 1}{"."}
                        </Text>
                        <Text color={selected ? colors.textBright : colors.textMuted}>
                          {" "}{CONNECTION_ICONS[conn.type]} {conn.name}
                        </Text>
                        <Text color={colors.textMuted}>{"  "}{conn.type} · {conn.host}</Text>
                      </Box>
                    );
                  })}
                  <Box marginTop={1}>
                    <Text color={colors.purple} bold>{"  "}{groupFormData.selectedIds.size}{" selected · type 'done' to save"}</Text>
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

        {snippetsView && !recordingSnippet && (
          <StyledBox title="Command Snippets" focused padding={1} height={availH} overflow="hidden">
            <Box flexDirection="column">
              {snippets.length === 0 ? (
                <Box flexDirection="column">
                  <Text color={colors.textMuted}>{"  No snippets saved."}</Text>
                  <Box marginTop={1}>
                    <Text color={colors.purple} bold>{"  Type 'snippet <name>' to start recording"}</Text>
                  </Box>
                </Box>
              ) : (
                <Box flexDirection="column">
                  <Text color={colors.textDim}>{"  Snippets:"}</Text>
                  {snippets.map((s, i) => (
                    <Box key={s.id} flexDirection="row">
                      <Text color={colors.textDim}>{"  "}{i + 1}{"."}</Text>
                      <Text color={colors.purpleBright}>{"  "}{s.name}</Text>
                      <Text color={colors.textMuted}>{"  ("}{s.commands.length}{" commands)"}</Text>
                    </Box>
                  ))}
                  <Box marginTop={1}>
                    <Text color={colors.textDim}>{"  Commands: run <name> · snippet-rm <name> · snippet <name> · esc to return"}</Text>
                  </Box>
                </Box>
              )}
              {status && (
                <Box marginTop={1}>
                  <Text color={status.startsWith("[ok]") ? colors.green : status.startsWith("[!]") ? colors.red : status.startsWith("[recording]") ? colors.yellow : colors.textMuted}>
                    {"  "}{status}
                  </Text>
                </Box>
              )}
            </Box>
          </StyledBox>
        )}

        {recordingSnippet && (
          <StyledBox title={`Creating Snippet: ${snippetName}`} focused padding={1} height={availH} overflow="hidden">
            <Box flexDirection="column">
              <Text color={colors.yellow} bold>{"  Type 'add <conn_num> <command>' to add a command"}</Text>
              <Text color={colors.textDim}>{"  Type 'done' to save or 'snippet-cancel' to abort"}</Text>
              <Box marginTop={1} flexDirection="column">
                <Text color={colors.textDim}>{"  Available connections:"}</Text>
                {connections.map((conn, i) => (
                  <Box key={conn.id} flexDirection="row">
                    <Text color={colors.textDim}>{"    "}{i + 1}{"."}</Text>
                    <Text color={colors.textMuted}>{" "}{CONNECTION_ICONS[conn.type]} {conn.name}</Text>
                    <Text color={colors.textMuted}>{"  "}{conn.type} · {conn.host}</Text>
                  </Box>
                ))}
              </Box>
              {snippetCommands.length > 0 && (
                <Box marginTop={1} flexDirection="column">
                  <Text color={colors.textDim}>{"  Commands ("}{snippetCommands.length}{"):"}</Text>
                  {snippetCommands.map((cmd, i) => (
                    <Box key={i} flexDirection="row">
                      <Text color={colors.textDim}>{"    "}{i + 1}{"."}</Text>
                      <Text color={colors.textMuted}>{"  "}{cmd.connName}: </Text>
                      <Text color={colors.text}>{cmd.command}</Text>
                    </Box>
                  ))}
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
      </Box>

      <Box marginTop={1}>
        <InputBar
          onSubmit={handleSubmit}
          masked={isPasswordStep()}
          placeholder={view === "unlock" ? (vaultMode === "confirm" ? "Confirm password" : "Master password") : view === "add" || view === "edit" ? getFormPlaceholder(formStep) : view === "changepw" ? getPwPlaceholder(pwStep) : view === "export" ? (exportedBundle ? "done - press esc to return" : "Encryption password (min 8 chars)") : view === "import" ? (bundleData ? "Decryption password" : "Paste bundle string") : view === "groups" ? (groupFormStep === 0 ? "group name or 'back'" : groupFormStep === 1 ? "number to toggle · 'done' to save" : "groups · group · group-add · group-rm · group-open · back") : recordingSnippet ? "snippet-save · snippet-cancel" : "connect · add · edit · test · rm <n> · groups · snippets · run <name> · changepw · export · import · back"}
        />
      </Box>

      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "Up/Dn", label: "select" },
            { key: "Enter", label: view === "unlock" ? "confirm" : "connect" },
            { key: "esc", label: view === "add" || view === "edit" ? "cancel" : "back" },
          ]}
        />
      </Box>
    </Box>
  );
}

function getFormPlaceholder(step: number): string {
  switch (step) {
    case 0: return "redis · postgres · mysql · mongo · s3 · http · ssh · git · vmware";
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
