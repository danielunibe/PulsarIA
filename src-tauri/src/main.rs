//! # Pulsaria — Motor Multimodal de Escritorio
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
mod runtime;
mod storage;
mod url_utils;

pub mod api;
pub mod application;
pub mod distributed;
pub mod domain;
pub mod infrastructure;
pub mod maintenance;
pub mod resilience;

use crate::api::gateway;
use crate::api::middleware::security;
use crate::application::queue_service;
use crate::application::reranker;
use crate::application::search_service;
use crate::commands::{SystemMetrics, WorkerConfig};
use crate::distributed::query_coordinator;
use crate::infrastructure::persistence::sqlite_repo;
use crate::infrastructure::scheduler;
use crate::infrastructure::semantic_cache;
use crate::infrastructure::vector_shards;
use crate::maintenance::reindex_pipeline;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tokio::sync::Mutex;

fn write_startup_log(data_dir: &std::path::Path, stage: &str, detail: &str) {
    use std::io::Write;

    let _ = std::fs::create_dir_all(data_dir);
    let path = data_dir.join("startup.log");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let timestamp = chrono::Utc::now().to_rfc3339();
        let _ = writeln!(file, "{timestamp} stage={stage} {detail}");
    }
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let initial_app_settings = commands::load_persisted_app_settings();
    commands::apply_app_settings_environment(&initial_app_settings);
    let processing_settings = commands::snapshot_processing_settings(&initial_app_settings);
    let prometheus_handle = crate::infrastructure::observability::init_observability();

    tokio::spawn(async move {
        crate::infrastructure::observability::metrics_server::serve_metrics(prometheus_handle)
            .await;
    });
    let data_dir = db::data_dir_path();
    std::env::set_var("PULSAR_DATA_DIR", &data_dir);
    write_startup_log(&data_dir, "bootstrap", "Pulsaria startup initiated");
    write_startup_log(&data_dir, "sqlite", "initializing library.db");
    let conn = match db::init_db() {
        Ok(connection) => {
            write_startup_log(&data_dir, "sqlite", "library.db initialized");
            connection
        }
        Err(error) => {
            let detail = format!("library.db initialization failed: {error}");
            write_startup_log(&data_dir, "sqlite_error", &detail);
            tracing::error!("{detail}");
            return;
        }
    };
    if let Err(error) = db::repair_library(&conn) {
        tracing::error!("Automatic library reconciliation failed: {}", error);
    }
    let media_root = if initial_app_settings.download_dir.trim().is_empty() {
        storage::default_media_root()
    } else {
        std::path::PathBuf::from(&initial_app_settings.download_dir)
    };
    if let Err(error) = db::reconcile_storage(&conn, &media_root) {
        tracing::error!("Automatic storage reconciliation failed: {}", error);
    }
    let model_dir = commands::resolve_model_dir();
    match db::get_embedding_index_status(&conn, &model_dir) {
        Ok(status) if status.stored_hash.is_none() => {
            if let Err(error) = db::record_embedding_model(&conn, &status.current_hash) {
                tracing::warn!("Could not record embedding model metadata: {}", error);
            }
        }
        Ok(status) if status.stale => {
            tracing::warn!(
                "Embedding index is stale for model {}. Recompute embeddings before semantic search.",
                status.model_id
            );
            let _ = db::insert_health_event(
                &conn,
                "embedding_index",
                "warning",
                "El modelo de embeddings cambió y el índice puede estar obsoleto",
                Some("recompute_embeddings"),
                Some("model_hash_mismatch"),
            );
        }
        Ok(_) => {}
        Err(error) => tracing::warn!("Could not inspect embedding model metadata: {}", error),
    }
    let std_db = Arc::new(std::sync::Mutex::new(conn));
    let preflight = commands::get_runtime_preflight();
    if !preflight.ready {
        if let Ok(connection) = std_db.lock() {
            if let Err(error) = db::insert_health_event(
                &connection,
                "runtime_preflight",
                "error",
                &preflight.message,
                Some("repair_runtime_bundle"),
                Some("missing_or_unusable_resource"),
            ) {
                tracing::error!("Could not persist runtime preflight failure: {}", error);
            }
        }
    }
    let job_repo = Arc::new(sqlite_repo::SqliteRepo::new(std_db.clone()));

    let start_load = std::time::Instant::now();
    let mut onnx_load_error = None;
    let onnx_manager = match embedding::ONNXModelManager::new(
        &model_dir.join("model.onnx"),
        &model_dir.join("tokenizer.json"),
    ) {
        Ok(manager) => Some(manager),
        Err(e) => {
            tracing::error!("ONNX model failed to load: {}", e);
            onnx_load_error = Some(format!(
                "ONNX model load failed: {}. Semantic search disabled.",
                e
            ));
            None
        }
    };
    let load_time_ms = start_load.elapsed().as_millis() as f32;

    let metrics = SystemMetrics {
        model_load_time_ms: if onnx_manager.is_some() {
            load_time_ms
        } else {
            0.0
        },
        ..Default::default()
    };

    let onnx_arc = Arc::new(Mutex::new(onnx_manager));
    let engine_port = Arc::new(commands::SharedEmbeddingEngine(onnx_arc.clone()));

    let shard_count: usize = std::env::var("SHARD_COUNT")
        .unwrap_or_else(|_| "4".to_string())
        .parse()
        .unwrap_or(4);
    let vector_index = Arc::new(vector_shards::VectorShardManager::new(shard_count));

    let reranker_enabled =
        std::env::var("RERANKER_ENABLED").unwrap_or_else(|_| "false".to_string()) == "true";
    let reranker = Arc::new(reranker::CrossEncoderReranker::new(reranker_enabled));

    let semantic_cache = Arc::new(semantic_cache::SemanticCache::default_for_desktop(86400));

    let search_config = commands::SearchConfig {
        min_score: initial_app_settings.min_score,
        max_results: initial_app_settings.max_results,
        similarity_metric: initial_app_settings.similarity_metric.clone(),
        chunk_size: initial_app_settings.chunk_size,
        chunk_overlap: initial_app_settings.chunk_overlap,
    };

    // The desktop MVP is always local-first. Remote scatter/gather is only
    // available to an explicitly feature-gated distributed build.
    let is_distributed = cfg!(feature = "distributed")
        && std::env::var("DISTRIBUTED_MODE").unwrap_or_else(|_| "false".to_string()) == "true";
    let cluster_nodes = if is_distributed {
        std::env::var("CLUSTER_NODES").unwrap_or_else(|_| "".to_string())
    } else {
        String::new()
    };
    let query_coordinator = Arc::new(query_coordinator::QueryCoordinator::new(
        cluster_nodes,
        vector_index.clone(),
        is_distributed,
        std_db.clone(),
    ));

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

    let maintenance_lock = Arc::new(tokio::sync::Mutex::new(()));
    let queue_service = Arc::new(queue_service::QueueService::new_with_maintenance_lock(
        job_repo.clone(),
        search_service.clone(),
        maintenance_lock,
    ));
    match queue_service.resume_pending_jobs().await {
        Ok(resumed) if resumed > 0 => {
            tracing::info!(
                "Reanudados {} trabajos pendientes al iniciar Pulsaria",
                resumed
            );
        }
        Ok(_) => {}
        Err(error) => {
            tracing::error!("No se pudieron reanudar los trabajos pendientes: {}", error);
        }
    }
    let reindex_pipeline = Arc::new(reindex_pipeline::ReindexPipeline::new(
        search_service.clone(),
        queue_service.clone(),
    ));
    let reindex_clone = reindex_pipeline.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(86400)).await;
            reindex_clone.run_nightly_rebuild().await;
        }
    });

    if let Err(e) = scheduler::start_maintenance_scheduler(
        search_service.clone(),
        job_repo.clone(),
        queue_service.clone(),
    )
    .await
    {
        tracing::error!("Maintenance scheduler failed to start: {}", e);
    }

    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| {
        // The loopback API still needs an unpredictable per-session secret
        // when a deployment does not provide one explicitly. A timestamp/PID
        // hash is observable and too easy to reproduce.
        let mut bytes = [0u8; 32];
        rand::fill(&mut bytes);
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    });
    let rps_limit: f32 = std::env::var("RATE_LIMIT_PER_SEC")
        .unwrap_or_else(|_| "10.0".to_string())
        .parse()
        .unwrap_or(10.0);
    let rate_limiter = Arc::new(security::RateLimiter::new(100, rps_limit));

    let security_config = Arc::new(security::SecurityConfig {
        jwt_secret,
        rate_limiter,
    });
    let api_session_token = security::create_session_token(&security_config.jwt_secret)
        .expect("API session token must be issuable from the generated process secret");
    let api_runtime = api::ApiRuntimeState::default();

    let api_state = gateway::ApiState {
        queue_service: queue_service.clone(),
        search_service: search_service.clone(),
        job_repo: job_repo.clone(),
        security: security_config.clone(),
        runtime: api_runtime.clone(),
    };

    tokio::spawn(async move {
        let api_port: u16 = std::env::var("PULSAR_API_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8080);
        gateway::start_api_server(api_port, api_state).await;
    });

    let arc_config = Arc::new(Mutex::new(search_config));
    let arc_metrics = Arc::new(Mutex::new(metrics));
    let local_llm = Arc::new(
        infrastructure::local_llm::LocalLlmManager::new()
            .expect("local LLM manifest must be valid"),
    );

    let collection_db = std_db.clone();
    let collection_queue = queue_service.clone();
    let startup_app_settings = initial_app_settings.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let show_item = MenuItem::with_id(app, "show", "Abrir Pulsaria", true, None::<&str>)?;
            let quit_item =
                MenuItem::with_id(app, "quit", "Salir de Pulsaria", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("Pulsaria icon is required"),
                )
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            if startup_app_settings.autostart_enabled {
                if let Err(error) = app.autolaunch().enable() {
                    tracing::warn!("Could not enable Windows autostart: {}", error);
                }
            } else if let Err(error) = app.autolaunch().disable() {
                tracing::warn!("Could not disable Windows autostart: {}", error);
            }
            if std::env::args().any(|argument| argument == "--background") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            let handle = app.handle().clone();
            if let Some(ref err) = onnx_load_error {
                commands::emit_log(&handle, err.clone());
            }
            let sync_db = collection_db.clone();
            let sync_queue = collection_queue.clone();
            let sync_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                // Espera inicial para que el backend est� completamente listo
                tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;
                crate::application::collection_service::start_collection_sync_loop(
                    sync_db,
                    sync_queue,
                    sync_handle,
                )
                .await;
            });
            commands::emit_log(
                &handle,
                "Backend initialized; REST gateway status is reported in Salud".into(),
            );
            Ok(())
        })
        .manage(commands::AppState {
            db: std_db.clone(),
            queue: queue_service.clone(),
            api_runtime: api_runtime.clone(),
            api_session_token,
            onnx: onnx_arc,
            search: search_service.clone(),
            config: arc_config,
            metrics: arc_metrics,
            app_settings: Arc::new(tokio::sync::RwLock::new(initial_app_settings.clone())),
            worker_config: Arc::new(tokio::sync::RwLock::new(WorkerConfig {
                download_dir: std::env::var("PULSAR_DOWNLOAD_DIR").unwrap_or_default(),
                cookies_browser: std::env::var("PULSAR_COOKIES_FROM_BROWSER").unwrap_or_default(),
                retention: std::env::var("PULSAR_DEFAULT_RETENTION")
                    .unwrap_or_else(|_| "keep".to_string()),
                formats: std::env::var("PULSAR_FORMATS")
                    .ok()
                    .and_then(|f| serde_json::from_str(&f).ok())
                    .unwrap_or_else(|| vec!["mp4".into(), "mp3".into(), "txt".into()]),
                processing: processing_settings.clone(),
                intent: std::env::var("PULSAR_SETUP_INTENT")
                    .unwrap_or_else(|_| "balanced".to_string()),
                quota_bytes: crate::storage::configured_quota_bytes(),
                reserve_bytes: crate::storage::configured_reserve_bytes().unwrap_or_default(),
            })),
            model_prepare_pid: Arc::new(Mutex::new(None)),
            local_llm,
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let local_llm = window
                    .app_handle()
                    .state::<commands::AppState>()
                    .local_llm
                    .clone();
                tauri::async_runtime::spawn(async move {
                    local_llm.shutdown().await;
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_job,
            commands::get_jobs,
            commands::retry_job,
            commands::get_collection_sources,
            commands::set_collection_source_active,
            commands::delete_collection_source,
            commands::sync_collection_source_now,
            commands::get_health_events,
            commands::get_api_session_token,
            commands::get_runtime_health,
            commands::get_legal_consent,
            commands::save_legal_consent,
            commands::get_app_settings,
            commands::save_app_settings,
            commands::get_autostart_status,
            commands::set_autostart,
            commands::repair_library,
            commands::reconcile_storage,
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
            commands::get_hardware_profile,
            commands::get_runtime_preflight,
            commands::get_embedding_index_status,
            commands::get_storage_status,
            commands::recommend_storage_setup,
            commands::preview_media_purge,
            commands::apply_media_purge,
            commands::undo_media_purge,
            commands::empty_media_trash,
            commands::set_media_protection,
            commands::record_media_access,
            commands::get_job_artifacts,
            commands::get_generated_outputs,
            commands::save_video_frame,
            commands::get_processing_settings,
            commands::set_processing_settings,
            commands::save_mvp_settings,
            commands::get_whisper_model_status,
            commands::prepare_whisper_model,
            commands::cancel_whisper_model_preparation,
            commands::rebuild_index,
            commands::reindex_sqlite_indexes,
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
            commands::replace_ai_playlists,
            commands::set_video_keep_status,
            commands::export_semantic,
            commands::import_semantic,
            commands::set_download_dir,
            commands::get_download_dir,
            commands::set_cookie_browser,
            commands::set_default_retention,
            commands::set_formats,
            commands::get_formats,
            commands::export_library_json,
            commands::get_local_llm_status,
            commands::ensure_local_llm,
            commands::cancel_local_llm_download,
            commands::generate_local_response,
            commands::generate_gemini_response
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
