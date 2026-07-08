use rusqlite::{params, Connection, Result};
use std::path::Path;
use std::fs;

#[derive(serde::Serialize)]
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
}

#[derive(serde::Serialize)]
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
            FOREIGN KEY(job_id) REFERENCES jobs(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS transcript_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            chunk_text TEXT NOT NULL,
            embedding_vector BLOB NOT NULL,
            FOREIGN KEY(job_id) REFERENCES jobs(id)
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
                m.title, m.author, m.thumbnail, m.duration, m.video_path
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
) -> Result<()> {
    conn.execute(
        "INSERT INTO media (job_id, title, author, thumbnail, duration, upload_date, video_path, audio_path, transcript_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(job_id) DO UPDATE SET
            title = excluded.title,
            author = excluded.author,
            thumbnail = excluded.thumbnail,
            duration = excluded.duration,
            upload_date = excluded.upload_date,
            video_path = excluded.video_path,
            audio_path = excluded.audio_path,
            transcript_path = excluded.transcript_path",
        params![job_id, title, author, thumbnail, duration, upload_date, video_path, audio_path, transcript_path],
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;
    use std::process::Command;

    #[test]
    fn test_real_db_search() {
        let queries = ["video sobre marketing", "como crecer en tiktok", "ideas de contenido viral"];
        
        let conn = init_db().expect("Failed to init DB");
        
        // Initialize ONNX Manager
        let base_dir = std::env::current_dir().expect("Failed to get directroy").parent().unwrap().to_path_buf();
        let model_dir = base_dir.join("src-tauri").join("assets").join("models").join("all-MiniLM-L6-v2");
        
        let onnx_manager = crate::embedding::ONNXModelManager::new(
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
