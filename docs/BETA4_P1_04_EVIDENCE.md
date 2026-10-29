# Pulsaria Beta 4 — evidencia de Gate P1-04

Fecha de corte: 2026-10-29
Estado: **PARTIAL — permanece en DOING**
PR: [#3, borrador y abierto](https://github.com/danielunibe/PulsarIA/pull/3)

## Dependencias y alcance

P0-02 quedó cerrado en `6bc9f53fa768fc2cb32aeeb1b4942d4e989a1c7b`; sus
workflows canonical y runtime bootstrap/manifest terminaron PASS. P1-03 quedó
cerrado en `0c1fd6225b998486bf5021fd80ecb7f489b8f268`; sus runs exactos son
[canonical 40854106231](https://github.com/danielunibe/PulsarIA/actions/runs/40854106231)
y [runtime bootstrap 40854106226](https://github.com/danielunibe/PulsarIA/actions/runs/40854106226),
ambos PASS. Las seis especificaciones UX-01, AI-02, SYNC-03, QUEUE-04, MEDIA-05
y SETTINGS-06 siguen como planes en
[BETA4_KNOWLEDGE_PIPELINE_SPEC.md](./BETA4_KNOWLEDGE_PIPELINE_SPEC.md).

P1-04 reduce las capacidades del WebView, aplica autorización por referencia
exacta para cada archivo renderizable, restringe la CSP y valida los enlaces y
orígenes que cruzan la frontera nativa. No rediseña la interfaz ni agrega
downloader, base de datos, cola o WebView paralelos.

## Hallazgos y controles aplicados

| Superficie | Hallazgo | Control aplicado |
|---|---|---|
| Tauri asset protocol | El scope declarativo incluía `$HOME/**` y `$RESOURCE/**`; convertir una ruta con `convertFileSrc` no comprobaba que el archivo estuviera registrado en la biblioteca. | `scope` declarativo vacío. La ruta pasa primero por `authorize_renderable_asset`, que exige una referencia exacta persistida y luego incorpora solo ese archivo existente mediante `allow_file`. |
| Rutas locales | Una ubicación externa legítima debe funcionar cuando el volumen existe; HOME genérico, archivos ajenos, traversal, UNC, symlinks y reparse points no deben habilitarse. | Allowlist de extensiones de medios/imágenes, ruta absoluta sin `.`/`..`, sin UNC, archivo regular existente, rechazo de componentes symlink/reparse y búsqueda exacta en `media`, `media_artifacts`, outputs video/audio y referencias de evidencia editorial. No se aceptan archivos de texto/exportación. |
| Shell y enlaces | `shell:allow-open` exponía una ruta de apertura más amplia que los enlaces que la UI necesita. | Se quitó el plugin shell de Tauri/Cargo/npm y la capability. El command nativo `open_external_url` permite HTTPS en hosts oficiales exactos de TikTok o rutas legales enumeradas del repositorio; rechaza credenciales, puertos, lookalikes y documentos GitHub no listados. |
| CSP | No había políticas distintas para desarrollo y producción. | `csp` y `devCsp` explícitas; sin `*` ni `unsafe-eval`. `frame-src` solo permite `https://www.tiktok.com`; producción no incluye orígenes Next/HMR; desarrollo limita Next/HMR a loopback. Se mantienen como excepciones exactas `picsum.photos`, `images.unsplash.com` e `i.imgur.com`, ya enumerados por `next.config.ts` para imágenes dinámicas de resultado. |
| Bootstrap Next | El export de producción contiene 2 etiquetas `<script>` inline entre 13 etiquetas de script. La app también genera estilos inline. | Se conserva `'unsafe-inline'` en `script-src`/`style-src` para la salida actual de Next/React; no se habilitó `unsafe-eval`. Sustituirlo por hashes/nonce requiere un contrato de generación verificable que no forme parte de esta corrección. |
| API local | El API ya se enlazaba a `127.0.0.1`, pero CORS no enumeraba los orígenes nativos de Tauri; el validador de URL de sandbox interpretaba autoridades manualmente. | CORS enumera seis orígenes de desarrollo/Tauri; el bind conserva `127.0.0.1`. Se usa el parser URL para rechazar credenciales, puertos personalizados, sufijos engañosos y espacios exteriores. Continúan el bearer de sesión y el límite de cuerpo de 1 MiB. |
| Token y reproductor | Los errores de IPC podían dejar detalles de error junto al intento de obtener un token; los mensajes del iframe requieren identidad de contexto además del payload. | El log de token conserva solo un mensaje genérico. El reproductor acepta `postMessage` únicamente del `contentWindow` actual, origen HTTPS oficial y marca/tipo esperado. |

Todos los call sites frontend de `convertFileSrc` usan `lib/authorized-assets.ts`;
el helper obtiene autorización IPC antes de convertir la ruta. Las rutas de
salida externa nativas se interceptan y pasan por el allowlist; el fallback web
usa `noopener,noreferrer`.

## Verificación local

`npm run verify:mvp` terminó **PASS (13/13)** con la CSP final:

- Rust: 312 pasaron, 0 fallaron, 7 ignorados y 2 filtrados en el conjunto
  principal. Los dos casos de inferencia aislada se omitieron porque
  `PULSAR_LIVE_MODEL_TEST_DIR` no apuntaba a un fixture temporal aislado.
- Python: 39 pasaron; el único skip es la certificación live de TikTok sin URL
  autorizada.
- Tauri security contracts: 7/7; incluyen CSP, scope, shell, allowlist de
  enlaces, autorización de archivos, CORS y postMessage.
- API loopback: PASS; bind `127.0.0.1` únicamente.
- Runtime: 54/54 archivos verificados. Canonical structure, bundle resources,
  frontend secrets, release-tool tests y onboarding: PASS.
- Next.js 16.3.8 export de producción, TypeScript, lint y `cargo fmt --check`:
  PASS. `git diff --check`: PASS; Git solo avisó que normalizará CRLF en algunos
  archivos LF cuando los vuelva a escribir.
- `npm run tauri build -- --bundles nsis` terminó con salida 0 para x64:
  `target-tauri/release/bundle/nsis/Pulsaria_0.1.0-beta.4_x64-setup.exe`,
  688,141,033 bytes, SHA-256
  `FDE2127D8192AE13F9343E172AB7D344E8E0ADCB2AD3758F34B396BCA72CF569`,
  ProductVersion/FileVersion `0.1.0-beta.4`, Authenticode `NotSigned`. Ese
  artefacto local fue build-only y no se ejecutó.
- El commit de workflow `b883ff8b98fbd90e3aeb462eaca30fc79974693c` pasó
  [canonical CI, run 40952005825](https://github.com/danielunibe/PulsarIA/actions/runs/40952005825)
  y [runtime bootstrap + smoke instalado, run 40952005843](https://github.com/danielunibe/PulsarIA/actions/runs/40952005843).
  El segundo generó y probó en `windows-latest` un NSIS efímero Beta 4,
  SHA-256 `8D1733924A9A7FDCDEE76E754FC9864E53916267215AC2FAE32BAEF4B89B01DF`.
  `verify:installed` confirmó instalación y desinstalación (códigos 0),
  manifiesto instalado 54/54, `/health` `ok` para `0.1.0-beta.4` al inicio y
  después del reinicio, WebView2 con perfil aislado, marcador sintético de datos
  preservado tras desinstalar, runtime overrides limpios y cleanup correcto.
  El instalador, `APPDATA`, datos y perfil WebView2 se ubicaron bajo carpetas
  temporales del runner. No se usó `-RunLive`.

## Matriz de regresión TAURI-01…13

| Caso | Estado | Evidencia y límite |
|---|---|---|
| 01 — Tauri/Next abre | PARCIAL — smoke automatizado | Se instaló y arrancó la app desde NSIS en `windows-latest`; WebView2 aislado y `/health` `ok` antes/después de reiniciar. No hubo revisión humana de ventana, contenido o interacción visual. |
| 02 — vídeo local autorizado | PARCIAL | Pruebas sintéticas de referencia persistida y rutas de medios pasan; reproducción en WebView instalada pendiente. |
| 03 — volumen desconectado | PENDIENTE | Se rechaza el archivo que ya no existe y P0-01 conserva la referencia `storage_offline`; no se desconectó una unidad en QA instalada. |
| 04 — TikTok embed/streaming | PARCIAL | URL/iframe oficial y guardas de mensajes tienen pruebas; no hubo reproducción online live. |
| 05 — postMessage falso | PASS automatizado | Prueba TypeScript rechaza origen, source y marcador incorrectos. |
| 06 — archivo no registrado bajo HOME | PASS automatizado | Scope de inicio vacío y prueba SQLite niega path HOME no registrado; queda pendiente probar la denegación desde una WebView instalada. |
| 07 — UNC, symlink y traversal | PASS automatizado | Tests Rust con rutas sintéticas; Windows creó y rechazó un symlink de prueba. No se accedió a shares reales. |
| 08 — búsqueda/transcripción/frames locales | PARCIAL | Regresiones de Rust/Python y autorización de recursos pasan; interacción funcional instalada pendiente. |
| 09 — CSP bloquea origen ajeno | PARCIAL | Test estático de directivas/orígenes, sin wildcard y sin `unsafe-eval`; no se probó el bloqueo de un origen ajeno en la WebView instalada. |
| 10 — enlaces externos controlados | PARCIAL | Casos positivos/negativos de validadores JS/Rust; no se abrió un navegador externo desde la app. |
| 11 — API loopback, token y CORS | PARCIAL | API contract, parser, token y orígenes exactos pasan; `/health` de la app instalada respondió `ok`, pero el flujo IPC/token/CORS desde la UI queda pendiente. |
| 12 — preflight Windows NSIS | PASS automatizado en runner aislado | NSIS x64 Beta 4 instalado/desinstalado en `windows-latest`; recursos 54/54, health/restart y cleanup PASS. No certifica firma, revisión visual ni aceptación de medios/live. |
| 13 — idiomas y accesibilidad | PARCIAL | Contrato es-MX/en-US, onboarding y compilación pasan; teclado, lector de pantalla y revisión visual instalada pendientes. |

## Límites, riesgos y rollback

El asset scope dinámico se amplía solo a rutas registradas que pasan los
validadores y dura lo que dure el proceso Tauri; la revisión del flujo de
reproducción instalada debe confirmar que el estado `storage_offline` permanece
intacto. La URL de avatar/portada que entrega TikTok puede usar un CDN externo
que no se ha observado con datos autorizados; no se añade un dominio genérico
para cubrirlo. Si el QA autorizado confirma un host legítimo, se debe agregar
ese origen exacto y una prueba.

La instalación y el arranque solo ocurrieron en el runner efímero aislado de
GitHub; no se instaló ni lanzó Pulsaria en este equipo. No se leyeron perfiles,
cookies, credenciales, AppData personal, bibliotecas reales ni modelos locales.
El commit focal de seguridad `6ff55a0ec7416c1de3656f2a1b69b9d7cdd9ca91` pasó
canonical y runtime bootstrap/source manifest; el commit de workflow
`b883ff8b98fbd90e3aeb462eaca30fc79974693c` pasó canonical y el nuevo smoke
instalado:

- [canonical del código focal, run 40946292035](https://github.com/danielunibe/PulsarIA/actions/runs/40946292035)
- [runtime bootstrap/source manifest del código focal, run 40946292008](https://github.com/danielunibe/PulsarIA/actions/runs/40946292008)
- [canonical del workflow de smoke, run 40952005825](https://github.com/danielunibe/PulsarIA/actions/runs/40952005825)
- [runtime bootstrap y smoke instalado, run 40952005843](https://github.com/danielunibe/PulsarIA/actions/runs/40952005843)

P1-04 permanece en DOING hasta la aceptación humana/funcional de Windows/WebView
instalada y la matriz pendiente: no hay revisión visual humana, reproducción local,
volumen desconectado, TikTok live ni validación funcional del player. PR #3 sigue
abierto y draft. No se hizo merge, tag, release ni publicación.

Rollback del endurecimiento fuente: `git revert 6ff55a0ec7416c1de3656f2a1b69b9d7cdd9ca91`;
rollback independiente del workflow de smoke: `git revert b883ff8b98fbd90e3aeb462eaca30fc79974693c`,
ambos en `codex/pulsaria-beta4-prep`, sin reset ni force-push.
