# Pulsaria Beta 3 — evidencia y pendientes de cierre

Fecha: 2026-09-29. Versión del candidato: **0.1.0-beta.3**.

**Estado: preparación técnica; publicación bloqueada por entradas y aceptación pendientes.** La última descarga pública sigue siendo `v0.1.0-eval.3`. No existe una release pública Beta 3 ni se ha creado su tag.

## Fuente y cambios

Checkout: `C:\Users\danie\Desktop\Pulsaria`, rama temporal `beta2-hardening`, PR [#2](https://github.com/danielunibe/PulsarIA/pull/2). Se incorporó por fast-forward `1bb338992381fe5825924d53e93128a30a92fd92`; se preservó `scratch/` y no se borraron ramas ni bibliotecas. `main` mantiene la autoridad.

- Versionado Beta 3 sincronizado en npm, Cargo, Tauri y manifiestos. El versionador tolera BOM, valida todas sus entradas antes de escribir, preserva formato y admite ejecuciones repetidas. El contrato incluye ahora el manifiesto legal.
- Marcador activo `beta3-canonical` en frontend y launcher; referencias Beta 2 históricas conservadas.
- Workflow directo dividido en `build` y `publish`. El build conserva un artifact identificado por ID; publicación descarga ese ID, valida procedencia/hashes y no reconstruye el instalador. La aprobación del Environment permanece activa.
- Paquete con SPDX final, notices, licencia, materiales de terceros revisados, procedencia y hashes de todos los assets. El SPDX se regenera tras construir para reflejar el manifiesto runtime final.
- El SPDX identifica la licencia propia con `LicenseRef-Pulsaria-Source-Visible-Beta` y el texto exacto de `LICENSE`; esto no marca revisados ni compatibles los componentes.
- Verificador con rechazo de hash alterado, commit/run distinto, archivos inesperados, enlaces/directorios y nombres con rutas. El modo `AssetsOnly` permite comprobar el paquete transferido sin fabricar un runtime en el runner de publicación.
- Plantillas de Issues, notas de release y recorrido de aceptación añadidos. El README y el sitio mantienen la descarga pública existente hasta verificar Beta 3.
- El script instalado rechaza explícitamente `RunLive`, cuya autenticación era inválida; el smoke offline sigue vigente y la aceptación live usa la interfaz nativa autenticada.
- Corregido el SHA-256 obsoleto de eval.3 en la guía de instalación.

## Pruebas ejecutadas sobre Beta 3

| Gate | Resultado | Evidencia y límites |
| --- | --- | --- |
| `verify:mvp` | PASS 13/13 | `target-tauri/beta3-verify-mvp.log`; incluye lint, TypeScript, build, locale, Rust, Python, seguridad, estructura, runtime y onboarding |
| Rust | PASS | 103 tests; 0 fallos |
| Python | PASS offline | 31 tests PASS y 1 skip live; 32 en total |
| Runtime fuente | PASS | 54 archivos críticos del manifiesto verificados; no son el total de archivos empaquetados ni certifican instalación limpia |
| Versiones | PASS | Incluye `legal/release-manifest.json` |
| Accesibilidad e iconos | PASS contratos | No sustituye foco, contraste ni inspección nativa humana |
| Modelo local | PASS contrato | Sidecar presente, modelo fijado bajo demanda; no se declara conversación humana validada |
| Dependencias de producción | PASS | `npm audit --omit=dev --audit-level=low`: 0 vulnerabilidades |
| Herramienta de versionado | PASS | 2 regresiones: BOM/idempotencia y fallo de entrada sin escrituras parciales |
| Verificador de release | PASS unitario | 6 casos con fixture; no prueba un instalador real |
| Workflows e Issues | PASS estático | YAML parseado; actionlint 1.7.12 validó los tres workflows modificados |
| Sitio y estructura canónica | PASS | `verify:website`, `verify:canonical` |
| SPDX agregado | PASS inventario | 34 npm, 695 Cargo, 33 Python, 54 runtime, 13 documentos legales y 1 licencia de tercero; no equivale a revisión de todas las licencias |
| Instalador Beta 3 | PASS build local | `npm run tauri build -- --bundles nsis`, exit 0; candidato descrito abajo |
| Smoke instalado Beta 3 | PASS offline local | Instalación/desinstalación exit 0, health inicial y tras reinicio `ok` / `0.1.0-beta.3`, recursos y documentos verificados, marker preservado y cleanup PASS; no incluye live, upgrade ni inspección visual |
| Actualización desde eval.3 | Pendiente humano | Ejecutar en copia de biblioteca de prueba; el marker de desinstalación no certifica una actualización completa |
| Aceptación nativa y TikTok live | BLOCKED por candidato anterior | El 2026-09-30 se obtuvo acceso a inspección nativa y URL autorizada; se detectó falta de hidratación. Repetir con instalador corregido, según el hallazgo posterior |
| Gate legal con SPDX | BLOCKED | Ver `target-tauri/beta3-legal-spdx.log` y pendientes debajo |
| Integración, tag y descarga pública | Pendiente | No se publican antes de revisar el candidato |

## Materiales FFmpeg reunidos

El script NSIS generado enumera 6,463 archivos de recursos (1,017,958,078 bytes antes de compresión), además del ejecutable principal y WebView2. Este conteo describe el paquete; el gate de 54 archivos críticos y el SPDX de paquetes no se presentan como un hash individual de cada uno de esos 6,463 archivos.

Se consultó nuevamente la [release Gyan 8.1.2](https://github.com/GyanD/codexffmpeg/releases/tag/8.1.2): identifica el commit FFmpeg `38b88335f99e76ed89ff3c93f877fdefce736c13`; sus seis assets enumerados son paquetes binarios. Se descargó la fuente FFmpeg de ese commit para revisión, sin presentarla como fuente completa del build con bibliotecas externas.

- Fuente: `https://codeload.github.com/FFmpeg/FFmpeg/zip/38b88335f99e76ed89ff3c93f877fdefce736c13`.
- Archivo local: `target-tauri/beta3-third-party-review/ffmpeg-upstream-source.zip`.
- Tamaño: 23,101,976 bytes.
- SHA-256: `C3453FBFC7CA25423F4984A83CEDA01949D458A8BC04F9D68FAB7C392F75B3AB`.
- Se conservan `ffmpeg-buildconf.txt`, `ffprobe-version.txt` y `source-evidence.json` en esa carpeta generada.

**PARTIAL:** faltan acreditar fuentes exactas de bibliotecas externas, entradas/configuración de compilación y revisión de suficiencia. El binario se mantiene; no se modificó la licencia de Pulsaria. `legal/third-party-materials.json` permanece `pending`, sin assets aprobados. La [documentación de FFmpeg](https://ffmpeg.org/legal.html) sirve como referencia del proveedor, no como aprobación de este paquete. El inventario de 70 componentes anterior sigue en `FFMPEG_GYAN_8.1.2_INVENTARIO.md`.

## Pendientes que impiden declarar el lanzamiento cerrado

1. `public_owner`, `legal_contact_email`, `notice_address` y `legal_approval` siguen pendientes. La delegación de presentación profesional no acredita identidad/titularidad, disponibilidad de un buzón o autorización de domicilio.
2. Resolver `COMPONENT_LICENSE_REVIEW_PENDING` y registrar los materiales exactos aprobados de terceros con URL/hash. El gate legal detecta seis bloqueos, incluidos materiales y los cuatro campos.
3. Completar [BETA3_ACCEPTANCE.md](BETA3_ACCEPTANCE.md) con el candidato definitivo descargado de Actions, Windows sin herramientas de desarrollo, WebView2, actualización, ventana nativa y URL TikTok autorizada con voz.
4. Integrar el PR revisado en `main`, crear el tag nuevo y ejecutar el workflow. Los checks del código preparado ya pasaron, según el registro debajo. Mantener `DIRECT_DOWNLOAD_RELEASE_READY=false` hasta aceptación y revisión; no desactivar el Environment.
5. Comprobar los assets públicos y sus hashes; después actualizar las descargas a Beta 3.

La ejecución completa del workflow directo permanece sin verificar hasta resolver esos requisitos. Build local, tests, fixtures y preview web no certifican aceptación humana ni publicación.

## Verificación del código en GitHub

El commit `501bbb29d8337e070109d58a3525bfb1f7f04360` contiene la preparación técnica Beta 3. Ambos checks terminaron correctamente el 29 de septiembre de 2026:

- [Canonical CI, ejecución 36642176395](https://github.com/danielunibe/PulsarIA/actions/runs/36642176395): `success`, finalizada a las 23:01:58 UTC.
- [Pinned runtime bootstrap preflight, ejecución 36642176398](https://github.com/danielunibe/PulsarIA/actions/runs/36642176398): `success`, finalizada a las 23:08:09 UTC.

Estos resultados corresponden al código del candidato y no a la publicación directa ni a una aceptación humana. El PR #2 continúa en borrador mientras se resuelven los pendientes descritos arriba.

## Candidato NSIS local construido

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

El usuario proporcionó y autorizó para la prueba la URL `https://www.tiktok.com/@liminalhabitats/video/7683192090443992353`. El requisito de recibir una URL está resuelto; descarga, contenido hablado, transcripción, búsqueda y exportación aún requieren ejecución y evidencia.
