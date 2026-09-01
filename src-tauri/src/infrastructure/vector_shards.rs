use crate::infrastructure::persistence::hnsw_index::HnswVectorIndex;
use metrics::histogram;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use tracing::{info, instrument};

use crate::domain::ports::VectorIndex;

// ========================================================================
// INFRASTRUCTURE: Sharding horizontal de índices vectoriales HNSW
// ========================================================================

pub struct VectorShardManager {
    shards: Vec<Arc<HnswVectorIndex>>,
    shard_count: usize,
}

impl VectorShardManager {
    pub fn new(shard_count: usize) -> Self {
        let shard_count = shard_count.max(1);
        let mut shards = Vec::with_capacity(shard_count);
        let data_dir = crate::db::data_dir_path();

        for index in 0..shard_count {
            let shard = Arc::new(HnswVectorIndex::new());
            let file_name = data_dir.join(format!("vector_index_shard_{}.hnsw", index));
            if let Err(error) = shard.load_index(&file_name.to_string_lossy()) {
                tracing::warn!("HNSW shard {} load failed: {}", index, error);
            }
            shards.push(shard);
        }

        info!("VectorShardManager initialized with {} shards", shard_count);
        Self {
            shards,
            shard_count,
        }
    }

    fn get_shard_index(&self, job_id: i64) -> usize {
        let mut hasher = DefaultHasher::new();
        job_id.hash(&mut hasher);
        (hasher.finish() as usize) % self.shard_count
    }
}

impl VectorIndex for VectorShardManager {
    #[instrument(skip(self, embedding))]
    fn insert(
        &self,
        internal_id: usize,
        job_id: i64,
        chunk_index: i64,
        embedding: &[f32],
    ) -> Result<(), String> {
        let start_time = std::time::Instant::now();
        let shard_index = self.get_shard_index(job_id);
        let result = self.shards[shard_index].insert(internal_id, job_id, chunk_index, embedding);
        histogram!("vector_shard_insert_latency_seconds")
            .record(start_time.elapsed().as_secs_f64());
        result
    }

    #[instrument(skip(self, query_vec))]
    fn search(&self, query_vec: &[f32], limit: usize) -> Result<Vec<(usize, f32)>, String> {
        if limit == 0 {
            return Ok(Vec::new());
        }

        let start_time = std::time::Instant::now();
        let mut all_results = Vec::with_capacity(limit * self.shard_count);
        let mut first_error: Option<String> = None;

        for shard in &self.shards {
            match shard.search(query_vec, limit) {
                Ok(results) => all_results.extend(results),
                Err(error) => {
                    if first_error.is_none() {
                        first_error = Some(error);
                    }
                }
            }
        }

        if all_results.is_empty() {
            if let Some(error) = first_error {
                return Err(error);
            }
            return Ok(Vec::new());
        }

        all_results.sort_by(|left, right| {
            right
                .1
                .partial_cmp(&left.1)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        all_results.truncate(limit);
        histogram!("vector_shard_query_latency_seconds").record(start_time.elapsed().as_secs_f64());
        Ok(all_results)
    }

    fn get_chunk_info(&self, node_id: usize) -> Result<(i64, i64), String> {
        for shard in &self.shards {
            if let Ok(info) = shard.get_chunk_info(node_id) {
                return Ok(info);
            }
        }
        Err(format!("Chunk node {} not found in any shard", node_id))
    }

    fn snapshot_index(&self, base_file_path: &str) -> Result<(), String> {
        for (index, shard) in self.shards.iter().enumerate() {
            let file_name = format!(
                "{}_shard_{}.hnsw",
                base_file_path.trim_end_matches(".hnsw"),
                index
            );
            shard.snapshot_index(&file_name)?;
        }
        Ok(())
    }

    fn load_index(&self, base_file_path: &str) -> Result<(), String> {
        for (index, shard) in self.shards.iter().enumerate() {
            let file_name = format!(
                "{}_shard_{}.hnsw",
                base_file_path.trim_end_matches(".hnsw"),
                index
            );
            shard.load_index(&file_name)?;
        }
        Ok(())
    }
}
