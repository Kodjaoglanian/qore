# Vault and Security

Qore uses industry-standard cryptography to protect connection credentials at rest. The vault is the core security component that isolates secrets from both the filesystem and AI models.

---

## Encryption

### Algorithm Stack

| Layer | Algorithm | Parameters |
|-------|-----------|------------|
| Key derivation | scrypt | N=16384, r=8, p=1, dkLen=32 |
| Symmetric encryption | AES-256-GCM | 96-bit IV, 128-bit auth tag |
| Salt | Random bytes | 32 bytes per vault |

### How It Works

1. On vault creation, a 32-byte random salt is generated.
2. The master password is processed through scrypt with the salt to derive a 256-bit encryption key.
3. All connection credentials are serialized to JSON and encrypted with AES-256-GCM using the derived key.
4. The ciphertext, IV, auth tag, and salt are written to `~/.qore/vault.enc`.
5. The encryption key exists only in memory while the vault is unlocked. It is never written to disk.

### Security Properties

- **Confidentiality**: AES-256-GCM ensures ciphertext cannot be read without the key.
- **Integrity**: The GCM auth tag detects any tampering with the vault file.
- **Key stretching**: scrypt makes brute-force attacks computationally expensive.
- **No key persistence**: The derived key exists only in process memory.

## Vault Lifecycle

### Creation

1. User types `vault` on the welcome screen.
2. User is prompted to enter and confirm a master password.
3. The vault file is created with an empty connection list.
4. The vault is unlocked and ready for adding connections.

### Unlock

1. User types `vault` on the welcome screen.
2. User is prompted for the master password.
3. The password is processed through scrypt with the stored salt.
4. The derived key is used to decrypt and verify the vault.
5. If successful, connections are loaded into memory and the socket bridge starts.

### Lock

The vault is locked when:

- The user types `vault lock` (if implemented)
- The TUI exits normally
- The process receives SIGTERM or SIGINT

On lock, the encryption key is cleared from memory and the Unix socket file is removed.

### Password Change

From the connections screen, type `changepw`:

1. User enters the current password (verified against the vault).
2. User enters and confirms the new password.
3. A new salt is generated.
4. The vault is re-encrypted with the new key.
5. The old vault file is replaced.

## Socket Bridge

The socket bridge is the security boundary between the TUI (which holds credentials) and the MCP server (which serves AI models).

### Architecture

```text
+--------------+     Unix Socket     +--------------+
|  qore TUI    | <-----------------> |  qore mcp    |
|  (vault)     |  ~/.qore/qore.sock  |  (subprocess)|
+--------------+                     +--------------+
```

### Security Measures

- **Socket permissions**: The Unix socket is created with `chmod 0600`. Only the same user can connect.
- **No credential passthrough**: The MCP server requests connection configs by name. The bridge returns the full config (including credentials) to the MCP server process, but the MCP server never returns credentials to the AI model.
- **Socket cleanup**: The socket file is removed on vault lock, TUI exit, and process signals.
- **Local only**: The socket uses a filesystem path, not a network port. It is not accessible remotely.

## QOREX1 Bundle Format

The export/import feature uses the QOREX1 encrypted bundle format:

```text
QOREX1
<base64-encoded salt>
<base64-encoded IV>
<base64-encoded ciphertext+authtag>
```

The bundle is encrypted with the same AES-256-GCM + scrypt stack as the vault. The vault password at export time is required for import.

## Best Practices

- Use a strong master password (16+ characters, mixed case, numbers, symbols).
- Do not store the master password in any file or environment variable.
- Export encrypted bundles regularly as backups.
- Do not share the master password with the MCP server configuration.
- Ensure `~/.qore/` directory permissions are set to `0700`.

---

Previous: [Connections](Connections) -- Next: [SSH Toolkit](SSH-Toolkit)
