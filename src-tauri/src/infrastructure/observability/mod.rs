pub mod metrics_server;

use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use tracing_subscriber::fmt;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Registry};

// ========================================================================
// INFRASTRUCTURE: Observability & Telemetry
// Provee el motor de logs estructurados (JSON/Terminal) y el exportador
// de métricas en formato Prometheus, vital para monitorear el backend.
// ========================================================================

pub fn init_observability() -> PrometheusHandle {
    // 1. Configurar Filtro de Entorno (Logs de Rust vs librerías)
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,tiktok_processor=debug"));

    // 2. Configurar Subscriber de Tracing (Formato JSON para producción)
    let formatting_layer = fmt::layer()
        .with_target(true)
        .with_thread_ids(true)
        .with_line_number(true)
        .json(); // Exportación JSON limpia y parseable por Datadog/ELK

    let _ = Registry::default()
        .with(env_filter)
        .with(formatting_layer)
        .try_init();

    // 3. Inicializar Exportador de Métricas (Devolvemos el Handle Custom)
    let builder = PrometheusBuilder::new();

    match builder.install_recorder() {
        Ok(recorder) => {
            tracing::info!("Prometheus recorder installed successfully.");
            recorder
        }
        Err(e) => {
            tracing::warn!(
                "Prometheus recorder already initialized; using an isolated handle: {}",
                e
            );
            let recorder = PrometheusBuilder::new().build_recorder();
            recorder.handle()
        }
    }
}
