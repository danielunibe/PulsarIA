use crate::application::queue_service::QueueService;
use crate::application::search_service::SearchService;
use crate::domain::ports::JobRepository;
use axum::{
    extract::{Json, Path, State},
    http::{HeaderName, HeaderValue, Method, StatusCode},
    middleware::{self},
    routing::{delete, get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tracing::{info, warn};

/// The desktop gateway is intentionally restricted to the local machine.
/// Keep this as a single contract so a future host configurability change
/// cannot silently turn the desktop API into a network service.
pub const API_BIND_HOST: &str = "127.0.0.1";

pub fn validate_api_bind_host(host: &str) -> Result<(), &'static str> {
    if host == API_BIND_HOST {
        Ok(())
    } else {
        Err("Pulsaria API solo puede enlazarse a 127.0.0.1 durante la fase desktop")
    }
}

#[derive(Clone)]
pub struct ApiState {
    pub queue_service: Arc<QueueService>,
    pub search_service: Arc<SearchService>,
    pub job_repo: Arc<dyn JobRepository>,
    pub security: Arc<crate::api::middleware::security::SecurityConfig>,
    pub runtime: crate::api::ApiRuntimeState,
}

#[derive(Deserialize)]
pub struct IngestRequest {
    pub url: String,
}

#[derive(Serialize)]
pub struct IngestResponse {
    pub job_id: i64,
    pub status: String,
}

#[derive(Deserialize)]
pub struct SearchRequest {
    pub query: String,
    pub limit: Option<usize>,
}

#[derive(Serialize)]
pub struct SearchResponse {
    pub results: Vec<crate::domain::models::SearchResult>,
}

#[derive(Deserialize)]
pub struct CreatePlaylistRequest {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Serialize)]
pub struct CreatePlaylistResponse {
    pub id: i64,
}

#[derive(Deserialize)]
pub struct PlaylistItemRequest {
    pub job_id: i64,
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

#[derive(Serialize)]
struct TranscriptSegmentResponse {
    chunk_index: i64,
    chunk_text: String,
    start: f64,
    end: f64,
}

// Use shared URL utilities instead of duplicated local copy
use crate::url_utils::is_collection_source;

fn register_collection_source_for_api(
    repo: &Arc<dyn JobRepository>,
    url: &str,
) -> Result<i64, (StatusCode, String)> {
    let connection = repo
        .get_connection()
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let connection = connection.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database mutex poisoned".to_string(),
        )
    })?;
    crate::db::register_collection_source(&connection, url)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    crate::db::find_collection_source_id_by_url(&connection, url)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
        .ok_or_else(|| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Collection source was registered but no identifier was returned".to_string(),
            )
        })
}

fn persist_collection_failure_for_api(repo: &Arc<dyn JobRepository>, source_id: i64, error: &str) {
    let connection = match repo.get_connection() {
        Ok(connection) => connection,
        Err(connection_error) => {
            warn!(
                "Could not open database to persist collection failure: {}",
                connection_error
            );
            return;
        }
    };
    let connection = match connection.lock() {
        Ok(connection) => connection,
        Err(_) => {
            warn!("Could not lock database to persist collection failure");
            return;
        }
    };
    if let Err(state_error) =
        crate::db::mark_collection_source_failed(&connection, source_id, error)
    {
        warn!(
            "Could not persist collection failure state: {}",
            state_error
        );
    }
    if let Err(event_error) = crate::db::insert_health_event(
        &connection,
        "tiktok_sync",
        "error",
        error,
        Some("retry_with_backoff"),
        Some("api"),
    ) {
        warn!(
            "Could not persist collection failure event: {}",
            event_error
        );
    }
}

fn find_or_insert_job_for_api(
    repo: &Arc<dyn JobRepository>,
    url: &str,
) -> Result<(i64, bool), (StatusCode, String)> {
    let connection = repo
        .get_connection()
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let connection = connection.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database mutex poisoned".to_string(),
        )
    })?;
    match crate::db::find_job_id_by_url(&connection, url)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
    {
        Some(existing_id) => Ok((existing_id, false)),
        None => crate::db::insert_job(&connection, url)
            .map(|job_id| (job_id, true))
            .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())),
    }
}

async fn ingest_handler(
    State(state): State<ApiState>,
    Json(payload): Json<IngestRequest>,
) -> Result<Json<IngestResponse>, (StatusCode, String)> {
    validate_ingest_url(&payload.url).map_err(|error| (StatusCode::BAD_REQUEST, error))?;

    if is_collection_source(&payload.url) {
        let source_id = register_collection_source_for_api(&state.job_repo, &payload.url)?;

        let collection_urls = match state.queue_service.expand_collection(&payload.url).await {
            Ok(urls) => urls,
            Err(error) => {
                persist_collection_failure_for_api(&state.job_repo, source_id, &error);
                return Err((StatusCode::BAD_GATEWAY, error));
            }
        };
        if collection_urls.is_empty() {
            let error = "No public videos were found in the TikTok collection";
            persist_collection_failure_for_api(&state.job_repo, source_id, error);
            return Err((StatusCode::BAD_REQUEST, error.to_string()));
        }

        let mut first_job_id = None;
        let mut queued = 0usize;
        for video_url in collection_urls.into_iter().take(200) {
            let (job_id, is_new) = match find_or_insert_job_for_api(&state.job_repo, &video_url) {
                Ok(value) => value,
                Err(error) => {
                    persist_collection_failure_for_api(&state.job_repo, source_id, &error.1);
                    return Err(error);
                }
            };
            first_job_id.get_or_insert(job_id);

            if is_new {
                match state.queue_service.dispatch(job_id, video_url).await {
                    Ok(()) => queued += 1,
                    Err(error) => {
                        persist_collection_failure_for_api(&state.job_repo, source_id, &error);
                        return Err((StatusCode::SERVICE_UNAVAILABLE, error));
                    }
                }
            }
        }

        let job_id = first_job_id.ok_or_else(|| {
            (
                StatusCode::CONFLICT,
                "Collection did not yield any new or existing jobs".to_string(),
            )
        })?;
        if let Ok(connection) = state.job_repo.get_connection() {
            if let Ok(connection) = connection.lock() {
                if let Err(error) =
                    crate::db::mark_collection_source_synced(&connection, source_id, queued)
                {
                    warn!("Could not persist collection success state: {}", error);
                }
            }
        }
        return Ok(Json(IngestResponse {
            job_id,
            status: "queued".to_string(),
        }));
    }

    let (job_id, is_new) = find_or_insert_job_for_api(&state.job_repo, &payload.url)?;
    if is_new {
        state
            .queue_service
            .dispatch(job_id, payload.url.clone())
            .await
            .map_err(|error| {
                warn!("API Ingest failed to dispatch: {}", error);
                (StatusCode::SERVICE_UNAVAILABLE, error)
            })?;
        info!("Job {} ingested successfully", job_id);
    } else {
        info!("Job {} already exists; skipping duplicate dispatch", job_id);
    }

    Ok(Json(IngestResponse {
        job_id,
        status: if is_new { "queued" } else { "existing" }.to_string(),
    }))
}

fn validate_ingest_url(url: &str) -> Result<(), String> {
    crate::api::middleware::security::validate_sandbox_url(url)
}

async fn literal_search_handler(
    State(state): State<ApiState>,
    Json(payload): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, (StatusCode, String)> {
    let query = payload.query.trim();
    if query.is_empty() || query.len() > 500 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Search query must contain between 1 and 500 characters".to_string(),
        ));
    }
    let connection = state
        .job_repo
        .get_connection()
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let connection = connection.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database mutex poisoned".to_string(),
        )
    })?;
    let results = crate::db::search_literal_transcripts(
        &connection,
        query,
        payload.limit.unwrap_or(10).clamp(1, 100),
    )
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
    .into_iter()
    .map(|result| crate::domain::models::SearchResult {
        job_id: result.job_id,
        title: result.title,
        thumbnail: result.thumbnail,
        chunk_text: result.chunk_text,
        chunk_index: result.chunk_index,
        similarity_score: result.similarity_score,
    })
    .collect();
    Ok(Json(SearchResponse { results }))
}

async fn search_handler(
    State(state): State<ApiState>,
    Json(payload): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, (StatusCode, String)> {
    let query = payload.query.trim();
    if query.is_empty() || query.len() > 500 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Search query must contain between 1 and 500 characters".to_string(),
        ));
    }
    let results = state.search_service.search(query).await.map_err(|e| {
        warn!("API Search failed: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, e)
    })?;

    // Note: Future Phases 11 & 12 (Reranker and Semantic Cache) will intercept here
    let final_results = results
        .into_iter()
        .take(payload.limit.unwrap_or(10).clamp(1, 100))
        .collect();

    Ok(Json(SearchResponse {
        results: final_results,
    }))
}

/// Compatibilidad para clientes que solicitan transcripción directa: usa la
/// misma cola de descarga, audio, transcript, evidencia visual e indexación.
async fn transcribe_handler(
    State(state): State<ApiState>,
    Json(payload): Json<IngestRequest>,
) -> Result<Json<IngestResponse>, (StatusCode, String)> {
    ingest_handler(State(state), Json(payload)).await
}

async fn get_transcript_handler(
    State(state): State<ApiState>,
    Path(job_id): Path<i64>,
) -> Result<Json<Vec<TranscriptSegmentResponse>>, (StatusCode, String)> {
    let connection = state
        .job_repo
        .get_connection()
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let connection = connection.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database mutex poisoned".to_string(),
        )
    })?;
    let segments = crate::db::get_transcript_segments_with_timestamps(&connection, job_id)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
        .into_iter()
        .map(
            |(chunk_index, chunk_text, start, end)| TranscriptSegmentResponse {
                chunk_index,
                chunk_text,
                start,
                end,
            },
        )
        .collect();
    Ok(Json(segments))
}

async fn get_jobs_handler(
    State(state): State<ApiState>,
) -> Result<Json<Vec<crate::domain::models::JobRecord>>, (StatusCode, String)> {
    let mut jobs = state.job_repo.get_all_jobs().map_err(|e| {
        warn!("API Get Jobs failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to retrieve jobs".to_string(),
        )
    })?;
    for job in &mut jobs {
        if job
            .video_path
            .as_deref()
            .map(std::path::PathBuf::from)
            .is_some_and(|path| !path.is_file())
        {
            job.video_path = None;
        }
    }
    Ok(Json(jobs))
}

async fn retry_job_handler(
    State(state): State<ApiState>,
    Path(job_id): Path<i64>,
) -> Result<Json<IngestResponse>, (StatusCode, String)> {
    if state.queue_service.is_active(job_id).await {
        return Ok(Json(IngestResponse {
            job_id,
            status: "retrying".to_string(),
        }));
    }

    let job_url = {
        let connection = state
            .job_repo
            .get_connection()
            .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
        let connection = connection.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Database mutex poisoned".to_string(),
            )
        })?;
        let job = crate::db::get_job_by_id(&connection, job_id)
            .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
            .ok_or_else(|| (StatusCode::NOT_FOUND, "Job not found".to_string()))?;
        if !matches!(
            job.status.to_lowercase().as_str(),
            "error" | "error_dlq" | "failed" | "failure" | "cancelled" | "canceled"
        ) {
            return Err((
                StatusCode::CONFLICT,
                "Job is not available for retry".to_string(),
            ));
        }
        let media_root = std::env::var_os("PULSAR_DOWNLOAD_DIR")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(crate::storage::default_media_root);
        let processing_root = crate::storage::staging_root(&media_root);
        crate::db::cleanup_media_files(&connection, job_id, &processing_root)
            .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
        crate::db::reset_job_for_retry(&connection, job_id)
            .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
        job.url
    };

    if let Err(error) = state.queue_service.dispatch(job_id, job_url).await {
        // El retry debe ser transaccional desde la perspectiva del usuario:
        // si la cola rechaza el despacho, no dejamos el registro atascado en
        // queued ni obligamos a esperar al scheduler de mantenimiento.
        if let Ok(connection) = state.job_repo.get_connection() {
            if let Ok(connection) = connection.lock() {
                if let Err(persist_error) =
                    crate::db::update_job_error(&connection, job_id, "error", &error)
                {
                    warn!(
                        "API retry error state could not be persisted for job {}: {}",
                        job_id, persist_error
                    );
                }
            }
        }
        return Err((StatusCode::SERVICE_UNAVAILABLE, error));
    }

    Ok(Json(IngestResponse {
        job_id,
        status: "queued".to_string(),
    }))
}

async fn get_playlists_handler(
    State(state): State<ApiState>,
) -> Result<Json<Vec<crate::db::PlaylistRecord>>, (StatusCode, String)> {
    let connection = state
        .job_repo
        .get_connection()
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let connection = connection.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database mutex poisoned".to_string(),
        )
    })?;
    crate::db::get_all_playlists(&connection)
        .map(Json)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))
}

async fn create_playlist_handler(
    State(state): State<ApiState>,
    Json(payload): Json<CreatePlaylistRequest>,
) -> Result<Json<CreatePlaylistResponse>, (StatusCode, String)> {
    let name = payload.name.trim();
    if name.is_empty() || name.len() > 200 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Playlist name must contain between 1 and 200 characters".to_string(),
        ));
    }

    let connection = state
        .job_repo
        .get_connection()
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let connection = connection.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database mutex poisoned".to_string(),
        )
    })?;
    let id = crate::db::create_playlist(
        &connection,
        name,
        payload.description.as_deref(),
        payload.color.as_deref().unwrap_or("#8a5cff"),
        false,
    )
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;

    Ok(Json(CreatePlaylistResponse { id }))
}

async fn get_playlist_items_handler(
    State(state): State<ApiState>,
    Path(playlist_id): Path<i64>,
) -> Result<Json<Vec<crate::db::JobRecord>>, (StatusCode, String)> {
    let connection = state
        .job_repo
        .get_connection()
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let connection = connection.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database mutex poisoned".to_string(),
        )
    })?;
    let mut jobs = crate::db::get_playlist_jobs(&connection, playlist_id)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    for job in &mut jobs {
        if job
            .video_path
            .as_deref()
            .map(std::path::PathBuf::from)
            .is_some_and(|path| !path.is_file())
        {
            job.video_path = None;
        }
    }
    Ok(Json(jobs))
}

async fn add_playlist_item_handler(
    State(state): State<ApiState>,
    Path(playlist_id): Path<i64>,
    Json(payload): Json<PlaylistItemRequest>,
) -> Result<Json<()>, (StatusCode, String)> {
    let connection = state
        .job_repo
        .get_connection()
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let connection = connection.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database mutex poisoned".to_string(),
        )
    })?;
    crate::db::add_job_to_playlist(&connection, playlist_id, payload.job_id)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    Ok(Json(()))
}

async fn remove_playlist_item_handler(
    State(state): State<ApiState>,
    Path((playlist_id, job_id)): Path<(i64, i64)>,
) -> Result<Json<()>, (StatusCode, String)> {
    let connection = state
        .job_repo
        .get_connection()
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let connection = connection.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database mutex poisoned".to_string(),
        )
    })?;
    crate::db::remove_job_from_playlist(&connection, playlist_id, job_id)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    Ok(Json(()))
}

async fn delete_playlist_handler(
    State(state): State<ApiState>,
    Path(playlist_id): Path<i64>,
) -> Result<Json<()>, (StatusCode, String)> {
    let connection = state
        .job_repo
        .get_connection()
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let connection = connection.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database mutex poisoned".to_string(),
        )
    })?;
    crate::db::delete_playlist(&connection, playlist_id)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    Ok(Json(()))
}

async fn health_handler() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

pub async fn start_api_server(port: u16, state: ApiState) {
    let runtime = state.runtime.clone();
    // Configurar CORS para desarrollo Next.js y el servidor estático de producción.
    let cors = CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://localhost:3000"),
            HeaderValue::from_static("http://127.0.0.1:3000"),
            HeaderValue::from_static("http://localhost:3344"),
            HeaderValue::from_static("http://127.0.0.1:3344"),
        ])
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS, Method::DELETE])
        .allow_headers([
            HeaderName::from_static("content-type"),
            HeaderName::from_static("authorization"),
        ]);

    let write_routes = Router::new()
        .route("/api/v1/ingest", post(ingest_handler))
        .route("/api/v1/playlists", post(create_playlist_handler))
        .route(
            "/api/v1/playlists/:playlist_id",
            delete(delete_playlist_handler),
        )
        .route(
            "/api/v1/playlists/:playlist_id/items",
            post(add_playlist_item_handler),
        )
        .route(
            "/api/v1/playlists/:playlist_id/items/:job_id",
            delete(remove_playlist_item_handler),
        )
        .route("/api/v1/transcribe", post(transcribe_handler))
        .route("/api/v1/jobs/:job_id/retry", post(retry_job_handler))
        // Every non-health route requires the process-scoped bearer token.
        // Loopback limits exposure but is not an authentication substitute.
        .layer(middleware::from_fn_with_state(
            state.security.clone(),
            crate::api::middleware::security::jwt_rate_limit_middleware,
        ));

    let read_routes = Router::new()
        .route("/api/v1/jobs", get(get_jobs_handler))
        .route(
            "/api/v1/jobs/:job_id/transcript",
            get(get_transcript_handler),
        )
        .route("/api/v1/playlists", get(get_playlists_handler))
        .route(
            "/api/v1/playlists/:playlist_id/items",
            get(get_playlist_items_handler),
        )
        .route("/api/v1/search/literal", post(literal_search_handler))
        .route("/api/v1/search", post(search_handler))
        .layer(middleware::from_fn_with_state(
            state.security.clone(),
            crate::api::middleware::security::jwt_rate_limit_middleware,
        ));

    let app = Router::new()
        .merge(write_routes)
        .merge(read_routes)
        .layer(axum::extract::DefaultBodyLimit::max(1024 * 1024))
        .route("/health", get(health_handler))
        .route("/api/v1/health", get(health_handler))
        .layer(cors)
        .with_state(state);

    let configured_host = std::env::var("PULSAR_API_HOST").unwrap_or_else(|_| API_BIND_HOST.into());
    if let Err(error) = validate_api_bind_host(&configured_host) {
        runtime.mark_failed(error.to_string());
        tracing::error!("{} (host configurado: {})", error, configured_host);
        return;
    }

    let addr = format!("{}:{}", configured_host, port);
    info!("Starting Pulsar API Gateway REST on loopback {}", addr);

    let listener = match TcpListener::bind(&addr).await {
        Ok(listener) => listener,
        Err(error) => {
            let message = format!("Failed to bind Axum API port {}: {}", addr, error);
            runtime.mark_failed(message.clone());
            tracing::error!("{}", message);
            return;
        }
    };
    runtime.mark_ready();
    if let Err(error) = axum::serve(listener, app).await {
        runtime.mark_failed(format!("Axum REST Server failed to serve: {}", error));
        tracing::error!("Axum REST Server failed to serve: {}", error);
    }
}

#[cfg(test)]
mod tests {
    use super::{is_collection_source, validate_api_bind_host, validate_ingest_url, API_BIND_HOST};
    use crate::api::middleware::security::MAX_URL_LENGTH;

    #[test]
    fn api_bind_contract_accepts_only_desktop_loopback() {
        assert_eq!(API_BIND_HOST, "127.0.0.1");
        assert!(validate_api_bind_host("127.0.0.1").is_ok());
        assert!(validate_api_bind_host("0.0.0.0").is_err());
        assert!(validate_api_bind_host("192.168.1.50").is_err());
        assert!(validate_api_bind_host("::").is_err());
        assert!(validate_api_bind_host("::1").is_err());
    }

    #[test]
    fn detects_supported_tiktok_collection_shapes() {
        assert!(is_collection_source("https://www.tiktok.com/@creator"));
        assert!(is_collection_source(
            "https://www.tiktok.com/@creator/playlists/123"
        ));
        assert!(is_collection_source(
            "https://www.tiktok.com/@creator/liked"
        ));
        assert!(is_collection_source(
            "https://www.tiktok.com/@creator/favorite"
        ));
    }

    #[test]
    fn does_not_classify_tiktok_video_as_collection() {
        assert!(!is_collection_source(
            "https://www.tiktok.com/@creator/video/123"
        ));
        assert!(!is_collection_source("https://www.youtube.com/watch?v=abc"));
    }

    #[test]
    fn reports_distinct_tiktok_url_validation_failures() {
        assert!(
            validate_ingest_url("http://www.tiktok.com/@creator/video/1")
                .unwrap_err()
                .contains("HTTPS")
        );
        assert!(validate_ingest_url("not-a-url")
            .unwrap_err()
            .contains("malformada"));
        assert!(validate_ingest_url("https://www.youtube.com/watch?v=abc")
            .unwrap_err()
            .contains("no soportada"));
        assert!(validate_ingest_url(&format!(
            "https://www.tiktok.com/@creator/{}",
            "x".repeat(MAX_URL_LENGTH)
        ))
        .unwrap_err()
        .contains("2048"));
    }
}
