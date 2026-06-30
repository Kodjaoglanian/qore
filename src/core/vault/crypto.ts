import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
const NONCE_LEN = 12;

export function generateSalt(): Buffer {
  return randomBytes(SALT_LEN);
}

export function generateNonce(): Buffer {
  return randomBytes(NONCE_LEN);
}

export function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * 1024 * 1024,
  });
}

export interface EncryptedPayload {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
}

export function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  const nonce = generateNonce();
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: enc, nonce, tag };
}

export function decrypt(payload: EncryptedPayload, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, payload.nonce);
  decipher.setAuthTag(payload.tag);
  const dec = Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
  return dec.toString("utf8");
}

export function zeroKey(key: Buffer): void {
  key.fill(0);
}
