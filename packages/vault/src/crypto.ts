import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import type { EncryptedPayload } from "./types.js";

const KEY_LENGTH = 32; // 256 bits for AES-256
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM
const SALT_LENGTH = 16; // 128 bits salt

export function deriveKey(code: string, salt: Buffer): Buffer {
  return scryptSync(code, salt, KEY_LENGTH);
}

export function encryptWithCode(code: string, data: unknown): EncryptedPayload {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(code, salt);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf-8");

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
}

export function decryptWithCode<T = unknown>(
  code: string,
  payload: EncryptedPayload,
): T {
  try {
    const salt = Buffer.from(payload.salt, "hex");
    const iv = Buffer.from(payload.iv, "hex");
    const tag = Buffer.from(payload.tag, "hex");
    const ciphertext = Buffer.from(payload.ciphertext, "hex");

    const key = deriveKey(code, salt);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf-8")) as T;
  } catch {
    throw new Error(
      "Decryption failed: invalid access code or corrupted payload.",
    );
  }
}
