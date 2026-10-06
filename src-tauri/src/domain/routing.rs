//! # Capability Routing Domain Contracts
//!
//! Tipos puros y contratos para el Capability Router determinista de Pulsaria.
//! 100% Rust puro, sin dependencias de base de datos ni frameworks.
//!
//! Principios:
//! - Determinismo: Mismo input + mismo registry + misma evidencia = misma decision.
//! - Separacion: MODEL RESISTANCE != SYSTEM SECURITY.
//! - Evidencia real: Se distingue UNKNOWN, ESTIMATED, OBSERVED y VERIFIED.
//! - Hard Constraints: Las restricciones de seguridad y recursos dominan el scoring.
//! - Explicabilidad: Toda decision expone la razon de seleccion y rechazos detallados.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const ROUTING_POLICY_VERSION: &str = "routing-policy-v1.0";

/// Tipos de tareas que pueden requerir inferencia inteligente en Pulsaria.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    RecipeExtraction,
    QueryUnderstanding,
    StructuredExtraction,
    ContextSynthesis,
    SecuritySensitiveExtraction,
    FastOperationalTask,
}

impl TaskType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RecipeExtraction => "recipe_extraction",
            Self::QueryUnderstanding => "query_understanding",
            Self::StructuredExtraction => "structured_extraction",
            Self::ContextSynthesis => "context_synthesis",
            Self::SecuritySensitiveExtraction => "security_sensitive_extraction",
            Self::FastOperationalTask => "fast_operational_task",
        }
    }
}

/// Nivel de seguridad requerido para la ejecucion de la tarea.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecurityLevel {
    Low,
    Medium,
    High,
    Critical,
}

impl SecurityLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }
}

/// Nivel de confianza o procedencia del contenido que sera procesado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentTrust {
    /// Contenido editorial interno o curado verificado (bajo riesgo de inyeccion).
    TrustedCurated,
    /// Contenido semi-confiable (transcripcion oficial con metadata conocida).
    SemiTrusted,
    /// Contenido publico de internet (comentarios, audio abierto, OCR de videos desconocidos).
    UntrustedPublic,
    /// Contenido con sospecha o probabilidad de instrucciones adversariales incrustadas.
    AdversarialRisk,
}

impl ContentTrust {
    pub fn is_untrusted(&self) -> bool {
        matches!(self, Self::UntrustedPublic | Self::AdversarialRisk)
    }
}

/// Nivel de certeza de la evidencia que respalda una capacidad de modelo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceLevel {
    Unknown,
    Estimated,
    Observed,
    Verified,
}

impl EvidenceLevel {
    pub fn is_usable_for_production(&self) -> bool {
        matches!(self, Self::Observed | Self::Verified)
    }
}

/// Requisitos explicitos exigidos por una tarea para la seleccion de modelo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TaskRequirements {
    pub task_type: TaskType,
    pub security_level: SecurityLevel,
    pub content_trust: ContentTrust,
    pub requires_structured_output: bool,
    pub requires_high_grounding: bool,
    pub requires_long_context: bool,
    pub preferred_language: Option<String>,
    pub max_latency_ms: Option<u64>,
    pub max_memory_mb: Option<u64>,
    pub requires_deterministic_output: bool,
}

impl TaskRequirements {
    /// Constructor para extraccion culinaria estandar.
    pub fn recipe_extraction(trust: ContentTrust) -> Self {
        let sec = if trust.is_untrusted() {
            SecurityLevel::High
        } else {
            SecurityLevel::Medium
        };
        Self {
            task_type: TaskType::RecipeExtraction,
            security_level: sec,
            content_trust: trust,
            requires_structured_output: true,
            requires_high_grounding: true,
            requires_long_context: false,
            preferred_language: Some("es".to_string()),
            max_latency_ms: Some(10_000),
            max_memory_mb: Some(4096),
            requires_deterministic_output: true,
        }
    }

    /// Constructor para tareas con alto riesgo de seguridad (ej. transcripcion con inyecciones).
    pub fn security_sensitive(trust: ContentTrust) -> Self {
        Self {
            task_type: TaskType::SecuritySensitiveExtraction,
            security_level: SecurityLevel::Critical,
            content_trust: trust,
            requires_structured_output: true,
            requires_high_grounding: false,
            requires_long_context: false,
            preferred_language: None,
            max_latency_ms: Some(8_000),
            max_memory_mb: Some(4096),
            requires_deterministic_output: true,
        }
    }

    /// Constructor para tareas operacionales rapidas (query understanding, clasificacion veloz).
    pub fn fast_operational() -> Self {
        Self {
            task_type: TaskType::FastOperationalTask,
            security_level: SecurityLevel::Low,
            content_trust: ContentTrust::TrustedCurated,
            requires_structured_output: true,
            requires_high_grounding: false,
            requires_long_context: false,
            preferred_language: None,
            max_latency_ms: Some(3_000),
            max_memory_mb: Some(2048),
            requires_deterministic_output: true,
        }
    }

    /// Constructor para comprension y expansion de busquedas.
    pub fn query_understanding() -> Self {
        Self {
            task_type: TaskType::QueryUnderstanding,
            security_level: SecurityLevel::Low,
            content_trust: ContentTrust::TrustedCurated,
            requires_structured_output: true,
            requires_high_grounding: false,
            requires_long_context: false,
            preferred_language: None,
            max_latency_ms: Some(4_000),
            max_memory_mb: Some(3072),
            requires_deterministic_output: true,
        }
    }

    /// Constructor para sintesis y extraccion sobre contextos largos.
    pub fn context_synthesis(trust: ContentTrust) -> Self {
        let sec = if trust.is_untrusted() {
            SecurityLevel::High
        } else {
            SecurityLevel::Medium
        };
        Self {
            task_type: TaskType::ContextSynthesis,
            security_level: sec,
            content_trust: trust,
            requires_structured_output: true,
            requires_high_grounding: true,
            requires_long_context: true,
            preferred_language: None,
            max_latency_ms: Some(15_000),
            max_memory_mb: Some(6144),
            requires_deterministic_output: true,
        }
    }
}

/// Estado de disponibilidad del modelo en la cadena formal de routing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelAvailabilityStatus {
    /// Declarado en el catalogo pero sin pesos locales.
    Registered,
    /// Pesos presentes en disco (`data/llm-models`).
    Available,
    /// Pesos verificados por SHA-256 e inicializables.
    Loadable,
    /// Ha sido evaluado formalmente por el benchmark suite.
    Benchmarked,
    /// Cumple todos los hard constraints de la tarea actual.
    Eligible,
    /// Seleccionado como primary para la tarea.
    Selected,
}

/// Razones tipadas y auditables de descarte de un candidato.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "details")]
pub enum RejectionReason {
    SecurityThresholdNotMet { actual: f64, required: f64 },
    StructuredOutputThresholdNotMet { actual: f64, required: f64 },
    GroundingThresholdNotMet { actual: f64, required: f64 },
    MemoryBudgetExceeded { actual_mb: u64, max_mb: u64 },
    LatencyBudgetExceeded { actual_ms: u64, max_ms: u64 },
    ModelNotAvailable(String),
    ModelNotLoadable(String),
    MissingRequiredCapability(String),
    MissingVerifiedEvidence(String),
    LowerScore { score: f64, winning_score: f64 },
    Std13UntrustedContentVulnerability { actual_resistance: f64 },
}

impl RejectionReason {
    pub fn description(&self) -> String {
        match self {
            Self::SecurityThresholdNotMet { actual, required } => {
                format!(
                    "Security resistance ({:.1}%) below required threshold ({:.1}%)",
                    actual * 100.0,
                    required * 100.0
                )
            }
            Self::StructuredOutputThresholdNotMet { actual, required } => {
                format!(
                    "Structured output validity ({:.1}%) below required ({:.1}%)",
                    actual * 100.0,
                    required * 100.0
                )
            }
            Self::GroundingThresholdNotMet { actual, required } => {
                format!(
                    "Grounding score ({:.1}%) below required ({:.1}%)",
                    actual * 100.0,
                    required * 100.0
                )
            }
            Self::MemoryBudgetExceeded { actual_mb, max_mb } => {
                format!(
                    "Memory budget exceeded: requires {} MB, allowed {} MB",
                    actual_mb, max_mb
                )
            }
            Self::LatencyBudgetExceeded { actual_ms, max_ms } => {
                format!(
                    "Latency budget exceeded: measured {} ms, allowed {} ms",
                    actual_ms, max_ms
                )
            }
            Self::ModelNotAvailable(msg) => format!("Model not available on host: {msg}"),
            Self::ModelNotLoadable(msg) => format!("Model weights failed integrity check: {msg}"),
            Self::MissingRequiredCapability(cap) => format!("Missing required capability: {cap}"),
            Self::MissingVerifiedEvidence(field) => {
                format!("No verified benchmark evidence for {field}")
            }
            Self::LowerScore {
                score,
                winning_score,
            } => {
                format!(
                    "Lower composite score ({:.3} vs winning {:.3})",
                    score, winning_score
                )
            }
            Self::Std13UntrustedContentVulnerability { actual_resistance } => {
                format!("Model disqualified for untrusted content due to STD-13 injection vulnerability ({:.1}% resistance)", actual_resistance * 100.0)
            }
        }
    }
}

/// Registro inmutable de un candidato descartado.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RejectedCandidate {
    pub model_id: String,
    pub reason: RejectionReason,
}

/// Perfil de capacidades de un modelo respaldado por evidencia de benchmark.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelCapabilityProfile {
    pub model_id: String,
    pub display_name: String,
    pub availability: ModelAvailabilityStatus,
    pub grounding: (f64, EvidenceLevel),
    pub structured_output: (f64, EvidenceLevel),
    pub security_resistance: (f64, EvidenceLevel),
    pub spanish: (f64, EvidenceLevel),
    pub long_context: (f64, EvidenceLevel),
    pub latency_ms: (f64, EvidenceLevel),
    pub tokens_per_second: (f64, EvidenceLevel),
    pub memory_budget_mb: u64,
    pub recipe_quality: (f64, EvidenceLevel),
    /// Marcador del hallazgo empirico STD-13: vulnerabilidad observada ante inyeccion de schema.
    pub std13_vulnerable: bool,
    pub evidence_artifact: String,
}

/// Decision auditable, explicable y reproducible generada por el router.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RoutingDecision {
    pub policy_version: String,
    pub task_type: TaskType,
    pub selected_model: String,
    pub selected_reason: String,
    pub fallback_chain: Vec<String>,
    pub candidate_scores: Vec<(String, f64)>,
    pub rejected_candidates: Vec<RejectedCandidate>,
    pub evidence_version: String,
    pub benchmark_dataset_version: String,
    pub confidence: f32,
    pub timestamp: String,
}

/// Explicacion estructurada y formateada para inspeccion o logs.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RoutingExplanation {
    pub decision: RoutingDecision,
    pub formatted_explanation: String,
}

/// Estado formal de carga del modelo en el runtime (llama-server).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelLoadStatus {
    NotStarted,
    LoadStarted,
    Loaded,
    Ready,
    Unloading,
    Unloaded,
    LoadFailed(String),
}

/// Estado observable del proceso subyacente (llama-server.exe) (§2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcessState {
    NotStarted,
    Starting { port: u16 },
    Ready { pid: u32, port: u16 },
    Exited { exit_code: Option<i32> },
    Terminated,
}

/// Ciclo de vida formal del modelo en Pulsaria (§2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelLifecycleState {
    Registered,
    Available,
    Resolved,
    LoadStarted,
    Loaded,
    Ready,
    Executing,
    Validated,
    Unloading,
    Unloaded,
    Failed(String),
}

impl ModelLifecycleState {
    pub fn is_terminal_failure(&self) -> bool {
        matches!(self, Self::Failed(_))
    }

    pub fn is_ready_for_execution(&self) -> bool {
        matches!(self, Self::Ready | Self::Loaded)
    }
}

/// Estado de ejecucion y ciclo de vida de la inferencia ruteada.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelExecutionStatus {
    Routed,
    Resolved,
    Loaded,
    Executed,
    Validated,
    Failed(String),
    DeviationBlocked(String),
}

/// Traza inmutable y auditable de ejecucion real del modelo.
///
/// Distingue inequívocamente:
/// - ROUTED: lo que el CapabilityRouter seleccionó.
/// - RESOLVED: los metadatos y ruta GGUF resueltos por el ModelRegistry.
/// - LOADED: si los pesos se verificaron y cargaron en el runtime.
/// - EXECUTED: si la inferencia ocurrió realmente contra el sidecar.
/// - VALIDATED: si la salida pasó la contención y validadores de dominio de Pulsaria.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelExecutionTrace {
    pub routing_policy_version: String,
    pub task_type: TaskType,
    pub requested_model: String,
    pub resolved_model: String,
    pub resolved_path: PathBuf,
    pub expected_sha256: Option<String>,
    pub actual_sha256: Option<String>,
    pub verified_marker_sha256: Option<String>,
    pub load_status: ModelLoadStatus,
    pub execution_status: ModelExecutionStatus,
    pub latency_ms: Option<u64>,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub fallback_used: Option<String>,
    pub fallback_reason: Option<String>,
    pub validation_status: Option<String>,
    #[serde(default)]
    pub process_state: Option<ProcessState>,
    #[serde(default)]
    pub lifecycle_state: Option<ModelLifecycleState>,
    pub timestamp: String,
}
