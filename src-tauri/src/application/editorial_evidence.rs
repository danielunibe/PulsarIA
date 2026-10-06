//! # Editorial Evidence Package
//!
//! Construye el paquete mínimo de evidencia que el motor editorial consume
//! para compilar un artículo. Solo LEE tablas existentes de Pulsaria; no
//! duplica extracción (transcripción, keyframes, OCR y metadata ya viven en
//! la biblioteca) y nunca escribe.
//!
//! ```text
//! jobs + media ──────────► source (identidad, duración, guía instruccional)
//! transcript_segments ───► transcript[] (índice, inicio, fin, texto)
//! media_artifacts ───────► keyframes[] (artifact_id, timestamp, path)
//! search_units[ocr] ─────► ocr[] (ordinal, rango, texto, artifact_id)
//! content_annotations ───► annotations[] (categorías deterministas)
//! content_items ─────────► plataforma/autor de respaldo
//! ```

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

pub const EVIDENCE_SCHEMA_VERSION: &str = "1.0";

/// Límites de paquete: el prompt de Gemini está acotado
/// (`MAX_PROMPT_CHARS` en el adaptador) y la evidencia debe caber con
/// holgura junto al contexto editorial. Todo recorte queda marcado.
pub const MAX_TRANSCRIPT_SEGMENTS: usize = 200;
pub const MAX_KEYFRAMES: usize = 24;
pub const MAX_OCR_UNITS: usize = 80;
pub const MAX_ANNOTATIONS: usize = 24;
pub const MAX_GUIDE_CHARS: usize = 4_000;

/// Identidad y metadata de la fuente compilada.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSnapshot {
    pub job_id: i64,
    pub url: String,
    pub canonical_url: Option<String>,
    pub status: String,
    pub title: Option<String>,
    pub author: Option<String>,
    pub platform: Option<String>,
    /// Duración del video en segundos (`media.duration`, origen yt-dlp).
    /// `None` ⇒ los timestamps solo se validan por rango relativo.
    pub duration_secs: Option<f64>,
    pub has_video_file: bool,
    /// Guía instruccional del analizador visual (recortada). Contexto, no prueba.
    pub instructional_guide: Option<String>,
    pub content_handle: Option<String>,
}

/// Segmento de transcripción con su rango temporal real.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptEvidence {
    pub segment_index: i64,
    pub start_sec: f64,
    pub end_sec: f64,
    pub text: String,
}

/// Keyframe persistido por el pipeline visual.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyframeEvidence {
    pub artifact_id: i64,
    pub timestamp_sec: Option<f64>,
    pub path: String,
    pub label: Option<String>,
}

/// Unidad OCR indexada (`search_units`, representation = 'ocr').
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrEvidence {
    pub ordinal: i64,
    pub start_sec: Option<f64>,
    pub end_sec: Option<f64>,
    pub text: String,
    pub artifact_id: Option<i64>,
    pub confidence: Option<f64>,
}

/// Anotación determinista existente (p. ej. categorías `recipe`/`tutorial`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnotationEvidence {
    pub annotation_type: String,
    pub value: String,
    pub display: String,
    pub confidence: Option<f64>,
    pub source: String,
    pub start_sec: Option<f64>,
    pub end_sec: Option<f64>,
}

/// Paquete único que consume el motor editorial. Cada pieza conserva su
/// procedencia (`segment_index`, `artifact_id`, `ordinal`, `job_id`) para
/// que la validación posterior pueda resolverla contra SQLite.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorialEvidencePackage {
    pub schema_version: String,
    pub job_id: i64,
    pub source: SourceSnapshot,
    pub transcript: Vec<TranscriptEvidence>,
    pub keyframes: Vec<KeyframeEvidence>,
    pub ocr: Vec<OcrEvidence>,
    pub annotations: Vec<AnnotationEvidence>,
    pub transcript_total: usize,
    pub keyframe_total: usize,
    pub ocr_total: usize,
    /// `true` si algún vector fue recortado por los límites de paquete.
    pub truncated: bool,
}

/// Paquete agregado que reúne la evidencia de múltiples fuentes (jobs).
/// Cada fuente conserva su snapshot, transcripción, keyframes, OCR y metadata
/// asegurando trazabilidad no ambigua a nivel de hecho (Fase 4).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiSourceEvidencePackage {
    pub schema_version: String,
    pub packages: Vec<EditorialEvidencePackage>,
    pub total_sources: usize,
    pub transcript_total: usize,
    pub keyframe_total: usize,
    pub ocr_total: usize,
    pub truncated: bool,
}

impl MultiSourceEvidencePackage {
    pub fn find_package(&self, job_id: i64) -> Option<&EditorialEvidencePackage> {
        self.packages.iter().find(|p| p.job_id == job_id)
    }

    pub fn job_ids(&self) -> Vec<i64> {
        self.packages.iter().map(|p| p.job_id).collect()
    }

    pub fn is_empty(&self) -> bool {
        self.packages.is_empty()
    }
}

/// Errores explícitos de construcción del paquete.
#[derive(Debug, Clone, PartialEq)]
pub enum EvidenceError {
    EmptySourceList,
    SourceNotFound(i64),
    EmptyEvidence(i64),
    Database(String),
}

impl fmt::Display for EvidenceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptySourceList => {
                write!(
                    f,
                    "source job list cannot be empty for multi-source evidence package"
                )
            }
            Self::SourceNotFound(job_id) => {
                write!(f, "editorial source job '{job_id}' does not exist")
            }
            Self::EmptyEvidence(job_id) => write!(
                f,
                "job '{job_id}' has no transcript, keyframes, OCR or annotations to compile"
            ),
            Self::Database(reason) => write!(f, "evidence query failed: {reason}"),
        }
    }
}

impl std::error::Error for EvidenceError {}

fn truncate_text(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    text.chars().take(max_chars).collect()
}

/// Reúne el paquete de evidencia para un job desde las tablas existentes.
/// Falla si el job no existe o si no hay ninguna evidencia compilable.
pub fn build_evidence_package(
    conn: &Connection,
    job_id: i64,
) -> Result<EditorialEvidencePackage, EvidenceError> {
    let source =
        read_source_snapshot(conn, job_id)?.ok_or(EvidenceError::SourceNotFound(job_id))?;

    let transcript_total = count_rows(
        conn,
        "SELECT COUNT(*) FROM transcript_segments WHERE job_id = ?1",
        job_id,
    )?;
    let keyframe_total = count_rows(
        conn,
        "SELECT COUNT(*) FROM media_artifacts WHERE job_id = ?1 AND kind = 'keyframe'",
        job_id,
    )?;
    let ocr_total = count_rows(
        conn,
        "SELECT COUNT(*) FROM search_units WHERE job_id = ?1 AND representation = 'ocr'",
        job_id,
    )?;

    let transcript = read_transcript(conn, job_id)?;
    let keyframes = read_keyframes(conn, job_id)?;
    let ocr = read_ocr_units(conn, job_id)?;
    let annotations = read_annotations(conn, job_id)?;

    if transcript.is_empty()
        && keyframes.is_empty()
        && ocr.is_empty()
        && annotations.is_empty()
        && source.instructional_guide.is_none()
    {
        return Err(EvidenceError::EmptyEvidence(job_id));
    }

    let truncated = transcript.len() < transcript_total
        || keyframes.len() < keyframe_total
        || ocr.len() < ocr_total;

    Ok(EditorialEvidencePackage {
        schema_version: EVIDENCE_SCHEMA_VERSION.to_string(),
        job_id,
        source,
        transcript,
        keyframes,
        ocr,
        annotations,
        transcript_total,
        keyframe_total,
        ocr_total,
        truncated,
    })
}

/// Reúne el paquete multi-fuente consolidado para múltiples jobs existentes.
/// Falla cerrado si la lista está vacía o si algún job no existe.
/// Deduplica identificadores conservando el orden de entrada sin alterar la
/// autoridad relativa entre fuentes.
pub fn build_multi_source_evidence_package(
    conn: &Connection,
    job_ids: &[i64],
) -> Result<MultiSourceEvidencePackage, EvidenceError> {
    if job_ids.is_empty() {
        return Err(EvidenceError::EmptySourceList);
    }

    let mut deduped_ids = Vec::with_capacity(job_ids.len());
    let mut seen = std::collections::HashSet::new();
    for &job_id in job_ids {
        if seen.insert(job_id) {
            deduped_ids.push(job_id);
        }
    }

    let mut packages = Vec::with_capacity(deduped_ids.len());
    let mut transcript_total = 0;
    let mut keyframe_total = 0;
    let mut ocr_total = 0;
    let mut any_truncated = false;

    for job_id in deduped_ids {
        let pkg = build_evidence_package(conn, job_id)?;
        transcript_total += pkg.transcript_total;
        keyframe_total += pkg.keyframe_total;
        ocr_total += pkg.ocr_total;
        if pkg.truncated {
            any_truncated = true;
        }
        packages.push(pkg);
    }

    let total_sources = packages.len();

    Ok(MultiSourceEvidencePackage {
        schema_version: EVIDENCE_SCHEMA_VERSION.to_string(),
        packages,
        total_sources,
        transcript_total,
        keyframe_total,
        ocr_total,
        truncated: any_truncated,
    })
}

fn count_rows(conn: &Connection, sql: &str, job_id: i64) -> Result<usize, EvidenceError> {
    let total: i64 = conn
        .query_row(sql, params![job_id], |row| row.get(0))
        .map_err(|e| EvidenceError::Database(e.to_string()))?;
    Ok(usize::try_from(total).unwrap_or(0))
}

#[allow(clippy::too_many_lines)]
fn read_source_snapshot(
    conn: &Connection,
    job_id: i64,
) -> Result<Option<SourceSnapshot>, EvidenceError> {
    let row: Option<(
        String,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = conn
        .query_row(
            "SELECT j.url, j.canonical_url, j.status,
                    m.title, m.author, m.duration, m.platform, m.video_path,
                    m.instructional_guide, c.author_handle
             FROM jobs j
             LEFT JOIN media m ON m.job_id = j.id
             LEFT JOIN content_items c ON c.job_id = j.id
             WHERE j.id = ?1",
            params![job_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                ))
            },
        )
        .optional()
        .map_err(|e| EvidenceError::Database(e.to_string()))?;

    let Some((
        url,
        canonical_url,
        status,
        title,
        author,
        duration,
        platform,
        video_path,
        instructional_guide,
        content_handle,
    )) = row
    else {
        return Ok(None);
    };

    Ok(Some(SourceSnapshot {
        job_id,
        url,
        canonical_url,
        status,
        title,
        author,
        platform,
        duration_secs: duration.map(|secs| secs as f64),
        has_video_file: video_path.as_deref().is_some_and(|p| !p.is_empty()),
        instructional_guide: instructional_guide
            .filter(|guide| !guide.trim().is_empty())
            .map(|guide| truncate_text(&guide, MAX_GUIDE_CHARS)),
        content_handle,
    }))
}

fn read_transcript(
    conn: &Connection,
    job_id: i64,
) -> Result<Vec<TranscriptEvidence>, EvidenceError> {
    // Reutiliza el getter canónico: (índice, texto, inicio, fin).
    let segments = crate::db::get_transcript_segments(conn, job_id)
        .map_err(|e| EvidenceError::Database(e.to_string()))?;
    Ok(segments
        .into_iter()
        .take(MAX_TRANSCRIPT_SEGMENTS)
        .map(
            |(segment_index, text, start_sec, end_sec)| TranscriptEvidence {
                segment_index,
                start_sec,
                end_sec,
                text,
            },
        )
        .collect())
}

fn read_keyframes(conn: &Connection, job_id: i64) -> Result<Vec<KeyframeEvidence>, EvidenceError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, path, label
             FROM media_artifacts
             WHERE job_id = ?1 AND kind = 'keyframe'
             ORDER BY COALESCE(timestamp, 1e18) ASC, id ASC
             LIMIT ?2",
        )
        .map_err(|e| EvidenceError::Database(e.to_string()))?;
    let rows = stmt
        .query_map(params![job_id, MAX_KEYFRAMES as i64], |row| {
            Ok(KeyframeEvidence {
                artifact_id: row.get(0)?,
                timestamp_sec: row.get(1)?,
                path: row.get(2)?,
                label: row.get(3)?,
            })
        })
        .map_err(|e| EvidenceError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| EvidenceError::Database(e.to_string()))
}

fn read_ocr_units(conn: &Connection, job_id: i64) -> Result<Vec<OcrEvidence>, EvidenceError> {
    let mut stmt = conn
        .prepare(
            "SELECT ordinal, start_time, end_time, text, artifact_id, confidence
             FROM search_units
             WHERE job_id = ?1 AND representation = 'ocr'
             ORDER BY ordinal ASC
             LIMIT ?2",
        )
        .map_err(|e| EvidenceError::Database(e.to_string()))?;
    let rows = stmt
        .query_map(params![job_id, MAX_OCR_UNITS as i64], |row| {
            Ok(OcrEvidence {
                ordinal: row.get(0)?,
                start_sec: row.get(1)?,
                end_sec: row.get(2)?,
                text: row.get(3)?,
                artifact_id: row.get(4)?,
                confidence: row.get(5)?,
            })
        })
        .map_err(|e| EvidenceError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| EvidenceError::Database(e.to_string()))
}

fn read_annotations(
    conn: &Connection,
    job_id: i64,
) -> Result<Vec<AnnotationEvidence>, EvidenceError> {
    let mut stmt = conn
        .prepare(
            "SELECT annotation_type, normalized_value, display_value,
                    confidence, source, start_time, end_time
             FROM content_annotations
             WHERE job_id = ?1
             ORDER BY id ASC
             LIMIT ?2",
        )
        .map_err(|e| EvidenceError::Database(e.to_string()))?;
    let rows = stmt
        .query_map(params![job_id, MAX_ANNOTATIONS as i64], |row| {
            Ok(AnnotationEvidence {
                annotation_type: row.get(0)?,
                value: row.get(1)?,
                display: row.get(2)?,
                confidence: row.get(3)?,
                source: row.get(4)?,
                start_sec: row.get(5)?,
                end_sec: row.get(6)?,
            })
        })
        .map_err(|e| EvidenceError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| EvidenceError::Database(e.to_string()))
}

impl EditorialEvidencePackage {
    /// Computes a deterministic SHA-256 hash of the canonical evidence package content.
    ///
    /// The hash includes:
    /// 1. `job_id` and schema version
    /// 2. Source identity: url, canonical_url, duration_secs
    /// 3. Transcript segments sorted by `segment_index`: (index, start_sec, end_sec, text)
    /// 4. Keyframes sorted by `artifact_id`: (artifact_id, timestamp_sec, path)
    /// 5. OCR entries sorted by `ordinal`: (ordinal, start_sec, end_sec, text)
    /// 6. Annotations sorted by `(annotation_type, value)`: (type, value, start_sec, end_sec)
    ///
    /// This is strictly independent of JSON key ordering, transport encoding, or whitespace.
    pub fn compute_canonical_hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(b"PULSARIA_CANONICAL_EVIDENCE_V1\n");
        hasher.update(format!("job_id:{}\n", self.job_id).as_bytes());
        hasher.update(format!("url:{}\n", self.source.url).as_bytes());
        if let Some(ref can) = self.source.canonical_url {
            hasher.update(format!("canonical_url:{}\n", can).as_bytes());
        }
        if let Some(dur) = self.source.duration_secs {
            hasher.update(format!("duration:{:.3}\n", dur).as_bytes());
        }

        let mut sorted_transcript = self.transcript.clone();
        sorted_transcript.sort_by_key(|t| t.segment_index);
        hasher.update(format!("transcript_count:{}\n", sorted_transcript.len()).as_bytes());
        for t in &sorted_transcript {
            hasher.update(
                format!(
                    "t:{}:{:.3}:{:.3}:{}\n",
                    t.segment_index, t.start_sec, t.end_sec, t.text
                )
                .as_bytes(),
            );
        }

        let mut sorted_kf = self.keyframes.clone();
        sorted_kf.sort_by_key(|k| k.artifact_id);
        hasher.update(format!("keyframe_count:{}\n", sorted_kf.len()).as_bytes());
        for k in &sorted_kf {
            let ts = k.timestamp_sec.unwrap_or(0.0);
            hasher.update(format!("k:{}:{:.3}:{}\n", k.artifact_id, ts, k.path).as_bytes());
        }

        let mut sorted_ocr = self.ocr.clone();
        sorted_ocr.sort_by_key(|o| o.ordinal);
        hasher.update(format!("ocr_count:{}\n", sorted_ocr.len()).as_bytes());
        for o in &sorted_ocr {
            let start = o.start_sec.unwrap_or(0.0);
            let end = o.end_sec.unwrap_or(0.0);
            hasher
                .update(format!("o:{}:{:.3}:{:.3}:{}\n", o.ordinal, start, end, o.text).as_bytes());
        }

        let mut sorted_ann = self.annotations.clone();
        sorted_ann
            .sort_by(|a, b| (&a.annotation_type, &a.value).cmp(&(&b.annotation_type, &b.value)));
        hasher.update(format!("annotation_count:{}\n", sorted_ann.len()).as_bytes());
        for a in &sorted_ann {
            let start = a.start_sec.unwrap_or(0.0);
            let end = a.end_sec.unwrap_or(0.0);
            hasher.update(
                format!(
                    "a:{}:{}:{:.3}:{:.3}\n",
                    a.annotation_type, a.value, start, end
                )
                .as_bytes(),
            );
        }

        format!("{:x}", hasher.finalize())
    }
}

/// Standalone helper to compute canonical evidence hash for an `EditorialEvidencePackage`.
pub fn compute_canonical_evidence_hash(package: &EditorialEvidencePackage) -> String {
    package.compute_canonical_hash()
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn setup_evidence_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                canonical_url TEXT,
                status TEXT NOT NULL DEFAULT 'completed'
            );
            CREATE TABLE media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL UNIQUE,
                title TEXT, author TEXT, duration INTEGER, platform TEXT,
                video_path TEXT, visual_analysis TEXT, instructional_guide TEXT,
                poster_path TEXT, source_state TEXT NOT NULL DEFAULT 'local'
            );
            CREATE TABLE content_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER, platform TEXT, author_handle TEXT, title TEXT
            );
            CREATE TABLE transcript_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL, segment_index INTEGER NOT NULL,
                start_time REAL NOT NULL, end_time REAL NOT NULL, text TEXT NOT NULL
            );
            CREATE TABLE media_artifacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL,
                timestamp REAL, label TEXT
            );
            CREATE TABLE search_units (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL, content_id INTEGER,
                representation TEXT NOT NULL, ordinal INTEGER NOT NULL,
                text TEXT NOT NULL, start_time REAL, end_time REAL,
                language TEXT, artifact_id INTEGER,
                provenance_json TEXT, confidence REAL, source_hash TEXT
            );
            CREATE TABLE content_annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL, content_id INTEGER,
                annotation_type TEXT NOT NULL, normalized_value TEXT NOT NULL,
                display_value TEXT NOT NULL, confidence REAL,
                source TEXT NOT NULL, evidence_unit_id INTEGER,
                start_time REAL, end_time REAL
            );",
        )
        .unwrap();
        conn
    }

    pub(crate) fn insert_full_source(conn: &Connection, job_id: i64) {
        conn.execute(
            "INSERT INTO jobs (id, url, canonical_url, status)
             VALUES (?1, 'https://www.tiktok.com/@chef/video/9', 'tiktok:video:9', 'completed')",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO media (job_id, title, author, duration, platform, video_path, instructional_guide)
             VALUES (?1, 'Salsa brava', '@chef', 80, 'tiktok', '/videos/9.mp4', 'Guía: sofreír 10 min')",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO transcript_segments (job_id, segment_index, start_time, end_time, text)
             VALUES (?1, 0, 0.0, 12.5, 'Ponemos cuatro cucharadas de aceite'),
                    (?1, 1, 13.0, 25.0, 'Añadimos 200 gramos de tomate')",
            params![job_id],
        )
        .unwrap();
        let kf_id = if job_id == 9 { 11 } else { job_id * 100 + 1 };
        let poster_id = if job_id == 9 { 12 } else { job_id * 100 + 2 };
        conn.execute(
            "INSERT INTO media_artifacts (id, job_id, kind, path, timestamp, label)
             VALUES (?2, ?1, 'keyframe', '/artifacts/9/k1.jpg', 12.0, 'sofrito'),
                    (?3, ?1, 'poster', '/artifacts/9/poster.jpg', NULL, NULL)",
            params![job_id, kf_id, poster_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO search_units (job_id, representation, ordinal, text, start_time, end_time, artifact_id, confidence)
             VALUES (?1, 'ocr', 0, '180C 20 MIN', 13.0, 25.0, ?2, 0.88),
                    (?1, 'transcript', 0, 'Ponemos cuatro cucharadas', 0.0, 12.5, NULL, 0.95)",
            params![job_id, kf_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO content_annotations
                (job_id, annotation_type, normalized_value, display_value, confidence, source)
             VALUES (?1, 'category', 'recipe', 'Recipe', 0.9, 'deterministic-search-v1')",
            params![job_id],
        )
        .unwrap();
    }

    #[test]
    fn test_full_package_resolves_everything() {
        let conn = setup_evidence_db();
        insert_full_source(&conn, 9);

        let package = build_evidence_package(&conn, 9).unwrap();
        assert_eq!(package.schema_version, "1.0");
        assert_eq!(package.source.job_id, 9);
        assert_eq!(package.source.duration_secs, Some(80.0));
        assert!(package.source.has_video_file);
        assert_eq!(
            package.source.canonical_url.as_deref(),
            Some("tiktok:video:9")
        );

        assert_eq!(package.transcript.len(), 2);
        assert_eq!(package.transcript[0].segment_index, 0);
        assert_eq!(package.transcript_total, 2);

        // Solo kind='keyframe': el poster no entra.
        assert_eq!(package.keyframes.len(), 1);
        assert_eq!(package.keyframes[0].artifact_id, 11);
        assert_eq!(package.keyframe_total, 1);

        // Solo representation='ocr': la unidad transcript no entra.
        assert_eq!(package.ocr.len(), 1);
        assert_eq!(package.ocr[0].artifact_id, Some(11));
        assert_eq!(package.ocr_total, 1);

        assert_eq!(package.annotations.len(), 1);
        assert!(!package.truncated);
    }

    #[test]
    fn test_missing_job_is_explicit() {
        let conn = setup_evidence_db();
        assert_eq!(
            build_evidence_package(&conn, 404).unwrap_err(),
            EvidenceError::SourceNotFound(404)
        );
    }

    #[test]
    fn test_job_without_any_evidence_is_rejected() {
        let conn = setup_evidence_db();
        conn.execute(
            "INSERT INTO jobs (id, url, status) VALUES (5, 'https://www.tiktok.com/@x/video/5', 'queued')",
            [],
        )
        .unwrap();
        assert_eq!(
            build_evidence_package(&conn, 5).unwrap_err(),
            EvidenceError::EmptyEvidence(5)
        );
    }

    #[test]
    fn test_partial_evidence_is_enough() {
        let conn = setup_evidence_db();
        conn.execute(
            "INSERT INTO jobs (id, url, status) VALUES (6, 'https://www.tiktok.com/@x/video/6', 'completed')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO transcript_segments (job_id, segment_index, start_time, end_time, text)
             VALUES (6, 0, 0.0, 3.0, 'Hola')",
            [],
        )
        .unwrap();
        let package = build_evidence_package(&conn, 6).unwrap();
        assert_eq!(package.transcript.len(), 1);
        assert!(package.keyframes.is_empty());
        // Sin fila en media ⇒ duración desconocida, pero el paquete vale.
        assert_eq!(package.source.duration_secs, None);
    }

    #[test]
    fn test_package_truncation_is_flagged() {
        let conn = setup_evidence_db();
        conn.execute(
            "INSERT INTO jobs (id, url, status) VALUES (7, 'https://www.tiktok.com/@x/video/7', 'completed')",
            [],
        )
        .unwrap();
        for index in 0..(MAX_TRANSCRIPT_SEGMENTS + 5) {
            conn.execute(
                "INSERT INTO transcript_segments (job_id, segment_index, start_time, end_time, text)
                 VALUES (7, ?1, 0.0, 1.0, 'x')",
                params![index as i64],
            )
            .unwrap();
        }
        let package = build_evidence_package(&conn, 7).unwrap();
        assert_eq!(package.transcript.len(), MAX_TRANSCRIPT_SEGMENTS);
        assert_eq!(package.transcript_total, MAX_TRANSCRIPT_SEGMENTS + 5);
        assert!(package.truncated);
    }

    #[test]
    fn test_multi_source_package_aggregates_multiple_sources() {
        let conn = setup_evidence_db();
        insert_full_source(&conn, 10);
        insert_full_source(&conn, 20);
        insert_full_source(&conn, 30);

        let multi = build_multi_source_evidence_package(&conn, &[10, 20, 30]).unwrap();
        assert_eq!(multi.schema_version, "1.0");
        assert_eq!(multi.total_sources, 3);
        assert_eq!(multi.job_ids(), vec![10, 20, 30]);
        assert_eq!(multi.transcript_total, 6); // 2 por fuente
        assert_eq!(multi.keyframe_total, 3); // 1 por fuente
        assert_eq!(multi.ocr_total, 3); // 1 por fuente
        assert!(!multi.truncated);

        assert!(multi.find_package(10).is_some());
        assert!(multi.find_package(20).is_some());
        assert!(multi.find_package(30).is_some());
        assert!(multi.find_package(404).is_none());
    }

    #[test]
    fn test_multi_source_empty_list_rejected() {
        let conn = setup_evidence_db();
        assert_eq!(
            build_multi_source_evidence_package(&conn, &[]).unwrap_err(),
            EvidenceError::EmptySourceList
        );
    }

    #[test]
    fn test_multi_source_missing_job_rejected() {
        let conn = setup_evidence_db();
        insert_full_source(&conn, 10);
        assert_eq!(
            build_multi_source_evidence_package(&conn, &[10, 404]).unwrap_err(),
            EvidenceError::SourceNotFound(404)
        );
    }

    #[test]
    fn test_multi_source_deduplicates_job_ids() {
        let conn = setup_evidence_db();
        insert_full_source(&conn, 10);

        let multi = build_multi_source_evidence_package(&conn, &[10, 10, 10]).unwrap();
        assert_eq!(multi.total_sources, 1);
        assert_eq!(multi.job_ids(), vec![10]);
        assert_eq!(multi.transcript_total, 2);
    }

    #[test]
    fn test_canonical_evidence_hash_determinism() {
        let conn = setup_evidence_db();
        insert_full_source(&conn, 42);

        let pkg1 = build_evidence_package(&conn, 42).unwrap();
        let pkg2 = build_evidence_package(&conn, 42).unwrap();

        let hash1 = pkg1.compute_canonical_hash();
        let hash2 = pkg2.compute_canonical_hash();

        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 64); // SHA-256 hex string

        // Mutating a single segment changes the hash
        let mut pkg3 = pkg1.clone();
        pkg3.transcript[0].text = "Texto modificado".to_string();
        let hash3 = pkg3.compute_canonical_hash();
        assert_ne!(hash1, hash3);
    }
}
