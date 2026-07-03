# Building and Releases

Qore compiles into a single binary using Bun's `--compile` flag. The CI/CD pipeline handles multi-platform builds and automated releases.

---

## Building Locally

```bash
bun run build
```

This runs the prebuild script (patches any source files) and then compiles:

```bash
bun build src/index.tsx --compile --outfile qore
```

The resulting `qore` binary is self-contained with no runtime dependencies. Move it to any directory in `PATH`:

```bash
sudo mv qore /usr/local/bin/qore
```

## CI/CD Pipeline

The project uses 3 GitHub Actions workflows:

### CI (`ci.yml`)

Runs on every push and pull request to `main`.

1. Install Bun 1.2.0
2. `bun install`
3. `bun run tsc` (type checking)
4. `bun test`
5. Build smoke test (compile and verify binary exists)

### Build (`build.yml`)

Reusable workflow called by the release pipeline. Compiles binaries for 4 platforms:

| Platform | Target | Binary Name |
|----------|--------|-------------|
| Linux x64 | `bun-linux-x64` | `qore-linux-x64` |
| Linux arm64 | `bun-linux-arm64` | `qore-linux-arm64` |
| macOS arm64 | `bun-darwin-arm64` | `qore-darwin-arm64` |
| Windows x64 | `bun-windows-x64` | `qore-windows-x64.exe` |

Each platform build:

1. Installs Bun 1.2.0
2. Restores dependency cache
3. Runs `bun install`
4. Runs `bun run build`
5. Renames binary to platform-specific name
6. Runs smoke test (verify binary executes)
7. Uploads artifact

### Release (`release.yml`)

Triggered by tag push matching `v*.*.*`.

1. Calls the build workflow for all 4 platforms
2. Downloads all artifacts
3. Verifies each binary exists and is executable
4. Creates install scripts (`install.sh`, `install.ps1`)
5. Generates changelog from conventional commits
6. Creates GitHub Release with all artifacts attached

## Releasing

### Patch Release

```bash
bun run release:patch
```

This script:

1. Runs `bun run tsc` (type checking)
2. Runs `bun test`
3. Bumps the patch version in `package.json` (e.g., 0.7.7 -> 0.7.8)
4. Commits the version bump
5. Creates a git tag (`v0.7.8`)
6. Pushes to `main` with tags

The CI pipeline then builds all platforms and creates the GitHub Release automatically.

### Minor Release

```bash
bun run release:minor
```

Same process but bumps the minor version (e.g., 0.7.7 -> 0.8.0).

### Manual Release

Do not create releases manually with `gh release create`. The CI pipeline handles:

- Building all platform binaries
- Generating changelog from commit messages
- Creating install scripts
- Attaching artifacts to the release

## Bun Version

Bun is pinned to `1.2.0` in all CI workflows for reproducible builds. The `bunfig.toml` file may contain additional configuration.

## Install Scripts

The release pipeline generates two install scripts:

### `install.sh` (Linux / macOS)

- Detects platform and architecture
- Downloads the correct binary from GitHub releases
- Installs to `~/.local/bin/qore`
- Makes the binary executable

### `install.ps1` (Windows)

- Downloads the Windows binary
- Installs to `%LOCALAPPDATA%\Qore\qore.exe`
- Adds to user PATH

---

Previous: [Testing](Testing) -- Next: [Contributing](Contributing)
