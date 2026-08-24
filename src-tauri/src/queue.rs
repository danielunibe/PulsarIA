use tauri::AppHandle;
use tauri::Emitter;
use std::process::{Command, Stdio};
use tokio::task;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::io::{BufReader, BufRead};
use std::path::{Path, PathBuf};
use std::fs;

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
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
}

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct MediaMetadata {
    pub title: String,
    pub uploader: String,
    pub duration: i32,
    pub thumbnail: String,
    pub upload_date: String,
    pub platform: Option<String>,
}

pub struct QueueManager {
    pub db: Arc<Mutex<rusqlite::Connection>>,
    pub onnx: Option<Arc<Mutex<Option<crate::embedding::ONNXModelManager>>>>,
}

impl QueueManager {
    pub fn new(db: Arc<Mutex<rusqlite::Connection>>) -> Self { 
        Self { db, onnx: None } 
    }

    pub fn with_onnx(db: Arc<Mutex<rusqlite::Connection>>, onnx: Arc<Mutex<Option<crate::embedding::ONNXModelManager>>>) -> Self {
        Self { db, onnx: Some(onnx) }
    }

    fn resolve_python_exe() -> PathBuf {
        let candidates = [
            PathBuf::from("python-workers/.venv/Scripts/python.exe"),
            PathBuf::from("../python-workers/.venv/Scripts/python.exe"),
            PathBuf::from("python-workers/bin/python"),
            PathBuf::from("../python-workers/bin/python"),
        ];

        for c in &candidates {
            if c.exists() {
                return c.clone();
            }
        }

        PathBuf::from("python")
    }

    fn resolve_script_path() -> PathBuf {
        let candidates = [
            PathBuf::from("python-workers/main.py"),
            PathBuf::from("../python-workers/main.py"),
        ];

        for c in &candidates {
            if c.exists() {
                return c.clone();
            }
        }

        PathBuf::from("python-workers/main.py")
    }

    pub async fn dispatch_worker(&self, job_id: i64, url: String, app: AppHandle) {
        let db_ref = self.db.clone();
        let onnx_ref = self.onnx.clone();
        
        task::spawn(async move {
            let python_exe = Self::resolve_python_exe();
            let script_path = Self::resolve_script_path();

            let spawn_result = Command::new(&python_exe)
                .arg(&script_path)
                .arg("--job_id")
                .arg(job_id.to_string())
                .arg("--url")
                .arg(&url)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn();

            let mut child = match spawn_result {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("Failed to start python worker: {}", e);
                    let conn = db_ref.lock().await;
                    let _ = crate::db::update_job_status(&conn, job_id, "error", 0);
                    let _ = app.emit("job_progress", ProgressEvent {
                        job: job_id,
                        step: "error".to_string(),
                        progress: 0,
                        metadata: None,
                        text: None,
                        segments: None,
                    });
                    return;
                }
            };

            let stdout = match child.stdout.take() {
                Some(s) => s,
                None => return,
            };
            let reader = BufReader::new(stdout);

            let mut captured_transcript: Option<String> = None;
            let mut captured_segments: Option<Vec<serde_json::Value>> = None;

            for line in reader.lines() {
                if let Ok(json_line) = line {
                    let trimmed = json_line.trim();
                    if trimmed.is_empty() { continue; }
                    println!("[Worker {} log]: {}", job_id, trimmed);
                    
                    if let Ok(event) = serde_json::from_str::<ProgressEvent>(trimmed) {
                        if let Some(txt) = &event.text {
                            captured_transcript = Some(txt.clone());
                        }

                        if let Some(segs) = &event.segments {
                            captured_segments = Some(segs.clone());
                        }

                        {
                            let conn = db_ref.lock().await;
                            let _ = crate::db::update_job_status(&conn, event.job, &event.step, event.progress);
                            
                            if let Some(meta) = &event.metadata {
                                let video_path = format!("data/processing/{}/video.mp4", event.job);
                                let audio_path = format!("data/processing/{}/audio.mp3", event.job);
                                let transcript_path = format!("data/processing/{}/transcript.txt", event.job);
                                // Usar el thumbnail URL real si viene del downloader, si no usar path local
                                let thumb_path = if meta.thumbnail.starts_with("http") {
                                    meta.thumbnail.clone()
                                } else {
                                    format!("data/thumbnails/{}.jpg", event.job)
                                };
                                
                                let _ = crate::db::insert_or_update_media_metadata(
                                    &conn,
                                    event.job,
                                    &meta.title,
                                    &meta.uploader,
                                    &thumb_path,
                                    meta.duration,
                                    &meta.upload_date,
                                    &video_path,
                                    &audio_path,
                                    &transcript_path,
                                    &meta.platform.as_deref().unwrap_or("unknown"),
                                );
                            }
                        }
                        
                        let _ = app.emit("job_progress", event.clone());
                        
                        if event.step == "complete" || event.step == "completed" {
                            let transcript_content = captured_transcript.clone().or_else(|| {
                                let path = format!("data/processing/{}/transcript.txt", event.job);
                                fs::read_to_string(path).ok()
                            });

                            if let Some(full_text) = transcript_content {
                                let chunk_size = 150;
                                let chunk_overlap = 50;
                                let step = if chunk_size > chunk_overlap { chunk_size - chunk_overlap } else { chunk_size };

                                let chars: Vec<char> = full_text.chars().collect();
                                let mut start = 0;
                                let mut chunk_idx = 0;

                                let conn = db_ref.lock().await;

                                while start < chars.len() {
                                    let end = (start + chunk_size).min(chars.len());
                                    let chunk_str: String = chars[start..end].iter().collect();

                                    let mut embedding_vec = vec![0.0f32; 384];
                                    if let Some(onnx_mutex) = &onnx_ref {
                                        let mut onnx_guard = onnx_mutex.lock().await;
                                        if let Some(onnx_engine) = onnx_guard.as_mut() {
                                            if let Ok(vec) = onnx_engine.generate_embedding(&chunk_str) {
                                                embedding_vec = vec;
                                            }
                                        }
                                    }

                                    let _ = crate::db::insert_transcript_chunk(
                                        &conn,
                                        event.job,
                                        chunk_idx,
                                        &chunk_str,
                                        &embedding_vec,
                                    );

                                    chunk_idx += 1;
                                    start += step;
                                }

                                if let Some(segs) = &captured_segments {
                                    let mut seg_idx = 0i64;
                                    for seg in segs {
                                        if let (Some(start), Some(end), Some(text)) = (
                                            seg.get("start").and_then(|v| v.as_f64()),
                                            seg.get("end").and_then(|v| v.as_f64()),
                                            seg.get("text").and_then(|v| v.as_str())
                                        ) {
                                            let _ = crate::db::insert_transcript_segment(
                                                &conn,
                                                event.job,
                                                seg_idx,
                                                start,
                                                end,
                                                text,
                                            );
                                            seg_idx += 1;
                                        }
                                    }
                                }
                            }

                            let _ = app.emit("media_indexed", event.job);

                            let title = event.metadata.as_ref().map(|m| m.title.clone()).unwrap_or_default();
                            let _ = app.emit("job_completed_notify", serde_json::json!({
                                "title": title,
                                "job_id": event.job
                            }));
                        }
                    }
                }
            }

            let status = child.wait();
            if let Ok(st) = status {
                if !st.success() {
                    eprintln!("Worker process exited with error status: {}", st);
                    let conn = db_ref.lock().await;
                    let _ = crate::db::update_job_status(&conn, job_id, "error", 0);
                    
                    let _ = app.emit("job_progress", ProgressEvent {
                        job: job_id,
                        step: "error".to_string(),
                        progress: 0,
                        metadata: None,
                        text: None,
                        segments: None,
                    });
                }
            }
        });
    }
}


