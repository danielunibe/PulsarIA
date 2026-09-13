use crate::domain::models::SearchResult;
use metrics::{counter, histogram};
use std::collections::HashMap;
use tracing::{info, instrument};

// ========================================================================
// PHASE 18: Hybrid Search — BM25 + Vector (HNSW)
// El recall real de un motor semántico de producción requiere combinar:
//   - BM25: búsqueda textual exacta (keywords)
//   - HNSW: búsqueda semántica vectorial
// Mejora el recall entre +15% y +40%.
// ========================================================================

/// Resultado intermedio de BM25 con puntuación textual
#[derive(Debug, Clone)]
#[allow(dead_code)]
struct BM25Hit {
    job_id: i64,
    chunk_index: i64,
    score: f64,
}

/// Motor BM25 en memoria (Okapi BM25)
/// En producción real: tantivy, meilisearch, o Elasticsearch.
pub struct BM25Engine {
    /// Índice invertido: term → Vec<(job_id, chunk_index, freq)>
    inverted_index: HashMap<String, Vec<(i64, i64, usize)>>,
    /// Longitud promedio de documentos
    avg_doc_len: f64,
    doc_count: usize,
    k1: f64,
    b: f64,
}

impl BM25Engine {
    pub fn new() -> Self {
        Self {
            inverted_index: HashMap::new(),
            avg_doc_len: 0.0,
            doc_count: 0,
            k1: 1.5,
            b: 0.75,
        }
    }

    /// Indexa un chunk de texto en el índice BM25 invertido
    pub fn index_chunk(&mut self, job_id: i64, chunk_index: i64, text: &str) {
        let tokens = tokenize(text);
        let doc_len = tokens.len();

        // Actualizar avg_doc_len
        self.doc_count += 1;
        self.avg_doc_len = (self.avg_doc_len * (self.doc_count - 1) as f64 + doc_len as f64)
            / self.doc_count as f64;

        // Contar frecuencia de cada término en este documento
        let mut term_freq: HashMap<&str, usize> = HashMap::new();
        for token in &tokens {
            *term_freq.entry(token.as_str()).or_insert(0) += 1;
        }

        for (term, freq) in term_freq {
            self.inverted_index
                .entry(term.to_string())
                .or_default()
                .push((job_id, chunk_index, freq));
        }
    }

    /// Busca usando Okapi BM25 y retorna los Top-K hits
    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchResult> {
        let query_tokens = tokenize(query);
        let mut scores: HashMap<(i64, i64), f64> = HashMap::new();

        for token in &query_tokens {
            let Some(postings) = self.inverted_index.get(token) else {
                continue;
            };

            // IDF parcial con el nº de documentos que contienen este término
            let df = postings.len() as f64;
            let idf = ((self.doc_count as f64 - df + 0.5) / (df + 0.5) + 1.0).ln();

            for &(job_id, chunk_index, tf) in postings {
                // Aquí usaríamos doc_len real; como simplificación usamos avg
                let tf_norm =
                    (tf as f64 * (self.k1 + 1.0)) / (tf as f64 + self.k1 * (1.0 - self.b + self.b));
                *scores.entry((job_id, chunk_index)).or_insert(0.0) += idf * tf_norm;
            }
        }

        // Convertir a SearchResult y ordenar
        let mut hits: Vec<SearchResult> = scores
            .into_iter()
            .map(|((job_id, chunk_index), score)| SearchResult {
                job_id,
                chunk_index,
                title: None,
                thumbnail: None,
                chunk_text: String::new(),
                similarity_score: score as f32,
            })
            .collect();

        hits.sort_by(|a, b| {
            b.similarity_score
                .partial_cmp(&a.similarity_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        hits.truncate(limit);
        hits
    }
}

impl Default for BM25Engine {
    fn default() -> Self {
        Self::new()
    }
}

/// Fusión de resultados BM25 + HNSW usando Reciprocal Rank Fusion (RRF)
/// RRF es el estándar de facto para fusión de rankings heterogéneos.
#[instrument(skip(bm25_hits, vector_hits))]
pub fn reciprocal_rank_fusion(
    bm25_hits: Vec<SearchResult>,
    vector_hits: Vec<SearchResult>,
    limit: usize,
    k: f32, // Constante de suavizado, típicamente 60.0
) -> Vec<SearchResult> {
    let start = std::time::Instant::now();
    let mut rrf_scores: HashMap<(i64, i64), f32> = HashMap::new();

    // Puntuación RRF por ranking BM25
    for (rank, result) in bm25_hits.iter().enumerate() {
        let key = (result.job_id, result.chunk_index);
        *rrf_scores.entry(key).or_insert(0.0) += 1.0 / (k + rank as f32 + 1.0);
    }

    // Puntuación RRF por ranking Vector
    for (rank, result) in vector_hits.iter().enumerate() {
        let key = (result.job_id, result.chunk_index);
        *rrf_scores.entry(key).or_insert(0.0) += 1.0 / (k + rank as f32 + 1.0);
    }

    // Materializar en SearchResult ordenado por RRF score
    let mut all_results: Vec<SearchResult> = rrf_scores
        .into_iter()
        .map(|((job_id, chunk_index), score)| SearchResult {
            job_id,
            chunk_index,
            title: None,
            thumbnail: None,
            chunk_text: String::new(),
            similarity_score: score,
        })
        .collect();

    all_results.sort_by(|a, b| {
        b.similarity_score
            .partial_cmp(&a.similarity_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    all_results.truncate(limit);

    histogram!("hybrid_search_latency_seconds").record(start.elapsed().as_secs_f64());
    counter!("hybrid_search_total").increment(1);
    info!(
        "Hybrid RRF fusion: {} BM25 + {} vector → {} finales",
        bm25_hits.len(),
        vector_hits.len(),
        all_results.len()
    );
    all_results
}

/// Tokenizador simple: lowercase + split por no-alfanumérico
fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.len() > 2) // Eliminar stop words cortas
        .map(String::from)
        .collect()
}
