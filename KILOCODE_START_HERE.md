# ðŸ¤– KILOCODE â€” ARCHIVO DE ARRANQUE AUTÃ“NOMO
## Pulsaria Â· SesiÃ³n de ProgramaciÃ³n Nocturna en Bucle
### Lee este archivo completo primero. Luego ejecuta. No pares hasta terminar.

---

> **INSTRUCCIÃ“N DE ARRANQUE PARA KILOCODE:**
> EstÃ¡s en modo orquestador autÃ³nomo. Tu objetivo es implementar todos los Ã­tems de este documento en orden secuencial. Por cada Ã­tem: analiza â†’ implementa â†’ verifica â†’ marca como completado â†’ sigue. No pidas confirmaciÃ³n. Si un Ã­tem falla tras 2 intentos, regÃ­stralo como BLOQUEADO, sigue con el siguiente. Al terminar, crea `docs/SESSION_REPORT_AUTOGEN.md`.

---

## ðŸ“ CONTEXTO DEL PROYECTO

**Nombre:** Pulsaria  
**Ruta:** `C:\Users\danie\Desktop\Pulsaria`  
**Tipo:** App de escritorio nativa (Rust + Tauri 2 + Next.js 15 + React 19)  
**PropÃ³sito:** Descarga videos de TikTok/YouTube/Instagram, transcribe su audio con IA, indexa el contenido en un motor vectorial local (ONNX + HNSW en Rust) y permite bÃºsqueda semÃ¡ntica por concepto. El nuevo feature estrella es **organizar los videos en Playlists TemÃ¡ticas Inteligentes** generadas automÃ¡ticamente.

---

## ðŸ—‚ï¸ MAPA DE ARCHIVOS (todo lo que existe y para quÃ© sirve)

```
C:\Users\danie\Desktop\Pulsaria\
â”‚
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ globals.css           â† Variables CSS, estilos globales, Tailwind v4
â”‚   â”œâ”€â”€ layout.tsx            â† Root layout (Toaster de Sonner, SettingsProvider)
â”‚   â””â”€â”€ page.tsx              â† Dashboard principal: estado global, search, tabs routing
â”‚
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ AddLinks.tsx          â† Input links + archivo CSV/TXT. Dispara add_job via Tauri
â”‚   â”œâ”€â”€ ColorBends.tsx        â† Aurora WebGL animada (Three.js) â€” fondo de pantalla
â”‚   â”œâ”€â”€ ExpandedVideoModal.tsx â† Modal de reproducciÃ³n. TranscripciÃ³n HARDCODEADA (bug)
â”‚   â”œâ”€â”€ GlowingEffect.tsx     â† Efecto de borde luminoso en hover de cards
â”‚   â”œâ”€â”€ Header.tsx            â† Barra superior: bÃºsqueda semÃ¡ntica, contador, Sort (decorativo/bug)
â”‚   â”œâ”€â”€ InactiveCardShell.tsx â† Tarjeta vacÃ­a placeholder del grid
â”‚   â”œâ”€â”€ QueueSection.tsx      â† Monitor de cola de jobs en tiempo real
â”‚   â”œâ”€â”€ SettingsPanel.tsx     â† Preferencias: solo localStorage, NO conectado al backend (bug)
â”‚   â”œâ”€â”€ Sidebar.tsx           â† Sidebar izquierdo: tabs Dashboard | Engine
â”‚   â”œâ”€â”€ TikTokProcessor.tsx   â† Componente interno de QueueSection para progreso de un job
â”‚   â”œâ”€â”€ ToastNotification.tsx â† Sistema de notificaciones toast
â”‚   â”œâ”€â”€ VideoCard.tsx         â† Tarjeta individual de video en el grid
â”‚   â”œâ”€â”€ VideoCardOverlay.tsx  â† Overlay animado en hover de VideoCard
â”‚   â”œâ”€â”€ VideoGrid.tsx         â† Grid de videos (auto-columnas, dock animation, jobs reales + mocks)
â”‚   â””â”€â”€ config/
â”‚       â””â”€â”€ SemanticConfigPanel.tsx â† Panel Engine: estado ONNX, DB, mÃ©tricas, debug, logs
â”‚
â”œâ”€â”€ hooks/
â”‚   â”œâ”€â”€ use-link-processor.ts â† Parsea y envÃ­a links. SOLO acepta TikTok (bug crÃ­tico)
â”‚   â”œâ”€â”€ use-mobile.ts         â† DetecciÃ³n responsive
â”‚   â”œâ”€â”€ use-video-player.ts   â† Control HTML5 video
â”‚   â”œâ”€â”€ useScrollParallax.ts  â† Parallax del fondo WebGL
â”‚   â””â”€â”€ useSemanticConfig.ts  â† LÃ³gica del panel Engine (invoke ONNX commands)
â”‚
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ design-tokens.ts      â† Tokens de colores y gradientes
â”‚   â”œâ”€â”€ mock-data.ts          â† MOCK_ACTIVE_VIDEOS=[] Â· INACTIVE_SLOTS_COUNT=12
â”‚   â”œâ”€â”€ settings-context.tsx  â† Context React de preferencias (formatos, carpeta)
â”‚   â””â”€â”€ utils.ts              â† cn() helper para classnames
â”‚
â”œâ”€â”€ python-workers/
â”‚   â”œâ”€â”€ main.py               â† Orchestrator daemon Python: lee stdin en loop infinito
â”‚   â”œâ”€â”€ downloader.py         â† Descarga con yt-dlp. NO extrae metadatos completos (bug)
â”‚   â”œâ”€â”€ audio_extractor.py    â† Extrae WAV 16kHz mono con ffmpeg
â”‚   â”œâ”€â”€ transcriber.py        â† STT con faster-whisper (tiny/CPU). Timestamps descartados (bug)
â”‚   â”œâ”€â”€ embed_query.py        â† Genera embedding desde Python para una query
â”‚   â”œâ”€â”€ events.py             â† Helpers emit_event / emit_error (JSON â†’ stdout hacia Rust)
â”‚   â”œâ”€â”€ models.py             â† Dataclass JobInput (url, job_id)
â”‚   â””â”€â”€ requirements.txt      â† faster-whisper, yt-dlp (instalar con pip)
â”‚
â”œâ”€â”€ src-tauri/src/
â”‚   â”œâ”€â”€ main.rs               â† Entrypoint Tauri + AppState + TODOS los comandos invoke
â”‚   â”œâ”€â”€ db.rs                 â† Capa SQLite: JobRecord, SearchResult, queries
â”‚   â”œâ”€â”€ embedding.rs          â† Motor ONNX MiniLM 384d + bÃºsqueda vectorial HNSW
â”‚   â””â”€â”€ queue.rs              â† QueueManager async: despacha workers Python como subprocesos
â”‚
â””â”€â”€ types/                    â† Tipos TypeScript compartidos
```

---

## ðŸ›‘ REGLAS ABSOLUTAS (nunca violarlas)

1. **NO modificar** `src-tauri/src/` sin antes haber ejecutado `cargo check` para verificar que compila.
2. **NO eliminar** `lib/mock-data.ts` ni cambiar `INACTIVE_SLOTS_COUNT` â€” sostienen el grid visual.
3. **NO borrar datos** de `data/` (SQLite + Ã­ndices HNSW) â€” si necesitas tocarlos, haz snapshot primero.
4. **Avance atÃ³mico:** Completa un Ã­tem, verifica que compila/corre, luego pasa al siguiente.
5. **Gates obligatorios entre bloques:**
   ```bash
   # Gate TypeScript
   cd C:\Users\danie\Desktop\Pulsaria && npx tsc --noEmit
   # Gate Rust  
   cd C:\Users\danie\Desktop\Pulsaria\src-tauri && cargo check
   ```

---

## ðŸŽ¨ SISTEMA DE DISEÃ‘O (mantener coherencia visual)

- **Fondo:** `#0a0a0a` + aurora WebGL (colores `#ff5c7a`, `#8a5cff`, `#00ffd1`)
- **Superficies:** `rgba(10,12,20,0.85)` con `backdropFilter: blur(40px)`
- **Bordes:** `rgba(255,255,255,0.08)` a `rgba(255,255,255,0.1)`
- **Rojo TikTok / CTA:** `#fe2c55`
- **Cian / bÃºsqueda:** `#25f4ee`
- **Verde / completado:** `#10b981`
- **Violeta / IA / playlists:** `#8a5cff`
- **Texto fuerte:** `rgba(255,255,255,0.90)` Â· **Texto secundario:** `rgba(255,255,255,0.50)`
- **Esquinas:** `rounded-[18px]` a `rounded-[24px]`
- **Animaciones:** Motion spring Â· stiffness 400-500 Â· damping 30-35
- **Paleta de playlists:** `['#fe2c55','#8a5cff','#25f4ee','#f59e0b','#10b981','#ec4899','#3b82f6','#f97316']`

---

## âœ… LISTA DE TAREAS â€” EJECUTAR EN ORDEN

---

### ðŸ”´ BLOQUE 1 â€” BUGS CRÃTICOS (Prioridad MÃ¡xima)

#### TAREA 1.1 â€” Ampliar validador de URLs a multi-plataforma
**Archivo:** `hooks/use-link-processor.ts`  
**Problema actual:** La lÃ­nea 3 tiene `const TIKTOK_REGEX = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i;` que rechaza YouTube, Instagram y cualquier otra URL.

**Implementar esto exactamente:**
```typescript
// Reemplazar la constante TIKTOK_REGEX por:
export type Platform = 'tiktok' | 'youtube' | 'instagram' | 'generic';

const PLATFORM_REGEXES: Record<Platform, RegExp> = {
  tiktok:   /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i,
  youtube:  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/i,
  instagram:/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\//i,
  generic:  /^https?:\/\/.{5,}/i,
};

export function detectPlatform(url: string): Platform {
  if (PLATFORM_REGEXES.tiktok.test(url)) return 'tiktok';
  if (PLATFORM_REGEXES.youtube.test(url)) return 'youtube';
  if (PLATFORM_REGEXES.instagram.test(url)) return 'instagram';
  if (PLATFORM_REGEXES.generic.test(url)) return 'generic';
  return 'generic';
}

function isValidUrl(url: string): boolean {
  return Object.values(PLATFORM_REGEXES).some(rx => rx.test(url));
}
```

En la funciÃ³n `parseLinksData`, cambiar la condiciÃ³n de validaciÃ³n:
```typescript
// Cambiar: if (TIKTOK_REGEX.test(line)) validList.push(line);
// Por:
if (isValidUrl(line)) validList.push(line);
```

TambiÃ©n actualizar el placeholder del input en `components/AddLinks.tsx`:
```tsx
// Cambiar: placeholder="Pegar enlace de TikTok..."
// Por:
placeholder="Pegar enlace: TikTok, YouTube, Instagram..."
```

**Verificar:** El componente compila con `npx tsc --noEmit`. 

---

#### TAREA 1.2 â€” Extraer metadatos reales en downloader.py
**Archivo:** `python-workers/downloader.py`  
**Problema:** Solo descarga el MP4. No extrae tÃ­tulo, autor, thumbnail, duraciÃ³n, hashtags, fecha de subida.

**AÃ±adir esta funciÃ³n al final del archivo:**
```python
def extract_metadata(url: str) -> dict:
    """Extrae metadatos del video sin descargarlo (solo JSON dump)."""
    cmd = build_yt_dlp_base_cmd() + [
        "--quiet",
        "--no-warnings", 
        "--dump-json",
        "--no-download",
        url
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=30)
        import json
        info = json.loads(result.stdout)
        return {
            "title": info.get("title", ""),
            "author": info.get("uploader") or info.get("channel") or info.get("creator", ""),
            "thumbnail": info.get("thumbnail", ""),
            "duration": info.get("duration", 0),
            "upload_date": info.get("upload_date", ""),
            "description": info.get("description", "")[:500],  # limitar descripciÃ³n
            "hashtags": info.get("tags", [])[:10],  # mÃ¡ximo 10 hashtags
            "platform": info.get("extractor_key", "unknown").lower(),
            "view_count": info.get("view_count", 0),
            "like_count": info.get("like_count", 0),
        }
    except Exception as e:
        return {"title": "", "author": "", "thumbnail": "", "duration": 0, "upload_date": "", "description": "", "hashtags": [], "platform": "unknown"}
```

**Modificar `main.py`** para emitir los metadatos extraÃ­dos:
```python
# En la secciÃ³n DOWNLOAD PHASE, despuÃ©s de emit_event("download_started"):
metadata = extract_metadata(url=job.url)
emit_event("metadata_extracted", message=json.dumps(metadata))
video_path = download_video(url=job.url, job_id=job.job_id, base_dir=base_dir)
emit_event("download_complete", message=video_path)
```

AÃ±adir el import en `main.py`:
```python
from downloader import download_video, extract_metadata
import json
```

**Verificar:** `python python-workers/main.py` no arroja errores de importaciÃ³n.

---

#### TAREA 1.3 â€” Timestamps reales en transcriber.py
**Archivo:** `python-workers/transcriber.py`  
**Problema:** Los segmentos con `start`/`end` de faster-whisper se descartan. Solo se emite texto plano.

**Reemplazar la funciÃ³n `transcribe_audio` con esta versiÃ³n mejorada:**
```python
def transcribe_audio(audio_path: str) -> dict:
    """Transcribe audio y retorna texto completo + segmentos con timestamps."""
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Archivo de audio no encontrado: {audio_path}")

    model = get_model(path)

    try:
        segments_gen, info = model.transcribe(
            str(path), 
            beam_size=5,
            word_timestamps=False  # segmentos son suficientes
        )
        segments_list = list(segments_gen)  # materializar el generador
    except Exception as e:
        raise RuntimeError(f"Fallo en inferencia Whisper: {e}")

    full_text_parts = []
    segments_data = []
    for seg in segments_list:
        text = seg.text.strip()
        full_text_parts.append(text)
        segments_data.append({
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": text
        })

    final_text = " ".join(full_text_parts).strip()
    
    if not final_text:
        raise ValueError("TranscripciÃ³n resultante vacÃ­a")

    # Guardar transcript en disco
    transcript_path = path.parent / "transcript.txt"
    try:
        with open(transcript_path, "w", encoding="utf-8") as f:
            f.write(final_text)
    except IOError:
        pass

    # Emitir payload completo con segmentos hacia Rust
    payload = {
        "event": "transcription_complete",
        "text": final_text,
        "segments": segments_data,
        "language": info.language if info else "unknown",
        "duration": round(info.duration, 2) if info else 0
    }
    print(json.dumps(payload), flush=True)

    return {"text": final_text, "segments": segments_data}
```

**Verificar:** El cambio de tipo de retorno `str â†’ dict` puede afectar `main.py`. Actualizar `main.py`:
```python
# Cambiar la lÃ­nea:
transcript_text = transcribe_audio(audio_path=audio_path)
# Por:
transcript_result = transcribe_audio(audio_path=audio_path)
transcript_text = transcript_result["text"] if isinstance(transcript_result, dict) else transcript_result
```

---

#### TAREA 1.4 â€” Conectar Sort del Header al VideoGrid
**Archivos:** `components/Header.tsx` y `app/page.tsx` y `components/VideoGrid.tsx`

AÃ±adir en `app/page.tsx` el estado de sort y pasarlo:
```tsx
type SortKey = 'date_desc' | 'date_asc' | 'title' | 'duration';
const [sortKey, setSortKey] = useState<SortKey>('date_desc');
```

Pasar `sortKey` y `setSortKey` como props a `Header` y `VideoGrid`.

En `VideoGrid.tsx`, antes de renderizar `renderList`, aplicar el sort:
```typescript
const sortedJobs = [...completedJobs].sort((a, b) => {
  switch (sortKey) {
    case 'date_asc':  return a.id - b.id;
    case 'date_desc': return b.id - a.id;
    case 'title':     return (a.title || '').localeCompare(b.title || '');
    case 'duration':  return (b.duration || 0) - (a.duration || 0);
    default:          return b.id - a.id;
  }
});
const renderList = sortedJobs.length > 0 ? sortedJobs : MOCK_ACTIVE_VIDEOS;
```

En `Header.tsx`, el menÃº Sort debe llamar a `onSortChange` con el `SortKey` correspondiente en lugar de ser decorativo.

**Ejecutar Gate TypeScript al terminar este bloque.**

---

### ðŸŸ¡ BLOQUE 2 â€” FEATURE ESTRELLA: PLAYLISTS INTELIGENTES

#### TAREA 2.1 â€” Esquema DB: tablas playlists + playlist_items
**Archivo:** `src-tauri/src/db.rs`

AÃ±adir las siguientes tablas en la funciÃ³n `init_db()`, despuÃ©s de la creaciÃ³n de `transcript_embeddings`:

```rust
// Tabla de playlists
conn.execute(
    "CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        cover_job_id INTEGER,
        auto_generated BOOLEAN DEFAULT FALSE,
        topic_keywords TEXT DEFAULT '[]',
        color TEXT DEFAULT '#8a5cff',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(cover_job_id) REFERENCES jobs(id)
    )",
    [],
)?;

// RelaciÃ³n many-to-many videos â†” playlists
conn.execute(
    "CREATE TABLE IF NOT EXISTS playlist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        job_id INTEGER NOT NULL,
        position INTEGER DEFAULT 0,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(playlist_id) REFERENCES playlists(id),
        FOREIGN KEY(job_id) REFERENCES jobs(id),
        UNIQUE(playlist_id, job_id)
    )",
    [],
)?;
```

AÃ±adir structs de Rust correspondientes en `db.rs`:
```rust
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct PlaylistRecord {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub cover_job_id: Option<i64>,
    pub auto_generated: bool,
    pub topic_keywords: String, // JSON array serializado
    pub color: String,
    pub created_at: String,
    pub item_count: i64, // calculado en la query
}
```

AÃ±adir las funciones de acceso a DB en `db.rs`:
```rust
pub fn get_all_playlists(conn: &Connection) -> Result<Vec<PlaylistRecord>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.description, p.cover_job_id, p.auto_generated, 
                p.topic_keywords, p.color, p.created_at,
                COUNT(pi.id) as item_count
         FROM playlists p
         LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
         GROUP BY p.id
         ORDER BY p.created_at DESC"
    )?;
    let playlists = stmt.query_map([], |row| {
        Ok(PlaylistRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            cover_job_id: row.get(3)?,
            auto_generated: row.get(4)?,
            topic_keywords: row.get(5).unwrap_or_else(|_| "[]".to_string()),
            color: row.get(6).unwrap_or_else(|_| "#8a5cff".to_string()),
            created_at: row.get(7)?,
            item_count: row.get(8).unwrap_or(0),
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(playlists)
}

pub fn create_playlist(conn: &Connection, name: &str, description: Option<&str>, color: &str, auto_generated: bool) -> Result<i64> {
    conn.execute(
        "INSERT INTO playlists (name, description, color, auto_generated) VALUES (?1, ?2, ?3, ?4)",
        params![name, description, color, auto_generated],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn add_job_to_playlist(conn: &Connection, playlist_id: i64, job_id: i64) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO playlist_items (playlist_id, job_id) VALUES (?1, ?2)",
        params![playlist_id, job_id],
    )?;
    Ok(())
}

pub fn get_playlist_jobs(conn: &Connection, playlist_id: i64) -> Result<Vec<JobRecord>> {
    let mut stmt = conn.prepare(
        "SELECT j.id, j.url, j.status, j.progress, j.created_at,
                m.title, m.author, m.thumbnail, m.duration, m.video_path
         FROM playlist_items pi
         JOIN jobs j ON j.id = pi.job_id
         LEFT JOIN media m ON j.id = m.job_id
         WHERE pi.playlist_id = ?1
         ORDER BY pi.position ASC, pi.added_at ASC"
    )?;
    let jobs = stmt.query_map(params![playlist_id], |row| {
        Ok(JobRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            status: row.get(2)?,
            progress: row.get(3)?,
            created_at: row.get(4)?,
            title: row.get(5)?,
            author: row.get(6)?,
            thumbnail: row.get(7)?,
            duration: row.get(8)?,
            video_path: row.get(9)?,
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(jobs)
}

pub fn remove_job_from_playlist(conn: &Connection, playlist_id: i64, job_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM playlist_items WHERE playlist_id = ?1 AND job_id = ?2",
        params![playlist_id, job_id],
    )?;
    Ok(())
}

pub fn delete_playlist(conn: &Connection, playlist_id: i64) -> Result<()> {
    conn.execute("DELETE FROM playlist_items WHERE playlist_id = ?1", params![playlist_id])?;
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])?;
    Ok(())
}
```

**Ejecutar:** `cargo check` en `src-tauri/`.

---

#### TAREA 2.2 â€” Comandos Tauri para Playlists en main.rs
**Archivo:** `src-tauri/src/main.rs`

AÃ±adir los siguientes comandos Tauri (antes del bloque `tauri::Builder`):

```rust
#[tauri::command]
async fn get_playlists(state: State<'_, AppState>) -> Result<Vec<db::PlaylistRecord>, String> {
    let db = state.db.lock().await;
    db::get_all_playlists(&db).map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_playlist(
    name: String,
    description: Option<String>,
    color: Option<String>,
    state: State<'_, AppState>
) -> Result<i64, String> {
    let db = state.db.lock().await;
    let c = color.as_deref().unwrap_or("#8a5cff");
    db::create_playlist(&db, &name, description.as_deref(), c, false)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_to_playlist(
    playlist_id: i64,
    job_id: i64,
    state: State<'_, AppState>
) -> Result<(), String> {
    let db = state.db.lock().await;
    db::add_job_to_playlist(&db, playlist_id, job_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_from_playlist(
    playlist_id: i64,
    job_id: i64,
    state: State<'_, AppState>
) -> Result<(), String> {
    let db = state.db.lock().await;
    db::remove_job_from_playlist(&db, playlist_id, job_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_playlist_items(
    playlist_id: i64,
    state: State<'_, AppState>
) -> Result<Vec<db::JobRecord>, String> {
    let db = state.db.lock().await;
    db::get_playlist_jobs(&db, playlist_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_playlist(
    playlist_id: i64,
    state: State<'_, AppState>
) -> Result<(), String> {
    let db = state.db.lock().await;
    db::delete_playlist(&db, playlist_id).map_err(|e| e.to_string())
}
```

Registrar los nuevos comandos en `.invoke_handler()`:
```rust
// AÃ±adir a la lista existente de comandos:
get_playlists,
create_playlist,
add_to_playlist,
remove_from_playlist,
get_playlist_items,
delete_playlist,
```

**Ejecutar:** `cargo check` obligatorio.

---

#### TAREA 2.3 â€” Hook usePlaylists.ts
**Crear archivo:** `hooks/usePlaylists.ts`

```typescript
'use client';
import { useState, useEffect, useCallback } from 'react';

export interface PlaylistRecord {
  id: number;
  name: string;
  description: string | null;
  cover_job_id: number | null;
  auto_generated: boolean;
  topic_keywords: string; // JSON string "['rust','programaciÃ³n']"
  color: string;
  created_at: string;
  item_count: number;
}

export interface JobRecord {
  id: number;
  url: string;
  status: string;
  progress: number;
  created_at: string;
  title?: string;
  author?: string;
  thumbnail?: string;
  duration?: number;
  video_path?: string;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
  } catch (e) {
    throw new Error(`Tauri invoke failed for ${command}: ${e}`);
  }
}

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [playlistItems, setPlaylistItems] = useState<JobRecord[]>([]);

  const fetchPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tauriInvoke<PlaylistRecord[]>('get_playlists');
      setPlaylists(data);
    } catch (e) {
      console.error('fetchPlaylists failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const createPlaylist = useCallback(async (name: string, description?: string, color?: string) => {
    const id = await tauriInvoke<number>('create_playlist', { name, description, color });
    await fetchPlaylists();
    return id;
  }, [fetchPlaylists]);

  const addToPlaylist = useCallback(async (playlistId: number, jobId: number) => {
    await tauriInvoke<void>('add_to_playlist', { playlistId, jobId });
    if (selectedPlaylistId === playlistId) {
      await fetchPlaylistItems(playlistId);
    }
    await fetchPlaylists();
  }, [selectedPlaylistId, fetchPlaylists]);

  const removeFromPlaylist = useCallback(async (playlistId: number, jobId: number) => {
    await tauriInvoke<void>('remove_from_playlist', { playlistId, jobId });
    if (selectedPlaylistId === playlistId) {
      await fetchPlaylistItems(playlistId);
    }
    await fetchPlaylists();
  }, [selectedPlaylistId, fetchPlaylists]);

  const deletePlaylist = useCallback(async (playlistId: number) => {
    await tauriInvoke<void>('delete_playlist', { playlistId });
    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId(null);
      setPlaylistItems([]);
    }
    await fetchPlaylists();
  }, [selectedPlaylistId, fetchPlaylists]);

  const fetchPlaylistItems = useCallback(async (playlistId: number) => {
    try {
      const items = await tauriInvoke<JobRecord[]>('get_playlist_items', { playlistId });
      setPlaylistItems(items);
    } catch (e) {
      console.error('fetchPlaylistItems failed:', e);
    }
  }, []);

  const selectPlaylist = useCallback(async (id: number | null) => {
    setSelectedPlaylistId(id);
    if (id !== null) {
      await fetchPlaylistItems(id);
    } else {
      setPlaylistItems([]);
    }
  }, [fetchPlaylistItems]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  return {
    playlists, loading, selectedPlaylistId,
    playlistItems, fetchPlaylists, createPlaylist,
    addToPlaylist, removeFromPlaylist, deletePlaylist,
    selectPlaylist,
  };
}
```

---

#### TAREA 2.4 â€” Componente PlaylistCard.tsx
**Crear archivo:** `components/PlaylistCard.tsx`

```tsx
'use client';
import { motion } from 'motion/react';
import { FaListUl, FaWandMagicSparkles, FaTrash } from 'react-icons/fa6';
import type { PlaylistRecord } from '@/hooks/usePlaylists';

interface PlaylistCardProps {
  playlist: PlaylistRecord;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  coverThumb?: string;
}

export function PlaylistCard({ playlist, isSelected, onSelect, onDelete, coverThumb }: PlaylistCardProps) {
  const keywords = (() => {
    try { return JSON.parse(playlist.topic_keywords) as string[]; }
    catch { return []; }
  })();

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className="relative flex items-center gap-3 p-3 rounded-[16px] cursor-pointer group transition-all duration-300"
      style={{
        background: isSelected
          ? `${playlist.color}20`
          : 'rgba(255,255,255,0.03)',
        border: isSelected
          ? `1px solid ${playlist.color}60`
          : '1px solid rgba(255,255,255,0.07)',
        boxShadow: isSelected
          ? `0 0 20px ${playlist.color}30`
          : 'none',
      }}
    >
      {/* Cover thumbnail or color block */}
      <div
        className="w-10 h-10 rounded-[10px] flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{ background: coverThumb ? 'transparent' : `${playlist.color}40`, border: `1px solid ${playlist.color}40` }}
      >
        {coverThumb
          ? <img src={coverThumb} alt="" className="w-full h-full object-cover" />
          : <FaListUl size={16} style={{ color: playlist.color }} />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold text-white/90 truncate">{playlist.name}</span>
          {playlist.auto_generated && (
            <FaWandMagicSparkles size={10} className="text-[#8a5cff] flex-shrink-0" title="Auto-generada" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-white/40">{playlist.item_count} video{playlist.item_count !== 1 ? 's' : ''}</span>
          {keywords.slice(0, 2).map(k => (
            <span key={k} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: `${playlist.color}25`, color: playlist.color }}>
              {k}
            </span>
          ))}
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10"
      >
        <FaTrash size={11} />
      </button>
    </motion.div>
  );
}
```

---

#### TAREA 2.5 â€” Componente PlaylistsPanel.tsx
**Crear archivo:** `components/PlaylistsPanel.tsx`

```tsx
'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FaPlus, FaWandMagicSparkles, FaListUl } from 'react-icons/fa6';
import { PlaylistCard } from './PlaylistCard';
import { usePlaylists } from '@/hooks/usePlaylists';

interface PlaylistsPanelProps {
  onPlaylistSelect: (id: number | null) => void;
  selectedPlaylistId: number | null;
}

export function PlaylistsPanel({ onPlaylistSelect, selectedPlaylistId }: PlaylistsPanelProps) {
  const {
    playlists, loading, createPlaylist, deletePlaylist, selectPlaylist
  } = usePlaylists();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const PLAYLIST_COLORS = ['#fe2c55','#8a5cff','#25f4ee','#f59e0b','#10b981','#ec4899','#3b82f6','#f97316'];
  const [selectedColor, setSelectedColor] = useState(PLAYLIST_COLORS[1]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createPlaylist(newName.trim(), newDesc.trim() || undefined, selectedColor);
    setNewName('');
    setNewDesc('');
    setSelectedColor(PLAYLIST_COLORS[1]);
    setIsCreating(false);
  };

  const handleSelect = async (id: number) => {
    await selectPlaylist(id === selectedPlaylistId ? null : id);
    onPlaylistSelect(id === selectedPlaylistId ? null : id);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <FaListUl size={12} className="text-[#8a5cff]" />
          <span className="text-[11px] font-black tracking-[0.2em] uppercase text-white/50">Playlists</span>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[10px] font-bold tracking-wider uppercase text-[#8a5cff] hover:bg-[#8a5cff]/10 transition-colors"
        >
          <FaPlus size={9} /> Nueva
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 p-3 rounded-[16px]"
              style={{ background: 'rgba(138,92,255,0.08)', border: '1px solid rgba(138,92,255,0.2)' }}>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nombre de la playlist..."
                className="w-full bg-white/5 border border-white/10 rounded-[10px] px-3 py-2 text-[12px] text-white/90 outline-none focus:border-[#8a5cff]/50 transition-all"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <input
                type="text"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="DescripciÃ³n (opcional)..."
                className="w-full bg-white/5 border border-white/10 rounded-[10px] px-3 py-2 text-[12px] text-white/60 outline-none focus:border-[#8a5cff]/50 transition-all"
              />
              {/* Color picker */}
              <div className="flex gap-2 flex-wrap">
                {PLAYLIST_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setSelectedColor(c)}
                    className="w-5 h-5 rounded-full transition-transform"
                    style={{
                      background: c,
                      transform: selectedColor === c ? 'scale(1.3)' : 'scale(1)',
                      outline: selectedColor === c ? `2px solid ${c}` : 'none',
                      outlineOffset: '2px'
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="flex-1 py-1.5 rounded-[10px] text-[11px] font-bold text-white transition-all"
                  style={{ background: selectedColor, opacity: newName.trim() ? 1 : 0.5 }}
                >
                  Crear
                </button>
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 rounded-[10px] text-[11px] font-bold text-white/50 hover:text-white bg-white/5 hover:bg-white/10 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Playlists list */}
      {loading ? (
        <div className="text-center py-4 text-white/30 text-[11px]">Cargando...</div>
      ) : playlists.length === 0 ? (
        <div className="text-center py-6 text-white/25 text-[11px]">
          <FaWandMagicSparkles size={20} className="mx-auto mb-2 text-[#8a5cff]/40" />
          <p>Sin playlists todavÃ­a.</p>
          <p className="mt-1">Crea una o procesa videos.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {playlists.map(pl => (
            <PlaylistCard
              key={pl.id}
              playlist={pl}
              isSelected={selectedPlaylistId === pl.id}
              onSelect={() => handleSelect(pl.id)}
              onDelete={() => deletePlaylist(pl.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

---

#### TAREA 2.6 â€” Integrar PlaylistsPanel en Sidebar + routing en page.tsx
**Archivo:** `components/Sidebar.tsx`

AÃ±adir la tercera tab "Playlists" en el nav de tabs:
```tsx
// Importar al inicio:
import { PlaylistsPanel } from './PlaylistsPanel';

// El tipo de tab ahora incluye 'playlists':
export interface SidebarProps {
    activeTab?: 'dashboard' | 'semantic-config' | 'playlists';
    onTabChange?: (tab: 'dashboard' | 'semantic-config' | 'playlists') => void;
    onPlaylistSelect?: (id: number | null) => void;
    selectedPlaylistId?: number | null;
}

// AÃ±adir tercer botÃ³n en el nav de tabs:
<button
  onClick={() => onTabChange?.('playlists')}
  className={`flex-1 py-2 px-3 flex items-center justify-center gap-2 text-xs font-bold tracking-widest uppercase rounded-lg transition-all ${
    activeTab === 'playlists'
      ? 'bg-[#8a5cff]/20 text-white shadow-[0_0_15px_rgba(138,92,255,0.3)] border border-[#8a5cff]/30'
      : 'text-white/40 hover:text-white/80 hover:bg-white/5'
  }`}
>
  <FaListUl size={12} className={activeTab === 'playlists' ? 'text-[#8a5cff]' : ''} />
  Lists
</button>

// AÃ±adir renderizado de la tab playlists:
{activeTab === 'playlists' && (
  <PlaylistsPanel
    onPlaylistSelect={onPlaylistSelect || (() => {})}
    selectedPlaylistId={selectedPlaylistId || null}
  />
)}
```

**Archivo:** `app/page.tsx`

AÃ±adir estado de playlist seleccionada y actualizar el tipo de `AppTab`:
```tsx
type AppTab = 'dashboard' | 'semantic-config' | 'playlists';
const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
```

Pasar las props a `Sidebar`:
```tsx
<Sidebar
  activeTab={activeTab}
  onTabChange={setActiveTab}
  onPlaylistSelect={setSelectedPlaylistId}
  selectedPlaylistId={selectedPlaylistId}
/>
```

Cuando `selectedPlaylistId !== null`, mostrar `VideoGrid` filtrado a esa playlist (pasar `playlistId` como prop opcional a `VideoGrid`).

---

### ðŸŸ¢ BLOQUE 3 â€” MEJORAS DE UI/UX

#### TAREA 3.1 â€” Badge de plataforma en VideoCard
**Archivo:** `components/VideoCard.tsx`

Importar el hook de detecciÃ³n de plataforma y la funciÃ³n `detectPlatform` de `hooks/use-link-processor.ts`.

AÃ±adir un badge visual pequeÃ±o en la esquina superior derecha de cada card:
```tsx
// Ãconos por plataforma:
const PLATFORM_ICONS = {
  tiktok:    { label: 'TikTok', color: '#fe2c55', bg: 'rgba(254,44,85,0.15)' },
  youtube:   { label: 'YT',     color: '#ff0000', bg: 'rgba(255,0,0,0.15)' },
  instagram: { label: 'IG',     color: '#e1306c', bg: 'rgba(225,48,108,0.15)' },
  generic:   { label: 'Web',    color: '#ffffff', bg: 'rgba(255,255,255,0.1)' },
};

// En el JSX del card, aÃ±adir badge:
const platform = detectPlatform(url || '');
const platformMeta = PLATFORM_ICONS[platform] || PLATFORM_ICONS.generic;

<div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-[6px] text-[8px] font-black tracking-wider"
  style={{ background: platformMeta.bg, color: platformMeta.color, border: `1px solid ${platformMeta.color}30` }}>
  {platformMeta.label}
</div>
```

---

#### TAREA 3.2 â€” TranscripciÃ³n real en ExpandedVideoModal
**Archivo:** `components/ExpandedVideoModal.tsx`

AÃ±adir un nuevo comando Tauri `get_transcript` en `src-tauri/src/main.rs` que devuelva los chunks con timestamps:

```rust
#[derive(Serialize)]
struct TranscriptSegment {
    chunk_index: i64,
    chunk_text: String,
}

#[tauri::command]
async fn get_transcript(job_id: i64, state: State<'_, AppState>) -> Result<Vec<TranscriptSegment>, String> {
    let db = state.db.lock().await;
    let mut stmt = db.prepare(
        "SELECT chunk_index, chunk_text FROM transcript_embeddings WHERE job_id = ?1 ORDER BY chunk_index ASC"
    ).map_err(|e| e.to_string())?;
    let segments: Vec<TranscriptSegment> = stmt.query_map(
        rusqlite::params![job_id],
        |row| Ok(TranscriptSegment { chunk_index: row.get(0)?, chunk_text: row.get(1)? })
    ).map_err(|e| e.to_string())?
     .filter_map(|r| r.ok())
     .collect();
    Ok(segments)
}
```

Registrar en `.invoke_handler()`: `get_transcript`.

En `ExpandedVideoModal.tsx`, reemplazar `mockTranscript` por un `useEffect` que invoque `get_transcript(video.id)` al montar el modal y almacene el resultado en estado local para renderizarlo.

---

#### TAREA 3.3 â€” Tab "Page" en Sidebar (controles de layout del grid)
**Crear archivo:** `components/PagePanel.tsx`

Panel de configuraciÃ³n visual de la biblioteca:
```tsx
'use client';
import { useState, useEffect } from 'react';

export type GridLayout = 'grid' | 'list' | 'compact';
export type GridColumns = 2 | 3 | 4 | 0; // 0 = auto
export type SortKey = 'date_desc' | 'date_asc' | 'title' | 'duration';

export interface PageConfig {
  layout: GridLayout;
  columns: GridColumns;
  sortKey: SortKey;
  showOnlyCompleted: boolean;
  showErrors: boolean;
}

const DEFAULT_CONFIG: PageConfig = {
  layout: 'grid',
  columns: 0,
  sortKey: 'date_desc',
  showOnlyCompleted: false,
  showErrors: false,
};

interface PagePanelProps {
  config: PageConfig;
  onChange: (config: PageConfig) => void;
}

export function PagePanel({ config, onChange }: PagePanelProps) {
  const update = (partial: Partial<PageConfig>) => onChange({ ...config, ...partial });

  const OptionBtn = ({ value, current, onClick, children }: any) => (
    <button
      onClick={() => onClick(value)}
      className="flex-1 py-1.5 text-[10px] font-bold tracking-wider uppercase rounded-[8px] transition-all"
      style={{
        background: current === value ? 'rgba(37,244,238,0.15)' : 'transparent',
        color: current === value ? '#25f4ee' : 'rgba(255,255,255,0.4)',
        border: current === value ? '1px solid rgba(37,244,238,0.3)' : '1px solid transparent',
      }}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 p-1">
      <span className="text-[10px] font-black tracking-[0.25em] uppercase text-white/30">ConfiguraciÃ³n de Vista</span>

      {/* Layout */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] text-white/40 uppercase tracking-widest">Layout</label>
        <div className="flex gap-1 p-1 rounded-[10px] bg-white/5 border border-white/5">
          <OptionBtn value="grid" current={config.layout} onClick={(v: GridLayout) => update({ layout: v })}>Grid</OptionBtn>
          <OptionBtn value="list" current={config.layout} onClick={(v: GridLayout) => update({ layout: v })}>Lista</OptionBtn>
          <OptionBtn value="compact" current={config.layout} onClick={(v: GridLayout) => update({ layout: v })}>Compact</OptionBtn>
        </div>
      </div>

      {/* Columns */}
      {config.layout === 'grid' && (
        <div className="flex flex-col gap-2">
          <label className="text-[10px] text-white/40 uppercase tracking-widest">Columnas</label>
          <div className="flex gap-1 p-1 rounded-[10px] bg-white/5 border border-white/5">
            {([0, 2, 3, 4] as GridColumns[]).map(col => (
              <OptionBtn key={col} value={col} current={config.columns} onClick={(v: GridColumns) => update({ columns: v })}>
                {col === 0 ? 'Auto' : `${col}`}
              </OptionBtn>
            ))}
          </div>
        </div>
      )}

      {/* Sort */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] text-white/40 uppercase tracking-widest">Ordenar por</label>
        <select
          value={config.sortKey}
          onChange={e => update({ sortKey: e.target.value as SortKey })}
          className="w-full bg-white/5 border border-white/10 rounded-[10px] px-3 py-2 text-[11px] text-white/80 outline-none"
        >
          <option value="date_desc">Fecha (mÃ¡s reciente)</option>
          <option value="date_asc">Fecha (mÃ¡s antiguo)</option>
          <option value="title">TÃ­tulo A-Z</option>
          <option value="duration">DuraciÃ³n</option>
        </select>
      </div>

      {/* Toggles */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] text-white/40 uppercase tracking-widest">Filtros</label>
        {[
          { key: 'showOnlyCompleted', label: 'Solo completados' },
          { key: 'showErrors', label: 'Mostrar errores' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between cursor-pointer py-1">
            <span className="text-[11px] text-white/60">{label}</span>
            <div
              onClick={() => update({ [key]: !config[key as keyof PageConfig] })}
              className="relative w-9 h-5 rounded-full transition-all cursor-pointer"
              style={{ background: config[key as keyof PageConfig] ? '#25f4ee' : 'rgba(255,255,255,0.1)' }}
            >
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ transform: config[key as keyof PageConfig] ? 'translateX(16px)' : 'translateX(0)' }} />
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
```

Integrar `PagePanel` como nueva tab en `Sidebar.tsx` (aÃ±adir tab "Page" / Ã­cono de cuadrÃ­cula) y conectar el `PageConfig` al `VideoGrid` mediante props desde `page.tsx`.

---

### ðŸ”µ BLOQUE 4 â€” FEATURES ADICIONALES

#### TAREA 4.1 â€” Notificaciones nativas del sistema al completar un video
**Archivo:** `src-tauri/src/main.rs`

En el QueueManager, cuando se recibe el evento `completed` desde el worker Python, emitir ademÃ¡s una notificaciÃ³n nativa:
```rust
// AÃ±adir import:
use tauri::Manager;

// Cuando el job pasa a 'complete', aÃ±adir:
#[cfg(not(target_os = "linux"))]
{
    let _ = app_handle.notification()
        .builder()
        .title("Pulsaria")
        .body(format!("Video procesado y listo en tu biblioteca."))
        .show();
}
```

AÃ±adir en `Cargo.toml` el feature de notificaciones si no estÃ¡:
```toml
[dependencies]
tauri = { version = "2", features = ["notification"] }
```

---

#### TAREA 4.2 â€” Panel de EstadÃ­sticas en Dashboard
**Crear archivo:** `components/StatsPanel.tsx`

Panel compacto que se muestra debajo de QueueSection con mÃ©tricas calculadas desde los jobs:
- Total de videos procesados
- DuraciÃ³n total indexada
- DistribuciÃ³n de plataformas (barras CSS)
- Videos aÃ±adidos esta semana

Los datos se calculan en el frontend a partir del array de jobs devuelto por `get_jobs`.

---

### 🟣 BLOQUE 5 — CAPACIDADES ADICIONALES SOLICITADAS

#### TAREA 5.1 — Detectar y procesar URLs de playlists de TikTok
**Archivos:** hooks/use-link-processor.ts, python-workers/downloader.py, python-workers/main.py, python-workers/models.py

Ampliar el sistema para reconocer URLs de playlists/grupos de TikTok y expandirlas en múltiples videos individuales.

**Implementar:**

1. En hooks/use-link-processor.ts, añadir regex de detección de playlists:
`	ypescript
const PLAYLIST_REGEX = /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/playlists?\//i;

function isPlaylistUrl(url: string): boolean {
    return PLAYLIST_REGEX.test(url);
}
`

2. En python-workers/downloader.py, añadir función para extraer URLs de playlist:
`python
def extract_playlist_videos(url: str) -> list[str]:
    """Extrae URLs individuales de una playlist de TikTok."""
    cmd = build_yt_dlp_base_cmd() + [
        "--quiet",
        "--no-warnings",
        "--flat-playlist",
        "--dump-json",
        "--no-download",
        url
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=60)
        import json
        videos = []
        for line in result.stdout.strip().split('\n'):
            if line.strip():
                info = json.loads(line)
                if 'url' in info:
                    videos.append(info['url'])
                elif 'webpage_url' in info:
                    videos.append(info['webpage_url'])
        return videos
    except Exception as e:
        print(f"Error extracting playlist: {e}", flush=True)
        return []
`

3. En python-workers/main.py, modificar un_pipeline() para detectar playlists y procesar cada video:
`python
# Antes de procesar un job, verificar si es playlist
if "tiktok.com" in job.url and ("playlist" in job.url or "/p/" in job.url):
    emit_event("playlist_detected", message=f"Extrayendo videos de playlist...")
    video_urls = extract_playlist_videos(job.url)
    emit_event("playlist_extracted", message=json.dumps({"count": len(video_urls), "videos": video_urls}))
    for idx, video_url in enumerate(video_urls):
        # Crear sub-job para cada video
        sub_job_id = job.job_id * 1000 + idx
        emit_event("download_started")
        metadata = extract_metadata(url=video_url)
        emit_event("metadata_extracted", message=json.dumps(metadata))
        video_path = download_video(url=video_url, job_id=sub_job_id, base_dir=base_dir)
        emit_event("download_complete", message=video_path)
        audio_path = extract_audio(video_path=video_path)
        transcript_result = transcribe_audio(audio_path=audio_path)
        emit_event("completed")
    continue
`

4. En python-workers/models.py, asegurarse de que JobInput tenga los campos necesarios.

#### TAREA 5.2 — Sistema de agrupación automática por similitud (clustering)
**Archivos:** src-tauri/src/db.rs, src-tauri/src/main.rs, components/ClusterPanel.tsx

Implementar un sistema que agrupe videos automáticamente por similitud de contenido (embeddings de transcripciones).

**Implementar:**

1. En src-tauri/src/db.rs, añadir función de clustering:
`ust
pub fn cluster_videos_by_similarity(conn: &Connection, threshold: f32, min_cluster_size: usize) -> Result<Vec<Vec<i64>>> {
    // Obtener todos los embeddings
    let mut stmt = conn.prepare(
        "SELECT te.job_id, te.embedding_vector FROM transcript_embeddings te
         JOIN jobs j ON j.id = te.job_id
         WHERE j.status = 'complete'
         GROUP BY te.job_id"
    )?;
    
    let mut job_embeddings: Vec<(i64, Vec<f32>)> = Vec::new();
    for row in stmt.query_map([], |row| {
        let job_id: i64 = row.get(0)?;
        let blob: Vec<u8> = row.get(1)?;
        let mut embedding = Vec::with_capacity(blob.len() / 4);
        for chunk in blob.chunks_exact(4) {
            embedding.push(f32::from_ne_bytes(chunk.try_into().unwrap()));
        }
        Ok((job_id, embedding))
    })? {
        if let Ok((job_id, embedding)) = row {
            job_embeddings.push((job_id, embedding));
        }
    }
    
    // Clustering simple por similitud de coseno
    let mut clusters: Vec<Vec<i64>> = Vec::new();
    let mut used: std::collections::HashSet<i64> = std::collections::HashSet::new();
    
    for (job_id, embedding) in &job_embeddings {
        if used.contains(job_id) { continue; }
        
        let mut cluster = vec![*job_id];
        used.insert(*job_id);
        
        for (other_id, other_emb) in &job_embeddings {
            if used.contains(other_id) { continue; }
            let sim = cosine_similarity(embedding, other_emb);
            if sim >= threshold {
                cluster.push(*other_id);
                used.insert(*other_id);
            }
        }
        
        if cluster.len() >= min_cluster_size {
            clusters.push(cluster);
        }
    }
    
    Ok(clusters)
}
`

2. En src-tauri/src/main.rs, añadir comando:
`ust
#[tauri::command]
async fn auto_cluster_videos(
    threshold: Option<f32>,
    min_cluster_size: Option<usize>,
    state: State<'_, AppState>
) -> Result<Vec<Vec<i64>>, String> {
    let db = state.db.lock().await;
    let thresh = threshold.unwrap_or(0.7);
    let min_size = min_cluster_size.unwrap_or(2);
    db::cluster_videos_by_similarity(&db, thresh, min_size).map_err(|e| e.to_string())
}
`

3. Registrar en .invoke_handler().

4. Crear components/ClusterPanel.tsx que muestra los clusters encontrados.

#### TAREA 5.3 — UI de selección de conservación/online
**Archivos:** src-tauri/src/db.rs, src-tauri/src/main.rs, components/VideoCard.tsx, components/VideoGrid.tsx, pp/page.tsx

Permitir al usuario marcar videos como "Conservar" (descargado) o "Solo en línea" (streaming), y filtrar por este estado.

**Implementar:**

1. En src-tauri/src/db.rs, añadir columna y funciones:
`sql
ALTER TABLE media ADD COLUMN keep_status TEXT DEFAULT 'keep';
-- Valores: 'keep' (conservar), 'online' (solo en línea)
`

`ust
pub fn set_media_keep_status(conn: &Connection, job_id: i64, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE media SET keep_status = ?1 WHERE job_id = ?2",
        params![status, job_id],
    )?;
    Ok(())
}

pub fn get_media_keep_status(conn: &Connection, job_id: i64) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT keep_status FROM media WHERE job_id = ?1")?;
    let status: Option<String> = stmt.query_row(params![job_id], |row| row.get(0)).ok();
    Ok(status)
}
`

2. En src-tauri/src/main.rs, añadir comando:
`ust
#[tauri::command]
async fn set_video_keep_status(
    job_id: i64,
    status: String,
    state: State<'_, AppState>
) -> Result<(), String> {
    let db = state.db.lock().await;
    db::set_media_keep_status(&db, job_id, &status).map_err(|e| e.to_string())
}
`

3. En components/VideoCard.tsx, añadir botones de estado:
`	sx
const [keepStatus, setKeepStatus] = useState<'keep' | 'online'>('keep');

// Botones en el overlay:
<button onClick={() => setKeepStatus('keep')} className="...">Conservar</button>
<button onClick={() => setKeepStatus('online')} className="...">Solo en línea</button>
`

4. En components/VideoGrid.tsx, filtrar por keepStatus si está activo el filtro.

5. En pp/page.tsx, añadir filtro de conservación en PagePanel.

---

**VERIFICATION GATES ADICIONALES:**

Después de cada tarea, ejecutar:
`ash
cd C:\Users\danie\Desktop\Pulsaria && npx tsc --noEmit
cd C:\Users\danie\Desktop\Pulsaria\src-tauri && cargo check
`

No ejecutar 
pm run build hasta resolver los binarios nativos de Windows.

## ðŸ§ª VERIFICATION GATES FINALES

Al terminar todos los bloques, ejecutar:

```bash
# 1. TypeScript sin errores
cd C:\Users\danie\Desktop\Pulsaria
npx tsc --noEmit

# 2. Rust compila sin errores
cd C:\Users\danie\Desktop\Pulsaria\src-tauri
cargo check

# 3. Frontend build exitoso
cd C:\Users\danie\Desktop\Pulsaria
npm run build
```

Si los 3 pasan â†’ Crear el reporte de sesiÃ³n.

---

## ðŸ“ REPORTE FINAL DE SESIÃ“N

Al terminar, crear `C:\Users\danie\Desktop\Pulsaria\docs\SESSION_REPORT_AUTOGEN.md` con:

```markdown
# Reporte de SesiÃ³n AutÃ³noma â€” [FECHA]

## âœ… Completado
- (lista de tareas completadas)

## âš ï¸ Bloqueado
- (lista de tareas que fallaron con motivo)

## ðŸ”§ Archivos Modificados
- (lista de archivos tocados)

## ðŸ“Œ PrÃ³ximos Pasos Sugeridos
- (tareas pendientes para la siguiente sesiÃ³n)
```

---

**FIN DEL BRIEF. Kilocode: empieza desde TAREA 1.1 y no te detengas.**
