import type { ConnectionConfig } from "../vault/types.js";
import type { ConnectionManager, QuickStatus } from "./manager.js";

export interface VmSummary {
  vm: string;
  name: string;
  power_state: string;
  cpu_count: number;
  memory_size_MiB: number;
}

export interface VmDetail {
  name: string;
  power_state: string;
  hardware: {
    memory_size_MiB: number;
    cpu: { count: number };
  };
  guest?: {
    os_type?: string;
    ip_address?: string;
    host_name?: string;
  };
}

export interface HostSummary {
  host: string;
  name: string;
  connection_state: string;
  power_state: string;
  cpu: { cores: number; used?: number };
  memory: { size_MiB: number; used?: number };
}

export interface DatastoreSummary {
  datastore: string;
  name: string;
  type: string;
  free_space: number;
  capacity: number;
}

export interface NetworkSummary {
  network: string;
  name: string;
  type: string;
}

export interface SnapshotSummary {
  snapshot: string;
  name: string;
  description?: string;
  create_time?: string;
  vm_snapshot_state?: string;
}

export interface SnapshotTree {
  snapshot: string;
  name: string;
  description?: string;
  create_time?: string;
  vm_snapshot_state?: string;
  child_snapshots?: SnapshotTree[];
}

export interface TaskInfo {
  status: string;
  progress?: number;
  description?: string;
  start_time?: string;
  completion_time?: string;
  error?: { messages?: { default_message?: string }[] };
}

export class VmwareManager implements ConnectionManager {
  lastError: string | null = null;
  private sessionCache: Map<string, string> = new Map();

  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      this.lastError = null;
      const token = await this.getSession(config);
      return !!token;
    } catch (err) {
      this.lastError = (err as Error).message;
      return false;
    }
  }

  async getInfo(config: ConnectionConfig): Promise<Record<string, string>> {
    try {
      const about = await this.apiGet(config, "/api/vcenter/about");
      const inst = about?.instance ?? {};
      return {
        product: inst.product ?? "VMware vCenter",
        version: inst.version ?? "unknown",
        build: inst.build ?? "unknown",
        host: config.host,
      };
    } catch {
      return {};
    }
  }

  async quickStatus(config: ConnectionConfig): Promise<QuickStatus> {
    const start = Date.now();
    try {
      const ok = await this.testConnection(config);
      const latency = Date.now() - start;
      return {
        online: ok,
        info: ok ? "vCenter online" : this.lastError ?? "offline",
        latency,
      };
    } catch {
      return { online: false, info: this.lastError ?? "offline" };
    }
  }

  async getLogs(config: ConnectionConfig, opts?: { tail?: number }): Promise<string[]> {
    const tail = opts?.tail ?? 100;
    try {
      const data = await this.apiGet(config, `/api/vcenter/events?size=${tail}`);
      const items = data?.items ?? [];
      const lines: string[] = [];
      for (const e of items) {
        const time = e.created_time ?? "";
        const text = e.full_format ?? e.event_type ?? "event";
        lines.push(`  ${time}  ${String(text).slice(0, 200)}`);
      }
      return lines.length > 0 ? lines : ["  No recent events"];
    } catch {
      try {
        const about = await this.apiGet(config, "/api/vcenter/about");
        return [
          `  Product: ${about?.instance?.product ?? "vCenter"}`,
          `  Version: ${about?.instance?.version ?? "unknown"}`,
          "  (Events API not available on this vCenter version)",
        ];
      } catch {
        return ["  Unable to retrieve logs"];
      }
    }
  }

  async listVms(config: ConnectionConfig): Promise<VmSummary[]> {
    const data = await this.apiGet(config, "/api/vcenter/vm");
    return data?.value ?? [];
  }

  async getVm(config: ConnectionConfig, vmId: string): Promise<VmDetail> {
    return await this.apiGet(config, `/api/vcenter/vm/${vmId}`);
  }

  async powerOn(config: ConnectionConfig, vmId: string): Promise<string | null> {
    const resp = await this.apiPost(config, `/api/vcenter/vm/${vmId}/power?action=start`, null);
    return resp?.value ?? null;
  }

  async powerOff(config: ConnectionConfig, vmId: string): Promise<string | null> {
    const resp = await this.apiPost(config, `/api/vcenter/vm/${vmId}/power?action=stop`, null);
    return resp?.value ?? null;
  }

  async resetVm(config: ConnectionConfig, vmId: string): Promise<string | null> {
    const resp = await this.apiPost(config, `/api/vcenter/vm/${vmId}/power?action=reset`, null);
    return resp?.value ?? null;
  }

  async suspendVm(config: ConnectionConfig, vmId: string): Promise<string | null> {
    const resp = await this.apiPost(config, `/api/vcenter/vm/${vmId}/power?action=suspend`, null);
    return resp?.value ?? null;
  }

  async listHosts(config: ConnectionConfig): Promise<HostSummary[]> {
    const data = await this.apiGet(config, "/api/vcenter/host");
    return data?.value ?? [];
  }

  async getHost(config: ConnectionConfig, hostId: string): Promise<Record<string, unknown>> {
    return await this.apiGet(config, `/api/vcenter/host/${hostId}`);
  }

  async listDatastores(config: ConnectionConfig): Promise<DatastoreSummary[]> {
    const data = await this.apiGet(config, "/api/vcenter/datastore");
    return data?.value ?? [];
  }

  async listNetworks(config: ConnectionConfig): Promise<NetworkSummary[]> {
    const data = await this.apiGet(config, "/api/vcenter/network");
    return data?.value ?? [];
  }

  async listSnapshots(config: ConnectionConfig, vmId: string): Promise<SnapshotTree | null> {
    const data = await this.apiGet(config, `/api/vcenter/vm/${vmId}/snapshots`);
    return data?.value ?? null;
  }

  async createSnapshot(
    config: ConnectionConfig,
    vmId: string,
    name: string,
    description?: string,
  ): Promise<string | null> {
    const body = JSON.stringify({ name, description: description ?? "" });
    const resp = await this.apiPost(config, `/api/vcenter/vm/${vmId}/snapshots`, body);
    return resp?.value ?? null;
  }

  async revertSnapshot(
    config: ConnectionConfig,
    vmId: string,
    snapshotId: string,
  ): Promise<string | null> {
    const resp = await this.apiPost(
      config,
      `/api/vcenter/vm/${vmId}/snapshots/${snapshotId}/revert`,
      null,
    );
    return resp?.value ?? null;
  }

  async deleteSnapshot(
    config: ConnectionConfig,
    vmId: string,
    snapshotId: string,
  ): Promise<string | null> {
    const resp = await this.apiDelete(
      config,
      `/api/vcenter/vm/${vmId}/snapshots/${snapshotId}`,
    );
    return resp?.value ?? null;
  }

  async getTask(config: ConnectionConfig, taskId: string): Promise<TaskInfo> {
    return await this.apiGet(config, `/api/cis/tasks/${taskId}`);
  }

  private baseUrl(config: ConnectionConfig): string {
    const proto = config.useTls ? "https" : "http";
    return `${proto}://${config.host}:${config.port}`;
  }

  private applyTlsConfig(config: ConnectionConfig): void {
    if (config.extra?.insecure === "true" || config.extra?.insecure === "yes") {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  }

  private async getSession(config: ConnectionConfig): Promise<string> {
    const cacheKey = config.id;
    const cached = this.sessionCache.get(cacheKey);
    if (cached) return cached;

    const url = `${this.baseUrl(config)}/api/session`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    if (config.username && config.password) {
      const cred = btoa(`${config.username}:${config.password}`);
      headers["Authorization"] = `Basic ${cred}`;
    } else {
      throw new Error("VMware connection requires username and password");
    }

    this.applyTlsConfig(config);

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: "",
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`vCenter auth failed (${resp.status}): ${text.slice(0, 200)}`);
    }

    let token: string;
    try {
      token = await resp.json();
    } catch {
      const text = await resp.text();
      token = text.replace(/^"|"$/g, "");
    }

    if (!token || typeof token !== "string") {
      throw new Error("vCenter auth returned empty session token");
    }

    this.sessionCache.set(cacheKey, token);
    return token;
  }

  private async apiGet(config: ConnectionConfig, path: string): Promise<any> {
    return this.apiWithRetry(config, path, "GET");
  }

  private async apiPost(
    config: ConnectionConfig,
    path: string,
    body: string | null,
  ): Promise<any> {
    return this.apiWithRetry(config, path, "POST", body);
  }

  private async apiDelete(config: ConnectionConfig, path: string): Promise<any> {
    return this.apiWithRetry(config, path, "DELETE");
  }

  private async apiWithRetry(
    config: ConnectionConfig,
    path: string,
    method: string,
    body?: string | null,
  ): Promise<any> {
    let token = await this.getSession(config);
    let resp = await this.rawRequest(config, path, method, token, body);

    if (resp.status === 401) {
      this.sessionCache.delete(config.id);
      token = await this.getSession(config);
      resp = await this.rawRequest(config, path, method, token, body);
    }

    if (resp.status === 204) return null;

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`vCenter ${method} ${path} failed (${resp.status}): ${text.slice(0, 200)}`);
    }

    const ct = resp.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return await resp.json();
    }
    const text = await resp.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private async rawRequest(
    config: ConnectionConfig,
    path: string,
    method: string,
    token: string,
    body?: string | null,
  ): Promise<Response> {
    const url = `${this.baseUrl(config)}${path}`;
    this.applyTlsConfig(config);
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "vmware-api-session-id": token,
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }
    return await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
    });
  }

  clearSession(configId: string): void {
    this.sessionCache.delete(configId);
  }
}
