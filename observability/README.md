# Pulsaria — Observabilidad

Configuración de métricas y monitoreo para Pulsaria.

## Componentes

### Prometheus (`prometheus.yml`)

Configuración de Prometheus para scrape de métricas del servidor de métricas de Pulsaria.

- **Endpoint de métricas**: `http://127.0.0.1:9001/metrics`
- **Intervalo de scrape**: 15 segundos
- **Archivos de reglas**: `prometheus_rules.yml` (alertas y reglas de grabación)

### Grafana (`grafana_dashboard.json`)

Dashboard preconfigurado para visualizar métricas de Pulsaria:

- Latencia de queries semánticas
- Tiempo de inferencia ONNX
- Tiempo de operaciones SQLite
- Throughput de procesamiento de videos
- Estado de la cola de jobs

## Métricas Expostas

| Métrica | Tipo | Descripción |
|---|---|---|
| `pulsar_query_latency_ms` | Histogram | Latencia total de queries de búsqueda |
| `pulsar_onnx_latency_ms` | Histogram | Tiempo de inferencia ONNX |
| `pulsar_db_latency_ms` | Histogram | Tiempo de operaciones SQLite |
| `pulsar_jobs_total` | Counter | Total de jobs procesados |
| `pulsar_jobs_active` | Gauge | Jobs en procesamiento activo |
| `pulsar_embeddings_total` | Gauge | Total de embeddings indexados |
| `pulsar_model_loaded` | Gauge | Estado del modelo ONNX (1=cargado, 0=no) |

## Inicio rápido

### Con Docker

```bash
cd observability
docker-compose up -d  # Si se crea docker-compose.yml
```

### Sin Docker

1. Iniciar Pulsaria (`npm run tauri dev`)
2. Iniciar Prometheus con la config:
   ```bash
   prometheus --config.file=observability/prometheus.yml
   ```
3. Abrir Grafana y importar `grafana_dashboard.json`

## Notas

- Las métricas se emiten desde `src-tauri/src/infrastructure/observability/`
- El servidor de métricas se inicia automáticamente junto con la app
- En modo desarrollo, Prometheus scrapea desde `localhost:9001`
