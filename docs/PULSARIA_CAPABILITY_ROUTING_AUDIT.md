# PULSARIA — CAPABILITY ROUTING AUDIT REPORT
## Reality Verification of Deterministic Model Routing

---

## 1. WHAT EXISTS

Antes de la Fase 07, Pulsaria disponía de:
1. **Model Registry** (`src-tauri/src/domain/model_registry.rs`): Catálogo de 3 modelos GGUF declarados con metadatos de arquitectura y filenames.
2. **Benchmark Framework** (`src-tauri/src/application/benchmark_*.rs`): Suite offline con dataset versionado `benchmark-dataset-v1.0.0` y runner de pruebas sintéticas y reales.
3. **Security Matrix** (`src-tauri/src/application/security_matrix.rs`): Protocolo congelado STD-13 para evaluar inyección de prompts y sobreescritura de esquema.
4. **Benchmark Evidence**: Resultados empíricos congelados en `data/benchmarks/` y documentos de auditoría (`PULSARIA_MODEL_BENCHMARK.md`, `PULSARIA_STD13_SECURITY_AUDIT.md`).
5. **Recipe E2E Vertical Slice**: Pipeline completo de extracción culinaria verificado (`recipe_e2e_tests.rs`).

---

## 2. WHAT WAS IMPLEMENTED

En la Fase 07 se implementó:
1. **Contratos de Dominio de Routing** (`src-tauri/src/domain/routing.rs`):
   - Tipos de tareas (`TaskType`), niveles de seguridad (`SecurityLevel`), confianza de contenido (`ContentTrust`), niveles de evidencia (`EvidenceLevel`).
   - `TaskRequirements` con constructores específicos por tipo de tarea.
   - `ModelAvailabilityStatus` formal de 6 fases.
   - `RejectionReason` tipado para cada restricción dura y descarte.
   - `ModelCapabilityProfile` con vector de métricas y marcador empírico `std13_vulnerable`.
   - `RoutingDecision` con modelo seleccionado, razones auditables, `fallback_chain` y confianza formal.
2. **Motor de Routing Determinista** (`src-tauri/src/application/capability_router.rs`):
   - 100% Rust puro, offline, determinista, sin LLMs en el ciclo de decisión.
   - Pipeline de 5 etapas: Disponibilidad de pesos locales → Filtrado por Hard Constraints → Scoring determinista → Desempate unívoco → Cadena de fallback.
   - Diagnóstico explicable y auditable (`explain`).
3. **IPC Bridge** (`src-tauri/src/commands.rs` y `src-tauri/src/main.rs`):
   - `route_task`: Encamina tareas hacia el modelo óptimo.
   - `explain_routing`: Devuelve diagnóstico formateado con razones de descarte.
   - `get_model_capability_profiles`: Expone perfiles de evidencia a la aplicación.
4. **Suite de Pruebas**:
   - 11 pruebas unitarias y de propiedades en `capability_router.rs` (determinismo, monotonicidad, safe failure, dominancia de hard constraints, STD-13 injection filtering).

---

## 3. WHAT IS VERIFIED

Las siguientes propiedades y métricas están **formalmente demostradas por tests automatizados en el repositorio**:

1. **Determinismo Estricto**:
   Ejecutar el router 100 iteraciones consecutivas idénticas produce exactamente la misma decisión de modelo, las mismas puntuaciones y la misma cadena de fallback (`test_routing_determinism`).
2. **Dominancia de Hard Constraints**:
   Un modelo con score superior nunca puede ser seleccionado si viola una restricción dura de memoria, latencia, seguridad o formato (`test_property_hard_constraint_dominates_score`).
3. **Rechazo de Inseguridad STD-13**:
   Para contenido no confiable (`ContentTrust::UntrustedPublic` o `AdversarialRisk`), Gemma-2-2B es descalificado automáticamente por la restricción dura `Std13UntrustedContentVulnerability`, cediendo la selección a Qwen2.5-3B (`test_untrusted_content_rejects_gemma_via_std13_hard_constraint`).
4. **Selección Óptima por Fidelidad Culinaria**:
   Para recetas confiables (`ContentTrust::TrustedCurated`), Gemma-2-2B es seleccionado debido a su 100% de grounding y 96.7% de calidad de receta (`test_trusted_curated_recipe_selects_gemma_for_grounding_and_quality`).
5. **Selección Operacional por Velocidad**:
   Para tareas de baja latencia (`FastOperationalTask`), Qwen2.5-1.5B es seleccionado por su rendimiento de 8.1 tok/s y latencia de 1.4s (`test_fast_operational_task_selects_qwen15_for_speed`).
6. **Safe Failure**:
   Si ningún modelo cumple los requisitos presupuestarios, el sistema rechaza la ejecución de forma segura sin recurrir a fallbacks ciegos (`test_safe_failure_when_memory_budget_is_impossible`).
7. **Incompatibilidad de Modelos No Disponibles**:
   Un modelo no disponible localmente en disco es rechazado antes de la evaluación de capacidades (`test_unavailable_model_is_rejected`).
8. **Monotonicidad y Desempate**:
   La incorporación de candidatos inferiores nunca desplaza al ganador; los empates se resuelven mediante throughput, memoria y orden léxico (`test_property_monotonicity_worse_candidate_cannot_displace_winner`).
9. **Cero Regresiones**:
   Los 262 tests unitarios de Rust (`cargo test`) y los 13 gates MVP (`npm run verify:mvp`) pasan al 100%.

---

## 4. WHAT IS OBSERVED

Métricas observadas bajo las condiciones de hardware locales (Windows, CPU Intel Core i7, sin GPU dedicada activa durante las pruebas del sidecar):

1. **Throughput de Inferencia**:
   Qwen 1.5B alcanza ~8.1 tok/s; Gemma 2B alcanza ~5.2 tok/s; Qwen 3B alcanza ~4.8 tok/s.
2. **Latencia de Primer Token**:
   Oscila entre 1.4s (Qwen 1.5B) y 2.1s (Qwen 3B).
3. **Fidelidad Semántica en Español**:
   Los tres modelos demuestran comprensión correcta de terminología culinaria e instrucciones en español con variaciones menores de sintaxis.

---

## 5. WHAT IS ESTIMATED

1. **Comportamiento bajo Concurrencia de Múltiples Tareas**:
   La contención de memoria bajo invocaciones concurrentes del sidecar está modelada asumiendo ejecución serializada o una única instancia de `llama-server` cargada a la vez.

---

## 6. WHAT IS NOT YET PROVEN

1. **Rendimiento con GPU VRAM Offload (CUDA/Vulkan)**:
   Aunque el código contempla budgets de VRAM, los tests verificados de Fase 04/05 se ejecutaron en CPU host. El throughput bajo aceleración por GPU real permanece como medición futura cuando hardware compatible esté conectado.
2. **Comportamiento Dinámico de Auto-Swap de Pesos en Caliente**:
   El router decide la asignación óptima de modelo, pero el cambio dinámico de binarios cargados en un mismo sidecar sin reiniciar el proceso `llama-server` es una capacidad de orquestación de infraestructura sujeta a pruebas de estabilidad en ejecución real prolongada.
