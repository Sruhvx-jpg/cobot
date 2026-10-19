# @cobot/ts-shared

TypeScript-only shared domain types, frontend models, functional Result types, and common utilities for the Cobot monorepo.

## Modules

- `src/types.ts`: Backend & engine domain models (`AgentRunRequest`, `AgentDomainEvent`, `AgentManifest`, `ThinkingLevel`).
- `src/frontend-types/`: Frontend UI models (`ChatMessage`, `ToolCall`, `Session`, `ModelOption`, `AgentOption`, `AuthStatus`).
- `src/result.ts`: Functional `Result<T, E>` monadic wrappers (`ok`, `err`, `isOk`, `isErr`).
- `src/utils.ts`: Runtime utilities (`sleep`, `truncate`, `now`).
