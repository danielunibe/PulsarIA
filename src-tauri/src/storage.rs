//! Local media storage, quota and reversible purge primitives.
//!
//! The desktop application has two deliberately different kinds of data:
//! large, reproducible media files and the knowledge extracted from them.
//! This module owns the filesystem boundary for the former. It never moves
//! transcripts, segments, embeddings or analysis artifacts during a media
//! purge.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const GIB: u64 = 1024 * 1024 * 1024;
const MIN_SAFE_FREE: u64 = GIB;
const MAX_FRAME_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SetupIntent {
    Knowledge,
    Balanced,
    Archive,
}

impl SetupIntent {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "knowledge" => Some(Self::Knowledge),
            "balanced" => Some(Self::Balanced),
            "archive" => Some(Self::Archive),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Knowledge => "knowledge",
            Self::Balanced => "balanced",
            Self::Archive => "archive",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StorageRecommendation {
    pub intent: SetupIntent,
    pub quota_bytes: u64,
    pub reserve_bytes: u64,
    pub retention: String,
    pub formats: Vec<String>,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StorageState {
    Ok,
    QuotaNear,
    QuotaExceeded,
    DiskLow,
    PathError,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StorageStatus {
    pub root_path: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub quota_bytes: u64,
    pub used_media_bytes: u64,
    pub staged_bytes: u64,
    pub trash_bytes: u64,
    pub reserve_bytes: u64,
    pub state: StorageState,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PurgeCandidate {
    pub job_id: i64,
    pub title: String,
    pub media_bytes: u64,
    pub interest_score: i64,
    pub reasons: Vec<String>,
    pub protected: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PurgeAction {
    pub purge_id: i64,
    pub job_id: i64,
    pub freed_bytes: u64,
    pub title: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ArtifactRecord {
    pub id: i64,
    pub job_id: i64,
    pub kind: String,
    pub path: String,
    pub timestamp: Option<f64>,
    pub label: Option<String>,
    pub protected: bool,
    pub size_bytes: u64,
    pub created_at: String,
}

#[derive(Clone, Debug)]
pub struct FinalizedMedia {
    pub video_path: Option<PathBuf>,
    pub audio_path: Option<PathBuf>,
    pub transcript_path: Option<PathBuf>,
    pub poster_path: Option<PathBuf>,
    pub video_bytes: Option<u64>,
    pub audio_bytes: Option<u64>,
}

#[derive(Clone, Debug)]
struct CandidateRow {
    job_id: i64,
    title: String,
    video_path: Option<PathBuf>,
    audio_path: Option<PathBuf>,
    media_bytes: u64,
    interest_score: i64,
    reasons: Vec<String>,
    last_accessed: String,
    downloaded_at: String,
}

pub fn default_media_root() -> PathBuf {
    if let Some(configured) = std::env::var_os("PULSAR_DOWNLOAD_DIR") {
        return PathBuf::from(configured);
    }
    if let Some(profile) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        return PathBuf::from(profile).join("Downloads").join("Pulsaria");
    }
    PathBuf::from("downloads").join("Pulsaria")
}

pub fn staging_root(root: &Path) -> PathBuf {
    root.join(".pulsaria").join("staging")
}

pub fn media_root(root: &Path) -> PathBuf {
    root.join("media")
}

pub fn trash_root(root: &Path) -> PathBuf {
    root.join(".pulsaria").join("trash")
}

pub fn job_staging_dir(root: &Path, job_id: i64) -> PathBuf {
    staging_root(root).join(job_id.to_string())
}

pub fn job_media_dir(root: &Path, job_id: i64) -> PathBuf {
    media_root(root).join(job_id.to_string())
}

pub fn durable_transcripts_root() -> PathBuf {
    crate::db::data_dir_path().join("transcripts")
}

pub fn durable_transcript_path(job_id: i64) -> PathBuf {
    durable_transcripts_root().join(format!("{job_id}.txt"))
}

pub fn durable_artifacts_root(job_id: i64) -> PathBuf {
    crate::db::data_dir_path()
        .join("artifacts")
        .join(job_id.to_string())
}

pub fn ensure_media_root(root: &Path) -> io::Result<()> {
    fs::create_dir_all(staging_root(root))?;
    fs::create_dir_all(media_root(root))?;
    fs::create_dir_all(trash_root(root))?;
    Ok(())
}

fn is_large_media_file(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(
        extension.as_str(),
        "mp4" | "mkv" | "webm" | "mov" | "avi" | "mp3" | "wav" | "flac" | "ogg" | "m4a"
    ) {
        return true;
    }
    if matches!(extension.as_str(), "part" | "tmp" | "temp") {
        return true;
    }
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.ends_with(".part") || value.ends_with(".download"))
        .unwrap_or(false)
}

fn directory_contains_cache(path: &Path) -> bool {
    path.components().any(|component| {
        let value = component.as_os_str().to_string_lossy().to_ascii_lowercase();
        value == "cache" || value == "caches" || value == ".cache"
    })
}

fn recursive_size(path: &Path) -> io::Result<u64> {
    if !path.exists() {
        return Ok(0);
    }
    let mut total = 0_u64;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let entry_path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            total = total.saturating_add(recursive_size(&entry_path)?);
        } else if file_type.is_file()
            && (is_large_media_file(&entry_path) || directory_contains_cache(&entry_path))
        {
            total = total.saturating_add(entry.metadata()?.len());
        }
    }
    Ok(total)
}

/// Measure only storage owned by Pulsaria. The selected directory can be an
/// existing Downloads folder containing unrelated user media; those files
/// must not consume the app quota or become purge candidates.
fn managed_storage_size(root: &Path) -> io::Result<u64> {
    let mut total = 0_u64;
    for path in [
        media_root(root),
        staging_root(root),
        trash_root(root),
        root.join(".pulsaria").join("cache"),
        root.join(".pulsaria").join("caches"),
        root.join(".pulsaria").join(".cache"),
    ] {
        total = total.saturating_add(recursive_size(&path)?);
    }
    Ok(total)
}

#[cfg(windows)]
fn disk_space(path: &Path) -> io::Result<(u64, u64)> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let mut wide = path.as_os_str().encode_wide().collect::<Vec<_>>();
    wide.push(0);
    let mut free = 0_u64;
    let mut total = 0_u64;
    let mut available = 0_u64;
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available as *mut u64,
            &mut total as *mut u64,
            &mut free as *mut u64,
        )
    };
    if ok == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok((total, available))
    }
}

#[cfg(unix)]
fn disk_space(path: &Path) -> io::Result<(u64, u64)> {
    use std::os::unix::ffi::OsStrExt;
    let bytes = path.as_os_str().as_bytes();
    let mut stat = std::mem::MaybeUninit::<libc::statvfs>::uninit();
    let result = unsafe { libc::statvfs(bytes.as_ptr().cast(), stat.as_mut_ptr()) };
    if result != 0 {
        return Err(io::Error::last_os_error());
    }
    let stat = unsafe { stat.assume_init() };
    let total = (stat.f_blocks as u128).saturating_mul(stat.f_frsize as u128);
    let free = (stat.f_bavail as u128).saturating_mul(stat.f_frsize as u128);
    Ok((
        total.min(u64::MAX as u128) as u64,
        free.min(u64::MAX as u128) as u64,
    ))
}

#[cfg(not(any(windows, unix)))]
fn disk_space(_path: &Path) -> io::Result<(u64, u64)> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "disk space inspection is not supported on this platform",
    ))
}

pub fn storage_status(
    root: &Path,
    quota_bytes: u64,
    reserve_override: Option<u64>,
) -> StorageStatus {
    let space = disk_space(root);
    let space_ok = space.is_ok();
    let (total_bytes, free_bytes) = space.unwrap_or_default();
    let used_media_bytes = managed_storage_size(root).unwrap_or_default();
    let staged_bytes = recursive_size(&staging_root(root)).unwrap_or_default();
    let trash_bytes = recursive_size(&trash_root(root)).unwrap_or_default();
    let reserve_bytes = reserve_override
        .filter(|value| *value > 0)
        .unwrap_or_else(|| 2_u64.saturating_mul(GIB).max(free_bytes / 10));
    let safe_free_bytes = free_bytes.saturating_sub(reserve_bytes);

    let state = if !root.exists() || !space_ok {
        StorageState::PathError
    } else if safe_free_bytes < MIN_SAFE_FREE {
        StorageState::DiskLow
    } else if quota_bytes > 0 && used_media_bytes >= quota_bytes {
        StorageState::QuotaExceeded
    } else if quota_bytes > 0
        && used_media_bytes.saturating_mul(10) >= quota_bytes.saturating_mul(9)
    {
        StorageState::QuotaNear
    } else {
        StorageState::Ok
    };

    StorageStatus {
        root_path: root.to_string_lossy().to_string(),
        total_bytes,
        free_bytes,
        quota_bytes,
        used_media_bytes,
        staged_bytes,
        trash_bytes,
        reserve_bytes,
        state,
    }
}

pub fn recommend_storage(intent: SetupIntent, free_bytes: u64) -> StorageRecommendation {
    let reserve_bytes = 2_u64.saturating_mul(GIB).max(free_bytes / 10);
    let safe_bytes = free_bytes.saturating_sub(reserve_bytes);
    if safe_bytes < MIN_SAFE_FREE {
        return StorageRecommendation {
            intent,
            quota_bytes: 0,
            reserve_bytes,
            retention: "online".to_string(),
            formats: vec!["txt".to_string()],
            reason: "El espacio libre seguro es menor de 1 GiB. Libera espacio o cambia de unidad antes de descargar.".to_string(),
        };
    }

    let (ratio, minimum, maximum, retention, label) = match intent {
        SetupIntent::Knowledge => (5_u64, GIB, 10 * GIB, "online", "conocimiento"),
        SetupIntent::Balanced => (20_u64, 10 * GIB, 50 * GIB, "keep", "equilibrado"),
        SetupIntent::Archive => (40_u64, 25 * GIB, 200 * GIB, "keep", "archivo"),
    };
    let desired = free_bytes
        .saturating_mul(ratio)
        .checked_div(100)
        .unwrap_or(0)
        .clamp(minimum, maximum);
    let quota_bytes = desired.min(safe_bytes);
    let reason = if quota_bytes < minimum {
        "El espacio disponible obliga a usar una cuota menor que la recomendada; libera espacio o cambia de unidad.".to_string()
    } else {
        format!(
            "Perfil {label}: usa aproximadamente {ratio}% del espacio libre y conserva una reserva de seguridad de {} GiB.",
            reserve_bytes / GIB
        )
    };
    StorageRecommendation {
        intent,
        quota_bytes,
        reserve_bytes,
        retention: retention.to_string(),
        formats: vec!["mp4".to_string(), "mp3".to_string(), "txt".to_string()],
        reason,
    }
}

pub fn configured_quota_bytes() -> u64 {
    std::env::var("PULSAR_MEDIA_QUOTA_BYTES")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .or_else(|| {
            fs::read_to_string(crate::db::data_dir_path().join("quota_bytes.txt"))
                .ok()
                .and_then(|value| value.trim().parse::<u64>().ok())
        })
        .unwrap_or(0)
}

pub fn configured_reserve_bytes() -> Option<u64> {
    std::env::var("PULSAR_MEDIA_RESERVE_BYTES")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .or_else(|| {
            fs::read_to_string(crate::db::data_dir_path().join("reserve_bytes.txt"))
                .ok()
                .and_then(|value| value.trim().parse::<u64>().ok())
        })
}

pub fn ensure_capacity(root: &Path) -> Result<(), String> {
    let status = storage_status(root, configured_quota_bytes(), configured_reserve_bytes());
    match status.state {
        StorageState::Ok | StorageState::QuotaNear => Ok(()),
        StorageState::QuotaExceeded => Err(format!(
            "La cuota de medios está completa ({} usados de {} permitidos). Revisa la previsualización de purga y confirma los elementos concretos.",
            format_bytes(status.used_media_bytes),
            format_bytes(status.quota_bytes)
        )),
        StorageState::DiskLow => Err(format!(
            "El disco no conserva la reserva de seguridad de {}. Libera espacio o cambia la carpeta antes de descargar.",
            format_bytes(status.reserve_bytes)
        )),
        StorageState::PathError => Err(format!(
            "No se puede acceder a la carpeta de medios {}. Comprueba permisos y que la unidad esté conectada.",
            status.root_path
        )),
    }
}

pub fn format_bytes(value: u64) -> String {
    if value >= GIB {
        format!("{:.1} GiB", value as f64 / GIB as f64)
    } else {
        format!("{:.0} MiB", value as f64 / (1024 * 1024) as f64)
    }
}

fn move_file(source: &Path, destination: &Path) -> io::Result<()> {
    if !source.is_file() {
        return Ok(());
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    if destination.exists() {
        fs::remove_file(destination)?;
    }
    fs::rename(source, destination)
}

/// Moves a file without deleting a destination that appeared after the
/// caller's preflight. This is used by undo, where replacing a user's newly
/// created file would be data loss.
fn move_file_exclusive(source: &Path, destination: &Path) -> io::Result<()> {
    if !source.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("source file does not exist: {}", source.display()),
        ));
    }
    if destination.exists() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            format!("destination file already exists: {}", destination.display()),
        ));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(source, destination)
}

/// Replace a durable file without losing the previous copy when the platform
/// does not allow rename-over-existing (notably Windows). The backup is kept
/// beside the destination only for the duration of the replacement and is
/// removed after the new file is in place.
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    if !destination.exists() {
        return fs::rename(source, destination);
    }

    let backup = destination.with_file_name(format!(
        ".{}.previous",
        destination
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("file")
    ));
    if backup.exists() {
        fs::remove_file(&backup)?;
    }
    fs::rename(destination, &backup)?;
    match fs::rename(source, destination) {
        Ok(()) => {
            let _ = fs::remove_file(&backup);
            Ok(())
        }
        Err(error) => {
            // Best effort restoration keeps the previous transcript usable if
            // the replacement fails after the backup move.
            if let Err(restore_error) = fs::rename(&backup, destination) {
                return Err(io::Error::new(
                    error.kind(),
                    format!(
                        "replacement failed: {}; previous file restoration failed: {}",
                        error, restore_error
                    ),
                ));
            }
            Err(error)
        }
    }
}

fn rollback_purge_moves(
    moved_files: &mut Vec<(PathBuf, PathBuf)>,
    moved_outputs: &mut Vec<(PathBuf, PathBuf)>,
) -> Option<String> {
    let mut errors = Vec::new();
    for (source, destination) in moved_outputs.drain(..).rev() {
        if let Err(error) = move_file_exclusive(&destination, &source) {
            errors.push(format!("{}: {}", destination.display(), error));
        }
    }
    for (source, destination) in moved_files.drain(..).rev() {
        if let Err(error) = move_file_exclusive(&destination, &source) {
            errors.push(format!("{}: {}", destination.display(), error));
        }
    }
    (!errors.is_empty()).then(|| errors.join("; "))
}

fn purge_failure(
    message: impl Into<String>,
    moved_files: &mut Vec<(PathBuf, PathBuf)>,
    moved_outputs: &mut Vec<(PathBuf, PathBuf)>,
) -> String {
    let message = message.into();
    match rollback_purge_moves(moved_files, moved_outputs) {
        Some(rollback_error) => {
            format!("{message}; la reversión física también falló: {rollback_error}")
        }
        None => message,
    }
}

fn rollback_undo_moves(
    moved_files: &mut Vec<(PathBuf, PathBuf)>,
    moved_outputs: &mut Vec<(PathBuf, PathBuf)>,
) -> Option<String> {
    let mut errors = Vec::new();
    for (source, destination) in moved_outputs.drain(..).rev() {
        if let Err(error) = move_file_exclusive(&destination, &source) {
            errors.push(format!("{}: {}", destination.display(), error));
        }
    }
    for (source, destination) in moved_files.drain(..).rev() {
        if let Err(error) = move_file_exclusive(&destination, &source) {
            errors.push(format!("{}: {}", destination.display(), error));
        }
    }
    (!errors.is_empty()).then(|| errors.join("; "))
}

fn undo_failure(
    message: impl Into<String>,
    moved_files: &mut Vec<(PathBuf, PathBuf)>,
    moved_outputs: &mut Vec<(PathBuf, PathBuf)>,
) -> String {
    let message = message.into();
    match rollback_undo_moves(moved_files, moved_outputs) {
        Some(rollback_error) => {
            format!("{message}; la reversión física también falló: {rollback_error}")
        }
        None => message,
    }
}

fn copy_transcript(source: &Path, job_id: i64, transcript: &str) -> io::Result<Option<PathBuf>> {
    if !source.is_file() && transcript.trim().is_empty() {
        return Ok(None);
    }
    let root = durable_transcripts_root();
    fs::create_dir_all(&root)?;
    let destination = durable_transcript_path(job_id);
    let temporary = destination.with_extension("txt.part");
    if source.is_file() {
        fs::copy(source, &temporary)?;
    } else {
        fs::write(&temporary, transcript.as_bytes())?;
    }
    replace_file(&temporary, &destination)?;
    Ok(Some(destination))
}

/// Moves successful large media out of staging and writes the transcript in
/// the application data directory before any retention decision is applied.
pub fn finalize_job_media(
    root: &Path,
    job_id: i64,
    transcript: &str,
) -> io::Result<FinalizedMedia> {
    ensure_media_root(root)?;
    let stage = job_staging_dir(root, job_id);
    let destination = job_media_dir(root, job_id);
    fs::create_dir_all(&destination)?;

    let video_source = stage.join("video.mp4");
    let audio_source = stage.join("audio.mp3");
    let transcript_source = stage.join("transcript.txt");
    let video_path = if video_source.is_file() {
        let path = destination.join("video.mp4");
        move_file(&video_source, &path)?;
        Some(path)
    } else {
        None
    };
    let audio_path = if audio_source.is_file() {
        let path = destination.join("audio.mp3");
        move_file(&audio_source, &path)?;
        Some(path)
    } else {
        None
    };
    let transcript_path = copy_transcript(&transcript_source, job_id, transcript)?;

    // The Python analyzer may emit these names into staging. Move only the
    // bounded, known artifact set; arbitrary files are never promoted.
    let artifact_root = durable_artifacts_root(job_id);
    fs::create_dir_all(&artifact_root)?;
    if let Ok(entries) = fs::read_dir(&stage) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if (name == "poster.jpg" || (name.starts_with("keyframe-") && name.ends_with(".jpg")))
                && path.is_file()
            {
                let destination_path = artifact_root.join(name);
                move_file(&path, &destination_path)?;
            }
        }
    }
    let poster_path = {
        let path = artifact_root.join("poster.jpg");
        path.is_file().then_some(path)
    };

    let video_bytes = video_path
        .as_ref()
        .and_then(|path| fs::metadata(path).ok())
        .map(|metadata| metadata.len());
    let audio_bytes = audio_path
        .as_ref()
        .and_then(|path| fs::metadata(path).ok())
        .map(|metadata| metadata.len());
    Ok(FinalizedMedia {
        video_path,
        audio_path,
        transcript_path,
        poster_path,
        video_bytes,
        audio_bytes,
    })
}

/// Promotes the validated user-selected exports from staging into the durable
/// per-job media directory. Only files directly inside `exports` are allowed.
pub fn promote_generated_exports(
    root: &Path,
    job_id: i64,
) -> io::Result<Vec<(String, PathBuf, u64)>> {
    let source_root = job_staging_dir(root, job_id).join("exports");
    if !source_root.is_dir() {
        return Ok(Vec::new());
    }
    let destination_root = job_media_dir(root, job_id).join("exports");
    fs::create_dir_all(&destination_root)?;
    let mut promoted = Vec::new();
    for entry in fs::read_dir(&source_root)? {
        let entry = entry?;
        let source = entry.path();
        if !source.is_file() {
            continue;
        }
        let Some(name) = source.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Some((category, format)) = name.rsplit_once('.') else {
            continue;
        };
        if !matches!(category, "video" | "audio" | "text")
            || !matches!(
                format,
                "mp4"
                    | "mkv"
                    | "webm"
                    | "mov"
                    | "mp3"
                    | "wav"
                    | "flac"
                    | "ogg"
                    | "m4a"
                    | "txt"
                    | "srt"
                    | "vtt"
                    | "json"
            )
        {
            continue;
        }
        let destination = destination_root.join(name);
        move_file(&source, &destination)?;
        let size = fs::metadata(&destination)?.len();
        promoted.push((format.to_string(), destination, size));
    }
    Ok(promoted)
}

fn path_is_inside(path: &Path, root: &Path) -> bool {
    fn canonical_or_parent(path: &Path) -> PathBuf {
        if let Ok(canonical) = path.canonicalize() {
            return canonical;
        }
        // A purged media file is intentionally absent when undo validates its
        // original destination. Walk up to the nearest existing ancestor so
        // Windows extended-path prefixes stay consistent with the root even
        // when more than one parent directory has already been cleaned.
        let mut cursor = path;
        let mut suffix = Vec::new();
        loop {
            if let Ok(canonical) = cursor.canonicalize() {
                return suffix
                    .iter()
                    .rev()
                    .fold(canonical, |current, component| current.join(component));
            }
            let Some(name) = cursor.file_name() else {
                break;
            };
            suffix.push(name.to_owned());
            let Some(parent) = cursor.parent() else {
                break;
            };
            cursor = parent;
        }
        path.to_path_buf()
    }

    let path = canonical_or_parent(path);
    let root = canonical_or_parent(root);
    path.starts_with(root)
}

// The SQL projection is intentionally kept in the same order as this mapper;
// the explicit arguments make the explainable purge contract auditable.
#[allow(clippy::too_many_arguments)]
fn candidate_from_row(
    job_id: i64,
    title: String,
    video_path: Option<String>,
    audio_path: Option<String>,
    _video_bytes: Option<i64>,
    _audio_bytes: Option<i64>,
    play_count: i64,
    open_count: i64,
    search_hit_count: i64,
    favorite: i64,
    pinned: i64,
    last_accessed: Option<String>,
    downloaded_at: Option<String>,
) -> CandidateRow {
    let video_path = video_path.map(PathBuf::from).filter(|path| path.is_file());
    let audio_path = audio_path.map(PathBuf::from).filter(|path| path.is_file());
    let actual_video = video_path
        .as_ref()
        .and_then(|path| fs::metadata(path).ok())
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let actual_audio = audio_path
        .as_ref()
        .and_then(|path| fs::metadata(path).ok())
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let mut reasons = Vec::new();
    let mut interest_score = 0_i64;
    if favorite != 0 {
        interest_score += 100_000;
        reasons.push("Marcado como favorito".to_string());
    } else {
        reasons.push("Sin favorito".to_string());
    }
    if pinned != 0 {
        interest_score += 100_000;
        reasons.push("Fijado por el usuario".to_string());
    } else {
        reasons.push("No está fijado".to_string());
    }
    interest_score += play_count.max(0).saturating_mul(100);
    interest_score += open_count.max(0).saturating_mul(10);
    interest_score += search_hit_count.max(0).saturating_mul(5);
    reasons.push(format!(
        "{} reproducciones y {} aperturas",
        play_count.max(0),
        open_count.max(0)
    ));
    if search_hit_count > 0 {
        reasons.push(format!(
            "Seleccionado {} veces desde búsqueda",
            search_hit_count
        ));
    } else {
        reasons.push("Sin coincidencias seleccionadas desde búsqueda".to_string());
    }
    let last_accessed = last_accessed.unwrap_or_default();
    let (recency_score, recency_reason) = access_recency(&last_accessed);
    interest_score += recency_score;
    reasons.push(recency_reason);
    CandidateRow {
        job_id,
        title,
        video_path,
        audio_path,
        media_bytes: actual_video.saturating_add(actual_audio),
        interest_score,
        reasons,
        last_accessed,
        downloaded_at: downloaded_at.unwrap_or_default(),
    }
}

/// Returns a small, bounded and explainable recency signal for purge ranking.
/// SQLite normally stores UTC timestamps without an offset, while imports may
/// contain RFC3339 values, so both representations are accepted.
fn access_recency(value: &str) -> (i64, String) {
    if value.trim().is_empty() {
        return (0, "Sin acceso registrado".to_string());
    }

    let parsed = chrono::DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
        .ok()
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|timestamp| {
                    chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
                        timestamp,
                        chrono::Utc,
                    )
                })
        });

    let Some(timestamp) = parsed else {
        return (0, format!("Último acceso no interpretable: {value}"));
    };
    let age_days = (chrono::Utc::now() - timestamp).num_seconds().max(0) / 86_400;
    let score = (30_i64 - age_days.min(30)).max(0);
    if score > 0 {
        (score, format!("Acceso reciente (+{score} recencia)"))
    } else {
        (0, "Último acceso antiguo".to_string())
    }
}

pub fn preview_purge(
    conn: &Connection,
    root: &Path,
    required_bytes: u64,
) -> rusqlite::Result<Vec<PurgeCandidate>> {
    let mut statement = conn.prepare(
        "SELECT m.job_id, COALESCE(m.title, 'Video sin título'), m.video_path, m.audio_path,
                m.video_bytes, m.audio_bytes, COALESCE(m.play_count, 0), COALESCE(m.open_count, 0),
                COALESCE(m.search_hit_count, 0), COALESCE(m.favorite, 0), COALESCE(m.pinned, 0),
                m.last_accessed_at, m.downloaded_at
         FROM media m
         JOIN jobs j ON j.id = m.job_id
         WHERE j.status IN ('complete', 'completed', 'done')
           AND (m.video_path IS NOT NULL OR m.audio_path IS NOT NULL)
           AND COALESCE(m.keep_status, 'online') = 'online'
           AND COALESCE(m.favorite, 0) = 0
           AND COALESCE(m.pinned, 0) = 0
           AND NOT EXISTS (
             SELECT 1 FROM media_artifacts a
             WHERE a.job_id = m.job_id AND a.kind = 'screenshot' AND a.protected = 1
           )",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(candidate_from_row(
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
            row.get(10)?,
            row.get(11)?,
            row.get(12)?,
        ))
    })?;
    let mut candidates = Vec::new();
    for row in rows {
        let mut candidate = row?;
        let generated_bytes: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(size_bytes), 0) FROM generated_outputs
                 WHERE job_id = ?1 AND category IN ('video', 'audio')",
                params![candidate.job_id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        candidate.media_bytes = candidate
            .media_bytes
            .saturating_add(generated_bytes.max(0) as u64);
        if generated_bytes > 0 {
            candidate
                .reasons
                .push("Incluye salidas de formatos seleccionados".into());
        }
        let path_is_safe = candidate
            .video_path
            .as_ref()
            .into_iter()
            .chain(candidate.audio_path.as_ref())
            .all(|path| path_is_inside(path, root));
        if path_is_safe && candidate.media_bytes > 0 {
            candidates.push(candidate);
        }
    }
    candidates.sort_by(|left, right| {
        left.interest_score
            .cmp(&right.interest_score)
            .then_with(|| left.last_accessed.cmp(&right.last_accessed))
            .then_with(|| left.downloaded_at.cmp(&right.downloaded_at))
            .then_with(|| left.job_id.cmp(&right.job_id))
    });
    let mut released = 0_u64;
    Ok(candidates
        .into_iter()
        .take_while(|candidate| {
            let include = required_bytes == 0 || released < required_bytes;
            released = released.saturating_add(candidate.media_bytes);
            include
        })
        .map(|candidate| PurgeCandidate {
            job_id: candidate.job_id,
            title: candidate.title,
            media_bytes: candidate.media_bytes,
            interest_score: candidate.interest_score,
            reasons: candidate.reasons,
            protected: false,
        })
        .collect())
}

pub fn apply_purge(
    conn: &mut Connection,
    root: &Path,
    job_ids: &[i64],
    reason: &str,
) -> Result<Vec<PurgeAction>, String> {
    if job_ids.is_empty() {
        return Err("Selecciona al menos un elemento para purgar".to_string());
    }
    let candidates = preview_purge(conn, root, 0).map_err(|error| error.to_string())?;
    let requested = job_ids
        .iter()
        .copied()
        .collect::<std::collections::HashSet<_>>();
    let mut moved_files = Vec::<(PathBuf, PathBuf)>::new();
    let mut moved_outputs = Vec::<(PathBuf, PathBuf)>::new();
    let transaction = conn
        .transaction()
        .map_err(|error| format!("No se pudo abrir la transacción de purga: {}", error))?;
    let batch = chrono::Utc::now().format("%Y%m%d-%H%M%S-%3f").to_string();
    let operation: Result<Vec<PurgeAction>, String> = (|| {
        let mut actions = Vec::new();
        for candidate in candidates
            .into_iter()
            .filter(|candidate| requested.contains(&candidate.job_id))
        {
            let row: Option<(Option<String>, Option<String>, Option<String>)> = transaction
                .query_row(
                    "SELECT video_path, audio_path, title FROM media WHERE job_id = ?1",
                    params![candidate.job_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|error| error.to_string())?;
            let Some((video, audio, title)) = row else {
                continue;
            };
            let destination = trash_root(root)
                .join(&batch)
                .join(candidate.job_id.to_string());
            fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
            let video_path = video.map(PathBuf::from).filter(|path| path.is_file());
            let audio_path = audio.map(PathBuf::from).filter(|path| path.is_file());
            let mut candidate_outputs = Vec::<(i64, PathBuf, PathBuf)>::new();
            if video_path
                .as_ref()
                .is_some_and(|path| !path_is_inside(path, root))
                || audio_path
                    .as_ref()
                    .is_some_and(|path| !path_is_inside(path, root))
            {
                return Err(format!(
                    "El job {} contiene una ruta fuera de la carpeta de medios y no se puede purgar con seguridad",
                    candidate.job_id
                ));
            }
            let trash_video = video_path.as_ref().map(|_| destination.join("video.mp4"));
            let trash_audio = audio_path.as_ref().map(|_| destination.join("audio.mp3"));
            if let (Some(source), Some(destination)) = (&video_path, &trash_video) {
                move_file_exclusive(source, destination).map_err(|error| error.to_string())?;
                moved_files.push((source.clone(), destination.clone()));
            }
            if let (Some(source), Some(destination)) = (&audio_path, &trash_audio) {
                move_file_exclusive(source, destination).map_err(|error| error.to_string())?;
                moved_files.push((source.clone(), destination.clone()));
            }
            let mut output_statement = transaction
                .prepare("SELECT id, path FROM generated_outputs WHERE job_id = ?1 AND category IN ('video', 'audio')")
                .map_err(|error| error.to_string())?;
            let outputs = output_statement
                .query_map(params![candidate.job_id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|error| error.to_string())?;
            for output in outputs {
                let (output_id, raw_path) = output.map_err(|error| error.to_string())?;
                let source = PathBuf::from(raw_path);
                if !source.is_file() || !path_is_inside(&source, root) {
                    return Err(format!(
                        "La salida generada del job {} no es segura para purga",
                        candidate.job_id
                    ));
                }
                let name = source
                    .file_name()
                    .ok_or_else(|| "La salida generada no tiene nombre válido".to_string())?;
                let destination_path = destination.join("exports").join(name);
                if let Some(parent) = destination_path.parent() {
                    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                move_file_exclusive(&source, &destination_path)
                    .map_err(|error| error.to_string())?;
                moved_outputs.push((source.clone(), destination_path.clone()));
                candidate_outputs.push((output_id, source, destination_path));
            }
            transaction
                .execute(
                    "INSERT INTO purge_history (job_id, original_video_path, original_audio_path,
                        trash_video_path, trash_audio_path, reason)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        candidate.job_id,
                        video_path
                            .as_ref()
                            .map(|path| path.to_string_lossy().to_string()),
                        audio_path
                            .as_ref()
                            .map(|path| path.to_string_lossy().to_string()),
                        trash_video
                            .as_ref()
                            .map(|path| path.to_string_lossy().to_string()),
                        trash_audio
                            .as_ref()
                            .map(|path| path.to_string_lossy().to_string()),
                        if reason.trim().is_empty() {
                            "manual purge"
                        } else {
                            reason
                        },
                    ],
                )
                .map_err(|error| error.to_string())?;
            let purge_id = transaction.last_insert_rowid();
            for (output_id, original, trash) in candidate_outputs {
                transaction
                    .execute(
                        "INSERT INTO generated_output_purge (purge_id, output_id, original_path, trash_path) VALUES (?1, ?2, ?3, ?4)",
                        params![purge_id, output_id, original.to_string_lossy().to_string(), trash.to_string_lossy().to_string()],
                    )
                    .map_err(|error| error.to_string())?;
                transaction
                    .execute(
                        "UPDATE generated_outputs SET path = ?1 WHERE id = ?2",
                        params![trash.to_string_lossy().to_string(), output_id],
                    )
                    .map_err(|error| error.to_string())?;
            }
            crate::db::set_media_storage_paths_null(
                &transaction,
                candidate.job_id,
                "online",
                reason,
            )
            .map_err(|error| error.to_string())?;
            actions.push(PurgeAction {
                purge_id,
                job_id: candidate.job_id,
                freed_bytes: candidate.media_bytes,
                title: title.unwrap_or(candidate.title),
            });
        }
        if actions.is_empty() {
            return Err(
                "Los elementos seleccionados están protegidos, ya no tienen medios o no son elegibles para purga"
                    .to_string(),
            );
        }
        Ok(actions)
    })();

    let actions = match operation {
        Ok(actions) => actions,
        Err(error) => {
            drop(transaction);
            return Err(purge_failure(error, &mut moved_files, &mut moved_outputs));
        }
    };
    if let Err(error) = transaction.commit() {
        return Err(purge_failure(
            error.to_string(),
            &mut moved_files,
            &mut moved_outputs,
        ));
    }
    moved_files.clear();
    moved_outputs.clear();
    Ok(actions)
}

type PurgeHistoryRow = (
    i64,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
);

pub fn undo_purge(conn: &Connection, root: &Path, purge_id: i64) -> Result<PurgeAction, String> {
    let row: Option<PurgeHistoryRow> = conn
        .query_row(
            "SELECT h.job_id, h.original_video_path, h.original_audio_path,
                    h.trash_video_path, h.trash_audio_path, m.title
             FROM purge_history h JOIN media m ON m.job_id = h.job_id
             WHERE h.id = ?1 AND h.undone_at IS NULL",
            params![purge_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((job_id, original_video, original_audio, trash_video, trash_audio, title)) = row
    else {
        return Err("La purga no existe, ya fue deshecha o expiró".to_string());
    };
    let original_video = original_video.map(PathBuf::from);
    let original_audio = original_audio.map(PathBuf::from);
    let trash_video = trash_video.map(PathBuf::from);
    let trash_audio = trash_audio.map(PathBuf::from);
    let trash_root = trash_root(root);
    if original_video
        .as_ref()
        .is_some_and(|path| !path_is_inside(path, root))
        || original_audio
            .as_ref()
            .is_some_and(|path| !path_is_inside(path, root))
    {
        return Err(
            "La ruta original de recuperación no pertenece a la carpeta de medios configurada"
                .to_string(),
        );
    }
    if trash_video
        .as_ref()
        .is_some_and(|path| !path_is_inside(path, &trash_root))
        || trash_audio
            .as_ref()
            .is_some_and(|path| !path_is_inside(path, &trash_root))
    {
        return Err(
            "La ruta de la papelera no pertenece al almacenamiento configurado".to_string(),
        );
    }
    if trash_video.as_ref().is_some_and(|path| !path.is_file())
        || trash_audio.as_ref().is_some_and(|path| !path.is_file())
    {
        return Err(
            "La purga ya expiró: los medios fueron limpiados de la papelera y no se puede deshacer"
                .to_string(),
        );
    }
    if original_video.as_ref().is_some_and(|path| path.exists())
        || original_audio.as_ref().is_some_and(|path| path.exists())
    {
        return Err("No se puede deshacer porque el destino original ya existe".to_string());
    }

    // Read and validate all generated-output rows before moving anything. This
    // makes a malformed row fail during preflight instead of leaving a half
    // recovered job on disk.
    let output_rows = {
        let mut statement = conn
            .prepare("SELECT output_id, original_path, trash_path FROM generated_output_purge WHERE purge_id = ?1")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![purge_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    PathBuf::from(row.get::<_, String>(1)?),
                    PathBuf::from(row.get::<_, String>(2)?),
                ))
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
    };
    for (_, original, trash) in &output_rows {
        if !path_is_inside(original, root) || !path_is_inside(trash, &trash_root) {
            return Err("La salida generada contiene una ruta insegura".into());
        }
        if !trash.is_file() || original.exists() {
            return Err(
                "La salida generada no puede recuperarse porque falta o el destino ya existe"
                    .into(),
            );
        }
    }

    let mut moved_files = Vec::<(PathBuf, PathBuf)>::new();
    let mut moved_outputs = Vec::<(PathBuf, PathBuf)>::new();
    if let (Some(source), Some(destination)) = (trash_video.clone(), original_video.clone()) {
        if let Err(error) = move_file_exclusive(&source, &destination) {
            return Err(undo_failure(
                error.to_string(),
                &mut moved_files,
                &mut moved_outputs,
            ));
        }
        moved_files.push((source, destination));
    }
    if let (Some(source), Some(destination)) = (trash_audio.clone(), original_audio.clone()) {
        if let Err(error) = move_file_exclusive(&source, &destination) {
            return Err(undo_failure(
                error.to_string(),
                &mut moved_files,
                &mut moved_outputs,
            ));
        }
        moved_files.push((source, destination));
    }

    let mut moved_output_count = 0_u64;
    let mut moved_generated = Vec::<(i64, PathBuf, PathBuf, u64)>::new();
    for (output_id, original, trash) in output_rows {
        let size = fs::metadata(&trash)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        if let Err(error) = move_file_exclusive(&trash, &original) {
            return Err(undo_failure(
                error.to_string(),
                &mut moved_files,
                &mut moved_outputs,
            ));
        }
        moved_outputs.push((trash.clone(), original.clone()));
        moved_generated.push((output_id, original, trash, size));
        moved_output_count = moved_output_count.saturating_add(size);
    }

    let video_bytes = original_video
        .as_ref()
        .and_then(|path| fs::metadata(path).ok())
        .map(|metadata| metadata.len());
    let audio_bytes = original_audio
        .as_ref()
        .and_then(|path| fs::metadata(path).ok())
        .map(|metadata| metadata.len());

    // Filesystem moves happen before the DB transaction, but every DB update
    // is committed as one unit. If any statement or commit fails, the
    // transaction rolls back and all physical moves are reversed as well.
    let transaction = match conn.unchecked_transaction() {
        Ok(transaction) => transaction,
        Err(error) => {
            return Err(undo_failure(
                format!("No se pudo abrir la transacción de recuperación: {error}"),
                &mut moved_files,
                &mut moved_outputs,
            ));
        }
    };
    for (output_id, original, _, size) in &moved_generated {
        if let Err(error) = transaction.execute(
            "UPDATE generated_outputs SET path = ?1, size_bytes = ?2 WHERE id = ?3",
            params![
                original.to_string_lossy().to_string(),
                i64::try_from(*size).unwrap_or(i64::MAX),
                output_id
            ],
        ) {
            drop(transaction);
            return Err(undo_failure(
                error.to_string(),
                &mut moved_files,
                &mut moved_outputs,
            ));
        }
    }
    if let Err(error) = transaction.execute(
        "UPDATE media SET video_path = ?1, audio_path = ?2, video_bytes = ?3,
            audio_bytes = ?4, source_state = 'local', purged_at = NULL, purged_reason = NULL
         WHERE job_id = ?5",
        params![
            original_video
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            original_audio
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            video_bytes.map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
            audio_bytes.map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
            job_id,
        ],
    ) {
        drop(transaction);
        return Err(undo_failure(
            error.to_string(),
            &mut moved_files,
            &mut moved_outputs,
        ));
    }
    if let Err(error) = transaction.execute(
        "UPDATE purge_history SET undone_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![purge_id],
    ) {
        drop(transaction);
        return Err(undo_failure(
            error.to_string(),
            &mut moved_files,
            &mut moved_outputs,
        ));
    }
    if let Err(error) = transaction.commit() {
        return Err(undo_failure(
            error.to_string(),
            &mut moved_files,
            &mut moved_outputs,
        ));
    }
    moved_files.clear();
    moved_outputs.clear();

    Ok(PurgeAction {
        purge_id,
        job_id,
        freed_bytes: video_bytes
            .unwrap_or(0)
            .saturating_add(audio_bytes.unwrap_or(0))
            .saturating_add(moved_output_count),
        title: title.unwrap_or_else(|| format!("Job #{job_id}")),
    })
}

/// Permanently removes only the application-owned reversible media trash.
/// This action is intentionally separate from `apply_purge` so freeing disk
/// space always requires an explicit user confirmation.
pub fn empty_media_trash(root: &Path) -> Result<u64, String> {
    let trash = trash_root(root);
    if !trash.exists() {
        return Ok(0);
    }
    let bytes = recursive_size(&trash).map_err(|error| error.to_string())?;
    let entries = fs::read_dir(&trash).map_err(|error| error.to_string())?;
    for entry in entries {
        let path = entry.map_err(|error| error.to_string())?.path();
        let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
        if metadata.is_dir() {
            fs::remove_dir_all(&path).map_err(|error| error.to_string())?;
        } else {
            fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
    }
    Ok(bytes)
}

pub fn list_artifacts(conn: &Connection, job_id: i64) -> rusqlite::Result<Vec<ArtifactRecord>> {
    let mut statement = conn.prepare(
        "SELECT id, job_id, kind, path, timestamp, label, protected, size_bytes, created_at
         FROM media_artifacts WHERE job_id = ?1 ORDER BY kind, timestamp, id",
    )?;
    let rows = statement.query_map(params![job_id], |row| {
        let size = row.get::<_, i64>(7)?.max(0) as u64;
        Ok(ArtifactRecord {
            id: row.get(0)?,
            job_id: row.get(1)?,
            kind: row.get(2)?,
            path: row.get(3)?,
            timestamp: row.get(4)?,
            label: row.get(5)?,
            protected: row.get::<_, i64>(6)? != 0,
            size_bytes: size,
            created_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

pub fn save_artifact(
    conn: &Connection,
    job_id: i64,
    path: &Path,
    kind: &str,
    timestamp: Option<f64>,
    label: Option<&str>,
    protected: bool,
) -> rusqlite::Result<i64> {
    if !matches!(kind, "poster" | "keyframe" | "screenshot") {
        return Err(rusqlite::Error::InvalidParameterName(
            "invalid artifact kind".into(),
        ));
    }
    let size = fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO media_artifacts (job_id, kind, path, timestamp, label, protected, size_bytes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            job_id,
            kind,
            path.to_string_lossy().to_string(),
            timestamp,
            label,
            protected,
            i64::try_from(size).unwrap_or(i64::MAX),
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn register_generated_artifacts_with_metadata(
    conn: &Connection,
    job_id: i64,
    visual_analysis: Option<&serde_json::Value>,
) -> rusqlite::Result<()> {
    let directory = durable_artifacts_root(job_id);
    if !directory.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(directory).into_iter().flatten().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        let kind = if name == "poster.jpg" {
            "poster"
        } else if name.starts_with("keyframe-") && name.ends_with(".jpg") {
            "keyframe"
        } else {
            continue;
        };
        let path_string = path.to_string_lossy().to_string();
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM media_artifacts WHERE job_id = ?1 AND path = ?2)",
            params![job_id, path_string],
            |row| row.get(0),
        )?;
        if !exists {
            let metadata = visual_analysis
                .and_then(|value| value.get("artifacts"))
                .and_then(serde_json::Value::as_array)
                .and_then(|records| {
                    records.iter().find(|record| {
                        record.get("path").and_then(serde_json::Value::as_str)
                            == Some(path_string.as_str())
                    })
                });
            let timestamp = metadata
                .and_then(|record| record.get("timestamp"))
                .and_then(serde_json::Value::as_f64);
            let label = metadata
                .and_then(|record| record.get("label"))
                .and_then(serde_json::Value::as_str);
            let protected = metadata
                .and_then(|record| record.get("protected"))
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false);
            save_artifact(conn, job_id, &path, kind, timestamp, label, protected)?;
        }
    }
    Ok(())
}

pub fn save_manual_frame(
    conn: &Connection,
    root: &Path,
    job_id: i64,
    bytes: &[u8],
    timestamp: f64,
    label: Option<&str>,
) -> Result<ArtifactRecord, String> {
    if bytes.is_empty() || bytes.len() > MAX_FRAME_BYTES {
        return Err(format!(
            "La captura debe pesar entre 1 byte y {} MiB",
            MAX_FRAME_BYTES / (1024 * 1024)
        ));
    }
    let current: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM media_artifacts WHERE job_id = ?1 AND kind = 'screenshot'",
            params![job_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if current >= 10 {
        return Err("Este job ya alcanzó el máximo de 10 capturas manuales".to_string());
    }
    ensure_media_root(root).map_err(|error| error.to_string())?;
    let directory = durable_artifacts_root(job_id);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!(
        "screenshot-{}-{}.jpg",
        chrono::Utc::now().timestamp_millis(),
        current + 1
    ));
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    let id = save_artifact(
        conn,
        job_id,
        &path,
        "screenshot",
        Some(timestamp),
        label,
        true,
    )
    .map_err(|error| error.to_string())?;
    Ok(ArtifactRecord {
        id,
        job_id,
        kind: "screenshot".to_string(),
        path: path.to_string_lossy().to_string(),
        timestamp: Some(timestamp),
        label: label.map(str::to_string),
        protected: true,
        size_bytes: bytes.len() as u64,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(name: &str) -> PathBuf {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "pulsaria-storage-{}-{}-{}",
            name,
            std::process::id(),
            suffix
        ))
    }

    fn storage_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("failed to open sqlite test database");
        conn.execute_batch(
            "CREATE TABLE jobs (
                id INTEGER PRIMARY KEY,
                status TEXT NOT NULL
            );
            CREATE TABLE media (
                job_id INTEGER PRIMARY KEY,
                title TEXT,
                video_path TEXT,
                audio_path TEXT,
                transcript_path TEXT,
                video_bytes INTEGER,
                audio_bytes INTEGER,
                keep_status TEXT DEFAULT 'online',
                play_count INTEGER DEFAULT 0,
                open_count INTEGER DEFAULT 0,
                search_hit_count INTEGER DEFAULT 0,
                favorite BOOLEAN DEFAULT 0,
                pinned BOOLEAN DEFAULT 0,
                last_accessed_at TEXT,
                downloaded_at TEXT,
                source_state TEXT DEFAULT 'local',
                purged_at TEXT,
                purged_reason TEXT
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
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE purge_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                original_video_path TEXT,
                original_audio_path TEXT,
                trash_video_path TEXT,
                trash_audio_path TEXT,
                reason TEXT NOT NULL,
                undone_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE generated_output_purge (
                purge_id INTEGER NOT NULL,
                output_id INTEGER NOT NULL,
                original_path TEXT NOT NULL,
                trash_path TEXT NOT NULL
            );
            CREATE TABLE transcript_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                segment_index INTEGER NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                text TEXT NOT NULL
            );
            CREATE TABLE transcript_embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding_vector BLOB NOT NULL
            );",
        )
        .expect("failed to create sqlite test schema");
        conn
    }

    #[test]
    fn recommendation_never_crosses_safe_free_space() {
        let recommendation = recommend_storage(SetupIntent::Archive, 30 * GIB);
        assert!(recommendation.quota_bytes <= 27 * GIB);
        assert!(recommendation.reserve_bytes >= 2 * GIB);
    }

    #[test]
    fn low_disk_recommendation_blocks_new_media() {
        let recommendation = recommend_storage(SetupIntent::Knowledge, GIB / 2);
        assert_eq!(recommendation.quota_bytes, 0);
        assert!(recommendation.reason.contains("1 GiB"));
    }

    #[test]
    fn quota_counts_only_pulsaria_owned_media_and_caches() {
        let root = test_root("managed-size");
        ensure_media_root(&root).expect("failed to prepare test media root");
        fs::write(root.join("unrelated-video.mp4"), b"unmanaged").unwrap();
        fs::write(media_root(&root).join("owned.mp4"), b"owned-media").unwrap();
        fs::write(staging_root(&root).join("download.part"), b"staged").unwrap();
        fs::create_dir_all(root.join(".pulsaria").join("cache")).unwrap();
        fs::write(
            root.join(".pulsaria")
                .join("cache")
                .join("embeddings.cache"),
            b"cache",
        )
        .unwrap();

        let status = storage_status(&root, 0, None);

        assert_eq!(status.used_media_bytes, 11 + 6 + 5);
        assert_eq!(status.staged_bytes, 6);
        fs::remove_dir_all(root).expect("failed to clean exact test root");
    }

    #[test]
    fn purge_recency_signal_is_bounded_and_explainable() {
        let (fresh_score, fresh_reason) = access_recency(&chrono::Utc::now().to_rfc3339());
        assert!((29..=30).contains(&fresh_score));
        assert!(fresh_reason.contains("Acceso reciente"));

        let (old_score, old_reason) = access_recency("2000-01-01 00:00:00");
        assert_eq!(old_score, 0);
        assert!(old_reason.contains("antiguo"));

        let (missing_score, missing_reason) = access_recency("");
        assert_eq!(missing_score, 0);
        assert!(missing_reason.contains("Sin acceso"));
    }

    #[test]
    fn purge_moves_only_large_media_and_undo_restores_it() {
        let root = test_root("purge");
        ensure_media_root(&root).expect("failed to prepare test media root");
        let job_id = 7_i64;
        let media_dir = job_media_dir(&root, job_id);
        fs::create_dir_all(&media_dir).expect("failed to create job media directory");
        let video_path = media_dir.join("video.mp4");
        let audio_path = media_dir.join("audio.mp3");
        fs::write(&video_path, b"video-bytes").expect("failed to write video fixture");
        fs::write(&audio_path, b"audio-bytes").expect("failed to write audio fixture");
        let transcript_path = root.join("durable-transcript.txt");
        fs::write(&transcript_path, "conocimiento durable")
            .expect("failed to write transcript fixture");
        let poster_path = root.join("poster.jpg");
        fs::write(&poster_path, b"poster-bytes").expect("failed to write poster fixture");
        let text_output_path = job_media_dir(&root, job_id)
            .join("exports")
            .join("text.txt");
        let video_output_path = job_media_dir(&root, job_id)
            .join("exports")
            .join("video-export.mp4");
        fs::create_dir_all(text_output_path.parent().expect("text output parent"))
            .expect("failed to create output directory");
        fs::write(&text_output_path, b"knowledge export")
            .expect("failed to write text output fixture");
        fs::write(&video_output_path, b"encoded-video")
            .expect("failed to write video output fixture");

        let mut conn = storage_test_db();
        conn.execute(
            "INSERT INTO jobs (id, status) VALUES (?1, 'complete')",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO media (
                job_id, title, video_path, audio_path, transcript_path,
                video_bytes, audio_bytes, keep_status, source_state,
                downloaded_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'online', 'local', '2026-09-12')",
            params![
                job_id,
                "Knowledge item",
                video_path.to_string_lossy().to_string(),
                audio_path.to_string_lossy().to_string(),
                transcript_path.to_string_lossy().to_string(),
                11_i64,
                11_i64,
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO transcript_segments
                (job_id, segment_index, start_time, end_time, text)
             VALUES (?1, 0, 0.0, 1.0, 'conocimiento durable')",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO transcript_embeddings
                (job_id, chunk_index, chunk_text, embedding_vector)
             VALUES (?1, 0, 'conocimiento durable', X'010203')",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO media_artifacts (job_id, kind, path, protected)
             VALUES (?1, 'poster', ?2, 0)",
            params![job_id, poster_path.to_string_lossy().to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO generated_outputs
                (job_id, category, format, path, size_bytes, validated, label)
             VALUES (?1, 'text', 'txt', ?2, 100, 1, 'TEXT TXT')",
            params![job_id, text_output_path.to_string_lossy().to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO generated_outputs
                (job_id, category, format, path, size_bytes, validated, label)
             VALUES (?1, 'video', 'mp4', ?2, 13, 1, 'VIDEO MP4')",
            params![job_id, video_output_path.to_string_lossy().to_string()],
        )
        .unwrap();

        let candidates = preview_purge(&conn, &root, 0).expect("preview should succeed");
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].job_id, job_id);
        assert_eq!(candidates[0].media_bytes, 35);

        let actions = apply_purge(&mut conn, &root, &[job_id], "quota test")
            .expect("purge should move eligible media");
        assert_eq!(actions.len(), 1);
        assert!(!video_path.exists());
        assert!(!audio_path.exists());
        assert!(text_output_path.exists());
        assert!(!video_output_path.exists());
        assert_eq!(
            conn.query_row(
                "SELECT path FROM generated_outputs WHERE job_id = ?1 AND format = 'txt'",
                params![job_id],
                |row| row.get::<_, String>(0),
            )
            .unwrap(),
            text_output_path.to_string_lossy().to_string()
        );
        assert!(transcript_path.exists());
        assert!(poster_path.exists());
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM transcript_segments WHERE job_id = ?1",
                params![job_id],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM transcript_embeddings WHERE job_id = ?1",
                params![job_id],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );

        let purge_id = actions[0].purge_id;
        let restored = undo_purge(&conn, &root, purge_id).expect("undo should restore media");
        assert_eq!(restored.job_id, job_id);
        assert!(video_path.exists());
        assert!(audio_path.exists());
        assert!(video_output_path.exists());
        assert_eq!(
            conn.query_row(
                "SELECT path FROM generated_outputs WHERE job_id = ?1 AND format = 'mp4'",
                params![job_id],
                |row| row.get::<_, String>(0),
            )
            .unwrap(),
            video_output_path.to_string_lossy().to_string()
        );
        let source_state: String = conn
            .query_row(
                "SELECT source_state FROM media WHERE job_id = ?1",
                params![job_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(source_state, "local");

        let second_purge = apply_purge(&mut conn, &root, &[job_id], "expiry test")
            .expect("a restored online item should be purgeable again");
        let status = storage_status(&root, 0, None);
        assert!(status.trash_bytes > 0);
        let freed = empty_media_trash(&root).expect("trash cleanup should succeed");
        assert!(freed > 0);
        assert_eq!(storage_status(&root, 0, None).trash_bytes, 0);
        let expired = undo_purge(&conn, &root, second_purge[0].purge_id)
            .expect_err("undo must fail after definitive trash cleanup");
        assert!(expired.contains("expiró"));
        let source_after_expiry: String = conn
            .query_row(
                "SELECT source_state FROM media WHERE job_id = ?1",
                params![job_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(source_after_expiry, "online");
        assert!(transcript_path.exists());
        fs::remove_dir_all(&root).expect("failed to clean exact test root");
    }

    #[test]
    fn purge_preview_excludes_favorites_pins_and_protected_screenshots() {
        let root = test_root("protection");
        ensure_media_root(&root).expect("failed to prepare test media root");
        let conn = storage_test_db();
        for job_id in [1_i64, 2, 3, 4] {
            let media_dir = job_media_dir(&root, job_id);
            fs::create_dir_all(&media_dir).unwrap();
            let video_path = media_dir.join("video.mp4");
            fs::write(&video_path, b"video").unwrap();
            conn.execute(
                "INSERT INTO jobs (id, status) VALUES (?1, 'complete')",
                params![job_id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO media
                    (job_id, title, video_path, video_bytes, keep_status,
                     favorite, pinned, source_state)
                 VALUES (?1, ?2, ?3, 5, 'online', ?4, ?5, 'local')",
                params![
                    job_id,
                    format!("Job {job_id}"),
                    video_path.to_string_lossy().to_string(),
                    job_id == 2,
                    job_id == 3,
                ],
            )
            .unwrap();
        }
        conn.execute(
            "INSERT INTO media_artifacts (job_id, kind, path, protected)
             VALUES (4, 'screenshot', 'protected.jpg', 1)",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO jobs (id, status) VALUES (5, 'complete')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO media
                (job_id, title, video_path, video_bytes, keep_status, source_state)
             VALUES (5, 'Missing media', ?1, 999, 'online', 'local')",
            params![job_media_dir(&root, 5)
                .join("video.mp4")
                .to_string_lossy()
                .to_string()],
        )
        .unwrap();

        let candidates = preview_purge(&conn, &root, 0).expect("preview should succeed");
        assert_eq!(
            candidates
                .iter()
                .map(|item| item.job_id)
                .collect::<Vec<_>>(),
            vec![1]
        );
        fs::remove_dir_all(&root).expect("failed to clean exact test root");
    }

    #[test]
    fn purge_failure_restores_media_when_generated_output_is_unsafe() {
        let root = test_root("purge-rollback");
        ensure_media_root(&root).expect("failed to prepare test media root");
        let job_id = 12_i64;
        let media_dir = job_media_dir(&root, job_id);
        fs::create_dir_all(&media_dir).unwrap();
        let video_path = media_dir.join("video.mp4");
        fs::write(&video_path, b"video").unwrap();
        let unsafe_output = root
            .parent()
            .expect("test root should have a parent")
            .join("pulsaria-unsafe-generated-output.mp4");

        let mut conn = storage_test_db();
        conn.execute(
            "INSERT INTO jobs (id, status) VALUES (?1, 'complete')",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO media
                (job_id, title, video_path, video_bytes, keep_status, source_state)
             VALUES (?1, 'Rollback item', ?2, 5, 'online', 'local')",
            params![job_id, video_path.to_string_lossy().to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO generated_outputs
                (job_id, category, format, path, size_bytes, validated, label)
             VALUES (?1, 'video', 'mp4', ?2, 99, 1, 'UNSAFE VIDEO')",
            params![job_id, unsafe_output.to_string_lossy().to_string()],
        )
        .unwrap();

        let error = apply_purge(&mut conn, &root, &[job_id], "rollback test")
            .expect_err("unsafe generated output must abort purge");

        assert!(error.contains("salida generada"));
        assert!(video_path.exists());
        let stored_path: String = conn
            .query_row(
                "SELECT video_path FROM media WHERE job_id = ?1",
                params![job_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored_path, video_path.to_string_lossy().to_string());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM purge_history", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap(),
            0
        );
        fs::remove_dir_all(root).expect("failed to clean exact test root");
    }

    #[test]
    fn replacing_a_durable_file_keeps_the_new_transcript_on_windows() {
        let root = test_root("replace-file");
        fs::create_dir_all(&root).expect("test root should be created");
        let source = root.join("transcript.txt.part");
        let destination = root.join("transcript.txt");
        fs::write(&source, "transcript nuevo").expect("new transcript should be written");
        fs::write(&destination, "transcript anterior").expect("old transcript should be written");

        replace_file(&source, &destination).expect("durable file should be replaced");

        assert!(!source.exists());
        assert_eq!(
            fs::read_to_string(&destination).expect("new transcript should remain"),
            "transcript nuevo"
        );
        assert!(!root.join(".transcript.txt.previous").exists());
        fs::remove_dir_all(root).expect("test root should be removable");
    }
}
