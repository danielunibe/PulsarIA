use axum::{routing::get, Router};
use metrics_exporter_prometheus::PrometheusHandle;

pub async fn serve_metrics(handle: PrometheusHandle) {
    let app = Router::new().route("/metrics", get(move || async move { handle.render() }));

    let port = std::env::var("PULSAR_METRICS_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port != 0)
        .unwrap_or(9001);
    let address = format!("127.0.0.1:{port}");
    let listener = match tokio::net::TcpListener::bind(&address).await {
        Ok(listener) => listener,
        Err(error) => {
            tracing::warn!(
                "Metrics endpoint could not bind to {}: {}. Continuing without metrics HTTP server.",
                address,
                error
            );
            return;
        }
    };

    tracing::info!(
        "Metrics Endpoint local de Observabilidad iniciado en http://{}/metrics",
        address
    );
    if let Err(error) = axum::serve(listener, app).await {
        tracing::error!("Metrics HTTP server stopped unexpectedly: {}", error);
    }
}
