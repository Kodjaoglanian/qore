import { join } from "node:path";
import { homedir } from "node:os";

export function qoreDir(): string {
  return process.env.QORE_HOME ?? join(homedir(), ".qore");
}
export function socketPath(): string { return join(qoreDir(), "qore.sock"); }

export interface McpConfig {
  socketPath: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function getMcpConfig(): McpConfig {
  return {
    socketPath: process.env.QORE_SOCKET_PATH ?? socketPath(),
    logLevel: (process.env.QORE_LOG_LEVEL as McpConfig["logLevel"]) ?? "info",
  };
}

export function getServerInfo(): { name: string; version: string } {
  return { name: "qore", version: "0.7.3" };
}

export function getClaudeDesktopConfig(): string {
  return `{
  "mcpServers": {
    "qore": {
      "command": "qore",
      "args": ["mcp"]
    }
  }
}`;
}

export function getCursorConfig(): string {
  return `{
  "mcp.servers": {
    "qore": {
      "command": "qore",
      "args": ["mcp"]
    }
  }
}`;
}

export function getWindsurfConfig(): string {
  return `{
  "mcpServers": {
    "qore": {
      "command": "qore",
      "args": ["mcp"]
    }
  }
}`;
}
