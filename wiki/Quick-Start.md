# Quick Start

Get Qore running in under a minute.

---

## 1. Install

**Linux / macOS:**

```bash
curl -fsSL https://github.com/Kodjaoglanian/qore/releases/latest/download/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://github.com/Kodjaoglanian/qore/releases/latest/download/install.ps1 | iex
```

## 2. Launch

```bash
qore
```

On first launch, you will see the welcome screen.

## 3. Create the Vault

Type `vault` and press Enter. You will be prompted to create a master password. This password encrypts all saved connection credentials using AES-256-GCM with scrypt key derivation.

- The password is never written to disk.
- There is no recovery mechanism. If you forget the password, the vault must be recreated.

## 4. Discover Your Infrastructure

Type `discover` and press Enter. Qore scans:

- Open TCP ports and associated processes
- Docker containers (via `/var/run/docker.sock`)
- Docker images
- Daemon processes (pm2, systemd)
- System information (CPU, memory, disks, uptime)
- Network interfaces, routes, and firewall rules
- Top processes by CPU usage
- systemd services

The discovery screen uses a sidebar layout with 9 sections. Press `1` through `9` or `Tab` to switch sections. Use `Up`/`Down` to navigate within a section.

See [Discovery Screen](Discovery-Screen) for full documentation.

## 5. Add a Connection

Type `connections` and press Enter. Then type `add` to create a new connection.

Supported connection types:

| Type | Protocol |
|------|----------|
| `redis` | RESP |
| `postgres` | Wire protocol |
| `mysql` | mysql2 |
| `mongo` | MongoDB wire |
| `s3` | S3-compatible REST |
| `http` | HTTP REST |
| `ssh` | SSH (ssh2) |

## 6. Connect and Manage

From the connections screen, type `connect 1` to connect to the first saved connection. This opens a service screen with type-specific commands.

See [SSH Toolkit](SSH-Toolkit), [Database Tools](Database-Tools), [S3 Storage](S3-Storage), and [HTTP API](HTTP-API) for available commands per connection type.

## 7. Enable MCP (Optional)

To expose Qore's infrastructure tools to AI models, add the MCP server to your AI client configuration:

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

See [MCP Server](MCP-Server) for full documentation.

---

Previous: [Installation](Installation) -- Next: [Usage Guide](Usage-Guide)
