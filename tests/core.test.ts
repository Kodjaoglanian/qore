import { describe, it, expect } from "bun:test";
import { isDockerAvailable } from "../src/core/probe/docker.js";
import { colors } from "../src/ui/theme.js";
import { deriveKey, generateSalt, encrypt, decrypt, zeroKey } from "../src/core/vault/crypto.js";
import { Vault } from "../src/core/vault/vault.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, rmSync } from "node:fs";

describe("Docker Probe", () => {
  it("isDockerAvailable should return a boolean", async () => {
    const result = await isDockerAvailable();
    expect(typeof result).toBe("boolean");
  });
});

describe("Theme", () => {
  it("should have correct color values", () => {
    expect(colors.purple).toBe("#A370F7");
    expect(colors.bg).toBe("#0D0D12");
    expect(colors.borderMuted).toBe("#5C5B66");
  });
});

describe("Vault Crypto", () => {
  it("deriveKey should produce a 32-byte key", () => {
    const salt = generateSalt();
    const key = deriveKey("test-password", salt);
    expect(key.length).toBe(32);
  });

  it("deriveKey should be deterministic with same password+salt", () => {
    const salt = generateSalt();
    const key1 = deriveKey("test-password", salt);
    const key2 = deriveKey("test-password", salt);
    expect(key1.equals(key2)).toBe(true);
  });

  it("deriveKey should differ with different passwords", () => {
    const salt = generateSalt();
    const key1 = deriveKey("password1", salt);
    const key2 = deriveKey("password2", salt);
    expect(key1.equals(key2)).toBe(false);
  });

  it("encrypt+decrypt should round-trip correctly", () => {
    const salt = generateSalt();
    const key = deriveKey("test-password", salt);
    const plaintext = '{"connections":[{"name":"test"}]}';
    const payload = encrypt(plaintext, key);
    const decrypted = decrypt(payload, key);
    expect(decrypted).toBe(plaintext);
  });

  it("decrypt should fail with wrong key", () => {
    const salt = generateSalt();
    const key1 = deriveKey("correct-password", salt);
    const key2 = deriveKey("wrong-password", salt);
    const payload = encrypt("secret data", key1);
    expect(() => decrypt(payload, key2)).toThrow();
  });

  it("zeroKey should fill buffer with zeros", () => {
    const salt = generateSalt();
    const key = deriveKey("test", salt);
    zeroKey(key);
    expect(key.every((b: number) => b === 0)).toBe(true);
  });
});

describe("Vault", () => {
  const vaultDir = join(homedir(), ".qore");
  const vaultFile = join(vaultDir, "vault.enc");
  const metaFile = join(vaultDir, "vault.meta.json");

  it("init should create vault and unlock should work", () => {
    // Clean up any existing vault
    if (existsSync(vaultFile)) rmSync(vaultFile);
    if (existsSync(metaFile)) rmSync(metaFile);

    expect(Vault.isInitialized()).toBe(false);

    const vault = Vault.init("my-master-password");
    expect(vault.isUnlocked()).toBe(true);
    expect(Vault.isInitialized()).toBe(true);

    // Add a connection
    const conn = vault.addConnection({
      name: "Test Redis",
      type: "redis",
      host: "localhost",
      port: 6379,
      useTls: false,
    });
    expect(conn.id).toBeDefined();
    expect(vault.getConnections().length).toBe(1);

    // Lock and unlock
    vault.lock();
    expect(vault.isUnlocked()).toBe(false);

    const unlocked = Vault.unlock("my-master-password");
    expect(unlocked).not.toBe(null);
    expect(unlocked!.getConnections().length).toBe(1);
    expect(unlocked!.getConnections()[0].name).toBe("Test Redis");

    unlocked!.lock();
  });

  it("unlock with wrong password should return null", () => {
    const result = Vault.unlock("wrong-password");
    expect(result).toBe(null);
  });

  // Cleanup
  it("cleanup test vault", () => {
    if (existsSync(vaultFile)) rmSync(vaultFile);
    if (existsSync(metaFile)) rmSync(metaFile);
  });
});
