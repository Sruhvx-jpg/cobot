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

    HttpServer::new(move || {
        App::new()
            .app_data(store_data.clone())
            .configure(routes::configure)
    })
    .bind((host, port))?
    .run()
    .await
}
