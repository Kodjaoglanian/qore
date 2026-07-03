# MCP Resources and Prompts

The MCP server exposes 5 resources and 4 prompt templates that provide infrastructure context and guided analysis to AI models.

---

## Resources

Resources are read-only data sources that the AI model can query using the `resources/read` method with a URI.

| URI | Description |
|-----|-------------|
| `qore://connections` | All saved connections (metadata only: name, type, host, port) |
| `qore://probe/latest` | Latest infrastructure probe snapshot (ports, containers, daemons, system) |
| `qore://docker/containers` | Current Docker container list with state and status |
| `qore://docker/images` | Current Docker image list with tags and sizes |
| `qore://system/info` | Current system information (hostname, OS, CPU, memory, disks) |

### Example: Read a Resource

```json
{
  "method": "resources/read",
  "params": {
    "uri": "qore://docker/containers"
  }
}
```

### Resource: qore://connections

Returns a JSON array of saved connections with metadata only (no credentials):

```json
[
  {
    "name": "my-postgres",
    "type": "postgres",
    "host": "localhost",
    "port": 5432
  },
  {
    "name": "pc-casa",
    "type": "ssh",
    "host": "192.168.1.100",
    "port": 22
  }
]
```

### Resource: qore://probe/latest

Returns the most recent discovery probe result including:

- Open ports with process info
- Docker containers and images
- Daemons (pm2, systemd)
- System information (CPU, memory, disks, uptime)
- Network interfaces, routes, firewall rules
- Top processes by CPU
- systemd services

### Resource: qore://docker/containers

Returns the current Docker container list:

```json
[
  {
    "id": "abc123",
    "name": "my-app",
    "image": "node:20",
    "state": "running",
    "status": "Up 2 hours"
  }
]
```

### Resource: qore://docker/images

Returns the current Docker image list:

```json
[
  {
    "id": "sha256:abc123",
    "tags": ["node:20", "node:latest"],
    "size": 350356480
  }
]
```

### Resource: qore://system/info

Returns current system information:

```json
{
  "hostname": "workstation",
  "os": "Ubuntu 22.04.3 LTS",
  "kernel": "5.15.0-91-generic",
  "cpuCores": 8,
  "cpuModel": "Intel Core i7-12700K",
  "memoryTotal": 33579036672,
  "memoryUsed": 12058624000,
  "uptime": "3 days, 4:23:17",
  "loadAvg": [0.52, 0.48, 0.45],
  "disks": [
    { "filesystem": "/dev/nvme0n1p2", "mount": "/", "size": "500G", "usePercent": "45%" }
  ]
}
```

---

## Prompts

Prompts are templates that guide the AI model through common infrastructure analysis tasks. They are retrieved using the `prompts/get` method.

| Prompt | Parameters | Description |
|--------|-----------|-------------|
| `diagnose_infra` | none | Analyze infrastructure state and identify potential issues |
| `security_audit` | none | Perform a security audit of open ports, services, and firewall rules |
| `container_health` | none | Check Docker container health and resource utilization |
| `db_health_check` | `connection` | Check database health including connections, slow queries, and table sizes |

### Example: Get a Prompt

```json
{
  "method": "prompts/get",
  "params": {
    "name": "db_health_check",
    "arguments": {
      "connection": "my-postgres"
    }
  }
}
```

### Prompt: diagnose_infra

Analyzes the current infrastructure state by:

1. Reading the latest probe snapshot
2. Checking Docker container states
3. Identifying stopped containers that should be running
4. Checking system resource utilization (CPU, memory, disk)
5. Identifying high CPU processes
6. Checking for exposed ports

Returns a structured analysis with identified issues and recommended actions.

### Prompt: security_audit

Performs a security assessment by:

1. Listing all open ports and associated processes
2. Checking firewall rules
3. Identifying services running as root
4. Checking for common security misconfigurations
5. Listing systemd services with active state

Returns a security report with severity ratings.

### Prompt: container_health

Checks Docker container health by:

1. Listing all containers and their states
2. Getting resource statistics for running containers
3. Checking container logs for errors
4. Identifying containers with high resource usage
5. Checking for stopped containers

Returns a health report per container.

### Prompt: db_health_check

Checks database health by:

1. Listing active connections
2. Checking for long-running queries
3. Analyzing slow query logs
4. Checking table sizes
5. Identifying missing indexes (PostgreSQL only)

Returns a database health report with recommendations.

---

Previous: [MCP Tools](MCP-Tools) -- Next: [Architecture](Architecture)
