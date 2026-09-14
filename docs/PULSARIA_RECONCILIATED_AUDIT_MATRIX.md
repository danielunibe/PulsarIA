# Pulsaria — matriz reconciliada de auditoría

Fecha: 2026-09-13  
Base de contraste: checkout actual; el informe de Claude se conserva como
histórico en `audit/claude/` y no sustituye al código ni a los gates reproducidos.

Estados:

- `COVERED`: la corrección o la prueba existe en el checkout actual.
- `STALE`: el hallazgo no describe el checkout actual; no requiere parche.
- `ACTIVE`: sigue pendiente dentro del alcance local-first TikTok.
- `BLOCKED_EXTERNAL`: requiere credenciales, servicios, host o artefactos externos.
- `DEFERRED_PRODUCT`: decisión fuera del alcance del MVP actual.

| ID | Hallazgo resumido | Estado actual | Evidencia / siguiente acción |
| --- | --- | --- | --- |
| PUL-AUD-001 | Updater desactivado en la configuración base | BLOCKED_EXTERNAL | Correcto para builds locales del MVP; activar solo con endpoint, pubkey y firma reales. |
| PUL-AUD-002 | Redis obligatorio para la caché desktop | COVERED | `SemanticCache` es LRU en memoria con TTL, límite y métricas; Redis fue retirado de Cargo y del arranque. |
| PUL-AUD-003 | `.env` trackeado con rutas personales | STALE | `.env` está ignorado y no aparece en `git ls-files`; conservar el override local. |
| PUL-AUD-004 | `commands.rs` es un God Module | ACTIVE | Refactor por servicios de storage, settings, playlists, import/export y mantenimiento. |
| PUL-AUD-005 | `SettingsPanel.tsx` es demasiado grande | PARTIAL | Ya carga bajo demanda; queda dividirlo por secciones sin romper sus contratos públicos. |
| PUL-AUD-006 | Paths de snapshots HNSW incompatibles | STALE | El código normaliza la base antes de formar `vector_index_shard_N.hnsw`; hay pruebas single/multi-shard de round-trip. |
| PUL-AUD-007 | Tipos de dominio duplicados | COVERED | `JobRecord`, `SearchResult` y `SearchConfig` tienen autoridad en `domain/models.rs`; DB/commands reexportan o mapean. |
| PUL-AUD-008 | Restricción TikTok no visible en la documentación/UI | COVERED | Add Links declara videos, perfiles, favoritos y colecciones TikTok; los errores distinguen plataforma y formato. |
| PUL-AUD-009 | Preflight incompleto de Python/FFmpeg/modelos | PARTIAL | Ahora prueba python.exe, imports de workers, FFmpeg, FFprobe, tokenizer y modelos; falta timeout/cancelación ONNX independiente. |
| PUL-AUD-010 | Auto-updater sin endpoint configurado | BLOCKED_EXTERNAL | No se debe fabricar un endpoint ni habilitar publicación sin infraestructura y secretos reales. |
| PUL-AUD-011 | API loopback sin autenticación por proceso | COVERED | Token JWT aleatorio por proceso, comando IPC nativo y Bearer en REST; health queda público. |
| PUL-AUD-012 | Dimensión 384 duplicada | COVERED | `EMBEDDING_DIMS` único en `domain/models.rs`, usado por embedding, HNSW, persistencia y comandos. |
| PUL-AUD-013 | `ort` RC y `download-binaries` | ACTIVE | Evaluar en rama aislada con compatibilidad DirectML, tokenizer y runtime preparado. |
| PUL-AUD-014 | Sin versionado del modelo de embeddings | COVERED | Migración v7 con modelo, hash de modelo/tokenizer, dimensión y fecha; discrepancia marca el índice obsoleto. |
| PUL-AUD-015 | `unwrap` en producción | COVERED | Gateway usa constructores infalibles explícitos; los `expect` restantes reportados están en fixtures/tests. |
| PUL-AUD-016 | `app/page.tsx` es un God Component | ACTIVE | Extraer búsqueda, onboarding, selección, cine y configuración en una onda dedicada. |
| PUL-AUD-017 | Inferencia ONNX sin timeout | PARTIAL | `PULSAR_ONNX_TIMEOUT_MS` ejecuta la inferencia en `spawn_blocking` y devuelve error accionable; falta prueba de timeout y aislamiento/cancelación. |
| PUL-AUD-018 | Distributed mode compilado en desktop | PARTIAL | La activación depende de `cfg!(feature = "distributed")`; los módulos aún se compilan y falta probar ambos perfiles. |
| PUL-AUD-019 | Reindex nocturno no coordina la cola | PARTIAL | Manual y nocturno comparten gate de mantenimiento y no empiezan con jobs activos; falta una prueba de carrera contra una admisión real de worker. |
| PUL-AUD-020 | Bind inseguro del servidor de métricas | STALE | El bind vigente es loopback; el gate API confirma `127.0.0.1` exclusivamente. |
| PUL-AUD-021 | Faltan índices SQL | STALE | `init_db()` ya crea índices requeridos; no añadir una migración artificial. |
| PUL-AUD-022 | Ruta personal del desarrollador en Git | STALE | Derivaba del falso positivo de `.env` trackeado; clasificar archivos no rastreados antes de cualquier limpieza. |
| PUL-AUD-023 | Sin Error Boundaries React | PARTIAL | Boundary raíz y límites funcionales con reintento/recarga; existe gate estático de accesibilidad, pero falta harness E2E para teclado, foco y recuperación visual. |
| PUL-AUD-024 | `rebuild_index` sin coherencia HNSW/SQLite | PARTIAL | Rebuild temporal, conteo, metadata exacta, lectura posterior y commit multi-shard con rollback; falta probar fallo inducido durante commit y restauración del snapshot anterior. |
| PUL-AUD-025 | Onboarding desconectado end-to-end | STALE | `verify:onboarding` pasa el contrato legal, progresivo, focusable, radio y navegación. |
| PUL-AUD-026 | Bundle FFmpeg full demasiado grande | ACTIVE | Preparar y validar bundle essentials externo; no reemplazar los binarios canónicos sin hashes/licencia. |
| PUL-AUD-027 | `.env` expone datos personales | STALE | Mismo falso positivo que PUL-AUD-003; `.env` permanece local e ignorado. |
| PUL-AUD-028 | Complejidad distribuida sin beneficio desktop | ACTIVE | Feature gate y auditoría de imports/legacy antes de eliminar o mover archivos. |
| PUL-AUD-029 | Falta límite/canonicalización de URL | PARTIAL | REST e IPC comparten límite 2.048, whitelist HTTPS TikTok y mensajes diferenciados; falta una prueba de integración Tauri específica para URL sobredimensionada. |
| PUL-AUD-030 | Falta VACUUM automático | DEFERRED_PRODUCT | Mantener mantenimiento manual explícito; automatizarlo requiere política de disco y no es necesario para el MVP. |

## Gates reproducidos tras la reconciliación

- `npm run verify:mvp`: `PASS`, 13/13 gates.
- `cargo test --manifest-path src-tauri/Cargo.toml`: `PASS`, 60/60 pruebas.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: `PASS`.
- Python: `PASS`, 26 pruebas y un skip live intencional sin URL autorizada.
- Runtime canónico: `PASS`, 51/51 recursos.
- Frontend accessibility contract: `PASS`, boundary, dialog, labels, focus-visible y excepciones de imagen revisadas.

Estos resultados no constituyen evidencia de aceptación visual nativa, descarga
live autorizada, instalación MSI elevada, firma, updater o publicación.
