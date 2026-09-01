use crate::application::search_service::SearchService;
use crate::domain::ports::JobRepository;
use metrics::{counter, histogram};
use std::sync::Arc;
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{error, info};

pub async fn start_maintenance_scheduler(
    search_service: Arc<SearchService>,
    job_repo: Arc<dyn JobRepository>,
) -> Result<(), String> {
    let sched = JobScheduler::new()
        .await
        .map_err(|e| format!("Failed to initialize scheduler: {}", e))?;

    // 1. Snapshot del índice (cada 10 minutos)
    // 0 0/10 * * * * (At every 10th minute)
    let search_clone = search_service.clone();
    sched
        .add(
            Job::new_async("0 0/10 * * * *", move |_uuid, _l| {
                let search = search_clone.clone();
                Box::pin(async move {
                    let start = std::time::Instant::now();
                    info!("Ejecutando tarea programada: snapshot_vector_index");
                    counter!("scheduler_jobs_total").increment(1);

                    if let Err(e) = search.snapshot_index() {
                        error!("Error en snapshot_vector_index: {}", e);
                        counter!("scheduler_job_failures").increment(1);
                    }

                    histogram!("scheduler_job_latency_seconds")
                        .record(start.elapsed().as_secs_f64());
                })
            })
            .map_err(|e| format!("Failed to create snapshot job: {}", e))?,
        )
        .await
        .map_err(|e| e.to_string())?;

    // 2. Limpieza de jobs huérfanos (cada 30 min)
    let stale_job_repo = job_repo.clone();
    sched
        .add(
            Job::new_async("0 15/30 * * * *", move |_uuid, _l| {
                let repo = stale_job_repo.clone();
                Box::pin(async move {
                    let start = std::time::Instant::now();
                    info!("Ejecutando tarea programada: cleanup_orphan_jobs");
                    counter!("scheduler_jobs_total").increment(1);

                    match repo.get_connection() {
                        Ok(connection) => match connection.lock() {
                            Ok(connection) => {
                                match connection.execute(
                                    "UPDATE jobs
                                     SET status = 'error', progress = 0,
                                         error_message = 'Job abandoned after exceeding the processing timeout'
                                     WHERE status IN ('queued', 'processing', 'downloading', 'transcribing', 'indexing')
                                       AND datetime(created_at) < datetime('now', '-2 hours')",
                                    [],
                                ) {
                                    Ok(updated) if updated > 0 => {
                                        info!("Marked {} stale jobs as failed", updated);
                                    }
                                    Ok(_) => {}
                                    Err(error) => {
                                        error!("Error cleaning stale jobs: {}", error);
                                        counter!("scheduler_job_failures").increment(1);
                                    }
                                }
                            }
                            Err(_) => {
                                error!("Database mutex poisoned during stale job cleanup");
                                counter!("scheduler_job_failures").increment(1);
                            }
                        },
                        Err(error) => {
                            error!("Could not open repository during stale job cleanup: {}", error);
                            counter!("scheduler_job_failures").increment(1);
                        }
                    }

                    histogram!("scheduler_job_latency_seconds")
                        .record(start.elapsed().as_secs_f64());
                })
            })
            .map_err(|e| format!("Failed to create cleanup job: {}", e))?,
        )
        .await
        .map_err(|e| e.to_string())?;

    // 3. Compactación de embeddings (cada 1h)
    let compact_search = search_service.clone();
    sched
        .add(
            Job::new_async("0 0 * * * *", move |_uuid, _l| {
                let search = compact_search.clone();
                Box::pin(async move {
                    let start = std::time::Instant::now();
                    info!("Ejecutando tarea programada: vector_index_compacting");
                    counter!("scheduler_jobs_total").increment(1);

                    // HNSW snapshots are atomic and already compact the serialized
                    // graph; refresh the durable snapshot on the hourly cadence.
                    if let Err(error) = search.snapshot_index() {
                        error!("Error en hourly vector snapshot: {}", error);
                        counter!("scheduler_job_failures").increment(1);
                    }

                    histogram!("scheduler_job_latency_seconds")
                        .record(start.elapsed().as_secs_f64());
                })
            })
            .map_err(|e| format!("Failed to create compact job: {}", e))?,
        )
        .await
        .map_err(|e| e.to_string())?;

    sched
        .start()
        .await
        .map_err(|e| format!("Failed to start scheduler: {}", e))?;
    info!("Scheduler de mantenimiento iniciado correctamente.");

    Ok(())
}
