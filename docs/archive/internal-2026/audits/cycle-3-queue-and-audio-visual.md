# Ciclo 3 — Cola, worker y procesamiento audiovisual

## Objetivo

Verificar el contrato completo entre Python, Tauri, el pool REST, SQLite y la cola visual: arranque del worker, eventos JSONL, estados, reintentos, errores visibles, transcript, segmentos, embeddings, análisis de keyframes y persistencia del instructivo.

## Correcciones aplicadas

| Punto | Corrección |
|---|---|
| CLI del worker | Se añadió el import faltante de `argparse`; `main.py --help` ya responde sin colgarse. |
| Eventos JSON | `events.py` importa `json` y `emit_error` envía el mensaje tanto en `message` como en `text`, de modo que ambos runners pueden mostrarlo. |
| Runtime audiovisual | Se corrigieron imports faltantes de `json`, `os` y `Path` en downloader, audio extractor y transcriber. |
| Errores persistidos | SQLite ahora guarda `jobs.error_message`; Tauri y el pool REST escriben el detalle al llegar a error final. |
| Cola visible | QueueSection identifica `error_dlq`, muestra el detalle persistido y distingue `Error` de procesamiento normal. |
| Análisis visual | Se añadió `visual_analyzer.py`: extrae keyframes locales con FFmpeg, calcula métricas de imagen con Pillow y usa OCR opcional si Tesseract existe. |
| Instructivo | El orquestador combina transcript y evidencia visual en `instructional_guide`, lo persiste junto con `visual_analysis` y lo muestra en Ficha IA. |
| Paridad de runners | El puente Tauri y el WorkerPool REST transportan y persisten los mismos campos audiovisuales. |
| Estado de etapa | `visual_analysis` se normaliza como `indexing` y QueueSection lo representa como TXT/Indexado. |

## Pruebas ejecutadas

| Prueba | Resultado |
|---|---:|
| `python python-workers/main.py --help` | Aprobada |
| `python -m compileall -q python-workers` | Aprobada |
| Smoke de imports y error JSON | Aprobado; el evento incluye `message` y `text` |
| Smoke de ausencia de input de audio/transcript | Aprobado; ambos errores son claros |
| Smoke de video sintético local con FFmpeg | Aprobado; 3 keyframes procesados y guía generada |
| `cargo fmt --check` | Aprobada |
| `cargo check` | Aprobada |
| `cargo test` | 7 aprobadas, 0 fallidas |
| TypeScript y ESLint de cola/modal/grid | Aprobados |
| `npm run build` | Aprobado; Next compiló y exportó la ruta principal |

## Limitaciones explícitas

No se ejecutó una descarga de TikTok real porque no se proporcionó una URL pública permitida ni consentimiento específico para esa descarga. Tampoco se presentó OCR real como garantizado: en el equipo auditado FFmpeg estuvo disponible, pero Tesseract no se encontró en PATH. Pillow sí se validó con el fixture local. El análisis visual implementado es evidencia reproducible de keyframes, color, brillo, dimensiones y OCR opcional; no afirma detección de objetos sin un modelo de visión instalado.

## Guía dura para el ciclo 4

La siguiente fase debe auditar la biblioteca sin usar datos simulados como evidencia de persistencia. Debe verificar filtros de estado, plataforma y retención; layouts grid/list/compact; columnas y orden; tarjeta en progreso/error/completa; resolución de thumbnails y video local; modal; retención online-only; y apertura externa de la URL original. Debe comprobarse que los campos audiovisuales llegan desde `/api/v1/jobs` y no solo desde mocks. Si una tarjeta completa no tiene video local, la UI debe explicar si está en modo online-only y abrir la URL con una integración nativa segura.

Los cambios permanecen sin commit ni push.
