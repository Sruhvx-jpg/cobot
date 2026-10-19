import type { SimpleVault } from "./simple-vault.js";
import type { InodeIndexManager } from "./index-manager.js";
import type { AgentManifest, Inode } from "./types.js";

const DEFAULT_AGENT_ID = "default";

export const DEFAULT_AGENT_MANIFEST: AgentManifest = {
  id: DEFAULT_AGENT_ID,
  name: "General Engineer",
  description: "Default full-stack autonomous coding and systems agent.",
  identity:
    "You are an adaptive, general-purpose autonomous agent operating inside cobot, a high-performance agent runtime harness.",
};

export class AgentStore {
  constructor(
    private readonly simpleVault: SimpleVault,
    private readonly indexManager: InodeIndexManager,
  ) {}

  async create(manifest: AgentManifest): Promise<AgentManifest> {
    const id = manifest.id.trim().toLowerCase();
    if (!id || !/^[a-z0-9_-]+$/.test(id)) {
      throw new Error(
        `Invalid agent id '${manifest.id}'. Must contain only lowercase alphanumeric, dashes, or underscores.`,
      );
    }

    const now = Date.now();
    const data: AgentManifest = {
      ...manifest,
      id,
      createdAt: manifest.createdAt || now,
      updatedAt: now,
    };

    const inodeId = `agent_${id}_manifest`;
    await this.simpleVault.write(inodeId, data, {
      subDir: `agents/${id}`,
      mimeType: "application/json",
      metadata: {
        type: "agent_manifest",
        agentId: id,
        name: data.name,
      },
    });

    return data;
  }

  async get(id: string): Promise<AgentManifest | null> {
    const cleanId = id.trim().toLowerCase();
    const inodeId = `agent_${cleanId}_manifest`;

    try {
      return await this.simpleVault.read<AgentManifest>(inodeId);
    } catch {
      if (cleanId === DEFAULT_AGENT_ID) {
        return this.ensureDefaultAgent();
      }
      return null;
    }
  }

  async list(): Promise<AgentManifest[]> {
    await this.indexManager.load();
    const inodes = this.simpleVault.list({ mimeType: "application/json" });

    const manifestInodes = inodes.filter(
      (inode) =>
        inode.id.startsWith("agent_") &&
        inode.id.endsWith("_manifest") &&
        inode.path.includes("agents/"),
    );

    const manifests: AgentManifest[] = [];
    for (const inode of manifestInodes) {
      try {
        const item = await this.simpleVault.read<AgentManifest>(inode.id);
        if (item && item.id) {
          manifests.push(item);
        }
      } catch {
        // Skip unreadable
      }
    }

    if (manifests.length === 0) {
      const defaultAgent = await this.ensureDefaultAgent();
      return [defaultAgent];
    }

    return manifests.sort((a, b) =>
      (a.name || a.id).localeCompare(b.name || b.id),
    );
  }

  async delete(id: string): Promise<boolean> {
    const cleanId = id.trim().toLowerCase();
    if (cleanId === DEFAULT_AGENT_ID) {
      throw new Error("The default agent cannot be deleted.");
    }

    const inodeId = `agent_${cleanId}_manifest`;
    return this.simpleVault.delete(inodeId);
  }

  async ensureDefaultAgent(): Promise<AgentManifest> {
    const inodeId = `agent_${DEFAULT_AGENT_ID}_manifest`;
    const existing = this.simpleVault.stat(inodeId);

    if (existing) {
      try {
        return await this.simpleVault.read<AgentManifest>(inodeId);
      } catch {
        // Overwrite if corrupt
      }
    }

    return this.create(DEFAULT_AGENT_MANIFEST);
  }
}
