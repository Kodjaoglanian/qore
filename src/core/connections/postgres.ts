import type { ConnectionConfig } from "../vault/types.js";
import type { DatabaseManager, QueryResult } from "./manager.js";

export class PostgresManager implements DatabaseManager {
  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      const result = await this.query(config, config.database ?? "postgres", "SELECT 1");
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  async getInfo(config: ConnectionConfig): Promise<Record<string, string>> {
    try {
      const result = await this.query(config, config.database ?? "postgres", "SELECT version()");
      return { version: String(result.rows[0]?.["version"] ?? "unknown") };
    } catch {
      return {};
    }
  }

  async listDatabases(config: ConnectionConfig): Promise<string[]> {
    const result = await this.query(config, config.database ?? "postgres",
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname");
    return result.rows.map((r) => String(r["datname"]));
  }

  async listTables(config: ConnectionConfig, database: string): Promise<string[]> {
    const result = await this.query(config, database,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    return result.rows.map((r) => String(r["table_name"]));
  }

  async query(config: ConnectionConfig, database: string, sql: string): Promise<QueryResult> {
    const conn = await connectPostgres(config, database);
    try {
      const result = await conn.query(sql);
      return {
        columns: result.fields?.map((f: any) => f.name) ?? [],
        rows: result.rows ?? [],
      };
    } finally {
      await conn.end();
    }
  }

  async describeTable(config: ConnectionConfig, database: string, table: string): Promise<QueryResult> {
    return this.query(config, database,
      `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}'
       ORDER BY ordinal_position`);
  }

  async tableCount(config: ConnectionConfig, database: string, table: string): Promise<number> {
    const result = await this.query(config, database,
      `SELECT count(*)::int AS count FROM "${table.replace(/"/g, '""')}"`);
    return Number(result.rows[0]?.["count"] ?? 0);
  }

  async tableSample(config: ConnectionConfig, database: string, table: string, limit = 10): Promise<QueryResult> {
    return this.query(config, database,
      `SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT ${Math.max(1, Math.min(limit, 1000))}`);
  }

  async tableSize(config: ConnectionConfig, database: string): Promise<QueryResult> {
    return this.query(config, database,
      `SELECT schemaname, tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS data_size,
        pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS index_size
       FROM pg_catalog.pg_tables
       WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
       ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
       LIMIT 50`);
  }

  async listIndexes(config: ConnectionConfig, database: string, table: string): Promise<QueryResult> {
    return this.query(config, database,
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = '${table.replace(/'/g, "''")}'
       ORDER BY indexname`);
  }

  async listViews(config: ConnectionConfig, database: string): Promise<string[]> {
    const result = await this.query(config, database,
      `SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname`);
    return result.rows.map((r) => String(r["viewname"]));
  }

  async listFunctions(config: ConnectionConfig, database: string): Promise<QueryResult> {
    return this.query(config, database,
      `SELECT routine_name, routine_type, data_type
       FROM information_schema.routines
       WHERE routine_schema = 'public'
       ORDER BY routine_name`);
  }

  async activeConnections(config: ConnectionConfig): Promise<QueryResult> {
    return this.query(config, config.database ?? "postgres",
      `SELECT pid, usename, application_name, client_addr, state, query_start, query
       FROM pg_stat_activity
       ORDER BY pid`);
  }

  async runningQueries(config: ConnectionConfig): Promise<QueryResult> {
    return this.query(config, config.database ?? "postgres",
      `SELECT pid, usename, state, query_start, now() - query_start AS duration, query
       FROM pg_stat_activity
       WHERE state = 'active' AND pid <> pg_backend_pid()
       ORDER BY query_start`);
  }

  async exportQuery(config: ConnectionConfig, database: string, table: string): Promise<string> {
    const result = await this.query(config, database,
      `SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT 10000`);
    if (result.rows.length === 0) return "";
    const cols = result.columns;
    const lines: string[] = [cols.join(",")];
    for (const row of result.rows) {
      lines.push(cols.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return "";
        const s = String(v);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      }).join(","));
    }
    return lines.join("\n");
  }

  async explainQuery(config: ConnectionConfig, database: string, sql: string): Promise<QueryResult> {
    return this.query(config, database, `EXPLAIN ANALYZE ${sql}`);
  }

  async slowQueries(config: ConnectionConfig): Promise<QueryResult> {
    return this.query(config, config.database ?? "postgres",
      `SELECT query, calls, total_exec_time, mean_exec_time, rows
       FROM pg_stat_statements
       ORDER BY mean_exec_time DESC
       LIMIT 20`);
  }

  async getLogs(config: ConnectionConfig, opts?: { tail?: number }): Promise<string[]> {
    const lines: string[] = [];
    const tail = opts?.tail ?? 100;
    try {
      const result = await this.query(config, config.database ?? "postgres",
        `SELECT pid, usename, application_name, client_addr, state, query
         FROM pg_stat_activity WHERE state IS NOT NULL ORDER BY query_start DESC LIMIT ${Math.min(tail, 50)}`);
      lines.push("  === Active Sessions ===");
      for (const row of result.rows) {
        lines.push(`  pid:${row["pid"]} user:${row["usename"] ?? "-"} state:${row["state"]} query:${String(row["query"] ?? "").slice(0, 80)}`);
      }
    } catch (err) {
      lines.push(`  [!] pg_stat_activity: ${(err as Error).message}`);
    }
    try {
      const logResult = await this.query(config, config.database ?? "postgres",
        `SELECT pg_read_file('log/' || (SELECT pg_ls_dir('log') ORDER BY 1 DESC LIMIT 1), 0, ${tail * 200}) AS log`);
      if (logResult.rows[0]?.["log"]) {
        lines.push("  === Server Log (tail) ===");
        const logLines = String(logResult.rows[0]["log"]).split("\n").slice(-tail);
        for (const line of logLines) {
          if (line.trim()) lines.push(`  ${line}`);
        }
      }
    } catch {}
    return lines.length > 0 ? lines : ["  No logs available"];
  }
}

async function connectPostgres(config: ConnectionConfig, database: string): Promise<any> {
  const { Client } = await import("pg");
  const client = new Client({
    host: config.host,
    port: config.port,
    database,
    user: config.username ?? "postgres",
    password: config.password,
    ssl: config.useTls ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  return client;
}
