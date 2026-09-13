# PULSARIA — AUDITORÍA 07: PIPELINE DE WORKERS PYTHON
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
