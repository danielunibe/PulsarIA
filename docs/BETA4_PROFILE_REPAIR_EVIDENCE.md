# Beta 4 — reparación de Perfiles, 2026-10-12

Trabajo local en `C:\Users\danie\Desktop\Pulsaria`, rama
`codex/pulsaria-beta4-prep`, sobre el checkout y los cambios existentes.
La reparación de release anterior se conserva en
[BETA4_REPAIR_EVIDENCE.md](./BETA4_REPAIR_EVIDENCE.md).

## Hallazgos y correcciones

| Falla confirmada | Corrección |
| --- | --- |
| Agregar iniciaba consultas y descargas inmediatamente | El comando solo persiste el registro. Estado pendiente; el timer espera la primera consulta explícita. |
| El motor ignoraba descarga automática desactivada | Cada admisión lee la regla actual. Desactivada: guarda referencias y relaciones sin crear jobs. Activada: usa deduplicación canónica y QueueService. |
| Seleccionar perfil no cambiaba la biblioteca | Callback perfil/canal hasta app/page.tsx; la proyección `all` reúne las fuentes sin duplicar videos. |
| Estados pendientes y errores aparecían como listos | La UI lee profile_channels, distingue estados y conserva desconocidos como null. Se persisten los reportes parciales y se muestra una advertencia. |
| Contadores inflados al repetir consultas | Conteos de relaciones distintas en SQLite y deduplicación dentro de cada respuesta. |
| Timer y consulta manual usaban motores distintos | Ambos usan ProfileDiscoveryService; se rechaza una consulta simultánea del mismo perfil. |
| El navegador quedaba obsoleto tras cambiar la sesión | Se utiliza el selector actual de cookies de Ajustes, incluida su revocación. |
| Editar reanudaba un perfil pausado y borraba su error | Se conserva la pausa y la incidencia hasta una consulta real o reanudación explícita. |
| “Extraer selección” y “streaming” prometían un comportamiento distinto | Agregar perfil guarda el registro. Consulta de todo lo disponible o 20/50/100 por fuente, procesamiento gradual opcional y Me gusta para el canal /liked. |
| El gate ocultaba la gestión de Perfiles y podía descartar un borrador | Se puede revisar el registro sin aceptar condiciones. Consultar o activar descargas pide el gate existente; el formulario permanece montado durante la confirmación. |
| Las fichas online solo abrían la página externa | El detalle y el video seleccionado en Cinema cargan el reproductor oficial, validan origen/emisor de sus mensajes y muestran reintento o enlace de origen ante un fallo. Solo se carga el reproductor seleccionado. |
| El procesamiento masivo comenzaba antes de mostrar el inventario | La consulta completa el inventario antes de habilitar su admisión. Los jobs quedan en SQLite; QueueService admite uno a la vez, con 30 segundos entre videos, respetando pausa, reglas y política de rendimiento. Los workers normales quedan libres durante esa espera. |
| Las fechas YYYYMMDD de TikTok se almacenaban como INTEGER y rompían las proyecciones | Se normaliza la publicación a fecha ISO al persistir y se toleran fechas numéricas antiguas al leer las fichas. La prueba de inventario real detectó este caso. |

collection_sources sigue siendo la única persistencia de identidad. Los canales,
el contenido y las relaciones son sus proyecciones; no se creó otra cola ni un
downloader. El registro duplicado conserva las opciones del perfil existente.

## Evidencia

- Regresiones de perfil: **19 casos Rust PASS**, incluidas persistencia,
  referencias sin job, deduplicación, opciones, conteos y admisión a la cola.
- Regresiones de interfaz sobre los módulos reales: **9 casos Node PASS**,
  incluidos estados, registro sin scanner, callback de contenido, reporte
  parcial, derechos, preview sin Tauri, formulario conservado durante el gate
  y validación de identidad/origen del reproductor online.
- `cargo check`, TypeScript y build de Next.js: PASS.
- **Corte anterior a streaming: MVP completo PASS 13/13**, con 282 pruebas Rust ejecutadas (280 generales
  y dos de inferencia real aisladas), seis ignoradas, 31 Python PASS y una live
  omitida por falta de URL, 25 casos Node y 23 PowerShell PASS. Registro:
  `target-tauri/beta4-profiles-mvp.log`.
- La revalidación de streaming, cola gradual y fechas usa
  `target-tauri/beta4-profiles-streaming-mvp.log`; su estado final se registra
  después de completar los checks del código definitivo.
- La consulta pública autorizada devolvió 111 videos, sin cookies y con
  `truncated=false`, conservados en un snapshot local fuera de Git. La siguiente
  consulta completa recibió `rate_limited`; no se convirtió en un inventario
  vacío ni se aceptó un CAPTCHA. El snapshot válido se conserva por separado.
- El reproductor oficial del proveedor reprodujo un video del mismo perfil en
  navegador: `paused=false`, `readyState=4`, `currentTime=8.689428`, duración
  227.927007 y sin MediaError. Captura local `05-authorized-official-player.png`.
  Esto prueba la reproducción del proveedor, separada de la integración nativa.
- Capturas locales en `target-tauri/audit-profiles-2026-10-12/`:
  `03-profiles-fixed-preview.png` y `04-profiles-fixed-860x640.png`.
  A 860×640, ancho visible/contenido: formulario 267/267 px, panel 289/289 px.
  Los cuatro nombres de fuentes cabían completos. Se verificaron selección
  múltiple y cambio del límite, sin aceptar condiciones ni importar contenido.

## Límites

La inspección del formulario y del reproductor del proveedor no certifica el
recorrido completo en una ventana nativa. Las pruebas habituales de scanner
usan respuestas sintéticas; el snapshot de 111 videos sí procede de una consulta
real autorizada. Las pestañas privadas requieren una sesión autorizada y no se
certificaron con la consulta pública.

El instalador identificado en BETA4_REPAIR_EVIDENCE.md se construyó antes de
estos cambios; su hash no certifica esta reparación. La publicación sigue
dependiendo de un artefacto exacto nuevo y de los gates externos de
[BETA4_ACCEPTANCE.md](./BETA4_ACCEPTANCE.md): TikTok autorizado desde UI/IPC,
Windows limpio, recorrido humano y revisión legal/materiales. No se instaló
sobre Beta 3, no se usó la biblioteca personal y no se publicó una release.
