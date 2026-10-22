# Chai Engine Trimming Log

This document records the exact upstream components pruned from **ChaiSQL** (`chaisql/chai`) during extraction into **`@cobot/chai-engine`** for Cobot.

---

## 1. Upstream Origin & Baseline

- **Upstream Repository**: [github.com/chaisql/chai](https://github.com/chaisql/chai)
- **Extraction Target**: `@cobot/chai-engine` (`packages/chai-engine`)
- **Primary Role in Cobot**: Embedded relational database engine for agent-to-agent messaging and state coordination in `apps/agent-house`.

---

## 2. Pruned Components

| Component / Path               | Files   | Lines Pruned | Why It Was Pruned                                                                                                                                                                                          |
| :----------------------------- | :------ | :----------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`cmd/` (`cmd/chai`)**        | `21`    | `2,432`      | **Standalone Terminal CLI & REPL**: `agent-house` consumes the database in-process as a Go library. The interactive terminal shell, readline bindings, and CLI binary entrypoint (`main.go`) are unneeded. |
| **`sqltests/SEQUENCES`**       | `2`     | `~120`       | **Sequence Counter Tests**: Distributed agent messaging systems use UUIDv7 or Unix timestamps instead of centralized sequence counters.                                                                    |
| **`sqltests/CREATE_SEQUENCE`** | `7`     | `~350`       | **Sequence Syntax Tests**: Sequence creation and edge case test scripts.                                                                                                                                   |
| **`sqltests/DROP_SEQUENCE`**   | `1`     | `~40`        | **Sequence Dropping Tests**: Drop sequence validation scripts.                                                                                                                                             |
| **`.github/`**                 | `4`     | `~200`       | **Upstream CI Workflows**: Multi-OS GitHub actions workflows replaced by Cobot’s unified monorepo CI.                                                                                                      |
| **`Makefile` & `go.work*`**    | `3`     | `~150`       | **Upstream Build Artifacts**: Root monorepo at `cobot/go.work` manages workspace modules natively.                                                                                                         |
| **Total Pruned**               | **~38** | **~3,300+**  | **Clean removal of CLI shell, sequence edge cases, and CI scripts.**                                                                                                                                       |

---

## 3. Retained Core Components

- **`db.go` & `errors.go`**: Public Go API (`chai.Open`, `database/sql` driver).
- **`internal/` (197 files | 33,337 lines)**:
  - `internal/sql/`: SQL lexer and parser (AST generation).
  - `internal/planner/`: Query planner and index selection.
  - `internal/engine/`: CockroachDB Pebble LSM storage engine bindings.
  - `internal/database/`: Catalog, transaction management, and collection coordination.
  - `internal/query/`: Query statement execution pipelines (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
  - `internal/row/` & `internal/encoding/`: Binary row serialization and Pebble key encodings.
- **`sqltests/` Core Suites (Kept for Regression Safety)**:
  - `SELECT/` (Aggregations, order by, distinct, strings, where filtering).
  - `INSERT/` (`RETURNING` clauses, primary key, unique, check constraints).
  - `UPDATE/` & `DELETE/` (Row mutations).
  - `CREATE_TABLE/` & `DROP_TABLE/` (Table schemas).
  - `CREATE_INDEX/` & `DROP_INDEX/` (B-tree indexing).
  - `ALTER_TABLE/` & `REINDEX/` (Schema migrations & index rebuilding).
  - `TRANSACTIONS/` (ACID isolation tests).
  - `expr/` & `planning/` (Expression parser & optimizer tests).

---

## 4. Modern Go Toolchain Compatibility Fix

- **Problem**: Upstream Chai used an older pinned commit of `github.com/cockroachdb/swiss` (`v0.0.0-20250624...`), which failed on modern Go toolchains (Go 1.24+) due to restricted private runtime `//go:linkname` functions (`undefined: hashFn`, `undefined: fastrand64`).
- **Fix**: Upgraded `github.com/cockroachdb/swiss` to the latest compatible release in `go.mod`.

---

## 5. Verification

- **Engine Tests**: `go test -v .` passed 100% (Transactions, queries, concurrent reads/writes).
- **Monorepo Discovery**: Registered natively in `cobot/go.work` and discovered as `@cobot/chai-engine` by Turborepo.
