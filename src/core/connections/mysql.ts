import type { ConnectionConfig } from "../vault/types.js";
import type { DatabaseManager, QueryResult } from "./manager.js";

export class MysqlManager implements DatabaseManager {
  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      const result = await this.query(config, config.database ?? "mysql", "SELECT 1 AS one");
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  async getInfo(config: ConnectionConfig): Promise<Record<string, string>> {
    try {
      const result = await this.query(config, config.database ?? "mysql", "SELECT VERSION() AS version");
      return { version: String(result.rows[0]?.["version"] ?? "unknown") };
    } catch {
      return {};
    }
  }

  async listDatabases(config: ConnectionConfig): Promise<string[]> {
    const result = await this.query(config, config.database ?? "mysql",
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','performance_schema','mysql','sys') ORDER BY schema_name");
    return result.rows.map((r) => String(r["schema_name"] ?? r["SCHEMA_NAME"] ?? r["Schema_name"]));
  }

  async listTables(config: ConnectionConfig, database: string): Promise<string[]> {
    const result = await this.query(config, database,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
    return result.rows.map((r) => String(r["table_name"] ?? r["TABLE_NAME"] ?? r["Table_name"]));
  }

  async query(config: ConnectionConfig, database: string, sql: string): Promise<QueryResult> {
    const conn = await connectMysql(config, database);
    try {
      const [rows, fields] = await conn.execute(sql);
      const columns = fields ? fields.map((f: any) => f.name) : [];
      return {
        columns,
        rows: Array.isArray(rows) ? rows : [],
      };
    } finally {
      await conn.end();
    }
  }

  async describeTable(config: ConnectionConfig, database: string, table: string): Promise<QueryResult> {
    return this.query(config, database,
      `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = '${table.replace(/'/g, "''")}'
       ORDER BY ordinal_position`);
  }

  async tableCount(config: ConnectionConfig, database: string, table: string): Promise<number> {
    const result = await this.query(config, database,
      `SELECT count(*) AS count FROM \`${table.replace(/`/g, "``")}\``);
    return Number(result.rows[0]?.["count"] ?? 0);
  }

  async tableSample(config: ConnectionConfig, database: string, table: string, limit = 10): Promise<QueryResult> {
    return this.query(config, database,
      `SELECT * FROM \`${table.replace(/`/g, "``")}\` LIMIT ${Math.max(1, Math.min(limit, 1000))}`);
  }

  async tableSize(config: ConnectionConfig, database: string): Promise<QueryResult> {
    return this.query(config, database,
      `SELECT table_name AS tablename,
        data_length + index_length AS total_size,
        data_length AS data_size,
        index_length AS index_size
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY (data_length + index_length) DESC
       LIMIT 50`);
  }

  async listIndexes(config: ConnectionConfig, database: string, table: string): Promise<QueryResult> {
    return this.query(config, database,
      `SELECT index_name AS indexname, index_comment AS indexdef
       FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = '${table.replace(/'/g, "''")}'
       GROUP BY index_name, index_comment
       ORDER BY index_name`);
  }

  async listViews(config: ConnectionConfig, database: string): Promise<string[]> {
    const result = await this.query(config, database,
      `SELECT table_name AS viewname FROM information_schema.views WHERE table_schema = DATABASE() ORDER BY table_name`);
    return result.rows.map((r) => String(r["viewname"] ?? r["VIEWNAME"] ?? r["table_name"]));
  }

  async listFunctions(config: ConnectionConfig, database: string): Promise<QueryResult> {
    return this.query(config, database,
      `SELECT routine_name, routine_type, data_type
       FROM information_schema.routines
       WHERE routine_schema = DATABASE()
       ORDER BY routine_name`);
  }

  async activeConnections(config: ConnectionConfig): Promise<QueryResult> {
    return this.query(config, config.database ?? "mysql",
      `SELECT id, user, host, db, command, time, state, info
       FROM information_schema.processlist
       ORDER BY id`);
  }

  async runningQueries(config: ConnectionConfig): Promise<QueryResult> {
    return this.query(config, config.database ?? "mysql",
      `SELECT id, user, host, db, time, state, info
       FROM information_schema.processlist
       WHERE command = 'Query'
       ORDER BY time DESC`);
  }

  async getLogs(config: ConnectionConfig, opts?: { tail?: number }): Promise<string[]> {
    const lines: string[] = [];
    const tail = opts?.tail ?? 100;
    try {
      const result = await this.query(config, config.database ?? "mysql",
        `SELECT id, user, host, db, command, time, state, info
         FROM information_schema.processlist ORDER BY id LIMIT ${Math.min(tail, 50)}`);
      lines.push("  === Processlist ===");
      for (const row of result.rows) {
        lines.push(`  id:${row["id"]} user:${row["user"] ?? "-"} db:${row["db"] ?? "-"} cmd:${row["command"]} time:${row["time"]}s info:${String(row["info"] ?? "").slice(0, 60)}`);
      }
    } catch (err) {
      lines.push(`  [!] processlist: ${(err as Error).message}`);
    }
    try {
      const conn = await connectMysql(config, config.database ?? "mysql");
      try {
        const [rows] = await conn.query("SHOW VARIABLES LIKE 'log_error'");
        const logPath = (rows as any)[0]?.Value;
        if (logPath) {
          lines.push(`  === Error Log: ${logPath} ===`);
        }
      } finally {
        await conn.end();
      }
    } catch {}
    return lines.length > 0 ? lines : ["  No logs available"];
  }
}

async function connectMysql(config: ConnectionConfig, database: string): Promise<any> {
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    database,
    user: config.username ?? "root",
    password: config.password,
    ssl: config.useTls ? { rejectUnauthorized: false } : undefined,
  });
  return conn;
}
