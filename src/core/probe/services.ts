import type { ServiceInfo } from "../types.js";

export async function getServices(): Promise<ServiceInfo[]> {
  try {
    const proc = Bun.spawn(
      ["systemctl", "list-units", "--type=service", "--all", "--no-pager", "--no-legend"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const output = await new Response(proc.stdout).text();
    const services: ServiceInfo[] = [];
    for (const line of output.trim().split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const name = parts[0].replace(/\.service$/, "");
        services.push({
          name,
          loadState: parts[1] ?? "unknown",
          activeState: parts[2] ?? "unknown",
          subState: parts[3] ?? "unknown",
          description: parts.slice(4).join(" ") ?? "",
        });
      }
    }
    return services;
  } catch {
    return [];
  }
}

export async function controlService(name: string, action: "start" | "stop" | "restart"): Promise<boolean> {
  try {
    const proc = Bun.spawn(["systemctl", action, name], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

export async function getServiceLogs(name: string, lines: number = 50): Promise<string> {
  try {
    const proc = Bun.spawn(["journalctl", "-u", name, "-n", String(lines), "--no-pager"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    return output || "No logs available.";
  } catch {
    return "Failed to retrieve logs.";
  }
}
