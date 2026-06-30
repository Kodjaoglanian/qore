import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { deriveKey, encrypt, decrypt, generateSalt, zeroKey, type EncryptedPayload } from "./crypto.js";
import type { ConnectionConfig, VaultData, VaultMeta } from "./types.js";

const QORE_DIR = join(homedir(), ".qore");
const VAULT_FILE = join(QORE_DIR, "vault.enc");
const META_FILE = join(QORE_DIR, "vault.meta.json");

const VAULT_VERSION = 1;

export class Vault {
  private key: Buffer | null = null;
  private data: VaultData = { connections: [] };

  static isInitialized(): boolean {
    return existsSync(VAULT_FILE) && existsSync(META_FILE);
  }

  static init(password: string): Vault {
    ensureDir();
    const vault = new Vault();
    const salt = generateSalt();
    vault.key = deriveKey(password, salt);
    vault.data = { connections: [] };
    vault.save(salt);
    return vault;
  }

  static unlock(password: string): Vault | null {
    if (!Vault.isInitialized()) return null;
    const vault = new Vault();
    const meta = vault.readMeta();
    const key = deriveKey(password, Buffer.from(meta.salt, "base64"));
    try {
      const payload = vault.readEncrypted();
      const json = decrypt(payload, key);
      vault.data = JSON.parse(json);
      vault.key = key;
      return vault;
    } catch {
      zeroKey(key);
      return null;
    }
  }

  isUnlocked(): boolean {
    return this.key !== null;
  }

  lock(): void {
    if (this.key) {
      zeroKey(this.key);
      this.key = null;
    }
  }

  getConnections(): ConnectionConfig[] {
    return this.data.connections;
  }

  getConnection(id: string): ConnectionConfig | undefined {
    return this.data.connections.find((c) => c.id === id);
  }

  addConnection(config: Omit<ConnectionConfig, "id">): ConnectionConfig {
    const conn: ConnectionConfig = { ...config, id: randomUUID() };
    this.data.connections.push(conn);
    this.save();
    return conn;
  }

  updateConnection(id: string, updates: Partial<ConnectionConfig>): ConnectionConfig | undefined {
    const idx = this.data.connections.findIndex((c) => c.id === id);
    if (idx === -1) return undefined;
    this.data.connections[idx] = { ...this.data.connections[idx], ...updates, id };
    this.save();
    return this.data.connections[idx];
  }

  removeConnection(id: string): boolean {
    const before = this.data.connections.length;
    this.data.connections = this.data.connections.filter((c) => c.id !== id);
    const removed = this.data.connections.length < before;
    if (removed) this.save();
    return removed;
  }

  changePassword(oldPassword: string, newPassword: string): boolean {
    if (!this.key) return false;
    const meta = this.readMeta();
    const oldKey = deriveKey(oldPassword, Buffer.from(meta.salt, "base64"));
    if (!oldKey.equals(this.key)) {
      zeroKey(oldKey);
      return false;
    }
    zeroKey(oldKey);
    const newSalt = generateSalt();
    const newKey = deriveKey(newPassword, newSalt);
    zeroKey(this.key);
    this.key = newKey;
    this.save(newSalt);
    return true;
  }

  private save(saltOverride?: Buffer): void {
    if (!this.key) throw new Error("Vault is locked");
    const salt = saltOverride ?? this.readMetaSalt();
    const json = JSON.stringify(this.data);
    const payload = encrypt(json, this.key);
    writeFileSync(VAULT_FILE, Buffer.concat([payload.nonce, payload.tag, payload.ciphertext]), { mode: 0o600 });
    chmodSync(VAULT_FILE, 0o600);
    const meta: VaultMeta = {
      version: VAULT_VERSION,
      salt: salt.toString("base64"),
      nonce: payload.nonce.toString("base64"),
      createdAt: new Date().toISOString(),
    };
    writeFileSync(META_FILE, JSON.stringify(meta, null, 2), { mode: 0o600 });
    chmodSync(META_FILE, 0o600);
  }

  private readMeta(): VaultMeta {
    return JSON.parse(readFileSync(META_FILE, "utf8"));
  }

  private readMetaSalt(): Buffer {
    return Buffer.from(this.readMeta().salt, "base64");
  }

  private readEncrypted(): EncryptedPayload {
    const raw = readFileSync(VAULT_FILE);
    const nonce = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    return { ciphertext: Buffer.from(ciphertext), nonce: Buffer.from(nonce), tag: Buffer.from(tag) };
  }
}

function ensureDir(): void {
  if (!existsSync(QORE_DIR)) {
    mkdirSync(QORE_DIR, { recursive: true });
    chmodSync(QORE_DIR, 0o700);
  }
}
