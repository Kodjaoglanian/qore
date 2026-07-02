import type { ConnectionConfig } from "../vault/types.js";
import type { ConnectionManager } from "./manager.js";
import { readFileSync } from "fs";

export interface SshResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ExecStreamHandle {
  result: Promise<SshResult>;
  send: (input: string) => void;
  cancel: () => void;
}

export interface PtyHandle {
  stream: any;
  client: any;
  send: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => Promise<SshResult>;
  cancel: () => void;
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function normalizeCr(str: string): string {
  return str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function cleanOutput(str: string): string {
  return normalizeCr(stripAnsi(str));
}

export class SshManager implements ConnectionManager {
  lastError: string | null = null;

  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      this.lastError = null;
      console.error("SSH DEBUG — testConnection to", config.host, ":", config.port, "user:", config.username);
      const result = await this.exec(config, "echo ok");
      console.error("SSH DEBUG — exec result:", JSON.stringify(result));
      return result.exitCode === 0 && result.stdout.trim() === "ok";
    } catch (err) {
      console.error("SSH DEBUG — testConnection caught:", (err as Error).message);
      console.error("SSH DEBUG — full error:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
      this.lastError = (err as Error).message;
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

  private async connectClient(config: ConnectionConfig): Promise<any> {
    const { Client } = await import("ssh2");
    return new Promise((resolve, reject) => {
      const client = new Client();
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error("SSH connection timed out"));
      }, 15000);

      client.on("ready", () => {
        clearTimeout(timeout);
        resolve(client);
      });

      client.on("error", (err: Error & { code?: string; level?: string }) => {
        clearTimeout(timeout);
        console.error("SSH DEBUG — Error:", err.message, "| code:", err.code, "| level:", err.level);
        if (err.stack) console.error("SSH DEBUG — Stack:", err.stack);
        reject(err);
      });

      const authConfig: any = {
        host: config.host,
        port: config.port,
        username: config.username ?? "root",
      };

      if (config.password) {
        authConfig.password = config.password;
      } else if (config.extra?.keyPath) {
        const keyPath = config.extra.keyPath.replace("~", process.env.HOME || "");
        try {
          authConfig.privateKey = readFileSync(keyPath, "utf-8");
          if (config.apiSecret) {
            authConfig.passphrase = config.apiSecret;
          }
        } catch {
          reject(new Error(`Cannot read SSH key: ${keyPath}`));
          return;
        }
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

  async exec(config: ConnectionConfig, command: string, timeoutMs?: number, usePty?: boolean): Promise<SshResult> {
    const client = await this.connectClient(config);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error("Command execution timed out"));
      }, timeoutMs ?? 30000);

      const hasSudo = /\bsudo\b/.test(command);
      const finalCommand = hasSudo && config.password
        ? command.replace(/\bsudo\b/g, "sudo -S")
        : command;

      const execOpts: any = (hasSudo || usePty)
        ? { pty: { term: "xterm-256color", cols: 220, rows: 50 } }
        : {};
      client.exec(finalCommand, execOpts, (err: any, stream: any) => {
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

        if (hasSudo && config.password) {
          stream.write(config.password + "\n");
        }

        stream.on("close", (code: number) => {
          clearTimeout(timeout);
          client.end();
          stdout = cleanOutput(stdout);
          stderr = cleanOutput(stderr);
          if (hasSudo && config.password) {
            const lines = stdout.split("\n");
            if (lines[0] && /[Pp]assword/.test(lines[0])) {
              lines.shift();
            }
            stdout = lines.join("\n");
          }
          resolve({ exitCode: code ?? 0, stdout, stderr });
        });
      });
    });
  }

  async execStream(
    config: ConnectionConfig,
    command: string,
    onData: (chunk: string) => void,
    timeoutMs?: number,
    usePty?: boolean,
  ): Promise<ExecStreamHandle> {
    const client = await this.connectClient(config);

    return new Promise<ExecStreamHandle>((resolve, reject) => {
      const hasSudo = /\bsudo\b/.test(command);
      const finalCommand = hasSudo && config.password
        ? command.replace(/\bsudo\b/g, "sudo -S")
        : command;

      const execOpts: any = (hasSudo || usePty)
        ? { pty: { term: "xterm-256color", cols: 220, rows: 50 } }
        : {};
      client.exec(finalCommand, execOpts, (err: any, stream: any) => {
        if (err) {
          client.end();
          reject(err);
          return;
        }

        const send = (input: string) => {
          try { stream.write(input + "\n"); } catch {}
        };

        const cancel = () => {
          try { client.end(); } catch {}
        };

        const result = new Promise<SshResult>((res, rej) => {
          const timeout = setTimeout(() => {
            client.end();
            rej(new Error("Command execution timed out"));
          }, timeoutMs ?? 120000);

          let stdout = "";
          let stderr = "";
          let firstData = true;

          stream.on("data", (data: Buffer) => {
            const raw = data.toString();
            stdout += raw;
            const cleaned = cleanOutput(raw);
            if (cleaned) {
              if (hasSudo && config.password && firstData && /[Pp]assword/.test(cleaned)) {
                firstData = false;
                return;
              }
              firstData = false;
              onData(cleaned);
            }
          });
          stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

          if (hasSudo && config.password) {
            stream.write(config.password + "\n");
          }

          stream.on("close", (code: number) => {
            clearTimeout(timeout);
            client.end();
            stdout = cleanOutput(stdout);
            stderr = cleanOutput(stderr);
            if (hasSudo && config.password) {
              const lines = stdout.split("\n");
              if (lines[0] && /[Pp]assword/.test(lines[0])) {
                lines.shift();
              }
              stdout = lines.join("\n");
            }
            res({ exitCode: code ?? 0, stdout, stderr });
          });
        });

        resolve({ result, send, cancel });
      });
    });
  }

  async execPty(
    config: ConnectionConfig,
    command: string,
    cols: number,
    rows: number,
    onData: (data: string) => void,
  ): Promise<PtyHandle> {
    const client = await this.connectClient(config);

    return new Promise<PtyHandle>((resolve, reject) => {
      const hasSudo = /\bsudo\b/.test(command);
      const finalCommand = hasSudo && config.password
        ? command.replace(/\bsudo\b/g, "sudo -S")
        : command;

      const ptyOpts = { term: "xterm-256color", cols, rows };
      client.exec(finalCommand, { pty: ptyOpts }, (err: any, stream: any) => {
        if (err) {
          client.end();
          reject(err);
          return;
        }

        stream.on("data", (data: Buffer) => {
          onData(data.toString());
        });

        if (hasSudo && config.password) {
          stream.write(config.password + "\n");
        }

        const send = (input: string) => {
          try { stream.write(input); } catch {}
        };

        const resize = (c: number, r: number) => {
          try { stream.setWindow(r, c, 0, 0); } catch {}
        };

        const cancel = () => {
          try { client.end(); } catch {}
        };

        const close = (): Promise<SshResult> => {
          return new Promise((res) => {
            let stdout = "";
            let stderr = "";
            stream.on("data", (d: Buffer) => { stdout += d.toString(); });
            stream.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
            stream.on("close", (code: number) => {
              client.end();
              res({ exitCode: code ?? 0, stdout, stderr });
            });
          });
        };

        resolve({ stream, client, send, resize, close, cancel });
      });
    });
  }

  async uploadFile(config: ConnectionConfig, localPath: string, remotePath: string): Promise<void> {
    const client = await this.connectClient(config);
    return new Promise((resolve, reject) => {
      client.sftp((err: any, sftp: any) => {
        if (err) { client.end(); reject(err); return; }
        sftp.fastPut(localPath, remotePath, (err2: any) => {
          client.end();
          if (err2) reject(err2);
          else resolve();
        });
      });
    });
  }

  async downloadFile(config: ConnectionConfig, remotePath: string, localPath: string): Promise<void> {
    const client = await this.connectClient(config);
    return new Promise((resolve, reject) => {
      client.sftp((err: any, sftp: any) => {
        if (err) { client.end(); reject(err); return; }
        sftp.fastGet(remotePath, localPath, (err2: any) => {
          client.end();
          if (err2) reject(err2);
          else resolve();
        });
      });
    });
  }

  async getLogs(config: ConnectionConfig, opts?: { service?: string; tail?: number }): Promise<string[]> {
    const tail = opts?.tail ?? 100;
    const service = opts?.service;

    if (service === "docker" || service?.startsWith("docker:")) {
      const container = service.startsWith("docker:") ? service.slice(7) : (opts?.service ?? "");
      if (!container) return ["  Usage: logs docker <container>"];
      const result = await this.exec(config, `docker logs --tail ${tail} ${container} 2>&1`);
      return result.stdout.split("\n").map((l) => `  ${l}`);
    }

    if (service) {
      const result = await this.exec(config, `journalctl -u ${service} -n ${tail} --no-pager 2>/dev/null || tail -n ${tail} /var/log/${service} 2>/dev/null || echo "No logs found for ${service}"`);
      return result.stdout.split("\n").map((l) => `  ${l}`);
    }

    const result = await this.exec(config, `journalctl -n ${tail} --no-pager 2>/dev/null || tail -n ${tail} /var/log/syslog 2>/dev/null || tail -n ${tail} /var/log/messages 2>/dev/null || echo "No system logs found"`);
    return result.stdout.split("\n").map((l) => `  ${l}`);
  }
}
