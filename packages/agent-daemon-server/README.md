# @cobot/agent-daemon-server

Express.js AG-UI streaming backend engine, OAuth manager, and agent runner for **Cobot**.

---

## Architecture

Extracted from `apps/agent-daemon` into a reusable workspace package so the host daemon remains an ultra-lean runner.

### Key Components:

- **`src/server.ts`**: Express application factory (`createDaemonServer()`, `startDaemonServer()`).
  - Automatically syncs vault agents with Sabha on boot (`[Sabha Sync]`).
  - Webhook listener endpoint: `POST /api/agents/:agentId/wake` for background task delegations.
- **`src/engine.ts`**: `CobotAgentEngine` orchestrating `@cobot/agent-core` turn loops.
  - Dynamically injects agent identity (`agentId`, role, network agents) into system prompt.
  - Equips agents with both filesystem tools (`@cobot/tools`) and Sabha coordination tools (`@cobot/agent-mcp`).
  - Supports mid-flight steering (`POST /api/agent/steer`).
- **`src/ag-ui.ts`**: `AGUITransport` streaming protocol adapter for CopilotKit / assistant-ui.
- **`src/auth/`**: Google Antigravity OAuth and local credential vault.
- **`src/models/`**: Clean model catalog and Gemini schema sanitization (`sanitizeGeminiSchema`).

---

## Usage in Host Daemon (`apps/agent-daemon`)

```ts
import { createDaemonServer } from "@cobot/agent-daemon-server";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const server = await createDaemonServer({ port: PORT });
await server.start();
```
