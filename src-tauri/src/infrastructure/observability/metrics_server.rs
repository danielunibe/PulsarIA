use axum::{routing::get, Router};
use metrics_exporter_prometheus::PrometheusHandle;

pub async fn serve_metrics(handle: PrometheusHandle) {
    let app = Router::new().route(
        "/metrics",
        get(move || async move { handle.render() })
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:9001")
        .await
        .unwrap();

    tracing::info!("Metrics Endpoint local de Observabilidad iniciado en http://127.0.0.1:9001/metrics");
    axum::serve(listener, app).await.unwrap();
}
