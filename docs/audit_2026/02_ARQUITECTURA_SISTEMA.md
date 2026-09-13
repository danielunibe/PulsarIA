# PULSARIA — AUDITORÍA 02: ARQUITECTURA DEL SISTEMA
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
