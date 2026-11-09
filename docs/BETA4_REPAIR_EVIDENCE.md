# Beta 4 — reparación y evidencia local del 2026-10-12

## Alcance y autoridad

Trabajo en `C:\Users\danie\Desktop\Pulsaria`, rama existente
`codex/pulsaria-beta4-prep`, sobre HEAD
`d743d1d5d06f1f43fc49eb0f3c672149b9ce5d91`. Se preservaron la preparación
de Beta 4 y los movimientos de documentación que ya estaban en el árbol y el
índice. `PROJECT_TRUTH.md` sigue siendo la autoridad normativa. Los cambios
son locales y sin integrar; la CI del commit base no los certifica.

## Fallas corregidas

| Falla | Corrección y evidencia |
| --- | --- |
| El build admitía contacto pendiente, pero staging exigía aprobación pública | Staging usa `-CandidateOnly` con SBOM/materiales; el gate público permanece en el job protegido. La fixture candidata se conserva sin cambiar `pending` |
| El lector de contacto rechazaba JSON con BOM de Windows | Elimina el BOM UTF-8 inicial. CLI con BOM: candidato PASS, publicación BLOCKED |
| El smoke elegía el instalador más reciente, incluso de otra versión | Exige versión exacta y admite `-InstallerPath` / `-ExpectedSha256`. Rechaza versión antigua, hash distinto y candidato ausente |
| Una carpeta temporal no aislaba el registro ni accesos de NSIS | Rechaza una instalación registrada antes de instalar. Comprobado con fixtures y con la detección real de Beta 3, sin ejecutar un instalador |
| El bootstrap borraba la carpeta de Eval.3 sin desinstalar | Desinstala exclusivamente el bootstrap propio y espera el proceso real con `_?=` antes de limpiar; un fallo bloquea y conserva la carpeta. Casos de éxito y fallo con operaciones nativas simuladas |
| El PowerShell anidado no exponía `Get-FileHash` | SHA-256 compartido con .NET y lectura por stream. Vector conocido y suites en Windows PowerShell y PowerShell 7 PASS |
| El runbook exigía aceptar el instalador antes de construirlo | Construcción y conservación del candidato antes de aceptar el hash; publicación protegida después |

Las regresiones se incorporaron a la CI fuente y al gate 10 de `verify:mvp`.
La espera del proceso y su código de salida sigue el
[contrato de desinstalación NSIS](https://nsis.sourceforge.io/Docs/Chapter3.html#3.2.2).
Las suites de PowerShell se repitieron después de ese ajuste.
Las fixtures no acreditan instalación, revisión legal ni aceptación humana.
Una candidata con contacto pendiente sirve para ensayo y revisión; la fuente
del candidato final publicable debe registrar la revisión del contacto.
Cualquier cambio de fuente o bytes exige reconstrucción y nueva aceptación.

## Verificaciones ejecutadas

| Verificación | Resultado local |
| --- | --- |
| `npm ci` | PASS; dependencias del lockfile restauradas |
| `npm run verify:mvp` | **PASS 13/13**, salida 0 en la repetición final |
| Rust | 276 pruebas generales y dos de inferencia real PASS; seis casos ignorados según sus contratos |
| Python | 31 PASS y una live omitida por falta de URL |
| Herramientas de release | 17 casos Node y 23 PowerShell PASS, incluidos en el MVP |
| Contrato de versión | PASS `0.1.0-beta.4` en los nueve registros comprobados |
| Estructura canónica / runtime de fuente | PASS, cero copias de workers y 54/54 archivos/hashes |
| Accesibilidad, iconos, idiomas, onboarding, API y secretos | PASS en sus contratos automatizados |
| IA local | Manifiesto/sidecar PASS; inferencia real y cambio de modelo ejecutados |
| `npm audit --omit=dev --audit-level=low` | Cero vulnerabilidades de producción |
| SPDX agregado | PASS: 762 paquetes, 68 archivos, 42 expresiones únicas |
| Materiales candidatos con `-RequireSbom` | PASS; archivo fuente de FFmpeg descargado y hash fijado comprobado |
| Gate público de contacto | **BLOCKED**, por `public_contact_review_status=pending` |

Logs y SBOM local bajo `target-tauri/`, ignorado por Git:
`beta4-mvp-final.log`, `beta4-cargo-check.log`,
`beta4-candidate-materials.log`, `beta4-public-contact.log` y
`beta4-release.spdx.json`. La primera repetición del MVP identificó la falla
de hashing y no cuenta como PASS; la ejecución final sí completó los 13 gates.

## Candidato NSIS local

`npm run tauri build -- --bundles nsis` terminó con salida 0 y generó:

| Dato | Valor local |
| --- | --- |
| Instalador | `Pulsaria_0.1.0-beta.4_x64-setup.exe` |
| Ruta | `target-tauri/release/bundle/nsis/Pulsaria_0.1.0-beta.4_x64-setup.exe` |
| Tamaño | 692,197,765 bytes |
| SHA-256 | `01C0A3282D4447B03D75A1E82EAA627FFAFB48F181F8D4352353E752A83607A6` |
| Authenticode | `NotSigned`, conforme a la distribución beta gratuita |
| Versión de archivo/producto del ejecutable | `0.1.0-beta.4` / `0.1.0-beta.4` |
| SHA-256 del ejecutable Release | `9425A3DA76D5608C1998A2268FB073E556D452CC9122DC9399AAF37EFB8CA7A0` |
| Host de comprobación | Windows 11 Pro x64 `10.0.26300`, con herramientas de desarrollo; no es Windows limpio |
| Procedencia | Árbol local con cambios sin integrar; no existe run/artifact ID de Actions para este archivo |

La identidad completa está en `target-tauri/beta4-local-artifact.json`; el
registro de hashes de 282 insumos fuente está en
`target-tauri/beta4-source-inputs.json`. El build está documentado en
`target-tauri/beta4-nsis-build.log`.

El ejecutable Release pasó un smoke de arranque y reinicio con un perfil
temporal nuevo: `/health`
reportó `0.1.0-beta.4` en ambos arranques, la API de jobs sin credenciales
respondió 401 y SQLite reportó integridad `ok`, cero violaciones de claves
foráneas y cero jobs. Los recursos copiados junto al ejecutable pasaron 54/54
hashes. El registro privado es `target-tauri/beta4-native-smoke.json`.

Esta prueba ejecuta el binario local y no certifica instalación, desinstalación,
aceptación visual ni procesamiento live. El perfil sintético quedó conservado
para inspección y los dos procesos propios de Pulsaria se cerraron. No se
ejecutó el smoke de instalación sobre la instalación personal de Beta 3.

## Gates pendientes

| Gate | Evidencia necesaria |
| --- | --- |
| Fuente integrada y CI de Beta 4 | Integración revisada y CI sobre el commit final |
| Artifact de Actions | Tag integrado en `main`, run ID, artifact ID y hash exacto |
| Windows x64 limpio | Instalación nueva, actualización sintética desde Eval.3 y desinstalación del mismo hash |
| Aceptación humana nativa | Recorrido y teclado a 1280×800 y 860×640, biblioteca, búsqueda, Cinema y exportaciones |
| TikTok desde UI/IPC | URL autorizada con voz española y transcripción reconocible en la app instalada |
| Contacto y materiales del instalador final | Revisión externa del contacto y aceptación de los materiales del artifact exacto |
| Publicación | Gates anteriores y aprobación del Environment `direct-download` |

La lectura de GitHub del 2026-10-12 confirmó `main` en `d743d1d5`,
`DIRECT_DOWNLOAD_RELEASE_READY=false` y la descarga publicada
[Eval.3](https://github.com/danielunibe/PulsarIA/releases/tag/v0.1.0-eval.3).
No se creó un tag, no se despachó un workflow ni se cambió una aprobación.
La instalación registrada de Beta 3 y la biblioteca personal de AppData se
preservaron. El checklist final sigue en
[BETA4_ACCEPTANCE.md](./BETA4_ACCEPTANCE.md).
