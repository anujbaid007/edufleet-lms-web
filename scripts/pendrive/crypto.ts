import { createCipheriv, createHash, randomBytes } from "crypto";

const KEY_A = process.env.KEY_A!;
const KEY_B = process.env.KEY_B!;

/** Derive the AES-256 key from KEY_A + KEY_B (matches Android TV app). */
export function deriveKey(): Buffer {
  return createHash("sha256")
    .update(`${KEY_A}${KEY_B}`)
    .digest();
}

/** Encrypt plaintext with AES-256-CBC. Returns IV (16 bytes) + ciphertext. */
export function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}

/** Encrypt a JSON object. */
export function encryptJson(data: unknown, key: Buffer): Buffer {
  const json = JSON.stringify(data);
  return encrypt(Buffer.from(json, "utf-8"), key);
}
