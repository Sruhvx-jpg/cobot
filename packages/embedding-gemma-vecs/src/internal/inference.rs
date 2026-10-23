use serde::{Deserialize, Serialize};
use serde_json::json;

/// Official EmbeddingGemma 2 task instruction prefixes from Google model card
pub const QUERY_PREFIX: &str = "task: search result | query: ";
pub const DOC_PREFIX: &str = "title: none | text: ";
pub const CODE_PREFIX: &str = "task: code retrieval | query: ";

pub const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:8080";
pub const DEFAULT_MODEL: &str = "embeddinggemma2";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InferenceConfig {
    pub endpoint: String,
    pub model: String,
    pub dimension: usize,
}

impl Default for InferenceConfig {
    fn default() -> Self {
        Self {
            endpoint: std::env::var("GEMMA_ENDPOINT").unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string()),
            model: std::env::var("GEMMA_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.to_string()),
            dimension: std::env::var("GEMMA_MRL_DIM")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(768),
        }
    }
}

#[derive(Deserialize)]
struct EmbResp {
    data: Vec<EmbItem>,
}

#[derive(Deserialize)]
struct EmbItem {
    embedding: Vec<f32>,
}

/// Matryoshka Representation Learning (MRL) prefix truncation & L2 re-normalization
pub fn truncate_and_normalize(mut v: Vec<f32>, dim: usize) -> Vec<f32> {
    v.truncate(dim);
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-12);
    v.iter_mut().for_each(|x| *x /= norm);
    v
}

/// Official EmbeddingGemma 2 client powered by llama-server / OpenAI-compatible /v1/embeddings
#[derive(Clone)]
pub struct EmbeddingGemmaClient {
    pub config: InferenceConfig,
    http: reqwest::Client,
}

impl EmbeddingGemmaClient {
    pub fn new(config: InferenceConfig) -> Self {
        Self {
            config,
            http: reqwest::Client::new(),
        }
    }

    pub fn dimension(&self) -> usize {
        self.config.dimension
    }

    /// Embed query text with official Query task prefix
    pub async fn embed_query(&self, query: &str) -> Result<Vec<f32>, String> {
        let results = self.embed_raw(QUERY_PREFIX, &[query]).await?;
        results
            .into_iter()
            .next()
            .ok_or_else(|| "No vector returned for query".to_string())
    }

    /// Embed document text with document name/title in official Document prefix
    pub async fn embed_document(&self, doc_name: Option<&str>, text: &str) -> Result<Vec<f32>, String> {
        let prefix = if let Some(name) = doc_name {
            format!("title: {} | text: ", name)
        } else {
            DOC_PREFIX.to_string()
        };

        let results = self.embed_raw(&prefix, &[text]).await?;
        results
            .into_iter()
            .next()
            .ok_or_else(|| "No vector returned for document".to_string())
    }

    /// Embed batch of texts with prefix
    pub async fn embed_raw(&self, prefix: &str, texts: &[&str]) -> Result<Vec<Vec<f32>>, String> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        let input: Vec<String> = texts.iter().map(|t| format!("{prefix}{t}")).collect();
        let url = format!("{}/v1/embeddings", self.config.endpoint.trim_end_matches('/'));

        let resp = self
            .http
            .post(&url)
            .json(&json!({
                "model": self.config.model,
                "input": input,
            }))
            .send()
            .await
            .map_err(|e| format!("Failed to reach EmbeddingGemma 2 endpoint at {}: {}", url, e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(format!("EmbeddingGemma 2 returned HTTP {}: {}", status, err_text));
        }

        let emb_resp: EmbResp = resp
            .json()
            .await
            .map_err(|e| format!("Invalid response JSON from EmbeddingGemma 2: {}", e))?;

        Ok(emb_resp
            .data
            .into_iter()
            .map(|d| truncate_and_normalize(d.embedding, self.config.dimension))
            .collect())
    }

    /// Multimodal: Embed raw image bytes via vision embeddings endpoint
    pub async fn embed_image_bytes(&self, bytes: &[u8]) -> Result<Vec<f32>, String> {
        if bytes.is_empty() {
            return Err("Image bytes cannot be empty".to_string());
        }

        let base64_img = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
        let data_uri = format!("data:image/png;base64,{}", base64_img);

        let url = format!("{}/v1/embeddings", self.config.endpoint.trim_end_matches('/'));
        let resp = self
            .http
            .post(&url)
            .json(&json!({
                "model": self.config.model,
                "input": [data_uri],
            }))
            .send()
            .await
            .map_err(|e| format!("Failed to reach EmbeddingGemma 2 vision endpoint: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(format!("EmbeddingGemma 2 vision returned HTTP {}: {}", status, err_text));
        }

        let emb_resp: EmbResp = resp
            .json()
            .await
            .map_err(|e| format!("Invalid JSON from vision embedder: {}", e))?;

        let first = emb_resp
            .data
            .into_iter()
            .next()
            .ok_or_else(|| "No vector returned for image".to_string())?;

        Ok(truncate_and_normalize(first.embedding, self.config.dimension))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_prefixes() {
        assert_eq!(QUERY_PREFIX, "task: search result | query: ");
        assert_eq!(DOC_PREFIX, "title: none | text: ");
    }

    #[test]
    fn test_truncate_and_normalize_mrl() {
        let raw = vec![0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
        let norm_4 = truncate_and_normalize(raw, 4);

        assert_eq!(norm_4.len(), 4);
        let l2: f32 = norm_4.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((l2 - 1.0).abs() < 1e-5);
    }
}
