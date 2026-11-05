# Beta 4 Gate P0-02 — consentimiento, cookies y admisión

Fecha de corte: 2026-10-29

Estado de este documento: evidencia de la implementación publicada en
`6bc9f53fa768fc2cb32aeeb1b4942d4e989a1c7b`. Canonical CI #148 y runtime
bootstrap preflight #98 terminaron PASS en ese mismo SHA. P0-01 queda cerrado
en c427ee6d587e95761409f63568ff6a3e92574b97; este gate no lo reabre ni cambia
su regla sobre trabajos queued históricos. La aprobación automatizada no
equivale a aceptación instalada ni a publicación de Beta 4.

## Hallazgo y causa raíz

Antes del cambio, la aceptación de derechos se reflejaba principalmente en el
frontend. No había una sola política en QueueService que cubriera la admisión
de trabajos Tauri, el gateway REST local y la admisión en background. En rutas
de colecciones, una selección de navegador guardada en la fuente podía
convertirse en PULSAR_COOKIES_FROM_BROWSER aunque la preferencia global hubiera
cambiado. Los procesos Python heredaban el entorno, y un escaneo largo no
comprobaba si la autorización había cambiado mientras el proceso seguía vivo.

## Política aplicada

- La autorización de procesamiento requiere simultáneamente la versión legal
  vigente y la versión vigente de consentimiento de derechos. Rust calcula la
  decisión; los flags de sessionStorage/localStorage ya no autorizan el runtime
  Tauri.
- La política se consulta al admitir el trabajo y al iniciar la ejecución. Un
  epoch monotónico invalida mensajes que estaban esperando capacidad cuando se
  revoca y se vuelve a aceptar el consentimiento.
- Si la autorización cambia después de reclamar un job pero antes de enviarlo
  al canal de la cola, el job queda persistido como `paused`, incluso si el
  usuario vuelve a aceptar antes de que termine la admisión. Una regresión Rust
  cubre este borde del epoch.
- La revocación impide que trabajos en espera entren a un worker. Los trabajos
  de recuperación interrumpidos se persisten como paused cuando no hay
  consentimiento. Los queued históricos permanecen fuera de la recuperación
  automática conforme a P0-01.
- Un trabajo paused requiere acción explícita de Reanudar. El estado queda
  visible en QueueSection. Una fuente de perfil conserva su opt-in persistido
  por canal y autoEnqueue; ese ajuste es una selección explícita distinta del
  consentimiento general.
- Los handlers Tauri de ingestión/reintento, el servicio de colecciones y las
  rutas REST de ingestión/reintento invocan el mismo guard de QueueService.
  El gateway responde 403 cuando el guard rechaza la solicitud.
- Solo se acepta la selección global actual chrome, edge o firefox. Se ignora
  el snapshot legado source.browser. Un valor desconocido se traduce a ninguna
  sesión.
- Los comandos de escaneo y expansión eliminan PULSAR_COOKIES_FROM_BROWSER del
  entorno heredado y la agregan únicamente cuando existe una selección global
  válida. Los workers Python persistentes también arrancan sin ese valor y
  reciben la preferencia actual por mensaje de trabajo.
- Los escaneos de perfil, resolución de metadatos y expansión de colecciones
  cancelan el proceso hijo si cambia el consentimiento, el epoch o el
  navegador seleccionado. No se leen ni registran contenidos de cookies.

## Matriz de aceptación

| ID | Criterio | Resultado actual | Evidencia y límite |
|---|---|---|---|
| SEC-01 | Registrar sin permiso no inicia descarga | Implementado | La ruta de conexión de perfil y la admisión pasan por el guard común. El alta Tauri falla cerrada sin autorización. La suite completa compila y ejecuta las regresiones; no se hizo una sesión de TikTok real. |
| SEC-02 | Revocar durante escaneo bloquea solicitudes posteriores | Implementado y probado sintéticamente | La prueba revoking_scan_policy_kills_the_child_before_its_followup_request invalida el epoch y confirma que un efecto posterior del proceso hijo no ocurre. No usa red ni cuenta real. |
| SEC-03 | Ignorar source.browser legado | Implementado y probado | cookie_authorization_uses_only_the_current_global_selection prueba que el snapshot legado no prevalece. |
| SEC-04 | Tauri y REST aplican el mismo gate | Implementado y validado en el código compartido | Los commands Tauri y los handlers REST de ingestión/reintento llaman `QueueService::ensure_processing_authorized`; el gateway transforma el rechazo en HTTP 403. La suite compila y pasa, y las regresiones de QueueService verifican el gate con autorización revocada. No se ejecutó una matriz HTTP de caja negra con el estado de consentimiento alterado. |
| SEC-05 | Reinicio sin permiso no reanuda jobs | Implementado | Startup inicia con el resultado de ambos consentimientos. QueueService pausa los estados recuperables si no hay autorización. Los queued históricos continúan excluidos por el contrato P0-01. |
| SEC-06 | Renovar consentimiento no reinicia jobs ordinarios por sí solo | Implementado | El consentimiento actualiza el gate, no llama a resume_pending_jobs. Los paused deben reanudarse de forma individual. Las fuentes de perfil pueden seguir su configuración activa y autoEnqueue explícita; no se interpreta una aceptación global como permiso para cambiar esa configuración. |
| SEC-07 | autoEnqueue desactivado deja inventario sin procesamiento | Implementado | La rama de descubrimiento persiste el elemento como discovered y no crea job. Hay cobertura de DB y de la prueba frontend de perfil que comprueba que agregar no invoca un scan. |
| SEC-08 | Pause, stop y retry no duplican admisión | Implementado y regresionado | Se conserva la reclamación idempotente del job y el epoch; pruebas Rust cubren pause/retry/recovery, el cambio de autorización antes del envío y mensajes invalidados después de reconsentir. |
| SEC-09 | Navegador inválido falla cerrado | Implementado y probado | El parser admite solo chrome, edge y firefox; las demás cadenas producen None. |
| SEC-10 | No registrar secretos | Implementado en código, sin prueba de datos reales | El proceso solo maneja el nombre del navegador; Rust no extrae ni persiste bytes de cookie. No se inspeccionó ningún perfil o log real del navegador. La salida de error del proveedor sigue tratándose como texto externo y no se considera evidencia de ausencia de cualquier dato sensible del proveedor. |
| SEC-11 | Likes/saved privados no se presentan como cero | Implementado con fixtures | source_scanner clasifica errores de autenticación como requiere sesión y las pruebas Python validan esa distinción. El acceso real a categorías privadas no se probó. Una respuesta vacía del proveedor sin error explícito sigue siendo ambigua. |
| SEC-12 | Volver a modo público no reutiliza una selección vieja | Implementado para selección revocada | Al borrar la selección global, el worker no recibe navegador aunque source.browser conserve un valor legado. Una selección global actual sigue siendo un opt-in global hasta que se borre en Configuración; no hay una preferencia independiente por canal en este gate. |

## Rutas inspeccionadas

| Entrada | Admisión y consentimiento | Navegador | Reanudación |
|---|---|---|---|
| Enlaces desde UI / Tauri | Consentimiento de derechos local más guard Rust | Preferencia actual global; la selección se incorpora al mensaje de job | Solo por acción explícita después de quedar paused/error; la cola normal conserva su política actual |
| REST local autenticado | Handler de gateway más el mismo QueueService | No acepta una selección de fuente; el dispatcher resuelve la preferencia actual | Retry REST pasa por el mismo guard |
| Escaneo TikTok y conexión de perfil | QueueService y servicios de perfil/colección consultan el mismo guard | Selección global actual; el campo source.browser legado no decide | La fuente puede escanear según su estado/canales y autoEnqueue, cuando vuelve la autorización |
| Expansión de colección | Guard de QueueService | Selección global actual | No crea jobs hasta que el caller los admita |
| Worker Python persistente | Gate y epoch antes de worker; payload de trabajo | Entorno heredado eliminado; payload contiene solo el nombre permitido | Retry vuelve a resolver la selección vigente |
| Startup/recovery | main calcula consentimiento vigente antes de resume_pending_jobs | Selección cargada desde los ajustes actuales | Estados interrumpidos se pausan sin consentimiento; queued histórico no se auto-admite |

## Archivos modificados

- components/AddLinks.tsx y lib/i18n.tsx: autoridad nativa para el consentimiento
  de derechos, error visible y estados de guardado/revocación.
- components/QueueSection.tsx: trabajos paused visibles y reanudación individual.
- src-tauri/src/application/queue_service.rs: guard común, epoch, admisión,
  selección de navegador, cancelación de escaneo y pruebas sintéticas.
- src-tauri/src/application/collection_service.rs y
  src-tauri/src/application/profile_discovery_service.rs: guard y comandos de
  escaneo con sesión vigente.
- src-tauri/src/api/gateway.rs y src-tauri/src/commands.rs: guard en REST/Tauri,
  almacenamiento versionado del consentimiento de derechos y reintentos.
- src-tauri/src/domain/models.rs y src-tauri/src/infrastructure/workers/python_runner.rs:
  epoch de autorización y limpieza del entorno heredado.
- src-tauri/src/main.rs: gate de consentimiento antes de recuperación.
- scripts/tests/profile-sources.test.mjs: compatibilidad de fixture frontend.

## Validación local

El commit publicado `6bc9f53fa768fc2cb32aeeb1b4942d4e989a1c7b` pasó
`npm run verify:mvp`: 13/13 gates automatizados en local. Rust: 297 pruebas
PASS, 0 fallidas, 7 ignoradas y 2 filtradas; las dos comprobaciones de inferencia
real se ejecutaron por separado y se saltaron porque no había fixtures de
modelos aislados. Python: 33 PASS y un skip que requiere URL live. El test de
revocación utiliza únicamente un proceso hijo sintético. No se usó TikTok,
sesión, perfil ni cookies reales. El script de instalación/runtime usó sus
mocks y limpieza; esto no representa una instalación ni aceptación funcional
de Windows. `verify:canonical`, API loopback, `cargo fmt --check` y
`git diff --check` pasaron. `out/` (111 archivos) y `.next/` (228 archivos)
se restauraron y coincidieron por SHA-256 por archivo con el snapshot previo.

## Estado y límites del gate

Implementado y automatizado: guard común, invalidación de admisiones en espera,
aislamiento de entorno, cancelación de escaneos sintéticos, selección actual de
navegador, estados paused visibles, distinción de consentimiento y autoEnqueue.

No certificado: interacción visual instalada, acceso a categorías privadas,
revocación contra proveedor real, matriz HTTP de caja negra con autorización
ausente, ni aceptación en una instalación Windows limpia.

La CI canonical #148 del mismo SHA terminó PASS; el runtime bootstrap preflight
#98 también terminó PASS. P0-02 queda acreditado para cierre en Trello después
de publicar esta actualización documental y verificar la CI del HEAD resultante.
No merge, tag ni publicación de Beta 4 forman parte de este gate.
