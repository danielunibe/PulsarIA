# Pulsaria — instalación Windows x64

## Estado del artefacto y contrato runtime

El instalador aprobado debe ser un artefacto release generado desde el checkout verificado. Este documento no congela un hash de un instalador antiguo: el nombre, tamaño y SHA-256 se deben tomar del archivo que se vaya a distribuir y conservar en la hoja de evidencia de release.

El contrato reproducible de recursos está en [`src-tauri/resources/runtime-manifest.json`](../src-tauri/resources/runtime-manifest.json). Incluye los hashes de Python embebido, módulos críticos, workers Python, ONNX/MiniLM, Whisper tiny, FFmpeg y FFprobe. El manifest excluye timestamps para que pueda regenerarse y compararse de forma determinista.

Estado actual del checkout: **PASS** para el contrato fuente de recursos: `ffmpeg.exe`, `ffprobe.exe` y `FFMPEG-LICENSE.txt` están presentes y sus hashes se registran en el manifest. El gate no acepta como sustituto un ejecutable instalado en `PATH`, no descarga binarios y no copia ejecutables sin evidencia de redistribución/licencia. El instalador debe reconstruirse después de cualquier cambio en estos recursos; un bundle anterior al manifest se marca como bloqueado por el smoke instalado.

El instalador se configuró para el usuario actual, por lo que la instalación estándar no requiere elevar privilegios. Un bundle válido contiene el frontend, el ejecutable Tauri, Python embebible 3.11.9, workers, Faster-Whisper, CTranslate2, yt-dlp, Pillow, los modelos ONNX/MiniLM, FFmpeg, FFprobe y la evidencia de licencia distribuida junto a ellos.

## Instalación

Ejecuta el archivo `.exe` y conserva la carpeta propuesta por el instalador. Después de terminar, abre **Pulsaria** desde el acceso creado. Cuando el bundle haya pasado el smoke instalado, no será necesario instalar Node.js, Rust, Python, FFmpeg ni FFprobe: los recursos se ejecutarán desde la instalación.

Para verificar el archivo antes de ejecutarlo, abre PowerShell en la carpeta donde se descargó y ejecuta:

```powershell
Get-FileHash .\pulsaria_0.1.0_x64-setup.exe -Algorithm SHA256
```

El valor debe coincidir con la suma registrada para ese artefacto en la evidencia de release.

## Verificación reproducible de recursos

Desde la raíz del repositorio, antes de construir o distribuir un instalador:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-runtime-manifest.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-runtime-manifest.ps1
```

El generador escribe el manifest aunque exista un bloqueo para que el diagnóstico quede disponible, pero devuelve código distinto de cero. El verificador también devuelve código distinto de cero si falta un recurso requerido, si cambia su tamaño/hash o si `tauri.conf.json` no empaqueta el manifest. En el checkout actual la verificación fuente devuelve `PASS`; si FFprobe desaparece o cambia, debe devolver `BLOCKED`, nunca ocultar el fallo con el ejecutable del sistema.

Después de construir un bundle, el smoke de instalación comprueba el manifest dentro de `resources/`, además de comprobar que FFmpeg y FFprobe estén instalados junto al ejecutable:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-installed-bundle.ps1 -Configuration debug
```

Ese smoke se detiene antes de iniciar la aplicación si los recursos no se pueden verificar. La prueba release equivalente debe ejecutarse en un host controlado y no debe reutilizar un perfil productivo.

## Primer uso

En **Add Links**, pega un enlace de video TikTok autorizado o la fuente de una colección que el usuario pueda consultar. Pulsaria registra el job, expande colecciones cuando la fuente pública lo permite, descarga el material mediante yt-dlp, extrae audio, transcribe con Faster-Whisper, analiza keyframes, genera el instructivo audiovisual, crea embeddings locales y actualiza la biblioteca.

En la cabecera se puede elegir explícitamente **Literal** para buscar palabras presentes en transcript, título o autor, o **Semántica** para buscar conceptos mediante embeddings ONNX/HNSW. Los resultados abren la ficha correcta y permiten consultar transcript, timestamps, instructivo, fuente original y exportación UNIB.

La carpeta de Descargas del usuario es el destino inicial de los medios procesados y puede cambiarse desde **Settings**. La base SQLite, configuración y snapshots se guardan en `%APPDATA%\\Pulsaria`; los recursos de instalación son de solo lectura y no se usan como directorio de datos. Los jobs configurados como online-only pueden conservar el conocimiento y abrir la fuente original sin mantener el archivo local.

## Cookies y fuentes restringidas

El uso de cookies del navegador es opcional y se selecciona por nombre de navegador en Settings. Pulsaria utiliza esa sesión solo para la operación de descarga y no copia cookies a SQLite ni las persiste como contenido de una fuente. Una cuenta sin acceso, un rate limit o una colección privada puede producir un error visible del job; eso depende del servicio remoto, no del instalador local.

## Diagnóstico local

La aplicación inicia su gateway local en `127.0.0.1:8080`. Si la biblioteca no carga, revisa primero que el proceso de Pulsar esté activo y que `%APPDATA%\\Pulsaria` sea escribible. Si un job falla, la sección **Queue** conserva el mensaje de error y permite distinguir una falta de acceso remoto, una URL inválida o una dependencia del worker.

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
[3]: ../README.md "README de Pulsaria"
