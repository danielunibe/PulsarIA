use crate::application::queue_service::QueueService;
use crate::application::search_service::SearchService;
use crate::domain::ports::JobRepository;
use axum::{
    extract::{Json, Path, State},
    http::{HeaderValue, Method, StatusCode},
    middleware::{self},
    routing::{delete, get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tracing::{info, warn};

#[derive(Clone)]
pub struct ApiState {
    pub queue_service: Arc<QueueService>,
    pub search_service: Arc<SearchService>,
    pub job_repo: Arc<dyn JobRepository>,
    pub security: Arc<crate::api::middleware::security::SecurityConfig>,
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
) -> Result<(), (StatusCode, String)> {
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
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))
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
    if !crate::api::middleware::security::is_valid_sandbox_url(&payload.url) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid Media URL in Sandbox".to_string(),
        ));
    }

    if is_collection_source(&payload.url) {
        register_collection_source_for_api(&state.job_repo, &payload.url)?;

        let collection_urls = state
            .queue_service
            .expand_collection(&payload.url)
            .await
            .map_err(|error| (StatusCode::BAD_GATEWAY, error))?;
        if collection_urls.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                "No public videos were found in the TikTok collection".to_string(),
            ));
        }

        let mut first_job_id = None;
        for video_url in collection_urls.into_iter().take(200) {
            let (job_id, is_new) = find_or_insert_job_for_api(&state.job_repo, &video_url)?;
            first_job_id.get_or_insert(job_id);

            if is_new {
                state
                    .queue_service
                    .dispatch(job_id, video_url)
                    .await
                    .map_err(|error| (StatusCode::SERVICE_UNAVAILABLE, error))?;
            }
        }

        let job_id = first_job_id.ok_or_else(|| {
            (
                StatusCode::CONFLICT,
                "Collection did not yield any new or existing jobs".to_string(),
            )
        })?;
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

async fn literal_search_handler(
    State(state): State<ApiState>,
    Json(payload): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, (StatusCode, String)> {
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
        &payload.query,
        payload.limit.unwrap_or(10).min(100),
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
    let results = state
        .search_service
        .search(&payload.query)
        .await
        .map_err(|e| {
            warn!("API Search failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e)
        })?;

    // Note: Future Phases 11 & 12 (Reranker and Semantic Cache) will intercept here
    let final_results = results
        .into_iter()
        .take(payload.limit.unwrap_or(10))
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
    let jobs = state.job_repo.get_all_jobs().map_err(|e| {
        warn!("API Get Jobs failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to retrieve jobs".to_string(),
        )
    })?;
    Ok(Json(jobs))
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
    crate::db::get_playlist_jobs(&connection, playlist_id)
        .map(Json)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))
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

async fn get_julia_pending_handler(
    State(state): State<ApiState>,
) -> Result<Json<Vec<crate::domain::models::JobRecord>>, (StatusCode, String)> {
    let conn = state
        .job_repo
        .get_connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let conn = conn.lock().unwrap_or_else(|poisoned| {
        eprintln!("API: DB mutex poisoned (julia/pending), recovering");
        poisoned.into_inner()
    });
    let db_jobs = crate::db::get_julia_ready_jobs(&conn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut jobs = Vec::new();
    for j in db_jobs {
        jobs.push(crate::domain::models::JobRecord {
            id: j.id,
            url: j.url,
            status: j.status,
            progress: j.progress,
            created_at: j.created_at,
            title: j.title,
            author: j.author,
            thumbnail: j.thumbnail,
            duration: j.duration,
            video_path: j.video_path,
            error_message: j.error_message,
            visual_analysis: j.visual_analysis,
            instructional_guide: j.instructional_guide,
        });
    }
    Ok(Json(jobs))
}

#[derive(Deserialize)]
pub struct JuliaAckRequest {
    pub job_id: i64,
}

async fn julia_ack_handler(
    State(state): State<ApiState>,
    Json(payload): Json<JuliaAckRequest>,
) -> Result<Json<()>, (StatusCode, String)> {
    let conn = state
        .job_repo
        .get_connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let conn = conn.lock().unwrap_or_else(|poisoned| {
        eprintln!("API: DB mutex poisoned (julia/ack), recovering");
        poisoned.into_inner()
    });
    crate::db::mark_julia_exported(&conn, payload.job_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(()))
}

pub async fn start_api_server(port: u16, state: ApiState) {
    // Configurar CORS para permitir requests desde el frontend Next.js (localhost:3000)
    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:3000".parse::<HeaderValue>().unwrap(),
            "http://127.0.0.1:3000".parse::<HeaderValue>().unwrap(),
        ])
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS, Method::DELETE])
        .allow_headers([
            "content-type".parse().unwrap(),
            "authorization".parse().unwrap(),
        ]);

    let app = Router::new()
        .route("/api/v1/ingest", post(ingest_handler))
        .route("/api/v1/jobs", get(get_jobs_handler))
        .route(
            "/api/v1/jobs/:job_id/transcript",
            get(get_transcript_handler),
        )
        .route(
            "/api/v1/playlists",
            get(get_playlists_handler).post(create_playlist_handler),
        )
        .route(
            "/api/v1/playlists/:playlist_id/items",
            get(get_playlist_items_handler).post(add_playlist_item_handler),
        )
        .route(
            "/api/v1/playlists/:playlist_id/items/:job_id",
            delete(remove_playlist_item_handler),
        )
        .route(
            "/api/v1/playlists/:playlist_id",
            delete(delete_playlist_handler),
        )
        .route("/api/v1/search/literal", post(literal_search_handler))
        .route("/api/v1/search", post(search_handler))
        .route("/api/v1/transcribe", post(transcribe_handler))
        // Protect with Max Payload Limit (1MB) to prevent large payload attacks
        .layer(axum::extract::DefaultBodyLimit::max(1024 * 1024))
        // Replace old API Auth with JWT and Token-Bucket IP Rate Limits
        .layer(middleware::from_fn_with_state(
            state.security.clone(),
            crate::api::middleware::security::jwt_rate_limit_middleware,
        ))
        // Unauthenticated bypass
        .route("/health", get(health_handler))
        .route("/api/v1/health", get(health_handler))
        .route("/api/v1/julia/pending", get(get_julia_pending_handler))
        .route("/api/v1/julia/ack", post(julia_ack_handler))
        // CORS layer - permite al frontend (3000) hablar con el backend (8080)
        .layer(cors)
        .with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    info!("Starting Pulsar API Gateway REST on loopback {}", addr);

    let listener = TcpListener::bind(&addr)
        .await
        .expect("Failed to bind Axum API port");
    axum::serve(listener, app)
        .await
        .expect("Axum REST Server failed to serve");
}

#[cfg(test)]
mod tests {
    use super::is_collection_source;

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
}
