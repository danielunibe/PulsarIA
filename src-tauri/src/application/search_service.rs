use std::sync::Arc;
use crate::domain::models::{SearchConfig, SearchResult};
use crate::domain::ports::EmbeddingEngine;
use tracing::{instrument, info, error};
use metrics::histogram;

// ========================================================================
// APPLICATION: Search Service (Orquestador Semántico)
// Implementa SRP dictando CÓMO interactúan los componentes sin saber CÓMO
// están implementados a bajo nivel. Funciona con inyección de dependencias.
// ========================================================================

pub struct SearchService {
    config: SearchConfig,
    embedding_engine: Arc<dyn EmbeddingEngine>,
    query_coordinator: Arc<crate::distributed::query_coordinator::QueryCoordinator>,
    reranker: Arc<dyn crate::application::reranker::Reranker>,
    semantic_cache: Arc<crate::infrastructure::semantic_cache::SemanticCache>,
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
            config,
            embedding_engine,
            query_coordinator,
            reranker,
            semantic_cache,
        }
    }

    /// Toma un texto largo (ej: transcripción completa), lo divide en chunks con overlap,
    /// genera el embedding para cada uno y los persiste en el índice vectorial.
    #[instrument(skip(self, full_text))]
    pub fn index_document(&self, job_id: i64, full_text: &str) -> Result<(), String> {
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
            self.query_coordinator.insert_local(internal_id, job_id, chunk.chunk_index, &embedding)
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

    /// Búsqueda semántica usando el Índice HNSW Ultrarrápido.
    pub async fn search(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let start_time = std::time::Instant::now();
        info!("Ejecutando semantic search para: '{}'", query);
        
        // 1. Convertir la string de búsqueda a embedding
        let query_vec = self.generate_embedding(query)?;
        
        // 2. Cache Semántico
        if let Some(cached_results) = self.semantic_cache.lookup(&query_vec, self.config.max_results).await {
            info!("Búsqueda servida desde Redis Cache de forma instantánea.");
            histogram!("pipeline_latency_seconds").record(start_time.elapsed().as_secs_f64());
            return Ok(cached_results);
        }
        
        // 3. Ejecutar búsqueda distribuida (Scatter-Gather) a través del Coordinator
        let results = self.query_coordinator.distributed_search(&query_vec, self.config.max_results).await?;
        
        // 4. Aplicar Reranking Semántico (Cross Encoder) para refinar los resultados sobre Top-K.
        let final_results = self.reranker.rerank(query, results);
        
        // 5. Guardar el resultado procesado en Caché Semántico asíncrono.
        self.semantic_cache.set(&query_vec, self.config.max_results, &final_results).await;
        
        histogram!("pipeline_latency_seconds").record(start_time.elapsed().as_secs_f64());
        Ok(final_results)
    }

    /// Interface transparente hacía el Engine ONNX Inyectado
    fn generate_embedding(&self, text: &str) -> Result<Vec<f32>, String> {
        self.embedding_engine.generate_embedding(text)
    }

    pub fn snapshot_index(&self) -> Result<(), String> {
        self.query_coordinator.save_index("data/vector_index.hnsw")
    }

    pub fn load_index(&self) -> Result<(), String> {
        self.query_coordinator.load_index("data/vector_index.hnsw")
    }
}
