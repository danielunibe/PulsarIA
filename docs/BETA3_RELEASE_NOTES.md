# Pulsaria Beta 3 — 0.1.0-beta.3

Beta pública gratuita para Windows x64. Instala `Pulsaria_0.1.0-beta.3_x64-setup.exe` desde los assets de esta release.

## Instalación y primer uso

1. Descarga el EXE y `SHA256SUMS.txt`. En PowerShell ejecuta `Get-FileHash .\Pulsaria_0.1.0-beta.3_x64-setup.exe -Algorithm SHA256` y compara el resultado con la entrada del EXE.
2. Ejecuta el instalador para tu usuario y abre Pulsaria. El paquete incluye WebView2 offline y el runtime local; el usuario no necesita herramientas de desarrollo.
3. Revisa el onboarding y procesa únicamente contenido propio o autorizado. Pega un enlace TikTok accesible, espera el procesamiento y consulta el resultado en la biblioteca.
4. Prueba búsqueda, reproducción y exportación. Conserva tus archivos y biblioteca antes de actualizar o cambiar la carpeta de almacenamiento.

## Capacidades del programa

Biblioteca y trabajos persistentes, procesamiento local de video y audio, transcripción Whisper, análisis visual base, búsqueda literal y semántica, fuentes TikTok accesibles, playlists manuales, Cinema, ajustes y exportación. La disponibilidad de una fuente remota depende también de permisos y del servicio externo.

## Distribución y límites

Es una **beta**, distribuida sin firma Authenticode y sin actualizador automático. Windows puede mostrar un aviso de SmartScreen. Descarga únicamente desde esta release oficial y comprueba los hashes.

El alcance es Windows x64 y contenido TikTok autorizado. No se anuncia soporte general para otras plataformas, traducción automática, OCR avanzado ni release estable. Gemini es opcional y requiere una acción explícita; el procesamiento local no depende de una clave cloud. El modelo de IA local opcional se descarga por separado bajo demanda.

Los assets incluyen inventario SPDX, licencia de Pulsaria, notices, materiales revisados de terceros, hashes y `release-provenance.json`, que identifica el commit y la ejecución de Actions que produjeron el instalador. Los términos de cada tercero conservan su vigencia.

## Soporte

Reporta fallos mediante las [plantillas de GitHub Issues](https://github.com/danielunibe/PulsarIA/issues/new/choose). Incluye versión, Windows, pasos y error observado. No adjuntes credenciales, cookies, contenido privado ni rutas personales sin ocultarlas. Para reportes de seguridad consulta [SECURITY.md](https://github.com/danielunibe/PulsarIA/blob/main/SECURITY.md).
