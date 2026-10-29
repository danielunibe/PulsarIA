use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex as StdMutex};

use metrics::{counter, gauge, histogram};
use tokio::process::Command;
use tokio::sync::{mpsc, Semaphore};
use tokio::time::Duration;
use tracing::{info, instrument, warn};

use crate::application::search_service::SearchService;
use crate::db;
use crate::domain::models::JobMessage;
use crate::domain::ports::JobRepository;
use crate::infrastructure::workers::python_runner::{PythonWorker, WorkerMetadata, WorkerResult};
use crate::resilience::circuit_breaker::CircuitBreaker;
use crate::storage;

const MAX_RETRIES: u32 = 3;
const JOB_TIMEOUT_SECONDS: u64 = 2 * 60 * 60;
const QUEUE_CAPACITY: usize = 100;
const QUEUE_HIGH_WATERMARK: usize = 80;
const QUEUE_LOW_WATERMARK: usize = 40;
const DEFAULT_WORKER_LIMIT: usize = 4;
const MAX_WORKER_LIMIT: usize = 8;

const BACKPRESSURE_ERROR: &str = "System is saturated: backpressure applied";

#[derive(Clone)]
struct QueueAdmissionGate {
    workers: Arc<Semaphore>,
    profiles: Arc<Semaphore>,
    processing_paused: Arc<AtomicBool>,
    background_paused: Arc<AtomicBool>,
    profile_processing_authorized: Arc<AtomicBool>,
    profile_cooldown: Duration,
}

impl QueueAdmissionGate {
    async fn run(&self, profile_background: bool, work: impl std::future::Future<Output = ()>) {
        let profile_permit = if profile_background {
            match self.profiles.clone().acquire_owned().await {
                Ok(permit) => Some(permit),
                Err(_) => return,
            }
        } else {
            None
        };
        let admission_paused = || {
            self.processing_paused.load(Ordering::SeqCst)
                || (profile_background
                    && (self.background_paused.load(Ordering::SeqCst)
                        || !self.profile_processing_authorized.load(Ordering::SeqCst)))
        };
        let permit = loop {
            while admission_paused() {
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
            let permit = match self.workers.clone().acquire_owned().await {
                Ok(permit) => permit,
                Err(_) => return,
            };
            // Pause or consent can change while this task waits for worker capacity.
            // Release the slot and re-check before starting work.
            if admission_paused() {
                drop(permit);
                continue;
            }
            break permit;
        };
        work.await;
        drop(permit);
        // The profile cooldown leaves ordinary workers available for foreground jobs.
        if profile_permit.is_some() {
            tokio::time::sleep(self.profile_cooldown).await;
        }
        drop(profile_permit);
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SourceScanItem {
    pub url: String,
    pub id: Option<String>,
    pub upload_date: Option<String>,
    pub timestamp: Option<f64>,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SourceScanCategory {
    pub available: bool,
    #[serde(default)]
    pub status: Option<String>,
    pub reason: Option<String>,
    #[serde(default)]
    pub auth_required: bool,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default)]
    pub items: Vec<SourceScanItem>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SourceScanProfile {
    pub profile_url: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SourceScanResult {
    pub profile: SourceScanProfile,
    pub categories: HashMap<String, SourceScanCategory>,
}

fn worker_count_for(cpu_count: usize, configured: Option<usize>) -> usize {
    let automatic = cpu_count.saturating_sub(1).clamp(1, DEFAULT_WORKER_LIMIT);
    configured.unwrap_or(automatic).clamp(1, MAX_WORKER_LIMIT)
}

#[derive(Debug)]
pub enum QueueError {
    NetworkError(String),
    ExtractionError(String),
    ProcessingError(String),
}

impl std::fmt::Display for QueueError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NetworkError(message) => write!(f, "Network Error: {}", message),
            Self::ExtractionError(message) => write!(f, "Extraction Error: {}", message),
            Self::ProcessingError(message) => write!(f, "Processing Error: {}", message),
        }
    }
}

pub struct QueueService {
    sender: mpsc::Sender<JobMessage>,
    job_repo: Arc<dyn JobRepository>,
    active_jobs: Arc<tokio::sync::Mutex<HashSet<i64>>>,
    current_depth: Arc<AtomicUsize>,
    backpressure_active: Arc<AtomicBool>,
    circuit_breaker: Arc<CircuitBreaker>,
    worker_capacity: usize,
    idle_workers: Arc<tokio::sync::Mutex<Vec<PythonWorker>>>,
    processing_paused: Arc<AtomicBool>,
    background_admission_paused: Arc<AtomicBool>,
    profile_processing_authorized: Arc<AtomicBool>,
    profile_feeder_running: Arc<AtomicBool>,
    /// Serializes maintenance rebuilds with the moment a job is admitted.
    /// The guard is intentionally held only while claiming a job or while
    /// performing the complete rebuild, never while downloading media.
    maintenance_lock: Arc<tokio::sync::Mutex<()>>,
}

#[derive(Clone)]
struct QueueRuntime {
    repo: Arc<dyn JobRepository>,
    search: Arc<SearchService>,
    idle_workers: Arc<tokio::sync::Mutex<Vec<PythonWorker>>>,
    current_depth: Arc<AtomicUsize>,
    backpressure_active: Arc<AtomicBool>,
    circuit_breaker: Arc<CircuitBreaker>,
    active_jobs: Arc<tokio::sync::Mutex<HashSet<i64>>>,
}

fn resolve_python_exe() -> PathBuf {
    if let Some(custom) =
        std::env::var_os("PYTHON_EXE").or_else(|| std::env::var_os("PULSAR_PYTHON_PATH"))
    {
        let path = PathBuf::from(custom);
        if path.is_file() {
            return path;
        }
    }
    crate::runtime::python_executable()
}

fn resolve_worker_script() -> PathBuf {
    crate::runtime::worker_script("main.py")
}

fn processing_root() -> PathBuf {
    let root = std::env::var_os("PULSAR_DOWNLOAD_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(storage::default_media_root);
    storage::staging_root(&root)
}

fn processing_path(job_id: i64, file_name: &str) -> PathBuf {
    let root = std::env::var_os("PULSAR_DOWNLOAD_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(storage::default_media_root);
    storage::job_staging_dir(&root, job_id).join(file_name)
}

fn rewrite_visual_artifact_paths(
    value: &serde_json::Value,
    staging_root: &Path,
    durable_root: &Path,
) -> serde_json::Value {
    fn rewrite_path(
        raw: &str,
        staging_root: &Path,
        durable_root: &Path,
        allow_directory: bool,
    ) -> Option<String> {
        let current_dir = std::env::current_dir().ok()?;
        let staging_absolute = if staging_root.is_absolute() {
            staging_root.to_path_buf()
        } else {
            current_dir.join(staging_root)
        };
        let raw_path = Path::new(raw);
        let raw_absolute = if raw_path.is_absolute() {
            raw_path.to_path_buf()
        } else {
            current_dir.join(raw_path)
        };
        let relative = raw_absolute.strip_prefix(&staging_absolute).ok()?;
        if relative.as_os_str().is_empty() {
            return allow_directory.then(|| durable_root.to_string_lossy().to_string());
        }
        let name = relative.file_name()?.to_str()?;
        let is_known_artifact =
            name == "poster.jpg" || (name.starts_with("keyframe-") && name.ends_with(".jpg"));
        if !is_known_artifact {
            return None;
        }
        Some(durable_root.join(relative).to_string_lossy().to_string())
    }

    fn visit(
        value: &serde_json::Value,
        staging_root: &Path,
        durable_root: &Path,
        allow_directory: bool,
    ) -> serde_json::Value {
        match value {
            serde_json::Value::String(raw) => {
                rewrite_path(raw, staging_root, durable_root, allow_directory)
                    .map(serde_json::Value::String)
                    .unwrap_or_else(|| value.clone())
            }
            serde_json::Value::Array(items) => serde_json::Value::Array(
                items
                    .iter()
                    .map(|item| visit(item, staging_root, durable_root, false))
                    .collect(),
            ),
            serde_json::Value::Object(object) => serde_json::Value::Object(
                object
                    .iter()
                    .map(|(key, item)| {
                        (
                            key.clone(),
                            visit(item, staging_root, durable_root, key == "artifacts_dir"),
                        )
                    })
                    .collect(),
            ),
            _ => value.clone(),
        }
    }

    visit(value, staging_root, durable_root, false)
}

fn persist_job_error(
    repo: &Arc<dyn JobRepository>,
    job_id: i64,
    status: &str,
    message: &str,
) -> Result<(), String> {
    let lower = message.to_ascii_lowercase();
    let category =
        if lower.contains("cookie") || lower.contains("sign in") || lower.contains("login") {
            "SESSION_EXPIRED"
        } else if lower.contains("blocked")
            || lower.contains("403")
            || lower.contains("unexpected response")
        {
            "TIKTOK_BLOCKED"
        } else if lower.contains("unavailable")
            || lower.contains("private")
            || lower.contains("removed")
        {
            "CONTENT_UNAVAILABLE"
        } else if lower.contains("network")
            || lower.contains("timed out")
            || lower.contains("connection")
        {
            "NETWORK"
        } else if lower.contains("yt-dlp") || lower.contains("extractor") {
            "EXTRACTOR_INCOMPATIBLE"
        } else {
            "INTERNAL"
        };
    let classified = format!("[{}] {}", category, message);
    let result = repo.get_connection().and_then(|connection| {
        let connection = connection
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        crate::db::update_job_error(&connection, job_id, status, &classified)
            .map_err(|error| error.to_string())?;
        crate::db::insert_health_event(
            &connection,
            "pipeline",
            "error",
            &classified,
            Some("retry_with_backoff"),
            Some("failed"),
        )
        .map_err(|error| error.to_string())
    });
    result
}

fn persist_and_log_job_error(
    repo: &Arc<dyn JobRepository>,
    job_id: i64,
    status: &str,
    message: &str,
) {
    if let Err(error) = persist_job_error(repo, job_id, status, message) {
        warn!("Failed persisting job {} error: {}", job_id, error);
    }
}

pub(crate) fn retry_budget_allows_resume(attempt: u32) -> bool {
    attempt < MAX_RETRIES
}

fn is_restart_recoverable_status(status: &str) -> bool {
    matches!(
        status.trim().to_ascii_lowercase().as_str(),
        "metadata"
            | "processing"
            | "downloading"
            | "extracting_audio"
            | "transcribing"
            | "indexing"
            | "retrying"
    )
}

fn claim_job_once(active_jobs: &mut HashSet<i64>, job_id: i64) -> bool {
    active_jobs.insert(job_id)
}

fn persist_worker_result(
    repo: &Arc<dyn JobRepository>,
    job: &JobMessage,
    result: &WorkerResult,
) -> Result<(), String> {
    // Validate and normalize every segment before opening the database
    // transaction. This guarantees malformed worker output cannot clear a
    // previously valid transcript and then fail halfway through a rewrite.
    let segments = result
        .segments
        .iter()
        .enumerate()
        .map(|(index, segment)| {
            let start = segment
                .get("start")
                .and_then(serde_json::Value::as_f64)
                .ok_or_else(|| format!("segment {} has no valid start", index))?;
            let end = segment
                .get("end")
                .and_then(serde_json::Value::as_f64)
                .ok_or_else(|| format!("segment {} has no valid end", index))?;
            let text = segment
                .get("text")
                .and_then(serde_json::Value::as_str)
                .filter(|text| !text.trim().is_empty())
                .ok_or_else(|| format!("segment {} has no valid text", index))?;
            Ok((index as i64, start, end, text.to_string()))
        })
        .collect::<Result<Vec<_>, String>>()?;

    let media_root = if job.download_dir.trim().is_empty() {
        std::env::var_os("PULSAR_DOWNLOAD_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(storage::default_media_root)
    } else {
        PathBuf::from(&job.download_dir)
    };
    let finalized = storage::finalize_job_media(&media_root, job.job_id, &result.transcript)
        .map_err(|error| format!("durable media finalization failed: {}", error))?;
    let generated_exports = storage::promote_generated_exports(&media_root, job.job_id)
        .map_err(|error| format!("generated output promotion failed: {}", error))?;
    // The Python worker writes automatic artifacts into the per-job staging
    // directory. Persist the result only after promotion so the database
    // never points at files that the next reconciliation is allowed to
    // remove.
    let durable_visual = result.visual_analysis.as_ref().map(|value| {
        rewrite_visual_artifact_paths(
            value,
            &storage::job_staging_dir(&media_root, job.job_id),
            &storage::durable_artifacts_root(job.job_id),
        )
    });
    let visual_json = durable_visual
        .as_ref()
        .and_then(|value| serde_json::to_string(value).ok());
    let connection = repo.get_connection()?;
    let mut connection = connection
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;

    let persist = if let Some(metadata) = &result.metadata {
        let video_path = finalized
            .video_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        let audio_path = finalized
            .audio_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        let transcript_path = finalized
            .transcript_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        let media_metadata = crate::db::MediaMetadata {
            title: &metadata.title,
            author: &metadata.uploader,
            thumbnail: &metadata.thumbnail,
            duration: metadata.duration,
            upload_date: &metadata.upload_date,
            video_path: &video_path,
            audio_path: &audio_path,
            transcript_path: &transcript_path,
            platform: metadata.platform.as_deref().unwrap_or("unknown"),
        };
        crate::db::persist_worker_result(
            &mut connection,
            job.job_id,
            Some(&media_metadata),
            &segments,
            visual_json.as_deref(),
            result.instructional_guide.as_deref(),
        )
        .map_err(|error| error.to_string())?;
        storage::register_generated_artifacts_with_metadata(
            &connection,
            job.job_id,
            durable_visual.as_ref(),
        )
        .map_err(|error| error.to_string())?;
        crate::db::set_media_poster_path(
            &connection,
            job.job_id,
            finalized
                .poster_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
                .as_deref(),
        )
        .map_err(|error| error.to_string())?;
        crate::db::update_media_storage(
            &connection,
            job.job_id,
            finalized
                .video_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
                .as_deref(),
            finalized
                .audio_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
                .as_deref(),
            finalized
                .transcript_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
                .as_deref(),
            finalized.video_bytes,
            finalized.audio_bytes,
            "local",
        )
        .map_err(|error| error.to_string())
    } else {
        crate::db::persist_worker_result(
            &mut connection,
            job.job_id,
            None,
            &segments,
            visual_json.as_deref(),
            result.instructional_guide.as_deref(),
        )
        .map_err(|error| error.to_string())?;
        storage::register_generated_artifacts_with_metadata(
            &connection,
            job.job_id,
            durable_visual.as_ref(),
        )
        .map_err(|error| error.to_string())?;
        if finalized.transcript_path.is_some()
            || finalized.video_path.is_some()
            || finalized.audio_path.is_some()
            || finalized.poster_path.is_some()
        {
            crate::db::update_media_storage(
                &connection,
                job.job_id,
                finalized
                    .video_path
                    .as_ref()
                    .map(|path| path.to_string_lossy().to_string())
                    .as_deref(),
                finalized
                    .audio_path
                    .as_ref()
                    .map(|path| path.to_string_lossy().to_string())
                    .as_deref(),
                finalized
                    .transcript_path
                    .as_ref()
                    .map(|path| path.to_string_lossy().to_string())
                    .as_deref(),
                finalized.video_bytes,
                finalized.audio_bytes,
                "local",
            )
            .map_err(|error| error.to_string())?;
            crate::db::set_media_poster_path(
                &connection,
                job.job_id,
                finalized
                    .poster_path
                    .as_ref()
                    .map(|path| path.to_string_lossy().to_string())
                    .as_deref(),
            )
            .map_err(|error| error.to_string())?;
        }
        Ok(())
    };

    for artifact in &result.generated_artifacts {
        let Some((_, path, size)) = generated_exports
            .iter()
            .find(|(format, _, _)| format == &artifact.format)
        else {
            return Err(format!(
                "worker reported output {} but Rust could not promote it",
                artifact.format
            ));
        };
        if !artifact.validated || !path.is_file() {
            return Err(format!(
                "worker output {} did not pass validation",
                artifact.format
            ));
        }
        crate::db::register_generated_output(
            &connection,
            crate::db::GeneratedOutputInput {
                job_id: job.job_id,
                category: &artifact.category,
                format: &artifact.format,
                path: &path.to_string_lossy(),
                size_bytes: *size,
                validated: artifact.validated,
                label: &artifact.label,
            },
        )
        .map_err(|error| error.to_string())?;
    }

    persist.map_err(|error| format!("worker result persistence failed: {}", error))?;
    let word_timestamps = result
        .segments
        .iter()
        .enumerate()
        .filter_map(|(index, segment)| {
            let words = segment.get("words")?.as_array()?;
            if words.is_empty() {
                return None;
            }
            Some((index as i64, serde_json::to_string(words).ok()?))
        })
        .collect::<Vec<_>>();
    if !word_timestamps.is_empty() {
        crate::db::update_transcript_words(&connection, job.job_id, &word_timestamps)
            .map_err(|error| format!("word timestamp persistence failed: {}", error))?;
    }
    // A successful job has already promoted the video/audio and copied every
    // durable knowledge artifact. Remove only its staging directory so audio
    // intermediates and the adjacent compatibility transcript cannot consume
    // quota or be mistaken for an incomplete job after restart.
    crate::db::clear_staging_job(&connection, job.job_id, &storage::staging_root(&media_root))
        .map_err(|error| format!("successful staging cleanup failed: {}", error))?;
    Ok(())
}

fn persist_progress_metadata(
    repo: &Arc<dyn JobRepository>,
    job_id: i64,
    metadata: &WorkerMetadata,
) -> Result<(), String> {
    let connection = repo.get_connection()?;
    let connection = connection
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    let video_path = processing_path(job_id, "video.mp4");
    let audio_path = processing_path(job_id, "audio.mp3");
    let transcript_path = processing_path(job_id, "transcript.txt");
    let video_path = video_path.to_string_lossy();
    let audio_path = audio_path.to_string_lossy();
    let transcript_path = transcript_path.to_string_lossy();
    let media_metadata = crate::db::MediaMetadata {
        title: &metadata.title,
        author: &metadata.uploader,
        thumbnail: &metadata.thumbnail,
        duration: metadata.duration,
        upload_date: &metadata.upload_date,
        video_path: video_path.as_ref(),
        audio_path: audio_path.as_ref(),
        transcript_path: transcript_path.as_ref(),
        platform: metadata.platform.as_deref().unwrap_or("unknown"),
    };
    crate::db::insert_or_update_media_metadata(&connection, job_id, &media_metadata)
        .map_err(|error| format!("metadata progress persistence failed: {}", error))
}

impl QueueService {
    pub fn new(job_repo: Arc<dyn JobRepository>, search_service: Arc<SearchService>) -> Self {
        Self::new_with_maintenance_lock(
            job_repo,
            search_service,
            Arc::new(tokio::sync::Mutex::new(())),
        )
    }

    pub fn new_with_maintenance_lock(
        job_repo: Arc<dyn JobRepository>,
        search_service: Arc<SearchService>,
        maintenance_lock: Arc<tokio::sync::Mutex<()>>,
    ) -> Self {
        let (sender, mut receiver) = mpsc::channel::<JobMessage>(QUEUE_CAPACITY);
        let configured_worker_count = std::env::var("PULSAR_WORKER_COUNT")
            .ok()
            .and_then(|value| value.parse::<usize>().ok());
        let worker_count = worker_count_for(num_cpus::get(), configured_worker_count);
        let worker_count = match std::env::var("PULSAR_PERFORMANCE_MODE").as_deref() {
            Ok("efficient") => 1,
            Ok("intelligent") if configured_worker_count.is_none() => worker_count.min(2),
            _ => worker_count,
        };
        let semaphore = Arc::new(Semaphore::new(worker_count));
        let idle_workers = Arc::new(tokio::sync::Mutex::new(Vec::<PythonWorker>::with_capacity(
            worker_count,
        )));
        let current_depth = Arc::new(AtomicUsize::new(0));
        let backpressure_active = Arc::new(AtomicBool::new(false));
        let circuit_breaker = Arc::new(CircuitBreaker::new());
        let active_jobs = Arc::new(tokio::sync::Mutex::new(HashSet::<i64>::new()));
        let processing_paused = Arc::new(AtomicBool::new(false));
        let background_admission_paused = Arc::new(AtomicBool::new(false));
        let profile_processing_authorized = Arc::new(AtomicBool::new(false));
        let admission_gate = QueueAdmissionGate {
            workers: semaphore.clone(),
            profiles: Arc::new(Semaphore::new(1)),
            processing_paused: processing_paused.clone(),
            background_paused: background_admission_paused.clone(),
            profile_processing_authorized: profile_processing_authorized.clone(),
            profile_cooldown: Duration::from_secs(30),
        };

        info!("Initializing worker pool with {} workers", worker_count);

        let repo_clone = job_repo.clone();
        let search_clone = search_service.clone();
        let depth_clone = current_depth.clone();
        let backpressure_clone = backpressure_active.clone();
        let breaker_clone = circuit_breaker.clone();
        let idle_workers_for_health = idle_workers.clone();
        let active_jobs_clone = active_jobs.clone();
        let processing_paused_clone = processing_paused.clone();

        tokio::spawn(async move {
            while let Some(message) = receiver.recv().await {
                while processing_paused_clone.load(Ordering::SeqCst) {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                }
                let runtime = QueueRuntime {
                    repo: repo_clone.clone(),
                    search: search_clone.clone(),
                    idle_workers: idle_workers.clone(),
                    current_depth: depth_clone.clone(),
                    backpressure_active: backpressure_clone.clone(),
                    circuit_breaker: breaker_clone.clone(),
                    active_jobs: active_jobs_clone.clone(),
                };

                let gate = admission_gate.clone();
                tokio::spawn(async move {
                    gate.run(
                        message.profile_background,
                        Self::execute_job_with_retries(message, runtime),
                    )
                    .await;
                });
            }
        });

        Self {
            sender,
            job_repo,
            active_jobs,
            current_depth,
            backpressure_active,
            circuit_breaker,
            worker_capacity: worker_count,
            idle_workers: idle_workers_for_health,
            processing_paused,
            background_admission_paused,
            profile_processing_authorized,
            profile_feeder_running: Arc::new(AtomicBool::new(false)),
            maintenance_lock,
        }
    }

    pub async fn runtime_status(&self) -> (usize, bool, usize, usize) {
        (
            self.current_depth.load(Ordering::SeqCst),
            self.backpressure_active.load(Ordering::SeqCst),
            self.worker_capacity,
            self.idle_workers.lock().await.len(),
        )
    }

    pub async fn is_active(&self, job_id: i64) -> bool {
        self.active_jobs.lock().await.contains(&job_id)
    }

    /// Returns a point-in-time snapshot of queue claims for maintenance jobs.
    /// The snapshot is intentionally short-lived; callers must still treat
    /// the database as the source of truth and use it only to avoid marking a
    /// currently running job stale.
    pub async fn active_job_ids(&self) -> Vec<i64> {
        self.active_jobs.lock().await.iter().copied().collect()
    }

    pub fn is_processing_paused(&self) -> bool {
        self.processing_paused.load(Ordering::SeqCst)
    }

    pub fn set_processing_paused(&self, paused: bool) {
        self.processing_paused.store(paused, Ordering::SeqCst);
    }

    pub fn is_background_admission_paused(&self) -> bool {
        self.background_admission_paused.load(Ordering::SeqCst)
    }

    pub fn set_background_admission_paused(&self, paused: bool) {
        self.background_admission_paused
            .store(paused, Ordering::SeqCst);
    }

    pub fn is_profile_processing_authorized(&self) -> bool {
        self.profile_processing_authorized.load(Ordering::SeqCst)
    }

    pub fn set_profile_processing_authorized(&self, authorized: bool) {
        self.profile_processing_authorized
            .store(authorized, Ordering::SeqCst);
    }

    /// Re-enqueues work that was demonstrably in flight before shutdown.
    /// Historical `queued` records require an explicit user action because
    /// their original admission may no longer be authorized. Profile work is
    /// admitted separately by the consent and source-state gated feeder.
    pub async fn resume_pending_jobs(self: &Arc<Self>) -> Result<usize, String> {
        let jobs = self.job_repo.get_all_jobs()?;
        let pending_jobs = jobs
            .into_iter()
            .filter(|job| is_restart_recoverable_status(&job.status))
            .collect::<Vec<_>>();

        let mut resumed = 0;
        for job in pending_jobs {
            if !retry_budget_allows_resume(job.retry_count) {
                persist_and_log_job_error(
                    &self.job_repo,
                    job.id,
                    "error_dlq",
                    "El presupuesto de reintentos se agotó antes del reinicio. Reintenta manualmente para autorizar una nueva serie.",
                );
                continue;
            }
            let profile_job = self.job_repo.get_connection().and_then(|connection| {
                let connection = connection
                    .lock()
                    .map_err(|_| "Database mutex poisoned".to_string())?;
                db::is_profile_job(&connection, job.id).map_err(|error| error.to_string())
            })?;
            // Claim the job before touching its files. This closes the race
            // with a manual retry arriving between the active check and the
            // cleanup below.
            let claimed = {
                let _maintenance_guard = self.maintenance_lock.lock().await;
                let mut active_jobs = self.active_jobs.lock().await;
                claim_job_once(&mut active_jobs, job.id)
            };
            if !claimed {
                continue;
            }

            // A power loss can leave a partial media directory behind. Clear
            // only this unfinished job before its fresh worker attempt; the
            // completed library remains untouched. Keep retry_count so a
            // restart cannot silently grant a failed job a new retry budget.
            let preparation = self.job_repo.get_connection().and_then(|connection| {
                let connection = connection
                    .lock()
                    .map_err(|_| "Database mutex poisoned".to_string())?;
                crate::db::cleanup_media_files(&connection, job.id, &processing_root())
                    .map_err(|error| error.to_string())?;
                crate::db::update_job_status(&connection, job.id, "queued", 0)
                    .map_err(|error| error.to_string())
            });
            if let Err(error) = preparation {
                self.active_jobs.lock().await.remove(&job.id);
                let message = format!("Could not prepare job {} for resume: {}", job.id, error);
                warn!("{}", message);
                persist_and_log_job_error(&self.job_repo, job.id, "error", &message);
                continue;
            }

            if profile_job {
                self.active_jobs.lock().await.remove(&job.id);
                resumed += 1;
                continue;
            }

            let result = self
                .enqueue_claimed(
                    job.id,
                    job.url,
                    job.retry_count,
                    std::env::var("PULSAR_COOKIES_FROM_BROWSER")
                        .ok()
                        .filter(|browser| !browser.trim().is_empty()),
                )
                .await;
            if result.is_err() {
                self.active_jobs.lock().await.remove(&job.id);
            }

            match result {
                Ok(()) => resumed += 1,
                Err(error) => {
                    warn!("Could not resume job {}: {}", job.id, error);
                    persist_and_log_job_error(&self.job_repo, job.id, "error", &error);
                }
            }
        }

        self.start_profile_job_feeder();
        Ok(resumed)
    }

    /// SQLite jobs remain the backlog. Admit one profile job at a time to the
    /// same channel, observing pause, performance policy and backpressure.
    pub fn start_profile_job_feeder(self: &Arc<Self>) {
        if self.profile_feeder_running.swap(true, Ordering::SeqCst) {
            return;
        }
        let queue = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(2)).await;
                if queue.is_processing_paused()
                    || queue.is_background_admission_paused()
                    || !queue.is_profile_processing_authorized()
                    || queue.current_depth.load(Ordering::SeqCst) >= QUEUE_HIGH_WATERMARK
                    || queue.backpressure_active.load(Ordering::SeqCst)
                {
                    continue;
                }
                let pending = queue.job_repo.get_connection().and_then(|connection| {
                    let connection = connection
                        .lock()
                        .map_err(|_| "Database mutex poisoned".to_string())?;
                    db::get_pending_profile_jobs(&connection).map_err(|error| error.to_string())
                });
                let pending = match pending {
                    Ok(jobs) => jobs,
                    Err(error) => {
                        warn!("Profile queue lookup failed: {error}");
                        continue;
                    }
                };
                let active = queue.active_job_ids().await;
                if let Some((id, url)) = pending.into_iter().find(|(id, _)| !active.contains(id)) {
                    if let Err(error) = queue.dispatch(id, url).await {
                        warn!("Profile admission failed: {error}");
                    }
                    while queue.is_active(id).await {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        });
    }

    pub async fn expand_collection(&self, url: &str) -> Result<Vec<String>, String> {
        self.expand_collection_with_browser(url, None).await
    }

    pub async fn expand_collection_with_browser(
        &self,
        url: &str,
        browser: Option<&str>,
    ) -> Result<Vec<String>, String> {
        let python_exe = resolve_python_exe();
        let script = resolve_worker_script();
        let worker_dir = script
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));

        let mut command = Command::new(python_exe);
        command
            .arg(&script)
            .arg("--expand-url")
            .arg(url)
            .current_dir(&worker_dir)
            .env("PYTHONPATH", &worker_dir)
            .env("PYTHONUNBUFFERED", "1");
        if let Some(browser) =
            browser.filter(|value| matches!(*value, "chrome" | "edge" | "firefox"))
        {
            command.env("PULSAR_COOKIES_FROM_BROWSER", browser);
        }
        crate::process_control::hide_tokio_command(&mut command);

        let output = tokio::time::timeout(Duration::from_secs(120), command.output())
            .await
            .map_err(|_| "Timed out expanding TikTok collection".to_string())?
            .map_err(|error| format!("Failed to start collection expansion: {}", error))?;

        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if detail.is_empty() {
                format!("Collection expansion exited with status {}", output.status)
            } else {
                detail
            });
        }

        let candidates: Vec<String> = serde_json::from_slice(&output.stdout)
            .map_err(|error| format!("Invalid collection expansion response: {}", error))?;
        let mut urls = Vec::new();
        let mut canonical_urls = HashSet::new();
        for candidate in candidates {
            let canonical = crate::url_utils::canonicalize_tiktok_url(&candidate);
            if crate::api::middleware::security::is_valid_sandbox_url(&candidate)
                && canonical_urls.insert(canonical.clone())
            {
                urls.push(canonical);
            }
        }
        Ok(urls)
    }

    pub async fn scan_source_with_browser(
        &self,
        profile_url: &str,
        categories: &[String],
        browser: Option<&str>,
        limit: usize,
        history_from: Option<&str>,
    ) -> Result<SourceScanResult, String> {
        let python_exe = resolve_python_exe();
        let script = resolve_worker_script();
        let worker_dir = script
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        let categories_json = serde_json::to_string(categories)
            .map_err(|error| format!("Could not encode source categories: {error}"))?;

        let mut command = Command::new(python_exe);
        command
            .arg(&script)
            .arg("--scan-source")
            .arg("--profile-url")
            .arg(profile_url)
            .arg("--categories")
            .arg(categories_json)
            .arg("--limit")
            .arg(if limit == 0 { 0 } else { limit.clamp(1, 1000) }.to_string())
            .current_dir(&worker_dir)
            .env("PYTHONPATH", &worker_dir)
            .env("PYTHONUNBUFFERED", "1");
        if let Some(history_from) = history_from.filter(|value| !value.trim().is_empty()) {
            command.arg("--from-date").arg(history_from);
        }
        if let Some(browser) =
            browser.filter(|value| matches!(*value, "chrome" | "edge" | "firefox"))
        {
            command.env("PULSAR_COOKIES_FROM_BROWSER", browser);
        }
        crate::process_control::hide_tokio_command(&mut command);

        let output = tokio::time::timeout(
            Duration::from_secs(if limit == 0 { 360 } else { 180 }),
            command.output(),
        )
        .await
        .map_err(|_| "Timed out inspecting TikTok source".to_string())?
        .map_err(|error| format!("Failed to start source scanner: {error}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let parsed: serde_json::Value = serde_json::from_str(&stdout).map_err(|error| {
            format!(
                "Invalid source scanner response: {error}; stderr: {}",
                if stderr.is_empty() { "none" } else { &stderr }
            )
        })?;
        if let Some(error) = parsed.get("error").and_then(|value| value.as_str()) {
            return Err(error.to_string());
        }
        if !output.status.success() {
            return Err(if stderr.is_empty() {
                format!("Source scanner exited with status {}", output.status)
            } else {
                stderr
            });
        }
        serde_json::from_value(parsed)
            .map_err(|error| format!("Invalid structured source scanner response: {error}"))
    }

    #[instrument(skip(self))]
    pub async fn dispatch(&self, job_id: i64, url: String) -> Result<(), String> {
        let env_browser = std::env::var("PULSAR_COOKIES_FROM_BROWSER")
            .ok()
            .filter(|b| !b.trim().is_empty());
        self.dispatch_with_browser(job_id, url, env_browser).await
    }

    pub async fn dispatch_with_browser(
        &self,
        job_id: i64,
        url: String,
        cookies_browser: Option<String>,
    ) -> Result<(), String> {
        self.dispatch_with_attempt_and_browser(job_id, url, 0, cookies_browser)
            .await
    }

    /// Explicitly resumes a persisted queued job without resetting its retry
    /// budget. The caller must only use this after user authorization.
    pub async fn dispatch_with_attempt(
        &self,
        job_id: i64,
        url: String,
        attempt: u32,
    ) -> Result<(), String> {
        let env_browser = std::env::var("PULSAR_COOKIES_FROM_BROWSER")
            .ok()
            .filter(|browser| !browser.trim().is_empty());
        self.dispatch_with_attempt_and_browser(job_id, url, attempt, env_browser)
            .await
    }

    async fn dispatch_with_attempt_and_browser(
        &self,
        job_id: i64,
        url: String,
        attempt: u32,
        cookies_browser: Option<String>,
    ) -> Result<(), String> {
        if !retry_budget_allows_resume(attempt) {
            return Err("El presupuesto de reintentos está agotado; revisa el trabajo antes de iniciar una nueva serie.".to_string());
        }
        // Dispatch is idempotent per job. Keep the claim while the admission
        // decision and send complete so a concurrent retry cannot observe a
        // half-admitted job.
        let claimed = {
            let _maintenance_guard = self.maintenance_lock.lock().await;
            let mut active_jobs = self.active_jobs.lock().await;
            claim_job_once(&mut active_jobs, job_id)
        };
        if !claimed {
            return Ok(());
        }

        let result = self
            .enqueue_claimed(job_id, url, attempt, cookies_browser)
            .await;
        if result.is_err() {
            self.active_jobs.lock().await.remove(&job_id);
        }

        if let Err(error) = &result {
            persist_and_log_job_error(&self.job_repo, job_id, "error", error);
        }
        result
    }

    /// Rebuilds the vector index only while the queue admission gate is held.
    /// This closes the race where a worker could be claimed after an external
    /// active-job check but before the rebuild starts.
    pub async fn begin_maintenance(&self) -> Result<tokio::sync::MutexGuard<'_, ()>, String> {
        let guard = self.maintenance_lock.lock().await;
        if !self.active_jobs.lock().await.is_empty() {
            return Err(
                "No se puede iniciar mantenimiento mientras hay trabajos activos".to_string(),
            );
        }
        Ok(guard)
    }

    pub async fn rebuild_index_from_persisted_rows(
        &self,
        search_service: &SearchService,
    ) -> Result<Option<usize>, String> {
        let _maintenance_guard = self.maintenance_lock.lock().await;
        if !self.active_jobs.lock().await.is_empty() {
            return Ok(None);
        }

        let connection = self
            .job_repo
            .get_connection()
            .map_err(|error| format!("Could not open database for index rebuild: {error}"))?;
        let rows = {
            let connection = connection
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            crate::db::get_all_embedding_rows(&connection)
                .map_err(|error| format!("Could not read embeddings for index rebuild: {error}"))?
        };

        if rows.is_empty() {
            tracing::warn!(
                "Skipping HNSW rebuild: no persisted embeddings found. Index unchanged."
            );
            return Ok(Some(0));
        }

        search_service.rebuild_index(&rows).map(Some)
    }

    async fn enqueue_claimed(
        &self,
        job_id: i64,
        url: String,
        attempt: u32,
        cookies_browser: Option<String>,
    ) -> Result<(), String> {
        if !self.circuit_breaker.allow_request() {
            return Err("Service unavailable: circuit breaker is open".to_string());
        }

        // All entry points (including the loopback API) must share the same
        // disk admission gate. The command handler performs an early check,
        // but this check closes the bypass for callers that enqueue directly.
        let media_root = std::env::var_os("PULSAR_DOWNLOAD_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(storage::default_media_root);
        storage::ensure_capacity(&media_root)?;

        let profile_background = self.job_repo.get_connection().and_then(|connection| {
            let connection = connection
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            db::is_profile_job(&connection, job_id).map_err(|error| error.to_string())
        })?;
        self.reserve_depth()?;
        let formats =
            std::env::var("PULSAR_FORMATS").unwrap_or_else(|_| "[\"mp4\",\"mp3\",\"txt\"]".into());
        let download_dir = std::env::var("PULSAR_DOWNLOAD_DIR").unwrap_or_default();
        let retention = std::env::var("PULSAR_DEFAULT_RETENTION").unwrap_or_else(|_| "keep".into());
        let processing_quality =
            std::env::var("PULSAR_PROCESSING_QUALITY").unwrap_or_else(|_| "78".into());
        let whisper_model = std::env::var("WHISPER_MODEL").unwrap_or_else(|_| "tiny".into());
        let whisper_device = std::env::var("WHISPER_DEVICE").unwrap_or_else(|_| "cpu".into());
        let whisper_compute_type =
            std::env::var("WHISPER_COMPUTE_TYPE").unwrap_or_else(|_| "int8".into());
        if let Err(error) = self
            .sender
            .send(JobMessage {
                job_id,
                url,
                attempt,
                cookies_browser,
                formats,
                download_dir,
                retention,
                processing_quality,
                whisper_model,
                whisper_device,
                whisper_compute_type,
                profile_background,
            })
            .await
        {
            Self::decrement_depth(&self.current_depth, &self.backpressure_active);
            return Err(format!("Queue unavailable: {}", error));
        }

        counter!("jobs_total").increment(1);
        Ok(())
    }

    fn reserve_depth(&self) -> Result<(), String> {
        if self.backpressure_active.load(Ordering::SeqCst) {
            return Err(BACKPRESSURE_ERROR.to_string());
        }

        let mut depth = self.current_depth.load(Ordering::SeqCst);
        loop {
            if depth >= QUEUE_CAPACITY {
                self.backpressure_active.store(true, Ordering::SeqCst);
                gauge!("queue_depth").set(depth as f64);
                return Err(BACKPRESSURE_ERROR.to_string());
            }

            let next_depth = depth + 1;
            match self.current_depth.compare_exchange(
                depth,
                next_depth,
                Ordering::SeqCst,
                Ordering::SeqCst,
            ) {
                Ok(_) => {
                    gauge!("queue_depth").set(next_depth as f64);
                    if next_depth >= QUEUE_HIGH_WATERMARK {
                        self.backpressure_active.store(true, Ordering::SeqCst);
                    }
                    return Ok(());
                }
                Err(actual) => depth = actual,
            }
        }
    }

    async fn execute_job_with_retries(mut message: JobMessage, runtime: QueueRuntime) {
        let QueueRuntime {
            repo,
            search,
            idle_workers,
            current_depth,
            backpressure_active,
            circuit_breaker,
            active_jobs,
        } = runtime;
        if let Err(error) = repo.update_status(message.job_id, "processing", 0) {
            let message_text = format!("Could not mark job as processing: {}", error);
            persist_and_log_job_error(&repo, message.job_id, "error", &message_text);
            Self::decrement_depth(&current_depth, &backpressure_active);
            active_jobs.lock().await.remove(&message.job_id);
            return;
        }
        let python_path = resolve_python_exe();
        let script_path = resolve_worker_script();

        loop {
            // Do not hold the pool mutex while spawning Python. Process
            // creation can take seconds on a cold bundled runtime and should
            // not serialize access to already-idle workers.
            let idle_worker = idle_workers.lock().await.pop();
            let worker_result = match idle_worker {
                Some(worker) => Ok(worker),
                None => {
                    PythonWorker::spawn(
                        &python_path.to_string_lossy(),
                        &script_path.to_string_lossy(),
                    )
                    .await
                }
            };

            let (result, worker) = match worker_result {
                Ok(mut worker) => {
                    gauge!("worker_utilization").increment(1.0);
                    let result =
                        Self::run_pipeline(&message, repo.clone(), search.clone(), &mut worker)
                            .await;
                    gauge!("worker_utilization").decrement(1.0);
                    (result, Some(worker))
                }
                Err(error) => (Err(QueueError::ProcessingError(error.to_string())), None),
            };

            let is_systemic_failure = match &result {
                Err(QueueError::ProcessingError(msg)) => {
                    msg.contains("ProcessSpawnError")
                        || msg.contains("IOError")
                        || msg.contains("EOF")
                        || msg.contains("Connection broken")
                        || msg.contains("died")
                        || msg.to_ascii_lowercase().contains("timed out")
                        || msg.contains("writing stdin")
                }
                _ => false,
            };

            if result.is_ok() {
                circuit_breaker.record_success();
            } else if is_systemic_failure {
                circuit_breaker.record_failure();
            }

            if let Some(worker) = worker {
                let worker_is_healthy = result.as_ref().is_ok()
                    || !matches!(
                        result,
                        Err(QueueError::ProcessingError(ref message))
                            if message.contains("EOF")
                                || message.contains("Connection broken")
                                || message.contains("died")
                                || message.to_ascii_lowercase().contains("timed out")
                                || message.to_ascii_lowercase().contains("timeout")
                                || message.contains("writing stdin")
                    );
                if worker_is_healthy {
                    idle_workers.lock().await.push(worker);
                }
            }

            match result {
                Ok(()) => {
                    if let Err(error) = repo.update_status(message.job_id, "complete", 100) {
                        let message_text = format!(
                            "Pipeline completed but final job status could not be persisted: {}",
                            error
                        );
                        persist_and_log_job_error(&repo, message.job_id, "error", &message_text);
                        counter!("jobs_failed").increment(1);
                    } else {
                        counter!("jobs_completed").increment(1);
                    }
                    Self::decrement_depth(&current_depth, &backpressure_active);
                    active_jobs.lock().await.remove(&message.job_id);
                    return;
                }
                Err(error) => {
                    message.attempt += 1;
                    warn!(
                        "Job {} failed on attempt {}: {}",
                        message.job_id, message.attempt, error
                    );
                    if let Err(update_error) = repo.update_retrying(message.job_id, message.attempt)
                    {
                        let message_text = format!(
                            "Could not persist retry state after pipeline failure: {}; original error: {}",
                            update_error, error
                        );
                        persist_and_log_job_error(
                            &repo,
                            message.job_id,
                            "error_dlq",
                            &message_text,
                        );
                        Self::decrement_depth(&current_depth, &backpressure_active);
                        counter!("jobs_failed").increment(1);
                        active_jobs.lock().await.remove(&message.job_id);
                        return;
                    }
                    if message.attempt >= MAX_RETRIES {
                        persist_and_log_job_error(
                            &repo,
                            message.job_id,
                            "error_dlq",
                            &error.to_string(),
                        );
                        Self::decrement_depth(&current_depth, &backpressure_active);
                        counter!("jobs_failed").increment(1);
                        active_jobs.lock().await.remove(&message.job_id);
                        return;
                    }

                    let backoff_seconds = 2_u64.pow(message.attempt.min(5));
                    tokio::time::sleep(Duration::from_secs(backoff_seconds)).await;
                }
            }
        }
    }

    fn decrement_depth(depth: &AtomicUsize, backpressure: &AtomicBool) {
        let mut current = depth.load(Ordering::SeqCst);
        let new_depth = loop {
            let next = current.saturating_sub(1);
            match depth.compare_exchange(current, next, Ordering::SeqCst, Ordering::SeqCst) {
                Ok(_) => break next,
                Err(actual) => current = actual,
            }
        };
        gauge!("queue_depth").set(new_depth as f64);
        if backpressure.load(Ordering::SeqCst) && new_depth <= QUEUE_LOW_WATERMARK {
            backpressure.store(false, Ordering::SeqCst);
        }
    }

    async fn run_pipeline(
        job: &JobMessage,
        repo: Arc<dyn JobRepository>,
        search_service: Arc<SearchService>,
        worker: &mut PythonWorker,
    ) -> Result<(), QueueError> {
        let start_time = std::time::Instant::now();
        let progress_repo = repo.clone();
        let job_id = job.job_id;
        let mut metadata_persisted = false;
        let progress_error = Arc::new(StdMutex::new(None::<String>));
        let progress_error_for_callback = progress_error.clone();
        let worker_output = tokio::time::timeout(
            Duration::from_secs(JOB_TIMEOUT_SECONDS),
            worker.run_job(job, move |step, progress, metadata| {
                let normalized = match step {
                    "download_started" | "downloading" => "downloading",
                    "audio_extraction" | "audio_extracted" => "processing",
                    "transcription_started" | "transcribing" => "transcribing",
                    "indexing" => "indexing",
                    "completed" | "complete" => "complete",
                    // The worker reports a failed attempt before the queue
                    // applies backoff. Keep that transient state out of the
                    // final-error surface so the UI cannot race the retry.
                    "error" => "retrying",
                    _ => "processing",
                };
                if let Err(error) = progress_repo.update_status(job_id, normalized, progress) {
                    if let Ok(mut recorded) = progress_error_for_callback.lock() {
                        if recorded.is_none() {
                            *recorded = Some(format!(
                                "Could not persist progress for job {}: {}",
                                job_id, error
                            ));
                        }
                    }
                }
                if !metadata_persisted {
                    if let Some(metadata) = metadata {
                        if let Err(error) =
                            persist_progress_metadata(&progress_repo, job_id, metadata)
                        {
                            warn!(
                                "Could not persist early metadata for job {}: {}",
                                job_id, error
                            );
                        } else {
                            metadata_persisted = true;
                        }
                    }
                }
            }),
        )
        .await;
        if let Ok(mut recorded) = progress_error.lock() {
            if let Some(error) = recorded.take() {
                return Err(QueueError::ProcessingError(error));
            }
        }
        let result = match worker_output {
            Ok(Ok(Some(worker_result))) => {
                // A silent video is still a valid media job. Persist its
                // metadata/visual analysis and complete it without semantic
                // indexing; searchable chunks are created only when text exists.
                if let Err(error) = persist_worker_result(&repo, job, &worker_result) {
                    Err(QueueError::ProcessingError(error))
                } else {
                    if let Some(visual_analysis) = worker_result.visual_analysis.as_ref() {
                        let raw_visual = serde_json::to_string(visual_analysis)
                            .map_err(|error| QueueError::ProcessingError(error.to_string()))?;
                        match repo.get_connection() {
                            Ok(connection) => match connection.lock() {
                                Ok(mut connection) => {
                                    if let Err(error) = crate::db::index_visual_search_units(
                                        &mut connection,
                                        job.job_id,
                                        Some(&raw_visual),
                                    ) {
                                        // OCR is optional enrichment; a malformed
                                        // visual frame must not hide transcript or
                                        // metadata results.
                                        warn!(
                                            "OCR indexing skipped for job {}: {}",
                                            job.job_id, error
                                        );
                                    }
                                }
                                Err(_) => warn!(
                                    "OCR indexing skipped for job {}: database mutex poisoned",
                                    job.job_id
                                ),
                            },
                            Err(error) => {
                                warn!("OCR indexing skipped for job {}: {}", job.job_id, error)
                            }
                        }
                    }

                    if worker_result.transcript.trim().is_empty() {
                        Ok(())
                    } else if let Err(error) = (|| {
                        let connection = repo.get_connection()?;
                        let connection = connection
                            .lock()
                            .map_err(|_| "Database mutex poisoned".to_string())?;
                        let segments = crate::db::get_transcript_segments(&connection, job.job_id)
                            .map_err(|error| error.to_string())?;
                        search_service.index_document_with_segments(job.job_id, &segments)
                    })() {
                        Err(QueueError::ProcessingError(format!(
                            "HNSW indexing failed: {}",
                            error
                        )))
                    } else if let Err(error) = search_service.snapshot_index() {
                        Err(QueueError::ProcessingError(format!(
                            "HNSW snapshot failed: {}",
                            error
                        )))
                    } else {
                        let retention = std::env::var("PULSAR_DEFAULT_RETENTION")
                            .unwrap_or_else(|_| "keep".to_string());
                        let connection =
                            repo.get_connection().map_err(QueueError::ProcessingError)?;
                        let connection = connection.lock().map_err(|_| {
                            QueueError::ProcessingError("Database mutex poisoned".to_string())
                        })?;
                        if retention == "online" {
                            // `online` means the job is eligible for an explicit,
                            // explainable purge. Never remove media silently at
                            // the end of a successful download.
                            crate::db::set_media_keep_status(&connection, job.job_id, "online")
                                .map_err(|error| {
                                    QueueError::ProcessingError(format!(
                                        "retention status failed: {}",
                                        error
                                    ))
                                })?;
                        } else {
                            crate::db::set_media_keep_status(&connection, job.job_id, "keep")
                                .map_err(|error| {
                                    QueueError::ProcessingError(format!(
                                        "retention status failed: {}",
                                        error
                                    ))
                                })?;
                        }
                        Ok(())
                    }
                }
            }
            Ok(Ok(None)) => Err(QueueError::ProcessingError(
                "Worker completed without a result".to_string(),
            )),
            Ok(Err(error)) => Err(QueueError::ProcessingError(error.to_string())),
            Err(_) => Err(QueueError::ProcessingError(format!(
                "Worker timed out after {} seconds",
                JOB_TIMEOUT_SECONDS
            ))),
        };

        histogram!("pipeline_latency_seconds").record(start_time.elapsed().as_secs_f64());
        result
    }
}

#[cfg(test)]
mod tests {
    use super::{rewrite_visual_artifact_paths, worker_count_for};
    use serde_json::json;
    use std::path::PathBuf;

    #[tokio::test]
    async fn profile_admission_is_serial_and_foreground_can_run_during_cooldown() {
        use super::QueueAdmissionGate;
        use std::sync::{atomic::AtomicBool, Arc};
        use tokio::sync::{oneshot, Semaphore};
        use tokio::time::{Duration, Instant};
        let gate = QueueAdmissionGate {
            workers: Arc::new(Semaphore::new(1)),
            profiles: Arc::new(Semaphore::new(1)),
            processing_paused: Arc::new(AtomicBool::new(false)),
            background_paused: Arc::new(AtomicBool::new(false)),
            profile_processing_authorized: Arc::new(AtomicBool::new(true)),
            profile_cooldown: Duration::from_millis(80),
        };
        let (finished, receiver) = oneshot::channel();
        let first_gate = gate.clone();
        let first = tokio::spawn(async move {
            first_gate
                .run(true, async {
                    finished.send(Instant::now()).unwrap();
                })
                .await;
        });
        let finished_at = receiver.await.unwrap();
        let second_gate = gate.clone();
        let second = tokio::spawn(async move {
            second_gate
                .run(true, async {
                    assert!(
                        finished_at.elapsed() >= Duration::from_millis(80),
                        "next profile must wait for the cooldown"
                    );
                })
                .await;
        });
        tokio::time::timeout(Duration::from_millis(40), gate.run(false, async {}))
            .await
            .expect("foreground admission must not wait for the profile cooldown");
        first.await.unwrap();
        second.await.unwrap();
    }

    #[tokio::test]
    async fn profile_admission_waits_for_current_rights_consent() {
        use super::QueueAdmissionGate;
        use std::sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        };
        use tokio::sync::Semaphore;
        use tokio::time::Duration;

        let authorized = Arc::new(AtomicBool::new(false));
        let processed = Arc::new(AtomicBool::new(false));
        let gate = QueueAdmissionGate {
            workers: Arc::new(Semaphore::new(1)),
            profiles: Arc::new(Semaphore::new(1)),
            processing_paused: Arc::new(AtomicBool::new(false)),
            background_paused: Arc::new(AtomicBool::new(false)),
            profile_processing_authorized: authorized.clone(),
            profile_cooldown: Duration::ZERO,
        };

        let work_processed = processed.clone();
        let task = tokio::spawn(async move {
            gate.run(true, async move {
                work_processed.store(true, Ordering::SeqCst);
            })
            .await;
        });
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert!(!processed.load(Ordering::SeqCst));

        authorized.store(true, Ordering::SeqCst);
        tokio::time::timeout(Duration::from_millis(500), task)
            .await
            .expect("profile work should resume after consent is saved")
            .unwrap();
        assert!(processed.load(Ordering::SeqCst));
    }

    #[test]
    fn restart_resume_never_exceeds_the_persisted_retry_budget() {
        assert!(super::retry_budget_allows_resume(0));
        assert!(super::retry_budget_allows_resume(super::MAX_RETRIES - 1));
        assert!(!super::retry_budget_allows_resume(super::MAX_RETRIES));
        assert!(!super::retry_budget_allows_resume(super::MAX_RETRIES + 1));
    }

    #[test]
    fn restart_admission_excludes_historical_queued_and_terminal_jobs() {
        assert!(!super::is_restart_recoverable_status("queued"));
        assert!(!super::is_restart_recoverable_status("complete"));
        assert!(!super::is_restart_recoverable_status("error_dlq"));
        assert!(super::is_restart_recoverable_status("processing"));
        assert!(super::is_restart_recoverable_status("retrying"));
    }

    #[test]
    fn concurrent_recovery_claims_a_job_only_once() {
        let mut active_jobs = std::collections::HashSet::new();
        assert!(super::claim_job_once(&mut active_jobs, 42));
        assert!(!super::claim_job_once(&mut active_jobs, 42));
        assert_eq!(active_jobs.len(), 1);
    }

    #[tokio::test]
    async fn paused_queue_does_not_start_jobs_waiting_for_worker_capacity() {
        use super::QueueAdmissionGate;
        use std::sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        };
        use tokio::sync::Semaphore;
        use tokio::time::{sleep, timeout, Duration};

        let processing_paused = Arc::new(AtomicBool::new(false));
        let started = Arc::new(AtomicBool::new(false));
        let workers = Arc::new(Semaphore::new(0));
        let gate = QueueAdmissionGate {
            workers: workers.clone(),
            profiles: Arc::new(Semaphore::new(1)),
            processing_paused: processing_paused.clone(),
            background_paused: Arc::new(AtomicBool::new(false)),
            profile_processing_authorized: Arc::new(AtomicBool::new(true)),
            profile_cooldown: Duration::ZERO,
        };

        let task_started = started.clone();
        let task = tokio::spawn(async move {
            gate.run(false, async move {
                task_started.store(true, Ordering::SeqCst);
            })
            .await;
        });

        sleep(Duration::from_millis(25)).await;
        processing_paused.store(true, Ordering::SeqCst);
        workers.add_permits(1);
        sleep(Duration::from_millis(50)).await;
        assert!(!started.load(Ordering::SeqCst));

        processing_paused.store(false, Ordering::SeqCst);
        timeout(Duration::from_millis(500), task)
            .await
            .expect("queued work should resume after the pause is lifted")
            .unwrap();
        assert!(started.load(Ordering::SeqCst));
    }

    #[test]
    fn worker_pool_has_safe_default_and_configured_bounds() {
        assert_eq!(worker_count_for(1, None), 1);
        assert_eq!(worker_count_for(32, None), 4);
        assert_eq!(worker_count_for(32, Some(0)), 1);
        assert_eq!(worker_count_for(32, Some(12)), 8);
        assert_eq!(worker_count_for(32, Some(6)), 6);
    }

    #[test]
    fn visual_artifact_paths_are_promoted_to_durable_storage() {
        let staging = PathBuf::from(r"C:\Pulsaria\staging\42");
        let durable = PathBuf::from(r"C:\Users\tester\AppData\Roaming\Pulsaria\artifacts\42");
        let value = json!({
            "poster_path": r"C:\Pulsaria\staging\42\poster.jpg",
            "keyframe_paths": [
                r"C:\Pulsaria\staging\42\keyframe-001.jpg"
            ],
            "artifacts": [{
                "path": r"C:\Pulsaria\staging\42\keyframe-001.jpg"
            }],
            "artifacts_dir": r"C:\Pulsaria\staging\42",
            "ocr_text": r"C:\Pulsaria\staging\42\keep-this.txt"
        });

        let rewritten = rewrite_visual_artifact_paths(&value, &staging, &durable);
        assert_eq!(
            rewritten["poster_path"],
            json!(r"C:\Users\tester\AppData\Roaming\Pulsaria\artifacts\42\poster.jpg")
        );
        assert_eq!(
            rewritten["keyframe_paths"][0],
            json!(r"C:\Users\tester\AppData\Roaming\Pulsaria\artifacts\42\keyframe-001.jpg")
        );
        assert_eq!(rewritten["artifacts_dir"], json!(durable.to_string_lossy()));
        assert_eq!(
            rewritten["ocr_text"],
            json!(r"C:\Pulsaria\staging\42\keep-this.txt")
        );
    }
}
