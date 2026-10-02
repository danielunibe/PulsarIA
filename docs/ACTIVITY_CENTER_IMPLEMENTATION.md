# Pulsaria Activity Center — implementación acotada

Fecha: 2026-09-20

## Superficie activa actual

`ActivityCenter` conserva los mappers y el contrato de actividad para los
estados reales, pero ya no se monta como un panel permanente en el sidebar.
La superficie activa es `components/NotificationsPopover.tsx`, abierta desde
el slot de campana que antes ocupaba Actividad. Así se libera el espacio de la
ingesta y los cambios del pipeline se muestran como notificaciones compactas,
con reintento y acceso a la Biblioteca cuando corresponde.

## Arquitectura encontrada

La ingesta canónica ya converge en `jobs` de SQLite y en `QueueService`:

```text
URL / fuente TikTok existente
  -> jobs.status = queued
  -> QueueService
  -> Python worker: metadata -> download -> audio -> transcription
  -> visual analysis / generated outputs
  -> Rust persistence
  -> HNSW/BM25 indexing
  -> jobs.status = complete
```

El worker Python ya entrega progreso real por STDOUT JSON. Rust lo normaliza y
persiste en `jobs.status` y `jobs.progress`. Los reintentos existentes usan
backoff y `error_dlq`; el arranque reconcilia trabajos pendientes y el
scheduler marca trabajos stale que no tienen una reclamación activa.

La interfaz previa mostraba solo trabajos activos en `QueueSection` dentro del
sidebar. No había una timeline persistida por trabajo, pausa global, cancelación
segura ni un contrato de fuente enriquecido para cada job.

## Cambios realizados

- `components/ActivityCenter.tsx`: evolución de la cola a Actividad, filtros
  compactos, orden de errores/activos/cola/completados, progreso real,
  empty-state e inspector lateral embebido.
- `lib/activity.ts`: mapper central de estados internos a lenguaje de usuario,
  origen derivado de la URL real y utilidades de filtrado/ordenación.
- `components/Sidebar.tsx`: el slot existente de Actividad se conserva como
  campana y abre `NotificationsPopover`; el panel permanente ya no se muestra
  debajo de la ingesta.
- `hooks/use-jobs.ts`: tipo de eventos y lectura por IPC o gateway local.
- `src-tauri/src/db.rs`: tabla `job_activity_events`, índice por trabajo y
  registro de transiciones significativas, reintentos, errores técnicos y
  códigos de error. Los cambios de porcentaje dentro del mismo estado no
  generan ruido de timeline.
- `src-tauri/src/commands.rs` y `src-tauri/src/main.rs`: comando IPC
  `get_job_activity`.
- `src-tauri/src/api/gateway.rs`: lectura REST local
  `GET /api/v1/jobs/:job_id/activity`.
- `docs/ACTIVITY_CENTER_IMPLEMENTATION.md`: este contrato y límites.

## Estados reales utilizados

No se añadieron enums paralelos. El mapper consume los estados actuales:

`queued`, `metadata`, `downloading`, `processing`, `extracting_audio`,
`transcribing`, `indexing`, `retrying`, `complete`, `completed`, `done`,
`error`, `error_dlq`, `failed`, `failure`, `cancelled` y `canceled`.

Los porcentajes solo se muestran cuando `jobs.progress` entrega un valor real;
los estados sin progreso determinable se presentan como estado, sin porcentaje
inventado.

## Eventos y persistencia

La timeline persistida registra:

- creación en `queued`;
- cambios de estado del job;
- reintentos en `retrying`;
- vuelta a `queued` cuando el usuario reintenta;
- fallos terminales y stale con `user_message`, `technical_error` y
  `error_code`.

La tabla no es un log de métricas de alta frecuencia. La retención detallada
por trabajo sigue pendiente de una política de producto; el siguiente paso
sería conservar un número acotado de checkpoints por job y retener errores
terminales durante más tiempo.

## Integraciones y acciones

- La URL manual sigue usando `add_job` y el pipeline existente.
- El botón de retry llama al `retry_job` actual; no crea una segunda cola.
- Un trabajo completo puede abrirse en la Biblioteca real mediante el mismo
  `activeVideoId` de la aplicación.
- La actividad se actualiza usando la reconciliación existente de `useJobs`
  y sus eventos nativos ya registrados, con polling adaptativo como respaldo.

Cancelación, prioridad y pausa global no se presentan en la UI: el backend
actual no expone contratos seguros para detener un worker, reordenar FIFO o
impedir nuevas admisiones sin afectar dependencias. Implementarlas visualmente
sería una falsa capacidad.

## Fuentes y duplicados

El origen visible de esta primera entrega se deriva de la URL real (`TikTok ·
Enlace` u hostname). El modelo de fuentes TikTok ya existente se conserva, pero
la asociación explícita `sourceType/sourceId/sourceLabel` por job todavía no se
ha conectado al registro de actividad. La deduplicación sigue siendo la de
`canonical_url`; no se reclasifica un duplicado como error desde la UI.

## Recovery y stale

Se reutilizan la reconciliación al inicio, `repair_library`, el scheduler de
stale jobs y el retry existentes. La timeline registra stale como
`PIPELINE_STALE` cuando el scheduler lo marca. No se añadió un Recovery Engine
paralelo.

## Validación

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS; Next compiló y `prepare-tauri-frontend.mjs` terminó.
- `cargo check --manifest-path src-tauri/Cargo.toml`: PASS; permanece únicamente
  el warning del compilador C++ de `esaxx-rs` sobre `-std=c++11`.
- Test nuevo `db::tests::activity_timeline_records_real_transitions_and_errors`:
  PASS.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 76 PASS, 0 FAIL.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: PASS.
- `npm run verify:frontend-a11y`: PASS después de añadir la campana y el
  popover.

## Estado final

| Área | Estado | Límite exacto |
| --- | --- | --- |
| Integración con pipeline | PASS | Actividad lee los jobs canónicos y sus estados reales |
| Estado en tiempo real | PARTIAL | Reconciliación/eventos existentes + polling adaptativo; no hay bus de actividad dedicado |
| Timeline | PASS parcial | Persistida para transiciones nuevas; trabajos históricos pueden no tener eventos |
| Recovery | PARTIAL | Se reutilizan startup repair/stale/retry; falta prueba de restart live |
| UI | PASS técnico | La captura browser confirma campana, popover y caja de Fuentes; falta aceptación visual nativa con trabajos live |
| Fuentes automáticas | PARTIAL | Se conserva la infraestructura TikTok, pero falta source provenance por job |
| Pause/cancel/priority | BLOCKED_EXTERNAL | No existe contrato backend seguro |
| Tests | PARTIAL | Test nuevo pasa; suite completa queda bloqueada por fixture local ajeno |
| Overall | PARTIAL | Primera fase funcional sin simulaciones, con límites declarados |
