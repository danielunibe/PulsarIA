# PULSARIA — ROUTING & EXECUTION AUDIT REPORT (MEGA PROMPT 09)

## 1. Audit Dimensions & Verdicts

| Dimension | Verdict | Evidence / Justification |
|:---|:---:|:---|
| **ROUTING VERIFIED** | **PASS** | `CapabilityRouter::route_task` selecciona determinísticamente candidatos según requisitos de tarea, seguridad `STD-13` y restricciones de recursos (11/11 tests unitarios y de propiedades pasados). |
| **EXECUTION VERIFIED** | **PASS** | Inferencia real ejecutada contra `llama-server.exe` (build 10903) y pesos reales `qwen2.5-1.5b-instruct-q4_k_m.gguf` y `qwen2.5-3b-instruct-q4_k_m.gguf`, validada por Serde (`test_8` y `test_16`). |
| **MODEL IDENTITY VERIFIED** | **PASS (RESOLUTION LEVEL)** | El modelo seleccionado se resuelve hacia el archivo GGUF canónico inmutable con hash SHA-256 verificado en disco y se pasa explícitamente mediante `--model <path>`. *Garantía de runtime:* Se pasa el path canónico al binario del sistema operativo; el payload HTTP de `llama-server` no expone firma criptográfica. |
| **SINGLE ACTIVE MODEL** | **PASS** | Invariante `MAX_ACTIVE_MODELS = 1` reforzado por `Arc<Mutex<Option<BenchmarkSidecar>>>` en `RealSidecarRunner`. Verificado en test unitario (`test_10`) y tiempo de ejecución real (`test_16`). |
| **CONTROLLED MODEL SWITCH** | **PASS (REAL RUNTIME)** | Verificado en tiempo real con `llama-server.exe`: Modelo A (Qwen 1.5B, PID `29896`, Port `64740`) completó inferencia; se detuvo limpiamente; Modelo B (Qwen 3B, PID `42984`, Port `59027`) inició, pasó health check y ejecutó inferencia (`test_16`). |
| **PROCESS CRASH RECOVERY** | **PASS** | Si `llama-server.exe` cae durante inferencia, el runner sondea `is_alive()`, captura el código de salida, limpia el cerrojo y produce `ExecutionError::ProcessExited` sin congelar el backend (`test_13`). |
| **EXECUTION TIMEOUT** | **PASS** | Timeout determinista envuelve llamadas de inferencia y produce `ExecutionError::Timeout` tipado tras el límite temporal establecido (`test_14`). |
| **CLEANUP / DROP** | **PASS** | `BenchmarkSidecar::shutdown()` envía señal de kill y espera `child.wait()` con timeout de 5 segundos. Ningún proceso queda huérfano (`test_15`). |
| **HOT SWAP IN-SITU** | **NOT SUPPORTED** | `llama-server` no soporta cambio de pesos dentro del mismo proceso sin reiniciar el binario. Pulsaria no simula un falso hot-swap in-situ. |

---

## 2. Test Matrix Summary

| Scenario / Test Case | Router Decision | Provider | Runtime Target | Model Identity | Validation | Status |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Test 1: Fast Operational** | Qwen 1.5B | RoutedModelExecutor | MockRunner | Spec Resolved | PASS (Serde) | **PASS** |
| **Test 2: Security Sensitive (Untrusted)** | Qwen 3B | RoutedModelExecutor | MockRunner | Spec Resolved (Gemma Blocked) | PASS (Serde) | **PASS** |
| **Test 3: High Fidelity Recipe (Trusted)** | Gemma 2B | RoutedModelExecutor | MockRunner | Spec Resolved | PASS (Serde) | **PASS** |
| **Test 4: Primary Model Unavailable** | Gemma 2B -> Fallback Qwen 3B | RoutedModelExecutor | MockRunner | Spec Resolved | PASS (Serde) | **PASS** |
| **Test 5: Safe Failure (All Fail)** | Safe Failure (`NoEligibleFallback`) | RoutedModelExecutor | MockRunner | No Silent Replacement | N/A | **PASS** |
| **Test 6: No Deviation Enforcement** | Qwen 3B (Forced Gemma Blocked) | RoutedModelExecutor | Blocked | `RoutingExecutionMismatch` | N/A | **PASS** |
| **Test 7: Model Identity Resolution** | Deterministic GGUF mapping | ModelRegistry | Local disk | SHA-256 `.verified` Match | PASS | **PASS** |
| **Test 8: Real llama-server Runtime** | Qwen 1.5B | RealSidecarRunner | `llama-server.exe` (CPU) | `qwen2.5-1.5b-...gguf` (SHA OK) | PASS (Serde) | **PASS** |
| **Test 9: Lifecycle State Transitions** | State Machine | Domain | Domain Types | Contract Invariants | PASS | **PASS** |
| **Test 10: Single Active Model Invariant** | Mutex Isolation | RoutedModelExecutor | MockRunner | Active Process Exclusive | PASS | **PASS** |
| **Test 11: Controlled Process Restart Switch** | A -> B -> A | RoutedModelExecutor | MockRunner | Switch Count Verified | PASS | **PASS** |
| **Test 12: Warm Model Reuse** | Warm Path | RoutedModelExecutor | MockRunner | Zero Switch Overhead | PASS | **PASS** |
| **Test 13: Process Crash Recovery** | Crash Detection | RoutedModelExecutor | MockRunner | Typed ProcessExited | PASS | **PASS** |
| **Test 14: Execution Timeout Classification** | Timeout Detection | RoutedModelExecutor | MockRunner | Typed Timeout Error | PASS | **PASS** |
| **Test 15: Clean Shutdown and Cleanup** | Explicit Shutdown | RoutedModelExecutor | MockRunner | Active State Purged | PASS | **PASS** |
| **Test 16: Real Runtime Model Switch** | Qwen 1.5B -> Qwen 3B | RealSidecarRunner | `llama-server.exe` | Verified Real PIDs (29896 -> 42984) | PASS (Serde) | **PASS** |

---

## 3. Real Runtime Switch Telemetry (`Test 16`)

```text
=== REAL RUNTIME MODEL SWITCH TEST ===
Phase 1 - Model A (Qwen 1.5B):
  PID: 29896
  Port: 64740
  Inference Latency: 1711 ms
  Output: DummyResponse { status: "success", items_processed: 1 }
  Status: Validated

Phase 2 - Model B (Qwen 3B) [Controlled Switch]:
  PID: 42984
  Port: 59027
  Switch + Inference Duration: 51.72s
  Inference Latency: 3330 ms
  Output: DummyResponse { status: "success", items_processed: 1 }
  Status: Validated

Phase 3 - Clean Shutdown:
  Shutdown Duration: 512.76 ms
  Process Terminated Confirmed: YES
Total Real Runtime Test Duration: 80.71s
```
