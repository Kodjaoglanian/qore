import type { ToolDef } from "../registry.js";
import { VaultClient } from "../vault-client.js";
import { SshManager } from "../../core/connections/ssh.js";
import type { ConnectionConfig } from "../../core/vault/types.js";

const vaultClient = new VaultClient();

async function getConnection(name: string): Promise<ConnectionConfig> {
  const resp = await vaultClient.getConnection(name);
  if ("error" in resp) {
    throw new Error(resp.error === "vault_locked"
      ? "Vault locked — unlock in qore TUI first"
      : `Connection "${name}" not found`);
  }
  return resp.config;
}

export const sshTools: ToolDef[] = [
  {
    name: "ssh_list_connections",
    description: "List all saved SSH connections (name, host, port — no credentials exposed)",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const resp = await vaultClient.listConnections();
      if ("error" in resp) {
        return resp.error === "vault_locked"
          ? "Vault locked — unlock in qore TUI first"
          : `Error: ${resp.error}`;
      }
      const sshConns = resp.connections.filter(c => c.type === "ssh");
      if (sshConns.length === 0) return "No SSH connections saved.";
      const lines = sshConns.map(c => `  ${c.name} → ${c.host}:${c.port}`);
      return `SSH Connections (${sshConns.length}):\n${lines.join("\n")}`;
    },
  },
  {
    name: "ssh_exec",
    description: "Execute a command on a remote SSH connection by name",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name" },
        command: { type: "string", description: "Command to execute" },
        timeout: { type: "number", description: "Timeout in ms (optional)" },
      },
      required: ["connection", "command"],
    },
    handler: async (args) => {
      const config = await getConnection(args.connection as string);
      const mgr = new SshManager();
      const result = await mgr.exec(config, args.command as string, args.timeout as number | undefined);
      const output = result.stdout + (result.stderr ? `\n[stderr]\n${result.stderr}` : "");
      return `Exit code: ${result.exitCode}\n${output || "(no output)"}`;
    },
  },
  {
    name: "ssh_test",
    description: "Test an SSH connection by name",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name" },
      },
      required: ["connection"],
    },
    handler: async (args) => {
      const config = await getConnection(args.connection as string);
      const mgr = new SshManager();
      const info = await mgr.getInfo(config);
      return `Connection to ${config.host}:${config.port} successful.\n${info}`;
    },
  },
  {
    name: "ssh_upload",
    description: "Upload a file to a remote SSH connection",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name" },
        localPath: { type: "string", description: "Local file path" },
        remotePath: { type: "string", description: "Remote file path" },
      },
      required: ["connection", "localPath", "remotePath"],
    },
    handler: async (args) => {
      const config = await getConnection(args.connection as string);
      const mgr = new SshManager();
      await mgr.uploadFile(config, args.localPath as string, args.remotePath as string);
      return `Uploaded ${args.localPath} → ${args.remotePath}`;
    },
  },
  {
    name: "ssh_download",
    description: "Download a file from a remote SSH connection",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name" },
        remotePath: { type: "string", description: "Remote file path" },
        localPath: { type: "string", description: "Local file path" },
      },
      required: ["connection", "remotePath", "localPath"],
    },
    handler: async (args) => {
      const config = await getConnection(args.connection as string);
      const mgr = new SshManager();
      await mgr.downloadFile(config, args.remotePath as string, args.localPath as string);
      return `Downloaded ${args.remotePath} → ${args.localPath}`;
    },
  },
  {
    name: "ssh_get_info",
    description: "Get remote system information via SSH connection",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name" },
      },
      required: ["connection"],
    },
    handler: async (args) => {
      const config = await getConnection(args.connection as string);
      const mgr = new SshManager();
      const info = await mgr.getInfo(config);
      return info;
    },
  },
];
