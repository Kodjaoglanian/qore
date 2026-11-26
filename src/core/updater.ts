import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { version as currentPkgVersion } from "../../package.json";

const REPO = "Kodjaoglanian/qore";
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface UpdateInfo {
  current: string;
  latest: string;
  available: boolean;
  url: string;
  publishedAt?: string;
  checkedAt: number;
  fromCache: boolean;
}

interface UpdateCache {
  checkedAt: number;
  latest: string;
  url: string;
  publishedAt?: string;
}

export type ReleaseFetcher = () => Promise<{ tagName: string; url: string; publishedAt?: string }>;

function qoreDir(): string {
  return process.env.QORE_HOME ?? join(homedir(), ".qore");
}
function cacheFile(): string {
  return join(qoreDir(), "update-check.json");
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v.replace(/^v/, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function readCache(): UpdateCache | null {
  try {
    if (!existsSync(cacheFile())) return null;
    const parsed = JSON.parse(readFileSync(cacheFile(), "utf-8"));
    if (typeof parsed.checkedAt === "number" && typeof parsed.latest === "string") {
      return parsed as UpdateCache;
    }
  } catch {}
  return null;
}

function writeCache(cache: UpdateCache): void {
  try {
    if (!existsSync(qoreDir())) mkdirSync(qoreDir(), { recursive: true });
    writeFileSync(cacheFile(), JSON.stringify(cache, null, 2), "utf-8");
  } catch {}
}

async function defaultFetcher() {
  const resp = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { "User-Agent": "qore-updater", Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
  const data = (await resp.json()) as any;
  return {
    tagName: String(data.tag_name),
    url: String(data.html_url ?? `https://github.com/${REPO}/releases/latest`),
    publishedAt: data.published_at as string | undefined,
  };
}

function build(cache: UpdateCache, current: string, fromCache: boolean): UpdateInfo {
  return {
    current,
    latest: cache.latest,
    available: compareVersions(cache.latest, current) > 0,
    url: cache.url,
    publishedAt: cache.publishedAt,
    checkedAt: cache.checkedAt,
    fromCache,
  };
}

/**
 * Checks GitHub for a newer release. Uses an on-disk cache (6h) to avoid
 * hammering the API. Never throws — returns null if offline / rate limited.
 */
export async function checkForUpdate(opts: {
  force?: boolean;
  currentVersion?: string;
  fetcher?: ReleaseFetcher;
  now?: number;
} = {}): Promise<UpdateInfo | null> {
  const current = opts.currentVersion ?? currentPkgVersion;
  const now = opts.now ?? Date.now();
  const cached = readCache();

  if (!opts.force && cached && now - cached.checkedAt < UPDATE_CHECK_INTERVAL_MS) {
    return build(cached, current, true);
  }

  try {
    const rel = await (opts.fetcher ?? defaultFetcher)();
    const fresh: UpdateCache = {
      checkedAt: now,
      latest: rel.tagName,
      url: rel.url,
      publishedAt: rel.publishedAt,
    };
    writeCache(fresh);
    return build(fresh, current, false);
  } catch {
    return cached ? build(cached, current, true) : null;
  }
}
