import os
from pathlib import Path

docs_dir = Path("docs/audit_2026")
docs_dir.mkdir(parents=True, exist_ok=True)

# 02
doc_02 = """# PULSARIA — AUDITORÍA 02: ARQUITECTURA DEL SISTEMA
## Análisis Estructural Profundo, Flujos IPC, Dualidad de Backends y Persistencia
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 03_ESTADO_ACTUAL_COMPONENTES.md

---

## 1. VISIÓN GENERAL DE LA ARQUITECTURA

Pulsaria está concebido como una estación de trabajo de escritorio local y privada para la digestión, vectorización y consulta semántica de videos cortos y largos (TikTok, YouTube Shorts, Instagram Reels, enlaces web genéricos).

```
+---------------------------------------------------------------------------------------+
|                                    CAPA PRESENTACIÓN                                  |
|  Next.js 15 (App Router) + React 19 + TypeScript 5.9 + Tailwind CSS v4 + Motion      |
|  [Sidebar | VideoGrid | ExpandedVideoModal | Header | Playlists | Engine | AI Cluster]|
+---------------------------------------------------------------------------------------+
           |                                                      ^
           | (Tauri IPC invoke)                                   | (Tauri Event Listeners)
           v                                                      |
+---------------------------------------------------------------------------------------+
|                             CAPA DE CONTROL TAURI 2.0 (Rust)                          |
|  main.rs: Registrador de comandos + Gestor de AppState + Bridge IPC                  |
+---------------------------------------------------------------------------------------+
     |                                                                   |
     | (Invocación directa de comandos)                                  | (API REST interna)
     v                                                                   v
+--------------------------------------------+    +-------------------------------------+
|        SISTEMA LEGACY (AppState)           |    |     SISTEMA CLEAN ARCHITECTURE      |
|  - QueueManager (despacho directo Python)  |    |  - Axum REST Gateway (Puerto 8080)  |
|  - SQLite directo (rusqlite en db.rs)      |    |  - Application: Search / Queue      |
|  - Búsqueda Coseno O(N) en memoria/SQLite  |    |  - Domain: Traits / Entidades       |
|  - ONNX Model Manager (384d)               |    |  - Infrastructure: Vector Shards    |
|                                            |    |    (HNSW 4 shards) + Observability  |
+--------------------------------------------+    +-------------------------------------+
     |                                                                   |
     +-------------------------------+-----------------------------------+
                                     |
                                     v
+---------------------------------------------------------------------------------------+
|                               CAPA WORKERS PYTHON (Daemon)                            |
|  python-workers/main.py: Orquestador STDIN/STDOUT                                     |
|  - downloader.py (yt-dlp + extract_metadata + playlist support)                       |
|  - audio_extractor.py (ffmpeg -> 16kHz mono WAV)                                      |
|  - transcriber.py (faster-whisper 'tiny' -> segmentos + timestamps)                   |
+---------------------------------------------------------------------------------------+
                                     |
                                     v
+---------------------------------------------------------------------------------------+
|                               CAPA PERSISTENCIA Y MODELOS                             |
|  - data/library.db (SQLite: jobs, media, transcript_embeddings, playlists, items)     |
|  - data/processing/{job_id}/ (video.mp4, audio.wav/mp3, transcript.txt)               |
|  - assets/models/all-MiniLM-L6-v2/ (model.onnx, tokenizer.json)                       |
+---------------------------------------------------------------------------------------+
```

---

## 2. EL PROBLEMA DE LA 'DOBLE VERDAD' (DUAL BACKEND)

Uno de los hallazgos arquitectónicos más críticos de esta auditoría es la coexistencia de dos sistemas paralelos en Rust que no se comunican adecuadamente entre sí:

### A. Sistema Legacy en `main.rs` + `db.rs` + `queue.rs`
- Utiliza una conexión `rusqlite::Connection` protegida por `Arc<tokio::sync::Mutex<Connection>>` en el struct `AppState`.
- La búsqueda semántica (`search_transcripts`) se ejecuta leyendo todas las filas de `transcript_embeddings` en memoria y calculando similitud coseno iterativa.
- El `QueueManager` en `AppState` tiene `onnx: None` o una referencia no sincronizada, lo que provoca que al indexar nuevos videos los embeddings se guarden como vectores de ceros.

### B. Sistema Moderno en `domain/`, `application/`, `infrastructure/`
- Implementa Clean Architecture (Hexagonal):
  - `JobRepository` como trait de puerto.
  - `SqliteRepo` como adaptador de persistencia.
  - `VectorShardManager` con 4 particiones HNSW para indexación vectorial rápida.
  - `SearchService` con soporte para Reranker y Semantic Cache.
  - Servidor REST Axum en el puerto 8080 (`/api/v1/ingest`, `/api/v1/jobs`, `/api/v1/search`).
- **Problema de desconexión:** El frontend Next.js consume principalmente los comandos IPC de Tauri (`main.rs`), ignorando las capacidades avanzadas de `VectorShardManager` y `SearchService` a menos que se use el fallback HTTP a `:8080`.

---

## 3. FLUJO DE DATOS END-TO-END: DEL LINK AL BUSCADOR

A continuación se detalla el ciclo de vida completo de un job de ingestión:

### Paso 1: Recepción y Validación de Enlaces (Frontend)
1. El usuario pega links en `AddLinks.tsx` o sube un archivo `.txt`/`.csv`.
2. El hook `use-link-processor.ts` evalúa expresiones regulares para TikTok, YouTube Shorts, Instagram Reels o URLs genéricas.
3. Si está en entorno Tauri nativo, invoca el comando IPC `add_job(url)`.
4. Si está en entorno navegador web, realiza un POST a `http://localhost:8080/api/v1/ingest`.

### Paso 2: Registro Inicial en SQLite
1. En `db.rs`, la función `insert_job` registra el registro en la tabla `jobs` con estado `'queued'` y progreso `0`.
2. Se obtiene el `job_id` autoincremental de SQLite.
3. Se despacha el proceso en segundo plano mediante `queue.rs::dispatch_worker`.

### Paso 3: Orquestación del Subproceso Python
1. `QueueManager` resuelve el intérprete Python buscando en `python-workers/.venv/Scripts/python.exe` o en el PATH del sistema.
2. Ejecuta `main.py --job_id <ID> --url <URL>` capturando `stdout` y `stderr` como pipes.
3. `main.py` ejecuta la cadena:
   - `downloader.py`: Ejecuta `yt-dlp` en modo silencioso, descargando `video.mp4` a `data/processing/<job_id>/` y extrayendo metadatos (título, autor, duración, thumbnail).
   - `audio_extractor.py`: Ejecuta `ffmpeg` extrayendo un stream WAV a 16kHz mono.
   - `transcriber.py`: Inicializa `faster-whisper` (modelo `tiny`, int8 en CPU) y genera la transcripción con timestamps por segmento.
4. En cada etapa, Python emite un objeto JSON a `stdout` (vía `events.py::emit_event`).

### Paso 4: Captura en Rust y Emisión de Eventos IPC
1. El lector `BufReader` en `queue.rs` lee cada línea JSON de `stdout`.
2. Actualiza la tabla `jobs` y `media` en SQLite.
3. Emite el evento Tauri `job_progress` con el payload estructurado. El frontend (en `QueueSection.tsx` y `VideoGrid.tsx`) escucha este evento y actualiza el estado visual reactivamente.

### Paso 5: Chunking, Vectorización e Indexación
1. Al llegar al evento `complete` o `completed`, Rust toma el texto completo de la transcripción (`transcript.txt`).
2. Aplica una estrategia de ventana deslizante: `chunk_size = 150` caracteres con `overlap = 50` caracteres.
3. Si el motor ONNX está disponible, tokeniza y genera el vector normalizado de 384 dimensiones.
4. Inserta cada fragmento en la tabla `transcript_embeddings` como un `BLOB` binario (`f32` little-endian).
5. Emite los eventos `media_indexed` y `job_completed_notify`.

---

## 4. PERSISTENCIA: ESQUEMA RELACIONAL Y ESTRUCTURA DE ALMACENAMIENTO

### 4.1 Base de Datos SQLite (`data/library.db`)

```sql
-- Tabla de trabajos en cola y estado de procesamiento
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    status TEXT NOT NULL,          -- 'queued', 'downloading', 'extracting_audio', 'transcribing', 'complete', 'error'
    progress INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de metadatos del medio descargado
CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER UNIQUE NOT NULL,
    video_path TEXT,
    audio_path TEXT,
    transcript_path TEXT,
    title TEXT,
    author TEXT,
    thumbnail TEXT,
    duration INTEGER,
    upload_date TEXT,
    keep_status TEXT DEFAULT 'keep', -- 'keep' (local) o 'online' (solo streaming)
    platform TEXT,                   -- 'tiktok', 'youtube', 'instagram', 'generic'
    FOREIGN KEY(job_id) REFERENCES jobs(id)
);

-- Tabla de vectores y fragmentos de transcripción
CREATE TABLE IF NOT EXISTS transcript_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding_vector BLOB NOT NULL,  -- 384 floats * 4 bytes = 1536 bytes por chunk
    FOREIGN KEY(job_id) REFERENCES jobs(id)
);

-- Tabla de listas de reproducción
CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#8a5cff',
    is_smart BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla relacional Many-to-Many entre playlists y videos
CREATE TABLE IF NOT EXISTS playlist_items (
    playlist_id INTEGER NOT NULL,
    job_id INTEGER NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, job_id),
    FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
);
```

---

## 5. CONCURRENCIA, LOCKING Y RENDIMIENTO

1. **SQLite Concurrency:** Rusqlite se ejecuta bajo un único `tokio::sync::Mutex`. En lecturas intensivas concurrentes (por ejemplo, búsqueda semántica mientras se descargan 5 videos en paralelo), el bloqueo puede generar cuellos de botella temporales en la UI.
2. **Subprocesos Python:** Cada video en cola genera un nuevo proceso del sistema operativo. Si el usuario encola 20 videos a la vez, se lanzarán 20 subprocesos compitiendo por CPU/RAM para Whisper y yt-dlp.
   - **Mejora requerida:** Implementar un semáforo de concurrencia (`tokio::sync::Semaphore`) en `queue.rs` para limitar la ejecución paralela a 2 o 3 workers simultáneos.
3. **Inferencia ONNX:** Se ejecuta en CPU con 4 hilos intra-op (`with_intra_threads(4)`), lo que proporciona una latencia de inferencia inferior a 15ms por chunk de 150 caracteres.

---

*Siguiente documento: [03_ESTADO_ACTUAL_COMPONENTES.md](03_ESTADO_ACTUAL_COMPONENTES.md)*
"""
(docs_dir / "02_ARQUITECTURA_SISTEMA.md").write_text(doc_02, encoding="utf-8")
print("02 OK")

# 03
doc_03 = """# PULSARIA — AUDITORÍA 03: ESTADO ACTUAL DE COMPONENTES
## Desglose Exhaustivo de Componentes Frontend, Estado, Props y Flujos
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 04_BUGS_CRITICOS.md

---

## 1. MAPA DE COMPONENTES Y RESPONSABILIDADES

| Componente | Archivo | Estado | Dependencias Clave |
|---|---|---|---|
| Main Dashboard | `app/page.tsx` | ✅ Operativo | Header, Sidebar, VideoGrid, StatsPanel, ColorBends |
| Ingesta de Enlaces | `components/AddLinks.tsx` | ✅ Operativo | useLinkProcessor, Lucide icons, FA6 |
| Grid de Videos | `components/VideoGrid.tsx` | ⚠️ Operativo c/ bugs | VideoCard, ExpandedVideoModal, convertFileSrc |
| Tarjeta de Video | `components/VideoCard.tsx` | ✅ Operativo | useVideoPlayer, VideoCardOverlay, InactiveCardShell |
| Modal Expandido | `components/ExpandedVideoModal.tsx` | ⚠️ Operativo c/ gaps | useSemanticIO, get_transcript IPC, Sonner |
| Cabecera Global | `components/Header.tsx` | ✅ Operativo | Search Debounce (800ms), Sort Dropdown |
| Barra Lateral | `components/Sidebar.tsx` | ✅ Operativo | Navigation Tabs (Dashboard, Engine, Lists, Page, AI) |
| Panel de Listas | `components/PlaylistsPanel.tsx` | ✅ Operativo | usePlaylists, Tauri IPC CRUD |
| Panel de Clustering | `components/ClusterPanel.tsx` | ⚠️ Inconsistencia DB | auto_cluster_videos IPC, threshold slider |
| Panel de Estadísticas | `components/StatsPanel.tsx` | ✅ Operativo | Metrics math, duration formatter |
| Panel de Página | `components/PagePanel.tsx` | ✅ Operativo | Layout configuration state |
| Panel de Ajustes | `components/SettingsPanel.tsx` | ⚠️ Desconectado | localStorage (sin persistencia en Rust/Python) |
| Monitor de Cola | `components/QueueSection.tsx` | ✅ Operativo | TikTokProcessor, GlassPillLoader, format badges |
| Fondo WebGL Aurora | `components/ColorBends.tsx` | ✅ Operativo | Three.js shader canvas |

---

## 2. ANÁLISIS DETALLADO POR COMPONENTE

### 2.1 `app/page.tsx` (Punto Central de Estado)
- **Estado Global:**
  - `activeTab`: `'dashboard' | 'semantic-config' | 'playlists' | 'page' | 'clusters'`
  - `sortKey`: `'date_desc' | 'date_asc' | 'title' | 'duration'`
  - `selectedPlaylistId`: `number | null`
  - `activeVideoId`: `number | null` (controla modal expandido)
  - `allJobs`: `JobRecord[]` (recibido desde VideoGrid)
  - `keepStatusFilter`: `'all' | 'keep' | 'online'`
  - `platformFilter`: `'all' | 'tiktok' | 'youtube' | 'instagram' | 'generic'`
- **Comportamiento:** Renders condicionales según `activeTab`. Integra `StatsPanel` en el tab `dashboard` encima de `VideoGrid`.

### 2.2 `components/AddLinks.tsx` + `hooks/use-link-processor.ts`
- **Flujo:** Admite URLs individuales pegadas en textarea o carga masiva vía archivo `.txt`/`.csv`.
- **Validación:** Detección de plataforma por Regex (TikTok, YouTube, Instagram, Generic).
- **Despacho:** Si está en Tauri, llama a `invoke('add_job', { url })`. Si falla, hace fallback a `fetch('http://localhost:8080/api/v1/ingest')`.

### 2.3 `components/VideoGrid.tsx`
- **Cálculo de Columnas:** Usa `ResizeObserver` en `containerRef` para calcular columnas dinámicas según `CARD_MIN_WIDTH = 200px` y `SPACING = 32px`.
- **Efecto Dock Mac:** Animación spring (`stiffness: 450, damping: 35, mass: 0.8`) con desplazamiento lateral `pushX = 48px` para evitar solapamiento visual en hover.
- **Resolución de Assets:** Convierte paths locales (`data/processing/1/video.mp4`) a URLs consumibles por el WebView vía `convertFileSrc`.
- **Bug Detectado:** En la línea 301, el modal expandido busca el video activo en `jobs.find(...)`. Cuando se visualiza una playlist, `playlistJobs` contiene los items pero `jobs` puede estar desactualizado, provocando que el modal no abra o muestre pantalla negra.

### 2.4 `components/ExpandedVideoModal.tsx`
- **Capacidades:**
  - Reproductor HTML5 con control de volumen, scrubber de progreso y velocidad (0.5x a 2x).
  - Carga de transcripción mediante `get_transcript(jobId)`.
  - Exportación semántica hacia formato `.unib` / Julia.
  - Atajos de teclado: `Espacio` (play/pause), `Escape` (cerrar), `M` (mute), `Flechas` (seek +/- 5s).
- **Gaps Detectados:**
  - Los timestamps de los chunks de transcripción se calculan mediante distribución uniforme `chunkDur = dur / totalChunks` en lugar de usar los timestamps reales devueltos por Whisper (`seg.start`, `seg.end`).
  - La pestaña "Julia" muestra código estático generado sin datos enriquecidos de análisis semántico.

### 2.5 `components/Header.tsx`
- **Búsqueda Semántica:** Incorpora debounce de 800ms para queries >= 3 caracteres.
- **Controles:** Dropdown de ordenación, botón de acceso a Settings, contador de videos activos en biblioteca.

### 2.6 `components/Sidebar.tsx`
- **Diseño Adaptativo:** `ResizeObserver` recalcula `contentScale` (0.70 a 1.0) y márgenes dinámicos para mantener legibilidad sin scroll horizontal.
- **Navegación:** 5 tabs principales con estados activos e iluminación glow diferenciada por acentos cromáticos.

### 2.7 `components/PlaylistsPanel.tsx` + `hooks/usePlaylists.ts`
- **Operaciones:** Crear playlist, listar playlists con contador de items, eliminar playlist, seleccionar playlist activa para filtrar el VideoGrid.
- **Paleta Cromática:** 8 colores predefinidos (`#fe2c55`, `#8a5cff`, `#25f4ee`, `#f59e0b`, `#10b981`, `#ec4899`, `#3b82f6`, `#f97316`).

### 2.8 `components/ClusterPanel.tsx`
- **Propósito:** Agrupación semántica no supervisada de videos basada en similitud coseno.
- **Falla en Backend:** `cluster_videos_by_similarity` en `db.rs` ejecuta `AVG(te.embedding_vector)` en SQLite, lo que no es válido sobre BLOBs binarios en SQLite estándar.

---

*Siguiente documento: [04_BUGS_CRITICOS.md](04_BUGS_CRITICOS.md)*
"""
(docs_dir / "03_ESTADO_ACTUAL_COMPONENTES.md").write_text(doc_03, encoding="utf-8")
print("03 OK")

# 04
doc_04 = """# PULSARIA — AUDITORÍA 04: BUGS CRÍTICOS Y DEFECTOS DE CÓDIGO
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
"""
(docs_dir / "04_BUGS_CRITICOS.md").write_text(doc_04, encoding="utf-8")
print("04 OK")

# 05
doc_05 = """# PULSARIA — AUDITORÍA 05: AUDITORÍA DE EXPERIENCIA DE USUARIO (UI/UX)
## Defectos Visuales, Micro-Interacciones, Accesibilidad y Ergonomía
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 06_AUDITORIA_BACKEND_RUST.md

---

## 1. RESUMEN DE HALLAZGOS UI/UX

La interfaz de Pulsaria destaca por su estética AAA (Aurora WebGL, Glassmorphism, paleta HSL seleccionada). Sin embargo, la auditoría técnica ha detectado varias fricciones y fallas de interacción que degradan la experiencia de uso.

---

## 2. CATÁLOGO DE DEFECTOS UI/UX

### 2.1 Estado Vacío Desorientador en `VideoGrid`
- **Problema:** Cuando la biblioteca tiene 0 videos procesados, el grid renderiza 12 slots fantasma (`InactiveCardShell`) sin ningún mensaje explicativo, CTA (Call to Action) ni guía interactiva.
- **Impacto:** Un usuario primerizo ve tarjetas oscuras vacías sin entender que debe ingresar un enlace en el panel izquierdo.
- **Recomendación:** Mostrar un banner central con ilustración sutil, gradiente de marca y mensaje: *"Tu biblioteca está vacía. Pega enlaces de TikTok, YouTube o Instagram a la izquierda para comenzar."*

### 2.2 Desincronización Temporal de Subtítulos en `ExpandedVideoModal`
- **Problema:** Los chunks de transcripción se reparten de manera uniforme en la línea de tiempo (`dur / totalChunks`). Si un video tiene silencios largos al inicio o ráfagas rápidas de voz, el texto no coincide con el audio real.
- **Impacto:** Al hacer clic en un subtítulo para saltar (`seekTo`), el reproductor aterriza en un segundo inexacto.
- **Recomendación:** Almacenar `start_ms` y `end_ms` reales generados por Whisper para cada segmento y consumirlos directamente en el modal.

### 2.3 Progreso de Descarga en `QueueSection` Sin Etapas Claras
- **Problema:** El usuario solo ve una barra de porcentaje genérica. No queda claro si el sistema está descargando el MP4, extrayendo el audio con ffmpeg, ejecutando Whisper o indexando en ONNX.
- **Recomendación:** Implementar una barra de 4 pasos con badges de estado:
  `[1. Descargando] -> [2. Audio WAV] -> [3. Transcribiendo] -> [4. Indexando]`

### 2.4 Fricción en Búsqueda Semántica
- **Problema:** En versiones iniciales, la búsqueda requería presionar Enter. Con el debounce de 800ms implementado en `Header.tsx`, falta un indicador de carga (`spinner` o pulse de luz cian `#25f4ee`) mientras el modelo ONNX genera el embedding y filtra resultados.
- **Recomendación:** Añadir un spinner de búsqueda activo dentro del input de Header.

### 2.5 Controles de Volumen y Scrubber en `VideoCard` (Hover Play)
- **Problema:** Al pasar el cursor sobre una tarjeta en el grid, el video comienza a reproducirse en miniatura. Si el usuario pasa el mouse rápidamente sobre varias tarjetas, se disparan múltiples cargas de video y clips de audio simultáneos.
- **Recomendación:** Añadir un debounce de 250ms antes de iniciar el hover play y silenciar el audio por defecto en el grid (habilitando audio solo en `ExpandedVideoModal`).

### 2.6 Sistema de Notificaciones del Sistema
- **Problema:** Cuando se encola una lista de 10 videos y el usuario minimiza la aplicación, no hay notificación nativa de Windows al terminar el procesamiento de la cola.
- **Recomendación:** Integrar `tauri-plugin-notification` para notificar: *"10 videos procesados e indexados en tu biblioteca."*

---

*Siguiente documento: [06_AUDITORIA_BACKEND_RUST.md](06_AUDITORIA_BACKEND_RUST.md)*
"""
(docs_dir / "05_AUDITORIA_UI_UX.md").write_text(doc_05, encoding="utf-8")
print("05 OK")

# 06
doc_06 = """# PULSARIA — AUDITORÍA 06: BACKEND RUST Y PERSISTENCIA SQLITE
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
"""
(docs_dir / "06_AUDITORIA_BACKEND_RUST.md").write_text(doc_06, encoding="utf-8")
print("06 OK")

# 07
doc_07 = """# PULSARIA — AUDITORÍA 07: PIPELINE DE WORKERS PYTHON
## Descarga, Extracción de Audio, Transcripción y Protocolo de Comunicación IPC
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 08_AUDITORIA_IA_MODELOS.md

---

## 1. ARQUITECTURA DEL WORKER POOL

El directorio `python-workers/` contiene el pipeline de procesamiento multimedia:

```
python-workers/
├── main.py            ← Entrypoint daemon y CLI de subproceso
├── downloader.py      ← Wrapper yt-dlp con fallback de rutas
├── audio_extractor.py ← Extracción ffmpeg a WAV 16kHz mono
├── transcriber.py     ← faster-whisper con inferencia int8
├── embed_query.py     ← Generación de embedding para queries desde CLI
├── events.py          ← Emisión de eventos JSON a STDOUT
├── models.py          ← Dataclass JobInput
└── requirements.txt   ← faster-whisper, yt-dlp
```

---

## 2. REVISIÓN DE MÓDULOS

### 2.1 `downloader.py`
- **Resolución de yt-dlp:** Algoritmo robusto que prueba variables de entorno, entornos virtuales (`.venv`), binarios locales y el PATH global del sistema.
- **Comando de Descarga:**
  `yt-dlp --quiet --no-warnings -S ext:mp4:m4a -o data/processing/{job_id}/video.mp4 <URL>`
- **Extracción de Metadatos:** `extract_metadata` utiliza `--dump-json --no-download` con un timeout de 30s.

### 2.2 `audio_extractor.py`
- Invoca `ffmpeg` para extraer audio a 16kHz mono (el formato óptimo requerido por Whisper):
  `ffmpeg -y -i video.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 audio.wav`
- **Riesgo:** Si `ffmpeg` no está instalado en el sistema operativo, la llamada falla. Es necesario incluir una verificación previa al arrancar el worker.

### 2.3 `transcriber.py`
- **Modelo:** `faster-whisper` con modelo `tiny` en CPU int8.
- **Retorno:** Diccionario con `text` consolidado y lista de `segments` conteniendo `start`, `end` y `text`.
- **Persistencia:** Guarda copia directa en `data/processing/{job_id}/transcript.txt`.

### 2.4 `events.py` (Protocolo IPC STDOUT)
- Cada evento se imprime en una única línea JSON seguida de `flush=True`:
  ```json
  {"event": "download_complete", "job_id": 1, "step": "extracting_audio", "progress": 50, "metadata": {...}}
  ```
- Rust en `queue.rs` deserializa línea por línea con `serde_json`.

---

*Siguiente documento: [08_AUDITORIA_IA_MODELOS.md](08_AUDITORIA_IA_MODELOS.md)*
"""
(docs_dir / "07_AUDITORIA_PIPELINE_PYTHON.md").write_text(doc_07, encoding="utf-8")
print("07 OK")

# 08
doc_08 = """# PULSARIA — AUDITORÍA 08: INTELIGENCIA ARTIFICIAL Y MODELOS
## Evaluación de Whisper, ONNX MiniLM, Integración con Google Gemini y Estrategia Multimodal
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 09_FEATURES_FALTANTES.md

---

## 1. ESTADO ACTUAL DE LOS MODELOS DE IA

```
[Audio] ---> [faster-whisper (tiny/int8)] ---> [Texto Transcrito]
                                                      |
                                                      v
                                        [ONNX all-MiniLM-L6-v2]
                                                      |
                                                      v
                                        [Vector 384d en SQLite]
```

### 1.1 Modelo STT: Whisper (faster-whisper)
- **Tamaño actual:** `tiny` (~75MB).
- **Fortalezas:** Velocidad extrema de inferencia en CPU (5x tiempo real).
- **Debilidades:** Tasa de error (WER) relativamente alta en español con modismos, ruido de fondo o música superpuesta típica de TikTok.
- **Recomendación:** Permitir al usuario seleccionar en `SettingsPanel` entre `tiny` (rápido), `base` (balanceado) y `small` (alta precisión).

### 1.2 Modelo de Embeddings: all-MiniLM-L6-v2 (ONNX)
- **Dimensiones:** 384.
- **Fortalezas:** Extremadamente ligero (<90MB), inferencia sub-15ms, sin costo de API.
- **Debilidades:** Optimizado principalmente para inglés. Para queries complejas en español, la similitud semántica puede ser limitada.

---

## 2. INTEGRACIÓN CON GOOGLE GEMINI (`@google/genai`)

El proyecto ya cuenta con la dependencia `@google/genai: ^1.17.0` instalada en `package.json`. A continuación se detalla el plan para activar sus capacidades:

### 2.1 Resúmenes Inteligentes y Key Insights (`gemini-1.5-flash`)
- Generar automáticamente al completar un video:
  - Título conceptual enriquecido.
  - Resumen ejecutivo de 3 viñetas.
  - Categoría temática (e.g., Programación, Fitness, Finanzas, Humor).
  - Sentimiento y tono.

### 2.2 Chat RAG Multimodal sobre la Biblioteca
- Permitir al usuario abrir un panel de asistente y preguntar:
  - *"¿Qué videos hablan sobre optimización en Rust?"*
  - *"Resume los consejos de productividad de los últimos 5 videos de TikTok guardados."*
- El backend recupera los chunks más relevantes mediante búsqueda vectorial y los envía como contexto a Gemini para generar la respuesta con citas exactas a los videos.

### 2.3 Embeddings Híbridos (`text-embedding-004`)
- Opción de generar embeddings de 768 dimensiones vía Gemini cuando hay API Key configurada, manteniendo ONNX local como fallback offline.

---

*Siguiente documento: [09_FEATURES_FALTANTES.md](09_FEATURES_FALTANTES.md)*
"""
(docs_dir / "08_AUDITORIA_IA_MODELOS.md").write_text(doc_08, encoding="utf-8")
print("08 OK")

# 09
doc_09 = """# PULSARIA — AUDITORÍA 09: MATRIZ DE FEATURES FALTANTES
## Requisitos Funcionales, Módulos Pendientes y Especificación Técnica
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 10_PLAN_IMPLEMENTACION_POR_FASES.md

---

## 1. MATRIZ DE FEATURES POR PRIORIDAD

| ID | Feature | Capa | Prioridad | Fase Roadmap |
|---|---|---|---|---|
| FEAT-01 | Validación E2E Pipeline Real | Python/Rust/UI | CRÍTICA | Fase 7 |
| FEAT-02 | Conexión ONNX en AppState | Rust | CRÍTICA | Fase 8 |
| FEAT-03 | Timestamps Reales en Subtítulos | Python/Rust/UI | ALTA | Fase 8 |
| FEAT-04 | Persistencia de Ajustes en Backend | Rust/UI | MEDIA | Fase 8 |
| FEAT-05 | Motor OCR en Frames de Video | Python/Rust | ALTA | Fase 9 |
| FEAT-06 | Integración Gemini (Resúmenes) | Frontend/API | ALTA | Fase 10 |
| FEAT-07 | Chat Asistente RAG con Citaciones | Frontend/AI | ALTA | Fase 11 |
| FEAT-08 | Playlists Inteligentes por Topic | Rust/UI | MEDIA | Fase 12 |
| FEAT-09 | Exportación Científica Julia (.unib) | Rust/Julia | MEDIA | Fase 13 |
| FEAT-10 | Notificaciones Nativas del SO | Rust/UI | BAJA | Fase 14 |
| FEAT-11 | Empaquetador de Producción MSI | Tauri/Build | MEDIA | Fase 15 |

---

## 2. ESPECIFICACIÓN DE FEATURES CLAVE

### FEAT-05: Motor OCR (Extracción de Texto en Pantalla)
- **Objetivo:** Los videos de TikTok contienen información crítica en texto sobreimpreso (instrucciones, código, recetas) que no siempre se pronuncia en el audio.
- **Implementación:** Extraer 1 fotograma cada 2 segundos con `ffmpeg`, aplicar OCR ligero (Tesseract / PaddleOCR / Gemini Vision) e indexar el texto extraído en una tabla `visual_embeddings`.

### FEAT-07: Asistente de Investigación RAG
- **Objetivo:** Interfaz conversacional en el Sidebar donde el usuario consulta su base de conocimiento audiovisual.
- **Implementación:**
  1. Input de pregunta en UI.
  2. Búsqueda vectorial local en `transcript_embeddings`.
  3. Recuperación de los top 5 chunks.
  4. Envío a `@google/genai` con prompt del sistema que cita los IDs de video y timestamps.
  5. Renderizado de respuesta con enlaces clickeables que abren el `ExpandedVideoModal` en el segundo exacto.

### FEAT-09: Exportador Julia (.unib)
- **Objetivo:** Permitir que investigadores en Julia carguen colecciones de Pulsar directamente como Tensores y DataFrames para análisis de NLP.
- **Estructura del formato:**
  - Archivo JSON estructurado con metadatos, transcripción completa, chunks tokenizados, matriz de embeddings float32 y relaciones de clustering.

---

*Siguiente documento: [10_PLAN_IMPLEMENTACION_POR_FASES.md](10_PLAN_IMPLEMENTACION_POR_FASES.md)*
"""
(docs_dir / "09_FEATURES_FALTANTES.md").write_text(doc_09, encoding="utf-8")
print("09 OK")

# 10
doc_10 = """# PULSARIA — AUDITORÍA 10: PLAN DE IMPLEMENTACIÓN POR FASES
## Roadmap Técnico de Ejecución Autónoma (Fases 7 a 15)
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 11_CONTRATO_DATOS_TIPOS.md

---

## 1. VISIÓN GENERAL DEL ROADMAP

```
[FASE 7]  Validación Pipeline E2E con Video Real
    ↓
[FASE 8]  Saneamiento Arquitectónico y Corrección de Bugs Críticos (BUG-01 a BUG-08)
    ↓
[FASE 9]  Motor OCR y Extracción de Fotogramas Visuales
    ↓
[FASE 10] Integración Gemini (Resúmenes, Tags y Análisis Multimodal)
    ↓
[FASE 11] Asistente Conversacional RAG sobre Biblioteca
    ↓
[FASE 12] Playlists Inteligentes y Clustering Automático
    ↓
[FASE 13] Exportación Científica a Julia y Formato .unib
    ↓
[FASE 14] Optimización UI/UX, Animaciones y Micro-Interacciones
    ↓
[FASE 15] Preparación de Release y Empaquetado Nativo
```

---

## 2. GUÍA DE EJECUCIÓN POR FASE

### FASE 7: Validación de Pipeline E2E (Primer Video Real)
- **Objetivo:** Confirmar que la cadena `AddLinks` -> `Rust` -> `Python` -> `SQLite` -> `VideoGrid` funciona con un video real de TikTok o YouTube.
- **Acciones:**
  1. Snapshot preventivo de `data/library.db`.
  2. Encolar 1 URL real.
  3. Verificar creación de `data/processing/1/video.mp4` y `transcript.txt`.
  4. Verificar actualización de estado en SQLite.

### FASE 8: Saneamiento y Corrección de Bugs
- **Objetivo:** Resolver los 8 bugs identificados en el documento 04.
- **Acciones:**
  1. Pasar `onnx_model` a `QueueManager` en `main.rs`.
  2. Reescribir `cluster_videos_by_similarity` en `db.rs`.
  3. Corregir bucle de playlists en `main.py`.
  4. Corregir lookup de video en `VideoGrid.tsx`.
  5. Implementar descarga o fallback de thumbnails en `queue.rs`.

### FASE 9: Motor OCR y Extracción Visual
- **Objetivo:** Incorporar texto en pantalla al índice semántico.
- **Acciones:**
  1. Añadir `visual_extractor.py` en workers Python.
  2. Extraer keyframes con `ffmpeg`.
  3. Indexar texto OCR en SQLite.

### FASE 10 & 11: IA Generativa y Chat RAG con Gemini
- **Objetivo:** Convertir Pulsar en un asistente de investigación inteligente.
- **Acciones:**
  1. Crear `lib/gemini.ts` usando `@google/genai`.
  2. Generar resúmenes automáticos al indexar.
  3. Crear componente `ChatAssistantPanel.tsx` en el Sidebar.

### FASE 12 a 15: Playlists, Julia y Producción
- **Objetivo:** Completar integración científica y empaquetado final.

---

*Siguiente documento: [11_CONTRATO_DATOS_TIPOS.md](11_CONTRATO_DATOS_TIPOS.md)*
"""
(docs_dir / "10_PLAN_IMPLEMENTACION_POR_FASES.md").write_text(doc_10, encoding="utf-8")
print("10 OK")

# 11
doc_11 = """# PULSARIA — AUDITORÍA 11: CONTRATO DE DATOS Y TIPOS
## Especificación de Tipos TypeScript, Structs Rust y Protocolo de Comunicación
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: KILOCODE_BASE_DOCUMENT.md

---

## 1. TIPOS COMPARTIDOS TYPESCRIPT / RUST

### 1.1 `JobRecord`
```typescript
// types/index.ts
export interface JobRecord {
    id: number;
    url: string;
    status: 'queued' | 'downloading' | 'extracting_audio' | 'transcribing' | 'complete' | 'error';
    progress: number;
    created_at: string;
    title?: string;
    author?: string;
    thumbnail?: string;
    duration?: number;
    video_path?: string;
    keep_status?: 'keep' | 'online';
    platform?: 'tiktok' | 'youtube' | 'instagram' | 'generic';
}
```

```rust
// src-tauri/src/db.rs
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct JobRecord {
    pub id: i64,
    pub url: String,
    pub status: String,
    pub progress: i32,
    pub created_at: String,
    pub title: Option<String>,
    pub author: Option<String>,
    pub thumbnail: Option<String>,
    pub duration: Option<i32>,
    pub video_path: Option<String>,
    pub keep_status: Option<String>,
    pub platform: Option<String>,
}
```

### 1.2 `PlaylistRecord`
```typescript
export interface PlaylistRecord {
    id: number;
    name: string;
    description?: string;
    cover_job_id?: number;
    auto_generated: boolean;
    topic_keywords: string;
    color: string;
    created_at: string;
    item_count: number;
}
```

```rust
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct PlaylistRecord {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub cover_job_id: Option<i64>,
    pub auto_generated: bool,
    pub topic_keywords: String,
    pub color: String,
    pub created_at: String,
    pub item_count: i64,
}
```

### 1.3 `SearchResult`
```typescript
export interface SearchResult {
    job_id: number;
    title: string | null;
    thumbnail: string | null;
    chunk_text: string;
    chunk_index: number;
    similarity_score: number;
}
```

```rust
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct SearchResult {
    pub job_id: i64,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub chunk_text: String,
    pub chunk_index: i64,
    pub similarity_score: f32,
}
```

---

## 2. EVENTOS IPC TAURI

| Nombre del Evento | Emisor | Payload | Receptor |
|---|---|---|---|
| `job_progress` | `queue.rs` | `{ job: i64, step: string, progress: i32, metadata?: MediaMetadata, text?: string }` | `VideoGrid`, `QueueSection` |
| `media_indexed` | `queue.rs` | `i64` (job_id) | `VideoGrid`, `SemanticConfigPanel` |
| `job_completed_notify` | `queue.rs` | `{ title: string, job_id: i64 }` | `layout.tsx` (Toast) |

---

*Documento Maestro de Ejecución: [KILOCODE_BASE_DOCUMENT.md](KILOCODE_BASE_DOCUMENT.md)*
"""
(docs_dir / "11_CONTRATO_DATOS_TIPOS.md").write_text(doc_11, encoding="utf-8")
print("11 OK")

# KILOCODE BASE DOCUMENT
doc_base = """# 🚀 KILOCODE — DOCUMENTO BASE DE DESARROLLO AUTÓNOMO EN BUCLE
## Pulsaria · Orquestador de Múltiples Agentes y Ejecución Continua
### Ubicación: `C:\\\\Users\\\\danie\\\\Desktop\\\\Pulsaria\\\\docs\\\\audit_2026\\\\KILOCODE_BASE_DOCUMENT.md`

---

> **INSTRUCCIÓN SUPREMA PARA AGENTES KILO CODE:**
> Estás operando en **modo orquestador autónomo multi-agente**. Tu misión es tomar este documento base, consultar los documentos de auditoría referenciados en `docs/audit_2026/` y ejecutar las tareas de programación en bucle secuencial atómico sin detenerte a pedir confirmación entre pasos.
>
> **Reglas de Seguridad Inviolables:**
> 1. No intentes elevación de privilegios fuera del diálogo estándar UAC (`Start-Process -Verb RunAs`).
> 2. No elimines `lib/mock-data.ts` ni alteres `INACTIVE_SLOTS_COUNT` (sostienen el layout visual).
> 3. Realiza un snapshot de `data/library.db` antes de modificar esquemas SQL.
> 4. Tras cada cambio, ejecuta los gates de verificación:
>    - Frontend: `npx tsc --noEmit`
>    - Backend: `cargo check` (en `src-tauri`)

---

## 📋 ÍNDICE DE AUDITORÍA CONECTADA

Antes de comenzar cada tarea, consulta el documento técnico correspondiente:
- **Stack & Dependencias:** [`01_STACK_TECNOLOGICO.md`](01_STACK_TECNOLOGICO.md)
- **Arquitectura & Flujos:** [`02_ARQUITECTURA_SISTEMA.md`](02_ARQUITECTURA_SISTEMA.md)
- **Estado de Componentes:** [`03_ESTADO_ACTUAL_COMPONENTES.md`](03_ESTADO_ACTUAL_COMPONENTES.md)
- **Catálogo de Bugs:** [`04_BUGS_CRITICOS.md`](04_BUGS_CRITICOS.md)
- **Auditoría UI/UX:** [`05_AUDITORIA_UI_UX.md`](05_AUDITORIA_UI_UX.md)
- **Backend Rust:** [`06_AUDITORIA_BACKEND_RUST.md`](06_AUDITORIA_BACKEND_RUST.md)
- **Pipeline Python:** [`07_AUDITORIA_PIPELINE_PYTHON.md`](07_AUDITORIA_PIPELINE_PYTHON.md)
- **Modelos IA & Gemini:** [`08_AUDITORIA_IA_MODELOS.md`](08_AUDITORIA_IA_MODELOS.md)
- **Features Faltantes:** [`09_FEATURES_FALTANTES.md`](09_FEATURES_FALTANTES.md)
- **Plan por Fases:** [`10_PLAN_IMPLEMENTACION_POR_FASES.md`](10_PLAN_IMPLEMENTACION_POR_FASES.md)
- **Contratos & Tipos:** [`11_CONTRATO_DATOS_TIPOS.md`](11_CONTRATO_DATOS_TIPOS.md)

---

## 🔄 ALGORITMO DEL BUCLE DE EJECUCIÓN MULTI-AGENTE

```
INICIALIZAR_BUCLE:
  1. Leer lista de tareas pendientes.
  2. Asignar la siguiente tarea al Agente Especialista correspondiente:
     - [AGENTE-RUST]    -> Tareas de main.rs, db.rs, queue.rs, embedding.rs
     - [AGENTE-PYTHON]  -> Tareas de python-workers/ (downloader, transcriber)
     - [AGENTE-UI/UX]   -> Tareas de app/, components/, hooks/
     - [AGENTE-IA]      -> Tareas de ONNX, Whisper y @google/genai
  3. Ejecutar cambios de código de forma atómica.
  4. Ejecutar Gates de Verificación:
     - TypeScript: `npx tsc --noEmit`
     - Rust: `cargo check` (en `src-tauri/`)
  5. Si falla: Reintentar corrección (máximo 2 intentos). Si persiste, marcar como BLOQUEADO en reporte.
  6. Si pasa: Marcar tarea como COMPLETADA y proceder inmediatamente a la siguiente.
  7. Al finalizar todas las tareas, actualizar `docs/SESSION_REPORT_AUTOGEN.md`.
```

---

## 🎯 LISTA MAESTRA DE TAREAS PARA KILO CODE

### BLOQUE A — CORRECCIONES CRÍTICAS INMEDIATAS (Fase 8)
- [ ] **TAREA A.1 (Agente Rust):** Conectar instancia ONNX al `QueueManager` en `src-tauri/src/main.rs` para que la indexación genere vectores reales de 384d en lugar de ceros.
- [ ] **TAREA A.2 (Agente Rust):** Reescribir `cluster_videos_by_similarity` en `src-tauri/src/db.rs` eliminando el `AVG(te.embedding_vector)` SQL y calculando el centroid en memoria.
- [ ] **TAREA A.3 (Agente Python):** Corregir bucle de playlists en `python-workers/main.py` para invocar la cadena completa de descarga, extracción de audio y transcripción.
- [ ] **TAREA A.4 (Agente UI):** Corregir lookup de `activeJob` en `components/VideoGrid.tsx` para combinar `playlistJobs` y `jobs` al abrir el modal.
- [ ] **TAREA A.5 (Agente Rust):** Añadir índices SQL `idx_embeddings_job_id` y `idx_media_job_id` en `src-tauri/src/db.rs::init_db()`.

### BLOQUE B — MEJORAS DE PRODUCTO & UX (Fases 8-10)
- [ ] **TAREA B.1 (Agente UI):** Conectar `components/SettingsPanel.tsx` con comandos Tauri `get_download_dir` y `set_download_dir`.
- [ ] **TAREA B.2 (Agente UI):** Implementar estado vacío ilustrado en `components/VideoGrid.tsx` cuando no hay videos completados.
- [ ] **TAREA B.3 (Agente UI & Rust):** Sincronizar timestamps reales de Whisper en `components/ExpandedVideoModal.tsx` (`seekTo` interactivo).
- [ ] **TAREA B.4 (Agente UI):** Barra de progreso por etapas (`Descargando` -> `Audio` -> `Transcribiendo` -> `Indexando`) en `components/QueueSection.tsx`.

### BLOQUE C — IA MULTIMODAL & CHAT RAG (Fases 10-11)
- [ ] **TAREA C.1 (Agente IA):** Crear servicio `lib/gemini.ts` usando `@google/genai` para resúmenes automáticos y categorización de videos.
- [ ] **TAREA C.2 (Agente UI & IA):** Crear componente de asistente conversacional RAG `components/ChatAssistantPanel.tsx` integrado en Sidebar.

### BLOQUE D — EXPORTACIÓN CIENTÍFICA JULIA & CIERRE (Fases 13-15)
- [ ] **TAREA D.1 (Agente Rust):** Enriquecer comando `export_semantic` en `main.rs` con segmentos y metadatos completos para ecosistema Julia.
- [ ] **TAREA D.2 (Agente Orquestador):** Generar reporte final en `docs/SESSION_REPORT_AUTOGEN.md`.

---

*Documento base generado para Kilo Code | Agosto 2026*
"""
(docs_dir / "KILOCODE_BASE_DOCUMENT.md").write_text(doc_base, encoding="utf-8")
print("KILOCODE_BASE_DOCUMENT OK")

print("\n=== TODOS LOS 12 DOCUMENTOS CREADOS CORRECTAMENTE ===")
