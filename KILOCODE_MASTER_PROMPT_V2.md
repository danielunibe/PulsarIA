# KILOCODE - PROMPT MAESTRO V2 (AGOSTO 2026)
## Pulsar Eventide - Sesion de Programacion Autonoma en Bucle
### Lee este archivo completo primero. Luego ejecuta en orden. No pares hasta terminar.

---

> **INSTRUCCION DE ARRANQUE PARA KILOCODE:**
> Estas en modo orquestador autonomo. Tu objetivo es implementar todos los items de este documento en orden secuencial. Por cada item: analiza, implementa, verifica, marca como completado, sigue. No pidas confirmacion intermedia. Si un item falla tras 2 intentos, registralo como BLOQUEADO en `docs/PULSAR_TASK_BACKLOG.md` y sigue con el siguiente item independiente. Al finalizar la sesion, actualiza `docs/SESSION_REPORT_AUTOGEN.md` con el resumen de lo ejecutado.

---

## CONTEXTO DEL PROYECTO (Estado Agosto 2026)

**Nombre:** Pulsar Eventide
**Ruta:** `C:\Users\danie\Desktop\Pulsaria`
**Tipo:** App de escritorio nativa (Rust + Tauri 2 + Next.js 15 + React 19)
**Proposito:** Descarga videos de TikTok/YouTube/Instagram, transcribe audio con IA, indexa en motor vectorial local (ONNX + HNSW en Rust), busqueda semantica por concepto. Soporta Playlists Inteligentes, clustering automatico y exportacion hacia ecosistema Julia.

### Estado Actual del Sistema (Post-Sesion Agosto 2026)

| Componente | Estado |
|---|---|
| Frontend Next.js 15 / React 19 | OK - Funcional (npm run dev en puerto 3000) |
| Backend Rust + Tauri 2 + Axum | OK - Compilado y funcional |
| SQLite (library.db) | OK - Tablas: jobs, media, transcript_embeddings, playlists, playlist_items |
| Motor ONNX (MiniLM 384d) | OK - Cargado en arranque |
| Python Workers (downloader, transcriber) | OK - Mejorados con metadatos reales y timestamps |
| Pipeline end-to-end | PENDIENTE - No verificado con video real (requiere Fase 7) |
| Busqueda semantica | OK - Implementada, sin datos reales (0 vectores indexados) |
| Playlists | OK - Backend completo, UI integrada en Sidebar |
| Clustering automatico | OK - auto_cluster_videos en Rust, ClusterPanel.tsx creado |
| Sort funcional | OK - Conectado Header -> VideoGrid |
| Keep/Online status | OK - Botones en VideoCard, comando set_video_keep_status |
| StatsPanel | PENDIENTE - Componente creado pero NO integrado en page.tsx |
| Panel Page | OK - PagePanel.tsx + tab en Sidebar |
| cargo check | BLOQUEADO - AppLocker de Windows bloquea ejecucion |
| npm run build | BLOQUEADO - Binarios nativos corruptos de Next.js en Windows |

---

## MAPA DE ARCHIVOS COMPLETO

```
C:\Users\danie\Desktop\Pulsaria\

app/
  globals.css          - Variables CSS, estilos globales, Tailwind v4
  layout.tsx           - Root layout (Toaster de Sonner, SettingsProvider)
  page.tsx             - Dashboard principal: SortKey, AppTab, selectedPlaylistId, pageConfig, allJobs

components/
  AddLinks.tsx         - Input links + archivo CSV/TXT. Dispara add_job via Tauri
  AuroraBackground.tsx - Componente aurora alternativo
  ClusterPanel.tsx     - Panel de clustering automatico (auto_cluster_videos)
  ColorBends.tsx       - Aurora WebGL animada (Three.js)
  ExpandedVideoModal.tsx - Modal de reproduccion. Usa get_transcript (real)
  GlowingEffect.tsx    - Efecto de borde luminoso en hover de cards
  Header.tsx           - Barra superior: busqueda semantica, contador, Sort (FUNCIONAL)
  InactiveCardShell.tsx - Tarjeta vacia placeholder del grid
  PagePanel.tsx        - Tab "Page": controles de layout del grid
  PlaylistCard.tsx     - Tarjeta individual de playlist
  PlaylistsPanel.tsx   - Panel con lista de playlists + creacion
  QueueSection.tsx     - Monitor de cola de jobs en tiempo real
  SettingsPanel.tsx    - Preferencias: solo localStorage (PENDIENTE conectar backend)
  Sidebar.tsx          - Sidebar izquierdo: tabs Dashboard|Engine|Playlists|Page
  StatsPanel.tsx       - Metricas de uso en Dashboard - PENDIENTE INTEGRAR en page.tsx
  TikTokProcessor.tsx  - Componente interno de QueueSection para progreso
  ToastNotification.tsx - Sistema de notificaciones toast
  VideoCard.tsx        - Tarjeta individual de video (con keep/online buttons)
  VideoCardOverlay.tsx - Overlay animado en hover de VideoCard
  VideoGrid.tsx        - Grid de videos (sort, layout, keep filter, platform filter)
  config/
    SemanticConfigPanel.tsx - Panel Engine: ONNX, DB, metricas, debug, logs

hooks/
  use-link-processor.ts - Multi-plataforma (TikTok+YouTube+Instagram)
  use-mobile.ts        - Deteccion responsive
  use-video-player.ts  - Control HTML5 video
  usePlaylists.ts      - CRUD de playlists via Tauri invoke
  useScrollParallax.ts - Parallax del fondo WebGL
  useSemanticConfig.ts - Logica del panel Engine

lib/
  design-tokens.ts     - Tokens de colores y gradientes
  mock-data.ts         - MOCK_ACTIVE_VIDEOS=[] INACTIVE_SLOTS_COUNT=12 - NO BORRAR
  settings-context.tsx - Context React de preferencias
  utils.ts             - cn() helper para classnames

python-workers/
  main.py              - Orchestrator daemon: modo CLI + modo STDIN daemon
  downloader.py        - Descarga con yt-dlp + extract_metadata + extract_playlist_videos
  audio_extractor.py   - Extrae WAV 16kHz mono con ffmpeg
  transcriber.py       - STT con faster-whisper. Retorna {text, segments[]}
  embed_query.py       - Genera embedding desde Python para una query
  events.py            - Helpers emit_event / emit_error (JSON -> stdout hacia Rust)
  models.py            - Dataclass JobInput (url, job_id)
  requirements.txt     - faster-whisper, yt-dlp

src-tauri/src/
  main.rs              - Entrypoint Tauri + AppState + comandos invoke registrados:
                         add_job, get_jobs, get_base_path, search_transcripts,
                         get_model_status, reload_model, get_search_config,
                         update_search_config, get_db_status, debug_search_transcripts,
                         get_system_metrics, rebuild_index, vacuum_db,
                         recompute_embeddings, get_playlists, create_playlist,
                         add_to_playlist, remove_from_playlist, get_playlist_items,
                         delete_playlist, get_transcript, auto_cluster_videos,
                         set_video_keep_status, export_semantic, import_semantic
  db.rs                - Capa SQLite: JobRecord, SearchResult, PlaylistRecord
                         Tablas: jobs, media, transcript_embeddings, playlists, playlist_items
  embedding.rs         - Motor ONNX MiniLM 384d + busqueda vectorial
  queue.rs             - QueueManager async: despacha workers Python
  api/                 - Gateway REST Axum en puerto 8080
  application/         - SearchService, QueueService, Reranker
  domain/              - Entidades y puertos
  infrastructure/      - SQLiteRepo, VectorShardManager, SemanticCache, Observability
  distributed/         - QueryCoordinator (modo cluster opcional)
  maintenance/         - ReindexPipeline (rebuild nocturno)
  resilience/          - Circuit breakers y retry logic

types/                 - Tipos TypeScript compartidos
docs/
  PULSAR_MASTER_AUDIT_AND_PRODUCT_DIRECTION.md
  PULSAR_ARCHITECTURE_AND_SPECS.md
  PULSAR_TASK_BACKLOG.md
  PULSAR_AUTONOMOUS_EXECUTION_LOOP.md
  SESSION_REPORT_AUTOGEN.md

data/                  - NO TOCAR: SQLite + indices HNSW (datos runtime)
```

---

## SISTEMA DE DISENO (mantener coherencia visual siempre)

| Token | Valor |
|---|---|
| Fondo base | #0a0a0a |
| Aurora WebGL | #ff5c7a, #8a5cff, #00ffd1 |
| Superficies glassmorphism | rgba(10,12,20,0.85) + backdropFilter: blur(40px) |
| Bordes | rgba(255,255,255,0.08) a rgba(255,255,255,0.1) |
| Rojo TikTok / CTA | #fe2c55 |
| Cian / busqueda | #25f4ee |
| Verde / completado | #10b981 |
| Violeta / IA / playlists | #8a5cff |
| Texto fuerte | rgba(255,255,255,0.90) |
| Texto secundario | rgba(255,255,255,0.50) |
| Esquinas | rounded-[18px] a rounded-[24px] |
| Animaciones | Motion spring, stiffness 400-500, damping 30-35 |
| Paleta playlists | #fe2c55, #8a5cff, #25f4ee, #f59e0b, #10b981, #ec4899, #3b82f6, #f97316 |

---

## REGLAS ABSOLUTAS (nunca violarlas)

1. NO modificar src-tauri/src/ sin antes verificar que compila (cargo check en src-tauri/).
2. NO eliminar lib/mock-data.ts ni cambiar INACTIVE_SLOTS_COUNT.
3. NO borrar datos de data/ (SQLite + indices HNSW) sin snapshot previo en _runtime_backups/.
4. Avance atomico: completa un item, verifica que compila, luego pasa al siguiente.
5. Gates obligatorios entre bloques:
   - Frontend: cd C:\Users\danie\Desktop\Pulsaria && npx tsc --noEmit
   - Backend: cd C:\Users\danie\Desktop\Pulsaria\src-tauri && cargo check
6. NO elevar privilegios por rutas alternativas al dialogo UAC estandar de Windows.
7. Actualizar el backlog: tras completar cada tarea, marcarla como COMPLETADO en docs/PULSAR_TASK_BACKLOG.md.

---

## LISTA DE TAREAS - EJECUTAR EN ORDEN

---

### BLOQUE 0 - PENDIENTES INMEDIATOS DE SESION ANTERIOR

#### TAREA 0.1 - Integrar StatsPanel en el Dashboard
Archivo: app/page.tsx y components/StatsPanel.tsx
Estado: El componente StatsPanel.tsx existe y esta completo, pero NO esta renderizado en page.tsx.

Que hacer:
1. Importar StatsPanel en app/page.tsx:
   import { StatsPanel } from '@/components/StatsPanel';

2. Anadir el componente en el area principal cuando activeTab === 'dashboard', ENCIMA del VideoGrid:
   Cuando activeTab es 'dashboard', renderizar <StatsPanel jobs={allJobs} /> antes del VideoGrid.

3. Verificar que StatsPanel acepta la prop jobs: any[] en su interfaz. Si no, ajustar su interfaz de props.

Verificar: npx tsc --noEmit pasa sin errores.

---

#### TAREA 0.2 - Conectar SettingsPanel al backend (Carpeta de descarga)
Archivo: components/SettingsPanel.tsx y src-tauri/src/main.rs
Estado: SettingsPanel solo usa localStorage. La carpeta de descarga no llega al backend Python.

Que hacer en main.rs (anadir antes del bloque tauri::Builder):

```rust
#[tauri::command]
async fn set_download_dir(path: String) -> Result<(), String> {
    std::env::set_var("PULSAR_DOWNLOAD_DIR", &path);
    Ok(())
}

#[tauri::command]
async fn get_download_dir() -> Result<String, String> {
    Ok(std::env::var("PULSAR_DOWNLOAD_DIR")
        .unwrap_or_else(|_| "C:/Users/danie/Downloads".to_string()))
}
```

Registrar en .invoke_handler():
set_download_dir, get_download_dir,

En SettingsPanel.tsx al cargar el panel usar:
const { invoke } = await import('@tauri-apps/api/core');
const dir = await invoke<string>('get_download_dir');

Al guardar usar:
await invoke('set_download_dir', { path: newDir });

Ejecutar Gate: cargo check + npx tsc --noEmit.

---

### BLOQUE 1 - BUGS PENDIENTES

#### TAREA 1.1 - Corregir integración playlist en daemon mode (main.py)
Archivo: python-workers/main.py
Problema: En el bloque de procesamiento de playlists de TikTok (lineas 120-129), no se llama 
a transcribe_audio ni se emite metadata_extracted con media_metadata normalizado.

Reemplazar el bucle for de procesamiento de playlist (aprox lineas 120-129) con version completa:

```python
for idx, video_url in enumerate(video_urls):
    sub_job_id = job.job_id * 1000 + idx
    try:
        emit_event("download_started", job_id=sub_job_id, step="downloading", progress=25)
        raw_meta = extract_metadata(url=video_url)
        media_metadata = {
            "title": raw_meta.get("title", f"Video #{sub_job_id}"),
            "uploader": raw_meta.get("author") or raw_meta.get("uploader", "Creador"),
            "duration": int(raw_meta.get("duration") or 0),
            "thumbnail": raw_meta.get("thumbnail", ""),
            "upload_date": str(raw_meta.get("upload_date", "")),
        }
        emit_event("metadata_extracted", message=json.dumps(raw_meta), job_id=sub_job_id, step="metadata", progress=30, metadata=media_metadata)
        video_path = download_video(url=video_url, job_id=sub_job_id, base_dir=base_dir)
        emit_event("download_complete", message=video_path, job_id=sub_job_id, step="extracting_audio", progress=50, metadata=media_metadata)
        audio_path = extract_audio(video_path=video_path)
        transcript_result = transcribe_audio(audio_path=audio_path)
        transcript_text = transcript_result["text"] if isinstance(transcript_result, dict) else transcript_result
        segments = transcript_result.get("segments", []) if isinstance(transcript_result, dict) else []
        emit_event("transcription_complete", job_id=sub_job_id, step="transcription_complete", progress=90, metadata=media_metadata, text=transcript_text, segments=segments)
        emit_event("completed", job_id=sub_job_id, step="complete", progress=100, metadata=media_metadata, text=transcript_text, segments=segments)
    except Exception as e:
        emit_error(f"Error procesando video de playlist {video_url}: {str(e)}", job_id=sub_job_id)
```

Verificar: python python-workers/main.py --help no arroja errores de importacion.

---

#### TAREA 1.2 - Agregar campo platform a JobRecord
Archivos: src-tauri/src/db.rs
Problema: JobRecord no tiene campo platform. El frontend muestra badges pero los lee de la URL, no de la DB.

En db.rs - Struct JobRecord, anadir al final de los campos:
    pub platform: Option<String>,

En db.rs - CREATE TABLE media, anadir la columna:
    platform TEXT,

En db.rs - get_all_jobs(), incluir platform en el SELECT y en el mapeo del row.

Ejecutar Gate: cargo check.

---

### BLOQUE 2 - FEATURES DE PRODUCTO

#### TAREA 2.1 - Completar integracion del ClusterPanel en el Sidebar
Archivos: components/Sidebar.tsx, components/ClusterPanel.tsx, app/page.tsx

Verificar:
1. Abrir components/Sidebar.tsx. Si no existe tab 'clusters', anadir tab con icono adecuado.
2. En app/page.tsx, si 'clusters' no esta en el tipo AppTab, anadir: type AppTab = 'dashboard' | 'semantic-config' | 'playlists' | 'page' | 'clusters';
3. En el area de renderizado condicional de page.tsx, anadir:
   activeTab === 'clusters' ? <ClusterPanel /> : ...
4. ClusterPanel debe invocar auto_cluster_videos con threshold configurable (default 0.7).

Verificar: npx tsc --noEmit pasa.

---

#### TAREA 2.2 - Modal de transcripcion sincronizada en ExpandedVideoModal
Archivo: components/ExpandedVideoModal.tsx

Implementar/verificar:
1. Al abrir el modal, invocar get_transcript(job_id) para obtener Vec<(i64, String)> (timestamp_ms, text).
2. Renderizar segmentos como lista de subtitulos con timestamps clickeables que hacen seek en el video.
3. formatTime(ms: number): string -> convierte milisegundos a MM:SS
4. seekTo(seconds: number) -> videoRef.current.currentTime = seconds
5. Anadir boton "Copiar transcripcion" que copia el texto completo al portapapeles.

Verificar: npx tsc --noEmit pasa.

---

#### TAREA 2.3 - Notificaciones toast al completar video (verificar e implementar si falta)
Archivo: app/layout.tsx o app/page.tsx

En el componente principal, anadir un useEffect que escuche el evento 'job_completed_notify' de Tauri:

```typescript
useEffect(() => {
  let unlisten: (() => void) | undefined;
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen('job_completed_notify', (event: any) => {
      toast.success('Video procesado', {
        description: event.payload.title,
        duration: 5000,
      });
    }).then(fn => { unlisten = fn; });
  });
  return () => { unlisten?.(); };
}, []);
```

En queue.rs de Rust, al completar un job, emitir el evento:
app_handle.emit("job_completed_notify", serde_json::json!({"title": title, "job_id": job_id})).ok();

Verificar: npx tsc --noEmit pasa.

---

#### TAREA 2.4 - Mejorar export_semantic con datos reales
Archivo: src-tauri/src/main.rs

Reemplazar la funcion export_semantic actual con version que incluye transcripcion real:
La funcion debe:
1. Obtener el job por job_id de get_all_jobs()
2. Obtener segmentos de transcripcion via db::get_transcript_segments(&db, job_id)
3. Ensamblar transcript_full concatenando todos los segmentos
4. Retornar JSON estructurado con source, version, video_id, url, platform, title, author, duration, transcript, segments (con timestamp_ms y text), julia_ready=!transcript.is_empty(), exported_at como RFC3339.

Ejecutar Gate: cargo check.

---

### BLOQUE 3 - MEJORAS UX/UI

#### TAREA 3.1 - Estado vacio mejorado en VideoGrid
Archivo: components/VideoGrid.tsx

Cuando completedJobs.length === 0, renderizar antes de los slots vacios:
Un contenedor centrado que muestre un icono, titulo "Biblioteca vacia" y subtitulo explicando que deben pegar un enlace en el panel izquierdo para comenzar.
Usar los colores del sistema de diseno (#fe2c55 y #8a5cff como gradiente en el icono).

Verificar: npx tsc --noEmit pasa.

---

#### TAREA 3.2 - Indicador de progreso por fases en QueueSection
Archivo: components/QueueSection.tsx y/o components/TikTokProcessor.tsx

Implementar indicador visual de fases del pipeline como puntos conectados:
Fases: downloading (#25f4ee), extracting_audio (#f59e0b), transcribing (#8a5cff), indexing (#10b981), complete (#fe2c55).
Cada fase es un circulo de 8px. Circles completos tienen el color de la fase, pendientes son rgba(255,255,255,0.1).
Los circulos estan conectados por lineas horizontales.

Verificar: npx tsc --noEmit pasa.

---

#### TAREA 3.3 - Busqueda semantica con debounce en Header
Archivo: components/Header.tsx

La busqueda actualmente solo se dispara al presionar Enter.
Implementar debounce de 800ms: cuando el usuario deja de escribir por 800ms y el texto tiene 3+ caracteres, disparar onSearchSubmit automaticamente.
Usar useRef para el timer del debounce.
Si el texto se borra completamente, llamar onSearchClear().

Verificar: npx tsc --noEmit pasa.

---

### BLOQUE 4 - FEATURES AVANZADOS

#### TAREA 4.1 - Vista videos de playlist en VideoGrid
Archivos: components/VideoGrid.tsx

Verificar que VideoGrid, cuando recibe prop playlistId (no null/undefined), invoca get_playlist_items y muestra solo esos videos.
Si no esta implementado, anadir:

```typescript
const [playlistJobs, setPlaylistJobs] = useState<any[] | null>(null);

useEffect(() => {
  if (playlistId !== undefined && playlistId !== null) {
    const loadPlaylistItems = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const items = await invoke<any[]>('get_playlist_items', { playlistId });
        setPlaylistJobs(items);
      } catch {}
    };
    loadPlaylistItems();
  } else {
    setPlaylistJobs(null);
  }
}, [playlistId]);

// Usar playlistJobs || completedJobs en el renderizado
```

Verificar: npx tsc --noEmit pasa.

---

#### TAREA 4.2 - Exportar Biblioteca a JSON
Archivos: components/StatsPanel.tsx o components/Header.tsx, src-tauri/src/main.rs

En main.rs, anadir comando:
```rust
#[tauri::command]
async fn export_library_json(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().await;
    let jobs = db::get_all_jobs(&db).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&jobs).map_err(|e| e.to_string())
}
```

Registrar en .invoke_handler(): export_library_json

En el frontend, boton que invoca el comando, crea un Blob JSON y lo descarga via link temporal con nombre pulsar-library-TIMESTAMP.json.

Ejecutar Gate: cargo check + npx tsc --noEmit.

---

### BLOQUE 5 - VALIDACION PIPELINE (cuando sea posible)

#### TAREA 5.1 - Primer video real controlado (Fase 7 del Roadmap)
IMPORTANTE: Ejecutar solo cuando cargo check y npm run build pasen sin errores.

Pasos previos obligatorios:
1. Crear snapshot:
   powershell: Copy-Item "C:\Users\danie\Desktop\Pulsaria\data\library.db" "C:\Users\danie\Desktop\Pulsaria\_runtime_backups\snapshot_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
2. Verificar: pip install -r python-workers/requirements.txt
3. Verificar: ffmpeg -version (debe estar en PATH)

Pasos de validacion:
1. Con la app Tauri corriendo, pegar un solo enlace de TikTok en AddLinks.
2. Observar QueueSection: downloading -> extracting_audio -> transcribing -> complete.
3. Verificar tarjeta en VideoGrid.
4. Abrir modal y verificar reproduccion + transcripcion con timestamps.
5. Busqueda semantica con un termino del video -> verificar resultado.

Documentar resultado en docs/SESSION_REPORT_AUTOGEN.md.

---

## MATRIZ DE ESTADO

| Tarea | Archivo(s) | Prioridad | Bloqueo |
|---|---|---|---|
| 0.1 Integrar StatsPanel | page.tsx, StatsPanel.tsx | Alta | Ninguno |
| 0.2 SettingsPanel Backend | SettingsPanel.tsx, main.rs | Media | cargo check |
| 1.1 Playlist daemon fix | python-workers/main.py | Alta | Ninguno |
| 1.2 Campo platform en DB | db.rs | Media | cargo check |
| 2.1 ClusterPanel integracion | Sidebar.tsx, page.tsx | Media | Ninguno |
| 2.2 Transcripcion sincronizada | ExpandedVideoModal.tsx | Alta | Ninguno |
| 2.3 Notificaciones job completado | layout.tsx, queue.rs | Media | Ninguno |
| 2.4 export_semantic mejorado | main.rs | Media | cargo check |
| 3.1 Estado vacio VideoGrid | VideoGrid.tsx | Baja | Ninguno |
| 3.2 Progreso fases QueueSection | QueueSection.tsx | Media | Ninguno |
| 3.3 Busqueda debounce Header | Header.tsx | Media | Ninguno |
| 4.1 Vista videos de playlist | VideoGrid.tsx | Alta | Ninguno |
| 4.2 Exportar biblioteca JSON | StatsPanel.tsx, main.rs | Baja | cargo check |
| 5.1 Primer video real | App completa | CRITICA | yt-dlp + ffmpeg instalados |

---

## ALGORITMO DEL BUCLE AUTONOMO

REPEAT:
  1. Leer docs/PULSAR_TASK_BACKLOG.md -> tomar primer ticket PENDIENTE
  2. Si modifica src-tauri/ -> snapshot de data/ primero
  3. Implementar cambios atomicos en el archivo correspondiente
  4. Ejecutar verification gate apropiado (tsc --noEmit y/o cargo check)
  5. Si falla: corregir (max 2 intentos) -> si sigue fallando: marcar BLOQUEADO
  6. Si exito: marcar ticket COMPLETADO en docs/PULSAR_TASK_BACKLOG.md
  7. Continuar con siguiente ticket
UNTIL: No quedan tickets pendientes
THEN: Actualizar docs/SESSION_REPORT_AUTOGEN.md con resumen completo

---

## AL TERMINAR LA SESION

Crear o actualizar docs/SESSION_REPORT_AUTOGEN.md con:
- Lista de tareas completadas (con nombre y archivo modificado)
- Lista de tareas bloqueadas (con razon del bloqueo)
- Bugs encontrados y corregidos
- Archivos modificados
- Archivos creados
- Proximos pasos sugeridos

---

Generado: 2026-08-23 | Version: 2.0 | Estado de referencia: Post-sesion autonoma agosto 2026
