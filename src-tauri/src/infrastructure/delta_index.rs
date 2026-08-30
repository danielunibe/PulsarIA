use metrics::{counter, gauge, histogram};
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, warn};

// ========================================================================
// PHASE 25: Incremental Index Rebuild (Delta Indexing)
// Reduce rebuild time de horas → minutos procesando solo vectores nuevos.
//
// Flujo:
//   new vectors → delta buffer
//       │
//   periódicamente → merge con main index
//       │
//   atomic swap
// ========================================================================

/// Un vector pendiente de indexar en el delta buffer
#[derive(Debug, Clone)]
pub struct DeltaEntry {
    pub internal_id: usize,
    pub job_id: i64,
    pub chunk_index: i64,
    pub embedding: Vec<f32>,
}

/// Buffer de escritura acumulativo (write-ahead log simplificado)
pub struct DeltaIndexBuffer {
    pending: Mutex<VecDeque<DeltaEntry>>,
    merge_threshold: usize,
    total_merged: std::sync::atomic::AtomicUsize,
}

impl DeltaIndexBuffer {
    pub fn new(merge_threshold: usize) -> Self {
        info!(
            "DeltaIndexBuffer creado: merge_threshold={}",
            merge_threshold
        );
        Self {
            pending: Mutex::new(VecDeque::new()),
            merge_threshold,
            total_merged: std::sync::atomic::AtomicUsize::new(0),
        }
    }

    /// Añade un nuevo vector al buffer delta
    pub async fn push(&self, entry: DeltaEntry) {
        let mut pending = self.pending.lock().await;
        pending.push_back(entry);
        gauge!("delta_buffer_size").set(pending.len() as f64);
    }

    /// Retorna true si el buffer superó el umbral y necesita merge
    pub async fn needs_merge(&self) -> bool {
        let pending = self.pending.lock().await;
        pending.len() >= self.merge_threshold
    }

    /// Extrae todos los entries pendientes para hacer merge con el índice principal
    pub async fn drain(&self) -> Vec<DeltaEntry> {
        let mut pending = self.pending.lock().await;
        let entries: Vec<DeltaEntry> = pending.drain(..).collect();

        let merged_count = entries.len();
        self.total_merged
            .fetch_add(merged_count, std::sync::atomic::Ordering::Relaxed);
        gauge!("delta_buffer_size").set(0.0);
        counter!("delta_merges_total").increment(1);

        info!(
            "Delta drain: {} vectores enviados a merge (total histórico: {})",
            merged_count,
            self.total_merged.load(std::sync::atomic::Ordering::Relaxed)
        );
        entries
    }
}

/// Orquestador del ciclo de delta indexing
pub struct DeltaIndexOrchestrator {
    buffer: Arc<DeltaIndexBuffer>,
}

impl DeltaIndexOrchestrator {
    pub fn new(buffer: Arc<DeltaIndexBuffer>) -> Self {
        Self { buffer }
    }

    /// Loop de merge automático. Ejecutar en tokio::spawn.
    /// Cuando el buffer supera el threshold, hace merge al índice principal.
    pub async fn run_merge_loop(&self, vector_index: Arc<dyn crate::domain::ports::VectorIndex>) {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

            if !self.buffer.needs_merge().await {
                continue;
            }

            let start = std::time::Instant::now();
            let entries = self.buffer.drain().await;

            let count = entries.len();
            let mut failed = 0usize;

            for entry in entries {
                if let Err(e) = vector_index.insert(
                    entry.internal_id,
                    entry.job_id,
                    entry.chunk_index,
                    &entry.embedding,
                ) {
                    warn!("Delta merge insert fallido job={}: {}", entry.job_id, e);
                    failed += 1;
                }
            }

            let elapsed = start.elapsed().as_secs_f64();
            histogram!("delta_merge_duration_seconds").record(elapsed);

            info!(
                "Delta merge completado: {}/{} vectores en {:.2}s",
                count - failed,
                count,
                elapsed
            );
        }
    }
}
