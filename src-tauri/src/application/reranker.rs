use crate::domain::models::SearchResult;
use metrics::{counter, histogram};
use tracing::{info, instrument, warn};

// ========================================================================
// APPLICATION: Semantic Reranker Port & Adapter
// Propósito: Toma un conjunto de candidatos rápidos (HNSW Top-50) y los
// re-evalúa uno a uno contra el Query original usando un modelo Cross-Encoder,
// el cual es computacionalmente caro pero semánticamente muy preciso.
// ========================================================================

pub trait Reranker: Send + Sync {
    fn rerank(&self, query: &str, candidates: Vec<SearchResult>) -> Vec<SearchResult>;
}

pub struct CrossEncoderReranker {
    enabled: bool,
    // Aquí iría el cliente HTTP para el microservicio Python/vLLM o el ORT Session
    // endpoint_url: String,
}

impl CrossEncoderReranker {
    pub fn new(enabled: bool) -> Self {
        Self { enabled }
    }
}

impl Reranker for CrossEncoderReranker {
    #[instrument(skip(self, candidates))]
    fn rerank(&self, query: &str, mut candidates: Vec<SearchResult>) -> Vec<SearchResult> {
        if !self.enabled || candidates.is_empty() {
            return candidates; // Passthrough si está apagado
        }

        let start_time = std::time::Instant::now();
        counter!("reranker_calls_total").increment(1);

        info!(
            "Reranking {} candidates for query '{}'",
            candidates.len(),
            query
        );

        // No existe todavía un modelo cross-encoder conectado. Nunca debemos
        // modificar artificialmente la relevancia; conservamos los scores HNSW.
        warn!("Reranker enabled but no cross-encoder is configured; preserving vector scores");
        candidates.sort_by(|a, b| {
            b.similarity_score
                .partial_cmp(&a.similarity_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        histogram!("reranker_latency_seconds").record(start_time.elapsed().as_secs_f64());
        candidates
    }
}

pub struct DummyReranker;
impl Reranker for DummyReranker {
    fn rerank(&self, _query: &str, candidates: Vec<SearchResult>) -> Vec<SearchResult> {
        candidates
    }
}
