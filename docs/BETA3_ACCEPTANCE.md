# Beta 3 — aceptación del instalador definitivo

Esta lista registra evidencia humana y funcional que los contratos estáticos no pueden sustituir. Estado inicial: **PENDIENTE**. No marcar PASS por abrir un preview web.

## Identificación obligatoria

Registrar nombre del EXE, tamaño, SHA-256, tag `v0.1.0-beta.3`, commit, run ID y artifact ID de Actions, Windows/compilación, fecha y persona que ejecutó la prueba. Conservar capturas y diagnósticos sin datos privados. La aprobación se aplica únicamente a ese hash; reconstruir o cambiar el archivo invalida la aceptación.

## Entorno y protección de datos

- Usar Windows x64 sin Node.js/Rust/Python/FFmpeg globales. Registrar WebView2 existente o su instalación desde el paquete, y si requirió alguna intervención.
- Usar una VM, Windows Sandbox o perfil de prueba. Para actualización, instalar primero `v0.1.0-eval.3`, crear una biblioteca de prueba y documentar el backup; nunca experimentar sobre la biblioteca personal.
- Cerrar las ventanas de prueba y comprobar que 8080/9001 estén libres antes del smoke aislado. No detener procesos ajenos automáticamente.

## Recorrido con resultados esperados

| Prueba | Resultado requerido | Estado inicial |
| --- | --- | --- |
| Instalación nueva y onboarding | Instalación por usuario, primer arranque y consentimiento sin herramientas de desarrollo | Pendiente |
| Biblioteca vacía / DEMO | Vacío explicado; DEMO opt-in separado de SQLite y búsqueda | Pendiente |
| 1280 × 800 / 860 × 640 | Cabecera, navegación, Ajustes y acciones visibles sin recortes que impidan uso | Pendiente |
| Teclado / foco / idioma | Acciones accesibles, foco visible y cambio persistente es-MX/en-US | Pendiente |
| URL autorizada con voz española | Job completado, audio reproducible y transcripción con palabras reconocibles | Pendiente |
| Actividad / fallo / reintento | Estado real, mensaje comprensible y reintento sin progreso inventado | Pendiente |
| URL inválida / duplicado | Rechazo visible; duplicado no crea otro contenido canónico | Pendiente |
| Fuente sin acceso | Error explicado sin simular descubrimiento; biblioteca conservada | Pendiente |
| Búsqueda literal / conceptual | Contenido y procedencia correctos; resultado abre el elemento esperado | Pendiente |
| Biblioteca / Playlists / Fuentes | Creación, consulta y persistencia tras reiniciar | Pendiente |
| Cinema y exportación | Controles operables; MP4/MP3/TXT y formatos de subtítulos que ofrezca el elemento se abren y corresponden al contenido | Pendiente |
| Ajustes Guardar / Cancelar | Guardar persiste; Cancelar conserva la selección anterior | Pendiente |
| Reinicio y actualización desde eval.3 | Datos, ajustes, medios y trabajos conservados sin duplicaciones | Pendiente |
| Desinstalación | La aplicación se retira y los datos de usuario siguen disponibles según el contrato | Pendiente |

El smoke TikTok se hace desde la app instalada mediante el cliente IPC autenticado. El modo `RunLive` del script legado queda bloqueado con un diagnóstico explícito: recibía un token sin transmitirlo y el token cambia tras cada arranque. El smoke offline sigue disponible. No registrar tokens ni abrir una ruta pública para obtenerlos.

## Aprobación y publicación

1. Resolver revisión legal, datos públicos y materiales de terceros; pasar CI del PR final, integrar en `main` y crear el tag aprobado.
2. Ejecutar el workflow directo desde `main`. Descargar el artifact producido por `build` y verificar sus hashes.
3. Completar esta lista con ese instalador, incluidos actualización y prueba live autorizada.
4. El revisor `danielunibe` comprueba identidad/hash, evidencia y documentos antes de habilitar `DIRECT_DOWNLOAD_RELEASE_READY=true` y aprobar el job `publish` del Environment `direct-download`. No desactivar las protecciones.
5. El job publica el mismo artifact y descarga los assets públicos para verificarlos. Si falla, registrar el fallo; no reemplazar los archivos publicados por otro build bajo el mismo tag.
6. Actualizar enlaces de README/sitio y la evidencia de cierre únicamente después de verificar la release pública. Conservar eval.3 como referencia histórica.

## Entradas aún necesarias

Titular legal confirmado, correo de notificaciones controlado, domicilio autorizado y revisión de documentos. La marca pública “Pulsaria — Daniel Unibe” y GitHub Issues son presentación/soporte; no acreditan por sí solos esos datos legales.

El 2026-09-30 el usuario autorizó `https://www.tiktok.com/@liminalhabitats/video/7683192090443992353` para la prueba. Debe comprobarse si contiene voz en español; recibir el enlace no demuestra descarga ni transcripción.

El candidato local con hash `F1515FF7FCBA67EA90832711FE5A6FA2B43B567F7B01ACA9AF45FC69DE3CC212` fue rechazado en inspección nativa por falta de hidratación del frontend. Repetir el recorrido con el instalador corregido; ver `BETA3_RELEASE_EVIDENCE.md`.
