export type Theme = "dark" | "light";

export interface ToolCall {
  id: string;
  name: string;
  args?: string;
  result?: string;
  isError?: boolean;
  durationMs?: number;
  status: "running" | "completed" | "error";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  tools?: ToolCall[];
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}

export interface ModelOption {
  id: string;
  provider: string;
  label: string;
}

export interface AuthStatus {
  authenticated: boolean;
  email?: string;
  provider?: string;
}
