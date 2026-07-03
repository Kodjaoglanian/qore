# Qore MCP Server

Qore includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) server that exposes infrastructure management capabilities to AI models like Claude, GPT, and others.

## Quick Start

1. **Start qore TUI and unlock your vault:**
   ```bash
   qore
   # Enter your master password to unlock the vault
   ```

2. **Configure your AI client** (see examples below).

3. **The AI model can now:**
   - Discover ports, containers, daemons, system info, processes, services
   - Manage Docker containers (start, stop, restart, remove, logs, stats)
   - Execute SSH commands on remote servers
   - Query databases (PostgreSQL, MySQL, MongoDB)
   - Make HTTP API requests
   - Kill processes and control systemd services

## How It Works

```
┌─────────────┐     JSON-RPC      ┌──────────────┐     Unix Socket     ┌──────────────┐
│  AI Model   │ ←──────────────→ │  qore mcp    │ ←─────────────────→ │  qore TUI    │
│ (Claude/GPT)│    (stdio)       │  (subprocess)│   ~/.qore/qore.sock │  (vault)     │
└─────────────┘                  └──────────────┘                      └──────────────┘
```

- The **TUI** holds the encrypted vault in memory and opens a Unix socket at `~/.qore/qore.sock` (chmod 0600) when unlocked.
- The **MCP server** (`qore mcp`) runs as a subprocess of the AI client, connects to the socket on demand, and retrieves connection configs (with credentials) to execute operations.
- The **AI model** never sees credentials — it only uses connection names and receives results.

## Security Model

- Credentials are **never exposed** to the AI model
- MCP tools only accept connection names, never return secrets
- Unix socket has filesystem permissions (0600) — only the same user can connect
- No credentials written to disk or environment variables
- Socket file is cleaned up on vault lock, TUI exit, and process signals (SIGTERM/SIGINT)
- If vault is locked, connection-dependent tools return: `"Vault locked — unlock in qore TUI first"`

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

Add to `.cursor/mcp.json` in your project:

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

## Available Tools (35)

### SSH Tools
- `ssh_list_connections` — List saved SSH connections (no credentials)
- `ssh_exec` — Execute command on remote server: `{connection, command, timeout?}`
- `ssh_test` — Test SSH connection: `{connection}`
- `ssh_upload` — Upload file: `{connection, localPath, remotePath}`
- `ssh_download` — Download file: `{connection, remotePath, localPath}`
- `ssh_get_info` — Get remote system info: `{connection}`

### Docker Tools
- `docker_list` — List all containers
- `docker_start` / `docker_stop` / `docker_restart` / `docker_remove` — Container lifecycle
- `docker_logs` — Get container logs: `{container, lines?}`
- `docker_inspect` — Inspect container: `{container}`
- `docker_images` — List all images
- `docker_prune` — Prune stopped containers
- `docker_stats` — Container resource stats: `{container}`
- `docker_status` — Check Docker daemon availability

### Database Tools
- `db_list_databases` — List databases: `{connection}`
- `db_list_tables` — List tables: `{connection, database}`
- `db_query` — Execute SQL: `{connection, database, query}`
- `db_describe_table` — Table structure: `{connection, database, table}`
- `db_table_sample` — Sample rows: `{connection, database, table, limit?}`

### System Tools
- `sys_processes` — List top processes: `{count?}`
- `sys_kill_process` — Kill process: `{pid, signal?}`
- `sys_services` — List systemd services
- `sys_service_control` — Control service: `{service, action}`
- `sys_disk_usage` — Disk usage info
- `sys_memory` — Memory and swap info
- `sys_network_info` — Network interfaces, routes, firewall

### Discovery Tools
- `discover_ports` — Open network ports
- `discover_containers` — Docker containers
- `discover_daemons` — Running daemons
- `discover_system_info` — Host info (OS, CPU, memory, disks)
- `discover_network` — Network interfaces, routes, firewall
- `discover_processes` — Top processes by CPU
- `discover_services` — Systemd services

### HTTP Tools
- `http_get` — GET request: `{connection, path}`
- `http_post` — POST request: `{connection, path, body}`
- `http_put` — PUT request: `{connection, path, body}`
- `http_delete` — DELETE request: `{connection, path}`

## Resources (5)

- `qore://connections` — All saved connections (metadata only)
- `qore://probe/latest` — Latest infrastructure probe snapshot
- `qore://docker/containers` — Current container list
- `qore://docker/images` — Current image list
- `qore://system/info` — Current system information

## Prompts (4)

- `diagnose_infra` — Analyze infrastructure and identify issues
- `security_audit` — Security audit of ports and services
- `container_health` — Check Docker container health
- `db_health_check` — Check database health: `{connection}`

## Requirements

- **qore TUI must be running** with vault unlocked for connection-dependent tools (SSH, DB, HTTP)
- **Discovery tools** (ports, containers, daemons, system info) work without vault — they probe the local machine directly
- **Docker tools** require Docker daemon access via `/var/run/docker.sock`
- **System tools** require Linux with systemd for service management

## Environment Variables

- `QORE_SOCKET_PATH` — Override socket path (default: `~/.qore/qore.sock`)
- `QORE_LOG_LEVEL` — Log level: `debug`, `info`, `warn`, `error` (default: `info`)
