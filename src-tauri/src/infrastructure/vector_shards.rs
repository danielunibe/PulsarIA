use crate::domain::ports::VectorIndex;
use crate::infrastructure::persistence::hnsw_index::HnswVectorIndex;
use std::sync::Arc;
use metrics::histogram;
use tracing::{info, instrument};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

// ========================================================================
// INFRASTRUCTURE: Sharding Horizontal de Índices Vectoriales HNSW
// ========================================================================

pub struct VectorShardManager {
    shards: Vec<Arc<HnswVectorIndex>>,
    shard_count: usize,
}

impl VectorShardManager {
    pub fn new(shard_count: usize) -> Self {
        let mut shards = Vec::with_capacity(shard_count);
        for i in 0..shard_count {
            let shard = Arc::new(HnswVectorIndex::new());
            // Intentar cargar snapshot individual si existe
            let file_name = format!("data/vector_index_shard_{}.hnsw", i);
            if let Err(e) = shard.load_index(&file_name) {
                tracing::warn!("HNSW Shard {} load failed (normal on first boot): {}", i, e);
            }
            shards.push(shard);
        }
        
        info!("VectorShardManager inialized with {} shards.", shard_count);
        
        Self {
            shards,
            shard_count,
        }
    }

    // Calcula el shard asignado en base al Job ID para distribuir uniformemente
    fn get_shard_index(&self, job_id: i64) -> usize {
        let mut hasher = DefaultHasher::new();
        job_id.hash(&mut hasher);
        (hasher.finish() as usize) % self.shard_count
    }
}

// Implementación transparente de VectorIndex que distribuye el trabajo
impl VectorIndex for VectorShardManager {
    #[instrument(skip(self, embedding))]
    fn insert(&self, internal_id: usize, job_id: i64, chunk_index: i64, embedding: &[f32]) -> Result<(), String> {
        let start_time = std::time::Instant::now();
        let shard_idx = self.get_shard_index(job_id);
        
        let result = self.shards[shard_idx].insert(internal_id, job_id, chunk_index, embedding);
        
        histogram!("vector_shard_insert_latency_seconds").record(start_time.elapsed().as_secs_f64());
        result
    }

    #[instrument(skip(self, query_vec))]
    fn search(&self, query_vec: &[f32], limit: usize) -> Result<Vec<usize>, String> {
        let start_time = std::time::Instant::now();
        
        // Scatter-gather síncrono para HNSW en RAM. En sistemas clusterizados se usa tokio::spawn
        let mut all_results = Vec::new();
        
        for shard in &self.shards {
            if let Ok(results) = shard.search(query_vec, limit) {
                all_results.extend(results);
            }
        }
        
        // Nota: En un HNSW puro que retorna ids brutos sin distancias, agregar (merge) top-K requiere 
        // tener los scores originales. Por compatibilidad actual, la interface Search() de VectorIndex 
        // retorna Vec<usize>. El re-ordenamiento riguroso top-K requeriría mapeo HNSW -> distance.
        // Simularemos truncando la agregación por el límite global en esta abstracción, asumiendo
        // que el Semantic SearchService luego cruzará datos o confiará en Reranker para depurar.
        
        all_results.truncate(limit); // Simplificado.
        
        histogram!("vector_shard_query_latency_seconds").record(start_time.elapsed().as_secs_f64());
        Ok(all_results)
    }

    fn get_chunk_info(&self, internal_id: usize) -> Result<(i64, i64), String> {
        // En un clúster distribuido esto sería ineficiente, requeriendo "routing table".
        // Para HNSW local, probamos cada shard hasta encontrarlo (Fallback O(N)).
        for shard in &self.shards {
            if let Ok(info) = shard.get_chunk_info(internal_id) {
                return Ok(info);
            }
        }
        Err("Chunk not found in any shard".to_string())
    }

    fn snapshot_index(&self, base_file_path: &str) -> Result<(), String> {
        for (i, shard) in self.shards.iter().enumerate() {
            let file_name = format!("{}_shard_{}.hnsw", base_file_path.trim_end_matches(".hnsw"), i);
            shard.snapshot_index(&file_name)?;
        }
        Ok(())
    }

    fn load_index(&self, base_file_path: &str) -> Result<(), String> {
        for (i, shard) in self.shards.iter().enumerate() {
            let file_name = format!("{}_shard_{}.hnsw", base_file_path.trim_end_matches(".hnsw"), i);
            shard.load_index(&file_name)?;
        }
        Ok(())
    }
}
