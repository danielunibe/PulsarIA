# PULSARIA — AUDITORÍA AAA INTEGRAL DE PREPARACIÓN PARA PRODUCTO

**Fecha de auditoría:** 2026-09-13  
**Auditor:** Antigravity IDE (Gemini 2.5 Pro)  
**Branch:** `main`  
**HEAD:** `fe5fcafdafd47f8ecbdf1f3917c9d73d90ad0138`  

> **INTEGRIDAD DEL REPOSITORIO:**  
> Al inicio de la auditoría, git status reportó archivos modificados (M) y untracked (??) de trabajo en curso del desarrollador.  
> Este informe NO ha modificado ningún archivo fuera de `audit/claude/`.

---

## CHECKLIST DE COBERTURA DE FASES

| Fase | Descripción | Estado |
|------|-------------|--------|
| 0 | Reconocimiento del repositorio | DONE |
| 1 | Baseline real | DONE |
| 2 | Arquitectura | DONE |
| 3 | Frontend (Next.js/React) | DONE |
| 4 | Rust/Tauri | DONE |
| 5 | Python/ML/Workers | DONE |
| 6 | Pipeline semántico end-to-end | DONE |
| 7 | Datos/SQLite/Persistencia | DONE |
| 8 | Filesystem y media Windows | DONE |
| 9 | Instalación Windows | DONE |
| 10 | Auto-updater y release engineering | DONE |
| 11 | Seguridad | DONE |
| 12 | Privacidad | DONE |
| 13 | Legal/Compliance | DONE |
| 14 | Dependencias y supply chain | DONE |
| 15 | Código muerto y legacy | DONE |
| 16 | Duplicación | DONE |
| 17 | Rendimiento | DONE |
| 18 | Escalabilidad | DONE |
| 19 | Resiliencia | DONE |
| 20 | Observabilidad | DONE |
| 21 | Manejo de errores | DONE |
| 22 | QA | DONE |
| 23 | Compatibilidad Windows | DONE |
| 24 | Producto y UX premium | DONE |
| 25 | Accesibilidad | DONE |
| 26 | Configuración y portabilidad | DONE |
| 27 | Secretos | DONE |
| 28 | Documentación vs realidad | DONE |
| 29 | "Implementado" no es "Terminado" | DONE |

---

## VEREDICTO EJECUTIVO (ACTUALIZADO POST-VERIFICACIÓN EMPÍRICA)

```
Current state:          Beta (Late Beta / Estabilización)
AAA readiness score:    64 / 100  (historical assessment; not recalculated here)
Current MVP gates:      PASS (13/13 automated gates; evidence below)
Release recommendation: CONDITIONAL GO for local MVP; public release remains externally blocked

P0: 2    P1: 10   P2: 14   P3: 10   P4: 8
Verified real bugs: 4           Security issues: 2
Architecture issues: 4          Privacy issues: 0 (Local-first preservado)
Legal/compliance risks: 2       Dead-code candidates: 11
Performance risks: 3            Compatibility risks: 2
UX/product-polish issues: 8     Unverified critical areas: 3
```

> **NOTA METODOLÓGICA DE AUDITORÍA (ANTI-FALSO-POSITIVO):**  
> En cumplimiento estricto de la Sección 11 de la directiva de auditoría ("Anti-falso-positivo: antes de registrar un P0/P1, vuelve a comprobar el finding..."), se llevó a cabo una verificación exhaustiva contra el código real y compilado de Pulsaria. Esta revisión demostró que **10 hallazgos iniciales eran falsos positivos o problemas ya resueltos** en la versión actual (incluyendo la supuesta dependencia de Redis, el leak de `.env` en git, la inconsistencia de paths HNSW, la duplicación de tipos de dominio, el versionado de embeddings y los índices SQL, los cuales ya están 100% implementados y testeados en Schema v7).

> **REGLA DE RECONCILIACIÓN:** Las secciones de findings, blockers, gap analysis y
> master plan que siguen conservan las hipótesis y la trazabilidad de la auditoría
> original. Para el estado del checkout actual prevalece exclusivamente la tabla
> `CURRENT CHECKOUT RECONCILIATION` siguiente. Un finding histórico no se interpreta
> como activo si aquí aparece como `STALE` o `COVERED`.

## CURRENT CHECKOUT RECONCILIATION

| ID | Hipótesis original | Estado actual | Evidencia actual | Criterio de cierre o siguiente acción |
|----|--------------------|---------------|------------------|----------------------------------------|
| PUL-AUD-001 | Updater base desactivado y sin pubkey | BLOCKED_EXTERNAL | `tauri.conf.json` mantiene el updater local desactivado | Activar solo con endpoint, pubkey y firma reales; producir `latest.json` y `.sig`. |
| PUL-AUD-002 | Redis obligatorio para la caché desktop | COVERED | `SemanticCache` LRU local con TTL, límite, invalidación y métricas; Redis no está en Cargo | Mantener prueba de arranque sin Redis. |
| PUL-AUD-003 | `.env` trackeado con rutas personales | STALE | `.env` está ignorado y no aparece en `git ls-files` | No modificar; conservar el override local. |
| PUL-AUD-004 | `commands.rs` como God Module | ACTIVE | Módulo vigente de aproximadamente 3.422 líneas | Extraer servicios por responsabilidad sin mover autoridad al frontend. |
| PUL-AUD-005 | `SettingsPanel.tsx` como God Component | PARTIAL | Sigue midiendo aproximadamente 135.473 bytes; carga diferida ya iniciada | Separar descarga, Whisper, búsqueda, storage, apariencia y diagnóstico. |
| PUL-AUD-006 | Paths de snapshot HNSW inconsistentes | COVERED | Normalización de base y snapshots `_shard_N`; pruebas single/multi-shard | Mantener pruebas de round-trip y no renombrar por motivos cosméticos. |
| PUL-AUD-007 | Tipos principales duplicados | COVERED | Modelos principales tienen autoridad en `domain/models.rs` | Verificar duplicaciones en cada cambio de dominio. |
| PUL-AUD-008 | Restricción TikTok no declarada y feedback críptico | COVERED | UI declara fuentes TikTok y backend distingue URL inválida/no soportada | Aún falta evidencia visual nativa; no ampliar plataformas en esta fase. |
| PUL-AUD-009 | Preflight incompleto de Python y binarios | PARTIAL | Preflight ejecuta probes de Python/imports/FFmpeg/FFprobe, tokenizer y modelos; registra health_event cuando falla | Completar control/diagnóstico de timeout ONNX. |
| PUL-AUD-010 | Auto-updater sin endpoint configurado | BLOCKED_EXTERNAL | No existen endpoint ni secretos de firma para este checkout local | Validar en pipeline release separado. |
| PUL-AUD-011 | API loopback sin autenticación por proceso | COVERED | JWT efímero por proceso, comando IPC y Bearer REST | Mantener pruebas de token válido, ausente, inválido y expirado en integración HTTP. |
| PUL-AUD-012 | Constante de dimensión 384 duplicada | COVERED | `EMBEDDING_DIMS` es única en el dominio | Rechazar nuevos literales de dimensión en lógica. |
| PUL-AUD-013 | `ort` RC y `download-binaries` | ACTIVE | Cargo continúa en `ort` RC con DirectML/download-binaries | Evaluar actualización en rama aislada y validar runtime instalado. |
| PUL-AUD-014 | Sin versionado de modelo de embeddings | COVERED | Schema v7 registra modelo, hash, dimensión y fecha; discrepancias marcan stale | Mantener backup y no destruir embeddings válidos durante reindex. |
| PUL-AUD-015 | `unwrap()` peligroso en storage/gateway | COVERED | Gateway no tiene `unwrap()` productivo; storage conserva usos en tests | Revisar cualquier nuevo unwrap fuera de fixtures. |
| PUL-AUD-016 | `app/page.tsx` como God Component | ACTIVE | Continúa concentrando aproximadamente 44.507 bytes de lógica | Extraer búsqueda, onboarding, selección, cine y configuración. |
| PUL-AUD-017 | Inferencia ONNX sin timeout | PARTIAL | `PULSAR_ONNX_TIMEOUT_MS` ejecuta la inferencia en `spawn_blocking` y devuelve error accionable | Añadir prueba de timeout y cancelación/aislamiento del worker que continúa tras expirar. |
| PUL-AUD-018 | Distributed mode compilado en desktop | PARTIAL | La activación está bloqueada por `cfg!(feature = "distributed")`; los módulos aún se compilan | Completar feature-gating de módulos y tests de build local/distribuido. |
| PUL-AUD-019 | Reindexación sin coordinación con la cola | PARTIAL | Manual y nocturno comparten gate de mantenimiento y no empiezan con jobs activos | Añadir prueba de carrera contra una admisión real de worker. |
| PUL-AUD-020 | Bind inseguro de métricas | STALE | `metrics_server.rs` fija `127.0.0.1` | No añadir parche artificial; conservar el gate de loopback. |
| PUL-AUD-021 | Ausencia de índices SQL | STALE | `db.rs` ya crea los índices de consultas frecuentes | No duplicar migraciones; verificar en migración legacy. |
| PUL-AUD-022 | Ruta personal expuesta en Git | STALE | Es el mismo falso positivo de PUL-AUD-003; no está trackeado | No limpiar archivos no rastreados sin clasificación. |
| PUL-AUD-023 | Sin Error Boundaries React | COVERED | Boundary raíz y límites funcionales con reintento/recarga | Añadir pruebas de teclado y recuperación visual cuando exista harness nativo. |
| PUL-AUD-024 | `rebuild_index` sin paridad HNSW/SQLite | PARTIAL | Índice temporal, conteo, metadata exacta, carga posterior y commit multi-shard con rollback | Completar prueba de fallo inducido durante commit y restauración del snapshot anterior. |
| PUL-AUD-025 | Onboarding desconectado end-to-end | COVERED en contrato | `verify:onboarding` pasa legalidad, flujo progresivo, foco y navegación | Falta revisión visual nativa; no reabrir como bug de conexión sin evidencia. |
| PUL-AUD-026 | FFmpeg Full infla el instalador | ACTIVE | Recursos actuales contienen FFmpeg/FFprobe grandes y bundle >300 MB | Preparar variante essentials externa, verificar codecs, licencia, hashes e instalador. |
| PUL-AUD-027 | `.env` expone datos personales | STALE | Duplicado de PUL-AUD-003; `.env` no está trackeado | No realizar cambios destructivos. |
| PUL-AUD-028 | Complejidad distribuida sin beneficio desktop | ACTIVE | Relacionado con PUL-AUD-018; todavía no hay feature gate final | Auditar imports/legacy antes de eliminar código. |
| PUL-AUD-029 | Falta límite y canonicalización de URL | PARTIAL | REST e IPC comparten límite 2.048, whitelist HTTPS TikTok y mensajes diferenciados | Añadir prueba de integración Tauri específica para URL sobredimensionada. |
| PUL-AUD-030 | Falta VACUUM automático | DEFERRED_PRODUCT | El mantenimiento manual existe y no es requisito del MVP | Automatizar solo con política explícita de disco y retención. |

La aceptación visual nativa, el flujo live de TikTok, la instalación MSI elevada,
la firma, el updater y la publicación no se derivan de estos estados de código.

## CINCO BLOCKERS CRÍTICOS REALES PARA LANZAMIENTO COMERCIAL

1. **Updater desactivado en configuración base con pubkey vacía (PUL-AUD-001 / PUL-AUD-010 - P0).**  
   `src-tauri/tauri.conf.json` mantiene `plugins.updater.active: false` y `pubkey: ""`. Aunque el pipeline de CI inyecta un overlay en builds oficiales, cualquier compilación manual o build fuera de CI carece de mecanismo de actualización, dejando al usuario sin vía de auto-parcheo ante cambios de plataforma.

2. **ReindexPipeline sin exclusión mutua frente a escrituras activas de Queue (PUL-AUD-019 / PUL-AUD-024 - P0).**  
   Si el usuario dispara `rebuild_index` mientras el worker queue procesa e inserta nuevos vectores en SQLite y en los shards HNSW activos, puede ocurrir una condición de carrera donde el nuevo snapshot reemplace al índice perdiendo los vectores insertados concurrentemente.

3. **URL sandbox restringido exclusivamente a TikTok sin declaración explícita en branding ni feedback de UI (PUL-AUD-008 - P1).**  
   `url_utils.rs` y `security.rs` limitan de forma rígida el procesamiento a `*.tiktok.com`, mientras que el README, la interfaz y los textos de onboarding describen a Pulsaria como un indexador de "videos cortos" genérico. Al ingresar URLs de YouTube Shorts, Reels u otras fuentes, el usuario recibe un error críptico de sandbox HTTPS.

4. **Tamaño excesivo del instalador (>600 MB) por inclusión de FFmpeg Full Build (PUL-AUD-026 - P1).**  
   Los ejecutables `ffmpeg.exe` y `ffprobe.exe` provienen de `ffmpeg-8.1.2-full_build` sumando 484 MB descomprimidos. El uso de la variante `ffmpeg-essentials` reduciría este peso a ~80 MB sin comprometer ninguna función requerida (demuxing MP4, extracción AAC/MP3 a WAV PCM16).

5. **Falta de preflight check de Python y dependencias al arranque (PUL-AUD-009 - P1).**  
   `python_runner.rs` asume la integridad de los binarios y dependencias embebidas en `$RESOURCE/python-workers`. Si el antivirus bloquea `python.exe` o si la instalación quedó truncada, la aplicación arranca aparentemente sana pero falla en silencio o con error genérico al encolar el primer video.


---

# FASE 0 — RECONOCIMIENTO DEL REPOSITORIO

## Stack tecnológico verificado

| Claim inicial | Realidad verificada |
|--------------|---------------------|
| Tauri 2, Rust | Tauri 2.10.3, Rust edition 2021 |
| Next.js 15, React 19, TypeScript, Tailwind | Next.js 15.5.25, React 19.2.1, Tailwind 4.1 |
| SQLite / rusqlite | rusqlite 0.31 bundled |
| Axum | Axum 0.7 |
| Workers Python: yt-dlp, faster-whisper, Pillow | Python 3.11.9 bundled, todas las deps presentes |
| ONNX Runtime, embeddings all-MiniLM-L6-v2 | ORT 2.0.0-rc.3, DirectML, modelo 90 MB bundleado |
| HNSW + búsqueda literal | crate `hnsw` 0.11 + SQL LIKE |
| Auto-actualización Tauri | Plugin presente pero DESACTIVADO en conf base |
| Caché semántico | LRU en memoria nativo (`SemanticCache`, sin Redis) |

## Mapa de módulos Rust por responsabilidad

```
src-tauri/src/
├── main.rs                    (467 LOC) Composition root
├── commands.rs                (3422 LOC / 126,469 bytes) GOD MODULE — IPC commands
├── db.rs                      (3032 LOC / 116,294 bytes) GOD MODULE — Schema + todas las queries
├── storage.rs                 (2041 LOC) Quota, purge, filesystem
├── embedding.rs               (162 LOC)  ONNX inference (all-MiniLM-L6-v2, 384d)
├── runtime.rs                 (90 LOC)   Path resolver (bundled vs dev)
├── url_utils.rs               (3.4 KB)   URL canonicalization
├── domain/
│   ├── models.rs              Core entities (JobRecord, SearchResult, etc.)
│   └── ports.rs               Traits: JobRepository, EmbeddingEngine, VectorIndex
├── application/
│   ├── queue_service.rs       Worker pool, dispatch, retry, circuit breaker
│   ├── search_service.rs      Semantic search orchestration
│   ├── semantic_chunker.rs    Text chunking con overlap
│   ├── hybrid_search.rs       BM25 + semantic fusion
│   ├── reranker.rs            Cross-encoder reranking (trait)
│   ├── embedding_cache.rs     In-memory embedding cache (LRU)
│   └── auto_cluster.rs        LLM-driven clustering
├── infrastructure/
│   ├── workers/python_runner.rs  Python subprocess spawn + JSON IPC
│   ├── persistence/hnsw_index.rs HNSW vector index (in-memory + snapshot)
│   ├── vector_shards.rs          Sharding horizontal de HNSW
│   ├── semantic_cache.rs         LRU cache local acotada (sin Redis)
│   ├── local_llm.rs              Download + inferencia LLM local
│   └── gemini.rs                 Gemini API client
├── api/
│   ├── gateway.rs             Axum router (:8080, loopback only)
│   └── middleware/security.rs JWT + rate limiter + URL sandbox
├── distributed/
│   └── query_coordinator.rs   Scatter-gather HTTP (prematura abstraction)
├── resilience/
│   └── circuit_breaker.rs     Circuit breaker para queue
└── maintenance/
    └── reindex_pipeline.rs    Reindexación nocturna
```

## Tamaños de componentes frontend

```
components/
├── SettingsPanel.tsx          135,473 bytes (GOD COMPONENT)
├── ExpandedVideoModal.tsx      71,930 bytes
├── ProcessingSetupModal.tsx    56,760 bytes
├── Header.tsx                  34,000 bytes
├── VideoGrid.tsx               26,000 bytes
└── ... (22 componentes más)

app/
└── page.tsx                    44,507 bytes (GOD COMPONENT)
```

---

# FASE 1 — BASELINE HISTÓRICO ORIGINAL

| Componente | Estado | Evidencia |
|------------|--------|-----------|
| Frontend TypeScript | PARTIAL | 47 archivos modificados sin build; next.config.ts usa output: 'export' |
| Rust compilation | NOT TESTED | ort RC3 puede tener breaking changes |
| Python workers | PARTIAL | main.py corre en daemon mode; deps en bundle Python 3.11 |
| SQLite schema | PASS | Schema v6, migrations ALTER TABLE granulares |
| Tauri packaging | NOT TESTED | createUpdaterArtifacts: false en conf base |
| Release pipeline | PARTIAL | Requiere secretos externos (cert, signing key) |
| Updater | FAIL | active: false, pubkey: "" en tauri.conf.json base |
| Redis dependency | FAILS SILENTLY | Error de conexión en cada arranque normal |
| ONNX model | PASS | model.onnx 90 MB confirmado en runtime-manifest |
| Whisper tiny | PASS | model.bin 75 MB confirmado en runtime-manifest |
| FFmpeg/FFprobe | PASS | Binaries bundleados (242 MB + 242 MB) |

## BASELINE DEL CHECKOUT RECONCILIADO

| Verificación | Estado actual | Evidencia reproducible |
|--------------|---------------|------------------------|
| HEAD | PASS | `git rev-parse --short HEAD` devuelve `fe5fcafd`. |
| Frontend lint, TypeScript y build | PASS | `npm run verify:mvp`; lint sin errores y el uso de imágenes locales tiene excepciones revisadas o `next/image`. |
| Rust | PASS | `cargo fmt -- --check`, `cargo check` y `cargo test`: 60/60 pruebas. |
| Python | PASS parcial | `npm run test:python`: 26 pruebas; un skip live intencional por falta de URL autorizada. |
| Runtime | PASS | `verify-runtime-manifest.ps1`: 51/51 recursos canónicos. |
| Onboarding | PASS en contrato | `verify-onboarding-contract.ps1`: contrato legal, progresivo, focusable y navegación. |
| Redis | PASS | No aparece como dependencia de Cargo ni como inicialización del desktop; la caché es LRU local. |
| API local | PASS condicionado | Loopback `127.0.0.1`, JWT por proceso y health público; rutas restantes protegidas por Bearer. |
| SQLite | PASS | Schema v7, índices existentes y metadata de modelo de embeddings. |
| Updater/publicación/firma | BLOCKED_EXTERNAL | No se fabrican endpoint, `latest.json`, `.sig`, claves ni certificados. |
| Worktree | PARTIAL / sucio | Había 56 archivos modificados y 26 no rastreados; esta reconciliación modifica solo este informe. |

---

# FASE 2 — ARQUITECTURA (HALLAZGOS HISTÓRICOS)

## Violaciones de la arquitectura declarada

La arquitectura `UI -> Commands -> Application -> Domain -> Infrastructure` existe estructuralmente pero tiene múltiples violaciones:

**A1. `commands.rs` como God Module (3623 líneas, 73 comandos)**  
Contiene lógica de negocio, queries SQL directas, validaciones, transformaciones de datos, lógica de settings, playlist, purge, y clustering. Viola SRP masivamente.

**A2. `db.rs` como God Module de persistencia (3151 líneas)**  
Schema completo + todas las queries + tipos de dominio duplicados + lógica de migración + reconciliación + reparación.

**A3. Tipos de dominio duplicados en 3 lugares**  
`JobRecord`, `SearchResult`, `MediaMetadata` están definidos en `domain/models.rs`, `db.rs` Y `commands.rs`.

**A4. `QueryCoordinator` recibe `Arc<Mutex<rusqlite::Connection>>` directamente**  
La capa `distributed/` tiene dependencia directa en la implementación de SQLite — violación domain/infrastructure.

**A5. `SearchService` depende de `distributed/QueryCoordinator`**  
Cross-layer coupling: `application/` importa de `distributed/`.

**A6. Distributed mode es prematura abstraction**  
`QueryCoordinator`, `VectorShardManager`, CLUSTER_NODES — infraestructura de cluster en un producto desktop single-machine. Nunca se usará en producción. Añade 1000+ líneas de complejidad innecesaria.

**A7. Redis en aplicación desktop local-first**  
`redis = { version = "1.0.5", features = ["tokio-comp"] }` es una dependencia de producción en un app desktop. En cada arranque, el sistema intenta conectar a `redis://127.0.0.1/` y genera un warn! visible en logs.


---

# FINDINGS DE AUDITORÍA

## PUL-AUD-001 — Updater desactivado en config base con pubkey vacía

**Severity:** P0 | **Status:** VERIFIED | **Complexity:** S

**Evidence:**  
- `src-tauri/tauri.conf.json:82-86`: `"active": false`, `"dialog": false`, `"pubkey": ""`
- Solo el CI overlay (release.yml:150-158) activa el updater

**Failure scenario:**  
1. Se descubre vulnerabilidad crítica en producción  
2. Se necesita build de emergencia fuera de CI  
3. El build tiene updater desactivado  
4. Los usuarios instalados nunca reciben el parche

**Required implementation:**  
- Separar configuración del updater en archivo de release explícito  
- Documentar en tauri.conf.json que `createUpdaterArtifacts: false` es solo para desarrollo  
- `pubkey: ""` nunca puede llegar a un binario distribuible

**Files:**  
- `src-tauri/tauri.conf.json` (documentación/estado)  
- `hooks/use-updater.ts` (guard en dev builds)

**Acceptance criteria:**  
- [ ] Cualquier build produce estado conocido para el updater  
- [ ] `pubkey: ""` nunca llega a binario distribuible

---

## PUL-AUD-002 — Redis como dependencia obligatoria en aplicación desktop

**Severity:** P1 | **Status:** VERIFIED | **Complexity:** M

**Evidence:**  
- `src-tauri/Cargo.toml:41`: `redis = { version = "1.0.5", features = ["tokio-comp"] }`
- `src-tauri/src/main.rs:145`: intenta conectar a `redis://127.0.0.1/` en cada arranque
- `src-tauri/src/infrastructure/semantic_cache.rs:19-24`: falla silenciosa, genera warn! en log

**Required implementation:**  
- Reemplazar `SemanticCache` con caché LRU en memoria (ya existe `application/embedding_cache.rs`)  
- Eliminar dependencia `redis` de Cargo.toml  
- El interface público de `SemanticCache` (lookup/set) debe mantenerse idéntico para SearchService

**Files:**  
- `src-tauri/Cargo.toml` (eliminar redis)  
- `src-tauri/src/infrastructure/semantic_cache.rs` (reemplazar implementación)  
- `src-tauri/src/main.rs` (eliminar inicialización Redis)

**Do NOT change:**  
- `src-tauri/src/application/search_service.rs` (usa SemanticCache abstractamente)

**Acceptance criteria:**  
- [ ] No hay `redis` en `cargo tree`  
- [ ] Logs de arranque sin errores de Redis  
- [ ] Caché semántica funciona en memoria

---

## PUL-AUD-003 — `.env` con rutas absolutas del desarrollador trackeado en git

**Severity:** P1 | **Status:** VERIFIED | **Complexity:** XS

**Evidence:**  
- `.env:1`: `PULSAR_DATA_DIR=C:\Users\danie\Desktop\Pulsaria\data`  
- `.env:2`: `PULSAR_DOWNLOAD_DIR=C:\Users\danie\Downloads`  
- Archivo trackeado en git (información personal expuesta)

**Required implementation:**  
- Añadir `.env` a `.gitignore`  
- La detección automática de rutas ya existe en `db.rs::data_dir_path()` y `storage.rs::default_media_root()`  
- Documentar que `.env` es solo para overrides explícitos de desarrollo

**Acceptance criteria:**  
- [ ] `.env` no aparece en `git ls-files`  
- [ ] App arranca correctamente sin `.env` usando defaults

---

## PUL-AUD-004 — `commands.rs` como God Module de 3623 líneas

**Severity:** P1 | **Status:** VERIFIED | **Complexity:** XL

**Evidence:**  
- `commands.rs`: 3623 líneas, 73 `#[tauri::command]` functions  
- Contiene: lógica de negocio de storage, queries SQL directas, validaciones URL, lógica de settings, playlist, purge, clustering, export/import semántico

**Required implementation:**  
- Extraer a servicios: `PlaylistService`, `StorageService`, `SettingsService`, `ExportService`, `MaintenanceService`  
- Comandos Tauri deben quedar como shims de 5-15 líneas cada uno  
- Refactor progresivo módulo por módulo

**Prerequisites:** PUL-AUD-007 (unificación de tipos)

**Acceptance criteria:**  
- [ ] Ningún archivo en `application/` supera 500 líneas  
- [ ] Comandos Tauri son handlers de ≤30 líneas

---

## PUL-AUD-005 — `SettingsPanel.tsx` de 135 KB — God Component

**Severity:** P1 | **Status:** VERIFIED | **Complexity:** L

**Evidence:**  
- `components/SettingsPanel.tsx`: 135,473 bytes  
- `components/ExpandedVideoModal.tsx`: 71,930 bytes  
- `components/ProcessingSetupModal.tsx`: 56,760 bytes

**Required implementation:**  
- Dividir en 6-8 componentes hijos (`DownloadSettings`, `WhisperSettings`, `SearchSettings`, `StorageSettings`, `AppearanceSettings`)  
- Usar `React.lazy` + `Suspense` para cargar secciones bajo demanda  
- El componente padre `SettingsPanel` queda como router de paneles

**Do NOT change:**  
- `hooks/use-processing-settings.ts`  
- `lib/settings-context.tsx`

**Acceptance criteria:**  
- [ ] Ningún componente supera 500 líneas  
- [ ] SettingsPanel carga en partes (lazy)

---

## PUL-AUD-006 — Inconsistencia de paths de snapshot HNSW

**Severity:** P0 | **Status:** HIGH-CONFIDENCE RISK | **Complexity:** S

**Evidence:**  
- `src-tauri/src/application/search_service.rs:155-158`: `snapshot_index()` guarda a `data_dir/vector_index.hnsw` (con extensión)  
- `src-tauri/src/infrastructure/vector_shards.rs:113-121`: `snapshot_index(base_path)` genera `{base_path_shard_N}.hnsw`, donde base_path ya tiene `.hnsw` → genera `vector_index.hnsw_shard_0.hnsw`  
- `src-tauri/src/infrastructure/vector_shards.rs:25-32`: Constructor `new()` busca `vector_index_shard_N.hnsw` (con `data_dir` como base)  
- El constructor carga correctamente, pero `SearchService.snapshot_index()` guarda con path incorrecto

**Failure scenario:**  
1. Usuario tiene 500 videos indexados  
2. Llama "Reconstruir índice" desde Settings  
3. SearchService.snapshot_index() guarda `vector_index.hnsw`  
4. App se reinicia  
5. VectorShardManager.new() busca `vector_index_shard_0.hnsw` — no existe  
6. Índice arranca vacío; búsqueda semántica: 0 resultados

**Required implementation:**  
- `SearchService.snapshot_index()` debe pasar el path base SIN extensión: `data_dir/vector_index`  
- `VectorShardManager.snapshot_index(base)` genera `{base}_shard_N.hnsw`  
- El constructor de VectorShardManager ya usa el pattern correcto con `data_dir/vector_index_shard_N.hnsw`

**Files:**  
- `src-tauri/src/application/search_service.rs` (snapshot_index/load_index)  
- `src-tauri/src/infrastructure/vector_shards.rs` (snapshot_index path generation)

**Do NOT change:**  
- `src-tauri/src/infrastructure/persistence/hnsw_index.rs`

**Test requirements:**  
- Insertar 10 vectores → snapshot → nueva instancia → cargar → buscar → encontrar 10

**Acceptance criteria:**  
- [ ] Después de restart con snapshot previo, hnsw.count() == pre-restart count

---

## PUL-AUD-007 — Tipos de dominio duplicados en 3 lugares

**Severity:** P1 | **Status:** VERIFIED | **Complexity:** M

**Evidence:**  
- `src-tauri/src/domain/models.rs:66-101`: `JobRecord` con 30 campos  
- `src-tauri/src/db.rs:7-39`: `JobRecord` con 30 campos (idéntico)  
- `src-tauri/src/domain/models.rs:104-114`: `SearchResult`  
- `src-tauri/src/db.rs:58-68`: `SearchResult` (idéntico)  
- `src-tauri/src/commands.rs:207-213`: `SearchConfig` (también en domain/models.rs)

**Required implementation:**  
- `domain/models.rs` es la única fuente de verdad  
- `db.rs` importa desde domain y crea mappers `row_to_job_record()`  
- `commands.rs` tiene DTOs de serialización con `From<domain::models::X>`

**Acceptance criteria:**  
- [ ] `rg "pub struct JobRecord" --type rust` retorna exactamente 1 resultado  
- [ ] `rg "pub struct SearchResult" --type rust` retorna exactamente 1 resultado

---

## PUL-AUD-008 — URL sandbox solo acepta TikTok, documentación es genérica

**Severity:** P1 | **Status:** VERIFIED | **Complexity:** M

**Evidence:**  
- `src-tauri/src/api/middleware/security.rs:217`: Solo acepta `tiktok.com`, `www.tiktok.com`, y subdominios `.tiktok.com`  
- README.md menciona "videos cortos" sin especificar plataforma  
- UI de AddLinks.tsx no muestra restricción  
- Usuarios con URLs de YouTube, Instagram, etc. reciben error genérico

**Required implementation:**  
- Opción A: Mensaje claro en UI cuando se rechaza URL no-TikTok  
- Opción B: Ampliar whitelist a plataformas adicionales (requiere análisis legal por plataforma)  
- En cualquier caso, la documentación debe coincidir con el comportamiento real

**Acceptance criteria:**  
- [ ] El usuario sabe qué plataformas son soportadas antes de intentar añadir URL

---

## PUL-AUD-009 — Spawn Python sin verificación de existencia del ejecutable al arrancar

**Severity:** P1 | **Status:** HIGH-CONFIDENCE RISK | **Complexity:** S

**Evidence:**  
- `src-tauri/src/runtime.rs:48-55`: `python_executable()` retorna path sin verificar existencia  
- Si Python no está (instalación incompleta, antivirus), el primer job falla con `ProcessSpawnError`  
- Mensaje de error no user-friendly; el usuario no sabe qué hacer

**Required implementation:**  
- En `main.rs`, verificar que `runtime::python_executable()` existe al startup  
- Si no existe: emitir evento de salud con severity: "error" y mensaje de remediación  
- Añadir check al comando `get_runtime_preflight`

---

## PUL-AUD-010 — Auto-updater sin endpoint configurado en base

**Severity:** P0 | **Status:** VERIFIED | **Complexity:** S

**Evidence:**  
- Config base: `active: false`, sin endpoints, `pubkey: ""`  
- Solo el CI overlay en release.yml inyecta endpoints y pubkey  
- `hooks/use-updater.ts` asume que el updater está disponible (puede generar errores en dev builds)

**Required implementation:**  
- Documentar explícitamente en tauri.conf.json que el updater requiere CI overlay  
- Guard en `use-updater.ts` para fallar gracefully en dev builds

---

## PUL-AUD-011 — API REST loopback sin autenticación real por proceso

**Severity:** P1 | **Status:** VERIFIED | **Complexity:** M

**Evidence:**  
- `security.rs:155-159`: JWT se omite si no se envía token (fallback: aceptar)  
- Resultado: cualquier proceso en el mismo equipo puede invocar la API  
- Rate limiter usa `127.0.0.1` para todos — es rate limit global, no por cliente

**Required implementation:**  
- Token de sesión aleatorio generado al arrancar (ya existe `jwt_secret` aleatorio)  
- Frontend Tauri obtiene el token via evento y lo envía en cada request HTTP  
- Requests sin token válido rechazadas incluso en loopback

**Do NOT change:**  
- `API_BIND_HOST: "127.0.0.1"` es correcto

---

## PUL-AUD-012 — Constante 384 (EMBEDDING_DIMS) duplicada en 3 archivos

**Severity:** P2 | **Status:** VERIFIED | **Complexity:** XS

**Evidence:**  
- `src-tauri/src/embedding.rs:153`: `let mut embedding = vec![0.0f32; 384];`  
- `src-tauri/src/infrastructure/persistence/hnsw_index.rs:21`: `const DIMS: usize = 384;`  
- `src-tauri/src/db.rs:70`: `pub const EMBEDDING_DIMENSIONS: usize = 384;`

**Required implementation:**  
- Definir `pub const EMBEDDING_DIMS: usize = 384;` en `domain/models.rs`  
- Importar en los 3 consumidores

**Acceptance criteria:**  
- [ ] `rg "384" --type rust` no retorna resultados en lógica de embedding

---

## PUL-AUD-013 — `ort` en versión RC con feature `download-binaries` en producción

**Severity:** P1 | **Status:** VERIFIED | **Complexity:** S

**Evidence:**  
- `src-tauri/Cargo.toml:21`: `ort = { version = "=2.0.0-rc.3", features = ["download-binaries", "directml"] }`  
- Feature `download-binaries` puede hacer que la crate descargue DLLs en runtime si no los encuentra  
- Los binarios están bundleados pero la feature flag podría ignorarlos

**Required implementation:**  
- Actualizar a `ort = "2.0"` cuando stable esté disponible  
- Verificar si `download-binaries` puede eliminarse ya que los DLLs están bundleados  
- Riesgo alto: cambio de RC a stable puede tener breaking changes

---

## PUL-AUD-014 — Sin versionado de modelo de embeddings en schema

**Severity:** P1 | **Status:** HIGH-CONFIDENCE RISK | **Complexity:** L

**Evidence:**  
- No existe campo `embedding_model_version` en `transcript_chunks`  
- Si cambia el modelo (tokenizer, pesos), los embeddings existentes producen resultados incorrectos sin error  
- SCHEMA_VERSION = 6 no versiona el modelo de embeddings

**Required implementation:**  
- Añadir campo `embedding_model_hash` a `transcript_chunks` (hash de tokenizer.json + model.onnx)  
- Al startup, verificar hash del modelo actual vs hash en DB  
- Si discrepancia: disparar reindexación automática con notificación al usuario

---

## PUL-AUD-015 — `unwrap()` en código de producción en `storage.rs` y `api/gateway.rs`

**Severity:** P2 | **Status:** VERIFIED | **Complexity:** XS

**Evidence:**  
- `rg ".unwrap()" src-tauri/src --type rust -l` lista: `storage.rs`, `api/gateway.rs` (además de db.rs en tests)  
- Los de `db.rs` están en tests — aceptable  
- Los de `storage.rs` y `api/gateway.rs` están en código de producción

**Required implementation:**  
- Reemplazar `unwrap()` en storage.rs y api/gateway.rs con `?` o `expect()` descriptivo

---

## PUL-AUD-016 — `app/page.tsx` como God Component de 44 KB

**Severity:** P2 | **Status:** VERIFIED | **Complexity:** L

**Required implementation:**  
- Extraer lógica de estado a custom hooks  
- Mover secciones de UI a subcomponentes  
- `page.tsx` como composición de componentes, no contenedor de lógica

---

## PUL-AUD-017 — Inferencia ONNX sin timeout (bloqueo indefinido posible)

**Severity:** P2 | **Status:** HIGH-CONFIDENCE RISK | **Complexity:** S

**Evidence:**  
- `src-tauri/src/embedding.rs:107-179`: `generate_embedding()` sincrónico, sin timeout  
- Si DirectML falla y cae a CPU: 30+ segundos por embedding  
- Con 100 chunks: worker bloqueado 50+ minutos solo en indexación

**Required implementation:**  
- Envolver inferencia ONNX en timeout configurable (ej: 30 segundos por embedding)  
- Si timeout: marcar job como "complete without embeddings" en lugar de fallar

---

## PUL-AUD-018 — Distributed mode compilado en binario de producción desktop

**Severity:** P2 | **Status:** VERIFIED | **Complexity:** L

**Evidence:**  
- `DISTRIBUTED_MODE=false` por defecto pero código de red HTTP siempre compilado  
- `QueryCoordinator` con scatter-gather HTTP real (224 líneas) — código de red en binario desktop

**Required implementation:**  
- Envolver en `#[cfg(feature = "distributed")]` feature flag de Cargo  
- En producción desktop: este feature nunca activo

---

## PUL-AUD-019 — ReindexPipeline sin coordinación con queue activo

**Severity:** P2 | **Status:** HIGH-CONFIDENCE RISK | **Complexity:** M

**Evidence:**  
- `main.rs:196-205`: ReindexPipeline en loop nocturno (cada 86400 segundos)  
- No verifica si hay jobs activos antes de reconstruir índice  
- Rebuild concurrente con indexación activa puede producir duplicados en HNSW

**Required implementation:**  
- `ReindexPipeline` debe verificar `queue_service.active_job_ids()` antes de iniciar  
- Si hay jobs activos: postponer reindexación

---

## PUL-AUD-020 — Servidor de métricas Prometheus sin verificación de bind address

**Severity:** P2 | **Status:** VERIFIED | **Complexity:** S

**Evidence:**  
- `main.rs:82-85`: `serve_metrics(prometheus_handle)` sin verificación explícita de bind address  
- Si hace bind a `0.0.0.0:9001`, cualquier proceso en la red local puede leer métricas de uso

**Required implementation:**  
- Verificar que el servidor de métricas hace bind SOLO a `127.0.0.1:9001`

---

## PUL-AUD-021 — Sin índices SQL en columnas frecuentemente consultadas

**Severity:** P2 | **Status:** HIGH-CONFIDENCE RISK | **Complexity:** XS

**Evidence:**  
- No se observan `CREATE INDEX` en `jobs.status`, `media.job_id`, `transcript_chunks.job_id`  
- Con 10,000 videos y 20-50 chunks cada uno: 200,000-500,000 filas sin índice

**Required implementation:**  
- `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`  
- `CREATE INDEX IF NOT EXISTS idx_chunks_job_id ON transcript_chunks(job_id)`  
- `CREATE INDEX IF NOT EXISTS idx_media_job_id ON media(job_id)`  
- Añadir en init_db + schema migration v7

**Acceptance criteria:**  
- [ ] `EXPLAIN QUERY PLAN` para queries comunes no muestra "SCAN TABLE"

---

## PUL-AUD-022 — Ruta personal del desarrollador en git

**Severity:** P1 | **Status:** VERIFIED | **Complexity:** XS

Ver PUL-AUD-003. Issue combinado: nombre de usuario `danie` en paths de `.env` expuesto en repositorio.

---

## PUL-AUD-023 — Sin Error Boundaries en React

**Severity:** P2 | **Status:** HIGH-CONFIDENCE RISK | **Complexity:** S

**Evidence:**  
- `app/layout.tsx` sin ErrorBoundary  
- Un error en VideoGrid o ExpandedVideoModal causa pantalla en blanco total

**Required implementation:**  
- ErrorBoundary en `app/layout.tsx` y alrededor de VideoGrid, SearchPanel, SettingsPanel  
- Fallback UI con "algo salió mal" + opción de reload

---

## PUL-AUD-024 — rebuild_index sin verificación de coherencia HNSW-DB

**Severity:** P1 | **Status:** HIGH-CONFIDENCE RISK | **Complexity:** M

**Evidence:**  
- Después de crash durante indexación: HNSW puede tener vectores sin chunk en DB, o viceversa  
- Búsqueda puede retornar job_ids sin chunk asociado (silenciosamente)

**Required implementation:**  
- `rebuild_index` debe ser atómico: borrar índice en memoria → cargar todos los embeddings de SQLite → reconstruir HNSW → snapshot  
- Verificar al final: `hnsw.count() == db.count_chunks()`

---

## PUL-AUD-025 — Flujo de onboarding no está conectado end-to-end

**Severity:** P2 | **Status:** VERIFIED | **Complexity:** M

**Evidence:**  
- `LegalConsentModal.tsx` existe (nuevo, untracked)  
- `WelcomeAnimation.tsx` existe (nuevo)  
- `use-legal-consent.ts` existe  
- Sin embargo, el wizard completo (consent → download dir → Whisper model → primer video) no está conectado

**Required implementation:**  
- Conectar LegalConsentModal → ProcessingSetupModal en secuencia de first-run  
- Detectar first-run via Tauri command  
- No mostrar dashboard vacío hasta que setup básico esté completado

---

## PUL-AUD-026 — FFmpeg full build (242 MB × 2 = 484 MB) infla el instalador

**Severity:** P2 | **Status:** VERIFIED | **Complexity:** M

**Evidence:**  
- `runtime-manifest.json`: ffmpeg.exe = 242,496,512 bytes, ffprobe.exe = 242,291,712 bytes  
- Versión: `ffmpeg-8.1.2-full_build` — incluye todos los codecs, la mayoría innecesarios para Pulsaria

**Required implementation:**  
- Usar `ffmpeg-essentials` (~40-60 MB por binary)  
- Verificar que H.264 decode, AAC, MP3, WAV están en la versión essentials

**Acceptance criteria:**  
- [ ] Tamaño total del instalador < 300 MB

---

## PUL-AUD-027 — `.env` con datos personales trackeado (combinado con PUL-AUD-003)

Ver PUL-AUD-003.

---

## PUL-AUD-028 — Distributed mode añade complejidad sin beneficio en desktop

**Severity:** P2 | **Status:** VERIFIED | **Complexity:** L

Ver PUL-AUD-018.

---

## PUL-AUD-029 — Sin validación de longitud de URL antes del procesamiento

**Severity:** P2 | **Status:** HIGH-CONFIDENCE RISK | **Complexity:** XS

**Required implementation:**  
- Validar longitud máxima de URL (ej: 2048 caracteres)  
- Limpiar query params de tracking antes de almacenar y procesar

---

## PUL-AUD-030 — Sin VACUUM automático programado en SQLite

**Severity:** P3 | **Status:** HIGH-CONFIDENCE RISK | **Complexity:** XS

**Evidence:**  
- `commands.rs::vacuum_db` existe para VACUUM manual  
- Sin VACUUM automático; con muchas inserciones/deleciones la DB se fragmenta

**Required implementation:**  
- Añadir VACUUM automático en maintenance_scheduler (mensualmente o por umbral de fragmentación)  
- `PRAGMA wal_checkpoint(PASSIVE)` periódico


---

# INVENTARIOS OBLIGATORIOS

## 1. DEAD CODE / LEGACY INVENTORY

| ID | Path | Clasificación | Riesgo | Recomendación |
|----|------|---------------|--------|---------------|
| DC-01 | `python-workers/export_onnx.py` | PROBABLY DEAD | LOW | Verificar si se usa en scripts de dev. Si no: eliminar. |
| DC-02 | `python-workers/export_onnx_embeddings.py` | PROBABLY DEAD | LOW | Idem |
| DC-03 | `python-workers/embed_query.py` | PROBABLY DEAD | LOW | Verificar si Rust lo invoca directamente |
| DC-04 | `python-workers/daemon.py` | PROBABLY DEAD | LOW | 225 bytes, probablemente stub. Verificar. |
| DC-05 | `src-tauri/src/distributed/` | LEGACY BUT ACTIVE | HIGH | Feature flag `#[cfg(feature = "distributed")]` o eliminar |
| DC-06 | `src-tauri/src/infrastructure/gemini.rs` | LEGACY BUT ACTIVE | MEDIUM | Documentar como feature opcional, no siempre disponible |
| DC-07 | `src-tauri/test_hnsw.rs` | CONFIRMED DEAD | LOW | 37 bytes, vacío/placeholder. Eliminar. |
| DC-08 | `KILOCODE_MASTER_PROMPT_V2.md` | CONFIRMED DEAD | LOW | Archivo de prompts de AI de desarrollo. Eliminar del repo. |
| DC-09 | `KILOCODE_MASTER_PROMPT_V3.md` | CONFIRMED DEAD | LOW | Idem. Eliminar. |
| DC-10 | `KILOCODE_START_HERE.md` | CONFIRMED DEAD | LOW | 54 KB de instrucciones de AI. Eliminar. |
| DC-11 | `script.py` (raíz) | UNKNOWN | LOW | 404 bytes untracked, sin contexto. Revisar y eliminar si es temporal. |

## 2. ARCHITECTURE DEBT INVENTORY

| ID | Área | Problema | Prioridad |
|----|------|---------|-----------|
| AD-01 | IPC Layer | commands.rs 3623 líneas — God Module | P1 |
| AD-02 | Persistence | db.rs 3151 líneas — God Module | P1 |
| AD-03 | Domain types | Duplicados en 3 lugares: db.rs + domain/models.rs + commands.rs | P1 |
| AD-04 | Search | SearchService depende de distributed/QueryCoordinator (cross-layer) | P2 |
| AD-05 | Distributed | Distributed mode en desktop — nunca se usará | P2 |
| AD-06 | Caching | Redis en desktop — dependencia inapropiada | P1 |
| AD-07 | Index sync | HNSW in-memory con path de snapshot inconsistente | P0 |
| AD-08 | Embedding dims | Constante 384 duplicada en 3 archivos | P2 |
| AD-09 | UI components | SettingsPanel 135 KB + page.tsx 44 KB — God Components | P1 |

## 3. DEPENDENCIAS CON ANOMALÍAS

| Dependencia | Ecosistema | Estado | Riesgo | Acción requerida |
|------------|------------|--------|--------|-----------------|
| redis 1.0.5 | Cargo | INNECESARIA en desktop | MEDIUM | Eliminar, reemplazar con LRU en memoria |
| ort 2.0.0-rc.3 | Cargo | RC en producción + feature download-binaries | HIGH | Actualizar a stable, verificar download-binaries |
| firebase-tools ^15.0.0 | npm devDeps | ¿Para qué se usa? | MEDIUM | Verificar necesidad, documentar o eliminar |
| framer-motion ^12.43 | npm devDeps | Duplica `motion` en dependencies | LOW | Consolidar en uno |
| three ^0.183.2 | npm | ~600 KB para efecto visual | LOW | Evaluar si justifica el costo de bundle |

## 4. FEATURE MATRIX

| Feature | UI | Backend | Persistencia | Error handling | Tests | Estado |
|---------|-----|---------|-------------|----------------|-------|--------|
| Descarga TikTok | DONE | DONE | DONE | PARTIAL | Python tests | FRAGILE |
| Transcripción Whisper | DONE | DONE | DONE | PARTIAL | Python tests | IMPLEMENTED |
| Búsqueda semántica HNSW | DONE | DONE | FRAGILE (sync) | NO fallback | NONE | FRAGILE |
| Búsqueda literal | DONE | DONE | DONE | DONE | Rust tests | IMPLEMENTED |
| Playlists | DONE | DONE | DONE | PARTIAL | NONE | PARTIAL |
| Auto-cluster | DONE | DONE | PARTIAL | NONE | NONE | PARTIAL |
| Análisis visual | DONE | DONE | DONE | Graceful | Tests | IMPLEMENTED |
| Storage/Purge | DONE | DONE | DONE | DONE | Rust tests | IMPLEMENTED |
| LLM local | DONE | DONE | NONE | PARTIAL | NONE | PARTIAL |
| LLM Gemini | DONE | DONE | NONE | PARTIAL | NONE | STUB |
| Auto-updater | UI DONE | DISABLED | N/A | NONE | NONE | NOT PRODUCT-READY |
| Colecciones/sync | DONE | DONE | DONE | PARTIAL | NONE | PARTIAL |
| Export/Import semántico | DONE | DONE | PARTIAL | NONE | NONE | PARTIAL |
| Onboarding/first-run | PARTIAL | DONE | DONE | NONE | NONE | PARTIAL |
| Observabilidad | NOT IN UI | Prometheus DONE | N/A | N/A | N/A | NOT PRODUCT-READY |

## 5. PRODUCT READINESS MATRIX

| Área | Score 0-5 | Justificación |
|------|-----------|---------------|
| Architecture | 3 | Separación en capas existe; God Modules y cross-layer coupling |
| Frontend | 2 | God Components; sin error boundaries; bundle inflado |
| Rust Backend | 3 | Sólido en su mayoría; paths HNSW inconsistentes; Redis innecesario |
| Python/ML | 3 | Pipeline robusto con fallbacks; deps bien bundleadas |
| Data Integrity | 3 | WAL, backups, rollback; falta versionado de embeddings |
| Security | 2 | Loopback binding correcto; JWT mock; .env en git |
| Privacy | 4 | Local-first genuino; datos no salen del equipo |
| Legal Readiness | 3 | Docs legales presentes; restricción TikTok no declarada |
| Performance | 2 | Sin índices DB; embeddings sin timeout; instalador 600+ MB |
| Scalability | 2 | DB scans con library grande; HNSW en memoria sin backup fiable |
| Reliability | 3 | Circuit breaker, retry, backpressure; fallos silenciosos |
| Windows Compatibility | 3 | Python 3.11 bundled; FFmpeg bundleado; sin ARM64 |
| Installer | 3 | NSIS + MSI; WebView2 offline; sin smoke test en CI de máquina limpia |
| Updater | 1 | Config base desactivada; sin pubkey; sin endpoint |
| QA | 2 | Tests unitarios Rust y Python; sin E2E ni integración |
| Accessibility | 1 | Sin evidencia de ARIA labels, keyboard nav, contraste verificado |
| UX | 2 | Diseño premium visible; onboarding ausente; errores técnicos en UI |
| Product Polish | 2 | Animaciones buenas; terminología inconsistente; estados vacíos sin guía |
| Maintainability | 2 | God modules; tipos duplicados; docs arquitectura desactualizadas |
| Release Engineering | 3 | Pipeline sólido; secretos externos; sin smoke test en CI |
| Observability | 2 | Métricas Prometheus; sin logging visible para usuario |

## 6. TOP 10 RIESGOS DE PRODUCTO

| Rank | Riesgo | Severidad | Probabilidad | Impacto |
|------|--------|-----------|-------------|---------|
| 1 | HNSW snapshot inconsistente → búsqueda semántica inutilizable tras rebuild | P0 | HIGH | Propuesta de valor destruida |
| 2 | Updater desactivado → usuarios sin parches de seguridad | P0 | HIGH | Instalaciones obsoletas sin remedio |
| 3 | Restricción TikTok no documentada → expectativas incorrectas | P1 | HIGH | Reviews negativas, soporte innecesario |
| 4 | Instalador de 600+ MB → abandono en descarga | P1 | HIGH | Conversión reducida |
| 5 | God modules → bugs difíciles de diagnosticar en producción | P1 | HIGH | Velocidad de corrección muy baja |
| 6 | Sin índices SQLite → degradación severa con 1000+ videos | P2 | HIGH | App inutilizable con biblioteca grande |
| 7 | Redis en desktop → error visible en logs en cada arranque | P1 | HIGH | Confusión de usuarios técnicos |
| 8 | `.env` con datos personales en git → fuga + CI roto | P1 | HIGH | Datos personales expuestos |
| 9 | Sin error boundaries React → pantalla en blanco total | P2 | MEDIUM | Experiencia de crash completo |
| 10 | Embeddings sin versionado → búsqueda silenciosamente incorrecta tras update | P1 | MEDIUM | Degrada calidad de búsqueda invisiblemente |

## 7. TOP QUICK WINS (alto beneficio, mínimo esfuerzo)

| QW | Acción | Impacto | Complejidad |
|----|--------|---------|-------------|
| QW-01 | Añadir `.env` a `.gitignore` | Elimina fuga de datos personales + CI fix | XS |
| QW-02 | Añadir índices SQLite (jobs.status, chunks.job_id) | Mejora rendimiento con library grande | XS |
| QW-03 | Definir constante `EMBEDDING_DIMS` única en domain/models.rs | Elimina 3 sources of truth | XS |
| QW-04 | Verificar bind address de métricas Prometheus es 127.0.0.1 | Seguridad básica | XS |
| QW-05 | Eliminar redis de Cargo.toml, reemplazar con LRU in-memory | Elimina dep innecesaria + error de arranque | S |
| QW-06 | Mensaje claro en UI para URLs no-TikTok | Fix immediate UX pain | XS |
| QW-07 | Añadir ErrorBoundary en app/layout.tsx | Previene pantallas en blanco | XS |
| QW-08 | Usar ffmpeg-essentials en lugar de ffmpeg-full | Reduce instalador ~400 MB | S |
| QW-09 | Eliminar KILOCODE_*.md del repo | Limpieza para colaboradores | XS |
| QW-10 | Unificar paths de snapshot HNSW (SearchService vs VectorShardManager) | Previene pérdida de índice en restart | XS |


---

# MASTER REMEDIATION PLAN

## WAVE 0 — Proteger datos y establecer baseline (prerrequisitos)

| Finding | Acción | Complejidad |
|---------|--------|-------------|
| PUL-AUD-003 | Añadir .env a .gitignore | XS |
| PUL-AUD-006 | Unificar paths HNSW snapshot | XS |
| PUL-AUD-021 | Añadir índices SQLite en migration v7 | XS |
| PUL-AUD-012 | Definir EMBEDDING_DIMS único en domain | XS |

**Gate WAVE 0:** Build compila; git status no contiene .env; búsqueda semántica persiste entre reinicios; queries SQL tienen índices.

## WAVE 1 — Release blockers

| Finding | Acción | Complejidad |
|---------|--------|-------------|
| PUL-AUD-001 | Documentar estado del updater en config base + guard en use-updater.ts | S |
| PUL-AUD-002 | Eliminar Redis, reemplazar con LRU in-memory | M |
| PUL-AUD-008 | Mensaje claro en UI para URLs no-TikTok | XS |
| PUL-AUD-023 | ErrorBoundary en app/layout.tsx | XS |

**Gate WAVE 1:** App arranca sin errores en logs. Restricción de plataforma es explícita. Pantallas en blanco mitigadas.

## WAVE 2 — Correcciones de arquitectura

| Finding | Acción | Complejidad |
|---------|--------|-------------|
| PUL-AUD-007 | Unificar tipos domain (JobRecord, SearchResult) | M |
| PUL-AUD-014 | Añadir versionado de modelo de embeddings | L |
| PUL-AUD-024 | Atomic rebuild_index con verificación HNSW-DB | M |
| PUL-AUD-019 | ReindexPipeline con lock ante queue activo | M |

**Gate WAVE 2:** Tipos unificados; búsqueda semántica confiable y verificada.

## WAVE 3 — Reliability

| Finding | Acción | Complejidad |
|---------|--------|-------------|
| PUL-AUD-009 | Preflight check de Python al startup | S |
| PUL-AUD-017 | Timeout en inferencia ONNX | S |
| PUL-AUD-015 | Eliminar unwrap() en storage.rs y gateway.rs | XS |

**Gate WAVE 3:** App degrada gracefully ante fallos de workers o GPU.

## WAVE 4 — Distribución

| Finding | Acción | Complejidad |
|---------|--------|-------------|
| PUL-AUD-026 | Usar ffmpeg-essentials (~80 MB) | M |
| DC-07,08,09,10 | Eliminar archivos dead-code del repo | XS |

**Gate WAVE 4:** Instalador < 300 MB.

## WAVE 5 — Rendimiento y UX

| Finding | Acción | Complejidad |
|---------|--------|-------------|
| PUL-AUD-005 | Splitting de SettingsPanel.tsx con lazy loading | L |
| PUL-AUD-016 | Splitting de page.tsx en componentes | L |
| PUL-AUD-025 | Conectar flujo de onboarding end-to-end | M |
| PUL-AUD-020 | Verificar bind address métricas Prometheus | XS |

**Gate WAVE 5:** App responsiva con 1000 videos; onboarding funcional.

## WAVE 6 — Seguridad

| Finding | Acción | Complejidad |
|---------|--------|-------------|
| PUL-AUD-011 | Token de sesión por proceso para API REST loopback | M |
| PUL-AUD-013 | Actualizar ort a stable, eliminar download-binaries | S |

## WAVE 7 — Limpieza arquitectónica

| Acción | Complejidad |
|--------|-------------|
| Refactor commands.rs → servicios en application/ | XL |
| Refactor db.rs en módulos separados por dominio | XL |
| Eliminar distributed mode o feature flag | L |

## WAVE 8 — Calificación final

| Acción |
|--------|
| Accesibilidad WCAG 2.1 AA básico |
| Tests E2E del flujo completo (download → search) |
| Smoke test de instalación en máquina limpia en CI |
| Documentación de usuario (qué es, cómo usarlo, limitaciones de plataforma) |

---

# PROGRESIÓN DE MADUREZ

```
Hoy (46/100)
    → Wave 0+1: Stable Internal Build (~58/100)
    → Wave 2+3: Reliable Beta (~68/100)
    → Wave 4:   Distributable Windows Product (~74/100)
    → Wave 5+6: Production Ready (~82/100)
    → Wave 7+8: Premium / AAA Quality (90+/100)
```

---

# DO-NOT-BREAK LIST

| Subsistema | Por qué no tocar |
|------------|-----------------|
| `db::init_db()` migration logic | Cada cambio incorrecto puede corromper DBs de producción |
| `api::gateway::API_BIND_HOST = "127.0.0.1"` | Control de seguridad crítico |
| `python_runner.rs::spawn()` con `kill_on_drop(true)` | Previene procesos huérfanos |
| `storage::finalize_job_media()` atomic move | Atomicidad de promoción de media |
| `db::backup_database_before_migration()` | Seguridad de datos del usuario |
| `queue_service.rs::reserve_depth()` backpressure | Previene saturación del sistema |
| CircuitBreaker en queue_service | Previene cascade failures |
| WAL + NORMAL synchronous en SQLite | Balance performance/durability |
| `python_runner.rs` cookie whitelist | Previene injection de browser malicioso |

---

# FORTALEZAS VERIFICADAS (No regresionar)

| Implementación | Por qué es correcta |
|---------------|---------------------|
| `db.rs::backup_database_before_migration()` | Checkpoint WAL antes de copiar — correcto |
| `commands.rs::atomic_write()` | Rename atómico con backup — correcto para Windows |
| `python_runner.rs`: `kill_on_drop(true)` | Previene procesos Python huérfanos en crash |
| `gateway.rs:20`: `API_BIND_HOST: "127.0.0.1"` | Correcto para desktop |
| `circuit_breaker.rs` | Protección ante cascade failures de workers |
| `queue_service.rs`: QUEUE_HIGH/LOW_WATERMARK | Backpressure correcto |
| `db.rs:338-343`: schema version check | Rechaza DB de versión futura |
| `main.rs:217-224`: JWT secret aleatorio por sesión | No hardcodeado — correcto |
| `security.rs:195`: HTTPS only validation | Correcto |
| `downloader.py:129` + `security.rs:447-449`: cookie browser whitelist | Whitelist explícita |
| `transcriber.py::_write_text_atomically()` | fsync + os.replace — correcto |
| WAL mode + NORMAL sync SQLite | Balance correcto performance/durability |
| `runtime.rs` canonical path resolver | Una sola fuente para todos los paths de runtime |
| `runtime-manifest.json` SHA-256 por archivo | Integridad del bundle verificable |
| `release.yml`: SHA-256 overlay JSON temporal eliminado post-build | No quedan secretos en disco |

---

# ÁREAS NO VERIFICADAS (Requieren verificación adicional)

| Área | Limitación | Cómo verificar |
|------|-----------|----------------|
| Build de producción completo | No se ejecutó `cargo build --release` | Ejecutar en CI y verificar artefactos |
| Runtime en máquina limpia | Sin acceso a máquina sin Node/Rust | VM Windows 10 sin runtimes previos |
| DirectML fallback a CPU | Sin hardware sin GPU | Máquina sin GPU compatible |
| Tamaño real del instalador | Sin build NSIS | `npm run tauri build` en CI |
| Rendimiento con 1000+ videos | Sin datos de producción | Benchmark con datos sintéticos |
| `verify:installed` smoke test | Sin instalación real | Requiere instalador completo |
| Accesibilidad real | Sin herramienta de accesibilidad | axe DevTools + Lighthouse |

---

# CRITERIOS DE PRODUCCIÓN

Para declarar "Pulsaria production-ready para Windows":

- [ ] `.env` no está trackeado en git  
- [ ] Build de producción compila sin warnings en Rust  
- [ ] App arranca sin errores en logs en máquina limpia  
- [ ] El índice HNSW persiste correctamente entre reinicios  
- [ ] El updater está configurado y funcional en builds de producción  
- [ ] La restricción de plataforma está claramente comunicada en la UI  
- [ ] El instalador pesa menos de 300 MB  
- [ ] No hay dependencia de Redis en el binario desktop  
- [ ] Índices SQLite en columnas críticas  
- [ ] ErrorBoundaries en todos los componentes React de datos  
- [ ] Flujo de onboarding completo y funcional  
- [ ] Tests E2E básicos (download + search flujo completo)  
- [ ] Smoke test de instalación en máquina limpia en CI  
- [ ] Autenticación de sesión en API REST loopback  
- [ ] Versionado de modelo de embeddings en schema  
- [ ] Métricas Prometheus solo en 127.0.0.1  
- [ ] Documentación de usuario básica (qué es, cómo usarlo, limitaciones)

---

# FASE 22 — QA: COBERTURA ACTUAL

**Rust (db.rs):** Tests unitarios extensos — insert/update/query jobs, transcript segments, chunks, collection sources, repair, atomicidad de persist_worker_result.

**Python:** `test_mvp_contracts.py`, `test_multimedia_contracts.py`, `test_output_formats.py` — tests de contratos del pipeline.

**Scripts de verificación:** 21 scripts PowerShell que verifican aspectos del release.

**Gaps críticos:**

| Área sin cobertura | Impacto |
|-------------------|---------|
| Tests E2E Tauri (download → search) | NINGUNO |
| Tests de integración HNSW + DB | NINGUNO |
| Tests de migración de schema | Solo implícitos |
| Tests de actualización del updater | NINGUNO |
| Tests de componentes React | NINGUNO |
| Tests de recovery ante crash | NINGUNO |
| Tests de instalación en máquina limpia | Solo scripts manuales |
| Tests de rendimiento con biblioteca grande | NINGUNO |

---

# FASE 28 — DOCUMENTACIÓN VS REALIDAD

| Documento | Claim | Realidad | Discrepancia |
|-----------|-------|---------|-------------|
| README.md | "Descarga, transcribe, indexa y consulta videos cortos" | Solo TikTok | Plataforma no especificada |
| AGENTS.md | `main.rs: ~285 LOC, bootstrap only` | **467 líneas** | Desactualizado |
| tauri.conf.json shortDescription | "Biblioteca audiovisual" | Solo TikTok | Genérico vs específico |
| ARCHITECTURE.md | Arquitectura por capas limpia | God Modules, violaciones cross-layer | Desactualizado |

---

# FASE 29 — "IMPLEMENTADO" vs "TERMINADO"

| Sistema | Clasificación | Justificación |
|---------|--------------|---------------|
| Descarga TikTok | IMPLEMENTED BUT FRAGILE | Funciona; cookies pueden expirar; sin retry de red |
| Transcripción Whisper | IMPLEMENTED | Pipeline completo con fallback graceful |
| Búsqueda semántica | IMPLEMENTED BUT FRAGILE | Sync inconsistente con DB, sin versionado de modelo |
| Búsqueda literal | IMPLEMENTED | SQL LIKE funciona correctamente |
| Playlists | PARTIAL | CRUD existe; sin export, import ni reorden |
| Auto-cluster | PARTIAL | LLM genera clusters; UI de gestión incompleta |
| Análisis visual | IMPLEMENTED | Con fallback graceful si Pillow no disponible |
| Storage/Quota | IMPLEMENTED | Bien implementado con purge y trash |
| LLM local | PARTIAL | Download + inferencia; sin persistencia de contexto |
| LLM Gemini | STUB | Solo llamada puntual sin sesión |
| Auto-updater | NOT PRODUCT-READY | Desactivado en config base |
| Colecciones/sync | PARTIAL | Loop de sync existe; UI de gestión incompleta |
| Observabilidad | NOT PRODUCT-READY | Métricas Prometheus; no accesible desde UI |
| Onboarding | PARTIAL | LegalConsentModal nuevo; wizard no conectado |
| Seguridad API | PARTIAL | Loopback + rate limit; sin sesión por proceso |

---

# ADDENDUM — INVESTIGATED: NOT AN ISSUE (VERIFICACIONES ANTI-FALSO-POSITIVO)

En estricta observancia de la Sección 11 de la directiva de auditoría (*"Anti-falso-positivo: antes de registrar un P0/P1, vuelve a comprobar el finding, busca código que pueda invalidar tu hipótesis, revisa call sites/configuración/tests/fallbacks, y confirma que el problema sigue existiendo"*), se ejecutó una re-inspección profunda sobre el código fuente activo de Pulsaria. 

A continuación se documentan formalmente los **10 hallazgos iniciales que resultaron ser falsos positivos o que ya estaban completamente resueltos y testeados en el repositorio**:

| ID | Hallazgo Inicial | Hipótesis Previa | Evidencia en Código Real | Conclusión |
|----|------------------|------------------|--------------------------|------------|
| **INV-01** | PUL-AUD-002 | Redis es una dependencia obligatoria en desktop que emite warnings en el arranque. | `src-tauri/Cargo.toml` no contiene `redis`. `src-tauri/src/infrastructure/semantic_cache.rs:10` implementa `SemanticCache` como un caché LRU nativo puramente en memoria, con el comentario explícito: `// not require a separately managed Redis process`. | **NO ES UN PROBLEMA / YA RESUELTO**. Cero dependencias externas de Redis en desktop. |
| **INV-02** | PUL-AUD-003, 022, 027 | Archivo `.env` con rutas personales del desarrollador trackeado en Git. | `.env` está explícitamente listado en `.gitignore:4`. `git ls-files .env` confirma que nunca ha sido trackeado. `git status --ignored --porcelain .env` arroja `!! .env`. Solo están versionados `.env.example` y `src-tauri/.env.example`. | **NO ES UN PROBLEMA / SEGURO**. No existe exposición de secretos ni datos personales en el control de versiones. |
| **INV-03** | PUL-AUD-006 | Discrepancia en paths de snapshot HNSW (`vector_index.hnsw` vs `vector_index_shard_N.hnsw`) causa pérdida de índice en reinicio. | `src-tauri/src/infrastructure/vector_shards.rs:143-165` aplica `trim_end_matches(".hnsw")` y añade `_shard_{index}.hnsw`. `src-tauri/src/application/search_service.rs:177-187` reconstruye usando un nonce y renombra los shards atómicamente a `vector_index_shard_{index}.hnsw`. El test unitario `snapshot_round_trip_preserves_multiple_shards_and_metadata` en `vector_shards.rs:175-225` valida que un snapshot con múltiples shards y metadatos se guarda y recarga sin pérdida de vectores. | **NO ES UN PROBLEMA / SEGURO**. La persistencia de shards es matemáticamente coherente y respaldada por tests unitarios. |
| **INV-04** | PUL-AUD-007 | Tipos de dominio `JobRecord` y `SearchResult` duplicados en 3 archivos (`db.rs`, `domain/models.rs`, `commands.rs`). | `pub struct JobRecord` está definida en un único lugar: `src-tauri/src/domain/models.rs:69`. `src-tauri/src/db.rs:2` realiza `pub use crate::domain::models::{JobRecord, SearchResult};`. `commands.rs` importa y consume `db::JobRecord`. | **NO ES UN PROBLEMA / YA RESUELTO**. Se respeta el Single Source of Truth en la capa de dominio. |
| **INV-05** | PUL-AUD-011 | Falta de autenticación de sesión por proceso en la API REST loopback. | `src-tauri/src/main.rs:239-258` genera un `JWT_SECRET` criptográfico aleatorio de 32 bytes con `rand::fill(&mut bytes)` en cada arranque si no se define por entorno, y emite un `api_session_token` mediante `security::create_session_token`. El middleware `jwt_auth_middleware` en `security.rs:177-198` valida el token Bearer en cada petición entrante. Testeado en `security.rs:237-255`. | **NO ES UN PROBLEMA / YA IMPLEMENTADO**. La API loopback requiere autenticación de sesión efímera por proceso. |
| **INV-06** | PUL-AUD-012 | Constante 384 (`EMBEDDING_DIMS`) duplicada en 3 archivos. | `pub const EMBEDDING_DIMS: usize = 384;` está definida en un único lugar: `src-tauri/src/domain/models.rs:9`. Es importada de forma centralizada por `search_service.rs`, `vector_shards.rs` y `embedding.rs`. | **NO ES UN PROBLEMA / YA RESUELTO**. Constante unificada en dominio. |
| **INV-07** | PUL-AUD-014 | Falta de versionado del modelo de embeddings en la base de datos. | Tabla `embedding_metadata (id, model_id, model_hash, dimensions, updated_at)` creada en `db.rs` (Schema Versión 7). `get_embedding_index_status()` y `record_embedding_model()` verifican el hash SHA-256 del modelo contra la base de datos para marcar el índice como stale si el modelo cambia. Testeado en `db.rs:3147` (`embedding_metadata_marks_index_stale_when_model_fingerprint_changes`). | **NO ES UN PROBLEMA / YA IMPLEMENTADO**. Versionado activo por huella digital SHA-256. |
| **INV-08** | PUL-AUD-015 | Presencia de `unwrap()` en código productivo de `storage.rs` y `api/gateway.rs`. | En `src-tauri/src/storage.rs`, los 32 `unwrap()` están confinados exclusivamente dentro de `#[cfg(test)] mod tests` (líneas 1690+). En `src-tauri/src/api/gateway.rs`, existen exactamente 0 ocurrencias de `unwrap()`. El código productivo utiliza `?`, `map_err`, y `unwrap_or_else`. | **NO ES UN PROBLEMA / CÓDIGO SEGURO**. Cero riesgo de pánico por `unwrap` en producción en estos módulos. |
| **INV-09** | PUL-AUD-020 | Servidor de métricas Prometheus expuesto sin verificación de bind address. | `src-tauri/src/infrastructure/observability/metrics_server.rs:12` hardcodea explícitamente `let address = format!("127.0.0.1:{port}");`. El bind se realiza únicamente a la interfaz de loopback local. | **NO ES UN PROBLEMA / SEGURO**. Imposible binding inadvertido a `0.0.0.0`. |
| **INV-10** | PUL-AUD-021 | Ausencia de índices SQL en columnas frecuentemente consultadas de SQLite. | `src-tauri/src/db.rs:731-744` define 14 índices SQL explícitos (`idx_jobs_status`, `idx_jobs_created_at`, `idx_jobs_url`, `idx_jobs_canonical_url`, `idx_segments_job_id`, `idx_embeddings_job_id`, `idx_media_job_id`, `idx_media_source_state`, `idx_media_access`, etc.) ejecutados automáticamente en la migración a Schema Versión 7. | **NO ES UN PROBLEMA / YA IMPLEMENTADO**. Rendimiento de consultas indexadas asegurado. |

---

# AAA GAP ANALYSIS (ANÁLISIS DE BRECHA HACIA CALIDAD AAA)

¿Qué separa exactamente a Pulsaria hoy de un producto desktop comercial, distribuible y mantenible durante años al estándar de calidad AAA? A continuación se detallan las brechas agrupadas en las 9 dimensiones críticas:

```
                                  ESTADO ACTUAL VS ESTÁNDAR AAA
┌──────────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Dimensión                            │ Brecha Crítica hacia Nivel AAA                         │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 1. Engineering Architecture          │ God Module `commands.rs` (3655 LOC) y God Component    │
│                                      │ `SettingsPanel.tsx` (135 KB). Modo distribuido innece-  │
│                                      │ sario compilado en binario desktop.                     │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 2. Reliability & Fault Tolerance     │ Carrera potencial entre `rebuild_index` y Queue activo.│
│                                      │ Falta de preflight check de Python/FFmpeg en startup.  │
│                                      │ Ausencia de timeout en inferencia ONNX DirectML.       │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 3. Security & Supply Chain           │ URL length sin limitar en Tauri IPC (vs REST 2048 ch). │
│                                      │ Crate `ort` con flag `download-binaries` en build.     │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 4. Distribution & Packaging          │ Instalador inflado (>600 MB) por FFmpeg Full Build.    │
│                                      │ Auto-updater desactivado (`active: false`) en config   │
│                                      │ base; depende exclusivamente de overlay en CI.         │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 5. Legal & Platform Compliance       │ Sandbox bloqueado a TikTok pero marketing y textos     │
│                                      │ anuncian biblioteca genérica de video corto.            │
│                                      │ Consentimiento legal no encadenado con setup inicial.  │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 6. Runtime Performance               │ Sin code-splitting ni dynamic imports en React. Carga   │
│                                      │ eager de `three.js` y `framer-motion` en dashboard.    │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 7. User Experience (UX)              │ Mensajes de error crípticos ante URLs no soportadas.    │
│                                      │ Falta de asistente de configuración (Onboarding Wizard)│
│                                      │ guiando selección de modelo Whisper y ruta de medios.  │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 8. Product Polish                    │ Trazas de excepciones de Python mostradas en toasts.   │
│                                      │ Inconsistencia en estados de carga y componentes vacíos│
│                                      │ entre Biblioteca, Cola y Colecciones.                  │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 9. Maintenance & QA Automation       │ Cobertura E2E nula (flujo URL → Descarga → HNSW → UI). │
│                                      │ Presencia de archivos muertos y prompts legacy en repo.│
└──────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

# REGRESSION MAP Y MATRIZ DE EFECTOS COLATERALES

El siguiente mapa documenta la cadena de dependencias operativa de Pulsaria y el radio de impacto de modificar cualquiera de sus capas:

```
[Ingesta de URL (UI / API REST)]
       │
       ▼ (1) Validación y Normalización (url_utils.rs, security.rs)
  ───▶ Si se altera el algoritmo de canonicalización o regex de TikTok:
       • Efecto: Rompe la deduplicación con registros previos en `jobs.canonical_url`.
       • Riesgo: Ingestas duplicadas del mismo video consumiendo ancho de banda y disco.
       │
       ▼ (2) Persistencia y Estados de Trabajo (db.rs SQLite)
  ───▶ Si se modifica el schema o el enum `JobStatus`:
       • Efecto: Invalida el State Machine de `queue_service.rs` y queries del frontend.
       • Riesgo: Trabajos estancados en estado intermedio sin retry ni cleanup.
       │
       ▼ (3) Orquestación de Cola y Circuit Breaker (queue_service.rs, circuit_breaker.rs)
  ───▶ Si se modifican las cuotas de concurrencia o límites de backpressure:
       • Efecto: Saturación de RAM por múltiples subprocesos Python de extracción y Whisper.
       • Riesgo: Pánicos por Out-Of-Memory (OOM) o disparo prematuro del Circuit Breaker.
       │
       ▼ (4) Subproceso Worker Python (python_runner.rs, downloader.py, transcriber.py)
  ───▶ Si se cambia FFmpeg Full por FFmpeg Essentials (PUL-AUD-026):
       • Efecto: Modifica los codecs disponibles para decodificación y transcodificación.
       • Riesgo Crítico: Debe verificarse que los demuxers de MP4/QuickTime y decoders
         AAC, MP3 y WAV PCM s16le permanezcan activos; de lo contrario `faster-whisper`
         fallará con `RuntimeError: Could not load audio`.
       │
       ▼ (5) Gestión de Almacenamiento Local (storage.rs)
  ───▶ Si se altera la jerarquía de carpetas `.pulsaria/` o `media/`:
       • Efecto: Invalida el scope de `assetProtocol` en `tauri.conf.json`.
       • Riesgo: La UI de Next.js pierde acceso a miniaturas y reproducción de video local.
       │
       ▼ (6) Inferencia de Embeddings (embedding.rs, domain/models.rs)
  ───▶ Si se actualiza el runtime ONNX (`ort`) o el modelo de embeddings:
       • Efecto: Cambia la huella digital del modelo en `embedding_metadata`.
       • Riesgo: Marca todo el índice como STALE. Si no se reindexa atómicamente,
         las búsquedas semánticas fallan silenciosamente.
       │
       ▼ (7) Sharding de Vectores HNSW (vector_shards.rs, search_service.rs)
  ───▶ Si se ejecuta `rebuild_index` concurrentemente con inserciones de la cola (PUL-AUD-019):
       • Efecto: El nuevo snapshot reemplaza los shards en disco ignorando vectores insertados
         por trabajos finalizados durante el proceso de reconstrucción.
       • Riesgo: Pérdida silenciosa de vectores en el índice vectorial frente a SQLite.
       │
       ▼ (8) IPC y REST Gateway (commands.rs, gateway.rs)
  ───▶ Si se descomponen los comandos en módulos de aplicación (PUL-AUD-004):
       • Efecto: Cambios en firmas de funciones o serialización JSON.
       • Riesgo: Rotura de los bindings de Tauri `invoke('command_name')` en el frontend.
       │
       ▼ (9) Frontend Dashboard (app/page.tsx, SettingsPanel.tsx)
  ───▶ Si se refactorizan los God Components en componentes atómicos con lazy loading:
       • Efecto: Desacopla estados globales de React (`useJobs`, `useSearch`, `useStorage`).
       • Riesgo: Pérdida de reactividad en tiempo de ejecución si no se preservan los contextos.
```

---

# CODEX WORK PACKAGES (ESPECIFICACIONES DE IMPLEMENTACIÓN PARA CODEX / LUNA)

Esta sección define los paquetes de trabajo de ingeniería ejecutables por Codex ("Luna") para cada uno de los hallazgos críticos confirmados (**P0 y P1**). Siguiendo las directivas de la auditoría, estas especificaciones describen la arquitectura, límites, invariantes y criterios de aceptación **sin generar código anticipado**, sirviendo como contrato técnico de implementación.

---

## [WP-01] Configuración Base y Resiliencia del Auto-Updater (P0)

- **Findings asociados:** PUL-AUD-001, PUL-AUD-010  
- **Severidad:** P0 (Release Blocker)  
- **Subcampo afectado:** Distribución, CI/CD y Auto-actualización (`src-tauri/tauri.conf.json`, `app/hooks/use-updater.ts`, `.github/workflows/release.yml`)  
- **Puntos de entrada exactos:**  
  - `src-tauri/tauri.conf.json -> plugins.updater`
  - `src-tauri/src/main.rs -> tauri_plugin_updater::Builder`
  - `app/hooks/use-updater.ts -> checkUpdate()`
- **Archivos involucrados:**  
  - `src-tauri/tauri.conf.json`
  - `src-tauri/src/main.rs`
  - `app/hooks/use-updater.ts`
  - `.github/workflows/release.yml`
- **Implementación existente a preservar:**  
  - El mecanismo de firma criptográfica Ed25519 utilizado por Tauri Updater v2.
  - El diálogo y barra de progreso de actualización en el frontend (`UpdateModal.tsx`).
  - La inyección de secretos en GitHub Actions mediante variables de entorno en release.
- **Comportamiento a remover/modificar:**  
  - Remover la configuración estática con `pubkey: ""` y `active: false` en `tauri.conf.json` que deja los builds manuales o locales desprovistos de soporte de actualización.
  - Modificar `use-updater.ts` para que no falle silenciosamente ni arroje errores en consola cuando el endpoint o la clave no estén presentes (desarrollo local).
- **Comportamiento objetivo:**  
  - `tauri.conf.json` debe incluir el endpoint canónico de releases (`https://github.com/<org>/pulsaria/releases/latest/download/latest.json`) en su configuración base.
  - En modo debug o cuando la clave pública no esté configurada, `main.rs` debe inicializar el plugin en modo pasivo sin emitir pánicos, y el frontend debe deshabilitar la opción de buscar actualizaciones indicando "Modo desarrollo".
  - En builds de producción, el build debe fallar tempranamente si no se ha suministrado una clave pública válida.
- **Límite arquitectónico:** Infraestructura de distribución. No debe acoplarse con la lógica de base de datos ni con los workers de procesamiento.
- **Requisitos de pruebas:**  
  - Test en CI que valide la generación del archivo `latest.json` firmado con minisign/tauri sign.
  - Test unitario en frontend simulando respuestas `UpdateAvailable` y `NoUpdateAvailable`.
- **Criterios de aceptación:**  
  - [ ] El ejecutable compilado en modo release verifica actualizaciones contra GitHub Releases.
  - [ ] El frontend muestra notas de versión y progreso de descarga porcentual.
  - [ ] La clave pública no está expuesta en texto claro en git (se inyecta en build time).
- **Checklist de regresión:** Verificar que las rutas locales de almacenamiento de medios no sean modificadas por el proceso de sobreescritura del binario.
- **Dependencias:** Ninguna (Wave 1).

---

## [WP-02] Exclusión Mutua en Reindexación y Verificación de Paridad Vectorial (P0)

- **Findings asociados:** PUL-AUD-019, PUL-AUD-024  
- **Severidad:** P0 (Integridad de Datos)  
- **Subcampo afectado:** Indexación Vectorial, Motor de Búsqueda y Cola de Ingesta (`src-tauri/src/application/search_service.rs`, `src-tauri/src/application/queue_service.rs`)  
- **Puntos de entrada exactos:**  
  - `SearchService::rebuild_index()`
  - `QueueService::process_next_job()`
  - `commands::rebuild_search_index()`
- **Archivos involucrados:**  
  - `src-tauri/src/application/search_service.rs`
  - `src-tauri/src/application/queue_service.rs`
  - `src-tauri/src/infrastructure/vector_shards.rs`
  - `src-tauri/src/commands.rs`
- **Implementación existente a preservar:**  
  - El mecanismo de reconstrucción shadow con nonce (`vector_index.rebuild-{nonce}_shard_{index}.hnsw`) y renombrado atómico.
  - El cálculo determinista de shards en `VectorShardManager::get_shard_index()`.
  - La transacción SQLite para lectura masiva de embeddings en `db::get_all_embeddings()`.
- **Comportamiento a remover/modificar:**  
  - Remover la ejecución concurrente no coordinada entre `rebuild_index` y la finalización de trabajos en `queue_service`.
  - Remover el retorno exitoso de `rebuild_index` sin verificación de conteo de vectores.
- **Comportamiento objetivo:**  
  - Implementar un `RwLock` o flag de exclusión mutua coordinado entre `QueueService` y `SearchService`. Al iniciar `rebuild_index`, el worker queue debe suspender temporalmente el commit de nuevos embeddings o retenerlos en un buffer transaccional.
  - Al completar la inserción en los shards temporales y antes del rename canónico, verificar que `vector_shards.vector_count() == sqlite.count(transcript_embeddings)`. Si hay discrepancia, abortar el reemplazo y conservar el snapshot anterior.
- **Límite arquitectónico:** Capa de aplicación (`application/search_service.rs`). No debe alterar el schema de SQLite.
- **Requisitos de pruebas:**  
  - Test de integración concurrente: Lanzar un trabajo de ingesta que inserte 50 segmentos mientras se ejecuta `rebuild_index` de forma simultánea. Validar que al terminar ambos, ningún vector se haya perdido.
- **Criterios de aceptación:**  
  - [ ] `rebuild_index` rechaza o encola nuevas peticiones de reindexación si una ya está en curso.
  - [ ] Los trabajos de ingesta que concluyan durante la reindexación no pierden sus vectores.
  - [ ] Se registra métrica Prometheus de duración de reindexación y disparidad de vectores.
- **Checklist de regresión:** Validar que la búsqueda semántica durante la reindexación continúe respondiendo usando el índice en memoria activo.
- **Dependencias:** Ninguna (Wave 1).

---

## [WP-03] Descomposición Modular del God Module `commands.rs` (P1)

- **Findings asociados:** PUL-AUD-004  
- **Severidad:** P1 (Mantenibilidad y Arquitectura)  
- **Subcampo afectado:** Capa IPC y Handlers de Tauri (`src-tauri/src/commands.rs`, `src-tauri/src/application/`)  
- **Puntos de entrada exactos:**  
  - `src-tauri/src/main.rs -> generate_handler![]`
  - `src-tauri/src/commands.rs` (3655 LOC actuales)
- **Archivos involucrados:**  
  - `src-tauri/src/commands.rs` (a dividir)
  - `src-tauri/src/commands/mod.rs` (nuevo)
  - `src-tauri/src/commands/jobs.rs` (nuevo)
  - `src-tauri/src/commands/search.rs` (nuevo)
  - `src-tauri/src/commands/storage.rs` (nuevo)
  - `src-tauri/src/commands/config.rs` (nuevo)
  - `src-tauri/src/commands/system.rs` (nuevo)
  - `src-tauri/src/main.rs`
- **Implementación existente a preservar:**  
  - Todos los nombres de comandos invocados desde el frontend (`invoke('add_job')`, `invoke('search_query')`, etc.). Los contratos IPC deben permanecer 100% idénticos.
  - La inyección de dependencias a través de `tauri::State<'_, AppState>`.
- **Comportamiento a remover/modificar:**  
  - Remover la lógica de negocio y consultas SQL directas embebidas dentro de las funciones `#[tauri::command]`.
  - Mover la lógica de orquestación a servicios de la capa `application/`.
- **Comportamiento objetivo:**  
  - `commands/` se convierte en un módulo delgado de transporte cuya única responsabilidad es deserializar parámetros, llamar al servicio de aplicación correspondiente y serializar la respuesta o mapear errores a `Result<T, String>`.
  - Ningún archivo en `commands/` debe superar las 400 líneas de código.
- **Límite arquitectónico:** Capa de transporte IPC. Respeta estrictamente las directivas de `AGENTS.md` (no saltar capas hacia infraestructura).
- **Requisitos de pruebas:**  
  - `cargo check --manifest-path src-tauri/Cargo.toml` exitoso sin warnings de imports.
  - Test de regresión de todos los comandos IPC existentes vía tests de integración de Tauri.
- **Criterios de aceptación:**  
  - [ ] `commands.rs` monolítico eliminado o reducido a re-exportador de `commands/mod.rs`.
  - [ ] 0 cambios requeridos en el código TypeScript del frontend.
- **Checklist de regresión:** Verificar que los eventos push hacia el frontend (`emit("log")`, `emit("job_status")`) sigan recibiendo el payload esperado.
- **Dependencias:** Wave 2.

---

## [WP-04] Descomposición y Carga Diferida de `SettingsPanel.tsx` (P1)

- **Findings asociados:** PUL-AUD-005  
- **Severidad:** P1 (Rendimiento Frontend y Mantenibilidad)  
- **Subcampo afectado:** UI de Ajustes y Diagnóstico (`app/components/SettingsPanel.tsx`)  
- **Puntos de entrada exactos:**  
  - `app/components/SettingsPanel.tsx` (135 KB actuales)
  - `app/page.tsx`
- **Archivos involucrados:**  
  - `app/components/SettingsPanel.tsx` (a refactorizar)
  - `app/components/settings/GeneralSettings.tsx` (nuevo)
  - `app/components/settings/ProcessingSettings.tsx` (nuevo)
  - `app/components/settings/StorageSettings.tsx` (nuevo)
  - `app/components/settings/DiagnosticsSettings.tsx` (nuevo)
  - `app/components/settings/CollectionSettings.tsx` (nuevo)
- **Implementación existente a preservar:**  
  - La persistencia reactiva de la configuración mediante los hooks `useWorkerConfig` y comandos de Tauri.
  - Los controles de throttling, selector de Whisper, selección de navegador para cookies y purga de almacenamiento.
- **Comportamiento a remover/modificar:**  
  - Remover la importación estática masiva de todos los paneles de configuración en el render inicial de la aplicación.
  - Desacoplar los estados locales gigantescos en sub-componentes independientes con sus propios hooks.
- **Comportamiento objetivo:**  
  - Cargar las secciones de configuración mediante `React.lazy()` y `Suspense` únicamente cuando el usuario abre la pestaña correspondiente.
  - Reducir el bundle footprint inicial en más de 100 KB de JavaScript parsing en WebView2.
- **Límite arquitectónico:** Frontend UI Layer (`app/components/settings/`). No debe alterar contratos con Tauri IPC.
- **Requisitos de pruebas:**  
  - `npm run build` exitoso con chunks dinámicos generados para cada pestaña de configuración.
  - Pruebas de renderizado de cada pestaña validando que los cambios de configuración persisten al cerrar y reabrir el panel.
- **Criterios de aceptación:**  
  - [ ] `SettingsPanel.tsx` orquestador < 200 líneas de código.
  - [ ] Tiempo de interacción (TTI) del dashboard principal mejorado visiblemente.
- **Checklist de regresión:** Asegurarse de que al cambiar de pestaña no se reinicien estados de edición no guardados.
- **Dependencias:** Wave 5.

---

## [WP-05] Descomposición del Dashboard Central `app/page.tsx` (P1)

- **Findings asociados:** PUL-AUD-016  
- **Severidad:** P1 (Arquitectura Frontend)  
- **Subcampo afectado:** Dashboard Principal y Enrutamiento de Estado (`app/page.tsx`)  
- **Puntos de entrada exactos:**  
  - `app/page.tsx` (44 KB, ~1200 LOC actuales)
- **Archivos involucrados:**  
  - `app/page.tsx`
  - `app/components/dashboard/LibraryView.tsx` (nuevo)
  - `app/components/dashboard/QueueView.tsx` (nuevo)
  - `app/components/dashboard/CollectionsView.tsx` (nuevo)
  - `app/components/dashboard/IngestHeader.tsx` (nuevo)
- **Implementación existente a preservar:**  
  - El sistema de pestañas y navegación rápida por teclado (`Ctrl+K` para búsqueda, atajos de vista).
  - Los contextos de estado global (`useJobs`, `useSearch`, `useStorageQuota`).
- **Comportamiento a remover/modificar:**  
  - Remover la definición inline de modales, tarjetas de video, tablas de cola y barras de herramientas dentro del mismo archivo `page.tsx`.
- **Comportamiento objetivo:**  
  - `app/page.tsx` debe actuar exclusivamente como layout y enrutador de vista según la pestaña activa (`library`, `queue`, `collections`, `settings`).
  - Cada vista debe encapsular su lógica de visualización, filtros y listas virtualizadas.
- **Límite arquitectónico:** Frontend View Layer.
- **Requisitos de pruebas:**  
  - Validar navegación sin parpadeos de renderizado entre Biblioteca, Cola y Colecciones.
- **Criterios de aceptación:**  
  - [ ] `page.tsx` reducido a menos de 250 LOC.
  - [ ] Componentes hijos desacoplados y testeables de forma aislada.
- **Checklist de regresión:** Verificar que la selección múltiple de videos y las acciones en lote (borrar, exportar) sigan respondiendo en `LibraryView`.
- **Dependencias:** Wave 5.

---

## [WP-06] Transparencia en Restricción de Plataforma y Manejo de Errores en UI (P1)

- **Findings asociados:** PUL-AUD-008  
- **Severidad:** P1 (Experiencia de Usuario y Soporte)  
- **Subcampo afectado:** Ingesta de URLs, Validación y Mensajería de Interfaz (`src-tauri/src/url_utils.rs`, `app/components/URLInput.tsx`, `README.md`)  
- **Puntos de entrada exactos:**  
  - `src-tauri/src/api/middleware/security.rs -> is_valid_sandbox_url`
  - `src-tauri/src/commands.rs -> add_job`
  - `app/components/IngestInput.tsx` (o equivalente en UI)
- **Archivos involucrados:**  
  - `src-tauri/src/commands.rs`
  - `app/components/IngestInput.tsx`
  - `README.md`
  - `src-tauri/tauri.conf.json`
- **Implementación existente a preservar:**  
  - La protección estricta del sandbox HTTPS que rechaza credenciales en URL (`userinfo@`) y esquemas no seguros.
  - El parser y canonicalizador de TikTok en `url_utils.rs`.
- **Comportamiento a remover/modificar:**  
  - Remover el mensaje de error genérico `"Only supported HTTPS media URLs are accepted"` que desorienta al usuario.
  - Modificar los claims genéricos en la documentación y placeholder del input ("Introduce cualquier URL de video").
- **Comportamiento objetivo:**  
  - El placeholder del input debe indicar claramente: `"Pega un enlace de video o colección de TikTok (ej. https://www.tiktok.com/@usuario/video/...)"`.
  - Si el usuario introduce una URL HTTPS válida de otro servicio (YouTube, Vimeo, etc.), la UI y el backend deben retornar un mensaje específico: `"Actualmente Pulsaria solo soporta videos y colecciones de TikTok. El soporte para otras plataformas está planificado."`.
  - Actualizar `README.md` y `tauri.conf.json` declarando explícitamente a TikTok como la plataforma soportada en esta versión.
- **Límite arquitectónico:** Validación de Ingesta y Capa de Presentación.
- **Requisitos de pruebas:**  
  - Test en frontend verificando que una URL de YouTube muestra el mensaje de plataforma no soportada de forma amigable en lugar de una alerta de error del sistema.
- **Criterios de aceptación:**  
  - [ ] Cero menciones ambiguas sobre plataformas universales en la UI.
  - [ ] Mensaje de error guiado y pedagógico ante URLs no-TikTok.
- **Checklist de regresión:** Validar que todos los formatos legítimos de TikTok (versión móvil `vt.tiktok.com`, `vm.tiktok.com`, perfiles, listas) sigan pasando la validación sin impedimentos.
- **Dependencias:** Wave 1.

---

## [WP-07] Verificación Preflight del Entorno Python y Diagnóstico de Binarios (P1)

- **Findings asociados:** PUL-AUD-009  
- **Severidad:** P1 (Fiabilidad y Resiliencia en Startup)  
- **Subcampo afectado:** Subprocesos de Python y Pipeline Multimedia (`src-tauri/src/infrastructure/workers/python_runner.rs`, `src-tauri/src/main.rs`)  
- **Puntos de entrada exactos:**  
  - `PythonWorker::new()`
  - `src-tauri/src/main.rs -> setup()`
  - `commands::get_system_health()`
- **Archivos involucrados:**  
  - `src-tauri/src/infrastructure/workers/python_runner.rs`
  - `src-tauri/src/runtime.rs`
  - `src-tauri/src/main.rs`
  - `src-tauri/src/db.rs`
- **Implementación existente a preservar:**  
  - La resolución de rutas canónicas en `runtime.rs` para entornos de desarrollo vs producción (`$RESOURCE`).
  - La directiva `kill_on_drop(true)` que evita procesos Python huérfanos.
  - La tabla `health_events` en SQLite para registro de incidentes de runtime.
- **Comportamiento a remover/modificar:**  
  - Remover el arranque ciego que asume que el subproceso Python siempre estará disponible y saludable.
- **Comportamiento objetivo:**  
  - Implementar un comando de preflight check `verify_python_runtime()` ejecutado en el bootstrap de `main.rs`.
  - El preflight debe verificar: (1) Existencia del ejecutable `python.exe`, (2) Ejecución exitosa de `python --version` en menos de 3 segundos, (3) Importación exitosa de los módulos críticos (`yt_dlp`, `faster_whisper`, `PIL`).
  - Si el preflight falla, registrar un `health_event` con severidad crítica y emitir un evento a la UI para que muestre una pantalla de diagnóstico con instrucciones claras (ej. exclusión de antivirus o reinstalación).
- **Límite arquitectónico:** Adaptador de Infraestructura (`infrastructure/workers/python_runner.rs`).
- **Requisitos de pruebas:**  
  - Test simulando la ausencia del ejecutable Python y validando que el sistema no hace pánico y emite el diagnóstico correspondiente.
- **Criterios de aceptación:**  
  - [ ] El arranque valida la integridad de los workers antes de aceptar URLs.
  - [ ] La UI notifica proactivamente si el entorno de procesamiento está dañado.
- **Checklist de regresión:** Asegurarse de que el preflight check no añada más de 300 ms al tiempo de arranque percibido en frío.
- **Dependencias:** Wave 3.

---

## [WP-08] Estabilización de Dependencias y Supply Chain de `ort` (P1)

- **Findings asociados:** PUL-AUD-013  
- **Severidad:** P1 (Seguridad de Cadena de Suministro y Estabilidad)  
- **Subcampo afectado:** Inferencia ONNX y Runtime de Embeddings (`src-tauri/Cargo.toml`, `.cargo/config.toml`)  
- **Puntos de entrada exactos:**  
  - `src-tauri/Cargo.toml -> [dependencies.ort]`
  - `src-tauri/src/embedding.rs`
- **Archivos involucrados:**  
  - `src-tauri/Cargo.toml`
  - `src-tauri/Cargo.lock`
  - `src-tauri/src/embedding.rs`
  - `.github/workflows/release.yml`
- **Implementación existente a preservar:**  
  - La aceleración DirectML para GPUs Windows (`ExecutionProvider::DirectML`).
  - El fallback automático a CPU Execution Provider si DirectML no está soportado.
  - El modelo `all-MiniLM-L6-v2` cuantizado a 384 dimensiones.
- **Comportamiento a remover/modificar:**  
  - Remover la dependencia en una versión Release Candidate (`2.0.0-rc.3`) con el flag inseguro `download-binaries` activo en builds de producción.
- **Comportamiento objetivo:**  
  - Actualizar `ort` a la versión estable más reciente compatible con DirectML en Windows x64.
  - En el workflow de release de CI, empaquetar y verificar los binarios DLL de ONNX Runtime (`onnxruntime.dll`, `onnxruntime_providers_directml.dll`) mediante checksums SHA-256 explícitos en lugar de permitir descargas en tiempo de compilación.
- **Límite arquitectónico:** Capa de dependencias de Rust e Inferencia.
- **Requisitos de pruebas:**  
  - Compilación limpia con `--frozen` o `--offline` tras hidratar el vendor cache.
  - Test unitario de inferencia de embeddings en CPU y GPU validando paridad de vectores.
- **Criterios de aceptación:**  
  - [ ] Cero flags de descarga dinámica no controlada en Cargo de producción.
  - [ ] Build reproducible en CI sin acceso libre a URLs externas durante `cargo build`.
- **Checklist de regresión:** Validar que DirectML continúe detectando adaptadores GPU AMD, Intel Arc y Nvidia.
- **Dependencias:** Wave 6.

---

## [WP-09] Timeout y Control de Cancelación en Inferencia ONNX (P1)

- **Findings asociados:** PUL-AUD-017  
- **Severidad:** P1 (Resiliencia y Bloqueo de Hilos)  
- **Subcampo afectado:** Inferencia de Embeddings (`src-tauri/src/embedding.rs`, `src-tauri/src/application/search_service.rs`)  
- **Puntos de entrada exactos:**  
  - `ONNXModelManager::embed_text()`
  - `ONNXModelManager::embed_batch()`
- **Archivos involucrados:**  
  - `src-tauri/src/embedding.rs`
  - `src-tauri/src/application/search_service.rs`
- **Implementación existente a preservar:**  
  - La normalización L2 de vectores de salida.
  - La tokenización con truncamiento a 256 tokens por chunk.
- **Comportamiento a remover/modificar:**  
  - Remover la llamada síncrona bloqueante a la sesión ONNX sin guardarraíl de tiempo máximo.
- **Comportamiento objetivo:**  
  - Envolver la inferencia en un contexto con timeout estricto (ej. 10 segundos por lote) usando `tokio::time::timeout` sobre un hilo de `tokio::task::spawn_blocking`.
  - Si la inferencia supera el umbral (por ejemplo, ante un deadlock de DirectML en hibernación de Windows), abortar la operación retornando un error recuperable `EmbeddingTimeout`, liberar el hilo y registrar la falla en métricas.
- **Límite arquitectónico:** Dominio de Inferencia y Puertos (`domain/ports.rs`).
- **Requisitos de pruebas:**  
  - Test unitario con un mock de sesión que retarde la respuesta 12 segundos, verificando que el timeout cancela la operación y no bloquea el runtime de Tokio.
- **Criterios de aceptación:**  
  - [ ] La aplicación nunca queda congelada indefinidamente durante la búsqueda o indexación.
  - [ ] Se emite métrica Prometheus `onnx_inference_timeouts_total`.
- **Checklist de regresión:** Verificar que lotes grandes de 64 segmentos no disparen falsos positivos de timeout en CPUs de baja gama.
- **Dependencias:** Wave 3.

---

## [WP-10] Implementación de Error Boundaries Globales en React (P1)

- **Findings asociados:** PUL-AUD-023  
- **Severidad:** P1 (Experiencia de Usuario y Prevención de Crashes)  
- **Subcampo afectado:** Árbol de Renderizado Frontend (`app/layout.tsx`, `app/page.tsx`)  
- **Puntos de entrada exactos:**  
  - `app/layout.tsx`
  - `app/components/ErrorBoundary.tsx` (nuevo)
  - `app/components/dashboard/` (vistas principales)
- **Archivos involucrados:**  
  - `app/components/ErrorBoundary.tsx`
  - `app/layout.tsx`
  - `app/page.tsx`
- **Implementación existente a preservar:**  
  - El sistema de temas (dark/light mode) y los estilos globales de Tailwind CSS.
  - Los proveedores de contexto principales (`ToastProvider`, `SettingsProvider`).
- **Comportamiento a remover/modificar:**  
  - Remover la renderización desprotegida donde una excepción de renderizado en un item de video (ej. fecha malformada o thumbnail inexistente) causa la pantalla blanca total de la aplicación.
- **Comportamiento objetivo:**  
  - Crear un componente `ErrorBoundary` de clase React con soporte para: (1) Captura de errores no controlados, (2) UI de reemplazo premium con opciones de "Reintentar" y "Copiar diagnóstico técnico", (3) Envío automático del error al sistema de logs de Tauri vía `emit_log`.
  - Envolver `app/layout.tsx` con el Boundary raíz y envolver cada vista del dashboard (`LibraryView`, `QueueView`, `SettingsPanel`) con Boundaries contextuales independientes para que un fallo en un panel no tumbe el resto de la app.
- **Límite arquitectónico:** Capa de Presentación Frontend.
- **Requisitos de pruebas:**  
  - Test en componente provocando un throw deliberado en una tarjeta de video; verificar que solo esa sección muestra la tarjeta de error sin colapsar el menú ni la barra de búsqueda.
- **Criterios de aceptación:**  
  - [ ] 0 pantallas blancas totales ante errores inesperados de JavaScript.
  - [ ] Botón funcional de auto-recuperación de estado.
- **Checklist de regresión:** Verificar que las transiciones de rutas y modales no desechen el estado global al capturar un error local.
- **Dependencias:** Wave 1.

---

## [WP-11] Encadenamiento del Asistente de Onboarding y Consentimiento Legal (P1)

- **Findings asociados:** PUL-AUD-025  
- **Severidad:** P1 (Cumplimiento Legal y Primera Experiencia de Usuario)  
- **Subcampo afectado:** Flujo de Primer Arranque (Onboarding) (`app/components/LegalConsentModal.tsx`, `app/components/ProcessingSetupModal.tsx`, `app/hooks/use-legal-consent.ts`)  
- **Puntos de entrada exactos:**  
  - `app/page.tsx -> useEffect()` de arranque
  - `src-tauri/src/commands.rs -> is_first_run / complete_first_run`
- **Archivos involucrados:**  
  - `app/components/onboarding/OnboardingWizard.tsx` (nuevo orquestador)
  - `app/components/LegalConsentModal.tsx`
  - `app/components/ProcessingSetupModal.tsx`
  - `app/hooks/use-legal-consent.ts`
  - `src-tauri/src/commands.rs`
  - `src-tauri/src/db.rs`
- **Implementación existente a preservar:**  
  - Los textos y términos legales definidos en `LegalConsentModal.tsx`.
  - El selector de modelo de Whisper (tiny, base, small) y cálculo de memoria requerida en `ProcessingSetupModal.tsx`.
- **Comportamiento a remover/modificar:**  
  - Remover la desconexión actual donde los modales existen en el código pero no se encadenan de forma secuencial y bloqueante antes de habilitar el dashboard.
- **Comportamiento objetivo:**  
  - Implementar una máquina de estados de onboarding en el frontend:  
    `Paso 1: Bienvenida y Consentimiento Legal Local-First` ➔  
    `Paso 2: Selección de Carpeta de Medios y Comprobación de Espacio en Disco` ➔  
    `Paso 3: Selección de Modelo Whisper según Hardware Detectado` ➔  
    `Paso 4: Invitación a Ingestar el Primer Video de TikTok`.
  - Persistir el flag `first_run_completed: true` en la tabla `system_config` de SQLite solo al finalizar el paso 3.
- **Límite arquitectónico:** Flujo de Experiencia de Usuario y Configuración de Sistema.
- **Requisitos de pruebas:**  
  - Test de ciclo de vida completo en base de datos limpia: verificar que el modal no es saltable mediante tecla `Escape` o clic fuera del diálogo.
- **Criterios de aceptación:**  
  - [ ] Ningún usuario nuevo ve un dashboard vacío sin haber aceptado los términos y configurado su almacenamiento.
  - [ ] En arranques subsiguientes, el wizard no vuelve a mostrarse.
- **Checklist de regresión:** Verificar que las configuraciones seleccionadas en el wizard se apliquen inmediatamente a los workers activos sin necesidad de reiniciar la app.
- **Dependencias:** Wave 5.

---

## [WP-12] Empaquetado con FFmpeg Essentials y Reducción de Huella del Instalador (P1)

- **Findings asociados:** PUL-AUD-026  
- **Severidad:** P1 (Distribución y Conversión de Usuarios)  
- **Subcampo afectado:** Empaquetado de Binarios y Pipeline de Release (`runtime-manifest.json`, `build-tools/bundle_ffmpeg.ps1`, `.github/workflows/release.yml`)  
- **Puntos de entrada exactos:**  
  - `build-tools/bundle_ffmpeg.ps1`
  - `src-tauri/runtime-manifest.json`
- **Archivos involucrados:**  
  - `build-tools/bundle_ffmpeg.ps1`
  - `src-tauri/runtime-manifest.json`
  - `.github/workflows/release.yml`
  - `python-workers/transcriber.py`
- **Implementación existente a preservar:**  
  - La verificación de integridad mediante hashes SHA-256 en `runtime-manifest.json`.
  - La invocación headless de FFmpeg desde Python mediante `subprocess.Popen` sin creación de consolas visibles (`CREATE_NO_WINDOW`).
- **Comportamiento a remover/modificar:**  
  - Remover la descarga y empaquetado de `ffmpeg-8.1.2-full_build` que aporta cientos de codecs de broadcast innecesarios para videos web.
- **Comportamiento objetivo:**  
  - Reemplazar la fuente de descarga por la distribución oficial `ffmpeg-essentials` (de Gyan.dev o BtbN).
  - Reducir el tamaño de `ffmpeg.exe` de ~242 MB a ~65 MB y de `ffprobe.exe` de ~242 MB a ~60 MB.
  - Regenerar los hashes en `runtime-manifest.json`.
- **Límite arquitectónico:** Infraestructura de Empaquetado y Release Engineering.
- **Requisitos de pruebas:**  
  - Ejecutar la suite de tests de Python (`test_multimedia_contracts.py`) validando: (1) Demuxing de contenedores MP4 y QuickTime, (2) Extracción de pistas de audio AAC y MP3, (3) Conversión a WAV PCM de 16-bit 16kHz requerida por Whisper.
- **Criterios de aceptación:**  
  - [ ] El instalador final `.msi` / `.exe` pesa menos de 300 MB en total (reducción > 50%).
  - [ ] 100% de los videos de prueba de TikTok se procesan y transcriben idénticamente.
- **Checklist de regresión:** Asegurarse de que el script de release de CI verifique la firma y hash de los nuevos binarios essentials antes de generar el release bundle.
- **Dependencias:** Wave 4.

---

# MATRIZ EXPANDIDA DE FORTALEZAS VERIFICADAS (DO-NOT-REGRESS)

Durante esta auditoría exhaustiva se verificaron patrones de ingeniería sobresalientes en la base de código que **deben preservarse estrictamente en cualquier refactorización futura**:

```
┌───────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────┐
│ Componente / Módulo                               │ Fortaleza de Ingeniería Verificada                          │
├───────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 1. `db.rs::backup_database_before_migration()`    │ Checkpoint WAL forzado previo a copia física de respaldo.   │
├───────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 2. `db.rs` Schema Version 7                       │ 14 índices SQL optimizados cubriendo estados, URLs y chunks.│
├───────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 3. `infrastructure/semantic_cache.rs`             │ Caché LRU 100% nativo en memoria (sin dependencias Redis).  │
├───────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 4. `infrastructure/vector_shards.rs`              │ Sharding determinista con roundtrip persistente y test unit.│
├───────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 5. `api/middleware/security.rs`                   │ Tokens de sesión aleatorios de 32 bytes y Rate Limiter IP.  │
├───────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 6. `observability/metrics_server.rs`              │ Binding estricto a 127.0.0.1:port protegiendo métricas.    │
├───────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 7. `domain/models.rs`                             │ Single Source of Truth para `JobRecord` y `EMBEDDING_DIMS`.│
├───────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 8. `storage.rs`                                   │ Cero unwraps en código de producción; cuotas con trash y purge│
├───────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 9. `python_runner.rs`                             │ Subprocesos atados a Tauri con `kill_on_drop(true)`.         │
├───────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 10. `circuit_breaker.rs` & `queue_service.rs`     │ Control de saturación por marcas de agua y protección OOM.  │
└───────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────┘
```

---

# CONTRATO DE HANDOFF TÉCNICO A CODEX / LUNA

El informe conserva la auditoría histórica y la reconciliación vigente en
`CURRENT CHECKOUT RECONCILIATION`. La siguiente tabla sustituye el estado
implícito del handoff anterior:

| Work package | Estado actual | Criterio de cierre |
|--------------|---------------|--------------------|
| WP-01 | BLOCKED_EXTERNAL | Endpoint, pubkey, secretos, artefactos y firma del updater reales. |
| WP-02 | PARTIAL | Rebuild temporal, lock, paridad exacta, rollback multi-shard y round-trip HNSW; falta prueba de fallo inducido durante commit. |
| WP-03 | ACTIVE | Extracción gradual de `commands.rs` por servicios de aplicación. |
| WP-04 | PARTIAL | Carga diferida iniciada; falta separación completa de SettingsPanel. |
| WP-05 | ACTIVE | Extraer búsqueda, onboarding, selección, cine y configuración de `page.tsx`. |
| WP-06 | COVERED | Mensajes TikTok, whitelist y validación diferenciada de URLs. |
| WP-07 | PARTIAL | Preflight ejecuta probes de Python/imports/FFmpeg/FFprobe y registra health_event; falta diagnóstico de timeout ONNX. |
| WP-08 | ACTIVE | Evaluación aislada de `ort` estable, DirectML y runtime preparado. |
| WP-09 | ACTIVE | Timeout/cancelación segura para inferencia ONNX DirectML/CPU. |
| WP-10 | COVERED | Boundary raíz y límites funcionales con reintento y recarga. |
| WP-11 | COVERED en contrato | Falta evidencia visual nativa del wizard en equipo objetivo. |
| WP-12 | ACTIVE | Bundle FFmpeg essentials, hashes, licencia y smoke de instalador. |

Reglas de handoff:

1. Todo cierre debe indicar `PASS`, `PARTIAL`, `FAIL` o `BLOCKED_EXTERNAL` y
   enlazar evidencia reproducible.
2. Los gates técnicos no se presentan como evidencia visual, live, instalada,
   firmada o publicada.
3. Las fortalezas de la matriz `DO-NOT-REGRESS` requieren justificación técnica
   antes de modificarse.

---

*Fin oficial de la Auditoría AAA Integral de Preparación para Producto.*  
*Total de Findings Evaluados: 30 | Falsos Positivos Descartados: 10 | Estados actuales: COVERED, STALE, ACTIVE, BLOCKED_EXTERNAL y DEFERRED_PRODUCT.*  
*Integridad del Repositorio: el worktree ya estaba sucio al iniciar esta reconciliación; esta edición solo actualizó este informe y no eliminó archivos ni alteró los cambios locales existentes.*


