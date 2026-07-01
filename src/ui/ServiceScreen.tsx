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
import { TerminalOverlay } from "./components/TerminalOverlay.js";

interface ServiceScreenProps {
  conn: ConnectionConfig;
  onBack: () => void;
}

const BOX_OVERHEAD = 5;
const HEADER = 2;
const FOOTER = 4;

export function ServiceScreen({ conn, onBack }: ServiceScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
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

  const availH = Math.max(8, termHeight - HEADER - FOOTER);
  const listH = Math.floor(availH * 0.55);
  const infoH = Math.floor(availH * 0.35);

  const maxItems = Math.max(1, listH - BOX_OVERHEAD);

  useEffect(() => {
    loadInitial();
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
        setItems(buckets);
      } else if (conn.type === "http") {
        setItems(["GET /", "GET /health", "GET /status", "GET /api", "GET /docs"]);
      } else if (conn.type === "ssh") {
        setItems([
          "exec <command>", "sysinfo", "disk", "mem", "procs", "net",
          "ls [path]", "cat <file>", "find <pattern> [path]", "du [path]",
          "services", "svc <action> <name>",
          "docker ps", "docker images", "docker stats", "docker <start|stop|restart|rm> <ctr>",
          "users", "cron", "env", "pkgs [search]",
          "kill <pid> [signal]", "ping <host>",
          "upload <local> <remote>", "download <remote> <local>",
          "logs [service]", "logs docker <container>",
          "reboot yes", "shutdown yes",
        ]);
      } else {
        const db = manager as DatabaseManager;
        try {
          const dbs = await db.listDatabases(conn);
          setItems(dbs);
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
    const lower = trimmed.toLowerCase();
    const parts = lower.split(/\s+/);
    const rawParts = trimmed.split(/\s+/);
    const command = parts[0];

    if (command === "back" || command === "home") {
      onBack();
      return;
    }

    if (command === "refresh") {
      loadInitial();
      return;
    }

    if (command === "info") {
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
          const termW = Math.min(process.stdout.columns || 80, 200);
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
          } else {
            setStatus("[!] Usage: docker <ps|images|stats|start|stop|restart|rm> [container]");
            return;
          }
          setOverlayScroll(0);
        } catch (err) {
          setStatus(`[!] ${(err as Error).message}`);
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
    if (key.upArrow) setSelectedIdx((i) => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx((i) => Math.min(items.length - 1, i + 1));
    if (key.pageUp) setSelectedIdx((i) => Math.max(0, i - maxItems));
    if (key.pageDown) setSelectedIdx((i) => Math.min(items.length - 1, i + maxItems));
  });

  const visibleItems = items.slice(scrollOffset, scrollOffset + maxItems);
  const itemLabel = conn.type === "s3" ? "Buckets" : conn.type === "redis" ? "Keys" : conn.type === "http" ? "Endpoints" : conn.type === "ssh" ? "Commands" : "Databases";

  const overlayLines = overlayContent.slice(overlayScroll, overlayScroll + Math.max(1, availH - BOX_OVERHEAD));

  if (ptyHandle) {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight} paddingX={margin} overflow="hidden">
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
    <Box flexDirection="column" width={termWidth} height={termHeight} paddingX={margin} overflow="hidden">
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
                  const realIdx = scrollOffset + i;
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
                  <ScrollIndicator offset={scrollOffset} total={items.length} visible={maxItems} />
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
          placeholder={isStreaming ? "type input · Enter to send · esc to cancel" : getPlaceholder(conn.type)}
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
            { key: "esc", label: "back" },
          ]}
        />
      </Box>
    </Box>
  );
}

function getPlaceholder(type: string): string {
  switch (type) {
    case "redis": return "get <key> · set <key> <val> · del <key> · keys <pattern> · flushdb · info · logs · refresh · back";
    case "s3": return "ls <bucket> · mkbucket <name> · rmbucket <name> · info · refresh · back";
    case "postgres":
    case "mysql": return "tables <db> · desc <db> <t> · count <db> <t> · sample <db> <t> · size <db> · indexes <db> <t> · views <db> · funcs <db> · conns · queries · query <db> <sql> · logs · back";
    case "mongo": return "tables <db> · desc <db> <coll> · count <db> <coll> · sample <db> <coll> · size <db> · indexes <db> <coll> · views <db> · funcs <db> · conns · queries · query <db> <json> · logs · back";
    case "http": return "get <path> · post <path> <body> · put <path> <body> · patch <path> <body> · delete <path> · info · logs · refresh · back";
    case "ssh": return "exec <cmd> · ls · cat <f> · find <p> · services · svc <act> <n> · docker ps · users · cron · pkgs · kill <pid> · ping <h> · upload/download · logs · reboot yes · back";
    default: return "info · refresh · back";
  }
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
