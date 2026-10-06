//! # Benchmark Sidecar (lanzador GGUF generico)
//!
//! Levanta `llama-server` para CUALQUIER archivo GGUF verificado en
//! `data/llm-models/`, sin pasar por el manifiesto de produccion
//! (`LocalLlmManager` queda intacto). Uso exclusivo de benchmark.
//!
//! Honestidad: si los pesos no existen o el hash no coincide, devuelve
//! `NOT_AVAILABLE`/`LOAD_FAILED`; nunca inventa una ejecucion.

use std::path::{Path, PathBuf};
use std::time::Duration;

fn hidden_tokio_command<S: AsRef<std::ffi::OsStr>>(program: S) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(program);
    crate::process_control::hide_tokio_command(&mut command);
    command
}

#[derive(Debug, Clone)]
pub struct SidecarSpec {
    pub model_id: String,
    pub gguf_path: PathBuf,
    pub expected_sha256: Option<String>,
    pub ctx_size: u32,
    pub n_predict: u32,
    pub use_gpu: bool,
}

impl SidecarSpec {
    /// Verifica presencia + tamano + hash antes de lanzar.
    pub fn verify(&self) -> Result<(), String> {
        let meta = std::fs::metadata(&self.gguf_path).map_err(|_| {
            format!(
                "NOT_AVAILABLE: missing weights {}",
                self.gguf_path.display()
            )
        })?;
        if meta.len() == 0 {
            return Err(format!(
                "LOAD_FAILED: empty file {}",
                self.gguf_path.display()
            ));
        }
        if let Some(expected) = &self.expected_sha256 {
            let actual = sha256_file(&self.gguf_path)?;
            if &actual != expected {
                return Err(format!(
                    "LOAD_FAILED: sha256 mismatch for {}",
                    self.gguf_path.display()
                ));
            }
        }
        // Convencion del repo: marcador `.verified` con el sha esperado.
        let marker = PathBuf::from(format!("{}.verified", self.gguf_path.display()));
        if let Ok(raw) = std::fs::read_to_string(&marker) {
            if let Some(expected) = &self.expected_sha256 {
                if raw.trim() != expected.trim() {
                    return Err(format!(
                        "LOAD_FAILED: stale .verified marker for {}",
                        self.gguf_path.display()
                    ));
                }
            }
        }
        Ok(())
    }
}

fn sha256_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut file =
        std::fs::File::open(path).map_err(|_| "LOAD_FAILED: cannot open weights".to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 4 * 1024 * 1024];
    loop {
        use std::io::Read;
        let n = file
            .read(&mut buf)
            .map_err(|_| "LOAD_FAILED: cannot read weights".to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub struct BenchmarkSidecar {
    child: tokio::process::Child,
    pub base_url: String,
    pub api_key: String,
    pub model_id: String,
    pub port: u16,
    pub pid: Option<u32>,
    pub gguf_path: PathBuf,
}

impl Drop for BenchmarkSidecar {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

impl BenchmarkSidecar {
    pub async fn launch(spec: &SidecarSpec) -> Result<Self, String> {
        spec.verify()?;
        let executable = crate::runtime::binary("llama-server.exe");
        if !executable.is_file() {
            return Err("LOAD_FAILED: llama-server.exe missing".to_string());
        }
        let port = reserve_local_port()?;
        let api_key = random_api_key();
        let absolute_gguf = if spec.gguf_path.is_absolute() {
            spec.gguf_path.clone()
        } else if let Ok(canon) = std::fs::canonicalize(&spec.gguf_path) {
            let canon_str = canon.to_string_lossy();
            if canon_str.starts_with(r"\\?\") {
                PathBuf::from(&canon_str[4..])
            } else {
                canon
            }
        } else if let Ok(cwd) = std::env::current_dir() {
            cwd.join(&spec.gguf_path)
        } else {
            spec.gguf_path.clone()
        };

        let mut command = hidden_tokio_command(&executable);
        command
            .arg("--model")
            .arg(&absolute_gguf)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(port.to_string())
            .arg("--api-key")
            .arg(&api_key)
            .arg("--no-webui")
            .arg("--ctx-size")
            .arg(spec.ctx_size.to_string())
            .arg("--n-predict")
            .arg(spec.n_predict.to_string());
        if spec.use_gpu {
            command
                .arg("--device")
                .arg("CUDA0")
                .arg("--n-gpu-layers")
                .arg("99");
        }
        let mut child = command
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .current_dir(executable.parent().unwrap_or_else(|| Path::new(".")))
            .spawn()
            .map_err(|_| "LOAD_FAILED: sidecar spawn failed".to_string())?;

        let pid = child.id();
        let base_url = format!("http://127.0.0.1:{port}");
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_millis(500))
            .timeout(Duration::from_millis(500))
            .build()
            .map_err(|_| "LOAD_FAILED: http client".to_string())?;
        let started = tokio::time::Instant::now();
        loop {
            if child
                .try_wait()
                .map_err(|_| "LOAD_FAILED: sidecar exited early".to_string())?
                .is_some()
            {
                return Err(
                    "LOAD_FAILED: sidecar exited during startup (OOM o pesos invalidos)"
                        .to_string(),
                );
            }
            if let Ok(Ok(response)) = tokio::time::timeout(
                Duration::from_millis(600),
                client
                    .get(format!("{base_url}/health"))
                    .bearer_auth(&api_key)
                    .send(),
            )
            .await
            {
                if response.status().is_success() {
                    return Ok(Self {
                        child,
                        base_url,
                        api_key,
                        model_id: spec.model_id.clone(),
                        port,
                        pid,
                        gguf_path: absolute_gguf,
                    });
                }
            }
            if started.elapsed() >= Duration::from_secs(120) {
                let _ = child.kill().await;
                let _ = child.wait().await;
                return Err("LOAD_FAILED: sidecar startup timeout (120s)".to_string());
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }

    pub fn pid(&self) -> Option<u32> {
        self.pid
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn is_alive(&mut self) -> bool {
        match self.child.try_wait() {
            Ok(None) => true,
            _ => false,
        }
    }

    pub fn exit_status(&mut self) -> Option<std::process::ExitStatus> {
        self.child.try_wait().ok().flatten()
    }

    pub async fn check_health(&self) -> Result<(), String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(1500))
            .build()
            .map_err(|e| format!("HEALTH_CHECK_FAILED: client error: {e}"))?;

        let resp = client
            .get(format!("{}/health", self.base_url))
            .bearer_auth(&self.api_key)
            .send()
            .await
            .map_err(|e| format!("HEALTH_CHECK_FAILED: {e}"))?;

        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!(
                "HEALTH_CHECK_FAILED: HTTP status {}",
                resp.status()
            ))
        }
    }

    pub async fn shutdown(&mut self) -> Result<(), String> {
        let _ = self.child.start_kill();
        let _ = tokio::time::timeout(Duration::from_secs(5), self.child.wait()).await;
        Ok(())
    }

    pub fn runtime_version() -> String {
        let bin = crate::runtime::binary("llama-server.exe");
        let mut cmd = std::process::Command::new(&bin);
        crate::process_control::hide_std_command(&mut cmd);
        match cmd.arg("--version").output() {
            Ok(out) => {
                let raw = format!(
                    "{}\n{}",
                    String::from_utf8_lossy(&out.stdout),
                    String::from_utf8_lossy(&out.stderr)
                );
                raw.lines()
                    .map(|l| l.trim())
                    .find(|l| !l.is_empty())
                    .unwrap_or("unknown")
                    .chars()
                    .take(120)
                    .collect()
            }
            Err(_) => "unknown".to_string(),
        }
    }

    /// Chat completion OpenAI-compatible con `usage` real.
    pub async fn complete(
        &self,
        context: &str,
        max_tokens: u32,
        temperature: f32,
        timeout_secs: u64,
    ) -> Result<SidecarCompletion, String> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(timeout_secs))
            .build()
            .map_err(|_| "EXECUTION_FAILED: http client".to_string())?;
        let payload = serde_json::json!({
            "model": self.model_id,
            "messages": [{ "role": "user", "content": context.trim() }],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": false,
            "response_format": { "type": "json_object" },
        });
        let response = client
            .post(format!("{}/v1/chat/completions", self.base_url))
            .bearer_auth(&self.api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    "TIMEOUT: sidecar inference timeout".to_string()
                } else {
                    "EXECUTION_FAILED: sidecar request failed".to_string()
                }
            })?;
        if !response.status().is_success() {
            return Err("EXECUTION_FAILED: sidecar rejected request".to_string());
        }
        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|_| "EXECUTION_FAILED: invalid sidecar JSON".to_string())?;
        let text = body
            .pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if text.is_empty() {
            return Err("EXECUTION_FAILED: empty sidecar response".to_string());
        }
        Ok(SidecarCompletion {
            text,
            prompt_tokens: body
                .pointer("/usage/prompt_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32),
            completion_tokens: body
                .pointer("/usage/completion_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32),
        })
    }
}

#[derive(Debug, Clone)]
pub struct SidecarCompletion {
    pub text: String,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
}

fn reserve_local_port() -> Result<u16, String> {
    std::net::TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|_| "LOAD_FAILED: no local port".to_string())
}

fn random_api_key() -> String {
    let mut bytes = [0_u8; 32];
    rand::fill(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_missing_weights_is_not_available() {
        let spec = SidecarSpec {
            model_id: "test/missing".to_string(),
            gguf_path: PathBuf::from("data/llm-models/does-not-exist.gguf"),
            expected_sha256: None,
            ctx_size: 4096,
            n_predict: 2048,
            use_gpu: false,
        };
        let err = spec.verify().unwrap_err();
        assert!(err.starts_with("NOT_AVAILABLE"));
    }

    #[test]
    fn test_qwen_weights_verify_ok() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("data")
            .join("llm-models")
            .join("qwen2.5-1.5b-instruct-q4_k_m.gguf");
        if !path.is_file() {
            return;
        }
        let spec = SidecarSpec {
            model_id: "Qwen/Qwen2.5-1.5B-Instruct-GGUF".to_string(),
            gguf_path: path,
            expected_sha256: Some(
                "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e".to_string(),
            ),
            ctx_size: 4096,
            n_predict: 2048,
            use_gpu: false,
        };
        assert!(spec.verify().is_ok());
    }

    #[test]
    fn test_wrong_hash_is_load_failed() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("data")
            .join("llm-models")
            .join("qwen2.5-1.5b-instruct-q4_k_m.gguf");
        if !path.is_file() {
            return;
        }
        let spec = SidecarSpec {
            model_id: "x".to_string(),
            gguf_path: path,
            expected_sha256: Some("0".repeat(64)),
            ctx_size: 4096,
            n_predict: 2048,
            use_gpu: false,
        };
        let err = spec.verify().unwrap_err();
        assert!(err.starts_with("LOAD_FAILED"));
    }
}
