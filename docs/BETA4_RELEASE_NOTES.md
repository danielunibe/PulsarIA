# Pulsaria Beta 4 — 0.1.0-beta.4

Pulsaria Beta 4 es una prerelease para Windows x64 de una biblioteca audiovisual
local-first. Reúne contenido de TikTok que la persona está autorizada a procesar,
lo organiza en una biblioteca local y permite volver a encontrar clips por su
transcripción, sus palabras o su tema.

> Beta 4 no es una versión estable. La publicación y el instalador descargable
> quedan sujetos a la aceptación del artefacto exacto y a las revisiones legales
> y humanas indicadas en esta release.

## Funciones destacadas

- **Una biblioteca para tus clips:** importa enlaces y fuentes de perfil de
  TikTok disponibles para tu sesión, con seguimiento de cola, progreso,
  duplicados, errores y reintentos.
- **Perfiles con control de consulta:** agregar guarda la configuración sin
  descargar. Consulta todo lo disponible o 20, 50 o 100 videos recientes por
  fuente y abre el perfil o una pestaña. Reproduce online el video elegido y
  activa el procesamiento gradual en Inicio: uno a la vez, con 30 segundos
  de espera entre videos, mediante la misma cola de Pulsaria.
  Las fuentes que requieren sesión se indican por separado.
- **Transcripción y referencias visuales:** extrae audio, genera transcripciones
  y conserva metadatos y keyframes cuando los recursos de procesamiento y el
  contenido lo permiten. La precisión depende del audio y del material fuente.
- **Búsqueda que entiende más que títulos:** encuentra coincidencias literales
  y, cuando el índice semántico está preparado, coincidencias por significado.
  Los resultados pueden llevar al fragmento o momento relacionado.
- **Organización y reproducción:** agrupa videos en playlists, sigue fuentes
  disponibles y revisa la biblioteca en Cinema con controles de reproducción y
  transcripción sincronizada cuando hay marcas de tiempo.
- **Exportaciones portátiles:** exporta medios y transcripciones en formatos
  disponibles como MP4, MP3 y TXT; también puede copiar fichas y exportar datos
  de índice en JSON, Markdown o `.unib`. `.unib` no incluye los videos.
- **IA bajo tu control:** la preparación del modelo de IA local es opcional y
  bajo demanda. Gemini también es opcional; requiere configuración y una acción
  explícita, y envía los fragmentos seleccionados al servicio de Google.
- **Biblioteca local-first:** los medios, transcripciones, búsquedas y resultados
  se guardan localmente por defecto. No hay analytics de uso ni reportes remotos
  de fallos en esta beta.
- **Interfaz bilingüe de escritorio:** Pulsaria ofrece español de México e
  inglés, con preferencias y controles para reproducción, búsqueda,
  almacenamiento y procesamiento.

## Descargar y verificar

Cuando esta prerelease aparezca en GitHub Releases, usa el instalador NSIS
`.exe` y el archivo `SHA256SUMS.txt` publicados junto con la procedencia, el
SBOM SPDX y los avisos/materiales de terceros. En PowerShell, desde la carpeta
de descarga:

```powershell
Get-FileHash .\Pulsaria_0.1.0-beta.4_x64-setup.exe -Algorithm SHA256
```

El valor debe coincidir con el archivo de hashes de esa misma release. La
aprobación se refiere a ese instalador exacto; si se reconstruye, se repite la
aceptación.

## Alcance y límites de la beta

- Solo Windows x64 y contenido de TikTok que tengas derecho a procesar. Pulsaria
  no es una aplicación oficial ni está afiliada con TikTok.
- El acceso a perfiles o colecciones depende de la sesión, la disponibilidad y
  las condiciones de la plataforma. No se garantiza una descarga para cada URL.
- La transcripción puede contener errores; no se promete reconocimiento de voz
  perfecto, traducción automática ni OCR general.
- La búsqueda conceptual requiere un índice semántico disponible. Las tareas de
  importación, recursos solicitados y funciones Gemini usan red cuando se
  activan.
- Beta 4 no es una versión estable, no tiene firma Authenticode ni updater
  público. Windows puede mostrar una advertencia de SmartScreen.

Consulta la [guía de instalación](./INSTALL-WINDOWS.md), la [política de
contenido](../CONTENT_POLICY.es.md), la [política de privacidad](../PRIVACY.es.md)
y el [catálogo de funciones](./marketing/PULSARIA_CATALOGO_FUNCIONES_MARKETING_ES.md).
