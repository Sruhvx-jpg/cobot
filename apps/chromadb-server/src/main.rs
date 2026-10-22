use actix_web::{web, App, HttpServer};
use chroma_distance::DistanceFunction;
use cobot_adapter::{CobotVectorStore, EmbeddingGemmaEmbedder};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;

#[allow(non_snake_case)]
pub mod apiErr;
pub mod dto;
#[allow(non_snake_case)]
pub mod routesSauce;
pub mod routes;

/// Compile-time embedded ecosystem ports configuration
const PORTS_JSON: &str = include_str!("../../../config/ports.json");

/// Load the reserved port slice for chromadb_server from central config
fn load_reserved_ports() -> Vec<u16> {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(PORTS_JSON) {
        if let Some(ports) = val["services"]["chromadb_server"].as_array() {
            return ports
                .iter()
                .filter_map(|p| p.as_u64().map(|v| v as u16))
                .collect();
        }
    }
    // Fallback default slice if config parsing fails
    vec![8080, 8081, 8082, 8083, 8084]
}

/// Runtime configuration path: ~/.cobot/runtime/chromadb.json
fn get_runtime_config_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".cobot").join("runtime").join("chromadb.json")
    } else {
        PathBuf::from("/tmp/cobot-runtime-chromadb.json")
    }
}

/// Atomically write runtime discovery file for internal agent tools
fn write_runtime_config(port: u16) -> std::io::Result<PathBuf> {
    let path = get_runtime_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let payload = serde_json::json!({
        "service": "chromadb-server",
        "host": "127.0.0.1",
        "port": port,
        "base_url": format!("http://127.0.0.1:{}", port),
        "pid": std::process::id(),
        "started_at_secs": now_secs
    });

    std::fs::write(&path, serde_json::to_string_pretty(&payload)?)?;
    Ok(path)
}

fn remove_runtime_config() {
    let path = get_runtime_config_path();
    let _ = std::fs::remove_file(path);
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt::init();

    // 1. Initialize in-process vector store (768-dim EmbeddingGemma + Cosine)
    let embedder = EmbeddingGemmaEmbedder::new(768);
    let store = Arc::new(CobotVectorStore::new(embedder, DistanceFunction::Cosine));
    let store_data = web::Data::new(store);

    // 2. Iterate through reserved port stack to mitigate EADDRINUSE
    let ports = load_reserved_ports();
    let mut bound_listener = None;
    let mut active_port = 0;

    for &port in &ports {
        match TcpListener::bind(("127.0.0.1", port)) {
            Ok(listener) => {
                bound_listener = Some(listener);
                active_port = port;
                break;
            }
            Err(err) if err.kind() == std::io::ErrorKind::AddrInUse => {
                println!("⚠️ Port {} is in use. Trying next reserved port...", port);
                continue;
            }
            Err(err) => return Err(err),
        }
    }

    let listener = bound_listener.ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::AddrNotAvailable,
            format!("All reserved ports ({:?}) are in use", ports),
        )
    })?;

    // 3. Atomically write runtime discovery file for agent tools
    if let Ok(config_path) = write_runtime_config(active_port) {
        println!("📝 Runtime config written: {:?}", config_path);
    }

    println!("🚀 ChromaDB Actix Vector Server bound on http://127.0.0.1:{}", active_port);

    let server = HttpServer::new(move || {
        App::new()
            .app_data(store_data.clone())
            .configure(routes::configure)
    })
    .listen(listener)?
    .run();

    let res = server.await;
    remove_runtime_config();
    res
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
