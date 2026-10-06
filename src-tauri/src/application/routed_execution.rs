//! # Routed Model Execution Service
//!
//! Conecta la decisión determinista del `CapabilityRouter` con la ejecución real
//! del modelo en el runtime (llama-server o runner inyectado), garantizando:
//! - Que el modelo seleccionado sea el que realmente se ejecute (cero desviación silenciosa).
//! - Trazabilidad total de extremo a extremo: ROUTED -> RESOLVED -> LOADED -> READY -> EXECUTING -> VALIDATED -> UNLOADED.
//! - Fallback determinista y controlado por política ante fallos de carga o crash del proceso.
//! - Verificación de identidad mediante resolución de GGUF, ruta canónica y hash SHA-256.
//! - Ciclo de vida estricto de modelo único activo (MAX_ACTIVE_MODELS = 1) con conmutación por reinicio controlado.
//! - Preservación de la regla de oro: MODEL RESISTANCE != SYSTEM SECURITY (validación obligatoria).

use crate::application::capability_router::CapabilityRouter;
use crate::application::local_ai_provider::{normalize_transport_json, StructuredAiPrompt};
use crate::domain::model_registry::{ModelRegistry, ModelResolutionError, ResolvedModelSpec};
use crate::domain::routing::{
    ModelExecutionStatus, ModelExecutionTrace, ModelLifecycleState, ModelLoadStatus, ProcessState,
    RoutingDecision, SecurityLevel, TaskRequirements,
};
use crate::infrastructure::benchmark_sidecar::{BenchmarkSidecar, SidecarSpec};
use serde::de::DeserializeOwned;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tracing::{info, warn};

/// Taxonomía de errores tipados de ejecución y ciclo de vida de modelos (§42, Mega Prompt 09).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExecutionError {
    ModelNotRegistered(String),
    ModelNotAvailable(String),
    ModelPathNotFound(PathBuf),
    ModelHashMismatch {
        expected: String,
        actual: String,
    },
    ModelLoadFailed(String),
    ProviderUnavailable(String),
    LlamaServerUnavailable(String),
    InferenceFailed(String),
    RoutingExecutionMismatch {
        routed: String,
        attempted: String,
    },
    ValidationFailed(String),
    NoEligibleFallback {
        primary: String,
        reason: String,
    },
    RoutingFailed(String),
    Timeout(u64),
    ProcessExited {
        exit_code: Option<i32>,
        model: String,
    },
    HealthCheckFailed(String),
    RecoveryFailed(String),
}

impl std::fmt::Display for ExecutionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ModelNotRegistered(m) => write!(f, "MODEL_NOT_REGISTERED: {}", m),
            Self::ModelNotAvailable(m) => write!(f, "MODEL_NOT_AVAILABLE: {}", m),
            Self::ModelPathNotFound(p) => write!(f, "MODEL_PATH_NOT_FOUND: {}", p.display()),
            Self::ModelHashMismatch { expected, actual } => {
                write!(
                    f,
                    "MODEL_HASH_MISMATCH: expected {}, got {}",
                    expected, actual
                )
            }
            Self::ModelLoadFailed(m) => write!(f, "MODEL_LOAD_FAILED: {}", m),
            Self::ProviderUnavailable(m) => write!(f, "PROVIDER_UNAVAILABLE: {}", m),
            Self::LlamaServerUnavailable(m) => write!(f, "LLAMA_SERVER_UNAVAILABLE: {}", m),
            Self::InferenceFailed(m) => write!(f, "INFERENCE_FAILED: {}", m),
            Self::RoutingExecutionMismatch { routed, attempted } => {
                write!(
                    f,
                    "ROUTING_EXECUTION_MISMATCH: router selected '{}', but provider attempted '{}'",
                    routed, attempted
                )
            }
            Self::ValidationFailed(m) => write!(f, "VALIDATION_FAILED: {}", m),
            Self::NoEligibleFallback { primary, reason } => {
                write!(
                    f,
                    "NO_ELIGIBLE_FALLBACK: primary '{}' failed ({}) and no valid fallback exists",
                    primary, reason
                )
            }
            Self::RoutingFailed(m) => write!(f, "ROUTING_FAILED: {}", m),
            Self::Timeout(s) => write!(f, "TIMEOUT: inference exceeded {}s", s),
            Self::ProcessExited { exit_code, model } => {
                write!(
                    f,
                    "PROCESS_EXITED: model '{}' process terminated unexpectedly with exit code {:?}",
                    model, exit_code
                )
            }
            Self::HealthCheckFailed(m) => write!(f, "HEALTH_CHECK_FAILED: {}", m),
            Self::RecoveryFailed(m) => write!(f, "RECOVERY_FAILED: {}", m),
        }
    }
}

impl std::error::Error for ExecutionError {}

/// Salida cruda de inferencia provista por el runner de modelos.
#[derive(Debug, Clone)]
pub struct RawInferenceOutput {
    pub content: String,
    pub latency_ms: u64,
    pub prompt_tokens: usize,
    pub completion_tokens: usize,
    pub http_status: u16,
    pub model_reported: Option<String>,
}

/// Contrato para el ejecutor subyacente de inferencia y ciclo de vida de procesos.
#[async_trait::async_trait]
pub trait ModelRunner: Send + Sync {
    async fn run_inference(
        &self,
        spec: &ResolvedModelSpec,
        prompt: &StructuredAiPrompt,
        timeout_secs: u64,
    ) -> Result<RawInferenceOutput, ExecutionError>;

    async fn active_model_id(&self) -> Option<String> {
        None
    }

    async fn shutdown_active(&self) -> Result<(), String> {
        Ok(())
    }
}

/// Runner real basado en `BenchmarkSidecar` (llama-server.exe).
/// Controla el ciclo de vida del proceso hijo con reinicio limpio en cambio de modelo (§12 Caso B)
/// y garantiza el invariante de modelo único activo (MAX_ACTIVE_MODELS = 1).
pub struct RealSidecarRunner {
    active_sidecar: Mutex<Option<BenchmarkSidecar>>,
    use_gpu: bool,
}

impl RealSidecarRunner {
    pub fn new(use_gpu: bool) -> Self {
        Self {
            active_sidecar: Mutex::new(None),
            use_gpu,
        }
    }

    pub async fn active_model_id(&self) -> Option<String> {
        let lock = self.active_sidecar.lock().await;
        lock.as_ref().map(|s| s.model_id.clone())
    }

    pub async fn active_pid(&self) -> Option<u32> {
        let lock = self.active_sidecar.lock().await;
        lock.as_ref().and_then(|s| s.pid())
    }

    pub async fn active_port(&self) -> Option<u16> {
        let lock = self.active_sidecar.lock().await;
        lock.as_ref().map(|s| s.port())
    }

    pub async fn is_active_process_alive(&self) -> bool {
        let mut lock = self.active_sidecar.lock().await;
        if let Some(ref mut sidecar) = *lock {
            sidecar.is_alive()
        } else {
            false
        }
    }

    pub async fn shutdown_active(&self) -> Result<(), String> {
        let mut lock = self.active_sidecar.lock().await;
        if let Some(mut sidecar) = lock.take() {
            sidecar.shutdown().await?;
        }
        Ok(())
    }
}

#[async_trait::async_trait]
impl ModelRunner for RealSidecarRunner {
    async fn active_model_id(&self) -> Option<String> {
        self.active_model_id().await
    }

    async fn shutdown_active(&self) -> Result<(), String> {
        self.shutdown_active().await
    }

    async fn run_inference(
        &self,
        spec: &ResolvedModelSpec,
        prompt: &StructuredAiPrompt,
        timeout_secs: u64,
    ) -> Result<RawInferenceOutput, ExecutionError> {
        // 1. Verificación previa de existencia física del GGUF
        spec.verify_presence()
            .map_err(|_| ExecutionError::ModelPathNotFound(spec.path.clone()))?;

        // 2. Adquirir lock para gestión del ciclo de vida del proceso llama-server
        // Garantiza MAX_ACTIVE_MODELS = 1 y serialización estricta de inferencias
        let mut active_lock = self.active_sidecar.lock().await;

        let mut needs_launch = true;
        if let Some(ref mut existing) = *active_lock {
            if existing.is_alive() {
                if existing.model_id == spec.model_id {
                    // Modelo ya activo y saludable: Warm Reuse
                    needs_launch = false;
                } else {
                    // Cambio de modelo requerido: terminar proceso anterior limpiamente
                    info!(
                        "Controlled process restart: terminating active model '{}' to launch '{}'",
                        existing.model_id, spec.model_id
                    );
                    let mut old = active_lock.take().unwrap();
                    let _ = old.shutdown().await;
                }
            } else {
                // El proceso anterior murió / crasheó: descartar
                warn!(
                    "Active sidecar for '{}' has exited unexpectedly. Discarding before launch.",
                    existing.model_id
                );
                *active_lock = None;
            }
        }

        if needs_launch {
            let sidecar_spec = SidecarSpec {
                model_id: spec.model_id.clone(),
                gguf_path: spec.path.clone(),
                expected_sha256: spec.expected_sha256.clone(),
                ctx_size: (spec.context_length as u32).min(4096),
                n_predict: prompt.max_tokens,
                use_gpu: self.use_gpu,
            };

            let sidecar = BenchmarkSidecar::launch(&sidecar_spec)
                .await
                .map_err(ExecutionError::ModelLoadFailed)?;

            *active_lock = Some(sidecar);
        }

        let sidecar = active_lock.as_mut().unwrap();

        // 3. Verificación de salud (Health Readiness Check)
        if let Err(e) = sidecar.check_health().await {
            warn!(
                "Health check failed for active model '{}': {}",
                spec.model_id, e
            );
            let mut failed_sidecar = active_lock.take().unwrap();
            let _ = failed_sidecar.shutdown().await;
            return Err(ExecutionError::HealthCheckFailed(e));
        }

        // 4. Construcción del payload de inferencia
        let full_context = format!(
            "INSTRUCCIÓN DEL SISTEMA:\n{}\n\nFORMATO OBLIGATORIO:\nGenera exclusivamente JSON válido ajustado al esquema '{}'. No incluyas explicaciones antes ni después del bloque JSON.\n\nEVIDENCIA Y CONTEXTO:\n{}",
            prompt.system_instruction,
            prompt.schema_name,
            prompt.user_context
        );

        let start = Instant::now();
        let completion_res = sidecar
            .complete(
                &full_context,
                prompt.max_tokens,
                prompt.temperature,
                timeout_secs,
            )
            .await;

        let latency_ms = start.elapsed().as_millis() as u64;

        match completion_res {
            Ok(completion) => Ok(RawInferenceOutput {
                content: completion.text,
                latency_ms,
                prompt_tokens: completion.prompt_tokens.unwrap_or(0) as usize,
                completion_tokens: completion.completion_tokens.unwrap_or(0) as usize,
                http_status: 200,
                model_reported: Some(spec.model_id.clone()),
            }),
            Err(err_str) => {
                // Verificar si el proceso murió durante la inferencia
                if !sidecar.is_alive() {
                    let exit_code = sidecar.exit_status().and_then(|s| s.code());
                    tracing::error!(
                        "Process crash detected during inference for model '{}'! Exit code: {:?}",
                        spec.model_id,
                        exit_code
                    );
                    let mut crashed = active_lock.take().unwrap();
                    let _ = crashed.shutdown().await;
                    return Err(ExecutionError::ProcessExited {
                        exit_code,
                        model: spec.model_id.clone(),
                    });
                }

                if err_str.contains("TIMEOUT") {
                    return Err(ExecutionError::Timeout(timeout_secs));
                }

                Err(ExecutionError::InferenceFailed(err_str))
            }
        }
    }
}

/// Runner mock para tests deterministas de orquestación, estados y recuperación.
pub struct MockModelRunner {
    pub responses: Mutex<HashMap<String, Result<String, ExecutionError>>>,
    pub execution_log: Mutex<Vec<String>>,
    pub active_model: Mutex<Option<String>>,
    pub active_pid: Mutex<Option<u32>>,
    pub switch_count: Mutex<u32>,
    pub warm_reuse_count: Mutex<u32>,
    pub simulated_crashes: Mutex<HashSet<String>>,
    pub simulated_timeouts: Mutex<HashSet<String>>,
}

impl MockModelRunner {
    pub fn new() -> Self {
        Self {
            responses: Mutex::new(HashMap::new()),
            execution_log: Mutex::new(Vec::new()),
            active_model: Mutex::new(None),
            active_pid: Mutex::new(None),
            switch_count: Mutex::new(0),
            warm_reuse_count: Mutex::new(0),
            simulated_crashes: Mutex::new(HashSet::new()),
            simulated_timeouts: Mutex::new(HashSet::new()),
        }
    }

    pub async fn set_response(
        &self,
        model_id: impl Into<String>,
        result: Result<String, ExecutionError>,
    ) {
        self.responses.lock().await.insert(model_id.into(), result);
    }

    pub async fn simulate_crash_on(&self, model_id: impl Into<String>) {
        self.simulated_crashes.lock().await.insert(model_id.into());
    }

    pub async fn simulate_timeout_on(&self, model_id: impl Into<String>) {
        self.simulated_timeouts.lock().await.insert(model_id.into());
    }

    pub async fn recorded_executions(&self) -> Vec<String> {
        self.execution_log.lock().await.clone()
    }

    pub async fn switch_count(&self) -> u32 {
        *self.switch_count.lock().await
    }

    pub async fn warm_reuse_count(&self) -> u32 {
        *self.warm_reuse_count.lock().await
    }
}

#[async_trait::async_trait]
impl ModelRunner for MockModelRunner {
    async fn active_model_id(&self) -> Option<String> {
        self.active_model.lock().await.clone()
    }

    async fn shutdown_active(&self) -> Result<(), String> {
        *self.active_model.lock().await = None;
        *self.active_pid.lock().await = None;
        Ok(())
    }

    async fn run_inference(
        &self,
        spec: &ResolvedModelSpec,
        _prompt: &StructuredAiPrompt,
        timeout_secs: u64,
    ) -> Result<RawInferenceOutput, ExecutionError> {
        self.execution_log.lock().await.push(spec.model_id.clone());

        // Manejo de ciclo de vida en el mock
        let mut active = self.active_model.lock().await;
        if let Some(ref current) = *active {
            if current == &spec.model_id {
                *self.warm_reuse_count.lock().await += 1;
            } else {
                *self.switch_count.lock().await += 1;
                *active = Some(spec.model_id.clone());
                *self.active_pid.lock().await = Some(20000 + *self.switch_count.lock().await);
            }
        } else {
            *active = Some(spec.model_id.clone());
            *self.active_pid.lock().await = Some(10001);
        }

        // Comprobar si se debe simular una caída súbita del proceso
        if self.simulated_crashes.lock().await.contains(&spec.model_id) {
            *active = None;
            *self.active_pid.lock().await = None;
            return Err(ExecutionError::ProcessExited {
                exit_code: Some(137), // SIGKILL simulado
                model: spec.model_id.clone(),
            });
        }

        // Comprobar si se debe simular un timeout
        if self
            .simulated_timeouts
            .lock()
            .await
            .contains(&spec.model_id)
        {
            return Err(ExecutionError::Timeout(timeout_secs));
        }

        let mut map = self.responses.lock().await;
        if let Some(res) = map.remove(&spec.model_id) {
            let content = res?;
            Ok(RawInferenceOutput {
                content,
                latency_ms: 42,
                prompt_tokens: 150,
                completion_tokens: 60,
                http_status: 200,
                model_reported: Some(spec.model_id.clone()),
            })
        } else {
            // Default valid empty object if not specified
            Ok(RawInferenceOutput {
                content: "{}".to_string(),
                latency_ms: 10,
                prompt_tokens: 10,
                completion_tokens: 10,
                http_status: 200,
                model_reported: Some(spec.model_id.clone()),
            })
        }
    }
}

/// Ejecutor orquestador que cierra la brecha entre `RoutingDecision`, ciclo de vida y ejecución gobernada.
pub struct RoutedModelExecutor {
    router: CapabilityRouter,
    registry: ModelRegistry,
    models_dir: PathBuf,
    runner: Arc<dyn ModelRunner>,
}

impl RoutedModelExecutor {
    pub fn new(
        router: CapabilityRouter,
        registry: ModelRegistry,
        models_dir: PathBuf,
        runner: Arc<dyn ModelRunner>,
    ) -> Self {
        Self {
            router,
            registry,
            models_dir,
            runner,
        }
    }

    pub fn router(&self) -> &CapabilityRouter {
        &self.router
    }

    pub fn registry(&self) -> &ModelRegistry {
        &self.registry
    }

    pub async fn active_model(&self) -> Option<String> {
        self.runner.active_model_id().await
    }

    pub async fn shutdown_runtime(&self) -> Result<(), String> {
        self.runner.shutdown_active().await
    }

    /// Ejecuta el flujo completo de routing determinista y ejecución gobernada.
    pub async fn execute_routed<T: DeserializeOwned>(
        &self,
        requirements: &TaskRequirements,
        prompt: &StructuredAiPrompt,
    ) -> Result<(T, ModelExecutionTrace), ExecutionError> {
        let decision = self
            .router
            .route_task(requirements)
            .map_err(|e| ExecutionError::RoutingFailed(e.to_string()))?;

        self.execute_with_decision(&decision, requirements, prompt)
            .await
    }

    /// Ejecuta con una decisión ya obtenida, permitiendo fallback ordenado y prevención de desvío.
    pub async fn execute_with_decision<T: DeserializeOwned>(
        &self,
        decision: &RoutingDecision,
        requirements: &TaskRequirements,
        prompt: &StructuredAiPrompt,
    ) -> Result<(T, ModelExecutionTrace), ExecutionError> {
        // 1. Intentar resolver y ejecutar el modelo seleccionado (primary)
        let primary_spec = match self
            .registry
            .resolve_model_spec(&decision.selected_model, &self.models_dir)
        {
            Ok(spec) => spec,
            Err(e) => {
                let err = Self::map_resolution_error(e);
                warn!(
                    "Primary routed model '{}' failed resolution: {}. Evaluating fallback chain.",
                    decision.selected_model, err
                );
                return self
                    .try_fallback_execution(decision, requirements, prompt, err)
                    .await;
            }
        };

        let mut trace = self.create_initial_trace(decision, &primary_spec);

        let primary_res = self
            .try_execute_spec(&primary_spec, prompt, &mut trace)
            .await;

        match primary_res {
            Ok(raw_output) => {
                // Validación del resultado
                self.validate_and_finalize(raw_output, prompt, &mut trace)
            }
            Err(primary_err) => {
                warn!(
                    "Primary routed model '{}' failed execution: {}. Evaluating fallback chain.",
                    decision.selected_model, primary_err
                );
                self.try_fallback_execution(decision, requirements, prompt, primary_err)
                    .await
            }
        }
    }

    /// Maneja la cadena ordenada de fallback ante fallo de carga o caída del proceso.
    async fn try_fallback_execution<T: DeserializeOwned>(
        &self,
        decision: &RoutingDecision,
        requirements: &TaskRequirements,
        prompt: &StructuredAiPrompt,
        primary_err: ExecutionError,
    ) -> Result<(T, ModelExecutionTrace), ExecutionError> {
        for candidate_id in &decision.fallback_chain {
            // Si la tarea es crítica o de alta seguridad, verificar que el fallback no sea inseguro (§73)
            if requirements.security_level >= SecurityLevel::High
                && candidate_id.to_lowercase().contains("gemma")
                && requirements.content_trust.is_untrusted()
            {
                warn!(
                    "Skipping fallback '{}': ineligible for high-security untrusted content.",
                    candidate_id
                );
                continue;
            }

            let fallback_spec = match self
                .registry
                .resolve_model_spec(candidate_id, &self.models_dir)
            {
                Ok(spec) => spec,
                Err(err) => {
                    warn!(
                        "Fallback candidate '{}' failed resolution: {:?}",
                        candidate_id, err
                    );
                    continue;
                }
            };

            let mut fb_trace = self.create_initial_trace(decision, &fallback_spec);
            fb_trace.fallback_used = Some(candidate_id.clone());
            fb_trace.fallback_reason = Some(format!(
                "Primary '{}' failed: {}",
                decision.selected_model, primary_err
            ));

            match self
                .try_execute_spec(&fallback_spec, prompt, &mut fb_trace)
                .await
            {
                Ok(raw_output) => {
                    return self.validate_and_finalize(raw_output, prompt, &mut fb_trace);
                }
                Err(fb_err) => {
                    warn!(
                        "Fallback candidate '{}' also failed: {}",
                        candidate_id, fb_err
                    );
                }
            }
        }

        Err(ExecutionError::NoEligibleFallback {
            primary: decision.selected_model.clone(),
            reason: primary_err.to_string(),
        })
    }

    fn create_initial_trace(
        &self,
        decision: &RoutingDecision,
        spec: &ResolvedModelSpec,
    ) -> ModelExecutionTrace {
        ModelExecutionTrace {
            routing_policy_version: decision.policy_version.clone(),
            task_type: decision.task_type,
            requested_model: decision.selected_model.clone(),
            resolved_model: spec.model_id.clone(),
            resolved_path: spec.path.clone(),
            expected_sha256: spec.expected_sha256.clone(),
            actual_sha256: None,
            verified_marker_sha256: spec.verify_marker().ok(),
            load_status: ModelLoadStatus::NotStarted,
            execution_status: ModelExecutionStatus::Resolved,
            latency_ms: None,
            prompt_tokens: None,
            completion_tokens: None,
            fallback_used: None,
            fallback_reason: None,
            validation_status: None,
            process_state: Some(ProcessState::NotStarted),
            lifecycle_state: Some(ModelLifecycleState::Resolved),
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }

    fn map_resolution_error(e: ModelResolutionError) -> ExecutionError {
        match e {
            ModelResolutionError::ModelNotFound(id) => ExecutionError::ModelNotRegistered(id),
            ModelResolutionError::FileNotFound(p) => ExecutionError::ModelPathNotFound(p),
            ModelResolutionError::MarkerNotFound(p) => {
                ExecutionError::ModelNotAvailable(format!("Missing marker: {}", p.display()))
            }
            ModelResolutionError::HashMismatch { expected, actual } => {
                ExecutionError::ModelHashMismatch { expected, actual }
            }
            ModelResolutionError::IoError(msg) => ExecutionError::ModelLoadFailed(msg),
        }
    }

    /// Intenta ejecutar un modelo específico ya resuelto actualizando el trace.
    async fn try_execute_spec(
        &self,
        spec: &ResolvedModelSpec,
        prompt: &StructuredAiPrompt,
        trace: &mut ModelExecutionTrace,
    ) -> Result<RawInferenceOutput, ExecutionError> {
        trace.load_status = ModelLoadStatus::LoadStarted;
        trace.lifecycle_state = Some(ModelLifecycleState::LoadStarted);

        let output = match self.runner.run_inference(spec, prompt, 180).await {
            Ok(out) => out,
            Err(e) => {
                trace.load_status = ModelLoadStatus::LoadFailed(e.to_string());
                trace.execution_status = ModelExecutionStatus::Failed(e.to_string());
                trace.lifecycle_state = Some(ModelLifecycleState::Failed(e.to_string()));
                if let ExecutionError::ProcessExited { exit_code, .. } = &e {
                    trace.process_state = Some(ProcessState::Exited {
                        exit_code: *exit_code,
                    });
                }
                return Err(e);
            }
        };

        trace.load_status = ModelLoadStatus::Loaded;
        trace.execution_status = ModelExecutionStatus::Executed;
        trace.lifecycle_state = Some(ModelLifecycleState::Executing);
        trace.latency_ms = Some(output.latency_ms);
        trace.prompt_tokens = Some(output.prompt_tokens as u32);
        trace.completion_tokens = Some(output.completion_tokens as u32);

        Ok(output)
    }

    /// Valida el output crudo con normalización de transporte y deserialización Serde tipada.
    fn validate_and_finalize<T: DeserializeOwned>(
        &self,
        raw_output: RawInferenceOutput,
        prompt: &StructuredAiPrompt,
        trace: &mut ModelExecutionTrace,
    ) -> Result<(T, ModelExecutionTrace), ExecutionError> {
        let normalized = normalize_transport_json(&raw_output.content, &prompt.schema_name)
            .map_err(|e| {
                trace.validation_status = Some(format!("FAILED_TRANSPORT_NORMALIZATION: {e}"));
                trace.execution_status = ModelExecutionStatus::Failed(e.to_string());
                trace.lifecycle_state = Some(ModelLifecycleState::Failed(e.to_string()));
                ExecutionError::ValidationFailed(e.to_string())
            })?;

        let parsed: T = serde_json::from_value(normalized).map_err(|e| {
            trace.validation_status = Some(format!("FAILED_SCHEMA_VALIDATION: {e}"));
            trace.execution_status = ModelExecutionStatus::Failed(e.to_string());
            trace.lifecycle_state = Some(ModelLifecycleState::Failed(e.to_string()));
            ExecutionError::ValidationFailed(format!(
                "Schema validation failed for '{}': {e}",
                prompt.schema_name
            ))
        })?;

        trace.validation_status = Some("PASS".to_string());
        trace.execution_status = ModelExecutionStatus::Validated;
        trace.lifecycle_state = Some(ModelLifecycleState::Validated);

        Ok((parsed, trace.clone()))
    }

    /// Intenta forzar la ejecución de un modelo no seleccionado.
    /// Si el modelo intentado difiere del seleccionado y no es un fallback explícito,
    /// bloquea la ejecución inmediatamente (§23 Test 6 - No Deviation).
    pub async fn execute_with_enforced_model<T: DeserializeOwned>(
        &self,
        decision: &RoutingDecision,
        model_to_attempt: &str,
        prompt: &StructuredAiPrompt,
    ) -> Result<(T, ModelExecutionTrace), ExecutionError> {
        let is_routed = decision.selected_model == model_to_attempt;
        let is_authorized_fallback = decision
            .fallback_chain
            .iter()
            .any(|f| f == model_to_attempt);

        if !is_routed && !is_authorized_fallback {
            let _trace = ModelExecutionTrace {
                routing_policy_version: decision.policy_version.clone(),
                task_type: decision.task_type,
                requested_model: decision.selected_model.clone(),
                resolved_model: model_to_attempt.to_string(),
                resolved_path: PathBuf::new(),
                expected_sha256: None,
                actual_sha256: None,
                verified_marker_sha256: None,
                load_status: ModelLoadStatus::NotStarted,
                execution_status: ModelExecutionStatus::DeviationBlocked(format!(
                    "Attempted '{}' which violates routing decision '{}'",
                    model_to_attempt, decision.selected_model
                )),
                latency_ms: None,
                prompt_tokens: None,
                completion_tokens: None,
                fallback_used: None,
                fallback_reason: None,
                validation_status: Some("BLOCKED_BY_NO_DEVIATION_POLICY".to_string()),
                process_state: None,
                lifecycle_state: Some(ModelLifecycleState::Failed("DEVIATION_BLOCKED".to_string())),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };

            return Err(ExecutionError::RoutingExecutionMismatch {
                routed: decision.selected_model.clone(),
                attempted: model_to_attempt.to_string(),
            });
        }

        // Si es el modelo seleccionado o un fallback autorizado, se ejecuta normalmente
        let spec = self
            .registry
            .resolve_model_spec(model_to_attempt, &self.models_dir)
            .map_err(Self::map_resolution_error)?;

        let mut trace = self.create_initial_trace(decision, &spec);
        if !is_routed {
            trace.fallback_used = Some(model_to_attempt.to_string());
            trace.fallback_reason = Some("Authorized explicit fallback execution".to_string());
        }

        let raw = self.try_execute_spec(&spec, prompt, &mut trace).await?;
        self.validate_and_finalize(raw, prompt, &mut trace)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::ai_task::AiTaskType;
    use crate::domain::routing::ContentTrust;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    struct DummyResponse {
        pub status: String,
        pub items_processed: u32,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    struct RecipeResponse {
        pub title: String,
        pub servings: u32,
    }

    fn test_models_dir() -> PathBuf {
        let candidates = [
            PathBuf::from("../data/llm-models"),
            PathBuf::from("data/llm-models"),
            crate::db::data_dir_path().join("llm-models"),
        ];
        for c in candidates {
            if c.exists() {
                return c;
            }
        }
        PathBuf::from("../data/llm-models")
    }

    /// TEST 1 — FAST OPERATIONAL (§18)
    /// TaskType: FastOperationalTask
    /// Router must select Qwen2.5-1.5B -> Resolved -> Executed -> Validated.
    #[tokio::test]
    async fn test_1_fast_operational_routed_execution() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        mock_runner
            .set_response(
                "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
                Ok(r#"{"status": "ok", "items_processed": 5}"#.to_string()),
            )
            .await;

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        let reqs = TaskRequirements::fast_operational();
        let prompt = StructuredAiPrompt::new(
            AiTaskType::SemanticSummarization,
            "Eres un clasificador rápido.",
            "Contenido a clasificar.",
            "DummyResponse",
        );

        let result: Result<(DummyResponse, ModelExecutionTrace), ExecutionError> =
            executor.execute_routed(&reqs, &prompt).await;

        assert!(
            result.is_ok(),
            "Fast operational execution failed: {:?}",
            result.err()
        );
        let (data, trace) = result.unwrap();

        assert_eq!(data.status, "ok");
        assert_eq!(data.items_processed, 5);
        assert_eq!(trace.requested_model, "Qwen/Qwen2.5-1.5B-Instruct-GGUF");
        assert_eq!(trace.resolved_model, "Qwen/Qwen2.5-1.5B-Instruct-GGUF");
        assert_eq!(trace.load_status, ModelLoadStatus::Loaded);
        assert_eq!(trace.execution_status, ModelExecutionStatus::Validated);
        assert_eq!(trace.validation_status.as_deref(), Some("PASS"));

        let executed = mock_runner.recorded_executions().await;
        assert_eq!(executed, vec!["Qwen/Qwen2.5-1.5B-Instruct-GGUF"]);
    }

    /// TEST 2 — SECURITY-SENSITIVE (§19)
    /// TaskType: SecuritySensitiveExtraction with UntrustedPublic
    /// Router must select Qwen2.5-3B. Gemma must NOT be selected or executed.
    #[tokio::test]
    async fn test_2_security_sensitive_routed_execution() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        mock_runner
            .set_response(
                "Qwen/Qwen2.5-3B-Instruct-GGUF",
                Ok(r#"{"status": "sanitized", "items_processed": 1}"#.to_string()),
            )
            .await;

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        let reqs = TaskRequirements::security_sensitive(ContentTrust::UntrustedPublic);
        let prompt = StructuredAiPrompt::new(
            AiTaskType::EntityExtraction,
            "Eres un auditor de seguridad.",
            "Texto no confiable con potencial inyección.",
            "DummyResponse",
        );

        let result: Result<(DummyResponse, ModelExecutionTrace), ExecutionError> =
            executor.execute_routed(&reqs, &prompt).await;

        assert!(
            result.is_ok(),
            "Security sensitive execution failed: {:?}",
            result.err()
        );
        let (data, trace) = result.unwrap();

        assert_eq!(data.status, "sanitized");
        assert_eq!(trace.requested_model, "Qwen/Qwen2.5-3B-Instruct-GGUF");
        assert_eq!(trace.load_status, ModelLoadStatus::Loaded);
        assert_eq!(trace.execution_status, ModelExecutionStatus::Validated);

        // Gemma must never have been called
        let executed = mock_runner.recorded_executions().await;
        assert_eq!(executed, vec!["Qwen/Qwen2.5-3B-Instruct-GGUF"]);
        assert!(!executed.iter().any(|m| m.contains("gemma")));
    }

    /// TEST 3 — HIGH FIDELITY RECIPE (§20)
    /// TaskType: RecipeExtraction with TrustedCurated
    /// Router selects Gemma-2-2B. Gemma is executed and output validated.
    #[tokio::test]
    async fn test_3_high_fidelity_recipe_routed_execution() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        mock_runner
            .set_response(
                "bartowski/gemma-2-2b-it-GGUF",
                Ok(r#"{"title": "Risotto ai Funghi Porcini", "servings": 4}"#.to_string()),
            )
            .await;

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        let reqs = TaskRequirements::recipe_extraction(ContentTrust::TrustedCurated);
        let prompt = StructuredAiPrompt::new(
            AiTaskType::RecipeTransformation,
            "Eres un chef culinario de alta precisión.",
            "Transcripción de preparación de risotto.",
            "RecipeResponse",
        );

        let result: Result<(RecipeResponse, ModelExecutionTrace), ExecutionError> =
            executor.execute_routed(&reqs, &prompt).await;

        assert!(
            result.is_ok(),
            "High fidelity execution failed: {:?}",
            result.err()
        );
        let (recipe, trace) = result.unwrap();

        assert_eq!(recipe.title, "Risotto ai Funghi Porcini");
        assert_eq!(recipe.servings, 4);
        assert_eq!(trace.requested_model, "bartowski/gemma-2-2b-it-GGUF");
        assert_eq!(trace.execution_status, ModelExecutionStatus::Validated);

        let executed = mock_runner.recorded_executions().await;
        assert_eq!(executed, vec!["bartowski/gemma-2-2b-it-GGUF"]);
    }

    /// TEST 4 — PRIMARY MODEL UNAVAILABLE (§21)
    /// Router selects primary X, load fails -> Explicit fallback Y executed.
    #[tokio::test]
    async fn test_4_primary_model_unavailable_fallback() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        // Make primary (Gemma 2B) fail to load
        mock_runner
            .set_response(
                "bartowski/gemma-2-2b-it-GGUF",
                Err(ExecutionError::ModelLoadFailed("OOM simulated".to_string())),
            )
            .await;

        // Fallback candidate (Qwen 3B) succeeds
        mock_runner
            .set_response(
                "Qwen/Qwen2.5-3B-Instruct-GGUF",
                Ok(r#"{"title": "Receta Fallback", "servings": 2}"#.to_string()),
            )
            .await;

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        let reqs = TaskRequirements::recipe_extraction(ContentTrust::TrustedCurated);
        let prompt = StructuredAiPrompt::new(
            AiTaskType::RecipeTransformation,
            "Chef.",
            "Texto.",
            "RecipeResponse",
        );

        let result: Result<(RecipeResponse, ModelExecutionTrace), ExecutionError> =
            executor.execute_routed(&reqs, &prompt).await;

        assert!(
            result.is_ok(),
            "Fallback execution failed: {:?}",
            result.err()
        );
        let (data, trace) = result.unwrap();

        assert_eq!(data.title, "Receta Fallback");
        assert_eq!(data.servings, 2);
        assert_eq!(trace.requested_model, "bartowski/gemma-2-2b-it-GGUF");
        assert!(trace.fallback_used.is_some());
        assert!(trace.fallback_reason.is_some());
        assert_eq!(trace.execution_status, ModelExecutionStatus::Validated);

        let executed = mock_runner.recorded_executions().await;
        assert_eq!(
            executed,
            vec![
                "bartowski/gemma-2-2b-it-GGUF",
                "Qwen/Qwen2.5-3B-Instruct-GGUF"
            ]
        );
    }

    /// TEST 5 — SAFE FAILURE (§22)
    /// Primary unavailable and all valid fallbacks unavailable -> SAFE FAILURE.
    /// Never silently falls back to random model or global default.
    #[tokio::test]
    async fn test_5_safe_failure_when_all_fail() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        // Make both primary and all fallbacks fail
        mock_runner
            .set_response(
                "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
                Err(ExecutionError::ModelLoadFailed(
                    "Hardware error 1".to_string(),
                )),
            )
            .await;
        mock_runner
            .set_response(
                "Qwen/Qwen2.5-3B-Instruct-GGUF",
                Err(ExecutionError::ModelLoadFailed(
                    "Hardware error 2".to_string(),
                )),
            )
            .await;
        mock_runner
            .set_response(
                "bartowski/gemma-2-2b-it-GGUF",
                Err(ExecutionError::ModelLoadFailed(
                    "Hardware error 3".to_string(),
                )),
            )
            .await;

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        let reqs = TaskRequirements::fast_operational();
        let prompt = StructuredAiPrompt::new(
            AiTaskType::SemanticSummarization,
            "Clasificador.",
            "Texto.",
            "DummyResponse",
        );

        let result: Result<(DummyResponse, ModelExecutionTrace), ExecutionError> =
            executor.execute_routed(&reqs, &prompt).await;

        assert!(
            result.is_err(),
            "Expected safe failure when all candidates fail"
        );
        assert!(matches!(
            result.err().unwrap(),
            ExecutionError::NoEligibleFallback { .. }
        ));
    }

    /// TEST 6 — NO DEVIATION (§23)
    /// Router selects A. Attempting to force B must be blocked with RoutingExecutionMismatch.
    #[tokio::test]
    async fn test_6_no_deviation_enforcement() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        let reqs = TaskRequirements::security_sensitive(ContentTrust::UntrustedPublic);
        let decision = executor.router.route_task(&reqs).expect("route decision");
        assert_eq!(decision.selected_model, "Qwen/Qwen2.5-3B-Instruct-GGUF");

        let prompt = StructuredAiPrompt::new(
            AiTaskType::EntityExtraction,
            "Auditor.",
            "Input.",
            "DummyResponse",
        );

        // Attempting to deliberately force Gemma when Qwen3B was selected and Gemma is not in fallback
        let forced_result: Result<(DummyResponse, ModelExecutionTrace), ExecutionError> = executor
            .execute_with_enforced_model(&decision, "bartowski/gemma-2-2b-it-GGUF", &prompt)
            .await;

        assert!(
            forced_result.is_err(),
            "Deviation must be blocked by policy!"
        );
        let err = forced_result.err().unwrap();
        assert!(matches!(
            err,
            ExecutionError::RoutingExecutionMismatch { .. }
        ));

        // Ensure zero executions took place
        let executed = mock_runner.recorded_executions().await;
        assert!(
            executed.is_empty(),
            "No inference can take place when deviation is detected!"
        );
    }

    /// TEST 7 — MODEL IDENTITY RESOLUTION (§24)
    /// Verify that ModelId resolves to actual disk file, size, and marker SHA-256.
    #[test]
    fn test_7_model_identity_resolution() {
        let registry = ModelRegistry::default();
        let models_dir = test_models_dir();

        let spec_15 = registry
            .resolve_model_spec("Qwen/Qwen2.5-1.5B-Instruct-GGUF", &models_dir)
            .expect("resolve 1.5B");

        assert_eq!(spec_15.filename, "qwen2.5-1.5b-instruct-q4_k_m.gguf");
        assert!(spec_15.path.ends_with("qwen2.5-1.5b-instruct-q4_k_m.gguf"));

        if spec_15.path.exists() {
            assert!(spec_15.verify_presence().is_ok());
            if spec_15.verified_marker_path.exists() {
                let marker_hash = spec_15.verify_marker().expect("verify marker");
                assert_eq!(
                    Some(marker_hash),
                    spec_15.expected_sha256,
                    "Marker SHA must match expected SHA"
                );
            }
        }
    }

    /// TEST 8 — REAL LLAMA-SERVER RUNTIME (§25, §62)
    /// Real execution reaching actual llama-server with real GGUF weights.
    #[tokio::test]
    async fn test_8_real_llama_server_runtime_execution() {
        let bin = crate::runtime::binary("llama-server.exe");
        if !bin.is_file() {
            println!(
                "SKIPPING test_8: llama-server.exe not found at {}",
                bin.display()
            );
            return;
        }

        let models_dir = test_models_dir();
        let qwen_gguf = models_dir.join("qwen2.5-1.5b-instruct-q4_k_m.gguf");
        if !qwen_gguf.is_file() {
            println!(
                "SKIPPING test_8: weights not found at {}",
                qwen_gguf.display()
            );
            return;
        }

        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let real_runner = Arc::new(RealSidecarRunner::new(false)); // CPU mode

        let executor = RoutedModelExecutor::new(router, registry, models_dir, real_runner);

        let reqs = TaskRequirements::fast_operational();
        let prompt = StructuredAiPrompt::new(
            AiTaskType::SemanticSummarization,
            "Eres un asistente de clasificación. Responde exclusivamente JSON con campos status (string) y items_processed (integer).",
            "Clasifica el siguiente elemento: '1 manzana fresca'.",
            "DummyResponse",
        );

        let start = std::time::Instant::now();
        let result: Result<(DummyResponse, ModelExecutionTrace), ExecutionError> =
            executor.execute_routed(&reqs, &prompt).await;

        assert!(
            result.is_ok(),
            "Real runtime execution failed: {:?}",
            result.err()
        );
        let (data, trace) = result.unwrap();

        println!("=== REAL RUNTIME EXECUTION PROOF ===");
        println!("Requested Model: {}", trace.requested_model);
        println!("Resolved Model: {}", trace.resolved_model);
        println!("Resolved GGUF Path: {}", trace.resolved_path.display());
        println!("Verified Marker SHA: {:?}", trace.verified_marker_sha256);
        println!("Load Status: {:?}", trace.load_status);
        println!("Execution Status: {:?}", trace.execution_status);
        println!("Latency: {:?} ms", trace.latency_ms);
        println!("Prompt Tokens: {:?}", trace.prompt_tokens);
        println!("Completion Tokens: {:?}", trace.completion_tokens);
        println!("Validation Status: {:?}", trace.validation_status);
        println!("Output Data: {:?}", data);
        println!("Total Test Elapsed: {:?}", start.elapsed());

        assert_eq!(trace.requested_model, "Qwen/Qwen2.5-1.5B-Instruct-GGUF");
        assert_eq!(trace.resolved_model, "Qwen/Qwen2.5-1.5B-Instruct-GGUF");
        assert_eq!(trace.load_status, ModelLoadStatus::Loaded);
        assert_eq!(trace.execution_status, ModelExecutionStatus::Validated);
        assert_eq!(trace.validation_status.as_deref(), Some("PASS"));
        assert!(trace.latency_ms.is_some());
        assert!(trace.latency_ms.unwrap() > 0);
    }

    /// TEST 9 — LIFECYCLE STATE MACHINE TRANSITIONS (§2, Mega Prompt 09)
    #[test]
    fn test_9_lifecycle_state_machine_transitions() {
        // Valid transitions
        let st_reg = ModelLifecycleState::Registered;
        assert!(!st_reg.is_ready_for_execution());
        assert!(!st_reg.is_terminal_failure());

        let st_ready = ModelLifecycleState::Ready;
        assert!(st_ready.is_ready_for_execution());

        let st_loaded = ModelLifecycleState::Loaded;
        assert!(st_loaded.is_ready_for_execution());

        let st_exec = ModelLifecycleState::Executing;
        assert!(!st_exec.is_ready_for_execution());

        let st_failed = ModelLifecycleState::Failed("Crash".to_string());
        assert!(st_failed.is_terminal_failure());
        assert!(!st_failed.is_ready_for_execution());
    }

    /// TEST 10 — SINGLE ACTIVE MODEL INVARIANT (§3, §18 Invariant 1)
    /// MAX_ACTIVE_MODELS = 1 at all times.
    #[tokio::test]
    async fn test_10_single_active_model_invariant() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        assert_eq!(executor.active_model().await, None);

        // Run model A
        let reqs_a = TaskRequirements::fast_operational();
        let prompt_a =
            StructuredAiPrompt::new(AiTaskType::SemanticSummarization, "A", "A", "DummyResponse");
        let _ = executor
            .execute_routed::<DummyResponse>(&reqs_a, &prompt_a)
            .await;

        assert_eq!(
            executor.active_model().await.as_deref(),
            Some("Qwen/Qwen2.5-1.5B-Instruct-GGUF")
        );

        // Run model B
        let reqs_b = TaskRequirements::security_sensitive(ContentTrust::UntrustedPublic);
        let prompt_b =
            StructuredAiPrompt::new(AiTaskType::EntityExtraction, "B", "B", "DummyResponse");
        let _ = executor
            .execute_routed::<DummyResponse>(&reqs_b, &prompt_b)
            .await;

        // Invariant check: only Model B is active now, not both!
        assert_eq!(
            executor.active_model().await.as_deref(),
            Some("Qwen/Qwen2.5-3B-Instruct-GGUF")
        );
    }

    /// TEST 11 — CONTROLLED PROCESS RESTART MODEL SWITCH (§4, §5)
    /// A -> B terminates A, starts B, increments switch_count.
    #[tokio::test]
    async fn test_11_controlled_process_restart_model_switch() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        // Step 1: Model A (Qwen 1.5B)
        let reqs_a = TaskRequirements::fast_operational();
        let prompt = StructuredAiPrompt::new(
            AiTaskType::SemanticSummarization,
            "Prompt",
            "Context",
            "DummyResponse",
        );
        let _ = executor
            .execute_routed::<DummyResponse>(&reqs_a, &prompt)
            .await;

        assert_eq!(mock_runner.switch_count().await, 0); // first start, not a switch

        // Step 2: Switch to Model B (Qwen 3B)
        let reqs_b = TaskRequirements::security_sensitive(ContentTrust::UntrustedPublic);
        let _ = executor
            .execute_routed::<DummyResponse>(&reqs_b, &prompt)
            .await;

        assert_eq!(mock_runner.switch_count().await, 1); // exactly 1 switch
        assert_eq!(
            executor.active_model().await.as_deref(),
            Some("Qwen/Qwen2.5-3B-Instruct-GGUF")
        );

        // Step 3: Switch back to Model A (Qwen 1.5B)
        let _ = executor
            .execute_routed::<DummyResponse>(&reqs_a, &prompt)
            .await;
        assert_eq!(mock_runner.switch_count().await, 2); // 2nd switch
        assert_eq!(
            executor.active_model().await.as_deref(),
            Some("Qwen/Qwen2.5-1.5B-Instruct-GGUF")
        );
    }

    /// TEST 12 — WARM MODEL REUSE (§4, Invariant A -> A)
    /// Multiple executions of the same model reuse the active instance without restart.
    #[tokio::test]
    async fn test_12_warm_model_reuse() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        let reqs = TaskRequirements::fast_operational();
        let prompt = StructuredAiPrompt::new(
            AiTaskType::SemanticSummarization,
            "Prompt",
            "Context",
            "DummyResponse",
        );

        // 1st run: fresh start
        let _ = executor
            .execute_routed::<DummyResponse>(&reqs, &prompt)
            .await;
        assert_eq!(mock_runner.warm_reuse_count().await, 0);

        // 2nd run: warm reuse
        let _ = executor
            .execute_routed::<DummyResponse>(&reqs, &prompt)
            .await;
        assert_eq!(mock_runner.warm_reuse_count().await, 1);

        // 3rd run: warm reuse
        let _ = executor
            .execute_routed::<DummyResponse>(&reqs, &prompt)
            .await;
        assert_eq!(mock_runner.warm_reuse_count().await, 2);

        // Switch count remains 0 throughout
        assert_eq!(mock_runner.switch_count().await, 0);
    }

    /// TEST 13 — PROCESS CRASH DETECTION AND RECOVERY (§7, §15)
    /// If primary process crashes during execution, runner detects ProcessExited,
    /// clears zombie state, and recovers cleanly via fallback.
    #[tokio::test]
    async fn test_13_process_crash_detection_and_recovery() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        // Primary (Gemma 2B) will crash with SIGKILL 137
        mock_runner
            .simulate_crash_on("bartowski/gemma-2-2b-it-GGUF")
            .await;

        // Fallback (Qwen 3B) will succeed
        mock_runner
            .set_response(
                "Qwen/Qwen2.5-3B-Instruct-GGUF",
                Ok(r#"{"title": "Receta Recuperada", "servings": 4}"#.to_string()),
            )
            .await;

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        let reqs = TaskRequirements::recipe_extraction(ContentTrust::TrustedCurated);
        let prompt = StructuredAiPrompt::new(
            AiTaskType::RecipeTransformation,
            "Chef.",
            "Texto.",
            "RecipeResponse",
        );

        let result: Result<(RecipeResponse, ModelExecutionTrace), ExecutionError> =
            executor.execute_routed(&reqs, &prompt).await;

        assert!(
            result.is_ok(),
            "Execution should recover from crash via fallback: {:?}",
            result.err()
        );
        let (data, trace) = result.unwrap();

        assert_eq!(data.title, "Receta Recuperada");
        assert_eq!(trace.requested_model, "bartowski/gemma-2-2b-it-GGUF");
        assert_eq!(
            trace.fallback_used.as_deref(),
            Some("Qwen/Qwen2.5-3B-Instruct-GGUF")
        );
        assert_eq!(trace.execution_status, ModelExecutionStatus::Validated);

        // The active model in runner is now the recovered fallback
        assert_eq!(
            executor.active_model().await.as_deref(),
            Some("Qwen/Qwen2.5-3B-Instruct-GGUF")
        );
    }

    /// TEST 14 — EXECUTION TIMEOUT CLASSIFICATION (§9)
    #[tokio::test]
    async fn test_14_execution_timeout_classification() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        mock_runner
            .simulate_timeout_on("Qwen/Qwen2.5-1.5B-Instruct-GGUF")
            .await;

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        let reqs = TaskRequirements::fast_operational();
        let prompt = StructuredAiPrompt::new(
            AiTaskType::SemanticSummarization,
            "Prompt",
            "Context",
            "DummyResponse",
        );

        let result: Result<(DummyResponse, ModelExecutionTrace), ExecutionError> =
            executor.execute_routed(&reqs, &prompt).await;

        assert!(result.is_err());
        assert!(matches!(
            result.err().unwrap(),
            ExecutionError::NoEligibleFallback { .. }
        ));
    }

    /// TEST 15 — CLEAN SHUTDOWN AND PROCESS CLEANUP (§11, Invariant 8)
    #[tokio::test]
    async fn test_15_clean_shutdown_and_process_cleanup() {
        let models_dir = test_models_dir();
        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let mock_runner = Arc::new(MockModelRunner::new());

        let executor = RoutedModelExecutor::new(router, registry, models_dir, mock_runner.clone());

        let reqs = TaskRequirements::fast_operational();
        let prompt = StructuredAiPrompt::new(
            AiTaskType::SemanticSummarization,
            "Prompt",
            "Context",
            "DummyResponse",
        );

        let _ = executor
            .execute_routed::<DummyResponse>(&reqs, &prompt)
            .await;
        assert!(executor.active_model().await.is_some());

        // Perform clean shutdown
        let shutdown_res = executor.shutdown_runtime().await;
        assert!(shutdown_res.is_ok());
        assert_eq!(executor.active_model().await, None);
    }

    /// TEST 16 — REAL RUNTIME CONTROLLED MODEL SWITCH (§5, §19, Mega Prompt 09)
    /// Real execution against live llama-server.exe switching between Qwen 1.5B and Qwen 3B.
    #[tokio::test]
    async fn test_16_real_runtime_controlled_model_switch() {
        let bin = crate::runtime::binary("llama-server.exe");
        if !bin.is_file() {
            println!(
                "SKIPPING test_16: llama-server.exe not found at {}",
                bin.display()
            );
            return;
        }

        let models_dir = test_models_dir();
        let qwen15_gguf = models_dir.join("qwen2.5-1.5b-instruct-q4_k_m.gguf");
        let qwen3b_gguf = models_dir.join("qwen2.5-3b-instruct-q4_k_m.gguf");

        if !qwen15_gguf.is_file() || !qwen3b_gguf.is_file() {
            println!("SKIPPING test_16: weights not found for both models");
            return;
        }

        let router = CapabilityRouter::with_frozen_benchmark_evidence(models_dir.clone());
        let registry = ModelRegistry::default();
        let real_runner = Arc::new(RealSidecarRunner::new(false)); // CPU mode

        let executor = RoutedModelExecutor::new(router, registry, models_dir, real_runner.clone());

        println!("=== REAL RUNTIME MODEL SWITCH TEST ===");

        // STEP 1: Launch and execute Model A (Qwen 1.5B)
        let t0 = Instant::now();
        let reqs_15 = TaskRequirements::fast_operational();
        let prompt_15 = StructuredAiPrompt::new(
            AiTaskType::SemanticSummarization,
            "Responde únicamente JSON con campos status (string) y items_processed (integer).",
            "Elemento: 1 café.",
            "DummyResponse",
        );

        let res_15: Result<(DummyResponse, ModelExecutionTrace), ExecutionError> =
            executor.execute_routed(&reqs_15, &prompt_15).await;

        assert!(
            res_15.is_ok(),
            "Model A execution failed: {:?}",
            res_15.err()
        );
        let (data_15, trace_15) = res_15.unwrap();

        let pid_15 = real_runner.active_pid().await.expect("PID A should exist");
        let port_15 = real_runner
            .active_port()
            .await
            .expect("Port A should exist");
        let latency_15 = trace_15.latency_ms.unwrap_or(0);

        println!("Phase 1 - Model A (Qwen 1.5B):");
        println!("  PID: {}", pid_15);
        println!("  Port: {}", port_15);
        println!("  Inference Latency: {} ms", latency_15);
        println!("  Output: {:?}", data_15);
        println!("  Status: {:?}", trace_15.execution_status);
        assert_eq!(trace_15.requested_model, "Qwen/Qwen2.5-1.5B-Instruct-GGUF");
        assert!(real_runner.is_active_process_alive().await);

        // STEP 2: Controlled Switch to Model B (Qwen 3B)
        let switch_start = Instant::now();
        let reqs_3b = TaskRequirements::security_sensitive(ContentTrust::UntrustedPublic);
        let prompt_3b = StructuredAiPrompt::new(
            AiTaskType::EntityExtraction,
            "Responde únicamente JSON con campos status (string) y items_processed (integer).",
            "Elemento: 1 té.",
            "DummyResponse",
        );

        let res_3b: Result<(DummyResponse, ModelExecutionTrace), ExecutionError> =
            executor.execute_routed(&reqs_3b, &prompt_3b).await;

        assert!(
            res_3b.is_ok(),
            "Model B execution failed: {:?}",
            res_3b.err()
        );
        let (data_3b, trace_3b) = res_3b.unwrap();
        let switch_duration = switch_start.elapsed();

        let pid_3b = real_runner.active_pid().await.expect("PID B should exist");
        let port_3b = real_runner
            .active_port()
            .await
            .expect("Port B should exist");
        let latency_3b = trace_3b.latency_ms.unwrap_or(0);

        println!("Phase 2 - Model B (Qwen 3B) [Controlled Switch]:");
        println!("  PID: {}", pid_3b);
        println!("  Port: {}", port_3b);
        println!("  Switch + Inference Duration: {:?}", switch_duration);
        println!("  Inference Latency: {} ms", latency_3b);
        println!("  Output: {:?}", data_3b);
        println!("  Status: {:?}", trace_3b.execution_status);
        assert_eq!(trace_3b.requested_model, "Qwen/Qwen2.5-3B-Instruct-GGUF");

        // CRITICAL INVARIANT VERIFICATION:
        // PID B must be different from PID A (new process spawned)
        assert_ne!(
            pid_15, pid_3b,
            "Controlled process restart must spawn a new process!"
        );

        // STEP 3: Clean Shutdown & Verification
        let shutdown_start = Instant::now();
        let shutdown_res = real_runner.shutdown_active().await;
        let shutdown_duration = shutdown_start.elapsed();

        assert!(shutdown_res.is_ok());
        assert!(!real_runner.is_active_process_alive().await);
        assert_eq!(real_runner.active_pid().await, None);

        println!("Phase 3 - Clean Shutdown:");
        println!("  Shutdown Duration: {:?}", shutdown_duration);
        println!("  Process Terminated Confirmed: YES");
        println!("Total Real Runtime Test Duration: {:?}", t0.elapsed());
    }
}
