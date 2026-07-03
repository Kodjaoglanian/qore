# AGENTS.md — Qore Control Center Architecture & Context Memory

This file serves as the core semantic memory and operational manual for any AI Agent (like Claude Code, Cursor, or local LLMs) interacting with, refactoring, or extending the Qore infrastructure orchestrator.



## Project Overview

Qore is an ultra-lightweight, single-binary hybrid infrastructure orchestrator written in TypeScript and powered by the **Bun** runtime. It provides a terminal-native TUI (Terminal User Interface) with an elegant, minimalist aesthetic inspired by `torlink` (using dark tones, electric purples, and high-contrast status highlights).

### Core Philosophy

- **Zero-Config Auto-Discovery**: Instantly scan and map local processes, Docker containers, and active network ports.
- **Hybrid-Ready Engine**: Seamlessly unify local emulated cloud services (Mock S3, Pub/Sub) and real external cloud providers under the same UI abstractions. No vendor lock-in — all connections are generic and protocol-based.
- **Secure Credential Vault**: All connection credentials are encrypted at rest with AES-256-GCM, key derived from master password via scrypt. Credentials never touch disk in plaintext.
- **Resource-Efficient**: Maintain a sub-50MB RAM footprint with instantaneous startup times, completely avoiding heavy container-in-container layers like LocalStack.

---

## System Architecture & Strategy Patterns

The codebase is strictly modularized into three main execution vectors managed by a central orchestration engine. When generating code, ensure you adhere to the following strategy patterns.

### 1. Probe & Auto-Discovery Phase (`src/core/probe/`)

- **Docker Scanner**: Directly streams metrics and management state by reading from the native Docker Unix Socket (`/var/run/docker.sock`). Do not execute raw `docker ps` child processes; use native socket communication.
- **Network Port Auditor**: Spawns low-level system audits (`lsof -i -P -n` or platform-native APIs) to auto-detect databases and HTTP services running on local ports.
- **Daemon Monitor**: Queries background managers (`pm2`, `systemd`) to surface loose microservices.

### 2. Storage & Messaging Abstraction (`src/core/providers/`)

All storage and messaging subsystems must implement unified interfaces to allow hybrid switching (Local Emulated vs. Cloud Real):

```typescript
// Strict contract for storage providers
interface StorageProvider {
  listBuckets(): Promise<string[]>;
  createBucket(name: string): Promise<void>;
  uploadFile(bucket: string, path: string, file: Buffer): Promise<void>;
}
```

- `LocalS3Provider`: Intercepts AWS SDK XML/HTTP payloads. Persists files to a local embedded SQLite database or an encrypted hidden directory (`~/.qore/storage/`).
- `AwsS3Provider`: Leverages native cloud credentials found in `~/.aws/credentials` to control remote production buckets seamlessly.

### 2b. Secure Vault (`src/core/vault/`)

Manages encrypted credentials for all external connections.

- `crypto.ts`: scrypt key derivation (N=2^17, r=8, p=1) + AES-256-GCM authenticated encryption using `node:crypto`.
- `vault.ts`: Manages `~/.qore/vault.enc` — init, unlock, add/update/remove connections, change password. Key is zeroed on lock.
- `types.ts`: `ConnectionConfig` interface — generic, supports redis, postgres, mysql, mongo, s3, http, ssh, git.

### 2c. Connection Managers (`src/core/connections/`)

Protocol-level integrations with real services. No mocks, no vendor lock-in.

- `manager.ts`: Common interfaces (`ConnectionManager` with optional `getLogs`, `DatabaseManager`, `StorageManager`) + factory.
- `redis.ts`: RESP protocol via `Bun.connect` — PING, INFO, KEYS, GET/SET, DEL, FLUSHDB, SLOWLOG. Works with Redis, Valkey, DragonflyDB, KeyDB.
- `s3.ts`: S3 REST API with AWS Signature V4 signing via `fetch`. Works with MinIO, RustFS, SeaweedFS, Cloudflare R2, AWS S3.
- `postgres.ts`: PostgreSQL wire protocol via `pg` driver. Works with PostgreSQL, CockroachDB, YugabyteDB.
- `mysql.ts`: MySQL driver via `mysql2/promise`. Works with MySQL, MariaDB.
- `mongo.ts`: MongoDB wire protocol via `mongodb` driver. Works with MongoDB, FerretDB.
- `http.ts`: Generic HTTP/REST client via `fetch`. GET, POST, PUT, PATCH, DELETE.
- `ssh.ts`: SSH remote manager via `ssh2`. Exec commands, SFTP upload/download, journalctl/syslog logs, Docker container management, systemd service control, PTY for interactive commands (edit, deploy, tail -f), security audit, server snapshots, Docker Compose management, git-status, firewall (UFW), ports scanning.
- `git.ts`: Git repository manager via local `git` CLI (`Bun.spawn`). Status, diff, branches, log graph, stage/unstage, commit, checkout, createBranch, deleteBranch, merge, rebase, fetch, pull, push, cherry-pick, revert, amend, blame, tags, remotes, addRemote, exec.

### 3. TUI & Render Pipeline (`src/ui/`)

- The UI must match the `torlink` visual identity: clean box-drawing characters (`┌ ┐ └ ┘ ─ │`), minimalist text-based tabs, and no bloated layouts.
- Colors are strictly defined: Dark Backgrounds, Electric Purple highlights (`#A370F7`) for active focus/borders, and Muted Blue-Grays (`#5C5B66`) for background context/shortcuts.
- **Screens**: Welcome -> Discover (Docker/ports/daemons) -> Vault (unlock/create) -> Connections (list/add/test) -> Service (type-specific management: Redis/S3/Postgres/MySQL/Mongo/HTTP/SSH/Git).
- **Input Model**: InputBar is always focused. Commands are typed + Enter. Arrow keys navigate command list when input is empty, or navigate command history when input has text. Tab cycles autocomplete. No single-key shortcuts that conflict with typing.
- **Multi-Connection**: Multiple service connections can be open simultaneously as tabs. Switch with Ctrl+Tab / Ctrl+Arrows. All ServiceScreen instances are rendered simultaneously — inactive tabs use `display="none"` and `focused={false}` to preserve state (connection, history, items) without remounting. Only the active tab captures keyboard input via `useInput({ isActive: focused })`.
- **Multi-Session**: Multiple sessions of the same connection are allowed. Each tab is identified by a unique `sessionId` (not `conn.id`), so connecting to the same server twice opens two independent tabs. Use `new` command inside ServiceScreen to open a duplicate session. The ConnectionsScreen shows `[open xN]` when N sessions of the same connection are active. `handleConnect` in App.tsx always creates a new `ActiveSession` — it never deduplicates.
- **Favorites**: Starred commands stored in `~/.qore/favorites.json`. Use `star <cmd>` / `unstar <cmd>` / `favorites`.
- **Close vs Back**: `back` returns to Connections screen without closing the tab (connection stays active). `close` disconnects and removes the tab entirely.
- **Snapshots**: SSH server state snapshots saved to `~/.qore/snapshots/` as JSON files. Compare with `diff <s1> <s2>`.

---

## Guidelines for AI Agents (Rules of Engagement)

When modifying this repository, you MUST follow these constraints:

1. **Bun-Native Only**: Utilize Bun's optimized built-in modules wherever possible. Prefer `Bun.write()`, `Bun.serve()`, and the built-in `bun:sqlite` over heavy external npm alternatives.
2. **Preserve TrueColor Capabilities**: Do not fall back to standard 8-color ANSI layout schemes. Ensure the UI components support full 24-bit TrueColor palettes to maintain the aesthetic fidelity of the design.
3. **Strict Thread Safety**: The emulated messaging queues (Pub/Sub) and proxy routers run concurrently with the main TUI render loop. Ensure all local memory structures are thread-safe and don't block the main event loop.
4. **No Code Disruption**: When implementing automated features like the AI Log Doctor, safely wrap execution sandboxes or API integrations so they never crash the core orchestrator runtime if an external service becomes unavailable.
5. **Layout Height Awareness**: `ServiceScreen` receives a `heightOffset` prop from `App.tsx` to account for the App's overhead (4 lines: StatusBar + borders + footer) plus the tab bar (2 lines when visible). All height calculations inside `ServiceScreen` use `effectiveHeight = termHeight - heightOffset`. Never use raw `termHeight` for layout — always use `effectiveHeight`.
6. **Multi-Tab Rendering**: All `ServiceScreen` instances must remain mounted simultaneously. Inactive tabs use `display="none"` — never conditionally mount/unmount. The `focused` prop controls which tab captures input via `useInput({ isActive: focused })`. This preserves connection state and prevents reconnection on tab switch.
7. **Input Coordination**: `InputBar` handles all keyboard input when `focused=true`. Arrow keys navigate history (with text) or command list (empty input) via `onNavigate`. `Ctrl+Tab` is handled by `App.tsx` — `InputBar` skips Tab handling when Ctrl is pressed. `ServiceScreen`'s `useInput` is gated by `isActive: focused && !ptyHandle`.

---

## CI/CD Pipeline (`.github/workflows/`)

The pipeline is split into 3 workflows:

### `ci.yml` — runs on every push/PR to `main`
- **Job `quality`**: `bun run tsc` + `bun test` (with dependency cache)
- **Job `build-smoke`**: compiles a linux-x64 binary and verifies it starts
- Uses `concurrency` to cancel superseded runs

### `build.yml` — reusable build workflow
- Matrix: linux-x64, linux-arm64, darwin-arm64, windows-x64
- Caches `node_modules` per OS + `package.json` hash
- Smoke tests binary after compile (non-Windows)
- Artifact retention: 14 days

### `release.yml` — runs on tag push `v*.*.*`
- Calls `build.yml` via `workflow_call` (DRY — no build duplication)
- Verifies all 4 artifacts exist before creating release
- Auto-generates changelog from conventional commits (feat/fix/refactor/docs/test/chore)
- Attaches binaries + install scripts to GitHub Release

### Release commands

```bash
# Validate before tagging
bun run pretag        # runs tsc + test

# Automated patch release (tsc + test + bump + tag + push)
bun run release:patch

# Automated minor release
bun run release:minor
```

**Bun version is pinned to 1.2.0** in all workflows for reproducible builds.

---

## Next Milestones & Focus Area

- [x] Implement the Core Network Probe to scan active local TCP ports.
- [x] Build the Docker Unix Socket connection layer.
- [x] Render the initial `torlink`-styled minimalist Welcome Screen using box-drawing streams.
- [x] Implement secure credential vault (AES-256-GCM + scrypt).
- [x] Build connection managers for Redis, S3-compatible, PostgreSQL, MongoDB.
- [x] Build ConnectionsScreen and ServiceScreen UI.
- [x] Add MySQL connection manager.
- [x] Add SSH remote connection manager.
- [x] Add HTTP API connection manager (generic REST).
- [x] Implement vault password change flow in UI.
- [x] Add connection import/export (encrypted bundle).
- [x] Multi-platform CI builds (Linux x64/arm64, macOS arm64, Windows x64).
- [x] Self-updating via `qore update` CLI command.
- [x] Windows PowerShell install script (install.ps1).
- [x] Service log aggregation (`getLogs` in all managers: SSH/Redis/Postgres/MySQL/Mongo/HTTP).
- [x] SSH toolkit expansion: file ops, service control, Docker management, SFTP transfer, process/network utilities.
- [x] SSH management: ports, firewall (UFW), top, netstat, tail -f, edit via PTY.
- [x] SSH security-audit: 8-point checklist (SSH config, firewall, fail2ban, updates, ports, logins).
- [x] SSH snapshots & diff: save/compare server state.
- [x] SSH DevOps: deploy scripts, git-status, Docker Compose management.
- [x] UX: command history, Tab autocomplete, favorites, multi-connection tabs.
- [x] Database: export to CSV, EXPLAIN query plan, slow queries monitoring.
- [x] S3: upload, download, delete objects, pre-signed URLs (AWS SigV4).
- [x] quit/exit command from any screen (process.exit fallback for active SSH).
- [x] Multi-connection: all tabs rendered simultaneously, state preserved on switch.
- [x] Multi-connection: Ctrl+Tab / Ctrl+Arrows switching, `close` command to disconnect.
- [x] Multi-session: multiple sessions of same connection (unique sessionId per tab, `new` command).
- [x] CI/CD: 3-workflow pipeline (ci.yml, build.yml, release.yml) with cache, smoke tests, pinned bun.
- [x] CI/CD: automated release scripts (`release:patch`, `release:minor`).

### Next Features

- [ ] Service health checks and monitoring dashboard.
- [ ] Local emulated S3 and Pub/Sub providers.
- [ ] Multi-architecture CI matrix for ARM native builds.
- [ ] Expand test coverage (connection managers, SSH commands, UI components).
- [ ] Add linting (eslint/biome) to CI pipeline.
