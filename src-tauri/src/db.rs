use crate::domain::models::EMBEDDING_DIMS;
pub use crate::domain::models::{JobRecord, SearchResult};
use crate::domain::models::{ParsedFilters, SearchRepresentation};
use rusqlite::{params, Connection, OptionalExtension, Result, Row, Transaction};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const EMBEDDING_MODEL_ID: &str = "all-MiniLM-L6-v2";

/// Metadata written by ingestion and progress events.
///
/// Keeping the fields together prevents call sites from accidentally shifting
/// one of the path or provenance values when the media schema evolves.
#[derive(Clone, Copy, Debug)]
pub struct MediaMetadata<'a> {
    pub title: &'a str,
    pub author: &'a str,
    pub thumbnail: &'a str,
    pub duration: i32,
    pub upload_date: &'a str,
    pub video_path: &'a str,
    pub audio_path: &'a str,
    pub transcript_path: &'a str,
    pub platform: &'a str,
}

const EMBEDDING_BYTES: usize = EMBEDDING_DIMS * std::mem::size_of::<f32>();

fn validate_embedding(embedding: &[f32]) -> Result<()> {
    if embedding.len() != EMBEDDING_DIMS {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "embedding dimension mismatch: expected {}, got {}",
            EMBEDDING_DIMS,
            embedding.len()
        )));
    }
    if embedding.iter().any(|value| !value.is_finite()) {
        return Err(rusqlite::Error::InvalidParameterName(
            "embedding contains a non-finite value".to_string(),
        ));
    }
    Ok(())
}

fn serialize_embedding(embedding: &[f32]) -> Result<Vec<u8>> {
    validate_embedding(embedding)?;
    let mut blob = Vec::with_capacity(EMBEDDING_BYTES);
    for &value in embedding {
        blob.extend_from_slice(&value.to_ne_bytes());
    }
    Ok(blob)
}

fn deserialize_embedding(blob: &[u8], column: usize) -> Result<Vec<f32>> {
    if blob.len() != EMBEDDING_BYTES {
        return Err(rusqlite::Error::InvalidColumnType(
            column,
            "embedding_vector".to_string(),
            rusqlite::types::Type::Blob,
        ));
    }
    let embedding = blob
        .chunks_exact(std::mem::size_of::<f32>())
        .map(|chunk| f32::from_ne_bytes(chunk.try_into().expect("chunk size is fixed")))
        .collect::<Vec<_>>();
    validate_embedding(&embedding).map_err(|_| {
        rusqlite::Error::InvalidColumnType(
            column,
            "embedding_vector".to_string(),
            rusqlite::types::Type::Blob,
        )
    })?;
    Ok(embedding)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct EmbeddingIndexStatus {
    pub model_id: String,
    pub stored_hash: Option<String>,
    pub current_hash: String,
    pub dimensions: usize,
    pub stale: bool,
}

pub fn embedding_model_fingerprint(model_dir: &Path) -> std::result::Result<String, String> {
    let model_path = model_dir.join("model.onnx");
    let tokenizer_path = model_dir.join("tokenizer.json");
    let model = fs::read(&model_path)
        .map_err(|error| format!("could not read {}: {error}", model_path.display()))?;
    let tokenizer = fs::read(&tokenizer_path)
        .map_err(|error| format!("could not read {}: {error}", tokenizer_path.display()))?;
    let mut hasher = Sha256::new();
    hasher.update(b"pulsaria-embedding-model-v1\0");
    hasher.update(model);
    hasher.update(b"\0tokenizer\0");
    hasher.update(tokenizer);
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn get_embedding_index_status(
    connection: &Connection,
    model_dir: &Path,
) -> std::result::Result<EmbeddingIndexStatus, String> {
    let current_hash = embedding_model_fingerprint(model_dir)?;
    let stored = connection
        .query_row(
            "SELECT model_id, model_hash, dimensions FROM embedding_metadata WHERE id = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let (model_id, stored_hash, dimensions) = stored.unwrap_or_else(|| {
        (
            EMBEDDING_MODEL_ID.to_string(),
            String::new(),
            EMBEDDING_DIMS as i64,
        )
    });
    Ok(EmbeddingIndexStatus {
        stale: stored_hash != current_hash || dimensions != EMBEDDING_DIMS as i64,
        model_id,
        stored_hash: if stored_hash.is_empty() {
            None
        } else {
            Some(stored_hash)
        },
        current_hash,
        dimensions: usize::try_from(dimensions).unwrap_or_default(),
    })
}

pub fn record_embedding_model(connection: &Connection, model_hash: &str) -> Result<()> {
    connection.execute(
        "INSERT INTO embedding_metadata
            (id, provider_id, model_id, model_version, model_hash, tokenizer_hash, dimensions, generated_at)
         VALUES (1, ?1, ?2, ?3, ?4, NULL, ?5, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
             provider_id = excluded.provider_id,
             model_id = excluded.model_id,
             model_version = excluded.model_version,
             model_hash = excluded.model_hash,
             tokenizer_hash = excluded.tokenizer_hash,
             dimensions = excluded.dimensions,
             generated_at = excluded.generated_at,
             updated_at = CURRENT_TIMESTAMP",
        params![
            "onnx",
            EMBEDDING_MODEL_ID,
            EMBEDDING_MODEL_ID,
            model_hash,
            EMBEDDING_DIMS as i64
        ],
    )?;
    Ok(())
}

#[allow(dead_code)]
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
    pub kind: String,
    pub sort_mode: String,
    pub smart_query: Option<String>,
    pub smart_filters_json: Option<String>,
    pub item_count: i64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SourceCollectionRecord {
    pub id: i64,
    pub profile_source_id: i64,
    pub channel_kind: String,
    pub name: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub enabled: bool,
    pub status: String,
    pub item_count: Option<i64>,
    pub last_sync_at: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CollectionSourceRecord {
    pub id: i64,
    pub url: String,
    pub profile_url: String,
    pub source_type: String,
    pub platform: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub browser: Option<String>,
    pub active: bool,
    pub status: String,
    pub capabilities_json: String,
    pub watch_config_json: String,
    pub initial_import_mode: String,
    pub history_limit: Option<i64>,
    pub history_from: Option<String>,
    pub rules_json: String,
    pub interval_minutes: i64,
    pub last_attempt_at: Option<String>,
    pub last_sync_at: Option<String>,
    pub last_success_at: Option<String>,
    pub next_sync_at: Option<String>,
    pub discovered_count: i64,
    pub consecutive_failures: i64,
    pub last_error: Option<String>,
    pub last_sync_summary_json: Option<String>,
    pub created_at: String,
    pub cover_url: Option<String>,
    pub verified: Option<bool>,
    pub following_count: Option<i64>,
    pub followers_count: Option<i64>,
    pub likes_count: Option<i64>,
    pub posts_count: Option<i64>,
    pub updated_at: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ProfileChannelRecord {
    pub id: i64,
    pub profile_source_id: i64,
    pub kind: String,
    pub enabled: bool,
    pub status: String,
    pub discovered_count: i64,
    pub last_discovery_at: Option<String>,
    pub last_successful_discovery_at: Option<String>,
    pub cursor: Option<String>,
    pub newest_known_content_id: Option<String>,
    pub oldest_known_content_id: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ContentItemRecord {
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
    pub availability: String,
    pub job_id: Option<i64>,
}

/// Shared content projection used when a playlist membership points to an
/// item that has no processing job yet. The flattened job fields preserve the
/// existing library card contract while `content_id`, `job_id` and
/// `availability` keep the canonical identity visible to newer clients.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ContentViewRecord {
    pub content_id: i64,
    pub job_id: Option<i64>,
    pub availability: String,
    #[serde(flatten)]
    pub job: JobRecord,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[allow(dead_code)]
pub struct ContentRelationshipRecord {
    pub id: i64,
    pub content_id: i64,
    pub profile_source_id: i64,
    pub channel_kind: String,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub active: bool,
    pub provenance_json: Option<String>,
    pub sync_run_id: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CollectionSourceItemRecord {
    pub id: i64,
    pub source_id: i64,
    pub canonical_url: String,
    pub platform_video_id: Option<String>,
    pub activity_types_json: String,
    pub state: String,
    pub job_id: Option<i64>,
    pub reason: Option<String>,
    pub first_seen_at: String,
    pub last_seen_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CollectionSourceActivityRecord {
    pub id: i64,
    pub source_id: i64,
    pub created_at: String,
    pub event_type: String,
    pub activity_type: Option<String>,
    pub message: String,
    pub canonical_url: Option<String>,
    pub job_id: Option<i64>,
    pub state: Option<String>,
    pub found_count: i64,
    pub queued_count: i64,
    pub duplicate_count: i64,
    pub ignored_count: i64,
    pub error_count: i64,
}

const DEFAULT_SOURCE_CAPABILITIES: &str = "{}";
const DEFAULT_SOURCE_WATCH_CONFIG: &str =
    r#"{"posts":false,"likes":true,"saved":true,"reposts":false}"#;
const DEFAULT_SOURCE_RULES: &str = r#"{"ignoreDuplicates":true,"autoEnqueue":true}"#;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct HealthEvent {
    pub id: i64,
    pub created_at: String,
    pub component: String,
    pub severity: String,
    pub diagnosis: String,
    pub action: Option<String>,
    pub result: Option<String>,
}

/// Persisted checkpoints for the Activity surface. This is deliberately a
/// low-volume transition log, not a raw progress-metrics stream.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct JobActivityEvent {
    pub id: i64,
    pub job_id: i64,
    pub status: String,
    pub progress: i32,
    pub user_message: Option<String>,
    pub technical_error: Option<String>,
    pub error_code: Option<String>,
    pub created_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct LibraryRepairReport {
    pub interrupted_jobs: usize,
    pub missing_media_paths: usize,
    pub preserved_jobs: usize,
    pub backup_path: Option<String>,
    #[serde(default)]
    pub storage: Option<StorageReconciliationReport>,
}

/// Resultado de reconciliar las referencias derivadas de almacenamiento.
///
/// La reconciliación nunca elimina el archivo físico de un usuario. Solo
/// refresca tamaños, repara una ruta de exportación que todavía puede
/// recuperarse desde la papelera y retira filas cuyo archivo ya no existe.
/// El conocimiento durable (transcript, segmentos y embeddings) queda fuera
/// de este contrato.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct StorageReconciliationReport {
    pub checked_artifacts: usize,
    pub corrected_artifact_sizes: usize,
    pub removed_stale_artifacts: usize,
    pub checked_generated_outputs: usize,
    pub corrected_output_sizes: usize,
    pub repaired_output_paths: usize,
    pub removed_stale_outputs: usize,
}

pub const SCHEMA_VERSION: i64 = 11;
const SQLITE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);

fn migration_error(message: impl Into<String>) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        message.into(),
    )))
}

fn backup_database_before_migration(database_path: &Path) -> std::io::Result<Option<PathBuf>> {
    if !database_path.is_file() {
        return Ok(None);
    }
    let backups = database_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("backups");
    fs::create_dir_all(&backups)?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S-%3f");
    for suffix in 0..100u32 {
        let destination = backups.join(format!(
            "library-pre-v{}-{}-{}.db",
            SCHEMA_VERSION, stamp, suffix
        ));
        if !destination.exists() {
            fs::copy(database_path, &destination)?;
            return Ok(Some(destination));
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::AlreadyExists,
        "could not allocate a unique database migration backup path",
    ))
}

fn ensure_column(
    transaction: &rusqlite::Transaction<'_>,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<()> {
    let exists = table_has_column(transaction, table, column)?;

    if !exists {
        transaction.execute(
            &format!(
                "ALTER TABLE \"{}\" ADD COLUMN \"{}\" {}",
                table, column, definition
            ),
            [],
        )?;
    }
    Ok(())
}

fn table_has_column(
    transaction: &rusqlite::Transaction<'_>,
    table: &str,
    column: &str,
) -> Result<bool> {
    let mut statement = transaction.prepare(&format!("PRAGMA table_info(\"{}\")", table))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
    for row in rows {
        if row? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn content_platform_for_url(url: &str) -> &'static str {
    if url.to_ascii_lowercase().contains("tiktok.com") {
        "tiktok"
    } else {
        "unknown"
    }
}

fn content_identity_for_url(url: &str, fallback_id: i64) -> String {
    let lower = url.to_ascii_lowercase();
    if let Some(marker_start) = lower.find("/video/") {
        let suffix = &url[marker_start + "/video/".len()..];
        let candidate = suffix
            .split(|character: char| character == '/' || character == '?' || character == '#')
            .next()
            .unwrap_or_default()
            .trim();
        if !candidate.is_empty() {
            return candidate.to_string();
        }
    }

    let mut digest = Sha256::new();
    digest.update(if url.trim().is_empty() {
        format!("legacy-job:{fallback_id}")
    } else {
        url.to_string()
    });
    format!("legacy-{:x}", digest.finalize())
}

fn ensure_content_items_for_jobs(transaction: &Transaction<'_>) -> Result<()> {
    let jobs = {
        let mut statement =
            transaction.prepare("SELECT id, url, canonical_url FROM jobs ORDER BY id ASC")?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?;
        rows.collect::<Result<Vec<_>>>()?
    };

    for (job_id, url, stored_canonical_url) in jobs {
        let canonical_url = stored_canonical_url
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| crate::url_utils::canonicalize_tiktok_url(&url));
        let canonical_url = if canonical_url.trim().is_empty() {
            url.clone()
        } else {
            canonical_url
        };
        let platform = content_platform_for_url(&canonical_url);
        let platform_content_id = content_identity_for_url(&canonical_url, job_id);

        let existing_id: Option<i64> = transaction
            .query_row(
                "SELECT id FROM content_items
                 WHERE platform = ?1 AND platform_content_id = ?2",
                params![platform, platform_content_id],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(content_id) = existing_id {
            transaction.execute(
                "UPDATE content_items SET
                    canonical_url = coalesce(nullif(?1, ''), canonical_url),
                    job_id = coalesce(job_id, ?2),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?3",
                params![canonical_url, job_id, content_id],
            )?;
        } else {
            transaction.execute(
                "INSERT INTO content_items
                    (platform, platform_content_id, canonical_url, availability, job_id)
                 VALUES (?1, ?2, ?3, 'available', ?4)",
                params![platform, platform_content_id, canonical_url, job_id],
            )?;
        }
    }
    Ok(())
}

fn migrate_legacy_source_items(transaction: &Transaction<'_>) -> Result<()> {
    let items = {
        let mut statement = transaction.prepare(
            "SELECT source_id, canonical_url, platform_video_id, job_id,
                    activity_types_json, state
             FROM collection_source_items
             ORDER BY id ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })?;
        rows.collect::<Result<Vec<_>>>()?
    };

    for (source_id, canonical_url, platform_video_id, job_id, activity_types_json, state) in items {
        let resolved_job_id = if job_id.is_some() {
            job_id
        } else {
            transaction
                .query_row(
                    "SELECT id FROM jobs WHERE canonical_url = ?1 ORDER BY id ASC LIMIT 1",
                    params![canonical_url],
                    |row| row.get(0),
                )
                .optional()?
        };
        let platform = content_platform_for_url(&canonical_url);
        let platform_content_id = platform_video_id
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| {
                content_identity_for_url(&canonical_url, resolved_job_id.unwrap_or_default())
            });
        let availability = match state.trim().to_ascii_lowercase().as_str() {
            "unavailable" | "private" | "deleted" | "blocked" | "removed" => "unavailable",
            "pending" | "queued" | "processing" => "pending",
            _ => "available",
        };
        let content_id: i64 = if let Some(content_id) = transaction
            .query_row(
                "SELECT id FROM content_items
                 WHERE platform = ?1 AND platform_content_id = ?2",
                params![platform, platform_content_id],
                |row| row.get(0),
            )
            .optional()?
        {
            transaction.execute(
                "UPDATE content_items SET
                    canonical_url = coalesce(nullif(?1, ''), canonical_url),
                    availability = CASE WHEN availability = 'available' THEN ?2 ELSE availability END,
                    job_id = coalesce(job_id, ?3),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?4",
                params![canonical_url, availability, resolved_job_id, content_id],
            )?;
            content_id
        } else {
            transaction.execute(
                "INSERT INTO content_items
                    (platform, platform_content_id, canonical_url, availability, job_id)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    platform,
                    platform_content_id,
                    canonical_url,
                    availability,
                    resolved_job_id
                ],
            )?;
            transaction.last_insert_rowid()
        };

        let activities =
            serde_json::from_str::<Vec<String>>(&activity_types_json).unwrap_or_default();
        for activity in activities {
            if activity.trim().is_empty() {
                continue;
            }
            let activity = match activity.as_str() {
                "likes" | "liked" | "favorite" | "favorites" => "favorites",
                "reposted" | "reposts" => "reposts",
                "posted" | "posts" => "posts",
                "saved" => "saved",
                other => other,
            };
            transaction.execute(
                "INSERT INTO content_relationships
                    (content_id, profile_source_id, channel_kind, active)
                 VALUES (?1, ?2, ?3, 1)
                 ON CONFLICT(profile_source_id, channel_kind, content_id)
                 DO UPDATE SET active = 1, last_seen_at = CURRENT_TIMESTAMP",
                params![content_id, source_id, activity],
            )?;
        }
    }
    Ok(())
}

fn migrate_playlist_memberships(transaction: &Transaction<'_>) -> Result<()> {
    if table_has_column(transaction, "playlist_items", "content_id")? {
        ensure_column(
            transaction,
            "playlist_items",
            "position",
            "REAL NOT NULL DEFAULT 0",
        )?;
        ensure_column(
            transaction,
            "playlist_items",
            "added_at",
            "DATETIME DEFAULT CURRENT_TIMESTAMP",
        )?;
        ensure_column(
            transaction,
            "playlist_items",
            "added_by",
            "TEXT NOT NULL DEFAULT 'user'",
        )?;
        return Ok(());
    }

    transaction.execute(
        "CREATE TABLE playlist_items_v2 (
            playlist_id INTEGER NOT NULL,
            content_id INTEGER NOT NULL,
            position REAL NOT NULL DEFAULT 0,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            added_by TEXT NOT NULL DEFAULT 'user',
            PRIMARY KEY (playlist_id, content_id),
            FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY(content_id) REFERENCES content_items(id) ON DELETE CASCADE
        )",
        [],
    )?;

    let legacy_items = {
        let mut statement = transaction.prepare(
            "SELECT pi.playlist_id, pi.job_id, pi.added_at, p.auto_generated
             FROM playlist_items pi
             JOIN playlists p ON p.id = pi.playlist_id
             ORDER BY pi.playlist_id ASC, pi.added_at ASC, pi.rowid ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, bool>(3)?,
            ))
        })?;
        rows.collect::<Result<Vec<_>>>()?
    };

    let mut positions = std::collections::HashMap::<i64, f64>::new();
    for (playlist_id, job_id, added_at, auto_generated) in legacy_items {
        let Some(content_id) = transaction
            .query_row(
                "SELECT id FROM content_items WHERE job_id = ?1 ORDER BY id ASC LIMIT 1",
                params![job_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
        else {
            continue;
        };

        let position = positions.entry(playlist_id).or_insert(0.0);
        *position += 1000.0;
        let added_by = if auto_generated {
            "legacy_auto"
        } else {
            "user"
        };
        let inserted = transaction.execute(
            "INSERT OR IGNORE INTO playlist_items_v2
                (playlist_id, content_id, position, added_at, added_by)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![playlist_id, content_id, *position, added_at, added_by],
        )?;
        if inserted == 0 {
            *position -= 1000.0;
        }
    }

    transaction.execute("DROP TABLE playlist_items", [])?;
    transaction.execute("ALTER TABLE playlist_items_v2 RENAME TO playlist_items", [])?;
    Ok(())
}

fn rename_legacy_column(
    transaction: &rusqlite::Transaction<'_>,
    table: &str,
    legacy: &str,
    current: &str,
) -> Result<()> {
    if table_has_column(transaction, table, legacy)?
        && !table_has_column(transaction, table, current)?
    {
        transaction.execute(
            &format!(
                "ALTER TABLE \"{}\" RENAME COLUMN \"{}\" TO \"{}\"",
                table, legacy, current
            ),
            [],
        )?;
    }
    Ok(())
}

fn copy_legacy_column_if_present(
    transaction: &rusqlite::Transaction<'_>,
    table: &str,
    legacy: &str,
    current: &str,
    expression: &str,
) -> Result<()> {
    if table_has_column(transaction, table, legacy)?
        && table_has_column(transaction, table, current)?
    {
        transaction.execute(
            &format!(
                "UPDATE \"{}\" SET \"{}\" = {} WHERE \"{}\" IS NOT NULL",
                table, current, expression, legacy
            ),
            [],
        )?;
    }
    Ok(())
}

fn configure_connection(connection: &Connection) -> Result<()> {
    connection.busy_timeout(SQLITE_BUSY_TIMEOUT)?;
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;",
    )?;
    Ok(())
}

pub fn init_db() -> Result<Connection> {
    // Keep all writable application data in one configurable location. In
    // development this resolves to the repository's data/ directory; in an
    // installed build it falls back to the user's application data folder.
    // New Windows installs use `%APPDATA%\\Pulsar Eventide`; the legacy
    // `%APPDATA%\\Pulsaria` directory is retained when it already exists.
    let data_dir = data_dir_path();
    fs::create_dir_all(&data_dir)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;

    let database_path = data_dir.join("library.db");
    let existing_version = if database_path.is_file() {
        let connection = Connection::open(&database_path)?;
        connection.query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))?
    } else {
        0
    };
    if existing_version > SCHEMA_VERSION {
        return Err(migration_error(format!(
            "database schema version {} is newer than supported version {}",
            existing_version, SCHEMA_VERSION
        )));
    }
    let migration_backup = if existing_version < SCHEMA_VERSION {
        // Flush pending WAL pages before copying the migration backup. A raw
        // copy of library.db while library.db-wal is active can omit the
        // newest committed pages and produce an unusable recovery artifact.
        if database_path.is_file() {
            let checkpoint_connection = Connection::open(&database_path)?;
            configure_connection(&checkpoint_connection)?;
            checkpoint_connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        }
        backup_database_before_migration(&database_path)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?
    } else {
        None
    };

    let conn = Connection::open(&database_path)?;
    configure_connection(&conn)?;
    let transaction = conn.unchecked_transaction()?;

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            canonical_url TEXT,
            status TEXT NOT NULL DEFAULT 'queued',
            progress INTEGER NOT NULL DEFAULT 0,
            retry_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    transaction.execute(
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
            julia_exported BOOLEAN DEFAULT 0,
            visual_analysis TEXT,
            instructional_guide TEXT,
            video_bytes INTEGER,
            audio_bytes INTEGER,
            downloaded_at DATETIME,
            last_accessed_at DATETIME,
            play_count INTEGER NOT NULL DEFAULT 0,
            open_count INTEGER NOT NULL DEFAULT 0,
            search_hit_count INTEGER NOT NULL DEFAULT 0,
            favorite BOOLEAN NOT NULL DEFAULT 0,
            pinned BOOLEAN NOT NULL DEFAULT 0,
            source_state TEXT NOT NULL DEFAULT 'local',
            purged_at DATETIME,
            purged_reason TEXT,
            poster_path TEXT,
            FOREIGN KEY(job_id) REFERENCES jobs(id)
        )",
        [],
    )?;

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS job_activity_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            user_message TEXT,
            technical_error TEXT,
            error_code TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;
    for (table, column, definition) in [
        ("jobs", "error_message", "TEXT"),
        ("jobs", "retry_count", "INTEGER NOT NULL DEFAULT 0"),
        ("jobs", "canonical_url", "TEXT"),
        ("media", "video_path", "TEXT"),
        ("media", "audio_path", "TEXT"),
        ("media", "transcript_path", "TEXT"),
        ("media", "keep_status", "TEXT DEFAULT 'none'"),
        ("media", "platform", "TEXT"),
        ("media", "julia_exported", "BOOLEAN DEFAULT 0"),
        ("media", "visual_analysis", "TEXT"),
        ("media", "instructional_guide", "TEXT"),
        ("media", "video_bytes", "INTEGER"),
        ("media", "audio_bytes", "INTEGER"),
        ("media", "downloaded_at", "DATETIME"),
        ("media", "last_accessed_at", "DATETIME"),
        ("media", "play_count", "INTEGER NOT NULL DEFAULT 0"),
        ("media", "open_count", "INTEGER NOT NULL DEFAULT 0"),
        ("media", "search_hit_count", "INTEGER NOT NULL DEFAULT 0"),
        ("media", "favorite", "BOOLEAN NOT NULL DEFAULT 0"),
        ("media", "pinned", "BOOLEAN NOT NULL DEFAULT 0"),
        ("media", "source_state", "TEXT NOT NULL DEFAULT 'local'"),
        ("media", "purged_at", "DATETIME"),
        ("media", "purged_reason", "TEXT"),
        ("media", "poster_path", "TEXT"),
    ] {
        ensure_column(&transaction, table, column, definition)?;
    }

    // v6 makes large media disposable without making the knowledge graph
    // disposable. These tables intentionally contain only media movement
    // metadata; transcripts, segments, embeddings and artifacts remain in
    // their durable locations and are never part of a purge record.
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS media_artifacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('poster', 'keyframe', 'screenshot')),
            path TEXT NOT NULL,
            timestamp REAL,
            label TEXT,
            protected BOOLEAN NOT NULL DEFAULT 0,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS generated_outputs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            format TEXT NOT NULL,
            path TEXT NOT NULL,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            validated BOOLEAN NOT NULL DEFAULT 0,
            label TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(job_id, format),
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS generated_output_purge (
            purge_id INTEGER NOT NULL,
            output_id INTEGER NOT NULL,
            original_path TEXT NOT NULL,
            trash_path TEXT NOT NULL,
            FOREIGN KEY(purge_id) REFERENCES purge_history(id) ON DELETE CASCADE,
            FOREIGN KEY(output_id) REFERENCES generated_outputs(id) ON DELETE CASCADE
        )",
        [],
    )?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS purge_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            original_video_path TEXT,
            original_audio_path TEXT,
            trash_video_path TEXT,
            trash_audio_path TEXT,
            reason TEXT NOT NULL,
            undone_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;
    transaction.execute(
        "UPDATE media
         SET source_state = CASE
             WHEN source_state IS NULL OR source_state = '' THEN
                 CASE WHEN video_path IS NULL OR video_path = '' THEN 'online' ELSE 'local' END
             ELSE source_state
         END
         WHERE source_state IS NULL OR source_state = '' OR source_state NOT IN ('local', 'online', 'unavailable')",
        [],
    )?;

    // Older databases only stored the user-provided URL. Backfill the
    // canonical value once so lookups use the indexed path below instead of
    // scanning every job on every enqueue request.
    let legacy_urls = {
        let mut statement = transaction.prepare(
            "SELECT id, url FROM jobs
             WHERE canonical_url IS NULL OR canonical_url = ''",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut values = Vec::new();
        for row in rows {
            values.push(row?);
        }
        values
    };
    for (job_id, url) in legacy_urls {
        let canonical_url = crate::url_utils::canonicalize_tiktok_url(&url);
        // A database can already contain a unique canonical-url index when a
        // previous migration stopped after adding it. Choose the oldest job
        // as the owner of a canonical URL and clear newer duplicates before
        // filling legacy NULL values, so startup remains recoverable without
        // deleting the historical jobs or their media metadata.
        let has_older_owner: bool = transaction.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM jobs
                WHERE canonical_url = ?1 AND id < ?2
            )",
            params![canonical_url, job_id],
            |row| row.get(0),
        )?;
        if has_older_owner {
            continue;
        }
        transaction.execute(
            "UPDATE jobs
             SET canonical_url = NULL
             WHERE canonical_url = ?1 AND id <> ?2",
            params![canonical_url, job_id],
        )?;
        transaction.execute(
            "UPDATE jobs SET canonical_url = ?1 WHERE id = ?2",
            params![canonical_url, job_id],
        )?;
    }

    transaction.execute(
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

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS transcript_segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            segment_index INTEGER NOT NULL,
            start_time REAL NOT NULL,
            end_time REAL NOT NULL,
            text TEXT NOT NULL,
            words_json TEXT,
            FOREIGN KEY(job_id) REFERENCES jobs(id)
        )",
        [],
    )?;
    ensure_column(&transaction, "transcript_segments", "words_json", "TEXT")?;

    // Unified search storage. Transcript segments remain the source of truth;
    // these tables contain only derived, replaceable search representations.
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS search_units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            content_id INTEGER,
            representation TEXT NOT NULL,
            ordinal INTEGER NOT NULL,
            text TEXT NOT NULL,
            start_time REAL,
            end_time REAL,
            language TEXT,
            artifact_id INTEGER,
            provenance_json TEXT,
            confidence REAL,
            source_hash TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(job_id, representation, ordinal),
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY(content_id) REFERENCES content_items(id) ON DELETE SET NULL,
            FOREIGN KEY(artifact_id) REFERENCES media_artifacts(id) ON DELETE SET NULL
        )",
        [],
    )?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS search_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            search_unit_id INTEGER NOT NULL,
            provider_id TEXT NOT NULL,
            model_version TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            vector_blob BLOB NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(search_unit_id, provider_id, model_version),
            FOREIGN KEY(search_unit_id) REFERENCES search_units(id) ON DELETE CASCADE
        )",
        [],
    )?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS content_annotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            content_id INTEGER,
            annotation_type TEXT NOT NULL,
            normalized_value TEXT NOT NULL,
            display_value TEXT NOT NULL,
            confidence REAL,
            source TEXT NOT NULL,
            evidence_unit_id INTEGER,
            start_time REAL,
            end_time REAL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(job_id, annotation_type, normalized_value, source),
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY(content_id) REFERENCES content_items(id) ON DELETE SET NULL,
            FOREIGN KEY(evidence_unit_id) REFERENCES search_units(id) ON DELETE SET NULL
        )",
        [],
    )?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS search_enrichment_status (
            job_id INTEGER NOT NULL,
            stage TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            version TEXT,
            error_message TEXT,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(job_id, stage),
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;
    // FTS5 is part of the bundled SQLite build in release/runtime builds. A
    // graceful fallback is kept for stripped-down test environments.
    let _ = transaction.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS search_units_fts USING fts5(
             text,
             representation UNINDEXED,
             job_id UNINDEXED,
             tokenize = 'unicode61 remove_diacritics 2'
         )",
        [],
    );

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS embedding_metadata (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            provider_id TEXT NOT NULL DEFAULT 'onnx',
            model_id TEXT NOT NULL,
            model_version TEXT NOT NULL DEFAULT '',
            model_hash TEXT NOT NULL,
            tokenizer_hash TEXT,
            dimensions INTEGER NOT NULL,
            generated_at DATETIME,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    for (column, definition) in [
        ("provider_id", "TEXT NOT NULL DEFAULT 'onnx'"),
        ("model_version", "TEXT NOT NULL DEFAULT ''"),
        ("tokenizer_hash", "TEXT"),
        ("generated_at", "DATETIME"),
    ] {
        ensure_column(&transaction, "embedding_metadata", column, definition)?;
    }

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT NOT NULL DEFAULT '#8a5cff',
            is_smart BOOLEAN NOT NULL DEFAULT 0,
            auto_generated BOOLEAN NOT NULL DEFAULT 0,
            cover_job_id INTEGER,
            topic_keywords TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            kind TEXT NOT NULL DEFAULT 'manual',
            sort_mode TEXT NOT NULL DEFAULT 'manual',
            smart_query TEXT,
            smart_filters_json TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    for (column, definition) in [
        ("color", "TEXT NOT NULL DEFAULT '#8a5cff'"),
        ("is_smart", "BOOLEAN NOT NULL DEFAULT 0"),
        ("auto_generated", "BOOLEAN NOT NULL DEFAULT 0"),
        ("cover_job_id", "INTEGER"),
        ("topic_keywords", "TEXT DEFAULT '[]'"),
        ("kind", "TEXT NOT NULL DEFAULT 'manual'"),
        ("sort_mode", "TEXT NOT NULL DEFAULT 'manual'"),
        ("smart_query", "TEXT"),
        ("smart_filters_json", "TEXT"),
        ("updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ] {
        ensure_column(&transaction, "playlists", column, definition)?;
    }

    transaction.execute(
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

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS collection_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL UNIQUE,
            last_synced_at DATETIME,
            active BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // v5 migrates the names used by the older collection schema. CREATE TABLE
    // IF NOT EXISTS cannot alter an existing table, so without these explicit
    // renames a database created by the previous worker breaks every
    // collection query at runtime.
    rename_legacy_column(&transaction, "collection_sources", "source_url", "url")?;
    rename_legacy_column(
        &transaction,
        "collection_sources",
        "source_kind",
        "source_type",
    )?;
    rename_legacy_column(&transaction, "collection_sources", "enabled", "active")?;
    copy_legacy_column_if_present(
        &transaction,
        "collection_sources",
        "source_url",
        "url",
        "source_url",
    )?;
    copy_legacy_column_if_present(
        &transaction,
        "collection_sources",
        "source_kind",
        "source_type",
        "CASE
            WHEN lower(source_kind) IN ('collection', 'profile') THEN lower(source_kind)
            WHEN lower(url) LIKE '%/collection/%' OR lower(url) LIKE '%/tag/%' THEN 'collection'
            ELSE 'profile'
         END",
    )?;
    copy_legacy_column_if_present(
        &transaction,
        "collection_sources",
        "enabled",
        "active",
        "CASE WHEN enabled = 0 THEN 0 ELSE 1 END",
    )?;

    for (column, definition) in [
        ("last_synced_at", "DATETIME"),
        ("active", "BOOLEAN NOT NULL DEFAULT 1"),
        ("source_type", "TEXT NOT NULL DEFAULT 'collection'"),
        ("browser", "TEXT"),
        ("profile_url", "TEXT"),
        ("platform", "TEXT NOT NULL DEFAULT 'tiktok'"),
        ("username", "TEXT"),
        ("display_name", "TEXT"),
        ("avatar_url", "TEXT"),
        ("status", "TEXT NOT NULL DEFAULT 'active'"),
        ("capabilities_json", "TEXT NOT NULL DEFAULT '{}'"),
        (
            "watch_config_json",
            "TEXT NOT NULL DEFAULT '{\"posts\":false,\"likes\":true,\"saved\":true,\"reposts\":false}'",
        ),
        ("initial_import_mode", "TEXT NOT NULL DEFAULT 'new_only'"),
        ("history_limit", "INTEGER"),
        ("history_from", "TEXT"),
        (
            "rules_json",
            "TEXT NOT NULL DEFAULT '{\"ignoreDuplicates\":true,\"autoEnqueue\":true}'",
        ),
        ("interval_minutes", "INTEGER NOT NULL DEFAULT 15"),
        ("last_attempt_at", "DATETIME"),
        ("last_sync_at", "DATETIME"),
        ("last_success_at", "DATETIME"),
        ("next_sync_at", "DATETIME"),
        ("discovered_count", "INTEGER NOT NULL DEFAULT 0"),
        ("consecutive_failures", "INTEGER NOT NULL DEFAULT 0"),
        ("last_error", "TEXT"),
        ("last_sync_summary_json", "TEXT"),
        ("cover_url", "TEXT"),
        ("verified", "BOOLEAN"),
        ("following_count", "INTEGER"),
        ("followers_count", "INTEGER"),
        ("likes_count", "INTEGER"),
        ("posts_count", "INTEGER"),
        ("updated_at", "DATETIME"),
    ] {
        ensure_column(&transaction, "collection_sources", column, definition)?;
    }
    transaction.execute(
        "UPDATE collection_sources
         SET profile_url = CASE
             WHEN profile_url IS NULL OR trim(profile_url) = '' THEN
                 CASE
                     WHEN lower(url) LIKE '%/liked' THEN substr(url, 1, length(url) - length('/liked'))
                     WHEN lower(url) LIKE '%/saved' THEN substr(url, 1, length(url) - length('/saved'))
                     WHEN lower(url) LIKE '%/reposts' THEN substr(url, 1, length(url) - length('/reposts'))
                     WHEN lower(url) LIKE '%/favorite' THEN substr(url, 1, length(url) - length('/favorite'))
                     ELSE url
                 END
             ELSE profile_url
         END,
         platform = coalesce(nullif(platform, ''), 'tiktok'),
         capabilities_json = coalesce(nullif(capabilities_json, ''), '{}'),
         watch_config_json = coalesce(nullif(watch_config_json, ''), ?1),
         initial_import_mode = coalesce(nullif(initial_import_mode, ''), 'new_only'),
         rules_json = coalesce(nullif(rules_json, ''), ?2),
         status = CASE
             WHEN active = 0 THEN 'paused'
             WHEN status IS NULL OR trim(status) = '' THEN 'active'
             ELSE status
         END,
         last_sync_at = coalesce(last_sync_at, last_success_at, last_synced_at),
         updated_at = coalesce(updated_at, last_sync_at, last_success_at, last_synced_at, created_at, CURRENT_TIMESTAMP)
         WHERE profile_url IS NULL OR trim(profile_url) = ''
            OR platform IS NULL OR trim(platform) = ''
            OR capabilities_json IS NULL OR trim(capabilities_json) = ''
            OR watch_config_json IS NULL OR trim(watch_config_json) = ''
            OR initial_import_mode IS NULL OR trim(initial_import_mode) = ''
            OR rules_json IS NULL OR trim(rules_json) = ''
            OR status IS NULL OR trim(status) = ''
            OR last_sync_at IS NULL
            OR updated_at IS NULL",
        rusqlite::params![DEFAULT_SOURCE_WATCH_CONFIG, DEFAULT_SOURCE_RULES],
    )?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS collection_source_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER NOT NULL,
            canonical_url TEXT NOT NULL,
            platform_video_id TEXT,
            activity_types_json TEXT NOT NULL DEFAULT '[]',
            state TEXT NOT NULL,
            job_id INTEGER,
            reason TEXT,
            first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(source_id, canonical_url),
            FOREIGN KEY(source_id) REFERENCES collection_sources(id) ON DELETE CASCADE,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL
        )",
        [],
    )?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS collection_source_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            event_type TEXT NOT NULL,
            activity_type TEXT,
            message TEXT NOT NULL,
            canonical_url TEXT,
            job_id INTEGER,
            state TEXT,
            found_count INTEGER NOT NULL DEFAULT 0,
            queued_count INTEGER NOT NULL DEFAULT 0,
            duplicate_count INTEGER NOT NULL DEFAULT 0,
            ignored_count INTEGER NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(source_id) REFERENCES collection_sources(id) ON DELETE CASCADE,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL
        )",
        [],
    )?;
    transaction.execute(
        "UPDATE collection_sources
         SET source_type = CASE
             WHEN lower(source_type) IN ('collection', 'profile') THEN lower(source_type)
             WHEN lower(url) LIKE '%/collection/%' OR lower(url) LIKE '%/tag/%' THEN 'collection'
             ELSE 'profile'
         END
         WHERE lower(source_type) NOT IN ('collection', 'profile')",
        [],
    )?;

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS health_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            component TEXT NOT NULL,
            severity TEXT NOT NULL,
            diagnosis TEXT NOT NULL,
            action TEXT,
            result TEXT
        )",
        [],
    )?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS profile_channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_source_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'idle',
            discovered_count INTEGER NOT NULL DEFAULT 0,
            last_discovery_at DATETIME,
            last_successful_discovery_at DATETIME,
            cursor TEXT,
            newest_known_content_id TEXT,
            oldest_known_content_id TEXT,
            error_code TEXT,
            error_message TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(profile_source_id, kind),
            FOREIGN KEY(profile_source_id) REFERENCES collection_sources(id) ON DELETE CASCADE
        )",
        [],
    )?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS content_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL DEFAULT 'tiktok',
            platform_content_id TEXT NOT NULL,
            canonical_url TEXT NOT NULL,
            author_id TEXT,
            author_handle TEXT,
            title TEXT,
            published_at DATETIME,
            discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            availability TEXT NOT NULL DEFAULT 'available',
            job_id INTEGER,
            UNIQUE(platform, platform_content_id),
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL
        )",
        [],
    )?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS content_relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_id INTEGER NOT NULL,
            profile_source_id INTEGER NOT NULL,
            channel_kind TEXT NOT NULL,
            first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            active BOOLEAN NOT NULL DEFAULT 1,
            provenance_json TEXT,
            sync_run_id TEXT,
            UNIQUE(profile_source_id, channel_kind, content_id),
            FOREIGN KEY(content_id) REFERENCES content_items(id) ON DELETE CASCADE,
            FOREIGN KEY(profile_source_id) REFERENCES collection_sources(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // v10 makes playlist memberships point to canonical content identities.
    // Source-channel relationships are backfilled into the same content graph;
    // collection_source_items remains the discovery/audit ledger.
    ensure_content_items_for_jobs(&transaction)?;
    backfill_transcript_search_units(&transaction)?;
    migrate_legacy_search_embeddings(&transaction)?;
    migrate_legacy_source_items(&transaction)?;
    migrate_playlist_memberships(&transaction)?;
    transaction.execute(
        "UPDATE playlists
         SET kind = CASE
             WHEN auto_generated = 1 THEN 'legacy_auto'
             WHEN kind IS NULL OR trim(kind) = '' THEN 'manual'
             ELSE kind
         END,
         sort_mode = CASE
             WHEN sort_mode IS NULL OR trim(sort_mode) = '' THEN 'manual'
             ELSE sort_mode
         END,
         updated_at = coalesce(updated_at, created_at, CURRENT_TIMESTAMP)",
        [],
    )?;
    for index in [
        "CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)",
        "CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_jobs_url ON jobs(url)",
        "CREATE INDEX IF NOT EXISTS idx_jobs_canonical_url ON jobs(canonical_url)",
        "CREATE INDEX IF NOT EXISTS idx_segments_job_id ON transcript_segments(job_id, segment_index)",
        "CREATE INDEX IF NOT EXISTS idx_embeddings_job_id ON transcript_embeddings(job_id, chunk_index)",
        "CREATE INDEX IF NOT EXISTS idx_search_units_job ON search_units(job_id, representation, ordinal)",
        "CREATE INDEX IF NOT EXISTS idx_search_embeddings_provider ON search_embeddings(provider_id, model_version, search_unit_id)",
        "CREATE INDEX IF NOT EXISTS idx_annotations_job ON content_annotations(job_id, annotation_type, normalized_value)",
        "CREATE INDEX IF NOT EXISTS idx_enrichment_status ON search_enrichment_status(stage, status, updated_at)",
        "CREATE INDEX IF NOT EXISTS idx_media_job_id ON media(job_id)",
        "CREATE INDEX IF NOT EXISTS idx_media_source_state ON media(source_state, keep_status)",
        "CREATE INDEX IF NOT EXISTS idx_media_access ON media(last_accessed_at, downloaded_at)",
        "CREATE INDEX IF NOT EXISTS idx_media_artifacts_job_id ON media_artifacts(job_id, kind)",
        "CREATE INDEX IF NOT EXISTS idx_purge_history_job_id ON purge_history(job_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_playlist_items_content_id ON playlist_items(content_id)",
        "CREATE INDEX IF NOT EXISTS idx_collection_sources_due ON collection_sources(active, next_sync_at)",
        "CREATE INDEX IF NOT EXISTS idx_collection_sources_profile_url ON collection_sources(profile_url)",
        "CREATE INDEX IF NOT EXISTS idx_collection_source_items_source ON collection_source_items(source_id, last_seen_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_collection_source_items_url ON collection_source_items(canonical_url)",
        "CREATE INDEX IF NOT EXISTS idx_collection_source_activity_source ON collection_source_activity(source_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_health_events_created_at ON health_events(created_at DESC)",
                "CREATE INDEX IF NOT EXISTS idx_job_activity_job_id ON job_activity_events(job_id, id ASC)",
        "CREATE INDEX IF NOT EXISTS idx_content_platform_id ON content_items(platform, platform_content_id)",
        "CREATE INDEX IF NOT EXISTS idx_content_canonical_url ON content_items(canonical_url)",
        "CREATE INDEX IF NOT EXISTS idx_content_rel_profile_channel ON content_relationships(profile_source_id, channel_kind)",
        "CREATE INDEX IF NOT EXISTS idx_content_rel_content ON content_relationships(content_id)",
        "CREATE INDEX IF NOT EXISTS idx_profile_channels ON profile_channels(profile_source_id, kind)",
    ] {
        transaction.execute(index, [])?;
    }
    transaction.execute(
        "UPDATE collection_sources
         SET last_success_at = last_synced_at
         WHERE last_success_at IS NULL AND last_synced_at IS NOT NULL",
        [],
    )?;

    // Preserve every historical job while making future canonical URLs
    // unique. Duplicates from older versions keep their original URL and
    // metadata; only the derived key is cleared from all but the oldest row.
    transaction.execute(
        "UPDATE jobs
         SET canonical_url = NULL
         WHERE canonical_url IS NOT NULL
           AND canonical_url <> ''
           AND id NOT IN (
               SELECT MIN(id)
               FROM jobs
               WHERE canonical_url IS NOT NULL AND canonical_url <> ''
               GROUP BY canonical_url
           )",
        [],
    )?;
    transaction.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_jobs_canonical_url
         ON jobs(canonical_url)
         WHERE canonical_url IS NOT NULL AND canonical_url <> ''",
        [],
    )?;

    transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    transaction.commit()?;
    if let Some(path) = migration_backup {
        insert_health_event(
            &conn,
            "database",
            "info",
            "Base de datos respaldada antes de la migración",
            Some("backup"),
            Some(&path.to_string_lossy()),
        )?;
    }
    prune_health_events(&conn, 500)?;

    Ok(conn)
}

fn job_record_from_row(row: &Row<'_>) -> rusqlite::Result<JobRecord> {
    let retry_count = row.get::<_, i64>(4)?;
    let retry_count = u32::try_from(retry_count).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            4,
            rusqlite::types::Type::Integer,
            Box::new(error),
        )
    })?;
    let optional_u64 = |index: usize| -> rusqlite::Result<Option<u64>> {
        row.get::<_, Option<i64>>(index)?.map_or(Ok(None), |value| {
            u64::try_from(value).map(Some).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    index,
                    rusqlite::types::Type::Integer,
                    Box::new(error),
                )
            })
        })
    };
    let nonnegative_u64 =
        |index: usize| -> rusqlite::Result<u64> { Ok(optional_u64(index)?.unwrap_or_default()) };
    Ok(JobRecord {
        id: row.get(0)?,
        url: row.get(1)?,
        status: row.get(2)?,
        progress: row.get(3)?,
        retry_count,
        created_at: row.get(5)?,
        error_message: row.get(6)?,
        title: row.get(7)?,
        author: row.get(8)?,
        thumbnail: row.get(9)?,
        duration: row.get(10)?,
        video_path: row.get(11)?,
        keep_status: row.get(12)?,
        platform: row.get(13)?,
        visual_analysis: row.get(14)?,
        instructional_guide: row.get(15)?,
        audio_path: row.get(16)?,
        transcript_path: row.get(17)?,
        video_bytes: optional_u64(18)?,
        audio_bytes: optional_u64(19)?,
        downloaded_at: row.get(20)?,
        last_accessed_at: row.get(21)?,
        play_count: nonnegative_u64(22)?,
        open_count: nonnegative_u64(23)?,
        search_hit_count: nonnegative_u64(24)?,
        favorite: row.get::<_, Option<i64>>(25)?.unwrap_or_default() != 0,
        pinned: row.get::<_, Option<i64>>(26)?.unwrap_or_default() != 0,
        source_state: row
            .get::<_, Option<String>>(27)?
            .unwrap_or_else(|| "local".to_string()),
        purged_at: row.get(28)?,
        purged_reason: row.get(29)?,
        poster_path: row.get(30)?,
    })
}

const JOB_SELECT_COLUMNS: &str = "j.id, j.url, j.status, j.progress, j.retry_count, j.created_at,
    j.error_message, m.title, m.author, m.thumbnail, m.duration, m.video_path,
    m.keep_status, m.platform, m.visual_analysis, m.instructional_guide,
    m.audio_path, m.transcript_path, m.video_bytes, m.audio_bytes, m.downloaded_at,
    m.last_accessed_at, m.play_count, m.open_count, m.search_hit_count, m.favorite,
    m.pinned, m.source_state, m.purged_at, m.purged_reason, m.poster_path";

fn require_rows_changed(rows: usize) -> Result<()> {
    if rows == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

pub fn insert_job(conn: &Connection, url: &str) -> Result<i64> {
    let canonical_url = crate::url_utils::canonicalize_tiktok_url(url);
    if let Some(existing_id) = conn
        .query_row(
            "SELECT id FROM jobs WHERE canonical_url = ?1 ORDER BY id ASC LIMIT 1",
            params![canonical_url],
            |row| row.get(0),
        )
        .optional()?
    {
        let _ = ensure_content_item_for_job(conn, existing_id, url, &canonical_url)?;
        return Ok(existing_id);
    }

    match conn.execute(
        "INSERT INTO jobs (url, canonical_url, status, progress, retry_count)
         VALUES (?1, ?2, 'queued', 0, 0)",
        params![url, canonical_url],
    ) {
        Ok(_) => {
            let job_id = conn.last_insert_rowid();
            let _ = ensure_content_item_for_job(conn, job_id, url, &canonical_url)?;
            append_job_activity_event(conn, job_id, "queued", 0, None, None, None)?;
            Ok(job_id)
        }
        Err(error) => {
            // The unique partial index is the final race-safety boundary for
            // callers in different processes. If another writer won between
            // the lookup and INSERT, return its job instead of surfacing a
            // duplicate-ingestion error.
            if let Some(existing_id) = conn
                .query_row(
                    "SELECT id FROM jobs WHERE canonical_url = ?1 ORDER BY id ASC LIMIT 1",
                    params![canonical_url],
                    |row| row.get(0),
                )
                .optional()?
            {
                let _ = ensure_content_item_for_job(conn, existing_id, url, &canonical_url)?;
                Ok(existing_id)
            } else {
                Err(error)
            }
        }
    }
}

pub fn get_all_jobs(conn: &Connection) -> Result<Vec<JobRecord>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM jobs j
         LEFT JOIN media m ON j.id = m.job_id
         ORDER BY j.id DESC",
        JOB_SELECT_COLUMNS
    ))?;

    let job_iter = stmt.query_map([], job_record_from_row)?;

    let mut jobs = Vec::new();
    for job in job_iter {
        jobs.push(job?);
    }
    Ok(jobs)
}

pub fn update_job_status(conn: &Connection, id: i64, status: &str, progress: i32) -> Result<()> {
    let previous_status = conn
        .query_row(
            "SELECT status FROM jobs WHERE id = ?1",
            params![id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let rows = conn.execute(
        "UPDATE jobs SET status = ?1, progress = ?2,
            error_message = CASE WHEN ?1 IN ('error', 'error_dlq') THEN error_message ELSE NULL END
         WHERE id = ?3",
        params![status, progress, id],
    )?;
    require_rows_changed(rows)?;
    if previous_status.as_deref() != Some(status) {
        append_job_activity_event(conn, id, status, progress, None, None, None)?;
    }
    Ok(())
}

pub fn update_job_retrying(conn: &Connection, id: i64, attempt: u32) -> Result<()> {
    let rows = conn.execute(
        "UPDATE jobs SET status = 'retrying', progress = 0, retry_count = ?1, error_message = NULL WHERE id = ?2",
        params![attempt, id],
    )?;
    require_rows_changed(rows)?;
    append_job_activity_event(conn, id, "retrying", 0, None, None, None)
}

pub fn reset_job_for_retry(conn: &Connection, id: i64) -> Result<()> {
    let rows = conn.execute(
        "UPDATE jobs SET status = 'queued', progress = 0, retry_count = 0, error_message = NULL WHERE id = ?1",
        params![id],
    )?;
    require_rows_changed(rows)?;
    append_job_activity_event(conn, id, "queued", 0, None, None, None)
}

pub fn set_media_keep_status(conn: &Connection, job_id: i64, status: &str) -> Result<()> {
    let rows = conn.execute(
        "UPDATE media SET keep_status = ?1 WHERE job_id = ?2",
        params![status, job_id],
    )?;
    require_rows_changed(rows)
}

#[allow(dead_code)]
pub fn get_media_keep_status(conn: &Connection, job_id: i64) -> Result<Option<String>> {
    conn.query_row(
        "SELECT keep_status FROM media WHERE job_id = ?1",
        params![job_id],
        |row| row.get(0),
    )
    .optional()
}

pub fn insert_or_update_media_metadata(
    conn: &Connection,
    job_id: i64,
    metadata: &MediaMetadata<'_>,
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
            video_path = COALESCE(NULLIF(excluded.video_path, ''), media.video_path),
            audio_path = COALESCE(NULLIF(excluded.audio_path, ''), media.audio_path),
            transcript_path = COALESCE(NULLIF(excluded.transcript_path, ''), media.transcript_path),
            platform = COALESCE(NULLIF(excluded.platform, ''), media.platform)",
        params![
            job_id,
            metadata.title,
            metadata.author,
            metadata.thumbnail,
            metadata.duration,
            metadata.upload_date,
            metadata.video_path,
            metadata.audio_path,
            metadata.transcript_path,
            metadata.platform
        ],
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
    let metadata = MediaMetadata {
        title,
        author,
        thumbnail: "",
        duration,
        upload_date,
        video_path: "",
        audio_path: "",
        transcript_path: "",
        platform,
    };
    insert_or_update_media_metadata(conn, job_id, &metadata)
}

pub fn insert_transcript_chunk(
    conn: &Connection,
    job_id: i64,
    chunk_index: i64,
    chunk_text: &str,
    embedding: &[f32],
) -> Result<()> {
    let blob = serialize_embedding(embedding)?;
    conn.execute(
        "INSERT INTO transcript_embeddings (job_id, chunk_index, chunk_text, embedding_vector)
         VALUES (?1, ?2, ?3, ?4)",
        params![job_id, chunk_index, chunk_text, blob],
    )?;
    Ok(())
}

pub fn get_all_embedding_rows(conn: &Connection) -> Result<Vec<(i64, i64, Vec<f32>)>> {
    let mut statement = conn.prepare(
        "SELECT job_id, chunk_index, embedding_vector
         FROM transcript_embeddings
         ORDER BY job_id ASC, chunk_index ASC",
    )?;
    let rows = statement.query_map([], |row| {
        let job_id = row.get(0)?;
        let chunk_index = row.get(1)?;
        let blob: Vec<u8> = row.get(2)?;
        let embedding = deserialize_embedding(&blob, 2)?;
        Ok((job_id, chunk_index, embedding))
    })?;
    rows.collect()
}

/// Replaces only the derived embedding rows for a job in one transaction.
///
/// Transcript segments are source data and must survive an embedding rebuild.
/// Keeping the delete and inserts atomic also prevents a failed rebuild from
/// leaving the search index partially populated.
pub fn replace_transcript_embeddings(
    conn: &mut Connection,
    job_id: i64,
    chunks: &[(i64, String, Vec<f32>)],
) -> Result<()> {
    let transaction = conn.transaction()?;
    transaction.execute(
        "DELETE FROM transcript_embeddings WHERE job_id = ?1",
        params![job_id],
    )?;

    for (chunk_index, chunk_text, embedding) in chunks {
        let blob = serialize_embedding(embedding)?;
        transaction.execute(
            "INSERT INTO transcript_embeddings (job_id, chunk_index, chunk_text, embedding_vector)
             VALUES (?1, ?2, ?3, ?4)",
            params![job_id, chunk_index, chunk_text, blob],
        )?;
    }

    transaction.commit()
}

#[derive(Debug, Clone)]
pub struct SearchUnitInput {
    pub ordinal: i64,
    pub text: String,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    pub representation: SearchRepresentation,
    pub language: Option<String>,
    pub artifact_id: Option<i64>,
    pub provenance_json: Option<String>,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone)]
pub struct SearchUnitRecord {
    pub id: i64,
    pub job_id: i64,
    pub content_id: Option<i64>,
    pub ordinal: i64,
    pub text: String,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    pub representation: SearchRepresentation,
    pub confidence: Option<f32>,
    pub match_thumbnail: Option<String>,
    pub title: Option<String>,
    pub author: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SearchUnitHit {
    pub unit: SearchUnitRecord,
    pub score: f32,
}

#[derive(Debug, Clone)]
pub struct MetadataSearchHit {
    pub job_id: i64,
    pub content_id: Option<i64>,
    pub title: Option<String>,
    pub author: Option<String>,
    pub thumbnail: Option<String>,
    pub score: f32,
}

fn insert_search_unit_tx(
    transaction: &Transaction<'_>,
    job_id: i64,
    content_id: Option<i64>,
    representation: SearchRepresentation,
    ordinal: i64,
    text: &str,
    start_time: Option<f64>,
    end_time: Option<f64>,
    artifact_id: Option<i64>,
    provenance_json: Option<&str>,
    confidence: Option<f32>,
) -> Result<i64> {
    let source_hash = format!("{:x}", Sha256::digest(text.as_bytes()));
    transaction.execute(
        "INSERT OR IGNORE INTO search_units
            (job_id, content_id, representation, ordinal, text, start_time, end_time,
             language, artifact_id, provenance_json, confidence, source_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9, ?10, ?11)",
        params![
            job_id,
            content_id,
            representation.as_str(),
            ordinal,
            text,
            start_time,
            end_time,
            artifact_id,
            provenance_json,
            confidence,
            source_hash,
        ],
    )?;
    let unit_id: i64 = transaction.query_row(
        "SELECT id FROM search_units
         WHERE job_id = ?1 AND representation = ?2 AND ordinal = ?3",
        params![job_id, representation.as_str(), ordinal],
        |row| row.get(0),
    )?;
    let _ = transaction.execute(
        "INSERT OR IGNORE INTO search_units_fts(rowid, text, representation, job_id)
         VALUES (?1, ?2, ?3, ?4)",
        params![unit_id, text, representation.as_str(), job_id],
    );
    Ok(unit_id)
}

fn mark_search_stage_tx(
    transaction: &Transaction<'_>,
    job_id: i64,
    stage: &str,
    status: &str,
    version: &str,
    error_message: Option<&str>,
) -> Result<()> {
    transaction.execute(
        "INSERT INTO search_enrichment_status(job_id, stage, status, version, error_message, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
         ON CONFLICT(job_id, stage) DO UPDATE SET
             status = excluded.status,
             version = excluded.version,
             error_message = excluded.error_message,
             updated_at = CURRENT_TIMESTAMP",
        params![job_id, stage, status, version, error_message],
    )?;
    Ok(())
}

/// Backfill transcript-derived units for databases created before the unified
/// search layer. It never touches transcript_segments or media and is safe to
/// run again after an interrupted migration.
fn backfill_transcript_search_units(transaction: &Transaction<'_>) -> Result<()> {
    let job_ids = {
        let mut statement = transaction.prepare(
            "SELECT DISTINCT ts.job_id
             FROM transcript_segments ts
             WHERE NOT EXISTS (
                 SELECT 1 FROM search_units su
                 WHERE su.job_id = ts.job_id AND su.representation = 'transcript'
             )
             ORDER BY ts.job_id",
        )?;
        let rows = statement.query_map([], |row| row.get::<_, i64>(0))?;
        rows.collect::<Result<Vec<_>>>()?
    };

    for job_id in job_ids {
        let segments = {
            let mut statement = transaction.prepare(
                "SELECT segment_index, text, start_time, end_time
                 FROM transcript_segments
                 WHERE job_id = ?1
                 ORDER BY segment_index",
            )?;
            let rows = statement.query_map(params![job_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, f64>(3)?,
                ))
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };
        let content_id: Option<i64> = transaction
            .query_row(
                "SELECT id FROM content_items WHERE job_id = ?1 ORDER BY id DESC LIMIT 1",
                params![job_id],
                |row| row.get(0),
            )
            .optional()?;
        let words = segments
            .iter()
            .flat_map(|(_, text, start, end)| {
                text.split_whitespace()
                    .map(move |word| (word.to_string(), *start, *end))
            })
            .collect::<Vec<_>>();
        let max_tokens = 180usize;
        let overlap = 27usize;
        let step = max_tokens - overlap;
        let mut offset = 0usize;
        let mut ordinal = 0i64;
        while offset < words.len() {
            let end = (offset + max_tokens).min(words.len());
            let slice = &words[offset..end];
            let text = slice
                .iter()
                .map(|(word, _, _)| word.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            let start_time = slice.first().map(|(_, start, _)| *start);
            let end_time = slice.last().map(|(_, _, end)| *end);
            insert_search_unit_tx(
                transaction,
                job_id,
                content_id,
                SearchRepresentation::Transcript,
                ordinal,
                &text,
                start_time,
                end_time,
                None,
                Some(r#"{"source":"whisper","backfill":true}"#),
                None,
            )?;
            ordinal += 1;
            if end == words.len() {
                break;
            }
            offset = (offset + step).min(end);
        }
        insert_metadata_search_units_tx(transaction, job_id)?;
        derive_content_annotations_tx(transaction, job_id)?;
        mark_search_stage_tx(
            transaction,
            job_id,
            "transcript",
            "ready",
            "search-units-v1",
            None,
        )?;
    }

    Ok(())
}

fn insert_metadata_search_units_tx(transaction: &Transaction<'_>, job_id: i64) -> Result<()> {
    let values = transaction
        .query_row(
            "SELECT m.title, m.author, j.url
             FROM jobs j LEFT JOIN media m ON m.job_id = j.id
             WHERE j.id = ?1",
            params![job_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()?;
    let Some((title, author, url)) = values else {
        return Ok(());
    };
    for (ordinal, value) in [
        (1_000_000_i64, title),
        (1_000_001_i64, author),
        (1_000_002_i64, url),
    ] {
        let Some(value) = value.filter(|value| !value.trim().is_empty()) else {
            continue;
        };
        let content_id: Option<i64> = transaction
            .query_row(
                "SELECT id FROM content_items WHERE job_id = ?1 ORDER BY id DESC LIMIT 1",
                params![job_id],
                |row| row.get(0),
            )
            .optional()?;
        insert_search_unit_tx(
            transaction,
            job_id,
            content_id,
            SearchRepresentation::Metadata,
            ordinal,
            &value,
            None,
            None,
            None,
            Some(r#"{"source":"media"}"#),
            None,
        )?;
    }
    Ok(())
}

fn derive_content_annotations_tx(transaction: &Transaction<'_>, job_id: i64) -> Result<()> {
    transaction.execute(
        "DELETE FROM content_annotations
         WHERE job_id = ?1 AND source = 'deterministic-search-v1'",
        params![job_id],
    )?;
    let corpus = {
        let mut statement = transaction.prepare(
            "SELECT id, text FROM search_units
             WHERE job_id = ?1
             ORDER BY id",
        )?;
        let rows = statement.query_map(params![job_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?;
        rows.collect::<Result<Vec<_>>>()?
    };
    let content_id: Option<i64> = transaction
        .query_row(
            "SELECT id FROM content_items WHERE job_id = ?1 ORDER BY id DESC LIMIT 1",
            params![job_id],
            |row| row.get(0),
        )
        .optional()?;
    let categories = [
        (
            "recipe",
            "Recipe",
            ["receta", "recetas", "recipe", "recipes"].as_slice(),
        ),
        (
            "tutorial",
            "Tutorial",
            ["tutorial", "tutoriales", "how to"].as_slice(),
        ),
        (
            "review",
            "Review",
            ["review", "reseña", "reseñas"].as_slice(),
        ),
        ("travel", "Travel", ["viaje", "viajes", "travel"].as_slice()),
        (
            "educational",
            "Educational",
            ["educativo", "educativa", "educational"].as_slice(),
        ),
    ];
    for (normalized, display, needles) in categories {
        let Some((evidence_unit_id, _)) = corpus.iter().find(|(_, text)| {
            let lower = text.to_lowercase();
            needles.iter().any(|needle| lower.contains(needle))
        }) else {
            continue;
        };
        transaction.execute(
            "INSERT OR IGNORE INTO content_annotations
                (job_id, content_id, annotation_type, normalized_value, display_value,
                 confidence, source, evidence_unit_id)
             VALUES (?1, ?2, 'category', ?3, ?4, 0.70, 'deterministic-search-v1', ?5)",
            params![job_id, content_id, normalized, display, evidence_unit_id],
        )?;
    }
    Ok(())
}

/// Normalize OCR emitted by the optional visual analyzer into the same
/// replaceable search-unit layer. Keyframes remain durable artifacts and are
/// linked by artifact_id whenever the worker supplied their path.
pub fn index_visual_search_units(
    conn: &mut Connection,
    job_id: i64,
    visual_analysis: Option<&str>,
) -> Result<usize> {
    let transaction = conn.transaction()?;
    let old_ids = {
        let mut statement = transaction
            .prepare("SELECT id FROM search_units WHERE job_id = ?1 AND representation = 'ocr'")?;
        let rows = statement.query_map(params![job_id], |row| row.get::<_, i64>(0))?;
        rows.collect::<Result<Vec<_>>>()?
    };
    for unit_id in old_ids {
        let _ = transaction.execute(
            "DELETE FROM search_units_fts WHERE rowid = ?1",
            params![unit_id],
        );
    }
    transaction.execute(
        "DELETE FROM search_units WHERE job_id = ?1 AND representation = 'ocr'",
        params![job_id],
    )?;

    let Some(raw) = visual_analysis else {
        mark_search_stage_tx(
            &transaction,
            job_id,
            "ocr",
            "unsupported",
            "visual-analysis-v2",
            None,
        )?;
        transaction.commit()?;
        return Ok(0);
    };
    let parsed = match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(value) => value,
        Err(error) => {
            mark_search_stage_tx(
                &transaction,
                job_id,
                "ocr",
                "failed",
                "visual-analysis-v2",
                Some("visual_analysis JSON inválido"),
            )?;
            transaction.commit()?;
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(error)));
        }
    };
    let ocr_available = parsed
        .get("ocr_available")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let content_id: Option<i64> = transaction
        .query_row(
            "SELECT id FROM content_items WHERE job_id = ?1 ORDER BY id DESC LIMIT 1",
            params![job_id],
            |row| row.get(0),
        )
        .optional()?;
    let mut indexed = 0usize;
    if let Some(frames) = parsed.get("frames").and_then(serde_json::Value::as_array) {
        for (index, frame) in frames.iter().enumerate() {
            let Some(text) = frame
                .get("ocr_text")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                continue;
            };
            let Some(timestamp) = frame.get("timestamp").and_then(serde_json::Value::as_f64) else {
                continue;
            };
            let artifact_id = frame
                .get("artifact_path")
                .and_then(serde_json::Value::as_str)
                .and_then(|path| {
                    transaction
                        .query_row(
                            "SELECT id FROM media_artifacts WHERE job_id = ?1 AND path = ?2 LIMIT 1",
                            params![job_id, path],
                            |row| row.get(0),
                        )
                        .optional()
                        .ok()
                        .flatten()
                })
                .or_else(|| {
                    transaction
                        .query_row(
                            "SELECT id FROM media_artifacts
                             WHERE job_id = ?1 AND kind = 'keyframe'
                             ORDER BY ABS(COALESCE(timestamp, 0) - ?2), id
                             LIMIT 1",
                            params![job_id, timestamp],
                            |row| row.get(0),
                        )
                        .optional()
                        .ok()
                        .flatten()
                });
            let provenance = serde_json::json!({
                "source": "visual_analyzer",
                "timestamp": timestamp,
                "artifact_path": frame.get("artifact_path").and_then(serde_json::Value::as_str),
            })
            .to_string();
            insert_search_unit_tx(
                &transaction,
                job_id,
                content_id,
                SearchRepresentation::Ocr,
                2_000_000 + index as i64,
                text,
                Some(timestamp),
                Some(timestamp),
                artifact_id,
                Some(&provenance),
                Some(0.85),
            )?;
            indexed += 1;
        }
    }
    derive_content_annotations_tx(&transaction, job_id)?;
    mark_search_stage_tx(
        &transaction,
        job_id,
        "ocr",
        if ocr_available {
            "ready"
        } else {
            "unsupported"
        },
        "visual-analysis-v2",
        None,
    )?;
    transaction.commit()?;
    Ok(indexed)
}

fn migrate_legacy_search_embeddings(transaction: &Transaction<'_>) -> Result<()> {
    transaction.execute(
        "INSERT OR IGNORE INTO search_embeddings
            (search_unit_id, provider_id, model_version, dimensions, vector_blob)
         SELECT su.id, 'onnx', ?1, ?2, te.embedding_vector
         FROM transcript_embeddings te
         JOIN search_units su
           ON su.job_id = te.job_id
          AND su.ordinal = te.chunk_index
          AND su.representation = 'transcript'
         WHERE length(te.embedding_vector) = ?3",
        params![
            EMBEDDING_MODEL_ID,
            EMBEDDING_DIMS as i64,
            EMBEDDING_BYTES as i64
        ],
    )?;
    Ok(())
}

fn serialize_search_vector(vector: &[f32]) -> Result<Vec<u8>> {
    if vector.is_empty() || vector.iter().any(|value| !value.is_finite()) {
        return Err(rusqlite::Error::InvalidParameterName(
            "search vector must contain finite values".to_string(),
        ));
    }
    let mut blob = Vec::with_capacity(vector.len() * std::mem::size_of::<f32>());
    for &value in vector {
        blob.extend_from_slice(&value.to_ne_bytes());
    }
    Ok(blob)
}

/// Replace the derived search units for one job atomically. The source
/// transcript and media remain untouched, so changing an embedding provider
/// never requires re-downloading or re-transcribing the video.
pub fn replace_search_units_with_embeddings(
    conn: &mut Connection,
    job_id: i64,
    units: &[SearchUnitInput],
    embeddings: &[Vec<f32>],
    provider_id: &str,
    model_version: &str,
) -> Result<usize> {
    if units.len() != embeddings.len() {
        return Err(rusqlite::Error::InvalidParameterName(
            "search units and embeddings must have the same length".to_string(),
        ));
    }

    let transaction = conn.transaction()?;
    let old_ids = {
        let mut statement = transaction.prepare("SELECT id FROM search_units WHERE job_id = ?1")?;
        let rows = statement.query_map(params![job_id], |row| row.get::<_, i64>(0))?;
        rows.collect::<Result<Vec<_>>>()?
    };
    for unit_id in old_ids {
        let _ = transaction.execute(
            "DELETE FROM search_units_fts WHERE rowid = ?1",
            params![unit_id],
        );
    }
    transaction.execute(
        "DELETE FROM search_embeddings WHERE search_unit_id IN (SELECT id FROM search_units WHERE job_id = ?1)",
        params![job_id],
    )?;
    transaction.execute(
        "DELETE FROM search_units WHERE job_id = ?1",
        params![job_id],
    )?;

    for (input, embedding) in units.iter().zip(embeddings) {
        let content_id: Option<i64> = transaction
            .query_row(
                "SELECT id FROM content_items WHERE job_id = ?1 ORDER BY id DESC LIMIT 1",
                params![job_id],
                |row| row.get(0),
            )
            .optional()?;
        let source_hash = format!("{:x}", Sha256::digest(input.text.as_bytes()));
        transaction.execute(
            "INSERT INTO search_units
                (job_id, content_id, representation, ordinal, text, start_time, end_time,
                 language, artifact_id, provenance_json, confidence, source_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                job_id,
                content_id,
                input.representation.as_str(),
                input.ordinal,
                input.text,
                input.start_time,
                input.end_time,
                input.language,
                input.artifact_id,
                input.provenance_json,
                input.confidence,
                source_hash,
            ],
        )?;
        let unit_id = transaction.last_insert_rowid();
        let vector_blob = serialize_search_vector(embedding)?;
        transaction.execute(
            "INSERT INTO search_embeddings
                (search_unit_id, provider_id, model_version, dimensions, vector_blob)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                unit_id,
                provider_id,
                model_version,
                embedding.len() as i64,
                vector_blob
            ],
        )?;
        let _ = transaction.execute(
            "INSERT INTO search_units_fts(rowid, text, representation, job_id)
             VALUES (?1, ?2, ?3, ?4)",
            params![unit_id, input.text, input.representation.as_str(), job_id],
        );
    }

    insert_metadata_search_units_tx(&transaction, job_id)?;
    derive_content_annotations_tx(&transaction, job_id)?;
    mark_search_stage_tx(
        &transaction,
        job_id,
        "transcript",
        "ready",
        "search-units-v1",
        None,
    )?;

    transaction.commit()?;
    Ok(units.len())
}

fn search_unit_from_row(row: &Row<'_>) -> Result<SearchUnitRecord> {
    let representation_value: String = row.get(7)?;
    let representation = representation_value
        .parse::<SearchRepresentation>()
        .unwrap_or(SearchRepresentation::Transcript);
    Ok(SearchUnitRecord {
        id: row.get(0)?,
        job_id: row.get(1)?,
        content_id: row.get(2)?,
        ordinal: row.get(3)?,
        text: row.get(4)?,
        start_time: row.get(5)?,
        end_time: row.get(6)?,
        representation,
        confidence: row.get(8)?,
        match_thumbnail: row.get(9)?,
        title: row.get(10)?,
        author: row.get(11)?,
    })
}

pub fn get_search_unit(conn: &Connection, job_id: i64, ordinal: i64) -> Option<SearchUnitRecord> {
    let mut statement = conn
        .prepare(
            "SELECT su.id, su.job_id, su.content_id, su.ordinal, su.text,
                    su.start_time, su.end_time, su.representation, su.confidence,
                    COALESCE(artifact.path, m.poster_path, m.thumbnail),
                    m.title, m.author
             FROM search_units su
             LEFT JOIN media m ON m.job_id = su.job_id
             LEFT JOIN media_artifacts artifact ON artifact.id = su.artifact_id
             WHERE su.job_id = ?1 AND su.ordinal = ?2
             ORDER BY su.id DESC
             LIMIT 1",
        )
        .ok()?;
    statement
        .query_row(params![job_id, ordinal], search_unit_from_row)
        .ok()
}

pub fn search_search_units(
    conn: &Connection,
    query: &str,
    limit: usize,
    exact: bool,
) -> Result<Vec<SearchUnitHit>> {
    let normalized = query.trim();
    if normalized.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }
    let fts_query = if exact {
        format!("\"{}\"", normalized.replace('"', " "))
    } else {
        normalized
            .split_whitespace()
            .map(|term| format!("\"{}\"", term.replace('"', " ")))
            .collect::<Vec<_>>()
            .join(" AND ")
    };

    let fts_result = (|| -> Result<Vec<SearchUnitHit>> {
        let mut statement = conn.prepare(
            "SELECT su.id, su.job_id, su.content_id, su.ordinal, su.text,
                    su.start_time, su.end_time, su.representation, su.confidence,
                    COALESCE(artifact.path, m.poster_path, m.thumbnail),
                    m.title, m.author, bm25(search_units_fts) AS rank_score
             FROM search_units_fts
             JOIN search_units su ON su.id = search_units_fts.rowid
             LEFT JOIN media m ON m.job_id = su.job_id
             LEFT JOIN media_artifacts artifact ON artifact.id = su.artifact_id
             WHERE search_units_fts MATCH ?1
             ORDER BY rank_score ASC
             LIMIT ?2",
        )?;
        let rows = statement.query_map(params![fts_query, limit as i64], |row| {
            let unit = search_unit_from_row(row)?;
            let raw_score: f64 = row.get(12)?;
            Ok(SearchUnitHit {
                unit,
                score: (1.0 / (1.0 + raw_score.abs())) as f32,
            })
        })?;
        rows.collect()
    })();
    match fts_result {
        Ok(results) if !results.is_empty() => Ok(results),
        Ok(_) | Err(_) => {
            let pattern = format!("%{}%", normalized.replace('%', "\\%").replace('_', "\\_"));
            let mut statement = conn.prepare(
                "SELECT su.id, su.job_id, su.content_id, su.ordinal, su.text,
                        su.start_time, su.end_time, su.representation, su.confidence,
                        COALESCE(artifact.path, m.poster_path, m.thumbnail),
                        m.title, m.author
                 FROM search_units su
                 LEFT JOIN media m ON m.job_id = su.job_id
                 LEFT JOIN media_artifacts artifact ON artifact.id = su.artifact_id
                 WHERE su.text LIKE ?1 ESCAPE '\\'
                 ORDER BY su.job_id ASC, su.ordinal ASC
                 LIMIT ?2",
            )?;
            let rows = statement.query_map(params![pattern, limit as i64], |row| {
                Ok(SearchUnitHit {
                    unit: search_unit_from_row(row)?,
                    score: 1.0,
                })
            })?;
            rows.collect()
        }
    }
}

fn ensure_content_item_for_job(
    conn: &Connection,
    job_id: i64,
    url: &str,
    canonical_url: &str,
) -> Result<i64> {
    let effective_url = if canonical_url.trim().is_empty() {
        crate::url_utils::canonicalize_tiktok_url(url)
    } else {
        canonical_url.to_string()
    };
    let effective_url = if effective_url.trim().is_empty() {
        url.to_string()
    } else {
        effective_url
    };
    let platform = content_platform_for_url(&effective_url);
    let platform_content_id = content_identity_for_url(&effective_url, job_id);
    let (content_id, _) = upsert_content_item(
        conn,
        platform,
        &platform_content_id,
        &effective_url,
        None,
        None,
        None,
        None,
        Some(job_id),
    )?;
    Ok(content_id)
}

pub fn search_metadata(
    conn: &Connection,
    query: &str,
    filters: &ParsedFilters,
    limit: usize,
) -> Result<Vec<MetadataSearchHit>> {
    let pattern = if query.trim().is_empty() {
        "%".to_string()
    } else {
        format!("%{}%", query.trim().replace('%', "\\%").replace('_', "\\_"))
    };
    let relationship = filters.relationship.as_deref().map(|value| match value {
        "liked" => "likes",
        "reposted" => "reposts",
        "saved" => "saved",
        "posted" => "posts",
        other => other,
    });
    let local = filters
        .media_local
        .map(|value| if value { 1_i64 } else { 0_i64 });
    let entity = filters
        .entities
        .first()
        .map(|value| value.to_ascii_lowercase());
    let mut statement = conn.prepare(
        "SELECT DISTINCT j.id, c.id, m.title, m.author,
                COALESCE(m.poster_path, m.thumbnail)
         FROM jobs j
         LEFT JOIN media m ON m.job_id = j.id
         LEFT JOIN content_items c ON c.job_id = j.id
         WHERE LOWER(j.status) IN ('complete', 'completed', 'done')
           AND (
                 m.title LIKE :pattern ESCAPE '\\' COLLATE NOCASE OR
                 m.author LIKE :pattern ESCAPE '\\' COLLATE NOCASE OR
                 c.author_handle LIKE :pattern ESCAPE '\\' COLLATE NOCASE OR
                 j.url LIKE :pattern ESCAPE '\\' COLLATE NOCASE OR
                 EXISTS (
                     SELECT 1 FROM content_annotations ca_query
                     WHERE ca_query.job_id = j.id
                       AND (ca_query.normalized_value LIKE :pattern ESCAPE '\\' COLLATE NOCASE
                            OR ca_query.display_value LIKE :pattern ESCAPE '\\' COLLATE NOCASE)
                 )
           )
           AND (:relationship IS NULL OR EXISTS (
                SELECT 1 FROM content_relationships cr
                WHERE cr.content_id = c.id AND cr.active = 1
                  AND cr.channel_kind = :relationship
           ))
           AND (:date_from IS NULL OR COALESCE(c.published_at, m.upload_date) >= :date_from)
           AND (:date_to IS NULL OR COALESCE(c.published_at, m.upload_date) <= :date_to)
           AND (:profile IS NULL OR m.author LIKE '%' || :profile || '%' COLLATE NOCASE
                OR c.author_handle LIKE '%' || :profile || '%' COLLATE NOCASE)
           AND (:content_type IS NULL OR EXISTS (
                SELECT 1 FROM content_annotations ca
                WHERE ca.job_id = j.id AND ca.annotation_type = 'category'
                  AND ca.normalized_value = :content_type
           ))
           AND (:entity IS NULL OR EXISTS (
                SELECT 1 FROM content_annotations ca
                WHERE ca.job_id = j.id AND ca.normalized_value = :entity
           ))
           AND (:local IS NULL OR
                (:local = 1 AND m.video_path IS NOT NULL AND m.video_path <> '') OR
                (:local = 0 AND (m.video_path IS NULL OR m.video_path = '')))
         ORDER BY j.created_at DESC
         LIMIT :limit",
    )?;
    let rows = statement.query_map(
        rusqlite::named_params! {
            ":pattern": pattern,
            ":relationship": relationship,
            ":date_from": filters.date_from.as_deref(),
            ":date_to": filters.date_to.as_deref(),
            ":profile": filters.profile.as_deref(),
            ":content_type": filters.content_type.as_deref(),
            ":entity": entity.as_deref(),
            ":local": local,
            ":limit": limit as i64,
        },
        |row| {
            Ok(MetadataSearchHit {
                job_id: row.get(0)?,
                content_id: row.get(1)?,
                title: row.get(2)?,
                author: row.get(3)?,
                thumbnail: row.get(4)?,
                score: 0.9,
            })
        },
    )?;
    rows.collect()
}

/// Hard-filter a candidate from any retrieval channel. This keeps lexical and
/// vector channels from reintroducing a result that violates an explicit
/// relationship/date/category/local-media constraint.
pub fn job_matches_filters(
    conn: &Connection,
    job_id: i64,
    filters: &ParsedFilters,
) -> Result<bool> {
    if filters.relationship.is_none()
        && filters.date_from.is_none()
        && filters.date_to.is_none()
        && filters.content_type.is_none()
        && filters.profile.is_none()
        && filters.entities.is_empty()
        && filters.media_local.is_none()
    {
        return Ok(true);
    }
    let relationship = filters.relationship.as_deref().map(|value| match value {
        "liked" => "likes",
        "reposted" => "reposts",
        "posted" => "posts",
        other => other,
    });
    let content_pattern = filters
        .content_type
        .as_deref()
        .map(|value| format!("%{}%", value.replace('%', "\\%").replace('_', "\\_")));
    let entity_pattern = filters.entities.first().map(|value| {
        format!(
            "%{}%",
            value.to_lowercase().replace('%', "\\%").replace('_', "\\_")
        )
    });
    let local = filters
        .media_local
        .map(|value| if value { 1_i64 } else { 0_i64 });
    conn.query_row(
        "SELECT EXISTS(
            SELECT 1
            FROM jobs j
            LEFT JOIN media m ON m.job_id = j.id
            LEFT JOIN content_items c ON c.job_id = j.id
            WHERE j.id = :job_id
              AND (:relationship IS NULL OR EXISTS(
                  SELECT 1 FROM content_relationships cr
                  WHERE cr.content_id = c.id AND cr.active = 1
                    AND cr.channel_kind = :relationship
              ))
              AND (:date_from IS NULL OR COALESCE(c.published_at, m.upload_date) >= :date_from)
              AND (:date_to IS NULL OR COALESCE(c.published_at, m.upload_date) <= :date_to)
              AND (:profile IS NULL OR m.author LIKE '%' || :profile || '%' COLLATE NOCASE
                   OR c.author_handle LIKE '%' || :profile || '%' COLLATE NOCASE)
              AND (:content_type IS NULL OR EXISTS(
                  SELECT 1 FROM content_annotations ca
                  WHERE ca.job_id = j.id
                    AND ca.annotation_type = 'category'
                    AND ca.normalized_value = :content_type
              ) OR EXISTS(
                  SELECT 1 FROM search_units su
                  WHERE su.job_id = j.id
                    AND lower(su.text) LIKE :content_pattern ESCAPE '\\'
              ))
              AND (:entity_pattern IS NULL OR EXISTS(
                  SELECT 1 FROM content_annotations ca
                  WHERE ca.job_id = j.id
                    AND (lower(ca.normalized_value) LIKE :entity_pattern ESCAPE '\\'
                         OR lower(ca.display_value) LIKE :entity_pattern ESCAPE '\\')
              ) OR EXISTS(
                  SELECT 1 FROM search_units su
                  WHERE su.job_id = j.id
                    AND lower(su.text) LIKE :entity_pattern ESCAPE '\\'
              ))
              AND (:local IS NULL OR
                   (:local = 1 AND m.video_path IS NOT NULL AND m.video_path <> '') OR
                   (:local = 0 AND (m.video_path IS NULL OR m.video_path = '')))
        )",
        rusqlite::named_params! {
            ":job_id": job_id,
            ":relationship": relationship,
            ":date_from": filters.date_from.as_deref(),
            ":date_to": filters.date_to.as_deref(),
            ":profile": filters.profile.as_deref(),
            ":content_type": filters.content_type.as_deref(),
            ":content_pattern": content_pattern.as_deref(),
            ":entity_pattern": entity_pattern.as_deref(),
            ":local": local,
        },
        |row| row.get(0),
    )
}

pub fn has_search_representation(
    conn: &Connection,
    representation: SearchRepresentation,
) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM search_units WHERE representation = ?1 LIMIT 1
        )",
        params![representation.as_str()],
        |row| row.get(0),
    )
}

pub fn get_relationship_badges(conn: &Connection, job_id: i64) -> Result<Vec<String>> {
    let mut statement = conn.prepare(
        "SELECT DISTINCT cr.channel_kind
         FROM content_relationships cr
         JOIN content_items c ON c.id = cr.content_id
         WHERE c.job_id = ?1 AND cr.active = 1
         ORDER BY cr.channel_kind ASC",
    )?;
    let rows = statement.query_map(params![job_id], |row| row.get::<_, String>(0))?;
    Ok(rows
        .filter_map(|row| row.ok())
        .map(|kind| match kind.as_str() {
            "likes" | "liked" => "Favorito".to_string(),
            "saved" => "Guardado".to_string(),
            "reposts" | "reposted" => "Repost".to_string(),
            "posts" | "posted" => "Publicado".to_string(),
            other => other.to_string(),
        })
        .collect())
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

pub fn search_embeddings(
    conn: &Connection,
    query_vec: &[f32],
    limit: usize,
    min_score: f32,
) -> Result<Vec<SearchResult>> {
    validate_embedding(query_vec)?;
    let mut stmt = conn.prepare(
        "SELECT t.job_id, m.title, m.thumbnail, t.chunk_text, t.chunk_index, t.embedding_vector
         FROM transcript_embeddings t
         LEFT JOIN media m ON t.job_id = m.job_id",
    )?;

    let mut results = Vec::new();
    let rows = stmt.query_map([], |row| {
        let job_id: i64 = row.get(0)?;
        let title: Option<String> = row.get(1)?;
        let thumbnail: Option<String> = row.get(2)?;
        let chunk_text: String = row.get(3)?;
        let chunk_index: i64 = row.get(4)?;
        let embedding_blob: Vec<u8> = row.get(5)?;

        let embedding = deserialize_embedding(&embedding_blob, 5)?;
        Ok((job_id, title, thumbnail, chunk_text, chunk_index, embedding))
    })?;

    for row in rows {
        let (job_id, title, thumbnail, chunk_text, chunk_index, embedding) = row?;
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

    results.sort_by(|a, b| {
        b.similarity_score
            .partial_cmp(&a.similarity_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(limit);
    Ok(results)
}

pub fn cluster_videos_by_similarity(
    conn: &Connection,
    threshold: f32,
    min_cluster_size: usize,
) -> Result<Vec<Vec<i64>>> {
    let mut stmt = conn.prepare(
        "SELECT te.job_id, te.embedding_vector FROM transcript_embeddings te
         JOIN jobs j ON j.id = te.job_id
         WHERE j.status = 'complete'
         ORDER BY te.job_id, te.chunk_index",
    )?;

    let mut grouped_embeddings: std::collections::BTreeMap<i64, Vec<Vec<f32>>> =
        std::collections::BTreeMap::new();
    let rows = stmt.query_map([], |row| {
        let job_id: i64 = row.get(0)?;
        let blob: Vec<u8> = row.get(1)?;
        let embedding = deserialize_embedding(&blob, 1)?;
        Ok((job_id, embedding))
    })?;

    for row in rows {
        let (job_id, embedding) = row?;
        grouped_embeddings
            .entry(job_id)
            .or_default()
            .push(embedding);
    }

    let mut job_embeddings: Vec<(i64, Vec<f32>)> = Vec::with_capacity(grouped_embeddings.len());
    for (job_id, embeddings) in grouped_embeddings {
        let Some(first) = embeddings.first() else {
            continue;
        };
        if first.is_empty()
            || embeddings
                .iter()
                .any(|embedding| embedding.len() != first.len())
        {
            continue;
        }
        let mut centroid = vec![0.0f32; first.len()];
        for embedding in &embeddings {
            for (index, value) in embedding.iter().enumerate() {
                centroid[index] += *value;
            }
        }
        let count = embeddings.len() as f32;
        for value in &mut centroid {
            *value /= count;
        }
        job_embeddings.push((job_id, centroid));
    }

    let mut clusters: Vec<Vec<i64>> = Vec::new();
    let mut used: std::collections::HashSet<i64> = std::collections::HashSet::new();

    for (job_id, embedding) in &job_embeddings {
        if used.contains(job_id) {
            continue;
        }

        let mut cluster = vec![*job_id];
        used.insert(*job_id);

        for (other_id, other_emb) in &job_embeddings {
            if used.contains(other_id) {
                continue;
            }
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

pub fn get_transcript_segments(
    conn: &Connection,
    job_id: i64,
) -> Result<Vec<(i64, String, f64, f64)>> {
    let mut stmt = conn.prepare(
        "SELECT segment_index, text, start_time, end_time FROM transcript_segments WHERE job_id = ?1 ORDER BY segment_index ASC"
    )?;
    let rows = stmt.query_map(params![job_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?;
    let segments = rows.collect::<Result<Vec<_>>>()?;
    Ok(segments)
}

pub fn insert_transcript_segment(
    conn: &Connection,
    job_id: i64,
    segment_index: i64,
    start_time: f64,
    end_time: f64,
    text: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO transcript_segments (job_id, segment_index, start_time, end_time, text) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![job_id, segment_index, start_time, end_time, text],
    )?;
    Ok(())
}

pub fn get_transcript_segments_with_timestamps(
    conn: &Connection,
    job_id: i64,
) -> Result<Vec<(i64, String, f64, f64)>> {
    let mut stmt = conn.prepare(
        "SELECT segment_index, text, start_time, end_time FROM transcript_segments WHERE job_id = ?1 ORDER BY segment_index ASC"
    )?;
    let rows = stmt.query_map(params![job_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?;
    let segments = rows.collect::<Result<Vec<_>>>()?;
    Ok(segments)
}

pub fn get_transcript_segments_with_words(
    conn: &Connection,
    job_id: i64,
) -> Result<Vec<(i64, String, f64, f64, Option<String>)>> {
    let mut stmt = conn.prepare(
        "SELECT segment_index, text, start_time, end_time, words_json FROM transcript_segments WHERE job_id = ?1 ORDER BY segment_index ASC"
    )?;
    let rows = stmt.query_map(params![job_id], |row| {
        Ok((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            row.get(3)?,
            row.get(4)?,
        ))
    })?;
    rows.collect::<Result<Vec<_>>>()
}

pub fn update_transcript_words(
    conn: &Connection,
    job_id: i64,
    entries: &[(i64, String)],
) -> Result<()> {
    for (segment_index, words_json) in entries {
        conn.execute(
            "UPDATE transcript_segments SET words_json = ?1 WHERE job_id = ?2 AND segment_index = ?3",
            params![words_json, job_id, segment_index],
        )?;
    }
    Ok(())
}

// ========================================================================
// PLAYLIST OPERATIONS
// ========================================================================

pub fn get_all_playlists(conn: &Connection) -> Result<Vec<PlaylistRecord>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.description, p.cover_job_id, p.auto_generated,
                p.topic_keywords, p.color, p.created_at, p.kind, p.sort_mode,
                p.smart_query, p.smart_filters_json,
                COUNT(pi.content_id) as item_count
         FROM playlists p
         LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
         GROUP BY p.id
         ORDER BY p.created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PlaylistRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            cover_job_id: row.get(3)?,
            auto_generated: row.get(4)?,
            topic_keywords: row.get(5)?,
            color: row.get(6)?,
            created_at: row.get(7)?,
            kind: row.get(8)?,
            sort_mode: row.get(9)?,
            smart_query: row.get(10)?,
            smart_filters_json: row.get(11)?,
            item_count: row.get(12)?,
        })
    })?;
    let playlists = rows.collect::<Result<Vec<_>>>()?;
    Ok(playlists)
}

pub fn create_playlist(
    conn: &Connection,
    name: &str,
    description: Option<&str>,
    color: &str,
    auto_generated: bool,
) -> Result<i64> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 200 {
        return Err(rusqlite::Error::InvalidParameterName(
            "playlist name must contain between 1 and 200 characters".to_string(),
        ));
    }
    conn.execute(
        "INSERT INTO playlists
            (name, description, color, auto_generated, kind, sort_mode, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'manual', CURRENT_TIMESTAMP)",
        params![
            name,
            description,
            color,
            auto_generated,
            if auto_generated {
                "legacy_auto"
            } else {
                "manual"
            }
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn add_job_to_playlist(conn: &Connection, playlist_id: i64, job_id: i64) -> Result<()> {
    let content_id: i64 = conn
        .query_row(
            "SELECT id FROM content_items WHERE job_id = ?1 ORDER BY id ASC LIMIT 1",
            params![job_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    add_content_to_playlist(conn, playlist_id, content_id, "user")
}

pub fn add_content_to_playlist(
    conn: &Connection,
    playlist_id: i64,
    content_id: i64,
    added_by: &str,
) -> Result<()> {
    let playlist_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM playlists WHERE id = ?1)",
        params![playlist_id],
        |row| row.get(0),
    )?;
    let content_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM content_items WHERE id = ?1)",
        params![content_id],
        |row| row.get(0),
    )?;
    if !playlist_exists || !content_exists {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    let next_position: f64 = conn.query_row(
        "SELECT coalesce(max(position), 0) + 1000
         FROM playlist_items WHERE playlist_id = ?1",
        params![playlist_id],
        |row| row.get(0),
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO playlist_items
            (playlist_id, content_id, position, added_at, added_by)
         VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, ?4)",
        params![
            playlist_id,
            content_id,
            next_position,
            if added_by.trim().is_empty() {
                "user"
            } else {
                added_by
            }
        ],
    )?;
    Ok(())
}

pub fn remove_job_from_playlist(conn: &Connection, playlist_id: i64, job_id: i64) -> Result<()> {
    let content_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM content_items WHERE job_id = ?1 ORDER BY id ASC LIMIT 1",
            params![job_id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(content_id) = content_id {
        remove_content_from_playlist(conn, playlist_id, content_id)?;
    }
    Ok(())
}

pub fn remove_content_from_playlist(
    conn: &Connection,
    playlist_id: i64,
    content_id: i64,
) -> Result<()> {
    conn.execute(
        "DELETE FROM playlist_items WHERE playlist_id = ?1 AND content_id = ?2",
        params![playlist_id, content_id],
    )?;
    Ok(())
}

pub fn get_playlist_jobs(conn: &Connection, playlist_id: i64) -> Result<Vec<JobRecord>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {}
         FROM playlist_items pi
         JOIN content_items c ON pi.content_id = c.id
         JOIN jobs j ON c.job_id = j.id
         LEFT JOIN media m ON j.id = m.job_id
         WHERE pi.playlist_id = ?1
         ORDER BY pi.position ASC, pi.added_at ASC",
        JOB_SELECT_COLUMNS
    ))?;

    let job_iter = stmt.query_map(params![playlist_id], job_record_from_row)?;

    let mut jobs = Vec::new();
    for job in job_iter {
        jobs.push(job?);
    }
    Ok(jobs)
}

pub fn get_playlist_content_views(
    conn: &Connection,
    playlist_id: i64,
) -> Result<Vec<ContentViewRecord>> {
    let mut statement = conn.prepare(
        "SELECT c.id, c.platform, c.platform_content_id, c.canonical_url,
                c.author_id, c.author_handle, c.title, c.published_at,
                c.discovered_at, c.updated_at, c.availability, c.job_id
         FROM playlist_items pi
         JOIN content_items c ON c.id = pi.content_id
         WHERE pi.playlist_id = ?1
         ORDER BY pi.position ASC, pi.added_at ASC",
    )?;
    let rows = statement.query_map(params![playlist_id], |row| {
        Ok(ContentItemRecord {
            id: row.get(0)?,
            platform: row.get(1)?,
            platform_content_id: row.get(2)?,
            canonical_url: row.get(3)?,
            author_id: row.get(4)?,
            author_handle: row.get(5)?,
            title: row.get(6)?,
            published_at: row.get(7)?,
            discovered_at: row.get(8)?,
            updated_at: row.get(9)?,
            availability: row.get(10)?,
            job_id: row.get(11)?,
        })
    })?;

    let mut views = Vec::new();
    for item in rows {
        views.push(content_view_for_item(conn, item?)?);
    }
    Ok(views)
}

/// Return the same content projection for a confirmed profile/channel that a
/// manual playlist uses. The job is optional: remote content remains visible
/// before QueueService creates a processing projection.
pub fn get_channel_content_views(
    conn: &Connection,
    profile_source_id: i64,
    channel_kind: &str,
    limit: i64,
) -> Result<Vec<ContentViewRecord>> {
    let mut statement = conn.prepare(
        "SELECT c.id, c.platform, c.platform_content_id, c.canonical_url,
                c.author_id, c.author_handle, c.title, c.published_at,
                c.discovered_at, c.updated_at, c.availability, c.job_id
         FROM content_items c
         INNER JOIN content_relationships r ON c.id = r.content_id
         WHERE r.profile_source_id = ?1 AND r.channel_kind = ?2 AND r.active = 1
         ORDER BY c.published_at DESC, c.discovered_at DESC
         LIMIT ?3",
    )?;
    let rows = statement.query_map(params![profile_source_id, channel_kind, limit], |row| {
        Ok(ContentItemRecord {
            id: row.get(0)?,
            platform: row.get(1)?,
            platform_content_id: row.get(2)?,
            canonical_url: row.get(3)?,
            author_id: row.get(4)?,
            author_handle: row.get(5)?,
            title: row.get(6)?,
            published_at: row.get(7)?,
            discovered_at: row.get(8)?,
            updated_at: row.get(9)?,
            availability: row.get(10)?,
            job_id: row.get(11)?,
        })
    })?;

    rows.map(|row| content_view_for_item(conn, row?)).collect()
}

fn content_view_for_item(conn: &Connection, item: ContentItemRecord) -> Result<ContentViewRecord> {
    let (mut job, resolved_job_id) = if let Some(job_id) = item.job_id {
        if let Some(job) = get_job_by_id(conn, job_id)? {
            (job, Some(job_id))
        } else {
            (content_only_job(&item), None)
        }
    } else {
        (content_only_job(&item), None)
    };

    // Content metadata is the canonical fallback when a media row has not
    // been created yet or its metadata is incomplete.
    job.url = item.canonical_url.clone();
    job.title = job.title.or_else(|| item.title.clone());
    job.author = job.author.or_else(|| item.author_handle.clone());
    job.platform = job.platform.or_else(|| Some(item.platform.clone()));
    let availability = item.availability.trim().to_ascii_lowercase();
    let source_state = if job.video_path.is_some() {
        "local"
    } else if matches!(
        availability.as_str(),
        "unavailable" | "private" | "deleted" | "blocked" | "removed"
    ) {
        "unavailable"
    } else {
        "online"
    };
    job.source_state = source_state.to_string();

    Ok(ContentViewRecord {
        content_id: item.id,
        job_id: resolved_job_id,
        availability: if availability.is_empty() {
            "available".to_string()
        } else {
            availability
        },
        job,
    })
}

fn content_only_job(item: &ContentItemRecord) -> JobRecord {
    JobRecord {
        id: -item.id.abs().max(1),
        url: item.canonical_url.clone(),
        status: "complete".to_string(),
        progress: 100,
        retry_count: 0,
        created_at: item
            .published_at
            .clone()
            .unwrap_or_else(|| item.discovered_at.clone()),
        title: item.title.clone(),
        author: item.author_handle.clone(),
        thumbnail: None,
        duration: None,
        video_path: None,
        audio_path: None,
        transcript_path: None,
        keep_status: None,
        platform: Some(item.platform.clone()),
        error_message: None,
        visual_analysis: None,
        instructional_guide: None,
        video_bytes: None,
        audio_bytes: None,
        downloaded_at: None,
        last_accessed_at: None,
        play_count: 0,
        open_count: 0,
        search_hit_count: 0,
        favorite: false,
        pinned: false,
        source_state: "online".to_string(),
        purged_at: None,
        purged_reason: None,
        poster_path: None,
    }
}

pub fn get_source_collections(conn: &Connection) -> Result<Vec<SourceCollectionRecord>> {
    let mut statement = conn.prepare(
        "SELECT pc.id, pc.profile_source_id, pc.kind,
                coalesce(nullif(s.display_name, ''), nullif(s.username, ''), s.profile_url),
                s.username, s.display_name, pc.enabled, pc.status,
                CASE
                    WHEN pc.last_successful_discovery_at IS NULL THEN NULL
                    ELSE (
                        SELECT count(*)
                        FROM content_relationships r
                        WHERE r.profile_source_id = pc.profile_source_id
                          AND r.channel_kind = pc.kind
                          AND r.active = 1
                    )
                END AS item_count,
                coalesce(pc.last_successful_discovery_at, s.last_sync_at)
         FROM profile_channels pc
         JOIN collection_sources s ON s.id = pc.profile_source_id
         WHERE s.active = 1 AND pc.enabled = 1
         ORDER BY s.id ASC, pc.id ASC",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(SourceCollectionRecord {
            id: row.get(0)?,
            profile_source_id: row.get(1)?,
            channel_kind: row.get(2)?,
            name: row.get(3)?,
            username: row.get(4)?,
            display_name: row.get(5)?,
            enabled: row.get(6)?,
            status: row.get(7)?,
            item_count: row.get(8)?,
            last_sync_at: row.get(9)?,
        })
    })?;
    rows.collect()
}

pub fn delete_playlist(conn: &Connection, playlist_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM playlist_items WHERE playlist_id = ?1",
        params![playlist_id],
    )?;
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])?;
    Ok(())
}

#[allow(dead_code)]
pub fn get_julia_ready_jobs(conn: &Connection) -> Result<Vec<JobRecord>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {}
         FROM jobs j
         JOIN media m ON j.id = m.job_id
         LEFT JOIN transcript_embeddings te ON j.id = te.job_id
         WHERE m.julia_exported = 0 AND j.status = 'complete'
         GROUP BY j.id
         HAVING COUNT(te.id) > 0",
        JOB_SELECT_COLUMNS
    ))?;

    let job_iter = stmt.query_map([], job_record_from_row)?;

    let mut jobs = Vec::new();
    for job in job_iter {
        jobs.push(job?);
    }
    Ok(jobs)
}

#[allow(dead_code)]
pub fn mark_julia_exported(conn: &Connection, job_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE media SET julia_exported = 1 WHERE job_id = ?1",
        params![job_id],
    )?;
    Ok(())
}

pub fn data_dir_path() -> std::path::PathBuf {
    if let Some(configured) = std::env::var_os("PULSAR_DATA_DIR") {
        return std::path::PathBuf::from(configured);
    }

    // Tauri can launch the Rust process with `src-tauri` (or another build
    // directory) as its current directory. Use the compile-time workspace
    // root in debug builds so a development instance never races the
    // installed release instance over the same AppData SQLite database.
    #[cfg(debug_assertions)]
    {
        let workspace_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(std::path::Path::to_path_buf);
        if let Some(workspace_root) = workspace_root {
            if workspace_root.join("package.json").exists() {
                return workspace_root.join("data");
            }
        }
    }

    // Keep the repository layout convenient during development when the
    // compile-time root is unavailable, without writing beside an installed
    // executable in a protected directory.
    if let Ok(current_dir) = std::env::current_dir() {
        if current_dir.join("package.json").exists() && current_dir.join("src-tauri").is_dir() {
            return current_dir.join("data");
        }
    }

    #[cfg(windows)]
    if let Some(app_data) = std::env::var_os("APPDATA") {
        return user_data_dir(std::path::PathBuf::from(app_data));
    }

    if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
        return user_data_dir(std::path::PathBuf::from(data_home));
    }
    if let Some(home) = std::env::var_os("HOME") {
        return user_data_dir(std::path::PathBuf::from(home).join(".local").join("share"));
    }

    std::path::PathBuf::from("data")
}

/// New installations keep writable data under the product-family name used
/// by the desktop contract. Existing users may still have the original
/// `Pulsaria` directory; retaining it when the new directory is absent avoids
/// silently presenting an empty library after an upgrade.
fn user_data_dir(base: std::path::PathBuf) -> std::path::PathBuf {
    let current = base.join("Pulsar Eventide");
    let legacy = base.join("Pulsaria");
    if !current.exists() && legacy.exists() {
        legacy
    } else {
        current
    }
}

pub fn find_job_id_by_url(conn: &Connection, url: &str) -> Result<Option<i64>> {
    let canonical = crate::url_utils::canonicalize_tiktok_url(url);
    let indexed = conn
        .query_row(
            "SELECT id FROM jobs WHERE canonical_url = ?1 ORDER BY id DESC LIMIT 1",
            params![canonical],
            |row| row.get(0),
        )
        .optional()?;
    if indexed.is_some() {
        return Ok(indexed);
    }

    // Keep a compatibility fallback for rows written by an older binary or
    // a partially completed migration.
    let mut stmt = conn.prepare(
        "SELECT id, url FROM jobs
         WHERE canonical_url IS NULL OR canonical_url = ''
         ORDER BY id DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (id, stored_url) = row?;
        if stored_url == url || crate::url_utils::canonicalize_tiktok_url(&stored_url) == canonical
        {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

pub fn get_job_by_id(conn: &Connection, id: i64) -> Result<Option<JobRecord>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {}
         FROM jobs j
         LEFT JOIN media m ON j.id = m.job_id
         WHERE j.id = ?1",
        JOB_SELECT_COLUMNS
    ))?;
    stmt.query_row(params![id], job_record_from_row).optional()
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
        "SELECT text FROM transcript_segments WHERE job_id = ?1 ORDER BY segment_index ASC",
    )?;
    let rows = stmt.query_map(params![job_id], |row| row.get(0))?;
    let mut texts = Vec::new();
    for r in rows {
        texts.push(r?);
    }
    Ok(texts)
}

#[allow(dead_code)]
pub fn get_job_title(conn: &Connection, job_id: i64) -> Result<Option<String>> {
    conn.query_row(
        "SELECT title FROM media WHERE job_id = ?1",
        params![job_id],
        |row| row.get(0),
    )
    .optional()
}

pub fn update_job_error(conn: &Connection, id: i64, status: &str, message: &str) -> Result<()> {
    let rows = conn.execute(
        "UPDATE jobs SET status = ?1, error_message = ?2 WHERE id = ?3",
        params![status, message, id],
    )?;
    require_rows_changed(rows)?;
    append_job_activity_event(
        conn,
        id,
        status,
        0,
        Some("No pudimos completar este trabajo."),
        Some(message),
        Some(activity_error_code(message)),
    )
}

fn activity_error_code(message: &str) -> String {
    let normalized = message.to_ascii_lowercase();
    if normalized.contains("spawn") || normalized.contains("python worker") {
        "LOCAL_WORKER_START_FAILED".to_string()
    } else if normalized.contains("timed out") || normalized.contains("timeout") {
        "PIPELINE_TIMEOUT".to_string()
    } else if normalized.contains("network") || normalized.contains("http") {
        "SOURCE_UNAVAILABLE".to_string()
    } else {
        "PIPELINE_FAILED".to_string()
    }
}

fn append_job_activity_event(
    conn: &Connection,
    job_id: i64,
    status: &str,
    progress: i32,
    user_message: Option<&str>,
    technical_error: Option<&str>,
    error_code: Option<String>,
) -> Result<()> {
    conn.execute(
        "INSERT INTO job_activity_events
            (job_id, status, progress, user_message, technical_error, error_code)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            job_id,
            status,
            progress.clamp(0, 100),
            user_message,
            technical_error,
            error_code
        ],
    )?;
    Ok(())
}

pub fn get_job_activity(conn: &Connection, job_id: i64) -> Result<Vec<JobActivityEvent>> {
    let mut statement = conn.prepare(
        "SELECT id, job_id, status, progress, user_message, technical_error,
                error_code, created_at
         FROM job_activity_events
         WHERE job_id = ?1
         ORDER BY id ASC",
    )?;
    let rows = statement.query_map(params![job_id], |row| {
        Ok(JobActivityEvent {
            id: row.get(0)?,
            job_id: row.get(1)?,
            status: row.get(2)?,
            progress: row.get(3)?,
            user_message: row.get(4)?,
            technical_error: row.get(5)?,
            error_code: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

/// Marks jobs that have exceeded the stale threshold, excluding jobs that
/// are currently claimed by the in-memory queue.
///
/// The queue claim is the authoritative signal for work that is queued,
/// waiting for a worker, or inside a retry backoff. Passing those IDs into the
/// SQL statement prevents the maintenance scheduler from racing a live job
/// and turning it into an error while it is still progressing normally.
pub fn mark_stale_jobs(conn: &Connection, active_job_ids: &[i64]) -> Result<usize> {
    let base_query = "UPDATE jobs
        SET status = 'error', progress = 0,
            error_message = 'Job abandoned after exceeding the processing timeout'
        WHERE status IN ('queued', 'metadata', 'processing', 'downloading',
                         'extracting_audio', 'transcribing', 'indexing', 'retrying')
          AND datetime(created_at) < datetime('now', '-2 hours')";

    if active_job_ids.is_empty() {
        let updated = conn.execute(base_query, [])?;
        append_stale_activity_events(conn)?;
        return Ok(updated);
    }

    let placeholders = std::iter::repeat_n("?", active_job_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!("{base_query} AND id NOT IN ({placeholders})");
    let updated = conn.execute(&query, rusqlite::params_from_iter(active_job_ids.iter()))?;
    append_stale_activity_events(conn)?;
    Ok(updated)
}

fn append_stale_activity_events(conn: &Connection) -> Result<()> {
    conn.execute(
        "INSERT INTO job_activity_events
            (job_id, status, progress, user_message, technical_error, error_code)
         SELECT j.id, 'error', 0, 'No pudimos completar este trabajo.',
                j.error_message, 'PIPELINE_STALE'
         FROM jobs j
         WHERE j.status = 'error'
           AND j.error_message = 'Job abandoned after exceeding the processing timeout'
           AND NOT EXISTS (
               SELECT 1 FROM job_activity_events e
               WHERE e.job_id = j.id AND e.status = 'error'
                 AND e.error_code = 'PIPELINE_STALE'
           )",
        [],
    )?;
    Ok(())
}

pub fn clear_transcript_data(conn: &Connection, job_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM transcript_segments WHERE job_id = ?1",
        params![job_id],
    )?;
    conn.execute(
        "DELETE FROM transcript_embeddings WHERE job_id = ?1",
        params![job_id],
    )?;
    Ok(())
}

pub fn update_media_analysis(
    conn: &Connection,
    job_id: i64,
    visual_analysis: Option<&str>,
    instructional_guide: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE media SET
            visual_analysis = COALESCE(?1, visual_analysis),
            instructional_guide = COALESCE(?2, instructional_guide)
         WHERE job_id = ?3",
        params![visual_analysis, instructional_guide, job_id],
    )?;
    Ok(())
}

/// Persists the complete result of one worker attempt atomically.
///
/// Metadata, transcript segments and derived analysis belong to the same
/// worker result. Keeping their replacement inside one SQLite transaction
/// prevents a mid-result failure from exposing a mixture of old and new data
/// to the UI or to the search/indexing pipeline.
pub fn persist_worker_result(
    conn: &mut Connection,
    job_id: i64,
    metadata: Option<&MediaMetadata<'_>>,
    segments: &[(i64, f64, f64, String)],
    visual_analysis: Option<&str>,
    instructional_guide: Option<&str>,
) -> Result<()> {
    let transaction = conn.transaction()?;

    if let Some(metadata) = metadata {
        transaction.execute(
            "INSERT INTO media (job_id, title, author, thumbnail, duration, upload_date, video_path, audio_path, transcript_path, platform)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(job_id) DO UPDATE SET
                title = excluded.title,
                author = excluded.author,
                thumbnail = excluded.thumbnail,
                duration = excluded.duration,
                upload_date = excluded.upload_date,
                video_path = COALESCE(NULLIF(excluded.video_path, ''), media.video_path),
                audio_path = COALESCE(NULLIF(excluded.audio_path, ''), media.audio_path),
                transcript_path = COALESCE(NULLIF(excluded.transcript_path, ''), media.transcript_path),
                platform = COALESCE(NULLIF(excluded.platform, ''), media.platform)",
            params![
                job_id,
                metadata.title,
                metadata.author,
                metadata.thumbnail,
                metadata.duration,
                metadata.upload_date,
                metadata.video_path,
                metadata.audio_path,
                metadata.transcript_path,
                metadata.platform
            ],
        )?;
    }

    transaction.execute(
        "DELETE FROM transcript_segments WHERE job_id = ?1",
        params![job_id],
    )?;
    transaction.execute(
        "DELETE FROM transcript_embeddings WHERE job_id = ?1",
        params![job_id],
    )?;

    for (segment_index, start_time, end_time, text) in segments {
        transaction.execute(
            "INSERT INTO transcript_segments (job_id, segment_index, start_time, end_time, text)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![job_id, segment_index, start_time, end_time, text],
        )?;
    }

    update_media_analysis(&transaction, job_id, visual_analysis, instructional_guide)?;

    transaction.commit()
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedOutputRecord {
    pub id: i64,
    pub job_id: i64,
    pub category: String,
    pub format: String,
    pub path: String,
    pub size_bytes: u64,
    pub validated: bool,
    pub label: String,
    pub created_at: String,
}

pub struct GeneratedOutputInput<'a> {
    pub job_id: i64,
    pub category: &'a str,
    pub format: &'a str,
    pub path: &'a str,
    pub size_bytes: u64,
    pub validated: bool,
    pub label: &'a str,
}

pub fn register_generated_output(conn: &Connection, input: GeneratedOutputInput<'_>) -> Result<()> {
    conn.execute(
        "INSERT INTO generated_outputs
            (job_id, category, format, path, size_bytes, validated, label)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(job_id, format) DO UPDATE SET
            category = excluded.category,
            path = excluded.path,
            size_bytes = excluded.size_bytes,
            validated = excluded.validated,
            label = excluded.label",
        params![
            input.job_id,
            input.category,
            input.format,
            input.path,
            i64::try_from(input.size_bytes).unwrap_or(i64::MAX),
            input.validated,
            input.label
        ],
    )?;
    Ok(())
}

pub fn get_generated_outputs(conn: &Connection, job_id: i64) -> Result<Vec<GeneratedOutputRecord>> {
    let mut statement = conn.prepare(
        "SELECT id, job_id, category, format, path, size_bytes, validated, label, created_at
         FROM generated_outputs WHERE job_id = ?1 ORDER BY category, format",
    )?;
    let rows = statement.query_map(params![job_id], |row| {
        Ok(GeneratedOutputRecord {
            id: row.get(0)?,
            job_id: row.get(1)?,
            category: row.get(2)?,
            format: row.get(3)?,
            path: row.get(4)?,
            size_bytes: row.get::<_, i64>(5)?.max(0) as u64,
            validated: row.get::<_, i64>(6)? != 0,
            label: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

pub struct AutoPlaylistInput<'a> {
    pub name: &'a str,
    pub description: Option<&'a str>,
    pub color: &'a str,
    pub cover_job_id: Option<i64>,
    pub topic_keywords: &'a str,
    pub job_ids: &'a [i64],
}

pub fn replace_auto_playlists(
    conn: &Connection,
    groups: &[AutoPlaylistInput<'_>],
) -> Result<Vec<i64>> {
    conn.execute("DELETE FROM playlists WHERE auto_generated = 1", [])?;
    let mut ids = Vec::with_capacity(groups.len());
    for group in groups {
        conn.execute(
            "INSERT INTO playlists
                (name, description, color, auto_generated, cover_job_id, topic_keywords,
                 kind, sort_mode, updated_at)
             VALUES (?1, ?2, ?3, 1, ?4, ?5, 'legacy_auto', 'manual', CURRENT_TIMESTAMP)",
            params![
                group.name,
                group.description,
                group.color,
                group.cover_job_id,
                group.topic_keywords
            ],
        )?;
        let playlist_id = conn.last_insert_rowid();
        for job_id in group.job_ids {
            add_job_to_playlist(conn, playlist_id, *job_id)?;
        }
        ids.push(playlist_id);
    }
    Ok(ids)
}

/// Clears only an incomplete job's staging directory. Knowledge is durable
/// and therefore never part of retry cleanup: transcript paths, segments,
/// embeddings and artifacts are intentionally preserved.
pub fn clear_staging_job(
    conn: &Connection,
    job_id: i64,
    processing_root: &std::path::Path,
) -> Result<()> {
    let job_dir = processing_root.join(job_id.to_string());
    match fs::remove_dir_all(&job_dir) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(error)));
        }
    }
    let paths: Option<(Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT video_path, audio_path FROM media WHERE job_id = ?1",
            params![job_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let video_is_staging = paths
        .as_ref()
        .and_then(|(video, _)| video.as_deref())
        .is_some_and(|path| Path::new(path).starts_with(processing_root));
    let audio_is_staging = paths
        .as_ref()
        .and_then(|(_, audio)| audio.as_deref())
        .is_some_and(|path| Path::new(path).starts_with(processing_root));
    if video_is_staging || audio_is_staging {
        conn.execute(
            "UPDATE media SET
                video_path = CASE WHEN ?1 = 1 THEN NULL ELSE video_path END,
                audio_path = CASE WHEN ?2 = 1 THEN NULL ELSE audio_path END,
                video_bytes = CASE WHEN ?1 = 1 THEN NULL ELSE video_bytes END,
                audio_bytes = CASE WHEN ?2 = 1 THEN NULL ELSE audio_bytes END
             WHERE job_id = ?3",
            params![video_is_staging, audio_is_staging, job_id],
        )?;
    }
    Ok(())
}

/// Backwards-compatible name used by older queue call sites. It now has the
/// safe staging-only semantics of `clear_staging_job` and never removes a
/// durable transcript.
pub fn cleanup_media_files(
    conn: &Connection,
    job_id: i64,
    processing_root: &std::path::Path,
) -> Result<()> {
    clear_staging_job(conn, job_id, processing_root)
}

// This is a persistence boundary: keeping the fields explicit makes it harder
// to accidentally swap a path, byte count or source-state value at call sites.
#[allow(clippy::too_many_arguments)]
pub fn update_media_storage(
    conn: &Connection,
    job_id: i64,
    video_path: Option<&str>,
    audio_path: Option<&str>,
    transcript_path: Option<&str>,
    video_bytes: Option<u64>,
    audio_bytes: Option<u64>,
    source_state: &str,
) -> Result<()> {
    if !matches!(source_state, "local" | "online" | "unavailable") {
        return Err(rusqlite::Error::InvalidParameterName(
            "source_state must be local, online or unavailable".to_string(),
        ));
    }
    let rows = conn.execute(
        "UPDATE media SET
            video_path = COALESCE(?1, video_path),
            audio_path = COALESCE(?2, audio_path),
            transcript_path = COALESCE(?3, transcript_path),
            video_bytes = COALESCE(?4, video_bytes),
            audio_bytes = COALESCE(?5, audio_bytes),
            downloaded_at = COALESCE(downloaded_at, CURRENT_TIMESTAMP),
            source_state = ?6,
            purged_at = CASE WHEN ?6 = 'local' THEN NULL ELSE purged_at END,
            purged_reason = CASE WHEN ?6 = 'local' THEN NULL ELSE purged_reason END
         WHERE job_id = ?7",
        params![
            video_path,
            audio_path,
            transcript_path,
            video_bytes.map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
            audio_bytes.map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
            source_state,
            job_id
        ],
    )?;
    require_rows_changed(rows)
}

pub fn set_media_poster_path(conn: &Connection, job_id: i64, path: Option<&str>) -> Result<()> {
    let rows = conn.execute(
        "UPDATE media SET poster_path = COALESCE(?1, poster_path) WHERE job_id = ?2",
        params![path, job_id],
    )?;
    require_rows_changed(rows)
}

pub fn set_media_storage_paths_null(
    conn: &Connection,
    job_id: i64,
    source_state: &str,
    purged_reason: &str,
) -> Result<()> {
    let rows = conn.execute(
        "UPDATE media SET
            video_path = NULL,
            audio_path = NULL,
            video_bytes = NULL,
            audio_bytes = NULL,
            source_state = ?1,
            purged_at = CURRENT_TIMESTAMP,
            purged_reason = ?2
         WHERE job_id = ?3",
        params![source_state, purged_reason, job_id],
    )?;
    require_rows_changed(rows)
}

pub fn set_media_protection(
    conn: &Connection,
    job_id: i64,
    favorite: Option<bool>,
    pinned: Option<bool>,
    protected: Option<bool>,
) -> Result<()> {
    let rows = conn.execute(
        "UPDATE media SET
            favorite = COALESCE(?1, favorite),
            pinned = COALESCE(?2, pinned)
         WHERE job_id = ?3",
        params![favorite, pinned, job_id],
    )?;
    require_rows_changed(rows)?;
    if let Some(protected) = protected {
        conn.execute(
            "UPDATE media_artifacts SET protected = ?1 WHERE job_id = ?2 AND kind = 'screenshot'",
            params![protected, job_id],
        )?;
    }
    Ok(())
}

pub fn record_media_access(conn: &Connection, job_id: i64, access_kind: &str) -> Result<()> {
    let column = match access_kind {
        "play" => "play_count",
        "open" => "open_count",
        "search" => "search_hit_count",
        _ => {
            return Err(rusqlite::Error::InvalidParameterName(
                "access_kind must be play, open or search".to_string(),
            ))
        }
    };
    let rows = conn.execute(
        &format!(
            "UPDATE media SET {column} = COALESCE({column}, 0) + 1,
             last_accessed_at = CURRENT_TIMESTAMP WHERE job_id = ?1"
        ),
        params![job_id],
    )?;
    require_rows_changed(rows)
}

// ========================================================================
// COLLECTION SOURCES OPERATIONS
// ========================================================================

pub fn register_collection_source_with_browser(
    conn: &Connection,
    url: &str,
    browser: Option<&str>,
) -> Result<()> {
    let source_type = if url.contains("/collection/") || url.contains("/tag/") {
        "collection"
    } else {
        "profile"
    };
    let canonical_url = crate::url_utils::canonicalize_tiktok_url(url);
    let profile_url = crate::url_utils::tiktok_profile_url(&canonical_url)
        .unwrap_or_else(|| canonical_url.clone());
    let username = crate::url_utils::tiktok_username(&profile_url);
    conn.execute(
        "INSERT INTO collection_sources
            (url, profile_url, source_type, platform, username, browser, active, status,
             last_synced_at, last_sync_at, capabilities_json, watch_config_json, rules_json)
         VALUES (?1, ?2, ?3, 'tiktok', ?4, ?5, 1, 'active', CURRENT_TIMESTAMP,
                 CURRENT_TIMESTAMP, ?6, ?7, ?8)
         ON CONFLICT(url) DO UPDATE SET
            profile_url = coalesce(collection_sources.profile_url, excluded.profile_url),
            platform = 'tiktok',
            username = coalesce(collection_sources.username, excluded.username),
            browser = coalesce(?5, collection_sources.browser),
            active = 1,
            status = 'active'",
        params![
            canonical_url,
            profile_url,
            source_type,
            username,
            browser,
            DEFAULT_SOURCE_CAPABILITIES,
            DEFAULT_SOURCE_WATCH_CONFIG,
            DEFAULT_SOURCE_RULES,
        ],
    )?;
    Ok(())
}

pub fn upsert_tiktok_source(
    conn: &Connection,
    profile_url: &str,
    browser: Option<&str>,
    initial_import_mode: &str,
    history_limit: Option<i64>,
    history_from: Option<&str>,
) -> Result<i64> {
    let canonical_url = crate::url_utils::tiktok_profile_url(profile_url).ok_or_else(|| {
        rusqlite::Error::InvalidParameterName("invalid TikTok profile URL".into())
    })?;
    let username = crate::url_utils::tiktok_username(&canonical_url);
    let existing_id = conn
        .query_row(
            "SELECT id FROM collection_sources WHERE profile_url = ?1 OR url = ?1 ORDER BY id ASC LIMIT 1",
            params![canonical_url],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(source_id) = existing_id {
        conn.execute(
            "UPDATE collection_sources SET
                profile_url = ?1,
                source_type = 'profile',
                platform = 'tiktok',
                username = coalesce(?2, username),
                browser = coalesce(?3, browser),
                active = 1,
                status = 'checking',
                initial_import_mode = ?4,
                history_limit = ?5,
                history_from = ?6,
                last_error = NULL
             WHERE id = ?7",
            params![
                canonical_url,
                username,
                browser,
                initial_import_mode,
                history_limit,
                history_from,
                source_id,
            ],
        )?;
        return Ok(source_id);
    }

    conn.execute(
        "INSERT INTO collection_sources
            (url, profile_url, source_type, platform, username, browser, active, status,
             capabilities_json, watch_config_json, initial_import_mode, history_limit,
             history_from, rules_json)
         VALUES (?1, ?1, 'profile', 'tiktok', ?2, ?3, 1, 'checking', ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            canonical_url,
            username,
            browser,
            DEFAULT_SOURCE_CAPABILITIES,
            DEFAULT_SOURCE_WATCH_CONFIG,
            initial_import_mode,
            history_limit,
            history_from,
            DEFAULT_SOURCE_RULES,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Registers a profile identity without scanning it or enqueueing content.
/// The collection_sources table remains the single persistence authority used
/// by the later scanner, so this path only establishes the durable profile
/// contract.
pub fn register_profile_source(
    conn: &Connection,
    profile_url: &str,
    username: &str,
    watch_config_json: &str,
    active: bool,
) -> Result<(i64, bool)> {
    let existing_id = conn
        .query_row(
            "SELECT id
             FROM collection_sources
             WHERE profile_url = ?1
                OR url = ?1
                OR (platform = 'tiktok' AND lower(username) = lower(?2))
             ORDER BY id ASC
             LIMIT 1",
            params![profile_url, username],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(source_id) = existing_id {
        return Ok((source_id, true));
    }

    conn.execute(
        "INSERT INTO collection_sources
            (url, profile_url, source_type, platform, username, active, status,
             capabilities_json, watch_config_json, initial_import_mode, rules_json,
             updated_at)
         VALUES (?1, ?1, 'profile', 'tiktok', ?2, ?3, ?4, '{}', ?5, 'new_only', ?6,
                 CURRENT_TIMESTAMP)",
        params![
            profile_url,
            username,
            active,
            if active { "ready" } else { "paused" },
            watch_config_json,
            DEFAULT_SOURCE_RULES,
        ],
    )?;
    Ok((conn.last_insert_rowid(), false))
}

pub fn update_profile_source_settings(
    conn: &Connection,
    source_id: i64,
    watch_config_json: &str,
    active: bool,
) -> Result<CollectionSourceRecord> {
    let rows = conn.execute(
        "UPDATE collection_sources SET
            watch_config_json = ?1,
            active = ?2,
            status = CASE WHEN ?2 = 1 THEN 'ready' ELSE 'paused' END,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?3 AND platform = 'tiktok' AND source_type = 'profile'",
        params![watch_config_json, active, source_id],
    )?;
    require_rows_changed(rows)?;
    get_collection_source(conn, source_id)
}

pub fn register_collection_source(conn: &Connection, url: &str) -> Result<()> {
    register_collection_source_with_browser(conn, url, None)
}

pub fn find_collection_source_id_by_url(conn: &Connection, url: &str) -> Result<Option<i64>> {
    conn.query_row(
        "SELECT id FROM collection_sources WHERE url = ?1",
        params![url],
        |row| row.get(0),
    )
    .optional()
}

const COLLECTION_SOURCE_COLUMNS: &str = "id, url, coalesce(profile_url, url),
    coalesce(source_type, 'collection'), coalesce(platform, 'tiktok'), username,
    display_name, avatar_url, browser, active, coalesce(status, 'active'),
    coalesce(capabilities_json, '{}'),
    coalesce(watch_config_json, '{\"posts\":false,\"likes\":true,\"saved\":true,\"reposts\":false}'),
    coalesce(initial_import_mode, 'new_only'), history_limit, history_from,
    coalesce(rules_json, '{\"ignoreDuplicates\":true,\"autoEnqueue\":true}'),
    coalesce(interval_minutes, 15), last_attempt_at,
    coalesce(last_sync_at, last_success_at, last_synced_at), last_success_at,
    next_sync_at, coalesce(discovered_count, 0), coalesce(consecutive_failures, 0),
    last_error, last_sync_summary_json, created_at, cover_url, verified,
    following_count, followers_count, likes_count, posts_count, updated_at";

fn collection_source_from_row(row: &Row<'_>) -> rusqlite::Result<CollectionSourceRecord> {
    Ok(CollectionSourceRecord {
        id: row.get(0)?,
        url: row.get(1)?,
        profile_url: row.get(2)?,
        source_type: row.get(3)?,
        platform: row.get(4)?,
        username: row.get(5)?,
        display_name: row.get(6)?,
        avatar_url: row.get(7)?,
        browser: row.get(8)?,
        active: row.get(9)?,
        status: row.get(10)?,
        capabilities_json: row.get(11)?,
        watch_config_json: row.get(12)?,
        initial_import_mode: row.get(13)?,
        history_limit: row.get(14)?,
        history_from: row.get(15)?,
        rules_json: row.get(16)?,
        interval_minutes: row.get(17)?,
        last_attempt_at: row.get(18)?,
        last_sync_at: row.get(19)?,
        last_success_at: row.get(20)?,
        next_sync_at: row.get(21)?,
        discovered_count: row.get(22)?,
        consecutive_failures: row.get(23)?,
        last_error: row.get(24)?,
        last_sync_summary_json: row.get(25)?,
        created_at: row.get(26)?,
        cover_url: row.get(27)?,
        verified: row.get(28)?,
        following_count: row.get(29)?,
        followers_count: row.get(30)?,
        likes_count: row.get(31)?,
        posts_count: row.get(32)?,
        updated_at: row.get(33)?,
    })
}

pub fn get_collection_source(conn: &Connection, source_id: i64) -> Result<CollectionSourceRecord> {
    conn.query_row(
        &format!(
            "SELECT {} FROM collection_sources WHERE id = ?1",
            COLLECTION_SOURCE_COLUMNS
        ),
        params![source_id],
        collection_source_from_row,
    )
}

pub fn get_collection_sources(conn: &Connection) -> Result<Vec<CollectionSourceRecord>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM collection_sources ORDER BY id ASC",
        COLLECTION_SOURCE_COLUMNS
    ))?;
    let rows = stmt.query_map([], collection_source_from_row)?;
    let mut sources = Vec::new();
    for row in rows {
        sources.push(row?);
    }
    Ok(sources)
}

pub fn get_collection_sources_to_sync(conn: &Connection) -> Result<Vec<CollectionSourceRecord>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM collection_sources
         WHERE active = 1 AND coalesce(status, 'active') IN ('active', 'checking')
           AND (next_sync_at IS NULL OR next_sync_at <= datetime('now'))
         ORDER BY id ASC",
        COLLECTION_SOURCE_COLUMNS
    ))?;
    let rows = stmt.query_map([], collection_source_from_row)?;
    let mut sources = Vec::new();
    for row in rows {
        sources.push(row?);
    }
    Ok(sources)
}

pub fn set_collection_source_active(conn: &Connection, source_id: i64, active: bool) -> Result<()> {
    let rows = conn.execute(
        "UPDATE collection_sources SET
            active = ?1,
            status = CASE
                WHEN ?1 = 0 THEN 'paused'
                WHEN status IN ('needs_auth', 'error') THEN 'checking'
                ELSE 'active'
            END,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2",
        params![active, source_id],
    )?;
    require_rows_changed(rows)
}

pub fn update_collection_source_config(
    conn: &Connection,
    source_id: i64,
    watch_config_json: &str,
    initial_import_mode: &str,
    history_limit: Option<i64>,
    history_from: Option<&str>,
    rules_json: &str,
) -> Result<()> {
    let rows = conn.execute(
        "UPDATE collection_sources SET
            watch_config_json = ?1,
            initial_import_mode = ?2,
            history_limit = ?3,
            history_from = ?4,
            rules_json = ?5,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?6",
        params![
            watch_config_json,
            initial_import_mode,
            history_limit,
            history_from,
            rules_json,
            source_id,
        ],
    )?;
    require_rows_changed(rows)
}

pub fn update_collection_source_scan(
    conn: &Connection,
    source_id: i64,
    capabilities_json: &str,
    status: &str,
    display_name: Option<&str>,
    avatar_url: Option<&str>,
    summary_json: Option<&str>,
) -> Result<()> {
    let rows = conn.execute(
        "UPDATE collection_sources SET
            capabilities_json = ?1,
            status = ?2,
            display_name = coalesce(?3, display_name),
            avatar_url = coalesce(?4, avatar_url),
            last_sync_summary_json = coalesce(?5, last_sync_summary_json),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?6",
        params![
            capabilities_json,
            status,
            display_name,
            avatar_url,
            summary_json,
            source_id,
        ],
    )?;
    require_rows_changed(rows)
}

pub fn delete_collection_source(conn: &Connection, source_id: i64) -> Result<()> {
    let rows = conn.execute(
        "DELETE FROM collection_sources WHERE id = ?1",
        params![source_id],
    )?;
    require_rows_changed(rows)
}

pub fn force_collection_source_due(conn: &Connection, source_id: i64) -> Result<()> {
    let rows = conn.execute(
        "UPDATE collection_sources SET next_sync_at = datetime('now', '-1 minute'), updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![source_id],
    )?;
    require_rows_changed(rows)
}

pub fn mark_collection_source_attempt(conn: &Connection, source_id: i64) -> Result<()> {
    let rows = conn.execute(
        "UPDATE collection_sources SET last_attempt_at = datetime('now'), updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![source_id],
    )?;
    require_rows_changed(rows)
}

pub fn mark_collection_source_failed(conn: &Connection, source_id: i64, error: &str) -> Result<()> {
    let normalized = error.to_ascii_lowercase();
    let status = if [
        "cookie",
        "login",
        "sign in",
        "private",
        "unauthorized",
        "forbidden",
        "401",
        "403",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
    {
        "needs_auth"
    } else {
        "error"
    };
    let rows = conn.execute(
        "UPDATE collection_sources SET
            status = ?2,
            consecutive_failures = consecutive_failures + 1,
            last_error = ?3,
            next_sync_at = datetime('now', '+' || min(180, (15 * (consecutive_failures + 1))) || ' minutes'),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![source_id, status, error],
    )?;
    require_rows_changed(rows)
}

pub fn mark_collection_source_synced(
    conn: &Connection,
    source_id: i64,
    queued: usize,
) -> Result<()> {
    let rows = conn.execute(
        "UPDATE collection_sources SET
            status = CASE WHEN active = 1 THEN 'active' ELSE 'paused' END,
            last_sync_at = datetime('now'),
            last_success_at = datetime('now'),
            last_synced_at = datetime('now'),
            consecutive_failures = 0,
            last_error = NULL,
            discovered_count = discovered_count + ?2,
            next_sync_at = datetime('now', '+' || interval_minutes || ' minutes'),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![source_id, queued as i64],
    )?;
    require_rows_changed(rows)
}

pub fn set_collection_source_summary(
    conn: &Connection,
    source_id: i64,
    summary_json: &str,
) -> Result<()> {
    let rows = conn.execute(
        "UPDATE collection_sources SET last_sync_summary_json = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![summary_json, source_id],
    )?;
    require_rows_changed(rows)
}

pub fn get_collection_source_item(
    conn: &Connection,
    source_id: i64,
    canonical_url: &str,
) -> Result<Option<CollectionSourceItemRecord>> {
    conn.query_row(
        "SELECT id, source_id, canonical_url, platform_video_id, activity_types_json,
                state, job_id, reason, first_seen_at, last_seen_at
         FROM collection_source_items
         WHERE source_id = ?1 AND canonical_url = ?2",
        params![source_id, canonical_url],
        |row| {
            Ok(CollectionSourceItemRecord {
                id: row.get(0)?,
                source_id: row.get(1)?,
                canonical_url: row.get(2)?,
                platform_video_id: row.get(3)?,
                activity_types_json: row.get(4)?,
                state: row.get(5)?,
                job_id: row.get(6)?,
                reason: row.get(7)?,
                first_seen_at: row.get(8)?,
                last_seen_at: row.get(9)?,
            })
        },
    )
    .optional()
}

pub fn upsert_collection_source_item(
    conn: &Connection,
    source_id: i64,
    canonical_url: &str,
    platform_video_id: Option<&str>,
    activity_type: &str,
    state: &str,
    job_id: Option<i64>,
    reason: Option<&str>,
) -> Result<CollectionSourceItemRecord> {
    let existing = get_collection_source_item(conn, source_id, canonical_url)?;
    let mut activity_types = existing
        .as_ref()
        .and_then(|item| serde_json::from_str::<Vec<String>>(&item.activity_types_json).ok())
        .unwrap_or_default();
    if !activity_types.iter().any(|item| item == activity_type) {
        activity_types.push(activity_type.to_string());
    }
    let activity_types_json = serde_json::to_string(&activity_types)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;

    if let Some(existing) = existing {
        conn.execute(
            "UPDATE collection_source_items SET
                platform_video_id = coalesce(?1, platform_video_id),
                activity_types_json = ?2,
                state = ?3,
                job_id = coalesce(?4, job_id),
                reason = ?5,
                last_seen_at = CURRENT_TIMESTAMP
             WHERE id = ?6",
            params![
                platform_video_id,
                activity_types_json,
                state,
                job_id,
                reason,
                existing.id,
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO collection_source_items
                (source_id, canonical_url, platform_video_id, activity_types_json, state,
                 job_id, reason)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                source_id,
                canonical_url,
                platform_video_id,
                activity_types_json,
                state,
                job_id,
                reason,
            ],
        )?;
    }

    get_collection_source_item(conn, source_id, canonical_url)?
        .ok_or(rusqlite::Error::QueryReturnedNoRows)
}

#[allow(clippy::too_many_arguments)]
pub fn insert_collection_source_activity(
    conn: &Connection,
    source_id: i64,
    event_type: &str,
    activity_type: Option<&str>,
    message: &str,
    canonical_url: Option<&str>,
    job_id: Option<i64>,
    state: Option<&str>,
    found_count: i64,
    queued_count: i64,
    duplicate_count: i64,
    ignored_count: i64,
    error_count: i64,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO collection_source_activity
            (source_id, event_type, activity_type, message, canonical_url, job_id, state,
             found_count, queued_count, duplicate_count, ignored_count, error_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            source_id,
            event_type,
            activity_type,
            message,
            canonical_url,
            job_id,
            state,
            found_count,
            queued_count,
            duplicate_count,
            ignored_count,
            error_count,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_collection_source_activity(
    conn: &Connection,
    source_id: i64,
    limit: usize,
) -> Result<Vec<CollectionSourceActivityRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, source_id, created_at, event_type, activity_type, message,
                canonical_url, job_id, state, found_count, queued_count, duplicate_count,
                ignored_count, error_count
         FROM collection_source_activity
         WHERE source_id = ?1
         ORDER BY id DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![source_id, limit as i64], |row| {
        Ok(CollectionSourceActivityRecord {
            id: row.get(0)?,
            source_id: row.get(1)?,
            created_at: row.get(2)?,
            event_type: row.get(3)?,
            activity_type: row.get(4)?,
            message: row.get(5)?,
            canonical_url: row.get(6)?,
            job_id: row.get(7)?,
            state: row.get(8)?,
            found_count: row.get(9)?,
            queued_count: row.get(10)?,
            duplicate_count: row.get(11)?,
            ignored_count: row.get(12)?,
            error_count: row.get(13)?,
        })
    })?;
    rows.collect()
}

// ========================================================================
// HEALTH EVENTS & REPAIR OPERATIONS
// ========================================================================

pub fn insert_health_event(
    conn: &Connection,
    component: &str,
    severity: &str,
    diagnosis: &str,
    action: Option<&str>,
    result: Option<&str>,
) -> Result<()> {
    conn.execute(
        "INSERT INTO health_events (component, severity, diagnosis, action, result)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![component, severity, diagnosis, action, result],
    )?;
    Ok(())
}

pub fn get_health_events(conn: &Connection, limit: usize) -> Result<Vec<HealthEvent>> {
    let mut stmt = conn.prepare(
        "SELECT id, created_at, component, severity, diagnosis, action, result
         FROM health_events
         ORDER BY id DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], |row| {
        Ok(HealthEvent {
            id: row.get(0)?,
            created_at: row.get(1)?,
            component: row.get(2)?,
            severity: row.get(3)?,
            diagnosis: row.get(4)?,
            action: row.get(5)?,
            result: row.get(6)?,
        })
    })?;
    let mut events = Vec::new();
    for row in rows {
        events.push(row?);
    }
    Ok(events)
}

pub fn prune_health_events(conn: &Connection, keep: usize) -> Result<()> {
    conn.execute(
        "DELETE FROM health_events
         WHERE id NOT IN (
            SELECT id FROM health_events ORDER BY id DESC LIMIT ?1
         )",
        params![keep as i64],
    )?;
    Ok(())
}

fn path_is_within_existing(path: &Path, root: &Path) -> bool {
    let Ok(path) = fs::canonicalize(path) else {
        return false;
    };
    let Ok(root) = fs::canonicalize(root) else {
        return false;
    };
    path.starts_with(root)
}

/// Reconciles durable derivative references after a crash, manual file move or
/// an interrupted purge. Existing files are never deleted here: this routine
/// only updates their measured size, repairs a generated output whose
/// recoverable copy is still present, or removes a database row whose file is
/// gone. Knowledge tables are intentionally not queried or modified.
pub fn reconcile_storage(
    conn: &Connection,
    media_root: &Path,
) -> Result<StorageReconciliationReport> {
    let artifact_rows = {
        let mut statement = conn.prepare(
            "SELECT id, job_id, path, size_bytes
             FROM media_artifacts
             ORDER BY id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    let output_rows = {
        let mut statement = conn.prepare(
            "SELECT id, path, size_bytes
             FROM generated_outputs
             ORDER BY id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    let artifact_root = data_dir_path().join("artifacts");
    let trash_root = media_root.join(".pulsaria").join("trash");
    let transaction = conn.unchecked_transaction()?;
    let mut report = StorageReconciliationReport {
        checked_artifacts: artifact_rows.len(),
        checked_generated_outputs: output_rows.len(),
        ..StorageReconciliationReport::default()
    };

    for (artifact_id, job_id, raw_path, stored_size) in artifact_rows {
        let path = PathBuf::from(&raw_path);
        let expected_root = artifact_root.join(job_id.to_string());
        if path.is_file() && path_is_within_existing(&path, &expected_root) {
            let actual_size = i64::try_from(
                fs::metadata(&path)
                    .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?
                    .len(),
            )
            .unwrap_or(i64::MAX);
            if stored_size != actual_size {
                transaction.execute(
                    "UPDATE media_artifacts SET size_bytes = ?1 WHERE id = ?2",
                    params![actual_size, artifact_id],
                )?;
                report.corrected_artifact_sizes += 1;
            }
        } else {
            // A stale or unsafe artifact reference is removed from the index,
            // never from disk. This prevents later UI actions from following
            // a path that no longer belongs to the application.
            transaction.execute(
                "DELETE FROM media_artifacts WHERE id = ?1",
                params![artifact_id],
            )?;
            report.removed_stale_artifacts += 1;
        }
    }

    for (output_id, raw_path, stored_size) in output_rows {
        let path = PathBuf::from(&raw_path);
        if path.is_file() {
            // A user can change the media root between sessions. Preserve an
            // existing output in that case and only refresh its size; purge
            // still performs its own root-safety check before moving it.
            let actual_size = i64::try_from(
                fs::metadata(&path)
                    .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?
                    .len(),
            )
            .unwrap_or(i64::MAX);
            if stored_size != actual_size {
                transaction.execute(
                    "UPDATE generated_outputs SET size_bytes = ?1 WHERE id = ?2",
                    params![actual_size, output_id],
                )?;
                report.corrected_output_sizes += 1;
            }
            continue;
        }

        // A purge may have committed its history immediately before the
        // process stopped. If the row still points at the old path, recover
        // the path to the copy that is present in the configured media root or
        // in the app-owned trash so undo remains possible.
        let replacement = transaction
            .query_row(
                "SELECT original_path, trash_path
                 FROM generated_output_purge
                 WHERE output_id = ?1
                 ORDER BY purge_id DESC
                 LIMIT 1",
                params![output_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let replacement = replacement.and_then(|(original, trash)| {
            [PathBuf::from(trash), PathBuf::from(original)]
                .into_iter()
                .find(|candidate| {
                    candidate.is_file()
                        && (path_is_within_existing(candidate, media_root)
                            || path_is_within_existing(candidate, &trash_root))
                })
        });

        if let Some(replacement) = replacement {
            let actual_size = i64::try_from(
                fs::metadata(&replacement)
                    .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?
                    .len(),
            )
            .unwrap_or(i64::MAX);
            transaction.execute(
                "UPDATE generated_outputs SET path = ?1, size_bytes = ?2 WHERE id = ?3",
                params![
                    replacement.to_string_lossy().to_string(),
                    actual_size,
                    output_id
                ],
            )?;
            report.repaired_output_paths += 1;
        } else {
            transaction.execute(
                "DELETE FROM generated_output_purge WHERE output_id = ?1",
                params![output_id],
            )?;
            transaction.execute(
                "DELETE FROM generated_outputs WHERE id = ?1",
                params![output_id],
            )?;
            report.removed_stale_outputs += 1;
        }
    }

    transaction.commit()?;
    Ok(report)
}

pub fn repair_library(conn: &Connection) -> Result<LibraryRepairReport> {
    let total_jobs: usize = conn.query_row("SELECT COUNT(*) FROM jobs", [], |row| row.get(0))?;

    let interrupted_jobs = conn.execute(
        "UPDATE jobs SET status = 'queued', progress = 0, retry_count = 0, error_message = NULL
         WHERE status = 'processing'
            OR error_message LIKE '%interrumpió%'
            OR error_message LIKE '%interrumpio%'",
        [],
    )?;

    let mut stmt = conn.prepare(
        "SELECT job_id, video_path, audio_path, video_bytes, audio_bytes FROM media
         WHERE (video_path IS NOT NULL AND video_path != '')
            OR (audio_path IS NOT NULL AND audio_path != '')",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<i64>>(3)?,
            row.get::<_, Option<i64>>(4)?,
        ))
    })?;
    let mut missing_ids = Vec::new();
    for row in rows {
        let (job_id, video_path, audio_path, stored_video_bytes, stored_audio_bytes) = row?;
        let video_missing = video_path
            .as_deref()
            .is_some_and(|path| !Path::new(path).exists());
        let audio_missing = audio_path
            .as_deref()
            .is_some_and(|path| !Path::new(path).exists());
        let actual_video_bytes = video_path
            .as_deref()
            .filter(|_| !video_missing)
            .and_then(|path| fs::metadata(path).ok())
            .map(|metadata| metadata.len());
        let actual_audio_bytes = audio_path
            .as_deref()
            .filter(|_| !audio_missing)
            .and_then(|path| fs::metadata(path).ok())
            .map(|metadata| metadata.len());
        let video_size_changed = actual_video_bytes
            .map(|value| stored_video_bytes != Some(i64::try_from(value).unwrap_or(i64::MAX)))
            .unwrap_or(stored_video_bytes.is_some());
        let audio_size_changed = actual_audio_bytes
            .map(|value| stored_audio_bytes != Some(i64::try_from(value).unwrap_or(i64::MAX)))
            .unwrap_or(stored_audio_bytes.is_some());
        if video_missing || audio_missing || video_size_changed || audio_size_changed {
            missing_ids.push((
                job_id,
                video_missing,
                audio_missing,
                actual_video_bytes,
                actual_audio_bytes,
            ));
        }
    }

    let missing_media_paths = missing_ids.len();
    for (job_id, video_missing, audio_missing, actual_video_bytes, actual_audio_bytes) in
        missing_ids
    {
        conn.execute(
            "UPDATE media SET
                video_path = CASE WHEN ?1 = 1 THEN NULL ELSE video_path END,
                audio_path = CASE WHEN ?2 = 1 THEN NULL ELSE audio_path END,
                video_bytes = CASE WHEN ?1 = 1 THEN NULL ELSE ?3 END,
                audio_bytes = CASE WHEN ?2 = 1 THEN NULL ELSE ?4 END,
                source_state = CASE
                    WHEN (CASE WHEN ?1 = 1 THEN NULL ELSE video_path END) IS NULL
                     AND (CASE WHEN ?2 = 1 THEN NULL ELSE audio_path END) IS NULL
                    THEN 'unavailable' ELSE source_state END
             WHERE job_id = ?5",
            params![
                video_missing,
                audio_missing,
                actual_video_bytes.map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
                actual_audio_bytes.map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
                job_id,
            ],
        )?;
    }

    // A completed transcript-only record is a valid library item, but its
    // source state must make that fact explicit after a restart.
    conn.execute(
        "UPDATE media SET source_state = 'unavailable'
         WHERE (video_path IS NULL OR video_path = '')
           AND (audio_path IS NULL OR audio_path = '')
           AND source_state = 'local'
           AND job_id IN (SELECT id FROM jobs WHERE status IN ('complete', 'completed', 'done'))",
        [],
    )?;

    Ok(LibraryRepairReport {
        preserved_jobs: total_jobs,
        interrupted_jobs,
        missing_media_paths,
        backup_path: None,
        storage: None,
    })
}

pub fn search_literal_transcripts(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchResult>> {
    let mut stmt = conn.prepare(
        "SELECT ts.job_id, m.title, m.thumbnail, ts.text, ts.segment_index
         FROM transcript_segments ts
         LEFT JOIN media m ON ts.job_id = m.job_id
         WHERE ts.text LIKE ?1 ESCAPE '\\'
         LIMIT ?2",
    )?;
    let escaped_query = query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    let pattern = format!("%{}%", escaped_query);
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
    if let Some(unit) = get_search_unit(conn, job_id, chunk_index) {
        return Some(SearchResult {
            job_id: unit.job_id,
            title: unit.title,
            thumbnail: unit.match_thumbnail,
            chunk_text: unit.text,
            chunk_index: unit.ordinal,
            similarity_score: 0.0,
        });
    }
    let mut stmt = conn
        .prepare(
            "SELECT ts.job_id, m.title, m.thumbnail, ts.text, ts.segment_index
         FROM transcript_segments ts
         LEFT JOIN media m ON ts.job_id = m.job_id
         WHERE ts.job_id = ?1 AND ts.segment_index = ?2
         LIMIT 1",
        )
        .ok()?;
    stmt.query_row(params![job_id, chunk_index], |row| {
        Ok(SearchResult {
            job_id: row.get(0)?,
            title: row.get(1)?,
            thumbnail: row.get(2)?,
            chunk_text: row.get(3)?,
            chunk_index: row.get(4)?,
            similarity_score: 1.0,
        })
    })
    .ok()
}

// =========================================================================
// Profile Channels and Content Items Repository
// =========================================================================

pub fn update_profile_source_metadata(
    conn: &Connection,
    source_id: i64,
    display_name: Option<&str>,
    avatar_url: Option<&str>,
    cover_url: Option<&str>,
    verified: Option<bool>,
    following_count: Option<i64>,
    followers_count: Option<i64>,
    likes_count: Option<i64>,
    posts_count: Option<i64>,
) -> Result<()> {
    conn.execute(
        "UPDATE collection_sources SET
            display_name = coalesce(?2, display_name),
            avatar_url = coalesce(?3, avatar_url),
            cover_url = coalesce(?4, cover_url),
            verified = coalesce(?5, verified),
            following_count = coalesce(?6, following_count),
            followers_count = coalesce(?7, followers_count),
            likes_count = coalesce(?8, likes_count),
            posts_count = coalesce(?9, posts_count),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![
            source_id,
            display_name,
            avatar_url,
            cover_url,
            verified,
            following_count,
            followers_count,
            likes_count,
            posts_count,
        ],
    )?;
    Ok(())
}

pub fn ensure_profile_channels(
    conn: &Connection,
    profile_source_id: i64,
    watch_config_json: &str,
) -> Result<()> {
    let parsed: serde_json::Value =
        serde_json::from_str(watch_config_json).unwrap_or(serde_json::json!({}));
    let posts_enabled = parsed
        .get("posts")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let reposts_enabled = parsed
        .get("reposts")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let saved_enabled = parsed
        .get("saved")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let favorites_enabled = parsed
        .get("favorites")
        .and_then(|v| v.as_bool())
        .or_else(|| parsed.get("likes").and_then(|v| v.as_bool()))
        .unwrap_or(false);

    let channels = [
        ("posts", posts_enabled),
        ("reposts", reposts_enabled),
        ("saved", saved_enabled),
        ("favorites", favorites_enabled),
    ];

    for (kind, enabled) in channels {
        conn.execute(
            "INSERT INTO profile_channels (profile_source_id, kind, enabled, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'idle', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT(profile_source_id, kind) DO UPDATE SET
                 enabled = excluded.enabled,
                 updated_at = CURRENT_TIMESTAMP",
            params![profile_source_id, kind, enabled],
        )?;
    }
    Ok(())
}

pub fn get_profile_channels(
    conn: &Connection,
    profile_source_id: i64,
) -> Result<Vec<ProfileChannelRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, profile_source_id, kind, enabled, status, discovered_count,
                last_discovery_at, last_successful_discovery_at, cursor,
                newest_known_content_id, oldest_known_content_id, error_code,
                error_message, created_at, updated_at
         FROM profile_channels
         WHERE profile_source_id = ?1
         ORDER BY id ASC",
    )?;
    let rows = stmt.query_map(params![profile_source_id], |row| {
        Ok(ProfileChannelRecord {
            id: row.get(0)?,
            profile_source_id: row.get(1)?,
            kind: row.get(2)?,
            enabled: row.get(3)?,
            status: row.get(4)?,
            discovered_count: row.get(5)?,
            last_discovery_at: row.get(6)?,
            last_successful_discovery_at: row.get(7)?,
            cursor: row.get(8)?,
            newest_known_content_id: row.get(9)?,
            oldest_known_content_id: row.get(10)?,
            error_code: row.get(11)?,
            error_message: row.get(12)?,
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

pub fn update_profile_channel_status(
    conn: &Connection,
    profile_source_id: i64,
    kind: &str,
    status: &str,
    error_code: Option<&str>,
    error_message: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE profile_channels SET
            status = ?3,
            error_code = ?4,
            error_message = ?5,
            last_discovery_at = CURRENT_TIMESTAMP,
            last_successful_discovery_at = CASE WHEN ?3 IN ('idle', 'completed_initial_backfill') THEN CURRENT_TIMESTAMP ELSE last_successful_discovery_at END,
            updated_at = CURRENT_TIMESTAMP
         WHERE profile_source_id = ?1 AND kind = ?2",
        params![profile_source_id, kind, status, error_code, error_message],
    )?;
    Ok(())
}

pub fn update_profile_channel_checkpoint(
    conn: &Connection,
    profile_source_id: i64,
    kind: &str,
    status: &str,
    discovered_count: i64,
    cursor: Option<&str>,
    newest_id: Option<&str>,
    oldest_id: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE profile_channels SET
            status = ?3,
            discovered_count = ?4,
            cursor = coalesce(?5, cursor),
            newest_known_content_id = coalesce(?6, newest_known_content_id),
            oldest_known_content_id = coalesce(?7, oldest_known_content_id),
            last_discovery_at = CURRENT_TIMESTAMP,
            last_successful_discovery_at = CURRENT_TIMESTAMP,
            error_code = NULL,
            error_message = NULL,
            updated_at = CURRENT_TIMESTAMP
         WHERE profile_source_id = ?1 AND kind = ?2",
        params![
            profile_source_id,
            kind,
            status,
            discovered_count,
            cursor,
            newest_id,
            oldest_id
        ],
    )?;
    Ok(())
}

pub fn upsert_content_item(
    conn: &Connection,
    platform: &str,
    platform_content_id: &str,
    canonical_url: &str,
    author_id: Option<&str>,
    author_handle: Option<&str>,
    title: Option<&str>,
    published_at: Option<&str>,
    job_id: Option<i64>,
) -> Result<(i64, bool)> {
    let existing: Option<(i64, Option<i64>)> = conn
        .query_row(
            "SELECT id, job_id FROM content_items WHERE platform = ?1 AND platform_content_id = ?2",
            params![platform, platform_content_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    if let Some((id, existing_job_id)) = existing {
        let target_job_id = job_id.or(existing_job_id);
        conn.execute(
            "UPDATE content_items SET
                canonical_url = coalesce(nullif(?1, ''), canonical_url),
                author_id = coalesce(?2, author_id),
                author_handle = coalesce(?3, author_handle),
                title = coalesce(?4, title),
                published_at = coalesce(?5, published_at),
                job_id = coalesce(?6, job_id),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?7",
            params![
                canonical_url,
                author_id,
                author_handle,
                title,
                published_at,
                target_job_id,
                id
            ],
        )?;
        Ok((id, false))
    } else {
        conn.execute(
            "INSERT INTO content_items
                (platform, platform_content_id, canonical_url, author_id, author_handle,
                 title, published_at, discovered_at, updated_at, availability, job_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'available', ?8)",
            params![platform, platform_content_id, canonical_url, author_id, author_handle, title, published_at, job_id],
        )?;
        Ok((conn.last_insert_rowid(), true))
    }
}

pub fn upsert_content_relationship(
    conn: &Connection,
    content_id: i64,
    profile_source_id: i64,
    channel_kind: &str,
    provenance_json: Option<&str>,
    sync_run_id: Option<&str>,
) -> Result<(i64, bool)> {
    let existing_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM content_relationships
         WHERE content_id = ?1 AND profile_source_id = ?2 AND channel_kind = ?3",
            params![content_id, profile_source_id, channel_kind],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(id) = existing_id {
        conn.execute(
            "UPDATE content_relationships SET
                active = 1,
                last_seen_at = CURRENT_TIMESTAMP,
                provenance_json = coalesce(?2, provenance_json),
                sync_run_id = coalesce(?3, sync_run_id)
             WHERE id = ?1",
            params![id, provenance_json, sync_run_id],
        )?;
        Ok((id, false))
    } else {
        conn.execute(
            "INSERT INTO content_relationships
                (content_id, profile_source_id, channel_kind, first_seen_at, last_seen_at, active, provenance_json, sync_run_id)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, ?4, ?5)",
            params![content_id, profile_source_id, channel_kind, provenance_json, sync_run_id],
        )?;
        Ok((conn.last_insert_rowid(), true))
    }
}

pub fn link_content_item_job(conn: &Connection, content_id: i64, job_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE content_items SET job_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![job_id, content_id],
    )?;
    Ok(())
}

#[allow(dead_code)]
pub fn find_content_item_by_platform_id(
    conn: &Connection,
    platform: &str,
    platform_content_id: &str,
) -> Result<Option<ContentItemRecord>> {
    conn.query_row(
        "SELECT id, platform, platform_content_id, canonical_url, author_id,
                author_handle, title, published_at, discovered_at, updated_at,
                availability, job_id
         FROM content_items
         WHERE platform = ?1 AND platform_content_id = ?2",
        params![platform, platform_content_id],
        |row| {
            Ok(ContentItemRecord {
                id: row.get(0)?,
                platform: row.get(1)?,
                platform_content_id: row.get(2)?,
                canonical_url: row.get(3)?,
                author_id: row.get(4)?,
                author_handle: row.get(5)?,
                title: row.get(6)?,
                published_at: row.get(7)?,
                discovered_at: row.get(8)?,
                updated_at: row.get(9)?,
                availability: row.get(10)?,
                job_id: row.get(11)?,
            })
        },
    )
    .optional()
}

#[allow(dead_code)]
pub fn count_channel_content_items(
    conn: &Connection,
    profile_source_id: i64,
    channel_kind: &str,
) -> Result<i64> {
    conn.query_row(
        "SELECT count(*) FROM content_relationships
         WHERE profile_source_id = ?1 AND channel_kind = ?2 AND active = 1",
        params![profile_source_id, channel_kind],
        |row| row.get(0),
    )
}

pub fn get_channel_content_items(
    conn: &Connection,
    profile_source_id: i64,
    channel_kind: &str,
    limit: i64,
) -> Result<Vec<ContentItemRecord>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.platform, c.platform_content_id, c.canonical_url,
                c.author_id, c.author_handle, c.title, c.published_at,
                c.discovered_at, c.updated_at, c.availability, c.job_id
         FROM content_items c
         INNER JOIN content_relationships r ON c.id = r.content_id
         WHERE r.profile_source_id = ?1 AND r.channel_kind = ?2 AND r.active = 1
         ORDER BY c.published_at DESC, c.discovered_at DESC
         LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![profile_source_id, channel_kind, limit], |row| {
        Ok(ContentItemRecord {
            id: row.get(0)?,
            platform: row.get(1)?,
            platform_content_id: row.get(2)?,
            canonical_url: row.get(3)?,
            author_id: row.get(4)?,
            author_handle: row.get(5)?,
            title: row.get(6)?,
            published_at: row.get(7)?,
            discovered_at: row.get(8)?,
            updated_at: row.get(9)?,
            availability: row.get(10)?,
            job_id: row.get(11)?,
        })
    })?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_sources_deduplication_saved_and_reposts() {
        // Requirement 39.A: same video in saved + repost -> 1 ContentItem, 2 relationships
        let conn = memory_db();
        let selection = crate::application::collection_service::ProfileSourceSelection {
            posts: true,
            reposts: true,
            saved: true,
            favorites: false,
        };
        let profile = crate::application::collection_service::register_profile_source(
            &conn,
            "@testcreator",
            &selection,
        )
        .unwrap();
        let source_id = profile.source.id;

        // Discovered video in 'saved'
        let (content_id_1, is_new_1) = upsert_content_item(
            &conn,
            "tiktok",
            "740011223344",
            "https://www.tiktok.com/@testcreator/video/740011223344",
            None,
            Some("@testcreator"),
            Some("Viral Video"),
            Some("2026-09-01"),
            None,
        )
        .unwrap();
        assert!(is_new_1);

        let (rel_id_1, rel_new_1) = upsert_content_relationship(
            &conn,
            content_id_1,
            source_id,
            "saved",
            Some("{\"reason\":\"user_saved\"}"),
            Some("sync-1"),
        )
        .unwrap();
        assert!(rel_new_1);

        // Same video discovered in 'reposts'
        let (content_id_2, is_new_2) = upsert_content_item(
            &conn,
            "tiktok",
            "740011223344",
            "https://www.tiktok.com/@testcreator/video/740011223344",
            None,
            Some("@testcreator"),
            Some("Viral Video"),
            Some("2026-09-01"),
            None,
        )
        .unwrap();
        assert!(!is_new_2, "Must not be considered new content item");
        assert_eq!(content_id_1, content_id_2, "Same content item ID");

        let (rel_id_2, rel_new_2) = upsert_content_relationship(
            &conn,
            content_id_2,
            source_id,
            "reposts",
            Some("{\"reason\":\"creator_reposted\"}"),
            Some("sync-1"),
        )
        .unwrap();
        assert!(rel_new_2);
        assert_ne!(rel_id_1, rel_id_2, "Different relationship IDs");

        // Verify total counts in DB
        let total_items: i64 = conn
            .query_row("SELECT count(*) FROM content_items", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            total_items, 1,
            "Invariant 1: exactly ONE ContentItem in SQLite"
        );

        let total_relationships: i64 = conn
            .query_row("SELECT count(*) FROM content_relationships", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(
            total_relationships, 2,
            "Invariant 2: TWO relationships for the single content item"
        );
    }

    #[test]
    fn profile_sources_deduplication_across_two_profiles() {
        // Requirement 39.B: same video in two profiles -> 1 ContentItem, 2 relationships
        let conn = memory_db();
        let selection = crate::application::collection_service::ProfileSourceSelection {
            posts: true,
            reposts: false,
            saved: true,
            favorites: false,
        };
        let p1 = crate::application::collection_service::register_profile_source(
            &conn,
            "@user_alpha",
            &selection,
        )
        .unwrap();
        let p2 = crate::application::collection_service::register_profile_source(
            &conn,
            "@user_beta",
            &selection,
        )
        .unwrap();

        let (c1, new_c1) = upsert_content_item(
            &conn,
            "tiktok",
            "9988776655",
            "https://www.tiktok.com/@someone/video/9988776655",
            None,
            Some("@someone"),
            Some("Shared Video"),
            Some("2026-09-10"),
            None,
        )
        .unwrap();
        assert!(new_c1);

        upsert_content_relationship(&conn, c1, p1.source.id, "saved", None, None).unwrap();

        let (c2, new_c2) = upsert_content_item(
            &conn,
            "tiktok",
            "9988776655",
            "https://www.tiktok.com/@someone/video/9988776655",
            None,
            Some("@someone"),
            Some("Shared Video"),
            Some("2026-09-10"),
            None,
        )
        .unwrap();
        assert!(!new_c2);
        assert_eq!(c1, c2);

        upsert_content_relationship(&conn, c2, p2.source.id, "posts", None, None).unwrap();

        let total_items: i64 = conn
            .query_row("SELECT count(*) FROM content_items", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total_items, 1);

        let total_rel: i64 = conn
            .query_row("SELECT count(*) FROM content_relationships", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(total_rel, 2);
    }

    #[test]
    fn profile_sources_canonical_url_variants_and_id_extraction() {
        // Requirement 39.C: canonical URL variants -> same ContentItem
        use crate::application::profile_discovery_service::extract_content_id_from_url;
        use crate::url_utils::canonicalize_tiktok_url;

        let raw1 = "https://www.tiktok.com/@dancer/video/7350001112223334445?is_from_webapp=1&sender_device=pc";
        let raw2 = "https://tiktok.com/@dancer/video/7350001112223334445";

        let canonical1 = canonicalize_tiktok_url(raw1);
        let canonical2 = canonicalize_tiktok_url(raw2);
        assert_eq!(canonical1, canonical2);

        let id1 = extract_content_id_from_url(&canonical1, None);
        let id2 = extract_content_id_from_url(&canonical2, None);
        assert_eq!(id1, "7350001112223334445");
        assert_eq!(id2, "7350001112223334445");
    }

    #[test]
    fn profile_sources_removed_saved_relationship_preserves_content() {
        // Requirement 39.D: removed saved relationship -> content remains
        let conn = memory_db();
        let selection = crate::application::collection_service::ProfileSourceSelection {
            posts: false,
            reposts: false,
            saved: true,
            favorites: false,
        };
        let p = crate::application::collection_service::register_profile_source(
            &conn,
            "@preservetest",
            &selection,
        )
        .unwrap();

        let (c_id, _) = upsert_content_item(
            &conn,
            "tiktok",
            "112233",
            "https://www.tiktok.com/@author/video/112233",
            None,
            Some("@author"),
            Some("Item to keep"),
            None,
            None,
        )
        .unwrap();

        let (rel_id, _) =
            upsert_content_relationship(&conn, c_id, p.source.id, "saved", None, None).unwrap();

        // Simulate unsave / relationship removal
        conn.execute(
            "UPDATE content_relationships SET active = 0 WHERE id = ?1",
            [rel_id],
        )
        .unwrap();

        // Invariant 8: turning off a source or un-saving does not delete the content item
        let content_still_exists = conn
            .query_row(
                "SELECT count(*) FROM content_items WHERE id = ?1",
                [c_id],
                |r| r.get::<_, i64>(0),
            )
            .unwrap();
        assert_eq!(
            content_still_exists, 1,
            "Content item must remain in library even if relationship deactivated"
        );
    }

    #[test]
    fn profile_sources_unknown_metrics_remain_null_not_zero() {
        // Requirement 39.E: Invariant 9: unknown count -> remains null, not 0
        let conn = memory_db();
        let selection = crate::application::collection_service::ProfileSourceSelection {
            posts: true,
            reposts: false,
            saved: false,
            favorites: false,
        };
        let p = crate::application::collection_service::register_profile_source(
            &conn,
            "@nulltest",
            &selection,
        )
        .unwrap();

        // Update metadata with known followers (e.g. 500) but unknown likes and unknown posts
        update_profile_source_metadata(
            &conn,
            p.source.id,
            Some("Display Name"),
            None,
            None,
            Some(false),
            None,      // following unknown
            Some(500), // followers known
            None,      // likes unknown
            None,      // posts unknown
        )
        .unwrap();

        let stored = get_collection_source(&conn, p.source.id).unwrap();
        assert_eq!(stored.followers_count, Some(500));
        assert_eq!(
            stored.following_count, None,
            "Unknown following must remain None (null), not 0"
        );
        assert_eq!(
            stored.likes_count, None,
            "Unknown likes must remain None (null), not 0"
        );
        assert_eq!(
            stored.posts_count, None,
            "Unknown posts must remain None (null), not 0"
        );
    }

    #[test]
    fn profile_sources_channel_ordering_newest_first() {
        // Requirement 40.A: results returned newest-first -> inventory preserves newest-first
        let conn = memory_db();
        let selection = crate::application::collection_service::ProfileSourceSelection {
            posts: true,
            reposts: false,
            saved: false,
            favorites: false,
        };
        let p = crate::application::collection_service::register_profile_source(
            &conn,
            "@newestfirst",
            &selection,
        )
        .unwrap();

        // Insert items in mixed order with timestamps
        let (id_old, _) = upsert_content_item(
            &conn,
            "tiktok",
            "vid_1",
            "https://tiktok.com/@newestfirst/video/vid_1",
            None,
            Some("@newestfirst"),
            Some("Old Video"),
            Some("2026-01-01T00:00:00Z"),
            None,
        )
        .unwrap();
        let (id_mid, _) = upsert_content_item(
            &conn,
            "tiktok",
            "vid_2",
            "https://tiktok.com/@newestfirst/video/vid_2",
            None,
            Some("@newestfirst"),
            Some("Mid Video"),
            Some("2026-05-01T00:00:00Z"),
            None,
        )
        .unwrap();
        let (id_new, _) = upsert_content_item(
            &conn,
            "tiktok",
            "vid_3",
            "https://tiktok.com/@newestfirst/video/vid_3",
            None,
            Some("@newestfirst"),
            Some("New Video"),
            Some("2026-09-01T00:00:00Z"),
            None,
        )
        .unwrap();

        upsert_content_relationship(&conn, id_old, p.source.id, "posts", None, None).unwrap();
        upsert_content_relationship(&conn, id_mid, p.source.id, "posts", None, None).unwrap();
        upsert_content_relationship(&conn, id_new, p.source.id, "posts", None, None).unwrap();

        let items = get_channel_content_items(&conn, p.source.id, "posts", 10).unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(
            items[0].platform_content_id, "vid_3",
            "Newest item must be first"
        );
        assert_eq!(items[1].platform_content_id, "vid_2", "Middle item second");
        assert_eq!(items[2].platform_content_id, "vid_1", "Oldest item last");
    }

    #[test]
    fn profile_sources_checkpoint_persistence_and_resumption() {
        // Requirement 40.B & 42: checkpoint persistence & reopen recovery
        let _guard = DATA_DIR_TEST_LOCK.lock().unwrap();
        let test_dir = std::env::temp_dir().join(format!(
            "pulsaria-checkpoint-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&test_dir).unwrap();
        std::env::set_var("PULSAR_DATA_DIR", &test_dir);

        let selection = crate::application::collection_service::ProfileSourceSelection {
            posts: true,
            reposts: true,
            saved: true,
            favorites: false,
        };

        let source_id = {
            let conn = init_db().unwrap();
            let reg = crate::application::collection_service::register_profile_source(
                &conn,
                "@checkpointuser",
                &selection,
            )
            .unwrap();
            ensure_profile_channels(&conn, reg.source.id, &reg.source.watch_config_json).unwrap();

            // Simulate discovering 850 items
            update_profile_channel_checkpoint(
                &conn,
                reg.source.id,
                "posts",
                "idle",
                850,
                Some("cursor_page_8"),
                Some("vid_850"),
                Some("vid_1"),
            )
            .unwrap();
            reg.source.id
        };

        // Close and reopen DB (simulating Pulsaria restart)
        {
            let conn = init_db().unwrap();
            let channels = get_profile_channels(&conn, source_id).unwrap();
            let posts_channel = channels
                .iter()
                .find(|c| c.kind == "posts")
                .expect("posts channel must exist");

            assert_eq!(posts_channel.discovered_count, 850);
            assert_eq!(posts_channel.cursor.as_deref(), Some("cursor_page_8"));
            assert_eq!(
                posts_channel.newest_known_content_id.as_deref(),
                Some("vid_850")
            );
            assert_eq!(
                posts_channel.oldest_known_content_id.as_deref(),
                Some("vid_1")
            );
            assert_eq!(posts_channel.status, "idle");
        }
    }

    #[test]
    fn profile_sources_queue_integration_dedup_and_existing_pipeline() {
        // Requirement 41: TESTS — QUEUE INTEGRATION
        // A. new ContentItem -> existing Pulsaria processing queue
        // B. already-downloaded content -> no second download
        // C. already-transcribed content -> no duplicate transcription
        let conn = memory_db();
        let selection = crate::application::collection_service::ProfileSourceSelection {
            posts: true,
            reposts: true,
            saved: true,
            favorites: false,
        };
        let p = crate::application::collection_service::register_profile_source(
            &conn,
            "@queuetest",
            &selection,
        )
        .unwrap();

        // 1. Discover item 1
        let (c_id, is_new) = upsert_content_item(
            &conn,
            "tiktok",
            "799001",
            "https://www.tiktok.com/@queuetest/video/799001",
            None,
            Some("@queuetest"),
            Some("Fresh Video"),
            Some("2026-09-20T12:00:00Z"),
            None,
        )
        .unwrap();
        assert!(is_new);
        upsert_content_relationship(&conn, c_id, p.source.id, "posts", None, None).unwrap();

        // 2. Canonical queue insertion (reusing insert_job)
        let job_id = insert_job(&conn, "https://www.tiktok.com/@queuetest/video/799001").unwrap();
        link_content_item_job(&conn, c_id, job_id).unwrap();

        // Verify job created in standard Pulsaria queue
        let (job_status, job_url): (String, String) = conn
            .query_row(
                "SELECT status, url FROM jobs WHERE id = ?1",
                [job_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(job_status, "queued");
        assert_eq!(job_url, "https://www.tiktok.com/@queuetest/video/799001");

        // 3. Mark job as completed and media downloaded & transcribed
        update_job_status(&conn, job_id, "completed", 100).unwrap();
        conn.execute(
            "INSERT INTO media (job_id, title, author, platform) VALUES (?1, ?2, ?3, ?4)",
            params![job_id, "Fresh Video", "@queuetest", "tiktok"],
        )
        .unwrap();

        // 4. Same video discovered in 'saved' channel:
        let (c_id_2, is_new_2) = upsert_content_item(
            &conn,
            "tiktok",
            "799001",
            "https://www.tiktok.com/@queuetest/video/799001",
            None,
            Some("@queuetest"),
            Some("Fresh Video"),
            Some("2026-09-20T12:00:00Z"),
            None,
        )
        .unwrap();
        assert!(!is_new_2, "Discovered item is not new");
        assert_eq!(c_id, c_id_2);
        upsert_content_relationship(&conn, c_id_2, p.source.id, "saved", None, None).unwrap();

        // Check if content already has a linked job
        let existing = find_content_item_by_platform_id(&conn, "tiktok", "799001")
            .unwrap()
            .unwrap();
        assert_eq!(existing.job_id, Some(job_id));

        // Invariant 2 & 7: exactly 1 job in queue, 1 media row, 2 relationships
        let total_jobs: i64 = conn
            .query_row("SELECT count(*) FROM jobs", [], |r| r.get(0))
            .unwrap();
        let total_media: i64 = conn
            .query_row("SELECT count(*) FROM media", [], |r| r.get(0))
            .unwrap();
        let total_rels: i64 = conn
            .query_row("SELECT count(*) FROM content_relationships", [], |r| {
                r.get(0)
            })
            .unwrap();

        assert_eq!(total_jobs, 1, "Must NOT create duplicate job in queue");
        assert_eq!(total_media, 1, "Must NOT duplicate downloaded media");
        assert_eq!(total_rels, 2, "Must record both relationships");
    }

    static DATA_DIR_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn user_data_directory_prefers_new_name_without_orphaning_legacy_data() {
        let base = std::env::temp_dir().join(format!(
            "pulsaria-data-path-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let current = base.join("Pulsar Eventide");
        let legacy = base.join("Pulsaria");

        assert_eq!(user_data_dir(base.clone()), current);
        fs::create_dir_all(&legacy).unwrap();
        assert_eq!(user_data_dir(base.clone()), legacy);
        fs::create_dir_all(&current).unwrap();
        assert_eq!(user_data_dir(base.clone()), current);

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn playlist_memberships_are_content_canonical_and_idempotent() {
        let conn = memory_db();
        let first_job =
            insert_job(&conn, "https://www.tiktok.com/@creator/video/74001?lang=es").unwrap();
        let duplicate_job = insert_job(&conn, "https://tiktok.com/@creator/video/74001/").unwrap();
        assert_eq!(
            first_job, duplicate_job,
            "URL variants must reuse the same job"
        );

        let content_count: i64 = conn
            .query_row("SELECT count(*) FROM content_items", [], |row| row.get(0))
            .unwrap();
        assert_eq!(content_count, 1, "one canonical content identity per video");

        let first_playlist =
            create_playlist(&conn, "Favoritos de prueba", None, "#8a5cff", false).unwrap();
        let second_playlist = create_playlist(&conn, "Otra lista", None, "#25f4ee", false).unwrap();
        add_job_to_playlist(&conn, first_playlist, first_job).unwrap();
        add_job_to_playlist(&conn, first_playlist, first_job).unwrap();
        add_job_to_playlist(&conn, second_playlist, first_job).unwrap();

        let membership_count: i64 = conn
            .query_row("SELECT count(*) FROM playlist_items", [], |row| row.get(0))
            .unwrap();
        assert_eq!(membership_count, 2, "adding twice must be idempotent");
        let distinct_content_count: i64 = conn
            .query_row(
                "SELECT count(DISTINCT content_id) FROM playlist_items",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            distinct_content_count, 1,
            "the same content can belong to many playlists"
        );
    }

    #[test]
    fn removing_or_deleting_playlist_preserves_jobs_and_content() {
        let conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@creator/video/74002").unwrap();
        let playlist_id = create_playlist(&conn, "Lista durable", None, "#8a5cff", false).unwrap();
        add_job_to_playlist(&conn, playlist_id, job_id).unwrap();

        remove_job_from_playlist(&conn, playlist_id, job_id).unwrap();
        let after_remove: i64 = conn
            .query_row("SELECT count(*) FROM playlist_items", [], |row| row.get(0))
            .unwrap();
        assert_eq!(after_remove, 0);
        assert!(conn
            .query_row("SELECT 1 FROM jobs WHERE id = ?1", params![job_id], |row| {
                row.get::<_, i64>(0)
            })
            .optional()
            .unwrap()
            .is_some());
        assert_eq!(
            conn.query_row("SELECT count(*) FROM content_items", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );

        add_job_to_playlist(&conn, playlist_id, job_id).unwrap();
        delete_playlist(&conn, playlist_id).unwrap();
        assert_eq!(
            conn.query_row("SELECT count(*) FROM playlist_items", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM jobs", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM content_items", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }

    #[test]
    fn playlist_content_view_keeps_remote_memberships_without_jobs() {
        let conn = memory_db();
        let playlist_id =
            create_playlist(&conn, "Contenido remoto", None, "#25f4ee", false).unwrap();
        let (content_id, _) = upsert_content_item(
            &conn,
            "tiktok",
            "remote-74004",
            "https://www.tiktok.com/@creator/video/74004",
            None,
            Some("@creator"),
            Some("Pendiente de ingestión"),
            None,
            None,
        )
        .unwrap();
        conn.execute(
            "UPDATE content_items SET availability = 'pending' WHERE id = ?1",
            params![content_id],
        )
        .unwrap();
        add_content_to_playlist(&conn, playlist_id, content_id, "user").unwrap();

        let views = get_playlist_content_views(&conn, playlist_id).unwrap();
        assert_eq!(views.len(), 1);
        assert_eq!(views[0].content_id, content_id);
        assert_eq!(views[0].job_id, None);
        assert_eq!(views[0].job.id, -content_id);
        assert_eq!(views[0].availability, "pending");
        assert_eq!(views[0].job.source_state, "online");
    }

    #[test]
    fn source_content_view_uses_the_shared_projection_without_a_job() {
        let conn = memory_db();
        let selection = crate::application::collection_service::ProfileSourceSelection {
            posts: true,
            saved: false,
            favorites: false,
            reposts: false,
        };
        let registered = crate::application::collection_service::register_profile_source(
            &conn,
            "@remotesource",
            &selection,
        )
        .unwrap();
        let (content_id, _) = upsert_content_item(
            &conn,
            "tiktok",
            "remote-source-1",
            "https://www.tiktok.com/@remotesource/video/remote-source-1",
            None,
            Some("@remotesource"),
            Some("Remote source item"),
            None,
            None,
        )
        .unwrap();
        upsert_content_relationship(&conn, content_id, registered.source.id, "posts", None, None)
            .unwrap();

        let views = get_channel_content_views(&conn, registered.source.id, "posts", 50).unwrap();
        assert_eq!(views.len(), 1);
        assert_eq!(views[0].content_id, content_id);
        assert_eq!(views[0].job_id, None);
        assert_eq!(views[0].job.id, -content_id);
        assert_eq!(views[0].availability, "available");
    }

    #[test]
    fn migrates_legacy_playlist_memberships_to_content_ids() {
        let mut conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@creator/video/74003").unwrap();
        let playlist_id = create_playlist(&conn, "Migración", None, "#8a5cff", true).unwrap();

        conn.execute("DROP TABLE playlist_items", []).unwrap();
        conn.execute(
            "CREATE TABLE playlist_items (
                playlist_id INTEGER NOT NULL,
                job_id INTEGER NOT NULL,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (playlist_id, job_id)
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO playlist_items (playlist_id, job_id, added_at)
             VALUES (?1, ?2, '2026-01-02T03:04:05Z')",
            params![playlist_id, job_id],
        )
        .unwrap();

        let transaction = conn.transaction().unwrap();
        migrate_playlist_memberships(&transaction).unwrap();
        transaction.commit().unwrap();

        let (content_id, added_at, added_by): (i64, String, String) = conn
            .query_row(
                "SELECT content_id, added_at, added_by FROM playlist_items WHERE playlist_id = ?1",
                params![playlist_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert!(content_id > 0);
        assert_eq!(added_at, "2026-01-02T03:04:05Z");
        assert_eq!(added_by, "legacy_auto");
    }

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite");
        conn.execute_batch(
            "CREATE TABLE jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                canonical_url TEXT,
                status TEXT NOT NULL DEFAULT 'queued',
                progress INTEGER NOT NULL DEFAULT 0,
                retry_count INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE job_activity_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                progress INTEGER NOT NULL DEFAULT 0,
                user_message TEXT,
                technical_error TEXT,
                error_code TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE media (
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
                visual_analysis TEXT,
                instructional_guide TEXT,
                video_bytes INTEGER,
                audio_bytes INTEGER,
                downloaded_at DATETIME,
                last_accessed_at DATETIME,
                play_count INTEGER NOT NULL DEFAULT 0,
                open_count INTEGER NOT NULL DEFAULT 0,
                search_hit_count INTEGER NOT NULL DEFAULT 0,
                favorite BOOLEAN NOT NULL DEFAULT 0,
                pinned BOOLEAN NOT NULL DEFAULT 0,
                source_state TEXT NOT NULL DEFAULT 'local',
                purged_at DATETIME,
                purged_reason TEXT,
                poster_path TEXT
            );
            CREATE TABLE transcript_embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding_vector BLOB NOT NULL
            );
            CREATE TABLE transcript_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                segment_index INTEGER NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                text TEXT NOT NULL
            );
             CREATE TABLE media_artifacts (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 job_id INTEGER NOT NULL,
                 kind TEXT NOT NULL,
                path TEXT NOT NULL,
                timestamp REAL,
                label TEXT,
                protected BOOLEAN NOT NULL DEFAULT 0,
                 size_bytes INTEGER NOT NULL DEFAULT 0,
                 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
             );
             CREATE TABLE generated_outputs (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 job_id INTEGER NOT NULL,
                 category TEXT NOT NULL,
                 format TEXT NOT NULL,
                 path TEXT NOT NULL,
                 size_bytes INTEGER NOT NULL DEFAULT 0,
                 validated BOOLEAN NOT NULL DEFAULT 0,
                 label TEXT NOT NULL,
                 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
             );
             CREATE TABLE generated_output_purge (
                 purge_id INTEGER NOT NULL,
                 output_id INTEGER NOT NULL,
                 original_path TEXT NOT NULL,
                 trash_path TEXT NOT NULL
             );
             CREATE TABLE purge_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                original_video_path TEXT,
                original_audio_path TEXT,
                trash_video_path TEXT,
                trash_audio_path TEXT,
                reason TEXT NOT NULL,
                undone_at DATETIME,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE collection_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL UNIQUE,
                source_type TEXT NOT NULL DEFAULT 'collection',
                browser TEXT,
                profile_url TEXT,
                platform TEXT NOT NULL DEFAULT 'tiktok',
                username TEXT,
                 display_name TEXT,
                 avatar_url TEXT,
                 cover_url TEXT,
                 verified BOOLEAN,
                 following_count INTEGER,
                 followers_count INTEGER,
                 likes_count INTEGER,
                 posts_count INTEGER,
                 active BOOLEAN NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'active',
                capabilities_json TEXT NOT NULL DEFAULT '{}',
                watch_config_json TEXT NOT NULL DEFAULT '{}',
                initial_import_mode TEXT NOT NULL DEFAULT 'new_only',
                history_limit INTEGER,
                history_from TEXT,
                rules_json TEXT NOT NULL DEFAULT '{}',
                interval_minutes INTEGER NOT NULL DEFAULT 15,
                last_attempt_at DATETIME,
                last_sync_at DATETIME,
                last_success_at DATETIME,
                next_sync_at DATETIME,
                discovered_count INTEGER NOT NULL DEFAULT 0,
                consecutive_failures INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                 last_sync_summary_json TEXT,
                 last_synced_at DATETIME,
                 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                 updated_at DATETIME
             );
            CREATE TABLE collection_source_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER NOT NULL,
                canonical_url TEXT NOT NULL,
                platform_video_id TEXT,
                activity_types_json TEXT NOT NULL DEFAULT '[]',
                state TEXT NOT NULL,
                job_id INTEGER,
                reason TEXT,
                first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(source_id, canonical_url)
            );
            CREATE TABLE collection_source_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                event_type TEXT NOT NULL,
                activity_type TEXT,
                message TEXT NOT NULL,
                canonical_url TEXT,
                job_id INTEGER,
                state TEXT,
                found_count INTEGER NOT NULL DEFAULT 0,
                queued_count INTEGER NOT NULL DEFAULT 0,
                duplicate_count INTEGER NOT NULL DEFAULT 0,
                ignored_count INTEGER NOT NULL DEFAULT 0,
                error_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE health_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                component TEXT NOT NULL,
                severity TEXT NOT NULL,
                diagnosis TEXT NOT NULL,
                action TEXT,
                result TEXT
            );
             CREATE TABLE embedding_metadata (
                 id INTEGER PRIMARY KEY CHECK(id = 1),
                 provider_id TEXT NOT NULL DEFAULT 'onnx',
                 model_id TEXT NOT NULL,
                 model_version TEXT NOT NULL DEFAULT '',
                 model_hash TEXT NOT NULL,
                 tokenizer_hash TEXT,
                 dimensions INTEGER NOT NULL,
                 generated_at DATETIME,
                 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
             );
            CREATE TABLE profile_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_source_id INTEGER NOT NULL,
                kind TEXT NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'idle',
                discovered_count INTEGER NOT NULL DEFAULT 0,
                last_discovery_at DATETIME,
                last_successful_discovery_at DATETIME,
                cursor TEXT,
                newest_known_content_id TEXT,
                oldest_known_content_id TEXT,
                error_code TEXT,
                error_message TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(profile_source_id, kind)
            );
             CREATE TABLE content_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL DEFAULT 'tiktok',
                platform_content_id TEXT NOT NULL,
                canonical_url TEXT NOT NULL,
                author_id TEXT,
                author_handle TEXT,
                title TEXT,
                published_at DATETIME,
                discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                availability TEXT NOT NULL DEFAULT 'available',
                job_id INTEGER,
                 UNIQUE(platform, platform_content_id)
             );
             CREATE TABLE search_units (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 job_id INTEGER NOT NULL,
                 content_id INTEGER,
                 representation TEXT NOT NULL,
                 ordinal INTEGER NOT NULL,
                 text TEXT NOT NULL,
                 start_time REAL,
                 end_time REAL,
                 language TEXT,
                 artifact_id INTEGER,
                 provenance_json TEXT,
                 confidence REAL,
                 source_hash TEXT,
                 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                 UNIQUE(job_id, representation, ordinal)
             );
             CREATE TABLE search_embeddings (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 search_unit_id INTEGER NOT NULL,
                 provider_id TEXT NOT NULL,
                 model_version TEXT NOT NULL,
                 dimensions INTEGER NOT NULL,
                 vector_blob BLOB NOT NULL,
                 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                 UNIQUE(search_unit_id, provider_id, model_version)
             );
             CREATE TABLE content_annotations (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 job_id INTEGER NOT NULL,
                 content_id INTEGER,
                 annotation_type TEXT NOT NULL,
                 normalized_value TEXT NOT NULL,
                 display_value TEXT NOT NULL,
                 confidence REAL,
                 source TEXT NOT NULL,
                 evidence_unit_id INTEGER,
                 start_time REAL,
                 end_time REAL,
                 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                 UNIQUE(job_id, annotation_type, normalized_value, source)
             );
             CREATE TABLE search_enrichment_status (
                 job_id INTEGER NOT NULL,
                 stage TEXT NOT NULL,
                 status TEXT NOT NULL DEFAULT 'pending',
                 version TEXT,
                 error_message TEXT,
                 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                 PRIMARY KEY(job_id, stage)
             );
             CREATE VIRTUAL TABLE search_units_fts USING fts5(
                 text,
                 representation UNINDEXED,
                 job_id UNINDEXED,
                 tokenize = 'unicode61 remove_diacritics 2'
             );
             CREATE TABLE content_relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_id INTEGER NOT NULL,
                profile_source_id INTEGER NOT NULL,
                channel_kind TEXT NOT NULL,
                first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                active BOOLEAN NOT NULL DEFAULT 1,
                provenance_json TEXT,
                sync_run_id TEXT,
                UNIQUE(profile_source_id, channel_kind, content_id)
            );
            CREATE TABLE playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                color TEXT NOT NULL DEFAULT '#8a5cff',
                is_smart BOOLEAN NOT NULL DEFAULT 0,
                auto_generated BOOLEAN NOT NULL DEFAULT 0,
                cover_job_id INTEGER,
                topic_keywords TEXT DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                kind TEXT NOT NULL DEFAULT 'manual',
                sort_mode TEXT NOT NULL DEFAULT 'manual',
                smart_query TEXT,
                smart_filters_json TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE playlist_items (
                playlist_id INTEGER NOT NULL,
                content_id INTEGER NOT NULL,
                position REAL NOT NULL DEFAULT 0,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                added_by TEXT NOT NULL DEFAULT 'user',
                PRIMARY KEY (playlist_id, content_id)
            );",
        )
        .expect("Failed to create test schema");
        conn
    }

    #[cfg(debug_assertions)]
    #[test]
    fn debug_data_dir_is_pinned_to_the_workspace() {
        let previous = std::env::var_os("PULSAR_DATA_DIR");
        std::env::remove_var("PULSAR_DATA_DIR");
        let path = data_dir_path();
        assert!(path.ends_with("data"));
        assert!(path.parent().unwrap().join("package.json").exists());
        if let Some(previous) = previous {
            std::env::set_var("PULSAR_DATA_DIR", previous);
        }
    }

    fn test_embedding(first: f32, second: f32) -> Vec<f32> {
        let mut embedding = vec![0.0; EMBEDDING_DIMS];
        embedding[0] = first;
        embedding[1] = second;
        embedding
    }

    #[test]
    fn unified_search_units_keep_timestamps_and_migrate_legacy_vectors() {
        let mut conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@test/video/search-units").unwrap();
        insert_or_update_media_metadata(
            &conn,
            job_id,
            &MediaMetadata {
                title: "Óptimo opset 17 en local",
                author: "Pulsaria Lab",
                thumbnail: "poster.jpg",
                duration: 30,
                upload_date: "20260923",
                video_path: "video.mp4",
                audio_path: "audio.mp3",
                transcript_path: "transcript.txt",
                platform: "tiktok",
            },
        )
        .unwrap();

        let embedding = test_embedding(1.0, 0.0);
        replace_search_units_with_embeddings(
            &mut conn,
            job_id,
            &[SearchUnitInput {
                ordinal: 0,
                text: "Óptimo opset 17 funciona localmente".to_string(),
                start_time: Some(12.5),
                end_time: Some(16.0),
                representation: SearchRepresentation::Transcript,
                language: Some("es".to_string()),
                artifact_id: None,
                provenance_json: Some(r#"{"source":"whisper"}"#.to_string()),
                confidence: Some(0.98),
            }],
            &[embedding.clone()],
            "onnx",
            EMBEDDING_MODEL_ID,
        )
        .unwrap();

        let hits = search_search_units(&conn, "optimo opset 17", 10, true).unwrap();
        assert!(
            !hits.is_empty(),
            "FTS5 should remove diacritics for exact search"
        );
        assert_eq!(hits[0].unit.start_time, Some(12.5));
        assert_eq!(hits[0].unit.end_time, Some(16.0));
        assert_eq!(
            hits[0].unit.representation,
            SearchRepresentation::Transcript
        );

        conn.execute(
            "DELETE FROM search_embeddings WHERE search_unit_id IN (SELECT id FROM search_units WHERE job_id = ?1)",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO transcript_embeddings(job_id, chunk_index, chunk_text, embedding_vector)
             VALUES (?1, 0, ?2, ?3)",
            params![job_id, "legacy", serialize_embedding(&embedding).unwrap()],
        )
        .unwrap();
        let transaction = conn.transaction().unwrap();
        migrate_legacy_search_embeddings(&transaction).unwrap();
        transaction.commit().unwrap();
        let migrated_dimensions: i64 = conn
            .query_row(
                "SELECT dimensions FROM search_embeddings se
                 JOIN search_units su ON su.id = se.search_unit_id
                 WHERE su.job_id = ?1",
                params![job_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(migrated_dimensions, EMBEDDING_DIMS as i64);
    }

    #[test]
    fn structured_relationship_and_category_filters_are_hard_constraints() {
        let conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@test/video/filtering").unwrap();
        let content_id = upsert_content_item(
            &conn,
            "tiktok",
            "filtering",
            "https://www.tiktok.com/@test/video/filtering",
            None,
            Some("@test"),
            Some("Receta local"),
            Some("2026-09-20"),
            Some(job_id),
        )
        .unwrap()
        .0;
        conn.execute(
            "INSERT INTO content_relationships(content_id, profile_source_id, channel_kind)
             VALUES (?1, 1, 'saved')",
            params![content_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO content_annotations(job_id, content_id, annotation_type,
                 normalized_value, display_value, confidence, source)
             VALUES (?1, ?2, 'category', 'recipe', 'Recipe', 0.9, 'test')",
            params![job_id, content_id],
        )
        .unwrap();
        let filters = ParsedFilters {
            relationship: Some("saved".to_string()),
            content_type: Some("recipe".to_string()),
            ..ParsedFilters::default()
        };
        assert!(job_matches_filters(&conn, job_id, &filters).unwrap());

        let wrong_relationship = ParsedFilters {
            relationship: Some("liked".to_string()),
            ..filters
        };
        assert!(!job_matches_filters(&conn, job_id, &wrong_relationship).unwrap());
    }

    #[test]
    fn ocr_units_are_timestamped_idempotent_and_linked_to_keyframes() {
        let mut conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@test/video/ocr").unwrap();
        conn.execute(
            "INSERT INTO media_artifacts(job_id, kind, path, timestamp, size_bytes)
             VALUES (?1, 'keyframe', 'frame-01.jpg', 18.0, 10)",
            params![job_id],
        )
        .unwrap();
        let visual = r#"{
            "ocr_available": true,
            "frames": [{
                "timestamp": 18.0,
                "ocr_text": "180°C",
                "artifact_path": "frame-01.jpg"
            }]
        }"#;
        assert_eq!(
            index_visual_search_units(&mut conn, job_id, Some(visual)).unwrap(),
            1
        );
        assert_eq!(
            index_visual_search_units(&mut conn, job_id, Some(visual)).unwrap(),
            1
        );
        let (count, artifact_id): (i64, Option<i64>) = conn
            .query_row(
                "SELECT COUNT(*), MAX(artifact_id) FROM search_units
                 WHERE job_id = ?1 AND representation = 'ocr'",
                params![job_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(count, 1);
        assert!(artifact_id.is_some());
        let status: String = conn
            .query_row(
                "SELECT status FROM search_enrichment_status WHERE job_id = ?1 AND stage = 'ocr'",
                params![job_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "ready");
    }

    #[test]
    fn searches_embeddings_without_touching_the_user_database() {
        let conn = memory_db();
        let first = insert_job(&conn, "https://www.tiktok.com/@test/video/21").unwrap();
        let second = insert_job(&conn, "https://www.tiktok.com/@test/video/22").unwrap();
        insert_transcript_chunk(
            &conn,
            first,
            0,
            "marketing viral",
            &test_embedding(1.0, 0.0),
        )
        .unwrap();
        insert_transcript_chunk(&conn, second, 0, "cocina", &test_embedding(0.0, 1.0)).unwrap();

        let results = search_embeddings(&conn, &test_embedding(1.0, 0.0), 10, 0.35).unwrap();
        assert_eq!(results.first().map(|result| result.job_id), Some(first));
        assert!(results.iter().all(|result| result.job_id != second));
    }

    #[test]
    fn rejects_embeddings_with_wrong_shape_before_writing() {
        let conn = memory_db();
        let job_id = insert_job(
            &conn,
            "https://www.tiktok.com/@test/video/invalid-embedding",
        )
        .unwrap();

        assert!(insert_transcript_chunk(&conn, job_id, 0, "invalido", &[1.0, 0.0]).is_err());
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM transcript_embeddings WHERE job_id = ?1",
                params![job_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn replacing_embeddings_is_atomic_and_preserves_transcript_segments() {
        let mut conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@test/video/atomic").unwrap();
        insert_transcript_segment(&conn, job_id, 0, 0.0, 1.0, "segmento original").unwrap();
        insert_transcript_chunk(
            &conn,
            job_id,
            0,
            "embedding anterior",
            &test_embedding(1.0, 0.0),
        )
        .unwrap();

        replace_transcript_embeddings(
            &mut conn,
            job_id,
            &[(1, "embedding nueva".to_string(), test_embedding(0.0, 1.0))],
        )
        .unwrap();

        assert_eq!(
            get_transcript_text_for_job(&conn, job_id).unwrap(),
            vec!["segmento original".to_string()]
        );
        let results = search_embeddings(&conn, &test_embedding(0.0, 1.0), 10, 0.35).unwrap();
        assert_eq!(
            results.first().map(|result| result.chunk_text.as_str()),
            Some("embedding nueva")
        );
        assert_eq!(results.first().map(|result| result.chunk_index), Some(1));
    }

    #[test]
    fn worker_result_persistence_rolls_back_metadata_and_transcript_together() {
        let mut conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@test/video/worker-atomic").unwrap();
        let original_metadata = MediaMetadata {
            title: "Título original",
            author: "Autor original",
            thumbnail: "thumb-original",
            duration: 12,
            upload_date: "2026-01-01",
            video_path: "video-original.mp4",
            audio_path: "audio-original.mp3",
            transcript_path: "transcript-original.txt",
            platform: "tiktok",
        };
        insert_or_update_media_metadata(&conn, job_id, &original_metadata).unwrap();
        insert_transcript_segment(&conn, job_id, 0, 0.0, 1.0, "segmento original").unwrap();
        update_media_analysis(
            &conn,
            job_id,
            Some("análisis original"),
            Some("guía original"),
        )
        .unwrap();

        conn.execute_batch(
            "CREATE TRIGGER fail_worker_result_segment
             BEFORE INSERT ON transcript_segments
             WHEN NEW.text = 'segmento que falla'
             BEGIN
                 SELECT RAISE(ABORT, 'segmento rechazado por el fixture');
             END;",
        )
        .unwrap();

        let updated_metadata = MediaMetadata {
            title: "Título nuevo",
            author: "Autor nuevo",
            thumbnail: "thumb-nuevo",
            duration: 24,
            upload_date: "2026-02-02",
            video_path: "video-nuevo.mp4",
            audio_path: "audio-nuevo.mp3",
            transcript_path: "transcript-nuevo.txt",
            platform: "tiktok",
        };
        let result = persist_worker_result(
            &mut conn,
            job_id,
            Some(&updated_metadata),
            &[
                (0, 0.0, 1.0, "segmento nuevo".to_string()),
                (1, 1.0, 2.0, "segmento que falla".to_string()),
            ],
            Some("análisis nuevo"),
            Some("guía nueva"),
        );

        assert!(result.is_err());
        let job = get_job_by_id(&conn, job_id).unwrap().unwrap();
        assert_eq!(job.title.as_deref(), Some("Título original"));
        assert_eq!(job.visual_analysis.as_deref(), Some("análisis original"));
        assert_eq!(job.instructional_guide.as_deref(), Some("guía original"));
        assert_eq!(
            get_transcript_text_for_job(&conn, job_id).unwrap(),
            vec!["segmento original".to_string()]
        );
    }

    #[test]
    fn stale_job_cleanup_does_not_touch_active_queue_claims() {
        let conn = memory_db();
        let active_job = insert_job(&conn, "https://www.tiktok.com/@test/video/active").unwrap();
        let stale_job = insert_job(&conn, "https://www.tiktok.com/@test/video/stale").unwrap();
        let complete_job =
            insert_job(&conn, "https://www.tiktok.com/@test/video/complete").unwrap();

        update_job_status(&conn, active_job, "processing", 42).unwrap();
        update_job_status(&conn, stale_job, "queued", 0).unwrap();
        update_job_status(&conn, complete_job, "complete", 100).unwrap();
        conn.execute(
            "UPDATE jobs SET created_at = datetime('now', '-3 hours') WHERE id IN (?1, ?2, ?3)",
            params![active_job, stale_job, complete_job],
        )
        .unwrap();

        assert_eq!(mark_stale_jobs(&conn, &[active_job]).unwrap(), 1);
        assert_eq!(
            get_job_by_id(&conn, active_job).unwrap().unwrap().status,
            "processing"
        );
        assert_eq!(
            get_job_by_id(&conn, stale_job).unwrap().unwrap().status,
            "error"
        );
        assert_eq!(
            get_job_by_id(&conn, complete_job).unwrap().unwrap().status,
            "complete"
        );
    }

    #[test]
    fn retry_state_is_persisted_and_reset_cleanly() {
        let conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@test/video/retry").unwrap();

        update_job_retrying(&conn, job_id, 2).unwrap();
        let retrying = get_job_by_id(&conn, job_id).unwrap().unwrap();
        assert_eq!(retrying.status, "retrying");
        assert_eq!(retrying.progress, 0);
        assert_eq!(retrying.retry_count, 2);
        assert!(retrying.error_message.is_none());

        reset_job_for_retry(&conn, job_id).unwrap();
        let queued = get_job_by_id(&conn, job_id).unwrap().unwrap();
        assert_eq!(queued.status, "queued");
        assert_eq!(queued.retry_count, 0);
    }

    #[test]
    fn activity_timeline_records_real_transitions_and_errors() {
        let conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@test/video/activity").unwrap();

        update_job_status(&conn, job_id, "downloading", 15).unwrap();
        update_job_status(&conn, job_id, "downloading", 50).unwrap();
        update_job_status(&conn, job_id, "transcribing", 65).unwrap();
        update_job_error(
            &conn,
            job_id,
            "error",
            "ProcessSpawnError: worker unavailable",
        )
        .unwrap();

        let events = get_job_activity(&conn, job_id).unwrap();
        assert_eq!(
            events
                .iter()
                .map(|event| event.status.as_str())
                .collect::<Vec<_>>(),
            ["queued", "downloading", "transcribing", "error",]
        );
        assert_eq!(events[1].progress, 15);
        assert_eq!(
            events[3].error_code.as_deref(),
            Some("LOCAL_WORKER_START_FAILED")
        );
        assert_eq!(
            events[3].user_message.as_deref(),
            Some("No pudimos completar este trabajo.")
        );
        assert_eq!(
            events[3].technical_error.as_deref(),
            Some("ProcessSpawnError: worker unavailable")
        );
    }

    #[test]
    fn canonical_url_variants_do_not_create_a_second_job() {
        let conn = memory_db();
        let first = insert_job(
            &conn,
            "https://tiktok.com/@creator/video/123?is_from_webapp=1#share",
        )
        .unwrap();
        assert_eq!(
            find_job_id_by_url(&conn, "https://www.tiktok.com/@creator/video/123/").unwrap(),
            Some(first)
        );
        assert_eq!(
            insert_job(&conn, "https://www.tiktok.com/@creator/video/123/").unwrap(),
            first
        );
    }

    #[test]
    fn source_success_and_failure_have_bounded_schedules() {
        let conn = memory_db();
        register_collection_source_with_browser(
            &conn,
            "https://tiktok.com/@creator/?lang=es",
            Some("edge"),
        )
        .unwrap();
        let source = get_collection_sources(&conn).unwrap().remove(0);
        assert_eq!(source.browser.as_deref(), Some("edge"));
        assert_eq!(source.source_type, "profile");

        mark_collection_source_failed(&conn, source.id, "cookies expired").unwrap();
        let failed = get_collection_sources(&conn).unwrap().remove(0);
        assert_eq!(failed.consecutive_failures, 1);
        assert_eq!(failed.last_error.as_deref(), Some("cookies expired"));

        mark_collection_source_synced(&conn, source.id, 3).unwrap();
        let recovered = get_collection_sources(&conn).unwrap().remove(0);
        assert_eq!(recovered.consecutive_failures, 0);
        assert_eq!(recovered.discovered_count, 3);
        assert!(recovered.last_error.is_none());
    }

    #[test]
    fn profile_source_registration_persists_selection_and_deduplicates() {
        let conn = memory_db();
        let selection = crate::application::collection_service::ProfileSourceSelection {
            posts: true,
            reposts: false,
            saved: true,
            favorites: true,
        };

        let first = crate::application::collection_service::register_profile_source(
            &conn, "@daniel", &selection,
        )
        .unwrap();
        assert!(!first.duplicate);
        assert_eq!(first.source.profile_url, "https://www.tiktok.com/@daniel");
        assert_eq!(first.source.status, "ready");

        let duplicate = crate::application::collection_service::register_profile_source(
            &conn,
            "https://tiktok.com/@daniel/",
            &selection,
        )
        .unwrap();
        assert!(duplicate.duplicate);
        assert_eq!(duplicate.source.id, first.source.id);
        assert_eq!(
            get_collection_sources(&conn).unwrap().len(),
            1,
            "canonical profile variants must share one SQLite row"
        );

        let stored = get_collection_source(&conn, first.source.id).unwrap();
        assert_eq!(
            stored.watch_config_json,
            r#"{"posts":true,"likes":true,"saved":true,"reposts":false}"#
        );
        assert!(get_collection_sources_to_sync(&conn).unwrap().is_empty());

        let paused = crate::application::collection_service::ProfileSourceSelection {
            posts: false,
            reposts: false,
            saved: false,
            favorites: false,
        };
        let updated = crate::application::collection_service::update_profile_source_settings(
            &conn,
            first.source.id,
            &paused,
        )
        .unwrap();
        assert_eq!(updated.status, "paused");
        assert!(!updated.active);
        let reloaded = get_collection_source(&conn, first.source.id).unwrap();
        assert_eq!(reloaded.status, "paused");
        assert_eq!(
            reloaded.watch_config_json,
            r#"{"posts":false,"likes":false,"saved":false,"reposts":false}"#
        );
    }

    #[test]
    fn profile_source_survives_database_reopen_with_updated_settings() {
        let _guard = DATA_DIR_TEST_LOCK.lock().unwrap();
        let original = std::env::var_os("PULSAR_DATA_DIR");
        let test_dir = std::env::temp_dir().join(format!(
            "pulsaria-profile-source-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&test_dir).unwrap();
        std::env::set_var("PULSAR_DATA_DIR", &test_dir);

        let selection = crate::application::collection_service::ProfileSourceSelection {
            posts: true,
            reposts: false,
            saved: false,
            favorites: false,
        };
        let source_id = {
            let connection = init_db().unwrap();
            crate::application::collection_service::register_profile_source(
                &connection,
                "@persisted",
                &selection,
            )
            .unwrap()
            .source
            .id
        };

        let updated_selection = crate::application::collection_service::ProfileSourceSelection {
            posts: false,
            reposts: false,
            saved: true,
            favorites: false,
        };
        {
            let connection = init_db().unwrap();
            let stored = get_collection_source(&connection, source_id).unwrap();
            assert_eq!(stored.status, "ready");
            assert_eq!(stored.username.as_deref(), Some("@persisted"));
            crate::application::collection_service::update_profile_source_settings(
                &connection,
                source_id,
                &updated_selection,
            )
            .unwrap();
        }

        let reopened = init_db().unwrap();
        let stored = get_collection_source(&reopened, source_id).unwrap();
        assert_eq!(stored.status, "ready");
        assert_eq!(
            stored.watch_config_json,
            r#"{"posts":false,"likes":false,"saved":true,"reposts":false}"#
        );
        drop(reopened);

        if let Some(value) = original {
            std::env::set_var("PULSAR_DATA_DIR", value);
        } else {
            std::env::remove_var("PULSAR_DATA_DIR");
        }
        fs::remove_dir_all(&test_dir).unwrap();
    }

    #[test]
    fn repair_preserves_jobs_and_clears_only_missing_paths() {
        let conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@test/video/31").unwrap();
        insert_or_update_media_metadata(
            &conn,
            job_id,
            &MediaMetadata {
                title: "Video",
                author: "Creator",
                thumbnail: "",
                duration: 10,
                upload_date: "",
                video_path: "Z:/definitely-missing-pulsaria-video.mp4",
                audio_path: "",
                transcript_path: "",
                platform: "tiktok",
            },
        )
        .unwrap();
        update_job_status(&conn, job_id, "processing", 50).unwrap();
        let legacy_interrupted_id =
            insert_job(&conn, "https://www.tiktok.com/@test/video/32").unwrap();
        update_job_error(
            &conn,
            legacy_interrupted_id,
            "error",
            "El procesamiento se interrumpió al cerrarse Pulsaria. Puedes reintentarlo.",
        )
        .unwrap();

        let report = repair_library(&conn).unwrap();
        assert_eq!(report.preserved_jobs, 2);
        assert_eq!(report.interrupted_jobs, 2);
        assert_eq!(report.missing_media_paths, 1);
        let repaired = get_job_by_id(&conn, job_id).unwrap().unwrap();
        assert_eq!(repaired.status, "queued");
        assert_eq!(repaired.retry_count, 0);
        assert!(repaired.error_message.is_none());
        assert!(repaired.video_path.is_none());
        let repaired_legacy = get_job_by_id(&conn, legacy_interrupted_id)
            .unwrap()
            .unwrap();
        assert_eq!(repaired_legacy.status, "queued");
        assert!(repaired_legacy.error_message.is_none());
    }

    #[test]
    fn storage_reconciliation_refreshes_sizes_and_removes_only_stale_references() {
        let _guard = DATA_DIR_TEST_LOCK.lock().unwrap();
        let previous_data_dir = std::env::var_os("PULSAR_DATA_DIR");
        let data_dir = std::env::temp_dir().join(format!(
            "pulsaria-reconcile-data-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let media_root = std::env::temp_dir().join(format!(
            "pulsaria-reconcile-media-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::env::set_var("PULSAR_DATA_DIR", &data_dir);

        let conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@test/video/reconcile").unwrap();
        let artifact_dir = data_dir.join("artifacts").join(job_id.to_string());
        fs::create_dir_all(&artifact_dir).unwrap();
        let artifact_path = artifact_dir.join("poster.jpg");
        fs::write(&artifact_path, b"poster").unwrap();
        let stale_artifact = artifact_dir.join("missing.jpg");
        conn.execute(
            "INSERT INTO media_artifacts (job_id, kind, path, size_bytes)
             VALUES (?1, 'poster', ?2, 999), (?1, 'keyframe', ?3, 123)",
            params![
                job_id,
                artifact_path.to_string_lossy().to_string(),
                stale_artifact.to_string_lossy().to_string()
            ],
        )
        .unwrap();

        let output_path = media_root
            .join("media")
            .join(job_id.to_string())
            .join("exports")
            .join("video.mp4");
        fs::create_dir_all(output_path.parent().unwrap()).unwrap();
        fs::write(&output_path, b"generated video").unwrap();
        let stale_output = media_root
            .join("media")
            .join(job_id.to_string())
            .join("gone.mp4");
        conn.execute(
            "INSERT INTO generated_outputs
                 (job_id, category, format, path, size_bytes, validated, label)
             VALUES (?1, 'video', 'mp4', ?2, 999, 1, 'VIDEO MP4'),
                    (?1, 'video', 'mkv', ?3, 999, 1, 'VIDEO MKV')",
            params![
                job_id,
                output_path.to_string_lossy().to_string(),
                stale_output.to_string_lossy().to_string()
            ],
        )
        .unwrap();

        let report = reconcile_storage(&conn, &media_root).unwrap();
        assert_eq!(report.checked_artifacts, 2);
        assert_eq!(report.corrected_artifact_sizes, 1);
        assert_eq!(report.removed_stale_artifacts, 1);
        assert_eq!(report.checked_generated_outputs, 2);
        assert_eq!(report.corrected_output_sizes, 1);
        assert_eq!(report.removed_stale_outputs, 1);
        assert_eq!(fs::metadata(&artifact_path).unwrap().len(), 6);
        assert_eq!(fs::metadata(&output_path).unwrap().len(), 15);
        assert_eq!(
            conn.query_row(
                "SELECT size_bytes FROM media_artifacts WHERE path = ?1",
                params![artifact_path.to_string_lossy().to_string()],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            6
        );
        assert_eq!(
            conn.query_row(
                "SELECT size_bytes FROM generated_outputs WHERE path = ?1",
                params![output_path.to_string_lossy().to_string()],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            15
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM media_artifacts", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM generated_outputs", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );

        if let Some(previous) = previous_data_dir {
            std::env::set_var("PULSAR_DATA_DIR", previous);
        } else {
            std::env::remove_var("PULSAR_DATA_DIR");
        }
        fs::remove_dir_all(data_dir).unwrap();
        fs::remove_dir_all(media_root).unwrap();
    }

    #[test]
    fn clear_staging_never_removes_durable_transcript() {
        let conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@test/video/staging").unwrap();
        let root = std::env::temp_dir().join(format!(
            "pulsaria-staging-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let staging_root = root.join(".pulsaria").join("staging");
        let job_dir = staging_root.join(job_id.to_string());
        fs::create_dir_all(&job_dir).unwrap();
        fs::write(job_dir.join("video.mp4"), b"partial video").unwrap();
        fs::write(job_dir.join("audio.mp3"), b"partial audio").unwrap();

        let transcript_path = root.join("transcripts").join(format!("{job_id}.txt"));
        fs::create_dir_all(transcript_path.parent().unwrap()).unwrap();
        fs::write(&transcript_path, "conocimiento durable").unwrap();
        let staged_video_path = job_dir.join("video.mp4").to_string_lossy().to_string();
        let staged_audio_path = job_dir.join("audio.mp3").to_string_lossy().to_string();
        let transcript_path_string = transcript_path.to_string_lossy().to_string();
        insert_or_update_media_metadata(
            &conn,
            job_id,
            &MediaMetadata {
                title: "Video en staging",
                author: "Creator",
                thumbnail: "",
                duration: 3,
                upload_date: "",
                video_path: &staged_video_path,
                audio_path: &staged_audio_path,
                transcript_path: &transcript_path_string,
                platform: "tiktok",
            },
        )
        .unwrap();

        clear_staging_job(&conn, job_id, &staging_root).unwrap();

        let job = get_job_by_id(&conn, job_id).unwrap().unwrap();
        assert!(job.video_path.is_none());
        assert!(job.audio_path.is_none());
        assert_eq!(
            job.transcript_path.as_deref(),
            Some(transcript_path_string.as_str())
        );
        assert_eq!(
            fs::read_to_string(&transcript_path).unwrap(),
            "conocimiento durable"
        );
        assert!(!job_dir.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn migrates_a_legacy_database_after_creating_a_backup() {
        let _guard = DATA_DIR_TEST_LOCK.lock().unwrap();
        let original = std::env::var_os("PULSAR_DATA_DIR");
        let unique = format!(
            "pulsaria-migration-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        let test_dir = std::env::temp_dir().join(unique);
        fs::create_dir_all(&test_dir).unwrap();
        let legacy_path = test_dir.join("library.db");
        let legacy = Connection::open(&legacy_path).unwrap();
        legacy
            .execute_batch(
                "PRAGMA user_version = 1;
                 CREATE TABLE collection_sources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_url TEXT NOT NULL UNIQUE,
                    source_kind TEXT NOT NULL DEFAULT 'tiktok',
                    enabled BOOLEAN NOT NULL DEFAULT 1,
                    last_synced_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                 );
                 INSERT INTO collection_sources (source_url, source_kind, enabled)
                 VALUES ('https://www.tiktok.com/@creator', 'tiktok', 0);",
            )
            .unwrap();
        drop(legacy);

        std::env::set_var("PULSAR_DATA_DIR", &test_dir);
        let migrated = init_db().unwrap();
        let version: i64 = migrated
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        let has_browser = migrated
            .prepare("PRAGMA table_info(collection_sources)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .any(|column| matches!(column.as_deref(), Ok("browser")));
        let migrated_source = get_collection_sources(&migrated).unwrap().remove(0);
        drop(migrated);
        let backups = fs::read_dir(test_dir.join("backups")).unwrap().count();

        if let Some(value) = original {
            std::env::set_var("PULSAR_DATA_DIR", value);
        } else {
            std::env::remove_var("PULSAR_DATA_DIR");
        }
        fs::remove_dir_all(&test_dir).unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        assert!(has_browser);
        assert_eq!(backups, 1);
        assert_eq!(migrated_source.url, "https://www.tiktok.com/@creator");
        assert_eq!(migrated_source.source_type, "profile");
        assert!(!migrated_source.active);
    }

    #[test]
    fn recovers_legacy_duplicate_canonical_urls_without_blocking_startup() {
        let _guard = DATA_DIR_TEST_LOCK.lock().unwrap();
        let original = std::env::var_os("PULSAR_DATA_DIR");
        let test_dir = std::env::temp_dir().join(format!(
            "pulsaria-duplicate-url-migration-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&test_dir).unwrap();
        let legacy_path = test_dir.join("library.db");
        let legacy = Connection::open(&legacy_path).unwrap();
        legacy
            .execute_batch(
                "PRAGMA user_version = 1;
                 CREATE TABLE jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    url TEXT NOT NULL,
                    canonical_url TEXT,
                    status TEXT NOT NULL DEFAULT 'queued',
                    progress INTEGER NOT NULL DEFAULT 0,
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    error_message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                 );
                 CREATE UNIQUE INDEX ux_jobs_canonical_url
                    ON jobs(canonical_url)
                    WHERE canonical_url IS NOT NULL AND canonical_url <> '';
                 INSERT INTO jobs (url) VALUES
                    ('https://www.tiktok.com/@creator/video/123?utm_source=one'),
                    ('https://www.tiktok.com/@creator/video/123?utm_source=two');",
            )
            .unwrap();
        drop(legacy);

        std::env::set_var("PULSAR_DATA_DIR", &test_dir);
        let migrated = init_db().unwrap();
        let canonical_urls = migrated
            .prepare("SELECT id, canonical_url FROM jobs ORDER BY id")
            .unwrap()
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        drop(migrated);

        if let Some(value) = original {
            std::env::set_var("PULSAR_DATA_DIR", value);
        } else {
            std::env::remove_var("PULSAR_DATA_DIR");
        }
        fs::remove_dir_all(&test_dir).unwrap();

        assert_eq!(canonical_urls.len(), 2);
        assert_eq!(
            canonical_urls[0].1.as_deref(),
            Some("https://www.tiktok.com/@creator/video/123")
        );
        assert!(canonical_urls[1].1.is_none());
    }

    #[test]
    fn embedding_metadata_marks_index_stale_when_model_fingerprint_changes() {
        let conn = memory_db();
        let model_dir = std::env::temp_dir().join(format!(
            "pulsaria-embedding-model-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&model_dir).unwrap();
        fs::write(model_dir.join("model.onnx"), b"model-v1").unwrap();
        fs::write(model_dir.join("tokenizer.json"), b"tokenizer-v1").unwrap();

        let initial = get_embedding_index_status(&conn, &model_dir).unwrap();
        assert!(initial.stale);
        assert!(initial.stored_hash.is_none());
        record_embedding_model(&conn, &initial.current_hash).unwrap();

        let current = get_embedding_index_status(&conn, &model_dir).unwrap();
        assert!(!current.stale);
        assert_eq!(
            current.stored_hash.as_deref(),
            Some(initial.current_hash.as_str())
        );

        fs::write(model_dir.join("tokenizer.json"), b"tokenizer-v2").unwrap();
        let changed = get_embedding_index_status(&conn, &model_dir).unwrap();
        assert!(changed.stale);
        assert_ne!(changed.current_hash, initial.current_hash);

        fs::remove_dir_all(model_dir).unwrap();
    }

    #[test]
    fn persists_analysis_errors_and_preserves_media_paths() {
        let conn = memory_db();
        let job_id = insert_job(&conn, "https://www.tiktok.com/@test/video/1").unwrap();
        insert_or_update_media_metadata(
            &conn,
            job_id,
            &MediaMetadata {
                title: "Título",
                author: "Autor",
                thumbnail: "https://example.com/thumb.jpg",
                duration: 12,
                upload_date: "20260830",
                video_path: "video.mp4",
                audio_path: "audio.mp3",
                transcript_path: "transcript.txt",
                platform: "tiktok",
            },
        )
        .unwrap();
        update_media_analysis(&conn, job_id, Some("{\"frames\":5}"), Some("Guía")).unwrap();

        // Metadata events after download carry empty paths; they must not
        // erase the paths already persisted by the pipeline.
        insert_or_update_media_metadata(
            &conn,
            job_id,
            &MediaMetadata {
                title: "Título actualizado",
                author: "Autor",
                thumbnail: "",
                duration: 13,
                upload_date: "",
                video_path: "",
                audio_path: "",
                transcript_path: "",
                platform: "",
            },
        )
        .unwrap();
        update_job_error(&conn, job_id, "error", "worker failed").unwrap();

        let job = get_job_by_id(&conn, job_id).unwrap().unwrap();
        assert_eq!(job.video_path.as_deref(), Some("video.mp4"));
        assert_eq!(job.error_message.as_deref(), Some("worker failed"));
        assert_eq!(job.visual_analysis.as_deref(), Some("{\"frames\":5}"));
        assert_eq!(job.instructional_guide.as_deref(), Some("Guía"));

        update_job_status(&conn, job_id, "complete", 100).unwrap();
        let completed = get_job_by_id(&conn, job_id).unwrap().unwrap();
        assert!(completed.error_message.is_none());
    }

    #[test]
    fn clusters_jobs_using_centroid_embeddings() {
        let conn = memory_db();
        let first = insert_job(&conn, "https://www.tiktok.com/@test/video/11").unwrap();
        let second = insert_job(&conn, "https://www.tiktok.com/@test/video/12").unwrap();
        let third = insert_job(&conn, "https://www.tiktok.com/@test/video/13").unwrap();
        for job_id in [first, second, third] {
            update_job_status(&conn, job_id, "complete", 100).unwrap();
        }
        insert_transcript_chunk(&conn, first, 0, "uno", &test_embedding(1.0, 0.0)).unwrap();
        insert_transcript_chunk(&conn, first, 1, "dos", &test_embedding(0.9, 0.1)).unwrap();
        insert_transcript_chunk(&conn, second, 0, "tres", &test_embedding(0.0, 1.0)).unwrap();
        insert_transcript_chunk(&conn, third, 0, "cuatro", &test_embedding(1.0, 0.0)).unwrap();

        let clusters = cluster_videos_by_similarity(&conn, 0.8, 2).unwrap();
        assert!(clusters.iter().any(|cluster| {
            cluster.contains(&first) && cluster.contains(&third) && !cluster.contains(&second)
        }));
    }
}
