use actix_web::{web, HttpResponse};
use std::sync::Arc;

use crate::internal::apiErr::{bad_request, internal};
use crate::internal::dto::{IngestRes, SearchReq, TextIngestReq};
use crate::store::VectorStore;

/// Document ingestion handler: generates embedding via EmbeddingGemma 2 and stores in USearch + SQLite
pub async fn embed_text(
    id: String,
    bytes: web::Bytes,
    store: web::Data<Arc<VectorStore>>,
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

    let doc_name_ref = payload.doc_name.as_deref();

    // Use pre-computed vector or generate via EmbeddingGemma 2 with title context
    let vector = if let Some(v) = payload.vector {
        v
    } else {
        match store.embedder().embed_document(doc_name_ref, trimmed).await {
            Ok(v) => v,
            Err(e) => return internal().with_message(e).error_response(),
        }
    };

    match store.insert_vector(&id, doc_name_ref, &vector, trimmed, payload.metadata) {
        Ok(_) => HttpResponse::Ok().json(IngestRes { id }),
        Err(e) => internal().with_message(e.to_string()).error_response(),
    }
}

/// Image ingestion handler: embeds image via EmbeddingGemma 2 vision and stores in USearch + SQLite
pub async fn embed_image(
    id: String,
    content_type: &str,
    bytes: web::Bytes,
    store: web::Data<Arc<VectorStore>>,
) -> HttpResponse {
    if bytes.is_empty() {
        return bad_request()
            .with_message("Image payload cannot be empty")
            .error_response();
    }

    let vector = match store.embedder().embed_image_bytes(&bytes).await {
        Ok(v) => v,
        Err(e) => return internal().with_message(e).error_response(),
    };

    let dir = "./data/media";
    if let Err(e) = tokio::fs::create_dir_all(dir).await {
        return internal().with_message(format!("Disk write error: {}", e)).error_response();
    }

    let ext = if content_type.contains("png") { "png" } else { "jpg" };
    let file_path = format!("{}/{}.{}", dir, id, ext);
    if let Err(e) = tokio::fs::write(&file_path, &bytes).await {
        return internal().with_message(format!("Failed to save image file: {}", e)).error_response();
    }

    let metadata = serde_json::json!({
        "file_path": file_path,
        "content_type": content_type,
        "size_bytes": bytes.len(),
    });

    let doc_name = format!("{}.{}", id, ext);
    match store.insert_vector(&id, Some(&doc_name), &vector, &file_path, Some(metadata)) {
        Ok(_) => HttpResponse::Ok().json(IngestRes { id }),
        Err(e) => internal().with_message(e.to_string()).error_response(),
    }
}

/// Vector similarity search handler: embeds query with QUERY_PREFIX and searches USearch
pub async fn search_documents(
    req: SearchReq,
    store: web::Data<Arc<VectorStore>>,
) -> HttpResponse {
    if let Err(err) = req.validate() {
        return err.error_response();
    }

    let query_vector = if let Some(v) = req.query_vector {
        v
    } else {
        match store.embedder().embed_query(&req.query).await {
            Ok(v) => v,
            Err(e) => return internal().with_message(e).error_response(),
        }
    };

    let doc_name_filter = req.doc_name.as_deref();
    match store.search_by_vector(&query_vector, req.top_k, doc_name_filter) {
        Ok(results) => {
            let filtered: Vec<_> = if let Some(cutoff) = req.min_score {
                results.into_iter().filter(|r| r.score >= cutoff).collect()
            } else {
                results
            };

            HttpResponse::Ok().json(filtered)
        }
        Err(e) => internal().with_message(e.to_string()).error_response(),
    }
}
