use crate::domain::models::SearchResult;
use sha2::{Sha256, Digest};
use metrics::counter;
use tracing::{info, warn, instrument};

// ========================================================================
// INFRASTRUCTURE: Semantic Cache (Redis)
// Propósito: Interceptar consultas idénticas (mismo vector + limite) 
// para servir los Top-K pre-calculados al instante, aliviando CPU y GPU.
// ========================================================================

pub struct SemanticCache {
    client: Option<redis::Client>,
    ttl_seconds: usize,
}

impl SemanticCache {
    pub fn new(redis_url: &str, ttl_seconds: usize) -> Self {
        let client = match redis::Client::open(redis_url) {
            Ok(c) => Some(c),
            Err(e) => {
                warn!("SemanticCache: Fallo crítico al conectar a Redis '{}'. Cache deshabilitado. Error: {}", redis_url, e);
                None
            }
        };

        Self {
            client,
            ttl_seconds,
        }
    }

    // Calcula el Hash de llave compuesto: embedding + parámetros
    fn generate_cache_key(&self, query_embedding: &[f32], limit: usize) -> String {
        let mut hasher = Sha256::new();
        // Hashear los bits crudos del Vector f32 (Little Endian asumiendo X86_64)
        for val in query_embedding {
            hasher.update(val.to_ne_bytes());
        }
        hasher.update(limit.to_ne_bytes());
        
        let result = hasher.finalize();
        format!("pulsar:cache:{:x}", result)
    }

    #[instrument(skip(self, query_embedding))]
    pub async fn lookup(&self, query_embedding: &[f32], limit: usize) -> Option<Vec<SearchResult>> {
        if self.client.is_none() {
            return None;
        }

        let _start_time = std::time::Instant::now();
        let key = self.generate_cache_key(query_embedding, limit);

        if let Ok(mut con) = self.client.clone().unwrap().get_multiplexed_async_connection().await {
            let res: redis::RedisResult<String> = redis::AsyncCommands::get(&mut con, &key).await;
            if let Ok(cached_json) = res {
                if let Ok(results) = serde_json::from_str::<Vec<SearchResult>>(&cached_json) {
                    counter!("semantic_cache_hits_total").increment(1);
                    info!("SemanticCache hit para clave cruzada de métricas: {}", key);
                    
                    // Solo metricaremos latencia si tenemos la feature redis real prendida
                    return Some(results);
                }
            }
        }
        
        counter!("semantic_cache_misses_total").increment(1);
        None
    }

    #[instrument(skip(self, query_embedding, results))]
    pub async fn set(&self, query_embedding: &[f32], limit: usize, results: &Vec<SearchResult>) {
        if self.client.is_none() {
            return;
        }

        let key = self.generate_cache_key(query_embedding, limit);
        if let Ok(json) = serde_json::to_string(results) {
            if let Ok(mut con) = self.client.clone().unwrap().get_multiplexed_async_connection().await {
                let _: redis::RedisResult<()> = redis::AsyncCommands::set_ex(&mut con, &key, json, self.ttl_seconds as u64).await;
                info!("SemanticCache almacenó nuevos resultados para {}", key);
            }
        }
    }
}
