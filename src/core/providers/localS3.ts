import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { StorageProvider, BucketInfo, FileInfo } from "../types.js";

function qoreDir(): string {
  return process.env.QORE_HOME ?? join(homedir(), ".qore");
}
function storageDir(): string { return join(qoreDir(), "storage"); }
function dbPath(): string { return join(qoreDir(), "metadata.db"); }

export class LocalS3Provider implements StorageProvider {
  readonly type = "local" as const;
  private db: Database;

  constructor() {
    this.ensureDirs();
    this.db = new Database(dbPath(), { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.initSchema();
  }

  private ensureDirs() {
    const sd = storageDir();
    const qd = qoreDir();
    const dirs = [sd, qd];
    for (const d of dirs) {
      if (!existsSync(d)) mkdirSync(d, { recursive: true });
    }
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS buckets (
        name TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS files (
        bucket TEXT NOT NULL,
        key TEXT NOT NULL,
        size INTEGER NOT NULL,
        last_modified TEXT NOT NULL,
        PRIMARY KEY (bucket, key),
        FOREIGN KEY (bucket) REFERENCES buckets(name) ON DELETE CASCADE
      );
    `);
  }

  async listBuckets(): Promise<BucketInfo[]> {
    const buckets = this.db.query("SELECT name, created_at FROM buckets").all() as any[];
    return buckets.map((b) => {
      const files = this.db
        .query("SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total FROM files WHERE bucket = ?")
        .get(b.name) as any;
      return {
        name: b.name,
        createdAt: b.created_at,
        fileCount: files.count ?? 0,
        sizeBytes: files.total ?? 0,
      };
    });
  }

  async createBucket(name: string): Promise<void> {
    const dir = join(storageDir(), name);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db.query("INSERT OR IGNORE INTO buckets (name, created_at) VALUES (?, ?)").run(
      name,
      new Date().toISOString()
    );
  }

  async deleteBucket(name: string): Promise<void> {
    const dir = join(storageDir(), name);
    if (existsSync(dir)) {
      const files = readdirSync(dir);
      for (const f of files) unlinkSync(join(dir, f));
    }
    this.db.query("DELETE FROM files WHERE bucket = ?").run(name);
    this.db.query("DELETE FROM buckets WHERE name = ?").run(name);
  }

  async uploadFile(bucket: string, key: string, data: Buffer): Promise<void> {
    const dir = join(storageDir(), bucket);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filePath = join(dir, key);
    writeFileSync(filePath, data);
    this.db
      .query(
        "INSERT OR REPLACE INTO files (bucket, key, size, last_modified) VALUES (?, ?, ?, ?)"
      )
      .run(bucket, key, data.length, new Date().toISOString());
  }

  async downloadFile(bucket: string, key: string): Promise<Buffer> {
    const filePath = join(storageDir(), bucket, key);
    return Buffer.from(readFileSync(filePath));
  }

  async listFiles(bucket: string): Promise<FileInfo[]> {
    const files = this.db
      .query("SELECT key, size, last_modified FROM files WHERE bucket = ? ORDER BY key")
      .all(bucket) as any[];
    return files.map((f) => ({
      key: f.key,
      sizeBytes: f.size,
      lastModified: f.last_modified,
    }));
  }

  async deleteFile(bucket: string, key: string): Promise<void> {
    const filePath = join(storageDir(), bucket, key);
    if (existsSync(filePath)) unlinkSync(filePath);
    this.db.query("DELETE FROM files WHERE bucket = ? AND key = ?").run(bucket, key);
  }

  close() {
    this.db.close();
  }
}
