import {
  readFile,
  writeFile,
  rename,
  mkdir,
  stat,
  readdir,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Inode, InodeTable, VaultType } from "./types.js";

export class InodeIndexManager {
  private indexPath: string;
  private table: InodeTable | null = null;

  constructor(public readonly storageRoot: string) {
    this.indexPath = join(this.storageRoot, "index.json");
  }

  async load(): Promise<InodeTable> {
    if (this.table) return this.table;

    if (existsSync(this.indexPath)) {
      try {
        const raw = await readFile(this.indexPath, "utf-8");
        const parsed = JSON.parse(raw) as InodeTable;
        if (parsed && typeof parsed.inodes === "object") {
          this.table = parsed;
          return this.table;
        }
      } catch (err) {
        console.warn(
          `[Cobot Vault] Corrupted inode index detected at ${this.indexPath}. Rebuilding...`,
          err,
        );
      }
    }

    this.table = {
      version: 1,
      storageRoot: this.storageRoot,
      inodes: {},
    };

    await this.selfHeal();
    await this.save();
    return this.table;
  }

  async save(): Promise<void> {
    if (!this.table) return;

    if (!existsSync(this.storageRoot)) {
      await mkdir(this.storageRoot, { recursive: true });
    }

    const tmpPath = `${this.indexPath}.tmp.${Date.now()}`;
    const payload = JSON.stringify(this.table, null, 2);

    await writeFile(tmpPath, payload, "utf-8");
    await rename(tmpPath, this.indexPath);
  }

  getInode<TMetadata extends Record<string, unknown> = Record<string, unknown>>(
    id: string,
  ): Inode<TMetadata> | undefined {
    if (!this.table) return undefined;
    return this.table.inodes[id] as Inode<TMetadata> | undefined;
  }

  async allocInode<
    TMetadata extends Record<string, unknown> = Record<string, unknown>,
  >(
    id: string,
    data: {
      vault: VaultType;
      path: string;
      size: number;
      mimeType?: string;
      metadata?: TMetadata;
      createdAt?: number;
      updatedAt?: number;
    },
  ): Promise<Inode<TMetadata>> {
    await this.load();
    const now = Date.now();
    const existing = this.table!.inodes[id];

    const inode: Inode<TMetadata> = {
      id,
      vault: data.vault,
      path: data.path,
      size: data.size,
      mimeType: data.mimeType ?? existing?.mimeType,
      metadata: (data.metadata ?? existing?.metadata ?? {}) as TMetadata,
      createdAt: data.createdAt ?? existing?.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };

    this.table!.inodes[id] = inode as Inode;
    await this.save();
    return inode;
  }

  async updateInode<
    TMetadata extends Record<string, unknown> = Record<string, unknown>,
  >(
    id: string,
    updates: Partial<Omit<Inode<TMetadata>, "id" | "vault" | "createdAt">>,
  ): Promise<Inode<TMetadata>> {
    await this.load();
    const existing = this.table!.inodes[id];
    if (!existing) {
      throw new Error(`Inode '${id}' does not exist in the index table.`);
    }

    const updated: Inode<TMetadata> = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...(updates.metadata || {}),
      } as TMetadata,
      updatedAt: Date.now(),
    };

    this.table!.inodes[id] = updated as Inode;
    await this.save();
    return updated;
  }

  async freeInode(id: string): Promise<boolean> {
    await this.load();
    if (!this.table!.inodes[id]) return false;

    delete this.table!.inodes[id];
    await this.save();
    return true;
  }

  listInodes(filter?: { vault?: VaultType; mimeType?: string }): Inode[] {
    if (!this.table) return [];
    let all = Object.values(this.table.inodes);

    if (filter?.vault) {
      all = all.filter((inode) => inode.vault === filter.vault);
    }
    if (filter?.mimeType) {
      all = all.filter((inode) => inode.mimeType === filter.mimeType);
    }

    return all;
  }

  resolveAbsolutePath(inodeOrPath: Inode | string): string {
    const relPath =
      typeof inodeOrPath === "string" ? inodeOrPath : inodeOrPath.path;
    return resolve(this.storageRoot, relPath);
  }

  /**
   * Scans disk directories and re-indexes missing physical files.
   */
  async selfHeal(): Promise<void> {
    if (!this.table) return;

    const scanDir = async (dir: string, vault: VaultType) => {
      if (!existsSync(dir)) return;
      try {
        const files = await readdir(dir, { recursive: true });
        for (const file of files) {
          const absPath = join(dir, file);
          const fileStat = await stat(absPath).catch(() => null);
          if (!fileStat || fileStat.isDirectory()) continue;

          // Deduce id from relative filename
          const id = file.replace(/^[\\/]/, "").replace(/\.[^/.]+$/, "");
          if (!this.table!.inodes[id]) {
            const relPath = absPath
              .replace(this.storageRoot, "")
              .replace(/^[\\/]/, "");
            this.table!.inodes[id] = {
              id,
              vault,
              path: relPath,
              size: fileStat.size,
              mimeType: file.endsWith(".jsonl")
                ? "application/x-ndjson"
                : file.endsWith(".json")
                  ? "application/json"
                  : "application/octet-stream",
              metadata: {},
              createdAt: fileStat.birthtimeMs || Date.now(),
              updatedAt: fileStat.mtimeMs || Date.now(),
            };
          }
        }
      } catch (err) {
        console.warn(`[Cobot Vault] Self-healing error scanning ${dir}:`, err);
      }
    };

    await scanDir(join(this.storageRoot, "vaults", "simple"), "simple");
    await scanDir(join(this.storageRoot, "vaults", "code"), "code");
  }
}
