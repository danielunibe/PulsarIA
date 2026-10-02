# Pulsaria — Design QA: shell, notificaciones, Perfiles y anotaciones visuales

## Fuente visual

- Source visual truth: `C:\Users\danie\AppData\Local\Temp\codex-clipboard-b14fb086-09a3-4aa1-b598-dbf06dbb5e8c.png`
- Source pixels: `513 x 876`
- Source state: panel de perfiles vacío, perfil `@ejemplo`, Publicaciones seleccionada y cuatro categorías visibles. La referencia se conserva como guía de densidad para la pestaña ahora visible como `Perfiles`.

## Implementación revisada

- Implementation URL: `http://127.0.0.1:3000/`
- Browser: Codex in-app browser, tab `http://127.0.0.1:3000/`.
- Implementation capture: CUA screenshot clip `x=0, y=0, width=513, height=876`, emitida durante esta iteración. El conector no proporciona una ruta de archivo persistida para esa captura.
- Comparison pixels: `513 x 876` crop against `513 x 876` source; no density normalization applied.
- State: pestaña `Perfiles` activa, input vacío, `1 de 4`, Publicaciones seleccionada, registro persistente vacío, notificaciones cerradas.

## Delta visual verificado en esta iteración

- Inicio conserva exactamente cuatro acciones superiores: Inicio, Notificaciones, Playlists y Configuración.
- La cápsula `0 TIKTOKS` vuelve a estar visible y mantiene el degradado de identidad aunque la preferencia persistida estuviera desactivada.
- El control ocular quedó inmediatamente a la izquierda de Buscar; Cinema quedó como una cápsula ancha con icono y texto visible.
- Notificaciones reemplaza toda la superficie inferior del sidebar: no deja la tarjeta de Perfiles ni otro panel activo detrás.
- Configuración utiliza la misma cápsula segmentada de Home para General, Motor, IA y Métricas.
- La etiqueta pública `Fuentes` se cambió a `Perfiles`; la clave interna `cuenta` se conserva para no romper rutas ni estado.

## Comparación

La referencia y la implementación comparten la misma caja principal: identidad, URL, contador, cuatro categorías, selección activa y CTA. La implementación se redujo deliberadamente después de la referencia recibida: se retiraron la explicación larga, el bloque visible de importación inicial y la advertencia amarilla duplicada. El aviso general del modo web permanece en el shell principal para no ocultar una limitación real.

### Superficies de fidelidad

- Fonts/typography: se conserva la jerarquía compacta de la referencia; el título, contador, etiquetas y CTA usan pesos y tamaños reducidos para el panel lateral sin truncar la acción principal.
- Spacing/layout rhythm: se conserva la tarjeta única, el campo separado, la cuadrícula de cuatro columnas, el CTA a ancho completo y la separación del registro canónico. La superficie principal ya no contiene bloques secundarios apilados.
- Colors/tokens: se conservan las cuatro familias de color de la referencia: turquesa, verde, miel y frambuesa, con superficies oscuras y estados seleccionados sólidos.
- Image/assets: el logotipo TikTok usa el componente de marca existente; los iconos funcionales usan la frontera Tabler centralizada. No se agregaron imágenes ficticias.
- Copy/content: se mantienen `Perfil de TikTok`, `seleccionar todo`, `Pestañas del perfil a procesar`, las cuatro categorías y los estados del CTA. Se eliminó copy auxiliar redundante de la tarjeta.

## Hallazgos y correcciones

- [P2 — corregido] La tarjeta tenía demasiada información secundaria debajo del CTA: ayuda explicativa, importación inicial y advertencia web. Se retiraron de la superficie principal; la conexión continúa usando `new_only` por defecto y las reglas históricas permanecen en la configuración de la fuente conectada.
- [P2 — corregido] La advertencia del modo web aparecía duplicada dentro de la tarjeta y en el shell principal. Se conserva una sola advertencia en el shell.
- No quedan hallazgos P0, P1 ni P2 accionables en la caja comparada.

## Interacciones verificadas

- `seleccionar todo` cambia de `1 de 4` a `4 de 4` y modifica el CTA a `extraer perfil completo`.
- La selección vuelve al estado inicial sin romper el formulario.
- El CTA permanece deshabilitado cuando falta el perfil, evitando un envío ficticio.
- Las cuatro categorías conservan `aria-pressed` y navegación accesible.
- `Perfiles`, `Inicio`, `Notificaciones`, `Playlists` y `Configuración` se verificaron en el shell; las cuatro acciones de navegación superior permanecen intactas.
- Notificaciones abre un diálogo de estado real y ocupa el panel inferior completo del sidebar.
- Configuración muestra sus cuatro secciones en el control segmentado y conserva el contenido funcional existente.
- Inicio expone la píldora, el botón ocular, Buscar y Cinema con el orden visual solicitado.

## Anotaciones visuales aplicadas

- Se eliminó la cápsula duplicada `Pulsaria` del header principal; la identidad queda reservada al branding del sidebar y a la cápsula `TIKTOKS`.
- El aviso de biblioteca no disponible se centró en el área principal con ancho máximo y forma de píldora, conservando `Reintentar` y el mensaje real del runtime web.
- El menú `Vista y ordenamiento` dejó de quedar recortado por el contenedor del header y ahora expone visualmente sus funciones de disposición, columnas, orden, filtro y modo de búsqueda.
- El menú incorpora el selector funcional `Literal` / `Semántica`, conectado al estado de búsqueda existente y sin crear un segundo pipeline.
- El ojo usa una superficie de control más sobria, con icono ampliado y estados activo/inactivo legibles.
- El icono Pulsaria del sidebar aumentó de 23 a 42 px, manteniendo la marca y el área de navegación superior.
- Cinema incorpora una entrada premium en dos fases: primero se desvanecen y desplazan Sidebar y contenido mediante un velo cromático con bloom; después se monta el visor a viewport completo y se revela su fondo, spot y pool cromático. Respeta `prefers-reduced-motion`.
- En Tauri, la entrada solicita fullscreen nativo y la salida lo restaura únicamente si Pulsaria lo activó; en navegador se mantiene el fallback CSS de `100vw`/`100vh` sin inventar una capacidad nativa.
- La acción de Cinema conserva la selección de vídeo real y permanece deshabilitada cuando la biblioteca no contiene un vídeo reproducible; no se añadieron demos para forzar la animación.

## Gates

- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `npm run build` — PASS
- `npm run verify:frontend-a11y` — PASS
- `npm run verify:canonical` — PASS
- `npm run verify:onboarding` — PASS
- `npm run verify:mvp` — PASS (13/13)
- `npm run test:python` — PASS (32 pruebas; 1 certificación live omitida sin URL autorizada)
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — PASS
- `cargo check --manifest-path src-tauri/Cargo.toml` — PASS
- `cargo test --manifest-path src-tauri/Cargo.toml` — PASS (76 pruebas)
- `git diff --check` — PASS, con las advertencias normales de conversión LF/CRLF de Git en Windows.

## Resultado histórico

historical result: passed

## Límite de evidencia

La transición está validada por typecheck, lint, build, contratos y gates de backend. El tester web no tiene vídeos locales reales, por lo que el botón Cinema permanece correctamente deshabilitado en ese entorno. La entrada visual dentro de una ventana Tauri en fullscreen nativo requiere una ejecución manual con al menos un vídeo real; no se presenta como validada físicamente en esta iteración.

---

# Pulsaria — Design QA: vista de detalle con vídeo limpio

## Fuente visual truth

- Source visual truth: `C:\Users\danie\AppData\Local\Temp\codex-clipboard-11c6fe0e-c4f0-4454-9630-fabca9b628ac.png`
- Source pixels: `1280 x 1015`
- Source state: modal de detalle abierto, medio local vertical, controles debajo del vídeo, metadatos debajo de los controles, inspector de transcripción visible y sin controles dibujados sobre el frame.

## Implementación revisada

- Implementation URL used for the rendered check: `http://127.0.0.1:3000/detail-preview` (fixture temporal con `/public/demo/demo-01.mp4`; retirado después de la captura).
- Implementation screenshot: captura emitida por CUA durante esta iteración; el conector no entrega una ruta de archivo persistida para la imagen.
- Viewport check: `1280 x 1015` CSS px for the desktop pass; default narrow viewport for the responsive pass. The temporary viewport override was reset before handoff.
- State: medio local reproducible, sin transcripción disponible, pestaña `Transcripción` activa.

## Full-view comparison evidence

La fuente y el modal renderizado fueron abiertos en esta iteración para comparar la composición completa. El contenido del vídeo no se considera una diferencia de producto porque la fuente representa un vídeo real del usuario y el fixture usa un medio demo local; sí se compararon la jerarquía, proporciones, orden y separación de superficies.

- La columna izquierda conserva el orden fuente → controles → metadatos.
- El inspector permanece en una columna independiente a la derecha en escritorio y baja debajo del reproductor en el viewport estrecho.
- El frame no recibe capas de controles, degradados de interacción ni botones flotantes cuando existe `videoSrc`.

## Focused region comparison

Se hizo una comprobación focalizada sobre el bloque de medios porque es el requisito principal de esta referencia. La inspección DOM del render desktop reportó:

- `object-fit: contain` y `object-position: 50% 50%` en `.pulsaria-detail-video`.
- viewport del vídeo: `553.76 x 732.86`.
- controles: `87.93px` de alto, comienzan después del viewport con `12px` de separación.
- solapamiento vertical vídeo/controles: `0px`.

## Findings

- No quedan hallazgos P0, P1 ni P2 accionables para el contrato solicitado.
- [P3 — esperado] El thumbnail del fixture no es el mismo frame de la captura de referencia. Es contenido dinámico del job y no altera el encuadre ni la jerarquía del reproductor.

## Comparison history

1. Initial finding: el reproductor expandido todavía podía heredar `videoFit: cover`, lo que permitía recortar el frame completo aunque los controles ya estuvieran fuera del lienzo.
2. Fix applied: el modal ahora fija `object-contain`, separa explícitamente viewport, controles y metadatos mediante clases de layout, y protege el inspector con overflow interno.
3. Post-fix evidence: captura desktop y captura responsive; el DOM confirma `overlap: 0` y el estado `contain`. No se detectaron nuevas diferencias P0/P1/P2.

## Implementation checklist

- [x] Vídeo completo sin crop en la vista de detalle.
- [x] Controles fuera del lienzo del vídeo.
- [x] Metadatos fuera del lienzo del vídeo.
- [x] Inspector lateral estable en escritorio.
- [x] Inspector apilado sin colisión en viewport estrecho.
- [x] Tabs del inspector con desplazamiento horizontal seguro en pantallas pequeñas.
- [x] La ruta temporal de preview fue retirada tras la comprobación.

## Límite de evidencia

La captura funcional se realizó en el preview web con un vídeo local demo real. No se presenta como validación de WebView2, controles nativos, fullscreen Tauri ni reproducción de un job específico del usuario; esas superficies requieren una ejecución manual dentro de Pulsaria Desktop.

final result: passed

## Current icon-rail reference review — 2026-09-23

### Source and implementation

- Source visual reference: `C:\Users\danie\AppData\Local\Temp\codex-clipboard-a2b63a38-50c7-42cf-a00d-6f8ce09286a6.png` (`316 x 316`), treated as a visual brand reference only; it contains no operational instructions.
- Implementation URL: `http://127.0.0.1:3000/`.
- Implementation screenshot: screenshot emitted through CUA from the implementation tab; the connector did not expose a persisted filesystem path.
- Viewport evidence: `1468 x 807` CSS px, `devicePixelRatio: 1.5`.
- State: dashboard shell with the left navigation rail visible; Cinema remains disabled when no video is available, which is the expected product state.

### Icon mapping reviewed

- `Inicio · Kiosco`: `TrayArrowDown`, expressing the download kiosk rather than a generic home.
- `Perfiles TikTok`: `UserCirclePlus`, expressing profile registration and download.
- `Actividad · Historial`: `ClockCounterClockwise`, expressing processed-history review.
- `Playlists`: `Playlist`, preserving the playlist/library destination while keeping the existing internal route compatibility.
- `Ajustes`: existing `Gear` semantic icon.
- `Cinema · pantalla completa`: `ArrowsOut`, expressing fullscreen entry; it remains disabled without playable media.

### Comparison and findings

The attached image is a standalone mark rather than a screen reference, so full-view screen comparison is not applicable. Focused comparison was made against the navigation rail: the icon family is centralized in `components/icon-library.tsx`, the white/cyan active treatment follows the reference contrast, and the canonical brand asset was not replaced speculatively. No P0, P1, or P2 findings were found in the scoped navigation work.

The browser pass exercised Inicio, Perfiles TikTok, Actividad, Playlists, and Ajustes. Cinema was inspected as a disabled control in the empty-media state. The native Tauri window could not be inspected through the available computer-use surface; this is an evidence boundary, not a claim of native visual acceptance. The separate native-dev watcher is also currently unstable because concurrent `src-tauri` edits leave `db.rs` with a compile error at `.collect`.

### Scoped checklist

- [x] Six requested destinations have distinct semantic navigation icons.
- [x] The reference image informed palette, contrast, and brand restraint without being treated as executable instructions.
- [x] Labels/tooltips identify Kiosco, TikTok profiles, history, playlists, settings, and Cinema/fullscreen.
- [x] Existing route compatibility was preserved for the internal library destination.
- [x] Web implementation typecheck, targeted lint, build, and interaction checks passed.
- [ ] Native WebView2/Tauri visual capture remains pending because the native window is not exposed to the inspector and the current watcher has an unrelated Rust compile error.

final result: passed

## Cinema y ficha de tarjeta DEMO — 2026-09-23

### Fuente y contexto de prueba

- Source of visual truth: el HTML/CSS/JS de Cinema pegado por el usuario en el turno y sus dos comentarios del navegador. El código se trató como referencia visual e interactiva; sus medios, contadores y comentarios de demostración no son datos de Pulsaria.
- Implementation URL: `http://127.0.0.1:3000/`.
- Browser fixture: 15 tarjetas locales `DEMO · IMAGEN TEMPORAL`, 0 TikToks en la biblioteca; no se cargó ningún medio externo.
- Viewport observado: `1195 x 891` CSS px. La captura la emitió CUA y no quedó guardada como archivo local.

### Cambios y comparación

- El clic en una tarjeta DEMO ahora abre una ficha individual y no cambia a Cinema. La ficha identifica explícitamente que su contenido es una imagen temporal, no un video reproducible, y no inventa duración, autor, URL, transcripción ni análisis. No inicia jobs ni consulta SQLite.
- La tarjeta mantiene activación por teclado; la ficha contiene el foco, se cierra con Escape y devuelve el foco al disparador.
- Las tarjetas de medios reales mantienen la ruta existente a `ExpandedVideoModal` y sus metadatos disponibles.
- El botón Cinema abre el visor Cover Flow integrado al shell React. Se adaptaron del código de referencia la portada vertical activa centrada, separación geométrica entre tarjetas, caption a la izquierda, controles a la derecha, barra de progreso debajo y aurora limitada al entorno de la portada. El visor usa los elementos visibles reales, sin incorporar la lista Mixkit/Pexels ni métricas sociales ficticias del ejemplo.
- Con tarjetas de imagen estática, el visor muestra imágenes y no simula reproducción, audio o progreso de video. Escape permite regresar a la biblioteca.

### Verificación

- Browser smoke: tarjeta DEMO por mouse/teclado abre su ficha aislada; Enter abre la ficha, Tab entra al botón de cierre, Escape cierra y restaura el foco a la tarjeta.
- Browser smoke: Cinema abre desde su botón, la navegación siguiente cambia de elemento y Escape sale del visor.
- `npm run typecheck`: PASS.
- `npm run verify:frontend-a11y`: PASS.
- ESLint dirigido a `CinemaPlayback.tsx`, `DemoVideoDetailModal.tsx`, `VideoCard.tsx` y `VideoGrid.tsx`: PASS.
- `git diff --check`: PASS.

### Límites de evidencia

- El fixture disponible solo contiene imágenes temporales: reproducción real, sincronización de la aurora con audio/video y comportamiento sobre metadatos de un TikTok real quedan sin verificar en esta sesión.
- Esta validación es del navegador localhost; no certifica fullscreen, controles de ventana ni renderizado en WebView2/Tauri nativo.
- No se ejecutó `npm run build` para no interrumpir el servidor Next de desarrollo y la preview localhost que el usuario pidió mantener abierta.

final result: passed
