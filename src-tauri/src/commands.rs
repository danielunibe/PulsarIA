//! Tauri IPC Commands
//!
//! All #[tauri::command] handlers extracted from main.rs to reduce
//! the composition root to pure bootstrap logic.


use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex as StdMutex, LazyLock};
use tokio::sync::Mutex;
use tokio::time::Duration;
use rusqlite::params;
use tauri::{Emitter, State};
use serde::{Deserialize, Serialize};
use serde_json;
use crate::url_utils::is_collection_source;
use crate::api::middleware::security::is_valid_sandbox_url;
use crate::application::semantic_chunker::SemanticChunker;
use crate::db;
use crate::embedding;
use crate::queue;
use crate::domain::ports::EmbeddingEngine;

/// Bug #33 FIX: Maximum concurrent workers spawned by collection expansion.
const MAX_COLLECTION_WORKERS: usize = 8;
static COLLECTION_SEMAPHORE: LazyLock<tokio::sync::Semaphore> =
    LazyLock::new(|| tokio::sync::Semaphore::new(MAX_COLLECTION_WORKERS));

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkerConfig {
    pub download_dir: String,
    pub formats: Vec<String>,
    pub cookies_browser: String,
    pub retention: String,
}

impl Default for WorkerConfig {
    fn default() -> Self {
        Self {
            download_dir: String::new(),
            formats: vec!["mp4".into(), "mp3".into(), "txt".into()],
            cookies_browser: String::new(),
            retention: "keep".into(),
        }
    }
}
/// Estado compartido de la aplicación Tauri.
///
/// Se gestiona como 	auri::State<AppState> y se pasa a todos los
/// comandos Tauri. Contiene:
/// - db — Conexión SQLite (std::sync::Mutex para compatibilidad sync)
/// - queue — Gestor de cola async (tokio::sync::Mutex)
/// - onnx — Modelo ONNX de embeddings (opcional, puede no estar cargado)
/// - search — Servicio de búsqueda híbrida (HNSW + BM25 + Cache)
/// - config — Configuración de búsqueda (min_score, max_results, etc.)
/// - metrics — Métricas de rendimiento (latencias, conteo de queries)
/// - worker_config — Configuración de workers (formats, retention, etc.)
pub struct AppState {
    pub db: Arc<StdMutex<rusqlite::Connection>>,

    pub queue: Arc<Mutex<queue::QueueManager>>,
    pub onnx: Arc<Mutex<Option<embedding::ONNXModelManager>>>,
    pub search: Arc<crate::application::search_service::SearchService>,
    pub config: Arc<Mutex<SearchConfig>>,
    pub metrics: Arc<Mutex<SystemMetrics>>,
    pub worker_config: Arc<tokio::sync::RwLock<WorkerConfig>>,
}

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

#[derive(Clone, Serialize, Deserialize)]
pub struct TranscriptChunk {
    pub chunk_index: i64,
    pub chunk_text: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Serialize)]
pub struct ModelStatus {
    loaded: bool,
    dimensions: usize,
    runtime: String,
    model_path: String,
    memory_usage: String,
}

#[derive(Serialize)]
pub struct DbStatus {
    db_path: String,
    indexed_videos: usize,
    transcript_chunks: usize,
    health_status: String,
}

#[derive(Serialize)]
pub struct DebugSearchResult {
    results: Vec<db::SearchResult>,
    embedding_time_ms: f32,
    onnx_inference_time_ms: f32,
    sqlite_search_time_us: f32,
    total_time_ms: f32,
}

pub fn emit_log(app_handle: &tauri::AppHandle, message: String) {
    if let Err(e) = app_handle.emit("system-log", message) {
        eprintln!("Failed to emit log: {}", e);
    }
}

fn processing_root() -> PathBuf {
    std::env::var_os("PULSAR_DOWNLOAD_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(crate::db::data_dir_path)
        .join("processing")
}

async fn sync_collection_sources(
    _db: Arc<StdMutex<rusqlite::Connection>>,
    _queue: Arc<Mutex<queue::QueueManager>>,
    _app_handle: tauri::AppHandle,
) {
}

pub async fn collection_sync_loop(
    db: Arc<StdMutex<rusqlite::Connection>>,
    queue: Arc<Mutex<queue::QueueManager>>,
    app_handle: tauri::AppHandle,
) {
    loop {
        sync_collection_sources(db.clone(), queue.clone(), app_handle.clone()).await;
        tokio::time::sleep(tokio::time::Duration::from_secs(15 * 60)).await;
    }
}

pub fn load_persisted_download_dir() {
    if std::env::var_os("PULSAR_DOWNLOAD_DIR").is_some() {
        return;
    }
    let settings_path = settings_data_dir().join("download_dir.txt");
    if let Ok(path) = fs::read_to_string(settings_path) {
        let path = path.trim();
        if !path.is_empty() && PathBuf::from(path).is_dir() {
            std::env::set_var("PULSAR_DOWNLOAD_DIR", path);
            return;
        }
    }
    let default_dir = default_download_dir();
    if fs::create_dir_all(&default_dir).is_ok() {
        std::env::set_var("PULSAR_DOWNLOAD_DIR", default_dir);
    }
}

pub fn load_persisted_cookie_browser() {
    if std::env::var_os("PULSAR_COOKIES_FROM_BROWSER").is_some() {
        return;
    }
    let settings_path = settings_data_dir().join("cookie_browser.txt");
    if let Ok(browser) = fs::read_to_string(settings_path) {
        let browser = browser.trim();
        if matches!(browser, "chrome" | "edge" | "firefox") {
            std::env::set_var("PULSAR_COOKIES_FROM_BROWSER", browser);
        }
    }
}

pub fn load_persisted_retention() {
    if std::env::var_os("PULSAR_DEFAULT_RETENTION").is_some() {
        return;
    }
    let settings_path = settings_data_dir().join("retention.txt");
    if let Ok(policy) = fs::read_to_string(settings_path) {
        let policy = policy.trim();
        if matches!(policy, "keep" | "online") {
            std::env::set_var("PULSAR_DEFAULT_RETENTION", policy);
        }
    }
}

pub fn load_persisted_search_config() -> SearchConfig {
    let path = settings_data_dir().join("search_config.json");
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<SearchConfig>(&contents).ok())
        .filter(|config| {
            (0.0..=1.0).contains(&config.min_score)
                && config.max_results > 0
                && config.chunk_size > 0
                && config.chunk_overlap < config.chunk_size
        })
        .unwrap_or_default()
}

fn settings_data_dir() -> PathBuf {
    db::data_dir_path()
}

fn default_download_dir() -> PathBuf {
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        return PathBuf::from(profile).join("Downloads");
    }
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home).join("Downloads");
    }
    PathBuf::from("downloads")
}

fn format_timestamp(seconds: f64) -> String {
    let mins = (seconds / 60.0).floor() as i32;
    let secs = (seconds % 60.0).floor() as i32;
    let millis = ((seconds % 1.0) * 1000.0).round() as i32;
    format!("{:02}:{:02}.{:03}", mins, secs, millis)
}

fn unib_header_value(content: &str, key: &str) -> Option<String> {
    let prefix = format!("@{}:", key);
    content.lines().find_map(|line| {
        line.trim()
            .strip_prefix(&prefix)
            .map(|value| value.trim().to_string())
    })
}

fn parse_unib_time(value: &str) -> Option<f64> {
    let mut parts = value.trim().split(':');
    let minutes = parts.next()?.parse::<f64>().ok()?;
    let seconds = parts.next()?.parse::<f64>().ok()?;
    if parts.next().is_some() || minutes < 0.0 || seconds < 0.0 || seconds >= 60.0 {
        return None;
    }
    Some(minutes * 60.0 + seconds)
}

fn parse_unib_segments(content: &str) -> Vec<(i64, f64, f64, String)> {
    content
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let rest = line.strip_prefix('[')?;
            let (range, text) = rest.split_once("] ")?;
            let (start, end) = range.split_once(" -> ")?;
            let start = parse_unib_time(start)?;
            let end = parse_unib_time(end)?;
            let text = text.trim();
            if text.is_empty() || end < start {
                return None;
            }
            Some((0, start, end, text.to_string()))
        })
        .enumerate()
        .map(|(index, (_, start, end, text))| (index as i64, start, end, text))
        .collect()
}

pub struct SharedEmbeddingEngine(pub Arc<tokio::sync::Mutex<Option<embedding::ONNXModelManager>>>);

impl crate::domain::ports::EmbeddingEngine for SharedEmbeddingEngine {
    fn generate_embedding(&self, text: &str) -> std::result::Result<Vec<f32>, String> {
        tokio::task::block_in_place(|| {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(async {
                let mut guard = self.0.lock().await;
                if let Some(engine) = guard.as_mut() {
                    engine.generate_embedding(text)
                } else {
                    Err("ONNX Model is currently unloaded (null state)".to_string())
                }
            })
        })
    }
}

#[tauri::command]
pub async fn add_job(
    url: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<i64, String> {
    if !is_valid_sandbox_url(&url) {
        return Err("Only supported HTTPS media URLs are accepted".to_string());
    }

    if is_collection_source(&url) {
        {
            let db = state
                .db
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            db::register_collection_source(&db, &url).map_err(|e| e.to_string())?;
        }

        let collection_urls = {
            let queue = state.queue.lock().await;
            queue.expand_collection(&url).await?
        };
        if collection_urls.is_empty() {
            return Err("No public videos were found in the TikTok collection".to_string());
        }

        let mut first_job_id = None;
        for video_url in collection_urls.into_iter().take(200) {
            let new_job_id = {
                let db = state
                    .db
                    .lock()
                    .map_err(|_| "Database mutex poisoned".to_string())?;
                match db::find_job_id_by_url(&db, &video_url).map_err(|e| e.to_string())? {
                    Some(existing_id) => {
                        first_job_id.get_or_insert(existing_id);
                        None
                    }
                    None => Some(db::insert_job(&db, &video_url).map_err(|e| e.to_string())?),
                }
            };

            if let Some(job_id) = new_job_id {
                first_job_id.get_or_insert(job_id);
                let _permit = COLLECTION_SEMAPHORE
                    .acquire()
                    .await
                    .map_err(|_| "Collection semaphore closed".to_string())?;
                let cfg = state.worker_config.read().await.clone();
                let queue = state.queue.lock().await;
                queue
                    .dispatch_worker_with_config(job_id, video_url, app_handle.clone(), Some(cfg))
                    .await;
            }
        }

        return first_job_id.ok_or_else(|| "Collection did not yield any jobs".to_string());
    }

    let job_id = {
        let db = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        if let Some(existing_id) = db::find_job_id_by_url(&db, &url).map_err(|e| e.to_string())? {
            return Ok(existing_id);
        }
        db::insert_job(&db, &url).map_err(|e| e.to_string())?
    };

    let cfg = state.worker_config.read().await.clone();
    let queue = state.queue.lock().await;
    queue.dispatch_worker_with_config(job_id, url, app_handle.clone(), Some(cfg)).await;

    Ok(job_id)
}

#[tauri::command]
pub async fn get_jobs(state: State<'_, AppState>) -> Result<Vec<db::JobRecord>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_all_jobs(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_base_path() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_literal_transcripts(
    query: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<db::SearchResult>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::search_literal_transcripts(&db, &query, limit.unwrap_or(10)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_transcripts(
    query: String,
    limit: Option<usize>,
    min_score: Option<f32>,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<db::SearchResult>, String> {
    emit_log(
        &app_handle,
        format!("Search requested for query: '{}'", query),
    );

    let mut onnx_lock = state.onnx.lock().await;
    let onnx = onnx_lock
        .as_mut()
        .ok_or("Embedding model is not loaded. Semantic search is disabled.")?;

    let query_vec = onnx
        .generate_embedding(&query)
        .map_err(|e| format!("Failed to generate native embedding: {}", e))?;

    let config = state.config.lock().await;
    let final_limit = limit.unwrap_or(config.max_results);
    let final_min_score = min_score.unwrap_or(config.min_score);
    drop(config);

    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::search_embeddings(&db, &query_vec, final_limit, final_min_score).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_model_status(state: State<'_, AppState>) -> Result<ModelStatus, String> {
    let onnx = state.onnx.lock().await;
    let loaded = onnx.is_some();

    let model_candidates = [
        PathBuf::from("assets/models/all-MiniLM-L6-v2"),
        PathBuf::from("src-tauri/assets/models/all-MiniLM-L6-v2"),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            .unwrap_or_default()
            .join("resources/assets/models/all-MiniLM-L6-v2"),
    ];
    let model_path = model_candidates
        .iter()
        .find(|c| c.join("model.onnx").exists())
        .map(|c| c.join("model.onnx").to_string_lossy().to_string())
        .unwrap_or_else(|| "model.onnx not found".to_string());

    Ok(ModelStatus {
        loaded,
        dimensions: if loaded { 384 } else { 0 },
        runtime: if loaded { "ONNX Runtime (all-MiniLM-L6-v2)".into() } else { "Not loaded".into() },
        model_path,
        memory_usage: if loaded { "~100MB".into() } else { "0MB".into() },
    })
}

#[tauri::command]
pub async fn reload_model(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    emit_log(&app_handle, "Reloading ONNX model...".into());
    let base_dir = std::env::current_dir().map_err(|e| e.to_string())?;

    let model_dir = base_dir
        .join("assets")
        .join("models")
        .join("all-MiniLM-L6-v2");

    let start = std::time::Instant::now();
    let onnx_manager = embedding::ONNXModelManager::new(
        &model_dir.join("model.onnx"),
        &model_dir.join("tokenizer.json"),
    )
    .map_err(|e| format!("Failed to initialize ONNX Model Manager: {}", e))?;

    let load_time = start.elapsed().as_millis() as f32;

    let mut onnx = state.onnx.lock().await;
    *onnx = Some(onnx_manager);

    let mut metrics = state.metrics.lock().await;
    metrics.model_load_time_ms = load_time;

    emit_log(
        &app_handle,
        format!("ONNX model reloaded successfully in {}ms", load_time),
    );
    Ok(())
}

#[tauri::command]
pub async fn get_search_config(state: State<'_, AppState>) -> Result<SearchConfig, String> {
    let config = state.config.lock().await;
    Ok(config.clone())
}

#[tauri::command]
pub async fn update_search_config(
    min_score: f32,
    max_results: usize,
    chunk_size: usize,
    chunk_overlap: usize,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    if !(0.0..=1.0).contains(&min_score)
        || max_results == 0
        || chunk_size == 0
        || chunk_overlap >= chunk_size
    {
        return Err("Invalid search configuration values".to_string());
    }
    let mut config = state.config.lock().await;
    config.min_score = min_score;
    config.max_results = max_results;
    config.chunk_size = chunk_size;
    config.chunk_overlap = chunk_overlap;
    let runtime_config = crate::domain::models::SearchConfig {
        min_score: config.min_score,
        max_results: config.max_results,
        similarity_metric: config.similarity_metric.clone(),
        chunk_size: config.chunk_size,
        chunk_overlap: config.chunk_overlap,
    };
    let settings_dir = settings_data_dir();
    fs::create_dir_all(&settings_dir).map_err(|error| error.to_string())?;
    let serialized = serde_json::to_string_pretty(&*config).map_err(|error| error.to_string())?;
    fs::write(
        settings_dir.join("search_config.json"),
        serialized.as_bytes(),
    )
    .map_err(|error| error.to_string())?;
    drop(config);
    state.search.update_config(runtime_config)?;
    emit_log(&app_handle, "Search configuration updated".into());
    Ok(())
}

#[tauri::command]
pub async fn get_system_metrics(state: State<'_, AppState>) -> Result<SystemMetrics, String> {
    let metrics = state.metrics.lock().await;
    Ok(metrics.clone())
}

#[tauri::command]
pub async fn get_db_status(state: State<'_, AppState>) -> Result<DbStatus, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;

    let indexed_videos: usize = db
        .query_row("SELECT COUNT(*) FROM media", [], |row| row.get(0))
        .unwrap_or(0);
    let transcript_chunks: usize = db
        .query_row("SELECT COUNT(*) FROM transcript_embeddings", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);

    let actual_db_path = crate::db::data_dir_path()
        .join("library.db")
        .to_string_lossy()
        .to_string();
    Ok(DbStatus {
        db_path: actual_db_path,
        indexed_videos,
        transcript_chunks,
        health_status: "Healthy".into(),
    })
}
#[tauri::command]
pub async fn debug_search_transcripts(
    query: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<DebugSearchResult, String> {
    emit_log(
        &app_handle,
        format!("Debug pipeline running for query: '{}'", query),
    );

    let start_total = std::time::Instant::now();
    let start_embed = std::time::Instant::now();

    let mut onnx_lock = state.onnx.lock().await;
    let onnx = onnx_lock.as_mut().ok_or("Embedding model is not loaded.")?;

    let query_vec = onnx
        .generate_embedding(&query)
        .map_err(|e| format!("Failed to generate native embedding: {}", e))?;

    let embed_time_ms = start_embed.elapsed().as_micros() as f32 / 1000.0;

    let config = state.config.lock().await;
    let final_limit = config.max_results;
    let final_min_score = config.min_score;
    drop(config);

    let start_search = std::time::Instant::now();
    let results = {
        let db = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::search_embeddings(&db, &query_vec, final_limit, final_min_score)
            .map_err(|e| e.to_string())?
    };
    let search_time_us = start_search.elapsed().as_micros() as f32;

    let total_time_ms = start_total.elapsed().as_micros() as f32 / 1000.0;

    let mut metrics = state.metrics.lock().await;
    let total_queries = metrics.total_queries_run as f32;
    metrics.average_query_time_ms =
        (metrics.average_query_time_ms * total_queries + total_time_ms) / (total_queries + 1.0);
    metrics.average_onnx_time_ms =
        (metrics.average_onnx_time_ms * total_queries + embed_time_ms) / (total_queries + 1.0);
    metrics.average_db_time_ms = (metrics.average_db_time_ms * total_queries
        + (search_time_us / 1000.0))
        / (total_queries + 1.0);
    metrics.total_queries_run += 1;

    emit_log(
        &app_handle,
        format!("Debug query finished in {:.2}ms", total_time_ms),
    );

    Ok(DebugSearchResult {
        results,
        embedding_time_ms: embed_time_ms,
        onnx_inference_time_ms: embed_time_ms,
        sqlite_search_time_us: search_time_us,
        total_time_ms,
    })
}

#[tauri::command]
pub async fn rebuild_index(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    emit_log(&app_handle, "Rebuilding database indexes...".into());
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db.execute_batch("REINDEX transcript_embeddings;")
        .map_err(|e| e.to_string())?;
    emit_log(&app_handle, "Index rebuild complete.".into());
    Ok(())
}

#[tauri::command]
pub async fn vacuum_db(state: State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<(), String> {
    emit_log(&app_handle, "Vacuuming SQLite database...".into());
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db.execute_batch("VACUUM;").map_err(|e| e.to_string())?;
    emit_log(&app_handle, "Database vacuum complete.".into());
    Ok(())
}

#[tauri::command]
pub async fn recompute_embeddings(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    emit_log(
        &app_handle,
        "Starting full embedding recomputation (heavy background task)...".into(),
    );

    let job_ids = {
        let db = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::get_all_job_ids(&db).map_err(|e| e.to_string())?
    };

    {
        let onnx_guard = state.onnx.lock().await;
        if onnx_guard.is_none() {
            return Err("ONNX model is not loaded; cannot recompute embeddings".to_string());
        }
    }

    let mut total_recomputed: usize = 0;
    let mut total_errors: usize = 0;

    for job_id in &job_ids {
        let chunks = {
            let db = state
                .db
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            db::get_transcript_text_for_job(&db, *job_id)
                .map_err(|e| e.to_string())?
        };

        if chunks.is_empty() {
            continue;
        }

        let chunker = SemanticChunker::new();
        let text_chunks = chunker.chunk_text(&chunks.join("\n"));

        let mut indexed = Vec::with_capacity(text_chunks.len());
        for chunk in &text_chunks {
            let embed_result = {
                let mut onnx_guard = state.onnx.lock().await;
                let engine = onnx_guard
                    .as_mut()
                    .ok_or("ONNX model became unavailable during recompute")?;
                engine.generate_embedding(&chunk.text)
            };
            match embed_result {
                Ok(vector) if vector.len() == 384 => {
                    indexed.push((chunk.chunk_index, chunk.text.clone(), vector));
                }
                Ok(vector) => {
                    eprintln!(
                        "recompute: job_id={} invalid dimension={}",
                        job_id,
                        vector.len()
                    );
                    total_errors += 1;
                }
                Err(error) => {
                    eprintln!("recompute: job_id={} embedding error: {}", job_id, error);
                    total_errors += 1;
                }
            }
        }

        {
            let db = state
                .db
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            let _ = db::clear_transcript_data(&db, *job_id);
            for (idx, text, embedding) in &indexed {
                let _ = db::insert_transcript_chunk(&db, *job_id, *idx, text, embedding);
            }
        }

        total_recomputed += 1;
    }

    let msg = format!(
        "Embedding recomputation complete: {} jobs processed, {} errors",
        total_recomputed, total_errors
    );
    emit_log(&app_handle, msg.clone());
    Ok(msg)
}

#[tauri::command]
pub async fn auto_cluster_videos(
    threshold: Option<f32>,
    min_cluster_size: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<Vec<i64>>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    let thresh = threshold.unwrap_or(0.7);
    let min_size = min_cluster_size.unwrap_or(2);
    db::cluster_videos_by_similarity(&db, thresh, min_size).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_video_keep_status(
    job_id: i64,
    status: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !matches!(status.as_str(), "keep" | "online") {
        return Err("Retention status must be 'keep' or 'online'".to_string());
    }

    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::set_media_keep_status(&db, job_id, &status).map_err(|e| e.to_string())?;

    if status == "online" {
        db::cleanup_media_files(&db, job_id, &processing_root()).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_transcript(
    job_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<TranscriptChunk>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_transcript_segments_with_timestamps(&db, job_id)
        .map_err(|e| e.to_string())
        .map(|rows| {
            rows.into_iter()
                .map(|(idx, text, start, end)| TranscriptChunk {
                    chunk_index: idx,
                    chunk_text: text,
                    start,
                    end,
                })
                .collect()
        })
}

#[tauri::command]
pub async fn get_playlists(state: State<'_, AppState>) -> Result<Vec<db::PlaylistRecord>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_all_playlists(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_playlist(
    name: String,
    description: Option<String>,
    color: Option<String>,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    let c = color.as_deref().unwrap_or("#8a5cff");
    db::create_playlist(&db, &name, description.as_deref(), c, false).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_to_playlist(
    playlist_id: i64,
    job_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::add_job_to_playlist(&db, playlist_id, job_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_from_playlist(
    playlist_id: i64,
    job_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::remove_job_from_playlist(&db, playlist_id, job_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_playlist_items(
    playlist_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<db::JobRecord>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_playlist_jobs(&db, playlist_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_playlist(playlist_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::delete_playlist(&db, playlist_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn export_semantic(job_id: i64, state: State<'_, AppState>) -> Result<String, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    let job = db::get_job_by_id(&db, job_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Job {} not found", job_id))?;

    let segments = db::get_transcript_segments(&db, job_id).unwrap_or_default();

    let transcript_with_timestamps: String = segments
        .iter()
        .map(|(_, t, s, e)| {
            let start = format_timestamp(*s);
            let end = format_timestamp(*e);
            format!("[{} -> {}] {}", start, end, t)
        })
        .collect::<Vec<_>>()
        .join("\n");

    let embedding_count: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM transcript_embeddings WHERE job_id = ?1",
            params![job_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let (upload_date, keep_status): (Option<String>, Option<String>) = db
        .query_row(
            "SELECT upload_date, keep_status FROM media WHERE job_id = ?1",
            params![job_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or((None, None));

    let unib_content = format!(
        "@unib:0.0\n@owner:pulsar-eventide\n@mode:media\n@created:{}\n@source:{}\n@title:{}\n@author:{}\n@duration:{}\n@platform:{}\n@upload_date:{}\n@keep_status:{}\n@julia_ready:{}\n@embeddings_count:{}\n@embeddings_dim:384\n@embedding_model:all-MiniLM-L6-v2\n\n{}\n\n[V#media] @video_{}:video > downloaded_from > @source_{}:source ?1.0 !0.8 {{st:confirmed}} ^system.\n",
        chrono::Utc::now().to_rfc3339(),
        job.url,
        job.title.clone().unwrap_or_default(),
        job.author.clone().unwrap_or_default(),
        job.duration.unwrap_or(0),
        job.platform.clone().unwrap_or_default(),
        upload_date.unwrap_or_default(),
        keep_status.unwrap_or_default(),
        if transcript_with_timestamps.is_empty() { "false" } else { "true" },
        embedding_count,
        transcript_with_timestamps,
        job_id,
        job_id
    );

    Ok(unib_content)
}

#[tauri::command]
pub async fn import_semantic(content: String, state: State<'_, AppState>) -> Result<(), String> {
    const MAX_UNIB_BYTES: usize = 10 * 1024 * 1024;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err("Empty .unib content".to_string());
    }
    if content.len() > MAX_UNIB_BYTES {
        return Err(".unib file exceeds the 10 MB import limit".to_string());
    }
    if !trimmed
        .lines()
        .any(|line| line.trim_start().starts_with("@unib:"))
    {
        return Err("Invalid .unib content: missing @unib header".to_string());
    }
    if !trimmed.lines().any(|line| line.contains(" > ")) {
        return Err("Invalid .unib content: no semantic triples found".to_string());
    }

    let source = unib_header_value(trimmed, "source")
        .ok_or_else(|| "Invalid .unib content: missing @source".to_string())?;
    if !is_valid_sandbox_url(&source) {
        return Err("Invalid .unib source: only supported HTTPS URLs are accepted".to_string());
    }
    let segments = parse_unib_segments(trimmed);
    if segments.is_empty() {
        return Err("Invalid .unib content: no timestamped transcript segments found".to_string());
    }
    let transcript = segments
        .iter()
        .map(|(_, _, _, text)| text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let chunks = SemanticChunker::new().chunk_text(&transcript);
    if chunks.is_empty() {
        return Err("Invalid .unib content: transcript produced no searchable chunks".to_string());
    }

    let title = unib_header_value(trimmed, "title")
        .unwrap_or_else(|| "Imported UNIB knowledge".to_string());
    let author = unib_header_value(trimmed, "author").unwrap_or_else(|| "unknown".to_string());
    let platform = unib_header_value(trimmed, "platform").unwrap_or_else(|| "tiktok".to_string());
    let upload_date = unib_header_value(trimmed, "upload_date").unwrap_or_default();
    let duration = unib_header_value(trimmed, "duration")
        .and_then(|value| value.parse::<i32>().ok())
        .unwrap_or(0);

    let indexed_chunks = {
        let mut onnx = state.onnx.lock().await;
        let engine = onnx.as_mut().ok_or_else(|| {
            "ONNX model is not loaded; imported text cannot be semantically indexed".to_string()
        })?;
        let mut indexed = Vec::with_capacity(chunks.len());
        for chunk in chunks {
            let embedding = engine.generate_embedding(&chunk.text)?;
            if embedding.len() != 384 {
                return Err(format!("Invalid embedding dimension: {}", embedding.len()));
            }
            indexed.push((chunk.chunk_index, chunk.text, embedding));
        }
        indexed
    };

    let job_id = {
        let db = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        let job_id = match db::find_job_id_by_url(&db, &source).map_err(|e| e.to_string())? {
            Some(existing) => existing,
            None => db::insert_job(&db, &source).map_err(|e| e.to_string())?,
        };
        db::insert_imported_media_metadata(
            &db,
            job_id,
            &title,
            &author,
            duration,
            &upload_date,
            &platform,
        )
        .map_err(|e| e.to_string())?;
        job_id
    };

    {
        let db = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::clear_transcript_data(&db, job_id).map_err(|e| e.to_string())?;
        for (chunk_index, text, embedding) in &indexed_chunks {
            db::insert_transcript_chunk(&db, job_id, *chunk_index, text, embedding)
                .map_err(|e| e.to_string())?;
        }
        for (segment_index, start, end, text) in &segments {
            db::insert_transcript_segment(&db, job_id, *segment_index, *start, *end, text)
                .map_err(|e| e.to_string())?;
        }
        db::update_job_status(&db, job_id, "complete", 100).map_err(|e| e.to_string())?;
    }

    state.search.index_document(job_id, &transcript)?;
    state
        .search
        .snapshot_index()
        .map_err(|error| format!("HNSW snapshot failed after UNIB import: {}", error))?;

    let data_dir = if PathBuf::from("data").exists() {
        PathBuf::from("data")
    } else {
        PathBuf::from("../data")
    };
    let semantic_dir = data_dir.join("semantic");
    fs::create_dir_all(&semantic_dir).map_err(|error| error.to_string())?;

    let mut hasher = DefaultHasher::new();
    trimmed.hash(&mut hasher);
    let path = semantic_dir.join(format!("imported-{:016x}.unib", hasher.finish()));
    fs::write(path, trimmed.as_bytes()).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_download_dir(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = PathBuf::from(path.trim());
    if path.as_os_str().is_empty() {
        return Err("Download directory cannot be empty".to_string());
    }
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    {
        let mut wc = state.worker_config.write().await;
        wc.download_dir = path.to_string_lossy().to_string();
    }
    let settings_dir = settings_data_dir();
    fs::create_dir_all(&settings_dir).map_err(|error| error.to_string())?;
    fs::write(
        settings_dir.join("download_dir.txt"),
        path.to_string_lossy().as_bytes(),
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_download_dir(state: State<'_, AppState>) -> Result<String, String> {
    let wc = state.worker_config.read().await;
    if !wc.download_dir.is_empty() {
        return Ok(wc.download_dir.clone());
    }
    let settings_path = settings_data_dir().join("download_dir.txt");
    if let Ok(path) = fs::read_to_string(settings_path) {
        let path = path.trim();
        if !path.is_empty() {
            return Ok(path.to_string());
        }
    }
    Ok(default_download_dir().to_string_lossy().to_string())
}

#[tauri::command]
pub async fn set_cookie_browser(browser: String, state: State<'_, AppState>) -> Result<(), String> {
    if !matches!(browser.as_str(), "" | "chrome" | "edge" | "firefox") {
        return Err("Unsupported cookie browser".to_string());
    }
    {
        let mut wc = state.worker_config.write().await;
        wc.cookies_browser = browser.clone();
    }
    let settings_dir = settings_data_dir();
    fs::create_dir_all(&settings_dir).map_err(|error| error.to_string())?;
    fs::write(settings_dir.join("cookie_browser.txt"), browser.as_bytes())
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_formats(formats: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut wc = state.worker_config.write().await;
        wc.formats = formats.clone();
    }
    let settings_dir = settings_data_dir();
    fs::create_dir_all(&settings_dir).map_err(|error| error.to_string())?;
    let serialized = serde_json::to_string(&formats).map_err(|error| error.to_string())?;
    fs::write(
        settings_dir.join("formats.json"),
        serialized.as_bytes(),
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_formats(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let wc = state.worker_config.read().await;
    Ok(wc.formats.clone())
}

#[tauri::command]
pub async fn set_default_retention(retention: String, state: State<'_, AppState>) -> Result<(), String> {
    if !matches!(retention.as_str(), "keep" | "online") {
        return Err("Retention policy must be 'keep' or 'online'".to_string());
    }
    {
        let mut wc = state.worker_config.write().await;
        wc.retention = retention.clone();
    }
    let settings_dir = settings_data_dir();
    fs::create_dir_all(&settings_dir).map_err(|error| error.to_string())?;
    fs::write(settings_dir.join("retention.txt"), retention.as_bytes())
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn export_library_json(state: State<'_, AppState>) -> Result<String, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    let jobs = db::get_all_jobs(&db).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&jobs).map_err(|e| e.to_string())
}

#[cfg(test)]
mod unib_tests {
    use super::{parse_unib_segments, parse_unib_time, unib_header_value};

    #[test]
    fn parses_unib_headers_and_timestamped_segments() {
        let content = "@unib:0.0\n@source:https://www.tiktok.com/@demo/video/123\n@title:Clase breve\n\n[00:01.250 -> 00:03.500] Primero observa el encuadre.\n[00:04.000 -> 00:06.000] Después ajusta la luz.\n[V#media] @video_1:video > downloaded_from > @source_1:source ?1.0 !0.8 {st:confirmed} ^system.";
        assert_eq!(
            unib_header_value(content, "title").as_deref(),
            Some("Clase breve")
        );
        assert_eq!(parse_unib_time("00:01.250"), Some(1.25));
        assert_eq!(parse_unib_segments(content).len(), 2);
        assert_eq!(parse_unib_segments(content)[1].1, 4.0);
        assert_eq!(parse_unib_segments(content)[1].3, "Después ajusta la luz.");
    }

    #[test]
    fn rejects_invalid_unib_time_ranges() {
        assert_eq!(parse_unib_time("00:60.000"), None);
        let content = "[00:03.000 -> 00:02.000] Rango invertido\n[00:00.000 -> 00:01.000] Válido";
        let segments = parse_unib_segments(content);
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].3, "Válido");
    }
}
