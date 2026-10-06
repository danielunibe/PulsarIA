//! # Recipe Domain Model & Contracts
//!
//! Modelo de conocimiento estructurado para el dominio culinario / recetas.
//! Incluye anclaje estricto de evidencia temporal a cada ingrediente y paso,
//! validaciones deterministas y detección de conflictos cuantitativos sin promedios.
//!
//! 100% Rust puro, sin dependencias de base de datos o frameworks.

use serde::{Deserialize, Serialize};
use std::fmt;

pub const RECIPE_SCHEMA_VERSION: &str = "1.0";

fn default_confidence() -> f64 {
    1.0
}

fn default_schema_version() -> String {
    RECIPE_SCHEMA_VERSION.to_string()
}

/// Anclaje de evidencia inmutable respaldado por un video, transcripción o keyframe.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvidenceAnchor {
    pub job_id: i64,
    #[serde(default)]
    pub timestamp_start: Option<f64>,
    #[serde(default)]
    pub timestamp_end: Option<f64>,
    #[serde(default)]
    pub quote: Option<String>,
    #[serde(default)]
    pub keyframe_path: Option<String>,
    #[serde(default = "default_confidence")]
    pub confidence: f64,
}

impl EvidenceAnchor {
    pub fn new(job_id: i64, start: Option<f64>, end: Option<f64>, confidence: f64) -> Self {
        Self {
            job_id,
            timestamp_start: start,
            timestamp_end: end,
            quote: None,
            keyframe_path: None,
            confidence: confidence.clamp(0.0, 1.0),
        }
    }

    pub fn with_quote(mut self, quote: impl Into<String>) -> Self {
        self.quote = Some(quote.into());
        self
    }

    pub fn with_keyframe(mut self, path: impl Into<String>) -> Self {
        self.keyframe_path = Some(path.into());
        self
    }
}

/// Ingrediente estructurado con cantidad, unidad y procedencia obligatoria.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecipeIngredient {
    pub name: String,
    #[serde(default)]
    pub normalized_name: String,
    #[serde(default)]
    pub quantity: Option<f64>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub optional: bool,
    #[serde(default)]
    pub evidence: Vec<EvidenceAnchor>,
}

impl RecipeIngredient {
    pub fn new(
        name: impl Into<String>,
        quantity: Option<f64>,
        unit: Option<String>,
        evidence: Vec<EvidenceAnchor>,
    ) -> Self {
        let n = name.into();
        let normalized = n.trim().to_lowercase();
        Self {
            name: n,
            normalized_name: normalized,
            quantity,
            unit: unit.map(|u| u.trim().to_lowercase()),
            notes: None,
            optional: false,
            evidence,
        }
    }
}

/// Paso secuencial de preparación con rango temporal exacto en el video.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecipeStep {
    pub ordinal: u32,
    pub instruction: String,
    #[serde(default)]
    pub time_start: Option<f64>,
    #[serde(default)]
    pub time_end: Option<f64>,
    #[serde(default)]
    pub technique: Option<String>,
    #[serde(default)]
    pub temperature: Option<String>,
    #[serde(default)]
    pub evidence: Vec<EvidenceAnchor>,
}

/// Equipo o utensilio necesario para la preparación.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecipeEquipment {
    pub name: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub evidence: Vec<EvidenceAnchor>,
}

/// Técnica culinaria identificada en la preparación.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecipeTechnique {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub evidence: Vec<EvidenceAnchor>,
}

/// Discrepancia o contradicción detectada entre evidencias de una misma receta.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecipeConflict {
    pub field: String,
    pub description: String,
    pub value_a: String,
    pub value_b: String,
    pub evidence_a: EvidenceAnchor,
    pub evidence_b: EvidenceAnchor,
    #[serde(default)]
    pub requires_review: bool,
}

/// Receta estructurada completa, validada y trazable.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StructuredRecipe {
    #[serde(default = "default_schema_version")]
    pub schema_version: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub servings: Option<u32>,
    #[serde(default)]
    pub prep_time_minutes: Option<u32>,
    #[serde(default)]
    pub cook_time_minutes: Option<u32>,
    #[serde(default)]
    pub total_time_minutes: Option<u32>,
    #[serde(default)]
    pub difficulty: Option<String>,
    #[serde(default)]
    pub cuisine: Option<String>,
    #[serde(default)]
    pub ingredients: Vec<RecipeIngredient>,
    #[serde(default)]
    pub steps: Vec<RecipeStep>,
    #[serde(default)]
    pub equipment: Vec<RecipeEquipment>,
    #[serde(default)]
    pub techniques: Vec<RecipeTechnique>,
    #[serde(default = "default_confidence")]
    pub confidence: f64,
    #[serde(default)]
    pub conflicts: Vec<RecipeConflict>,
}

impl StructuredRecipe {
    /// Detecta y registra contradicciones cuantitativas para un mismo ingrediente de forma determinista.
    /// Si dos ingredientes comparten el mismo normalized_name pero declaran cantidades distintas,
    /// se genera un RecipeConflict conservando ambas evidencias y marcando requires_review = true.
    pub fn reconcile_and_detect_conflicts(&mut self) {
        let mut new_conflicts = Vec::new();
        let len = self.ingredients.len();
        for i in 0..len {
            for j in (i + 1)..len {
                let a = &self.ingredients[i];
                let b = &self.ingredients[j];
                if a.normalized_name == b.normalized_name {
                    if let (Some(qa), Some(qb)) = (a.quantity, b.quantity) {
                        if (qa - qb).abs() > 1e-4 {
                            let ev_a =
                                a.evidence
                                    .first()
                                    .cloned()
                                    .unwrap_or_else(|| EvidenceAnchor {
                                        job_id: 0,
                                        timestamp_start: None,
                                        timestamp_end: None,
                                        quote: Some(format!("{qa}")),
                                        keyframe_path: None,
                                        confidence: 0.9,
                                    });
                            let ev_b =
                                b.evidence
                                    .first()
                                    .cloned()
                                    .unwrap_or_else(|| EvidenceAnchor {
                                        job_id: 0,
                                        timestamp_start: None,
                                        timestamp_end: None,
                                        quote: Some(format!("{qb}")),
                                        keyframe_path: None,
                                        confidence: 0.9,
                                    });
                            new_conflicts.push(RecipeConflict {
                                field: format!("ingredients.{}.quantity", a.normalized_name),
                                description: format!(
                                    "Discrepancia cuantitativa para '{}': {} vs {}",
                                    a.name, qa, qb
                                ),
                                value_a: format!("{} {}", qa, a.unit.as_deref().unwrap_or("")),
                                value_b: format!("{} {}", qb, b.unit.as_deref().unwrap_or("")),
                                evidence_a: ev_a,
                                evidence_b: ev_b,
                                requires_review: true,
                            });
                        }
                    }
                }
            }
        }
        for c in new_conflicts {
            if !self
                .conflicts
                .iter()
                .any(|existing| existing.field == c.field)
            {
                self.conflicts.push(c);
            }
        }
    }
}

/// Retorna el esqueleto JSON canónico para inyección en prompts de IA.
pub fn canonical_recipe_json_skeleton(job_id: i64) -> String {
    format!(
        r#"{{
  "schema_version": "1.0",
  "title": "Nombre de la receta",
  "description": "Breve descripción del plato",
  "servings": 4,
  "prep_time_minutes": 15,
  "cook_time_minutes": 20,
  "total_time_minutes": 35,
  "difficulty": "facil",
  "cuisine": "italiana",
  "ingredients": [
    {{
      "name": "Nombre ingrediente",
      "normalized_name": "nombre ingrediente",
      "quantity": 200.0,
      "unit": "g",
      "notes": null,
      "optional": false,
      "evidence": [
        {{
          "job_id": {job_id},
          "timestamp_start": 0.0,
          "timestamp_end": 5.0,
          "quote": "cita textual exacta de transcripción o OCR",
          "confidence": 0.95
        }}
      ]
    }}
  ],
  "steps": [
    {{
      "ordinal": 1,
      "instruction": "Instrucción clara y secuencial",
      "time_start": 0.0,
      "time_end": 10.0,
      "technique": null,
      "temperature": null,
      "evidence": [
        {{
          "job_id": {job_id},
          "timestamp_start": 0.0,
          "timestamp_end": 10.0,
          "quote": "cita textual exacta",
          "confidence": 0.95
        }}
      ]
    }}
  ],
  "equipment": [],
  "techniques": [],
  "confidence": 0.95,
  "conflicts": []
}}"#
    )
}

/// Errores de validación determinista de una receta estructurada.
#[derive(Debug, Clone, PartialEq)]
pub enum RecipeValidationError {
    InvalidSchemaVersion(String),
    EmptyTitle,
    NegativeQuantity { ingredient: String, value: f64 },
    NegativeTimestamp(f64),
    InvertedTimestampRange { start: f64, end: f64 },
    TimestampExceedsDuration { time: f64, duration: f64 },
    MissingEvidenceForStep(u32),
    NoIngredients,
    NoSteps,
}

impl fmt::Display for RecipeValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidSchemaVersion(v) => write!(
                f,
                "invalid recipe schema version '{v}', expected '{RECIPE_SCHEMA_VERSION}'"
            ),
            Self::EmptyTitle => write!(f, "recipe title cannot be empty"),
            Self::NegativeQuantity { ingredient, value } => write!(
                f,
                "ingredient '{ingredient}' has negative quantity: {value}"
            ),
            Self::NegativeTimestamp(t) => write!(f, "timestamp cannot be negative: {t}s"),
            Self::InvertedTimestampRange { start, end } => {
                write!(f, "inverted timestamp range: {start}s > {end}s")
            }
            Self::TimestampExceedsDuration { time, duration } => {
                write!(f, "timestamp {time}s exceeds media duration of {duration}s")
            }
            Self::MissingEvidenceForStep(ord) => {
                write!(f, "step #{ord} must have at least one evidence anchor")
            }
            Self::NoIngredients => write!(f, "recipe must declare at least one ingredient"),
            Self::NoSteps => write!(f, "recipe must declare at least one instruction step"),
        }
    }
}

impl std::error::Error for RecipeValidationError {}

/// Valida de forma determinista las reglas de integridad de una receta estructurada.
pub fn validate_structured_recipe(
    recipe: &StructuredRecipe,
    max_duration_secs: Option<f64>,
) -> Result<(), RecipeValidationError> {
    if recipe.schema_version != RECIPE_SCHEMA_VERSION {
        return Err(RecipeValidationError::InvalidSchemaVersion(
            recipe.schema_version.clone(),
        ));
    }
    if recipe.title.trim().is_empty() {
        return Err(RecipeValidationError::EmptyTitle);
    }
    if recipe.ingredients.is_empty() {
        return Err(RecipeValidationError::NoIngredients);
    }
    if recipe.steps.is_empty() {
        return Err(RecipeValidationError::NoSteps);
    }

    // Validar ingredientes y cantidades
    for ing in &recipe.ingredients {
        if let Some(qty) = ing.quantity {
            if qty < 0.0 {
                return Err(RecipeValidationError::NegativeQuantity {
                    ingredient: ing.name.clone(),
                    value: qty,
                });
            }
        }
        for ev in &ing.evidence {
            validate_anchor(ev, max_duration_secs)?;
        }
    }

    // Validar pasos secuenciales
    for step in &recipe.steps {
        if step.evidence.is_empty() {
            return Err(RecipeValidationError::MissingEvidenceForStep(step.ordinal));
        }
        for ev in &step.evidence {
            validate_anchor(ev, max_duration_secs)?;
        }
        if let (Some(s), Some(e)) = (step.time_start, step.time_end) {
            if s < 0.0 {
                return Err(RecipeValidationError::NegativeTimestamp(s));
            }
            if s > e {
                return Err(RecipeValidationError::InvertedTimestampRange { start: s, end: e });
            }
            if let Some(dur) = max_duration_secs {
                if e > dur + 1.0 {
                    return Err(RecipeValidationError::TimestampExceedsDuration {
                        time: e,
                        duration: dur,
                    });
                }
            }
        }
    }

    Ok(())
}

fn validate_anchor(
    anchor: &EvidenceAnchor,
    max_duration: Option<f64>,
) -> Result<(), RecipeValidationError> {
    if let Some(s) = anchor.timestamp_start {
        if s < 0.0 {
            return Err(RecipeValidationError::NegativeTimestamp(s));
        }
    }
    if let (Some(s), Some(e)) = (anchor.timestamp_start, anchor.timestamp_end) {
        if s > e {
            return Err(RecipeValidationError::InvertedTimestampRange { start: s, end: e });
        }
        if let Some(dur) = max_duration {
            if e > dur + 1.0 {
                return Err(RecipeValidationError::TimestampExceedsDuration {
                    time: e,
                    duration: dur,
                });
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_recipe() -> StructuredRecipe {
        StructuredRecipe {
            schema_version: "1.0".to_string(),
            title: "Pasta Carbonara Tradicional".to_string(),
            description: "Receta romana auténtica con guanciale y pecorino".to_string(),
            servings: Some(4),
            prep_time_minutes: Some(10),
            cook_time_minutes: Some(15),
            total_time_minutes: Some(25),
            difficulty: Some("media".to_string()),
            cuisine: Some("italiana".to_string()),
            ingredients: vec![
                RecipeIngredient::new(
                    "Espaguetis",
                    Some(400.0),
                    Some("g".to_string()),
                    vec![EvidenceAnchor::new(10, Some(12.0), Some(15.0), 0.95)],
                ),
                RecipeIngredient::new(
                    "Guanciale",
                    Some(150.0),
                    Some("g".to_string()),
                    vec![EvidenceAnchor::new(10, Some(16.0), Some(20.0), 0.9)],
                ),
            ],
            steps: vec![RecipeStep {
                ordinal: 1,
                instruction: "Cortar el guanciale en tiras y dorar en sartén sin aceite"
                    .to_string(),
                time_start: Some(25.0),
                time_end: Some(45.0),
                technique: Some("dorado".to_string()),
                temperature: None,
                evidence: vec![EvidenceAnchor::new(10, Some(25.0), Some(45.0), 0.9)],
            }],
            equipment: vec![],
            techniques: vec![],
            confidence: 0.95,
            conflicts: vec![],
        }
    }

    #[test]
    fn test_valid_recipe_passes() {
        let recipe = valid_recipe();
        assert!(validate_structured_recipe(&recipe, Some(120.0)).is_ok());
    }

    #[test]
    fn test_negative_quantity_rejected() {
        let mut recipe = valid_recipe();
        recipe.ingredients[0].quantity = Some(-50.0);
        assert!(matches!(
            validate_structured_recipe(&recipe, Some(120.0)),
            Err(RecipeValidationError::NegativeQuantity { .. })
        ));
    }

    #[test]
    fn test_timestamp_exceeds_duration_rejected() {
        let mut recipe = valid_recipe();
        recipe.steps[0].time_end = Some(200.0); // max 120
        assert!(matches!(
            validate_structured_recipe(&recipe, Some(120.0)),
            Err(RecipeValidationError::TimestampExceedsDuration { .. })
        ));
    }

    #[test]
    fn test_step_without_evidence_rejected() {
        let mut recipe = valid_recipe();
        recipe.steps[0].evidence.clear();
        assert!(matches!(
            validate_structured_recipe(&recipe, Some(120.0)),
            Err(RecipeValidationError::MissingEvidenceForStep(1))
        ));
    }
}
