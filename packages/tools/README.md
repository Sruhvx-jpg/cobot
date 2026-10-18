# @cobot/tools

Standard built-in tools (`read`, `write`, `bash`), modular execution implementations (`sauce/`), shared utilities (`utils/`), and base system prompt generator (`agent-prompt/`) for Cobot.

---

## Directory Architecture

```
packages/tools/
├── src/
│   ├── utils/              # Reusable execution and path utilities
│   │   ├── path.ts         # Path resolution and safety checks
│   │   └── exec.ts         # Child process execution wrapper
│   │
│   ├── sauce/              # Core execution logic for tools
│   │   ├── read.ts         # File reading logic
│   │   ├── write.ts        # File writing logic
│   │   └── bash.ts         # Shell command execution logic
│   │
│   ├── agent-prompt/       # System prompt builders
│   │   └── base-prompt.ts  # Base system prompt with operational dogmas
│   │
│   └── index.ts            # TypeBox parameter schemas & AgentTool factory
│
├── package.json
└── tsconfig.json
```

---

## Usage

```typescript
import { createBaseTools, buildBasePrompt } from "@cobot/tools";
import { Agent } from "@cobot/agent-core";

const tools = createBaseTools(process.cwd());
const systemPrompt = buildBasePrompt(process.cwd());

const agent = new Agent({
  initialState: {
    systemPrompt,
    tools,
    model: myModel,
  },
  streamFn: myStreamFn,
});
```
