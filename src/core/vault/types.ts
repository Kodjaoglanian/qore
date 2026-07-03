export type ConnectionType = "redis" | "postgres" | "mysql" | "mongo" | "s3" | "http" | "ssh" | "git";

export interface ConnectionConfig {
  id: string;
  name: string;
  type: ConnectionType;
  host: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  apiSecret?: string;
  region?: string;
  useTls: boolean;
  extra?: Record<string, string>;
}

export interface VaultMeta {
  version: number;
  salt: string;
  nonce: string;
  createdAt: string;
}

export interface VaultData {
  connections: ConnectionConfig[];
}

export const CONNECTION_LABELS: Record<ConnectionType, string> = {
  redis: "Redis",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mongo: "MongoDB",
  s3: "S3-Compatible",
  http: "HTTP API",
  ssh: "SSH Remote",
  git: "Git Repository",
};

export const CONNECTION_ICONS: Record<ConnectionType, string> = {
  redis: "[R]",
  postgres: "[P]",
  mysql: "[M]",
  mongo: "[M]",
  s3: "[S]",
  http: "[H]",
  ssh: "[SSH]",
  git: "[G]",
};

export const DEFAULT_PORTS: Record<ConnectionType, number> = {
  redis: 6379,
  postgres: 5432,
  mysql: 3306,
  mongo: 27017,
  s3: 9000,
  http: 80,
  ssh: 22,
  git: 0,
};
