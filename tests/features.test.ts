import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { colors, setActiveTheme, cycleTheme, getActiveTheme, latencyColor, percentColor } from "../src/ui/theme.js";
import { loadConfig, saveConfig } from "../src/core/config.js";
import { renderMeterString, fuzzyMatch } from "../src/ui/utils.js";
import { LocalS3Provider } from "../src/core/providers/localS3.js";
import { LocalPubSub } from "../src/core/providers/messaging.js";
import { addHealthCheck, getHealthHistory, setHealthConfig, getHealthConfig, clearHealthHistory, renderSparkline } from "../src/core/health.js";
import { createWindowsStdinBridge } from "../src/ui/stdin-bridge.js";
import { parseWindowsNetstat } from "../src/core/probe/network.js";
import { parseSshMetrics, getOverlayLineColor, SSH_COMMANDS } from "../src/ui/service-helpers.js";
import { EventEmitter } from "node:events";
import { compareVersions, checkForUpdate } from "../src/core/updater.js";

const TEST_HOME = join(tmpdir(), `qore-features-test-${Date.now()}`);

beforeAll(() => {
  process.env.QORE_HOME = TEST_HOME;
  if (!existsSync(TEST_HOME)) mkdirSync(TEST_HOME, { recursive: true });
});

afterAll(() => {
  setActiveTheme("torlink");
  delete process.env.QORE_HOME;
  if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true, force: true });
});

describe("Theme & Config System", () => {
  it("switches and cycles TrueColor themes while keeping torlink default", () => {
    expect(getActiveTheme()).toBe("torlink");
    expect(colors.purple).toBe("#A370F7");

    expect(setActiveTheme("cyber")).toBe(true);
    expect(getActiveTheme()).toBe("cyber");
    expect(colors.purple).toBe("#38BDF8");

    const next = cycleTheme();
    expect(next).toBe("emerald");
    expect(colors.purple).toBe("#34D399");

    setActiveTheme("torlink");
    expect(colors.purple).toBe("#A370F7");
  });

  it("persists config to QORE_HOME/config.json", () => {
    const initial = loadConfig();
    expect(initial.theme).toBe("torlink");

    saveConfig({ theme: "amber", autoProbeOnStart: false });
    const reloaded = loadConfig();
    expect(reloaded.theme).toBe("amber");
    expect(reloaded.autoProbeOnStart).toBe(false);
  });

  it("maps latency and percentage thresholds to semantic status colors", () => {
    setActiveTheme("torlink");
    expect(latencyColor(20)).toBe(colors.green);
    expect(latencyColor(150)).toBe(colors.yellow);
    expect(latencyColor(400)).toBe(colors.red);

    expect(percentColor(40)).toBe(colors.green);
    expect(percentColor(75)).toBe(colors.yellow);
    expect(percentColor(95)).toBe(colors.red);
  });
});

describe("UI Helpers", () => {
  it("renderMeterString produces fixed-width smooth bars", () => {
    expect(renderMeterString(0, 10)).toBe("░░░░░░░░░░");
    expect(renderMeterString(100, 10)).toBe("██████████");
    expect(renderMeterString(50, 10).length).toBe(10);
  });

  it("fuzzyMatch scores prefix matches higher than subsequence matches", () => {
    const prefix = fuzzyMatch("dash", "Dashboard");
    const subseq = fuzzyMatch("dsh", "Dashboard");
    const miss = fuzzyMatch("xyz", "Dashboard");

    expect(prefix.match).toBe(true);
    expect(subseq.match).toBe(true);
    expect(miss.match).toBe(false);
    expect(prefix.score).toBeGreaterThan(subseq.score);
  });
});

describe("LocalS3Provider", () => {
  it("creates buckets, uploads, downloads, lists, and deletes files", async () => {
    const s3 = new LocalS3Provider();
    await s3.createBucket("assets");
    const buckets = await s3.listBuckets();
    expect(buckets.some((b) => b.name === "assets")).toBe(true);

    const payload = Buffer.from("hello qore s3");
    await s3.uploadFile("assets", "hello.txt", payload);

    const files = await s3.listFiles("assets");
    expect(files.length).toBe(1);
    expect(files[0].key).toBe("hello.txt");
    expect(files[0].sizeBytes).toBe(payload.length);

    const downloaded = await s3.downloadFile("assets", "hello.txt");
    expect(downloaded.toString("utf-8")).toBe("hello qore s3");

    await s3.deleteFile("assets", "hello.txt");
    expect((await s3.listFiles("assets")).length).toBe(0);

    await s3.deleteBucket("assets");
    expect((await s3.listBuckets()).some((b) => b.name === "assets")).toBe(false);
    s3.close();
  });
});

describe("LocalPubSub", () => {
  it("publishes messages to subscribers and supports unsubscribe", async () => {
    const pubsub = new LocalPubSub();
    const received: string[] = [];

    const subId = await pubsub.subscribe("deploys", (msg) => {
      received.push(msg.toString("utf-8"));
    });

    await pubsub.publish("deploys", Buffer.from("v1.0.0"));
    expect(received).toEqual(["v1.0.0"]);
    expect(await pubsub.listTopics()).toContain("deploys");

    await pubsub.unsubscribe(subId);
    await pubsub.publish("deploys", Buffer.from("v1.0.1"));
    expect(received).toEqual(["v1.0.0"]);
  });
});

describe("Health Monitor", () => {
  it("stores checks, renders sparklines, and updates config", () => {
    clearHealthHistory();
    addHealthCheck({
      connId: "c1",
      connName: "Redis Prod",
      connType: "redis",
      timestamp: new Date().toISOString(),
      online: true,
      latency: 12,
      message: "PONG",
    });
    addHealthCheck({
      connId: "c1",
      connName: "Redis Prod",
      connType: "redis",
      timestamp: new Date().toISOString(),
      online: true,
      latency: 48,
      message: "PONG",
    });

    const hist = getHealthHistory("c1");
    expect(hist.length).toBe(2);

    const spark = renderSparkline([10, 30, 80, 20]);
    expect(spark.length).toBe(4);

    setHealthConfig({ intervalSec: 15 });
    expect(getHealthConfig().intervalSec).toBe(15);
    clearHealthHistory();
  });
});

describe("Windows Compatibility", () => {
  it("createWindowsStdinBridge delivers data events through readable + read()", () => {
    const emitter = new EventEmitter();
    let rawModeEnabled = false;
    let resumed = false;
    const mockSource = {
      isTTY: true,
      setRawMode(mode: boolean) { rawModeEnabled = mode; },
      resume() { resumed = true; },
      pause() { resumed = false; },
      on(ev: "data", fn: (chunk: Buffer | string) => void) { emitter.on(ev, fn); },
    };

    const bridge = createWindowsStdinBridge(mockSource);
    expect(rawModeEnabled).toBe(true);
    expect(resumed).toBe(true);
    expect(bridge.isTTY).toBe(true);

    const chunks: string[] = [];
    bridge.setEncoding("utf8");
    bridge.addListener("readable", () => {
      let chunk: string | null;
      while ((chunk = bridge.read() as string | null) !== null) {
        chunks.push(chunk);
      }
    });
    // Simulate Ink calling resume() after attaching 'readable'
    bridge.resume();

    emitter.emit("data", Buffer.from("discover\r"));
    expect(chunks.join("")).toBe("discover\r");
  });

  it("parseWindowsNetstat extracts listening ports cleanly", () => {
    const sample = [
      "Active Connections",
      "  Proto  Local Address          Foreign Address        State           PID",
      "  TCP    0.0.0.0:5432           0.0.0.0:0              LISTENING       1234",
      "  TCP    127.0.0.1:6379         0.0.0.0:0              LISTENING       5678",
      "  TCP    127.0.0.1:50000        1.2.3.4:443            ESTABLISHED     9999",
    ].join("\r\n");

    const ports = parseWindowsNetstat(sample);
    expect(ports.length).toBe(2);
    expect(ports[0].port).toBe(5432);
    expect(ports[0].service).toBe("PostgreSQL");
    expect(ports[1].port).toBe(6379);
    expect(ports[1].service).toBe("Redis");
  });
});

describe("Update Detection", () => {
  it("compareVersions handles v-prefix, uneven lengths and numeric ordering", () => {
    expect(compareVersions("v0.14.3", "0.14.2")).toBe(1);
    expect(compareVersions("0.14.3", "v0.14.3")).toBe(0);
    expect(compareVersions("v0.9.0", "v0.14.0")).toBe(-1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });

  it("checkForUpdate detects a newer release, caches it, and avoids refetching", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { tagName: "v9.9.9", url: "https://example.com/r" };
    };

    const first = await checkForUpdate({ force: true, currentVersion: "0.14.3", fetcher });
    expect(first?.available).toBe(true);
    expect(first?.latest).toBe("v9.9.9");
    expect(first?.fromCache).toBe(false);

    const second = await checkForUpdate({ currentVersion: "0.14.3", fetcher });
    expect(second?.available).toBe(true);
    expect(second?.fromCache).toBe(true);
    expect(calls).toBe(1);
  });

  it("checkForUpdate reports up-to-date and survives network failure using cache", async () => {
    const same = await checkForUpdate({
      force: true,
      currentVersion: "9.9.9",
      fetcher: async () => ({ tagName: "v9.9.9", url: "u" }),
    });
    expect(same?.available).toBe(false);

    const offline = await checkForUpdate({
      force: true,
      currentVersion: "0.1.0",
      fetcher: async () => { throw new Error("offline"); },
    });
    expect(offline?.available).toBe(true);
    expect(offline?.fromCache).toBe(true);
  });
});

describe("Service Session Helpers", () => {
  it("parseSshMetrics extracts hostname, uptime, kernel, RAM%, and Disk%", () => {
    const metrics = parseSshMetrics({
      hostname: "prod-api-01",
      os: "Linux prod-api-01 6.8.0-45-generic #45-Ubuntu SMP x86_64 GNU/Linux",
      uptime: "up 12 days, 4 hours, 10 minutes",
      disk: "/dev/nvme0n1p1   100G   42G   53G  45% /",
      memory: "Mem:           16Gi       4.0Gi       8.0Gi       100Mi       4.0Gi       11Gi",
    });

    expect(metrics.hostname).toBe("prod-api-01");
    expect(metrics.kernel).toBe("Linux 6.8.0-45-generic");
    expect(metrics.uptime).toBe("12 days, 4 hours, 10 minutes");
    expect(metrics.diskPct).toBe(45);
    expect(metrics.diskDetail).toBe("42G/100G");
    expect(metrics.memPct).toBe(25);
    expect(metrics.memDetail).toBe("4.0Gi/16Gi");
  });

  it("getOverlayLineColor highlights errors, warnings, success, diffs, and headers", () => {
    setActiveTheme("torlink");
    expect(getOverlayLineColor("+ added line", 0)).toBe(colors.green);
    expect(getOverlayLineColor("- removed line", 0)).toBe(colors.red);
    expect(getOverlayLineColor("[!] permission denied", 0)).toBe(colors.red);
    expect(getOverlayLineColor("WARNING: low disk space", 0)).toBe(colors.yellow);
    expect(getOverlayLineColor("[ok] service running", 0)).toBe(colors.green);
    expect(getOverlayLineColor("=== Security Audit ===", 0)).toBe(colors.purpleBright);
  });

  it("SSH_COMMANDS catalog includes shell as first command with metadata", () => {
    expect(SSH_COMMANDS.length).toBeGreaterThan(25);
    expect(SSH_COMMANDS[0].cmd).toBe("shell");
    expect(SSH_COMMANDS[0].category).toBe("shell");
  });
});
