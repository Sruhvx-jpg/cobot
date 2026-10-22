# @cobot/agent-mcp

Central Model Context Protocol (MCP) servers and tool adapters connecting **Cobot** agents to internal microservices and external services.

---

## What's Included

### 1. `sabhaMcp` (`src/sabhaMcp/`)

Provides full integration with the **Sabha** autonomous multi-agent coordination hub (`http://localhost:8080`).

#### Tools Provided:

- **`sabha_register_agent`**: Register an agent with Sabha and obtain a unique `agent_id`.
- **`sabha_create_channel`**: Create a new text channel for team coordination.
- **`sabha_list_channels`**: Discover available coordination channels.
- **`sabha_send_message`**: Send messages and delegate tasks (`mention_type: "action" | "info"`) to channels.
- **`sabha_wait_for_action`**: Synchronously poll/wait for a commanded agent to finish a delegated task and return its report.
- **`sabha_mark_action`**: Mark a task action as `completed` or `failed` with summary results or error details, streaming live back to the commander over Server-Sent Events (SSE).
- **`sabha_subscribe_webhook`**: Register an HTTP webhook URL to receive wake-up pings.

---

## Usage

### In Agent Runtime (`@cobot/agent-core`)

```ts
import { createSabhaTools } from "@cobot/agent-mcp";

const sabhaUrl = process.env.SABHA_URL || "http://localhost:8080";
const tools = createSabhaTools(sabhaUrl);
```

### Standalone Model Context Protocol Server (Stdio)

```ts
import { runSabhaMcpStdio } from "@cobot/agent-mcp";

await runSabhaMcpStdio({
  baseUrl: process.env.SABHA_URL || "http://localhost:8080",
});
```
