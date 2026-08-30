/// Gestor de cola asíncrono para despacho de workers Python.
/// 
/// Este módulo orquesta el pipeline completo de procesamiento de videos:
/// descarga → extracción de audio → transcripción → embeddings → indexación.
/// 
/// # Pipeline
/// 
/// ```text
/// add_job(url) → dispatch_worker(job_id, url) →
/// └─ Python worker (main.py)
/// ├─ downloader.py    (yt-dlp)
/// ├─ audio_extractor.py (ffmpeg)
/// ├─ transcriber.py   (faster-whisper)
/// └─ visual_analyzer.py (Pillow)
/// └─ Rust core:
/// ├─ SemanticChunker (chunking semántico)
/// ├─ ONNXModelManager (embeddings 384d)
/// ├─ HNSW index (indexación vectorial)
/// └─ SQLite (persistencia)
/// ```
/// 
/// # Comunicación worker ↔ Rust
/// 
/// Los workers Python emiten eventos JSON por stdout, cada línea es un
/// `ProgressEvent` con el campo `step` que indica la fase del pipeline.
/// El `QueueManager` parsea estos eventos y actualiza el estado en SQLite
/// y los emite como eventos Tauri al frontend.
/// 
/// # Seguridad
/// 
/// - Cada job se ejecuta como un subproceso Python aislado
/// - Los workers no tienen acceso directo a la base de datos SQLite
/// - La resolución de rutas busca primero en `resources/` (bundle instalado)
/// y luego en el CWD (modo desarrollo)

use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::params;

use tauri::{AppHandle, Emitter};

use crate::application::search_service::SearchService;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
/// Evento de progreso emitido por los workers Python a través de stdout.
///
/// Cada línea del stdout del worker es un JSON con esta estructura. El campo
/// `step` (o `event`) indica la fase del pipeline: `download_started`,
/// `metadata`, `transcribing`, `visual_analysis`, `complete`, `error`, etc.
pub struct ProgressEvent {
    #[serde(alias = "job_id")]
    pub job: i64,
    #[serde(alias = "event")]
    pub step: String,
    #[serde(default)]
    pub progress: i32,
    #[serde(default)]
    pub metadata: Option<MediaMetadata>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub segments: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub visual_analysis: Option<serde_json::Value>,
    #[serde(default)]
    pub instructional_guide: Option<String>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
/// Metadatos extraídos del video por yt-dlp durante la descarga.
///
/// Se reciben como parte de un `ProgressEvent` con `step: "metadata"` y se
/// persisten en la tabla `media` de SQLite.
pub struct MediaMetadata {
    pub title: String,
    pub uploader: String,
    pub duration: i32,
    pub thumbnail: String,
    pub upload_date: String,
    pub platform: Option<String>,
}

/// Gestor principal de la cola de procesamiento asíncrono.
///
/// Administra el despacho de workers Python para cada job, procesa sus
/// eventos de progreso y orquesta la indexación final (embeddings + HNSW).
/// 
/// Se comparte como `Arc<Mutex<QueueManager>>` entre el `AppState` de Tauri
/// y el `QueueService` de Clean Architecture.
pub struct QueueManager {
    pub db: Arc<Mutex<rusqlite::Connection>>,
    pub onnx: Option<Arc<tokio::sync::Mutex<Option<crate::embedding::ONNXModelManager>>>>,
    pub search: Option<Arc<SearchService>>,
}

impl QueueManager {
    /// Crea un QueueManager con soporte de inferencia ONNX y búsqueda HNSW.
    ///
    /// Se usa en producción cuando el modelo está cargado. Los workers Python
    /// no usan ONNX directamente — el QueueManager genera los embeddings
    /// después de recibir la transcripción completa del worker.
    pub fn with_onnx(
        db: Arc<Mutex<rusqlite::Connection>>,
        onnx: Arc<tokio::sync::Mutex<Option<crate::embedding::ONNXModelManager>>>,
        search: Arc<SearchService>,
    ) -> Self {
        Self {
            db,
            onnx: Some(onnx),
            search: Some(search),
        }
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
        let bundled = Self::bundled_resource_dir();
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

    /// Expande una URL de colección (ej. perfil TikTok) en URLs individuales.
    ///
    /// Invoca al worker Python con `--expand-url` para resolver las URLs de los
    /// videos públicos de la colección. Tiene un timeout de 120 segundos.
    ///
    /// # Retorno
    ///
    /// Lista de URLs de videos individuales, deduplicadas y validadas
    /// contra `is_valid_sandbox_url`.
    pub async fn expand_collection(&self, url: &str) -> Result<Vec<String>, String> {
        let output = tokio::time::timeout(
            Duration::from_secs(120),
            Command::new(Self::resolve_python_exe())
                .arg(Self::resolve_script_path())
                .arg("--expand-url")
                .arg(url)
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

    fn resolve_script_path() -> PathBuf {
        let bundled = Self::bundled_resource_dir();
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

    fn normalize_status(event: &ProgressEvent) -> &'static str {
        match event.step.as_str() {
            "complete" | "completed" => "complete",
            "error" => "error",
            "download_started" | "downloading" => "downloading",
            "download_complete" | "metadata" | "metadata_extracted" => "metadata",
            "transcription_started" | "transcribing" => "transcribing",
            "transcription_complete" | "visual_analysis" => "indexing",
            _ => "processing",
        }
    }

    fn set_job_error(db: &Arc<Mutex<rusqlite::Connection>>, job_id: i64, message: &str) {
        eprintln!("Job {} failed: {}", job_id, message);
        if let Ok(conn) = db.lock() {
            let _ = crate::db::update_job_error(&conn, job_id, "error", message);
        }
    }

    async fn emit_error(app: &AppHandle, job_id: i64, message: &str) {
        let _ = app.emit(
            "job_progress",
            ProgressEvent {
                job: job_id,
                step: "error".to_string(),
                progress: 0,
                metadata: None,
                text: Some(message.to_string()),
                segments: None,
                visual_analysis: None,
                instructional_guide: None,
            },
        );
    }

    /// Despacha un worker Python para procesar un job individual.
    ///
    /// Ejecuta `main.py --job_id <id> --url <url>` como subproceso aislado.
    /// El worker emite eventos JSON por stdout que este método parsea para:
    /// 1. Actualizar el estado del job en SQLite (downloading → transcribing → ...)
    /// 2. Persistir metadatos del video cuando se reciben
    /// 3. Generar embeddings ONNX de la transcripción
    /// 4. Indexar en HNSW y persistir chunks en SQLite
    /// 5. Emitir eventos Tauri al frontend
    ///
    /// Si el worker falla en cualquier paso, el job se marca como 'error'
    /// con el mensaje correspondiente.
    pub async fn dispatch_worker(&self, job_id: i64, url: String, app: AppHandle) {
        self.dispatch_worker_with_config(job_id, url, app, None).await
    }

    /// Bug #40/#45: Worker receives immutable config snapshot at spawn time.
    pub async fn dispatch_worker_with_config(
        &self,
        job_id: i64,
        url: String,
        app: AppHandle,
        worker_config: Option<crate::WorkerConfig>,
    ) {
        let db_ref = self.db.clone();
        let onnx_ref = self.onnx.clone();
        let search_ref = self.search.clone();

        // ── INSTRUMENTACIÓN: log de cada frontera crítica ──
        eprintln!("[DISPATCH] job_id={} DISPATCH_ENTER url={}", job_id, url);

        let handle = tokio::spawn(async move {
            let python_exe = Self::resolve_python_exe();
            let script_path = Self::resolve_script_path();
            let worker_dir = script_path
                .parent()
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("."));

            let python_exists = python_exe.exists();
            let script_exists = script_path.exists();
            let cwd = std::env::current_dir().unwrap_or_default();

            eprintln!("[DISPATCH] job_id={} PYTHON_PATH python_exe={} exists={}", job_id, python_exe.display(), python_exists);
            eprintln!("[DISPATCH] job_id={} SCRIPT_PATH script_path={} exists={}", job_id, script_path.display(), script_exists);
            eprintln!("[DISPATCH] job_id={} CWD cwd={}", job_id, cwd.display());
            eprintln!("[DISPATCH] job_id={} WORKER_DIR worker_dir={}", job_id, worker_dir.display());

            eprintln!("[DISPATCH] job_id={} SPAWN_ATTEMPT", job_id);
            // Bug #40/#45 FIX: Use config snapshot if provided, else fall back to env vars
            let (formats_json, download_dir, cookies_browser) = match &worker_config {
                Some(cfg) => {
                    let fmt = serde_json::to_string(&cfg.formats)
                        .unwrap_or_else(|_| "[\"mp4\",\"mp3\",\"txt\"]".to_string());
                    (fmt, cfg.download_dir.clone(), cfg.cookies_browser.clone())
                }
                None => {
                    let fmt = std::env::var("PULSAR_FORMATS")
                        .unwrap_or_else(|_| "[\"mp4\",\"mp3\",\"txt\"]".to_string());
                    let dl = std::env::var("PULSAR_DOWNLOAD_DIR").unwrap_or_default();
                    let cb = std::env::var("PULSAR_COOKIES_FROM_BROWSER").unwrap_or_default();
                    (fmt, dl, cb)
                }
            };

            let mut cmd = Command::new(&python_exe);
            cmd.arg(&script_path)
                .arg("--job_id")
                .arg(job_id.to_string())
                .arg("--url")
                .arg(&url)
                .current_dir(&worker_dir)
                .env("PYTHONPATH", &worker_dir)
                .env("PYTHONUNBUFFERED", "1")
                .env("PULSAR_FORMATS", &formats_json)
                .env("PULSAR_DOWNLOAD_DIR", &download_dir)
                .env("PULSAR_COOKIES_FROM_BROWSER", &cookies_browser);

            let spawn_result = cmd
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn();

            let mut child = match spawn_result {
                Ok(child) => {
                    eprintln!("[DISPATCH] job_id={} SPAWN_SUCCESS pid={:?}", job_id, child.id());
                    child
                }
                Err(error) => {
                    let message = format!("Failed to start Python worker: {}", error);
                    eprintln!("[DISPATCH] job_id={} SPAWN_ERROR error={}", job_id, message);
                    Self::set_job_error(&db_ref, job_id, &message);
                    Self::emit_error(&app, job_id, &message).await;
                    return;
                }
            };

            if let Some(stderr) = child.stderr.take() {
                tokio::spawn(async move {
                    let mut reader = BufReader::new(stderr);
                    let mut line = String::new();
                    loop {
                        line.clear();
                        match reader.read_line(&mut line).await {
                            Ok(0) => break,
                            Ok(_) => {
                                let trimmed = line.trim_end();
                                if !trimmed.is_empty() {
                                    eprintln!("[DISPATCH] job_id={} STDERR: {}", job_id, trimmed);
                                }
                            }
                            Err(error) => {
                                eprintln!("[DISPATCH] job_id={} STDERR_READ_ERROR: {}", job_id, error);
                                break;
                            }
                        }
                    }
                });
            }

            let stdout = match child.stdout.take() {
                Some(stdout) => stdout,
                None => {
                    let message = "Python worker did not expose stdout";
                    eprintln!("[DISPATCH] job_id={} NO_STDOUT", job_id);
                    Self::set_job_error(&db_ref, job_id, message);
                    Self::emit_error(&app, job_id, message).await;
                    return;
                }
            };

            eprintln!("[DISPATCH] job_id={} READING_STDOUT", job_id);
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            let mut captured_transcript: Option<String> = None;
            let mut captured_segments: Option<Vec<serde_json::Value>> = None;
            let mut captured_visual_analysis: Option<serde_json::Value> = None;
            let mut captured_instructional_guide: Option<String> = None;
            let mut completed = false;

            loop {
                line.clear();
                let bytes_read = match reader.read_line(&mut line).await {
                    Ok(bytes) => bytes,
                    Err(error) => {
                        let message = format!("Failed reading Python worker output: {}", error);
                        eprintln!("[DISPATCH] job_id={} STDOUT_READ_ERROR: {}", job_id, message);
                        Self::set_job_error(&db_ref, job_id, &message);
                        Self::emit_error(&app, job_id, &message).await;
                        return;
                    }
                };

                if bytes_read == 0 {
                    eprintln!("[DISPATCH] job_id={} STDOUT_EOF (bytes_read=0)", job_id);
                    break;
                }

                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                eprintln!("[DISPATCH] job_id={} RAW_EVENT: {}", job_id, &trimmed[..trimmed.len().min(200)]);

                let event = match serde_json::from_str::<ProgressEvent>(trimmed) {
                    Ok(event) => event,
                    Err(error) => {
                        eprintln!("[DISPATCH] job_id={} PARSE_ERROR: {} raw={}", job_id, error, &trimmed[..trimmed.len().min(100)]);
                        continue;
                    }
                };

                if event.job != job_id {
                    eprintln!("[DISPATCH] job_id={} JOB_MISMATCH expected={} got={}", job_id, job_id, event.job);
                    continue;
                }

                eprintln!("[DISPATCH] job_id={} EVENT step={} progress={}", job_id, event.step, event.progress);

                if let Some(text) = &event.text {
                    captured_transcript = Some(text.clone());
                }
                if let Some(segments) = &event.segments {
                    captured_segments = Some(segments.clone());
                }
                if let Some(visual_analysis) = &event.visual_analysis {
                    captured_visual_analysis = Some(visual_analysis.clone());
                }
                if let Some(instructional_guide) = &event.instructional_guide {
                    captured_instructional_guide = Some(instructional_guide.clone());
                }

                let normalized_status = Self::normalize_status(&event);
                eprintln!("[DISPATCH] job_id={} DB_UPDATE status={} progress={}", job_id, normalized_status, event.progress);
                let db_result = db_ref
                    .lock()
                    .map_err(|_| "Database mutex poisoned".to_string())
                    .and_then(|conn| {
                        crate::db::update_job_status(
                            &conn,
                            event.job,
                            normalized_status,
                            event.progress,
                        )
                        .map_err(|error| error.to_string())
                    });
                if let Err(error) = db_result {
                    let message = format!("Failed updating job status: {}", error);
                    eprintln!("[DISPATCH] job_id={} DB_UPDATE_ERROR: {}", job_id, message);
                    Self::set_job_error(&db_ref, job_id, &message);
                    Self::emit_error(&app, job_id, &message).await;
                    return;
                }

                if let Some(metadata) = &event.metadata {
                    // Bug #2 FIX: Do NOT store video/audio paths yet — the files
                    // don't exist until download_complete. Store only metadata fields.
                    let thumbnail = if metadata.thumbnail.starts_with("http") {
                        metadata.thumbnail.clone()
                    } else {
                        format!("data/thumbnails/{}.jpg", event.job)
                    };
                    let platform = metadata.platform.as_deref().unwrap_or("unknown");
                    let metadata_result = db_ref
                        .lock()
                        .map_err(|_| "Database mutex poisoned".to_string())
                        .and_then(|conn| {
                            crate::db::insert_or_update_media_metadata(
                                &conn,
                                event.job,
                                &metadata.title,
                                &metadata.uploader,
                                &thumbnail,
                                metadata.duration,
                                &metadata.upload_date,
                                "",  // video_path — deferred until download_complete
                                "",  // audio_path — deferred until download_complete
                                "",  // transcript_path — deferred until transcription_complete
                                platform,
                            )
                            .map_err(|error| error.to_string())
                        });
                    if let Err(error) = metadata_result {
                        let message = format!("Failed persisting media metadata: {}", error);
                        eprintln!("[DISPATCH] job_id={} METADATA_PERSIST_ERROR: {}", job_id, message);
                        Self::set_job_error(&db_ref, job_id, &message);
                        Self::emit_error(&app, job_id, &message).await;
                        return;
                    }
                }

                // Bug #2 FIX: Store file paths when download/transcription completes
                if matches!(event.step.as_str(), "extracting_audio" | "download_complete") {
                    let video_path = Self::processing_path(event.job, "video.mp4")
                        .to_string_lossy()
                        .to_string();
                    let _ = db_ref.lock().map(|conn| {
                        let _ = conn.execute(
                            "UPDATE media SET video_path = ?1 WHERE job_id = ?2",
                            params![video_path, event.job],
                        );
                    });
                }
                if event.step == "transcribing" || event.step == "transcription_started" {
                    let audio_path = Self::processing_path(event.job, "audio.mp3")
                        .to_string_lossy()
                        .to_string();
                    let _ = db_ref.lock().map(|conn| {
                        let _ = conn.execute(
                            "UPDATE media SET audio_path = ?1 WHERE job_id = ?2",
                            params![audio_path, event.job],
                        );
                    });
                }

                let _ = app.emit("job_progress", event.clone());

                if matches!(event.step.as_str(), "complete" | "completed") {
                    eprintln!("[DISPATCH] job_id={} WORKER_COMPLETED", job_id);
                    completed = true;
                    break;
                }
                if event.step == "error" {
                    let message = event
                        .text
                        .as_deref()
                        .unwrap_or("Python worker reported an error");
                    eprintln!("[DISPATCH] job_id={} WORKER_ERROR: {}", job_id, message);
                    Self::set_job_error(&db_ref, job_id, message);
                    // Bug #4 FIX: Emit job_progress so frontend sees the error immediately
                    let _ = app.emit("job_progress", event.clone());
                    return;
                }
            }

            if !completed {
                let exit_status = child.wait().await;
                let message = match exit_status {
                    Ok(status) if status.success() => {
                        let hint = if captured_transcript.is_none() {
                            " (no transcript captured)"
                        } else {
                            ""
                        };
                        format!("Python worker exited with success but never emitted 'completed' event{}", hint)
                    }
                    Ok(status) => format!("Python worker exited with status {}", status),
                    Err(error) => format!("Failed waiting for Python worker: {}", error),
                };
                eprintln!("[DISPATCH] job_id={} WORKER_INCOMPLETE: {}", job_id, message);
                Self::set_job_error(&db_ref, job_id, &message);
                let _ = app.emit("job_progress", ProgressEvent {
                    job: job_id,
                    step: "error".to_string(),
                    progress: 0,
                    metadata: None,
                    text: Some(message.clone()),
                    segments: None,
                    visual_analysis: None,
                    instructional_guide: None,
                });
                Self::emit_error(&app, job_id, &message).await;
                return;
            }

            // Bug #9 FIX: Allow empty transcripts (videos without dialogue)
            let full_text = captured_transcript.or_else(|| {
                fs::read_to_string(Self::processing_path(job_id, "transcript.txt")).ok()
            });
            let full_text = match full_text {
                Some(text) if !text.trim().is_empty() => text,
                _ => {
                    eprintln!("[DISPATCH] job_id={} WARNING: No transcript available (video may have no dialogue)", job_id);
                    String::new()
                }
            };

            // Bug #2 FIX: Store transcript_path now that transcription is done
            let transcript_path = Self::processing_path(job_id, "transcript.txt")
                .to_string_lossy()
                .to_string();
            if !full_text.is_empty() {
                let _ = fs::write(&transcript_path, &full_text);
            }
            let _ = db_ref.lock().map(|conn| {
                let _ = conn.execute(
                    "UPDATE media SET transcript_path = ?1 WHERE job_id = ?2",
                    params![transcript_path, job_id],
                );
            });

            if captured_visual_analysis.is_some() || captured_instructional_guide.is_some() {
                let visual_json = captured_visual_analysis
                    .as_ref()
                    .and_then(|value| serde_json::to_string(value).ok());
                let persist_visual_result = db_ref
                    .lock()
                    .map_err(|_| "Database mutex poisoned".to_string())
                    .and_then(|conn| {
                        crate::db::update_media_analysis(
                            &conn,
                            job_id,
                            visual_json.as_deref(),
                            captured_instructional_guide.as_deref(),
                        )
                        .map_err(|error| error.to_string())
                    });
                if let Err(error) = persist_visual_result {
                    let message = format!("Failed persisting visual analysis: {}", error);
                    Self::set_job_error(&db_ref, job_id, &message);
                    Self::emit_error(&app, job_id, &message).await;
                    return;
                }
            }

            let chunks =
                crate::application::semantic_chunker::SemanticChunker::new().chunk_text(&full_text);

            let mut indexed_chunks = Vec::with_capacity(chunks.len());
            for chunk in chunks {
                let chunk_index = chunk.chunk_index;
                let chunk_text = chunk.text;
                let embedding = match &onnx_ref {
                    Some(onnx_mutex) => {
                        let mut guard = onnx_mutex.lock().await;
                        match guard.as_mut() {
                            Some(engine) => engine.generate_embedding(&chunk_text),
                            None => Err("ONNX model is not loaded".to_string()),
                        }
                    }
                    None => Err("ONNX model is not configured".to_string()),
                };

                match embedding {
                    Ok(vector) if vector.len() == 384 => {
                        indexed_chunks.push((chunk_index, chunk_text, vector))
                    }
                    Ok(vector) => {
                        let message = format!("Invalid embedding dimension: {}", vector.len());
                        Self::set_job_error(&db_ref, job_id, &message);
                        Self::emit_error(&app, job_id, &message).await;
                        return;
                    }
                    Err(error) => {
                        let message = format!("Failed generating embedding: {}", error);
                        Self::set_job_error(&db_ref, job_id, &message);
                        Self::emit_error(&app, job_id, &message).await;
                        return;
                    }
                }
            }

            let segments: Vec<(i64, f64, f64, String)> = captured_segments
                .unwrap_or_default()
                .into_iter()
                .enumerate()
                .filter_map(|(index, segment)| {
                    Some((
                        index as i64,
                        segment.get("start")?.as_f64()?,
                        segment.get("end")?.as_f64()?,
                        segment.get("text")?.as_str()?.to_string(),
                    ))
                })
                .collect();

            let persist_result = db_ref
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())
                .and_then(|conn| {
                    crate::db::clear_transcript_data(&conn, job_id)
                        .map_err(|error| error.to_string())?;
                    for (chunk_index, text, embedding) in &indexed_chunks {
                        crate::db::insert_transcript_chunk(
                            &conn,
                            job_id,
                            *chunk_index,
                            text,
                            embedding,
                        )
                        .map_err(|error| error.to_string())?;
                    }
                    for (segment_index, start, end, text) in &segments {
                        crate::db::insert_transcript_segment(
                            &conn,
                            job_id,
                            *segment_index,
                            *start,
                            *end,
                            text,
                        )
                        .map_err(|error| error.to_string())?;
                    }
                    crate::db::update_job_status(&conn, job_id, "complete", 100)
                        .map_err(|error| error.to_string())
                });

            if let Err(error) = persist_result {
                let message = format!("Failed persisting transcript index: {}", error);
                Self::set_job_error(&db_ref, job_id, &message);
                Self::emit_error(&app, job_id, &message).await;
                return;
            }

            if let Some(search) = &search_ref {
                if let Err(error) = search.index_document(job_id, &full_text) {
                    let message = format!("Failed indexing transcript in HNSW: {}", error);
                    Self::set_job_error(&db_ref, job_id, &message);
                    Self::emit_error(&app, job_id, &message).await;
                    return;
                }
                if let Err(error) = search.snapshot_index() {
                    let message = format!("Failed snapshotting transcript HNSW index: {}", error);
                    Self::set_job_error(&db_ref, job_id, &message);
                    Self::emit_error(&app, job_id, &message).await;
                    return;
                }
            }

            if let Ok(conn) = db_ref.lock() {
                let _ = crate::db::update_job_status(&conn, job_id, "complete", 100);
                // Bug #54 FIX: Use worker config snapshot instead of global env var
                let retention = worker_config
                    .as_ref()
                    .map(|c| c.retention.clone())
                    .unwrap_or_else(|| "keep".to_string());
                if retention == "online" {
                    match crate::db::cleanup_media_files(&conn, job_id, &Self::processing_root()) {
                        Ok(()) => {
                            let _ = crate::db::set_media_keep_status(&conn, job_id, "online");
                        }
                        Err(error) => {
                            eprintln!("Online-only cleanup failed for job {}: {}", job_id, error);
                            let _ = crate::db::set_media_keep_status(&conn, job_id, "keep");
                        }
                    }
                } else {
                    let _ = crate::db::set_media_keep_status(&conn, job_id, "keep");
                }
            }
            let _ = app.emit("media_indexed", job_id);
            let title = db_ref
                .lock()
                .ok()
                .and_then(|conn| crate::db::get_job_title(&conn, job_id).ok().flatten())
                .unwrap_or_default();
            let _ = app.emit(
                "job_completed_notify",
                serde_json::json!({"title": title, "job_id": job_id}),
            );

            let _ = child.wait().await;
            eprintln!("[DISPATCH] job_id={} WORKER_EXIT", job_id);
        });

        // ── INSTRUMENTACIÓN: capturar resultado del JoinHandle ──
        match handle.await {
            Ok(()) => eprintln!("[DISPATCH] job_id={} WORKER_TASK_COMPLETED", job_id),
            Err(e) => {
                if e.is_panic() {
                    eprintln!("[DISPATCH] job_id={} WORKER_TASK_PANIC: {:?}", job_id, e);
                } else {
                    eprintln!("[DISPATCH] job_id={} WORKER_TASK_CANCELLED: {:?}", job_id, e);
                }
            }
        }
    }
}
