import type { DaemonProcess } from "../types.js";

export async function scanDaemons(): Promise<DaemonProcess[]> {
  const results: DaemonProcess[] = [];

  const pm2Daemons = await scanPm2();
  results.push(...pm2Daemons);

  const systemdDaemons = await scanSystemd();
  results.push(...systemdDaemons);

  return results;
}

async function scanPm2(): Promise<DaemonProcess[]> {
  try {
    const proc = Bun.spawn(["pm2", "jlist"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const list = JSON.parse(text) as any[];
    return list.map((p) => ({
      name: p.name ?? "unknown",
      pid: p.pid ?? 0,
      status: p.pm2_env?.status ?? "unknown",
      manager: "pm2" as const,
    }));
  } catch {
    return [];
  }
}

async function scanSystemd(): Promise<DaemonProcess[]> {
  try {
    const proc = Bun.spawn(
      ["systemctl", "list-units", "--type=service", "--state=running", "--no-legend", "--no-pager"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const lines = text.trim().split("\n");
    const results: DaemonProcess[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;
      const name = parts[0].replace(/\.service$/, "");
      const pidMatch = line.match(/(\d+)\s+/);
      results.push({
        name,
        pid: pidMatch ? parseInt(pidMatch[1], 10) : 0,
        status: "running",
        manager: "systemd",
      });
    }

    return results.slice(0, 20);
  } catch {
    return [];
  }
}
