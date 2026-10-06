//! # Domain Detection Engine
//!
//! Clasificador determinista y semántico de dominios y tipos de contenido.
//! Combina heurísticas rápidas basadas en anotaciones indexadas con inferencia
//! local estructurada a través del [`LocalAiProvider`].

use crate::application::editorial_evidence::EditorialEvidencePackage;
use crate::application::local_ai_provider::{LocalAiError, LocalAiProvider};
use crate::domain::semantic::{ContentDomain, ContentType, DomainClassification};

/// Motor de detección de dominios para videos y contenidos multimedia.
pub struct DomainDetector;

impl DomainDetector {
    /// Detecta el dominio de forma heurística rápida sin invocar modelos si las anotaciones son deterministas.
    pub fn detect_deterministic(
        package: &EditorialEvidencePackage,
    ) -> Option<DomainClassification> {
        let title_lower = package.source.title.as_deref().unwrap_or("").to_lowercase();
        let annotations = &package.annotations;

        // 1. Detección Culinaria / Recetas
        let is_culinary = annotations.iter().any(|a| {
            a.annotation_type == "category" && (a.value == "recipe" || a.value == "culinary")
        }) || title_lower.contains("receta")
            || title_lower.contains("recipe")
            || title_lower.contains("ingredientes")
            || title_lower.contains("cómo cocinar");

        if is_culinary {
            return Some(DomainClassification::new(
                ContentDomain::Culinary,
                ContentType::Recipe,
                0.95,
                "Anotaciones canónicas de biblioteca y título indican receta culinaria.",
                vec!["cocina".to_string(), "receta".to_string()],
            ));
        }

        // 2. Detección de Tecnología / Hardware
        let is_tech = annotations.iter().any(|a| {
            a.annotation_type == "category" && (a.value == "technology" || a.value == "tech")
        }) || title_lower.contains("review")
            || title_lower.contains("benchmark")
            || title_lower.contains("unboxing")
            || title_lower.contains("rtx")
            || title_lower.contains("cpu");

        if is_tech {
            return Some(DomainClassification::new(
                ContentDomain::Technology,
                ContentType::ProductReview,
                0.92,
                "Anotaciones y palabras clave de hardware indican análisis tecnológico.",
                vec!["tecnología".to_string(), "hardware".to_string()],
            ));
        }

        // 3. Detección de Programación / Código
        let is_programming = title_lower.contains("tutorial")
            || title_lower.contains("curso")
            || title_lower.contains("rust")
            || title_lower.contains("python")
            || title_lower.contains("javascript");

        if is_programming {
            return Some(DomainClassification::new(
                ContentDomain::Programming,
                ContentType::Tutorial,
                0.90,
                "Palabras clave de desarrollo de software indican tutorial de programación.",
                vec!["programación".to_string(), "código".to_string()],
            ));
        }

        None
    }

    /// Detecta el dominio de forma completa: recurre primero a heurísticas y, si es ambiguo,
    /// invoca al proveedor Local AI pidiendo una estructura JSON de [`DomainClassification`].
    pub async fn detect(
        package: &EditorialEvidencePackage,
        provider: &LocalAiProvider,
    ) -> Result<DomainClassification, LocalAiError> {
        if let Some(fast) = Self::detect_deterministic(package) {
            return Ok(fast);
        }

        let prompt =
            crate::application::prompt_builder::PromptBuilder::for_domain_detection(package);
        provider
            .generate_structured::<DomainClassification>(&prompt)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::editorial_evidence::SourceSnapshot;
    use crate::application::local_ai_provider::MockLocalScenario;

    fn sample_package(title: &str, category_ann: Option<&str>) -> EditorialEvidencePackage {
        use crate::application::editorial_evidence::AnnotationEvidence;
        let mut annotations = Vec::new();
        if let Some(cat) = category_ann {
            annotations.push(AnnotationEvidence {
                annotation_type: "category".to_string(),
                value: cat.to_string(),
                display: cat.to_string(),
                confidence: Some(0.99),
                source: "test".to_string(),
                start_sec: None,
                end_sec: None,
            });
        }
        EditorialEvidencePackage {
            schema_version: "1.0".to_string(),
            job_id: 10,
            source: SourceSnapshot {
                job_id: 10,
                url: "https://example.com/video".to_string(),
                canonical_url: None,
                status: "completed".to_string(),
                title: Some(title.to_string()),
                author: None,
                platform: None,
                duration_secs: Some(60.0),
                has_video_file: true,
                instructional_guide: None,
                content_handle: None,
            },
            transcript: vec![],
            keyframes: vec![],
            ocr: vec![],
            annotations,
            transcript_total: 0,
            keyframe_total: 0,
            ocr_total: 0,
            truncated: false,
        }
    }

    #[test]
    fn test_deterministic_culinary_detection() {
        let pkg = sample_package("Receta de Lasaña Boloñesa", Some("recipe"));
        let class = DomainDetector::detect_deterministic(&pkg).unwrap();
        assert_eq!(class.domain, ContentDomain::Culinary);
        assert_eq!(class.content_type, ContentType::Recipe);
    }

    #[test]
    fn test_deterministic_tech_detection() {
        let pkg = sample_package("Review de la tarjeta gráfica RTX 4070 Ti", Some("tech"));
        let class = DomainDetector::detect_deterministic(&pkg).unwrap();
        assert_eq!(class.domain, ContentDomain::Technology);
        assert_eq!(class.content_type, ContentType::ProductReview);
    }

    #[tokio::test]
    async fn test_ai_fallback_detection() {
        let pkg = sample_package("Video con título abstracto", None);
        let provider = LocalAiProvider::mock(MockLocalScenario::DomainCulinary);
        let class = DomainDetector::detect(&pkg, &provider).await.unwrap();
        assert_eq!(class.domain, ContentDomain::Culinary);
        assert_eq!(class.content_type, ContentType::Recipe);
    }
}
