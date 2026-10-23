import express, { type Express } from "express";
import cors from "cors";
import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AGUITransport } from "./ag-ui.js";
import { CobotAgentEngine } from "./engine.js";
import {
  AntigravityOAuth,
  getStoredAuth,
  clearAuth,
} from "./auth/antigravity.js";
import { CredentialVault } from "./auth/vault.js";
import { getAvailableModels } from "./models/catalog.js";
import type { AgentRunRequest, AgentManifest } from "@cobot/ts-shared";

export interface DaemonServerOptions {
  port?: number;
}

export interface DaemonServerInstance {
  app: Express;
  engine: CobotAgentEngine;
  start: () => Promise<void>;
}

export async function createDaemonServer(
  options: DaemonServerOptions = {},
): Promise<DaemonServerInstance> {
  const app = express();
  const port =
    options.port || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

  app.use(cors());
  app.use(express.json());

  const engine = new CobotAgentEngine();
  const agyOAuth = new AntigravityOAuth();

  // Initialize vault and default agents
  await engine.init();

  // Auto-register vault agents with Sabha and subscribe their wake-up webhooks
  const sabhaUrl = process.env.SABHA_URL || "http://localhost:8080";
  const syncAgentsWithSabha = async () => {
    try {
      const agents = await engine.vault.agents.list();
      for (const a of agents) {
        await fetch(`${sabhaUrl}/agents/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: a.name || a.id, role: a.id }),
        }).catch(() => {});

        await fetch(`${sabhaUrl}/webhooks/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_id: a.id,
            webhook_url: `http://localhost:${port}/api/agents/${a.id}/wake`,
          }),
        }).catch(() => {});
      }
      console.log(
        `[Sabha Sync] Successfully synced ${agents.length} vault agents with Sabha at ${sabhaUrl}`,
      );
    } catch {
      // Ignore if Sabha is still booting
    }
  };

  syncAgentsWithSabha();
  setTimeout(syncAgentsWithSabha, 3000);

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
        credentials: auth,
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

  /** Sync / Push credentials directly from Desktop into VM Vault */
  app.post("/api/auth/sync", async (req, res) => {
    try {
      const payload = req.body.credentials || req.body;
      const provider = req.body.provider || payload.provider || "antigravity";

      if (!payload.access_token) {
        return res
          .status(400)
          .json({ error: "Missing access_token in credentials payload" });
      }

      await CredentialVault.set(provider, {
        provider,
        email: payload.email,
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_at: payload.expires_at || Date.now() + 3600 * 1000,
        projectId: payload.projectId,
      });

      console.log(
        `[Auth Sync] Credentials synced for ${provider} (${payload.email || "no-email"})`,
      );
      res.json({ ok: true, provider });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
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

  /** --- System Tunnel & Remote Seeding Endpoints --- */
  const execAsync = promisify(exec);
  const tunnelRuntimePath = join(homedir(), ".cobot", "runtime", "tunnel.json");

  app.get("/api/system/tunnel", async (_req, res) => {
    try {
      if (existsSync(tunnelRuntimePath)) {
        const raw = await readFile(tunnelRuntimePath, "utf-8");
        return res.json({ active: true, ...JSON.parse(raw) });
      }
      res.json({ active: false });
    } catch {
      res.json({ active: false });
    }
  });

  let activeTunnelProc: any = null;

  app.post("/api/system/tunnel/start", async (_req, res) => {
    try {
      if (activeTunnelProc && existsSync(tunnelRuntimePath)) {
        const raw = await readFile(tunnelRuntimePath, "utf-8");
        return res.json({ active: true, ...JSON.parse(raw) });
      }

      const scriptPath = join(process.cwd(), "scripts", "tunnel-pair.sh");
      const resolvedScript = existsSync(scriptPath)
        ? scriptPath
        : join(
            homedir(),
            "Documents",
            "programming",
            "cobot",
            "scripts",
            "tunnel-pair.sh",
          );

      activeTunnelProc = spawn("bash", [resolvedScript], {
        env: { ...process.env, PORT: port.toString() },
        detached: true,
        stdio: "ignore",
      });
      activeTunnelProc.unref();

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (existsSync(tunnelRuntimePath)) {
          const raw = await readFile(tunnelRuntimePath, "utf-8");
          return res.json({ active: true, ...JSON.parse(raw) });
        }
      }

      res.status(504).json({ error: "Tunnel startup timed out" });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/system/tunnel/stop", async (_req, res) => {
    try {
      if (existsSync(tunnelRuntimePath)) {
        try {
          const raw = await readFile(tunnelRuntimePath, "utf-8");
          const data = JSON.parse(raw);
          if (data.pid) {
            process.kill(data.pid, "SIGTERM");
          }
        } catch {}
        await unlink(tunnelRuntimePath).catch(() => {});
      }
      activeTunnelProc = null;
      res.json({ active: false, ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/system/seed", async (req, res) => {
    const { target } = req.body;
    if (!target) {
      return res.status(400).json({ error: "Missing 'target' parameter" });
    }

    try {
      const cobotHome = process.env.COBOT_HOME || join(homedir(), ".cobot");
      let command = "";

      if (target.startsWith("instabox:")) {
        const boxName = target.replace(/^instabox:/, "").trim();
        command = `tar czf - -C "${cobotHome}" . | instabox exec ${boxName} -- bash -c "mkdir -p /data/home/.cobot && tar xzf - -C /data/home/.cobot"`;
      } else {
        command = `tar czf - -C "${cobotHome}" . | ssh -C ${target} "mkdir -p ~/.cobot && tar xzf - -C ~/.cobot"`;
      }

      await execAsync(command, { timeout: 60000 });
      res.json({
        ok: true,
        target,
        message: "Ecosystem successfully seeded to target node",
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
      const body = req.body as Partial<AgentManifest>;
      if (
        !body ||
        !body.name ||
        typeof body.name !== "string" ||
        !body.name.trim()
      ) {
        res.status(400).json({ error: "Agent 'name' is required." });
        return;
      }
      const name = body.name.trim();
      const id =
        body.id?.trim().toLowerCase() ||
        name
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .replace(/-+/g, "-");

      const manifest: AgentManifest = {
        ...body,
        id,
        name,
      };

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
        res
          .status(404)
          .json({ error: `Session '${req.params.id}' not found.` });
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
        res
          .status(404)
          .json({ error: `Session '${req.params.id}' not found.` });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
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

  /** Webhook Wake-Up Endpoint for Sabha Mentions / Action Delegations */
  app.post("/api/agents/:agentId/wake", async (req, res) => {
    const { agentId } = req.params;
    const {
      mention_id,
      session_id,
      action_required,
      content,
      sender_id,
      channel_id,
    } = req.body as {
      mention_id?: string;
      session_id?: string;
      action_required?: boolean;
      content?: string;
      sender_id?: string;
      channel_id?: string;
    };

    res.status(200).json({
      status: "acknowledged",
      agent_id: agentId,
      mention_id,
      session_id,
    });

    // If an action is required, trigger an isolated background agent turn!
    if (action_required && content) {
      const taskPrompt = `[Task Delegation from @${sender_id || "commander"} in channel ${channel_id || "general"}]\n${content}\n\n[MANDATORY INSTRUCTION]: Execute the requested task thoroughly using your available tools. Once you have completed the task or if you fail, you MUST invoke the 'sabha_mark_action' tool with:
- mention_id: '${mention_id}'
- session_id: '${session_id}'
- status: 'completed' (or 'failed')
- result: your full, detailed findings, answer, and report.
This will immediately report your completed work back to @${sender_id || "commander"}.`;

      engine
        .run(
          {
            prompt: taskPrompt,
            agentId,
            sessionId: session_id || `session_${mention_id}`,
            modelName: "gemini-3.8-flash-high",
            provider: "antigravity",
            thinkingLevel: "low",
          },
          () => {}, // background run
        )
        .catch((err) => {
          console.error(
            `[Sabha Wake-Up] Agent ${agentId} execution failed:`,
            (err as Error).message,
          );
        });
    }
  });

  return {
    app,
    engine,
    start: () =>
      new Promise<void>((resolve) => {
        app.listen(port, () => {
          console.log(
            `[Cobot] Express AG-UI backend running on http://localhost:${port}`,
          );
          resolve();
        });
      }),
  };
}
