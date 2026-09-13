# Changelog

Todos los cambios notables en Pulsaria.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/), y el proyecto adhiere a [Semantic Versioning](https://semver.org/).

---

## [0.1.0] - 2026-08-27

### Agregado

#### Motor de búsqueda semántica
- Motor ONNX con modelo `all-MiniLM-L6-v2` (384 dimensiones) para embeddings
- Índice HNSW con 4 shards paralelos para búsqueda vectorial
- Chunking semántico con ventana deslizante (150 chars, overlap 50)
- Búsqueda híbrida BM25 + HNSW con Reciprocal Rank Fusion (RRF)
- Búsqueda literal (case-insensitive) sobre transcripciones, títulos y autores
- Cache semántica LRU para queries frecuentes
- Reranker cross-encoder (feature flag, deshabilitado por defecto)

#### Pipeline de procesamiento
- Workers Python aislados: `downloader.py` (yt-dlp), `audio_extractor.py` (ffmpeg), `transcriber.py` (faster-whisper)
- Visual analyzer con keyframes y estadísticas Pillow
- QueueManager async con despacho de workers vía subprocesos
- Eventos de progreso en tiempo real vía Tauri Events

#### Persistencia
- Base de datos SQLite con esquema auto-migrante
- Tablas: `jobs`, `media`, `transcript_embeddings`, `transcript_segments`, `playlists`, `playlist_items`, `collection_sources`
- Persistencia de configuración de búsqueda en `%APPDATA%/Pulsaria`

#### Frontend
- Dashboard principal con grid de videos y cola de procesamiento
- Búsqueda semántica y literal con resultados en tiempo real
- Panel Engine: estado del modelo ONNX, BD, configuración, métricas, debug, logs
- Playlists temáticas (manuales y auto-generadas)
- Fondo animado Aurora WebGL (Three.js)
- StatsPanel con métricas de uso
- Modal expandido de video con transcripción sincronizada

#### API REST
- Gateway Axum en puerto 8080 con endpoints para jobs, búsqueda y exportación
- Endpoints Julia: `GET /api/v1/julia/pending`, `POST /api/v1/julia/ack`
- Exportación de biblioteca como JSON

#### Integración Julia
- Exportación a formato UNIB (Universal Neural Identity Binding)
- Importación de archivos .unib existentes
- Contrato de datos estructurado con `julia_ready: true`

#### Seguridad
- Validación de URLs (solo HTTPS soportadas)
- Rate limiting configurable por RPS
- Soporte de cookies de navegador (Chrome, Edge, Firefox) para fuentes restringidas

#### Observabilidad
- Prometheus metrics exporter en puerto 9001
- Dashboard Grafana preconfigurado
- Logs en tiempo real al frontend vía eventos Tauri

#### Empaquetado
- Instalador Windows NSIS con Python embebible, workers, modelos ONNX y FFmpeg
- Configuración de usuario en `%APPDATA%/Pulsaria`
- Videos procesados en la carpeta de Descargas (configurable)

### Corregido
- Schema de tabla `media` incompleto (columnas `keep_status`, `platform`)
- Schema de tabla `playlists` incompleto (`cover_job_id`, `auto_generated`, `topic_keywords`)
- Thumbnail siempre generaba path local vacío en vez de usar URL real del video
- Nombre de producto inconsistente ("TikTok Processor" / "ai-studio-applet")
- StatsPanel no estaba integrado en el Dashboard

### Conocido
- Scheduler de mantenimiento HNSW escribe snapshots en `data/` cada ~10 min, lo que puede causar recompilación en modo `tauri dev` (no afecta builds empaquetados)
- Menú "Ordenar" del Header es decorativo (no opera sobre el grid)
- SettingsPanel solo persiste en `localStorage` (no conectado al backend)
- Pipeline end-to-end no verificado con video real en producción
