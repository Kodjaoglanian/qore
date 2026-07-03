import { join } from "node:path";
import { homedir } from "node:os";
import type { ConnectionConfig } from "../core/vault/types.js";

const SOCKET_PATH = join(homedir(), ".qore", "qore.sock");

export interface VaultListResponse {
  connections: Array<{
    id: string;
    name: string;
    type: string;
    host: string;
    port: number;
  }>;
}

export interface VaultGetResponse {
  config: ConnectionConfig;
}

export interface VaultErrorResponse {
  error: string;
}

export class VaultClient {
  private socket: any = null;

  async request(op: string, extra?: Record<string, unknown>): Promise<any> {
    return new Promise((resolve) => {
      let data = "";
      let settled = false;
      const done = (val: any) => {
        if (!settled) { settled = true; resolve(val); }
      };

      try {
        Bun.connect({
          unix: SOCKET_PATH,
          socket: {
            open(s: any) {
              const msg = JSON.stringify({ op, ...extra }) + "\n";
              s.write(msg);
            },
            data(_s: any, chunk: Uint8Array) {
              data += new TextDecoder().decode(chunk);
              if (data.includes("\n")) {
                try {
                  const resp = JSON.parse(data.trim());
                  done(resp);
                } catch {
                  done({ error: "socket_parse_error" });
                }
              }
            },
            end(s: any) {
              try { s.end(); } catch {}
              if (!settled) {
                try {
                  const resp = JSON.parse(data.trim());
                  done(resp);
                } catch {
                  done({ error: "socket_closed" });
                }
              }
            },
            error(_s: any, _err: Error) {
              done({ error: "vault_locked" });
            },
          },
        } as any);
      } catch {
        done({ error: "vault_locked" });
      }

      setTimeout(() => done({ error: "timeout" }), 5000);
    });
  }

  async ping(): Promise<boolean> {
    const resp = await this.request("ping");
    return resp.ok === true && resp.vault === "unlocked";
  }

  async listConnections(): Promise<VaultListResponse | VaultErrorResponse> {
    return this.request("list_connections");
  }

  async getConnection(name: string): Promise<VaultGetResponse | VaultErrorResponse> {
    return this.request("get_connection", { name });
  }

  close(): void {
    if (this.socket) {
      try { this.socket.end(); } catch {}
      this.socket = null;
    }
  }
}

export { SOCKET_PATH };
