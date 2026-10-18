# @cobot/agent-prompt

Dedicated system prompt builder and context compilers for Cobot.

---

## Contents

- `src/base-prompt.ts`: Generates structured system instructions (Option 2 multi-purpose preamble, `<tools>`, `<operational_dogmas>`, `<rules>`, auto-injected `<project_context>` from `AGENTS.md`, and `<cwd>`).

---

## Usage

```typescript
import { buildBasePrompt } from "@cobot/agent-prompt";

const prompt = buildBasePrompt(process.cwd());
```
