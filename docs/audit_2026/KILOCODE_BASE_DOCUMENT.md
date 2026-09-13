# 🚀 KILOCODE — DOCUMENTO BASE DE DESARROLLO AUTÓNOMO EN BUCLE
## Pulsaria · Orquestador de Múltiples Agentes y Ejecución Continua
### Ubicación: `C:\\Users\\danie\\Desktop\\Pulsaria\\docs\\audit_2026\\KILOCODE_BASE_DOCUMENT.md`

---

> **INSTRUCCIÓN SUPREMA PARA AGENTES KILO CODE:**
> Estás operando en **modo orquestador autónomo multi-agente**. Tu misión es tomar este documento base, consultar los documentos de auditoría referenciados en `docs/audit_2026/` y ejecutar las tareas de programación en bucle secuencial atómico sin detenerte a pedir confirmación entre pasos.
>
> **Reglas de Seguridad Inviolables:**
> 1. No intentes elevación de privilegios fuera del diálogo estándar UAC (`Start-Process -Verb RunAs`).
> 2. No elimines `lib/mock-data.ts` ni alteres `INACTIVE_SLOTS_COUNT` (sostienen el layout visual).
> 3. Realiza un snapshot de `data/library.db` antes de modificar esquemas SQL.
> 4. Tras cada cambio, ejecuta los gates de verificación:
>    - Frontend: `npx tsc --noEmit`
>    - Backend: `cargo check` (en `src-tauri`)

---

## 📋 ÍNDICE DE AUDITORÍA CONECTADA

Antes de comenzar cada tarea, consulta el documento técnico correspondiente:
- **Stack & Dependencias:** [`01_STACK_TECNOLOGICO.md`](01_STACK_TECNOLOGICO.md)
- **Arquitectura & Flujos:** [`02_ARQUITECTURA_SISTEMA.md`](02_ARQUITECTURA_SISTEMA.md)
- **Estado de Componentes:** [`03_ESTADO_ACTUAL_COMPONENTES.md`](03_ESTADO_ACTUAL_COMPONENTES.md)
- **Catálogo de Bugs:** [`04_BUGS_CRITICOS.md`](04_BUGS_CRITICOS.md)
- **Auditoría UI/UX:** [`05_AUDITORIA_UI_UX.md`](05_AUDITORIA_UI_UX.md)
- **Backend Rust:** [`06_AUDITORIA_BACKEND_RUST.md`](06_AUDITORIA_BACKEND_RUST.md)
- **Pipeline Python:** [`07_AUDITORIA_PIPELINE_PYTHON.md`](07_AUDITORIA_PIPELINE_PYTHON.md)
- **Modelos IA & Gemini:** [`08_AUDITORIA_IA_MODELOS.md`](08_AUDITORIA_IA_MODELOS.md)
- **Features Faltantes:** [`09_FEATURES_FALTANTES.md`](09_FEATURES_FALTANTES.md)
- **Plan por Fases:** [`10_PLAN_IMPLEMENTACION_POR_FASES.md`](10_PLAN_IMPLEMENTACION_POR_FASES.md)
- **Contratos & Tipos:** [`11_CONTRATO_DATOS_TIPOS.md`](11_CONTRATO_DATOS_TIPOS.md)

---

## 🔄 ALGORITMO DEL BUCLE DE EJECUCIÓN MULTI-AGENTE

```
INICIALIZAR_BUCLE:
  1. Leer lista de tareas pendientes.
  2. Asignar la siguiente tarea al Agente Especialista correspondiente:
     - [AGENTE-RUST]    -> Tareas de main.rs, db.rs, queue.rs, embedding.rs
     - [AGENTE-PYTHON]  -> Tareas de python-workers/ (downloader, transcriber)
     - [AGENTE-UI/UX]   -> Tareas de app/, components/, hooks/
     - [AGENTE-IA]      -> Tareas de ONNX, Whisper y @google/genai
  3. Ejecutar cambios de código de forma atómica.
  4. Ejecutar Gates de Verificación:
     - TypeScript: `npx tsc --noEmit`
     - Rust: `cargo check` (en `src-tauri/`)
  5. Si falla: Reintentar corrección (máximo 2 intentos). Si persiste, marcar como BLOQUEADO en reporte.
  6. Si pasa: Marcar tarea como COMPLETADA y proceder inmediatamente a la siguiente.
  7. Al finalizar todas las tareas, actualizar `docs/SESSION_REPORT_AUTOGEN.md`.
```

---

## 🎯 LISTA MAESTRA DE TAREAS PARA KILO CODE

### BLOQUE A — CORRECCIONES CRÍTICAS INMEDIATAS (Fase 8)
- [ ] **TAREA A.1 (Agente Rust):** Conectar instancia ONNX al `QueueManager` en `src-tauri/src/main.rs` para que la indexación genere vectores reales de 384d en lugar de ceros.
- [ ] **TAREA A.2 (Agente Rust):** Reescribir `cluster_videos_by_similarity` en `src-tauri/src/db.rs` eliminando el `AVG(te.embedding_vector)` SQL y calculando el centroid en memoria.
- [ ] **TAREA A.3 (Agente Python):** Corregir bucle de playlists en `python-workers/main.py` para invocar la cadena completa de descarga, extracción de audio y transcripción.
- [ ] **TAREA A.4 (Agente UI):** Corregir lookup de `activeJob` en `components/VideoGrid.tsx` para combinar `playlistJobs` y `jobs` al abrir el modal.
- [ ] **TAREA A.5 (Agente Rust):** Añadir índices SQL `idx_embeddings_job_id` y `idx_media_job_id` en `src-tauri/src/db.rs::init_db()`.

### BLOQUE B — MEJORAS DE PRODUCTO & UX (Fases 8-10)
- [ ] **TAREA B.1 (Agente UI):** Conectar `components/SettingsPanel.tsx` con comandos Tauri `get_download_dir` y `set_download_dir`.
- [ ] **TAREA B.2 (Agente UI):** Implementar estado vacío ilustrado en `components/VideoGrid.tsx` cuando no hay videos completados.
- [ ] **TAREA B.3 (Agente UI & Rust):** Sincronizar timestamps reales de Whisper en `components/ExpandedVideoModal.tsx` (`seekTo` interactivo).
- [ ] **TAREA B.4 (Agente UI):** Barra de progreso por etapas (`Descargando` -> `Audio` -> `Transcribiendo` -> `Indexando`) en `components/QueueSection.tsx`.

### BLOQUE C — IA MULTIMODAL & CHAT RAG (Fases 10-11)
- [ ] **TAREA C.1 (Agente IA):** Crear servicio `lib/gemini.ts` usando `@google/genai` para resúmenes automáticos y categorización de videos.
- [ ] **TAREA C.2 (Agente UI & IA):** Crear componente de asistente conversacional RAG `components/ChatAssistantPanel.tsx` integrado en Sidebar.

### BLOQUE D — EXPORTACIÓN CIENTÍFICA JULIA & CIERRE (Fases 13-15)
- [ ] **TAREA D.1 (Agente Rust):** Enriquecer comando `export_semantic` en `main.rs` con segmentos y metadatos completos para ecosistema Julia.
- [ ] **TAREA D.2 (Agente Orquestador):** Generar reporte final en `docs/SESSION_REPORT_AUTOGEN.md`.

---

*Documento base generado para Kilo Code | Agosto 2026*
