//! Tauri IPC Commands
//!
//! All #[tauri::command] handlers extracted from main.rs to reduce
//! the composition root to pure bootstrap logic.

use crate::api::middleware::security::is_valid_sandbox_url;
use crate::application::collection_service::sync_due_collections;
use crate::application::queue_service::QueueService;
use crate::application::semantic_chunker::SemanticChunker;
use crate::db;
use crate::embedding;
use crate::storage;
use crate::url_utils::is_collection_source;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex as StdMutex};
use tauri::{Emitter, State};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tokio::sync::Mutex;
#[cfg(windows)]
use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkerConfig {
    pub download_dir: String,
    pub formats: Vec<String>,
    pub cookies_browser: String,
    pub retention: String,
    pub processing: ProcessingSettings,
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub quota_bytes: u64,
    #[serde(default)]
    pub reserve_bytes: u64,
}

impl Default for WorkerConfig {
    fn default() -> Self {
        Self {
            download_dir: String::new(),
            formats: vec!["mp4".into(), "mp3".into(), "txt".into()],
            cookies_browser: String::new(),
            retention: "keep".into(),
            processing: ProcessingSettings::default(),
            intent: "balanced".into(),
            quota_bytes: 0,
            reserve_bytes: 0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProcessingSettings {
    pub quality: u8,
    pub profile: String,
    pub whisper_model: String,
    pub device: String,
    pub compute_type: String,
    pub video_fit: String,
    #[serde(default)]
    pub configured: bool,
}

impl Default for ProcessingSettings {
    fn default() -> Self {
        Self {
            quality: 78,
            profile: "high".into(),
            whisper_model: "tiny".into(),
            device: "cpu".into(),
            compute_type: "int8".into(),
            video_fit: "cover".into(),
            configured: false,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct HardwareProfile {
    pub cpu_name: String,
    pub logical_cores: usize,
    pub ram_bytes: u64,
    pub gpu_name: Option<String>,
    pub vram_bytes: Option<u64>,
    pub whisper_gpu_supported: bool,
    pub recommended_quality: String,
}
/// Estado compartido de la aplicaci├│n Tauri.
///
/// Se gestiona como `tauri::State<AppState>` y se pasa a todos los
/// comandos Tauri. Contiene:
/// - db ÔÇö Conexi├│n SQLite (std::sync::Mutex para compatibilidad sync)
/// - queue ÔÇö Gestor de cola async (tokio::sync::Mutex)
/// - onnx ÔÇö Modelo ONNX de embeddings (opcional, puede no estar cargado)
/// - search ÔÇö Servicio de b├║squeda h├¡brida (HNSW + BM25 + Cache)
/// - config ÔÇö Configuraci├│n de b├║squeda (min_score, max_results, etc.)
/// - metrics ÔÇö M├®tricas de rendimiento (latencias, conteo de queries)
/// - worker_config ÔÇö Configuraci├│n de workers (formats, retention, etc.)
pub struct AppState {
    pub db: Arc<StdMutex<rusqlite::Connection>>,

    pub queue: Arc<QueueService>,
    pub api_runtime: crate::api::ApiRuntimeState,
    pub onnx: Arc<Mutex<Option<embedding::ONNXModelManager>>>,
    pub search: Arc<crate::application::search_service::SearchService>,
    pub config: Arc<Mutex<SearchConfig>>,
    pub metrics: Arc<Mutex<SystemMetrics>>,
    pub worker_config: Arc<tokio::sync::RwLock<WorkerConfig>>,
    pub model_prepare_pid: Arc<Mutex<Option<u32>>>,
    pub local_llm: Arc<crate::infrastructure::local_llm::LocalLlmManager>,
}

#[tauri::command]
pub async fn get_local_llm_status(
    state: State<'_, AppState>,
) -> Result<crate::infrastructure::local_llm::LocalLlmStatus, String> {
    Ok(state.local_llm.status().await)
}

#[tauri::command]
pub async fn ensure_local_llm(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<crate::infrastructure::local_llm::LocalLlmStatus, String> {
    state.local_llm.ensure_model(&app_handle).await
}

#[tauri::command]
pub async fn cancel_local_llm_download(state: State<'_, AppState>) -> Result<(), String> {
    state.local_llm.cancel_download();
    Ok(())
}

#[tauri::command]
pub async fn generate_local_response(
    request: crate::infrastructure::local_llm::LocalLlmRequest,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<crate::infrastructure::local_llm::LocalLlmResponse, String> {
    state.local_llm.generate(&app_handle, request).await
}

/// Optional cloud synthesis. The API key is read by the native adapter only;
/// the frontend receives text or a bounded actionable error, never the key.
#[tauri::command]
pub async fn generate_gemini_response(
    prompt: String,
    max_output_tokens: u32,
) -> Result<String, String> {
    crate::infrastructure::gemini::generate(&prompt, max_output_tokens)
        .await
        .map(|response| response.text)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WhisperModelStatus {
    pub model: String,
    pub ready: bool,
    pub status: String,
    pub revision: Option<String>,
    pub path: String,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct RuntimeHealth {
    pub model: WhisperModelStatus,
    pub queue_depth: usize,
    pub backpressure_active: bool,
    pub worker_capacity: usize,
    pub idle_workers: usize,
    pub autostart_enabled: bool,
    pub api_ready: bool,
    pub api_error: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MvpSettingsInput {
    pub download_dir: String,
    pub retention: String,
    pub browser: String,
    pub formats: Vec<String>,
    pub min_score: f32,
    pub quality: u8,
    pub video_fit: String,
    #[serde(default)]
    pub intent: Option<String>,
    #[serde(default)]
    pub quota_bytes: Option<u64>,
    #[serde(default)]
    pub reserve_bytes: Option<u64>,
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

/// Resolve the bundled/local MiniLM model consistently for development,
/// packaged Tauri builds and the explicit `PULSAR_RUNTIME_ROOT` contract.
pub fn resolve_model_dir() -> PathBuf {
    crate::runtime::embedding_model_dir()
}

fn processing_root() -> PathBuf {
    let root = std::env::var_os("PULSAR_DOWNLOAD_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(storage::default_media_root);
    storage::staging_root(&root)
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

pub fn load_persisted_formats() {
    if std::env::var_os("PULSAR_FORMATS").is_some() {
        return;
    }
    let settings_path = settings_data_dir().join("formats.json");
    if let Ok(contents) = fs::read_to_string(settings_path) {
        if let Ok(formats) = serde_json::from_str::<Vec<String>>(&contents) {
            if !formats.is_empty() {
                if let Ok(serialized) = serde_json::to_string(&formats) {
                    std::env::set_var("PULSAR_FORMATS", serialized);
                }
            }
        }
    }
}

pub fn load_persisted_storage_settings() {
    let data_dir = settings_data_dir();
    if std::env::var_os("PULSAR_SETUP_INTENT").is_none() {
        if let Ok(intent) = fs::read_to_string(data_dir.join("intent.txt")) {
            if storage::SetupIntent::parse(intent.trim()).is_some() {
                std::env::set_var("PULSAR_SETUP_INTENT", intent.trim());
            }
        }
    }
    if std::env::var_os("PULSAR_MEDIA_QUOTA_BYTES").is_none() {
        if let Ok(quota) = fs::read_to_string(data_dir.join("quota_bytes.txt")) {
            if quota.trim().parse::<u64>().is_ok() {
                std::env::set_var("PULSAR_MEDIA_QUOTA_BYTES", quota.trim());
            }
        }
    }
    if std::env::var_os("PULSAR_MEDIA_RESERVE_BYTES").is_none() {
        if let Ok(reserve) = fs::read_to_string(data_dir.join("reserve_bytes.txt")) {
            if reserve.trim().parse::<u64>().is_ok() {
                std::env::set_var("PULSAR_MEDIA_RESERVE_BYTES", reserve.trim());
            }
        }
    }
}

pub fn load_persisted_processing_settings() -> ProcessingSettings {
    let path = settings_data_dir().join("processing_settings.json");
    let mut settings = fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<ProcessingSettings>(&contents).ok())
        .unwrap_or_default();

    if !(0..=100).contains(&settings.quality)
        || !matches!(settings.video_fit.as_str(), "cover" | "contain")
        || !matches!(settings.profile.as_str(), "fast" | "balanced" | "high")
        || !matches!(settings.whisper_model.as_str(), "tiny" | "small" | "medium")
        || !matches!(settings.device.as_str(), "cpu" | "cuda")
    {
        settings = ProcessingSettings::default();
    }

    // A packaged build always carries Whisper tiny as its offline fallback.
    // If a previous high-quality selection was interrupted or its cache was
    // removed, recover to that model instead of blocking the whole library.
    if !inspect_whisper_model(&settings.whisper_model).ready {
        if let Some(fallback) = tiny_fallback_settings(&settings.video_fit) {
            settings = fallback;
        }
    }

    apply_processing_environment(&settings);
    settings
}

fn gpu_probe() -> (Option<String>, Option<u64>) {
    let output = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .output();
    let Ok(output) = output else {
        return (None, None);
    };
    if !output.status.success() {
        return (None, None);
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or_default();
    let mut parts = line.split(',').map(str::trim);
    let name = parts
        .next()
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let vram_bytes = parts
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .map(|mib| mib * 1024 * 1024);
    (name, vram_bytes)
}

fn bundled_cuda_runtime_exists() -> bool {
    crate::runtime::path("python/Lib/site-packages/ctranslate2/cudnn64_9.dll").is_file()
}

fn detect_hardware_profile() -> HardwareProfile {
    let (gpu_name, vram_bytes) = gpu_probe();
    let whisper_gpu_supported = gpu_name.is_some() && bundled_cuda_runtime_exists();
    let logical_cores = num_cpus::get().max(1);
    let ram_bytes = total_ram_bytes();
    let recommended_quality =
        if whisper_gpu_supported && vram_bytes.unwrap_or(0) >= 6 * 1024 * 1024 * 1024 {
            "high"
        } else if logical_cores >= 8 || ram_bytes >= 16 * 1024 * 1024 * 1024 {
            "balanced"
        } else {
            "fast"
        };

    HardwareProfile {
        cpu_name: std::env::var("PROCESSOR_IDENTIFIER").unwrap_or_else(|_| "CPU local".into()),
        logical_cores,
        ram_bytes,
        gpu_name,
        vram_bytes,
        whisper_gpu_supported,
        recommended_quality: recommended_quality.into(),
    }
}

#[cfg(windows)]
fn total_ram_bytes() -> u64 {
    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        dwMemoryLoad: 0,
        ullTotalPhys: 0,
        ullAvailPhys: 0,
        ullTotalPageFile: 0,
        ullAvailPageFile: 0,
        ullTotalVirtual: 0,
        ullAvailVirtual: 0,
        ullAvailExtendedVirtual: 0,
    };
    unsafe {
        if GlobalMemoryStatusEx(&mut status) != 0 {
            return status.ullTotalPhys;
        }
    }
    0
}

#[cfg(not(windows))]
fn total_ram_bytes() -> u64 {
    0
}

fn apply_processing_environment(settings: &ProcessingSettings) {
    std::env::set_var("WHISPER_MODEL", &settings.whisper_model);
    std::env::set_var("WHISPER_DEVICE", &settings.device);
    std::env::set_var("WHISPER_COMPUTE_TYPE", &settings.compute_type);
    std::env::set_var("PULSAR_PROCESSING_QUALITY", settings.quality.to_string());
}

fn derive_processing_settings(
    quality: u8,
    video_fit: String,
) -> Result<ProcessingSettings, String> {
    if !matches!(video_fit.as_str(), "cover" | "contain") {
        return Err("Video fit must be 'cover' or 'contain'".into());
    }
    let hardware = detect_hardware_profile();
    let quality = quality.min(100);
    let (profile, whisper_model, device, compute_type) = if quality < 35 {
        ("fast", "tiny", "cpu", "int8")
    } else if quality < 72 {
        if hardware.whisper_gpu_supported {
            ("balanced", "small", "cuda", "float16")
        } else {
            ("balanced", "small", "cpu", "int8")
        }
    } else if hardware.whisper_gpu_supported {
        ("high", "medium", "cuda", "float16")
    } else {
        ("high", "small", "cpu", "int8")
    };

    Ok(ProcessingSettings {
        quality,
        profile: profile.into(),
        whisper_model: whisper_model.into(),
        device: device.into(),
        compute_type: compute_type.into(),
        video_fit,
        configured: true,
    })
}

fn tiny_fallback_settings(video_fit: &str) -> Option<ProcessingSettings> {
    if !inspect_whisper_model("tiny").ready {
        return None;
    }
    Some(ProcessingSettings {
        quality: 30,
        profile: "fast".into(),
        whisper_model: "tiny".into(),
        device: "cpu".into(),
        compute_type: "int8".into(),
        video_fit: video_fit.to_string(),
        configured: true,
    })
}

fn effective_processing_settings(
    settings: ProcessingSettings,
) -> Result<ProcessingSettings, String> {
    if inspect_whisper_model(&settings.whisper_model).ready {
        return Ok(settings);
    }
    tiny_fallback_settings(&settings.video_fit).ok_or_else(|| {
        format!(
            "MODEL_NOT_READY:{}:No hay un modelo Whisper local verificable",
            settings.whisper_model
        )
    })
}

#[tauri::command]
pub fn get_hardware_profile() -> HardwareProfile {
    detect_hardware_profile()
}

#[derive(Clone, Debug, Serialize)]
pub struct RuntimeResourceCheck {
    pub name: String,
    pub path: String,
    pub required: bool,
    pub available: bool,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct RuntimePreflight {
    pub ready: bool,
    pub offline_ready: bool,
    pub resources: Vec<RuntimeResourceCheck>,
    pub checks: std::collections::BTreeMap<String, bool>,
    pub missing: Vec<String>,
    pub message: String,
}

fn resource_roots() -> Vec<PathBuf> {
    vec![crate::runtime::root()]
}

fn first_resource_path(relative_paths: &[&str]) -> Option<PathBuf> {
    resource_roots()
        .into_iter()
        .flat_map(|root| {
            relative_paths
                .iter()
                .map(move |relative| root.join(relative))
        })
        .find(|path| path.is_file() || path.is_dir())
}

fn runtime_check(name: &str, relative_paths: &[&str], required: bool) -> RuntimeResourceCheck {
    let path = first_resource_path(relative_paths);
    let available = path.is_some();
    RuntimeResourceCheck {
        name: name.to_string(),
        path: path
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| relative_paths.first().unwrap_or(&"").to_string()),
        required,
        available,
        message: if available {
            "Recurso encontrado".to_string()
        } else {
            format!(
                "Falta el recurso requerido: {}",
                relative_paths.first().unwrap_or(&"")
            )
        },
    }
}

fn runtime_check_group(
    name: &str,
    relative_paths: &[&str],
    required: bool,
) -> RuntimeResourceCheck {
    let missing = relative_paths
        .iter()
        .filter(|relative| first_resource_path(&[**relative]).is_none())
        .copied()
        .collect::<Vec<_>>();
    let available = missing.is_empty();
    let path = if available {
        relative_paths
            .first()
            .copied()
            .unwrap_or_default()
            .to_string()
    } else {
        missing.first().copied().unwrap_or_default().to_string()
    };
    RuntimeResourceCheck {
        name: name.to_string(),
        path,
        required,
        available,
        message: if available {
            format!("{} recursos encontrados", relative_paths.len())
        } else {
            format!("Faltan recursos requeridos: {}", missing.join(", "))
        },
    }
}

#[tauri::command]
pub fn get_runtime_preflight() -> RuntimePreflight {
    let mut resources = vec![
        runtime_check("Python embebido", &["python/python.exe"], true),
        runtime_check_group(
            "Workers Python",
            &[
                "python-workers/main.py",
                "python-workers/downloader.py",
                "python-workers/events.py",
                "python-workers/models.py",
                "python-workers/transcriber.py",
                "python-workers/visual_analyzer.py",
                "python-workers/audio_extractor.py",
                "python-workers/daemon.py",
                "python-workers/embed_query.py",
                "python-workers/export_onnx.py",
                "python-workers/export_onnx_embeddings.py",
                "python-workers/prepare_whisper_model.py",
            ],
            true,
        ),
        runtime_check("FFmpeg", &["bin/ffmpeg.exe"], true),
        runtime_check("ffprobe", &["bin/ffprobe.exe"], true),
        runtime_check(
            "ONNX MiniLM",
            &["assets/models/all-MiniLM-L6-v2/model.onnx"],
            true,
        ),
        runtime_check(
            "Whisper tiny",
            &["assets/models/models--Systran--faster-whisper-tiny"],
            true,
        ),
        runtime_check("Manifiesto de runtime", &["runtime-manifest.json"], true),
    ];
    // The bundled tiny model may be represented by a Hugging Face pointer
    // rather than a regular file. Treat the native validator as authoritative
    // for that one resource while still exposing the checked path.
    if let Some(tiny) = resources
        .iter_mut()
        .find(|resource| resource.name == "Whisper tiny")
    {
        if bundled_whisper_model_available("tiny") {
            tiny.available = true;
            tiny.message = "Modelo tiny incluido y verificable".to_string();
        }
    }
    let missing = resources
        .iter()
        .filter(|resource| resource.required && !resource.available)
        .map(|resource| resource.name.clone())
        .collect::<Vec<_>>();
    let ready = missing.is_empty();
    let checks = resources
        .iter()
        .map(|resource| (resource.name.clone(), resource.available))
        .collect();
    let message = if ready {
        "Runtime local listo para trabajar sin Node, Rust, Python ni FFmpeg instalados por el usuario."
            .to_string()
    } else {
        format!(
            "Runtime incompleto. Reinstala el paquete o corrige estos recursos: {}.",
            missing.join(", ")
        )
    };
    RuntimePreflight {
        ready,
        offline_ready: ready,
        resources,
        checks,
        missing,
        message,
    }
}

#[tauri::command]
pub fn get_storage_status(
    path: Option<String>,
    quota_bytes: Option<u64>,
) -> Result<storage::StorageStatus, String> {
    let root = path
        .filter(|value| !value.trim().is_empty())
        .map(|value| expand_user_path(&value))
        .unwrap_or_else(storage::default_media_root);
    if !root.exists() {
        fs::create_dir_all(&root)
            .map_err(|error| format!("No se pudo preparar la carpeta de medios: {}", error))?;
    }
    storage::ensure_media_root(&root).map_err(|error| error.to_string())?;
    Ok(storage::storage_status(
        &root,
        quota_bytes.unwrap_or_else(storage::configured_quota_bytes),
        storage::configured_reserve_bytes(),
    ))
}

#[tauri::command]
pub fn recommend_storage_setup(
    intent: Option<String>,
    path: Option<String>,
) -> Result<storage::StorageRecommendation, String> {
    let root = path
        .filter(|value| !value.trim().is_empty())
        .map(|value| expand_user_path(&value))
        .unwrap_or_else(storage::default_media_root);
    if !root.exists() {
        fs::create_dir_all(&root)
            .map_err(|error| format!("No se pudo preparar la carpeta elegida: {}", error))?;
    }
    let status = storage::storage_status(&root, 0, None);
    if status.total_bytes == 0 && status.free_bytes == 0 {
        return Err(format!(
            "No se pudo medir el espacio libre de {}. Comprueba la unidad y los permisos.",
            root.display()
        ));
    }
    let parsed = intent
        .as_deref()
        .and_then(storage::SetupIntent::parse)
        .unwrap_or(storage::SetupIntent::Balanced);
    Ok(storage::recommend_storage(parsed, status.free_bytes))
}

#[tauri::command]
pub async fn preview_media_purge(
    required_bytes: Option<u64>,
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<storage::PurgeCandidate>, String> {
    let path_was_provided = path.as_ref().is_some_and(|value| !value.trim().is_empty());
    let root = path
        .filter(|value| !value.trim().is_empty())
        .map(|value| expand_user_path(&value))
        .unwrap_or_else(storage::default_media_root);
    let root = if !path_was_provided {
        let configured = state.worker_config.read().await.download_dir.clone();
        if configured.trim().is_empty() {
            root
        } else {
            PathBuf::from(configured)
        }
    } else {
        root
    };
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    storage::preview_purge(&db, &root, required_bytes.unwrap_or(0))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn apply_media_purge(
    job_ids: Vec<i64>,
    reason: Option<String>,
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<storage::PurgeAction>, String> {
    let root = path
        .filter(|value| !value.trim().is_empty())
        .map(|value| expand_user_path(&value))
        .unwrap_or_else(storage::default_media_root);
    let mut db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    storage::apply_purge(
        &mut db,
        &root,
        &job_ids,
        reason.as_deref().unwrap_or("manual purge"),
    )
}

#[tauri::command]
pub async fn undo_media_purge(
    purge_id: i64,
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<storage::PurgeAction, String> {
    let root = path
        .filter(|value| !value.trim().is_empty())
        .map(|value| expand_user_path(&value))
        .unwrap_or_else(storage::default_media_root);
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    storage::undo_purge(&db, &root, purge_id)
}

#[tauri::command]
pub async fn empty_media_trash(
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    let path_was_provided = path.as_ref().is_some_and(|value| !value.trim().is_empty());
    let root = path
        .filter(|value| !value.trim().is_empty())
        .map(|value| expand_user_path(&value))
        .unwrap_or_else(storage::default_media_root);
    let root = if !path_was_provided {
        let configured = state.worker_config.read().await.download_dir.clone();
        if configured.trim().is_empty() {
            root
        } else {
            PathBuf::from(configured)
        }
    } else {
        root
    };
    storage::empty_media_trash(&root)
}

#[tauri::command]
pub async fn set_media_protection(
    job_id: i64,
    favorite: Option<bool>,
    pinned: Option<bool>,
    protected: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::set_media_protection(&db, job_id, favorite, pinned, protected)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn record_media_access(
    job_id: i64,
    access_kind: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::record_media_access(&db, job_id, &access_kind).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_job_artifacts(
    job_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<storage::ArtifactRecord>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    storage::list_artifacts(&db, job_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_video_frame(
    job_id: i64,
    bytes: Vec<u8>,
    timestamp: f64,
    label: Option<String>,
    state: State<'_, AppState>,
) -> Result<storage::ArtifactRecord, String> {
    if !timestamp.is_finite() || timestamp < 0.0 {
        return Err("El timestamp de la captura no es válido".to_string());
    }
    let root = state.worker_config.read().await.download_dir.clone();
    let root = if root.trim().is_empty() {
        storage::default_media_root()
    } else {
        PathBuf::from(root)
    };
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    storage::save_manual_frame(&db, &root, job_id, &bytes, timestamp, label.as_deref())
}

fn whisper_cache_root() -> PathBuf {
    db::data_dir_path().join("whisper-models")
}

fn resolve_python_runtime() -> PathBuf {
    if let Some(configured) =
        std::env::var_os("PYTHON_EXE").or_else(|| std::env::var_os("PULSAR_PYTHON_PATH"))
    {
        let path = PathBuf::from(configured);
        if path.is_file() {
            return path;
        }
    }
    crate::runtime::python_executable()
}

fn resolve_model_preparer() -> PathBuf {
    crate::runtime::worker_script("prepare_whisper_model.py")
}

fn model_revision(model: &str) -> Option<&'static str> {
    match model {
        "tiny" => Some("d90ca5fe260221311c53c58e660288d3deb8d356"),
        "small" => Some("536b0662742c02347bc0e980a01041f333bce120"),
        "medium" => Some("08e178d48790749d25932bbc082711ddcfdfbc4f"),
        _ => None,
    }
}

fn bundled_whisper_model_available(model: &str) -> bool {
    let Some(revision) = model_revision(model) else {
        return false;
    };
    let cache_name = format!("models--Systran--faster-whisper-{}", model);
    let roots = vec![crate::runtime::whisper_model_root()];

    let required = [
        ("config.json", 128_u64),
        ("model.bin", 10_000_000_u64),
        ("tokenizer.json", 128_u64),
        ("vocabulary.txt", 128_u64),
    ];
    roots
        .into_iter()
        .flat_map(|root| {
            [
                root.join(model),
                root.join(&cache_name).join("snapshots").join(revision),
            ]
        })
        .any(|directory| {
            required.iter().all(|(name, minimum_size)| {
                let path = directory.join(name);
                if fs::metadata(&path)
                    .map(|metadata| metadata.len() >= *minimum_size)
                    .unwrap_or(false)
                {
                    return true;
                }

                // Hugging Face exports cache pointers for small files and
                // Windows symlinks for model.bin. Resolve the pointer to the
                // bundled blobs directory before declaring the fallback ready.
                let Ok(pointer) = fs::read_to_string(&path) else {
                    return false;
                };
                let pointer = pointer.trim();
                if !pointer.starts_with("../../blobs/") {
                    return false;
                }
                directory
                    .join(name)
                    .parent()
                    .map(|parent| parent.join(pointer))
                    .and_then(|blob| fs::metadata(blob).ok())
                    .map(|metadata| metadata.len() >= *minimum_size)
                    .unwrap_or(false)
            })
        })
}

fn inspect_whisper_model(model: &str) -> WhisperModelStatus {
    let directory = whisper_cache_root().join(model);
    let manifest_path = directory.join("pulsaria-model-manifest.json");
    let revision = model_revision(model).map(str::to_string);
    let manifest = fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok());
    let mut problem = None;
    if manifest
        .as_ref()
        .and_then(|value| value.get("revision"))
        .and_then(|value| value.as_str())
        != revision.as_deref()
    {
        problem = Some("El manifiesto no corresponde a la revisi├│n fijada".to_string());
    }
    if problem.is_none() {
        for name in [
            "config.json",
            "model.bin",
            "tokenizer.json",
            "vocabulary.txt",
        ] {
            let path = directory.join(name);
            let expected = manifest
                .as_ref()
                .and_then(|value| value.get("files"))
                .and_then(|value| value.get(name));
            let result = (|| -> Result<(), String> {
                let expected_size = expected
                    .and_then(|value| value.get("size"))
                    .and_then(|value| value.as_u64())
                    .ok_or_else(|| format!("Falta el tama├▒o de {}", name))?;
                let expected_hash = expected
                    .and_then(|value| value.get("sha256"))
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| format!("Falta el hash de {}", name))?;
                let metadata = fs::metadata(&path).map_err(|_| format!("Falta {}", name))?;
                if metadata.len() != expected_size
                    || (name == "model.bin" && metadata.len() < 10_000_000)
                {
                    return Err(format!("{} est├í incompleto", name));
                }
                let mut file = fs::File::open(&path).map_err(|error| error.to_string())?;
                let mut hasher = Sha256::new();
                // Keep the verification buffer on the heap. A 1 MiB stack
                // allocation here overflows the Windows Tokio main thread
                // before Tauri has a chance to create its window.
                let mut buffer = vec![0_u8; 1024 * 1024];
                loop {
                    let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
                    if read == 0 {
                        break;
                    }
                    hasher.update(&buffer[..read]);
                }
                if format!("{:x}", hasher.finalize()) != expected_hash {
                    return Err(format!("El hash de {} no coincide", name));
                }
                Ok(())
            })();
            if let Err(error) = result {
                problem = Some(error);
                break;
            }
        }
    }
    let bundled_fallback = model == "tiny" && bundled_whisper_model_available(model);
    if problem.is_some() && bundled_fallback {
        problem = None;
    }
    WhisperModelStatus {
        model: model.to_string(),
        ready: problem.is_none(),
        status: if problem.is_none() {
            if bundled_fallback {
                "bundled".into()
            } else {
                "ready".into()
            }
        } else {
            "missing".into()
        },
        revision,
        path: directory.to_string_lossy().to_string(),
        message: problem,
    }
}

#[tauri::command]
pub async fn get_whisper_model_status(model: String) -> Result<WhisperModelStatus, String> {
    model_revision(&model).ok_or_else(|| "Modelo Whisper no soportado".to_string())?;
    Ok(inspect_whisper_model(&model))
}

#[tauri::command]
pub async fn prepare_whisper_model(
    model: String,
    state: State<'_, AppState>,
) -> Result<WhisperModelStatus, String> {
    model_revision(&model).ok_or_else(|| "Modelo Whisper no soportado".to_string())?;
    if inspect_whisper_model(&model).ready {
        return Ok(inspect_whisper_model(&model));
    }
    let mut command = tokio::process::Command::new(resolve_python_runtime());
    command
        .arg(resolve_model_preparer())
        .arg("--model")
        .arg(&model)
        .arg("--cache-root")
        .arg(whisper_cache_root())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let child = command
        .spawn()
        .map_err(|error| format!("No se pudo iniciar la preparaci├│n: {}", error))?;
    {
        let mut pid = state.model_prepare_pid.lock().await;
        *pid = child.id();
    }
    let output = child.wait_with_output().await;
    *state.model_prepare_pid.lock().await = None;
    let output = output.map_err(|error| error.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stdout.lines().last().unwrap_or(stderr.trim()).to_string();
        if let Ok(connection) = state.db.lock() {
            let _ = db::insert_health_event(
                &connection,
                "whisper",
                "error",
                &message,
                Some("prepare_model"),
                Some("failed"),
            );
        }
        return Err(message);
    }
    let status = inspect_whisper_model(&model);
    if !status.ready {
        return Err(status
            .message
            .clone()
            .unwrap_or_else(|| "El modelo no super├│ la validaci├│n".into()));
    }
    std::env::set_var("PULSAR_WHISPER_MODEL_DIR", &status.path);
    if let Ok(connection) = state.db.lock() {
        let _ = db::insert_health_event(
            &connection,
            "whisper",
            "info",
            "Modelo descargado y validado",
            Some("prepare_model"),
            Some("ready"),
        );
    }
    Ok(status)
}

#[tauri::command]
pub async fn cancel_whisper_model_preparation(state: State<'_, AppState>) -> Result<(), String> {
    let pid = *state.model_prepare_pid.lock().await;
    if let Some(pid) = pid {
        #[cfg(windows)]
        {
            let status = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .status()
                .map_err(|error| error.to_string())?;
            if !status.success() {
                return Err("No se pudo cancelar la preparaci├│n del modelo".into());
            }
        }
        *state.model_prepare_pid.lock().await = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_processing_settings(
    state: State<'_, AppState>,
) -> Result<ProcessingSettings, String> {
    let config = state.worker_config.read().await;
    Ok(config.processing.clone())
}

#[tauri::command]
pub async fn set_processing_settings(
    quality: u8,
    video_fit: String,
    state: State<'_, AppState>,
) -> Result<ProcessingSettings, String> {
    let settings = effective_processing_settings(derive_processing_settings(quality, video_fit)?)?;
    apply_processing_environment(&settings);
    let serialized = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::create_dir_all(settings_data_dir()).map_err(|error| error.to_string())?;
    fs::write(
        settings_data_dir().join("processing_settings.json"),
        serialized.as_bytes(),
    )
    .map_err(|error| error.to_string())?;
    let mut config = state.worker_config.write().await;
    config.processing = settings.clone();
    Ok(settings)
}

#[tauri::command]
pub async fn save_mvp_settings(
    input: MvpSettingsInput,
    state: State<'_, AppState>,
) -> Result<ProcessingSettings, String> {
    if !matches!(input.retention.as_str(), "keep" | "online") {
        return Err("Retenci├│n inv├ílida".into());
    }
    if !input.browser.is_empty() && !matches!(input.browser.as_str(), "chrome" | "edge" | "firefox")
    {
        return Err("Navegador de sesi├│n inv├ílido".into());
    }
    let allowed_formats = [
        "mp4", "mkv", "webm", "mov", "mp3", "wav", "flac", "ogg", "m4a", "txt", "srt", "vtt",
        "json",
    ];
    if input.formats.is_empty()
        || input
            .formats
            .iter()
            .any(|value| !allowed_formats.contains(&value.as_str()))
    {
        return Err("La selecci├│n de formatos es inv├ílida".into());
    }
    if !(0.0..=1.0).contains(&input.min_score) {
        return Err("El umbral sem├íntico debe estar entre 0 y 1".into());
    }
    let download_dir = expand_user_path(&input.download_dir);
    if input.download_dir.trim().is_empty() {
        return Err("Selecciona una carpeta de guardado".into());
    }
    fs::create_dir_all(&download_dir)
        .map_err(|error| format!("No se pudo preparar la carpeta: {}", error))?;
    storage::ensure_media_root(&download_dir)
        .map_err(|error| format!("No se pudo preparar el almacenamiento local: {}", error))?;
    let intent = input
        .intent
        .as_deref()
        .and_then(storage::SetupIntent::parse)
        .unwrap_or(storage::SetupIntent::Balanced);
    let disk_status = storage::storage_status(&download_dir, 0, input.reserve_bytes);
    let reserve_bytes = input.reserve_bytes.unwrap_or(disk_status.reserve_bytes);
    let quota_bytes = input.quota_bytes.unwrap_or_else(|| {
        storage::recommend_storage(intent.clone(), disk_status.free_bytes).quota_bytes
    });
    if quota_bytes > 0 {
        let safe_bytes = disk_status.free_bytes.saturating_sub(reserve_bytes);
        if safe_bytes < storage::GIB {
            return Err(
                "El disco no tiene 1 GiB de espacio seguro. Libera espacio o cambia la carpeta."
                    .to_string(),
            );
        }
        if quota_bytes > safe_bytes {
            return Err(format!(
                "La cuota solicitada ({}) supera el espacio libre seguro disponible ({}).",
                storage::format_bytes(quota_bytes),
                storage::format_bytes(safe_bytes)
            ));
        }
    }
    let processing = effective_processing_settings(derive_processing_settings(
        input.quality,
        input.video_fit.clone(),
    )?)?;

    let search = SearchConfig {
        min_score: input.min_score,
        max_results: 10,
        similarity_metric: "Cosine".into(),
        chunk_size: 150,
        chunk_overlap: 50,
    };
    let directory = settings_data_dir();
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let writes = vec![
        (
            directory.join("download_dir.txt"),
            download_dir.to_string_lossy().as_bytes().to_vec(),
        ),
        (
            directory.join("retention.txt"),
            input.retention.as_bytes().to_vec(),
        ),
        (
            directory.join("cookie_browser.txt"),
            input.browser.as_bytes().to_vec(),
        ),
        (
            directory.join("formats.json"),
            serde_json::to_vec_pretty(&input.formats).map_err(|error| error.to_string())?,
        ),
        (
            directory.join("search_config.json"),
            serde_json::to_vec_pretty(&search).map_err(|error| error.to_string())?,
        ),
        (
            directory.join("processing_settings.json"),
            serde_json::to_vec_pretty(&processing).map_err(|error| error.to_string())?,
        ),
        (
            directory.join("intent.txt"),
            intent.as_str().as_bytes().to_vec(),
        ),
        (
            directory.join("quota_bytes.txt"),
            quota_bytes.to_string().into_bytes(),
        ),
        (
            directory.join("reserve_bytes.txt"),
            reserve_bytes.to_string().into_bytes(),
        ),
    ];
    let previous: Vec<(PathBuf, Option<Vec<u8>>)> = writes
        .iter()
        .map(|(path, _)| (path.clone(), fs::read(path).ok()))
        .collect();
    for (path, content) in &writes {
        if let Err(error) = fs::write(path, content) {
            for (restore_path, restore_content) in &previous {
                if let Some(bytes) = restore_content {
                    let _ = fs::write(restore_path, bytes);
                } else {
                    let _ = fs::remove_file(restore_path);
                }
            }
            return Err(format!("No se pudo guardar {}: {}", path.display(), error));
        }
    }

    std::env::set_var("PULSAR_DOWNLOAD_DIR", &download_dir);
    std::env::set_var("PULSAR_DEFAULT_RETENTION", &input.retention);
    std::env::set_var("PULSAR_SETUP_INTENT", intent.as_str());
    std::env::set_var("PULSAR_MEDIA_QUOTA_BYTES", quota_bytes.to_string());
    std::env::set_var("PULSAR_MEDIA_RESERVE_BYTES", reserve_bytes.to_string());
    std::env::set_var(
        "PULSAR_FORMATS",
        serde_json::to_string(&input.formats).map_err(|error| error.to_string())?,
    );
    if input.browser.is_empty() {
        std::env::remove_var("PULSAR_COOKIES_FROM_BROWSER");
    } else {
        std::env::set_var("PULSAR_COOKIES_FROM_BROWSER", &input.browser);
    }
    apply_processing_environment(&processing);
    *state.config.lock().await = search;
    let mut worker = state.worker_config.write().await;
    worker.download_dir = download_dir.to_string_lossy().to_string();
    worker.retention = input.retention;
    worker.cookies_browser = input.browser;
    worker.formats = input.formats;
    worker.processing = processing.clone();
    worker.intent = intent.as_str().to_string();
    worker.quota_bytes = quota_bytes;
    worker.reserve_bytes = reserve_bytes;
    Ok(processing)
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
    storage::default_media_root()
}

fn expand_user_path(value: &str) -> PathBuf {
    let trimmed = value.trim();
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        let profile = PathBuf::from(profile);
        if let Some(relative) = trimmed
            .strip_prefix("%USERPROFILE%\\")
            .or_else(|| trimmed.strip_prefix("%USERPROFILE%/"))
        {
            return profile.join(relative);
        }
        if trimmed.eq_ignore_ascii_case("%USERPROFILE%") {
            return profile;
        }
    }
    if let Some(relative) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        if let Some(profile) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))
        {
            return PathBuf::from(profile).join(relative);
        }
    }
    PathBuf::from(trimmed)
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
    if parts.next().is_some() || minutes < 0.0 || !(0.0..60.0).contains(&seconds) {
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
    _app_handle: tauri::AppHandle,
) -> Result<i64, String> {
    {
        let configured = state.worker_config.read().await.processing.clone();
        let effective = effective_processing_settings(configured.clone())?;
        if effective.whisper_model != configured.whisper_model {
            apply_processing_environment(&effective);
            state.worker_config.write().await.processing = effective.clone();
        }
    }
    if !is_valid_sandbox_url(&url) {
        return Err("Only supported HTTPS media URLs are accepted".to_string());
    }
    let media_root = {
        let configured = state.worker_config.read().await.download_dir.clone();
        if configured.trim().is_empty() {
            storage::default_media_root()
        } else {
            PathBuf::from(configured)
        }
    };
    storage::ensure_media_root(&media_root)
        .map_err(|error| format!("No se pudo preparar el almacenamiento local: {}", error))?;
    storage::ensure_capacity(&media_root)?;

    if is_collection_source(&url) {
        let browser = state.worker_config.read().await.cookies_browser.clone();
        let source_id = {
            let db = state
                .db
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            db::register_collection_source_with_browser(
                &db,
                &url,
                (!browser.is_empty()).then_some(browser.as_str()),
            )
            .map_err(|e| e.to_string())?;
            let source_id = db::find_collection_source_id_by_url(&db, &url)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "No se pudo registrar la fuente".to_string())?;
            db::mark_collection_source_attempt(&db, source_id)
                .map_err(|error| error.to_string())?;
            source_id
        };

        let collection_urls = state
            .queue
            .expand_collection_with_browser(&url, (!browser.is_empty()).then_some(browser.as_str()))
            .await;
        let collection_urls = match collection_urls {
            Ok(urls) => urls,
            Err(error) => {
                if let Ok(connection) = state.db.lock() {
                    if let Err(state_error) =
                        db::mark_collection_source_failed(&connection, source_id, &error)
                    {
                        emit_log(
                            &_app_handle,
                            format!("Collection failure state update failed: {}", state_error),
                        );
                    }
                    if let Err(event_error) = db::insert_health_event(
                        &connection,
                        "tiktok_sync",
                        "error",
                        &error,
                        Some("retry_with_backoff"),
                        Some("scheduled"),
                    ) {
                        emit_log(
                            &_app_handle,
                            format!(
                                "Collection health event persistence failed: {}",
                                event_error
                            ),
                        );
                    }
                }
                return Err(error);
            }
        };
        if collection_urls.is_empty() {
            if let Ok(connection) = state.db.lock() {
                if let Err(state_error) = db::mark_collection_source_failed(
                    &connection,
                    source_id,
                    "La fuente no devolvió videos accesibles",
                ) {
                    emit_log(
                        &_app_handle,
                        format!(
                            "Collection empty-source state update failed: {}",
                            state_error
                        ),
                    );
                }
            }
            return Err("No public videos were found in the TikTok collection".to_string());
        }

        let mut first_job_id = None;
        let mut queued = 0usize;
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
                match state
                    .queue
                    .dispatch_with_browser(
                        job_id,
                        video_url,
                        (!browser.is_empty()).then_some(browser.clone()),
                    )
                    .await
                {
                    Ok(()) => queued += 1,
                    Err(error) => {
                        if let Ok(connection) = state.db.lock() {
                            let _ =
                                db::mark_collection_source_failed(&connection, source_id, &error);
                            let _ = db::insert_health_event(
                                &connection,
                                "tiktok_sync",
                                "error",
                                &error,
                                Some("retry_with_backoff"),
                                Some("manual"),
                            );
                        }
                        return Err(error);
                    }
                }
            }
        }

        if let Ok(connection) = state.db.lock() {
            if let Err(error) = db::mark_collection_source_synced(&connection, source_id, queued) {
                emit_log(
                    &_app_handle,
                    format!("Collection success state update failed: {}", error),
                );
            }
        }

        return first_job_id.ok_or_else(|| "Collection did not yield any jobs".to_string());
    }

    let job_id = {
        let db = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        let existing_job = match db::find_job_id_by_url(&db, &url).map_err(|e| e.to_string())? {
            Some(existing_id) => db::get_job_by_id(&db, existing_id).map_err(|e| e.to_string())?,
            None => None,
        };
        if let Some(existing_job) = existing_job {
            let status = existing_job.status.to_lowercase();
            if matches!(
                status.as_str(),
                "error" | "error_dlq" | "failed" | "failure" | "cancelled" | "canceled"
            ) {
                db::cleanup_media_files(&db, existing_job.id, &processing_root())
                    .map_err(|e| e.to_string())?;
                db::reset_job_for_retry(&db, existing_job.id).map_err(|e| e.to_string())?;
            } else {
                return Ok(existing_job.id);
            }
            existing_job.id
        } else {
            db::insert_job(&db, &url).map_err(|e| e.to_string())?
        }
    };

    state.queue.dispatch(job_id, url).await?;

    Ok(job_id)
}

#[tauri::command]
pub async fn get_jobs(state: State<'_, AppState>) -> Result<Vec<db::JobRecord>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    let mut jobs = db::get_all_jobs(&db).map_err(|e| e.to_string())?;
    // Do not advertise a stale database path as playable media. This is
    // especially important after an interrupted native run or power loss.
    for job in &mut jobs {
        if job
            .video_path
            .as_deref()
            .map(PathBuf::from)
            .is_some_and(|path| !path.is_file())
        {
            job.video_path = None;
        }
    }
    Ok(jobs)
}

#[tauri::command]
pub async fn get_collection_sources(
    state: State<'_, AppState>,
) -> Result<Vec<db::CollectionSourceRecord>, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_collection_sources(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_collection_source_active(
    source_id: i64,
    active: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::set_collection_source_active(&connection, source_id, active)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_collection_source(
    source_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::delete_collection_source(&connection, source_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn sync_collection_source_now(
    source_id: i64,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    {
        let connection = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::force_collection_source_due(&connection, source_id)
            .map_err(|error| error.to_string())?;
    }
    sync_due_collections(state.db.clone(), state.queue.clone(), app_handle).await;
    Ok(())
}

#[tauri::command]
pub async fn get_health_events(
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<db::HealthEvent>, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_health_events(&connection, limit.unwrap_or(100)).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_runtime_health(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<RuntimeHealth, String> {
    let processing = state.worker_config.read().await.processing.clone();
    let model = inspect_whisper_model(&processing.whisper_model);
    let (queue_depth, backpressure_active, worker_capacity, idle_workers) =
        state.queue.runtime_status().await;
    let (api_ready, api_error) = state.api_runtime.snapshot();
    Ok(RuntimeHealth {
        model,
        queue_depth,
        backpressure_active,
        worker_capacity,
        idle_workers,
        autostart_enabled: app_handle.autolaunch().is_enabled().unwrap_or(false),
        api_ready,
        api_error,
    })
}

#[tauri::command]
pub async fn repair_library(state: State<'_, AppState>) -> Result<db::LibraryRepairReport, String> {
    let report = {
        let connection = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::repair_library(&connection).map_err(|error| error.to_string())?
    };
    state.queue.resume_pending_jobs().await?;
    Ok(report)
}

#[tauri::command]
pub fn get_base_path() -> Result<String, String> {
    std::env::current_dir()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn retry_job(
    job_id: i64,
    state: State<'_, AppState>,
    _app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // A failed attempt may still be inside QueueService's exponential
    // backoff. Treat a second click as idempotent instead of resetting the
    // same job while its original retry task is alive.
    if state.queue.is_active(job_id).await {
        return Ok(());
    }

    let url = {
        let db = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        let job = db::get_job_by_id(&db, job_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "Trabajo no encontrado".to_string())?;
        let status = job.status.to_lowercase();
        if !matches!(
            status.as_str(),
            "error" | "error_dlq" | "failed" | "failure" | "cancelled" | "canceled"
        ) {
            return Err("El trabajo todav├¡a no est├í disponible para reintento".to_string());
        }
        // Remove only this job's processing directory and stale media paths.
        // A retry starts from a clean pipeline instead of reusing partial files.
        db::cleanup_media_files(&db, job_id, &processing_root())
            .map_err(|error| error.to_string())?;
        db::reset_job_for_retry(&db, job_id).map_err(|error| error.to_string())?;
        job.url
    };

    state.queue.dispatch(job_id, url).await?;
    Ok(())
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

    let model_dir = resolve_model_dir();
    let model_file = model_dir.join("model.onnx");
    let model_path = if model_file.is_file() {
        model_file.to_string_lossy().to_string()
    } else {
        "model.onnx not found".to_string()
    };

    Ok(ModelStatus {
        loaded,
        dimensions: if loaded { 384 } else { 0 },
        runtime: if loaded {
            "ONNX Runtime (all-MiniLM-L6-v2)".into()
        } else {
            "Not loaded".into()
        },
        model_path,
        memory_usage: if loaded {
            "~100MB".into()
        } else {
            "0MB".into()
        },
    })
}

#[tauri::command]
pub async fn reload_model(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    emit_log(&app_handle, "Reloading ONNX model...".into());
    let model_dir = resolve_model_dir();

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
        .map_err(|error| format!("Database health query failed for media: {}", error))?;
    let transcript_chunks: usize = db
        .query_row("SELECT COUNT(*) FROM transcript_embeddings", [], |row| {
            row.get(0)
        })
        .map_err(|error| {
            format!(
                "Database health query failed for transcript embeddings: {}",
                error
            )
        })?;

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
pub async fn vacuum_db(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
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
            db::get_transcript_text_for_job(&db, *job_id).map_err(|e| e.to_string())?
        };

        if chunks.is_empty() {
            continue;
        }

        let chunker = SemanticChunker::new();
        let text_chunks = chunker.chunk_text(&chunks.join("\n"));

        let mut indexed = Vec::with_capacity(text_chunks.len());
        let mut job_errors = 0usize;
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
                    job_errors += 1;
                    total_errors += 1;
                }
                Err(error) => {
                    eprintln!("recompute: job_id={} embedding error: {}", job_id, error);
                    job_errors += 1;
                    total_errors += 1;
                }
            }
        }

        // A partial rebuild must never replace a complete set of embeddings
        // with a smaller subset. Keep the previous derived data intact and
        // report the job as failed so the caller can retry after fixing the
        // embedding engine or model.
        if job_errors > 0 {
            eprintln!(
                "recompute: preserving existing embeddings for job_id={} after {} errors",
                job_id, job_errors
            );
            continue;
        }

        {
            let mut db = state
                .db
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            if let Err(error) = db::replace_transcript_embeddings(&mut db, *job_id, &indexed) {
                eprintln!(
                    "recompute: job_id={} embedding persistence error: {}",
                    job_id, error
                );
                total_errors += 1;
                continue;
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

#[derive(Deserialize)]
pub struct AiPlaylistInput {
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub cover_job_id: Option<i64>,
    pub topic_keywords: Vec<String>,
    pub job_ids: Vec<i64>,
}

#[tauri::command]
pub async fn replace_ai_playlists(
    groups: Vec<AiPlaylistInput>,
    state: State<'_, AppState>,
) -> Result<Vec<db::PlaylistRecord>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    let inputs = groups
        .iter()
        .map(|group| {
            let keywords =
                serde_json::to_string(&group.topic_keywords).unwrap_or_else(|_| "[]".to_string());
            let description = group.description.as_deref();
            (group, keywords, description)
        })
        .collect::<Vec<_>>();
    let refs = inputs
        .iter()
        .map(|(group, keywords, description)| db::AutoPlaylistInput {
            name: &group.name,
            description: *description,
            color: &group.color,
            cover_job_id: group.cover_job_id,
            topic_keywords: keywords,
            job_ids: &group.job_ids,
        })
        .collect::<Vec<_>>();
    db::replace_auto_playlists(&db, &refs).map_err(|e| e.to_string())?;
    db::get_all_playlists(&db).map_err(|e| e.to_string())
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
    let mut jobs = db::get_playlist_jobs(&db, playlist_id).map_err(|e| e.to_string())?;
    for job in &mut jobs {
        if job
            .video_path
            .as_deref()
            .map(PathBuf::from)
            .is_some_and(|path| !path.is_file())
        {
            job.video_path = None;
        }
    }
    Ok(jobs)
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
        "@unib:0.0\n@owner:pulsaria\n@mode:media\n@created:{}\n@source:{}\n@title:{}\n@author:{}\n@duration:{}\n@platform:{}\n@upload_date:{}\n@keep_status:{}\n@julia_ready:{}\n@embeddings_count:{}\n@embeddings_dim:384\n@embedding_model:all-MiniLM-L6-v2\n\n{}\n\n[V#media] @video_{}:video > downloaded_from > @source_{}:source ?1.0 !0.8 {{st:confirmed}} ^system.\n",
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

    let semantic_dir = db::data_dir_path().join("semantic");
    fs::create_dir_all(&semantic_dir).map_err(|error| error.to_string())?;

    let mut hasher = DefaultHasher::new();
    trimmed.hash(&mut hasher);
    let path = semantic_dir.join(format!("imported-{:016x}.unib", hasher.finish()));
    fs::write(path, trimmed.as_bytes()).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_download_dir(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = expand_user_path(&path);
    if path.as_os_str().is_empty() {
        return Err("Download directory cannot be empty".to_string());
    }
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    storage::ensure_media_root(&path)
        .map_err(|error| format!("No se pudo preparar el almacenamiento local: {}", error))?;
    std::env::set_var("PULSAR_DOWNLOAD_DIR", &path);
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
    if browser.is_empty() {
        std::env::remove_var("PULSAR_COOKIES_FROM_BROWSER");
    } else {
        std::env::set_var("PULSAR_COOKIES_FROM_BROWSER", &browser);
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
    let serialized = serde_json::to_string(&formats).map_err(|error| error.to_string())?;
    std::env::set_var("PULSAR_FORMATS", &serialized);
    let settings_dir = settings_data_dir();
    fs::create_dir_all(&settings_dir).map_err(|error| error.to_string())?;
    fs::write(settings_dir.join("formats.json"), serialized.as_bytes())
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_formats(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let wc = state.worker_config.read().await;
    Ok(wc.formats.clone())
}

#[tauri::command]
pub async fn set_default_retention(
    retention: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !matches!(retention.as_str(), "keep" | "online") {
        return Err("Retention policy must be 'keep' or 'online'".to_string());
    }
    {
        let mut wc = state.worker_config.write().await;
        wc.retention = retention.clone();
    }
    std::env::set_var("PULSAR_DEFAULT_RETENTION", &retention);
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
        let content = "@unib:0.0\n@source:https://www.tiktok.com/@demo/video/123\n@title:Clase breve\n\n[00:01.250 -> 00:03.500] Primero observa el encuadre.\n[00:04.000 -> 00:06.000] Despu├®s ajusta la luz.\n[V#media] @video_1:video > downloaded_from > @source_1:source ?1.0 !0.8 {st:confirmed} ^system.";
        assert_eq!(
            unib_header_value(content, "title").as_deref(),
            Some("Clase breve")
        );
        assert_eq!(parse_unib_time("00:01.250"), Some(1.25));
        assert_eq!(parse_unib_segments(content).len(), 2);
        assert_eq!(parse_unib_segments(content)[1].1, 4.0);
        assert_eq!(parse_unib_segments(content)[1].3, "Despu├®s ajusta la luz.");
    }

    #[test]
    fn rejects_invalid_unib_time_ranges() {
        assert_eq!(parse_unib_time("00:60.000"), None);
        let content = "[00:03.000 -> 00:02.000] Rango invertido\n[00:00.000 -> 00:01.000] V├ílido";
        let segments = parse_unib_segments(content);
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].3, "V├ílido");
    }
}
