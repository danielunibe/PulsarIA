# PULSAR EVENTIDE — AUDITORÍA 03: ESTADO ACTUAL DE COMPONENTES
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
