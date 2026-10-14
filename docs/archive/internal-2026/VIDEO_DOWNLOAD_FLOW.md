# 📥 Pulsar — Flujo de Descarga y Procesamiento de Videos

Diagrama detallado de cómo Pulsar descarga, procesa y transforma un video en conocimiento consultable.

---

## 1. Flujo General: URL → Video Procesado

```
                          ┌─────────────────────────────┐
                          │     USUARIO PEGA URL         │
                          │  (TikTok / YouTube / IG)     │
                          └──────────────┬──────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                             │
│                                                                     │
│  AddLinks.tsx                                                       │
│  ├── Valida formato de URL                                          │
│  ├── Detecta plataforma (TikTok/YouTube/Instagram)                  │
│  ├── Si es playlist → expande a URLs individuales                   │
│  └── Llama invoke("add_job", { url })                              │
│                                                                     │
│  QueueSection.tsx                                                   │
│  ├── Escucha eventos "job_progress" en tiempo real                  │
│  ├── Muestra barra de progreso por job                              │
│  └── Actualiza status: queued → downloading → transcribing → done   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    Tauri IPC  │  invoke("add_job")
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND (Rust + Tauri)                          │
│                                                                     │
│  main.rs::add_job()                                                 │
│  ├── Valida URL (solo HTTPS, hosts permitidos)                     │
│  ├── Verifica si es colección (playlist/liked/favorites)            │
│  │   └── Si sí → expande URLs y crea un job por cada video         │
│  ├── INSERT en SQLite: jobs(url, status='queued', progress=0)      │
│  └── queue.add_job() → Tokio spawn                                 │
│                                                                     │
│  queue.rs::dispatch_worker()                                        │
│  ├── Actualiza status → 'downloading'                              │
│  ├── Lanza subproceso Python aislado:                               │
│  │   python main.py --job_id {id} --url "{url}"                    │
│  ├── Parsea eventos JSON del stdout del worker                      │
│  ├── Actualiza SQLite con progreso en tiempo real                   │
│  └── Emite Tauri Event "job_progress" al frontend                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    Tokio      │  Child Process
                    Child      │  (stdin/stdout JSON)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   WORKER PYTHON (main.py)                           │
│                   Aislado del proceso Rust                           │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │   PASO 1: DESCARGA & METADATA (progress: 15% → 50%)        │   │
│  │   ┌────────────────────────────────────────────────────┐    │   │
│  │   │  downloader.py                                     │    │   │
│  │   │                                                    │    │   │
│  │   │  1a. extract_metadata(url)                         │    │   │
│  │   │      └── yt-dlp --dump-json → JSON con:            │    │   │
│  │   │          title, author, duration, thumbnail,       │    │   │
│  │   │          upload_date, platform                     │    │   │
│  │   │                                                    │    │   │
│  │   │  1b. download_video(url, job_id, base_dir)         │    │   │
│  │   │      └── yt-dlp -f "best[ext=mp4]" → video.mp4    │    │   │
│  │   │          Guardado en: data/processing/{job_id}/    │    │   │
│  │   │                                                    │    │   │
│  │   │  EVENTO: download_complete                         │    │   │
│  │   └────────────────────────────────────────────────────┘    │   │
│  │                          │                                   │   │
│  │                          ▼                                   │   │
│  │   PASO 2: EXTRACCIÓN DE AUDIO (progress: 50% → 65%)       │   │
│  │   ┌────────────────────────────────────────────────────┐    │   │
│  │   │  audio_extractor.py                                │    │   │
│  │   │                                                    │    │   │
│  │   │  2a. extract_audio(video_path)                     │    │   │
│  │   │      └── ffmpeg -i video.mp4                       │    │   │
│  │   │          -vn -acodec pcm_s16le                     │    │   │
│  │   │          -ar 16000 -ac 1                            │    │   │
│  │   │          → audio.wav (16kHz mono)                   │    │   │
│  │   │                                                    │    │   │
│  │   │  EVENTO: transcription_started                     │    │   │
│  │   └────────────────────────────────────────────────────┘    │   │
│  │                          │                                   │   │
│  │                          ▼                                   │   │
│  │   PASO 3: TRANSCRIPCIÓN (progress: 65% → 90%)             │   │
│  │   ┌────────────────────────────────────────────────────┐    │   │
│  │   │  transcriber.py                                    │    │   │
│  │   │                                                    │    │   │
│  │   │  3a. Carga modelo Whisper (lazy, 1ª vez)           │    │   │
│  │   │      └── faster-whisper.WhisperModel(              │    │   │
│  │   │          model='tiny' (configurable),               │    │   │
│  │   │          device='cpu',                               │    │   │
│  │   │          compute_type='int8'                        │    │   │
│  │   │      )                                              │    │   │
│  │   │                                                    │    │   │
│  │   │  3b. transcribe_audio(audio_path)                  │    │   │
│  │   │      └── Retorna:                                  │    │   │
│  │   │          { text: "transcripción completa",          │    │   │
│  │   │            segments: [                              │    │   │
│  │   │              {start: 0.0, end: 4.2, text: "..."},  │    │   │
│  │   │              {start: 4.2, end: 8.1, text: "..."},  │    │   │
│  │   │              ...                                    │    │   │
│  │   │            ]}                                      │    │   │
│  │   │                                                    │    │   │
│  │   │  EVENTO: transcription_complete                    │    │   │
│  │   └────────────────────────────────────────────────────┘    │   │
│  │                          │                                   │   │
│  │                          ▼                                   │   │
│  │   PASO 4: ANÁLISIS VISUAL (progress: 90% → 95%)          │   │
│  │   ┌────────────────────────────────────────────────────┐    │   │
│  │   │  visual_analyzer.py                                │    │   │
│  │   │                                                    │    │   │
│  │   │  4a. Extrae 5 keyframes con FFmpeg                 │    │   │
│  │   │      └── ffmpeg -ss {timestamp} → frame_{n}.png   │    │   │
│  │   │                                                    │    │   │
│  │   │  4b. Analiza con Pillow                             │    │   │
│  │   │      ├── Brillo promedio, contraste, dominante     │    │   │
│  │   │      ├── Detección de texto en pantalla (OCR)      │    │   │
│  │   │      └── Clasificación de escena                   │    │   │
│  │   │                                                    │    │   │
│  │   │  4c. Genera instructivo audiovisual (Markdown)     │    │   │
│  │   │      └── Guía paso a paso basada en el contenido   │    │   │
│  │   │                                                    │    │   │
│  │   │  EVENTO: visual_analysis                           │    │   │
│  │   └────────────────────────────────────────────────────┘    │   │
│  │                          │                                   │   │
│  │                          ▼                                   │   │
│  │   PASO 5: COMPLETADO (progress: 100%)                      │   │
│  │   ┌────────────────────────────────────────────────────┐    │   │
│  │   │  EVENTO: completed                                 │    │   │
│  │   │  Contiene: metadata + transcript + segments +      │    │   │
│  │   │            visual_analysis + instructional_guide   │    │   │
│  │   └────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ▲ Eventos JSON por stdout ──────────────────────────────────────┐  │
│  │                                                                │  │
└──┼────────────────────────────────────────────────────────────────┼──┘
   │                                                                │
   │  queue.rs parsea cada evento JSON                              │
   │  y actualiza SQLite:                                           │
   │  ├── title, author, duration → tabla media                     │
   │  ├── video_path, audio_path → tabla media                      │
   │  ├── transcript → tabla transcript_segments                    │
   │  └── status → 'complete' en tabla jobs                         │
   │                                                                │
   │  DESPUÉS del evento "completed", Rust ejecuta:                  │
   │  ├── SemanticChunker: divide transcripción en chunks           │
   │  │   └── 150 chars chunk, 50 chars overlap                     │
   │  ├── ONNX embedding: genera vector 384d por chunk              │
   │  │   └── all-MiniLM-L6-v2 → L2-normalized                     │
   │  ├── SQLite: INSERT transcript_embeddings                      │
   │  ├── HNSW: indexa vector en shard correspondiente              │
   │  └── Emite Tauri Event "media_indexed" al frontend             │
   │                                                                │
   ▼                                                                │
┌───────────────────────────────────────────────────────────────────┐
│                   BACKEND POST-PROCESAMIENTO                      │
│                                                                   │
│  queue.rs (después de recibir "completed" del worker):            │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │  Semantic Chunking                                        │    │
│  │  ├── Toma el texto completo de la transcripción           │    │
│  │  ├── Divide en chunks de ~150 caracteres                  │    │
│  │  ├── Overlap de 50 caracteres entre chunks               │    │
│  │  └── Guarda chunks en transcript_segments (SQLite)       │    │
│  └───────────────────────┬───────────────────────────────────┘    │
│                          ▼                                        │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │  ONNX Embedding Generation                                │    │
│  │  ├── embedding.rs: ONNXModelManager                       │    │
│  │  ├── Modelo: all-MiniLM-L6-v2 (384 dimensiones)          │    │
│  │  ├── Por cada chunk → vector 384d                         │    │
│  │  ├── L2-normalización del vector                          │    │
│  │  └── Guarda en transcript_embeddings (BLOB, 1536 bytes)  │    │
│  └───────────────────────┬───────────────────────────────────┘    │
│                          ▼                                        │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │  HNSW Vector Index                                        │    │
│  │  ├── VectorShardManager: 4 shards paralelos               │    │
│  │  ├── Asigna chunk al shard por hash(job_id, chunk_index)  │    │
│  │  ├── Inserta vector en el HNSW correspondiente           │    │
│  │  └── Persiste: data/vector_index_shard_{0-3}.hnsw        │    │
│  └───────────────────────┬───────────────────────────────────┘    │
│                          ▼                                        │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │  Notificación al Frontend                                 │    │
│  │  ├── Emite Tauri Event "media_indexed"                    │    │
│  │  ├── Frontend recarga VideoGrid                           │    │
│  │  └── Video aparece como card en la biblioteca             │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 2. Diagrama de Secuencia: Interacción entre Componentes

```
 USUARIO        FRONTEND         BACKEND(Rust)       WORKER(Python)      SQLite
    │              │                  │                    │                │
    │  Pega URL    │                  │                    │                │
    │─────────────▶│                  │                    │                │
    │              │  invoke          │                    │                │
    │              │  add_job(url)    │                    │                │
    │              │─────────────────▶│                    │                │
    │              │                  │  Valida URL        │                │
    │              │                  │  INSERT job        │                │
    │              │                  │───────────────────────────────────▶│
    │              │                  │                    │                │
    │              │                  │  dispatch_worker   │                │
    │              │                  │  (Tokio spawn)     │                │
    │              │                  │───────────────────▶│                │
    │              │                  │                    │                │
    │              │                  │                    │  yt-dlp        │
    │              │                  │                    │  --dump-json   │
    │              │                  │                    │──┐             │
    │              │                  │                    │◀─┘  metadata   │
    │              │                  │                    │                │
    │              │                  │   ◀─────────────── │  stdout:       │
    │              │  job_progress    │   {download_started}│               │
    │◀─────────────│◀─────────────────│                    │                │
    │  Barra: 15%  │                  │                    │                │
    │              │                  │                    │                │
    │              │                  │                    │  yt-dlp        │
    │              │                  │                    │  download      │
    │              │                  │                    │──┐             │
    │              │                  │                    │◀─┘ video.mp4   │
    │              │                  │                    │                │
    │              │                  │   ◀─────────────── │  stdout:       │
    │              │  job_progress    │   {download_complete}               │
    │◀─────────────│◀─────────────────│                    │                │
    │  Barra: 50%  │                  │                    │                │
    │              │                  │                    │                │
    │              │                  │                    │  ffmpeg        │
    │              │                  │                    │  -i video.mp4  │
    │              │                  │                    │  → audio.wav   │
    │              │                  │                    │──┐             │
    │              │                  │                    │◀─┘             │
    │              │                  │                    │                │
    │              │                  │   ◀─────────────── │  stdout:       │
    │              │  job_progress    │   {transcription_  │                │
    │◀─────────────│◀─────────────────│    started}        │                │
    │  Barra: 65%  │                  │                    │                │
    │              │                  │                    │                │
    │              │                  │                    │  faster-       │
    │              │                  │                    │  whisper       │
    │              │                  │                    │  → texto +     │
    │              │                  │                    │    timestamps  │
    │              │                  │                    │──┐             │
    │              │                  │                    │◀─┘             │
    │              │                  │                    │                │
    │              │                  │   ◀─────────────── │  stdout:       │
    │              │  job_progress    │   {transcription_  │                │
    │◀─────────────│◀─────────────────│    complete}       │                │
    │  Barra: 90%  │                  │                    │                │
    │              │                  │                    │                │
    │              │                  │                    │  Pillow        │
    │              │                  │                    │  keyframes +   │
    │              │                  │                    │  OCR + stats   │
    │              │                  │                    │──┐             │
    │              │                  │                    │◀─┘             │
    │              │                  │                    │                │
    │              │                  │   ◀─────────────── │  stdout:       │
    │              │  job_progress    │   {completed}      │                │
    │◀─────────────│◀─────────────────│                    │                │
    │  Barra: 100% │                  │                    │                │
    │              │                  │                    │                │
    │              │                  │  ═══ POST-PROCESAMIENTO RUST ═══   │
    │              │                  │                    │                │
    │              │                  │  SemanticChunker   │                │
    │              │                  │  (150 chars/50 overlap)            │
    │              │                  │───────────────────────────────────▶│
    │              │                  │                    │                │
    │              │                  │  ONNX MiniLM       │                │
    │              │                  │  (384d embedding)  │                │
    │              │                  │──┐                 │                │
    │              │                  │◀─┘ vector 384d     │                │
    │              │                  │───────────────────────────────────▶│
    │              │                  │  INSERT embeddings  │                │
    │              │                  │───────────────────────────────────▶│
    │              │                  │                    │                │
    │              │                  │  HNSW Index        │                │
    │              │                  │  (4 shards)        │                │
    │              │                  │──┐                 │                │
    │              │                  │◀─┘ indexed         │                │
    │              │                  │                    │                │
    │              │  media_indexed   │                    │                │
    │◀─────────────│◀─────────────────│                    │                │
    │  Video       │                  │                    │                │
    │  aparece     │                  │                    │                │
    │  en grid     │                  │                    │                │
    └──────────────┘──────────────────┘────────────────────┘────────────────┘
```

---

## 3. Estados del Job (Máquina de Estados)

```
                    ┌──────────┐
                    │  QUEUED  │  ← Job creado en SQLite
                    └────┬─────┘
                         │ dispatch_worker()
                         ▼
                 ┌────────────────┐
                 │  DOWNLOADING   │  ← yt-dlp descargando
                 └────┬───────────┘
                      │ extract_metadata()
                      ▼
                 ┌────────────────┐
                 │   METADATA     │  ← Metadata extraída
                 └────┬───────────┘
                      │ download_video()
                      ▼
                 ┌────────────────┐
                 │  EXTRACTING    │  ← ffmpeg extrayendo audio
                 │  AUDIO         │
                 └────┬───────────┘
                      │ transcribe_audio()
                      ▼
                 ┌────────────────┐
                 │  TRANSCRIBING  │  ← Whisper procesando
                 └────┬───────────┘
                      │ analyze_video()
                      ▼
                 ┌────────────────┐
                 │   PROCESSING   │  ← Pillow/OCR analizando
                 └────┬───────────┘
                      │ completed
                      ▼
                 ┌────────────────┐
                 │   INDEXING     │  ← ONNX + HNSW en Rust
                 └────┬───────────┘
                      │ media_indexed
                      ▼
                 ┌────────────────┐
                 │   COMPLETE     │  ← Video en biblioteca ✓
                 └────────────────┘

     En cualquier paso puede fallar:
                    │
                    ▼
              ┌──────────┐
              │  ERROR   │  ← error_message en SQLite
              └──────────┘
```

---

## 4. Archivos Generados por Video

```
data/processing/{job_id}/
├── video.mp4              ← Video original descargado (yt-dlp)
├── audio.wav              ← Audio extraído 16kHz mono (ffmpeg)
├── frame_001.png          ← Keyframe 1 (Pillow/FFmpeg)
├── frame_002.png          ← Keyframe 2
├── frame_003.png          ← Keyframe 3
├── frame_004.png          ← Keyframe 4
└── frame_005.png          ← Keyframe 5

data/library.db            ← SQLite: jobs + media + transcripts + embeddings
data/vector_index_shard_0.hnsw  ← HNSW shard 0 (vectores de embeddings)
data/vector_index_shard_1.hnsw  ← HNSW shard 1
data/vector_index_shard_2.hnsw  ← HNSW shard 2
data/vector_index_shard_3.hnsw  ← HNSW shard 3
```

---

## 5. Eventos IPC (Worker → Rust → Frontend)

```
┌──────────────────────┬────────────┬─────────────────────────────────────┐
│ Evento               │ Progress   │ Datos incluidos                     │
├──────────────────────┼────────────┼─────────────────────────────────────┤
│ download_started     │ 15%        │ job_id, step="downloading"          │
│ metadata_extracted   │ 30%        │ metadata (title, author, etc.)      │
│ download_complete    │ 50%        │ video_path, metadata                │
│ transcription_started│ 65%        │ step="transcribing"                 │
│ transcription_complete│ 90%       │ text (transcripción completa),      │
│                      │            │ segments (con timestamps)           │
│ visual_analysis      │ 95%        │ visual_analysis (JSON),             │
│                      │            │ instructional_guide (Markdown)      │
│ completed            │ 100%       │ Todos los datos combinados          │
├──────────────────────┼────────────┼─────────────────────────────────────┤
│ error                │ —          │ error_message descriptivo           │
└──────────────────────┴────────────┴─────────────────────────────────────┘
```

---

## 6. Cómo el Video se Muestra en la Card

```
┌─────────────────────────────────────────────────────────────────────┐
│                   FLUJO: URL → VIDEO EN LA CARD                    │
└─────────────────────────────────────────────────────────────────────┘

  1. USUARIO pega URL en AddLinks.tsx
     └── "https://www.tiktok.com/@user/video/1234567890"

  2. Frontend llama invoke("add_job", { url })
     └── Backend crea job en SQLite, status = 'queued'

  3. Backend lanza subproceso Python aislado
     └── python main.py --job_id 42 --url "https://tiktok.com/..."

  4. Python descarga el video
     └── yt-dlp → data/processing/42/video.mp4

  5. Python extrae audio + transcribe + analiza visualmente
     └── Emite eventos JSON por stdout → Rust los parsea

  6. Rust genera embeddings ONNX y los indexa en HNSW
     └── Emite Tauri Event "media_indexed" al frontend

  7. Frontend recibe evento → fetchJobs() → obtiene job actualizado
     └── job.video_path = "C:/Users/.../data/processing/42/video.mp4"

  8. VideoGrid resuelve la ruta local a URL de asset
     └── toAssetUrl(job.video_path)
         └── convertFileSrc(localPath) de @tauri-apps/api/core
         └── Retorna: "https://asset.localhost/42/video.mp4"

  9. VideoCard recibe videoSrc como prop
     └── Renderiza <video src={videoSrc} loop muted autoPlay />

  10. El video SE REPRODUCE DIRECTAMENTE en la card del grid
      └── El usuario ve el video de TikTok reproduciéndose
          ahí mismo en la caja, como si fuera TikTok nativo
```

### Detalle del componente VideoCard

```
┌─────────────────────────────────────────────────────────────────┐
│                     VideoCard.tsx                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Props recibidos:                                               │
│  ├── videoSrc    → URL resuelta del video local                │
│  ├── thumb       → Thumbnail del video                         │
│  ├── title       → Título del video                            │
│  ├── author      → Nombre del creador                          │
│  ├── tags        → Tags/temas del video                        │
│  ├── isActive    → Si este card está seleccionado              │
│  └── isFullPlaying → Si está en modo reproducción completa     │
│                                                                 │
│  Renderizado:                                                   │
│  ┌───────────────────────────────────────────┐                  │
│  │  ┌───────────────────────────────────┐    │                  │
│  │  │                                   │    │                  │
│  │  │     <video>                       │    │                  │
│  │  │     src={videoSrc}                │    │                  │
│  │  │     autoPlay loop muted           │    │                  │
│  │  │     playsInline                   │    │                  │
│  │  │                                   │    │                  │
│  │  │  ┌─────────────────────────┐      │    │                  │
│  │  │  │ VideoCardOverlay        │      │    │                  │
│  │  │  │ ├── Autor del video     │      │    │                  │
│  │  │  │ ├── Tags/temas          │      │    │                  │
│  │  │  │ ├── Botón play/pause    │      │    │                  │
│  │  │  │ └── Badges de plataforma│      │    │                  │
│  │  │  └─────────────────────────┘      │    │                  │
│  │  └───────────────────────────────────┘    │                  │
│  │  Duración: 01:23  │  TikTok  │  ▶ Play   │                  │
│  └───────────────────────────────────────────┘                  │
│                                                                 │
│  Comportamiento:                                                │
│  ├── En hover: video se reproduce en loop silencioso            │
│  ├── Click play: video se reproduce con sonido                  │
│  ├── Click card: abre ExpandedVideoModal con análisis completo  │
│  └── Drag & drop: permite cargar video local manualmente       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Dependencias Externas del Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     DEPENDENCIAS EXTERNAS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  yt-dlp                                                         │
│  ├── Propósito: Descargar videos de TikTok/YouTube/Instagram   │
│  ├── Ubicación: python-workers/bin/ o PATH del sistema         │
│  └── Config: Resolución flexible (env var, venv, bin, PATH)    │
│                                                                 │
│  FFmpeg                                                         │
│  ├── Propósito: Extraer audio, convertir formatos, keyframes   │
│  ├── Ubicación: bin/ o PATH del sistema                        │
│  └── Config: Resolución flexible (igual que yt-dlp)            │
│                                                                 │
│  Faster-Whisper                                                 │
│  ├── Propósito: Transcribir audio a texto con timestamps       │
│  ├── Modelo: 'tiny' (default, configurable)                    │
│  ├── Dispositivo: CPU int8 (configurable a CUDA)               │
│  └── Descarga automática del modelo a assets/models/           │
│                                                                 │
│  Pillow (PIL)                                                   │
│  ├── Propósito: Análisis de keyframes (brillo, contraste)      │
│  └── Python puro, sin dependencia externa                      │
│                                                                 │
│  Tesseract (OCR) — Opcional                                     │
│  ├── Propósito: Reconocer texto en frames del video            │
│  └── Si no está disponible, el análisis visual continúa        │
│      sin OCR                                                    │
│                                                                 │
│  ONNX Runtime (Rust)                                            │
│  ├── Propósito: Generar embeddings de 384 dimensiones          │
│  ├── Modelo: all-MiniLM-L6-v2 (cargado en Rust, no Python)    │
│  └── Se ejecuta DESPUÉS de que el worker Python termina        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Seguridad del Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     MEDIDAS DE SEGURIDAD                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ Workers Python aislados                                     │
│     Cada job ejecuta un subproceso Python independiente          │
│     No hay estado compartido entre jobs                         │
│                                                                 │
│  ✅ Sin acceso directo a SQLite desde Python                     │
│     Python solo emite JSON por stdout                           │
│     Rust es el único que escribe en SQLite                      │
│                                                                 │
│  ✅ URLs validadas                                               │
│     Solo HTTPS permitido                                        │
│     Whitelist de hosts (TikTok, YouTube, Instagram)             │
│     Sandbox mode activado                                       │
│                                                                 │
│  ✅ Rutas relativas                                               │
│     No hay rutas hardcodeadas                                   │
│     Todas las rutas se calculan desde __file__                  │
│                                                                 │
│  ✅ JWT + Rate Limiting en API REST                              │
│     Middleware de autenticación en cada endpoint                 │
│     Protección contra abuso                                     │
│                                                                 │
│  ✅ Max Payload 1MB en API                                       │
│     Prevención de ataques con payloads grandes                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
