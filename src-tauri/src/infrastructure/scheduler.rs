use std::sync::Arc;
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{info, error};
use metrics::{counter, histogram};
use crate::application::search_service::SearchService;
use crate::domain::ports::JobRepository;

pub async fn start_maintenance_scheduler(
    search_service: Arc<SearchService>,
    _job_repo: Arc<dyn JobRepository>,
) -> Result<(), String> {
    let sched = JobScheduler::new().await
        .map_err(|e| format!("Failed to initialize scheduler: {}", e))?;

    // 1. Snapshot del índice (cada 10 minutos)
    // 0 0/10 * * * * (At every 10th minute)
    let search_clone = search_service.clone();
    sched.add(
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
                
                histogram!("scheduler_job_latency_seconds").record(start.elapsed().as_secs_f64());
            })
        }).map_err(|e| format!("Failed to create snapshot job: {}", e))?
    ).await.map_err(|e| e.to_string())?;

    // 2. Limpieza de jobs huérfanos (cada 30 min)
    sched.add(
        Job::new_async("0 15/30 * * * *", move |_uuid, _l| {
            Box::pin(async move {
                let start = std::time::Instant::now();
                info!("Ejecutando tarea programada: cleanup_orphan_jobs");
                counter!("scheduler_jobs_total").increment(1);
                
                // TODO: Llamar a DB update statuses "processing" -> "error" (timeout) si aplica

                histogram!("scheduler_job_latency_seconds").record(start.elapsed().as_secs_f64());
            })
        }).map_err(|e| format!("Failed to create cleanup job: {}", e))?
    ).await.map_err(|e| e.to_string())?;

    // 3. Compactación de embeddings (cada 1h)
    sched.add(
        Job::new_async("0 0 * * * *", move |_uuid, _l| {
            Box::pin(async move {
                let start = std::time::Instant::now();
                info!("Ejecutando tarea programada: vector_index_compacting");
                counter!("scheduler_jobs_total").increment(1);
                
                // Stub para futuras implementaciones de reconstrucción total del índice HNSW

                histogram!("scheduler_job_latency_seconds").record(start.elapsed().as_secs_f64());
            })
        }).map_err(|e| format!("Failed to create compact job: {}", e))?
    ).await.map_err(|e| e.to_string())?;

    sched.start().await.map_err(|e| format!("Failed to start scheduler: {}", e))?;
    info!("Scheduler de mantenimiento iniciado correctamente.");

    Ok(())
}
