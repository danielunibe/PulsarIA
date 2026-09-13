# Contribuir a Pulsaria

La fuente técnica normativa es [PROJECT_TRUTH.md](PROJECT_TRUTH.md). Este
archivo describe el flujo operativo y no crea una segunda definición de
arquitectura o estado.

Guía para contribuir al desarrollo de Pulsaria.

## Requisitos previos

- **Node.js** v20+ y npm
- **Rust Toolchain** (rustc, cargo)
- **Python** 3.10+ y FFmpeg en PATH
- **Git**

## Configuración del entorno de desarrollo

```bash
# 1. Clonar el repositorio
git clone <url-del-repositorio>
cd PulsarIA

# 2. Instalar dependencias del frontend
npm install

# 3. Instalar dependencias de Python
pip install -r python-workers/requirements.txt

# 4. Configurar variables de entorno
cp .env.example .env
# Editar .env sólo con rutas y configuración local. No añadas API keys,
# cookies, bases de datos ni datos de usuarios.
```

## Ejecución en modo desarrollo

```bash
npm run tauri dev
```

Esto arranca automáticamente el frontend Next.js y el backend Tauri/Rust.

## Estructura del proyecto

```
PulsarIA/
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

- **Archivos de referencia**: Ver `PROJECT_TRUTH.md`; las especificaciones en
  `docs/archive/` son históricas.
- **Backlog de tareas**: Ver `docs/PULSAR_TASK_BACKLOG.md`
- **Reportes de sesión**: Crear `docs/SESSION_REPORT_YYYYMMDD.md` después de sesiones significativas

## Zonas sensibles (requieren cuidado)

- `src-tauri/src/` — Core del backend; cambios sin plan pueden romper el motor
- `data/` — Datos persistidos (SQLite, HNSW shards); loss irreversible
- `python-workers/` — Pipeline de procesamiento; cambios afectan el procesamiento real
- `assets/models/` — Modelo ONNX embebido; no debe modificarse sin justificación

## Propiedad intelectual y contribuciones

El código de Pulsaria es propietario y visible para evaluación. Al enviar una
contribución debes confirmar que tienes derecho a hacerlo y que no contiene
código, datos, contenido multimedia, credenciales o material de terceros sin
permiso.

Las contribuciones sólo se aceptarán mediante el DCO de este repositorio
mientras el titular no publique un CLA separado. Cada commit debe incluir una
línea `Signed-off-by: Nombre <correo>` y quien firma debe tener derecho a
conceder la licencia necesaria. No envíes una pull request si no puedes
conceder los derechos necesarios para que el titular revise, incorpore,
modifique y distribuya la contribución dentro del proyecto.

El DCO no cambia la licencia propietaria del código principal ni concede
permiso para redistribuir Pulsaria. Las contribuciones aprobadas se integran
bajo LICENSE; sus dependencias y materiales de terceros conservan sus propias
licencias.

La licencia aplicable al código principal se encuentra en LICENSE. Los
componentes de terceros conservan sus propias licencias descritas en
THIRD_PARTY_NOTICES.md.

## Seguridad y material público

Nunca publiques secretos, cookies, vídeos descargados, transcripciones,
bases SQLite, rutas privadas o información personal. Para vulnerabilidades,
usa SECURITY.md y no una issue pública.
