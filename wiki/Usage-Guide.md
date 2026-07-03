# Usage Guide

Qore is operated entirely through the keyboard. Commands are typed in the bottom input bar and executed with Enter. Navigation uses arrow keys, Tab, and Escape.

---

## Global Commands

| Command | Description |
|---------|-------------|
| `discover` | Scan ports, containers, daemons, system info, network, processes, and services |
| `connections` | Manage saved service connections |
| `vault` | Create or unlock the credential vault |
| `help` | Show the full command reference |
| `back` / `esc` | Return to the previous screen |
| `quit` / `exit` / `^c` | Exit Qore from any screen |

## Navigation

| Key | Action |
|-----|--------|
| `Enter` | Execute typed command |
| `Escape` | Go back to previous screen |
| `Control-C` | Quit Qore |
| `Tab` | Autocomplete matching commands |
| `Up/Down` (empty input) | Navigate command list |
| `Up/Down` (with text) | Navigate command history |
| `Ctrl+Tab` / `Ctrl+Right` | Switch to next connection tab |
| `Ctrl+Left` | Switch to previous connection tab |

## UX Features

### Command History

Previous commands are saved during the session. When the input bar has text, use Up/Down arrows to cycle through history.

### Tab Autocomplete

Press Tab to cycle through commands that match the current input text.

### Favorites

Star frequently used commands for quick recall:

| Command | Description |
|---------|-------------|
| `star <command>` | Add a command to favorites |
| `unstar <command>` | Remove a command from favorites |
| `favorites` | List all starred commands |

### Multi-Connection Tabs

Open multiple service connections simultaneously. All tabs remain mounted with their state preserved when switching. Use `Ctrl+Tab` or `Ctrl+Right` to switch to the next tab and `Ctrl+Left` for the previous tab.

### Multi-Session

Open multiple sessions of the same connection (for example, two SSH sessions to the same server). Use the `new` command inside any service screen to open a duplicate session.

### Auto-Refresh

On the discovery screen, type `auto` to toggle automatic refresh every 5 seconds.

---

## Screen Reference

| Screen | Purpose |
|--------|---------|
| Welcome | Initial landing screen |
| Discovery | Infrastructure scanning and management |
| Connections | Add, remove, test, and connect to saved services |
| Vault | Create or unlock the credential vault |
| Service | Type-specific console (SSH, database, S3, HTTP) |
| Help | Full command reference |
| Storage | Local S3 object browser |
| Providers | Switch between local and AWS S3 providers |

See [Discovery Screen](Discovery-Screen), [Connections](Connections), [SSH Toolkit](SSH-Toolkit), [Database Tools](Database-Tools), [S3 Storage](S3-Storage), and [HTTP API](HTTP-API) for screen-specific commands.

---

Previous: [Configuration](Configuration) -- Next: [Discovery Screen](Discovery-Screen)
