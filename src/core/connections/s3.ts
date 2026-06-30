import { createHmac, createHash } from "node:crypto";
import type { ConnectionConfig } from "../vault/types.js";
import type { StorageManager, ObjectInfo } from "./manager.js";

export class S3Manager implements StorageManager {
  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      await this.request(config, "GET", "/");
      return true;
    } catch {
      return false;
    }
  }

  async getInfo(config: ConnectionConfig): Promise<Record<string, string>> {
    const buckets = await this.listBuckets(config);
    return {
      endpoint: `${config.host}:${config.port}`,
      region: config.region ?? "us-east-1",
      buckets: String(buckets.length),
    };
  }

  async listBuckets(config: ConnectionConfig): Promise<string[]> {
    const xml = await this.request(config, "GET", "/");
    const buckets: string[] = [];
    const regex = /<Name>([^<]+)<\/Name>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      buckets.push(match[1]);
    }
    return buckets;
  }

  async listObjects(config: ConnectionConfig, bucket: string): Promise<ObjectInfo[]> {
    const xml = await this.request(config, "GET", `/${bucket}`);
    const objects: ObjectInfo[] = [];
    const regex = /<Key>([^<]+)<\/Key>\s*<LastModified>([^<]+)<\/LastModified>\s*<Size>(\d+)<\/Size>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      objects.push({
        key: match[1],
        lastModified: match[2],
        size: parseInt(match[3], 10),
      });
    }
    return objects;
  }

  async uploadObject(config: ConnectionConfig, bucket: string, key: string, data: Buffer): Promise<void> {
    await this.request(config, "PUT", `/${bucket}/${key}`, data);
  }

  async downloadObject(config: ConnectionConfig, bucket: string, key: string): Promise<Buffer> {
    const resp = await this.request(config, "GET", `/${bucket}/${key}`, undefined, true);
    return Buffer.from(resp);
  }

  async deleteObject(config: ConnectionConfig, bucket: string, key: string): Promise<void> {
    await this.request(config, "DELETE", `/${bucket}/${key}`);
  }

  async createBucket(config: ConnectionConfig, name: string): Promise<void> {
    await this.request(config, "PUT", `/${name}`);
  }

  async deleteBucket(config: ConnectionConfig, name: string): Promise<void> {
    await this.request(config, "DELETE", `/${name}`);
  }

  private getEndpoint(config: ConnectionConfig): string {
    const proto = config.useTls ? "https" : "http";
    return `${proto}://${config.host}:${config.port}`;
  }

  private async request(
    config: ConnectionConfig,
    method: string,
    path: string,
    body?: Buffer,
    rawResponse = false,
  ): Promise<string> {
    const endpoint = this.getEndpoint(config);
    const url = `${endpoint}${path}`;
    const accessKey = config.apiKey ?? config.username ?? "";
    const secretKey = config.apiSecret ?? config.password ?? "";
    const region = config.region ?? "us-east-1";

    if (!accessKey || !secretKey) {
      throw new Error("S3 credentials not configured (need apiKey/apiSecret or username/password)");
    }

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);

    const headers: Record<string, string> = {
      Host: `${config.host}:${config.port}`,
      "x-amz-date": amzDate,
    };

    if (body) {
      headers["Content-Length"] = String(body.length);
      headers["x-amz-content-sha256"] = createHash("sha256").update(body).digest("hex");
    } else {
      headers["x-amz-content-sha256"] = createHash("sha256").digest("hex");
    }

    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((k) => `${k.toLowerCase()}:${headers[k].trim()}\n`)
      .join("");
    const signedHeaders = Object.keys(headers)
      .sort()
      .map((k) => k.toLowerCase())
      .join(";");

    const payloadHash = headers["x-amz-content-sha256"];
    const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${createHash("sha256").update(canonicalRequest).digest("hex")}`;

    const signingKey = getSigningKey(secretKey, dateStamp, region);
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    headers["Authorization"] = authHeader;

    const resp = await fetch(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`S3 error ${resp.status}: ${text.slice(0, 200)}`);
    }

    if (rawResponse) {
      const buf = await resp.arrayBuffer();
      return new TextDecoder().decode(buf);
    }
    return await resp.text();
  }
}

function getSigningKey(secretKey: string, dateStamp: string, region: string): Buffer {
  const kDate = createHmac("sha256", `AWS4${secretKey}`).update(dateStamp).digest();
  const kRegion = createHmac("sha256", kDate).update(region).digest();
  const kService = createHmac("sha256", kRegion).update("s3").digest();
  return createHmac("sha256", kService).update("aws4_request").digest();
}
