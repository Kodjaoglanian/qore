import type { ProcessInfo } from "../types.js";

export async function getTopProcesses(count: number = 20): Promise<ProcessInfo[]> {
  try {
    const proc = Bun.spawn(["ps", "aux", "--sort=-%cpu"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const lines = output.trim().split("\n").slice(1);
    const processes: ProcessInfo[] = [];
    for (const line of lines.slice(0, count)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 11) {
        processes.push({
          pid: parseInt(parts[1]) || 0,
          user: parts[0],
          cpu: parseFloat(parts[2]) || 0,
          mem: parseFloat(parts[3]) || 0,
          command: parts.slice(10).join(" "),
        });
      }
    }
    return processes;
  } catch {
    return [];
  }
}

export async function killProcess(pid: number, signal: string = "TERM"): Promise<boolean> {
  try {
    const proc = Bun.spawn(["kill", `-${signal}`, String(pid)], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}
