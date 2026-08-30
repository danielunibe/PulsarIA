# Ciclo 5 — Playlists, configuración, retención y fuentes

## Objetivo

Auditar las operaciones persistentes de organización y configuración: CRUD de playlists por Tauri y REST, filtros de retención, carpeta y cookies, umbral semántico, clustering y sincronización periódica de fuentes.

## Correcciones aplicadas

| Punto | Corrección |
|---|---|
| Fallback REST de playlists | El gateway ahora escucha en `127.0.0.1`; las rutas de playlists se permiten sin JWT solo dentro de este gateway local. |
| CRUD falso | `usePlaylists` ya no crea, elimina ni ajusta conteos únicamente en memoria cuando falla la persistencia. Expone el error al panel. |
| Error de selección | La carga fallida de items deja la lista vacía y muestra el error recuperable. |
| Confirmación destructiva | Eliminar una playlist requiere confirmación explícita. |
| Accesibilidad | PlaylistCard permite Enter/Espacio para seleccionar y el botón de borrar tiene etiqueta accesible. Tabs, colores, formatos, filtros y clustering tienen `type=button` y estados ARIA. |
| Configuración de búsqueda | `update_search_config` valida valores, guarda `data/search_config.json` y el arranque recarga el archivo. El comando nativo de búsqueda usa el umbral/límite de AppState. |
| Estado ONNX | SettingsPanel consulta `get_model_status` y distingue comprobación, ONLINE y NO DISPONIBLE. |
| Clustering | Se eliminó el fallback simulado. El resultado proviene del comando Tauri o se muestra como error. El promedio de embeddings BLOB se calcula en Rust, no con `AVG` SQL sobre bytes. |
| Fuentes | Se validó que `collection_sources` es único, habilitado y marca `last_synced_at`; el sincronizador no bloquea la cola mientras el worker corre porque `dispatch_worker` hace spawn. |
| Retención/cookies/carpeta | Guardado real mediante comandos Tauri; cookies solo se leen por nombre de navegador permitido y no se copian a SQLite. |

## Pruebas ejecutadas

| Prueba | Resultado |
|---|---:|
| `playlist_rest_crud` contra `127.0.0.1:8080` | Aprobada: crear, listar, leer items y eliminar; sin JWT; registro temporal limpiado |
| `cargo fmt --check` | Aprobada |
| `cargo check` | Aprobada |
| `cargo test` | 9 aprobadas, 0 fallidas |
| Prueba de fuentes únicas y `last_synced_at` | Aprobada |
| Prueba de clustering con tres BLOBs | Aprobada; agrupó únicamente los dos vectores cercanos |
| TypeScript y ESLint de Settings/Playlists | Aprobados |
| `npm run build` | Aprobado; Next 15.5.23 compiló, validó tipos y exportó la ruta principal |

## Limitaciones explícitas

No se realizó click visual en la ventana Tauri porque el navegador conectado devolvió timeout/504 y el puerto 3000 estaba ocupado por otra aplicación. Las rutas REST se probaron directamente desde Windows. El selector de formatos mantiene preferencias locales, pero el pipeline base todavía genera MP4, MP3 y TXT fijos; no se afirma que MKV, WebM, MOV, WAV, FLAC, OGG, M4A, SRT, VTT o JSON sean conversiones activas.

## Guía dura para el ciclo 6

Auditar búsqueda literal y semántica por separado; el campo de búsqueda, debounce, Enter y limpieza; resultados de transcript y ranking; carga del transcript en el modal; seek a cada segmento; copy; exportación/importación UNIB; JSON Julia; y todos los endpoints `/jobs`, `/search`, `/health` y transcript. Debe comprobarse que el índice HNSW y SQLite usan el mismo `job_id` y `chunk_index`, que un resultado semántico apunta al job correcto, y que un error de modelo queda visible en lugar de devolver resultados simulados.

Los cambios permanecen sin commit ni push.
