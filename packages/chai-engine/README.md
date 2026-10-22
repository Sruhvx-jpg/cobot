# @cobot/chai-engine

> **Origin & Attribution Disclaimer**:
> This embedded SQL engine is cloned and trimmed directly from upstream **ChaiSQL** ([chaisql/chai](https://github.com/chaisql/chai)).
> It was **NOT** built from scratch by Sruhvx-jpg. It has been specifically extracted, pruned of CLI bloat, and adapted to serve as an embedded, zero-CGO relational database engine for **Cobot**'s messaging platform (`apps/agent-house`).

---

## Why Chai for `sabha`?

`sabha` requires a persistent, relational database for agent-to-agent coordination without the overhead of external database daemons or CGO toolchains:

1. **100% Pure Go (Zero CGO)**: Compiles directly into the binary with no external C libraries or GCC requirements.
2. **CockroachDB's Pebble LSM Backend**: High-performance disk persistence and in-memory execution backed by Pebble.
3. **Dual Relational + JSON Model**: Native support for SQL tables and indexes alongside deep querying of dynamic JSON payloads.
4. **ANSI Table-Prefix & Alias Support**: Full parser support for `table.column`, `"table"."column"`, `table.*`, and `FROM table AS alias`.
5. **Built-in Reflection Migrator**: `chai.AutoMigrate(db, ...models)` auto-derives DDL and auto-adds missing columns via `ALTER TABLE ADD COLUMN`.
6. **Native Pure-Go ORM (`orm/`)**: Zero-dependency query builder (`github.com/chaisql/chai/orm`) with automatic `?` -> `$n` positional parameter binding.

---

## Native ORM & Migrator Usage

```go
package main

import (
    "context"
    "database/sql"
    "github.com/chaisql/chai"
    "github.com/chaisql/chai/orm"
)

type Message struct {
    ID         string `chai:"id;primaryKey"`
    ReceiverID string `chai:"receiver_id;notnull;index"`
    SenderID   string `chai:"sender_id;notnull"`
    Content    string `chai:"content;notnull"`
    SentAt     int64  `chai:"sent_at;notnull"`
}

func main() {
    rawDB, _ := sql.Open("chai", "./data/sabha.db")
    defer rawDB.Close()

    // 1. Auto-migrate struct schema
    _ = chai.AutoMigrate(rawDB, &Message{})

    // 2. Wrap into native ORM handle
    db := orm.NewDB(rawDB)

    // 3. Type-safe Insert
    msg := Message{ID: "m1", ReceiverID: "general", SenderID: "agent1", Content: "hello", SentAt: 1000}
    _, _ = db.Insert(&msg).Exec(context.Background())

    // 4. Type-safe Select with parameter translation (? -> $1)
    var results []Message
    _ = db.Select().
        Model(&Message{}).
        Where("receiver_id = ? AND sent_at >= ?", "general", 1000).
        OrderBy("sent_at DESC").
        Limit(20).
        Find(context.Background(), &results)
}
```

---

## Directory Layout

- **`db.go` & `errors.go`**: Public library API and standard `database/sql` driver registration.
- **`internal/`**:
  - `database/`: Database coordinator, transactions, and catalog.
  - `engine/`: Pebble LSM storage engine bindings.
  - `sql/`: SQL lexer, parser, and AST generator.
  - `planner/`: Cost-based query planner and index selector.
  - `query/`: Statement execution pipelines (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
  - `row/` & `encoding/`: Relational row formats and binary encodings.
- **`sqltests/`**: Retained SQL specification test suite to prevent regressions during downstream modifications.

---

## Trimming & Pruning Log

See [`TRIMMING_LOG.md`](./TRIMMING_LOG.md) for the exact record of pruned upstream components and line counts.
