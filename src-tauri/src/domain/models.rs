use serde::{Deserialize, Serialize};
use std::fmt;

// ========================================================================
// DOMAIN MODELS: Entidades Core de Pulsar Eventide
// Sin dependencias de Infraestructura (UI, DB o Python), 100% Rust puro.
// ========================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum QueueStep {
    #[serde(rename = "queued")]
    Queued,
    #[serde(rename = "metadata")]
    Metadata,
    #[serde(rename = "downloading")]
    Downloading,
    #[serde(rename = "processing")]
    Processing,
    #[serde(rename = "transcribing")]
    Transcribing,
    #[serde(rename = "indexing")]
    Indexing,
    #[serde(rename = "complete")]
    Complete,
    #[serde(rename = "error")]
    Error,
}

impl fmt::Display for QueueStep {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Self::Queued => "queued",
            Self::Metadata => "metadata",
            Self::Downloading => "downloading",
            Self::Processing => "processing",
            Self::Transcribing => "transcribing",
            Self::Indexing => "indexing",
            Self::Complete => "complete",
            Self::Error => "error",
        };
        write!(f, "{}", s)
    }
}

// Representa la Metadata multimedia extraída por yt-dlp
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaMetadata {
    pub title: String,
    pub uploader: String,
    pub duration: i32,
    pub thumbnail: String,
    #[serde(rename = "upload_date")]
    pub upload_date: String,
}

// Evento de progreso del pipeline unificado
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub job: i64,
    pub step: QueueStep,
    pub progress: i32,
    pub metadata: Option<MediaMetadata>,
}

// Registro completo de un Job en el sistema (Agregado raíz)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobRecord {
    pub id: i64,
    pub url: String,
    pub status: String,
    pub progress: i32,
    pub created_at: String,
    
    // Media details (Flattened for simplicity matching current DB)
    pub title: Option<String>,
    pub author: Option<String>,
    pub thumbnail: Option<String>,
    pub duration: Option<i32>,
    pub video_path: Option<String>,
}

// Resultado puro de una búsqueda semántica
#[derive(Debug, Clone, Serialize, Deserialize)]
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

// Representación de un texto fragmentado antes del embedding
#[derive(Debug, Clone)]
pub struct TranscriptChunk {
    pub chunk_index: i64,
    pub text: String,
}

// Configuración general del motor de búsqueda (Value Object)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchConfig {
    pub min_score: f32,
    pub max_results: usize,
    pub similarity_metric: String,
    pub chunk_size: usize,
    pub chunk_overlap: usize,
}

impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            min_score: 0.35,
            max_results: 10,
            similarity_metric: "Cosine".into(),
            chunk_size: 150,
            chunk_overlap: 50,
        }
    }
}

// Métricas unificadas del sistema
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SystemMetrics {
    pub average_query_time_ms: f32,
    pub average_onnx_time_ms: f32,
    pub average_db_time_ms: f32,
    pub model_load_time_ms: f32,
    pub total_queries_run: u64,
}
