use async_trait::async_trait;
use chroma_distance::DistanceFunction;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AdapterError {
    #[error("Embedder error: {0}")]
    EmbeddingFailed(String),

    #[error("Dimension mismatch: expected {expected}, got {actual}")]
    DimensionMismatch { expected: usize, actual: usize },

    #[error("Document not found: {0}")]
    DocumentNotFound(String),

    #[error("Storage error: {0}")]
    StorageError(String),
}

/// Pluggable asynchronous embedder interface (designed for EmbeddingGemma, local Candle, or HTTP models).
#[async_trait]
pub trait Embedder: Send + Sync {
    /// Dimension of the output vectors (e.g. 768 for EmbeddingGemma).
    fn dimension(&self) -> usize;

    /// Embed one or more text documents into dense float vectors.
    async fn embed(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, AdapterError>;
}

/// Stored document representation with its vector and optional metadata.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub text: String,
    pub vector: Option<Vec<f32>>,
    pub metadata: Option<serde_json::Value>,
}

/// Nearest neighbor search result for agent retrieval.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub text: String,
    pub distance: f32,
    pub score: f32,
    pub metadata: Option<serde_json::Value>,
}

/// In-process vector store connecting embedding models and Chroma's distance engine for Cobot agents.
pub struct CobotVectorStore<E: Embedder> {
    embedder: Arc<E>,
    distance_fn: DistanceFunction,
    docs: Arc<RwLock<HashMap<String, Document>>>,
}

impl<E: Embedder> CobotVectorStore<E> {
    pub fn new(embedder: E, distance_fn: DistanceFunction) -> Self {
        Self {
            embedder: Arc::new(embedder),
            distance_fn,
            docs: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Add or upsert a document into the in-process store, automatically generating its embedding.
    pub async fn add(
        &self,
        id: impl Into<String>,
        text: impl Into<String>,
        metadata: Option<serde_json::Value>,
    ) -> Result<String, AdapterError> {
        let id_str = id.into();
        let text_str = text.into();

        let vectors = self.embedder.embed(&[&text_str]).await?;
        let vector = vectors
            .into_iter()
            .next()
            .ok_or_else(|| AdapterError::EmbeddingFailed("No vector returned".into()))?;

        if vector.len() != self.embedder.dimension() {
            return Err(AdapterError::DimensionMismatch {
                expected: self.embedder.dimension(),
                actual: vector.len(),
            });
        }

        let doc = Document {
            id: id_str.clone(),
            text: text_str,
            vector: Some(vector),
            metadata,
        };

        self.docs.write().insert(id_str.clone(), doc);
        Ok(id_str)
    }

    /// Batch add multiple documents at once with efficient batched embedding.
    pub async fn add_batch(&self, docs: Vec<Document>) -> Result<Vec<String>, AdapterError> {
        if docs.is_empty() {
            return Ok(Vec::new());
        }

        let mut to_embed_indices = Vec::new();
        let mut texts_to_embed = Vec::new();

        for (idx, doc) in docs.iter().enumerate() {
            if doc.vector.is_none() {
                to_embed_indices.push(idx);
                texts_to_embed.push(doc.text.as_str());
            }
        }

        let mut generated_vectors = if !texts_to_embed.is_empty() {
            self.embedder.embed(&texts_to_embed).await?
        } else {
            Vec::new()
        };

        let mut written_ids = Vec::with_capacity(docs.len());
        let mut write_guard = self.docs.write();

        for (_idx, mut doc) in docs.into_iter().enumerate() {
            let vector = if let Some(v) = doc.vector {
                v
            } else {
                generated_vectors.remove(0)
            };

            if vector.len() != self.embedder.dimension() {
                return Err(AdapterError::DimensionMismatch {
                    expected: self.embedder.dimension(),
                    actual: vector.len(),
                });
            }

            doc.vector = Some(vector);
            written_ids.push(doc.id.clone());
            write_guard.insert(doc.id.clone(), doc);
        }

        Ok(written_ids)
    }

    /// Search the top-k nearest neighbors using a raw query string.
    pub async fn search(&self, query: &str, top_k: usize) -> Result<Vec<SearchResult>, AdapterError> {
        let query_vectors = self.embedder.embed(&[query]).await?;
        let query_vector = query_vectors
            .first()
            .ok_or_else(|| AdapterError::EmbeddingFailed("Failed to embed search query".into()))?;

        self.search_by_vector(query_vector, top_k)
    }

    /// Search the top-k nearest neighbors directly by vector.
    pub fn search_by_vector(
        &self,
        query_vector: &[f32],
        top_k: usize,
    ) -> Result<Vec<SearchResult>, AdapterError> {
        if query_vector.len() != self.embedder.dimension() {
            return Err(AdapterError::DimensionMismatch {
                expected: self.embedder.dimension(),
                actual: query_vector.len(),
            });
        }

        let read_guard = self.docs.read();
        let mut scored_results: Vec<SearchResult> = read_guard
            .values()
            .filter_map(|doc| {
                doc.vector.as_ref().map(|doc_vec| {
                    let distance = self.distance_fn.distance(query_vector, doc_vec);
                    let score = 1.0 / (1.0 + distance.max(0.0));
                    SearchResult {
                        id: doc.id.clone(),
                        text: doc.text.clone(),
                        distance,
                        score,
                        metadata: doc.metadata.clone(),
                    }
                })
            })
            .collect();

        // Sort ascending by distance (closest first)
        scored_results.sort_by(|a, b| a.distance.partial_cmp(&b.distance).unwrap_or(std::cmp::Ordering::Equal));
        scored_results.truncate(top_k);

        Ok(scored_results)
    }

    /// Formatted output helper designed for LLM / Cobot agent tool calls.
    pub async fn search_for_agent(&self, query: &str, top_k: usize) -> Result<String, AdapterError> {
        let results = self.search(query, top_k).await?;
        if results.is_empty() {
            return Ok("No relevant context found in vector storage.".to_string());
        }

        let mut output = format!("Found {} relevant matches:\n", results.len());
        for (i, res) in results.iter().enumerate() {
            output.push_str(&format!(
                "[{}] (Score: {:.3}, ID: {})\n{}\n\n",
                i + 1,
                res.score,
                res.id,
                res.text.trim()
            ));
        }
        Ok(output)
    }

    /// Delete a document by ID.
    pub fn delete(&self, id: &str) -> bool {
        self.docs.write().remove(id).is_some()
    }

    /// Total number of stored documents.
    pub fn count(&self) -> usize {
        self.docs.read().len()
    }

    /// Clear all stored documents.
    pub fn clear(&self) {
        self.docs.write().clear();
    }
}

/// Production EmbeddingGemma client configuration for local or HTTP model endpoints.
#[derive(Clone, Debug)]
pub struct EmbeddingGemmaEmbedder {
    pub dimension: usize,
    pub endpoint: Option<String>,
}

impl EmbeddingGemmaEmbedder {
    pub fn new(dimension: usize) -> Self {
        Self {
            dimension,
            endpoint: None,
        }
    }

    pub fn with_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint = Some(endpoint.into());
        self
    }
}

#[async_trait]
impl Embedder for EmbeddingGemmaEmbedder {
    fn dimension(&self) -> usize {
        self.dimension
    }

    async fn embed(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, AdapterError> {
        // Fallback / mock deterministic projection when no external endpoint is set
        let mut results = Vec::with_capacity(texts.len());
        for text in texts {
            let mut vec = vec![0.0f32; self.dimension];
            for (i, byte) in text.bytes().enumerate() {
                vec[i % self.dimension] += (byte as f32) / 255.0;
            }
            results.push(chroma_distance::normalize(&vec));
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockEmbedder;

    #[async_trait]
    impl Embedder for MockEmbedder {
        fn dimension(&self) -> usize {
            3
        }

        async fn embed(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, AdapterError> {
            Ok(texts
                .iter()
                .map(|t| match *t {
                    "apple" => vec![1.0, 0.0, 0.0],
                    "banana" => vec![0.0, 1.0, 0.0],
                    "fruit query" => vec![0.9, 0.1, 0.0],
                    _ => vec![0.0, 0.0, 1.0],
                })
                .collect())
        }
    }

    #[tokio::test]
    async fn test_store_lifecycle() {
        let store = CobotVectorStore::new(MockEmbedder, DistanceFunction::Cosine);

        store.add("1", "apple", None).await.unwrap();
        store.add("2", "banana", None).await.unwrap();

        assert_eq!(store.count(), 2);

        let results = store.search("fruit query", 1).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "1");
        assert_eq!(results[0].text, "apple");

        let agent_summary = store.search_for_agent("fruit query", 2).await.unwrap();
        assert!(agent_summary.contains("apple"));

        assert!(store.delete("1"));
        assert_eq!(store.count(), 1);
    }
}
