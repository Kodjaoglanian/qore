# Roadmap

This page tracks implemented features and planned work for Qore.

---

## Implemented

### Core

- Core network probe (TCP port scanner)
- Docker Unix socket integration (containers, images, stats, exec)
- Terminal-native welcome screen
- Secure credential vault (AES-256-GCM + scrypt)
- Connection managers for Redis, S3-compatible storage, PostgreSQL, MySQL, MongoDB, HTTP API, and SSH
- Connections and service screens
- Vault password change flow in the UI
- Encrypted connection import and export (QOREX1 bundle format)
- Multi-platform builds (Linux x64/arm64, macOS arm64, Windows x64)
- Self-updating via `qore update`

### Discovery

- Sidebar layout with 9 sections (overview, ports, containers, images, daemons, system, network, processes, services)
- Section filtering with `filter <text>`
- Auto-refresh (5 second interval)
- Container operations: start, stop, restart, remove, logs, inspect, stats, exec
- Batch container actions: batch-start, batch-stop, batch-restart
- Image management: list, remove, prune
- Process management: list by CPU, kill, kill-9
- Service control: svc-start, svc-stop, svc-restart, svc-logs
- System monitoring: CPU, memory, swap, load, disks, uptime
- Network inspection: interfaces, routes, firewall rules

### SSH

- SSH toolkit: file operations, service control, Docker management, SFTP transfer
- SSH management: ports, firewall, top, netstat, tail, edit, docker logs -f
- Security audit: 8-point checklist (SSH config, firewall, fail2ban, updates, ports, logins)
- Server snapshots and snapshot diff
- DevOps: deploy scripts, git-status, Docker Compose management
- Power management: reboot, shutdown (with confirmation)

### Database

- Service log aggregation (SSH, Redis, Postgres, MySQL, Mongo, HTTP)
- Database export to CSV
- EXPLAIN query plan analysis
- Slow query monitoring (pg_stat_statements, mysql.slow_log, MongoDB profiler)
- Table size analysis, index listing, view listing, function listing
- Active connection and running query monitoring

### S3

- S3 operations: upload, download, delete objects, pre-signed URLs (AWS SigV4)
- Local emulated S3 (SQLite + filesystem)
- AWS S3 provider
- S3-compatible endpoints (MinIO, Backblaze B2, Wasabi, DigitalOcean Spaces, Cloudflare R2)

### UX

- Command history (Up/Down with text)
- Tab autocomplete
- Favorites (star/unstar/favorites)
- Multi-connection tabs (Ctrl+Tab / Ctrl+Arrows, all tabs mounted, state preserved)
- Multi-session (multiple sessions of same connection, `new` command)
- quit/exit from any screen

### MCP Server

- 35 tools: SSH (6), Docker (11), database (5), system (7), discovery (7), HTTP (4)
- 5 resources: connections, probe snapshot, containers, images, system info
- 4 prompts: diagnose_infra, security_audit, container_health, db_health_check
- JSON-RPC 2.0 over stdio (protocol version 2025-03-26)
- Vault bridge: Unix socket with 0600 permissions, credential isolation
- CLI help: `qore mcp --help`
- Configuration examples for Claude Desktop, Cursor, Windsurf
- Documentation: docs/mcp.md, config helpers

### CI/CD

- 3-workflow pipeline (ci, build, release)
- Dependency caching
- Smoke tests per platform
- Pinned Bun 1.2.0
- Automated GitHub Release creation with changelog
- Install scripts (install.sh, install.ps1)

### Documentation

- Professional README with logo
- Wiki with 20 pages covering all features
- docs/mcp.md with full tool reference
- CONTRIBUTING.md with UI guidelines and PR checklist

---

## Planned

### Features

- Service health checks and monitoring dashboard
- Local emulated S3 and Pub/Sub providers (full implementation)
- WebSocket transport for MCP server
- MCP sampling support for AI-driven remediation
- Multi-architecture CI matrix for ARM native builds (beyond linux-arm64)
- Linting (eslint/biome) in CI pipeline

### Testing

- Expanded test coverage: connection managers (Redis, Postgres, MySQL, Mongo, SSH, HTTP)
- UI component tests
- MCP server integration tests
- Probe module tests (network, docker, daemon, system, processes, services)

### Infrastructure

- Named AWS profiles for S3 provider
- Custom Docker socket path configuration
- SSH agent forwarding support
- Connection groups and tagging
- Bulk connection import from CSV

---

Previous: [Contributing](Contributing) -- [Home](Home)
