export type { AgentManifest } from "@cobot/ts-shared";

export interface SessionMetadata {
  agentId: string;
  title: string;
  messageCount: number;
  cwd?: string;
  model?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface SessionHeader {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  path?: string;
  cwd?: string;
  model?: string;
  provider?: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  tools?: Array<{
    id: string;
    name: string;
    args?: string;
    result?: string;
    isError?: boolean;
    durationMs?: number;
    status?: "running" | "completed" | "error";
  }>;
  timestamp: number;
}
