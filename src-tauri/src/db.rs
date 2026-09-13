use rusqlite::{params, Connection, OptionalExtension, Result, Row};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct JobRecord {
    pub id: i64,
    pub url: String,
    pub status: String,
    pub progress: i32,
    pub retry_count: u32,
    pub created_at: String,
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

pub const EMBEDDING_DIMENSIONS: usize = 384;
const EMBEDDING_BYTES: usize = EMBEDDING_DIMENSIONS * std::mem::size_of::<f32>();

fn validate_embedding(embedding: &[f32]) -> Result<()> {
    if embedding.len() != EMBEDDING_DIMENSIONS {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "embedding dimension mismatch: expected {}, got {}",
            EMBEDDING_DIMENSIONS,
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
    pub item_count: i64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CollectionSourceRecord {
    pub id: i64,
    pub url: String,
    pub source_type: String,
    pub browser: Option<String>,
    pub active: bool,
    pub interval_minutes: i64,
    pub last_attempt_at: Option<String>,
    pub last_success_at: Option<String>,
    pub next_sync_at: Option<String>,
    pub discovered_count: i64,
    pub consecutive_failures: i64,
    pub last_error: Option<String>,
    pub created_at: String,
}

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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct LibraryRepairReport {
    pub interrupted_jobs: usize,
    pub missing_media_paths: usize,
    pub preserved_jobs: usize,
    pub backup_path: Option<String>,
}

pub const SCHEMA_VERSION: i64 = 6;
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
            FOREIGN KEY(job_id) REFERENCES jobs(id)
        )",
        [],
    )?;

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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    for (column, definition) in [
        ("color", "TEXT NOT NULL DEFAULT '#8a5cff'"),
        ("is_smart", "BOOLEAN NOT NULL DEFAULT 0"),
        ("auto_generated", "BOOLEAN NOT NULL DEFAULT 0"),
        ("cover_job_id", "INTEGER"),
        ("topic_keywords", "TEXT DEFAULT '[]'"),
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
        ("interval_minutes", "INTEGER NOT NULL DEFAULT 15"),
        ("last_attempt_at", "DATETIME"),
        ("last_success_at", "DATETIME"),
        ("next_sync_at", "DATETIME"),
        ("discovered_count", "INTEGER NOT NULL DEFAULT 0"),
        ("consecutive_failures", "INTEGER NOT NULL DEFAULT 0"),
        ("last_error", "TEXT"),
    ] {
        ensure_column(&transaction, "collection_sources", column, definition)?;
    }
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
    for index in [
        "CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)",
        "CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_jobs_url ON jobs(url)",
        "CREATE INDEX IF NOT EXISTS idx_jobs_canonical_url ON jobs(canonical_url)",
        "CREATE INDEX IF NOT EXISTS idx_segments_job_id ON transcript_segments(job_id, segment_index)",
        "CREATE INDEX IF NOT EXISTS idx_embeddings_job_id ON transcript_embeddings(job_id, chunk_index)",
        "CREATE INDEX IF NOT EXISTS idx_media_job_id ON media(job_id)",
        "CREATE INDEX IF NOT EXISTS idx_media_source_state ON media(source_state, keep_status)",
        "CREATE INDEX IF NOT EXISTS idx_media_access ON media(last_accessed_at, downloaded_at)",
        "CREATE INDEX IF NOT EXISTS idx_media_artifacts_job_id ON media_artifacts(job_id, kind)",
        "CREATE INDEX IF NOT EXISTS idx_purge_history_job_id ON purge_history(job_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_playlist_items_job_id ON playlist_items(job_id)",
        "CREATE INDEX IF NOT EXISTS idx_collection_sources_due ON collection_sources(active, next_sync_at)",
        "CREATE INDEX IF NOT EXISTS idx_health_events_created_at ON health_events(created_at DESC)",
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
        return Ok(existing_id);
    }

    match conn.execute(
        "INSERT INTO jobs (url, canonical_url, status, progress, retry_count)
         VALUES (?1, ?2, 'queued', 0, 0)",
        params![url, canonical_url],
    ) {
        Ok(_) => Ok(conn.last_insert_rowid()),
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
    let rows = conn.execute(
        "UPDATE jobs SET status = ?1, progress = ?2,
            error_message = CASE WHEN ?1 IN ('error', 'error_dlq') THEN error_message ELSE NULL END
         WHERE id = ?3",
        params![status, progress, id],
    )?;
    require_rows_changed(rows)
}

pub fn update_job_retrying(conn: &Connection, id: i64, attempt: u32) -> Result<()> {
    let rows = conn.execute(
        "UPDATE jobs SET status = 'retrying', progress = 0, retry_count = ?1, error_message = NULL WHERE id = ?2",
        params![attempt, id],
    )?;
    require_rows_changed(rows)
}

pub fn reset_job_for_retry(conn: &Connection, id: i64) -> Result<()> {
    let rows = conn.execute(
        "UPDATE jobs SET status = 'queued', progress = 0, retry_count = 0, error_message = NULL WHERE id = ?1",
        params![id],
    )?;
    require_rows_changed(rows)
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
            item_count: row.get(8)?,
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
    let mut stmt = conn.prepare(&format!(
        "SELECT {}
         FROM playlist_items pi
         JOIN jobs j ON pi.job_id = j.id
         LEFT JOIN media m ON j.id = m.job_id
         WHERE pi.playlist_id = ?1
         ORDER BY pi.added_at DESC",
        JOB_SELECT_COLUMNS
    ))?;

    let job_iter = stmt.query_map(params![playlist_id], job_record_from_row)?;

    let mut jobs = Vec::new();
    for job in job_iter {
        jobs.push(job?);
    }
    Ok(jobs)
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

    // Keep the repository layout convenient during development without
    // writing beside an installed executable in a protected directory.
    if let Ok(current_dir) = std::env::current_dir() {
        if current_dir.join("package.json").exists() && current_dir.join("src-tauri").is_dir() {
            return current_dir.join("data");
        }
    }

    #[cfg(windows)]
    if let Some(app_data) = std::env::var_os("APPDATA") {
        return std::path::PathBuf::from(app_data).join("Pulsaria");
    }

    if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
        return std::path::PathBuf::from(data_home).join("Pulsaria");
    }
    if let Some(home) = std::env::var_os("HOME") {
        return std::path::PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("Pulsaria");
    }

    std::path::PathBuf::from("data")
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
    require_rows_changed(rows)
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
        return conn.execute(base_query, []);
    }

    let placeholders = std::iter::repeat_n("?", active_job_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!("{base_query} AND id NOT IN ({placeholders})");
    conn.execute(&query, rusqlite::params_from_iter(active_job_ids.iter()))
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
            "INSERT INTO playlists (name, description, color, auto_generated, cover_job_id, topic_keywords)
             VALUES (?1, ?2, ?3, 1, ?4, ?5)",
            params![group.name, group.description, group.color, group.cover_job_id, group.topic_keywords],
        )?;
        let playlist_id = conn.last_insert_rowid();
        for job_id in group.job_ids {
            conn.execute(
                "INSERT OR IGNORE INTO playlist_items (playlist_id, job_id) VALUES (?1, ?2)",
                params![playlist_id, job_id],
            )?;
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
    conn.execute(
        "INSERT INTO collection_sources (url, source_type, browser, active, last_synced_at)
         VALUES (?1, ?2, ?3, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(url) DO UPDATE SET
            browser = coalesce(?3, collection_sources.browser),
            active = 1",
        params![url, source_type, browser],
    )?;
    Ok(())
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

pub fn get_collection_sources(conn: &Connection) -> Result<Vec<CollectionSourceRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, url, coalesce(source_type, 'collection'), browser, active,
                coalesce(interval_minutes, 15), last_attempt_at, last_success_at,
                next_sync_at, coalesce(discovered_count, 0), coalesce(consecutive_failures, 0),
                last_error, created_at
         FROM collection_sources
         ORDER BY id ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(CollectionSourceRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            source_type: row.get(2)?,
            browser: row.get(3)?,
            active: row.get(4)?,
            interval_minutes: row.get(5)?,
            last_attempt_at: row.get(6)?,
            last_success_at: row.get(7)?,
            next_sync_at: row.get(8)?,
            discovered_count: row.get(9)?,
            consecutive_failures: row.get(10)?,
            last_error: row.get(11)?,
            created_at: row.get(12)?,
        })
    })?;
    let mut sources = Vec::new();
    for row in rows {
        sources.push(row?);
    }
    Ok(sources)
}

pub fn get_collection_sources_to_sync(conn: &Connection) -> Result<Vec<CollectionSourceRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, url, coalesce(source_type, 'collection'), browser, active,
                coalesce(interval_minutes, 15), last_attempt_at, last_success_at,
                next_sync_at, coalesce(discovered_count, 0), coalesce(consecutive_failures, 0),
                last_error, created_at
         FROM collection_sources
         WHERE active = 1
           AND (next_sync_at IS NULL OR next_sync_at <= datetime('now'))
         ORDER BY id ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(CollectionSourceRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            source_type: row.get(2)?,
            browser: row.get(3)?,
            active: row.get(4)?,
            interval_minutes: row.get(5)?,
            last_attempt_at: row.get(6)?,
            last_success_at: row.get(7)?,
            next_sync_at: row.get(8)?,
            discovered_count: row.get(9)?,
            consecutive_failures: row.get(10)?,
            last_error: row.get(11)?,
            created_at: row.get(12)?,
        })
    })?;
    let mut sources = Vec::new();
    for row in rows {
        sources.push(row?);
    }
    Ok(sources)
}

pub fn set_collection_source_active(conn: &Connection, source_id: i64, active: bool) -> Result<()> {
    let rows = conn.execute(
        "UPDATE collection_sources SET active = ?1 WHERE id = ?2",
        params![active, source_id],
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
        "UPDATE collection_sources SET next_sync_at = datetime('now', '-1 minute') WHERE id = ?1",
        params![source_id],
    )?;
    require_rows_changed(rows)
}

pub fn mark_collection_source_attempt(conn: &Connection, source_id: i64) -> Result<()> {
    let rows = conn.execute(
        "UPDATE collection_sources SET last_attempt_at = datetime('now') WHERE id = ?1",
        params![source_id],
    )?;
    require_rows_changed(rows)
}

pub fn mark_collection_source_failed(conn: &Connection, source_id: i64, error: &str) -> Result<()> {
    let rows = conn.execute(
        "UPDATE collection_sources SET
            consecutive_failures = consecutive_failures + 1,
            last_error = ?2,
            next_sync_at = datetime('now', '+' || min(180, (15 * (consecutive_failures + 1))) || ' minutes')
         WHERE id = ?1",
        params![source_id, error],
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
            last_success_at = datetime('now'),
            last_synced_at = datetime('now'),
            consecutive_failures = 0,
            last_error = NULL,
            discovered_count = discovered_count + ?2,
            next_sync_at = datetime('now', '+' || interval_minutes || ' minutes')
         WHERE id = ?1",
        params![source_id, queued as i64],
    )?;
    require_rows_changed(rows)
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

#[cfg(test)]
mod tests {
    use super::*;

    static DATA_DIR_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

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
                active BOOLEAN NOT NULL DEFAULT 1,
                interval_minutes INTEGER NOT NULL DEFAULT 15,
                last_attempt_at DATETIME,
                last_success_at DATETIME,
                next_sync_at DATETIME,
                discovered_count INTEGER NOT NULL DEFAULT 0,
                consecutive_failures INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                last_synced_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE health_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                component TEXT NOT NULL,
                severity TEXT NOT NULL,
                diagnosis TEXT NOT NULL,
                action TEXT,
                result TEXT
            );",
        )
        .expect("Failed to create test schema");
        conn
    }

    fn test_embedding(first: f32, second: f32) -> Vec<f32> {
        let mut embedding = vec![0.0; EMBEDDING_DIMENSIONS];
        embedding[0] = first;
        embedding[1] = second;
        embedding
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
