//! # Editorial AI Provider Boundary
//!
//! Frontera aislada entre el compilador editorial y el modelo de lenguaje.
//! El compilador NUNCA llama a Gemini directamente: pide texto a un
//! [`EditorialProvider`] y valida la respuesta antes de persistir nada.
//!
//! ```text
//! EditorialCompiler ──► EditorialProvider ──► Mock (tests / sin red)
//!                                              Gemini (adaptador nativo)
//! ```
//!
//! Cambiar de modelo (otro vendor, modelo local, mock) es sustituir una
//! variante del enum, sin reescribir el compilador. La clave de API vive
//! únicamente en el adaptador existente (`infrastructure::gemini`): este
//! módulo no conoce secretos.

use crate::application::editorial_evidence::{
    EditorialEvidencePackage, MultiSourceEvidencePackage,
};
use crate::domain::editorial::EditorialArticlePayload;
use serde::{Deserialize, Serialize};
use std::fmt;

/// Decisión de ubicación que el compilador comunica al proveedor.
/// Fase 2: siempre se compila HACIA un tomo explícito (`ExistingVolume`);
/// las demás variantes reservan el protocolo de enrutado futuro sin
/// implementar creación automática de tomos.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlacementDecision {
    ExistingVolume,
    NewVolumeCandidate,
    RequiresReview,
}

impl fmt::Display for PlacementDecision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ExistingVolume => write!(f, "existing_volume"),
            Self::NewVolumeCandidate => write!(f, "new_volume_candidate"),
            Self::RequiresReview => write!(f, "requires_review"),
        }
    }
}

/// Resumen de un artículo ya publicado en el tomo destino. El proveedor lo
/// usa para alinear tipo/tono y no duplicar fascículos existentes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExistingArticleSummary {
    pub id: String,
    pub title: String,
    pub article_type: String,
    pub summary: String,
}

/// Contexto editorial que acompaña al paquete de evidencia.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorialContext {
    pub target_volume_id: String,
    pub target_chapter_id: Option<i64>,
    pub placement: PlacementDecision,
    pub existing_articles: Vec<ExistingArticleSummary>,
}

/// Petición estable que recibe el proveedor para una fuente individual.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorialCompilerRequest {
    pub schema_version: String,
    pub package: EditorialEvidencePackage,
    pub context: EditorialContext,
}

/// Petición multi-fuente estable que recibe el proveedor editorial (Fase 4).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiSourceEditorialCompilerRequest {
    pub schema_version: String,
    pub package: MultiSourceEvidencePackage,
    pub context: EditorialContext,
}

/// Errores del proveedor. NUNCA llegan a SQLite como artículo: el
/// compilador los convierte en compilación `failed`.
#[derive(Debug, Clone, PartialEq)]
pub enum ProviderError {
    PromptTooLarge(usize),
    ProviderFailed(String),
    EmptyResponse,
    InvalidJson(String),
}

impl fmt::Display for ProviderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::PromptTooLarge(chars) => write!(
                f,
                "editorial prompt too large: {chars} chars exceeds adapter limit"
            ),
            Self::ProviderFailed(reason) => write!(f, "editorial provider failed: {reason}"),
            Self::EmptyResponse => write!(f, "editorial provider returned an empty response"),
            Self::InvalidJson(reason) => {
                write!(f, "editorial provider did not return valid JSON: {reason}")
            }
        }
    }
}

impl std::error::Error for ProviderError {}

/// Escenarios deterministas del proveedor mock. Solo tests y builds de
/// desarrollo: permiten probar el pipeline completo sin red ni API key.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MockScenario {
    /// Payload válido derivado del paquete real (la provenance pasa).
    Valid,
    /// Dos evidencias con cantidades distintas + conflicto sugerido.
    WithConflict,
    /// Timestamp fuera de la duración del video.
    OutOfRangeTimestamp,
    /// Basura no-JSON.
    InvalidJson,
    /// JSON bien formado pero contrato incompleto (sin título).
    IncompleteContract,
    // --- Escenarios requeridos para Fase 4: Multi-Source Synthesis ---
    /// Escenario A: 3 fuentes con misma afirmación -> síntesis desduplicada con provenance intacta.
    MultiSourceDeduplicated,
    /// Escenario B: 2 fuentes con conflicto numérico -> conflicto no resuelto.
    MultiSourceNumericConflict,
    /// Escenario C: 2 fuentes con conflicto cualitativo -> requires_review.
    MultiSourceQualitativeConflict,
    /// Escenario D: 3 fuentes con afirmaciones complementarias distintas -> artículo unificado.
    MultiSourceComplementary,
    /// Escenario E: evidencia insuficiente -> rechazado / fallo de validación.
    InsufficientEvidence,
    /// Escenario F: artículo existente + nueva fuente -> nueva versión enriquecida.
    VersionUpdateNewSource,
    /// Escenario G: nuevo cluster temático -> NewVolumeCandidate (propuesta sin inserción automática).
    NewVolumeCandidateProposal,
}

#[derive(Debug, Clone)]
pub struct MockEditorialProvider {
    pub scenario: MockScenario,
}

#[derive(Debug, Clone)]
pub struct GeminiEditorialProvider {
    pub max_output_tokens: u32,
}

/// Proveedor intercambiable. La variante Gemini delega en el adaptador
/// nativo existente (clave solo en el proceso Rust, timeout y redacción ya
/// probados en `infrastructure::gemini`).
#[derive(Debug, Clone)]
pub enum EditorialProvider {
    Mock(MockEditorialProvider),
    Gemini(GeminiEditorialProvider),
}

impl EditorialProvider {
    pub fn mock(scenario: MockScenario) -> Self {
        Self::Mock(MockEditorialProvider { scenario })
    }

    pub fn gemini(max_output_tokens: u32) -> Self {
        Self::Gemini(GeminiEditorialProvider { max_output_tokens })
    }

    pub fn name(&self) -> &'static str {
        match self {
            Self::Mock(_) => "mock",
            Self::Gemini(_) => "gemini",
        }
    }

    /// Pide al modelo el JSON editorial para una petición ya construida.
    pub async fn generate(
        &self,
        request: &EditorialCompilerRequest,
        max_output_tokens: u32,
    ) -> Result<String, ProviderError> {
        let prompt = build_editorial_prompt(request)?;
        match self {
            Self::Mock(mock) => Ok(mock.respond(&request.package, &prompt)),
            Self::Gemini(_) => crate::infrastructure::gemini::generate(&prompt, max_output_tokens)
                .await
                .map(|response| response.text)
                .map_err(|reason| ProviderError::ProviderFailed(reason)),
        }
    }

    /// Pide al modelo el JSON editorial para una síntesis multi-fuente (Fase 4).
    pub async fn generate_multi_source(
        &self,
        request: &MultiSourceEditorialCompilerRequest,
        max_output_tokens: u32,
    ) -> Result<String, ProviderError> {
        let prompt = build_multi_source_editorial_prompt(request)?;
        match self {
            Self::Mock(mock) => Ok(mock.respond_multi_source(&request.package, &prompt)),
            Self::Gemini(_) => crate::infrastructure::gemini::generate(&prompt, max_output_tokens)
                .await
                .map(|response| response.text)
                .map_err(|reason| ProviderError::ProviderFailed(reason)),
        }
    }
}

/// Construye el prompt para compilación individual.
/// Falla ANTES de red si el prompt supera el límite del adaptador.
pub fn build_editorial_prompt(request: &EditorialCompilerRequest) -> Result<String, ProviderError> {
    let request_json = serde_json::to_string_pretty(request)
        .map_err(|e| ProviderError::InvalidJson(e.to_string()))?;
    let prompt = format!(
        "Eres el editor de Pulsaria, un librero digital local. \
        Recibes EVIDENCIA REAL extraída de un video (transcripción con timestamps, keyframes, OCR, metadata). \
        Reglas absolutas:\n\
        1. Responde ÚNICAMENTE con un objeto JSON válido, sin markdown ni texto adicional.\n\
        2. El JSON debe cumplir el contrato: schema_version=\"1.0\", article_type (recipe|tutorial|guide|technical|review|reference|comparison|collection|insight), title, summary, content (objeto), sources[], evidence[], conflicts[], confidence{{overall, sections}}, editorial_notes[].\n\
        3. Cada evidence DEBE citar job_id, kind y timestamps REALES copiados de la evidencia entregada. PROHIBIDO inventar timestamps, segmentos o keyframes.\n\
        4. Si dos evidencias discrepan (cantidades, instrucciones, afirmaciones), decláralas en conflicts con los ÍNDICES de evidence (evidence_a_index, evidence_b_index) y NO promedies valores.\n\
        5. confidence.overall y cada confidence de evidence en [0.0, 1.0].\n\
        6. Si la evidencia es insuficiente, devuelve confidence bajo y anótalo en editorial_notes; nunca rellenes con conocimiento externo.\n\
        \n\
        PETICIÓN:\n{request_json}"
    );
    if prompt.chars().count() > crate::infrastructure::gemini::MAX_PROMPT_CHARS {
        return Err(ProviderError::PromptTooLarge(prompt.chars().count()));
    }
    Ok(prompt)
}

/// Construye el prompt estricto de síntesis multi-fuente (Fase 4).
/// Instruye al modelo como motor editorial subordinado a la evidencia:
/// la evidencia manda, no inventa hechos ni timestamps, desduplica claims
/// preservando provenance, expone conflictos sin resolverlos silenciosamente,
/// y puede proponer candidatos a nuevos tomos si el cluster temático lo amerita.
pub fn build_multi_source_editorial_prompt(
    request: &MultiSourceEditorialCompilerRequest,
) -> Result<String, ProviderError> {
    let request_json = serde_json::to_string_pretty(request)
        .map_err(|e| ProviderError::InvalidJson(e.to_string()))?;
    let prompt = format!(
        "Eres el motor de síntesis editorial de Pulsaria, una biblioteca digital multimodal local-first.\n\
        Tu función es sintetizar EVIDENCIA REAL extraída de múltiples videos / fuentes en un único artículo estructurado.\n\
        Pulsaria y la base SQLite son la autoridad del sistema. Tú propones; Pulsaria valida y publica.\n\
        Reglas absolutas:\n\
        1. Responde ÚNICAMENTE con un objeto JSON válido, sin markdown ni texto adicional.\n\
        2. El JSON debe cumplir el contrato: schema_version=\"1.0\", article_type (recipe|tutorial|guide|technical|review|reference|comparison|collection|insight), title, summary, content (objeto no vacío), sources[], evidence[], conflicts[], confidence{{overall, sections}}, editorial_notes[], candidate_volume (opcional).\n\
        3. Usa ÚNICAMENTE la evidencia suministrada en las fuentes entregadas. PROHIBIDO inventar hechos, fuentes o timestamps. No cites evidencia fuera del paquete.\n\
        4. Trazabilidad rigurosa: cada factual claim debe conservar provenance. Cita job_id, kind y timestamps reales de la evidencia entregada.\n\
        5. Fusión de claims redundantes: cuando dos o más fuentes afirmen un hecho semánticamente equivalente, sintetízalo en una única afirmación clara en el contenido, pero conserva en sources[] y evidence[] la atribución a todas las fuentes originales.\n\
        6. Si dos o más fuentes discrepan (cantidades, afirmaciones opuestas o contradictorias), NO resuelvas la contradicción silenciosamente, NO promedies valores numéricos y NO elijas una fuente sobre otra solo por el orden. Declara la discrepancia en conflicts[] con los índices exactos en evidence[] y márcala para revisión.\n\
        7. Si la evidencia es insuficiente para respaldar una afirmación, NO rellenes los vacíos con conocimiento general. Declara baja confianza y anótalo en editorial_notes.\n\
        8. Si las fuentes procesadas forman un cluster temático no cubierto por los tomos existentes de la biblioteca, puedes sugerir un candidato a nuevo tomo en candidate_volume (con suggested_title, rationale, suggested_category, supporting_job_ids, confidence). No crees el tomo en la base de datos: es una propuesta.\n\
        \n\
        PETICIÓN MULTI-FUENTE:\n{request_json}"
    );
    if prompt.chars().count() > crate::infrastructure::gemini::MAX_PROMPT_CHARS {
        return Err(ProviderError::PromptTooLarge(prompt.chars().count()));
    }
    Ok(prompt)
}

/// Extrae el objeto JSON de la respuesta (tolera cercas ```json) y lo
/// deserializa al contrato editorial. Un `article_type` desconocido falla
/// aquí mismo: serde lo rechaza antes de persistir nada.
pub fn parse_provider_response(text: &str) -> Result<EditorialArticlePayload, ProviderError> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(ProviderError::EmptyResponse);
    }
    let unfenced = strip_code_fences(trimmed);
    serde_json::from_str::<EditorialArticlePayload>(unfenced)
        .map_err(|e| ProviderError::InvalidJson(bound_error(&e.to_string())))
}

fn strip_code_fences(text: &str) -> &str {
    let mut out = text;
    if out.starts_with("```") {
        if let Some(newline) = out.find('\n') {
            out = &out[newline + 1..];
        }
    }
    if let Some(stripped) = out.strip_suffix("```") {
        out = stripped;
    }
    out.trim()
}

fn bound_error(detail: &str) -> String {
    detail.chars().take(300).collect()
}

impl MockEditorialProvider {
    fn respond(&self, package: &EditorialEvidencePackage, _prompt: &str) -> String {
        match self.scenario {
            MockScenario::Valid | MockScenario::MultiSourceDeduplicated => {
                self.valid_payload(package, &[])
            }
            MockScenario::WithConflict | MockScenario::MultiSourceNumericConflict => {
                self.conflict_payload(package)
            }
            MockScenario::OutOfRangeTimestamp => self.out_of_range_payload(package),
            MockScenario::InvalidJson => "{ esto no es json ".to_string(),
            MockScenario::IncompleteContract | MockScenario::InsufficientEvidence => {
                let mut value: serde_json::Value =
                    serde_json::from_str(&self.valid_payload(package, &[]))
                        .expect("mock base payload must be valid JSON");
                value["title"] = serde_json::Value::String(String::new());
                value.to_string()
            }
            _ => self.valid_payload(package, &[]),
        }
    }

    /// Responde a peticiones multi-fuente cubriendo deterministamente los Escenarios A–G (Fase 4).
    pub fn respond_multi_source(
        &self,
        package: &MultiSourceEvidencePackage,
        _prompt: &str,
    ) -> String {
        match self.scenario {
            MockScenario::Valid | MockScenario::MultiSourceDeduplicated => {
                self.multi_source_deduplicated_payload(package)
            }
            MockScenario::WithConflict | MockScenario::MultiSourceNumericConflict => {
                self.multi_source_numeric_conflict_payload(package)
            }
            MockScenario::MultiSourceQualitativeConflict => {
                self.multi_source_qualitative_conflict_payload(package)
            }
            MockScenario::MultiSourceComplementary => {
                self.multi_source_complementary_payload(package)
            }
            MockScenario::InsufficientEvidence => {
                // Escenario E: Evidencia insuficiente rechazada por contrato incompleto
                serde_json::json!({
                    "schema_version": "1.0",
                    "article_type": "technical",
                    "title": "", // Vacío para disparar rechazo en validación
                    "summary": "Evidencia insuficiente para síntesis confiable.",
                    "content": {},
                    "sources": [],
                    "evidence": [],
                    "conflicts": [],
                    "confidence": { "overall": 0.15, "sections": {} },
                    "editorial_notes": ["Evidencia insuficiente: compilación rechazada."]
                })
                .to_string()
            }
            MockScenario::VersionUpdateNewSource => {
                self.multi_source_version_update_payload(package)
            }
            MockScenario::NewVolumeCandidateProposal => {
                self.multi_source_candidate_proposal_payload(package)
            }
            MockScenario::OutOfRangeTimestamp => {
                if let Some(first) = package.packages.first() {
                    self.out_of_range_payload(first)
                } else {
                    "{ esto no es json ".to_string()
                }
            }
            MockScenario::InvalidJson => "{ esto no es json ".to_string(),
            MockScenario::IncompleteContract => {
                let mut value: serde_json::Value =
                    serde_json::from_str(&self.multi_source_deduplicated_payload(package))
                        .expect("mock base payload must be valid JSON");
                value["title"] = serde_json::Value::String(String::new());
                value.to_string()
            }
        }
    }

    fn article_type_for(package: &EditorialEvidencePackage) -> &'static str {
        let is_recipe = package.annotations.iter().any(|annotation| {
            annotation.annotation_type == "category" && annotation.value == "recipe"
        });
        if is_recipe {
            "recipe"
        } else {
            "guide"
        }
    }

    fn multi_article_type_for(package: &MultiSourceEvidencePackage) -> &'static str {
        let any_recipe = package.packages.iter().any(|pkg| {
            pkg.annotations
                .iter()
                .any(|ann| ann.annotation_type == "category" && ann.value == "recipe")
        });
        if any_recipe {
            "recipe"
        } else {
            "technical"
        }
    }

    /// Escenario A: 3 fuentes con la misma afirmación -> síntesis desduplicada con provenance intacta.
    fn multi_source_deduplicated_payload(&self, package: &MultiSourceEvidencePackage) -> String {
        let sources: Vec<serde_json::Value> = package
            .packages
            .iter()
            .map(|pkg| {
                serde_json::json!({
                    "job_id": pkg.job_id,
                    "role": "primary",
                    "citation": pkg.source.author.as_deref().unwrap_or("@fuente")
                })
            })
            .collect();

        let mut evidence = Vec::new();
        for pkg in &package.packages {
            let (start, end, text) = pkg
                .transcript
                .first()
                .map(|seg| (seg.start_sec, seg.end_sec, seg.text.clone()))
                .unwrap_or((0.0, 5.0, "Pantalla OLED de 6.7 pulgadas".to_string()));
            evidence.push(serde_json::json!({
                "job_id": pkg.job_id,
                "kind": "transcript_segment",
                "timestamp_start": start,
                "timestamp_end": end,
                "keyframe_path": pkg.keyframes.first().map(|kf| kf.path.clone()),
                "transcript_text": text,
                "fact": "Pantalla OLED de 6.7 pulgadas con 120Hz adaptativo",
                "confidence": 0.95
            }));
        }

        let payload = serde_json::json!({
            "schema_version": "1.0",
            "article_type": Self::multi_article_type_for(package),
            "title": format!("Síntesis multi-fuente desduplicada ({} fuentes)", package.total_sources),
            "summary": "Afirmación común sobre pantalla OLED corroborada independientemente por múltiples fuentes.",
            "content": {
                "blocks": [
                    {
                        "kind": "intro",
                        "text": "El dispositivo incorpora un panel OLED de 6.7 pulgadas con tasa de refresco adaptativa de 120Hz."
                    }
                ]
            },
            "sources": sources,
            "evidence": evidence,
            "conflicts": [],
            "confidence": { "overall": 0.95, "sections": {} },
            "editorial_notes": [
                format!("Afirmación única respaldada por {} fuentes independientes.", package.total_sources)
            ]
        });
        payload.to_string()
    }

    /// Escenario B: 2 fuentes con discrepancia numérica -> conflicto no resuelto.
    fn multi_source_numeric_conflict_payload(
        &self,
        package: &MultiSourceEvidencePackage,
    ) -> String {
        let pkg_a = package.packages.first();
        let pkg_b = package.packages.get(1).or(pkg_a);

        let job_a = pkg_a.map(|p| p.job_id).unwrap_or(10);
        let job_b = pkg_b.map(|p| p.job_id).unwrap_or(20);

        let (a_start, a_end) = pkg_a
            .and_then(|p| p.transcript.first())
            .map(|s| (s.start_sec, s.end_sec))
            .unwrap_or((0.0, 4.0));
        let (b_start, b_end) = pkg_b
            .and_then(|p| p.transcript.first())
            .map(|s| (s.start_sec, s.end_sec))
            .unwrap_or((0.0, 4.0));

        let sources = if job_a == job_b {
            vec![serde_json::json!({ "job_id": job_a, "role": "primary", "citation": null })]
        } else {
            vec![
                serde_json::json!({ "job_id": job_a, "role": "primary", "citation": "@fuente_a" }),
                serde_json::json!({ "job_id": job_b, "role": "supporting", "citation": "@fuente_b" }),
            ]
        };

        let payload = serde_json::json!({
            "schema_version": "1.0",
            "article_type": "technical",
            "title": "Comparativa de Especificaciones Físicas",
            "summary": "Discrepancia en peso reportado entre distintas fuentes técnicas.",
            "content": {
                "blocks": [
                    {
                        "kind": "intro",
                        "text": "El peso del dispositivo reportado varía entre fuentes evaluadas."
                    }
                ]
            },
            "sources": sources,
            "evidence": [
                {
                    "job_id": job_a,
                    "kind": "transcript_segment",
                    "timestamp_start": a_start,
                    "timestamp_end": a_end,
                    "keyframe_path": null,
                    "transcript_text": "El dispositivo pesa 200 gramos",
                    "fact": "200 g de peso total",
                    "confidence": 0.9
                },
                {
                    "job_id": job_b,
                    "kind": "transcript_segment",
                    "timestamp_start": b_start,
                    "timestamp_end": b_end,
                    "keyframe_path": null,
                    "transcript_text": "El dispositivo pesa 250 gramos",
                    "fact": "250 g de peso total",
                    "confidence": 0.85
                }
            ],
            "conflicts": [
                {
                    "fact_key": "auto:g",
                    "description": "Discrepancia numérica: la Fuente A indica 200 g mientras que la Fuente B indica 250 g.",
                    "evidence_a_index": 0,
                    "evidence_b_index": 1
                }
            ],
            "confidence": { "overall": 0.6, "sections": {} },
            "editorial_notes": ["Conflicto numérico entre fuentes: requiere revisión manual sin promediar."]
        });
        payload.to_string()
    }

    /// Escenario C: 2 fuentes con contradicción cualitativa -> requires_review.
    fn multi_source_qualitative_conflict_payload(
        &self,
        package: &MultiSourceEvidencePackage,
    ) -> String {
        let pkg_a = package.packages.first();
        let pkg_b = package.packages.get(1).or(pkg_a);

        let job_a = pkg_a.map(|p| p.job_id).unwrap_or(10);
        let job_b = pkg_b.map(|p| p.job_id).unwrap_or(20);

        let (a_start, a_end) = pkg_a
            .and_then(|p| p.transcript.first())
            .map(|s| (s.start_sec, s.end_sec))
            .unwrap_or((0.0, 3.0));
        let (b_start, b_end) = pkg_b
            .and_then(|p| p.transcript.first())
            .map(|s| (s.start_sec, s.end_sec))
            .unwrap_or((0.0, 3.0));

        let sources = if job_a == job_b {
            vec![serde_json::json!({ "job_id": job_a, "role": "primary", "citation": null })]
        } else {
            vec![
                serde_json::json!({ "job_id": job_a, "role": "primary", "citation": "@reviewer_1" }),
                serde_json::json!({ "job_id": job_b, "role": "supporting", "citation": "@reviewer_2" }),
            ]
        };

        let payload = serde_json::json!({
            "schema_version": "1.0",
            "article_type": "review",
            "title": "Análisis de Capacidades de Grabación de Cámara",
            "summary": "Contradicción cualitativa sobre soporte de grabación RAW.",
            "content": {
                "blocks": [
                    {
                        "kind": "intro",
                        "text": "Existe discrepancia cualitativa sobre la disponibilidad de grabación RAW en la cámara."
                    }
                ]
            },
            "sources": sources,
            "evidence": [
                {
                    "job_id": job_a,
                    "kind": "transcript_segment",
                    "timestamp_start": a_start,
                    "timestamp_end": a_end,
                    "keyframe_path": null,
                    "transcript_text": "Soporta grabación de video RAW en 4K",
                    "fact": "La función de grabación RAW está disponible",
                    "confidence": 0.88
                },
                {
                    "job_id": job_b,
                    "kind": "transcript_segment",
                    "timestamp_start": b_start,
                    "timestamp_end": b_end,
                    "keyframe_path": null,
                    "transcript_text": "No dispone de modo de grabación RAW",
                    "fact": "La función de grabación RAW no está disponible",
                    "confidence": 0.85
                }
            ],
            "conflicts": [
                {
                    "fact_key": "grabacion_raw",
                    "description": "Contradicción cualitativa: Fuente A afirma que la grabación RAW está disponible, mientras Fuente B indica que no lo está.",
                    "evidence_a_index": 0,
                    "evidence_b_index": 1
                }
            ],
            "confidence": { "overall": 0.65, "sections": {} },
            "editorial_notes": ["Conflicto cualitativo abierto: se preservan ambas evidencias para revisión humana."]
        });
        payload.to_string()
    }

    /// Escenario D: 3 fuentes con afirmaciones complementarias -> artículo combinado.
    fn multi_source_complementary_payload(&self, package: &MultiSourceEvidencePackage) -> String {
        let sources: Vec<serde_json::Value> = package
            .packages
            .iter()
            .map(|pkg| {
                serde_json::json!({
                    "job_id": pkg.job_id,
                    "role": "primary",
                    "citation": pkg.source.author.as_deref().unwrap_or("@creador")
                })
            })
            .collect();

        let complementary_facts = [
            "Pantalla OLED de 6.7 pulgadas con 120Hz adaptativo",
            "Batería de 5000 mAh con 2 días de autonomía",
            "Carga rápida por cable de 65W certificada",
        ];

        let mut evidence = Vec::new();
        for (i, pkg) in package.packages.iter().enumerate() {
            let (start, end, text) = pkg
                .transcript
                .first()
                .map(|s| (s.start_sec, s.end_sec, s.text.clone()))
                .unwrap_or((0.0, 5.0, format!("Dato complementario {}", i + 1)));
            let fact_str = complementary_facts.get(i).unwrap_or(&"Dato complementario");
            evidence.push(serde_json::json!({
                "job_id": pkg.job_id,
                "kind": "transcript_segment",
                "timestamp_start": start,
                "timestamp_end": end,
                "keyframe_path": pkg.keyframes.first().map(|kf| kf.path.clone()),
                "transcript_text": text,
                "fact": fact_str,
                "confidence": 0.94
            }));
        }

        let payload = serde_json::json!({
            "schema_version": "1.0",
            "article_type": "guide",
            "title": "Guía Integral de Arquitectura del Dispositivo",
            "summary": "Compendio exhaustivo que combina pantalla, autonomía y rendimiento energético.",
            "content": {
                "blocks": [
                    {
                        "kind": "heading",
                        "text": "Visión General"
                    },
                    {
                        "kind": "text",
                        "text": "Este artículo sintetiza aspectos complementarios verificados a través de múltiples fuentes de la biblioteca."
                    },
                    {
                        "kind": "list",
                        "title": "Especificaciones Complementarias",
                        "items": [
                            "Pantalla OLED de 6.7 pulgadas con 120Hz adaptativo",
                            "Batería de 5000 mAh con 2 días de autonomía",
                            "Carga rápida por cable de 65W certificada"
                        ]
                    }
                ]
            },
            "sources": sources,
            "evidence": evidence,
            "conflicts": [],
            "confidence": { "overall": 0.94, "sections": {} },
            "editorial_notes": [
                format!("Artículo integrado con información complementaria de {} fuentes.", package.total_sources)
            ]
        });
        payload.to_string()
    }

    /// Escenario F: artículo existente + nueva fuente -> nueva versión enriquecida.
    fn multi_source_version_update_payload(&self, package: &MultiSourceEvidencePackage) -> String {
        let sources: Vec<serde_json::Value> = package
            .packages
            .iter()
            .map(|pkg| {
                serde_json::json!({
                    "job_id": pkg.job_id,
                    "role": "primary",
                    "citation": pkg.source.author.as_deref().unwrap_or("@actualizacion")
                })
            })
            .collect();

        let mut evidence = Vec::new();
        for pkg in &package.packages {
            let (start, end, text) = pkg
                .transcript
                .first()
                .map(|s| (s.start_sec, s.end_sec, s.text.clone()))
                .unwrap_or((0.0, 5.0, "Dato técnico actualizado".to_string()));
            evidence.push(serde_json::json!({
                "job_id": pkg.job_id,
                "kind": "transcript_segment",
                "timestamp_start": start,
                "timestamp_end": end,
                "keyframe_path": pkg.keyframes.first().map(|kf| kf.path.clone()),
                "transcript_text": text,
                "fact": "Información técnica verificada y ampliada",
                "confidence": 0.96
            }));
        }

        let payload = serde_json::json!({
            "schema_version": "1.0",
            "article_type": "technical",
            "title": format!("Especificaciones Técnicas Consolidadas ({} fuentes)", package.total_sources),
            "summary": "Fascículo ampliado y actualizado con nueva evidencia audiovisual incorporada.",
            "content": {
                "blocks": [
                    {
                        "kind": "text",
                        "text": "Versión actualizada del análisis técnico enriquecida con nuevas fuentes de la biblioteca."
                    }
                ]
            },
            "sources": sources,
            "evidence": evidence,
            "conflicts": [],
            "confidence": { "overall": 0.96, "sections": {} },
            "editorial_notes": [
                format!("Actualización incremental: {} fuentes consolidadas.", package.total_sources)
            ]
        });
        payload.to_string()
    }

    /// Escenario G: nuevo cluster temático -> NewVolumeCandidate (propuesta sin inserción automática).
    fn multi_source_candidate_proposal_payload(
        &self,
        package: &MultiSourceEvidencePackage,
    ) -> String {
        let sources: Vec<serde_json::Value> = package
            .packages
            .iter()
            .map(|pkg| {
                serde_json::json!({
                    "job_id": pkg.job_id,
                    "role": "primary",
                    "citation": pkg.source.author.as_deref().unwrap_or("@geologia")
                })
            })
            .collect();

        let mut evidence = Vec::new();
        for pkg in &package.packages {
            let (start, end, text) = pkg
                .transcript
                .first()
                .map(|s| (s.start_sec, s.end_sec, s.text.clone()))
                .unwrap_or((0.0, 5.0, "Registro de erupción volcánica".to_string()));
            evidence.push(serde_json::json!({
                "job_id": pkg.job_id,
                "kind": "transcript_segment",
                "timestamp_start": start,
                "timestamp_end": end,
                "keyframe_path": pkg.keyframes.first().map(|kf| kf.path.clone()),
                "transcript_text": text,
                "fact": "Dinámica eruptiva y emisión piroclástica",
                "confidence": 0.92
            }));
        }

        let payload = serde_json::json!({
            "schema_version": "1.0",
            "article_type": "insight",
            "title": "Sistemas Volcánicos y Erupciones Recientes",
            "summary": "Estudio transversal sobre actividad geológica y dinámicas piroclásticas.",
            "content": {
                "blocks": [
                    {
                        "kind": "intro",
                        "text": "Análisis exhaustivo sobre vulcanismo activo y caracterización de flujos de lava."
                    }
                ]
            },
            "sources": sources,
            "evidence": evidence,
            "conflicts": [],
            "confidence": { "overall": 0.92, "sections": {} },
            "editorial_notes": [
                "Cluster temático novedoso: se propone creación de nuevo tomo editorial."
            ],
            "candidate_volume": {
                "suggested_title": "Sistemas Volcánicos y Geología",
                "rationale": "Múltiples fuentes procesadas forman un cluster temático coherente de vulcanología no representado en los tomos actuales.",
                "suggested_category": "geology",
                "suggested_chapter": "Vulcanología Activa",
                "supporting_job_ids": package.job_ids(),
                "confidence": 0.92
            }
        });
        payload.to_string()
    }

    /// Payload válido que CITA evidencia real del paquete (la provenance pasa).
    fn valid_payload(&self, package: &EditorialEvidencePackage, extra_notes: &[&str]) -> String {
        let mut notes: Vec<String> = vec!["Compilado por proveedor mock.".to_string()];
        notes.extend(extra_notes.iter().map(|note| note.to_string()));
        let segment = package.transcript.first();
        let (start, end, text) = segment
            .map(|seg| (seg.start_sec, seg.end_sec, seg.text.clone()))
            .unwrap_or((0.0, 1.0, "Evidencia de prueba.".to_string()));
        let keyframe_path = package.keyframes.first().map(|kf| kf.path.clone());
        let payload = serde_json::json!({
            "schema_version": "1.0",
            "article_type": Self::article_type_for(package),
            "title": format!("Compilado mock del job {}", package.job_id),
            "summary": "Artículo de prueba generado sin red a partir de evidencia real.",
            "content": { "blocks": [{ "kind": "intro", "text": text }] },
            "sources": [{ "job_id": package.job_id, "role": "primary", "citation": null }],
            "evidence": [{
                "job_id": package.job_id,
                "kind": "transcript_segment",
                "timestamp_start": start,
                "timestamp_end": end,
                "keyframe_path": keyframe_path,
                "transcript_text": text,
                "fact": "hecho citado de la transcripción",
                "confidence": 0.9
            }],
            "conflicts": [],
            "confidence": { "overall": 0.9, "sections": {} },
            "editorial_notes": notes
        });
        payload.to_string()
    }

    fn conflict_payload(&self, package: &EditorialEvidencePackage) -> String {
        let first = package.transcript.first().cloned();
        let second = package.transcript.get(1).cloned().or(first.clone());
        let (a_start, a_end) = first
            .as_ref()
            .map(|seg| (seg.start_sec, seg.end_sec))
            .unwrap_or((0.0, 1.0));
        let (b_start, b_end) = second
            .as_ref()
            .map(|seg| (seg.start_sec, seg.end_sec))
            .unwrap_or((2.0, 3.0));
        let payload = serde_json::json!({
            "schema_version": "1.0",
            "article_type": Self::article_type_for(package),
            "title": format!("Compilado con conflicto del job {}", package.job_id),
            "summary": "Dos evidencias discrepan en cantidad.",
            "content": { "blocks": [] },
            "sources": [{ "job_id": package.job_id, "role": "primary", "citation": null }],
            "evidence": [
                { "job_id": package.job_id, "kind": "transcript_segment",
                  "timestamp_start": a_start, "timestamp_end": a_end,
                  "keyframe_path": null, "transcript_text": "200 gramos de harina",
                  "fact": "200 g de harina", "confidence": 0.9 },
                { "job_id": package.job_id, "kind": "ocr",
                  "timestamp_start": b_start, "timestamp_end": b_end,
                  "keyframe_path": null, "transcript_text": "250 g en pantalla",
                  "fact": "250 g de harina", "confidence": 0.85 }
            ],
            "conflicts": [{
                "fact_key": "harina_cantidad",
                "description": "Audio indica 200 g pero el texto en pantalla indica 250 g.",
                "evidence_a_index": 0, "evidence_b_index": 1
            }],
            "confidence": { "overall": 0.6, "sections": {} },
            "editorial_notes": ["Conflicto de cantidad entre audio y OCR."]
        });
        payload.to_string()
    }

    fn out_of_range_payload(&self, package: &EditorialEvidencePackage) -> String {
        // Fin más allá de la duración conocida; sin duración, inicio negativo.
        let (start, end) = match package.source.duration_secs {
            Some(duration) => (0.0, duration + 10.0),
            None => (-5.0, 1.0),
        };
        let payload = serde_json::json!({
            "schema_version": "1.0",
            "article_type": "guide",
            "title": format!("Compilado fuera de rango del job {}", package.job_id),
            "summary": "Payload de prueba con timestamp inválido.",
            "content": { "blocks": [] },
            "sources": [{ "job_id": package.job_id, "role": "primary", "citation": null }],
            "evidence": [{
                "job_id": package.job_id, "kind": "timestamp",
                "timestamp_start": start, "timestamp_end": end,
                "keyframe_path": null, "transcript_text": null,
                "fact": "hecho fuera de rango", "confidence": 0.5
            }],
            "conflicts": [],
            "confidence": { "overall": 0.5, "sections": {} },
            "editorial_notes": []
        });
        payload.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::editorial_evidence::tests::{insert_full_source, setup_evidence_db};
    use crate::application::editorial_evidence::{
        EditorialEvidencePackage, EVIDENCE_SCHEMA_VERSION,
    };

    fn sample_package() -> EditorialEvidencePackage {
        let conn = setup_evidence_db();
        insert_full_source(&conn, 9);
        crate::application::editorial_evidence::build_evidence_package(&conn, 9).unwrap()
    }

    fn sample_request(package: EditorialEvidencePackage) -> EditorialCompilerRequest {
        EditorialCompilerRequest {
            schema_version: EVIDENCE_SCHEMA_VERSION.to_string(),
            package,
            context: EditorialContext {
                target_volume_id: "vol-recipes".to_string(),
                target_chapter_id: None,
                placement: PlacementDecision::ExistingVolume,
                existing_articles: vec![],
            },
        }
    }

    #[test]
    fn test_mock_valid_round_trips_through_contract() {
        let package = sample_package();
        let mock = MockEditorialProvider {
            scenario: MockScenario::Valid,
        };
        let text = mock.respond(&package, "prompt");
        let payload = parse_provider_response(&text).unwrap();
        assert_eq!(payload.schema_version, "1.0");
        assert_eq!(payload.sources.len(), 1);
        assert_eq!(payload.sources[0].job_id, 9);
        // La anotación `recipe` del paquete dirige el tipo inferido.
        assert_eq!(payload.article_type.as_str(), "recipe");
        crate::domain::editorial::validate_editorial_contract(&payload).unwrap();
    }

    #[test]
    fn test_fences_are_stripped_before_parsing() {
        let package = sample_package();
        let mock = MockEditorialProvider {
            scenario: MockScenario::Valid,
        };
        let fenced = format!("```json\n{}\n```", mock.respond(&package, "prompt"));
        assert!(parse_provider_response(&fenced).is_ok());
    }

    #[test]
    fn test_invalid_json_is_an_explicit_error() {
        let err = parse_provider_response("{ esto no es json").unwrap_err();
        assert!(matches!(err, ProviderError::InvalidJson(_)));
        assert!(parse_provider_response("   ").unwrap_err() == ProviderError::EmptyResponse);
    }

    #[test]
    fn test_unknown_article_type_never_reaches_the_store() {
        let bad = r#"{
            "schema_version": "1.0", "article_type": "soneto",
            "title": "X", "summary": "Y", "content": {},
            "sources": [], "evidence": [], "conflicts": [],
            "confidence": { "overall": 1.0, "sections": {} }, "editorial_notes": []
        }"#;
        assert!(matches!(
            parse_provider_response(bad).unwrap_err(),
            ProviderError::InvalidJson(_)
        ));
    }

    #[test]
    fn test_incomplete_contract_is_detected_downstream() {
        let package = sample_package();
        let mock = MockEditorialProvider {
            scenario: MockScenario::IncompleteContract,
        };
        let text = mock.respond(&package, "prompt");
        let payload = parse_provider_response(&text).unwrap();
        let err = crate::domain::editorial::validate_editorial_contract(&payload).unwrap_err();
        assert_eq!(
            err,
            crate::domain::editorial::ContractValidationError::MissingTitle
        );
    }

    #[test]
    fn test_prompt_respects_adapter_budget() {
        let request = sample_request(sample_package());
        let prompt = build_editorial_prompt(&request).unwrap();
        assert!(prompt.contains("PROHIBIDO inventar timestamps"));
        assert!(prompt.chars().count() <= crate::infrastructure::gemini::MAX_PROMPT_CHARS);
    }
}
