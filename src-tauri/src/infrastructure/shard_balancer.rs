use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tracing::{info, warn};
use metrics::gauge;

// ========================================================================
// PHASE 20: Adaptive Shard Balancing
// Detecta el shard_skew_ratio y redistribuye la carga dinámicamente.
// Evita: hotspot collapse en shards con >70% de las queries.
//
// Arquitectura:
//   ShardBalancer observa las métricas de carga por shard.
//   Si skew > threshold, marca el shard sobrecar gado como "saturable"
//   y redirige nuevas queries al shard menos cargado.
// ========================================================================

pub struct ShardBalancer {
    shard_count: usize,
    /// Contadores de queries por shard (para medir skew en tiempo real)
    query_counters: Vec<Arc<AtomicUsize>>,
    /// Umbral para activar rebalanceo (0.4 = 40% diferencia entre max y min)
    skew_threshold: f64,
}

impl ShardBalancer {
    pub fn new(shard_count: usize, skew_threshold: f64) -> Self {
        let query_counters = (0..shard_count)
            .map(|_| Arc::new(AtomicUsize::new(0)))
            .collect();

        Self { shard_count, query_counters, skew_threshold }
    }

    /// Registra una query procesada por el shard especificado
    pub fn record_query(&self, shard_idx: usize) {
        if shard_idx < self.shard_count {
            self.query_counters[shard_idx].fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Calcula el shard óptimo para la próxima query (el menos cargado)
    pub fn optimal_shard(&self, default_shard: usize) -> usize {
        let counts: Vec<usize> = self.query_counters.iter()
            .map(|c| c.load(Ordering::Relaxed))
            .collect();

        let total: usize = counts.iter().sum();
        if total == 0 { return default_shard; }

        let max_load = *counts.iter().max().unwrap_or(&1) as f64;
        let min_load = *counts.iter().min().unwrap_or(&0) as f64;
        let skew = if max_load > 0.0 { (max_load - min_load) / max_load } else { 0.0 };

        // Emitir skew actualizado
        gauge!("shard_skew_ratio").set(skew);

        if skew > self.skew_threshold {
            // Rebalancear: elegir el shard con menos carga
            let optimal = counts.iter().enumerate()
                .min_by_key(|(_, &c)| c)
                .map(|(i, _)| i)
                .unwrap_or(default_shard);

            if optimal != default_shard {
                warn!("Shard imbalance detectado (skew={:.2}): redirigiendo de shard {} → shard {}", 
                      skew, default_shard, optimal);
            }
            optimal
        } else {
            default_shard
        }
    }

    /// Emite métricas de distribución de carga por shard hacia Prometheus
    pub fn emit_load_metrics(&self) {
        for (i, counter) in self.query_counters.iter().enumerate() {
            let load = counter.load(Ordering::Relaxed) as f64;
            gauge!("shard_query_load", "shard" => i.to_string()).set(load);
        }
        info!("Shard load metrics emitidas para {} shards", self.shard_count);
    }
}
