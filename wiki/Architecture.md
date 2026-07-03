# Architecture

Qore is built as a single-process application using Bun and TypeScript. The codebase is organized into four major subsystems: core (probe, vault, connections), MCP server, CLI, and UI.

---

## Source Tree

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
    DiscoverScreen.tsx   # Discovery results (sidebar layout)
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

## Module Overview

### Core

#### Probe (`core/probe/`)

The probe subsystem scans the local machine for infrastructure components. Each probe module is independent and can be called individually or through the orchestrator.

| Module | Function |
|--------|----------|
| `network.ts` | TCP port scanner (scans ports 1-65535) |
| `docker.ts` | Docker container/image management via Unix socket |
| `daemon.ts` | pm2 and systemd daemon detection |
| `system.ts` | CPU, memory, disk, uptime, load average |
| `processes.ts` | Process listing and signal sending |
| `services.ts` | systemd service listing and control |
| `network-info.ts` | Network interfaces, routes, firewall rules |

#### Vault (`core/vault/`)

The vault subsystem handles credential encryption, storage, and the MCP socket bridge.

| Module | Function |
|--------|----------|
| `crypto.ts` | scrypt key derivation + AES-256-GCM encryption |
| `vault.ts` | Vault file read/write, connection add/remove |
| `types.ts` | Connection type definitions and labels |
| `socket-bridge.ts` | Unix socket server for MCP vault access |

#### Connections (`core/connections/`)

Each connection type has a dedicated manager implementing a common interface.

| Module | Protocol |
|--------|----------|
| `redis.ts` | RESP (REdis Serialization Protocol) |
| `postgres.ts` | PostgreSQL wire protocol |
| `mysql.ts` | mysql2 library |
| `mongo.ts` | MongoDB wire protocol |
| `s3.ts` | S3-compatible REST |
| `http.ts` | HTTP REST |
| `ssh.ts` | SSH (ssh2 library) |

The `manager.ts` file provides a factory function that returns the correct manager based on connection type.

### MCP Server (`mcp/`)

The MCP server subsystem implements the Model Context Protocol for AI model integration.

| Module | Function |
|--------|----------|
| `server.ts` | JSON-RPC 2.0 server with stdio transport |
| `protocol.ts` | JSON-RPC types, error codes, protocol version |
| `registry.ts` | Tool registration, schema validation, dispatch |
| `vault-client.ts` | Unix socket client for vault bridge communication |
| `resources.ts` | Resource providers (5 resources) |
| `prompts.ts` | Prompt templates (4 prompts) |
| `config.ts` | Configuration helpers and environment variables |
| `tools/*.ts` | Tool definitions organized by category |

### UI (`ui/`)

The UI is built with Ink (React for terminals) and uses a custom color palette and reusable components.

| Module | Function |
|--------|----------|
| `App.tsx` | Root component, screen routing |
| `theme.ts` | Color palette (TrueColor hex values) |
| `DiscoverScreen.tsx` | Sidebar layout with 9 sections |
| `ServiceScreen.tsx` | Multi-tab, multi-session service console |
| `components/` | StyledBox, InputBar, ShortcutBar, Breadcrumb, ScrollIndicator |
| `hooks/` | useTerminalSize, useInput handling |

## Design Principles

- **Bun-native**: Prefer built-in Bun APIs (`bun:sqlite`, `Bun.serve`, `Bun.write`) over heavier Node.js alternatives.
- **Protocol-level**: Connect to services through native wire protocols instead of wrapping CLI tools.
- **Single binary**: Compiles into one executable with `bun build --compile`.
- **Zero-config discovery**: First run can scan the environment without configuration files.
- **Credential isolation**: The vault bridge ensures credentials never leave the process boundary.

---

Previous: [MCP Resources and Prompts](MCP-Resources-and-Prompts) -- Next: [Development](Development)
