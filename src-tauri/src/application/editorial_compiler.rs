//! # Editorial Compiler
//!
//! Orquesta el pipeline del motor editorial de Pulsaria:
//!
//! ```text
//! Source ──► Evidence Package ──► Editorial Compiler ──► AI Provider
//!     ──► Validation ──► Conflict Detection ──► Magazine Service ──► SQLite
//! ```
//!
//! Autoridad: la evidencia manda, el proveedor propone, Pulsaria publica.
//! Ningún resultado inválido llega a `published`: contrato roto o
//! provenance irresoluble ⇒ compilación `failed` SIN artículo; conflictos
//! (sugeridos o autodetectados) ⇒ `requires_review`. Los bloqueos de
//! terminales de `update_magazine_compilation` se respetan siempre.
//!
//! Concurrencia: ningún bloqueo de SQLite cruza el `await` de red. El
//! compilador toma la cerradura por fases cortas (preparar → soltar →
//! proveedor → soltar → persistir).

use crate::application::editorial_evidence::{
    build_evidence_package, build_multi_source_evidence_package, EditorialEvidencePackage,
    MultiSourceEvidencePackage,
};
use crate::application::editorial_provider::{
    parse_provider_response, EditorialCompilerRequest, EditorialContext, EditorialProvider,
    ExistingArticleSummary, MultiSourceEditorialCompilerRequest, PlacementDecision, ProviderError,
};
use crate::application::magazine_service;
use crate::domain::editorial::{
    validate_editorial_contract, CompilationTaskState, EditorialArticlePayload,
    EditorialConflictPayload, EditorialState, EvidenceKind, EDITORIAL_SCHEMA_VERSION,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::Mutex as StdMutex;

pub const DEFAULT_MAX_OUTPUT_TOKENS: u32 = 4_096;
pub const MAX_CONTEXT_ARTICLES: i64 = 12;
const KEYFRAME_TIME_TOLERANCE_SECS: f64 = 1.0;

/// Parámetros de una compilación editorial de una sola fuente.
#[derive(Debug, Clone)]
pub struct CompileParams {
    pub job_id: i64,
    pub volume_id: String,
    pub chapter_id: Option<i64>,
    pub update_article_id: Option<String>,
    pub max_output_tokens: u32,
}

/// Parámetros de una compilación editorial multi-fuente.
#[derive(Debug, Clone)]
pub struct MultiSourceCompileParams {
    pub job_ids: Vec<i64>,
    pub volume_id: String,
    pub chapter_id: Option<i64>,
    pub update_article_id: Option<String>,
    pub max_output_tokens: u32,
}

/// Resultado serializable de una compilación (respuesta IPC).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompilationOutcome {
    pub compilation_id: i64,
    pub status: CompilationTaskState,
    pub article_id: Option<String>,
    pub version: Option<i32>,
    pub conflict_count: usize,
    /// `true` cuando la propuesta era idéntica a la versión activa: no se
    /// creó versión nueva (compilación `completed` igualmente).
    pub unchanged: bool,
    pub message: String,
    #[serde(default)]
    pub candidate: Option<crate::domain::editorial::NewVolumeCandidate>,
}

/// La provenance falla cerrada: ningún dato sin ancla en SQLite.
#[derive(Debug, Clone, PartialEq)]
pub enum ProvenanceError {
    UnknownSourceJob(i64),
    ForeignEvidenceJob(i64),
    NegativeTimestamp(f64),
    ExceedsDuration { end: f64, duration: f64 },
    NoOverlappingSegment { start: f64, end: f64 },
    KeyframeNotFound(String),
    NoOcrEvidence,
    SpuriousConflict { index_a: usize, index_b: usize },
    EmptyContent,
}

impl fmt::Display for ProvenanceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownSourceJob(job_id) => write!(
                f,
                "payload cites source job '{job_id}' outside the compiled evidence (multi-source is not enabled yet)"
            ),
            Self::ForeignEvidenceJob(job_id) => write!(
                f,
                "evidence cites job '{job_id}' which was not gathered for this compilation"
            ),
            Self::NegativeTimestamp(value) => {
                write!(f, "evidence timestamp is negative: {value}")
            }
            Self::ExceedsDuration { end, duration } => write!(
                f,
                "evidence ends at {end}s but the video lasts {duration}s"
            ),
            Self::NoOverlappingSegment { start, end } => write!(
                f,
                "no transcript segment overlaps evidence range {start}s–{end}s"
            ),
            Self::KeyframeNotFound(reference) => {
                write!(f, "keyframe reference cannot be resolved: {reference}")
            }
            Self::NoOcrEvidence => write!(
                f,
                "evidence claims OCR but the job has no indexed OCR units"
            ),
            Self::SpuriousConflict { index_a, index_b } => write!(
                f,
                "conflict between evidence {index_a} and {index_b} compares identical evidence"
            ),
            Self::EmptyContent => {
                write!(f, "article content must be a non-empty JSON object")
            }
        }
    }
}

impl std::error::Error for ProvenanceError {}

/// Conflicto autodetectado por Pulsaria (no sugerido por el proveedor).
#[derive(Debug, Clone)]
pub struct AutoConflict {
    pub fact_key: String,
    pub description: String,
    pub evidence_a_index: usize,
    pub evidence_b_index: usize,
}

// ========================================================================
// ENTRADA PRINCIPAL
// ========================================================================

/// Compila un job hacia un tomo: reúne evidencia, pide propuesta al
/// proveedor, valida (contrato + provenance), detecta conflictos y persiste.
/// Nunca deja una compilación atascada en `processing` ante un error.
pub async fn compile_magazine_source(
    db: &StdMutex<Connection>,
    provider: &EditorialProvider,
    params: CompileParams,
) -> Result<CompilationOutcome, String> {
    let prepared = prepare_compilation(db, &params)?;
    let compilation_id = prepared.id;
    match run_pipeline(db, provider, &params, prepared).await {
        Ok(outcome) => Ok(outcome),
        Err(reason) => {
            mark_failed(db, compilation_id, &reason);
            Err(reason)
        }
    }
}

/// Compila múltiples jobs hacia un tomo: reúne la evidencia multi-fuente,
/// solicita propuesta editorial cruzada al proveedor, valida (contrato +
/// provenance multi-fuente), detecta conflictos numéricos y cualitativos,
/// y persiste el artículo / nueva versión con anclaje a todas las fuentes.
/// Si se propone un `NewVolumeCandidate`, se almacena como propuesta en la
/// compilación sin crear jamás un tomo persistido automáticamente.
pub async fn compile_multi_source_editorial(
    db: &StdMutex<Connection>,
    provider: &EditorialProvider,
    params: MultiSourceCompileParams,
) -> Result<CompilationOutcome, String> {
    let prepared = prepare_multi_source_compilation(db, &params)?;
    let compilation_id = prepared.id;
    match run_multi_source_pipeline(db, provider, &params, prepared).await {
        Ok(outcome) => Ok(outcome),
        Err(reason) => {
            mark_failed(db, compilation_id, &reason);
            Err(reason)
        }
    }
}

/// Reejecuta una compilación existente con sus parámetros guardados.
/// Solo desde estados no exitosos (`failed`, `cancelled`, `requires_review`);
/// una compilación `completed` o en curso se rechaza explícitamente.
pub async fn retry_magazine_compilation(
    db: &StdMutex<Connection>,
    provider: &EditorialProvider,
    compilation_id: i64,
    max_output_tokens: u32,
) -> Result<CompilationOutcome, String> {
    let params = {
        let conn = db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        let compilation = magazine_service::get_magazine_compilation(&conn, compilation_id)?;
        match compilation.status {
            CompilationTaskState::Failed
            | CompilationTaskState::Cancelled
            | CompilationTaskState::RequiresReview => {}
            CompilationTaskState::Completed => {
                return Err(format!(
                    "magazine compilation '{compilation_id}' is already completed"
                ));
            }
            CompilationTaskState::Queued | CompilationTaskState::Processing => {
                return Err(format!(
                    "magazine compilation '{compilation_id}' is already in progress"
                ));
            }
        }
        let (job_id, chapter_id, update_article) =
            magazine_service::get_compilation_source(&conn, compilation_id)?.ok_or_else(|| {
                format!("magazine compilation '{compilation_id}' has no source (legacy row)")
            })?;
        CompileParams {
            job_id,
            volume_id: compilation.volume_id.clone(),
            chapter_id,
            update_article_id: update_article,
            max_output_tokens,
        }
    };
    // Reencolar respeta la guarda de terminales (terminal → queued).
    // La fila se reutiliza: el historial de la compilación no se duplica.
    let prepared = {
        let conn = db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        let package = build_evidence_package(&conn, params.job_id).map_err(|e| e.to_string())?;
        let context = build_editorial_context(&conn, &params, &package)?;
        // Reencolado en dos pasos: la guarda de terminales solo admite
        // terminal → queued, y queued → processing es avance libre.
        magazine_service::update_magazine_compilation(
            &conn,
            compilation_id,
            CompilationTaskState::Queued,
            0,
            Some("reintento editorial solicitado"),
            None,
        )?;
        magazine_service::update_magazine_compilation(
            &conn,
            compilation_id,
            CompilationTaskState::Processing,
            5,
            Some("reintento: evidencia reunida de nuevo"),
            None,
        )?;
        PreparedCompilation {
            id: compilation_id,
            package,
            context,
        }
    };
    match run_pipeline(db, provider, &params, prepared).await {
        Ok(outcome) => Ok(outcome),
        Err(reason) => {
            mark_failed(db, compilation_id, &reason);
            Err(reason)
        }
    }
}

// ========================================================================
// FASES
// ========================================================================

/// Compilación preparada: fila en `processing` + datos owned que cruzan el
/// `await` del proveedor sin retener el bloqueo de SQLite.
struct PreparedCompilation {
    id: i64,
    package: EditorialEvidencePackage,
    context: EditorialContext,
}

/// Fase A (bloqueo corto): valida destino, reúne evidencia + contexto, crea
/// la fila de compilación y la marca `processing`.
fn prepare_compilation(
    db: &StdMutex<Connection>,
    params: &CompileParams,
) -> Result<PreparedCompilation, String> {
    let conn = db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    if let Some(article_id) = params.update_article_id.as_deref() {
        let (article_volume,): (String,) = conn
            .query_row(
                "SELECT volume_id FROM magazine_articles WHERE id = ?1",
                params![article_id],
                |row| Ok((row.get(0)?,)),
            )
            .map_err(|_| format!("magazine article '{article_id}' does not exist"))?;
        if article_volume != params.volume_id {
            return Err(format!(
                "magazine article '{article_id}' does not belong to volume '{}'",
                params.volume_id
            ));
        }
    }
    // La evidencia se reúne aquí (rápido, local) para soltar el bloqueo
    // antes de la llamada de red.
    let package = build_evidence_package(&conn, params.job_id).map_err(|e| e.to_string())?;
    let context = build_editorial_context(&conn, params, &package)?;
    let compilation = magazine_service::create_magazine_compilation_for_source(
        &conn,
        &params.volume_id,
        params.job_id,
        params.chapter_id,
        params.update_article_id.as_deref(),
    )?;
    magazine_service::update_magazine_compilation(
        &conn,
        compilation.id,
        CompilationTaskState::Processing,
        5,
        Some("evidencia reunida; esperando propuesta del proveedor"),
        None,
    )?;
    Ok(PreparedCompilation {
        id: compilation.id,
        package,
        context,
    })
}

/// Compilación multi-fuente preparada: fila en `processing` + datos owned que
/// cruzan el `await` del proveedor sin retener el bloqueo de SQLite.
struct PreparedMultiSourceCompilation {
    id: i64,
    package: MultiSourceEvidencePackage,
    context: EditorialContext,
}

fn prepare_multi_source_compilation(
    db: &StdMutex<Connection>,
    params: &MultiSourceCompileParams,
) -> Result<PreparedMultiSourceCompilation, String> {
    if params.job_ids.is_empty() {
        return Err("multi-source compilation requires at least one source job".to_string());
    }
    let conn = db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    if let Some(article_id) = params.update_article_id.as_deref() {
        let (article_volume,): (String,) = conn
            .query_row(
                "SELECT volume_id FROM magazine_articles WHERE id = ?1",
                params![article_id],
                |row| Ok((row.get(0)?,)),
            )
            .map_err(|_| format!("magazine article '{article_id}' does not exist"))?;
        if article_volume != params.volume_id {
            return Err(format!(
                "magazine article '{article_id}' does not belong to volume '{}'",
                params.volume_id
            ));
        }
    }
    let package =
        build_multi_source_evidence_package(&conn, &params.job_ids).map_err(|e| e.to_string())?;
    let context = build_multi_source_editorial_context(&conn, params, &package)?;
    let compilation = magazine_service::create_magazine_compilation_for_multi_source(
        &conn,
        &params.volume_id,
        &params.job_ids,
        params.chapter_id,
        params.update_article_id.as_deref(),
    )?;
    magazine_service::update_magazine_compilation(
        &conn,
        compilation.id,
        CompilationTaskState::Processing,
        5,
        Some("evidencia multi-fuente reunida; esperando propuesta del proveedor"),
        None,
    )?;
    Ok(PreparedMultiSourceCompilation {
        id: compilation.id,
        package,
        context,
    })
}

/// Núcleo del pipeline: proveedor → parse → contrato → provenance →
/// conflictos → persistencia. Ningún bloqueo cruza el `await`.
async fn run_pipeline(
    db: &StdMutex<Connection>,
    provider: &EditorialProvider,
    params: &CompileParams,
    prepared: PreparedCompilation,
) -> Result<CompilationOutcome, String> {
    let compilation_id = prepared.id;
    let request = EditorialCompilerRequest {
        schema_version: EDITORIAL_SCHEMA_VERSION.to_string(),
        package: prepared.package,
        context: prepared.context,
    };
    set_progress(
        db,
        compilation_id,
        40,
        "propuesta solicitada al proveedor editorial",
    )?;

    let raw = provider
        .generate(&request, params.max_output_tokens)
        .await
        .map_err(|e: ProviderError| e.to_string())?;
    let payload = parse_provider_response(&raw).map_err(|e: ProviderError| e.to_string())?;

    set_progress(db, compilation_id, 60, "propuesta recibida; validando")?;

    validate_editorial_contract(&payload).map_err(|e| format!("contract rejected: {e}"))?;
    validate_provenance(&request.package, &payload)
        .map_err(|e| format!("provenance rejected: {e}"))?;
    if !is_non_empty_object(&payload.content) {
        return Err(format!(
            "provenance rejected: {}",
            ProvenanceError::EmptyContent
        ));
    }

    // Conflictos sugeridos (ya validados por índice) + autodetectados.
    let auto = detect_numeric_conflicts(&payload);
    let mut merged = payload.clone();
    for conflict in &auto {
        merged.conflicts.push(EditorialConflictPayload {
            fact_key: conflict.fact_key.clone(),
            description: conflict.description.clone(),
            evidence_a_index: conflict.evidence_a_index,
            evidence_b_index: conflict.evidence_b_index,
        });
    }

    set_progress(db, compilation_id, 85, "persistiendo artículo")?;

    let mut conn = db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    persist_compilation_result(&mut conn, compilation_id, params, &merged, auto.len())
}

/// Núcleo del pipeline multi-fuente: proveedor → parse → contrato →
/// provenance multi-fuente → conflictos → persistencia. Ningún bloqueo cruza el `await`.
async fn run_multi_source_pipeline(
    db: &StdMutex<Connection>,
    provider: &EditorialProvider,
    params: &MultiSourceCompileParams,
    prepared: PreparedMultiSourceCompilation,
) -> Result<CompilationOutcome, String> {
    let compilation_id = prepared.id;
    let request = MultiSourceEditorialCompilerRequest {
        schema_version: EDITORIAL_SCHEMA_VERSION.to_string(),
        package: prepared.package,
        context: prepared.context,
    };
    set_progress(
        db,
        compilation_id,
        40,
        "propuesta multi-fuente solicitada al proveedor editorial",
    )?;

    let raw = provider
        .generate_multi_source(&request, params.max_output_tokens)
        .await
        .map_err(|e: ProviderError| e.to_string())?;
    let payload = parse_provider_response(&raw).map_err(|e: ProviderError| e.to_string())?;

    set_progress(
        db,
        compilation_id,
        60,
        "propuesta multi-fuente recibida; validando",
    )?;

    validate_editorial_contract(&payload).map_err(|e| format!("contract rejected: {e}"))?;
    validate_multi_source_provenance(&request.package, &payload)
        .map_err(|e| format!("provenance rejected: {e}"))?;
    if !is_non_empty_object(&payload.content) {
        return Err(format!(
            "provenance rejected: {}",
            ProvenanceError::EmptyContent
        ));
    }

    // Conflictos sugeridos (ya validados por índice) + autodetectados.
    let auto = detect_numeric_conflicts(&payload);
    let mut merged = payload.clone();
    for conflict in &auto {
        merged.conflicts.push(EditorialConflictPayload {
            fact_key: conflict.fact_key.clone(),
            description: conflict.description.clone(),
            evidence_a_index: conflict.evidence_a_index,
            evidence_b_index: conflict.evidence_b_index,
        });
    }

    set_progress(db, compilation_id, 85, "persistiendo artículo multi-fuente")?;

    let mut conn = db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    persist_multi_source_compilation_result(&mut conn, compilation_id, params, &merged, auto.len())
}

/// Fase B (bloqueo corto): crea el artículo o una nueva versión, o detecta
/// que no hay cambios; actualiza la compilación al estado final.
fn persist_compilation_result(
    conn: &mut Connection,
    compilation_id: i64,
    params: &CompileParams,
    payload: &EditorialArticlePayload,
    auto_conflicts: usize,
) -> Result<CompilationOutcome, String> {
    let total_conflicts = payload.conflicts.len();

    // Persistir NewVolumeCandidate como propuesta si existe (sin crear tomo en DB)
    if let Some(candidate) = &payload.candidate_volume {
        let candidate_json = serde_json::to_string(candidate).map_err(|e| e.to_string())?;
        magazine_service::update_magazine_compilation_candidate(
            conn,
            compilation_id,
            Some(&candidate_json),
        )?;
    }

    if let Some(article_id) = params.update_article_id.as_deref() {
        if magazine_service::article_content_matches(
            conn,
            article_id,
            &payload.title,
            &payload.summary,
            &payload.content,
        )? {
            let record = magazine_service::update_magazine_compilation(
                conn,
                compilation_id,
                CompilationTaskState::Completed,
                100,
                Some("sin cambios respecto a la versión activa; no se creó versión"),
                None,
            )?;
            return Ok(CompilationOutcome {
                compilation_id,
                status: record.status,
                article_id: Some(article_id.to_string()),
                version: None,
                conflict_count: total_conflicts,
                unchanged: true,
                message: "proposal identical to the active version".to_string(),
                candidate: payload.candidate_volume.clone(),
            });
        }
        let content_str = serde_json::to_string(&payload.content).map_err(|e| e.to_string())?;
        let notes_str =
            serde_json::to_string(&payload.editorial_notes).map_err(|e| e.to_string())?;
        let version = magazine_service::add_article_version(
            conn,
            article_id,
            &payload.title,
            &payload.summary,
            &content_str,
            Some(&notes_str),
            Some(&format!("compilación editorial #{compilation_id}")),
        )?;
        magazine_service::attach_sources_and_evidence_to_article(conn, article_id, payload)?;
        flag_requires_review(conn, article_id, total_conflicts)?;
        let final_state = if total_conflicts > 0 {
            CompilationTaskState::RequiresReview
        } else {
            CompilationTaskState::Completed
        };
        let record = magazine_service::update_magazine_compilation(
            conn,
            compilation_id,
            final_state,
            100,
            Some(&format!(
                "nueva versión v{} persistida",
                version.version_number
            )),
            None,
        )?;
        return Ok(CompilationOutcome {
            compilation_id,
            status: record.status,
            article_id: Some(article_id.to_string()),
            version: Some(version.version_number),
            conflict_count: total_conflicts,
            unchanged: false,
            message: format!(
                "version {} stored ({} suggested/auto conflicts)",
                version.version_number, auto_conflicts
            ),
            candidate: payload.candidate_volume.clone(),
        });
    }

    let details = magazine_service::create_article_from_contract(
        conn,
        &params.volume_id,
        params.chapter_id,
        payload,
        None,
    )?;
    // `create_article_from_contract` ya publica o marca requires_review
    // según haya conflictos; la compilación refleja ese mismo estado.
    let final_state = details.article.editorial_state;
    let compilation_state = match final_state {
        EditorialState::RequiresReview => CompilationTaskState::RequiresReview,
        _ => CompilationTaskState::Completed,
    };
    let record = magazine_service::update_magazine_compilation(
        conn,
        compilation_id,
        compilation_state,
        100,
        Some(&format!("artículo {} persistido", details.article.id)),
        None,
    )?;
    Ok(CompilationOutcome {
        compilation_id,
        status: record.status,
        article_id: Some(details.article.id.clone()),
        version: Some(details.article.active_version),
        conflict_count: total_conflicts,
        unchanged: false,
        message: format!("article stored with {total_conflicts} conflicts"),
        candidate: payload.candidate_volume.clone(),
    })
}

/// Persiste el resultado de una compilación multi-fuente: crea el artículo
/// con múltiples fuentes/evidencias asociadas o genera una nueva versión;
/// persiste NewVolumeCandidate como propuesta si existe sin alterar magazine_volumes.
fn persist_multi_source_compilation_result(
    conn: &mut Connection,
    compilation_id: i64,
    params: &MultiSourceCompileParams,
    payload: &EditorialArticlePayload,
    auto_conflicts: usize,
) -> Result<CompilationOutcome, String> {
    let total_conflicts = payload.conflicts.len();

    // Persistir NewVolumeCandidate como propuesta aislada (sin crear tomo en DB)
    if let Some(candidate) = &payload.candidate_volume {
        let candidate_json = serde_json::to_string(candidate).map_err(|e| e.to_string())?;
        magazine_service::update_magazine_compilation_candidate(
            conn,
            compilation_id,
            Some(&candidate_json),
        )?;
    }

    if let Some(article_id) = params.update_article_id.as_deref() {
        if magazine_service::article_content_matches(
            conn,
            article_id,
            &payload.title,
            &payload.summary,
            &payload.content,
        )? {
            let record = magazine_service::update_magazine_compilation(
                conn,
                compilation_id,
                CompilationTaskState::Completed,
                100,
                Some("sin cambios respecto a la versión activa; no se creó versión"),
                None,
            )?;
            return Ok(CompilationOutcome {
                compilation_id,
                status: record.status,
                article_id: Some(article_id.to_string()),
                version: None,
                conflict_count: total_conflicts,
                unchanged: true,
                message: "proposal identical to the active version".to_string(),
                candidate: payload.candidate_volume.clone(),
            });
        }
        let content_str = serde_json::to_string(&payload.content).map_err(|e| e.to_string())?;
        let notes_str =
            serde_json::to_string(&payload.editorial_notes).map_err(|e| e.to_string())?;
        let version = magazine_service::add_article_version(
            conn,
            article_id,
            &payload.title,
            &payload.summary,
            &content_str,
            Some(&notes_str),
            Some(&format!(
                "compilación editorial multi-fuente #{compilation_id}"
            )),
        )?;
        magazine_service::attach_sources_and_evidence_to_article(conn, article_id, payload)?;
        flag_requires_review(conn, article_id, total_conflicts)?;
        let final_state = if total_conflicts > 0 {
            CompilationTaskState::RequiresReview
        } else {
            CompilationTaskState::Completed
        };
        let record = magazine_service::update_magazine_compilation(
            conn,
            compilation_id,
            final_state,
            100,
            Some(&format!(
                "nueva versión v{} persistida (multi-fuente)",
                version.version_number
            )),
            None,
        )?;
        return Ok(CompilationOutcome {
            compilation_id,
            status: record.status,
            article_id: Some(article_id.to_string()),
            version: Some(version.version_number),
            conflict_count: total_conflicts,
            unchanged: false,
            message: format!(
                "version {} stored ({} suggested/auto conflicts)",
                version.version_number, auto_conflicts
            ),
            candidate: payload.candidate_volume.clone(),
        });
    }

    let details = magazine_service::create_article_from_contract(
        conn,
        &params.volume_id,
        params.chapter_id,
        payload,
        None,
    )?;
    let final_state = details.article.editorial_state;
    let compilation_state = match final_state {
        EditorialState::RequiresReview => CompilationTaskState::RequiresReview,
        _ => CompilationTaskState::Completed,
    };
    let record = magazine_service::update_magazine_compilation(
        conn,
        compilation_id,
        compilation_state,
        100,
        Some(&format!(
            "artículo {} persistido (multi-fuente)",
            details.article.id
        )),
        None,
    )?;
    Ok(CompilationOutcome {
        compilation_id,
        status: record.status,
        article_id: Some(details.article.id.clone()),
        version: Some(details.article.active_version),
        conflict_count: total_conflicts,
        unchanged: false,
        message: format!("article stored with {total_conflicts} conflicts"),
        candidate: payload.candidate_volume.clone(),
    })
}

/// Marca el artículo como `requires_review` cuando la compilación aportó
/// conflictos, si la máquina de estados lo permite desde el estado actual.
fn flag_requires_review(
    conn: &Connection,
    article_id: &str,
    total_conflicts: usize,
) -> Result<(), String> {
    if total_conflicts == 0 {
        return Ok(());
    }
    let current_str: String = conn
        .query_row(
            "SELECT editorial_state FROM magazine_articles WHERE id = ?1",
            params![article_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let current: EditorialState = current_str.parse().map_err(|e: String| e)?;
    if current.can_transition_to(EditorialState::RequiresReview) {
        magazine_service::update_magazine_article_state(
            conn,
            article_id,
            EditorialState::RequiresReview,
        )?;
    }
    Ok(())
}

fn set_progress(
    db: &StdMutex<Connection>,
    compilation_id: i64,
    progress: i32,
    message: &str,
) -> Result<(), String> {
    let conn = db
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    magazine_service::update_magazine_compilation(
        &conn,
        compilation_id,
        CompilationTaskState::Processing,
        progress,
        Some(message),
        None,
    )?;
    Ok(())
}

fn mark_failed(db: &StdMutex<Connection>, compilation_id: i64, reason: &str) {
    let bounded: String = reason.chars().take(500).collect();
    if let Ok(conn) = db.lock() {
        let _ = magazine_service::update_magazine_compilation(
            &conn,
            compilation_id,
            CompilationTaskState::Failed,
            100,
            None,
            Some(&bounded),
        );
    }
}

// ========================================================================
// CONTEXTO EDITORIAL
// ========================================================================

/// Tomo destino + artículos existentes (tope) para que el proveedor no
/// trabaje aislado: alinea tipo/tono y evita duplicar fascículos.
fn build_editorial_context(
    conn: &Connection,
    params: &CompileParams,
    _package: &EditorialEvidencePackage,
) -> Result<EditorialContext, String> {
    let volume_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM magazine_volumes WHERE id = ?1)",
            params![params.volume_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !volume_exists {
        return Err(format!(
            "magazine volume '{}' does not exist",
            params.volume_id
        ));
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, title, article_type, summary
             FROM magazine_articles
             WHERE volume_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![params.volume_id, MAX_CONTEXT_ARTICLES], |row| {
            Ok(ExistingArticleSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                article_type: row.get(2)?,
                summary: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut existing_articles = Vec::new();
    for row in rows {
        existing_articles.push(row.map_err(|e| e.to_string())?);
    }
    Ok(EditorialContext {
        target_volume_id: params.volume_id.clone(),
        target_chapter_id: params.chapter_id,
        placement: PlacementDecision::ExistingVolume,
        existing_articles,
    })
}

/// Contexto editorial para compilaciones multi-fuente.
fn build_multi_source_editorial_context(
    conn: &Connection,
    params: &MultiSourceCompileParams,
    _package: &MultiSourceEvidencePackage,
) -> Result<EditorialContext, String> {
    let volume_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM magazine_volumes WHERE id = ?1)",
            params![params.volume_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !volume_exists {
        return Err(format!(
            "magazine volume '{}' does not exist",
            params.volume_id
        ));
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, title, article_type, summary
             FROM magazine_articles
             WHERE volume_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![params.volume_id, MAX_CONTEXT_ARTICLES], |row| {
            Ok(ExistingArticleSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                article_type: row.get(2)?,
                summary: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut existing_articles = Vec::new();
    for row in rows {
        existing_articles.push(row.map_err(|e| e.to_string())?);
    }
    Ok(EditorialContext {
        target_volume_id: params.volume_id.clone(),
        target_chapter_id: params.chapter_id,
        placement: PlacementDecision::ExistingVolume,
        existing_articles,
    })
}

// ========================================================================
// PROVENANCE: toda evidencia debe resolverse contra el paquete
// ========================================================================

/// Verifica que cada evidencia del payload exista realmente: job correcto,
/// timestamps no negativos y dentro de la duración, solape con segmentos
/// OCR/transcripción reales, keyframes con path o timestamp reales, y
/// conflictos que comparen evidencias distintas.
pub fn validate_provenance(
    package: &EditorialEvidencePackage,
    payload: &EditorialArticlePayload,
) -> Result<(), ProvenanceError> {
    for source in &payload.sources {
        if source.job_id != package.job_id {
            return Err(ProvenanceError::UnknownSourceJob(source.job_id));
        }
    }
    for evidence in &payload.evidence {
        if evidence.job_id != package.job_id {
            return Err(ProvenanceError::ForeignEvidenceJob(evidence.job_id));
        }
        if let Some(start) = evidence.timestamp_start {
            if start < 0.0 {
                return Err(ProvenanceError::NegativeTimestamp(start));
            }
        }
        if let Some(end) = evidence.timestamp_end {
            if end < 0.0 {
                return Err(ProvenanceError::NegativeTimestamp(end));
            }
            if let Some(duration) = package.source.duration_secs {
                if end > duration {
                    return Err(ProvenanceError::ExceedsDuration { end, duration });
                }
            }
        }
        match evidence.kind {
            EvidenceKind::TranscriptSegment => {
                let (start, end) = evidence_range(evidence);
                if !package
                    .transcript
                    .iter()
                    .any(|segment| overlaps(start, end, segment.start_sec, segment.end_sec))
                {
                    return Err(ProvenanceError::NoOverlappingSegment { start, end });
                }
            }
            EvidenceKind::Ocr => {
                if package.ocr.is_empty() {
                    return Err(ProvenanceError::NoOcrEvidence);
                }
                let (start, end) = evidence_range(evidence);
                let anchored = package.ocr.iter().any(|unit| {
                    overlaps(
                        start,
                        end,
                        unit.start_sec.unwrap_or(start),
                        unit.end_sec.unwrap_or(end),
                    )
                });
                if !anchored {
                    return Err(ProvenanceError::NoOverlappingSegment { start, end });
                }
            }
            EvidenceKind::Keyframe => {
                resolve_keyframe(package, evidence)?;
            }
            EvidenceKind::Timestamp | EvidenceKind::Metadata => {}
        }
    }
    // Los conflictos sugeridos deben comparar dos evidencias DISTINTAS.
    for conflict in &payload.conflicts {
        let a = &payload.evidence[conflict.evidence_a_index];
        let b = &payload.evidence[conflict.evidence_b_index];
        if conflict.evidence_a_index == conflict.evidence_b_index
            || evidence_identity(a) == evidence_identity(b)
        {
            return Err(ProvenanceError::SpuriousConflict {
                index_a: conflict.evidence_a_index,
                index_b: conflict.evidence_b_index,
            });
        }
    }
    Ok(())
}

/// Valida provenance multi-fuente: cada fuente citada debe pertenecer al paquete,
/// y cada evidencia debe resolverse contra el paquete de su fuente correspondiente.
/// Adicionalmente valida que cualquier NewVolumeCandidate propuesto cite únicamente
/// jobs presentes en el paquete de evidencias.
pub fn validate_multi_source_provenance(
    package: &MultiSourceEvidencePackage,
    payload: &EditorialArticlePayload,
) -> Result<(), ProvenanceError> {
    let known_job_ids = package.job_ids();
    for source in &payload.sources {
        if !known_job_ids.contains(&source.job_id) {
            return Err(ProvenanceError::UnknownSourceJob(source.job_id));
        }
    }
    for evidence in &payload.evidence {
        let src_pkg = package
            .find_package(evidence.job_id)
            .ok_or(ProvenanceError::ForeignEvidenceJob(evidence.job_id))?;

        if let Some(start) = evidence.timestamp_start {
            if start < 0.0 {
                return Err(ProvenanceError::NegativeTimestamp(start));
            }
        }
        if let Some(end) = evidence.timestamp_end {
            if end < 0.0 {
                return Err(ProvenanceError::NegativeTimestamp(end));
            }
            if let Some(duration) = src_pkg.source.duration_secs {
                if end > duration {
                    return Err(ProvenanceError::ExceedsDuration { end, duration });
                }
            }
        }
        match evidence.kind {
            EvidenceKind::TranscriptSegment => {
                let (start, end) = evidence_range(evidence);
                if !src_pkg
                    .transcript
                    .iter()
                    .any(|segment| overlaps(start, end, segment.start_sec, segment.end_sec))
                {
                    return Err(ProvenanceError::NoOverlappingSegment { start, end });
                }
            }
            EvidenceKind::Ocr => {
                if src_pkg.ocr.is_empty() {
                    return Err(ProvenanceError::NoOcrEvidence);
                }
                let (start, end) = evidence_range(evidence);
                let anchored = src_pkg.ocr.iter().any(|unit| {
                    overlaps(
                        start,
                        end,
                        unit.start_sec.unwrap_or(start),
                        unit.end_sec.unwrap_or(end),
                    )
                });
                if !anchored {
                    return Err(ProvenanceError::NoOverlappingSegment { start, end });
                }
            }
            EvidenceKind::Keyframe => {
                resolve_keyframe(src_pkg, evidence)?;
            }
            EvidenceKind::Timestamp | EvidenceKind::Metadata => {}
        }
    }
    for conflict in &payload.conflicts {
        if conflict.evidence_a_index >= payload.evidence.len()
            || conflict.evidence_b_index >= payload.evidence.len()
        {
            return Err(ProvenanceError::SpuriousConflict {
                index_a: conflict.evidence_a_index,
                index_b: conflict.evidence_b_index,
            });
        }
        let a = &payload.evidence[conflict.evidence_a_index];
        let b = &payload.evidence[conflict.evidence_b_index];
        if conflict.evidence_a_index == conflict.evidence_b_index
            || evidence_identity(a) == evidence_identity(b)
        {
            return Err(ProvenanceError::SpuriousConflict {
                index_a: conflict.evidence_a_index,
                index_b: conflict.evidence_b_index,
            });
        }
    }

    if let Some(candidate) = &payload.candidate_volume {
        for job_id in &candidate.supporting_job_ids {
            if !known_job_ids.contains(job_id) {
                return Err(ProvenanceError::ForeignEvidenceJob(*job_id));
            }
        }
    }

    Ok(())
}

fn evidence_range(evidence: &crate::domain::editorial::EditorialEvidencePayload) -> (f64, f64) {
    match (evidence.timestamp_start, evidence.timestamp_end) {
        (Some(start), Some(end)) => (start, end),
        // Sin rango explícito no hay ancla temporal: el llamador lo rechaza
        // al no solapar nada (rango imposible).
        _ => (f64::INFINITY, f64::NEG_INFINITY),
    }
}

fn overlaps(start: f64, end: f64, seg_start: f64, seg_end: f64) -> bool {
    start <= seg_end && end >= seg_start
}

fn resolve_keyframe(
    package: &EditorialEvidencePackage,
    evidence: &crate::domain::editorial::EditorialEvidencePayload,
) -> Result<(), ProvenanceError> {
    if let Some(path) = evidence.keyframe_path.as_deref() {
        if package.keyframes.iter().any(|kf| kf.path == path) {
            return Ok(());
        }
        return Err(ProvenanceError::KeyframeNotFound(path.to_string()));
    }
    if let (Some(start), Some(end)) = (evidence.timestamp_start, evidence.timestamp_end) {
        let anchored = package.keyframes.iter().any(|kf| {
            kf.timestamp_sec.is_some_and(|ts| {
                (ts - start).abs() <= KEYFRAME_TIME_TOLERANCE_SECS
                    || (ts - end).abs() <= KEYFRAME_TIME_TOLERANCE_SECS
            })
        });
        if anchored {
            return Ok(());
        }
    }
    Err(ProvenanceError::KeyframeNotFound(
        "<sin path ni timestamp resoluble>".to_string(),
    ))
}

fn evidence_identity(evidence: &crate::domain::editorial::EditorialEvidencePayload) -> String {
    format!(
        "{}|{:?}|{:?}|{:?}|{:?}|{:?}",
        evidence.job_id,
        evidence.kind,
        evidence.timestamp_start,
        evidence.timestamp_end,
        evidence.keyframe_path,
        evidence.fact.as_deref().unwrap_or_default(),
    )
}

fn is_non_empty_object(value: &serde_json::Value) -> bool {
    value.as_object().is_some_and(|object| !object.is_empty())
}

// ========================================================================
// CONFLICT DETECTION: cantidades con misma unidad y distinto valor
// ========================================================================

/// Detector inicial de Pulsaria (independiente del proveedor): agrupa los
/// hechos extraídos por (número, unidad normalizada); la misma unidad con
/// valores distintos ⇒ conflicto `unresolved`. Nunca promedia ni elige.
pub fn detect_numeric_conflicts(payload: &EditorialArticlePayload) -> Vec<AutoConflict> {
    let mut by_unit: std::collections::HashMap<String, Vec<(f64, usize, String)>> =
        std::collections::HashMap::new();
    for (index, evidence) in payload.evidence.iter().enumerate() {
        let Some(fact) = evidence.fact.as_deref() else {
            continue;
        };
        for (value, unit) in extract_quantities(fact) {
            by_unit
                .entry(unit)
                .or_default()
                .push((value, index, fact.to_string()));
        }
    }
    let mut conflicts = Vec::new();
    let mut units: Vec<String> = by_unit.keys().cloned().collect();
    units.sort();
    for unit in units {
        let entries = &by_unit[&unit];
        let mut values: Vec<f64> = entries.iter().map(|(value, _, _)| *value).collect();
        values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        values.dedup_by(|a, b| (*a - *b).abs() < 1e-9);
        if values.len() < 2 {
            continue;
        }
        let first = entries
            .iter()
            .find(|(value, _, _)| (*value - values[0]).abs() < 1e-9)
            .expect("first value must exist");
        let second = entries
            .iter()
            .find(|(value, _, _)| (*value - values[1]).abs() < 1e-9)
            .expect("second value must exist");
        if first.1 == second.1 {
            continue;
        }
        conflicts.push(AutoConflict {
            fact_key: format!("auto:{unit}"),
            description: format!(
                "cantidad en conflicto para '{unit}': {} (evidencia {}) frente a {} (evidencia {}); se requiere revisión manual",
                first.2, first.1, second.2, second.1
            ),
            evidence_a_index: first.1,
            evidence_b_index: second.1,
        });
    }
    conflicts
}

/// Extrae pares (número, unidad) de un hecho en lenguaje natural.
/// Soporta `200 g`, `200g`, `180°C`, `20 min`, `2 cucharadas`.
fn extract_quantities(fact: &str) -> Vec<(f64, String)> {
    let mut out = Vec::new();
    let tokens: Vec<&str> = fact
        .split(|c: char| c.is_whitespace() || c == ',' || c == ';' || c == '(' || c == ')')
        .filter(|token| !token.is_empty())
        .collect();
    let mut index = 0;
    while index < tokens.len() {
        let (number, rest) = split_leading_number(tokens[index]);
        if let Some(value) = number {
            if !rest.is_empty() {
                if let Some(unit) = normalize_unit(rest) {
                    out.push((value, unit));
                }
            } else if index + 1 < tokens.len() {
                if let Some(unit) = normalize_unit(tokens[index + 1]) {
                    out.push((value, unit));
                    index += 1;
                }
            }
        }
        index += 1;
    }
    out
}

fn split_leading_number(token: &str) -> (Option<f64>, &str) {
    let mut end = 0;
    for (byte, ch) in token.char_indices() {
        if ch.is_ascii_digit() || ch == '.' || (ch == '-' && byte == 0) {
            end = byte + ch.len_utf8();
        } else {
            break;
        }
    }
    if end == 0 {
        return (None, token);
    }
    match token[..end].parse::<f64>() {
        Ok(value) => (Some(value), &token[end..]),
        Err(_) => (None, token),
    }
}

fn normalize_unit(raw: &str) -> Option<String> {
    let lower = raw.to_lowercase();
    let cleaned: String = lower
        .chars()
        .filter(|c| c.is_alphabetic() || *c == '°')
        .collect();
    if cleaned.is_empty() {
        return None;
    }
    let canonical = match cleaned.as_str() {
        "g" | "gr" | "grs" | "gramo" | "gramos" => "g",
        "kg" | "kilo" | "kilos" => "kg",
        "ml" | "mililitro" | "mililitros" => "ml",
        "l" | "lt" | "litro" | "litros" => "l",
        "c" | "°c" | "grado" | "grados" => "c",
        "min" | "minuto" | "minutos" => "min",
        "s" | "seg" | "segundo" | "segundos" => "s",
        "h" | "hora" | "horas" => "h",
        "cucharada" | "cucharadas" | "cda" | "cdas" => "tbsp",
        "cucharadita" | "cucharaditas" | "cdta" => "tsp",
        "taza" | "tazas" => "cup",
        other => other,
    };
    Some(canonical.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::editorial_evidence::tests::{insert_full_source, setup_evidence_db};
    use crate::application::editorial_provider::{MockEditorialProvider, MockScenario};
    use crate::domain::editorial::{
        EditorialConfidencePayload, EditorialEvidencePayload, EditorialSourcePayload, EvidenceKind,
        SourceRole,
    };
    use std::collections::HashMap;

    /// DB editorial completa para el compilador: tablas de biblioteca
    /// (subset) + esquema magazine real.
    pub(crate) fn setup_compiler_db() -> Connection {
        let conn = setup_evidence_db();
        let tx = conn.unchecked_transaction().unwrap();
        magazine_service::init_magazine_schema(&tx).unwrap();
        tx.commit().unwrap();
        conn
    }

    fn mock_provider(scenario: MockScenario) -> EditorialProvider {
        EditorialProvider::Mock(MockEditorialProvider { scenario })
    }

    fn compile_params(job_id: i64) -> CompileParams {
        CompileParams {
            job_id,
            volume_id: "vol-recipes".to_string(),
            chapter_id: None,
            update_article_id: None,
            max_output_tokens: 512,
        }
    }

    /// Ejecuta el pipeline con una guarda `std` local (los tests son
    /// síncronos en DB; el proveedor mock no hace red).
    fn run_sync(
        db: &StdMutex<Connection>,
        provider: &EditorialProvider,
        params: &CompileParams,
    ) -> Result<CompilationOutcome, String> {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(compile_magazine_source(db, provider, params.clone()))
    }

    // ---- provenance ----

    fn package_for(conn: &Connection) -> EditorialEvidencePackage {
        build_evidence_package(conn, 9).unwrap()
    }

    fn base_payload() -> EditorialArticlePayload {
        EditorialArticlePayload {
            schema_version: "1.0".to_string(),
            article_type: crate::domain::editorial::ArticleType::Recipe,
            title: "T".to_string(),
            summary: "S".to_string(),
            content: serde_json::json!({ "blocks": [] }),
            sources: vec![EditorialSourcePayload {
                job_id: 9,
                role: SourceRole::Primary,
                citation: None,
            }],
            evidence: vec![],
            conflicts: vec![],
            confidence: EditorialConfidencePayload {
                overall: 0.9,
                sections: HashMap::new(),
            },
            editorial_notes: vec![],
            candidate_volume: None,
        }
    }

    #[test]
    fn test_provenance_accepts_real_evidence() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9);
        let package = package_for(&conn);
        let mut payload = base_payload();
        payload.evidence = vec![EditorialEvidencePayload {
            job_id: 9,
            kind: EvidenceKind::TranscriptSegment,
            timestamp_start: Some(0.0),
            timestamp_end: Some(12.5),
            keyframe_path: None,
            transcript_text: None,
            fact: None,
            confidence: 0.9,
        }];
        assert!(validate_provenance(&package, &payload).is_ok());
    }

    #[test]
    fn test_provenance_rejects_negative_timestamp() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9);
        let package = package_for(&conn);
        let mut payload = base_payload();
        payload.evidence = vec![EditorialEvidencePayload {
            job_id: 9,
            kind: EvidenceKind::Timestamp,
            timestamp_start: Some(-5.0),
            timestamp_end: Some(1.0),
            keyframe_path: None,
            transcript_text: None,
            fact: None,
            confidence: 0.9,
        }];
        assert_eq!(
            validate_provenance(&package, &payload).unwrap_err(),
            ProvenanceError::NegativeTimestamp(-5.0)
        );
    }

    #[test]
    fn test_provenance_rejects_timestamp_beyond_duration() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9); // duration = 80s
        let package = package_for(&conn);
        let mut payload = base_payload();
        payload.evidence = vec![EditorialEvidencePayload {
            job_id: 9,
            kind: EvidenceKind::Timestamp,
            timestamp_start: Some(74.0),
            timestamp_end: Some(95.0),
            keyframe_path: None,
            transcript_text: None,
            fact: None,
            confidence: 0.9,
        }];
        assert_eq!(
            validate_provenance(&package, &payload).unwrap_err(),
            ProvenanceError::ExceedsDuration {
                end: 95.0,
                duration: 80.0
            }
        );
    }

    #[test]
    fn test_provenance_rejects_foreign_job_and_unknown_source() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9);
        let package = package_for(&conn);
        let mut payload = base_payload();
        payload.sources.push(EditorialSourcePayload {
            job_id: 777,
            role: SourceRole::Supporting,
            citation: None,
        });
        assert_eq!(
            validate_provenance(&package, &payload).unwrap_err(),
            ProvenanceError::UnknownSourceJob(777)
        );

        let mut payload = base_payload();
        payload.evidence = vec![EditorialEvidencePayload {
            job_id: 404,
            kind: EvidenceKind::Timestamp,
            timestamp_start: Some(1.0),
            timestamp_end: Some(2.0),
            keyframe_path: None,
            transcript_text: None,
            fact: None,
            confidence: 0.9,
        }];
        // El contrato ya lo rechaza por fuente no declarada; la provenance
        // lo confirma como job ajeno.
        assert_eq!(
            validate_provenance(&package, &payload).unwrap_err(),
            ProvenanceError::ForeignEvidenceJob(404)
        );
    }

    #[test]
    fn test_provenance_rejects_fake_keyframe_and_missing_ocr() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9);
        let package = package_for(&conn);
        let mut payload = base_payload();
        payload.evidence = vec![EditorialEvidencePayload {
            job_id: 9,
            kind: EvidenceKind::Keyframe,
            timestamp_start: None,
            timestamp_end: None,
            keyframe_path: Some("/artifacts/9/fake.jpg".to_string()),
            transcript_text: None,
            fact: None,
            confidence: 0.9,
        }];
        assert_eq!(
            validate_provenance(&package, &payload).unwrap_err(),
            ProvenanceError::KeyframeNotFound("/artifacts/9/fake.jpg".to_string())
        );

        // Keyframe real por path sí resuelve.
        payload.evidence[0].keyframe_path = Some("/artifacts/9/k1.jpg".to_string());
        assert!(validate_provenance(&package, &payload).is_ok());

        // OCR sin rango que no solapa ninguna unidad ⇒ rechazado.
        payload.evidence[0] = EditorialEvidencePayload {
            job_id: 9,
            kind: EvidenceKind::Ocr,
            timestamp_start: Some(70.0),
            timestamp_end: Some(75.0),
            keyframe_path: None,
            transcript_text: None,
            fact: None,
            confidence: 0.9,
        };
        assert!(matches!(
            validate_provenance(&package, &payload).unwrap_err(),
            ProvenanceError::NoOverlappingSegment { .. }
        ));
    }

    #[test]
    fn test_provenance_rejects_spurious_conflict() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9);
        let package = package_for(&conn);
        let mut payload = base_payload();
        let item = EditorialEvidencePayload {
            job_id: 9,
            kind: EvidenceKind::Timestamp,
            timestamp_start: Some(1.0),
            timestamp_end: Some(2.0),
            keyframe_path: None,
            transcript_text: None,
            fact: Some("mismo hecho".to_string()),
            confidence: 0.9,
        };
        payload.evidence = vec![item.clone(), item];
        payload.conflicts = vec![EditorialConflictPayload {
            fact_key: "x".to_string(),
            description: "comparación duplicada".to_string(),
            evidence_a_index: 0,
            evidence_b_index: 1,
        }];
        assert!(matches!(
            validate_provenance(&package, &payload).unwrap_err(),
            ProvenanceError::SpuriousConflict { .. }
        ));
    }

    // ---- conflict detection ----

    #[test]
    fn test_numeric_conflicts_detect_unit_mismatches() {
        let mut payload = base_payload();
        let fact = |text: &str| EditorialEvidencePayload {
            job_id: 9,
            kind: EvidenceKind::Timestamp,
            timestamp_start: Some(1.0),
            timestamp_end: Some(2.0),
            keyframe_path: None,
            transcript_text: None,
            fact: Some(text.to_string()),
            confidence: 0.9,
        };
        payload.evidence = vec![
            fact("agregar 200 g de harina"),
            fact("250 gramos de harina en pantalla"),
            fact("hornear 20 min a 180°C"),
        ];
        let conflicts = detect_numeric_conflicts(&payload);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].fact_key, "auto:g");
        assert_eq!(conflicts[0].evidence_a_index, 0);
        assert_eq!(conflicts[0].evidence_b_index, 1);
    }

    #[test]
    fn test_numeric_conflicts_ignore_agreements() {
        let mut payload = base_payload();
        let fact = |text: &str| EditorialEvidencePayload {
            job_id: 9,
            kind: EvidenceKind::Timestamp,
            timestamp_start: Some(1.0),
            timestamp_end: Some(2.0),
            keyframe_path: None,
            transcript_text: None,
            fact: Some(text.to_string()),
            confidence: 0.9,
        };
        payload.evidence = vec![fact("200 g de harina"), fact("200 gramos de harina")];
        assert!(detect_numeric_conflicts(&payload).is_empty());
    }

    // ---- compilation lifecycle ----

    #[test]
    fn test_full_pipeline_completes_with_mock() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9);
        let db = StdMutex::new(conn);
        let outcome = run_sync(&db, &mock_provider(MockScenario::Valid), &compile_params(9))
            .expect("mock válido debe compilar");
        assert_eq!(outcome.status, CompilationTaskState::Completed);
        assert!(outcome.article_id.is_some());
        assert_eq!(outcome.version, Some(1));
        assert!(!outcome.unchanged);

        let guard = db.lock().unwrap();
        let record =
            magazine_service::get_magazine_compilation(&guard, outcome.compilation_id).unwrap();
        assert_eq!(record.status, CompilationTaskState::Completed);
        // Trazabilidad persistida: artículo → evidencia → fuente → job.
        let details = magazine_service::get_magazine_article_details(
            &guard,
            outcome.article_id.as_deref().unwrap(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(details.evidence.len(), 1);
        assert_eq!(details.sources[0].job_id, 9);
    }

    #[test]
    fn test_conflicting_payload_routes_to_requires_review() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9);
        let db = StdMutex::new(conn);
        let outcome = run_sync(
            &db,
            &mock_provider(MockScenario::WithConflict),
            &compile_params(9),
        )
        .expect("conflicto válido debe persistirse como revisión");
        assert_eq!(outcome.status, CompilationTaskState::RequiresReview);
        assert!(outcome.conflict_count >= 1);

        let guard = db.lock().unwrap();
        let details = magazine_service::get_magazine_article_details(
            &guard,
            outcome.article_id.as_deref().unwrap(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            details.article.editorial_state,
            crate::domain::editorial::EditorialState::RequiresReview
        );
        assert!(details.conflicts.iter().all(|conflict| {
            conflict.resolution_state
                == crate::domain::editorial::ConflictResolutionState::Unresolved
        }));
    }

    #[test]
    fn test_invalid_payloads_fail_without_article() {
        for scenario in [MockScenario::InvalidJson, MockScenario::IncompleteContract] {
            let conn = setup_compiler_db();
            insert_full_source(&conn, 9);
            let db = StdMutex::new(conn);
            let before =
                magazine_service::list_magazine_articles(&db.lock().unwrap(), "vol-recipes")
                    .unwrap()
                    .len();
            let err = run_sync(&db, &mock_provider(scenario), &compile_params(9))
                .expect_err("payload inválido no debe publicarse");
            assert!(!err.is_empty());
            let guard = db.lock().unwrap();
            assert_eq!(
                magazine_service::list_magazine_articles(&guard, "vol-recipes")
                    .unwrap()
                    .len(),
                before,
                "ningún artículo inválido llega a SQLite"
            );
        }
    }

    #[test]
    fn test_out_of_range_timestamp_fails_closed() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9);
        let db = StdMutex::new(conn);
        let err = run_sync(
            &db,
            &mock_provider(MockScenario::OutOfRangeTimestamp),
            &compile_params(9),
        )
        .expect_err("timestamp fuera de duración debe fallar");
        assert!(
            err.contains("90") || err.contains("duration"),
            "error: {err}"
        );
    }

    #[test]
    fn test_identical_recompile_creates_no_version() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9);
        let db = StdMutex::new(conn);
        let first = run_sync(&db, &mock_provider(MockScenario::Valid), &compile_params(9)).unwrap();
        let article_id = first.article_id.clone().unwrap();

        let mut update = compile_params(9);
        update.update_article_id = Some(article_id.clone());
        let second = run_sync(&db, &mock_provider(MockScenario::Valid), &update).unwrap();
        assert!(second.unchanged);
        assert_eq!(second.status, CompilationTaskState::Completed);

        let guard = db.lock().unwrap();
        let details = magazine_service::get_magazine_article_details(&guard, &article_id)
            .unwrap()
            .unwrap();
        assert_eq!(details.article.active_version, 1);
        assert_eq!(details.versions.len(), 1);
    }

    #[test]
    fn test_reader_chain_resolves_article_to_playable_source() {
        // Integración Fase 3 (offline): Mock → Compilation → Article →
        // Evidence → Source → Media resoluble con timestamp reproducible.
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9);
        let db = StdMutex::new(conn);
        let outcome = run_sync(&db, &mock_provider(MockScenario::Valid), &compile_params(9))
            .expect("mock válido debe compilar");
        let article_id = outcome.article_id.clone().unwrap();

        let guard = db.lock().unwrap();
        // Artículo → detalles completos (lo que consume el Reader por IPC).
        let details = magazine_service::get_magazine_article_details(&guard, &article_id)
            .unwrap()
            .expect("el artículo compilado debe leerse");
        assert!(!details.evidence.is_empty());
        assert!(!details.sources.is_empty());

        // Evidencia → fuente declarada y resoluble.
        let evidence = &details.evidence[0];
        let source = details
            .sources
            .iter()
            .find(|source| source.id == evidence.source_id)
            .expect("toda evidencia resuelve a su fuente");
        assert_eq!(source.job_id, 9);

        // Fuente → medio original reproducible con timestamp válido.
        let media = magazine_service::resolve_source_media(&guard, source.job_id)
            .unwrap()
            .expect("la fuente resuelve a su medio original");
        assert_eq!(media.video_path.as_deref(), Some("/videos/9.mp4"));
        let duration = media.duration_secs.expect("duración conocida");
        for item in &details.evidence {
            if let (Some(start), Some(end)) = (item.timestamp_start, item.timestamp_end) {
                assert!(start >= 0.0 && end <= duration && start <= end);
            }
        }
    }

    #[test]
    fn test_retry_only_from_non_successful_states() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 9);
        let db = StdMutex::new(conn);
        // Compilación fallida (mock inválido) sí admite reintento.
        let failed = {
            let params = compile_params(9);
            let prepared = super::prepare_compilation(&db, &params).unwrap();
            super::mark_failed(&db, prepared.id, "fallo inducido");
            prepared.id
        };
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let outcome = runtime
            .block_on(retry_magazine_compilation(
                &db,
                &mock_provider(MockScenario::Valid),
                failed,
                512,
            ))
            .expect("el reintento debe compilar");
        assert_eq!(outcome.status, CompilationTaskState::Completed);
        assert_eq!(outcome.compilation_id, failed);

        // Una compilación completed no se reejecuta.
        let err = runtime
            .block_on(retry_magazine_compilation(
                &db,
                &mock_provider(MockScenario::Valid),
                failed,
                512,
            ))
            .expect_err("completed no admite reintento");
        assert!(err.contains("already completed"));
    }

    fn multi_compile_params(job_ids: Vec<i64>) -> MultiSourceCompileParams {
        MultiSourceCompileParams {
            job_ids,
            volume_id: "vol-recipes".to_string(),
            chapter_id: None,
            update_article_id: None,
            max_output_tokens: 512,
        }
    }

    fn run_multi_sync(
        db: &StdMutex<Connection>,
        provider: &EditorialProvider,
        params: &MultiSourceCompileParams,
    ) -> Result<CompilationOutcome, String> {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(compile_multi_source_editorial(db, provider, params.clone()))
    }

    // ========================================================================
    // FASE 4: MULTI-SOURCE EDITORIAL SYNTHESIS & NEW VOLUME CANDIDATES
    // ========================================================================

    #[test]
    fn test_multi_source_scenario_a_deduplicated_synthesis() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 10);
        insert_full_source(&conn, 11);
        insert_full_source(&conn, 12);
        let db = StdMutex::new(conn);

        let params = multi_compile_params(vec![10, 11, 12]);
        let provider = mock_provider(MockScenario::MultiSourceDeduplicated);
        let outcome = run_multi_sync(&db, &provider, &params).expect("escenario A debe compilar");

        assert_eq!(outcome.status, CompilationTaskState::Completed);
        assert!(outcome.article_id.is_some());
        assert_eq!(outcome.version, Some(1));
        assert_eq!(outcome.conflict_count, 0);

        let guard = db.lock().unwrap();
        let details = magazine_service::get_magazine_article_details(
            &guard,
            outcome.article_id.as_deref().unwrap(),
        )
        .unwrap()
        .expect("artículo debe existir");

        // 3 fuentes asociadas y 3 evidencias con anclaje individual
        assert_eq!(details.sources.len(), 3);
        assert_eq!(details.evidence.len(), 3);
        let source_jobs: Vec<i64> = details.sources.iter().map(|s| s.job_id).collect();
        assert!(source_jobs.contains(&10));
        assert!(source_jobs.contains(&11));
        assert!(source_jobs.contains(&12));
    }

    #[test]
    fn test_multi_source_scenario_b_numeric_conflict() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 10);
        insert_full_source(&conn, 11);
        let db = StdMutex::new(conn);

        let params = multi_compile_params(vec![10, 11]);
        let provider = mock_provider(MockScenario::MultiSourceNumericConflict);
        let outcome = run_multi_sync(&db, &provider, &params).expect("escenario B debe compilar");

        assert_eq!(outcome.status, CompilationTaskState::RequiresReview);
        assert!(outcome.conflict_count >= 1);

        let guard = db.lock().unwrap();
        let details = magazine_service::get_magazine_article_details(
            &guard,
            outcome.article_id.as_deref().unwrap(),
        )
        .unwrap()
        .expect("artículo debe existir");

        assert_eq!(
            details.article.editorial_state,
            crate::domain::editorial::EditorialState::RequiresReview
        );
        assert!(details.conflicts.len() >= 1);
        assert_eq!(
            details.conflicts[0].resolution_state,
            crate::domain::editorial::ConflictResolutionState::Unresolved
        );
        // Ambas evidencias discrepantes deben preservarse (sin promediar)
        assert_eq!(details.evidence.len(), 2);
    }

    #[test]
    fn test_multi_source_scenario_c_qualitative_conflict() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 10);
        insert_full_source(&conn, 11);
        let db = StdMutex::new(conn);

        let params = multi_compile_params(vec![10, 11]);
        let provider = mock_provider(MockScenario::MultiSourceQualitativeConflict);
        let outcome = run_multi_sync(&db, &provider, &params).expect("escenario C debe compilar");

        assert_eq!(outcome.status, CompilationTaskState::RequiresReview);
        assert_eq!(outcome.conflict_count, 1);

        let guard = db.lock().unwrap();
        let details = magazine_service::get_magazine_article_details(
            &guard,
            outcome.article_id.as_deref().unwrap(),
        )
        .unwrap()
        .unwrap();

        assert_eq!(
            details.article.editorial_state,
            crate::domain::editorial::EditorialState::RequiresReview
        );
        assert_eq!(
            details.conflicts[0].resolution_state,
            crate::domain::editorial::ConflictResolutionState::Unresolved
        );
    }

    #[test]
    fn test_multi_source_scenario_d_complementary_claims() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 10);
        insert_full_source(&conn, 11);
        insert_full_source(&conn, 12);
        let db = StdMutex::new(conn);

        let params = multi_compile_params(vec![10, 11, 12]);
        let provider = mock_provider(MockScenario::MultiSourceComplementary);
        let outcome = run_multi_sync(&db, &provider, &params).expect("escenario D debe compilar");

        assert_eq!(outcome.status, CompilationTaskState::Completed);
        assert_eq!(outcome.conflict_count, 0);

        let guard = db.lock().unwrap();
        let details = magazine_service::get_magazine_article_details(
            &guard,
            outcome.article_id.as_deref().unwrap(),
        )
        .unwrap()
        .unwrap();

        assert_eq!(details.sources.len(), 3);
        assert_eq!(details.evidence.len(), 3);
    }

    #[test]
    fn test_multi_source_scenario_e_insufficient_evidence_fails_without_article() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 10);
        let db = StdMutex::new(conn);

        let before = magazine_service::list_magazine_articles(&db.lock().unwrap(), "vol-recipes")
            .unwrap()
            .len();

        let params = multi_compile_params(vec![10]);
        let provider = mock_provider(MockScenario::InsufficientEvidence);
        let err = run_multi_sync(&db, &provider, &params)
            .expect_err("insuficiente evidencia debe fallar");
        assert!(!err.is_empty());

        let guard = db.lock().unwrap();
        assert_eq!(
            magazine_service::list_magazine_articles(&guard, "vol-recipes")
                .unwrap()
                .len(),
            before,
            "ningún artículo publicado si la evidencia fue insuficiente"
        );
    }

    #[test]
    fn test_multi_source_scenario_f_version_update_with_new_source() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 10);
        insert_full_source(&conn, 11);
        insert_full_source(&conn, 12);
        let db = StdMutex::new(conn);

        // Compilación inicial con fuentes 10 y 11
        let initial_params = multi_compile_params(vec![10, 11]);
        let outcome1 = run_multi_sync(
            &db,
            &mock_provider(MockScenario::MultiSourceDeduplicated),
            &initial_params,
        )
        .expect("compilación v1 debe pasar");
        let article_id = outcome1.article_id.clone().unwrap();

        // Actualización con nueva fuente 12 (Escenario F)
        let mut update_params = multi_compile_params(vec![10, 11, 12]);
        update_params.update_article_id = Some(article_id.clone());
        let outcome2 = run_multi_sync(
            &db,
            &mock_provider(MockScenario::VersionUpdateNewSource),
            &update_params,
        )
        .expect("actualización v2 debe pasar");

        assert_eq!(outcome2.article_id, Some(article_id.clone()));
        assert_eq!(outcome2.version, Some(2));
        assert!(!outcome2.unchanged);

        let guard = db.lock().unwrap();
        let details = magazine_service::get_magazine_article_details(&guard, &article_id)
            .unwrap()
            .unwrap();

        assert_eq!(details.article.active_version, 2);
        assert_eq!(details.versions.len(), 2);
        // La fuente 12 debe haber sido incorporada a magazine_sources
        let source_jobs: Vec<i64> = details.sources.iter().map(|s| s.job_id).collect();
        assert!(source_jobs.contains(&12));
    }

    #[test]
    fn test_multi_source_scenario_g_new_volume_candidate_proposed_not_created() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 10);
        insert_full_source(&conn, 11);
        insert_full_source(&conn, 12);
        let db = StdMutex::new(conn);

        let before_volumes = magazine_service::list_magazine_volumes(&db.lock().unwrap())
            .unwrap()
            .len();

        let params = multi_compile_params(vec![10, 11, 12]);
        let provider = mock_provider(MockScenario::NewVolumeCandidateProposal);
        let outcome = run_multi_sync(&db, &provider, &params).expect("escenario G debe compilar");

        assert_eq!(outcome.status, CompilationTaskState::Completed);
        let candidate = outcome
            .candidate
            .expect("debe contener la propuesta de NewVolumeCandidate");
        assert_eq!(candidate.suggested_title, "Sistemas Volcánicos y Geología");
        assert_eq!(candidate.suggested_category, "geology");
        assert_eq!(candidate.supporting_job_ids, vec![10, 11, 12]);

        let guard = db.lock().unwrap();
        // REGLA CRÍTICA: Pulsaria NO debe crear un tomo en SQLite automáticamente
        let after_volumes = magazine_service::list_magazine_volumes(&guard)
            .unwrap()
            .len();
        assert_eq!(
            after_volumes, before_volumes,
            "el candidato debe ser solo una propuesta, NO un tomo persistido"
        );

        // Pero la propuesta SÍ debe estar persistida en candidate_json de la compilación
        let persisted_candidate =
            magazine_service::get_compilation_candidate(&guard, outcome.compilation_id)
                .unwrap()
                .expect("candidate_json debe persistirse en la compilación");
        assert_eq!(
            persisted_candidate.suggested_title,
            "Sistemas Volcánicos y Geología"
        );
    }

    #[test]
    fn test_multi_source_idempotency_same_input_unchanged() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 10);
        insert_full_source(&conn, 11);
        insert_full_source(&conn, 12);
        let db = StdMutex::new(conn);

        let params = multi_compile_params(vec![10, 11, 12]);
        let provider = mock_provider(MockScenario::MultiSourceDeduplicated);
        let first = run_multi_sync(&db, &provider, &params).unwrap();
        let article_id = first.article_id.clone().unwrap();

        // Recompilar mismo input apuntando al artículo existente
        let mut update_params = multi_compile_params(vec![10, 11, 12]);
        update_params.update_article_id = Some(article_id.clone());
        let second = run_multi_sync(&db, &provider, &update_params).unwrap();

        assert!(second.unchanged);
        assert_eq!(second.status, CompilationTaskState::Completed);
        assert_eq!(second.version, None);

        let guard = db.lock().unwrap();
        let details = magazine_service::get_magazine_article_details(&guard, &article_id)
            .unwrap()
            .unwrap();
        assert_eq!(details.article.active_version, 1);
        assert_eq!(details.versions.len(), 1);
    }

    #[test]
    fn test_multi_source_provenance_validation_rules() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 10);
        insert_full_source(&conn, 11);
        let package = build_multi_source_evidence_package(&conn, &[10, 11]).unwrap();

        // 1. Fuente ajena no declarada en el paquete
        let mut payload = base_payload();
        payload.sources = vec![
            EditorialSourcePayload {
                job_id: 10,
                role: SourceRole::Primary,
                citation: None,
            },
            EditorialSourcePayload {
                job_id: 999, // inexistente en el paquete
                role: SourceRole::Supporting,
                citation: None,
            },
        ];
        assert_eq!(
            validate_multi_source_provenance(&package, &payload).unwrap_err(),
            ProvenanceError::UnknownSourceJob(999)
        );

        // 2. Evidencia citando un job ajeno
        let mut payload = base_payload();
        payload.sources = vec![EditorialSourcePayload {
            job_id: 10,
            role: SourceRole::Primary,
            citation: None,
        }];
        payload.evidence = vec![EditorialEvidencePayload {
            job_id: 888,
            kind: EvidenceKind::Timestamp,
            timestamp_start: Some(1.0),
            timestamp_end: Some(2.0),
            keyframe_path: None,
            transcript_text: None,
            fact: None,
            confidence: 0.9,
        }];
        assert_eq!(
            validate_multi_source_provenance(&package, &payload).unwrap_err(),
            ProvenanceError::ForeignEvidenceJob(888)
        );

        // 3. NewVolumeCandidate citando job ajeno
        let mut payload = base_payload();
        payload.sources = vec![EditorialSourcePayload {
            job_id: 10,
            role: SourceRole::Primary,
            citation: None,
        }];
        payload.candidate_volume = Some(crate::domain::editorial::NewVolumeCandidate {
            suggested_title: "X".to_string(),
            rationale: "R".to_string(),
            suggested_category: "C".to_string(),
            suggested_chapter: None,
            supporting_job_ids: vec![10, 777], // 777 ajeno
            confidence: 0.9,
        });
        assert_eq!(
            validate_multi_source_provenance(&package, &payload).unwrap_err(),
            ProvenanceError::ForeignEvidenceJob(777)
        );
    }

    #[test]
    fn test_multi_source_circuit_reader_resolves_all_sources() {
        let conn = setup_compiler_db();
        insert_full_source(&conn, 10);
        insert_full_source(&conn, 11);
        insert_full_source(&conn, 12);
        let db = StdMutex::new(conn);

        let params = multi_compile_params(vec![10, 11, 12]);
        let provider = mock_provider(MockScenario::MultiSourceDeduplicated);
        let outcome =
            run_multi_sync(&db, &provider, &params).expect("circuito completo debe compilar");
        let article_id = outcome.article_id.unwrap();

        let guard = db.lock().unwrap();
        let details = magazine_service::get_magazine_article_details(&guard, &article_id)
            .unwrap()
            .expect("artículo debe existir");

        // Circuito completo: cada evidencia resuelve a su fuente, y cada fuente
        // resuelve a su medio original con video_path y timestamp verificables.
        for evidence in &details.evidence {
            let source = details
                .sources
                .iter()
                .find(|s| s.id == evidence.source_id)
                .expect("cada evidencia resuelve a su fuente");
            assert_eq!(source.job_id, evidence.job_id);

            let media = magazine_service::resolve_source_media(&guard, source.job_id)
                .unwrap()
                .expect("la fuente resuelve a medio reproducible");
            assert!(media.video_path.is_some());
            let duration = media.duration_secs.expect("duración conocida");
            if let (Some(start), Some(end)) = (evidence.timestamp_start, evidence.timestamp_end) {
                assert!(start >= 0.0 && end <= duration && start <= end);
            }
        }
    }
}
