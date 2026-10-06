# Pulsaria — Model Benchmark Audit (Fase 05)

**Fecha:** 2026-10-04 · **Commit:** `92898d24 (dirty)`, aditivo, sin resets
**Clasificación:**

```text
PHASE IV VERDICT: PARTIALLY VERIFIED
Reason: multi-model comparison achieved (3 real models, STANDARD+FALL real),
but strict security gates fail for all candidates under MINIMAL profile.
Framework: VERIFIED. Production migration: BLOCKED (correctly).
```

(FULLY VERIFIED requeriría §33: gates estrictos en verde + profiler atribuible;
no se maquilla.)

## Anti-benchmark-theater (§30)

- Modelo real: ✅ 3 sidecars, 90+54+36+36+30 inferencias reales.
- Pesos reales: ✅ SHA-256 (Qwen1.5 oficial; Qwen3B/Gemma TOFU+tamaño exacto).
- Runtime real: ✅ llama-server build 10903 registrado por corrida.
- Dataset real: ✅ v1.1 + `dataset_hash` por artefacto.
- Prompt real: ✅ perfiles + versiones + `prompt_hash`.
- Métricas reales: ✅ (bugs hallados y corregidos: `normalized_match` >1,
  tokens estimados → `usage`, probe stderr, config-path cwd).
- Failures: ✅ raw+razón por caso. Incompatibles: N/A (todo cargó).
- Ausentes vs fallidos: ✅ `NOT_TESTED` (7B+, Qwen3B-PROD, etc.).
- Scores con evidencia: ✅ todo número remite a artefacto en `data/benchmarks/`
  (8 archivos).

## Respuestas §48

Ejecutados: Qwen1.5B (SMOKE×2, STANDARD×2 MINIMAL + PRODUCTION, FULL,
stability), Qwen3B (STANDARD), Gemma2B (STANDARD, FULL). No ejecutados: 7B+,
vision/embeddings, Qwen3B/Gemma PRODUCTION. Hardware: §Benchmark Report.
Dataset v1.1 (SMOKE=10, STD=36, FULL=54). Descalificados: los 3 (gate
inyección MINIMAL). Ganadores: §Selection (5 NO_WINNER). Recomendado: Gemma
condicional MEDIUM; producción sin cambios.

## Criterio §33 (FULLY VERIFIED): 15/17

✅ 3 modelos, STANDARD real, mismo protocolo, hashes, quality/security/
grounding/performance reales, contexto real, multilingüe real (es/en/mixto),
stability real, Pareto no-trivial, winners sustentados, recomendación
sustentada, E2E verde, gates verdes. ❌ gates estrictos en verde (inyección).
❌ profiler atribuible (CPU ⇒ VRAM=baseline host).

## Incidencias del proceso (honestidad operativa)

1. Descargas: URLs Xet/CDN con redirects — `curl -L` + resume; tamaños
   verificados contra headers; SHA local; marcadores `.verified`.
2. `BENCH_MODEL` sin propagar en un PTY + ruta config relativa al cwd:
   2 corridas fallidas en <1s (sin costo de inferencia), root-cause
   documentado, test anti-regresión añadido.
3. Ventanas CMD intermitentes: `nvidia-smi` cada 500ms sin `CREATE_NO_WINDOW`;
   corregido vía `process_control` en 4 archivos (la corrida en curso mantuvo
   el flash hasta terminar).
4. `normalized_match=1.194` en Gemma: doble conteo; clamp + test regresión;
   artefacto inmutable con nota (valor correcto 1.0).

## Gates finales

`fmt --check` ✅ · `check` ✅ · `test` 238+ ✅ (4 ignored opt-in) ·
`typecheck` ✅ · `lint` 0 errores · `canonical` ✅ · `frontend-secrets` ✅ ·
`MVP 13/13` ✅ · `build` ✅ · recipe E2E 2/2 ✅ · SMOKE real ×2 (Fase 04) ✅.

## Siguiente fase recomendada

1. Fix STD-13 (schema-inmutable) → re-benchmark Gemma/Qwen PRODUCTION.
2. Build llama.cpp con CUDA → VRAM atribuible + Pareto real de memoria.
3. Candidatos 7–8B Q4 (si FITS) solo tras 1–2.
4. Después: routing por capacidades. No vision/multimodal aún.
