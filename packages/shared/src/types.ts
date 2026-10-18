export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";

export interface AgentRunRequest {
  prompt: string;
  cwd?: string;
  sessionId?: string;
  modelName?: string;
  provider?: string;
  thinkingLevel?: ThinkingLevel;
}

export interface AgentDomainEvent {
  type:
    | "text_delta"
    | "thinking_delta"
    | "tool_start"
    | "tool_update"
    | "tool_end"
    | "turn_end"
    | "agent_end";
  data: Record<string, unknown>;
  timestamp: number;
}
