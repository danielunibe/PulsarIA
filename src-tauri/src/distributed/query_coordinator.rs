use metrics::{counter, gauge, histogram};
use reqwest::Client;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::task;
use tokio::time::timeout;
use tracing::{info, instrument, warn};

use crate::domain::models::SearchResult;
use crate::domain::ports::VectorIndex;

// ========================================================================
// DISTRIBUTED QUERY COORDINATOR
// ========================================================================

pub struct QueryCoordinator {
    nodes: Vec<String>,
    client: Client,
    enabled: bool,
    node_timeout_ms: u64,
    local_executor: Arc<crate::infrastructure::vector_shards::VectorShardManager>,
    metadata_db: Arc<Mutex<rusqlite::Connection>>,
}

impl QueryCoordinator {
    pub fn new(
        nodes_list: String,
        local_executor: Arc<crate::infrastructure::vector_shards::VectorShardManager>,
        enabled: bool,
        metadata_db: Arc<Mutex<rusqlite::Connection>>,
    ) -> Self {
        let nodes = nodes_list
            .split(',')
            .map(str::trim)
            .filter(|node| !node.is_empty())
            .map(ToOwned::to_owned)
            .collect();

        Self {
            nodes,
            client: Client::builder()
                .timeout(Duration::from_millis(800))
                .build()
                .unwrap_or_default(),
            node_timeout_ms: 75,
            enabled,
            local_executor,
            metadata_db,
        }
    }

    pub fn insert_local(
        &self,
        internal_id: usize,
        job_id: i64,
        chunk_index: i64,
        embedding: &[f32],
    ) -> Result<(), String> {
        self.local_executor
            .insert(internal_id, job_id, chunk_index, embedding)
    }

    fn materialize_local_results(
        &self,
        query_vec: &[f32],
        limit: usize,
    ) -> Result<Vec<SearchResult>, String> {
        if limit == 0 {
            return Ok(Vec::new());
        }

        let hits = self.local_executor.search(query_vec, limit)?;
        let conn = self
            .metadata_db
            .lock()
            .map_err(|_| "Database mutex poisoned".to_string())?;
        let mut results = Vec::with_capacity(hits.len());

        for (node_id, score) in hits {
            let (job_id, chunk_index) = match self.local_executor.get_chunk_info(node_id) {
                Ok(info) => info,
                Err(error) => {
                    warn!("Ignoring HNSW node without metadata {}: {}", node_id, error);
                    continue;
                }
            };

            if let Some(result) = crate::db::get_search_result(&conn, job_id, chunk_index) {
                results.push(SearchResult {
                    job_id: result.job_id,
                    title: result.title,
                    thumbnail: result.thumbnail,
                    chunk_text: result.chunk_text,
                    chunk_index: result.chunk_index,
                    similarity_score: score,
                });
            }
        }

        results.sort_by(|left, right| {
            right
                .similarity_score
                .partial_cmp(&left.similarity_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        results.truncate(limit);
        Ok(results)
    }

    #[instrument(skip(self, query_vec))]
    pub async fn distributed_search(
        &self,
        query_vec: &[f32],
        limit: usize,
    ) -> Result<Vec<SearchResult>, String> {
        let start_time = std::time::Instant::now();
        if limit == 0 {
            return Ok(Vec::new());
        }

        if !self.enabled || self.nodes.is_empty() {
            return self.materialize_local_results(query_vec, limit);
        }

        let mut tasks = Vec::with_capacity(self.nodes.len());
        let total_nodes = self.nodes.len();
        let node_timeout = Duration::from_millis(self.node_timeout_ms);
        let payload = serde_json::json!({"query_vec": query_vec, "limit": limit});

        for node_url in &self.nodes {
            let client = self.client.clone();
            let url = format!("{}/internal/search", node_url.trim_end_matches('/'));
            let body = payload.clone();

            tasks.push(task::spawn(async move {
                let result = timeout(node_timeout, async {
                    match client.post(&url).json(&body).send().await {
                        Ok(response) if response.status().is_success() => {
                            response.json::<Vec<SearchResult>>().await.ok()
                        }
                        Ok(response) => {
                            warn!("Node {} returned status {}", url, response.status());
                            None
                        }
                        Err(error) => {
                            warn!("Distributed node {} failed: {}", url, error);
                            counter!("distributed_node_failures_total").increment(1);
                            None
                        }
                    }
                })
                .await;

                match result {
                    Ok(results) => results,
                    Err(_) => {
                        warn!(
                            "Node {} timed out after {}ms",
                            url,
                            node_timeout.as_millis()
                        );
                        counter!("distributed_node_timeouts_total").increment(1);
                        None
                    }
                }
            }));
        }

        let mut aggregated_results = Vec::new();
        let mut active_nodes = 0u64;
        let mut per_node_counts = Vec::with_capacity(total_nodes);

        for task in tasks {
            match task.await {
                Ok(Some(results)) => {
                    per_node_counts.push(results.len());
                    aggregated_results.extend(results);
                    active_nodes += 1;
                }
                _ => per_node_counts.push(0),
            }
        }

        gauge!("distributed_nodes_active").set(active_nodes as f64);
        if !per_node_counts.is_empty() {
            let max_count = *per_node_counts.iter().max().unwrap_or(&0) as f64;
            let min_count = *per_node_counts.iter().min().unwrap_or(&0) as f64;
            let skew = if max_count > 0.0 {
                (max_count - min_count) / max_count
            } else {
                0.0
            };
            gauge!("shard_skew_ratio").set(skew);
            info!(
                "Shard skew ratio: {:.2} ({}/{} active nodes)",
                skew, active_nodes, total_nodes
            );
        }

        if active_nodes == 0 {
            counter!("distributed_full_fallback_total").increment(1);
            return self.materialize_local_results(query_vec, limit);
        }

        aggregated_results.sort_by(|left, right| {
            right
                .similarity_score
                .partial_cmp(&left.similarity_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        aggregated_results.truncate(limit);
        histogram!("distributed_query_latency_seconds").record(start_time.elapsed().as_secs_f64());
        Ok(aggregated_results)
    }

    pub fn save_index(&self, path: &str) -> Result<(), String> {
        self.local_executor.snapshot_index(path)
    }

    pub fn load_index(&self, path: &str) -> Result<(), String> {
        self.local_executor.load_index(path)
    }

    pub fn rebuild_local_index(
        &self,
        rows: &[(i64, i64, Vec<f32>)],
        temporary_base: &str,
        canonical_base: &str,
    ) -> Result<usize, String> {
        let replacement = crate::infrastructure::vector_shards::VectorShardManager::new_empty(
            self.local_executor.shard_count(),
        );
        for (internal_id, (job_id, chunk_index, embedding)) in rows.iter().enumerate() {
            replacement.insert(internal_id, *job_id, *chunk_index, embedding)?;
        }

        replacement.snapshot_index(temporary_base)?;
        let validated = crate::infrastructure::vector_shards::VectorShardManager::new_empty(
            self.local_executor.shard_count(),
        );
        validated.load_index(temporary_base)?;
        let count = validated.vector_count()?;
        if count != rows.len() {
            return Err(format!(
                "HNSW rebuild count mismatch: database has {}, replacement has {}",
                rows.len(),
                count
            ));
        }

        let mut expected_pairs = rows
            .iter()
            .map(|(job_id, chunk_index, _)| (*job_id, *chunk_index))
            .collect::<Vec<_>>();
        expected_pairs.sort_unstable();
        let mut actual_pairs = validated.metadata_entries()?;
        actual_pairs.sort_unstable();
        if actual_pairs != expected_pairs {
            return Err(format!(
                "HNSW rebuild metadata mismatch: database has {} pairs, replacement has {}",
                expected_pairs.len(),
                actual_pairs.len()
            ));
        }

        self.local_executor.replace_from(&validated)?;
        // Move the complete staged set with rollback protection. A partially
        // committed shard set is never left as the canonical snapshot.
        self.local_executor
            .commit_staged_snapshot(temporary_base, canonical_base)?;
        Ok(count)
    }

    pub fn shard_count(&self) -> usize {
        self.local_executor.shard_count()
    }
}
