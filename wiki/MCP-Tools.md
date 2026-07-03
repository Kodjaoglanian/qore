# MCP Tools

The MCP server exposes 35 tools organized into 6 categories. All tools accept JSON parameters and return string results.

---

## SSH Tools (6)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `ssh_list_connections` | none | List saved SSH connections (names and hosts only, no credentials) |
| `ssh_exec` | `connection`, `command`, `timeout?` | Execute a shell command on a remote server |
| `ssh_test` | `connection` | Test SSH connection and return status |
| `ssh_upload` | `connection`, `localPath`, `remotePath` | Upload a file via SFTP |
| `ssh_download` | `connection`, `remotePath`, `localPath` | Download a file via SFTP |
| `ssh_get_info` | `connection` | Get remote system information (hostname, OS, uptime, disk, memory) |

### Example: Execute SSH Command

```json
{
  "method": "tools/call",
  "params": {
    "name": "ssh_exec",
    "arguments": {
      "connection": "pc-casa",
      "command": "ls -la /home/user",
      "timeout": 10000
    }
  }
}
```

## Docker Tools (11)

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

### Example: List Containers

```json
{
  "method": "tools/call",
  "params": {
    "name": "docker_list",
    "arguments": {}
  }
}
```

### Example: Get Container Logs

```json
{
  "method": "tools/call",
  "params": {
    "name": "docker_logs",
    "arguments": {
      "container": "my-app",
      "lines": 100
    }
  }
}
```

## Database Tools (5)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `db_list_databases` | `connection` | List all databases on the server |
| `db_list_tables` | `connection`, `database` | List tables or collections in a database |
| `db_query` | `connection`, `database`, `query` | Execute a SQL query and return results |
| `db_describe_table` | `connection`, `database`, `table` | Describe table structure (columns, types) |
| `db_table_sample` | `connection`, `database`, `table`, `limit?` | Return sample rows from a table (default 10) |

### Example: Query Database

```json
{
  "method": "tools/call",
  "params": {
    "name": "db_query",
    "arguments": {
      "connection": "my-postgres",
      "database": "appdb",
      "query": "SELECT * FROM users LIMIT 5"
    }
  }
}
```

## System Tools (7)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `sys_processes` | `count?` | List top processes by CPU usage (default 20) |
| `sys_kill_process` | `pid`, `signal?` | Send a signal to a process (default: TERM) |
| `sys_services` | none | List systemd services and their states |
| `sys_service_control` | `service`, `action` | Start, stop, or restart a systemd service |
| `sys_disk_usage` | none | Get disk usage information for all mounted filesystems |
| `sys_memory` | none | Get memory and swap information |
| `sys_network_info` | none | Get network interfaces, routes, and firewall rules |

### Example: Control Service

```json
{
  "method": "tools/call",
  "params": {
    "name": "sys_service_control",
    "arguments": {
      "service": "nginx",
      "action": "restart"
    }
  }
}
```

## Discovery Tools (7)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `discover_ports` | none | Scan and list all open network ports |
| `discover_containers` | none | List Docker containers (running and stopped) |
| `discover_daemons` | none | List running daemon processes (pm2, systemd) |
| `discover_system_info` | none | Get host information (OS, CPU, memory, disks, uptime) |
| `discover_network` | none | Get network interfaces, routes, and firewall rules |
| `discover_processes` | none | List top processes by CPU usage |
| `discover_services` | none | List systemd services and their states |

### Example: Discover Open Ports

```json
{
  "method": "tools/call",
  "params": {
    "name": "discover_ports",
    "arguments": {}
  }
}
```

## HTTP Tools (4)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `http_get` | `connection`, `path` | Send a GET request to the configured HTTP API |
| `http_post` | `connection`, `path`, `body` | Send a POST request with a JSON body |
| `http_put` | `connection`, `path`, `body` | Send a PUT request with a JSON body |
| `http_delete` | `connection`, `path` | Send a DELETE request |

### Example: HTTP GET

```json
{
  "method": "tools/call",
  "params": {
    "name": "http_get",
    "arguments": {
      "connection": "my-api",
      "path": "/users/123"
    }
  }
}
```

## Vault Dependency

| Category | Requires Vault | Requires Docker | Requires systemd |
|----------|---------------|-----------------|-----------------|
| SSH | Yes | No | No |
| Docker | No | Yes | No |
| Database | Yes | No | No |
| System | No | No | Yes (services only) |
| Discovery | No | No | No |
| HTTP | Yes | No | No |

---

Previous: [MCP Server](MCP-Server) -- Next: [MCP Resources and Prompts](MCP-Resources-and-Prompts)
