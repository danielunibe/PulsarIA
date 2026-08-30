# Contribuir a Pulsar Eventide

Guía para contribuir al desarrollo de Pulsar Eventide.

## Requisitos previos

- **Node.js** v20+ y npm
- **Rust Toolchain** (rustc, cargo)
- **Python** 3.10+ y FFmpeg en PATH
- **Git**

## Configuración del entorno de desarrollo

```bash
# 1. Clonar el repositorio
git clone <url-del-repositorio>
cd pulsar-eventide

# 2. Instalar dependencias del frontend
npm install

# 3. Instalar dependencias de Python
pip install -r python-workers/requirements.txt

# 4. Configurar variables de entorno
cp .env.example .env
# Editar .env con tu configuración (API keys, rutas, etc.)
```

## Ejecución en modo desarrollo

```bash
npm run tauri dev
```

Esto arranca automáticamente el frontend Next.js y el backend Tauri/Rust.

## Estructura del proyecto

```
pulsar-eventide/
├── app/                    # Next.js 15 App Router (frontend)
├── components/             # Componentes React modulares
├── hooks/                  # Custom hooks de React
├── lib/                    # Utilidades, design tokens, contextos
├── types/                  # Tipos TypeScript compartidos
├── python-workers/         # Workers de procesamiento Python
│   ├── main.py             # Orchestrator daemon
│   ├── downloader.py       # Descarga con yt-dlp
│   ├── audio_extractor.py  # Extracción de audio con ffmpeg
│   └── transcriber.py      # Transcripción con faster-whisper
├── src-tauri/              # Core nativo en Rust (Tauri 2)
│   └── src/
│       ├── main.rs         # Entry point, comandos Tauri
│       ├── db.rs           # Capa SQLite
│       ├── embedding.rs    # Motor ONNX
│       └── queue.rs        # Gestor de cola async
├── docs/                   # Documentación
└── sdk/                    # SDK TypeScript para integraciones
```

## Flujo de trabajo

1. **Crear una rama** para tu feature o fix:
   ```bash
   git checkout -b feature/mi-feature
   ```

2. **Hacer cambios** siguiendo las convenciones del proyecto.

3. **Verificar compilación** antes de commitear:
   ```bash
   # Frontend
   npx tsc --noEmit

   # Backend
   cd src-tauri && cargo check
   ```

4. **Commitear** con mensajes descriptivos:
   ```bash
   git commit -m "feat: descripción del cambio"
   ```

5. **Push y PR** para revisión.

## Convenciones de código

### TypeScript / React
- Usar TypeScript estricto (sin `any` innecesario)
- Seguir los patrones existentes de componentes (ver `components/`)
- Mantener consistencia con los design tokens en `lib/design-tokens.ts`
- Preferir `motion` (Framer Motion) para animaciones

### Rust
- Seguir `rustfmt` para formateo
- Agregar doc comments (`///`) a funciones públicas
- Usar `Result<T, String>` para errores de Tauri commands
- Mantener el patrón de `tauri::State<'_, AppState>` para dependencias

### Python
- Usar docstrings en todas las funciones públicas
- Mantener el patrón de eventos JSON por stdout
- Manejar errores con `emit_error()` en `events.py`

## Pruebas

```bash
# TypeScript (si hay tests)
npx vitest run

# Rust
cd src-tauri && cargo test

# Python (si hay tests)
cd python-workers && python -m pytest
```

## Documentación

- **Archivos de referencia**: Ver `docs/PULSAR_ARCHITECTURE_AND_SPECS.md`
- **Backlog de tareas**: Ver `docs/PULSAR_TASK_BACKLOG.md`
- **Reportes de sesión**: Crear `docs/SESSION_REPORT_YYYYMMDD.md` después de sesiones significativas

## Zonas sensibles (requieren cuidado)

- `src-tauri/src/` — Core del backend; cambios sin plan pueden romper el motor
- `data/` — Datos persistidos (SQLite, HNSW shards); loss irreversible
- `python-workers/` — Pipeline de procesamiento; cambios afectan el procesamiento real
- `assets/models/` — Modelo ONNX embebido; no debe modificarse sin justificación

## Licencia

Al contribuir, aceptas que tus contribuciones bajo la licencia MIT del proyecto.
