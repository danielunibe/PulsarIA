# OHA Command Examples for Pipeline Stress Testing

`oha` es una herramienta ultrarrápida (escrita en Rust) para generar carga HTTP. La usaremos para pruebas rápidas de límites de concurrencia y saturación del sistema, validando específicamente que el **Backpressure Dinámico** y el **Circuit Breaker** actúen y frenen los fallos en cascada de memoria/CPU.

### 1. Prueba de Carga Concurrente (Sustain Load)
Dispara 100 workers mock concurrentes enviando un total de 1,000 peticiones uniformes.

```bash
oha -n 1000 -c 100 -m POST -T application/json -d "{\"url\": \"https://video-source/sample.mp4\"}" http://127.0.0.1:9001/pipeline/ingest
```

### 2. Burst Spike (Prueba límite de Watermarks / Backpressure)
Intenta inundar la cola mandando 500 peticiones en ráfagas rapidísimas sin piedad durante 30 segundos.

```bash
oha -z 30s -c 500 -q 50 -m POST -T application/json -d "{\"url\": \"https://video-source/sample.mp4\"}" http://127.0.0.1:9001/pipeline/ingest
```

> **Detalles**: `-z 30s` duración, `-c 500` conexiones simultáneas (rompe el pool local rápido), `-q 50` consultas por segundo máximo.

---

### Monitoreo Recomendado Durante la Prueba (Live View)
Dado que configuramos Prometheus previamente, abre un terminal paralelo para ver las métricas reaccionar a la avalancha de `oha` o `k6`:

```bash
watch -n 1 "curl -s http://127.0.0.1:9001/metrics | grep -E 'queue_depth|worker_utilization|whisper_failures_total|whisper_circuit_breaker_state'"
```

El estado del circuito debería transicionar:
- `0.0` (Closed, Normal)
- `1.0` (Open, Rechazando todo y evitando OOM de GPU/Memoria)
- `2.0` (Half-Open, Modo prueba)
