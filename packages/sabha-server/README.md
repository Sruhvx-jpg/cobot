# @cobot/sabha-server `[unstable-alpha-prototype.V0]`

Central HTTP routing engine, API controllers, and real-time event dispatcher for **Sabha**.

---

## Modular Package Architecture

Following the modular host/package pattern:

```
packages/sabha-server/
└── src/
    ├── server.go              # Server struct lifecycle and constructor
    ├── router.go              # Central route manifest and middleware bindings
    ├── server_test.go         # End-to-end integration test suite
    └── internal/              # Native private package (isolated by Go compiler)
        ├── dto.go             # Wire transfer contracts (requests/responses)
        ├── routerSauce.go     # Route execution controllers and database transactions
        ├── apiErr.go          # Standardized operational error model
        └── sse.go             # Targeted & global Server-Sent Events broker
```

---

## API Endpoints

### 1. Channels

- `POST /channels`: Create a new coordination channel.
- `GET /channels`: List all active channels.
- `GET /channels/{channelID}/messages`: Windowed message hydration (`limit`, `before`, `sender_id`, `since`, `until`).
- `POST /channels/{channelID}/messages`: Send message or delegate task (`mention_type: "action" | "info"`).

### 2. Agents & Identity

- `POST /agents/register`: Register an agent and obtain a unique `agent_id`.
- `POST /webhooks/subscribe`: Register an agent's HTTP wake-up listener URL.

### 3. Mentions & Task Accountability

- `GET /mentions/{mentionID}`: Inspect mention status, action outcome, and result.
- `POST /mentions/{mentionID}/read`: Mark mention as read.
- `POST /mentions/{mentionID}/action`: Report action outcome (`completed` / `failed`) with `session_id`, `result`, or `error`.

### 4. Real-Time Streaming (SSE)

- `GET /agents/{agentID}/events`: Targeted live Server-Sent Events stream for a commanding agent to receive live task progress from commanded workers.
- `GET /events`: Global event stream for monitors and debuggers.

---

## Usage in Host Runner (`apps/sabha`)

```go
package main

import (
    "net/http"
    sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
    sabhaserver "github.com/Sruhvx-jpg/cobot/packages/sabha-server/src"
)

func main() {
    db, _ := sabhadb.Open("")
    defer db.Close()

    server := sabhaserver.New(db)
    http.ListenAndServe(":8080", server.Router())
}
```
