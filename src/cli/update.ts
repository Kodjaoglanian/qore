import { version } from "../../package.json";

const REPO = "Kodjaoglanian/qore";

interface ReleaseInfo {
  tagName: string;
  assets: { name: string; browserDownloadUrl: string }[];
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
    case "ia32":
    case "x32": cpu = "x64"; break;
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
    assets: (data.assets as any[]).map((a) => ({
      name: a.name,
      browserDownloadUrl: a.browser_download_url,
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

async function downloadFile(url: string, dest: string): Promise<void> {
  const resp = await fetch(url, {
    headers: { "User-Agent": "qore-updater" },
  });
  if (!resp.ok) {
    throw new Error(`Download failed: ${resp.status}`);
  }
  const buf = new Uint8Array(await resp.arrayBuffer());
  const fs = await import("fs");
  fs.writeFileSync(dest, buf);
  if (process.platform !== "win32") {
    fs.chmodSync(dest, 0o755);
  }
}

async function doUpdate(): Promise<void> {
  const currentVersion = `v${version}`;
  console.log("");
  console.log("  Qore - Infrastructure Orchestrator");
  console.log(`  Current version: ${currentVersion}`);
  console.log("  Checking for updates...");

  try {
    const release = await fetchLatestRelease();
    const latest = release.tagName;

    if (compareVersions(latest, currentVersion) <= 0) {
      console.log(`  You are already on the latest version (${latest}).`);
      console.log("");
      return;
    }

    console.log(`  New version available: ${latest}`);
    console.log("  Downloading...");

    const assetName = detectAsset();
    const asset = release.assets.find((a) => a.name === assetName);
    if (!asset) {
      throw new Error(`No binary found for ${assetName}. Available: ${release.assets.map((a) => a.name).join(", ")}`);
    }

    const fs = await import("fs");
    const path = await import("path");
    const execPath = process.execPath;
    const dir = path.dirname(execPath);
    const binaryName = process.platform === "win32" ? "qore.exe" : "qore";
    const dest = path.join(dir, binaryName);

    // Backup current binary
    const backup = `${dest}.bak`;
    if (fs.existsSync(dest)) {
      fs.copyFileSync(dest, backup);
    }

    try {
      await downloadFile(asset.browserDownloadUrl, dest);
      if (fs.existsSync(backup)) {
        fs.unlinkSync(backup);
      }
      console.log("");
      console.log(`  Updated to ${latest} successfully.`);
      console.log(`  Installed to: ${dest}`);
      console.log("");
    } catch (err) {
      // Restore backup on failure
      if (fs.existsSync(backup)) {
        fs.copyFileSync(backup, dest);
        if (process.platform !== "win32") {
          fs.chmodSync(dest, 0o755);
        }
      }
      throw err;
    }
  } catch (err) {
    console.error(`  Update failed: ${(err as Error).message}`);
    console.log("");
    process.exit(1);
  }
}

function showVersion(): void {
  console.log(`qore ${version}`);
}

function showHelp(): void {
  console.log(`
  Qore - Infrastructure Orchestrator v${version}

  Usage:
    qore              Start the TUI
    qore update       Check and download the latest version
    qore version      Show current version
    qore help         Show this help message
`);
}

export function handleCliArgs(args: string[]): Promise<void> | null {
  if (args.length === 0) return null;

  const cmd = args[0].toLowerCase();

  switch (cmd) {
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
