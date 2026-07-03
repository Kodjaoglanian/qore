# Configuration

Qore requires minimal configuration. Most settings are automatic, with a few optional environment variables and credential files for advanced use cases.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HOME` | Used to locate `~/.qore` and `~/.aws/credentials` | System home directory |
| `QORE_SOCKET_PATH` | Override the MCP vault socket path | `~/.qore/qore.sock` |
| `QORE_LOG_LEVEL` | MCP server log level: `debug`, `info`, `warn`, `error` | `info` |

## AWS Credentials

For cloud S3 mode, place credentials in the standard AWS location:

```text
~/.aws/credentials
```

Example:

```ini
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
region = us-east-1
```

Use the `[default]` profile unless the provider is extended to support named profiles.

## Local Storage

Qore provides a local emulated S3 provider using SQLite for metadata and the filesystem for object storage:

- **Objects**: `~/.qore/storage/`
- **Metadata**: `~/.qore/metadata.db` (SQLite via `bun:sqlite`)

Switch between local and AWS S3 providers from the Providers screen (type `providers` from the welcome screen).

## Vault Configuration

The vault is configured interactively on first run. No configuration file is needed.

- **Encryption**: AES-256-GCM authenticated encryption
- **Key derivation**: scrypt (N=16384, r=8, p=1, dkLen=32)
- **Vault file**: `~/.qore/vault.enc`
- **Metadata file**: `~/.qore/vault.meta.json`

### Changing the Master Password

From the connections screen:

```
changepw
```

You will be prompted for the current password and the new password.

### Exporting and Importing Connections

Connections can be exported as an encrypted bundle (QOREX1 format) for backup or transfer:

| Command | Description |
|---------|-------------|
| `export` | Export all connections as an encrypted bundle |
| `import` | Import connections from an encrypted bundle |

The export file is encrypted with the current vault password. The same password is required to import.

## MCP Server Configuration

See [MCP Server](MCP-Server) for AI client configuration examples (Claude Desktop, Cursor, Windsurf).

## Docker Socket

Docker integration uses the default Unix socket at `/var/run/docker.sock`. If Docker is configured to use a different socket, set the `DOCKER_HOST` environment variable:

```bash
export DOCKER_HOST=unix:///custom/path/docker.sock
```

---

Previous: [Quick Start](Quick-Start) -- Next: [Usage Guide](Usage-Guide)
