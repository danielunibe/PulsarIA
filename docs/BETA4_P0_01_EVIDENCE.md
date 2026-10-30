# Beta 4 — evidencia del gate P0-01

**Fecha:** 2026-10-28
**Alcance:** integridad SQLite, reconciliación de almacenamiento y recuperación de cola.
**Estado:** PASS en verificación local y CI del commit de implementación.

## Punto de partida y límites

- Repositorio: `danielunibe/PulsarIA`, rama `codex/pulsaria-beta4-prep`.
- HEAD de partida y de PR #3 antes de estos cambios:
  `3111dcc5f5f2b74e332f4f5d1b8a02c5e56c13c2`.
- Commit de implementación publicado:
  `253fa1dfd88dfeae9dcdbec9ba2006c01ffc4141`.
- PR #3 continúa abierto como draft, con base `main` en
  `d743d1d5d06f1f43fc49eb0f3c672149b9ce5d91`.
- Se creó la rama local de restauración `p0-01-start-3111dcc5`.
- Las pruebas usaron bases de datos temporales aisladas por `PULSAR_DATA_DIR`
  y un `PULSAR_RUNTIME_ROOT` temporal vacío. No se consultó ni modificó el
  perfil de usuario, una biblioteca de videos, una instalación o modelos
  personales. No se instaló la app, no se creó tag/release y el PR no se integró.
- `npm run build` reemplazó `out/`; se movió la salida del build a una carpeta
  temporal y se restauró el `out/` previo (111 archivos, 37,894,701 bytes).

## Causas y correcciones

1. `repair_library()` rebajaba procesos interrumpidos a `queued` y podía
   restablecer `retry_count`, mientras la recuperación del arranque admitía
   indiscriminadamente filas `queued` antiguas. Ahora preserva el contador,
   marca los estados activos interrumpidos como `retrying`, y la admisión
   automática se limita a estados recuperables. Una fila histórica `queued` se
   mantiene pendiente; un reintento solicitado por el usuario conserva su
   contador y se procesa bajo los gates existentes.
2. La detección basada en errores de metadatos confundía un medio ausente con
   una unidad desconectada o una ubicación inaccesible. La reparación ahora
   registra `unavailable` cuando el almacenamiento accesible confirma la
   ausencia y `storage_offline` cuando no se puede consultar el volumen. Una
   referencia reaparece como local cuando el medio vuelve a estar disponible.
3. La reconciliación eliminaba registros de artefactos/salidas por no poder
   acceder a sus archivos y podía perder referencias de purga. Ahora conserva
   las filas, actualiza tamaños solo para archivos accesibles bajo la raíz
   autorizada y rechaza actualizar rutas externas a esa raíz. Los medios
   externos y las fichas con transcripción sobreviven a la reconciliación.

No se añadió tabla ni migración de esquema. La reparación de biblioteca es
transaccional e idempotente. El frontend expone el estado offline y no trata una
ruta inaccesible como reproducible.

## Archivos modificados

- Persistencia y arranque: `src-tauri/src/db.rs`, `src-tauri/src/main.rs`.
- Admisión y reintento explícito: `src-tauri/src/application/queue_service.rs`,
  `src-tauri/src/commands.rs`, `src-tauri/src/api/gateway.rs`.
- Estado visible de la fuente: `components/ActivityCenter.tsx`,
  `components/CinemaPlayback.tsx`, `components/EvidenceSourceInspector.tsx`,
  `components/ExpandedVideoModal.tsx`, `components/SettingsPanel.tsx`,
  `components/VideoGrid.tsx`, `lib/i18n.tsx`, `types/index.ts`.
- Las pruebas de modelos simulados usan archivos placeholder diminutos en un
  directorio `%TEMP%` único. Las pruebas de inferencia real solo aceptan modelos
  en una ruta temporal explícita mediante `PULSAR_LIVE_MODEL_TEST_DIR`.
- Documentación: `PROJECT_TRUTH.md`, `docs/MVP_STATUS.md`,
  `docs/BETA4_ACCEPTANCE.md` y esta evidencia.

## Matriz DB-01…DB-12

| ID | Escenario y evidencia | Resultado |
| --- | --- | --- |
| DB-01 | `repair_preserves_retry_budget_and_missing_media_references`; `restart_resume_never_exceeds_the_persisted_retry_budget` | PASS — retiene `retry_count` y no excede el máximo. |
| DB-02 | Reparación repetida en `repair_preserves_retry_budget_and_missing_media_references`; `concurrent_recovery_claims_a_job_only_once` | PASS — segunda pasada no reactiva ni duplica la admisión. |
| DB-03 | Regresión del estado `complete` en `repair_preserves_retry_budget_and_missing_media_references` | PASS — estado, error histórico y contador no se alteran. |
| DB-04 | `restart_admission_excludes_historical_queued_and_terminal_jobs`; `profile_admission_waits_for_current_rights_consent` | PASS — no se reanuda histórico sin la admisión vigente. |
| DB-05 | `repair_preserves_external_storage_reference_and_restores_it_when_reconnected` | PASS — conserva rutas y marca `storage_offline`. |
| DB-06 | La misma prueba simula que vuelve el medio externo | PASS — la referencia se reconoce como `local`. |
| DB-07 | `repair_preserves_retry_budget_and_missing_media_references`; `storage_reconciliation_refreshes_sizes_and_preserves_missing_references` | PASS — marca falta confirmada y conserva las referencias. |
| DB-08 | `repair_keeps_transcript_only_library_records` | PASS — la ficha y transcripción sobreviven sin video. |
| DB-09 | Pruebas de reconciliación cubren raíz vigente, salida recuperable y referencias fuera de raíz | PASS — respeta la raíz permitida y conserva referencias. |
| DB-10 | Segunda llamada a `repair_library()` en la regresión de reintentos | PASS — sin cambios adicionales en estado, rutas o contador. |
| DB-11 | `repair_rolls_back_the_whole_library_update_on_sql_error` | PASS — una falla sintética revierte la transacción completa. |
| DB-12 | `migrates_a_legacy_database_after_creating_a_backup` | PASS — preserva rutas, transcripción, retry count, relación y backup. |

La suite focal de DB ejecutó 47 PASS, 0 fallidas y 1 ignorada. La suite de
QueueService ejecutó 8/8 PASS. La suite Rust integral reportó 289 PASS, 0
fallidas, 7 ignoradas y 2 casos filtrados del bloque general para ejecución
aislada.

## Verificación local reproducida

`npm run verify:mvp` terminó con **PULSARIA MVP AUTOMATED GATES: PASS (13/13)**.

- Lint, TypeScript, locale contract y producción Next 16.3.8: PASS.
- 13 regresiones Node de ventanas/perfiles: PASS.
- `cargo fmt --check`, `cargo check` y Rust: PASS.
- Python: 33 PASS; 1 certificación live omitida porque no se suministró URL.
- Frontera de secretos, API loopback, estructura canónica: PASS.
- Contratos de release, bootstrap simulado, runtime 54/54 y onboarding: PASS.
- `git diff --check`: PASS antes del commit.
- Los dos casos de inferencia llama-server/modelos se ejecutaron en aislamiento y
  reportaron `SKIPPING`: no había runtime/modelos de fixture en `%TEMP%`. Su
  comportamiento live no está certificado por este resultado.
- Next detectó el archivo `.env` por convención de build; no se inspeccionaron
  ni se incluyeron valores en la evidencia o en los cambios.

## Publicación y seguimiento

- Commit de implementación:
  `253fa1dfd88dfeae9dcdbec9ba2006c01ffc4141`.
- PR: [#3](https://github.com/danielunibe/PulsarIA/pull/3); draft y abierto.
- GitHub Actions para el commit de implementación: **PASS** — [Pulsaria
  canonical CI, run 40809853683](https://github.com/danielunibe/PulsarIA/actions/runs/40809853683)
  y [runtime bootstrap preflight, run
  40809853328](https://github.com/danielunibe/PulsarIA/actions/runs/40809853328).
- Trello: tarjeta `GATE P0-01 — Integridad SQLite y recuperación segura · Beta
  4`:
  [abrir tarjeta](https://trello.com/c/W3yiPlmi/833-gate-p0-01-integridad-sqlite-y-recuperaci%C3%B3n-segura-beta-4).

## Riesgos residuales y reversión

- Una unidad que reaparece con otra letra no se remapea automáticamente; la
  ruta original queda conservada y puede requerir reubicar el almacenamiento
  mediante el flujo de usuario.
- Los casos live con llama-server, la aceptación de Windows limpio, actualización
  instalada y revisión visual/humana siguen fuera de esta evidencia.
- Revertir el commit con `git revert <sha>` no necesita revertir una migración de
  esquema. Si se ejecuta un binario anterior, puede recuperar trabajos históricos
  `queued` con la política antigua; hacer downgrade requiere volver a verificar
  estado de cola y compatibilidad.
- El estado de cierre de P0-01 y el último SHA del PR se mantienen en Trello y
  GitHub; la aceptación instalada y los gates posteriores son evaluaciones
  distintas y no se infieren de esta evidencia.
