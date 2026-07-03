import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, unlinkSync, chmodSync } from "node:fs";
import type { Vault } from "./vault.js";
import type { ConnectionConfig } from "./types.js";

const SOCKET_PATH = join(homedir(), ".qore", "qore.sock");

export class SocketBridge {
  private server: any = null;
  private vault: Vault;
  private cleanupHandlers: (() => void)[] = [];

  constructor(vault: Vault) {
    this.vault = vault;
  }

  start(): boolean {
    if (existsSync(SOCKET_PATH)) {
      try { unlinkSync(SOCKET_PATH); } catch {}
    }

    try {
      this.server = Bun.listen({
        unix: SOCKET_PATH,
        socket: {
          open(_socket: any) {},
          data: (socket: any, data: Uint8Array) => this.handleData(socket, data),
          close(_socket: any) {},
        },
      } as any);

      chmodSync(SOCKET_PATH, 0o600);

      this.cleanupHandlers.push(() => this.stop());
      process.on("SIGTERM", () => this.cleanup());
      process.on("SIGINT", () => this.cleanup());
      process.on("exit", () => this.cleanup());

      return true;
    } catch (err) {
      return false;
    }
  }

  stop(): void {
    if (this.server) {
      try { this.server.stop(true); } catch {}
      this.server = null;
    }
    if (existsSync(SOCKET_PATH)) {
      try { unlinkSync(SOCKET_PATH); } catch {}
    }
  }

  private cleanup(): void {
    for (const handler of this.cleanupHandlers) {
      try { handler(); } catch {}
    }
  }

  private handleData(socket: any, data: Uint8Array): void {
    const text = new TextDecoder().decode(data);
    const lines = text.split("\n").filter(l => l.trim());

    for (const line of lines) {
      try {
        const req = JSON.parse(line);
        const resp = this.handleRequest(req);
        socket.write(JSON.stringify(resp) + "\n");
      } catch {
        socket.write(JSON.stringify({ error: "parse_error" }) + "\n");
      }
    }
  }

  private handleRequest(req: any): any {
    if (!this.vault.isUnlocked()) {
      return { error: "vault_locked" };
    }

    switch (req.op) {
      case "ping":
        return { ok: true, vault: "unlocked" };

      case "list_connections": {
        const connections = this.vault.getConnections().map((c: ConnectionConfig) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          host: c.host,
          port: c.port,
        }));
        return { connections };
      }

      case "get_connection": {
        const { name, id } = req;
        let conn: ConnectionConfig | undefined;
        if (id) {
          conn = this.vault.getConnection(id);
        } else if (name) {
          conn = this.vault.getConnections().find(c => c.name === name);
        }
        if (!conn) return { error: "connection_not_found" };
        return { config: conn };
      }

      default:
        return { error: "unknown_op" };
    }
  }
}

export { SOCKET_PATH };
