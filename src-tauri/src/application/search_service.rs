use crate::application::query_understanding::understand;
use crate::application::unified_search::{
    chunk_transcript_segments, fuse_ranked_hits, groups_from_hits, metadata_to_hit, unit_to_hit,
    UnifiedHit,
};
use crate::domain::models::{
    SearchCapabilities, SearchConfig, SearchMode, SearchRepresentation, SearchResult,
    UnifiedSearchRequest, UnifiedSearchResponse,
};
use crate::domain::ports::EmbeddingEngine;
use metrics::histogram;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tracing::{error, info, instrument, warn};

// ========================================================================
// APPLICATION: Search Service (Orquestador Semántico)
// Implementa SRP dictando CÓMO interactúan los componentes sin saber CÓMO
// están implementados a bajo nivel. Funciona con inyección de dependencias.
// ========================================================================

pub struct SearchService {
    config: Arc<RwLock<SearchConfig>>,
    embedding_engine: Arc<dyn EmbeddingEngine>,
    query_coordinator: Arc<crate::distributed::query_coordinator::QueryCoordinator>,
    reranker: Arc<dyn crate::application::reranker::Reranker>,
    semantic_cache: Arc<crate::infrastructure::semantic_cache::SemanticCache>,
    metadata_db: Arc<Mutex<rusqlite::Connection>>,
    config_version: AtomicU64,
    index_operation_lock: Arc<Mutex<()>>,
}

impl SearchService {
    // Inyección de dependencias a través de los Traits del Domain Port
    pub fn new(
        config: SearchConfig,
        embedding_engine: Arc<dyn EmbeddingEngine>,
        query_coordinator: Arc<crate::distributed::query_coordinator::QueryCoordinator>,
        reranker: Arc<dyn crate::application::reranker::Reranker>,
        semantic_cache: Arc<crate::infrastructure::semantic_cache::SemanticCache>,
        metadata_db: Arc<Mutex<rusqlite::Connection>>,
    ) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            embedding_engine,
            query_coordinator,
            reranker,
            semantic_cache,
            metadata_db,
            config_version: AtomicU64::new(0),
            index_operation_lock: Arc::new(Mutex::new(())),
        }
    }

    /// Backwards-compatible indexing entrypoint for callers that only have a
    /// flat transcript. New ingestion code should pass timestamped segments.
    #[instrument(skip(self, full_text))]
    pub fn index_document(&self, job_id: i64, full_text: &str) -> Result<(), String> {
        let segments = vec![(0_i64, full_text.to_string(), 0.0_f64, 0.0_f64)];
        self.index_document_with_segments(job_id, &segments)
    }

    /// Index transcript windows with their source time range. The legacy
    /// transcript_embeddings/HNSW rows are retained for compatibility while
    /// the unified search units become the source for FTS and provenance.
    #[instrument(skip(self, segments))]
    pub fn index_document_with_segments(
        &self,
        job_id: i64,
        segments: &[(i64, String, f64, f64)],
    ) -> Result<(), String> {
        let _operation_guard = self
            .index_operation_lock
            .lock()
            .map_err(|_| "Semantic index operation lock poisoned".to_string())?;
        info!("Iniciando indexación semántica para Job ID: {}", job_id);

        let start_time = std::time::Instant::now();
        let chunks = chunk_transcript_segments(segments, 180, 27);
        if chunks.is_empty() {
            return Err("El documento no generó ningún chunk de texto".to_string());
        }

        let mut indexed_count = 0;
        let mut chunk_records = Vec::with_capacity(chunks.len());
        let mut search_units = Vec::with_capacity(chunks.len());
        let mut embeddings = Vec::with_capacity(chunks.len());

        for chunk in chunks {
            let ordinal = chunk.ordinal;
            let text = chunk.text.clone();
            let start_time = chunk.start_time;
            let end_time = chunk.end_time;
            // 1. Generar Vector 384d
            let embedding = self.generate_embedding(&text)?;

            // 2. ID Combinado y único espacial (Hash rudimentario para HNSW local memory)
            // Usa una fórmula de bitshift ligera o correlación
            let internal_id = (job_id as usize) << 16 | (ordinal as usize);

            // 3. Insertar en el grafo HNSW a través del Coordinator
            self.query_coordinator
                .insert_local(internal_id, job_id, ordinal, &embedding)
                .map_err(|e| {
                    error!("Fallo en Coordinator insertion: {}", e);
                    e
                })?;

            chunk_records.push((ordinal, text.clone(), embedding.clone()));
            embeddings.push(embedding);
            search_units.push(crate::db::SearchUnitInput {
                ordinal,
                text,
                start_time,
                end_time,
                representation: SearchRepresentation::Transcript,
                language: None,
                artifact_id: None,
                provenance_json: Some(r#"{"source":"whisper"}"#.to_string()),
                confidence: None,
            });
            indexed_count += 1;
        }

        // 4. Persistir chunks y embeddings en SQLite (transcript_embeddings)
        self.query_coordinator
            .persist_embeddings(job_id, &chunk_records)?;

        let mut connection = self
            .metadata_db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        crate::db::replace_search_units_with_embeddings(
            &mut connection,
            job_id,
            &search_units,
            &embeddings,
            "onnx",
            crate::db::EMBEDDING_MODEL_ID,
        )
        .map_err(|error| format!("Failed to persist unified search units: {error}"))?;

        histogram!("vector_index_latency_seconds").record(start_time.elapsed().as_secs_f64());
        info!(
            "Indexados y persistidos {} chunks para el Job {}",
            indexed_count, job_id
        );
        Ok(())
    }

    pub fn update_config(&self, config: SearchConfig) -> Result<(), String> {
        let mut current = self
            .config
            .write()
            .map_err(|_| "Search configuration lock poisoned".to_string())?;
        *current = config;
        self.config_version.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    /// Búsqueda semántica usando el Índice HNSW Ultrarrápido.
    pub async fn search(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let start_time = std::time::Instant::now();
        info!("Ejecutando semantic search");

        // 1. Convertir la string de búsqueda a embedding
        let query_vec = self.generate_embedding(query)?;

        let config = self
            .config
            .read()
            .map_err(|_| "Search configuration lock poisoned".to_string())?
            .clone();
        let config_version = self.config_version.load(Ordering::SeqCst);

        // 2. Cache Semántico
        if let Some(cached_results) =
            self.semantic_cache
                .lookup(&query_vec, config.max_results, config_version)
        {
            info!("Búsqueda servida desde caché local de forma instantánea.");
            histogram!("pipeline_latency_seconds").record(start_time.elapsed().as_secs_f64());
            return Ok(cached_results);
        }

        // 3. Ejecutar búsqueda distribuida (Scatter-Gather) a través del Coordinator
        let results = self
            .query_coordinator
            .distributed_search(&query_vec, config.max_results)
            .await?;

        // 4. Aplicar Reranking Semántico (Cross Encoder) para refinar los resultados sobre Top-K.
        let final_results = self
            .reranker
            .rerank(query, results)
            .into_iter()
            .filter(|result| result.similarity_score >= config.min_score)
            .take(config.max_results)
            .collect::<Vec<_>>();

        // 5. Guardar el resultado procesado en Caché Semántico asíncrono.
        self.semantic_cache.set(
            &query_vec,
            config.max_results,
            config_version,
            &final_results,
        );

        histogram!("pipeline_latency_seconds").record(start_time.elapsed().as_secs_f64());
        Ok(final_results)
    }

    /// Unified retrieval path used by the desktop UI and the new REST
    /// endpoint. Every optional channel is best-effort so an unavailable
    /// embedding model or visual enrichment never disables exact search.
    #[instrument(skip(self, request))]
    pub async fn unified_search(
        &self,
        request: UnifiedSearchRequest,
    ) -> Result<UnifiedSearchResponse, String> {
        let query = request.query.trim();
        if query.is_empty() {
            return Ok(UnifiedSearchResponse {
                normalized_query: String::new(),
                mode: request.mode,
                parsed_filters: Default::default(),
                context: Default::default(),
                results: Vec::new(),
                capabilities: SearchCapabilities {
                    lexical: true,
                    vector: false,
                    ocr: false,
                    vision: false,
                    reranker: self.reranker.is_configured(),
                },
            });
        }
        if query.len() > 500 {
            return Err("Search query must contain between 1 and 500 characters".to_string());
        }

        let understanding = understand(query, request.mode, request.context.as_ref());
        let config = self
            .config
            .read()
            .map_err(|_| "Search configuration lock poisoned".to_string())?
            .clone();
        let limit = request.limit.clamp(1, 100).min(config.max_results.max(1));
        let candidate_limit = 50usize;
        let mut channels = Vec::new();
        let mut capabilities = SearchCapabilities {
            lexical: true,
            vector: false,
            ocr: false,
            vision: false,
            reranker: self.reranker.is_configured(),
        };

        let lexical_enabled = matches!(request.mode, SearchMode::Smart | SearchMode::Exact);
        if lexical_enabled {
            let connection = self
                .metadata_db
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            let lexical = crate::db::search_search_units(
                &connection,
                &understanding.retrieval_query,
                candidate_limit,
                request.mode == SearchMode::Exact,
            )
            .map_err(|error| format!("lexical search failed: {error}"))?;
            let lexical = lexical
                .into_iter()
                .filter(|hit| {
                    crate::db::job_matches_filters(
                        &connection,
                        hit.unit.job_id,
                        &understanding.filters,
                    )
                    .unwrap_or(false)
                })
                .map(unit_to_hit)
                .collect::<Vec<_>>();
            if !lexical.is_empty() {
                channels.push(lexical);
            }
        }

        let metadata = {
            let connection = self
                .metadata_db
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            crate::db::search_metadata(
                &connection,
                &understanding.retrieval_query,
                &understanding.filters,
                candidate_limit,
            )
            .map_err(|error| format!("metadata search failed: {error}"))?
        };
        if !metadata.is_empty() {
            channels.push(metadata.into_iter().map(metadata_to_hit).collect());
        }

        if request.mode != SearchMode::Exact {
            let embedding_query = if understanding.retrieval_query.trim().is_empty() {
                &understanding.normalized_query
            } else {
                &understanding.retrieval_query
            };
            match self.generate_embedding(embedding_query) {
                Ok(query_vec) => match self
                    .query_coordinator
                    .distributed_search(&query_vec, candidate_limit)
                    .await
                {
                    Ok(vector_results) => {
                        let connection = self
                            .metadata_db
                            .lock()
                            .map_err(|_| "Database mutex poisoned".to_string())?;
                        let vector_hits = vector_results
                            .into_iter()
                            .filter_map(|result| {
                                if !crate::db::job_matches_filters(
                                    &connection,
                                    result.job_id,
                                    &understanding.filters,
                                )
                                .unwrap_or(false)
                                {
                                    return None;
                                }
                                let unit = crate::db::get_search_unit(
                                    &connection,
                                    result.job_id,
                                    result.chunk_index,
                                );
                                Some(UnifiedHit {
                                    job_id: result.job_id,
                                    content_id: unit.as_ref().and_then(|value| value.content_id),
                                    title: unit
                                        .as_ref()
                                        .and_then(|value| value.title.clone())
                                        .or(result.title),
                                    author: unit.as_ref().and_then(|value| value.author.clone()),
                                    thumbnail: unit
                                        .as_ref()
                                        .and_then(|value| value.match_thumbnail.clone())
                                        .or(result.thumbnail),
                                    representation: unit
                                        .as_ref()
                                        .map(|value| value.representation)
                                        .unwrap_or(SearchRepresentation::Transcript),
                                    provenance_confidence: unit
                                        .as_ref()
                                        .and_then(|value| value.confidence),
                                    unit,
                                    score: result.similarity_score,
                                })
                            })
                            .collect::<Vec<_>>();
                        if !vector_hits.is_empty() {
                            capabilities.vector = true;
                            channels.push(vector_hits);
                        }
                    }
                    Err(error) => warn!("vector search unavailable, continuing lexically: {error}"),
                },
                Err(error) => warn!("query embedding unavailable, continuing lexically: {error}"),
            }
        }

        let fused = fuse_ranked_hits(channels, 20, 60.0);
        let mut groups = groups_from_hits(fused, limit);
        {
            let connection = self
                .metadata_db
                .lock()
                .map_err(|_| "Database mutex poisoned".to_string())?;
            capabilities.ocr =
                crate::db::has_search_representation(&connection, SearchRepresentation::Ocr)
                    .unwrap_or(false);
            capabilities.vision =
                crate::db::has_search_representation(&connection, SearchRepresentation::Vision)
                    .unwrap_or(false);
            for group in &mut groups {
                group.relationship_badges =
                    crate::db::get_relationship_badges(&connection, group.job_id)
                        .unwrap_or_default();
            }
        }

        Ok(UnifiedSearchResponse {
            normalized_query: understanding.normalized_query,
            mode: request.mode,
            parsed_filters: understanding.filters,
            context: understanding.context,
            results: groups,
            capabilities,
        })
    }

    /// Interface transparente hacía el Engine ONNX Inyectado
    fn generate_embedding(&self, text: &str) -> Result<Vec<f32>, String> {
        self.embedding_engine.generate_embedding(text)
    }

    pub fn snapshot_index(&self) -> Result<(), String> {
        let _operation_guard = self
            .index_operation_lock
            .lock()
            .map_err(|_| "Semantic index operation lock poisoned".to_string())?;
        let path = crate::db::data_dir_path().join("vector_index.hnsw");
        self.query_coordinator.save_index(&path.to_string_lossy())
    }

    pub fn rebuild_index(&self, rows: &[(i64, i64, Vec<f32>)]) -> Result<usize, String> {
        let _operation_guard = self
            .index_operation_lock
            .lock()
            .map_err(|_| "Semantic index operation lock poisoned".to_string())?;
        let data_dir = crate::db::data_dir_path();
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| format!("system clock before unix epoch: {error}"))?
            .as_nanos();
        let temporary_base = data_dir.join(format!("vector_index.rebuild-{nonce}.hnsw"));
        let canonical_base = data_dir.join("vector_index.hnsw");
        let result = self.query_coordinator.rebuild_local_index(
            rows,
            &temporary_base.to_string_lossy(),
            &canonical_base.to_string_lossy(),
        );
        for index in 0..self.query_coordinator.shard_count() {
            let temporary_shard =
                data_dir.join(format!("vector_index.rebuild-{nonce}_shard_{index}.hnsw"));
            let _ = std::fs::remove_file(temporary_shard);
        }
        result
    }

    pub fn load_index(&self) -> Result<(), String> {
        let _operation_guard = self
            .index_operation_lock
            .lock()
            .map_err(|_| "Semantic index operation lock poisoned".to_string())?;
        let path = crate::db::data_dir_path().join("vector_index.hnsw");
        self.query_coordinator.load_index(&path.to_string_lossy())
    }
}
