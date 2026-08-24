# PULSAR EVENTIDE — AUDITORÍA 06: BACKEND RUST Y PERSISTENCIA SQLITE
## Análisis de Código Fuente Rust, Mutexes, Comandos IPC y Rendimiento
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 07_AUDITORIA_PIPELINE_PYTHON.md

---

## 1. REVISIÓN DEL MÓDULO `main.rs` (590 Líneas)

### 1.1 Estructura del Estado (`AppState`)
```rust
pub struct AppState {
    pub db: Arc<Mutex<rusqlite::Connection>>,
    pub queue_manager: Arc<QueueManager>,
    pub onnx_model: Arc<Mutex<Option<embedding::ONNXModelManager>>>,
    pub search_config: Arc<Mutex<SearchConfig>>,
}
```

### 1.2 Registro de Comandos Tauri
El archivo registra 23 comandos en `.invoke_handler(tauri::generate_handler![...])`:
1. `add_job`: Inserta URL en `jobs` y llama a `dispatch_worker`.
2. `get_jobs`: Retorna todos los jobs con metadatos asociados.
3. `get_base_path`: Retorna directorio base de la aplicación.
4. `search_transcripts`: Búsqueda vectorial coseno en memoria.
5. `get_model_status`: Diagnóstico del motor ONNX.
6. `reload_model`: Recarga caliente del modelo ONNX y tokenizador.
7. `get_search_config` / `update_search_config`: Ajuste de umbrales semánticos.
8. `get_db_status`: Conteo de filas y tamaño de `library.db`.
9. `debug_search_transcripts`: Inspección de distancias vectoriales.
10. `get_system_metrics`: Métricas de CPU, memoria y slots de cola.
11. `rebuild_index`: Regeneración de índices HNSW.
12. `vacuum_db`: Optimización y compactación de SQLite.
13. `recompute_embeddings`: Recálculo masivo de vectores.
14. `get_playlists`, `create_playlist`, `add_to_playlist`, `remove_from_playlist`, `get_playlist_items`, `delete_playlist`: CRUD Playlists.
15. `get_transcript`: Obtiene segmentos de texto ordenados por `chunk_index`.
16. `auto_cluster_videos`: Agrupación por similitud.
17. `set_video_keep_status`: Alterna estado `'keep'` vs `'online'`.
18. `export_semantic` / `import_semantic`: Serialización `.unib`.

---

## 2. REVISIÓN DEL MÓDULO `db.rs` (454 Líneas)

### 2.1 Puntos Fuertes
- Consultas parametrizadas con `rusqlite::params![]` (prevención absoluta de SQL Injection).
- Uso de `ON CONFLICT(job_id) DO UPDATE` para operaciones idempotentes de metadatos.
- Serialización segura de embeddings float a `Vec<u8>` little-endian (`to_ne_bytes`).

### 2.2 Puntos Débiles y Mejoras Necesarias
1. **Falta de Índices:** No existe índice en `transcript_embeddings(job_id)` ni en `media(job_id)`. Con miles de chunks, las consultas con `JOIN` y `WHERE job_id = ?` degradarán a full table scans.
   - **Solución:**
     ```sql
     CREATE INDEX IF NOT EXISTS idx_embeddings_job_id ON transcript_embeddings(job_id);
     CREATE INDEX IF NOT EXISTS idx_media_job_id ON media(job_id);
     ```
2. **Transacciones Faltantes:** La inserción de múltiples chunks en `queue.rs` se realiza mediante `conn.execute(...)` individuales dentro de un bucle `while`. Con 50 chunks, esto genera 50 escrituras a disco individuales.
   - **Solución:** Envolver la inserción de chunks en una transacción SQLite (`conn.transaction()`).

---

## 3. REVISIÓN DEL MÓDULO `embedding.rs` (96 Líneas)

- **Execution Provider:** Configurado con `DirectMLExecutionProvider`. En Windows aprovecha la GPU integrada/dedicada vía DirectX 12.
- **Fallback Seguro:** Si DirectML no está disponible, el builder debe fallar elegantemente a CPU estándar sin crashear el proceso.
- **Pipeline Matemático:**
  1. Tokenización (`Tokenizer::encode`).
  2. Inferencia ORT (`last_hidden_state`).
  3. Mean Pooling ponderado por `attention_mask`.
  4. L2 Normalization (`norm.sqrt().max(1e-12)`).
  5. Vector de 384 dimensiones de salida listo para producto punto / coseno.

---

*Siguiente documento: [07_AUDITORIA_PIPELINE_PYTHON.md](07_AUDITORIA_PIPELINE_PYTHON.md)*
