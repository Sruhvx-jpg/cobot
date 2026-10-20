/**
 * @cobot/vault - Minimal persistent text blob storage engine.
 *
 * Attribution:
 * Vendored and trimmed from unstorage v0.0.1 (UnJS / Pooya Parsa).
 * NOT created from scratch by Sruhvx-jpg.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { createStorage } from "./storage.js";
import { fsDriver } from "./drivers/fs.js";
import type { Storage, VaultOptions, StorageValue } from "./types.js";

/**
 * Hardcoded default storage path on the host filesystem.
 */
export const DEFAULT_VAULT_PATH = join(homedir(), ".cobot", "vault", "blobs");

export function createVault(opts: VaultOptions = {}): Storage {
  // Check if a custom path was given by the user; fallback to hardcoded const
  const baseDir =
    typeof opts.baseDir === "string" && opts.baseDir.trim().length > 0
      ? opts.baseDir.trim()
      : DEFAULT_VAULT_PATH;

  const storage = createStorage();

  // Dual crash-resistant mount points for physical isolation
  storage.mount("public", fsDriver({ dir: join(baseDir, "public") }));
  storage.mount("auth", fsDriver({ dir: join(baseDir, "auth") }));

  return storage;
}

/**
 * Standard CobotVault instance wrapping the trimmed unstorage core.
 */
export class CobotVault implements Storage {
  public readonly storage: Storage;
  public readonly baseDir: string;

  constructor(opts: VaultOptions = {}) {
    // Check if a custom path was given by the user; fallback to hardcoded const
    this.baseDir =
      typeof opts.baseDir === "string" && opts.baseDir.trim().length > 0
        ? opts.baseDir.trim()
        : DEFAULT_VAULT_PATH;

    this.storage = createVault({ baseDir: this.baseDir });
  }

  async init(): Promise<this> {
    return this;
  }

  mount(base: string, driver: import("./types.js").Driver): this {
    this.storage.mount(base, driver);
    return this;
  }

  unmount(base: string): this {
    this.storage.unmount(base);
    return this;
  }

  hasItem(key: string): Promise<boolean> {
    return this.storage.hasItem(key);
  }

  getItem(key: string): Promise<StorageValue | null> {
    return this.storage.getItem(key);
  }

  setItem(key: string, value: StorageValue): Promise<void> {
    return this.storage.setItem(key, value);
  }

  removeItem(key: string): Promise<boolean> {
    return this.storage.removeItem(key);
  }

  getKeys(base?: string): Promise<string[]> {
    return this.storage.getKeys(base);
  }

  clear(base?: string): Promise<void> {
    return this.storage.clear(base);
  }

  dispose(): Promise<void> {
    return this.storage.dispose();
  }
}

export * from "./types.js";
export * from "./storage.js";
export * from "./drivers/fs.js";
