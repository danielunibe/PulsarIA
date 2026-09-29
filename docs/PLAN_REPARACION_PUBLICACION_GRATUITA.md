# Auditoría integral y ruta de publicación gratuita

**Actualizado:** 2026-09-28
**Autoridad del proyecto:** [PROJECT_TRUTH.md](../PROJECT_TRUTH.md)  
**Alcance:** preparar Pulsaria para que una persona pueda descargar gratis el instalador vigente desde GitHub Releases.

> **Seguimiento 2026-09-28:** el último cambio de código del PR #2 es `cceb300d`; el head documental verificado `54e58311` pasó CI [36513290261](https://github.com/danielunibe/PulsarIA/actions/runs/36513290261) y preflight [36513290253](https://github.com/danielunibe/PulsarIA/actions/runs/36513290253). `npm run verify:mvp` local pasó 13/13 en `70ea1090` (mismo código): build, Rust 103/103, Python 31 PASS y una omisión live, runtime 54/54 y contratos de seguridad/onboarding. En `e118ac09`, `verify:versions`, `verify:local-llm` y `npm audit --omit=dev --audit-level=low` pasaron; auditoría encontró cero vulnerabilidades. Desde la fuente `54e58311` se compiló un NSIS Beta 2 de 513,644,801 bytes, SHA-256 `D74DE49759D33A62CE06E26D3C97D48A7CC4112B142431FF6AF39DB2DDE3C375`; SBOM agregado y gate estático directo pasaron (runtime 45/45, cuatro checksums, Authenticode `NotSigned`). No se instaló este build. GitHub muestra el PR abierto, en borrador y `CLEAN`, sin revisiones registradas. La última release pública sigue siendo `v0.1.0-eval.3`; Beta 2 no está publicada. El Environment requiere revisión y conserva `DIRECT_DOWNLOAD_RELEASE_READY=false`; el gate legal sigue bloqueado.

La auditoría de producto y el plan de reparación por fases están en
[AUDITORIA_INTEGRAL_Y_FASES.md](AUDITORIA_INTEGRAL_Y_FASES.md). Este documento
se conserva enfocado en publicar la Beta 2.

## Estado ejecutivo

El repositorio [danielunibe/PulsarIA](https://github.com/danielunibe/PulsarIA) es público y ofrece la prerelease `v0.1.0-eval.3`, sin costo de descarga. Esa release es del 2026-09-14 y es anterior al candidato Beta 2. El candidato está en el PR borrador [#2](https://github.com/danielunibe/PulsarIA/pull/2), todavía sin merge ni release. El último cambio de código es `cceb300d`; el head documental `54e58311` pasó CI [36513290261](https://github.com/danielunibe/PulsarIA/actions/runs/36513290261) y preflight [36513290253](https://github.com/danielunibe/PulsarIA/actions/runs/36513290253). Se compiló un nuevo NSIS desde ese head y pasó el gate estático de descarga directa; su hash y el límite de que no se instaló están en la fase 4. Beta 2 sigue sin publicarse.

El objetivo final sigue **PARTIAL**. La versión local `verify:mvp` pasó 13/13 en `70ea1090`, que contiene el mismo código que el último cambio de código `cceb300d`; el head documental `54e58311` pasó CI y preflight. El NSIS Beta 2 de `54e58311` se generó desde un worktree aislado con runtime derivado de la semilla pública `eval.3`; el gate estático de assets pasó con SBOM y cuatro checksums, pero el instalador no se instaló ni se aceptó visualmente. El NSIS histórico del checkout `7c7e9f0a` sí terminó smoke offline con salida 0: instalación/desinstalación, health, runtime, notices, preservación de datos y cleanup; no probó ingestión, búsqueda ni exports. El workflow de publicación completo desde `main` no se ha ejecutado. Faltan aceptación Tauri, resolución del gate legal y aprobación/revisión SPDX/notices. El MSI falla con versiones prerelease alfanuméricas; la Beta directa genera NSIS.

“Descarga gratis” describe el precio de descarga. La licencia del código es **Pulsaria Source-Visible Beta License**, no una licencia open source aprobada por OSI.

## Autoridad y preservación

- Checkout inspeccionado: `C:\Users\danie\Desktop\Pulsaria`.
- Rama de trabajo: `beta2-hardening`; el último commit de código es `cceb300d`; CI canónico y preflight pasaron. El PR #2 sigue abierto, en borrador y `CLEAN`; `scratch/` sigue sin seguimiento y fuera del cambio.
- El árbol ya tenía cambios extensos y archivos nuevos antes de esta fase. Se trabajó sobre ese mismo estado; no se ejecutaron reset, clean ni stash.
- El código de actividad, errores de API local y playlists se modificó en esta fase. El instalador smoke crea y borra exclusivamente directorios de prueba dentro de `%TEMP%` y confirma que el marcador de datos sobrevive a la desinstalación.

## Fases y evidencia

| Fase | Estado | Evidencia actual | Cierre requerido |
| --- | --- | --- | --- |
| 0. Preservar y fijar autoridad | **PASS** | Rama `beta2-hardening`; último cambio de código `cceb300d`; `scratch/` sigue sin seguimiento y fuera del cambio. No se ejecutaron reset, clean ni stash en el checkout principal. El PR #2 sigue abierto, en borrador, `CLEAN` y sus checks pasaron en el head documental `54e58311`. | Revisar el rollup del PR y mergear antes de tag/release. |
| 1. Integridad de código y MVP | **CI y gates locales PASS** | `verify-canonical-source` pasó en el head anterior `468cbf28` (run `36483722105`), incluyendo estructura, frontend, accesibilidad, iconos y 103 pruebas Rust. El último cambio de código `cceb300d` pasó CI canónico [36496984856](https://github.com/danielunibe/PulsarIA/actions/runs/36496984856) y preflight [36496984781](https://github.com/danielunibe/PulsarIA/actions/runs/36496984781). El head documental `54e58311` pasó CI [36513290261](https://github.com/danielunibe/PulsarIA/actions/runs/36513290261) y preflight [36513290253](https://github.com/danielunibe/PulsarIA/actions/runs/36513290253). En `e118ac09` pasaron versión, LLM y `npm audit --omit=dev --audit-level=low` (cero vulnerabilidades). `npm run verify:mvp` local pasó 13/13 en `70ea1090`, que contenía el mismo código fuente (103 pruebas Rust; Python 32 pruebas con una omisión live; runtime 54/54). | Mantener checks verdes en el head final del PR; reconstruir y probar el instalador del commit integrado antes de publicar. |
| 2. Reparación de actividad y playlists | **PASS automatizado / gateway nativo PASS / visual parcial** | Centro de actividad conectado a trabajos persistidos; carga/error/reintento explícitos; sin ceros falsos cuando falla el motor; mensajes REST 401/403 explican que la biblioteca requiere la app de escritorio; el fallo de red esperado de Playlists queda como advertencia en preview web y ya no abre el overlay rojo de Next Dev; gates históricos lint/TypeScript/`verify:mvp` pasan. El lanzador aislado corregido respondió PASS en `/health` 8080 (`status=ok`, `0.1.0-beta.2`); la aceptación visual Tauri sigue pendiente. | Revisión visual real en Tauri a 1280×800 y 860×640. |
| 3. Calidad complementaria | **Gates del workflow PASS; aceptación nativa pendiente** | El flujo de publicación ejecuta `verify:versions`, `verify:local-llm`, `verify:mvp`, `verify:api` y `npm audit --omit=dev --audit-level=low`. En el checkout con fuente `cceb300d`, pasaron `verify:versions`, `verify:local-llm` y `npm audit` (cero vulnerabilidades); `verify:mvp` pasó 13/13 con `103` pruebas Rust y `32` Python (una omisión live). En el head documental `54e58311` pasó CI canónico [36513290261](https://github.com/danielunibe/PulsarIA/actions/runs/36513290261) y preflight [36513290253](https://github.com/danielunibe/PulsarIA/actions/runs/36513290253). La comparación de icono externo no se repitió en esta verificación: el runner valida PNG del repo y dimensiones/presencia de assets; la referencia externa sigue pendiente local. | Conservar logs y mantener separada la aceptación visual real en Tauri. |
| 4. Instalador Windows actual | **Build NSIS y gate estático PASS; smoke instalado pendiente** | El NSIS compilado desde la fuente `54e58311` en worktree aislado mide 513,644,801 bytes; SHA-256 `D74DE49759D33A62CE06E26D3C97D48A7CC4112B142431FF6AF39DB2DDE3C375`. El bootstrap `eval.3` pasó el pin de SHA y el runtime 45/45; `verify-direct-release-artifacts.ps1` PASS con SBOM SPDX agregado, cuatro checksums y firma `NotSigned`. No se instaló porque Pulsaria seguía abierta en el checkout principal y podía ocupar los puertos. El NSIS histórico desde `7c7e9f0a` sí pasó `verify:installed` offline en 8080, pero ese resultado no certifica esta build. Ingestión, búsqueda y exports no se ejecutaron en el smoke anterior. | Instalar y probar este artefacto en perfil aislado cuando estén libres los puertos; después aceptar Tauri visualmente. MSI solo para versión estable. |
| 5. Pipeline live de contenido | **PENDIENTE** | Las 32 pruebas ejecutadas: 31 PASS y 1 skip porque no se suministró URL TikTok autorizada. El smoke NSIS fue offline y no prueba ingestión live. | Ejecutar con URL autorizada y harness nativo que entregue el token de proceso; comprobar ingestión, duplicado, outputs, búsqueda y reinicio. |
| 6. Legal, dependencias y atribuciones | **BLOCKED_EXTERNAL** | SPDX agregado actualizado: 34 npm de producción, 695 Cargo, 33 Python, 54 recursos runtime, 13 documentos legales y la huella de licencia BSD-3-Clause de Colorama. `valid-url@1.0.9` se excluye por ser transitiva de desarrollo. El ZIP Gyan full 8.1.2 se verificó por digest y el `ffmpeg.exe` extraído coincide byte por byte; su README contiene commit FFmpeg, configuración y las 70 versiones del [inventario técnico](FFMPEG_GYAN_8.1.2_INVENTARIO.md), pero no los árboles fuente. El verificador sigue BLOCKED por `COMPONENT_LICENSE_REVIEW_PENDING` y placeholders `public_owner`, `legal_contact_email`, `notice_address`, `legal_approval`; los seis documentos legales también requieren datos/aprobación del titular. | Confirmar titular y canales autorizados; revisar SPDX/notices exactos, fuente de los componentes estáticos y textos. No rellenar campos por inferencia. |
| 7. Publicar la versión validada en GitHub | **PENDIENTE / ruta implementada en PR** | La release pública más reciente es [`v0.1.0-eval.3`](https://github.com/danielunibe/Pulsaria/releases/tag/v0.1.0-eval.3). `.github/workflows/direct-download-release.yml` solo admite despacho manual desde `main`; el tag debe resolver al mismo commit ya integrado en `main` y la versión fuente debe coincidir. Descarga el instalador NSIS de `eval.3` como semilla de runtime con SHA-256 fijado. El preflight de runtime completo anterior verificó 54/54 recursos; el check del head documental `54e58311` pasó sin preparar runtime porque sus cambios eran solo documentales; el bootstrap local posterior validó 45/45 archivos runtime para el NSIS candidato. El workflow de publicación desde `main` no se ha ejecutado. El Environment `direct-download` requiere revisión, solo permite `main`, desactiva bypass y mantiene `DIRECT_DOWNLOAD_RELEASE_READY=false`; PR #2 sigue en borrador, sin revisiones. | Completar aceptación Tauri y revisión legal humana; integrar el PR después de revisión; crear tag desde head aprobado, ejecutar workflow manual y confirmar assets/digests públicos. Después actualizar sitio y README con URL/hash reales. |
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
sin coincidencias; las DEMO explican que no son datos persistidos. El código
actual conserva esos cambios y el head documental `54e58311` pasó CI canónico
`36513290261` y preflight `36513290253`; falta aceptar estos estados con la
ventana Tauri y el backend real.

## Bloqueos concretos para pedir al titular

1. Confirmar quién posee los derechos de Pulsaria: persona física o entidad; usar el nombre legal exacto de ese titular en licencia, EULA, manifiesto y copyright.
2. Reservar un correo legal público dedicado que controle el titular y un domicilio real, autorizado para recibir avisos. No se debe inventar el dato ni poner el domicilio particular por defecto. La ley mexicana vigente pide identidad y domicilio del responsable en el aviso de privacidad (art. 15, fr. I); revisar el domicilio concreto con asesoría mexicana antes de publicarlo: [texto vigente de la LFPDPPP, Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf).
3. La web actual solo dirige “Soporte” a GitHub Issues; no usar Issues para solicitudes de privacidad ni como domicilio legal. Crear un canal legal dedicado y dejar los datos personales fuera de tickets públicos.
4. Aprobación humana real de licencia, EULA, privacidad, contenido, copyright/takedown y notices; el gate no trata la aprobación pendiente como un dato técnico.
5. Revisar el SPDX y notices del artefacto exacto y confirmar dependencias, modelos, atribuciones y procedencia de derechos; el marcador `COMPONENT_LICENSE_REVIEW_PENDING` bloquea la publicación hasta la revisión humana.
6. Una URL de TikTok cuyo procesamiento el titular esté autorizado a validar, si se quiere cerrar el smoke live de esta versión.

## Límites de lo demostrado

- El smoke instalado histórico de `7c7e9f0a` certifica inicio, health local, reinicio, empaquetado, ubicación de datos y desinstalación; no es aceptación visual de la ventana Tauri ni prueba de TikTok live. El NSIS candidato de `54e58311` aún no se instaló.
- El instalador Beta 2 candidato pesa 513,644,801 bytes y no tiene Authenticode; Windows puede mostrar advertencias. Su SHA-256 (`D74DE49759D33A62CE06E26D3C97D48A7CC4112B142431FF6AF39DB2DDE3C375`) identifica la build local exacta, no un asset publicado.
- La compilación general con NSIS+MSI no fue PASS: el MSI prerelease falló. El NSIS histórico sí pasó smoke instalado; el NSIS candidato actual pasó build y gate estático, pero no smoke instalado.
- La existencia de una release pública anterior no demuestra que el código Beta 2 actual esté descargable.
