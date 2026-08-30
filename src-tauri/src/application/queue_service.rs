use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

use metrics::{counter, gauge, histogram};
use tokio::process::Command;
use tokio::sync::{mpsc, Semaphore};
use tokio::time::Duration;
use tracing::{error, info, instrument, warn};

use crate::application::search_service::SearchService;
use crate::domain::ports::JobRepository;
use crate::infrastructure::workers::python_runner::{PythonWorker, WorkerResult};
use crate::domain::models::JobMessage;
use crate::resilience::circuit_breaker::CircuitBreaker;

const MAX_RETRIES: u32 = 3;
const QUEUE_HIGH_WATERMARK: usize = 80;
const QUEUE_LOW_WATERMARK: usize = 40;

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
    current_depth: Arc<AtomicUsize>,
    backpressure_active: Arc<AtomicBool>,
    circuit_breaker: Arc<CircuitBreaker>,
}

fn bundled_resource_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join("resources")))
}

fn resolve_python_exe() -> PathBuf {
    if let Some(custom) = std::env::var_os("PYTHON_EXE").or_else(|| std::env::var_os("PULSAR_PYTHON_PATH")) {
        let path = PathBuf::from(custom);
        if path.exists() {
            return path;
        }
    }
    let bundled = bundled_resource_dir();
    let mut candidates = Vec::new();
    if let Some(resource_dir) = bundled {
        candidates.push(resource_dir.join("python").join("python.exe"));
        candidates.push(resource_dir.join("python").join("bin").join("python3"));
    }
    candidates.extend([
        PathBuf::from("src-tauri/resources/python/python.exe"),
        PathBuf::from("python-workers/.venv/Scripts/python.exe"),
        PathBuf::from("../python-workers/.venv/Scripts/python.exe"),
        PathBuf::from("python-workers/.venv/bin/python"),
        PathBuf::from("../python-workers/.venv/bin/python"),
        PathBuf::from("python-workers/bin/python"),
        PathBuf::from("../python-workers/bin/python"),
        PathBuf::from("/usr/local/bin/python"),
        PathBuf::from("/usr/bin/python3"),
    ]);
    candidates
        .into_iter()
        .find(|candidate| candidate.exists())
        .unwrap_or_else(|| PathBuf::from("python"))
}

fn resolve_worker_script() -> PathBuf {
    let bundled = bundled_resource_dir();
    let mut candidates = Vec::new();
    if let Some(resource_dir) = bundled {
        candidates.push(resource_dir.join("python-workers").join("main.py"));
    }
    candidates.extend([
        PathBuf::from("src-tauri/resources/python-workers/main.py"),
        PathBuf::from("python-workers/main.py"),
        PathBuf::from("../python-workers/main.py"),
    ]);
    candidates
        .into_iter()
        .find(|candidate| candidate.exists())
        .unwrap_or_else(|| PathBuf::from("python-workers/main.py"))
}

fn processing_root() -> PathBuf {
    std::env::var_os("PULSAR_DOWNLOAD_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(crate::db::data_dir_path)
        .join("processing")
}

fn processing_path(job_id: i64, file_name: &str) -> PathBuf {
    let root = std::env::var_os("PULSAR_DOWNLOAD_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(crate::db::data_dir_path);
    root.join("processing")
        .join(job_id.to_string())
        .join(file_name)
}

fn persist_job_error(repo: &Arc<dyn JobRepository>, job_id: i64, status: &str, message: &str) {
    let result = repo.get_connection().and_then(|connection| {
        let connection = connection
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        crate::db::update_job_error(&connection, job_id, status, message)
            .map_err(|error| error.to_string())
    });
    if let Err(error) = result {
        warn!("Failed persisting job {} error: {}", job_id, error);
    }
}

fn persist_worker_result(
    repo: &Arc<dyn JobRepository>,
    job: &JobMessage,
    result: &WorkerResult,
) -> Result<(), String> {
    let connection = repo.get_connection()?;
    let connection = connection
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;

    if let Some(metadata) = &result.metadata {
        let video_path = processing_path(job.job_id, "video.mp4");
        let audio_path = processing_path(job.job_id, "audio.mp3");
        let transcript_path = processing_path(job.job_id, "transcript.txt");
        crate::db::insert_or_update_media_metadata(
            &connection,
            job.job_id,
            &metadata.title,
            &metadata.uploader,
            &metadata.thumbnail,
            metadata.duration,
            &metadata.upload_date,
            &video_path.to_string_lossy(),
            &audio_path.to_string_lossy(),
            &transcript_path.to_string_lossy(),
            metadata.platform.as_deref().unwrap_or("unknown"),
        )
        .map_err(|error| format!("metadata persistence failed: {}", error))?;
    }

    crate::db::clear_transcript_data(&connection, job.job_id)
        .map_err(|error| format!("transcript cleanup failed: {}", error))?;
    for (index, segment) in result.segments.iter().enumerate() {
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
        crate::db::insert_transcript_segment(
            &connection,
            job.job_id,
            index as i64,
            start,
            end,
            text,
        )
        .map_err(|error| format!("segment persistence failed: {}", error))?;
    }

    let visual_json = result
        .visual_analysis
        .as_ref()
        .and_then(|value| serde_json::to_string(value).ok());
    crate::db::update_media_analysis(
        &connection,
        job.job_id,
        visual_json.as_deref(),
        result.instructional_guide.as_deref(),
    )
    .map_err(|error| format!("visual analysis persistence failed: {}", error))?;

    Ok(())
}

impl QueueService {
    pub fn new(job_repo: Arc<dyn JobRepository>, search_service: Arc<SearchService>) -> Self {
        let (sender, mut receiver) = mpsc::channel::<JobMessage>(100);
        let worker_count = (num_cpus::get().saturating_sub(1)).max(1);
        let semaphore = Arc::new(Semaphore::new(worker_count));
        let idle_workers = Arc::new(tokio::sync::Mutex::new(Vec::<PythonWorker>::with_capacity(
            worker_count,
        )));
        let current_depth = Arc::new(AtomicUsize::new(0));
        let backpressure_active = Arc::new(AtomicBool::new(false));
        let circuit_breaker = Arc::new(CircuitBreaker::new());

        info!("Initializing worker pool with {} workers", worker_count);

        let repo_clone = job_repo.clone();
        let search_clone = search_service.clone();
        let depth_clone = current_depth.clone();
        let backpressure_clone = backpressure_active.clone();
        let breaker_clone = circuit_breaker.clone();

        tokio::spawn(async move {
            while let Some(message) = receiver.recv().await {
                let permit = match semaphore.clone().acquire_owned().await {
                    Ok(permit) => permit,
                    Err(error) => {
                        error!("Failed acquiring worker permit: {}", error);
                        continue;
                    }
                };

                let repo = repo_clone.clone();
                let search = search_clone.clone();
                let workers = idle_workers.clone();
                let depth = depth_clone.clone();
                let backpressure = backpressure_clone.clone();
                let breaker = breaker_clone.clone();

                tokio::spawn(async move {
                    Self::execute_job_with_retries(
                        message,
                        repo,
                        search,
                        workers,
                        depth,
                        backpressure,
                        breaker,
                    )
                    .await;
                    drop(permit);
                });
            }
        });

        Self {
            sender,
            current_depth,
            backpressure_active,
            circuit_breaker,
        }
    }

    pub async fn expand_collection(&self, url: &str) -> Result<Vec<String>, String> {
        let python_exe = resolve_python_exe();
        let script = resolve_worker_script();
        let worker_dir = script
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));

        let output = tokio::time::timeout(
            Duration::from_secs(120),
            Command::new(python_exe)
                .arg(&script)
                .arg("--expand-url")
                .arg(url)
                .current_dir(&worker_dir)
                .env("PYTHONPATH", &worker_dir)
                .env("PYTHONUNBUFFERED", "1")
                .output(),
        )
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
        for candidate in candidates {
            if crate::api::middleware::security::is_valid_sandbox_url(&candidate)
                && !urls.iter().any(|existing| existing == &candidate)
            {
                urls.push(candidate);
            }
        }
        Ok(urls)
    }

    #[instrument(skip(self))]
    pub async fn dispatch(&self, job_id: i64, url: String) -> Result<(), String> {
        if !self.circuit_breaker.allow_request() {
            return Err("Service unavailable: circuit breaker is open".to_string());
        }

        let depth = self.current_depth.load(Ordering::SeqCst);
        if self.backpressure_active.load(Ordering::SeqCst) {
            if depth <= QUEUE_LOW_WATERMARK {
                self.backpressure_active.store(false, Ordering::SeqCst);
            } else {
                return Err("System is saturated: backpressure applied".to_string());
            }
        } else if depth >= QUEUE_HIGH_WATERMARK {
            self.backpressure_active.store(true, Ordering::SeqCst);
            return Err("System is saturated: backpressure applied".to_string());
        }

        self.sender
            .send(JobMessage {
                job_id,
                url,
                attempt: 0,
            })
            .await
            .map_err(|error| error.to_string())?;

        let new_depth = self.current_depth.fetch_add(1, Ordering::SeqCst) + 1;
        gauge!("queue_depth").set(new_depth as f64);
        counter!("jobs_total").increment(1);
        Ok(())
    }

    async fn execute_job_with_retries(
        mut message: JobMessage,
        repo: Arc<dyn JobRepository>,
        search: Arc<SearchService>,
        idle_workers: Arc<tokio::sync::Mutex<Vec<PythonWorker>>>,
        current_depth: Arc<AtomicUsize>,
        backpressure_active: Arc<AtomicBool>,
        circuit_breaker: Arc<CircuitBreaker>,
    ) {
        let _ = repo.update_status(message.job_id, "processing", 0);
        let python_path = resolve_python_exe();
        let script_path = resolve_worker_script();

        loop {
            let worker_result = {
                let mut pool = idle_workers.lock().await;
                if let Some(worker) = pool.pop() {
                    Ok(worker)
                } else {
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

            if result.is_ok() {
                circuit_breaker.record_success();
            } else {
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
                                || message.contains("writing stdin")
                    );
                if worker_is_healthy {
                    idle_workers.lock().await.push(worker);
                }
            }

            match result {
                Ok(()) => {
                    let _ = repo.update_status(message.job_id, "complete", 100);
                    Self::decrement_depth(&current_depth, &backpressure_active);
                    counter!("jobs_completed").increment(1);
                    return;
                }
                Err(error) => {
                    message.attempt += 1;
                    warn!(
                        "Job {} failed on attempt {}: {}",
                        message.job_id, message.attempt, error
                    );
                    if message.attempt >= MAX_RETRIES {
                        persist_job_error(&repo, message.job_id, "error_dlq", &error.to_string());
                        Self::decrement_depth(&current_depth, &backpressure_active);
                        counter!("jobs_failed").increment(1);
                        return;
                    }

                    let backoff_seconds = 2_u64.pow(message.attempt.min(5));
                    tokio::time::sleep(Duration::from_secs(backoff_seconds)).await;
                }
            }
        }
    }

    fn decrement_depth(depth: &AtomicUsize, backpressure: &AtomicBool) {
        let new_depth = depth.fetch_sub(1, Ordering::SeqCst).saturating_sub(1);
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
        let result = match worker.run_job(job).await {
            Ok(Some(worker_result)) => {
                if worker_result.transcript.trim().is_empty() {
                    Err(QueueError::ProcessingError("Empty transcript".to_string()))
                } else if let Err(error) = persist_worker_result(&repo, job, &worker_result) {
                    Err(QueueError::ProcessingError(error))
                } else if let Err(error) =
                    search_service.index_document(job.job_id, &worker_result.transcript)
                {
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
                    let connection = repo.get_connection().map_err(QueueError::ProcessingError)?;
                    let connection = connection.lock().map_err(|_| {
                        QueueError::ProcessingError("Database mutex poisoned".to_string())
                    })?;
                    if retention == "online" {
                        crate::db::cleanup_media_files(&connection, job.job_id, &processing_root())
                            .map_err(|error| {
                                QueueError::ProcessingError(format!(
                                    "online-only cleanup failed: {}",
                                    error
                                ))
                            })?;
                        crate::db::set_media_keep_status(&connection, job.job_id, "online")
                            .map_err(|error| {
                                QueueError::ProcessingError(format!(
                                    "retention status failed: {}",
                                    error
                                ))
                            })?;
                    } else {
                        crate::db::set_media_keep_status(&connection, job.job_id, "keep").map_err(
                            |error| {
                                QueueError::ProcessingError(format!(
                                    "retention status failed: {}",
                                    error
                                ))
                            },
                        )?;
                    }
                    Ok(())
                }
            }
            Ok(None) => Err(QueueError::ProcessingError(
                "Worker completed without a result".to_string(),
            )),
            Err(error) => Err(QueueError::ProcessingError(error.to_string())),
        };

        histogram!("pipeline_latency_seconds").record(start_time.elapsed().as_secs_f64());
        result
    }
}
