# PULSAR MASTER AUDIT AND PRODUCT DIRECTION

> Documento maestro de continuidad. Congela el estado técnico y visual actual de Pulsar y define la dirección de producto antes de seguir programando.
> Generado sin modificar código, sin ejecutar comandos pesados, sin tocar backend, datos ni modelos.

---

## 1. Snapshot actual

| Dato | Valor |
|---|---|
| Proyecto | `C:\Desarrollos DEV daniel\pulsar-project` |
| Rama | `feat/frontend-integration` |
| Commits clave | `e958374` baseline · `894a56d` integración frontend · `9b78595` validación/static export · `9b467ee` automatización tauri dev/build |
| Estado git | Limpio salvo: `M src-tauri/gen/schemas/capabilities.json` (autogenerado), `?? .vscode/` (ajeno), `?? UNOVA_PROJECT_STATUS.md` (ajeno), `?? data/` (runtime, `library.db`) |
| Backend | Rust + Tauri 2 + Axum + Tokio + SQLite + ONNX (MiniLM 384d) + HNSW (4 shards) + workers Python |
| Frontend | Next.js 15 / React 19 (rescatado e integrado en la raíz) |
| Canal oficial UI→backend | Tauri `invoke` (REST `:8080` como fallback/secundario) |
| Estado de arranque | `npm install` OK · `npm run build` OK · `out/` generado · `cargo check` OK · `npm run tauri dev` OK (Next automático vía `beforeDevCommand`) · Health `:8080` OK · Metrics `:9001` OK · Ventana WebView2 abre · UI carga |
| Incidencia conocida (dev) | El scheduler de mantenimiento escribe snapshots en `data/vector_index_shard_*.hnsw` cada 10 min; esa ruta relativa cae dentro de `src-tauri/`, que el watcher de Tauri vigila → dispara recompilación/reinicio de la ventana cada ~10 min. **Solo ocurre en `tauri dev`; no afecta un build empaquetado.** No corregido todavía (requiere autorización). |

---

## 2. Definición corregida de Pulsar

**Qué es Pulsar:** un motor de escritorio (Rust/Tauri) que descarga videos cortos (TikTok primero, extensible a YouTube y otras fuentes), extrae toda la información posible de cada uno —texto hablado, texto en pantalla, elementos visuales— y lo convierte en una biblioteca local consultable por significado, no solo por palabras clave.

**Qué NO es Pulsar:** no es un simple descargador de videos, no es un conversor de formatos, y no es un clon del proyecto Python viejo (`tiktok_transcriber`) que solo transcribía audio a texto plano.

**Por qué no debe reducirse a "descargador + grid bonito":** la arquitectura ya invertida (ONNX, HNSW, chunking semántico, reranker, cache semántico) solo tiene sentido si el video se convierte en **conocimiento estructurado**: transcripción, texto visual, escenas, objetos, temas, resumen. Reducirlo a descarga + reproducción tira ese trabajo de arquitectura.

**Por qué es un motor multimodal:** combina fuentes de información de naturaleza distinta sobre el mismo video (audio, texto en pantalla, imagen) y las relaciona entre sí, en vez de tratarlas como datos aislados.

**Cómo se relaciona con Julia:** Pulsar es una herramienta **externa** al ecosistema de Julia. Julia no debe cargar con la tarea pesada (descarga, transcripción, visión) — Pulsar la hace, y le entrega a Julia **conocimiento ya procesado y limpio** (ver sección 15).

**Qué problema resuelve:** hoy, la información dentro de un video corto es efímera y no buscable. Pulsar la convierte en algo persistente, estructurado y consultable.

**Qué valor tiene para el usuario:** poder preguntar "¿qué videos hablaban de X?" o "¿cuáles mencionan este producto?" sin tener que volver a ver cada video.

> **Pulsar convierte videos cortos en conocimiento audiovisual consultable por IA.**

**Definición dentro del ecosistema:**
> **Pulsar es el motor externo de Julia para procesar, analizar, organizar y consultar videos.**

---

## 3. Qué problema resuelve

Un usuario (o Julia) acumula decenas o cientos de videos cortos relevantes, pero esa información queda atrapada en formato audiovisual: no es buscable, no es comparable, no se puede preguntar sobre ella. Pulsar resuelve la transformación de "video visto una vez" a "conocimiento consultable permanentemente".

## 4. Qué hace hoy

- Arranca como app de escritorio nativa (Tauri) con backend Rust y frontend Next.js integrado.
- Permite pegar enlaces (individuales o en lote vía `.txt/.csv`) — dispara `add_job` (no probado con video real todavía).
- Mantiene una cola visible de procesamiento (`QueueSection`, lee jobs vía REST).
- Muestra una biblioteca en grid de videos completados (`VideoGrid`, lee `get_jobs` vía invoke).
- Permite búsqueda semántica por texto sobre transcripciones indexadas (`search_transcripts`) — hoy devuelve vacío porque no hay vectores indexados (0 videos procesados).
- Tiene un panel técnico ("Engine") que expone el estado real del motor: modelo ONNX, base de datos, config de búsqueda, métricas, debug de pipeline, logs en vivo.
- Tiene un panel de ajustes (`SettingsPanel`) que hoy solo guarda preferencias en `localStorage` (formatos, carpeta) sin conectarse al backend.

## 5. Qué debería hacer (visión completa)

- Aceptar links individuales, lotes de links, e importación de archivos con muchos enlaces.
- Descargar y conservar el video localmente (visualización offline).
- Extraer **texto**: transcripción de audio, texto en pantalla (OCR), subtítulos/captions, descripción, hashtags.
- Extraer **visual**: escenas, objetos, acciones, interfaces visibles en pantalla, lugares, productos, estilo visual.
- **Comparar** lo dicho (audio) contra lo mostrado (visual) para detectar coincidencias o contradicciones.
- Convertir cada video en una **ficha estructurada** (ver sección 10).
- Ofrecer una biblioteca inteligente, con preguntas en lenguaje natural respondidas por IA sobre el contenido procesado.
- Agrupar videos por temas e intereses detectados automáticamente.
- Exportar ese conocimiento limpio hacia Julia.

---

## 6. Mapa de interfaz actual

| Zona UI | Archivo probable | Función actual | Estado | Riesgo |
|---|---|---|---|---|
| Fondo animado | `ColorBends.tsx` / `app/page.tsx` | Aurora WebGL decorativa | Funcional (visual) | Bajo |
| Sidebar (tabs) | `Sidebar.tsx` | Tabs Dashboard / Engine | Funcional | Bajo |
| AddLinks | `AddLinks.tsx` + `use-link-processor.ts` | Input de enlaces / archivo + botón "Procesar" | Parcialmente funcional (dispara pipeline real, no probado) | Alto si se activa sin control |
| Cola de procesamiento | `QueueSection.tsx` | Jobs activos, progreso, formatos | Funcional (vacío hoy) | Bajo |
| Contador TikToks | `Header.tsx` | Conteo de jobs | Funcional | Bajo |
| Búsqueda | `Header.tsx` + `app/page.tsx` | Input + resultados con % similitud | Funcional (vacío hoy) | Bajo |
| Ordenar (lista) | `Header.tsx` | Menú de orden | **Visual/no operativo** | Medio (engaña al usuario) |
| Settings (engranaje) | `Header.tsx` → `SettingsPanel.tsx` | Formatos + carpeta destino | Visual/local (no llega al backend) | Medio |
| Grid de videos | `VideoGrid.tsx` | Cards de jobs completados + slots vacíos decorativos | Funcional (vacío hoy) | Bajo |
| Cards vacías | `lib/mock-data.ts` (`INACTIVE_SLOTS_COUNT`) | Relleno visual del grid | Placeholder intencional | Bajo — sostiene layout |
| Modal expandido | `ExpandedVideoModal.tsx` | Detalle/reproducción de un video | No verificable sin video real | Medio |
| Panel Engine | `config/SemanticConfigPanel.tsx` + 6 sub-cards | Estado modelo/DB/config/métricas/debug/logs | Funcional real | Bajo (algunas acciones son pesadas) |

---

## 7. Plan del lateral izquierdo como centro operativo

El lateral izquierdo deja de ser "un panel con un formulario y una lista" y se convierte en el **centro operativo de procesos en segundo plano**: el lugar donde se cargan trabajos y se monitorea su avance en cada etapa real del pipeline.

Estructura de tabs propuesta:

| Tab | Propósito | Qué contiene | Qué NO debe contener |
|---|---|---|---|
| **Dashboard** | Operar el flujo de trabajo diario | Entrada de enlaces (individual/lote/archivo), cola de procesos con estado por fase (pendiente → descargando → extrayendo audio → transcribiendo → extrayendo texto visual → analizando imagen → indexando → listo/error), resumen de progreso, contador de pendientes/errores | Configuración técnica del motor, ajustes de layout del grid |
| **Engine** | Diagnóstico técnico del backend | Estado del modelo ONNX, estado de la BD, parámetros de búsqueda, métricas de rendimiento, panel de debug de pipeline, logs en vivo, comandos de mantenimiento (rebuild/vacuum/recompute/reload) | Enlaces, cola de trabajo, configuración visual |
| **Page** (nueva) | Configurar cómo se ve y organiza la biblioteca | Modo grid/lista, columnas, tamaño de card, densidad, mostrar/ocultar metadata, agrupación por tema/autor/fecha, orden, filtros visuales, modo galería/análisis/revisión | Nada del motor Rust, nada de comandos pesados, nada de cola de procesamiento |
| **Settings** (opcional, o fusionada en Page) | Preferencias generales de la app | Carpeta de descarga, formatos a descargar, idioma | Configuración profunda del motor |

Nota: hoy "Settings" existe como panel deslizante separado (no como tab). La recomendación es evaluar si conviene fusionarlo dentro de "Page" o mantenerlo aparte solo para preferencias de descarga (formatos/carpeta), dejando "Page" exclusivamente para la presentación de la biblioteca.

---

## 8. Nueva pestaña: Configuración de página

Controles propuestos para la pestaña **Page**, separada de Engine (que es técnico) y de Dashboard (que es operativo):

| Control | Prioridad | Depende de backend | Riesgo |
|---|---|---|---|
| Modo grid / lista | Alta | No | Bajo |
| Número de columnas | Alta | No | Bajo |
| Tamaño de tarjetas | Media | No | Bajo |
| Densidad visual | Media | No | Bajo |
| Mostrar/ocultar metadata | Media | No | Bajo |
| Mostrar transcripción corta en card | Media | Sí (requiere transcripción indexada) | Medio |
| Mostrar estado de análisis (badge) | Media | Sí | Medio |
| Agrupar por tema | Baja | Sí (requiere clasificación de temas, no existe hoy) | Alto (depende de feature futura) |
| Agrupar por autor | Media | Sí (dato ya existe en `JobRecord`) | Bajo |
| Agrupar por fecha | Media | No (dato ya existe) | Bajo |
| Ordenar por relevancia | Baja | Sí (requiere score de búsqueda activo) | Medio |
| Ordenar por fecha | Alta | No | Bajo |
| Ocultar videos ya procesados | Baja | No | Bajo |
| Mostrar solo errores | Media | No | Bajo |
| Estilo visual compacto/premium | Baja | No | Bajo |
| Modo biblioteca / análisis / revisión para Julia | Baja | Parcial | Alto (requiere definir qué es "modo revisión Julia") |

Esta pestaña debe operar exclusivamente sobre **presentación**: no debe poder disparar `add_job`, comandos de mantenimiento, ni tocar configuración del modelo o la base de datos.

---

## 9. Brecha entre UI actual y visión real

| Visión requerida | Existe hoy | Estado | Qué falta | Prioridad |
|---|---|---|---|---|
| Carga de links individuales | Sí | Funcional | Validar con video real | Alta |
| Carga de grupos de links | Sí (multi-fila) | Funcional | Validar en lote real | Alta |
| Importación de archivo (.txt/.csv) | Sí | Funcional (UI) | Validar parsing real | Media |
| Visualización offline | Parcial | No verificable | Confirmar reproducción local (`convertFileSrc`) | Media |
| Descarga | Sí (worker Python) | No verificado end-to-end | Prueba controlada (Fase 7) | Alta |
| Transcripción | Sí (worker Python) | No verificado end-to-end | Prueba controlada (Fase 7) | Alta |
| Texto visual / OCR | No | Inexistente | Diseñar e implementar módulo OCR | Alta (visión) |
| Análisis visual (escenas/objetos) | No | Inexistente | Diseñar e integrar modelo de visión | Alta (visión) |
| Metadatos | Sí (título/autor/duración) | Funcional | Ampliar (hashtags, descripción) | Media |
| Ficha inteligente por video | No | Inexistente | Diseñar estructura y persistencia (sección 10) | Alta |
| Búsqueda semántica | Sí | Funcional (vacía) | Datos reales indexados | Alta |
| Chat IA sobre biblioteca | No | Inexistente | Diseñar capa de preguntas/respuestas | Media (roadmap) |
| Agrupación por temas | No | Inexistente | Requiere clasificación de contenido | Media (roadmap) |
| Gustos/intereses | No | Inexistente | Requiere perfil de usuario o histórico | Baja (roadmap) |
| Exportación a Julia | No | Inexistente | Diseñar contrato de exportación (sección 15) | Media |
| Configuración de página | No (parcial en Settings) | Inexistente como tab dedicada | Nueva pestaña "Page" | Alta (UX) |
| Configuración Engine | Sí | Funcional | Ya cubierto | — |

---

## 10. Ficha inteligente del video

Estructura futura propuesta para cada video procesado (no implementada; es diseño):

| Campo | Tipo | Fuente | Uso |
|---|---|---|---|
| `video_id` | int/string | Backend (job id) | Identificador único |
| `url` | string | Input del usuario | Origen |
| `platform` | string | Detección por URL | TikTok / YouTube / otro |
| `author` | string | Metadata (yt-dlp) | Atribución |
| `title` | string | Metadata | Identificación |
| `description` | string | Metadata | Contexto |
| `hashtags` | string[] | Metadata | Clasificación |
| `duration` | int | Metadata | Presentación |
| `upload_date` | string | Metadata | Orden cronológico |
| `local_video_path` | string | Descarga | Reproducción offline |
| `thumbnail` | string | Metadata | Presentación |
| `transcript` | string | Whisper/worker | Búsqueda textual |
| `visual_text` | string[] | OCR (futuro) | Texto en pantalla |
| `scenes` | object[] | Análisis visual (futuro) | Segmentación temporal |
| `objects` | string[] | Análisis visual (futuro) | Búsqueda por contenido visual |
| `actions` | string[] | Análisis visual (futuro) | Comprensión de eventos |
| `summary` | string | IA (futuro) | Resumen consultable |
| `topics` | string[] | Clasificación (futuro) | Agrupación |
| `intent` | string | IA (futuro) | Propósito del contenido |
| `segments` | object[] | Chunking + timestamps | Búsqueda granular |
| `embeddings` | vector[] | ONNX (ya existe) | Búsqueda semántica |
| `audio_visual_alignment` | object | Comparación (futuro) | Detectar coincidencia/discrepancia audio-visual |
| `related_interests` | string[] | Perfil (futuro) | Personalización |
| `related_videos` | id[] | Similaridad vectorial | Descubrimiento |
| `suggested_questions` | string[] | IA (futuro) | Ayuda de exploración |
| `julia_ready` | bool | Pipeline completo | Flag de exportación |

---

## 11. Pipeline ideal

`Link → normalización → job → descarga → audio → transcripción → OCR/texto visual → análisis visual → resumen → temas → embeddings → indexado → biblioteca → preguntas IA → exportación Julia`

| Fase | Existe hoy | Backend | UI | Estado | Riesgo |
|---|---|---|---|---|---|
| Normalización de link | Parcial (regex TikTok en `use-link-processor`) | No | Sí | Parcial | Bajo |
| Job (creación) | Sí | Sí (`add_job`, SQLite) | Sí | Funcional | Bajo |
| Descarga | Sí | Sí (worker Python `downloader.py`) | Sí (cola) | No verificado E2E | Alto |
| Extracción de audio | Sí | Sí (`audio_extractor.py`) | Sí (cola) | No verificado E2E | Alto |
| Transcripción | Sí | Sí (`transcriber.py`) | Sí (cola) | No verificado E2E | Alto |
| OCR / texto visual | No | No | No | Inexistente | — |
| Análisis visual | No | No | No | Inexistente | — |
| Resumen | No | No | No | Inexistente | — |
| Temas | No | No | No | Inexistente | — |
| Embeddings | Sí | Sí (ONNX MiniLM) | Parcial (indirecto) | Funcional | Medio (0 vectores hoy) |
| Indexado (HNSW) | Sí | Sí | No directa | Funcional | Medio |
| Biblioteca | Sí | Sí (`get_jobs`) | Sí (`VideoGrid`) | Funcional (vacía) | Bajo |
| Preguntas IA / chat | No | No | No | Inexistente | — |
| Exportación Julia | No | No | No | Inexistente | — |

---

## 12. Mapa UI ↔ backend

| UI/componente | Hook/función | Comando/API | Canal | Estado |
|---|---|---|---|---|
| `VideoGrid` | `fetchJobs` | `get_jobs` (+ REST `/jobs`) | invoke + fallback | Conectado |
| `VideoGrid` | listeners | `job_progress`, `media_indexed` | eventos Tauri | Conectado |
| `QueueSection` | `fetchTasks` | `/api/v1/jobs` | REST directo | Conectado |
| `app/page.tsx` (buscar) | `handleSearch` | `search_transcripts` | invoke | Conectado |
| `app/page.tsx` (contador) | `fetchInitData` | `get_jobs` (+ REST) | invoke + fallback | Conectado |
| `AddLinks` | `handleFinalProcess` | `add_job` (+ REST `/ingest`) | invoke + fallback | Conectado (pipeline pesado, no probado) |
| `SemanticConfigPanel` | `useSemanticConfig` | `get_model_status`, `get_db_status`, `get_search_config`, `get_system_metrics`, `reload_model`, `update_search_config`, `rebuild_index`, `vacuum_db`, `recompute_embeddings`, `debug_search_transcripts` + `listen('system-log')` | invoke | Conectado |
| `SettingsPanel` | `useSettings` | — | `localStorage` únicamente | No conectado al backend |
| `Header` (ordenar) | estado local | — | — | Solo render, no operativo |

---

## 13. Qué funciona y qué no opera

**Funciona hoy:**
- Arranque completo de la app (frontend + backend Rust).
- Lectura de jobs (biblioteca y cola).
- Panel Engine con estado real del motor.
- Estructura de búsqueda semántica (sin datos indexados aún).

**Funciona parcialmente:**
- Ingesta de enlaces (dispara pipeline real; no verificado end-to-end).
- Modal expandido / reproducción (depende de rutas locales reales).

**Existe visualmente pero no opera:**
- Menú "Ordenar" del header.
- Botón "Cambiar" carpeta en Settings.
- Formatos de descarga en Settings (no llegan al backend).

**Existe en backend pero no tiene UI clara:**
- Comandos de mantenimiento (`rebuild_index`, `vacuum_db`, `recompute_embeddings`) — expuestos en el panel Engine pero sin explicación de riesgo visible al usuario.
- Reranker semántico y cache Redis (feature flags apagados por defecto).

**Falta totalmente:**
- OCR / texto visual.
- Análisis visual (escenas, objetos, acciones).
- Resumen automático y clasificación de temas.
- Chat/preguntas IA sobre la biblioteca.
- Exportación a Julia.
- Pestaña "Page" (configuración de presentación).

**No tocar todavía:** ver sección 14.

---

## 14. Zonas que no se deben tocar todavía

| Zona | Por qué |
|---|---|
| `src-tauri/src/**` | Núcleo del backend; cambios sin plan pueden romper el motor completo |
| `.env` | Contiene configuración/secretos reales |
| `data/` | Datos persistidos (SQLite, índices HNSW); pérdida no reversible sin backup |
| `assets/models/` | Modelo ONNX embebido, pesado y necesario para el arranque |
| `python-workers/` | Pipeline de descarga/transcripción; cambios afectan directamente el procesamiento real |
| Comandos pesados (`rebuild_index`, `vacuum_db`, `recompute_embeddings`, `reload_model`, `update_search_config`) | Acciones de mantenimiento reales sobre datos/modelo; requieren fase y backup dedicados |
| `target-tauri/`, `src-tauri/gen/schemas/capabilities.json` | Artefactos autogenerados por el toolchain; no deben versionarse manualmente |
| Backend Python viejo (`tiktok_transcriber/backend`, FastAPI) | Arquitectura anterior y superada; solo referencia histórica, no debe mezclarse con el backend Rust actual |
| Mocks que sostienen el layout (`lib/mock-data.ts`) | Si se eliminan antes de tener datos reales, el grid colapsa visualmente |

---

## 15. Relación Pulsar ↔ Julia

**Qué procesa Pulsar:** todo lo pesado y multimodal — descarga, transcripción, (futuro) OCR y análisis visual, indexado semántico, resumen y clasificación de temas.

**Qué recibe Julia:** conocimiento ya estructurado y limpio por video (la "ficha inteligente" de la sección 10), no video crudo ni procesos en curso.

**Qué NO debe procesar Julia:** descarga de video, transcripción de audio, ni análisis visual — esa es exactamente la carga que Pulsar existe para absorber.

**Por qué Pulsar le quita carga a Julia:** separa la responsabilidad de "entender contenido audiovisual" (tarea especializada, pesada, con su propio stack de IA) de la responsabilidad de Julia (que puede consumir el resultado ya resuelto).

**Qué datos exportaría:** la ficha estructurada por video, marcada con `julia_ready: true` cuando el pipeline completo terminó.

**Contrato conceptual (no implementado, propuesta de diseño):**

```json
{
  "source": "pulsar",
  "video_id": "",
  "url": "",
  "platform": "tiktok",
  "summary": "",
  "topics": [],
  "transcript": "",
  "visual_text": [],
  "visual_observations": [],
  "segments": [],
  "embeddings": {},
  "related_user_interests": [],
  "julia_ready": true
}
```

---

## 16. Riesgos

| Riesgo | Severidad | Notas |
|---|---|---|
| Sin repositorio git compartido/remoto | Media | Existe git local con commits; falta backup remoto |
| Watcher de Tauri reinicia la app cada ~10 min en dev por el snapshot cron en `data/` | Media | Solo en modo dev; no afecta build empaquetado; requiere fix de config o de ruta |
| Doble canal invoke/REST | Media | Por diseño (fallback), pero puede generar comportamiento inconsistente si no se documenta |
| Comandos de mantenimiento expuestos sin fricción/confirmación en UI | Alta | Riesgo de ejecución accidental de `vacuum_db`/`rebuild_index` |
| Controles decorativos (ordenar, carpeta, formatos) sin función real | Media | Riesgo de que el usuario crea que algo funciona cuando no |
| Pipeline real (descarga→transcripción) no verificado end-to-end | Alta | Bloquea validar el valor real del producto |
| Ausencia de OCR/análisis visual | — | No es un riesgo técnico, es una brecha de producto (roadmap) |

---

## 17. Decisiones pendientes

| Decisión | Opciones | Recomendación | Impacto |
|---|---|---|---|
| Nombre final del producto | "Pulsaria" / "TikTok Processor" / otro | Unificar en "Pulsaria" (ya es la marca visual y de SDK) | Medio (branding, identificadores) |
| Plataforma principal | Solo TikTok / TikTok+YouTube desde ya | TikTok como principal, diseñar el modelo de datos ya pensando en multi-plataforma | Alto (arquitectura de datos) |
| Soporte YouTube | Ahora / después | Después de validar pipeline TikTok end-to-end | Medio |
| Persistencia local de videos | Siempre local / opcional | Siempre local por ahora (offline-first) | Medio |
| Ubicación de la biblioteca | Carpeta fija / configurable | Configurable (ya hay campo en Settings, falta cablear) | Bajo |
| Mecanismo de exportación a Julia | Archivo / API / DB compartida | Definir en fase dedicada (Fase 13 del roadmap) | Alto |
| Chat IA interno | Sí / no, y con qué modelo | Definir en fase dedicada (Fase 11) | Alto |
| OCR local vs. servicio externo | Local (privacidad/costo) / externo (rapidez de desarrollo) | Evaluar en Fase 9 con pruebas comparativas | Alto |
| Análisis visual local vs. API externa | Local / externo | Evaluar en Fase 10 | Alto |
| Qué datos son privados | Todo / parcial | Todo el contenido procesado se trata como privado por defecto | Alto (seguridad) |
| Qué se puede borrar | Video crudo tras procesar / conservar siempre | Definir política de retención (ej. borrar video crudo, conservar ficha) | Medio (almacenamiento) |
| Manejo de lotes grandes | Sin límite / límite por lote | Definir límite razonable (ej. 50-100 por lote) para no saturar el worker pool | Medio |

---

## 18. Roadmap por fases

| Fase | Objetivo | Resultado esperado | Riesgo | Validación |
|---|---|---|---|---|
| **6B** | Validación funcional controlada de comandos seguros | Confirmar que `get_model_status`, `get_db_status`, `get_search_config`, `get_system_metrics`, búsqueda simple y panel Engine responden bien en runtime | Bajo | Manual + logs |
| **7** | Primer video real controlado | Un solo video procesado end-to-end (descarga→transcripción→indexado→búsqueda) con backup previo | Alto (primera prueba real) | Manual, con rollback listo |
| **8** | Ficha inteligente textual | Persistir transcripción + metadata ampliada por video | Medio | Revisión de esquema DB |
| **9** | OCR / texto visual | Extraer texto en pantalla de los videos | Alto (nueva dependencia) | Prueba con muestra pequeña |
| **10** | Análisis visual | Detectar escenas/objetos/acciones | Alto (nueva dependencia, costo de cómputo) | Prueba con muestra pequeña |
| **11** | Búsqueda IA / chat | Preguntas en lenguaje natural sobre la biblioteca | Alto (nueva capa de IA) | Validación de respuestas |
| **12** | Agrupación por temas/gustos | Clasificación automática y agrupación | Medio | Revisión manual de agrupaciones |
| **13** | Exportación / conector Julia | Contrato de datos implementado y probado | Alto (integración externa) | Prueba con Julia real |
| **14** | Pulido UX/UI | Conectar controles decorativos, crear pestaña "Page", revisar estados vacíos/errores | Bajo | Revisión visual + funcional |
| **15** | Build / packaging | `tauri build` productivo, instalador final | Medio | Prueba de instalación limpia |

---

## 19. Próximo prompt recomendado

> **PROMPT 9 — FASE 6B: VALIDACIÓN FUNCIONAL CONTROLADA DE COMANDOS SEGUROS**
>
> Modo: ejecución controlada, solo lectura. No modificar código, `.env`, `data/`, `assets/models/`, `python-workers/`. No ejecutar `add_job` con URL real. No ejecutar comandos pesados (`rebuild_index`, `vacuum_db`, `recompute_embeddings`, `reload_model`, `update_search_config`) salvo lectura de su existencia en UI.
>
> Contexto: commit `9b467ee`; app arranca completa; núcleo UI (biblioteca, cola, búsqueda, panel Engine) conectado al backend real; búsqueda devuelve vacío (0 vectores indexados); documento maestro de producto ya creado en `docs/PULSAR_MASTER_AUDIT_AND_PRODUCT_DIRECTION.md`.
>
> Objetivo: confirmar en runtime, con la app corriendo, que los comandos de solo-lectura responden con la forma esperada y que la UI los renderiza sin romper.
>
> Pasos:
> 1. Arrancar `npm run tauri dev`, abrir la pestaña **Engine**.
> 2. Verificar que `SemanticConfigPanel` muestra datos reales de: estado del modelo (loaded/dimensions/runtime/path), estado de la base de datos (paths/conteos), configuración de búsqueda, métricas de sistema.
> 3. Ejecutar una **búsqueda vacía** y una con **texto simple** desde el Header → confirmar que la UI no rompe, muestra "sin resultados", y usa los campos `video_id`/`matched_text` (fix ya aplicado en Fase 3).
> 4. (Opcional, solo lectura) Probar `debug_search_transcripts` con una query simple desde el panel de debug → confirmar que renderiza tiempos y (0) resultados sin error.
> 5. Documentar qué comando devolvió qué, y cualquier error de contrato detectado en runtime.
> 6. NO ejecutar `add_job` ni ninguna acción de mantenimiento en esta fase.
>
> Entregar: tabla comando → resultado → estado, y veredicto GO/NO-GO para pasar a la Fase 7 (primer video real controlado).

---

*Fin del documento. Este archivo debe mantenerse como referencia viva: actualizarlo tras cada fase relevante en vez de crear documentos paralelos.*
