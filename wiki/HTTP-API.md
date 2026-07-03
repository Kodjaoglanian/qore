# HTTP API

Qore provides a generic HTTP API client for interacting with REST endpoints. It supports custom headers, multiple authentication methods, and JSON request bodies.

---

## Commands

| Command | Description |
|---------|-------------|
| `get <path>` | Send GET request |
| `post <path> <body>` | Send POST request with JSON body |
| `put <path> <body>` | Send PUT request with JSON body |
| `patch <path> <body>` | Send PATCH request with JSON body |
| `delete <path>` | Send DELETE request |
| `logs` | Probe /logs, /health, /status endpoints |
| `info` | Show HTTP API connection information |
| `refresh` | Reload connection data |
| `back` / `esc` | Return to connections screen |

## Request Format

The `path` parameter is appended to the base URL configured in the connection. For example, if the base URL is `https://api.example.com` and you type `get /users`, the request is sent to `https://api.example.com/users`.

The `body` parameter for POST, PUT, and PATCH requests should be a JSON string:

```
post /users {"name":"Alice","email":"alice@example.com"}
```

## Authentication

### None

No authentication headers are added.

### API Key

The API key is sent in the `Authorization` header:

```text
Authorization: Bearer <api-key>
```

### Basic Auth

Username and password are sent as a Basic authentication header:

```text
Authorization: Basic <base64(user:pass)>
```

## Custom Headers

Custom headers can be configured when adding the connection. They are sent with every request. Specify headers as a JSON object:

```json
{
  "X-Custom-Header": "value",
  "Accept": "application/json"
}
```

## Log Probing

The `logs` command probes common diagnostic endpoints:

| Endpoint | Purpose |
|----------|---------|
| `/logs` | Application logs |
| `/health` | Health check |
| `/status` | Service status |

Results are displayed in the service screen output area.

## Connection Fields

| Field | Description |
|-------|-------------|
| Name | Friendly name for the connection |
| Base URL | API base URL (e.g., `https://api.example.com`) |
| Headers | Custom headers as JSON object |
| Auth Type | `none`, `api-key`, or `basic` |
| API Key | API key value (if api-key auth) |
| Username | Basic auth username (if basic auth) |
| Password | Basic auth password (if basic auth) |

---

Previous: [S3 Storage](S3-Storage) -- Next: [MCP Server](MCP-Server)
