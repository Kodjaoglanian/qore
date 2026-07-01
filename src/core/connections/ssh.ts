import type { ConnectionConfig } from "../vault/types.js";
import type { ConnectionManager } from "./manager.js";

export interface SshResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class SshManager implements ConnectionManager {
  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      const result = await this.exec(config, "echo ok");
      return result.exitCode === 0 && result.stdout.trim() === "ok";
    } catch {
      return false;
    }
  }

  async getInfo(config: ConnectionConfig): Promise<Record<string, string>> {
    try {
      const result = await this.exec(config, "uname -a");
      const info: Record<string, string> = {};
      if (result.stdout.trim()) {
        info["os"] = result.stdout.trim();
      }
      const hostResult = await this.exec(config, "hostname");
      if (hostResult.stdout.trim()) {
        info["hostname"] = hostResult.stdout.trim();
      }
      const uptimeResult = await this.exec(config, "uptime -p 2>/dev/null || uptime");
      if (uptimeResult.stdout.trim()) {
        info["uptime"] = uptimeResult.stdout.trim();
      }
      const diskResult = await this.exec(config, "df -h / 2>/dev/null | tail -1");
      if (diskResult.stdout.trim()) {
        info["disk"] = diskResult.stdout.trim();
      }
      const memResult = await this.exec(config, "free -h 2>/dev/null | grep Mem");
      if (memResult.stdout.trim()) {
        info["memory"] = memResult.stdout.trim();
      }
      return info;
    } catch {
      return {};
    }
  }

  async exec(config: ConnectionConfig, command: string): Promise<SshResult> {
    const { Client } = await import("ssh2");
    return new Promise((resolve, reject) => {
      const client = new Client();
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error("SSH connection timed out"));
      }, 15000);

      client.on("ready", () => {
        client.exec(command, (err: any, stream: any) => {
          if (err) {
            clearTimeout(timeout);
            client.end();
            reject(err);
            return;
          }
          let stdout = "";
          let stderr = "";
          stream.on("data", (data: Buffer) => { stdout += data.toString(); });
          stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
          stream.on("close", (code: number) => {
            clearTimeout(timeout);
            client.end();
            resolve({ exitCode: code ?? 0, stdout, stderr });
          });
        });
      });

      client.on("error", (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      const authConfig: any = {
        host: config.host,
        port: config.port,
        username: config.username ?? "root",
      };

      if (config.password) {
        authConfig.password = config.password;
      } else if (config.apiKey) {
        authConfig.privateKey = config.apiKey;
        if (config.apiSecret) {
          authConfig.passphrase = config.apiSecret;
        }
      }

      if (config.useTls) {
        authConfig.readyTimeout = 10000;
      }

      client.connect(authConfig);
    });
  }
}
