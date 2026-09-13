use std::path::Path;
use std::process::Stdio;

use metrics::histogram;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tracing::{info, instrument, warn};

use crate::domain::models::JobMessage;

#[derive(Debug)]
pub enum PythonRunnerError {
    ProcessSpawnError(String),
    IOError(String),
    JsonParseError(String),
    WorkerError(String),
}

impl std::fmt::Display for PythonRunnerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ProcessSpawnError(message) => write!(f, "ProcessSpawnError: {}", message),
            Self::IOError(message) => write!(f, "IOError: {}", message),
            Self::JsonParseError(message) => write!(f, "JsonParseError: {}", message),
            Self::WorkerError(message) => write!(f, "WorkerError: {}", message),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkerMetadata {
    pub title: String,
    pub uploader: String,
    pub duration: i32,
    pub thumbnail: String,
    pub upload_date: String,
    #[serde(default)]
    pub platform: Option<String>,
}

#[derive(Debug, Clone)]
pub struct WorkerResult {
    pub transcript: String,
    pub metadata: Option<WorkerMetadata>,
    pub segments: Vec<serde_json::Value>,
    pub visual_analysis: Option<serde_json::Value>,
    pub instructional_guide: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WorkerEvent {
    event: String,
    #[serde(default)]
    step: Option<String>,
    #[serde(default)]
    progress: Option<i32>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    metadata: Option<WorkerMetadata>,
    #[serde(default)]
    segments: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    visual_analysis: Option<serde_json::Value>,
    #[serde(default)]
    instructional_guide: Option<String>,
}

#[derive(Debug, Serialize)]
struct WorkerPayload<'a> {
    job_id: i64,
    url: &'a str,
    formats: String,
    download_dir: String,
    cookies_browser: String,
    retention: String,
    processing_quality: String,
    whisper_model: String,
    whisper_device: String,
    whisper_compute_type: String,
}

pub struct PythonWorker {
    pub process: tokio::process::Child,
    pub stdin: tokio::process::ChildStdin,
    pub stdout: BufReader<tokio::process::ChildStdout>,
}

impl PythonWorker {
    pub async fn spawn(python_path: &str, script_path: &str) -> Result<Self, PythonRunnerError> {
        info!(
            "Spawning persistent subprocess '{} {}'",
            python_path, script_path
        );
        let script = Path::new(script_path);
        let worker_dir = script.parent().unwrap_or_else(|| Path::new("."));
        let mut command = Command::new(python_path);
        command
            .arg(script_path)
            .current_dir(worker_dir)
            .env("PYTHONPATH", worker_dir)
            .env("PYTHONUNBUFFERED", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command.kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command
            .spawn()
            .map_err(|error| PythonRunnerError::ProcessSpawnError(error.to_string()))?;

        let stdin = child.stdin.take().ok_or_else(|| {
            PythonRunnerError::IOError("Python worker did not expose stdin".to_string())
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            PythonRunnerError::IOError("Python worker did not expose stdout".to_string())
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            PythonRunnerError::IOError("Python worker did not expose stderr".to_string())
        })?;

        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break,
                    Ok(_) => warn!("PYTHON STDERR: {}", line.trim_end()),
                    Err(error) => {
                        warn!("Failed reading Python stderr: {}", error);
                        break;
                    }
                }
            }
        });

        Ok(Self {
            process: child,
            stdin,
            stdout: BufReader::new(stdout),
        })
    }

    #[instrument(skip(self, job, on_progress), fields(job_id = job.job_id))]
    pub async fn run_job<F>(
        &mut self,
        job: &JobMessage,
        mut on_progress: F,
    ) -> Result<Option<WorkerResult>, PythonRunnerError>
    where
        F: FnMut(&str, i32, Option<&WorkerMetadata>),
    {
        let payload = WorkerPayload {
            job_id: job.job_id,
            url: &job.url,
            formats: std::env::var("PULSAR_FORMATS")
                .unwrap_or_else(|_| "[\"mp4\",\"mp3\",\"txt\"]".into()),
            download_dir: std::env::var("PULSAR_DOWNLOAD_DIR").unwrap_or_default(),
            cookies_browser: job.cookies_browser.clone().unwrap_or_else(|| {
                std::env::var("PULSAR_COOKIES_FROM_BROWSER").unwrap_or_default()
            }),
            retention: std::env::var("PULSAR_DEFAULT_RETENTION").unwrap_or_else(|_| "keep".into()),
            processing_quality: std::env::var("PULSAR_PROCESSING_QUALITY")
                .unwrap_or_else(|_| "78".into()),
            whisper_model: std::env::var("WHISPER_MODEL").unwrap_or_else(|_| "tiny".into()),
            whisper_device: std::env::var("WHISPER_DEVICE").unwrap_or_else(|_| "cpu".into()),
            whisper_compute_type: std::env::var("WHISPER_COMPUTE_TYPE")
                .unwrap_or_else(|_| "int8".into()),
        };
        let mut payload_json = serde_json::to_string(&payload)
            .map_err(|error| PythonRunnerError::JsonParseError(error.to_string()))?;
        payload_json.push('\n');

        self.stdin
            .write_all(payload_json.as_bytes())
            .await
            .map_err(|error| PythonRunnerError::IOError(format!("writing stdin: {}", error)))?;
        self.stdin
            .flush()
            .await
            .map_err(|error| PythonRunnerError::IOError(format!("flushing stdin: {}", error)))?;

        let mut line = String::new();
        let mut final_transcript: Option<String> = None;
        let mut metadata: Option<WorkerMetadata> = None;
        let mut segments: Vec<serde_json::Value> = Vec::new();
        let mut visual_analysis: Option<serde_json::Value> = None;
        let mut instructional_guide: Option<String> = None;
        let mut transcription_start: Option<std::time::Instant> = None;

        loop {
            line.clear();
            let bytes_read = self.stdout.read_line(&mut line).await.map_err(|error| {
                PythonRunnerError::IOError(format!("reading stdout: {}", error))
            })?;
            if bytes_read == 0 {
                return Err(PythonRunnerError::WorkerError(
                    "Python worker died (EOF)".to_string(),
                ));
            }

            let clean_line = line.trim();
            if clean_line.is_empty() {
                continue;
            }

            let event = match serde_json::from_str::<WorkerEvent>(clean_line) {
                Ok(event) => event,
                Err(error) => {
                    warn!(
                        "Ignoring non-JSON worker output: {} ({})",
                        clean_line, error
                    );
                    continue;
                }
            };

            let normalized_step = event.step.as_deref().unwrap_or(&event.event);

            // Metadata is emitted before the expensive download/transcription
            // stages. Keep the latest copy in memory before invoking the
            // callback so the queue can expose title/author/thumbnail while
            // the job is still processing.
            if let Some(event_metadata) = event.metadata.as_ref() {
                metadata = Some(event_metadata.clone());
            }
            if let Some(progress) = event.progress {
                on_progress(normalized_step, progress.clamp(0, 100), metadata.as_ref());
            }

            if event.event == "transcription_started" {
                transcription_start = Some(std::time::Instant::now());
            }
            if event.event == "transcription_complete" {
                if let Some(start) = transcription_start {
                    histogram!("transcription_latency_seconds")
                        .record(start.elapsed().as_secs_f64());
                }
            }
            if let Some(text) = event.text {
                final_transcript = Some(text);
            }
            if let Some(event_segments) = event.segments {
                segments = event_segments;
            }
            if let Some(event_visual_analysis) = event.visual_analysis {
                visual_analysis = Some(event_visual_analysis);
            }
            if let Some(event_instructional_guide) = event.instructional_guide {
                instructional_guide = Some(event_instructional_guide);
            }

            match event.event.as_str() {
                "completed" => {
                    let transcript = final_transcript.unwrap_or_default();
                    return Ok(Some(WorkerResult {
                        transcript,
                        metadata,
                        segments,
                        visual_analysis,
                        instructional_guide,
                    }));
                }
                "error" => {
                    return Err(PythonRunnerError::WorkerError(
                        event
                            .message
                            .unwrap_or_else(|| "Unknown worker error".to_string()),
                    ));
                }
                _ => info!("Worker event: {}", event.event),
            }
        }
    }
}
