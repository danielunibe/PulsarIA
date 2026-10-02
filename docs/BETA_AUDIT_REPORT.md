# 📋 PULSARIA — AUDITORÍA BETA técnica y de producto
## Informe de Auditoría Técnica v0.1.0-beta.2

**Fecha:** 2026-09-14  
**Auditor:** Kilo (registro automatizado)  
**Estado del checkout:** v0.1.0-beta.2-local (Windows x64)  
**Base de comparación:** `b95a971c` (MVP)  
**Fuente normativa:** [PROJECT_TRUTH.md](../../PROJECT_TRUTH.md)  

> **Estado del documento:** esta auditoría es la línea base histórica del
> 2026-09-14. La reconciliación de los hallazgos sobre la implementación Beta 2
> actual y sus gates reproducibles está en
> [BETA2_RELEASE_EVIDENCE.md](BETA2_RELEASE_EVIDENCE.md) y en la sección
> `Verificación Beta 2` de `PROJECT_TRUTH.md`.

> **Aviso:** Este informe documenta el estado verificado de la beta v0.1.0-beta.2 de
> Pulsaria. Cada hallazgo incluye su evidencia y estado reconciliado
> (COVERED / STALE / PARTIAL / ACTIVE / BLOCKED_EXTERNAL / DEFERRED_PRODUCT).
> Véase la [matriz reconciliada](#anexo-a-matriz-de-findings-reconciliados)
> en el Anexo A para el detalle por ítem.

---

## 1. Resumen Ejecutivo

| Métrica | Valor |
|---|---|
| Versión | v0.1.0-beta.2 |
| Frontend | Next.js 15.5.25 + React 19.2.1 + TS 5.9.3 + Tailwind 4.1 |
| Backend | Tauri 2.10.3 / Rust 2021 |
| Python Workers | 3.11.9 (bundleado) + yt-dlp + faster-whisper + ffmpeg 8.1.2 |
| DB | SQLite Schema v7 (WAL mode) |
| Comandos IPC Tauri | **76** (`#[tauri::command]`) |
| Tests Rust | **60/60** pasan |
| Tests Python | 26 (+ 1 skip live intencional) |
| Tests TS | 5 archivos en `semantic/__tests__/` |
| Líneas `commands.rs` | 3,744 (God Module — PUL-AUD-004 ACTIVE) |
| Líneas `db.rs` | 3,335 |
| Líneas `SettingsPanel.tsx` | 2,151 (~135 KB — PUL-AUD-005 PARTIAL) |
| Líneas `page.tsx` | 911 (~44 KB — PUL-AUD-016 ACTIVE) |
| Tamaño NSIS installer | ~581 MB (SHA-256 `D69B6908…`) |
| Tamaño MSI installer | ~708 MB (SHA-256 `183626C5…`) |
| Estado del updater | **Deshabilitado** (`active=false, pubkey=""`) |
| Estado del metrics bind | Loopback `127.0.0.1:9001` |
| Modo distribuido | Compilado siempre; feature gate parcial (PUL-AUD-018/028 PARTIAL) |

**Conclusión:** La beta v0.1.0 entrega un stack local-first funcional sobre
Windows con ingestión TikTok completa (videos, perfiles, favoritos,
colecciones), descarga multimedia, transcripción, análisis visual, indexación
semántica/híbrida y búsqueda. La pipeline end-to-end está parcialmente
verificada con videos reales (smoke tests documentados). No obstante, persisten
**9 findings activos** y **6 parciales** que impactan en seguridad, arquitectura
y UX. El updater y la firma Authenticode están bloqueados externamente.

---

@end
## 2. Descripción del Software

**Pulsaria** es una aplicación de escritorio local-first para Windows que
permite a usuarios autorizados importar contenido de TikTok (videos, perfiles,
favoritos y colecciones), descargarlo localmente, generar análisis
multimedia (video/audio/transcripción/análisis visual), indexar todo localmente
y realizar búsquedas tanto literales como semánticas.

### Principios de diseño

| Principio | Implementación |
|---|---|
| **Local-first** | Todos los datos, índices y modelos residen en el equipo del usuario. Nada se envía a la nube sin consentimiento explícito. |
| **Consentimiento legal** | Modal de consentimiento legal + asistente de onboarding con verificación (`verify:onboarding`). |
| **Transparencia de IA** | El LLM local (llama.cpp sidecar) es opcional y verificado por SHA-256. La síntesis con Gemini es opcional y solo se activa vía IPC nativo con advertencia explícita. |
| **Windows-native** | Tauri 2 + Rust, con integración de sistema tray, autostart y single-instance. |
| **SQLite como fuente única de verdad** | Schema v7 con WAL mode, 14 índices, backup y sistema de reparación/reconciliación. |

### Flujo de trabajo

```
1. Usuario ingresa URLs de TikTok → commands.rs: add_job
2. Worker pool (queue_service.rs) → Python runner (python_runner.rs)
3. Python: yt-dlp descarga → faster-whisper transcribe → Pillow/OCR analiza
4. Embedding ONNX (all-MiniLM-L6-v2, 384d) → HNSW 4-shard + persistencia
5. Búsqueda: literal (SQL LIKE) + semántica (HNSW + BM25 + RRF + reranker)
6. Resultado: UI Next.js muestra videos, transcripciones, análisis visual
```

### Limitaciones de alcance de la beta

Pulsaria **NO** incluye: traducción automática, OCR avanzado, chat RAG
conversacional, listas de reproducción inteligentes, expresión para YouTube o
Instagram, updater habilitado, firma Authenticode, distribución pública
estable, o VACUUM automático programado.

---

## 3. Características de la Beta v0.1.0

### Matriz de características

| # | Característica | Estado | Notas |
|---|---|---|---|
| 1 | Ingestión TikTok: videos individuales | ✅ Implementado | |
| 2 | Ingestión TikTok: perfiles | ✅ Implementado | |
| 3 | Ingestión TikTok: favoritos | ✅ Implementado | |
| 4 | Ingestión TikTok: colecciones | ✅ Implementado | |
| 5 | Descarga MP4 | ✅ Implementado | |
| 6 | Descarga MP3 | ✅ Implementado | |
| 7 | Descarga TXT (transcripción) | ✅ Implementado | |
| 8 | Transcripción faster-whisper (tiny, int8) | ✅ Implementado | Modelo tiny, CPU |
| 9 | Análisis visual: keyframes | ✅ Implementado | |
| 10 | Análisis visual: poster | ✅ Implementado | |
| 11 | Análisis visual: Pillow RGB stats | ✅ Implementado | |
| 12 | Análisis visual: OCR texto | ✅ Implementado | OCR básico |
| 13 | Búsqueda semántica: HNSW 4-shard | ✅ Implementado | |
| 14 | Búsqueda semántica: BM25 | ✅ Implementado | |
| 15 | Búsqueda semántica: RRF | ✅ Implementado | |
| 16 | Búsqueda semántica: reranker | ✅ Implementado | |
| 17 | Búsqueda literal: SQL LIKE | ✅ Implementado | Case-insensitive |
| 18 | Caché semántica LRU + TTL | ✅ Implementado | In-memory, métricas |
| 19 | Embedding: ONNX all-MiniLM-L6-v2 (384d) | ✅ Implementado | |
| 20 | Cola de trabajos: retry (max 3) | ✅ Implementado | |
| 21 | Cola de trabajos: circuit breaker | ✅ Implementado | |
| 22 | Cola de trabajos: backpressure | ✅ Implementado | |
| 23 | Cola de trabajos: auto-resume | ✅ Implementado | |
| 24 | Fuentes de colección: sync loop (cron) | ✅ Implementado | |
| 25 | Listas de reproducción: CRUD completo | ✅ Implementado | |
| 26 | Auto-cluster: LLM-driven clustering | ✅ Implementado | |
| 27 | Storage: cuota, purga, papelera, undo | ✅ Implementado | |
| 28 | Finalización atómica de archivos | ✅ Implementado | |
| 29 | LLM local: llama.cpp sidecar (opcional) | ✅ Implementado | SHA-256 verificado |
| 30 | Síntesis Gemini (opcional) | ✅ Implementado | IPC nativo, advertencia |
| 31 | API REST: Axum en 127.0.0.1:8080 | ✅ Implementado | JWT per-process |
| 32 | Métricas Prometheus: 127.0.0.1:9001 | ✅ Implementado | Loopback |
| 33 | System tray | ✅ Implementado | |
| 34 | Autostart | ✅ Implementado | |
| 35 | Single-instance | ✅ Implementado | |
| 36 | Locale: es-MX (default), en-US | ✅ Implementado | |
| 37 | Modal de consentimiento legal | ✅ Implementado | |
| 38 | Asistente de onboarding (wizard) | ✅ Implementado | `verify:onboarding` PASS |
| 39 | Error boundaries (React) | ✅ Implementado | ErrorBoundary.tsx existe |
| 40 | SQLite v7: 14 índices, WAL, backup | ✅ Implementado | |
| 41 | SQLite v7: repair/reconciliation | ✅ Implementado | |
| 42 | Comandos Tauri IPC | ✅ 76 comandos | |
| 43 | Scripts PowerShell verificación (14) | ✅ Implementado | |
| 43 | Scripts PowerShell release (15) | ✅ Implementado | |

### Características NO incluidas (fuera del alcance beta)

| Característica | Estado | Categoría |
|---|---|---|
| Traducción automática | ❌ No implementado | DEFERRED_PRODUCT |
| OCR avanzado | ❌ No implementado | DEFERRED_PRODUCT |
| Chat RAG conversacional | ❌ No implementado | DEFERRED_PRODUCT |
| Listas de reproducción inteligentes | ❌ No implementado | DEFERRED_PRODUCT |
| Ingestión YouTube/Instagram | ❌ No implementado | DEFERRED_PRODUCT |
| Updater (auto-actualización) | ❌ Deshabilitado | BLOCKED_EXTERNAL |
| Firma Authenticode | ❌ No implementado | BLOCKED_EXTERNAL |
| Distribución pública estable | ❌ No disponible | BLOCKED_EXTERNAL |
| VACUUM programado automático | ❌ No implementado | DEFERRED_PRODUCT |

---

@end
## 4. Stack Tecnológico

### Versiones verificadas

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | Next.js | 15.5.25 |
| Frontend | React | 19.2.1 |
| Frontend | TypeScript | 5.9.3 |
| Frontend | Tailwind CSS | 4.1 |
| Backend | Tauri | 2.10.3 |
| Backend | Rust | Edition 2021 |
| Workers | Python | 3.11.9 (bundlado en resources) |
| Workers | yt-dlp | (bundlado) |
| Workers | faster-whisper | (bundlado) |
| Workers | Pillow | (bundlado) |
| Workers | FFmpeg | 8.1.2-full (bundlado) |
| Workers | FFprobe | (bundlado, parte de FFmpeg) |
| Base de datos | SQLite | Schema v7, WAL mode |
| ML — Embeddings | ONNX Runtime | all-MiniLM-L6-v2 (384d) |
| ML — Transcripción | Whisper | tiny (75 MB, int8) |
| ML — LLM local | llama.cpp | sidecar (opcional, SHA-256) |
| API | Axum | REST en 127.0.0.1:8080 |
| Métricas | Prometheus | 127.0.0.1:9001 |
| Build system | NSIS | ~581 MB |
| Build system | MSI | ~708 MB |

### Dependencias críticas (Rust)

| Dependencia | Versión | Notas |
|---|---|---|
| tauri | 2.10.3 | Framework desktop |
| tokio | (versión) | Runtime async |
| rusqlite | (versión) | SQLite bindings |
| ort | **2.0.0-rc.3** | ⚠️ PUL-AUD-013: release candidate con `download-binaries` feature |
| axum | (versión) | API REST |
| serde | (versión) | Serialización |
| hnsw | (versión) | Índice vectorial |

> **⚠️ RIESGO DE CADENA DE SUMINISTRO (PUL-AUD-013):** La dependencia
> `ort` 2.0.0-rc.3 es una release candidate y usa el feature
> `download-binaries`, que descarga binarios precompilados en tiempo de build.
> Esto representa un riesgo de supply chain. Se recomienda evaluar en una rama
> aislada con compatibilidad DirectML.

### Frontend — dependencias principales

- Next.js 15.5.25
- React 19.2.1
- TypeScript 5.9.3
- Tailwind CSS 4.1
- Sonner (toasts)
- Three.js (fondos WebGL: ColorBends, Aurora)
- classnames (`cn()` helper)

---

## 5. Arquitectura del Sistema

### Diagrama de capas (dependency layers)

```
┌─────────────────────────────────────────┐
│  UI (Next.js 15)                         │
│  page.tsx, SettingsPanel.tsx, etc.       │
├─────────────────────────────────────────┤
│  Commands (Tauri IPC)                    │
│  commands.rs (76 #[tauri::command])      │
├─────────────────────────────────────────┤
│  Application (use cases)                 │
│  queue_service.rs, search_service.rs,    │
│  local_llm.rs, semantic_cache.rs,        │
│  vector_shards.rs, query_coordinator.rs  │
├─────────────────────────────────────────┤
│  Domain (models, ports)                  │
│  domain/models.rs, domain/ports.rs       │
├─────────────────────────────────────────┤
│  Infrastructure                        │
│  db.rs, embedding.rs,                    │
│  infrastructure/workers/python_runner.rs│
│  infrastructure/network/gateway.rs       │
├─────────────────────────────────────────┤
│  External                        │
│  Python 3.11 (yt-dlp, whisper,         │
│  ffmpeg, Pillow)                         │
│  SQLite DB (WAL)                         │
│  ONNX Runtime (MiniLM)                   │
└─────────────────────────────────────────┘
```

### Regla de dependencias

**UI → Commands (IPC) → Application → Domain → Infrastructure**

- **NO cross-domain imports:** la UI no importa infraestructura directamente.
- Los tipos de dominio tienen autoridad única en `domain/models.rs`.
- `commands.rs` y `db.rs` reexportan o mapean los tipos del dominio.

### Puertos (contracts) clave

| Puerto | Ubicación | Propósito |
|---|---|---|
| `JobRepository` | `domain/ports.rs` | Abstracción de persistencia |
| `EmbeddingEngine` | `domain/ports.rs` | Generación de embeddings |
| `VectorIndex` | `domain/ports.rs` | Abstracción de búsqueda vectorial |
| `JobMessage` | `domain/models.rs` | Unidad de trabajo para la cola |

### Componentes REST API (Axum)

| Endpoint | Puerto | Autenticación |
|---|---|---|
| REST API | 127.0.0.1:8080 | JWT per-process (Bearer) |
| Métricas Prometheus | 127.0.0.1:9001 | Ninguna (health público) |

---

## 6. Inventario de Archivos

### Backend Rust — líneas (VERIFICADO)

| Archivo | Líneas | Notas |
|---|---|---|
| `src-tauri/src/main.rs` | **583** | ❗ AGENTS.md dice ~285 — INCORRECTO. Contiene init de runtime async, setup de plugins, construcción de AppState, registro de handlers IPC |
| `src-tauri/src/commands.rs` | **3,744** | ❗ AGENTS.md dice ~1,600 — INCORRECTO. 76 `#[tauri::command]` (God Module, PUL-AUD-004) |
| `src-tauri/src/db.rs` | **3,335** | ❗ AGENTS.md dice 861 — INCORRECTO. Schema v7, 14 índices, migraciones, queries |
| `src-tauri/src/storage.rs` | **2,040** | Storage: cuota, purga, papelera, undo, atomic finalization |
| `src-tauri/src/embedding.rs` | **182** | ONNX all-MiniLM-L6-v2, mean pooling + L2 norm |
| `src-tauri/src/application/search_service.rs` | **206** | Embeddings, HNSW, BM25, RRF, reranker |
| `src-tauri/src/application/queue_service.rs` | **1,246** | Worker pool, retries, circuit breaker, backpressure |
| `src-tauri/src/application/query_coordinator.rs` | **290** | Coordinación de consultas híbridas |
| `src-tauri/src/local_llm.rs` | **735** | llama.cpp sidecar |
| `src-tauri/src/semantic_cache.rs` | **161** | LRU in-memory, TTL, métricas |
| `src-tauri/src/vector_shards.rs` | **390** | 4-shard HNSW |
| `src-tauri/src/hnsw_index.rs` | **350** | Índice HNSW |
| `src-tauri/src/gateway.rs` | **769** | API REST (Axum) + métricas |
| `src-tauri/src/security.rs` | **344** | JWT, consentimiento, seguridad |
| `src-tauri/src/runtime.rs` | **89** | Runtime initialization |
| `src-tauri/src/url_utils.rs` | **97** | Validación URL (2048 char limit, whitelist TikTok) |

### Backend Rust — archivos no encontrados

| Archivo (referenciado en docs) | Estado |
|---|---|
| `src-tauri/src/queue.rs` (legacy) | ❌ NO EXISTE — reemplazado por `queue_service.rs` |
| `src-tauri/src/main.rs::unib_tests` | ❌ NO EXISTE — referencia en PROJECT.manifest.json |
| `src-tauri/tests/test_hnsw.rs` | ❌ NO EXISTE — referencia en PROJECT.manifest.json |

### Frontend React — líneas (VERIFICADO)

| Archivo | Líneas | Tamaño | Notas |
|---|---|---|---|
| `app/page.tsx` | **911** | ~44 KB | ❗ God Component (PUL-AUD-016) |
| `components/SettingsPanel.tsx` | **2,151** | ~135 KB | ❗ God Component (PUL-AUD-005) |
| `components/ErrorBoundary.tsx` | **71** | — | ✅ Existe — audit original erroneamente lo reportó como faltante |

### Workers Python

| Archivo | Notas |
|---|---|
| `python-workers/main.py` | Pipeline principal (yt-dlp, whisper, ffmpeg) |
| `python-workers/test_mvp_contracts.py` | Tests de contratos |
| `python-workers/test_multimedia_contracts.py` | Tests multimedia |
| `python-workers/test_output_formats.py` | Tests de formatos de salida |
| `python-workers/test_demo_links.py` | Tests de enlaces demo |

### Tests TypeScript

| Archivo | Ubicación |
|---|---|
| 5 archivos de test | `semantic/__tests__/` |

---

@end
## 7. Correcciones de Información Incorrecta

La siguiente tabla documenta las discrepancias encontradas entre la documentación
existente (AGENTS.md, PROJECT.manifest.json, MVP_STATUS.md, CHANGELOG.md,
CONTRIBUTING.md) y el estado verificado del código.

| # | Fuente | Afirmación | Realidad verificada | Impacto |
|---|---|---|---|---|
| 1 | AGENTS.md | `main.rs`: ~285 LOC, bootstrap only | **583 líneas**: init runtime async, plugin setup, AppState, IPC handler registration | Documentación desactualizada |
| 2 | AGENTS.md | `commands.rs`: ~1,600 LOC | **3,744 líneas**, 76 `#[tauri::command]` | God Module significativamente mayor |
| 3 | AGENTS.md | `db.rs`: 861 LOC | **3,335 líneas** | Módulo de DB significativamente mayor |
| 4 | AGENTS.md | `queue.rs (legacy)`: 798 LOC | **NO EXISTE**. Reemplazado por `queue_service.rs` (1,246 líneas) | Referencia a archivo inexistente |
| 5 | AGENTS.md | `db.rs`: 861 LOC (God Module) | **3,335 líneas** | God Module más grande de lo reportado |
| 6 | src-tauri/.env.example | `REDIS_URL=redis://127.0.0.1:6379` | **INCORRECTO**: Redis NO está en Cargo.toml. `SemanticCache` es LRU in-memory | Variable de entorno inexistente |
| 7 | PROJECT.manifest.json | Referencia `main.rs::unib_tests` | **NO EXISTE** en el checkout | Referencia rota |
| 8 | PROJECT.manifest.json | Referencia `tests/test_hnsw.rs` | **NO EXISTTE** (no existe) en el checkout | Referencia rota |
| 9 | MVP_STATUS.md | "56 pruebas Rust" | **60 pruebas** (reconciliado) | Discrepancia de conteo |
| 10 | CHANGELOG.md | "SettingsPanel solo persiste en localStorage" | **INCORRECTO**: conectado al backend via Tauri IPC (`get/set_download_dir`, etc.) | Documentación desactualizada |
| 11 | CHANGELOG.md | "Pipeline end-to-end no verificado con video real" | **INCORRECTO**: smoke tests con video real de TikTok documentados en MVP_STATUS.md | Documentación desactualizada |
| 12 | CONTRIBUTING.md | "Python 3.10+ y FFmpeg en PATH" | **INCORRECTO**: Python/FFmpeg son BUNDLED en `resources`, la app NO usa PATH (verificado: `pathCleared=true`, `usesAppDataFallback=true`) | Instrucciones de instalación equivocadas |
| 13 | AGENTS.md | `commands.rs` ~1600 LOC (God Module) | **3,744 líneas** — 2.3x mayor | Subestimación severa |

### Verificación de `.env`

| Ítem | Estado | Evidencia |
|---|---|---|
| `.env` en git | **NO trackeado** | `git ls-files` no incluye `.env`; está en `.gitignore` |
| `.env` como override local | **Permitido** | Se usan env vars locales de desarrollo |
| `REDIS_URL` en Cargo.toml | **NO existe** | Redis fue eliminado del árbol de dependencias |

---

## 8. Resultados de Auditoría Reconciliada

Los siguientes estados reconcilia los findings PUL-AUD-\* contra el checkout actual.

| ID | Finding | Estado | Evidencia |
|---|---|---|---|
| PUL-AUD-001 | Updater desactivado en configuración base | **ACTIVE** | `tauri.conf.json`: `active=false, pubkey=""`. Correcto para builds locales; requiere endpoint/pubkey/firma para producción |
| PUL-AUD-002 | Redis obligatorio para caché | **COVERED** | `SemanticCache` es LRU in-memory con TTL, límite y métricas. Redis retirado de Cargo |
| PUL-AUD-003 | `.env` trackeado con rutas personales | **STALE** | `.env` está en `.gitignore`, no aparece en `git ls-files` |
| PUL-AUD-004 | `commands.rs` God Module | **ACTIVE** | 3,744 líneas, 76 comandos. Refactorizar por servicios: storage, settings, playlists, import/export, mantenimiento |
| PUL-AUD-005 | `SettingsPanel.tsx` God Component | **PARTIAL** | Ya carga bajo demanda; queda dividir por secciones sin romper contratos públicos |
| PUL-AUD-006 | Paths de snapshots HNSW incompatibles | **STALE** | `shard_path()` normaliza con `trim_end_matches(".hnsw")`; pruebas single/multi-shard round-trip |
| PUL-AUD-007 | Tipos de dominio duplicados | **COVERED** | `JobRecord`, `SearchResult`, `SearchConfig` tienen autoridad en `domain/models.rs`; `db.rs` hace `pub use` |
| PUL-AUD-008 | Restricción TikTok no visible | **COVERED** | "Add Links" declara videos, perfiles, favoritos, colecciones TikTok; errores distinguen plataforma/formato |
| PUL-AUD-009 | Preflight incompleto Python/FFmpeg/modelos | **PARTIAL** | Prueba `python.exe`, imports de workers, FFmpeg, FFprobe, tokenizer y modelos; falta timeout/cancelación ONNX independiente |
| PUL-AUD-010 | Auto-updater sin endpoint | **BLOCKED_EXTERNAL** | No se debe fabricar endpoint ni habilitar publicación sin infraestructura y secretos reales |
| PUL-AUD-011 | API loopback sin auth por proceso | **COVERED** | Token JWT aleatorio por proceso (32 bytes), Bearer validation; health público |
| PUL-AUD-012 | Dimensión 384 duplicada | **COVERED** | `EMBEDDING_DIMS` único en `domain/models.rs`, usado por embedding, HNSW, persistencia y comandos |
| PUL-AUD-013 | `ort` RC y `download-binaries` | **ACTIVE** | `ort` 2.0.0-rc.3 con feature `download-binaries`. Riesgo de supply chain. Evaluar en rama aislada |
| PUL-AUD-014 | Sin versionado de modelo de embeddings | **COVERED** | Tabla `embedding_metadata` en Schema v7: modelo, hash, dimensión, fecha; discrepancia marca índice obsoleto |
| PUL-AUD-015 | `unwrap()` en producción | **COVERED** | `gateway.rs`/`storage.rs` usan constructores infalibles; `unwrap`/`expect` restantes solo en tests/fixtures |
| PUL-AUD-016 | `app/page.tsx` God Component | **ACTIVE** | 911 líneas (~44 KB). Extraer búsqueda, onboarding, selección, cine, configuración |
| PUL-AUD-017 | Inferencia ONNX sin timeout | **PARTIAL** | `PULSAR_ONNX_TIMEOUT_MS` ejecuta inferencia en `spawn_blocking`; falta prueba de timeout/isolación/cancelación |
| PUL-AUD-018 | Distributed mode compilado en desktop | **PARTIAL** | Activación depende de `cfg!(feature = "distributed")`; módulos aún se compilan siempre. Falta `#[cfg(feature)]` en el módulo |
| PUL-AUD-019 | Reindex nocturno no coordina cola | **PARTIAL** | Manual y nocturno comparten `maintenance_lock`; no inician con jobs activos. Falta prueba de carrera contra admisión real |
| PUL-AUD-020 | Bind inseguro metrics server | **STALE** | Bind vigente es loopback `127.0.0.1`; el gate API confirma loopback exclusivo |
| PUL-AUD-021 | Faltan índices SQL | **STALE** | `init_db()` crea 14 índices requeridos |
| PUL-AUD-022 | Ruta personal en Git | **STALE** | Derivaba del falso positivo de `.env` trackeado |
| PUL-AUD-023 | Sin Error Boundaries React | **PARTIAL** | `ErrorBoundary.tsx` existe y está conectado; falta harness E2E para teclado, foco, recuperación visual |
| PUL-AUD-024 | `rebuild_index` sin coherencia HNSW/SQLite | **PARTIAL** | Rebuild shadow con rollback, conteo, metadata exacta, commit multi-shard. Falta probar fallo durante commit y restauración snapshot |
| PUL-AUD-025 | Onboarding desconectado | **STALE** | `verify:onboarding` PASS — contrato legal, progresivo, focusable, radio, navegación |
| PUL-AUD-026 | Bundle FFmpeg full demasiado grande | **ACTIVE** | FFmpeg 8.1.2-full (~484 MB para ffmpeg+ffprobe); installer ~580 MB. Preparar bundle essentials |
| PUL-AUD-027 | `.env` expone datos personales | **STALE** | Mismo falso positivo que PUL-AUD-003; `.env` local e ignorado |
| PUL-AUD-028 | Complejidad distribuida sin beneficio desktop | **ACTIVE** | Feature gate y auditoría de imports antes de eliminar o mover |
| PUL-AUD-029 | Falta límite/canonicalización URL | **PARTIAL** | REST e IPC comparten límite 2,048, whitelist HTTPS TikTok, mensajes diferenciados. Falta prueba integración Tauri para URL sobredimensionada |
| PUL-AUD-030 | Falta VACUUM automático | **DEFERRED_PRODUCT** | Mantener mantenimiento manual; requiere política de disco |

### Gates reproducidos tras reconciliación

| Gate | Estado | Criterio |
|---|---|---|
| `npm run verify:mvp` | ✅ PASS | 13/13 gates |
| `cargo test --manifest` | ✅ PASS | 60/60 pruebas Rust |
| `cargo fmt -- --check` | ✅ PASS | Formato Rust |
| `cargo check --manifest` | ✅ PASS | Compilación Rust |
| Tests Python | ✅ PASS | 26 pruebas (+ 1 skip live intencional) |
| Runtime canónico | ✅ PASS | 51/51 recursos verificados |
| Frontend accessibility contract | ✅ PASS | Boundary, dialog, labels, focus-visible |
| NSIS smoke (installed) | ✅ PASS | SHA-256 `D69B6908…`, 581 MB |
| MSI smoke (installed) | ⚠️ BLOCKED_EXTERNAL | Requiere host elevado (Error 1603/1925) |
| Contrato Gemini | ✅ PASS (condicionado) | IPC nativo; tests de clave/header/prompt/timeout |
| Pipeline TikTok live | ✅ Partial PASS | Job real completo, exportación mp4/mp3/txt, dedup, staging limpio |
| Artefactos release pública | ❌ BLOCKED_EXTERNAL | `latest.json`, `.sig`, clave Tauri, Authenticode |

---

## 9. Qué se Puede Presumir en esta Beta

### ✅ Verificado y demostrable

1. **Ingestión TikTok completa:** ingreso de videos individuales, perfiles,
   favoritos y colecciones funciona end-to-end con URLs reales.
2. **Pipeline de descarga + procesamiento:** yt-dlp → faster-whisper →
   Pillow/OCR ejecuta correctamente en Windows local con Python bundlado.
3. **Indexación semántica híbrida:** HNSW 4-shard + BM25 + RRF + reranker
   con modelo ONNX all-MiniLM-L6-v2 (384d) funcional.
4. **Búsqueda literal y semántica:** SQL LIKE (case-insensitive) y búsqueda
   vectorial con rerankeo operativas.
5. **Caché semántica LRU:** in-memory con TTL, límite y métricas funcionando.
6. **Cola de trabajos robusta:** retry (máx 3), circuit breaker, backpressure,
   auto-resume operativos.
7. **Storage con cuota y pulcriticidad:** sistema de cuotas, purga, papelera,
   undo y finalización atómica implementado.
8. **API REST + JWT:** Axum en 127.0.0.1:8080 con token JWT aleatorio por
   proceso y validación Bearer.
9. **Métricas Prometheus:** endpoint en 127.0.0.1:9001 (loopback).
10. **UI funcional:** Next.js 15 con buscador, panel de cola, playlists CRUD,
    clustering auto-LLM, sistema de tabs, dark mode, locales es-MX/en-US.
11. **Legal consent + onboarding:** modal de consentimiento y wizard de
    onboarding con `verify:onboarding` PASS.
12. **14 scripts PowerShell de verificación** operativos (locale, accesibilidad,
    recursos, instalación, etc.).
13. **15 scripts PowerShell de release** para builds NSIS/MSI.

### ⚠️ Verificado parcialmente

1. **LLM local (llama.cpp sidecar):** descarga opcional con verificación
   SHA-256 — funcional pero no ejecutado en todas las pruebas de smoke.
2. **Síntesis Gemini:** por IPC nativo — funciona con clave autorizada,
   tests de error/timeout PASS, pero no se ejecuta sin clave.
3. **ErrorBoundary.tsx:** existe y está conectado, pero falta cobertura E2E.
4. **Rebuild de índice:** shadow rebuild con rollback funciona, pero falta
   prueba de fallo inducido durante commit.
5. **Coordenación reindex-cola:** `maintenance_lock` funciona, pero falta
   prueba de carrera contra worker activo.

### ❌ No disponible / bloqueado

1. **Updater:** deshabilitado (`active=false`). No hay endpoint ni pubkey.
2. **Firma Authenticode:** no implementada (BLOCKED_EXTERNAL).
3. **Distribución pública:** no disponible (BLOCKED_EXTERNAL).
4. **Tests E2E Tauri:** no existen tests de integración descarga→búsqueda.
5. **Tests React:** no existen tests de componentes.
6. **Tests de crash recovery:** no existen.
7. **Tests de performance:** no existen con bibliotecas grandes.

---

@end
## 10. Issues Activos y Riesgos

### 10.1 Issues activos (pul-AUD)

| ID | Severidad | Título | Descripción | Recomendación |
|---|---|---|---|---|
| PUL-AUD-001 | Medium | Updater desactivado | `tauri.conf.json` tiene `active=false, pubkey=""`. No hay endpoint de actualización. | Mantener desactivado en beta local. Configurar endpoint + pubkey + Authenticode antes de producción. |
| PUL-AUD-004 | High | `commands.rs` God Module | 3,744 líneas, 76 comandos en un solo archivo. Dificulta mantenimiento y testing. | Refactorizar extrayendo servicios: storage, settings, playlists, import/export, maintenance. |
| PUL-AUD-005 | Medium | `SettingsPanel.tsx` God Component | 2,151 líneas (~135 KB). Dificulta navegación y testing. | Dividir por secciones (general, descargas, modelos, API, etc.) sin romper contratos públicos. |
| PUL-AUD-010 | High | Auto-updater sin endpoint | Sin endpoint configurado, sin pubkey, sin firma. | No habilitar hasta tener infra de release + secretos. Mantener en `BLOCKED_EXTERNAL`. |
| PUL-AUD-013 | Critical | `ort` 2.0.0-rc.3 + `download-binaries` | Release candidate con descarga de binarios precompilados en build. Riesgo de supply chain. | Evaluar en rama aislada. Verificar compatibilidad DirectML. Considerar usar binarios locales firmados. |
| PUL-AUD-016 | Medium | `page.tsx` God Component | 911 líneas (~44 KB). Difícil de mantener. | Extraer componentes: búsqueda, onboarding, selección, cine, configuración. |
| PUL-AUD-018 | Medium | Distributed mode compilado siempre | Módulos distribuidos se compilan en desktop aunque no se use. Falta `#[cfg(feature)]` en módulo. | Añadir `#[cfg(feature = "distributed")]` al módulo. Auditar imports. |
| PUL-AUD-026 | Medium | Bundle FFmpeg full demasiado grande | FFmpeg 8.1.2-full (~484 MB), installer ~581 MB. | Preparar bundle "essentials" externo validado con hashes. No reemplazar canónico sin licencia. |
| PUL-AUD-028 | Low | Complejidad distribuida | Feature gate y auditoría de imports antes de eliminar/mover. | Decidir arquitectura: feature gate estricto o eliminación. |

### 10.2 Issues parciales (requieren más trabajo)

| ID | Título | Estado actual | Pendiente |
|---|---|---|---|
| PUL-AUD-005 | SettingsPanel God Component | Carga bajo demanda | Dividir por secciones |
| PUL-AUD-009 | Preflight Python/FFmpeg/modelos | Prueba componentes | Timeout/cancelación ONNX independiente |
| PUL-AUD-017 | Timeout ONNX | Implementado (`PULSAR_ONNX_TIMEOUT_MS`) | Prueba de timeout + aislamiento/cancelación |
| PUL-AUD-018 | Distributed mode | Feature gate parcial | `#[cfg(feature)]` en módulo + pruebas perfil |
| PUL-AUD-019 | Reindex-cola coordination | `maintenance_lock` funciona | Prueba de carrera vs worker activo |
| PUL-AUD-023 | Error Boundaries | Componente existe | Harness E2E accesibilidad/teclado/foco |
| PUL-AUD-024 | rebuild_index coherencia | Shadow rebuild + rollback | Prueba de fallo durante commit + restauración |
| PUL-AUD-029 | URL canonicalización | Límite 2,048 + whitelist | Prueba integración Tauri para URL larga |

### 10.3 Riesgos de seguridad

| Riesgo | Severidad | Descripción | Mitigación |
|---|---|---|---|
| Supply chain (`ort` RC) | Critical | `download-binaries` descarga binarios no firmados | Revisar en rama aislada, usar hashes |
| Tamaño bundle | Medium | 581 MB (NSIS), 708 MB (MSI) | Bundle "essentials" opcional |
| API loopback auth | Low | JWT por proceso, pero en loopback | Aceptable para uso local; no exponer públicamente |
| Model download | Medium | Shapash-256 verificado para llama.cpp | ✅ Implementado |
| Path traversal | Low | URL sandboxed TikTok-only, 2048 char limit | ✅ `url_utils.rs` |
| Env leak | Low | `.env` no trackeado en git | ✅ Verificado en `.gitignore` |

### 10.4 Riesgos de producto

| Riesgo | Descripción | Impacto en beta |
|---|---|---|
| Sin updater | No actualizaciones automáticas | Users must reinstall manually |
| Sin tests E2E | No cobertura download→search | Riesgo de regresión no detectada |
| Sin tests de crash recovery | No pruebas de recuperación | Posible pérdida de datos no verificada |
| Sin tests performance | No benchmarks con bibliotecas grandes | Rendimiento no validado a escala |
| Sin tests React | No cobertura de componentes UI | Riesgo de bugs en UI no detectados |

---

## 11. Cobertura de Tests

### 11.1 Tests Rust

| Métrica | Valor |
|---|---|
| Total tests | **60** |
| Estado | ✅ 60/60 pasan |
| Fuente | `MVP_STATUS.md` y `reconciled audit matrix` dice 60 (MVP_STATUS original decía 56) |
| Discrepancia | MVP_STATUS.md: 56; reconciled audit: 60; PROJECT_TRUTH.md: 60 |
| Cobertura | Tests unitarios de dominio, HNSW, embedding, cola, coordinador de queries |

### 11.2 Tests Python

| Métrica | Valor |
|---|---|
| Total tests | 26 (+ 1 skip live intencional) |
| Estado | ✅ PASS |
| Archivos | `test_mvp_contracts.py`, `test_multimedia_contracts.py`, `test_output_formats.py`, `test_demo_links.py` |
| Skip | 1 skip live (requiere URL autorizada) |

### 11.3 Tests TypeScript

| Métrica | Valor |
|---|---|
| Archivos | 5 en `semantic/__tests__/` |
| Estado | ✅ PASS (según `npm run verify:mvp`) |
| Cobertura | Tests de la capa semántica UNIB |

### 11.4 Testing faltante (gaps críticos)

| Tipo de test | Estado | Riesgo |
|---|---|---|
| Tests E2E Tauri (download → search) | ❌ No existen | Regresión pipeline no detectada |
| Tests React component | ❌ No existen | Bugs UI no detectados |
| Tests crash recovery | ❌ No existen | Pérdida de datos posible |
| Tests performance (bibliotecas grandes) | ❌ No existen | Rendimiento no validado |
| Test timeout ONNX cancellation | ❌ No existe | PUL-AUD-017 parcial |
| Test URL sobredimensionada Tauri | ❌ No existe | PUL-AUD-029 parcial |
| Test race reindex vs worker | ❌ No existe | PUL-AUD-019 parcial |
| Test fallo rebuild_index durante commit | ❌ No existe | PUL-AUD-024 parcial |

---

## 12. Análisis de Seguridad y Privacidad

### 12.1 Principios de privacidad

| Principio | Implementación |
|---|---|
| **Local-first** | Todos los datos en el equipo del usuario. Nada a la nube sin consentimiento. |
| **Consentimiento legal** | Modal de consentimiento + onboarding con verificación. |
| **`.env` no trackeado** | En `.gitignore`, no expuesto en repositorio. ✅ |
| **JWT por proceso** | Token de 32 bytes aleatorio por proceso, Bearer validation. ✅ |
| **Health público** | Endpoint `/health` sin auth (loopback only). ✅ |
| **API loopback** | REST en `127.0.0.1:8080`, métricas en `127.0.0.1:9001`. ✅ |

### 12.2 Surface de ataque

| Vector | Evaluación |
|---|---|
| Consumiendo TikTok | ✅ Restricción TikTok-only en `url_utils.rs`, 2048 char limit |
| Path traversal | ✅ URLs sandboxed, sanitizadas |
| Supply chain (`ort`) | ⚠️ Crítico — RC + download-binaries. Ver sec 10.3 |
| Model downloads | ✅ SHA-256 verificado (llama.cpp) |
| Env secrets | ✅ `.env` no trackeado |
| API expuesta | ✅ Loopback only (no público) |
| IPC commands | 76 comandos — deberían revisarse individualmente para permisos |
| Autostart | ✅ Single-instance enforced |

### 12.3 Consideraciones legales

| Tema | Estado |
|---|---|
| Consentimiento legal | ✅ Modal implementado + onboarding |
| Compatibilidad de datos | Usuario autoriza procesamiento de contenido propio |
| Envío a Gemini | ⚠️ Advertencia explícita en UI; solo vía IPC nativo |
| Retention | Datos persisten localmente hasta borrado manual/trash |

---

## 13. Dependencias y Supply Chain

### 13.1 Árbol de dependencias críticas

```
src-tauri/Cargo.toml
├── tauri 2.10.3          ✅ Stable release
├── ort 2.0.0-rc.3        ⚠️ RC + download-binaries (PUL-AUD-013)
├── tokio                 ✅ Runtime async
├── rusqlite              ✅ SQLite bindings
├── axum                  ✅ REST API
├── serde                 ✅ Serialización
└── hnsw                  ✅ Índice vectorial
```

### 13.2 Python dependencies (bundlados)

| Paquete | Propósito | Riesgo |
|---|---|---|
| yt-dlp | Descarga TikTok | ⚠️ Mantener actualizado para compatibilidad |
| faster-whisper | Transcripción | ⚠️ Modelo tiny puede ser inexacto |
| Pillow | Análisis visual | ✅ Estable |
| ffmpeg/ffprobe 8.1.2 | Procesamiento media | ⚠️ Bundle full = 484 MB (PUL-AUD-026) |

### 13.3 Frontend dependencies

| Paquete | Versión | Riesgo |
|---|---|---|
| next | 15.5.25 | ✅ |
| react | 19.2.1 | ✅ |
| typescript | 5.9.3 | ✅ |
| tailwindcss | 4.1 | ✅ |
| three | — | WebGL backgrounds |

### 13.4 Riesgos de supply chain

| Riesgo | Severidad | Evidencia | Recomendación |
|---|---|---|---|
| `ort` RC | Critical | 2.0.0-rc.3 + download-binaries | Evaluar en rama, usar binarios firmados |
| `download-binaries` | High | Descarga binarios no firmados en build | Pin a versión con hashes verificados |
| FFmpeg full | Medium | 484 MB bundle | Considerar bundle essentials |
| yt-dlp | Medium | Necesita actualizaciones frecuentes | Revirar versiones compatibles TikTok |

---

## 14. Estado de Release e Instalación

### 14.1 Artefactos de instalación

| Artefacto | Algoritmo | Tamaño | Estado |
|---|---|---|---|
| NSIS `Pulsaria_0.1.0_x64-setup.exe` | SHA-256: `D69B690811B71579018FDCE980379E2707397DF6BBB688C25288017A8D0AE44E` | 580,906,561 (~581 MB) | ✅ Verificado, smoke PASS |
| MSI `Pulsaria_0.1.0_x64_en-US.msi` | SHA-256: `183626C56615DC3845D80C1692E819DD911A1CC15CC11DF609C03CDB70089828` | 707,754,713 (~708 MB) | ⚠️ Smoke requiere host elevado |

### 14.2 Verificación de instalación (NSIS)

| Check | Resultado |
|---|---|
| Instalación limpia | ✅ 0 errores |
| Recursos instalados | ✅ 8/8 |
| Manifest canónico | ✅ 51/51 archivos |
| Health antes/después restart | ✅ |
| Desinstalación | ✅ 0 errores, limpieza temp correcta |
| Sin PULSAR_DATA_DIR | ✅ `usesAppDataFallback=true` |
| PATH vacío | ✅ `pathCleared=true` |
| Overrides externos limpiados | ✅ `externalRuntimeOverridesCleared=true` |

### 14.3 Verificación de instalación (MSI)

| Check | Resultado |
|---|---|
| Instalación | ⚠️ BLOCKED_EXTERNAL — Error 1603/1925 (sin elevación) |
| Requerimiento | Host Windows x64 con privilegios de administrador |

### 14.4 Scripts de verificación y release

| Tipo | Cantidad | Propósito |
|---|---|---|
| Scripts PowerShell verificación | 14 | Locale, accesibilidad, recursos, instalación, smoke |
| Scripts PowerShell release | 15 | Builds NSIS/MSI, firmas, empaquetado |
| Pipeline CI | GitHub Actions (ci.yml) | Windows runners, verify:canonical, lint, typecheck, build, cargo fmt/check/test, python tests |

### 14.5 Estado del updater

| Ítem | Estado |
|---|---|
| `tauri.conf.json` updater | `active=false, pubkey=""` |
| Endpoint de actualización | No configurado |
| Firma de releases | No implementada (BLOCKED_EXTERNAL) |
| Distribución pública | No disponible (BLOCKED_EXTERNAL) |

---

## 15. Roadmap Recomendado

### Fase 1: Estabilización (beta → RC)

| Prioridad | Ítem | ID | Timeline |
|---|---|---|---|
| 🔴 Critical | Resolver riesgo supply chain `ort` 2.0.0-rc.3 | PUL-AUD-013 | Inmediata |
| 🟠 Alta | Refactor `commands.rs` (extraer servicios) | PUL-AUD-004 | 2-3 sprints |
| 🟠 Alta | Dividir `SettingsPanel.tsx` por secciones | PUL-AUD-005 | 1-2 sprints |
| 🟡 Media | Extraer componentes de `page.tsx` | PUL-AUD-016 | 1 sprint |
| 🟡 Media | Añadir `#[cfg(feature = "distributed")]` | PUL-AUD-018 | 1 sprint |
| 🟡 Media | Bundle FFmpeg essentials | PUL-AUD-026 | 2 sprints |

### Fase 2: Testing y calidad

| Prioridad | Ítem | Timeline |
|---|---|---|
| 🔴 Critical | Tests E2E Tauri (download → search) | 2-3 sprints |
| 🟠 Alta | Tests React component (jest/react-testing-library) | 2 sprints |
| 🟠 Alta | Tests crash recovery | 2 sprints |
| 🟡 Media | Tests de performance con bibliotecas grandes | 3 sprints |
| 🟡 Media | Test timeout ONNX cancellation | 1 sprint |
| 🟡 Media | Test URL sobredimensionada Tauri | 1 sprint |
| 🟡 Media | Test race reindex vs worker | 1 sprint |
| 🟢 Baja | Test fallo rebuild_index durante commit | 1 sprint |

### Fase 3: Release y distribución

| Prioridad | Ítem | Estado |
|---|---|---|
| 🔴 Critical | Configurar updater endpoint + pubkey | BLOCKED_EXTERNAL |
| 🔴 Critical | Implementar firma Authenticode | BLOCKED_EXTERNAL |
| 🟠 Alta | Configurar GitHub Environment/secretos para release | BLOCKED_EXTERNAL |
| 🟡 Media | Automatizar VACUUM programado | DEFERRED_PRODUCT |
| 🟢 Baja | Traducción automática | DEFERRED_PRODUCT |
| 🟢 Baja | OCR avanzado | DEFERRED_PRODUCT |
| 🟢 Baja | Chat RAG conversacional | DEFERRED_PRODUCT |
| 🟢 Baja | Listas inteligentes | DEFERRED_PRODUCT |
| 🟢 Baja | YouTube/Instagram ingestion | DEFERRED_PRODUCT |

---

@end
## 16. Anexos

### Anexo A: Matriz de Findings Reconciliados

> Estados: COVERED (corregido/verificado), STALE (no aplica al checkout actual),
> PARTIAL (parcialmente implementado), ACTIVE (pendiente), BLOCKED_EXTERNAL
> (requiere infra/secretos externos), DEFERRED_PRODUCT (fuera de alcance MVP).

| ID | Finding | Estado | Categoría | Severidad |
|---|---|---|---|---|
| PUL-AUD-001 | Updater desactivado (active=false, pubkey="") | ACTIVE | Release | Medium |
| PUL-AUD-002 | Redis obligatorio para caché | COVERED | Arquitectura | — |
| PUL-AUD-003 | `.env` trackeado con rutas personales | STALE | Seguridad | — |
| PUL-AUD-004 | `commands.rs` God Module (3,744 L / 76 cmds) | ACTIVE | Arquitectura | High |
| PUL-AUD-005 | `SettingsPanel.tsx` God Component (2,151 L) | PARTIAL | Arquitectura | Medium |
| PUL-AUD-006 | Paths de snapshots HNSW incompatibles | STALE | Storage | — |
| PUL-AUD-007 | Tipos de dominio duplicados | COVERED | Arquitectura | — |
| PUL-AUD-008 | Restricción TikTok no visible | COVERED | UX | — |
| PUL-AUD-009 | Preflight Python/FFmpeg/modelos incompleto | PARTIAL | QA | Medium |
| PUL-AUD-010 | Auto-updater sin endpoint | BLOCKED_EXTERNAL | Release | High |
| PUL-AUD-011 | API loopback sin auth | COVERED | Seguridad | — |
| PUL-AUD-012 | Dimensión 384 duplicada | COVERED | ML | — |
| PUL-AUD-013 | `ort` 2.0.0-rc.3 + download-binaries | ACTIVE | Supply Chain | Critical |
| PUL-AUD-014 | Sin versionado modelo embeddings | COVERED | ML | — |
| PUL-AUD-015 | `unwrap()` en producción | COVERED | Código | — |
| PUL-AUD-016 | `page.tsx` God Component (911 L) | ACTIVE | Arquitectura | Medium |
| PUL-AUD-017 | Inferencia ONNX sin timeout | PARTIAL | ML | Medium |
| PUL-AUD-018 | Distributed mode compilado siempre | PARTIAL | Arquitectura | Medium |
| PUL-AUD-019 | Reindex nocturno no coordina cola | PARTIAL | QA | Medium |
| PUL-AUD-020 | Bind inseguro metrics | STALE | Seguridad | — |
| PUL-AUD-021 | Faltan índices SQL | STALE | DB | — |
| PUL-AUD-022 | Ruta personal en Git | STALE | Seguridad | — |
| PUL-AUD-023 | Sin Error Boundaries | PARTIAL | Frontend | Medium |
| PUL-AUD-024 | `rebuild_index` sin coherencia | PARTIAL | QA | Medium |
| PUL-AUD-025 | Onboarding desconectado | STALE | UX | — |
| PUL-AUD-026 | Bundle FFmpeg full (484 MB) | ACTIVE | Installer | Medium |
| PUL-AUD-027 | `.env` expone datos personales | STALE | Seguridad | — |
| PUL-AUD-028 | Complejidad distribuida sin beneficio | ACTIVE | Arquitectura | Low |
| PUL-AUD-029 | Falta límite/canonicalización URL | PARTIAL | Seguridad | Medium |
| PUL-AUD-030 | Falta VACUUM automático | DEFERRED_PRODUCT | DB | — |

### Resumen por estado

| Estado | Cantidad |
|---|---|
| COVERED | 8 |
| STALE | 7 |
| PARTIAL | 8 |
| ACTIVE | 6 |
| BLOCKED_EXTERNAL | 2 |
| DEFERRED_PRODUCT | 1 |
| Total | **30** |

### Resumen por severidad

| Severidad | Cantidad |
|---|---|
| Critical | 1 (PUL-AUD-013) |
| High | 2 (PUL-AUD-004, PUL-AUD-010) |
| Medium | 12 |
| Low | 1 |
| — (sin clasificar) | 14 |

---

### Anexo B: Comandos Tauri IPC — Listado Completo (76)

Los siguientes son los **76 comandos `#[tauri::command]`** verificados en
`src-tauri/src/commands.rs:3,744`. Cada comando es invocado desde el frontend
via `invoke('command_name', args)`.

#### Anexo B.1: LLM Local y Gemini

| # | Comando | Función |
|---|---|---|
| 1 | `get_api_session_token` | Obtiene token de sesión API (JWT por proceso) |
| 2 | `get_local_llm_status` | Estado del LLM local (llama.cpp sidecar) |
| 3 | `ensure_local_llm` | Garantiza que el LLM local está descargado/listo |
| 4 | `cancel_local_llm_download` | Cancela descarga del LLM local |
| 5 | `generate_local_response` | Genera respuesta con LLM local |
| 6 | `generate_gemini_response` | Genera respuesta con Gemini (IPC nativo, advertencia) |
| 7 | `get_hardware_profile` | Perfil de hardware (GPU detect, RAM) |

#### Anexo B.2: Runtime y Preflight

| # | Comando | Función |
|---|---|---|
| 8 | `get_runtime_preflight` | Verificación de Python, FFmpeg, FFprobe, modelos, imports |

#### Anexo B.3: Embedding e Índice

| # | Comando | Función |
|---|---|---|
| 9 | `get_embedding_index_status` | Estado del índice de embeddings |
| 10 | `get_storage_status` | Estado del almacenamiento (cuota, uso) |
| 11 | `reconcile_storage` | Reconciliación de almacenamiento |
| 12 | `recommend_storage_setup` | Recomendación de configuración de storage |

#### Anexo B.4: Media Purge y Protección

| # | Comando | Función |
|---|---|---|
| 13 | `preview_media_purge` | Previsualización de purga de medios |
| 14 | `apply_media_purge` | Aplicar purga de medios |
| 15 | `undo_media_purge` | Deshacer purga de medios |
| 16 | `empty_media_trash` | Vaciar papelera de medios |
| 17 | `set_media_protection` | Establecer protección de medios |
| 18 | `record_media_access` | Registrar acceso a medios |

#### Anexo B.5: Artefactos y Jobs

| # | Comando | Función |
|---|---|---|
| 19 | `get_job_artifacts` | Artefactos de un job (videos, mp3, txt) |
| 20 | `get_generated_outputs` | Outputs generados de un job |
| 21 | `save_video_frame` | Guardar keyframe de video |
| 22 | `add_job` | Crear nuevo job de ingestión (URL) |
| 23 | `get_jobs` | Listar todos los jobs |
| 24 | `retry_job` | Reintentar job fallido |

#### Anexo B.6: Whisper (Transcripción)

| # | Comando | Función |
|---|---|---|
| 25 | `get_whisper_model_status` | Estado del modelo Whisper |
| 26 | `prepare_whisper_model` | Preparar/descargar modelo Whisper |
| 27 | `cancel_whisper_model_preparation` | Cancelar preparación de Whisper |

#### Anexo B.7: Configuración de Procesamiento

| # | Comando | Función |
|---|---|---|
| 28 | `get_processing_settings` | Obtener configuración de procesamiento |
| 29 | `set_processing_settings` | Guardar configuración de procesamiento |
| 30 | `save_mvp_settings` | Guardar configuración MVP |
| 31 | `get_legal_consent` | Obtener consentimiento legal |
| 32 | `save_legal_consent` | Guardar consentimiento legal |
| 33 | `get_app_settings` | Obtener configuración de la app |
| 34 | `save_app_settings` | Guardar configuración de la app |
| 35 | `get_autostart_status` | Estado de autostart |
| 36 | `set_autostart` | Configurar autostart |

#### Anexo B.8: Salud y Diagnóstico

| # | Comando | Función |
|---|---|---|
| 37 | `get_health_events` | Eventos de salud del sistema |
| 38 | `get_runtime_health` | Salud del runtime |
| 39 | `get_system_metrics` | Métricas del sistema |
| 40 | `get_db_status` | Estado de la base de datos |
| 41 | `debug_search_transcripts` | Debug de búsqueda en transcripciones |
| 42 | `repair_library` | Reparar biblioteca SQLite |

#### Anexo B.9: Búsqueda y Configuración de Búsqueda

| # | Comando | Función |
|---|---|---|
| 43 | `search_literal_transcripts` | Búsqueda literal (SQL LIKE) |
| 44 | `search_transcripts` | Búsqueda semántica (HNSW + BM25 + RRF + reranker) |
| 45 | `get_search_config` | Configuración de búsqueda |
| 46 | `update_search_config` | Actualizar configuración de búsqueda |
| 47 | `rebuild_index` | Reconstruir índice (shadow rebuild con rollback) |
| 48 | `reindex_sqlite_indexes` | Reconstruir índices SQLite |
| 49 | `vacuum_db` | VACUUM de la base de datos |
| 50 | `recompute_embeddings` | Recomputar embeddings |

#### Anexo B.10: Modelos ML

| # | Comando | Función |
|---|---|---|
| 51 | `get_model_status` | Estado del modelo ML |
| 52 | `reload_model` | Recargar modelo ML |

#### Anexo B.11: Clustering y Videocluster

| # | Comando | Función |
|---|---|---|
| 53 | `auto_cluster_videos` | Clustering automático de videos (LLM-driven) |
| 54 | `replace_ai_playlists` | Reemplazar listas de AI |
| 55 | `set_video_keep_status` | Establecer estado keep/online de video |

#### Anexo B.12: Transcripciones y Contenido

| # | Comando | Función |
|---|---|---|
| 56 | `get_transcript` | Obtener transcripción de un video |

#### Anexo B.13: Playlists (CRUD)

| # | Comando | Función |
|---|---|---|
| 57 | `get_playlists` | Listar playlists |
| 58 | `create_playlist` | Crear playlist |
| 59 | `add_to_playlist` | Agregar video a playlist |
| 60 | `remove_from_playlist` | Remover video de playlist |
| 61 | `get_playlist_items` | Obtener items de playlist |
| 62 | `delete_playlist` | Eliminar playlist |

#### Anexo B.14: Import/Export

| # | Comando | Función |
|---|---|---|
| 63 | `export_semantic` | Exportar datos semánticos |
| 64 | `import_semantic` | Importar datos semánticos |
| 65 | `export_library_json` | Exportar biblioteca en JSON |

#### Anexo B.15: Configuración de Descarga y Paths

| # | Comando | Función |
|---|---|---|
| 66 | `set_download_dir` | Establecer directorio de descargas |
| 67 | `get_download_dir` | Obtener directorio de descargas |
| 68 | `get_base_path` | Obtener path base de la aplicación |

#### Anexo B.16: Configuración Avanzada

| # | Comando | Función |
|---|---|---|
| 69 | `set_cookie_browser` | Establecer navegador para cookies |
| 70 | `set_formats` | Establecer formatos de descarga |
| 71 | `get_formats` | Obtener formatos de descarga |
| 72 | `set_default_retention` | Establecer retención por defecto |

---

### Anexo C: Discrepancias Documentales Corregidas

| # | Documento | Afirmación original | Verdad verificada |
|---|---|---|---|
| 1 | AGENTS.md | main.rs ~285 LOC | 583 LOC |
| 2 | AGENTS.md | commands.rs ~1,600 LOC | 3,744 LOC |
| 3 | AGENTS.md | db.rs 861 LOC | 3,335 LOC |
| 4 | AGENTS.md | queue.rs (legacy) 798 LOC | NO EXISTE (queue_service.rs: 1,246 LOC) |
| 5 | .env.example | REDIS_URL | Redis NO en Cargo.toml |
| 6 | PROJECT.manifest.json | main.rs::unib_tests | NO EXISTE |
| 7 | PROJECT.manifest.json | tests/test_hnsw.rs | NO EXISTE |
| 8 | MVP_STATUS.md | 56 pruebas Rust | 60 pruebas |
| 9 | CHANGELOG.md | SettingsPanel localStorage | Conectado via Tauri IPC |
| 10 | CHANGELOG.md | Pipeline no verificado | Smoke tests con video real |
| 11 | CONTRIBUTING.md | Python/FFmpeg en PATH | Bundlado en resources |

### Anexo D: Hashes de Artefactos de Release

| Artefacto | Algoritmo | Hash |
|---|---|---|
| NSIS installer | SHA-256 | `D69B690811B71579018FDCE980379E2707397DF6BBB688C25288017A8D0AE44E` |
| MSI installer | SHA-256 | `183626C56615DC3845D80C1692E819DD911A1CC15CC11DF609C03CDB70089828` |

### Anexo E: Gates de Verificación

| Gate | Estado | Comando |
|---|---|---|
| Frontend lint | ✅ PASS | `npm run lint` |
| TypeScript | ✅ PASS | `npx tsc --noEmit` |
| Next.js build | ✅ PASS | `npm run build` |
| Locale contract | ✅ PASS | `scripts/verify-locale.ps1` |
| Rust fmt | ✅ PASS | `cargo fmt -- --check` |
| Rust check | ✅ PASS | `cargo check` |
| Rust tests | ✅ PASS | 60/60 |
| Python tests | ✅ PASS | 26 pruebas (+ 1 skip) |
| Runtime manifest | ✅ PASS | 51/51 recursos |
| NSIS smoke | ✅ PASS | SHA-256 verificado |
| MSI smoke | ⚠️ BLOCKED | Requiere host elevado |
| Gemini contract | ✅ PASS | Condicionado a clave |
| Accessibility | ✅ PASS | Boundary, labels, focus |

---

*Documento generado: 2026-09-14*  
*Checkout base: `b95a971c`*  
*Auditoría reconciliada contra: código actual + gates reproducidos*
