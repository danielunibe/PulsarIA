# Ciclo 4 — Biblioteca, filtros, tarjetas y reproducción

## Objetivo

Auditar la biblioteca real de jobs y los controles que determinan qué se muestra, cómo se ordena, cómo se reproduce y cómo se abre un contenido conservado online-only.

## Correcciones aplicadas

| Punto | Corrección |
|---|---|
| Orden por fecha | `VideoGrid` usa `created_at` real con fallback al ID, en lugar de asumir que el ID equivale siempre a fecha. |
| Orden alfabético | El título se compara con locale español para obtener un orden A-Z estable. |
| Filtro de retención | PagePanel alterna Todas, Conservar y Online; antes no se podía seleccionar Online. |
| Accesibilidad de filtros | Layouts, columnas y filtros son botones con `type=button` y `aria-pressed`. |
| Carga local | Las tarjetas vacías tienen un botón visible y accesible `Cargar video local`; el click ya abre el selector en vez de mostrar solo un toast. |
| Reproducción modal | El modal intenta iniciar el video al montarse, usa el estado real `paused`, y expone play/pause, sonido, velocidad, reinicio y seekbar con nombres accesibles. |
| Apertura online-only | Se usa el plugin shell nativo de Tauri con fallback web y se rechazan protocolos distintos de HTTPS. |
| Datos audiovisuales | `VideoGrid` pasa `visual_analysis` e `instructional_guide` al modal Ficha IA. |

## Pruebas ejecutadas

| Prueba | Resultado |
|---|---:|
| TypeScript | Aprobada |
| ESLint de PagePanel, VideoGrid, VideoCard y ExpandedVideoModal | Aprobada sin advertencias |
| `npm run build` | Aprobado; Next 15.5.23 compiló, verificó tipos y exportó la ruta principal |
| `cargo check` tras plugin shell y schema | Aprobada |
| Apertura nativa | Código y permisos verificados; falta click visual porque la extensión conectada devolvió HTTP 504 |
| Datos persistidos de JobRecord | Consultas SQLite y endpoints compilan con error_message y campos audiovisuales |

## Limitación que no se oculta

No se pudo ejecutar una prueba visual de la ventana Tauri: el navegador conectado no respondió a tres intentos y el puerto IPv4 3000 mostraba otra aplicación. Las pruebas de interfaz de este ciclo son de contrato, compilación y rutas de eventos; no equivalen a un click visual. La ventana nativa aún debe verificarse manualmente en la máquina Windows durante el cierre.

## Guía dura para el ciclo 5

Auditar playlists y configuración tanto por Tauri como por REST. Verificar crear, seleccionar, añadir, quitar y eliminar; resolver el 401 del fallback REST de playlists; hacer que retención y carpeta se persistan y afecten al backend; conectar o retirar controles de formatos, modelo, clustering y umbral que hoy sean solo visuales; verificar navegador de cookies opt-in; y confirmar que el sincronizador de fuentes no duplique jobs ni mantenga rutas temporales incorrectas.

Los cambios permanecen sin commit ni push.
