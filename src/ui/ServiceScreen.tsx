import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { StyledBox } from "./components/Box.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { ScrollIndicator } from "./components/ScrollIndicator.js";
import type { ConnectionConfig } from "../core/vault/types.js";
import { CONNECTION_LABELS, CONNECTION_ICONS } from "../core/vault/types.js";
import { getManager } from "../core/connections/manager.js";
import type { RedisManager } from "../core/connections/redis.js";
import type { S3Manager } from "../core/connections/s3.js";
import type { DatabaseManager, StorageManager, QueryResult, ObjectInfo } from "../core/connections/manager.js";
import type { HttpManager } from "../core/connections/http.js";
import type { SshManager, PtyHandle } from "../core/connections/ssh.js";
import type { GitManager, GitFileStatus, GitBranchInfo, GitLogEntry, GitDiffResult } from "../core/connections/git.js";
import type { VmwareManager, VmSummary, HostSummary, DatastoreSummary, NetworkSummary, SnapshotTree } from "../core/connections/vmware.js";
import { TerminalOverlay } from "./components/TerminalOverlay.js";
import { loadFavorites, addFavorite, removeFavorite } from "../core/favorites.js";
import { setMouseHandler } from "./mouseBus.js";

interface ServiceScreenProps {
  conn: ConnectionConfig;
  onBack: () => void;
  onClose: () => void;
  onNewSession?: () => void;
  tabCount?: number;
  tabIdx?: number;
  focused?: boolean;
  heightOffset?: number;
}

const BOX_OVERHEAD = 5;
const HEADER = 2;
const FOOTER = 4;

export function ServiceScreen({ conn, onBack, onClose, onNewSession, tabCount, focused = true, heightOffset = 0 }: ServiceScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const effectiveHeight = termHeight - heightOffset;
  const margin = Math.max(1, Math.floor(termWidth * 0.03));
  const innerWidth = Math.max(30, termWidth - margin * 2 - 4);

  const [info, setInfo] = useState<Record<string, string>>({});
  const [items, setItems] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<string | null>(null);
  const [overlayContent, setOverlayContent] = useState<string[]>([]);
  const [overlayScroll, setOverlayScroll] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamSendRef = useRef<((input: string) => void) | null>(null);
  const streamCancelRef = useRef<(() => void) | null>(null);
  const [ptyHandle, setPtyHandle] = useState<PtyHandle | null>(null);
  const [ptyTitle, setPtyTitle] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [gitStatus, setGitStatus] = useState<GitFileStatus[]>([]);
  const [gitBranches, setGitBranches] = useState<GitBranchInfo[]>([]);
  const [gitLog, setGitLog] = useState<GitLogEntry[]>([]);

  const availH = Math.max(8, effectiveHeight - HEADER - FOOTER);
  const listH = Math.floor(availH * 0.55);
  const infoH = Math.floor(availH * 0.35);

  const maxItems = Math.max(1, listH - BOX_OVERHEAD);

  useEffect(() => {
    loadInitial();
    setFavorites(loadFavorites());
  }, []);

  const loadInitial = useCallback(async () => {
    setStatus("Connecting...");
    const manager = getManager(conn.type);
    if (!manager) {
      setStatus(`No manager for type: ${conn.type}`);
      return;
    }
    try {
      const ok = await manager.testConnection(conn);
      if (!ok) {
        const sshManager = conn.type === "ssh" ? (manager as SshManager) : null;
        const detail = sshManager?.lastError ? ` — ${sshManager.lastError}` : "";
        setStatus(`[!] Failed to connect to ${conn.name}${detail}`);
        return;
      }
      setStatus(`[ok] Connected to ${conn.name}`);

      const infoData = await manager.getInfo(conn);
      setInfo(infoData);

      if (conn.type === "redis") {
        const redis = manager as RedisManager;
        const keys = await redis.getKeys(conn);
        setItems(keys.slice(0, 200));
      } else if (conn.type === "s3") {
        const s3 = manager as StorageManager;
        const buckets = await s3.listBuckets(conn);
        setItems([
          ...buckets,
          "ls <bucket>", "mkbucket <name>", "rmbucket <name>",
          "upload <local> <bucket/key>", "download <bucket/key> <local>",
          "rm <bucket> <key>", "presign <bucket> <key>",
          "info", "refresh", "back", "close", "new",
        ]);
      } else if (conn.type === "http") {
        setItems(["GET /", "GET /health", "GET /status", "GET /api", "GET /docs"]);
      } else if (conn.type === "ssh") {
        setItems([
          "shell", "exec <command>", "sysinfo", "disk", "mem", "procs", "net",
          "ports", "firewall [status|allow|deny|enable|disable]",
          "top", "netstat", "tail <file> [-f]", "edit <file>",
          "security-audit", "snapshot", "diff <snap1> <snap2>",
          "deploy <script>", "git-status", "compose <up|down|ps|logs|restart|pull>",
          "ls [path]", "cat <file>", "find <pattern> [path]", "du [path]",
          "services", "svc <action> <name>",
          "docker ps", "docker images", "docker stats", "docker logs [-f] <ctr>", "docker <start|stop|restart|rm> <ctr>",
          "users", "cron", "env", "pkgs [search]",
          "kill <pid> [signal]", "ping <host>",
          "upload <local> <remote>", "download <remote> <local>",
          "logs [service]", "logs docker <container>",
          "reboot yes", "shutdown yes", "close", "new",
        ]);
      } else if (conn.type === "git") {
        const git = manager as GitManager;
        const branches = await git.getBranches(conn);
        const statusFiles = await git.getStatus(conn);
        const log = await git.getLog(conn, { limit: 20 });
        const gitItems: string[] = [];
        for (const b of branches.filter(b => !b.isRemote)) {
          const marker = b.isCurrent ? "* " : "  ";
          const ahead = b.ahead > 0 ? ` +${b.ahead}` : "";
          const behind = b.behind > 0 ? ` -${b.behind}` : "";
          gitItems.push(`${marker}${b.name}${ahead}${behind} (${b.commitCount} commits)`);
        }
        gitItems.push("--- Commands ---");
        gitItems.push("status", "diff", "diff --staged", "log", "branches", "graph");
        gitItems.push("checkout <branch>", "branch <name>", "branch -d <name>");
        gitItems.push("stage [files...]", "unstage [files...]", "commit <message>");
        gitItems.push("merge <branch>", "rebase <branch>", "amend [message]");
        gitItems.push("fetch [remote]", "pull [remote] [branch]", "push [remote] [branch]");
        gitItems.push("cherry-pick <hash>", "revert <hash>", "blame <file>");
        gitItems.push("tags", "tag <name> [message]", "remotes", "remote-add <name> <url>");
        gitItems.push("exec <git args...>", "info", "refresh", "back", "close", "new");
        setItems(gitItems);
        setGitStatus(statusFiles);
        setGitBranches(branches);
        setGitLog(log);
      } else if (conn.type === "vmware") {
        const vmware = manager as VmwareManager;
        const vms = await vmware.listVms(conn);
        const vmItems: string[] = [];
        for (const vm of vms.slice(0, 200)) {
          const state = vm.power_state === "POWERED_ON" ? "ON " : vm.power_state === "POWERED_OFF" ? "OFF" : vm.power_state?.slice(0, 4) ?? "?";
          vmItems.push(`  ${vm.name}  [${state}]  ${vm.cpu_count}c  ${(vm.memory_size_MiB / 1024).toFixed(0)}GB  (${vm.vm})`);
        }
        vmItems.push("--- Commands ---");
        vmItems.push("vms", "hosts", "datastores", "networks");
        vmItems.push("info <vm>", "info-host <host>");
        vmItems.push("power-on <vm>", "power-off <vm>", "reset <vm>", "suspend <vm>");
        vmItems.push("snapshots <vm>", "snapshot <vm> [name]", "revert <vm> <snap>", "rmsnap <vm> <snap>");
        vmItems.push("events", "alarms", "task <id>");
        vmItems.push("info", "logs", "refresh", "back", "close", "new");
        setItems(vmItems);
      } else {
        const db = manager as DatabaseManager;
        try {
          const dbs = await db.listDatabases(conn);
          setItems([
            ...dbs,
            "tables <db>", "desc <db> <table>", "count <db> <table>",
            "sample <db> <table>", "size <db>", "indexes <db> <table>",
            "views <db>", "funcs <db>", "conns", "queries",
            "query <db> <sql>", "export <db> <table>", "explain <db> <sql>",
            "slow-queries", "logs", "back", "close", "new",
          ]);
        } catch {
          setItems([]);
        }
      }
    } catch (err) {
      setStatus(`[!] ${(err as Error).message}`);
    }
  }, [conn]);

  const handleSubmit = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (streamSendRef.current) {
      streamSendRef.current(trimmed);
      return;
    }
    if (!trimmed) return;
    setCmdHistory((h) => {
      if (h[h.length - 1] === trimmed) return h;
      return [...h, trimmed].slice(-100);
    });
    const lower = trimmed.toLowerCase();
    const parts = lower.split(/\s+/);
    const rawParts = trimmed.split(/\s+/);
    const command = parts[0];

    if (command === "back" || command === "home") {
      onBack();
      return;
    }

    if (command === "close" || command === "disconnect") {
      onClose();
      return;
    }

    if (command === "new" || command === "new-session") {
      if (onNewSession) onNewSession();
      return;
    }

    if (command === "quit" || command === "exit") {
      process.exit(0);
      return;
    }

    if (command === "refresh") {
      loadInitial();
      return;
    }

    if (command === "star" && rawParts[1]) {
      const cmd = trimmed.slice(5).trim();
      setFavorites(addFavorite(cmd));
      setStatus(`[ok] Starred: ${cmd}`);
      return;
    }
    if (command === "unstar" && rawParts[1]) {
      const cmd = trimmed.slice(7).trim();
      setFavorites(removeFavorite(cmd));
      setStatus(`[ok] Unstarred: ${cmd}`);
      return;
    }
    if (command === "favorites") {
      if (favorites.length === 0) {
        setStatus("[!] No favorites yet — use 'star <command>' to add one");
      } else {
        setOverlayContent(favorites.map((f) => `  ★ ${f}`));
        setOverlay("favorites");
        setOverlayScroll(0);
      }
      return;
    }

    if (command === "info" && !parts[1]) {
      const lines = Object.entries(info).map(([k, v]) => `  ${k}: ${v}`);
      setOverlayContent(lines);
      setOverlay("info");
      setOverlayScroll(0);
      return;
    }

    if (command === "logs" && conn.type !== "s3") {
      const manager = getManager(conn.type);
      if (manager?.getLogs) {
        const rest = trimmed.slice(5).trim();
        const opts = rest ? { service: rest } : {};
        try {
          const lines = await manager.getLogs(conn, opts);
          setOverlayContent(lines);
          setOverlay(rest ? `logs: ${rest}` : "logs");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
      } else {
        setStatus("[!] Logs not supported for this service type");
      }
      return;
    }

    // Redis commands
    if (conn.type === "redis") {
      const redis = getManager(conn.type) as RedisManager;
      if (command === "get" && parts[1]) {
        try {
          const val = await redis.get(conn, parts[1]);
          setOverlayContent([`  ${parts[1]}:`, `  ${val}`]);
          setOverlay("get");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "set" && parts[1] && parts[2]) {
        const value = trimmed.slice(trimmed.indexOf(parts[1]) + parts[1].length).trim();
        const ok = await redis.set(conn, parts[1], value);
        setStatus(ok ? `[ok] SET ${parts[1]}` : `[!] SET failed`);
        const keys = await redis.getKeys(conn);
        setItems(keys.slice(0, 200));
        return;
      }
      if (command === "del" && parts[1]) {
        const count = await redis.del(conn, parts[1]);
        setStatus(`[ok] Deleted ${count} key(s)`);
        const keys = await redis.getKeys(conn);
        setItems(keys.slice(0, 200));
        return;
      }
      if (command === "flushdb") {
        const ok = await redis.flushdb(conn);
        setStatus(ok ? "[ok] FLUSHDB" : "[!] FLUSHDB failed");
        setItems([]);
        return;
      }
      if (command === "keys" && parts[1]) {
        const keys = await redis.getKeys(conn, parts[1]);
        setItems(keys.slice(0, 200));
        setStatus(`Found ${keys.length} keys`);
        return;
      }
    }

    // S3 commands
    if (conn.type === "s3") {
      const s3 = getManager(conn.type) as StorageManager;
      if (command === "ls" && parts[1]) {
        try {
          const objects = await s3.listObjects(conn, parts[1]);
          const lines = objects.map((o: ObjectInfo) => `  ${o.key}  ${formatSize(o.size)}  ${o.lastModified}`);
          setOverlayContent(lines);
          setOverlay("objects");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "mkbucket" && parts[1]) {
        try {
          await s3.createBucket(conn, parts[1]);
          setStatus(`[ok] Created bucket: ${parts[1]}`);
          const buckets = await s3.listBuckets(conn);
          setItems(buckets);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "rmbucket" && parts[1]) {
        try {
          await s3.deleteBucket(conn, parts[1]);
          setStatus(`[ok] Deleted bucket: ${parts[1]}`);
          const buckets = await s3.listBuckets(conn);
          setItems(buckets);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "upload" && rawParts[1] && rawParts[2]) {
        try {
          const localFile = rawParts[1];
          const bucketKey = rawParts[2];
          const slashIdx = bucketKey.indexOf("/");
          if (slashIdx < 1) {
            setStatus("[!] Usage: upload <local> <bucket/key>");
            return;
          }
          const bucket = bucketKey.slice(0, slashIdx);
          const key = bucketKey.slice(slashIdx + 1);
          const { readFileSync } = await import("node:fs");
          const data = readFileSync(localFile);
          await s3.uploadObject(conn, bucket, key, data);
          setStatus(`[ok] Uploaded ${localFile} → ${bucket}/${key} (${formatSize(data.length)})`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "download" && rawParts[1] && rawParts[2]) {
        try {
          const bucketKey = rawParts[1];
          const localFile = rawParts[2];
          const slashIdx = bucketKey.indexOf("/");
          if (slashIdx < 1) {
            setStatus("[!] Usage: download <bucket/key> <local>");
            return;
          }
          const bucket = bucketKey.slice(0, slashIdx);
          const key = bucketKey.slice(slashIdx + 1);
          const data = await s3.downloadObject(conn, bucket, key);
          const { writeFileSync } = await import("node:fs");
          writeFileSync(localFile, data);
          setStatus(`[ok] Downloaded ${bucket}/${key} → ${localFile} (${formatSize(data.length)})`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "rm" && rawParts[1] && rawParts[2]) {
        try {
          const bucket = rawParts[1];
          const key = rawParts[2];
          await s3.deleteObject(conn, bucket, key);
          setStatus(`[ok] Deleted ${bucket}/${key}`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "presign" && rawParts[1] && rawParts[2]) {
        try {
          const bucket = rawParts[1];
          const key = rawParts[2];
          if (!s3.presignUrl) {
            setStatus("[!] Presign not supported");
            return;
          }
          const url = await s3.presignUrl(conn, bucket, key);
          setOverlayContent([`  ${url}`]);
          setOverlay("presigned URL");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
    }

    // HTTP commands
    if (conn.type === "http") {
      const http = getManager(conn.type) as HttpManager;
      if (command === "get" && parts[1]) {
        try {
          const resp = await http.get(conn, parts[1]);
          const lines = formatHttpResponse(resp);
          setOverlayContent(lines);
          setOverlay(`GET ${parts[1]} (${resp.status})`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "post" && parts[1]) {
        try {
          const body = parts[2] ? trimmed.slice(trimmed.indexOf(parts[1]) + parts[1].length).trim() : "";
          const resp = await http.post(conn, parts[1], body);
          const lines = formatHttpResponse(resp);
          setOverlayContent(lines);
          setOverlay(`POST ${parts[1]} (${resp.status})`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "put" && parts[1]) {
        try {
          const body = parts[2] ? trimmed.slice(trimmed.indexOf(parts[1]) + parts[1].length).trim() : "";
          const resp = await http.put(conn, parts[1], body);
          const lines = formatHttpResponse(resp);
          setOverlayContent(lines);
          setOverlay(`PUT ${parts[1]} (${resp.status})`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "patch" && parts[1]) {
        try {
          const body = parts[2] ? trimmed.slice(trimmed.indexOf(parts[1]) + parts[1].length).trim() : "";
          const resp = await http.patch(conn, parts[1], body);
          const lines = formatHttpResponse(resp);
          setOverlayContent(lines);
          setOverlay(`PATCH ${parts[1]} (${resp.status})`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "delete" && parts[1]) {
        try {
          const resp = await http.delete(conn, parts[1]);
          const lines = formatHttpResponse(resp);
          setOverlayContent(lines);
          setOverlay(`DELETE ${parts[1]} (${resp.status})`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
    }

    // SSH commands
    if (conn.type === "ssh") {
      const ssh = getManager(conn.type) as SshManager;
      if (command === "shell") {
        setPtyTitle(`shell: ${conn.username || "root"}@${conn.host}`);
        setOverlay(null);
        setOverlayContent([]);
        try {
          const termW = Math.max(20, (process.stdout.columns || 80) - 2);
          const termH = Math.max(8, (process.stdout.rows || 24) - 6);
          const pty = await ssh.openShell(conn, termW, termH, () => {});
          setPtyHandle(pty);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "exec") {
        const cmd = trimmed.slice(5).trim();
        if (!cmd) {
          setStatus("[!] Usage: exec <command>");
          return;
        }
        setPtyTitle(`exec: ${cmd}`);
        setOverlay(null);
        setOverlayContent([]);
        try {
          const termW = Math.max(20, (process.stdout.columns || 80) - 2);
          const termH = Math.max(8, (process.stdout.rows || 24) - 6);
          const pty = await ssh.execPty(conn, cmd, termW, termH, () => {});
          setPtyHandle(pty);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "sysinfo") {
        try {
          const info = await ssh.getInfo(conn);
          const lines = Object.entries(info).map(([k, v]) => `  ${k}: ${v}`);
          setOverlayContent(lines);
          setOverlay("system info");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "disk") {
        try {
          const result = await ssh.exec(conn, "df -h");
          const lines = result.stdout.split("\n").map((l) => `  ${l}`);
          setOverlayContent(lines);
          setOverlay("disk usage");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "mem") {
        try {
          const result = await ssh.exec(conn, "free -h 2>/dev/null || free");
          const lines = result.stdout.split("\n").map((l) => `  ${l}`);
          setOverlayContent(lines);
          setOverlay("memory");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "procs") {
        try {
          const result = await ssh.exec(conn, "ps aux | head -30");
          const lines = result.stdout.split("\n").map((l) => `  ${l}`);
          setOverlayContent(lines);
          setOverlay("processes");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "net") {
        try {
          const result = await ssh.exec(conn, "ss -tlnp 2>/dev/null || netstat -tlnp");
          const lines = result.stdout.split("\n").map((l) => `  ${l}`);
          setOverlayContent(lines);
          setOverlay("network");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "ports") {
        try {
          const result = await ssh.exec(conn, "ss -tlnp 2>/dev/null | head -50 || netstat -tlnp 2>/dev/null | head -50");
          const lines = result.stdout.split("\n").map((l) => `  ${l}`);
          setOverlayContent(lines);
          setOverlay("listening ports");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "firewall") {
        const sub = parts[1];
        try {
          if (sub === "status" || !sub) {
            const result = await ssh.exec(conn, "sudo ufw status verbose 2>/dev/null || sudo iptables -L -n 2>/dev/null | head -50");
            setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
            setOverlay("firewall status");
          } else if ((sub === "allow" || sub === "deny") && rawParts[2]) {
            const result = await ssh.exec(conn, `sudo ufw ${sub} ${rawParts[2]} 2>&1`);
            setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
            setOverlay(`firewall ${sub} ${rawParts[2]}`);
            setStatus(`[ok] ufw ${sub} ${rawParts[2]}`);
          } else if (sub === "enable") {
            const result = await ssh.exec(conn, "sudo ufw enable 2>&1");
            setStatus(`[ok] ufw enabled`);
            setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
            setOverlay("firewall enable");
          } else if (sub === "disable") {
            const result = await ssh.exec(conn, "sudo ufw disable 2>&1");
            setStatus(`[ok] ufw disabled`);
            setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
            setOverlay("firewall disable");
          } else {
            setStatus("[!] Usage: firewall [status|allow <port>|deny <port>|enable|disable]");
            return;
          }
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "top") {
        try {
          const result = await ssh.exec(conn, "ps aux --sort=-%cpu | head -25");
          const lines = result.stdout.split("\n").map((l) => `  ${l}`);
          setOverlayContent(lines);
          setOverlay("top processes by CPU");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "netstat") {
        try {
          const result = await ssh.exec(conn, "ss -tnp 2>/dev/null | head -50 || netstat -tnp 2>/dev/null | head -50");
          const lines = result.stdout.split("\n").map((l) => `  ${l}`);
          setOverlayContent(lines);
          setOverlay("active connections");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "tail" && rawParts[1]) {
        const file = rawParts[1];
        const follow = parts.includes("-f") || parts.includes("--follow");
        if (follow) {
          setPtyTitle(`tail -f ${file}`);
          setOverlay(null);
          setOverlayContent([]);
          try {
            const termW = Math.min(process.stdout.columns || 80, 200);
            const termH = Math.max(8, (process.stdout.rows || 24) - 6);
            const pty = await ssh.execPty(conn, `tail -f ${file}`, termW, termH, () => {});
            setPtyHandle(pty);
          } catch (err) {
            setStatus(`[!] ${(err as Error).message}`);
          }
        } else {
          try {
            const count = parts[2] && /^\d+$/.test(parts[2]) ? parts[2] : "100";
            const result = await ssh.exec(conn, `tail -n ${count} ${file} 2>&1`);
            setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
            setOverlay(`tail ${file}`);
            setOverlayScroll(0);
          } catch (err) {
            setStatus(`[!] ${(err as Error).message}`);
          }
        }
        return;
      }
      if (command === "edit" && rawParts[1]) {
        const editor = process.env.EDITOR || "nano";
        const file = rawParts[1];
        setPtyTitle(`edit: ${file}`);
        setOverlay(null);
        setOverlayContent([]);
        try {
          const termW = Math.min(process.stdout.columns || 80, 200);
          const termH = Math.max(8, (process.stdout.rows || 24) - 6);
          const pty = await ssh.execPty(conn, `${editor} ${file}`, termW, termH, () => {});
          setPtyHandle(pty);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "ls") {
        const path = trimmed.slice(2).trim() || ".";
        try {
          const result = await ssh.exec(conn, `ls -la ${path} 2>&1`);
          setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
          setOverlay(`ls ${path}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "cat" && rawParts[1]) {
        try {
          const result = await ssh.exec(conn, `cat ${rawParts[1]} 2>&1 | head -500`);
          setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
          setOverlay(`cat ${rawParts[1]}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "find" && rawParts[1]) {
        const path = rawParts[2] || ".";
        try {
          const result = await ssh.exec(conn, `find ${path} -iname '*${rawParts[1]}*' 2>/dev/null | head -200`);
          setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
          setOverlay(`find ${rawParts[1]}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "du") {
        const path = trimmed.slice(2).trim() || ".";
        try {
          const result = await ssh.exec(conn, `du -sh ${path}/* 2>/dev/null | sort -rh | head -30`);
          setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
          setOverlay(`du ${path}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "services") {
        try {
          const result = await ssh.exec(conn, "systemctl list-units --type=service --state=running --no-pager 2>/dev/null | head -50 || service --status-all 2>/dev/null | head -50");
          setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
          setOverlay("services");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "svc" && parts[1] && rawParts[2]) {
        const action = parts[1];
        const name = rawParts[2];
        const validActions = ["start", "stop", "restart", "status", "enable", "disable"];
        if (!validActions.includes(action)) {
          setStatus(`[!] Usage: svc <start|stop|restart|status|enable|disable> <service>`);
          return;
        }
        try {
          const cmd = action === "status" ? `systemctl status ${name} --no-pager 2>&1` : `sudo systemctl ${action} ${name} 2>&1`;
          const result = await ssh.exec(conn, cmd);
          const lines = result.stdout.split("\n").map((l) => `  ${l}`);
          setOverlayContent(lines.length > 0 ? lines : ["  (no output)"]);
          setOverlay(`svc ${action} ${name}`);
          setOverlayScroll(0);
          if (action !== "status") setStatus(`[ok] ${action} ${name}`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "docker" && parts[1]) {
        const action = parts[1];
        try {
          if (action === "ps") {
            const result = await ssh.exec(conn, "docker ps -a --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}' 2>&1");
            setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
            setOverlay("docker ps");
          } else if (action === "images") {
            const result = await ssh.exec(conn, "docker images --format 'table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}' 2>&1");
            setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
            setOverlay("docker images");
          } else if (["start", "stop", "restart", "rm"].includes(action) && rawParts[2]) {
            const result = await ssh.exec(conn, `sudo docker ${action} ${rawParts[2]} 2>&1`);
            setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
            setOverlay(`docker ${action} ${rawParts[2]}`);
            setStatus(`[ok] docker ${action} ${rawParts[2]}`);
          } else if (action === "stats") {
            const result = await ssh.exec(conn, "docker stats --no-stream 2>&1");
            setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
            setOverlay("docker stats");
          } else if (action === "logs" && rawParts[2]) {
            const container = rawParts[2];
            const follow = parts.includes("-f") || parts.includes("--follow");
            if (follow) {
              setPtyTitle(`docker logs -f ${container}`);
              setOverlay(null);
              setOverlayContent([]);
              try {
                const termW = Math.min(process.stdout.columns || 80, 200);
                const termH = Math.max(8, (process.stdout.rows || 24) - 6);
                const pty = await ssh.execPty(conn, `docker logs -f ${container}`, termW, termH, () => {});
                setPtyHandle(pty);
              } catch (err) {
                setStatus(`[!] ${(err as Error).message}`);
              }
            } else {
              const result = await ssh.exec(conn, `docker logs --tail 100 ${container} 2>&1`);
              setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
              setOverlay(`docker logs ${container}`);
            }
          } else {
            setStatus("[!] Usage: docker <ps|images|stats|logs [-f] <ctr>|start|stop|restart|rm> [container]");
            return;
          }
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "security-audit") {
        try {
          const lines: string[] = [];
          const checks: Array<[string, string]> = [
            ["SSH root login", "grep -E '^PermitRootLogin' /etc/ssh/sshd_config 2>/dev/null || echo 'not found'"],
            ["SSH password auth", "grep -E '^PasswordAuthentication' /etc/ssh/sshd_config 2>/dev/null || echo 'not found'"],
            ["Firewall (ufw)", "sudo ufw status 2>/dev/null || echo 'ufw not installed'"],
            ["fail2ban", "sudo fail2ban-client status 2>/dev/null || echo 'fail2ban not installed'"],
            ["Pending updates", "apt list --upgradable 2>/dev/null | wc -l || echo '0'"],
            ["Open ports", "ss -tlnp 2>/dev/null | head -20 || netstat -tlnp 2>/dev/null | head -20"],
            ["Last logins", "last -5 2>/dev/null || echo 'no data'"],
            ["Failed SSH logins", "grep 'Failed password' /var/log/auth.log 2>/dev/null | tail -10 || journalctl -u sshd --no-pager -n 10 2>/dev/null || echo 'no data'"],
          ];
          for (const [label, cmd] of checks) {
            const result = await ssh.exec(conn, cmd);
            lines.push(`  [${label}]`);
            for (const l of result.stdout.split("\n").slice(0, 10)) {
              if (l.trim()) lines.push(`    ${l}`);
            }
            lines.push("");
          }
          setOverlayContent(lines);
          setOverlay("security audit");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "snapshot") {
        try {
          const sections: Array<[string, string]> = [
            ["disk", "df -h"],
            ["memory", "free -h"],
            ["processes", "ps aux --sort=-%cpu | head -30"],
            ["services", "systemctl list-units --type=service --state=running 2>/dev/null | head -30"],
            ["ports", "ss -tlnp 2>/dev/null | head -30"],
            ["uptime", "uptime"],
            ["kernel", "uname -a"],
          ];
          const snap: Record<string, string> = { timestamp: new Date().toISOString(), host: conn.host };
          for (const [key, cmd] of sections) {
            const result = await ssh.exec(conn, cmd);
            snap[key] = result.stdout;
          }
          const { writeFileSync } = await import("node:fs");
          const { join } = await import("node:path");
          const { homedir } = await import("node:os");
          const filename = `snapshot_${conn.host}_${Date.now()}.json`;
          const filepath = join(homedir(), filename);
          writeFileSync(filepath, JSON.stringify(snap, null, 2), "utf-8");
          setStatus(`[ok] Snapshot saved to ${filepath}`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "diff" && rawParts[1] && rawParts[2]) {
        try {
          const { readFileSync } = await import("node:fs");
          const snap1 = JSON.parse(readFileSync(rawParts[1], "utf-8"));
          const snap2 = JSON.parse(readFileSync(rawParts[2], "utf-8"));
          const lines: string[] = [];
          const keys = new Set([...Object.keys(snap1), ...Object.keys(snap2)]);
          for (const key of keys) {
            if (key === "timestamp") continue;
            const v1 = snap1[key] ?? "(missing)";
            const v2 = snap2[key] ?? "(missing)";
            if (v1 !== v2) {
              lines.push(`  [${key}] CHANGED`);
              const l1 = String(v1).split("\n");
              const l2 = String(v2).split("\n");
              const maxLen = Math.max(l1.length, l2.length);
              for (let i = 0; i < maxLen; i++) {
                const a = l1[i] ?? "";
                const b = l2[i] ?? "";
                if (a !== b) {
                  if (a) lines.push(`    - ${a}`);
                  if (b) lines.push(`    + ${b}`);
                }
              }
              lines.push("");
            } else {
              lines.push(`  [${key}] unchanged`);
            }
          }
          setOverlayContent(lines.length > 0 ? lines : ["  No differences found"]);
          setOverlay("snapshot diff");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "deploy" && rawParts[1]) {
        const script = rawParts[1];
        setPtyTitle(`deploy: ${script}`);
        setOverlay(null);
        setOverlayContent([]);
        try {
          const termW = Math.min(process.stdout.columns || 80, 200);
          const termH = Math.max(8, (process.stdout.rows || 24) - 6);
          const pty = await ssh.execPty(conn, `bash ${script} 2>&1`, termW, termH, () => {});
          setPtyHandle(pty);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "git-status") {
        try {
          const result = await ssh.exec(conn,
            "find / -maxdepth 4 -name '.git' -type d 2>/dev/null | head -20 | while read g; do d=$(dirname \"$g\"); echo \"=== $d ===\"; git -C \"$d\" status --short 2>/dev/null; git -C \"$d\" log --oneline -3 2>/dev/null; echo; done");
          const lines = result.stdout.split("\n").map((l) => `  ${l}`);
          setOverlayContent(lines.length > 0 ? lines : ["  No git repositories found"]);
          setOverlay("git status");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "compose" && parts[1]) {
        const action = parts[1];
        const validActions = ["up", "down", "ps", "logs", "restart", "pull"];
        if (!validActions.includes(action)) {
          setStatus("[!] Usage: compose <up|down|ps|logs|restart|pull> [service]");
          return;
        }
        const follow = action === "logs" && (parts.includes("-f") || parts.includes("--follow"));
        const extra = rawParts.slice(2).join(" ");
        if (follow) {
          setPtyTitle(`docker compose logs -f`);
          setOverlay(null);
          setOverlayContent([]);
          try {
            const termW = Math.min(process.stdout.columns || 80, 200);
            const termH = Math.max(8, (process.stdout.rows || 24) - 6);
            const pty = await ssh.execPty(conn, `docker compose logs -f ${extra}`, termW, termH, () => {});
            setPtyHandle(pty);
          } catch (err) {
            setStatus(`[!] ${(err as Error).message}`);
          }
        } else {
          try {
            const cmd = action === "up" ? `docker compose up -d ${extra}` :
                        action === "down" ? `docker compose down ${extra}` :
                        action === "ps" ? `docker compose ps ${extra}` :
                        action === "logs" ? `docker compose logs --tail 100 ${extra}` :
                        action === "restart" ? `docker compose restart ${extra}` :
                        `docker compose pull ${extra}`;
            const result = await ssh.exec(conn, `${cmd} 2>&1`);
            setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
            setOverlay(`docker compose ${action}`);
            setOverlayScroll(0);
            setStatus(`[ok] docker compose ${action}`);
          } catch (err) {
            setStatus(`[!] ${(err as Error).message}`);
          }
        }
        return;
      }
      if (command === "users") {
        try {
          const result = await ssh.exec(conn, "who -a 2>/dev/null || w 2>/dev/null");
          setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
          setOverlay("logged in users");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "cron") {
        try {
          const result = await ssh.exec(conn, "crontab -l 2>&1");
          setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
          setOverlay("crontab");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "env") {
        try {
          const result = await ssh.exec(conn, "env 2>&1 | sort");
          setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
          setOverlay("environment");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "pkgs") {
        const search = trimmed.slice(4).trim();
        const base = "(dpkg -l 2>/dev/null | tail -n +6 || rpm -qa 2>/dev/null || pacman -Q 2>/dev/null)";
        const cmd = search ? `${base} | grep -i ${search} | head -100` : `${base} | head -200`;
        try {
          const result = await ssh.exec(conn, cmd, 60000);
          setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
          setOverlay(search ? `pkgs: ${search}` : "packages");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "kill" && parts[1]) {
        const signal = parts[2] ? `-${parts[2]}` : "";
        try {
          const result = await ssh.exec(conn, `kill ${signal} ${parts[1]} 2>&1 && echo "[ok] Killed ${parts[1]}"`);
          setStatus(result.stdout.trim() || `[ok] Sent kill to ${parts[1]}`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "ping" && rawParts[1]) {
        try {
          const result = await ssh.exec(conn, `ping -c 4 ${rawParts[1]} 2>&1`);
          setOverlayContent(result.stdout.split("\n").map((l) => `  ${l}`));
          setOverlay(`ping ${rawParts[1]}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "upload" && rawParts[1] && rawParts[2]) {
        try {
          setStatus("Uploading...");
          await ssh.uploadFile(conn, rawParts[1], rawParts[2]);
          setStatus(`[ok] Uploaded ${rawParts[1]} -> ${rawParts[2]}`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "download" && rawParts[1] && rawParts[2]) {
        try {
          setStatus("Downloading...");
          await ssh.downloadFile(conn, rawParts[1], rawParts[2]);
          setStatus(`[ok] Downloaded ${rawParts[1]} -> ${rawParts[2]}`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "reboot") {
        if (parts[1] !== "yes") {
          setStatus("[!] Type 'reboot yes' to confirm — this restarts the remote machine");
          return;
        }
        try {
          await ssh.exec(conn, "sudo reboot");
          setStatus("[ok] Reboot signal sent");
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "shutdown") {
        if (parts[1] !== "yes") {
          setStatus("[!] Type 'shutdown yes' to confirm — this powers off the remote machine");
          return;
        }
        try {
          await ssh.exec(conn, "sudo shutdown -h now");
          setStatus("[ok] Shutdown signal sent");
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
    }

    // Git commands
    if (conn.type === "git") {
      const git = getManager(conn.type) as GitManager;

      if (command === "status") {
        const files = await git.getStatus(conn);
        setGitStatus(files);
        const lines: string[] = [];
        const staged = files.filter(f => f.index !== " " && f.index !== "?");
        const unstaged = files.filter(f => f.working !== " " && f.working !== "?");
        const untracked = files.filter(f => f.index === "?" || f.working === "?");
        if (staged.length > 0) {
          lines.push(`  Staged (${staged.length}):`);
          for (const f of staged) lines.push(`    ${f.index}  ${f.path}`);
        }
        if (unstaged.length > 0) {
          lines.push(`  Unstaged (${unstaged.length}):`);
          for (const f of unstaged) lines.push(`    ${f.working}  ${f.path}`);
        }
        if (untracked.length > 0) {
          lines.push(`  Untracked (${untracked.length}):`);
          for (const f of untracked) lines.push(`    ??  ${f.path}`);
        }
        if (files.length === 0) lines.push("  Working tree clean");
        setOverlayContent(lines);
        setOverlay("git status");
        setOverlayScroll(0);
        return;
      }

      if (command === "diff") {
        const isStaged = parts.includes("--staged");
        const branch1 = rawParts.find(p => !p.startsWith("-") && p !== "diff" && p !== "--staged");
        const branch2Idx = rawParts.indexOf(branch1 || "") + 1;
        const branch2 = rawParts[branch2Idx];
        try {
          const diff = await git.getDiff(conn, {
            staged: isStaged,
            branch1: branch1 && branch2 ? branch1 : undefined,
            branch2: branch1 && branch2 ? branch2 : undefined,
          });
          const lines = formatGitDiff(diff);
          setOverlayContent(lines.length > 0 ? lines : ["  No changes"]);
          setOverlay(branch1 && branch2 ? `diff ${branch1}..${branch2}` : isStaged ? "diff --staged" : "diff");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "log" || command === "graph") {
        const log = await git.getLog(conn, { limit: 50 });
        setGitLog(log);
        const lines = formatGitLog(log);
        setOverlayContent(lines);
        setOverlay("git log --graph");
        setOverlayScroll(0);
        return;
      }

      if (command === "branches") {
        const branches = await git.getBranches(conn);
        setGitBranches(branches);
        const lines: string[] = [];
        for (const b of branches) {
          const marker = b.isCurrent ? "* " : "  ";
          const remote = b.isRemote ? " (remote)" : "";
          const ahead = b.ahead > 0 ? ` +${b.ahead}` : "";
          const behind = b.behind > 0 ? ` -${b.behind}` : "";
          const upstream = b.upstream ? ` -> ${b.upstream}` : "";
          lines.push(`  ${marker}${b.name}${remote}${ahead}${behind}${upstream}  ${b.lastCommit}  ${b.lastCommitDate}  (${b.commitCount})`);
        }
        setOverlayContent(lines.length > 0 ? lines : ["  No branches"]);
        setOverlay("branches");
        setOverlayScroll(0);
        return;
      }

      if (command === "checkout" && parts[1]) {
        const result = await git.checkout(conn, rawParts[1]);
        setStatus(result.exitCode === 0 ? `[ok] Switched to ${rawParts[1]}` : `[!] ${result.stderr.trim()}`);
        loadInitial();
        return;
      }

      if (command === "branch") {
        if (parts[1] === "-d" && parts[2]) {
          const result = await git.deleteBranch(conn, rawParts[2]);
          setStatus(result.exitCode === 0 ? `[ok] Deleted branch ${rawParts[2]}` : `[!] ${result.stderr.trim()}`);
        } else if (parts[1] && parts[1] !== "-d") {
          const result = await git.createBranch(conn, rawParts[1]);
          setStatus(result.exitCode === 0 ? `[ok] Created and switched to ${rawParts[1]}` : `[!] ${result.stderr.trim()}`);
        } else {
          setStatus("[!] Usage: branch <name> | branch -d <name>");
        }
        loadInitial();
        return;
      }

      if (command === "stage" || command === "add") {
        const files = parts.slice(1).length > 0 ? parts.slice(1) : undefined;
        const result = await git.stage(conn, files);
        setStatus(result.exitCode === 0 ? `[ok] Staged ${files ? files.join(", ") : "all"}` : `[!] ${result.stderr.trim()}`);
        const statusFiles = await git.getStatus(conn);
        setGitStatus(statusFiles);
        return;
      }

      if (command === "unstage" || command === "reset") {
        const files = parts.slice(1).length > 0 ? parts.slice(1) : undefined;
        const result = await git.unstage(conn, files);
        setStatus(result.exitCode === 0 ? `[ok] Unstaged ${files ? files.join(", ") : "all"}` : `[!] ${result.stderr.trim()}`);
        const statusFiles = await git.getStatus(conn);
        setGitStatus(statusFiles);
        return;
      }

      if (command === "commit" && parts[1]) {
        const msg = trimmed.slice(trimmed.indexOf(" ") + 1);
        const result = await git.commit(conn, msg);
        setStatus(result.exitCode === 0 ? `[ok] Committed: ${msg}` : `[!] ${result.stderr.trim()}`);
        loadInitial();
        return;
      }

      if (command === "amend") {
        const msg = parts[1] ? trimmed.slice(trimmed.indexOf(" ") + 1) : undefined;
        const result = await git.amend(conn, msg);
        setStatus(result.exitCode === 0 ? `[ok] Amended` : `[!] ${result.stderr.trim()}`);
        loadInitial();
        return;
      }

      if (command === "merge" && parts[1]) {
        const result = await git.merge(conn, rawParts[1]);
        setStatus(result.exitCode === 0 ? `[ok] Merged ${rawParts[1]}` : `[!] ${result.stderr.trim()}`);
        loadInitial();
        return;
      }

      if (command === "rebase" && parts[1]) {
        const result = await git.rebase(conn, rawParts[1]);
        setStatus(result.exitCode === 0 ? `[ok] Rebased onto ${rawParts[1]}` : `[!] ${result.stderr.trim()}`);
        loadInitial();
        return;
      }

      if (command === "fetch") {
        const remote = parts[1];
        const result = await git.fetch(conn, remote);
        setStatus(result.exitCode === 0 ? `[ok] Fetched${remote ? " from " + remote : ""}` : `[!] ${result.stderr.trim()}`);
        loadInitial();
        return;
      }

      if (command === "pull") {
        const remote = parts[1];
        const branch = parts[2];
        const result = await git.pull(conn, remote, branch);
        setStatus(result.exitCode === 0 ? `[ok] Pulled` : `[!] ${result.stderr.trim()}`);
        loadInitial();
        return;
      }

      if (command === "push") {
        const remote = parts[1];
        const branch = parts[2];
        const result = await git.push(conn, remote, branch);
        setStatus(result.exitCode === 0 ? `[ok] Pushed` : `[!] ${result.stderr.trim()}`);
        loadInitial();
        return;
      }

      if (command === "cherry-pick" && parts[1]) {
        const result = await git.cherryPick(conn, rawParts[1]);
        setStatus(result.exitCode === 0 ? `[ok] Cherry-picked ${rawParts[1]}` : `[!] ${result.stderr.trim()}`);
        loadInitial();
        return;
      }

      if (command === "revert" && parts[1]) {
        const result = await git.revert(conn, rawParts[1]);
        setStatus(result.exitCode === 0 ? `[ok] Reverted ${rawParts[1]}` : `[!] ${result.stderr.trim()}`);
        loadInitial();
        return;
      }

      if (command === "blame" && parts[1]) {
        try {
          const lines = await git.blame(conn, rawParts[1]);
          const formatted: string[] = [];
          for (const l of lines.slice(0, 100)) {
            formatted.push(`  ${l.hash.substring(0, 7)}  ${l.author.padEnd(15).substring(0, 15)}  ${l.lineNumber.toString().padStart(4)}  ${l.content}`);
          }
          setOverlayContent(formatted.length > 0 ? formatted : ["  No data"]);
          setOverlay(`blame ${rawParts[1]}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "tags") {
        const tags = await git.getTags(conn);
        const lines = tags.map(t => `  ${t.name}  ${t.hash}  ${t.date}  ${t.message}`);
        setOverlayContent(lines.length > 0 ? lines : ["  No tags"]);
        setOverlay("tags");
        setOverlayScroll(0);
        return;
      }

      if (command === "tag" && parts[1]) {
        const msg = parts[2] ? trimmed.slice(trimmed.indexOf(parts[1]) + parts[1].length).trim() : undefined;
        const result = await git.createTag(conn, rawParts[1], msg);
        setStatus(result.exitCode === 0 ? `[ok] Tagged ${rawParts[1]}` : `[!] ${result.stderr.trim()}`);
        return;
      }

      if (command === "remotes") {
        const remotes = await git.getRemotes(conn);
        const lines = remotes.map(r => `  ${r.name}  ${r.url}  (${r.type})`);
        setOverlayContent(lines.length > 0 ? lines : ["  No remotes"]);
        setOverlay("remotes");
        setOverlayScroll(0);
        return;
      }

      if (command === "remote-add" && parts[1] && parts[2]) {
        const result = await git.addRemote(conn, rawParts[1], rawParts[2]);
        setStatus(result.exitCode === 0 ? `[ok] Added remote ${rawParts[1]}` : `[!] ${result.stderr.trim()}`);
        return;
      }

      if (command === "exec") {
        const gitArgs = rawParts.slice(1);
        if (gitArgs.length === 0) {
          setStatus("[!] Usage: exec <git args...>");
          return;
        }
        const result = await git.exec(conn, gitArgs);
        const lines: string[] = [];
        if (result.stdout) for (const line of result.stdout.split("\n").slice(0, 100)) lines.push(`  ${line}`);
        if (result.stderr) for (const line of result.stderr.split("\n").slice(0, 50)) lines.push(`  [stderr] ${line}`);
        setOverlayContent(lines.length > 0 ? lines : [`  exit: ${result.exitCode}`]);
        setOverlay(`git ${gitArgs.join(" ")}`);
        setOverlayScroll(0);
        return;
      }
    }

    // VMware commands
    if (conn.type === "vmware") {
      const vmware = getManager(conn.type) as VmwareManager;

      if (command === "vms") {
        try {
          const vms = await vmware.listVms(conn);
          const lines: string[] = [];
          for (const vm of vms) {
            const state = vm.power_state === "POWERED_ON" ? "ON " : vm.power_state === "POWERED_OFF" ? "OFF" : (vm.power_state ?? "?").slice(0, 4);
            lines.push(`  ${vm.name}  [${state}]  ${vm.cpu_count}c  ${(vm.memory_size_MiB / 1024).toFixed(0)}GB  (${vm.vm})`);
          }
          if (lines.length === 0) lines.push("  No VMs found");
          setOverlayContent(lines);
          setOverlay("virtual machines");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "hosts") {
        try {
          const hosts = await vmware.listHosts(conn);
          const lines: string[] = [];
          for (const h of hosts) {
            const state = h.connection_state === "CONNECTED" ? "connected" : h.connection_state ?? "?";
            const memGB = (h.memory.size_MiB / 1024).toFixed(0);
            lines.push(`  ${h.name}  [${state}]  ${h.cpu.cores}c  ${memGB}GB  (${h.host})`);
          }
          if (lines.length === 0) lines.push("  No hosts found");
          setOverlayContent(lines);
          setOverlay("esxi hosts");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "datastores") {
        try {
          const dss = await vmware.listDatastores(conn);
          const lines: string[] = [];
          for (const ds of dss) {
            const freeGB = (ds.free_space / 1073741824).toFixed(1);
            const capGB = (ds.capacity / 1073741824).toFixed(1);
            lines.push(`  ${ds.name}  ${ds.type}  ${freeGB}/${capGB} GB free  (${ds.datastore})`);
          }
          if (lines.length === 0) lines.push("  No datastores found");
          setOverlayContent(lines);
          setOverlay("datastores");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "networks") {
        try {
          const nets = await vmware.listNetworks(conn);
          const lines: string[] = [];
          for (const n of nets) {
            lines.push(`  ${n.name}  ${n.type}  (${n.network})`);
          }
          if (lines.length === 0) lines.push("  No networks found");
          setOverlayContent(lines);
          setOverlay("networks");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "info" && parts[1]) {
        try {
          const vmId = await resolveVmId(vmware, conn, parts[1]);
          if (!vmId) {
            setStatus(`[!] VM not found: ${parts[1]}`);
            return;
          }
          const vm = await vmware.getVm(conn, vmId);
          const lines: string[] = [];
          lines.push(`  Name:    ${vm.name}`);
          lines.push(`  State:   ${vm.power_state}`);
          lines.push(`  CPU:     ${vm.hardware.cpu.count} vCPU`);
          lines.push(`  Memory:  ${(vm.hardware.memory_size_MiB / 1024).toFixed(1)} GB`);
          if (vm.guest?.os_type) lines.push(`  OS:      ${vm.guest.os_type}`);
          if (vm.guest?.ip_address) lines.push(`  IP:      ${vm.guest.ip_address}`);
          if (vm.guest?.host_name) lines.push(`  Host:    ${vm.guest.host_name}`);
          setOverlayContent(lines);
          setOverlay(`vm info: ${vm.name}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "info-host" && parts[1]) {
        try {
          const host = await vmware.getHost(conn, parts[1]);
          const lines: string[] = [];
          const h = host as Record<string, unknown>;
          const name = (h.name as string) ?? "unknown";
          const connState = (h.connection_state as string) ?? "unknown";
          const power = (h.power_state as string) ?? "unknown";
          lines.push(`  Name:       ${name}`);
          lines.push(`  Connection: ${connState}`);
          lines.push(`  Power:      ${power}`);
          const cpu = h.cpu as Record<string, number> | undefined;
          const mem = h.memory as Record<string, number> | undefined;
          if (cpu?.cores) lines.push(`  CPU cores:  ${cpu.cores}`);
          if (mem?.size_MiB) lines.push(`  Memory:     ${(mem.size_MiB / 1024).toFixed(1)} GB`);
          setOverlayContent(lines);
          setOverlay(`host info: ${name}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if ((command === "power-on" || command === "power-off" || command === "reset" || command === "suspend") && parts[1]) {
        try {
          const vmId = await resolveVmId(vmware, conn, parts[1]);
          if (!vmId) {
            setStatus(`[!] VM not found: ${parts[1]}`);
            return;
          }
          let taskId: string | null = null;
          let action = "";
          if (command === "power-on") { taskId = await vmware.powerOn(conn, vmId); action = "Power on"; }
          else if (command === "power-off") { taskId = await vmware.powerOff(conn, vmId); action = "Power off"; }
          else if (command === "reset") { taskId = await vmware.resetVm(conn, vmId); action = "Reset"; }
          else if (command === "suspend") { taskId = await vmware.suspendVm(conn, vmId); action = "Suspend"; }
          if (taskId) {
            setStatus(`[ok] ${action} initiated for ${parts[1]} — task: ${taskId}`);
          } else {
            setStatus(`[ok] ${action} completed for ${parts[1]}`);
          }
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "snapshots" && parts[1]) {
        try {
          const vmId = await resolveVmId(vmware, conn, parts[1]);
          if (!vmId) {
            setStatus(`[!] VM not found: ${parts[1]}`);
            return;
          }
          const tree = await vmware.listSnapshots(conn, vmId);
          const lines: string[] = [];
          const walk = (node: SnapshotTree | null | undefined, depth: number) => {
            if (!node) return;
            const indent = "  " + "  ".repeat(depth);
            const time = node.create_time ? `  ${node.create_time}` : "";
            lines.push(`${indent}${node.name}  (${node.snapshot})${time}`);
            if (node.description) lines.push(`${indent}  ${node.description}`);
            if (node.child_snapshots) {
              for (const child of node.child_snapshots) walk(child, depth + 1);
            }
          };
          if (tree) walk(tree, 0);
          if (lines.length === 0) lines.push("  No snapshots");
          setOverlayContent(lines);
          setOverlay(`snapshots: ${parts[1]}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "snapshot" && parts[1]) {
        try {
          const vmId = await resolveVmId(vmware, conn, parts[1]);
          if (!vmId) {
            setStatus(`[!] VM not found: ${parts[1]}`);
            return;
          }
          const snapName = rawParts[2] || `snap-${Date.now()}`;
          const taskId = await vmware.createSnapshot(conn, vmId, snapName);
          if (taskId) {
            setStatus(`[ok] Snapshot "${snapName}" creating for ${parts[1]} — task: ${taskId}`);
          } else {
            setStatus(`[ok] Snapshot "${snapName}" created for ${parts[1]}`);
          }
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "revert" && parts[1] && parts[2]) {
        try {
          const vmId = await resolveVmId(vmware, conn, parts[1]);
          if (!vmId) {
            setStatus(`[!] VM not found: ${parts[1]}`);
            return;
          }
          const taskId = await vmware.revertSnapshot(conn, vmId, parts[2]);
          if (taskId) {
            setStatus(`[ok] Reverting ${parts[1]} to ${parts[2]} — task: ${taskId}`);
          } else {
            setStatus(`[ok] Reverted ${parts[1]} to ${parts[2]}`);
          }
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "rmsnap" && parts[1] && parts[2]) {
        try {
          const vmId = await resolveVmId(vmware, conn, parts[1]);
          if (!vmId) {
            setStatus(`[!] VM not found: ${parts[1]}`);
            return;
          }
          const taskId = await vmware.deleteSnapshot(conn, vmId, parts[2]);
          if (taskId) {
            setStatus(`[ok] Deleting snapshot ${parts[2]} on ${parts[1]} — task: ${taskId}`);
          } else {
            setStatus(`[ok] Deleted snapshot ${parts[2]} on ${parts[1]}`);
          }
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "events" || command === "alarms") {
        try {
          const lines = await vmware.getLogs(conn, { tail: 100 });
          setOverlayContent(lines);
          setOverlay(command === "events" ? "events" : "alarms");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "task" && parts[1]) {
        try {
          const task = await vmware.getTask(conn, parts[1]);
          const lines: string[] = [];
          lines.push(`  Task:     ${parts[1]}`);
          lines.push(`  Status:   ${task.status}`);
          if (task.progress !== undefined) lines.push(`  Progress: ${task.progress}%`);
          if (task.start_time) lines.push(`  Started:  ${task.start_time}`);
          if (task.completion_time) lines.push(`  Finished: ${task.completion_time}`);
          if (task.error?.messages?.[0]?.default_message) lines.push(`  Error:    ${task.error.messages[0].default_message}`);
          setOverlayContent(lines);
          setOverlay(`task: ${parts[1]}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
    }

    // Database commands (postgres, mongo, mysql)
    if (conn.type === "postgres" || conn.type === "mysql" || conn.type === "mongo") {
      const db = getManager(conn.type) as DatabaseManager;

      if (command === "tables" && parts[1]) {
        try {
          const tables = await db.listTables(conn, parts[1]);
          setItems(tables);
          setSelectedIdx(0);
          setScrollOffset(0);
          setStatus(`[ok] ${tables.length} tables in ${parts[1]}`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "desc" && parts[1] && parts[2]) {
        try {
          const result = await db.describeTable(conn, parts[1], parts[2]);
          const lines = formatQueryResult(result);
          setOverlayContent(lines);
          setOverlay(`desc ${parts[2]}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "count" && parts[1] && parts[2]) {
        try {
          const count = await db.tableCount(conn, parts[1], parts[2]);
          setStatus(`[ok] ${parts[2]}: ${count} rows`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "sample" && parts[1] && parts[2]) {
        try {
          const limit = parts[3] ? parseInt(parts[3], 10) : 10;
          const result = await db.tableSample(conn, parts[1], parts[2], limit);
          const lines = formatQueryResult(result);
          setOverlayContent(lines);
          setOverlay(`sample ${parts[2]} (${result.rows.length} rows)`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "size" && parts[1]) {
        try {
          const result = await db.tableSize(conn, parts[1]);
          const lines = formatQueryResult(result);
          setOverlayContent(lines);
          setOverlay(`size ${parts[1]}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "indexes" && parts[1] && parts[2]) {
        try {
          const result = await db.listIndexes(conn, parts[1], parts[2]);
          const lines = formatQueryResult(result);
          setOverlayContent(lines);
          setOverlay(`indexes ${parts[2]}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "views" && parts[1]) {
        try {
          const views = await db.listViews(conn, parts[1]);
          setItems(views);
          setSelectedIdx(0);
          setScrollOffset(0);
          setStatus(`[ok] ${views.length} views in ${parts[1]}`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "funcs" && parts[1]) {
        try {
          const result = await db.listFunctions(conn, parts[1]);
          const lines = formatQueryResult(result);
          setOverlayContent(lines);
          setOverlay(`functions ${parts[1]}`);
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "conns") {
        try {
          const result = await db.activeConnections(conn);
          const lines = formatQueryResult(result);
          setOverlayContent(lines);
          setOverlay("active connections");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "queries") {
        try {
          const result = await db.runningQueries(conn);
          const lines = formatQueryResult(result);
          setOverlayContent(lines);
          setOverlay("running queries");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }

      if (command === "query" && parts[1]) {
        try {
          const dbName = parts[1];
          const queryStr = trimmed.slice(trimmed.indexOf(parts[1]) + parts[1].length).trim();
          const result = await db.query(conn, dbName, queryStr);
          const lines = formatQueryResult(result);
          setOverlayContent(lines);
          setOverlay("query");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "export" && parts[1] && rawParts[2]) {
        try {
          const dbName = parts[1];
          const table = rawParts[2];
          if (!db.exportQuery) {
            setStatus("[!] Export not supported for this database type");
            return;
          }
          const csv = await db.exportQuery(conn, dbName, table);
          if (!csv) {
            setStatus("[!] No data to export");
            return;
          }
          const { writeFileSync } = await import("node:fs");
          const { join } = await import("node:path");
          const { homedir } = await import("node:os");
          const filename = `${dbName}_${table}_${Date.now()}.csv`;
          const filepath = join(homedir(), filename);
          writeFileSync(filepath, csv, "utf-8");
          setStatus(`[ok] Exported ${csv.split("\n").length - 1} rows to ${filepath}`);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "explain" && parts[1]) {
        try {
          const dbName = parts[1];
          const sqlStr = trimmed.slice(trimmed.indexOf(parts[1]) + parts[1].length).trim();
          if (!db.explainQuery) {
            setStatus("[!] EXPLAIN not supported for this database type");
            return;
          }
          const result = await db.explainQuery(conn, dbName, sqlStr);
          const lines = formatQueryResult(result);
          setOverlayContent(lines);
          setOverlay("explain");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
      if (command === "slow-queries") {
        try {
          if (!db.slowQueries) {
            setStatus("[!] Slow queries not supported for this database type");
            return;
          }
          const result = await db.slowQueries(conn);
          const lines = formatQueryResult(result);
          setOverlayContent(lines);
          setOverlay("slow queries");
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
        }
        return;
      }
    }

    setStatus(`Unknown command: ${command}`);
  }, [conn, info, onBack, loadInitial]);

  useInput((input, key) => {
    if (ptyHandle) return;
    if (overlay) {
      if (key.escape) {
        if (streamCancelRef.current) {
          streamCancelRef.current();
          streamSendRef.current = null;
          streamCancelRef.current = null;
          setIsStreaming(false);
        }
        setOverlay(null);
        setOverlayContent([]);
      }
      if (key.upArrow) setOverlayScroll((o) => Math.max(0, o - 1));
      if (key.downArrow) setOverlayScroll((o) => o + 1);
      if (key.pageUp) setOverlayScroll((o) => Math.max(0, o - 10));
      if (key.pageDown) setOverlayScroll((o) => o + 10);
      return;
    }

    if (key.escape) {
      onBack();
      return;
    }
    if (key.pageUp) {
      setSelectedIdx((i) => {
        const ni = Math.max(0, i - maxItems);
        setScrollOffset(Math.max(0, ni - maxItems + 1));
        return ni;
      });
    }
    if (key.pageDown) {
      setSelectedIdx((i) => {
        const ni = Math.min(items.length - 1, i + maxItems);
        if (ni >= maxItems) setScrollOffset(ni - maxItems + 1);
        return ni;
      });
    }
  }, { isActive: focused && !ptyHandle });

  const maxScroll = Math.max(0, items.length - maxItems);
  const clampedScroll = Math.min(scrollOffset, maxScroll);
  const visibleItems = items.slice(clampedScroll, clampedScroll + maxItems);
  const itemLabel = conn.type === "s3" ? "Buckets" : conn.type === "redis" ? "Keys" : conn.type === "http" ? "Endpoints" : conn.type === "ssh" ? "Commands" : conn.type === "git" ? "Branches & Commands" : conn.type === "vmware" ? "Virtual Machines" : "Databases";

  useEffect(() => {
    if (!focused) return;
    setMouseHandler((event) => {
      if (event.type === "rightClick") {
        if (overlay) {
          setOverlay(null);
          setOverlayContent([]);
        } else {
          onBack();
        }
        return;
      }
      if (event.type !== "click" || overlay || ptyHandle) return;
      const tabsOff = (tabCount ?? 1) > 1 ? 2 : 0;
      const listStartY = 8 + tabsOff;
      const visibleIdx = event.y - listStartY;
      if (visibleIdx >= 0 && visibleIdx < visibleItems.length) {
        setSelectedIdx(clampedScroll + visibleIdx);
      }
    });
    return () => setMouseHandler(null);
  }, [focused, overlay, ptyHandle, tabCount, clampedScroll, visibleItems.length, onBack]);

  const overlayLines = overlayContent.slice(overlayScroll, overlayScroll + Math.max(1, availH - BOX_OVERHEAD));

  if (ptyHandle) {
    return (
      <Box flexDirection="column" width={termWidth} height={effectiveHeight} paddingX={margin} overflow="hidden">
        <Box marginBottom={1} height={1} flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row">
            <Breadcrumb items={["Home", "Connections", `${CONNECTION_ICONS[conn.type]} ${conn.name}`]} />
          </Box>
          <Text color={colors.textMuted}>{CONNECTION_LABELS[conn.type]} · {conn.host}:{conn.port}</Text>
        </Box>
        <TerminalOverlay
          pty={ptyHandle}
          title={ptyTitle}
          onDone={(result) => {
            setPtyHandle(null);
            if (result.exitCode !== 0) {
              setStatus(`[exit: ${result.exitCode}]`);
            } else {
              setStatus("[ok] command completed");
            }
          }}
          onCancel={() => {
            setPtyHandle(null);
            setStatus("[!] command cancelled");
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={termWidth} height={effectiveHeight} paddingX={margin} overflow="hidden">
      <Box marginBottom={1} height={1} flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row">
          <Breadcrumb items={["Home", "Connections", `${CONNECTION_ICONS[conn.type]} ${conn.name}`]} />
        </Box>
        <Text color={colors.textMuted}>{CONNECTION_LABELS[conn.type]} · {conn.host}:{conn.port}</Text>
      </Box>

      {overlay ? (
        <Box flexDirection="column" height={availH} overflow="hidden">
          <Box marginBottom={1} flexDirection="row" justifyContent="space-between">
            <Text color={colors.purpleBright} bold>{"  > "}{overlay}{isStreaming ? " [input mode — type and Enter to send]" : ""}</Text>
            <ScrollIndicator offset={overlayScroll} total={overlayContent.length} visible={Math.max(1, availH - BOX_OVERHEAD)} />
          </Box>
          <StyledBox title={overlay} focused variant="overlay" padding={1} height={availH - 2} overflow="hidden">
            <Box flexDirection="column">
              {overlayLines.map((line, i) => (
                <Box key={i}><Text color={i % 2 === 0 ? colors.text : colors.textMuted}>{line}</Text></Box>
              ))}
            </Box>
          </StyledBox>
        </Box>
      ) : (
        <Box flexDirection="column" height={availH} overflow="hidden">
          <StyledBox title={itemLabel} focused padding={1} height={listH} overflow="hidden" marginBottom={1}>
            <Box flexDirection="column">
              {items.length === 0 ? (
                <Text color={colors.textMuted}>{"  No items found."}</Text>
              ) : (
                visibleItems.map((item, i) => {
                  const realIdx = clampedScroll + i;
                  return (
                    <Box key={realIdx} flexDirection="row">
                      <Text color={realIdx === selectedIdx ? colors.purple : colors.textDim}>
                        {realIdx === selectedIdx ? ">" : " "}{" "}
                      </Text>
                      <Text color={realIdx === selectedIdx ? colors.textBright : (i % 2 === 0 ? colors.text : colors.textMuted)}>
                        {truncate(item, innerWidth - 4)}
                      </Text>
                    </Box>
                  );
                })
              )}
              {items.length > maxItems && (
                <Box marginTop={0}>
                  <ScrollIndicator offset={clampedScroll} total={items.length} visible={maxItems} />
                </Box>
              )}
            </Box>
          </StyledBox>

          <StyledBox title="Info" focused={false} padding={1} height={infoH} overflow="hidden">
            <Box flexDirection="column">
              {Object.entries(info).slice(0, infoH - BOX_OVERHEAD).map(([k, v]) => (
                <Box key={k}>
                  <Text color={colors.textMuted}>
                    {"  "}<Text color={colors.textDim}>{k}: </Text>
                    <Text color={colors.text}>{truncate(v, innerWidth - k.length - 6)}</Text>
                  </Text>
                </Box>
              ))}
              {status && (
                <Text color={status.startsWith("[ok]") ? colors.green : status.startsWith("[!]") ? colors.red : colors.textMuted}>
                  {"  "}{status}
                </Text>
              )}
              {items.length === 0 && (conn.type === "postgres" || conn.type === "mysql" || conn.type === "mongo") && (
                <Box flexDirection="column" marginTop={1}>
                  <Text color={colors.textDim}>{"  Commands:"}</Text>
                  <Text color={colors.textMuted}>{"    tables <db>          list tables in database"}</Text>
                  <Text color={colors.textMuted}>{"    desc <db> <table>    describe table structure"}</Text>
                  <Text color={colors.textMuted}>{"    count <db> <table>   count rows in table"}</Text>
                  <Text color={colors.textMuted}>{"    sample <db> <t> [n]  show sample rows"}</Text>
                  <Text color={colors.textMuted}>{"    size <db>            table sizes in database"}</Text>
                  <Text color={colors.textMuted}>{"    indexes <db> <table> list indexes"}</Text>
                  <Text color={colors.textMuted}>{"    views <db>           list views"}</Text>
                  <Text color={colors.textMuted}>{"    funcs <db>           list functions"}</Text>
                  <Text color={colors.textMuted}>{"    conns                active connections"}</Text>
                  <Text color={colors.textMuted}>{"    queries              running queries"}</Text>
                  <Text color={colors.textMuted}>{"    query <db> <sql>     run custom query"}</Text>
                </Box>
              )}
            </Box>
          </StyledBox>
        </Box>
      )}

      <Box marginTop={1}>
        <InputBar
          onSubmit={handleSubmit}
          focused={focused}
          onEmptySubmit={() => {
            const item = items[selectedIdx];
            if (item) handleSubmit(item);
          }}
          onNavigate={(dir) => {
            if (dir === "up") {
              setSelectedIdx((i) => {
                const ni = Math.max(0, i - 1);
                if (ni < scrollOffset) setScrollOffset(ni);
                return ni;
              });
            } else {
              setSelectedIdx((i) => {
                const ni = Math.min(items.length - 1, i + 1);
                if (ni >= scrollOffset + maxItems) setScrollOffset(ni - maxItems + 1);
                return ni;
              });
            }
          }}
          placeholder={isStreaming ? "type input · Enter to send · esc to cancel" : getPlaceholder(conn.type)}
          history={cmdHistory}
          completions={[...items, ...favorites]}
        />
      </Box>

      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={isStreaming ? [
            { key: "Enter", label: "send input" },
            { key: "esc", label: "cancel" },
          ] : [
            { key: "Up/Dn", label: "select" },
            { key: "Enter", label: "execute" },
            { key: "Tab", label: "autocomplete" },
            { key: "esc", label: "back" },
          ]}
        />
      </Box>
    </Box>
  );
}

function getPlaceholder(type: string): string {
  switch (type) {
    case "redis": return "get <key> · set <key> <val> · del <key> · keys <pattern> · flushdb · info · logs · refresh · back · close · new · quit";
    case "s3": return "ls <bucket> · mkbucket <name> · rmbucket <name> · upload <local> <bucket/key> · download <bucket/key> <local> · rm <bucket> <key> · presign <bucket> <key> · info · refresh · back · close · new · quit";
    case "postgres":
    case "mysql": return "tables <db> · desc <db> <t> · count <db> <t> · sample <db> <t> · size <db> · indexes <db> <t> · views <db> · funcs <db> · conns · queries · query <db> <sql> · export <db> <t> · explain <db> <sql> · slow-queries · logs · back · close · new · quit";
    case "mongo": return "tables <db> · desc <db> <coll> · count <db> <coll> · sample <db> <coll> · size <db> · indexes <db> <coll> · views <db> · funcs <db> · conns · queries · query <db> <json> · export <db> <coll> · explain <db> <json> · slow-queries · logs · back · close · new · quit";
    case "http": return "get <path> · post <path> <body> · put <path> <body> · patch <path> <body> · delete <path> · info · logs · refresh · back · close · new · quit";
    case "ssh": return "shell · exec <cmd> · ports · firewall · top · netstat · tail <f> · edit <f> · security-audit · snapshot · diff <s1> <s2> · deploy <script> · git-status · compose <up|down|ps|logs> · ls · cat · find · services · docker ps · docker logs · users · cron · pkgs · kill · ping · upload/download · logs · reboot yes · back · close · new · quit";
    case "git": return "status · diff [--staged] · log · branches · checkout <b> · branch <n> · merge <b> · rebase <b> · stage [f] · unstage [f] · commit <msg> · amend · fetch · pull · push · cherry-pick <h> · revert <h> · blame <f> · tags · tag <n> · remotes · exec <args> · info · refresh · back · close · new · quit";
    case "vmware": return "vms · hosts · datastores · networks · info <vm> · info-host <host> · power-on <vm> · power-off <vm> · reset <vm> · suspend <vm> · snapshots <vm> · snapshot <vm> [name] · revert <vm> <snap> · rmsnap <vm> <snap> · events · alarms · task <id> · logs · info · refresh · back · close · new · quit";
    default: return "info · refresh · back · close · new · quit";
  }
}

async function resolveVmId(vmware: VmwareManager, conn: ConnectionConfig, nameOrId: string): Promise<string | null> {
  if (nameOrId.startsWith("vm-")) return nameOrId;
  const vms = await vmware.listVms(conn);
  const found = vms.find(v => v.name === nameOrId || v.name.toLowerCase() === nameOrId.toLowerCase());
  return found?.vm ?? null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}

function formatQueryResult(result: QueryResult): string[] {
  const lines: string[] = [];
  if (result.columns.length > 0) {
    const colWidths = result.columns.map(c => Math.max(c.length, 12));
    lines.push("  " + result.columns.map((c, i) => pad(truncate(c, colWidths[i]), colWidths[i])).join(" │ "));
    lines.push("  " + "─".repeat(Math.min(result.columns.reduce((s, _, i) => s + colWidths[i] + 3, 0), 300)));
    for (const row of result.rows.slice(0, 200)) {
      const vals = result.columns.map((c, i) => pad(truncate(String(row[c] ?? ""), colWidths[i]), colWidths[i]));
      lines.push("  " + vals.join(" │ "));
    }
  }
  if (result.rows.length === 0) {
    lines.push("  (no rows)");
  }
  if (result.rows.length > 200) {
    lines.push(`  ... ${result.rows.length - 200} more rows`);
  }
  return lines;
}

function pad(str: string, len: number): string {
  if (str.length >= len) return str;
  return str + " ".repeat(len - str.length);
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, Math.max(1, len - 1)) + "…";
}

function formatHttpResponse(resp: { status: number; headers: Record<string, string>; body: unknown }): string[] {
  const lines: string[] = [];
  lines.push(`  Status: ${resp.status}`);
  const headerEntries = Object.entries(resp.headers).slice(0, 10);
  for (const [k, v] of headerEntries) {
    lines.push(`  ${k}: ${truncate(v, 80)}`);
  }
  lines.push("  ─────");
  if (typeof resp.body === "string") {
    try {
      const parsed = JSON.parse(resp.body);
      const formatted = JSON.stringify(parsed, null, 2);
      for (const line of formatted.split("\n").slice(0, 100)) {
        lines.push(`  ${line}`);
      }
    } catch {
      for (const line of resp.body.split("\n").slice(0, 100)) {
        lines.push(`  ${line}`);
      }
    }
  } else if (resp.body && typeof resp.body === "object") {
    const formatted = JSON.stringify(resp.body, null, 2);
    for (const line of formatted.split("\n").slice(0, 100)) {
      lines.push(`  ${line}`);
    }
  } else {
    lines.push("  (no body)");
  }
  return lines;
}

function formatGitDiff(diff: GitDiffResult): string[] {
  const lines: string[] = [];
  for (const file of diff.files) {
    lines.push(`  ${file.path}  (+${file.additions} -${file.deletions})`);
    for (const hunk of file.hunks) {
      lines.push(`  ${hunk.header}`);
      for (const line of hunk.lines) {
        const prefix = line.type === "add" ? "+" : line.type === "del" ? "-" : " ";
        lines.push(`  ${prefix} ${line.content}`);
      }
    }
    lines.push("");
  }
  return lines;
}

function formatGitLog(log: GitLogEntry[]): string[] {
  const lines: string[] = [];
  for (const entry of log) {
    const refs = entry.refs ? ` (${entry.refs})` : "";
    lines.push(`  ${entry.graph} ${entry.shortHash}  ${entry.message}${refs}`);
    lines.push(`         ${entry.author}  ${entry.date}`);
  }
  return lines;
}
