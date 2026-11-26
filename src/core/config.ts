import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type ThemeName = "torlink" | "cyber" | "emerald" | "amber" | "rose";

export interface QoreConfig {
  theme: ThemeName;
  autoProbeOnStart: boolean;
}

const DEFAULT_CONFIG: QoreConfig = {
  theme: "torlink",
  autoProbeOnStart: true,
};

function qoreDir(): string {
  return process.env.QORE_HOME ?? join(homedir(), ".qore");
}

function configFile(): string {
  return join(qoreDir(), "config.json");
}

export function loadConfig(): QoreConfig {
  try {
    const file = configFile();
    if (!existsSync(file)) return { ...DEFAULT_CONFIG };
    const raw = readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(partial: Partial<QoreConfig>): QoreConfig {
  const next = { ...loadConfig(), ...partial };
  try {
    const dir = qoreDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(configFile(), JSON.stringify(next, null, 2), "utf-8");
  } catch {
    // never crash on config write
  }
  return next;
}
