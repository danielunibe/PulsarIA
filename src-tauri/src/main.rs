//! # Pulsar Eventide — Motor Multimodal de Escritorio
//!
//! Aplicación de escritorio (Rust + Tauri 2 + Next.js 15) que descarga,
//! transcribe, indexa semánticamente y consulta videos cortos.
//!
//! ## Arquitectura
//!
//! \```text
//! ┌──────────────────────────────────────────────────────────┐
//! │  Frontend (Next.js 15 / React 19)                       │
//! │  └─ Tauri IPC (invoke) + Event Emitter                   │
//! └──────────────────────┬───────────────────────────────────┘
//! │
//! ┌──────────────────────┴───────────────────────────────────┐
//! │  Tauri 2 / Rust Core (este módulo)                       │
//! │  ├─ AppState (db, queue, onnx, search, config, metrics)  │
//! │  ├─ QueueManager → Python workers (subprocesos aislados) │
//! │  ├─ ONNXModelManager (all-MiniLM-L6-v2, 384d)           │
//! │  ├─ SearchService (HNSW + BM25 + Reranker)               │
//! │  └─ Axum API Gateway (:8080) + Metrics (:9001)           │
//! └──────────────────────────────────────────────────────────┘
//! ```
//!
//! ## Comandos Tauri IPC
//!
//! El frontend invoca comandos Rust a través de `tauri::invoke`. Los más
//! importantes son: `add_job`, `get_jobs`, `search_transcripts`,
//! `get_model_status`, `get_db_status`.
//!
//! ## Seguridad
//!
//! - Solo se aceptan URLs HTTPS válidas (`is_valid_sandbox_url`)
//! - Los workers Python se ejecutan como subprocesos aislados
//! - La base de datos se accede exclusivamente a través de mutex
//! - Rate limiting configurable por RPS en la API REST

// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod embedding;
mod queue;
mod url_utils;

pub mod api;
pub mod application;
pub mod distributed;
pub mod domain;
pub mod infrastructure;
pub mod maintenance;
pub mod resilience;

use std::sync::{Arc, Mutex as StdMutex};
use std::path::PathBuf;
use tokio::sync::Mutex;
use tauri::Builder;
use crate::commands::{AppState, WorkerConfig, SearchConfig, SystemMetrics};
use crate::api::gateway;
use crate::infrastructure::persistence::sqlite_repo;
use crate::infrastructure::vector_shards;
use crate::application::search_service;
use crate::application::queue_service;
use crate::application::reranker;
use crate::infrastructure::semantic_cache;
use crate::distributed::query_coordinator;
use crate::maintenance::reindex_pipeline;
use crate::infrastructure::scheduler;
use crate::api::middleware::security;


#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    commands::load_persisted_download_dir();
    commands::load_persisted_cookie_browser();
    commands::load_persisted_retention();
    let prometheus_handle = crate::infrastructure::observability::init_observability();

    tokio::spawn(async move {
        crate::infrastructure::observability::metrics_server::serve_metrics(prometheus_handle)
            .await;
    });

    let conn = db::init_db().expect("Failed to initialize SQLite library.db");
    let std_db = Arc::new(std::sync::Mutex::new(conn));
    let job_repo =
        Arc::new(sqlite_repo::SqliteRepo::new(std_db.clone()));

    let base_dir = std::env::current_dir().expect("Failed to get current dir");
    let model_candidates = [
        base_dir.join("assets").join("models").join("all-MiniLM-L6-v2"),
        base_dir.join("src-tauri").join("assets").join("models").join("all-MiniLM-L6-v2"),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            .unwrap_or_else(|| base_dir.clone())
            .join("resources").join("assets").join("models").join("all-MiniLM-L6-v2"),
    ];
    let model_dir = model_candidates
        .iter()
        .find(|c| c.join("model.onnx").exists() && c.join("tokenizer.json").exists())
        .cloned()
        .unwrap_or_else(|| model_candidates[0].clone());

    let start_load = std::time::Instant::now();
    let onnx_manager = embedding::ONNXModelManager::new(
        &model_dir.join("model.onnx"),
        &model_dir.join("tokenizer.json"),
    ).ok();
    let load_time_ms = start_load.elapsed().as_millis() as f32;

    let metrics = SystemMetrics {
        model_load_time_ms: if onnx_manager.is_some() { load_time_ms } else { 0.0 },
        ..Default::default()
    };

    let onnx_arc = Arc::new(Mutex::new(onnx_manager));
    let engine_port = Arc::new(commands::SharedEmbeddingEngine(onnx_arc.clone()));

    let shard_count: usize = std::env::var("SHARD_COUNT")
        .unwrap_or_else(|_| "4".to_string())
        .parse()
        .unwrap_or(4);
    let vector_index =
        Arc::new(vector_shards::VectorShardManager::new(shard_count));

    let reranker_enabled =
        std::env::var("RERANKER_ENABLED").unwrap_or_else(|_| "false".to_string()) == "true";
    let reranker = Arc::new(reranker::CrossEncoderReranker::new(reranker_enabled));

    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let semantic_cache = Arc::new(semantic_cache::SemanticCache::new(&redis_url, 86400));

    let search_config = commands::load_persisted_search_config();

    let is_distributed =
        std::env::var("DISTRIBUTED_MODE").unwrap_or_else(|_| "false".to_string()) == "true";
    let cluster_nodes = std::env::var("CLUSTER_NODES").unwrap_or_else(|_| "".to_string());
    let query_coordinator = Arc::new(
        query_coordinator::QueryCoordinator::new(cluster_nodes, vector_index.clone(), is_distributed, std_db.clone()),
    );

    let search_service = Arc::new(search_service::SearchService::new(
        crate::domain::models::SearchConfig {
            min_score: search_config.min_score,
            max_results: search_config.max_results,
            similarity_metric: search_config.similarity_metric.clone(),
            chunk_size: search_config.chunk_size,
            chunk_overlap: search_config.chunk_overlap,
        },
        engine_port.clone(),
        query_coordinator.clone(),
        reranker.clone(),
        semantic_cache.clone(),
    ));

    let queue_service = Arc::new(queue_service::QueueService::new(job_repo.clone(), search_service.clone()));
    let reindex_pipeline = Arc::new(reindex_pipeline::ReindexPipeline::new(search_service.clone()));
    let reindex_clone = reindex_pipeline.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(86400)).await;
            reindex_clone.run_nightly_rebuild().await;
        }
    });

    if let Err(e) = scheduler::start_maintenance_scheduler(search_service.clone(), job_repo.clone()).await {
        tracing::error!("Maintenance scheduler failed to start: {}", e);
    }

    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "default_insecure_pulsar_secret".to_string());
    let rps_limit: f32 = std::env::var("RATE_LIMIT_PER_SEC")
        .unwrap_or_else(|_| "10.0".to_string())
        .parse()
        .unwrap_or(10.0);
    let rate_limiter = Arc::new(security::RateLimiter::new(100, rps_limit));

    let security_config = Arc::new(security::SecurityConfig { jwt_secret, rate_limiter });

    let api_state = gateway::ApiState {
        queue_service: queue_service.clone(),
        search_service: search_service.clone(),
        job_repo: job_repo.clone(),
        security: security_config.clone(),
    };

    tokio::spawn(async move {
        let api_port: u16 = std::env::var("PULSAR_API_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8080);
        gateway::start_api_server(api_port, api_state).await;
    });

    let qm = Arc::new(Mutex::new(queue::QueueManager::with_onnx(std_db.clone(), onnx_arc.clone(), search_service.clone())));

    let arc_config = Arc::new(Mutex::new(search_config));
    let arc_metrics = Arc::new(Mutex::new(metrics));

    let collection_db = std_db.clone();
    let collection_queue = qm.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let handle = app.handle().clone();
            let sync_db = collection_db.clone();
            let sync_queue = collection_queue.clone();
            let sync_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;
                commands::collection_sync_loop(sync_db, sync_queue, sync_handle).await;
            });
            commands::emit_log(&handle, "Backend AAA-Ready initialized".into());
            Ok(())
        })
        .manage(commands::AppState {
            db: std_db.clone(),
            queue: qm,
            onnx: onnx_arc,
            search: search_service.clone(),
            config: arc_config,
            metrics: arc_metrics,
            worker_config: Arc::new(tokio::sync::RwLock::new(WorkerConfig {
                download_dir: std::env::var("PULSAR_DOWNLOAD_DIR").unwrap_or_default(),
                cookies_browser: std::env::var("PULSAR_COOKIES_FROM_BROWSER").unwrap_or_default(),
                retention: std::env::var("PULSAR_DEFAULT_RETENTION").unwrap_or_else(|_| "keep".to_string()),
                formats: std::env::var("PULSAR_FORMATS")
                    .ok()
                    .and_then(|f| serde_json::from_str(&f).ok())
                    .unwrap_or_else(|| vec!["mp4".into(), "mp3".into(), "txt".into()]),
            })),
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_job,
            commands::get_jobs,
            commands::get_base_path,
            commands::search_literal_transcripts,
            commands::search_transcripts,
            commands::get_model_status,
            commands::reload_model,
            commands::get_search_config,
            commands::update_search_config,
            commands::get_db_status,
            commands::debug_search_transcripts,
            commands::get_system_metrics,
            commands::rebuild_index,
            commands::vacuum_db,
            commands::recompute_embeddings,
            commands::get_playlists,
            commands::create_playlist,
            commands::add_to_playlist,
            commands::remove_from_playlist,
            commands::get_playlist_items,
            commands::delete_playlist,
            commands::get_transcript,
            commands::auto_cluster_videos,
            commands::set_video_keep_status,
            commands::export_semantic,
            commands::import_semantic,
            commands::set_download_dir,
            commands::get_download_dir,
            commands::set_formats,
            commands::get_formats,
            commands::export_library_json
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
