use parking_lot::{Mutex, RwLock};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use thiserror::Error;
use usearch::{Index, IndexOptions, MetricKind, ScalarKind};

use crate::internal::inference::EmbeddingGemmaClient;

#[derive(Error, Debug)]
pub enum StoreError {
    #[error("Vector index error: {0}")]
    Usearch(String),

    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Dimension mismatch: expected {expected}, got {actual}")]
    DimensionMismatch { expected: usize, actual: usize },

    #[error("Document not found: {0}")]
    NotFound(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Embedding error: {0}")]
    Embedding(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub doc_name: Option<String>,
    pub text: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub doc_name: Option<String>,
    pub text: String,
    pub distance: f32,
    pub score: f32,
    pub metadata: Option<serde_json::Value>,
}

/// Self-contained, persistent vector database backed by USearch and SQLite
pub struct VectorStore {
    embedder: Arc<EmbeddingGemmaClient>,
    index: Arc<RwLock<Index>>,
    conn: Arc<Mutex<Connection>>,
    next_key: Arc<AtomicU64>,
    data_dir: PathBuf,
}

impl VectorStore {
    pub fn new(embedder: EmbeddingGemmaClient, data_dir: impl Into<PathBuf>) -> Result<Self, StoreError> {
        let dir = data_dir.into();
        std::fs::create_dir_all(&dir).map_err(|e| StoreError::Usearch(e.to_string()))?;

        let dim = embedder.dimension();
        let mut options = IndexOptions::default();
        options.dimensions = dim;
        options.metric = MetricKind::Cos;
        options.quantization = ScalarKind::F32;

        let index_path = dir.join("vectors.usearch");
        let index = if index_path.exists() {
            let idx = Index::new(&options).map_err(|e| StoreError::Usearch(e.to_string()))?;
            idx.load(index_path.to_str().unwrap())
                .map_err(|e| StoreError::Usearch(e.to_string()))?;
            idx
        } else {
            let idx = Index::new(&options).map_err(|e| StoreError::Usearch(e.to_string()))?;
            idx.reserve(100_000).map_err(|e| StoreError::Usearch(e.to_string()))?;
            idx
        };

        let db_path = dir.join("records.sqlite");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS records (
                key INTEGER PRIMARY KEY,
                id TEXT UNIQUE NOT NULL,
                doc_name TEXT,
                text TEXT NOT NULL,
                metadata TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_records_id ON records(id);
            CREATE INDEX IF NOT EXISTS idx_records_doc_name ON records(doc_name);"
        )?;

        let max_key: Option<u64> = conn.query_row(
            "SELECT MAX(key) FROM records",
            [],
            |row| row.get(0),
        ).unwrap_or(None);

        let next_key = max_key.map(|k| k + 1).unwrap_or(1);

        Ok(Self {
            embedder: Arc::new(embedder),
            index: Arc::new(RwLock::new(index)),
            conn: Arc::new(Mutex::new(conn)),
            next_key: Arc::new(AtomicU64::new(next_key)),
            data_dir: dir,
        })
    }

    pub fn embedder(&self) -> &EmbeddingGemmaClient {
        &self.embedder
    }

    pub fn insert_vector(
        &self,
        id: &str,
        doc_name: Option<&str>,
        vector: &[f32],
        text: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<String, StoreError> {
        let expected_dim = self.embedder.dimension();
        if vector.len() != expected_dim {
            return Err(StoreError::DimensionMismatch {
                expected: expected_dim,
                actual: vector.len(),
            });
        }

        let conn = self.conn.lock();
        let existing_key: Option<u64> = conn.query_row(
            "SELECT key FROM records WHERE id = ?1",
            params![id],
            |row| row.get(0),
        ).ok();

        let key = if let Some(k) = existing_key {
            let meta_json = metadata.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());
            conn.execute(
                "UPDATE records SET doc_name = ?1, text = ?2, metadata = ?3 WHERE key = ?4",
                params![doc_name, text, meta_json, k],
            )?;
            k
        } else {
            let k = self.next_key.fetch_add(1, Ordering::SeqCst);
            let meta_json = metadata.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());
            conn.execute(
                "INSERT INTO records (key, id, doc_name, text, metadata) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![k, id, doc_name, text, meta_json],
            )?;
            k
        };

        // Add to USearch index and save checkpoint
        {
            let index = self.index.write();
            index.add(key, vector).map_err(|e| StoreError::Usearch(e.to_string()))?;
            let index_path = self.data_dir.join("vectors.usearch");
            let _ = index.save(index_path.to_str().unwrap());
        }

        Ok(id.to_string())
    }

    pub fn search_by_vector(
        &self,
        query_vector: &[f32],
        top_k: usize,
        doc_name_filter: Option<&str>,
    ) -> Result<Vec<SearchResult>, StoreError> {
        let expected_dim = self.embedder.dimension();
        if query_vector.len() != expected_dim {
            return Err(StoreError::DimensionMismatch {
                expected: expected_dim,
                actual: query_vector.len(),
            });
        }

        let search_results = {
            let index = self.index.read();
            index.search(query_vector, top_k * 2)
                .map_err(|e| StoreError::Usearch(e.to_string()))?
        };

        let conn = self.conn.lock();
        let mut results = Vec::new();

        for (&key, &distance) in search_results.keys.iter().zip(search_results.distances.iter()) {
            let query_res: Result<(String, Option<String>, String, Option<String>), _> = conn.query_row(
                "SELECT id, doc_name, text, metadata FROM records WHERE key = ?1",
                params![key],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            );

            if let Ok((id, doc_name, text, meta_str)) = query_res {
                if let Some(target_doc) = doc_name_filter {
                    if doc_name.as_deref() != Some(target_doc) {
                        continue;
                    }
                }

                let metadata: Option<serde_json::Value> = meta_str
                    .and_then(|s| serde_json::from_str(&s).ok());

                // Cosine similarity score
                let score = 1.0 - (distance / 2.0).clamp(0.0, 1.0);

                results.push(SearchResult {
                    id,
                    doc_name,
                    text,
                    distance,
                    score,
                    metadata,
                });

                if results.len() >= top_k {
                    break;
                }
            }
        }

        Ok(results)
    }

    pub fn delete(&self, id: &str) -> Result<bool, StoreError> {
        let conn = self.conn.lock();
        let key_opt: Option<u64> = conn.query_row(
            "SELECT key FROM records WHERE id = ?1",
            params![id],
            |row| row.get(0),
        ).ok();

        if let Some(key) = key_opt {
            conn.execute("DELETE FROM records WHERE key = ?1", params![key])?;
            let index = self.index.write();
            let _ = index.remove(key);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn count(&self) -> usize {
        let index = self.index.read();
        index.size()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_store_lifecycle() {
        let temp_dir = tempfile::tempdir().unwrap();
        let client = EmbeddingGemmaClient::new(crate::internal::inference::InferenceConfig {
            endpoint: "http://127.0.0.1:8080".into(),
            model: "embeddinggemma2".into(),
            dimension: 4,
        });

        let store = VectorStore::new(client, temp_dir.path()).unwrap();
        let v1 = vec![1.0, 0.0, 0.0, 0.0];
        let v2 = vec![0.0, 1.0, 0.0, 0.0];

        store.insert_vector("doc1", Some("auth.rs"), &v1, "Authentication tokens", None).unwrap();
        store.insert_vector("doc2", Some("main.rs"), &v2, "Server entrypoint", None).unwrap();

        assert_eq!(store.count(), 2);

        let q = vec![0.9, 0.1, 0.0, 0.0];
        let results = store.search_by_vector(&q, 1, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "doc1");
        assert_eq!(results[0].doc_name.as_deref(), Some("auth.rs"));

        // Test filter by doc_name
        let filtered = store.search_by_vector(&q, 2, Some("main.rs")).unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].id, "doc2");

        assert!(store.delete("doc1").unwrap());
        assert_eq!(store.count(), 1);
    }
}
