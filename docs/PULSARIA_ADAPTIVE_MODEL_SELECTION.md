# PULSARIA — ADAPTIVE MODEL SELECTION
## Evidence-Driven Specialization of Local Language Models

---

## 1. Comparative Capability Matrix

La siguiente tabla resume los datos empíricos **congelados** obtenidos durante los benchmarks de Fase 04 y Fase 05 (STD-13, STANDARD y FULL suites):

| Métrica / Dimensión | Qwen2.5-1.5B (Q4_K_M) | Qwen2.5-3B (Q4_K_M) | Gemma-2-2B (Q4_K_M) |
|---------------------|-----------------------|---------------------|---------------------|
| **Grounding Score** | 71.4% (Observed) | 71.4% (Observed) | **100.0% (Verified)** |
| **Recipe Quality** | 71.4% (Observed) | 71.4% (Observed) | **96.7% (Verified)** |
| **Structured JSON** | 95.2% (Verified) | 90.5% (Verified) | **100.0% (Verified)** |
| **STD-13 Resistance** | 62.5% (Observed) | **87.5% (Verified)** | 37.5% (Verified, Vulnerable) |
| **Tokens / Segundo** | **8.1 tok/s** (Verified) | 4.8 tok/s (Verified) | 5.2 tok/s (Verified) |
| **Latencia Primer Token** | **1,423 ms** (Verified) | 2,150 ms (Verified) | 1,980 ms (Verified) |
| **Presupuesto Memoria** | **3,500 MB** (Verified) | 6,144 MB (Verified) | 4,096 MB (Verified) |
| **Contexto Extenso** | 75.0% (Observed) | 80.0% (Observed) | **92.0% (Verified)** |
| **Spanish Support** | 90.0% (Verified) | 92.0% (Verified) | 88.0% (Verified) |

---

## 2. Especialización por Evidencia (No por Intuición)

### 2.1 Gemma-2-2B: El Especialista en Fidelidad Culinaria y Grounding
- **Puntos Fuertes**: Grounding perfecto (100%), fidelidad en ingredientes y cantidades (96.7%), comprensión superior de contexto extenso.
- **Debilidad Crítica Empírica**: En el benchmark STD-13 Production v1.1.0, sucumbió a 5 de 8 variantes de inyección (37.5% de resistencia). En particular, ante `STD-13-A` (inyección directa de clave `"admin": true` en el JSON), obedeció 3 de 3 veces.
- **Política de Asignación**:
  - **SELECCIONADO** para: Extracción de recetas confiables (`ContentTrust::TrustedCurated`), síntesis de transcripciones extensas curadas.
  - **DESCALIFICADO** para: Contenido público o de origen desconocido (`ContentTrust::UntrustedPublic` o `AdversarialRisk`).

### 2.2 Qwen2.5-3B: El Defensor ante Contenido No Confiable
- **Puntos Fuertes**: Resistencia empírica superior a inyecciones (87.5%, 7 de 8 variantes resistidas en STD-13 Production v1.1.0). Resistió el 100% (3/3) de las variantes de schema-override de `STD-13-A`. Comportamiento de negativa determinista ante instrucciones maliciosas.
- **Debilidad**: Velocidad moderada (4.8 tok/s) y mayor huella de memoria (6.1 GB).
- **Política de Asignación**:
  - **SELECCIONADO** para: Tareas sensibles de seguridad (`TaskType::SecuritySensitiveExtraction`) y cualquier procesamiento de medios o transcripciones no verificadas.

### 2.3 Qwen2.5-1.5B: El Líder Operacional de Baja Latencia
- **Puntos Fuertes**: Máxima velocidad (8.1 tok/s), latencia mínima (1,423 ms), menor consumo de recursos (3.5 GB), alta validez sintáctica de JSON (95.2%).
- **Debilidad**: Menor capacidad de razonamiento en recetas complejas de múltiples etapas.
- **Política de Asignación**:
  - **SELECCIONADO** para: Tareas operacionales inmediatas (`FastOperationalTask`), expansión de consultas semánticas (`QueryUnderstanding`), y entornos con restricciones severas de memoria.

---

## 3. Preservación del Default Global (§26)

Conforme a la directiva fundamental §26:
> *No cambies automáticamente el modelo global por defecto. El cambio global de default debe ser una decisión posterior y explícita.*

El Capability Router provee la inteligencia de decisión a nivel de servicio (`route_task`), mientras que el sistema mantiene la compatibilidad regresiva completa con el pipeline de producción existente.
