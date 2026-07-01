import type { ConnectionConfig } from "../vault/types.js";
import type { ConnectionManager } from "./manager.js";

export class RedisManager implements ConnectionManager {
  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      const resp = await this.command(config, ["PING"]);
      return resp === "PONG";
    } catch {
      return false;
    }
  }

  async getInfo(config: ConnectionConfig): Promise<Record<string, string>> {
    const raw = await this.command(config, ["INFO"]);
    const rawStr = typeof raw === "string" ? raw : raw.join("\n");
    const info: Record<string, string> = {};
    for (const line of rawStr.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf(":");
      if (idx > 0) {
        info[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
      }
    }
    return info;
  }

  async getDbsize(config: ConnectionConfig): Promise<number> {
    const resp = await this.command(config, ["DBSIZE"]);
    return parseInt(typeof resp === "string" ? resp : "0", 10) || 0;
  }

  async getKeys(config: ConnectionConfig, pattern = "*"): Promise<string[]> {
    const resp = await this.command(config, ["KEYS", pattern]);
    if (typeof resp === "string") return [];
    return resp as string[];
  }

  async get(config: ConnectionConfig, key: string): Promise<string> {
    const resp = await this.command(config, ["GET", key]);
    return typeof resp === "string" ? resp : "";
  }

  async set(config: ConnectionConfig, key: string, value: string): Promise<boolean> {
    const resp = await this.command(config, ["SET", key, value]);
    return resp === "OK";
  }

  async del(config: ConnectionConfig, key: string): Promise<number> {
    const resp = await this.command(config, ["DEL", key]);
    return parseInt(typeof resp === "string" ? resp : "0", 10) || 0;
  }

  async flushdb(config: ConnectionConfig): Promise<boolean> {
    const resp = await this.command(config, ["FLUSHDB"]);
    return resp === "OK";
  }

  async selectDb(config: ConnectionConfig, db: number): Promise<boolean> {
    const resp = await this.command(config, ["SELECT", String(db)]);
    return resp === "OK";
  }

  async getLogs(config: ConnectionConfig, opts?: { tail?: number }): Promise<string[]> {
    const lines: string[] = [];
    try {
      const slowlog = await this.command(config, ["SLOWLOG", "GET", String(opts?.tail ?? 10)]);
      const slowStr = typeof slowlog === "string" ? slowlog : slowlog.join("\n");
      lines.push("  === SLOWLOG ===");
      for (const line of slowStr.split("\n")) {
        if (line.trim()) lines.push(`  ${line}`);
      }
    } catch {}
    try {
      const info = await this.command(config, ["INFO"]);
      const infoStr = typeof info === "string" ? info : info.join("\n");
      lines.push("  === INFO (stats) ===");
      for (const line of infoStr.split("\n")) {
        const t = line.trim();
        if (t && !t.startsWith("#") && (t.includes("connected") || t.includes("rejected") || t.includes("expired") || t.includes("evicted") || t.includes("keyspace") || t.includes("uptime"))) {
          lines.push(`  ${t}`);
        }
      }
    } catch {}
    return lines.length > 0 ? lines : ["  No logs available"];
  }

  private async command(config: ConnectionConfig, args: string[]): Promise<string | string[]> {
    const socket = await Bun.connect({
      hostname: config.host,
      port: config.port,
      tls: config.useTls ? undefined : undefined,
      socket: {
        data() {},
        error() {},
      },
    } as any);

    let authCmd = "";
    if (config.password) {
      if (config.username) {
        authCmd = `*3\r\n$6\r\nAUTH\r\n$${config.username.length}\r\n${config.username}\r\n$${config.password.length}\r\n${config.password}\r\n`;
      } else {
        authCmd = `*2\r\n$4\r\nAUTH\r\n$${config.password.length}\r\n${config.password}\r\n`;
      }
    }

    const fullCmd = authCmd + `*${args.length}\r\n` + args.map(a => `$${a.length}\r\n${a}\r\n`).join("");

    return new Promise((resolve, reject) => {
      let buffer = "";
      const socketAny = socket as any;

      socketAny.onData = (data: Uint8Array) => {
        buffer += new TextDecoder().decode(data);
      };

      socketAny.onClose = () => {
        try {
          const result = parseResp(buffer);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };

      socketAny.onError = (err: Error) => reject(err);

      socket.write(fullCmd);
      setTimeout(() => {
        try { socket.end(); } catch {}
      }, 3000);
    });
  }
}

function parseResp(data: string): string | string[] {
  const lines = data.split("\r\n");
  if (lines.length === 0) throw new Error("Empty response");

  const first = lines[0];
  if (first === "+PONG") return "PONG";
  if (first.startsWith("+")) return first.slice(1);
  if (first.startsWith("-")) throw new Error(first.slice(1));
  if (first.startsWith(":")) return first.slice(1);
  if (first.startsWith("$-1")) return "";
  if (first.startsWith("$")) {
    const len = parseInt(first.slice(1), 10);
    if (len < 0) return "";
    return lines[1] ?? "";
  }
  if (first.startsWith("*")) {
    const count = parseInt(first.slice(1), 10);
    const results: string[] = [];
    let idx = 1;
    for (let i = 0; i < count; i++) {
      if (lines[idx]?.startsWith("$")) {
        const len = parseInt(lines[idx].slice(1), 10);
        if (len >= 0) {
          results.push(lines[idx + 1] ?? "");
          idx += 2;
        } else {
          results.push("");
          idx += 1;
        }
      } else {
        idx++;
      }
    }
    return results;
  }
  return data.trim();
}
