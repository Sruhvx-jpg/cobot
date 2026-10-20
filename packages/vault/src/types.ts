/**
 * Trimmed and vendored from unstorage v0.0.1 (UnJS / Pooya Parsa).
 * NOT created from scratch by Sruhvx-jpg.
 */

export type StorageValue = string;

export interface Driver {
  hasItem(key: string): Promise<boolean> | boolean;
  getItem(key: string): Promise<StorageValue | null> | (StorageValue | null);
  setItem(key: string, value: StorageValue): Promise<void> | void;
  removeItem(key: string): Promise<boolean | void> | (boolean | void);
  getKeys(base?: string): Promise<string[]> | string[];
  clear?(base?: string): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

export interface Storage {
  mount(base: string, driver: Driver): Storage;
  unmount(base: string): Storage;
  hasItem(key: string): Promise<boolean>;
  getItem(key: string): Promise<StorageValue | null>;
  setItem(key: string, value: StorageValue): Promise<void>;
  removeItem(key: string): Promise<boolean>;
  getKeys(base?: string): Promise<string[]>;
  clear(base?: string): Promise<void>;
  dispose(): Promise<void>;
}

export interface FSDriverOptions {
  dir: string;
}

export interface VaultOptions {
  /**
   * Custom directory path for blob storage.
   * If omitted by the user, defaults to DEFAULT_VAULT_PATH (~/.cobot/vault/blobs).
   */
  baseDir?: string;
}
