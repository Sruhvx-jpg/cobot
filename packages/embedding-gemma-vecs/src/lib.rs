use actix_web::{web, App, HttpServer};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{info, warn};

pub mod internal;
pub mod routes;
pub mod store;

pub use internal::inference::{
    truncate_and_normalize, EmbeddingGemmaClient, InferenceConfig, CODE_PREFIX, DEFAULT_ENDPOINT,
    DEFAULT_MODEL, DOC_PREFIX, QUERY_PREFIX,
};
pub use store::{Document, SearchResult, StoreError, VectorStore};

/// Compile-time ecosystem ports configuration
pub const PORTS_JSON: &str = include_str!("../../../config/ports.json");

/// Load the reserved port slice for vecs from central config
pub fn load_reserved_ports() -> Vec<u16> {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(PORTS_JSON) {
        if let Some(ports) = val["services"]["vecs"].as_array() {
            return ports
                .iter()
                .filter_map(|p| p.as_u64().map(|v| v as u16))
                .collect();
        }
    }
    vec![8080, 8081, 8082, 8083, 8084]
}

/// Runtime discovery configuration path: ~/.cobot/runtime/vecs.json
pub fn get_runtime_config_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".cobot").join("runtime").join("vecs.json")
    } else {
        PathBuf::from("/tmp/cobot-runtime-vecs.json")
    }
}

/// Atomically write runtime discovery files for internal agent tools
pub fn write_runtime_config(port: u16) -> std::io::Result<()> {
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let payload = serde_json::json!({
        "service": "vecs",
        "host": "127.0.0.1",
        "port": port,
        "base_url": format!("http://127.0.0.1:{}", port),
        "pid": std::process::id(),
        "started_at_secs": now_secs
    });

    let payload_str = serde_json::to_string_pretty(&payload)?;

    let path = get_runtime_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, &payload_str)?;
    Ok(())
}

pub fn remove_runtime_config() {
    let _ = std::fs::remove_file(get_runtime_config_path());
}

/// Initialize VectorStore backed by EmbeddingGemma 2 and USearch + SQLite
pub fn create_store(
    config: InferenceConfig,
    data_dir: impl Into<PathBuf>,
) -> Result<Arc<VectorStore>, StoreError> {
    let client = EmbeddingGemmaClient::new(config);
    let store = VectorStore::new(client, data_dir)?;
    Ok(Arc::new(store))
}

/// Start and run the VecS Actix HTTP Server with automated port failover and runtime discovery
pub async fn start_server(store: Arc<VectorStore>) -> std::io::Result<()> {
    let store_data = web::Data::new(store);

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
                warn!(port, "Port is in use. Trying next reserved port...");
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

    if let Ok(()) = write_runtime_config(active_port) {
        info!(port = active_port, "Runtime discovery config written");
    }

    info!(
        port = active_port,
        base_url = %format!("http://127.0.0.1:{}", active_port),
        "VecS Actix Vector Server bound"
    );

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
        let temp_dir = tempfile::tempdir().unwrap();
        let store = create_store(InferenceConfig::default(), temp_dir.path()).unwrap();
        let store_data = web::Data::new(store);

        let app = test::init_service(
            App::new()
                .app_data(store_data.clone())
                .configure(routes::configure),
        )
        .await;

        let dummy_vec = vec![0.0f32; 768];

        // 1. Test PUT document ingestion
        let put_req = test::TestRequest::put()
            .uri("/documents/doc-101")
            .insert_header(("content-type", "application/json"))
            .set_json(serde_json::json!({
                "text": "Autonomous agent memory storage for Cobot",
                "doc_name": "agent.rs",
                "metadata": { "channel": "dev" },
                "vector": dummy_vec.clone()
            }))
            .to_request();

        let put_resp = test::call_service(&app, put_req).await;
        assert_eq!(put_resp.status(), StatusCode::OK);

        // 2. Test HTTP QUERY vector search
        let query_method = Method::from_bytes(b"QUERY").unwrap();
        let query_req = test::TestRequest::default()
            .method(query_method)
            .uri("/documents/search")
            .insert_header(("content-type", "application/json"))
            .set_json(serde_json::json!({
                "query": "Cobot agent memory",
                "top_k": 3,
                "doc_name": "agent.rs",
                "query_vector": dummy_vec
            }))
            .to_request();

        let query_resp = test::call_service(&app, query_req).await;
        assert_eq!(query_resp.status(), StatusCode::OK);
    }
}
