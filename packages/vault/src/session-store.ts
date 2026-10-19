import type { SimpleVault } from "./simple-vault.js";
import type {
  Inode,
  SessionHeader,
  SessionMetadata,
  StoredMessage,
} from "./types.js";

const DEFAULT_AGENT_ID = "default";

export class SessionStore {
  constructor(private readonly simpleVault: SimpleVault) {}

  async list(agentId?: string): Promise<SessionHeader[]> {
    const inodes = this.simpleVault.list({ mimeType: "application/x-ndjson" });

    return inodes
      .filter((inode) => {
        if (!inode.path.includes("sessions/")) return false;
        if (!agentId) return true;
        const meta = inode.metadata as SessionMetadata | undefined;
        return (meta?.agentId || DEFAULT_AGENT_ID) === agentId;
      })
      .map((inode) => {
        const meta = (inode.metadata || {}) as SessionMetadata;
        return {
          id: inode.id,
          agentId: meta.agentId || DEFAULT_AGENT_ID,
          title: meta.title || "Untitled Session",
          createdAt: inode.createdAt,
          updatedAt: inode.updatedAt,
          messageCount: meta.messageCount || 0,
          path: inode.path,
          cwd: meta.cwd,
          model: meta.model,
          provider: meta.provider,
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(
    sessionId: string,
  ): Promise<{ header: SessionHeader; messages: StoredMessage[] } | null> {
    const inode = this.simpleVault.stat(sessionId) as
      Inode<SessionMetadata> | undefined;
    if (!inode) return null;

    try {
      const raw = await this.simpleVault.read(sessionId);
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

      const meta = inode.metadata || {
        agentId: (headerLine.agentId as string) || DEFAULT_AGENT_ID,
        title: (headerLine.title as string) || "Untitled Session",
        messageCount: messages.length,
      };

      const header: SessionHeader = {
        id: inode.id,
        agentId:
          meta.agentId || (headerLine.agentId as string) || DEFAULT_AGENT_ID,
        title: meta.title || "Untitled Session",
        createdAt: inode.createdAt,
        updatedAt: inode.updatedAt,
        messageCount: messages.length,
        path: inode.path,
        cwd: meta.cwd,
        model: meta.model,
        provider: meta.provider,
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
        ...options,
      }) + "\n";

    const inode = await this.simpleVault.write<SessionMetadata>(
      sessionId,
      headerPayload,
      {
        subDir: `agents/${agentId}/sessions`,
        mimeType: "application/x-ndjson",
        metadata: {
          agentId,
          title,
          messageCount: 0,
          ...options,
        },
      },
    );

    return {
      id: sessionId,
      agentId,
      title,
      createdAt: inode.createdAt,
      updatedAt: inode.updatedAt,
      messageCount: 0,
      path: inode.path,
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
    let inode = this.simpleVault.stat(sessionId) as
      Inode<SessionMetadata> | undefined;

    if (!inode) {
      await this.create(sessionId, "New Session", { agentId });
      inode = this.simpleVault.stat(sessionId) as Inode<SessionMetadata>;
    }

    const currentMeta = inode.metadata || {
      agentId,
      title: "New Session",
      messageCount: 0,
    };
    let title = currentMeta.title;

    // Auto-title from first user message
    if (title === "New Session" && message.role === "user" && message.content) {
      title = message.content.trim().slice(0, 32);
    }

    const messageCount = (currentMeta.messageCount || 0) + 1;
    const chunk = JSON.stringify(message) + "\n";

    await this.simpleVault.append<SessionMetadata>(sessionId, chunk, {
      subDir: `agents/${currentMeta.agentId || agentId}/sessions`,
      metadata: {
        ...currentMeta,
        agentId: currentMeta.agentId || agentId,
        title,
        messageCount,
      },
    });
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.simpleVault.delete(sessionId);
  }
}
