import { homedir } from "node:os";
import { join } from "node:path";
import { InodeIndexManager } from "./index-manager.js";
import { SimpleVault } from "./simple-vault.js";
import { CodeVault } from "./code-vault.js";
import { SessionStore } from "./session-store.js";
import { AgentStore } from "./agent-store.js";
import type { VaultConfig, Inode } from "./types.js";

export class CobotVault {
  public readonly storageRoot: string;
  public readonly index: InodeIndexManager;
  public readonly simple: SimpleVault;
  public readonly code: CodeVault;
  public readonly sessions: SessionStore;
  public readonly agents: AgentStore;

  constructor(config?: VaultConfig) {
    this.storageRoot =
      config?.storageRoot ||
      process.env.COBOT_HOME ||
      join(homedir(), ".cobot");

    this.index = new InodeIndexManager(this.storageRoot);
    this.simple = new SimpleVault(this.index);
    this.code = new CodeVault(this.index);
    this.sessions = new SessionStore(this.simple);
    this.agents = new AgentStore(this.simple, this.index);
  }

  /**
   * Initializes the vault, loads index.json and ensures default agent exists.
   */
  async init(): Promise<this> {
    await this.index.load();
    await this.agents.ensureDefaultAgent();
    return this;
  }

  /**
   * Fast resolution from ID to Inode record and absolute filesystem path.
   */
  resolve(id: string): { inode: Inode; absolutePath: string } | null {
    const inode = this.index.getInode(id);
    if (!inode) return null;
    return {
      inode,
      absolutePath: this.index.resolveAbsolutePath(inode),
    };
  }
}

export * from "./types.js";
export * from "./crypto.js";
export * from "./session-store.js";
export * from "./agent-store.js";
export { InodeIndexManager } from "./index-manager.js";
export { SimpleVault } from "./simple-vault.js";
export { CodeVault } from "./code-vault.js";
