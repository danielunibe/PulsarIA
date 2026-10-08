# Reparación del lateral y del panel de carga — 2026-10-08

## Fallos aislados

1. El fondo fijo de la biblioteca se pintaba por encima del panel contextual.
   Los controles conservaban geometría y foco, pero no se veían en la captura.
   El panel ahora tiene un nivel explícito sobre el contexto de la biblioteca.
2. A 860 × 640, el panel de carga se reducía a 206.66 px por el reparto flex.
   Ahora conserva un mínimo de 292 px; la biblioteca adapta su espacio restante.
3. El cierre animado dejaba `html[data-leaving="true"]` en el documento cuando
   Rust ocultaba la ventana hacia la bandeja. Ese estado tiene opacidad cero y
   desactiva clics. `useWindowControls.close()` lo limpia en `finally`, tanto
   en éxito como en error, incluso para el callback de cierre alternativo.

## Optimización y prevención

- `will-change` de transformaciones/opacidad/filtro solo se reserva durante
  la transición Cinema, no durante toda la vida del panel principal/lateral.
- ESLint omite runtime derivado y artefactos de biblioteca, manteniendo las
  fuentes canónicas dentro del análisis.
- Cuatro pruebas del hook real cubren cierre repetido hacia bandeja, error
  nativo, callback alternativo y movimiento reducido. Están conectadas a CI y
  a `verify:mvp`.

## Evidencia ejecutada

- `npm run verify:mvp`: PASS 13/13. Rust: 276 casos generales aprobados,
  seis ignorados y dos pruebas de runtime real aprobadas por separado
  (278 aprobados en total). Python: 32 casos, 31 aprobados y un live omitido.
- PASS: accesibilidad frontend, iconos, versiones, release legal y estructura
  canónica. Seis pruebas de tooling de export/versiones/SPDX aprobadas.
- El build final se repitió después de los ajustes CSS. Una ejecución previa
  chocó con un archivo bloqueado por el empaquetado simultáneo; se descartó y
  se separaron export y empaquetado.
- El IPC nativo `get_runtime_preflight` respondió `ready=true`,
  `offline_ready=true` y `missing=[]` con la biblioteca original seleccionada.
- Se actualizó el ejecutable de `AppData/Local/Programs/Pulsaria`, conservando
  su copia anterior. El instalado y el Release generado coinciden en SHA-256:
  `51DD38F84CD8D99100119F5A016C960807B3F1D4AC3F81D5AB9F9E2B84D33FA9`.
  Es una actualización local del EXE, con el runtime instalado existente.
- NSIS nuevo: build final exit 0, 690,377,499 bytes,
  SHA-256 `F2A10D8BA36478D8A9AC04A6C4C9EA9D7512BA20A3DBB92C88981ABAB0B75F65`,
  Authenticode `NotSigned`. Archivo:
  `target-tauri/release/bundle/nsis/Pulsaria_0.1.0-beta.3_x64-setup.exe`.
  No se afirma instalación desde ese nuevo paquete ni smoke en Windows limpio.
  Recibo: `target-tauri/sidebar-repair-receipt.json`.
- PASS nativo técnico: 30 trabajos completos, nueve imágenes cargadas,
  panel a 358.40 px y capa 1, campo URL alcanzable, health `ok`/Beta 3 y
  preflight listo sin faltantes. Cerrar mediante el botón nativo ocultó la
  ventana hacia bandeja; al reabrir, `data-leaving` estaba ausente, opacidad 1
  y `pointer-events:auto`. La captura del proveedor incluye una superposición
  de otra aplicación y no certifica inspección visual nativa completa.
- El modelo seleccionado está configurado: perfil `fast`, Whisper `tiny`,
  CPU, `ready=true` y estado `bundled`. Los accesos de escritorio y menú Inicio
  apuntan al ejecutable actualizado de `AppData/Local/Programs/Pulsaria`.
- El arranque final normal, con el puerto de diagnóstico cerrado, respondió
  health `ok`/Beta 3 y conservó en la ventana nativa el contador de 30 TikToks,
  navegación principal, panel contextual y entrada URL.
- Chromium sobre el export final: PASS a 1280 × 800 y 860 × 640; nueve imágenes
  del lateral decodificadas, navegación Ajustes → Inicio, foco/clic en URL y
  cero excepciones JavaScript. Panel: 358.39 px y 292 px, respectivamente.
- Capturas revisadas: `target-tauri/sidebar-web-1280.png` y
  `target-tauri/sidebar-web-860.png`. Son fixtures web sin biblioteca personal;
  no acreditan por sí mismas aceptación visual nativa ni descarga live.
- Logs locales: `target-tauri/sidebar-mvp-verification.log`,
  `target-tauri/sidebar-final-build.log`, `target-tauri/sidebar-native-build.log`.
  Detalle web: `target-tauri/sidebar-web-evidence.json`.

## Biblioteca y límites

Se tomaron snapshots consistentes mediante SQLite backup en
`target-tauri/sidebar-repair-backup/`. Ambas bases tienen `integrity_check=ok`.
La biblioteca del proyecto contiene 30 trabajos completados y conserva 174
referencias foráneas históricas sin resolver. El perfil predeterminado de la
instalación contiene un trabajo fallido y ningún video; no tiene esas
violaciones. El candidato histórico conservado tiene 31 trabajos (30 completos
y uno fallido) y hereda las 174 referencias. No se fusionaron bases ni se
reactivaron descargas en esta reparación. La elección de biblioteca se consultó
al usuario y se mantiene la selección original para las comprobaciones nativas.

Los gates automáticos no sustituyen voz española/transcripción/indexación desde
la UI, instalación en Windows limpio, revisión humana, firma o updater público.
No se publicó una release ni se modificó `DIRECT_DOWNLOAD_RELEASE_READY`.
