# Pulsaria Architecture

## Overview

Pulsar Eventide is a desktop multimodal video processing engine built with Rust + Tauri 2 + Next.js 15.

## Layered Architecture

```
+----------------------------------------------------------+
¦  Frontend (Next.js 15 / React 19)                       ¦
¦  +- Tauri IPC (invoke) + Event Emitter                   ¦
+----------------------------------------------------------+
¦
+----------------------------------------------------------+
¦  Tauri 2 / Rust Core (este módulo)                       ¦
¦  +- AppState (db, queue, onnx, search, config, metrics)  ¦
¦  +- QueueManager ? Python workers (subprocesos aislados) ¦
¦  +- ONNXModelManager (all-MiniLM-L6-v2, 384d)           ¦
¦  +- SearchService (HNSW + BM25 + Reranker)               ¦
¦  +- Axum API Gateway (:8080) + Metrics (:9001)           ¦
+----------------------------------------------------------+
```

## Dependency Direction

```
UI (Next.js)
  ?
Commands (Tauri IPC)
  ?
Application (use cases)
  ?
Domain (models, ports)
  ?
Infrastructure (DB, Python, Redis, HNSW)
```

## Domain Boundaries

| Domain | Path | Responsibility |
|--------|------|----------------|
| ingestion | `commands.rs` | URL validation, job creation, collection expansion |
| processing | `application/queue_service.rs` | Worker pool, retries, circuit breaker |
| transcription | `infrastructure/workers/python_runner.rs` | Python subprocess management |
| indexing | `application/search_service.rs` | Embeddings, HNSW, BM25, reranker |
| library | `db.rs` | SQLite persistence, migrations, queries |

## Key Contracts

| Contract | Location | Purpose |
|----------|----------|---------|
| `JobRepository` | `domain/ports.rs` | Persistence abstraction |
| `EmbeddingEngine` | `domain/ports.rs` | Embedding generation |
| `VectorIndex` | `domain/ports.rs` | Vector search abstraction |
| `JobMessage` | `domain/models.rs` | Work unit for queue |

## Module Responsibilities

### commands.rs (~1600 LOC)
All `#[tauri::command]` IPC handlers. Includes:
- Job lifecycle: `add_job`, `get_jobs`, `search_transcripts`
- Config: `get_search_config`, `update_search_config`, `set_download_dir`
- Media: `get_transcript`, `set_video_keep_status`, `export_semantic`
- Playlists: `get_playlists`, `create_playlist`, `add_to_playlist`
- Maintenance: `rebuild_index`, `vacuum_db`, `recompute_embeddings`

### db.rs (861 LOC)
SQLite schema, migrations, and raw queries. Contains:
- Schema initialization with ALTER TABLE migrations
- Job CRUD operations
- Media metadata operations
- Transcript segments and embeddings
- Playlist CRUD
- Collection sources
- Literal search
- Video clustering

### application/queue_service.rs (508 LOC)
Worker pool orchestration:
- `QueueService` with mpsc channel
- Backpressure and circuit breaker integration
- `execute_job_with_retries` with worker pool
- Media retention cleanup

### infrastructure/workers/python_runner.rs (236 LOC)
Python subprocess management:
- `PythonWorker::spawn` for process creation
- `PythonWorker::run_pipeline` for execution
- JSON event parsing from stdout
- Progress event emission to Tauri

### application/search_service.rs
Semantic search orchestration:
- Embedding generation via ONNX
- Semantic chunking
- HNSW vector search
- BM25 lexical search
- Reranker cross-encoder
- Semantic cache (Redis)

## Data Flow

### Ingestion
```
Frontend ? Tauri IPC ? commands::add_job
  ? db::insert_job
  ? queue::QueueManager::dispatch_worker_with_config
  ? Python worker (yt-dlp download)
  ? ProgressEvent ? Tauri event ? Frontend
```

### Search
```
Frontend ? Tauri IPC ? commands::search_transcripts
  ? ONNX embedding
  ? db::search_embeddings (SQLite cosine)
  ? Results ? Frontend
```

### Collection Sync
```
Background loop ? commands::collection_sync_loop
  ? queue::QueueManager::expand_collection (Python)
  ? db::find_job_id_by_url / db::insert_job
  ? queue::dispatch_worker (new videos)
```

## Configuration

Settings are persisted to `data/settings/`:
- `search_config.json` — SearchConfig
- `download_dir.txt` — Download path
- `cookie_browser.txt` — Browser for cookies
- `retention.txt` — keep/online policy
- `formats.json` — Format list

Environment variables:
- `PULSAR_DOWNLOAD_DIR` — Override download path
- `PULSAR_COOKIES_FROM_BROWSER` — Browser choice
- `PULSAR_DEFAULT_RETENTION` — keep/online
- `PULSAR_FORMATS` — JSON array of formats
- `PULSAR_API_PORT` — REST API port (default 8080)
- `SHARD_COUNT` — HNSW shard count (default 4)
- `RERANKER_ENABLED` — Enable reranker (default false)
- `REDIS_URL` — Redis connection (default redis://127.0.0.1/)
