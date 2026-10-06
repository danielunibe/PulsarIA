# Pulsaria — Model Selection (Fase 05)

> Benchmark v1.0 · Dataset v1.1 · 3 modelos reales · 2026-10-04.
> Reporte: `PULSARIA_MODEL_BENCHMARK.md` · Auditoría: `PULSARIA_MODEL_BENCHMARK_AUDIT.md`.

## 1. Selection Status

```text
STATUS: NO_PRODUCTION_CANDIDATE (strict gates)
```

Lectura estricta §15/§20: los tres modelos fallan el gate de inyección
(<80%) con prompt MINIMAL (50–67%), y Qwen1.5/PRODUCTION también (50%).
Ninguno califica para migración automática. **Producción sin cambios.**

## 2. Recommended Model (condicional)

```text
RECOMMENDED_MODEL: bartowski/gemma-2-2b-it-GGUF (Q4_K_M)
RECOMMENDATION_CONFIDENCE: MEDIUM
```

Reason:

- highest grounding (100/100/90%) y zero numeric hallucination en 90 casos;
- best conflict preservation (100% STANDARD y FULL, sin promediar);
- best recipe (87.5–100%) y best structured (100%, 0 inválidos en 90 casos);
- best long-context (100% hasta 16k chars; Qwen1.5 colapsa ≈4k);
- best overall/quality/balanced en STANDARD y FULL;
- latencia aceptable (4.3s STD, 5.9s FULL) y FITS en 8 GB (1.6 GB pesos);
- Pareto-optimal.

Conditions (obligatorias para calificar) — resultado follow-up STD-13:

1. Prompt endurecido de producción siempre (el MINIMAL es stress-test). ✅
2. Cerrar la clase STD-13: regla de schema-inmutable en prompt v1.1.0 +
   tests de regresión dedicados. ✅ implementado.
3. Re-benchmark tras el fix: **Qwen3B/PROD v1.1.0 injection 1.0** (condición
   cumplida para Qwen3B); **Gemma/PROD v1.1.0 injection 0.5** (STD-13 3/3
   determinista → condición NO cumplida para el recomendado);
   **Qwen1.5/PROD v1.1.0 22/36** (el template endurecido degrada al modelo
   pequeño: atractor de refusal). Confidence se mantiene **MEDIUM**
   (no sube a HIGH). Detalle: `PULSARIA_STD13_SECURITY_AUDIT.md`.
4. No migrar sin E2E recipe verde con el candidato. ✅ pendiente.

Why not Qwen3B: +2.4pp pass sobre 1.5B pero peor en conflictos (25%),
obedece STD-13, 2.3× más lento que 1.5B sin ventaja de grounding. Escala de
parámetros ≠ calidad (hipótesis 04 confirmada negativamente).

Why not Qwen1.5 (quitar baseline): sigue siendo speed leader y único con
perfil PRODUCTION medido (86.1%); se mantiene como BASELINE y fallback.

## 3. Task Winners

Ver Benchmark Report (5 NO_WINNER honestos: structured/spanish/query por
empate, security por gate, low_memory por VRAM no atribuible).

## 4. Registry

`data/benchmark-models.json` con `observed` reales + `last_benchmark` por
modelo; `ModelRegistry::default` mantiene Qwen1.5 `BASELINE`; resto
`UNDECIDED`. Separación declarado/medido/verificado en código.
