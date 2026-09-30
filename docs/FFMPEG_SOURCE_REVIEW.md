# Materiales fuente FFmpeg — revisión del candidato Beta 3

Estado: **PARCIAL, sin aprobación de redistribución**. Este registro no cambia los binarios ni la licencia de Pulsaria.

El paquete exacto sigue siendo Gyan 8.1.2 full build, identificado en `FFMPEG_GYAN_8.1.2_INVENTARIO.md`. La [página del proveedor](https://www.gyan.dev/ffmpeg/builds/) declara GPLv3 para sus builds y distingue bibliotecas de essentials, full y soporte de hardware. El inventario debe usar las versiones del README del paquete exacto, no las listas actuales de una release posterior.

Ya se reunió la fuente del núcleo FFmpeg del commit `38b88335f99e76ed89ff3c93f877fdefce736c13`, configuración embebida y versiones. Sus hashes y ubicación están en `BETA3_RELEASE_EVIDENCE.md`. No se ha acreditado la totalidad de fuentes, parches, dependencias y entradas de compilación.

El 2026-09-30 se revisó también el [fork de media-autobuild_suite del proveedor](https://github.com/GyanD/media-autobuild_suite). Su rama `master` apunta a `05070f3f3151140a5c644ccd175c824cbf3513c9`, cuya fecha de commit es 2020-12-20. El repositorio de distribución `GyanD/codexffmpeg` contiene README y configuración de GitHub. Ninguno de esos hallazgos vincula una receta completa al build 8.1.2 de Pulsaria; no se incorporaron como materiales aprobados.

### Snapshot candidato de la suite — no vinculado al build 8.1.2

Se encontró una rama más reciente, `patch-7`, en el commit [`1ce81b161a96c9757b7eb94170639b963fccd280`](https://github.com/GyanD/media-autobuild_suite/tree/1ce81b161a96c9757b7eb94170639b963fccd280), fechado 2026-05-31. Se descargaron cuatro scripts desde ese commit y se cotejó cada archivo con su URL `raw.githubusercontent.com`; los hashes SHA-256 son:

| Archivo en `build/` | SHA-256 |
| --- | --- |
| `media-suite_compile.sh` | `3F2BA53D87F550A907D40B4032D5246EDD081B7D10904BD144C88BBC06EB4C4A` |
| `media-suite_deps.sh` | `CA18F1E6B6B2515194B6061F2BB19F88C1AC178BD7E60541236FBFDF584D7B52` |
| `media-suite_helper.sh` | `5CF53B6A88C4C970DDAAFDCD73EE461A0703901241FB918727A896295F1A593C` |
| `media-suite_update.sh` | `663B6AFF9D16C6C18121087F974FFF972A30EB64478A3B9E325569CD7D749A48` |

La revisión estática muestra que la suite obtiene numerosos repositorios mediante etiquetas móviles; por ejemplo, `media-suite_deps.sh` declara `SOURCE_REPO_OPENAL=...#tag=latest`, y `media-suite_helper.sh` resuelve la etiqueta más reciente al preparar una compilación. El snapshot, por tanto, no fija por sí mismo las revisiones exactas ni los parches usados para el paquete 8.1.2. Su fecha cercana a la release y su contenido lo hacen una pista útil, pero no hay manifiesto, log de compilación o declaración del proveedor que lo vincule a `ffmpeg-8.1.2-full_build.zip`.

Estos scripts **no** acreditan la receta efectiva del binario, la configuración completa seleccionada, el toolchain empleado ni las fuentes exactas de cada biblioteca. Se conservan como evidencia de investigación, no como materiales aprobados; `legal/third-party-materials.json` debe seguir `pending` y vacío hasta recibir y revisar materiales vinculados al paquete exacto.

### Comprobación de procedencia pública — 2026-09-30

La [release oficial 8.1.2](https://github.com/GyanD/codexffmpeg/releases/tag/8.1.2), publicada el 2026-06-27, identifica el commit de FFmpeg `38b88335f9`. El tag `8.1.2` del repositorio de distribución resuelve al commit [`46465995c991fe65c5de853fa79bddec09cd6c37`](https://github.com/GyanD/codexffmpeg/tree/46465995c991fe65c5de853fa79bddec09cd6c37), fechado 2026-05-04; el árbol contiene solamente `README.md` y `.github/FUNDING.yml`. No contiene una receta/workflow de compilación. La consulta de GitHub Actions por ese `head_sha` no devolvió ejecuciones asociadas.

La API de esa release enumera seis assets subidos: paquetes binarios essentials/full en `.7z` o `.zip`; no incluye árboles de fuentes de FFmpeg ni de bibliotecas externas. La vista del release muestra ocho recursos porque GitHub añade también los enlaces `Source code (zip)` y `Source code (tar.gz)`. Según la [documentación de GitHub sobre archivos fuente](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives), esos archivos son snapshots generados del repositorio y tag seleccionados. En este caso el árbol del tag `8.1.2` solo contiene `README.md` y `.github/FUNDING.yml`, así que esos dos snapshots son del repositorio de distribución `codexffmpeg`; no son las fuentes del núcleo FFmpeg ni de las bibliotecas enlazadas.

### Workflow histórico en la rama `actions` — no asociado a la release

También se inspeccionó el archivo [`x86_64.yml`](https://github.com/GyanD/media-autobuild_suite/blob/f257151ece46b21100d78e469da4471f0ced4944/.github/workflows/x86_64.yml) del commit `f257151ece46b21100d78e469da4471f0ced4944` de la rama `actions`, fechado 2020-03-31. Su SHA-256 verificado es `BE9084C1F767C1C638A78BA2B001D970C71B5321CB54173C51714FC4610D2650`. El workflow usa un runner Windows x64 autoalojado y obtiene `media-autobuild_suite.ini` desde una URL de Pastebin mutable; el paso de `upload-artifact` está comentado. La API de GitHub devolvió cero ejecuciones asociadas a esa rama. Por antigüedad, configuración externa no fijada y ausencia de ejecuciones/artefactos conservados, no acredita la build 8.1.2.

La [página actual de builds](https://www.gyan.dev/ffmpeg/builds/) mantiene 8.1.2 como release anterior y describe estas builds como estáticas y GPLv3. Esa página aporta clasificación y listado de funciones, pero no entrega las fuentes exactas, parches ni receta reproducible de sus bibliotecas externas para este binario. Además del `master` antiguo, el snapshot `patch-7` cercano en fecha tiene dependencias móviles y tampoco está vinculado al artefacto. No existe en la evidencia reunida una receta verificable que corresponda a la release de 2026.

### OpenAL Soft 1.25.2 — reconstrucción candidata, no atribución exacta

El inventario original transcribe `openal-soft latest` del README incluido en el paquete Gyan. La tabla de cadenas del `ffmpeg.exe` exacto también contiene `1.25.2`, `b472600` y `ab-suite`. La release oficial de OpenAL Soft `1.25.2` fue publicada el 2026-05-12, antes que Gyan 8.1.2 el 2026-06-27; GitHub informa actualmente `1.25.2` como la última release. Esto hace que el tag sea una explicación plausible de `latest`, pero no demuestra qué resolución de dependencias hizo el proveedor.

Se reprodujo en un clon aislado la secuencia que muestran los scripts públicos de `patch-7`: crear `ab-suite` desde el tag OpenAL `1.25.2` (`b2c48f7718ef3fcf67921a8b6534c4914e328970`) y aplicar con `git am -3 --ignore-whitespace --no-gpg-sign` los parches de `m-ab-s/mabs-patches` fijados a `2e8258bb65e235a1e2cf176c15c3c63d5c020a3f` y `73702d1673a84b69fe87edad647c5141669c687f`. Ambos eran las revisiones más recientes de sus rutas en el historial consultado. La reconstrucción produjo el commit `4d23239fac1bb912129aa3917fc385fd135725d8` y el árbol `c31de4b84ea876a060eec0171d883f3ecaf781f8`.

El código embebido `b472600` **no coincide** con el prefijo del commit reconstruido (`4d23239`). Por tanto, esta reconstrucción no acredita que Gyan haya usado exactamente ese commit o ese árbol. Se conserva como candidato reproducible, no como fuente verificada del binario. Su archivo `COPYING` identifica la GNU Library General Public License, versión 2 de junio de 1991; identificar ese texto no resuelve por sí solo los requisitos derivados de su inclusión estática en FFmpeg.

El paquete local `target-tauri/beta3-third-party-review/openal-reconstruction-1.25.2/openal-soft-1.25.2-reconstructed-source.zip` incluye la fuente reconstruida, los dos parches y esta delimitación de procedencia. Su SHA-256 es `157D1FEC81FBA1E1C55992861EC17D721B8D06B3BBF06D970EB00D773CB96D6A`. Está bajo `target-tauri/`, ruta ignorada por Git, y no forma parte de los materiales aprobados para la release. Persisten el enlace entre este candidato y el binario de Gyan, la receta/toolchain completos y la revisión de obligaciones y notices.

Conclusión de procedencia: se acredita la fuente del núcleo FFmpeg y se identifica con hash el paquete binario del proveedor que contiene el ejecutable distribuido. No se acredita la fuente exacta de cada biblioteca enlazada ni las entradas usadas para producir ese bundle. Se conserva el runtime actual y el gate de redistribución sigue bloqueado; no se trata esta investigación como aprobación legal.

## Información que debe acreditarse

- Receta y herramientas utilizadas para el paquete `ffmpeg-8.1.2-full_build.zip`, incluido target/toolchain.
- Fuentes exactas de cada biblioteca enlazada, commits o archivos verificables, parches y configuración. Resolver referencias ambiguas como `latest`.
- Licencias y notices de cada componente, incluidas dependencias de las bibliotecas del inventario.
- Materiales con URLs y SHA-256 que permitan conservar y distribuir lo revisado junto al paquete.
- Revisión del titular sobre los documentos y la suficiencia de esos materiales, registrada explícitamente antes de cambiar `review_status`.

## Solicitud enviada al proveedor — respuesta pendiente

El 2026-09-30 se envió desde el contacto público de Pulsaria a `builds@gyan.dev` el asunto “Source and build materials for Gyan FFmpeg 8.1.2 full build”. Se pidió la fuente, revisiones, parches, scripts/configuración y versión del toolchain correspondientes al paquete exacto, con foco en OpenAL Soft 1.25.2. El destinatario sigue el canal oficial que publica Gyan para consultas sobre builds: correo a “builds” en el dominio `gyan.dev` ([página de builds](https://www.gyan.dev/ffmpeg/builds/)).

Gmail confirma el mensaje en Enviados; en la conversación revisada no había respuesta. No se adjuntó la reconstrucción candidata ni se compartió el domicilio de notificación. Hasta recibir materiales que puedan vincularse al binario y revisarlos, `legal/third-party-materials.json` permanece `pending` y el gate de redistribución bloqueado.
