import type { Storage } from "@cobot/vault";
import type { SessionHeader, SessionMetadata, StoredMessage } from "./types.js";

const DEFAULT_AGENT_ID = "default";

export class SessionStore {
  constructor(private readonly vault: Storage) {}

  private getBlobKey(sessionId: string): string {
    return `auth:sessions:${sessionId}`;
  }

  async list(agentId?: string): Promise<SessionHeader[]> {
    const keys = await this.vault.getKeys("auth");
    const headers: SessionHeader[] = [];

    for (const key of keys) {
      if (!key.startsWith("auth:sessions:")) continue;
      const sessionId = key.replace(/^auth:sessions:/, "");

      try {
        const raw = await this.vault.getItem(key);
        if (!raw) continue;
        const firstLine = raw.split("\n")[0];
        if (!firstLine) continue;

        const parsed = JSON.parse(firstLine);
        if (parsed.__cobot_header) {
          if (agentId && parsed.agentId !== agentId) continue;
          headers.push({
            id: sessionId,
            agentId: parsed.agentId || DEFAULT_AGENT_ID,
            title: parsed.title || "Untitled Session",
            createdAt: parsed.createdAt || Date.now(),
            updatedAt: parsed.updatedAt || Date.now(),
            messageCount: parsed.messageCount || 0,
            cwd: parsed.cwd,
            model: parsed.model,
            provider: parsed.provider,
          });
        }
      } catch {
        // Skip unparseable
      }
    }

    return headers.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(
    sessionId: string,
  ): Promise<{ header: SessionHeader; messages: StoredMessage[] } | null> {
    const raw = await this.vault.getItem(this.getBlobKey(sessionId));
    if (!raw) return null;

    try {
      const lines = raw.trim().split("\n").filter(Boolean);
      if (lines.length === 0) return null;

      const messages: StoredMessage[] = [];
      let headerLine: Record<string, unknown> = {};

      for (let i = 0; i < lines.length; i++) {
        const obj = JSON.parse(lines[i]);
        if (i === 0 && obj.__cobot_header) {
          headerLine = obj;
        } else {
          messages.push(obj as StoredMessage);
        }
      }

      const header: SessionHeader = {
        id: sessionId,
        agentId: (headerLine.agentId as string) || DEFAULT_AGENT_ID,
        title: (headerLine.title as string) || "Untitled Session",
        createdAt: (headerLine.createdAt as number) || Date.now(),
        updatedAt: (headerLine.updatedAt as number) || Date.now(),
        messageCount: messages.length,
        cwd: headerLine.cwd as string | undefined,
        model: headerLine.model as string | undefined,
        provider: headerLine.provider as string | undefined,
      };

      return { header, messages };
    } catch {
      return null;
    }
  }

  async create(
    sessionId: string,
    title = "New Session",
    options?: Partial<SessionMetadata>,
  ): Promise<SessionHeader> {
    const agentId = options?.agentId || DEFAULT_AGENT_ID;
    const now = Date.now();

    const headerPayload =
      JSON.stringify({
        __cobot_header: true,
        id: sessionId,
        agentId,
        title,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        ...options,
      }) + "\n";

    await this.vault.setItem(this.getBlobKey(sessionId), headerPayload);

    return {
      id: sessionId,
      agentId,
      title,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      cwd: options?.cwd,
      model: options?.model,
      provider: options?.provider,
    };
  }

  async appendMessage(
    sessionId: string,
    message: StoredMessage,
    agentId = DEFAULT_AGENT_ID,
  ): Promise<void> {
    const existing = await this.get(sessionId);
    const now = Date.now();

    if (!existing) {
      await this.create(sessionId, "New Session", { agentId });
    }

    const current = (await this.get(sessionId))!;
    let title = current.header.title;
    if (title === "New Session" && message.role === "user" && message.content) {
      title = message.content.trim().slice(0, 32);
    }

    const updatedHeader = {
      __cobot_header: true,
      id: sessionId,
      agentId: current.header.agentId || agentId,
      title,
      createdAt: current.header.createdAt,
      updatedAt: now,
      messageCount: current.messages.length + 1,
      cwd: current.header.cwd,
      model: current.header.model,
      provider: current.header.provider,
    };

    const lines = [
      JSON.stringify(updatedHeader),
      ...current.messages.map((m) => JSON.stringify(m)),
      JSON.stringify(message),
    ];

    await this.vault.setItem(
      this.getBlobKey(sessionId),
      lines.join("\n") + "\n",
    );
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.vault.removeItem(this.getBlobKey(sessionId));
  }
}
