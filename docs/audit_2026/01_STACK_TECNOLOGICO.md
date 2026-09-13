# PULSARIA — AUDITORÍA 01: STACK TECNOLÓGICO
## Análisis Profundo de Dependencias, Versiones e Integración de IA
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 02_ARQUITECTURA_SISTEMA.md

---

## 1. STACK COMPLETO POR CAPA

### 1.1 CAPA DESKTOP NATIVA (Rust + Tauri)

| Dependencia | Versión | Rol | Estado |
|---|---|---|---|
| Rust | 2024 edition | Lenguaje core backend | ✅ Activo |
| Tauri 2 | 2.x | Bridge nativo + IPC | ✅ Activo |
| Tokio | async | Runtime async Rust | ✅ Activo |
| Axum | latest | REST API Gateway (:8080) | ✅ Activo |
| Rusqlite | latest | Capa SQLite local | ✅ Activo (con bugs) |
| ORT (ONNX Runtime) | latest | Motor inferencia ML | ⚠️ Conectado incorrectamente |
| Tokenizers | latest | Tokenización texto para ONNX | ✅ Activo |
| Serde/Serde_json | latest | Serialización JSON | ✅ Activo |
| Tower-http | latest | Middleware CORS | ✅ Activo |
| Tracing | latest | Logging observabilidad | ✅ Activo |
| Dotenvy | latest | Variables de entorno | ✅ Activo |
| Chrono | latest | Timestamps | ✅ Activo |
| Dirs | latest | Directorios del sistema | ⚠️ Usado en main.rs, no en Cargo visible |

#### Módulos Rust creados:
`
src-tauri/src/
├── main.rs          — Entrypoint, AppState, comandos Tauri (590 líneas)
├── db.rs            — Capa SQLite (454 líneas)
├── embedding.rs     — Motor ONNX MiniLM 384d (96 líneas)
├── queue.rs         — QueueManager Python workers (239 líneas)
├── api/
│   ├── gateway.rs   — Axum REST (:8080) (156 líneas)
│   └── middleware/  — JWT + Rate Limiter
├── application/
│   ├── search_service.rs   — SearchService (reranker + cache)
│   ├── queue_service.rs    — QueueService
│   └── reranker.rs         — CrossEncoderReranker (feature flag)
├── domain/
│   ├── models.rs           — Entidades de dominio
│   └── ports.rs            — Traits: EmbeddingEngine, JobRepository
├── infrastructure/
│   ├── persistence/sqlite_repo.rs — SqliteRepo (dominio)
│   ├── vector_shards.rs           — VectorShardManager (HNSW, 4 shards)
│   ├── semantic_cache.rs          — Cache Redis (feature flag)
│   ├── observability/             — Prometheus metrics (:9001)
│   └── scheduler.rs               — Cron de mantenimiento HNSW
├── distributed/
│   └── query_coordinator.rs       — Modo distribuido (feature flag)
├── maintenance/
│   └── reindex_pipeline.rs        — Rebuild nocturno de índices
└── resilience/                    — Circuit breakers
`

#### PROBLEMA CRÍTICO DE ARQUITECTURA DUAL:
El sistema tiene **dos backends paralelos**:
1. **Backend Tauri Legacy** (AppState en main.rs) — tiene su propia conexión SQLite, su propio QueueManager con onnx: None, sus propios comandos
2. **Backend Clean Architecture** (pplication/, domain/, infrastructure/) — usa SqliteRepo, SearchService, VectorShardManager

Estos dos sistemas **NO COMPARTEN ESTADO**. El QueueManager legacy en AppState no tiene ONNX conectado (onnx: None), por lo que los embeddings generados en queue.rs serán todos ceros [0.0; 384].

---

### 1.2 CAPA FRONTEND (Next.js + React)

| Dependencia | Versión | Rol | Estado |
|---|---|---|---|
| Next.js | ^15.4.9 | Framework principal | ✅ Activo (modo dev) |
| React | ^19.2.1 | UI Library | ✅ Activo |
| TypeScript | 5.9.3 | Tipado estático | ✅ Activo |
| Tailwind CSS | v4.1.11 | Utility CSS | ✅ Activo |
| Motion (Framer) | ^12.23.24 | Animaciones | ✅ Activo |
| Three.js | ^0.183.2 | Aurora WebGL background | ✅ Activo |
| Lucide React | ^0.553.0 | Iconos | ✅ Activo |
| React Icons (FA6) | ^5.6.0 | Iconos Font Awesome | ✅ Activo |
| Sonner | ^2.0.7 | Toast notifications | ✅ Activo |
| @tauri-apps/api | ^2.10.1 | Bridge Tauri desde JS | ✅ Activo |
| @google/genai | ^1.17.0 | Google Gemini API | ⚠️ INSTALADO PERO NO USADO |
| @number-flow/react | ^0.6.0 | Animaciones de números | ⚠️ Posiblemente no usado |
| class-variance-authority | ^0.7.1 | Variantes CSS | ⚠️ Posiblemente no usado |

#### HALLAZGO: @google/genai instalado pero no hay código que lo use
La dependencia @google/genai: ^1.17.0 está en package.json pero **no se encontró ningún import ni uso** en ningún componente. Esto sugiere:
- Fue instalado para el chat IA (Fase 11) pero no implementado
- Representa una oportunidad: se puede integrar Gemini para el chat RAG
- Añade peso al bundle sin beneficio actual

---

### 1.3 CAPA PYTHON WORKERS

| Dependencia | Versión | Rol | Estado |
|---|---|---|---|
| faster-whisper | latest | STT (Speech-to-Text) | ✅ Implementado |
| yt-dlp | latest | Descarga de videos | ✅ Implementado |
| ffmpeg | system | Extracción de audio | ⚠️ Dependencia externa del sistema |

#### Modelo Whisper utilizado:
- Modelo: 	iny (el más pequeño y rápido)
- Device: cpu
- Compute type: int8
- **PROBLEMA**: El modelo 	iny tiene precisión muy baja para español e idiomas con acentos. Para contenido de habla hispana, small o medium darían resultados significativamente mejores.

#### Riesgo de instalación:
- fmpeg debe estar en el PATH del sistema. No hay verificación programática antes de iniciar el pipeline.
- No hay equirements.lock — versiones no están fijadas, posibles incompatibilidades futuras.

---

### 1.4 CAPA MOTOR IA (Modelos Locales)

#### Modelo ONNX: all-MiniLM-L6-v2 (384 dimensiones)
- **Propósito**: Embeddings de texto para búsqueda semántica
- **Ruta**: ssets/models/all-MiniLM-L6-v2/model.onnx + 	okenizer.json
- **Calidad**: Buena para inglés, aceptable para español
- **Problema 1**: El modelo es 384d — adecuado pero no estado del arte para español
- **Problema 2**: DirectML como execution provider (Windows-only) — no es portable
- **Problema 3**: El modelo no está cargado en el QueueManager al momento de generar embeddings

#### Comparación con alternativas disponibles con @google/genai:
| Modelo | Dims | Español | Costo | Disponible |
|---|---|---|---|---|
| all-MiniLM-L6-v2 (actual) | 384 | Aceptable | Gratis/Local | ✅ |
| text-embedding-004 (Google) | 768 | Excelente | API gratuita/cuota | Instalado pero no usado |
| paraphrase-multilingual (ONNX) | 384 | Bueno | Gratis/Local | No instalado |

#### RECOMENDACIÓN DE IA:
Integrar 	ext-embedding-004 de Google Gemini (ya instalado con @google/genai) como opción alternativa cuando hay conexión, con fallback a ONNX local. Esto elevaría significativamente la calidad de búsqueda para contenido en español.

---

### 1.5 CAPA DE OBSERVABILIDAD

| Sistema | Puerto | Estado | Problema |
|---|---|---|---|
| REST API | :8080 | ✅ Activo | CORS solo permite localhost:3000 |
| Prometheus Metrics | :9001 | ✅ Activo | No verificado en producción |
| Tauri Events | IPC | ✅ Activo | Algunos eventos sin handler en frontend |
| System Log Stream | IPC | ✅ Activo | Funcional |

---

### 1.6 CONFIGURACIÓN DE ENTORNO (.env)

Variables de entorno detectadas en el código:
`
PULSAR_DOWNLOAD_DIR     — Directorio de descarga (no implementado en backend)
SHARD_COUNT             — Número de shards HNSW (default: 4)
RERANKER_ENABLED        — Feature flag reranker (default: false)
REDIS_URL               — URL Redis para cache semántico (default: redis://127.0.0.1/)
DISTRIBUTED_MODE        — Modo distribuido (default: false)
CLUSTER_NODES           — Nodos del cluster distribuido
JWT_SECRET              — Secreto JWT para API
RATE_LIMIT_PER_SEC      — Rate limit de la API (default: 10.0 rps)
YT_DLP_PATH             — Override del path de yt-dlp
`

**PROBLEMA**: Archivo .env no versionado (correcto por seguridad). Sin embargo, no hay .env.example que sirva de guía para configurar un entorno nuevo.

---

## 2. INTEGRACIÓN DE IA: ANÁLISIS PROFUNDO

### Situación Actual del Motor de IA
`
[Video] → [yt-dlp] → [ffmpeg] → [faster-whisper tiny] → [ONNX MiniLM 384d] → [SQLite BLOB]
              ↓                           ↓                      ↓
          Metadatos               Transcripción texto        Embedding 384d
          (title, thumb)          (texto plano)              (coseno similarity)
`

### Brechas de IA Identificadas
1. **Sin IA generativa para resúmenes** — @google/genai instalado pero no integrado
2. **Sin clasificación temática** — no hay modelo para categorizar contenido
3. **Sin OCR** — texto visible en pantalla no se extrae
4. **Sin visión computacional** — escenas, objetos, acciones no detectados
5. **Whisper tiny** — calidad baja especialmente para contenido en español
6. **Embeddings con ceros** — bug arquitectural hace que búsqueda semántica sea inútil

### Oportunidad Inmediata: Integrar Gemini
Con @google/genai ^1.17.0 ya instalado, se pueden agregar:
- gemini-1.5-flash para resúmenes automáticos de transcripciones
- 	ext-embedding-004 para embeddings de calidad superior
- Chat RAG sobre la biblioteca completa

---

*Siguiente documento: [02_ARQUITECTURA_SISTEMA.md](02_ARQUITECTURA_SISTEMA.md)*
