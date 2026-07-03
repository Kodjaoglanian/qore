import type { ToolDef } from "../registry.js";
import { VaultClient } from "../vault-client.js";
import { HttpManager } from "../../core/connections/http.js";
import type { ConnectionConfig } from "../../core/vault/types.js";

const vaultClient = new VaultClient();

async function getHttpConnection(name: string): Promise<ConnectionConfig> {
  const resp = await vaultClient.getConnection(name);
  if ("error" in resp) {
    throw new Error(resp.error === "vault_locked"
      ? "Vault locked — unlock in qore TUI first"
      : `Connection "${name}" not found`);
  }
  if (resp.config.type !== "http") {
    throw new Error(`Connection "${name}" is not an HTTP connection (type: ${resp.config.type})`);
  }
  return resp.config;
}

function formatResponse(resp: { status: number; statusText: string; headers: Record<string, string>; body: string }): string {
  let out = `Status: ${resp.status} ${resp.statusText}\n`;
  const relevantHeaders = ["content-type", "server", "cache-control", "x-request-id"];
  for (const h of relevantHeaders) {
    if (resp.headers[h]) out += `${h}: ${resp.headers[h]}\n`;
  }
  out += `\n${resp.body.slice(0, 4000)}`;
  if (resp.body.length > 4000) out += `\n... (${resp.body.length - 4000} more bytes)`;
  return out;
}

const mgr = new HttpManager();

export const httpTools: ToolDef[] = [
  {
    name: "http_get",
    description: "Make a GET request via a saved HTTP API connection",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "HTTP connection name" },
        path: { type: "string", description: "Request path (e.g. /api/users)" },
      },
      required: ["connection", "path"],
    },
    handler: async (args) => {
      const config = await getHttpConnection(args.connection as string);
      const resp = await mgr.get(config, args.path as string);
      return formatResponse(resp);
    },
  },
  {
    name: "http_post",
    description: "Make a POST request via a saved HTTP API connection",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "HTTP connection name" },
        path: { type: "string", description: "Request path" },
        body: { type: "string", description: "Request body (JSON string)" },
      },
      required: ["connection", "path", "body"],
    },
    handler: async (args) => {
      const config = await getHttpConnection(args.connection as string);
      const resp = await mgr.post(config, args.path as string, args.body as string);
      return formatResponse(resp);
    },
  },
  {
    name: "http_put",
    description: "Make a PUT request via a saved HTTP API connection",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "HTTP connection name" },
        path: { type: "string", description: "Request path" },
        body: { type: "string", description: "Request body (JSON string)" },
      },
      required: ["connection", "path", "body"],
    },
    handler: async (args) => {
      const config = await getHttpConnection(args.connection as string);
      const resp = await mgr.put(config, args.path as string, args.body as string);
      return formatResponse(resp);
    },
  },
  {
    name: "http_delete",
    description: "Make a DELETE request via a saved HTTP API connection",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "HTTP connection name" },
        path: { type: "string", description: "Request path" },
      },
      required: ["connection", "path"],
    },
    handler: async (args) => {
      const config = await getHttpConnection(args.connection as string);
      const resp = await mgr.delete(config, args.path as string);
      return formatResponse(resp);
    },
  },
];
