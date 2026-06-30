import type { ConnectionConfig, ConnectionType } from "../vault/types.js";
import { RedisManager } from "./redis.js";
import { S3Manager } from "./s3.js";
import { PostgresManager } from "./postgres.js";
import { MongoManager } from "./mongo.js";
import { HttpManager } from "./http.js";

export interface ConnectionManager {
  testConnection(config: ConnectionConfig): Promise<boolean>;
  getInfo(config: ConnectionConfig): Promise<Record<string, string>>;
}

export interface DatabaseManager extends ConnectionManager {
  listDatabases(config: ConnectionConfig): Promise<string[]>;
  listTables(config: ConnectionConfig, database: string): Promise<string[]>;
  query(config: ConnectionConfig, database: string, query: string): Promise<QueryResult>;
  describeTable(config: ConnectionConfig, database: string, table: string): Promise<QueryResult>;
  tableCount(config: ConnectionConfig, database: string, table: string): Promise<number>;
  tableSample(config: ConnectionConfig, database: string, table: string, limit?: number): Promise<QueryResult>;
  tableSize(config: ConnectionConfig, database: string): Promise<QueryResult>;
  listIndexes(config: ConnectionConfig, database: string, table: string): Promise<QueryResult>;
  listViews(config: ConnectionConfig, database: string): Promise<string[]>;
  listFunctions(config: ConnectionConfig, database: string): Promise<QueryResult>;
  activeConnections(config: ConnectionConfig): Promise<QueryResult>;
  runningQueries(config: ConnectionConfig): Promise<QueryResult>;
}

export interface StorageManager extends ConnectionManager {
  listBuckets(config: ConnectionConfig): Promise<string[]>;
  listObjects(config: ConnectionConfig, bucket: string): Promise<ObjectInfo[]>;
  uploadObject(config: ConnectionConfig, bucket: string, key: string, data: Buffer): Promise<void>;
  downloadObject(config: ConnectionConfig, bucket: string, key: string): Promise<Buffer>;
  deleteObject(config: ConnectionConfig, bucket: string, key: string): Promise<void>;
  createBucket(config: ConnectionConfig, name: string): Promise<void>;
  deleteBucket(config: ConnectionConfig, name: string): Promise<void>;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  affectedRows?: number;
}

export interface ObjectInfo {
  key: string;
  size: number;
  lastModified: string;
}

export function getManager(type: ConnectionType): ConnectionManager | null {
  switch (type) {
    case "redis": return new RedisManager();
    case "s3": return new S3Manager();
    case "postgres": return new PostgresManager();
    case "mongo": return new MongoManager();
    case "http": return new HttpManager();
    default: return null;
  }
}
