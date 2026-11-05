# PULSARIA — CAPABILITY ROUTING ARCHITECTURE
## Deterministic, Evidence-Based, Explainable Model Selection

---

## 1. Executive Summary

Pulsaria implementa un **Capability Router determinista** escrito al 100% en Rust puro dentro del backend de Tauri (`src-tauri/src/application/capability_router.rs`), gobernado por contratos formales de dominio (`src-tauri/src/domain/routing.rs`).

El router traduce la evidencia empírica congelada de los benchmarks de Pulsaria (Fase 04 y Fase 05: STD-13, STANDARD y FULL) en decisiones de selección adaptativa de modelos sin recurrir a LLMs, sin heurísticas improvisadas y sin llamadas de red.

```text
REAL EVIDENCE
     ↓
CAPABILITY PROFILES
     ↓
TASK REQUIREMENTS
     ↓
HARD SAFETY & RESOURCE FILTER
     ↓
DETERMINISTIC FIT SCORING
     ↓
TIE BREAKING & CONFIDENCE
     ↓
ROUTING DECISION & FALLBACK CHAIN
     ↓
MODEL PROVIDER / SIDECAR
     ↓
LOCAL LLM
     ↓
DOMAIN VALIDATION (CONTAINMENT)
     ↓
SQLITE PERSISTENCE
```

---

## 2. Core Architectural Principles

1. **AI Proposes, Pulsaria Validates, SQLite Persists, Evidence Proves**:
   El LLM nunca tiene autoridad para decidir qué modelo ejecutar, ni para validar su propia salida, ni para escribir en la base de datos.
2. **Separación de Resistencia de Modelo y Seguridad del Sistema**:
   `MODEL RESISTANCE ≠ SYSTEM SECURITY`. La resistencia empírica del modelo (e.g. STD-13) se utiliza para descartar candidatos de riesgo, pero la autoridad de contención reside en los validadores formales de Pulsaria (`RecipeValidator`, `DomainDetector`, etc.).
3. **Determinismo Estricto**:
   Ante el mismo `TaskRequirements`, mismo registro de modelos y misma evidencia, el router produce siempre exactamente la misma `RoutingDecision` y la misma `fallback_chain`.
4. **Hard Constraints Dominan Scoring**:
   Ningún score compuesto alto en velocidad o calidad puede rescatar a un modelo que viole una restricción dura (seguridad, memoria, latencia o integridad).
5. **Explicabilidad y Auditoría**:
   Toda decisión genera una justificación legible, un listado tipado de candidatos descartados con sus razones exactas (`RejectedCandidate`) y un desglose de puntuaciones.

---

## 3. Componentes del Router

### 3.1 Domain Contracts (`src-tauri/src/domain/routing.rs`)
- **`TaskType`**: `RecipeExtraction`, `QueryUnderstanding`, `StructuredExtraction`, `ContextSynthesis`, `SecuritySensitiveExtraction`, `FastOperationalTask`.
- **`SecurityLevel`**: `Low`, `Medium`, `High`, `Critical`.
- **`ContentTrust`**: `TrustedCurated`, `SemiTrusted`, `UntrustedPublic`, `AdversarialRisk`.
- **`EvidenceLevel`**: `Unknown`, `Estimated`, `Observed`, `Verified`.
- **`TaskRequirements`**: Especifica formalmente los requisitos funcionales, no funcionales y de seguridad de la tarea.
- **`ModelAvailabilityStatus`**: `Registered` → `Available` → `Loadable` → `Benchmarked` → `Eligible` → `Selected`.
- **`RejectionReason`**: Enum exhaustivo con razones tipadas de descarte (`SecurityThresholdNotMet`, `Std13UntrustedContentVulnerability`, `MemoryBudgetExceeded`, etc.).
- **`ModelCapabilityProfile`**: Vector de capacidades respaldado por evidencia de benchmark (`grounding`, `structured_output`, `security_resistance`, `tokens_per_second`, `std13_vulnerable`).
- **`RoutingDecision`**: Resultado inmutable con modelo seleccionado, razones, cadena de fallback ordenada, scores de todos los elegibles y nivel de confianza.

### 3.2 Application Service (`src-tauri/src/application/capability_router.rs`)
- **`CapabilityRouter`**: Motor de evaluación offline.
- Carga de perfiles congelados de Fase 04/05 (`Qwen 1.5B`, `Qwen 3B`, `Gemma 2B`).
- Comprobación de existencia de pesos en disco (`data/llm-models`).
- Pipeline de 5 etapas:
  1. **Discovery & Availability Check**: Valida estado de pesos en disco.
  2. **Hard Constraint Filtering**: Aplica filtros de memoria, latencia, validez JSON ($\ge 90\%$), grounding ($\ge 70\%$) y resistencia STD-13 ($\ge 80\%$ y rechazo de `std13_vulnerable` para contenido no confiable).
  3. **Deterministic Scoring**: Calcula ajuste funcional según la matriz de pesos de la política.
  4. **Formal Tie Breaking**: Ordenación unívoca (Score descendente → Throughput descendente → Memoria ascendente → Lexical `model_id`).
  5. **Fallback Chain & Confidence**: Construye lista ordenada de reemplazos elegibles y calcula confianza según la certeza de la evidencia.

---

## 4. Tauri IPC Commands

El router está expuesto a la capa de aplicación e interfaz mediante comandos IPC tipados en `src-tauri/src/commands.rs`:

| Comando | Entrada | Salida | Descripción |
|---------|---------|--------|-------------|
| `route_task` | `TaskRequirements` | `RoutingDecision` | Selecciona el modelo primario y construye la cadena de fallback. |
| `explain_routing` | `TaskRequirements` | `String` (formato diagnóstico) | Emite el reporte de auditoría de la decisión. |
| `get_model_capability_profiles` | Ninguna | `Vec<ModelCapabilityProfile>` | Devuelve los perfiles de capacidades y evidencia de todos los modelos. |

---

## 5. Verificación y Regresión

El Capability Router cuenta con:
- 11 pruebas unitarias y de propiedades en `src-tauri/src/application/capability_router.rs`.
- Verificación de propiedades: Monotonicidad, Dominancia de Hard Constraints, Determinismo estricto, Ineligibilidad de modelos no disponibles.
- 0 advertencias y 0 errores en `cargo check`.
- 262 pruebas de backend verdes (`cargo test`).
- Suite completa de 13 gates MVP verdes (`npm run verify:mvp`).
