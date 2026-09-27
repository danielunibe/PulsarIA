//! Profile Sources Discovery Engine for Pulsaria.
//!
//! Handles:
//! 1. TikTok profile metadata resolution (display name, avatar, followers, following, likes, posts count)
//! 2. Multi-channel inventory discovery (posts, reposts, saved, favorites)
//! 3. Content identity normalization & deduplication before downloads
//! 4. Newest-first backfill ordering
//! 5. Direct integration with Pulsaria's existing QueueService & Home processing cards
//! 6. Capability state classification & persistent checkpoints

use crate::application::queue_service::QueueService;
use crate::db::{self, ProfileChannelRecord};
use crate::runtime;
use crate::url_utils::canonicalize_tiktok_url;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tokio::process::Command;
use tokio::sync::Semaphore;
use tracing::{error, info, warn};

/// Global concurrency limiter for discovery processes to prevent resource exhaustion.
/// Limits parallel profile enumeration scans to 2 simultaneous processes.
static GLOBAL_DISCOVERY_SEMAPHORE: std::sync::OnceLock<Arc<Semaphore>> = std::sync::OnceLock::new();

fn discovery_limiter() -> Arc<Semaphore> {
    GLOBAL_DISCOVERY_SEMAPHORE
        .get_or_init(|| Arc::new(Semaphore::new(2)))
        .clone()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileMetadataSnapshot {
    pub platform: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub cover_url: Option<String>,
    pub verified: Option<bool>,
    pub following_count: Option<i64>,
    pub followers_count: Option<i64>,
    pub likes_count: Option<i64>,
    pub posts_count: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelDiscoverySummary {
    pub channel_kind: String,
    pub status: String,
    pub discovered_count: i64,
    pub queued_count: i64,
    pub duplicate_count: i64,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileDiscoveryReport {
    pub profile_source_id: i64,
    pub metadata_resolved: bool,
    pub channels: Vec<ChannelDiscoverySummary>,
    pub total_discovered: i64,
    pub total_queued: i64,
    pub total_duplicates: i64,
}

pub struct ProfileDiscoveryService {
    db: Arc<Mutex<rusqlite::Connection>>,
    queue: Arc<QueueService>,
    app_handle: tauri::AppHandle,
    pub is_syncing: Arc<AtomicBool>,
}

impl ProfileDiscoveryService {
    pub fn new(
        db: Arc<Mutex<rusqlite::Connection>>,
        queue: Arc<QueueService>,
        app_handle: tauri::AppHandle,
    ) -> Self {
        Self {
            db,
            queue,
            app_handle,
            is_syncing: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Resolves profile metadata using curl_cffi Chrome impersonation in the Python worker.
    /// Invariant 9: Unknown values remain null, confirmed zero is 0.
    pub async fn resolve_profile_metadata(
        &self,
        profile_url: &str,
    ) -> Result<ProfileMetadataSnapshot, String> {
        let python_exe = runtime::python_executable();
        let script = runtime::worker_script("main.py");
        let worker_dir = script
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));

        let mut cmd = Command::new(python_exe);
        cmd.arg(&script)
            .arg("--resolve-profile-metadata")
            .arg("--profile-url")
            .arg(profile_url)
            .current_dir(&worker_dir)
            .env("PYTHONPATH", &worker_dir)
            .env("PYTHONUNBUFFERED", "1");

        crate::process_control::hide_tokio_command(&mut cmd);

        let output = tokio::time::timeout(Duration::from_secs(30), cmd.output())
            .await
            .map_err(|_| "Timed out resolving profile metadata".to_string())?
            .map_err(|err| format!("Failed to execute metadata resolver: {err}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if stdout.is_empty() {
            return Err(format!(
                "Empty output from metadata resolver. stderr: {stderr}"
            ));
        }

        let parsed: serde_json::Value = serde_json::from_str(&stdout).map_err(|err| {
            format!("Invalid JSON from metadata resolver: {err}. Output was: {stdout}")
        })?;

        if let Some(err_msg) = parsed.get("error").and_then(|v| v.as_str()) {
            return Err(err_msg.to_string());
        }

        let snapshot = ProfileMetadataSnapshot {
            platform: parsed
                .get("platform")
                .and_then(|v| v.as_str())
                .unwrap_or("tiktok")
                .to_string(),
            username: parsed
                .get("username")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            display_name: parsed
                .get("display_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            avatar_url: parsed
                .get("avatar_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            cover_url: parsed
                .get("cover_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            verified: parsed.get("verified").and_then(|v| v.as_bool()),
            following_count: parsed.get("following_count").and_then(|v| v.as_i64()),
            followers_count: parsed.get("followers_count").and_then(|v| v.as_i64()),
            likes_count: parsed.get("likes_count").and_then(|v| v.as_i64()),
            posts_count: parsed.get("posts_count").and_then(|v| v.as_i64()),
            error: None,
        };

        Ok(snapshot)
    }

    /// Resolves metadata and persists it directly into `collection_sources`.
    pub async fn refresh_profile_metadata(
        &self,
        source_id: i64,
    ) -> Result<ProfileMetadataSnapshot, String> {
        let (profile_url, _username) = {
            let conn = self
                .db
                .lock()
                .map_err(|_| "Database lock poisoned".to_string())?;
            let source = db::get_collection_source(&conn, source_id)
                .map_err(|err| format!("Source not found: {err}"))?;
            (source.profile_url, source.username)
        };

        info!("Resolving metadata for profile source {source_id}: {profile_url}");
        match self.resolve_profile_metadata(&profile_url).await {
            Ok(snapshot) => {
                let conn = self
                    .db
                    .lock()
                    .map_err(|_| "Database lock poisoned".to_string())?;
                db::update_profile_source_metadata(
                    &conn,
                    source_id,
                    snapshot.display_name.as_deref(),
                    snapshot.avatar_url.as_deref(),
                    snapshot.cover_url.as_deref(),
                    snapshot.verified,
                    snapshot.following_count,
                    snapshot.followers_count,
                    snapshot.likes_count,
                    snapshot.posts_count,
                )
                .map_err(|err| format!("Failed to persist profile metadata: {err}"))?;

                let _ = self
                    .app_handle
                    .emit("tiktok_source_metadata_updated", &snapshot);
                Ok(snapshot)
            }
            Err(err) => {
                warn!("Metadata resolution warning for source {source_id}: {err}");
                Err(err)
            }
        }
    }

    /// Primary discovery pipeline for a profile source.
    /// Discovers enabled channels, deduplicates content items, enqueues to canonical Pulsaria queue.
    pub async fn discover_profile(
        &self,
        source_id: i64,
        is_manual_sync: bool,
    ) -> Result<ProfileDiscoveryReport, String> {
        // Enforce concurrency limit across profile discoveries
        let limiter = discovery_limiter();
        let _permit = limiter
            .acquire()
            .await
            .map_err(|err| format!("Failed to acquire discovery permit: {err}"))?;

        // 1. Refresh metadata in the background / first step
        let _ = self.refresh_profile_metadata(source_id).await;

        let source = {
            let conn = self
                .db
                .lock()
                .map_err(|_| "Database lock poisoned".to_string())?;
            db::get_collection_source(&conn, source_id)
                .map_err(|err| format!("Source {source_id} not found: {err}"))?
        };

        if !source.active && !is_manual_sync {
            info!("Source {source_id} is paused; skipping discovery");
            return Ok(ProfileDiscoveryReport {
                profile_source_id: source_id,
                metadata_resolved: true,
                channels: Vec::new(),
                total_discovered: 0,
                total_queued: 0,
                total_duplicates: 0,
            });
        }

        // 2. Fetch enabled channels for this profile
        let channels = {
            let conn = self
                .db
                .lock()
                .map_err(|_| "Database lock poisoned".to_string())?;
            // Ensure channels exist first
            db::ensure_profile_channels(&conn, source_id, &source.watch_config_json)
                .map_err(|err| err.to_string())?;
            db::get_profile_channels(&conn, source_id).map_err(|err| err.to_string())?
        };

        let mut report = ProfileDiscoveryReport {
            profile_source_id: source_id,
            metadata_resolved: true,
            channels: Vec::new(),
            total_discovered: 0,
            total_queued: 0,
            total_duplicates: 0,
        };

        let _ = self.app_handle.emit(
            "tiktok_source_sync_started",
            serde_json::json!({
                "sourceId": source_id,
                "isManual": is_manual_sync,
            }),
        );

        let sync_run_id = chrono::Utc::now().to_rfc3339();

        for channel in channels {
            if !channel.enabled {
                continue;
            }

            let summary = self.discover_channel(&source, &channel, &sync_run_id).await;
            report.total_discovered += summary.discovered_count;
            report.total_queued += summary.queued_count;
            report.total_duplicates += summary.duplicate_count;
            report.channels.push(summary);
        }

        // Update overall collection_sources sync status
        {
            let conn = self
                .db
                .lock()
                .map_err(|_| "Database lock poisoned".to_string())?;
            let _ =
                db::mark_collection_source_synced(&conn, source_id, report.total_queued as usize);
        }

        let _ = self.app_handle.emit(
            "tiktok_source_sync_completed",
            serde_json::json!({
                "sourceId": source_id,
                "report": &report,
            }),
        );

        Ok(report)
    }

    /// Discovers a single profile channel (e.g. posts, reposts, saved, favorites).
    async fn discover_channel(
        &self,
        source: &db::CollectionSourceRecord,
        channel: &ProfileChannelRecord,
        sync_run_id: &str,
    ) -> ChannelDiscoverySummary {
        let channel_kind = channel.kind.clone();
        info!(
            "Starting discovery for source {} channel: {}",
            source.id, channel_kind
        );

        // Update channel status to discovering
        {
            if let Ok(conn) = self.db.lock() {
                let _ = db::update_profile_channel_status(
                    &conn,
                    source.id,
                    &channel_kind,
                    "discovering_recent",
                    None,
                    None,
                );
            }
        }

        let _ = self.app_handle.emit(
            "tiktok_source_channel_status_changed",
            serde_json::json!({
                "sourceId": source.id,
                "kind": &channel_kind,
                "status": "discovering_recent",
            }),
        );

        // Map channel kind to scanner category
        let scanner_category = match channel_kind.as_str() {
            "posts" => "posts",
            "reposts" => "reposts",
            "saved" => "saved",
            "favorites" => "likes",
            other => other,
        };

        // Call queue service scanner
        let scan_result = self
            .queue
            .scan_source_with_browser(
                &source.profile_url,
                &[scanner_category.to_string()],
                source.browser.as_deref(),
                100, // Batch limit
                channel.cursor.as_deref(),
            )
            .await;

        let scan = match scan_result {
            Ok(res) => res,
            Err(err) => {
                warn!(
                    "Scanner error for source {} channel {}: {}",
                    source.id, channel_kind, err
                );
                let (status, code) = classify_error_string(&err);
                if let Ok(conn) = self.db.lock() {
                    let _ = db::update_profile_channel_status(
                        &conn,
                        source.id,
                        &channel_kind,
                        &status,
                        Some(&code),
                        Some(&err),
                    );
                }
                let _ = self.app_handle.emit(
                    "tiktok_source_channel_status_changed",
                    serde_json::json!({
                        "sourceId": source.id,
                        "kind": &channel_kind,
                        "status": status,
                        "errorCode": code,
                        "errorMessage": err,
                    }),
                );
                return ChannelDiscoverySummary {
                    channel_kind,
                    status,
                    discovered_count: 0,
                    queued_count: 0,
                    duplicate_count: 0,
                    error_code: Some(code),
                    error_message: Some(err),
                };
            }
        };

        let category_data = match scan.categories.get(scanner_category) {
            Some(cat) => cat,
            None => {
                let status = "unsupported".to_string();
                let code = "PROVIDER_UNSUPPORTED".to_string();
                if let Ok(conn) = self.db.lock() {
                    let _ = db::update_profile_channel_status(
                        &conn,
                        source.id,
                        &channel_kind,
                        &status,
                        Some(&code),
                        Some("Categoría no retornada por el proveedor"),
                    );
                }
                return ChannelDiscoverySummary {
                    channel_kind,
                    status,
                    discovered_count: 0,
                    queued_count: 0,
                    duplicate_count: 0,
                    error_code: Some(code),
                    error_message: Some("Categoría no retornada por el proveedor".into()),
                };
            }
        };

        if !category_data.available {
            let status = if category_data.auth_required {
                "requires_auth".to_string()
            } else {
                "unsupported".to_string()
            };
            let code = if category_data.auth_required {
                "AUTH_REQUIRED".to_string()
            } else {
                "PROVIDER_UNSUPPORTED".to_string()
            };
            let reason = category_data
                .reason
                .clone()
                .unwrap_or_else(|| "Categoría no disponible".into());

            if let Ok(conn) = self.db.lock() {
                let _ = db::update_profile_channel_status(
                    &conn,
                    source.id,
                    &channel_kind,
                    &status,
                    Some(&code),
                    Some(&reason),
                );
            }
            let _ = self.app_handle.emit(
                "tiktok_source_channel_status_changed",
                serde_json::json!({
                    "sourceId": source.id,
                    "kind": &channel_kind,
                    "status": status,
                    "errorCode": code,
                    "errorMessage": reason,
                }),
            );
            return ChannelDiscoverySummary {
                channel_kind,
                status,
                discovered_count: 0,
                queued_count: 0,
                duplicate_count: 0,
                error_code: Some(code),
                error_message: Some(reason),
            };
        }

        // Category is available! Process items newest-first
        let mut items = category_data.items.clone();

        // Sort items newest-first: if timestamp is present, sort descending
        items.sort_by(|a, b| {
            match (a.timestamp, b.timestamp) {
                (Some(t1), Some(t2)) => t2.partial_cmp(&t1).unwrap_or(std::cmp::Ordering::Equal),
                _ => std::cmp::Ordering::Equal, // preserve existing provider ordering
            }
        });

        let mut discovered = 0i64;
        let mut queued = 0i64;
        let mut duplicates = 0i64;
        let mut newest_id: Option<String> = channel.newest_known_content_id.clone();
        let mut oldest_id: Option<String> = channel.oldest_known_content_id.clone();

        for item in &items {
            let canonical_url = canonicalize_tiktok_url(&item.url);
            if canonical_url.is_empty() {
                continue;
            }

            // Extract stable platform content ID
            let platform_content_id =
                extract_content_id_from_url(&canonical_url, item.id.as_deref());

            if newest_id.is_none() {
                newest_id = Some(platform_content_id.clone());
            }
            oldest_id = Some(platform_content_id.clone());

            let db_step_result = {
                let conn = match self.db.lock() {
                    Ok(c) => c,
                    Err(_) => break,
                };

                let published_at = item.upload_date.as_deref();
                let (content_id, _is_new_content) = match db::upsert_content_item(
                    &conn,
                    "tiktok",
                    &platform_content_id,
                    &canonical_url,
                    None,
                    source.username.as_deref(),
                    None,
                    published_at,
                    None,
                ) {
                    Ok(res) => res,
                    Err(err) => {
                        error!("Error upserting content item: {err}");
                        continue;
                    }
                };

                let provenance = serde_json::json!({
                    "profileSourceId": source.id,
                    "channelKind": &channel_kind,
                    "url": &canonical_url,
                })
                .to_string();

                if let Err(err) = db::upsert_content_relationship(
                    &conn,
                    content_id,
                    source.id,
                    &channel_kind,
                    Some(&provenance),
                    Some(sync_run_id),
                ) {
                    error!("Error upserting relationship: {err}");
                }

                let existing_job_id = db::find_job_id_by_url(&conn, &canonical_url).ok().flatten();
                if let Some(job_id) = existing_job_id {
                    let _ = db::link_content_item_job(&conn, content_id, job_id);
                }

                (content_id, existing_job_id)
            };

            let (content_id, existing_job_id) = db_step_result;
            discovered += 1;

            if existing_job_id.is_some() {
                duplicates += 1;
                continue;
            }

            // 4. Invariant 7: Connect to existing canonical Pulsaria download pipeline!
            let insert_res = {
                let conn = match self.db.lock() {
                    Ok(c) => c,
                    Err(_) => break,
                };
                let id_res = db::insert_job(&conn, &canonical_url);
                if let Ok(job_id) = id_res {
                    let _ = db::link_content_item_job(&conn, content_id, job_id);
                }
                id_res
            };

            match insert_res {
                Ok(job_id) => {
                    // Dispatch into QueueService worker pool
                    let _ = self
                        .queue
                        .dispatch_with_browser(
                            job_id,
                            canonical_url.clone(),
                            source.browser.clone(),
                        )
                        .await;
                    queued += 1;
                }
                Err(err) => {
                    error!("Failed to enqueue job for {canonical_url}: {err}");
                }
            }

            let _ = self.app_handle.emit(
                "tiktok_source_item_discovered",
                serde_json::json!({
                    "sourceId": source.id,
                    "kind": &channel_kind,
                    "contentId": content_id,
                    "canonicalUrl": canonical_url,
                    "isNew": true,
                }),
            );
        }

        // Persist checkpoint in SQLite
        let total_count = channel.discovered_count + discovered;
        {
            if let Ok(conn) = self.db.lock() {
                let _ = db::update_profile_channel_checkpoint(
                    &conn,
                    source.id,
                    &channel_kind,
                    "idle",
                    total_count,
                    None,
                    newest_id.as_deref(),
                    oldest_id.as_deref(),
                );
            }
        }

        let _ = self.app_handle.emit(
            "tiktok_source_channel_status_changed",
            serde_json::json!({
                "sourceId": source.id,
                "kind": &channel_kind,
                "status": "idle",
                "discoveredCount": total_count,
            }),
        );

        ChannelDiscoverySummary {
            channel_kind,
            status: "idle".to_string(),
            discovered_count: discovered,
            queued_count: queued,
            duplicate_count: duplicates,
            error_code: None,
            error_message: None,
        }
    }
}

/// Extracts platform content ID from canonical URL or explicit ID.
/// Example: `https://www.tiktok.com/@creator/video/7412345678901234567` -> `7412345678901234567`
pub fn extract_content_id_from_url(url: &str, explicit_id: Option<&str>) -> String {
    if let Some(id) = explicit_id.filter(|s| !s.trim().is_empty()) {
        return id.trim().to_string();
    }
    if let Some(pos) = url.find("/video/") {
        let remainder = &url[pos + 7..];
        let end = remainder
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(remainder.len());
        let id_part = &remainder[..end];
        if !id_part.is_empty() {
            return id_part.to_string();
        }
    }
    use std::hash::{DefaultHasher, Hasher};
    let mut hasher = DefaultHasher::new();
    hasher.write(url.as_bytes());
    format!("{:x}", hasher.finish())
}

/// Classifies error strings into standard taxonomy.
fn classify_error_string(error: &str) -> (String, String) {
    let lower = error.to_lowercase();
    if lower.contains("429") || lower.contains("rate limit") || lower.contains("too many requests")
    {
        ("rate_limited".into(), "RATE_LIMITED".into())
    } else if lower.contains("auth")
        || lower.contains("login")
        || lower.contains("cookie")
        || lower.contains("foryou")
    {
        ("requires_auth".into(), "AUTH_REQUIRED".into())
    } else if lower.contains("timeout") || lower.contains("timed out") {
        ("error".into(), "NETWORK_TIMEOUT".into())
    } else if lower.contains("private") {
        ("private".into(), "CONTENT_PRIVATE".into())
    } else {
        ("error".into(), "UNKNOWN".into())
    }
}
