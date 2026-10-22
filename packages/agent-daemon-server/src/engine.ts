import { Agent } from "@cobot/agent-core";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import { createBaseTools } from "@cobot/tools";
import { createSabhaTools } from "@cobot/agent-mcp";
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
    const now = Date.now();
    agent.steer({
      role: "user",
      content: [{ type: "text", text: message }],
      timestamp: now,
    });
    this.vault.sessions
      .appendMessage(sessionId, {
        id: `msg_steer_${now}`,
        role: "user",
        content: `[Steered]: ${message}`,
        timestamp: now,
      })
      .catch((err) =>
        console.error(
          "[Engine] Failed to append steered message:",
          err.message,
        ),
      );
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
    const sabhaUrl = process.env.SABHA_URL || "http://localhost:8080";
    const tools = [...createBaseTools(cwd), ...createSabhaTools(sabhaUrl)];

    // 1. Resolve agent manifest from vault
    let manifest = await this.vault.agents.get(agentId);
    if (!manifest) {
      manifest = DEFAULT_AGENT_MANIFEST;
    }

    // Dynamic Sabha Agent Context Injection
    const allVaultAgents = await this.vault.agents.list();
    const otherAgentsFormatted = allVaultAgents
      .filter((a) => a.id !== agentId)
      .map(
        (a) =>
          `- ID: "${a.id}", Name: "${a.name}"${a.description ? ` (${a.description})` : ""}`,
      )
      .join("\n");

    const sabhaIdentityContext = `
Your Agent Name: "${manifest.name}"
Your Registered Agent ID: "${agentId}"
Primary Channel: "chan_general"

AVAILABLE AGENTS IN SABHA NETWORK:
${otherAgentsFormatted || "None"}

CRITICAL MULTI-AGENT INSTRUCTIONS:
- You are ALREADY registered in Sabha with Agent ID "${agentId}". DO NOT call 'sabha_register_agent' for yourself.
- When the user asks you to command, delegate, or ping another agent (e.g. "agent 2", "agent-2"):
  1. Immediately invoke 'sabha_send_message' with:
     - channel_id: "chan_general"
     - sender_id: "${agentId}"
     - mentions: ["agent-2"] (use target agent's exact ID from the list above)
     - mention_type: "action"
     - content: "@agent-2 <clear instruction of what to execute>"
  2. The tool returns a JSON object containing 'mention_id'.
  3. If the user asked you to report back, wait for the agent, or return findings:
     - Immediately invoke 'sabha_wait_for_action' with that 'mention_id'!
     - When 'sabha_wait_for_action' returns, summarize the findings and report them directly to the user.
- DO NOT run 'bash' or 'read' to search for agents or do the delegated task yourself.
`;

    const customSections = [
      ...(manifest.customSections || []),
      {
        tag: "sabha_agent_identity",
        content: sabhaIdentityContext,
      },
    ];

    // 2. Build extensible system prompt on top of base
    const systemPrompt = buildAgentPrompt({
      cwd,
      identity: manifest.identity,
      extraTools: manifest.extraTools,
      extraRules: manifest.extraRules,
      extraDogmas: manifest.extraDogmas,
      customSections,
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

    // 4. Resolve model dynamically based on auth status and thinking level
    const { model, isAntigravity, apiKey, headers } = await resolveModel(
      request.provider,
      request.modelName,
      request.thinkingLevel,
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
          if (
            event.message.role === "assistant" &&
            event.message.stopReason === "error" &&
            event.message.errorMessage
          ) {
            const errText = `\n\n⚠️ ${event.message.errorMessage}`;
            assistantText += errText;
            onEvent({
              type: "text_delta",
              data: {
                delta: errText,
                sessionId,
                agentId,
              },
              timestamp,
            });
          }
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

      if (agent.state.errorMessage) {
        throw new Error(agent.state.errorMessage);
      }
    } finally {
      this.activeAgents.delete(sessionId);
      unsubscribe();
    }
  }
}
