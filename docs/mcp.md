# Qore MCP Server

The Qore MCP (Model Context Protocol) server exposes infrastructure management capabilities to AI models through a secure, credential-isolated architecture. It implements JSON-RPC 2.0 over stdio and is compatible with Claude Desktop, Cursor, Windsurf, and any client that supports the MCP specification.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Security Model](#security-model)
4. [Configuration](#configuration)
5. [Tools](#tools)
6. [Resources](#resources)
7. [Prompts](#prompts)
8. [Environment Variables](#environment-variables)
9. [Requirements](#requirements)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The MCP server runs as a subprocess of the AI client and communicates via JSON-RPC 2.0 over stdin/stdout. It connects to the Qore TUI through a Unix socket to retrieve connection configurations on demand, enabling the AI model to perform infrastructure operations without ever handling credentials directly.

### Quick Start

1. Start the Qore TUI and unlock the vault:
   ```bash
   qore
   ```

2. Add the Qore MCP server to your AI client configuration (see [Configuration](#configuration)).

3. The AI model can now:
   - Discover ports, containers, daemons, system info, processes, and services
   - Manage Docker containers (start, stop, restart, remove, logs, stats, exec)
   - Execute SSH commands on remote servers
   - Query databases (PostgreSQL, MySQL, MongoDB)
   - Make HTTP API requests
   - Kill processes and control systemd services
   - Inspect network interfaces, routes, and firewall rules

---

## Architecture

```text
+-------------+     JSON-RPC      +--------------+     Unix Socket     +--------------+
|  AI Model   | <--------------> |  qore mcp    | <-----------------> |  qore TUI    |
| (Claude/GPT)|    (stdio)       |  (subprocess)|  ~/.qore/qore.sock  |  (vault)     |
+-------------+                  +--------------+                     +--------------+
```

### Data Flow

1. The AI model sends a JSON-RPC request (for example, `tools/call` with `ssh_exec`) to the MCP server over stdin.
2. The MCP server resolves the connection name (for example, `pc-casa`) by querying the vault bridge over the Unix socket.
3. The vault bridge returns the full connection configuration (including credentials) to the MCP server.
4. The MCP server executes the operation using the appropriate connection driver (SSH, database, HTTP, etc.).
5. The result is returned to the AI model as a JSON-RPC response over stdout. Credentials are never included in the response.

### Protocol Version

The server implements MCP protocol version `2025-03-26` with stdio transport.

---

## Security Model

### Credential Isolation

- Credentials are stored encrypted at rest using AES-256-GCM with scrypt key derivation.
- The vault is decrypted in memory only when the TUI is unlocked.
- The MCP server receives connection configurations (including credentials) from the vault bridge to execute operations, but credentials are never returned to the AI model.
- MCP tool responses contain only operation results (command output, query results, status messages).

### Socket Security

- The Unix socket is created at `~/.qore/qore.sock` with permissions `0600` (owner read/write only).
- Only processes running as the same user can connect to the socket.
- The socket file is removed on vault lock, TUI exit, and process signals (SIGTERM, SIGINT).

### Vault Lock Behavior

When the vault is locked, connection-dependent tools (SSH, database, HTTP) return:

```text
Vault locked -- unlock in qore TUI first
```

Discovery tools (ports, containers, daemons, system info, processes, services, network) continue to function without the vault, as they probe the local machine directly.

---

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

To run the MCP server from source without compiling:

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

### CLI Help

```bash
qore mcp --help
```

Output:

```text
Qore MCP Server v0.7.6

Usage:
  qore mcp              Start the MCP server (stdio transport)
  qore mcp --help       Show this help message

The MCP server exposes qore's infrastructure tools to AI models.
Requires the qore TUI to be running with vault unlocked for
connection-dependent tools (SSH, DB, HTTP).

Environment:
  QORE_SOCKET_PATH      Override socket path (default: ~/.qore/qore.sock)
  QORE_LOG_LEVEL        Log level: debug|info|warn|error (default: info)

See: docs/mcp.md for configuration examples.
```

---

## Tools

The MCP server exposes 35 tools organized into 6 categories.

### SSH Tools (6)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `ssh_list_connections` | none | List saved SSH connections (names and hosts only, no credentials) |
| `ssh_exec` | `connection`, `command`, `timeout?` | Execute a shell command on a remote server |
| `ssh_test` | `connection` | Test SSH connection and return status |
| `ssh_upload` | `connection`, `localPath`, `remotePath` | Upload a file via SFTP |
| `ssh_download` | `connection`, `remotePath`, `localPath` | Download a file via SFTP |
| `ssh_get_info` | `connection` | Get remote system information (hostname, OS, uptime, disk, memory) |

### Docker Tools (11)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `docker_list` | none | List all Docker containers (running and stopped) |
| `docker_start` | `container` | Start a container |
| `docker_stop` | `container` | Stop a container |
| `docker_restart` | `container` | Restart a container |
| `docker_remove` | `container` | Remove a container |
| `docker_logs` | `container`, `lines?` | Get container log output (default 50 lines) |
| `docker_inspect` | `container` | Inspect container configuration and state |
| `docker_images` | none | List all Docker images |
| `docker_prune` | none | Prune all stopped containers |
| `docker_stats` | `container` | Get container resource statistics (CPU, memory, network, I/O) |
| `docker_status` | none | Check if Docker daemon is available |

### Database Tools (5)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `db_list_databases` | `connection` | List all databases on the server |
| `db_list_tables` | `connection`, `database` | List tables or collections in a database |
| `db_query` | `connection`, `database`, `query` | Execute a SQL query and return results |
| `db_describe_table` | `connection`, `database`, `table` | Describe table structure (columns, types) |
| `db_table_sample` | `connection`, `database`, `table`, `limit?` | Return sample rows from a table (default 10) |

### System Tools (7)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `sys_processes` | `count?` | List top processes by CPU usage (default 20) |
| `sys_kill_process` | `pid`, `signal?` | Send a signal to a process (default: TERM) |
| `sys_services` | none | List systemd services and their states |
| `sys_service_control` | `service`, `action` | Start, stop, or restart a systemd service |
| `sys_disk_usage` | none | Get disk usage information for all mounted filesystems |
| `sys_memory` | none | Get memory and swap information |
| `sys_network_info` | none | Get network interfaces, routes, and firewall rules |

### Discovery Tools (7)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `discover_ports` | none | Scan and list all open network ports |
| `discover_containers` | none | List Docker containers (running and stopped) |
| `discover_daemons` | none | List running daemon processes (pm2, systemd) |
| `discover_system_info` | none | Get host information (OS, CPU, memory, disks, uptime) |
| `discover_network` | none | Get network interfaces, routes, and firewall rules |
| `discover_processes` | none | List top processes by CPU usage |
| `discover_services` | none | List systemd services and their states |

### HTTP Tools (4)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `http_get` | `connection`, `path` | Send a GET request to the configured HTTP API |
| `http_post` | `connection`, `path`, `body` | Send a POST request with a JSON body |
| `http_put` | `connection`, `path`, `body` | Send a PUT request with a JSON body |
| `http_delete` | `connection`, `path` | Send a DELETE request |

---

## Resources

The MCP server exposes 5 resources that provide read-only infrastructure snapshots.

| URI | Description |
|-----|-------------|
| `qore://connections` | All saved connections (metadata only: name, type, host, port) |
| `qore://probe/latest` | Latest infrastructure probe snapshot (ports, containers, daemons, system) |
| `qore://docker/containers` | Current Docker container list with state and status |
| `qore://docker/images` | Current Docker image list with tags and sizes |
| `qore://system/info` | Current system information (hostname, OS, CPU, memory, disks) |

---

## Prompts

The MCP server provides 4 prompt templates that guide the AI model through common infrastructure analysis tasks.

| Prompt | Parameters | Description |
|--------|-----------|-------------|
| `diagnose_infra` | none | Analyze infrastructure state and identify potential issues |
| `security_audit` | none | Perform a security audit of open ports, services, and firewall rules |
| `container_health` | none | Check Docker container health and resource utilization |
| `db_health_check` | `connection` | Check database health including connections, slow queries, and table sizes |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `QORE_SOCKET_PATH` | Override the vault Unix socket path | `~/.qore/qore.sock` |
| `QORE_LOG_LEVEL` | Log level: `debug`, `info`, `warn`, `error` | `info` |

---

## Requirements

- **Qore TUI must be running** with the vault unlocked for connection-dependent tools (SSH, database, HTTP).
- **Discovery tools** (ports, containers, daemons, system info, processes, services, network) work without the vault. They probe the local machine directly.
- **Docker tools** require Docker daemon access via `/var/run/docker.sock`. Ensure your user is in the `docker` group:
  ```bash
  sudo usermod -aG docker $USER
  ```
- **System tools** require Linux with systemd for service management.
- **Database tools** require a saved connection of type `postgres`, `mysql`, or `mongo` in the vault.
- **SSH tools** require a saved connection of type `ssh` in the vault.
- **HTTP tools** require a saved connection of type `http` in the vault.

---

## Troubleshooting

### "Vault locked -- unlock in qore TUI first"

The Qore TUI is not running or the vault is locked. Start the TUI with `qore` and enter your master password to unlock the vault.

### "Docker daemon is not available"

Docker is not running or the user lacks permissions to access the Docker socket. Verify Docker is running with `systemctl status docker` and ensure your user is in the `docker` group.

### MCP server not detected by AI client

1. Verify `qore` is in your `PATH` by running `which qore`.
2. If using a full path in the configuration, verify the path is correct.
3. Restart the AI client after updating the MCP configuration.
4. Test the MCP server manually:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | qore mcp
   ```

### Socket file not created

The socket file (`~/.qore/qore.sock`) is created when the vault is unlocked. If it does not appear:

1. Verify the vault is unlocked in the TUI.
2. Check for error messages in the TUI status bar.
3. Verify the `~/.qore/` directory exists and is writable.
4. If `QORE_SOCKET_PATH` is set, verify the custom path is valid and the parent directory exists.
