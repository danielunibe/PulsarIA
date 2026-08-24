# 📋 PULSAR: Backlog de Tareas y Roadmap de Desarrollo

> **Registro granular y ordenado de tareas por fases, listo para ejecución secuencial y autónoma.**

---

## 🚦 Matriz de Fases y Estado

| Fase | Título | Estado | Prioridad | Dependencia |
|---|---|---|---|---|
| **Fase 6B** | Validación de Comandos Seguros (Read-Only) | 🟡 Listo para ejecutar | Alta | Ninguna |
| **Fase 7** | Ingesta y Procesamiento del Primer Video Real | ⚪ Pendiente | Crítica | Fase 6B |
| **Fase 8** | Ficha Inteligente Textual y Persistencia Ampliada | ⚪ Pendiente | Alta | Fase 7 |
| **Fase 9** | Integración del Módulo OCR / Texto en Pantalla | ⚪ Pendiente | Alta | Fase 8 |
| **Fase 10** | Motor de Análisis Visual y Segmentación de Escenas | ⚪ Pendiente | Media | Fase 9 |
| **Fase 11** | Búsqueda Conversacional y Chat IA sobre la Biblioteca | ⚪ Pendiente | Media | Fase 8, 10 |
| **Fase 12** | Clasificación Temática y Detección de Intereses | ⚪ Pendiente | Media | Fase 10 |
| **Fase 13** | Conector y Exportación al Ecosistema Julia | ⚪ Pendiente | Alta | Fase 8, 12 |
| **Fase 14** | Pestaña "Page" y Pulido Visual del Frontend | ⚪ Pendiente | Media | Fase 6B |
| **Fase 15** | Empaquetado Productivo y Validación de Distribución | ⚪ Pendiente | Media | Fase 14 |

---

## 📦 Detalle de Tareas por Fase

### 🟡 Fase 6B: Validación Funcional de Comandos Seguros
- **Ticket `TASK-6B-01`:** Verificar respuesta de `get_model_status` en runtime y comprobar que `dimensions: 384` y `loaded: true` se reflejan en el panel Engine.
- **Ticket `TASK-6B-02`:** Verificar respuesta de `get_db_status` y validar que el archivo `library.db` responde con health `ok`.
- **Ticket `TASK-6B-03`:** Ejecutar consulta de prueba en `search_transcripts` con término simple y verificar manejo de 0 resultados sin crashes.
- **Ticket `TASK-6B-04`:** Comprobar la captura de logs en vivo en `system-log` dentro de la UI.

---

### ⚪ Fase 7: Primer Video Real Controlado
- **Ticket `TASK-7-01`:** Snapshot de seguridad previo de `data/library.db`.
- **Ticket `TASK-7-02`:** Encolar un video de TikTok real individual desde la UI (`AddLinks`).
- **Ticket `TASK-7-03`:** Monitorear el progreso en `QueueSection` (etapas: descarga -> extracción de audio -> transcripción -> embeddings -> completado).
- **Ticket `TASK-7-04`:** Verificar la inserción del registro en `jobs`, `media` y `transcript_embeddings`.
- **Ticket `TASK-7-05`:** Validar renderizado de la tarjeta en `VideoGrid` y reproducción local en `ExpandedVideoModal`.
- **Ticket `TASK-7-06`:** Ejecutar búsqueda semántica con términos clave presentes en el video transcrito y verificar coincidencia en el Header.

---

### ⚪ Fase 8: Ficha Inteligente Textual
- **Ticket `TASK-8-01`:** Extender el esquema de `media` o crear tabla `video_metadata_extended` con campos de hashtags, descripción completa y resumen.
- **Ticket `TASK-8-02`:** Modificar `ExpandedVideoModal` para visualizar la transcripción completa sincronizada por timestamps con el reproductor de video.
- **Ticket `TASK-8-03`:** Integrar función de copia rápida de transcripción y exportación a Markdown/JSON.

---

### ⚪ Fase 9: Módulo de OCR / Texto Visual
- **Ticket `TASK-9-01`:** Diseñar worker `ocr_extractor.py` (usando Tesseract o PaddleOCR ligero).
- **Ticket `TASK-9-02`:** Extraer fotogramas clave a intervalos fijos (ej. 1 fotograma cada 2 segundos) y detectar texto superpuesto en pantalla.
- **Ticket `TASK-9-03`:** Indexar los textos detectados por OCR en el motor de búsqueda semántica.

---

### ⚪ Fase 10: Análisis Visual Multimodal
- **Ticket `TASK-10-01`:** Integrar modelo de visión (o embeddings multimodales CLIP / MobileCLIP) para catalogar objetos, interfaces y escenas.
- **Ticket `TASK-10-02`:** Generar observaciones estructuradas por video (ej. "Pantalla de código VS Code", "Persona hablando a cámara").
- **Ticket `TASK-10-03`:** Comparador de coherencia audio-visual (detectar si lo hablado corresponde a lo mostrado en pantalla).

---

### ⚪ Fase 11: Chat e Interrogación de la Biblioteca con IA
- **Ticket `TASK-11-01`:** Crear panel de chat lateral o modal para formular preguntas a la biblioteca (RAG local).
- **Ticket `TASK-11-02`:** Integrar pipeline de generación usando modelo local o API configurada (con citación de videos y segundo exacto).

---

### ⚪ Fase 12: Clasificación Temática Automática
- **Ticket `TASK-12-01`:** Algoritmo de clustering sobre embeddings para agrupar videos por temas comunes (ej. "Programación Rust", "Inteligencia Artificial", "Diseño").
- **Ticket `TASK-12-02`:** Visualización de colecciones/etiquetas en la interfaz.

---

### ⚪ Fase 13: Conector con Julia
- **Ticket `TASK-13-01`:** Implementar endpoint REST `GET /api/v1/julia/pending` y `POST /api/v1/julia/ack`.
- **Ticket `TASK-13-02`:** Generar archivo de exportación estructurado con el flag `julia_ready: true`.
- **Ticket `TASK-13-03`:** Test de integración con consumidor simulado en Julia.

---

### ⚪ Fase 14: Pestaña "Page" y Refinamiento UI/UX
- **Ticket `TASK-14-01`:** Crear la pestaña `Page` en `Sidebar.tsx`.
- **Ticket `TASK-14-02`:** Implementar selector de columnas, tamaño de tarjeta, densidad y ordenamiento real (por fecha, duración, relevancia).
- **Ticket `TASK-14-03`:** Conectar el selector de carpeta de descarga al backend de Rust.

---

### ⚪ Fase 15: Empaquetado y Distribución
- **Ticket `TASK-15-01`:** Configurar bundle multiplataforma en `tauri.conf.json`.
- **Ticket `TASK-15-02`:** Validar build limpio con `npm run tauri build`.
- **Ticket `TASK-15-03`:** Verificación de ejecución del instalador generado en entorno limpio.
