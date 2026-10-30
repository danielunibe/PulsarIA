# Ciclo 2 — Ingesta de enlaces, archivos y colecciones

## Objetivo

Auditar secuencialmente la entrada manual de enlaces, el cambio entre pestañas, la carga de archivos TXT/CSV, la validación de dominios, la deduplicación y la expansión de fuentes TikTok sin descargar un video real no autorizado.

## Correcciones aplicadas

| Punto | Corrección |
|---|---|
| Estado de pestaña | El botón de procesar ahora depende únicamente de los datos de la pestaña activa; cambiar entre enlace y archivo ya no dispara una operación vacía. |
| Validación vacía | Una entrada vacía o un archivo sin enlaces vuelve a `idle` y muestra un mensaje recuperable en lugar de quedarse en `ready`. |
| TXT/CSV | El parser acepta líneas, comas y punto y coma, elimina duplicados y conserva solo URLs soportadas. |
| Feedback | AddLinks muestra enlaces válidos, inválidos y errores de encolado mediante `role=status` y `role=alert`. |
| Accesibilidad | Las pestañas tienen `role=tab`, `aria-selected` y estado disabled; los campos tienen nombres accesibles; el selector de archivo acepta Enter y barra espaciadora. |
| Reelección de archivo | El valor del input se limpia después de seleccionar para permitir elegir nuevamente el mismo archivo. |
| REST individual | El endpoint ya deduplica por URL y no despacha nuevamente un job existente. |
| REST de colecciones | Se registra la fuente, expande mediante `python-workers/main.py --expand-url`, limita a 200 resultados, deduplica e ingresa cada URL nueva al worker pool. |
| Detección de fuentes | Se cubren perfiles, playlists, likes/favoritos y se excluyen URLs de video individuales. |
| Cookies | La expansión autenticada continúa siendo opt-in por configuración del navegador; este ciclo no copia ni persiste cookies. |

## Pruebas ejecutadas

| Prueba | Resultado |
|---|---:|
| TypeScript (`tsc --noEmit`) | Aprobada |
| ESLint de `AddLinks.tsx` y `use-link-processor.ts` | Aprobada sin advertencias después de limpiar dependencias del hook |
| `cargo fmt --check` | Aprobada |
| `cargo check` | Aprobada |
| Pruebas unitarias de clasificación REST | 2 aprobadas |
| POST REST con `http://`, dominio ajeno y URL vacía | Los tres casos devolvieron 400; no se ejecutó descarga externa |
| Compilación del flujo REST de colección | Aprobada |
| Inspección visual conectada | Bloqueada: el puerto IPv4 3000 pertenece a Pixvoxia; el listener IPv6/alias localhost devolvió HTTP 504 de la extensión |

## Criterio de salida

La fase de ingesta se considera aprobada por contratos, código y pruebas unitarias, pero la validación visual de los clicks queda explícitamente pendiente por un bloqueo del navegador conectado. No se debe presentar como E2E visual ni como descarga TikTok real. El siguiente ciclo debe auditar la cola y el worker con un fixture local o un ejecutable controlado, y debe conservar la separación entre expansión de metadatos y descarga de video.

## Guía dura para el ciclo 3

El ciclo siguiente debe verificar que cada job creado desde cualquier origen aparece en cola, que un proceso Python ausente produce un error visible y no una promesa colgada, que los eventos `metadata`, `downloading`, `transcribing`, `indexing`, `complete` y `error` se normalizan en la UI, y que el pipeline persiste transcript, segmentos, embeddings y estado de retención. No debe utilizarse una URL externa real sin que el usuario proporcione una URL pública permitida y autorice expresamente la prueba.

Los cambios permanecen sin commit ni push.
