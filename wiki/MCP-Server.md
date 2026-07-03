# MCP Server

Qore includes a built-in Model Context Protocol (MCP) server that exposes infrastructure management capabilities to AI models through a secure, credential-isolated architecture.

---

## Overview

The MCP server implements JSON-RPC 2.0 over stdio and is compatible with Claude Desktop, Cursor, Windsurf, and any client that supports the MCP specification (protocol version `2025-03-26`).

## Architecture

```text
+-------------+     JSON-RPC      +--------------+     Unix Socket     +--------------+
|  AI Model   | <--------------> |  qore mcp    | <-----------------> |  qore TUI    |
| (Claude/GPT)|    (stdio)       |  (subprocess)|  ~/.qore/qore.sock  |  (vault)     |
+-------------+                  +--------------+                     +--------------+
```

### Data Flow

1. The AI model sends a JSON-RPC request (e.g., `tools/call` with `ssh_exec`) to the MCP server over stdin.
2. The MCP server resolves the connection name by querying the vault bridge over the Unix socket.
3. The vault bridge returns the full connection configuration (including credentials) to the MCP server.
4. The MCP server executes the operation using the appropriate connection driver.
5. The result is returned to the AI model as a JSON-RPC response over stdout. Credentials are never included in responses.

## Security Model

### Credential Isolation

- Credentials are stored encrypted at rest using AES-256-GCM with scrypt key derivation.
- The vault is decrypted in memory only when the TUI is unlocked.
- The MCP server receives connection configurations from the vault bridge to execute operations, but credentials are never returned to the AI model.
- MCP tool responses contain only operation results (command output, query results, status messages).

### Socket Security

- Unix socket at `~/.qore/qore.sock` with permissions `0600` (owner read/write only).
- Only processes running as the same user can connect.
- Socket file is removed on vault lock, TUI exit, and process signals (SIGTERM, SIGINT).

### Vault Lock Behavior

When the vault is locked, connection-dependent tools return:

```text
Vault locked -- unlock in qore TUI first
```

Discovery tools continue to function without the vault.

## Quick Start

1. Start the Qore TUI and unlock the vault:
   ```bash
   qore
   ```

2. Configure your AI client (see below).

3. The AI model can now discover ports, manage Docker containers, execute SSH commands, query databases, and more.

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `~/.config/claude/claude_desktop_config.json` (Linux):

```json
{
  "mcpServers": {
    "qore": {
      "command": "qore",
      "args": ["mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcp.servers": {
    "qore": {
      "command": "qore",
      "args": ["mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "qore": {
      "command": "qore",
      "args": ["mcp"]
    }
  }
}
```

### Full Path Configuration

If `qore` is not in your `PATH`, specify the full path:

```json
{
  "mcpServers": {
    "qore": {
      "command": "/home/user/.local/bin/qore",
      "args": ["mcp"]
    }
  }
}
```

### Development Mode

```json
{
  "mcpServers": {
    "qore": {
      "command": "bun",
      "args": ["run", "/path/to/qore/src/index.tsx", "mcp"]
    }
  }
}
```

## CLI Help

```bash
qore mcp --help
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `QORE_SOCKET_PATH` | Override the vault Unix socket path | `~/.qore/qore.sock` |
| `QORE_LOG_LEVEL` | Log level: `debug`, `info`, `warn`, `error` | `info` |

## Available Capabilities

- **35 tools**: SSH (6), Docker (11), database (5), system (7), discovery (7), HTTP (4)
- **5 resources**: Connections, probe snapshot, containers, images, system info
- **4 prompts**: Infrastructure diagnostics, security audit, container health, database health check

See [MCP Tools](MCP-Tools) for the full tool reference and [MCP Resources and Prompts](MCP-Resources-and-Prompts) for resources and prompts.

## Requirements

- Qore TUI must be running with vault unlocked for connection-dependent tools (SSH, database, HTTP).
- Discovery tools work without the vault.
- Docker tools require Docker daemon access via `/var/run/docker.sock`.
- System tools require Linux with systemd for service management.

## Troubleshooting

### "Vault locked -- unlock in qore TUI first"

The TUI is not running or the vault is locked. Start the TUI with `qore` and enter your master password.

### "Docker daemon is not available"

Docker is not running or the user lacks permissions. Verify with `systemctl status docker` and ensure your user is in the `docker` group.

### MCP server not detected by AI client

1. Verify `qore` is in your `PATH`: `which qore`
2. If using a full path, verify it is correct
3. Restart the AI client after updating the configuration
4. Test manually:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | qore mcp
   ```

### Socket file not created

The socket is created when the vault is unlocked. If it does not appear:

1. Verify the vault is unlocked in the TUI.
2. Check for error messages in the TUI status bar.
3. Verify `~/.qore/` exists and is writable.
4. If `QORE_SOCKET_PATH` is set, verify the path and parent directory.

---

Previous: [HTTP API](HTTP-API) -- Next: [MCP Tools](MCP-Tools)
