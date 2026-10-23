use actix_web::{put, web, HttpRequest, HttpResponse};
use std::sync::Arc;

use crate::internal::apiErr::bad_request;
use crate::internal::dto::SearchReq;
use crate::internal::routesSauce;
use crate::store::VectorStore;

/// Document ingestion route: pattern matches on Content-Type and delegates to sauce
#[put("/documents/{id}")]
pub async fn put_document(
    req: HttpRequest,
    id: web::Path<String>,
    body: web::Bytes,
    store: web::Data<Arc<VectorStore>>,
) -> HttpResponse {
    let content_type = req
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let doc_id = id.into_inner();

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

/// Vector similarity search route using HTTP QUERY method
#[actix_web::route("/documents/search", method = "QUERY")]
pub async fn search_document(
    req: web::Json<SearchReq>,
    store: web::Data<Arc<VectorStore>>,
) -> HttpResponse {
    routesSauce::search_documents(req.into_inner(), store).await
}

/// Service configuration registering both PUT and QUERY routes
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(put_document)
       .service(search_document);
}
