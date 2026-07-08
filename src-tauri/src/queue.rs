use tauri::AppHandle;
use tauri::Emitter;
use std::process::{Command, Stdio};
use tokio::task;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::io::{BufReader, BufRead};

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct ProgressEvent {
    pub job: i64,
    pub step: String,
    pub progress: i32,
    pub metadata: Option<MediaMetadata>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct MediaMetadata {
    pub title: String,
    pub uploader: String,
    pub duration: i32,
    pub thumbnail: String,
    pub upload_date: String,
}

pub struct QueueManager {
    pub db: Arc<Mutex<rusqlite::Connection>>,
}

impl QueueManager {
    pub fn new(db: Arc<Mutex<rusqlite::Connection>>) -> Self { 
        Self { db } 
    }

    pub async fn dispatch_worker(&self, job_id: i64, url: String, app: AppHandle) {
        let db_ref = self.db.clone();
        
        task::spawn(async move {
            let python_exe = "../python-workers/.venv/Scripts/python.exe"; 
            let script_path = "../python-workers/main.py";

            let mut child = Command::new(python_exe)
                .arg(script_path)
                .arg("--job_id")
                .arg(job_id.to_string())
                .arg("--url")
                .arg(&url)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .expect("Failed to start python worker");

            let stdout = child.stdout.take().unwrap();
            let reader = BufReader::new(stdout);

            for line in reader.lines() {
                if let Ok(json_line) = line {
                    println!("[Worker {} log]: {}", job_id, json_line);
                    
                    if let Ok(event) = serde_json::from_str::<ProgressEvent>(&json_line) {
                        {
                            let conn = db_ref.lock().await;
                            let _ = crate::db::update_job_status(&conn, event.job, &event.step, event.progress);
                            
                            if let Some(meta) = &event.metadata {
                                let video_path = format!("data/processing/{}/video.mp4", event.job);
                                let audio_path = format!("data/processing/{}/audio.mp3", event.job);
                                let transcript_path = format!("data/processing/{}/transcript.txt", event.job);
                                let thumb_path = format!("data/thumbnails/{}.jpg", event.job);
                                
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
                                );
                            }
                        }
                        
                        let _ = app.emit("job_progress", event.clone());
                        
                        if event.step == "metadata" || event.step == "complete" {
                            let _ = app.emit("media_indexed", event.job);
                        }
                    } else {
                        eprintln!("Failed to parse JSON: {}", json_line);
                    }
                }
            }

            let status = child.wait().expect("Failed to wait on child");
            if !status.success() {
                eprintln!("Worker process exited with error status: {}", status);
                let conn = db_ref.lock().await;
                let _ = crate::db::update_job_status(&conn, job_id, "error", 0);
                
                let _ = app.emit("job_progress", ProgressEvent {
                    job: job_id,
                    step: "error".to_string(),
                    progress: 0,
                    metadata: None,
                });
            }
        });
    }
}
