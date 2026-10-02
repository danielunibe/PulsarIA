use serde::{Deserialize, Serialize};
use std::fmt;

// ========================================================================
// DOMAIN MODELS: Entidades Core de Pulsaria
// Sin dependencias de Infraestructura (UI, DB o Python), 100% Rust puro.
// ========================================================================

pub const EMBEDDING_DIMS: usize = 384;

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
    pub retry_count: u32,
    pub created_at: String,

    // Media details (Flattened for simplicity matching current DB)
    pub title: Option<String>,
    pub author: Option<String>,
    pub thumbnail: Option<String>,
    pub duration: Option<i32>,
    pub video_path: Option<String>,
    pub audio_path: Option<String>,
    pub transcript_path: Option<String>,
    pub keep_status: Option<String>,
    pub platform: Option<String>,
    pub error_message: Option<String>,
    pub visual_analysis: Option<String>,
    pub instructional_guide: Option<String>,
    pub video_bytes: Option<u64>,
    pub audio_bytes: Option<u64>,
    pub downloaded_at: Option<String>,
    pub last_accessed_at: Option<String>,
    pub play_count: u64,
    pub open_count: u64,
    pub search_hit_count: u64,
    pub favorite: bool,
    pub pinned: bool,
    pub source_state: String,
    pub purged_at: Option<String>,
    pub purged_reason: Option<String>,
    pub poster_path: Option<String>,
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

/// User-facing retrieval modes. The old `literal` and `semantic` values are
/// translated at the boundary so the search engine itself has one contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchMode {
    Smart,
    Exact,
    Conceptual,
}

impl Default for SearchMode {
    fn default() -> Self {
        Self::Smart
    }
}

impl SearchMode {
    pub fn from_legacy(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "literal" | "exact" => Self::Exact,
            "semantic" | "conceptual" => Self::Conceptual,
            _ => Self::Smart,
        }
    }
}

/// A searchable representation of a piece of knowledge associated with a
/// library item. This deliberately includes future modalities so OCR and
/// vision can join the same retrieval pipeline without new result shapes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchRepresentation {
    Transcript,
    Ocr,
    Caption,
    Metadata,
    Entity,
    Summary,
    Vision,
}

impl SearchRepresentation {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Transcript => "transcript",
            Self::Ocr => "ocr",
            Self::Caption => "caption",
            Self::Metadata => "metadata",
            Self::Entity => "entity",
            Self::Summary => "summary",
            Self::Vision => "vision",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Transcript => "Voz",
            Self::Ocr => "Texto en pantalla",
            Self::Caption => "Caption",
            Self::Metadata => "Metadata",
            Self::Entity => "Entidad",
            Self::Summary => "Coincidencia conceptual",
            Self::Vision => "Visión",
        }
    }
}

impl std::str::FromStr for SearchRepresentation {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "transcript" => Ok(Self::Transcript),
            "ocr" => Ok(Self::Ocr),
            "caption" => Ok(Self::Caption),
            "metadata" => Ok(Self::Metadata),
            "entity" => Ok(Self::Entity),
            "summary" => Ok(Self::Summary),
            "vision" => Ok(Self::Vision),
            other => Err(format!("unknown search representation: {other}")),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryContext {
    pub base_query: Option<String>,
    pub concepts: Vec<String>,
    pub relationship: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub content_type: Option<String>,
    pub profile: Option<String>,
    pub entities: Vec<String>,
    pub media_local: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedFilters {
    pub relationship: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub content_type: Option<String>,
    pub profile: Option<String>,
    pub entities: Vec<String>,
    pub media_local: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedSearchRequest {
    pub query: String,
    #[serde(default)]
    pub mode: SearchMode,
    #[serde(default = "default_search_limit")]
    pub limit: usize,
    #[serde(default)]
    pub context: Option<QueryContext>,
}

fn default_search_limit() -> usize {
    10
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCapabilities {
    pub lexical: bool,
    pub vector: bool,
    pub ocr: bool,
    pub vision: bool,
    pub reranker: bool,
}

/// Optional local visual enrichment. The domain only knows the versioned
/// result shape; it does not require a concrete model or a remote service.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisionAnalysis {
    pub caption: Option<String>,
    pub labels: Vec<String>,
    pub embedding: Option<Vec<f32>>,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMoment {
    pub unit_id: i64,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    pub excerpt: String,
    pub representation: SearchRepresentation,
    pub match_thumbnail: Option<String>,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchProvenance {
    pub representation: SearchRepresentation,
    pub label: String,
    pub timestamp: Option<f64>,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultGroup {
    pub content_id: Option<i64>,
    pub job_id: i64,
    pub title: Option<String>,
    pub author: Option<String>,
    pub thumbnail: Option<String>,
    pub score: f32,
    pub primary_moment: SearchMoment,
    pub moments: Vec<SearchMoment>,
    pub provenance: Vec<SearchProvenance>,
    pub relationship_badges: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedSearchResponse {
    pub normalized_query: String,
    pub mode: SearchMode,
    pub parsed_filters: ParsedFilters,
    pub context: QueryContext,
    pub results: Vec<SearchResultGroup>,
    pub capabilities: SearchCapabilities,
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

// Mensaje de trabajo para la cola de procesamiento
#[derive(Debug, Clone)]
pub struct JobMessage {
    pub job_id: i64,
    pub url: String,
    pub attempt: u32,
    pub cookies_browser: Option<String>,
    pub formats: String,
    pub download_dir: String,
    pub retention: String,
    pub processing_quality: String,
    pub whisper_model: String,
    pub whisper_device: String,
    pub whisper_compute_type: String,
}

// ========================================================================
// PROFILE SOURCES ENGINE DOMAIN MODELS
// ========================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelKind {
    Posts,
    Reposts,
    Saved,
    Favorites,
}

impl ChannelKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Posts => "posts",
            Self::Reposts => "reposts",
            Self::Saved => "saved",
            Self::Favorites => "favorites",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "posts" => Some(Self::Posts),
            "reposts" => Some(Self::Reposts),
            "saved" => Some(Self::Saved),
            "favorites" | "likes" => Some(Self::Favorites),
            _ => None,
        }
    }
}

impl fmt::Display for ChannelKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChannelStatus {
    Idle,
    DiscoveringRecent,
    Backfilling,
    Syncing,
    Paused,
    RequiresAuth,
    RateLimited,
    CompletedInitialBackfill,
    Error,
    Unsupported,
}

impl ChannelStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::DiscoveringRecent => "discovering_recent",
            Self::Backfilling => "backfilling",
            Self::Syncing => "syncing",
            Self::Paused => "paused",
            Self::RequiresAuth => "requires_auth",
            Self::RateLimited => "rate_limited",
            Self::CompletedInitialBackfill => "completed_initial_backfill",
            Self::Error => "error",
            Self::Unsupported => "unsupported",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "discovering" | "discovering_recent" => Self::DiscoveringRecent,
            "backfilling" => Self::Backfilling,
            "syncing" => Self::Syncing,
            "paused" => Self::Paused,
            "requires_auth" | "needs_auth" => Self::RequiresAuth,
            "rate_limited" => Self::RateLimited,
            "completed_initial_backfill" => Self::CompletedInitialBackfill,
            "unsupported" => Self::Unsupported,
            "error" | "failed" => Self::Error,
            _ => Self::Idle,
        }
    }
}

impl fmt::Display for ChannelStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentAvailability {
    Unknown,
    Available,
    TemporarilyUnavailable,
    Private,
    Deleted,
    AccessDenied,
    Unsupported,
}

impl ContentAvailability {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Unknown => "unknown",
            Self::Available => "available",
            Self::TemporarilyUnavailable => "temporarily_unavailable",
            Self::Private => "private",
            Self::Deleted => "deleted",
            Self::AccessDenied => "access_denied",
            Self::Unsupported => "unsupported",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "available" => Self::Available,
            "temporarily_unavailable" => Self::TemporarilyUnavailable,
            "private" => Self::Private,
            "deleted" => Self::Deleted,
            "access_denied" => Self::AccessDenied,
            "unsupported" => Self::Unsupported,
            _ => Self::Unknown,
        }
    }
}

impl fmt::Display for ContentAvailability {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProfileErrorCode {
    NetworkTimeout,
    RateLimited,
    AuthRequired,
    AccessDenied,
    ContentPrivate,
    ContentDeleted,
    ContentUnavailable,
    InvalidResponse,
    ProviderUnsupported,
    DiskFull,
    ProcessCrash,
    Unknown,
}

impl ProfileErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NetworkTimeout => "NETWORK_TIMEOUT",
            Self::RateLimited => "RATE_LIMITED",
            Self::AuthRequired => "AUTH_REQUIRED",
            Self::AccessDenied => "ACCESS_DENIED",
            Self::ContentPrivate => "CONTENT_PRIVATE",
            Self::ContentDeleted => "CONTENT_DELETED",
            Self::ContentUnavailable => "CONTENT_UNAVAILABLE",
            Self::InvalidResponse => "INVALID_RESPONSE",
            Self::ProviderUnsupported => "PROVIDER_UNSUPPORTED",
            Self::DiskFull => "DISK_FULL",
            Self::ProcessCrash => "PROCESS_CRASH",
            Self::Unknown => "UNKNOWN",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_ascii_uppercase().as_str() {
            "NETWORK_TIMEOUT" => Self::NetworkTimeout,
            "RATE_LIMITED" => Self::RateLimited,
            "AUTH_REQUIRED" => Self::AuthRequired,
            "ACCESS_DENIED" => Self::AccessDenied,
            "CONTENT_PRIVATE" => Self::ContentPrivate,
            "CONTENT_DELETED" => Self::ContentDeleted,
            "CONTENT_UNAVAILABLE" => Self::ContentUnavailable,
            "INVALID_RESPONSE" => Self::InvalidResponse,
            "PROVIDER_UNSUPPORTED" => Self::ProviderUnsupported,
            "DISK_FULL" => Self::DiskFull,
            "PROCESS_CRASH" => Self::ProcessCrash,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSourceDomain {
    pub id: i64,
    pub platform: String,
    pub canonical_url: String,
    pub username: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub cover_url: Option<String>,
    pub verified: Option<bool>,
    pub following_count: Option<i64>,
    pub followers_count: Option<i64>,
    pub likes_count: Option<i64>,
    pub posts_count: Option<i64>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_sync_at: Option<String>,
    pub last_success_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileChannel {
    pub profile_source_id: i64,
    pub kind: ChannelKind,
    pub enabled: bool,
    pub status: ChannelStatus,
    pub discovered_count: Option<i64>,
    pub last_discovery_at: Option<String>,
    pub last_success_at: Option<String>,
    pub cursor: Option<String>,
    pub newest_known_content_id: Option<String>,
    pub oldest_known_content_id: Option<String>,
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentItem {
    pub id: i64,
    pub platform: String,
    pub platform_content_id: String,
    pub canonical_url: String,
    pub author_id: Option<String>,
    pub author_handle: Option<String>,
    pub title: Option<String>,
    pub published_at: Option<String>,
    pub discovered_at: String,
    pub updated_at: String,
    pub availability: ContentAvailability,
    pub job_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentRelationship {
    pub content_id: i64,
    pub profile_source_id: i64,
    pub channel_kind: ChannelKind,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub active: bool,
    pub provenance: Option<String>,
    pub sync_run_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProfileMetadataSnapshot {
    pub display_name: Option<String>,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub cover_url: Option<String>,
    pub verified: Option<bool>,
    pub following_count: Option<i64>,
    pub followers_count: Option<i64>,
    pub likes_count: Option<i64>,
    pub posts_count: Option<i64>,
    pub signature: Option<String>,
    pub private_account: Option<bool>,
}
