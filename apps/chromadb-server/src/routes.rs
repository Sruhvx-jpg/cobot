use actix_web::{put, query, web, HttpRequest, HttpResponse};
use cobot_adapter::{CobotVectorStore, EmbeddingGemmaEmbedder};
use std::sync::Arc;

use crate::apiErr::bad_request;
use crate::dto::SearchReq;
use crate::routesSauce;

/// Document ingestion route: pattern matches on Content-Type and delegates to the appropriate sauce
#[put("/documents/{id}")]
pub async fn put_document(
    req: HttpRequest,
    id: web::Path<String>,
    body: web::Bytes,
    store: web::Data<Arc<CobotVectorStore<EmbeddingGemmaEmbedder>>>,
) -> HttpResponse {
    let content_type = req
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let doc_id = id.into_inner();

    // Clean pattern matching on Content-Type
    match content_type {
        "application/json" => {
            routesSauce::embed_text(doc_id, body, store).await
        }
        "image/png" | "image/jpeg" | "image/webp" => {
            routesSauce::embed_image(doc_id, content_type, body, store).await
        }
        _ => bad_request()
            .with_message(format!(
                "Unsupported Content-Type '{}'. Expected 'application/json' or 'image/*'",
                content_type
            ))
            .error_response(),
    }
}

/// Vector similarity search route using the RFC HTTP QUERY method from Sruhvx-jpg's actix-web fork
#[query("/documents/search")]
pub async fn search_document(
    req: web::Json<SearchReq>,
    store: web::Data<Arc<CobotVectorStore<EmbeddingGemmaEmbedder>>>,
) -> HttpResponse {
    routesSauce::search_documents(req.into_inner(), store).await
}

/// Service configuration registering both the PUT and QUERY routes
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(put_document)
       .service(search_document);
}
