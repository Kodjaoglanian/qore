import { existsSync } from "node:fs";
import type { DockerContainer, DockerInfo, DockerImage } from "../types.js";

const DOCKER_SOCKET = "/var/run/docker.sock";

export async function isDockerAvailable(): Promise<boolean> {
  if (!existsSync(DOCKER_SOCKET)) return false;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (val: boolean) => {
      if (!settled) { settled = true; resolve(val); }
    };
    try {
      Bun.connect({
        unix: DOCKER_SOCKET,
        socket: {
          open(socket: any) {
            socket.end();
            done(true);
          },
          error() {
            done(false);
          },
        },
      } as any);
    } catch {
      done(false);
    }
    setTimeout(() => done(false), 3000);
  });
}

export async function getDockerInfo(): Promise<DockerInfo | null> {
  if (!existsSync(DOCKER_SOCKET)) return null;
  try {
    const raw = await dockerRequest("GET", "/info");
    const info = JSON.parse(raw);
    return {
      containers: info.Containers ?? 0,
      running: info.ContainersRunning ?? 0,
      paused: info.ContainersPaused ?? 0,
      stopped: info.ContainersStopped ?? 0,
      images: info.Images ?? 0,
      version: info.ServerVersion ?? "unknown",
    };
  } catch {
    return null;
  }
}

export async function getContainers(): Promise<DockerContainer[]> {
  if (!existsSync(DOCKER_SOCKET)) return [];
  try {
    const raw = await dockerRequest("GET", "/containers/json?all=true");
    const containers = JSON.parse(raw) as any[];
    return containers.map((c) => ({
      id: c.Id?.slice(0, 12) ?? "",
      name: c.Names?.[0]?.replace(/^\//, "") ?? "unknown",
      image: c.Image ?? "unknown",
      status: c.Status ?? "",
      state: c.State ?? "unknown",
      ports: (c.Ports ?? []).map(
        (p: any) =>
          `${p.IP ?? ""}:${p.PublicPort ?? ""}->${p.PrivatePort}/${p.Type ?? "tcp"}`
      ),
      created: c.Created ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function startContainer(id: string): Promise<boolean> {
  if (!existsSync(DOCKER_SOCKET)) return false;
  try {
    await dockerRequest("POST", `/containers/${id}/start`);
    return true;
  } catch {
    return false;
  }
}

export async function stopContainer(id: string): Promise<boolean> {
  if (!existsSync(DOCKER_SOCKET)) return false;
  try {
    await dockerRequest("POST", `/containers/${id}/stop`);
    return true;
  } catch {
    return false;
  }
}

export async function restartContainer(id: string): Promise<boolean> {
  if (!existsSync(DOCKER_SOCKET)) return false;
  try {
    await dockerRequest("POST", `/containers/${id}/restart`);
    return true;
  } catch {
    return false;
  }
}

export async function removeContainer(id: string): Promise<boolean> {
  if (!existsSync(DOCKER_SOCKET)) return false;
  try {
    await dockerRequest("DELETE", `/containers/${id}?force=true`);
    return true;
  } catch {
    return false;
  }
}

export async function getContainerLogs(id: string, lines: number = 50): Promise<string> {
  if (!existsSync(DOCKER_SOCKET)) return "";
  try {
    const raw = await dockerRequest("GET", `/containers/${id}/logs?stdout=true&stderr=true&tail=${lines}`);
    return raw;
  } catch {
    return "";
  }
}

export async function getDockerImages(): Promise<DockerImage[]> {
  if (!existsSync(DOCKER_SOCKET)) return [];
  try {
    const raw = await dockerRequest("GET", "/images/json");
    const images = JSON.parse(raw) as any[];
    return images.map((img) => ({
      id: img.Id?.slice(7, 19) ?? "",
      tags: img.RepoTags ?? ["<none>"],
      size: img.Size ?? 0,
      created: img.Created ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function removeImage(id: string): Promise<boolean> {
  if (!existsSync(DOCKER_SOCKET)) return false;
  try {
    await dockerRequest("DELETE", `/images/${id}?force=true`);
    return true;
  } catch {
    return false;
  }
}

export async function pruneImages(): Promise<number> {
  if (!existsSync(DOCKER_SOCKET)) return 0;
  try {
    const raw = await dockerRequest("POST", "/images/prune");
    const result = JSON.parse(raw);
    return result.ImagesDeleted?.length ?? 0;
  } catch {
    return 0;
  }
}

export async function pruneStoppedContainers(): Promise<number> {
  if (!existsSync(DOCKER_SOCKET)) return 0;
  try {
    const raw = await dockerRequest("POST", "/containers/prune");
    const result = JSON.parse(raw);
    return result.ContainersDeleted?.length ?? 0;
  } catch {
    return 0;
  }
}

export async function inspectContainer(id: string): Promise<string> {
  if (!existsSync(DOCKER_SOCKET)) return "";
  try {
    const raw = await dockerRequest("GET", `/containers/${id}/json`);
    const info = JSON.parse(raw);
    const lines = [
      `ID:       ${info.Id ?? ""}`,
      `Name:     ${info.Name ?? ""}`,
      `Image:    ${info.Config?.Image ?? ""}`,
      `State:    ${info.State?.Status ?? ""}`,
      `Started:  ${info.State?.StartedAt ?? "N/A"}`,
      `Finished: ${info.State?.FinishedAt ?? "N/A"}`,
      `Restart:  ${info.RestartCount ?? 0} times`,
      `Network:  ${Object.keys(info.NetworkSettings?.Networks ?? {}).join(", ") || "none"}`,
      `IP:       ${info.NetworkSettings?.IPAddress ?? "N/A"}`,
      `Ports:    ${(info.Ports ?? []).map((p: any) => `${p.PrivatePort}/${p.Type}`).join(", ") || "none"}`,
      `Mounts:   ${(info.Mounts ?? []).map((m: any) => m.Destination).join(", ") || "none"}`,
      `Cmd:      ${(info.Config?.Cmd ?? []).join(" ") || "N/A"}`,
      `Env:      ${(info.Config?.Env ?? []).slice(0, 5).join(", ") || "none"}`,
    ];
    return lines.join("\n");
  } catch {
    return "Failed to inspect container.";
  }
}

async function dockerRequest(method: string, path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let fullData = "";
    let settled = false;
    let socket: any;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    try {
      socket = Bun.connect({
        unix: DOCKER_SOCKET,
        socket: {
          open(s: any) {
            const req = `${method} ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`;
            s.write(req);
          },
          data(_s: any, data: Uint8Array) {
            fullData += new TextDecoder().decode(data);
          },
          end(s: any) {
            try { s.end(); } catch {}
            settle(() => {
              const headerEnd = fullData.indexOf("\r\n\r\n");
              if (headerEnd === -1) {
                resolve("");
                return;
              }
              const body = fullData.slice(headerEnd + 4);
              const headers = fullData.slice(0, headerEnd).toLowerCase();
              if (headers.includes("transfer-encoding: chunked")) {
                resolve(parseChunked(body));
              } else {
                resolve(body.trim());
              }
            });
          },
          error(_s: any, err: Error) {
            settle(() => reject(err));
          },
        },
      } as any);
    } catch (err) {
      settle(() => reject(err as Error));
    }

    setTimeout(() => {
      settle(() => {
        try { if (socket) socket.end(); } catch {}
        resolve("");
      });
    }, 5000);
  });
}

function parseChunked(body: string): string {
  let result = "";
  let pos = 0;
  while (pos < body.length) {
    const lineEnd = body.indexOf("\r\n", pos);
    if (lineEnd === -1) break;
    const size = parseInt(body.slice(pos, lineEnd), 16);
    if (isNaN(size) || size === 0) break;
    const dataStart = lineEnd + 2;
    result += body.slice(dataStart, dataStart + size);
    pos = dataStart + size + 2;
  }
  return result;
}

export interface ContainerStats {
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memPercent: number;
  netInput: number;
  netOutput: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
}

export async function getContainerStats(id: string): Promise<ContainerStats | null> {
  if (!existsSync(DOCKER_SOCKET)) return null;
  try {
    const raw = await dockerRequest("GET", `/containers/${id}/stats?stream=false`);
    const stats = JSON.parse(raw);
    const memUsage = stats.memory_stats?.usage ?? 0;
    const memLimit = stats.memory_stats?.limit ?? 0;
    const memPercent = memLimit > 0 ? (memUsage / memLimit) * 100 : 0;

    let cpuPercent = 0;
    const cpuDelta = stats.cpu_stats?.cpu_usage?.total_usage - stats.precpu_stats?.cpu_usage?.total_usage;
    const systemDelta = stats.cpu_stats?.system_cpu_usage - stats.precpu_stats?.system_cpu_usage;
    const onlineCpus = stats.cpu_stats?.online_cpus ?? 1;
    if (systemDelta > 0 && cpuDelta > 0) {
      cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100;
    }

    const netInput = stats.networks?.eth0?.rx_bytes ?? 0;
    const netOutput = stats.networks?.eth0?.tx_bytes ?? 0;
    const blockRead = stats.blkio_stats?.io_service_bytes_recursive?.find((b: any) => b.op === "Read")?.value ?? 0;
    const blockWrite = stats.blkio_stats?.io_service_bytes_recursive?.find((b: any) => b.op === "Write")?.value ?? 0;
    const pids = stats.pids_stats?.current ?? 0;

    return { cpuPercent, memUsage, memLimit, memPercent, netInput, netOutput, blockRead, blockWrite, pids };
  } catch {
    return null;
  }
}

export async function execInContainer(id: string, command: string): Promise<string> {
  if (!existsSync(DOCKER_SOCKET)) return "Docker not available";
  try {
    const createProc = Bun.spawn([
      "curl", "-s", "--unix-socket", DOCKER_SOCKET,
      "-X", "POST", "-H", "Content-Type: application/json",
      "-d", JSON.stringify({ AttachStdout: true, AttachStderr: true, Cmd: ["sh", "-c", command] }),
      `http://localhost/containers/${id}/exec`,
    ], { stdout: "pipe", stderr: "pipe" });
    const createRaw = await new Response(createProc.stdout).text();
    const execInfo = JSON.parse(createRaw);
    const execId = execInfo.Id;

    const startProc = Bun.spawn([
      "curl", "-s", "--unix-socket", DOCKER_SOCKET,
      "-X", "POST", "-H", "Content-Type: application/json",
      `http://localhost/exec/${execId}/start`,
    ], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(startProc.stdout).text();
    return output || "(no output)";
  } catch (err) {
    return `Error: ${err}`;
  }
}

export async function batchAction(action: "start" | "stop" | "restart", ids: string[]): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await dockerRequest("POST", `/containers/${id}/${action}`);
      success++;
    } catch {
      failed++;
    }
  }
  return { success, failed };
}
