# Database Tools

Qore provides protocol-native database management for PostgreSQL, MySQL, MongoDB, and Redis. Each driver connects directly using the database's wire protocol without requiring CLI tools.

---

## Common Database Commands

Available on PostgreSQL, MySQL, and MongoDB service screens:

| Command | Description |
|---------|-------------|
| `info` | Show service information |
| `logs` | Show service-specific logs |
| `tables <db>` | List tables or collections |
| `desc <db> <table>` | Describe table structure |
| `count <db> <table>` | Count rows or documents |
| `sample <db> <t> [n]` | Show sample rows (default 10) |
| `size <db>` | Show table sizes |
| `indexes <db> <table>` | List indexes |
| `views <db>` | List views |
| `funcs <db>` | List functions |
| `conns` | Show active connections |
| `queries` | Show running queries |
| `query <db> <sql>` | Run a custom query |
| `export <db> <table>` | Export table data to CSV file |
| `explain <db> <sql>` | Run EXPLAIN query plan analysis |
| `slow-queries` | Show slow queries |
| `refresh` | Reconnect and reload data |
| `back` / `esc` | Return to connections screen |

## Log Sources by Database

| Database | Log Source |
|----------|-----------|
| PostgreSQL | `pg_stat_activity` |
| MySQL | `SHOW PROCESSLIST` |
| MongoDB | `db.getLog().main` |
| Redis | `SLOWLOG` + `INFO` stats |

## Slow Query Monitoring

| Database | Source |
|----------|--------|
| PostgreSQL | `pg_stat_statements` |
| MySQL | `mysql.slow_log` |
| MongoDB | Database profiler |

## PostgreSQL

PostgreSQL connections use the native wire protocol (no `pg` npm package required).

### Connection Fields

| Field | Default |
|-------|---------|
| Host | localhost |
| Port | 5432 |
| Username | (required) |
| Password | (required) |
| Database | (required) |

### Supported Features

- Custom SQL queries (`query <db> <sql>`)
- EXPLAIN plans (`explain <db> <sql>`)
- Table size analysis (`size <db>`)
- Index listing (`indexes <db> <table>`)
- View listing (`views <db>`)
- Function listing (`funcs <db>`)
- Active connection monitoring (`conns`)
- Running query monitoring (`queries`)
- CSV export (`export <db> <table>`)
- Slow query analysis via `pg_stat_statements`

## MySQL

MySQL connections use the `mysql2` library.

### Connection Fields

| Field | Default |
|-------|---------|
| Host | localhost |
| Port | 3306 |
| Username | (required) |
| Password | (required) |
| Database | (required) |

### Supported Features

- Custom SQL queries
- EXPLAIN plans
- Table size analysis
- Index and view listing
- Active connection monitoring
- CSV export
- Slow query analysis via `mysql.slow_log`

## MongoDB

MongoDB connections use the native MongoDB wire protocol.

### Connection Fields

| Field | Default |
|-------|---------|
| Host | localhost |
| Port | 27017 |
| Username | (optional) |
| Password | (optional) |
| Database | (required) |

### Supported Features

- Collection listing (`tables <db>`)
- Document counting (`count <db> <collection>`)
- Sample documents (`sample <db> <collection> [n]`)
- Custom queries with MongoDB syntax
- Index listing
- Active connection monitoring
- CSV export
- Slow query analysis via MongoDB profiler

## Redis

Redis connections use the RESP (REdis Serialization Protocol) directly.

### Connection Fields

| Field | Default |
|-------|---------|
| Host | localhost |
| Port | 6379 |
| Password | (optional) |
| Database | 0 |

### Redis Commands

| Command | Description |
|---------|-------------|
| `get <key>` | Get value for key |
| `set <k> <v>` | Set key to value |
| `del <key>` | Delete a key |
| `keys <pattern>` | List keys matching pattern |
| `flushdb` | Clear the current database |
| `info` | Show Redis server info |
| `logs` | Show SLOWLOG and INFO stats |

---

Previous: [SSH Toolkit](SSH-Toolkit) -- Next: [S3 Storage](S3-Storage)
