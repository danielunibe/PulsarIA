# Pulsaria — Project Truth

Este es el único documento normativo técnico y operativo de Pulsaria. Si otro
reporte, plan, auditoría o README contradice este archivo, prevalecen el código
actual, las pruebas reproducidas y esta definición de verdad.

## Objetivo y alcance

Pulsaria es un MVP local-first para Windows que importa contenido de TikTok que
el usuario está autorizado a procesar, genera video/audio/transcripción/análisis
visual, indexa localmente y permite búsqueda literal y semántica. El MVP no
incluye todavía traducción automática, OCR avanzado, Gemini/RAG conversacional,
playlists inteligentes, expansión formal a YouTube/Instagram, updater público,
firma Authenticode ni distribución estable a terceros.

## Fuente canónica

La rama activa es `main` en `origin`. El trabajo de esta consolidación parte
del checkout de `codex/pulsaria-mvp-stabilization`; las ramas antiguas se
conservan como referencias archivadas y no son líneas de desarrollo nuevas.

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
| Lint, TypeScript, build Next | PASS previo a esta consolidación | Reejecutar antes de publicar |
| Locale es/en | PASS previo a esta consolidación | `scripts/verify-locale.ps1` |
| Rust fmt/check/tests | PASS previo a esta consolidación | 34 tests Rust sin fallos antes del cambio de rutas |
| Python | PASS previo a esta consolidación | 18 tests y un skip live intencional |
| Runtime preparado | PASS en staging local | 56/56 recursos antes de regenerar el manifiesto canónico |
| Instalador NSIS/MSI | PASS local | Build `0.1.0`, SHA NSIS `77095348AA234D1152000A34DD02258DF68D9C8E5FF5267701063483FB12DB13` |
| TikTok live | PASS parcial | Descarga/audio/análisis/indexado/reinicio/dedupe/URL inválida/search shape; la muestra no produjo texto reconocible |
| Updater, firmas y Authenticode | BLOCKED_EXTERNAL | No se fabrican `latest.json`, `.sig`, claves ni firmas |
| Publicación GitHub | PENDIENTE | Requiere validación final, fast-forward y clonación limpia |

La tabla es un estado de trabajo, no reemplaza la salida de los verificadores.

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
en español, OCR, Gemini opcional, chat RAG, playlists inteligentes, expansión
multiplataforma y release pública firmada.
