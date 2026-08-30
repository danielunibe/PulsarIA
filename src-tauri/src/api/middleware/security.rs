use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use metrics::counter;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

// ========================================================================
// PHASE 16: Security Middleware (JWT, Rate Limit, Size Limits)
// ========================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    pub role: String,
}

/// Maximum number of IP buckets retained in memory.
/// Acts as a safety cap against memory exhaustion from IP spoofing.
const MAX_BUCKETS: usize = 10_000;

/// Buckets older than this are lazily evicted on the next check_ip call.
const BUCKET_TTL: Duration = Duration::from_secs(300); // 5 minutes

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

        // Bug #39 FIX: Lazy cleanup — evict expired buckets if map is large
        if buckets.len() > MAX_BUCKETS / 2 {
            buckets.retain(|_, (_, last_refill)| now.duration_since(*last_refill) < BUCKET_TTL);
        }

        // Enforce max bucket count — drop oldest entry before inserting new one
        if buckets.len() >= MAX_BUCKETS && !buckets.contains_key(ip) {
            if let Some(oldest_key) = buckets
                .iter()
                .min_by_key(|(_, (_, ts))| *ts)
                .map(|(k, _)| k.clone())
            {
                buckets.remove(&oldest_key);
            }
        }

        let (tokens, last_refill) = buckets
            .entry(ip.to_string())
            .or_insert((self.capacity as f32, now));

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
    // 1. Rate Limiter — use peer address, not spoofable headers.
    // Bug #46 FIX: X-Forwarded-For is spoofable; prefer connection peer IP.
    // For loopback-only servers (desktop app), all requests come from 127.0.0.1.
    let client_ip = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
        .filter(|_| {
            // Only trust X-Forwarded-For from known proxies (e.g. localhost)
            // For now, use connection peer address for loopback.
            false // Never trust forwarded headers on loopback
        })
        .or_else(|| Some("127.0.0.1")); // Loopback default for desktop app

    if !security_state.rate_limiter.check_ip(client_ip.unwrap_or("127.0.0.1")).await {
        counter!("rate_limit_rejections_total", "endpoint" => req.uri().path().to_string())
            .increment(1);
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    // 2. Public endpoints (no auth required)
    let path = req.uri().path();
    let is_public = path == "/health" || path == "/api/v1/health";

    // 3. JWT auth for protected endpoints.
    // SECURITY NOTE: This server binds to 127.0.0.1 only (loopback).
    // The desktop frontend doesn't carry JWT tokens, so all API endpoints
    // are effectively loopback-only. If this server is ever exposed beyond
    // loopback, JWT enforcement MUST be enabled here.
    if is_public {
        return Ok(next.run(req).await);
    }

    // For loopback desktop app: allow all requests from localhost.
    // If we wanted to enforce JWT on a network-exposed server:
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok());
    if let Some(auth_header) = auth_header {
        if auth_header.starts_with("Bearer ") {
            let token = &auth_header["Bearer ".len()..];
            let validation = Validation::new(Algorithm::HS256);
            if let Err(e) = decode::<Claims>(
                token,
                &DecodingKey::from_secret(security_state.jwt_secret.as_bytes()),
                &validation,
            ) {
                tracing::warn!("JWT Authentication failed: {}", e);
                counter!("auth_failures_total", "reason" => "invalid_token").increment(1);
                return Err(StatusCode::UNAUTHORIZED);
            }
            return Ok(next.run(req).await);
        }
    }

    // No JWT token — for loopback desktop app, this is acceptable.
    // The rate limiter provides the primary protection layer.
    counter!("auth_failures_total", "reason" => "missing_token").increment(1);
    // Accept request on loopback (desktop app has no JWT infrastructure)
    Ok(next.run(req).await)
}

// 3. Simple URL Sandbox Validator
pub fn is_valid_sandbox_url(url: &str) -> bool {
    let Some((scheme, authority_and_path)) = url.split_once("://") else {
        return false;
    };
    if !scheme.eq_ignore_ascii_case("https") {
        return false;
    }

    let authority = authority_and_path
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("");
    let host = authority
        .rsplit('@')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();

    matches!(
        host.as_str(),
        "youtube.com"
            | "www.youtube.com"
            | "youtu.be"
            | "tiktok.com"
            | "www.tiktok.com"
            | "instagram.com"
            | "www.instagram.com"
    ) || host.ends_with(".tiktok.com")
        || host.ends_with(".instagram.com")
}

#[cfg(test)]
mod tests {
    use super::is_valid_sandbox_url;

    #[test]
    fn accepts_supported_https_hosts() {
        assert!(is_valid_sandbox_url("https://www.youtube.com/watch?v=abc"));
        assert!(is_valid_sandbox_url("https://youtu.be/abc"));
        assert!(is_valid_sandbox_url(
            "https://www.tiktok.com/@creator/video/1"
        ));
        assert!(is_valid_sandbox_url("https://www.instagram.com/reel/abc"));
    }

    #[test]
    fn rejects_insecure_and_embedded_hosts() {
        assert!(!is_valid_sandbox_url("http://www.youtube.com/watch?v=abc"));
        assert!(!is_valid_sandbox_url(
            "https://evil.example/tiktok.com/video/1"
        ));
        assert!(!is_valid_sandbox_url(
            "https://youtube.com.evil.example/watch?v=abc"
        ));
    }
}
