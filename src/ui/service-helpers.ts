import { colors } from "./theme.js";

export type SshCategory = "all" | "shell" | "system" | "docker" | "ops" | "network";

export interface SshCommandItem {
  cmd: string;
  icon: string;
  category: Exclude<SshCategory, "all">;
  desc: string;
}

export const SSH_CATEGORIES: { id: SshCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "shell", label: "Shell" },
  { id: "system", label: "Sys" },
  { id: "docker", label: "Docker" },
  { id: "ops", label: "Ops" },
  { id: "network", label: "Net" },
];

export const SSH_COMMANDS: SshCommandItem[] = [
  // Shell & Files (strictly 1-column safe glyphs so terminal columns never misalign)
  { cmd: "shell", icon: ">", category: "shell", desc: "Open interactive bash PTY terminal" },
  { cmd: "exec <command>", icon: "$", category: "shell", desc: "Run a one-shot remote command" },
  { cmd: "ls [path]", icon: "▤", category: "shell", desc: "List directory contents" },
  { cmd: "cat <file>", icon: "▥", category: "shell", desc: "View file contents" },
  { cmd: "edit <file>", icon: "+", category: "shell", desc: "Edit file in nano/vim (PTY)" },
  { cmd: "tail <file> [-f]", icon: "≡", category: "shell", desc: "View or follow log file live" },
  { cmd: "find <pattern> [path]", icon: "?", category: "shell", desc: "Search files by name pattern" },
  { cmd: "upload <local> <remote>", icon: "↑", category: "shell", desc: "Upload file via SFTP" },
  { cmd: "download <remote> <local>", icon: "↓", category: "shell", desc: "Download file via SFTP" },

  // System
  { cmd: "sysinfo", icon: "◈", category: "system", desc: "OS, kernel, CPU, memory & uptime" },
  { cmd: "top", icon: "▲", category: "system", desc: "Top processes by CPU usage" },
  { cmd: "procs", icon: "▼", category: "system", desc: "List running processes" },
  { cmd: "disk", icon: "▪", category: "system", desc: "Disk usage across filesystems" },
  { cmd: "du [path]", icon: "▫", category: "system", desc: "Directory disk space breakdown" },
  { cmd: "mem", icon: "▣", category: "system", desc: "Memory & swap breakdown (free)" },
  { cmd: "users", icon: "◉", category: "system", desc: "Show logged-in users" },
  { cmd: "cron", icon: "◔", category: "system", desc: "Show scheduled cron jobs" },
  { cmd: "env", icon: "≡", category: "system", desc: "Show environment variables" },
  { cmd: "pkgs [search]", icon: "◇", category: "system", desc: "List or search installed packages" },
  { cmd: "kill <pid> [signal]", icon: "×", category: "system", desc: "Terminate a remote process" },

  // Docker & Services
  { cmd: "docker ps", icon: "▣", category: "docker", desc: "List Docker containers" },
  { cmd: "docker stats", icon: "◉", category: "docker", desc: "Container CPU/MEM metrics" },
  { cmd: "docker images", icon: "◇", category: "docker", desc: "List Docker images" },
  { cmd: "docker logs [-f] <ctr>", icon: "≡", category: "docker", desc: "View or follow container logs" },
  { cmd: "docker <start|stop|restart|rm> <ctr>", icon: "▸", category: "docker", desc: "Control a Docker container" },
  { cmd: "compose <up|down|ps|logs|restart|pull>", icon: "⊞", category: "docker", desc: "Docker Compose management" },
  { cmd: "services", icon: "◐", category: "docker", desc: "List systemd services" },
  { cmd: "svc <action> <name>", icon: "▸", category: "docker", desc: "Start, stop or restart service" },
  { cmd: "logs [service]", icon: "≡", category: "docker", desc: "View journalctl or syslog" },

  // Security & Ops
  { cmd: "security-audit", icon: "◆", category: "ops", desc: "8-point server security checklist" },
  { cmd: "snapshot", icon: "◎", category: "ops", desc: "Capture server state snapshot" },
  { cmd: "diff <snap1> <snap2>", icon: "⇄", category: "ops", desc: "Compare two server snapshots" },
  { cmd: "deploy <script>", icon: "▸", category: "ops", desc: "Execute a deployment script" },
  { cmd: "git-status", icon: "⎇", category: "ops", desc: "Find git repos & show status" },
  { cmd: "reboot yes", icon: "⟳", category: "ops", desc: "Reboot remote server" },
  { cmd: "shutdown yes", icon: "×", category: "ops", desc: "Power off remote server" },

  // Network
  { cmd: "ports", icon: "◆", category: "network", desc: "List listening TCP/UDP ports" },
  { cmd: "firewall [status|allow|deny|enable|disable]", icon: "◈", category: "network", desc: "UFW firewall status & rules" },
  { cmd: "net", icon: "▲", category: "network", desc: "Network interfaces & sockets" },
  { cmd: "netstat", icon: "⇄", category: "network", desc: "Active network connections" },
  { cmd: "ping <host>", icon: "◉", category: "network", desc: "Ping a remote host" },
];

export interface ParsedSshMetrics {
  hostname?: string;
  uptime?: string;
  kernel?: string;
  diskPct?: number;
  diskDetail?: string;
  memPct?: number;
  memDetail?: string;
}

function parseHumanSizeToMiB(raw: string): number | null {
  const m = raw.trim().match(/^([\d.]+)\s*([KMGTP]?i?B?)?$/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (isNaN(val)) return null;
  const unit = (m[2] ?? "").toUpperCase();
  if (unit.startsWith("T")) return val * 1024 * 1024;
  if (unit.startsWith("G")) return val * 1024;
  if (unit.startsWith("M")) return val;
  if (unit.startsWith("K")) return val / 1024;
  return val / (1024 * 1024);
}

export function parseSshMetrics(info: Record<string, string>): ParsedSshMetrics {
  const out: ParsedSshMetrics = {};
  if (info.hostname) out.hostname = info.hostname.trim();
  if (info.uptime) out.uptime = info.uptime.replace(/^up\s+/i, "").trim();
  if (info.os) {
    const parts = info.os.trim().split(/\s+/);
    out.kernel = parts.length >= 3 ? `${parts[0]} ${parts[2]}` : info.os.trim();
  }

  // Example df -h / | tail -1: "/dev/sda1  50G  18G  30G  38% /"
  if (info.disk) {
    const parts = info.disk.trim().split(/\s+/);
    const pctIdx = parts.findIndex((p) => /^\d+%$/.test(p));
    if (pctIdx >= 0) {
      out.diskPct = parseInt(parts[pctIdx], 10);
      if (pctIdx >= 3) {
        out.diskDetail = `${parts[pctIdx - 2]}/${parts[pctIdx - 3]}`;
      }
    }
  }

  // Example free -h | grep Mem: "Mem:  7.7Gi  2.1Gi  3.4Gi  ..."
  if (info.memory) {
    const parts = info.memory.trim().split(/\s+/);
    if (parts.length >= 3) {
      const totalStr = parts[1];
      const usedStr = parts[2];
      const totalMiB = parseHumanSizeToMiB(totalStr);
      const usedMiB = parseHumanSizeToMiB(usedStr);
      if (totalMiB && usedMiB !== null && totalMiB > 0) {
        out.memPct = Math.min(100, Math.round((usedMiB / totalMiB) * 100));
        out.memDetail = `${usedStr}/${totalStr}`;
      }
    }
  }

  return out;
}

export function getOverlayLineColor(line: string, index: number): string {
  const trimmed = line.trim();
  if (!trimmed) return colors.text;

  // Diff lines
  if (trimmed.startsWith("+") && !trimmed.startsWith("+++")) return colors.green;
  if (trimmed.startsWith("-") && !trimmed.startsWith("---") && !trimmed.startsWith("--")) return colors.red;
  if (trimmed.startsWith("@@")) return colors.cyan;

  // Headers / dividers
  if (
    trimmed.startsWith("===") ||
    trimmed.startsWith("---") ||
    trimmed.startsWith("───") ||
    trimmed.startsWith("◈")
  ) {
    return colors.purpleBright;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.includes("[!]") ||
    lower.includes("✗") ||
    lower.includes("error:") ||
    lower.includes("failed") ||
    lower.includes("critical") ||
    lower.includes("denied") ||
    lower.includes("fatal")
  ) {
    return colors.red;
  }
  if (
    lower.includes("warn") ||
    lower.includes("⚠") ||
    lower.includes("deprecated")
  ) {
    return colors.yellow;
  }
  if (
    lower.includes("[ok]") ||
    lower.includes("✓") ||
    lower.includes("pass") ||
    lower.includes("powered_on") ||
    lower.includes("running") ||
    lower.includes("active (running)")
  ) {
    return colors.green;
  }

  return index % 2 === 0 ? colors.text : colors.textDim;
}
