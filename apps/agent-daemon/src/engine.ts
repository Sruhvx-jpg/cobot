import { Agent } from "@cobot/agent-core";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import { createBaseTools } from "@cobot/tools";
import { buildAgentPrompt } from "@cobot/agent-prompt";
import { CobotVault, DEFAULT_AGENT_MANIFEST } from "@cobot/vault";
import { resolveModel } from "./models/catalog.js";
import { streamAntigravity } from "./models/antigravity-stream.js";
import type { AgentRunRequest, AgentDomainEvent } from "@cobot/ts-shared";

export class CobotAgentEngine {
  private activeAgents = new Map<string, Agent>();
  public readonly vault: CobotVault;

  constructor(vault?: CobotVault) {
    this.vault = vault || new CobotVault();
  }

  async init(): Promise<void> {
    await this.vault.init();
  }

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
    const agentId = request.agentId || "default";
    const tools = createBaseTools(cwd);

    // 1. Resolve agent manifest from vault
    let manifest = await this.vault.agents.get(agentId);
    if (!manifest) {
      manifest = DEFAULT_AGENT_MANIFEST;
    }

    // 2. Build extensible system prompt on top of base
    const systemPrompt = buildAgentPrompt({
      cwd,
      identity: manifest.identity,
      extraTools: manifest.extraTools,
      extraRules: manifest.extraRules,
      extraDogmas: manifest.extraDogmas,
      customSections: manifest.customSections,
    });

    // 3. Re-hydrate past turns from session storage
    const sessionData = await this.vault.sessions.get(sessionId);
    const priorAgentMessages: any[] = [];
    if (sessionData && sessionData.messages.length > 0) {
      for (const m of sessionData.messages) {
        if (m.role === "user") {
          priorAgentMessages.push({
            role: "user",
            content: [{ type: "text", text: m.content }],
            timestamp: m.timestamp,
          });
        } else if (m.role === "assistant") {
          priorAgentMessages.push({
            role: "assistant",
            content: [{ type: "text", text: m.content }],
            timestamp: m.timestamp,
          });
        }
      }
    }

    // 4. Resolve model dynamically based on auth status
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
        systemPrompt,
        messages: priorAgentMessages,
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

    // Record incoming user prompt in session
    await this.vault.sessions.appendMessage(
      sessionId,
      {
        id: `msg_user_${Date.now()}`,
        role: "user",
        content: request.prompt,
        timestamp: Date.now(),
      },
      agentId,
    );

    let assistantText = "";
    let assistantReasoning = "";

    const unsubscribe = agent.subscribe(async (event) => {
      const timestamp = Date.now();
      switch (event.type) {
        case "message_update": {
          const streamEv = event.assistantMessageEvent;
          if (streamEv.type === "text_delta") {
            assistantText += streamEv.delta;
            onEvent({
              type: "text_delta",
              data: { delta: streamEv.delta, sessionId, agentId },
              timestamp,
            });
          } else if (streamEv.type === "thinking_delta") {
            assistantReasoning += streamEv.delta;
            onEvent({
              type: "thinking_delta",
              data: { delta: streamEv.delta, sessionId, agentId },
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
              agentId,
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
              agentId,
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
              agentId,
            },
            timestamp,
          });
          break;

        case "turn_end":
          onEvent({
            type: "turn_end",
            data: { message: event.message, sessionId, agentId },
            timestamp,
          });
          break;

        case "agent_end":
          onEvent({
            type: "agent_end",
            data: { messageCount: event.messages.length, sessionId, agentId },
            timestamp,
          });
          break;
      }
    });

    try {
      await agent.prompt(request.prompt);

      // Append assistant's final response to session log
      if (
        assistantText.trim().length > 0 ||
        assistantReasoning.trim().length > 0
      ) {
        await this.vault.sessions.appendMessage(
          sessionId,
          {
            id: `msg_asst_${Date.now()}`,
            role: "assistant",
            content: assistantText,
            reasoning: assistantReasoning || undefined,
            timestamp: Date.now(),
          },
          agentId,
        );
      }
    } finally {
      this.activeAgents.delete(sessionId);
      unsubscribe();
    }
  }
}
