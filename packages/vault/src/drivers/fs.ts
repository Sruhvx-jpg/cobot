/**
 * Trimmed and vendored from unstorage v0.0.1 (UnJS / Pooya Parsa).
 * NOT created from scratch by Sruhvx-jpg.
 *
 * Enhanced with Crash-Resistant writes (atomic PID-temp swap via rename)
 * for persistent text blob storage.
 */

import { existsSync } from "node:fs";
import {
  readFile,
  writeFile,
  rename,
  unlink,
  mkdir,
  readdir,
  rm,
} from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { Driver, FSDriverOptions, StorageValue } from "../types.js";

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}

export function fsDriver(opts: FSDriverOptions): Driver {
  if (!opts.dir) {
    throw new Error("[vault:fs-driver] 'dir' path is required.");
  }

  const baseDir = resolve(opts.dir);

  const resolvePath = (key: string): string => {
    const cleanKey = key.replace(/:/g, "/").replace(/^\/+/, "");
    return resolve(baseDir, cleanKey);
  };

  return {
    hasItem(key: string): boolean {
      return existsSync(resolvePath(key));
    },

    async getItem(key: string): Promise<StorageValue | null> {
      const filePath = resolvePath(key);
      try {
        return await readFile(filePath, "utf-8");
      } catch (err) {
        if (isNotFoundError(err)) return null;
        throw err;
      }
    },

    /**
     * Crash-resistant write:
     * Writes to a PID-stamped sibling temporary file, then performs
     * an atomic kernel rename so power cuts or crashes never corrupt target blobs.
     */
    async setItem(key: string, value: StorageValue): Promise<void> {
      const filePath = resolvePath(key);
      const parentDir = dirname(filePath);

      await mkdir(parentDir, { recursive: true });

      const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
      await writeFile(tmpPath, value, "utf-8");
      await rename(tmpPath, filePath);
    },

    async removeItem(key: string): Promise<boolean> {
      const filePath = resolvePath(key);
      try {
        await unlink(filePath);
        return true;
      } catch (err) {
        if (isNotFoundError(err)) return false;
        throw err;
      }
    },

    async getKeys(): Promise<string[]> {
      if (!existsSync(baseDir)) return [];

      try {
        const entries = await readdir(baseDir, {
          recursive: true,
          withFileTypes: true,
        });

        const keys: string[] = [];
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          if (entry.name.includes(".tmp.")) continue;

          const parent =
            entry.parentPath ||
            (entry as unknown as { path: string }).path ||
            baseDir;
          const fullPath = resolve(parent, entry.name);
          const relPath = fullPath
            .slice(baseDir.length)
            .replace(/^[/\\]+/, "")
            .replace(/[/\\]/g, ":");

          keys.push(relPath);
        }
        return keys;
      } catch (err) {
        if (isNotFoundError(err)) return [];
        throw err;
      }
    },

    async clear(): Promise<void> {
      if (existsSync(baseDir)) {
        await rm(baseDir, { recursive: true, force: true });
      }
    },

    dispose(): void {},
  };
}
