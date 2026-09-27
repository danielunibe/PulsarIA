# Auditoría integral y ruta de publicación gratuita

**Actualizado:** 2026-09-27  
**Autoridad del proyecto:** [PROJECT_TRUTH.md](../PROJECT_TRUTH.md)  
**Alcance:** preparar Pulsaria para que una persona pueda descargar gratis el instalador vigente desde GitHub Releases.

## Estado ejecutivo

El repositorio [danielunibe/PulsarIA](https://github.com/danielunibe/PulsarIA) es público y ya ofrece la prerelease `v0.1.0-eval.3`, sin costo de descarga. Esa release es del 2026-09-14 y no contiene el código Beta 2 validado en este checkout. La página de descargas del sitio ahora apunta a esa release y sus dos instaladores verificados. El candidato Beta 2 está en el PR borrador [#2](https://github.com/danielunibe/PulsarIA/pull/2), todavía sin merge ni release. El instalador NSIS reconstruido desde `08ecdf5` pasó el smoke aislado, pero aún no se ha publicado.

El objetivo final sigue **PARTIAL**. La rama candidata ya está en GitHub; el CI de los commits de código `6a56f43` y `08ecdf5` pasó. Para publicar un instalador actual faltan la revisión/merge del PR, los datos y la aprobación legal, la verificación final de atribuciones y una release desde un commit validado. Antes del merge se debe confirmar que el CI esté verde en el head final del PR. El MSI falla con versiones prerelease alfanuméricas; el flujo de GitHub se ajustó para generar NSIS en prereleases y conservar MSI para versiones estables.

“Descarga gratis” describe el precio de descarga. La licencia del código es **Pulsaria Source-Visible Beta License**, no una licencia open source aprobada por OSI.

## Autoridad y preservación

- Checkout inspeccionado: `C:\Users\danie\Desktop\Pulsaria`.
- Rama de trabajo: `beta2-hardening`; commit de código, runtime y artefacto evaluado: `08ecdf5570002f7739907d7678313dc0995cc1a6`.
- El árbol ya tenía cambios extensos y archivos nuevos antes de esta fase. Se trabajó sobre ese mismo estado; no se ejecutaron reset, clean ni stash.
- El código de actividad, errores de API local y playlists se modificó en esta fase. El instalador smoke crea y borra exclusivamente directorios de prueba dentro de `%TEMP%` y confirma que el marcador de datos sobrevive a la desinstalación.

## Fases y evidencia

| Fase | Estado | Evidencia actual | Cierre requerido |
| --- | --- | --- | --- |
| 0. Preservar y fijar autoridad | **PASS local** | Rama, HEAD y cambios locales revisados; checkout canónico conservado. El PR borrador #2 contiene la rama; `scratch/` sigue sin seguimiento y quedó fuera del commit. | Revisión y merge del PR antes de tag/release. |
| 1. Integridad de código y MVP | **PASS local / CI parcial** | `npm run verify:mvp`: 13/13 en la validación local inicial; tras el arreglo de imports, Python: 31 PASS + 1 omitida; CI de los commits de código `6a56f43` y `08ecdf5` pasó. Runtime manifest fuente: 54/54. | Confirmar checks verdes en el head final del PR y conservar logs. |
| 2. Reparación de actividad y playlists | **PASS automatizado** | Centro de actividad conectado a trabajos persistidos; carga/error/reintento explícitos; sin ceros falsos cuando falla el motor; mensajes REST 401/403 explican que la biblioteca requiere la app de escritorio; lint, TypeScript y `verify:mvp` pasan. | Revisión visual real en Tauri a 1280×800 y 860×640. |
| 3. Calidad complementaria | **PASS local** | `verify:frontend-a11y`, `verify:versions` (0.1.0-beta.2), `verify:icons`, `verify:local-llm`; `npm audit --omit=dev --audit-level=low`: 0 vulnerabilidades. | Añadir estos gates al candidato público y conservar logs. |
| 4. Instalador Windows actual | **PASS NSIS / MSI bloqueado por versión** | NSIS Beta 2: 687,830,129 bytes; SHA-256 `1EB95639A5470DA254B2D9F693AADCC9CE7D372D69B0CCCA3450C9E5480B56B9`. Smoke aislado: instalación/desinstalación 0, primer arranque/reinicio health OK, runtime 54/54, fallback `%APPDATA%`, `PATH` y overrides externos vacíos, marcador de datos preservado y limpieza temporal: PASS. Authenticode: sin firma. | Reproducir en Actions desde el commit final; MSI solo para versión estable. |
| 5. Pipeline live de contenido | **PENDIENTE** | Las 32 pruebas Python pasan; el caso TikTok live se omite porque no se suministró URL autorizada. El smoke del instalador actual fue offline; no prueba ingestión live. | Ejecutar con URL autorizada y harness nativo que entregue el token de proceso; comprobar ingestión, duplicado, outputs, búsqueda y reinicio. |
| 6. Legal, dependencias y atribuciones | **BLOCKED_EXTERNAL** | `npm run verify:legal-release` falla por una entrada de tercero no verificada y los campos placeholder `public_owner`, `legal_contact_email`, `notice_address`, `legal_approval`. | Verificar inventario completo/SBOM y modelos/notices; titular aporta contacto y domicilio para avisos; revisión y aprobación humana de los textos. No rellenar esos campos por inferencia. |
| 7. Publicar la versión validada en GitHub | **PENDIENTE** | Release remota más reciente: [`v0.1.0-eval.3`](https://github.com/danielunibe/PulsarIA/releases/tag/v0.1.0-eval.3), prerelease pública del 2026-09-14. `website/downloads.html` y `README.md` ahora enlazan NSIS/MSI de `eval.3` y sus SHA-256 publicados por GitHub; se retiraron el hash `eval.2` y el SHA de main obsoleto. `npm run verify:website`: PASS, enlaces/hashes cotejados con la API de GitHub: PASS. El PR #2 contiene la Beta 2, pero aún no hay nueva release para este árbol. | Merge del PR tras revisar CI y gates legales; generar tag desde el commit validado, ejecutar la build limpia y adjuntar instalador actual, hashes y notas; confirmar descarga pública desde Releases y que el sitio publicado use esos enlaces. |
| 8. Cierre estable y actualización automática | **BLOCKED_EXTERNAL / opcional para descarga directa** | Firma Authenticode, clave Tauri updater, runtime externo reproducible y variable protegida `RELEASE_READY` no están configurados. | Para release estable con actualización: credenciales/runtime de GitHub Environment, firma y gate de artefactos. Una descarga directa gratis no requiere auto-updater, pero sí comunicar que el instalador no está firmado si se distribuye así. |

## Hallazgo del empaquetado y corrección

`npm run tauri build` compiló el ejecutable y generó NSIS, pero el target MSI devolvió:

> `optional pre-release identifier in app version must be numeric-only and cannot be greater than 65535 for msi target`

El primer smoke de NSIS reveló que el manifiesto no coincidía con `python-workers/prepare_whisper_model.py`: tamaño y SHA-256 seguían apuntando a la versión anterior. Se regeneró `src-tauri/resources/runtime-manifest.json` con el generador canónico, pasó la gate fuente e instalado (54/54), y se reconstruyó el instalador. El artefacto de `08ecdf5` pasó `npm run verify:installed -- -Configuration release -Bundle nsis` en perfil temporal. Se corrigió `.github/workflows/release.yml` para construir y firmar solo NSIS en cualquier prerelease; las versiones estables siguen generando NSIS y MSI. `scripts/verify-release-artifacts.ps1` admite `-AllowPrerelease`, comprueba que `latest.json` tenga versión prerelease y hace Authenticode sobre los artefactos presentes. Verificar que los checks requeridos permanezcan verdes en el head final antes del merge.

## Reconciliar la página pública de descargas

`website/downloads.html` apuntaba a `v0.1.0-eval.2`, aunque la release pública más reciente era `v0.1.0-eval.3`. La API de GitHub confirma que `eval.3` publica NSIS y MSI. Se actualizaron ambos enlaces y hashes con los digests SHA-256 de sus assets, y `npm run verify:website` pasó. Beta 2 no se enlaza desde la página hasta que exista una release validada.

El README ya enlazaba a `eval.3`, pero conservaba el SHA-256 de `eval.2` y presentaba `f6f046fa` como punta publicada de `main`. Se corrigieron los dos hashes de los assets, se añadió el enlace MSI y se distinguió explícitamente la descarga pública `eval.3` del candidato Beta 2 aún no publicado. Los enlaces y digests se cotejaron con la API de GitHub.

## Bloqueos concretos para pedir al titular

1. Confirmar quién posee los derechos de Pulsaria: persona física o entidad; usar el nombre legal exacto de ese titular en licencia, EULA, manifiesto y copyright.
2. Reservar un correo legal público dedicado que controle el titular y un domicilio real, autorizado para recibir avisos. No se debe inventar el dato ni poner el domicilio particular por defecto. La ley mexicana vigente pide identidad y domicilio del responsable en el aviso de privacidad (art. 15, fr. I); revisar el domicilio concreto con asesoría mexicana antes de publicarlo: [texto vigente de la LFPDPPP, Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf).
3. La web actual solo dirige “Soporte” a GitHub Issues; no usar Issues para solicitudes de privacidad ni como domicilio legal. Crear un canal legal dedicado y dejar los datos personales fuera de tickets públicos.
4. Aprobación humana real de licencia, EULA, privacidad, contenido, copyright/takedown y notices; el gate no trata la aprobación pendiente como un dato técnico.
5. Verificar dependencias, modelos, SBOM, atribuciones y procedencia de derechos; `THIRD_PARTY_NOTICES.md` todavía contiene campos “Pending/Verify”.
6. Una URL de TikTok cuyo procesamiento el titular esté autorizado a validar, si se quiere cerrar el smoke live de esta versión.

## Límites de lo demostrado

- El smoke instalado solo certifica inicio, health local, reinicio, empaquetado, ubicación de datos y desinstalación; no es aceptación visual de la ventana Tauri ni prueba de TikTok live.
- El instalador actual es grande y sin Authenticode; GitHub puede mostrar advertencias de Windows. El hash identifica la build local exacta, no un asset publicado.
- La compilación general con NSIS+MSI no fue PASS: el MSI prerelease falló. El NSIS separado sí quedó probado.
- La existencia de una release pública anterior no demuestra que el código Beta 2 actual esté descargable.
