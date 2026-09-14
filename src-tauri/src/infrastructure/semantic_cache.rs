use crate::domain::models::SearchResult;
use metrics::counter;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tracing::{info, instrument};

// Bounded in-memory cache for repeated semantic queries. Desktop installs do
// not require a separately managed Redis process.
const DEFAULT_MAX_ENTRIES: usize = 256;

struct CacheEntry {
    results: Vec<SearchResult>,
    expires_at: Instant,
    last_used: u64,
}

pub struct SemanticCache {
    entries: Mutex<HashMap<String, CacheEntry>>,
    max_entries: usize,
    ttl: Duration,
    access_counter: std::sync::atomic::AtomicU64,
}

impl SemanticCache {
    pub fn new(max_entries: usize, ttl_seconds: usize) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            max_entries: max_entries.max(1),
            ttl: Duration::from_secs(ttl_seconds.max(1) as u64),
            access_counter: std::sync::atomic::AtomicU64::new(0),
        }
    }

    pub fn default_for_desktop(ttl_seconds: usize) -> Self {
        Self::new(DEFAULT_MAX_ENTRIES, ttl_seconds)
    }

    fn generate_cache_key(query_embedding: &[f32], limit: usize, config_version: u64) -> String {
        let mut hasher = Sha256::new();
        for value in query_embedding {
            hasher.update(value.to_ne_bytes());
        }
        hasher.update(limit.to_ne_bytes());
        hasher.update(config_version.to_ne_bytes());
        format!("pulsar:cache:{:x}", hasher.finalize())
    }

    fn lock_entries(&self) -> Option<MutexGuard<'_, HashMap<String, CacheEntry>>> {
        self.entries.lock().ok()
    }

    fn remove_expired(entries: &mut HashMap<String, CacheEntry>, now: Instant) {
        entries.retain(|_, entry| entry.expires_at > now);
    }

    #[instrument(skip(self, query_embedding))]
    pub fn lookup(
        &self,
        query_embedding: &[f32],
        limit: usize,
        config_version: u64,
    ) -> Option<Vec<SearchResult>> {
        let key = Self::generate_cache_key(query_embedding, limit, config_version);
        let now = Instant::now();
        let Some(mut entries) = self.lock_entries() else {
            counter!("semantic_cache_misses_total").increment(1);
            return None;
        };
        Self::remove_expired(&mut entries, now);

        if let Some(entry) = entries.get_mut(&key) {
            entry.last_used = self
                .access_counter
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            counter!("semantic_cache_hits_total").increment(1);
            info!("SemanticCache hit para clave {}", key);
            return Some(entry.results.clone());
        }

        counter!("semantic_cache_misses_total").increment(1);
        None
    }

    #[instrument(skip(self, query_embedding, results))]
    pub fn set(
        &self,
        query_embedding: &[f32],
        limit: usize,
        config_version: u64,
        results: &[SearchResult],
    ) {
        let key = Self::generate_cache_key(query_embedding, limit, config_version);
        let Some(mut entries) = self.lock_entries() else {
            return;
        };
        Self::remove_expired(&mut entries, Instant::now());

        if entries.len() >= self.max_entries && !entries.contains_key(&key) {
            if let Some(oldest_key) = entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(entry_key, _)| entry_key.clone())
            {
                entries.remove(&oldest_key);
            }
        }

        let last_used = self
            .access_counter
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        entries.insert(
            key.clone(),
            CacheEntry {
                results: results.to_vec(),
                expires_at: Instant::now() + self.ttl,
                last_used,
            },
        );
        info!("SemanticCache almacenó resultados para {}", key);
    }
}

#[cfg(test)]
mod tests {
    use super::SemanticCache;
    use crate::domain::models::SearchResult;

    fn result(job_id: i64) -> SearchResult {
        SearchResult {
            job_id,
            title: None,
            thumbnail: None,
            chunk_text: "cached".into(),
            chunk_index: 0,
            similarity_score: 1.0,
        }
    }

    #[test]
    fn caches_results_without_external_services() {
        let cache = SemanticCache::new(2, 60);
        let vector = [0.5_f32, 0.25_f32];
        assert!(cache.lookup(&vector, 5, 0).is_none());
        cache.set(&vector, 5, 0, &[result(7)]);
        assert_eq!(cache.lookup(&vector, 5, 0).unwrap()[0].job_id, 7);
        assert!(cache.lookup(&vector, 5, 1).is_none());
    }

    #[test]
    fn evicts_least_recently_used_entry() {
        let cache = SemanticCache::new(1, 60);
        let first = [1.0_f32];
        let second = [2.0_f32];
        cache.set(&first, 5, 0, &[result(1)]);
        cache.set(&second, 5, 0, &[result(2)]);
        assert!(cache.lookup(&first, 5, 0).is_none());
        assert_eq!(cache.lookup(&second, 5, 0).unwrap()[0].job_id, 2);
    }
}
