/**
 * Trimmed and vendored from unstorage v0.0.1 (UnJS / Pooya Parsa).
 * NOT created from scratch by Sruhvx-jpg.
 *
 * Core in-process storage engine with key normalization and mount points.
 */

import type { Driver, Storage, StorageValue } from "./types.js";

export function normalizeKey(key: string): string {
  if (!key) return "";
  return key.replace(/[/\\]/g, ":").replace(/^:+|:+$/g, "");
}

export function normalizeBase(base: string): string {
  const norm = normalizeKey(base);
  return norm ? `${norm}:` : "";
}

export interface CreateStorageOptions {
  driver?: Driver;
}

export function createStorage(opts: CreateStorageOptions = {}): Storage {
  const mounts = new Map<string, Driver>();
  let defaultDriver = opts.driver;

  const matchDriver = (key: string): { driver: Driver; subKey: string } => {
    const normKey = normalizeKey(key);

    let bestMount = "";
    for (const mountKey of mounts.keys()) {
      if (normKey === mountKey || normKey.startsWith(`${mountKey}:`)) {
        if (mountKey.length > bestMount.length) {
          bestMount = mountKey;
        }
      }
    }

    if (bestMount) {
      const driver = mounts.get(bestMount)!;
      const subKey =
        normKey === bestMount ? "" : normKey.slice(bestMount.length + 1);
      return { driver, subKey };
    }

    if (defaultDriver) {
      return { driver: defaultDriver, subKey: normKey };
    }

    throw new Error(`[vault:storage] No driver mounted for key: '${key}'`);
  };

  const storage: Storage = {
    mount(base: string, driver: Driver): Storage {
      const normBase = normalizeKey(base);
      if (!normBase) {
        defaultDriver = driver;
      } else {
        mounts.set(normBase, driver);
      }
      return storage;
    },

    unmount(base: string): Storage {
      const normBase = normalizeKey(base);
      if (!normBase) {
        defaultDriver = undefined;
      } else {
        mounts.delete(normBase);
      }
      return storage;
    },

    async hasItem(key: string): Promise<boolean> {
      const { driver, subKey } = matchDriver(key);
      return driver.hasItem(subKey);
    },

    async getItem(key: string): Promise<StorageValue | null> {
      const { driver, subKey } = matchDriver(key);
      return driver.getItem(subKey);
    },

    async setItem(key: string, value: StorageValue): Promise<void> {
      const { driver, subKey } = matchDriver(key);
      await driver.setItem(subKey, value);
    },

    async removeItem(key: string): Promise<boolean> {
      const { driver, subKey } = matchDriver(key);
      const res = await driver.removeItem(subKey);
      return res !== false;
    },

    async getKeys(base?: string): Promise<string[]> {
      const normBase = base ? normalizeKey(base) : "";

      if (normBase && mounts.has(normBase)) {
        const driver = mounts.get(normBase)!;
        const subKeys = await driver.getKeys();
        return subKeys.map((k) => (k ? `${normBase}:${k}` : normBase));
      }

      const allKeys = new Set<string>();

      if (defaultDriver) {
        const defaultKeys = await defaultDriver.getKeys();
        for (const k of defaultKeys) {
          if (!normBase || k.startsWith(normBase)) {
            allKeys.add(k);
          }
        }
      }

      for (const [mountPrefix, driver] of mounts.entries()) {
        if (
          !normBase ||
          mountPrefix.startsWith(normBase) ||
          normBase.startsWith(mountPrefix)
        ) {
          const subKeys = await driver.getKeys();
          for (const k of subKeys) {
            const fullKey = k ? `${mountPrefix}:${k}` : mountPrefix;
            if (!normBase || fullKey.startsWith(normBase)) {
              allKeys.add(fullKey);
            }
          }
        }
      }

      return Array.from(allKeys);
    },

    async clear(base?: string): Promise<void> {
      const normBase = base ? normalizeKey(base) : "";
      if (normBase && mounts.has(normBase)) {
        const driver = mounts.get(normBase)!;
        if (driver.clear) await driver.clear();
        return;
      }

      if (defaultDriver && defaultDriver.clear) {
        await defaultDriver.clear();
      }

      for (const driver of mounts.values()) {
        if (driver.clear) await driver.clear();
      }
    },

    async dispose(): Promise<void> {
      if (defaultDriver && defaultDriver.dispose) {
        await defaultDriver.dispose();
      }
      for (const driver of mounts.values()) {
        if (driver.dispose) await driver.dispose();
      }
    },
  };

  return storage;
}
