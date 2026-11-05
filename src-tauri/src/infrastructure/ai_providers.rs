//! Native, task-routed text generation for local and OpenAI-compatible models.
//!
//! Provider metadata is stored in a small settings file. API keys are resolved
//! only from Windows Credential Manager (Gemini also accepts legacy env vars).

use crate::infrastructure::local_llm::{
    LocalLlmManager, LocalLlmRequest, LocalLlmResponse, LocalLlmTask,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::net::IpAddr;
use std::path::PathBuf;
use std::time::Duration;
use tauri::AppHandle;
use url::Url;

const CONFIG_FILE: &str = "ai-providers.json";
const MAX_PROMPT_CHARS: usize = 120_000;
const MAX_OUTPUT_TOKENS: u32 = 8_192;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);
pub const LOCAL_PROFILE_ID: &str = "local-llama";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiProviderKind {
    OpenAi,
    Gemini,
    OpenRouter,
    Groq,
    OpenAiCompatible,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderProfile {
    pub profile_id: String,
    pub display_name: String,
    pub provider_kind: AiProviderKind,
    pub base_url: String,
    pub model_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderProfileInput {
    pub profile_id: Option<String>,
    pub display_name: String,
    pub provider_kind: AiProviderKind,
    pub base_url: String,
    pub model_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiOperation {
    AssistantChat,
    SearchSynthesis,
    RecipeExtraction,
    EditorialCompilation,
}

impl AiOperation {
    pub fn label(&self) -> &'static str {
        match self {
            Self::AssistantChat => "asistente y búsqueda",
            Self::SearchSynthesis => "síntesis de búsqueda",
            Self::RecipeExtraction => "extracción de recetas",
            Self::EditorialCompilation => "compilación editorial",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderAssignments {
    pub assistant_chat: String,
    pub search_synthesis: String,
    pub recipe_extraction: String,
    pub editorial_compilation: String,
}

impl Default for AiProviderAssignments {
    fn default() -> Self {
        Self {
            assistant_chat: LOCAL_PROFILE_ID.into(),
            search_synthesis: "gemini".into(),
            recipe_extraction: LOCAL_PROFILE_ID.into(),
            editorial_compilation: "gemini".into(),
        }
    }
}

impl AiProviderAssignments {
    pub fn get(&self, operation: &AiOperation) -> &str {
        match operation {
            AiOperation::AssistantChat => &self.assistant_chat,
            AiOperation::SearchSynthesis => &self.search_synthesis,
            AiOperation::RecipeExtraction => &self.recipe_extraction,
            AiOperation::EditorialCompilation => &self.editorial_compilation,
        }
    }

    pub fn set(&mut self, operation: AiOperation, profile_id: String) {
        match operation {
            AiOperation::AssistantChat => self.assistant_chat = profile_id,
            AiOperation::SearchSynthesis => self.search_synthesis = profile_id,
            AiOperation::RecipeExtraction => self.recipe_extraction = profile_id,
            AiOperation::EditorialCompilation => self.editorial_compilation = profile_id,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    #[serde(default)]
    pub profiles: Vec<AiProviderProfile>,
    #[serde(default)]
    pub assignments: AiProviderAssignments,
}

impl Default for AiProviderConfig {
    fn default() -> Self {
        Self {
            profiles: vec![AiProviderProfile {
                profile_id: "gemini".into(),
                display_name: "Google Gemini".into(),
                provider_kind: AiProviderKind::Gemini,
                base_url: "https://generativelanguage.googleapis.com/v1beta/openai".into(),
                model_id: "gemini-2.5-flash".into(),
            }],
            assignments: AiProviderAssignments::default(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderProfileView {
    #[serde(flatten)]
    pub profile: AiProviderProfile,
    pub has_api_key: bool,
    pub key_source: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderPreset {
    pub provider_kind: AiProviderKind,
    pub display_name: &'static str,
    pub base_url: &'static str,
    pub default_model_id: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfigView {
    pub profiles: Vec<AiProviderProfileView>,
    pub assignments: AiProviderAssignments,
    pub presets: Vec<AiProviderPreset>,
    pub local_profile_id: &'static str,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTextRequest {
    pub operation: AiOperation,
    pub prompt: String,
    pub max_output_tokens: u32,
    #[serde(default)]
    pub expected_profile_id: Option<String>,
    #[serde(default)]
    pub analysis_depth: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTextResponse {
    pub text: String,
    pub provider_id: String,
    pub provider_name: String,
    pub model_id: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Option<Vec<ChatCompletionChoice>>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChoice {
    message: Option<ChatCompletionMessage>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionMessage {
    content: Option<Value>,
}

fn config_path() -> PathBuf {
    crate::db::data_dir_path().join(CONFIG_FILE)
}

pub fn load_config() -> Result<AiProviderConfig, String> {
    let path = config_path();
    if !path.exists() {
        return Ok(AiProviderConfig::default());
    }
    let contents = fs::read_to_string(path)
        .map_err(|_| "No se pudieron leer los ajustes de proveedores de IA.".to_string())?;
    let config: AiProviderConfig = serde_json::from_str(&contents)
        .map_err(|_| "Los ajustes de proveedores de IA no tienen un formato válido.".to_string())?;
    validate_config(&config)?;
    Ok(config)
}

pub fn save_config(config: &AiProviderConfig) -> Result<(), String> {
    validate_config(config)?;
    let path = config_path();
    let parent = path
        .parent()
        .ok_or_else(|| "No se pudo resolver la carpeta de ajustes.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "No se pudo preparar la carpeta de ajustes de IA.".to_string())?;
    let bytes = serde_json::to_vec_pretty(config)
        .map_err(|_| "No se pudieron codificar los ajustes de IA.".to_string())?;
    let temporary = path.with_extension(format!("json.{}.tmp", std::process::id()));
    fs::write(&temporary, bytes)
        .map_err(|_| "No se pudieron escribir los ajustes de proveedores de IA.".to_string())?;
    if !path.exists() {
        return fs::rename(&temporary, &path)
            .map_err(|_| "No se pudieron activar los ajustes de proveedores de IA.".to_string());
    }
    let backup = path.with_extension("json.previous");
    if backup.exists() {
        fs::remove_file(&backup)
            .map_err(|_| "No se pudo preparar el reemplazo de los ajustes de IA.".to_string())?;
    }
    fs::rename(&path, &backup)
        .map_err(|_| "No se pudieron respaldar los ajustes actuales de IA.".to_string())?;
    match fs::rename(&temporary, &path) {
        Ok(()) => {
            let _ = fs::remove_file(backup);
            Ok(())
        }
        Err(_) => {
            let _ = fs::rename(&backup, &path);
            let _ = fs::remove_file(temporary);
            Err("No se pudieron activar los ajustes de proveedores de IA.".into())
        }
    }
}

pub fn provider_presets() -> Vec<AiProviderPreset> {
    vec![
        AiProviderPreset {
            provider_kind: AiProviderKind::OpenAi,
            display_name: "OpenAI",
            base_url: "https://api.openai.com/v1",
            default_model_id: "",
        },
        AiProviderPreset {
            provider_kind: AiProviderKind::Gemini,
            display_name: "Google Gemini",
            base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
            default_model_id: "gemini-2.5-flash",
        },
        AiProviderPreset {
            provider_kind: AiProviderKind::OpenRouter,
            display_name: "OpenRouter",
            base_url: "https://openrouter.ai/api/v1",
            default_model_id: "openrouter/free",
        },
        AiProviderPreset {
            provider_kind: AiProviderKind::Groq,
            display_name: "Groq",
            base_url: "https://api.groq.com/openai/v1",
            default_model_id: "",
        },
        AiProviderPreset {
            provider_kind: AiProviderKind::OpenAiCompatible,
            display_name: "API compatible personalizada",
            base_url: "",
            default_model_id: "",
        },
    ]
}

pub fn config_view(config: AiProviderConfig) -> Result<AiProviderConfigView, String> {
    let mut profiles = Vec::with_capacity(config.profiles.len());
    for profile in config.profiles {
        let key_source = profile_key_source(&profile)?;
        profiles.push(AiProviderProfileView {
            has_api_key: key_source != "none",
            key_source,
            profile,
        });
    }
    Ok(AiProviderConfigView {
        profiles,
        assignments: config.assignments,
        presets: provider_presets(),
        local_profile_id: LOCAL_PROFILE_ID,
    })
}

pub fn validate_profile(profile: &AiProviderProfile) -> Result<(), String> {
    if !valid_profile_id(&profile.profile_id) {
        return Err("El identificador del perfil no es válido.".into());
    }
    if profile.display_name.trim().is_empty() || profile.display_name.chars().count() > 80 {
        return Err("Escribe un nombre de perfil de hasta 80 caracteres.".into());
    }
    if profile.model_id.chars().count() > 160 {
        return Err("El identificador del modelo supera el tamaño admitido.".into());
    }
    validate_base_url(&profile.base_url)?;
    Ok(())
}

fn validate_config(config: &AiProviderConfig) -> Result<(), String> {
    let mut ids = std::collections::HashSet::new();
    for profile in &config.profiles {
        validate_profile(profile)?;
        if profile.profile_id == LOCAL_PROFILE_ID || !ids.insert(profile.profile_id.as_str()) {
            return Err("Los identificadores de perfiles deben ser únicos.".into());
        }
    }
    for assignment in [
        &config.assignments.assistant_chat,
        &config.assignments.search_synthesis,
        &config.assignments.recipe_extraction,
        &config.assignments.editorial_compilation,
    ] {
        if !valid_profile_id(assignment) {
            return Err("Una asignación de proveedor contiene un identificador inválido.".into());
        }
    }
    Ok(())
}

fn valid_profile_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

pub fn validate_base_url(raw: &str) -> Result<Url, String> {
    let parsed =
        Url::parse(raw.trim()).map_err(|_| "La URL del proveedor no es válida.".to_string())?;
    if !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err("La URL no puede incluir credenciales, parámetros ni fragmentos.".into());
    }
    match parsed.scheme() {
        "https" => {}
        "http" if is_loopback_url(&parsed) => {}
        "http" => return Err("Las URLs HTTP solo se permiten para servicios locales.".into()),
        _ => return Err("El proveedor debe usar HTTPS o un servicio HTTP local.".into()),
    }
    if parsed.host_str().is_none() {
        return Err("La URL del proveedor debe incluir un host.".into());
    }
    Ok(parsed)
}

fn is_loopback_url(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") {
        return true;
    }
    host.parse::<IpAddr>()
        .is_ok_and(|address| address.is_loopback())
}

pub fn view_for_config(config: &AiProviderConfig) -> Result<AiProviderConfigView, String> {
    config_view(config.clone())
}

pub fn save_profile(
    config: &mut AiProviderConfig,
    profile: AiProviderProfile,
) -> Result<(), String> {
    validate_profile(&profile)?;
    if profile.profile_id == LOCAL_PROFILE_ID {
        return Err("El proveedor local integrado no se puede reemplazar.".into());
    }
    if let Some(existing) = config
        .profiles
        .iter_mut()
        .find(|existing| existing.profile_id == profile.profile_id)
    {
        *existing = profile;
    } else {
        config.profiles.push(profile);
    }
    validate_config(config)
}

pub fn set_assignment(
    config: &mut AiProviderConfig,
    operation: AiOperation,
    profile_id: String,
) -> Result<(), String> {
    if profile_id != LOCAL_PROFILE_ID
        && !config
            .profiles
            .iter()
            .any(|profile| profile.profile_id == profile_id)
    {
        return Err("Conecta primero el perfil que quieres asignar.".into());
    }
    config.assignments.set(operation, profile_id);
    validate_config(config)
}

pub fn delete_profile(config: &mut AiProviderConfig, profile_id: &str) -> Result<(), String> {
    if profile_id == LOCAL_PROFILE_ID {
        return Err("El modelo local integrado no se puede eliminar.".into());
    }
    let original_len = config.profiles.len();
    config
        .profiles
        .retain(|profile| profile.profile_id != profile_id);
    if config.profiles.len() == original_len {
        return Err("No se encontró el perfil seleccionado.".into());
    }
    // Keep assigned IDs unchanged so generation fails clearly until the user
    // selects another profile; never silently switch local/cloud providers.
    validate_config(config)
}

pub fn api_key_for_profile(profile: &AiProviderProfile) -> Result<Option<String>, String> {
    if let Some(secret) = crate::infrastructure::secret_store::load(&profile.profile_id)? {
        if !secret.is_empty() {
            return Ok(Some(secret));
        }
    }
    if profile.profile_id == "gemini" {
        return Ok(legacy_gemini_environment_key());
    }
    Ok(None)
}

fn profile_key_source(profile: &AiProviderProfile) -> Result<&'static str, String> {
    if crate::infrastructure::secret_store::load(&profile.profile_id)?
        .is_some_and(|key| !key.is_empty())
    {
        return Ok("credential_manager");
    }
    if profile.profile_id == "gemini" && legacy_gemini_environment_key().is_some() {
        return Ok("environment");
    }
    Ok("none")
}

fn legacy_gemini_environment_key() -> Option<String> {
    ["PULSAR_GOOGLE_API_KEY", "GOOGLE_API_KEY"]
        .into_iter()
        .filter_map(|name| std::env::var(name).ok())
        .map(|value| value.trim().to_string())
        .find(|value| !value.is_empty())
}

pub fn save_api_key(profile_id: &str, api_key: &str) -> Result<(), String> {
    if api_key.trim().is_empty() {
        crate::infrastructure::secret_store::remove(profile_id)
    } else {
        crate::infrastructure::secret_store::save(profile_id, api_key.trim())
    }
}

pub fn remove_api_key(profile_id: &str) -> Result<(), String> {
    crate::infrastructure::secret_store::remove(profile_id)
}

pub async fn list_models(profile: &AiProviderProfile) -> Result<Vec<String>, String> {
    validate_profile(profile)?;
    let mut request = client()?.get(endpoint(&profile.base_url, "models"));
    if let Some(api_key) = api_key_for_profile(profile)? {
        request = request.bearer_auth(api_key);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "No se pudo consultar la lista de modelos del proveedor.".to_string())?;
    if !response.status().is_success() {
        return Err(status_error(response.status().as_u16()));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|_| "El proveedor devolvió una lista de modelos ilegible.".to_string())?;
    let mut ids = body
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|model| model.get("id").and_then(Value::as_str))
        .filter(|id| !id.trim().is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return Err(
            "Este endpoint no publicó modelos. Puedes escribir el identificador manualmente."
                .into(),
        );
    }
    Ok(ids)
}

pub async fn generate_for_operation(
    config: &AiProviderConfig,
    operation: AiOperation,
    prompt: &str,
    max_output_tokens: u32,
    analysis_depth: Option<&str>,
    local_llm: &LocalLlmManager,
    app_handle: &AppHandle,
) -> Result<AiTextResponse, String> {
    let profile_id = config.assignments.get(&operation);
    generate_for_profile(
        config,
        profile_id,
        prompt,
        max_output_tokens,
        analysis_depth,
        None,
        local_llm,
        Some(app_handle),
    )
    .await
}

pub async fn generate_structured_for_operation(
    config: &AiProviderConfig,
    operation: AiOperation,
    prompt: &str,
    max_output_tokens: u32,
    response_format: Option<Value>,
    local_llm: &LocalLlmManager,
) -> Result<AiTextResponse, String> {
    let profile_id = config.assignments.get(&operation);
    generate_for_profile(
        config,
        profile_id,
        prompt,
        max_output_tokens,
        None,
        response_format,
        local_llm,
        None,
    )
    .await
}

pub async fn test_profile(
    profile: &AiProviderProfile,
    local_llm: &LocalLlmManager,
    app_handle: &AppHandle,
) -> Result<String, String> {
    if profile.model_id.trim().is_empty() {
        return Err("Selecciona o escribe el modelo antes de probar la conexión.".into());
    }
    let config = AiProviderConfig {
        profiles: vec![profile.clone()],
        assignments: AiProviderAssignments::default(),
    };
    let response = generate_for_profile(
        &config,
        &profile.profile_id,
        "Responde únicamente con: Pulsaria OK",
        12,
        None,
        None,
        local_llm,
        Some(app_handle),
    )
    .await?;
    Ok(format!("Conectado · {}", response.model_id))
}

async fn generate_for_profile(
    config: &AiProviderConfig,
    profile_id: &str,
    prompt: &str,
    max_output_tokens: u32,
    analysis_depth: Option<&str>,
    response_format: Option<Value>,
    local_llm: &LocalLlmManager,
    app_handle: Option<&AppHandle>,
) -> Result<AiTextResponse, String> {
    validate_prompt(prompt, max_output_tokens)?;
    if profile_id == LOCAL_PROFILE_ID {
        let max_tokens = max_output_tokens.min(2_048);
        let request = LocalLlmRequest {
            task: LocalLlmTask::Chat,
            context: prompt.trim().to_string(),
            max_output_tokens: max_tokens,
            analysis_depth: analysis_depth.map(str::to_string),
            response_format,
            temperature: Some(0.2),
        };
        let response = if let Some(app) = app_handle {
            local_llm.generate(app, request).await?
        } else {
            let status = local_llm.status().await;
            if !matches!(
                status.state,
                crate::infrastructure::local_llm::LocalLlmState::Ready
            ) {
                return Err(
                    "El modelo local aún no está preparado. Descárgalo desde Ajustes → IA.".into(),
                );
            }
            local_llm.generate_sidecar_request(request).await?
        };
        return Ok(local_response(response));
    }

    let profile = config
        .profiles
        .iter()
        .find(|profile| profile.profile_id == profile_id)
        .ok_or_else(|| {
            "El perfil asignado ya no existe. Elige otro proveedor en Ajustes → IA.".to_string()
        })?;
    validate_profile(profile)?;
    if profile.model_id.trim().is_empty() {
        return Err(format!(
            "Selecciona un modelo para {} en Ajustes → IA.",
            profile.display_name
        ));
    }
    let api_key = api_key_for_profile(profile)?;
    if api_key.is_none() && !is_loopback_url(&validate_base_url(&profile.base_url)?) {
        return Err(format!(
            "Agrega la clave de API de {} en Ajustes → IA.",
            profile.display_name
        ));
    }
    let text = complete(
        profile,
        api_key.as_deref(),
        prompt,
        max_output_tokens,
        response_format,
    )
    .await?;
    Ok(AiTextResponse {
        text,
        provider_id: profile.profile_id.clone(),
        provider_name: profile.display_name.clone(),
        model_id: profile.model_id.clone(),
    })
}

fn local_response(response: LocalLlmResponse) -> AiTextResponse {
    AiTextResponse {
        text: response.text,
        provider_id: LOCAL_PROFILE_ID.into(),
        provider_name: "Llama.cpp local".into(),
        model_id: response.model_id,
    }
}

fn validate_prompt(prompt: &str, max_output_tokens: u32) -> Result<(), String> {
    if prompt.trim().is_empty() {
        return Err("No se puede enviar un prompt vacío.".into());
    }
    if prompt.chars().count() > MAX_PROMPT_CHARS {
        return Err(format!(
            "El contexto supera el límite de {MAX_PROMPT_CHARS} caracteres."
        ));
    }
    if !(1..=MAX_OUTPUT_TOKENS).contains(&max_output_tokens) {
        return Err(format!(
            "El límite de salida debe estar entre 1 y {MAX_OUTPUT_TOKENS} tokens."
        ));
    }
    Ok(())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "No se pudo preparar la conexión con el proveedor.".into())
}

fn endpoint(base_url: &str, leaf: &str) -> String {
    format!(
        "{}/{}",
        base_url.trim_end_matches('/'),
        leaf.trim_start_matches('/')
    )
}

async fn complete(
    profile: &AiProviderProfile,
    api_key: Option<&str>,
    prompt: &str,
    max_output_tokens: u32,
    response_format: Option<Value>,
) -> Result<String, String> {
    let mut request = client()?.post(endpoint(&profile.base_url, "chat/completions"));
    if let Some(api_key) = api_key {
        request = request.bearer_auth(api_key);
    }
    let payload = chat_request_payload(profile, prompt, max_output_tokens, response_format);
    let response = request.json(&payload).send().await.map_err(|error| {
        if error.is_timeout() {
            "El proveedor agotó el tiempo de espera. Inténtalo de nuevo.".to_string()
        } else {
            "No se pudo contactar al proveedor. Revisa la URL y tu conexión.".to_string()
        }
    })?;
    if !response.status().is_success() {
        return Err(status_error(response.status().as_u16()));
    }
    let body: ChatCompletionResponse = response
        .json()
        .await
        .map_err(|_| "El proveedor devolvió una respuesta ilegible.".to_string())?;
    let text = body
        .choices
        .unwrap_or_default()
        .into_iter()
        .filter_map(|choice| choice.message)
        .filter_map(|message| message.content)
        .find_map(content_text)
        .filter(|text| !text.trim().is_empty())
        .ok_or_else(|| "El proveedor devolvió una respuesta vacía.".to_string())?;
    Ok(text)
}

fn chat_request_payload(
    profile: &AiProviderProfile,
    prompt: &str,
    max_output_tokens: u32,
    response_format: Option<Value>,
) -> Value {
    let mut payload = serde_json::json!({
        "model": profile.model_id,
        "messages": [{ "role": "user", "content": prompt.trim() }],
        "stream": false
    });
    let token_limit_field = match &profile.provider_kind {
        AiProviderKind::OpenAi | AiProviderKind::Groq => "max_completion_tokens",
        AiProviderKind::Gemini | AiProviderKind::OpenRouter | AiProviderKind::OpenAiCompatible => {
            "max_tokens"
        }
    };
    payload[token_limit_field] = serde_json::json!(max_output_tokens);
    if let Some(response_format) = response_format {
        payload["response_format"] = response_format;
    }
    payload
}

fn content_text(value: Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text),
        Value::Array(parts) => {
            let text = parts
                .into_iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str).map(str::to_string))
                .collect::<Vec<_>>()
                .join("");
            (!text.is_empty()).then_some(text)
        }
        _ => None,
    }
}

fn status_error(status: u16) -> String {
    match status {
        401 | 403 => "El proveedor rechazó la clave o los permisos. Revísalos en Ajustes → IA.".into(),
        400 | 404 => "El proveedor rechazó el modelo o el formato de la solicitud. Revisa la compatibilidad del endpoint y el identificador del modelo.".into(),
        429 => "El proveedor alcanzó su límite o cuota. Espera o revisa tu cuenta.".into(),
        500..=599 => format!("El proveedor informó un error temporal (HTTP {status})."),
        _ => format!("El proveedor rechazó la solicitud (HTTP {status})."),
    }
}

pub fn profile_status(config: &AiProviderConfig, profile_id: &str) -> Result<bool, String> {
    if profile_id == LOCAL_PROFILE_ID {
        return Ok(true);
    }
    let Some(profile) = config
        .profiles
        .iter()
        .find(|profile| profile.profile_id == profile_id)
    else {
        return Ok(false);
    };
    Ok(api_key_for_profile(profile)?.is_some()
        || is_loopback_url(&validate_base_url(&profile.base_url)?))
}

pub fn model_metadata(
    config: &AiProviderConfig,
    operation: &AiOperation,
    local_llm: &LocalLlmManager,
) -> crate::domain::semantic::ModelMetadata {
    let profile_id = config.assignments.get(operation);
    if profile_id == LOCAL_PROFILE_ID {
        return local_llm.model_metadata();
    }
    if let Some(profile) = config
        .profiles
        .iter()
        .find(|profile| profile.profile_id == profile_id)
    {
        return crate::domain::semantic::ModelMetadata {
            model_id: if profile.model_id.is_empty() {
                "model-not-selected".into()
            } else {
                profile.model_id.clone()
            },
            model_provider: match &profile.provider_kind {
                AiProviderKind::OpenAi => "openai",
                AiProviderKind::Gemini => "gemini",
                AiProviderKind::OpenRouter => "openrouter",
                AiProviderKind::Groq => "groq",
                AiProviderKind::OpenAiCompatible => "openai-compatible",
            }
            .into(),
            model_revision: "user-configured".into(),
            prompt_version: "1.0".into(),
        };
    }
    crate::domain::semantic::ModelMetadata {
        model_id: "provider-not-configured".into(),
        model_provider: profile_id.into(),
        model_revision: "unavailable".into(),
        prompt_version: "1.0".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(base_url: &str) -> AiProviderProfile {
        AiProviderProfile {
            profile_id: "custom-1".into(),
            display_name: "Local test".into(),
            provider_kind: AiProviderKind::OpenAiCompatible,
            base_url: base_url.into(),
            model_id: "local-model".into(),
        }
    }

    fn profile_kind(kind: AiProviderKind) -> AiProviderProfile {
        AiProviderProfile {
            provider_kind: kind,
            ..profile("https://api.example.com/v1")
        }
    }

    #[test]
    fn defaults_preserve_existing_provider_routes() {
        let config = AiProviderConfig::default();
        assert_eq!(config.assignments.assistant_chat, LOCAL_PROFILE_ID);
        assert_eq!(config.assignments.recipe_extraction, LOCAL_PROFILE_ID);
        assert_eq!(config.assignments.search_synthesis, "gemini");
        assert_eq!(config.assignments.editorial_compilation, "gemini");
    }

    #[test]
    fn accepts_https_and_local_http_only() {
        assert!(validate_base_url("https://api.example.com/v1").is_ok());
        assert!(validate_base_url("http://127.0.0.1:11434/v1").is_ok());
        assert!(validate_base_url("http://api.example.com/v1").is_err());
        assert!(validate_base_url("https://user:pass@example.com/v1").is_err());
    }

    #[test]
    fn defaults_have_an_openai_compatible_free_model_preset() {
        assert!(provider_presets()
            .iter()
            .any(|preset| preset.provider_kind == AiProviderKind::OpenRouter
                && preset.default_model_id == "openrouter/free"));
    }

    #[test]
    fn profile_id_is_rejected_from_local_reserved_name() {
        let mut config = AiProviderConfig::default();
        assert!(save_profile(&mut config, profile("http://127.0.0.1:1234/v1")).is_ok());
        assert!(save_profile(
            &mut config,
            AiProviderProfile {
                profile_id: LOCAL_PROFILE_ID.into(),
                ..profile("http://127.0.0.1:1234/v1")
            }
        )
        .is_err());
    }

    #[test]
    fn request_payload_uses_current_token_fields_for_named_adapters() {
        let openai =
            chat_request_payload(&profile_kind(AiProviderKind::OpenAi), " hello ", 256, None);
        assert_eq!(openai["max_completion_tokens"], 256);
        assert!(openai.get("max_tokens").is_none());
        assert_eq!(openai["messages"][0]["content"], "hello");

        let groq = chat_request_payload(&profile_kind(AiProviderKind::Groq), "hello", 512, None);
        assert_eq!(groq["max_completion_tokens"], 512);

        let compatible = chat_request_payload(
            &profile_kind(AiProviderKind::OpenAiCompatible),
            "hello",
            128,
            Some(serde_json::json!({ "type": "json_object" })),
        );
        assert_eq!(compatible["max_tokens"], 128);
        assert_eq!(compatible["response_format"]["type"], "json_object");
    }

    #[test]
    fn provider_errors_are_actionable_and_do_not_include_response_bodies() {
        assert!(status_error(401).contains("clave"));
        assert!(status_error(400).contains("identificador del modelo"));
        assert!(status_error(404).contains("identificador del modelo"));
        assert!(status_error(429).contains("límite o cuota"));
        assert!(status_error(503).contains("HTTP 503"));
    }
}
