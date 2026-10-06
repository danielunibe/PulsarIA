//! # Universal Semantic Model
//!
//! Representación semántica unificada e independiente de modelos para la
//! plataforma de inteligencia de Pulsaria.
//!
//! 100% Rust puro, sin dependencias de base de datos o frameworks.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Dominios temáticos canónicos detectables en la biblioteca.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentDomain {
    Culinary,
    Technology,
    Gaming,
    Programming,
    Education,
    Fitness,
    News,
    Finance,
    Other(String),
}

impl<'de> Deserialize<'de> for ContentDomain {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(Self::from_str_canonical(&s))
    }
}

impl ContentDomain {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Culinary => "culinary",
            Self::Technology => "technology",
            Self::Gaming => "gaming",
            Self::Programming => "programming",
            Self::Education => "education",
            Self::Fitness => "fitness",
            Self::News => "news",
            Self::Finance => "finance",
            Self::Other(s) => s.as_str(),
        }
    }

    pub fn from_str_canonical(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "culinary" | "cooking" | "recipe" | "food" | "gastronomy" | "cocina" | "culinario" => {
                Self::Culinary
            }
            "technology" | "tech" | "hardware" | "gadget" | "tecnologia" | "tecnología" => {
                Self::Technology
            }
            "gaming" | "game" | "gameplay" | "videojuegos" => Self::Gaming,
            "programming" | "code" | "coding" | "software" | "development" | "programacion"
            | "programación" => Self::Programming,
            "education" | "academic" | "science" | "lesson" | "educacion" | "educación" => {
                Self::Education
            }
            "fitness" | "workout" | "exercise" | "gym" | "health" | "salud" => Self::Fitness,
            "news" | "journalism" | "report" | "noticias" => Self::News,
            "finance" | "economy" | "crypto" | "investing" | "finanzas" => Self::Finance,
            other => Self::Other(other.to_string()),
        }
    }
}

impl fmt::Display for ContentDomain {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Tipos de contenido estructural.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentType {
    Recipe,
    Tutorial,
    ProductReview,
    GameGuide,
    Lesson,
    Analysis,
    EventReport,
    Workout,
    Discussion,
    Other(String),
}

impl<'de> Deserialize<'de> for ContentType {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(Self::from_str_canonical(&s))
    }
}

impl ContentType {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Recipe => "recipe",
            Self::Tutorial => "tutorial",
            Self::ProductReview => "product_review",
            Self::GameGuide => "game_guide",
            Self::Lesson => "lesson",
            Self::Analysis => "analysis",
            Self::EventReport => "event_report",
            Self::Workout => "workout",
            Self::Discussion => "discussion",
            Self::Other(s) => s.as_str(),
        }
    }

    pub fn from_str_canonical(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "recipe" | "receta" => Self::Recipe,
            "tutorial" | "how-to" | "guia" | "guide" => Self::Tutorial,
            "product_review" | "review" | "resena" | "reseña" => Self::ProductReview,
            "game_guide" | "walkthrough" => Self::GameGuide,
            "lesson" | "lecture" | "clase" => Self::Lesson,
            "analysis" | "opinion" | "analisis" | "análisis" => Self::Analysis,
            "event_report" | "report" | "noticia" => Self::EventReport,
            "workout" | "routine" | "rutina" => Self::Workout,
            "discussion" | "podcast" | "interview" | "entrevista" => Self::Discussion,
            other => Self::Other(other.to_string()),
        }
    }
}

impl fmt::Display for ContentType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

fn default_domain_confidence() -> f64 {
    0.9
}

/// Clasificación de dominio de alto nivel producida por el detector.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DomainClassification {
    pub domain: ContentDomain,
    pub content_type: ContentType,
    #[serde(default = "default_domain_confidence")]
    pub confidence: f64,
    #[serde(default)]
    pub rationale: String,
    #[serde(default)]
    pub suggested_tags: Vec<String>,
}

impl DomainClassification {
    pub fn new(
        domain: ContentDomain,
        content_type: ContentType,
        confidence: f64,
        rationale: impl Into<String>,
        suggested_tags: Vec<String>,
    ) -> Self {
        Self {
            domain,
            content_type,
            confidence: confidence.clamp(0.0, 1.0),
            rationale: rationale.into(),
            suggested_tags,
        }
    }
}

/// Tipos de entidad semántica identificables en la evidencia.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityType {
    Ingredient,
    Tool,
    Equipment,
    Technique,
    Language,
    Framework,
    Hardware,
    Software,
    Game,
    Concept,
    Person,
    Brand,
    Location,
    Other(String),
}

impl<'de> Deserialize<'de> for EntityType {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(Self::from_str_canonical(&s))
    }
}

impl EntityType {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Ingredient => "ingredient",
            Self::Tool => "tool",
            Self::Equipment => "equipment",
            Self::Technique => "technique",
            Self::Language => "language",
            Self::Framework => "framework",
            Self::Hardware => "hardware",
            Self::Software => "software",
            Self::Game => "game",
            Self::Concept => "concept",
            Self::Person => "person",
            Self::Brand => "brand",
            Self::Location => "location",
            Self::Other(s) => s.as_str(),
        }
    }

    pub fn from_str_canonical(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "ingredient" | "ingrediente" => Self::Ingredient,
            "tool" | "herramienta" => Self::Tool,
            "equipment" | "equipo" | "utensil" | "utensilio" => Self::Equipment,
            "technique" | "tecnica" | "técnica" => Self::Technique,
            "language" | "lenguaje" => Self::Language,
            "framework" => Self::Framework,
            "hardware" => Self::Hardware,
            "software" => Self::Software,
            "game" | "juego" | "videojuego" => Self::Game,
            "concept" | "concepto" => Self::Concept,
            "person" | "persona" => Self::Person,
            "brand" | "marca" => Self::Brand,
            "location" | "ubicacion" | "ubicación" => Self::Location,
            other => Self::Other(other.to_string()),
        }
    }
}

/// Entidad semántica extraída con respaldo temporal y de procedencia.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SemanticEntity {
    pub name: String,
    pub normalized_name: String,
    pub entity_type: EntityType,
    pub confidence: f64,
    pub job_id: i64,
    pub timestamp_start: Option<f64>,
    pub timestamp_end: Option<f64>,
}

impl SemanticEntity {
    pub fn new(
        name: impl Into<String>,
        entity_type: EntityType,
        confidence: f64,
        job_id: i64,
        timestamp_start: Option<f64>,
        timestamp_end: Option<f64>,
    ) -> Self {
        let n = name.into();
        let normalized = n.trim().to_lowercase();
        Self {
            name: n,
            normalized_name: normalized,
            entity_type,
            confidence: confidence.clamp(0.0, 1.0),
            job_id,
            timestamp_start,
            timestamp_end,
        }
    }
}

/// Tópico semántico transversal con peso de relevancia.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SemanticTopic {
    pub topic: String,
    pub relevance: f64,
}

/// Concepto clave abstracto identificado en el contenido.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SemanticConcept {
    pub concept: String,
    pub category: String,
    pub confidence: f64,
}

/// Afirmación factual o cuantitativa respaldada por evidencia.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SemanticClaim {
    pub subject: String,
    pub predicate: String,
    pub object: String,
    pub numeric_value: Option<f64>,
    pub unit: Option<String>,
    pub confidence: f64,
    pub job_id: i64,
    pub timestamp_start: Option<f64>,
    pub timestamp_end: Option<f64>,
}

/// Relación entre dos entidades semánticas dentro del grafo local.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SemanticRelation {
    pub source_entity: String,
    pub relation_type: String,
    pub target_entity: String,
    pub confidence: f64,
}

/// Metadatos del modelo y prompt que generó la inferencia (reproducibilidad).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelMetadata {
    pub model_id: String,
    pub model_provider: String,
    pub model_revision: String,
    pub prompt_version: String,
}

impl Default for ModelMetadata {
    fn default() -> Self {
        Self {
            model_id: "local-default".to_string(),
            model_provider: "llama.cpp".to_string(),
            model_revision: "1.0".to_string(),
            prompt_version: "1.0".to_string(),
        }
    }
}

/// Grafo de conocimiento semántico derivado de un video o fuente.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SemanticKnowledgeGraph {
    pub job_id: i64,
    pub classification: DomainClassification,
    pub entities: Vec<SemanticEntity>,
    pub topics: Vec<SemanticTopic>,
    pub concepts: Vec<SemanticConcept>,
    pub claims: Vec<SemanticClaim>,
    pub relations: Vec<SemanticRelation>,
    pub model_metadata: ModelMetadata,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_content_domain_canonical_mapping() {
        assert_eq!(
            ContentDomain::from_str_canonical("cooking"),
            ContentDomain::Culinary
        );
        assert_eq!(
            ContentDomain::from_str_canonical("RECIPE"),
            ContentDomain::Culinary
        );
        assert_eq!(
            ContentDomain::from_str_canonical("hardware"),
            ContentDomain::Technology
        );
        assert_eq!(
            ContentDomain::from_str_canonical("gym"),
            ContentDomain::Fitness
        );
        assert_eq!(
            ContentDomain::from_str_canonical("custom_domain"),
            ContentDomain::Other("custom_domain".to_string())
        );
    }

    #[test]
    fn test_content_type_canonical_mapping() {
        assert_eq!(
            ContentType::from_str_canonical("receta"),
            ContentType::Recipe
        );
        assert_eq!(
            ContentType::from_str_canonical("how-to"),
            ContentType::Tutorial
        );
        assert_eq!(
            ContentType::from_str_canonical("review"),
            ContentType::ProductReview
        );
    }

    #[test]
    fn test_domain_classification_clamping() {
        let class = DomainClassification::new(
            ContentDomain::Culinary,
            ContentType::Recipe,
            1.5, // debe clampearse a 1.0
            "Video de preparación de pasta",
            vec!["pasta".to_string(), "cocina".to_string()],
        );
        assert_eq!(class.confidence, 1.0);
        assert_eq!(class.domain, ContentDomain::Culinary);
        assert_eq!(class.content_type, ContentType::Recipe);
    }

    #[test]
    fn test_semantic_entity_normalization() {
        let entity = SemanticEntity::new(
            "  Pimienta Negra Molida  ",
            EntityType::Ingredient,
            0.95,
            42,
            Some(10.0),
            Some(12.5),
        );
        assert_eq!(entity.name, "  Pimienta Negra Molida  ");
        assert_eq!(entity.normalized_name, "pimienta negra molida");
        assert_eq!(entity.entity_type, EntityType::Ingredient);
        assert_eq!(entity.job_id, 42);
    }
}
