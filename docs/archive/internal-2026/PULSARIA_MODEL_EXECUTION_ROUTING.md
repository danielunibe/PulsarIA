# PULSARIA — MODEL EXECUTION ROUTING ARCHITECTURE

## 1. How Does `RoutingDecision` Reach the Provider?

La arquitectura establece una separación estricta entre la toma de decisiones y la ejecución:

```text
TaskRequirements
      ↓
CapabilityRouter::route_task
      ↓
RoutingDecision (selected_model: "Qwen/Qwen2.5-3B-Instruct-GGUF", fallback_chain: [...])
      ↓
RoutedModelExecutor::execute_with_decision / execute_routed
      ↓
ModelRegistry::resolve_model_spec
      ↓
ModelRunner (RealSidecarRunner / BenchmarkSidecar)
      ↓
llama-server.exe (--model <resolved_path>)
```

1. La capa de aplicación construye un `TaskRequirements` con tipo de tarea (`TaskType`), nivel de seguridad requerido (`SecurityLevel`) y procedencia del contenido (`ContentTrust`).
2. `CapabilityRouter` evalúa los perfiles de capacidades congelados del benchmark, aplica los filtros duros de seguridad (`STD-13`), recursos (VRAM/RAM) y latencia, calcula el fit score determinista y emite una `RoutingDecision`.
3. `RoutedModelExecutor` recibe la `RoutingDecision` de forma inmutable. El modelo `selected_model` se convierte en el parámetro explícito de resolución; la ejecución de un modelo no seleccionado está terminantemente bloqueada a nivel de código (`RoutingExecutionMismatch`).
4. `LocalAiProvider::Routed(Arc<RoutedModelExecutor>)` permite que los consumidores habituales de la capa de aplicación invoquen la generación estructurada beneficiándose del router adaptativo sin cambiar contratos existentes.

---

## 2. How is `ModelId` Resolved?

La resolución se centraliza en `ModelRegistry::resolve_model_spec`:
- Recibe el `model_id` (o alias/sufijo canónico) y el directorio de modelos base (`models_dir`).
- Busca en el catálogo único de `ModelRegistry` (sin duplicaciones de fuente de verdad).
- Produce una estructura `ResolvedModelSpec` que une el identificador con el nombre de archivo exacto (`qwen2.5-3b-instruct-q4_k_m.gguf`), la ruta absoluta, el hash SHA-256 esperado, y la ruta al marcador de integridad `.verified`.

---

## 3. How is GGUF Selected?

El archivo GGUF no se adivina mediante patrones de cadenas o scripts ad-hoc:
- La relación `ModelId -> filename` está fijada de manera inmutable en el `ModelRegistry`.
- El ejecutor combina la ruta base del entorno con el `filename` registrado y valida la presencia física con `spec.verify_presence()`.
- Si los pesos no están en disco, la resolución falla limpiamente con `ModelResolutionError::FileNotFound` y no se inicia ningún proceso en vano.

---

## 4. How is Model Loading Performed?

El runner real (`RealSidecarRunner`) delega la carga en `BenchmarkSidecar::launch`:
1. Asegura la ruta absoluta del archivo GGUF para prevenir fallos relativos al cambiar de directorio de trabajo.
2. Reserva un puerto TCP local efímero (`127.0.0.1:0`).
3. Genera un token Bearer aleatorio de 32 bytes para aislamiento del endpoint HTTP.
4. Lanza `llama-server.exe` oculto sin interfaz web (`--no-webui`), vinculando explícitamente el archivo con `--model <absolute_path>`, asignando el tamaño de contexto (`--ctx-size 4096`) y tokens de predicción (`--n-predict`).
5. Realiza un sondeo reactivo a `GET /health` hasta que el servidor reporte disponibilidad o termine por error (OOM / timeout).

---

## 5. How is Model Identity Verified?

Pulsaria implementa una verificación de identidad de modelo de dos niveles:

1. **Resolución e Integridad de Archivo:**
   - La especificación del modelo almacena el `expected_sha256` obtenido del artefacto verificado en el benchmark.
   - El archivo de marcador `<model.gguf>.verified` contiene el hash SHA-256 precalculado.
   - `spec.verify_marker()` comprueba que el hash del marcador coincida con el hash esperado antes de permitir la invocación del ejecutable.
   - `spec.verify_sha256_full()` permite verificación bit-a-bit en frío por streaming.

2. **Verificación de Invocación:**
   - El proceso `llama-server.exe` se lanza explícitamente con `--model <spec.path>`, lo que garantiza que el binario de inferencia cargue exactamente el archivo verificado.

> **Limitación de Runtime:** El endpoint HTTP de `llama-server` reporta `HTTP 200` y metadatos de payload, pero no expone un hash criptográfico de los pesos en la respuesta de completación. Por tanto, la verificación de identidad se acredita a nivel de resolución de ruta canónica y marcador verificado, no como firma criptográfica en el paquete HTTP.

---

## 6. How Does Fallback Work?

El fallback es **100% determinista, gobernado por la política del router y seguro ante inyecciones**:

1. Si el modelo principal (`selected_model`) falla durante la carga o inicialización:
   - Se captura el error tipado (`ModelLoadFailed`, `ModelPathNotFound`, etc.).
   - Se recorre la lista ordenada `decision.fallback_chain`.
2. **Restricción de Seguridad Invariante (§73):**
   - Para tareas con nivel de seguridad `High` o `Critical` y contenido no confiable (`UntrustedPublic`), los candidatos vulnerables a STD-13 (como `Gemma 2B`) quedan explícitamente descalificados y no se ejecutan como fallback.
3. Si un candidato de fallback elegible carga con éxito, se ejecuta y la traza de ejecución registra:
   - `fallback_used: Some("Qwen/Qwen2.5-3B-Instruct-GGUF")`
   - `fallback_reason: Some("Primary '...' failed: ...")`
4. Si todos los candidatos elegibles fallan, el sistema produce un **Safe Failure** (`ExecutionError::NoEligibleFallback`).
5. **Prohibición de Fallback Silencioso:** Pulsaria nunca conmuta silenciosamente a un modelo default global o aleatorio no autorizado por la política de routing.

---

## 7. How is Execution Evidence Captured?

Cada inferencia ejecutada a través de `RoutedModelExecutor` produce un `ModelExecutionTrace` estructurado:
- `routing_policy_version`: Versión formal de la política de routing (`routing-policy-v1.0`).
- `task_type`: Tipo de tarea ejecutada.
- `requested_model`: Modelo solicitado por el Capability Router.
- `resolved_model`: Modelo resuelto por el Model Registry.
- `resolved_path`: Ruta física absoluta del archivo GGUF.
- `verified_marker_sha256`: Hash verificado en disco.
- `load_status`: Estado formal de carga (`Loaded` / `LoadFailed`).
- `execution_status`: Estado final del ciclo (`Validated` / `Failed` / `DeviationBlocked`).
- `latency_ms`: Duración real de la inferencia medida por el host.
- `prompt_tokens`: Conteo de tokens consumidos reportado por el servidor.
- `completion_tokens`: Conteo de tokens generados reportado por el servidor.
- `fallback_used` / `fallback_reason`: Proveniencia en caso de recuperación por fallback.
- `validation_status`: `"PASS"` o error detallado de deserialización Serde.

---

## 8. What Remains Unverified?

- **Hot-swap sin reinicio de proceso:** `llama-server` no soporta actualmente cambio de pesos en caliente dentro del mismo proceso sin desconexión. La conmutación de modelos se realiza mediante parada y nuevo arranque del subproceso (Caso B, §12).
- **Verificación criptográfica en payload HTTP:** La respuesta JSON de `llama-server` no devuelve el SHA-256 de los pesos activos; la identidad depende de los parámetros de invocación de proceso y verificación previa de archivos.
- **Concurrencia multi-modelo simultánea:** La arquitectura actual opera bajo el ciclo de vida de **modelo único activo** (`single-active-model`) para respetar los presupuestos de hardware moderado (8 GB VRAM).
