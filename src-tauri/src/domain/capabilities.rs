//! # Capability Registry
//!
//! Registro de capacidades funcionales por dominio para la plataforma Pulsaria.
//! Permite descubrir dinámicamente qué transformaciones y análisis son aplicables
//! según el dominio detectado de un contenido.
//!
//! 100% Rust puro, sin dependencias de base de datos o frameworks.

use crate::domain::ai_task::AiTaskType;
use crate::domain::model_registry::ModelCapability;
use crate::domain::semantic::{ContentDomain, ContentType};
use serde::{Deserialize, Serialize};

/// Error de validación al comprobar los requisitos previos de una capacidad.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CapabilityValidationError {
    MissingRequiredEvidence(String),
    UnsupportedDomain {
        domain: ContentDomain,
        task: AiTaskType,
    },
    UnsupportedContentType(ContentType),
}

/// Definición formal y ejecutable de una capacidad de análisis o transformación.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CapabilityDefinition {
    pub id: String,
    pub version: String,
    pub domain: ContentDomain,
    #[serde(default)]
    pub content_types: Vec<ContentType>,
    pub task_type: AiTaskType,
    pub name: String,
    pub description: String,
    #[serde(default = "default_schema_id")]
    pub input_schema_id: String,
    #[serde(default = "default_schema_id")]
    pub output_schema_id: String,
    pub requires_evidence: bool,
    #[serde(default)]
    pub required_evidence_types: Vec<String>,
    pub produces_structured_content: bool,
    pub required_model_capability: ModelCapability,
}

fn default_schema_id() -> String {
    "1.0.0".to_string()
}

impl CapabilityDefinition {
    /// Determina si esta capacidad soporta el dominio, tipo de contenido y tarea indicados.
    pub fn supports(
        &self,
        domain: &ContentDomain,
        content_type: &ContentType,
        task: &AiTaskType,
    ) -> bool {
        self.domain == *domain
            && (self.content_types.is_empty() || self.content_types.contains(content_type))
            && self.task_type == *task
    }

    /// Valida que la evidencia requerida por esta capacidad esté presente antes de la inferencia.
    pub fn validate_evidence_presence(
        &self,
        has_transcript: bool,
        has_keyframes: bool,
        has_ocr: bool,
    ) -> Result<(), CapabilityValidationError> {
        for req in &self.required_evidence_types {
            match req.as_str() {
                "transcript" if !has_transcript => {
                    return Err(CapabilityValidationError::MissingRequiredEvidence(
                        "transcript".into(),
                    ))
                }
                "keyframes" if !has_keyframes => {
                    return Err(CapabilityValidationError::MissingRequiredEvidence(
                        "keyframes".into(),
                    ))
                }
                "ocr" if !has_ocr => {
                    return Err(CapabilityValidationError::MissingRequiredEvidence(
                        "ocr".into(),
                    ))
                }
                _ => {}
            }
        }
        Ok(())
    }
}

/// Registro central de capacidades descubribles por dominio.
#[derive(Debug, Clone)]
pub struct CapabilityRegistry {
    capabilities: Vec<CapabilityDefinition>,
}

impl Default for CapabilityRegistry {
    fn default() -> Self {
        Self {
            capabilities: vec![
                CapabilityDefinition {
                    id: "cap-recipe-extraction-v1".to_string(),
                    version: "1.0.0".to_string(),
                    domain: ContentDomain::Culinary,
                    content_types: vec![ContentType::Recipe],
                    task_type: AiTaskType::RecipeTransformation,
                    name: "recipe_extraction".to_string(),
                    description: "Extrae ingredientes, cantidades numéricas, unidades y pasos secuenciales con timestamps".to_string(),
                    input_schema_id: "evidence_package_v1".to_string(),
                    output_schema_id: "recipe_schema_v1".to_string(),
                    requires_evidence: true,
                    required_evidence_types: vec!["transcript".to_string()],
                    produces_structured_content: true,
                    required_model_capability: ModelCapability::StructuredGeneration,
                },
                CapabilityDefinition {
                    id: "cap-ingredient-conflict-v1".to_string(),
                    version: "1.0.0".to_string(),
                    domain: ContentDomain::Culinary,
                    content_types: vec![ContentType::Recipe],
                    task_type: AiTaskType::ConflictVerification,
                    name: "ingredient_conflict_detection".to_string(),
                    description: "Detecta discrepancias cuantitativas de ingredientes entre fuentes sin promediar".to_string(),
                    input_schema_id: "evidence_package_v1".to_string(),
                    output_schema_id: "conflict_schema_v1".to_string(),
                    requires_evidence: true,
                    required_evidence_types: vec!["transcript".to_string()],
                    produces_structured_content: false,
                    required_model_capability: ModelCapability::StructuredGeneration,
                },
                CapabilityDefinition {
                    id: "cap-domain-detection-v1".to_string(),
                    version: "1.0.0".to_string(),
                    domain: ContentDomain::Other("general".to_string()),
                    content_types: vec![],
                    task_type: AiTaskType::DomainDetection,
                    name: "domain_detection".to_string(),
                    description: "Clasifica el dominio semántico y tipo de contenido audiovisual a partir de transcripción y título".to_string(),
                    input_schema_id: "evidence_package_v1".to_string(),
                    output_schema_id: "domain_schema_v1".to_string(),
                    requires_evidence: true,
                    required_evidence_types: vec!["transcript".to_string()],
                    produces_structured_content: true,
                    required_model_capability: ModelCapability::StructuredGeneration,
                },
                CapabilityDefinition {
                    id: "cap-tech-review-v1".to_string(),
                    version: "1.0.0".to_string(),
                    domain: ContentDomain::Technology,
                    content_types: vec![ContentType::Tutorial],
                    task_type: AiTaskType::StructuredTransformation,
                    name: "product_review_extraction".to_string(),
                    description: "Extrae especificaciones técnicas, pros y contras citados en el video".to_string(),
                    input_schema_id: "evidence_package_v1".to_string(),
                    output_schema_id: "review_schema_v1".to_string(),
                    requires_evidence: true,
                    required_evidence_types: vec!["transcript".to_string()],
                    produces_structured_content: true,
                    required_model_capability: ModelCapability::StructuredGeneration,
                },
                CapabilityDefinition {
                    id: "cap-prog-tutorial-v1".to_string(),
                    version: "1.0.0".to_string(),
                    domain: ContentDomain::Programming,
                    content_types: vec![ContentType::Tutorial],
                    task_type: AiTaskType::StructuredTransformation,
                    name: "code_tutorial_extraction".to_string(),
                    description: "Extrae fragmentos de código, comandos terminales y diagramas de arquitectura".to_string(),
                    input_schema_id: "evidence_package_v1".to_string(),
                    output_schema_id: "tutorial_schema_v1".to_string(),
                    requires_evidence: true,
                    required_evidence_types: vec!["transcript".to_string()],
                    produces_structured_content: true,
                    required_model_capability: ModelCapability::StructuredGeneration,
                },
            ],
        }
    }
}

impl CapabilityRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn capabilities(&self) -> &[CapabilityDefinition] {
        &self.capabilities
    }

    pub fn capabilities_for_domain(&self, domain: &ContentDomain) -> Vec<&CapabilityDefinition> {
        self.capabilities
            .iter()
            .filter(|cap| cap.domain == *domain)
            .collect()
    }

    pub fn register(&mut self, capability: CapabilityDefinition) {
        self.capabilities
            .retain(|cap| !(cap.domain == capability.domain && cap.name == capability.name));
        self.capabilities.push(capability);
    }
}

/// Resolutor explícito y determinista de capacidades.
/// Ruta: Task -> CapabilityResolver -> Capability -> Execution.
#[derive(Debug, Clone)]
pub struct CapabilityResolver {
    registry: CapabilityRegistry,
}

impl CapabilityResolver {
    pub fn new(registry: CapabilityRegistry) -> Self {
        Self { registry }
    }

    pub fn resolve(
        &self,
        domain: &ContentDomain,
        content_type: &ContentType,
        task: &AiTaskType,
    ) -> Option<&CapabilityDefinition> {
        self.registry
            .capabilities()
            .iter()
            .find(|c| c.supports(domain, content_type, task))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_culinary_capabilities_discovered() {
        let registry = CapabilityRegistry::default();
        let culinary = registry.capabilities_for_domain(&ContentDomain::Culinary);
        assert_eq!(culinary.len(), 2);
        assert!(culinary.iter().any(|c| c.name == "recipe_extraction"));
    }

    #[test]
    fn test_capability_resolver_and_evidence_validation() {
        let registry = CapabilityRegistry::default();
        let resolver = CapabilityResolver::new(registry);

        let cap = resolver
            .resolve(
                &ContentDomain::Culinary,
                &ContentType::Recipe,
                &AiTaskType::RecipeTransformation,
            )
            .expect("Recipe transformation capability must exist");

        assert_eq!(cap.name, "recipe_extraction");
        assert_eq!(
            cap.required_model_capability,
            ModelCapability::StructuredGeneration
        );

        // Evidence validation: transcript present -> ok
        assert!(cap.validate_evidence_presence(true, false, false).is_ok());

        // Evidence validation: transcript missing -> Err
        let err = cap
            .validate_evidence_presence(false, false, false)
            .unwrap_err();
        assert_eq!(
            err,
            CapabilityValidationError::MissingRequiredEvidence("transcript".into())
        );
    }
}
