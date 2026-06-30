// Shared types for the Qore orchestrator

export interface DiscoveredPort {
  port: number;
  protocol: "tcp" | "udp";
  service: string;
  pid: number;
  command: string;
  state: string;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string[];
  created: number;
}

export interface DockerImage {
  id: string;
  tags: string[];
  size: number;
  created: number;
}

export interface DockerInfo {
  containers: number;
  running: number;
  paused: number;
  stopped: number;
  images: number;
  version: string;
}

export interface DaemonProcess {
  name: string;
  pid: number;
  status: string;
  manager: "pm2" | "systemd";
}

export interface ProbeResult {
  ports: DiscoveredPort[];
  containers: DockerContainer[];
  dockerInfo: DockerInfo | null;
  daemons: DaemonProcess[];
  timestamp: number;
}

export type ProviderType = "local" | "aws";

export interface BucketInfo {
  name: string;
  createdAt: string;
  fileCount: number;
  sizeBytes: number;
}

export interface FileInfo {
  key: string;
  sizeBytes: number;
  lastModified: string;
}

export interface StorageProvider {
  readonly type: ProviderType;
  listBuckets(): Promise<BucketInfo[]>;
  createBucket(name: string): Promise<void>;
  deleteBucket(name: string): Promise<void>;
  uploadFile(bucket: string, key: string, data: Buffer): Promise<void>;
  downloadFile(bucket: string, key: string): Promise<Buffer>;
  listFiles(bucket: string): Promise<FileInfo[]>;
  deleteFile(bucket: string, key: string): Promise<void>;
}

export interface MessagingProvider {
  readonly type: ProviderType;
  publish(topic: string, message: Buffer): Promise<void>;
  subscribe(topic: string, handler: (message: Buffer) => void): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;
  listTopics(): Promise<string[]>;
}
