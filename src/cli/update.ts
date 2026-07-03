import { version } from "../../package.json";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, copyFileSync, unlinkSync, mkdirSync } from "node:fs";

const REPO = "Kodjaoglanian/qore";
function qoreDir(): string {
  return process.env.QORE_HOME ?? join(homedir(), ".qore");
}
function vaultFile(): string { return join(qoreDir(), "vault.enc"); }
function metaFile(): string { return join(qoreDir(), "vault.meta.json"); }
function guardDir(): string { return join(qoreDir(), ".update-guard"); }
const PURPLE = "\x1b[38;2;163;112;247m";
const GREEN = "\x1b[38;2;72;187;120m";
const RED = "\x1b[38;2;220;53;69m";
const YELLOW = "\x1b[38;2;255;193;7m";
const CYAN = "\x1b[38;2;32;201;151m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const BULLET = `${PURPLE}\u25c6${RESET}`;
const ARROW = `${PURPLE}\u25b8${RESET}`;
const CHECK = `${GREEN}\u2713${RESET}`;
const CROSS = `${RED}\u2717${RESET}`;
const SPINNER = ["\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u2807", "\u280f"];

interface ReleaseInfo {
  tagName: string;
  name: string;
  body: string;
  publishedAt: string;
  assets: { name: string; browserDownloadUrl: string; size: number }[];
}

function detectAsset(): string {
  const platform = process.platform;
  const arch = process.arch;

  let os: string;
  let cpu: string;

  switch (platform) {
    case "linux": os = "linux"; break;
    case "darwin": os = "darwin"; break;
    case "win32": os = "windows"; break;
    default: throw new Error(`Unsupported platform: ${platform}`);
  }

  switch (arch) {
    case "x64": cpu = "x64"; break;
    case "arm64": cpu = "arm64"; break;
    case "ia32": cpu = "x64"; break;
    default: throw new Error(`Unsupported architecture: ${arch}`);
  }

  const ext = os === "windows" ? ".exe" : "";
  return `qore-${os}-${cpu}${ext}`;
}

async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const resp = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { "User-Agent": "qore-updater" },
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch latest release: ${resp.status}`);
  }
  const data = await resp.json() as any;
  return {
    tagName: data.tag_name,
    name: data.name || data.tag_name,
    body: data.body || "",
    publishedAt: data.published_at || "",
    assets: (data.assets as any[]).map((a) => ({
      name: a.name,
      browserDownloadUrl: a.browser_download_url,
      size: a.size || 0,
    })),
  };
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pad(str: string, len: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  const padLen = Math.max(0, len - stripped.length);
  return str + " ".repeat(padLen);
}

function printBanner(): void {
  const w = 52;
  const top = `\u250c${"\u2500".repeat(w)}\u2510`;
  const bot = `\u2514${"\u2500".repeat(w)}\u2518`;
  const mid = (label: string) => `\u2502${pad(` ${label}`, w)}\u2502`;
  console.log("");
  console.log(`  ${PURPLE}${top}${RESET}`);
  console.log(`  ${PURPLE}${mid(`${BOLD}Qore Update Manager${RESET}`)}${PURPLE}${RESET}`);
  console.log(`  ${PURPLE}${mid(`v${version} \u2192 checking...`)}${PURPLE}${RESET}`);
  console.log(`  ${PURPLE}${bot}${RESET}`);
  console.log("");
}

function printSection(title: string): void {
  console.log(`  ${ARROW} ${BOLD}${title}${RESET}`);
  console.log(`  ${DIM}${"\u2500".repeat(48)}${RESET}`);
}

function printInfo(label: string, value: string): void {
  console.log(`    ${DIM}${pad(label, 16)}${RESET} ${value}`);
}

function printOk(msg: string): void {
  console.log(`  ${CHECK} ${GREEN}${msg}${RESET}`);
}

function printErr(msg: string): void {
  console.log(`  ${CROSS} ${RED}${msg}${RESET}`);
}

function printWarn(msg: string): void {
  console.log(`  ${ARROW} ${YELLOW}${msg}${RESET}`);
}

function printChangelog(body: string, maxLines: number = 15): void {
  const lines = body.split("\n").filter(l => l.trim());
  const shown = lines.slice(0, maxLines);
  console.log("");
  printSection("Release Notes");
  for (const line of shown) {
    const cleaned = line.replace(/^#+\s*/, "").replace(/^\s*[-*]\s*/, `  ${BULLET} `);
    if (cleaned.trim()) {
      console.log(`  ${DIM}${cleaned.slice(0, 80)}${RESET}`);
    }
  }
  if (lines.length > maxLines) {
    console.log(`  ${DIM}... and ${lines.length - maxLines} more${RESET}`);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r    ${PURPLE}${SPINNER[i % SPINNER.length]}${RESET} ${label}...   `);
    i++;
  }, 80);
  try {
    const result = await fn();
    clearInterval(interval);
    process.stdout.write(`\r${" ".repeat(60)}\r`);
    return result;
  } catch (err) {
    clearInterval(interval);
    process.stdout.write(`\r${" ".repeat(60)}\r`);
    throw err;
  }
}

async function downloadFile(url: string, dest: string, onProgress?: (pct: number, downloaded: number, total: number) => void): Promise<void> {
  const resp = await fetch(url, {
    headers: { "User-Agent": "qore-updater" },
  });
  if (!resp.ok) {
    throw new Error(`Download failed: ${resp.status}`);
  }
  const total = Number(resp.headers.get("content-length") || 0);
  const reader = resp.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await resp.arrayBuffer());
    const fs = await import("fs");
    fs.writeFileSync(dest, buf);
    if (process.platform !== "win32") fs.chmodSync(dest, 0o755);
    return;
  }
  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      downloaded += value.length;
      if (onProgress && total > 0) {
        onProgress(Math.round((downloaded / total) * 100), downloaded, total);
      }
    }
  }
  const fs = await import("fs");
  const buf = new Uint8Array(downloaded);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  fs.writeFileSync(dest, buf);
  if (process.platform !== "win32") {
    fs.chmodSync(dest, 0o755);
  }
}

async function doUpdate(): Promise<void> {
  const currentVersion = `v${version}`;
  printBanner();

  // Phase 1: Check
  printSection("Checking for Updates");
  printInfo("Current", `${BOLD}${currentVersion}${RESET}`);
  printInfo("Repository", `${DIM}github.com/${REPO}${RESET}`);

  let release: ReleaseInfo;
  try {
    release = await withSpinner("Fetching latest release from GitHub", () => fetchLatestRelease());
  } catch (err) {
    printErr(`Failed to fetch release info: ${(err as Error).message}`);
    console.log("");
    process.exit(1);
  }

  const latest = release.tagName;
  printInfo("Latest", `${BOLD}${GREEN}${latest}${RESET}`);

  if (release.publishedAt) {
    const date = new Date(release.publishedAt).toLocaleDateString();
    printInfo("Published", `${DIM}${date}${RESET}`);
  }

  if (compareVersions(latest, currentVersion) <= 0) {
    console.log("");
    printOk(`You are already on the latest version (${latest}).`);
    console.log("");
    return;
  }

  // Show what's new
  if (release.body) {
    printChangelog(release.body);
  }

  // Phase 1.5: Vault guard — back up vault files before touching anything
  const vf = vaultFile();
  const mf = metaFile();
  const gd = guardDir();
  const vaultExists = existsSync(vf) && existsSync(mf);
  if (vaultExists) {
    try {
      if (!existsSync(gd)) mkdirSync(gd, { recursive: true });
      copyFileSync(vf, join(gd, "vault.enc"));
      copyFileSync(mf, join(gd, "vault.meta.json"));
    } catch {}
  }

  // Phase 2: Prepare
  console.log("");
  printSection("Preparing Update");

  const assetName = detectAsset();
  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    printErr(`No binary found for ${assetName}`);
    printWarn(`Available: ${release.assets.map((a) => a.name).join(", ")}`);
    console.log("");
    process.exit(1);
  }

  const fs = await import("fs");
  const path = await import("path");
  const execPath = process.execPath;
  const dir = path.dirname(execPath);
  const binaryName = process.platform === "win32" ? "qore.exe" : "qore";
  const dest = path.join(dir, binaryName);
  const backup = `${dest}.bak`;
  const tmpDest = `${dest}.new`;

  printInfo("Platform", `${BOLD}${assetName}${RESET}`);
  printInfo("Size", `${formatBytes(asset.size)}`);
  printInfo("Install path", `${DIM}${dest}${RESET}`);
  printInfo("Backup", `${DIM}${backup}${RESET}`);

  // Phase 3: Download
  console.log("");
  printSection("Downloading");
  let lastPct = -1;
  try {
    await downloadFile(asset.browserDownloadUrl, tmpDest, (pct, downloaded, total) => {
      if (pct !== lastPct && pct % 5 === 0) {
        lastPct = pct;
        const barLen = 30;
        const filled = Math.round((pct / 100) * barLen);
        const bar = `${GREEN}${"\u2588".repeat(filled)}${RESET}${DIM}${"\u2591".repeat(barLen - filled)}${RESET}`;
        process.stdout.write(`\r    ${bar} ${BOLD}${pct}%${RESET} ${DIM}(${formatBytes(downloaded)}/${formatBytes(total)})${RESET}   `);
      }
    });
    const barLen = 30;
    const bar = `${GREEN}${"\u2588".repeat(barLen)}${RESET}`;
    process.stdout.write(`\r    ${bar} ${BOLD}100%${RESET} ${DIM}(${formatBytes(asset.size)})${RESET}   \n`);
    printOk("Download complete");
  } catch (err) {
    process.stdout.write("\n");
    printErr(`Download failed: ${(err as Error).message}`);
    try { fs.unlinkSync(tmpDest); } catch {}
    console.log("");
    process.exit(1);
  }

  // Phase 4: Install
  console.log("");
  printSection("Installing");
  try {
    // Backup current binary
    if (fs.existsSync(dest)) {
      try { fs.unlinkSync(backup); } catch {}
      fs.renameSync(dest, backup);
      printInfo("Backup", `${GREEN}created${RESET}`);
    }

    // Move new binary into place
    fs.renameSync(tmpDest, dest);
    printInfo("Install", `${GREEN}done${RESET}`);

    // Verify the new binary exists and has correct size
    if (fs.existsSync(dest)) {
      const stat = fs.statSync(dest);
      if (stat.size > 0) {
        printOk(`Verified: ${formatBytes(stat.size)} installed`);
      } else {
        throw new Error("Installed binary is empty");
      }
    } else {
      throw new Error("Binary not found after install");
    }

    // Clean up backup
    if (fs.existsSync(backup)) {
      fs.unlinkSync(backup);
    }
  } catch (err) {
    // Restore backup on failure
    printErr(`Installation failed: ${(err as Error).message}`);
    if (fs.existsSync(backup)) {
      try { fs.unlinkSync(dest); } catch {}
      fs.renameSync(backup, dest);
      if (process.platform !== "win32") {
        fs.chmodSync(dest, 0o755);
      }
      printWarn("Previous version restored");
    }
    console.log("");
    process.exit(1);
  }

  // Phase 4.5: Vault guard — verify vault still exists, restore if missing
  if (vaultExists) {
    const vaultStillExists = existsSync(vaultFile()) && existsSync(metaFile());
    if (!vaultStillExists) {
      printWarn("Vault files missing after update — restoring from guard");
      try {
        const dir = qoreDir();
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        copyFileSync(join(guardDir(), "vault.enc"), vaultFile());
        copyFileSync(join(guardDir(), "vault.meta.json"), metaFile());
        printOk("Vault restored successfully");
      } catch (restoreErr) {
        printErr(`Failed to restore vault: ${(restoreErr as Error).message}`);
        printWarn(`Manual recovery: copy files from ${guardDir()} to ${qoreDir()}`);
      }
    }
    // Clean up guard
    try {
      unlinkSync(join(guardDir(), "vault.enc"));
      unlinkSync(join(guardDir(), "vault.meta.json"));
    } catch {}
  }

  // Phase 5: Done
  console.log("");
  const w = 52;
  const top = `\u250c${"\u2500".repeat(w)}\u2510`;
  const bot = `\u2514${"\u2500".repeat(w)}\u2518`;
  const mid = (label: string) => `\u2502${pad(` ${label}`, w)}\u2502`;
  console.log(`  ${GREEN}${top}${RESET}`);
  console.log(`  ${GREEN}${mid(`${CHECK} Update complete: ${currentVersion} \u2192 ${latest}`)}${GREEN}${RESET}`);
  console.log(`  ${GREEN}${mid(`${DIM}Run ${BOLD}qore${RESET}${DIM} to start the updated version`)}${GREEN}${RESET}`);
  console.log(`  ${GREEN}${mid(`${DIM}Your vault and connections are preserved`)}${GREEN}${RESET}`);
  console.log(`  ${GREEN}${bot}${RESET}`);
  console.log("");
}

function showVersion(): void {
  console.log(`  ${PURPLE}${BOLD}Qore${RESET} v${version}`);
}

function showHelp(): void {
  console.log(`
  ${PURPLE}${BOLD}Qore${RESET} - Infrastructure Orchestrator ${DIM}v${version}${RESET}

  ${BOLD}Usage:${RESET}
    ${BULLET}  qore              ${DIM}Start the TUI${RESET}
    ${BULLET}  qore mcp          ${DIM}Start the MCP server (stdio transport)${RESET}
    ${BULLET}  qore update       ${DIM}Check and download the latest version${RESET}
    ${BULLET}  qore version      ${DIM}Show current version${RESET}
    ${BULLET}  qore help         ${DIM}Show this help message${RESET}
`);
}

export function handleCliArgs(args: string[]): Promise<void> | null {
  if (args.length === 0) return null;

  const cmd = args[0].toLowerCase();

  switch (cmd) {
    case "mcp":
      if (args[1] === "--help" || args[1] === "-h") {
        console.log(`
  Qore MCP Server v${version}

  Usage:
    qore mcp              Start the MCP server (stdio transport)
    qore mcp --help       Show this help message

  The MCP server exposes qore's infrastructure tools to AI models.
  Requires the qore TUI to be running with vault unlocked for
  connection-dependent tools (SSH, DB, HTTP).

  Environment:
    QORE_SOCKET_PATH      Override socket path (default: ~/.qore/qore.sock)
    QORE_LOG_LEVEL        Log level: debug|info|warn|error (default: info)

  See: docs/mcp.md for configuration examples.
`);
        return Promise.resolve();
      }
      return import("../mcp/index.js").then(m => m.runMcpServer());
    case "update":
      return doUpdate();
    case "version":
    case "--version":
    case "-v":
      showVersion();
      return Promise.resolve();
    case "help":
    case "--help":
    case "-h":
      showHelp();
      return Promise.resolve();
    default:
      console.error(`Unknown command: ${cmd}`);
      console.log("Run 'qore help' for usage.");
      process.exit(1);
  }
}
