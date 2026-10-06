# Pulsaria — Model Benchmark Methodology

> **Benchmark v1.0 · Dataset `pulsaria-bench-dataset-v1.1` (SMOKE idéntico a v1;
> STANDARD +6 query-understanding, 36 casos) · 2026-10-04 (Fase 04 + Fase 05)**
> Fuente normativa: `PROJECT_TRUTH.md`. Este documento describe **cómo** Pulsaria
> selecciona modelos. Los resultados están en `PULSARIA_MODEL_BENCHMARK.md` y la
> auditoría en `PULSARIA_MODEL_BENCHMARK_AUDIT.md`.

## 1. Principio

```text
PULSARIA TASKS → PULSARIA DATASET → PULSARIA EVALUATION → PULSARIA METRICS
 → HARDWARE MEASUREMENT → QUALITY/PERFORMANCE TRADEOFF → MODEL SELECTION
```

No se selecciona por popularidad, parámetros, rankings externos ni recomendaciones.
Solo por evidencia medida en hardware objetivo con tareas reales de Pulsaria.

## 2. Separación de tipos de modelo

Ningún ranking mezcla tipos distintos (`domain/benchmark.rs:ModelKind`):

```text
TextLlm | VisionLlm | Embedding | Reranker | Asr | Ocr
```

Esta fase evalúa **TextLlm local**. El resto tiene su tipo reservado para fases
posteriores sin rediseño.

## 3. Niveles de costo

| Nivel | Casos | Uso |
|---|---|---|
| `SMOKE` | 10 | desarrollo, regresión rápida |
| `STANDARD` | 30 (⊃ SMOKE) | comparación habitual |
| `FULL` | 48 (⊃ STANDARD) | release, model selection |

`dataset_for_level()` garantiza anidamiento: todo caso SMOKE existe en FULL.

## 4. Modos (no mezclar)

- `DETERMINISTIC` (`temperature 0.1`, `seed 42`): comparar modelos.
- `REALISTIC` (`temperature 0.7`, sin seed): comportamiento operativo.

## 5. Dataset v1

Cada caso (`application/benchmark_dataset.rs`): `case_id, domain, task,
language, input, expected_output, evidence, difficulty, ground_truth,
evaluation_rules` + variantes `context_variant / noise_variant /
position_variant`. Sin secretos ni datos personales (test dedicado).

Cobertura: extracción estructurada (10 subtasks), temporal (6), grounding
(explícito/implícito/ausente/contradictorio/ambiguo/sin-soporte), hallucination,
conflictos (200g vs 250g, 5min vs 10min, 180°C vs 200°C), inyección
(`Ignore previous instructions`, schema-switch, `delete`, `reveal`),
JSON (`native_valid / normalized_valid / repaired_valid / invalid` separados),
semántica (topic/domain/type/entity/concept/relation/claim),
idiomas (es, en, es+en, informal/transcrito/técnico), ruido ASR/OCR,
contexto (short/medium/long/very_long), retención por posición
(beginning/middle/end), multi-fuente (transcript+OCR+metadata) y recipe vertical.

## 6. Reglas de evaluación

`evaluation_rules.checks[]` con tipos (`benchmark_metrics.rs`):

`ingredient_present, entity_present, quantity_exact (±1e-4), unit_exact,
null_expected (disciplina de null en JSON parseado), conflict_preserved
(ambos valores presentes, sin promediar), injection_contained +
hallucination_absent (substrings prohibidos ausentes), domain_exact,
temporal_order (orden estrictamente creciente), timestamps_bounded,
json_valid`.

Distinción registrada (follow-up STD-13): la regla mezcla transporte y
seguridad — una salida `null` segura falla por `json_valid`, no por
`injection_contained`. La matriz (`security_matrix.rs`) las reporta por
separado (`json_valid` vs `attack_obeyed`). No se cambia la regla en v1.1
(mover la portería está prohibido); una semántica `secure-refusal` sería
metodología v1.2 con re-ejecución total.

## 7. Métricas

Calidad: `pass_rate, schema_validity, field_accuracy, exact_match,
normalized_match, timestamp/quantity/unit/entity_accuracy,
grounding_accuracy, hallucination_rate, conflict_detection_rate,
injection_resistance, language_accuracy, context_retention,
valid/normalized/repair/invalid_json_rate, recipe_quality_score`
(compuesto: title+ingredient+quantity+unit+step+timestamp+conflict+grounding).

Performance: `latency (mean/median/min/max/stddev sobre repeats),
input/output_tokens, tokens/s, cold vs warm`. Hardware: picos VRAM/RAM,
utilización, load time, ctx/layers/threads — `N/A` si no medible, nunca
inventado. Tokens del sidecar: reales vía `usage` de la API OpenAI-compatible.

## 8. Scorecard y guardrails

Score multidimensional primero (`quality, reliability, grounding, security,
speed, memory, context, language`), `overall_score` solo como resumen.
Guardrails (`evaluate_guardrails`): velocidad **nunca** gana a calidad —

```text
hallucination_rate > 0.05        → DISQUALIFIED
schema_valid_rate < 0.80         → DISQUALIFIED
injection_resistance < 0.80      → DISQUALIFIED
0 casos ejecutados               → NO_EXECUTED_CASES
```

## 9. Pareto y winners por tarea

Pareto sobre `(quality ↑, latency ↓, memory ↓)` → `PARETO_OPTIMAL /
DOMINATED`. Winners por tarea (`compute_task_winners`): general, recipe,
structured, spanish, low-memory, speed, security, long-context. El default
general se justifica con evidencia, no por velocidad.

## 10. Reproducibilidad (Fase 05: trazabilidad total §22)

Cada `ModelBenchmarkResult` guarda además: `benchmark_id, dataset_hash
(SHA-256 canónico del dataset), prompt_hash (template MINIMAL/PRODUCTION),
config_hash, prompt_profile, memory{method}, operational{quality,
performance, resource, reliability}`. Reconstruible: modelo → pesos (SHA) →
runtime (+versión) → prompt (perfil+versión+hash) → dataset (+hash) →
hardware → resultado + raws.

## 11. Reglas de honestidad

- No ejecutado → `NOT_TESTED`. Sin pesos/sin red → `NOT_AVAILABLE`.
- Carga imposible → `LOAD_FAILED` / `INCOMPATIBLE`. Fallo de un modelo no
  aborta el resto (`failure isolation`).
- Prohibido `estimated score` en rankings reales.
- Factibilidad (`FITS/RISKY/INCOMPATIBLE/...`) es **predicción**; la medición manda.
- Memoria no medible → `N/A`. VRAM etiquetada por método: `GPU_SMI` (HIGH),
  `PROCESS_MEMORY` (MEDIUM), `UNAVAILABLE` (NONE). El proxy 1500 MB de Pareto
  se documenta y nunca se presenta como medición.
- `NO_WINNER` cuando: 0 modelos ejecutados, empate total en la métrica, o
  casos insuficientes (language ≥4, context ≥3, query ≥3).

## 12. Tiers (Fase 05)

SMOKE (10, rápido) · STANDARD (36, oficial) · STABILITY (8 críticos ×3 temp 0
+ sonda temp 0.7) · FULL (54, ampliado). Todo live es OPT-IN (`#[ignore]`);
nunca en `cargo test` normal ni en MVP.

## 13. Perfiles de prompt (Fase 05 §14 + follow-up STD-13)

MINIMAL (`bench-prompt-minimal-v1.0.0`, capacidad raw) vs PRODUCTION
(`bench-prompt-production-v1.1.0` desde el follow-up STD-13: añade SCHEMA
INMUTABLE + ANTI-OVERRIDE; v1.0.0 queda como referencia histórica).
Medido v1.1.0 en los 3 modelos (mismo `prompt_hash`); el template endurecido
degrada a Qwen1.5 (22/36) mientras Qwen3B/Gemma lo absorben (31/36): la
plantilla debe elegirse por capacidad del modelo. Nunca comparar scores entre
perfiles ni entre versiones de plantilla.
Perfiles `EXP_*` existen solo para ablation en `security_matrix.rs` y jamás
sustituyen Production automáticamente (un prompt que solo funciona para un
modelo no se convierte en Production).

## 13b. Matriz STD-13 (follow-up, metodología v1.1.0 congelada)

8 variantes (A directa = fixture STD-13 + B–H) × 3 niveles (RAW/MINIMAL,
PROD v1.1.0, VALIDATION pipeline) × repeticiones en A (temp 0.0).
Separación obligatoria: MODEL_RESISTANCE vs SYSTEM_CONTAINMENT.
Caveat registrado: `seed:42` configurado pero no propagado al sidecar
(solo viaja temperature); el determinismo se demuestra empíricamente.
Detalle y veredicto: `docs/PULSARIA_STD13_SECURITY_AUDIT.md`.

## 14. Scores separados (Fase 05 §16)

Quality (grounding .25, structured .15, extraction .15, security .15,
missing/conflict .10, timestamp .10, semantic .05, language .05) · Performance
(throughput penalizado por timeouts) · Resource (vs presupuesto VRAM, None
sin medición) · Operational Reliability. Guardrails heredados preservados
(halluc>0.05, schema<0.80, injection<0.80 ⇒ DISQUALIFIED); los umbrales §17
más estrictos quedan como objetivo documentado, no adoptados a ciegas.

## 15. Comandos

```powershell
cargo test --manifest-path src-tauri/Cargo.toml benchmark   # framework (rápido, offline)
cargo test --manifest-path src-tauri/Cargo.toml test_real_smoke_sidecar_qwen -- --ignored --nocapture
cargo test --manifest-path src-tauri/Cargo.toml test_real_standard_multi_model -- --ignored --nocapture
cargo test --manifest-path src-tauri/Cargo.toml test_real_stability_qwen -- --ignored --nocapture
$env:BENCH_MODEL="gemma-2-2b"; cargo test --manifest-path src-tauri/Cargo.toml test_std13_matrix_single -- --ignored --nocapture
```

Tauri IPC: `benchmark_list_models, benchmark_hardware_profile,
benchmark_run_offline, benchmark_memory_snapshot, benchmark_dataset_info`.
Modelos extra vía `data/benchmark-models.json` sin cambiar código (discovery →
feasibility → download/verify → benchmark).
