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
  consumeBuffer?: () => string[];
  getExitCode?: () => number | null;
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

export interface SshTiming {
  connectMs: number;
  execMs: number;
  reused: boolean;
}

interface PoolEntry {
  client: any;
  ready: Promise<any>;
  timer: ReturnType<typeof setTimeout> | null;
}

const POOL_IDLE_MS = 5 * 60 * 1000;
const sshPool = new Map<string, PoolEntry>();

function poolKey(config: ConnectionConfig): string {
  return `${config.username ?? "root"}@${config.host}:${config.port}:${config.id ?? ""}`;
}

export function closeSshPool(): void {
  for (const [key, entry] of sshPool) {
    if (entry.timer) clearTimeout(entry.timer);
    try { entry.client.end(); } catch {}
    sshPool.delete(key);
  }
}

export class SshManager implements ConnectionManager {
  lastError: string | null = null;
  lastTiming: SshTiming | null = null;
  private pooled: boolean;
  private lastReused = false;
  private lastConnectMs = 0;

  /**
   * @param opts.pooled Reuse one authenticated SSH connection per host across calls
   *   (skips the key-exchange + auth handshake, which dominates latency on slow links /
   *   pure-JS crypto). Used by the MCP server where every tool call is a new request.
   */
  constructor(opts: { pooled?: boolean } = {}) {
    this.pooled = opts.pooled ?? false;
  }

  private release(client: any): void {
    if (this.pooled) {
      const entry = [...sshPool.values()].find((e) => e.client === client);
      if (entry) {
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          try { client.end(); } catch {}
        }, POOL_IDLE_MS);
        (entry.timer as any).unref?.();
        return;
      }
    }
    try { client.end(); } catch {}
  }

  private async connectClient(config: ConnectionConfig): Promise<any> {
    const started = Date.now();
    if (!this.pooled) {
      this.lastReused = false;
      const c = await this.openClient(config);
      this.lastConnectMs = Date.now() - started;
      return c;
    }

    const key = poolKey(config);
    const existing = sshPool.get(key);
    if (existing) {
      try {
        const client = await existing.ready;
        if (existing.timer) { clearTimeout(existing.timer); existing.timer = null; }
        this.lastReused = true;
        this.lastConnectMs = Date.now() - started;
        return client;
      } catch {
        sshPool.delete(key);
      }
    }

    const entry: PoolEntry = { client: null, ready: null as any, timer: null };
    entry.ready = this.openClient(config, { keepalive: true }).then((client) => {
      entry.client = client;
      const evict = () => {
        if (sshPool.get(key) === entry) sshPool.delete(key);
        if (entry.timer) clearTimeout(entry.timer);
      };
      client.on("close", evict);
      client.on("end", evict);
      client.on("error", evict);
      return client;
    });
    sshPool.set(key, entry);
    try {
      const client = await entry.ready;
      this.lastReused = false;
      this.lastConnectMs = Date.now() - started;
      return client;
    } catch (err) {
      if (sshPool.get(key) === entry) sshPool.delete(key);
      throw err;
    }
  }

  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      this.lastError = null;
      const result = await this.exec(config, "echo ok");
      return result.exitCode === 0 && result.stdout.trim() === "ok";
    } catch (err) {
      this.lastError = (err as Error).message;
      return false;
    }
  }

  async getInfo(config: ConnectionConfig): Promise<Record<string, string>> {
    try {
      const cmd = [
        "echo __QORE_OS__; uname -a",
        "echo __QORE_HOST__; hostname",
        "echo __QORE_UP__; (uptime -p 2>/dev/null || uptime)",
        "echo __QORE_DISK__; (df -h / 2>/dev/null | tail -1)",
        "echo __QORE_MEM__; (free -h 2>/dev/null | grep -i '^Mem')",
      ].join("; ");
      const result = await this.exec(config, cmd);
      const info: Record<string, string> = {};
      const sections: Record<string, string[]> = {};
      let current = "";
      for (const line of result.stdout.split("\n")) {
        const t = line.trim();
        if (t.startsWith("__QORE_") && t.endsWith("__")) {
          current = t;
          sections[current] = [];
        } else if (current && t) {
          sections[current].push(t);
        }
      }
      if (sections.__QORE_OS__?.[0]) info["os"] = sections.__QORE_OS__[0];
      if (sections.__QORE_HOST__?.[0]) info["hostname"] = sections.__QORE_HOST__[0];
      if (sections.__QORE_UP__?.[0]) info["uptime"] = sections.__QORE_UP__[0];
      if (sections.__QORE_DISK__?.[0]) info["disk"] = sections.__QORE_DISK__[0];
      if (sections.__QORE_MEM__?.[0]) info["memory"] = sections.__QORE_MEM__[0];
      return info;
    } catch {
      return {};
    }
  }

  private async openClient(config: ConnectionConfig, opts: { keepalive?: boolean } = {}): Promise<any> {
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
      if (opts.keepalive) {
        authConfig.keepaliveInterval = 15000;
        authConfig.keepaliveCountMax = 3;
      }

      client.connect(authConfig);
    });
  }

  async exec(config: ConnectionConfig, command: string, timeoutMs?: number, usePty?: boolean): Promise<SshResult> {
    const client = await this.connectClient(config);
    const execStarted = Date.now();
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
          this.release(client);
          this.lastTiming = {
            connectMs: this.lastConnectMs,
            execMs: Date.now() - execStarted,
            reused: this.lastReused,
          };
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

  private wrapPtyStream(client: any, stream: any, onData: (data: string) => void): PtyHandle {
    const initialChunks: string[] = [];
    let bufferConsumed = false;
    let exitCode: number | null = null;

    stream.on("data", (data: Buffer) => {
      const str = data.toString("utf8");
      if (!bufferConsumed) {
        initialChunks.push(str);
        if (initialChunks.length > 500) initialChunks.shift();
      }
      onData(str);
    });

    stream.stderr?.on("data", (data: Buffer) => {
      const str = data.toString("utf8");
      if (!bufferConsumed) {
        initialChunks.push(str);
        if (initialChunks.length > 500) initialChunks.shift();
      }
      onData(str);
    });

    stream.on("close", (code: number) => {
      exitCode = code ?? 0;
      try { client.end(); } catch {}
    });

    const send = (input: string) => {
      try { stream.write(input); } catch {}
    };

    const resize = (c: number, r: number) => {
      try { stream.setWindow(r, c, 0, 0); } catch {}
    };

    const cancel = () => {
      try { stream.close?.(); } catch {}
      try { client.end(); } catch {}
    };

    const close = (): Promise<SshResult> => {
      return new Promise((res) => {
        if (exitCode !== null) {
          res({ exitCode, stdout: "", stderr: "" });
          return;
        }
        stream.on("close", (code: number) => {
          try { client.end(); } catch {}
          res({ exitCode: code ?? 0, stdout: "", stderr: "" });
        });
      });
    };

    const consumeBuffer = (): string[] => {
      bufferConsumed = true;
      const out = initialChunks.slice();
      initialChunks.length = 0;
      return out;
    };

    const getExitCode = () => exitCode;

    return { stream, client, send, resize, close, cancel, consumeBuffer, getExitCode };
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

        const handle = this.wrapPtyStream(client, stream, onData);

        if (hasSudo && config.password) {
          stream.write(config.password + "\n");
        }

        resolve(handle);
      });
    });
  }

  async openShell(
    config: ConnectionConfig,
    cols: number,
    rows: number,
    onData: (data: string) => void,
  ): Promise<PtyHandle> {
    const client = await this.connectClient(config);

    return new Promise<PtyHandle>((resolve, reject) => {
      client.shell({ term: "xterm-256color", cols, rows }, (err: any, stream: any) => {
        if (err) {
          client.end();
          // Fallback to execPty if native shell channel is disallowed
          this.execPty(config, "bash -l 2>/dev/null || sh -l", cols, rows, onData)
            .then(resolve)
            .catch(reject);
          return;
        }
        resolve(this.wrapPtyStream(client, stream, onData));
      });
    });
  }

  async uploadFile(config: ConnectionConfig, localPath: string, remotePath: string): Promise<void> {
    const client = await this.connectClient(config);
    return new Promise((resolve, reject) => {
      client.sftp((err: any, sftp: any) => {
        if (err) { client.end(); reject(err); return; }
        sftp.fastPut(localPath, remotePath, (err2: any) => {
          try { sftp.end(); } catch {}
          this.release(client);
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
          try { sftp.end(); } catch {}
          this.release(client);
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
