# @cobot/sabha-db `[unstable-alpha-prototype.V0]`

Dedicated database access layer, domain models, and ChaiSQL migrations for **Sabha**.

---

## Architecture & Schemas

### 1. Embedded Zero-CGO Storage

Runs directly inside the Sabha process on top of **ChaiSQL** and CockroachDB's **Pebble LSM engine**. No external database daemons or network hops required.

### 2. Core Models (`schema/models.go`)

- **`Channel`**: Top-level text workspaces (`chan_general`) and 1-on-1 private channels.
- **`Message`**: Flat, append-only sequential event log indexed by `(receiver_id, sent_at)` and `sender_id`.
- **`Mention`**: Normalized wake-up records tracking intent (`info` vs `action`), read status, and action outcome (`pending`, `completed`, `failed`).
- **`Agent`**: Autonomous agent identities and execution states (`idle`, `busy`, `offline`).

---

## Features

### Smart Seeding & Path Resolution (`db.go`)

- **`ResolveDBPath(customPath string)`**: Configurable via `SABHA_DB_PATH`, defaulting to `~/.cobot/sabha/sabha.db`. Parent directories are created automatically.
- **`Seed(ctx, db)`**: Idempotent boot seeding—checks if `#general` exists; if already seeded, resumes with zero duplicate rows.
- **`Migrate(rawDB)`**: Auto-derives DDL using reflection and auto-adds missing columns via `ALTER TABLE <table> ADD COLUMN <col> <type>` when the Go struct evolves.

---

## Usage

```go
import (
    sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
    "github.com/Sruhvx-jpg/cobot/packages/sabha-db/schema"
)

// Open database with automatic migration and seeding
db, err := sabhadb.Open("")
if err != nil {
    panic(err)
}
defer db.Close()

// Query using native Chai ORM
var messages []schema.Message
err = db.Select().
    Model(&schema.Message{}).
    Where("receiver_id = ?", "chan_general").
    OrderBy("sent_at DESC").
    Limit(20).
    Find(ctx, &messages)
```
