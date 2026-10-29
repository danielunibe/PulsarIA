//! Profile Sources Discovery Engine for Pulsaria.
//!
//! Handles:
//! 1. TikTok profile metadata resolution (display name, avatar, followers, following, likes, posts count)
//! 2. Multi-channel inventory discovery (posts, reposts, saved, favorites)
//! 3. Content identity normalization & deduplication before downloads
//! 4. Bounded, newest-first inventory queries
//! 5. Direct integration with Pulsaria's existing QueueService & Home processing cards
//! 6. Capability state classification & persistent checkpoints

use crate::application::collection_service::{
    SourceCategorySummary, SourceRules, SourceSyncSummary,
};
use crate::application::queue_service::{QueueService, SourceScanItem};
use crate::db::{self, ProfileChannelRecord};
use crate::runtime;
use crate::url_utils::canonicalize_tiktok_url;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tokio::process::Command;
use tokio::sync::Semaphore;
use tracing::{info, warn};

/// Global concurrency limiter for discovery processes to prevent resource exhaustion.
/// Limits parallel profile enumeration scans to 2 simultaneous processes.
static GLOBAL_DISCOVERY_SEMAPHORE: std::sync::OnceLock<Arc<Semaphore>> = std::sync::OnceLock::new();

fn discovery_limiter() -> Arc<Semaphore> {
    GLOBAL_DISCOVERY_SEMAPHORE
        .get_or_init(|| Arc::new(Semaphore::new(2)))
        .clone()
}

static DISCOVERING_SOURCES: std::sync::OnceLock<Mutex<HashSet<i64>>> = std::sync::OnceLock::new();

struct DiscoveryGuard(i64);

impl DiscoveryGuard {
    fn acquire(source_id: i64) -> Result<Self, String> {
        let mut sources = DISCOVERING_SOURCES
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
            .map_err(|_| "Discovery mutex poisoned".to_string())?;
        if !sources.insert(source_id) {
            return Err("Este perfil ya tiene una consulta en curso".into());
        }
        Ok(Self(source_id))
    }
}

impl Drop for DiscoveryGuard {
    fn drop(&mut self) {
        if let Ok(mut sources) = DISCOVERING_SOURCES
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
        {
            sources.remove(&self.0);
        }
    }
}

fn source_item_timestamp(item: &SourceScanItem) -> Option<f64> {
    item.timestamp
        .filter(|timestamp| timestamp.is_finite() && *timestamp > 0.0)
        .or_else(|| {
            item.upload_date
                .as_deref()
                .and_then(|value| chrono::NaiveDate::parse_from_str(value, "%Y%m%d").ok())
                .and_then(|date| date.and_hms_opt(0, 0, 0))
                .map(|date| date.and_utc().timestamp() as f64)
        })
}

/// Sort only when every row has a timestamp. A partial comparator that treats
/// dated and undated rows as equal is non-transitive; when dates are missing,
/// retain the stable order returned by the provider.
fn order_discovery_items(items: &mut [SourceScanItem]) -> bool {
    let order_is_proven = items
        .iter()
        .all(|item| source_item_timestamp(item).is_some());
    if !order_is_proven {
        // Preserve provider order for processing, but do not treat it as proof
        // of newest/oldest checkpoint edges when one or more dates are absent.
        return false;
    }

    items.sort_by(|left, right| {
        let left_time = source_item_timestamp(left).unwrap_or_default();
        let right_time = source_item_timestamp(right).unwrap_or_default();
        right_time
            .partial_cmp(&left_time)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    true
}

fn discovery_checkpoint_candidates(
    persisted_ids: &[String],
    oldest_scan_is_complete: bool,
    order_is_proven: bool,
    processing_succeeded: bool,
) -> (Option<String>, Option<String>) {
    if !processing_succeeded || !order_is_proven || persisted_ids.is_empty() {
        return (None, None);
    }

    let newest = persisted_ids.first().cloned();
    let oldest = oldest_scan_is_complete
        .then(|| persisted_ids.last().cloned())
        .flatten();
    (newest, oldest)
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

impl ProfileDiscoveryReport {
    pub fn to_sync_summary(&self) -> SourceSyncSummary {
        let unavailable: Vec<_> = self
            .channels
            .iter()
            .filter(|channel| channel.status != "idle")
            .map(|channel| channel.channel_kind.clone())
            .collect();
        let errors = unavailable.len() as i64;
        SourceSyncSummary {
            source_id: self.profile_source_id,
            found_count: self.total_discovered,
            queued_count: self.total_queued,
            duplicate_count: self.total_duplicates,
            ignored_count: (self.total_discovered - self.total_queued - self.total_duplicates)
                .max(0),
            error_count: errors,
            partial: errors > 0,
            unavailable_categories: unavailable,
            message: if errors == 0 {
                format!(
                    "Consulta completada: {} videos encontrados, {} pendientes de procesamiento gradual en Inicio.",
                    self.total_discovered, self.total_queued
                )
            } else {
                format!("Consulta con incidencias: {errors} fuentes requieren atención. {} videos enviados a la cola.", self.total_queued)
            },
            categories: self
                .channels
                .iter()
                .map(|channel| {
                    (
                        channel.channel_kind.clone(),
                        SourceCategorySummary {
                            available: channel.status == "idle",
                            enabled: true,
                            discovered: channel.discovered_count,
                            queued: channel.queued_count,
                            state: channel.status.clone(),
                        },
                    )
                })
                .collect::<HashMap<_, _>>(),
        }
    }

    fn source_status(&self) -> &'static str {
        if self.channels.iter().all(|channel| channel.status == "idle") {
            "active"
        } else if self.channels.iter().any(|channel| channel.status == "idle") {
            "partial"
        } else if self
            .channels
            .iter()
            .any(|channel| channel.status == "requires_auth")
        {
            "needs_auth"
        } else {
            "error"
        }
    }
}

pub struct ProfileDiscoveryService {
    db: Arc<Mutex<rusqlite::Connection>>,
    queue: Arc<QueueService>,
    app_handle: tauri::AppHandle,
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
        }
    }

    /// Resolves profile metadata using curl_cffi Chrome impersonation in the Python worker.
    /// Invariant 9: Unknown values remain null, confirmed zero is 0.
    pub async fn resolve_profile_metadata(
        &self,
        profile_url: &str,
    ) -> Result<ProfileMetadataSnapshot, String> {
        self.queue.ensure_processing_authorized()?;
        let cookie_browser = self.queue.current_cookie_browser();
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
            .env("PYTHONUNBUFFERED", "1")
            .env_remove("PULSAR_COOKIES_FROM_BROWSER");
        if let Some(browser) = cookie_browser.as_deref() {
            cmd.env("PULSAR_COOKIES_FROM_BROWSER", browser);
        }

        crate::process_control::hide_tokio_command(&mut cmd);

        let output = self
            .queue
            .run_cookie_scoped_command(
                cmd,
                Duration::from_secs(30),
                "Timed out resolving profile metadata",
                cookie_browser,
            )
            .await
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
        self.queue.ensure_processing_authorized()?;
        let (profile_url, _username) = {
            let conn = self
                .db
                .lock()
                .map_err(|_| "Database lock poisoned".to_string())?;
            let source = db::get_collection_source(&conn, source_id)
                .map_err(|err| format!("Source not found: {err}"))?;
            (source.profile_url, source.username)
        };

        info!("Resolving metadata for profile source {source_id}");
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
        if !self.queue.is_processing_authorized() {
            return Err(
                "La consulta de perfiles requiere aceptar las condiciones de derechos vigentes."
                    .into(),
            );
        }
        let _source_guard = DiscoveryGuard::acquire(source_id)?;
        let result = self.run_discovery(source_id, is_manual_sync).await;
        if let Err(error) = &result {
            if let Ok(connection) = self.db.lock() {
                let _ = db::mark_collection_source_failed(&connection, source_id, error);
            }
            let _ = self.app_handle.emit(
                "tiktok_source_sync_completed",
                serde_json::json!({
                    "sourceId": source_id, "error": error,
                }),
            );
        }
        result
    }

    async fn run_discovery(
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

        let mut source = {
            let conn = self
                .db
                .lock()
                .map_err(|_| "Database lock poisoned".to_string())?;
            db::get_collection_source(&conn, source_id)
                .map_err(|err| format!("Source {source_id} not found: {err}"))?
        };

        // Settings owns the current authorization choice, including revocation.
        // A browser captured at registration must not keep reading cookies after
        // the user has switched back to public sources in Settings.
        source.browser = std::env::var("PULSAR_COOKIES_FROM_BROWSER")
            .ok()
            .filter(|browser| matches!(browser.as_str(), "chrome" | "edge" | "firefox"));

        if !source.active && !is_manual_sync {
            info!("Source {source_id} is paused; skipping discovery");
            return Ok(ProfileDiscoveryReport {
                profile_source_id: source_id,
                metadata_resolved: false,
                channels: Vec::new(),
                total_discovered: 0,
                total_queued: 0,
                total_duplicates: 0,
            });
        }

        {
            let connection = self
                .db
                .lock()
                .map_err(|_| "Database lock poisoned".to_string())?;
            db::mark_collection_source_attempt(&connection, source_id)
                .map_err(|error| error.to_string())?;
            db::update_collection_source_scan(
                &connection,
                source_id,
                &source.capabilities_json,
                "checking",
                None,
                None,
                None,
            )
            .map_err(|error| error.to_string())?;
        }
        let _ = self.app_handle.emit(
            "tiktok_source_sync_started",
            serde_json::json!({
                "sourceId": source_id, "isManual": is_manual_sync,
            }),
        );
        let metadata_resolved = self.refresh_profile_metadata(source_id).await.is_ok();

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
        if !channels.iter().any(|channel| channel.enabled) {
            return Err(
                "Activa al menos una fuente en la configuración del perfil antes de consultar"
                    .into(),
            );
        }

        let mut report = ProfileDiscoveryReport {
            profile_source_id: source_id,
            metadata_resolved,
            channels: Vec::new(),
            total_discovered: 0,
            total_queued: 0,
            total_duplicates: 0,
        };

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
            let summary = report.to_sync_summary();
            let summary_json =
                serde_json::to_string(&summary).map_err(|error| error.to_string())?;
            db::finish_profile_discovery(
                &conn,
                source_id,
                report.source_status(),
                &summary_json,
                summary.partial.then_some(summary.message.as_str()),
            )
            .map_err(|error| error.to_string())?;
        }

        let _ = self.app_handle.emit(
            "tiktok_source_sync_completed",
            serde_json::json!({
                "sourceId": source_id,
                "report": &report,
            }),
        );

        self.queue.start_profile_job_feeder();
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
                if source.history_limit.unwrap_or(0) == 0 {
                    0
                } else {
                    source.history_limit.unwrap_or(20).clamp(1, 100) as usize
                },
                source.history_from.as_deref(),
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
            let reason = category_data
                .reason
                .clone()
                .unwrap_or_else(|| "Categoría no disponible".into());
            let (status, code) = if category_data.auth_required {
                ("requires_auth".to_string(), "AUTH_REQUIRED".to_string())
            } else if category_data.status.as_deref() == Some("rate_limited") {
                ("rate_limited".into(), "RATE_LIMITED".into())
            } else if category_data.status.as_deref() == Some("unsupported") {
                ("unsupported".into(), "PROVIDER_UNSUPPORTED".into())
            } else if category_data.status.as_deref() == Some("unknown") {
                ("unknown".into(), "VISIBILITY_UNCONFIRMED".into())
            } else {
                classify_error_string(&reason)
            };

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

        // Process in a deterministic order. Checkpoint edges are advanced only
        // when every entry has a usable date and newest-first ordering is proven.
        let mut items = category_data.items.clone();
        let item_order_is_proven = order_discovery_items(&mut items);

        let mut discovered = 0i64;
        let mut queued = 0i64;
        let mut duplicates = 0i64;
        let mut persisted_ids = Vec::new();
        let mut seen_urls = HashSet::new();
        let mut processing_error = None;
        let mut scan_interrupted = false;

        for item in &items {
            let canonical_url = canonicalize_tiktok_url(&item.url);
            if !crate::api::middleware::security::is_valid_sandbox_url(&canonical_url)
                || !seen_urls.insert(canonical_url.clone())
            {
                continue;
            }

            // Extract stable platform content ID
            let platform_content_id =
                extract_content_id_from_url(&canonical_url, item.id.as_deref());

            let persisted = self
                .db
                .lock()
                .map_err(|_| "Database lock poisoned".to_string())
                .and_then(|connection| {
                    persist_discovered_item(
                        &connection,
                        source.id,
                        &channel_kind,
                        item,
                        sync_run_id,
                    )
                    .map_err(|error| error.to_string())
                });
            let item_result = match persisted {
                Ok(result) => result,
                Err(error) => {
                    processing_error = Some(error);
                    continue;
                }
            };
            if !item_result.admitted {
                scan_interrupted = true;
                break;
            }
            discovered += 1;
            persisted_ids.push(platform_content_id);
            if item_result.duplicate {
                duplicates += 1;
            }
            if item_result.dispatch_job_id.is_some() {
                queued += 1;
            }

            let _ = self.app_handle.emit(
                "tiktok_source_item_discovered",
                serde_json::json!({
                    "sourceId": source.id,
                    "kind": &channel_kind,
                    "contentId": item_result.content_id,
                    "canonicalUrl": canonical_url,
                    "isNew": item_result.new_relationship,
                }),
            );
        }

        if scan_interrupted {
            let message = "El canal cambió durante la consulta; vuelve a sincronizar para completar el inventario.";
            let (current_enabled, total_count) = if let Ok(connection) = self.db.lock() {
                let current_enabled = db::get_profile_channels(&connection, source.id)
                    .ok()
                    .and_then(|channels| {
                        channels
                            .into_iter()
                            .find(|entry| entry.kind == channel_kind)
                            .map(|entry| entry.enabled)
                    })
                    .unwrap_or(false);
                let status = if current_enabled { "pending" } else { "paused" };
                let count = db::count_profile_content(&connection, source.id, &channel_kind)
                    .unwrap_or(channel.discovered_count);
                let _ = db::update_profile_channel_checkpoint(
                    &connection,
                    source.id,
                    &channel_kind,
                    status,
                    count,
                    None,
                    None,
                    None,
                );
                let _ = db::update_profile_channel_status(
                    &connection,
                    source.id,
                    &channel_kind,
                    status,
                    current_enabled.then_some("SCAN_INTERRUPTED"),
                    current_enabled.then_some(message),
                );
                (current_enabled, count)
            } else {
                (false, channel.discovered_count)
            };
            let status = if current_enabled { "pending" } else { "paused" };

            let _ = self.app_handle.emit(
                "tiktok_source_channel_status_changed",
                serde_json::json!({
                    "sourceId": source.id,
                    "kind": &channel_kind,
                    "status": status,
                    "discoveredCount": total_count,
                    "errorMessage": current_enabled.then_some(message),
                }),
            );
            return ChannelDiscoverySummary {
                channel_kind,
                status: status.to_string(),
                discovered_count: discovered,
                queued_count: queued,
                duplicate_count: duplicates,
                error_code: current_enabled.then_some("SCAN_INTERRUPTED".into()),
                error_message: current_enabled.then_some(message.into()),
            };
        }

        // Advance only what this scan can prove. Bounded/date-filtered scans
        // can safely refresh the newest edge but cannot replace the oldest.
        let oldest_scan_is_complete = !category_data.truncated && source.history_from.is_none();
        let (newest_id, oldest_id) = discovery_checkpoint_candidates(
            &persisted_ids,
            oldest_scan_is_complete,
            item_order_is_proven,
            processing_error.is_none(),
        );
        let checkpoint_status = if processing_error.is_some() {
            "error"
        } else {
            "idle"
        };

        // Persist checkpoint in SQLite
        let mut total_count = channel.discovered_count;
        {
            if let Ok(conn) = self.db.lock() {
                match db::count_profile_content(&conn, source.id, &channel_kind).and_then(|count| {
                    total_count = count;
                    db::update_profile_channel_checkpoint(
                        &conn,
                        source.id,
                        &channel_kind,
                        checkpoint_status,
                        total_count,
                        None,
                        newest_id.as_deref(),
                        oldest_id.as_deref(),
                    )
                }) {
                    Ok(()) => {}
                    Err(error) => processing_error = Some(error.to_string()),
                }
                if let Some(error) = &processing_error {
                    let _ = db::update_profile_channel_status(
                        &conn,
                        source.id,
                        &channel_kind,
                        "error",
                        Some("PROCESSING_ERROR"),
                        Some(error),
                    );
                }
            } else {
                processing_error = Some("Database lock poisoned".into());
            }
        }
        let final_status = if processing_error.is_some() {
            "error"
        } else {
            "idle"
        };

        let _ = self.app_handle.emit(
            "tiktok_source_channel_status_changed",
            serde_json::json!({
                "sourceId": source.id,
                "kind": &channel_kind,
                "status": final_status,
                "discoveredCount": total_count,
            }),
        );

        ChannelDiscoverySummary {
            channel_kind,
            status: final_status.to_string(),
            discovered_count: discovered,
            queued_count: queued,
            duplicate_count: duplicates,
            error_code: processing_error.as_ref().map(|_| "PROCESSING_ERROR".into()),
            error_message: processing_error,
        }
    }
}

pub(crate) struct PersistedDiscoveryItem {
    admitted: bool,
    content_id: i64,
    new_relationship: bool,
    duplicate: bool,
    dispatch_job_id: Option<i64>,
}

/// Admission rereads the channel toggle and download rule for each item so a
/// setting change during a scan cannot admit new work from a disabled channel.
pub(crate) fn persist_discovered_item(
    connection: &rusqlite::Connection,
    source_id: i64,
    kind: &str,
    item: &SourceScanItem,
    sync_run_id: &str,
) -> rusqlite::Result<PersistedDiscoveryItem> {
    let transaction = connection.unchecked_transaction()?;
    let source = db::get_collection_source(&transaction, source_id)?;
    if !watch_config_enables_channel(&source.watch_config_json, kind) {
        return Ok(PersistedDiscoveryItem {
            admitted: false,
            content_id: 0,
            new_relationship: false,
            duplicate: false,
            dispatch_job_id: None,
        });
    }
    let canonical_url = canonicalize_tiktok_url(&item.url);
    let platform_id = extract_content_id_from_url(&canonical_url, item.id.as_deref());
    let (content_id, _) = db::upsert_content_item(
        &transaction,
        "tiktok",
        &platform_id,
        &canonical_url,
        None,
        source.username.as_deref(),
        item.title.as_deref(),
        item.upload_date.as_deref(),
        None,
    )?;
    let (_, new_relationship) = db::upsert_content_relationship(&transaction, content_id, source_id, kind,
        Some(&serde_json::json!({"profileSourceId": source_id, "channelKind": kind, "url": canonical_url}).to_string()), Some(sync_run_id))?;
    let existing_job = db::find_job_id_by_url(&transaction, &canonical_url)?;
    let rules = serde_json::from_str::<SourceRules>(&source.rules_json).unwrap_or_default();
    let dispatch_job_id = if source.active && rules.auto_enqueue && existing_job.is_none() {
        Some(db::insert_job(&transaction, &canonical_url)?)
    } else {
        None
    };
    if let Some(job_id) = existing_job.or(dispatch_job_id) {
        db::link_content_item_job(&transaction, content_id, job_id)?;
    }
    transaction.commit()?;
    Ok(PersistedDiscoveryItem {
        admitted: true,
        content_id,
        new_relationship,
        duplicate: existing_job.is_some(),
        dispatch_job_id,
    })
}

fn watch_config_enables_channel(watch_config_json: &str, kind: &str) -> bool {
    let watch = serde_json::from_str::<serde_json::Value>(watch_config_json)
        .unwrap_or(serde_json::Value::Null);
    let key = if kind == "favorites" { "likes" } else { kind };
    watch
        .get(key)
        .and_then(serde_json::Value::as_bool)
        .or_else(|| {
            (kind == "favorites")
                .then(|| watch.get("favorites").and_then(serde_json::Value::as_bool))
                .flatten()
        })
        .unwrap_or(false)
}

/// Extracts platform content ID from canonical URL or explicit ID.
/// Example: `https://www.tiktok.com/@creator/video/7412345678901234567` -> `7412345678901234567`
pub fn extract_content_id_from_url(url: &str, explicit_id: Option<&str>) -> String {
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
    if let Some(id) = explicit_id.filter(|s| !s.trim().is_empty()) {
        return id.trim().to_string();
    }
    use std::hash::{DefaultHasher, Hasher};
    let mut hasher = DefaultHasher::new();
    hasher.write(url.as_bytes());
    format!("{:x}", hasher.finish())
}

/// Classifies error strings into standard taxonomy.
fn classify_error_string(error: &str) -> (String, String) {
    let lower = error.to_lowercase();
    if lower.contains("unsupported")
        || lower.contains("not supported")
        || lower.contains("no disponible")
    {
        ("unsupported".into(), "PROVIDER_UNSUPPORTED".into())
    } else if lower.contains("429")
        || lower.contains("rate limit")
        || lower.contains("too many requests")
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

#[cfg(test)]
mod tests {
    use super::*;

    fn scan_item(id: &str, timestamp: Option<f64>, upload_date: Option<&str>) -> SourceScanItem {
        SourceScanItem {
            url: format!("https://www.tiktok.com/@creator/video/{id}"),
            id: Some(id.to_string()),
            upload_date: upload_date.map(str::to_string),
            timestamp,
            title: None,
        }
    }

    #[test]
    fn mixed_or_missing_dates_preserve_provider_order_without_comparator_reordering() {
        let mut items = vec![
            scan_item("newest", Some(300.0), None),
            scan_item("undated", None, None),
            scan_item("older", Some(100.0), None),
        ];

        assert!(!order_discovery_items(&mut items));

        assert_eq!(items[0].id.as_deref(), Some("newest"));
        assert_eq!(items[1].id.as_deref(), Some("undated"));
        assert_eq!(items[2].id.as_deref(), Some("older"));
    }

    #[test]
    fn complete_dates_are_sorted_newest_first_with_stable_ties() {
        let mut items = vec![
            scan_item("older", Some(100.0), None),
            scan_item("newest-a", Some(300.0), None),
            scan_item("newest-b", Some(300.0), None),
        ];

        assert!(order_discovery_items(&mut items));

        assert_eq!(items[0].id.as_deref(), Some("newest-a"));
        assert_eq!(items[1].id.as_deref(), Some("newest-b"));
        assert_eq!(items[2].id.as_deref(), Some("older"));
    }

    #[test]
    fn bounded_or_failed_scans_preserve_the_oldest_checkpoint() {
        let persisted_ids = ["new-120".to_string(), "new-110".to_string()];

        let (newest, oldest) = discovery_checkpoint_candidates(&persisted_ids, false, true, true);
        assert_eq!(newest.as_deref(), Some("new-120"));
        assert_eq!(oldest, None);

        let (newest, oldest) = discovery_checkpoint_candidates(&persisted_ids, true, true, false);
        assert_eq!(newest, None);
        assert_eq!(oldest, None);

        let (newest, oldest) = discovery_checkpoint_candidates(&persisted_ids, true, true, true);
        assert_eq!(newest.as_deref(), Some("new-120"));
        assert_eq!(oldest.as_deref(), Some("new-110"));

        let (newest, oldest) = discovery_checkpoint_candidates(&persisted_ids, true, false, true);
        assert_eq!(newest, None, "missing dates must not claim a newest edge");
        assert_eq!(oldest, None, "missing dates must not claim an oldest edge");
    }

    #[test]
    fn canonical_tiktok_video_id_takes_precedence_over_provider_alias() {
        assert_eq!(
            extract_content_id_from_url(
                "https://www.tiktok.com/@creator/video/7412345678901234567?share=1",
                Some("provider-alias"),
            ),
            "7412345678901234567"
        );
        assert_eq!(
            extract_content_id_from_url("https://www.tiktok.com/@creator/liked", Some("stable-id")),
            "stable-id"
        );
    }

    #[test]
    fn partial_queries_report_auth_and_rate_limits_without_claiming_success() {
        let report = ProfileDiscoveryReport {
            profile_source_id: 1,
            metadata_resolved: false,
            total_discovered: 3,
            total_queued: 0,
            total_duplicates: 0,
            channels: ["idle", "requires_auth", "rate_limited"]
                .into_iter()
                .enumerate()
                .map(|(index, status)| ChannelDiscoverySummary {
                    channel_kind: ["posts", "favorites", "saved"][index].into(),
                    status: status.into(),
                    discovered_count: if index == 0 { 3 } else { 0 },
                    queued_count: 0,
                    duplicate_count: 0,
                    error_code: None,
                    error_message: None,
                })
                .collect(),
        };
        let summary = report.to_sync_summary();
        assert!(summary.partial);
        assert_eq!(summary.error_count, 2);
        assert_eq!(summary.ignored_count, 3);
        assert_eq!(report.source_status(), "partial");
        assert!(!summary.categories["favorites"].available);
        assert_eq!(summary.categories["favorites"].state, "requires_auth");
        assert_eq!(
            classify_error_string("HTTP 429 too many requests").0,
            "rate_limited"
        );
        assert_eq!(
            classify_error_string("Timed out retrieving source").0,
            "error"
        );
    }

    #[test]
    fn simultaneous_discovery_of_the_same_profile_is_rejected_and_released() {
        let guard = DiscoveryGuard::acquire(-999).unwrap();
        assert!(DiscoveryGuard::acquire(-999).is_err());
        drop(guard);
        assert!(DiscoveryGuard::acquire(-999).is_ok());
    }
}
