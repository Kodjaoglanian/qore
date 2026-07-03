<p align="center">
  <img src="assets/qore-logo.png" alt="Qore" width="320">
</p>

<h3 align="center">Ultra-lightweight, single-binary hybrid infrastructure orchestrator</h3>
<p align="center">Terminal-native TUI with built-in MCP server for AI-driven operations</p>

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Quick Start](#quick-start)
4. [Installation](#installation)
5. [Usage](#usage)
6. [MCP Server](#mcp-server)
7. [Architecture](#architecture)
8. [Configuration](#configuration)
9. [Development](#development)
10. [Testing](#testing)
11. [Building](#building)
12. [Roadmap](#roadmap)
13. [Contributing](#contributing)
14. [License](#license)

---

## Overview

Qore combines three responsibilities in a single process:

- **Discovery**: Scans local TCP ports, Docker containers via the Unix socket, daemon processes managed by pm2 or systemd, network interfaces, system resources, and running services.
- **Secure Vault**: Stores connection credentials with AES-256-GCM encryption and scrypt key derivation. The master password is never written to disk. A Unix socket bridge exposes the vault to the MCP server without exposing credentials to AI models.
- **Resource Management**: Provides a unified command interface for Redis, PostgreSQL, MySQL, MongoDB, S3-compatible storage, HTTP APIs, SSH servers, and Git repositories using native wire protocols and CLI wrappers instead of vendor-specific tools.

The interface is designed around a persistent command bar, keyboard navigation, and a dark, high-contrast color scheme. A sidebar-driven discovery screen provides at-a-glance infrastructure visibility with section-specific filtering and contextual actions.

---

## Features

### Infrastructure Discovery

- **Auto-Discovery**: Identify running services on local TCP ports without manual configuration.
- **Docker Integration**: Control containers directly through `/var/run/docker.sock`. No `docker` CLI dependency.
- **Daemon Detection**: Scan for pm2 and systemd managed processes.
- **System Monitoring**: CPU, memory, swap, load average, disk usage, and uptime reporting.
- **Network Inspection**: List interfaces, routing tables, and firewall rules.
- **Process Management**: View top processes by CPU usage with kill capability.
- **Service Control**: List and manage systemd services (start, stop, restart).
- **Container Operations**: Start, stop, restart, remove, inspect, view logs, exec commands, and batch actions on containers.
- **Image Management**: List and remove Docker images with prune support.

### Security and Vault

- **Credential Vault**: Encrypt connections at rest with a single master password using scrypt key derivation and AES-256-GCM authenticated encryption.
- **Vault Management**: Change master password and import/export encrypted connection bundles (QOREX1 format).
- **Socket Bridge**: Unix socket (`~/.qore/qore.sock`, chmod 0600) exposes the vault to the MCP server. Credentials are never passed to AI models.

### Connection Management

- **Protocol-Native Drivers**: Redis (RESP), PostgreSQL (wire protocol), MySQL (mysql2), MongoDB (wire protocol), S3-compatible REST, HTTP API, SSH (ssh2), and Git (CLI wrapper).
- **Multi-Connection Tabs**: Open multiple service connections simultaneously and switch between them with Ctrl+Tab or Ctrl+Arrow keys. All tabs stay mounted with state preserved.
- **Multi-Session**: Open multiple sessions of the same connection (for example, two SSH sessions to the same server). Use the `new` command inside any service screen.
- **SSH Toolkit**: File operations, service control, Docker management, SFTP transfer, process and network utilities, security audits, server snapshots, deploy scripts, and Docker Compose management.
- **SSH Interactive Shell**: Open a full interactive bash terminal over SSH directly from Qore. Supports Ctrl+C, Ctrl+D, tab completion, and arrow keys.
- **Connection Groups**: Organize connections into named groups (e.g. production, staging, dev) and open all connections in a group at once.
- **Command Snippets**: Save sequences of commands as reusable snippets and execute them to open all referenced connections.
- **Multi-Service Dashboard**: Consolidated status view of all vault connections with auto-refresh and quick connect.
- **Health Check Dashboard**: Periodic health monitoring with latency sparklines, uptime percentage, and configurable check intervals.

### Developer Experience

- **Keyboard-First TUI**: Type commands, use arrow keys for selection, press Escape to navigate back.
- **Command History**: Navigate previous commands with Up/Down arrows when the input bar has text.
- **Tab Autocomplete**: Press Tab to cycle through matching commands.
- **Favorites**: Star frequently used commands with `star <cmd>` and recall them with `favorites`.
- **Database Tools**: Export table data to CSV, run EXPLAIN query plans, and monitor slow queries across PostgreSQL, MySQL, and MongoDB.
- **S3 Operations**: Upload, download, delete objects, and generate pre-signed URLs with AWS SigV4.
- **Git Repository Management**: Full git operations including branch visualization, staging, committing, merging, rebasing, cherry-picking, blaming, tagging, and remote management with an ASCII branch tree dashboard.
- **Self-Updating**: Run `qore update` to download the latest version with progress bar, changelog preview, and automatic backup.
- **Multi-Platform**: Prebuilt binaries for Linux (x64/arm64), macOS (Apple Silicon), and Windows (x64).
- **CI/CD Pipeline**: Automated testing, building, and releasing via GitHub Actions with 4-platform binary compilation.

### MCP Server

- **35 Tools**: SSH, Docker, database, system, discovery, and HTTP operations exposed via JSON-RPC 2.0.
- **5 Resources**: Connections, probe snapshots, containers, images, and system information.
- **4 Prompts**: Infrastructure diagnostics, security audit, container health, and database health check.
- **Zero Credential Exposure**: AI models interact with infrastructure through connection names only. The vault bridge retrieves credentials server-side.

---

## Quick Start

### One-command install (Linux / macOS)

```bash
curl -fsSL https://github.com/Kodjaoglanian/qore/releases/latest/download/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://github.com/Kodjaoglanian/qore/releases/latest/download/install.ps1 | iex
```

This downloads the latest precompiled binary for your platform and installs it to `~/.local/bin/qore` (or `%LOCALAPPDATA%\Qore` on Windows). After installation, run:

```bash
qore
```

### Updating

```bash
qore update
```

### From source

Requirements:

- [Bun](https://bun.sh) runtime (version 1.1 or newer)
- Docker group membership if container management is used (`sudo usermod -aG docker $USER`)

```bash
git clone https://github.com/Kodjaoglanian/qore.git
cd qore
bun install
bun run dev
```

---

## Installation

### One-command install (recommended)

```bash
curl -fsSL https://github.com/Kodjaoglanian/qore/releases/latest/download/install.sh | bash
```

### From source

```bash
git clone https://github.com/Kodjaoglanian/qore.git
cd qore
bun install
bun run build
./qore
```

### Local data directories

Qore creates the following local directories on first run:

```text
~/.qore/
  vault.enc           # Encrypted credential vault
  vault.meta.json     # Vault metadata
  qore.sock           # Unix socket for MCP vault bridge (when unlocked)
  storage/            # Local emulated S3 objects
  metadata.db         # SQLite metadata for local storage
  favorites.json      # Starred commands
  snippets.json       # Saved command snippets/macros
  health.json         # Health check history and config
  snapshots/          # SSH server state snapshots (JSON)
```

### Docker permissions

If Docker containers are not appearing in the discovery screen, ensure your user is a member of the `docker` group:

```bash
sudo usermod -aG docker $USER
# Log out and log back in for the change to take effect
```

---

## Usage

Launch the application and type commands in the bottom input bar. Press Enter to execute, Escape to go back, and Control-C to quit.

### Global commands

| Command | Description |
|---------|-------------|
| `discover` | Scan ports, Docker containers, daemons, system info, network, processes, and services |
| `connections` | Manage saved service connections |
| `dashboard` | Multi-service status overview (requires unlocked vault) |
| `health` | Health checks with history & sparklines (requires unlocked vault) |
| `vault` | Create or unlock the credential vault |
| `help` | Show the full command reference |
| `back` / `esc` | Return to the previous screen |
| `quit` / `exit` / `^c` | Exit Qore from any screen |

### Discovery screen

The discovery screen uses a sidebar layout with 9 sections. Press `1` through `9` or `Tab` to switch sections. Use `Up`/`Down` to navigate within a section.

| Section | Description |
|---------|-------------|
| Overview | System summary, quick stats grid, and disk usage |
| Ports | Open TCP ports with process info |
| Containers | Docker containers with lifecycle actions |
| Images | Docker images with removal and prune |
| Daemons | pm2 and systemd managed processes |
| System | Host information, CPU, memory, disks |
| Network | Interfaces, routes, and firewall rules |
| Procs | Top processes by CPU with kill capability |
| Services | systemd services with control actions |

| Command | Description |
|---------|-------------|
| `start` / `stop` / `restart` | Container lifecycle actions |
| `rm` | Remove selected container or image |
| `logs` | View container or service logs |
| `inspect` | Inspect container details |
| `stats` | Container resource statistics |
| `exec <cmd>` | Execute command inside container |
| `prune` | Remove stopped containers |
| `prune-images` | Remove unused images |
| `kill` / `kill-9` | Terminate selected process |
| `svc-start` / `svc-stop` / `svc-restart` | Control systemd services |
| `svc-logs` | View service logs |
| `batch-start` / `batch-stop` / `batch-restart` | Batch container actions |
| `filter <text>` | Filter current section by text |
| `auto` | Toggle auto-refresh (5 second interval) |
| `refresh` | Re-run the discovery scan |

### UX commands (available on service screens)

| Command | Description |
|---------|-------------|
| `star <command>` | Add a command to favorites |
| `unstar <command>` | Remove a command from favorites |
| `favorites` | List all starred commands |
| `Up/Down` (empty input) | Navigate command list |
| `Up/Down` (with text) | Navigate command history |
| `Tab` | Autocomplete matching commands |
| `Ctrl+Tab` / `Ctrl+Right` | Switch to next connection tab |
| `Ctrl+Left` | Switch to previous connection tab |
| `new` | Open a duplicate session of the current connection |

### Connections screen

| Command | Description |
|---------|-------------|
| `add` | Add a new connection (redis, postgres, mysql, mongo, s3, http, ssh, git) |
| `connect <n>` | Connect to saved connection number n |
| `test <n>` | Test connection number n |
| `rm <n>` | Remove connection number n |
| `changepw` | Change vault master password |
| `export` | Export connections as encrypted bundle |
| `import` | Import connections from encrypted bundle |
| `groups` | View connection groups |
| `group <name>` | Create a new group |
| `group-add <name>` | Add selected connection to group |
| `group-rm <name>` | Remove a group |
| `group-open <name>` | Open all connections in a group |
| `snippet <name>` | Create a command snippet |
| `snippets` | List saved snippets |
| `run <name>` | Execute a saved snippet (opens all referenced connections) |
| `snippet-rm <name>` | Remove a snippet |

### Dashboard screen

| Command | Description |
|---------|-------------|
| `connect <n>` | Connect to connection number n |
| `refresh` | Re-check all connections |
| `auto` | Toggle auto-refresh (10 second interval) |
| `back` / `esc` | Return to welcome screen |

### Health check screen

| Command | Description |
|---------|-------------|
| `refresh` / `check` | Run health checks on all connections |
| `monitor` | Toggle continuous monitoring |
| `interval <s>` | Set check interval (5-3600 seconds) |
| `clear` | Clear all health history |
| `connect <n>` | Connect to connection number n |
| `back` / `esc` | Return to welcome screen |

### Service screen (common commands)

| Command | Description |
|---------|-------------|
| `info` | Show service information |
| `logs [service]` | View service logs (SSH: journalctl, Redis: SLOWLOG, Postgres: pg_stat_activity, MySQL: processlist, Mongo: getLog, HTTP: /logs endpoint) |
| `logs docker <container>` | View Docker container logs (SSH only) |
| `refresh` | Reconnect and reload data |
| `back` / `esc` | Return to connections screen |

### Service screen (database commands)

| Command | Description |
|---------|-------------|
| `tables <db>` | List tables or collections |
| `desc <db> <table>` | Describe table structure |
| `count <db> <table>` | Count rows or documents |
| `sample <db> <t> [n]` | Show sample rows (default 10) |
| `size <db>` | Show table sizes |
| `indexes <db> <table>` | List indexes |
| `views <db>` | List views |
| `funcs <db>` | List functions |
| `conns` | Show active connections |
| `queries` | Show running queries |
| `query <db> <sql>` | Run a custom query |
| `export <db> <table>` | Export table data to CSV file |
| `explain <db> <sql>` | Run EXPLAIN query plan analysis |
| `slow-queries` | Show slow queries (pg_stat_statements, mysql.slow_log, MongoDB profiler) |

### Redis commands

| Command | Description |
|---------|-------------|
| `get <key>` | Get value for key |
| `set <k> <v>` | Set key to value |
| `del <key>` | Delete a key |
| `keys <pattern>` | List keys matching pattern |
| `flushdb` | Clear the current database |
| `info` | Show Redis server info |
| `logs` | Show SLOWLOG and INFO stats |

### S3 commands

| Command | Description |
|---------|-------------|
| `ls <bucket>` | List objects in bucket |
| `mkbucket <name>` | Create a new bucket |
| `rmbucket <name>` | Delete a bucket |
| `upload <local> <bucket/key>` | Upload a local file to S3 |
| `download <bucket/key> <local>` | Download an S3 object to local file |
| `rm <bucket> <key>` | Delete an object from a bucket |
| `presign <bucket> <key>` | Generate a pre-signed URL (1 hour expiry) |

### HTTP API commands

| Command | Description |
|---------|-------------|
| `get <path>` | Send GET request |
| `post <path> <body>` | Send POST request with JSON body |
| `put <path> <body>` | Send PUT request with JSON body |
| `patch <path> <body>` | Send PATCH request with JSON body |
| `delete <path>` | Send DELETE request |
| `logs` | Probe /logs, /health, /status endpoints |

### SSH commands

| Command | Description |
|---------|-------------|
| `shell` | Open an interactive bash terminal over SSH (Ctrl+D to exit) |
| `exec <command>` | Execute a shell command over SSH (interactive PTY) |
| `sysinfo` | Show system information (uname, hostname, uptime, disk, memory) |
| `disk` | Show disk usage (`df -h`) |
| `mem` | Show memory usage (`free -h`) |
| `procs` | List running processes (`ps aux`) |
| `net` | Show listening ports (`ss -tlnp`) |
| `ports` | Show listening ports with process info (top 50) |
| `firewall [status\|allow\|deny\|enable\|disable]` | UFW firewall management |
| `top` | Show top processes by CPU usage |
| `netstat` | Show active network connections |
| `tail <file> [-f]` | Tail a file (optionally follow in real-time) |
| `edit <file>` | Open a file in nano/vim via PTY |
| `security-audit` | Run 8-point security checklist (SSH config, firewall, fail2ban, updates, ports, logins) |
| `snapshot` | Save server state to local JSON file (disk, mem, procs, services, ports, uptime, kernel) |
| `diff <snap1> <snap2>` | Compare two snapshot files line-by-line |
| `deploy <script>` | Run a deploy script via PTY with real-time output |
| `git-status` | Find git repos on server and show status and recent commits |
| `compose <up\|down\|ps\|logs\|restart\|pull> [service]` | Manage Docker Compose |
| `ls [path]` | List directory contents (`ls -la`) |
| `cat <file>` | View file contents (first 500 lines) |
| `find <pattern> [path]` | Search for files by name |
| `du [path]` | Disk usage by subdirectory (sorted) |
| `services` | List running systemd services |
| `svc <action> <name>` | Start/stop/restart/status/enable/disable a service |
| `docker ps` | List all Docker containers |
| `docker images` | List Docker images |
| `docker stats` | Show Docker container resource stats |
| `docker logs [-f] <ctr>` | View or follow container logs |
| `docker <start\|stop\|restart\|rm> <ctr>` | Manage a Docker container |
| `users` | Show currently logged-in users |
| `cron` | List crontab entries |
| `env` | List environment variables |
| `pkgs [search]` | List or search installed packages (dpkg/rpm/pacman) |
| `kill <pid> [signal]` | Send a signal to a process |
| `ping <host>` | Ping a host (4 packets) |
| `upload <local> <remote>` | Upload a file via SFTP |
| `download <remote> <local>` | Download a file via SFTP |
| `logs [service]` | View system logs (journalctl or syslog) |
| `logs docker <container>` | View Docker container logs |
| `reboot yes` | Reboot the remote machine (requires explicit confirmation) |
| `shutdown yes` | Shut down the remote machine (requires explicit confirmation) |

### Git commands

| Command | Description |
|---------|-------------|
| `status` | Show staged, unstaged, and untracked files |
| `diff [--staged]` | Show working tree or staged diff |
| `diff <b1> <b2>` | Show diff between two branches |
| `log` | Show commit graph with ASCII branch tree |
| `branches` | List all branches with ahead/behind counts |
| `checkout <branch>` | Switch to a branch |
| `branch <name>` | Create and switch to a new branch |
| `branch -d <name>` | Delete a branch |
| `stage [files...]` | Stage specific files or all changes |
| `unstage [files...]` | Unstage specific files or all changes |
| `commit <message>` | Create a commit |
| `amend [message]` | Amend the last commit |
| `merge <branch>` | Merge a branch into the current branch |
| `rebase <branch>` | Rebase current branch onto another branch |
| `fetch [remote]` | Fetch from remote |
| `pull [remote] [branch]` | Pull from remote |
| `push [remote] [branch]` | Push to remote |
| `cherry-pick <hash>` | Cherry-pick a commit |
| `revert <hash>` | Revert a commit |
| `blame <file>` | Show blame information for a file |
| `tags` | List all tags |
| `tag <name> [message]` | Create a new tag |
| `remotes` | List all remotes |
| `remote-add <name> <url>` | Add a new remote |
| `exec <git args...>` | Run any raw git command |

---

## MCP Server

Qore includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) server that exposes infrastructure management capabilities to AI models (Claude, GPT, Cursor, Windsurf, and others) without exposing credentials.

### Architecture

```text
+-------------+     JSON-RPC      +--------------+     Unix Socket     +--------------+
|  AI Model   | <--------------> |  qore mcp    | <-----------------> |  qore TUI    |
| (Claude/GPT)|    (stdio)       |  (subprocess)|  ~/.qore/qore.sock  |  (vault)     |
+-------------+                  +--------------+                     +--------------+
```

- The **TUI** holds the encrypted vault in memory and opens a Unix socket at `~/.qore/qore.sock` (chmod 0600) when unlocked.
- The **MCP server** (`qore mcp`) runs as a subprocess of the AI client, connects to the socket on demand, and retrieves connection configs to execute operations.
- The **AI model** never sees credentials. It only uses connection names and receives operation results.

### Quick Start

1. Start the qore TUI and unlock your vault:
   ```bash
   qore
   ```

2. Configure your AI client:
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

3. The AI model can now discover ports, manage Docker containers, execute SSH commands, query databases, and more.

### Security Model

- Credentials are never exposed to the AI model.
- MCP tools only accept connection names, never return secrets.
- Unix socket has filesystem permissions (0600). Only the same user can connect.
- No credentials are written to disk or environment variables.
- Socket file is cleaned up on vault lock, TUI exit, and process signals (SIGTERM/SIGINT).
- If the vault is locked, connection-dependent tools return: `"Vault locked -- unlock in qore TUI first"`.

### Available Capabilities

- **35 tools**: SSH (6), Docker (11), database (5), system (7), discovery (7), HTTP (4)
- **5 resources**: connections, probe snapshot, containers, images, system info
- **4 prompts**: diagnose_infra, security_audit, container_health, db_health_check

### CLI help

```bash
qore mcp --help
```

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `QORE_SOCKET_PATH` | Override the vault socket path | `~/.qore/qore.sock` |
| `QORE_LOG_LEVEL` | Log level: debug, info, warn, error | `info` |

### Configuration examples

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `~/.config/claude/claude_desktop_config.json` on Linux):

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

**Cursor** (`.cursor/mcp.json` in your project):

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

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`):

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

See [docs/mcp.md](docs/mcp.md) for full documentation including all tools, resources, and prompts.

---

## Architecture

```text
src/
  index.tsx              # Entry point
  core/
    types.ts             # Shared interfaces
    orchestrator.ts      # Central discovery engine
    probe/
      network.ts         # TCP port scanner
      docker.ts          # Docker Unix socket client
      daemon.ts          # pm2/systemd scanner
      system.ts          # System info (CPU, memory, disks)
      processes.ts       # Process listing and kill
      services.ts        # systemd service control
      network-info.ts    # Interfaces, routes, firewall
    providers/
      localS3.ts         # Local emulated S3 provider
      awsS3.ts           # AWS S3 provider
      messaging.ts       # In-memory Pub/Sub
    vault/
      crypto.ts          # scrypt + AES-256-GCM
      vault.ts           # Encrypted vault file manager
      types.ts           # Connection types and labels
      socket-bridge.ts   # Unix socket server for MCP vault access
    connections/
      manager.ts         # Connection manager factory + QuickStatus
      redis.ts           # Redis RESP driver
      s3.ts              # S3-compatible REST driver
      postgres.ts        # PostgreSQL wire driver
      mysql.ts           # MySQL driver (mysql2)
      mongo.ts           # MongoDB wire driver
      http.ts            # HTTP API manager (generic REST)
      ssh.ts             # SSH remote manager (ssh2)
    snippets.ts          # Command snippet persistence
    health.ts            # Health check history and sparklines
  mcp/
    index.ts             # MCP server entry point
    server.ts            # JSON-RPC 2.0 server (stdio transport)
    protocol.ts          # JSON-RPC types and error codes
    registry.ts          # Tool registration and dispatch
    vault-client.ts      # Unix socket client for vault access
    resources.ts         # MCP resource providers
    prompts.ts           # MCP prompt templates
    config.ts            # MCP config and env var helpers
    tools/
      ssh.ts             # SSH tools (6)
      docker.ts          # Docker tools (11)
      database.ts        # Database tools (5)
      system.ts          # System tools (7)
      discover.ts        # Discovery tools (7)
      http.ts            # HTTP tools (4)
  cli/
    update.ts            # Self-update and CLI argument handling
  ui/
    App.tsx              # Root TUI component
    theme.ts             # Color palette
    WelcomeScreen.tsx    # Initial screen
    DiscoverScreen.tsx   # Discovery results (sidebar layout)
    ConnectionsScreen.tsx# Connection management (groups, snippets)
    DashboardScreen.tsx  # Multi-service status dashboard
    HealthScreen.tsx     # Health check dashboard with sparklines
    ServiceScreen.tsx    # Service-specific console
    VaultScreen.tsx      # Vault unlock/creation
    HelpScreen.tsx       # Command reference
    StorageScreen.tsx    # Storage browser
    ProvidersScreen.tsx  # Provider switcher
    components/          # Reusable UI primitives
    hooks/               # Terminal size and input hooks
  tests/
    core.test.ts         # Core crypto and theme tests
```

### Design principles

- **Bun-native**: Prefer built-in Bun APIs such as `bun:sqlite`, `Bun.serve`, and `Bun.write` over heavier Node.js alternatives.
- **Protocol-level**: Connect to services through their native wire protocols instead of wrapping CLI tools.
- **Single binary**: The application compiles into one executable with `bun build --compile`.
- **Zero-config discovery**: The first run can scan the environment without manual configuration files.
- **Credential isolation**: The vault bridge ensures credentials never leave the process boundary. The MCP server receives connection names, not secrets.

---

## Configuration

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HOME` | Used to locate `~/.qore` and `~/.aws/credentials` | System home directory |
| `QORE_SOCKET_PATH` | Override the MCP vault socket path | `~/.qore/qore.sock` |
| `QORE_LOG_LEVEL` | MCP server log level | `info` |

### AWS credentials

For cloud S3 mode, place credentials in the standard location:

```text
~/.aws/credentials
```

Use the `[default]` profile unless the provider is extended to support named profiles.

### Local storage

- Objects: `~/.qore/storage/`
- Metadata: `~/.qore/metadata.db` (SQLite via bun:sqlite)

---

## Development

```bash
# Run the TUI with hot reload
bun run dev

# Run the TypeScript compiler in check mode
bun run tsc

# Run the test suite
bun test
```

### Project scripts

| Script | Description |
|--------|-------------|
| `dev` | Run the TUI in development mode |
| `start` | Run the TUI (alias for dev) |
| `build` | Prebuild patches and compile to single binary |
| `tsc` | TypeScript type checking (no emit) |
| `test` | Run the test suite |
| `pretag` | Run tsc + tests before tagging |
| `release:patch` | Validate, bump patch version, tag, and push |
| `release:minor` | Validate, bump minor version, tag, and push |

---

## Testing

Tests are written with `bun:test` and cover the core cryptography and vault lifecycle:

```bash
bun test
```

Current test areas:

- Theme color definitions
- scrypt key derivation determinism
- AES-256-GCM encryption and decryption round-trip
- Decryption failure with wrong key
- Vault initialization, unlock, and wrong-password handling

---

## Building

```bash
bun run build
```

This produces a single `qore` binary in the project root. The binary can be moved to any directory in `PATH`.

### CI/CD Pipeline

The project uses 3 GitHub Actions workflows:

- **CI** (`ci.yml`): Runs `tsc` + tests + build smoke test on every push/PR to `main`.
- **Build** (`build.yml`): Reusable workflow that compiles binaries for 4 platforms with caching and smoke tests.
- **Release** (`release.yml`): Triggered by tag push `v*.*.*`. Builds all platforms, verifies artifacts, auto-generates changelog, and creates GitHub Release.

Bun version is pinned to `1.2.0` for reproducible builds.

### Releasing

```bash
# Patch release (automated: tsc + test + bump + tag + push)
bun run release:patch

# Minor release
bun run release:minor
```

The CI pipeline handles the rest: building, changelog generation, and GitHub Release creation.

---

## Roadmap

### Implemented

- Core network probe (TCP port scanner)
- Docker Unix socket integration
- Terminal-native welcome screen
- Secure credential vault (AES-256-GCM + scrypt)
- Connection managers for Redis, S3-compatible storage, PostgreSQL, MySQL, MongoDB, HTTP API, SSH, and Git repositories
- Connections and service screens
- Vault password change flow in the UI
- Encrypted connection import and export (QOREX1 bundle format)
- Multi-platform builds (Linux x64/arm64, macOS arm64, Windows x64)
- Self-updating via `qore update`
- Service log aggregation (SSH, Redis, Postgres, MySQL, Mongo, HTTP)
- SSH toolkit: file operations, service control, Docker management, SFTP transfer, process and network utilities
- SSH management: ports, firewall, top, netstat, tail, edit, docker logs -f
- UX improvements: command history, Tab autocomplete, favorites, multi-connection tabs
- Database features: export to CSV, EXPLAIN query plan, slow queries monitoring
- S3 operations: upload, download, delete objects, pre-signed URLs (AWS SigV4)
- Security and infrastructure: security-audit, server snapshots, snapshot diff
- DevOps: deploy scripts, git-status, Docker Compose management
- Multi-connection: all tabs rendered simultaneously, state preserved on switch
- Multi-connection: Ctrl+Tab / Ctrl+Arrows switching, close command to disconnect
- Multi-session: multiple sessions of same connection (unique sessionId, `new` command)
- CI/CD: 3-workflow pipeline with cache, smoke tests, pinned bun, automated releases
- Discovery screen: sidebar layout with 9 sections, filtering, auto-refresh, batch actions
- Discovery screen: process management, service control, container stats, Docker exec
- MCP server: 35 tools, 5 resources, 4 prompts over JSON-RPC 2.0 (stdio)
- MCP vault bridge: Unix socket with 0600 permissions, credential isolation
- MCP documentation: docs/mcp.md, config examples for Claude Desktop, Cursor, Windsurf
- Git repository management: branch tree visualization, staging, committing, merging, rebasing, cherry-picking, blaming, tagging, remote management
- SSH interactive shell: full bash terminal with Ctrl+D exit, tab completion, arrow keys
- Connection groups: organize connections, batch open, group tags in list view
- Command snippets: save and replay command sequences across connections
- Multi-service dashboard: consolidated status overview with auto-refresh
- Health check dashboard: periodic monitoring with sparklines, uptime %, configurable intervals

### Planned

- Local emulated S3 and Pub/Sub providers
- Multi-architecture CI matrix for ARM native builds
- Expanded test coverage (connection managers, SSH commands, UI components)
- Linting (eslint/biome) in CI pipeline
- WebSocket transport for MCP server
- MCP sampling support for AI-driven remediation

---

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details about the code of conduct, development workflow, and how to submit pull requests.

---

## License

This project is released under the MIT License. See [LICENSE](LICENSE) for the full text.
