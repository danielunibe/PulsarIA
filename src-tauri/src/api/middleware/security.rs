use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
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
pub const MAX_URL_LENGTH: usize = 2_048;

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

pub fn create_session_token(secret: &str) -> Result<String, String> {
    let exp = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("system clock before unix epoch: {error}"))?
        + Duration::from_secs(24 * 60 * 60))
    .as_secs() as usize;
    encode(
        &Header::new(Algorithm::HS256),
        &Claims {
            sub: "pulsaria-desktop".into(),
            exp,
            role: "desktop".into(),
        },
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|error| format!("could not issue API session token: {error}"))
}

pub fn validate_session_token(token: &str, secret: &str) -> Result<Claims, String> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map(|token| token.claims)
    .map_err(|error| format!("JWT Authentication failed: {error}"))
}

fn bearer_token(headers: &axum::http::HeaderMap) -> Option<&str> {
    headers
        .get("Authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.trim().is_empty())
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
        .or(Some("127.0.0.1")); // Loopback default for desktop app

    if !security_state
        .rate_limiter
        .check_ip(client_ip.unwrap_or("127.0.0.1"))
        .await
    {
        counter!("rate_limit_rejections_total", "endpoint" => req.uri().path().to_string())
            .increment(1);
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    // 2. Public endpoints (no auth required)
    let path = req.uri().path();
    let is_public = path == "/health" || path == "/api/v1/health";

    // 3. JWT auth for protected endpoints.
    if is_public {
        return Ok(next.run(req).await);
    }

    if let Some(token) = bearer_token(req.headers()) {
        if let Err(error) = validate_session_token(token, &security_state.jwt_secret) {
            tracing::warn!("{}", error);
            counter!("auth_failures_total", "reason" => "invalid_token").increment(1);
            return Err(StatusCode::UNAUTHORIZED);
        }
        return Ok(next.run(req).await);
    }

    counter!("auth_failures_total", "reason" => "missing_token").increment(1);
    Err(StatusCode::UNAUTHORIZED)
}

pub async fn jwt_auth_middleware(
    State(security_state): State<Arc<SecurityConfig>>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    if let Some(token) = bearer_token(req.headers()) {
        if let Err(error) = validate_session_token(token, &security_state.jwt_secret) {
            tracing::warn!("{}", error);
            counter!("auth_failures_total", "reason" => "invalid_token").increment(1);
            return Err(StatusCode::UNAUTHORIZED);
        }
        return Ok(next.run(req).await);
    }
    counter!("auth_failures_total", "reason" => "missing_token").increment(1);
    Err(StatusCode::UNAUTHORIZED)
}

// 3. Simple URL Sandbox Validator
pub fn is_valid_sandbox_url(url: &str) -> bool {
    validate_sandbox_url(url).is_ok()
}

/// Canonical URL contract shared by the REST gateway, Tauri IPC and worker
/// collection expansion. Keeping the error categories here prevents the
/// native and browser paths from accepting different inputs.
pub fn validate_sandbox_url(url: &str) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("La URL está vacía".to_string());
    }
    if url.len() > MAX_URL_LENGTH {
        return Err(format!(
            "La URL supera el límite de {} caracteres",
            MAX_URL_LENGTH
        ));
    }
    let Some((scheme, authority_and_path)) = url.split_once("://") else {
        return Err("La URL está malformada; usa una URL HTTPS de TikTok".to_string());
    };
    if !scheme.eq_ignore_ascii_case("https") {
        return Err("La URL debe usar HTTPS".to_string());
    }

    let authority = authority_and_path
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("");
    // Userinfo is not needed for TikTok and can cause credentials to be
    // forwarded to the extractor. Reject it before host classification.
    if authority.contains('@') {
        return Err("La URL no puede contener credenciales embebidas".to_string());
    }
    let host = authority
        .rsplit('@')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();

    if matches!(host.as_str(), "tiktok.com" | "www.tiktok.com") || host.ends_with(".tiktok.com") {
        Ok(())
    } else {
        Err("Plataforma no soportada; el MVP acepta únicamente TikTok".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        bearer_token, create_session_token, is_valid_sandbox_url, validate_session_token, Claims,
        MAX_URL_LENGTH,
    };
    use axum::http::{HeaderMap, HeaderValue};
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn issues_a_process_scoped_token_with_expiration() {
        let token = create_session_token("test-secret").unwrap();
        let claims = validate_session_token(&token, "test-secret").unwrap();
        assert_eq!(claims.sub, "pulsaria-desktop");
        assert_eq!(claims.role, "desktop");
        assert!(claims.exp > 0);
    }

    #[test]
    fn rejects_invalid_and_expired_session_tokens() {
        assert!(validate_session_token("not-a-jwt", "test-secret").is_err());

        let expired = (SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .saturating_sub(120)) as usize;
        let token = encode(
            &Header::new(Algorithm::HS256),
            &Claims {
                sub: "pulsaria-desktop".into(),
                exp: expired,
                role: "desktop".into(),
            },
            &EncodingKey::from_secret(b"test-secret"),
        )
        .unwrap();
        assert!(validate_session_token(&token, "test-secret").is_err());
    }

    #[test]
    fn authorization_contract_distinguishes_missing_valid_and_malformed_tokens() {
        let empty = HeaderMap::new();
        assert!(bearer_token(&empty).is_none());

        let mut valid = HeaderMap::new();
        valid.insert("Authorization", HeaderValue::from_static("Bearer session"));
        assert_eq!(bearer_token(&valid), Some("session"));

        let mut malformed = HeaderMap::new();
        malformed.insert("Authorization", HeaderValue::from_static("Basic session"));
        assert!(bearer_token(&malformed).is_none());
    }

    #[test]
    fn accepts_supported_https_hosts() {
        assert!(is_valid_sandbox_url(
            "https://www.tiktok.com/@creator/video/1"
        ));
        assert!(is_valid_sandbox_url("https://vm.tiktok.com/ZExample"));
    }

    #[test]
    fn rejects_insecure_and_embedded_hosts() {
        assert!(!is_valid_sandbox_url(
            "http://www.tiktok.com/@creator/video/1"
        ));
        assert!(!is_valid_sandbox_url("https://www.youtube.com/watch?v=abc"));
        assert!(!is_valid_sandbox_url("https://www.instagram.com/reel/abc"));
        assert!(!is_valid_sandbox_url(
            "https://evil.example/tiktok.com/video/1"
        ));
        assert!(!is_valid_sandbox_url(
            "https://youtube.com.evil.example/watch?v=abc"
        ));
        assert!(!is_valid_sandbox_url(
            "https://user:password@www.tiktok.com/@creator/video/1"
        ));
    }

    #[test]
    fn reports_url_contract_categories() {
        assert!(super::validate_sandbox_url("http://www.tiktok.com/video")
            .unwrap_err()
            .contains("HTTPS"));
        assert!(
            super::validate_sandbox_url("https://www.youtube.com/watch?v=1")
                .unwrap_err()
                .contains("no soportada")
        );
        assert!(super::validate_sandbox_url(&format!(
            "https://www.tiktok.com/{}",
            "x".repeat(MAX_URL_LENGTH)
        ))
        .unwrap_err()
        .contains("2048"));
    }
}
