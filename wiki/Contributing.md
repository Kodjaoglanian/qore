# Contributing

Thank you for your interest in contributing to Qore. This document outlines the workflow, conventions, and expectations for submitting changes.

---

## Development Workflow

1. **Fork the repository** and create a feature branch from `main`.
2. **Install dependencies** with `bun install`.
3. **Make focused changes** that address a single concern per pull request.
4. **Run the type checker**: `bun run tsc`.
5. **Run the test suite**: `bun test`.
6. **Write clear commit messages** following the conventional commits format.
7. **Open a pull request** with a concise description and summary of changes.

CI will automatically run `tsc`, tests, and a build smoke test on every PR.

## Commit Message Conventions

```text
<type>(<scope>): <short description>

<body with additional context, if needed>
```

| Type | Description |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Formatting changes |
| `refactor` | Code restructuring |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `chore` | Build, dependencies, tooling |

### Examples

```text
feat(connections): add MySQL connection manager
fix(vault): handle empty password confirmation gracefully
docs(readme): update installation instructions for Bun 1.2
```

## Code Standards

- **Bun-native**: Prefer built-in Bun APIs over heavier Node.js alternatives.
- **TypeScript strict**: Avoid `any` and implicit `unknown` conversions.
- **Protocol-level**: Connect to services through native wire protocols.
- **Minimal dependencies**: Each new dependency must be justified in the PR description.
- **Asynchronous**: Never block the main event loop.
- **Error handling**: All async operations must handle errors gracefully.

## UI Guidelines

- **No emojis in UI strings**: Use text indicators like `[ok]`, `[!]`, `[active]`, `[locked]`.
- **Terminal size**: Always use the `useTerminalSize` hook. Calculate height dynamically.
- **ServiceScreen**: Use `effectiveHeight` (not raw `termHeight`).
- **Multi-connection**: All tabs must remain mounted. Never unmount inactive tabs.
- **Session keys**: Use `sessionId` (not `conn.id`) as the React key.
- **Sidebar**: Discovery screen sidebar is 22 columns. Truncate all content with `wrap="truncate"`.
- **Colors**: Use colors from `theme.ts`. Do not hardcode hex values.

## Testing

- Add tests for new cryptographic, vault, or connection logic.
- Run `bun test` before submitting a pull request.
- Keep existing tests passing. Do not remove or weaken tests.
- Test files live in `tests/` and use `bun:test`.

## CI/CD Pipeline

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `ci.yml` | Push/PR to `main` | `tsc` + tests + build smoke test |
| `build.yml` | Reusable | 4-platform binary compilation |
| `release.yml` | Tag `v*.*.*` | Build, verify, changelog, GitHub Release |

Bun version is pinned to `1.2.0` for reproducible builds.

## Releasing

```bash
bun run release:patch    # 0.7.7 -> 0.7.8
bun run release:minor    # 0.7.7 -> 0.8.0
```

Do not create releases manually with `gh release create`.

## Pull Request Checklist

- [ ] Code compiles with `bun run tsc`
- [ ] All tests pass with `bun test`
- [ ] Commit messages follow conventional commits format
- [ ] No emoji characters added to UI text
- [ ] Documentation updated if user-facing behavior changed
- [ ] Change is focused on a single concern
- [ ] If modifying `ServiceScreen`, `effectiveHeight` is used
- [ ] If modifying multi-connection, all tabs remain mounted
- [ ] If modifying sessions, `sessionId` is used as React key
- [ ] If modifying discovery sidebar, content truncated to 22 columns
- [ ] If adding MCP tools, `docs/mcp.md` is updated

## Questions and Support

Open a discussion on GitHub for questions about architecture, feature proposals, or design decisions. For bug reports, use the issue tracker and include reproduction steps and environment details.

---

Previous: [Building and Releases](Building-and-Releases) -- Next: [Roadmap](Roadmap)
