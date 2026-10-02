use super::models::JobRecord;

// ========================================================================
// DOMAIN PORTS: Interfaces para Inversion de Control
// Definen QUE necesita el sistema sin acoplar COMO se hace.
// ========================================================================

pub trait JobRepository: Send + Sync {
    fn insert_job(&self, url: &str) -> Result<i64, String>;
    fn get_all_jobs(&self) -> Result<Vec<JobRecord>, String>;
    fn update_status(&self, id: i64, status: &str, progress: i32) -> Result<(), String>;
    fn update_retrying(&self, id: i64, attempt: u32) -> Result<(), String>;

    // Simplificado para la demostracion
    fn update_media(
        &self,
        job_id: i64,
        title: &str,
        uploader: &str,
        duration: i32,
    ) -> Result<(), String>;
    fn get_connection(
        &self,
    ) -> Result<std::sync::Arc<std::sync::Mutex<rusqlite::Connection>>, String>;
}

pub trait EmbeddingEngine: Send + Sync {
    fn generate_embedding(&self, text: &str) -> Result<Vec<f32>, String>;
}

/// Versioned metadata contract for embedding implementations. The current
/// desktop engine still uses `EmbeddingEngine` for backwards compatibility,
/// while new indexes record these values per provider/model.
pub trait EmbeddingProvider: EmbeddingEngine {
    fn provider_id(&self) -> &str;
    fn model_version(&self) -> &str;
    fn dimensions(&self) -> usize;
}

/// Optional, local-only visual provider. No concrete implementation is
/// required for text-first search; keyframes and OCR remain valid evidence
/// when this capability is unavailable.
pub trait VisionProvider: Send + Sync {
    fn provider_id(&self) -> &str;
    fn model_version(&self) -> &str;
    fn is_available(&self) -> bool;
    fn analyze_keyframe(
        &self,
        artifact_path: &str,
    ) -> Result<super::models::VisionAnalysis, String>;
}

pub trait VectorIndex: Send + Sync {
    fn insert(
        &self,
        internal_id: usize,
        job_id: i64,
        chunk_index: i64,
        embedding: &[f32],
    ) -> Result<(), String>;
    fn search(&self, query_vec: &[f32], limit: usize) -> Result<Vec<(usize, f32)>, String>;
    fn get_chunk_info(&self, internal_id: usize) -> Result<(i64, i64), String>; // Returns (job_id, chunk_index)

    // Persistence
    fn snapshot_index(&self, file_path: &str) -> Result<(), String>;
    fn load_index(&self, file_path: &str) -> Result<(), String>;
}

pub trait ProfileMetadataProvider: Send + Sync {
    fn resolve_profile_metadata(
        &self,
        handle_or_url: &str,
    ) -> impl std::future::Future<Output = Result<super::models::ProfileMetadataSnapshot, String>> + Send;
}
