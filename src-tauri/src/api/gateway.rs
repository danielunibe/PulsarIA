use axum::{
    extract::{State, Json},
    http::{StatusCode, HeaderValue, Method},
    routing::{get, post},
    Router,
    middleware::{self},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::application::queue_service::QueueService;
use crate::application::search_service::SearchService;
use crate::domain::ports::JobRepository;
use tracing::{info, warn};
use tokio::net::TcpListener;
use tower_http::cors::{CorsLayer, Any};

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

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}



async fn ingest_handler(
    State(state): State<ApiState>,
    Json(payload): Json<IngestRequest>,
) -> Result<Json<IngestResponse>, (StatusCode, String)> {
    if !crate::api::middleware::security::is_valid_sandbox_url(&payload.url) {
        return Err((StatusCode::BAD_REQUEST, "Invalid Media URL in Sandbox".to_string()));
    }

    let job_id = state.job_repo.insert_job(&payload.url)
        .map_err(|e| {
            warn!("API Ingest failed to insert job: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to create job".to_string())
        })?;

    state.queue_service.dispatch(job_id, payload.url.clone()).await
        .map_err(|e| {
            warn!("API Ingest failed to dispatch: {}", e);
            (StatusCode::SERVICE_UNAVAILABLE, e)
        })?;

    info!("Job {} ingensted successfully horizontally", job_id);

    Ok(Json(IngestResponse {
        job_id,
        status: "queued".to_string(),
    }))
}

async fn search_handler(
    State(state): State<ApiState>,
    Json(payload): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, (StatusCode, String)> {
    let results = state.search_service.search(&payload.query).await
        .map_err(|e| {
            warn!("API Search failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e)
        })?;

    // Note: Future Phases 11 & 12 (Reranker and Semantic Cache) will intercept here
    let final_results = results.into_iter().take(payload.limit.unwrap_or(10)).collect();

    Ok(Json(SearchResponse {
        results: final_results,
    }))
}

async fn transcribe_handler(
    State(_state): State<ApiState>,
) -> Result<Json<String>, (StatusCode, String)> {
    Err((StatusCode::NOT_IMPLEMENTED, "On-demand direct transcription pending wrapper phase.".to_string()))
}

async fn get_jobs_handler(
    State(state): State<ApiState>,
) -> Result<Json<Vec<crate::domain::models::JobRecord>>, (StatusCode, String)> {
    let jobs = state.job_repo.get_all_jobs()
        .map_err(|e| {
            warn!("API Get Jobs failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to retrieve jobs".to_string())
        })?;
    Ok(Json(jobs))
}

async fn health_handler() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

pub async fn start_api_server(port: u16, state: ApiState) {
    // Configurar CORS para permitir requests desde el frontend Next.js (localhost:3000)
    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:3000".parse::<HeaderValue>().unwrap(),
            "http://127.0.0.1:3000".parse::<HeaderValue>().unwrap(),
        ])
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/v1/ingest", post(ingest_handler))
        .route("/api/v1/jobs", get(get_jobs_handler))
        .route("/api/v1/search", post(search_handler))
        .route("/api/v1/transcribe", post(transcribe_handler))
        // Protect with Max Payload Limit (1MB) to prevent large payload attacks
        .layer(axum::extract::DefaultBodyLimit::max(1024 * 1024))
        // Replace old API Auth with JWT and Token-Bucket IP Rate Limits
        .layer(middleware::from_fn_with_state(state.security.clone(), crate::api::middleware::security::jwt_rate_limit_middleware))
        // Unauthenticated bypass
        .route("/api/v1/health", get(health_handler))
        // CORS layer — permite al frontend (3000) hablar con el backend (8080)
        .layer(cors)
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    info!("Starting Pulsar API Gateway REST on {}", addr);

    let listener = TcpListener::bind(&addr).await.expect("Failed to bind Axum API port");
    axum::serve(listener, app).await.expect("Axum REST Server failed to serve");
}
