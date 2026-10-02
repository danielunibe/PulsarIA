//! Persistent TikTok activity sources.
//!
//! A source only discovers URLs. Every accepted URL is handed to the
//! existing QueueService and therefore follows the same download, transcript,
//! indexing and library path as a manually pasted link.

use crate::application::queue_service::{QueueService, SourceScanResult};
use crate::db;
use crate::url_utils::{
    canonicalize_tiktok_url, normalize_tiktok_profile_input, tiktok_profile_url,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

const SOURCE_CATEGORIES: [&str; 4] = ["posts", "likes", "saved", "reposts"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceWatchConfig {
    #[serde(default)]
    pub posts: bool,
    #[serde(default)]
    pub likes: bool,
    #[serde(default)]
    pub saved: bool,
    #[serde(default)]
    pub reposts: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSourceSelection {
    #[serde(default)]
    pub posts: bool,
    #[serde(default)]
    pub reposts: bool,
    #[serde(default)]
    pub saved: bool,
    #[serde(default)]
    pub favorites: bool,
}

impl ProfileSourceSelection {
    fn is_active(&self) -> bool {
        self.posts || self.reposts || self.saved || self.favorites
    }

    fn to_watch_config(&self) -> SourceWatchConfig {
        SourceWatchConfig {
            posts: self.posts,
            likes: self.favorites,
            saved: self.saved,
            reposts: self.reposts,
        }
    }
}

impl Default for SourceWatchConfig {
    fn default() -> Self {
        Self {
            posts: false,
            likes: true,
            saved: true,
            reposts: false,
        }
    }
}

impl SourceWatchConfig {
    fn enabled_categories(&self) -> Vec<String> {
        [
            ("posts", self.posts),
            ("likes", self.likes),
            ("saved", self.saved),
            ("reposts", self.reposts),
        ]
        .into_iter()
        .filter_map(|(name, enabled)| enabled.then_some(name.to_string()))
        .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceRules {
    #[serde(rename = "ignoreDuplicates", default = "default_true")]
    pub ignore_duplicates: bool,
    #[serde(rename = "autoEnqueue", default = "default_true")]
    pub auto_enqueue: bool,
}

fn default_true() -> bool {
    true
}

impl Default for SourceRules {
    fn default() -> Self {
        Self {
            ignore_duplicates: true,
            auto_enqueue: true,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SourceSyncSummary {
    pub source_id: i64,
    pub found_count: i64,
    pub queued_count: i64,
    pub duplicate_count: i64,
    pub ignored_count: i64,
    pub error_count: i64,
    pub unavailable_categories: Vec<String>,
    pub partial: bool,
    pub message: String,
    pub categories: HashMap<String, SourceCategorySummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCategorySummary {
    pub available: bool,
    pub enabled: bool,
    pub discovered: i64,
    pub queued: i64,
    pub state: String,
}

impl SourceSyncSummary {
    fn empty(source_id: i64) -> Self {
        Self {
            source_id,
            found_count: 0,
            queued_count: 0,
            duplicate_count: 0,
            ignored_count: 0,
            error_count: 0,
            unavailable_categories: Vec::new(),
            partial: false,
            message: String::new(),
            categories: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectTikTokSourceResult {
    pub source: db::CollectionSourceRecord,
    pub summary: SourceSyncSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegisterProfileSourceResult {
    pub source: db::CollectionSourceRecord,
    pub duplicate: bool,
}

/// Task 01 registration use case. It validates and persists the profile
/// identity only; scanner, downloader and scheduler work remain separate.
pub fn register_profile_source(
    connection: &rusqlite::Connection,
    profile_input: &str,
    selection: &ProfileSourceSelection,
) -> Result<RegisterProfileSourceResult, String> {
    if !selection.is_active() {
        return Err("Selecciona al menos una fuente del perfil".into());
    }
    let identity = normalize_tiktok_profile_input(profile_input)
        .ok_or_else(|| "La entrada no corresponde a un perfil TikTok válido".to_string())?;
    let watch = selection.to_watch_config();
    let watch_json = serde_json::to_string(&watch)
        .map_err(|error| format!("No se pudo serializar la selección: {error}"))?;
    let (source_id, duplicate) = db::register_profile_source(
        connection,
        &identity.canonical_url,
        &identity.handle,
        &watch_json,
        selection.is_active(),
    )
    .map_err(|error| error.to_string())?;
    let source =
        db::get_collection_source(connection, source_id).map_err(|error| error.to_string())?;
    Ok(RegisterProfileSourceResult { source, duplicate })
}

pub fn update_profile_source_settings(
    connection: &rusqlite::Connection,
    source_id: i64,
    selection: &ProfileSourceSelection,
) -> Result<db::CollectionSourceRecord, String> {
    let watch = selection.to_watch_config();
    let watch_json = serde_json::to_string(&watch)
        .map_err(|error| format!("No se pudo serializar la selección: {error}"))?;
    db::update_profile_source_settings(connection, source_id, &watch_json, selection.is_active())
        .map_err(|error| error.to_string())
}

#[derive(Debug, Clone, Serialize)]
struct CapabilitySnapshot {
    available: bool,
    reason: Option<String>,
    #[serde(rename = "authRequired")]
    auth_required: bool,
    checked_at: String,
}

fn parse_watch_config(source: &db::CollectionSourceRecord) -> SourceWatchConfig {
    serde_json::from_str(&source.watch_config_json).unwrap_or_default()
}

fn parse_rules(source: &db::CollectionSourceRecord) -> SourceRules {
    serde_json::from_str(&source.rules_json).unwrap_or_default()
}

fn emit_source_event(app_handle: &tauri::AppHandle, event: &str, payload: impl Serialize + Clone) {
    let _ = app_handle.emit(event, payload);
}

fn capabilities_json(scan: &SourceScanResult) -> Result<String, String> {
    let checked_at = chrono::Utc::now().to_rfc3339();
    let capabilities = SOURCE_CATEGORIES
        .into_iter()
        .map(|category| {
            let value = scan.categories.get(category);
            (
                category.to_string(),
                CapabilitySnapshot {
                    available: value.is_some_and(|entry| entry.available),
                    reason: value.and_then(|entry| entry.reason.clone()),
                    auth_required: value.is_some_and(|entry| entry.auth_required),
                    checked_at: checked_at.clone(),
                },
            )
        })
        .collect::<HashMap<_, _>>();
    serde_json::to_string(&capabilities)
        .map_err(|error| format!("No se pudieron serializar capacidades TikTok: {error}"))
}

fn default_watch_for_scan(scan: &SourceScanResult) -> SourceWatchConfig {
    let available = |category: &str| {
        scan.categories
            .get(category)
            .is_some_and(|value| value.available)
    };
    let likes = available("likes");
    let saved = available("saved");
    SourceWatchConfig {
        posts: !likes && !saved && available("posts"),
        likes,
        saved,
        reposts: false,
    }
}

fn watch_json(config: &SourceWatchConfig) -> Result<String, String> {
    serde_json::to_string(config)
        .map_err(|error| format!("No se pudo serializar la configuración de observación: {error}"))
}

fn profile_url_for_source(source: &db::CollectionSourceRecord) -> String {
    tiktok_profile_url(&source.profile_url)
        .or_else(|| tiktok_profile_url(&source.url))
        .unwrap_or_else(|| source.profile_url.clone())
}

fn unavailable_reason(category: &str, scan: &SourceScanResult) -> String {
    scan.categories
        .get(category)
        .and_then(|entry| entry.reason.clone())
        .unwrap_or_else(|| {
            "TikTok no permite consultar esta categoría para la conexión actual".into()
        })
}

fn source_failure_status(scan: &SourceScanResult) -> &'static str {
    if scan
        .categories
        .values()
        .any(|category| category.auth_required)
    {
        "needs_auth"
    } else {
        "error"
    }
}

fn persist_activity(
    db_connection: &rusqlite::Connection,
    source_id: i64,
    event_type: &str,
    message: &str,
    summary: &SourceSyncSummary,
) {
    let _ = db::insert_collection_source_activity(
        db_connection,
        source_id,
        event_type,
        None,
        message,
        None,
        None,
        None,
        summary.found_count,
        summary.queued_count,
        summary.duplicate_count,
        summary.ignored_count,
        summary.error_count,
    );
}

async fn apply_scan_result(
    db: &Arc<std::sync::Mutex<rusqlite::Connection>>,
    queue: &Arc<QueueService>,
    source: &db::CollectionSourceRecord,
    scan: &SourceScanResult,
    watch: &SourceWatchConfig,
    rules: &SourceRules,
    baseline_only: bool,
    app_handle: &tauri::AppHandle,
) -> Result<SourceSyncSummary, String> {
    let mut summary = SourceSyncSummary::empty(source.id);
    let enabled = watch.enabled_categories();
    let browser = source.browser.clone();

    for category in enabled {
        summary.categories.insert(
            category.clone(),
            SourceCategorySummary {
                available: false,
                enabled: true,
                discovered: 0,
                queued: 0,
                state: "checking".into(),
            },
        );
        let Some(category_scan) = scan.categories.get(&category) else {
            summary.unavailable_categories.push(category.clone());
            summary.error_count += 1;
            if let Some(category_summary) = summary.categories.get_mut(&category) {
                category_summary.state = "unavailable".into();
            }
            continue;
        };
        if !category_scan.available {
            summary.unavailable_categories.push(category.clone());
            summary.error_count += 1;
            if let Some(category_summary) = summary.categories.get_mut(&category) {
                category_summary.available = false;
                category_summary.state = "unavailable".into();
            }
            let message = unavailable_reason(&category, scan);
            if let Ok(connection) = db.lock() {
                let _ = db::insert_collection_source_activity(
                    &connection,
                    source.id,
                    "capability_unavailable",
                    Some(&category),
                    &message,
                    None,
                    None,
                    Some("unavailable"),
                    0,
                    0,
                    0,
                    0,
                    1,
                );
            }
            continue;
        }

        if let Some(category_summary) = summary.categories.get_mut(&category) {
            category_summary.available = true;
            category_summary.state = "active".into();
        }

        for item in &category_scan.items {
            let canonical_url = canonicalize_tiktok_url(&item.url);
            if canonical_url.is_empty() {
                summary.error_count += 1;
                continue;
            }
            summary.found_count += 1;
            if let Some(category_summary) = summary.categories.get_mut(&category) {
                category_summary.discovered += 1;
            }

            let existing_item = {
                let connection = db
                    .lock()
                    .map_err(|_| "Database mutex poisoned".to_string())?;
                db::get_collection_source_item(&connection, source.id, &canonical_url)
                    .map_err(|error| error.to_string())?
            };

            if let Some(existing) = existing_item {
                if existing.state == "baseline" {
                    if let Ok(connection) = db.lock() {
                        db::upsert_collection_source_item(
                            &connection,
                            source.id,
                            &canonical_url,
                            item.id.as_deref(),
                            &category,
                            "baseline",
                            existing.job_id,
                            Some("baseline_new_only"),
                        )
                        .map_err(|error| error.to_string())?;
                    }
                    summary.ignored_count += 1;
                    continue;
                }

                if let Ok(connection) = db.lock() {
                    db::upsert_collection_source_item(
                        &connection,
                        source.id,
                        &canonical_url,
                        item.id.as_deref(),
                        &category,
                        "duplicate",
                        existing.job_id,
                        Some("already_discovered_by_source"),
                    )
                    .map_err(|error| error.to_string())?;
                    let _ = db::insert_collection_source_activity(
                        &connection,
                        source.id,
                        "duplicate",
                        Some(&category),
                        "El elemento ya había sido descubierto por esta fuente",
                        Some(&canonical_url),
                        existing.job_id,
                        Some("duplicate"),
                        1,
                        0,
                        1,
                        0,
                        0,
                    );
                }
                summary.duplicate_count += 1;
                continue;
            }

            let existing_job = {
                let connection = db
                    .lock()
                    .map_err(|_| "Database mutex poisoned".to_string())?;
                db::find_job_id_by_url(&connection, &canonical_url)
                    .map_err(|error| error.to_string())?
            };
            if let Some(job_id) = existing_job {
                let connection = db
                    .lock()
                    .map_err(|_| "Database mutex poisoned".to_string())?;
                db::upsert_collection_source_item(
                    &connection,
                    source.id,
                    &canonical_url,
                    item.id.as_deref(),
                    &category,
                    "duplicate",
                    Some(job_id),
                    Some("already_exists_in_library_or_queue"),
                )
                .map_err(|error| error.to_string())?;
                let _ = db::insert_collection_source_activity(
                    &connection,
                    source.id,
                    "duplicate",
                    Some(&category),
                    "El elemento ya existe en la biblioteca o en la cola",
                    Some(&canonical_url),
                    Some(job_id),
                    Some("duplicate"),
                    1,
                    0,
                    1,
                    0,
                    0,
                );
                summary.duplicate_count += 1;
                continue;
            }

            if baseline_only || !rules.auto_enqueue {
                let state = if baseline_only {
                    "baseline"
                } else {
                    "discovered"
                };
                let reason = if baseline_only {
                    Some("baseline_new_only")
                } else {
                    Some("auto_enqueue_disabled")
                };
                let connection = db
                    .lock()
                    .map_err(|_| "Database mutex poisoned".to_string())?;
                db::upsert_collection_source_item(
                    &connection,
                    source.id,
                    &canonical_url,
                    item.id.as_deref(),
                    &category,
                    state,
                    None,
                    reason,
                )
                .map_err(|error| error.to_string())?;
                if !baseline_only {
                    let _ = db::insert_collection_source_activity(
                        &connection,
                        source.id,
                        "discovered",
                        Some(&category),
                        "Elemento nuevo encontrado; la regla de autoencolado está desactivada",
                        Some(&canonical_url),
                        None,
                        Some("discovered"),
                        1,
                        0,
                        0,
                        1,
                        0,
                    );
                }
                summary.ignored_count += 1;
                continue;
            }

            let job_id = {
                let connection = db
                    .lock()
                    .map_err(|_| "Database mutex poisoned".to_string())?;
                db::insert_job(&connection, &canonical_url).map_err(|error| error.to_string())?
            };
            match queue
                .dispatch_with_browser(job_id, canonical_url.clone(), browser.clone())
                .await
            {
                Ok(()) => {
                    let connection = db
                        .lock()
                        .map_err(|_| "Database mutex poisoned".to_string())?;
                    db::upsert_collection_source_item(
                        &connection,
                        source.id,
                        &canonical_url,
                        item.id.as_deref(),
                        &category,
                        "queued",
                        Some(job_id),
                        None,
                    )
                    .map_err(|error| error.to_string())?;
                    let _ = db::insert_collection_source_activity(
                        &connection,
                        source.id,
                        "queued",
                        Some(&category),
                        "Elemento nuevo enviado a la cola de Pulsaria",
                        Some(&canonical_url),
                        Some(job_id),
                        Some("queued"),
                        1,
                        1,
                        0,
                        0,
                        0,
                    );
                    summary.queued_count += 1;
                    if let Some(category_summary) = summary.categories.get_mut(&category) {
                        category_summary.queued += 1;
                    }
                    emit_source_event(
                        app_handle,
                        "tiktok_source_item_discovered",
                        serde_json::json!({
                            "sourceId": source.id,
                            "category": category,
                            "url": canonical_url,
                            "jobId": job_id,
                            "state": "queued",
                        }),
                    );
                }
                Err(error) => {
                    let connection = db
                        .lock()
                        .map_err(|_| "Database mutex poisoned".to_string())?;
                    db::upsert_collection_source_item(
                        &connection,
                        source.id,
                        &canonical_url,
                        item.id.as_deref(),
                        &category,
                        "failed",
                        Some(job_id),
                        Some(&error),
                    )
                    .map_err(|db_error| db_error.to_string())?;
                    let _ = db::insert_collection_source_activity(
                        &connection,
                        source.id,
                        "failed",
                        Some(&category),
                        &error,
                        Some(&canonical_url),
                        Some(job_id),
                        Some("failed"),
                        1,
                        0,
                        0,
                        0,
                        1,
                    );
                    summary.error_count += 1;
                }
            }
        }
    }

    for category in SOURCE_CATEGORIES {
        summary
            .categories
            .entry(category.to_string())
            .or_insert_with(|| SourceCategorySummary {
                available: false,
                enabled: false,
                discovered: 0,
                queued: 0,
                state: "paused".into(),
            });
    }

    summary.partial = !summary.unavailable_categories.is_empty() || summary.error_count > 0;
    summary.message = if summary.partial {
        format!(
            "{} encontrados, {} enviados, {} duplicados y {} incidencias",
            summary.found_count, summary.queued_count, summary.duplicate_count, summary.error_count
        )
    } else {
        format!(
            "{} encontrados, {} enviados y {} duplicados",
            summary.found_count, summary.queued_count, summary.duplicate_count
        )
    };
    Ok(summary)
}

pub async fn connect_tiktok_source(
    db_connection: Arc<std::sync::Mutex<rusqlite::Connection>>,
    queue: Arc<QueueService>,
    profile_url: &str,
    browser: Option<&str>,
    initial_import_mode: &str,
    history_limit: Option<i64>,
    history_from: Option<&str>,
    app_handle: tauri::AppHandle,
) -> Result<ConnectTikTokSourceResult, String> {
    let profile_url = tiktok_profile_url(profile_url)
        .ok_or_else(|| "La URL no corresponde a un perfil TikTok válido".to_string())?;
    let source_id = {
        let connection = db_connection
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::upsert_tiktok_source(
            &connection,
            &profile_url,
            browser,
            initial_import_mode,
            history_limit,
            history_from,
        )
        .map_err(|error| error.to_string())?
    };

    emit_source_event(
        &app_handle,
        "tiktok_source_sync_started",
        serde_json::json!({ "sourceId": source_id, "profileUrl": profile_url }),
    );

    let scan = queue
        .scan_source_with_browser(
            &profile_url,
            &SOURCE_CATEGORIES
                .iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>(),
            browser,
            history_limit.unwrap_or(200).clamp(1, 1000) as usize,
            history_from,
        )
        .await;

    let scan = match scan {
        Ok(scan) => scan,
        Err(error) => {
            let status = if error.to_ascii_lowercase().contains("cookie")
                || error.to_ascii_lowercase().contains("login")
                || error.to_ascii_lowercase().contains("private")
            {
                "needs_auth"
            } else {
                "error"
            };
            let connection = db_connection
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            db::update_collection_source_scan(
                &connection,
                source_id,
                "{}",
                status,
                None,
                None,
                Some(&serde_json::json!({ "error": error }).to_string()),
            )
            .map_err(|db_error| db_error.to_string())?;
            db::mark_collection_source_failed(&connection, source_id, &error)
                .map_err(|db_error| db_error.to_string())?;
            let mut summary = SourceSyncSummary::empty(source_id);
            summary.error_count = 1;
            summary.partial = true;
            summary.message = error.clone();
            persist_activity(&connection, source_id, "sync_failed", &error, &summary);
            emit_source_event(
                &app_handle,
                "tiktok_source_sync_failed",
                serde_json::json!({ "sourceId": source_id, "message": error }),
            );
            let source = db::get_collection_source(&connection, source_id)
                .map_err(|db_error| db_error.to_string())?;
            return Ok(ConnectTikTokSourceResult { source, summary });
        }
    };

    let capabilities = capabilities_json(&scan)?;
    let watch = default_watch_for_scan(&scan);
    let watch_serialized = watch_json(&watch)?;
    let available_count = scan
        .categories
        .values()
        .filter(|category| category.available)
        .count();
    let status = if available_count > 0 {
        "active"
    } else {
        source_failure_status(&scan)
    };
    {
        let connection = db_connection
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::update_collection_source_config(
            &connection,
            source_id,
            &watch_serialized,
            initial_import_mode,
            history_limit,
            history_from,
            r#"{\"ignoreDuplicates\":true,\"autoEnqueue\":true}"#,
        )
        .map_err(|error| error.to_string())?;
        db::update_collection_source_scan(
            &connection,
            source_id,
            &capabilities,
            status,
            scan.profile.display_name.as_deref(),
            scan.profile.avatar_url.as_deref(),
            None,
        )
        .map_err(|error| error.to_string())?;
    }

    let source = {
        let connection = db_connection
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::get_collection_source(&connection, source_id).map_err(|error| error.to_string())?
    };
    let rules = parse_rules(&source);
    let baseline_only = initial_import_mode != "history";
    let summary = apply_scan_result(
        &db_connection,
        &queue,
        &source,
        &scan,
        &watch,
        &rules,
        baseline_only,
        &app_handle,
    )
    .await?;
    let summary_json = serde_json::to_string(&summary)
        .map_err(|error| format!("No se pudo serializar el resumen de fuente: {error}"))?;
    {
        let connection = db_connection
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::mark_collection_source_synced(&connection, source_id, summary.found_count as usize)
            .map_err(|error| error.to_string())?;
        db::set_collection_source_summary(&connection, source_id, &summary_json)
            .map_err(|error| error.to_string())?;
        persist_activity(
            &connection,
            source_id,
            "connected",
            &summary.message,
            &summary,
        );
    }
    let source = {
        let connection = db_connection
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::get_collection_source(&connection, source_id).map_err(|error| error.to_string())?
    };
    emit_source_event(&app_handle, "tiktok_source_sync_completed", &summary);
    Ok(ConnectTikTokSourceResult { source, summary })
}

pub async fn sync_collection_source_by_id(
    db_connection: Arc<std::sync::Mutex<rusqlite::Connection>>,
    queue: Arc<QueueService>,
    source_id: i64,
    app_handle: tauri::AppHandle,
) -> Result<SourceSyncSummary, String> {
    let source = {
        let connection = db_connection
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::get_collection_source(&connection, source_id).map_err(|error| error.to_string())?
    };
    if !source.active {
        let mut summary = SourceSyncSummary::empty(source_id);
        summary.message = "La fuente está pausada".into();
        return Ok(summary);
    }

    {
        let connection = db_connection
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::mark_collection_source_attempt(&connection, source_id)
            .map_err(|error| error.to_string())?;
    }
    emit_source_event(
        &app_handle,
        "tiktok_source_sync_started",
        serde_json::json!({ "sourceId": source_id, "profileUrl": source.profile_url }),
    );

    let watch = parse_watch_config(&source);
    let rules = parse_rules(&source);
    let categories = watch.enabled_categories();
    if categories.is_empty() {
        let mut summary = SourceSyncSummary::empty(source_id);
        summary.message = "No hay actividad habilitada para observar".into();
        let connection = db_connection
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        db::mark_collection_source_synced(&connection, source_id, 0)
            .map_err(|error| error.to_string())?;
        db::set_collection_source_summary(
            &connection,
            source_id,
            &serde_json::to_string(&summary).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        persist_activity(
            &connection,
            source_id,
            "sync_skipped",
            &summary.message,
            &summary,
        );
        return Ok(summary);
    }

    let scan = queue
        .scan_source_with_browser(
            &profile_url_for_source(&source),
            &categories,
            source.browser.as_deref(),
            200,
            None,
        )
        .await;
    let scan = match scan {
        Ok(scan) => scan,
        Err(error) => {
            let connection = db_connection
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            db::mark_collection_source_failed(&connection, source_id, &error)
                .map_err(|db_error| db_error.to_string())?;
            let mut summary = SourceSyncSummary::empty(source_id);
            summary.error_count = 1;
            summary.partial = true;
            summary.message = error.clone();
            persist_activity(&connection, source_id, "sync_failed", &error, &summary);
            emit_source_event(
                &app_handle,
                "tiktok_source_sync_failed",
                serde_json::json!({ "sourceId": source_id, "message": error }),
            );
            return Err(error);
        }
    };

    let capabilities = capabilities_json(&scan)?;
    {
        let connection = db_connection
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        let has_available = scan.categories.values().any(|category| category.available);
        db::update_collection_source_scan(
            &connection,
            source_id,
            &capabilities,
            if has_available {
                "active"
            } else {
                source_failure_status(&scan)
            },
            scan.profile.display_name.as_deref(),
            scan.profile.avatar_url.as_deref(),
            None,
        )
        .map_err(|error| error.to_string())?;
    }

    let summary = apply_scan_result(
        &db_connection,
        &queue,
        &source,
        &scan,
        &watch,
        &rules,
        false,
        &app_handle,
    )
    .await?;
    let summary_json = serde_json::to_string(&summary)
        .map_err(|error| format!("No se pudo serializar el resumen de fuente: {error}"))?;
    let connection = db_connection
        .lock()
        .map_err(|_| "Database mutex poisoned".to_string())?;
    if summary.unavailable_categories.len() < categories.len() {
        db::mark_collection_source_synced(&connection, source_id, summary.found_count as usize)
            .map_err(|error| error.to_string())?;
    } else {
        db::mark_collection_source_failed(
            &connection,
            source_id,
            "Ninguna categoría habilitada pudo consultarse",
        )
        .map_err(|error| error.to_string())?;
    }
    db::set_collection_source_summary(&connection, source_id, &summary_json)
        .map_err(|error| error.to_string())?;
    persist_activity(
        &connection,
        source_id,
        "sync_completed",
        &summary.message,
        &summary,
    );
    emit_source_event(&app_handle, "tiktok_source_sync_completed", &summary);
    Ok(summary)
}

/// Sincroniza todas las fuentes activas cuyo timer haya vencido.
pub async fn sync_due_collections(
    db_connection: Arc<std::sync::Mutex<rusqlite::Connection>>,
    queue: Arc<QueueService>,
    app_handle: tauri::AppHandle,
) {
    let sources = match db_connection.lock() {
        Ok(connection) => match db::get_collection_sources_to_sync(&connection) {
            Ok(sources) => sources,
            Err(error) => {
                crate::commands::emit_log(
                    &app_handle,
                    format!("Collection sync lookup failed: {error}"),
                );
                return;
            }
        },
        Err(_) => {
            crate::commands::emit_log(
                &app_handle,
                "Collection sync could not lock the database".into(),
            );
            return;
        }
    };

    for source in sources {
        if sync_collection_source_by_id(
            db_connection.clone(),
            queue.clone(),
            source.id,
            app_handle.clone(),
        )
        .await
        .is_err()
        {
            crate::commands::emit_log(
                &app_handle,
                format!(
                    "Collection sync failed for source #{}; check its sync status.",
                    source.id
                ),
            );
        }
    }
}

/// Loop local de 15 minutos. No crea un segundo scheduler de ingestión.
pub async fn start_collection_sync_loop(
    db_connection: Arc<std::sync::Mutex<rusqlite::Connection>>,
    queue: Arc<QueueService>,
    app_handle: tauri::AppHandle,
    sync_paused: Arc<AtomicBool>,
) {
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(15 * 60)).await;
        if sync_paused.load(Ordering::SeqCst) {
            continue;
        }
        if queue.is_background_admission_paused() {
            crate::commands::emit_log(
                &app_handle,
                "Sincronización automática pospuesta por la política de rendimiento.".into(),
            );
            continue;
        }
        sync_due_collections(db_connection.clone(), queue.clone(), app_handle.clone()).await;
    }
}
