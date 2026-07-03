# Discovery Screen

The discovery screen provides at-a-glance visibility into the local infrastructure. It uses a sidebar layout with 9 sections, each displaying a different category of discovered resources.

---

## Layout

```text
+--------------------+------------------------------------------+
| Sections           | Overview                                 |
|                    |                                          |
| 1:[] Overview    . | System                                   |
| 2:<> Ports       8 |   hostname · OS · kernel                 |
| 3:[] Containers  3 |   CPU · memory · load                    |
| 4:<> Images      5 |                                          |
| 5:() Daemons     2 | Summary                                  |
| 6:() System      . |   3 containers (2 running)               |
| 7:^ Network      4 |   5 images · 8 ports · 2 daemons         |
| 8:v Procs       42 |   42 processes · 18 services (12 active) |
| 9:() Services   18 |                                          |
|                    | Disks                                    |
|                    |   /  45% · /home 23% · /data 67%         |
+--------------------+------------------------------------------+
| filter <text> · start · stop · rm · stats · exec <cmd> · ...    |
| ↑/↓ select · tab switch · 1-9 jump · esc back                   |
+-----------------------------------------------------------------+
```

- **Sidebar** (left, 22 columns): Lists all 9 sections with icons, item counts, and an active indicator.
- **Main panel** (right): Displays the content of the active section with full terminal height.
- **Input bar** (bottom): Accepts commands and filters.
- **Shortcut bar** (bottom): Shows contextual shortcuts for the active section.

## Sections

| Number | Section | Description |
|--------|---------|-------------|
| 1 | Overview | System summary, quick stats grid, and disk usage with color-coded percentages |
| 2 | Ports | Open TCP ports with process info (PID, service, command) |
| 3 | Containers | Docker containers with name, image, state, and status |
| 4 | Images | Docker images with tags, IDs, and sizes |
| 5 | Daemons | pm2 and systemd managed processes |
| 6 | System | Host information (hostname, OS, kernel, CPU, memory, swap, load, disks) |
| 7 | Network | Network interfaces, routing tables, and firewall rules |
| 8 | Procs | Top processes by CPU usage with PID, user, CPU%, memory%, and command |
| 9 | Services | systemd services with active state, sub state, and description |

## Navigation

| Key | Action |
|-----|--------|
| `1` - `9` | Jump to section by number |
| `Tab` | Cycle to next section |
| `Up` / `Down` | Navigate within section list |
| `PageUp` / `PageDown` | Jump by page in list sections |
| `Escape` | Return to welcome screen |

## Commands

### Container Commands (section 3)

| Command | Description |
|---------|-------------|
| `start` | Start the selected container |
| `stop` | Stop the selected container |
| `restart` | Restart the selected container |
| `rm` | Remove the selected container |
| `logs` | View container logs (overlay) |
| `inspect` | Inspect container details (overlay) |
| `stats` | Container resource statistics (overlay) |
| `exec <cmd>` | Execute command inside container (overlay) |
| `prune` | Remove all stopped containers |
| `batch-start` | Start all containers |
| `batch-stop` | Stop all containers |
| `batch-restart` | Restart all containers |

### Image Commands (section 4)

| Command | Description |
|---------|-------------|
| `rm` | Remove the selected image |
| `prune-images` | Remove all unused images |

### Process Commands (section 8)

| Command | Description |
|---------|-------------|
| `kill` | Terminate the selected process (SIGTERM) |
| `kill-9` | Force kill the selected process (SIGKILL) |

### Service Commands (section 9)

| Command | Description |
|---------|-------------|
| `svc-start` | Start the selected systemd service |
| `svc-stop` | Stop the selected systemd service |
| `svc-restart` | Restart the selected systemd service |
| `svc-logs` | View service logs (overlay) |

### General Commands

| Command | Description |
|---------|-------------|
| `filter <text>` | Filter the current section by text |
| `filter` | Clear the active filter |
| `auto` | Toggle auto-refresh (5 second interval) |
| `refresh` | Re-run the discovery scan |

## Overlay Views

When viewing logs, inspect output, stats, or exec results, an overlay appears with its own scroll controls:

| Key | Action |
|-----|--------|
| `Up` / `Down` | Scroll one line |
| `PageUp` / `PageDown` | Scroll ten lines |
| `Escape` | Close overlay and return |

## Docker Permission Error

If the containers section shows a permission error, your user is not in the `docker` group:

```bash
sudo usermod -aG docker $USER
```

Log out and log back in for the change to take effect.

---

Previous: [Usage Guide](Usage-Guide) -- Next: [Connections](Connections)
