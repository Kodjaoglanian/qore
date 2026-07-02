# Contributing to Qore

Thank you for your interest in contributing to Qore. This document outlines the workflow, conventions, and expectations for submitting changes.

---

## Development Workflow

1. **Fork the repository** and create a feature branch from `main`.
2. **Install dependencies** with `bun install`.
3. **Make focused changes** that address a single concern per pull request.
4. **Run the type checker** before committing: `bun run tsc`.
5. **Run the test suite** before committing: `bun test`.
6. **Write clear commit messages** following the conventional commits style described below.
7. **Open a pull request** with a concise description and a summary of changes.

CI will automatically run `tsc` + tests + a build smoke test on every PR. Ensure your changes pass locally before pushing.

---

## Commit Message Conventions

Use the following format for commit messages:

```text
<type>(<scope>): <short description>

<body with additional context, if needed>
```

Allowed types:

- `feat`: New feature or capability
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting changes that do not affect logic
- `refactor`: Code restructuring without behavior changes
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, tooling changes

Examples:

```text
feat(connections): add MySQL connection manager
fix(vault): handle empty password confirmation gracefully
docs(readme): update installation instructions for Bun 1.2
```

---

## Code Standards

- **Bun-native**: Prefer built-in Bun APIs (`bun:sqlite`, `Bun.serve`, `Bun.write`) over heavier Node.js alternatives when possible.
- **TypeScript strict**: The project uses strict type checking. Avoid `any` and implicit `unknown` conversions.
- **No emojis in UI strings**: The TUI is text-only. Use text-based indicators such as `[ok]`, `[!]`, `[active]`, `[inactive]`, and `[locked]`/`[unlocked]`.
- **Protocol-level integrations**: Connect to services through their native protocols rather than wrapping CLI commands.
- **Minimal dependencies**: Keep the dependency tree small. Each new dependency must be justified in the pull request description.
- **Thread safety**: Avoid blocking the main event loop. Background operations must be asynchronous and safe to run alongside the TUI render loop.

---

## Testing

- Add tests for new cryptographic, vault, or connection logic.
- Run the full suite before submitting a pull request: `bun test`.
- Keep existing tests passing. Do not remove or weaken tests without explicit direction.
- Test files live in `tests/` and use `bun:test`.

---

## CI/CD Pipeline

The project uses 3 GitHub Actions workflows (see `.github/workflows/`):

- **`ci.yml`**: Runs on every push/PR to `main`. Executes `tsc`, `bun test`, and a build smoke test.
- **`build.yml`**: Reusable build workflow. Compiles binaries for 4 platforms (linux-x64, linux-arm64, darwin-arm64, windows-x64) with dependency caching and smoke tests.
- **`release.yml`**: Runs on tag push `v*.*.*`. Calls `build.yml`, verifies all artifacts, generates a changelog from conventional commits, and creates a GitHub Release.

Bun version is pinned to `1.2.0` in all workflows for reproducible builds.

### Releasing a new version

```bash
# Validate before tagging
bun run pretag

# Patch release (0.5.9 -> 0.5.10)
bun run release:patch

# Minor release (0.5.9 -> 0.6.0)
bun run release:minor
```

These scripts run `tsc` + tests, bump `package.json` version, commit, tag, and push. The CI pipeline then builds all platforms and creates the GitHub Release automatically.

**Do not create releases manually with `gh release create`** — the CI pipeline handles release creation, changelog generation, and artifact attachment.

---

## Pull Request Checklist

Before requesting a review, verify that:

- [ ] The code compiles with `bun run tsc`.
- [ ] All tests pass with `bun test`.
- [ ] Commit messages follow the conventional commits format.
- [ ] No new emoji characters were added to UI text.
- [ ] Documentation is updated if the change affects user-facing behavior.
- [ ] The change is focused on a single concern.
- [ ] If modifying `ServiceScreen` layout, use `effectiveHeight` (not raw `termHeight`).
- [ ] If modifying multi-connection behavior, all tabs must remain mounted (never unmount inactive tabs).
- [ ] If modifying session handling, use `sessionId` (not `conn.id`) as React key — multiple sessions of the same connection are allowed.

---

## Questions and Support

Open a discussion on GitHub for questions about architecture, feature proposals, or design decisions. For bug reports, use the issue tracker and include reproduction steps and environment details.
