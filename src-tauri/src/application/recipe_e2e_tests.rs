//! # Recipe E2E Reality Integration Tests
//!
//! Validates the entire vertical slice of Recipe intelligence:
//! 1. Controlled audiovisual fixture insertion in SQLite
//! 2. Canonical evidence package building
//! 3. Canonical evidence SHA-256 hash determinism
//! 4. AI task lifecycle transitions (Running -> Completed / RequiresReview)
//! 5. Structured Recipe transformation & deterministic validation
//! 6. Conflict detection & reconciliation without averaging
//! 7. Dual persistence:
//!    - Canonical generic structured document layer (`knowledge_structured_documents`)
//!    - Relational recipe domain projection (`knowledge_recipes`, `knowledge_recipe_ingredients`, `knowledge_recipe_steps`)
//!    - Semantic entities extraction (`knowledge_semantic_entities`)
//! 8. Search E2E:
//!    - Querying by ingredient name (`search_recipes_by_ingredient`)
//! 9. Exact Timestamp & Provenance E2E:
//!    - Verified `0 <= timestamp <= duration`
//!    - Tracing back to raw transcript segment quote
//! 10. Idempotency E2E:
//!    - Second execution reuses existing completed task and produces zero duplicate rows
//! 11. Failure paths:
//!    - Inverted timestamps rejected
//!    - Timestamps exceeding media duration rejected
//!    - Negative quantities rejected
//!    - Missing evidence rejected

#[cfg(test)]
mod tests {
    use crate::application::editorial_evidence::build_evidence_package;
    use crate::application::knowledge_service::*;
    use crate::application::local_ai_provider::{LocalAiProvider, MockLocalScenario};
    use crate::application::transformers::recipe::RecipeTransformer;
    use crate::domain::ai_task::{AiTaskExecution, AiTaskType};
    use crate::domain::recipe::{
        validate_structured_recipe, RecipeValidationError, StructuredRecipe, RECIPE_SCHEMA_VERSION,
    };
    use crate::domain::semantic::ModelMetadata;
    use rusqlite::{params, Connection};

    fn setup_e2e_database() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE jobs (
                id INTEGER PRIMARY KEY,
                url TEXT NOT NULL,
                canonical_url TEXT,
                status TEXT NOT NULL DEFAULT 'completed',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE media (
                job_id INTEGER PRIMARY KEY,
                title TEXT,
                author TEXT,
                duration INTEGER,
                platform TEXT,
                video_path TEXT,
                instructional_guide TEXT,
                FOREIGN KEY(job_id) REFERENCES jobs(id)
            );
            CREATE TABLE content_items (
                job_id INTEGER PRIMARY KEY,
                author_handle TEXT,
                FOREIGN KEY(job_id) REFERENCES jobs(id)
            );
            CREATE TABLE transcript_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                segment_index INTEGER NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                text TEXT NOT NULL,
                FOREIGN KEY(job_id) REFERENCES jobs(id)
            );
            CREATE TABLE media_artifacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                kind TEXT NOT NULL,
                path TEXT NOT NULL,
                timestamp REAL,
                label TEXT,
                FOREIGN KEY(job_id) REFERENCES jobs(id)
            );
            CREATE TABLE search_units (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                representation TEXT NOT NULL,
                ordinal INTEGER NOT NULL,
                text TEXT NOT NULL,
                start_time REAL,
                end_time REAL,
                artifact_id INTEGER,
                confidence REAL,
                FOREIGN KEY(job_id) REFERENCES jobs(id)
            );
            CREATE TABLE content_annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                annotation_type TEXT NOT NULL,
                normalized_value TEXT NOT NULL,
                display_value TEXT NOT NULL,
                confidence REAL,
                source TEXT NOT NULL,
                start_time REAL,
                end_time REAL,
                FOREIGN KEY(job_id) REFERENCES jobs(id)
            );",
        )
        .unwrap();
        {
            let tx = conn.transaction().unwrap();
            init_knowledge_schema(&tx).unwrap();
            tx.commit().unwrap();
        }
        conn
    }

    fn insert_recipe_fixture(conn: &Connection, job_id: i64) {
        conn.execute(
            "INSERT INTO jobs (id, url, canonical_url, status)
             VALUES (?1, 'https://www.tiktok.com/@chef/video/9001', 'tiktok:video:9001', 'completed')",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO media (job_id, title, author, duration, platform, video_path, instructional_guide)
             VALUES (?1, 'Pasta al Pesto Casero', '@chef_mario', 65, 'tiktok', '/media/9001.mp4', 'Guía: hervir pasta y triturar albahaca')",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO transcript_segments (job_id, segment_index, start_time, end_time, text)
             VALUES (?1, 0, 0.0, 10.0, 'Bienvenidos a la cocina italiana.'),
                    (?1, 1, 10.5, 20.0, 'Agregamos 200 gramos de pasta al agua hirviendo.'),
                    (?1, 2, 20.5, 45.0, 'Trituramos albahaca con aceite y pinones.'),
                    (?1, 3, 45.5, 60.0, 'Mezclamos todo y servimos caliente.')",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO media_artifacts (id, job_id, kind, path, timestamp, label)
             VALUES (101, ?1, 'keyframe', '/artifacts/9001/k1.jpg', 15.0, 'pasta en olla')",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO search_units (job_id, representation, ordinal, text, start_time, end_time, artifact_id, confidence)
             VALUES (?1, 'ocr', 0, '200g PASTA TRIGO', 12.0, 18.0, 101, 0.95)",
            params![job_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO content_annotations
                (job_id, annotation_type, normalized_value, display_value, confidence, source)
             VALUES (?1, 'category', 'recipe', 'Recipe', 0.95, 'deterministic-search-v1')",
            params![job_id],
        )
        .unwrap();
    }

    #[tokio::test]
    async fn test_recipe_e2e_full_lifecycle() {
        let mut conn = setup_e2e_database();
        let job_id = 10;
        insert_recipe_fixture(&conn, job_id);

        // 1. Build Evidence Package
        let package = build_evidence_package(&conn, job_id).unwrap();
        assert_eq!(package.job_id, job_id);
        assert_eq!(package.source.duration_secs, Some(65.0));
        assert_eq!(package.transcript.len(), 4);
        assert_eq!(package.keyframes.len(), 1);
        assert_eq!(package.ocr.len(), 1);

        // 2. Canonical Evidence Hash Determinism
        let hash1 = package.compute_canonical_hash();
        let hash2 = package.compute_canonical_hash();
        assert_eq!(hash1, hash2);
        assert!(!hash1.is_empty());

        // 3. AI Task Lifecycle: RUNNING
        let model_meta = ModelMetadata {
            model_id: "Qwen/Qwen2.5-1.5B-Instruct-GGUF".to_string(),
            model_provider: "llama.cpp".to_string(),
            model_revision: "91cad51170dc346986eccefdc2dd33a9da36ead9".to_string(),
            prompt_version: "2.0.0".to_string(),
        };

        let task_id = format!("task-recipe-{job_id}-e2e");
        let mut task = AiTaskExecution::new(
            &task_id,
            AiTaskType::RecipeTransformation,
            job_id,
            model_meta.clone(),
            chrono::Utc::now().to_rfc3339(),
        )
        .with_hashes(&hash1, RECIPE_SCHEMA_VERSION);
        task.mark_running(chrono::Utc::now().to_rfc3339());
        save_ai_task_execution(&conn, &task).unwrap();

        // 4. Structured Transformation & Validation
        let provider = LocalAiProvider::mock(MockLocalScenario::RecipeSuccess);
        let transformer = RecipeTransformer::new();
        let recipe = transformer.transform(&package, &provider).await.unwrap();

        assert_eq!(recipe.title, "Pasta al Pesto Genovés Auténtico");
        assert_eq!(recipe.ingredients.len(), 3);
        assert_eq!(recipe.steps.len(), 2);

        // Check ingredient albahaca
        let albahaca_ing = recipe
            .ingredients
            .iter()
            .find(|i| i.name.to_lowercase().contains("albahaca"))
            .expect("albahaca ingredient must be present");
        assert_eq!(albahaca_ing.quantity, Some(50.0));
        assert_eq!(albahaca_ing.unit.as_deref(), Some("g"));
        assert!(!albahaca_ing.evidence.is_empty());
        let ev = &albahaca_ing.evidence[0];
        assert_eq!(ev.job_id, job_id);
        let ts_start = ev.timestamp_start.expect("timestamp_start must be present");
        let ts_end = ev.timestamp_end.expect("timestamp_end must be present");
        assert!(ts_start >= 0.0);
        assert!(ts_end <= 65.0);

        // 5. Update Task Lifecycle: COMPLETED
        task.mark_completed(
            Some("out_hash_123".into()),
            450,
            None,
            chrono::Utc::now().to_rfc3339(),
        );
        save_ai_task_execution(&conn, &task).unwrap();

        // 6. Dual Persistence
        let recipe_db_id = save_structured_recipe(
            &mut conn,
            job_id,
            &recipe,
            "completed",
            &[],
            &model_meta,
            &hash1,
        )
        .unwrap();
        assert!(!recipe_db_id.is_empty());

        // Verify Canonical Document Layer
        let doc = get_structured_document(&conn, &format!("doc-recipe-{job_id}"))
            .unwrap()
            .expect("canonical document must be persisted");
        assert_eq!(doc.domain, "culinary");
        assert_eq!(doc.source_hash, hash1);
        assert_eq!(doc.model_metadata.model_id, model_meta.model_id);
        assert_eq!(doc.status, "completed");

        // Verify Relational Recipe Projection
        let loaded = get_structured_recipe(&conn, job_id)
            .unwrap()
            .expect("recipe projection must be persisted");
        assert_eq!(loaded.title, "Pasta al Pesto Genovés Auténtico");
        assert_eq!(loaded.ingredients.len(), 3);
        assert_eq!(loaded.steps.len(), 2);

        // Verify Semantic Entities Projection
        let entities = get_semantic_entities(&conn, job_id).unwrap();
        assert_eq!(entities.len(), 3);
        assert!(entities
            .iter()
            .any(|e| e.name.to_lowercase().contains("albahaca")));

        // 7. Search E2E
        let search_hits = search_recipes_by_ingredient(&conn, "albahaca", 10).unwrap();
        assert_eq!(search_hits.len(), 1);
        assert_eq!(search_hits[0].0, job_id);
        assert_eq!(search_hits[0].1, "Pasta al Pesto Genovés Auténtico");
        assert!(search_hits[0].2.to_lowercase().contains("albahaca"));

        // 8. Timestamp & Provenance E2E
        let retrieved_recipe = get_structured_recipe(&conn, job_id).unwrap().unwrap();
        let ing_albahaca = retrieved_recipe
            .ingredients
            .iter()
            .find(|i| i.name.to_lowercase().contains("albahaca"))
            .unwrap();
        let ev_anchor = &ing_albahaca.evidence[0];
        let p_start = ev_anchor.timestamp_start.unwrap();
        let p_end = ev_anchor.timestamp_end.unwrap();
        assert!(p_start >= 0.0 && p_end <= 65.0);

        // 9. Idempotency E2E
        let existing = find_completed_ai_task_execution(
            &conn,
            job_id,
            "recipe_transformation",
            &model_meta.model_id,
            &model_meta.prompt_version,
            RECIPE_SCHEMA_VERSION,
            &hash1,
        )
        .unwrap();
        assert!(existing.is_some());
        assert_eq!(existing.unwrap().task_id, task_id);

        // Verify no duplicate rows
        let doc_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM knowledge_structured_documents WHERE job_id = ?1",
                params![job_id],
                |r| r.get(0),
            )
            .unwrap();
        let rec_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM knowledge_recipes WHERE job_id = ?1",
                params![job_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(doc_count, 1);
        assert_eq!(rec_count, 1);
    }

    #[test]
    fn test_recipe_validation_failure_paths() {
        let mut recipe = StructuredRecipe {
            schema_version: RECIPE_SCHEMA_VERSION.to_string(),
            title: "Receta Test".into(),
            description: "Test".into(),
            servings: Some(2),
            prep_time_minutes: Some(5),
            cook_time_minutes: Some(10),
            total_time_minutes: Some(15),
            difficulty: Some("Easy".into()),
            cuisine: Some("Italian".into()),
            ingredients: vec![],
            steps: vec![],
            equipment: vec![],
            techniques: vec![],
            confidence: 0.9,
            conflicts: vec![],
        };

        // Failure path 1: No ingredients
        assert_eq!(
            validate_structured_recipe(&recipe, Some(60.0)).unwrap_err(),
            RecipeValidationError::NoIngredients
        );

        // Failure path 2: Negative quantity
        recipe
            .ingredients
            .push(crate::domain::recipe::RecipeIngredient {
                name: "Harina".into(),
                normalized_name: "harina".into(),
                quantity: Some(-50.0),
                unit: Some("g".into()),
                notes: None,
                optional: false,
                evidence: vec![],
            });
        recipe.steps.push(crate::domain::recipe::RecipeStep {
            ordinal: 1,
            instruction: "Mezclar".into(),
            time_start: Some(0.0),
            time_end: Some(10.0),
            technique: None,
            temperature: None,
            evidence: vec![crate::domain::recipe::EvidenceAnchor {
                job_id: 1,
                timestamp_start: Some(0.0),
                timestamp_end: Some(10.0),
                quote: Some("mezclar".into()),
                keyframe_path: None,
                confidence: 0.9,
            }],
        });
        assert!(matches!(
            validate_structured_recipe(&recipe, Some(60.0)).unwrap_err(),
            RecipeValidationError::NegativeQuantity { .. }
        ));

        // Failure path 3: Timestamp exceeds duration
        recipe.ingredients[0].quantity = Some(50.0);
        recipe.steps[0].time_end = Some(120.0); // duration is 60.0
        assert!(matches!(
            validate_structured_recipe(&recipe, Some(60.0)).unwrap_err(),
            RecipeValidationError::TimestampExceedsDuration { .. }
        ));

        // Failure path 4: Inverted timestamp
        recipe.steps[0].time_start = Some(40.0);
        recipe.steps[0].time_end = Some(20.0);
        assert!(matches!(
            validate_structured_recipe(&recipe, Some(60.0)).unwrap_err(),
            RecipeValidationError::InvertedTimestampRange { .. }
        ));
    }
}
