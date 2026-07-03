# Development

Setting up the Qore development environment.

---

## Prerequisites

- [Bun](https://bun.sh) runtime (version 1.1 or newer)
- Git
- A terminal with TrueColor support (recommended)

## Setup

```bash
git clone https://github.com/Kodjaoglanian/qore.git
cd qore
bun install
```

## Running in Development Mode

```bash
bun run dev
```

This runs the TUI directly with Bun's runtime (no compilation step). Changes to source files are reflected on the next launch.

## Type Checking

```bash
bun run tsc
```

Runs the TypeScript compiler in check mode (`--noEmit`). All code must pass type checking before committing.

## Project Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `bun run src/index.tsx` | Run TUI in development mode |
| `start` | `bun run src/index.tsx` | Run TUI (alias for dev) |
| `build` | `bash scripts/prebuild.sh && bun build src/index.tsx --compile --outfile qore` | Prebuild patches and compile to single binary |
| `tsc` | `tsc --noEmit` | TypeScript type checking |
| `test` | `bun test` | Run the test suite |
| `pretag` | `bun run tsc && bun test` | Validate before tagging |
| `release:patch` | (see below) | Validate, bump patch, tag, push |
| `release:minor` | (see below) | Validate, bump minor, tag, push |

## Code Standards

- **TypeScript strict**: Avoid `any` and implicit `unknown` conversions.
- **Bun-native APIs**: Prefer `bun:sqlite`, `Bun.serve`, `Bun.write` over Node.js alternatives.
- **Protocol-level**: Connect to services through native protocols, not CLI wrappers.
- **Minimal dependencies**: Each new dependency must be justified in the PR description.
- **Asynchronous**: Never block the main event loop. All I/O must be async.
- **No emojis in UI**: Use text indicators like `[ok]`, `[!]`, `[active]`, `[locked]`.

## UI Development

### Terminal Size

Always use the `useTerminalSize` hook. Calculate available height dynamically:

```typescript
const { width: termWidth, height: termHeight } = useTerminalSize();
const availH = termHeight - HEADER - FOOTER;
```

### ServiceScreen Height

Use `effectiveHeight` (not raw `termHeight`) to account for the command bar and shortcut bar.

### Multi-Connection

All connection tabs must remain mounted. Never unmount inactive tabs. State is preserved when switching.

### Session Keys

Use `sessionId` (not `conn.id`) as the React key. Multiple sessions of the same connection are allowed.

### Sidebar Layout

The discovery screen sidebar is 22 columns wide. All content must be truncated to fit:

```tsx
<Box width={22} overflow="hidden">
  <Text wrap="truncate">{line}</Text>
</Box>
```

### Color Palette

Use colors from `theme.ts`. Do not hardcode hex values in components.

## Commit Conventions

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

See [Contributing](Contributing) for the full contribution guide.

---

Previous: [Architecture](Architecture) -- Next: [Testing](Testing)
