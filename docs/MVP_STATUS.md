# Pulsaria — línea base de cierre del MVP

Fecha de actualización: 2026-09-13

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
| Rust tests | PASS | 40 pruebas, 0 fallos |
| Python contracts | PASS | 18 pruebas; skip live intencional sin URL |
| Runtime manifest | PASS | 50/50 archivos canónicos y FFmpeg/FFprobe verificados |
| Bundle instalado | PASS previo a esta consolidación | NSIS release vigente `77095348…` fue generado antes de retirar recursos duplicados; requiere reconstrucción con el `tauri.conf.json` canónico |
| Artefactos de release pública | BLOCKED_EXTERNAL | `target-tauri/release/bundle` y firmas del updater requieren build release/credenciales de firma; updater y Authenticode permanecen fuera del MVP local |
| Pipeline TikTok live | PASS parcial | Release `77095348…`: job real, deduplicación, URL inválida, shapes de búsqueda y persistencia; reintento de un job fallido y búsqueda UI requieren smoke asistido |

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

- `npm run verify:mvp`: PASS; 12/12 gates, incluyendo formato Rust, contrato
  canónico y contrato español/inglés.
  español/inglés.
- `pwsh -File scripts/verify-installed-bundle.ps1 -Configuration release`: PASS
  con NSIS SHA-256
  `77095348AA234D1152000A34DD02258DF68D9C8E5FF5267701063483FB12DB13`;
  recursos 8/8, manifest 56/56, health antes/después del reinicio,
  desinstalación 0 y limpieza temporal correcta. Este artefacto es anterior a
  la publicación canónica y debe reconstruirse para release.
- `pwsh -File scripts/verify-installed-bundle.ps1 -Configuration release -RunLive`:
  PASS; `job_id=1` completó al 100%, generó video MP4, audio MP3, análisis
  visual e instructivo, conservó el job tras reinicio, devolvió `existing` para
  la URL duplicada, HTTP 400 para URL inválida y shape válido para búsqueda
  literal/semántica. La transcripción durable quedó en 0 bytes para el video
  seleccionado, por lo que aún falta certificar un TikTok con voz reconocible.
- `npm run verify:release-artifacts -- -ArtifactRoot target-tauri/release/bundle`:
  BLOCKED_EXTERNAL porque el build local no genera `latest.json` ni firmas
  `.sig`; no se fabricaron firmas ni se habilitó el updater para cerrar
  artificialmente ese gate fuera de alcance.
- La validación visual de la ventana Tauri instalada y el cambio de idioma con
  clics reales todavía requieren revisión asistida en el equipo objetivo.

## Orden de cierre

1. Gates técnicos y estados del onboarding.
2. Selector persistente de idioma e interfaz traducible.
3. Bundle determinista con FFmpeg/FFprobe y manifiesto actualizado.
4. Smoke instalado con TikTok real, búsqueda, reinicio, duplicado y reintento.
5. Salud, recuperación, accesibilidad y revisión de viewports.

OCR, benchmark de Whisper, generación local completa, nuevas plataformas y release firmada
permanecen fuera del cierre del MVP local.
