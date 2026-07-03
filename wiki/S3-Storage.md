# S3 Storage

Qore provides S3-compatible object storage management with support for both local emulated storage and real AWS S3.

---

## Providers

Qore supports two S3 providers that can be switched from the Providers screen:

### Local Emulated S3

- **Storage**: `~/.qore/storage/` (filesystem)
- **Metadata**: `~/.qore/metadata.db` (SQLite via `bun:sqlite`)
- **Use case**: Development, testing, and offline work
- **No credentials required**

### AWS S3

- **Credentials**: `~/.aws/credentials` (standard AWS location)
- **Region**: From credentials file or connection configuration
- **Use case**: Production cloud storage
- **Requires AWS credentials**

## Commands

| Command | Description |
|---------|-------------|
| `ls <bucket>` | List objects in bucket |
| `mkbucket <name>` | Create a new bucket |
| `rmbucket <name>` | Delete a bucket |
| `upload <local> <bucket/key>` | Upload a local file to S3 |
| `download <bucket/key> <local>` | Download an S3 object to local file |
| `rm <bucket> <key>` | Delete an object from a bucket |
| `presign <bucket> <key>` | Generate a pre-signed URL (1 hour expiry) |
| `info` | Show S3 service information |
| `refresh` | Reload bucket and object list |
| `back` / `esc` | Return to connections screen |

## Pre-signed URLs

The `presign` command generates a time-limited URL that allows temporary access to a private object without requiring AWS credentials:

```
presign mybucket important-file.pdf
```

Returns a URL valid for 1 hour. The URL uses AWS Signature Version 4 (SigV4) for authentication.

## Connection Fields

| Field | Description |
|-------|-------------|
| Name | Friendly name for the connection |
| Endpoint | S3-compatible endpoint URL (for non-AWS providers) |
| Region | AWS region (e.g., us-east-1) |
| Access Key | AWS access key ID |
| Secret Key | AWS secret access key |
| Bucket | Default bucket name (optional) |

## S3-Compatible Providers

Qore works with any S3-compatible storage provider by specifying a custom endpoint:

| Provider | Endpoint Example |
|----------|-----------------|
| AWS S3 | (leave empty for default) |
| MinIO | `http://localhost:9000` |
| Backblaze B2 | `https://s3.us-west-000.backblazeb2.com` |
| Wasabi | `https://s3.wasabisys.com` |
| DigitalOcean Spaces | `https://nyc3.digitaloceanspaces.com` |
| Cloudflare R2 | `https://<account>.r2.cloudflarestorage.com` |

## Switching Providers

From the welcome screen, type `providers` to open the provider switcher. Select between:

- **Local**: Emulated S3 with SQLite metadata
- **AWS**: Real AWS S3 using credentials from `~/.aws/credentials`

---

Previous: [Database Tools](Database-Tools) -- Next: [HTTP API](HTTP-API)
