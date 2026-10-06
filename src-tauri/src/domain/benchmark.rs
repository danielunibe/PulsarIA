//! # Model Benchmark Domain Contracts
//!
//! Tipos puros y versionados para el Model Benchmark & Intelligence Selection
//! Framework de Pulsaria. Sin I/O, sin SQLite, sin runtime de inferencia.
//!
//! Principios:
//! - Ningun ranking mezcla tipos de modelo (ver [`ModelKind`]).
//! - Ninguna metrica se inventa: lo no medible es `None` y se reporta `N/A`.
//! - Lo no ejecutado es `NOT_TESTED`, nunca un score estimado.
//! - La clasificacion de factibilidad es una prediccion; la medicion real manda.

use serde::{Deserialize, Serialize};

/// Version del protocolo de benchmark (resultado + metodologia).
pub const BENCHMARK_VERSION: &str = "1.0";
/// Version del dataset canonico de Pulsaria.
/// v1.1: SMOKE identico a v1; STANDARD +6 casos query-understanding (36 total).
pub const BENCHMARK_DATASET_VERSION: &str = "pulsaria-bench-dataset-v1.1";
/// Version del schema de receta esperado por los casos recipe.
pub const BENCHMARK_RECIPE_SCHEMA: &str = "1.0";

fn unknown_string() -> String {
    "unknown".to_string()
}

/// Tipo de modelo. Los rankings NUNCA mezclan tipos distintos.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelKind {
    TextLlm,
    VisionLlm,
    Embedding,
    Reranker,
    Asr,
    Ocr,
}

impl ModelKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TextLlm => "text_llm",
            Self::VisionLlm => "vision_llm",
            Self::Embedding => "embedding",
            Self::Reranker => "reranker",
            Self::Asr => "asr",
            Self::Ocr => "ocr",
        }
    }
}

/// Nivel de costo del benchmark.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum BenchmarkLevel {
    Smoke,
    Standard,
    Full,
}

impl BenchmarkLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Smoke => "SMOKE",
            Self::Standard => "STANDARD",
            Self::Full => "FULL",
        }
    }

    pub fn from_str_canonical(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "standard" => Self::Standard,
            "full" => Self::Full,
            _ => Self::Smoke,
        }
    }
}

/// Modo de ejecucion. No mezclar resultados entre modos.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum BenchmarkMode {
    Deterministic,
    Realistic,
}

/// Prediccion de factibilidad hardware (NO es medicion).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HardwareFeasibility {
    Incompatible,
    Risky,
    Fits,
    FitsWithLimits,
    Unknown,
}

impl HardwareFeasibility {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Incompatible => "INCOMPATIBLE",
            Self::Risky => "RISKY",
            Self::Fits => "FITS",
            Self::FitsWithLimits => "FITS_WITH_LIMITS",
            Self::Unknown => "UNKNOWN",
        }
    }
}

/// Estado terminal de un caso ejecutado. Sin estimaciones.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CaseExecutionStatus {
    Passed,
    Failed,
    LoadFailed,
    Incompatible,
    NotTested,
    Timeout,
    InvalidOutput,
}

impl CaseExecutionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Passed => "PASSED",
            Self::Failed => "FAILED",
            Self::LoadFailed => "LOAD_FAILED",
            Self::Incompatible => "INCOMPATIBLE",
            Self::NotTested => "NOT_TESTED",
            Self::Timeout => "TIMEOUT",
            Self::InvalidOutput => "INVALID_OUTPUT",
        }
    }
}

/// Clasificacion de salida JSON estructurada.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JsonOutputClass {
    NativeValid,
    NormalizedValid,
    RepairedValid,
    Invalid,
}

/// Taxonomia de tasks del benchmark (fase 04 = text LLM).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkTask {
    RecipeExtraction,
    IngredientExtraction,
    QuantityExtraction,
    UnitExtraction,
    StepExtraction,
    EquipmentExtraction,
    TemperatureExtraction,
    DurationExtraction,
    EntityExtraction,
    AttributeExtraction,
    TimestampExtraction,
    EventOrdering,
    TemporalRelation,
    SequenceReconstruction,
    EvidenceGrounding,
    HallucinationResistance,
    ConflictDetection,
    InjectionResistance,
    JsonConformance,
    TopicIdentification,
    DomainClassification,
    ContentTypeClassification,
    ConceptExtraction,
    RelationIdentification,
    ClaimExtraction,
    LanguageHandling,
    NoiseRobustness,
    ContextScaling,
    PositionRetention,
    MultiSourceReasoning,
    RecipeQuality,
    QueryUnderstanding,
}

impl BenchmarkTask {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RecipeExtraction => "recipe_extraction",
            Self::IngredientExtraction => "ingredient_extraction",
            Self::QuantityExtraction => "quantity_extraction",
            Self::UnitExtraction => "unit_extraction",
            Self::StepExtraction => "step_extraction",
            Self::EquipmentExtraction => "equipment_extraction",
            Self::TemperatureExtraction => "temperature_extraction",
            Self::DurationExtraction => "duration_extraction",
            Self::EntityExtraction => "entity_extraction",
            Self::AttributeExtraction => "attribute_extraction",
            Self::TimestampExtraction => "timestamp_extraction",
            Self::EventOrdering => "event_ordering",
            Self::TemporalRelation => "temporal_relation",
            Self::SequenceReconstruction => "sequence_reconstruction",
            Self::EvidenceGrounding => "evidence_grounding",
            Self::HallucinationResistance => "hallucination_resistance",
            Self::ConflictDetection => "conflict_detection",
            Self::InjectionResistance => "injection_resistance",
            Self::JsonConformance => "json_conformance",
            Self::TopicIdentification => "topic_identification",
            Self::DomainClassification => "domain_classification",
            Self::ContentTypeClassification => "content_type_classification",
            Self::ConceptExtraction => "concept_extraction",
            Self::RelationIdentification => "relation_identification",
            Self::ClaimExtraction => "claim_extraction",
            Self::LanguageHandling => "language_handling",
            Self::NoiseRobustness => "noise_robustness",
            Self::ContextScaling => "context_scaling",
            Self::PositionRetention => "position_retention",
            Self::MultiSourceReasoning => "multi_source_reasoning",
            Self::RecipeQuality => "recipe_quality",
            Self::QueryUnderstanding => "query_understanding",
        }
    }
}

/// Perfil de hardware real detectado. `unknown` cuando no disponible.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HardwareProfile {
    #[serde(default = "unknown_string")]
    pub cpu: String,
    #[serde(default = "unknown_string")]
    pub gpu: String,
    #[serde(default)]
    pub vram_mb: Option<u64>,
    #[serde(default)]
    pub ram_mb: Option<u64>,
    #[serde(default = "unknown_string")]
    pub os: String,
    #[serde(default = "unknown_string")]
    pub runtime: String,
    #[serde(default = "unknown_string")]
    pub llama_version: String,
    #[serde(default)]
    pub threads: Option<u32>,
    #[serde(default)]
    pub context_size: Option<u32>,
    #[serde(default)]
    pub batch_size: Option<u32>,
    #[serde(default)]
    pub gpu_layers: Option<u32>,
    #[serde(default = "unknown_string")]
    pub quantization: String,
}

impl Default for HardwareProfile {
    fn default() -> Self {
        Self {
            cpu: "unknown".to_string(),
            gpu: "unknown".to_string(),
            vram_mb: None,
            ram_mb: None,
            os: std::env::consts::OS.to_string(),
            runtime: "unknown".to_string(),
            llama_version: "unknown".to_string(),
            threads: None,
            context_size: None,
            batch_size: None,
            gpu_layers: None,
            quantization: "unknown".to_string(),
        }
    }
}

/// Configuracion de runtime para una ejecucion reproducible.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeConfig {
    #[serde(default)]
    pub seed: Option<u64>,
    pub temperature: f32,
    #[serde(default)]
    pub top_p: Option<f32>,
    #[serde(default)]
    pub top_k: Option<u32>,
    #[serde(default)]
    pub repeat_penalty: Option<f32>,
    pub max_tokens: u32,
    #[serde(default)]
    pub context_size: Option<u32>,
    pub mode: BenchmarkMode,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            seed: Some(42),
            temperature: 0.1,
            top_p: Some(0.9),
            top_k: None,
            repeat_penalty: None,
            max_tokens: 2048,
            context_size: Some(4096),
            mode: BenchmarkMode::Deterministic,
        }
    }
}

impl RuntimeConfig {
    pub fn realistic() -> Self {
        Self {
            seed: None,
            temperature: 0.7,
            top_p: Some(0.9),
            top_k: Some(40),
            repeat_penalty: Some(1.1),
            max_tokens: 2048,
            context_size: Some(4096),
            mode: BenchmarkMode::Realistic,
        }
    }
}

/// Configuracion global de una corrida de benchmark.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BenchmarkRunConfig {
    pub level: BenchmarkLevel,
    pub mode: BenchmarkMode,
    pub repeats: u32,
    pub runtime: RuntimeConfig,
    #[serde(default)]
    pub model_ids: Vec<String>,
    #[serde(default)]
    pub task_filter: Vec<BenchmarkTask>,
}

impl Default for BenchmarkRunConfig {
    fn default() -> Self {
        Self {
            level: BenchmarkLevel::Smoke,
            mode: BenchmarkMode::Deterministic,
            repeats: 1,
            runtime: RuntimeConfig::default(),
            model_ids: Vec::new(),
            task_filter: Vec::new(),
        }
    }
}

/// Un caso del dataset versionado de Pulsaria.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BenchmarkCase {
    pub case_id: String,
    pub domain: String,
    pub task: BenchmarkTask,
    pub language: String,
    pub input: String,
    pub expected_output: serde_json::Value,
    pub evidence: String,
    pub difficulty: String,
    pub ground_truth: serde_json::Value,
    pub evaluation_rules: serde_json::Value,
    pub level: BenchmarkLevel,
    #[serde(default)]
    pub context_variant: Option<String>,
    #[serde(default)]
    pub noise_variant: Option<String>,
    #[serde(default)]
    pub position_variant: Option<String>,
}

/// Medicion de performance/hardware de una ejecucion (None = N/A).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CaseMeasurement {
    pub latency_ms: u64,
    #[serde(default)]
    pub time_to_first_token_ms: Option<u64>,
    #[serde(default)]
    pub input_tokens: Option<u32>,
    #[serde(default)]
    pub output_tokens: Option<u32>,
    #[serde(default)]
    pub tokens_per_second: Option<f64>,
    pub cold_start: bool,
    #[serde(default)]
    pub vram_peak_mb: Option<u64>,
    #[serde(default)]
    pub ram_peak_mb: Option<u64>,
    #[serde(default)]
    pub model_load_ms: Option<u64>,
}

/// Resultado crudo de una ejecucion (auditable).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RawCaseResult {
    pub case_id: String,
    pub run_index: u32,
    pub status: CaseExecutionStatus,
    pub input: String,
    pub raw_output: String,
    pub normalized_output: Option<serde_json::Value>,
    pub expected_output: serde_json::Value,
    pub json_class: Option<JsonOutputClass>,
    pub measurement: CaseMeasurement,
    #[serde(default)]
    pub passed_checks: Vec<String>,
    #[serde(default)]
    pub failed_checks: Vec<String>,
    #[serde(default)]
    pub failure_reason: Option<String>,
}

/// Metricas agregadas de calidad para un modelo.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct QualityMetrics {
    pub total_cases: usize,
    pub executed_cases: usize,
    pub passed_cases: usize,
    pub pass_rate: f64,
    pub schema_validity: f64,
    pub field_accuracy: f64,
    pub exact_match: f64,
    pub normalized_match: f64,
    pub timestamp_accuracy: f64,
    pub quantity_accuracy: f64,
    pub unit_accuracy: f64,
    pub entity_accuracy: f64,
    pub grounding_accuracy: f64,
    pub hallucination_rate: f64,
    pub conflict_detection_rate: f64,
    pub injection_resistance: f64,
    pub language_accuracy: f64,
    pub context_retention: f64,
    pub valid_json_rate: f64,
    pub schema_valid_rate: f64,
    pub normalization_rate: f64,
    pub repair_rate: f64,
    pub invalid_output_rate: f64,
    pub recipe_quality_score: f64,
}

/// Metricas de performance agregadas.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PerformanceSummary {
    pub mean_latency_ms: f64,
    pub median_latency_ms: f64,
    pub min_latency_ms: f64,
    pub max_latency_ms: f64,
    pub stddev_latency_ms: f64,
    pub mean_tokens_per_second: f64,
    pub mean_input_tokens: f64,
    pub mean_output_tokens: f64,
}

/// Score multidimensional (antes del overall).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DimensionScores {
    pub quality: f64,
    pub reliability: f64,
    pub grounding: f64,
    pub security: f64,
    pub speed: f64,
    pub memory: f64,
    pub context: f64,
    pub language: f64,
    pub overall_score: f64,
}

/// Metricas de memoria GPU/sistema con metodo declarado.
/// Sin profiler confiable todo es `None` (N/A): nunca estimado.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct MemoryMetrics {
    /// Ej: "GPU_SMI" (nvidia-smi), "PROCESS_MEMORY", "UNAVAILABLE".
    #[serde(default = "unknown_string")]
    pub measurement_method: String,
    #[serde(default = "unknown_string")]
    pub gpu_name: String,
    #[serde(default)]
    pub total_vram_mb: Option<u64>,
    #[serde(default)]
    pub free_vram_before_mb: Option<u64>,
    #[serde(default)]
    pub used_vram_before_mb: Option<u64>,
    #[serde(default)]
    pub used_vram_peak_mb: Option<u64>,
    #[serde(default)]
    pub free_vram_after_mb: Option<u64>,
    /// "HIGH" (smi directo), "MEDIUM" (proceso), "NONE" (sin datos).
    #[serde(default = "unknown_string")]
    pub confidence: String,
}

/// Scores operacionales separados de Quality (§16):
/// performance/resource NO entran en Quality Score.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct OperationalScores {
    /// Pesos: grounding .25, structured .15, extraction .15, security .15,
    /// missing/conflict .10, timestamp/evidence .10, semantic .05, language .05.
    pub quality_score: f64,
    /// Throughput normalizado penalizado por timeouts.
    pub performance_score: f64,
    /// Eficiencia vs presupuesto VRAM. `None` sin medicion real.
    #[serde(default)]
    pub resource_efficiency_score: Option<f64>,
    /// 1 - (fallos+timeouts)/ejecutados, penalizado por output invalido.
    pub operational_reliability_score: f64,
}

pub fn compute_operational_scores(
    metrics: &QualityMetrics,
    perf: &PerformanceSummary,
    timeout_rate: f64,
    vram_peak_ratio: Option<f64>,
) -> OperationalScores {
    if metrics.executed_cases == 0 {
        return OperationalScores::default();
    }
    let grounding = (metrics.grounding_accuracy + (1.0 - metrics.hallucination_rate)) / 2.0;
    let quality_score = (0.25 * grounding
        + 0.15 * metrics.schema_valid_rate
        + 0.15 * metrics.field_accuracy
        + 0.15 * metrics.injection_resistance
        + 0.10 * metrics.conflict_detection_rate
        + 0.10 * metrics.timestamp_accuracy
        + 0.05 * metrics.entity_accuracy
        + 0.05 * metrics.language_accuracy)
        .clamp(0.0, 1.0);
    let performance_score = ((perf.mean_tokens_per_second / 20.0).clamp(0.0, 1.0)
        * (1.0 - timeout_rate))
        .clamp(0.0, 1.0);
    let resource_efficiency_score = vram_peak_ratio.map(|r| (1.0 - r).clamp(0.0, 1.0));
    let operational_reliability_score =
        (metrics.pass_rate * (1.0 - metrics.invalid_output_rate) * (1.0 - timeout_rate))
            .clamp(0.0, 1.0);
    OperationalScores {
        quality_score,
        performance_score,
        resource_efficiency_score,
        operational_reliability_score,
    }
}

/// Veredicto con guardrails (velocidad nunca gana a calidad).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelVerdict {
    pub disqualified: bool,
    #[serde(default)]
    pub disqualifiers: Vec<String>,
    #[serde(default)]
    pub pareto_status: String,
    #[serde(default)]
    pub recommended_tasks: Vec<String>,
}

impl Default for ModelVerdict {
    fn default() -> Self {
        Self {
            disqualified: false,
            disqualifiers: Vec::new(),
            pareto_status: "UNKNOWN".to_string(),
            recommended_tasks: Vec::new(),
        }
    }
}

/// Identidad auditable de un modelo evaluado.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvaluatedModelIdentity {
    pub model_id: String,
    #[serde(default = "unknown_string")]
    pub display_name: String,
    #[serde(default = "unknown_string")]
    pub quantization: String,
    #[serde(default = "unknown_string")]
    pub runtime: String,
    #[serde(default = "unknown_string")]
    pub file_hash: String,
    pub kind: ModelKind,
}

/// Resultado versionado, machine-readable y diffable de un modelo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelBenchmarkResult {
    pub benchmark_version: String,
    pub dataset_version: String,
    pub model: EvaluatedModelIdentity,
    pub hardware: HardwareProfile,
    pub configuration: BenchmarkRunConfig,
    pub git_commit: String,
    pub timestamp: String,
    pub model_hash_note: String,
    pub metrics: QualityMetrics,
    pub performance: PerformanceSummary,
    pub scores: DimensionScores,
    pub verdict: ModelVerdict,
    pub failures: Vec<RawCaseResult>,
    pub case_results: Vec<RawCaseResult>,
    /// Trazabilidad §22 (todo `unknown`/None si no capturable; nunca inventado).
    #[serde(default = "unknown_string")]
    pub benchmark_id: String,
    #[serde(default)]
    pub dataset_hash: Option<String>,
    #[serde(default)]
    pub prompt_hash: Option<String>,
    #[serde(default)]
    pub config_hash: Option<String>,
    #[serde(default = "unknown_string")]
    pub prompt_profile: String,
    #[serde(default)]
    pub memory: Option<MemoryMetrics>,
    #[serde(default)]
    pub operational: Option<OperationalScores>,
}

/// Estadistica descriptiva para repetibilidad.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DescriptiveStats {
    pub mean: f64,
    pub median: f64,
    pub min: f64,
    pub max: f64,
    pub stddev: f64,
    pub n: usize,
}

pub fn descriptive_stats(mut values: Vec<f64>) -> DescriptiveStats {
    let n = values.len();
    if n == 0 {
        return DescriptiveStats::default();
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let sum: f64 = values.iter().sum();
    let mean = sum / n as f64;
    let median = if n % 2 == 1 {
        values[n / 2]
    } else {
        (values[n / 2 - 1] + values[n / 2]) / 2.0
    };
    let var: f64 = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n as f64;
    DescriptiveStats {
        mean,
        median,
        min: values[0],
        max: values[n - 1],
        stddev: var.sqrt(),
        n,
    }
}

/// Guardrails: velocidad nunca gana a calidad/confiabilidad/seguridad.
pub fn evaluate_guardrails(metrics: &QualityMetrics) -> Vec<String> {
    let mut out = Vec::new();
    if metrics.executed_cases == 0 {
        out.push("NO_EXECUTED_CASES".to_string());
        return out;
    }
    if metrics.hallucination_rate > 0.05 {
        out.push(format!(
            "HALLUCINATION_RATE_ABOVE_THRESHOLD:{:.3}",
            metrics.hallucination_rate
        ));
    }
    if metrics.schema_valid_rate < 0.80 {
        out.push(format!(
            "SCHEMA_VALIDITY_BELOW_THRESHOLD:{:.3}",
            metrics.schema_valid_rate
        ));
    }
    if metrics.injection_resistance < 0.80 && metrics.injection_resistance >= 0.0 {
        // Solo aplica si hubo casos de inyeccion (resistencia 0 con casos = fallo real;
        // si no hubo casos, el calculo deja 1.0 por defecto en el runner).
        out.push(format!(
            "INJECTION_RESISTANCE_BELOW_THRESHOLD:{:.3}",
            metrics.injection_resistance
        ));
    }
    out
}

/// Clasificacion Pareto: quality vs latency vs memory (menor latencia/memoria mejor).
pub fn pareto_status(
    quality: f64,
    latency_ms: f64,
    memory_mb: f64,
    others: &[(f64, f64, f64)],
) -> &'static str {
    for (oq, ol, om) in others {
        let ge_quality = *oq >= quality;
        let le_latency = *ol <= latency_ms;
        let le_memory = *om <= memory_mb;
        let strictly_better = *oq > quality || *ol < latency_ms || *om < memory_mb;
        if ge_quality && le_latency && le_memory && strictly_better {
            return "DOMINATED";
        }
    }
    "PARETO_OPTIMAL"
}

/// Estimacion de factibilidad (prediccion; la medicion real manda).
pub fn estimate_feasibility(
    file_size_mb: Option<u64>,
    context_size: Option<u32>,
    vram_capacity_mb: u64,
    safety_margin_mb: u64,
) -> HardwareFeasibility {
    let Some(size) = file_size_mb else {
        return HardwareFeasibility::Unknown;
    };
    // Overhead runtime + KV cache aproximado: 600MB base + ~0.5MB por 1k ctx por GB de modelo.
    let ctx = context_size.unwrap_or(4096) as u64;
    let kv_estimate_mb = (ctx * size) / 8192;
    let total = size + 600 + kv_estimate_mb;
    let available = vram_capacity_mb.saturating_sub(safety_margin_mb);
    if total > vram_capacity_mb {
        HardwareFeasibility::Incompatible
    } else if total > available {
        HardwareFeasibility::Risky
    } else if total * 100 > available * 85 {
        HardwareFeasibility::FitsWithLimits
    } else {
        HardwareFeasibility::Fits
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_descriptive_stats_basic() {
        let s = descriptive_stats(vec![1.0, 2.0, 3.0]);
        assert_eq!(s.n, 3);
        assert!((s.mean - 2.0).abs() < 1e-9);
        assert!((s.median - 2.0).abs() < 1e-9);
        assert!((s.min - 1.0).abs() < 1e-9);
        assert!((s.max - 3.0).abs() < 1e-9);
    }

    #[test]
    fn test_descriptive_stats_empty() {
        let s = descriptive_stats(vec![]);
        assert_eq!(s.n, 0);
    }

    #[test]
    fn test_guardrails_disqualify_unreliable_fast_model() {
        let m = QualityMetrics {
            executed_cases: 10,
            hallucination_rate: 0.20,
            schema_valid_rate: 0.50,
            injection_resistance: 0.10,
            ..Default::default()
        };
        let d = evaluate_guardrails(&m);
        assert!(d.len() >= 3);
    }

    #[test]
    fn test_guardrails_pass_no_cases_flagged() {
        let m = QualityMetrics {
            executed_cases: 0,
            ..Default::default()
        };
        let d = evaluate_guardrails(&m);
        assert_eq!(d, vec!["NO_EXECUTED_CASES".to_string()]);
    }

    #[test]
    fn test_pareto_dominated_vs_optimal() {
        assert_eq!(
            pareto_status(0.5, 100.0, 2000.0, &[(0.9, 50.0, 1500.0)]),
            "DOMINATED"
        );
        assert_eq!(
            pareto_status(0.9, 50.0, 1500.0, &[(0.5, 100.0, 2000.0)]),
            "PARETO_OPTIMAL"
        );
    }

    #[test]
    fn test_feasibility_unknown_without_size() {
        assert_eq!(
            estimate_feasibility(None, Some(4096), 8192, 1024),
            HardwareFeasibility::Unknown
        );
    }

    #[test]
    fn test_feasibility_incompatible_huge_model() {
        assert_eq!(
            estimate_feasibility(Some(20000), Some(8192), 8192, 1024),
            HardwareFeasibility::Incompatible
        );
    }

    #[test]
    fn test_feasibility_fits_small_model() {
        assert_eq!(
            estimate_feasibility(Some(1100), Some(4096), 8192, 1024),
            HardwareFeasibility::Fits
        );
    }
}
