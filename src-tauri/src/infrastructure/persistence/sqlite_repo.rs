use crate::domain::models::JobRecord;
use crate::domain::ports::JobRepository;
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
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        crate::db::insert_job(&conn, url).map_err(|e| e.to_string())
    }

    fn get_all_jobs(&self) -> Result<Vec<JobRecord>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        let db_jobs = crate::db::get_all_jobs(&conn).map_err(|e| e.to_string())?;

        let mut jobs = Vec::new();
        for j in db_jobs {
            jobs.push(JobRecord {
                id: j.id,
                url: j.url,
                status: j.status,
                progress: j.progress,
                retry_count: j.retry_count,
                created_at: j.created_at,
                title: j.title,
                author: j.author,
                thumbnail: j.thumbnail,
                duration: j.duration,
                video_path: j.video_path,
                audio_path: j.audio_path,
                transcript_path: j.transcript_path,
                keep_status: j.keep_status,
                platform: j.platform,
                error_message: j.error_message,
                visual_analysis: j.visual_analysis,
                instructional_guide: j.instructional_guide,
                video_bytes: j.video_bytes,
                audio_bytes: j.audio_bytes,
                downloaded_at: j.downloaded_at,
                last_accessed_at: j.last_accessed_at,
                play_count: j.play_count,
                open_count: j.open_count,
                search_hit_count: j.search_hit_count,
                favorite: j.favorite,
                pinned: j.pinned,
                source_state: j.source_state,
                purged_at: j.purged_at,
                purged_reason: j.purged_reason,
                poster_path: j.poster_path,
            });
        }
        Ok(jobs)
    }

    fn update_status(&self, id: i64, status: &str, progress: i32) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        crate::db::update_job_status(&conn, id, status, progress).map_err(|e| e.to_string())
    }

    fn update_retrying(&self, id: i64, attempt: u32) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        crate::db::update_job_retrying(&conn, id, attempt).map_err(|e| e.to_string())
    }

    fn update_media(
        &self,
        job_id: i64,
        title: &str,
        uploader: &str,
        duration: i32,
    ) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        let metadata = crate::db::MediaMetadata {
            title,
            author: uploader,
            thumbnail: "",
            duration,
            upload_date: "",
            video_path: "",
            audio_path: "",
            transcript_path: "",
            platform: "",
        };
        crate::db::insert_or_update_media_metadata(&conn, job_id, &metadata)
            .map_err(|e| e.to_string())
    }

    fn get_connection(
        &self,
    ) -> Result<std::sync::Arc<std::sync::Mutex<rusqlite::Connection>>, String> {
        Ok(self.conn.clone())
    }
}
