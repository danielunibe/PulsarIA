use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use serde::{Deserialize, Serialize};
use tracing::{info, warn, error, instrument};
use metrics::histogram;
use crate::application::queue_service::JobMessage;

// ========================================================================
// INFRASTRUCTURE: Python Runner (IPC Bridge)
// ========================================================================

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
            Self::ProcessSpawnError(msg) => write!(f, "ProcessSpawnError: {}", msg),
            Self::IOError(msg) => write!(f, "IOError: {}", msg),
            Self::JsonParseError(msg) => write!(f, "JsonParseError: {}", msg),
            Self::WorkerError(msg) => write!(f, "WorkerError: {}", msg),
        }
    }
}

// Estructura de evento esperada del STDOUT del proceso Python
#[derive(Debug, Deserialize)]
struct WorkerEvent {
    event: String,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    text: Option<String>, // Para capturar la transcripción de `transcription_complete`
}

// Payload inicial enviado por STDIN hacia Python
#[derive(Debug, Serialize)]
struct WorkerPayload<'a> {
    job_id: i64,
    url: &'a str,
}

pub struct PythonWorker {
    pub process: tokio::process::Child,
    pub stdin: tokio::process::ChildStdin,
    pub stdout: BufReader<tokio::process::ChildStdout>,
}

impl PythonWorker {
    pub async fn spawn(python_path: &str, script_path: &str) -> Result<Self, PythonRunnerError> {
        info!("Spawning persistent subprocess '{} {}'", python_path, script_path);

        let mut child = Command::new(python_path)
            .arg(script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| PythonRunnerError::ProcessSpawnError(e.to_string()))?;

        let stdin = child.stdin.take().ok_or_else(|| {
            PythonRunnerError::IOError("No se pudo capturar STDIN del subproceso".into())
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            PythonRunnerError::IOError("No se pudo capturar STDOUT del subproceso".into())
        })?;
        let mut stderr = child.stderr.take().ok_or_else(|| {
            PythonRunnerError::IOError("No se pudo capturar STDERR del subproceso".into())
        })?;

        tokio::spawn(async move {
            let mut reader = BufReader::new(&mut stderr);
            let mut line = String::new();
            while let Ok(n) = reader.read_line(&mut line).await {
                if n == 0 { break; }
                warn!("PYTHON STDERR: {}", line.trim_end());
                line.clear();
            }
        });

        let stdout_reader = BufReader::new(stdout);

        Ok(Self {
            process: child,
            stdin,
            stdout: stdout_reader,
        })
    }

    /// Inyecta un trabajo al Python daemon a través de STDIN y esucha la respuesta sincrónica en `run_job`
    #[instrument(skip(self, job), fields(job_id = job.job_id))]
    pub async fn run_job(&mut self, job: &JobMessage) -> Result<Option<String>, PythonRunnerError> {
        let payload = WorkerPayload {
            job_id: job.job_id,
            url: &job.url,
        };
        let mut payload_json = serde_json::to_string(&payload)
            .map_err(|e| PythonRunnerError::JsonParseError(e.to_string()))?;
        payload_json.push('\n');

        self.stdin.write_all(payload_json.as_bytes()).await
            .map_err(|e| PythonRunnerError::IOError(format!("Fallo escribiendo a stdin: {}", e)))?;
        self.stdin.flush().await
            .map_err(|e| PythonRunnerError::IOError(format!("Fallo flushed stdin: {}", e)))?;

        let mut line = String::new();
        let mut final_transcript: Option<String> = None;
        let mut transcription_start: Option<std::time::Instant> = None;

        while let Ok(bytes_read) = self.stdout.read_line(&mut line).await {
            if bytes_read == 0 { 
                return Err(PythonRunnerError::WorkerError("Python worker died (EOF)".into()));
            }

            let clean_line = line.trim();
            if clean_line.is_empty() {
                line.clear();
                continue;
            }

            match serde_json::from_str::<WorkerEvent>(clean_line) {
                Ok(event_data) => {
                    if event_data.event == "transcription_started" {
                        transcription_start = Some(std::time::Instant::now());
                    }
                    if event_data.event == "transcription_complete" {
                        if let Some(start) = transcription_start {
                            histogram!("transcription_latency_seconds").record(start.elapsed().as_secs_f64());
                        }
                    }

                    Self::handle_event(&event_data)?;
                    
                    if event_data.event == "transcription_complete" {
                        if let Some(txt) = event_data.text {
                            final_transcript = Some(txt);
                        }
                    } else if event_data.event == "completed" {
                        // Job procesado exitosamente por este worker
                        return Ok(final_transcript);
                    } else if event_data.event == "error" {
                        let msg = event_data.message.clone().unwrap_or_else(|| "Unknown worker error".into());
                        // Si ocurre un error de pipeline, retornamos el error pero el worker sigue vivo leyendo STDIN
                        return Err(PythonRunnerError::WorkerError(msg));
                    }
                }
                Err(e) => {
                    warn!("Python output no parseable (Ignorando línea): '{}' - err: {}", clean_line, e);
                }
            }
            line.clear();
        }

        Err(PythonRunnerError::WorkerError("Connection broken".into()))
    }

    fn handle_event(event_data: &WorkerEvent) -> Result<(), PythonRunnerError> {
        match event_data.event.as_str() {
            "download_started" => info!("download_started"),
            "download_complete" => info!("download_complete"),
            "transcription_started" => info!("transcription_started"),
            "transcription_complete" => info!("transcription_complete emitido por Worker, interceptando texto..."),
            "completed" => info!("completed"),
            "error" => {
                let msg = event_data.message.clone().unwrap_or_else(|| "Unknown error".into());
                error!("Worker reportó error IPC de tarea: {}", msg);
            }
            other => {
                info!("Evento secundario recibido: {}", other);
            }
        }
        Ok(())
    }
}
