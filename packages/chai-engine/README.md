# @cobot/chai-engine

> **Origin & Attribution Disclaimer**:
> This embedded SQL engine is cloned and trimmed directly from upstream **ChaiSQL** ([chaisql/chai](https://github.com/chaisql/chai)). 
> It was **NOT** built from scratch by Sruhvx-jpg. It has been specifically extracted, pruned of CLI bloat, and adapted to serve as an embedded, zero-CGO relational database engine for **Cobot**'s messaging platform (`apps/agent-house`).

---

## Why Chai for `agent-house`?

`agent-house` requires a persistent, relational database for agent-to-agent coordination without the overhead of external database daemons or CGO toolchains:

1. **100% Pure Go (Zero CGO)**: Compiles directly into the `agent-house` binary with no external C libraries or GCC requirements.
2. **CockroachDB's Pebble LSM Backend**: High-performance disk persistence and in-memory execution backed by Pebble.
3. **Dual Relational + JSON Model**: Native support for SQL tables and indexes alongside deep querying of dynamic JSON payloads (`WHERE payload.task = 'analyze'`).
4. **Standard `database/sql` Driver**: Seamless integration using standard Go database connection interfaces.

---

## Usage in `agent-house`

```go
package main

import (
    "database/sql"
    _ "github.com/chaisql/chai"
)

func main() {
    // Open embedded database file
    db, err := sql.Open("chai", "./agent_house.db")
    if err != nil {
        panic(err)
    }
    defer db.Close()

    // Create relational messages table with indexed channel and timestamp
    db.Exec(`
        CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            channel TEXT,
            sender TEXT,
            payload JSON,
            timestamp INT
        );
        CREATE INDEX idx_channel_ts ON messages(channel, timestamp);
    `)

    // Query messages by channel with ordering
    rows, err := db.Query(`
        SELECT id, sender, payload.task 
        FROM messages 
        WHERE channel = 'coordination' 
        ORDER BY timestamp DESC 
        LIMIT 50
    `)
}
```

---

## Directory Layout

* **`db.go` & `errors.go`**: Public library API and standard `database/sql` driver registration.
* **`internal/`**:
  * `database/`: Database coordinator, transactions, and catalog.
  * `engine/`: Pebble LSM storage engine bindings.
  * `sql/`: SQL lexer, parser, and AST generator.
  * `planner/`: Cost-based query planner and index selector.
  * `query/`: Statement execution pipelines (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
  * `row/` & `encoding/`: Relational row formats and binary encodings.
* **`sqltests/`**: Retained SQL specification test suite to prevent regressions during downstream modifications.

---

## Trimming & Pruning Log
See [`TRIMMING_LOG.md`](./TRIMMING_LOG.md) for the exact record of pruned upstream components and line counts.
