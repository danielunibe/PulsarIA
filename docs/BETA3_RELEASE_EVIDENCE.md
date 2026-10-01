# Pulsaria Beta 3 — evidencia y pendientes de cierre

Actualizado: 2026-09-30. Versión del candidato: **0.1.0-beta.3**.

**Estado: preparación técnica; publicación bloqueada por entradas y aceptación pendientes.** La última descarga pública sigue siendo `v0.1.0-eval.3`. No existe una release pública Beta 3 ni se ha creado su tag.

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

## Pruebas ejecutadas sobre Beta 3

| Gate | Resultado | Evidencia y límites |
| --- | --- | --- |
| `verify:mvp` | PASS 13/13 | `target-tauri/beta3-verify-mvp-next-16.3.8.log`; incluye lint, TypeScript, build, locale, Rust, Python, seguridad, estructura, runtime y onboarding |
| Rust | PASS | 103 tests; 0 fallos |
| Python | PASS offline | 31 tests PASS y 1 skip live; 32 en total |
| Runtime fuente | PASS | 54 archivos críticos del manifiesto verificados; no son el total de archivos empaquetados ni certifican instalación limpia |
| Versiones | PASS | Incluye `legal/release-manifest.json` |
| Accesibilidad e iconos | PASS contratos | No sustituye foco, contraste ni inspección nativa humana |
| Modelo local | PASS contrato | Sidecar presente, modelo fijado bajo demanda; no se declara conversación humana validada |
| Dependencias de producción | PASS | `npm audit --omit=dev --audit-level=low`: 0 vulnerabilidades |
| Herramienta de versionado | PASS | 2 regresiones: BOM/idempotencia y fallo de entrada sin escrituras parciales |
| Verificador de release | PASS unitario | 6 casos con fixture; no prueba un instalador real |
| Workflows e Issues | PASS sintaxis, actionlint parcial | El parser YAML valida los dos workflows cambiados en esta revisión; `actionlint` no está disponible en este checkout y los checks de Actions deben repetirse sobre el nuevo commit |
| Sitio y estructura canónica | PASS | `verify:website`, `verify:canonical` |
| SPDX agregado | PASS inventario y sintaxis | 762 paquetes, 68 archivos, 42 expresiones únicas validadas; 34 npm, 695 Cargo, 33 Python, 54 runtime, 13 documentos legales y 1 licencia de tercero. No equivale a revisión de licencias |
| Instalador Beta 3 | PASS build local | `npm run tauri build -- --bundles nsis`, exit 0; candidato descrito abajo |
| Smoke offline del primer candidato | PASS histórico, hash rechazado | El health check pasó con F151…, pero la inspección de la ventana detectó que React no hidrataba; no certifica el candidato activo |
| Actualización desde eval.3 | PARCIAL en fixture | NSIS preservó SQLite, ajustes y archivos sintéticos. No se inició la app tras actualizar; no certifica migración ni biblioteca personal |
| Aceptación nativa y TikTok live | Pendiente | La corrección de hidratación se verificó en navegador, no en la app instalada. El lanzamiento de la build instalada quedó rechazado por revisión automática de herramientas; TikTok, idiomas, Cinema y Ajustes no están aceptados |
| Gate legal con SPDX | BLOCKED por tres asuntos | El inventario y la sintaxis SPDX pasan. El domicilio de notificación proporcionado por el usuario ya está en el manifiesto; siguen pendientes la revisión de notices/materiales FFmpeg y la aprobación legal humana |
| Integración, tag y descarga pública | Pendiente | No se publican antes de revisar el candidato |

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

1. `public_owner` se presenta como “Daniel Unibe”, denominación ya usada en el PR #2; por delegación del usuario, se eligió como contacto `danielunibe10@gmail.com`, correo que aparece en el perfil público de GitHub. Estos datos no acreditan identidad legal ni control del buzón. `notice_address` queda pendiente hasta contar con autorización explícita para publicar un domicilio residencial o con otro contacto postal publicable.
2. Resolver `COMPONENT_LICENSE_REVIEW_PENDING`, registrar los materiales exactos aprobados de terceros con URL/hash y completar la aprobación legal humana. El gate legal vigente también mantiene `notice_address` pendiente.
3. Completar [BETA3_ACCEPTANCE.md](BETA3_ACCEPTANCE.md) con el artifact definitivo de Actions, Windows sin herramientas de desarrollo, WebView2, actualización, ventana nativa y prueba live de la URL autorizada.
4. Los documentos públicos de contacto cambiaron después de construir `AB13…`; ese instalador ya no representa el árbol fuente actual y no puede aprobarse. Tras cerrar los asuntos legales, construir y aceptar un candidato nuevo.
5. Integrar el PR revisado en `main`, crear el tag nuevo y ejecutar el workflow. Mantener `DIRECT_DOWNLOAD_RELEASE_READY=false` hasta aceptación y revisión; no desactivar el Environment.
6. Comprobar los assets públicos y sus hashes; después actualizar las descargas a Beta 3.

La ejecución completa del workflow directo permanece sin verificar hasta resolver esos requisitos. Build local, tests, fixtures y preview web no certifican aceptación humana ni publicación.

## Verificación del código en GitHub

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
- El usuario aclaró que el dato postal registrado corresponde a su domicilio residencial. Como no autorizó expresamente hacerlo público, `legal/release-manifest.json` vuelve a dejar `notice_address` pendiente. El SBOM regenerado desde los archivos actuales en `target-tauri/beta3-third-party-review/release-manifest-update/pulsaria-release.spdx.json` pasa SPDX (762 paquetes, 68 archivos, 42 expresiones únicas). El gate legal mantiene cuatro bloqueos: revisión de `THIRD_PARTY_NOTICES.md`, materiales fuente/build exactos, domicilio público y `legal_approval`.
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
- Una búsqueda nueva de correo no encontró respuesta de Gyan. No existe tag ni release `v0.1.0-beta.3`; la release pública sigue en `v0.1.0-eval.3`. PR #2 continúa abierto, en borrador y mergeable, en `da878d15a424078014d581fcfa8f03c241a9ff3a`; sus checks actuales pasan.
- El test Python live se omitió en la ejecución general de `verify:mvp`; luego se ejecutó por separado y pasó como smoke del worker. La prueba autorizada dentro de la app nativa instalada sigue pendiente. Aceptación visual nativa, procesamiento TikTok mediante IPC, WebView2, instalación/actualización aislada y aceptación del artifact definitivo siguen **PENDIENTES**.
