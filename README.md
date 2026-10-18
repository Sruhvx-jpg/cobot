# Cobot

High-performance coding agent monorepo orchestrated with **Turborepo** and **pnpm workspaces**.

---

## Monorepo Architecture

```
cobot/
├── apps/
│   ├── agent-daemon/     # Express.js AG-UI SSE streaming backend daemon (port 3000)
│   ├── desktop/          # Tauri 2.0 desktop frontend shell + Vite + React + Tailwind
│   ├── agent-house/      # Go microservice chat application for agents
│   └── tracer-duty/      # Go microservice for agent step tracing and logging
│
├── packages/
│   ├── agent-core/       # Headless turn-loop agent engine (extracted directly from Pi)
│   ├── tools/            # Built-in tools, sauce/ execution logic & base agent prompt
│   ├── adaptor/          # MCP tool adapter for agents to connect with microservices
│   ├── shared/           # Shared domain types, Result wrappers, utils
│   └── typescript-config/# Shared TypeScript compiler profiles
│
├── pnpm-workspace.yaml   # Workspace member configuration
├── turbo.json            # Turborepo task pipeline (build, check-types, dev)
└── package.json          # Root scripts and packageManager definition
```

---

## Packages

### 1. `packages/agent-core` (`@cobot/agent-core`)
- Headless, in-memory agent turn-loop engine.
- Stripped of external CLI, TUI, and MCP harness baggage.
- Provides pure `Agent`, `runAgentLoop`, `AgentTool`, and `StreamFn` contracts.
- See [`packages/agent-core/README.md`](./packages/agent-core/README.md).

### 2. `packages/tools` (`@cobot/tools`)
- Dedicated package housing standard built-in tools (`read`, `write`, `bash`).
- **`src/sauce/`**: Isolated execution implementations (`read.ts`, `write.ts`, `bash.ts`).
- **`src/utils/`**: Reusable path and process execution helpers (`path.ts`, `exec.ts`).
- **`src/agent-prompt/`**: Base agent prompt with operational dogmas (`base-prompt.ts`).
- See [`packages/tools/README.md`](./packages/tools/README.md).

### 3. `packages/adaptor` (`@cobot/adaptor`)
- MCP tool adapter enabling agents to connect to other microservices (such as `agent-house`).

### 4. `packages/shared` (`@cobot/shared`)
- Shared domain types (`AgentRunRequest`, `AgentDomainEvent`).
- Functional `Result<T, E>` error handling primitives (`ok`, `err`, `isOk`, `isErr`).
- Runtime helper functions (`sleep`, `truncate`, `now`).

---

## Applications

### 1. `apps/agent-daemon` (`@cobot/agent-daemon`)
- **Runtime**: Express.js with TypeScript (`tsx`).
- **Protocol**: **AG-UI (Agent–User Interaction Protocol)** over Server-Sent Events.
- **Features**:
  - `src/engine.ts`: Pure agent loop orchestrator importing `@cobot/tools`.
  - `src/ag-ui.ts`: AG-UI protocol event encoder.
  - `src/auth/vault.ts`: Backend-only credential vault (`~/.cobot/vault.json`).
  - `src/models/catalog.ts`: Live dynamic model discovery from Antigravity API.
  - `src/models/antigravity-stream.ts`: Antigravity Code Assist streaming adapter with cryptographic `thoughtSignature` preservation.

### 2. `apps/desktop` (`@cobot/desktop`)
- **Runtime**: Tauri 2.0 desktop shell (React 19, Tailwind CSS, Lucide icons).
- Pitch-black (`#000000`) dark theme + white light theme with top-right switcher.
- Collapsible sidebar with icon-only controls (`+` New Session, `PanelLeftClose`/`PanelLeftOpen`).
- Wider chat input with squircle corner smoothing (`smooth-corners`).
- Dynamic model dropdown embedded directly inside the prompt container.

### 3. `apps/agent-house` (`@cobot/agent-house`)
- Go microservice chat application for agents.

### 4. `apps/tracer-duty` (`@cobot/tracer-duty`)
- Go microservice for agent step tracing and logging.

---

## Turborepo Commands

```bash
# Typecheck all packages in parallel (with Turbo caching)
pnpm run check-types

# Develop all apps
pnpm run dev
```
