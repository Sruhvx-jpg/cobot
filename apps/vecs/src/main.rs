use embedding_gemma_vecs::{
    create_store, start_server, InferenceConfig, DEFAULT_ENDPOINT, DEFAULT_MODEL,
};
use std::path::PathBuf;
use tracing::info;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // True off-thread non-blocking logging
    let (non_blocking, _guard) = tracing_appender::non_blocking(std::io::stdout());
    tracing_subscriber::fmt()
        .with_writer(non_blocking)
        .init();

    let endpoint = std::env::var("GEMMA_ENDPOINT")
        .unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string());
    let model = std::env::var("GEMMA_MODEL")
        .unwrap_or_else(|_| DEFAULT_MODEL.to_string());

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

    let store = create_store(config, data_dir)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

    start_server(store).await
}
