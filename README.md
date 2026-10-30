# Pulsaria

Pulsaria es una biblioteca audiovisual local-first para Windows. Organiza
contenido de TikTok que tienes autorización para procesar y te ayuda a volver a
encontrar clips por sus palabras, transcripciones y temas.

> **Estado:** la descarga pública verificada sigue siendo Eval.3. Beta 4
> (`0.1.0-beta.4`) está en preparación; aún no se publica como instalador.

## Descarga pública actual

La release disponible es [Pulsaria Eval.3 en GitHub Releases](https://github.com/danielunibe/PulsarIA/releases/tag/v0.1.0-eval.3),
con instaladores gratuitos para Windows x64:

- [Instalador NSIS (.exe)](https://github.com/danielunibe/PulsarIA/releases/download/v0.1.0-eval.3/Pulsaria_0.1.0_x64-setup.exe)
- [Instalador MSI](https://github.com/danielunibe/PulsarIA/releases/download/v0.1.0-eval.3/Pulsaria_0.1.0_x64_en-US.msi)

Comprueba las descargas con estos SHA-256:

```text
NSIS: 1ABD7589C2E8943AEFC1AC8484B2133312D54C18F58BA306DC869031FB9551EF
MSI:  F092CDFA6DC736F13FEF8B17302B81E1BB181796639D68676F7244154DDCB2F4
```

La [guía de instalación](./docs/INSTALL-WINDOWS.md) incluye requisitos, pasos y
verificaciones. Eval.3 no es una versión estable firmada y no activa el updater
público.

## Funciones destacadas

- **Biblioteca audiovisual local:** conserva fichas, medios, transcripciones,
  búsquedas y resultados en el equipo por defecto.
- **Procesamiento de clips:** extrae audio, genera transcripciones y conserva
  metadatos o keyframes cuando el material y los recursos lo permiten.
- **Búsqueda por frase o significado:** combina coincidencias literales con
  búsqueda semántica cuando el índice está preparado.
- **Organización y seguimiento:** reúne clips en playlists y permite trabajar
  con fuentes de perfil disponibles para tu sesión.
- **Modo Cinema:** reproduce la colección con navegación entre videos y
  transcripción sincronizada cuando existen marcas de tiempo.
- **Exportación:** ofrece formatos de video, audio y texto; fichas y datos de
  índice también pueden copiarse o exportarse.
- **IA opcional:** el modelo local se prepara bajo demanda; Gemini requiere
  configuración y una acción expresa, y envía los fragmentos elegidos a Google.
- **Escritorio bilingüe:** interfaz en español de México e inglés, con ajustes
  para búsqueda, reproducción, almacenamiento y procesamiento.

Consulta el [catálogo de funciones](./docs/marketing/PULSARIA_CATALOGO_FUNCIONES_MARKETING_ES.md)
para condiciones, límites y texto reutilizable de marketing.

## Beta 4

La prerelease candidata `0.1.0-beta.4` coordina versiones de npm, Tauri y Rust,
actualiza la ruta de release directo y prepara el instalador NSIS x64. Antes de
publicarla falta la aceptación del `.exe` exacto en Windows limpio, una prueba
TikTok autorizada con transcripción reconocible desde la aplicación y las
revisiones legales y humanas. La descripción lista para la release está en las
[notas de Beta 4](./docs/BETA4_RELEASE_NOTES.md); el estado operativo está en
[PROJECT_TRUTH.md](./PROJECT_TRUTH.md).

El contacto público de la beta se limita al nombre, correo y ciudad confirmados
por el titular. No se publicará un domicilio postal. La revisión legal debe
confirmar que ese método de contacto es suficiente antes de publicar; el control
de publicación de GitHub sigue desactivado mientras esa revisión y la aceptación
del artifact exacto estén pendientes.

## Privacidad y uso responsable

El procesamiento se limita a contenido propio o que tienes derecho a usar.
Pulsaria no está afiliada con TikTok. La importación, sincronización de fuentes,
descarga de recursos y síntesis opcional con Gemini pueden usar la red cuando
las inicias; el procesamiento local no convierte esas operaciones en una
experiencia completamente offline. Revisa la [política de contenido](./CONTENT_POLICY.es.md),
la [privacidad](./PRIVACY.es.md), los [términos](./TERMS_OF_USE.es.md) y el
[EULA](./EULA.es.md).

## Requisitos

- Windows x64 compatible con WebView2.
- Espacio libre para la aplicación, los recursos de procesamiento y los medios
  que elijas conservar.
- No necesitas instalar Node.js, Rust, Python, FFmpeg ni FFprobe para usar un
  instalador aprobado.

## Desarrollo

```powershell
npm ci
pip install -r python-workers/requirements.txt
npm run tauri dev
```

Para instalar la aplicación desde el código fuente también se requiere el
runtime externo aprobado; consulta [CONTRIBUTING.md](./CONTRIBUTING.md) y
[scripts/README.md](./scripts/README.md).

## Documentación y soporte

La [guía de documentación](./docs/README.md) organiza instalación, políticas,
notas de beta y recursos para desarrolladores. Las auditorías obsoletas se
conservan en el [archivo histórico](./docs/archive/README.md); el estado vigente se
concentra en `PROJECT_TRUTH.md`.

Reporta errores en [GitHub Issues](https://github.com/danielunibe/PulsarIA/issues).
Incluye versión, sistema operativo y pasos reproducibles. No adjuntes videos,
audios, transcripciones privadas, cookies, credenciales ni bases de datos.

Pulsaria es independiente de TikTok, ByteDance, Google y las demás plataformas
mencionadas. Revisa [LICENSE](./LICENSE) y
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) para las condiciones de uso.
