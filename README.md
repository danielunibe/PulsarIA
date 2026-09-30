# Pulsaria

Pulsaria es una biblioteca audiovisual local-first para Windows. Permite
importar contenido de TikTok que el usuario está autorizado a procesar,
convertirlo en video, audio, transcripción y análisis visual, y buscarlo por
palabras o por significado desde una biblioteca local.

> Pulsaria está en beta. El instalador de evaluación disponible en Releases
> es funcional, pero todavía no es una release estable firmada con
> Authenticode ni tiene updater público habilitado.

## Descargar e instalar

La versión pública actual es `v0.1.0-eval.3`. Puedes descargar gratis el
instalador NSIS o MSI para Windows x64, o consultar la
[release completa](https://github.com/danielunibe/PulsarIA/releases/tag/v0.1.0-eval.3):

- [Descargar NSIS (EXE)](https://github.com/danielunibe/PulsarIA/releases/download/v0.1.0-eval.3/Pulsaria_0.1.0_x64-setup.exe)
- [Descargar MSI](https://github.com/danielunibe/PulsarIA/releases/download/v0.1.0-eval.3/Pulsaria_0.1.0_x64_en-US.msi)

Antes de ejecutar el archivo, comprueba su integridad en PowerShell:

```powershell
Get-FileHash .\Pulsaria_0.1.0_x64-setup.exe -Algorithm SHA256
Get-FileHash .\Pulsaria_0.1.0_x64_en-US.msi -Algorithm SHA256
```

SHA-256 de los assets publicados en GitHub:

```text
NSIS: 1ABD7589C2E8943AEFC1AC8484B2133312D54C18F58BA306DC869031FB9551EF
MSI:  F092CDFA6DC736F13FEF8B17302B81E1BB181796639D68676F7244154DDCB2F4
```

Durante la instalación puedes conservar la carpeta propuesta. Al finalizar,
abre Pulsaria desde el acceso creado. La aplicación guarda el estado nuevo en
`%APPDATA%\Pulsar Eventide` y mantiene compatibilidad con bibliotecas antiguas
en `%APPDATA%\Pulsaria`. Los medios se guardan en la carpeta de descargas que
elijas desde Settings.

Windows puede mostrar una advertencia de SmartScreen porque este candidato aún
no tiene certificado Authenticode. El archivo fue probado instalándolo,
iniciando la aplicación, comprobando su health check, reiniciándola y
desinstalándola en un directorio temporal. No ejecutes instaladores alterados
ni compartas tus datos de aplicación o cookies del navegador.

La guía completa está en
[docs/INSTALL-WINDOWS.md](docs/INSTALL-WINDOWS.md).

## Qué hace Pulsaria

- Importa videos, perfiles, favoritos y colecciones de TikTok mediante URLs
  que el usuario puede consultar y procesar legalmente.
- Descarga el contenido solicitado, extrae audio y genera transcripciones.
- Conserva análisis visual, keyframes, metadata y exportaciones MP4, MP3 y
  TXT.
- Permite búsqueda literal y búsqueda semántica local con embeddings, HNSW y
  BM25.
- Incluye una cola local con reintentos, deduplicación y recuperación después
  de reiniciar la aplicación.
- Incluye IA local opcional bajo demanda. La síntesis Gemini es opcional y
  sólo se ejecuta tras una acción explícita desde el shell nativo.
- Ofrece interfaz en español de México e inglés.

El alcance actual es deliberadamente TikTok local-first. No se presenta como
una herramienta oficial de TikTok ni incluye todavía expansión formal a
YouTube/Instagram, OCR avanzado, chat RAG conversacional, playlists
inteligentes o traducción automática.

## Privacidad y uso responsable

Los videos, audios, transcripciones, embeddings, búsquedas y resultados locales
permanecen en el equipo por defecto. Pulsaria no incluye analytics, telemetría
de uso ni crash reporting remoto en el beta.

Puede existir tráfico de red cuando tú lo solicitas para importar una URL,
descargar un modelo local, comprobar una release o ejecutar manualmente una
síntesis Gemini. La interfaz debe mostrar esta transferencia antes de enviar
fragmentos a Google.

Sólo procesa contenido propio, autorizado o con una base legal suficiente.
No uses Pulsaria para acceder a contenido privado, evadir controles, extraer
credenciales o redistribuir material de terceros. Consulta
[CONTENT_POLICY.es.md](CONTENT_POLICY.es.md), [PRIVACY.es.md](PRIVACY.es.md),
[TERMS_OF_USE.es.md](TERMS_OF_USE.es.md) y [EULA.es.md](EULA.es.md) antes de
usar una release.

## Requisitos del instalador

- Windows x64 compatible con WebView2.
- Espacio libre suficiente para la aplicación, el runtime local y los medios
  que decidas conservar.
- Conexión a Internet sólo para las operaciones que tú inicies.
- No es necesario instalar herramientas de desarrollo para usar el instalador.

El runtime portable de Python, FFmpeg/FFprobe, ONNX, Whisper y otros recursos
pesados se entregan como parte del bundle de instalación aprobado; no se
guardan como blobs en el repositorio fuente.

## Desde el código fuente

Para desarrollo se necesita Node.js 20+, Rust/Cargo, Python 3.10+ y las
dependencias de Python:

```powershell
npm ci
pip install -r python-workers/requirements.txt
npm run tauri dev
```

Para preparar un build instalado se requiere el runtime externo aprobado:

```powershell
$env:PULSAR_RUNTIME_ROOT = (Resolve-Path .\src-tauri\resources).Path
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-runtime.ps1 `
  -RuntimeBundle <directorio-del-runtime-aprobado>
npm run tauri build -- --bundles nsis
```

No se deben copiar Python, modelos, FFmpeg, instaladores ni bases de datos al
repositorio. La preparación externa y su SHA-256 se verifican mediante el
workflow de release.

## Estado de Beta 3

El candidato actual es `0.1.0-beta.3`, preparado en el
[PR #2](https://github.com/danielunibe/PulsarIA/pull/2). **Beta 3 todavía no está
publicada**; la descarga pública continúa siendo `v0.1.0-eval.3`.

La verificación local de Beta 3 pasó `verify:mvp` (13/13), 103 pruebas Rust,
31 pruebas Python y 1 skip live, además de accesibilidad, iconos, modelo local
y auditoría de producción sin vulnerabilidades. Estos resultados no sustituyen
la aceptación del instalador definitivo ni la prueba TikTok autorizada.

El flujo directo separa `build` y `publish`: conserva EXE, SPDX, notices,
licencia, materiales de terceros, procedencia y hashes como artifact de Actions.
El Environment `direct-download` aprueba ese mismo artifact antes de publicarlo;
no se recompila después de aceptar. La presentación pública y el correo de
contacto se eligieron desde el perfil público de GitHub por delegación del
usuario; no acreditan identidad legal, control del buzón ni domicilio de
notificación. La revisión legal y la aceptación siguen pendientes, y
`DIRECT_DOWNLOAD_RELEASE_READY` permanece en `false`.

Consulta el [informe Beta 3](docs/BETA3_RELEASE_EVIDENCE.md), la
[aceptación del instalador](docs/BETA3_ACCEPTANCE.md) y los
[checks del PR](https://github.com/danielunibe/PulsarIA/pull/2/checks).
[PROJECT_TRUTH.md](PROJECT_TRUTH.md) conserva la autoridad normativa.

Para soporte utiliza las [plantillas de Issues](https://github.com/danielunibe/PulsarIA/issues/new/choose)
sin adjuntar datos privados.

## Release y updater

El workflow [Pulsaria public release](.github/workflows/release.yml) genera
NSIS/MSI, firmas Tauri, `latest.json`, `.sig` y `SHA256SUMS.txt` cuando el
Environment `release` tiene todas las credenciales y el runtime externo.
Mientras `RELEASE_READY` no sea `true`, las etiquetas no ejecutan un job de
release incompleto y quedan sin notificaciones de fallo.

La ruta de descarga directa está en
[direct-download-release.yml](.github/workflows/direct-download-release.yml).
Es una ejecución manual para un tag revisado: genera SPDX, valida
el runtime y materiales de terceros, construye y prueba NSIS y guarda el paquete
para aceptación. Solo el job de publicación requiere
`DIRECT_DOWNLOAD_RELEASE_READY=true` y aprobación del Environment. Los gates
legales deben pasar antes de construir el paquete público. La
ejecución debe despacharse desde `main`; el tag tiene que apuntar a un commit ya integrado
en `main` y su versión debe coincidir con la fuente. No firma el instalador ni
crea artefactos del updater.

La release de evaluación no activa el updater público. Una release estable
requiere clave pública Tauri, clave privada, certificado Authenticode,
timestamp HTTPS, runtime con SHA-256, SBOM y revisión legal humana.

## Documentación

- [Instalación Windows](docs/INSTALL-WINDOWS.md)
- [Estado del MVP](docs/MVP_STATUS.md)
- [Runbook de release pública](docs/RELEASE_PUBLICA.md)
- [Arquitectura](ARCHITECTURE.md)
- [Política de seguridad](SECURITY.md)
- [Avisos de terceros](THIRD_PARTY_NOTICES.md)
- [Auditoría reconciliada](docs/PULSARIA_RECONCILIATED_AUDIT_MATRIX.md)

## Soporte

Usa [GitHub Issues](https://github.com/danielunibe/PulsarIA/issues) para
reportar errores. Incluye versión, sistema operativo y pasos reproducibles;
nunca adjuntes videos, audios, cookies, transcripciones o bases de datos de
terceros.

## Licencia

Consulta [LICENSE](LICENSE), [EULA.es.md](EULA.es.md) y
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). TikTok, ByteDance, Google y
las demás plataformas mencionadas son marcas y servicios independientes de
Pulsaria.
