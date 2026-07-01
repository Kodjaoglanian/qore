import type { ConnectionConfig } from "../vault/types.js";
import type { ConnectionManager } from "./manager.js";

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface HttpEndpoint {
  method: string;
  path: string;
  description: string;
}

export class HttpManager implements ConnectionManager {
  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      const url = this.buildUrl(config, "/");
      const resp = await this.request(config, "GET", url);
      return resp.status >= 200 && resp.status < 500;
    } catch {
      return false;
    }
  }

  async getInfo(config: ConnectionConfig): Promise<Record<string, string>> {
    try {
      const url = this.buildUrl(config, "/");
      const resp = await this.request(config, "GET", url);
      return {
        status: String(resp.status),
        statusText: resp.statusText,
        server: resp.headers["server"] ?? "unknown",
        contentType: resp.headers["content-type"] ?? "unknown",
      };
    } catch {
      return {};
    }
  }

  async get(config: ConnectionConfig, path: string): Promise<HttpResponse> {
    const url = this.buildUrl(config, path);
    return this.request(config, "GET", url);
  }

  async post(config: ConnectionConfig, path: string, body: string): Promise<HttpResponse> {
    const url = this.buildUrl(config, path);
    return this.request(config, "POST", url, body);
  }

  async put(config: ConnectionConfig, path: string, body: string): Promise<HttpResponse> {
    const url = this.buildUrl(config, path);
    return this.request(config, "PUT", url, body);
  }

  async patch(config: ConnectionConfig, path: string, body: string): Promise<HttpResponse> {
    const url = this.buildUrl(config, path);
    return this.request(config, "PATCH", url, body);
  }

  async delete(config: ConnectionConfig, path: string): Promise<HttpResponse> {
    const url = this.buildUrl(config, path);
    return this.request(config, "DELETE", url);
  }

  private buildUrl(config: ConnectionConfig, path: string): string {
    const protocol = config.useTls ? "https" : "http";
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${protocol}://${config.host}:${config.port}${cleanPath}`;
  }

  private async request(
    config: ConnectionConfig,
    method: string,
    url: string,
    body?: string,
  ): Promise<HttpResponse> {
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };

    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    } else if (config.username && config.password) {
      const cred = btoa(`${config.username}:${config.password}`);
      headers["Authorization"] = `Basic ${cred}`;
    }

    if (config.extra) {
      for (const [k, v] of Object.entries(config.extra)) {
        headers[k] = v;
      }
    }

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const resp = await fetch(url, { method, headers, body: body ?? undefined });
    const respHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => { respHeaders[k] = v; });
    const respBody = await resp.text();

    return {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
      body: respBody,
    };
  }

  async getLogs(config: ConnectionConfig, opts?: { tail?: number }): Promise<string[]> {
    const tail = opts?.tail ?? 100;
    const lines: string[] = [];
    for (const path of ["/logs", "/log", "/health", "/status"]) {
      try {
        const url = this.buildUrl(config, path);
        const resp = await this.request(config, "GET", url);
        lines.push(`  === ${path} (${resp.status}) ===`);
        const bodyLines = resp.body.split("\n").slice(0, tail);
        for (const line of bodyLines) {
          if (line.trim()) lines.push(`  ${line.slice(0, 200)}`);
        }
        if (lines.length > 2) break;
      } catch {}
    }
    return lines.length > 0 ? lines : ["  No logs endpoint found"];
  }
}
