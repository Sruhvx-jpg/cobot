# Cobot

High-performance coding agent monorepo orchestrated with **Turborepo** and **pnpm workspaces**.

---

## Monorepo Architecture

```
cobot/
├── apps/
│   ├── agent-daemon/     # Express.js AG-UI SSE streaming backend daemon (port 3000)
│   └── desktop/          # Tauri 2.0 desktop frontend shell + Vite + React + Tailwind
│
├── packages/
│   ├── agent-core/       # Headless turn-loop agent engine (extracted directly from Pi)
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
- See [`packages/agent-core/README.md`](./packages/agent-core/README.md) for architecture details.

### 2. `packages/shared` (`@cobot/shared`)
- Shared domain types (`AgentRunRequest`, `AgentDomainEvent`).
- Functional `Result<T, E>` error handling primitives (`ok`, `err`, `isOk`, `isErr`).
- Runtime helper functions (`sleep`, `truncate`, `now`).

---

## Applications

### 1. `apps/agent-daemon` (`@cobot/agent-daemon`)
- **Runtime**: Express.js with TypeScript (`tsx`).
- **Protocol**: **AG-UI (Agent–User Interaction Protocol)** over Server-Sent Events.
- **Features**:
  - `src/engine.ts`: Pure agent loop orchestrator (zero HTTP / transport awareness).
  - `src/ag-ui.ts`: AG-UI protocol event encoder.
  - `src/tools/index.ts`: Strongly typed standard coding tools (`read`, `write`, `bash`).
  - `src/auth/antigravity.ts`: Google Antigravity Code Assist OAuth PKCE flow.
  - `src/models/catalog.ts`: Dynamic live model discovery from Antigravity API.
  - `src/models/antigravity-stream.ts`: Google Antigravity Code Assist streaming adapter with cryptographic `thoughtSignature` preservation.

#### Start Daemon:
```bash
pnpm --filter @cobot/agent-daemon dev
```

### 2. `apps/desktop` (`@cobot/desktop`)
- **Runtime**: Tauri 2.0 desktop shell (React 19, Tailwind CSS, Lucide icons).
- **Features**:
  - Pure pitch-black (`#000000`) dark theme + white light theme with top-right switcher.
  - Collapsible sidebar with icon-only controls (`+` New Session, `PanelLeftClose`/`PanelLeftOpen`).
  - Wider chat input with squircle corner smoothing (`smooth-corners`).
  - Dynamic model dropdown embedded directly inside the prompt container.
  - Live AG-UI streaming with dedicated `LoadingDots` (`...`) animation component.
  - Mid-flight steering support during active agent turns.

#### Run Desktop:
```bash
pnpm --filter @cobot/desktop tauri dev
```

---

## Turborepo Commands

```bash
# Typecheck all packages in parallel (with Turbo caching)
pnpm run check-types

# Develop all apps
pnpm run dev
```
