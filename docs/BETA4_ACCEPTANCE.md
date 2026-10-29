# Beta 4 — aceptación del instalador

Esta hoja corresponde al artefacto de Actions para `v0.1.0-beta.4`. Un preview,
un build local, la CI fuente o el smoke automatizado no sustituyen la prueba del
`.exe` exacto en un Windows limpio ni la aprobación de publicación.

La reparación local del 2026-10-12 completó los 13 gates automatizados del MVP.
Su registro está en [BETA4_REPAIR_EVIDENCE.md](./BETA4_REPAIR_EVIDENCE.md).
El build local y su prueba de arranque se registran por separado del artifact
de Actions descrito en esta hoja; no cambian los resultados manuales pendientes.

El gate posterior [P0-01](./BETA4_P0_01_EVIDENCE.md) conserva la recuperación
SQLite y las referencias de almacenamiento, y requiere que el candidato exacto
se vuelva a validar. Sus pruebas locales no sustituyen la prueba del artifact
de Actions, la actualización en Windows limpio ni la aceptación humana de esta
hoja.

La reparación posterior de [Perfiles](./BETA4_PROFILE_REPAIR_EVIDENCE.md)
requiere reconstruir el candidato. El hash del build previo a esa reparación
no acredita los cambios de Perfiles ni debe utilizarse para su aceptación.

## Identificación del artefacto

Registrar en la evidencia privada de aceptación:

| Dato | Valor |
| --- | --- |
| Archivo `.exe` y tamaño | Pendiente del artifact de Actions |
| SHA-256 | Pendiente del artifact de Actions |
| Tag / commit | `v0.1.0-beta.4` / pendiente |
| Workflow run / artifact ID | Pendiente |
| Windows x64 / WebView2 | Pendiente |
| Fecha / operador | Pendiente |

La aprobación humana se aplica únicamente al hash registrado. Cualquier
reconstrucción o cambio de archivo invalida la aceptación.

## Entorno de prueba y privacidad

- Usar una VM, Windows Sandbox o equipo de prueba x64 sin Node.js, Rust, Python,
  FFmpeg ni FFprobe globales. Registrar la versión de WebView2 y cualquier
  intervención necesaria.
- Para el caso de actualización, instalar primero el Eval.3 público y crear una
  biblioteca sintética. Nunca instalar o migrar sobre la biblioteca personal.
- Usar un perfil de Windows y `PULSAR_DATA_DIR` aislados, con puertos 8080/9001
  libres. No detener procesos ajenos.
- El enlace de TikTok debe ser autorizado y contener voz clara en español. Usarlo
  solo en la ejecución privada; no guardar el enlace ni datos personales en el
  repositorio o en la evidencia pública.
- El perfil personal de AppData está fuera de esta aceptación.

## Recorrido funcional del mismo instalador

| Caso | Criterio de aceptación | Resultado / evidencia |
| --- | --- | --- |
| Instalación nueva | Instala sin herramientas de desarrollo y abre Pulsaria desde el acceso creado | Pendiente |
| Onboarding | Aceptación legal y de derechos explícita; estados y acciones completas, sin desbordes | Pendiente |
| Ventana y teclado | 1280×800 y 860×640; Tab/Shift+Tab/Enter/Escape, foco visible y navegación operable | Pendiente |
| Biblioteca vacía y DEMO | Carga vacía y contenido de demostración identificables, sin mezclar datos reales | Pendiente |
| TikTok desde la app | Enlace autorizado importado desde UI/IPC; job termina y la biblioteca contiene texto de transcripción reconocible en español | Pendiente |
| Cola y errores | Progreso, actividad, URL inválida, deduplicación, error y reintento se comportan correctamente | Pendiente |
| Búsqueda | Coincidencia literal; búsqueda conceptual después de preparar el índice, con resultado que abre la ficha o momento | Pendiente |
| Biblioteca y fuentes | Persisten ficha, playlist y configuración de fuente después de cerrar y volver a abrir | Pendiente |
| Perfiles | Agregar no descarga; consulta carga todo lo disponible o el límite elegido, abre perfil/canal, reproduce online y procesa gradualmente con un video a la vez; conserva pausa y estados reales | Pendiente |
| Cinema y exportación | Reproducción, transcripción sincronizada cuando hay marcas de tiempo y exportaciones MP4/MP3/TXT disponibles | Pendiente |
| Ajustes | Cambios guardados, cancelación y persistencia tras reinicio | Pendiente |
| Actualización Eval.3 | La actualización conserva biblioteca sintética, configuración y archivos; SQLite pasa integridad | Pendiente |
| Desinstalación | Retira la aplicación y conserva los datos de usuario conforme al contrato | Pendiente |

## Evidencia de publicación

- Adjuntar al registro privado hash, captura de la app instalada y diagnóstico
  sanitizado; no incluir URLs de prueba, bases de datos, transcripciones privadas
  ni credenciales.
- Confirmar nombre, ciudad y correo públicos en `legal/release-manifest.json`.
  No publicar domicilio postal. El contacto electrónico/ciudad debe contar con
  aprobación legal registrada fuera del repositorio; el gate permanece bloqueado
  mientras ese dictamen no exista.
- Verificar el SBOM SPDX, hashes, procedencia y materiales de terceros del mismo
  artifact; completar las revisiones de titularidad/licencias.
- Mantener `DIRECT_DOWNLOAD_RELEASE_READY=false` hasta que pase la aceptación
  del hash exacto, la revisión legal y la aprobación requerida del Environment
  `direct-download`. Publicar el mismo artifact, sin recompilar, y releer los
  activos y hashes desde GitHub.
