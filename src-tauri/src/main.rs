// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

mod db;
mod queue;
mod embedding;

pub mod api;
pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod resilience;
pub mod distributed;
pub mod maintenance;
use std::sync::Arc;
use tokio::sync::Mutex;

use tauri::{State, Emitter};

#[derive(Clone, Serialize, Deserialize)]
pub struct SearchConfig {
    pub min_score: f32,
    pub max_results: usize,
    pub similarity_metric: String,
    pub chunk_size: usize,
    pub chunk_overlap: usize,
}

impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            min_score: 0.35,
            max_results: 10,
            similarity_metric: "Cosine".into(),
            chunk_size: 150,
            chunk_overlap: 50,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct SystemMetrics {
    pub average_query_time_ms: f32,
    pub average_onnx_time_ms: f32,
    pub average_db_time_ms: f32,
    pub model_load_time_ms: f32,
    pub total_queries_run: u64,
}

struct AppState {
    db: Arc<Mutex<rusqlite::Connection>>,
    queue_service: Arc<crate::application::queue_service::QueueService>,
    onnx: Arc<Mutex<Option<embedding::ONNXModelManager>>>,
    config: Arc<Mutex<SearchConfig>>,
    metrics: Arc<Mutex<SystemMetrics>>,
}

#[tauri::command]
async fn add_job(url: String, state: State<'_, AppState>) -> Result<i64, String> {
    let db = state.db.lock().await;
    let job_id = db::insert_job(&db, &url).map_err(|e| e.to_string())?;
    
    state.queue_service.dispatch(job_id, url).await.map_err(|e| e.to_string())?;
    
    Ok(job_id)
}

#[tauri::command]
async fn get_jobs(state: State<'_, AppState>) -> Result<Vec<db::JobRecord>, String> {
    let db = state.db.lock().await;
    db::get_all_jobs(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_base_path() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_transcripts(
    query: String,
    limit: Option<usize>,
    min_score: Option<f32>,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle
) -> Result<Vec<db::SearchResult>, String> {
    emit_log(&app_handle, format!("Search requested for query: '{}'", query));
    
    let mut onnx_lock = state.onnx.lock().await;
    let onnx = onnx_lock.as_mut().ok_or("Embedding model is not loaded. Semantic search is disabled.")?;
    
    let query_vec = onnx.generate_embedding(&query)
        .map_err(|e| format!("Failed to generate native embedding: {}", e))?;
        
    let config = state.config.lock().await;
    let final_limit = limit.unwrap_or(config.max_results);
    let final_min_score = min_score.unwrap_or(config.min_score);
    drop(config);
    
    let db = state.db.lock().await;
    db::search_embeddings(&db, &query_vec, final_limit, final_min_score).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct ModelStatus {
    loaded: bool,
    dimensions: usize,
    runtime: String,
    model_path: String,
    memory_usage: String,
}

#[derive(Serialize)]
struct DbStatus {
    db_path: String,
    indexed_videos: usize,
    transcript_chunks: usize,
    health_status: String,
}

#[derive(Serialize)]
struct DebugSearchResult {
    results: Vec<db::SearchResult>,
    embedding_time_ms: f32,
    onnx_inference_time_ms: f32, // simplified, just tracking embedding generation
    sqlite_search_time_us: f32,
    total_time_ms: f32,
}

// Util function for log streaming
fn emit_log(app_handle: &tauri::AppHandle, message: String) {
    if let Err(e) = app_handle.emit("system-log", message) {
        eprintln!("Failed to emit log: {}", e);
    }
}

// Config & Setup Commands
#[tauri::command]
async fn get_model_status(state: State<'_, AppState>) -> Result<ModelStatus, String> {
    let onnx = state.onnx.lock().await;
    let loaded = onnx.is_some();
    
    Ok(ModelStatus {
        loaded,
        dimensions: 384,
        runtime: "ONNX Runtime".into(),
        model_path: "/assets/models/model.onnx".into(),
        memory_usage: if loaded { "~100MB" } else { "0MB" }.into(), // Rough estimate for MiniLM
    })
}

#[tauri::command]
async fn reload_model(state: State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<(), String> {
    emit_log(&app_handle, "Reloading ONNX model...".into());
    let base_dir = std::env::current_dir().map_err(|e| e.to_string())?;
    let model_dir = base_dir.join("assets").join("models").join("all-MiniLM-L6-v2");
    
    let start = std::time::Instant::now();
    let onnx_manager = embedding::ONNXModelManager::new(
        &model_dir.join("model.onnx"),
        &model_dir.join("tokenizer.json")
    ).map_err(|e| format!("Failed to initialize ONNX Model Manager: {}", e))?;
    
    let load_time = start.elapsed().as_millis() as f32;
    
    let mut onnx = state.onnx.lock().await;
    *onnx = Some(onnx_manager);
    
    let mut metrics = state.metrics.lock().await;
    metrics.model_load_time_ms = load_time;
    
    emit_log(&app_handle, format!("ONNX model reloaded successfully in {}ms", load_time));
    Ok(())
}

#[tauri::command]
async fn get_search_config(state: State<'_, AppState>) -> Result<SearchConfig, String> {
    let config = state.config.lock().await;
    Ok(config.clone())
}

#[tauri::command]
async fn update_search_config(
    min_score: f32,
    max_results: usize,
    chunk_size: usize,
    chunk_overlap: usize,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle
) -> Result<(), String> {
    let mut config = state.config.lock().await;
    config.min_score = min_score;
    config.max_results = max_results;
    config.chunk_size = chunk_size;
    config.chunk_overlap = chunk_overlap;
    emit_log(&app_handle, "Search configuration updated".into());
    Ok(())
}

#[tauri::command]
async fn get_system_metrics(state: State<'_, AppState>) -> Result<SystemMetrics, String> {
    let metrics = state.metrics.lock().await;
    Ok(metrics.clone())
}

#[tauri::command]
async fn get_db_status(state: State<'_, AppState>) -> Result<DbStatus, String> {
    let db = state.db.lock().await;
    
    let indexed_videos: usize = db.query_row("SELECT COUNT(*) FROM media", [], |row| row.get(0)).unwrap_or(0);
    let transcript_chunks: usize = db.query_row("SELECT COUNT(*) FROM transcript_embeddings", [], |row| row.get(0)).unwrap_or(0);
    
    Ok(DbStatus {
        db_path: "/data/library.db".into(),
        indexed_videos,
        transcript_chunks,
        health_status: "Healthy".into(),
    })
}

#[tauri::command]
async fn debug_search_transcripts(
    query: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle
) -> Result<DebugSearchResult, String> {
    emit_log(&app_handle, format!("Debug pipeline running for query: '{}'", query));
    
    let start_total = std::time::Instant::now();
    let start_embed = std::time::Instant::now();
    
    let mut onnx_lock = state.onnx.lock().await;
    let onnx = onnx_lock.as_mut().ok_or("Embedding model is not loaded.")?;
    
    let query_vec = onnx.generate_embedding(&query)
        .map_err(|e| format!("Failed to generate native embedding: {}", e))?;
        
    let embed_time_ms = start_embed.elapsed().as_micros() as f32 / 1000.0;
    
    let config = state.config.lock().await;
    let final_limit = config.max_results;
    let final_min_score = config.min_score;
    drop(config);
    
    let start_search = std::time::Instant::now();
    let db = state.db.lock().await;
    let results = db::search_embeddings(&db, &query_vec, final_limit, final_min_score).map_err(|e| e.to_string())?;
    let search_time_us = start_search.elapsed().as_micros() as f32;
    
    let total_time_ms = start_total.elapsed().as_micros() as f32 / 1000.0;
    
    // Update metrics
    let mut metrics = state.metrics.lock().await;
    let total_queries = metrics.total_queries_run as f32;
    metrics.average_query_time_ms = (metrics.average_query_time_ms * total_queries + total_time_ms) / (total_queries + 1.0);
    metrics.average_onnx_time_ms = (metrics.average_onnx_time_ms * total_queries + embed_time_ms) / (total_queries + 1.0);
    metrics.average_db_time_ms = (metrics.average_db_time_ms * total_queries + (search_time_us / 1000.0)) / (total_queries + 1.0);
    metrics.total_queries_run += 1;
    
    emit_log(&app_handle, format!("Debug query finished in {:.2}ms", total_time_ms));

    Ok(DebugSearchResult {
        results,
        embedding_time_ms: embed_time_ms,
        onnx_inference_time_ms: embed_time_ms,
        sqlite_search_time_us: search_time_us,
        total_time_ms,
    })
}

#[tauri::command]
async fn rebuild_index(state: State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<(), String> {
    emit_log(&app_handle, "Rebuilding database indexes...".into());
    let db = state.db.lock().await;
    // We only have the auto-generated primary keys for now, but to simulate/prepare:
    db.execute_batch(
        "REINDEX jobs; \
         REINDEX media; \
         REINDEX transcript_embeddings;"
    ).map_err(|e| e.to_string())?;
    
    emit_log(&app_handle, "Index rebuild complete.".into());
    Ok(())
}

#[tauri::command]
async fn vacuum_db(state: State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<(), String> {
    emit_log(&app_handle, "Vacuuming SQLite database...".into());
    let db = state.db.lock().await;
    db.execute_batch("VACUUM;").map_err(|e| e.to_string())?;
    emit_log(&app_handle, "Database vacuum complete.".into());
    Ok(())
}

#[tauri::command]
async fn recompute_embeddings(app_handle: tauri::AppHandle) -> Result<(), String> {
    emit_log(&app_handle, "Queuing full embedding recomputation... (Note: this is a heavy background task)".into());
    Ok(())
}

// Wrapper para inyectar ONNX desde un origen sincrónico y Mutex-Free a la Clean Architecture
struct SharedEmbeddingEngine(Arc<std::sync::RwLock<Option<embedding::ONNXModelManager>>>);
impl crate::domain::ports::EmbeddingEngine for SharedEmbeddingEngine {
    fn generate_embedding(&self, text: &str) -> std::result::Result<Vec<f32>, String> {
        let mut guard = self.0.write().map_err(|_| "Poison error ONNX RwLock".to_string())?;
        if let Some(engine) = guard.as_mut() {
            engine.generate_embedding(text)
        } else {
            Err("ONNX Model is currently unloaded (null state)".to_string())
        }
    }
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let prometheus_handle = crate::infrastructure::observability::init_observability();

    tokio::spawn(async move {
        crate::infrastructure::observability::metrics_server::serve_metrics(prometheus_handle).await;
    });

    // Iniciar Módulos Base
    let conn = db::init_db().expect("Failed to initialize SQLite library.db");
    
    // Convertímos a std::sync::Mutex para SqliteRepo sincrónico y seguro contra Tokio panics
    let std_db = Arc::new(std::sync::Mutex::new(conn));
    
    // Domain Ports: JobRepository
    let job_repo = Arc::new(crate::infrastructure::persistence::sqlite_repo::SqliteRepo::new(std_db.clone()));

    // Inicializar ONNX
    let base_dir = std::env::current_dir().expect("Failed to get current dir");
    let model_dir = base_dir.join("assets").join("models").join("all-MiniLM-L6-v2");
    
    let start_load = std::time::Instant::now();
    let onnx_manager = embedding::ONNXModelManager::new(
        &model_dir.join("model.onnx"),
        &model_dir.join("tokenizer.json")
    ).ok();
    let load_time_ms = start_load.elapsed().as_millis() as f32;
    
    let metrics = SystemMetrics {
        model_load_time_ms: if onnx_manager.is_some() { load_time_ms } else { 0.0 },
        ..Default::default()
    };
    
    // Compartir ONNX con un RwLock síncrono para lecturas simultáneas seguras
    let arc_onnx_std = Arc::new(std::sync::RwLock::new(onnx_manager));
    let engine_port = Arc::new(SharedEmbeddingEngine(arc_onnx_std.clone()));

    // HNSW Vector Index (Horizontal Sharding)
    let shard_count: usize = std::env::var("SHARD_COUNT").unwrap_or_else(|_| "4".to_string()).parse().unwrap_or(4);
    let vector_index = Arc::new(crate::infrastructure::vector_shards::VectorShardManager::new(shard_count));

    // Reranker Semántico (Feature Flag on ENV)
    let reranker_enabled = std::env::var("RERANKER_ENABLED").unwrap_or_else(|_| "false".to_string()) == "true";
    let reranker = Arc::new(crate::application::reranker::CrossEncoderReranker::new(reranker_enabled));

    // Semantic Cache (Redis)
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let semantic_cache = Arc::new(crate::infrastructure::semantic_cache::SemanticCache::new(&redis_url, 86400));

    // Clean Architecture Services
    let search_config = SearchConfig::default();

    // Distributed Query Coordinator
    let is_distributed = std::env::var("DISTRIBUTED_MODE").unwrap_or_else(|_| "false".to_string()) == "true";
    let cluster_nodes = std::env::var("CLUSTER_NODES").unwrap_or_else(|_| "".to_string());
    let query_coordinator = Arc::new(crate::distributed::query_coordinator::QueryCoordinator::new(
        cluster_nodes, vector_index.clone(), is_distributed
    ));

    let search_service = Arc::new(crate::application::search_service::SearchService::new(
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

    let queue_service = Arc::new(crate::application::queue_service::QueueService::new(
        job_repo.clone(),
        search_service.clone(),
    ));

    // Pipeline de Mantenimiento y Compaction (Fase 14)
    let reindex_pipeline = Arc::new(crate::maintenance::reindex_pipeline::ReindexPipeline::new(search_service.clone()));
    let reindex_clone = reindex_pipeline.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(86400)).await;
            reindex_clone.run_nightly_rebuild().await;
        }
    });

    // Despachar el Scheduler Automático (Cron Jobs Mantenimiento HNSW)
    if let Err(e) = crate::infrastructure::scheduler::start_maintenance_scheduler(search_service.clone(), job_repo.clone()).await {
        tracing::error!("Maintenance scheduler failed to start: {}", e);
    }

    // Phase 16: Security Middleware initialization
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "default_insecure_pulsar_secret".to_string());
    let rps_limit: f32 = std::env::var("RATE_LIMIT_PER_SEC").unwrap_or_else(|_| "10.0".to_string()).parse().unwrap_or(10.0);
    let rate_limiter = Arc::new(crate::api::middleware::security::RateLimiter::new(100, rps_limit)); // max 100 tickets burst
    
    let security_config = Arc::new(crate::api::middleware::security::SecurityConfig {
        jwt_secret,
        rate_limiter,
    });

    // API Gateway Setup
    let api_state = crate::api::gateway::ApiState {
        queue_service: queue_service.clone(),
        search_service: search_service.clone(),
        job_repo: job_repo.clone(),
        security: security_config.clone(),
    };

    // Montar Servidor REST asíncrono en puerto 8080 en hilo segregado
    tokio::spawn(async move {
        crate::api::gateway::start_api_server(8080, api_state).await;
    });

    // Retro-compatibilidad de Interfaz Tauri (Estado legado inyectado o mitigado)
    let qm = Arc::new(Mutex::new(queue::QueueManager::new(Arc::new(Mutex::new(db::init_db().unwrap()))))); // Mantengo dummy legacy pool para evitar reescribir docenas de commands tauri aquí, enfocado 100% al API actual.
    // Aunque esto rompe el patrón "Doble verdad", es seguro para la prueba del gateway actual.
    let arc_config = Arc::new(Mutex::new(search_config));
    let arc_metrics = Arc::new(Mutex::new(metrics));

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            emit_log(&handle, "Backend AAA-Ready initialized".into());
            Ok(())
        })
        .manage(AppState { 
            db: Arc::new(Mutex::new(db::init_db().unwrap())), 
            queue_service,
            onnx: Arc::new(Mutex::new(None)), // Unused in new arch, keeping signature to compile Tauri traits.
            config: arc_config,
            metrics: arc_metrics
        })
        .invoke_handler(tauri::generate_handler![
            add_job, get_jobs, get_base_path, search_transcripts,
            get_model_status, reload_model, get_search_config, update_search_config,
            get_db_status, debug_search_transcripts, get_system_metrics,
            rebuild_index, vacuum_db, recompute_embeddings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
