import express from "express";
import cors from "cors";
import { AGUITransport } from "./ag-ui.js";
import { CobotAgentEngine } from "./engine.js";
import {
  AntigravityOAuth,
  getStoredAuth,
  clearAuth,
} from "./auth/antigravity.js";
import { getAvailableModels } from "./models/catalog.js";
import type { AgentRunRequest, AgentManifest } from "@cobot/ts-shared";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json());

const engine = new CobotAgentEngine();
const agyOAuth = new AntigravityOAuth();

// Initialize vault and default agents
await engine.init();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "cobot-backend", protocol: "ag-ui" });
});

/** Auth status */
app.get("/api/auth/status", async (_req, res) => {
  const auth = await getStoredAuth();
  if (auth && auth.email) {
    res.json({
      authenticated: true,
      email: auth.email,
      provider: "antigravity",
    });
  } else {
    res.json({ authenticated: false });
  }
});

/** Start AGY OAuth login flow */
app.post("/api/auth/antigravity/start", async (_req, res) => {
  try {
    const { authUrl, waitForCompletion } = await agyOAuth.startLoginFlow();
    waitForCompletion().catch((err) =>
      console.error("[AGY OAuth] Error:", err.message),
    );
    res.json({ authUrl });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Logout */
app.post("/api/auth/logout", async (_req, res) => {
  await clearAuth();
  res.json({ ok: true });
});

/** Dynamic model catalog (No hardcoding) */
app.get("/api/models", async (_req, res) => {
  try {
    const auth = await getStoredAuth();
    const models = await getAvailableModels();

    res.json({
      authenticated: !!auth || models.length > 0,
      models,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** --- Agent Manifest Endpoints --- */

/** List all available agents */
app.get("/api/agents", async (_req, res) => {
  try {
    const agents = await engine.vault.agents.list();
    res.json({ agents });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Create or update an agent manifest */
app.post("/api/agents", async (req, res) => {
  try {
    const manifest = req.body as AgentManifest;
    if (!manifest || !manifest.id || !manifest.name) {
      res.status(400).json({ error: "Agent 'id' and 'name' are required." });
      return;
    }
    const created = await engine.vault.agents.create(manifest);
    res.json({ agent: created });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** Get a specific agent manifest */
app.get("/api/agents/:id", async (req, res) => {
  try {
    const agent = await engine.vault.agents.get(req.params.id);
    if (!agent) {
      res.status(404).json({ error: `Agent '${req.params.id}' not found.` });
      return;
    }
    res.json({ agent });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Delete an agent manifest */
app.delete("/api/agents/:id", async (req, res) => {
  try {
    const success = await engine.vault.agents.delete(req.params.id);
    if (!success) {
      res.status(404).json({ error: `Agent '${req.params.id}' not found.` });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** --- Session Endpoints (Scoped by Agent) --- */

/** List sessions, optionally filtered by agentId */
app.get("/api/sessions", async (req, res) => {
  try {
    const agentId =
      typeof req.query.agentId === "string" ? req.query.agentId : undefined;
    const sessions = await engine.vault.sessions.list(agentId);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** List sessions strictly for an agent */
app.get("/api/agents/:id/sessions", async (req, res) => {
  try {
    const sessions = await engine.vault.sessions.list(req.params.id);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Get messages and details for a specific session */
app.get("/api/sessions/:id", async (req, res) => {
  try {
    const session = await engine.vault.sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: `Session '${req.params.id}' not found.` });
      return;
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Delete a session */
app.delete("/api/sessions/:id", async (req, res) => {
  try {
    const success = await engine.vault.sessions.delete(req.params.id);
    if (!success) {
      res.status(404).json({ error: `Session '${req.params.id}' not found.` });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** AG-UI Event Streaming */
app.post("/api/agent/stream", async (req, res) => {
  const {
    prompt,
    cwd,
    modelName,
    provider,
    thinkingLevel,
    sessionId,
    agentId,
  } = req.body as AgentRunRequest;

  if (!prompt || typeof prompt !== "string") {
    res
      .status(400)
      .json({ error: "Missing required 'prompt' field in request body" });
    return;
  }

  const transport = new AGUITransport(res);
  transport.startRun();

  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) {
      abortController.abort();
    }
  });

  try {
    await engine.run(
      { prompt, cwd, modelName, provider, thinkingLevel, sessionId, agentId },
      (event) => {
        switch (event.type) {
          case "text_delta":
            transport.sendTextDelta(event.data.delta as string);
            break;
          case "thinking_delta":
            transport.sendReasoningDelta(event.data.delta as string);
            break;
          case "tool_start":
            transport.sendToolStart(
              event.data.toolCallId as string,
              event.data.toolName as string,
              event.data.args,
            );
            break;
          case "tool_end":
            transport.sendToolEnd(
              event.data.toolCallId as string,
              event.data.toolName as string,
              event.data.isError as boolean,
              event.data.durationMs as number | undefined,
            );
            break;
        }
      },
      abortController.signal,
    );

    transport.finishRun();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    transport.finishRun(message);
  }
});

/** Mid-flight Steering */
app.post("/api/agent/steer", (req, res) => {
  const { sessionId, message } = req.body as {
    sessionId?: string;
    message?: string;
  };

  if (!sessionId || !message) {
    res
      .status(400)
      .json({ error: "Missing required 'sessionId' or 'message'" });
    return;
  }

  const success = engine.steer(sessionId, message);
  if (!success) {
    res
      .status(404)
      .json({ error: `No active agent session found for id '${sessionId}'` });
    return;
  }

  res.json({ ok: true, steered: true });
});

app.listen(PORT, () => {
  console.log(
    `[Cobot] Express AG-UI backend running on http://localhost:${PORT}`,
  );
});
