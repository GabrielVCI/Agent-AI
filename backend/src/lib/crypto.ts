import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = env.ENCRYPTION_KEY;
  if (!key) {
    // Derive a deterministic key from SESSION_SECRET if ENCRYPTION_KEY not set.
    // Not ideal for production but prevents startup failure in dev.
    return createHash("sha256").update(env.SESSION_SECRET).digest();
  }
  return Buffer.from(key, "hex");
}

export function encryptJson(data: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(24hex) + tag(32hex) + encrypted(hex)
  return iv.toString("hex") + tag.toString("hex") + encrypted.toString("hex");
}

export function decryptJson(ciphertext: string): Record<string, unknown> {
  const key = getEncryptionKey();
  const iv = Buffer.from(ciphertext.slice(0, 24), "hex");
  const tag = Buffer.from(ciphertext.slice(24, 56), "hex");
  const encrypted = Buffer.from(ciphertext.slice(56), "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
