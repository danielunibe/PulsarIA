# Ciclo 1 — Arranque nativo y shell de Pulsaria

## Objetivo

Verificar que Pulsaria puede iniciar como aplicación Tauri en Windows, cargar la UI existente, levantar el gateway local y dejar disponibles los puntos de navegación principales antes de auditar cada acción de ingesta.

## Resultado

El ciclo queda **aprobado con correcciones aplicadas**. La aplicación nativa llegó a compilar y ejecutar `pulsaria.exe`; Next respondió `HTTP 200` sin `Module not found` ni `Internal Server Error`; y el gateway respondió `HTTP 200` tanto en `/health` como en `/api/v1/health` con `{"status":"ok","version":"0.0.0"}`.

| Elemento verificado | Resultado | Corrección aplicada |
|---|---:|---|
| Arranque Tauri en Windows | Aprobado | Se alinearon las versiones de Node/Rust de Tauri y se mantuvo el runtime compilable. |
| Carga de Next.js | Aprobado | Se restauraron `framer-motion`, `motion-dom` y `motion-utils`, y se eliminaron importaciones incompatibles de `AnimatePresence`. |
| Render de la pantalla principal | Aprobado por HTTP | La ruta `/` compiló y respondió 200. La extensión del navegador no respondió, por lo que la inspección visual quedó reemplazada por comprobación HTTP y compilación estricta. |
| Gateway de salud | Aprobado | Se añadió el alias público `/health` y su bypass de JWT, manteniendo `/api/v1/health`. |
| Observabilidad | Aprobado | Se reemplazó la inicialización fatal del subscriber/recorder por inicialización tolerante, evitando que una segunda ejecución produzca `panic`. |
| Navegación a biblioteca | Aprobado por código y build | `handleClearSearch` restaura la biblioteca y cierra el contexto de búsqueda. |
| Selección de playlist | Aprobado por código y build | La selección cierra la reproducción activa, limpia resultados de búsqueda y muestra el filtro seleccionado. |
| Resultado de búsqueda | Corregido | Cada coincidencia ahora es un botón accesible que conserva la navegación al video. |

## Hallazgos que deben guiar el ciclo 2

El siguiente ciclo no podrá darse por terminado con una simple validación de componentes. Deberá probar secuencialmente todos los controles de `AddLinks` y `use-link-processor`: pestaña de enlace, pestaña de archivo, edición y deduplicación de filas, añadir/eliminar filas, selector de archivo, carga de TXT/CSV, validación de URLs HTTPS, detección de fuentes individuales, perfiles, playlists, favoritos y likes, botón de procesamiento, mensajes de error y limpieza posterior.

La fuente pública o autenticada debe diferenciarse antes de descargar. Los feeds privados de TikTok solo podrán activarse mediante el navegador configurado explícitamente por el usuario; no se deben guardar cookies en SQLite ni en archivos del proyecto. Las colecciones deben limitarse, deduplicarse y producir jobs individuales persistidos, sin bloquear la interfaz.

## Validaciones ejecutadas

| Validación | Resultado |
|---|---:|
| `cargo fmt --manifest-path src-tauri/Cargo.toml` | Aprobado |
| `cargo check --manifest-path src-tauri/Cargo.toml --message-format=short` | Aprobado |
| `node node_modules/typescript/bin/tsc --noEmit` | Aprobado |
| `node node_modules/eslint/bin/eslint.js` sobre la UI modificada | Aprobado después de corregir hooks de React |
| `node node_modules/next/dist/bin/next build` | Aprobado |
| `npm run tauri dev` | Tauri y Next arrancaron; el gateway llegó a responder salud 200 |
| Prueba visual con navegador conectado | No disponible: la extensión respondió HTTP 504 en tres intentos |

## Criterio de salida del ciclo 1

No se debe pasar al ciclo 2 si reaparece cualquiera de estas condiciones: la ruta `/` devuelve 500, el gateway no inicia, `/health` requiere JWT, el proceso Tauri termina durante el bootstrap, o la UI no puede montar `Sidebar`, `Header`, `PagePanel`, `PlaylistsPanel` y `VideoGrid` sin errores de módulo, tipos o hooks.

## Estado de artefactos

Los cambios permanecen sin commit ni push. `node_modules`, `.next`, `out` y cachés de compilación son artefactos locales y no forman parte del software fuente que se debe entregar.

## Evidencia visual adicional

El navegador conectado se abrió en `http://127.0.0.1:3000/`, pero ese puerto en el equipo del usuario estaba ocupado por otra aplicación (`Pixvoxia Studio`) y mostró un overlay de Vite con un error de sintaxis en `src/core/bridge.ts`. No se modificó esa aplicación. Por tanto, esta observación confirma que el navegador no constituye una validación visual de Pulsaria; la validación de Pulsaria se mantiene limitada a la compilación, los endpoints locales y las pruebas unitarias/contractuales hasta disponer del puerto/ventana nativa correctos. Se localizó además que Next de Pulsaria escucha en `::1:3000`, mientras Pixvoxia ocupa `127.0.0.1:3000`; el intento de abrir explícitamente `http://[::1]:3000/` volvió a terminar en HTTP 504 de la extensión, por lo que no se afirmó una prueba visual inexistente. El alias `http://localhost:3000/` también terminó en HTTP 504; no se repetirán intentos idénticos y se continuará con contratos, pruebas unitarias y validaciones de proceso.
