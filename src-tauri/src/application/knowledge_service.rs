//! # Knowledge Service
//!
//! Persistence, retrieval, and indexing for structured semantic knowledge
//! (domain classifications, structured recipes, semantic entities, provenance).
//!
//! Enforces:
//! - "AI proposes. Pulsaria validates. SQLite persists. Evidence provides provenance."
//! - Idempotent saves (replace on re-run with matching or newer models).
//! - Cascade deletion on job removal.
//! - Audit trail with model_id, model_revision, prompt_version, source_hash.

use crate::domain::ai_task::{AiTaskExecution, AiTaskStatus, AiTaskType};
use crate::domain::recipe::{
    EvidenceAnchor, RecipeConflict, RecipeEquipment, RecipeIngredient, RecipeStep, RecipeTechnique,
    StructuredRecipe,
};
use crate::domain::semantic::{
    ContentDomain, ContentType, DomainClassification, EntityType, ModelMetadata, SemanticEntity,
};
use rusqlite::{params, Connection, OptionalExtension, Result, Transaction};

/// Initializes the knowledge schema tables in SQLite within a transaction.
pub fn init_knowledge_schema(transaction: &Transaction<'_>) -> Result<()> {
    // 1. Domain classifications
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS knowledge_domain_classifications (
            job_id INTEGER PRIMARY KEY,
            domain TEXT NOT NULL,
            content_type TEXT NOT NULL,
            confidence REAL NOT NULL,
            rationale TEXT,
            suggested_tags TEXT NOT NULL DEFAULT '[]',
            model_id TEXT NOT NULL,
            model_provider TEXT NOT NULL,
            model_revision TEXT NOT NULL,
            prompt_version TEXT NOT NULL,
            schema_version TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 2. Structured recipes
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS knowledge_recipes (
            id TEXT PRIMARY KEY,
            job_id INTEGER NOT NULL UNIQUE,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            servings INTEGER,
            prep_time_minutes INTEGER,
            cook_time_minutes INTEGER,
            total_time_minutes INTEGER,
            difficulty TEXT,
            cuisine TEXT,
            confidence REAL NOT NULL DEFAULT 1.0,
            status TEXT NOT NULL DEFAULT 'completed',
            review_reasons TEXT NOT NULL DEFAULT '[]',
            conflicts_json TEXT NOT NULL DEFAULT '[]',
            equipment_json TEXT NOT NULL DEFAULT '[]',
            techniques_json TEXT NOT NULL DEFAULT '[]',
            schema_version TEXT NOT NULL DEFAULT '1.0',
            model_id TEXT NOT NULL,
            model_provider TEXT NOT NULL,
            model_revision TEXT NOT NULL,
            prompt_version TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 3. Structured recipe ingredients
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS knowledge_recipe_ingredients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id TEXT NOT NULL,
            job_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            quantity REAL,
            unit TEXT,
            notes TEXT,
            optional BOOLEAN NOT NULL DEFAULT 0,
            evidence_json TEXT NOT NULL DEFAULT '[]',
            ordinal INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (recipe_id) REFERENCES knowledge_recipes(id) ON DELETE CASCADE,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 4. Structured recipe steps
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS knowledge_recipe_steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id TEXT NOT NULL,
            job_id INTEGER NOT NULL,
            ordinal INTEGER NOT NULL,
            instruction TEXT NOT NULL,
            time_start REAL,
            time_end REAL,
            technique TEXT,
            temperature TEXT,
            evidence_json TEXT NOT NULL DEFAULT '[]',
            FOREIGN KEY (recipe_id) REFERENCES knowledge_recipes(id) ON DELETE CASCADE,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 5. Semantic entities
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS knowledge_semantic_entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            entity_type TEXT NOT NULL,
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            confidence REAL NOT NULL DEFAULT 1.0,
            timestamp_start REAL,
            timestamp_end REAL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 6. Generic Structured Documents (Canonical Layer)
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS knowledge_structured_documents (
            id TEXT PRIMARY KEY,
            job_id INTEGER NOT NULL,
            domain TEXT NOT NULL,
            content_type TEXT NOT NULL,
            schema_version TEXT NOT NULL,
            status TEXT NOT NULL,
            confidence REAL NOT NULL,
            payload_json TEXT NOT NULL,
            provenance_json TEXT NOT NULL,
            review_reasons TEXT NOT NULL DEFAULT '[]',
            model_metadata TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 7. AI Task Executions (Lifecycle, idempotency, traceability)
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS ai_task_executions (
            id TEXT PRIMARY KEY,
            task_type TEXT NOT NULL,
            job_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            model TEXT NOT NULL,
            model_version TEXT NOT NULL,
            prompt_version TEXT NOT NULL,
            schema_version TEXT NOT NULL,
            input_hash TEXT NOT NULL,
            output_hash TEXT,
            started_at DATETIME,
            completed_at DATETIME,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            tokens_input INTEGER,
            tokens_output INTEGER,
            error_code TEXT,
            error_message TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Indices for high-performance querying
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_domain_domain
         ON knowledge_domain_classifications(domain, content_type)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_recipes_job
         ON knowledge_recipes(job_id)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_ingredients_recipe
         ON knowledge_recipe_ingredients(recipe_id)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_ingredients_name
         ON knowledge_recipe_ingredients(normalized_name)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_steps_recipe
         ON knowledge_recipe_steps(recipe_id)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_entities_job
         ON knowledge_semantic_entities(job_id)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_entities_norm
         ON knowledge_semantic_entities(normalized_name)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_docs_job
         ON knowledge_structured_documents(job_id)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_docs_domain
         ON knowledge_structured_documents(domain, content_type)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_docs_status
         ON knowledge_structured_documents(status)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_tasks_job
         ON ai_task_executions(job_id)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_tasks_status
         ON ai_task_executions(status)",
        [],
    )?;
    transaction.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_tasks_input_hash
         ON ai_task_executions(input_hash)",
        [],
    )?;

    Ok(())
}

/// Persists a validated domain classification for a job.
pub fn save_domain_classification(
    conn: &Connection,
    job_id: i64,
    classification: &DomainClassification,
    model_meta: &ModelMetadata,
    source_hash: &str,
) -> Result<()> {
    let suggested_tags_json =
        serde_json::to_string(&classification.suggested_tags).unwrap_or_else(|_| "[]".into());

    conn.execute(
        "INSERT INTO knowledge_domain_classifications (
            job_id, domain, content_type, confidence, rationale, suggested_tags,
            model_id, model_provider, model_revision, prompt_version, schema_version, source_hash,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(job_id) DO UPDATE SET
            domain = excluded.domain,
            content_type = excluded.content_type,
            confidence = excluded.confidence,
            rationale = excluded.rationale,
            suggested_tags = excluded.suggested_tags,
            model_id = excluded.model_id,
            model_provider = excluded.model_provider,
            model_revision = excluded.model_revision,
            prompt_version = excluded.prompt_version,
            schema_version = excluded.schema_version,
            source_hash = excluded.source_hash,
            updated_at = CURRENT_TIMESTAMP",
        params![
            job_id,
            classification.domain.as_str(),
            classification.content_type.as_str(),
            classification.confidence,
            classification.rationale,
            suggested_tags_json,
            model_meta.model_id,
            model_meta.model_provider,
            model_meta.model_revision,
            model_meta.prompt_version,
            "1.0.0",
            source_hash
        ],
    )?;

    Ok(())
}

/// Retrieves the domain classification for a job if available.
pub fn get_domain_classification(
    conn: &Connection,
    job_id: i64,
) -> Result<Option<DomainClassification>> {
    let mut stmt = conn.prepare(
        "SELECT domain, content_type, confidence, rationale, suggested_tags
         FROM knowledge_domain_classifications
         WHERE job_id = ?1",
    )?;

    let res = stmt
        .query_row(params![job_id], |row| {
            let domain_str: String = row.get(0)?;
            let content_type_str: String = row.get(1)?;
            let confidence: f64 = row.get(2)?;
            let rationale: Option<String> = row.get(3)?;
            let tags_json: String = row.get(4)?;

            let domain = ContentDomain::from_str_canonical(&domain_str);
            let content_type = ContentType::from_str_canonical(&content_type_str);
            let suggested_tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

            Ok(DomainClassification {
                domain,
                content_type,
                confidence,
                rationale: rationale.unwrap_or_default(),
                suggested_tags,
            })
        })
        .optional()?;

    Ok(res)
}

/// Stored structured recipe metadata and review status
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StoredRecipeRecord {
    pub id: String,
    pub job_id: i64,
    pub recipe: StructuredRecipe,
    pub status: String,
    pub review_reasons: Vec<String>,
    pub model_metadata: ModelMetadata,
    pub source_hash: String,
}

/// Canonical structured knowledge document record.
/// Decouples domain knowledge from domain-specific relational projections.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StructuredDocumentRecord {
    pub id: String,
    pub job_id: i64,
    pub domain: String,
    pub content_type: String,
    pub schema_version: String,
    pub status: String,
    pub confidence: f64,
    pub payload_json: String,
    pub provenance_json: String,
    pub review_reasons: Vec<String>,
    pub model_metadata: ModelMetadata,
    pub source_hash: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

/// Persists a fully validated `StructuredRecipe` along with ingredients and steps.
/// Executes atomically within a transaction.
pub fn save_structured_recipe(
    conn: &mut Connection,
    job_id: i64,
    recipe: &StructuredRecipe,
    status: &str,
    review_reasons: &[String],
    model_meta: &ModelMetadata,
    source_hash: &str,
) -> Result<String> {
    let recipe_id = format!("recipe-{}", job_id);
    let tx = conn.transaction()?;

    let conflicts_json = serde_json::to_string(&recipe.conflicts).unwrap_or_else(|_| "[]".into());
    let review_reasons_json = serde_json::to_string(review_reasons).unwrap_or_else(|_| "[]".into());
    let equipment_json = serde_json::to_string(&recipe.equipment).unwrap_or_else(|_| "[]".into());
    let techniques_json = serde_json::to_string(&recipe.techniques).unwrap_or_else(|_| "[]".into());

    tx.execute(
        "INSERT INTO knowledge_recipes (
            id, job_id, title, description, servings,
            prep_time_minutes, cook_time_minutes, total_time_minutes, difficulty,
            cuisine, confidence, status, review_reasons, conflicts_json, equipment_json, techniques_json,
            schema_version, model_id, model_provider, model_revision, prompt_version, source_hash,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(job_id) DO UPDATE SET
            id = excluded.id,
            title = excluded.title,
            description = excluded.description,
            servings = excluded.servings,
            prep_time_minutes = excluded.prep_time_minutes,
            cook_time_minutes = excluded.cook_time_minutes,
            total_time_minutes = excluded.total_time_minutes,
            difficulty = excluded.difficulty,
            cuisine = excluded.cuisine,
            confidence = excluded.confidence,
            status = excluded.status,
            review_reasons = excluded.review_reasons,
            conflicts_json = excluded.conflicts_json,
            equipment_json = excluded.equipment_json,
            techniques_json = excluded.techniques_json,
            schema_version = excluded.schema_version,
            model_id = excluded.model_id,
            model_provider = excluded.model_provider,
            model_revision = excluded.model_revision,
            prompt_version = excluded.prompt_version,
            source_hash = excluded.source_hash,
            updated_at = CURRENT_TIMESTAMP",
        params![
            recipe_id,
            job_id,
            recipe.title,
            recipe.description,
            recipe.servings,
            recipe.prep_time_minutes,
            recipe.cook_time_minutes,
            recipe.total_time_minutes,
            recipe.difficulty,
            recipe.cuisine,
            recipe.confidence,
            status,
            review_reasons_json,
            conflicts_json,
            equipment_json,
            techniques_json,
            recipe.schema_version,
            model_meta.model_id,
            model_meta.model_provider,
            model_meta.model_revision,
            model_meta.prompt_version,
            source_hash
        ],
    )?;

    // Clear existing child ingredients and steps for this recipe
    tx.execute(
        "DELETE FROM knowledge_recipe_ingredients WHERE recipe_id = ?1",
        params![recipe_id],
    )?;
    tx.execute(
        "DELETE FROM knowledge_recipe_steps WHERE recipe_id = ?1",
        params![recipe_id],
    )?;

    // Insert ingredients
    for (ordinal, ing) in recipe.ingredients.iter().enumerate() {
        let evidence_json =
            serde_json::to_string(&ing.evidence).unwrap_or_else(|_| "[]".to_string());
        tx.execute(
            "INSERT INTO knowledge_recipe_ingredients (
                recipe_id, job_id, name, normalized_name, quantity, unit, notes, optional, evidence_json, ordinal
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                recipe_id,
                job_id,
                ing.name,
                ing.normalized_name,
                ing.quantity,
                ing.unit,
                ing.notes,
                ing.optional,
                evidence_json,
                ordinal as i64
            ],
        )?;
    }

    // Insert steps
    for step in &recipe.steps {
        let evidence_json =
            serde_json::to_string(&step.evidence).unwrap_or_else(|_| "[]".to_string());

        tx.execute(
            "INSERT INTO knowledge_recipe_steps (
                recipe_id, job_id, ordinal, instruction, time_start, time_end,
                technique, temperature, evidence_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                recipe_id,
                job_id,
                step.ordinal,
                step.instruction,
                step.time_start,
                step.time_end,
                step.technique,
                step.temperature,
                evidence_json
            ],
        )?;
    }

    // Dual-save: Canonical generic structured document layer
    let doc_id = format!("doc-recipe-{}", job_id);
    let payload_json = serde_json::to_string(recipe).unwrap_or_else(|_| "{}".to_string());

    let mut provenance_anchors = Vec::new();
    for ing in &recipe.ingredients {
        provenance_anchors.extend(ing.evidence.clone());
    }
    for step in &recipe.steps {
        provenance_anchors.extend(step.evidence.clone());
    }
    let provenance_json =
        serde_json::to_string(&provenance_anchors).unwrap_or_else(|_| "[]".to_string());
    let model_meta_json = serde_json::to_string(model_meta).unwrap_or_else(|_| "{}".to_string());

    tx.execute(
        "INSERT INTO knowledge_structured_documents (
            id, job_id, domain, content_type, schema_version, status,
            confidence, payload_json, provenance_json, review_reasons,
            model_metadata, source_hash, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            job_id = excluded.job_id,
            domain = excluded.domain,
            content_type = excluded.content_type,
            schema_version = excluded.schema_version,
            status = excluded.status,
            confidence = excluded.confidence,
            payload_json = excluded.payload_json,
            provenance_json = excluded.provenance_json,
            review_reasons = excluded.review_reasons,
            model_metadata = excluded.model_metadata,
            source_hash = excluded.source_hash,
            updated_at = CURRENT_TIMESTAMP",
        params![
            doc_id,
            job_id,
            "culinary",
            "recipe_video",
            recipe.schema_version,
            status,
            recipe.confidence,
            payload_json,
            provenance_json,
            review_reasons_json,
            model_meta_json,
            source_hash,
        ],
    )?;

    // Also project ingredients to semantic entities
    tx.execute(
        "DELETE FROM knowledge_semantic_entities WHERE job_id = ?1 AND entity_type = 'ingredient'",
        params![job_id],
    )?;

    for ing in &recipe.ingredients {
        let (t_start, t_end) = if let Some(first_ev) = ing.evidence.first() {
            (first_ev.timestamp_start, first_ev.timestamp_end)
        } else {
            (None, None)
        };
        tx.execute(
            "INSERT INTO knowledge_semantic_entities (
                job_id, entity_type, name, normalized_name, confidence, timestamp_start, timestamp_end, created_at
            ) VALUES (?1, 'ingredient', ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)",
            params![
                job_id,
                ing.name,
                ing.normalized_name,
                recipe.confidence,
                t_start,
                t_end,
            ],
        )?;
    }

    tx.commit()?;
    Ok(recipe_id)
}

/// Retrieves a `StructuredRecipe` by `job_id`, reconstructing ingredients and steps.
pub fn get_structured_recipe(conn: &Connection, job_id: i64) -> Result<Option<StructuredRecipe>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, servings,
                prep_time_minutes, cook_time_minutes, total_time_minutes, difficulty,
                cuisine, confidence, conflicts_json, equipment_json, techniques_json,
                schema_version
         FROM knowledge_recipes
         WHERE job_id = ?1",
    )?;

    let recipe_opt = stmt
        .query_row(params![job_id], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let description: String = row.get(2)?;
            let servings: Option<u32> = row.get(3)?;
            let prep_time_minutes: Option<u32> = row.get(4)?;
            let cook_time_minutes: Option<u32> = row.get(5)?;
            let total_time_minutes: Option<u32> = row.get(6)?;
            let difficulty: Option<String> = row.get(7)?;
            let cuisine: Option<String> = row.get(8)?;
            let confidence: f64 = row.get(9)?;
            let conflicts_json: String = row.get(10)?;
            let equipment_json: String = row.get(11)?;
            let techniques_json: String = row.get(12)?;
            let schema_version: String = row.get(13)?;

            let conflicts: Vec<RecipeConflict> =
                serde_json::from_str(&conflicts_json).unwrap_or_default();
            let equipment: Vec<RecipeEquipment> =
                serde_json::from_str(&equipment_json).unwrap_or_default();
            let techniques: Vec<RecipeTechnique> =
                serde_json::from_str(&techniques_json).unwrap_or_default();

            Ok((
                id,
                title,
                description,
                servings,
                prep_time_minutes,
                cook_time_minutes,
                total_time_minutes,
                difficulty,
                cuisine,
                confidence,
                conflicts,
                equipment,
                techniques,
                schema_version,
            ))
        })
        .optional()?;

    let Some((
        id,
        title,
        description,
        servings,
        prep_time_minutes,
        cook_time_minutes,
        total_time_minutes,
        difficulty,
        cuisine,
        confidence,
        conflicts,
        equipment,
        techniques,
        schema_version,
    )) = recipe_opt
    else {
        return Ok(None);
    };

    // Load ingredients
    let mut ing_stmt = conn.prepare(
        "SELECT name, normalized_name, quantity, unit, notes, optional, evidence_json
         FROM knowledge_recipe_ingredients
         WHERE recipe_id = ?1
         ORDER BY ordinal ASC, id ASC",
    )?;
    let ingredients = ing_stmt
        .query_map(params![id], |row| {
            let name: String = row.get(0)?;
            let normalized_name: String = row.get(1)?;
            let quantity: Option<f64> = row.get(2)?;
            let unit: Option<String> = row.get(3)?;
            let notes: Option<String> = row.get(4)?;
            let optional: bool = row.get(5)?;
            let evidence_json: String = row.get(6)?;
            let evidence: Vec<EvidenceAnchor> =
                serde_json::from_str(&evidence_json).unwrap_or_default();

            Ok(RecipeIngredient {
                name,
                normalized_name,
                quantity,
                unit,
                notes,
                optional,
                evidence,
            })
        })?
        .collect::<Result<Vec<RecipeIngredient>>>()?;

    // Load steps
    let mut step_stmt = conn.prepare(
        "SELECT ordinal, instruction, time_start, time_end, technique, temperature, evidence_json
         FROM knowledge_recipe_steps
         WHERE recipe_id = ?1
         ORDER BY ordinal ASC, id ASC",
    )?;
    let steps = step_stmt
        .query_map(params![id], |row| {
            let ordinal: u32 = row.get(0)?;
            let instruction: String = row.get(1)?;
            let time_start: Option<f64> = row.get(2)?;
            let time_end: Option<f64> = row.get(3)?;
            let technique: Option<String> = row.get(4)?;
            let temperature: Option<String> = row.get(5)?;
            let evidence_json: String = row.get(6)?;
            let evidence: Vec<EvidenceAnchor> =
                serde_json::from_str(&evidence_json).unwrap_or_default();

            Ok(RecipeStep {
                ordinal,
                instruction,
                time_start,
                time_end,
                technique,
                temperature,
                evidence,
            })
        })?
        .collect::<Result<Vec<RecipeStep>>>()?;

    Ok(Some(StructuredRecipe {
        schema_version,
        title,
        description,
        servings,
        prep_time_minutes,
        cook_time_minutes,
        total_time_minutes,
        difficulty,
        cuisine,
        ingredients,
        steps,
        equipment,
        techniques,
        confidence,
        conflicts,
    }))
}

/// Searches recipes by ingredient name substring or match.
/// Returns tuples of (job_id, recipe_title, matched_ingredient).
pub fn search_recipes_by_ingredient(
    conn: &Connection,
    ingredient_query: &str,
    limit: usize,
) -> Result<Vec<(i64, String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT r.job_id, r.title, i.name
         FROM knowledge_recipe_ingredients i
         JOIN knowledge_recipes r ON i.recipe_id = r.id
         WHERE i.normalized_name LIKE ?1 OR i.name LIKE ?1
         LIMIT ?2",
    )?;

    let pattern = format!("%{}%", ingredient_query.trim().to_lowercase());
    let rows = stmt.query_map(params![pattern, limit as i64], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })?;

    rows.collect()
}

/// Persists semantic entities for a job.
pub fn save_semantic_entities(
    conn: &mut Connection,
    job_id: i64,
    entities: &[SemanticEntity],
) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM knowledge_semantic_entities WHERE job_id = ?1",
        params![job_id],
    )?;

    for entity in entities {
        tx.execute(
            "INSERT INTO knowledge_semantic_entities (
                job_id, entity_type, name, normalized_name, confidence, timestamp_start, timestamp_end
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                job_id,
                entity.entity_type.as_str(),
                entity.name,
                entity.normalized_name,
                entity.confidence,
                entity.timestamp_start,
                entity.timestamp_end
            ],
        )?;
    }

    tx.commit()?;
    Ok(())
}

/// Retrieves all semantic entities for a job.
pub fn get_semantic_entities(conn: &Connection, job_id: i64) -> Result<Vec<SemanticEntity>> {
    let mut stmt = conn.prepare(
        "SELECT entity_type, name, normalized_name, confidence, timestamp_start, timestamp_end
         FROM knowledge_semantic_entities
         WHERE job_id = ?1",
    )?;

    let rows = stmt.query_map(params![job_id], |row| {
        let type_str: String = row.get(0)?;
        let name: String = row.get(1)?;
        let normalized_name: String = row.get(2)?;
        let confidence: f64 = row.get(3)?;
        let timestamp_start: Option<f64> = row.get(4)?;
        let timestamp_end: Option<f64> = row.get(5)?;

        let entity_type = EntityType::from_str_canonical(&type_str);

        Ok(SemanticEntity {
            name,
            normalized_name,
            entity_type,
            confidence,
            job_id,
            timestamp_start,
            timestamp_end,
        })
    })?;

    rows.collect()
}

/// Persists a canonical structured knowledge document.
pub fn save_structured_document(conn: &Connection, doc: &StructuredDocumentRecord) -> Result<()> {
    let review_reasons_json =
        serde_json::to_string(&doc.review_reasons).unwrap_or_else(|_| "[]".into());
    let model_meta_json =
        serde_json::to_string(&doc.model_metadata).unwrap_or_else(|_| "{}".into());

    conn.execute(
        "INSERT INTO knowledge_structured_documents (
            id, job_id, domain, content_type, schema_version, status,
            confidence, payload_json, provenance_json, review_reasons,
            model_metadata, source_hash, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            job_id = excluded.job_id,
            domain = excluded.domain,
            content_type = excluded.content_type,
            schema_version = excluded.schema_version,
            status = excluded.status,
            confidence = excluded.confidence,
            payload_json = excluded.payload_json,
            provenance_json = excluded.provenance_json,
            review_reasons = excluded.review_reasons,
            model_metadata = excluded.model_metadata,
            source_hash = excluded.source_hash,
            updated_at = CURRENT_TIMESTAMP",
        params![
            doc.id,
            doc.job_id,
            doc.domain,
            doc.content_type,
            doc.schema_version,
            doc.status,
            doc.confidence,
            doc.payload_json,
            doc.provenance_json,
            review_reasons_json,
            model_meta_json,
            doc.source_hash,
        ],
    )?;
    Ok(())
}

/// Retrieves a canonical structured knowledge document by ID.
pub fn get_structured_document(
    conn: &Connection,
    id: &str,
) -> Result<Option<StructuredDocumentRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, job_id, domain, content_type, schema_version, status,
                confidence, payload_json, provenance_json, review_reasons,
                model_metadata, source_hash, created_at, updated_at
         FROM knowledge_structured_documents
         WHERE id = ?1",
    )?;

    let res = stmt
        .query_row(params![id], |row| {
            let id: String = row.get(0)?;
            let job_id: i64 = row.get(1)?;
            let domain: String = row.get(2)?;
            let content_type: String = row.get(3)?;
            let schema_version: String = row.get(4)?;
            let status: String = row.get(5)?;
            let confidence: f64 = row.get(6)?;
            let payload_json: String = row.get(7)?;
            let provenance_json: String = row.get(8)?;
            let review_reasons_raw: String = row.get(9)?;
            let model_meta_raw: String = row.get(10)?;
            let source_hash: String = row.get(11)?;
            let created_at: String = row.get(12)?;
            let updated_at: String = row.get(13)?;

            let review_reasons: Vec<String> =
                serde_json::from_str(&review_reasons_raw).unwrap_or_default();
            let model_metadata: ModelMetadata =
                serde_json::from_str(&model_meta_raw).unwrap_or_default();

            Ok(StructuredDocumentRecord {
                id,
                job_id,
                domain,
                content_type,
                schema_version,
                status,
                confidence,
                payload_json,
                provenance_json,
                review_reasons,
                model_metadata,
                source_hash,
                created_at,
                updated_at,
            })
        })
        .optional()?;

    Ok(res)
}

/// Retrieves all canonical structured documents associated with a job.
pub fn get_structured_documents_for_job(
    conn: &Connection,
    job_id: i64,
) -> Result<Vec<StructuredDocumentRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, job_id, domain, content_type, schema_version, status,
                confidence, payload_json, provenance_json, review_reasons,
                model_metadata, source_hash, created_at, updated_at
         FROM knowledge_structured_documents
         WHERE job_id = ?1
         ORDER BY updated_at DESC",
    )?;

    let rows = stmt.query_map(params![job_id], |row| {
        let id: String = row.get(0)?;
        let job_id: i64 = row.get(1)?;
        let domain: String = row.get(2)?;
        let content_type: String = row.get(3)?;
        let schema_version: String = row.get(4)?;
        let status: String = row.get(5)?;
        let confidence: f64 = row.get(6)?;
        let payload_json: String = row.get(7)?;
        let provenance_json: String = row.get(8)?;
        let review_reasons_raw: String = row.get(9)?;
        let model_meta_raw: String = row.get(10)?;
        let source_hash: String = row.get(11)?;
        let created_at: String = row.get(12)?;
        let updated_at: String = row.get(13)?;

        let review_reasons: Vec<String> =
            serde_json::from_str(&review_reasons_raw).unwrap_or_default();
        let model_metadata: ModelMetadata =
            serde_json::from_str(&model_meta_raw).unwrap_or_default();

        Ok(StructuredDocumentRecord {
            id,
            job_id,
            domain,
            content_type,
            schema_version,
            status,
            confidence,
            payload_json,
            provenance_json,
            review_reasons,
            model_metadata,
            source_hash,
            created_at,
            updated_at,
        })
    })?;

    rows.collect()
}

/// Persists an AI task execution record for lifecycle tracking and observability.
pub fn save_ai_task_execution(conn: &Connection, task: &AiTaskExecution) -> Result<()> {
    conn.execute(
        "INSERT INTO ai_task_executions (
            id, task_type, job_id, status, model, model_version, prompt_version,
            schema_version, input_hash, output_hash, started_at, completed_at,
            duration_ms, tokens_input, tokens_output, error_code, error_message,
            retry_count, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            output_hash = excluded.output_hash,
            started_at = excluded.started_at,
            completed_at = excluded.completed_at,
            duration_ms = excluded.duration_ms,
            tokens_input = excluded.tokens_input,
            tokens_output = excluded.tokens_output,
            error_code = excluded.error_code,
            error_message = excluded.error_message,
            retry_count = excluded.retry_count,
            updated_at = CURRENT_TIMESTAMP",
        params![
            task.task_id,
            task.task_type.as_str(),
            task.job_id,
            task.status.as_str(),
            task.model_metadata.model_id,
            task.model_metadata.model_revision,
            task.model_metadata.prompt_version,
            task.schema_version,
            task.input_hash,
            task.output_hash,
            task.started_at,
            task.finished_at,
            task.duration_ms as i64,
            task.tokens_input,
            task.tokens_output.or(task.token_usage),
            task.error_code,
            task.error_message,
            task.retry_count as i64,
            task.created_at,
        ],
    )?;
    Ok(())
}

/// Retrieves an AI task execution by task_id.
pub fn get_ai_task_execution(conn: &Connection, task_id: &str) -> Result<Option<AiTaskExecution>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_type, job_id, status, model, model_version, prompt_version,
                schema_version, input_hash, output_hash, started_at, completed_at,
                duration_ms, tokens_input, tokens_output, error_code, error_message,
                retry_count, created_at
         FROM ai_task_executions
         WHERE id = ?1",
    )?;

    let res = stmt
        .query_row(params![task_id], |row| {
            let task_id: String = row.get(0)?;
            let task_type_str: String = row.get(1)?;
            let job_id: i64 = row.get(2)?;
            let status_str: String = row.get(3)?;
            let model_id: String = row.get(4)?;
            let model_revision: String = row.get(5)?;
            let prompt_version: String = row.get(6)?;
            let schema_version: String = row.get(7)?;
            let input_hash: String = row.get(8)?;
            let output_hash: Option<String> = row.get(9)?;
            let started_at: Option<String> = row.get(10)?;
            let completed_at: Option<String> = row.get(11)?;
            let duration_ms: i64 = row.get(12)?;
            let tokens_input: Option<u32> = row.get(13)?;
            let tokens_output: Option<u32> = row.get(14)?;
            let error_code: Option<String> = row.get(15)?;
            let error_message: Option<String> = row.get(16)?;
            let retry_count: i64 = row.get(17)?;
            let created_at: String = row.get(18)?;

            let task_type = AiTaskType::from_str_canonical(&task_type_str);
            let status = AiTaskStatus::from_str_canonical(&status_str);

            let model_metadata = ModelMetadata {
                model_id,
                model_provider: "local_llm".to_string(),
                model_revision,
                prompt_version,
            };

            Ok(AiTaskExecution {
                task_id,
                task_type,
                job_id,
                status,
                model_metadata,
                schema_version,
                input_hash,
                output_hash,
                duration_ms: duration_ms.max(0) as u64,
                token_usage: tokens_output,
                tokens_input,
                tokens_output,
                error_message,
                error_code,
                retry_count: retry_count.max(0) as u32,
                started_at,
                created_at,
                finished_at: completed_at,
            })
        })
        .optional()?;

    Ok(res)
}

/// Retrieves all AI task executions for a specific job, ordered newest to oldest.
pub fn get_ai_task_executions_for_job(
    conn: &Connection,
    job_id: i64,
) -> Result<Vec<AiTaskExecution>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_type, job_id, status, model, model_version, prompt_version,
                schema_version, input_hash, output_hash, started_at, completed_at,
                duration_ms, tokens_input, tokens_output, error_code, error_message,
                retry_count, created_at
         FROM ai_task_executions
         WHERE job_id = ?1
         ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map(params![job_id], |row| {
        let task_id: String = row.get(0)?;
        let task_type_str: String = row.get(1)?;
        let job_id: i64 = row.get(2)?;
        let status_str: String = row.get(3)?;
        let model_id: String = row.get(4)?;
        let model_revision: String = row.get(5)?;
        let prompt_version: String = row.get(6)?;
        let schema_version: String = row.get(7)?;
        let input_hash: String = row.get(8)?;
        let output_hash: Option<String> = row.get(9)?;
        let started_at: Option<String> = row.get(10)?;
        let completed_at: Option<String> = row.get(11)?;
        let duration_ms: i64 = row.get(12)?;
        let tokens_input: Option<u32> = row.get(13)?;
        let tokens_output: Option<u32> = row.get(14)?;
        let error_code: Option<String> = row.get(15)?;
        let error_message: Option<String> = row.get(16)?;
        let retry_count: i64 = row.get(17)?;
        let created_at: String = row.get(18)?;

        let task_type = AiTaskType::from_str_canonical(&task_type_str);
        let status = AiTaskStatus::from_str_canonical(&status_str);

        let model_metadata = ModelMetadata {
            model_id,
            model_provider: "local_llm".to_string(),
            model_revision,
            prompt_version,
        };

        Ok(AiTaskExecution {
            task_id,
            task_type,
            job_id,
            status,
            model_metadata,
            schema_version,
            input_hash,
            output_hash,
            duration_ms: duration_ms.max(0) as u64,
            token_usage: tokens_output,
            tokens_input,
            tokens_output,
            error_message,
            error_code,
            retry_count: retry_count.max(0) as u32,
            started_at,
            created_at,
            finished_at: completed_at,
        })
    })?;

    rows.collect()
}

/// Idempotency query: checks if a completed task execution exists with identical
/// job_id, task_type, model, prompt_version, schema_version, and input_hash.
pub fn find_completed_ai_task_execution(
    conn: &Connection,
    job_id: i64,
    task_type: &str,
    model: &str,
    prompt_version: &str,
    schema_version: &str,
    input_hash: &str,
) -> Result<Option<AiTaskExecution>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_type, job_id, status, model, model_version, prompt_version,
                schema_version, input_hash, output_hash, started_at, completed_at,
                duration_ms, tokens_input, tokens_output, error_code, error_message,
                retry_count, created_at
         FROM ai_task_executions
         WHERE job_id = ?1
           AND task_type = ?2
           AND model = ?3
           AND prompt_version = ?4
           AND schema_version = ?5
           AND input_hash = ?6
           AND status = 'completed'
         ORDER BY completed_at DESC
         LIMIT 1",
    )?;

    let res = stmt
        .query_row(
            params![
                job_id,
                task_type,
                model,
                prompt_version,
                schema_version,
                input_hash
            ],
            |row| {
                let task_id: String = row.get(0)?;
                let task_type_str: String = row.get(1)?;
                let job_id: i64 = row.get(2)?;
                let status_str: String = row.get(3)?;
                let model_id: String = row.get(4)?;
                let model_revision: String = row.get(5)?;
                let prompt_version: String = row.get(6)?;
                let schema_version: String = row.get(7)?;
                let input_hash: String = row.get(8)?;
                let output_hash: Option<String> = row.get(9)?;
                let started_at: Option<String> = row.get(10)?;
                let completed_at: Option<String> = row.get(11)?;
                let duration_ms: i64 = row.get(12)?;
                let tokens_input: Option<u32> = row.get(13)?;
                let tokens_output: Option<u32> = row.get(14)?;
                let error_code: Option<String> = row.get(15)?;
                let error_message: Option<String> = row.get(16)?;
                let retry_count: i64 = row.get(17)?;
                let created_at: String = row.get(18)?;

                let task_type = AiTaskType::from_str_canonical(&task_type_str);
                let status = AiTaskStatus::from_str_canonical(&status_str);

                let model_metadata = ModelMetadata {
                    model_id,
                    model_provider: "local_llm".to_string(),
                    model_revision,
                    prompt_version,
                };

                Ok(AiTaskExecution {
                    task_id,
                    task_type,
                    job_id,
                    status,
                    model_metadata,
                    schema_version,
                    input_hash,
                    output_hash,
                    duration_ms: duration_ms.max(0) as u64,
                    token_usage: tokens_output,
                    tokens_input,
                    tokens_output,
                    error_message,
                    error_code,
                    retry_count: retry_count.max(0) as u32,
                    started_at,
                    created_at,
                    finished_at: completed_at,
                })
            },
        )
        .optional()?;

    Ok(res)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::recipe::RECIPE_SCHEMA_VERSION;

    fn create_test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        // Create mock jobs table for foreign keys
        conn.execute(
            "CREATE TABLE jobs (id INTEGER PRIMARY KEY, url TEXT NOT NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO jobs (id, url) VALUES (1, 'https://youtube.com/v1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO jobs (id, url) VALUES (2, 'https://youtube.com/v2')",
            [],
        )
        .unwrap();

        let tx = conn.unchecked_transaction().unwrap();
        init_knowledge_schema(&tx).unwrap();
        tx.commit().unwrap();
        conn
    }

    #[test]
    fn test_domain_classification_roundtrip() {
        let conn = create_test_conn();
        let classification = DomainClassification {
            domain: ContentDomain::Culinary,
            content_type: ContentType::Recipe,
            confidence: 0.98,
            rationale: "Cooking demonstration with ingredient list".into(),
            suggested_tags: vec!["pasta".into(), "italian".into()],
        };
        let model_meta = ModelMetadata {
            model_id: "Qwen2.5-1.5B-Instruct-Q4_K_M".into(),
            model_provider: "llama.cpp".into(),
            model_revision: "1.0".into(),
            prompt_version: "v1".into(),
        };

        save_domain_classification(&conn, 1, &classification, &model_meta, "sha256_mock_hash")
            .unwrap();

        let loaded = get_domain_classification(&conn, 1).unwrap().unwrap();
        assert_eq!(loaded.domain, ContentDomain::Culinary);
        assert_eq!(loaded.content_type, ContentType::Recipe);
        assert!((loaded.confidence - 0.98).abs() < 1e-4);
        assert_eq!(loaded.suggested_tags, vec!["pasta", "italian"]);
    }

    #[test]
    fn test_recipe_persistence_roundtrip() {
        let mut conn = create_test_conn();
        let recipe = StructuredRecipe {
            schema_version: RECIPE_SCHEMA_VERSION.into(),
            title: "Pasta al Limone".into(),
            description: "Fresh lemon pasta".into(),
            servings: Some(4),
            prep_time_minutes: Some(10),
            cook_time_minutes: Some(15),
            total_time_minutes: Some(25),
            difficulty: Some("Easy".into()),
            cuisine: Some("Italian".into()),
            ingredients: vec![
                RecipeIngredient {
                    name: "spaghetti".into(),
                    normalized_name: "spaghetti".into(),
                    quantity: Some(400.0),
                    unit: Some("g".into()),
                    notes: None,
                    optional: false,
                    evidence: vec![EvidenceAnchor {
                        job_id: 1,
                        timestamp_start: Some(15.0),
                        timestamp_end: Some(20.0),
                        quote: Some("400 gramos de espaguetis".into()),
                        keyframe_path: None,
                        confidence: 0.99,
                    }],
                },
                RecipeIngredient {
                    name: "lemon".into(),
                    normalized_name: "lemon".into(),
                    quantity: Some(2.0),
                    unit: Some("units".into()),
                    notes: Some("Zest and juice".into()),
                    optional: false,
                    evidence: vec![EvidenceAnchor {
                        job_id: 1,
                        timestamp_start: Some(22.0),
                        timestamp_end: Some(25.0),
                        quote: Some("Dos limones".into()),
                        keyframe_path: None,
                        confidence: 0.95,
                    }],
                },
            ],
            steps: vec![RecipeStep {
                ordinal: 1,
                instruction: "Boil salted water and add pasta.".into(),
                time_start: Some(30.0),
                time_end: Some(45.0),
                temperature: None,
                technique: Some("boil".into()),
                evidence: vec![EvidenceAnchor {
                    job_id: 1,
                    timestamp_start: Some(30.0),
                    timestamp_end: Some(45.0),
                    quote: Some("Hervir agua".into()),
                    keyframe_path: None,
                    confidence: 0.98,
                }],
            }],
            equipment: vec![RecipeEquipment {
                name: "pot".into(),
                required: true,
                evidence: vec![],
            }],
            techniques: vec![RecipeTechnique {
                name: "boil".into(),
                description: Some("Boiling in salted water".into()),
                evidence: vec![],
            }],
            confidence: 0.95,
            conflicts: vec![],
        };

        let model_meta = ModelMetadata {
            model_id: "Qwen2.5-1.5B".into(),
            model_provider: "llama.cpp".into(),
            model_revision: "1.0".into(),
            prompt_version: "v1".into(),
        };

        save_structured_recipe(
            &mut conn,
            1,
            &recipe,
            "completed",
            &[],
            &model_meta,
            "hash_test_123",
        )
        .unwrap();

        let loaded = get_structured_recipe(&conn, 1).unwrap().unwrap();
        assert_eq!(loaded.title, "Pasta al Limone");
        assert_eq!(loaded.ingredients.len(), 2);
        assert_eq!(loaded.ingredients[0].name, "spaghetti");
        assert_eq!(loaded.ingredients[0].quantity, Some(400.0));
        assert_eq!(loaded.steps.len(), 1);
        assert_eq!(
            loaded.steps[0].instruction,
            "Boil salted water and add pasta."
        );
        assert_eq!(loaded.steps[0].time_start, Some(30.0));

        // Search by ingredient
        let results = search_recipes_by_ingredient(&conn, "spaghetti", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, 1);
        assert_eq!(results[0].1, "Pasta al Limone");
        assert_eq!(results[0].2, "spaghetti");

        // Verify dual persistence: Canonical generic structured document layer
        let doc = get_structured_document(&conn, "doc-recipe-1")
            .unwrap()
            .unwrap();
        assert_eq!(doc.domain, "culinary");
        assert_eq!(doc.content_type, "recipe_video");
        assert_eq!(doc.status, "completed");
        assert!(doc.payload_json.contains("Pasta al Limone"));

        // Verify entity projection: Ingredients projected to knowledge_semantic_entities
        let entities = get_semantic_entities(&conn, 1).unwrap();
        assert_eq!(entities.len(), 2);
        assert!(entities
            .iter()
            .any(|e| e.name == "spaghetti" && e.entity_type == EntityType::Ingredient));
        assert!(entities
            .iter()
            .any(|e| e.name == "lemon" && e.entity_type == EntityType::Ingredient));
    }

    #[test]
    fn test_structured_document_roundtrip() {
        let conn = create_test_conn();
        let doc = StructuredDocumentRecord {
            id: "doc-custom-1".into(),
            job_id: 1,
            domain: "culinary".into(),
            content_type: "technique_guide".into(),
            schema_version: "1.0.0".into(),
            status: "completed".into(),
            confidence: 0.96,
            payload_json: r#"{"technique": "sous-vide", "temp_c": 54.0}"#.into(),
            provenance_json: r#"[{"timestamp_start": 10.0, "timestamp_end": 15.0}]"#.into(),
            review_reasons: vec![],
            model_metadata: ModelMetadata {
                model_id: "Qwen2.5-1.5B".into(),
                model_provider: "local_llm".into(),
                model_revision: "1.0".into(),
                prompt_version: "v1".into(),
            },
            source_hash: "hash_canonical_abc".into(),
            created_at: "2026-10-04T12:00:00Z".into(),
            updated_at: "2026-10-04T12:00:00Z".into(),
        };

        save_structured_document(&conn, &doc).unwrap();

        let loaded = get_structured_document(&conn, "doc-custom-1")
            .unwrap()
            .unwrap();
        assert_eq!(loaded.id, "doc-custom-1");
        assert_eq!(loaded.job_id, 1);
        assert_eq!(loaded.domain, "culinary");
        assert_eq!(loaded.content_type, "technique_guide");
        assert_eq!(loaded.source_hash, "hash_canonical_abc");
        assert!(loaded.payload_json.contains("sous-vide"));

        let job_docs = get_structured_documents_for_job(&conn, 1).unwrap();
        assert_eq!(job_docs.len(), 1);
        assert_eq!(job_docs[0].id, "doc-custom-1");
    }

    #[test]
    fn test_ai_task_execution_roundtrip_and_idempotency() {
        let conn = create_test_conn();
        let model_meta = ModelMetadata {
            model_id: "Qwen2.5-1.5B-Instruct-Q4_K_M".into(),
            model_provider: "local_llm".into(),
            model_revision: "1.0".into(),
            prompt_version: "v1".into(),
        };

        let mut task = AiTaskExecution::new(
            "task-exec-101",
            AiTaskType::RecipeTransformation,
            1,
            model_meta.clone(),
            "2026-10-04T12:00:00Z",
        )
        .with_hashes("evidence_hash_123", "1.0.0");

        task.mark_running("2026-10-04T12:00:01Z");
        save_ai_task_execution(&conn, &task).unwrap();

        let running = get_ai_task_execution(&conn, "task-exec-101")
            .unwrap()
            .unwrap();
        assert_eq!(running.status, AiTaskStatus::Running);
        assert_eq!(running.input_hash, "evidence_hash_123");

        // Complete the task
        task.mark_completed(
            Some("output_hash_789".into()),
            420,
            Some(380),
            "2026-10-04T12:00:02Z",
        );
        save_ai_task_execution(&conn, &task).unwrap();

        let completed = get_ai_task_execution(&conn, "task-exec-101")
            .unwrap()
            .unwrap();
        assert_eq!(completed.status, AiTaskStatus::Completed);
        assert_eq!(completed.duration_ms, 420);
        assert_eq!(completed.token_usage, Some(380));

        // Test idempotency check
        let cached = find_completed_ai_task_execution(
            &conn,
            1,
            "recipe_transformation",
            &model_meta.model_id,
            &model_meta.prompt_version,
            "1.0.0",
            "evidence_hash_123",
        )
        .unwrap();

        assert!(cached.is_some());
        assert_eq!(cached.unwrap().task_id, "task-exec-101");

        // Hash mismatch yields None
        let mismatch = find_completed_ai_task_execution(
            &conn,
            1,
            "recipe_transformation",
            &model_meta.model_id,
            &model_meta.prompt_version,
            "1.0.0",
            "different_evidence_hash",
        )
        .unwrap();
        assert!(mismatch.is_none());
    }
}
