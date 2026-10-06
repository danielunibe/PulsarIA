//! # Recipe Transformer
//!
//! Transformer de contenido para el vertical slice culinario / recetas.
//! Transforma un [`EditorialEvidencePackage`] en una [`StructuredRecipe`]
//! validada, anclada a timestamps y sin alucinación de cantidades.

use super::{ContentTransformer, TransformerError};
use crate::application::editorial_evidence::EditorialEvidencePackage;
use crate::application::local_ai_provider::LocalAiProvider;
use crate::domain::recipe::{validate_structured_recipe, StructuredRecipe};
use crate::domain::semantic::{ContentDomain, ContentType};

pub struct RecipeTransformer;

impl RecipeTransformer {
    pub fn new() -> Self {
        Self
    }

    /// Transforma la evidencia de un video culinario en una receta estructurada y validada.
    pub async fn transform(
        &self,
        package: &EditorialEvidencePackage,
        provider: &LocalAiProvider,
    ) -> Result<StructuredRecipe, TransformerError> {
        let job_id = package.source.job_id;

        if package.transcript.is_empty() && package.ocr.is_empty() {
            return Err(TransformerError::InsufficientEvidence(
                "el video no contiene transcripción ni OCR para extraer ingredientes".to_string(),
            ));
        }

        // Construcción de prompt mediante PromptBuilder con defensa de inyección y esquema canónico
        let prompt =
            crate::application::prompt_builder::PromptBuilder::for_recipe_transformation(package);

        // Inferencia mediante Local AI Provider
        let mut recipe: StructuredRecipe = provider
            .generate_structured(&prompt)
            .await
            .map_err(|e| TransformerError::AiInferenceFailed(e.to_string()))?;

        // Reconciliación defensiva de job_id y validación de procedencia estricta
        for ing in &mut recipe.ingredients {
            for ev in &mut ing.evidence {
                if ev.job_id == 0 {
                    ev.job_id = job_id;
                } else if ev.job_id != job_id {
                    return Err(TransformerError::ForeignJobEvidence(ev.job_id));
                }
            }
        }
        for step in &mut recipe.steps {
            for ev in &mut step.evidence {
                if ev.job_id == 0 {
                    ev.job_id = job_id;
                } else if ev.job_id != job_id {
                    return Err(TransformerError::ForeignJobEvidence(ev.job_id));
                }
            }
        }

        // Reconciliación determinista de contradicciones y conflictos cuantitativos
        recipe.reconcile_and_detect_conflicts();

        // Validación determinista de invariantes y duraciones
        validate_structured_recipe(&recipe, package.source.duration_secs)
            .map_err(|e| TransformerError::ValidationFailed(e.to_string()))?;

        Ok(recipe)
    }
}

impl ContentTransformer for RecipeTransformer {
    fn domain(&self) -> ContentDomain {
        ContentDomain::Culinary
    }

    fn content_type(&self) -> ContentType {
        ContentType::Recipe
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::editorial_evidence::{SourceSnapshot, TranscriptEvidence};
    use crate::application::local_ai_provider::MockLocalScenario;

    fn sample_culinary_package(job_id: i64) -> EditorialEvidencePackage {
        EditorialEvidencePackage {
            schema_version: "1.0".to_string(),
            job_id,
            source: SourceSnapshot {
                job_id,
                url: "https://example.com/pesto".to_string(),
                canonical_url: None,
                status: "completed".to_string(),
                title: Some("Receta de Pesto Genovés Casero".to_string()),
                author: Some("Chef Mario".to_string()),
                platform: Some("tiktok".to_string()),
                duration_secs: Some(120.0),
                has_video_file: true,
                instructional_guide: Some("Pasos para hacer salsa pesto".to_string()),
                content_handle: None,
            },
            transcript: vec![
                TranscriptEvidence {
                    segment_index: 0,
                    start_sec: 5.0,
                    end_sec: 10.0,
                    text: "Usamos 50 gramos de albahaca fresca".to_string(),
                },
                TranscriptEvidence {
                    segment_index: 1,
                    start_sec: 12.0,
                    end_sec: 15.0,
                    text: "30 gramos de piñones tostados".to_string(),
                },
            ],
            keyframes: vec![],
            ocr: vec![],
            annotations: vec![],
            transcript_total: 2,
            keyframe_total: 0,
            ocr_total: 0,
            truncated: false,
        }
    }

    #[tokio::test]
    async fn test_recipe_transformer_success() {
        let pkg = sample_culinary_package(10);
        let transformer = RecipeTransformer::new();
        let provider = LocalAiProvider::mock(MockLocalScenario::RecipeSuccess);

        let recipe = transformer.transform(&pkg, &provider).await.unwrap();
        assert_eq!(recipe.title, "Pasta al Pesto Genovés Auténtico");
        assert_eq!(recipe.ingredients.len(), 3);
        assert_eq!(recipe.steps.len(), 2);
        assert_eq!(recipe.ingredients[0].quantity, Some(50.0));
        assert_eq!(recipe.ingredients[0].evidence[0].job_id, 10);
    }

    #[tokio::test]
    async fn test_recipe_transformer_rejects_empty_evidence() {
        let mut pkg = sample_culinary_package(10);
        pkg.transcript.clear();
        pkg.ocr.clear();

        let transformer = RecipeTransformer::new();
        let provider = LocalAiProvider::mock(MockLocalScenario::RecipeSuccess);

        let res = transformer.transform(&pkg, &provider).await;
        assert!(matches!(
            res,
            Err(TransformerError::InsufficientEvidence(_))
        ));
    }

    #[tokio::test]
    async fn test_recipe_transformer_with_conflict() {
        let pkg = sample_culinary_package(10);
        let transformer = RecipeTransformer::new();
        let provider = LocalAiProvider::mock(MockLocalScenario::RecipeWithConflict);

        let recipe = transformer.transform(&pkg, &provider).await.unwrap();
        assert_eq!(recipe.conflicts.len(), 1);
        assert!(recipe.conflicts[0].requires_review);
        assert_eq!(recipe.conflicts[0].value_a, "5 g");
        assert_eq!(recipe.conflicts[0].value_b, "10 g");
    }
}
