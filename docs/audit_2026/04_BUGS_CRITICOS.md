# PULSAR EVENTIDE — AUDITORÍA 04: BUGS CRÍTICOS Y DEFECTOS DE CÓDIGO
## Catálogo Detallado de Fallos, Causa Raíz, Severidad y Solución Técnica
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 05_AUDITORIA_UI_UX.md

---

## 1. MATRIZ DE SEVERIDAD DE BUGS

| ID | Severidad | Componente | Descripción Resumida |
|---|---|---|---|
| BUG-01 | CRÍTICO | `src-tauri/src/main.rs` & `queue.rs` | ONNX no conectado a QueueManager -> Embeddings vacíos |
| BUG-02 | CRÍTICO | `src-tauri/src/db.rs` | SQL query inválida `AVG(te.embedding_vector)` en clustering |
| BUG-03 | CRÍTICO | `python-workers/main.py` | Bucle de playlist no transcribe ni extrae metadatos |
| BUG-04 | ALTO | `components/VideoGrid.tsx` | Modal no encuentra job al reproducir desde playlist activa |
| BUG-05 | ALTO | `src-tauri/src/queue.rs` | Thumbnail referenciado como archivo local inexistente |
| BUG-06 | MEDIO | `src-tauri/src/db.rs` | Inconsistencia de esquema en `playlists` (`is_smart` vs `auto_generated`) |
| BUG-07 | MEDIO | `components/ExpandedVideoModal.tsx` | Timestamps interpolados uniformemente, ignorando Whisper |
| BUG-08 | MEDIO | `components/SettingsPanel.tsx` | Carpeta de descarga no comunicada a Python |

---

## 2. ANÁLISIS DETALLADO DE BUGS

---

### 🔴 BUG-01: ONNX Desconectado en QueueManager (Embeddings con ceros)
- **Archivos:** `src-tauri/src/main.rs`, `src-tauri/src/queue.rs`
- **Causa Raíz:** En `main.rs`, al inicializar `AppState`, el `QueueManager` se construye mediante `QueueManager::new(db.clone())`, dejando el campo `onnx: None`.
- **Efecto:** Al finalizar la transcripción de un video, `queue.rs` líneas 185-194 verifica `if let Some(onnx_mutex) = &onnx_ref`. Al ser `None`, se asigna por defecto `let mut embedding_vec = vec![0.0f32; 384];`. Como resultado, **todos los vectores en `transcript_embeddings` son ceros**, inutilizando la búsqueda semántica y el clustering.
- **Solución Requerida:**
  ```rust
  // En main.rs durante la inicialización:
  let onnx_arc = Arc::new(Mutex::new(onnx_model));
  let queue_manager = QueueManager::with_onnx(db.clone(), onnx_arc.clone());
  ```

---

### 🔴 BUG-02: Consulta SQL Inválida en `cluster_videos_by_similarity`
- **Archivo:** `src-tauri/src/db.rs` (Línea 305)
- **Causa Raíz:** La función ejecuta:
  ```sql
  SELECT te.job_id, AVG(te.embedding_vector) as avg_emb FROM transcript_embeddings te ... GROUP BY te.job_id
  ```
- **Efecto:** En SQLite, `AVG()` sobre una columna `BLOB` convierte los bytes a 0.0 o falla silenciosamente, retornando datos corruptos para la similitud.
- **Solución Requerida:** Seleccionar todos los embeddings individuales de cada `job_id`, desempaquetar los vectores en Rust y calcular el vector centroid promedio en memoria antes de aplicar similitud coseno.

---

### 🔴 BUG-03: Procesamiento de Playlist en `main.py` Incompleto
- **Archivo:** `python-workers/main.py` (Líneas 120-129)
- **Causa Raíz:** El manejador de playlists itera sobre `video_urls` pero solo emite eventos sin llamar a `transcribe_audio` ni normalizar `media_metadata`.
- **Efecto:** Los videos de playlists aparecen en la base de datos sin título real, sin duración y sin transcripción.
- **Solución Requerida:** Invocar la cadena completa `extract_metadata` -> `download_video` -> `extract_audio` -> `transcribe_audio` para cada elemento con `sub_job_id = job.job_id * 1000 + idx`.

---

### 🟠 BUG-04: Pérdida de Referencia de Video en Modal al Filtrar por Playlist
- **Archivo:** `components/VideoGrid.tsx` (Línea 301)
- **Causa Raíz:** El modal busca:
  ```typescript
  const activeJob = jobs.find(j => j.id === activeVideoId);
  ```
  Sin embargo, cuando `playlistId` está definido, los datos residen en `playlistJobs`. Si `jobs` no contiene ese item (por paginación o carga selectiva), `activeJob` es `undefined`.
- **Solución Requerida:**
  ```typescript
  const allAvailableJobs = playlistId ? [...playlistJobs, ...jobs] : jobs;
  const activeJob = allAvailableJobs.find(j => j.id === activeVideoId);
  ```

---

### 🟠 BUG-05: Path de Thumbnail Local Huérfano
- **Archivo:** `src-tauri/src/queue.rs` (Línea 143)
- **Causa Raíz:** `queue.rs` guarda en la base de datos `thumb_path = format!("data/thumbnails/{}.jpg", event.job)`. Sin embargo, ningún proceso descarga ni guarda la imagen del thumbnail en dicha ruta local; el thumbnail real viene como una URL web en `meta.thumbnail`.
- **Efecto:** `convertFileSrc("data/thumbnails/1.jpg")` busca un archivo local inexistente, provocando miniaturas rotas si no hay conexión o si la URL web original caduca.
- **Solución Requerida:** Si `meta.thumbnail` es una URL `http(s)`, descargar y guardar el buffer de la imagen en `data/thumbnails/{job_id}.jpg` durante el pipeline o guardar la URL web directa como fallback.

---

### 🟡 BUG-06: Mapeo Inconsistente en Tabla `playlists`
- **Archivo:** `src-tauri/src/db.rs` (Línea 118 vs Línea 370)
- **Causa Raíz:** En `init_db()` la columna se define como `is_smart BOOLEAN`, pero en `get_all_playlists()` se selecciona `p.auto_generated`. Si la tabla se creó con `is_smart`, la query `SELECT p.auto_generated` arroja un error de columna no encontrada en SQLite.
- **Solución Requerida:** Estandarizar el nombre de columna a `auto_generated` en todo el archivo `db.rs` y crear migración si la base de datos ya existe.

---

*Siguiente documento: [05_AUDITORIA_UI_UX.md](05_AUDITORIA_UI_UX.md)*
