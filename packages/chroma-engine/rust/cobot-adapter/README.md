# cobot-adapter

`cobot-adapter` is an in-process vector store and model bridge connecting **EmbeddingGemma 2** directly to **Chroma's** core SIMD distance and storage engines for Cobot AI agents.

---

## Why this exists

Upstream Chroma communicates across HTTP/gRPC daemons and defaults to bloated ONNX runtimes. `cobot-adapter` strips this architecture down to bare metal:

1. **Zero IPC / Network Overhead**: Operates entirely in-process in Rust. Vector storage, indexing, and distance queries execute in memory/disk without network serialization.
2. **Built for EmbeddingGemma 2**: Native 768-dimensional dense vectors with support for Matryoshka Representation Learning (MRL) dimension truncation.
3. **Agent-Tool Ready**: Exposes high-level helpers like `search_for_agent()` that return concise, formatted context strings ready for autonomous LLM agent reasoning loops.

---

## Core Interfaces

### The `Embedder` Trait
Pluggable trait for any dense vector model:

```rust
use async_trait::async_trait;
use cobot_adapter::AdapterError;

#[async_trait]
pub trait Embedder: Send + Sync {
    /// Dimension of output vectors (768 for EmbeddingGemma)
    fn dimension(&self) -> usize;

    /// Asynchronously embed texts into dense float vectors
    async fn embed(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, AdapterError>;
}
```

### Usage Example

```rust
use cobot_adapter::{CobotVectorStore, EmbeddingGemmaEmbedder};
use chroma_distance::DistanceFunction;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize EmbeddingGemma (768 dimensions)
    let embedder = EmbeddingGemmaEmbedder::new(768)
        .with_endpoint("http://localhost:11434/api/embeddings"); // or local runner

    // 2. Create in-process vector store
    let store = CobotVectorStore::new(embedder, DistanceFunction::Cosine);

    // 3. Upsert document
    store.add("id-1", "System design anti-pattern audit report", None).await?;

    // 4. Search nearest neighbors
    let results = store.search("architecture audit", 3).await?;
    for res in results {
        println!("Match: {} (Score: {:.3})", res.text, res.score);
    }

    // 5. Agent formatted search output
    let agent_context = store.search_for_agent("architecture audit", 3).await?;
    println!("{}", agent_context);

    Ok(())
}
```
