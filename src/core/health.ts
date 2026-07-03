import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

const QORE_DIR = join(homedir(), ".qore");
const HEALTH_FILE = join(QORE_DIR, "health.json");

export interface HealthCheck {
  id: string;
  connId: string;
  connName: string;
  connType: string;
  timestamp: string;
  online: boolean;
  latency: number;
  message: string;
}

export interface HealthConfig {
  intervalSec: number;
  maxHistory: number;
}

const DEFAULT_CONFIG: HealthConfig = {
  intervalSec: 30,
  maxHistory: 50,
};

interface HealthData {
  config: HealthConfig;
  checks: HealthCheck[];
}

export function loadHealthData(): HealthData {
  try {
    if (!existsSync(HEALTH_FILE)) return { config: DEFAULT_CONFIG, checks: [] };
    const data = readFileSync(HEALTH_FILE, "utf-8");
    const parsed = JSON.parse(data);
    return {
      config: { ...DEFAULT_CONFIG, ...parsed.config },
      checks: Array.isArray(parsed.checks) ? parsed.checks : [],
    };
  } catch {
    return { config: DEFAULT_CONFIG, checks: [] };
  }
}

export function saveHealthData(data: HealthData): void {
  try {
    if (!existsSync(QORE_DIR)) mkdirSync(QORE_DIR, { recursive: true });
    writeFileSync(HEALTH_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

export function addHealthCheck(check: Omit<HealthCheck, "id">): HealthCheck {
  const data = loadHealthData();
  const fullCheck: HealthCheck = {
    ...check,
    id: randomUUID(),
  };
  data.checks.push(fullCheck);
  // Trim to maxHistory per connection
  const byConn: Record<string, HealthCheck[]> = {};
  for (const c of data.checks) {
    if (!byConn[c.connId]) byConn[c.connId] = [];
    byConn[c.connId].push(c);
  }
  data.checks = [];
  for (const connId of Object.keys(byConn)) {
    const checks = byConn[connId];
    const trimmed = checks.slice(-data.config.maxHistory);
    data.checks.push(...trimmed);
  }
  data.checks.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  saveHealthData(data);
  return fullCheck;
}

export function getHealthHistory(connId: string): HealthCheck[] {
  const data = loadHealthData();
  return data.checks.filter((c) => c.connId === connId);
}

export function getAllHealthHistory(): HealthCheck[] {
  return loadHealthData().checks;
}

export function getHealthConfig(): HealthConfig {
  return loadHealthData().config;
}

export function setHealthConfig(config: Partial<HealthConfig>): HealthConfig {
  const data = loadHealthData();
  data.config = { ...data.config, ...config };
  saveHealthData(data);
  return data.config;
}

export function clearHealthHistory(connId?: string): void {
  const data = loadHealthData();
  if (connId) {
    data.checks = data.checks.filter((c) => c.connId !== connId);
  } else {
    data.checks = [];
  }
  saveHealthData(data);
}

export function renderSparkline(values: number[], maxLen: number = 20): string {
  if (values.length === 0) return "";
  const trimmed = values.slice(-maxLen);
  const max = Math.max(...trimmed, 1);
  const min = Math.min(...trimmed, 0);
  const range = max - min || 1;
  const chars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  return trimmed.map((v) => {
    const normalized = (v - min) / range;
    const idx = Math.min(chars.length - 1, Math.floor(normalized * chars.length));
    return chars[idx];
  }).join("");
}
