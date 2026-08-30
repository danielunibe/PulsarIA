use metrics::{counter, gauge, histogram};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, instrument};

// ========================================================================
// PHASE 29: Query Analytics
// Registra logs de queries, click feedback y ranking feedback.
// Fundamento del learning-to-rank (Fase 30).
//
// Cada query captura:
//   - query text + embedding hash
//   - plan elegido por QueryPlanner
//   - resultados devueltos
//   - latencia de respuesta
//   - posición click del usuario (feedback)
// ========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryLog {
    pub query_id: String,
    pub tenant_id: String,
    pub query_text: String,
    pub query_plan: String,
    pub result_job_ids: Vec<i64>,
    pub latency_ms: f64,
    pub timestamp: u64,
    pub clicked_job_id: Option<i64>,
    pub click_position: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClickFeedback {
    pub query_id: String,
    pub tenant_id: String,
    pub clicked_job_id: i64,
    pub click_position: usize,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RankingFeedback {
    pub query_id: String,
    pub tenant_id: String,
    pub relevant_job_ids: Vec<i64>, // Marcados como relevantes por el usuario
    pub irrelevant_job_ids: Vec<i64>, // Marcados como irrelevantes
    pub timestamp: u64,
}

/// Store en memoria circular del historial de queries
/// En producción real: SQLite / ClickHouse / BigQuery
pub struct QueryAnalyticsStore {
    logs: Mutex<Vec<QueryLog>>,
    max_capacity: usize,
}

impl QueryAnalyticsStore {
    pub fn new(max_capacity: usize) -> Self {
        info!(
            "QueryAnalyticsStore iniciado: max {} queries en buffer",
            max_capacity
        );
        Self {
            logs: Mutex::new(Vec::with_capacity(max_capacity)),
            max_capacity,
        }
    }

    #[instrument(skip(self))]
    pub fn log_query(&self, log: QueryLog) {
        counter!("query_analytics_total", "plan" => log.query_plan.clone()).increment(1);
        histogram!("query_analytics_latency_ms").record(log.latency_ms);

        let Ok(mut logs) = self.logs.lock() else {
            return;
        };

        // Eviction circular: si supera capacidad, eliminar el más antiguo
        if logs.len() >= self.max_capacity {
            logs.remove(0);
            counter!("query_analytics_evictions_total").increment(1);
        }
        logs.push(log);
        gauge!("query_analytics_buffer_size").set(logs.len() as f64);
    }

    /// Registra un click del usuario en un resultado
    pub fn record_click(&self, feedback: ClickFeedback) {
        counter!("click_feedback_total").increment(1);
        histogram!("click_position_histogram").record(feedback.click_position as f64);
        info!(
            "Click feedback: query={} → job={} en posición {}",
            feedback.query_id, feedback.clicked_job_id, feedback.click_position
        );

        // Actualizar el log con el feedback de click
        let Ok(mut logs) = self.logs.lock() else {
            return;
        };
        if let Some(log) = logs.iter_mut().find(|l| l.query_id == feedback.query_id) {
            log.clicked_job_id = Some(feedback.clicked_job_id);
            log.click_position = Some(feedback.click_position);
        }
    }

    /// Exporta todos los logs para entrenamiento de modelos (Fase 30)
    pub fn export_training_data(&self) -> Vec<QueryLog> {
        let Ok(logs) = self.logs.lock() else {
            return vec![];
        };
        let with_feedback: Vec<QueryLog> = logs
            .iter()
            .filter(|l| l.clicked_job_id.is_some())
            .cloned()
            .collect();

        info!(
            "Exportando {} logs con feedback para entrenamiento",
            with_feedback.len()
        );
        with_feedback
    }

    /// MRR implícito calculado sobre los clicks: mide calidad real del ranking
    pub fn compute_implicit_mrr(&self) -> f64 {
        let Ok(logs) = self.logs.lock() else {
            return 0.0;
        };
        let clicks_with_position: Vec<usize> =
            logs.iter().filter_map(|l| l.click_position).collect();

        if clicks_with_position.is_empty() {
            return 0.0;
        }

        let mrr = clicks_with_position
            .iter()
            .map(|&pos| 1.0 / (pos + 1) as f64)
            .sum::<f64>()
            / clicks_with_position.len() as f64;

        gauge!("implicit_mrr").set(mrr);
        info!("Implicit MRR calculado: {:.4}", mrr);
        mrr
    }
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Genera un query_id único basándose en la query text + timestamp
pub fn generate_query_id(query: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    query.hash(&mut hasher);
    now_unix().hash(&mut hasher);
    format!("qry_{:016x}", hasher.finish())
}
