# Pulsaria — Agent Guide

## Purpose

This document helps AI agents work efficiently in the Pulsaria codebase by providing scoped context, clear boundaries, and fast validation paths.

## Project Structure

```
Pulsaria/
├── src-tauri/           ← Rust + Tauri 2 backend
│   ├── src/
│   │   ├── main.rs      ← Composition root (285 LOC, bootstrap only)
│   │   ├── commands.rs  ← All #[tauri::command] IPC handlers
│   │   ├── db.rs        ← SQLite schema & queries
│   │   ├── domain/      ← Pure domain models & ports
│   │   ├── application/ ← Use cases & orchestration
│   │   ├── infrastructure/ ← External adapters (Python, Redis, HNSW)
│   │   ├── api/         ← REST API gateway
│   │   └── ...
│   └── Cargo.toml
├── app/                 ← Next.js 15 frontend
│   ├── page.tsx         ← Main dashboard
│   ├── components/      ← React components
│   ├── hooks/           ← Custom hooks
│   └── lib/             ← Utilities & contexts
├── python-workers/      ← Python pipeline (yt-dlp, whisper, ffmpeg)
├── semantic/            ← TypeScript UNIB semantic layer
├── sdk/typescript/      ← @pulsar/client SDK
└── PROJECT.manifest.json ← Machine-readable project map
```

## Domain Boundaries

| Domain | Path | Responsibility |
|--------|------|----------------|
| ingestion | `commands.rs` | URL validation, job creation, collection expansion |
| processing | `application/queue_service.rs` | Worker pool, retries, circuit breaker |
| transcription | `infrastructure/workers/python_runner.rs` | Python subprocess management |
| indexing | `application/search_service.rs` | Embeddings, HNSW, BM25, reranker |
| library | `db.rs` | SQLite persistence, migrations, queries |

## Dependency Rules

```
UI (Next.js)
  ↓
Commands (Tauri IPC)
  ↓
Application (use cases)
  ↓
Domain (models, ports)
  ↓
Infrastructure (DB, Python, Redis, HNSW)
```

**NO** cross-domain imports. UI cannot import infrastructure directly.

## Key Contracts

| Contract | Location | Purpose |
|----------|----------|---------|
| `JobRepository` | `domain/ports.rs` | Persistence abstraction |
| `EmbeddingEngine` | `domain/ports.rs` | Embedding generation |
| `VectorIndex` | `domain/ports.rs` | Vector search abstraction |
| `JobMessage` | `domain/models.rs` | Work unit for queue |

## Fast Validation

```bash
# Rust only
cargo check --manifest-path src-tauri/Cargo.toml

# Frontend only
npm run build

# Full stack
cargo check && npm run build
```

## Common Tasks

### Add a new Tauri command
1. Add function to `src-tauri/src/commands.rs` with `#[tauri::command]`
2. Add to `invoke_handler` list in `main.rs`
3. Call from frontend via `invoke('command_name', args)`

### Modify database schema
1. Edit `src-tauri/src/db.rs` `init_db()` function
2. Add ALTER TABLE migrations for existing databases
3. Add query functions as needed

### Modify worker pipeline
1. Edit `python-workers/main.py` or submodules
2. Update `PythonWorker::run_pipeline` in `infrastructure/workers/python_runner.rs`
3. Update `ProgressEvent` parsing if event schema changes

## Anti-patterns

- **DON'T** add new `#[tauri::command]` functions to `main.rs` — use `commands.rs`
- **DON'T** create circular imports between application and infrastructure
- **DON'T** define domain types in multiple places — use `domain/models.rs`
- **DON'T** access `rusqlite::Connection` directly from UI components
- **DON'T** hardcode ports/paths — use `data_dir_path()` or env vars

## God Modules (Avoid Expanding)

| Module | LOC | Why Critical |
|--------|-----|--------------|
| `commands.rs` | ~1600 | All IPC commands — OK to be large, but extract domain logic to application/ |
| `db.rs` | 861 | All SQL queries — consider splitting by domain |
| `queue.rs` (legacy) | 798 | Python worker dispatch — being superseded by queue_service.rs |

## Circular Dependencies (Fixed)

| Before | After |
|--------|-------|
| `queue_service.rs` ↔ `python_runner.rs` | `JobMessage` moved to `domain/models.rs` |
