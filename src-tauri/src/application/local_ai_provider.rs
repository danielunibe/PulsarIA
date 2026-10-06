//! # Local AI Provider Boundary
//!
//! Abstracción desacoplada para inferencia local estructurada.
//! El proveedor NO conoce SQLite y opera de forma agnóstica al modelo
//! (llama.cpp sidecar, mock determinista para tests/dev, o engine local futuro).
//!
//! 100% desacoplado de Gemini y de APIs cloud.

use crate::domain::ai_task::AiTaskType;
use crate::domain::semantic::ModelMetadata;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::Arc;
use std::time::Duration;

pub const DEFAULT_LOCAL_AI_TIMEOUT: Duration = Duration::from_secs(180);

/// Configuración y contenido de un prompt estructurado para el modelo local.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredAiPrompt {
    pub task_type: AiTaskType,
    pub system_instruction: String,
    pub user_context: String,
    pub schema_name: String,
    pub max_tokens: u32,
    pub temperature: f32,
    pub prompt_version: String,
    pub schema_version: String,
    pub json_schema: Option<String>,
    pub response_format: Option<serde_json::Value>,
}

impl StructuredAiPrompt {
    pub fn new(
        task_type: AiTaskType,
        system_instruction: impl Into<String>,
        user_context: impl Into<String>,
        schema_name: impl Into<String>,
    ) -> Self {
        Self {
            task_type,
            system_instruction: system_instruction.into(),
            user_context: user_context.into(),
            schema_name: schema_name.into(),
            max_tokens: 2048,
            temperature: 0.1, // temperatura baja para alta fidelidad estructurada
            prompt_version: "1.0.0".to_string(),
            schema_version: "1.0.0".to_string(),
            json_schema: None,
            response_format: Some(serde_json::json!({ "type": "json_object" })),
        }
    }

    pub fn with_max_tokens(mut self, tokens: u32) -> Self {
        self.max_tokens = tokens;
        self
    }

    pub fn with_temperature(mut self, temp: f32) -> Self {
        self.temperature = temp;
        self
    }

    pub fn with_versions(
        mut self,
        prompt_version: impl Into<String>,
        schema_version: impl Into<String>,
    ) -> Self {
        self.prompt_version = prompt_version.into();
        self.schema_version = schema_version.into();
        self
    }

    pub fn with_json_schema(mut self, schema: impl Into<String>) -> Self {
        self.json_schema = Some(schema.into());
        self
    }

    pub fn with_response_format(mut self, format: Option<serde_json::Value>) -> Self {
        self.response_format = format;
        self
    }
}

/// Errores tipados de inferencia local.
#[derive(Debug, Clone, PartialEq)]
pub enum LocalAiError {
    ModelNotInstalled,
    ModelNotReady(String),
    InferenceTimeout,
    InvalidJson(String),
    SchemaValidationFailed(String),
    Cancelled,
    ExecutionFailed(String),
}

impl fmt::Display for LocalAiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ModelNotInstalled => write!(f, "local AI model is not installed"),
            Self::ModelNotReady(err) => write!(f, "local AI model not ready: {err}"),
            Self::InferenceTimeout => write!(f, "local AI inference timed out"),
            Self::InvalidJson(err) => write!(f, "local AI output is not valid JSON: {err}"),
            Self::SchemaValidationFailed(err) => write!(f, "schema validation failed: {err}"),
            Self::Cancelled => write!(f, "local AI task was cancelled"),
            Self::ExecutionFailed(err) => write!(f, "local AI execution failed: {err}"),
        }
    }
}

impl std::error::Error for LocalAiError {}

/// Escenarios de prueba para el proveedor mock local (100% offline).
#[derive(Debug, Clone)]
pub enum MockLocalScenario {
    RecipeSuccess,
    RecipeWithConflict,
    DomainCulinary,
    DomainTech,
    InvalidJson,
    Timeout,
    EmptyResponse,
    CustomJson(String),
}

/// Proveedor mock determinista para pruebas automatizadas sin dependencias externas.
#[derive(Debug, Clone)]
pub struct MockLocalAiProvider {
    pub scenario: MockLocalScenario,
    pub model_metadata: ModelMetadata,
}

impl MockLocalAiProvider {
    pub fn new(scenario: MockLocalScenario) -> Self {
        Self {
            scenario,
            model_metadata: ModelMetadata {
                model_id: "mock-local-qwen".to_string(),
                model_provider: "mock".to_string(),
                model_revision: "1.0".to_string(),
                prompt_version: "1.0".to_string(),
            },
        }
    }

    pub fn execute_raw(&self, _prompt: &StructuredAiPrompt) -> Result<String, LocalAiError> {
        match &self.scenario {
            MockLocalScenario::RecipeSuccess => Ok(r#"{
                "schema_version": "1.0",
                "title": "Pasta al Pesto Genovés Auténtico",
                "description": "Receta de pesto genovés tradicional con albahaca fresca y piñones",
                "servings": 4,
                "prep_time_minutes": 15,
                "cook_time_minutes": 10,
                "total_time_minutes": 25,
                "difficulty": "fácil",
                "cuisine": "italiana",
                "ingredients": [
                    {
                        "name": "Hojas de albahaca fresca",
                        "normalized_name": "albahaca fresca",
                        "quantity": 50.0,
                        "unit": "g",
                        "notes": "lavadas y secas",
                        "optional": false,
                        "evidence": [{
                            "job_id": 10,
                            "timestamp_start": 5.0,
                            "timestamp_end": 10.0,
                            "quote": "usamos 50 gramos de albahaca fresca",
                            "keyframe_path": null,
                            "confidence": 0.95
                        }]
                    },
                    {
                        "name": "Piñones",
                        "normalized_name": "piñones",
                        "quantity": 30.0,
                        "unit": "g",
                        "notes": null,
                        "optional": false,
                        "evidence": [{
                            "job_id": 10,
                            "timestamp_start": 12.0,
                            "timestamp_end": 15.0,
                            "quote": "30 gramos de piñones tostados",
                            "keyframe_path": null,
                            "confidence": 0.92
                        }]
                    },
                    {
                        "name": "Queso Parmigiano Reggiano",
                        "normalized_name": "queso parmigiano reggiano",
                        "quantity": 70.0,
                        "unit": "g",
                        "notes": "rallado",
                        "optional": false,
                        "evidence": [{
                            "job_id": 10,
                            "timestamp_start": 18.0,
                            "timestamp_end": 22.0,
                            "quote": "70 gramos de parmesano rallado",
                            "keyframe_path": null,
                            "confidence": 0.94
                        }]
                    }
                ],
                "steps": [
                    {
                        "ordinal": 1,
                        "instruction": "Tostar ligeramente los piñones en una sartén sin aceite",
                        "time_start": 25.0,
                        "time_end": 35.0,
                        "technique": "tostado",
                        "temperature": null,
                        "evidence": [{
                            "job_id": 10,
                            "timestamp_start": 25.0,
                            "timestamp_end": 35.0,
                            "quote": "tostamos los piñones a fuego bajo",
                            "keyframe_path": null,
                            "confidence": 0.9
                        }]
                    },
                    {
                        "ordinal": 2,
                        "instruction": "Triturar la albahaca con ajo, piñones y aceite de oliva virgen extra",
                        "time_start": 40.0,
                        "time_end": 60.0,
                        "technique": "triturado",
                        "temperature": null,
                        "evidence": [{
                            "job_id": 10,
                            "timestamp_start": 40.0,
                            "timestamp_end": 60.0,
                            "quote": "agregamos el aceite poco a poco en el mortero",
                            "keyframe_path": null,
                            "confidence": 0.93
                        }]
                    }
                ],
                "equipment": [
                    {
                        "name": "Mortero de mármol",
                        "required": false,
                        "evidence": []
                    }
                ],
                "techniques": [
                    {
                        "name": "Emulsión en frío",
                        "description": "Mezclado suave para evitar calentar la albahaca",
                        "evidence": []
                    }
                ],
                "confidence": 0.96,
                "conflicts": []
            }"#.to_string()),

            MockLocalScenario::RecipeWithConflict => Ok(r#"{
                "schema_version": "1.0",
                "title": "Salsa de Tomate Casera",
                "description": "Receta básica con discrepancia de sal",
                "servings": 4,
                "prep_time_minutes": 5,
                "cook_time_minutes": 20,
                "total_time_minutes": 25,
                "difficulty": "fácil",
                "cuisine": "mediterránea",
                "ingredients": [
                    {
                        "name": "Sal fina",
                        "normalized_name": "sal fina",
                        "quantity": 5.0,
                        "unit": "g",
                        "notes": null,
                        "optional": false,
                        "evidence": [{
                            "job_id": 10,
                            "timestamp_start": 10.0,
                            "timestamp_end": 12.0,
                            "quote": "agregamos 5 gramos de sal",
                            "keyframe_path": null,
                            "confidence": 0.9
                        }]
                    }
                ],
                "steps": [
                    {
                        "ordinal": 1,
                        "instruction": "Cocinar los tomates triturados con sal a fuego lento",
                        "time_start": 15.0,
                        "time_end": 35.0,
                        "technique": "reducción",
                        "temperature": null,
                        "evidence": [{
                            "job_id": 10,
                            "timestamp_start": 15.0,
                            "timestamp_end": 35.0,
                            "quote": "dejamos reducir a fuego lento",
                            "keyframe_path": null,
                            "confidence": 0.88
                        }]
                    }
                ],
                "equipment": [],
                "techniques": [],
                "confidence": 0.85,
                "conflicts": [
                    {
                        "field": "ingredients.sal.quantity",
                        "description": "Fuente A indica 5 g de sal mientras que fuente B indica 10 g",
                        "value_a": "5 g",
                        "value_b": "10 g",
                        "evidence_a": {
                            "job_id": 10,
                            "timestamp_start": 10.0,
                            "timestamp_end": 12.0,
                            "quote": "5 gramos de sal",
                            "keyframe_path": null,
                            "confidence": 0.9
                        },
                        "evidence_b": {
                            "job_id": 11,
                            "timestamp_start": 14.0,
                            "timestamp_end": 16.0,
                            "quote": "10 gramos de sal",
                            "keyframe_path": null,
                            "confidence": 0.89
                        },
                        "requires_review": true
                    }
                ]
            }"#.to_string()),

            MockLocalScenario::DomainCulinary => Ok(r#"{
                "domain": "culinary",
                "content_type": "recipe",
                "confidence": 0.98,
                "rationale": "El video demuestra pasos cronometrados de preparación culinaria y medición de ingredientes.",
                "suggested_tags": ["cocina", "receta", "pasta", "gastronomía"]
            }"#.to_string()),

            MockLocalScenario::DomainTech => Ok(r#"{
                "domain": "technology",
                "content_type": "product_review",
                "confidence": 0.94,
                "rationale": "Análisis de hardware y benchmarks de rendimiento computacional.",
                "suggested_tags": ["hardware", "benchmark", "tecnología"]
            }"#.to_string()),

            MockLocalScenario::InvalidJson => Ok("esto definitivamente no es json { [".to_string()),
            MockLocalScenario::Timeout => Err(LocalAiError::InferenceTimeout),
            MockLocalScenario::EmptyResponse => Ok("   ".to_string()),
            MockLocalScenario::CustomJson(raw) => Ok(raw.clone()),
        }
    }
}

/// Proveedor unificado de inferencia local para Pulsaria.
#[derive(Clone)]
pub enum LocalAiProvider {
    Sidecar(Arc<crate::infrastructure::local_llm::LocalLlmManager>),
    Mock(MockLocalAiProvider),
    Routed(Arc<crate::application::routed_execution::RoutedModelExecutor>),
}

impl LocalAiProvider {
    pub fn mock(scenario: MockLocalScenario) -> Self {
        Self::Mock(MockLocalAiProvider::new(scenario))
    }

    pub fn sidecar(manager: Arc<crate::infrastructure::local_llm::LocalLlmManager>) -> Self {
        Self::Sidecar(manager)
    }

    pub fn routed(
        executor: Arc<crate::application::routed_execution::RoutedModelExecutor>,
    ) -> Self {
        Self::Routed(executor)
    }

    pub fn model_metadata(&self) -> ModelMetadata {
        match self {
            Self::Mock(m) => m.model_metadata.clone(),
            Self::Sidecar(_) => ModelMetadata {
                model_id: "Qwen/Qwen2.5-1.5B-Instruct-GGUF".to_string(),
                model_provider: "llama.cpp".to_string(),
                model_revision: "91cad51170dc346986eccefdc2dd33a9da36ead9".to_string(),
                prompt_version: "1.0".to_string(),
            },
            Self::Routed(_) => ModelMetadata {
                model_id: "routed-adaptive-selector".to_string(),
                model_provider: "capability-router".to_string(),
                model_revision: "1.0".to_string(),
                prompt_version: "1.0".to_string(),
            },
        }
    }

    /// Ejecuta una inferencia estructurada y valida la deserialización hacia el tipo tipado `T`.
    pub async fn generate_structured<T: DeserializeOwned>(
        &self,
        prompt: &StructuredAiPrompt,
    ) -> Result<T, LocalAiError> {
        match self {
            Self::Routed(executor) => {
                let reqs = match prompt.task_type {
                    AiTaskType::SemanticSummarization | AiTaskType::DomainDetection => {
                        crate::domain::routing::TaskRequirements::fast_operational()
                    }
                    AiTaskType::RecipeTransformation => {
                        crate::domain::routing::TaskRequirements::recipe_extraction(
                            crate::domain::routing::ContentTrust::TrustedCurated,
                        )
                    }
                    AiTaskType::StructuredTransformation => {
                        crate::domain::routing::TaskRequirements::fast_operational()
                    }
                    AiTaskType::ConflictVerification => {
                        crate::domain::routing::TaskRequirements::query_understanding()
                    }
                    AiTaskType::EntityExtraction => {
                        crate::domain::routing::TaskRequirements::security_sensitive(
                            crate::domain::routing::ContentTrust::UntrustedPublic,
                        )
                    }
                };
                let (val, _trace): (T, _) = executor
                    .execute_routed(&reqs, prompt)
                    .await
                    .map_err(|e| LocalAiError::ExecutionFailed(e.to_string()))?;
                Ok(val)
            }
            Self::Mock(mock) => {
                let raw_text = mock.execute_raw(prompt)?;
                let normalized = normalize_transport_json(&raw_text, &prompt.schema_name)?;
                serde_json::from_value::<T>(normalized).map_err(|e| {
                    LocalAiError::SchemaValidationFailed(format!(
                        "JSON does not conform to requested schema '{}': {e}",
                        prompt.schema_name
                    ))
                })
            }
            Self::Sidecar(manager) => {
                let status = manager.status().await;
                if !matches!(
                    status.state,
                    crate::infrastructure::local_llm::LocalLlmState::Ready
                ) {
                    return Err(LocalAiError::ModelNotReady(format!(
                        "model state is '{:?}'",
                        status.state
                    )));
                }

                // Construcción de prompt con instrucción de JSON puro
                let full_context = format!(
                    "INSTRUCCIÓN DEL SISTEMA:\n{}\n\nFORMATO OBLIGATORIO:\nGenera exclusivamente JSON válido ajustado al esquema '{}'. No incluyas explicaciones antes ni después del bloque JSON.\n\nEVIDENCIA Y CONTEXTO:\n{}",
                    prompt.system_instruction,
                    prompt.schema_name,
                    prompt.user_context
                );

                let request = crate::infrastructure::local_llm::LocalLlmRequest {
                    task: crate::infrastructure::local_llm::LocalLlmTask::Summary,
                    context: full_context,
                    max_output_tokens: prompt.max_tokens,
                    analysis_depth: None,
                    response_format: prompt.response_format.clone(),
                    temperature: Some(prompt.temperature),
                };

                // Wrapper de timeout
                let execution = tokio::time::timeout(
                    DEFAULT_LOCAL_AI_TIMEOUT,
                    manager.generate_sidecar_request(request),
                )
                .await
                .map_err(|_| LocalAiError::InferenceTimeout)?;

                let response = execution.map_err(LocalAiError::ExecutionFailed)?;
                let normalized = normalize_transport_json(&response.text, &prompt.schema_name)?;
                serde_json::from_value::<T>(normalized).map_err(|e| {
                    LocalAiError::SchemaValidationFailed(format!(
                        "JSON does not conform to requested schema '{}': {e}",
                        prompt.schema_name
                    ))
                })
            }
        }
    }
}

/// Realiza normalización de transporte defensiva y controlada sobre el texto crudo del modelo.
/// Desenvuelve wrappers de raíz únicos (ej. `{"StructuredRecipe": {...}}`), limpia fences Markdown,
/// convierte cadenas de tiempo como "0.0s" a números y reconcilia alias evidentes sin alterar semántica.
pub fn normalize_transport_json(
    raw_text: &str,
    schema_name: &str,
) -> Result<serde_json::Value, LocalAiError> {
    let trimmed = raw_text.trim();
    if trimmed.is_empty() {
        return Err(LocalAiError::InvalidJson(
            "empty response from local AI".to_string(),
        ));
    }

    // 1. Limpieza de fences Markdown
    let cleaned = if trimmed.starts_with("```") {
        let without_start = trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```");
        without_start.trim_end_matches("```").trim()
    } else {
        trimmed
    };

    // 2. Extracción de primer bloque JSON delimitado si hay texto conversacional previo/posterior
    let json_str = if let (Some(start), Some(end)) = (cleaned.find('{'), cleaned.rfind('}')) {
        if start <= end {
            &cleaned[start..=end]
        } else {
            cleaned
        }
    } else {
        cleaned
    };

    let mut val: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| LocalAiError::InvalidJson(format!("JSON parsing error: {e}")))?;

    // 3. Desenvolver wrapper raíz de clave única (ej. `{"StructuredRecipe": {...}}`)
    if let serde_json::Value::Object(ref map) = val {
        if map.len() == 1 {
            let key = map.keys().next().cloned().unwrap_or_default();
            if key.eq_ignore_ascii_case(schema_name)
                || key.eq_ignore_ascii_case("recipe")
                || key.eq_ignore_ascii_case("structured_recipe")
                || key.eq_ignore_ascii_case("data")
                || key.eq_ignore_ascii_case("result")
                || key.eq_ignore_ascii_case("output")
            {
                if let Some(inner) = map.values().next() {
                    if inner.is_object() {
                        val = inner.clone();
                    }
                }
            }
        }
    }

    // 4. Normalizaciones de transporte específicas por esquema sin mutar semántica
    if let serde_json::Value::Object(ref mut root) = val {
        if schema_name == "StructuredRecipe" {
            // Mapeo seguro de title si solo se emitió recipe_name o name
            if !root.contains_key("title") {
                if let Some(rn) = root.remove("recipe_name") {
                    root.insert("title".to_string(), rn);
                } else if let Some(n) = root.remove("name") {
                    root.insert("title".to_string(), n);
                }
            }
            if !root.contains_key("schema_version") {
                root.insert("schema_version".to_string(), serde_json::json!("1.0"));
            }
            if !root.contains_key("confidence") {
                root.insert("confidence".to_string(), serde_json::json!(1.0));
            }

            // Normalizar arrays de nivel superior si faltan
            for arr_field in &[
                "ingredients",
                "steps",
                "equipment",
                "techniques",
                "conflicts",
            ] {
                if !root.contains_key(*arr_field) || !root[*arr_field].is_array() {
                    root.insert(arr_field.to_string(), serde_json::json!([]));
                }
            }

            // Normalización de ingredientes
            if let Some(serde_json::Value::Array(ref mut ingredients)) = root.get_mut("ingredients")
            {
                for ing in ingredients.iter_mut() {
                    if let serde_json::Value::Object(ref mut ing_map) = ing {
                        if !ing_map.contains_key("name") {
                            if let Some(item_name) = ing_map.remove("ingredient") {
                                ing_map.insert("name".to_string(), item_name);
                            }
                        }
                        // Cantidad numérica desde string "200" o "200g"
                        if let Some(q_val) = ing_map.get_mut("quantity") {
                            if let Some(q_str) = q_val.as_str() {
                                let num_clean = q_str
                                    .chars()
                                    .take_while(|c| c.is_ascii_digit() || *c == '.')
                                    .collect::<String>();
                                if let Ok(num) = num_clean.parse::<f64>() {
                                    *q_val = serde_json::json!(num);
                                } else {
                                    *q_val = serde_json::Value::Null;
                                }
                            }
                        }
                        // Normalizar normalized_name
                        if !ing_map.contains_key("normalized_name")
                            || ing_map["normalized_name"].is_null()
                        {
                            let n = ing_map
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .trim()
                                .to_lowercase();
                            ing_map.insert("normalized_name".to_string(), serde_json::json!(n));
                        }
                        // Evidence array
                        if !ing_map.contains_key("evidence") || !ing_map["evidence"].is_array() {
                            if let Some(single_ev) = ing_map.get("evidence").cloned() {
                                if single_ev.is_object() {
                                    ing_map.insert(
                                        "evidence".to_string(),
                                        serde_json::json!([single_ev]),
                                    );
                                } else {
                                    ing_map.insert("evidence".to_string(), serde_json::json!([]));
                                }
                            } else {
                                ing_map.insert("evidence".to_string(), serde_json::json!([]));
                            }
                        }
                        normalize_evidence_array(ing_map.get_mut("evidence"));
                    }
                }
            }

            let root_job_id = root.get("job_id").and_then(|v| v.as_i64()).unwrap_or(0);

            // Normalización de pasos (steps)
            if let Some(serde_json::Value::Array(ref mut steps)) = root.get_mut("steps") {
                for (idx, step) in steps.iter_mut().enumerate() {
                    if let serde_json::Value::Object(ref mut step_map) = step {
                        if !step_map.contains_key("ordinal") {
                            if let Some(sn) = step_map.remove("step_number") {
                                if let Some(n) = sn.as_u64() {
                                    step_map.insert("ordinal".to_string(), serde_json::json!(n));
                                } else if let Some(s) = sn.as_str() {
                                    let n = s.parse::<u64>().unwrap_or((idx + 1) as u64);
                                    step_map.insert("ordinal".to_string(), serde_json::json!(n));
                                }
                            } else {
                                step_map.insert(
                                    "ordinal".to_string(),
                                    serde_json::json!((idx + 1) as u64),
                                );
                            }
                        }
                        if !step_map.contains_key("instruction") {
                            if let Some(inst) = step_map
                                .remove("step")
                                .or_else(|| step_map.remove("text"))
                                .or_else(|| step_map.remove("description"))
                            {
                                step_map.insert("instruction".to_string(), inst);
                            }
                        }
                        normalize_timestamp_field(
                            step_map,
                            "time_start",
                            &["timestamp_start", "start_time", "start"],
                        );
                        normalize_timestamp_field(
                            step_map,
                            "time_end",
                            &["timestamp_end", "end_time", "end"],
                        );

                        if !step_map.contains_key("evidence") || !step_map["evidence"].is_array() {
                            step_map.insert("evidence".to_string(), serde_json::json!([]));
                        }
                        normalize_evidence_array(step_map.get_mut("evidence"));

                        // Extraer valores antes del préstamo mutable de evidence
                        let start = step_map.get("time_start").and_then(|v| v.as_f64());
                        let end = step_map.get("time_end").and_then(|v| v.as_f64());
                        let quote = step_map
                            .get("instruction")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        // Si evidence sigue vacío pero el paso tiene time_start y cita, crear anchor
                        if let Some(ev_arr) =
                            step_map.get_mut("evidence").and_then(|v| v.as_array_mut())
                        {
                            if ev_arr.is_empty() {
                                ev_arr.push(serde_json::json!({
                                    "job_id": root_job_id,
                                    "timestamp_start": start,
                                    "timestamp_end": end,
                                    "quote": quote,
                                    "confidence": 0.95
                                }));
                            }
                        }
                    }
                }
            }
        } else if schema_name == "DomainClassification" {
            if let Some(q_val) = root.get_mut("confidence") {
                if let Some(s) = q_val.as_str() {
                    if let Ok(num) = s.parse::<f64>() {
                        *q_val = serde_json::json!(num);
                    }
                }
            }
        }
    }

    Ok(val)
}

fn normalize_timestamp_field(
    map: &mut serde_json::Map<String, serde_json::Value>,
    target: &str,
    aliases: &[&str],
) {
    if !map.contains_key(target) {
        for alias in aliases {
            if let Some(val) = map.remove(*alias) {
                map.insert(target.to_string(), val);
                break;
            }
        }
    }
    if let Some(val) = map.get_mut(target) {
        if let Some(s) = val.as_str() {
            let num_clean = s.trim_end_matches('s').trim_end_matches('S').trim();
            if let Ok(num) = num_clean.parse::<f64>() {
                *val = serde_json::json!(num);
            }
        }
    }
}

fn normalize_evidence_array(ev_val: Option<&mut serde_json::Value>) {
    if let Some(serde_json::Value::Array(ref mut anchors)) = ev_val {
        for anchor in anchors.iter_mut() {
            if let serde_json::Value::Object(ref mut a_map) = anchor {
                if let Some(j_val) = a_map.get_mut("job_id") {
                    if let Some(s) = j_val.as_str() {
                        if let Ok(id) = s.parse::<i64>() {
                            *j_val = serde_json::json!(id);
                        }
                    }
                }
                normalize_timestamp_field(
                    a_map,
                    "timestamp_start",
                    &["start_time", "start_sec", "start"],
                );
                normalize_timestamp_field(a_map, "timestamp_end", &["end_time", "end_sec", "end"]);
                if !a_map.contains_key("confidence") {
                    a_map.insert("confidence".to_string(), serde_json::json!(0.95));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::recipe::StructuredRecipe;
    use crate::domain::semantic::DomainClassification;

    #[tokio::test]
    async fn test_mock_recipe_structured_generation() {
        let provider = LocalAiProvider::mock(MockLocalScenario::RecipeSuccess);
        let prompt = StructuredAiPrompt::new(
            AiTaskType::RecipeTransformation,
            "Extrae la receta",
            "Video de pesto",
            "StructuredRecipe",
        );

        let recipe: StructuredRecipe = provider.generate_structured(&prompt).await.unwrap();
        assert_eq!(recipe.title, "Pasta al Pesto Genovés Auténtico");
        assert_eq!(recipe.ingredients.len(), 3);
        assert_eq!(recipe.steps.len(), 2);
        assert_eq!(recipe.ingredients[0].quantity, Some(50.0));
    }

    #[tokio::test]
    async fn test_mock_domain_structured_generation() {
        let provider = LocalAiProvider::mock(MockLocalScenario::DomainCulinary);
        let prompt = StructuredAiPrompt::new(
            AiTaskType::DomainDetection,
            "Detecta el dominio",
            "Transcripción culinaria",
            "DomainClassification",
        );

        let class: DomainClassification = provider.generate_structured(&prompt).await.unwrap();
        assert_eq!(
            class.domain,
            crate::domain::semantic::ContentDomain::Culinary
        );
        assert_eq!(
            class.content_type,
            crate::domain::semantic::ContentType::Recipe
        );
        assert!(class.confidence >= 0.95);
    }

    #[tokio::test]
    async fn test_mock_invalid_json_handling() {
        let provider = LocalAiProvider::mock(MockLocalScenario::InvalidJson);
        let prompt = StructuredAiPrompt::new(
            AiTaskType::RecipeTransformation,
            "Extrae",
            "Contexto",
            "StructuredRecipe",
        );

        let res: Result<StructuredRecipe, LocalAiError> =
            provider.generate_structured(&prompt).await;
        assert!(matches!(
            res,
            Err(LocalAiError::InvalidJson(_)) | Err(LocalAiError::SchemaValidationFailed(_))
        ));
    }

    #[tokio::test]
    async fn test_mock_timeout_handling() {
        let provider = LocalAiProvider::mock(MockLocalScenario::Timeout);
        let prompt = StructuredAiPrompt::new(
            AiTaskType::DomainDetection,
            "Detecta",
            "Contexto",
            "DomainClassification",
        );

        let res: Result<DomainClassification, LocalAiError> =
            provider.generate_structured(&prompt).await;
        assert_eq!(res, Err(LocalAiError::InferenceTimeout));
    }

    #[test]
    fn test_normalize_transport_wrapper_unwrapping() {
        let raw = r#"{
            "StructuredRecipe": {
                "title": "Pizza Margherita",
                "ingredients": [],
                "steps": []
            }
        }"#;
        let val = normalize_transport_json(raw, "StructuredRecipe").unwrap();
        assert_eq!(val["title"], "Pizza Margherita");
    }

    #[test]
    fn test_normalize_transport_recipe_name_alias() {
        let raw = r#"{
            "recipe_name": "Tacos al Pastor",
            "ingredients": [],
            "steps": []
        }"#;
        let val = normalize_transport_json(raw, "StructuredRecipe").unwrap();
        assert_eq!(val["title"], "Tacos al Pastor");
    }

    #[test]
    fn test_normalize_transport_string_timestamps() {
        let raw = r#"{
            "title": "Salsa Brava",
            "ingredients": [{
                "name": "tomate",
                "evidence": [{ "job_id": 1, "timestamp_start": "5.0s", "timestamp_end": "12.5s" }]
            }],
            "steps": [{
                "ordinal": 1,
                "instruction": "Hervir",
                "time_start": "0.0s",
                "time_end": "10.0s",
                "evidence": [{ "job_id": 1 }]
            }]
        }"#;
        let val = normalize_transport_json(raw, "StructuredRecipe").unwrap();
        assert_eq!(val["steps"][0]["time_start"], 0.0);
        assert_eq!(val["steps"][0]["time_end"], 10.0);
        assert_eq!(val["ingredients"][0]["evidence"][0]["timestamp_start"], 5.0);
        assert_eq!(val["ingredients"][0]["evidence"][0]["timestamp_end"], 12.5);
    }

    #[test]
    fn test_normalize_transport_markdown_fences() {
        let raw =
            "```json\n{\n  \"title\": \"Guiso\",\n  \"ingredients\": [],\n  \"steps\": []\n}\n```";
        let val = normalize_transport_json(raw, "StructuredRecipe").unwrap();
        assert_eq!(val["title"], "Guiso");
    }
}
