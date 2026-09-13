use reqwest::header::RANGE;
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

const MANIFEST_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/local-llm-manifest.json"
));
const MAX_CONTEXT_CHARS: usize = 120_000;
const MAX_OUTPUT_TOKENS: u32 = 2_048;
const SIDECAR_START_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalLlmState {
    NotInstalled,
    Downloading,
    Verifying,
    Ready,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalLlmTask {
    Summary,
    Chat,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmStatus {
    pub state: LocalLlmState,
    pub model_id: String,
    pub model_revision: String,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub sha256: Option<String>,
    pub error_code: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmRequest {
    pub task: LocalLlmTask,
    pub context: String,
    pub max_output_tokens: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmResponse {
    pub text: String,
    pub model_id: String,
}

#[derive(Clone, Debug, Deserialize)]
struct LocalLlmManifest {
    schema_version: u32,
    model_id: String,
    model_revision: String,
    filename: String,
    download_url: String,
    expected_size: u64,
    sha256: String,
    license_spdx: String,
    license_url: String,
    sidecar_version: String,
    sidecar_executable: String,
    download_hosts: Vec<String>,
}

struct RunningServer {
    child: Child,
    base_url: String,
    api_key: String,
}

impl Drop for RunningServer {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

pub struct LocalLlmManager {
    manifest: LocalLlmManifest,
    status: Arc<Mutex<LocalLlmStatus>>,
    active_download: Arc<Mutex<bool>>,
    cancel_requested: Arc<AtomicBool>,
    server: Arc<Mutex<Option<RunningServer>>>,
}

impl LocalLlmManager {
    pub fn new() -> Result<Self, String> {
        let manifest = serde_json::from_str::<LocalLlmManifest>(MANIFEST_JSON)
            .map_err(|_| "local_llm_manifest_invalid".to_string())?;
        validate_manifest(&manifest)?;
        let status = LocalLlmStatus {
            state: LocalLlmState::NotInstalled,
            model_id: manifest.model_id.clone(),
            model_revision: manifest.model_revision.clone(),
            bytes_downloaded: 0,
            total_bytes: manifest.expected_size,
            sha256: None,
            error_code: None,
        };
        Ok(Self {
            manifest,
            status: Arc::new(Mutex::new(status)),
            active_download: Arc::new(Mutex::new(false)),
            cancel_requested: Arc::new(AtomicBool::new(false)),
            server: Arc::new(Mutex::new(None)),
        })
    }

    pub async fn status(&self) -> LocalLlmStatus {
        let path = self.model_path();
        if self.is_verified(&path).await {
            let ready = self.ready_status();
            *self.status.lock().await = ready.clone();
            return ready;
        }
        let mut current = self.status.lock().await.clone();
        if !matches!(
            current.state,
            LocalLlmState::Downloading | LocalLlmState::Verifying
        ) {
            if matches!(current.state, LocalLlmState::Failed) {
                current.bytes_downloaded = self.partial_size().await;
                return current;
            }
            current.state = LocalLlmState::NotInstalled;
            current.bytes_downloaded = self.partial_size().await;
            current.total_bytes = self.manifest.expected_size;
            current.sha256 = None;
            *self.status.lock().await = current.clone();
        }
        current
    }

    pub async fn ensure_model(&self, app: &AppHandle) -> Result<LocalLlmStatus, String> {
        if self.is_verified(&self.model_path()).await {
            return Ok(self.status().await);
        }
        let mut active = self.active_download.lock().await;
        if *active {
            return Ok(self.status().await);
        }
        *active = true;
        drop(active);
        self.cancel_requested.store(false, Ordering::SeqCst);
        let result = self.download_model(app).await;
        if let Err(error_code) = &result {
            let current = self.status.lock().await.clone();
            if !matches!(current.state, LocalLlmState::Failed) {
                self.set_status(
                    app,
                    LocalLlmStatus {
                        state: LocalLlmState::Failed,
                        model_id: self.manifest.model_id.clone(),
                        model_revision: self.manifest.model_revision.clone(),
                        bytes_downloaded: current.bytes_downloaded,
                        total_bytes: self.manifest.expected_size,
                        sha256: None,
                        error_code: Some(error_code.clone()),
                    },
                )
                .await;
            }
        }
        *self.active_download.lock().await = false;
        result
    }

    pub fn cancel_download(&self) {
        self.cancel_requested.store(true, Ordering::SeqCst);
    }

    pub async fn generate(
        &self,
        app: &AppHandle,
        request: LocalLlmRequest,
    ) -> Result<LocalLlmResponse, String> {
        validate_request(&request)?;
        self.ensure_model(app).await?;
        let server = self.ensure_server().await?;
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(180))
            .build()
            .map_err(|_| "local_llm_client_unavailable".to_string())?;
        let payload = json!({
            "model": self.manifest.model_id,
            "messages": [{
                "role": "user",
                "content": request.context.trim()
            }],
            "max_tokens": request.max_output_tokens,
            "temperature": 0.2,
            "stream": false
        });
        let response = client
            .post(format!("{}/v1/chat/completions", server.base_url))
            .bearer_auth(&server.api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|_| "local_llm_generation_failed".to_string());
        let response = match response {
            Ok(response) => response,
            Err(error) => {
                self.shutdown().await;
                return Err(error);
            }
        };
        if !response.status().is_success() {
            if response.status() == StatusCode::UNAUTHORIZED {
                self.shutdown().await;
            }
            return Err("local_llm_generation_rejected".to_string());
        }
        let payload = response
            .json::<CompletionResponse>()
            .await
            .map_err(|_| "local_llm_response_invalid".to_string())?;
        let text = payload
            .choices
            .into_iter()
            .next()
            .and_then(|choice| choice.message)
            .map(|message| message.content.trim().to_string())
            .filter(|text| !text.is_empty())
            .ok_or_else(|| "local_llm_response_empty".to_string())?;
        Ok(LocalLlmResponse {
            text,
            model_id: self.manifest.model_id.clone(),
        })
    }

    pub async fn shutdown(&self) {
        let running = self.server.lock().await.take();
        if let Some(mut running) = running {
            let _ = running.child.kill().await;
            let _ = tokio::time::timeout(Duration::from_secs(3), running.child.wait()).await;
        }
    }

    fn model_path(&self) -> PathBuf {
        crate::db::data_dir_path()
            .join("llm-models")
            .join(&self.manifest.filename)
    }

    fn marker_path(&self) -> PathBuf {
        PathBuf::from(format!("{}.verified", self.model_path().display()))
    }

    fn partial_path(&self) -> PathBuf {
        PathBuf::from(format!("{}.partial", self.model_path().display()))
    }

    fn ready_status(&self) -> LocalLlmStatus {
        LocalLlmStatus {
            state: LocalLlmState::Ready,
            model_id: self.manifest.model_id.clone(),
            model_revision: self.manifest.model_revision.clone(),
            bytes_downloaded: self.manifest.expected_size,
            total_bytes: self.manifest.expected_size,
            sha256: Some(self.manifest.sha256.clone()),
            error_code: None,
        }
    }

    async fn partial_size(&self) -> u64 {
        tokio::fs::metadata(self.partial_path())
            .await
            .map(|metadata| metadata.len().min(self.manifest.expected_size))
            .unwrap_or(0)
    }

    async fn is_verified(&self, model_path: &Path) -> bool {
        let Ok(metadata) = tokio::fs::metadata(model_path).await else {
            return false;
        };
        if metadata.len() != self.manifest.expected_size {
            return false;
        }
        tokio::fs::read_to_string(self.marker_path())
            .await
            .map(|value| value.trim() == self.manifest.sha256)
            .unwrap_or(false)
    }

    async fn download_model(&self, app: &AppHandle) -> Result<LocalLlmStatus, String> {
        let model_path = self.model_path();
        let partial_path = self.partial_path();
        let parent = model_path
            .parent()
            .ok_or_else(|| "local_llm_storage_unavailable".to_string())?;
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|_| "local_llm_storage_unavailable".to_string())?;

        let mut offset = self.partial_size().await;
        if offset >= self.manifest.expected_size {
            offset = 0;
            let _ = tokio::fs::remove_file(&partial_path).await;
        }
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::limited(5))
            .user_agent("Pulsaria local model downloader")
            .build()
            .map_err(|_| "local_llm_client_unavailable".to_string())?;
        let mut request = client.get(&self.manifest.download_url);
        if offset > 0 {
            request = request.header(RANGE, format!("bytes={offset}-"));
        }
        let response = request
            .send()
            .await
            .map_err(|_| "local_llm_download_network".to_string())?;
        validate_download_host(response.url(), &self.manifest.download_hosts)?;
        if !response.status().is_success() {
            return self.fail(app, "local_llm_download_rejected", offset).await;
        }
        let append = offset > 0 && response.status() == StatusCode::PARTIAL_CONTENT;
        if !append {
            offset = 0;
        }
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(&partial_path)
            .await
            .map_err(|_| "local_llm_storage_unavailable".to_string())?;
        let mut downloaded = offset;
        self.set_status(app, self.downloading_status(downloaded))
            .await;
        let mut last_emit = std::time::Instant::now();
        let mut response = response;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "local_llm_download_network".to_string())?
        {
            if self.cancel_requested.load(Ordering::SeqCst) {
                return self
                    .fail(app, "local_llm_download_cancelled", downloaded)
                    .await;
            }
            file.write_all(&chunk)
                .await
                .map_err(|_| "local_llm_storage_unavailable".to_string())?;
            downloaded = downloaded.saturating_add(chunk.len() as u64);
            if downloaded > self.manifest.expected_size {
                let _ = tokio::fs::remove_file(&partial_path).await;
                return self.fail(app, "local_llm_size_mismatch", downloaded).await;
            }
            if last_emit.elapsed() >= Duration::from_millis(250) {
                self.set_status(app, self.downloading_status(downloaded))
                    .await;
                last_emit = std::time::Instant::now();
            }
        }
        file.flush().await.ok();
        file.sync_all().await.ok();
        if downloaded != self.manifest.expected_size {
            return self.fail(app, "local_llm_size_mismatch", downloaded).await;
        }

        self.set_status(
            app,
            LocalLlmStatus {
                state: LocalLlmState::Verifying,
                model_id: self.manifest.model_id.clone(),
                model_revision: self.manifest.model_revision.clone(),
                bytes_downloaded: downloaded,
                total_bytes: self.manifest.expected_size,
                sha256: None,
                error_code: None,
            },
        )
        .await;
        let actual_hash = match sha256_file(&partial_path, &self.cancel_requested).await {
            Ok(hash) => hash,
            Err(code) => return self.fail(app, code, downloaded).await,
        };
        if actual_hash != self.manifest.sha256 {
            let _ = tokio::fs::remove_file(&partial_path).await;
            return self.fail(app, "local_llm_hash_mismatch", downloaded).await;
        }
        if self.cancel_requested.load(Ordering::SeqCst) {
            return self
                .fail(app, "local_llm_download_cancelled", downloaded)
                .await;
        }
        let _ = tokio::fs::remove_file(&model_path).await;
        tokio::fs::rename(&partial_path, &model_path)
            .await
            .map_err(|_| "local_llm_storage_unavailable".to_string())?;
        let marker_tmp = PathBuf::from(format!("{}.tmp", self.marker_path().display()));
        tokio::fs::write(&marker_tmp, format!("{}\n", self.manifest.sha256))
            .await
            .map_err(|_| "local_llm_storage_unavailable".to_string())?;
        let _ = tokio::fs::remove_file(self.marker_path()).await;
        tokio::fs::rename(marker_tmp, self.marker_path())
            .await
            .map_err(|_| "local_llm_storage_unavailable".to_string())?;
        let ready = self.ready_status();
        self.set_status(app, ready.clone()).await;
        Ok(ready)
    }

    fn downloading_status(&self, downloaded: u64) -> LocalLlmStatus {
        LocalLlmStatus {
            state: LocalLlmState::Downloading,
            model_id: self.manifest.model_id.clone(),
            model_revision: self.manifest.model_revision.clone(),
            bytes_downloaded: downloaded,
            total_bytes: self.manifest.expected_size,
            sha256: None,
            error_code: None,
        }
    }

    async fn fail(
        &self,
        app: &AppHandle,
        error_code: &str,
        downloaded: u64,
    ) -> Result<LocalLlmStatus, String> {
        let status = LocalLlmStatus {
            state: LocalLlmState::Failed,
            model_id: self.manifest.model_id.clone(),
            model_revision: self.manifest.model_revision.clone(),
            bytes_downloaded: downloaded.min(self.manifest.expected_size),
            total_bytes: self.manifest.expected_size,
            sha256: None,
            error_code: Some(error_code.to_string()),
        };
        self.set_status(app, status).await;
        Err(error_code.to_string())
    }

    async fn set_status(&self, app: &AppHandle, status: LocalLlmStatus) {
        *self.status.lock().await = status.clone();
        let _ = app.emit("local-llm-progress", status);
    }

    async fn ensure_server(&self) -> Result<ServerInfo, String> {
        if let Some(server) = self.server.lock().await.as_ref() {
            return Ok(ServerInfo {
                base_url: server.base_url.clone(),
                api_key: server.api_key.clone(),
            });
        }
        let executable = resolve_sidecar(&self.manifest.sidecar_executable)
            .ok_or_else(|| "local_llm_sidecar_missing".to_string())?;
        let port = reserve_local_port()?;
        let api_key = random_api_key();
        let model_path = self.model_path();
        let mut child = Command::new(&executable)
            .arg("--model")
            .arg(model_path)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(port.to_string())
            .arg("--api-key")
            .arg(&api_key)
            .arg("--no-webui")
            .arg("--ctx-size")
            .arg("4096")
            .arg("--n-predict")
            .arg(MAX_OUTPUT_TOKENS.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .current_dir(executable.parent().unwrap_or_else(|| Path::new(".")))
            .spawn()
            .map_err(|_| "local_llm_sidecar_start_failed".to_string())?;
        let base_url = format!("http://127.0.0.1:{port}");
        let client = Client::builder()
            .connect_timeout(Duration::from_millis(500))
            .timeout(Duration::from_millis(500))
            .build()
            .map_err(|_| "local_llm_client_unavailable".to_string())?;
        let started = tokio::time::Instant::now();
        loop {
            if child
                .try_wait()
                .map_err(|_| "local_llm_sidecar_unavailable".to_string())?
                .is_some()
            {
                return Err("local_llm_sidecar_unavailable".to_string());
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
                    let server = RunningServer {
                        child,
                        base_url: base_url.clone(),
                        api_key: api_key.clone(),
                    };
                    *self.server.lock().await = Some(server);
                    return Ok(ServerInfo { base_url, api_key });
                }
            }
            if started.elapsed() >= SIDECAR_START_TIMEOUT {
                let _ = child.kill().await;
                let _ = child.wait().await;
                return Err("local_llm_sidecar_timeout".to_string());
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }
}

#[derive(Clone)]
struct ServerInfo {
    base_url: String,
    api_key: String,
}

#[derive(Debug, Deserialize)]
struct CompletionResponse {
    choices: Vec<CompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct CompletionChoice {
    message: Option<CompletionMessage>,
}

#[derive(Debug, Deserialize)]
struct CompletionMessage {
    content: String,
}

fn validate_manifest(manifest: &LocalLlmManifest) -> Result<(), String> {
    if manifest.schema_version != 1
        || manifest.model_id.trim().is_empty()
        || manifest.model_revision.len() != 40
        || !manifest
            .model_revision
            .chars()
            .all(|c| c.is_ascii_hexdigit())
        || manifest.expected_size == 0
        || manifest.sha256.len() != 64
        || !manifest.sha256.chars().all(|c| c.is_ascii_hexdigit())
        || manifest.license_spdx != "Apache-2.0"
        || manifest.license_url.trim().is_empty()
        || manifest.sidecar_version.trim().is_empty()
        || manifest.sidecar_executable.contains('/')
        || manifest.sidecar_executable.contains('\\')
        || manifest.filename
            != Path::new(&manifest.filename)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
        || manifest.filename.trim().is_empty()
    {
        return Err("local_llm_manifest_invalid".to_string());
    }
    let url =
        Url::parse(&manifest.download_url).map_err(|_| "local_llm_manifest_invalid".to_string())?;
    if url.scheme() != "https"
        || !manifest
            .download_hosts
            .iter()
            .any(|host| host == url.host_str().unwrap_or_default())
    {
        return Err("local_llm_manifest_host_invalid".to_string());
    }
    Ok(())
}

fn validate_download_host(url: &Url, allowed_hosts: &[String]) -> Result<(), String> {
    let host = url.host_str().unwrap_or_default();
    if url.scheme() != "https"
        || !allowed_hosts
            .iter()
            .any(|allowed| host == allowed || host.ends_with(&format!(".{allowed}")))
    {
        return Err("local_llm_download_host_rejected".to_string());
    }
    Ok(())
}

fn validate_request(request: &LocalLlmRequest) -> Result<(), String> {
    if request.context.trim().is_empty() {
        return Err("local_llm_context_empty".to_string());
    }
    if request.context.chars().count() > MAX_CONTEXT_CHARS {
        return Err("local_llm_context_too_large".to_string());
    }
    if request.max_output_tokens == 0 || request.max_output_tokens > MAX_OUTPUT_TOKENS {
        return Err("local_llm_output_limit_invalid".to_string());
    }
    Ok(())
}

async fn sha256_file(path: &Path, cancel: &AtomicBool) -> Result<String, &'static str> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|_| "local_llm_storage_unavailable")?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err("local_llm_download_cancelled");
        }
        let count = file
            .read(&mut buffer)
            .await
            .map_err(|_| "local_llm_storage_unavailable")?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn resolve_sidecar(executable: &str) -> Option<PathBuf> {
    let candidate = crate::runtime::binary(executable);
    candidate.is_file().then_some(candidate)
}

fn reserve_local_port() -> Result<u16, String> {
    std::net::TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|_| "local_llm_port_unavailable".to_string())
}

fn random_api_key() -> String {
    let mut bytes = [0_u8; 32];
    rand::fill(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::{
        validate_manifest, validate_request, LocalLlmManifest, LocalLlmRequest, LocalLlmTask,
        MANIFEST_JSON,
    };

    #[test]
    fn bundled_manifest_is_pinned_and_licensed() {
        let manifest: LocalLlmManifest =
            serde_json::from_str(MANIFEST_JSON).expect("manifest JSON");
        validate_manifest(&manifest).expect("pinned manifest");
        assert_eq!(manifest.license_spdx, "Apache-2.0");
        assert_eq!(manifest.expected_size, 1_117_320_736);
        assert_eq!(manifest.sha256.len(), 64);
    }

    #[test]
    fn request_limits_reject_empty_or_oversized_context() {
        let empty = LocalLlmRequest {
            task: LocalLlmTask::Chat,
            context: " ".into(),
            max_output_tokens: 32,
        };
        assert_eq!(
            validate_request(&empty).unwrap_err(),
            "local_llm_context_empty"
        );
        let oversized = LocalLlmRequest {
            task: LocalLlmTask::Chat,
            context: "x".repeat(120_001),
            max_output_tokens: 32,
        };
        assert_eq!(
            validate_request(&oversized).unwrap_err(),
            "local_llm_context_too_large"
        );
    }
}
