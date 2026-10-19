import { readFile, writeFile, unlink, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { InodeIndexManager } from "./index-manager.js";
import { encryptWithCode, decryptWithCode } from "./crypto.js";
import type { Inode, InodeWriteOptions, EncryptedPayload } from "./types.js";

export class CodeVault {
  constructor(private readonly indexManager: InodeIndexManager) {}

  /**
   * General-purpose write to a code-protected encrypted inode.
   */
  async write<
    TMetadata extends Record<string, unknown> = Record<string, unknown>,
  >(
    id: string,
    code: string,
    data: unknown,
    options?: InodeWriteOptions<TMetadata>,
  ): Promise<Inode<TMetadata>> {
    if (!code || typeof code !== "string") {
      throw new Error(
        "A non-empty access code is required to seal data in CodeVault.",
      );
    }

    await this.indexManager.load();
    const subDir = options?.subDir || "secrets";
    const relPath = `vaults/code/${subDir}/${id}.enc`;
    const absPath = this.indexManager.resolveAbsolutePath(relPath);

    if (!existsSync(dirname(absPath))) {
      await mkdir(dirname(absPath), { recursive: true });
    }

    const payload = encryptWithCode(code, data);
    const content = JSON.stringify(payload, null, 2);
    await writeFile(absPath, content, "utf-8");

    const fileStat = await stat(absPath);

    return this.indexManager.allocInode<TMetadata>(id, {
      vault: "code",
      path: relPath,
      size: fileStat.size,
      mimeType: options?.mimeType || "application/octet-stream",
      metadata: options?.metadata,
      createdAt: fileStat.birthtimeMs || Date.now(),
      updatedAt: fileStat.mtimeMs || Date.now(),
    });
  }

  /**
   * General-purpose read from a code-protected encrypted inode.
   */
  async read<T = unknown>(id: string, code: string): Promise<T> {
    if (!code || typeof code !== "string") {
      throw new Error(
        "A non-empty access code is required to unseal data from CodeVault.",
      );
    }

    await this.indexManager.load();
    const inode = this.indexManager.getInode(id);
    if (!inode || inode.vault !== "code") {
      throw new Error(`Inode '${id}' not found in CodeVault.`);
    }

    const absPath = this.indexManager.resolveAbsolutePath(inode);
    if (!existsSync(absPath)) {
      throw new Error(
        `Physical file missing for encrypted inode '${id}' at ${inode.path}.`,
      );
    }

    const raw = await readFile(absPath, "utf-8");
    const payload = JSON.parse(raw) as EncryptedPayload;

    return decryptWithCode<T>(code, payload);
  }

  /**
   * Verify if a given code unlocks the targeted inode without exposing the payload.
   */
  async verify(id: string, code: string): Promise<boolean> {
    try {
      await this.read(id, code);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete an encrypted inode and its physical storage block.
   */
  async delete(id: string): Promise<boolean> {
    await this.indexManager.load();
    const inode = this.indexManager.getInode(id);
    if (!inode || inode.vault !== "code") return false;

    const absPath = this.indexManager.resolveAbsolutePath(inode);
    if (existsSync(absPath)) {
      try {
        await unlink(absPath);
      } catch (err) {
        console.warn(`[Cobot CodeVault] Failed to unlink ${absPath}:`, err);
      }
    }

    return this.indexManager.freeInode(id);
  }

  stat(id: string): Inode | undefined {
    return this.indexManager.getInode(id);
  }

  list(): Inode[] {
    return this.indexManager.listInodes({ vault: "code" });
  }
}
