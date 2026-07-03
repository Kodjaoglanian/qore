# Testing

Qore uses `bun:test` for its test suite. Tests cover the core cryptography, vault lifecycle, and theme definitions.

---

## Running Tests

```bash
bun test
```

## Test File

All tests are in `tests/core.test.ts`.

## Current Test Coverage

### Theme Tests

- Verify all color keys exist in the color palette
- Verify color values are valid hex strings

### Cryptography Tests

| Test | Description |
|------|-------------|
| scrypt determinism | Same password + salt produces the same key |
| AES-256-GCM round-trip | Encrypt then decrypt returns original plaintext |
| Wrong key decryption | Decryption with wrong key fails gracefully |

### Vault Tests

| Test | Description |
|------|-------------|
| Vault initialization | New vault creates with empty connection list |
| Vault unlock | Correct password decrypts and loads connections |
| Wrong password | Incorrect password returns error without crashing |
| Add and retrieve | Connections can be added and retrieved after unlock |

## Writing Tests

Tests use the `bun:test` API:

```typescript
import { test, expect } from "bun:test";
import { encrypt, decrypt, deriveKey } from "../src/core/vault/crypto.js";

test("AES-256-GCM round-trip", () => {
  const key = deriveKey("test-password", "test-salt");
  const plaintext = "sensitive data";
  const encrypted = encrypt(plaintext, key);
  const decrypted = decrypt(encrypted, key);
  expect(decrypted).toBe(plaintext);
});
```

### Guidelines

- Add tests for new cryptographic, vault, or connection logic.
- Keep existing tests passing. Do not remove or weaken tests without explicit direction.
- Test files live in `tests/` and use `bun:test`.
- Run the full suite before submitting a pull request: `bun test`.

## CI Integration

Tests run automatically in the CI pipeline on every push and pull request to `main`. The CI workflow:

1. Installs Bun 1.2.0
2. Runs `bun install`
3. Runs `bun run tsc` (type checking)
4. Runs `bun test`
5. Runs a build smoke test

All steps must pass for the pipeline to succeed.

---

Previous: [Development](Development) -- Next: [Building and Releases](Building-and-Releases)
