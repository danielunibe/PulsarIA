# Pulsaria — Project Truth

Este es el único documento normativo técnico y operativo de Pulsaria. Si otro
reporte, plan, auditoría o README contradice este archivo, prevalecen el código
actual, las pruebas reproducidas y esta definición de verdad.

## Objetivo y alcance

Pulsaria es un MVP local-first para Windows que importa contenido de TikTok que
el usuario está autorizado a procesar, genera video/audio/transcripción/análisis
visual, indexa localmente y permite búsqueda literal y semántica. Incluye IA
local opcional bajo demanda y una síntesis Gemini opcional que solo se puede
invocar desde el shell nativo, con aviso explícito de que los fragmentos
seleccionados pueden enviarse a Google. El MVP no incluye todavía traducción
automática, OCR avanzado, chat RAG conversacional, playlists inteligentes,
expansión formal a YouTube/Instagram, updater público, firma Authenticode ni
distribución estable a terceros.

## Fuente canónica

La rama activa es `main` en `origin`. Este checkout de producto parte de la
punta publicada `618bcb24`; las ramas antiguas se conservan como referencias
archivadas y no son líneas de desarrollo nuevas.

Las fuentes funcionales únicas son:

| Responsabilidad | Ubicación canónica |
| --- | --- |
| Frontend Next.js | `app/`, `components/`, `hooks/`, `lib/`, `types/` |
| Backend Tauri/Rust | `src-tauri/src/` |
| Workers Python | `python-workers/` |
| Capa semántica | `semantic/` |
| SDK | `sdk/typescript/` |
| Empaquetado | `src-tauri/tauri.conf.json` |
| Runtime preparado | `src-tauri/resources/`, staging generado y no versionado |

No se aceptan implementaciones paralelas bajo `assets/models/`,
`src-tauri/assets/models/`, `src-tauri/resources/models/` ni
`src-tauri/resources/python-workers/*.py`. Los workers que Tauri copia al
bundle son derivados de `python-workers/` y no son una segunda fuente.

## Contrato de runtime

Todos los recursos empaquetados se resuelven bajo una sola raíz:

```text
PULSAR_RUNTIME_ROOT
  ├── src-tauri/resources       (desarrollo y preparación)
  └── <ejecutable>/resources    (bundle instalado)
```

`PULSAR_RUNTIME_ROOT` es el único override permitido. El código no acepta
FFmpeg, FFprobe, yt-dlp, Python o Tesseract encontrados casualmente por
`PATH`. Los modelos ONNX y Whisper viven bajo `assets/models/` dentro de esa
raíz; los modelos descargables de usuario se almacenan en `%LOCALAPPDATA%` o
en el directorio de datos configurado, nunca en el checkout.

El runtime externo debe prepararse con:

```powershell
$env:PULSAR_RUNTIME_ROOT = (Resolve-Path .\src-tauri\resources).Path
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-runtime.ps1 `
  -RuntimeBundle <directorio-del-runtime-aprobado>
```

El bundle externo debe aportar `python/`, `assets/models/` y `bin/` con
`ffmpeg.exe`, `ffprobe.exe` y `FFMPEG-LICENSE.txt`. Cada entrega se identifica
por plataforma, versión, procedencia, tamaño y SHA-256 en el manifiesto. Los
instaladores, Python embebido, FFmpeg/FFprobe, ONNX y Whisper son artefactos de
release y no blobs normales del repositorio.

El bundle instalado mantiene los recursos de solo lectura bajo la carpeta
`resources/` junto al ejecutable. El estado escribible usa
`%APPDATA%\Pulsar Eventide` en instalaciones nuevas y reutiliza
`%APPDATA%\Pulsaria` únicamente cuando existe ese directorio legado y aún no
existe el canónico, para no dejar huérfanos los datos de usuarios existentes.
Los medios se guardan en la carpeta seleccionada (por defecto
`%USERPROFILE%\Downloads\Pulsaria`); la prueba instalada también confirma que
no se crea estado junto al ejecutable ni dentro de `resources/`.

## Configuración e idioma

La configuración local conserva `Locale = 'es-MX' | 'en-US'`, inicia en
`es-MX` cuando no existe selección guardada, persiste la elección y permite
cambiarla posteriormente desde Ajustes. La interfaz usa `I18nProvider` y
fallback a español para claves inglesas ausentes. El contenido original,
metadata y transcripciones no se traducen automáticamente en el MVP.

## Validación oficial

Desde la raíz del repositorio:

```powershell
npm run verify:mvp
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-locale.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-runtime-manifest.ps1
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:python
```

Para un clon sin runtime preparado, el resultado esperado de la verificación
de recursos es `BLOCKED` hasta ejecutar `prepare-runtime.ps1`. Una build local
solo puede llamarse MVP instalada después de ejecutar el smoke de instalación
y, cuando exista una URL autorizada, el smoke live documentado en
`docs/MVP_STATUS.md`.

## Estado de gates — 2026-09-13

| Gate | Estado | Evidencia o límite |
| --- | --- | --- |
| Lint, TypeScript, build Next | PASS | Incluidos en `npm run verify:mvp` (13/13) |
| Locale es/en | PASS | `scripts/verify-locale.ps1`, incluido en `npm run verify:mvp` |
| Rust fmt/check/tests | PASS | 60 tests Rust sin fallos, incluidos persistencia atómica de ajustes, migración, reconciliación de storage, snapshots HNSW single/multi-shard, metadatos de modelo, cache local, JWT, validación TikTok, Gemini y loopback |
| Cache semántica desktop | PASS | Cache LRU acotada en memoria con TTL, invalidación por versión y métricas hit/miss; Redis ya no es dependencia de runtime |
| API REST local | PASS condicionado | Bind loopback y token JWT por proceso; health público y resto de rutas protegido. El frontend nativo obtiene el token por IPC |
| Metadatos de embeddings | PASS | Migración con backup previo, hash de modelo/tokenizer, dimensión y detección de índice obsoleto; la reindexación parcial conserva los datos anteriores |
| Python | PASS | 26 tests y un skip live intencional; incluye FFmpeg/FFprobe, duración desconocida, transcript vacío, artifacts y los 13 formatos de salida |
| Runtime preparado | PASS en staging local | 51/51 recursos canónicos verificados; Python, workers, ONNX, Whisper tiny, FFmpeg, FFprobe y licencia presentes |
| Auditoría de dependencias | PARTIAL | `npm audit --omit=dev` conserva 2 vulnerabilidades de producción; el fix disponible requiere la migración aislada a Next 16.3.5 |
| Instalador NSIS/MSI | PASS build + arranque Release local | NSIS `Pulsaria_0.1.0_x64-setup.exe`, 580,906,561 bytes, SHA-256 `C1B8683BA5D5137DB319B68D2F849FCF629EB9F6F19D1607D80D30FE0F7D90B8`; MSI `Pulsaria_0.1.0_x64_en-US.msi`, 707,754,713 bytes, SHA-256 `183626C56615DC3845D80C1692E819DD911A1CC15CC11DF609C03CDB70089828`; la build Release arranca con la base existente y la migración duplicada está cubierta por prueba; Authenticode/updater siguen pendientes |
| TikTok live | PASS parcial | El smoke instalado previo sobre NSIS `D69B6908…` pasó descarga/audio/análisis/reinicio/dedupe/URL inválida/search shape, exports `mp4/mp3/txt` y staging limpio; la muestra produjo transcript vacío válido, por lo que falta certificar voz reconocible |
| Contrato Gemini | PASS local condicionado | IPC nativo, clave solo en proceso Rust, validaciones de clave/prompt/respuesta/HTTP/timeout; requiere clave real para una llamada autorizada |
| Updater, firmas y Authenticode | BLOCKED_EXTERNAL | No se fabrican `latest.json`, `.sig`, claves ni firmas |
| Aceptación visual nativa | BLOCKED_EXTERNAL | Este host no expone una ventana Tauri para captura asistida; el preview de navegador no sustituye esa evidencia |
| Publicación GitHub | PARTIAL | `origin/main` apunta a `618bcb24`; el README, workflow, sitio y documentación están publicados. El instalador de evaluación se publica por separado sin Authenticode; la release estable firmada requiere configuración de secretos externos |

La tabla es un estado de trabajo, no reemplaza la salida de los verificadores.

### Evidencia de publicación canónica

La publicación de código y documentación de la base se realizó el 13 de septiembre de 2026 sobre `origin/main`, sin force push ni reescritura de historia. La punta publicada actual es `618bcb24`; la clonación limpia de esa base pasó `npm run verify:canonical` y el workflow canónico remoto terminó correctamente. Los instaladores generados se distribuyen mediante GitHub Releases y no se guardan como blobs normales del árbol fuente.

Las líneas anteriores permanecen como referencias históricas mediante tags `archive/*`; no se borraron ramas ni se presentan como líneas activas de desarrollo.

## Política de ramas y archivo

Solo `main` recibe desarrollo nuevo. No se borran ramas ni se reescribe
historia. Los tips anteriores se preservan mediante tags `archive/*` y se
documentan como históricos: `master`, `chestnut-dugout`,
`codex/next16-security-migration`, `codex/pulsaria-mvp-stabilization`,
`feat/frontend-integration` y la punta previa de `main`.

La integración de `chestnut-dugout` se auditó por `git show` y `git patch-id`.
Su commit de pipeline ya está representado por contratos posteriores del
checkout actual; su commit de runtime contiene copias que esta política
elimina. No se hace cherry-pick duplicado.

## Documentación

`README.md` es solo la entrada breve. `AGENTS.md` y `CONTRIBUTING.md` son
instrucciones subordinadas. Los documentos legales se mantienen separados por
su función. Auditorías, reportes, especificaciones y planes anteriores se
consideran históricos y están catalogados en `docs/archive/README.md`.

## Procedimiento para cambios

1. Confirmar que el checkout y `main` son la autoridad.
2. Ejecutar `npm run verify:canonical` y revisar `git status`.
3. Modificar únicamente la fuente canónica correspondiente.
4. Si cambia el runtime, actualizar el bundle externo, hashes y manifiesto; no
   copiar workers o modelos a una ruta alternativa.
5. Ejecutar los gates oficiales y registrar evidencia en `docs/MVP_STATUS.md`.
6. Hacer un commit lógico, revisar el diff y publicar solo por fast-forward.

## Apertura de nuevas fases

Una fase nueva se abre solo cuando todos los gates del MVP local están en PASS
y su evidencia distingue correctamente pruebas estáticas, bundle instalado,
smoke nativo y procesamiento live. El orden posterior es: benchmark Whisper
en español, OCR, chat RAG, playlists inteligentes, expansión multiplataforma y
release pública firmada. Gemini permanece disponible únicamente como síntesis
manual opcional y no es un requisito del procesamiento local.
