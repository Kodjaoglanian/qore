# Qore

Ultra-lightweight, single-binary hybrid infrastructure orchestrator with a terminal-native TUI.

Built for developers who manage local services, containers, and cloud-compatible resources from the terminal without leaving the keyboard. Qore scans the environment, stores credentials securely, and exposes a consistent command interface for Redis, PostgreSQL, MongoDB, S3-compatible storage, and HTTP APIs.

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Quick Start](#quick-start)
4. [Installation](#installation)
5. [Usage](#usage)
6. [Architecture](#architecture)
7. [Configuration](#configuration)
8. [Development](#development)
9. [Testing](#testing)
10. [Building](#building)
11. [Roadmap](#roadmap)
12. [Contributing](#contributing)
13. [License](#license)

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
- **Protocol-Native Drivers**: Redis, PostgreSQL, MongoDB, S3-compatible, and HTTP support without vendor lock-in.
- **Keyboard-First TUI**: Type commands, use arrow keys for selection, and press Escape to navigate back.

---

## Quick Start

### One-command run (no install needed)

```bash
npx qore-orchestrator
```

This downloads and runs Qore automatically. The only requirement is the [Bun](https://bun.sh) runtime. If Bun is not installed, Qore will print instructions on how to install it.

### Install Bun (if needed)

```bash
curl -fsSL https://bun.sh/install | bash
# or
npm install -g bun
```

### Global install

```bash
npm install -g qore-orchestrator
qore
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
npm install --no-bin-links

# Run the TUI in development mode
bun run dev

# Build a single binary
bun run build
```

---

## Installation

### From source

```bash
git clone https://github.com/Kodjaoglanian/qore.git
cd qore
npm install --no-bin-links
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
| `quit` / `^c` | Exit Qore |

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
| `add` | Add a new connection |
| `connect <n>` | Connect to saved connection number n |
| `test <n>` | Test connection number n |
| `rm <n>` | Remove connection number n |

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

### Redis commands

| Command | Description |
|---------|-------------|
| `get <key>` | Get value for key |
| `set <k> <v>` | Set key to value |
| `del <key>` | Delete a key |
| `keys <pattern>` | List keys matching pattern |
| `flushdb` | Clear the current database |

### S3 commands

| Command | Description |
|---------|-------------|
| `ls <bucket>` | List objects in bucket |
| `mkbucket <name>` | Create a new bucket |
| `rmbucket <name>` | Delete a bucket |

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
    connections/
      manager.ts         # Connection manager factory
      redis.ts           # Redis RESP driver
      s3.ts              # S3-compatible REST driver
      postgres.ts        # PostgreSQL wire driver
      mongo.ts           # MongoDB wire driver
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
  "build": "bun build src/index.tsx --compile --outfile qore",
  "test": "bun test"
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

---

## Roadmap

Implemented:

- Core network probe
- Docker Unix socket integration
- Terminal-native welcome screen
- Secure credential vault
- Connection managers for Redis, S3-compatible storage, PostgreSQL, and MongoDB
- Connections and service screens

Planned:

- MySQL connection manager
- SSH remote connection manager
- HTTP API connection manager
- Vault password change flow in the UI
- Encrypted connection import and export
- Service log aggregation and health checks

---

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details about the code of conduct, development workflow, and how to submit pull requests.

---

## License

This project is released under the MIT License. See [LICENSE](./LICENSE) for the full text.
