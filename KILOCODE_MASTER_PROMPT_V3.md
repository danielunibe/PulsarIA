# KILO CODE — PROMPT MAESTRO V3 (AGOSTO 2026)
## Pulsar Eventide — Sesión de Programación Autónoma en Bucle
### Lee este archivo completo PRIMERO. Luego ejecuta en orden. No pares hasta terminar.

---

> **INSTRUCCIÓN CRÍTICA PARA KILO CODE:**
> Estás en modo orquestador autónomo para el proyecto **Pulsar Eventide**.
> Tu objetivo es implementar todos los ítems de este documento en orden secuencial.
> Por cada ítem: analiza → implementa → verifica (gate TypeScript/Rust) → marca completado → sigue.
> Si un ítem falla tras 2 intentos, márcalo como BLOQUEADO en `docs/PULSAR_TASK_BACKLOG.md` y sigue con el siguiente independiente.
> Al finalizar, actualiza `docs/SESSION_REPORT_AUTOGEN.md` con resumen completo.
> **NO pidas confirmación intermedia. NO pares a mitad de la sesión.**

---

## 📍 CONTEXTO DEL PROYECTO

**Nombre:** Pulsar Eventide
**Ruta:** `C:\Users\danie\Desktop\Pulsaria`
**Tipo:** App de escritorio nativa (Rust + Tauri 2 + Next.js 15 + React 19)
**Propósito:** Descarga videos de TikTok/YouTube/Instagram, transcribe audio con IA local (faster-whisper), indexa en motor vectorial local (ONNX MiniLM-L6-v2 384d + cosine similarity en SQLite), búsqueda semántica por concepto. Soporte de Playlists Inteligentes, clustering automático y exportación al ecosistema Julia (.unib).

---

## 🏗️ ARQUITECTURA TÉCNICA

| Capa | Tecnología | Puerto |
|---|---|---|
| Frontend | Next.js 15, React 19, TailwindCSS v4, Framer Motion | 3000 |
| Bridge | Tauri 2 (invoke IPC + eventos) | — |
| Backend principal | Rust + Tokio + Axum | — |
| API REST (fallback) | Axum Gateway | 8080 |
| Base de datos | SQLite (rusqlite bundled) | — |
| Motor IA embeddings | ONNX Runtime + MiniLM-L6-v2 384d | — |
| GPU acceleration | DirectML (Intel Xe + NVIDIA RTX 3070) | — |
| Observabilidad | Prometheus | 9001 |
| Cache semántico | Redis (opcional, env REDIS_URL) | 6379 |
| Workers multimedia | Python 3.11 + faster-whisper + yt-dlp | subproceso |

---

## 🗂️ MAPA DE ARCHIVOS COMPLETO

```
C:\Users\danie\Desktop\Pulsaria\

app/
  globals.css          → Variables CSS, estilos globales, Tailwind v4
  layout.tsx           → Root layout (Toaster Sonner, SettingsProvider)
  page.tsx             → Dashboard principal: SortKey, AppTab, allJobs, StatsPanel, VideoGrid

components/
  AddLinks.tsx         → Input links + CSV/TXT. Dispara add_job via Tauri invoke
  AuroraBackground.tsx → Componente aurora alternativo
  ChatAssistantPanel.tsx → Panel chat IA (UI placeholder — conectar en Fase 11)
  ClusterPanel.tsx     → Panel de clustering auto_cluster_videos
  ColorBends.tsx       → Aurora WebGL animada (Three.js) fondo principal
  ExpandedVideoModal.tsx → Modal reproducción. Usa get_transcript (timestamps reales)
  GlowingEffect.tsx    → Efecto borde luminoso hover en cards
  Header.tsx           → Búsqueda semántica ONNX, Sort FUNCIONAL, debounce 800ms
  InactiveCardShell.tsx → Tarjeta vacía placeholder del grid
  PagePanel.tsx        → Tab "Page": controles de layout del grid
  PlaylistCard.tsx     → Tarjeta individual de playlist
  PlaylistsPanel.tsx   → Panel con lista de playlists + creación
  QueueSection.tsx     → Monitor cola de jobs en tiempo real (eventos Tauri)
  SettingsPanel.tsx    → Preferencias: conectada a get/set_download_dir Tauri
  Sidebar.tsx          → Sidebar izquierdo: tabs Dashboard|Engine|Playlists|Page|Clusters
  StatsPanel.tsx       → Métricas dashboard — YA INTEGRADO en page.tsx
  TikTokProcessor.tsx  → Componente progreso pipeline en QueueSection
  ToastNotification.tsx → Sistema notificaciones toast (Sonner)
  VideoCard.tsx        → Tarjeta video (keep/online status buttons)
  VideoCardOverlay.tsx → Overlay animado hover VideoCard
  VideoGrid.tsx        → Grid videos: sort, layout, keep filter, platform filter, playlists
  config/
    SemanticConfigPanel.tsx → Panel Engine: ONNX, DB, métricas, debug, logs en vivo

hooks/
  use-link-processor.ts → Multi-plataforma (TikTok+YouTube+Instagram)
  use-mobile.ts        → Detección responsive
  use-video-player.ts  → Control HTML5 video
  usePlaylists.ts      → CRUD playlists via Tauri invoke
  useScrollParallax.ts → Parallax fondo WebGL
  useSemanticConfig.ts → Lógica panel Engine

lib/
  design-tokens.ts     → Tokens de colores y gradientes del sistema de diseño
  mock-data.ts         → MOCK_ACTIVE_VIDEOS=[] INACTIVE_SLOTS_COUNT=12 — NO BORRAR NUNCA
  settings-context.tsx → Context React de preferencias de usuario
  utils.ts             → cn() helper para classnames

python-workers/
  main.py              → Orchestrator daemon: modo CLI (--job_id --url) + modo STDIN daemon
  downloader.py        → Descarga con yt-dlp + extract_metadata + extract_playlist_videos
  audio_extractor.py   → Extrae WAV 16kHz mono con ffmpeg
  transcriber.py       → STT con faster-whisper. Retorna {text, segments[{start,end,text}]}
  embed_query.py       → Genera embedding desde Python para consulta directa
  events.py            → emit_event / emit_error (JSON → stdout → Rust stdin reader)
  models.py            → JobInput dataclass
  requirements.txt     → faster-whisper, ctranslate2, torch, yt-dlp, ffmpeg-python

src-tauri/src/
  main.rs              → Entrypoint Tauri + AppState + 28 comandos invoke registrados
  db.rs                → Capa SQLite: 6 tablas, migrations, búsqueda cosine similarity
  embedding.rs         → Motor ONNX MiniLM-L6-v2 384d: tokenizer + inference + mean pooling + L2 norm
  queue.rs             → QueueManager async: dispatch Python subprocess, indexa embeddings
  api/gateway.rs       → Axum REST API puerto 8080
  api/middleware/      → Security (JWT + RateLimiter)
  application/         → SearchService, QueueService, CrossEncoderReranker (Clean Architecture)
  domain/              → Modelos de dominio, EmbeddingEngine trait port
  infrastructure/      → SqliteRepo, VectorShardManager (HNSW 4 shards), SemanticCache (Redis)
                         Prometheus observability, scheduler cron mantenimiento
  distributed/         → QueryCoordinator (modo cluster, opcional via ENV)
  maintenance/         → ReindexPipeline (rebuild nocturno cada 24h)
  resilience/          → Circuit breakers + retry logic

src-tauri/assets/models/all-MiniLM-L6-v2/
  model.onnx           → Modelo ONNX 90MB — PRESENTE Y LISTO
  tokenizer.json       → Tokenizador 711KB — PRESENTE Y LISTO
  config.json, vocab.txt → Archivos de soporte

data/                  → NO TOCAR: SQLite library.db + índices HNSW (datos runtime)
```

---

## 📋 COMANDOS TAURI DISPONIBLES (28 registrados)

```typescript
// Jobs / Queue
invoke('add_job', { url: string }) → i64
invoke('get_jobs') → JobRecord[]
invoke('get_base_path') → string

// Búsqueda semántica
invoke('search_transcripts', { query: string, limit?: number, min_score?: number }) → SearchResult[]
invoke('debug_search_transcripts', { query: string }) → DebugSearchResult

// Motor ONNX
invoke('get_model_status') → ModelStatus
invoke('reload_model') → void

// Config de búsqueda
invoke('get_search_config') → SearchConfig
invoke('update_search_config', { min_score, max_results, chunk_size, chunk_overlap }) → void

// Base de datos
invoke('get_db_status') → DbStatus
invoke('rebuild_index') → void
invoke('vacuum_db') → void
invoke('recompute_embeddings') → void

// Métricas
invoke('get_system_metrics') → SystemMetrics

// Playlists
invoke('get_playlists') → PlaylistRecord[]
invoke('create_playlist', { name, description?, color? }) → i64
invoke('add_to_playlist', { playlistId: i64, jobId: i64 }) → void
invoke('remove_from_playlist', { playlistId: i64, jobId: i64 }) → void
invoke('get_playlist_items', { playlistId: i64 }) → JobRecord[]
invoke('delete_playlist', { playlistId: i64 }) → void

// Transcripción
invoke('get_transcript', { jobId: i64 }) → TranscriptChunk[]
// TranscriptChunk: { chunk_index: i64, chunk_text: string, start: f64, end: f64 }

// Clustering
invoke('auto_cluster_videos', { threshold?: f32, minClusterSize?: usize }) → i64[][]

// Keep status
invoke('set_video_keep_status', { jobId: i64, status: string }) → void

// Export / Import
invoke('export_semantic', { jobId: i64 }) → string  // formato .unib
invoke('import_semantic', { content: string }) → void
invoke('export_library_json') → string  // JSON completo de la biblioteca

// Settings
invoke('set_download_dir', { path: string }) → void
invoke('get_download_dir') → string
```

### Eventos Tauri emitidos por el backend:
```typescript
listen('job_progress', (event) => ...)       // ProgressEvent: job, step, progress, metadata, text, segments
listen('media_indexed', (event) => ...)      // job_id number — embedding indexado
listen('job_completed_notify', (event) => ...)  // { title, job_id }
listen('system-log', (event) => ...)         // string mensaje de log
```

---

## 🎨 SISTEMA DE DISEÑO — TOKENS (Nunca romper consistencia visual)

| Token | Valor |
|---|---|
| Fondo base | `#0a0a0a` |
| Aurora WebGL | `#ff5c7a`, `#8a5cff`, `#00ffd1` |
| Glassmorphism | `rgba(10,12,20,0.85)` + `backdropFilter: blur(40px)` |
| Bordes | `rgba(255,255,255,0.08)` a `rgba(255,255,255,0.1)` |
| Rojo TikTok / CTA | `#fe2c55` |
| Cian / búsqueda | `#25f4ee` |
| Verde / completado | `#10b981` |
| Violeta / IA / playlists | `#8a5cff` |
| Texto fuerte | `rgba(255,255,255,0.90)` |
| Texto secundario | `rgba(255,255,255,0.50)` |
| Bordes cards | `rounded-[18px]` a `rounded-[24px]` |
| Animaciones | Motion spring, stiffness 400-500, damping 30-35 |
| Paleta playlists | `#fe2c55, #8a5cff, #25f4ee, #f59e0b, #10b981, #ec4899, #3b82f6, #f97316` |

---

## 🚫 REGLAS ABSOLUTAS (Nunca violarlas)

1. **NO** modificar `src-tauri/src/` sin verificar que compila (`cargo check` en `src-tauri/`).
2. **NO** eliminar `lib/mock-data.ts` ni cambiar `INACTIVE_SLOTS_COUNT`.
3. **NO** borrar datos de `data/` (SQLite + índices HNSW) sin snapshot previo en `_runtime_backups/`.
4. Avance **atómico**: completa un ítem → verifica que compila → pasa al siguiente.
5. **Gates obligatorios** entre bloques:
   - Frontend: `cd C:\Users\danie\Desktop\Pulsaria && npx tsc --noEmit`
   - Backend: `cd C:\Users\danie\Desktop\Pulsaria\src-tauri && cargo check`
6. **NO elevar privilegios** por rutas alternativas al diálogo UAC estándar de Windows.
7. Snapshot antes de tocar data: `Copy-Item "data\library.db" "_runtime_backups\snapshot_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"`
8. Actualizar `docs/PULSAR_TASK_BACKLOG.md` marcando COMPLETADO tras cada tarea exitosa.

---

## 📋 LISTA DE TAREAS — EJECUTAR EN ORDEN

---

### BLOQUE 0 — VALIDACIÓN INICIAL (EJECUTAR PRIMERO)

#### TAREA 0.1 — Gate TypeScript
```powershell
cd C:\Users\danie\Desktop\Pulsaria
npx tsc --noEmit
```
Debe salir con código 0 y 0 errores. **Si falla, detener y reportar.**

#### TAREA 0.2 — Gate Rust (cargo check)
```powershell
cd C:\Users\danie\Desktop\Pulsaria\src-tauri
cargo check 2>&1
```
Debe mostrar "Finished" sin errores. Advertencias (warnings) son aceptables.
Si AppLocker bloquea: reportar y continuar con tareas Frontend solamente.

#### TAREA 0.3 — Verificar Python venv
```powershell
cd C:\Users\danie\Desktop\Pulsaria\python-workers
# Verificar que existe el venv:
Test-Path ".venv\Scripts\python.exe"
# Si no existe, crear:
python -m venv .venv
.venv\Scripts\activate
pip install faster-whisper yt-dlp ffmpeg-python torch ctranslate2
```

#### TAREA 0.4 — Verificar ffmpeg en PATH
```powershell
ffmpeg -version
```
Si no está disponible: instalar con `winget install ffmpeg` o descargar de https://ffmpeg.org

---

### BLOQUE 1 — VALIDACIÓN FUNCIONAL DE COMANDOS (Fase 6B)

#### TAREA 1.1 — Verificar get_model_status en UI
Arrancar la app con `npm run tauri` y abrir el panel Engine (Sidebar → Engine icon).
Verificar que muestra: loaded: true, dimensions: 384, runtime: "ONNX Runtime".
Si loaded: false → ejecutar reload_model desde el panel Engine.

#### TAREA 1.2 — Verificar get_db_status en UI
En el panel Engine, verificar que DB Status muestra health: "Healthy".
Verificar que muestra indexed_videos (puede ser 0 si es primer arranque).

#### TAREA 1.3 — Verificar búsqueda semántica sin crash
En el Header de la app, buscar cualquier término ("video", "música", etc.).
Con 0 vectores indexados debe mostrar toast "Sin coincidencias" — NO debe crashear.
Si hay error de ONNX no cargado: ejecutar reload_model primero.

#### TAREA 1.4 — Verificar logs en vivo
En el panel Engine, el console de logs debe mostrar "Backend AAA-Ready initialized".
Los logs deben fluir en tiempo real cuando se ejecutan operaciones.

---

### BLOQUE 2 — PRIMER VIDEO REAL (Fase 7) — SOLO SI BLOQUE 0 PASA COMPLETO

> ⚠️ IMPORTANTE: Ejecutar este bloque ÚNICAMENTE si cargo check pasa Y Python venv está listo Y ffmpeg está en PATH.

#### TAREA 2.1 — Snapshot de seguridad
```powershell
Copy-Item "C:\Users\danie\Desktop\Pulsaria\data\library.db" `
  "C:\Users\danie\Desktop\Pulsaria\_runtime_backups\snapshot_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
```

#### TAREA 2.2 — Ingestar primer video TikTok individual
1. Con la app Tauri corriendo, ir al panel izquierdo (AddLinks).
2. Pegar UN SOLO enlace de TikTok individual (no playlist).
   Ejemplo de formato: `https://www.tiktok.com/@usuario/video/1234567890`
3. Hacer clic en "Agregar".
4. Monitorear QueueSection: debe progresar por fases:
   - downloading (15-30%) → metadata_extracted (30%) → extracting_audio (50%)
   - transcribing (65%) → transcription_complete (90%) → complete (100%)
5. Al completar: verificar toast "Video procesado" en esquina.

#### TAREA 2.3 — Verificar tarjeta en VideoGrid
- La tarjeta del video debe aparecer en el grid con título y thumbnail.
- El thumbnail debe ser el URL online real del video (no un path local vacío).
- Duración debe mostrarse correctamente.

#### TAREA 2.4 — Verificar modal y transcripción
- Click en la tarjeta → debe abrir ExpandedVideoModal.
- El video debe reproducirse (si fue descargado a data/processing/).
- La transcripción debe aparecer con timestamps clickeables.
- El botón "Copiar transcripción" debe copiar el texto al portapapeles.

#### TAREA 2.5 — Verificar búsqueda semántica con datos reales
- Buscar un término que aparezca en el video transcrito.
- Debe aparecer resultado con similitud > 0% en los resultados.
- Hacer click en el resultado debe llevar al video.

Documentar resultado en `docs/SESSION_REPORT_AUTOGEN.md`.

---

### BLOQUE 3 — FEATURES PENDIENTES

#### TAREA 3.1 — Conectar plataforma (platform) en el downloader Python

Archivo: `python-workers/downloader.py` y `python-workers/events.py`

El campo `platform` debe detectarse automáticamente desde la URL y enviarse en los eventos.
En `main.py`, función `process_single_job`, agregar detección de plataforma:

```python
def detect_platform(url: str) -> str:
    if "tiktok.com" in url:
        return "tiktok"
    elif "youtube.com" in url or "youtu.be" in url:
        return "youtube"
    elif "instagram.com" in url:
        return "instagram"
    return "unknown"
```

Agregar `platform` al dict `media_metadata`:
```python
media_metadata = {
    "title": raw_meta.get("title", f"Video #{job_id}"),
    "uploader": raw_meta.get("author") or raw_meta.get("uploader", "Creador"),
    "duration": int(raw_meta.get("duration") or 0),
    "thumbnail": raw_meta.get("thumbnail", ""),
    "upload_date": str(raw_meta.get("upload_date", "")),
    "platform": detect_platform(url),   # NUEVO
}
```

En Rust (`queue.rs`), el struct `MediaMetadata` necesita el campo `platform`:
```rust
pub struct MediaMetadata {
    pub title: String,
    pub uploader: String,
    pub duration: i32,
    pub thumbnail: String,
    pub upload_date: String,
    pub platform: Option<String>,   // NUEVO — Option para compatibilidad retroactiva
}
```

En `insert_or_update_media_metadata` en `db.rs`, agregar platform al INSERT/UPDATE:
```rust
// Actualizar firma de la función:
pub fn insert_or_update_media_metadata(
    conn: &Connection,
    job_id: i64,
    title: &str,
    author: &str,
    thumbnail: &str,
    duration: i32,
    upload_date: &str,
    video_path: &str,
    audio_path: &str,
    transcript_path: &str,
    platform: &str,  // NUEVO
) -> Result<()> {
    conn.execute(
        "INSERT INTO media (job_id, title, author, thumbnail, duration, upload_date, video_path, audio_path, transcript_path, platform)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(job_id) DO UPDATE SET
            title = excluded.title, author = excluded.author, thumbnail = excluded.thumbnail,
            duration = excluded.duration, upload_date = excluded.upload_date,
            video_path = excluded.video_path, audio_path = excluded.audio_path,
            transcript_path = excluded.transcript_path, platform = excluded.platform",
        params![job_id, title, author, thumbnail, duration, upload_date, video_path, audio_path, transcript_path, platform],
    )?;
    Ok(())
}
```

Actualizar la llamada en `queue.rs`:
```rust
let _ = crate::db::insert_or_update_media_metadata(
    &conn,
    event.job,
    &meta.title,
    &meta.uploader,
    &thumb_path,
    meta.duration,
    &meta.upload_date,
    &video_path,
    &audio_path,
    &transcript_path,
    meta.platform.as_deref().unwrap_or("unknown"),  // NUEVO
);
```

Ejecutar Gates: `cargo check` + `npx tsc --noEmit`

---

#### TAREA 3.2 — Mejorar QueueSection con indicador visual de fases

Archivo: `components/TikTokProcessor.tsx`

Implementar indicador visual de fases del pipeline como puntos conectados:
- Fases: `downloading` (#25f4ee), `extracting_audio` (#f59e0b), `transcribing` (#8a5cff), `complete` (#10b981)
- Cada fase es un círculo de 10px. Completados tienen el color de fase, pendientes son rgba(255,255,255,0.15).
- Círculos conectados por líneas horizontales de 2px de grosor.
- El círculo activo tiene un efecto de pulso (CSS animation ping).

```tsx
const PHASES = [
    { key: 'downloading', label: 'Descarga', color: '#25f4ee' },
    { key: 'extracting_audio', label: 'Audio', color: '#f59e0b' },
    { key: 'transcribing', label: 'Transcripción', color: '#8a5cff' },
    { key: 'complete', label: 'Indexado', color: '#10b981' },
];

// Determinar índice de fase actual:
const currentPhaseIndex = PHASES.findIndex(p => step.startsWith(p.key));
```

Verificar: `npx tsc --noEmit`

---

#### TAREA 3.3 — Agregar endpoint Julia al API REST

Archivo: `src-tauri/src/api/gateway.rs`

Agregar endpoints para consumo desde Julia:

```rust
// GET /api/v1/julia/pending — retorna jobs con julia_ready = true
// POST /api/v1/julia/ack — marca job como exportado (julia_exported = true)
```

En `db.rs`, agregar columna `julia_exported` a tabla `media`:
```rust
let _ = conn.execute("ALTER TABLE media ADD COLUMN julia_exported BOOLEAN DEFAULT 0", []);
```

Función `get_julia_ready_jobs`:
```rust
pub fn get_julia_ready_jobs(conn: &Connection) -> Result<Vec<JobRecord>> {
    // SELECT jobs con transcript_embeddings count > 0 y julia_exported = 0
}
```

Ejecutar Gate: `cargo check`

---

#### TAREA 3.4 — Validar y documentar pipeline completo

Solo ejecutar si TAREA 2.2 a 2.5 pasaron exitosamente.

Documentar en `docs/SESSION_REPORT_AUTOGEN.md`:
1. URL de video procesado
2. Tiempo de cada fase (downloading, transcripción, embedding)
3. Número de chunks de texto indexados
4. Score de similitud máximo en búsqueda semántica
5. Estado final: OK / PARCIAL / FALLIDO

---

### BLOQUE 4 — PULIDO Y OPTIMIZACIONES

#### TAREA 4.1 — Optimizar scheduler HNSW (fix restart en dev mode)

Archivo: `src-tauri/src/infrastructure/scheduler.rs`
Problema: Los snapshots HNSW se escriben en ruta relativa dentro de `src-tauri/`,
lo que provoca que el watcher de Tauri detecte cambios y reinicie la ventana cada ~10 min.

Cambiar la ruta de snapshots de:
```rust
// Ruta actual (dentro de src-tauri/)
let snapshot_path = format!("data/vector_index_shard_{}.hnsw", shard_id);
```
A:
```rust
// Ruta fuera del directorio vigilado
let snapshot_path = format!("../data/vector_snapshots/shard_{}.hnsw", shard_id);
// Asegurar que el directorio existe:
std::fs::create_dir_all("../data/vector_snapshots").ok();
```

Ejecutar Gate: `cargo check`

#### TAREA 4.2 — Mejorar estado vacío del VideoGrid con instrucciones

Archivo: `components/VideoGrid.tsx`
Estado actual: Muestra icono FaFolderOpen y texto básico cuando no hay videos.
Mejora: Agregar pasos numerados explicando cómo agregar el primer video.

```tsx
// En el showEmptyState block, reemplazar el contenido con:
<div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
    {[
        'Haz click en el icono + en la barra lateral izquierda',
        'Pega uno o más enlaces de TikTok, YouTube o Instagram',
        'Haz click en "Agregar" y monitorea el progreso en la cola',
        'Tus videos aparecerán aquí una vez procesados'
    ].map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ 
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #fe2c55, #8a5cff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700, color: 'white', flexShrink: 0
            }}>{i + 1}</span>
            <p style={{ color: '#aaa', fontSize: '14px', margin: 0 }}>{step}</p>
        </div>
    ))}
</div>
```

Verificar: `npx tsc --noEmit`

---

## 📊 MATRIZ DE ESTADO

| Tarea | Archivo(s) | Prioridad | Bloqueantes |
|---|---|---|---|
| 0.1 Gate TypeScript | — | CRÍTICA | Ninguno |
| 0.2 Gate cargo check | — | CRÍTICA | AppLocker Windows |
| 0.3 Python venv | python-workers/ | ALTA | Ninguno |
| 0.4 ffmpeg PATH | Sistema | ALTA | Ninguno |
| 1.1-1.4 Validación comandos | UI | ALTA | Bloques 0 |
| 2.1-2.5 Primer video real | App completa | CRÍTICA | Bloques 0 + 1 |
| 3.1 Platform en metadata | queue.rs, db.rs, main.py | ALTA | cargo check |
| 3.2 QueueSection fases | TikTokProcessor.tsx | MEDIA | Ninguno |
| 3.3 Endpoint Julia | gateway.rs, db.rs | MEDIA | cargo check |
| 3.4 Documentar pipeline | SESSION_REPORT | ALTA | Bloque 2 |
| 4.1 Fix scheduler HNSW | scheduler.rs | MEDIA | cargo check |
| 4.2 Empty state VideoGrid | VideoGrid.tsx | BAJA | Ninguno |

---

## 🔄 ALGORITMO DEL BUCLE AUTÓNOMO

```
INICIAR:
  1. Leer este documento completo
  2. Ejecutar BLOQUE 0 — verificar gates
  3. Si TypeScript gate falla → DETENER y reportar error con línea exacta
  4. Si cargo check falla por AppLocker → marcar Backend como SKIP, continuar Frontend

REPEAT:
  1. Leer docs/PULSAR_TASK_BACKLOG.md → tomar primer ticket PENDIENTE
  2. Si modifica src-tauri/ → hacer snapshot de data/ primero
  3. Implementar cambios atómicos en el archivo correspondiente
  4. Ejecutar gate apropiado (tsc --noEmit y/o cargo check)
  5. Si falla: corregir (max 2 intentos) → si sigue fallando: marcar BLOQUEADO en backlog
  6. Si éxito: marcar ticket COMPLETADO en docs/PULSAR_TASK_BACKLOG.md
  7. Continuar con siguiente ticket
UNTIL: No quedan tickets pendientes

THEN:
  Actualizar docs/SESSION_REPORT_AUTOGEN.md con resumen completo
```

---

## ✅ AL TERMINAR LA SESIÓN

Crear/actualizar `docs/SESSION_REPORT_AUTOGEN.md` con:
- Fecha y duración estimada de la sesión
- Lista de tareas completadas (con nombre y archivo modificado)
- Lista de tareas bloqueadas (con razón del bloqueo)
- Bugs encontrados y corregidos
- Archivos creados/modificados
- Estado del pipeline end-to-end (OK / PARCIAL / FALLIDO)
- Próximos pasos sugeridos para la siguiente sesión

---

## 📦 DEPENDENCIAS VERIFICADAS

```
PRESENTES:
  - Node.js + npm (package.json listo)
  - Tauri 2 CLI (@tauri-apps/cli ^2.10.1 en devDependencies)
  - Next.js 15.4.9
  - React 19.2.1
  - ONNX model: src-tauri/assets/models/all-MiniLM-L6-v2/model.onnx (90MB)
  - SQLite: rusqlite bundled (no requiere instalación externa)

REQUIEREN VERIFICACIÓN EN SISTEMA:
  - Rust + Cargo (rustup.rs — si no está: https://rustup.rs)
  - Python 3.10 o 3.11 (python.org)
  - ffmpeg en PATH (winget install ffmpeg)
  - Microsoft Visual C++ Build Tools (para compilar Rust en Windows)
  - Python venv: python-workers/.venv/Scripts/python.exe

OPCIONALES (para features avanzados):
  - Redis (para SemanticCache) — si no está, el cache se desactiva gracefully
  - NVIDIA/Intel GPU drivers actualizados (para DirectML acceleration)
```

---

## 🔍 ERRORES CONOCIDOS Y SOLUCIONES

| Error | Solución |
|---|---|
| `cargo` bloqueado por AppLocker | Ejecutar desde terminal con permisos de admin vía UAC estándar |
| `npm run build` falla con Next.js binarios corruptos | `Remove-Item -Recurse .next\cache` luego `npm install` |
| ONNX `loaded: false` en panel Engine | Click "Reload Model" en SemanticConfigPanel |
| Python worker `FileNotFoundError` | Verificar que `.venv` existe y tiene los paquetes instalados |
| `ffmpeg not found` en audio_extractor.py | Instalar ffmpeg y agregar al PATH del sistema |
| `yt-dlp` no descarga video | Actualizar: `.venv\Scripts\pip install -U yt-dlp` |
| DB error `no such column: platform` | Ya corregido — las migraciones ALTER TABLE se ejecutan en init_db() |
| `playlist_items` COUNT error | Ya corregido — COUNT(pi.job_id) en lugar de COUNT(pi.id) |

---

*Generado por: Antigravity IDE*
*Fecha: 2026-08-23*
*Versión: 3.0*
*Basado en: Auditoría técnica completa del código fuente real*
*Para: Kilo Code — Sesión de programación autónoma Pulsar Eventide*
