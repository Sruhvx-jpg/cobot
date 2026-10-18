# Cobot Developer & Agent Operational Directives

This document is the single source of truth for AI agents and developers working on **Cobot**. Read this completely before making architectural choices or modifying streaming/agent logic.

---

## 1. Monorepo Architecture

Cobot is orchestrated with **Turborepo** and **pnpm workspaces**:

```
cobot/
├── apps/
│   ├── agent-daemon/     # Express.js AG-UI SSE streaming server (port 3000)
│   │   ├── src/
│   │   │   ├── auth/     # Antigravity Google OAuth PKCE handler
│   │   │   ├── models/   # Live model catalog & Antigravity stream adapter
│   │   │   ├── tools/    # Strongly typed coding tools (read, write, bash)
│   │   │   ├── engine.ts # Headless CobotAgentEngine (zero HTTP awareness)
│   │   │   ├── ag-ui.ts  # AG-UI protocol event serializer
│   │   │   └── server.ts # Express routes (stream, steer, auth, models)
│   │   └── package.json
│   │
│   └── desktop/          # Tauri 2.0 desktop shell + Vite + React + Tailwind
│       ├── src/
│       │   ├── components/ # 100% modular, isolated components
│       │   ├── hooks/      # useSessions, useAgentStream
│       │   ├── context/    # ThemeContext (dark/light)
│       │   └── styles.css  # Pitch black (#000000) & corner smoothing
│       ├── src-tauri/      # Rust desktop harness (Cargo.toml, tauri.conf.json)
│       └── package.json
│
├── packages/
│   ├── agent-core/       # Headless turn-loop engine (@cobot/agent-core)
│   └── shared/           # Shared domain types, Result wrappers, utils (@cobot/shared)
│
├── turbo.json            # Task pipeline (build, check-types, dev)
└── pnpm-workspace.yaml   # Workspace membership
```

---

## 2. Hard-Learned Anti-Patterns & Critical System Rules

### A. The Node.js SSE Abort Hazard (`req.on("close")` vs `res.on("close")`)
- **The Bug**: Listening to `req.on("close", () => abortController.abort())` on POST requests.
- **Why it Fails**: In Node.js `http.IncomingMessage`, `req.on("close")` fires as soon as the client finishes uploading its JSON POST body. If you check `!res.writableEnded`, it evaluates to `true` because the response stream just started. This instantly kills the agent run within 1–2ms before any LLM tokens can be generated.
- **The Rule**: Always listen to `res.on("close", () => { if (!res.writableFinished) abortController.abort(); })`. Only abort when the *response* was cut short prematurely.

### B. Google Antigravity `thoughtSignature` Requirement
- **The Bug**: Dropping `thoughtSignature` from `functionCall` blocks in multi-turn conversations.
- **Why it Fails**: Google Antigravity models (especially Gemini 3.x) attach a cryptographic `thoughtSignature` to function calls. When the agent loop sends Turn 2 (assistant toolCall + user toolResult), Google strictly verifies the signature on the `functionCall` part. If missing, Google returns `HTTP 400: Function call is missing a thought_signature in functionCall parts`. The agent then stalls after running the tool.
- **The Rule**: Always preserve `thoughtSignature` and `id` on every tool call block, and pass them back in the `contents[].parts[].functionCall` payload on subsequent turns.

### C. Strict Gemini Role Alternation (`mergeConsecutiveTurns`)
- **The Bug**: Sending consecutive turns with the same role (e.g. multiple `user` tool-result turns in parallel tool batches).
- **Why it Fails**: Google Antigravity requires strict role alternation: `user` → `model` → `user`. Sending two consecutive `user` turns causes HTTP 400.
- **The Rule**: Always pass history through `mergeConsecutiveTurns()` before sending to Google: consecutive turns with the same role must have their `parts` merged into a single turn.

### D. Google Antigravity OAuth Client Credentials
- Managed via `apps/agent-daemon/src/auth/vault.ts` (`ANTIGRAVITY_CLIENT_ID` / `ANTIGRAVITY_CLIENT_SECRET`).
- Supports `ANTIGRAVITY_CLIENT_ID` and `ANTIGRAVITY_CLIENT_SECRET` environment variable overrides.
- **Endpoint**: `https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse`
- **Request Type**: Must specify `requestType: "AGENT"` and `userAgent: "antigravity"`.

---

## 3. UI & Design Standards

1. **Every UI Element is a Component**: Never dump logic into `App.tsx` or monolithic views. Keep all buttons, list items, switches, and loaders isolated in `apps/desktop/src/components/`.
2. **Pitch-Black Dark Mode**: Dark mode is pure `#000000` (pitch black). High-contrast `#222222` / `#333333` borders, `#888888` secondary text, `#ffffff` primary text. Zero arbitrary purple or blue accents.
3. **Corner Smoothing**: Use smooth squircle radii (`smooth-corners`, `smooth-corners-lg`) across inputs, message bubbles, and containers.
4. **Chat Layout**:
   - Agent messages and tool events: Strictly aligned to the **LEFT**.
   - User messages: Strictly aligned to the **RIGHT**.
   - Chat input box: Sits seamlessly on the page background (no separate container card background) and embeds the dynamic `ModelSwitcher` at bottom-left.
5. **No Hardcoded Models**: Models must always be fetched dynamically from `GET /api/models` based on authenticated providers.
6. **Zero Fluff**: No marketing text, slogans, or irrelevant filler in any UI surface.

---

## 4. Verification Workflow

Before committing any change:
```bash
# 1. Typecheck all packages in parallel (must hit FULL TURBO with 0 errors)
pnpm run check-types

# 2. Verify Vite production bundle
pnpm --filter @cobot/desktop build

# 3. Verify backend daemon compiles
pnpm --filter @cobot/agent-daemon check-types
```
