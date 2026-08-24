use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, AtomicBool, Ordering};
use tokio::sync::{mpsc, Semaphore};
use tokio::time::Duration;
use tracing::{info, warn, error, instrument};
use metrics::{counter, gauge, histogram};


use crate::domain::ports::JobRepository;
use crate::domain::models::MediaMetadata;
use crate::application::search_service::SearchService;
use crate::infrastructure::workers::python_runner::PythonWorker;
use crate::resilience::circuit_breaker::CircuitBreaker;

// ========================================================================
// APPLICATION: Queue Service (Orquestador Multimedia)
// Controla la concurrencia, gestiona fallos y ejecuta el puente IPC a Python
// Integrando el resultado semántico localmente de vuelta a Rust.
// ========================================================================

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
            Self::NetworkError(msg) => write!(f, "Network Error: {}", msg),
            Self::ExtractionError(msg) => write!(f, "Extraction Error: {}", msg),
            Self::ProcessingError(msg) => write!(f, "Processing Error: {}", msg),
        }
    }
}

#[derive(Debug, Clone)]
pub struct JobMessage {
    pub job_id: i64,
    pub url: String,
    pub attempt: u32,
}

pub struct QueueService {
    sender: mpsc::Sender<JobMessage>,
    current_depth: Arc<AtomicUsize>,
    backpressure_active: Arc<AtomicBool>,
    circuit_breaker: Arc<CircuitBreaker>,
}

impl QueueService {
    pub fn new(job_repo: Arc<dyn JobRepository>, search_service: Arc<SearchService>) -> Self {
        let (tx, mut rx) = mpsc::channel::<JobMessage>(100);

        let worker_count = (num_cpus::get().saturating_sub(1)).max(1);
        let semaphore = Arc::new(Semaphore::new(worker_count));
        let idle_workers: Arc<tokio::sync::Mutex<Vec<PythonWorker>>> = Arc::new(tokio::sync::Mutex::new(Vec::with_capacity(worker_count)));

        let current_depth = Arc::new(AtomicUsize::new(0));
        let backpressure_active = Arc::new(AtomicBool::new(false));
        let circuit_breaker = Arc::new(CircuitBreaker::new());

        info!("Inicializando Worker Pool con capacidad de {} workers concurrentes", worker_count);

        let repo_clone = job_repo.clone();
        let search_clone = search_service.clone();
        let depth_clone = current_depth.clone();
        let backpressure_clone = backpressure_active.clone();
        let breaker_clone = circuit_breaker.clone();

        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                let permit = match semaphore.clone().acquire_owned().await {
                    Ok(p) => p,
                    Err(e) => {
                        error!("Fallo al adquirir slot en Semaphore: {}", e);
                        continue;
                    }
                };

                let repo_task = repo_clone.clone();
                let search_task = search_clone.clone();
                let workers_pool = idle_workers.clone();
                let depth = depth_clone.clone();
                let bp = backpressure_clone.clone();

                let cb = breaker_clone.clone();

                tokio::spawn(async move {
                    Self::execute_job_with_retries(msg, repo_task, search_task, workers_pool, depth, bp, cb).await;
                    drop(permit);
                });
            }
        });

        Self { 
            sender: tx,
            current_depth,
            backpressure_active,
            circuit_breaker,
        }
    }

    #[instrument(skip(self))]
    pub async fn dispatch(&self, job_id: i64, url: String) -> Result<(), String> {
        if !self.circuit_breaker.allow_request() {
            warn!("job_rejected_circuit_breaker: El sistema Circuit Breaker de Whisper está activado ({})", job_id);
            return Err("Service Unavailable: Whisper Circuit Breaker OPEN".to_string());
        }

        let depth = self.current_depth.load(Ordering::SeqCst);
        let is_backpressure = self.backpressure_active.load(Ordering::SeqCst);

        if is_backpressure {
            if depth <= QUEUE_LOW_WATERMARK {
                self.backpressure_active.store(false, Ordering::SeqCst);
                info!("queue_backpressure_disabled");
            } else {
                warn!("job_rejected_backpressure: Sistema saturado (Watermark). Rechazando job {}", job_id);
                return Err("System is saturated: Backpressure applied".to_string());
            }
        } else if depth >= QUEUE_HIGH_WATERMARK {
            self.backpressure_active.store(true, Ordering::SeqCst);
            info!("queue_backpressure_enabled: Límite de Watermark alcanzado ({}). Activando protección OOM.", depth);
            warn!("job_rejected_backpressure: Sistema saturado (Watermark). Rechazando job {}", job_id);
            return Err("System is saturated: Backpressure applied".to_string());
        }

        let msg = JobMessage {
            job_id,
            url: url.clone(),
            attempt: 0,
        };

        info!("job_enqueued: ID {} - URL {}", job_id, url);

        self.sender.send(msg).await.map_err(|e| {
            error!("Error encolando job: {}", e);
            e.to_string()
        })?;

        let new_depth = self.current_depth.fetch_add(1, Ordering::SeqCst) + 1;
        gauge!("queue_depth").set(new_depth as f64);
        counter!("jobs_total").increment(1);

        Ok(())
    }

    async fn execute_job_with_retries(
        mut msg: JobMessage, 
        repo: Arc<dyn JobRepository>, 
        search: Arc<SearchService>,
        idle_workers: Arc<tokio::sync::Mutex<Vec<PythonWorker>>>,
        current_depth: Arc<AtomicUsize>,
        backpressure_active: Arc<AtomicBool>,
        circuit_breaker: Arc<CircuitBreaker>,
    ) {
        info!("job_started: ID {}", msg.job_id);
        let _ = repo.update_status(msg.job_id, "processing", 0);

        // TODO: In production, configure python path via settings
        let python_path = "python-workers/.venv/Scripts/python.exe"; 
        let script_path = "python-workers/main.py";

        loop {
            // Check out idle worker from the pool
            let mut worker = {
                let mut pool = idle_workers.lock().await;
                match pool.pop() {
                    Some(w) => w,
                    None => {
                        // Lazy spawn: el pool estaba vacío (ej: first run o hubo un crash previo)
                        match PythonWorker::spawn(python_path, script_path).await {
                            Ok(w) => w,
                            Err(e) => {
                                error!("Worker lazy spawn failed para job ID {}: {}", msg.job_id, e);
                                tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                                continue;
                            }
                        }
                    }
                }
            };

            gauge!("worker_utilization").increment(1.0);
            let result = Self::run_pipeline(&msg, repo.clone(), search.clone(), &mut worker).await;
            gauge!("worker_utilization").decrement(1.0);

            // Circuit breaker feedback
            match &result {
                Ok(_) => circuit_breaker.record_success(),
                Err(_) => circuit_breaker.record_failure(),
            }

            // Health check: ¿El worker sigue vivo para servir al pool?
            let is_worker_healthy = match &result {
                // Errores de crash del script o EOF de Python
                Err(QueueError::ProcessingError(err_msg)) if err_msg.contains("Connection broken") || err_msg.contains("died") => false,
                _ => true,
            };

            if is_worker_healthy {
                idle_workers.lock().await.push(worker); // Reintegrar al idle pool
            } else {
                warn!("Worker detectado como zombie o crashed. Desechando. Se generará lazy spawn en la próxima ronda.");
            }

            match result {
                Ok(_) => {
                    info!("job_completed: ID {}", msg.job_id);
                    let _ = repo.update_status(msg.job_id, "complete", 100);
                    
                    let new_depth = current_depth.fetch_sub(1, Ordering::SeqCst).saturating_sub(1);
                    gauge!("queue_depth").set(new_depth as f64);
                    if backpressure_active.load(Ordering::SeqCst) && new_depth <= QUEUE_LOW_WATERMARK {
                        backpressure_active.store(false, Ordering::SeqCst);
                        info!("queue_backpressure_disabled: Nivel de Watermark recuperado ({}). Aceptando nuevos jobs.", new_depth);
                    }

                    counter!("jobs_completed").increment(1);
                    return;
                }
                Err(e) => {
                    msg.attempt += 1;
                    warn!("job_failed: ID {} en intento {} - {}", msg.job_id, msg.attempt, e);
                    
                    if msg.attempt >= MAX_RETRIES {
                        error!("job_dlq: ID {} alcanzó MAX_RETRIES", msg.job_id);
                        let _ = repo.update_status(msg.job_id, "error_dlq", 0);
                        
                        let new_depth = current_depth.fetch_sub(1, Ordering::SeqCst).saturating_sub(1);
                        gauge!("queue_depth").set(new_depth as f64);
                        if backpressure_active.load(Ordering::SeqCst) && new_depth <= QUEUE_LOW_WATERMARK {
                            backpressure_active.store(false, Ordering::SeqCst);
                            info!("queue_backpressure_disabled: Nivel de Watermark recuperado ({}). Aceptando nuevos jobs.", new_depth);
                        }

                        counter!("jobs_failed").increment(1);
                        return;
                    }

                    info!("job_retry: ID {} en {} segundos", msg.job_id, 2_u64.pow(msg.attempt));
                    let backoff = Duration::from_secs(2_u64.pow(msg.attempt));
                    tokio::time::sleep(backoff).await;
                }
            }
        }
    }

    /// Invoca la infraestructura de Python mediante IPC y si retorna la transcripción, la indexa en el SearchService
    async fn run_pipeline(job: &JobMessage, repo: Arc<dyn JobRepository>, search_service: Arc<SearchService>, worker: &mut PythonWorker) -> Result<(), QueueError> {
        info!("Despachando pipeline Python IPC para URL: {}", job.url);
        
        let start_time = std::time::Instant::now();

        let (transcript, metadata) = match worker.run_job(job).await {
            Ok((Some(transcript), metadata)) => {
                info!("Transcripción recibida ({} bytes). Iniciando indexación semántica...", transcript.len());
                (Some(transcript), metadata)
            }
            Ok((None, metadata)) => {
                warn!("El pipeline finalizó OK, pero no retornó transcripción de texto para el job {}", job.job_id);
                (None, metadata)
            }
            Err(e) => {
                return Err(QueueError::ProcessingError(e.to_string()));
            }
        };

        if let Some(meta) = metadata {
            info!("Guardando metadata para job {}: title='{}', thumbnail='{}', duration={}", job.job_id, meta.title, meta.thumbnail, meta.duration);
            let video_path = format!("data/processing/{}/video.mp4", job.job_id);
            let audio_path = format!("data/processing/{}/audio.mp3", job.job_id);
            let transcript_path = format!("data/processing/{}/transcript.txt", job.job_id);
            
            if let Err(e) = repo.update_media(
                job.job_id,
                &meta.title,
                &meta.uploader,
                &meta.thumbnail,
                meta.duration,
                &meta.upload_date,
                &video_path,
                &audio_path,
                &transcript_path,
            ) {
                error!("Fallo guardando metadata para job {}: {}", job.job_id, e);
            }
        }

        if let Some(transcript) = transcript {
            if let Err(e) = search_service.index_document(job.job_id, &transcript) {
                error!("Fallo indexando el documento {}: {}", job.job_id, e);
                return Err(QueueError::ProcessingError(format!("Fallo Indexación HNSW: {}", e)));
            }
        }

        histogram!("pipeline_latency_seconds").record(start_time.elapsed().as_secs_f64());
        Ok(())
    }
}
