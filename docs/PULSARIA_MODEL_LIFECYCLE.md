# PULSARIA — MODEL LIFECYCLE & RUNTIME ORCHESTRATION ARCHITECTURE

## 1. Executive Summary

Este documento formaliza y audita el ciclo de vida real y la orquestación del runtime de modelos de lenguaje locales (`llama-server.exe`) en Pulsaria (Mega Prompt 09).

Pulsaria opera bajo el principio rector de **no ficción de ingeniería**: solo documenta estados, transiciones y garantías realmente verificadas en código fuente y probadas en tiempo de ejecución.

---

## 2. Los Tres Espacios de Estado Ortogonales

Para evitar acoplar conceptos distintos en una sola variable, la arquitectura divide el runtime en tres dimensiones independientes:

```text
┌─────────────────────────────────────────────────────────────┐
│                    1. MODEL STATE                           │
│  REGISTERED → AVAILABLE → RESOLVED → LOAD_STARTED → LOADED  │
│             → READY → EXECUTING → VALIDATED                 │
│             → UNLOADING → UNLOADED                          │
│             → FAILED(String)                                │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    2. PROCESS STATE                         │
│  NotStarted → Starting { port } → Ready { pid, port }       │
│             → Exited { exit_code } → Terminated             │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                   3. EXECUTION STATE                        │
│  NotExecuted → Validated → Failed(String)                   │
│             → DeviationBlocked { requested, attempted }     │
└─────────────────────────────────────────────────────────────┘
```

1. **Model State (`ModelLifecycleState`):** Describe la fase conceptual del modelo dentro del sistema.
2. **Process State (`ProcessState`):** Describe la realidad física del proceso del sistema operativo `llama-server.exe` (PID, puerto TCP, terminación).
3. **Execution State (`ModelExecutionStatus`):** Describe el resultado de una solicitud de inferencia de tarea concreta.

---

## 3. Diagrama de Transiciones de Ciclo de Vida

```text
[REGISTERED] (ModelRegistry catalog)
      │
      ▼
 [AVAILABLE] (GGUF file verified present on disk)
      │
      ▼
 [RESOLVED]  (ModelId -> ResolvedModelSpec -> Canonical Path + Expected SHA)
      │
      ▼
[LOAD_STARTED] (Process launch: port reservation, API key, llama-server spawn)
      │
      ├── (Launch failure / OOM) ──> [LOAD_FAILED] ─────────────┐
      ▼                                                         │
   [LOADED]  (OS Process spawned, PID allocated)                │
      │                                                         │
      ├── (Health probe timeout / 500) ──> [HEALTH_CHECK_FAILED]│
      ▼                                                         │
   [READY]   (HTTP GET /health -> 200 OK)                       │
      │                                                         │
      ▼                                                         │
 [EXECUTING] (POST /v1/chat/completions)                        │
      │                                                         │
      ├── (Inference timeout >60s) ──> [TIMEOUT]                │
      ├── (Crash: process died)   ──> [PROCESS_EXITED]          ├──> [DETERMINISTIC FALLBACK]
      ├── (Bad JSON / Malformed)   ──> [VALIDATION_FAILED]       │           │
      ▼                                                         │     (All fail)
 [VALIDATED] (Deserialized strictly to target domain type)      │           ▼
      │                                                         │    [SAFE FAILURE]
      ▼                                                         │
 [UNLOADING] (Model switch or shutdown initiated; kill signal)  │
      │                                                         │
      ▼                                                         │
  [UNLOADED] (Process wait complete, port and RAM released) <───┘
```

---

## 4. Single Active Model (`MAX_ACTIVE_MODELS = 1`)

Pulsaria impone como invariante estricto:
```text
MAX_ACTIVE_MODELS = 1
```

- **Motivación:** Preservar la estabilidad de hardware con restricciones de memoria (ej. GPUs portátiles de 6-8 GB VRAM y 16 GB de RAM). Dos modelos en memoria provocarían paging destructivo o crashes OOM.
- **Autoridad Única de Verdad:** `RealSidecarRunner` encapsula el proceso activo dentro de `Arc<Mutex<Option<BenchmarkSidecar>>>`.
- **Serialización de Concurrencia:** Toda tarea concurrente que solicite inferencia adquiere el cerrojo del runner. Si dos tareas solicitan modelos diferentes de forma simultánea, la ejecución se serializa determinísticamente garantizando que el primer modelo termine antes de que el segundo se cargue.

---

## 5. Model Switch: Controlled Process Restart

### 5.1. Hot-Swap In-Situ: No Soportado
`llama-server` (upstream llama.cpp) no soporta el reemplazo en caliente de pesos dentro de un proceso en ejecución sin reiniciar el binario.
```text
HOT_SWAP_IN_SITU = NOT_SUPPORTED
```

### 5.2. Controlled Process Restart: Verificado
El cambio de modelo se implementa como **Controlled Process Restart (Caso B)**:
```text
MODEL A ACTIVE (PID: 29896, Port: 64740)
      ↓
REQUEST MODEL B (Qwen 3B)
      ↓
STOP A (sidecar.shutdown(): kill() + child.wait() con timeout 5s)
      ↓
VERIFY A TERMINATED (exit code confirmed, PID purged)
      ↓
RESOLVE B (ModelRegistry::resolve_model_spec)
      ↓
VERIFY B (Integrity marker / existence checked)
      ↓
START B (Launch llama-server.exe con pesos de B)
      ↓
HEALTH CHECK B (Polling /health -> 200 OK)
      ↓
MODEL B READY (PID: 42984, Port: 59027)
```

**Evidencia de Verificación Real (`test_16_real_runtime_controlled_model_switch`):**
- Modelo A (`Qwen 1.5B`): PID `29896`, Puerto `64740`, Inferencia completada en 1711 ms.
- Conmutación controlada hacia Modelo B (`Qwen 3B`): PID `42984`, Puerto `59027`, Inferencia completada en 3330 ms.
- Cero solapamiento de procesos. Modelo A fue completamente destruido antes de iniciar B.

---

## 6. Detección y Recuperación de Caídas de Proceso (`Process Crash Recovery`)

Si el subproceso `llama-server.exe` muere inesperadamente durante una inferencia (debido a falta de memoria, violación de acceso o terminación externa):
1. El cliente HTTP reporta un fallo de conexión.
2. `RealSidecarRunner` no asume un error de red genérico; invoca inmediatamente `sidecar.is_alive()` y `sidecar.exit_status()`.
3. Al detectar que el proceso hijo ya no está vivo:
   - Extrae el código de salida exacto (`exit_code`).
   - Purga la instancia muerta del lock (`*active_lock = None`).
   - Retorna el error fuertemente tipado:
     ```rust
     ExecutionError::ProcessExited {
         exit_code: Some(exit_code),
         model: model_spec.model_id.clone(),
     }
     ```
   - Clasifica el estado del modelo como `ModelLifecycleState::Failed("PROCESS_EXITED")`.
4. El pipeline ejecuta el mecanismo de fallback determinista hacia el siguiente candidato elegible de la cadena sin colgar la aplicación.

---

## 7. Gestión de Timeouts de Inferencia (`Execution Timeout`)

Para prevenir que una inferencia bloquee indefinidamente el subproceso o la cola de tareas:
- Toda llamada HTTP contra `/v1/chat/completions` está envuelta en un timeout estricto gestionado por `tokio::time::timeout` (por defecto 60 segundos por inferencia).
- Si el servidor supera el tiempo límite:
  - Se retorna `ExecutionError::Timeout { timeout_secs, model }`.
  - La traza se registra como fallida.
  - El sistema inicia el proceso de limpieza y fallback sin degradar el resto del backend.

---

## 8. Ciclo de Vida de Puertos de Red

- `BenchmarkSidecar::launch` reserva un puerto efímero vinculándose a `127.0.0.1:0`, lee el socket asignado por el sistema operativo y cierra el socket temporal para pasárselo a `llama-server.exe --port <port>`.
- Al terminar el proceso mediante `shutdown()`, el proceso se espera explícitamente (`child.wait().await`), asegurando que Windows libere el puerto en el stack TCP/IP antes de cualquier reinicio rápido.

---

## 9. Limpieza de Recursos y Garantía Anti-Huérfanos (`Cleanup / Drop`)

`BenchmarkSidecar` implementa tanto `Drop` como `shutdown()` asíncrono:
- `shutdown()`:
  1. Invoca `self.child.start_kill()`.
  2. Espera asíncronamente `self.child.wait()` con timeout de 5 segundos.
  3. Registra la salida en log y confirma que el PID ha dejado de existir en el sistema operativo.
- `Drop`:
  - Como salvaguarda para panics o salidas abruptas, invoca síncronamente `self.child.start_kill()`.
- **Verificación en Windows:** Se comprobó mediante `test_15_clean_shutdown_and_process_cleanup` y `test_16_real_runtime_controlled_model_switch` que tras `shutdown()`, `active_pid()` retorna `None` y ningún proceso `llama-server.exe` queda huérfano en el sistema operativo.

---

## 10. Matriz de Estados de la Suite de Pruebas

| ID | Test Suite | Tipo | Estado | Cobertura |
|:---|:---|:---:|:---:|:---|
| 1 | `test_1_fast_operational_routed_execution` | Integration | **PASS** | Qwen 1.5B rápido para tareas operativas |
| 2 | `test_2_security_sensitive_routed_execution` | Integration | **PASS** | Bloqueo STD-13 de Gemma para UntrustedPublic |
| 3 | `test_3_high_fidelity_recipe_routed_execution` | Integration | **PASS** | Gemma 2B para tareas de fidelidad alta confiables |
| 4 | `test_4_primary_model_unavailable_fallback` | Integration | **PASS** | Fallback determinista cuando falta el peso primario |
| 5 | `test_5_safe_failure_when_all_fail` | Integration | **PASS** | Falla segura tipada si ningún fallback está disponible |
| 6 | `test_6_no_deviation_enforcement` | Integration | **PASS** | Bloqueo de ejecuciones que desvíen de la decisión |
| 7 | `test_7_model_identity_resolution` | Unit | **PASS** | Resolución inmutable de ModelId a GGUF y hash |
| 8 | `test_8_real_llama_server_runtime_execution` | Real Runtime | **PASS** | Inferencia real contra llama-server.exe y Qwen 1.5B |
| 9 | `test_9_lifecycle_state_machine_transitions` | Unit | **PASS** | 10 estados formales y transiciones válidas/inválidas |
| 10 | `test_10_single_active_model_invariant` | Integration | **PASS** | Invariante MAX_ACTIVE_MODELS = 1 |
| 11 | `test_11_controlled_process_restart_model_switch`| Integration | **PASS** | Conmutación A -> B -> A con tracking de switches |
| 12 | `test_12_warm_model_reuse` | Integration | **PASS** | Reuso en caliente de instancia activa si el modelo no cambia |
| 13 | `test_13_process_crash_detection_and_recovery` | Integration | **PASS** | Detección de caída de proceso y recuperación limpia |
| 14 | `test_14_execution_timeout_classification` | Integration | **PASS** | Detección y clasificación tipada de timeout |
| 15 | `test_15_clean_shutdown_and_process_cleanup` | Integration | **PASS** | Terminación controlada y limpieza anti-huérfano |
| 16 | `test_16_real_runtime_controlled_model_switch` | Real Runtime | **PASS** | Switch real: Qwen 1.5B (PID A) -> Qwen 3B (PID B) |
