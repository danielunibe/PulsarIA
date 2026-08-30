# 🌌 Pulsar (Pulsar Eventide)

> **Motor multimodal de escritorio para captura, procesamiento, indexación semántica y consulta de videos cortos por Inteligencia Artificial.**

Pulsar es una plataforma de escritorio de alto rendimiento (construida en **Rust + Tauri 2** y **Next.js 15**) diseñada para descargar videos (comenzando por TikTok y extensible a YouTube y otras fuentes), transcribir su audio, indexar vectorialmente su contenido en un motor ONNX/HNSW local y transformarlos en **fichas de conocimiento estructurado** consultables mediante lenguaje natural, sirviendo además como motor de ingestión multimodal para el ecosistema **Julia**.

---

## 🚀 ¿Para qué sirve Pulsar?

Hoy en día, el conocimiento valioso en videos cortos (tutoriales, explicaciones, análisis de código, noticias, revisiones de productos) es efímero y queda atrapado en formato audiovisual. No se puede buscar por significado, no se puede indexar fácilmente y se pierde en el feed.

**Pulsar resuelve esto:**
1. **Captura y Almacenamiento Local (Offline-first):** Descarga el video, extrae metadatos limpios y genera copia local de audio/video.
2. **Transcripción y Chunking Semántico:** Procesa el audio mediante modelos Whisper/Faster-Whisper para extraer cada segundo con alta precisión.
3. **Embeddings e Indexación Vectorial Local:** Utiliza modelos ONNX (`all-MiniLM-L6-v2`, 384 dimensiones) y shards HNSW para permitir búsquedas semánticas instantáneas (búsqueda por concepto o idea, no solo por coincidencia exacta de palabras).
4. **Ficha Inteligente y Extracción de Conocimiento:** Estructura transcripción, escenas, temas y resúmenes para poder hacer preguntas a la biblioteca.
5. **Conector con Julia:** Procesa la carga pesada (descargas, modelos de IA, transcripciones) y entrega a Julia conocimiento limpio y listo para razonar.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
|---|---|
| **Core de Escritorio & Backend** | **Rust**, **Tauri 2**, Tokio (Async), Axum (REST fallback & internal API), Rusqlite (SQLite local) |
| **Motor Vectorial & ML Local** | ONNX Runtime (`all-MiniLM-L6-v2`, 384d), HNSW Shards (4 shards paralelos), Semantic Chunking |
| **Pipeline de Procesamiento** | **Python Workers** (`downloader.py`, `audio_extractor.py`, `transcriber.py`), `yt-dlp`, `faster-whisper`, `ffmpeg` |
| **Frontend & UI/UX** | **Next.js 15 (App Router)**, **React 19**, TypeScript 5.9, Tailwind CSS v4, Motion (Framer Motion), Three.js (WebGL Aurora Background), Lucide Icons, Tabler Icons |
| **Observabilidad & Métricas** | Endpoints de salud `:8080`, servidor de métricas `:9001`, logging reactivo Tauri Events |

---

## 📂 Estructura del Repositorio

```text
Pulsaria/
├── app/                          # Next.js 15 App Router (Frontend principal)
│   ├── globals.css               # Estilos globales y tokens Tailwind v4
│   ├── layout.tsx                # Shell de la aplicación
│   └── page.tsx                  # Dashboard operativo, búsqueda y biblioteca
├── components/                   # Componentes React modulares
│   ├── AddLinks.tsx              # Ingesta de enlaces y archivos (.txt/.csv)
│   ├── QueueSection.tsx          # Monitor en tiempo real de la cola de jobs
│   ├── VideoGrid.tsx             # Grid dinámico de videos procesados
│   ├── ExpandedVideoModal.tsx    # Modal de reproducción y análisis detallado
│   ├── Sidebar.tsx               # Navegación entre Dashboard y Engine
│   ├── Header.tsx                # Barra superior con búsqueda semántica y métricas
│   └── config/                   # Panel de diagnóstico y control del motor ("Engine")
├── docs/                         # Documentación maestra y guías de desarrollo
│   ├── PULSAR_MASTER_AUDIT_AND_PRODUCT_DIRECTION.md # Auditoría de estado y producto
│   ├── PULSAR_ARCHITECTURE_AND_SPECS.md             # Especificaciones técnicas completas
│   ├── PULSAR_TASK_BACKLOG.md                       # Backlog granular de tareas por fases
│   └── PULSAR_AUTONOMOUS_EXECUTION_LOOP.md          # Protocolo para ejecución autónoma / loop
├── lib/                          # Utilidades, design tokens y contextos de React
├── python-workers/               # Workers Python de ingestión, descarga y transcripción
│   ├── downloader.py             # Extractor de videos con yt-dlp
│   ├── audio_extractor.py        # Procesamiento de audio vía ffmpeg
│   ├── transcriber.py            # Transcripción con Faster-Whisper
│   └── main.py                   # Coordinador de workers
├── src-tauri/                    # Core nativo en Rust (Tauri 2)
│   ├── src/
│   │   ├── main.rs               # Entrypoint, estado Tokio, comandos Tauri y servidor Axum
│   │   ├── db.rs                 # Capa SQLite (jobs, media, transcript_embeddings)
│   │   ├── embedding.rs          # Motor de inferencia ONNX y búsqueda vectorial
│   │   ├── queue.rs              # Gestor asíncrono de colas y despacho de workers
│   │   ├── api/                  # Endpoints REST y handlers HTTP
│   │   ├── application/          # Casos de uso y orquestación
│   │   ├── domain/               # Entidades y lógica de dominio
│   │   └── infrastructure/       # Adaptadores de sistema de archivos y modelos
│   ├── Cargo.toml                # Dependencias de Rust
│   └── tauri.conf.json           # Configuración de Tauri 2
├── scripts/                      # Benchmarks y scripts de mantenimiento
└── sdk/                          # SDK cliente en TypeScript para integraciones externas
```

---

## ⚡ Guía de Inicio Rápido

### Prerrequisitos para desarrollo
- **Node.js** v20+ y **npm**
- **Rust Toolchain** (rustc, cargo)
- Python 3.10+ y FFmpeg accesible en el PATH solo para ejecutar el árbol fuente sin el instalador.

### Instalador Windows

El artefacto `src-tauri/target-tauri/release/bundle/nsis/pulsar-eventide_0.1.0_x64-setup.exe` instala Pulsar Eventide para el usuario actual. El instalador contiene el frontend estático, el ejecutable Rust, Python embebible, workers, Faster-Whisper, yt-dlp, los modelos ONNX/MiniLM y FFmpeg; el usuario no necesita instalar Node, Rust, Python ni FFmpeg para usar el paquete.

La biblioteca y la configuración se guardan en `%APPDATA%\\Pulsar Eventide`; los videos procesados se guardan en la carpeta de Descargas por defecto y pueden cambiarse desde Settings. Los recursos del bundle se leen desde la carpeta `resources` instalada, mientras que los datos escribibles no se colocan junto al ejecutable.

La descarga de TikTok sigue dependiendo de que el enlace sea accesible y autorizado por el usuario. Las cookies del navegador son opt-in, se usan en el proceso de descarga y no se copian a SQLite ni se persisten como archivos de configuración.

### Instalación de dependencias para desarrollo
```bash
# 1. Dependencias del frontend
npm install

# 2. Dependencias de los workers Python
pip install -r python-workers/requirements.txt
```

### Ejecución en Modo Desarrollo
Para arrancar el frontend de Next.js y el backend Tauri simultáneamente:
```bash
npm run tauri dev
```
- La interfaz de escritorio se abrirá automáticamente.
- Frontend servido en `http://localhost:3000` (o puerto configurado por Next).
- API interna disponible en `http://localhost:8080`.
- Métricas del sistema en `http://localhost:9001`.

### Compilación y Build Estático
```bash
# Construcción del bundle frontend
npm run build

# Compilación de la aplicación nativa Tauri
npm run tauri build
```

---

## 📋 Documentación Adicional

Para profundizar en el desarrollo y continuar el trabajo de forma autónoma:

1. **[Auditoría Maestra y Dirección de Producto](file:///docs/PULSAR_MASTER_AUDIT_AND_PRODUCT_DIRECTION.md)**
2. **[Arquitectura y Especificaciones Técnicas](file:///docs/PULSAR_ARCHITECTURE_AND_SPECS.md)**
3. **[Backlog Granular de Tareas](file:///docs/PULSAR_TASK_BACKLOG.md)**
4. **[Guía de Ejecución Autónoma en Bucle (Loop)](file:///docs/PULSAR_AUTONOMOUS_EXECUTION_LOOP.md)**

---

## 🔒 Políticas de Seguridad y Operación
- **UAC Estándar:** No se permiten métodos alternos de elevación de privilegios.
- **Datos y Modelos:** La carpeta `data/` y los modelos en `assets/models/` están protegidos; cualquier migración de esquema requiere snapshot previo.
- **Canal Oficial:** La comunicación principal UI ↔ Backend es mediante Tauri `invoke` con eventos bidireccionales (`job_progress`, `media_indexed`).
