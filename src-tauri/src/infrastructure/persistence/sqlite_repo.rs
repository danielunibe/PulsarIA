use crate::domain::ports::JobRepository;
use crate::domain::models::JobRecord;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};

// ========================================================================
// INFRASTRUCTURE: SQLite Repository
// ========================================================================

pub struct SqliteRepo {
    pub conn: Arc<Mutex<Connection>>,
}

impl SqliteRepo {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

impl JobRepository for SqliteRepo {
    fn insert_job(&self, url: &str) -> Result<i64, String> {
        let conn = self.conn.lock().unwrap();
        crate::db::insert_job(&conn, url).map_err(|e| e.to_string())
    }

    fn get_all_jobs(&self) -> Result<Vec<JobRecord>, String> {
        let conn = self.conn.lock().unwrap();
        let db_jobs = crate::db::get_all_jobs(&conn).map_err(|e| e.to_string())?;
        
        let mut jobs = Vec::new();
        for j in db_jobs {
            jobs.push(JobRecord {
                id: j.id,
                url: j.url,
                status: j.status,
                progress: j.progress,
                created_at: j.created_at,
                title: j.title,
                author: j.author,
                thumbnail: j.thumbnail,
                duration: j.duration,
                video_path: j.video_path,
            });
        }
        Ok(jobs)
    }

    fn update_status(&self, id: i64, status: &str, progress: i32) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        crate::db::update_job_status(&conn, id, status, progress).map_err(|e| e.to_string())
    }

    fn update_media(&self, job_id: i64, title: &str, uploader: &str, thumbnail: &str, duration: i32, upload_date: &str, video_path: &str, audio_path: &str, transcript_path: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        crate::db::insert_or_update_media_metadata(
            &conn, job_id, title, uploader, thumbnail, duration, upload_date, video_path, audio_path, transcript_path
        ).map_err(|e| e.to_string())
    }
}
