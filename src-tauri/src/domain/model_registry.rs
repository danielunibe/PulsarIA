//! # Model Registry
//!
//! Catálogo de capacidades y modelos locales de la plataforma Pulsaria.
//! Permite registrar y descubrir modelos locales específicos por tarea sin
//! asumir que un único modelo realiza todo.
//!
//! 100% Rust puro, sin dependencias de base de datos o frameworks.

use crate::domain::benchmark::{estimate_feasibility, HardwareFeasibility, ModelKind};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Capacidades funcionales soportadas por los modelos locales.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelCapability {
    StructuredGeneration,
    JsonSchema,
    ToolUse,
    LongContext,
    Spanish,
    English,
    SemanticEmbedding,
    VisualUnderstanding,
    SpeechToText,
    Reranking,
    Reasoning,
}

fn default_runtime() -> String {
    "llama.cpp".to_string()
}

fn default_ram_budget() -> usize {
    4096
}

fn default_unknown() -> String {
    "unknown".to_string()
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_model_kind() -> ModelKind {
    ModelKind::TextLlm
}

/// Estado de seleccion (§20): recomendacion, nunca migracion automatica.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SelectionStatus {
    Undecided,
    Baseline,
    Recommended,
    Rejected,
}

impl SelectionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Undecided => "UNDECIDED",
            Self::Baseline => "BASELINE",
            Self::Recommended => "RECOMMENDED",
            Self::Rejected => "REJECTED",
        }
    }
}

fn default_selection_status() -> SelectionStatus {
    SelectionStatus::Undecided
}

/// Restricciones y presupuestos de hardware local.
/// Target de referencia: RTX 3070 Ti Laptop, 8 GB VRAM, 64 GB RAM.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HardwareConstraints {
    pub vram_capacity_mb: usize,
    pub ram_capacity_mb: usize,
    pub vram_safety_margin_mb: usize,
}

impl Default for HardwareConstraints {
    fn default() -> Self {
        Self {
            vram_capacity_mb: 8192,
            ram_capacity_mb: 65536,
            vram_safety_margin_mb: 1024,
        }
    }
}

/// Error al resolver un modelo según criterios de capacidad o recursos.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelSelectionError {
    NoModelWithCapability(ModelCapability),
    ExceedsVramBudget {
        requested_mb: usize,
        available_mb: usize,
    },
    UnsupportedLanguage(String),
}

/// Scores observados reales (nunca estimados). Solo se rellenan tras benchmark.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ObservedScores {
    #[serde(default)]
    pub structured_output_score: Option<f64>,
    #[serde(default)]
    pub grounding_score: Option<f64>,
    #[serde(default)]
    pub spanish_score: Option<f64>,
    #[serde(default)]
    pub security_score: Option<f64>,
    #[serde(default)]
    pub recipe_score: Option<f64>,
    #[serde(default)]
    pub latency_ms: Option<f64>,
    #[serde(default)]
    pub tokens_per_second: Option<f64>,
    #[serde(default)]
    pub memory_mb: Option<f64>,
    #[serde(default)]
    pub benchmark_version: Option<String>,
    #[serde(default)]
    pub model_hash: Option<String>,
    /// Proveniencia humana: artifact + prompt + condiciones (ej. "SMOKE real, prompt minimo").
    #[serde(default)]
    pub note: Option<String>,
}

/// Definición formal de un modelo evaluable en el catálogo local de Pulsaria.
///
/// Campos desconocidos se representan como `"unknown"` / `None`, nunca inventados.
///
/// Separacion de procedencia:
/// - `capabilities/parameter_count/languages` = declarado (config del proveedor).
/// - `observed` = medido por el benchmark (scores reales o `None`).
/// - `sha256` + marcador `.verified` = verificado (pesos en disco).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RegisteredModel {
    pub id: String,
    #[serde(default = "default_unknown")]
    pub display_name: String,
    pub provider: String,
    #[serde(default = "default_unknown")]
    pub family: String,
    #[serde(default)]
    pub parameter_count: Option<String>,
    #[serde(default = "default_runtime")]
    pub runtime: String,
    pub revision: String,
    pub filename: String,
    pub quantization: Option<String>,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub file_size_bytes: Option<u64>,
    pub context_length: usize,
    pub vram_budget_mb: usize,
    #[serde(default = "default_ram_budget")]
    pub ram_budget_mb: usize,
    pub capabilities: Vec<ModelCapability>,
    #[serde(default)]
    pub languages: Vec<String>,
    pub sha256: Option<String>,
    #[serde(default = "default_model_kind")]
    pub kind: ModelKind,
    #[serde(default = "default_true")]
    pub chat_capable: bool,
    #[serde(default = "default_false")]
    pub structured_output: bool,
    #[serde(default = "default_false")]
    pub json_capable: bool,
    #[serde(default = "default_false")]
    pub tool_capable: bool,
    #[serde(default = "default_false")]
    pub vision_capable: bool,
    #[serde(default)]
    pub license_metadata: Option<String>,
    #[serde(default)]
    pub hardware_requirements: Option<String>,
    /// Arquitectura GGUF (ej. "qwen2", "gemma2"); `None` si no inspeccionada.
    #[serde(default)]
    pub architecture: Option<String>,
    #[serde(default)]
    pub observed: Option<ObservedScores>,
    #[serde(default = "default_selection_status")]
    pub selection_status: SelectionStatus,
    /// Ultimo benchmark que lo midio (benchmark_id o descripcion); `None` = nunca.
    #[serde(default)]
    pub last_benchmark: Option<String>,
}

impl RegisteredModel {
    pub fn display_name_or_id(&self) -> &str {
        if self.display_name.trim().is_empty() || self.display_name == "unknown" {
            &self.id
        } else {
            &self.display_name
        }
    }

    /// Prediccion de factibilidad (la medicion real tiene autoridad).
    pub fn feasibility(&self, hardware: &HardwareConstraints) -> HardwareFeasibility {
        estimate_feasibility(
            self.file_size_bytes
                .map(|b| b / 1024 / 1024)
                .or(Some(self.vram_budget_mb as u64)),
            Some(self.context_length as u32),
            hardware.vram_capacity_mb as u64,
            hardware.vram_safety_margin_mb as u64,
        )
    }

    pub fn record_observation(&mut self, scores: ObservedScores) {
        self.observed = Some(scores);
    }
}

/// Registro central de modelos de Pulsaria con políticas para hardware moderado (8GB VRAM).
#[derive(Debug, Clone)]
pub struct ModelRegistry {
    models: Vec<RegisteredModel>,
}

impl Default for ModelRegistry {
    fn default() -> Self {
        Self {
            models: vec![
                RegisteredModel {
                    id: "Qwen/Qwen2.5-1.5B-Instruct-GGUF".to_string(),
                    display_name: "Qwen2.5-1.5B-Instruct".to_string(),
                    provider: "llama.cpp".to_string(),
                    family: "Qwen2.5".to_string(),
                    parameter_count: Some("1.5B".to_string()),
                    runtime: "llama-server".to_string(),
                    revision: "91cad51170dc346986eccefdc2dd33a9da36ead9".to_string(),
                    filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf".to_string(),
                    quantization: Some("q4_k_m".to_string()),
                    format: Some("gguf".to_string()),
                    file_size_bytes: Some(1_117_320_736),
                    context_length: 4096,
                    vram_budget_mb: 2048,
                    ram_budget_mb: 4096,
                    capabilities: vec![
                        ModelCapability::StructuredGeneration,
                        ModelCapability::JsonSchema,
                        ModelCapability::Spanish,
                        ModelCapability::English,
                    ],
                    languages: vec!["es".to_string(), "en".to_string()],
                    sha256: Some(
                        "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e"
                            .to_string(),
                    ),
                    kind: ModelKind::TextLlm,
                    chat_capable: true,
                    structured_output: true,
                    json_capable: true,
                    tool_capable: false,
                    vision_capable: false,
                    license_metadata: Some("Apache-2.0".to_string()),
                    hardware_requirements: Some("<=8GB VRAM".to_string()),
                    architecture: Some("qwen2".to_string()),
                    observed: None,
                    selection_status: SelectionStatus::Baseline,
                    last_benchmark: Some(
                        "SMOKE+STANDARD(MINIMAL+PRODUCTION)+FULL v1.1 real 2026-10-04".to_string(),
                    ),
                },
                RegisteredModel {
                    id: "Qwen/Qwen2.5-3B-Instruct-GGUF".to_string(),
                    display_name: "Qwen2.5-3B-Instruct".to_string(),
                    provider: "llama.cpp".to_string(),
                    family: "Qwen2.5".to_string(),
                    parameter_count: Some("3B".to_string()),
                    runtime: "llama-server".to_string(),
                    revision: "unknown".to_string(),
                    filename: "qwen2.5-3b-instruct-q4_k_m.gguf".to_string(),
                    quantization: Some("q4_k_m".to_string()),
                    format: Some("gguf".to_string()),
                    file_size_bytes: Some(2_104_932_768),
                    context_length: 4096,
                    vram_budget_mb: 2600,
                    ram_budget_mb: 6144,
                    capabilities: vec![
                        ModelCapability::StructuredGeneration,
                        ModelCapability::JsonSchema,
                        ModelCapability::Spanish,
                        ModelCapability::English,
                    ],
                    languages: vec!["es".to_string(), "en".to_string()],
                    sha256: Some(
                        "626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d"
                            .to_string(),
                    ),
                    kind: ModelKind::TextLlm,
                    chat_capable: true,
                    structured_output: true,
                    json_capable: true,
                    tool_capable: false,
                    vision_capable: false,
                    license_metadata: Some("Apache-2.0".to_string()),
                    hardware_requirements: Some("<=8GB VRAM".to_string()),
                    architecture: Some("qwen2".to_string()),
                    observed: None,
                    selection_status: SelectionStatus::Undecided,
                    last_benchmark: Some(
                        "STANDARD MINIMAL + PROD v1.1.0 + matriz STD-13 v1.1 real 2026-10-04"
                            .to_string(),
                    ),
                },
                RegisteredModel {
                    id: "bartowski/gemma-2-2b-it-GGUF".to_string(),
                    display_name: "gemma-2-2b-it".to_string(),
                    provider: "llama.cpp".to_string(),
                    family: "Gemma2".to_string(),
                    parameter_count: Some("2B".to_string()),
                    runtime: "llama-server".to_string(),
                    revision: "unknown".to_string(),
                    filename: "gemma-2-2b-it-Q4_K_M.gguf".to_string(),
                    quantization: Some("Q4_K_M".to_string()),
                    format: Some("gguf".to_string()),
                    file_size_bytes: Some(1_708_582_752),
                    context_length: 4096,
                    vram_budget_mb: 2300,
                    ram_budget_mb: 5120,
                    capabilities: vec![
                        ModelCapability::StructuredGeneration,
                        ModelCapability::JsonSchema,
                        ModelCapability::Spanish,
                        ModelCapability::English,
                        ModelCapability::LongContext,
                    ],
                    languages: vec!["es".to_string(), "en".to_string()],
                    sha256: Some(
                        "e0aee85060f168f0f2d8473d7ea41ce2f3230c1bc1374847505ea599288a7787"
                            .to_string(),
                    ),
                    kind: ModelKind::TextLlm,
                    chat_capable: true,
                    structured_output: true,
                    json_capable: true,
                    tool_capable: false,
                    vision_capable: false,
                    license_metadata: Some("Gemma Terms of Use".to_string()),
                    hardware_requirements: Some("<=8GB VRAM".to_string()),
                    architecture: Some("gemma2".to_string()),
                    observed: None,
                    selection_status: SelectionStatus::Undecided,
                    last_benchmark: Some(
                        "STANDARD MINIMAL + PROD v1.1.0 + FULL + matriz STD-13 v1.1 real 2026-10-04"
                            .to_string(),
                    ),
                },
                RegisteredModel {
                    id: "BAAI/bge-small-en-v1.5".to_string(),
                    display_name: "bge-small-en-v1.5".to_string(),
                    provider: "fastembed-rs".to_string(),
                    family: "BGE".to_string(),
                    parameter_count: Some("33M".to_string()),
                    runtime: "ort-cpu".to_string(),
                    revision: "main".to_string(),
                    filename: "model.onnx".to_string(),
                    quantization: None,
                    format: Some("onnx".to_string()),
                    file_size_bytes: None,
                    context_length: 512,
                    vram_budget_mb: 512,
                    ram_budget_mb: 1024,
                    capabilities: vec![
                        ModelCapability::SemanticEmbedding,
                        ModelCapability::English,
                    ],
                    languages: vec!["en".to_string()],
                    sha256: None,
                    kind: ModelKind::Embedding,
                    chat_capable: false,
                    structured_output: false,
                    json_capable: false,
                    tool_capable: false,
                    vision_capable: false,
                    license_metadata: Some("MIT".to_string()),
                    hardware_requirements: None,
                    architecture: None,
                    observed: None,
                    selection_status: SelectionStatus::Undecided,
                    last_benchmark: None,
                },
                RegisteredModel {
                    id: "openai/whisper-base".to_string(),
                    display_name: "whisper-base".to_string(),
                    provider: "whisper.cpp".to_string(),
                    family: "Whisper".to_string(),
                    parameter_count: Some("74M".to_string()),
                    runtime: "whisper.cpp".to_string(),
                    revision: "main".to_string(),
                    filename: "ggml-base.bin".to_string(),
                    quantization: None,
                    format: Some("ggml".to_string()),
                    file_size_bytes: None,
                    context_length: 448,
                    vram_budget_mb: 1024,
                    ram_budget_mb: 2048,
                    capabilities: vec![
                        ModelCapability::SpeechToText,
                        ModelCapability::Spanish,
                        ModelCapability::English,
                    ],
                    languages: vec!["es".to_string(), "en".to_string()],
                    sha256: None,
                    kind: ModelKind::Asr,
                    chat_capable: false,
                    structured_output: false,
                    json_capable: false,
                    tool_capable: false,
                    vision_capable: false,
                    license_metadata: Some("MIT".to_string()),
                    hardware_requirements: None,
                    architecture: None,
                    observed: None,
                    selection_status: SelectionStatus::Undecided,
                    last_benchmark: None,
                },
            ],
        }
    }
}

impl ModelRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn find_by_id(&self, id: &str) -> Option<&RegisteredModel> {
        self.models.iter().find(|m| m.id == id)
    }

    pub fn find_for_capability(&self, capability: ModelCapability) -> Option<&RegisteredModel> {
        self.models
            .iter()
            .find(|m| m.capabilities.contains(&capability))
    }

    /// Selección determinista de modelo según capacidad requerida, idioma y restricciones de hardware.
    pub fn select_model(
        &self,
        required_capability: ModelCapability,
        language: Option<&str>,
        hardware: &HardwareConstraints,
    ) -> Result<&RegisteredModel, ModelSelectionError> {
        let max_allowed_vram = hardware
            .vram_capacity_mb
            .saturating_sub(hardware.vram_safety_margin_mb);

        let candidates: Vec<&RegisteredModel> = self
            .models
            .iter()
            .filter(|m| m.capabilities.contains(&required_capability))
            .filter(|m| {
                if let Some(lang) = language {
                    m.languages.is_empty()
                        || m.languages.iter().any(|l| l.eq_ignore_ascii_case(lang))
                } else {
                    true
                }
            })
            .collect();

        if candidates.is_empty() {
            return Err(ModelSelectionError::NoModelWithCapability(
                required_capability,
            ));
        }

        let viable: Vec<&RegisteredModel> = candidates
            .into_iter()
            .filter(|m| m.vram_budget_mb <= max_allowed_vram)
            .collect();

        if viable.is_empty() {
            return Err(ModelSelectionError::ExceedsVramBudget {
                requested_mb: self
                    .models
                    .iter()
                    .map(|m| m.vram_budget_mb)
                    .min()
                    .unwrap_or(0),
                available_mb: max_allowed_vram,
            });
        }

        // Selección determinista conservadora: menor consumo de VRAM dentro de los viables
        Ok(viable.into_iter().min_by_key(|m| m.vram_budget_mb).unwrap())
    }

    /// Registro con las observaciones reales del SMOKE verificado (2026-10-04).
    ///
    /// Fuente: `data/benchmarks/benchmark_Qwen_Qwen2_5_1_5B_Instruct_GGUF_SMOKE_2026-10-04T18-17-53Z.json`
    /// (llama-server build 10903, prompt generico minimo DETERMINISTIC).
    /// Solo metricas no-vacuas en SMOKE; `spanish_score` queda `None`
    /// (sin casos language aislados en SMOKE) y memoria `None` (N/A sin profiler).
    pub fn with_verified_qwen_smoke() -> Self {
        let mut registry = Self::default();
        if let Some(m) = registry
            .models
            .iter_mut()
            .find(|m| m.id.contains("Qwen2.5-1.5B"))
        {
            m.record_observation(ObservedScores {
                structured_output_score: Some(1.0),
                grounding_score: Some(1.0),
                spanish_score: None,
                security_score: Some(0.0),
                recipe_score: Some(1.0),
                latency_ms: Some(4046.3),
                tokens_per_second: Some(5.1),
                memory_mb: None,
                benchmark_version: Some(format!(
                    "{}/{}",
                    crate::domain::benchmark::BENCHMARK_VERSION,
                    crate::domain::benchmark::BENCHMARK_DATASET_VERSION
                )),
                model_hash: m.sha256.clone(),
                note: Some(
                    "SMOKE real 8/10: schema 100%, halluc 0.0, grounding/conflict/recipe 1.0; \
                     injection 0.0 con prompt minimo (contenida con prompt endurecido v2); \
                     SMOKE-08 regla temporal ambigua (ver audit)"
                        .to_string(),
                ),
            });
        }
        registry
    }

    pub fn register(&mut self, model: RegisteredModel) {
        self.models.retain(|m| m.id != model.id);
        self.models.push(model);
    }

    pub fn list(&self) -> &[RegisteredModel] {
        &self.models
    }

    /// Lista modelos por tipo (los rankings nunca mezclan tipos).
    pub fn list_by_kind(&self, kind: ModelKind) -> Vec<&RegisteredModel> {
        self.models.iter().filter(|m| m.kind == kind).collect()
    }

    /// Preparacion de routing: candidatos TextLLM que cumplen capacidad,
    /// idioma y presupuesto VRAM. Sin router complejo: solo datos.
    pub fn candidates_for_task(
        &self,
        required_capability: ModelCapability,
        language: Option<&str>,
        hardware: &HardwareConstraints,
    ) -> Vec<&RegisteredModel> {
        let max_allowed = hardware
            .vram_capacity_mb
            .saturating_sub(hardware.vram_safety_margin_mb);
        let mut out: Vec<&RegisteredModel> = self
            .models
            .iter()
            .filter(|m| m.kind == ModelKind::TextLlm)
            .filter(|m| m.capabilities.contains(&required_capability))
            .filter(|m| {
                if let Some(lang) = language {
                    m.languages.is_empty()
                        || m.languages.iter().any(|l| l.eq_ignore_ascii_case(lang))
                } else {
                    true
                }
            })
            .filter(|m| m.vram_budget_mb <= max_allowed)
            .collect();
        out.sort_by_key(|m| m.vram_budget_mb);
        out
    }

    /// Resuelve un `ModelId` hacia su especificación concreta de archivo en disco.
    pub fn resolve_model_spec(
        &self,
        model_id: &str,
        models_dir: &Path,
    ) -> Result<ResolvedModelSpec, ModelResolutionError> {
        let model = self
            .find_by_id(model_id)
            .or_else(|| {
                self.models.iter().find(|m| {
                    m.id.ends_with(model_id)
                        || m.id.to_lowercase().contains(&model_id.to_lowercase())
                })
            })
            .ok_or_else(|| ModelResolutionError::ModelNotFound(model_id.to_string()))?;

        let file_path = models_dir.join(&model.filename);
        let marker_path = models_dir.join(format!("{}.verified", model.filename));

        Ok(ResolvedModelSpec {
            model_id: model.id.clone(),
            filename: model.filename.clone(),
            path: file_path,
            expected_sha256: model.sha256.clone(),
            file_size_bytes: model.file_size_bytes,
            runtime: model.runtime.clone(),
            context_length: model.context_length,
            verified_marker_path: marker_path,
        })
    }
}

/// Especificación resuelta de un modelo local para su ejecución o verificación.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResolvedModelSpec {
    pub model_id: String,
    pub filename: String,
    pub path: PathBuf,
    pub expected_sha256: Option<String>,
    pub file_size_bytes: Option<u64>,
    pub runtime: String,
    pub context_length: usize,
    pub verified_marker_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelResolutionError {
    ModelNotFound(String),
    FileNotFound(PathBuf),
    MarkerNotFound(PathBuf),
    HashMismatch { expected: String, actual: String },
    IoError(String),
}

impl std::fmt::Display for ModelResolutionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ModelNotFound(id) => write!(f, "Model not registered in registry: {}", id),
            Self::FileNotFound(p) => {
                write!(f, "Model GGUF file not found on disk: {}", p.display())
            }
            Self::MarkerNotFound(p) => {
                write!(f, "Model verification marker not found: {}", p.display())
            }
            Self::HashMismatch { expected, actual } => write!(
                f,
                "Model hash mismatch! Expected: {}, actual: {}",
                expected, actual
            ),
            Self::IoError(e) => write!(f, "I/O error during model resolution: {}", e),
        }
    }
}

impl std::error::Error for ModelResolutionError {}

impl ResolvedModelSpec {
    pub fn verify_presence(&self) -> Result<(), ModelResolutionError> {
        if !self.path.exists() {
            return Err(ModelResolutionError::FileNotFound(self.path.clone()));
        }
        Ok(())
    }

    pub fn verify_marker(&self) -> Result<String, ModelResolutionError> {
        self.verify_presence()?;
        if !self.verified_marker_path.exists() {
            return Err(ModelResolutionError::MarkerNotFound(
                self.verified_marker_path.clone(),
            ));
        }
        let content = std::fs::read_to_string(&self.verified_marker_path)
            .map_err(|e| ModelResolutionError::IoError(e.to_string()))?;
        let marker_hash = content.trim().to_lowercase();
        if let Some(ref exp) = self.expected_sha256 {
            if marker_hash != exp.to_lowercase() {
                return Err(ModelResolutionError::HashMismatch {
                    expected: exp.clone(),
                    actual: marker_hash,
                });
            }
        }
        Ok(marker_hash)
    }

    pub fn verify_sha256_full(&self) -> Result<String, ModelResolutionError> {
        self.verify_presence()?;
        use sha2::{Digest, Sha256};
        use std::io::Read;

        let mut file = std::fs::File::open(&self.path)
            .map_err(|e| ModelResolutionError::IoError(e.to_string()))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 65536];
        loop {
            let n = file
                .read(&mut buffer)
                .map_err(|e| ModelResolutionError::IoError(e.to_string()))?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
        }
        let hash = format!("{:x}", hasher.finalize());
        if let Some(ref exp) = self.expected_sha256 {
            if hash != exp.to_lowercase() {
                return Err(ModelResolutionError::HashMismatch {
                    expected: exp.clone(),
                    actual: hash,
                });
            }
        }
        Ok(hash)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_registry_defaults() {
        let registry = ModelRegistry::default();
        let gen = registry.find_for_capability(ModelCapability::StructuredGeneration);
        assert!(gen.is_some());
        assert_eq!(gen.unwrap().context_length, 4096);
        assert_eq!(gen.unwrap().quantization.as_deref(), Some("q4_k_m"));

        let emb = registry.find_for_capability(ModelCapability::SemanticEmbedding);
        assert!(emb.is_some());
        assert_eq!(emb.unwrap().id, "BAAI/bge-small-en-v1.5");
    }

    #[test]
    fn test_verified_qwen_smoke_observations() {
        let registry = ModelRegistry::with_verified_qwen_smoke();
        let qwen = registry
            .list_by_kind(crate::domain::benchmark::ModelKind::TextLlm)
            .into_iter()
            .find(|m| m.id.contains("Qwen2.5-1.5B"))
            .expect("qwen registered")
            .clone();
        let obs = qwen.observed.expect("smoke observations recorded");
        assert_eq!(obs.structured_output_score, Some(1.0));
        assert_eq!(obs.grounding_score, Some(1.0));
        assert_eq!(obs.recipe_score, Some(1.0));
        assert_eq!(obs.security_score, Some(0.0));
        assert!(obs.model_hash.is_some());
        assert!(obs.note.is_some());
    }

    #[test]
    fn test_model_selection_policy() {
        let registry = ModelRegistry::default();
        let hardware = HardwareConstraints::default();

        let selected = registry
            .select_model(ModelCapability::StructuredGeneration, Some("es"), &hardware)
            .unwrap();

        assert_eq!(selected.id, "Qwen/Qwen2.5-1.5B-Instruct-GGUF");
        assert_eq!(selected.runtime, "llama-server");
        assert!(selected.vram_budget_mb <= 8192 - 1024);

        // Hardware constraint rejection
        let low_vram = HardwareConstraints {
            vram_capacity_mb: 1024,
            ram_capacity_mb: 8192,
            vram_safety_margin_mb: 512,
        };
        let err = registry.select_model(ModelCapability::StructuredGeneration, None, &low_vram);
        assert!(matches!(
            err,
            Err(ModelSelectionError::ExceedsVramBudget { .. })
        ));
    }

    #[test]
    fn test_resolve_model_spec() {
        let registry = ModelRegistry::default();
        let models_dir = PathBuf::from("../data/llm-models");

        // Resolve Qwen 1.5B
        let res_15 = registry.resolve_model_spec("Qwen/Qwen2.5-1.5B-Instruct-GGUF", &models_dir);
        assert!(
            res_15.is_ok(),
            "Failed to resolve Qwen 1.5B: {:?}",
            res_15.err()
        );
        let spec_15 = res_15.unwrap();
        assert_eq!(spec_15.filename, "qwen2.5-1.5b-instruct-q4_k_m.gguf");
        assert!(spec_15.expected_sha256.is_some());

        // Resolve Qwen 3B
        let res_3b = registry.resolve_model_spec("Qwen2.5-3B", &models_dir);
        assert!(
            res_3b.is_ok(),
            "Failed to resolve Qwen 3B: {:?}",
            res_3b.err()
        );
        let spec_3b = res_3b.unwrap();
        assert_eq!(spec_3b.filename, "qwen2.5-3b-instruct-q4_k_m.gguf");

        // Resolve Gemma 2B
        let res_gemma = registry.resolve_model_spec("gemma-2-2b-it", &models_dir);
        assert!(
            res_gemma.is_ok(),
            "Failed to resolve Gemma 2B: {:?}",
            res_gemma.err()
        );
        let spec_gemma = res_gemma.unwrap();
        assert_eq!(spec_gemma.filename, "gemma-2-2b-it-Q4_K_M.gguf");

        // Non-existent model
        let res_fake = registry.resolve_model_spec("NonExistentModel-99B", &models_dir);
        assert!(matches!(
            res_fake,
            Err(ModelResolutionError::ModelNotFound(_))
        ));
    }
}
