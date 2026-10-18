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
import type { AgentRunRequest } from "@cobot/shared";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json());

const engine = new CobotAgentEngine();
const agyOAuth = new AntigravityOAuth();

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

/** AG-UI Event Streaming */
app.post("/api/agent/stream", async (req, res) => {
  const { prompt, cwd, modelName, provider, thinkingLevel, sessionId } =
    req.body as AgentRunRequest;

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
      { prompt, cwd, modelName, provider, thinkingLevel, sessionId },
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
