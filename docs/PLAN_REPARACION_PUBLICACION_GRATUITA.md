# Auditoría integral y ruta de publicación gratuita

**Actualizado:** 2026-09-27  
**Autoridad del proyecto:** [PROJECT_TRUTH.md](../PROJECT_TRUTH.md)  
**Alcance:** preparar Pulsaria para que una persona pueda descargar gratis el instalador vigente desde GitHub Releases.

## Estado ejecutivo

El repositorio [danielunibe/PulsarIA](https://github.com/danielunibe/PulsarIA) es público y ya ofrece la prerelease `v0.1.0-eval.3`, sin costo de descarga. Esa release es del 2026-09-14 y no contiene el código Beta 2 validado en este checkout. El instalador NSIS reconstruido localmente desde el código actual sí pasó el smoke aislado, pero aún no se ha publicado.

El objetivo final sigue **PARTIAL**. Los gates técnicos del MVP pasan y el instalador Windows por usuario funciona. La publicación del código y un instalador actual requiere cerrar los datos y la aprobación legal pendientes, además de revisar y transferir el árbol de trabajo al repositorio remoto. El MSI falla con versiones prerelease alfanuméricas; el flujo de GitHub se ajustó para generar NSIS en prereleases y conservar MSI para versiones estables.

“Descarga gratis” describe el precio de descarga. La licencia del código es **Pulsaria Source-Visible Beta License**, no una licencia open source aprobada por OSI.

## Autoridad y preservación

- Checkout inspeccionado: `C:\Users\danie\Desktop\Pulsaria`.
- Rama actual: `beta2-hardening`; `HEAD` observado: `4cf30dd62aa6c728349b10c4fbcab5c6a09ebdda`.
- El árbol ya tenía cambios extensos y archivos nuevos antes de esta fase. Se trabajó sobre ese mismo estado; no se ejecutaron reset, clean ni stash.
- El código de actividad, errores de API local y playlists se modificó en esta fase. El instalador smoke crea y borra exclusivamente directorios de prueba dentro de `%TEMP%` y confirma que el marcador de datos sobrevive a la desinstalación.

## Fases y evidencia

| Fase | Estado | Evidencia actual | Cierre requerido |
| --- | --- | --- | --- |
| 0. Preservar y fijar autoridad | **PASS local** | Rama, HEAD y cambios locales revisados; checkout canónico conservado. | Revisión de cambios exactos antes de commit/push. |
| 1. Integridad de código y MVP | **PASS local** | `npm run verify:mvp`: 13/13; lint, TypeScript, Next producción, Rust formato/check/103 pruebas, Python 31 pruebas PASS + 1 omitida, secretos, loopback, estructura y 54/54 recursos. | Repetir sobre el commit candidato en CI. |
| 2. Reparación de actividad y playlists | **PASS automatizado** | Centro de actividad conectado a trabajos persistidos; carga/error/reintento explícitos; sin ceros falsos cuando falla el motor; mensajes REST 401/403 explican que la biblioteca requiere la app de escritorio; lint, TypeScript y `verify:mvp` pasan. | Revisión visual real en Tauri a 1280×800 y 860×640. |
| 3. Calidad complementaria | **PASS local** | `verify:frontend-a11y`, `verify:versions` (0.1.0-beta.2), `verify:icons`, `verify:local-llm`; `npm audit --omit=dev --audit-level=low`: 0 vulnerabilidades. | Añadir estos gates al candidato público y conservar logs. |
| 4. Instalador Windows actual | **PASS NSIS / MSI bloqueado por versión** | NSIS Beta 2: 687,312,308 bytes; SHA-256 `BC9B38F317A22C6DCE9E2EAFD0C7DC78D47D38AE4DC9234E6D7F908D0B91CD0C`. Instalación, primer arranque, reinicio, health, 54/54 recursos y preservación de datos al desinstalar: PASS en perfil temporal con `PATH` vacío. | Construir/validar en Actions tras publicar el candidato; MSI solo para versión estable. |
| 5. Pipeline live de contenido | **PENDIENTE** | Las 32 pruebas Python pasan; el caso TikTok live se omite porque no se suministró URL autorizada. El smoke del instalador actual fue offline. | Ejecutar con URL autorizada y harness nativo que entregue el token de proceso; comprobar ingestión, duplicado, outputs, búsqueda y reinicio. |
| 6. Legal, dependencias y atribuciones | **BLOCKED_EXTERNAL** | `npm run verify:legal-release` falla por una entrada de tercero no verificada y los campos placeholder `public_owner`, `legal_contact_email`, `notice_address`, `legal_approval`. | Verificar inventario completo/SBOM y modelos/notices; titular aporta contacto y domicilio para avisos; revisión y aprobación humana de los textos. No rellenar esos campos por inferencia. |
| 7. Publicar la versión validada en GitHub | **PENDIENTE** | Release remota más reciente: [`v0.1.0-eval.3`](https://github.com/danielunibe/PulsarIA/releases/tag/v0.1.0-eval.3), prerelease pública del 2026-09-14. No hay nueva release para este árbol. | Revisar y transferir los cambios necesarios, generar tag desde el commit validado, ejecutar la build limpia y adjuntar instalador actual, hashes y notas; confirmar descarga pública desde la página de Releases. |
| 8. Cierre estable y actualización automática | **BLOCKED_EXTERNAL / opcional para descarga directa** | Firma Authenticode, clave Tauri updater, runtime externo reproducible y variable protegida `RELEASE_READY` no están configurados. | Para release estable con actualización: credenciales/runtime de GitHub Environment, firma y gate de artefactos. Una descarga directa gratis no requiere auto-updater, pero sí comunicar que el instalador no está firmado si se distribuye así. |

## Hallazgo del empaquetado y corrección

`npm run tauri build` compiló el ejecutable y generó NSIS, pero el target MSI devolvió:

> `optional pre-release identifier in app version must be numeric-only and cannot be greater than 65535 for msi target`

El instalador NSIS resultante se instaló y pasó `npm run verify:installed -- -Configuration release -Bundle nsis`. Se corrigió `.github/workflows/release.yml` para construir y firmar solo NSIS en cualquier prerelease; las versiones estables siguen generando NSIS y MSI. `scripts/verify-release-artifacts.ps1` ahora admite explícitamente `-AllowPrerelease`, comprueba que `latest.json` tenga versión prerelease y hace Authenticode sobre los artefactos presentes. El flujo editado aún necesita ejecución en GitHub Actions.

## Bloqueos concretos para pedir al titular

1. Nombre legal del titular que debe figurar como `public_owner`.
2. Email de contacto legal y domicilio de notificaciones para publicación.
3. Aprobación humana de licencia, EULA, privacidad, contenido, copyright/takedown y notices; el gate no trata la aprobación pendiente como un dato técnico.
4. Una URL de TikTok cuyo procesamiento el titular esté autorizado a validar, si se quiere cerrar el smoke live de esta versión.

## Límites de lo demostrado

- El smoke instalado solo certifica inicio, health local, reinicio, empaquetado, ubicación de datos y desinstalación; no es aceptación visual de la ventana Tauri ni prueba de TikTok live.
- El instalador actual es grande y sin Authenticode; GitHub puede mostrar advertencias de Windows. El hash identifica la build local exacta, no un asset publicado.
- La compilación general con NSIS+MSI no fue PASS: el MSI prerelease falló. El NSIS separado sí quedó probado.
- La existencia de una release pública anterior no demuestra que el código Beta 2 actual esté descargable.
