# Pulsar Eventide — instalación Windows

## Artefacto

El instalador final de 64 bits es `src-tauri/target-tauri/release/bundle/nsis/pulsar-eventide_0.1.0_x64-setup.exe`. Su tamaño es de 299,882,337 bytes y su SHA-256 es:

```text
1bcd4c0b67a8a9b8cc663210622d8b74ea1492fd01d2c8a543550fecff4b4605
```

El instalador se configuró para el usuario actual, por lo que la instalación estándar no requiere elevar privilegios. El paquete contiene el frontend, el ejecutable Tauri, Python embebible 3.11.9, workers, Faster-Whisper, CTranslate2, yt-dlp, Pillow, los modelos ONNX/MiniLM y FFmpeg.

## Instalación

Ejecuta el archivo `.exe` y conserva la carpeta propuesta por el instalador. Después de terminar, abre **Pulsar Eventide** desde el acceso creado. No es necesario instalar Node.js, Rust, Python ni FFmpeg para el funcionamiento de las rutas incluidas en el paquete.

Para verificar el archivo antes de ejecutarlo, abre PowerShell en la carpeta donde se descargó y ejecuta:

```powershell
Get-FileHash .\pulsar-eventide_0.1.0_x64-setup.exe -Algorithm SHA256
```

El valor debe coincidir con la suma indicada arriba.

## Primer uso

En **Add Links**, pega un enlace de video TikTok autorizado o la fuente de una colección que el usuario pueda consultar. Pulsar registra el job, expande colecciones cuando la fuente pública lo permite, descarga el material mediante yt-dlp, extrae audio, transcribe con Faster-Whisper, analiza keyframes, genera el instructivo audiovisual, crea embeddings locales y actualiza la biblioteca.

En la cabecera se puede elegir explícitamente **Literal** para buscar palabras presentes en transcript, título o autor, o **Semántica** para buscar conceptos mediante embeddings ONNX/HNSW. Los resultados abren la ficha correcta y permiten consultar transcript, timestamps, instructivo, fuente original y exportación UNIB.

La carpeta de Descargas del usuario es el destino inicial de los medios procesados y puede cambiarse desde **Settings**. La base SQLite, configuración y snapshots se guardan en `%APPDATA%\\Pulsar Eventide`. Los jobs configurados como online-only pueden conservar el conocimiento y abrir la fuente original sin mantener el archivo local.

## Cookies y fuentes restringidas

El uso de cookies del navegador es opcional y se selecciona por nombre de navegador en Settings. Pulsar utiliza esa sesión solo para la operación de descarga y no copia cookies a SQLite ni las persiste como contenido de una fuente. Una cuenta sin acceso, un rate limit o una colección privada puede producir un error visible del job; eso depende del servicio remoto, no del instalador local.

## Diagnóstico local

La aplicación inicia su gateway local en `127.0.0.1:8080`. Si la biblioteca no carga, revisa primero que el proceso de Pulsar esté activo y que `%APPDATA%\\Pulsar Eventide` sea escribible. Si un job falla, la sección **Queue** conserva el mensaje de error y permite distinguir una falta de acceso remoto, una URL inválida o una dependencia del worker.

El análisis visual base funciona con keyframes y estadísticas Pillow. OCR se marca como opcional cuando Tesseract no está presente; el paquete no presenta esa función como detección general de objetos.

## Desarrollo desde el repositorio

Para ejecutar el árbol fuente se requiere Node.js v20+, npm, Rust, Python 3.10+ y FFmpeg. La secuencia es:

```bash
npm install
pip install -r python-workers/requirements.txt
npm run tauri dev
```

Para regenerar el instalador:

```bash
npm run tauri build -- --bundles nsis
```

La evidencia de pruebas de este artefacto se encuentra en [Ciclo 7 — paquete Windows](cycle-7-windows-package.md) y la cobertura funcional de búsqueda/transcript/API en [Ciclo 6](cycle-6-search-transcript-api.md).

## Referencias internas

[1]: cycle-7-windows-package.md "Ciclo 7 — regresión completa y paquete Windows"
[2]: cycle-6-search-transcript-api.md "Ciclo 6 — búsqueda, transcript, UNIB y API local"
[3]: ../README.md "README de Pulsar Eventide"
