import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export interface SabhaMcpOptions {
  baseUrl?: string;
}

export function createSabhaMcpServer(options: SabhaMcpOptions = {}) {
  const baseUrl =
    options.baseUrl || process.env.SABHA_URL || "http://localhost:8080";

  const server = new McpServer({
    name: "sabha-mcp",
    version: "0.0.0-unstable-alpha.0",
  });

  // Tool: Register Agent
  server.tool(
    "sabha_register_agent",
    "Register an agent in Sabha to receive an agent_id",
    {
      name: z.string().describe("Agent display/system name"),
      role: z
        .string()
        .optional()
        .describe("Role (e.g. worker, lead, reviewer)"),
    },
    async ({ name, role }) => {
      const res = await fetch(`${baseUrl}/agents/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role }),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // Tool: Create Channel
  server.tool(
    "sabha_create_channel",
    "Create a new text channel in Sabha",
    {
      name: z.string().describe("Channel name"),
      topic: z
        .string()
        .optional()
        .describe("Operational context or directives"),
      mod_only: z
        .boolean()
        .optional()
        .describe("Restrict posting to authoritative agents"),
    },
    async ({ name, topic, mod_only }) => {
      const res = await fetch(`${baseUrl}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, topic, mod_only }),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // Tool: List Channels
  server.tool(
    "sabha_list_channels",
    "List all available channels in Sabha",
    {},
    async () => {
      const res = await fetch(`${baseUrl}/channels`);
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // Tool: Send Message
  server.tool(
    "sabha_send_message",
    "Send a message or delegate a task to a channel",
    {
      channel_id: z.string().describe("Target channel ID"),
      sender_id: z.string().describe("Your agent ID"),
      content: z.string().describe("Message content or instructions"),
      mentions: z.array(z.string()).optional().describe("Agent IDs to mention"),
      mention_type: z
        .enum(["info", "action"])
        .optional()
        .describe(
          "Intent: 'info' (FYI) or 'action' (command requiring execution)",
        ),
    },
    async ({ channel_id, sender_id, content, mentions, mention_type }) => {
      const res = await fetch(`${baseUrl}/channels/${channel_id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender_id, content, mentions, mention_type }),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // Tool: Mark Action
  server.tool(
    "sabha_mark_action",
    "Mark a task action as completed or failed, streaming the result live back to the commander",
    {
      mention_id: z.string().describe("Mention ID from the wake-up webhook"),
      status: z.enum(["completed", "failed"]).describe("Action outcome"),
      session_id: z.string().optional().describe("Bound execution session ID"),
      result: z.string().optional().describe("Output summary if completed"),
      error: z.string().optional().describe("Failure reason if failed"),
    },
    async ({ mention_id, status, session_id, result, error }) => {
      const res = await fetch(`${baseUrl}/mentions/${mention_id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, session_id, result, error }),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // Tool: Subscribe Webhook
  server.tool(
    "sabha_subscribe_webhook",
    "Register a webhook URL to receive wake-up pings and action delegations",
    {
      agent_id: z.string().describe("Your agent ID"),
      webhook_url: z
        .string()
        .describe("HTTP endpoint where you receive wake-up events"),
    },
    async ({ agent_id, webhook_url }) => {
      const res = await fetch(`${baseUrl}/webhooks/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id, webhook_url }),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  return server;
}

export async function runSabhaMcpStdio(options: SabhaMcpOptions = {}) {
  const server = createSabhaMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
