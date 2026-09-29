# Auditoría integral y ruta de publicación gratuita

**Actualizado:** 2026-09-28
**Autoridad del proyecto:** [PROJECT_TRUTH.md](../PROJECT_TRUTH.md)  
**Alcance:** preparar Pulsaria para que una persona pueda descargar gratis el instalador vigente desde GitHub Releases.

> **Seguimiento 2026-09-28:** el head actual del PR #2 es `cceb300d`, con el ajuste del rótulo “Rendimiento” observado a 860 × 640. CI canónico [36496984856](https://github.com/danielunibe/PulsarIA/actions/runs/36496984856) y preflight [36496984781](https://github.com/danielunibe/PulsarIA/actions/runs/36496984781) pasaron; el preflight omitió preparar runtime porque ese commit no cambió esas entradas. La verificación completa más reciente sigue siendo 54/54 recursos en [36477690739](https://github.com/danielunibe/PulsarIA/actions/runs/36477690739). GitHub muestra el PR abierto, en borrador y `CLEAN` (integrable); no está integrado. La última release pública sigue siendo `v0.1.0-eval.3`; la Beta 2 no está publicada y el gate legal sigue bloqueado.

La auditoría de producto y el plan de reparación por fases están en
[AUDITORIA_INTEGRAL_Y_FASES.md](AUDITORIA_INTEGRAL_Y_FASES.md). Este documento
se conserva enfocado en publicar la Beta 2.

## Estado ejecutivo

El repositorio [danielunibe/PulsarIA](https://github.com/danielunibe/PulsarIA) es público y ofrece la prerelease `v0.1.0-eval.3`, sin costo de descarga. Esa release es del 2026-09-14 y es anterior al candidato Beta 2. El candidato está en el PR borrador [#2](https://github.com/danielunibe/PulsarIA/pull/2), todavía sin merge ni release. El último head de código es `cceb300d`; CI canónica pasó en [36496984856](https://github.com/danielunibe/PulsarIA/actions/runs/36496984856) y el preflight pasó en [36496984781](https://github.com/danielunibe/PulsarIA/actions/runs/36496984781). La verificación completa del runtime 54/54 más reciente es [36477690739](https://github.com/danielunibe/PulsarIA/actions/runs/36477690739). Se reconstruyó y probó offline un NSIS desde `7c7e9f0a`; sus límites y digest aparecen en la fase 4. Beta 2 sigue sin publicarse.

El objetivo final sigue **PARTIAL**. El último head de código `cceb300d` pasó CI canónica [36496984856](https://github.com/danielunibe/PulsarIA/actions/runs/36496984856) y preflight [36496984781](https://github.com/danielunibe/PulsarIA/actions/runs/36496984781); este omitió preparar runtime porque el commit no cambió esos recursos. La verificación completa más reciente continúa siendo 54/54 en [36477690739](https://github.com/danielunibe/PulsarIA/actions/runs/36477690739). Los heads documentales `30188f50` y `fa42b35b` pasaron CI y preflight; ambos preflights omitieron la preparación de runtime por tratarse de cambios documentales. El NSIS local del checkout `7c7e9f0a` terminó su smoke offline con salida 0: instalación/desinstalación, health, runtime, notices, preservación de datos y cleanup; no probó ingestión, búsqueda ni exports. El workflow de publicación completo desde `main` no se ha ejecutado. Faltan aceptación Tauri, resolución del gate legal y aprobación/revisión SPDX/notices. El MSI falla con versiones prerelease alfanuméricas; la Beta directa genera NSIS.

“Descarga gratis” describe el precio de descarga. La licencia del código es **Pulsaria Source-Visible Beta License**, no una licencia open source aprobada por OSI.

## Autoridad y preservación

- Checkout inspeccionado: `C:\Users\danie\Desktop\Pulsaria`.
- Rama de trabajo: `beta2-hardening`; el último commit de código es `cceb300d`; CI canónico y preflight pasaron. El PR #2 sigue abierto, en borrador y `CLEAN`; `scratch/` sigue sin seguimiento y fuera del cambio.
- El árbol ya tenía cambios extensos y archivos nuevos antes de esta fase. Se trabajó sobre ese mismo estado; no se ejecutaron reset, clean ni stash.
- El código de actividad, errores de API local y playlists se modificó en esta fase. El instalador smoke crea y borra exclusivamente directorios de prueba dentro de `%TEMP%` y confirma que el marcador de datos sobrevive a la desinstalación.

## Fases y evidencia

| Fase | Estado | Evidencia actual | Cierre requerido |
| --- | --- | --- | --- |
| 0. Preservar y fijar autoridad | **PASS** | Rama `beta2-hardening`; último cambio de código `cceb300d`; `scratch/` sigue sin seguimiento y fuera del cambio. No se ejecutaron reset, clean ni stash. El PR #2 sigue abierto, en borrador y `CLEAN`. | Revisar el rollup del PR y mergear antes de tag/release. |
| 1. Integridad de código y MVP | **CI del head actual PASS** | `verify-canonical-source` pasó en el head anterior `468cbf28` (run `36483722105`), incluyendo estructura, frontend, accesibilidad, iconos, 103 pruebas Rust y contratos Python. El head actual `cceb300d` pasó CI canónico [36496984856](https://github.com/danielunibe/PulsarIA/actions/runs/36496984856) y preflight [36496984781](https://github.com/danielunibe/PulsarIA/actions/runs/36496984781). El último preflight completo que comprobó 54/54 es `36477690739`. | Mantener checks verdes en el head final del PR; reconstruir y probar el instalador del commit integrado antes de publicar. |
| 2. Reparación de actividad y playlists | **PASS automatizado / gateway nativo PASS / visual parcial** | Centro de actividad conectado a trabajos persistidos; carga/error/reintento explícitos; sin ceros falsos cuando falla el motor; mensajes REST 401/403 explican que la biblioteca requiere la app de escritorio; el fallo de red esperado de Playlists queda como advertencia en preview web y ya no abre el overlay rojo de Next Dev; gates históricos lint/TypeScript/`verify:mvp` pasan. El lanzador aislado corregido respondió PASS en `/health` 8080 (`status=ok`, `0.1.0-beta.2`); la aceptación visual Tauri sigue pendiente. | Revisión visual real en Tauri a 1280×800 y 860×640. |
| 3. Calidad complementaria | **CI previa y del head actual PASS** | El flujo de publicación ejecuta `verify:versions`, `verify:local-llm`, `verify:mvp`, `verify:api` y `npm audit --omit=dev --audit-level=low`. CI pasó en [36483722105](https://github.com/danielunibe/PulsarIA/actions/runs/36483722105), incluyendo los contratos de accesibilidad e iconos; para el head actual `cceb300d`, CI canónico [36496984856](https://github.com/danielunibe/PulsarIA/actions/runs/36496984856) pasó. El último preflight completo de runtime [36477690739](https://github.com/danielunibe/PulsarIA/actions/runs/36477690739) verificó 54/54. El verificador de iconos no encontró la referencia externa en el runner (`externalSourceCompared=false`): ahí validó el PNG del repositorio y presencia/dimensiones de assets nativos; la comparación con la imagen original externa sigue siendo local. | Conservar logs y mantener separada la aceptación visual real en Tauri. |
| 4. Instalador Windows actual | **PASS NSIS offline en 8080 / aceptación visual pendiente** | El NSIS reconstruido desde `7c7e9f0ae219c4394ce109dcf5b0a8f2ba385d34` mide 687,857,791 bytes; SHA-256 `0035F92BBCA54E56007F5849FD6201D3CE7015C92F6205EDC838FAE5C141F8B3`. `npm run verify:installed -- -Configuration release -Bundle nsis -ApiPort 8080` terminó con salida 0: instalación/desinstalación, health inicial/reinicio en el puerto de producto, runtime 54/54, 13 documentos legales, aislamiento, preservación de datos y cleanup. El lanzador aislado corrigió la ruta por defecto y también comprobó health PASS en 8080. El fallo anterior de health no se reprodujo, pero su causa no quedó determinada. Offline: ingestión, búsqueda y exports no se ejecutaron; `stagingContract.clean=false` es el valor predeterminado sin `RunLive` y no prueba staging. Authenticode: `NotSigned`. El artefacto no está publicado. | Revisar la ventana Tauri y cerrar los gates humanos antes del workflow completo de publicación; MSI solo para versión estable. |
| 5. Pipeline live de contenido | **PENDIENTE** | Las 32 pruebas ejecutadas: 31 PASS y 1 skip porque no se suministró URL TikTok autorizada. El smoke NSIS fue offline y no prueba ingestión live. | Ejecutar con URL autorizada y harness nativo que entregue el token de proceso; comprobar ingestión, duplicado, outputs, búsqueda y reinicio. |
| 6. Legal, dependencias y atribuciones | **BLOCKED_EXTERNAL** | SPDX agregado actualizado: 34 npm de producción, 695 Cargo, 33 Python, 54 recursos runtime, 13 documentos legales y la huella de licencia BSD-3-Clause de Colorama. `valid-url@1.0.9` se excluye por ser transitiva de desarrollo. El ZIP Gyan full 8.1.2 se verificó por digest y el `ffmpeg.exe` extraído coincide byte por byte; su README contiene commit FFmpeg, configuración y las 70 versiones del [inventario técnico](FFMPEG_GYAN_8.1.2_INVENTARIO.md), pero no los árboles fuente. El verificador sigue BLOCKED por `COMPONENT_LICENSE_REVIEW_PENDING` y placeholders `public_owner`, `legal_contact_email`, `notice_address`, `legal_approval`; los seis documentos legales también requieren datos/aprobación del titular. | Confirmar titular y canales autorizados; revisar SPDX/notices exactos, fuente de los componentes estáticos y textos. No rellenar campos por inferencia. |
| 7. Publicar la versión validada en GitHub | **PENDIENTE / ruta implementada en PR** | La release pública más reciente es [`v0.1.0-eval.3`](https://github.com/danielunibe/Pulsaria/releases/tag/v0.1.0-eval.3). `.github/workflows/direct-download-release.yml` solo admite despacho manual desde `main`; el tag debe resolver al mismo commit ya integrado en `main` y la versión fuente debe coincidir. Descarga el instalador NSIS de `eval.3` como semilla de runtime con SHA-256 fijado (`1ABD7589C2E8943AEFC1AC8484B2133312D54C18F58BA306DC869031FB9551EF`). El preflight del head de implementación `8277f774` (run `36470434457`) pasó e instaló la semilla verificando 54/54 recursos. El workflow de publicación completo desde `main` no se ha ejecutado. El Environment `direct-download` ya exige aprobación humana, solo permite `main`, desactiva el bypass administrativo y tiene `DIRECT_DOWNLOAD_RELEASE_READY=false`. | Aceptar Tauri, resolver gates, revisar y mergear el PR, crear tag desde head aprobado, ejecutar workflow manual y confirmar assets/digests públicos. Después actualizar sitio y README con URL/hash reales. |
| 8. Firma y actualización automática estable | **BLOCKED_EXTERNAL / opcional para descarga Beta directa** | El workflow firmado requiere Authenticode, clave Tauri updater, runtime externo y `RELEASE_READY`. | Mantener esta ruta para releases estables con updater; estos elementos son opcionales para descarga directa Beta. |

### Restricción de la ruta de publicación actual

El workflow firmado `.github/workflows/release.yml` conserva sus requisitos de
`RELEASE_READY`, runtime externo, Authenticode y firmas Tauri updater. Para la
descarga gratis se añadió `.github/workflows/direct-download-release.yml`:
acepta tags Beta/RC, prepara NSIS sin updater, ejecuta el smoke instalado,
verifica hashes del instalador, SPDX, notices y licencia, y publica esos
archivos en una prerelease. El runtime procede del instalador público `eval.3`
fijado por SHA-256 y el manifiesto del tag vuelve a validar cada recurso. El
verificador exige que el instalador figure como
`NotSigned` y que no se incluyan MSI, `.sig` ni `latest.json`; las notas de
GitHub avisan de SmartScreen y de la ausencia de auto-updater. La ruta sigue
bloqueada por el gate legal y por la aprobación humana de cada publicación en
el Environment `direct-download`. Ese Environment ya existe, solo admite
ejecuciones desde `main`, requiere aprobación y no permite bypass administrativo; su variable
`DIRECT_DOWNLOAD_RELEASE_READY` está en `false` y solo podrá pasar a `true`
cuando la revisión legal y del artefacto exacto haya concluido.

El workflow directo solo admite despacho desde `main`, exige que el checkout
coincida con el tag solicitado y que ese tag ya sea ancestro de `main`; además,
la versión del tag debe coincidir con la versión de todos los archivos fuente.

## Hallazgo del empaquetado y corrección

`npm run tauri build` compiló el ejecutable y generó NSIS, pero el target MSI devolvió:

> `optional pre-release identifier in app version must be numeric-only and cannot be greater than 65535 for msi target`

El primer smoke de NSIS reveló que el manifiesto no coincidía con `python-workers/prepare_whisper_model.py`: tamaño y SHA-256 seguían apuntando a la versión anterior. Se regeneró `src-tauri/resources/runtime-manifest.json` con el generador canónico, pasó la gate fuente e instalado (54/54), y se reconstruyó el instalador. Como evidencia histórica, el artefacto de `08ecdf5` pasó `npm run verify:installed -- -Configuration release -Bundle nsis` en perfil temporal; el artefacto local más reciente y su límite offline están descritos en la fase 4. Se corrigió `.github/workflows/release.yml` para construir y firmar solo NSIS en cualquier prerelease; las versiones estables siguen generando NSIS y MSI. `scripts/verify-release-artifacts.ps1` admite `-AllowPrerelease`, comprueba que `latest.json` tenga versión prerelease y hace Authenticode sobre los artefactos presentes. Verificar que los checks requeridos permanezcan verdes en el head final antes del merge.

## Reconciliar la página pública de descargas

`website/downloads.html` apuntaba a `v0.1.0-eval.2`, aunque la release pública más reciente era `v0.1.0-eval.3`. La API de GitHub confirma que `eval.3` publica NSIS y MSI. Se actualizaron ambos enlaces y hashes con los digests SHA-256 de sus assets, y `npm run verify:website` pasó. Beta 2 no se enlaza desde la página hasta que exista una release validada.

El README ya enlazaba a `eval.3`, pero conservaba el SHA-256 de `eval.2` y presentaba `f6f046fa` como punta publicada de `main`. Se corrigieron los dos hashes de los assets, se añadió el enlace MSI y se distinguió explícitamente la descarga pública `eval.3` del candidato Beta 2 aún no publicado. Los enlaces y digests se cotejaron con la API de GitHub.

La fase UX que requiere aceptación nativa es la 2 del documento
[Auditoría integral](AUDITORIA_INTEGRAL_Y_FASES.md): Inicio ahora diferencia
conexión fallida, biblioteca confirmada vacía, trabajos pendientes y filtros
sin coincidencias; las DEMO explican que no son datos persistidos. El cambio de
código pasó CI en `36455508083`; falta aceptar estos estados con la ventana
Tauri y el backend real.

## Bloqueos concretos para pedir al titular

1. Confirmar quién posee los derechos de Pulsaria: persona física o entidad; usar el nombre legal exacto de ese titular en licencia, EULA, manifiesto y copyright.
2. Reservar un correo legal público dedicado que controle el titular y un domicilio real, autorizado para recibir avisos. No se debe inventar el dato ni poner el domicilio particular por defecto. La ley mexicana vigente pide identidad y domicilio del responsable en el aviso de privacidad (art. 15, fr. I); revisar el domicilio concreto con asesoría mexicana antes de publicarlo: [texto vigente de la LFPDPPP, Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf).
3. La web actual solo dirige “Soporte” a GitHub Issues; no usar Issues para solicitudes de privacidad ni como domicilio legal. Crear un canal legal dedicado y dejar los datos personales fuera de tickets públicos.
4. Aprobación humana real de licencia, EULA, privacidad, contenido, copyright/takedown y notices; el gate no trata la aprobación pendiente como un dato técnico.
5. Revisar el SPDX y notices del artefacto exacto y confirmar dependencias, modelos, atribuciones y procedencia de derechos; el marcador `COMPONENT_LICENSE_REVIEW_PENDING` bloquea la publicación hasta la revisión humana.
6. Una URL de TikTok cuyo procesamiento el titular esté autorizado a validar, si se quiere cerrar el smoke live de esta versión.

## Límites de lo demostrado

- El smoke instalado solo certifica inicio, health local, reinicio, empaquetado, ubicación de datos y desinstalación; no es aceptación visual de la ventana Tauri ni prueba de TikTok live.
- El instalador actual es grande y sin Authenticode; GitHub puede mostrar advertencias de Windows. El hash identifica la build local exacta, no un asset publicado.
- La compilación general con NSIS+MSI no fue PASS: el MSI prerelease falló. El NSIS separado sí quedó probado.
- La existencia de una release pública anterior no demuestra que el código Beta 2 actual esté descargable.
