# @cobot/chroma-engine

> **Origin & Attribution Disclaimer**:
> This engine is cloned and trimmed directly from upstream **ChromaDB** ([chroma-core/chroma](https://github.com/chroma-core/chroma)).
> It was **NOT** built from scratch by Sruhvx-jpg. It has been specifically extracted, streamlined to exclude unused upstream components, and is **actively extended and developed** to serve as an embedded vector database engine and TypeScript client extension for **Cobot**.

---

## Architecture & Layout

This package retains only the core systems engine and client bindings necessary for Cobot's execution model:

- **`rust/` (Core Vector Engine)**:
  - `rust/cobot-adapter`: In-process vector storage adapter bridging EmbeddingGemma 2 directly to Chroma's storage and distance engines with zero network overhead.
  - `rust/index`: Fast vector indexing (HNSW, Tantivy integration).
  - `rust/distance`: SIMD-accelerated distance metrics (Cosine, Euclidean, Dot Product).
  - `rust/segment`: Record, vector, and metadata segment managers.
  - `rust/blockstore` & `rust/storage`: Persistent block storage and cache layers.
  - `rust/wal3`: Write-ahead logging for durability.
  - `rust/frontend` & `rust/worker`: Query processing and worker executors.
  - `rust/js_bindings`: Native NAPI/WASM bindings for JS/TS runtime integration.

- **`idl/` (Protocol Buffers & gRPC Schemas)**:
  - Protocol definitions (`chroma.proto`) required for building Rust crates and schema-accurate serialization.

- **`clients/` (TypeScript / JS SDK)**:
  - `clients/new-js`: Modern modular TypeScript client for querying and managing collections without heavy runtime dependencies.

---

## EmbeddingGemma 2 Integration (`cobot-adapter`)

Upstream Chroma uses a default ONNX-based model (`all-MiniLM-L6-v2`) via `@chroma-core/default-embed`. This was completely eliminated in favor of **EmbeddingGemma 2** (Google's 768-dimensional dense embedding model).

The `cobot-adapter` crate (`rust/cobot-adapter`) provides an in-process, zero-daemon bridge:

```rust
use cobot_adapter::{CobotVectorStore, EmbeddingGemmaEmbedder};
use chroma_distance::DistanceFunction;

// 1. Initialize EmbeddingGemma embedder (768-dim)
let embedder = EmbeddingGemmaEmbedder::new(768);

// 2. Initialize in-process vector store with SIMD Cosine distance
let store = CobotVectorStore::new(embedder, DistanceFunction::Cosine);

// 3. Add documents (automatically embedded and indexed)
store.add("doc-1", "Cobot autonomous agent memory", None).await?;

// 4. Query directly or format for LLM agent tool calls
let matches = store.search("agent memory", 5).await?;
let agent_prompt_context = store.search_for_agent("agent memory", 5).await?;
```

---

## Excluded Upstream Components

To keep Cobot lean and focused, the following upstream components were completely removed:

- **Python Stack**: Removed `chromadb/`, `clients/python/`, and PyO3 `rust/python_bindings`.
- **Go Cluster Coordinator**: Removed `go/` (Postgres SysDB coordinator and cluster manager).
- **Cloud & Orchestration**: Removed `k8s/`, `deployments/`, `Tiltfile`, and Docker Compose multi-node infrastructure.
- **Heavy Embedder Runtimes**: Removed `default-embed` (`onnxruntime-node` / `@huggingface/transformers`) and third-party vendor wrappers in favor of direct EmbeddingGemma vector indexing.
- **Non-Essential Artifacts**: Removed sample apps, documentation demos, plans, and upstream GitHub Actions workflows.

---

## License

Upstream Chroma is licensed under the [Apache License, Version 2.0](./LICENSE). All upstream rights remain with Chroma Core, Inc.
