# Connections

The connections screen is the central hub for managing saved service connections. All credentials are stored in the encrypted vault and never written to disk in plaintext.

---

## Commands

| Command | Description |
|---------|-------------|
| `add` | Add a new connection (redis, postgres, mysql, mongo, s3, http, ssh) |
| `connect <n>` | Connect to saved connection number n |
| `test <n>` | Test connection number n without connecting |
| `rm <n>` | Remove connection number n |
| `changepw` | Change vault master password |
| `export` | Export all connections as an encrypted bundle (QOREX1 format) |
| `import` | Import connections from an encrypted bundle |
| `back` / `esc` | Return to welcome screen |

## Adding a Connection

Type `add` and press Enter. You will be prompted for:

1. **Connection type**: redis, postgres, mysql, mongo, s3, http, or ssh
2. **Name**: A friendly name for the connection (shown in the list)
3. **Host**: Server hostname or IP address
4. **Port**: TCP port number
5. **Credentials**: Type-specific (password, username, database name, API key, SSH key path, etc.)

The connection is immediately encrypted and stored in the vault.

## Connection Types

### Redis

| Field | Description |
|-------|-------------|
| Name | Friendly name |
| Host | Redis server hostname |
| Port | TCP port (default: 6379) |
| Password | Redis AUTH password (optional) |
| Database | Database number (default: 0) |

### PostgreSQL

| Field | Description |
|-------|-------------|
| Name | Friendly name |
| Host | PostgreSQL server hostname |
| Port | TCP port (default: 5432) |
| Username | Database user |
| Password | Database password |
| Database | Default database name |

### MySQL

| Field | Description |
|-------|-------------|
| Name | Friendly name |
| Host | MySQL server hostname |
| Port | TCP port (default: 3306) |
| Username | Database user |
| Password | Database password |
| Database | Default database name |

### MongoDB

| Field | Description |
|-------|-------------|
| Name | Friendly name |
| Host | MongoDB server hostname |
| Port | TCP port (default: 27017) |
| Username | Database user |
| Password | Database password |
| Database | Default database name |

### S3

| Field | Description |
|-------|-------------|
| Name | Friendly name |
| Endpoint | S3-compatible endpoint URL |
| Region | AWS region (e.g., us-east-1) |
| Access Key | AWS access key ID |
| Secret Key | AWS secret access key |
| Bucket | Default bucket name (optional) |

### HTTP API

| Field | Description |
|-------|-------------|
| Name | Friendly name |
| Base URL | API base URL (e.g., https://api.example.com) |
| Headers | Custom headers (JSON) |
| Auth Type | none, api-key, or basic |
| API Key | API key value (if api-key auth) |
| Username | Basic auth username (if basic auth) |
| Password | Basic auth password (if basic auth) |

### SSH

| Field | Description |
|-------|-------------|
| Name | Friendly name |
| Host | SSH server hostname |
| Port | TCP port (default: 22) |
| Username | SSH user |
| Password | SSH password (optional if using key) |
| Key Path | Path to private key file (optional) |
| Passphrase | Key passphrase (optional) |

## Testing Connections

Type `test <n>` to verify connectivity without opening a full session. This performs a quick handshake and reports success or failure with an error message.

## Export and Import

Connections can be exported as an encrypted bundle for backup or transfer between machines:

```
export
```

This creates a file in the QOREX1 format, encrypted with the current vault password. To import on another machine:

```
import
```

You will be prompted for the file path and the vault password used during export.

---

Previous: [Discovery Screen](Discovery-Screen) -- Next: [Vault and Security](Vault-and-Security)
