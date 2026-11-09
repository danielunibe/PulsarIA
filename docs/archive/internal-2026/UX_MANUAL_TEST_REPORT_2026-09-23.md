# Pulsaria — prueba manual de interfaz y UX

- Fecha: 2026-09-23
- Superficie: frontend local `npm run dev`, perfil `frontend-dev`, en `127.0.0.1:3000`.
- Viewport observado: 1280 × 720.
- Alcance: navegación, búsqueda, validación local del formulario, estados de error y ajustes visibles.
- Estado global: **PARCIAL**. Es la interfaz real del frontend de Pulsaria, pero no es la ventana Tauri. El propio aviso indica que el modo navegador no accede a la biblioteca local; no se certifican aquí IPC, SQLite, runtime, descargas ni controles nativos.
- Seguridad de la prueba: no se enviaron enlaces, no se crearon fuentes, no se ejecutaron reparaciones/clustering/purgas, y no se guardaron ajustes. El texto inválido usado en Inicio se borró al terminar.

## Recorrido y salud por paso

| Paso | Tarea como usuario | Salud | Evidencia observada |
|---|---|---|---|
| 1 | Abrir Inicio y entender qué puede hacer | Parcial | Aparecen el aviso de modo navegador y una biblioteca de previews etiquetados DEMO; el contador real muestra 0 TikToks. Cinema está deshabilitado con explicación de que no hay videos disponibles. |
| 2 | Navegar a Actividad | Parcial | El panel abre correctamente, pero muestra “0 cambios nuevos. Pulsaria está al día” a la vez que avisa que no puede leer la biblioteca local. |
| 3 | Abrir Búsqueda y salir | Pasa en el frontend | Spotlight abre con el campo enfocado; Escape cierra el diálogo y devuelve a la vista anterior. No se ejecutó una consulta porque no hay una biblioteca disponible en esta superficie. |
| 4 | Revisar Perfiles TikTok | Parcial | Se ven las cuatro categorías, una activa y tres pausadas, y un estado vacío entendible. No se registró un perfil ni se consultó una sesión. |
| 5 | Abrir Playlists | Falla en localhost | Se muestran errores HTTP 401 en `/playlists` y `/source-collections`; el contenido de la sección no carga. |
| 6 | Revisar General, Motor, IA, Rendimiento y Métricas | Parcial | Las pestañas abren y muestran controles/estados. Los indicadores de runtime, IA, energía y almacenamiento no pueden validarse desde navegador. No se cambió ni guardó ningún ajuste. |
| 7 | Probar entrada inválida y teclado | Parcial | Un texto no válido produjo 0 enlaces válidos, 1 rechazo y mantuvo deshabilitado Procesar. Tab mueve el foco entre navegación y el foco visible tiene un contorno cian claro. El texto de rechazo se recorta en el botón estrecho. |

## Hallazgos priorizados

### P1 — Playlists expone errores de transporte y queda inutilizable en esta vista

Al abrir la sección aparecen literalmente `REST /playlists failed with status 401` y `REST /source-collections failed with status 401`. No hay una acción clara de recuperación ni una explicación para una persona usuaria. El mensaje revela detalles internos y deja al usuario sin distinguir entre sesión, modo navegador o indisponibilidad del servicio.

**Recomendación:** mostrar un estado de sección no disponible con causa comprensible y siguiente acción. En paralelo, corregir la autorización del frontend local si esta ruta debe funcionar en navegador. Este resultado no demuestra que Playlists falle dentro de Tauri.

### P1 — El preview no permite completar tareas que dependen de la biblioteca local

El banner persistente indica que el modo navegador no tiene acceso a la biblioteca y recomienda abrir la app de escritorio; a pesar de eso, la navegación sigue ofreciendo Actividad, Fuentes, Playlists, Motor e IA como si pudieran consultarse. Las acciones dependientes del backend llevan a datos no verificables o errores.

**Recomendación:** mantener navegación exploratoria si se desea, pero marcar las secciones afectadas como modo de demostración/no disponible y ofrecer una acción explícita para abrir la versión de escritorio. Evitar que esta URL se use como evidencia de aceptación nativa.

### P2 — Estado vacío de Actividad contradice el aviso de acceso fallido

El panel comunica “Pulsaria está al día” y cero cambios mientras la biblioteca local no se puede consultar. “Vacío” y “no cargó” son estados distintos; aquí pueden parecer el mismo.

**Recomendación:** reservar el estado positivo para una consulta completada. Si falla el acceso, mostrar “No se pudo consultar la actividad” y un reintento con resultado observable.

### P2 — La validación de Inicio se comprime y recorta

Con una entrada inválida, el campo recibe borde rojo y el recuento detecta el rechazo, pero el resumen queda comprimido dentro del botón de Procesar y el texto de rechazo se corta en el viewport observado. No aparece una instrucción breve junto al campo que indique cómo corregirlo.

**Recomendación:** mover el error debajo del campo, permitir salto de línea y mantener Procesar como botón independiente. Usar una explicación accionable, por ejemplo que se necesita una URL de TikTok admitida.

### P2 — Los previews DEMO dominan Inicio aunque la biblioteca real está vacía

La parte central muestra numerosas tarjetas e imágenes mientras el contador real marca 0. Cada tarjeta sí lleva la etiqueta DEMO, y Ajustes confirma que “Mostrar ejemplos DEMO” está activado; por tanto, no parece mezcla de datos reales. Aun así, el conjunto ocupa visualmente la mayor parte de Inicio y puede distraer en el primer uso.

**Recomendación:** conservar la etiqueta en cada tarjeta y añadir una explicación conjunta visible; valorar si la primera apertura debe empezar con DEMO apagado o con una invitación directa a agregar el primer video.

### P2 — General concentra demasiadas decisiones distintas

En la pestaña General aparecen idioma, barra superior, autoplay, ejemplos, consentimiento, diseño/filtros de biblioteca, búsqueda, temas, formatos, Cinema, carpeta de guardado y documentos legales. En 1280 × 720 solo se ve una porción pequeña a la vez; los botones Guardar/Cancelar permanecen fijos abajo.

**Recomendación:** separar preferencias generales de Biblioteca, Descargas/formatos y Reproducción, o reducir General a las decisiones de uso más frecuentes. Mantener las acciones Guardar/Cancelar fijas es positivo.

### P3 — Texto secundario y controles compactos requieren comprobación de contraste

Algunas descripciones y etiquetas secundarias se ven pequeñas y apagadas frente al fondo oscuro. En navegación el foco de teclado sí tiene un contorno cian claramente visible. Esta observación es visual, no una medición WCAG.

**Recomendación:** medir los pares reales de color/tamaño y revisar especialmente etiquetas de estado, instrucciones de formularios y tabs de Ajustes. No declarar conformidad de accesibilidad hasta medir contraste y probar lector de pantalla.

## Fortalezas observadas

- Navegación persistente y nombres accesibles significativos para Inicio, Perfiles, Actividad, Playlists, Búsqueda y Ajustes.
- Spotlight comunica el atajo Ctrl/Cmd+K y Escape; Escape funcionó en la prueba.
- Cinema deshabilitado incluye una razón accesible cuando no hay videos.
- El formulario rechaza la entrada inválida sin permitir procesarla.
- Ajustes está dividido en tabs y conserva Guardar/Cancelar; el recorrido no guardó valores.

## Evidencia y límites

Capturas de la sesión, tomadas y revisadas en este orden: Inicio, Actividad, Spotlight, General, Perfiles TikTok, Playlists con 401, validación inválida y foco de teclado. Se mostraron dentro de esta tarea de Codex. La herramienta de captura disponible no expone una ruta para exportar esos mismos bytes a un archivo; por eso el informe conserva las notas y el orden, pero **no incrusta PNGs**.

Quedan fuera de esta revisión: ventana nativa Tauri, minimizado/maximizado/cierre real, primer arranque/consentimiento en instalación limpia, tamaños nativos 1280 × 800 y 860 × 640, persistencia real, tareas de importación, runtime de Workers Python, sesión TikTok, contraste medido, lector de pantalla y pruebas con datos reales autorizados.

## Siguiente orden recomendado

1. Resolver el 401 de Playlists/Fuentes en la superficie que se decida soportar y reemplazar errores técnicos por recuperación clara.
2. Unificar los estados “sin resultados” y “no se pudo consultar” en Actividad y las demás secciones.
3. Dar espacio propio a los errores de validación de enlaces.
4. Revisar el balance DEMO/biblioteca vacía y dividir General en grupos más pequeños.
5. Repetir este recorrido en Tauri nativo para validar IPC, ventana, datos locales y tamaños mínimos antes de cerrar la auditoría.
