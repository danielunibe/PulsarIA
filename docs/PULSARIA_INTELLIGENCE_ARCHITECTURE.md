# Pulsaria Intelligence Platform — Architecture & Evolution (Phase 0)

> Estado: **Fase 0 — Diseño y Arquitectura Integral**
> Principio Rector: **Local-First, Multimodal Knowledge Engine**
> Autoridad: **AI Proposes, Pulsaria Validates, SQLite Persists, Evidence Provides Provenance**
> Restricción Tecnológica: **100% Local AI (Model-Agnostic, GGUF/llama.cpp runtime; Sin dependencia de Gemini para la nueva inteligencia)**

---

## 1. Visión y Propósito

Pulsaria evoluciona desde una herramienta de ingestión y transcripción audiovisual hacia una **Plataforma de Inteligencia Multimodal Local**. 

El objetivo no es crear un chatbot generalista ni producir "resúmenes bonitos" no verificables, sino **transformar el contenido audiovisual en conocimiento estructurado, consultable, trazable y accionable**:

```text
SOURCE
  ↓
INGESTION (yt-dlp, direct, local files)
  ↓
MEDIA (MP4, audio, keyframes, poster)
  ↓
TRANSCRIPTION / OCR / KEYFRAMES (Whisper, ffmpeg, OCR search units)
  ↓
EVIDENCE (Evidence Package con timestamps y artefactos inmutables)
  ↓
SEMANTIC UNDERSTANDING (Extracción de entidades, tópicos, conceptos y afirmaciones)
  ↓
KNOWLEDGE (Grafo de conocimiento local indexable)
  ↓
DOMAIN DETECTION (Detección de dominio: Culinario, Tech, Gaming, Tutorial, etc.)
  ↓
STRUCTURED TRANSFORMATION (Transformers especializados: Receta, Guía, Review, etc.)
  ↓
SEARCH / ORGANIZATION / EDITORIAL / ACTIONABLE UI (Búsqueda híbrida, Tomos, Lector con salto temporal)
```

---

## 2. Estado Actual del Repositorio (Current State Audit)

Pulsaria cuenta con cimientos sólidos y maduros ya validados:

| Subsistema | Estado Auditado | Componentes Clave |
|---|---|---|
| **Ingestión** | Estable | Cola SQLite (`jobs`), `QueueService`, reintentos exponenciales, circuit breaker, deduplicación canónica de URLs. |
| **Pipeline Multimedia** | Estable | Python workers (`ffmpeg`, `Whisper`, `yt-dlp`), extracción de keyframes deterministas, transcripción segmentada con timestamps (`transcript_segments`). |
| **Búsqueda & Indexación** | Estable | SQLite FTS5 (BM25), HNSW vector index (`persistence/hnsw_index.rs`), unified search units (`transcript`, `ocr`, `metadata`), semantic chunker. |
| **Local LLM Runtime** | Existente | `LocalLlmManager` en `infrastructure/local_llm.rs`, control de sidecar `llama-server.exe`, descarga y verificación SHA-256 de GGUF (`Qwen2.5-1.5B-Instruct-Q4_K_M`). |
| **Motor Editorial (Fases 1–4)** | Verificado | Revistas y tomos inteligentes: máquinas de estado, paquetes de evidencia (`EditorialEvidencePackage`, `MultiSourceEvidencePackage`), compilador multi-fuente, detección de conflictos (numéricos y cualitativos), versionado inmutable, lector interactivo (`MagazineReader`, `EvidenceSourceInspector`) con seek al segundo exacto. |

---

## 3. Infraestructura Reutilizable (Reusable Infrastructure)

Para la nueva plataforma de inteligencia no reconstruimos la rueda:
1. **Evidencia Inmutable:** Reutilizamos `jobs`, `media`, `transcript_segments`, `media_artifacts` (keyframes), `search_units` (OCR), y `content_annotations`.
2. **Sidecar Local AI:** Aprovechamos el ciclo de vida de procesos de `LocalLlmManager` (`llama-server.exe`), extendiéndolo con un contrato de **tareas estructuradas con validación de esquema JSON**.
3. **Detección Determinista de Conflictos:** Reutilizamos los principios de detección de discrepancias numéricas y cualitativas de la Fase 4 editorial.
4. **Búsqueda Híbrida:** Reutilizamos FTS5 y HNSW, enriqueciéndolos con filtros semánticos derivados de entidades y dominios estructurados.
5. **Navegación al Video:** Reutilizamos el reproductor canónico y el protocolo de assets nativos (`convertFileSrc`) para saltar a timestamps precisos respaldados por evidencia.

---

## 4. Infraestructura Faltante (Missing Infrastructure)

Faltaba implementar:
1. **Universal Semantic Model:** Tipos de dominio en Rust que representen de manera tipada entidades, conceptos, tópicos, afirmaciones y dominios sin depender de strings no validados.
2. **Local AI Task Contract:** Abstracción formal `LocalAiProvider` desacoplada del proveedor real, capaz de generar estructuras JSON validadas (`generate_structured<T>`) con fallback offline determinista para pruebas.
3. **Model Registry:** Catálogo tipado de capacidades (generación estructurada, embeddings, visión, OCR, STT, reranking) con topes de recursos adaptados al hardware objetivo (RTX 3070 Ti, 8GB VRAM).
4. **Domain Detection Engine:** Clasificador jerárquico (`Domain` + `ContentType` + `Confidence`) que combina anotaciones heurísticas con el modelo local.
5. **Content Transformer Architecture:** Pipeline tipado `Evidence + Domain -> Structured Domain Object` con validación rigurosa de procedencia.
6. **Recipe Vertical Slice:** `RecipeTransformer` determinista que extrae ingredientes con cantidades numéricas y unidades, pasos secuenciales cronometrados, técnicas y equipamiento, con anclaje de evidencia `[job_id, start_time, end_time, quote]`.
7. **Knowledge Persistence:** Tablas SQLite dedicadas (`knowledge_recipes`, `knowledge_ingredients`, `knowledge_steps`, `knowledge_entities`) desacopladas de la caché volátil del modelo.

---

## 5. Ciclo de Vida de la Inteligencia (Intelligence Lifecycle)

```text
1. CAPTURE:
   Job indexado con audio, transcripción Whisper con timestamps, keyframes periódicos y OCR.

2. EVIDENCE PACKAGING:
   Recopilación del paquete de evidencia canónico acotado (respetando límites de contexto).

3. DOMAIN DETECTION:
   Clasificación en dominio (ej. `culinary`) y tipo de contenido (ej. `recipe`).

4. STRUCTURED EXTRACTION:
   Invocación del Transformer de dominio contra el Local AI Provider pidiendo JSON estructurado.

5. DETERMINISTIC VALIDATION:
   Pulsaria valida:
   - Esquema JSON estricto.
   - Cantidades numéricas válidas (sin invención; null si no se declara).
   - Timestamps acotados a la duración del video real.
   - Sin alucinaciones de ingredientes o pasos ausentes en la transcripción/OCR.
   - Detección de conflictos numéricos (ej. 200g vs 250g) marcados como `requires_review`.

6. PERSISTENCE & PROVENANCE:
   Inserción atómica en tablas de conocimiento (`knowledge_*`) con metadata de modelo y hash de fuente.

7. INDEXING & SEARCH:
   Las entidades e ingredientes se indexan en el motor de búsqueda híbrido (FTS5 + HNSW + filtros de dominio).

8. CONSUMPTION:
   El usuario busca "pasta con mostaza", el sistema entiende el dominio culinario y el ingrediente,
   muestra la ficha de la receta estructurada, y al pulsar un ingrediente o paso, el video local salta
   al segundo exacto.
```

---

## 6. Fronteras Arquitectónicas (Architectural Boundaries)

```text
UI (Next.js 16 / React 19)
  ↓  (IPC tipado con guardas isNativeShell)
Commands (Tauri IPC Handlers en src-tauri/src/commands.rs)
  ↓
Application Services:
  ├── KnowledgeService (persistencia de entidades y recetas estructuradas)
  ├── DomainDetector (clasificación de dominios)
  ├── ContentTransformers (RecipeTransformer, etc.)
  ├── LocalAiProvider (abstracción de inferencia estructurada)
  └── HybridSearch / QueryUnderstanding
  ↓
Domain:
  ├── SemanticModel (Domain, ContentType, Entity, Claim, Concept)
  ├── AiTask (AiTaskType, TaskExecution, ModelMetadata)
  ├── Recipe (StructuredRecipe, RecipeIngredient, RecipeStep, EvidenceAnchor)
  └── ModelRegistry (Capabilities, ContextLimits, Quantization)
  ↓
Infrastructure:
  ├── LocalLlmManager (sidecar llama-server.exe / GGUF local)
  ├── MockLocalAiProvider (100% offline para tests deterministas)
  ├── SQLite (rusqlite, FTS5, transacciones atómicas)
  └── HNSW / Vector Index
```

---

## 7. Directiva de Hardware y Recursos

Máquina de referencia:
- **GPU:** NVIDIA GeForce RTX 3070 Ti Laptop (8 GB VRAM)
- **RAM:** 64 GB DDR5
- **CPU:** Intel Core i7-12800H (14 cores, 20 threads)
- **OS:** Windows 11

Estrategia de inferencia local:
- Modelos GGUF cuantizados a 4-bits (`Q4_K_M`), tamaño ≤ 2.5 GB.
- Huella de VRAM para LLM acotada a ≤ 3.5 GB (dejando holgura para el renderizado del sistema operativo y reproducción de video 4K).
- Concurrencia de inferencia: 1 tarea pesada activa a la vez; el resto se encola.
- Context window: 4,096 tokens (suficiente para chunks de transcripción condensados).
