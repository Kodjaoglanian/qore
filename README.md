# Qore

Ultra-lightweight, single-binary hybrid infrastructure orchestrator with a terminal-native TUI.

Built for developers who manage local services, containers, and cloud-compatible resources from the terminal without leaving the keyboard. Qore scans the environment, stores credentials securely, and exposes a consistent command interface for Redis, PostgreSQL, MongoDB, S3-compatible storage, HTTP APIs, and SSH servers.

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

- **Discovery**: Scans local TCP ports, Docker containers via the Unix socket, and daemon processes managed by pm2 or systemd.
- **Secure Vault**: Stores connection credentials with AES-256-GCM encryption and scrypt key derivation. The master password is never written to disk.
- **Resource Management**: Provides a unified command interface for databases, object storage, and HTTP endpoints, using native protocols instead of vendor-specific CLIs.

The interface is designed around a persistent command bar, keyboard navigation, and a dark, high-contrast color scheme inspired by terminal-native tools.

---

## Features

- **Auto-Discovery**: Identify running services on local ports without manual configuration.
- **Docker Integration**: Control containers directly through `/var/run/docker.sock`. No `docker` CLI dependency.
- **Hybrid Storage**: Switch between local emulated S3 (SQLite + filesystem) and real AWS S3 credentials.
- **Credential Vault**: Encrypt connections at rest with a single master password.
- **Protocol-Native Drivers**: Redis, PostgreSQL, MySQL, MongoDB, S3-compatible, HTTP API, and SSH support without vendor lock-in.
- **Vault Management**: Change master password and import/export encrypted connection bundles.
- **Self-Updating**: Run `qore update` to download the latest version automatically.
- **Multi-Platform**: Prebuilt binaries for Linux (x64/arm64), macOS (Apple Silicon), and Windows (x64).
- **Keyboard-First TUI**: Type commands, use arrow keys for selection, and press Escape to navigate back.
- **Multi-Connection Tabs**: Open multiple service connections simultaneously and switch between them with Ctrl+Tab / Ctrl+Arrow keys. All tabs stay mounted — connections remain active and state is preserved when switching.
- **Multi-Session**: Open multiple sessions of the same connection (e.g., two SSH sessions to the same server). Use the `new` command inside any service screen to open a duplicate session.
- **Command History**: Navigate previous commands with Up/Down arrows when the input bar has text.
- **Tab Autocomplete**: Press Tab to cycle through matching commands.
- **Favorites**: Star frequently used commands with `star <cmd>` and recall them with `favorites`.
- **SSH Security Audit**: Run a comprehensive security checklist on remote servers.
- **Snapshots & Diff**: Save server state snapshots and compare them to detect changes over time.
- **DevOps Commands**: Deploy scripts, check git status, and manage Docker Compose on remote servers.
- **Database Export**: Export table data to CSV files.
- **Query Analysis**: Run EXPLAIN plans and monitor slow queries across PostgreSQL, MySQL, and MongoDB.
- **S3 File Management**: Upload, download, delete objects, and generate pre-signed URLs.
- **CI/CD Pipeline**: Automated testing, building, and releasing via GitHub Actions with 4-platform binary compilation.

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

To update an existing installation to the latest version:

```bash
qore update
```

### From source

Requirements:

- [Bun](https://bun.sh) runtime (version 1.1 or newer)
- Node.js-compatible environment for development
- Docker access permissions if container management is used

```bash
# Clone the repository
git clone https://github.com/Kodjaoglanian/qore.git
cd qore

# Install dependencies
bun install

# Run the TUI in development mode
bun run dev

# Build a single binary
bun run build
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
  storage/            # Local emulated S3 objects
  metadata.db         # SQLite metadata for local storage
  favorites.json      # Starred commands
  snapshots/          # SSH server state snapshots (JSON)
```

---

## Usage

Launch the application and type commands in the bottom input bar. Press Enter to execute, Escape to go back, and Control-C to quit.

### Global commands

| Command | Description |
|---------|-------------|
| `discover` | Scan ports, Docker containers, and daemon processes |
| `connections` | Manage saved service connections |
| `vault` | Create or unlock the credential vault |
| `help` | Show the full command reference |
| `back` / `esc` | Return to the previous screen |
| `quit` / `exit` / `^c` | Exit Qore from any screen |

### UX commands (available on service screens)

| Command | Description |
|---------|-------------|
| `star <command>` | Add a command to favorites |
| `unstar <command>` | Remove a command from favorites |
| `favorites` | List all starred commands |
| `Up/Down` (empty input) | Navigate command list |
| `Up/Down` (with text) | Navigate command history |
| `Tab` | Autocomplete matching commands |
| `Ctrl+Tab` / `Ctrl+→` | Switch to next connection tab |
| `Ctrl+←` | Switch to previous connection tab |

### Discovery screen

| Command | Description |
|---------|-------------|
| `start` | Start the selected container |
| `stop` | Stop the selected container |
| `restart` | Restart the selected container |
| `rm` | Remove the selected container |
| `logs` | View container logs |
| `inspect` | Inspect container details |
| `prune` | Remove stopped containers |
| `refresh` | Re-run the discovery scan |

### Connections screen

| Command | Description |
|---------|-------------|
| `add` | Add a new connection (redis, postgres, mysql, mongo, s3, http, ssh) |
| `connect <n>` | Connect to saved connection number n |
| `test <n>` | Test connection number n |
| `rm <n>` | Remove connection number n |
| `changepw` | Change vault master password |
| `export` | Export connections as encrypted bundle |
| `import` | Import connections from encrypted bundle |

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
| `quit` / `exit` | Exit Qore from any screen |

---

## MCP Server

Qore includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) server that exposes infrastructure management capabilities to AI models (Claude, GPT, Cursor, Windsurf, etc.) — **without exposing credentials**.

### Quick Start

1. Start qore TUI and unlock your vault
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
3. The AI model can now discover ports, manage Docker containers, execute SSH commands, query databases, and more

### How It Works

The TUI holds the encrypted vault and opens a Unix socket (`~/.qore/qore.sock`) when unlocked. The MCP server (`qore mcp`) runs as a subprocess of the AI client, connects to the socket on demand, and retrieves connection configs to execute operations. The AI model never sees credentials.

### Available Capabilities

- **35 tools**: SSH, Docker, database, system, discovery, HTTP
- **5 resources**: connections, probe snapshot, containers, images, system info
- **4 prompts**: diagnose_infra, security_audit, container_health, db_health_check

See [docs/mcp.md](docs/mcp.md) for full documentation and configuration examples.

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
    providers/
      localS3.ts         # Local emulated S3 provider
      awsS3.ts           # AWS S3 provider
      messaging.ts      # In-memory Pub/Sub
    vault/
      crypto.ts          # scrypt + AES-256-GCM
      vault.ts           # Encrypted vault file manager
      types.ts           # Connection types and labels
      socket-bridge.ts   # Unix socket server for MCP vault access
    connections/
      manager.ts         # Connection manager factory
      redis.ts           # Redis RESP driver
      s3.ts              # S3-compatible REST driver
      postgres.ts        # PostgreSQL wire driver
      mysql.ts           # MySQL driver (mysql2)
      mongo.ts           # MongoDB wire driver
      http.ts            # HTTP API manager (generic REST)
      ssh.ts             # SSH remote manager (ssh2)
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
    DiscoverScreen.tsx   # Discovery results
    ConnectionsScreen.tsx# Connection management
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
- **Protocol-level**: Connect to services through their native protocols instead of wrapping CLI tools.
- **Single binary**: The application compiles into one executable with `bun build --compile`.
- **Zero-config discovery**: The first run can scan the environment without manual configuration files.

---

## Configuration

### Environment variables

| Variable | Description |
|----------|-------------|
| `HOME` | Used to locate `~/.qore` and `~/.aws/credentials` |

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

```json
{
  "dev": "bun run src/index.tsx",
  "start": "bun run src/index.tsx",
  "build": "bash scripts/prebuild.sh && bun build src/index.tsx --compile --outfile qore",
  "tsc": "tsc --noEmit",
  "test": "bun test",
  "pretag": "bun run tsc && bun test",
  "release:patch": "bun run pretag && npm version patch --no-git-tag-version && git add -A && git commit -m \"chore: bump version\" && git tag v$(node -p \"require('./package.json').version\") && git push origin main --tags",
  "release:minor": "bun run pretag && npm version minor --no-git-tag-version && git add -A && git commit -m \"chore: bump version\" && git tag v$(node -p \"require('./package.json').version\") && git push origin main --tags"
}
```

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

The CI pipeline handles the rest — building, changelog generation, and GitHub Release creation.

---

## Roadmap

Implemented:

- Core network probe
- Docker Unix socket integration
- Terminal-native welcome screen
- Secure credential vault (AES-256-GCM + scrypt)
- Connection managers for Redis, S3-compatible storage, PostgreSQL, MySQL, MongoDB, HTTP API, and SSH
- Connections and service screens
- Vault password change flow in the UI
- Encrypted connection import and export (QOREX1 bundle format)
- Multi-platform builds (Linux x64/arm64, macOS arm64, Windows x64)
- Self-updating via `qore update`
- Service log aggregation (SSH/Redis/Postgres/MySQL/Mongo/HTTP)
- SSH toolkit: file operations, service control, Docker management, SFTP transfer, process/network utilities
- SSH management: ports, firewall, top, netstat, tail, edit, docker logs -f
- UX improvements: command history, Tab autocomplete, favorites, multi-connection tabs
- Database features: export to CSV, EXPLAIN query plan, slow queries monitoring
- S3 operations: upload, download, delete objects, pre-signed URLs (AWS SigV4)
- Security & infrastructure: security-audit, server snapshots, snapshot diff
- DevOps: deploy scripts, git-status, Docker Compose management
- quit/exit command from any screen
- Multi-connection: all tabs rendered simultaneously, state preserved on switch
- Multi-connection: Ctrl+Tab / Ctrl+Arrows switching, close command to disconnect
- Multi-session: multiple sessions of same connection (unique sessionId, `new` command)
- CI/CD: 3-workflow pipeline with cache, smoke tests, pinned bun, automated releases

Planned:

- Service health checks and monitoring dashboard
- Local emulated S3 and Pub/Sub providers
- Multi-architecture CI matrix for ARM native builds
- Expanded test coverage (connection managers, SSH commands, UI components)
- Linting (eslint/biome) in CI pipeline

---

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details about the code of conduct, development workflow, and how to submit pull requests.

---

## License

This project is released under the MIT License. See [LICENSE](./LICENSE) for the full text.
