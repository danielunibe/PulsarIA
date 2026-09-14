use crate::infrastructure::persistence::hnsw_index::HnswVectorIndex;
use metrics::histogram;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
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
        Self::with_load(shard_count, true)
    }

    pub fn new_empty(shard_count: usize) -> Self {
        Self::with_load(shard_count, false)
    }

    fn with_load(shard_count: usize, load_from_disk: bool) -> Self {
        let shard_count = shard_count.max(1);
        let mut shards = Vec::with_capacity(shard_count);
        let data_dir = crate::db::data_dir_path();

        for index in 0..shard_count {
            let shard = Arc::new(HnswVectorIndex::new());
            if load_from_disk {
                let file_name = data_dir.join(format!("vector_index_shard_{}.hnsw", index));
                if let Err(error) = shard.load_index(&file_name.to_string_lossy()) {
                    tracing::warn!("HNSW shard {} load failed: {}", index, error);
                }
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

    pub fn vector_count(&self) -> Result<usize, String> {
        self.shards.iter().try_fold(0usize, |total, shard| {
            shard.vector_count().map(|count| total + count)
        })
    }

    pub fn shard_count(&self) -> usize {
        self.shard_count
    }

    pub fn metadata_entries(&self) -> Result<Vec<(i64, i64)>, String> {
        let mut entries = Vec::new();
        for shard in &self.shards {
            entries.extend(shard.metadata_entries()?);
        }
        Ok(entries)
    }

    fn shard_path(base_file_path: &str, index: usize) -> PathBuf {
        PathBuf::from(format!(
            "{}_shard_{}.hnsw",
            base_file_path.trim_end_matches(".hnsw"),
            index
        ))
    }

    /// Commit a fully staged set of shards with rollback protection. A
    /// multi-file rename is not atomic on Windows, so an existing canonical
    /// set is kept in a rollback directory until every staged shard is in
    /// place. A failed commit restores the complete previous set.
    pub fn commit_staged_snapshot(
        &self,
        staged_base: &str,
        canonical_base: &str,
    ) -> Result<(), String> {
        let canonical_path = Path::new(canonical_base);
        let parent = canonical_path.parent().unwrap_or_else(|| Path::new("."));
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create HNSW commit directory: {error}"))?;
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| format!("system clock before unix epoch: {error}"))?
            .as_nanos();
        let backup_dir = parent.join(format!(".vector-index-rollback-{nonce}"));
        std::fs::create_dir_all(&backup_dir)
            .map_err(|error| format!("Could not create HNSW rollback directory: {error}"))?;

        let mut backed_up = Vec::new();
        let mut installed = Vec::new();
        let result = (|| {
            for index in 0..self.shard_count {
                let canonical = Self::shard_path(canonical_base, index);
                if canonical.exists() {
                    let backup = backup_dir.join(format!("shard_{index}.hnsw"));
                    std::fs::rename(&canonical, &backup).map_err(|error| {
                        format!("Could not stage existing HNSW shard {index}: {error}")
                    })?;
                    backed_up.push((canonical, backup));
                }
            }

            for index in 0..self.shard_count {
                let staged = Self::shard_path(staged_base, index);
                if !staged.is_file() {
                    return Err(format!("Staged HNSW shard {index} is missing"));
                }
                let canonical = Self::shard_path(canonical_base, index);
                std::fs::rename(&staged, &canonical)
                    .map_err(|error| format!("Could not commit HNSW shard {index}: {error}"))?;
                installed.push(canonical);
            }
            Ok(())
        })();

        if let Err(error) = result {
            for path in installed {
                let _ = std::fs::remove_file(path);
            }
            for (canonical, backup) in backed_up.iter().rev() {
                if let Err(restore_error) = std::fs::rename(backup, canonical) {
                    return Err(format!(
                        "HNSW commit failed: {error}; rollback failed for {}: {restore_error}",
                        canonical.display()
                    ));
                }
            }
            let _ = std::fs::remove_dir_all(&backup_dir);
            return Err(error);
        }

        std::fs::remove_dir_all(&backup_dir)
            .map_err(|error| format!("HNSW committed but rollback cleanup failed: {error}"))?;
        Ok(())
    }

    pub fn replace_from(&self, source: &Self) -> Result<(), String> {
        if self.shard_count != source.shard_count {
            return Err("HNSW shard count mismatch during replacement".to_string());
        }
        for (destination, source) in self.shards.iter().zip(&source.shards) {
            destination.replace_from(source)?;
        }
        Ok(())
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
            let file_name = Self::shard_path(base_file_path, index);
            shard.snapshot_index(&file_name.to_string_lossy())?;
        }
        Ok(())
    }

    fn load_index(&self, base_file_path: &str) -> Result<(), String> {
        for (index, shard) in self.shards.iter().enumerate() {
            let file_name = Self::shard_path(base_file_path, index);
            shard.load_index(&file_name.to_string_lossy())?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::VectorShardManager;
    use crate::domain::models::EMBEDDING_DIMS;
    use crate::domain::ports::VectorIndex;

    #[test]
    fn snapshot_round_trip_preserves_multiple_shards_and_metadata() {
        let base = std::env::temp_dir().join(format!(
            "pulsaria-vector-shards-{}-{}.hnsw",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after unix epoch")
                .as_nanos()
        ));
        let manager = VectorShardManager::new_empty(3);

        for internal_id in 0..18usize {
            let job_id = internal_id as i64 + 1;
            let mut embedding = vec![0.0_f32; EMBEDDING_DIMS];
            embedding[internal_id % EMBEDDING_DIMS] = 1.0;
            manager
                .insert(internal_id, job_id, 0, &embedding)
                .expect("test vector should be inserted");
        }
        assert_eq!(manager.vector_count().unwrap(), 18);

        manager
            .snapshot_index(&base.to_string_lossy())
            .expect("multi-shard snapshot should be written");

        let restored = VectorShardManager::new_empty(3);
        restored
            .load_index(&base.to_string_lossy())
            .expect("multi-shard snapshot should load");
        assert_eq!(restored.shard_count(), 3);
        assert_eq!(restored.vector_count().unwrap(), 18);

        let query = vec![1.0_f32; EMBEDDING_DIMS];
        let results = restored.search(&query, 5).unwrap();
        assert_eq!(results.len(), 5);
        for (internal_id, _) in results {
            let (job_id, chunk_index) = restored.get_chunk_info(internal_id).unwrap();
            assert!((1..=18).contains(&job_id));
            assert_eq!(chunk_index, 0);
        }

        for index in 0..3 {
            let shard_path = format!(
                "{}_shard_{}.hnsw",
                base.to_string_lossy().trim_end_matches(".hnsw"),
                index
            );
            let _ = std::fs::remove_file(shard_path);
        }
    }

    #[test]
    fn staged_commit_restores_a_complete_multi_shard_snapshot() {
        let root = std::env::temp_dir().join(format!(
            "pulsaria-vector-commit-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after unix epoch")
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let staged = root.join("rebuild.hnsw");
        let canonical = root.join("canonical.hnsw");
        let manager = VectorShardManager::new_empty(3);
        for internal_id in 0..9usize {
            let mut embedding = vec![0.0_f32; EMBEDDING_DIMS];
            embedding[internal_id % EMBEDDING_DIMS] = 1.0;
            manager
                .insert(internal_id, internal_id as i64 + 1, 0, &embedding)
                .unwrap();
        }
        manager.snapshot_index(&staged.to_string_lossy()).unwrap();
        manager
            .commit_staged_snapshot(&staged.to_string_lossy(), &canonical.to_string_lossy())
            .unwrap();

        let restored = VectorShardManager::new_empty(3);
        restored.load_index(&canonical.to_string_lossy()).unwrap();
        assert_eq!(restored.vector_count().unwrap(), 9);
        assert_eq!(restored.metadata_entries().unwrap().len(), 9);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn failed_staged_commit_keeps_the_previous_canonical_set() {
        let root = std::env::temp_dir().join(format!(
            "pulsaria-vector-rollback-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after unix epoch")
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let old_base = root.join("old.hnsw");
        let staged_base = root.join("staged.hnsw");
        let canonical_base = root.join("canonical.hnsw");
        let manager = VectorShardManager::new_empty(2);
        for internal_id in 0..4usize {
            let mut embedding = vec![0.0_f32; EMBEDDING_DIMS];
            embedding[internal_id] = 1.0;
            manager
                .insert(internal_id, internal_id as i64 + 1, 0, &embedding)
                .unwrap();
        }
        manager.snapshot_index(&old_base.to_string_lossy()).unwrap();
        manager
            .commit_staged_snapshot(
                &old_base.to_string_lossy(),
                &canonical_base.to_string_lossy(),
            )
            .unwrap();
        manager
            .snapshot_index(&staged_base.to_string_lossy())
            .unwrap();
        let staged_shard_one = format!(
            "{}_shard_1.hnsw",
            staged_base.to_string_lossy().trim_end_matches(".hnsw")
        );
        std::fs::remove_file(staged_shard_one).unwrap();

        assert!(manager
            .commit_staged_snapshot(
                &staged_base.to_string_lossy(),
                &canonical_base.to_string_lossy()
            )
            .is_err());
        let restored = VectorShardManager::new_empty(2);
        restored
            .load_index(&canonical_base.to_string_lossy())
            .unwrap();
        assert_eq!(restored.vector_count().unwrap(), 4);

        let _ = std::fs::remove_dir_all(root);
    }
}
