# PULSAR EVENTIDE — AUDITORÍA 05: AUDITORÍA DE EXPERIENCIA DE USUARIO (UI/UX)
## Defectos Visuales, Micro-Interacciones, Accesibilidad y Ergonomía
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 06_AUDITORIA_BACKEND_RUST.md

---

## 1. RESUMEN DE HALLAZGOS UI/UX

La interfaz de Pulsar Eventide destaca por su estética AAA (Aurora WebGL, Glassmorphism, paleta HSL seleccionada). Sin embargo, la auditoría técnica ha detectado varias fricciones y fallas de interacción que degradan la experiencia de uso.

---

## 2. CATÁLOGO DE DEFECTOS UI/UX

### 2.1 Estado Vacío Desorientador en `VideoGrid`
- **Problema:** Cuando la biblioteca tiene 0 videos procesados, el grid renderiza 12 slots fantasma (`InactiveCardShell`) sin ningún mensaje explicativo, CTA (Call to Action) ni guía interactiva.
- **Impacto:** Un usuario primerizo ve tarjetas oscuras vacías sin entender que debe ingresar un enlace en el panel izquierdo.
- **Recomendación:** Mostrar un banner central con ilustración sutil, gradiente de marca y mensaje: *"Tu biblioteca está vacía. Pega enlaces de TikTok, YouTube o Instagram a la izquierda para comenzar."*

### 2.2 Desincronización Temporal de Subtítulos en `ExpandedVideoModal`
- **Problema:** Los chunks de transcripción se reparten de manera uniforme en la línea de tiempo (`dur / totalChunks`). Si un video tiene silencios largos al inicio o ráfagas rápidas de voz, el texto no coincide con el audio real.
- **Impacto:** Al hacer clic en un subtítulo para saltar (`seekTo`), el reproductor aterriza en un segundo inexacto.
- **Recomendación:** Almacenar `start_ms` y `end_ms` reales generados por Whisper para cada segmento y consumirlos directamente en el modal.

### 2.3 Progreso de Descarga en `QueueSection` Sin Etapas Claras
- **Problema:** El usuario solo ve una barra de porcentaje genérica. No queda claro si el sistema está descargando el MP4, extrayendo el audio con ffmpeg, ejecutando Whisper o indexando en ONNX.
- **Recomendación:** Implementar una barra de 4 pasos con badges de estado:
  `[1. Descargando] -> [2. Audio WAV] -> [3. Transcribiendo] -> [4. Indexando]`

### 2.4 Fricción en Búsqueda Semántica
- **Problema:** En versiones iniciales, la búsqueda requería presionar Enter. Con el debounce de 800ms implementado en `Header.tsx`, falta un indicador de carga (`spinner` o pulse de luz cian `#25f4ee`) mientras el modelo ONNX genera el embedding y filtra resultados.
- **Recomendación:** Añadir un spinner de búsqueda activo dentro del input de Header.

### 2.5 Controles de Volumen y Scrubber en `VideoCard` (Hover Play)
- **Problema:** Al pasar el cursor sobre una tarjeta en el grid, el video comienza a reproducirse en miniatura. Si el usuario pasa el mouse rápidamente sobre varias tarjetas, se disparan múltiples cargas de video y clips de audio simultáneos.
- **Recomendación:** Añadir un debounce de 250ms antes de iniciar el hover play y silenciar el audio por defecto en el grid (habilitando audio solo en `ExpandedVideoModal`).

### 2.6 Sistema de Notificaciones del Sistema
- **Problema:** Cuando se encola una lista de 10 videos y el usuario minimiza la aplicación, no hay notificación nativa de Windows al terminar el procesamiento de la cola.
- **Recomendación:** Integrar `tauri-plugin-notification` para notificar: *"10 videos procesados e indexados en tu biblioteca."*

---

*Siguiente documento: [06_AUDITORIA_BACKEND_RUST.md](06_AUDITORIA_BACKEND_RUST.md)*
