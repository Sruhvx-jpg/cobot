# Agent & Human Tool Synchronization Protocol

> **Notice**: This document is intended for both AI agents and human developers working on Cobot. 

---

## 1. Mandatory Tool & System Prompt Synchronization

Whenever you create, register, or modify a tool in `@cobot/tools` (or through the MCP adapter):
**You MUST update the respective system prompt (`packages/agent-prompt/src/base-prompt.ts`) immediately.**

### Why This Rule Exists:
Without explicit inclusion in the system prompt's `<tools>` and `<rules>` blocks:
1. The agent may not realize it has access to the tool during multi-step planning.
2. The agent might fall back to dirty shell hacks (e.g. using `cat`/`sed` instead of dedicated tools).
3. The model might hallucinate parameters or misuse the tool's execution model.

---

## 2. Currently Registered Tools

| Tool | Location | Purpose | System Prompt Description |
| :--- | :--- | :--- | :--- |
| **`read`** | `packages/tools/src/sauce/read.ts` | Read text files from disk | `<tools>` - `read: Read file contents from disk...` |
| **`write`** | `packages/tools/src/sauce/write.ts` | Create or overwrite files | `<tools>` - `write: Create or overwrite files on disk...` |
| **`bash`** | `packages/tools/src/sauce/bash.ts` | Non-interactive shell execution | `<tools>` - `bash: Execute non-interactive shell commands...` |

---

## 3. Tool Addition Checklist (For Agents & Humans)

When creating a new tool (e.g. `edit`, `grep`, `find`, or custom microservice tools):

- [ ] **1. Implementation (`sauce/`)**: Place the core execution logic in `packages/tools/src/sauce/<tool-name>.ts`.
- [ ] **2. Schema & Registration**: Define TypeBox parameters and assemble the `AgentTool` in `packages/tools/src/index.ts`.
- [ ] **3. System Prompt Sync**: Add the tool snippet to `<tools>` and any guardrails to `<rules>` in `packages/agent-prompt/src/base-prompt.ts`.
- [ ] **4. Verification**: Run `pnpm run check-types` and `./scripts/checks/check-rust.sh` before committing.

---

## 4. Proposed Dynamic Tool Introspection (`list_tools`)

To prevent the agent from ever losing track of newly registered or dynamic MCP tools at runtime, Cobot supports adding a native introspection tool:

- **Tool Name**: `list_tools`
- **Function**: Returns a JSON catalog of all currently mounted tools, their descriptions, execution modes, and parameter schemas.
- **Benefit**: If an agent is uncertain whether a tool is available for a complex task, it calls `list_tools` to verify its live capabilities dynamically.
