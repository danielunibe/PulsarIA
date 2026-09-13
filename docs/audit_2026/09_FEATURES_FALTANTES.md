# PULSARIA — AUDITORÍA 09: MATRIZ DE FEATURES FALTANTES
## Requisitos Funcionales, Módulos Pendientes y Especificación Técnica
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 10_PLAN_IMPLEMENTACION_POR_FASES.md

---

## 1. MATRIZ DE FEATURES POR PRIORIDAD

| ID | Feature | Capa | Prioridad | Fase Roadmap |
|---|---|---|---|---|
| FEAT-01 | Validación E2E Pipeline Real | Python/Rust/UI | CRÍTICA | Fase 7 |
| FEAT-02 | Conexión ONNX en AppState | Rust | CRÍTICA | Fase 8 |
| FEAT-03 | Timestamps Reales en Subtítulos | Python/Rust/UI | ALTA | Fase 8 |
| FEAT-04 | Persistencia de Ajustes en Backend | Rust/UI | MEDIA | Fase 8 |
| FEAT-05 | Motor OCR en Frames de Video | Python/Rust | ALTA | Fase 9 |
| FEAT-06 | Integración Gemini (Resúmenes) | Frontend/API | ALTA | Fase 10 |
| FEAT-07 | Chat Asistente RAG con Citaciones | Frontend/AI | ALTA | Fase 11 |
| FEAT-08 | Playlists Inteligentes por Topic | Rust/UI | MEDIA | Fase 12 |
| FEAT-09 | Exportación Científica Julia (.unib) | Rust/Julia | MEDIA | Fase 13 |
| FEAT-10 | Notificaciones Nativas del SO | Rust/UI | BAJA | Fase 14 |
| FEAT-11 | Empaquetador de Producción MSI | Tauri/Build | MEDIA | Fase 15 |

---

## 2. ESPECIFICACIÓN DE FEATURES CLAVE

### FEAT-05: Motor OCR (Extracción de Texto en Pantalla)
- **Objetivo:** Los videos de TikTok contienen información crítica en texto sobreimpreso (instrucciones, código, recetas) que no siempre se pronuncia en el audio.
- **Implementación:** Extraer 1 fotograma cada 2 segundos con `ffmpeg`, aplicar OCR ligero (Tesseract / PaddleOCR / Gemini Vision) e indexar el texto extraído en una tabla `visual_embeddings`.

### FEAT-07: Asistente de Investigación RAG
- **Objetivo:** Interfaz conversacional en el Sidebar donde el usuario consulta su base de conocimiento audiovisual.
- **Implementación:**
  1. Input de pregunta en UI.
  2. Búsqueda vectorial local en `transcript_embeddings`.
  3. Recuperación de los top 5 chunks.
  4. Envío a `@google/genai` con prompt del sistema que cita los IDs de video y timestamps.
  5. Renderizado de respuesta con enlaces clickeables que abren el `ExpandedVideoModal` en el segundo exacto.

### FEAT-09: Exportador Julia (.unib)
- **Objetivo:** Permitir que investigadores en Julia carguen colecciones de Pulsar directamente como Tensores y DataFrames para análisis de NLP.
- **Estructura del formato:**
  - Archivo JSON estructurado con metadatos, transcripción completa, chunks tokenizados, matriz de embeddings float32 y relaciones de clustering.

---

*Siguiente documento: [10_PLAN_IMPLEMENTACION_POR_FASES.md](10_PLAN_IMPLEMENTACION_POR_FASES.md)*
