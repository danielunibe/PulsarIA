//! Optional Gemini adapter.
//!
//! Gemini is deliberately kept behind the native Tauri boundary. The browser
//! never receives the API key, the endpoint is not bundled into JavaScript,
//! and no prompt or response is persisted or logged by this adapter.

use serde::{Deserialize, Serialize};
use std::time::Duration;

const GEMINI_ENDPOINT: &str =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
pub const MAX_PROMPT_CHARS: usize = 120_000;
pub const MAX_OUTPUT_TOKENS: u32 = 8_192;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct GeminiResponse {
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest<'a> {
    contents: [GeminiContent<'a>; 1],
    generation_config: GeminiGenerationConfig,
}

#[derive(Debug, Serialize)]
struct GeminiContent<'a> {
    parts: [GeminiPart<'a>; 1],
}

#[derive(Debug, Serialize)]
struct GeminiPart<'a> {
    text: &'a str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerationConfig {
    temperature: f32,
    max_output_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct GeminiApiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiCandidateContent>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidateContent {
    parts: Option<Vec<GeminiResponsePart>>,
}

#[derive(Debug, Deserialize)]
struct GeminiResponsePart {
    text: Option<String>,
}

fn configured_api_key() -> Result<String, String> {
    for name in ["PULSAR_GOOGLE_API_KEY", "GOOGLE_API_KEY"] {
        if let Ok(value) = std::env::var(name) {
            let value = value.trim().to_string();
            if !value.is_empty() {
                return Ok(value);
            }
        }
    }
    Err("Gemini es opcional y no está configurado. Define PULSAR_GOOGLE_API_KEY o GOOGLE_API_KEY en el proceso nativo.".to_string())
}

fn validate_prompt(prompt: &str, max_output_tokens: u32) -> Result<(), String> {
    if prompt.trim().is_empty() {
        return Err("Gemini rechazó un prompt vacío".to_string());
    }
    if prompt.chars().count() > MAX_PROMPT_CHARS {
        return Err(format!(
            "El prompt de Gemini supera el límite de {} caracteres",
            MAX_PROMPT_CHARS
        ));
    }
    if !(1..=MAX_OUTPUT_TOKENS).contains(&max_output_tokens) {
        return Err(format!(
            "maxOutputTokens debe estar entre 1 y {}",
            MAX_OUTPUT_TOKENS
        ));
    }
    Ok(())
}

fn bounded_detail(body: &str, api_key: &str) -> String {
    let mut detail = body.replace(api_key, "[redacted]");
    detail.retain(|character| character != '\r' && character != '\n' && character != '\t');
    detail.trim().chars().take(300).collect()
}

async fn generate_at(
    endpoint: &str,
    prompt: &str,
    max_output_tokens: u32,
    api_key: &str,
    timeout: Duration,
) -> Result<GeminiResponse, String> {
    validate_prompt(prompt, max_output_tokens)?;
    if api_key.trim().is_empty() {
        return Err("Gemini es opcional y no está configurado. Define PULSAR_GOOGLE_API_KEY o GOOGLE_API_KEY en el proceso nativo.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|error| format!("No se pudo preparar el cliente de Gemini: {}", error))?;
    let request = GeminiRequest {
        contents: [GeminiContent {
            parts: [GeminiPart { text: prompt }],
        }],
        generation_config: GeminiGenerationConfig {
            temperature: 0.3,
            max_output_tokens,
        },
    };
    let response = client
        .post(endpoint)
        .header("x-goog-api-key", api_key)
        .json(&request)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "Gemini agotó el tiempo de espera. Comprueba tu conexión e inténtalo de nuevo."
                    .to_string()
            } else {
                format!("No se pudo contactar Gemini: {}", error)
            }
        })?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Gemini devolvió una respuesta ilegible: {}", error))?;
    if !status.is_success() {
        let detail = bounded_detail(&body, api_key);
        return Err(if detail.is_empty() {
            format!("Gemini rechazó la solicitud (HTTP {})", status.as_u16())
        } else {
            format!(
                "Gemini rechazó la solicitud (HTTP {}): {}",
                status.as_u16(),
                detail
            )
        });
    }

    let parsed: GeminiApiResponse = serde_json::from_str(&body)
        .map_err(|error| format!("Gemini devolvió JSON inválido: {}", error))?;
    let text = parsed
        .candidates
        .unwrap_or_default()
        .into_iter()
        .flat_map(|candidate| candidate.content.into_iter())
        .flat_map(|content| content.parts.unwrap_or_default())
        .filter_map(|part| part.text)
        .map(|part| part.trim().to_string())
        .find(|part| !part.is_empty());
    let Some(text) = text else {
        return Err("Gemini devolvió una respuesta vacía".to_string());
    };
    Ok(GeminiResponse { text })
}

/// Generates one user-requested response through the native Gemini adapter.
/// The key is read only at call time from the process environment.
pub async fn generate(prompt: &str, max_output_tokens: u32) -> Result<GeminiResponse, String> {
    let api_key = configured_api_key()?;
    generate_at(
        GEMINI_ENDPOINT,
        prompt,
        max_output_tokens,
        &api_key,
        REQUEST_TIMEOUT,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn server(
        response_body: &str,
        status: &str,
        delay: Option<Duration>,
    ) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("test server should bind");
        let address = listener.local_addr().expect("test server address");
        let body = response_body.to_string();
        let status = status.to_string();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test client should connect");
            let mut request = [0_u8; 16 * 1024];
            let request_len = stream
                .read(&mut request)
                .expect("test request should be readable");
            if let Some(delay) = delay {
                thread::sleep(delay);
            }
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(), body
            );
            let _ = stream.write_all(response.as_bytes());
            String::from_utf8_lossy(&request[..request_len]).into_owned()
        });
        (format!("http://{address}/generate"), handle)
    }

    #[tokio::test]
    async fn missing_key_rejects_before_network() {
        let result = generate_at(
            "http://127.0.0.1:1/should-not-connect",
            "prompt válido",
            32,
            "   ",
            Duration::from_millis(50),
        )
        .await;
        assert!(result
            .expect_err("missing key must fail closed")
            .contains("no está configurado"));
    }

    #[tokio::test]
    async fn configured_key_is_sent_only_in_the_native_header() {
        let (endpoint, handle) = server(
            r#"{"candidates":[{"content":{"parts":[{"text":" respuesta válida "}]}}]}"#,
            "200 OK",
            None,
        );
        let result = generate_at(
            &endpoint,
            "¿Qué aprendí?",
            64,
            "test-key",
            Duration::from_secs(2),
        )
        .await
        .expect("configured request should succeed");
        let request = handle.join().expect("test server should finish");
        assert_eq!(result.text, "respuesta válida");
        assert!(request.contains("x-goog-api-key: test-key"));
        assert!(request.contains("¿Qué aprendí?"));
        assert!(!request.contains("?key=test-key"));
    }

    #[tokio::test]
    async fn empty_response_is_an_actionable_error() {
        let (endpoint, handle) = server(r#"{"candidates":[]}"#, "200 OK", None);
        let error = generate_at(&endpoint, "prompt", 32, "test-key", Duration::from_secs(2))
            .await
            .expect_err("empty candidates must fail");
        handle.join().expect("test server should finish");
        assert!(error.contains("respuesta vacía"));
    }

    #[tokio::test]
    async fn http_error_is_bounded_and_redacts_the_key() {
        let (endpoint, handle) = server(
            r#"{"error":{"message":"test-key should never be displayed"}}"#,
            "429 Too Many Requests",
            None,
        );
        let error = generate_at(&endpoint, "prompt", 32, "test-key", Duration::from_secs(2))
            .await
            .expect_err("HTTP error must fail");
        handle.join().expect("test server should finish");
        assert!(error.contains("HTTP 429"));
        assert!(!error.contains("test-key"));
    }

    #[tokio::test]
    async fn timeout_is_actionable() {
        let (endpoint, handle) = server(
            r#"{"candidates":[]}"#,
            "200 OK",
            Some(Duration::from_millis(200)),
        );
        let error = generate_at(
            &endpoint,
            "prompt",
            32,
            "test-key",
            Duration::from_millis(25),
        )
        .await
        .expect_err("slow endpoint must time out");
        let _ = handle.join();
        assert!(error.contains("tiempo de espera"));
    }

    #[test]
    fn oversized_prompt_and_invalid_token_limit_are_rejected_before_network() {
        let oversized = "x".repeat(MAX_PROMPT_CHARS + 1);
        let error = validate_prompt(&oversized, 32).expect_err("prompt must be bounded");
        assert!(error.contains("supera el límite"));
        let error = validate_prompt("prompt", 0).expect_err("zero tokens must be rejected");
        assert!(error.contains("entre 1"));
    }

    #[test]
    fn error_details_are_bounded_and_redacted() {
        let detail = bounded_detail(&format!("test-key {}", "x".repeat(500)), "test-key");
        assert!(!detail.contains("test-key"));
        assert!(detail.len() <= 300);
    }
}
