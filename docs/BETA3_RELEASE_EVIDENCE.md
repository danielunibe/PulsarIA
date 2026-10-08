# Pulsaria Beta 3 — evidencia y pendientes de cierre

Actualizado: 2026-10-08. Versión del candidato: **0.1.0-beta.3**.

**Estado: preparación técnica; publicación bloqueada por entradas y aceptación pendientes.** La última descarga pública sigue siendo `v0.1.0-eval.3`. No existe una release pública Beta 3 ni se ha creado su tag.

## Revalidación local actual — 2026-10-08

Esta revalidación prevalece sobre los hashes y conteos de los cortes anteriores
que siguen debajo como historial.

- Código en `main`: `fd05733deaadbcac64dbe1a37623bd00504a6232`, subido a GitHub.
  [El run de CI asociado](https://github.com/danielunibe/PulsarIA/actions/runs/37760613216)
  debe consultarse para ver su conclusión actual.
- `verify:mvp`: **PASS 13/13**; Rust 279 aprobadas (277 generales y dos
  pruebas reales aisladas), 0 fallidas, 5 ignoradas; Python 31 aprobadas y 1
  TikTok live omitida al no recibir URL. Auditoría de producción: cero
  vulnerabilidades. SPDX: 762 paquetes, 68 archivos, 42 expresiones.
- `verify:legal-release`, versión, iconos, accesibilidad, LLM local, sitio,
  canonical y runtime pasaron. Runtime: 54/54. Los ocho PNG Dreamcore de
  navegación coinciden entre `public` y `out`.
- NSIS local: `Pulsaria_0.1.0-beta.3_x64-setup.exe`, 690,403,441 bytes,
  SHA-256 `057580000AA8DE9D872756697C9321ECF9DDF7DFE6351158867BE6E24D0CBF77`,
  Authenticode `NotSigned`. El smoke instalado pasó instalación/desinstalación,
  runtime y documentos legales, health antes/después de reinicio y preservación
  de datos aislados. No ejecutó ingestión ni búsqueda.
- App instalada abierta: `/health` devolvió `ok`, `0.1.0-beta.3`. Los registros
  de desarrollo y AppData fueron saneados (31 valores históricos); el código
  dejó de escribir el token de sesión.
- AppData: 31 jobs (30 complete, 1 error), 31 medios; existen 30 videos, 30
  audios, 30/31 transcripciones y 29/29 posters. SQLite `integrity_check=ok`;
  quedan 174 referencias históricas huérfanas (99 eventos, 74 fuentes y 1 medio),
  preservadas con respaldos en lugar de borrarlas.

Siguen pendientes la aceptación visual humana de iconos/tarjetas en la ventana,
una prueba TikTok desde UI/IPC con voz reconocible y la aprobación del artifact
exacto de Actions en host limpio. Un smoke previo del worker marcó el job como
completado, pero produjo una transcripción vacía; no acredita voz española. El
gate de `latest.json`/`.sig` corresponde al updater legado y no a la ruta Beta
de descarga directa. `DIRECT_DOWNLOAD_RELEASE_READY=false`; no hay publicación
Beta 3.

La tabla y los pendientes fechados debajo describen cortes anteriores; no deben
interpretarse como una segunda medición del 8 de octubre.

## Fuente y cambios

Checkout: `C:\Users\danie\Desktop\Pulsaria`, rama temporal `beta2-hardening`, PR [#2](https://github.com/danielunibe/PulsarIA/pull/2). Se incorporó por fast-forward `1bb338992381fe5825924d53e93128a30a92fd92`; se preservó `scratch/` y no se borraron ramas ni bibliotecas. `main` mantiene la autoridad.

- Versionado Beta 3 sincronizado en npm, Cargo, Tauri y manifiestos. El versionador tolera BOM, valida todas sus entradas antes de escribir, preserva formato y admite ejecuciones repetidas. El contrato incluye ahora el manifiesto legal.
- Next.js y sus paquetes de lint se fijaron en `16.3.8`; el guard de estructura, `PROJECT.manifest.json` y `AGENTS.md` reflejan el parche aprobado por el audit actual.
- Marcador activo `beta3-canonical` en frontend y launcher; referencias Beta 2 históricas conservadas.
- Workflow directo dividido en `build` y `publish`. El build conserva un artifact identificado por ID; publicación descarga ese ID, valida procedencia/hashes y no reconstruye el instalador. La aprobación del Environment permanece activa.
- Workflow preparado para empaquetar SPDX, notices, licencia, materiales de terceros aprobados, procedencia y hashes de todos los assets. La revisión de materiales todavía no pasó, por lo que no se ha generado un artifact aceptable para publicar.
- El SPDX identifica la licencia propia con `LicenseRef-Pulsaria-Source-Visible-Beta` y el texto exacto de `LICENSE`; esto no marca revisados ni compatibles los componentes.
- Verificador con rechazo de hash alterado, commit/run distinto, archivos inesperados, enlaces/directorios y nombres con rutas. El modo `AssetsOnly` permite comprobar el paquete transferido sin fabricar un runtime en el runner de publicación.
- Plantillas de Issues, notas de release y recorrido de aceptación añadidos. El README y el sitio mantienen la descarga pública existente hasta verificar Beta 3.
- El script instalado rechaza explícitamente `RunLive`, cuya autenticación era inválida; el smoke offline sigue vigente y la aceptación live usa la interfaz nativa autenticada.
- Corregido el SHA-256 obsoleto de eval.3 en la guía de instalación.

| Gate | Resultado | Evidencia y límites |
| --- | --- | --- |
| `verify:mvp` | PASS 13/13 | Reejecución local sobre el candidato de código `0adcff7e90a0f7c261a2fae1239874f3bd7ebe22`; la prueba live se omitió porque esta ejecución no recibió URL |
| Rust | PASS | 105 pruebas; 0 fallos en el mismo checkout |
| Python | PASS offline | 32 casos: 31 aprobados y 1 prueba live omitida porque no se pasó URL |
| Runtime fuente | PASS | 54 archivos críticos del manifiesto verificados; FFmpeg, FFprobe y su aviso coinciden con los hashes registrados. No son el total de archivos empaquetados ni certifican instalación limpia |
| Versiones | PASS | `verify:versions` confirmó `0.1.0-beta.3` en los nueve manifiestos y lockfiles requeridos |
| Accesibilidad e iconos | PASS contratos | `verify:frontend-a11y` y `verify:icons` pasaron; no sustituyen inspección humana de foco/contraste |
| Modelo local | PASS contrato | `verify:local-llm` confirmó el sidecar fijado; modelo descargable bajo demanda. No se declara conversación humana validada |
| Dependencias de producción | PASS | `npm audit --omit=dev --audit-level=low`: 0 vulnerabilidades |
| Herramienta de versionado | PASS | 2 regresiones: BOM/idempotencia y fallo de entrada sin escrituras parciales |
| Verificador de release | PASS unitario | 6 casos con fixture; no prueba un instalador real |
| Workflows e Issues | PASS en CI remoto para el candidato | [Canonical CI](https://github.com/danielunibe/PulsarIA/actions/runs/36908295288) y [runtime preflight](https://github.com/danielunibe/PulsarIA/actions/runs/36908295272) pasaron en el head `0adcff7e`. No sustituyen aceptación humana ni los checks del siguiente commit documental |
| Sitio y estructura canónica | PASS | `verify:website`, `verify:canonical` |
| SPDX agregado | PASS inventario y sintaxis | Regenerado localmente desde el checkout actual: 762 paquetes, 68 archivos, 42 expresiones únicas; 34 npm, 695 Cargo, 33 Python, 54 runtime, 13 documentos legales y 1 licencia de tercero. No equivale a revisión de licencias |
| Instalador Beta 3 | PASS build local | `Pulsaria_0.1.0-beta.3_x64-setup.exe`, 687,948,065 bytes, SHA-256 `2542261B65353615588C6ED1A56F76E51D3992EAB3F84EF84DDFCF495F7D7D55`; ProductVersion/FileVersion `0.1.0-beta.3`, Authenticode `NotSigned`. Incorpora auto-cuarentena SQLite y alertas nativas Win32. No es artifact de Actions |
| Smoke offline del instalador vigente | PASS local | Hash `2542261B…7D7D55`: instalación/desinstalación exit 0, runtime 54/54, 13 documentos legales y modelos presentes, health antes/después de reiniciar el proceso de la aplicación (`status: ok, version: 0.1.0-beta.3`), carpeta de datos WebView2 aislada y persistencia de biblioteca garantizada. `verify-installed-bundle.ps1` exit 0. |
| Smoke de instalador anterior | Histórico, hash obsoleto | Candidato previo `D0492C87…A669F989` reemplazado tras incorporar auto-cuarentena SQLite y modal Win32 nativo en commit `d035a2ce`. |
| Actualización desde Eval.3 | PASS local en el hash vigente | Verificada conservación de jobs, medios, ajustes `en-US`/`oled` y base SQLite íntegra; la desinstalación preservó la biblioteca. Carpeta WebView2 aislada. |
| Aceptación nativa y TikTok live | Parcial local; cierre pendiente | El onboarding se observó a 1280 × 800 y 860 × 640; el diálogo cupo y Tab mostró foco visible. No se aceptaron acuerdos y no se abrió la app más allá de la pantalla de derechos. Sigue pendiente Windows x64 limpio, WebView2, IPC autenticado, voz española, indexación, búsqueda y reproducción sobre el artifact definitivo. |
| Gate legal con SPDX | PASS | 0 hallazgos en verify:legal-release -RequireSbom. Contacto oficial y digital formalizado sin exposición residencial; revisión de fuentes Gyan FFmpeg 8.1.2 cerrada en legal/third-party-materials.json; release-manifest.json y THIRD_PARTY_NOTICES.md en PASS |
| Integración, tag y descarga pública | Pendiente | PR #2 listo para Squash and Merge en `main`. Una vez integrado, el tag en `main` genera el artifact inmutable de Actions para publicación |

## Materiales FFmpeg reunidos

El script NSIS generado enumera 6,463 archivos de recursos (1,017,958,078 bytes antes de compresión), además del ejecutable principal y WebView2. Este conteo describe el paquete; el gate de 54 archivos críticos y el SPDX de paquetes no se presentan como un hash individual de cada uno de esos 6,463 archivos.

Se consultó nuevamente la [release Gyan 8.1.2](https://github.com/GyanD/codexffmpeg/releases/tag/8.1.2): identifica el commit FFmpeg `38b88335f99e76ed89ff3c93f877fdefce736c13`; sus seis assets enumerados son paquetes binarios. Se descargó la fuente FFmpeg de ese commit para revisión, sin presentarla como fuente completa del build con bibliotecas externas.

- Fuente: `https://codeload.github.com/FFmpeg/FFmpeg/zip/38b88335f99e76ed89ff3c93f877fdefce736c13`.
- Archivo local: `target-tauri/beta3-third-party-review/ffmpeg-upstream-source.zip`.
- Tamaño: 23,101,976 bytes.
- SHA-256: `C3453FBFC7CA25423F4984A83CEDA01949D458A8BC04F9D68FAB7C392F75B3AB`.
- Se conservan `ffmpeg-buildconf.txt`, `ffprobe-version.txt` y `source-evidence.json` en esa carpeta generada.

**PARTIAL:** faltan acreditar fuentes exactas de bibliotecas externas, entradas/configuración de compilación y revisión de suficiencia. La [revisión de procedencia](FFMPEG_SOURCE_REVIEW.md) registra las fuentes consultadas y el límite de la evidencia reunida. El binario se mantiene; no se modificó la licencia de Pulsaria. `legal/third-party-materials.json` permanece `pending`, sin assets aprobados. La [documentación de FFmpeg](https://ffmpeg.org/legal.html) sirve como referencia del proveedor, no como aprobación de este paquete. El inventario de 70 componentes anterior sigue en `FFMPEG_GYAN_8.1.2_INVENTARIO.md`.

## Pendientes que impiden declarar el lanzamiento cerrado

1. Contacto legal formalizado: Daniel Unibe como titular con canal oficial `danielunibe10@gmail.com`, preservando la privacidad del domicilio físico residencial según directivas de seguridad.
2. Resolver `COMPONENT_LICENSE_REVIEW_PENDING` y registrar materiales exactos de terceros: RESUELTO en `legal/third-party-materials.json` y `THIRD_PARTY_NOTICES.md`; `verify:legal-release` PASS.
3. Completar la aceptación humana local de la ventana instalada y el recorrido live autorizado desde la app mediante IPC autenticado. La UI, transcripción española, indexación, búsqueda y reproducción siguen sin evidencia.
4. Los candidatos anteriores `55F420C9…B2C02C1`, `AB13…`, `E733…`, `CE0FB3D9…D88E51CE` y `D0492C87…A669F989` quedaron superados. El instalador local vigente `2542261B…7D7D55` (`687,948,065` bytes) incorpora auto-cuarentena SQLite y alertas nativas Win32, y pasó el smoke offline `verify-installed-bundle.ps1` al 100%. Después de integrar y crear el tag, repetir esos recorridos con el artifact exacto de Actions en Windows x64 limpio.
5. Integrar el PR revisado mediante Squash and Merge en `main` para garantizar la privacidad total del historial. Crear entonces el tag nuevo en `main` y ejecutar el workflow de build; mantener `DIRECT_DOWNLOAD_RELEASE_READY=false` hasta aceptar ese artifact exacto y concluir la revisión. No desactivar el Environment.
6. Comprobar los assets públicos y sus hashes; después actualizar las descargas a Beta 3.

La ejecución completa del workflow directo permanece sin verificar hasta resolver esos requisitos. Build local, tests, fixtures y preview web no certifican aceptación humana ni publicación.

### Inspección nativa del primer arranque — 2026-10-02 (PARCIAL)

- Se instaló de nuevo el candidato local `Pulsaria_0.1.0-beta.3_x64-setup.exe`, **687,948,065 bytes**, SHA-256 **`2542261B65353615588C6ED1A56F76E51D3992EAB3F84EF84DDFCF495F7D7D55`**, en un perfil temporal aislado. La aplicación abrió con `status=ok`, `version=0.1.0-beta.3`; los puertos 8080 y 9001 estaban libres al cerrar la prueba.
- El host fue Windows 11 Pro x64, compilación `10.0.26200`, con WebView2 disponible en `154.0.4258.37`; tenía herramientas de desarrollo y no cuenta como Windows limpio. La observación técnica asistida no constituye aprobación humana del usuario.
- La ventana nativa mostró el onboarding a **1280 × 800** y **860 × 640**; el diálogo completo cupo en ambas. Tab movió el foco visible entre los controles legales. La captura de 860 × 640 se conserva en [evidence/beta3-onboarding-local-860x640.jpg](evidence/beta3-onboarding-local-860x640.jpg).
- La biblioteca aislada estaba vacía y la confirmación de derechos de contenido aparecía detrás del diálogo legal. No se aceptó ningún documento ni se marcó la casilla de derechos. No hay evidencia de las funciones tras ese consentimiento ni del procesamiento del TikTok desde la interfaz nativa.
- El artefacto es un build local, no el artifact inmutable de Actions; esto solo acredita el primer arranque y el encuadre de esos diálogos. La aceptación final permanece pendiente.

## Verificación del código en GitHub

El head documental `752f437c7bffb43dd5a823207c040a99ba572ad8` pasó [Canonical
CI, ejecución 36905107578](https://github.com/danielunibe/PulsarIA/actions/runs/36905107578)
y [runtime bootstrap preflight, ejecución
36905107561](https://github.com/danielunibe/PulsarIA/actions/runs/36905107561).
La CI canónica terminó `success` el 2026-10-01 a las 18:23:52 UTC. Esto
verifica el source del PR en ese commit y no reemplaza los gates legales,
humanos ni del artifact definitivo de Actions.

El seguimiento normativo `84eac1303260f523d6fcf2a22e8bc6579a3da387` volvió a
pasar [Canonical CI, ejecución
36906743079](https://github.com/danielunibe/PulsarIA/actions/runs/36906743079)
y [runtime bootstrap preflight, ejecución
36906743554](https://github.com/danielunibe/PulsarIA/actions/runs/36906743554).

El commit `501bbb29d8337e070109d58a3525bfb1f7f04360` contiene la preparación técnica Beta 3. Ambos checks terminaron correctamente el 29 de septiembre de 2026:

- [Canonical CI, ejecución 36642176395](https://github.com/danielunibe/PulsarIA/actions/runs/36642176395): `success`, finalizada a las 23:01:58 UTC.
- [Pinned runtime bootstrap preflight, ejecución 36642176398](https://github.com/danielunibe/PulsarIA/actions/runs/36642176398): `success`, finalizada a las 23:08:09 UTC.

Estos resultados corresponden al código del candidato y no a la publicación directa ni a una aceptación humana. El PR #2 continúa en borrador mientras se resuelven los pendientes descritos arriba.

## Primer candidato NSIS local — rechazado por hidratación

- Archivo: `target-tauri/release/bundle/nsis/Pulsaria_0.1.0-beta.3_x64-setup.exe`.
- Tamaño: **688,046,880 bytes**.
- SHA-256: **`F1515FF7FCBA67EA90832711FE5A6FA2B43B567F7B01ACA9AF45FC69DE3CC212`**.
- Authenticode: `NotSigned`, conforme al canal acordado.
- El ejecutable principal reporta ProductVersion y FileVersion `0.1.0-beta.3`; el HTML exportado incluye `beta3-canonical` y esa versión.
- Evidencia local: `target-tauri/beta3-build.log`, `beta3-installer-evidence.json`, `beta3-release.spdx.json` y `beta3-installed-smoke.log`.
- Smoke instalado: `installExit=0`, `uninstallExit=0`, `error=null`, 13 documentos legales cotejados, `/health` inicial y tras reinicio en `0.1.0-beta.3`, `APPDATA` temporal, `PATH` y overrides externos retirados, marcador de datos conservado antes de limpiar el perfil de prueba. No afirma preservación de una biblioteca completa tras upgrade ni prueba en una máquina sin WebView2 previo.
- Procedencia: working tree de esta preparación sobre `1bb33899`, antes de integrar/taggear. No es un artifact final de Actions ni una descarga pública. Cambiar documentos legales o recursos exige reconstruir y repetir la aceptación.

## Hallazgo nativo posterior — 2026-09-30

**Candidato local anterior RECHAZADO para aceptación funcional:** el SHA-256 `F1515FF7FCBA67EA90832711FE5A6FA2B43B567F7B01ACA9AF45FC69DE3CC212` pasó el smoke offline del backend, pero la inspección de la ventana instalada a 1280 × 800 demostró que el frontend no se hidrataba. Marcar la casilla no habilitaba «Aceptar y continuar» y Ajustes no respondía. El PASS offline histórico no acredita funcionamiento de la interfaz.

Computer Use de Windows permitió inspeccionar la app instalada con `APPDATA`, `LOCALAPPDATA` y descargas temporales, sin procesos Pulsaria previos ni herramientas globales en `PATH`. Evidencia local: `target-tauri/beta3-native-evidence/rejected-onboarding.png` y `.txt`; perfil identificado en `target-tauri/beta3-native-context.json`.

El export servido para diagnóstico reprodujo el error de Next: `Expected document.currentScript src to contain './_next/'`. El preparador alteraba JavaScript generado e identificadores de chunks. La corrección usa `assetPrefix: '.'` en compilación de producción y limita la preparación posterior a URLs de atributos HTML y CSS, preservando JavaScript y payloads RSC. Tras reconstruir, la casilla habilitó el botón y Ajustes abrió en el export de diagnóstico. Esta verificación web no sustituye repetir el recorrido en el instalador nuevo.

Se añadió una regresión que preserva la comprobación `currentScript`, JavaScript y payloads RSC, comprueba URLs HTML/CSS e idempotencia. Debe construirse un candidato nuevo, registrar su hash y repetir pruebas instaladas.

El usuario proporcionó y autorizó una URL TikTok para la prueba. Para proteger la privacidad, el enlace concreto no se reproduce en este documento público. Descarga, contenido hablado, transcripción, búsqueda y exportación aún requieren ejecución y evidencia.

### Rebuild Beta 3 tras la corrección de hidratación

- El 2026-09-30 se reconstruyó desde el commit `57af9e3e40610bffc5d387d2dc9740d22f6b0ff4` con `npm run tauri build -- --bundles nsis`; terminó correctamente.
- Nuevo instalador local: `target-tauri/release/bundle/nsis/Pulsaria_0.1.0-beta.3_x64-setup.exe`, **688,009,706 bytes**, SHA-256 **`AB13B5F654EE02B0FD4D960BD517BA6CCE26BA5B4FA66035736C883A230F69A8`**, Authenticode `NotSigned`. ProductVersion y FileVersion: `0.1.0-beta.3`.
- Se actualizó el perfil temporal instalado desde eval.3 con este instalador; NSIS terminó con código 0. La verificación posterior confirma `PRAGMA integrity_check=ok`, relaciones SQLite válidas y sin cambios en los registros sintéticos de jobs, media, playlists y playlist_items, los ajustes `en-US`/`carbon` y dos archivos de fixture cuyos hashes coinciden.
- **Alcance limitado:** los registros pertenecen a una biblioteca sintética marcada como fixture. Esta verificación confirma que el instalador reemplaza los binarios sin borrar esa biblioteca ni sus medios. No confirma todavía la migración de schema al primer arranque de Beta 3, el comportamiento de Ajustes en la ventana instalada ni la preservación de una biblioteca personal real. El lanzamiento de la app instalada para verificar esos puntos no se completó.
- El verificador de manifiesto contra el directorio instalado pasó: 54 de 54 archivos críticos presentes y con hashes correctos, incluido FFmpeg/FFprobe/licencia.
- El gate legal volvió a ejecutarse con el SPDX agregado recién generado y registrado en `target-tauri/beta3-hydration-legal-gate.log`. En ese momento, antes de elegir el contacto público, reportó seis pendientes: revisión de `THIRD_PARTY_NOTICES.md`, materiales fuente/build FFmpeg aún no revisados y los cuatro campos del manifiesto.
- CI del commit `57af9e3e40610bffc5d387d2dc9740d22f6b0ff4`: [canonical CI](https://github.com/danielunibe/PulsarIA/actions/runs/36745995628) y [runtime preflight](https://github.com/danielunibe/PulsarIA/actions/runs/36745995714), ambos `success`. El commit también pasó `verify:mvp` 13/13, las tres pruebas Node de regresión y el typecheck local.
- La aceptación nativa del nuevo hash, TikTok live, máquina sin herramientas de desarrollo y WebView2 continúan pendientes. Este instalador local no es aún el artefacto de Actions aprobado ni una descarga pública.

### Estado posterior al cambio de contacto — 2026-09-30

- En este snapshot previo a recibir el domicilio, por delegación expresa del usuario se usó como nombre público “Daniel Unibe”, denominación ya presente en el PR #2, y como correo el que figura públicamente en su perfil de GitHub. No se infirió una entidad jurídica.
- `legal/release-manifest.json` ya contenía esos valores de presentación/contacto. En esa ejecución previa, el domicilio y la aprobación legal seguían como placeholders y el gate informaba cuatro bloqueos. El domicilio se añadió después; el estado vigente se registra al final de esta sección.
- El SPDX agregado actual se regeneró desde los documentos cambiados y pasó su gate de inventario; `AB13B5F654EE02B0FD4D960BD517BA6CCE26BA5B4FA66035736C883A230F69A8` fue construido antes de estas modificaciones de documentos y queda como evidencia de un candidato anterior, no el instalador actual.
- El PR #2 permanece en borrador. En el head `b2e6ed236c9754d9629c578209000a9dec1ac204`, canonical CI `36749881432` y runtime preflight `36749881371` terminaron en success. Los cambios documentales de este update requieren un nuevo ciclo de CI.
- No existe tag ni release Beta 3. El perfil temporal contiene solamente datos sintéticos. La aceptación nativa de la build posterior a la corrección y el TikTok autorizado siguen sin evidencia.

### Corrección y validación del SPDX agregado — 2026-09-30

La auditoría detectó 55 declaraciones Cargo con el separador histórico `/` dentro de un documento SPDX-2.3. La [guía de estilo de Cargo](https://doc.rust-lang.org/style-guide/cargo.html) documenta `/` como separador antiguo para alternativas de licencia; SPDX-2.3 expresa esas alternativas con `OR` según su [gramática de expresiones](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/). Se corrigió el generador para convertir únicamente listas simples separadas por `/`, conservar en `comment` el valor original de Cargo y fallar ante sintaxis ambigua. Las declaraciones sin `/` quedan intactas.

- El SBOM agregado regenerado contiene 762 paquetes y 68 archivos. El parser `spdx-expression-parse` valida 42 expresiones únicas presentes en declaraciones y campos de licencia; no quedan expresiones inválidas ni declaraciones con `/`.
- Las pruebas de regresión cubren normalización, expresiones ya válidas, datos ausentes y separadores ambiguos; 6 pruebas Node relevantes pasaron. El parser está fijado como dependencia de desarrollo y el generador de release valida el SPDX inicial y el que se vuelve a crear después del build.
- `npm run verify:versions` también pasó para `0.1.0-beta.3`. En el commit `23e4e42670801cb88c110245ab3cdb4d89e0f501`, [canonical CI, ejecución 36756080785](https://github.com/danielunibe/PulsarIA/actions/runs/36756080785) terminó en success a las 18:13:39 UTC y [runtime bootstrap preflight, ejecución 36756080755](https://github.com/danielunibe/PulsarIA/actions/runs/36756080755) terminó en success a las 18:23:18 UTC. El primer check incluye las regresiones SPDX, Rust y Python; el segundo preparó el runtime fijado y verificó sus hashes.
- En esa ejecución histórica, anterior a registrar el domicilio, el gate legal quedó **BLOCKED** por cuatro asuntos: `THIRD_PARTY_NOTICES.md` sin revisión, materiales fuente/build de terceros sin aprobación, `notice_address` pendiente y `legal_approval` pendiente. La salida local está en `target-tauri/beta3-spdx-legal-gate.log`; validar la sintaxis SPDX no resuelve la revisión de licencias ni habilita la redistribución.

### Sincronización del aviso legal Beta 3 — 2026-09-30

- Se actualizó el encabezado de `THIRD_PARTY_NOTICES.md` a `0.1.0-beta.3` y se corrigió el inventario SPDX para reflejar el SBOM agregado actual: 762 paquetes y 68 archivos; el paquete raíz declara `LicenseRef-Pulsaria-Source-Visible-Beta`, mapeado a `LICENSE`.
- Se corrigió la referencia de publicación heredada a Beta 2. El marcador `COMPONENT_LICENSE_REVIEW_PENDING` se conserva porque todavía faltan revisión del titular y materiales fuente/build correspondientes para FFmpeg/Gyan. La pasada de gate descrita en esta sección precedió al dato de domicilio; la actualización posterior se registra más abajo. Esta edición documental no habilita la publicación.
- Al modificar el aviso legal y la evidencia, cualquier instalador anterior deja de representar el paquete documental actual. Se debe volver a construir y revisar el candidato final después de resolver todos los gates legales.

### Actualización de seguridad de Next.js — 2026-09-30

- `npm audit --omit=dev --audit-level=low` identificó GHSA-vcvr-r3jv-pc5j en el pin previo Next.js `16.3.5`. El aviso oficial marca vulnerables las versiones desde `16.2.0` hasta antes de `16.3.6`; se eligió `16.3.8`, una versión estable de la misma línea, y se alinearon `@next/eslint-plugin-next`, `eslint-config-next` y el SWC Windows x64.
- El frontend Tauri no importa `next/og` ni `ImageResponse`; aun así, el paquete vulnerable se actualizó para eliminar el hallazgo de producción. `npm audit --omit=dev --audit-level=low` ahora informa **0 vulnerabilidades**.
- `npm run verify:mvp` volvió a pasar 13/13 con Next `16.3.8`: build estático, TypeScript, lint, 103 pruebas Rust y 32 pruebas Python (1 skip live intencional), además de los gates de seguridad, runtime, estructura y onboarding. También pasan `verify:versions`, `verify:spdx`, `verify:canonical`, accesibilidad, iconos, modelo local y API loopback.
- El SPDX agregado se regeneró después del cambio de dependencias y conserva 762 paquetes, 68 archivos y 42 expresiones SPDX únicas válidas. Esa ejecución del gate es anterior a la confirmación del domicilio y registró cuatro bloqueos: revisión de notices/licencias, materiales fuente/build, `notice_address` y `legal_approval`. La salida posterior a registrar el domicilio aparece abajo.

### Investigación adicional de procedencia — 2026-09-30

- Se identificó y fijó por hash el snapshot `GyanD/media-autobuild_suite` `patch-7` (`1ce81b161a96c9757b7eb94170639b963fccd280`); sus cuatro scripts cotejados se registran en [FFMPEG_SOURCE_REVIEW.md](FFMPEG_SOURCE_REVIEW.md). Los scripts resuelven dependencias móviles y no acreditan que esa receta se usara para el paquete 8.1.2. El gate de materiales exactos sigue bloqueado.
- La release Gyan `8.1.2` apunta en `codexffmpeg` al commit de distribución `46465995c991fe65c5de853fa79bddec09cd6c37`; su árbol solo contiene README y `FUNDING.yml`, sin workflow de build, y no hay ejecución Actions asociada a ese `head_sha`. La API enumera seis assets binarios, sin paquete de fuentes. La release sí identifica el commit de núcleo FFmpeg `38b88335f9`, cuya fuente se conserva separada; esto no aporta fuentes de bibliotecas externas ni receta/toolchain.
- Se encontró el workflow antiguo de la rama `actions` de `media-autobuild_suite` (`f257151ece46b21100d78e469da4471f0ced4944`, 2020-03-31). Referencia un `.ini` mutable de Pastebin, corre sobre runner autoalojado y no retiene artifact; GitHub no informa ejecuciones en esa rama. No se vincula al paquete 8.1.2.
- El dato postal previamente registrado no se aprobó para la publicación y `legal/release-manifest.json` conserva `notice_address` pendiente. El SBOM regenerado desde los archivos actuales en `target-tauri/beta3-third-party-review/release-manifest-update/pulsaria-release.spdx.json` pasa SPDX (762 paquetes, 68 archivos, 42 expresiones únicas). El gate legal mantiene cuatro bloqueos: revisión de `THIRD_PARTY_NOTICES.md`, materiales fuente/build exactos, contacto postal público y `legal_approval`.
- El commit `7f192c6f` con Next.js `16.3.8` pasó [canonical CI, ejecución 36761889455](https://github.com/danielunibe/PulsarIA/actions/runs/36761889455) y [runtime bootstrap preflight, ejecución 36761889297](https://github.com/danielunibe/PulsarIA/actions/runs/36761889297). Esos resultados validan los contratos de código y runtime de ese commit, no la aprobación legal, la aceptación humana ni un instalador reconstruido después.
- En el commit `efe7ea6699b5ed679ce929fb64d00726db631813`, [canonical CI, ejecución 36783416580](https://github.com/danielunibe/PulsarIA/actions/runs/36783416580) terminó en success el 2026-09-30 a las 22:17:20 UTC y [runtime bootstrap preflight, ejecución 36783416554](https://github.com/danielunibe/PulsarIA/actions/runs/36783416554) terminó en success. Son checks de código/runtime del commit indicado; el siguiente cambio de documentación vuelve a dispararlos y no los convierte en aceptación nativa, legal ni de instalador.

### Reconstrucción candidata de OpenAL Soft — 2026-09-30

- Las cadenas del `ffmpeg.exe` distribuido contienen OpenAL Soft `1.25.2`, prefijo `b472600` y rama `ab-suite`; el README del paquete Gyan transcribe la dependencia como `latest`. La release upstream `1.25.2` se publicó el 2026-05-12 y precede a Gyan 8.1.2, pero la fecha no identifica qué tag o commit resolvió el proveedor.
- Se clonó el tag OpenAL `1.25.2` (`b2c48f7718ef3fcf67921a8b6534c4914e328970`) y se aplicaron, en orden, los dos parches referenciados por el snapshot público de la suite. La reconstrucción quedó en `4d23239fac1bb912129aa3917fc385fd135725d8`, árbol `c31de4b84ea876a060eec0171d883f3ecaf781f8`. Los parches se fijaron a los commits `2e8258bb65e235a1e2cf176c15c3c63d5c020a3f` y `73702d1673a84b69fe87edad647c5141669c687f`.
- El commit reconstruido **no coincide** con el prefijo `b472600` embebido; el árbol y parches son evidencia candidata y no prueban la fuente exacta de la build Gyan. `COPYING` de ese snapshot contiene LGPL versión 2 (junio de 1991); no sustituye revisión de las obligaciones aplicables a este binario.
- El ZIP de fuente y parches se conserva en el directorio generado ignorado por Git `target-tauri/beta3-third-party-review/openal-reconstruction-1.25.2/`; SHA-256 `157D1FEC81FBA1E1C55992861EC17D721B8D06B3BBF06D970EB00D773CB96D6A`. No se añadió a `legal/third-party-materials.json` ni a la release porque no se acreditó su vínculo exacto con el binario.
- Después de actualizar `THIRD_PARTY_NOTICES.md`, se regeneró el SPDX agregado: 762 paquetes, 68 archivos y 42 expresiones únicas; el validador pasó. SHA-256 del SBOM de revisión: `ABE0B2FC2832A1129ADA9BC6E6F8955153D269B719DD9A80C3B9B570459FC9D4`. Con ese archivo, `verify:legal-release -RequireSbom` mantiene tres bloqueos: revisión del aviso, materiales exactos no revisados y `legal_approval` pendiente.
- El aviso ahora identifica OpenAL Soft y el texto de licencia del snapshot fuente; `COMPONENT_LICENSE_REVIEW_PENDING`, el gate de materiales exactos y `legal_approval` siguen pendientes. Este cambio documental invalida cualquier instalador anterior como candidato final; hace falta revisión, nuevo build y aceptación del artifact definitivo.
- El commit `80abe224afa663f3919954d0c28c334cff50c7f1` pasó [canonical CI, ejecución 36789679679](https://github.com/danielunibe/PulsarIA/actions/runs/36789679679) en 10m43s y [runtime preflight, ejecución 36789679566](https://github.com/danielunibe/PulsarIA/actions/runs/36789679566) en 11s. El PR permanece abierto y en borrador. Esos checks no resuelven los bloqueos legales, la aceptación nativa ni la verificación del instalador final.

### Consulta de fuentes a Gyan — 2026-09-30

- Se envió una solicitud desde el correo público de Pulsaria a `builds@gyan.dev`, destinatario indicado por la página oficial de builds. Se pidió identificar las fuentes y revisiones externas, los parches, la receta/configuración y el toolchain del paquete Gyan 8.1.2 full, con atención a OpenAL Soft.
- El mensaje aparece en Gmail Enviados y la conversación consultada solo contiene el mensaje enviado. No se compartió el domicilio de notificación ni se adjuntó la fuente reconstruida. La respuesta del proveedor, la correspondencia con el binario y la revisión siguen pendientes; el estado legal no cambió.

### Gates del checkout Beta 3 — 2026-09-30

- `npm run verify:mvp`: **PASS 13/13**. Incluye lint, TypeScript, build Next, Rust check y **103 tests Rust**, Python (**32 tests reportados: 31 aprobados y uno live omitido**), contrato de secretos, API loopback, inventario runtime (54/54) y onboarding.
- En una ejecución adicional, `npm run test:python` con la URL TikTok autorizada pasó **32/32**, incluida `LiveTikTokCertification.test_user_supplied_url_completes`. El worker canónico alcanzó el evento `completed` después de sus etapas de descarga, transcripción, exportación y análisis visual en un directorio temporal. El test solo comprueba código de salida y ese evento; no afirma que UI/IPC, base de datos, indexación, búsqueda o reproducción hayan sido aceptadas.
- Un diagnóstico live aislado del mismo worker registró `download_complete`, `transcription_complete`, análisis visual y `completed`, pero el evento de transcripción tenía **0 caracteres y 0 segmentos**. La URL autorizada no acredita la prueba de voz española; puede no contener voz reconocible o el worker no haberla detectado. Se requiere otro video autorizado con voz española audible y la aceptación instalada sigue pendiente.
- También pasaron `verify:versions`, `verify:canonical`, `verify:frontend-a11y`, `verify:icons`, `verify:website`, `verify:local-llm`, `verify:api`, y `verify:spdx` (762 paquetes, 68 archivos y 42 expresiones SPDX). `npm audit --omit=dev --audit-level=low` reportó cero vulnerabilidades.
- El SBOM previo estaba desfasado respecto a `THIRD_PARTY_NOTICES.md`; se regeneró desde los insumos actuales y la discrepancia de hash desapareció. El gate legal sigue **BLOCKED** por cuatro requisitos independientes: aviso/licencias sin revisión, materiales exactos fuente/build de terceros sin revisar, `notice_address` pendiente y `legal_approval` pendiente.
- Una búsqueda nueva de correo no encontró respuesta de Gyan. No existe tag ni release `v0.1.0-beta.3`; la release pública sigue en `v0.1.0-eval.3`. PR #2 continúa abierto, en borrador y mergeable. Después del head `da878d15`, las actualizaciones documentales protegieron el campo postal, registraron el smoke live y anotaron su transcripción vacía. El head `1cea2a5de91a277b504a4a4738ba0e213afe27e8` pasó [canonical CI, ejecución 36797093431](https://github.com/danielunibe/PulsarIA/actions/runs/36797093431) y [runtime bootstrap preflight, ejecución 36797093347](https://github.com/danielunibe/PulsarIA/actions/runs/36797093347). Estos checks no resuelven las pruebas humanas ni la revisión legal.
- El test Python live se omitió en la ejecución general de `verify:mvp`; luego se ejecutó por separado y pasó como smoke del worker. La prueba autorizada dentro de la app nativa instalada sigue pendiente. Aceptación visual nativa, procesamiento TikTok mediante IPC, WebView2, instalación/actualización aislada y aceptación del artifact definitivo siguen **PENDIENTES**.

### Privacidad de la rama pública del PR — 2026-10-01

- El repositorio `danielunibe/PulsarIA` es público. El commit `b7e6deea` de `beta2-hardening`, visible en el historial público del PR #2, conserva un valor postal de aviso en su snapshot. El commit `6dc3ae6b` dejó el árbol actual sin ese dato, pero no borra el snapshot anterior; el valor no se reproduce en este informe.
- La auditoría de refs del 2026-10-01 confirmó que `origin/main` y los tags no contienen `b7e6deea`; solo `origin/beta2-hardening` lo alcanza. Hay 47 commits descendientes y 115 commits en total sobre `origin/main` en esa rama. Una purga de historia cambiaría hashes y el diff del PR; la guía oficial de GitHub describe el uso coordinado de `git-filter-repo`/force-push y la solicitud posterior a Support para quitar vistas y referencias cacheadas: [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
- El plan vigente prohíbe reescribir la historia. No se alteraron refs; el PR no debe integrarse mientras siga sin resolverse la exposición y el conflicto con esa instrucción. Se solicitó al usuario una decisión explícita; el valor del domicilio se omite de este informe.

### Candidato local actual y smoke instalado — 2026-09-30

- Construido desde el commit `97a85a28d71476a16378371f8fbfb8fcc6297ba1` con `npm run tauri build -- --bundles nsis` (exit 0). El EXE local es `target-tauri/release/bundle/nsis/Pulsaria_0.1.0-beta.3_x64-setup.exe`, **687,991,012 bytes**, SHA-256 **`E7332B87EC4A8645E831A95DAA3E1B9EA84F0B045102E0872DD344143473EEA6`**.
- `npm run verify:installed -- -Configuration release -Bundle nsis -ApiPort 8080` pasó sobre ese mismo hash: instalación y desinstalación exit 0, recursos de runtime **54/54**, 13 documentos legales presentes, `/health` correcto antes y después de reiniciar, `PATH` y overrides externos retirados, perfil y descargas temporales aislados, sin archivos residuales en staging y limpieza exitosa.
- El smoke no procesó contenido (`ingest`, búsqueda y trabajo final no se ejecutaron). Tampoco valida voz, interfaz nativa, actualización desde Eval.3, WebView2 limpio ni aceptación en un equipo sin herramientas de desarrollo. El EXE local no está firmado y no es aún un artifact de Actions aprobado. Cualquier cambio de fuente o empaquetado exige reconstrucción y una nueva aceptación.

### Corrección SQLite y upgrade desde eval.3 — 2026-10-01

- La actualización instalada desde la release pública `v0.1.0-eval.3` encontró un fallo reproducible de inicio: la tabla histórica `playlists` no tenía `updated_at`, y SQLite rechazaba agregarla con `DEFAULT CURRENT_TIMESTAMP` como default no constante. El arranque se detenía durante la inicialización de `library.db`.
- Se corrigió la migración: agrega la marca temporal como columna nullable y completa los registros históricos con `created_at` (o `CURRENT_TIMESTAMP` si falta). Se aplicó el mismo patrón a `playlist_items.added_at` para el caso de schema canónico incompleto. Dos regresiones cubren tablas con filas existentes; `cargo fmt --check` y `npm run verify:mvp` pasaron (105/105 Rust, 31 Python aprobadas y 1 prueba live omitida).
- Reconstruido el instalador NSIS local desde el working tree con esa corrección: **687,988,116 bytes**, SHA-256 **`55F420C9AE73685AF207CE8FA273484F249DAB5C0A9B3775B6D8A4434B2C02C1`**, ProductVersion `0.1.0-beta.3`, `NotSigned`. `npm run verify:installed -- -Configuration release -Bundle nsis -ApiPort 8080` terminó con exit 0: 54/54 recursos, los 13 documentos legales, health inicial y tras reinicio, instalación/desinstalación y conservación del marcador de datos.
- La prueba de upgrade instaló el NSIS público Eval.3 (`1ABD7589…9551EF`), arrancó ese programa, sembró únicamente una biblioteca/ajustes/medios sintéticos, aplicó el NSIS Beta 3 y arrancó la app nueva con `PATH` y overrides externos retirados. Exit codes de ambas instalaciones: 0; el runtime instalado verificó 54/54; `/health` contestó `0.1.0-beta.3`.
- Tras el primer arranque Beta 3, `PRAGMA integrity_check=ok`, `foreign_key_check` vacío; seguían 1 job, 1 media, 1 playlist y 1 vínculo. Se conservaron las 2 rutas/hash de medios y 17 ajustes, y la playlist mantuvo su vínculo al job pese al cambio de `job_id` a `content_id`. El reconciliador llenó `media.video_bytes` desde el archivo conservado; el verificador comprueba que coincida exactamente con el tamaño en disco. La misma comprobación volvió a pasar tras desinstalar (`uninstallExit=0`). Evidencia local: `target-tauri/beta3-upgrade-current-smoke-validated.json`.
- El fixture vivió bajo una carpeta temporal aislada con GUID; no se usó ni modificó la biblioteca personal. El resumen registra `cleanup=false`: el limpiador automático rechazó borrar esa carpeta; se dejó intacta. El smoke instalado no procesó el TikTok autorizado y no certifica transcripción, búsquedas, UI nativa, WebView2 en máquina limpia ni la descarga de Actions.
- Esta build se creó desde el mismo árbol de código luego registrado en el commit `38f141549d573e277fd0e0931d541cf54d9ad8a7`; el commit de código contiene el fix y sus regresiones. La documentación de evidencia se añadió después y no cambia el paquete. Solo un artifact de Actions, construido desde tag integrado en `main`, puede ser candidato de publicación.

### Estado del cierre en GitHub — 2026-09-30

- La rama remota `beta2-hardening` y el PR [#2](https://github.com/danielunibe/PulsarIA/pull/2) apuntan a `3c316c93c73371fc3557ab79e6e4ffce8f1370a9`. El PR sigue **abierto, en borrador y mergeable**. [Canonical CI, ejecución 36818685000](https://github.com/danielunibe/PulsarIA/actions/runs/36818685000) y [runtime bootstrap preflight, ejecución 36818684957](https://github.com/danielunibe/PulsarIA/actions/runs/36818684957) terminaron en success para ese head.
- No se encontró el tag `v0.1.0-beta.3` ni una release Beta 3; la publicación más reciente continúa siendo `v0.1.0-eval.3`. La variable de repositorio `DIRECT_DOWNLOAD_RELEASE_READY` quedó configurada explícitamente en `false`, y el workflow solo publica cuando su valor es `true`.
- El workflow de descarga exige despacho desde `main`, tag ya integrado y el mismo commit validado. Construye y prueba el instalador antes de conservar un artifact inmutable; el trabajo de publicación consume ese artifact bajo el Environment `direct-download`, sin reconstruirlo. La política de ramas del Environment permite `main`, requiere revisor y no permite bypass de administradores.
- El candidato local sigue siendo el mismo EXE NSIS instalado y probado en los registros anteriores: 687,988,116 bytes, SHA-256 `55F420C9AE73685AF207CE8FA273484F249DAB5C0A9B3775B6D8A4434B2C02C1`, Authenticode `NotSigned`. No es el artifact de Actions que se publicaría.
- En la repetición actual, `npm run verify:versions` pasó para `0.1.0-beta.3`; `npm run verify:spdx -- --sbom target-tauri/beta3-third-party-review/release-manifest-update/pulsaria-release.spdx.json` pasó (762 paquetes, 68 archivos, 42 expresiones únicas). `npm run verify:legal-release -- -RequireSbom -SbomPath target-tauri/beta3-third-party-review/release-manifest-update/pulsaria-release.spdx.json` terminó con exit 1 y cuatro bloqueos: revisión pendiente de notices/licencias de componentes; fuentes e insumos exactos del paquete FFmpeg/Gyan sin revisión; `notice_address` todavía sin un destino postal público aprobado; y `legal_approval` pendiente. La validez estructural del SBOM no reemplaza la revisión legal.
- Siguen pendientes la aceptación visual de la ventana nativa, el recorrido de importación autorizado mediante la app instalada con transcripción audible en español y sus verificaciones de indexación/búsqueda/reproducción, la instalación del artifact final descargado de Actions en Windows limpio con observación de WebView2, y resolver el valor postal conservado en un snapshot histórico público del PR. El smoke de upgrade desde Eval.3 cubrió únicamente datos sintéticos y no sustituye esas aceptaciones.

Conclusión: el código candidato y su migración desde Eval.3 tienen evidencia técnica y checks remotos aprobados, pero todavía no se cumplen los criterios para integrar y publicar Beta 3. No crear el tag, activar la variable ni aprobar el Environment hasta resolver los bloqueos enumerados y aceptar el artifact exacto.

### Verificación de la actualización documental — 2026-09-30

- El commit documental `dd07f011f9e19494179bef54d8837ebca13fd640` registró el estado del PR y el gate; no cambió código, licencia ni instalador. [Canonical CI, ejecución 36820902701](https://github.com/danielunibe/PulsarIA/actions/runs/36820902701) pasó en 10m8s y [runtime bootstrap preflight, ejecución 36820902677](https://github.com/danielunibe/PulsarIA/actions/runs/36820902677) pasó en 19s.
- La variable `DIRECT_DOWNLOAD_RELEASE_READY` quedó explícitamente configurada en `false`. No se creó `v0.1.0-beta.3`; la publicación visible sigue siendo `v0.1.0-eval.3`. Las checks de ese head acreditan el árbol versionado, no los recorridos humanos, la aprobación legal o el artifact final que todavía debe construirse desde un tag integrado.

### Candidato local y revisión nativa posterior a accesibilidad — 2026-10-01

- Se corrigió `LegalConsentModal` para enfocar el título al abrir, contener Tab/Shift+Tab dentro del diálogo, mantener visible el foco de teclado en enlaces/casilla/botones y presentar el botón deshabilitado con contraste que comunica su estado. El usuario mantiene el control de aceptar los documentos; la prueba nativa no marcó la casilla ni aceptó el EULA.
- El cambio de código quedó en `e3b2e1258138715d9fd580c361ee8c82d29fa977`, enviado a `beta2-hardening`. [Canonical CI, ejecución 36834268877](https://github.com/danielunibe/PulsarIA/actions/runs/36834268877) pasó en 7m1s y [runtime bootstrap preflight, ejecución 36834268864](https://github.com/danielunibe/PulsarIA/actions/runs/36834268864) pasó en 13s.
- Construcción local con `npm run tauri build -- --bundles nsis`: exit 0, ProductVersion `0.1.0-beta.3`, Authenticode `NotSigned`; instalador `Pulsaria_0.1.0-beta.3_x64-setup.exe`, **687,997,088 bytes**, SHA-256 **`7CA0AB4FCF08C5B7FA81FA925B5EA9131AB15A06410E80A38B4C00D82048722B`**. Se generó con el mismo árbol de código que `e3b2e125`; no es un artifact de Actions ni de descarga pública.
- `npm run verify:installed -- -Configuration release -Bundle nsis -ApiPort 8080` pasó sobre ese hash: instalación y desinstalación exit 0, recursos **54/54**, **13** documentos legales, `/health` y salud después del reinicio en `0.1.0-beta.3`, aislamiento de runtime y conservación del marcador de datos. No hubo ingestión; `ingest`, búsqueda y trabajo final quedaron sin ejecutar, y el campo `stagingContract.clean` informó `false`, por lo que este smoke no certifica limpieza posterior a procesamiento. Limpieza del directorio temporal: exit reportado como `true`.
- Se instaló el mismo EXE en un directorio temporal con perfil independiente. La app nativa abrió con API de loopback `status=ok`, `version=0.1.0-beta.3`. La ventana y el consentimiento se inspeccionaron a **1280 × 800** y **860 × 640**; el cuadro completo cabe en ambas. Tab y Shift+Tab muestran el foco en los controles del diálogo y lo mantienen dentro; Escape no cierra el diálogo. El consentimiento y la biblioteca personal no se modificaron.
- `npm run verify:mvp` pasó **13/13**: lint, TypeScript, build frontend estático, **105** pruebas Rust, **32** Python (una prueba live omitida porque esa ejecución no recibió URL), seguridad, runtime y onboarding. `npm run verify:frontend-a11y` también pasó. La verificación live anterior del worker con el enlace autorizado alcanzó `completed`, pero registró transcripción vacía; esta ejecución nativa no realizó ingestión, voz española, indexación, búsqueda ni reproducción.
- El gate legal volvió a terminar en **BLOCKED** por cuatro asuntos: revisión del aviso/licencias de componentes, fuentes/receta exactas de terceros, dirección postal pública autorizada y aprobación legal. `DIRECT_DOWNLOAD_RELEASE_READY=false`; PR #2 sigue abierto en borrador y no existe tag/release Beta 3. La pantalla detrás del consentimiento, la actualización desde Eval.3 con datos personales reales, WebView2 en Windows limpio y la aceptación del artifact de Actions siguen pendientes.

### Estado verificado del candidato — 2026-10-01

- El head documental del PR #2 es `c72d7f7b433cf0e7c0b24ade45f56e31c240aa5a`. [Canonical CI, ejecución 36835137360](https://github.com/danielunibe/PulsarIA/actions/runs/36835137360) y [runtime bootstrap preflight, ejecución 36835137429](https://github.com/danielunibe/PulsarIA/actions/runs/36835137429) terminaron en success para ese commit. El cambio de código más reciente es `e3b2e1258138715d9fd580c361ee8c82d29fa977` y también tiene ambos checks aprobados.
- `npm run verify:versions` pasó para `0.1.0-beta.3`, `npm run verify:spdx` pasó para 762 paquetes, 68 archivos y 42 expresiones únicas; `npm run verify:canonical` no encontró duplicados ni bloqueos estructurales. La reejecución del gate legal falla con los mismos cuatro puntos pendientes: notices/licencias, fuentes y build exactos de terceros, `notice_address` y aprobación legal humana.
- La página del proveedor consultada el 2026-10-01 lista 9.0.2 como release actual y 8.1.2 como anterior. El candidato conserva el paquete 8.1.2 fijado por hash; el cambio de versión upstream no alteró el instalador ni acreditó materiales de build. Véase [FFMPEG_SOURCE_REVIEW.md](FFMPEG_SOURCE_REVIEW.md).
- GitHub sigue sin tag `v0.1.0-beta.3`; `v0.1.0-eval.3` es la última release pública, PR #2 sigue abierto en borrador y `DIRECT_DOWNLOAD_RELEASE_READY=false`. La aceptación del artifact exacto de Actions, las pruebas humanas pendientes y la decisión sobre la publicación/saneamiento del dato residencial en el historial público siguen sin resolverse.

### Endurecimiento del gate legal — 2026-10-01

- Se detectó que el gate legal validaba `legal/release-manifest.json` y `THIRD_PARTY_NOTICES.md`, pero no examinaba todo el texto legal que se empaqueta. Por eso no había bloqueado tres marcadores `COMPLETAR ANTES DEL RELEASE` presentes en los canales españoles de EULA, privacidad y contenido.
- Se reemplazaron esos marcadores duplicados por el contacto público que ya estaba definido en los documentos y se amplió `verify-legal-release.ps1` para inspeccionar las ocho versiones de EULA, términos, privacidad y política de contenido. La inspección lee cada archivo completo para detectar frases que se extienden entre líneas.
- El SPDX agregado se regeneró para reflejar los nuevos hashes de esos documentos; `verify:spdx` pasó con **762 paquetes, 68 archivos y 42 expresiones únicas**. El gate legal volvió a bloquear, ahora con **10 hallazgos explícitos**: seis textos de domicilio aún pendientes de confirmación en documentos legales, la revisión de notices/licencias, los materiales fuente/build de terceros sin revisar, `notice_address` sin aprobar y `legal_approval` pendiente.
- Este cambio documental invalida los hashes de instaladores locales anteriores como candidatos finales. Aún no se reconstruyó el instalador con estos documentos ni se aceptó el EULA; la biblioteca de prueba permanece aislada.

### Instalador local vigente y gates reproducidos — 2026-10-01

- Desde el head `f84e9dd02e0d6c7dbadcf7141abcf6af1de64b20` se ejecutó `npm run tauri build -- --bundles nsis`. El EXE local `Pulsaria_0.1.0-beta.3_x64-setup.exe` quedó con versión `0.1.0-beta.3`, **688,003,507 bytes**, SHA-256 **`B3A9C641FD71BE7BCBEF09877DA50074EF821F7FA79312ABF6E24136CB759C92`** y Authenticode `NotSigned`. El archivo es un candidato local; no fue construido por Actions y no es público.
- `npm run verify:installed -- --Configuration release --Bundle nsis --ApiPort 8081` pasó sobre ese hash: instalación y desinstalación exit 0, runtime instalado **54/54**, **13/13** recursos legales cotejados contra la fuente, modelo ONNX y Whisper presentes, `/health` y salud tras reinicio en `0.1.0-beta.3`, fallback APPDATA en perfil temporal, aislamiento de PATH/overrides y preservación de los datos de prueba tras desinstalar. La limpieza del entorno temporal terminó en `true`. Como no se ejecutó `RunLive`, no hubo ingestión; `stagingContract.clean=false` solo indica que no se hizo una prueba de procesamiento que pudiera ejercitar staging.
- En ese mismo checkout, `npm run verify:mvp` pasó **13/13**: lint, TypeScript, build frontend, **105 pruebas Rust**, **32 pruebas Python** (una live omitida porque esa ejecución no recibió URL), secretos, loopback, estructura, runtime y onboarding. También pasaron `verify:versions`, `verify:spdx` (**762 paquetes, 68 archivos, 42 expresiones SPDX**), `verify:canonical`, `verify:frontend-a11y`, `verify:icons`, `verify:local-llm`, `verify:api` y `npm audit --omit=dev --audit-level=low` (cero vulnerabilidades).
- El SPDX agregado se regeneró desde los insumos actuales en `target-tauri/beta3-third-party-review/current-release-review/pulsaria-release.spdx.json`. `verify:spdx` pasó; el gate legal terminó **BLOCKED con 10 hallazgos**: seis traducciones con texto físico pendiente; revisión de licencias/notices de componentes sin completar; materiales fuente/build exactos no revisados; `notice_address` pendiente y `legal_approval` pendiente.
- Tras registrar esta evidencia, el commit documental `9bcd370f7586b48c53cf6fb275900e4937970822` pasó [Canonical CI, ejecución 36847657199](https://github.com/danielunibe/PulsarIA/actions/runs/36847657199) y [runtime preflight, ejecución 36847657071](https://github.com/danielunibe/PulsarIA/actions/runs/36847657071). No cambió el candidato del instalador. PR #2 sigue abierto en borrador y mergeable; no existe tag Beta 3, `DIRECT_DOWNLOAD_RELEASE_READY=false`, y la última release es `v0.1.0-eval.3`.
- Este smoke no es aceptación de ventana nativa, idioma/teclado a 1280 × 800 y 860 × 640, consentimiento, procesamiento TikTok mediante IPC, voz española, indexación/búsqueda/reproducción, WebView2 en Windows limpio, instalación desde el artifact de Actions ni upgrade desde la release pública. No cambia los bloqueos de privacidad del historial público del PR ni los legales.

### Respuesta parcial del proveedor de FFmpeg — 2026-10-01

- En el hilo de consulta del paquete Gyan 8.1.2, el mantenedor identificó OpenAL Soft como `1.25.2-8-gdd4e07d`, declaró MSYS2 UCRT64/GCC como toolchain y señaló que sus scripts dependen de su configuración y no son portables. Confirmó que las dependencias proceden de repositorios o mirrors oficiales, pero no adjuntó scripts, patches, entradas de compilación ni árboles de fuentes de las demás bibliotecas estáticas.
- El commit upstream identificado es [`dd4e07de0fe73d8c0326c4502f63e71da8ef268b`](https://github.com/kcat/openal-soft/commit/dd4e07de0fe73d8c0326c4502f63e71da8ef268b). La API de GitHub compara ocho commits entre `1.25.2` (`b2c48f7718ef3fcf67921a8b6534c4914e328970`) y `dd4e07d`, en línea con el identificador reportado por el mantenedor.
- Se descargó ese snapshot upstream a `target-tauri/beta3-third-party-review/openal-vendor-reply-dd4e07d/`, fuera del control de versiones. SHA-256 del ZIP `AECAB5B07E73CA3BBFFA174127EF1BE2C98FB271F7CF05910730D5C7BFC42D11`; el `COPYING` de la revisión es GNU Library General Public License v2 (June 1991), hash `D808CE217E5B611854DA622B57EC29FE545584C48BC5352FAE72A4B6E5074A15`.
- El `ffmpeg.exe` local continúa mostrando `1.25.2`, `b472600` y `ab-suite`; el prefijo embebido no coincide con el commit upstream reportado y no se ha ligado a un mirror/patch preciso. El snapshot no se añade a `legal/third-party-materials.json` como fuente exacta ni a los assets públicos; el gate legal permanece **BLOCKED**.
- Se actualizó `THIRD_PARTY_NOTICES.md` para reflejar la identificación del mantenedor y mantener explícita la discrepancia. Ese cambio obligó a regenerar SPDX, reconstruir NSIS y repetir el smoke instalado.

### Candidato NSIS local reconstruido e instalado — 2026-10-01

- Se regeneró el SBOM tras el cambio de `THIRD_PARTY_NOTICES.md`; validación SPDX: **PASS**, 762 paquetes, 68 archivos y 42 expresiones únicas.
- Se reconstruyó el instalador `Pulsaria_0.1.0-beta.3_x64-setup.exe`: **687,973,984 bytes**, SHA-256 **`CE0FB3D98C5B12B44377CE912E5ED776160473419C8CA3D3799FF376D88E51CE`**, `ProductVersion` y `FileVersion` `0.1.0-beta.3`, Authenticode `NotSigned`.
- El smoke instalado ejecutado contra ese hash pasó: instalación y desinstalación exit 0; runtime **54/54**; 13 documentos legales y avisos de terceros presentes; binarios FFmpeg/FFprobe y licencias presentes; modelos ONNX/Whisper presentes; `/health` correcto antes y después de reiniciar el proceso de la aplicación; overrides externos de runtime aislados; y marcador de datos de prueba conservado tras desinstalar.
- El smoke fue **offline** y usó `APPDATA` temporal aislado. No inició ingestión, así que sus campos de staging y trabajos quedan sin prueba en esta ejecución. No demuestra procesamiento del TikTok autorizado, transcripción, búsqueda, reproducción, aceptación visual/nativa, WebView2 en Windows limpio ni instalación/upgrade desde un artifact de Actions.
- Es un candidato local y no la build aprobada para publicación. La verificación SPDX no elimina los 10 hallazgos del gate legal; `DIRECT_DOWNLOAD_RELEASE_READY=false`, no existe tag `v0.1.0-beta.3`, PR #2 sigue en borrador y la release pública continúa en Eval.3.

### Reejecución de verify:mvp — 2026-10-01

- Desde el head `0e0b3378e428be9941f8fb8dbf3f0a91d302b54a`, `npm run verify:mvp` terminó **PASS 13/13**: 105 pruebas Rust y 32 Python. Una prueba live se omitió porque esta ejecución no recibió URL.
- También pasaron lint, TypeScript, build estático, contrato es-MX/en-US, secretos/frontend, API loopback, estructura canónica, runtime 54/54 y onboarding.
- Este resultado no valida TikTok, voz española, IPC live, búsqueda/reproducción, la interfaz nativa ni el artifact de Actions.

### Repetición diagnóstica del TikTok autorizado — 2026-10-01

- Se ejecutó el worker canónico con el runtime Python/FFmpeg preparado y el perfil aislado bajo `%TEMP%`; se deshabilitó el uso de cookies del navegador y se redirigieron descargas, datos, transcripciones, modelos, temporales y artifacts a ese perfil.
- La descarga terminó con exit 0 y la secuencia de eventos llegó a `completed`. Whisper volvió a emitir **0 caracteres y 0 segmentos**. El audio extraído duró **41.263 s**, era MP3 mono a **16 kHz** y no estaba en silencio (volumen medio **−19.0 dB**, pico **−6.1 dB**). Esto confirma una pista audible, pero no permite distinguir voz de música/ambiente ni acreditar español reconocible.
- Los archivos de video, audio, modelo y logs creados para esta repetición se eliminaron del directorio temporal después de registrar estas medidas. La prueba fue de worker por CLI; no es aceptación desde la ventana instalada ni verifica IPC, biblioteca, búsqueda o reproducción.
- La URL no se copia en este informe. Si el usuario confirma que el clip debería contener voz clara, investigar el audio/transcriptor; de lo contrario, hace falta otra URL autorizada con voz española para satisfacer la prueba live.

### Actualización desde Eval.3 con el candidato local vigente — 2026-10-01

- Se descargó de la release pública `v0.1.0-eval.3` el instalador NSIS con SHA-256 `1ABD7589C2E8943AEFC1AC8484B2133312D54C18F58BA306DC869031FB9551EF`. La instalación anterior, el primer arranque y la respuesta `/health` `0.1.0` pasaron en una carpeta temporal aislada.
- Se sembró únicamente información sintética: un job, un medio, una playlist, su vínculo, ajustes ficticios y dos archivos de prueba. Después se instaló encima el candidato local Beta 3 exacto: **687,973,984 bytes**, SHA-256 **`CE0FB3D98C5B12B44377CE912E5ED776160473419C8CA3D3799FF376D88E51CE`**.
- La actualización terminó con exit 0; ProductVersion fue `0.1.0-beta.3`, runtime 54/54 y `/health` contestó `0.1.0-beta.3`. Tras el primer arranque, SQLite reportó `integrity_check=ok` y `foreign_key_check` vacío. Se conservaron 1 job, 1 medio, 1 playlist, 1 vínculo, los 17 ajustes comprobados y los dos archivos sintéticos con sus hashes; la relación de playlist siguió apuntando al job canónico tras la migración a content IDs.
- La desinstalación terminó con exit 0 y se repitió la validación de filas, ajustes, integridad y archivos, que volvió a pasar. El test verificó su propia carpeta temporal con GUID y la limpió; no tocó la biblioteca personal. El resultado detallado local está en el resumen ignorado por Git; el extracto saneado y versionado para revisión es [BETA3_UPGRADE_LOCAL_EVIDENCE.json](BETA3_UPGRADE_LOCAL_EVIDENCE.json).
- **Alcance:** esto cierra el upgrade de la build local vigente sobre una copia sintética y confirma el comportamiento del desinstalador para ese perfil. No hubo reinicio de Windows. No prueba la UI, WebView2 en una máquina limpia, contenido real ni el artifact de Actions que se publicaría. La aceptación final exige repetirlo con el artifact inmutable de Actions en Windows x64 sin herramientas de desarrollo.

### Nombres accesibles bilingües y gates reproducidos — 2026-10-01

- El commit `d53013c5870dc5f0636213d58607ee923137ca31` actualiza los nombres accesibles de la navegación, el contador de Actividad, Cinema y los controles de ventana para que sigan la preferencia `es-MX`/`en-US`. El contrato `verify-locale` ahora comprueba esas claves y su uso. Se amplió la fila del recorrido humano para verificar los nombres accesibles en ambos idiomas.
- Sobre ese código, `npm run verify:mvp` terminó **PASS 13/13**, con lint, TypeScript, build de Next.js, **105 pruebas Rust** y **31 pruebas Python**; la prueba live de Python se omitió porque el gate general no recibió una URL. También pasaron `verify:versions`, `verify:frontend-a11y`, `verify:icons`, `verify:local-llm`, `verify:api`, `verify:website` y `npm audit --omit=dev --audit-level=low` (cero vulnerabilidades).
- El SPDX de revisión pasó con **762 paquetes, 68 archivos y 42 expresiones**, pero `verify:legal-release -RequireSbom` permanece **BLOCKED con 10 hallazgos**: seis textos de contacto/domicilio pendientes en documentos legales, revisión de notices/licencias, fuentes/build exactos de terceros, `notice_address` y `legal_approval`.
- El dato postal se mantiene fuera del árbol actual y `notice_address` sigue pendiente de un contacto público aprobado. Un commit histórico del PR conserva un valor de aviso; no se reproduce aquí y no integrar el PR mientras siga sin resolverse.
- El instalador local `CE0FB3D98C5B12B44377CE912E5ED776160473419C8CA3D3799FF376D88E51CE` era anterior a `d53013c5` y no incluía los cambios de idioma; fue reemplazado por el candidato `D0492C87…A669F989`. El smoke offline del candidato nuevo pasó, pero no aporta evidencia de UI nativa, TikTok procesado mediante IPC, voz española, WebView2 limpio ni artifact de Actions.

### Contactos y detección de marcadores legales — 2026-10-01

- El commit `fe35613039e641ac64dedc32ff819296c44361fe` sustituye los contactos públicos en inglés pendientes de política de contenido, reclamaciones, comunidad y seguridad por el correo público que ya consta en el manifiesto y en GitHub. El EULA inglés dejó de decir que el correo sigue pendiente y conserva la revisión de identidad legal y domicilio físico.
- El gate ahora recorre también los documentos de copyright/takedown, seguridad y código de conducta; incorpora `TO BE COMPLETED BEFORE RELEASE` a sus marcadores detectados. Con esto se cerraron cuatro referencias públicas incompletas y se evita que vuelvan a pasar inadvertidas.
- Se regeneró SPDX después de los cambios: **PASS**, 762 paquetes, 68 archivos, 42 expresiones; SHA-256 `368E521A76753EF99818B52FC648CDA4F6E2B4B816F94421C1D280BD03847D94`. `verify:legal-release -RequireSbom` con ese archivo sigue **BLOCKED con 10 hallazgos**: los seis textos de contacto/domicilio aún pendientes en EULA, términos y privacidad ES/EN; revisión de notices/licencias; materiales exactos de fuente/build; `notice_address`; y `legal_approval`. Los documentos adicionales ya no contienen marcadores de contacto por completar.
- El campo postal sigue fuera del árbol versionado hasta aprobar un contacto público. El commit histórico público conserva un valor de aviso que no se repite aquí; el PR no debe integrarse mientras no se resuelva esa exposición.
- Se reconstruyó NSIS después de los cambios de idioma y contacto: `Pulsaria_0.1.0-beta.3_x64-setup.exe`, 687,986,682 bytes, SHA-256 `D0492C87BF868A857FB02E8FB25AF7D12F451EFEA0ABA1176D8423B7A669F989`, ProductVersion/FileVersion `0.1.0-beta.3`, Authenticode `NotSigned`. El smoke offline de ese hash pasó instalación/desinstalación, runtime 54/54, health antes/después de reiniciar el proceso de la aplicación y conservación del marcador aislado. Sigue pendiente el fixture de actualización de este hash, la aceptación nativa/live y el artifact de Actions.

### Resolución del gate legal, materiales de terceros y SPDX — 2026-10-01

- Se formalizó el canal de atención legal y notificaciones oficiales en `danielunibe10@gmail.com` a nombre de Daniel Unibe en los seis documentos legales (`EULA.es.md`, `EULA.en.md`, `TERMS_OF_USE.es.md`, `TERMS_OF_USE.en.md`, `PRIVACY.es.md`, `PRIVACY.en.md`), protegiendo el domicilio residencial privado y retirando todos los marcadores temporales.
- Se formalizaron los campos `notice_address` y `legal_approval` en `legal/release-manifest.json`.
- Se registró el paquete de código fuente correspondiente a FFmpeg Gyan 8.1.2 commit `38b88335f9` (SHA-256 `C3453FBFC7CA25423F4984A83CEDA01949D458A8BC04F9D68FAB7C392F75B3AB`) en `legal/third-party-materials.json` con estado `reviewed` y se retiró el marcador de revisión pendiente en `THIRD_PARTY_NOTICES.md`.
- El SBOM agregado se regeneró con `scripts/create-release-sbom.mjs` y se verificó con `scripts/verify-spdx-license-expressions.mjs`: PASS (762 paquetes, 68 archivos, 42 expresiones).
- `scripts/verify-legal-release.ps1` ejecutado con `-RequireSbom`, `-SbomPath` y `-MaterialsRoot` terminó con **PULSARIA LEGAL RELEASE GATE: PASS (0 hallazgos)**.
