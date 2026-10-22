# Systems Downsizing & Engine Trimming Methodology: ChromaDB to Cobot

---

## 1. Context & Overview

Upstream **ChromaDB** is a distributed, multi-tenant cloud vector database (~700,000+ lines across Python, Go, and Rust) designed for AWS/GCP Kubernetes clusters. For **Cobot**, this entire codebase was audited and streamlined into `@cobot/chroma-engine`—an in-process, embedded vector database engine running purely in Rust. Over **460,000+ lines of code** (65% of the upstream codebase) were pruned, leaving an ultra-lightweight, zero-daemon core.

This document details the **architectural classification framework, dependency graph audit, and verification strategy** used to execute this reduction without breaking database durability or vector search accuracy.

---

## 2. The 4-Tier Systems Classification Framework

When evaluating upstream crates for an embedded in-process target, code was classified across four strict technical boundaries:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Upstream Chroma Monorepo                    │
├───────────────────────────────┬─────────────────────────────────┤
│    Dormant Cloud / Daemons    │    Retained In-Process Core     │
│  • worker / garbage_collector │  • chroma-index (HNSW / Tantivy)│
│  • s3heap / s3heap-service    │  • chroma-distance (SIMD Cosine)│
│  • spanner-migrations / sysdb │  • chroma-segment (Record/Meta) │
│  • mdac / metering / billing  │  • chroma-blockstore (Arrow)    │
│  • default-embed (ONNX)       │  • chroma-storage (Local disk)  │
│  • load / benchmark / pprof   │  • chroma-log / sqlite (WAL)    │
│  • bin/ scripts & schemas/    │  • cobot-adapter (Gemma Bridge) │
└───────────────────────────────┴─────────────────────────────────┘
```

### A. Execution & Process Boundary

- **Rule**: If a component requires an open network port (`0.0.0.0:XXXX`), Kubernetes orchestration, or multi-tenant cluster coordination, it is classified as dead weight.
- **Pruned**:
  - `rust/worker`: Multi-node query and compaction worker daemons.
  - `rust/garbage_collector`: Multi-version S3 file cleanup services.
  - `rust/foundation-api`: Proprietary catalog API for `sync.trychroma.com`.
  - `rust/memberlist`: HashiCorp cluster gossip protocols.

### B. Model Independence & Runtime Decoupling

- **Rule**: A vector database must remain an orthogonal storage and indexing engine. It should never bundle heavy machine learning runtimes or vendor SDKs.
- **Pruned**:
  - `@chroma-core/default-embed`: Stripped `@huggingface/transformers` and `onnxruntime-node` (~350 MB saved).
  - `schemas/embedding_functions/`: Stripped 35 JSON schemas for 3rd-party cloud APIs (Bedrock, Cohere, OpenAI).
  - `rust/agent`: Stripped an experimental weather-bot research framework with Anthropic API clients.

### C. Storage Medium & Physical Block Architecture

- **Rule**: Local in-process engines must rely on memory-mapped local NVMe/SSD files, not distributed cloud object queues.
- **Retained**:
  - `rust/blockstore`: Apache Arrow RecordBatch immutable chunking (16 KB–1 MB blocks).
  - `rust/storage::local`: Local disk directory abstraction.
- **Pruned**:
  - `rust/s3heap` & `rust/s3heap-service`: Distributed S3 task queues storing minute-buckets in Parquet.
  - `rust/spanner-migrations` & `rust/rust-sysdb`: Google Cloud Spanner SQL drivers.

### D. Telemetry vs. Database Write-Ahead Logs

- **Rule**: Distinguish between application-level observability and database commit durability.
- **The "Log" Trap**: `rust/log` in a database is **not** text logging—it is the append-only **Write-Ahead Log (WAL)**. It must be retained to guarantee crash recovery (`in_memory_log.rs`, `sqlite_log.rs`).
- **Pruned**: `rust/metering` (cloud SaaS billing event counters) and `rust/faults` (chaos-engineering gRPC fault injection).

---

## 3. Dependency Graph Audit & Verification Protocol

Downsizing a multi-crate Rust workspace cannot be done blindly. The following verification loop was applied to ensure soundness:

### Step 1: Upstream Manifest Sanitization

1. Prune unused crate paths from the root `[workspace.members]` array.
2. Remove corresponding path declarations from `[workspace.dependencies]`.
3. Inspect `[dev-dependencies]` across surviving crates (e.g., removing `chroma-benchmark` from `index/Cargo.toml` and `spanner-migrations` from `log-service/Cargo.toml`).

### Step 2: Protobuf Wire Schema Preservation

- A common pitfall in database trimming is assuming all core wire types reside in `chroma.proto`.
- In Chroma, query execution plans (`KnnPlan`, `SearchPlan`, `QueryVector`, `ReadLevel`) are defined in `query_executor.proto`, and transaction records are in `logservice.proto`.
- **The Rule**: Retain all wire schemas in `idl/` until execution plan types in `rust/types/src/execution/` are refactored to eliminate gRPC plan serialization.

### Step 3: Progressive Compiler Verification

Run verification at three isolated levels after every deletion:

```sh
# 1. Verify crate under modification
cargo check -p cobot-adapter

# 2. Run unit tests for core adapter
cargo test -p cobot-adapter

# 3. Verify entire workspace resolution
cargo check --workspace
```

---

## 4. Systems Optimization & Memory Layout Rules

When adapting downstream systems code for resource-constrained targets (e.g. 4 vCPU / 8 GB RAM):

### Enum Payload Memory Budget

- A Rust enum’s payload is sized to fit its largest variant plus tag and alignment:
  $$\text{Size} = \text{size of largest variant} + \text{tag} + \text{padding}$$
- **Optimization**: Heavy variants (e.g. arrays $> 128$ bytes or rare error structs) must be wrapped in `Box<T>` to avoid inflating every common variant on the stack (`clippy::large_enum_variant`).

### Hardware Acceleration & Stack Sizing

- In-process vector distance calculations (`chroma-distance`) compile with hardware SIMD intrinsics (**AVX2, FMA, NEON**).
- Deep HNSW graph builds and large recursive graph traversals require allocating an **8 MB minimum stack size**:
  ```sh
  export RUST_MIN_STACK_SIZE=8388608
  ```

---

## 5. Licensing & Attribution Integrity

When extracting an upstream engine for downstream extensions:

1. **License Retention**: Upstream Apache 2.0 license files (`LICENSE`) must remain in the crate root.
2. **Explicit Provenance**: Document clearly that the engine is derived and adapted from upstream ChromaDB, not authored from scratch by the downstream maintainer.
3. **Clean Workspace Isolation**: Remove the upstream `.git/` folder to prevent nested git repository collisions in monorepos.
