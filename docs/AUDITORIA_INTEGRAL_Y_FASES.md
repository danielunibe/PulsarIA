# Auditoría integral de Pulsaria y fases de reparación

**Corte:** 2026-09-27

**Autoridad del producto:** [PROJECT_TRUTH.md](../PROJECT_TRUTH.md)

**Propósito:** dejar un inventario verificable de lo que funciona, lo que falta y el orden para repararlo junto con el titular.

## Alcance de esta auditoría

Se revisaron el checkout canónico `C:\Users\danie\Desktop\Pulsaria`, el PR borrador #2, la matriz de publicación, el preview real del frontend en navegador y los estados de las rutas principales. La sesión web se ejecutó con `npm run dev` en `127.0.0.1:3000`, a 1280 × 720. No se conectó una ventana Tauri ni se importó, borró o cambió contenido real del usuario.

Esto es una auditoría por capas, no una certificación de todos los dispositivos y modos: el navegador no proporciona IPC Tauri, SQLite, sesión de TikTok, workers locales ni runtime de IA. Se respetan las evidencias históricas documentadas para backend, empaquetado y CI, y se separan de las verificaciones hechas hoy. La sesión no guardó capturas PNG en el repositorio; las imágenes y los árboles de accesibilidad se inspeccionaron en la sesión de auditoría.

## Resumen ejecutivo

- **El usuario ya puede descargar gratis `v0.1.0-eval.3` desde GitHub.** Esa versión publicada es anterior al candidato Beta 2.
- **Beta 2 aún no es una descarga pública:** está en el PR borrador [#2](https://github.com/danielunibe/PulsarIA/pull/2). El head previo `a1969c7` pasó CI canónico; esta revisión debe pasar CI en su nuevo commit antes de publicarse.
- **La principal prioridad funcional es terminar aceptación nativa.** En el preview web no hay acceso a la biblioteca local; la alerta y el reintento se muestran, pero eso no demuestra el comportamiento de SQLite/Tauri.
- **Se corrigieron localmente cuatro defectos de comunicación/usabilidad:** error de búsqueda junto con “sin resultados”, enlaces inválidos escondidos dentro del CTA, nombre accesible insuficiente del campo de perfil y recorte a una sola línea de la alerta de biblioteca.
- El fallo de red esperado del preview queda como advertencia de consola, así no abre el overlay rojo de Next Dev; los demás errores siguen como errores.
- **La salida Beta 2 sigue bloqueada por revisión legal y de dependencias** además de aceptación nativa, CI del nuevo commit y smoke live autorizado opcional. No se inventarán titular, domicilio, correo ni aprobación.

## Hallazgos por área

| Área | Evidencia observada | Estado | Siguiente acción |
| --- | --- | --- | --- |
| Inicio y biblioteca | El preview informa que no conecta con la biblioteca y conserva `REINTENTAR`. Quince tarjetas de demo estáticas ocupan la mayor parte del lienzo vacío. | **Parcial**: el error es claro; el primer plano DEMO puede confundir a alguien que espera contenido real. | En fase 2, definir y revisar un estado vacío real más prominente; mantener las demos explícitamente identificadas y opt-in o secundarias. |
| Ingreso por enlace | Al ingresar texto inválido, el CTA no daba una explicación legible del rechazo. Ahora aparece un `role=status` con el número de entradas inválidas y la regla HTTPS/TikTok; el botón ya no contiene el aviso comprimido. | **Corregido local / preview confirmado** | Aceptar casos de pegado múltiple, URLs válidas, esquema HTTP, hosts no TikTok y reintento en Tauri; no enviar URL no autorizada. |
| Ingreso por archivo | La interfaz permite TXT/CSV con URLs. En esta auditoría se inspeccionó el panel pero no se eligió ningún archivo. | **Sin smoke** | Verificar selección, validación, resumen, duplicados y mensajes en un perfil de prueba, sin usar biblioteca personal. |
| Consentimiento y derechos | El flujo existente presenta confirmación de derechos y política antes de procesar. No se aceptó el consentimiento ni se inició procesamiento durante esta revisión. | **Contrato visible; flujo nativo pendiente** | Revisar lenguaje y persistencia/revocación con el titular; comprobar primer arranque, reinicio y revocación en Tauri. |
| Perfiles TikTok | Panel con cuatro categorías; Publicaciones activa, otras categorías pausadas. El campo ahora se anuncia como “URL de perfil o nombre de usuario de TikTok” y vincula su ayuda por `aria-describedby`. | **Corregido local / árbol AX confirmado** | Verificar persistencia, deduplicación, estados de sesión y fuentes autorizadas en Tauri. No se usó una cuenta ni URL live. |
| Actividad | El modo navegador no puede consultar jobs. La interfaz de error conserva un reintento; no presenta fallo de red como biblioteca vacía ni como “al día”. | **Error honesto en web; Tauri pendiente** | Aceptar carga real, jobs persistidos, errores y reintentos frente a API/SQLite nativos. |
| Playlists | El estado de error explica la indisponibilidad y el control de creación queda deshabilitado si falta el backend. | **Error honesto en web; Tauri pendiente** | Probar crear/renombrar/asignar y recuperación tras reinicio con datos de prueba. |
| Búsqueda global y Spotlight | Cuando falla la API, el estado mostraba error junto con “0 coincidencias/sin resultados”, que implicaba un resultado vacío. La captura de red fallida ahora deja `searchResults=null`, limpia la respuesta parcial y muestra el error localizado. Spotlight y vista completa ocultan resultados/Gemini cuando existe `searchError`. El `TypeError` de red pasa a `console.warn`, sin overlay de error de desarrollo. | **Corregido local / preview confirmado** | Validar consultas exactas, conceptuales, fallback literal, acceso a resultado y fallos reales de índice en Tauri. |
| Ajustes, motor, IA, métricas | Las pestañas abren; ONNX indica que no está disponible y rendimiento/métricas indican pendiente/no medido en navegador. | **Interfaz presente; valores nativos sin certificar** | Confirmar qué controles se guardan, reiniciar para verificar persistencia y cotejar cada métrica con la fuente real del runtime. |
| Cinema y ficha | Ficha DEMO indica que es una imagen estática/temporal y no crea trabajo; Cinema se deshabilita si no existe video reproducible. | **Límite explicado en web** | Aceptar apertura/reproducción/cierre con un medio local de prueba en Tauri. |
| Diseño adaptable y accesibilidad | La revisión se hizo en 1280 × 720. El campo perfil ya tiene nombre accesible; la alerta de biblioteca puede ocupar dos líneas. | **Parcial** | Aceptación completa a 1280 × 800 y mínimo 860 × 640, contraste medido, foco y recorrido por teclado, lector de pantalla y ventana nativa. |
| Privacidad y tratamiento de contenido | La política/copy indican sesión local de cookies para fuentes y transferencia opcional a Gemini solo bajo acción explícita. | **Contrato inspeccionado; no prueba de red** | Verificar tráfico real, retención, ARCO/contacto y aviso en runtime y textos publicados. No enviar fragmentos a Gemini en esta auditoría. |
| Paquete y descarga | Smoke histórico del NSIS Beta 2 offline pasó. El artefacto local no tiene firma Authenticode. La Release gratuita actual es eval.3. | **Beta2 parcial** | Reproducir el instalador desde el commit final; CI, hashes y avisos antes de crear nueva Release. |
| Legal y atribuciones | `verify:legal-release` permanece bloqueado por placeholders del titular/contacto/domicilio/aprobación y terceros/modelos/notices por verificar. | **Bloqueado por datos y revisión humana** | Resolver fase 8 antes de publicar Beta 2. |

### Defecto específico de biblioteca en el preview

En navegador, el banner superior muestra “No pudimos conectar con la biblioteca local” porque no hay Tauri/IPC. Se reparó su elipsis a una línea: ahora se lee en dos líneas a 1280 × 720, permanece visible `REINTENTAR` y no tapa las tarjetas. **Este es el comportamiento esperado del perfil de desarrollo web; no indica que SQLite o el bundle instalado hayan fallado.** La aceptación de ese camino requiere una ventana Tauri.

## Plan de reparación

Las fases se cierran en orden, conservando separado el estado del candidato Beta 2 y el de la descarga ya publicada.

| Fase | Prioridad | Estado | Entrega y condición de cierre |
| --- | --- | --- | --- |
| 0. Línea base y preservación | P0 | **PASS** | Mantener checkout canónico, rama `beta2-hardening` y datos existentes. `scratch/` es del usuario y no forma parte del cambio. No ejecutar reset, clean ni stash global. |
| 1. Errores y accesibilidad inmediata | P1 | **PASS local / CI pendiente** | Búsqueda fallida no se presenta como cero resultados; resumen de enlace inválido vive fuera del CTA; perfil tiene nombre accesible y descripción; banner de biblioteca no trunca su mensaje; el error de red esperado no abre overlay rojo en Next Dev. `npm run lint`, `npm run typecheck` y preview web pasan; falta CI del commit. |
| 2. Primer arranque y biblioteca vacía | P1 | **Pendiente de reparación** | Separar biblioteca real vacía/desconectada del contenido DEMO. Mostrar primero la acción siguiente para importar, etiquetar demos como secundarias y no sugerir que una demo es un video descargado. Aceptación de 0 jobs, API caída y con jobs; 1280 × 800 y 860 × 640. |
| 3. Ingreso y fuentes autorizadas | P1 | **Parcial** | Validar enlace, lote TXT/CSV, perfil, consentimiento/revocación, duplicados y errores. Cerrar solo con perfil temporal y URL live cuyo uso autorice el titular; sin URL, mantener el smoke live omitido. |
| 4. Runtime local: biblioteca, actividad, playlists | P1 | **Implementación reportada / aceptación nativa pendiente** | En ventana Tauri, aceptar persistencia SQLite, trabajos, errores/reintentos, alta y recuperación de playlists y fuentes; verificar que reinicio no pierda estado ni duplique. |
| 5. Indexación y búsqueda | P1 | **Implementación reportada / aceptación nativa pendiente** | Validar Exact, conceptual/fallback, procedencia, momentos, abrir resultado y fallo/reconstrucción del índice con biblioteca aislada. Los errores no pueden inventar coincidencias ni pérdidas. |
| 6. Ajustes, IA y métricas | P2 | **Pendiente** | Cotejar cada control/métrica con consumidor real, persistencia y estado de modelos. Mostrar “pendiente/no disponible” cuando el motor no lo confirmó; validar descargas explícitas de modelos sin inferencia remota automática. |
| 7. Accesibilidad, idioma y responsive | P1 | **Parcial** | Recorrido completo por teclado y foco, lector de pantalla, es-MX/en-US, contraste medido, zoom, 1280 × 800 y mínimo 860 × 640 en Tauri. Guardar capturas por estado y registrar defectos. |
| 8. Privacidad, licencia y terceros | P0 para publicar Beta2 | **BLOCKED_EXTERNAL** | Confirmar cadena de derechos y titular legal; establecer correo dedicado y domicilio real autorizado para notificaciones con asesoría mexicana; revisar/aprobar textos; verificar SBOM y notices de Rust, npm, Python embebido, FFmpeg, llama.cpp, OpenMP y modelos. No publicar con placeholders. |
| 9. Paquete y publicación Beta2 | P0 para publicar Beta2 | **Pendiente** | CI verde en head final, reproducir NSIS desde ese commit, adjuntar hashes/notices y notas, revisar PR y publicar tag/Release solo tras gates 3–8. Confirmar descarga pública, no solo el asset local. |
| 10. Firma, updater y release estable | P3 / opcional para descarga directa | **BLOCKED_EXTERNAL** | Authenticode y Tauri updater requieren certificado/secretos/configuración. La descarga directa no depende del updater; si se distribuye sin firma, indicarlo claramente. |

## Recomendación legal práctica para el titular

La respuesta segura hoy es **“aún no lo sé”**. No completar `legal/release-manifest.json` con el nombre del autor de GitHub ni con un domicilio inferido. Antes, resolver estas preguntas con el titular y asesoría legal mexicana:

1. ¿Quién posee realmente el código, marca, textos y assets de Pulsaria: una persona física o una entidad? Revisar contribuciones, empleo/contratos y licencias de assets.
2. ¿Qué correo público dedicado controla ese titular para solicitudes legales y de privacidad?
3. ¿Qué domicilio puede publicarse y recibirá avisos válidamente? Considerar opciones empresariales o de representación solo si existen y un abogado confirma que son aptas; no usar una casa particular por defecto.
4. ¿Quién revisó y aprueba expresamente cada licencia, EULA, aviso de privacidad, términos, copyright/takedown y notice de terceros?

El artículo 15(I) de la LFPDPPP indica que el aviso de privacidad debe incluir la identidad y domicilio de quien responde por el tratamiento. La página legal oficial explica además que FFmpeg cambia al régimen GPL si se habilitan partes GPL y enumera condiciones de redistribución del binario/fuente exactos; por eso hay que cotejar el build FFmpeg empaquetado con su licencia, fuente y configuración. Esta mención identifica una revisión necesaria, no concluye por sí misma cuál sea la obligación legal final de Pulsaria. [LFPDPPP vigente, Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf) · [FFmpeg: licencia y consideraciones legales](https://ffmpeg.org/legal.html).

## Cómo continuar fase por fase

La fase activa es **1: integrar los cambios UX locales y obtener CI verde en el nuevo commit**. Después se toma la fase 2. Cada cierre debe anotar evidencia y límites: navegador ≠ Tauri; build ≠ smoke instalado; smoke offline ≠ TikTok live; CI ≠ aprobación legal ni aceptación visual humana.
