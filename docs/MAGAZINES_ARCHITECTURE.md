# Revistas / Tomos Inteligentes — Arquitectura (Fases 1 + 2)

> Estado: **motor editorial funcional** (evidencia → proveedor → validación →
> detección de conflictos → SQLite). Gemini es el proveedor real y es
> intercambiable; los tests corren 100% offline con proveedor mock.
> Fuente normativa del proyecto: `PROJECT_TRUTH.md`.

## 1. Propósito

Convertir la biblioteca multimodal de Pulsaria (videos indexados con
transcripción, keyframes, OCR y metadata) en publicaciones editoriales
estructuradas, trazables y actualizables:

```text
LIBRERO → TOMO → CAPÍTULOS → ARTÍCULOS → CONTENIDO → FUENTES → EVIDENCIA → VIDEO + TIMESTAMP
```

Pulsaria controla datos, persistencia, estados, fuentes, evidencia,
versiones, conflictos, trazabilidad y rollback. El futuro motor editorial
(Gemini u offline) será un **productor validado**, nunca escritor directo.

## 2. Entidades y relaciones (SQLite)

Todas las tablas se crean con `CREATE TABLE IF NOT EXISTS` dentro de la
transacción de `init_db_core` (`src-tauri/src/db.rs`), **después** de `jobs`
y `content_items`, por lo que los FK siempre resuelven. Sembrado canónico:
4 tomos (recetas, tech, guías, lifestyle) solo si `magazine_volumes` está
vacía. Sin bump de `SCHEMA_VERSION`: la migración es idempotente y no
fuerza backup en instalaciones existentes.

```text
magazine_volumes (id TEXT PK)
 ├── magazine_chapters (id INTEGER PK, volume_id FK CASCADE, ordinal)
 │    └── magazine_articles.chapter_id (SET NULL)
 ├── magazine_articles (id TEXT PK, volume_id FK CASCADE, active_version)
 │    ├── magazine_article_versions (UNIQUE(article_id, version_number), inmutable)
 │    ├── magazine_sources (UNIQUE(article_id, job_id), job_id FK jobs CASCADE,
 │    │                      content_id FK content_items SET NULL)
 │    ├── magazine_evidence (article_id/source_id/job_id FK CASCADE,
 │    │                       timestamp_start/end, keyframe_path,
 │    │                       transcript_text, extracted_fact, confidence)
 │    └── magazine_conflicts (evidence_a_id/evidence_b_id FK CASCADE,
 │                             resolution_state, resolution_notes, resolved_at)
 └── magazine_compilations (volume_id FK CASCADE, status, progress,
                             started_at/finished_at)
```

### Trazabilidad

```text
Article → magazine_evidence → magazine_sources → jobs(id, url, canonical_url)
   → transcript_segments(job_id, start_time, end_time, text)   [timestamp/transcript]
   → media_artifacts(job_id, kind='keyframe', path, timestamp) [keyframe]
   → content_annotations(job_id, …)                            [ocr/metadata, futuro]
   → content_items(job_id)                                     [vínculo colección]
```

Toda evidencia exige `job_id` declarado en `sources` (validación de
contrato + guardado en inserción): un `source_id = 0` nunca llega a SQLite.

### Versionado

`add_article_version` inserta una fila nueva e incrementa `active_version`
en la misma transacción. El historial nunca se sobrescribe; el rollback es
`UPDATE magazine_articles … SET active_version = N` + relectura (operación
manual futura, no automatizada en esta fase).

### Conflictos

Dos evidencias que discrepan (ej. `200 g` vs `250 g`) se registran como
`magazine_conflicts(fact_key, evidence_a_id, evidence_b_id, unresolved)`.
No se promedia ni se inventa un valor: la resolución es explícita
(`resolved_a | resolved_b | reconciled | ignored` + notas + timestamp).

## 3. Máquina de estados

`EditorialState` (`src-tauri/src/domain/editorial.rs`): misma máquina para
tomos y artículos.

```text
draft → processing → published ⇄ updating → published
              ↓           ↓           ↓
           failed   requires_review  archived
              ↓           ↓               ↕ (reapertura manual)
           draft ←────────┴──→ draft/archived
```

Transiciones ilegales (p. ej. `published → draft`, `archived → published`)
se rechazan en `update_magazine_article_state` / `update_magazine_volume_state`.
`CompilationTaskState` (`queued → processing → completed | failed |
cancelled | requires_review`): los estados terminales solo vuelven a
`queued` (reintento explícito). Progreso clamped a `0–100`; `started_at` /
`finished_at` se gestionan en SQL.

## 4. Contrato editorial JSON (schema_version = "1.0")

Canónico en Rust: `EditorialArticlePayload`
(`src-tauri/src/domain/editorial.rs`); espejo de lectura en TS:
`lib/magazines.ts`. Flujo futuro:

```text
Video → análisis Pulsaria existente → Evidence Package → Gemini
   → Editorial JSON → validate_editorial_contract → Conflict Detection
   → Editorial Store (transacción atómica) → Magazine Reader
```

Reglas de validación: versión exacta `"1.0"`, título/resumen no vacíos,
confianzas en `[0, 1]`, rangos `start ≤ end`, índices de conflicto dentro
de `evidence`, y **cada evidencia con fuente declarada**. `create_article_from_contract`
verifica además volumen existente y capítulo perteneciente al volumen, y
persiste artículo + versión 1 + fuentes + evidencias + conflictos en una
sola transacción (estado inicial `published`, o `requires_review` si hay
conflictos).

Tipos de artículo soportados: `recipe | tutorial | guide | technical |
review | reference | comparison | collection | insight`. `content` es JSON
libre por tipo (no se fuerza un esquema único).

## 5. IPC Tauri (19 comandos `get_*`/`create_*`/`update_*`/`resolve_*`/`validate_*`/`compile_*`/`retry_*`)

Volúmenes, capítulos, artículos, detalles, versiones, estados, conflictos
y compilaciones. El frontend usa `invoke` con guard `isNativeShell()`
(igual que `VideoGrid`); fuera del shell nativo hay vista previa marcada,
sin datos inventados. Sin rutas REST nuevas en esta fase (el gateway Axum
sigue limitado a jobs/playlists/búsqueda).

## 6. Librero (`/magazines` → sección `magazines`)

`components/MagazinesBookshelf.tsx` + `lib/magazines.ts`: búsqueda por
texto libre, conteos reales (`article_count`, `source_count`), insignias de
estado editorial honestas, modal por tomo con sus artículos (o vacío
explícito), skeletons y estado de error. Sin afirmaciones de IA activa:
el banner declara "Generación IA pendiente". Lenguaje visual existente
(3D sobrio, oscuro, mismos tokens); `globals.css` ya contenía el workspace
`--magazines`.

## 7. Reutilizado / añadido / no tocado

**Reutilizado:** tabla `jobs` (+ `canonical_url`/dedupe), `content_items`,
`transcript_segments`, `media_artifacts`, `QueueService` como referencia de
patrón (no instanciado), `db::init_db_core` + migraciones idempotentes,
patrón IPC `invoke` + `isNativeShell`, `icon-library`, workspace CSS,
gates `verify:*`.

**Añadido (Fase 1):** `domain/editorial.rs`, `application/magazine_service.rs`
(capítulos, estados, compilaciones, guardas FK), 8→16 comandos IPC,
`tablas magazine_*`, `lib/magazines.ts`, librero conectado a IPC,
6 pruebas Rust nuevas.

**Añadido (Fase 2):** `application/editorial_evidence.rs`,
`application/editorial_provider.rs`, `application/editorial_compiler.rs`,
columnas de fuente en `magazine_compilations`, 16→19 comandos IPC,
compilación/reintento en el Librero con estados reales, ~25 pruebas Rust
nuevas (todas offline con proveedor mock).

**No tocado:** pipeline Python/Whisper/yt-dlp/ffmpeg, ONNX/HNSW/BM25,
`QueueService`, `collection_service`, gateway REST, autenticación API,
i18n, manifiestos de release, `PROJECT.manifest.json` (pendiente registrar
el dominio `editorial` cuando abra la fase 2).

## 8. Decisiones congeladas

1. `magazine_compilations` es cola **separada** de `jobs` (ciclos de vida
   distintos: ingestión vs compilación editorial). La integración con
   `QueueService` queda como punto documentado, no ejecutado.
2. Sin bump de `SCHEMA_VERSION` (migración idempotente, sin backup forzado).
3. `content` del contrato es JSON libre por `article_type`.
4. IDs de artículo `art-{volume}-{epoch_ms}` (colisión improbable en fase
   manual; reevaluar con motor concurrente).
5. Sin realtime, sin reader definitivo, sin export/PDF, sin imágenes.

## 9. Pendiente (fase siguiente, NO esta)

Reader con salto a timestamp del video, resolución de conflictos en UI
(lectura por IPC ya existe: `resolve_magazine_conflict`), reintento de
compilaciones desde UI (IPC ya existe: `retry_magazine_compilation`),
compilación multi-fuente, enrutado automático a tomos
(`NewVolumeCandidate`), registro del dominio en `PROJECT.manifest.json`, y
aceptación live.

---

# FASE 2 — Motor editorial

## 10. Pipeline

```text
Source
 ↓
Evidence Package        (application/editorial_evidence.rs — solo lectura)
 ↓
Editorial Compiler      (application/editorial_compiler.rs — orquesta)
 ↓
AI Provider             (application/editorial_provider.rs — Mock | Gemini)
 ↓
Validation              (contrato Fase 1 + provenance del compilador)
 ↓
Conflict Detection      (sugeridos por el proveedor + autodetección numérica)
 ↓
Magazine Service         (create_article_from_contract / add_article_version)
 ↓
SQLite
```

Autoridad: `Evidence → Compiler → Gemini → Validator → Conflict Detector →
Magazine Service → SQLite`. Gemini = editor (propone JSON), Pulsaria =
publisher (valida y persiste), SQLite = verdad persistida.

## 11. Evidence Package

`build_evidence_package(conn, job_id)` reúne lo que Pulsaria YA indexa, sin
duplicar extracción:

| Paquete | Origen existente |
|---|---|
| `source` (url, canonical, título, autor, plataforma, duración, guía) | `jobs` + `media` + `content_items` |
| `transcript[]` (índice, inicio, fin, texto) | `get_transcript_segments` (canónico) |
| `keyframes[]` (artifact_id, timestamp, path) | `media_artifacts[kind='keyframe']` |
| `ocr[]` (ordinal, rango, texto, artifact_id) | `search_units[representation='ocr']` |
| `annotations[]` (categorías deterministas) | `content_annotations` |

Topes con marca `truncated` (200 segmentos, 24 keyframes, 80 OCR, 24
anotaciones; guía a 4.000 caracteres). Errores explícitos: `SourceNotFound`,
`EmptyEvidence`. Cada pieza conserva su procedencia (`segment_index`,
`artifact_id`, `ordinal`, `job_id`).

## 12. Provider boundary

`EditorialProvider::{Mock, Gemini}`. El compilador nunca toca red: pide
texto, valida después. `MockEditorialProvider` (escenarios `Valid`,
`WithConflict`, `OutOfRangeTimestamp`, `InvalidJson`, `IncompleteContract`;
solo tests/dev) deriva payloads de evidencia REAL para que la provenance se
ejercite offline. `GeminiEditorialProvider` delega en
`infrastructure::gemini::generate` (clave solo en proceso nativo
`PULSAR_GOOGLE_API_KEY`/`GOOGLE_API_KEY`, timeout 30 s, redacción de clave;
cero plumbing nuevo de secretos). El prompt exige JSON puro, timestamps
copiados de la evidencia y conflictos por índice; se rechaza antes de red si
supera `MAX_PROMPT_CHARS`. La respuesta tolera cercas ```json y luego
deserializa estricto (`article_type` desconocido ⇒ `InvalidJson`).

## 13. Compilación (`compile(source_id)`)

`compile_magazine_source(db, provider, params)`:
1. resuelve fuente + destino (tomo obligatorio; artículo-a-actualizar debe
   pertenecer al tomo);
2. reúne evidencia + contexto (tomo + hasta 12 artículos existentes);
3. crea la fila de compilación y la marca `processing`;
4. **suelta el bloqueo** y llama al proveedor;
5. parsea, valida contrato, valida provenance, exige `content` objeto no vacío;
6. fusiona conflictos sugeridos + autodetectados;
7. persiste (artículo nuevo / nueva versión / sin-cambios) y fija la
   compilación en `completed` / `requires_review` / `failed` (nunca queda en
   `processing`; el mensaje de error se acota a 500 caracteres).

`magazine_compilations` ganó columnas anulables `job_id`,
`target_chapter_id`, `update_article_id` (migración por introspección
PRAGMA, filas legadas ⇒ `None`). `retry_magazine_compilation` solo desde
`failed`/`cancelled`/`requires_review` (terminal→queued→processing,
respetando la guarda) y reutiliza la fila.

## 14. Provenance y timestamps

Además del contrato: fuente única compilada (multi-fuente pendiente y
rechazada explícita), `start ≥ 0`, `end ≤ duration` (si `media.duration`
existe; si no, solo rango relativo), solape con segmentos reales
(transcripción/OCR), keyframes por path exacto o timestamp ±1 s, OCR exige
unidades OCR indexadas, conflictos que comparen evidencias distintas
(duplicados ⇒ `SpuriousConflict`).

## 15. Conflictos y versiones

Sugeridos válidos + autodetección numérica (`200 g` vs `250 g` ⇒
`fact_key: "auto:g"`, `unresolved`, artículo/compilación a
`requires_review`; nunca se promedia). `article_content_matches` compara
título/resumen/contenido canónico: idéntico ⇒ `completed` sin versión nueva
(`unchanged: true`); distinto ⇒ `add_article_version` (+ `requires_review`
si aportó conflictos y la máquina lo permite).

## 16. IPC y UI de Fase 2

Comandos nuevos (19 totales): `compile_magazine_source(job_id, volume_id,
chapter_id?, update_article_id?)`, `get_magazine_compilation`,
`retry_magazine_compilation`. Sin rutas REST nuevas; sin `React → Gemini`.
El Librero muestra por tomo la última compilación real (● Estable /
◌ Compilando % / ! Requiere revisión / ✕ Falló / ○ Sin compilaciones),
estado Gemini del proceso nativo, y en el modal: panel de compilación con
mensaje/error reales, compilación por ID de video y reintento. Todo estado
visual proviene del backend.

---

# FASE 3 — Reader editorial + Evidence Navigation

## 17. Reader Architecture

Vertical slice funcional (sin datos hardcodeados):

```text
Magazines (Librero)
 ↓ abre tomo real (get_magazine_volumes)
Volume (modal: capítulos + artículos + compilación)
 ↓ abre artículo real (get_magazine_article_details, UNA llamada agregada)
Article (MagazineReader: cabecera, contenido, evidencia, fuentes, conflictos, versiones)
 ↓ selecciona evidencia (MagazineEvidenceTarget en memoria)
Evidence → Source → Media (get_magazine_source_media por job_id)
 ↓ video local + seek(timestamp)
```

Navegación `Article ← Chapter ← Volume ← Library` sin modales anidados:
el Reader reemplaza la estantería en el mismo panel; volver reabre el tomo
de origen. Capítulos agrupan artículos (`chapter_id`; resto en
"Sin capítulo").

## 18. Article Rendering

`StructuredContent` interpreta `structured_content_json` por bloques
reutilizables: texto, encabezado, lista/ingredientes (`nombre — cantidad`),
pasos numerados (con `tc` literal), código, cita, aviso, datos
(`título: valor`), figura (keyframe por path). Forma plana de receta
(`{yield, ingredients[], steps[]}`) se sintetiza a bloques. `article_type`
presenta chip legible (`recipe → Receta`, etc.) sin nueve readers
distintos. Formas desconocidas caen a `<details>` con el JSON original
(honesto, sin crash).

## 19. Evidence Navigation

Cada evidencia muestra: tipo, rango con timestamps accionables
(`MM:SS.d`), cita de transcripción, dato extraído, confianza, miniatura del
keyframe cuando existe, y `[Ver fuente]`. El destino interno
`MagazineEvidenceTarget { articleId, evidenceId, timestamp }` vive en
`lib/magazines.ts` para links/historial/navegación desde conflictos
(estado en memoria, no URL pública). Conflictos listan A/B con salto a
cada evidencia; lo disputado nunca se presenta como verdad.

## 20. Source Resolution

`resolve_source_media(conn, job_id)` (servicio) + IPC
`get_magazine_source_media` (20 comandos totales): `jobs ⨝ media` por id,
`None` si no existe. El frontend solo convierte paths con `convertFileSrc`
(mismo patrón que `VideoGrid`/`ExpandedVideoModal`); URLs remotas pasan tal
cual. Cadena de capas intacta: `React → IPC → Application → Domain`.

## 21. Timestamp Navigation

Seek canónico reutilizado: `currentTime` en `loadedmetadata` con clamp a
`duration` (patrón `initialTime` de `ExpandedVideoModal`). Reglas:
`timestamp = 0 → inicio`; `start_sec` válido → salto; rango `start—end`
visible + botón "Reproducir segmento" (gesto de usuario, sin autoplay
forzado). Sin video local: "Fuente disponible pero reproducción no
disponible" + estado de fuente (`local`/`online`/`unavailable`, misma regla
que `VideoGrid`).

## 22. Editorial State Rendering

`published`: lectura normal. `requires_review`: aviso ámbar discreto con
conteo de conflictos y salto a la sección. `processing`/`updating`: aviso
de posible incompletitud. `failed`: mensaje + regreso al flujo de
compilación. `draft`/`archived`: contenido no publicado. Vacíos (sin
capítulos/artículos/evidencia) son estados explícitos, nunca relleno.

---

# FASE 4 — Síntesis editorial multi-fuente + New Volume Candidate

## 23. Propósito y circuito editorial multi-fuente

La Fase 4 extiende el motor editorial de Pulsaria para consolidar múltiples
videos de la biblioteca en artículos cohesivos, trazables y actualizables,
manteniendo a Pulsaria y SQLite como la única autoridad del sistema:

```text
MULTIPLE VIDEOS / SOURCES
        ↓
EVIDENCE (MultiSourceEvidencePackage)
        ↓
CROSS-SOURCE KNOWLEDGE
        ↓
EDITORIAL SYNTHESIS (Gemini o Mock offline)
        ↓
CONFLICT DETECTION (Sugerido + Numérico determinista)
        ↓
VALIDATION (Contrato + Procedencia por cada Job)
        ↓
ARTICLE / ARTICLE VERSION (Persistencia atómica SQLite)
        ↓
EVIDENCE PROVENANCE (Trazabilidad multi-fuente por job_id)
        ↓
READER (MagazineReader existente)
        ↓
SOURCE + VIDEO + TIMESTAMP
```

Y en caso de sobrepasar el alcance editorial del tomo de destino:

```text
EDITORIAL RESULT
        ↓
PLACEMENT DECISION
        ↓
NEW VOLUME CANDIDATE (Propuesta en magazine_compilations; NUNCA en magazine_volumes)
```

## 24. Paquete de evidencia multi-fuente (`MultiSourceEvidencePackage`)

Implementado en `src-tauri/src/application/editorial_evidence.rs`:
- `build_multi_source_evidence_package(conn, &job_ids)` valida la lista de IDs:
  - Deduplica entradas preservando el orden relativo.
  - Falla cerrado si la lista está vacía (`EmptyEvidencePackage`).
  - Falla cerrado si algún `job_id` no existe en `jobs` (`SourceNotFound(job_id)`).
- Reúne la evidencia canónica de cada job (`jobs`, `media`, `transcript_segments`,
  `media_artifacts`, `search_units`, `content_annotations`).
- Cada elemento de evidencia preserva explícitamente su `job_id` de origen.

## 25. Proveedor editorial multi-fuente (`application/editorial_provider.rs`)

- Petición unificada `MultiSourceEditorialCompilerRequest` con lista de paquetes
  de evidencia, metadatos del tomo objetivo, capítulos y artículos existentes.
- Prompt del sistema multi-fuente (`build_multi_source_editorial_prompt`):
  - Deduplicación de afirmaciones idénticas entre fuentes en el texto editorial,
    anclando ambas fuentes en la lista de evidencias.
  - Prohibición estricta de promediar valores en conflicto: las discrepancias se
    declaran en `conflicts` con `resolution_state: "unresolved"`.
  - Instrucciones de proponer `candidate_volume` si el contenido sintetizado
    diverge sustancialmente del alcance del tomo objetivo.
- Escenarios mock deterministas para pruebas 100% offline:
  - `MultiSourceDeduplicated`: sintetiza 2 videos coincidentes unificando reclamos.
  - `MultiSourceNumericConflict`: detecta y registra discrepancia numérica.
  - `MultiSourceQualitativeConflict`: detecta y registra contradicción conceptual.
  - `MultiSourceComplementary`: integra perspectivas complementarias.
  - `InsufficientEvidence`: rechaza cuando las fuentes carecen de evidencia sustantiva.
  - `VersionUpdateNewSource`: actualiza un artículo existente al incorporar un nuevo video.
  - `NewVolumeCandidateProposal`: propone la creación de un nuevo tomo temático.

## 26. Compilador editorial multi-fuente (`application/editorial_compiler.rs`)

- Función principal: `compile_multi_source_editorial(db, provider, params)`.
- Orquestación segura y atómica:
  1. Validación de argumentos (`job_ids` no vacío, tomo existente, artículo a actualizar válido).
  2. Preparación de compilación: registra fila en `magazine_compilations` con `job_ids_json`
     y estado `processing`.
  3. Ejecución del pipeline con liberación del lock de base de datos durante la invocación del proveedor.
  4. Validación rigurosa de contrato (`validate_editorial_contract`) y procedencia (`validate_multi_source_provenance`):
     - Fuentes declaradas deben coincidir exactamente con los `job_ids` solicitados.
     - Cada job debe tener al menos una evidencia anclada.
     - Timestamps acotados a la duración de cada video particular (`media.duration`).
     - Keyframes y segmentos de texto verificados contra los artefactos reales de cada job.
     - Conflictos válidos entre evidencias reales y distintas (evita conflictos espurios).
     - Validación del candidato: `supporting_job_ids` debe ser un subconjunto no vacío de las fuentes compiladas.
  5. Detección determinista de conflictos numéricos complementaria.
  6. Persistencia atómica (`persist_multi_source_compilation_result`):
     - Manejo de idempotencia: si el artículo ya existe y el contenido es idéntico,
       devuelve `unchanged: true` sin crear una versión espuria.
     - Si hay cambios, incrementa versión e inserta fuentes y evidencias con `attach_sources_and_evidence_to_article`.
     - Si hay candidato a nuevo tomo, se serializa en `candidate_json` de la compilación.
     - La compilación se cierra en `completed` o `requires_review` (si hay conflictos).

## 27. Aislamiento estricto de New Volume Candidate

> **REGLA ARQUITECTÓNICA FUNDAMENTAL:**
> El candidato a nuevo tomo (`NewVolumeCandidate`) es ESTRICTAMENTE una propuesta.
> El compilador y el backend NUNCA insertan filas en `magazine_volumes` de forma automática.
> La propuesta queda serializada en `magazine_compilations.candidate_json` y expuesta al
> usuario en la interfaz para revisión humana consciente.

## 28. Comandos IPC y presentación en UI

- Nuevos comandos IPC registrados en Tauri:
  - `compile_multi_source_editorial(job_ids, volume_id, chapter_id?, update_article_id?)`
  - `get_magazine_compilation_candidate(compilation_id)`
- Frontend (`lib/magazines.ts`):
  - Tipos `NewVolumeCandidate` y extensiones en `CompilationOutcome`.
  - Wrappers tipados con guardas de ejecución en shell nativo.
- Interfaz de Estantería (`components/MagazinesBookshelf.tsx`):
  - Soporte de entrada de múltiples job IDs en el modal de tomo (ej. `1, 2`).
  - Sección dedicada de propuestas editoriales sugeridas: muestra título sugerido,
    categoría, justificación, confianza y fuentes de soporte sin permitir su uso
    como tomo activo.
  - Alerta en el modal del tomo informando de sugerencias detectadas.

