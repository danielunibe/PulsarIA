use crate::domain::models::SearchResult;
use metrics::{gauge, histogram};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

// ========================================================================
// PHASE 23: Dataset Recall Benchmark
// Evalúa científicamente la calidad del motor de búsqueda.
//
// Métricas estándar de Information Retrieval:
//   - recall@k:  fracción de documentos relevantes recuperados en top-k
//   - MRR:       posición promedio del primer resultado relevante
//   - nDCG:      relevancia ponderada por posición logarítmica
//
// Datasets compatibles: MS MARCO, BEIR, NQ, TriviaQA
// ========================================================================

/// Un par query → IDs de documentos relevantes (ground truth)
#[derive(Debug, Serialize, Deserialize)]
pub struct BenchmarkQuery {
    pub query: String,
    pub relevant_doc_ids: Vec<i64>,
}

/// Resultado de una ejecución de benchmark
#[derive(Debug, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub total_queries: usize,
    pub recall_at_10: f64,
    pub recall_at_50: f64,
    pub mean_reciprocal_rank: f64,
    pub ndcg_at_10: f64,
    pub avg_latency_ms: f64,
}

/// Ejecuta el benchmark sobre un conjunto de queries con ground truth.
/// El `search_fn` es una clausura async que llama al SearchService real.
pub async fn run_recall_benchmark<F, Fut>(
    queries: Vec<BenchmarkQuery>,
    search_fn: F,
    _k: usize,
) -> BenchmarkResult
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<Vec<SearchResult>, String>>,
{
    let start_time = std::time::Instant::now();
    let total = queries.len();

    let mut recall_at_10_sum = 0.0_f64;
    let mut recall_at_50_sum = 0.0_f64;
    let mut mrr_sum = 0.0_f64;
    let mut ndcg_sum = 0.0_f64;
    let mut total_latency_ms = 0.0_f64;

    for bq in &queries {
        let query_start = std::time::Instant::now();

        let results = match search_fn(bq.query.clone()).await {
            Ok(r) => r,
            Err(e) => {
                warn!("Benchmark query fallida: {} — {}", bq.query, e);
                continue;
            }
        };

        let latency_ms = query_start.elapsed().as_secs_f64() * 1000.0;
        total_latency_ms += latency_ms;

        let result_ids: Vec<i64> = results.iter().map(|r| r.job_id).collect();

        // Recall@10: cuántos relevantes aparecen en los primeros 10
        let top_10: Vec<i64> = result_ids.iter().take(10).cloned().collect();
        let hits_10 = top_10
            .iter()
            .filter(|id| bq.relevant_doc_ids.contains(id))
            .count();
        recall_at_10_sum += hits_10 as f64 / bq.relevant_doc_ids.len().max(1) as f64;

        // Recall@50
        let top_50: Vec<i64> = result_ids.iter().take(50).cloned().collect();
        let hits_50 = top_50
            .iter()
            .filter(|id| bq.relevant_doc_ids.contains(id))
            .count();
        recall_at_50_sum += hits_50 as f64 / bq.relevant_doc_ids.len().max(1) as f64;

        // MRR: posición del primer resultado relevante
        if let Some(pos) = result_ids
            .iter()
            .position(|id| bq.relevant_doc_ids.contains(id))
        {
            mrr_sum += 1.0 / (pos + 1) as f64;
        }

        // nDCG@10: Normalized Discounted Cumulative Gain
        let dcg: f64 = top_10
            .iter()
            .enumerate()
            .map(|(pos, id)| {
                if bq.relevant_doc_ids.contains(id) {
                    1.0 / (pos as f64 + 2.0).log2() // pos+2 porque log2(1) = 0
                } else {
                    0.0
                }
            })
            .sum();

        // IDCG: DCG ideal (todos los relevantes al inicio)
        let ideal_count = bq.relevant_doc_ids.len().min(10);
        let idcg: f64 = (0..ideal_count)
            .map(|pos| 1.0 / (pos as f64 + 2.0).log2())
            .sum();
        ndcg_sum += if idcg > 0.0 { dcg / idcg } else { 0.0 };
    }

    let n = total.max(1) as f64;
    let result = BenchmarkResult {
        total_queries: total,
        recall_at_10: recall_at_10_sum / n,
        recall_at_50: recall_at_50_sum / n,
        mean_reciprocal_rank: mrr_sum / n,
        ndcg_at_10: ndcg_sum / n,
        avg_latency_ms: total_latency_ms / n,
    };

    // Emitir métricas de calidad a Prometheus
    gauge!("retrieval_recall_at_10").set(result.recall_at_10);
    gauge!("retrieval_recall_at_50").set(result.recall_at_50);
    gauge!("retrieval_mrr").set(result.mean_reciprocal_rank);
    gauge!("retrieval_ndcg_at_10").set(result.ndcg_at_10);
    histogram!("benchmark_duration_seconds").record(start_time.elapsed().as_secs_f64());

    info!(
        "Benchmark completado: recall@10={:.3}, recall@50={:.3}, MRR={:.3}, nDCG={:.3}, avg_latency={:.1}ms",
        result.recall_at_10, result.recall_at_50,
        result.mean_reciprocal_rank, result.ndcg_at_10,
        result.avg_latency_ms
    );

    result
}
