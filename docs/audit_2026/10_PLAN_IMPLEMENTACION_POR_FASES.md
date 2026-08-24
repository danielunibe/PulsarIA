# PULSAR EVENTIDE — AUDITORÍA 10: PLAN DE IMPLEMENTACIÓN POR FASES
## Roadmap Técnico de Ejecución Autónoma (Fases 7 a 15)
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 11_CONTRATO_DATOS_TIPOS.md

---

## 1. VISIÓN GENERAL DEL ROADMAP

```
[FASE 7]  Validación Pipeline E2E con Video Real
    ↓
[FASE 8]  Saneamiento Arquitectónico y Corrección de Bugs Críticos (BUG-01 a BUG-08)
    ↓
[FASE 9]  Motor OCR y Extracción de Fotogramas Visuales
    ↓
[FASE 10] Integración Gemini (Resúmenes, Tags y Análisis Multimodal)
    ↓
[FASE 11] Asistente Conversacional RAG sobre Biblioteca
    ↓
[FASE 12] Playlists Inteligentes y Clustering Automático
    ↓
[FASE 13] Exportación Científica a Julia y Formato .unib
    ↓
[FASE 14] Optimización UI/UX, Animaciones y Micro-Interacciones
    ↓
[FASE 15] Preparación de Release y Empaquetado Nativo
```

---

## 2. GUÍA DE EJECUCIÓN POR FASE

### FASE 7: Validación de Pipeline E2E (Primer Video Real)
- **Objetivo:** Confirmar que la cadena `AddLinks` -> `Rust` -> `Python` -> `SQLite` -> `VideoGrid` funciona con un video real de TikTok o YouTube.
- **Acciones:**
  1. Snapshot preventivo de `data/library.db`.
  2. Encolar 1 URL real.
  3. Verificar creación de `data/processing/1/video.mp4` y `transcript.txt`.
  4. Verificar actualización de estado en SQLite.

### FASE 8: Saneamiento y Corrección de Bugs
- **Objetivo:** Resolver los 8 bugs identificados en el documento 04.
- **Acciones:**
  1. Pasar `onnx_model` a `QueueManager` en `main.rs`.
  2. Reescribir `cluster_videos_by_similarity` en `db.rs`.
  3. Corregir bucle de playlists en `main.py`.
  4. Corregir lookup de video en `VideoGrid.tsx`.
  5. Implementar descarga o fallback de thumbnails en `queue.rs`.

### FASE 9: Motor OCR y Extracción Visual
- **Objetivo:** Incorporar texto en pantalla al índice semántico.
- **Acciones:**
  1. Añadir `visual_extractor.py` en workers Python.
  2. Extraer keyframes con `ffmpeg`.
  3. Indexar texto OCR en SQLite.

### FASE 10 & 11: IA Generativa y Chat RAG con Gemini
- **Objetivo:** Convertir Pulsar en un asistente de investigación inteligente.
- **Acciones:**
  1. Crear `lib/gemini.ts` usando `@google/genai`.
  2. Generar resúmenes automáticos al indexar.
  3. Crear componente `ChatAssistantPanel.tsx` en el Sidebar.

### FASE 12 a 15: Playlists, Julia y Producción
- **Objetivo:** Completar integración científica y empaquetado final.

---

*Siguiente documento: [11_CONTRATO_DATOS_TIPOS.md](11_CONTRATO_DATOS_TIPOS.md)*
