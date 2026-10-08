# Pulsaria — línea base de cierre del MVP

## Revalidación actual — 2026-10-08

- La reparación del lateral y el panel de carga está documentada en
  [SIDEBAR_REPAIR_2026-10-08.md](SIDEBAR_REPAIR_2026-10-08.md). La evidencia
  registrada incluye `verify:mvp` **13/13 PASS**, Chromium a 1280 × 800 y
  860 × 640, y una comprobación nativa parcial de cierre/reapertura. La
  inspección visual nativa completa y el procesamiento live desde UI/IPC siguen
  pendientes.
- En la revalidación local registrada antes de esa reparación, `main` estaba
  en `0fb478a778690f6fd6dcea8f2135cc78a5e14b79`, subido a `origin/main`.
  [GitHub Actions](https://github.com/danielunibe/PulsarIA/actions/runs/37764524583)
  terminó PASS en tooling, estructura, frontend, Rust source-only y Python.
  Es evidencia de ese commit; no sustituye los gates ejecutados sobre el árbol
  posterior.
### Evidencia anterior a la reparación del 2026-10-08

Los datos siguientes conservan la referencia de la instalación y el bundle
anteriores; para la reparación más reciente consulta el informe enlazado arriba.

- NSIS Release `Pulsaria_0.1.0-beta.3_x64-setup.exe`: 690,403,441 bytes,
  SHA-256 `057580000AA8DE9D872756697C9321ECF9DDF7DFE6351158867BE6E24D0CBF77`,
  `NotSigned` según la ruta de descarga directa. Smoke instalado: install/uninstall
  0, health y reinicio correctos, recursos 54/54, 13 documentos legales,
  aislamiento y datos sintéticos preservados; sin ingestión/búsqueda live.
- App instalada abierta y health `ok`, `0.1.0-beta.3`. Los logs de desarrollo y
  AppData ya no conservan tokens de sesión; se sanearon 31 valores históricos.
- Última instantánea inspeccionable: 31 jobs y 31 medios; SQLite
  `integrity_check=ok` y 174 referencias foráneas. El mapeo del snapshot asocia
  74 trabajos ausentes con contenido e historial (54 `queued`, 20 `error`). La
  base activa sigue abierta y no se modificó; restaurar las filas `queued`
  provocaría reanudación automática. El detalle normativo está en
  [PROJECT_TRUTH.md](../PROJECT_TRUTH.md).

No están cerradas la inspección visual nativa completa, el procesamiento TikTok
con voz reconocible desde UI/IPC, la reconciliación de la base viva ni la
aceptación del artifact exacto en host limpio. Un smoke anterior completó sin
transcripción. `DIRECT_DOWNLOAD_RELEASE_READY=false`; no se publicó la Beta 3.

Estado de publicación: Beta 3; corte de lanzamiento descrito en
`PROJECT_TRUTH.md`. Consulta
[BETA3_RELEASE_EVIDENCE.md](BETA3_RELEASE_EVIDENCE.md) y
[BETA3_ACCEPTANCE.md](BETA3_ACCEPTANCE.md) para los resultados actuales y
pendientes de publicación. La matriz fechada debajo corresponde a la línea
base histórica de 2026-09-13, no al instalador Beta 3.

Fecha de la línea base histórica: 2026-09-13

## Revalidación local histórica — 2026-10-07

- Checkout validado: `main`, HEAD `6f6b7b07671f250ddba654a26faf75bc64f53419`;
  `origin/main` estaba 13 commits detrás en `add562e742e6a789606dc972991c29b07ce88da2`.
- `npm run verify:mvp`: PASS, 13/13 gates. Next.js 16.3.8 compiló y prerenderizó
  las rutas; TypeScript, lint, locale, Rust fmt/check y contratos de seguridad
  pasaron.
- Rust: 279 pruebas PASS, 0 fallos y 5 ignoradas. Python: 32 casos en total,
  31 PASS y 1 omitido porque esta ejecución no recibió una URL TikTok live.
- Runtime source manifest: 54/54 archivos presentes; FFmpeg, FFprobe y su aviso
  de licencia verificados. No se ejecutó aceptación visual nativa ni smoke live
  desde la aplicación instalada; tampoco se certificó CI o un artefacto de
  release con esta ejecución local.

Este documento es la matriz operativa del MVP local. El checkout actual contiene
cambios locales intencionales, archivos nuevos y eliminaciones; no se debe usar
`git reset`, `git clean` ni sobrescribir trabajo para obtener una línea base.

## Autoridad

- Punto de comparación: `b95a971c`.
- Fuente vigente: código actual + comandos reproducidos.
- `MVP.md` y auditorías anteriores se conservan como trazabilidad, no como
  prueba de estado actual.
- Alcance: Windows local, interfaz español/inglés y fuentes TikTok.

## Gates actuales

| Gate | Estado inicial | Criterio de cierre |
|---|---|---|
| Frontend lint | PASS | `npm run lint` |
| TypeScript | PASS | `npm run typecheck` |
| Locale contract | PASS | `scripts/verify-locale.ps1`; `es-MX` default, `en-US` persistence and selectors |
| Next build | PASS | `npm run build` |
| Rust formato | PASS | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` |
| Rust check | PASS | `cargo check --manifest-path src-tauri/Cargo.toml` |
| Rust tests | PASS | 56 pruebas, 0 fallos |
| Python contracts | PASS | 26 pruebas; skip live intencional sin URL |
| Runtime manifest | PASS | 51/51 archivos canónicos y FFmpeg/FFprobe verificados |
| Bundle instalado | PASS build + arranque Release / PARTIAL MSI | NSIS Release `Pulsaria_0.1.0_x64-setup.exe`: `C1B8683BA5D5137DB319B68D2F849FCF629EB9F6F19D1607D80D30FE0F7D90B8`, 580,906,561 bytes; arranque Release con base existente y regresión de migración 61/61. MSI Release `Pulsaria_0.1.0_x64_en-US.msi`: `183626C56615DC3845D80C1692E819DD911A1CC15CC11DF609C03CDB70089828`, 707,754,713 bytes; requiere repetir smoke en host elevado |
| Smoke MSI instalado | BLOCKED_EXTERNAL | `-Bundle msi` alcanza `msiexec` pero el paquete Tauri es `perMachine`; este host no está elevado y devuelve 1603/Error 1925. Repetir en un host Windows x64 con administrador |
| Contrato Gemini | PASS local condicionado | `generate_gemini_response` por IPC nativo; tests de clave ausente, header, prompt, respuesta vacía, HTTP y timeout; no se ejecuta sin clave autorizada |
| Artefactos de release pública | BLOCKED_EXTERNAL | El build y smoke NSIS local están verificados, pero `latest.json`, `.sig`, clave Tauri, runtime externo reproducible y Authenticode requieren configuración de GitHub Environment/secretos |
| Pipeline TikTok live | PASS parcial | NSIS `D69B6908…`: job real completo, exportación de `mp4/mp3/txt`, deduplicación, URL inválida, shapes de búsqueda, staging limpio y persistencia tras reinicio; la muestra no produjo texto reconocible |

## Cambios protegidos

Antes de cada fase se debe revisar `git status --short` y separar:

- estabilización de frontend/Rust/Python;
- recursos y scripts de empaquetado;
- documentación y evidencia;
- artefactos generados;
- eliminaciones que no pueden asumirse como limpieza.

No se deben eliminar demos ni slots visuales hasta confirmar que la biblioteca
real se hidrata correctamente y que los estados fallidos no se ocultan.

## Evidencia reproducida

- `npm run verify:mvp`: PASS; 13/13 gates, incluyendo formato Rust, contrato
  canónico, contrato español/inglés y contrato de recursos.
- `pwsh -File scripts/verify-installed-bundle.ps1 -Configuration debug -RunLive`:
  PASS con NSIS SHA-256
  `D69B690811B71579018FDCE980379E2707397DF6BBB688C25288017A8D0AE44E`;
  instalación 0, recursos 8/8, manifest 51/51, health antes/después del
  reinicio, desinstalación 0 y limpieza temporal correcta. El proceso se
  ejecutó sin `PULSAR_DATA_DIR`, con `%APPDATA%` temporal y `PATH` vacío:
  `usesAppDataFallback=true`, `pathCleared=true` y
  `externalRuntimeOverridesCleared=true`; el staging de un job completado
  quedó sin archivos (`clean=true`).
- El smoke live del mismo NSIS `D69B6908…` completó `job_id=1` al 100%, generó MP4 de
  2,953,029 bytes, MP3 de 60,936 bytes y `text.txt` de 0 bytes como exportación
  válida para transcript vacío; conservó análisis visual/instructivo, el job tras
  reinicio, devolvió `existing` para la URL duplicada, HTTP 400 para URL inválida
  y shape válido para búsqueda literal/semántica. Falta certificar un TikTok con
  voz reconocible.
- `cargo test --manifest-path src-tauri/Cargo.toml`: PASS, 56 pruebas; incluye
  migración, cuota, purga explicable y undo físico seguro, reconciliación de
  referencias/tamaños, recencia, artifacts, loopback, LLM local y contrato
  Gemini nativo.
- El contrato Python adicional confirma que metadata de duración `0` fuerza
  la consulta a `ffprobe`, y que el preflight falla antes de red si falta
  FFmpeg o FFprobe.
- `npm run verify:local-llm`: PASS; sidecar llama.cpp y manifiesto fijado
  presentes, sin modelo GGUF incluido en el bundle.
- `npm audit --omit=dev`: BLOCKED por 2 vulnerabilidades de producción; el
  experimento aislado Next 16.3.5/audit 0 no se ha promovido a `main`.
- `npm run verify:release-artifacts -- -ArtifactRoot target-tauri/release/bundle`:
  BLOCKED_EXTERNAL porque el build local no genera `latest.json` ni firmas
  `.sig`; no se fabricaron firmas ni se habilitó el updater para cerrar
  artificialmente ese gate fuera de alcance.
- La validación visual de la ventana Tauri instalada y el cambio de idioma con
  clics reales todavía requieren revisión asistida en el equipo objetivo; el
  smoke de proceso/API no prueba composición, foco ni render nativo.

## Orden de cierre

1. Gates técnicos y estados del onboarding.
2. Selector persistente de idioma e interfaz traducible.
3. Bundle determinista con FFmpeg/FFprobe y manifiesto actualizado.
4. Smoke instalado con TikTok real, búsqueda, reinicio, duplicado y aislamiento
   de datos persistentes.
5. Salud, recuperación, accesibilidad y revisión de viewports nativos.

OCR, benchmark de Whisper con voz reconocible, aceptación visual nativa,
nuevas plataformas y release firmada permanecen fuera del cierre automatizado
actual. La IA local y Gemini opcional tienen contratos separados y no son
requisitos para arrancar offline.
