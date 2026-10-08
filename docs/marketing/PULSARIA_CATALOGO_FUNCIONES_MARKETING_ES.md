# Pulsaria — catálogo de funciones para marketing

> Documento interno para preparar presentaciones, publicaciones y materiales comerciales. Resume capacidades encontradas en el código y la interfaz actuales; no sustituye las notas de versión ni certifica el funcionamiento de un instalador.

**Corte de revisión:** 8 de octubre de 2026
**Base revisada:** checkout de `main` sobre `HEAD ebfb5209`, con cambios de trabajo locales de la reparación del lateral y su documentación.
**Estado de publicación:** según [PROJECT_TRUTH.md](../../PROJECT_TRUTH.md) y [README.md](../../README.md), la última versión pública documentada es `v0.1.0-eval.3`; Beta 3 sigue sin publicarse. Este catálogo describe el árbol local actual y no afirma que todas sus funciones estén en Eval.3.

## Posicionamiento

**En una frase**
Pulsaria convierte videos de TikTok que tienes autorización para procesar en una biblioteca audiovisual local, con transcripciones, análisis visual y búsqueda por palabras o por significado.

**Lema propuesto**
**Cada video, un recuerdo que puedes volver a encontrar.**

**Presentación breve**
Pulsaria reúne tus videos autorizados de TikTok y los organiza en una biblioteca que puedes explorar por título, transcripción o tema. Procesa audio y video en el equipo, conserva referencias útiles y te ayuda a volver al momento concreto que buscas.

**Promesa de producto**
Pasar de guardar clips sueltos a consultar una colección audiovisual personal desde una sola aplicación de escritorio para Windows.

## Funciones estrella

### 1. Importación flexible de contenido de TikTok

- Acepta enlaces de videos y fuentes de TikTok como perfiles, favoritos y colecciones.
- Permite pegar varios enlaces o cargar listas de URLs desde archivos `.txt` y `.csv`.
- Revisa el formato y la validez de los enlaces antes de enviarlos a la cola.
- La importación por perfil permite elegir categorías disponibles —publicaciones, republicaciones, favoritos y guardados— y sincronizar la fuente.
- En fuentes conectadas se puede elegir entre una modalidad centrada en conservar medios localmente o una modalidad streaming-first con descarga bajo demanda.

**Ángulo de marketing:** incorpora el contenido que el usuario elige a una biblioteca propia y consultable. La disponibilidad de cada fuente depende de TikTok y, cuando se necesita, de una sesión local autorizada del navegador.

### 2. Procesamiento audiovisual en el equipo

Al procesar un enlace, Pulsaria puede conservar metadatos y video, extraer audio, crear una transcripción local con marcas de tiempo y generar elementos para revisar el contenido visual, como fotogramas clave y métricas de imagen. El flujo también prepara exportaciones de video, audio y texto —incluidos MP4, MP3 y TXT—.

**Ángulo de marketing:** una misma pieza de contenido puede convertirse en material visual, auditivo y textual que después se puede consultar.

**Límite de la afirmación:** la transcripción depende de que haya voz inteligible, del idioma, del audio y de los recursos disponibles. Una tarea completada no garantiza una transcripción con texto reconocible. El análisis visual actual se basa en fotogramas y señales medibles; no debe describirse como reconocimiento avanzado de objetos o escenas.

### 3. Biblioteca audiovisual local

- Reúne los videos procesados, sus fichas, metadata, transcripciones y resultados de análisis.
- Permite ordenar y filtrar la colección, cambiar la presentación de tarjetas y consultar playlists o grupos de una fuente.
- Mantiene una ficha de conocimiento cuando el medio local se ha retirado o su fuente ya no está disponible; la interfaz identifica el estado del contenido.

**Ángulo de marketing:** la colección conserva contexto útil para encontrar y revisar contenido incluso cuando el archivo de video no está disponible localmente.

### 4. Búsqueda por palabras y por significado

- **Exacta:** busca coincidencias textuales y filtros.
- **Conceptual:** encuentra coincidencias por significado con el índice semántico disponible.
- **Inteligente:** combina los canales de búsqueda disponibles.
- Los resultados se agrupan por video y pueden señalar el fragmento o momento relacionado con la consulta.
- Si el índice conceptual no está listo, Pulsaria puede mostrar coincidencias literales y estructuradas sin presentar la búsqueda completa como fallida.

**Ángulo de marketing:** permite buscar una frase recordada o una idea, sin depender únicamente del título del video.

### 5. Fichas, transcripciones y exportación

Desde el detalle de un video se puede revisar la transcripción, filtrar palabras dentro del texto, copiarla y consultar metadata. Cuando existen marcas de tiempo y el medio está disponible, se puede saltar al momento correspondiente. También se pueden copiar datos estructurados como JSON o Markdown e importar o exportar un índice semántico portátil `.unib`.

El archivo `.unib` lleva referencias e información textual del índice; **no incluye el video**.

**Ángulo de marketing:** cada resultado puede llevar de una idea a su transcripción, su ficha o el instante del clip que la contiene.

### 6. Seguimiento de perfiles y organización

- Registra fuentes de perfil y refleja su actividad, categorías y estado de sincronización.
- Permite pausar o reanudar una fuente, sincronizarla manualmente y ajustar qué categorías observar.
- Ofrece playlists que el usuario puede crear y mantener para reunir videos seleccionados.
- Incluye una herramienta de agrupación temática por similitud de transcripciones, con controles de afinidad y tamaño mínimo.

**Ángulo de marketing:** ayuda a mantener y explorar colecciones temáticas o fuentes que se actualizan con el tiempo.

**Límite de la afirmación:** la agrupación temática no debe promocionarse como “playlists inteligentes” automáticas. El acceso a publicaciones, favoritos, republicaciones o guardados depende de la sesión, la fuente y las capacidades que TikTok permita en ese momento.

### 7. Modo Cinema y lectura sincronizada

La biblioteca ofrece un modo de reproducción inmersivo a pantalla completa, con navegación entre videos, avance automático opcional y controles de reproducción. La transcripción puede acompañar el video cuando hay texto y marcas de tiempo disponibles; si existen marcas por palabra, la lectura puede saltar a esa palabra.

**Ángulo de marketing:** una forma enfocada de volver a ver y revisar la colección sin perder la referencia textual.

### 8. IA opcional con dos rutas diferenciadas

**IA local**

- Se prepara bajo demanda después de que la persona lo solicita.
- Usa un modelo local para funciones de síntesis contextual y herramientas de organización temática.
- El modelo de lenguaje local no es requisito para que arranque la biblioteca ni para la búsqueda literal.

**Síntesis con Gemini**

- Es opcional y requiere una clave de Gemini configurada en la aplicación de escritorio.
- En la búsqueda, la persona activa la síntesis expresamente; hasta cinco fragmentos relevantes se envían a Google para redactar una respuesta.
- El motor editorial también requiere Gemini para compilar artículos a partir de evidencia seleccionada.

**Ángulo de marketing:** la IA local y la síntesis en la nube son opciones distintas, con controles y condiciones visibles.

### 9. Revistas, tomos y artículos con procedencia

El librero editorial puede compilar uno o varios videos de la biblioteca en artículos estructurados. Conserva enlaces a fuentes y fragmentos de evidencia, admite versiones e identifica conflictos para revisión. Los artículos se consultan en un lector tipo kiosco y pueden llevar al video de origen.

**Ángulo de marketing:** transforma material audiovisual en lecturas temáticas que mantienen el vínculo con las fuentes utilizadas.

**Condición importante:** esta compilación requiere la aplicación nativa y una clave de Gemini; el contenido seleccionado se procesa mediante esa integración remota. Las propuestas de nuevos tomos son sugerencias, no se crean automáticamente, y el resultado editorial necesita revisión humana antes de tratarse como información verificada.

### 10. Control de almacenamiento y privacidad local-first

- Los medios, fichas, transcripciones, búsquedas y resultados se guardan localmente por defecto.
- En la beta, el README declara que no hay analytics de uso ni envío remoto de reportes de fallos.
- Hay opciones para conservar audio y video localmente o mantener una ficha y transcripciones mientras se libera el medio.
- La purga inteligente permite previsualizar candidatos y mover medios a una papelera reversible; transcripciones y notas se protegen.
- Hay tráfico de red para acciones como importar o sincronizar fuentes, descargar recursos solicitados, comprobar releases y usar Gemini cuando se configura y solicita.

**Ángulo de marketing:** control sobre qué medios conservar en disco, con una biblioteca pensada para funcionar desde el equipo personal.

### 11. Experiencia de escritorio configurable

- Aplicación de escritorio para Windows x64.
- Interfaz en español de México e inglés, con preferencia de idioma persistente.
- Temas visuales y fondos configurables, incluidos estilos oscuros y opciones animadas.
- Ajustes para búsqueda, reproducción, almacenamiento y recursos de procesamiento.
- Cola y centro de actividad para consultar el progreso, revisar errores y reintentar trabajos cuando corresponda.

## Texto listo para reutilizar

### Descripción corta

**Pulsaria convierte videos autorizados de TikTok en una biblioteca audiovisual local que puedes buscar por palabras, transcripciones o significado. Organiza tus clips, revisa sus momentos clave y vuelve a encontrar la información cuando la necesitas.**

### Pitch de 30 segundos

Guardamos muchos videos y luego cuesta recordar cuál tenía la receta, la recomendación o la explicación que queríamos volver a ver. Pulsaria crea una biblioteca local a partir de contenido de TikTok que tienes autorización para procesar. Genera transcripciones y referencias audiovisuales, organiza colecciones y permite buscar por frase o por tema para volver a la fuente.

### Ideas para piezas de comunicación

- “Encuentra ese video por lo que decía, no solo por quién lo publicó.”
- “Tus videos guardados, convertidos en una biblioteca que puedes consultar.”
- “Del clip al fragmento: busca una idea y vuelve al momento que la contiene.”
- “Tu colección audiovisual permanece en tu equipo por defecto.”

## Guía de afirmaciones

### Afirmaciones respaldadas por el árbol actual

- Pulsaria procesa contenido de TikTok autorizado por el usuario.
- La aplicación ofrece biblioteca local, transcripción, extracción de audio, referencias visuales y exportaciones MP4, MP3 y TXT.
- La búsqueda contempla coincidencias literales y semánticas, con disponibilidad conceptual sujeta a que el índice esté preparado.
- La IA local es opcional; Gemini se usa solo con configuración y solicitud explícita en las funciones que lo requieren.
- La experiencia contempla español de México e inglés.

### No prometer como capacidad disponible

- Soporte oficial, asociación o aprobación de TikTok.
- Importación de YouTube, Instagram u otras plataformas.
- Transcripción siempre correcta, reconocimiento garantizado de español, traducción automática u OCR avanzado.
- Chat conversacional RAG, playlists inteligentes automáticas o reconocimiento general de objetos y escenas.
- Procesamiento completamente offline: importar y sincronizar contenido, descargar modelos y solicitar Gemini requieren red.
- Beta 3 publicada, versión estable firmada, Authenticode o actualizaciones automáticas públicas.

## Referencias internas para actualizar el catálogo

- Alcance, privacidad y publicación: [PROJECT_TRUTH.md](../../PROJECT_TRUTH.md), [README.md](../../README.md) y [docs/MVP_STATUS.md](../MVP_STATUS.md).
- Importación y perfiles: [components/AddLinks.tsx](../../components/AddLinks.tsx), [components/TikTokSourcesPanel.tsx](../../components/TikTokSourcesPanel.tsx), [src-tauri/src/application/collection_service.rs](../../src-tauri/src/application/collection_service.rs) y [python-workers/source_scanner.py](../../python-workers/source_scanner.py).
- Cola y procesamiento: [src-tauri/src/application/queue_service.rs](../../src-tauri/src/application/queue_service.rs), [python-workers/main.py](../../python-workers/main.py), [python-workers/transcriber.py](../../python-workers/transcriber.py), [python-workers/visual_analyzer.py](../../python-workers/visual_analyzer.py) y [python-workers/output_generator.py](../../python-workers/output_generator.py).
- Biblioteca, reproducción y búsqueda: [components/VideoGrid.tsx](../../components/VideoGrid.tsx), [components/ExpandedVideoModal.tsx](../../components/ExpandedVideoModal.tsx), [components/CinemaMode.tsx](../../components/CinemaMode.tsx), [lib/unified-search.ts](../../lib/unified-search.ts) y [src-tauri/src/application/search_service.rs](../../src-tauri/src/application/search_service.rs).
- Playlists e IA: [components/PlaylistsPanel.tsx](../../components/PlaylistsPanel.tsx), [components/settings/AiTab.tsx](../../components/settings/AiTab.tsx), [lib/local-llm.ts](../../lib/local-llm.ts) y [src-tauri/src/commands.rs](../../src-tauri/src/commands.rs).
- Edición y lectura: [components/MagazinesBookshelf.tsx](../../components/MagazinesBookshelf.tsx), [components/KioscoReader.tsx](../../components/KioscoReader.tsx), [src-tauri/src/application/editorial_compiler.rs](../../src-tauri/src/application/editorial_compiler.rs) y [src-tauri/src/application/editorial_provider.rs](../../src-tauri/src/application/editorial_provider.rs).

**Mantenimiento:** revisar este catálogo contra `PROJECT_TRUTH.md`, la interfaz actual y el estado de la release antes de cada campaña. Una función presente en el código no certifica que esté disponible en la última descarga pública ni reemplaza una prueba instalada o una aceptación de uso real.
