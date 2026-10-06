# PULSARIA — ROUTING POLICY v1.0
## Deterministic Scoring, Hard Constraints, and Fallback Specifications

---

## 1. Policy Identity

- **Policy Version**: `routing-policy-v1.0`
- **Evidence Benchmark Version**: `bench-v1.0.0`
- **Dataset Version**: `benchmark-dataset-v1.0.0`
- **Determinism Guarantee**: 100% reproducible across runs without floating point variance or non-deterministic data structures.

---

## 2. Hard Constraints Matrix

Antes de computar cualquier score, los candidatos deben superar el conjunto completo de **Hard Constraints**. El incumplimiento de una sola restricción produce el descarte inmediato del modelo:

| Restricción | Condición de Activación | Umbral Requerido | Razón de Rechazo Tipada |
|-------------|-------------------------|------------------|-------------------------|
| **C1: Disponibilidad** | Siempre | Estado $\ne$ `Registered` (pesos presentes) | `ModelNotAvailable` / `ModelNotLoadable` |
| **C2: Presupuesto de Memoria** | `max_memory_mb.is_some()` | `profile.memory_budget_mb <= max_mb` | `MemoryBudgetExceeded` |
| **C3: Presupuesto de Latencia** | `max_latency_ms.is_some()` | `profile.latency_ms <= max_ms` | `LatencyBudgetExceeded` |
| **C4: Salida Estructurada** | `requires_structured_output` | `structured_output >= 0.90` (90%) | `StructuredOutputThresholdNotMet` |
| **C5: Grounding Estricto** | `requires_high_grounding` | `grounding >= 0.70` (70%) | `GroundingThresholdNotMet` |
| **C6: Resistencia STD-13** | `security_level >= High` | `security_resistance >= 0.80` (80%) | `SecurityThresholdNotMet` |
| **C7: Contenido No Confiable** | `content_trust.is_untrusted()` | `std13_vulnerable == false` | `Std13UntrustedContentVulnerability` |

> [!CRITICAL]
> **La regla C7 es inviolable:** Gemma-2-2B tiene `std13_vulnerable: true` (resistencia medida 37.5%, vulnerabilidad ante secuestro de schema `admin:true`). Ante contenido no confiable (web, comentarios, audio externo, transcripciones), queda descalificado antes del scoring.

---

## 3. Deterministic Fit Scoring Formulas

Una vez superados los Hard Constraints, los modelos elegibles se puntúan mediante funciones afines normalizadas:

### 3.1 Normalización de Velocidad
$$\text{speed\_norm} = \min\left(1.0, \frac{\text{tokens\_per\_second}}{10.0}\right)$$

### 3.2 Fórmulas por Tipo de Tarea

#### Tarea 1: `RecipeExtraction` (Fidelidad Culinaria)
$$\text{Score} = 0.35 \cdot \text{grounding} + 0.25 \cdot \text{recipe\_quality} + 0.20 \cdot \text{structured} + 0.10 \cdot \text{speed\_norm} + 0.10 \cdot \text{security}$$
- *Objetivo*: Priorizar máxima exactitud en ingredientes y pasos sustentados por timestamps.

#### Tarea 2: `SecuritySensitiveExtraction` (Contenido Adversarial / No Confiable)
$$\text{Score} = 0.50 \cdot \text{security} + 0.25 \cdot \text{structured} + 0.15 \cdot \text{grounding} + 0.10 \cdot \text{speed\_norm}$$
- *Objetivo*: Maximizar contención y rechazo estricto ante ataques de inyección.

#### Tarea 3: `FastOperationalTask` & `QueryUnderstanding` (Operación Rápida)
$$\text{Score} = 0.45 \cdot \text{speed\_norm} + 0.30 \cdot \text{structured} + 0.15 \cdot \text{grounding} + 0.10 \cdot \text{security}$$
- *Objetivo*: Minimizar latencia y maximizar throughput en tareas de soporte interactivo.

#### Tarea 4: `ContextSynthesis` (Síntesis de Contexto Extenso)
$$\text{Score} = 0.40 \cdot \text{long\_context} + 0.30 \cdot \text{grounding} + 0.20 \cdot \text{structured} + 0.10 \cdot \text{speed\_norm}$$
- *Objetivo*: Maximizar la retención y coherencia sobre transcripciones extensas.

#### Tarea 5: `StructuredExtraction` (Extracción Estructurada Genérica)
$$\text{Score} = 0.30 \cdot \text{structured} + 0.30 \cdot \text{grounding} + 0.20 \cdot \text{security} + 0.20 \cdot \text{speed\_norm}$$

---

## 4. Desempate Formal (§24)

Para garantizar un orden determinista y estable, la ordenación de candidatos elegibles sigue una jerarquía secuencial estricta:

1. **Score descendente**: Candidato con mayor puntuación compuesta.
2. **Throughput descendente**: Candidato con mayor tasa de tokens por segundo.
3. **Presupuesto de memoria ascendente**: Candidato con menor huella de RAM/VRAM.
4. **Orden léxico de `model_id`**: Desempate final determinista sobre la cadena del identificador.

---

## 5. Fallback Chain y Safe Failure (§18)

- **Primary Selected**: Candidato con la primera posición en la ordenación determinista.
- **Fallback Chain**: Los candidatos elegibles restantes ordenados secuencialmente de mayor a menor idoneidad.
- **Safe Failure**: Si ningún candidato supera las restricciones duras, el router no recurre a ningún modelo arbitrario. Devuelve explícitamente:
  ```rust
  RoutingError::SafeFailureNoEligibleCandidates { task_type, rejected }
  ```
  detallando la lista completa de candidatos y las razones por las cuales fueron rechazados.
