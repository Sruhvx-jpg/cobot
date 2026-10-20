import type { Storage } from "@cobot/vault";
import type { AgentManifest } from "./types.js";

const DEFAULT_AGENT_ID = "default";

export const DEFAULT_AGENT_MANIFEST: AgentManifest = {
  id: DEFAULT_AGENT_ID,
  name: "General Engineer",
  description: "Default full-stack autonomous coding and systems agent.",
  identity:
    "You are an adaptive, general-purpose autonomous agent operating inside cobot, a high-performance agent runtime harness.",
};

export class AgentStore {
  constructor(private readonly vault: Storage) {}

  private getBlobKey(agentId: string): string {
    return `auth:agents:${agentId}:manifest`;
  }

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

    await this.vault.setItem(
      this.getBlobKey(id),
      JSON.stringify(data, null, 2),
    );
    return data;
  }

  async get(id: string): Promise<AgentManifest | null> {
    const cleanId = id.trim().toLowerCase();
    const key = this.getBlobKey(cleanId);

    try {
      const raw = await this.vault.getItem(key);
      if (!raw) {
        if (cleanId === DEFAULT_AGENT_ID) {
          return this.ensureDefaultAgent();
        }
        return null;
      }
      return JSON.parse(raw) as AgentManifest;
    } catch {
      if (cleanId === DEFAULT_AGENT_ID) {
        return this.ensureDefaultAgent();
      }
      return null;
    }
  }

  async list(): Promise<AgentManifest[]> {
    const keys = await this.vault.getKeys("auth");
    const manifests: AgentManifest[] = [];

    for (const key of keys) {
      if (key.includes(":manifest")) {
        try {
          const raw = await this.vault.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as AgentManifest;
            if (parsed && parsed.id) {
              manifests.push(parsed);
            }
          }
        } catch {
          // ignore unreadable
        }
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

    return this.vault.removeItem(this.getBlobKey(cleanId));
  }

  async ensureDefaultAgent(): Promise<AgentManifest> {
    const key = this.getBlobKey(DEFAULT_AGENT_ID);
    const has = await this.vault.hasItem(key);

    if (has) {
      try {
        const raw = await this.vault.getItem(key);
        if (raw) return JSON.parse(raw) as AgentManifest;
      } catch {
        // Overwrite if corrupt
      }
    }

    return this.create(DEFAULT_AGENT_MANIFEST);
  }
}
