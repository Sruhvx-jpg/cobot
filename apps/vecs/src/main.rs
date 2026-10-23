use actix_web::{web, App, HttpServer};
use embedding_gemma_vecs::{routes, EmbeddingGemmaClient, InferenceConfig, VectorStore};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{info, warn};

const PORTS_JSON: &str = include_str!("../../../config/ports.json");

/// Load the reserved port slice for vecs from central config
fn load_reserved_ports() -> Vec<u16> {
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
fn get_runtime_config_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".cobot").join("runtime").join("vecs.json")
    } else {
        PathBuf::from("/tmp/cobot-runtime-vecs.json")
    }
}

/// Atomically write runtime discovery file for agent tools
fn write_runtime_config(port: u16) -> std::io::Result<()> {
    let path = get_runtime_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

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

    std::fs::write(&path, serde_json::to_string_pretty(&payload)?)?;
    Ok(())
}

fn remove_runtime_config() {
    let _ = std::fs::remove_file(get_runtime_config_path());
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // 1. Off-thread non-blocking logging
    let (non_blocking, _guard) = tracing_appender::non_blocking(std::io::stdout());
    tracing_subscriber::fmt()
        .with_writer(non_blocking)
        .init();

    // 2. EmbeddingGemma 2 configuration
    let endpoint = std::env::var("GEMMA_ENDPOINT")
        .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string());
    let model = std::env::var("GEMMA_MODEL")
        .unwrap_or_else(|_| "embeddinggemma".to_string());
    let dimension = std::env::var("GEMMA_MRL_DIM")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(768);

    let config = InferenceConfig {
        endpoint: endpoint.clone(),
        model: model.clone(),
        dimension,
    };

    let data_dir = std::env::var("VECS_DATA_DIR")
        .ok()
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var("HOME").ok().map(|h| {
                PathBuf::from(h).join(".cobot").join("vecs")
            })
        })
        .unwrap_or_else(|| PathBuf::from("./data/vecs"));

    info!(
        endpoint = %endpoint,
        model = %model,
        dimension = dimension,
        data_dir = ?data_dir,
        "VecS vector service starting"
    );

    // 3. Initialize VectorStore (USearch SIMD Index + SQLite records)
    let client = EmbeddingGemmaClient::new(config);
    let store = VectorStore::new(client, data_dir)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    let store_data = web::Data::new(Arc::new(store));

    // 4. Port failover binding
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
                warn!(port, "Port in use. Trying next port...");
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

    // 5. Write runtime discovery file for agent tools
    if let Ok(()) = write_runtime_config(active_port) {
        info!(port = active_port, "Runtime discovery config written to ~/.cobot/runtime/vecs.json");
    }

    info!(
        port = active_port,
        base_url = %format!("http://127.0.0.1:{}", active_port),
        "VecS HTTP Vector Server listening"
    );

    // 6. Run Actix Web HTTP server
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
