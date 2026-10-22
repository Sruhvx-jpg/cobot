# Cobot

High-performance coding agent monorepo orchestrated with **Turborepo** and **pnpm workspaces**.

---

## Monorepo Architecture

```
cobot/
├── apps/
│   ├── agent-daemon/     # Ultra-lean Express.js AG-UI daemon runner (port 3000)
│   ├── desktop/          # Tauri 2.0 desktop frontend shell + Vite + React + Tailwind
│   ├── sabha/            # Go microservice chat & coordination hub runner [unstable-alpha-prototype.V0]
│   └── tracer-duty/      # Go microservice for agent step tracing and logging
│
├── packages/
│   ├── agent-core/       # Headless turn-loop agent engine (extracted directly from Pi)
│   ├── agent-prompt/     # Dedicated base and dynamic system prompt builders
│   ├── agent-daemon-server/# Express.js AG-UI backend engine, OAuth, and router
│   ├── sabha-db/         # Sabha database access layer, schemas, and ChaiSQL migrations
│   ├── sabha-server/     # Central router, HTTP API handlers, and webhook dispatcher for Sabha
│   ├── chai-engine/      # Embedded Pebble SQL engine, native ORM, and reflection migrator
│   ├── chroma-engine/    # In-process Rust vector database core
│   ├── tools/            # Built-in tools & sauce/ execution implementations
│   ├── vault/            # General-purpose inode storage with lookup index & code encryption
│   ├── adaptor/          # MCP tool adapter for agents to connect with Sabha & microservices
│   ├── ts-shared/        # Shared domain types, frontend models, Result wrappers, utils
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

### 2. `packages/agent-prompt` (`@cobot/agent-prompt`)

- Dedicated system prompt builders and context compilers.
- **`src/base-prompt.ts`**: Base system prompt with Option 2 multi-purpose preamble, `<tools>`, `<operational_dogmas>`, `<rules>`, and auto-detected `<project_context>`.
- See [`packages/agent-prompt/README.md`](./packages/agent-prompt/README.md).

### 3. `packages/tools` (`@cobot/tools`)

- Dedicated package housing standard built-in tools (`read`, `write`, `bash`).
- **`src/sauce/`**: Isolated execution implementations (`read.ts`, `write.ts`, `bash.ts`).
- **`src/utils/`**: Reusable path and process execution helpers (`path.ts`, `exec.ts`).
- See [`packages/tools/README.md`](./packages/tools/README.md).

### 4. `packages/vault` (`@cobot/vault`)

- General-purpose inode-based storage engine with persistent lookup indexing (`index.json`).
- **`SimpleVault`**: Unencrypted general-purpose storage (files, JSON, append-only NDJSON/JSONL streams).
- **`CodeVault`**: Code/passcode-gated encrypted storage (`AES-256-GCM` with `scrypt` key derivation).
- **`SessionStore`**: Agent turn logs and auto-titling built on top of `SimpleVault`.
- See [`packages/vault/README.md`](./packages/vault/README.md).

### 5. `packages/agent-mcp` (`@cobot/agent-mcp`)

- Central Model Context Protocol (MCP) servers and tool adapters.
- **`src/sabhaMcp/tools.ts`**: Native `AgentTool[]` connecting agents to Sabha (`sabha_register_agent`, `sabha_create_channel`, `sabha_list_channels`, `sabha_send_message`, `sabha_wait_for_action`, `sabha_mark_action`, `sabha_subscribe_webhook`).
- **`src/sabhaMcp/mcp-server.ts`**: Standalone Model Context Protocol server over stdio/HTTP.

### 6. `packages/agent-daemon-server` (`@cobot/agent-daemon-server`)

- Express.js AG-UI backend engine, OAuth manager, and router for `@cobot/agent-daemon`.
- Auto-syncs vault agents with Sabha on boot and exposes webhook wake-up endpoints (`POST /api/agents/:agentId/wake`).

### 7. `packages/sabha-db` (`@cobot/sabha-db`)

- Dedicated database access layer and domain schemas for Sabha (`Channel`, `Message`, `Mention`, `Agent`).
- Reflection-based schema migrations powered by `chai.AutoMigrate` with dynamic `ALTER TABLE ADD COLUMN` evolution.

### 8. `packages/sabha-server` (`@cobot/sabha-server`)

- Central HTTP routing engine, API controllers, and event dispatcher for Sabha.
- Standardized `APIError` operational error model and real-time Server-Sent Events (SSE) broker.

### 9. `packages/chai-engine` (`@cobot/chai-engine`)

- Pure-Go embedded relational SQL engine backed by CockroachDB's Pebble LSM engine.
- Native reflection migrator (`chai.AutoMigrate`) and zero-dependency micro-ORM (`github.com/chaisql/chai/orm`).

### 10. `packages/ts-shared` (`@cobot/ts-shared`)

- TypeScript-only shared package housing backend and frontend domain models.
- **`src/types.ts`**: Backend & engine contracts (`AgentRunRequest`, `AgentDomainEvent`, `AgentManifest`).
- **`src/frontend-types/`**: Frontend models (`ChatMessage`, `ToolCall`, `Session`, `ModelOption`, `AgentOption`, `AuthStatus`).
- **`src/result.ts` & `src/utils.ts`**: Functional `Result<T, E>` monadic wrappers and runtime helpers.

---

## Applications

### 1. `apps/agent-daemon` (`@cobot/agent-daemon`)

- **Runtime**: Ultra-lean Express.js daemon runner (port 3000).
- Imports `@cobot/agent-daemon-server` to start the AG-UI streaming engine.

### 2. `apps/desktop` (`@cobot/desktop`)

- **Runtime**: Tauri 2.0 desktop shell (React 19, Tailwind CSS, Lucide icons).
- Pitch-black (`#000000`) dark theme + white light theme with top-right switcher.
- Dynamic model dropdown and thinking level switcher.
- Dynamic input swap: ChatInput transitions to SteerInput during active agent runs.

### 3. `apps/sabha` (`@cobot/sabha`) `[unstable-alpha-prototype.V0]`

- Go microservice chat & coordination hub runner (port 8080).
- Imports `@cobot/sabha-db` and mounts `@cobot/sabha-server`.
- Connected to persistent storage at `~/.cobot/sabha/sabha.db`.

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
