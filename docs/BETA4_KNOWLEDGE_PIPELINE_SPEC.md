# Pulsaria Beta 4 — Knowledge Pipeline

Fecha de auditoría del código: 2026-10-29. Este archivo reúne seis
especificaciones de producto y el contrato unificado solicitado. Es
planificación basada en el código actual; no autoriza por sí misma cambios de
producto.

Use estas etiquetas para separar lo observado de lo propuesto:

- CURRENT: existe en el árbol inspeccionado; no implica aceptación visual ni
  uso en una instalación limpia.
- GAP: el requisito no queda satisfecho por el código actual, o la evidencia
  disponible no lo demuestra.
- PROPOSAL: contrato recomendado para una fase posterior.
- UNKNOWN: requiere una prueba o decisión antes de prometer comportamiento.

## Resumen del contrato

Perfil → Fuentes → Inventario → QueueService → Procesamiento → Evidencia →
Biblioteca → Editorial → Retención.

Un hallazgo de TikTok crea o actualiza identidad y relación de origen. El
inventario puede existir sin un job. Solo un elemento seleccionado y autorizado
entra a QueueService. El job es el dueño del procesamiento; sus resultados y
artefactos quedan vinculados por job_id. Editorial consume evidencia
persistida. Retención actúa al final sobre medios administrados por Pulsaria,
una vez verificadas las etapas elegidas.

Pulsaria ya tiene piezas en SQLite, Rust, Python y Next.js para la mayoría de
los nodos. No existe todavía una única máquina de estados que cubra todos los
nodos ni un trabajo de conocimiento por lotes que pause, reinicie y reanude
todas sus etapas. La UI y los estados actuales deben mapearse al contrato sin
crear una segunda cola.

## Mapa de código vigente

| Parte | Código actual | Dueño |
|---|---|---|
| Entrada de links y registro | components/AddLinks.tsx, components/TikTokSourcesPanel.tsx, src-tauri/src/commands.rs | Comandos validan y orquestan admisión |
| Descubrimiento | src-tauri/src/application/profile_discovery_service.rs, collection_service.rs, python-workers/source_scanner.py, profile_metadata.py | Servicios guardan canales, resultados y actividad |
| Cola de procesamiento | src-tauri/src/application/queue_service.rs, domain/models.rs, domain/ports.rs | QueueService, JobRepository y JobMessage |
| Worker de medios | src-tauri/src/infrastructure/workers/python_runner.rs, python-workers/main.py y sus módulos | Proceso Python persistente y etapas existentes |
| Biblioteca / media | src-tauri/src/db.rs, src-tauri/src/commands.rs, components/VideoGrid.tsx | SQLite conserva jobs, media, relaciones y resultados |
| Reproducción | components/ExpandedVideoModal.tsx, CinemaPlayback.tsx, TikTokOnlinePlayer.tsx, EvidenceSourceInspector.tsx | Modal local/online e inspector de evidencia |
| Búsqueda | src-tauri/src/application/search_service.rs, db.rs | Índices y unidades derivadas de texto/transcripción/OCR |
| Editorial y citas | src-tauri/src/application/editorial_compiler.rs, editorial_evidence.rs, editorial_provider.rs, magazine_service.rs | Validación, proveedor, versiones y evidencia editorial |
| Conocimiento estructurado | src-tauri/src/application/knowledge_service.rs, domain/ai_task.rs | Recetas, documentos, entidades y ejecuciones de IA persistidas |
| Configuración | components/SettingsPanel.tsx, components/settings/*, lib/settings-context.tsx, commands.rs | Contexto nativo como autoridad en Tauri; espejo local para UI |

## Identidades, relaciones y propiedad

| Entidad | Clave observada | Relación / regla |
|---|---|---|
| Perfil o colección | collection_sources.id | URL y tipo de origen; profile_url, estado, canales vigilados y reglas |
| Canal de perfil | profile_channels.id; unicidad profile_source_id + kind | Posts, reposts, saved y favorites; enabled, estado, contadores, cursor y checkpoints |
| Contenido de plataforma | content_items.id; unicidad platform + platform_content_id | URL canónica, autor, título, fecha, disponibilidad y job_id opcional |
| Relación contenido-origen | content_relationships.id; unicidad profile_source_id + channel_kind + content_id | Permite que un mismo contenido aparezca en varios canales sin duplicar identidad |
| Ledger de descubrimiento | collection_source_items.id; unicidad source_id + canonical_url | Estado por fuente y vínculo opcional a job; conserva duplicados e inventario |
| Trabajo de procesamiento | jobs.id | JobRepository persiste URL, status, progress, retry_count y error. La canonicalización/deduplicación es lógica de aplicación; jobs no tiene constraint UNIQUE por canonical_url en el esquema leído |
| Media | media.id; job_id UNIQUE | Datos principales de medio y source_state; uno por job |
| Artefactos | media_artifacts.id y job_id | Frames y otros archivos generados; la ruta administrada requiere validación antes de abrir/purgar |
| Texto/búsqueda | transcript_segments, search_units y sus embeddings | Vinculados por job_id y, en partes del grafo, content_id o artifact |
| Editorial | magazines, articles, versions, sources, evidence, conflicts y compilations | La evidencia apunta a job/source/artifact y tiempo; versiones y compilaciones quedan persistidas |
| Trabajo IA estructurado | ai_task_executions y registros de receta/documento | Estado, proveedor, entradas/salidas e idempotencia en conocimiento actual |

Regla de propiedad propuesta: collection_sources posee la configuración del
origen; content_items posee identidad del contenido; content_relationships y
collection_source_items poseen membresía e historial de descubrimiento; jobs
posee procesamiento; media_artifacts posee referencias a archivos de salida;
magazine_evidence posee citas. Ninguna pantalla debe inferir un estado de una
entidad que no es su dueño.

## Máquina de estados

### CURRENT

- Origen: active/status y configuración por perfil; canal: enabled/status y
  campos de último intento/éxito, cursor y errores.
- Inventario de origen: collection_source_items usa estados como discovered,
  baseline, queued, duplicate y failed.
- Job: jobs.status persiste queued, estados de procesamiento como downloading,
  processing y transcribing, además de retrying, paused, complete y estados
  finales de error/DLQ. El worker también informa etapas de progreso.
- Editorial: magazine_compilations guarda estados de compilación y reintento;
  AI tasks tiene sus propios registros persistidos.
- Actividad: job_activity_events y collection_source_activity registran
  eventos, aunque no forman una proyección global uniforme.

### GAP

DISCOVERED, SELECTED, AWAITING_AUTH, MEDIA_READY, EXTRACTING_FRAMES,
ANALYZING, KNOWLEDGE_READY, RETENTION_PENDING, UNSUPPORTED y STORAGE_OFFLINE
son términos del roadmap, no una sola máquina de estados implementada. No se
debe presentar una barra única que pretenda medir etapas para las cuales hoy
solo existe un cambio de etapa o una señal parcial.

### PROPOSAL

| Estado del contrato | Entra cuando | Siguiente transición válida |
|---|---|---|
| DISCOVERED | Se persiste el hallazgo y su relación | SELECTED o permanece en inventario |
| SELECTED | Persona elige elemento y etapas | AWAITING_AUTH, QUEUED o UNSUPPORTED |
| AWAITING_AUTH | Falta consentimiento, sesión o permiso de recurso | SELECTED al resolverlo; cancelación no borra inventario |
| QUEUED | QueueService acepta el job idempotentemente | DOWNLOADING o PAUSED |
| DOWNLOADING | Descargador autorizado empieza | MEDIA_READY, ERROR o PAUSED |
| MEDIA_READY | Archivo temporal/local pasa validación | TRANSCRIBING, EXTRACTING_FRAMES o KNOWLEDGE_READY si se omitieron |
| TRANSCRIBING | Audio y modelo admitido están listos | EXTRACTING_FRAMES, ERROR o PAUSED |
| EXTRACTING_FRAMES | Extracción se solicita y se dispone de media | ANALYZING o INDEXING |
| ANALYZING | Hay capacidad de visión real; si no, marcar SKIPPED_NO_MODEL | INDEXING o PAUSED |
| INDEXING | Evidencia persistida se transforma a unidades | KNOWLEDGE_READY o ERROR |
| KNOWLEDGE_READY | Etapas elegidas terminan y hashes/relaciones verifican | RETENTION_PENDING |
| RETENTION_PENDING | Se aplica KEEP, TEMPORARY o ONLINE según elección confirmada | COMPLETE o ERROR |
| COMPLETE | Todas las etapas elegidas están resueltas | permanece en biblioteca e historial |
| PAUSED | Pausa humana, autorización retirada o recovery seguro | Reanudación explícita, con cursor durable |
| ERROR | Fallo recuperable/no recuperable | Reintento explícito o revisión |
| UNSUPPORTED | El proveedor o la capacidad no existe | Solo cambia si una nueva capacidad verificable aparece |
| STORAGE_OFFLINE | El root no es accesible | Resolver ruta y validar antes de continuar |

Invariantes: no se crea job al registrar solamente; una membresía de canal no
duplica el trabajo por contenido; una pausa no borra productos ya validados;
un reintento conserva el presupuesto; ningún medio se purga antes de validar
todos los productos seleccionados; cada etapa omitida explica por qué; COMPLETE
no desaparece de la biblioteca ni del historial.

## Consentimiento, sesión y autoEnqueue

P0-02 establece una decisión de runtime única desde consentimiento legal y
derechos vigentes. El navegador es una preferencia local separada y revocable;
el valor válido es chrome, edge o firefox. El campo histórico source.browser
no es autoridad. autoEnqueue es otra decisión: false significa inventario sin
procesamiento automático. Consentimiento, navegador y autoEnqueue no deben
fusionarse en un único boolean.

Para la UX propuesta, explicar por separado: analizar este elemento, continuar
con una sesión local para categorías que la requieran y permitir procesamiento
automático para un canal. Nunca declarar un canal privado como vacío por una
respuesta de autenticación, tasa limitada o proveedor no compatible.

## Almacenamiento y retención

### CURRENT

- SQLite almacena registro, relación, job, media, segmentos, índices,
  artefactos, conocimiento y editorial.
- Los ajustes actuales incluyen políticas keep y online, intent de storage,
  cuota y reserva de espacio. StatsTab tiene vista previa y selección de
  candidatos, operaciones de papelera y una acción de undo cuando el backend
  devuelve una referencia de purge.
- Existe manejo de source_state, purged_at y errores de ubicación/offline.

### GAP / UNKNOWN

El contrato actual no demuestra que todos los artefactos elegidos (frames,
OCR, transcripción, citas e índices) estén validados antes de una purga en cada
camino. Tampoco garantiza restaurar un archivo eliminado fuera de la ventana
de papelera. La disponibilidad exacta del original online después de purgar
depende del proveedor y no debe prometerse.

### PROPOSAL

Usar tres políticas explícitas: CONSERVAR_VIDEO, TEMPORAL_DESPUÉS_DE_VALIDAR y
SOLO_ONLINE_EVIDENCIA. Antes de aplicar una política destructiva mostrar los
bytes, la lista de resultados que sobrevivirán, refs protegidas y si hay
restauración disponible. La orden de borrado solo acepta rutas dentro del root
administrado, revalida symlink/UNC/unidad, compara hash/tamaño esperado y deja
un tombstone durable. Un error en indexación o verificación cancela la purga.

## UX-01 — Ventana de conocimiento del video

### CURRENT

- VideoGrid abre ExpandedVideoModal como ficha dentro de la aplicación.
- El modal ya ofrece reproducción, transcripción, karaoke, Intel y Tools; hay
  acciones para saltar a tiempos cuando el medio local lo permite.
- TikTokOnlinePlayer usa el reproductor oficial embebido y proporciona error,
  reintento y salida hacia TikTok cuando no puede reproducir.
- CinemaPlayback es una experiencia de reproducción de varios videos; no es un
  segundo editor de conocimiento.
- EvidenceSourceInspector puede abrir un video local y llevarlo a un
  timestamp; no demuestra que todos los tipos de evidencia estén unificados
  dentro del modal.
- El modal usa roles, pestañas y manejo de teclado/foco en los caminos
  inspeccionados. La revisión visual y lectores de pantalla en Windows siguen
  UNKNOWN.

### Decisión de diseño

PROPOSAL: conservar un solo modal para el primer corte. Está integrado con la
biblioteca y mantiene el contexto de navegación; una ventana nativa Tauri por
clic añade sincronización de estado, foco entre ventanas, DPI/monitor y gestión
de ciclo de vida que hoy no aporta un beneficio demostrado. Si el uso real
requiere comparar varias fichas, probar luego una sola ventana reutilizable,
con métricas de apertura, memoria y cambio de monitor.

### Wireflow y criterios

Ficha → fuente y disponibilidad → reproductor local/online → pestañas de
transcripción / momentos / análisis / notas y evidencias / extracción →
acción editorial explícita.

Cada estado expone título, origen, autor/fecha si existen, disponibilidad,
fuente online/local, errores y acciones compatibles. Tab y flechas recorren
pestañas; Escape cierra y devuelve foco al video seleccionado; transcript
click hace seek local y anuncia que no se garantiza seek dentro del embed.
Reduced motion y textos es-MX/en-US se conservan.

Pruebas propuestas: local listo/online disponible/embed bloqueado/storage
offline; transcripción ausente y vacía; timestamp dentro/fuera de duración;
teclado y foco devuelto; lector de pantalla; 860x640, 1280x800 y DPI 200%;
reduced-motion; cambio entre videos sin duplicar listeners; error al cargar
evidencia con reintento; apertura y cierre repetidos sin fuga de media.

## AI-02 — Revistas y catálogos inteligentes

### CURRENT

- editorial_compiler prepara compilaciones de uno o múltiples jobs, llama a un
  proveedor, valida procedencia y decide si una salida es publicable o requiere
  revisión.
- editorial_evidence exige evidencia disponible y liga fuentes, timestamps,
  frames/OCR cuando se citan; compiler detecta conflictos numéricos y conserva
  versiones.
- EditorialProvider contempla proveedores mock y Gemini. Las pruebas mock
  validan estructura y procedencia, no la calidad de un modelo.
- magazine_compilations y AI task executions conservan registros. knowledge_service
  guarda recetas, documentos, entidades y ejecuciones.
- Hay modelos locales para tareas locales y preparación de LLM; los comandos
  editoriales actuales también exponen caminos Gemini. No se demuestra aún un
  planificador local que mantenga cualquier compilación en pausa/reinicio.

### GAP / PROPOSAL

Flujo propuesto: elegir videos ya procesados → mostrar preflight de evidencia
disponible y faltante → escoger tipo de catálogo → mostrar costo remoto solo
cuando se pueda calcular y rango local solo con mediciones comparables →
ejecutar tarea durable sobre evidencia → validar claims/citas → presentar
borrador con conflicto/ausencia → edición humana y publicación explícita.

Cada ingrediente, cantidad, paso, tiempo, temperatura, afirmación o rasgo debe
llevar una cita al job, segmento, timestamp y frame/texto que lo sustenta. Si
dos fuentes discrepan, conservar ambos valores y marcar revisión; no promediar
ni inventar. Si evidencia no está disponible, el campo queda sin especificar.
Gemini requiere una acción por tarea; no debe recibir contenido por un
disparador implícito.

Persistencia objetivo: task_id, input_snapshot_hash, estado, etapa, progreso
real, modelo/proveedor/version, retry_count, cancel_requested, error_code,
evidence_refs y output_version. La pausa detiene admisión de siguiente unidad
de trabajo; cancelación preserva el borrador y la evidencia. Reanudar es
idempotente con el mismo snapshot.

Pruebas: cero evidencia, evidencia parcial, cita fuera de duración, frame
inexistente, conflicto de unidades, número inventado, proveedor caído,
cancelación/restart, tarea duplicada, mismo input sin versión nueva, nueva
fuente cambia versión, contenido purgado con evidencia que permanece y permiso
explícito para proveedor remoto.

## SYNC-03 — Seguimiento granular TikTok

### CURRENT

- collection_sources y profile_channels separan perfil y canal.
- El scanner admite posts, reposts, saved y likes/favorites, con disponibilidad
  desigual. La capa de UI conserva estados como requires_session y rate_limited.
- content_items usa identidad de plataforma; content_relationships permite
  varias categorías por elemento; collection_source_items registra estado de
  descubrimiento por fuente.
- autoEnqueue desactivado deja items discovered sin jobs. El opt-in de canal y
  la selección browser existen en el modelo actual.
- Un enlace público identifica un perfil público; no concede acceso a likes o
  saved privados. Una lista TikTok no equivale a una playlist local.

### P1-03 estabilización técnica — estado local 2026-10-29

La revisión inicial confirmó dos defectos: newest_known_content_id no avanzaba
después del primer checkpoint y ordenar fechas presentes junto a fechas nulas
podía producir un comparador no transitivo. El cambio focal de
`92367ca7b8dd7df23c9ce1813ccc16e8a17a2395` ordenaba por fecha solo si todas las
filas tenían fecha/timestamp; el commit de seguimiento
`0c1fd6225b998486bf5021fd80ecb7f489b8f268` además evita avanzar newest u oldest
cuando el orden no es demostrable. Con un orden completo, newest sale de la
primera identidad persistida; oldest solo avanza en un lote completo, sin filtro
de fecha ni errores. Los lotes limitados/filtrados conservan el extremo previo.
Un fallo de persistencia conserva last_success y el error existente.

Los resultados vacíos de likes, saved y reposts, o de perfiles cuya visibilidad
no está confirmada, quedan como unknown en lugar de afirmar cero o disponibilidad.
Un posts vacío solo es cero si el perfil es público y el metadato del proveedor
confirma posts_count = 0; si falta ese dato o contradice la respuesta, queda
unknown. Errores explícitos del proveedor se distinguen de auth requerida y
errores genéricos; 429/captcha muestran rate_limited. La admisión de cada item
vuelve a comprobar el toggle del canal; al desactivarlo no crea nuevos items ni
jobs y preserva trabajos ya en cola. Fallos de sincronización aplican backoff
acotado y la UI puede mostrar el próximo reintento.

Verificación local del árbol de `0c1fd6225b998486bf5021fd80ecb7f489b8f268`:
`npm run verify:mvp` pasó 13/13; Rust 304 PASS, 7 ignoradas y 2 filtradas;
Python 39 PASS y 1 prueba TikTok live omitida; typecheck, `cargo fmt --check`,
tests TS/Python focales y manifiesto runtime 54/54 PASS. La CI del SHA exacto
también pasó: canonical `40854106231` y runtime preflight `40854106226`. Gate
P1-03 queda verificado con esta evidencia. Estos resultados no constituyen
aceptación funcional de una instalación ni de una sesión TikTok real; no se
consultaron perfiles personales.

SYNC-03 sigue siendo una especificación, no implementación editorial. La matriz
de casos P1-03 y las capacidades reales por proveedor deben mantenerse
distinguidas de aceptación funcional con cuentas autorizadas.

### Wireflow y contrato

Agregar perfil sin ejecutar descarga → revisar identidad → elegir cada canal y
su disponibilidad → modo inventario o procesamiento → elegir límite/fecha →
revisar resumen parcial → ver items por canal → activar, pausar o sincronizar
ahora → elegir trabajos para la cola.

Disponibilidad: public, requires_session, private, unsupported, rate_limited,
error o unknown. Desconocido nunca es cero. Cada canal tiene enabled,
last_attempt, last_success, checkpoint newest/oldest, count conocido y error.
Si un contenido aparece por tres canales, hay una identidad de contenido y
tres relaciones. Desactivar un canal detiene nuevos scans/encolados y preserva
relaciones históricas y jobs manuales.

Pruebas propuestas: público, sin sesión, auth required, unsupported, 429/backoff,
orden cronológico incompleto, fecha nula, nuevos IDs, duplicado entre canales,
toggle mientras escanea, dos scans simultáneos, reinicio en medio de página,
20/50/100/todo y fecha inicial, playlist detectada solo con respuesta válida,
autoEnqueue false, cambio/revocación de navegador.

## QUEUE-04 — Inventario y cola única

### CURRENT

- QueueService es la única cola de jobs. Usa SQLite, retry budget, admission
  gates, cooldown/backpressure, workers y job_activity_events.
- Descubrimientos sin job pueden estar en content_items y en el ledger
  collection_source_items; el foreground queue se conserva en jobs.
- QueueSection presenta tareas en progreso, errores y reintentos. El cambio
  P0-02 añade una vista de jobs paused con acción individual de reanudación.
- El inventario de todas las fuentes no está representado como una sola vista
  que siempre incluya cada item descubierto.
- Los estados contractuales del roadmap superan las etapas persistidas actuales.

### Wireflow y experiencia

Inventario con filtros de perfil/canal/estado y selección explícita → detalle
del item → seleccionar etapas y retención → verificar permiso → añadir a la
cola única → actividad con etapa real/error → resumen histórico al terminar.
Descubierto no significa descargado. 200 hallazgos, cero seleccionados produce
200 fichas y cero jobs; seleccionar 20 genera como máximo 20 admisiones
idempotentes.

No mostrar tiempo restante sin telemetría suficiente; usar etapa y mensaje
concreto. Errores posteriores conservan resultados verificados anteriores.
Storage offline es reparable y no equivale a archivo perdido. Completar una
tarea la saca de activos, no de biblioteca/historial. Acciones masivas requieren
selección visible y recuento.

Pruebas: 200/0, 200/20, tres canales duplicados, reinicio, pausa en descarga,
429, fallo FFmpeg, transcript vacío, modelo visual ausente, storage offline,
reintento sin duplicación, jobs queued históricos, teclado/filtros y
reconciliación de eventos con SQLite.

## MEDIA-05 — Streaming y conocimiento sin MP4 permanente

### CURRENT y límites

- TikTokOnlinePlayer carga un embed oficial. Embed reproducible no significa
  que exista una URL de media con HTTP Range o seek progresivo. La app no
  demuestra hoy streaming parcial del archivo que está descargando.
- Para reproducción local, el frontend necesita un recurso local accesible y
  validado. El estado online/local se expone por separado de job.status.
- python-workers incluye downloader, transcripción, extracción de frames,
  análisis visual, OCR opcional, output generation y QueueService.
- visual_analyzer genera keyframes, estadísticas de imagen/cambio de escena y
  OCR cuando existe Tesseract. Eso no equivale a reconocimiento semántico de
  objetos o alimentos; no se encontró evidencia de que un modelo de visión
  semántica esté instalado y certificado para esta capacidad.
- Settings permite keep y online. No prometer que eliminar el MP4 preserva
  siempre reproducción remota o que la eliminación sea reversible.

### Pipeline propuesto

Inventario → reproducción oficial si el proveedor la permite → selección
explícita → batch_id y elementos seleccionados → descarga temporal autorizada o
media local → audio → transcript y tiempos → frames y OCR → análisis semántico
solo si una capacidad real lo declara → claims estructurados con procedencia →
embeddings/search units → validación durable de rutas, relaciones y hash →
retención elegida.

Cada etapa escribe progreso y checkpoint durable antes de anunciarse como
terminada. El batch guarda identidad, límite, concurrencia, cuota, reserva de
disco, cooldown, estado, resultados por elemento y cancelación. QueueService
mantiene el control de cada job; batch_id agrupa y reporta, no crea una segunda
cola. Si falla OCR/índice/cita, se conserva el archivo requerido para reintentar.
La categoría SKIPPED_NO_MODEL es visible y evita inventar análisis visual. La
revista futura consume evidencia guardada; no redescarga por defecto.

### Retención segura

Solo archivos administrados por Pulsaria dentro del root validado son
elegibles. No tocar originales del usuario, base SQLite, modelos, ni
instalaciones. Excluir favoritos, pinned/protected, exportación en curso y
fuentes de compilación activas. Preview informa bytes, refs conservadas,
restauración disponible y límite de undo. Hash/size y estado de persistencia se
validan antes y después. Si la purga no puede garantizarse segura, retener.

### Viabilidad de streaming por verificar

Hacer una investigación y prueba aislada separadas para HTTP Range, expiración
de URL, restricciones de origen, seek y bloqueo geográfico del proveedor. No
extraer endpoint privado ni usar sesión personal. El criterio de producto solo
puede decir “reproductor oficial online cuando esté disponible”; streaming
progresivo del archivo requiere evidencia específica y revisión de términos.

Pruebas: embed disponible/bloqueado, local antes/después de ready, cuota con
lote de 50, audio sin voz, no model, timestamps y frames, fallo de índice no
purga, crash previo a purga, protegido favorito, path externo/UNC/symlink,
hash, ficha y cita después de purga, reintento/restart idempotente, CPU-only y
contenido no autorizado.

## SETTINGS-06 — Inventario control por control

Clasificación estática de wiring, no certificación de una build instalada.
Los ajustes nativos llegan a save_app_settings y a app-settings.json; en Tauri
SettingsContext lee el snapshot de Rust y sincroniza el espejo de UI. Algunos
efectos usan comandos adicionales. No se ejecutó la matriz de fallo de disco,
DPI ni restart con una instalación limpia; los efectos marcados UNKNOWN deben
probarse antes de mover controles.

| Control / familia | Estado y persistencia observados | Efecto / límite |
|---|---|---|
| Idioma y tema | CURRENT; i18n y contexto frontend, ajustes nativos espejo donde aplica | Reinicio completo y primera carga: UNKNOWN |
| Carpeta de descargas | CURRENT; settings snapshot y worker config | Cambiar raíz con medio offline requiere reparar/verificar ruta |
| Formatos MP4/MP3/TXT | CURRENT; ajustes, worker config y entorno | Qué formatos consumen cada worker depende del pipeline |
| Modo de retención keep/online | CURRENT; ajustes y worker config | No garantiza por sí solo purga posterior segura |
| Navegador cookies | CURRENT; settings nativos y env de proceso | P0-02 hace que la selección global válida sea autoridad; requiere prueba de revocación instalada |
| Fit del video | CURRENT; settings snapshot | Solo afecta presentación; no procesa medio |
| Visibilidad de chip TikTok / reproducción al hover / videos demo | CURRENT; estado de SettingsPanel | Efecto visual, sin verificación de accesibilidad instalada |
| Bandeja al cerrar | CURRENT; ajuste nativo y wiring de ventana | Verificar cierre frente a salir de la aplicación |
| Subtítulos y estilo | CURRENT; ajuste nativo y reproductor | Compatibilidad de estilo por modo de reproducción requiere QA visual |
| Similarity threshold | CURRENT; control React y configuración de SearchService | Probar lectura, rango y reindexado; UI wiring inspeccionado |
| Calidad de procesamiento | CURRENT; estado UI y settings enviados al worker | Preparación del modelo y efecto real dependen del worker/modelo local |
| Preparación/cancelación de modelo | CURRENT; hook y eventos locales | No confundir descarga con modelo disponible/cargado |
| Diagnóstico/repair de biblioteca | CURRENT; comando repair_library | Confirmar que reporta los errores en UI y no oculta fallos |
| Lista de fuentes: pause/resume/sync/delete | CURRENT; comandos de colección | El estado de sesión no se debe derivar del estado activo del canal |
| Updater | CURRENT; flujo de confirmación visible | Seguridad de versión/entorno queda fuera de esta especificación |
| LLM local: estado/preparar/cancelar | CURRENT; getLocalLlmStatus, ensureLocalLlm, cancelación y evento | Persistencia y recuperación de setup tras crash: UNKNOWN |
| Gemini API key: set/remove/status | CURRENT; AI tab y comandos | Verificar no filtración en logs/UI; no se inspeccionó un secreto real |
| Umbral y tamaño mínimo de clustering | CURRENT; estado React | Rango válido, restart y concurrencia requieren prueba |
| Generar/reemplazar playlists | CURRENT; acciones de clustering | Reemplazo debe confirmar alcance antes de mutar playlist |
| Política de rendimiento | CURRENT; save de settings más set_performance_policy | Hay varios comandos de guardado; rollback atómico entre comandos: UNKNOWN |
| Procesamiento en background / iniciar en background | CURRENT; settings y autostart | No asumir equivalencia entre autostart de sistema y arranque oculto |
| Idle timeout / AC-only / adaptador | CURRENT; PerformanceTab y snapshot de hardware | Requiere validación de dispositivo real y preferencias inaccesibles |
| Profundidad de análisis | CURRENT; configuración persistida | Mapeo a etapas efectivas debe medirse |
| Benchmark/reset de aceleradores | CURRENT; comandos de diagnóstico | Lo medido se persiste; no probar aceleración solo por etiqueta GPU |
| Métricas de rendimiento | CURRENT; endpoint/comandos de metrics | Mostrar solo datos disponibles y ventanas de medición documentadas |
| Intent, cuota y reserva de storage | CURRENT; snapshot y admission gate | Revisar cambios de carpeta, espacio libre y límites concurrentes |
| Preview/select/apply/undo de purge | CURRENT; StatsTab y comandos | Undo depende de que backend conserve el medio en papelera |
| Papelera y vaciado | CURRENT; diálogo de confirmación | Acción destructiva debe mostrar claramente irreversibilidad |
| Diagnósticos y health events | CURRENT; consultas y acciones del panel | Logs saneados y relación a job: UNKNOWN |

### Organización incremental propuesta

Mantener las cinco tabs durante una primera etapa; añadir encabezados de
subsección y resumen de estado. Después evaluar una agrupación de navegación:
General, Privacidad y fuentes, Procesamiento, IA/editorial, Cola y rendimiento,
Almacenamiento y diagnóstico. Cada cambio debe tener pruebas de persistencia,
error visible, revertir estado UI si un guardado falla, teclado/lector de
pantalla y es-MX/en-US. No mover controles sin observar confusión o fallos.

## Selección de modelo y capacidad real

CURRENT: Whisper y modelos locales tienen preparación, estado y configuración;
aceleradores usan probes antes de seleccionarse. El visual analyzer cubre
extracción/OCR, no semántica visual comprobada.

PROPOSAL: una ficha de capacidad tiene modalidad, provider local/remoto,
model_id/version/hash, dispositivo probado, memoria disponible, cuantización,
licencia, warmup/health, latencia observada y límite de lote. Una etapa solo se
ofrece como disponible si su probe real pasa. CPU fallback puede degradar
capacidad, no fingir semántica. Tiempo estimado se muestra únicamente como
rango medido para la misma etapa/modelo/dispositivo y tamaño comparable.

## Operaciones, reinicio y métricas

Reutilizar QueueService para jobs de medios y la persistencia ya existente de
compilaciones/AI tasks para editorial. No crear scheduler o cola paralelos.
Cada mutación de etapa se hace idempotente usando job/task id, etapa, versión
de entrada y hash. Retry solo desde estado reparable y conserva retry_count.
Pausa detiene siguientes etapas y guarda el último checkpoint validado;
cancelación declara qué salida parcial queda. Al arrancar, reconciliar DB con
archivos administrados, no limpiar evidencia completa ni auto-reanudar jobs
queued históricos.

Métricas observables actuales incluyen estado/progreso de job, actividad,
profundidad, backpressure, utilización de workers, tiempos de búsqueda/DB y
estado de aceleradores. Métricas propuestas: duración por etapa, bytes de
lectura/escritura, frames por video, razón de cache/rehuso, retries, errores
429, uso pico de RAM/VRAM y cancelación. Etiquetar proveedor, modelo y
dispositivo; no medir contenido personal en telemetría remota.

## Criterios de integración y despliegue

1. Fixtures deterministas para cada transición y cada estado de disponibilidad.
2. Pruebas negativas de consentimiento, URL, sesión, path, symlink, no-model,
   espacio insuficiente, corrupción parcial y proveedor caído.
3. SQLite fixtures efímeros; asegurar FKs, dedup y continuidad tras restart.
4. Pruebas de contrato entre Tauri y REST contra QueueService, sin acceso de red
   externa.
5. UI: estados vacíos, error/retry, foco, reduced motion y traducciones.
6. Por etapa del producto: 1 fixture, 1 video autorizado, 10, 50 y prueba
   aislada de Windows; no usar perfiles ni bibliotecas personales para gates.
7. Ningún instalador Beta 4 o aceptación de release se deriva solo de CI.

Orden de trabajo posterior:

1. P0-02 está cerrado en `6bc9f53fa768fc2cb32aeeb1b4942d4e989a1c7b` con CI
   canonical y runtime preflight PASS.
2. P1-03 está cerrado con el SHA `0c1fd6225b998486bf5021fd80ecb7f489b8f268`,
   CI canonical y runtime preflight PASS; SYNC-03 sigue como diseño, no código.
3. P1-04 ya tiene hardening focal en `355231fc91ff64fc4ac789a279cb02d76dbd1dda`,
   verificación local `verify:mvp` 13/13 y smoke NSIS instalado aislado PASS
   (run 40996169549). `PROJECT_TRUTH.md` y `docs/BETA4_P1_04_EVIDENCE.md` se
   actualizaron en `c96a0f0e629d2ce51ef58cd34e4c7e88ae3f16ec` con CI canonical
   PASS (run 40999432730). El gate permanece PARTIAL/DOING hasta completar
   aceptación humana, matriz funcional restante y aceptación integral en
   Windows limpio; el runtime run 40999432353 es docs-only y omitió smoke.
4. El siguiente trabajo técnico es completar esos criterios pendientes de
   P1-04. Después de la aprobación correspondiente, priorizar micro-gates de
   MEDIA-05: inventario, persistencia de evidencia y retención segura; lote y
   streaming progresivo siguen sujetos a pruebas de viabilidad independientes.
5. Las seis secciones de este documento son especificaciones de producto, no
   implementación ni autorización de construir features. AI-02 consume
   evidencia estable; UX-01, SYNC-03, QUEUE-04, MEDIA-05 y SETTINGS-06 avanzan
   mediante gates aprobados y resultados medidos.

## Decisiones abiertas

- ¿La selección de sesión debe seguir global o volverse explícita por perfil y
  canal, manteniendo opt-in y revocación sencilla?
- ¿Qué categorías del proveedor puede consultar una sesión real en cada
  región/tipo de cuenta, sin usar perfiles personales para aceptación?
- ¿Qué formato de checkpoint es estable cuando ID y fecha están ausentes o el
  orden de página no es confiable?
- ¿El producto exige recuperación de MP4 tras purge o basta con preview y
  papelera temporal? No prometer undo si no hay bytes disponibles.
- ¿Qué combinación de modelo local y hardware recibe soporte funcional para
  extracción semántica visual? Hasta entonces, la capacidad no está disponible.
- ¿Qué política legal permite almacenamiento de transcripciones, frames y
  embeddings tras eliminar el medio fuente?

Estas decisiones requieren aprobación de producto/seguridad antes de
implementar comportamiento irreversible o de prometer capacidades de modelo.

## Riesgos, costos y rollback

| Riesgo / costo | Tratamiento propuesto |
|---|---|
| Sesión local expone más categorías y contenido privado | Opt-in separado por fuente/canal, revocación inmediata, estados requires_session/unknown y fixtures sintéticos |
| Cambios de proveedor rompen orden o paginación | Checkpoint versionado; no avanzar cursor con orden incompleto; conservar relaciones anteriores |
| Lotes llenan disco o saturan CPU | Cuota y reserva antes de admitir; límite de concurrencia; backpressure de QueueService; duraciones solo si medidas |
| OCR/transcripción y frames crecen la biblioteca | Presupuesto por elemento, hashes, política de retención y preview de bytes |
| LLM remoto cuesta dinero o transfiere contenido | Acción explícita por tarea, resumen de payload y costo solo si calculable; local como opción sin fingir capacidades |
| Purga elimina evidencia necesaria o no puede deshacerse | Hacer retention-eligible solo tras verificación; pruebas crash/restart; conservar por defecto si falla una validación |
| Migración mezcla inventario y jobs | Analizar el esquema actual antes de migrar; migraciones aditivas, idempotentes y con fixture upgrade/rollback |

Rollback de una implementación futura: activar primero detrás de un opt-in
conservador; mantener el flujo modal y QueueService existente; si falla una
proyección, volver a la vista anterior sin borrar tablas ni archivos; revertir
solo el commit focal con un nuevo commit, sin reset ni force-push. Una migración
no destructiva preserva los datos previos y expone una reconciliación antes de
retirar columnas o estados antiguos. La política de retención vuelve a
CONSERVAR_VIDEO hasta demostrar la recuperación. Esto es un plan, no una
implementación vigente.
