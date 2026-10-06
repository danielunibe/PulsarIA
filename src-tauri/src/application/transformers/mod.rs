//! # Content Transformer Architecture
//!
//! Abstracción extensible para transformar paquetes de evidencia audiovisual
//! en estructuras de conocimiento tipadas específicas por dominio.

pub mod recipe;

use crate::domain::recipe::StructuredRecipe;
use crate::domain::semantic::{ContentDomain, ContentType};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Resultado tipado emitido por un transformer de dominio.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum TransformationOutput {
    Recipe(StructuredRecipe),
    Generic(serde_json::Value),
}

/// Errores tipados durante la transformación de contenido.
#[derive(Debug, Clone, PartialEq)]
pub enum TransformerError {
    UnsupportedDomain(String),
    InsufficientEvidence(String),
    AiInferenceFailed(String),
    ValidationFailed(String),
    ForeignJobEvidence(i64),
}

impl fmt::Display for TransformerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedDomain(d) => write!(f, "unsupported content domain: {d}"),
            Self::InsufficientEvidence(reason) => {
                write!(f, "insufficient evidence for transformation: {reason}")
            }
            Self::AiInferenceFailed(err) => write!(f, "local AI inference failed: {err}"),
            Self::ValidationFailed(err) => write!(f, "deterministic validation failed: {err}"),
            Self::ForeignJobEvidence(job_id) => {
                write!(f, "evidence references foreign job_id '{job_id}'")
            }
        }
    }
}

impl std::error::Error for TransformerError {}

/// Contrato base de un transformer de dominio.
pub trait ContentTransformer: Send + Sync {
    fn domain(&self) -> ContentDomain;
    fn content_type(&self) -> ContentType;
}
