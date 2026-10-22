use actix_web::{web, HttpResponse};
use cobot_adapter::{CobotVectorStore, Embedder, EmbeddingGemmaEmbedder};
use std::sync::Arc;

use crate::apiErr::{bad_request, internal};
use crate::dto::{IngestRes, SearchReq, TextIngestReq};

/// Helper to generate a normalized dense float vector from raw image bytes
fn generate_image_embedding(bytes: &[u8], dim: usize) -> Vec<f32> {
    let mut vec = vec![0.0f32; dim];
    for (i, &byte) in bytes.iter().enumerate() {
        vec[i % dim] += (byte as f32) / 255.0;
    }
    chroma_distance::normalize(&vec)
}

/// Internal Component 1: Generates text embedding, then invokes the adapter to store the vector
pub async fn embed_text(
    id: String,
    bytes: web::Bytes,
    store: web::Data<Arc<CobotVectorStore<EmbeddingGemmaEmbedder>>>,
) -> HttpResponse {
    let payload: TextIngestReq = match serde_json::from_slice(&bytes) {
        Ok(p) => p,
        Err(e) => {
            return bad_request()
                .with_message(format!("Invalid JSON payload: {}", e))
                .error_response();
        }
    };

    let trimmed = payload.text.trim();
    if trimmed.is_empty() {
        return bad_request()
            .with_message("Document text cannot be empty")
            .error_response();
    }

    // 1. Explicitly generate the embedding vector from text
    let vectors = match store.embedder().embed(&[trimmed]).await {
        Ok(v) => v,
        Err(e) => return internal().with_message(e.to_string()).error_response(),
    };
    let vector = match vectors.into_iter().next() {
        Some(v) => v,
        None => return internal().with_message("No vector returned by embedder").error_response(),
    };

    // 2. Invoke the adapter's internal storage engine to insert the vector into HNSW
    match store.insert_vector(&id, vector, trimmed, payload.metadata) {
        Ok(_) => HttpResponse::Ok().json(IngestRes { id }),
        Err(e) => internal().with_message(e.to_string()).error_response(),
    }
}

/// Internal Component 2: Generates image embedding, saves media, then invokes the adapter to store the vector
pub async fn embed_image(
    id: String,
    content_type: &str,
    bytes: web::Bytes,
    store: web::Data<Arc<CobotVectorStore<EmbeddingGemmaEmbedder>>>,
) -> HttpResponse {
    if bytes.is_empty() {
        return bad_request()
            .with_message("Image payload cannot be empty")
            .error_response();
    }

    // 1. Explicitly generate the 768-dim embedding vector from image bytes
    let dim = store.embedder().dimension();
    let vector = generate_image_embedding(&bytes, dim);

    // 2. Save raw image to local storage directory
    let dir = "./data/media";
    if let Err(e) = tokio::fs::create_dir_all(dir).await {
        return internal().with_message(format!("Disk write error: {}", e)).error_response();
    }

    let ext = if content_type.contains("png") { "png" } else { "jpg" };
    let file_path = format!("{}/{}.{}", dir, id, ext);
    if let Err(e) = tokio::fs::write(&file_path, &bytes).await {
        return internal().with_message(format!("Failed to save image file: {}", e)).error_response();
    }

    // 3. Metadata preserves image attributes and physical disk path
    let metadata = serde_json::json!({
        "file_path": file_path,
        "content_type": content_type,
        "size_bytes": bytes.len(),
    });

    // 4. Invoke the adapter's internal storage engine to store the vector and metadata
    match store.insert_vector(&id, vector, &file_path, Some(metadata)) {
        Ok(_) => HttpResponse::Ok().json(IngestRes { id }),
        Err(e) => internal().with_message(e.to_string()).error_response(),
    }
}

/// Internal Component 3: Embeds query vector, then invokes the adapter to search HNSW
pub async fn search_documents(
    req: SearchReq,
    store: web::Data<Arc<CobotVectorStore<EmbeddingGemmaEmbedder>>>,
) -> HttpResponse {
    if let Err(err) = req.validate() {
        return err.error_response();
    }

    // 1. Obtain query vector (either pre-supplied or generated via embedder)
    let query_vector = if let Some(v) = req.query_vector {
        v
    } else {
        match store.embedder().embed(&[&req.query]).await {
            Ok(mut vecs) => match vecs.pop() {
                Some(v) => v,
                None => return internal().with_message("No query vector produced").error_response(),
            },
            Err(e) => return internal().with_message(e.to_string()).error_response(),
        }
    };

    // 2. Invoke the adapter's search_by_vector to query HNSW using SIMD distance
    match store.search_by_vector(&query_vector, req.top_k) {
        Ok(results) => {
            let filtered_results: Vec<_> = if let Some(cutoff) = req.min_score {
                results.into_iter().filter(|r| r.score >= cutoff).collect()
            } else {
                results
            };

            HttpResponse::Ok().json(filtered_results)
        }
        Err(err) => internal().with_message(err.to_string()).error_response(),
    }
}
