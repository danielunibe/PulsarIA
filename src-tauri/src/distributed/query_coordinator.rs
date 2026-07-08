use crate::domain::models::SearchResult;
use reqwest::Client;
use std::sync::Arc;
use tokio::task;
use tokio::time::timeout;
use std::time::Duration;
use tracing::{info, warn, instrument};
use metrics::{histogram, gauge, counter};

// ========================================================================
// PHASE 13: Distributed Query Coordinator (Fan-out a nodos físicos)
// ========================================================================

pub struct QueryCoordinator {
    nodes: Vec<String>,
    client: Client,
    enabled: bool,
    node_timeout_ms: u64,
    local_executor: Arc<crate::infrastructure::vector_shards::VectorShardManager>,
}

impl QueryCoordinator {
    pub fn new(nodes_list: String, local_executor: Arc<crate::infrastructure::vector_shards::VectorShardManager>, enabled: bool) -> Self {
        let nodes: Vec<String> = nodes_list.split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
            
        Self {
            nodes,
            client: Client::builder().timeout(Duration::from_millis(800)).build().unwrap_or_default(),
            node_timeout_ms: 75,
            enabled,
            local_executor,
        }
    }

    // Intercepta las inserciones: las envía al local_executor y si estuviera completo en cluster
    // delegaría a shards remotos. Por simplicidad de MVP, indexamos ruteando al coordinador.
    pub fn insert_local(&self, internal_id: usize, job_id: i64, chunk_index: i64, embedding: &[f32]) -> Result<(), String> {
        use crate::domain::ports::VectorIndex;
        self.local_executor.insert(internal_id, job_id, chunk_index, embedding)
    }

    #[instrument(skip(self, query_vec))]
    pub async fn distributed_search(&self, query_vec: &[f32], limit: usize) -> Result<Vec<SearchResult>, String> {
        let start_time = std::time::Instant::now();

        // Si el Feature Flag "DISTRIBUTED_MODE" está apagado, solo busca contra el local VectorShardManager (Fase 10)
        if !self.enabled || self.nodes.is_empty() {
            use crate::domain::ports::VectorIndex;
            let internal_ids = self.local_executor.search(query_vec, limit)?;
            
            let mut results = Vec::new();
            for internal_id in internal_ids {
                if let Ok((job_id, chunk_index)) = self.local_executor.get_chunk_info(internal_id) {
                    results.push(SearchResult {
                        job_id,
                        chunk_index,
                        title: None,
                        thumbnail: None,
                        chunk_text: "".to_string(),
                        similarity_score: 0.99,
                    });
                }
            }
            return Ok(results);
        }

        // --- DISTRIBUTED FAN-OUT (Scatter-Gather HTTP) ---
        // Simula la llamada concurrente a N Nodos Shard registrados

        let mut tasks = Vec::new();
        let total_nodes = self.nodes.len();
        let node_timeout = Duration::from_millis(self.node_timeout_ms);

        // Payload JSON para scatter a nodos remotos
        let payload = serde_json::json!({
            "query_vec": query_vec,
            "limit": limit
        });

        // Fase 13.5 – Scatter concurrente con timeout POR NODO de 75ms
        for node_url in &self.nodes {
            let client_clone = self.client.clone();
            let url = format!("{}/internal/search", node_url);
            let body = payload.clone();

            let task = task::spawn(async move {
                // Scenario 3 – Timeout: si un nodo responde lento, lo descartamos
                let result = timeout(node_timeout, async {
                    let res = client_clone.post(&url).json(&body).send().await;
                    match res {
                        Ok(resp) if resp.status().is_success() => {
                            resp.json::<Vec<SearchResult>>().await.ok()
                        },
                        Ok(resp) => {
                            warn!("Nodo {} respondió con status {}", url, resp.status());
                            None
                        },
                        Err(e) => {
                            // Scenario 2 – Node Failure: silently degrade, not error 500
                            warn!("Nodo distribuido {} caído: {}", url, e);
                            counter!("distributed_node_failures_total").increment(1);
                            None
                        }
                    }
                }).await;

                match result {
                    Ok(inner) => inner,
                    Err(_elapsed) => {
                        warn!("Nodo {} timeout (>{}ms) – degradado gracefully", url, node_timeout.as_millis());
                        counter!("distributed_node_timeouts_total").increment(1);
                        None
                    }
                }
            });
            tasks.push(task);
        }

        let mut aggregated_results = Vec::new();
        let mut active_nodes = 0u64;
        let mut per_node_counts: Vec<usize> = Vec::new();

        for t in tasks {
            if let Ok(Some(results)) = t.await {
                per_node_counts.push(results.len());
                aggregated_results.extend(results);
                active_nodes += 1;
            } else {
                per_node_counts.push(0);
            }
        }

        // Métricas de Observabilidad Avanzada (Fase 15)
        gauge!("distributed_nodes_active").set(active_nodes as f64);

        // Shard Skew Ratio: detecta distribución desequilibrada entre nodos
        if !per_node_counts.is_empty() {
            let max_count = *per_node_counts.iter().max().unwrap_or(&1) as f64;
            let min_count = *per_node_counts.iter().min().unwrap_or(&0) as f64;
            let skew = if max_count > 0.0 { (max_count - min_count) / max_count } else { 0.0 };
            gauge!("shard_skew_ratio").set(skew);
            info!("Shard skew ratio: {:.2} ({}/{} nodos activos)", skew, active_nodes, total_nodes);
        }

        // Partial Failure Guard: si no hubo ningún nodo activo, fallback local
        if active_nodes == 0 {
            warn!("Todos los nodos distribuidos fallaron – sirviendo con local executor (fallback)");
            counter!("distributed_full_fallback_total").increment(1);
            use crate::domain::ports::VectorIndex;
            let ids = self.local_executor.search(query_vec, limit)?;
            let mut fallback = Vec::new();
            for id in ids {
                if let Ok((job_id, chunk_index)) = self.local_executor.get_chunk_info(id) {
                    fallback.push(SearchResult { job_id, chunk_index, title: None, thumbnail: None, chunk_text: "".to_string(), similarity_score: 0.95 });
                }
            }
            return Ok(fallback);
        }

        // Reduce Top-K Global ordenando por score descendente
        aggregated_results.sort_by(|a, b| b.similarity_score.partial_cmp(&a.similarity_score).unwrap_or(std::cmp::Ordering::Equal));
        aggregated_results.truncate(limit);

        histogram!("distributed_query_latency_seconds").record(start_time.elapsed().as_secs_f64());
        Ok(aggregated_results)
    }

    pub fn save_index(&self, path: &str) -> Result<(), String> {
        use crate::domain::ports::VectorIndex;
        self.local_executor.snapshot_index(path)
    }

    pub fn load_index(&self, path: &str) -> Result<(), String> {
        use crate::domain::ports::VectorIndex;
        self.local_executor.load_index(path)
    }
}
