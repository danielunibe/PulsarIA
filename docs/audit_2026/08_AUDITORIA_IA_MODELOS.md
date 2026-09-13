# PULSARIA — AUDITORÍA 08: INTELIGENCIA ARTIFICIAL Y MODELOS
## Evaluación de Whisper, ONNX MiniLM, Integración con Google Gemini y Estrategia Multimodal
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: 09_FEATURES_FALTANTES.md

---

## 1. ESTADO ACTUAL DE LOS MODELOS DE IA

```
[Audio] ---> [faster-whisper (tiny/int8)] ---> [Texto Transcrito]
                                                      |
                                                      v
                                        [ONNX all-MiniLM-L6-v2]
                                                      |
                                                      v
                                        [Vector 384d en SQLite]
```

### 1.1 Modelo STT: Whisper (faster-whisper)
- **Tamaño actual:** `tiny` (~75MB).
- **Fortalezas:** Velocidad extrema de inferencia en CPU (5x tiempo real).
- **Debilidades:** Tasa de error (WER) relativamente alta en español con modismos, ruido de fondo o música superpuesta típica de TikTok.
- **Recomendación:** Permitir al usuario seleccionar en `SettingsPanel` entre `tiny` (rápido), `base` (balanceado) y `small` (alta precisión).

### 1.2 Modelo de Embeddings: all-MiniLM-L6-v2 (ONNX)
- **Dimensiones:** 384.
- **Fortalezas:** Extremadamente ligero (<90MB), inferencia sub-15ms, sin costo de API.
- **Debilidades:** Optimizado principalmente para inglés. Para queries complejas en español, la similitud semántica puede ser limitada.

---

## 2. INTEGRACIÓN CON GOOGLE GEMINI (`@google/genai`)

El proyecto ya cuenta con la dependencia `@google/genai: ^1.17.0` instalada en `package.json`. A continuación se detalla el plan para activar sus capacidades:

### 2.1 Resúmenes Inteligentes y Key Insights (`gemini-1.5-flash`)
- Generar automáticamente al completar un video:
  - Título conceptual enriquecido.
  - Resumen ejecutivo de 3 viñetas.
  - Categoría temática (e.g., Programación, Fitness, Finanzas, Humor).
  - Sentimiento y tono.

### 2.2 Chat RAG Multimodal sobre la Biblioteca
- Permitir al usuario abrir un panel de asistente y preguntar:
  - *"¿Qué videos hablan sobre optimización en Rust?"*
  - *"Resume los consejos de productividad de los últimos 5 videos de TikTok guardados."*
- El backend recupera los chunks más relevantes mediante búsqueda vectorial y los envía como contexto a Gemini para generar la respuesta con citas exactas a los videos.

### 2.3 Embeddings Híbridos (`text-embedding-004`)
- Opción de generar embeddings de 768 dimensiones vía Gemini cuando hay API Key configurada, manteniendo ONNX local como fallback offline.

---

*Siguiente documento: [09_FEATURES_FALTANTES.md](09_FEATURES_FALTANTES.md)*
