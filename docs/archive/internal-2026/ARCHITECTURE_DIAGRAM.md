# 🌌 Pulsaria — Diagrama de Arquitectura

## Vista General del Sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USUARIO                                   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js 15 + React 19)                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  app/page.tsx — Dashboard Principal                             │    │
│  │  ├── Header.tsx        (Búsqueda semántica/literal + métricas)  │    │
│  │  ├── Sidebar.tsx       (Panel lateral con tabs)                 │    │
│  │  │   ├── AddLinks.tsx  (Ingesta de URLs/archivos)              │    │
│  │  │   ├── QueueSection.tsx (Cola de procesamiento)              │    │
│  │  │   ├── PlaylistsPanel.tsx (Colecciones temáticas)            │    │
│  │  │   └── PagePanel.tsx (Config de presentación)                │    │
│  │  ├── VideoGrid.tsx     (Grid de videos procesados)             │    │
│  │  │   └── VideoCard.tsx (Card individual de video)              │    │
│  │  ├── StatsPanel.tsx    (Métricas de uso)                       │    │
│  │  ├── ExpandedVideoModal.tsx (Modal de análisis detallado)      │    │
│  │  └── ColorBends.tsx    (Fondo aurora WebGL)                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Panel Engine (config/) — Diagnóstico Técnico                  │    │
│  │  ├── SemanticConfigPanel.tsx (Estado ONNX/BD/config)           │    │
│  │  ├── ModelStatusCard.tsx    (Estado del modelo)                │    │
│  │  ├── DatabaseStatusCard.tsx (Salud de SQLite)                  │    │
│  │  ├── SearchParametersCard.tsx (Umbrales de búsqueda)           │    │
│  │  ├── PerformanceMetricsCard.tsx (Latencias)                    │    │
│  │  ├── PipelineDebugPanel.tsx (Debug de pipeline)                │    │
│  │  └── SystemLogsCard.tsx    (Logs en tiempo real)               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │  Tauri IPC (invoke)    │
                    │  + Event Emitter       │
                    └───────────┬───────────┘
                                │
┌───────────────────────────────┴─────────────────────────────────────────┐
│                      BACKEND (Rust + Tauri 2)                           │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  main.rs — Entry Point & Comandos Tauri                        │    │
│  │  ├── AppState (db, queue, onnx, search, config, metrics)       │    │
│  │  ├── Comandos IPC: add_job, get_jobs, search_transcripts,      │    │
│  │  │   get_model_status, get_db_status, debug_search, etc.       │    │
│  │  └── Servidor Axum REST (:8080) + Metrics (:9001)             │    │
│  └───────────┬─────────────────────────────────────────────────────┘    │
│              │                                                          │
│  ┌───────────▼─────────────────────────────────────────────────────┐    │
│  │  queue.rs — Gestor de Cola Asíncrono                            │    │
│  │  ├── dispatch_worker() → Subproceso Python aislado              │    │
│  │  ├── Parsea eventos JSON del worker (ProgressEvent)             │    │
│  │  ├── Actualiza estado en SQLite                                 │    │
│  │  ├── Genera embeddings ONNX post-transcripción                  │    │
│  │  └── Indexa en HNSW + persiste chunks en SQLite                 │    │
│  └───────────┬─────────────────────────────────────────────────────┘    │
│              │                                                          │
│  ┌───────────▼─────────────────────────────────────────────────────┐    │
│  │  Motor Vectorial & Búsqueda                                     │    │
│  │  ├── embedding.rs (ONNX Model Manager, MiniLM 384d)            │    │
│  │  ├── SearchService (HNSW + BM25 + Reranker + Cache)            │    │
│  │  ├── SemanticChunker (chunking con overlap)                     │    │
│  │  └── VectorShardManager (4 shards HNSW paralelos)              │    │
│  └───────────┬─────────────────────────────────────────────────────┘    │
│              │                                                          │
│  ┌───────────▼─────────────────────────────────────────────────────┐    │
│  │  Persistencia                                                   │    │
│  │  ├── db.rs — SQLite (jobs, media, transcript_embeddings,        │    │
│  │  │           transcript_segments, playlists, playlist_items,     │    │
│  │  │           collection_sources)                                  │    │
│  │  └── data/ — library.db + vector_index_shard_*.hnsw             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   Tokio Child Process  │
                    │   (stdin/stdout JSON)  │
                    └───────────┬───────────┘
                                │
┌───────────────────────────────┴─────────────────────────────────────────┐
│                   WORKERS PYTHON (aislados)                             │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  main.py — Orchestrator (ejecuta el pipeline completo)          │    │
│  │                                                                 │    │
│  │  Pipeline por job:                                              │    │
│  │  ┌──────────────────────────────────────────────────────────┐   │    │
│  │  │ 1. downloader.py (yt-dlp)                                │   │    │
│  │  │    ├── extract_metadata() → JSON con título, autor, etc. │   │    │
│  │  │    └── download_video() → video.mp4                      │   │    │
│  │  └──────────────────────────┬───────────────────────────────┘   │    │
│  │                             ▼                                   │    │
│  │  ┌──────────────────────────────────────────────────────────┐   │    │
│  │  │ 2. audio_extractor.py (ffmpeg)                           │   │    │
│  │  │    └── extract_audio() → audio.wav (16kHz mono)          │   │    │
│  │  └──────────────────────────┬───────────────────────────────┘   │    │
│  │                             ▼                                   │    │
│  │  ┌──────────────────────────────────────────────────────────┐   │    │
│  │  │ 3. transcriber.py (faster-whisper)                       │   │    │
│  │  │    └── transcribe_audio() → texto + segments con timestamps│  │    │
│  │  └──────────────────────────┬───────────────────────────────┘   │    │
│  │                             ▼                                   │    │
│  │  ┌──────────────────────────────────────────────────────────┐   │    │
│  │  │ 4. visual_analyzer.py (Pillow + FFmpeg)                  │   │    │
│  │  │    └── analyze_video() → keyframes + OCR + instructivo   │   │    │
│  │  └──────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Flujo de Datos: Video Nuevo

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Usuario  │────▶│  Frontend │────▶│  Backend  │────▶│  Worker  │
│  pega URL │     │ (React)  │     │  (Rust)   │     │ (Python) │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │
     │ 1. add_job(url)│                │                │
     │───────────────▶│                │                │
     │                │ 2. invoke      │                │
     │                │───────────────▶│                │
     │                │                │ 3. Valida URL  │
     │                │                │ (HTTPS only)   │
     │                │                │                │
     │                │                │ 4. Crea job    │
     │                │                │ en SQLite      │
     │                │                │                │
     │                │                │ 5. dispatch    │
     │                │                │ _worker()      │
     │                │                │───────────────▶│
     │                │                │                │
     │                │                │    ┌───────────┤
     │                │                │    │ PIPELINE  │
     │                │                │    │           │
     │                │                │    │ 5a. Descarga│
     │                │                │    │ (yt-dlp)  │
     │                │                │    │           │
     │                │                │    │ 5b. Audio │
     │                │                │    │ (ffmpeg)  │
     │                │                │    │           │
     │                │                │    │ 5c. Transcripción│
     │                │                │    │ (whisper) │
     │                │                │    │           │
     │                │                │    │ 5d. Visual│
     │                │                │    │ (Pillow)  │
     │                │                │    └───────────┤
     │                │                │                │
     │                │   ◀────────────│ 6. Eventos JSON│
     │                │   job_progress │ por stdout     │
     │◀───────────────│   (Tauri Event)│                │
     │ 7. UI se       │                │                │
     │ actualiza      │                │                │
     │                │                │                │
     │                │                │ 7. Semantic    │
     │                │                │ Chunker        │
     │                │                │                │
     │                │                │ 8. ONNX        │
     │                │                │ Embeddings     │
     │                │                │                │
     │                │                │ 9. SQLite      │
     │                │                │ + HNSW Index   │
     │                │                │                │
     │                │                │ 10. media_     │
     │                │                │ indexed event  │
     │◀───────────────│───────────────│                │
     │ 11. Video      │                │                │
     │ aparece en     │                │                │
     │ VideoGrid      │                │                │
     └──────────┘     └──────────┘     └──────────┘     └──────────┘
```

---

## Flujo de Búsqueda Semántica

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Usuario  │────▶│  Frontend │────▶│  Backend  │────▶│  SQLite  │
│  escribe  │     │ (React)  │     │  (Rust)   │     │ + HNSW   │
│  query    │     │          │     │           │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │
     │ 1. search_     │                │                │
     │ transcripts    │                │                │
     │ (query, mode)  │                │                │
     │───────────────▶│                │                │
     │                │ 2. invoke      │                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │     ┌──────────┴──────────┐    │
     │                │     │ ¿Modo semántico?    │    │
     │                │     └──────────┬──────────┘    │
     │                │                │                │
     │                │     ┌──────────┴──────────┐    │
     │                │     │ SÍ:                 │    │
     │                │     │ 3. ONNX genera      │    │
     │                │     │ embedding de query   │    │
     │                │     │ (384d vector)        │    │
     │                │     └──────────┬──────────┘    │
     │                │                │                │
     │                │     ┌──────────┴──────────┐    │
     │                │     │ 4. Búsqueda cosine  │    │
     │                │     │ contra todos los    │───▶│
     │                │     │ vectores en SQLite  │    │
     │                │     └──────────┬──────────┘    │
     │                │                │                │
     │                │     ┌──────────┴──────────┐    │
     │                │     │ 5. Filtra por       │◀───│
     │                │     │ min_score (0.35)    │    │
     │                │     │ Top-K resultados    │    │
     │                │     └──────────┬──────────┘    │
     │                │                │                │
     │                │     ┌──────────┴──────────┐    │
     │                │     │ NO:                 │    │
     │                │     │ Búsqueda literal    │───▶│
     │                │     │ (LIKE en SQLite)    │    │
     │                │     └──────────┬──────────┘    │
     │                │                │                │
     │◀───────────────│ 6. Resultados  │                │
     │ Resultados con │ con scores     │                │
     │ video_id,      │                │                │
     │ matched_text,  │                │                │
     │ similarity     │                │                │
     └──────────┘     └──────────┘     └──────────┘     └──────────┘
```

---

## Base de Datos SQLite — Esquema

```
┌─────────────────────────────────────────────────────────────────┐
│                        library.db                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────┐                       │
│  │  jobs                                │                       │
│  │  ├── id (PK, autoincrement)         │                       │
│  │  ├── url (TEXT, NOT NULL)            │                       │
│  │  ├── status (queued/downloading/     │                       │
│  │  │   metadata/transcribing/indexing/ │                       │
│  │  │   processing/complete/error)      │                       │
│  │  ├── progress (0-100)                │                       │
│  │  ├── created_at (DATETIME)           │                       │
│  │  └── error_message (TEXT)            │                       │
│  └──────────────┬──────────────────────┘                       │
│                 │ 1:1                                           │
│  ┌──────────────▼──────────────────────┐                       │
│  │  media                               │                       │
│  │  ├── job_id (FK → jobs.id, UNIQUE)   │                       │
│  │  ├── title, author, thumbnail        │                       │
│  │  ├── duration, upload_date           │                       │
│  │  ├── video_path, audio_path          │                       │
│  │  ├── transcript_path                 │                       │
│  │  ├── keep_status (keep/online)       │                       │
│  │  ├── platform (tiktok/youtube/...)   │                       │
│  │  ├── visual_analysis (JSON)          │                       │
│  │  ├── instructional_guide (Markdown)  │                       │
│  │  └── julia_exported (BOOLEAN)        │                       │
│  └──────────────────────────────────────┘                       │
│                                                                 │
│  ┌──────────────────────────────────────┐                       │
│  │  transcript_embeddings                │                       │
│  │  ├── id (PK)                          │                       │
│  │  ├── job_id (FK → jobs.id)            │                       │
│  │  ├── chunk_index (INTEGER)            │                       │
│  │  ├── chunk_text (TEXT)                │                       │
│  │  └── embedding_vector (BLOB)          │                       │
│  │      └── 384 floats × 4 bytes = 1536B│                       │
│  └──────────────────────────────────────┘                       │
│                                                                 │
│  ┌──────────────────────────────────────┐                       │
│  │  transcript_segments                  │                       │
│  │  ├── id (PK)                          │                       │
│  │  ├── job_id (FK → jobs.id)            │                       │
│  │  ├── segment_index                    │                       │
│  │  ├── start_time (REAL, segundos)      │                       │
│  │  ├── end_time (REAL, segundos)        │                       │
│  │  └── text (TEXT)                      │                       │
│  └──────────────────────────────────────┘                       │
│                                                                 │
│  ┌──────────────────────────────────────┐                       │
│  │  playlists                            │                       │
│  │  ├── id (PK)                          │                       │
│  │  ├── name, description, color         │                       │
│  │  ├── auto_generated (BOOLEAN)         │                       │
│  │  ├── cover_job_id (FK → jobs.id)      │                       │
│  │  └── topic_keywords (JSON array)      │                       │
│  └──────────────┬───────────────────────┘                       │
│                 │ M:N                                           │
│  ┌──────────────▼───────────────────────┐                       │
│  │  playlist_items                        │                       │
│  │  ├── playlist_id (FK → playlists.id)  │                       │
│  │  ├── job_id (FK → jobs.id)            │                       │
│  │  └── added_at (DATETIME)              │                       │
│  └──────────────────────────────────────┘                       │
│                                                                 │
│  ┌──────────────────────────────────────┐                       │
│  │  collection_sources                   │                       │
│  │  ├── id (PK)                          │                       │
│  │  ├── source_url (TEXT, UNIQUE)        │                       │
│  │  ├── source_kind (tiktok)             │                       │
│  │  ├── enabled (BOOLEAN)                │                       │
│  │  └── last_synced_at (DATETIME)        │                       │
│  └──────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## API REST (Axum :8080)

```
┌─────────────────────────────────────────────────────────────────┐
│                    API Gateway (localhost:8080)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Salud                                                         │
│  ├── GET  /health                    → Estado de salud          │
│  └── GET  /api/v1/health             → Health (alias)           │
│                                                                 │
│  Jobs & Ingesta                                                │
│  ├── POST /api/v1/ingest             → Ingesta de video nuevo   │
│  ├── GET  /api/v1/jobs               → Lista todos los jobs     │
│  └── GET  /api/v1/jobs/:id/transcript → Transcripción de un job │
│                                                                 │
│  Playlists                                                     │
│  ├── GET  /api/v1/playlists               → Lista playlists     │
│  ├── POST /api/v1/playlists               → Crea playlist       │
│  ├── GET  /api/v1/playlists/:id/items     → Items de playlist   │
│  ├── POST /api/v1/playlists/:id/items     → Agrega item         │
│  ├── DELETE /api/v1/playlists/:id/items/:jid → Quita item       │
│  └── DELETE /api/v1/playlists/:id         → Borra playlist      │
│                                                                 │
│  Búsqueda                                                      │
│  ├── POST /api/v1/search             → Búsqueda semántica       │
│  └── POST /api/v1/search/literal     → Búsqueda literal (LIKE)  │
│                                                                 │
│  Transcripción                                                  │
│  └── POST /api/v1/transcribe         → Transcripción on-demand  │
│                                                                 │
│  Export Integration                                             │
│  ├── GET  /api/v1/julia/pending      → Jobs listos para exportar   │
│  └── POST /api/v1/julia/ack          → Marca job como exportado │
│                                                                 │
│  Autenticación: JWT + Rate Limiting (middleware)                │
│  CORS: permitido desde localhost:3000                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Observabilidad (Prometheus :9001)

```
┌─────────────────────────────────────────────────────────────────┐
│                 Metrics Server (localhost:9001)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Métricas expuestas:                                            │
│  ├── pulsar_query_latency_ms      (Histogram)                   │
│  ├── pulsar_onnx_latency_ms       (Histogram)                   │
│  ├── pulsar_db_latency_ms         (Histogram)                   │
│  ├── pulsar_jobs_total            (Counter)                     │
│  ├── pulsar_jobs_active           (Gauge)                       │
│  ├── pulsar_embeddings_total      (Gauge)                       │
│  └── pulsar_model_loaded          (Gauge)                       │
│                                                                 │
│  Scraped por: Prometheus → Grafana Dashboard                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Resumen de Stack

| Capa | Tecnologías | Puerto |
|---|---|---|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind v4, Motion, Three.js | 3000 (dev) |
| **Backend** | Rust, Tauri 2, Tokio, Axum | 8080 (API), 9001 (metrics) |
| **Motor Vectorial** | ONNX Runtime (MiniLM 384d), HNSW (4 shards) | — |
| **Persistencia** | SQLite (WAL mode), data/library.db | — |
| **Workers** | Python 3.10+, yt-dlp, ffmpeg, faster-whisper, Pillow | — |
| **Empaquetado** | Tauri NSIS Installer, Python embebido | — |
