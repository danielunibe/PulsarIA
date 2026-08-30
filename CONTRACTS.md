# Pulsaria Contracts

## Purpose

This document defines the explicit contracts between modules in Pulsaria. Each contract specifies input, output, state, errors, and version.

## 1. JobRepository

**Location:** `domain/ports.rs`

**Purpose:** Persistence abstraction for job and media data.

**Input:**
- `job_id: i64` — Unique job identifier
- `url: &str` — Media URL
- `status: &str` — Job status string
- `progress: i32` — Completion percentage

**Output:**
- `Result<i64, String>` — New job ID or error
- `Result<Vec<JobRecord>, String>` — Job list or error
- `Result<(), String>` — Success or error

**State:** Stateless (connection provided externally)

**Errors:** Database errors mapped to strings

**Version:** 1.0

## 2. EmbeddingEngine

**Location:** `domain/ports.rs`

**Purpose:** Generate text embeddings for semantic search.

**Input:**
- `text: &str` — Text to embed

**Output:**
- `Result<Vec<f32>, String>` — 384-dimensional vector or error

**State:** Requires ONNX model loaded

**Errors:** Model not loaded, inference failure, dimension mismatch

**Version:** 1.0

## 3. VectorIndex

**Location:** `domain/ports.rs`

**Purpose:** Vector similarity search abstraction.

**Input:**
- `query_vec: &[f32]` — Query embedding
- `limit: usize` — Max results
- `min_score: f32` — Minimum similarity threshold

**Output:**
- `Result<Vec<SearchResult>, String>` — Ranked results or error

**State:** Requires HNSW index loaded

**Errors:** Index not loaded, dimension mismatch

**Version:** 1.0

## 4. JobMessage

**Location:** `domain/models.rs`

**Purpose:** Work unit for the processing queue.

**Fields:**
- `job_id: i64` — Unique job identifier
- `url: String` — Media URL to process
- `attempt: u32` — Retry attempt counter

**Used by:**
- `application/queue_service.rs` — Queue dispatch
- `infrastructure/workers/python_runner.rs` — Worker execution

**Version:** 1.0

## 5. ProgressEvent

**Location:** `queue.rs` (legacy), `domain/models.rs` (clean)

**Purpose:** Event emitted by Python workers during pipeline execution.

**Fields:**
- `job: i64` — Job ID
- `step: QueueStep` — Current pipeline stage
- `progress: i32` — Completion percentage
- `metadata: Option<MediaMetadata>` — Extracted media metadata

**Step values:** queued, metadata, downloading, processing, transcribing, indexing, complete, error

**Used by:**
- `queue.rs` — Event parsing and state updates
- Frontend — Progress bar updates

**Version:** 1.0

## 6. SearchResult

**Location:** `domain/models.rs`, `db.rs`

**Purpose:** Result from semantic or literal search.

**Fields:**
- `job_id: i64` — Video ID
- `title: Option<String>` — Video title
- `thumbnail: Option<String>` — Thumbnail URL
- `chunk_text: String` — Matched transcript text
- `chunk_index: i64` — Chunk position
- `similarity_score: f32` — Relevance score (0.0-1.0)

**Used by:**
- `search_service.rs` — Result ranking
- `commands.rs` — Tauri IPC response
- Frontend — Search results display

**Version:** 1.0

## 7. WorkerResult

**Location:** `infrastructure/workers/python_runner.rs`

**Purpose:** Final result from Python worker pipeline.

**Fields:**
- `transcript: String` — Full transcript text
- `metadata: Option<WorkerMetadata>` — Media metadata
- `segments: Vec<serde_json::Value>` — Timestamped segments
- `visual_analysis: Option<serde_json::Value>` — Visual analysis results
- `instructional_guide: Option<String>` — Generated guide

**Used by:**
- `queue_service.rs` — Persistence and indexing
- `commands.rs` — Import UNIB flow

**Version:** 1.0

## 8. Tauri IPC Contract

**Location:** `commands.rs`

**Purpose:** Frontend-backend communication contract.

**Commands:** 32 total commands registered in `main.rs`

**Error format:** `Result<T, String>` — Success value or error message string

**State access:** Via `tauri::State<'_, AppState>` — thread-safe async locks

**Version:** 1.0

## 9. REST API Contract

**Location:** `api/gateway.rs`

**Purpose:** External HTTP API for SDK and integrations.

**Endpoints:**
- `POST /api/v1/ingest` — Ingest media URL
- `GET /api/v1/jobs` — List all jobs
- `POST /api/v1/search` — Search transcripts
- `GET /api/v1/health` — Health check

**Request/Response:** JSON via Axum

**Auth:** JWT optional (desktop app bypasses)

**Version:** 1.0
