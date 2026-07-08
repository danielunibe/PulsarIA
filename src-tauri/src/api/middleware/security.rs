use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::Mutex;
use std::time::Instant;
use metrics::counter;

// ========================================================================
// PHASE 16: Security Middleware (JWT, Rate Limit, Size Limits)
// ========================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    pub role: String,
}

// Token Bucket for IP-based Rate Limiting
pub struct RateLimiter {
    capacity: u32,
    refill_rate_per_sec: f32,
    buckets: Mutex<HashMap<String, (f32, Instant)>>,
}

impl RateLimiter {
    pub fn new(capacity: u32, refill_rate_per_sec: f32) -> Self {
        Self {
            capacity,
            refill_rate_per_sec,
            buckets: Mutex::new(HashMap::new()),
        }
    }

    pub async fn check_ip(&self, ip: &str) -> bool {
        let mut buckets = self.buckets.lock().await;
        let now = Instant::now();
        
        let (tokens, last_refill) = buckets.entry(ip.to_string()).or_insert((self.capacity as f32, now));
        
        let elapsed = now.duration_since(*last_refill).as_secs_f32();
        *tokens = (*tokens + elapsed * self.refill_rate_per_sec).min(self.capacity as f32);
        *last_refill = now;

        if *tokens >= 1.0 {
            *tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

pub struct SecurityConfig {
    pub jwt_secret: String,
    pub rate_limiter: Arc<RateLimiter>,
}

pub async fn jwt_rate_limit_middleware(
    State(security_state): State<Arc<SecurityConfig>>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // 1. Rate Limiter checking (Mocking IP con Header o IP de conexión)
    // En producción usamos real SocketAddr, pero lo simplificaremos extrayendo algo simulado.
    let client_ip = req.headers()
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("0.0.0.0");

    if !security_state.rate_limiter.check_ip(client_ip).await {
        counter!("rate_limit_rejections_total", "endpoint" => req.uri().path().to_string()).increment(1);
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    // 2. JWT auth (Excepción: /health, /ingest y /jobs no requieren JWT en dev sandbox)
    if req.uri().path() == "/api/v1/health" || 
       req.uri().path() == "/api/v1/ingest" || 
       req.uri().path() == "/api/v1/jobs" {
        return Ok(next.run(req).await);
    }

    let auth_header = req.headers().get("Authorization").and_then(|h| h.to_str().ok());
    if let Some(auth_header) = auth_header {
        if auth_header.starts_with("Bearer ") {
            let token = &auth_header["Bearer ".len()..];
            let validation = Validation::new(Algorithm::HS256);
            if let Err(e) = decode::<Claims>(
                token,
                &DecodingKey::from_secret(security_state.jwt_secret.as_bytes()),
                &validation
            ) {
                tracing::warn!("JWT Authentication failed: {}", e);
                counter!("auth_failures_total", "reason" => "invalid_token").increment(1);
                return Err(StatusCode::UNAUTHORIZED);
            }
            // Validado exitosamente
            return Ok(next.run(req).await);
        }
    }

    counter!("auth_failures_total", "reason" => "missing_token").increment(1);
    Err(StatusCode::UNAUTHORIZED)
}

// 3. Simple URL Sandbox Validator
pub fn is_valid_sandbox_url(url: &str) -> bool {
    // Permitimos YouTube y TikTok
    url.starts_with("https://www.youtube.com/") || 
    url.starts_with("https://youtu.be/") ||
    url.contains("tiktok.com/")
}
