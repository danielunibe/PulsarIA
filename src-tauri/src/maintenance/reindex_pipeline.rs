use crate::application::queue_service::QueueService;
use crate::application::search_service::SearchService;
use metrics::{gauge, histogram};
use std::sync::Arc;
use tracing::{info, instrument};

// ========================================================================
// PHASE 14: Reindex Pipeline (Compactación / Nightly Rebuilds)
// Objetivo: Eliminar fragmentación HNSW (Tombstones de deletes) reconstruyendo
// una instancia limpia atómicamente y swappeando la partición de disco.
// ========================================================================

pub struct ReindexPipeline {
    search_service: Arc<SearchService>,
    queue_service: Arc<QueueService>,
}

impl ReindexPipeline {
    pub fn new(search_service: Arc<SearchService>, queue_service: Arc<QueueService>) -> Self {
        Self {
            search_service,
            queue_service,
        }
    }

    #[instrument(skip(self))]
    pub async fn run_nightly_rebuild(&self) {
        let start_time = std::time::Instant::now();
        info!("INICIANDO PIPELINE DE REINDEXACIÓN NOCTURNA");
        match self
            .queue_service
            .rebuild_index_from_persisted_rows(&self.search_service)
            .await
        {
            Ok(Some(count)) => {
                histogram!("index_rebuild_duration_seconds")
                    .record(start_time.elapsed().as_secs_f64());
                gauge!("index_compaction_ratio").set(1.0);
                info!("Rebuild nocturno del índice completado: {} vectores", count);
            }
            Ok(None) => info!("Reindexación nocturna pospuesta: hay trabajos activos"),
            Err(error) => {
                tracing::error!("Rebuild nocturno del índice falló: {}", error);
            }
        }
    }
}
