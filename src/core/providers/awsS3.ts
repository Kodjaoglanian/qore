import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { StorageProvider, BucketInfo, FileInfo } from "../types.js";

export class AwsS3Provider implements StorageProvider {
  readonly type = "aws" as const;
  private region: string;
  private accessKeyId: string | null = null;
  private secretAccessKey: string | null = null;

  constructor(region?: string) {
    this.region = region ?? process.env.AWS_REGION ?? "us-east-1";
    this.loadCredentials();
  }

  private loadCredentials() {
    const credPath = join(homedir(), ".aws", "credentials");
    if (!existsSync(credPath)) return;

    const content = readFileSync(credPath, "utf-8");
    const profileMatch = content.match(/\[default\][\s\S]*?(?=\[|$)/);
    if (!profileMatch) return;

    const profile = profileMatch[0];
    const accessMatch = profile.match(/aws_access_key_id\s*=\s*(.+)/);
    const secretMatch = profile.match(/aws_secret_access_key\s*=\s*(.+)/);

    if (accessMatch) this.accessKeyId = accessMatch[1].trim();
    if (secretMatch) this.secretAccessKey = secretMatch[1].trim();
  }

  private isConfigured(): boolean {
    return this.accessKeyId !== null && this.secretAccessKey !== null;
  }

  private async s3Request(method: string, path: string, body?: Buffer): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("AWS credentials not found in ~/.aws/credentials");
    }

    const host = "s3.amazonaws.com";
    const url = `https://${host}${path}`;

    const date = new Date().toUTCString();
    const headers: Record<string, string> = {
      Host: host,
      Date: date,
      "x-amz-date": date,
    };

    if (body) {
      headers["Content-Length"] = String(body.length);
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`S3 API error: ${response.status} ${text.slice(0, 200)}`);
    }
    return text;
  }

  async listBuckets(): Promise<BucketInfo[]> {
    const xml = await this.s3Request("GET", "/");
    return parseBucketsXml(xml);
  }

  async createBucket(name: string): Promise<void> {
    await this.s3Request("PUT", `/${name}`);
  }

  async deleteBucket(name: string): Promise<void> {
    await this.s3Request("DELETE", `/${name}`);
  }

  async uploadFile(bucket: string, key: string, data: Buffer): Promise<void> {
    await this.s3Request("PUT", `/${bucket}/${key}`, data);
  }

  async downloadFile(bucket: string, key: string): Promise<Buffer> {
    const xml = await this.s3Request("GET", `/${bucket}/${key}`);
    return Buffer.from(xml);
  }

  async listFiles(bucket: string): Promise<FileInfo[]> {
    const xml = await this.s3Request("GET", `/${bucket}`);
    return parseFilesXml(xml);
  }

  async deleteFile(bucket: string, key: string): Promise<void> {
    await this.s3Request("DELETE", `/${bucket}/${key}`);
  }
}

function parseBucketsXml(xml: string): BucketInfo[] {
  const buckets: BucketInfo[] = [];
  const bucketRegex = /<Bucket>\s*<Name>([^<]+)<\/Name>\s*<CreationDate>([^<]+)<\/CreationDate>/g;
  let match;
  while ((match = bucketRegex.exec(xml)) !== null) {
    buckets.push({
      name: match[1],
      createdAt: match[2],
      fileCount: 0,
      sizeBytes: 0,
    });
  }
  return buckets;
}

function parseFilesXml(xml: string): FileInfo[] {
  const files: FileInfo[] = [];
  const fileRegex = /<Key>([^<]+)<\/Key>\s*<Size>(\d+)<\/Size>\s*<LastModified>([^<]+)<\/LastModified>/g;
  let match;
  while ((match = fileRegex.exec(xml)) !== null) {
    files.push({
      key: match[1],
      sizeBytes: parseInt(match[2], 10),
      lastModified: match[3],
    });
  }
  return files;
}
