//! # AI Task Contract
//!
//! Contrato genérico y desacoplado para la ejecución, trazabilidad y ciclo
//! de vida de tareas de inteligencia artificial en Pulsaria.
//!
//! 100% Rust puro, sin dependencias de base de datos o frameworks.

use crate::domain::semantic::ModelMetadata;
use serde::{Deserialize, Serialize};
use std::fmt;

/// Tipos de tareas de IA soportadas por la plataforma.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiTaskType {
    DomainDetection,
    EntityExtraction,
    RecipeTransformation,
    StructuredTransformation,
    SemanticSummarization,
    ConflictVerification,
}

impl AiTaskType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::DomainDetection => "domain_detection",
            Self::EntityExtraction => "entity_extraction",
            Self::RecipeTransformation => "recipe_transformation",
            Self::StructuredTransformation => "structured_transformation",
            Self::SemanticSummarization => "semantic_summarization",
            Self::ConflictVerification => "conflict_verification",
        }
    }

    pub fn from_str_canonical(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "domain_detection" | "domain" => Self::DomainDetection,
            "entity_extraction" | "entity" => Self::EntityExtraction,
            "recipe_transformation" | "recipe" => Self::RecipeTransformation,
            "structured_transformation" | "structured" => Self::StructuredTransformation,
            "semantic_summarization" | "summary" => Self::SemanticSummarization,
            "conflict_verification" | "conflict" => Self::ConflictVerification,
            _ => Self::StructuredTransformation,
        }
    }
}

impl fmt::Display for AiTaskType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Estado de ejecución de una tarea de IA.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiTaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
    RequiresReview,
}

impl AiTaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::RequiresReview => "requires_review",
        }
    }

    pub fn from_str_canonical(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "pending" => Self::Pending,
            "running" => Self::Running,
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "cancelled" => Self::Cancelled,
            "requires_review" | "review" => Self::RequiresReview,
            _ => Self::Pending,
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Cancelled | Self::RequiresReview
        )
    }
}

impl fmt::Display for AiTaskStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Registro inmutable de la ejecución de una tarea de inteligencia artificial.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskExecution {
    pub task_id: String,
    pub task_type: AiTaskType,
    pub job_id: i64,
    pub status: AiTaskStatus,
    pub model_metadata: ModelMetadata,
    #[serde(default = "default_schema_version_task")]
    pub schema_version: String,
    #[serde(default)]
    pub input_hash: String,
    #[serde(default)]
    pub output_hash: Option<String>,
    pub duration_ms: u64,
    pub token_usage: Option<u32>,
    #[serde(default)]
    pub tokens_input: Option<u32>,
    #[serde(default)]
    pub tokens_output: Option<u32>,
    pub error_message: Option<String>,
    #[serde(default)]
    pub error_code: Option<String>,
    #[serde(default)]
    pub retry_count: u32,
    #[serde(default)]
    pub started_at: Option<String>,
    pub created_at: String,
    pub finished_at: Option<String>,
}

fn default_schema_version_task() -> String {
    "1.0.0".to_string()
}

impl AiTaskExecution {
    pub fn new(
        task_id: impl Into<String>,
        task_type: AiTaskType,
        job_id: i64,
        model_metadata: ModelMetadata,
        created_at: impl Into<String>,
    ) -> Self {
        let ts = created_at.into();
        Self {
            task_id: task_id.into(),
            task_type,
            job_id,
            status: AiTaskStatus::Pending,
            model_metadata,
            schema_version: "1.0.0".to_string(),
            input_hash: String::new(),
            output_hash: None,
            duration_ms: 0,
            token_usage: None,
            tokens_input: None,
            tokens_output: None,
            error_message: None,
            error_code: None,
            retry_count: 0,
            started_at: None,
            created_at: ts,
            finished_at: None,
        }
    }

    pub fn with_hashes(
        mut self,
        input_hash: impl Into<String>,
        schema_version: impl Into<String>,
    ) -> Self {
        self.input_hash = input_hash.into();
        self.schema_version = schema_version.into();
        self
    }

    pub fn mark_running(&mut self, started_at: impl Into<String>) {
        self.status = AiTaskStatus::Running;
        self.started_at = Some(started_at.into());
    }

    pub fn mark_completed(
        &mut self,
        output_hash: Option<String>,
        duration_ms: u64,
        tokens: Option<u32>,
        finished_at: impl Into<String>,
    ) {
        self.status = AiTaskStatus::Completed;
        self.output_hash = output_hash;
        self.duration_ms = duration_ms;
        self.token_usage = tokens;
        self.finished_at = Some(finished_at.into());
    }

    pub fn mark_failed(
        &mut self,
        error_code: impl Into<String>,
        error_message: impl Into<String>,
        duration_ms: u64,
        finished_at: impl Into<String>,
    ) {
        self.status = AiTaskStatus::Failed;
        self.error_code = Some(error_code.into());
        self.error_message = Some(error_message.into());
        self.duration_ms = duration_ms;
        self.finished_at = Some(finished_at.into());
    }

    pub fn mark_cancelled(&mut self, finished_at: impl Into<String>) {
        self.status = AiTaskStatus::Cancelled;
        self.finished_at = Some(finished_at.into());
    }

    pub fn mark_requires_review(
        &mut self,
        notes: impl Into<String>,
        duration_ms: u64,
        finished_at: impl Into<String>,
    ) {
        self.status = AiTaskStatus::RequiresReview;
        self.error_message = Some(notes.into());
        self.duration_ms = duration_ms;
        self.finished_at = Some(finished_at.into());
    }

    /// Determina si un error es transitorio/recuperable (ej. timeout, socket cerrado)
    /// o definitivo (error semántico, validación rota, datos corruptos).
    pub fn is_recoverable_error(error_code: &str) -> bool {
        matches!(
            error_code,
            "timeout"
                | "temporary_unavailable"
                | "connection_failed"
                | "model_not_ready"
                | "local_llm_client_unavailable"
                | "inference_timeout"
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ai_task_status_terminal() {
        assert!(!AiTaskStatus::Pending.is_terminal());
        assert!(!AiTaskStatus::Running.is_terminal());
        assert!(AiTaskStatus::Completed.is_terminal());
        assert!(AiTaskStatus::Failed.is_terminal());
        assert!(AiTaskStatus::Cancelled.is_terminal());
        assert!(AiTaskStatus::RequiresReview.is_terminal());
    }

    #[test]
    fn test_ai_task_execution_lifecycle() {
        let mut task = AiTaskExecution::new(
            "task-123",
            AiTaskType::RecipeTransformation,
            10,
            ModelMetadata::default(),
            "2026-10-04T00:00:00Z",
        );
        assert_eq!(task.status, AiTaskStatus::Pending);

        task.mark_completed(
            Some("out_hash".into()),
            350,
            Some(512),
            "2026-10-04T00:00:01Z",
        );
        assert_eq!(task.status, AiTaskStatus::Completed);
        assert_eq!(task.duration_ms, 350);
        assert_eq!(task.token_usage, Some(512));
        assert_eq!(task.output_hash.as_deref(), Some("out_hash"));
        assert!(task.finished_at.is_some());
    }
}
