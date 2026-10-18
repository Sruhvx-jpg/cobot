# @cobot/agent-core

Headless, event-driven agent turn loop and state machine.

> **Source Origin**: Extracted directly from the upstream Pi agent engine (`@earendil-works/pi-agent-core` from [earendil-works/pi](https://github.com/earendil-works/pi)). Integrated directly into this monorepo to eliminate external dependency overhead, avoid black-box package pinning, and strip away unused CLI, TUI, and MCP scaffolding.

---

## What this Package Does

`@cobot/agent-core` is the runtime execution engine for autonomous AI agents. It operates purely in-memory and is transport-neutral.

### Architecture

```
┌────────────────────────────────────────────────────────┐
│                      Agent Class                       │
│  - Public conversation transcript (Message[])          │
│  - Active model & thinking-level state                 │
│  - Steering queue (mid-flight direction while running) │
│  - Follow-up queue (post-task continuation)            │
│  - Async lifecycle bus (subscribe with abort signal)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                     runAgentLoop                       │
│  - Pure functional turn state machine                  │
│  - Invokes pluggable StreamFn to stream from LLM       │
│  - Validates tool arguments against TypeBox schemas    │
│  - Preflight & postflight hooks (beforeToolCall)       │
│  - Parallel or sequential tool execution               │
│  - Settles idle state only after all listeners finish  │
└────────────────────────────────────────────────────────┘
```

---

## Key Primitives

### 1. `Agent`
The high-level stateful orchestrator:
- `prompt(input)`: Starts an agent run from text or structured messages.
- `steer(message)`: Injects steering directions immediately after current tool calls complete.
- `followUp(message)`: Injects messages processed once the current turn would otherwise settle.
- `subscribe(listener)`: Subscribes to the async lifecycle stream. Listeners receive the active `AbortSignal` and are awaited during settlement.
- `abort()`: Cancels active LLM requests and in-flight tool execution.

### 2. `AgentTool`
The contract for defining tools:
```typescript
interface AgentTool<TParameters, TDetails> {
  name: string;
  label: string;
  description: string;
  parameters: TSchema; // TypeBox JSON schema
  executionMode?: "parallel" | "sequential";
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: (partial: AgentToolResult<TDetails>) => void
  ) => Promise<AgentToolResult<TDetails>>;
}
```

### 3. `StreamFn`
Pluggable provider stream interface that decouples the engine from specific AI SDKs:
```typescript
type StreamFn = (
  model: Model<Api>,
  context: TranscriptContext,
  options?: SimpleStreamOptions
) => AssistantMessageEventStream | Promise<AssistantMessageEventStream>;
```

---

## Lifecycle Events

Subscribers receive fine-grained events across the agent, turn, and tool lifecycles:
- **Agent Lifecycle**: `agent_start`, `agent_end`
- **Turn Lifecycle**: `turn_start`, `turn_end`
- **Streaming Messages**: `message_start`, `message_update` (text & reasoning deltas), `message_end`
- **Tool Execution**: `tool_execution_start`, `tool_execution_update` (intermediate streaming), `tool_execution_end`
