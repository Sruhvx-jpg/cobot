pub mod internal;
pub mod routes;
pub mod store;

pub use internal::inference::{
    truncate_and_normalize, EmbeddingGemmaClient, InferenceConfig, CODE_PREFIX, DEFAULT_ENDPOINT,
    DEFAULT_MODEL, DOC_PREFIX, QUERY_PREFIX,
};
pub use store::{Document, SearchResult, StoreError, VectorStore};

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::http::{Method, StatusCode};
    use actix_web::{test, web, App};
    use std::sync::Arc;

    #[actix_web::test]
    async fn test_routes_mounted_put_and_query() {
        let temp_dir = tempfile::tempdir().unwrap();
        let client = EmbeddingGemmaClient::new(InferenceConfig::default());
        let store = VectorStore::new(client, temp_dir.path()).unwrap();
        let store_data = web::Data::new(Arc::new(store));

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
