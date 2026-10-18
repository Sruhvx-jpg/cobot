import { Agent } from "@cobot/agent-core";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import { createBaseTools } from "./tools/index.js";
import { resolveModel } from "./models/catalog.js";
import { streamAntigravity } from "./models/antigravity-stream.js";
import type { AgentRunRequest, AgentDomainEvent } from "@cobot/shared";

export class CobotAgentEngine {
  private activeAgents = new Map<string, Agent>();

  steer(sessionId: string, message: string): boolean {
    const agent = this.activeAgents.get(sessionId);
    if (!agent) return false;
    agent.steer({
      role: "user",
      content: [{ type: "text", text: message }],
      timestamp: Date.now(),
    });
    return true;
  }

  async run(
    request: AgentRunRequest,
    onEvent: (event: AgentDomainEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const cwd = request.cwd || process.cwd();
    const sessionId = request.sessionId || `session_${Date.now()}`;
    const tools = createBaseTools(cwd);

    // Resolve model dynamically based on auth status
    const { model, isAntigravity, apiKey, headers } = await resolveModel(
      request.provider,
      request.modelName,
    );

    const streamFn = isAntigravity
      ? streamAntigravity
      : (m: any, ctx: any, opts: any) =>
          streamSimple(m, ctx, {
            ...opts,
            apiKey: apiKey || opts?.apiKey,
            headers: headers ? { ...opts?.headers, ...headers } : opts?.headers,
          });

    const agent = new Agent({
      initialState: {
        model,
        tools,
        systemPrompt: `You are an expert coding assistant operating inside the Cobot harness.
Working directory: ${cwd}
Available tools: read, write, bash.
Be helpful, proactive, and concise.`,
        thinkingLevel: request.thinkingLevel ?? "medium",
      },
      streamFn,
      toolExecution: "parallel",
      sessionId,
    });

    this.activeAgents.set(sessionId, agent);

    // Wire external cancellation
    if (signal) {
      if (signal.aborted) {
        agent.abort();
        return;
      }
      signal.addEventListener("abort", () => agent.abort(), { once: true });
    }

    const unsubscribe = agent.subscribe(async (event) => {
      const timestamp = Date.now();
      switch (event.type) {
        case "message_update": {
          const streamEv = event.assistantMessageEvent;
          if (streamEv.type === "text_delta") {
            onEvent({
              type: "text_delta",
              data: { delta: streamEv.delta, sessionId },
              timestamp,
            });
          } else if (streamEv.type === "thinking_delta") {
            onEvent({
              type: "thinking_delta",
              data: { delta: streamEv.delta, sessionId },
              timestamp,
            });
          }
          break;
        }

        case "tool_execution_start":
          onEvent({
            type: "tool_start",
            data: {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
              sessionId,
            },
            timestamp,
          });
          break;

        case "tool_execution_update":
          onEvent({
            type: "tool_update",
            data: {
              toolCallId: event.toolCallId,
              partialResult: event.partialResult,
              sessionId,
            },
            timestamp,
          });
          break;

        case "tool_execution_end":
          onEvent({
            type: "tool_end",
            data: {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              isError: event.isError,
              durationMs: event.durationMs,
              sessionId,
            },
            timestamp,
          });
          break;

        case "turn_end":
          onEvent({
            type: "turn_end",
            data: { message: event.message, sessionId },
            timestamp,
          });
          break;

        case "agent_end":
          onEvent({
            type: "agent_end",
            data: { messageCount: event.messages.length, sessionId },
            timestamp,
          });
          break;
      }
    });

    try {
      await agent.prompt(request.prompt);
    } finally {
      this.activeAgents.delete(sessionId);
      unsubscribe();
    }
  }
}
