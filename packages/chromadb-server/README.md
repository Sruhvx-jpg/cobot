# @cobot/chromadb-server

High-throughput vector search and ingestion HTTP server built on **Actix Web** and **Chroma's in-process Rust engine (`cobot-adapter`)**.

---

## Key Features

1. **RFC HTTP `QUERY` Method**:
   * Uses [Sruhvx-jpg's actix-web fork](https://github.com/Sruhvx-jpg/actix-web/tree/feat/http-query-method) (`feat/http-query-method`).
   * Provides safe, idempotent, and cacheable search queries with a full JSON request body.
2. **Polymorphic `PUT /documents/{id}` Route**:
   * Single idempotent route for document ingestion.
   * Pattern matches on `Content-Type`:
     - `application/json`: Parsed as text and embedded via EmbeddingGemma.
     - `image/*`: Linear raw byte stream saved to disk and registered in the vector index with metadata.
3. **In-Process Vector Math**:
   * Zero external Chroma database daemon overhead.
   * Talks directly to in-process HNSW and SIMD distance calculation via `cobot-adapter`.

---

## API Endpoints

### 1. Vector Search (`QUERY /documents/search`)
```http
QUERY /documents/search HTTP/1.1
Content-Type: application/json

{
  "query": "authentication tokens in vault",
  "top_k": 5,
  "min_score": 0.70
}
```

### 2. Text Ingestion (`PUT /documents/{id}`)
```http
PUT /documents/doc-101 HTTP/1.1
Content-Type: application/json

{
  "text": "Authentication tokens are encrypted and stored in vault.go",
  "metadata": {
    "author": "agent-1",
    "channel": "core"
  }
}
```

### 3. Image Ingestion (`PUT /documents/{id}`)
```http
PUT /documents/img-202 HTTP/1.1
Content-Type: image/png

<binary raw PNG image bytes>
```

---

## Code Architecture

* **`src/dto.rs`**: Clean wire payloads (`SearchReq`, `TextIngestReq`, `IngestRes`) with internal `.validate()` logic.
* **`src/apiErr.rs`**: `BaseErr` with HTTP status codes and overridable static messages.
* **`src/routes.rs`**: Route registration and header pattern matching dispatch.
* **`src/routesSauce.rs`**: The execution logic components (`embed_text`, `embed_image`, `search_documents`).
* **`src/main.rs`**: Server bootstrap binding to `127.0.0.1:8080`.
