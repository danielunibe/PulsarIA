# Materiales fuente FFmpeg — revisión del candidato Beta 3

Estado: **PARCIAL, sin aprobación de redistribución**. Este registro no cambia los binarios ni la licencia de Pulsaria.

El paquete exacto sigue siendo Gyan 8.1.2 full build, identificado en `FFMPEG_GYAN_8.1.2_INVENTARIO.md`. La [página del proveedor](https://www.gyan.dev/ffmpeg/builds/) declara GPLv3 para sus builds y distingue bibliotecas de essentials, full y soporte de hardware. El inventario debe usar las versiones del README del paquete exacto, no las listas actuales de una release posterior.

Ya se reunió la fuente del núcleo FFmpeg del commit `38b88335f99e76ed89ff3c93f877fdefce736c13`, configuración embebida y versiones. Sus hashes y ubicación están en `BETA3_RELEASE_EVIDENCE.md`. No se ha acreditado la totalidad de fuentes, parches, dependencias y entradas de compilación.

El 2026-09-30 se revisó también el [fork de media-autobuild_suite del proveedor](https://github.com/GyanD/media-autobuild_suite). Su rama `master` apunta a `05070f3f3151140a5c644ccd175c824cbf3513c9`, cuya fecha de commit es 2020-12-20. El repositorio de distribución `GyanD/codexffmpeg` contiene README y configuración de GitHub. Ninguno de esos hallazgos vincula una receta completa al build 8.1.2 de Pulsaria; no se incorporaron como materiales aprobados.

## Información que debe acreditarse

- Receta y herramientas utilizadas para el paquete `ffmpeg-8.1.2-full_build.zip`, incluido target/toolchain.
- Fuentes exactas de cada biblioteca enlazada, commits o archivos verificables, parches y configuración. Resolver referencias ambiguas como `latest`.
- Licencias y notices de cada componente, incluidas dependencias de las bibliotecas del inventario.
- Materiales con URLs y SHA-256 que permitan conservar y distribuir lo revisado junto al paquete.
- Revisión del titular sobre los documentos y la suficiencia de esos materiales, registrada explícitamente antes de cambiar `review_status`.

## Solicitud preparada al proveedor — no enviada

> We are preparing to redistribute ffmpeg.exe and ffprobe.exe from your exact ffmpeg-8.1.2-full_build.zip package as separate command-line programs in a Windows application. We have the package README, embedded build configuration and FFmpeg core commit 38b88335f99e76ed89ff3c93f877fdefce736c13. Could you provide or identify the corresponding sources for the external libraries, exact revisions, applied patches, build scripts/configuration and toolchain inputs for this package, including the component listed as openal-soft “latest”? We need to retain the exact materials and applicable license notices with our distribution.

El proveedor indica canales de consulta en su página. Este texto queda preparado para revisión; no se envió un correo ni se abrió un Issue externo en nombre del usuario.
