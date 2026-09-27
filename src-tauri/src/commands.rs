//! Tauri IPC Commands
//!
//! All #[tauri::command] handlers extracted from main.rs to reduce
//! the composition root to pure bootstrap logic.

use crate::api::middleware::security::{is_valid_sandbox_url, validate_sandbox_url};
use crate::application::collection_service::{
    connect_tiktok_source as connect_tiktok_source_service, sync_collection_source_by_id,
    update_profile_source_settings as update_profile_source_settings_service,
    ConnectTikTokSourceResult, ProfileSourceSelection, RegisterProfileSourceResult, SourceRules,
    SourceWatchConfig,
};
use crate::application::queue_service::QueueService;
use crate::application::semantic_chunker::SemanticChunker;
use crate::db;
pub use crate::domain::models::{SearchConfig, EMBEDDING_DIMS};
use crate::embedding;
use crate::infrastructure::acceleration;
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
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::sync::Mutex;
#[cfg(windows)]
use windows_sys::Win32::Globalization::GetUserDefaultLocaleName;
#[cfg(windows)]
use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

fn hidden_std_command<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    let mut command = Command::new(program);
    crate::process_control::hide_std_command(&mut command);
    command
}

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
            video_fit: "contain".into(),
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
    pub api_session_token: String,
    pub onnx: Arc<Mutex<Option<embedding::ONNXModelManager>>>,
    pub search: Arc<crate::application::search_service::SearchService>,
    pub config: Arc<Mutex<SearchConfig>>,
    pub metrics: Arc<Mutex<SystemMetrics>>,
    pub worker_config: Arc<tokio::sync::RwLock<WorkerConfig>>,
    pub app_settings: Arc<tokio::sync::RwLock<AppSettingsSnapshot>>,
    pub model_prepare_pid: Arc<Mutex<Option<u32>>>,
    pub local_llm: Arc<crate::infrastructure::local_llm::LocalLlmManager>,
}

#[tauri::command]
pub fn get_api_session_token(state: State<'_, AppState>) -> String {
    state.api_session_token.clone()
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelSetupCheckpoint {
    pub schema_version: u32,
    pub model: String,
    pub revision: Option<String>,
    pub phase: String,
    pub model_path: String,
    pub download_complete: bool,
    pub verified: bool,
    pub prepared: bool,
    pub validated: bool,
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub last_error: Option<LocalModelError>,
    #[serde(default)]
    pub failed_phase: Option<String>,
    pub started_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelError {
    pub code: LocalModelErrorCode,
    pub message: String,
    pub retryable: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum ModelFileStatus {
    Valid,
    Missing,
    SizeMismatch,
    HashMismatch,
}

#[derive(Clone, Debug)]
struct ModelFileInspection {
    relative_path: PathBuf,
    status: ModelFileStatus,
    expected_size: Option<u64>,
    actual_size: Option<u64>,
    expected_sha256: Option<String>,
    actual_sha256: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocalModelErrorCode {
    NetworkError,
    Timeout,
    InsufficientSpace,
    PermissionDenied,
    InvalidPath,
    DownloadFailed,
    VerificationFailed,
    CorruptModel,
    PreparationFailed,
    ValidationFailed,
    ModelAlreadyPreparing,
    ProcessCrashed,
    Cancelled,
    Unknown,
}

impl LocalModelErrorCode {
    fn retryable(&self) -> bool {
        matches!(
            self,
            Self::NetworkError
                | Self::Timeout
                | Self::DownloadFailed
                | Self::VerificationFailed
                | Self::CorruptModel
                | Self::PreparationFailed
                | Self::ValidationFailed
                | Self::ProcessCrashed
                | Self::Cancelled
        )
    }
}

fn classify_local_model_error(phase: &str, message: &str) -> LocalModelError {
    let code = if message.contains("LOCAL_MODEL_PREPARATION_ACTIVE") {
        LocalModelErrorCode::ModelAlreadyPreparing
    } else if message.to_ascii_lowercase().contains("permission") {
        LocalModelErrorCode::PermissionDenied
    } else if message.to_ascii_lowercase().contains("timeout") {
        LocalModelErrorCode::Timeout
    } else if phase == "downloading" {
        LocalModelErrorCode::DownloadFailed
    } else if phase == "verifying" {
        LocalModelErrorCode::VerificationFailed
    } else if phase == "validating" {
        LocalModelErrorCode::ValidationFailed
    } else {
        LocalModelErrorCode::PreparationFailed
    };
    LocalModelError {
        retryable: code.retryable(),
        code,
        message: message.chars().take(300).collect(),
    }
}

fn local_model_checkpoint_path() -> PathBuf {
    settings_data_dir().join("local-model-setup.json")
}

fn persist_local_model_checkpoint(checkpoint: &LocalModelSetupCheckpoint) -> Result<(), String> {
    let directory = settings_data_dir();
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let content = serde_json::to_vec_pretty(checkpoint).map_err(|error| error.to_string())?;
    atomic_write(&local_model_checkpoint_path(), &content)
}

fn load_local_model_checkpoint() -> Option<LocalModelSetupCheckpoint> {
    fs::read(local_model_checkpoint_path())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
}

fn checkpoint_phase(
    model: &str,
    phase: &str,
    download_complete: bool,
    verified: bool,
    prepared: bool,
    validated: bool,
    last_error: Option<LocalModelError>,
    failed_phase: Option<String>,
) -> LocalModelSetupCheckpoint {
    let now = chrono::Utc::now().to_rfc3339();
    LocalModelSetupCheckpoint {
        schema_version: 1,
        model: model.to_string(),
        revision: model_revision(model).map(str::to_string),
        phase: phase.to_string(),
        model_path: whisper_cache_root()
            .join(model)
            .to_string_lossy()
            .to_string(),
        download_complete,
        verified,
        prepared,
        validated,
        downloaded_bytes: None,
        total_bytes: None,
        last_error,
        failed_phase,
        started_at: now.clone(),
        updated_at: now,
    }
}

fn apply_checkpoint_transition(model: &str, phase: &str) -> LocalModelSetupCheckpoint {
    let (download_complete, verified, prepared, validated) = match phase {
        "downloading" => (false, false, false, false),
        "verifying" => (true, false, false, false),
        "preparing" => (true, true, false, false),
        "validating" => (true, true, true, false),
        "ready" => (true, true, true, true),
        _ => (false, false, false, false),
    };
    checkpoint_phase(
        model,
        phase,
        download_complete,
        verified,
        prepared,
        validated,
        None,
        None,
    )
}

fn persist_setup_error(model: &str, failed_phase: &str, error: LocalModelError) {
    let previous = load_local_model_checkpoint();
    let mut checkpoint = previous.unwrap_or_else(|| {
        checkpoint_phase(model, failed_phase, false, false, false, false, None, None)
    });
    checkpoint.model = model.to_string();
    checkpoint.phase = "error".into();
    checkpoint.failed_phase = Some(failed_phase.to_string());
    checkpoint.last_error = Some(error);
    checkpoint.updated_at = chrono::Utc::now().to_rfc3339();
    let _ = persist_local_model_checkpoint(&checkpoint);
}

#[derive(Clone, Debug, Serialize)]
pub struct RuntimeHealth {
    pub model: WhisperModelStatus,
    pub queue_depth: usize,
    pub backpressure_active: bool,
    pub worker_capacity: usize,
    pub idle_workers: usize,
    pub processing_paused: bool,
    pub background_admission_paused: bool,
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

/// Canonical desktop configuration shared by the native shell, frontend and
/// worker runtime. Individual legacy files remain compatibility projections,
/// while this snapshot is the authoritative persisted record.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsSnapshot {
    pub schema_version: u32,
    pub source: String,
    pub locale: String,
    pub theme: String,
    pub download_dir: String,
    pub formats: Vec<String>,
    pub retention: String,
    pub cookies_browser: String,
    pub processing_quality: u8,
    pub processing_profile: String,
    pub whisper_model: String,
    pub device: String,
    pub compute_type: String,
    pub video_fit: String,
    pub storage_intent: String,
    pub quota_bytes: u64,
    pub reserve_bytes: u64,
    pub min_score: f32,
    pub max_results: usize,
    pub similarity_metric: String,
    pub chunk_size: usize,
    pub chunk_overlap: usize,
    pub autostart_enabled: bool,
    #[serde(default = "default_keep_in_tray_on_close")]
    pub keep_in_tray_on_close: bool,
    pub updater_status: String,
    #[serde(default = "default_subtitle_enabled")]
    pub subtitle_enabled: bool,
    #[serde(default = "default_subtitle_style")]
    pub subtitle_style: String,
    #[serde(default = "default_playback_profile")]
    pub playback_profile: String,
    #[serde(default)]
    pub gpu_enhancement_enabled: bool,
    #[serde(default = "default_performance_mode")]
    pub performance_mode: String,
    #[serde(default)]
    pub background_processing: bool,
    #[serde(default)]
    pub start_in_background: bool,
    #[serde(default = "default_idle_threshold_seconds")]
    pub idle_threshold_seconds: u64,
    #[serde(default = "default_ac_only_for_maximum")]
    pub ac_only_for_maximum: bool,
    #[serde(default)]
    pub preferred_adapter_id: Option<String>,
    #[serde(default = "default_analysis_depth")]
    pub analysis_depth: String,
    #[serde(default = "default_performance_profile_version")]
    pub performance_profile_version: u32,
    #[serde(default)]
    pub last_verified_accelerators: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsResponse {
    pub settings: AppSettingsSnapshot,
    pub source: String,
    pub version: u32,
    pub autostart_enabled: bool,
    pub runtime_status: String,
    pub storage: storage::StorageStatus,
    pub updater_status: String,
    pub sync_errors: Vec<String>,
}

/// Versioned legal consent stored beside the canonical native settings.
///
/// Consent is deliberately kept in its own file so that updating the
/// application settings schema cannot accidentally reset or reinterpret a
/// user's legal acknowledgement. A new document version requires a new
/// acknowledgement, while ordinary application updates do not.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegalConsent {
    pub eula_version: String,
    pub terms_version: String,
    pub privacy_version: String,
    pub content_policy_version: String,
    pub accepted_at: Option<String>,
    pub locale: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegalConsentInput {
    pub eula_version: String,
    pub terms_version: String,
    pub privacy_version: String,
    pub content_policy_version: String,
    pub locale: String,
}

const CURRENT_EULA_VERSION: &str = "0.1";
const CURRENT_TERMS_VERSION: &str = "0.1";
const CURRENT_PRIVACY_VERSION: &str = "0.1";
const CURRENT_CONTENT_POLICY_VERSION: &str = "0.1";

const APP_SETTINGS_SCHEMA_VERSION: u32 = 1;

fn default_keep_in_tray_on_close() -> bool {
    true
}
fn default_subtitle_enabled() -> bool {
    true
}
fn default_subtitle_style() -> String {
    "auto".into()
}
fn default_playback_profile() -> String {
    "intelligent".into()
}
fn default_performance_mode() -> String {
    "intelligent".into()
}
fn default_idle_threshold_seconds() -> u64 {
    60
}
fn default_ac_only_for_maximum() -> bool {
    true
}
fn default_analysis_depth() -> String {
    "standard".into()
}
fn default_performance_profile_version() -> u32 {
    1
}
const ALLOWED_FORMATS: &[&str] = &[
    "mp4", "mkv", "webm", "mov", "mp3", "wav", "flac", "ogg", "m4a", "txt", "srt", "vtt", "json",
];

fn detected_system_locale() -> String {
    #[cfg(windows)]
    {
        let mut buffer = [0u16; 85];
        let written = unsafe { GetUserDefaultLocaleName(buffer.as_mut_ptr(), buffer.len() as i32) };
        if written > 1 {
            let locale = String::from_utf16_lossy(&buffer[..(written - 1) as usize]);
            let normalized = locale.to_ascii_lowercase();
            if normalized.starts_with("en") {
                return "en-US".into();
            }
            if normalized.starts_with("es") {
                return "es-MX".into();
            }
        }
    }

    let value = std::env::var("LANG")
        .or_else(|_| std::env::var("LC_ALL"))
        .unwrap_or_default()
        .to_ascii_lowercase();
    if value.starts_with("en") {
        "en-US".into()
    } else {
        "es-MX".into()
    }
}

fn default_app_settings() -> AppSettingsSnapshot {
    let search = SearchConfig::default();
    let processing = ProcessingSettings::default();
    AppSettingsSnapshot {
        schema_version: APP_SETTINGS_SCHEMA_VERSION,
        source: "default".into(),
        locale: detected_system_locale(),
        theme: "chromatic".into(),
        download_dir: default_download_dir().to_string_lossy().to_string(),
        formats: vec!["mp4".into(), "mp3".into(), "txt".into()],
        retention: "keep".into(),
        cookies_browser: String::new(),
        processing_quality: processing.quality,
        processing_profile: processing.profile,
        whisper_model: processing.whisper_model,
        device: processing.device,
        compute_type: processing.compute_type,
        video_fit: processing.video_fit,
        storage_intent: "balanced".into(),
        quota_bytes: 0,
        reserve_bytes: 0,
        min_score: search.min_score,
        max_results: search.max_results,
        similarity_metric: search.similarity_metric,
        chunk_size: search.chunk_size,
        chunk_overlap: search.chunk_overlap,
        // Autostart is opt-in for new installations. A persisted legacy
        // snapshot can still carry the user's previous choice.
        autostart_enabled: false,
        keep_in_tray_on_close: true,
        updater_status: "BLOCKED_EXTERNAL".into(),
        subtitle_enabled: true,
        subtitle_style: "auto".into(),
        playback_profile: "intelligent".into(),
        gpu_enhancement_enabled: false,
        performance_mode: "intelligent".into(),
        background_processing: true,
        start_in_background: false,
        idle_threshold_seconds: 60,
        ac_only_for_maximum: true,
        preferred_adapter_id: None,
        analysis_depth: "standard".into(),
        performance_profile_version: 1,
        last_verified_accelerators: None,
    }
}

fn atomic_write(path: &std::path::Path, contents: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension(format!(
        "{}.{}.tmp",
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("data"),
        std::process::id()
    ));
    fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    if !path.exists() {
        if let Err(error) = fs::rename(&temporary, path) {
            let _ = fs::remove_file(&temporary);
            return Err(error.to_string());
        }
        return Ok(());
    }

    // `rename` does not replace an existing file on Windows. Keep the old
    // value beside the destination while moving the new file into place so a
    // failed replacement can restore the previous configuration.
    let backup = path.with_file_name(format!(
        ".{}.previous",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("settings")
    ));
    if backup.exists() {
        fs::remove_file(&backup).map_err(|error| error.to_string())?;
    }
    fs::rename(path, &backup).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        error.to_string()
    })?;
    match fs::rename(&temporary, path) {
        Ok(()) => {
            let _ = fs::remove_file(&backup);
            Ok(())
        }
        Err(error) => {
            let restore = fs::rename(&backup, path);
            let _ = fs::remove_file(&temporary);
            match restore {
                Ok(()) => Err(error.to_string()),
                Err(restore_error) => Err(format!(
                    "configuration replacement failed: {}; previous value restoration failed: {}",
                    error, restore_error
                )),
            }
        }
    }
}

fn valid_formats(formats: &[String]) -> bool {
    !formats.is_empty()
        && formats
            .iter()
            .all(|format| ALLOWED_FORMATS.contains(&format.to_ascii_lowercase().as_str()))
}

fn validate_app_settings(settings: &AppSettingsSnapshot) -> Result<(), String> {
    if settings.schema_version != APP_SETTINGS_SCHEMA_VERSION {
        return Err("Versión de configuración no compatible".into());
    }
    if !matches!(settings.locale.as_str(), "es-MX" | "en-US") {
        return Err("Idioma no compatible".into());
    }
    if !matches!(
        settings.theme.as_str(),
        "carbon" | "chromatic" | "aurora" | "oled" | "cyberpunk" | "solar"
    ) {
        return Err("Tema no compatible".into());
    }
    if !matches!(settings.retention.as_str(), "keep" | "online") {
        return Err("Retención inválida".into());
    }
    if !settings.cookies_browser.is_empty()
        && !matches!(
            settings.cookies_browser.as_str(),
            "chrome" | "edge" | "firefox"
        )
    {
        return Err("Navegador de sesión inválido".into());
    }
    if !valid_formats(&settings.formats) {
        return Err("La selección de formatos es inválida".into());
    }
    if !(0.0..=1.0).contains(&settings.min_score)
        || settings.max_results == 0
        || settings.chunk_size == 0
        || settings.chunk_overlap >= settings.chunk_size
    {
        return Err("Los parámetros de búsqueda no son válidos".into());
    }
    if !(0..=100).contains(&settings.processing_quality)
        || !matches!(settings.video_fit.as_str(), "cover" | "contain")
    {
        return Err("Los parámetros de procesamiento no son válidos".into());
    }
    if !matches!(
        settings.subtitle_style.as_str(),
        "auto" | "karaoke" | "minimal" | "cinematic"
    ) || !matches!(
        settings.playback_profile.as_str(),
        "efficient" | "intelligent" | "maximum" | "gpu-experimental"
    ) {
        return Err("La configuración de reproducción no es válida".into());
    }
    if !matches!(
        settings.performance_mode.as_str(),
        "intelligent" | "efficient" | "maximum"
    ) || !(15..=86_400).contains(&settings.idle_threshold_seconds)
        || !matches!(settings.analysis_depth.as_str(), "standard" | "deep")
    {
        return Err("La política de rendimiento no es válida".into());
    }
    if storage::SetupIntent::parse(&settings.storage_intent).is_none() {
        return Err("La intención de almacenamiento no es válida".into());
    }
    if settings.download_dir.trim().is_empty() {
        return Err("Selecciona una carpeta de guardado".into());
    }
    Ok(())
}

fn snapshot_search_config(settings: &AppSettingsSnapshot) -> SearchConfig {
    SearchConfig {
        min_score: settings.min_score,
        max_results: settings.max_results,
        similarity_metric: settings.similarity_metric.clone(),
        chunk_size: settings.chunk_size,
        chunk_overlap: settings.chunk_overlap,
    }
}

pub fn snapshot_processing_settings(settings: &AppSettingsSnapshot) -> ProcessingSettings {
    ProcessingSettings {
        quality: settings.processing_quality,
        profile: settings.processing_profile.clone(),
        whisper_model: settings.whisper_model.clone(),
        device: settings.device.clone(),
        compute_type: settings.compute_type.clone(),
        video_fit: settings.video_fit.clone(),
        configured: true,
    }
}

fn has_verified_acceleration(serialized: Option<&str>, names: &[&str]) -> bool {
    let Some(serialized) = serialized else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(serialized) else {
        return false;
    };
    let persisted_manifest = value
        .get("status")
        .and_then(|status| status.get("runtimeManifestSha256"))
        .and_then(serde_json::Value::as_str);
    if persisted_manifest != acceleration::runtime_manifest_sha256().as_deref() {
        return false;
    }
    value
        .get("results")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .any(|result| {
            result.get("state").and_then(serde_json::Value::as_str) == Some("verified")
                && result
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .map(|name| names.contains(&name))
                    .unwrap_or(false)
        })
}

pub fn apply_app_settings_environment(settings: &AppSettingsSnapshot) {
    std::env::set_var("PULSAR_DOWNLOAD_DIR", &settings.download_dir);
    std::env::set_var("PULSAR_DEFAULT_RETENTION", &settings.retention);
    std::env::set_var("PULSAR_SETUP_INTENT", &settings.storage_intent);
    std::env::set_var("PULSAR_MEDIA_QUOTA_BYTES", settings.quota_bytes.to_string());
    std::env::set_var(
        "PULSAR_MEDIA_RESERVE_BYTES",
        settings.reserve_bytes.to_string(),
    );
    if let Ok(serialized) = serde_json::to_string(&settings.formats) {
        std::env::set_var("PULSAR_FORMATS", serialized);
    }
    if settings.cookies_browser.is_empty() {
        std::env::remove_var("PULSAR_COOKIES_FROM_BROWSER");
    } else {
        std::env::set_var("PULSAR_COOKIES_FROM_BROWSER", &settings.cookies_browser);
    }
    std::env::set_var("PULSAR_PERFORMANCE_MODE", &settings.performance_mode);
    std::env::set_var(
        "PULSAR_BACKGROUND_PROCESSING",
        settings.background_processing.to_string(),
    );
    std::env::set_var(
        "PULSAR_IDLE_THRESHOLD_SECONDS",
        settings.idle_threshold_seconds.to_string(),
    );
    let nvenc_verified = has_verified_acceleration(
        settings.last_verified_accelerators.as_deref(),
        &["ffmpeg_nvenc_encode"],
    );
    let nvdec_verified = has_verified_acceleration(
        settings.last_verified_accelerators.as_deref(),
        &["ffmpeg_nvdec_decode"],
    );
    let whisper_cuda_verified = has_verified_acceleration(
        settings.last_verified_accelerators.as_deref(),
        &["whisper_cuda_probe"],
    );
    std::env::set_var(
        "PULSAR_FFMPEG_VIDEO_ENCODER",
        if nvenc_verified { "nvenc" } else { "cpu" },
    );
    std::env::set_var(
        "PULSAR_WHISPER_CUDA_VERIFIED",
        whisper_cuda_verified.to_string(),
    );
    std::env::set_var(
        "PULSAR_FFMPEG_HWACCEL",
        if nvdec_verified { "nvdec" } else { "cpu" },
    );
    apply_processing_environment(&snapshot_processing_settings(settings));
}

fn persist_app_settings(settings: &AppSettingsSnapshot) -> Result<(), String> {
    validate_app_settings(settings)?;
    let directory = settings_data_dir();
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let serialized = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    atomic_write(&directory.join("app-settings.json"), &serialized)?;
    // Keep the historical projections readable by older builds and recovery
    // tools. The canonical file is written first and remains authoritative.
    atomic_write(
        &directory.join("download_dir.txt"),
        settings.download_dir.as_bytes(),
    )?;
    atomic_write(
        &directory.join("retention.txt"),
        settings.retention.as_bytes(),
    )?;
    atomic_write(
        &directory.join("cookie_browser.txt"),
        settings.cookies_browser.as_bytes(),
    )?;
    atomic_write(
        &directory.join("formats.json"),
        &serde_json::to_vec_pretty(&settings.formats).map_err(|error| error.to_string())?,
    )?;
    atomic_write(
        &directory.join("search_config.json"),
        &serde_json::to_vec_pretty(&snapshot_search_config(settings))
            .map_err(|error| error.to_string())?,
    )?;
    atomic_write(
        &directory.join("processing_settings.json"),
        &serde_json::to_vec_pretty(&snapshot_processing_settings(settings))
            .map_err(|error| error.to_string())?,
    )?;
    atomic_write(
        &directory.join("intent.txt"),
        settings.storage_intent.as_bytes(),
    )?;
    atomic_write(
        &directory.join("quota_bytes.txt"),
        settings.quota_bytes.to_string().as_bytes(),
    )?;
    atomic_write(
        &directory.join("reserve_bytes.txt"),
        settings.reserve_bytes.to_string().as_bytes(),
    )?;
    Ok(())
}

fn normalize_legacy_acceleration_settings(settings: &mut AppSettingsSnapshot) {
    settings.gpu_enhancement_enabled = false;
    if settings.playback_profile == "gpu-experimental" {
        settings.playback_profile = "intelligent".into();
        settings.performance_mode = "intelligent".into();
    }
    if settings.performance_mode.is_empty() {
        settings.performance_mode = default_performance_mode();
    }
    if settings.idle_threshold_seconds == 0 {
        settings.idle_threshold_seconds = default_idle_threshold_seconds();
    }
    if settings.analysis_depth.is_empty() {
        settings.analysis_depth = default_analysis_depth();
    }
    if settings.performance_profile_version == 0 {
        settings.performance_profile_version = default_performance_profile_version();
    }
}

pub fn load_persisted_app_settings() -> AppSettingsSnapshot {
    let canonical = settings_data_dir().join("app-settings.json");
    if let Ok(contents) = fs::read_to_string(&canonical) {
        if let Ok(mut settings) = serde_json::from_str::<AppSettingsSnapshot>(&contents) {
            normalize_legacy_acceleration_settings(&mut settings);
            if validate_app_settings(&settings).is_ok() {
                settings.source = "native".into();
                apply_app_settings_environment(&settings);
                return settings;
            }
        }
    }

    // Read the legacy projections once, then immediately expose the merged
    // result through the canonical file on the next successful save.
    load_persisted_download_dir();
    load_persisted_cookie_browser();
    load_persisted_retention();
    load_persisted_formats();
    load_persisted_storage_settings();
    let processing = load_persisted_processing_settings();
    let search = load_persisted_search_config();
    let mut settings = default_app_settings();
    settings.source = if settings_data_dir()
        .read_dir()
        .ok()
        .into_iter()
        .flatten()
        .next()
        .is_some()
    {
        "migrated".into()
    } else {
        "default".into()
    };
    settings.download_dir =
        std::env::var("PULSAR_DOWNLOAD_DIR").unwrap_or_else(|_| settings.download_dir.clone());
    settings.cookies_browser = std::env::var("PULSAR_COOKIES_FROM_BROWSER").unwrap_or_default();
    settings.retention =
        std::env::var("PULSAR_DEFAULT_RETENTION").unwrap_or_else(|_| settings.retention.clone());
    settings.formats = std::env::var("PULSAR_FORMATS")
        .ok()
        .and_then(|value| serde_json::from_str(&value).ok())
        .filter(|formats: &Vec<String>| valid_formats(formats))
        .unwrap_or(settings.formats);
    settings.storage_intent =
        std::env::var("PULSAR_SETUP_INTENT").unwrap_or_else(|_| settings.storage_intent.clone());
    settings.quota_bytes = std::env::var("PULSAR_MEDIA_QUOTA_BYTES")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or_default();
    settings.reserve_bytes = std::env::var("PULSAR_MEDIA_RESERVE_BYTES")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or_default();
    settings.processing_quality = processing.quality;
    settings.processing_profile = processing.profile;
    settings.whisper_model = processing.whisper_model;
    settings.device = processing.device;
    settings.compute_type = processing.compute_type;
    settings.video_fit = processing.video_fit;
    settings.min_score = search.min_score;
    settings.max_results = search.max_results;
    settings.similarity_metric = search.similarity_metric;
    settings.chunk_size = search.chunk_size;
    settings.chunk_overlap = search.chunk_overlap;
    apply_app_settings_environment(&settings);
    settings
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct SystemMetrics {
    pub average_query_time_ms: f32,
    pub average_onnx_time_ms: f32,
    pub average_db_time_ms: f32,
    pub model_load_time_ms: f32,
    pub total_queries_run: u64,
    #[serde(default)]
    pub first_frame_time_ms: Option<f32>,
    #[serde(default)]
    pub transcription_seconds_per_audio_minute: Option<f32>,
    #[serde(default)]
    pub llm_tokens_per_second: Option<f32>,
    #[serde(default)]
    pub queue_throughput_per_minute: Option<f32>,
    #[serde(default)]
    pub active_backends: Vec<String>,
    #[serde(default)]
    pub max_vram_bytes: Option<u64>,
    #[serde(default)]
    pub fallbacks_count: u64,
    #[serde(default)]
    pub last_benchmark_at: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TranscriptWord {
    pub word: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TranscriptChunk {
    pub chunk_index: i64,
    pub chunk_text: String,
    pub start: f64,
    pub end: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<TranscriptWord>>,
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
    let output = hidden_std_command("nvidia-smi")
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
    let root = crate::runtime::path("python/Lib/site-packages");
    let mut has_cudnn = false;
    let mut has_cublas = false;
    let mut has_cudart = false;
    let mut directories = vec![root];
    while let Some(directory) = directories.pop() {
        let Ok(entries) = fs::read_dir(directory) else {
            continue;
        };
        for file in entries.flatten() {
            if file.path().is_dir() {
                directories.push(file.path());
                continue;
            }
            let name = file.file_name().to_string_lossy().to_ascii_lowercase();
            has_cudnn |= name.starts_with("cudnn") && name.ends_with(".dll");
            has_cublas |= name.starts_with("cublas") && name.ends_with(".dll");
            has_cudart |= name.starts_with("cudart") && name.ends_with(".dll");
        }
    }
    has_cudnn && has_cublas && has_cudart
}

fn ctranslate2_cuda_device_count() -> Option<u32> {
    let python = crate::runtime::python_executable();
    if !python.is_file() {
        return None;
    }
    let output = hidden_std_command(python)
        .args([
            "-c",
            "import ctranslate2; print(ctranslate2.get_cuda_device_count())",
        ])
        .output()
        .ok()?;
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(|line| line.trim().parse::<u32>().ok())
}

fn detect_hardware_profile() -> HardwareProfile {
    let (gpu_name, vram_bytes) = gpu_probe();
    let whisper_gpu_supported = gpu_name.is_some()
        && bundled_cuda_runtime_exists()
        && ctranslate2_cuda_device_count().unwrap_or(0) > 0
        && std::env::var("PULSAR_WHISPER_CUDA_VERIFIED")
            .ok()
            .as_deref()
            == Some("true");
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

fn apply_performance_mode_to_processing(
    settings: &AppSettingsSnapshot,
    mut processing: ProcessingSettings,
) -> ProcessingSettings {
    if settings.performance_mode == "maximum"
        && (has_verified_acceleration(
            settings.last_verified_accelerators.as_deref(),
            &["whisper_cuda_probe"],
        ) || detect_hardware_profile().whisper_gpu_supported)
    {
        processing.device = "cuda".into();
        processing.compute_type = if settings.processing_quality >= 72 {
            "float16".into()
        } else {
            "int8_float16".into()
        };
    } else {
        processing.device = "cpu".into();
        processing.compute_type = "int8".into();
    }
    processing
}

#[tauri::command]
pub fn get_hardware_profile() -> HardwareProfile {
    detect_hardware_profile()
}

pub(crate) fn merge_persisted_acceleration_verification(
    status: &mut acceleration::AccelerationStatus,
    serialized: Option<&str>,
) {
    let Some(serialized) = serialized else { return };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(serialized) else {
        return;
    };
    let persisted_manifest = value
        .get("status")
        .and_then(|status| status.get("runtimeManifestSha256"))
        .and_then(serde_json::Value::as_str);
    if persisted_manifest != status.runtime_manifest_sha256.as_deref() {
        return;
    }
    let Some(results) = value.get("results").and_then(serde_json::Value::as_array) else {
        return;
    };
    for result in results {
        if result.get("state").and_then(serde_json::Value::as_str) != Some("verified") {
            continue;
        }
        let Some(result_name) = result.get("name").and_then(serde_json::Value::as_str) else {
            continue;
        };
        let capability_name = match result_name {
            "whisper_cuda_probe" => "whisper_cuda",
            "ffmpeg_nvenc_encode" | "ffmpeg_nvdec_decode" => "ffmpeg_nvdec_nvenc",
            "llama_cuda_devices" => "llm_cuda",
            _ => continue,
        };
        if let Some(capability) = status
            .capabilities
            .iter_mut()
            .find(|capability| capability.name == capability_name)
        {
            capability.state = acceleration::CapabilityState::Verified;
            capability.reason = result
                .get("detail")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            capability.measured_ms = result
                .get("durationMs")
                .and_then(serde_json::Value::as_u64)
                .map(u128::from);
        }
    }
}

pub(crate) fn mark_active_accelerators(
    status: &mut acceleration::AccelerationStatus,
    settings: &AppSettingsSnapshot,
) {
    let whisper_active = settings.device == "cuda"
        && status.capabilities.iter().any(|capability| {
            capability.name == "whisper_cuda"
                && matches!(
                    capability.state,
                    acceleration::CapabilityState::Verified | acceleration::CapabilityState::Active
                )
        });
    let nvenc_active = std::env::var("PULSAR_FFMPEG_VIDEO_ENCODER").ok().as_deref()
        == Some("nvenc")
        && status.capabilities.iter().any(|capability| {
            capability.name == "ffmpeg_nvdec_nvenc"
                && matches!(
                    capability.state,
                    acceleration::CapabilityState::Verified | acceleration::CapabilityState::Active
                )
        });
    for capability in &mut status.capabilities {
        if (capability.name == "whisper_cuda" && whisper_active)
            || (capability.name == "ffmpeg_nvdec_nvenc" && nvenc_active)
        {
            capability.state = acceleration::CapabilityState::Active;
            capability.reason =
                Some("La política actual está usando este backend verificado.".into());
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformancePolicyInput {
    pub mode: String,
    #[serde(default)]
    pub background_processing: Option<bool>,
    #[serde(default)]
    pub start_in_background: Option<bool>,
    #[serde(default)]
    pub idle_threshold_seconds: Option<u64>,
    #[serde(default)]
    pub ac_only_for_maximum: Option<bool>,
    #[serde(default)]
    pub preferred_adapter_id: Option<String>,
    #[serde(default)]
    pub analysis_depth: Option<String>,
}

#[tauri::command]
pub async fn get_acceleration_status(
    state: State<'_, AppState>,
) -> Result<acceleration::AccelerationStatus, String> {
    let settings = state.app_settings.read().await.clone();
    let mut status = acceleration::probe(
        &settings.performance_mode,
        settings.preferred_adapter_id.as_deref(),
    );
    merge_persisted_acceleration_verification(
        &mut status,
        settings.last_verified_accelerators.as_deref(),
    );
    mark_active_accelerators(&mut status, &settings);
    Ok(status)
}

#[tauri::command]
pub async fn get_performance_policy(
    state: State<'_, AppState>,
) -> Result<acceleration::PerformancePolicy, String> {
    let settings = state.app_settings.read().await.clone();
    let mut status = acceleration::probe(
        &settings.performance_mode,
        settings.preferred_adapter_id.as_deref(),
    );
    merge_persisted_acceleration_verification(
        &mut status,
        settings.last_verified_accelerators.as_deref(),
    );
    mark_active_accelerators(&mut status, &settings);
    Ok(acceleration::performance_policy(
        &settings.performance_mode,
        settings.background_processing,
        settings.ac_only_for_maximum,
        settings.idle_threshold_seconds,
        &status,
    ))
}

#[tauri::command]
pub async fn set_performance_policy(
    input: PerformancePolicyInput,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<acceleration::PerformancePolicy, String> {
    let mut next = state.app_settings.read().await.clone();
    next.performance_mode = input.mode;
    if let Some(value) = input.background_processing {
        next.background_processing = value;
    }
    if let Some(value) = input.start_in_background {
        next.start_in_background = value;
    }
    if let Some(value) = input.idle_threshold_seconds {
        next.idle_threshold_seconds = value;
    }
    if let Some(value) = input.ac_only_for_maximum {
        next.ac_only_for_maximum = value;
    }
    next.preferred_adapter_id = input.preferred_adapter_id;
    if let Some(value) = input.analysis_depth {
        next.analysis_depth = value;
    }
    next.playback_profile = next.performance_mode.clone();
    let current_processing = snapshot_processing_settings(&next);
    let effective_processing = apply_performance_mode_to_processing(&next, current_processing);
    next.device = effective_processing.device;
    next.compute_type = effective_processing.compute_type;
    next.source = "native".into();
    validate_app_settings(&next)?;
    persist_app_settings(&next)?;
    apply_app_settings_environment(&next);
    *state.app_settings.write().await = next.clone();
    let mut status =
        acceleration::probe(&next.performance_mode, next.preferred_adapter_id.as_deref());
    merge_persisted_acceleration_verification(
        &mut status,
        next.last_verified_accelerators.as_deref(),
    );
    mark_active_accelerators(&mut status, &next);
    let policy = acceleration::performance_policy(
        &next.performance_mode,
        next.background_processing,
        next.ac_only_for_maximum,
        next.idle_threshold_seconds,
        &status,
    );
    state
        .queue
        .set_background_admission_paused(!policy.background_allowed);
    let _ = app_handle.emit("acceleration-status-changed", &status);
    Ok(policy)
}

#[tauri::command]
pub async fn run_acceleration_benchmark(
    sample_path: Option<String>,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<acceleration::AccelerationBenchmark, String> {
    let settings = state.app_settings.read().await.clone();
    let mode = settings.performance_mode.clone();
    let preferred_adapter_id = settings.preferred_adapter_id.clone();
    let mut report = tokio::task::spawn_blocking(move || {
        acceleration::benchmark(
            &mode,
            preferred_adapter_id.as_deref(),
            sample_path.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("No se pudo completar el benchmark de aceleración: {error}"))?;

    for result in &report.results {
        let capability_name = match result.name.as_str() {
            "whisper_cuda_probe" => Some("whisper_cuda"),
            "ffmpeg_nvenc_encode" | "ffmpeg_nvdec_decode" => Some("ffmpeg_nvdec_nvenc"),
            "llama_cuda_devices" => Some("llm_cuda"),
            _ => None,
        };
        if let Some(name) = capability_name {
            if let Some(capability) = report
                .status
                .capabilities
                .iter_mut()
                .find(|capability| capability.name == name)
            {
                capability.measured_ms = Some(result.duration_ms);
                if matches!(result.state, acceleration::CapabilityState::Verified) {
                    capability.state = acceleration::CapabilityState::Verified;
                    capability.reason = Some(result.detail.clone());
                }
            }
        }
    }

    let mut next = settings;
    next.last_verified_accelerators = Some(
        serde_json::to_string(&report)
            .map_err(|error| format!("No se pudo guardar el resultado del benchmark: {error}"))?,
    );
    persist_app_settings(&next)?;
    apply_app_settings_environment(&next);
    mark_active_accelerators(&mut report.status, &next);
    *state.app_settings.write().await = next;
    let _ = app_handle.emit("acceleration-status-changed", &report.status);
    Ok(report)
}

#[tauri::command]
pub async fn reset_performance_profile(state: State<'_, AppState>) -> Result<(), String> {
    let mut next = state.app_settings.read().await.clone();
    next.last_verified_accelerators = None;
    next.performance_profile_version = next.performance_profile_version.saturating_add(1).max(1);
    persist_app_settings(&next)?;
    apply_app_settings_environment(&next);
    *state.app_settings.write().await = next;
    Ok(())
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

fn runtime_executable_check(
    name: &str,
    relative_path: &str,
    probe_args: &[&str],
    required: bool,
) -> RuntimeResourceCheck {
    let mut check = runtime_check(name, &[relative_path], required);
    if !check.available {
        return check;
    }

    let executable = PathBuf::from(&check.path);
    match hidden_std_command(&executable).args(probe_args).output() {
        Ok(output) if output.status.success() => {
            check.message = format!("Ejecutable disponible y responde a {:?}", probe_args);
        }
        Ok(output) => {
            check.available = false;
            check.message = format!(
                "El ejecutable terminó con código {:?}; revisa la ruta empaquetada y la salida del runtime",
                output.status.code()
            );
        }
        Err(error) => {
            check.available = false;
            check.message = format!(
                "No se pudo ejecutar {}: {}; revisa la ruta y los permisos del recurso",
                executable.display(),
                error
            );
        }
    }
    check
}

const REQUIRED_PYTHON_WORKERS: &[&str] = &[
    "main.py",
    "downloader.py",
    "events.py",
    "models.py",
    "transcriber.py",
    "visual_analyzer.py",
    "audio_extractor.py",
    "daemon.py",
    "embed_query.py",
    "export_onnx.py",
    "export_onnx_embeddings.py",
    "prepare_whisper_model.py",
    "output_generator.py",
    "source_scanner.py",
    "profile_metadata.py",
    "process_utils.py",
];

fn runtime_worker_check() -> RuntimeResourceCheck {
    let missing = REQUIRED_PYTHON_WORKERS
        .iter()
        .filter(|name| !crate::runtime::worker_script(name).is_file())
        .copied()
        .collect::<Vec<_>>();
    RuntimeResourceCheck {
        name: "Workers Python".to_string(),
        path: crate::runtime::worker_script("main.py")
            .to_string_lossy()
            .to_string(),
        required: true,
        available: missing.is_empty(),
        message: if missing.is_empty() {
            format!(
                "{} archivos de worker encontrados",
                REQUIRED_PYTHON_WORKERS.len()
            )
        } else {
            format!("Faltan archivos Workers Python: {}", missing.join(", "))
        },
    }
}

fn runtime_manifest_check() -> RuntimeResourceCheck {
    let path = crate::runtime::path("runtime-manifest.json");
    let mut check = RuntimeResourceCheck {
        name: "Manifiesto de runtime".to_string(),
        path: path.to_string_lossy().to_string(),
        required: true,
        available: path.is_file(),
        message: if path.is_file() {
            "Manifiesto encontrado".to_string()
        } else {
            "Falta runtime-manifest.json en la raíz de recursos instalada".to_string()
        },
    };
    if !check.available {
        return check;
    }

    let contents = match fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(error) => {
            check.available = false;
            check.message = format!("No se pudo leer el manifiesto: {error}");
            return check;
        }
    };
    let manifest: serde_json::Value = match serde_json::from_str(&contents) {
        Ok(manifest) => manifest,
        Err(error) => {
            check.available = false;
            check.message = format!("Manifiesto JSON incorrecto: {error}");
            return check;
        }
    };

    if manifest
        .get("manifestKind")
        .and_then(serde_json::Value::as_str)
        != Some("pulsaria-runtime-resources")
        || manifest.get("platform").and_then(serde_json::Value::as_str) != Some("windows-x86_64")
        || manifest.get("version").and_then(serde_json::Value::as_str)
            != Some(env!("CARGO_PKG_VERSION"))
        || manifest
            .pointer("/contract/status")
            .and_then(serde_json::Value::as_str)
            != Some("PASS")
    {
        check.available = false;
        check.message = "Manifiesto incorrecto: tipo, plataforma, versión o estado de contrato no coincide con este paquete"
            .to_string();
        return check;
    }

    let records = manifest
        .get("components")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|component| component.get("files").and_then(serde_json::Value::as_array))
        .flatten()
        .collect::<Vec<_>>();
    let undeclared = REQUIRED_PYTHON_WORKERS
        .iter()
        .filter(|worker| {
            let expected_path = format!("python-workers/{worker}");
            !records.iter().any(|record| {
                record.get("path").and_then(serde_json::Value::as_str)
                    == Some(expected_path.as_str())
                    && record.get("required").and_then(serde_json::Value::as_bool) == Some(true)
                    && record.get("status").and_then(serde_json::Value::as_str) == Some("present")
            })
        })
        .copied()
        .collect::<Vec<_>>();
    if !undeclared.is_empty() {
        check.available = false;
        check.message = format!(
            "Manifiesto incorrecto: faltan las declaraciones requeridas para Workers Python: {}",
            undeclared.join(", ")
        );
    } else {
        check.message = format!(
            "Manifiesto válido para Pulsaria {} y {} workers",
            env!("CARGO_PKG_VERSION"),
            REQUIRED_PYTHON_WORKERS.len()
        );
    }
    check
}

fn probe_worker_imports(check: &mut RuntimeResourceCheck) {
    if !check.available {
        return;
    }
    let Some(python) = first_resource_path(&["python/python.exe"]) else {
        check.available = false;
        check.message = "No se encontró python.exe dentro de la raíz canónica del runtime para probar los workers"
            .to_string();
        return;
    };
    let worker_dir = crate::runtime::worker_script("main.py")
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| crate::runtime::root().join("python-workers"));
    let probe = hidden_std_command(&python)
        .current_dir(worker_dir)
        .args(["-c", "import main"])
        .output();
    match probe {
        Ok(output) if output.status.success() => {
            check.message = "Workers Python encontrados y sus imports responden".to_string();
        }
        Ok(output) => {
            check.available = false;
            let detail = String::from_utf8_lossy(&output.stderr);
            check.message = format!(
                "Los imports de workers Python fallaron: {}",
                detail.lines().next().unwrap_or("error desconocido")
            );
        }
        Err(error) => {
            check.available = false;
            check.message = format!("No se pudieron probar los imports Python: {error}");
        }
    }
}

#[tauri::command]
pub fn get_runtime_preflight() -> RuntimePreflight {
    let mut resources = vec![
        runtime_executable_check("Python embebido", "python/python.exe", &["--version"], true),
        runtime_worker_check(),
        runtime_executable_check("FFmpeg", "bin/ffmpeg.exe", &["-version"], true),
        runtime_executable_check("ffprobe", "bin/ffprobe.exe", &["-version"], true),
        runtime_check(
            "ONNX MiniLM",
            &["assets/models/all-MiniLM-L6-v2/model.onnx"],
            true,
        ),
        runtime_check(
            "Tokenizer MiniLM",
            &["assets/models/all-MiniLM-L6-v2/tokenizer.json"],
            true,
        ),
        runtime_check(
            "Whisper tiny",
            &["assets/models/models--Systran--faster-whisper-tiny"],
            true,
        ),
        runtime_manifest_check(),
    ];
    if let Some(workers) = resources
        .iter_mut()
        .find(|resource| resource.name == "Workers Python")
    {
        probe_worker_imports(workers);
    }
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
            "Runtime local incompleto; revisa el detalle de estos recursos: {}.",
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
pub fn get_embedding_index_status(
    state: State<'_, AppState>,
) -> Result<db::EmbeddingIndexStatus, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_embedding_index_status(&connection, &resolve_model_dir())
}

#[tauri::command]
pub async fn get_storage_status(
    path: Option<String>,
    quota_bytes: Option<u64>,
    state: State<'_, AppState>,
) -> Result<storage::StorageStatus, String> {
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
    if !root.exists() {
        fs::create_dir_all(&root)
            .map_err(|error| format!("No se pudo preparar la carpeta de medios: {}", error))?;
    }
    storage::ensure_media_root(&root).map_err(|error| error.to_string())?;
    let configured = state.worker_config.read().await;
    let configured_quota = configured.quota_bytes;
    let configured_reserve = configured.reserve_bytes;
    drop(configured);
    Ok(storage::storage_status(
        &root,
        quota_bytes.unwrap_or(if configured_quota > 0 {
            configured_quota
        } else {
            storage::configured_quota_bytes()
        }),
        if configured_reserve > 0 {
            Some(configured_reserve)
        } else {
            storage::configured_reserve_bytes()
        },
    ))
}

#[tauri::command]
pub async fn reconcile_storage(
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<db::StorageReconciliationReport, String> {
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
    db::reconcile_storage(&db, &root).map_err(|error| error.to_string())
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
pub async fn get_generated_outputs(
    job_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<db::GeneratedOutputRecord>, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_generated_outputs(&connection, job_id).map_err(|error| error.to_string())
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

fn inspect_model_files(model: &str) -> Vec<ModelFileInspection> {
    let directory = whisper_cache_root().join(model);
    let manifest_path = directory.join("pulsaria-model-manifest.json");
    let manifest = fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok());
    [
        "config.json",
        "model.bin",
        "tokenizer.json",
        "vocabulary.txt",
    ]
    .into_iter()
    .map(|name| {
        let entry = manifest
            .as_ref()
            .and_then(|value| value.get("files"))
            .and_then(|files| files.get(name));
        let expected_size = entry
            .and_then(|value| value.get("size"))
            .and_then(|value| value.as_u64());
        let expected_sha256 = entry
            .and_then(|value| value.get("sha256"))
            .and_then(|value| value.as_str())
            .map(str::to_string);
        let path = directory.join(name);
        let metadata = fs::metadata(&path).ok();
        let actual_size = metadata.as_ref().map(|value| value.len());
        let actual_sha256 = actual_size.and_then(|_| {
            fs::File::open(&path).ok().and_then(|mut file| {
                let mut hasher = Sha256::new();
                let mut buffer = vec![0_u8; 1024 * 1024];
                loop {
                    let read = file.read(&mut buffer).ok()?;
                    if read == 0 {
                        break;
                    }
                    hasher.update(&buffer[..read]);
                }
                Some(format!("{:x}", hasher.finalize()))
            })
        });
        let status = if actual_size.is_none() {
            ModelFileStatus::Missing
        } else if expected_size != actual_size {
            ModelFileStatus::SizeMismatch
        } else if expected_sha256.as_deref() != actual_sha256.as_deref() {
            ModelFileStatus::HashMismatch
        } else {
            ModelFileStatus::Valid
        };
        ModelFileInspection {
            relative_path: PathBuf::from(name),
            status,
            expected_size,
            actual_size,
            expected_sha256,
            actual_sha256,
        }
    })
    .collect()
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
pub async fn get_local_model_state(model: String) -> Result<serde_json::Value, String> {
    reconcile_local_model_state(&model)
}

fn reconcile_local_model_state(model: &str) -> Result<serde_json::Value, String> {
    model_revision(model).ok_or_else(|| "Modelo Whisper no soportado".to_string())?;
    let status = inspect_whisper_model(model);
    let checkpoint = load_local_model_checkpoint().filter(|value| value.model == model);
    if status.ready {
        let checkpoint = checkpoint_phase(model, "ready", true, true, true, true, None, None);
        let _ = persist_local_model_checkpoint(&checkpoint);
        return Ok(serde_json::json!({"phase":"ready","model":model,"progress":1.0,"error":null}));
    }
    let Some(checkpoint) = checkpoint else {
        return Ok(serde_json::json!({"phase":"idle","model":model,"progress":0.0,"error":null}));
    };
    if checkpoint.phase == "error" {
        return Ok(serde_json::json!({
            "phase": "error",
            "model": model,
            "progress": null,
            "downloadedBytes": checkpoint.downloaded_bytes,
            "totalBytes": checkpoint.total_bytes,
            "failedPhase": checkpoint.failed_phase,
            "error": checkpoint.last_error,
        }));
    }
    let phase = if checkpoint.phase == "downloading" && !checkpoint.download_complete {
        "downloading"
    } else if checkpoint.download_complete && !checkpoint.verified {
        "verifying"
    } else if checkpoint.verified && !checkpoint.prepared {
        "preparing"
    } else if checkpoint.prepared && !checkpoint.validated {
        "validating"
    } else {
        "error"
    };
    if phase == "error" {
        return Ok(
            serde_json::json!({"phase":"error","model":model,"progress":0.0,"failedPhase":checkpoint.failed_phase,"error":checkpoint.last_error}),
        );
    }
    Ok(
        serde_json::json!({"phase":phase,"model":model,"progress":null,"error":checkpoint.last_error}),
    )
    /*
    if !status.ready {
        if let Some(checkpoint) = load_local_model_checkpoint().filter(|value| value.model == model)
        {
            return Ok(serde_json::json!({
                "phase": checkpoint.phase,
                "model": model,
                "progress": null,
                "downloadedBytes": checkpoint.downloaded_bytes,
                "totalBytes": checkpoint.total_bytes,
                "error": checkpoint.last_error,
            }));
        }
    }
    let phase = if status.ready { "ready" } else { "error" };
    let error = if status.ready {
        serde_json::Value::Null
    } else {
        serde_json::json!({
            "code": "corrupt_model",
            "message": status.message.clone().unwrap_or_else(|| "El modelo local no superó la verificación.".into()),
            "retryable": true,
        })
    };
    Ok(serde_json::json!({
        "phase": phase,
        "model": model,
        "progress": if status.ready { 1.0 } else { 0.0 },
        "message": status.message,
        "error": error,
    }))*/
}

#[tauri::command]
pub async fn get_whisper_model_status(model: String) -> Result<WhisperModelStatus, String> {
    model_revision(&model).ok_or_else(|| "Modelo Whisper no soportado".to_string())?;
    Ok(inspect_whisper_model(&model))
}

#[tauri::command]
pub async fn prepare_whisper_model(
    model: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<WhisperModelStatus, String> {
    run_prepare_whisper_model(model, app_handle, state, false, "downloading").await
}

async fn run_prepare_whisper_model(
    model: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    repair: bool,
    start_phase: &str,
) -> Result<WhisperModelStatus, String> {
    model_revision(&model).ok_or_else(|| "Modelo Whisper no soportado".to_string())?;
    if inspect_whisper_model(&model).ready {
        return Ok(inspect_whisper_model(&model));
    }
    {
        let active_pid = state.model_prepare_pid.lock().await;
        if active_pid.is_some() {
            persist_setup_error(
                &model,
                "preparing",
                classify_local_model_error(
                    "preparing",
                    "LOCAL_MODEL_PREPARATION_ACTIVE: Ya hay una preparación de modelo en curso",
                ),
            );
            return Err(
                "LOCAL_MODEL_PREPARATION_ACTIVE: Ya hay una preparación de modelo en curso".into(),
            );
        }
    }
    let now = chrono::Utc::now().to_rfc3339();
    let initial_phase = if repair { "downloading" } else { start_phase };
    let _ = persist_local_model_checkpoint(&LocalModelSetupCheckpoint {
        schema_version: 1,
        model: model.clone(),
        revision: model_revision(&model).map(str::to_string),
        phase: initial_phase.into(),
        model_path: whisper_cache_root()
            .join(&model)
            .to_string_lossy()
            .to_string(),
        download_complete: false,
        verified: false,
        prepared: false,
        validated: false,
        downloaded_bytes: None,
        total_bytes: None,
        last_error: None,
        failed_phase: None,
        started_at: now.clone(),
        updated_at: now,
    });
    let mut command = tokio::process::Command::new(resolve_python_runtime());
    command
        .arg(resolve_model_preparer())
        .arg("--model")
        .arg(&model)
        .arg("--cache-root")
        .arg(whisper_cache_root())
        .args(if repair { vec!["--repair"] } else { Vec::new() })
        .arg("--start-phase")
        .arg(initial_phase)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    crate::process_control::hide_tokio_command(&mut command);
    let child = command
        .spawn()
        .map_err(|error| format!("No se pudo iniciar la preparaci├│n: {}", error))?;
    {
        let mut pid = state.model_prepare_pid.lock().await;
        *pid = child.id();
    }
    let mut child = child;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "No se pudo observar la salida de preparación".to_string())?;
    let mut stdout = BufReader::new(stdout).lines();
    let mut stderr = child.stderr.take();
    let mut progress_lines = Vec::new();
    let mut last_phase = initial_phase.to_string();
    while let Some(line) = stdout
        .next_line()
        .await
        .map_err(|error| error.to_string())?
    {
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&line) {
            let status = payload
                .get("status")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            if !matches!(
                status,
                "downloading" | "verifying" | "preparing" | "validating" | "ready" | "error"
            ) {
                continue;
            }
            let phase = match status {
                "downloading" => "downloading",
                "verifying" => "verifying",
                "preparing" => "preparing",
                "validating" => "validating",
                "ready" => "ready",
                "error" => "error",
                _ => unreachable!("unknown worker status filtered above"),
            };
            last_phase = phase.to_string();
            if matches!(
                status,
                "downloading" | "verifying" | "preparing" | "validating"
            ) {
                let checkpoint = apply_checkpoint_transition(&model, phase);
                let _ = persist_local_model_checkpoint(&checkpoint);
            }
            let event = serde_json::json!({
                "phase": phase,
                "model": model,
                "progress": payload.get("downloaded_bytes").and_then(|value| {
                    let downloaded = value.as_u64()? as f64;
                    let total = payload.get("total_bytes")?.as_u64()? as f64;
                    (total > 0.0).then_some(downloaded / total)
                }),
                "downloadedBytes": payload.get("downloaded_bytes"),
                "totalBytes": payload.get("total_bytes"),
                "etaSeconds": payload.get("eta_seconds"),
                "message": payload.get("message"),
            });
            let _ = app_handle.emit("local-model-state", event);
            progress_lines.push(line);
        }
    }
    let status = child.wait().await;
    let mut stderr_text = String::new();
    if let Some(mut stderr) = stderr.take() {
        let _ = stderr.read_to_string(&mut stderr_text).await;
    }
    let output = status.map(|status| std::process::Output {
        status,
        stdout: progress_lines.join("\n").into_bytes(),
        stderr: stderr_text.into_bytes(),
    });
    *state.model_prepare_pid.lock().await = None;
    let output = output.map_err(|error| error.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stdout.lines().last().unwrap_or(stderr.trim()).to_string();
        persist_setup_error(
            &model,
            &last_phase,
            classify_local_model_error(&last_phase, &message),
        );
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
    let _ = app_handle.emit(
        "local-model-state",
        serde_json::json!({
            "phase": "ready",
            "model": model,
            "progress": 1.0,
            "message": "Modelo descargado, verificado y preparado",
        }),
    );
    let now = chrono::Utc::now().to_rfc3339();
    let _ = persist_local_model_checkpoint(&LocalModelSetupCheckpoint {
        schema_version: 1,
        model: model.clone(),
        revision: status.revision.clone(),
        phase: "ready".into(),
        model_path: status.path.clone(),
        download_complete: true,
        verified: true,
        prepared: true,
        validated: true,
        downloaded_bytes: None,
        total_bytes: None,
        last_error: None,
        failed_phase: None,
        started_at: now.clone(),
        updated_at: now,
    });
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
pub async fn retry_local_model_setup(
    model: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<WhisperModelStatus, String> {
    let snapshot = reconcile_local_model_state(&model)?;
    if snapshot.get("phase").and_then(|value| value.as_str()) == Some("ready") {
        return Ok(inspect_whisper_model(&model));
    }
    let phase = snapshot
        .get("phase")
        .and_then(|value| value.as_str())
        .filter(|phase| {
            matches!(
                *phase,
                "downloading" | "verifying" | "preparing" | "validating"
            )
        })
        .unwrap_or("downloading");
    run_prepare_whisper_model(model, app_handle, state, false, phase).await
}

#[tauri::command]
pub async fn repair_local_model(
    model: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<WhisperModelStatus, String> {
    let inspection = inspect_model_files(&model);
    let invalid_files = inspection
        .iter()
        .filter(|file| file.status != ModelFileStatus::Valid)
        .count();
    eprintln!("[local-model] repair invalid_files={invalid_files}");
    for file in inspection
        .iter()
        .filter(|file| file.status != ModelFileStatus::Valid)
    {
        eprintln!(
            "[local-model] repair file={} status={:?} expected_size={:?} actual_size={:?} expected_hash_present={} actual_hash_present={}",
            file.relative_path.display(), file.status, file.expected_size, file.actual_size,
            file.expected_sha256.is_some(), file.actual_sha256.is_some()
        );
    }
    let checkpoint = checkpoint_phase(
        &model,
        "downloading",
        false,
        false,
        false,
        false,
        None,
        None,
    );
    let _ = persist_local_model_checkpoint(&checkpoint);
    run_prepare_whisper_model(model, app_handle, state, true, "downloading").await
}

#[tauri::command]
pub async fn cancel_whisper_model_preparation(state: State<'_, AppState>) -> Result<(), String> {
    let pid = *state.model_prepare_pid.lock().await;
    if let Some(pid) = pid {
        #[cfg(windows)]
        {
            let status = hidden_std_command("taskkill")
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
pub async fn quit_onboarding(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    exit_signal: State<'_, crate::ExitSignal>,
) -> Result<(), String> {
    let mut prepare_pid = state.model_prepare_pid.lock().await;
    if let Some(pid) = *prepare_pid {
        #[cfg(windows)]
        {
            // Best effort: always allow the onboarding close button to exit,
            // even if the child already ended or Windows cannot signal it.
            if let Err(error) = hidden_std_command("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .status()
            {
                eprintln!("Could not stop model preparation process {pid}: {error}");
            }
        }
        *prepare_pid = None;
    }
    drop(prepare_pid);
    exit_signal
        .0
        .store(true, std::sync::atomic::Ordering::SeqCst);
    app_handle.exit(0);
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
    drop(config);
    let mut app_settings = state.app_settings.read().await.clone();
    app_settings.processing_quality = settings.quality;
    app_settings.processing_profile = settings.profile.clone();
    app_settings.whisper_model = settings.whisper_model.clone();
    app_settings.device = settings.device.clone();
    app_settings.compute_type = settings.compute_type.clone();
    app_settings.video_fit = settings.video_fit.clone();
    app_settings.source = "native".into();
    persist_app_settings(&app_settings)?;
    *state.app_settings.write().await = app_settings;
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
    let disk_status = storage::storage_status(&download_dir, 0, None);
    if matches!(disk_status.state, storage::StorageState::PathError) {
        return Err(format!(
            "No se pudo medir el espacio libre de {}. Comprueba la unidad y los permisos.",
            download_dir.display()
        ));
    }
    let minimum_reserve = 2_u64
        .saturating_mul(storage::GIB)
        .max(disk_status.free_bytes / 10);
    let reserve_bytes = input
        .reserve_bytes
        .unwrap_or(minimum_reserve)
        .max(minimum_reserve);
    let quota_bytes = input.quota_bytes.unwrap_or_else(|| {
        storage::recommend_storage(intent.clone(), disk_status.free_bytes).quota_bytes
    });
    let safe_bytes = disk_status.free_bytes.saturating_sub(reserve_bytes);
    if safe_bytes < storage::GIB {
        return Err(
            "El disco no tiene 1 GiB de espacio seguro. Libera espacio o cambia la carpeta."
                .to_string(),
        );
    }
    if quota_bytes == 0 {
        return Err(
            "La cuota de medios debe ser mayor que cero. Elige una cuota válida antes de continuar."
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
    let runtime_search = crate::domain::models::SearchConfig {
        min_score: search.min_score,
        max_results: search.max_results,
        similarity_metric: search.similarity_metric.clone(),
        chunk_size: search.chunk_size,
        chunk_overlap: search.chunk_overlap,
    };
    *state.config.lock().await = search.clone();
    state.search.update_config(runtime_search)?;
    let mut worker = state.worker_config.write().await;
    worker.download_dir = download_dir.to_string_lossy().to_string();
    worker.retention = input.retention.clone();
    worker.cookies_browser = input.browser.clone();
    worker.formats = input.formats.clone();
    worker.processing = processing.clone();
    worker.intent = intent.as_str().to_string();
    worker.quota_bytes = quota_bytes;
    worker.reserve_bytes = reserve_bytes;
    drop(worker);

    let mut app_settings = state.app_settings.read().await.clone();
    app_settings.source = "native".into();
    app_settings.download_dir = download_dir.to_string_lossy().to_string();
    app_settings.retention = input.retention;
    app_settings.cookies_browser = input.browser;
    app_settings.formats = input.formats;
    app_settings.min_score = search.min_score;
    app_settings.max_results = search.max_results;
    app_settings.similarity_metric = search.similarity_metric;
    app_settings.chunk_size = search.chunk_size;
    app_settings.chunk_overlap = search.chunk_overlap;
    app_settings.processing_quality = processing.quality;
    app_settings.processing_profile = processing.profile.clone();
    app_settings.whisper_model = processing.whisper_model.clone();
    app_settings.device = processing.device.clone();
    app_settings.compute_type = processing.compute_type.clone();
    app_settings.video_fit = processing.video_fit.clone();
    app_settings.storage_intent = intent.as_str().to_string();
    app_settings.quota_bytes = quota_bytes;
    app_settings.reserve_bytes = reserve_bytes;
    persist_app_settings(&app_settings)?;
    *state.app_settings.write().await = app_settings;
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
            let shared = self.0.clone();
            let input = text.to_string();
            let timeout_ms = std::env::var("PULSAR_ONNX_TIMEOUT_MS")
                .ok()
                .and_then(|value| value.parse::<u64>().ok())
                .filter(|value| *value > 0)
                .unwrap_or(120_000);
            rt.clone().block_on(async move {
                let worker_runtime = rt.clone();
                let task = tokio::task::spawn_blocking(move || {
                    worker_runtime.block_on(async move {
                        let mut guard = shared.lock().await;
                        if let Some(engine) = guard.as_mut() {
                            engine.generate_embedding(&input)
                        } else {
                            Err("ONNX Model is currently unloaded (null state)".to_string())
                        }
                    })
                });
                match tokio::time::timeout(
                    std::time::Duration::from_millis(timeout_ms),
                    task,
                )
                .await
                {
                    Ok(Ok(result)) => result,
                    Ok(Err(error)) => Err(format!("ONNX inference task failed: {error}")),
                    Err(_) => Err(format!(
                        "ONNX inference timed out after {} ms; retry or switch to CPU/DirectML in Settings",
                        timeout_ms
                    )),
                }
            })
        })
    }
}

impl crate::domain::ports::EmbeddingProvider for SharedEmbeddingEngine {
    fn provider_id(&self) -> &str {
        "onnx"
    }

    fn model_version(&self) -> &str {
        crate::db::EMBEDDING_MODEL_ID
    }

    fn dimensions(&self) -> usize {
        crate::domain::models::EMBEDDING_DIMS
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
    validate_sandbox_url(&url)?;
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
pub async fn get_job_activity(
    job_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<db::JobActivityEvent>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_job_activity(&db, job_id).map_err(|error| error.to_string())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectTikTokSourceInput {
    pub profile_url: String,
    pub initial_import_mode: String,
    pub history_limit: Option<i64>,
    pub history_from: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterProfileSourceInput {
    pub profile_url: String,
    pub selected_sources: ProfileSourceSelection,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileSourceSettingsInput {
    pub selected_sources: ProfileSourceSelection,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCollectionSourceConfigInput {
    pub watch_config: SourceWatchConfig,
    pub initial_import_mode: String,
    pub history_limit: Option<i64>,
    pub history_from: Option<String>,
    pub rules: SourceRules,
}

#[tauri::command]
pub async fn connect_tiktok_source(
    input: ConnectTikTokSourceInput,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<ConnectTikTokSourceResult, String> {
    let browser = state.worker_config.read().await.cookies_browser.clone();
    connect_tiktok_source_service(
        state.db.clone(),
        state.queue.clone(),
        &input.profile_url,
        (!browser.is_empty()).then_some(browser.as_str()),
        &input.initial_import_mode,
        input.history_limit,
        input.history_from.as_deref(),
        app_handle,
    )
    .await
}

#[tauri::command]
pub async fn register_profile_source(
    input: RegisterProfileSourceInput,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<RegisterProfileSourceResult, String> {
    let result = {
        let connection = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        crate::application::collection_service::register_profile_source(
            &connection,
            &input.profile_url,
            &input.selected_sources,
        )?
    };

    // Ensure channels exist in database
    {
        if let Ok(connection) = state.db.lock() {
            let _ = db::ensure_profile_channels(
                &connection,
                result.source.id,
                &result.source.watch_config_json,
            );
        }
    }

    // Trigger initial discovery in background
    let discovery_service =
        crate::application::profile_discovery_service::ProfileDiscoveryService::new(
            state.db.clone(),
            state.queue.clone(),
            app_handle,
        );
    let source_id = result.source.id;
    tokio::spawn(async move {
        if let Err(err) = discovery_service.discover_profile(source_id, false).await {
            tracing::warn!("Initial profile discovery error for source {source_id}: {err}");
        }
    });

    Ok(result)
}

#[tauri::command]
pub async fn update_profile_source_settings(
    source_id: i64,
    input: UpdateProfileSourceSettingsInput,
    state: State<'_, AppState>,
) -> Result<db::CollectionSourceRecord, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    let source =
        update_profile_source_settings_service(&connection, source_id, &input.selected_sources)?;
    let _ = db::ensure_profile_channels(&connection, source_id, &source.watch_config_json);
    Ok(source)
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
pub async fn update_collection_source_config(
    source_id: i64,
    input: UpdateCollectionSourceConfigInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !matches!(input.initial_import_mode.as_str(), "new_only" | "history") {
        return Err("Modo de importación no válido".into());
    }
    if let Some(limit) = input.history_limit {
        if !matches!(limit, 25 | 50 | 100 | 200) {
            return Err("El límite histórico debe ser 25, 50, 100 o 200".into());
        }
    }
    let watch_json = serde_json::to_string(&input.watch_config)
        .map_err(|error| format!("Configuración de observación inválida: {error}"))?;
    let rules_json = serde_json::to_string(&input.rules)
        .map_err(|error| format!("Reglas de fuente inválidas: {error}"))?;
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    let source =
        db::get_collection_source(&connection, source_id).map_err(|error| error.to_string())?;
    let capabilities: serde_json::Value =
        serde_json::from_str(&source.capabilities_json).unwrap_or_default();
    let requested = [
        ("posts", input.watch_config.posts),
        ("likes", input.watch_config.likes),
        ("saved", input.watch_config.saved),
        ("reposts", input.watch_config.reposts),
    ];
    for (category, enabled) in requested {
        if enabled
            && capabilities
                .get(category)
                .and_then(|value| value.get("available"))
                .and_then(serde_json::Value::as_bool)
                != Some(true)
        {
            let reason = capabilities
                .get(category)
                .and_then(|value| value.get("reason"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or("La categoría no ha sido confirmada por el scanner");
            return Err(format!("{category}: {reason}"));
        }
    }
    db::update_collection_source_config(
        &connection,
        source_id,
        &watch_json,
        &input.initial_import_mode,
        input.history_limit,
        input.history_from.as_deref(),
        &rules_json,
    )
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
) -> Result<crate::application::collection_service::SourceSyncSummary, String> {
    let source_type = {
        let connection = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::force_collection_source_due(&connection, source_id)
            .map_err(|error| error.to_string())?;
        let src = db::get_collection_source(&connection, source_id).map_err(|e| e.to_string())?;
        src.source_type
    };

    if source_type == "profile" {
        let discovery_service =
            crate::application::profile_discovery_service::ProfileDiscoveryService::new(
                state.db.clone(),
                state.queue.clone(),
                app_handle,
            );
        let report = discovery_service.discover_profile(source_id, true).await?;
        let mut summary = crate::application::collection_service::SourceSyncSummary {
            source_id,
            found_count: report.total_discovered,
            queued_count: report.total_queued,
            duplicate_count: report.total_duplicates,
            ignored_count: 0,
            error_count: 0,
            unavailable_categories: Vec::new(),
            partial: false,
            message: "Sincronización de perfil completada".into(),
            categories: std::collections::HashMap::new(),
        };
        for ch in report.channels {
            summary.categories.insert(
                ch.channel_kind.clone(),
                crate::application::collection_service::SourceCategorySummary {
                    available: ch.status != "unsupported" && ch.status != "requires_auth",
                    enabled: true,
                    discovered: ch.discovered_count,
                    queued: ch.queued_count,
                    state: ch.status,
                },
            );
        }
        return Ok(summary);
    }

    sync_collection_source_by_id(state.db.clone(), state.queue.clone(), source_id, app_handle).await
}

#[tauri::command]
pub async fn refresh_profile_metadata(
    source_id: i64,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<crate::application::profile_discovery_service::ProfileMetadataSnapshot, String> {
    let service = crate::application::profile_discovery_service::ProfileDiscoveryService::new(
        state.db.clone(),
        state.queue.clone(),
        app_handle,
    );
    service.refresh_profile_metadata(source_id).await
}

#[tauri::command]
pub async fn get_profile_channels(
    source_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<db::ProfileChannelRecord>, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_profile_channels(&connection, source_id).map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn get_channel_content_items(
    source_id: i64,
    channel_kind: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<db::ContentItemRecord>, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_channel_content_items(&connection, source_id, &channel_kind, limit.unwrap_or(50))
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn get_source_collection_content_items(
    source_id: i64,
    channel_kind: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<db::ContentViewRecord>, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_channel_content_views(&connection, source_id, &channel_kind, limit.unwrap_or(50))
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn get_collection_source_activity(
    source_id: i64,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<db::CollectionSourceActivityRecord>, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_collection_source_activity(&connection, source_id, limit.unwrap_or(50).min(200))
        .map_err(|error| error.to_string())
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
        processing_paused: state.queue.is_processing_paused(),
        background_admission_paused: state.queue.is_background_admission_paused(),
        autostart_enabled: app_handle.autolaunch().is_enabled().unwrap_or(false),
        api_ready,
        api_error,
    })
}

#[tauri::command]
pub fn get_processing_pause(state: State<'_, AppState>) -> bool {
    state.queue.is_processing_paused()
}

#[tauri::command]
pub fn set_processing_pause(paused: bool, state: State<'_, AppState>) -> bool {
    state.queue.set_processing_paused(paused);
    paused
}

async fn apply_runtime_settings(
    settings: &AppSettingsSnapshot,
    state: &State<'_, AppState>,
) -> Result<(), String> {
    validate_app_settings(settings)?;
    apply_app_settings_environment(settings);
    let search = snapshot_search_config(settings);
    {
        let mut config = state.config.lock().await;
        *config = search.clone();
    }
    state
        .search
        .update_config(crate::domain::models::SearchConfig {
            min_score: search.min_score,
            max_results: search.max_results,
            similarity_metric: search.similarity_metric.clone(),
            chunk_size: search.chunk_size,
            chunk_overlap: search.chunk_overlap,
        })?;
    {
        let mut worker = state.worker_config.write().await;
        worker.download_dir = settings.download_dir.clone();
        worker.formats = settings.formats.clone();
        worker.cookies_browser = settings.cookies_browser.clone();
        worker.retention = settings.retention.clone();
        worker.processing = snapshot_processing_settings(settings);
        worker.intent = settings.storage_intent.clone();
        worker.quota_bytes = settings.quota_bytes;
        worker.reserve_bytes = settings.reserve_bytes;
    }
    Ok(())
}

fn default_legal_consent() -> LegalConsent {
    LegalConsent {
        eula_version: CURRENT_EULA_VERSION.into(),
        terms_version: CURRENT_TERMS_VERSION.into(),
        privacy_version: CURRENT_PRIVACY_VERSION.into(),
        content_policy_version: CURRENT_CONTENT_POLICY_VERSION.into(),
        accepted_at: None,
        locale: "es-MX".into(),
    }
}

fn legal_consent_is_current(consent: &LegalConsent) -> bool {
    consent.accepted_at.is_some()
        && consent.eula_version == CURRENT_EULA_VERSION
        && consent.terms_version == CURRENT_TERMS_VERSION
        && consent.privacy_version == CURRENT_PRIVACY_VERSION
        && consent.content_policy_version == CURRENT_CONTENT_POLICY_VERSION
}

#[tauri::command]
pub async fn get_legal_consent() -> Result<LegalConsent, String> {
    let path = settings_data_dir().join("legal-consent.json");
    let mut consent = fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<LegalConsent>(&contents).ok())
        .unwrap_or_else(default_legal_consent);
    if !legal_consent_is_current(&consent) {
        consent.accepted_at = None;
    }
    Ok(consent)
}

#[tauri::command]
pub async fn save_legal_consent(input: LegalConsentInput) -> Result<LegalConsent, String> {
    if input.eula_version != CURRENT_EULA_VERSION
        || input.terms_version != CURRENT_TERMS_VERSION
        || input.privacy_version != CURRENT_PRIVACY_VERSION
        || input.content_policy_version != CURRENT_CONTENT_POLICY_VERSION
    {
        return Err("La versión de los documentos legales no es compatible".into());
    }
    if !matches!(input.locale.as_str(), "es-MX" | "en-US") {
        return Err("Idioma legal no compatible".into());
    }

    let consent = LegalConsent {
        eula_version: input.eula_version,
        terms_version: input.terms_version,
        privacy_version: input.privacy_version,
        content_policy_version: input.content_policy_version,
        accepted_at: Some(chrono::Utc::now().to_rfc3339()),
        locale: input.locale,
    };
    fs::create_dir_all(settings_data_dir()).map_err(|error| error.to_string())?;
    let serialized = serde_json::to_vec_pretty(&consent).map_err(|error| error.to_string())?;
    atomic_write(&settings_data_dir().join("legal-consent.json"), &serialized)?;
    Ok(consent)
}

#[tauri::command]
pub async fn get_app_settings(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<AppSettingsResponse, String> {
    let mut settings = state.app_settings.read().await.clone();
    let autostart_enabled = app_handle.autolaunch().is_enabled().unwrap_or(false);
    settings.autostart_enabled = autostart_enabled;
    let root = PathBuf::from(&settings.download_dir);
    let storage =
        storage::storage_status(&root, settings.quota_bytes, Some(settings.reserve_bytes));
    let processing = state.worker_config.read().await.processing.clone();
    let runtime_status = if inspect_whisper_model(&processing.whisper_model).ready {
        "ready"
    } else {
        "requires-repair"
    };
    let (api_ready, api_error) = state.api_runtime.snapshot();
    let mut sync_errors = Vec::new();
    if !api_ready {
        if let Some(error) = api_error {
            sync_errors.push(error);
        }
    }
    Ok(AppSettingsResponse {
        source: settings.source.clone(),
        version: settings.schema_version,
        updater_status: "BLOCKED_EXTERNAL".into(),
        settings,
        autostart_enabled,
        runtime_status: runtime_status.into(),
        storage,
        sync_errors,
    })
}

#[tauri::command]
pub async fn save_app_settings(
    mut settings: AppSettingsSnapshot,
    state: State<'_, AppState>,
) -> Result<AppSettingsSnapshot, String> {
    settings.schema_version = APP_SETTINGS_SCHEMA_VERSION;
    settings.source = "native".into();
    settings.gpu_enhancement_enabled = false;
    let persisted_acceleration = state.app_settings.read().await.clone();
    if settings.last_verified_accelerators.is_none() {
        settings.last_verified_accelerators = persisted_acceleration.last_verified_accelerators;
    }
    if settings.performance_profile_version == 0 {
        settings.performance_profile_version =
            persisted_acceleration.performance_profile_version.max(1);
    }
    if settings.quota_bytes == 0 {
        let root = expand_user_path(&settings.download_dir);
        fs::create_dir_all(&root).map_err(|error| error.to_string())?;
        let recommendation = storage::recommend_storage(
            storage::SetupIntent::parse(&settings.storage_intent)
                .ok_or_else(|| "La intención de almacenamiento no es válida".to_string())?,
            storage::storage_status(&root, 0, None).free_bytes,
        );
        settings.quota_bytes = recommendation.quota_bytes;
        if settings.reserve_bytes == 0 {
            settings.reserve_bytes = recommendation.reserve_bytes;
        }
    }
    settings.download_dir = expand_user_path(&settings.download_dir)
        .to_string_lossy()
        .to_string();
    validate_app_settings(&settings)?;
    fs::create_dir_all(&settings.download_dir).map_err(|error| error.to_string())?;
    storage::ensure_media_root(PathBuf::from(&settings.download_dir).as_path())
        .map_err(|error| format!("No se pudo preparar el almacenamiento local: {}", error))?;
    let status = storage::storage_status(
        PathBuf::from(&settings.download_dir).as_path(),
        settings.quota_bytes,
        Some(settings.reserve_bytes),
    );
    let safe_free = status.free_bytes.saturating_sub(settings.reserve_bytes);
    if safe_free < storage::GIB || settings.quota_bytes > safe_free {
        return Err("La cuota o la reserva superan el espacio seguro disponible".into());
    }
    settings.processing_profile = if settings.processing_quality < 35 {
        "fast".into()
    } else if settings.processing_quality < 72 {
        "balanced".into()
    } else {
        "high".into()
    };
    let processing = effective_processing_settings(derive_processing_settings(
        settings.processing_quality,
        settings.video_fit.clone(),
    )?)?;
    let processing = apply_performance_mode_to_processing(&settings, processing);
    settings.playback_profile = settings.performance_mode.clone();
    settings.processing_profile = processing.profile.clone();
    settings.whisper_model = processing.whisper_model.clone();
    settings.device = processing.device.clone();
    settings.compute_type = processing.compute_type.clone();
    settings.video_fit = processing.video_fit.clone();
    persist_app_settings(&settings)?;
    apply_runtime_settings(&settings, &state).await?;
    *state.app_settings.write().await = settings.clone();
    Ok(settings)
}

#[tauri::command]
pub async fn get_autostart_status(app_handle: tauri::AppHandle) -> Result<bool, String> {
    app_handle
        .autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_autostart(
    enabled: bool,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    if enabled {
        app_handle
            .autolaunch()
            .enable()
            .map_err(|error| error.to_string())?;
    } else {
        app_handle
            .autolaunch()
            .disable()
            .map_err(|error| error.to_string())?;
    }
    let actual = app_handle
        .autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())?;
    let mut settings = state.app_settings.read().await.clone();
    settings.autostart_enabled = actual;
    settings.start_in_background = actual;
    persist_app_settings(&settings)?;
    *state.app_settings.write().await = settings;
    Ok(actual)
}

#[tauri::command]
pub async fn repair_library(state: State<'_, AppState>) -> Result<db::LibraryRepairReport, String> {
    let root = {
        let configured = state.worker_config.read().await.download_dir.clone();
        if configured.trim().is_empty() {
            storage::default_media_root()
        } else {
            PathBuf::from(configured)
        }
    };
    let report = {
        let connection = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        let mut report = db::repair_library(&connection).map_err(|error| error.to_string())?;
        report.storage =
            Some(db::reconcile_storage(&connection, &root).map_err(|error| error.to_string())?);
        report
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
    let response = state
        .search
        .unified_search(crate::domain::models::UnifiedSearchRequest {
            query,
            mode: crate::domain::models::SearchMode::Exact,
            limit: limit.unwrap_or(10),
            context: None,
        })
        .await?;
    Ok(flatten_unified_results(response))
}

fn flatten_unified_results(
    response: crate::domain::models::UnifiedSearchResponse,
) -> Vec<db::SearchResult> {
    response
        .results
        .into_iter()
        .map(|group| db::SearchResult {
            job_id: group.job_id,
            title: group.title,
            thumbnail: group.thumbnail,
            chunk_text: group.primary_moment.excerpt,
            chunk_index: group.primary_moment.unit_id,
            similarity_score: group.score,
        })
        .collect()
}

#[tauri::command]
pub async fn search_library(
    request: crate::domain::models::UnifiedSearchRequest,
    state: State<'_, AppState>,
) -> Result<crate::domain::models::UnifiedSearchResponse, String> {
    state.search.unified_search(request).await
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

    let config = state.config.lock().await;
    let final_limit = limit.unwrap_or(config.max_results);
    drop(config);
    let response = state
        .search
        .unified_search(crate::domain::models::UnifiedSearchRequest {
            query,
            mode: crate::domain::models::SearchMode::Conceptual,
            limit: final_limit,
            context: None,
        })
        .await?;
    let _ = min_score;
    Ok(flatten_unified_results(response))
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
        dimensions: if loaded { EMBEDDING_DIMS } else { 0 },
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
    let mut app_settings = state.app_settings.read().await.clone();
    app_settings.source = "native".into();
    app_settings.min_score = min_score;
    app_settings.max_results = max_results;
    app_settings.chunk_size = chunk_size;
    app_settings.chunk_overlap = chunk_overlap;
    persist_app_settings(&app_settings)?;
    *state.app_settings.write().await = app_settings;
    emit_log(&app_handle, "Search configuration updated".into());
    Ok(())
}

#[tauri::command]
pub async fn get_system_metrics(state: State<'_, AppState>) -> Result<SystemMetrics, String> {
    let mut metrics = state.metrics.lock().await.clone();
    let settings = state.app_settings.read().await.clone();
    let video_backend =
        if std::env::var("PULSAR_FFMPEG_VIDEO_ENCODER").ok().as_deref() == Some("nvenc") {
            "FFmpeg/NVENC verificado"
        } else {
            "WebView2/FFmpeg sin NVENC verificado"
        };
    metrics.active_backends = vec![
        format!("whisper:{}", settings.device),
        "embeddings:cpu".into(),
        format!("video:{video_backend}"),
    ];
    Ok(metrics)
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
    emit_log(&app_handle, "Rebuilding semantic vector index...".into());
    let count = state
        .queue
        .rebuild_index_from_persisted_rows(&state.search)
        .await?
        .ok_or_else(|| {
            "No se puede reconstruir el índice mientras hay trabajos activos".to_string()
        })?;
    emit_log(
        &app_handle,
        format!("Semantic vector index rebuilt: {} vectors.", count),
    );
    Ok(())
}

#[tauri::command]
pub async fn reindex_sqlite_indexes(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    emit_log(&app_handle, "Rebuilding SQLite indexes...".into());
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db.execute_batch("REINDEX transcript_embeddings;")
        .map_err(|e| e.to_string())?;
    emit_log(&app_handle, "SQLite index rebuild complete.".into());
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
    let _maintenance_guard = state.queue.begin_maintenance().await?;
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
                Ok(vector) if vector.len() == EMBEDDING_DIMS => {
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

    // Only advance the recorded model version after every job has been
    // recomputed successfully. A partial run must leave the index marked
    // stale so the user can retry without losing the previous valid data.
    if total_errors == 0 {
        let model_dir = resolve_model_dir();
        let model_hash = db::embedding_model_fingerprint(&model_dir)?;
        let db = state
            .db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::record_embedding_model(&db, &model_hash).map_err(|e| e.to_string())?;
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
    db::get_transcript_segments_with_words(&db, job_id)
        .map_err(|e| e.to_string())
        .map(|rows| {
            rows.into_iter()
                .map(|(idx, text, start, end, words_json)| TranscriptChunk {
                    chunk_index: idx,
                    chunk_text: text,
                    start,
                    end,
                    words: words_json.and_then(|json| serde_json::from_str(&json).ok()),
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
pub async fn get_source_collections(
    state: State<'_, AppState>,
) -> Result<Vec<db::SourceCollectionRecord>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    db::get_source_collections(&db).map_err(|e| e.to_string())
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
    job_id: Option<i64>,
    content_id: Option<i64>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    match (job_id, content_id) {
        (Some(job_id), _) => db::add_job_to_playlist(&db, playlist_id, job_id),
        (None, Some(content_id)) => {
            db::add_content_to_playlist(&db, playlist_id, content_id, "user")
        }
        (None, None) => Err(rusqlite::Error::InvalidParameterName(
            "playlist item requires job_id or content_id".to_string(),
        )),
    }
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_from_playlist(
    playlist_id: i64,
    job_id: Option<i64>,
    content_id: Option<i64>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    match (job_id, content_id) {
        (Some(job_id), _) => db::remove_job_from_playlist(&db, playlist_id, job_id),
        (None, Some(content_id)) => db::remove_content_from_playlist(&db, playlist_id, content_id),
        (None, None) => Err(rusqlite::Error::InvalidParameterName(
            "playlist item requires job_id or content_id".to_string(),
        )),
    }
    .map_err(|e| e.to_string())
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
pub async fn get_playlist_content_items(
    playlist_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<db::ContentViewRecord>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    let mut views =
        db::get_playlist_content_views(&db, playlist_id).map_err(|error| error.to_string())?;
    for view in &mut views {
        if view
            .job
            .video_path
            .as_deref()
            .map(PathBuf::from)
            .is_some_and(|path| !path.is_file())
        {
            view.job.video_path = None;
            if view.availability == "available" {
                view.job.source_state = "online".to_string();
            }
        }
    }
    Ok(views)
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
        "@unib:0.0\n@owner:pulsaria\n@mode:media\n@created:{}\n@source:{}\n@title:{}\n@author:{}\n@duration:{}\n@platform:{}\n@upload_date:{}\n@keep_status:{}\n@julia_ready:{}\n@embeddings_count:{}\n@embeddings_dim:{}\n@embedding_model:all-MiniLM-L6-v2\n\n{}\n\n[V#media] @video_{}:video > downloaded_from > @source_{}:source ?1.0 !0.8 {{st:confirmed}} ^system.\n",
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
        EMBEDDING_DIMS,
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
            if embedding.len() != EMBEDDING_DIMS {
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
    let mut app_settings = state.app_settings.read().await.clone();
    app_settings.download_dir = path.to_string_lossy().to_string();
    app_settings.source = "native".into();
    persist_app_settings(&app_settings)?;
    *state.app_settings.write().await = app_settings;
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
    let mut app_settings = state.app_settings.read().await.clone();
    app_settings.cookies_browser = browser;
    app_settings.source = "native".into();
    persist_app_settings(&app_settings)?;
    *state.app_settings.write().await = app_settings;
    Ok(())
}

#[tauri::command]
pub async fn set_formats(formats: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let formats = formats
        .into_iter()
        .map(|format| format.to_ascii_lowercase())
        .collect::<Vec<_>>();
    if !valid_formats(&formats) {
        return Err("La selección de formatos es inválida".into());
    }
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
    let mut app_settings = state.app_settings.read().await.clone();
    app_settings.formats = formats;
    app_settings.source = "native".into();
    persist_app_settings(&app_settings)?;
    *state.app_settings.write().await = app_settings;
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
    let mut app_settings = state.app_settings.read().await.clone();
    app_settings.retention = retention;
    app_settings.source = "native".into();
    persist_app_settings(&app_settings)?;
    *state.app_settings.write().await = app_settings;
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
    use super::{
        apply_checkpoint_transition, atomic_write, classify_local_model_error,
        default_legal_consent, legal_consent_is_current, parse_unib_segments, parse_unib_time,
        unib_header_value, LocalModelErrorCode,
    };
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn checkpoint_transition_downloading() {
        assert_eq!(
            apply_checkpoint_transition("tiny", "downloading").phase,
            "downloading"
        );
    }
    #[test]
    fn checkpoint_transition_verifying() {
        let c = apply_checkpoint_transition("tiny", "verifying");
        assert!(c.download_complete);
        assert!(!c.verified);
    }
    #[test]
    fn checkpoint_transition_preparing() {
        let c = apply_checkpoint_transition("tiny", "preparing");
        assert!(c.verified);
        assert!(!c.prepared);
    }
    #[test]
    fn checkpoint_transition_validating() {
        let c = apply_checkpoint_transition("tiny", "validating");
        assert!(c.prepared);
        assert!(!c.validated);
    }
    #[test]
    fn checkpoint_transition_ready() {
        assert!(apply_checkpoint_transition("tiny", "ready").validated);
    }
    #[test]
    fn checkpoint_error_preserves_failed_phase() {
        let mut c = apply_checkpoint_transition("tiny", "verifying");
        c.phase = "error".into();
        c.failed_phase = Some("verifying".into());
        assert_eq!(c.failed_phase.as_deref(), Some("verifying"));
    }

    #[test]
    fn local_model_error_network_retryable() {
        let error = classify_local_model_error("downloading", "network connection failed");
        assert_eq!(error.code, LocalModelErrorCode::DownloadFailed);
        assert!(error.retryable);
    }

    #[test]
    fn local_model_error_permission_not_retryable() {
        let error = classify_local_model_error("preparing", "permission denied");
        assert_eq!(error.code, LocalModelErrorCode::PermissionDenied);
        assert!(!error.retryable);
    }

    #[test]
    fn local_model_error_timeout_retryable() {
        let error = classify_local_model_error("downloading", "request timeout");
        assert_eq!(error.code, LocalModelErrorCode::Timeout);
        assert!(error.retryable);
    }

    #[test]
    fn local_model_error_verification_retryable() {
        let error = classify_local_model_error("verifying", "hash mismatch");
        assert_eq!(error.code, LocalModelErrorCode::VerificationFailed);
        assert!(error.retryable);
    }

    #[test]
    fn local_model_error_validation_retryable() {
        let error = classify_local_model_error("validating", "model load failed");
        assert_eq!(error.code, LocalModelErrorCode::ValidationFailed);
        assert!(error.retryable);
    }

    #[test]
    fn local_model_error_already_preparing_not_retryable() {
        let error = classify_local_model_error("preparing", "LOCAL_MODEL_PREPARATION_ACTIVE");
        assert_eq!(error.code, LocalModelErrorCode::ModelAlreadyPreparing);
        assert!(!error.retryable);
    }

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

    #[test]
    fn atomic_write_replaces_an_existing_settings_file() {
        let root = std::env::temp_dir().join(format!(
            "pulsaria-command-settings-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock before unix epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test directory should be created");
        let path = PathBuf::from(&root).join("app-settings.json");

        atomic_write(&path, br#"{"version":1}"#).expect("first write should succeed");
        atomic_write(&path, br#"{"version":2}"#).expect("replacement should succeed");

        assert_eq!(
            fs::read_to_string(&path).expect("replacement should remain readable"),
            r#"{"version":2}"#
        );
        assert!(!root.join(".app-settings.json.previous").exists());
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn legal_consent_is_not_current_until_accepted() {
        let mut consent = default_legal_consent();
        assert!(!legal_consent_is_current(&consent));
        consent.accepted_at = Some("2026-09-13T00:00:00Z".into());
        assert!(legal_consent_is_current(&consent));
        consent.privacy_version = "0.2".into();
        assert!(!legal_consent_is_current(&consent));
    }
}
