# Installation

Qore is distributed as a single precompiled binary. No runtime dependencies are required.

---

## One-Command Install (Linux / macOS)

```bash
curl -fsSL https://github.com/Kodjaoglanian/qore/releases/latest/download/install.sh | bash
```

This downloads the correct binary for your platform and installs it to `~/.local/bin/qore`.

## Windows (PowerShell)

```powershell
irm https://github.com/Kodjaoglanian/qore/releases/latest/download/install.ps1 | iex
```

Installs to `%LOCALAPPDATA%\Qore\qore.exe`.

## From Source

### Prerequisites

- [Bun](https://bun.sh) runtime (version 1.1 or newer)
- Git

### Steps

```bash
git clone https://github.com/Kodjaoglanian/qore.git
cd qore
bun install
bun run build
```

This produces a `qore` binary in the project root. Move it to any directory in your `PATH`:

```bash
sudo mv qore /usr/local/bin/qore
```

## Updating

To update an existing installation:

```bash
qore update
```

This downloads the latest release from GitHub and replaces the current binary in place.

## Verifying Installation

```bash
qore --version
```

## Docker Permissions

Docker container discovery requires access to `/var/run/docker.sock`. If containers do not appear in the discovery screen, add your user to the `docker` group:

```bash
sudo usermod -aG docker $USER
```

Log out and log back in for the change to take effect.

## Local Data Directories

Qore creates the following directory structure on first run:

```text
~/.qore/
  vault.enc           # Encrypted credential vault
  vault.meta.json     # Vault metadata
  qore.sock           # Unix socket for MCP vault bridge (when unlocked)
  storage/            # Local emulated S3 objects
  metadata.db         # SQLite metadata for local storage
  favorites.json      # Starred commands
  snapshots/          # SSH server state snapshots (JSON)
```

## Supported Platforms

| Platform | Architecture | Binary Name |
|----------|-------------|-------------|
| Linux | x64 | `qore-linux-x64` |
| Linux | arm64 | `qore-linux-arm64` |
| macOS | Apple Silicon | `qore-darwin-arm64` |
| Windows | x64 | `qore-windows-x64.exe` |

---

Previous: [Home](Home) -- Next: [Quick Start](Quick-Start)
