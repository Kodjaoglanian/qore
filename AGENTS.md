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
- `types.ts`: `ConnectionConfig` interface — generic, supports redis, postgres, mysql, mongo, s3, http.

### 2c. Connection Managers (`src/core/connections/`)

Protocol-level integrations with real services. No mocks, no vendor lock-in.

- `manager.ts`: Common interfaces (`ConnectionManager`, `DatabaseManager`, `StorageManager`) + factory.
- `redis.ts`: RESP protocol via `Bun.connect` — PING, INFO, KEYS, GET/SET, DEL, FLUSHDB. Works with Redis, Valkey, DragonflyDB, KeyDB.
- `s3.ts`: S3 REST API with AWS Signature V4 signing via `fetch`. Works with MinIO, RustFS, SeaweedFS, Cloudflare R2, AWS S3.
- `postgres.ts`: PostgreSQL wire protocol via `pg` driver. Works with PostgreSQL, CockroachDB, YugabyteDB.
- `mongo.ts`: MongoDB wire protocol via `mongodb` driver. Works with MongoDB, FerretDB.

### 3. TUI & Render Pipeline (`src/ui/`)

- The UI must match the `torlink` visual identity: clean box-drawing characters (`┌ ┐ └ ┘ ─ │`), minimalist text-based tabs, and no bloated layouts.
- Colors are strictly defined: Dark Backgrounds, Electric Purple highlights (`#A370F7`) for active focus/borders, and Muted Blue-Grays (`#5C5B66`) for background context/shortcuts.
- **Screens**: Welcome -> Discover (Docker/ports/daemons) -> Vault (unlock/create) -> Connections (list/add/test) -> Service (type-specific management: Redis/S3/Postgres/Mongo).
- **Input Model**: InputBar is always focused. Commands are typed + Enter. Only arrow keys/tab/escape are handled by `useInput` for navigation. No single-key shortcuts that conflict with typing.

---

## Guidelines for AI Agents (Rules of Engagement)

When modifying this repository, you MUST follow these constraints:

1. **Bun-Native Only**: Utilize Bun's optimized built-in modules wherever possible. Prefer `Bun.write()`, `Bun.serve()`, and the built-in `bun:sqlite` over heavy external npm alternatives.
2. **Preserve TrueColor Capabilities**: Do not fall back to standard 8-color ANSI layout schemes. Ensure the UI components support full 24-bit TrueColor palettes to maintain the aesthetic fidelity of the design.
3. **Strict Thread Safety**: The emulated messaging queues (Pub/Sub) and proxy routers run concurrently with the main TUI render loop. Ensure all local memory structures are thread-safe and don't block the main event loop.
4. **No Code Disruption**: When implementing automated features like the AI Log Doctor, safely wrap execution sandboxes or API integrations so they never crash the core orchestrator runtime if an external service becomes unavailable.

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
