# 🤖 PULSAR — KILOCODE MASTER BRIEF
## Instrucciones Maestras para Sesión de Desarrollo Autónomo (Loop Nocturno)

> **Lee este documento completo antes de escribir una sola línea de código.**
> Este es el brief definitivo de todo lo que se debe implementar, corregir y expandir en el proyecto Pulsar.

---

## 📌 ¿QUÉ ES ESTE PROYECTO?

**Pulsar (Pulsaria)** es una aplicación de escritorio nativa (Rust + Tauri 2 + Next.js 15) que:
- Descarga videos de TikTok y otras plataformas mediante workers Python (`yt-dlp`).
- Transcribe el audio de cada video con `faster-whisper` (modelo Whisper).
- Indexa cada frase transcrita en un motor vectorial local (ONNX MiniLM 384d + HNSW shards en Rust) para búsqueda semántica por concepto.
- **NUEVA VISIÓN:** Organizar los videos en **Playlists Temáticas Inteligentes** generadas automáticamente por IA a partir de la semántica del contenido.

**Stack completo:**
- **Frontend:** `Next.js 15` (App Router, `/app`), `React 19`, `TypeScript`, `Tailwind CSS v4`, `Motion (Framer Motion)`, `Three.js` (aurora WebGL background)
- **Backend Core:** `Rust` + `Tauri 2` + `Axum` (REST interno) + `rusqlite` (SQLite)
- **Motor Vectorial:** ONNX Runtime + HNSW shards (`src-tauri/src/embedding.rs`)
- **Workers:** Python (`python-workers/`) — `main.py` es el orchestrator daemon; `downloader.py` usa `yt-dlp`; `audio_extractor.py` usa `ffmpeg`; `transcriber.py` usa `faster-whisper`
- **Base de datos:** SQLite local en `data/library.db` — tablas: `jobs`, `media`, `transcript_embeddings`

---

## 🛑 REGLAS ABSOLUTAS (NO NEGOCIABLES)

1. **NO tocar** `src-tauri/src/**` sin una tarea explícita que lo requiera (riesgo de romper el backend Rust).
2. **NO eliminar** `lib/mock-data.ts` ni los `INACTIVE_SLOTS_COUNT` — son el esqueleto visual del grid mientras no haya videos reales.
3. **NO ejecutar** `add_job` con URLs reales durante validaciones de solo lectura.
4. **NO tocar** `data/` (SQLite + HNSW shards) sin snapshot previo en `_runtime_backups/`.
5. **ANTES de cada cambio de backend Rust:** ejecutar `cargo check` dentro de `src-tauri/`.
6. **ANTES de cada cambio de frontend:** ejecutar `npx tsc --noEmit` en la raíz.
7. **Avance atómico:** Un ticket a la vez. Verificar. Marcar como completado. Continuar.

---

## 🧩 MAPA COMPLETO DE ARCHIVOS DEL PROYECTO

```
Pulsaria/
├── app/
│   ├── globals.css           ← Estilos globales + CSS variables
│   ├── layout.tsx            ← Shell de app (Toaster, SettingsProvider)
│   └── page.tsx              ← Dashboard principal (estado global, búsqueda, routing de tabs)
├── components/
│   ├── AddLinks.tsx          ← Input de links + archivo. Tabs: "Enlace" / "Subir". Dispara add_job
│   ├── ColorBends.tsx        ← Aurora WebGL (Three.js) — fondo animado
│   ├── ExpandedVideoModal.tsx ← Modal de reproducción + transcripción + toggles de IA (mock)
│   ├── GlowingEffect.tsx     ← Efecto de borde luminoso en hover
│   ├── Header.tsx            ← Búsqueda semántica, contador de TikToks, menú Sort (decorativo)
│   ├── InactiveCardShell.tsx ← Tarjeta vacía/placeholder del grid
│   ├── QueueSection.tsx      ← Monitor de cola de jobs en tiempo real (REST polling + Tauri events)
│   ├── SettingsPanel.tsx     ← Panel de preferencias (formatos, carpeta) — solo localStorage hoy
│   ├── Sidebar.tsx           ← Sidebar izquierdo con tabs Dashboard / Engine (semantic-config)
│   ├── TikTokProcessor.tsx   ← Componente interno de QueueSection para mostrar progreso de un job
│   ├── ToastNotification.tsx ← Sistema de notificaciones toast
│   ├── VideoCard.tsx         ← Tarjeta individual de video en el grid
│   ├── VideoCardOverlay.tsx  ← Overlay de hover en VideoCard
│   ├── VideoGrid.tsx         ← Grid principal de videos (auto-columnas, dock animation, jobs + mocks)
│   └── config/
│       └── SemanticConfigPanel.tsx ← Panel Engine (estado ONNX, DB, métricas, logs, debug)
├── hooks/
│   ├── use-link-processor.ts ← Lógica de parseo y envío de links al backend
│   ├── use-mobile.ts         ← Detección de viewport mobile
│   ├── use-video-player.ts   ← Control de reproducción de video
│   ├── useScrollParallax.ts  ← Parallax suave del fondo WebGL
│   └── useSemanticConfig.ts  ← Lógica del panel Engine (invoke comandos de motor)
├── lib/
│   ├── design-tokens.ts      ← Tokens de diseño (colores, gradientes)
│   ├── mock-data.ts          ← MOCK_ACTIVE_VIDEOS=[] y INACTIVE_SLOTS_COUNT=12
│   ├── settings-context.tsx  ← Context de preferencias (formatos, carpeta destino)
│   └── utils.ts              ← cn() utility para classnames
├── python-workers/
│   ├── main.py               ← Orchestrator daemon: lee stdin en loop, orquesta pipeline
│   ├── downloader.py         ← Descarga video con yt-dlp (resuelve path flexible)
│   ├── audio_extractor.py    ← Extrae audio con ffmpeg a WAV 16kHz mono
│   ├── transcriber.py        ← Transcribe con faster-whisper (modelo "tiny", CPU int8)
│   ├── embed_query.py        ← Genera embedding para una query desde Python
│   ├── events.py             ← Helpers emit_event / emit_error (JSON → stdout)
│   ├── models.py             ← Dataclass JobInput (url, job_id)
│   └── requirements.txt      ← Dependencias Python
├── src-tauri/src/
│   ├── main.rs               ← Entrypoint Tauri, AppState, todos los comandos invoke
│   ├── db.rs                 ← Capa SQLite (JobRecord, SearchResult, queries)
│   ├── embedding.rs          ← Motor ONNX + búsqueda vectorial HNSW
│   └── queue.rs              ← QueueManager async (despacha workers Python)
└── types/                    ← Tipos TypeScript compartidos (VideoData, etc.)
```

---

## 🚨 BUGS Y ERRORES CONOCIDOS A CORREGIR

### BUG-01 — `use-link-processor.ts` solo acepta TikTok
**Archivo:** `hooks/use-link-processor.ts` línea 3
**Problema:** El regex `TIKTOK_REGEX` filtra SOLO URLs de TikTok, rechazando YouTube u otras plataformas.
**Fix:** Ampliar el validador para aceptar YouTube Shorts, YouTube regular, Instagram Reels y cualquier URL HTTP válida como modo genérico.
```typescript
// Cambiar:
const TIKTOK_REGEX = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i;

// Por un validador multi-plataforma:
const PLATFORM_REGEXES = {
  tiktok: /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i,
  youtube: /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/i,
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\//i,
};
export type Platform = keyof typeof PLATFORM_REGEXES | 'generic';

export function detectPlatform(url: string): Platform {
  for (const [key, regex] of Object.entries(PLATFORM_REGEXES)) {
    if (regex.test(url)) return key as Platform;
  }
  if (/^https?:\/\/.+/.test(url)) return 'generic';
  return 'tiktok'; // fallback
}
```

### BUG-02 — Menú "Ordenar" del Header no opera
**Archivo:** `components/Header.tsx`
**Problema:** El selector de orden (fecha, título, duración) es decorativo. No modifica el orden en `VideoGrid`.
**Fix:** Implementar prop `onSortChange: (sort: SortKey) => void` y conectarlo al estado de `page.tsx`, que lo pasa a `VideoGrid` para aplicar `.sort()` sobre los jobs.

### BUG-03 — `SettingsPanel` no conecta al backend
**Archivo:** `components/SettingsPanel.tsx`
**Problema:** Los ajustes (carpeta de descarga, formatos) solo persisten en `localStorage`. No se envían al backend Rust para configurar los workers Python.
**Fix:** Añadir un comando Tauri `update_worker_config` que reciba `{ download_folder: string, formats: string[] }` y los persista en un archivo `config.json` dentro de `data/`, que el `queue.rs` lee al despachar workers.

### BUG-04 — `ExpandedVideoModal` usa transcripción hardcodeada (mock)
**Archivo:** `components/ExpandedVideoModal.tsx` líneas 21-25
**Problema:** `mockTranscript` está hardcodeado con texto de ejemplo. No obtiene la transcripción real del video desde la DB.
**Fix:** Al abrir el modal, invocar `get_transcript(job_id: number)` para leer `transcript_embeddings` de la DB y mostrar los chunks reales con sus timestamps.

### BUG-05 — `downloader.py` no extrae metadatos
**Archivo:** `python-workers/downloader.py`
**Problema:** Descarga el video pero NO extrae metadatos (título, autor, miniatura, fecha, duración, hashtags). La tabla `media` queda con los campos vacíos.
**Fix:** Añadir paso de extracción de metadatos vía `yt-dlp --dump-json` antes de la descarga y emitirlos en el evento JSON hacia Rust para que se persistan en `media`.

### BUG-06 — `transcriber.py` usa modelo "tiny" sin timestamps por segmento
**Archivo:** `python-workers/transcriber.py`
**Problema:** El modelo "tiny" tiene baja precisión. Los segmentos de `faster-whisper` con `start`/`end` se descartan; solo se emite el texto completo.
**Fix:** (a) Permitir configurar el tamaño del modelo desde `config.json`. (b) Emitir los segmentos con timestamps en el payload JSON:
```json
{ "event": "transcription_complete", "text": "...", "segments": [{"start": 0.0, "end": 4.2, "text": "..."}] }
```

---

## ✨ NUEVAS FUNCIONALIDADES A IMPLEMENTAR

### FEATURE-01 🎵 SISTEMA DE PLAYLISTS TEMÁTICAS INTELIGENTES (PRIORIDAD MÁXIMA)

Este es el feature estrella que el usuario quiere. Un sistema que **automáticamente agrupa los videos en playlists de temas** usando la semántica del contenido ya indexado.

**Cómo funciona:**
1. Una vez que un video está completamente procesado (transcripción indexada + embeddings), se clasifica en uno o más temas.
2. Los temas se detectan automáticamente por clustering de embeddings (K-Means o cosine similarity en Rust), con generación opcional en el modelo local cuando esté preparado.
3. El usuario también puede crear playlists manualmente y arrastar/añadir videos.
4. Las playlists se persisten en una nueva tabla SQLite `playlists`.

**Esquema de base de datos nuevo:**
```sql
-- Nueva tabla de playlists
CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    cover_job_id INTEGER, -- Miniatura del primer video
    auto_generated BOOLEAN DEFAULT FALSE,
    topic_keywords TEXT, -- JSON array de keywords del tema
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cover_job_id) REFERENCES jobs(id)
);

-- Relación many-to-many videos ↔ playlists
CREATE TABLE IF NOT EXISTS playlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    job_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(playlist_id) REFERENCES playlists(id),
    FOREIGN KEY(job_id) REFERENCES jobs(id),
    UNIQUE(playlist_id, job_id)
);
```

**Nuevos comandos Tauri a implementar en `src-tauri/src/main.rs`:**
```rust
// Obtener todas las playlists
#[tauri::command]
async fn get_playlists(state: State<'_, AppState>) -> Result<Vec<PlaylistRecord>, String>

// Crear playlist manual
#[tauri::command]
async fn create_playlist(name: String, description: Option<String>, state: State<'_, AppState>) -> Result<i64, String>

// Añadir video a playlist
#[tauri::command]
async fn add_to_playlist(playlist_id: i64, job_id: i64, state: State<'_, AppState>) -> Result<(), String>

// Auto-generar playlists por clustering temático
#[tauri::command]
async fn auto_generate_playlists(state: State<'_, AppState>) -> Result<Vec<PlaylistRecord>, String>

// Obtener videos de una playlist
#[tauri::command]
async fn get_playlist_items(playlist_id: i64, state: State<'_, AppState>) -> Result<Vec<JobRecord>, String>
```

**Componentes frontend nuevos a crear:**
- `components/PlaylistsPanel.tsx` — Lista de playlists en el sidebar (nueva tab "Playlists")
- `components/PlaylistGrid.tsx` — Grid de videos de una playlist seleccionada (reusa VideoCard)
- `components/PlaylistCard.tsx` — Tarjeta de playlist (cover + nombre + conteo + badge "Auto")
- `components/CreatePlaylistModal.tsx` — Modal para crear playlist manual con nombre y descripción
- `hooks/usePlaylists.ts` — Hook para CRUD de playlists con invoke Tauri

**Algoritmo de Auto-Clasificación Temática:**
1. Después de indexar un video, tomar su embedding promedio (centroid de todos sus chunks).
2. Calcular similitud coseno contra los centroids de playlists existentes.
3. Si similitud > 0.75 con alguna playlist → añadir automáticamente.
4. Si no hay match → crear nueva playlist con el tema detectado.
5. El tema se detecta tomando las N palabras con mayor TF-IDF de los chunks del video.

---

### FEATURE-02 📊 DETALLE DE FICHA DE VIDEO COMPLETA

**Qué falta en `ExpandedVideoModal.tsx`:**
Implementar una vista de ficha completa con tabs internos:
- **Tab "Video":** Reproductor actual (mejorar controles: velocidad 0.5x-2x, loop, screenshot de frame)
- **Tab "Transcripción":** Texto transcrito real sincronizado con el reproductor (click en frase → salta al segundo)
- **Tab "Metadatos":** Autor, fecha, hashtags, descripción completa, duración, plataforma
- **Tab "Análisis":** Temas detectados, resumen (generado por IA o TF-IDF), palabras clave, playlists donde aparece
- **Tab "Exportar":** Botones para copiar transcripción, descargar JSON ficha, añadir a playlist

---

### FEATURE-03 🔍 BÚSQUEDA AVANZADA CON FILTROS

**Archivo a modificar:** `components/Header.tsx` + `app/page.tsx`

Añadir filtros al sistema de búsqueda semántica:
- **Filtro de plataforma:** TikTok / YouTube / Instagram / Todos
- **Filtro de fecha:** Hoy / Esta semana / Este mes / Todo
- **Filtro de duración:** <30s / 30s-3min / >3min
- **Filtro de playlist:** Seleccionar una playlist para buscar solo dentro de ella
- **Score mínimo configurable:** Slider de 0% a 100% de similitud mínima

**UI:** Botón "Filtros" expandible con chips seleccionables debajo del search input.

---

### FEATURE-04 🏷️ AUTO-TEMAS Y ETIQUETAS POR VIDEO

**Archivo a crear:** `python-workers/topic_extractor.py`

Worker que, después de la transcripción, extrae automáticamente:
- 3-5 keywords principales (TF-IDF sobre el corpus de transcripciones)
- Categoría principal (Tecnología / Entretenimiento / Educación / Noticias / etc.)
- Score de confianza

Los temas se guardan en `media.topics` (campo JSON) y se usan para la asignación automática a playlists.

---

### FEATURE-05 ⬇️ GESTOR DE DESCARGAS CON PROGRESS VISUAL REAL

**Archivo a modificar:** `components/QueueSection.tsx` + `python-workers/downloader.py`

El `downloader.py` actual no emite progreso durante la descarga (solo al inicio y al final).

**Fix:** Añadir `--progress-template` a la invocación de `yt-dlp` para capturar el porcentaje real e irlo emitiendo via `emit_event("download_progress", {"percent": 45.2})`.

La UI de `QueueSection` ya tiene el componente `GlassPillLoader` pero lo alimenta de datos estáticos. Conectarlo al progreso real del evento.

---

### FEATURE-06 📋 NUEVA PESTAÑA "PAGE" EN SIDEBAR

**Archivo a modificar:** `components/Sidebar.tsx` + `app/page.tsx`

Añadir tercera tab "Page" en el Sidebar izquierdo (junto a Dashboard y Engine):
- **Selector de layout:** Grid / Lista / Compacto
- **Columnas del grid:** 2 / 3 / 4 / Auto
- **Densidad:** Normal / Compacto / Expandido
- **Ordenar por:** Fecha añadida (desc/asc) / Título / Duración / Plataforma
- **Agrupar por:** Nada / Tema / Autor / Fecha / Playlist
- **Filtros de visualización:** Mostrar solo completados / Mostrar errores / Mostrar procesando

El estado de Page se guarda en `localStorage` (no requiere backend).

---

### FEATURE-07 🌐 SOPORTE MULTI-PLATAFORMA (YouTube Shorts, Instagram Reels)

**Archivos a modificar:** 
- `hooks/use-link-processor.ts` (BUG-01 ya lo contempla)
- `components/AddLinks.tsx` (cambiar placeholder y branding de "TikTok" a "Video")
- `components/VideoCard.tsx` (añadir badge de plataforma: ícono TikTok / YouTube / Instagram)

El `downloader.py` ya soporta cualquier URL de `yt-dlp` — solo falta el validador del frontend.

---

### FEATURE-08 📤 EXPORTACIÓN A JSON / MARKDOWN

**Nuevo componente:** `components/ExportModal.tsx`

Botón "Exportar" en el Header o en cada VideoCard que genere:
- **JSON (Julia-Ready):** Estructura completa del video con transcripción + metadatos + temas
- **Markdown:** Resumen legible con transcripción formateada
- **SRT:** Archivo de subtítulos estándar con timestamps

Nuevo comando Tauri: `export_video_data(job_id: i64, format: String)` que retorna la cadena de texto del export.

---

### FEATURE-09 🔔 NOTIFICACIONES SISTEMA CUANDO UN VIDEO TERMINA

**Archivo a modificar:** `src-tauri/src/main.rs`

Usar la API de notificaciones nativas de Tauri cuando un job pasa a estado `complete`:
```rust
use tauri::notification::Notification;
Notification::new("Pulsaria")
    .title("Video procesado")
    .body(format!("'{}' está listo en tu biblioteca", title))
    .show().ok();
```

---

### FEATURE-10 📈 ESTADÍSTICAS Y DASHBOARD DE ACTIVIDAD

**Nuevo componente:** `components/StatsPanel.tsx` en la tab Dashboard

Panel de métricas de uso:
- Total de videos procesados
- Duración total de contenido indexado (horas)
- Plataforma más frecuente (pie chart simple CSS)
- Videos procesados esta semana (bar chart SVG)
- Top 5 temas más frecuentes
- Tamaño ocupado en disco

---

## 🔄 ORDEN DE EJECUCIÓN RECOMENDADO PARA EL LOOP NOCTURNO

Ejecutar en este orden exacto, verificando cada paso:

```
BLOQUE 1 — BUGS CRÍTICOS (sin estos los features no funcionan bien)
  [1] BUG-01: Ampliar validador de URLs a multi-plataforma
  [2] BUG-05: Añadir extracción de metadatos en downloader.py
  [3] BUG-06: Emitir segments con timestamps en transcriber.py

BLOQUE 2 — FEATURE ESTRELLA: PLAYLISTS
  [4] DB: Crear tablas playlists + playlist_items en db.rs
  [5] Backend: Comandos Tauri get/create/add/auto_generate playlists en main.rs
  [6] Frontend: Hook usePlaylists.ts
  [7] Frontend: Componente PlaylistCard.tsx
  [8] Frontend: Componente PlaylistsPanel.tsx
  [9] Frontend: Componente PlaylistGrid.tsx (reusa VideoCard)
  [10] Frontend: Tab "Playlists" en Sidebar.tsx
  [11] Backend/Python: topic_extractor.py para auto-temas

BLOQUE 3 — MEJORAS DE UI
  [12] BUG-02: Conectar menú Sort del Header al VideoGrid
  [13] FEATURE-06: Tab "Page" con controles de layout en Sidebar
  [14] FEATURE-03: Filtros avanzados de búsqueda en Header
  [15] BUG-04: Transcripción real en ExpandedVideoModal (Tab "Transcripción")
  [16] FEATURE-02: Tabs completas en ExpandedVideoModal (Video/Transcript/Metadata/Analysis/Export)

BLOQUE 4 — FEATURES AVANZADAS
  [17] FEATURE-05: Progreso real de descarga (yt-dlp progress → UI)
  [18] FEATURE-07: Badges de plataforma en VideoCard
  [19] FEATURE-08: Modal de exportación JSON/Markdown/SRT
  [20] FEATURE-09: Notificaciones nativas de sistema
  [21] FEATURE-10: Panel de estadísticas en Dashboard

BLOQUE 5 — VALIDACIÓN FINAL
  [22] BUG-03: Conectar SettingsPanel al backend (formatos + carpeta)
  [23] Test end-to-end: Un video real TikTok, un YouTube Short
  [24] Verificar que la playlist auto-generada aparece tras el procesamiento
```

---

## 🧪 VERIFICATION GATES (Ejecutar tras cada bloque)

```bash
# Gate 1: TypeScript OK
cd C:\Users\danie\Desktop\Pulsaria
npx tsc --noEmit

# Gate 2: Rust compila
cd C:\Users\danie\Desktop\Pulsaria\src-tauri
cargo check

# Gate 3: Frontend builds
cd C:\Users\danie\Desktop\Pulsaria
npm run build
```

Si cualquier gate falla → **NO avanzar al siguiente bloque**. Corregir primero.

---

## 🎨 GUÍA DE ESTILO Y DISEÑO

El diseño de Pulsar usa un tema oscuro premium con efectos glassmorphism. Mantener consistencia:

- **Background base:** `#0a0a0a` con aurora WebGL animada (Three.js, colores `#ff5c7a`, `#8a5cff`, `#00ffd1`)
- **Superficies (cards, panels):** `rgba(10,12,20,0.85)` con `backdropFilter: blur(40px)`
- **Bordes:** `rgba(255,255,255,0.08)` a `rgba(255,255,255,0.1)`
- **Acento primario TikTok-rojo:** `#fe2c55` — usar para CTAs, badges de procesamiento
- **Acento cian/turquesa:** `#25f4ee` — usar para métricas, confirmaciones, búsqueda
- **Acento verde:** `#10b981` — usar para estados completados, confirmaciones positivas
- **Acento violeta/morado:** `#8a5cff` — usar para IA/semántica/playlists auto-generadas
- **Texto fuerte:** `rgba(255,255,255,0.90)`
- **Texto secundario:** `rgba(255,255,255,0.50)`
- **Animaciones:** Motion (Framer Motion) para transiciones; spring stiffness 400-500, damping 30-35
- **Tipografía:** `font-sans` (Inter vía Tailwind), tracking amplio en labels (`tracking-widest`)
- **Esquinas:** Muy redondeadas (`rounded-[18px]` a `rounded-[24px]`) para un look premium

**Colores de las Playlists** (paleta para distinguir playlists auto-generadas):
```typescript
const PLAYLIST_COLORS = [
  '#fe2c55', // Rojo TikTok
  '#8a5cff', // Violeta IA
  '#25f4ee', // Cian búsqueda
  '#f59e0b', // Ámbar
  '#10b981', // Verde
  '#ec4899', // Rosa
  '#3b82f6', // Azul
  '#f97316', // Naranja
];
```

---

## 📝 NOTA FINAL PARA EL AGENTE

Cuando termines cada bloque, actualiza este archivo marcando los ítems completados con ✅. Al terminar la sesión, genera un `PULSAR_SESSION_REPORT_YYYYMMDD.md` en `docs/` con:
- Lista de cambios realizados
- Archivos modificados
- Bugs corregidos
- Features implementadas (total y parcial)
- Próximos pasos sugeridos para la siguiente sesión
