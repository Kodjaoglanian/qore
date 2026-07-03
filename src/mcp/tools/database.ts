import type { ToolDef } from "../registry.js";
import { VaultClient } from "../vault-client.js";
import { getManager, type DatabaseManager, type QueryResult } from "../../core/connections/manager.js";
import type { ConnectionConfig } from "../../core/vault/types.js";

const vaultClient = new VaultClient();

async function getDbConnection(name: string): Promise<{ config: ConnectionConfig; mgr: DatabaseManager }> {
  const resp = await vaultClient.getConnection(name);
  if ("error" in resp) {
    throw new Error(resp.error === "vault_locked"
      ? "Vault locked — unlock in qore TUI first"
      : `Connection "${name}" not found`);
  }
  const mgr = getManager(resp.config.type);
  if (!mgr || !("listDatabases" in mgr)) {
    throw new Error(`Connection "${name}" is not a database connection (type: ${resp.config.type})`);
  }
  return { config: resp.config, mgr: mgr as DatabaseManager };
}

function formatQueryResult(result: QueryResult): string {
  if (result.rows.length === 0) return "No rows returned.";
  const cols = result.columns;
  const header = cols.join(" | ");
  const separator = cols.map(() => "---").join(" | ");
  const rows = result.rows.slice(0, 50).map(r =>
    cols.map(c => String(r[c] ?? "NULL")).join(" | ")
  );
  let out = `${header}\n${separator}\n${rows.join("\n")}`;
  if (result.rows.length > 50) out += `\n... (${result.rows.length - 50} more rows)`;
  if (result.affectedRows !== undefined) out += `\n(${result.affectedRows} rows affected)`;
  return out;
}

export const databaseTools: ToolDef[] = [
  {
    name: "db_list_databases",
    description: "List all databases on a database connection (postgres/mysql/mongo)",
    inputSchema: {
      type: "object",
      properties: { connection: { type: "string", description: "Connection name" } },
      required: ["connection"],
    },
    handler: async (args) => {
      const { config, mgr } = await getDbConnection(args.connection as string);
      const dbs = await mgr.listDatabases(config);
      return `Databases (${dbs.length}):\n${dbs.map(d => `  ${d}`).join("\n")}`;
    },
  },
  {
    name: "db_list_tables",
    description: "List all tables in a database",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name" },
        database: { type: "string", description: "Database name" },
      },
      required: ["connection", "database"],
    },
    handler: async (args) => {
      const { config, mgr } = await getDbConnection(args.connection as string);
      const tables = await mgr.listTables(config, args.database as string);
      return `Tables in ${args.database} (${tables.length}):\n${tables.map(t => `  ${t}`).join("\n")}`;
    },
  },
  {
    name: "db_query",
    description: "Execute a SQL query on a database connection",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name" },
        database: { type: "string", description: "Database name" },
        query: { type: "string", description: "SQL query to execute" },
      },
      required: ["connection", "database", "query"],
    },
    handler: async (args) => {
      const { config, mgr } = await getDbConnection(args.connection as string);
      const result = await mgr.query(config, args.database as string, args.query as string);
      return formatQueryResult(result);
    },
  },
  {
    name: "db_describe_table",
    description: "Describe the structure of a table",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name" },
        database: { type: "string", description: "Database name" },
        table: { type: "string", description: "Table name" },
      },
      required: ["connection", "database", "table"],
    },
    handler: async (args) => {
      const { config, mgr } = await getDbConnection(args.connection as string);
      const result = await mgr.describeTable(config, args.database as string, args.table as string);
      return formatQueryResult(result);
    },
  },
  {
    name: "db_table_sample",
    description: "Get sample rows from a table",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name" },
        database: { type: "string", description: "Database name" },
        table: { type: "string", description: "Table name" },
        limit: { type: "number", description: "Number of rows (default 10)" },
      },
      required: ["connection", "database", "table"],
    },
    handler: async (args) => {
      const { config, mgr } = await getDbConnection(args.connection as string);
      const result = await mgr.tableSample(config, args.database as string, args.table as string, (args.limit as number) ?? 10);
      return formatQueryResult(result);
    },
  },
];
