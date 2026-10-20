import {
  readFile,
  writeFile,
  appendFile,
  unlink,
  mkdir,
  stat,
} from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { dirname } from "node:path";
import type { InodeIndexManager } from "./index-manager.js";
import type { Inode, InodeWriteOptions, InodeAppendOptions } from "./types.js";

export class SimpleVault {
  constructor(private readonly indexManager: InodeIndexManager) {}

  /**
   * General-purpose write to an unencrypted inode.
   */
  async write<
    TMetadata extends Record<string, unknown> = Record<string, unknown>,
  >(
    id: string,
    data: string | Buffer | object,
    options?: InodeWriteOptions<TMetadata>,
  ): Promise<Inode<TMetadata>> {
    await this.indexManager.load();

    const subDir = options?.subDir || "data";
    const extension =
      options?.mimeType === "application/json"
        ? ".json"
        : options?.mimeType === "application/x-ndjson"
          ? ".jsonl"
          : "";

    const relPath = `vaults/simple/${subDir}/${id}${extension}`;
    const absPath = this.indexManager.resolveAbsolutePath(relPath);

    if (!existsSync(dirname(absPath))) {
      await mkdir(dirname(absPath), { recursive: true });
    }

    const payload =
      typeof data === "string"
        ? data
        : Buffer.isBuffer(data)
          ? data
          : JSON.stringify(data, null, 2);

    await writeFile(absPath, payload);
    const fileStat = await stat(absPath);

    return this.indexManager.allocInode<TMetadata>(id, {
      vault: "simple",
      path: relPath,
      size: fileStat.size,
      mimeType: options?.mimeType,
      metadata: options?.metadata,
      createdAt: fileStat.birthtimeMs || Date.now(),
      updatedAt: fileStat.mtimeMs || Date.now(),
    });
  }

  /**
   * General-purpose read from an unencrypted inode.
   */
  async read<T = string>(
    id: string,
    encoding: BufferEncoding = "utf-8",
  ): Promise<T> {
    await this.indexManager.load();
    const inode = this.indexManager.getInode(id);
    if (!inode || inode.vault !== "simple") {
      throw new Error(`Inode '${id}' not found in SimpleVault.`);
    }

    const absPath = this.indexManager.resolveAbsolutePath(inode);
    if (!existsSync(absPath)) {
      throw new Error(
        `Physical file missing for inode '${id}' at ${inode.path}.`,
      );
    }

    const raw = await readFile(absPath, encoding);
    if (inode.mimeType === "application/json") {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    }
    return raw as unknown as T;
  }

  /**
   * Stream reader for large payloads, logs, or sessions.
   */
  getReadStream(id: string) {
    const inode = this.indexManager.getInode(id);
    if (!inode || inode.vault !== "simple") {
      throw new Error(`Inode '${id}' not found in SimpleVault.`);
    }
    const absPath = this.indexManager.resolveAbsolutePath(inode);
    return createReadStream(absPath, { encoding: "utf-8" });
  }

  /**
   * General-purpose append (ideal for log streams, LLM turns, jsonl events).
   */
  async append<
    TMetadata extends Record<string, unknown> = Record<string, unknown>,
  >(
    id: string,
    chunk: string | Buffer,
    options?: InodeAppendOptions<TMetadata>,
  ): Promise<Inode<TMetadata>> {
    await this.indexManager.load();
    const inode = this.indexManager.getInode<TMetadata>(id);

    if (!inode) {
      return this.write<TMetadata>(id, chunk, {
        subDir: options?.subDir,
        mimeType: options?.mimeType,
        metadata: options?.metadata as TMetadata | undefined,
      });
    }

    const absPath = this.indexManager.resolveAbsolutePath(inode);
    if (!existsSync(dirname(absPath))) {
      await mkdir(dirname(absPath), { recursive: true });
    }

    await appendFile(absPath, chunk);
    const fileStat = await stat(absPath);

    return this.indexManager.updateInode<TMetadata>(id, {
      size: fileStat.size,
      metadata: options?.metadata ? (options.metadata as TMetadata) : undefined,
    });
  }

  /**
   * Delete an unencrypted inode and its physical storage block.
   */
  async delete(id: string): Promise<boolean> {
    await this.indexManager.load();
    const inode = this.indexManager.getInode(id);
    if (!inode || inode.vault !== "simple") return false;

    const absPath = this.indexManager.resolveAbsolutePath(inode);
    if (existsSync(absPath)) {
      try {
        await unlink(absPath);
      } catch (err) {
        console.warn(`[Cobot SimpleVault] Failed to unlink ${absPath}:`, err);
      }
    }

    return this.indexManager.freeInode(id);
  }

  stat(id: string): Inode | undefined {
    return this.indexManager.getInode(id);
  }

  list(filter?: { mimeType?: string }): Inode[] {
    return this.indexManager.listInodes({ vault: "simple", ...filter });
  }
}
