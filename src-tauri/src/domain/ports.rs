use super::models::JobRecord;

// ========================================================================
// DOMAIN PORTS: Interfaces para Inversión de Control
// Definen QUÉ necesita el sistema sin acoplar CÓMO se hace.
// ========================================================================

pub trait JobRepository: Send + Sync {
    fn insert_job(&self, url: &str) -> Result<i64, String>;
    fn get_all_jobs(&self) -> Result<Vec<JobRecord>, String>;
    fn update_status(&self, id: i64, status: &str, progress: i32) -> Result<(), String>;
    
    fn update_media(&self, job_id: i64, title: &str, uploader: &str, thumbnail: &str, duration: i32, upload_date: &str, video_path: &str, audio_path: &str, transcript_path: &str) -> Result<(), String>;
}

pub trait EmbeddingEngine: Send + Sync {
    fn generate_embedding(&self, text: &str) -> Result<Vec<f32>, String>;
}

pub trait VectorIndex: Send + Sync {
    fn insert(&self, internal_id: usize, job_id: i64, chunk_index: i64, embedding: &[f32]) -> Result<(), String>;
    fn search(&self, query_vec: &[f32], limit: usize) -> Result<Vec<usize>, String>;
    fn get_chunk_info(&self, internal_id: usize) -> Result<(i64, i64), String>; // Returns (job_id, chunk_index)
    
    // Persistence
    fn snapshot_index(&self, file_path: &str) -> Result<(), String>;
    fn load_index(&self, file_path: &str) -> Result<(), String>;
}
