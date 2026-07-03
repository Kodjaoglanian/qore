# SSH Toolkit

The SSH service screen provides a comprehensive set of commands for remote server management. All commands execute over an SSH connection using the ssh2 library with interactive PTY support.

---

## Common Commands

| Command | Description |
|---------|-------------|
| `info` | Show SSH connection information |
| `exec <command>` | Execute a shell command (interactive PTY) |
| `refresh` | Reconnect and reload data |
| `new` | Open a duplicate SSH session |
| `back` / `esc` | Return to connections screen |

## System Information

| Command | Description |
|---------|-------------|
| `sysinfo` | Show system information (uname, hostname, uptime, disk, memory) |
| `disk` | Show disk usage (`df -h`) |
| `mem` | Show memory usage (`free -h`) |
| `procs` | List running processes (`ps aux`) |
| `top` | Show top processes by CPU usage |
| `net` | Show listening ports (`ss -tlnp`) |
| `ports` | Show listening ports with process info (top 50) |
| `netstat` | Show active network connections |
| `users` | Show currently logged-in users |
| `env` | List environment variables |
| `cron` | List crontab entries |

## File Operations

| Command | Description |
|---------|-------------|
| `ls [path]` | List directory contents (`ls -la`) |
| `cat <file>` | View file contents (first 500 lines) |
| `find <pattern> [path]` | Search for files by name |
| `du [path]` | Disk usage by subdirectory (sorted) |
| `tail <file> [-f]` | Tail a file (optionally follow in real-time) |
| `edit <file>` | Open a file in nano/vim via PTY |

## File Transfer (SFTP)

| Command | Description |
|---------|-------------|
| `upload <local> <remote>` | Upload a file via SFTP |
| `download <remote> <local>` | Download a file via SFTP |

## Service Management

| Command | Description |
|---------|-------------|
| `services` | List running systemd services |
| `svc <action> <name>` | Start/stop/restart/status/enable/disable a service |
| `logs [service]` | View system logs (journalctl or syslog) |
| `logs docker <container>` | View Docker container logs |

## Docker Management (Remote)

| Command | Description |
|---------|-------------|
| `docker ps` | List all Docker containers |
| `docker images` | List Docker images |
| `docker stats` | Show Docker container resource stats |
| `docker logs [-f] <ctr>` | View or follow container logs |
| `docker <start\|stop\|restart\|rm> <ctr>` | Manage a Docker container |

## Network and Firewall

| Command | Description |
|---------|-------------|
| `firewall [status\|allow\|deny\|enable\|disable]` | UFW firewall management |
| `ping <host>` | Ping a host (4 packets) |

## Process Management

| Command | Description |
|---------|-------------|
| `kill <pid> [signal]` | Send a signal to a process |

## Package Management

| Command | Description |
|---------|-------------|
| `pkgs [search]` | List or search installed packages (dpkg/rpm/pacman) |

## Security

| Command | Description |
|---------|-------------|
| `security-audit` | Run 8-point security checklist |

### Security Audit Checklist

The `security-audit` command checks:

1. SSH configuration (root login, password auth, port)
2. Firewall status (UFW active/inactive)
3. fail2ban status
4. Pending system updates
5. Open ports and exposed services
6. Recent login attempts
7. User accounts with sudo access
8. SSH key permissions

## Snapshots and Diff

| Command | Description |
|---------|-------------|
| `snapshot` | Save server state to local JSON file |
| `diff <snap1> <snap2>` | Compare two snapshot files line-by-line |

### Snapshot Contents

A snapshot captures:

- Disk usage
- Memory usage
- Running processes
- systemd services
- Open ports
- System uptime
- Kernel version

Snapshots are saved to `~/.qore/snapshots/` as JSON files.

## DevOps

| Command | Description |
|---------|-------------|
| `deploy <script>` | Run a deploy script via PTY with real-time output |
| `git-status` | Find git repos on server and show status and recent commits |
| `compose <up\|down\|ps\|logs\|restart\|pull> [service]` | Manage Docker Compose |

## Power Management

| Command | Description |
|---------|-------------|
| `reboot yes` | Reboot the remote machine (requires explicit confirmation) |
| `shutdown yes` | Shut down the remote machine (requires explicit confirmation) |

---

Previous: [Vault and Security](Vault-and-Security) -- Next: [Database Tools](Database-Tools)
