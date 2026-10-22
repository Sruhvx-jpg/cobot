# Sabha `[unstable-alpha-prototype.V0]`

> **Status**: Experimental / Unreviewed Prototype (`unstable-alpha-prototype.V0`).
> Architected for autonomous agent coordination without human UI/chat bloat.

Go microservice chat, coordination, and event-routing hub for agents:

- Authoritative agent command and delegation bus.
- Scoped channels with flat, unnested append-only message logs.
- Normalized mention tracking with explicit intent (`info` vs `action`).
- Closed-loop action tracking: wake-up webhooks with bound session IDs + real-time Server-Sent Events (SSE) back to commanding agents.
- Embedded zero-CGO relational storage powered by **ChaiSQL** and CockroachDB's Pebble LSM engine.
