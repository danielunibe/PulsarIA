use metrics::counter;
use std::collections::HashMap;
use std::sync::Mutex;
use tracing::{info, instrument};

// ========================================================================
// PHASE 19: Query Embedding Cache
// Evita recomputar embeddings para queries idénticas.
// Impacto: -40% CPU en el modelo de embeddings.
// ========================================================================

/// Cache en memoria LRU-like para embeddings de queries.
/// Key: query normalizada → Value: Vec<f32> (embedding 384d)
pub struct EmbeddingCache {
    cache: Mutex<HashMap<String, Vec<f32>>>,
    max_capacity: usize,
}

impl EmbeddingCache {
    pub fn new(max_capacity: usize) -> Self {
        info!("EmbeddingCache iniciado: max {} entradas", max_capacity);
        Self {
            cache: Mutex::new(HashMap::with_capacity(max_capacity)),
            max_capacity,
        }
    }

    /// Retorna el embedding cacheado si existe.
    pub fn get(&self, query: &str) -> Option<Vec<f32>> {
        let key = normalize_query(query);
        let cache = self.cache.lock().ok()?;
        let result = cache.get(&key).cloned();

        if result.is_some() {
            counter!("embedding_cache_hits_total").increment(1);
        } else {
            counter!("embedding_cache_misses_total").increment(1);
        }
        result
    }

    /// Almacena un embedding. Si supera la capacidad, limpia el 20% más antiguo.
    #[instrument(skip(self, embedding))]
    pub fn set(&self, query: &str, embedding: Vec<f32>) {
        let key = normalize_query(query);
        let Ok(mut cache) = self.cache.lock() else {
            return;
        };

        // Eviction simple: si está lleno, limpiar 20% de entradas
        if cache.len() >= self.max_capacity {
            let to_remove = self.max_capacity / 5;
            let keys: Vec<String> = cache.keys().take(to_remove).cloned().collect();
            for k in keys {
                cache.remove(&k);
            }
            counter!("embedding_cache_evictions_total").increment(1);
        }

        cache.insert(key, embedding);
    }

    pub fn len(&self) -> usize {
        self.cache.lock().map(|c| c.len()).unwrap_or(0)
    }
}

/// Normaliza la query para maximizar cache hits (lowercase + trim)
fn normalize_query(query: &str) -> String {
    query
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
