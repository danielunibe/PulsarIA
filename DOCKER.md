# 🐳 PULSARIA — DOCKER OFFICIAL RUNTIME & DEPLOYMENT GUIDE

**Versión:** 1.0.0 (MVP)  
**Entorno Oficial:** Docker Desktop / Docker Compose v2+

---

## 🏗️ ARQUITECTURA DE CONTENEDORES DOCKER

Pulsaria implementa una arquitectura desacoplada y contenerizada lista para producción y desarrollo:

```text
                                  PULSARIA STACK
                                         │
                   ┌─────────────────────┼─────────────────────┐
                   ▼                     ▼                     ▼
          pulsar-frontend          pulsar-worker          pulsar-redis
          (Next.js Web UI)        (Python/AI Engine)    (Semantic Cache)
            Port: :3000               No expuesto          Port: :6379
                   │                     │                     │
                   └─────────────────────┼─────────────────────┘
                                         ▼
                                   data/ (Volume)
                              ├── library.db (SQLite)
                              ├── processing/ (Videos MP4, Audio, Transcripts)
                              └── vector_index_shard_*.hnsw
```

---

## 📦 SERVICIOS Y PUERTOS

| Servicio | Contenedor | Imagen / Dockerfile | Puertos | Healthcheck | Volumen |
|---|---|---|---|---|---|
| **Frontend** | `pulsar-frontend` | `./Dockerfile` (Node 20 Alpine) | `3000:3000` | `wget http://127.0.0.1:3000/` | - |
| **Worker** | `pulsar-worker` | `python-workers/Dockerfile` (Python 3.12 Slim) | Interno | `python -c "import yt_dlp, ffmpeg, faster_whisper, curl_cffi, PIL; print('OK')"` | `./data:/app/data` |
| **Cache** | `pulsar-redis` | `redis:7-alpine` | `6379:6379` | `redis-cli ping` | `redis_data:/data` |

---

## 🚀 COMANDOS EXACTOS DE INICIO Y GESTIÓN

### 1. Iniciar toda la infraestructura
```powershell
docker compose up -d
```

### 2. Verificar estado de los servicios (Health)
```powershell
docker compose ps
```
*Los 3 contenedores deben aparecer con estado `Up (healthy)`.*

### 3. Ver logs en tiempo real
```powershell
docker compose logs -f
```

### 4. Detener servicios (conservando todos los datos)
```powershell
docker compose stop
# o
docker compose down
```
> ⚠️ **IMPORTANTE:** Nunca ejecutar `docker compose down -v` ya que eliminaría los volúmenes persistentes.

---

## 🧪 VALIDACIÓN E2E DE PROCESAMIENTO MULTIMEDIA

Para procesar un video real de TikTok dentro del entorno Docker:

```powershell
docker exec pulsar-worker python main.py --job_id 101 --url "https://www.tiktok.com/@scout2015/video/6718335390845095173"
```

El pipeline ejecutará automáticamente:
1. `download_started` (Progreso 15%)
2. `metadata_extracted` (Progreso 30% - título, autor, duración)
3. `download_complete` (Progreso 50% - guardado en `/app/data/processing/101/video.mp4`)
4. `transcription_started` (Progreso 65% - conversión a audio WAV 16kHz)
5. `transcription_complete` (Progreso 90% - texto generado por faster-whisper con timestamps)
6. `visual_analysis` (Progreso 95% - extracción de keyframes y métricas visuales con Pillow)
7. `completed` (Progreso 100% - video, audio, transcripción e instructivo listos para consumo)

---

## 💾 PERSISTENCIA DE DATOS

Todos los videos procesados, audios y transcripciones se persisten en el directorio montado del host:
- **Videos descargados:** `data/processing/{job_id}/video.mp4`
- **Audios extraídos:** `data/processing/{job_id}/audio.mp3` o `audio.wav`
- **Transcripciones:** `data/processing/{job_id}/transcript.txt`
- **Base de datos SQLite:** `data/library.db`
