use serde::{Deserialize, Serialize};

use crate::apiErr::{bad_request, BaseErr};

#[derive(Debug, Deserialize, Serialize)]
pub struct SearchReq {
    pub query: String,

    #[serde(default = "default_top_k")]
    pub top_k: usize,

    /// Optional similarity score cutoff (0.0 to 1.0)
    pub min_score: Option<f32>,

    /// Optional metadata key/value filter (e.g. {"channel": "dev"})
    pub filter: Option<serde_json::Value>,

    /// Optional raw vector if the client already computed the embedding
    pub query_vector: Option<Vec<f32>>,
}

fn default_top_k() -> usize {
    5
}

impl SearchReq {
    /// Validates parameters against bounds, returning an overridable BaseErr (400 Bad Request) on failure
    pub fn validate(&self) -> Result<(), BaseErr> {
        let trimmed = self.query.trim();
        if trimmed.is_empty() && self.query_vector.is_none() {
            return Err(bad_request().with_message("Query string cannot be empty when query_vector is omitted"));
        }

        if self.query.len() > 8192 {
            return Err(bad_request().with_message(format!(
                "Query length ({} bytes) exceeds the 8,192 byte limit",
                self.query.len()
            )));
        }

        if self.top_k == 0 || self.top_k > 100 {
            return Err(bad_request().with_message(format!(
                "top_k must be between 1 and 100 (got {})",
                self.top_k
            )));
        }

        if let Some(score) = self.min_score {
            if !(0.0..=1.0).contains(&score) {
                return Err(bad_request().with_message(format!(
                    "min_score must be between 0.0 and 1.0 (got {})",
                    score
                )));
            }
        }

        Ok(())
    }
}

/// Lean document ingestion response returning strictly the document ID
#[derive(Debug, Serialize, Deserialize)]
pub struct IngestRes {
    pub id: String,
}

/// Incoming JSON body for text ingestion
#[derive(Debug, Deserialize, Serialize)]
pub struct TextIngestReq {
    pub text: String,
    pub metadata: Option<serde_json::Value>,
}
