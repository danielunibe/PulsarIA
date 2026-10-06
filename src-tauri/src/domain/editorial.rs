//! # Editorial Domain Models & Contract
//!
//! Entidades conceptuales y contratos para el subsistema de Revistas / Tomos
//! Inteligentes de Pulsaria.
//! 100% Rust puro, sin dependencias de base de datos o frameworks.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

pub const EDITORIAL_SCHEMA_VERSION: &str = "1.0";

/// Máquina de estados del contenido editorial.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditorialState {
    Draft,
    Processing,
    Published,
    Updating,
    RequiresReview,
    Failed,
    Archived,
}

impl EditorialState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Processing => "processing",
            Self::Published => "published",
            Self::Updating => "updating",
            Self::RequiresReview => "requires_review",
            Self::Failed => "failed",
            Self::Archived => "archived",
        }
    }

    /// Valida si una transición de estado editorial es legal.
    pub fn can_transition_to(&self, next: EditorialState) -> bool {
        match (self, next) {
            (s, n) if *s == n => true,
            (Self::Draft, EditorialState::Processing) => true,
            (Self::Draft, EditorialState::Archived) => true,
            (Self::Processing, EditorialState::Published) => true,
            (Self::Processing, EditorialState::RequiresReview) => true,
            (Self::Processing, EditorialState::Failed) => true,
            (Self::Published, EditorialState::Updating) => true,
            (Self::Published, EditorialState::RequiresReview) => true,
            (Self::Published, EditorialState::Archived) => true,
            (Self::Updating, EditorialState::Published) => true,
            (Self::Updating, EditorialState::RequiresReview) => true,
            (Self::Updating, EditorialState::Failed) => true,
            (Self::RequiresReview, EditorialState::Published) => true,
            (Self::RequiresReview, EditorialState::Draft) => true,
            (Self::RequiresReview, EditorialState::Archived) => true,
            (Self::Failed, EditorialState::Draft) => true,
            (Self::Failed, EditorialState::Processing) => true,
            (Self::Failed, EditorialState::Archived) => true,
            (Self::Archived, EditorialState::Draft) => true,
            _ => false,
        }
    }
}

impl fmt::Display for EditorialState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for EditorialState {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "draft" => Ok(Self::Draft),
            "processing" => Ok(Self::Processing),
            "published" => Ok(Self::Published),
            "updating" => Ok(Self::Updating),
            "requires_review" => Ok(Self::RequiresReview),
            "failed" => Ok(Self::Failed),
            "archived" => Ok(Self::Archived),
            other => Err(format!("unknown editorial state: {other}")),
        }
    }
}

/// Tipos taxonómicos de artículos editoriales.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArticleType {
    Recipe,
    Tutorial,
    Guide,
    Technical,
    Review,
    Reference,
    Comparison,
    Collection,
    Insight,
}

impl ArticleType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Recipe => "recipe",
            Self::Tutorial => "tutorial",
            Self::Guide => "guide",
            Self::Technical => "technical",
            Self::Review => "review",
            Self::Reference => "reference",
            Self::Comparison => "comparison",
            Self::Collection => "collection",
            Self::Insight => "insight",
        }
    }
}

impl fmt::Display for ArticleType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for ArticleType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "recipe" => Ok(Self::Recipe),
            "tutorial" => Ok(Self::Tutorial),
            "guide" => Ok(Self::Guide),
            "technical" => Ok(Self::Technical),
            "review" => Ok(Self::Review),
            "reference" => Ok(Self::Reference),
            "comparison" => Ok(Self::Comparison),
            "collection" => Ok(Self::Collection),
            "insight" => Ok(Self::Insight),
            other => Err(format!("unknown article type: {other}")),
        }
    }
}

/// Rol de una fuente multimedia dentro del artículo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceRole {
    Primary,
    Supporting,
    Comparison,
    Reference,
}

impl SourceRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Primary => "primary",
            Self::Supporting => "supporting",
            Self::Comparison => "comparison",
            Self::Reference => "reference",
        }
    }
}

impl fmt::Display for SourceRole {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for SourceRole {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "primary" => Ok(Self::Primary),
            "supporting" => Ok(Self::Supporting),
            "comparison" => Ok(Self::Comparison),
            "reference" => Ok(Self::Reference),
            other => Err(format!("unknown source role: {other}")),
        }
    }
}

/// Naturaleza de la evidencia atómica extraída.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceKind {
    Timestamp,
    TranscriptSegment,
    Keyframe,
    Ocr,
    Metadata,
}

impl EvidenceKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Timestamp => "timestamp",
            Self::TranscriptSegment => "transcript_segment",
            Self::Keyframe => "keyframe",
            Self::Ocr => "ocr",
            Self::Metadata => "metadata",
        }
    }
}

impl fmt::Display for EvidenceKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for EvidenceKind {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "timestamp" => Ok(Self::Timestamp),
            "transcript_segment" => Ok(Self::TranscriptSegment),
            "keyframe" => Ok(Self::Keyframe),
            "ocr" => Ok(Self::Ocr),
            "metadata" => Ok(Self::Metadata),
            other => Err(format!("unknown evidence kind: {other}")),
        }
    }
}

/// Estado de resolución de un conflicto detectado entre fuentes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictResolutionState {
    Unresolved,
    ResolvedA,
    ResolvedB,
    Reconciled,
    Ignored,
}

impl ConflictResolutionState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Unresolved => "unresolved",
            Self::ResolvedA => "resolved_a",
            Self::ResolvedB => "resolved_b",
            Self::Reconciled => "reconciled",
            Self::Ignored => "ignored",
        }
    }
}

impl fmt::Display for ConflictResolutionState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for ConflictResolutionState {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "unresolved" => Ok(Self::Unresolved),
            "resolved_a" => Ok(Self::ResolvedA),
            "resolved_b" => Ok(Self::ResolvedB),
            "reconciled" => Ok(Self::Reconciled),
            "ignored" => Ok(Self::Ignored),
            other => Err(format!("unknown resolution state: {other}")),
        }
    }
}

/// Estado de ejecución de tareas de compilación editorial.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompilationTaskState {
    Queued,
    Processing,
    Completed,
    Failed,
    Cancelled,
    RequiresReview,
}

impl CompilationTaskState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Processing => "processing",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::RequiresReview => "requires_review",
        }
    }
}

impl fmt::Display for CompilationTaskState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for CompilationTaskState {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "queued" => Ok(Self::Queued),
            "processing" => Ok(Self::Processing),
            "completed" => Ok(Self::Completed),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            "requires_review" => Ok(Self::RequiresReview),
            other => Err(format!("unknown compilation task state: {other}")),
        }
    }
}

// ========================================================================
// ENTIDADES DE PERSISTENCIA Y TRANSFERENCIA (DTOs)
// ========================================================================

/// Tomo editorial encuadernado.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagazineVolumeRecord {
    pub id: String,
    pub volume_number: String,
    pub title: String,
    pub subtitle: String,
    pub category: String,
    pub description: String,
    pub color: String,
    pub accent_glow: String,
    pub spine_gradient: String,
    pub cover_gradient: String,
    pub hero_frame_path: Option<String>,
    pub editorial_state: EditorialState,
    pub article_count: i64,
    pub source_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Sección o capítulo dentro de un tomo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagazineChapterRecord {
    pub id: i64,
    pub volume_id: String,
    pub title: String,
    pub description: Option<String>,
    pub ordinal: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Artículo / Fascículo publicado en un tomo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagazineArticleRecord {
    pub id: String,
    pub volume_id: String,
    pub chapter_id: Option<i64>,
    pub title: String,
    pub article_type: ArticleType,
    pub summary: String,
    pub structured_content_json: String,
    pub editorial_state: EditorialState,
    pub active_version: i32,
    pub hero_frame_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Registro histórico inmutable de una versión de artículo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagazineArticleVersionRecord {
    pub id: i64,
    pub article_id: String,
    pub version_number: i32,
    pub title: String,
    pub summary: String,
    pub structured_content_json: String,
    pub editorial_notes_json: Option<String>,
    pub change_summary: Option<String>,
    pub created_at: String,
}

/// Fuente multimedia vinculada a un artículo (Job / Content Item existente).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagazineSourceRecord {
    pub id: i64,
    pub article_id: String,
    pub job_id: i64,
    pub content_id: Option<i64>,
    pub source_role: SourceRole,
    pub citation_label: Option<String>,
    pub created_at: String,
}

/// Fragmento específico de evidencia verificable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagazineEvidenceRecord {
    pub id: i64,
    pub article_id: String,
    pub source_id: i64,
    pub job_id: i64,
    pub evidence_kind: EvidenceKind,
    pub timestamp_start: Option<f64>,
    pub timestamp_end: Option<f64>,
    pub keyframe_path: Option<String>,
    pub transcript_text: Option<String>,
    pub extracted_fact: Option<String>,
    pub confidence: f64,
    pub created_at: String,
}

/// Discrepancia o contradicción detectada entre evidencias de fuentes distintas.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagazineConflictRecord {
    pub id: i64,
    pub article_id: String,
    pub fact_key: String,
    pub description: String,
    pub evidence_a_id: i64,
    pub evidence_b_id: i64,
    pub resolution_state: ConflictResolutionState,
    pub resolution_notes: Option<String>,
    pub resolved_at: Option<String>,
    pub created_at: String,
}

/// Tarea de compilación editorial en cola.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagazineCompilationRecord {
    pub id: i64,
    pub volume_id: String,
    pub status: CompilationTaskState,
    pub progress: i32,
    pub message: Option<String>,
    pub error_message: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub created_at: String,
}

/// Vista agregada completa de un artículo con sus evidencias y fuentes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagazineArticleDetails {
    pub article: MagazineArticleRecord,
    pub sources: Vec<MagazineSourceRecord>,
    pub evidence: Vec<MagazineEvidenceRecord>,
    pub versions: Vec<MagazineArticleVersionRecord>,
    pub conflicts: Vec<MagazineConflictRecord>,
}

/// Medio original resoluble para una fuente editorial (Fase 3: Reader).
/// React nunca toca SQLite: este DTO cruza por IPC y el frontend solo
/// convierte `video_path`/`poster_path` con `convertFileSrc`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagazineSourceMedia {
    pub job_id: i64,
    pub url: String,
    pub canonical_url: Option<String>,
    pub title: Option<String>,
    pub author: Option<String>,
    pub platform: Option<String>,
    /// Duración en segundos (`media.duration`, origen yt-dlp).
    pub duration_secs: Option<f64>,
    /// Ruta local del video cuando existe (`media.video_path`).
    pub video_path: Option<String>,
    pub poster_path: Option<String>,
    pub source_state: String,
    pub job_status: String,
}

// ========================================================================
// CONTRATO JSON EDITORIAL VERSIONADO (schema_version = "1.0")
// ========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorialSourcePayload {
    pub job_id: i64,
    #[serde(default = "default_source_role")]
    pub role: SourceRole,
    pub citation: Option<String>,
}

fn default_source_role() -> SourceRole {
    SourceRole::Primary
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorialEvidencePayload {
    pub job_id: i64,
    pub kind: EvidenceKind,
    pub timestamp_start: Option<f64>,
    pub timestamp_end: Option<f64>,
    pub keyframe_path: Option<String>,
    pub transcript_text: Option<String>,
    pub fact: Option<String>,
    #[serde(default = "default_confidence")]
    pub confidence: f64,
}

fn default_confidence() -> f64 {
    0.9
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorialConflictPayload {
    pub fact_key: String,
    pub description: String,
    pub evidence_a_index: usize,
    pub evidence_b_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EditorialConfidencePayload {
    pub overall: f64,
    #[serde(default)]
    pub sections: HashMap<String, f64>,
}

/// Propuesta fundamentada de un nuevo tomo editorial sugerida por el motor de síntesis.
/// IMPORTANTE: Es estrictamente una PROPUESTA editorial (candidato). Pulsaria NUNCA crea
/// ni persiste automáticamente un nuevo registro en `magazine_volumes` sin una decisión
/// explícita.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NewVolumeCandidate {
    pub suggested_title: String,
    pub rationale: String,
    pub suggested_category: String,
    #[serde(default)]
    pub suggested_chapter: Option<String>,
    #[serde(default)]
    pub supporting_job_ids: Vec<i64>,
    #[serde(default = "default_candidate_confidence")]
    pub confidence: f64,
}

fn default_candidate_confidence() -> f64 {
    0.85
}

/// Contrato oficial de intercambio para que el motor editorial (Gemini u offline)
/// entregue un fascículo estructurado y validable antes de escribir en SQLite.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorialArticlePayload {
    pub schema_version: String,
    pub article_type: ArticleType,
    pub title: String,
    pub summary: String,
    pub content: serde_json::Value,
    #[serde(default)]
    pub sources: Vec<EditorialSourcePayload>,
    #[serde(default)]
    pub evidence: Vec<EditorialEvidencePayload>,
    #[serde(default)]
    pub conflicts: Vec<EditorialConflictPayload>,
    #[serde(default)]
    pub confidence: EditorialConfidencePayload,
    #[serde(default)]
    pub editorial_notes: Vec<String>,
    #[serde(default)]
    pub candidate_volume: Option<NewVolumeCandidate>,
}

/// Errores de validación del contrato editorial.
#[derive(Debug, Clone, PartialEq)]
pub enum ContractValidationError {
    UnsupportedSchemaVersion(String),
    MissingTitle,
    MissingSummary,
    InvalidTimestampRange { start: f64, end: f64 },
    InvalidConfidence(String),
    EvidenceIndexOutOfBounds { index: usize, total: usize },
    SourceNotFoundForEvidence(i64),
    InvalidCandidate(String),
}

impl fmt::Display for ContractValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedSchemaVersion(v) => {
                write!(
                    f,
                    "unsupported schema version: '{v}', expected '{EDITORIAL_SCHEMA_VERSION}'"
                )
            }
            Self::MissingTitle => write!(f, "article title cannot be empty"),
            Self::MissingSummary => write!(f, "article summary cannot be empty"),
            Self::InvalidTimestampRange { start, end } => {
                write!(
                    f,
                    "invalid timestamp range: start={start} is greater than end={end}"
                )
            }
            Self::InvalidConfidence(reason) => write!(f, "invalid confidence score: {reason}"),
            Self::EvidenceIndexOutOfBounds { index, total } => {
                write!(f, "conflict references evidence index {index}, but only {total} evidence items exist")
            }
            Self::SourceNotFoundForEvidence(job_id) => {
                write!(
                    f,
                    "evidence references job_id {job_id} which is not declared in sources list"
                )
            }
            Self::InvalidCandidate(reason) => {
                write!(f, "invalid new volume candidate proposal: {reason}")
            }
        }
    }
}

impl std::error::Error for ContractValidationError {}

/// Valida rigurosamente un payload editorial frente al contrato canónico.
pub fn validate_editorial_contract(
    payload: &EditorialArticlePayload,
) -> Result<(), ContractValidationError> {
    if payload.schema_version != EDITORIAL_SCHEMA_VERSION {
        return Err(ContractValidationError::UnsupportedSchemaVersion(
            payload.schema_version.clone(),
        ));
    }

    if payload.title.trim().is_empty() {
        return Err(ContractValidationError::MissingTitle);
    }

    if payload.summary.trim().is_empty() {
        return Err(ContractValidationError::MissingSummary);
    }

    if payload.confidence.overall < 0.0 || payload.confidence.overall > 1.0 {
        return Err(ContractValidationError::InvalidConfidence(format!(
            "overall confidence {} is outside [0.0, 1.0]",
            payload.confidence.overall
        )));
    }

    let source_jobs: std::collections::HashSet<i64> =
        payload.sources.iter().map(|s| s.job_id).collect();

    for ev in &payload.evidence {
        // Toda evidencia debe declarar su fuente: un job sin declarar
        // rompería la trazabilidad Article → Source → Video + timestamp y
        // violaría el FK de magazine_evidence.
        if !source_jobs.contains(&ev.job_id) {
            return Err(ContractValidationError::SourceNotFoundForEvidence(
                ev.job_id,
            ));
        }

        if let (Some(s), Some(e)) = (ev.timestamp_start, ev.timestamp_end) {
            if s > e {
                return Err(ContractValidationError::InvalidTimestampRange { start: s, end: e });
            }
        }

        if ev.confidence < 0.0 || ev.confidence > 1.0 {
            return Err(ContractValidationError::InvalidConfidence(format!(
                "evidence confidence {} is outside [0.0, 1.0]",
                ev.confidence
            )));
        }
    }

    let evidence_len = payload.evidence.len();
    for conflict in &payload.conflicts {
        if conflict.evidence_a_index >= evidence_len {
            return Err(ContractValidationError::EvidenceIndexOutOfBounds {
                index: conflict.evidence_a_index,
                total: evidence_len,
            });
        }
        if conflict.evidence_b_index >= evidence_len {
            return Err(ContractValidationError::EvidenceIndexOutOfBounds {
                index: conflict.evidence_b_index,
                total: evidence_len,
            });
        }
    }

    if let Some(candidate) = &payload.candidate_volume {
        if candidate.suggested_title.trim().is_empty() {
            return Err(ContractValidationError::InvalidCandidate(
                "suggested title cannot be empty".to_string(),
            ));
        }
        if candidate.rationale.trim().is_empty() {
            return Err(ContractValidationError::InvalidCandidate(
                "rationale cannot be empty".to_string(),
            ));
        }
        if candidate.confidence < 0.0 || candidate.confidence > 1.0 {
            return Err(ContractValidationError::InvalidConfidence(format!(
                "candidate confidence {} is outside [0.0, 1.0]",
                candidate.confidence
            )));
        }
        for job_id in &candidate.supporting_job_ids {
            if !source_jobs.contains(job_id) {
                return Err(ContractValidationError::SourceNotFoundForEvidence(*job_id));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_editorial_state_machine() {
        assert!(EditorialState::Draft.can_transition_to(EditorialState::Processing));
        assert!(EditorialState::Processing.can_transition_to(EditorialState::Published));
        assert!(EditorialState::Processing.can_transition_to(EditorialState::Failed));
        assert!(EditorialState::Processing.can_transition_to(EditorialState::RequiresReview));
        assert!(EditorialState::Published.can_transition_to(EditorialState::Updating));
        assert!(EditorialState::Published.can_transition_to(EditorialState::Archived));

        // Transición no permitida
        assert!(!EditorialState::Archived.can_transition_to(EditorialState::Published));
        assert!(!EditorialState::Draft.can_transition_to(EditorialState::Published));
    }

    #[test]
    fn test_valid_contract_payload() {
        let payload = EditorialArticlePayload {
            schema_version: "1.0".to_string(),
            article_type: ArticleType::Recipe,
            title: "Masa Sablée Tradicional".to_string(),
            summary: "Técnica de cremado en frío para tartas dulces.".to_string(),
            content: serde_json::json!({
                "yield": "1 tarta 24cm",
                "ingredients": [
                    { "name": "Harina 0000", "amount": "250g" },
                    { "name": "Mantequilla", "amount": "125g" }
                ],
                "steps": [
                    { "step": 1, "instruction": "Arenar manteca y secos" }
                ]
            }),
            sources: vec![EditorialSourcePayload {
                job_id: 101,
                role: SourceRole::Primary,
                citation: Some("@patisserie.fr".to_string()),
            }],
            evidence: vec![EditorialEvidencePayload {
                job_id: 101,
                kind: EvidenceKind::Timestamp,
                timestamp_start: Some(0.0),
                timestamp_end: Some(15.5),
                keyframe_path: Some("data/keyframes/101_0.jpg".to_string()),
                transcript_text: Some("Batimos la manteca pomada".to_string()),
                fact: Some("125g manteca a 18°C".to_string()),
                confidence: 0.95,
            }],
            conflicts: vec![],
            confidence: EditorialConfidencePayload {
                overall: 0.95,
                sections: HashMap::new(),
            },
            editorial_notes: vec!["Confirmado con audio claro".to_string()],
            candidate_volume: None,
        };

        assert!(validate_editorial_contract(&payload).is_ok());
    }

    #[test]
    fn test_invalid_contract_rejected() {
        let mut invalid = EditorialArticlePayload {
            schema_version: "2.0".to_string(), // Incompatible
            article_type: ArticleType::Recipe,
            title: "".to_string(), // Vacío
            summary: "Test".to_string(),
            content: serde_json::Value::Null,
            sources: vec![],
            evidence: vec![],
            conflicts: vec![],
            confidence: EditorialConfidencePayload::default(),
            editorial_notes: vec![],
            candidate_volume: None,
        };

        assert!(matches!(
            validate_editorial_contract(&invalid),
            Err(ContractValidationError::UnsupportedSchemaVersion(_))
        ));

        invalid.schema_version = "1.0".to_string();
        assert!(matches!(
            validate_editorial_contract(&invalid),
            Err(ContractValidationError::MissingTitle)
        ));
    }

    #[test]
    fn test_inverted_timestamp_range_is_rejected() {
        let payload = EditorialArticlePayload {
            schema_version: "1.0".to_string(),
            article_type: ArticleType::Guide,
            title: "Título".to_string(),
            summary: "Resumen".to_string(),
            content: serde_json::json!({}),
            sources: vec![EditorialSourcePayload {
                job_id: 3,
                role: SourceRole::Primary,
                citation: None,
            }],
            evidence: vec![EditorialEvidencePayload {
                job_id: 3,
                kind: EvidenceKind::Timestamp,
                timestamp_start: Some(10.0),
                timestamp_end: Some(4.0),
                keyframe_path: None,
                transcript_text: None,
                fact: None,
                confidence: 0.9,
            }],
            conflicts: vec![],
            confidence: EditorialConfidencePayload::default(),
            editorial_notes: vec![],
            candidate_volume: None,
        };

        assert!(matches!(
            validate_editorial_contract(&payload),
            Err(ContractValidationError::InvalidTimestampRange { .. })
        ));
    }

    #[test]
    fn test_evidence_requires_declared_source() {
        let payload = EditorialArticlePayload {
            schema_version: "1.0".to_string(),
            article_type: ArticleType::Tutorial,
            title: "Título".to_string(),
            summary: "Resumen".to_string(),
            content: serde_json::json!({}),
            sources: vec![],
            evidence: vec![EditorialEvidencePayload {
                job_id: 7,
                kind: EvidenceKind::TranscriptSegment,
                timestamp_start: Some(1.0),
                timestamp_end: Some(2.0),
                keyframe_path: None,
                transcript_text: None,
                fact: Some("dato".to_string()),
                confidence: 0.9,
            }],
            conflicts: vec![],
            confidence: EditorialConfidencePayload::default(),
            editorial_notes: vec![],
            candidate_volume: None,
        };

        assert!(matches!(
            validate_editorial_contract(&payload),
            Err(ContractValidationError::SourceNotFoundForEvidence(7))
        ));
    }

    #[test]
    fn test_candidate_volume_validation() {
        let mut payload = EditorialArticlePayload {
            schema_version: "1.0".to_string(),
            article_type: ArticleType::Insight,
            title: "Vulcanismo Activo".to_string(),
            summary: "Análisis geológico de erupciones recientes.".to_string(),
            content: serde_json::json!({ "summary": "geología" }),
            sources: vec![EditorialSourcePayload {
                job_id: 88,
                role: SourceRole::Primary,
                citation: None,
            }],
            evidence: vec![],
            conflicts: vec![],
            confidence: EditorialConfidencePayload::default(),
            editorial_notes: vec![],
            candidate_volume: Some(NewVolumeCandidate {
                suggested_title: "Sistemas Volcánicos".to_string(),
                rationale: "Cluster temático de geología no cubierto por tomos existentes."
                    .to_string(),
                suggested_category: "geology".to_string(),
                suggested_chapter: Some("Vulcanología".to_string()),
                supporting_job_ids: vec![88],
                confidence: 0.9,
            }),
        };

        assert!(validate_editorial_contract(&payload).is_ok());

        // Título vacío de candidato rechazado
        payload.candidate_volume.as_mut().unwrap().suggested_title = "   ".to_string();
        assert!(matches!(
            validate_editorial_contract(&payload),
            Err(ContractValidationError::InvalidCandidate(_))
        ));

        // Job ajeno en supporting_job_ids rechazado
        payload.candidate_volume.as_mut().unwrap().suggested_title =
            "Sistemas Volcánicos".to_string();
        payload
            .candidate_volume
            .as_mut()
            .unwrap()
            .supporting_job_ids = vec![999];
        assert!(matches!(
            validate_editorial_contract(&payload),
            Err(ContractValidationError::SourceNotFoundForEvidence(999))
        ));
    }
}
