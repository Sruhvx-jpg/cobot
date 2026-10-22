import { Type, type Static } from "typebox";
import type { AgentTool } from "@cobot/agent-core";

export const RegisterAgentSchema = Type.Object({
  name: Type.String({ description: "Human/system name of the agent" }),
  role: Type.Optional(
    Type.String({
      description: "Operational role (e.g. lead, worker, reviewer)",
    }),
  ),
});

export const CreateChannelSchema = Type.Object({
  name: Type.String({ description: "Channel name (e.g. general, dev)" }),
  topic: Type.Optional(
    Type.String({ description: "Operational directives/context for agents" }),
  ),
  mod_only: Type.Optional(
    Type.Boolean({
      description: "Restrict write access to authoritative agents",
    }),
  ),
});

export const ListChannelsSchema = Type.Object({});

export const SendMessageSchema = Type.Object({
  channel_id: Type.String({ description: "Target channel ID" }),
  sender_id: Type.String({
    description: "Agent ID of the sender (identifies the agent)",
  }),
  content: Type.String({ description: "Message content or task instruction" }),
  mentions: Type.Optional(
    Type.Array(Type.String(), {
      description: "Explicit agent IDs to mention / wake up",
    }),
  ),
  mention_type: Type.Optional(
    Type.String({
      enum: ["info", "action"],
      description: "Intent: 'info' (notice only) or 'action' (task required)",
    }),
  ),
});

export const MarkActionSchema = Type.Object({
  mention_id: Type.String({ description: "ID of the mention/task" }),
  status: Type.String({
    enum: ["completed", "failed"],
    description: "Outcome of the action",
  }),
  session_id: Type.Optional(
    Type.String({ description: "Bound session ID of the execution" }),
  ),
  result: Type.Optional(
    Type.String({
      description: "Summary or artifact output if action completed",
    }),
  ),
  error: Type.Optional(
    Type.String({ description: "Failure reason if action failed" }),
  ),
});

export const SubscribeWebhookSchema = Type.Object({
  agent_id: Type.String({ description: "Agent ID" }),
  webhook_url: Type.String({
    description: "HTTP endpoint where agent receives wake-up events",
  }),
});

export const WaitForActionSchema = Type.Object({
  mention_id: Type.String({
    description:
      "Mention/task ID returned when sending a message with mention_type='action'",
  }),
  timeout_seconds: Type.Optional(
    Type.Number({ description: "Max seconds to wait (default 30, max 120)" }),
  ),
});

async function apiRequest(
  url: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const headers: Record<string, string> = {};
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg =
      (data as { error?: string }).error ||
      `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(errorMsg);
  }

  return data;
}

export function createSabhaTools(
  baseUrl: string = "http://localhost:8080",
): AgentTool[] {
  const registerTool: AgentTool<typeof RegisterAgentSchema> = {
    name: "sabha_register_agent",
    label: "Register Agent in Sabha",
    description:
      "Register an autonomous agent with the Sabha coordination hub and get a unique agent_id.",
    parameters: RegisterAgentSchema,
    execute: async (
      _toolCallId,
      params: Static<typeof RegisterAgentSchema>,
      signal,
    ) => {
      try {
        const data = await apiRequest(
          `${baseUrl}/agents/register`,
          "POST",
          params,
          signal,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          details: data,
          isError: false,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error registering agent: ${(err as Error).message}`,
            },
          ],
          details: undefined,
          isError: true,
        };
      }
    },
  };

  const createChannelTool: AgentTool<typeof CreateChannelSchema> = {
    name: "sabha_create_channel",
    label: "Create Sabha Channel",
    description: "Create a new text coordination channel in Sabha.",
    parameters: CreateChannelSchema,
    execute: async (
      _toolCallId,
      params: Static<typeof CreateChannelSchema>,
      signal,
    ) => {
      try {
        const data = await apiRequest(
          `${baseUrl}/channels`,
          "POST",
          params,
          signal,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          details: data,
          isError: false,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating channel: ${(err as Error).message}`,
            },
          ],
          details: undefined,
          isError: true,
        };
      }
    },
  };

  const listChannelsTool: AgentTool<typeof ListChannelsSchema> = {
    name: "sabha_list_channels",
    label: "List Sabha Channels",
    description: "Retrieve all available coordination channels in Sabha.",
    parameters: ListChannelsSchema,
    execute: async (_toolCallId, _params, signal) => {
      try {
        const data = await apiRequest(
          `${baseUrl}/channels`,
          "GET",
          undefined,
          signal,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          details: data,
          isError: false,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing channels: ${(err as Error).message}`,
            },
          ],
          details: undefined,
          isError: true,
        };
      }
    },
  };

  const sendMessageTool: AgentTool<typeof SendMessageSchema> = {
    name: "sabha_send_message",
    label: "Send Message to Sabha Channel",
    description:
      "Send a message or delegate a task to a channel. Use mention_type='action' when requesting an agent to take action.",
    parameters: SendMessageSchema,
    execute: async (
      _toolCallId,
      params: Static<typeof SendMessageSchema>,
      signal,
    ) => {
      try {
        const data = await apiRequest(
          `${baseUrl}/channels/${params.channel_id}/messages`,
          "POST",
          params,
          signal,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          details: data,
          isError: false,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error sending message: ${(err as Error).message}`,
            },
          ],
          details: undefined,
          isError: true,
        };
      }
    },
  };

  const markActionTool: AgentTool<typeof MarkActionSchema> = {
    name: "sabha_mark_action",
    label: "Mark Action Outcome",
    description:
      "Mark a received task action as 'completed' or 'failed', streaming the result live back to the commanding agent over SSE.",
    parameters: MarkActionSchema,
    execute: async (
      _toolCallId,
      params: Static<typeof MarkActionSchema>,
      signal,
    ) => {
      try {
        const data = await apiRequest(
          `${baseUrl}/mentions/${params.mention_id}/action`,
          "POST",
          params,
          signal,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          details: data,
          isError: false,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error marking action: ${(err as Error).message}`,
            },
          ],
          details: undefined,
          isError: true,
        };
      }
    },
  };

  const subscribeWebhookTool: AgentTool<typeof SubscribeWebhookSchema> = {
    name: "sabha_subscribe_webhook",
    label: "Subscribe Agent Webhook",
    description:
      "Register the HTTP webhook endpoint where this agent receives wake-up pings and action delegations.",
    parameters: SubscribeWebhookSchema,
    execute: async (
      _toolCallId,
      params: Static<typeof SubscribeWebhookSchema>,
      signal,
    ) => {
      try {
        const data = await apiRequest(
          `${baseUrl}/webhooks/subscribe`,
          "POST",
          params,
          signal,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          details: data,
          isError: false,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error subscribing webhook: ${(err as Error).message}`,
            },
          ],
          details: undefined,
          isError: true,
        };
      }
    },
  };

  const waitForActionTool: AgentTool<typeof WaitForActionSchema> = {
    name: "sabha_wait_for_action",
    label: "Wait For Delegated Action Outcome",
    description:
      "Wait for a commanded agent to finish executing a delegated task. Resolves as soon as the agent marks the action completed or failed, returning their output.",
    parameters: WaitForActionSchema,
    execute: async (
      _toolCallId,
      params: Static<typeof WaitForActionSchema>,
      signal,
    ) => {
      const maxSeconds = Math.min(params.timeout_seconds || 30, 120);
      const startTime = Date.now();
      const endTime = startTime + maxSeconds * 1000;

      while (Date.now() < endTime) {
        if (signal?.aborted) {
          return {
            content: [{ type: "text", text: "Waiting aborted by user" }],
            details: undefined,
            isError: true,
          };
        }

        try {
          const data = await apiRequest(
            `${baseUrl}/mentions/${params.mention_id}`,
            "GET",
            undefined,
            signal,
          );

          if (
            data.action_status === "completed" ||
            data.action_status === "failed"
          ) {
            return {
              content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
              details: data,
              isError: data.action_status === "failed",
            };
          }
        } catch {
          // Retry on intermittent network hiccup
        }

        // Poll every 600ms
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      return {
        content: [
          {
            type: "text",
            text: `Timed out waiting after ${maxSeconds}s. Task is still in progress.`,
          },
        ],
        details: { status: "pending", timeout: true },
        isError: false,
      };
    },
  };

  return [
    registerTool,
    createChannelTool,
    listChannelsTool,
    sendMessageTool,
    markActionTool,
    subscribeWebhookTool,
    waitForActionTool,
  ];
}
