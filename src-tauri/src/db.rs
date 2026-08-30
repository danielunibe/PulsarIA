use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::Path;
use std::fs;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct JobRecord {
    pub id: i64,
    pub url: String,
    pub status: String,
    pub progress: i32,
    pub created_at: String,
    pub title: Option<String>,
    pub author: Option<String>,
    pub thumbnail: Option<String>,
    pub duration: Option<i32>,
    pub video_path: Option<String>,
    pub keep_status: Option<String>,
    pub platform: Option<String>,
    pub error_message: Option<String>,
    pub visual_analysis: Option<String>,
    pub instructional_guide: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SearchResult {
    #[serde(rename = "video_id")]
    pub job_id: i64,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    #[serde(rename = "matched_text")]
    pub chunk_text: String,
    pub chunk_index: i64,
    pub similarity_score: f32,
}
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct TranscriptSegment {
    pub job_id: i64,
    pub segment_index: i64,
    pub start_time: f64,
    pub end_time: f64,
    pub text: String,
}



#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PlaylistRecord {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub cover_job_id: Option<i64>,
    pub auto_generated: bool,
    pub topic_keywords: String,
    pub color: String,
    pub created_at: String,
    pub item_count: i64,
}

pub fn init_db() -> Result<Connection> {
    // 1. Verify folder structure for the DB
    let data_dir = Path::new("../data");
    if !data_dir.exists() {
        fs::create_dir_all(data_dir).expect("Failed to create data directory");
    }

    let conn = Connection::open(data_dir.join("library.db"))?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            progress INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL UNIQUE,
            video_path TEXT,
            audio_path TEXT,
            transcript_path TEXT,
            title TEXT,
            author TEXT,
            thumbnail TEXT,
            duration INTEGER,
            upload_date TEXT,
            keep_status TEXT DEFAULT 'none',
            platform TEXT,
            FOREIGN KEY(job_id) REFERENCES jobs(id)
        )",
        [],
    )?;
    // Migraciones para bases de datos existentes (se ignoran si la columna ya existe)
    let _ = conn.execute("ALTER TABLE media ADD COLUMN keep_status TEXT DEFAULT 'none'", []);
    let _ = conn.execute("ALTER TABLE media ADD COLUMN platform TEXT", []);
    let _ = conn.execute("ALTER TABLE media ADD COLUMN julia_exported BOOLEAN DEFAULT 0", []);

    conn.execute("CREATE TABLE IF NOT EXISTS transcript_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            chunk_text TEXT NOT NULL,
            embedding_vector BLOB NOT NULL,
            FOREIGN KEY(job_id) REFERENCES jobs(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS transcript_segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            segment_index INTEGER NOT NULL,
            start_time REAL NOT NULL,
            end_time REAL NOT NULL,
            text TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES jobs(id)
        )",
        [],
    )?;

    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_segments_job_id ON transcript_segments(job_id)", []);


    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT NOT NULL DEFAULT '#8a5cff',
            is_smart BOOLEAN NOT NULL DEFAULT 0,
            auto_generated BOOLEAN NOT NULL DEFAULT 0,
            cover_job_id INTEGER,
            topic_keywords TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    // Migraciones para bases de datos existentes (se ignoran si la columna ya existe)
    let _ = conn.execute("ALTER TABLE playlists ADD COLUMN auto_generated BOOLEAN DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE playlists ADD COLUMN cover_job_id INTEGER", []);
    let _ = conn.execute("ALTER TABLE playlists ADD COLUMN topic_keywords TEXT DEFAULT '[]'", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlist_items (
            playlist_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (playlist_id, job_id),
            FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    Ok(conn)
}

pub fn insert_job(conn: &Connection, url: &str) -> Result<i64> {
    conn.execute(
        "INSERT INTO jobs (url, status, progress) VALUES (?1, 'queued', 0)",
        params![url],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_all_jobs(conn: &Connection) -> Result<Vec<JobRecord>> {
    let mut stmt = conn.prepare(
        "SELECT j.id, j.url, j.status, j.progress, j.created_at,
                m.title, m.author, m.thumbnail, m.duration, m.video_path, m.keep_status, m.platform
         FROM jobs j
         LEFT JOIN media m ON j.id = m.job_id
         ORDER BY j.id DESC"
    )?;
    
    let job_iter = stmt.query_map([], |row| {
        Ok(JobRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            status: row.get(2)?,
            progress: row.get(3)?,
            created_at: row.get(4)?,
            title: row.get(5)?,
            author: row.get(6)?,
            thumbnail: row.get(7)?,
            duration: row.get(8)?,
            video_path: row.get(9)?,
            keep_status: row.get(10)?,
            platform: row.get(11)?,
            error_message: None,
            visual_analysis: None,
            instructional_guide: None,
        })
    })?;

    let mut jobs = Vec::new();
    for job in job_iter {
        jobs.push(job?);
    }
    Ok(jobs)
}

pub fn update_job_status(conn: &Connection, id: i64, status: &str, progress: i32) -> Result<()> {
    conn.execute(
        "UPDATE jobs SET status = ?1, progress = ?2 WHERE id = ?3",
        params![status, progress, id],
    )?;
    Ok(())
}

pub fn set_media_keep_status(conn: &Connection, job_id: i64, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE media SET keep_status = ?1 WHERE job_id = ?2",
        params![status, job_id],
    )?;
    Ok(())
}

pub fn get_media_keep_status(conn: &Connection, job_id: i64) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT keep_status FROM media WHERE job_id = ?1")?;
    let status: Option<String> = stmt.query_row(params![job_id], |row| row.get(0)).ok();
    Ok(status)
}

pub fn insert_or_update_media_metadata(
    conn: &Connection,
    job_id: i64,
    title: &str,
    author: &str,
    thumbnail: &str,
    duration: i32,
    upload_date: &str,
    video_path: &str,
    audio_path: &str,
    transcript_path: &str,
    platform: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO media (job_id, title, author, thumbnail, duration, upload_date, video_path, audio_path, transcript_path, platform)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(job_id) DO UPDATE SET
            title = excluded.title,
            author = excluded.author,
            thumbnail = excluded.thumbnail,
            duration = excluded.duration,
            upload_date = excluded.upload_date,
            video_path = excluded.video_path,
            audio_path = excluded.audio_path,
            transcript_path = excluded.transcript_path,
            platform = excluded.platform",
        params![job_id, title, author, thumbnail, duration, upload_date, video_path, audio_path, transcript_path, platform],
    )?;
    Ok(())
}

pub fn insert_imported_media_metadata(
    conn: &Connection,
    job_id: i64,
    title: &str,
    author: &str,
    duration: i32,
    upload_date: &str,
    platform: &str,
) -> Result<()> {
    insert_or_update_media_metadata(conn, job_id, title, author, "", duration, upload_date, "", "", "", platform)
}

pub fn insert_transcript_chunk(
    conn: &Connection,
    job_id: i64,
    chunk_index: i64,
    chunk_text: &str,
    embedding: &[f32],
) -> Result<()> {
    let mut blob: Vec<u8> = Vec::with_capacity(embedding.len() * 4);
    for &val in embedding {
        blob.extend_from_slice(&val.to_ne_bytes());
    }
    conn.execute(
        "INSERT INTO transcript_embeddings (job_id, chunk_index, chunk_text, embedding_vector)
         VALUES (?1, ?2, ?3, ?4)",
        params![job_id, chunk_index, chunk_text, blob],
    )?;
    Ok(())
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let mut dot_product = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;
    for (val_a, val_b) in a.iter().zip(b.iter()) {
        dot_product += val_a * val_b;
        norm_a += val_a * val_a;
        norm_b += val_b * val_b;
    }
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot_product / (norm_a.sqrt() * norm_b.sqrt())
}

pub fn search_embeddings(conn: &Connection, query_vec: &[f32], limit: usize, min_score: f32) -> Result<Vec<SearchResult>> {
    let mut stmt = conn.prepare(
        "SELECT t.job_id, m.title, m.thumbnail, t.chunk_text, t.chunk_index, t.embedding_vector
         FROM transcript_embeddings t
         LEFT JOIN media m ON t.job_id = m.job_id"
    )?;
    
    let mut results = Vec::new();
    let rows = stmt.query_map([], |row| {
        let job_id: i64 = row.get(0)?;
        let title: Option<String> = row.get(1)?;
        let thumbnail: Option<String> = row.get(2)?;
        let chunk_text: String = row.get(3)?;
        let chunk_index: i64 = row.get(4)?;
        let embedding_blob: Vec<u8> = row.get(5)?;
        
        let mut embedding: Vec<f32> = Vec::with_capacity(embedding_blob.len() / 4);
        for chunk in embedding_blob.chunks_exact(4) {
            embedding.push(f32::from_ne_bytes(chunk.try_into().unwrap()));
        }
        Ok((job_id, title, thumbnail, chunk_text, chunk_index, embedding))
    })?;
    
    for row in rows {
        if let Ok((job_id, title, thumbnail, chunk_text, chunk_index, embedding)) = row {
            let score = cosine_similarity(query_vec, &embedding);
            if score >= min_score {
                results.push(SearchResult {
                    job_id,
                    title,
                    thumbnail,
                    chunk_text,
                    chunk_index,
                    similarity_score: score,
                });
            }
        }
    }
    
    results.sort_by(|a, b| b.similarity_score.partial_cmp(&a.similarity_score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);
    Ok(results)
}

pub fn cluster_videos_by_similarity(conn: &Connection, threshold: f32, min_cluster_size: usize) -> Result<Vec<Vec<i64>>> {
    let mut stmt = conn.prepare(
        "SELECT te.job_id, AVG(te.embedding_vector) as avg_emb FROM transcript_embeddings te
         JOIN jobs j ON j.id = te.job_id
         WHERE j.status = 'complete'
         GROUP BY te.job_id"
    )?;
    
    let mut job_embeddings: Vec<(i64, Vec<f32>)> = Vec::new();
    let rows = stmt.query_map([], |row| {
        let job_id: i64 = row.get(0)?;
        let blob: Vec<u8> = row.get(1)?;
        let mut embedding = Vec::with_capacity(blob.len() / 4);
        for chunk in blob.chunks_exact(4) {
            embedding.push(f32::from_ne_bytes(chunk.try_into().unwrap()));
        }
        Ok((job_id, embedding))
    })?;
    
    for row in rows {
        if let Ok((job_id, embedding)) = row {
            job_embeddings.push((job_id, embedding));
        }
    }
    
    let mut clusters: Vec<Vec<i64>> = Vec::new();
    let mut used: std::collections::HashSet<i64> = std::collections::HashSet::new();
    
    for (job_id, embedding) in &job_embeddings {
        if used.contains(job_id) { continue; }
        
        let mut cluster = vec![*job_id];
        used.insert(*job_id);
        
        for (other_id, other_emb) in &job_embeddings {
            if used.contains(other_id) { continue; }
            let sim = cosine_similarity(embedding, other_emb);
            if sim >= threshold {
                cluster.push(*other_id);
                used.insert(*other_id);
            }
        }
        
        if cluster.len() >= min_cluster_size {
            clusters.push(cluster);
        }
    }
    
    Ok(clusters)
}

pub fn get_transcript_segments(conn: &Connection, job_id: i64) -> Result<Vec<(i64, String, f64, f64)>> {
    let mut stmt = conn.prepare(
        "SELECT segment_index, text, start_time, end_time FROM transcript_segments WHERE job_id = ?1 ORDER BY segment_index ASC"
    )?;
    let segments = stmt.query_map(params![job_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?.filter_map(|r| r.ok()).collect();
    Ok(segments)
}

pub fn insert_transcript_segment(conn: &Connection, job_id: i64, segment_index: i64, start_time: f64, end_time: f64, text: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO transcript_segments (job_id, segment_index, start_time, end_time, text) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![job_id, segment_index, start_time, end_time, text],
    )?;
    Ok(())
}

pub fn get_transcript_segments_with_timestamps(conn: &Connection, job_id: i64) -> Result<Vec<(i64, String, f64, f64)>> {
    let mut stmt = conn.prepare(
        "SELECT segment_index, text, start_time, end_time FROM transcript_segments WHERE job_id = ?1 ORDER BY segment_index ASC"
    )?;
    let segments = stmt.query_map(params![job_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?.filter_map(|r| r.ok()).collect();
    Ok(segments)
}


// ========================================================================
// PLAYLIST OPERATIONS
// ========================================================================

pub fn get_all_playlists(conn: &Connection) -> Result<Vec<PlaylistRecord>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.description, p.cover_job_id, p.auto_generated, 
                p.topic_keywords, p.color, p.created_at,
                COUNT(pi.job_id) as item_count
         FROM playlists p
         LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
         GROUP BY p.id
         ORDER BY p.created_at DESC"
    )?;
    let playlists = stmt.query_map([], |row| {
        Ok(PlaylistRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            cover_job_id: row.get(3)?,
            auto_generated: row.get(4)?,
            topic_keywords: row.get(5).unwrap_or_else(|_| "[]".to_string()),
            color: row.get(6).unwrap_or_else(|_| "#8a5cff".to_string()),
            created_at: row.get(7)?,
            item_count: row.get(8).unwrap_or(0),
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(playlists)
}

pub fn create_playlist(conn: &Connection, name: &str, description: Option<&str>, color: &str, auto_generated: bool) -> Result<i64> {
    conn.execute(
        "INSERT INTO playlists (name, description, color, auto_generated) VALUES (?1, ?2, ?3, ?4)",
        params![name, description, color, auto_generated],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn add_job_to_playlist(conn: &Connection, playlist_id: i64, job_id: i64) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO playlist_items (playlist_id, job_id) VALUES (?1, ?2)",
        params![playlist_id, job_id],
    )?;
    Ok(())
}

pub fn remove_job_from_playlist(conn: &Connection, playlist_id: i64, job_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM playlist_items WHERE playlist_id = ?1 AND job_id = ?2",
        params![playlist_id, job_id],
    )?;
    Ok(())
}

pub fn get_playlist_jobs(conn: &Connection, playlist_id: i64) -> Result<Vec<JobRecord>> {
    let mut stmt = conn.prepare(
        "SELECT j.id, j.url, j.status, j.progress, j.created_at,
                m.title, m.author, m.thumbnail, m.duration, m.video_path, m.keep_status, m.platform
         FROM playlist_items pi
         JOIN jobs j ON pi.job_id = j.id
         LEFT JOIN media m ON j.id = m.job_id
         WHERE pi.playlist_id = ?1
         ORDER BY pi.added_at DESC"
    )?;

    let job_iter = stmt.query_map(params![playlist_id], |row| {
        Ok(JobRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            status: row.get(2)?,
            progress: row.get(3)?,
            created_at: row.get(4)?,
            title: row.get(5)?,
            author: row.get(6)?,
            thumbnail: row.get(7)?,
            duration: row.get(8)?,
            video_path: row.get(9)?,
            keep_status: row.get(10)?,
            platform: row.get(11)?,
            error_message: None,
            visual_analysis: None,
            instructional_guide: None,
        })
    })?;

    let mut jobs = Vec::new();
    for job in job_iter {
        jobs.push(job?);
    }
    Ok(jobs)
}

pub fn delete_playlist(conn: &Connection, playlist_id: i64) -> Result<()> {
    conn.execute("DELETE FROM playlist_items WHERE playlist_id = ?1", params![playlist_id])?;
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])?;
    Ok(())
}



pub fn get_julia_ready_jobs(conn: &Connection) -> Result<Vec<JobRecord>> {
    let mut stmt = conn.prepare(
        "SELECT j.id, j.url, j.status, j.progress, j.created_at,
                m.title, m.author, m.thumbnail, m.duration, m.video_path, m.keep_status, m.platform
         FROM jobs j
         JOIN media m ON j.id = m.job_id
         LEFT JOIN transcript_embeddings te ON j.id = te.job_id
         WHERE m.julia_exported = 0 AND j.status = 'complete'
         GROUP BY j.id
         HAVING COUNT(te.id) > 0"
    )?;
    
    let job_iter = stmt.query_map([], |row| {
        Ok(JobRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            status: row.get(2)?,
            progress: row.get(3)?,
            created_at: row.get(4)?,
            title: row.get(5)?,
            author: row.get(6)?,
            thumbnail: row.get(7)?,
            duration: row.get(8)?,
            video_path: row.get(9)?,
            keep_status: row.get(10)?,
            platform: row.get(11)?,
            error_message: None,
            visual_analysis: None,
            instructional_guide: None,
        })
    })?;

    let mut jobs = Vec::new();
    for job in job_iter {
        jobs.push(job?);
    }
    Ok(jobs)
}

pub fn mark_julia_exported(conn: &Connection, job_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE media SET julia_exported = 1 WHERE job_id = ?1",
        params![job_id],
    )?;
    Ok(())
}

pub fn data_dir_path() -> std::path::PathBuf {
    std::env::var_os("PULSAR_DATA_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from("../data"))
}

pub fn find_job_id_by_url(conn: &Connection, url: &str) -> Result<Option<i64>> {
    let mut stmt = conn.prepare("SELECT id FROM jobs WHERE url = ?1 LIMIT 1")?;
    let mut rows = stmt.query(params![url])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn get_job_by_id(conn: &Connection, id: i64) -> Result<Option<JobRecord>> {
    let mut stmt = conn.prepare(
        "SELECT j.id, j.url, j.status, j.progress, j.created_at,
                m.title, m.author, m.thumbnail, m.duration, m.video_path, m.keep_status, m.platform
         FROM jobs j
         LEFT JOIN media m ON j.id = m.job_id
         WHERE j.id = ?1"
    )?;
    stmt.query_row(params![id], |row| {
        Ok(JobRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            status: row.get(2)?,
            progress: row.get(3)?,
            created_at: row.get(4)?,
            title: row.get(5)?,
            author: row.get(6)?,
            thumbnail: row.get(7)?,
            duration: row.get(8)?,
            video_path: row.get(9)?,
            keep_status: row.get(10)?,
            platform: row.get(11)?,
            error_message: None,
            visual_analysis: None,
            instructional_guide: None,
        })
    }).optional()
}

pub fn get_all_job_ids(conn: &Connection) -> Result<Vec<i64>> {
    let mut stmt = conn.prepare("SELECT id FROM jobs ORDER BY id ASC")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    let mut ids = Vec::new();
    for r in rows {
        ids.push(r?);
    }
    Ok(ids)
}

pub fn get_transcript_text_for_job(conn: &Connection, job_id: i64) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT text FROM transcript_segments WHERE job_id = ?1 ORDER BY segment_index ASC"
    )?;
    let rows = stmt.query_map(params![job_id], |row| row.get(0))?;
    let mut texts = Vec::new();
    for r in rows {
        texts.push(r?);
    }
    Ok(texts)
}

pub fn get_job_title(conn: &Connection, job_id: i64) -> Result<Option<String>> {
    conn.query_row(
        "SELECT title FROM media WHERE job_id = ?1",
        params![job_id],
        |row| row.get(0),
    ).optional()
}

pub fn update_job_error(conn: &Connection, id: i64, status: &str, _message: &str) -> Result<()> {
    conn.execute(
        "UPDATE jobs SET status = ?1 WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}

pub fn clear_transcript_data(conn: &Connection, job_id: i64) -> Result<()> {
    conn.execute("DELETE FROM transcript_segments WHERE job_id = ?1", params![job_id])?;
    conn.execute("DELETE FROM transcript_embeddings WHERE job_id = ?1", params![job_id])?;
    Ok(())
}

pub fn update_media_analysis(_conn: &Connection, _job_id: i64, _visual_analysis: Option<&str>, _instructional_guide: Option<&str>) -> Result<()> {
    Ok(())
}

pub fn cleanup_media_files(_conn: &Connection, _job_id: i64, _processing_root: &std::path::Path) -> Result<()> {
    Ok(())
}

pub fn register_collection_source(_conn: &Connection, _url: &str) -> Result<()> {
    Ok(())
}

pub fn search_literal_transcripts(conn: &Connection, query: &str, limit: usize) -> Result<Vec<SearchResult>> {
    let mut stmt = conn.prepare(
        "SELECT ts.job_id, m.title, m.thumbnail, ts.text, ts.segment_index
         FROM transcript_segments ts
         LEFT JOIN media m ON ts.job_id = m.job_id
         WHERE ts.text LIKE ?1
         LIMIT ?2"
    )?;
    let pattern = format!("%{}%", query);
    let rows = stmt.query_map(params![pattern, limit as i64], |row| {
        Ok(SearchResult {
            job_id: row.get(0)?,
            title: row.get(1)?,
            thumbnail: row.get(2)?,
            chunk_text: row.get(3)?,
            chunk_index: row.get(4)?,
            similarity_score: 1.0,
        })
    })?;
    let mut results = Vec::new();
    for r in rows {
        results.push(r?);
    }
    Ok(results)
}

pub fn get_search_result(conn: &Connection, job_id: i64, chunk_index: i64) -> Option<SearchResult> {
    let mut stmt = conn.prepare(
        "SELECT ts.job_id, m.title, m.thumbnail, ts.text, ts.segment_index
         FROM transcript_segments ts
         LEFT JOIN media m ON ts.job_id = m.job_id
         WHERE ts.job_id = ?1 AND ts.segment_index = ?2
         LIMIT 1"
    ).ok()?;
    stmt.query_row(params![job_id, chunk_index], |row| {
        Ok(SearchResult {
            job_id: row.get(0)?,
            title: row.get(1)?,
            thumbnail: row.get(2)?,
            chunk_text: row.get(3)?,
            chunk_index: row.get(4)?,
            similarity_score: 1.0,
        })
    }).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_real_db_search() {
        let queries = ["video sobre marketing", "como crecer en tiktok", "ideas de contenido viral"];
        
        let conn = init_db().expect("Failed to init DB");
        
        // Initialize ONNX Manager
        let base_dir = std::env::current_dir().expect("Failed to get directroy").parent().unwrap().to_path_buf();
        let model_dir = base_dir.join("src-tauri").join("assets").join("models").join("all-MiniLM-L6-v2");
        
        let mut onnx_manager = crate::embedding::ONNXModelManager::new(
            &model_dir.join("model.onnx"),
            &model_dir.join("tokenizer.json")
        ).expect("Failed to init ONNX Manager for test");
        
        for query in queries.iter() {
            println!("\n=== Test Query: '{}' ===", query);
            
            let start_total = Instant::now();
            let start_embed = Instant::now();
            
            let query_vec = onnx_manager.generate_embedding(query).expect("Failed native embedding");
                
            let embed_time = start_embed.elapsed();
                
            let start_search = Instant::now();
            let results = search_embeddings(&conn, &query_vec, 10, 0.35).expect("Search failed");
            let search_time = start_search.elapsed();
            
            let total_time = start_total.elapsed();
            
            println!("Metrics:");
            println!("- Embed generation: {:?}", embed_time);
            println!("- SQLite Search & Ranking: {:?}", search_time);
            println!("- Total time: {:?}", total_time);
            
            println!("\nResults (Top {}):", results.len());
            for (i, r) in results.iter().enumerate() {
                println!("#{}: [Score {:.4}] (Job ID: {}) -> {}", i + 1, r.similarity_score, r.job_id, r.chunk_text);
            }
        }
    }
}


