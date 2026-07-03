import { hostname, cpus, totalmem, freemem, loadavg } from "node:os";
import { readFileSync } from "node:fs";
import type { HostInfo, DiskInfo } from "../types.js";

export async function getHostInfo(): Promise<HostInfo | null> {
  try {
    const hname = hostname();
    const cpuList = cpus();
    const cpuCores = cpuList.length;
    const cpuModel = cpuList[0]?.model ?? "unknown";
    const memTotal = totalmem();
    const memFree = freemem();
    const memUsed = memTotal - memFree;
    const la = loadavg();

    let osName = "unknown";
    let kernel = "unknown";
    try {
      const osRelease = readFileSync("/etc/os-release", "utf8");
      const nameMatch = osRelease.match(/^PRETTY_NAME="(.+)"/m);
      if (nameMatch) osName = nameMatch[1];
    } catch {}
    try {
      kernel = readFileSync("/proc/sys/kernel/osrelease", "utf8").trim();
    } catch {}

    let uptimeStr = "unknown";
    try {
      const uptimeRaw = readFileSync("/proc/uptime", "utf8");
      const uptimeSec = parseFloat(uptimeRaw.split(" ")[0]);
      uptimeStr = formatUptime(uptimeSec);
    } catch {}

    let swapTotal = 0;
    let swapUsed = 0;
    try {
      const meminfo = readFileSync("/proc/meminfo", "utf8");
      const swapTotalMatch = meminfo.match(/^SwapTotal:\s+(\d+)/m);
      const swapFreeMatch = meminfo.match(/^SwapFree:\s+(\d+)/m);
      if (swapTotalMatch) swapTotal = parseInt(swapTotalMatch[1]) * 1024;
      const swapFree = swapFreeMatch ? parseInt(swapFreeMatch[1]) * 1024 : 0;
      swapUsed = swapTotal - swapFree;
    } catch {}

    const disks = await getDiskInfo();

    return {
      hostname: hname,
      os: osName,
      kernel,
      uptime: uptimeStr,
      cpuCores,
      cpuModel,
      memoryTotal: memTotal,
      memoryUsed: memUsed,
      memoryFree: memFree,
      swapTotal,
      swapUsed,
      loadAvg: [la[0], la[1], la[2]],
      disks,
    };
  } catch {
    return null;
  }
}

async function getDiskInfo(): Promise<DiskInfo[]> {
  try {
    const proc = Bun.spawn(["df", "-h", "--output=source,target,size,used,avail,pcent"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const lines = output.trim().split("\n").slice(1);
    const disks: DiskInfo[] = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 6) {
        disks.push({
          filesystem: parts[0],
          mount: parts[1],
          size: parts[2],
          used: parts[3],
          avail: parts[4],
          usePercent: parts[5],
        });
      }
    }
    return disks;
  } catch {
    return [];
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
