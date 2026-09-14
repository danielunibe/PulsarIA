use crate::domain::models::{SearchConfig, SearchResult};
use crate::domain::ports::EmbeddingEngine;
use metrics::histogram;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tracing::{error, info, instrument};

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
    ) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            embedding_engine,
            query_coordinator,
            reranker,
            semantic_cache,
            config_version: AtomicU64::new(0),
            index_operation_lock: Arc::new(Mutex::new(())),
        }
    }

    /// Toma un texto largo (ej: transcripción completa), lo divide en chunks con overlap,
    /// genera el embedding para cada uno y los persiste en el índice vectorial.
    #[instrument(skip(self, full_text))]
    pub fn index_document(&self, job_id: i64, full_text: &str) -> Result<(), String> {
        let _operation_guard = self
            .index_operation_lock
            .lock()
            .map_err(|_| "Semantic index operation lock poisoned".to_string())?;
        info!("Iniciando indexación semántica para Job ID: {}", job_id);

        let start_time = std::time::Instant::now();
        let chunker = crate::application::semantic_chunker::SemanticChunker::new();
        let chunks = chunker.chunk_text(full_text);
        if chunks.is_empty() {
            return Err("El documento no generó ningún chunk de texto".to_string());
        }

        let mut indexed_count = 0;

        for chunk in chunks {
            // 1. Generar Vector 384d
            let embedding = self.generate_embedding(&chunk.text)?;

            // 2. ID Combinado y único espacial (Hash rudimentario para HNSW local memory)
            // Usa una fórmula de bitshift ligera o correlación
            let internal_id = (job_id as usize) << 16 | (chunk.chunk_index as usize);

            // 3. Insertar en el grafo HNSW a través del Coordinator
            self.query_coordinator
                .insert_local(internal_id, job_id, chunk.chunk_index, &embedding)
                .map_err(|e| {
                    error!("Fallo en Coordinator insertion: {}", e);
                    e
                })?;

            indexed_count += 1;
        }

        histogram!("vector_index_latency_seconds").record(start_time.elapsed().as_secs_f64());
        info!("Indexados {} chunks para el Job {}", indexed_count, job_id);
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
        info!("Ejecutando semantic search para: '{}'", query);

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
