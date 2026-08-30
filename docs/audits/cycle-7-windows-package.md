# Ciclo 7 — regresión completa y paquete Windows

## Veredicto

Este ciclo queda **cerrado**: Pulsar Eventide produce un instalador NSIS para Windows, incluye un runtime Python portable y los recursos multimedia necesarios, se instala silenciosamente en una carpeta temporal, arranca desde el árbol instalado y responde mediante el gateway local. La aplicación instalada no depende de Node.js, Rust, Python ni FFmpeg instalados globalmente para sus rutas bundleadas.

El artefacto final es:

```text
src-tauri/target-tauri/release/bundle/nsis/pulsar-eventide_0.1.0_x64-setup.exe
```

Tamaño observado: **299,882,337 bytes**. El instalador se configuró como instalación por usuario actual (`currentUser`), evitando requerir elevación administrativa para la ruta estándar.

## Cambios de empaquetado

| Área | Implementación | Resultado |
|---|---|---|
| Runtime Python | Python embebible 3.11.9 en `src-tauri/resources/python`, con `site-packages` de Faster-Whisper, CTranslate2, yt-dlp, ffmpeg-python, Pillow, NumPy y dependencias transitivas. | El worker arranca desde el paquete sin depender de un Python del sistema. |
| Workers | Los `.py` de `python-workers` se incluyen como `resources/python-workers`. Python se ejecuta con su directorio de worker en `sys.path` mediante `python311._pth`, `cwd` y `PYTHONPATH`. | Se corrigió el fallo real encontrado en el primer smoke test (`ModuleNotFoundError: models`). |
| Modelos | Se incluyeron `all-MiniLM-L6-v2` y el modelo local Whisper tiny en `resources/assets/models`. | Embeddings e inferencia Whisper tienen una ruta portable; no requieren descargar el modelo en el primer uso. |
| FFmpeg | `ffmpeg.exe` se incluye en `resources/bin` y los resolutores de audio y análisis visual lo priorizan. | Conversión MP4→MP3 y keyframes no dependen del PATH del usuario. |
| Rutas bundleadas | QueueManager, QueueService y PythonWorker priorizan `current_exe/resources` y conservan fallbacks de desarrollo. | La cola Tauri, expansión REST y worker persistente usan la misma estrategia. |
| Datos escribibles | `db::data_dir_path()` usa `PULSAR_DATA_DIR` cuando está definido, conserva `data/` en desarrollo y usa `%APPDATA%\\Pulsar Eventide` en instalación. El procesamiento se fija en el directorio de descargas configurable. | El paquete no intenta escribir SQLite o procesamiento dentro de Program Files. |
| Tauri | `tauri.conf.json` incluye recursos, objetivos NSIS/MSI, modo `currentUser` y el identificador `com.pulsar.eventide`. | `tauri build --bundles nsis` completa y no emite el warning anterior del identificador terminado en `.app`. |
| Dependencias frontend | Se retiró el `pnpm-lock.yaml` accidental. `package-lock.json` queda como lockfile único. | `tauri info` ya no advierte mezcla de gestores. |

## Regresión ejecutada

La regresión de fuente se ejecutó después de los cambios finales con estos resultados:

| Comando | Resultado |
|---|---|
| `npm run build` | PASS; Next.js 15.5.23 compiló, generó `/` estática, verificó tipos y terminó correctamente. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | PASS. |
| `cargo check --manifest-path src-tauri/Cargo.toml` | PASS. |
| `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` | PASS; **12 passed, 0 failed**. |
| `python -m compileall -q python-workers` | PASS. |
| `python python-workers/main.py --help` | PASS; CLI de worker visible. |
| `tauri build --bundles nsis` | PASS; instalador NSIS producido. |

La suite Rust mantuvo cobertura de seguridad de URLs, colecciones TikTok, errores persistidos, análisis visual, retención, fuentes únicas, clustering de embeddings BLOB, búsqueda literal y parser UNIB.

## Smoke test del instalador

El instalador final se ejecutó con `/S` en `target-tauri/packaged-smoke`, una carpeta temporal aislada. Se verificó la presencia de `pulsar-eventide.exe`, `resources/python/python.exe`, `resources/python-workers/main.py`, `resources/bin/ffmpeg.exe`, `model.onnx` y `tokenizer.json`.

El ejecutable instalado se arrancó con `PULSAR_DATA_DIR` y `PULSAR_DOWNLOAD_DIR` apuntando a carpetas temporales. El gateway respondió:

```text
health=ok
```

Las rutas instaladas de búsqueda devolvieron el shape esperado sin corpus externo:

```text
literal_shape=True
semantic_shape=True
```

El worker instalado se ejecutó desde la carpeta extraída y mostró su ayuda CLI, confirmando que el `_pth` portable ya encuentra los módulos. FFmpeg bundleado reportó:

```text
ffmpeg version 8.1.2-full_build-www.gyan.dev
```

La prueba audiovisual aislada, sin red, generó un MP4 sintético con pista de audio, extrajo MP3 y analizó cinco keyframes desde el paquete. Resultado:

```text
analysis_mode=keyframe-statistics+ocr-optional frame_count=5 error=None
pipeline_fixture=ok audio_bytes=4972 frames=5
```

La carpeta temporal y su base de datos fueron eliminadas después de la prueba. Se conserva solamente el instalador final, los recursos del proyecto y la evidencia documental.

## Operación del usuario final

El usuario debe ejecutar el instalador NSIS y abrir Pulsar Eventide desde el acceso creado. La biblioteca y configuración viven en `%APPDATA%\\Pulsar Eventide`; los videos se procesan en la carpeta de Descargas por defecto y el destino puede cambiarse desde Settings. Para una fuente TikTok, el usuario pega un enlace de video o colección autorizada; las cookies del navegador siguen siendo opt-in y no se copian ni se persisten como credenciales.

El paquete incluye las piezas locales para descargar, extraer audio, transcribir, crear embeddings, analizar keyframes, generar el instructivo audiovisual y buscar literal o semánticamente. La disponibilidad de una fuente TikTok concreta sigue dependiendo de autenticación, permisos, restricciones y cambios del servicio remoto.

## Límites explícitos

No se descargó un video real de TikTok ni se ejecutó expansión de un perfil o playlist remoto: el usuario no proporcionó una URL pública permitida con consentimiento explícito. Esa decisión evita una descarga externa no autorizada y no invalida el smoke test local del instalador.

La interfaz se auditó por código, TypeScript, ESLint, build y contratos de runtime. No se afirma una auditoría visual automatizada de clics porque el método independiente disponible había devuelto 504 para el listener IPv6 de Pulsaria en ciclos anteriores y el listener IPv4 de `127.0.0.1:3000` pertenecía a Pixvoxia. El ejecutable, el gateway y los recursos se validaron fuera del navegador.

Tesseract no está incluido en este paquete; el análisis visual funciona con keyframes y estadísticas Pillow y marca OCR como opcional cuando el binario no existe. No se presenta esa salida como detección general de objetos.

## Estado de entrega

**Pulsar Eventide MVP está entregado como instalador Windows NSIS funcional para las rutas locales y de runtime empaquetado.** El archivo anterior es el artefacto que debe conservarse o distribuirse. No se realizaron commits, pushes ni configuración de remotos.
