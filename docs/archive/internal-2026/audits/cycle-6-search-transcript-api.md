# Ciclo 6 — búsqueda, transcript, UNIB y API local

## Objetivo y criterio de salida

Este ciclo auditó la ruta completa desde una consulta de biblioteca hasta la apertura del job, la reproducción o apertura de la fuente original, la lectura sincronizada del transcript, la exportación/importación UNIB y los contratos REST equivalentes. El criterio de salida fue que cada función disponible tuviera una ruta real, que los errores fueran visibles y que las pruebas no dependieran de una descarga externa de TikTok.

El ciclo queda **cerrado para la implementación local de Fase 6**. La validación de una descarga real de TikTok y la inspección visual mediante el navegador conectado permanecen fuera de esta evidencia porque no se proporcionó una URL pública autorizada y el mecanismo de inspección visual disponible había devuelto 504 en los ciclos anteriores. Esos límites no se presentan como fallos del endpoint local.

## Correcciones realizadas

| Área | Corrección implementada | Resultado funcional |
|---|---|---|
| Modo de búsqueda | `Header` incorpora el selector accesible `Modo de búsqueda` con `Literal` y `Semántica`. La consulta usa exclusivamente el comando o endpoint del modo elegido y la vista muestra `BÚSQUEDA LITERAL` o `BÚSQUEDA SEMÁNTICA`. | El usuario puede elegir búsqueda textual exacta o descubrimiento semántico; ya no existe un fallback implícito que oculte qué motor respondió. |
| Navegación de resultados | La vista de resultados resuelve `video_id` contra `allJobs`, rechaza con alerta un job inexistente y monta `ExpandedVideoModal` directamente desde la vista de búsqueda. | El clic sobre una coincidencia abre el reproductor o la ficha correspondiente sin depender de que `VideoGrid` esté montado. |
| Resultados sin asset local | El modal usa `originalUrl` y muestra `Ver fuente original` cuando el archivo local no está retenido. La apertura valida HTTPS y utiliza el shell nativo con fallback web. | Los jobs online-only no muestran controles de reproducción inoperantes ni quedan sin salida. |
| Transcript | `GET /api/v1/jobs/:job_id/transcript` y `get_transcript` entregan segmentos con `chunk_index`, `chunk_text`, `start` y `end`. Cada segmento del modal pasó de `motion.div` a `motion.button`, con etiqueta accesible y seek por clic, Enter o Espacio. | La transcripción puede filtrarse, copiarse y saltar a un instante temporal de forma accesible. |
| Importación UNIB | Se validan encabezado, triple semántico, fuente HTTPS, límites de 10 MB y rangos temporales. El import crea o reutiliza un job, materializa media `online`, persiste segmentos, genera embeddings ONNX 384-D, indexa HNSW y guarda el archivo importado. | La importación ya no es solo un archivo archivado: el transcript queda disponible para búsqueda literal y semántica. El duplicado por fuente es idempotente a nivel de job. |
| Exportación UNIB | Se conserva la exportación con metadata, timestamps, modelo y triple de fuente. La interfaz importa mediante selector de archivo real y muestra que transcript e índice fueron reindexados. | Export e import tienen contrato común y mensajes de resultado explícitos. |
| `/api/v1/transcribe` | La ruta dejó de responder 501. Ahora acepta `{"url":"..."}` y delega en la misma cola de ingesta, descarga, audio, transcripción, evidencia visual e indexación que `/api/v1/ingest`. | Clientes existentes que solicitan transcripción directa reciben un job encolado sin un pipeline paralelo. |
| Persistencia semántica | Se evita duplicar nodos HNSW para el mismo `(job_id, chunk_index)`. La ruta Tauri, la ruta REST y UNIB ejecutan snapshot inmediato después de indexar. | Un embedding no depende únicamente de la memoria del proceso y sobrevive al reinicio del runtime. |
| Configuración | `SearchService` usa configuración mutable protegida por `RwLock`; `update_search_config` propaga `min_score` y `max_results` al servicio activo. La fragmentación del pipeline se unificó en 150 tokens con solapamiento de 50. | Settings y búsqueda semántica comparten el mismo runtime y el mismo contrato de fragmentación base. |
| Runtime ONNX | La resolución del modelo busca tanto `assets/models` como `src-tauri/assets/models` y recursos junto al ejecutable. | El binario de desarrollo iniciado desde la raíz encuentra el modelo existente en `src-tauri/assets` y el endpoint semántico deja de fallar por ruta relativa. |
| Dependencias | Se retiró el `pnpm-lock.yaml` generado de forma accidental. `package-lock.json` queda como único lockfile y `tauri info` ya no muestra el warning de dos gestores. | La instalación y el diagnóstico de Tauri son reproducibles con npm. |

## Auditoría secuencial de controles

| Secuencia | Control auditado | Prueba de corrección | Estado |
|---:|---|---|---|
| 1 | Selector `Modo de búsqueda` | TypeScript, ESLint y build Next pasan; el selector tiene `aria-label`, valor controlado y opciones explícitas. | PASS |
| 2 | Debounce y Enter | El Header conserva debounce de 800 ms y Enter cancela el timer y envía el modo actual. | PASS |
| 3 | Endpoint literal | `POST /api/v1/search/literal` devuelve `{results}` y consulta texto de transcript, título y autor. | PASS |
| 4 | Endpoint semántico | `POST /api/v1/search` devuelve `{results}` con ONNX cargado; consulta sin corpus responde shape válido y lista vacía. | PASS |
| 5 | Resultado inexistente | El clic busca el job en `allJobs`; si no existe muestra error y no monta una ficha falsa. | PASS |
| 6 | Resultado existente | La coincidencia monta `ExpandedVideoModal` desde la vista de búsqueda y conserva `originalUrl`, metadata y análisis. | PASS |
| 7 | Online-only | Sin `videoSrc`, el modal muestra la razón y `Ver fuente original`; la URL se valida como HTTPS antes de abrirla. | PASS |
| 8 | Filtro de transcript | El filtro usa la lista persistida y el estado vacío distingue carga, error y cero coincidencias. | PASS |
| 9 | Seek de transcript | Cada segmento es un botón accesible con etiqueta temporal y llama a `seekToSecond`. | PASS |
| 10 | Copia de transcript | El botón copia el texto completo visible y refleja temporalmente el estado copiado. | PASS |
| 11 | Transcript REST | Fixture local: un segmento respondió con `start=1.25` y un solo elemento en `GET /api/v1/jobs/:id/transcript`. | PASS |
| 12 | Importación UNIB | Parser unitario valida headers, timestamps, rangos y transcript; el comando implementa persistencia e indexado real con ONNX. | PASS — ruta compilada; E2E de selector Tauri pendiente de inspección visual |
| 13 | `/transcribe` | URL HTTP insegura respondió 400; la ruta ya no responde 501. Una URL válida no se ejecutó para no iniciar una descarga externa sin autorización. | PASS — rechazo seguro; alias completo no descargado |
| 14 | Persistencia HNSW | Snapshot inmediato en QueueManager, QueueService y UNIB; deduplicación por job/chunk en HNSW. | PASS |
| 15 | Configuración semántica | `update_search_config` actualiza estado persistido y `SearchService` activo. | PASS |

## Evidencia ejecutada

### Suite Rust

Se ejecutaron `cargo fmt -- --check` y `cargo test -- --nocapture` sobre `src-tauri`. Resultado final: **12 tests passed, 0 failed**. La suite cubre validación de URLs, detección de colecciones TikTok, persistencia de errores y análisis visual, fuentes de colección, limpieza de retención, clustering por promedio de BLOBs, búsqueda literal y parser UNIB.

### Suite frontend

`npm run build` terminó correctamente con Next.js 15.5.23. La salida reportó la ruta estática `/` compilada, linting y comprobación de tipos correctos. La verificación adicional `npm exec -- tsc --noEmit` y ESLint dirigido a `app/page.tsx`, `components/Header.tsx`, `components/ExpandedVideoModal.tsx`, `components/config/SearchParametersCard.tsx` y `hooks/useSemanticIO.ts` también terminó con código 0.

### Workers Python

`python -m compileall -q python-workers`, `python python-workers/main.py --help` y `python -m py_compile python-workers/downloader.py python-workers/transcriber.py python-workers/visual_analyzer.py` terminaron correctamente. No se descargó ningún video remoto durante este ciclo.

### Runtime nativo y REST

Se reconstruyó y relanzó `target-tauri/debug/pulsaria.exe`. El proceso escuchó en `127.0.0.1:8080` sin tocar el listener ajeno de `127.0.0.1:3000`. La sonda final informó:

```text
final_runtime=ok health=ok jobs=1 literal_shape=True semantic_shape=True transcribe_invalid_status=400
```

La fixture REST controlada se insertó en la base local, consultó el gateway y se limpió en orden de claves foráneas. Resultado observado:

```text
rest_fixture=ok job_id=5 literal_matches=1 literal_video_id=5 transcript_segments=1 transcript_start=1.25 transcribe_invalid_status=400
```

La prueba de semántica sin corpus coincidió con el contrato `{results}` y devolvió cero resultados, como corresponde a una base sin documentos de prueba indexados. La fixture temporal no quedó en `data/library.db`.

## Límites que no deben confundirse con defectos corregidos

No se ejecutó una descarga TikTok real, expansión real de perfil/playlist ni lectura de cookies del navegador, porque hacerlo requiere una URL pública permitida y consentimiento explícito. El scheduler de colecciones y los límites de TikTok siguen sujetos a autenticación, rate limits y cambios del servicio externo.

La detección OCR es opcional: Tesseract no está instalado en el entorno de desarrollo. El análisis visual MVP produce keyframes y estadísticas Pillow, y solo añade OCR si el binario está disponible; no se debe presentar como detección general de objetos.

La inspección visual automatizada de la interfaz no se pudo reclamar: en ciclos previos el listener `::1:3000` de Pulsaria devolvió 504 a la extensión y `127.0.0.1:3000` correspondía a Pixvoxia. Por ello este documento acredita controles con código, tipos, lint, build, runtime REST y pruebas deterministas, pero no afirma clics visuales humanos o automatizados.

Finalmente, este ciclo no certifica todavía un instalador autónomo de Windows. El ejecutable de desarrollo usa recursos presentes en el árbol del proyecto; el empaquetado de Python, FFmpeg, yt-dlp, ONNX, tokenizer y dependencias de workers se auditará en la fase siguiente con `tauri build` y una prueba del artefacto extraído.

## Veredicto

**Fase 6 implementada y validada en entorno local de desarrollo.** La búsqueda literal y semántica tienen elección explícita, sus resultados abren la ficha correcta, el transcript tiene contrato Tauri/REST y controles accesibles, UNIB rehidrata conocimiento con ONNX/HNSW, `/transcribe` ya no es un stub y el índice semántico se guarda después de procesar. La salida siguiente debe centrarse en el empaquetado funcional para Windows y en resolver los recursos de primer arranque; no debe reinterpretarse este documento como certificación de descarga remota ni de instalador final.
