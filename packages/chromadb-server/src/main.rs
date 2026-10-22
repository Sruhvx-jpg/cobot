use actix_web::{web, App, HttpServer};
use chroma_distance::DistanceFunction;
use cobot_adapter::{CobotVectorStore, EmbeddingGemmaEmbedder};
use std::sync::Arc;

#[allow(non_snake_case)]
pub mod apiErr;
pub mod dto;
#[allow(non_snake_case)]
pub mod routesSauce;
pub mod routes;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt::init();

    // 1. Initialize in-process vector store (768-dim EmbeddingGemma + Cosine)
    let embedder = EmbeddingGemmaEmbedder::new(768);
    let store = Arc::new(CobotVectorStore::new(embedder, DistanceFunction::Cosine));
    let store_data = web::Data::new(store);

    let host = "127.0.0.1";
    let port = 8080;
    println!("🚀 ChromaDB Actix Vector Server running on http://{}:{}", host, port);

    // 2. Mount routes via configure
    HttpServer::new(move || {
        App::new()
            .app_data(store_data.clone())
            .configure(routes::configure)
    })
    .bind((host, port))?
    .run()
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::http::{Method, StatusCode};
    use actix_web::test;

    #[actix_web::test]
    async fn test_routes_mounted_put_and_query() {
        let embedder = EmbeddingGemmaEmbedder::new(768);
        let store = Arc::new(CobotVectorStore::new(embedder, DistanceFunction::Cosine));
        let store_data = web::Data::new(store);

        let app = test::init_service(
            App::new()
                .app_data(store_data.clone())
                .configure(routes::configure),
        )
        .await;

        // 1. Test PUT document ingestion
        let put_req = test::TestRequest::put()
            .uri("/documents/doc-101")
            .insert_header(("content-type", "application/json"))
            .set_json(serde_json::json!({
                "text": "Autonomous agent memory storage for Cobot",
                "metadata": { "channel": "dev" }
            }))
            .to_request();

        let put_resp = test::call_service(&app, put_req).await;
        assert_eq!(put_resp.status(), StatusCode::OK);

        // 2. Test HTTP QUERY vector search (using RFC QUERY method)
        let query_method = Method::from_bytes(b"QUERY").unwrap();
        let query_req = test::TestRequest::default()
            .method(query_method)
            .uri("/documents/search")
            .insert_header(("content-type", "application/json"))
            .set_json(serde_json::json!({
                "query": "Cobot agent memory",
                "top_k": 3
            }))
            .to_request();

        let query_resp = test::call_service(&app, query_req).await;
        assert_eq!(query_resp.status(), StatusCode::OK);
    }
}
