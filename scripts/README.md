# Pulsar Eventide — Scripts de mantenimiento

Scripts de utilidad para mantenimiento, benchmarks y operaciones administrativas.

## Scripts disponibles

### `backup_snapshots.py`

Crea copias de seguridad de los shards HNSW y la base de datos SQLite antes de operaciones de mantenimiento.

```bash
python scripts/backup_snapshots.py
```

**Qué hace:**
- Crea `_runtime_backups/snapshot_TIMESTAMP.db` con la BD actual
- Copia los archivos `vector_index_shard_*.hnsw` a `_runtime_backups/`
- Esencial antes de ejecutar `rebuild_index`, `vacuum_db` o `recompute_embeddings`

### `benchmark_comparison.py`

Compara el rendimiento de diferentes configuraciones de búsqueda semántica.

```bash
python scripts/benchmark_comparison.py
```

**Qué hace:**
- Ejecuta queries de prueba contra el motor de búsqueda
- Mide latencia de: generación de embedding, búsqueda SQLite, total
- Genera reporte comparativo de configuraciones (chunk_size, min_score, etc.)

### `recall_benchmark.py`

Evalúa la calidad de las búsquedas semánticas usando ground truth.

```bash
python scripts/recall_benchmark.py
```

**Qué hace:**
- Usa un conjunto de queries con documentos relevantes conocidos
- Calcula métricas de recall@K y precision@K
- Útil para validar que los cambios en el motor de búsqueda no degradan la calidad

## Requisitos

```bash
pip install -r python-workers/requirements.txt
```

## Notas

- Estos scripts son para uso en desarrollo/operaciones, no forman parte del producto final
- Los benchmarks asumen que la app está corriendo con datos indexados
- Los backups son esenciales antes de operaciones de mantenimiento sobre la BD
