# PULSARIA — REALITY CHECK / INTELLIGENCE FOUNDATION AUDIT

**Fecha:** 2026-10-04  
**Auditor:** Senior Staff Engineer / Systems Auditor & QA Lead  
**Estado General de la Fase:** **FOUNDATION PARTIALLY READY (ROUTE B)**  
**Resultado de Inferencia Local Real:** **RUNTIME REAL Y VERIFICADO / FALLO DE DESERIALIZACIÓN POR FALTA DE ESQUEMA EN PROMPT**

---

## 1. Executive Summary

El objetivo de esta auditoría fue determinar si la **Intelligence Platform** de Pulsaria constituye una **base funcional de inteligencia local-first** o si existen componentes que simulan funcionalidad mediante mocks, heurísticas estáticas, stubs o contratos sin runtime.

### Diagnóstico Central:
> **Pulsaria NO es un espejismo ni un mockboard: el motor de inferencia local (`llama-server.exe` build 10903 + weights reales GGUF Qwen2.5-1.5B de 1.11 GB), la persistencia relacional SQLite con cascadas e índices, el detector heurístico de dominios y las compuertas deterministas son 100% REALES.**
> 
> **Sin embargo, la plataforma NO está lista para producción como "inteligencia autónoma estructurada": el puente entre el modelo local y la extracción tipada (`generate_structured<T>()`) adolece de un defecto crítico de prompting y falta de decodificación restringida por gramática (JSON Schema/BNF). El modelo real genera JSON con claves libres que rompen la deserialización determinista de Serde. Además, los contratos de ciclo de vida de tareas (`AiTaskExecution`), el catálogo de capacidades (`CapabilityRegistry`) y el registro de modelos (`ModelRegistry`) son estructuras puramente declarativas sin ejecución ni persistencia.**

### Veredicto por Niveles:
- **Baseline de Calidad (Compilación, Tipos, Tests, Lint, Builds):** **PASS** (189 tests Rust, 32 Python, 13/13 MVP gates).
- **Runtime Local LLM:** **PASS (REAL)**. Proceso sidecar loopback real, sin APIs cloud, sin Gemini en la capa de inteligencia.
- **Aislamiento de Mocks:** **PASS**. Los mocks de IA (`LocalAiProvider::Mock`) están estrictamente restringidos a `#[cfg(test)]`. La ruta de producción (`commands.rs`) invoca exclusivamente `LocalAiProvider::Sidecar`.
- **Extracción Estructurada con Modelo Real:** **FAIL (BLOCKER)**. Al probar prompts reales contra `llama-server.exe`, el modelo no recibe la definición del esquema JSON; inventa nombres de campo (`recipe_name` en vez de `title`, `"0.0s"` en vez de números flotantes), causando rechazo inmediato por Serde (`SchemaValidationFailed`).
- **Persistencia Relacional (SQLite):** **PARTIAL / ARCHITECTURAL RISK**. Las 5 tablas de conocimiento y sus índices están implementados y migrados en `db.rs`, pero 3 de ellas están acopladas de forma exclusiva al dominio culinario (`knowledge_recipes`, `knowledge_recipe_ingredients`, `knowledge_recipe_steps`), obligando a crear tablas duplicadas para futuros dominios si no se generaliza.
- **Ciclo de Vida de Tareas de IA (`AiTaskExecution`):** **CONTRACT ONLY**. Ninguna fila en base de datos, ninguna cola asíncrona de reintentos, ningún worker pool dedicado a tareas de IA.

---

## 2. Baseline

Se ejecutó la suite completa de verificación antes de cualquier inspección o modificación de código:

### Comandos de Control y Resultados:
| Comando | Resultado | Detalles |
|---|---|---|
| `git status` | PASS | Workspace limpio, branch funcional |
| `git log --oneline -20` | PASS | Trazabilidad histórica completa |
| `cargo check --manifest-path src-tauri/Cargo.toml` | PASS | 1.49s (0 errores, 0 warnings) |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS | **189 tests PASS**, 0 fallos, 0 filtrados |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | PASS | Formato canónico estricto cumplido |
| `npm run typecheck` | PASS | 0 errores TypeScript (`tsc --noEmit`) |
| `npm run lint` | PASS | 0 errores ESLint (2 advertencias preexistentes de tags `<img>` en Next.js) |
| `npm run verify:canonical` | PASS | Estructura canónica intacta |
| `npm run verify:frontend-secrets` | PASS | 0 secretos expuestos en frontend |
| `npm run verify:mvp` | PASS | **13/13 compuertas MVP superadas** |
| `npm run build` | PASS | Build completo de Next.js (Turbopack) y bundle estático de Tauri exitoso |

---

## 3. Architecture Reality Check

Pulsaria declara el siguiente pipeline estricto:
```text
SOURCE / MEDIA → EVIDENCE → SEMANTIC / DOMAIN → TRANSFORMER → VALIDATION → SQLITE
```

### Hallazgos de Arquitectura:
1. **Regla "AI Proposes, Pulsaria Validates, SQLite Persists":**
   - **CUMPLIDA**. El modelo LLM no tiene acceso a sockets de base de datos, no ejecuta SQL, no genera identificadores de clave primaria (`job_id` es forzado y validado contra el paquete de evidencia) y no tiene acceso a comandos de sistema operativo.
2. **Gemini Decoupling:**
   - **CUMPLIDO**. Los módulos `domain_detector.rs`, `local_ai_provider.rs`, `recipe.rs`, `semantic.rs` y `knowledge_service.rs` tienen **0 líneas** de código que invoquen o importen Gemini. Gemini se mantiene únicamente como comando legacy aislado en `generate_gemini_response` para tareas editoriales opcionales de revista.
3. **Agentes Autónomos:**
   - **NO IMPLEMENTADOS (CORRECTO)**. No hay bucles autónomos, llamadas a herramientas en cadena (tool use loop) ni permisos descontrolados. Toda invocación es una llamada pura de inferencia con contexto cerrado.

---

## 4. Local LLM Audit

### A. Especificaciones del Modelo y Runtime
- **Modelo:** `Qwen/Qwen2.5-1.5B-Instruct-GGUF`
- **Revisión:** `91cad51170dc346986eccefdc2dd33a9da36ead9`
- **Archivo:** `data/llm-models/qwen2.5-1.5b-instruct-q4_k_m.gguf`
- **Tamaño verificado en disco:** `1,117,320,736 bytes` (~1.11 GB)
- **Hash SHA-256:** `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e` (validado mediante archivo `.verified`)
- **Licencia:** Apache-2.0
- **Runtime Binario:** `src-tauri/resources/bin/llama-server.exe`
- **Versión de llama.cpp:** `0.4.0-dev (build 10903, commit 481c65f09)` compilado con Clang 20.1.8
- **Aceleración Hardware:** CPU con threadpool automático (`n_threads = 14`), DirectML compatible.
- **Parámetros de Arranque:** `--host 127.0.0.1 --port <ephemeral> --api-key <bearer> --no-webui --ctx-size 4096 --n-predict 2048`
- **Endpoint:** `/v1/chat/completions` (OpenAI-compatible) con Bearer token generado dinámicamente.

### B. Camino de Ejecución Real
```text
Tauri IPC (extract_job_recipe)
    ↓
LocalAiProvider::Sidecar(state.local_llm)
    ↓
LocalLlmManager::generate_sidecar_request()
    ↓
HTTP POST http://127.0.0.1:<port>/v1/chat/completions
    ↓
llama-server.exe (in-memory Qwen2.5-1.5B-Instruct)
    ↓
JSON response parsing & Markdown fence stripping
    ↓
serde_json::from_str::<T>()
    ↓
validate_structured_recipe()
    ↓
knowledge_service::save_structured_recipe()
```

### C. Análisis de `generate_structured<T>()`
- **¿Llama realmente al modelo?** **SÍ**. Comprobado en vivo contra el servidor activo.
- **¿Existe Schema Enforcement a nivel de inferencia?** **NO**. El payload HTTP enviado a `llama-server.exe` no utiliza `response_format` ni gramáticas BNF (`--grammar`). Solo añade texto plano al prompt: `"Genera exclusivamente JSON válido ajustado al esquema 'StructuredRecipe'"`.
- **¿Qué sucede ante respuestas del modelo?**
  El modelo de 1.5B inventa las claves que le parecen intuitivas (`recipe_name` en lugar de `title`, cadenas `"0.0s"` en lugar de `0.0`, o arrays de ingredientes ausentes).
  `serde_json::from_str::<StructuredRecipe>` falla de inmediato con error `SchemaValidationFailed`.
- **Veredicto:** **REAL EN RUNTIME / DEFECTUOSO EN CONTRATO DE INFERENCIA**.

---

## 5. Mock / Stub Audit

Se realizó un escaneo exhaustivo de todas las instancias de `Mock` y `Scenario`:

```text
MOCK USAGE MAP:
- src-tauri/src/application/local_ai_provider.rs:
    MockLocalAiProvider & MockLocalScenario definidos.
    Usados en tests unitarios internos (tests 438, 455, 477, 492).
- src-tauri/src/application/domain_detector.rs:
    Usado exclusivamente en mod tests (línea 185).
- src-tauri/src/application/transformers/recipe.rs:
    Usado exclusivamente en mod tests (líneas 179, 196, 209).
- src-tauri/src/commands.rs:
    0 REFERENCIAS A MOCKS.
    Líneas 5829 y 5895 instancian explícitamente:
    `LocalAiProvider::Sidecar(state.local_llm.clone())`.
```

**Conclusión:**
- `MOCK USED ONLY BY TESTS`: **CONFIRMADO**.
- `MOCK ACCESSIBLE FROM PRODUCTION PATH`: **NO DETECTADO**. Si el modelo local no está instalado o listo, la ruta de producción devuelve un error explícito (`LocalAiError::ModelNotReady`), no un mock silencioso.

---

## 6. Semantic Model Audit

Inspección de `src-tauri/src/domain/semantic.rs`:

| Elemento Semántico | Estado | Implementación | Persistencia SQLite |
|---|---|---|---|
| **ContentDomain** | **IMPLEMENTED** | Enum de 9 dominios canónicos (`Culinary`, `Technology`, etc.) con mapeo `from_str_canonical` | SÍ (`knowledge_domain_classifications.domain`) |
| **ContentType** | **IMPLEMENTED** | Enum de 10 tipos canónicos (`Recipe`, `Tutorial`, `ProductReview`, etc.) | SÍ (`knowledge_domain_classifications.content_type`) |
| **DomainClassification**| **IMPLEMENTED** | Struct con `domain`, `content_type`, `confidence`, `rationale`, `suggested_tags` | SÍ (`knowledge_domain_classifications`) |
| **EntityType** | **IMPLEMENTED** | Enum canónico de 14 tipos (`Ingredient`, `Tool`, `Hardware`, `Software`, etc.) | SÍ (`knowledge_semantic_entities.entity_type`) |
| **SemanticEntity** | **IMPLEMENTED** | Struct con `name`, `normalized_name`, `confidence`, `job_id`, `timestamps` | SÍ (`knowledge_semantic_entities`) |
| **ModelMetadata** | **IMPLEMENTED** | Struct de trazabilidad (`model_id`, `model_revision`, `prompt_version`) | SÍ (columnas de auditoría en todas las tablas) |
| **SemanticTopic** | **PARTIAL** | Struct definido en Rust (`topic`, `relevance`) | NO (sin tabla SQLite, sin extractor) |
| **SemanticConcept** | **PARTIAL** | Struct definido en Rust (`concept`, `category`, `confidence`) | NO (sin tabla SQLite, sin extractor) |
| **SemanticClaim** | **PARTIAL** | Struct definido en Rust (`subject`, `predicate`, `object`, `numeric_value`) | NO (sin tabla SQLite, sin extractor) |
| **SemanticRelation**| **PARTIAL** | Struct definido en Rust (`source_entity`, `relation_type`, `target_entity`) | NO (sin tabla SQLite, sin extractor) |
| **SemanticKnowledgeGraph**| **PARTIAL** | Grafo en memoria que agrupa lo anterior | NO (sin serialización unificada) |
| **Event** | **MISSING** | No existe abstracción para eventos de contenido multimedia | NO |
| **Action** | **PARTIAL** | Solo existe como `RecipeStep` dentro del dominio culinario | Solo en recetas |
| **Attribute** | **MISSING** | No modelado como primitiva genérica | No |
| **Intent** | **MISSING** | No modelado | No |

---

## 7. Domain Detector Audit

Inspección de `src-tauri/src/application/domain_detector.rs`:

### Flujo de Ejecución:
```text
package
   ↓
DomainDetector::detect_deterministic()
   ├── Coincidencia por anotaciones de biblioteca (category == recipe/technology)
   └── Coincidencia por palabras clave en título (receta, review, benchmark, etc.)
   ↓
¿Hubo match?
   ├── SÍ → Retorno inmediato (confidence: 0.90 - 0.95, latencia 0 ms)
   └── NO → LLM Fallback (LocalAiProvider::generate_structured::<DomainClassification>)
```

### Hallazgos Específicos:
1. **Detección Determinista:** Funciona de forma inmediata y robusta para las categorías base sin necesidad de encender el LLM.
2. **LLM Fallback:** Toma los primeros 30 segmentos de la transcripción y solicita un JSON `DomainClassification`.
3. **Cálculo de Confianza:**
   - En la vía determinista, la confianza está prefijada por heurística (ej. `0.95` para recetas explícitas).
   - En la vía LLM, la confianza la propone el modelo, pero se pasa por `.clamp(0.0, 1.0)`.
4. **Ausencia de `requires_review`:** `DomainClassification` carece de un flag explícito `requires_review`. Solo expone el número flotante de `confidence`.
5. **Riesgo de Deserialización de Dominios Desconocidos:** `ContentDomain::Other(String)` no cuenta con anotación serde untagged, lo que genera fallos si el modelo devuelve un valor string que no coincide con las variantes conocidas del enum.

---

## 8. Recipe Transformer Audit

Inspección de `src-tauri/src/application/transformers/recipe.rs` y `src-tauri/src/domain/recipe.rs`:

### A. Capacidades Auditadas:
- **Ingredientes:**
  - `name`: Presente.
  - `quantity`: `Option<f64>`. Si no hay cantidad explícita, se almacena `None` (`null`). **NO promedia ni adivina**.
  - `unit`: `Option<String>` normalizado en minúsculas.
  - `evidence`: `Vec<EvidenceAnchor>` con timestamps y citas textuales.
- **Pasos Secuenciales:**
  - `instruction`: Presente.
  - `time_start` y `time_end`: Presentes y validados contra la duración del video (`s <= e` y `e <= duration + 1.0s`).
  - `evidence`: Obligatoria (si un paso carece de evidencia, la validación falla con `MissingEvidenceForStep`).
- **Manejo de Conflictos Cuantitativos:**
  - Si una fuente declara `200 g` y otra `250 g`, `validate_structured_recipe` y `RecipeTransformer` conservan ambas evidencias dentro de `RecipeConflict`, asignan `requires_review = true` y **JAMÁS promedian a 225 g**.

### B. Defecto de Integración con el Modelo Real:
- En tests con mock, el transformador pasa 100% de las aserciones.
- En ejecución real, debido a que el prompt no incluye la especificación de tipos ni la plantilla de campos, el modelo genera un dialecto JSON incompatible.

---

## 9. Provenance Audit

Pulsaria exige que ningún dato estructurado exista sin respaldo verificable en el material original:

```text
RecipeIngredient / RecipeStep
      ↓
EvidenceAnchor (job_id, timestamp_start, timestamp_end, quote, keyframe_path, confidence)
      ↓
Transcript Segment / OCR / Keyframe
      ↓
Video File
```

### Evaluación Técnica:
1. **Validación Antialucinación de Job ID:**
   En `RecipeTransformer` (líneas 95-108):
   ```rust
   for ing in &recipe.ingredients {
       for ev in &ing.evidence {
           if ev.job_id != job_id {
               return Err(TransformerError::ForeignJobEvidence(ev.job_id));
           }
       }
   }
   ```
   Si el modelo alucina un `job_id` ajeno, el transformador rechaza la receta por completo.
2. **Granularidad:**
   - La procedencia se ancla a nivel de `(job_id, start_sec, end_sec, quote)`.
   - **Limitación:** `EvidenceAnchor` no guarda el `segment_index` exacto ni el `artifact_id` relacional en la base de datos; la evidencia se guarda serializada como texto JSON (`evidence_json`) dentro de las filas de ingredientes y pasos.

---

## 10. Persistence Audit

Inspección de `src-tauri/src/application/knowledge_service.rs` y `src-tauri/src/db.rs`:

### Tablas Auditadas:
1. `knowledge_domain_classifications`:
   - Clave primaria: `job_id` (1 a 1 con `jobs`).
   - Clave foránea: `FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE`.
   - Índices: `idx_knowledge_domain_domain` en `(domain, content_type)`.
   - Idempotencia: `ON CONFLICT(job_id) DO UPDATE`.
2. `knowledge_recipes`:
   - Clave primaria: `id` (texto `"recipe-{job_id}"`).
   - Clave foránea: `FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE`.
   - Índices: `idx_knowledge_recipes_job` en `job_id`.
   - Idempotencia: `ON CONFLICT(job_id) DO UPDATE`.
3. `knowledge_recipe_ingredients`:
   - Clave primaria: `id AUTOINCREMENT`.
   - Claves foráneas: hacia `knowledge_recipes(id)` y `jobs(id)` con `ON DELETE CASCADE`.
   - Índices: en `recipe_id` y en `normalized_name` (permite búsqueda rápida por ingrediente).
4. `knowledge_recipe_steps`:
   - Clave primaria: `id AUTOINCREMENT`.
   - Claves foráneas: hacia `knowledge_recipes(id)` y `jobs(id)` con `ON DELETE CASCADE`.
   - Índices: en `recipe_id`.
5. `knowledge_semantic_entities`:
   - Clave primaria: `id AUTOINCREMENT`.
   - Claves foráneas: hacia `jobs(id)` con `ON DELETE CASCADE`.
   - Índices: en `job_id` y en `normalized_name`.

### Pregunta Crítica de Extensibilidad:
> **¿La estructura actual permitirá añadir Technology, Gaming, Education, etc. sin crear una arquitectura paralela por dominio?**
>
> **RESPUESTA: NO.**
> Las entidades genéricas (`knowledge_semantic_entities`) y las clasificaciones (`knowledge_domain_classifications`) sí son extensibles.
> Sin embargo, las estructuras de contenido (`knowledge_recipes`, `knowledge_recipe_ingredients`, `knowledge_recipe_steps`) son estrictamente culinarias. Añadir dominios nuevos bajo el esquema actual requerirá crear tablas ad-hoc (ej. `knowledge_hardware_reviews`, `knowledge_game_guides`, etc.). Se requerirá un diseño de documentos estructurados polimórficos (`knowledge_structured_documents`) antes de escalar a otros dominios.

---

## 11. Capability Registry Audit

Inspección de `src-tauri/src/domain/capabilities.rs`:

```text
COMPONENT: CapabilityRegistry
STATUS: METADATA ONLY / DECLARATIVE SCAFFOLD
INPUT: ContentDomain
PROCESSING: Filtrado de vector en memoria de CapabilityDefinition
OUTPUT: &[CapabilityDefinition]
PERSISTENCE: Ninguna
TEST COVERAGE: test_culinary_capabilities_discovered (PASS)
PRODUCTION PATH: No conectado a ningún flujo de ejecución
```

**Diagnóstico:** Es un catálogo descriptivo en memoria. No cuenta con traits de ejecución, no despacha transformadores dinámicamente y no versiona capacidades de forma ejecutable.

---

## 12. AI Task Lifecycle Audit

Inspección de `src-tauri/src/domain/ai_task.rs`:

```text
COMPONENT: AiTaskExecution & AiTaskStatus
STATUS: CONTRACT ONLY / SCAFFOLD
INPUT: N/A
PROCESSING: Mutaciones de estado en memoria (mark_completed, mark_failed, mark_requires_review)
OUTPUT: Struct serializable
PERSISTENCE: NINGUNA (0 tablas en SQLite)
TEST COVERAGE: test_ai_task_status_terminal, test_ai_task_execution_lifecycle (PASS)
PRODUCTION PATH: DESCONECTADO (0 llamadas fuera de ai_task.rs)
```

**Diagnóstico:** No existe un motor de colas, ni reintentos automáticos, ni deduplicación, ni persistencia para el ciclo de vida de tareas de IA. Las operaciones se ejecutan de manera síncrona dentro de los comandos IPC de Tauri.

---

## 13. Model Registry Audit

Inspección de `src-tauri/src/domain/model_registry.rs`:

```text
COMPONENT: ModelRegistry
STATUS: STATIC DOCUMENTATION SCAFFOLD
INPUT: ModelCapability
PROCESSING: Búsqueda lineal en vector estático
OUTPUT: Option<&RegisteredModel>
PERSISTENCE: Ninguna
PRODUCTION PATH: DESCONECTADO (LocalLlmManager usa local-llm-manifest.json independiente)
```

**Diagnóstico:** Declara modelos para StructuredGeneration (`Qwen2.5-1.5B`), SemanticEmbedding (`bge-small-en-v1.5`) y SpeechToText (`whisper-base`), pero es una estructura aislada que no gobierna la descarga ni la selección de modelos en tiempo de ejecución.

---

## 14. Real Execution Test (Prueba Controlada con LLM Real)

Se levantó el binario real `src-tauri/resources/bin/llama-server.exe` (build 10903) cargando el modelo real `data/llm-models/qwen2.5-1.5b-instruct-q4_k_m.gguf` (1.11 GB) en el puerto de loopback `18090` con autorización Bearer `testkey123`.

Se enviaron exactamente los 3 inputs controlados solicitados en la especificación de auditoría:

```text
================================================================================
PRUEBA CONTROLADA 1: Ingredientes con cantidad y unidad
Input: "Agrega 200 gramos de pasta y después incorpora dos cucharadas de mostaza."
Contexto: job_id: 101, Título: "Pasta con Mostaza", Duración: 60.0s

RESPUESTA CRUDA GENERADA POR EL MODELO:
```json
{
  "StructuredRecipe": {
    "job_id": "101",
    "recipe_name": "Pasta con Mostaza",
    "duration": 60.0,
    "steps": [
      {
        "step_number": 1,
        "timestamp_start": 0.0,
        "timestamp_end": 10.0,
        "quote": "Agrega 200 gramos de pasta y después incorpora dos cucharadas de mostaza."
      }
    ],
    "conflicts": []
  }
}
```
RESULTADO DE VALIDACIÓN:
- JSON válido sintácticamente: SÍ.
- Deserialización en StructuredRecipe: FALLÓ.
  Motivo: El modelo anidó todo dentro de {"StructuredRecipe": {...}}, inventó "recipe_name"
  en lugar de "title", y omitió la lista "ingredients".

================================================================================
PRUEBA CONTROLADA 2: Sin cantidad explícita
Input: "Agrega pasta."
Contexto: job_id: 102, Título: "Pasta Simple", Duración: 30.0s

RESPUESTA CRUDA GENERADA POR EL MODELO:
```json
{
  "StructuredRecipe": {
    "job_id": "102",
    "recipe_name": "Pasta Simple",
    "ingredients": [
      {
        "job_id": "102",
        "timestamp_start": "0.0s",
        "timestamp_end": "5.0s",
        "quote": "Agrega pasta."
      }
    ],
    "steps": [
      {
        "job_id": "102",
        "timestamp_start": "0.0s",
        "timestamp_end": "5.0s",
        "step": "1. Agrega pasta."
      }
    ],
    "duration": "30.0s"
  }
}
```
RESULTADO DE VALIDACIÓN:
- ¿Alucinó cantidad?: NO (no inventó ningún número).
- Deserialización en StructuredRecipe: FALLÓ.
  Motivo: Generó marcas de tiempo como cadenas ("0.0s") en vez de números flotantes (0.0).

================================================================================
PRUEBA CONTROLADA 3: Conflicto cuantitativo (200 g vs 250 g)
Input: "[0.0s-5.0s] Agrega 200 gramos de pasta. [20.0s-25.0s] Más adelante agrega 250 gramos."
Contexto: job_id: 103, Título: "Pasta Conflicto", Duración: 60.0s

RESPUESTA CRUDA GENERADA POR EL MODELO:
```json
{
  "StructuredRecipe": {
    "job_id": "103",
    "recipe_name": "Pasta Conflicto",
    "duration": 60.0,
    "steps": [
      {
        "step_number": 1,
        "timestamp_start": 0.0,
        "timestamp_end": 5.0,
        "quote": "Agrega 200 gramos de pasta.",
        "quantity": "200",
        "ingredient": "pasta"
      },
      {
        "step_number": 2,
        "timestamp_start": 20.0,
        "timestamp_end": 25.0,
        "quote": "Más adelante agrega 250 gramos.",
        "quantity": "250",
        "ingredient": "pasta"
      }
    ],
    "conflicts": [
      {
        "ingredient": "pasta",
        "start_time": 5.0,
        "end_time": 20.0,
        "job_id": "103"
      }
    ]
  }
}
```
RESULTADO DE VALIDACIÓN:
- ¿Conservó ambas evidencias?: SÍ (capturó ambos pasos con 200 y 250).
- ¿Promedió?: NO.
- Deserialización en StructuredRecipe: FALLÓ.
  Motivo: La estructura de "conflicts" no coincide con los campos esperados por `RecipeConflict`.
================================================================================
```

---

## 15. Reality Matrix

| Sistema / Componente | Declarado | Real | Estado | Evidencia Concreta |
|---|---|---|---|---|
| **Semantic Model Core** | YES | YES (Entidades) / PARTIAL (Grafo) | **PARTIAL** | `domain/semantic.rs`: `ContentDomain`, `ContentType` y `SemanticEntity` persistidos. `SemanticTopic`, `SemanticClaim`, `SemanticRelation` solo structs. |
| **AI Task Contract** | YES | NO (Sin ejecución) | **CONTRACT ONLY** | `domain/ai_task.rs`: Structs y métodos en memoria; 0 usos fuera del archivo, sin tabla SQLite ni cola. |
| **Local AI Provider** | YES | YES (Runtime) / GAP (Prompting) | **REAL / DEFECTIVE** | `application/local_ai_provider.rs`: Conexión HTTP real con `llama-server.exe`; mock aislado; falta inyección de esquema JSON. |
| **Model Registry** | YES | NO (Config estática) | **SCAFFOLD** | `domain/model_registry.rs`: Catálogo en memoria; no conectado a `LocalLlmManager`. |
| **Domain Detection** | YES | YES (Heurística) / PARTIAL (AI) | **REAL / PARTIAL** | `application/domain_detector.rs`: Heurísticas deterministas operativas; fallback IA afectado por falta de schema enforcement. |
| **Recipe Transformer** | YES | YES (Validación) / BLOCKED (LLM) | **PARTIAL** | `application/transformers/recipe.rs`: Invariantes, no-promedios y anclaje temporal programados; falla con LLM real sin gramática. |
| **Provenance Anchoring**| YES | YES (Lógica) / PARTIAL (Relacional) | **PARTIAL** | `EvidenceAnchor` ancla a timestamps y valida `job_id`; almacenado como JSON crudo dentro de ingredientes/pasos sin foreign keys directas a artefactos. |
| **Knowledge Persistence**| YES | YES (SQLite) / RISK (Escalabilidad)| **REAL / RISK** | `application/knowledge_service.rs` & `db.rs`: 5 tablas creadas con cascadas e índices funcionales; acopladas al dominio de recetas. |
| **Capability Registry** | YES | NO (Metadata pura) | **METADATA ONLY** | `domain/capabilities.rs`: Catálogo de 4 capacidades; sin despacho dinámico ni ejecución. |
| **Hybrid Search** | YES | YES | **PASS (REAL)** | `application/search_service.rs`: HNSW vectorial con BGE-small + BM25 FTS5 operativo. |
| **Real LLM Execution** | YES | YES | **PASS (REAL RUNTIME)**| `llama-server.exe` ejecutó en CPU a 15-21 t/s con pesos reales Qwen2.5-1.5B (1.11 GB). |

---

## 16. Critical Findings

### Hallazgo 1: [CRITICAL / FUNCTIONAL GAP & BLOCKER]
**Falta de JSON Schema Enforcement o Gramática BNF en `LocalAiProvider` / `RecipeTransformer`**
- **Impacto:** En producción con el LLM real, cualquier llamada a `extract_job_recipe` o fallback de `detect_job_domain` fallará al deserializar con `serde_json::from_str`.
- **Causa Raíz:** El prompt sólo pide el nombre del esquema en lenguaje natural (`"StructuredRecipe"`), pero no provee la definición de campos, tipos ni un ejemplo representativo, ni utiliza el parámetro `response_format` / gramática BNF de `llama-server`.

### Hallazgo 2: [HIGH / ARCHITECTURAL RISK]
**Persistencia Relacional Específica por Dominio en SQLite**
- **Impacto:** Añadir Tecnología, Gaming, Educación o Finanzas obligará a crear sets de tablas duplicadas (`knowledge_tech_reviews`, `knowledge_game_guides`, etc.).
- **Causa Raíz:** El modelo relacional implementó tablas fijas para recetas en lugar de un esquema de documentos estructurados (`knowledge_structured_documents`) complementado por la tabla genérica `knowledge_semantic_entities`.

### Hallazgo 3: [HIGH / FUNCTIONAL GAP]
**Inexistencia del Motor de Ciclo de Vida de Tareas de IA (`AiTaskExecution`)**
- **Impacto:** Las tareas de IA no se pueden reintentar asíncronamente, no se registran en una tabla de auditoría de tareas, no se pueden pausar ni cancelar mediante un worker pool.
- **Causa Raíz:** `AiTaskExecution` fue implementado como un contrato de tipos en el dominio sin crear su servicio de orquestación ni tabla en SQLite.

### Hallazgo 4: [MEDIUM / SCAFFOLD GAP]
**`CapabilityRegistry` y `ModelRegistry` Desconectados del Runtime**
- **Impacto:** La selección de modelos y la activación de capacidades no son dinámicas; se gestionan mediante configuraciones hardcodeadas en `commands.rs` y `local-llm-manifest.json`.

### Hallazgo 5: [LOW / TECH DEBT]
**Placeholders Hardcodeados en Metadatos de Auditoría**
- **Impacto:** `commands.rs` guarda registros en la base de datos con `model_id: "local-llm"`, `model_revision: "1.0"` y `source_hash: "hash_placeholder"` en lugar de calcular el hash de la evidencia y leer la revisión real del manifiesto.

---

## 17. Recommended Fixes (En orden estricto de prioridad técnica)

1. **Reparación del Puente Estructurado (Inmediatez Crítica):**
   - Enriquecer `StructuredAiPrompt` para que incluya la definición del esquema JSON (JSON Schema o plantilla compacta con tipos obligatorios).
   - Configurar `LocalLlmManager` para pasar a `llama-server.exe` el parámetro `response_format: { "type": "json_object", "schema": ... }` o una gramática BNF restringida para garantizar que el modelo solo pueda emitir tokens que correspondan a campos válidos del struct Rust.
2. **Generalización de Persistencia de Conocimiento:**
   - Mantener las tablas actuales de recetas para compatibilidad con la slice culinaria, pero introducir `knowledge_documents` (`id`, `job_id`, `domain`, `content_type`, `payload_json`, `status`, `review_reasons`) para futuros dominios.
3. **Implementación de Registro de Auditoría de Tareas de IA:**
   - Crear la tabla `ai_task_executions` en SQLite para persistir el inicio, fin, duración en milisegundos, uso de tokens y errores de cada tarea (`DomainDetection`, `RecipeTransformation`).
4. **Conexión de Metadatos Reales:**
   - Reemplazar `"hash_placeholder"` en `commands.rs` por un cálculo SHA-256 sobre el `EditorialEvidencePackage`, y vincular `model_meta` al manifiesto activo.

---

## 18. Recommended Next Phase

### Decisión Fundamentada:
Corresponde adoptar la **ROUTE B — FOUNDATION PARTIALLY READY**.

```text
ESTADO ACTUAL: FOUNDATION PARTIALLY READY
SIGUIENTE FASE RECOMENDADA: HARDEN INTELLIGENCE FOUNDATION
```

**Justificación:**
No se debe saltar a implementar nuevos dominios ni UI de recetas mientras el puente `LLM → JSON tipado` falle en la deserialización con el modelo real. Tampoco se debe reiniciar la arquitectura (Route C) porque el runtime (`llama-server`), el modelo en disco, las heurísticas y la persistencia SQLite ya existen y funcionan.
La siguiente fase debe concentrarse exclusivamente en el **endurecimiento de la inferencia estructurada (schema injection / BNF grammar)** y la **conexión del ciclo de vida de tareas**.

---

## 19. Files Inspected

- `src-tauri/resources/local-llm-manifest.json`
- `src-tauri/resources/bin/llama-server.exe`
- `data/llm-models/qwen2.5-1.5b-instruct-q4_k_m.gguf`
- `src-tauri/src/domain/semantic.rs`
- `src-tauri/src/domain/recipe.rs`
- `src-tauri/src/domain/ai_task.rs`
- `src-tauri/src/domain/capabilities.rs`
- `src-tauri/src/domain/model_registry.rs`
- `src-tauri/src/application/local_ai_provider.rs`
- `src-tauri/src/application/domain_detector.rs`
- `src-tauri/src/application/knowledge_service.rs`
- `src-tauri/src/application/transformers/recipe.rs`
- `src-tauri/src/infrastructure/local_llm.rs`
- `src-tauri/src/db.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/main.rs`
- `docs/PULSARIA_INTELLIGENCE_ARCHITECTURE.md`

---

## 20. Commands Executed

```powershell
# Fase 1: Baseline y control
git status
git log --oneline -20
git diff --stat
git diff -- src-tauri
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npm run typecheck
npm run lint
npm run verify:canonical
npm run verify:frontend-secrets
npm run verify:mvp
npm run build

# Fase 3 y 13: Prueba de Runtime y Ejecución Real
& src-tauri/resources/bin/llama-server.exe --version
& src-tauri/resources/bin/llama-server.exe --model data/llm-models/qwen2.5-1.5b-instruct-q4_k_m.gguf --host 127.0.0.1 --port 18090 --api-key "testkey123" --no-webui --ctx-size 2048
curl.exe -s http://127.0.0.1:18090/health
curl.exe -s -H "Authorization: Bearer testkey123" http://127.0.0.1:18090/v1/models
python scratch/audit_llm_test.py
Stop-Process -Name llama-server -Force -ErrorAction SilentlyContinue
```
