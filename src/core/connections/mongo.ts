import type { ConnectionConfig } from "../vault/types.js";
import type { DatabaseManager, QueryResult } from "./manager.js";

export class MongoManager implements DatabaseManager {
  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      const client = await this.connect(config);
      await client.close();
      return true;
    } catch {
      return false;
    }
  }

  async getInfo(config: ConnectionConfig): Promise<Record<string, string>> {
    try {
      const client = await this.connect(config);
      const info = await client.db().command({ buildInfo: 1 });
      await client.close();
      return { version: String(info.version ?? "unknown") };
    } catch {
      return {};
    }
  }

  async listDatabases(config: ConnectionConfig): Promise<string[]> {
    const client = await this.connect(config);
    try {
      const admin = client.db().admin();
      const result = await admin.listDatabases();
      return result.databases.map((d: any) => d.name).filter((n: string) => !["admin", "local", "config"].includes(n));
    } finally {
      await client.close();
    }
  }

  async listTables(config: ConnectionConfig, database: string): Promise<string[]> {
    const client = await this.connect(config);
    try {
      const db = client.db(database);
      const collections = await db.listCollections().toArray();
      return collections.map((c: any) => c.name);
    } finally {
      await client.close();
    }
  }

  async query(config: ConnectionConfig, database: string, query: string): Promise<QueryResult> {
    const client = await this.connect(config);
    try {
      const db = client.db(database);
      let parsed: any;
      try {
        parsed = JSON.parse(query);
      } catch {
        return { columns: [], rows: [], affectedRows: 0 };
      }
      const collection = parsed.collection ?? "test";
      const filter = parsed.filter ?? {};
      const limit = parsed.limit ?? 100;
      const docs = await db.collection(collection).find(filter).limit(limit).toArray();
      const columns = docs.length > 0 ? Object.keys(docs[0]) : [];
      return { columns, rows: docs as Record<string, unknown>[] };
    } finally {
      await client.close();
    }
  }

  async describeTable(config: ConnectionConfig, database: string, table: string): Promise<QueryResult> {
    const client = await this.connect(config);
    try {
      const db = client.db(database);
      const infos = await db.listCollections({ name: table }).toArray();
      if (infos.length === 0) return { columns: [], rows: [] };
      const info = infos[0];
      const options = info.options || {};
      const validator = options.validator || {};
      const fields = validator.$jsonSchema?.properties || {};
      const rows: Record<string, unknown>[] = [];
      for (const [name, schema] of Object.entries(fields)) {
        const s = schema as any;
        rows.push({
          column_name: name,
          data_type: s.bsonType ?? s.type ?? "unknown",
          is_nullable: s.required === false ? "YES" : "NO",
          column_default: s.default ?? "",
        });
      }
      if (rows.length === 0) {
        rows.push({
          column_name: "(no schema validation)",
          data_type: "dynamic",
          is_nullable: "YES",
          column_default: "",
        });
      }
      return { columns: ["column_name", "data_type", "is_nullable", "column_default"], rows };
    } finally {
      await client.close();
    }
  }

  async tableCount(config: ConnectionConfig, database: string, table: string): Promise<number> {
    const client = await this.connect(config);
    try {
      const db = client.db(database);
      return await db.collection(table).countDocuments();
    } finally {
      await client.close();
    }
  }

  async tableSample(config: ConnectionConfig, database: string, table: string, limit = 10): Promise<QueryResult> {
    const client = await this.connect(config);
    try {
      const db = client.db(database);
      const docs = await db.collection(table).find({}).limit(Math.max(1, Math.min(limit, 1000))).toArray();
      const columns = docs.length > 0 ? Object.keys(docs[0]) : [];
      return { columns, rows: docs as Record<string, unknown>[] };
    } finally {
      await client.close();
    }
  }

  async tableSize(config: ConnectionConfig, database: string): Promise<QueryResult> {
    const client = await this.connect(config);
    try {
      const db = client.db(database);
      const stats = await db.command({ dbStats: 1 });
      return {
        columns: ["database", "collections", "dataSize", "storageSize", "indexSize"],
        rows: [{
          database: database,
          collections: String(stats.collections ?? 0),
          dataSize: String(stats.dataSize ?? 0),
          storageSize: String(stats.storageSize ?? 0),
          indexSize: String(stats.indexSize ?? 0),
        }],
      };
    } finally {
      await client.close();
    }
  }

  async listIndexes(config: ConnectionConfig, database: string, table: string): Promise<QueryResult> {
    const client = await this.connect(config);
    try {
      const db = client.db(database);
      const indexes = await db.collection(table).indexes();
      const rows = indexes.map((idx: any) => ({
        indexname: String(idx.name ?? ""),
        indexdef: JSON.stringify(idx.key ?? {}),
      }));
      return { columns: ["indexname", "indexdef"], rows };
    } finally {
      await client.close();
    }
  }

  async listViews(config: ConnectionConfig, database: string): Promise<string[]> {
    const client = await this.connect(config);
    try {
      const db = client.db(database);
      const infos = await db.listCollections({ type: "view" }).toArray();
      return infos.map((c: any) => String(c.name));
    } finally {
      await client.close();
    }
  }

  async listFunctions(config: ConnectionConfig, database: string): Promise<QueryResult> {
    const client = await this.connect(config);
    try {
      const db = client.db(database);
      const funcs = await db.collection("system.js").find({}).limit(100).toArray();
      const rows = funcs.map((f: any) => ({
        routine_name: String(f._id ?? ""),
        routine_type: "function",
        data_type: "javascript",
      }));
      return { columns: ["routine_name", "routine_type", "data_type"], rows };
    } finally {
      await client.close();
    }
  }

  async activeConnections(config: ConnectionConfig): Promise<QueryResult> {
    const client = await this.connect(config);
    try {
      const info = await client.db().command({ serverStatus: 1 });
      const conns = info.connections ?? {};
      return {
        columns: ["metric", "value"],
        rows: [
          { metric: "current", value: String(conns.current ?? 0) },
          { metric: "available", value: String(conns.available ?? 0) },
          { metric: "totalCreated", value: String(conns.totalCreated ?? 0) },
        ],
      };
    } finally {
      await client.close();
    }
  }

  async runningQueries(config: ConnectionConfig): Promise<QueryResult> {
    const client = await this.connect(config);
    try {
      const ops = await client.db().command({ currentOp: 1, active: true });
      const inprog = ops.inprog ?? [];
      const rows = inprog.map((op: any) => ({
        opid: String(op.opid ?? ""),
        ns: String(op.ns ?? ""),
        op: String(op.op ?? ""),
        duration_micros: String(op.microsecs_running ?? 0),
        query: JSON.stringify(op.command ?? {}),
      }));
      return { columns: ["opid", "ns", "op", "duration_micros", "query"], rows };
    } finally {
      await client.close();
    }
  }

  async exportQuery(config: ConnectionConfig, database: string, table: string): Promise<string> {
    const result = await this.tableSample(config, database, table, 10000);
    if (result.rows.length === 0) return "";
    const cols = result.columns;
    const lines: string[] = [cols.join(",")];
    for (const row of result.rows) {
      lines.push(cols.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return "";
        const s = typeof v === "object" ? JSON.stringify(v) : String(v);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      }).join(","));
    }
    return lines.join("\n");
  }

  async explainQuery(config: ConnectionConfig, database: string, sql: string): Promise<QueryResult> {
    const client = await this.connect(config);
    try {
      const db = client.db(database);
      let parsed: any;
      try { parsed = JSON.parse(sql); } catch { return { columns: [], rows: [] }; }
      const collection = parsed.collection ?? "test";
      const filter = parsed.filter ?? {};
      const explainResult = await db.collection(collection).find(filter).explain();
      return {
        columns: ["queryPlanner", "executionStats"],
        rows: [{
          queryPlanner: JSON.stringify(explainResult.queryPlanner ?? {}, null, 2),
          executionStats: JSON.stringify(explainResult.executionStats ?? {}, null, 2),
        }],
      };
    } finally {
      await client.close();
    }
  }

  async slowQueries(config: ConnectionConfig): Promise<QueryResult> {
    const client = await this.connect(config);
    try {
      const db = client.db(config.database ?? "admin");
      await db.command({ profile: 2 });
      const profile = await db.collection("system.profile")
        .find({ millis: { $gt: 0 } })
        .sort({ millis: -1 })
        .limit(20)
        .toArray();
      const rows = profile.map((p: any) => ({
        op: String(p.op ?? ""),
        ns: String(p.ns ?? ""),
        millis: String(p.millis ?? 0),
        query: JSON.stringify(p.command ?? p.query ?? {}),
        ts: String(p.ts ?? ""),
      }));
      return { columns: ["op", "ns", "millis", "query", "ts"], rows };
    } finally {
      await client.close();
    }
  }

  async getLogs(config: ConnectionConfig, opts?: { tail?: number }): Promise<string[]> {
    const tail = opts?.tail ?? 100;
    const lines: string[] = [];
    const client = await this.connect(config);
    try {
      const db = client.db("admin");
      const result = await db.adminCommand({ getLog: "global" });
      const logLines: string[] = (result.log ?? []) as string[];
      lines.push("  === MongoDB Global Log (tail) ===");
      for (const line of logLines.slice(-tail)) {
        lines.push(`  ${line}`);
      }
      return lines.length > 1 ? lines : ["  No logs available"];
    } finally {
      await client.close();
    }
  }

  private async connect(config: ConnectionConfig): Promise<any> {
    const { MongoClient } = await import("mongodb");
    const proto = config.useTls ? "mongodb+srv" : "mongodb";
    const auth = config.username
      ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password ?? "")}@`
      : "";
    const uri = `${proto}://${auth}${config.host}:${config.port}/${config.database ?? ""}?directConnection=true`;
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    return client;
  }
}
