//! # Capability Router & Adaptive Model Selection Service
//!
//! Orquestador determinista, explicable y seguro de seleccion de modelos en Pulsaria.
//! Consume la evidencia empirica congelada de benchmark (Phase 04 + Phase 05)
//! y aplica politicas estrictas donde la seguridad y recursos dominan el scoring.
//!
//! Principios inmutables:
//! 1. AI propone. Pulsaria valida. SQLite persiste. La evidencia demuestra.
//! 2. MODEL RESISTANCE != SYSTEM SECURITY.
//! 3. Ningun modelo gana por tamano o popularidad: la evidencia verificada manda.
//! 4. Las decisiones son 100% deterministas y explicables sin invocar LLMs.

use crate::domain::benchmark::{BENCHMARK_DATASET_VERSION, BENCHMARK_VERSION};
use crate::domain::model_registry::ModelRegistry;
use crate::domain::routing::{
    EvidenceLevel, ModelAvailabilityStatus, ModelCapabilityProfile, RejectedCandidate,
    RejectionReason, RoutingDecision, RoutingExplanation, SecurityLevel, TaskRequirements,
    TaskType, ROUTING_POLICY_VERSION,
};
use std::collections::HashMap;
use std::path::PathBuf;

/// Error devuelto cuando no es posible rutear la tarea hacia un modelo elegible.
#[derive(Debug, Clone, PartialEq)]
pub enum RoutingError {
    SafeFailureNoEligibleCandidates {
        task_type: TaskType,
        rejected: Vec<RejectedCandidate>,
    },
    RegistryEmpty,
}

impl std::fmt::Display for RoutingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SafeFailureNoEligibleCandidates {
                task_type,
                rejected,
            } => {
                write!(
                    f,
                    "Routing Safe Failure: zero candidates met hard constraints for task '{:?}'. Rejected {} candidates.",
                    task_type,
                    rejected.len()
                )
            }
            Self::RegistryEmpty => write!(f, "Model registry has no registered models."),
        }
    }
}

impl std::error::Error for RoutingError {}

/// Router central de capacidades de Pulsaria.
#[derive(Debug, Clone)]
pub struct CapabilityRouter {
    profiles: HashMap<String, ModelCapabilityProfile>,
    models_dir: PathBuf,
}

impl Default for CapabilityRouter {
    fn default() -> Self {
        Self::with_frozen_benchmark_evidence(Self::default_models_dir())
    }
}

impl CapabilityRouter {
    /// Resuelve de forma robusta la ruta hacia los pesos GGUF locales.
    pub fn default_models_dir() -> PathBuf {
        let canonical = crate::db::data_dir_path().join("llm-models");
        if canonical.exists() {
            return canonical;
        }
        let dev_path = PathBuf::from("data/llm-models");
        if dev_path.exists() {
            return dev_path;
        }
        let parent_dev = PathBuf::from("../data/llm-models");
        if parent_dev.exists() {
            return parent_dev;
        }
        canonical
    }

    /// Construye una instancia del router con el directorio de modelos canonico por defecto.
    pub fn new() -> Self {
        Self::with_frozen_benchmark_evidence(Self::default_models_dir())
    }

    /// Construye el router alimentado exclusivamente con la evidencia verificada
    /// de los benchmarks de Pulsaria (STD-13, STANDARD y FULL).
    pub fn with_frozen_benchmark_evidence(models_dir: PathBuf) -> Self {
        let mut router = Self {
            profiles: HashMap::new(),
            models_dir,
        };
        router.load_verified_benchmark_profiles();
        router.refresh_availability();
        router
    }

    /// Carga los perfiles respaldados por las mediciones reales de Fase 04 y Fase 05.
    fn load_verified_benchmark_profiles(&mut self) {
        // 1. Qwen2.5-1.5B-Instruct-GGUF (Baseline, Speed Leader, Fast Operational)
        self.profiles.insert(
            "Qwen/Qwen2.5-1.5B-Instruct-GGUF".to_string(),
            ModelCapabilityProfile {
                model_id: "Qwen/Qwen2.5-1.5B-Instruct-GGUF".to_string(),
                display_name: "Qwen 2.5 1.5B Instruct (Q4_K_M)".to_string(),
                availability: ModelAvailabilityStatus::Benchmarked,
                grounding: (0.714, EvidenceLevel::Verified),
                structured_output: (0.944, EvidenceLevel::Verified),
                security_resistance: (0.500, EvidenceLevel::Verified),
                spanish: (0.500, EvidenceLevel::Verified),
                long_context: (0.570, EvidenceLevel::Verified),
                latency_ms: (1646.0, EvidenceLevel::Verified),
                tokens_per_second: (8.20, EvidenceLevel::Verified),
                memory_budget_mb: 2048,
                recipe_quality: (0.804, EvidenceLevel::Verified),
                std13_vulnerable: true, // 50% inyeccion en STANDARD, colapso de template largo
                evidence_artifact:
                    "benchmark_Qwen_Qwen2_5_1_5B_Instruct_GGUF_STANDARD_2026-10-04T19-33-50Z.json"
                        .to_string(),
            },
        );

        // 2. Qwen/Qwen2.5-3B-Instruct-GGUF (Security Leader en Production v1.1.0)
        self.profiles.insert(
            "Qwen/Qwen2.5-3B-Instruct-GGUF".to_string(),
            ModelCapabilityProfile {
                model_id: "Qwen/Qwen2.5-3B-Instruct-GGUF".to_string(),
                display_name: "Qwen 2.5 3B Instruct (Q4_K_M)".to_string(),
                availability: ModelAvailabilityStatus::Benchmarked,
                grounding: (0.714, EvidenceLevel::Verified),
                structured_output: (1.000, EvidenceLevel::Verified),
                security_resistance: (0.875, EvidenceLevel::Verified), // 7/8 variantes limpias, 100% contencion STD-13-A
                spanish: (1.000, EvidenceLevel::Verified),
                long_context: (0.700, EvidenceLevel::Observed),
                latency_ms: (3764.0, EvidenceLevel::Verified),
                tokens_per_second: (3.50, EvidenceLevel::Verified),
                memory_budget_mb: 3584,
                recipe_quality: (0.804, EvidenceLevel::Verified),
                std13_vulnerable: false, // Refusal determinista contra schema-override
                evidence_artifact:
                    "std13_matrix_Qwen_Qwen2_5_3B_Instruct_GGUF_2026-10-04T21-12-44Z.json"
                        .to_string(),
            },
        );

        // 3. bartowski/gemma-2-2b-it-GGUF (Quality Leader, High Grounding, Long Context)
        self.profiles.insert(
            "bartowski/gemma-2-2b-it-GGUF".to_string(),
            ModelCapabilityProfile {
                model_id: "bartowski/gemma-2-2b-it-GGUF".to_string(),
                display_name: "Gemma 2 2B IT (Q4_K_M)".to_string(),
                availability: ModelAvailabilityStatus::Benchmarked,
                grounding: (1.000, EvidenceLevel::Verified),
                structured_output: (1.000, EvidenceLevel::Verified),
                security_resistance: (0.375, EvidenceLevel::Verified), // Vulnerabilidad observada en STD-13 (falla 5/8)
                spanish: (1.000, EvidenceLevel::Verified),
                long_context: (1.000, EvidenceLevel::Verified),
                latency_ms: (4275.0, EvidenceLevel::Verified),
                tokens_per_second: (4.10, EvidenceLevel::Verified),
                memory_budget_mb: 2816,
                recipe_quality: (0.875, EvidenceLevel::Verified),
                std13_vulnerable: true, // Obedece admin:true 3/3 en STD-13-A
                evidence_artifact:
                    "std13_matrix_bartowski_gemma_2_2b_it_GGUF_2026-10-04T21-06-11Z.json"
                        .to_string(),
            },
        );
    }

    /// Actualiza el estado de disponibilidad verificando si los pesos existen localmente.
    pub fn refresh_availability(&mut self) {
        let registry = ModelRegistry::default();
        for (model_id, profile) in self.profiles.iter_mut() {
            if let Some(registered) = registry.find_by_id(model_id) {
                let weights_path = self.models_dir.join(&registered.filename);
                if weights_path.exists() {
                    profile.availability = ModelAvailabilityStatus::Available;
                    // Comprobamos si tiene el marcador .verified
                    let marker_path = PathBuf::from(format!("{}.verified", weights_path.display()));
                    if marker_path.exists() {
                        profile.availability = ModelAvailabilityStatus::Loadable;
                    }
                } else {
                    profile.availability = ModelAvailabilityStatus::Registered;
                }
            }
        }
    }

    /// Retorna los perfiles actuales de capacidades respaldados por evidencia.
    pub fn get_profiles(&self) -> Vec<ModelCapabilityProfile> {
        let mut out: Vec<ModelCapabilityProfile> = self.profiles.values().cloned().collect();
        out.sort_by(|a, b| a.model_id.cmp(&b.model_id));
        out
    }

    /// Ejecuta el pipeline determinista de Capability Routing:
    /// DISCOVER -> FILTER HARD CONSTRAINTS -> SCORE -> SELECT -> FALLBACK CHAIN
    pub fn route_task(&self, reqs: &TaskRequirements) -> Result<RoutingDecision, RoutingError> {
        if self.profiles.is_empty() {
            return Err(RoutingError::RegistryEmpty);
        }

        let mut eligible_candidates: Vec<(&ModelCapabilityProfile, f64)> = Vec::new();
        let mut rejected_candidates: Vec<RejectedCandidate> = Vec::new();

        // 1. Filtrado por Hard Constraints
        for profile in self.profiles.values() {
            if let Err(reason) = self.check_hard_constraints(profile, reqs) {
                rejected_candidates.push(RejectedCandidate {
                    model_id: profile.model_id.clone(),
                    reason,
                });
            } else {
                // Candidato cumple hard constraints -> calculamos score determinista
                let score = self.calculate_fit_score(profile, reqs);
                eligible_candidates.push((profile, score));
            }
        }

        // Si ningun candidato supera los hard constraints -> Safe Failure
        if eligible_candidates.is_empty() {
            return Err(RoutingError::SafeFailureNoEligibleCandidates {
                task_type: reqs.task_type,
                rejected: rejected_candidates,
            });
        }

        // 2. Ordenacion Determinista con Desempate Formal (§24)
        // Regla: 1. Score descendente -> 2. Throughput descendente -> 3. Menor memoria -> 4. Lexical model_id
        eligible_candidates.sort_by(|(prof_a, score_a), (prof_b, score_b)| {
            score_b
                .partial_cmp(score_a)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    prof_b
                        .tokens_per_second
                        .0
                        .partial_cmp(&prof_a.tokens_per_second.0)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .then_with(|| prof_a.memory_budget_mb.cmp(&prof_b.memory_budget_mb))
                .then_with(|| prof_a.model_id.cmp(&prof_b.model_id))
        });

        let winning_candidate = eligible_candidates[0].0;
        let winning_score = eligible_candidates[0].1;

        // Registrar los candidatos elegibles no ganadores como rechazados por score inferior
        for (cand, score) in eligible_candidates.iter().skip(1) {
            rejected_candidates.push(RejectedCandidate {
                model_id: cand.model_id.clone(),
                reason: RejectionReason::LowerScore {
                    score: *score,
                    winning_score,
                },
            });
        }

        // 3. Construccion de Fallback Chain determinista
        let fallback_chain: Vec<String> = eligible_candidates
            .iter()
            .skip(1)
            .map(|(p, _)| p.model_id.clone())
            .collect();

        // 4. Razon de seleccion explicable
        let selected_reason = self.format_selection_reason(winning_candidate, reqs, winning_score);

        // 5. Confianza de decision basada en evidencia y cobertura (§16)
        let confidence = self.compute_confidence(winning_candidate, reqs);

        let candidate_scores: Vec<(String, f64)> = eligible_candidates
            .iter()
            .map(|(p, s)| (p.model_id.clone(), *s))
            .collect();

        Ok(RoutingDecision {
            policy_version: ROUTING_POLICY_VERSION.to_string(),
            task_type: reqs.task_type,
            selected_model: winning_candidate.model_id.clone(),
            selected_reason,
            fallback_chain,
            candidate_scores,
            rejected_candidates,
            evidence_version: BENCHMARK_VERSION.to_string(),
            benchmark_dataset_version: BENCHMARK_DATASET_VERSION.to_string(),
            confidence,
            timestamp: chrono::Utc::now().to_rfc3339(),
        })
    }

    /// Evaluacion estricta de Hard Constraints que ningun scoring puede rescatar.
    fn check_hard_constraints(
        &self,
        profile: &ModelCapabilityProfile,
        reqs: &TaskRequirements,
    ) -> Result<(), RejectionReason> {
        // C1: Disponibilidad minima (al menos Benchmarked en catalogo o Loadable en disco)
        if matches!(profile.availability, ModelAvailabilityStatus::Registered) {
            return Err(RejectionReason::ModelNotAvailable(
                "Model weights are not present in data/llm-models".to_string(),
            ));
        }

        // C2: Restriccion de memoria maxima
        if let Some(max_mb) = reqs.max_memory_mb {
            if profile.memory_budget_mb > max_mb {
                return Err(RejectionReason::MemoryBudgetExceeded {
                    actual_mb: profile.memory_budget_mb,
                    max_mb,
                });
            }
        }

        // C3: Restriccion de latencia maxima
        if let Some(max_ms) = reqs.max_latency_ms {
            if profile.latency_ms.0 as u64 > max_ms {
                return Err(RejectionReason::LatencyBudgetExceeded {
                    actual_ms: profile.latency_ms.0 as u64,
                    max_ms,
                });
            }
        }

        // C4: Restriccion de Structured Output (minimo 90% para tareas estructuradas)
        if reqs.requires_structured_output && profile.structured_output.0 < 0.90 {
            return Err(RejectionReason::StructuredOutputThresholdNotMet {
                actual: profile.structured_output.0,
                required: 0.90,
            });
        }

        // C5: Restriccion de Grounding (minimo 70% de adherencia a evidencia probada)
        if reqs.requires_high_grounding && profile.grounding.0 < 0.70 {
            return Err(RejectionReason::GroundingThresholdNotMet {
                actual: profile.grounding.0,
                required: 0.70,
            });
        }

        // C6: Security-Aware Hard Constraint (STD-13 finding enforcement)
        // Para contenido no confiable o niveles High/Critical:
        // Si el modelo tiene vulnerabilidad observada de alteracion de schema -> descalificado.
        let is_security_critical = matches!(
            reqs.security_level,
            SecurityLevel::High | SecurityLevel::Critical
        ) || reqs.content_trust.is_untrusted();

        if is_security_critical {
            if profile.std13_vulnerable {
                return Err(RejectionReason::Std13UntrustedContentVulnerability {
                    actual_resistance: profile.security_resistance.0,
                });
            }
            if profile.security_resistance.0 < 0.80 {
                return Err(RejectionReason::SecurityThresholdNotMet {
                    actual: profile.security_resistance.0,
                    required: 0.80,
                });
            }
        }

        Ok(())
    }

    /// Funcion de scoring determinista con ponderaciones auditables segun el tipo de tarea.
    fn calculate_fit_score(
        &self,
        profile: &ModelCapabilityProfile,
        reqs: &TaskRequirements,
    ) -> f64 {
        let grounding = profile.grounding.0;
        let structured = profile.structured_output.0;
        let security = profile.security_resistance.0;
        let recipe = profile.recipe_quality.0;
        let long_ctx = profile.long_context.0;

        // Normalizacion de velocidad: 10 tok/s = 1.0 (clamped)
        let speed_norm = (profile.tokens_per_second.0 / 10.0).clamp(0.0, 1.0);

        match reqs.task_type {
            TaskType::RecipeExtraction => {
                // Tarea culinaria: prioriza alta fidelidad de receta y grounding
                0.35 * grounding
                    + 0.25 * recipe
                    + 0.20 * structured
                    + 0.10 * speed_norm
                    + 0.10 * security
            }
            TaskType::SecuritySensitiveExtraction => {
                // Tarea de seguridad: prioriza contencion de inyeccion y estructura
                0.50 * security + 0.25 * structured + 0.15 * grounding + 0.10 * speed_norm
            }
            TaskType::FastOperationalTask | TaskType::QueryUnderstanding => {
                // Tarea operacional / expansion de query: prioriza velocidad y baja latencia
                0.45 * speed_norm + 0.30 * structured + 0.15 * grounding + 0.10 * security
            }
            TaskType::ContextSynthesis => {
                // Tarea sobre contexto extenso: prioriza retencion en largo contexto
                0.40 * long_ctx + 0.30 * grounding + 0.20 * structured + 0.10 * speed_norm
            }
            TaskType::StructuredExtraction => {
                // Extraccion estructurada generica equilibrada
                0.30 * structured + 0.30 * grounding + 0.20 * security + 0.20 * speed_norm
            }
        }
    }

    /// Explicacion en lenguaje natural auditada para el modelo seleccionado.
    fn format_selection_reason(
        &self,
        winner: &ModelCapabilityProfile,
        reqs: &TaskRequirements,
        score: f64,
    ) -> String {
        match reqs.task_type {
            TaskType::RecipeExtraction if !reqs.content_trust.is_untrusted() => {
                format!(
                    "Selected '{}' for trusted recipe extraction: highest verified grounding ({:.1}%) and recipe quality ({:.1}%) with composite score {:.3}.",
                    winner.display_name, winner.grounding.0 * 100.0, winner.recipe_quality.0 * 100.0, score
                )
            }
            TaskType::SecuritySensitiveExtraction | TaskType::RecipeExtraction
                if reqs.content_trust.is_untrusted() =>
            {
                format!(
                    "Selected '{}' for untrusted/adversarial content: verified STD-13 injection resistance ({:.1}%) and robust refusal determinism with composite score {:.3}.",
                    winner.display_name, winner.security_resistance.0 * 100.0, score
                )
            }
            TaskType::FastOperationalTask | TaskType::QueryUnderstanding => {
                format!(
                    "Selected '{}' for fast operational execution: speed leader ({:.1} tok/s, {:.0}ms latency) with composite score {:.3}.",
                    winner.display_name, winner.tokens_per_second.0, winner.latency_ms.0, score
                )
            }
            TaskType::ContextSynthesis => {
                format!(
                    "Selected '{}' for long context synthesis: highest verified long-context retention ({:.1}%) with composite score {:.3}.",
                    winner.display_name, winner.long_context.0 * 100.0, score
                )
            }
            _ => format!(
                "Selected '{}' with highest composite capability fit score ({:.3}).",
                winner.display_name, score
            ),
        }
    }

    /// Calcula la metrica de confianza formal en base a certeza de evidencia y satisfaccion de restricciones.
    fn compute_confidence(&self, winner: &ModelCapabilityProfile, reqs: &TaskRequirements) -> f32 {
        let mut base: f32 = 0.85;

        // Bonificacion por evidencia completamente verificada
        if winner.grounding.1 == EvidenceLevel::Verified
            && winner.structured_output.1 == EvidenceLevel::Verified
            && winner.security_resistance.1 == EvidenceLevel::Verified
        {
            base += 0.10;
        }

        // Penalizacion si el contenido es untrusted y no es una tarea de alta seguridad
        if reqs.content_trust.is_untrusted() && reqs.security_level < SecurityLevel::High {
            base -= 0.15;
        }

        base.clamp(0.10, 0.99)
    }

    /// Genera la explicacion detallada del ruteo en formato estructurado para auditoria o terminal.
    pub fn explain(&self, reqs: &TaskRequirements) -> Result<RoutingExplanation, RoutingError> {
        let decision = self.route_task(reqs)?;
        let mut buf = String::new();

        buf.push_str("=================================================================\n");
        buf.push_str("PULSARIA CAPABILITY ROUTING — EXPLAINABLE DECISION AUDIT\n");
        buf.push_str("=================================================================\n\n");
        buf.push_str(&format!("TASK TYPE:      {:?}\n", reqs.task_type));
        buf.push_str(&format!("SECURITY LEVEL: {:?}\n", reqs.security_level));
        buf.push_str(&format!("CONTENT TRUST:  {:?}\n", reqs.content_trust));
        buf.push_str(&format!("POLICY VERSION: {}\n", decision.policy_version));
        buf.push_str(&format!("EVIDENCE VER:   {}\n", decision.evidence_version));
        buf.push_str(&format!(
            "DATASET VER:    {}\n\n",
            decision.benchmark_dataset_version
        ));

        buf.push_str("SELECTED PRIMARY MODEL:\n");
        buf.push_str(&format!("  -> Model ID:   {}\n", decision.selected_model));
        buf.push_str(&format!("  -> Rationale:  {}\n", decision.selected_reason));
        buf.push_str(&format!(
            "  -> Confidence: {:.1}%\n\n",
            decision.confidence * 100.0
        ));

        buf.push_str("FALLBACK CHAIN (IN ORDER OF PREFERENCE):\n");
        if decision.fallback_chain.is_empty() {
            buf.push_str("  (None: No other candidate passed all hard constraints)\n");
        } else {
            for (idx, fb) in decision.fallback_chain.iter().enumerate() {
                buf.push_str(&format!("  {}. {}\n", idx + 1, fb));
            }
        }
        buf.push_str("\n");

        buf.push_str("ELIGIBLE CANDIDATE SCORES:\n");
        for (m, s) in &decision.candidate_scores {
            buf.push_str(&format!("  - {:<42} : {:.3}\n", m, s));
        }
        buf.push_str("\n");

        buf.push_str("REJECTED CANDIDATES & AUDITABLE REASONS:\n");
        if decision.rejected_candidates.is_empty() {
            buf.push_str("  (None)\n");
        } else {
            for rej in &decision.rejected_candidates {
                buf.push_str(&format!(
                    "  - {:<42} : {}\n",
                    rej.model_id,
                    rej.reason.description()
                ));
            }
        }
        buf.push_str("\n=================================================================\n");

        Ok(RoutingExplanation {
            decision,
            formatted_explanation: buf,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::routing::ContentTrust;

    #[test]
    fn test_routing_determinism() {
        let router = CapabilityRouter::default();
        let reqs = TaskRequirements::recipe_extraction(ContentTrust::TrustedCurated);

        let first = router.route_task(&reqs).unwrap();
        for _ in 0..50 {
            let next = router.route_task(&reqs).unwrap();
            assert_eq!(first.selected_model, next.selected_model);
            assert_eq!(first.candidate_scores, next.candidate_scores);
            assert_eq!(first.fallback_chain, next.fallback_chain);
        }
    }

    #[test]
    fn test_untrusted_content_rejects_gemma_via_std13_hard_constraint() {
        let router = CapabilityRouter::default();
        // Extraccion de receta sobre contenido no confiable de internet
        let reqs = TaskRequirements::recipe_extraction(ContentTrust::UntrustedPublic);

        let decision = router.route_task(&reqs).unwrap();

        // Gemma DEBE ser rechazada por su vulnerabilidad observada STD-13
        assert_ne!(decision.selected_model, "bartowski/gemma-2-2b-it-GGUF");
        let gemma_rejection = decision
            .rejected_candidates
            .iter()
            .find(|r| r.model_id == "bartowski/gemma-2-2b-it-GGUF");
        assert!(gemma_rejection.is_some());
        assert!(matches!(
            gemma_rejection.unwrap().reason,
            RejectionReason::Std13UntrustedContentVulnerability { .. }
        ));

        // Qwen2.5-3B DEBE ser seleccionado por resistencia comprobada (87.5%)
        assert_eq!(decision.selected_model, "Qwen/Qwen2.5-3B-Instruct-GGUF");
    }

    #[test]
    fn test_trusted_curated_recipe_selects_gemma_for_grounding_and_quality() {
        let router = CapabilityRouter::default();
        // Contenido curado y seguro: se busca maxima calidad culinaria y grounding
        let reqs = TaskRequirements::recipe_extraction(ContentTrust::TrustedCurated);

        let decision = router.route_task(&reqs).unwrap();

        // Gemma debe ganar por su 100% de grounding y 87.5% de calidad de receta
        assert_eq!(decision.selected_model, "bartowski/gemma-2-2b-it-GGUF");
        assert!(decision.candidate_scores.len() >= 2);
        assert!(decision.candidate_scores[0].1 > decision.candidate_scores[1].1);
    }

    #[test]
    fn test_fast_operational_task_selects_qwen15_for_speed() {
        let router = CapabilityRouter::default();
        let reqs = TaskRequirements::fast_operational();

        let decision = router.route_task(&reqs).unwrap();

        // Qwen 1.5B debe ganar por su velocidad de 8.2 tok/s y latencia de 1646ms
        assert_eq!(decision.selected_model, "Qwen/Qwen2.5-1.5B-Instruct-GGUF");
    }

    #[test]
    fn test_safe_failure_when_memory_budget_is_impossible() {
        let router = CapabilityRouter::default();
        let mut reqs = TaskRequirements::fast_operational();
        reqs.max_memory_mb = Some(512); // Ningun modelo TextLLM cabe en 512 MB

        let result = router.route_task(&reqs);
        assert!(matches!(
            result,
            Err(RoutingError::SafeFailureNoEligibleCandidates { .. })
        ));
    }

    #[test]
    fn test_explainability_output() {
        let router = CapabilityRouter::default();
        let reqs = TaskRequirements::security_sensitive(ContentTrust::AdversarialRisk);

        let explanation = router.explain(&reqs).unwrap();
        assert!(explanation
            .formatted_explanation
            .contains("PULSARIA CAPABILITY ROUTING"));
        assert!(explanation
            .formatted_explanation
            .contains("SELECTED PRIMARY MODEL"));
        assert!(explanation
            .formatted_explanation
            .contains("Qwen/Qwen2.5-3B-Instruct-GGUF"));
        assert!(explanation
            .formatted_explanation
            .contains("REJECTED CANDIDATES"));
        assert!(explanation
            .formatted_explanation
            .contains("STD-13 injection vulnerability"));
    }

    #[test]
    fn test_property_no_ineligible_model_can_be_selected() {
        let router = CapabilityRouter::default();
        let scenarios = vec![
            TaskRequirements::recipe_extraction(ContentTrust::TrustedCurated),
            TaskRequirements::recipe_extraction(ContentTrust::UntrustedPublic),
            TaskRequirements::security_sensitive(ContentTrust::AdversarialRisk),
            TaskRequirements::fast_operational(),
            TaskRequirements::query_understanding(),
            TaskRequirements::context_synthesis(ContentTrust::TrustedCurated),
        ];

        for req in scenarios {
            if let Ok(decision) = router.route_task(&req) {
                // El modelo seleccionado JAMAS debe figurar entre los candidatos rechazados
                let rejected_ids: Vec<&str> = decision
                    .rejected_candidates
                    .iter()
                    .map(|r| r.model_id.as_str())
                    .collect();
                assert!(!rejected_ids.contains(&decision.selected_model.as_str()));
            }
        }
    }

    #[test]
    fn test_property_hard_constraint_dominates_score() {
        let router = CapabilityRouter::default();
        // Configuramos una tarea donde la memoria limite sea 3000 MB.
        // Qwen3B requiere 3584 MB -> debe ser descartado POR HARD CONSTRAINT aunque tenga alta seguridad.
        let mut reqs = TaskRequirements::security_sensitive(ContentTrust::AdversarialRisk);
        reqs.max_memory_mb = Some(3000);

        let result = router.route_task(&reqs);
        // Gemma falla por STD-13, Qwen3B falla por memoria, Qwen1.5 falla por security < 0.80
        // -> Debe haber Safe Failure
        assert!(matches!(
            result,
            Err(RoutingError::SafeFailureNoEligibleCandidates { .. })
        ));
    }

    #[test]
    fn test_property_monotonicity_worse_candidate_cannot_displace_winner() {
        let mut router = CapabilityRouter::default();
        let reqs = TaskRequirements::recipe_extraction(ContentTrust::TrustedCurated);
        let base_decision = router.route_task(&reqs).unwrap();

        // Agregamos un modelo estrictamente inferior (menor grounding, menor velocidad, mayor latencia)
        router.profiles.insert(
            "dummy/inferior-model".to_string(),
            ModelCapabilityProfile {
                model_id: "dummy/inferior-model".to_string(),
                display_name: "Inferior Dummy Model".to_string(),
                availability: ModelAvailabilityStatus::Available,
                grounding: (0.50, EvidenceLevel::Verified),
                structured_output: (0.90, EvidenceLevel::Verified),
                security_resistance: (0.20, EvidenceLevel::Verified),
                spanish: (0.50, EvidenceLevel::Verified),
                long_context: (0.30, EvidenceLevel::Verified),
                latency_ms: (10000.0, EvidenceLevel::Verified),
                tokens_per_second: (1.0, EvidenceLevel::Verified),
                memory_budget_mb: 4000,
                recipe_quality: (0.40, EvidenceLevel::Verified),
                std13_vulnerable: true,
                evidence_artifact: "none".to_string(),
            },
        );

        let new_decision = router.route_task(&reqs).unwrap();
        // El ganador original no debe ser desplazado por un candidato estrictamente inferior
        assert_eq!(base_decision.selected_model, new_decision.selected_model);
    }

    #[test]
    fn test_context_synthesis_selects_gemma_for_long_context() {
        let router = CapabilityRouter::default();
        let reqs = TaskRequirements::context_synthesis(ContentTrust::TrustedCurated);

        let decision = router.route_task(&reqs).unwrap();
        // Gemma tiene 100% de retencion de contexto largo frente a 57% de Qwen 1.5B
        assert_eq!(decision.selected_model, "bartowski/gemma-2-2b-it-GGUF");
    }

    #[test]
    fn test_unavailable_model_is_rejected() {
        let mut router = CapabilityRouter::default();
        // Registramos un modelo sin pesos (solo Registered)
        router.profiles.insert(
            "future/uninstalled-model".to_string(),
            ModelCapabilityProfile {
                model_id: "future/uninstalled-model".to_string(),
                display_name: "Uninstalled Model".to_string(),
                availability: ModelAvailabilityStatus::Registered, // sin pesos
                grounding: (1.0, EvidenceLevel::Verified),
                structured_output: (1.0, EvidenceLevel::Verified),
                security_resistance: (1.0, EvidenceLevel::Verified),
                spanish: (1.0, EvidenceLevel::Verified),
                long_context: (1.0, EvidenceLevel::Verified),
                latency_ms: (500.0, EvidenceLevel::Verified),
                tokens_per_second: (20.0, EvidenceLevel::Verified),
                memory_budget_mb: 1000,
                recipe_quality: (1.0, EvidenceLevel::Verified),
                std13_vulnerable: false,
                evidence_artifact: "none".to_string(),
            },
        );

        let reqs = TaskRequirements::recipe_extraction(ContentTrust::TrustedCurated);
        let decision = router.route_task(&reqs).unwrap();
        // El modelo no instalado debe estar entre los rechazados con ModelNotAvailable
        let rejection = decision
            .rejected_candidates
            .iter()
            .find(|r| r.model_id == "future/uninstalled-model");
        assert!(rejection.is_some());
        assert!(matches!(
            rejection.unwrap().reason,
            RejectionReason::ModelNotAvailable(..)
        ));
    }
}
