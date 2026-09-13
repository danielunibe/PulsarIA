# Aviso de Privacidad — Pulsaria Beta

Versión: 1.0 · 12 de septiembre de 2026

## Responsable

Responsable: el titular identificado en el release correspondiente.

Domicilio y contacto para privacidad: COMPLETAR ANTES DEL RELEASE.

Este aviso está preparado para un beta de escritorio distribuido desde
GitHub. Debe revisarse y completarse con los datos reales del responsable
antes de su publicación.

## Principio de privacidad local

Pulsaria está diseñada para procesar localmente vídeos, audios,
transcripciones, embeddings, búsquedas y resultados del modelo generativo.
El contenido de tu biblioteca no se envía automáticamente a Pulsaria ni a
un proveedor de LLM remoto.

Pulsaria no incluye analytics, telemetría de uso ni crash reporting remoto en
el beta.

## Datos que pueden tratarse en tu equipo

La aplicación puede crear o leer, según las funciones que inicies:

- URLs e identificadores de contenido;
- archivos de vídeo y audio;
- transcripciones, embeddings y resultados de búsqueda;
- nombres de archivos, rutas locales y preferencias;
- eventos técnicos locales y métricas de funcionamiento;
- cookies del navegador si activas explícitamente esa opción;
- aceptación local de la Política de Contenido;
- modelo local descargado y su información de integridad.

Estos datos permanecen en las rutas locales configuradas por ti. Puedes
eliminarlos mediante las funciones de almacenamiento de Pulsaria o
directamente desde tu sistema operativo, después de crear las copias de
seguridad que necesites.

## Conexiones de red

El beta puede conectarse a Internet únicamente para:

- descargar el modelo local cuando solicitas una función que lo necesita;
- consultar o descargar un release o actualización de GitHub cuando tú lo
  solicitas;
- acceder a la URL de contenido que tú importas.
- enviar a Google los fragmentos que incluyas explícitamente en una solicitud
  manual de síntesis Gemini, únicamente si has configurado una clave en el
  proceso nativo.

La descarga del modelo no incluye vídeos, audios, transcripciones, embeddings
ni consultas del usuario. El modelo se verifica localmente mediante el hash
publicado antes de utilizarse.

## Gemini opcional

La síntesis Gemini está desactivada por defecto y no se ejecuta durante el
arranque, la descarga, la transcripción ni la búsqueda. Si eliges la acción
manual “Sintetizar con Gemini”, Pulsaria envía a Google únicamente el prompt y
los fragmentos que esa acción prepara para la consulta. La interfaz muestra
esta transferencia antes de ejecutarla. La clave se lee sólo desde
`PULSAR_GOOGLE_API_KEY` o `GOOGLE_API_KEY` en el proceso nativo; no se guarda en
SQLite, preferencias, logs, el bundle ni el frontend. El adaptador tampoco
persiste el prompt ni la respuesta. Revisa las condiciones y políticas de
Google antes de enviar información sensible.

## Cookies de navegador

La opción de usar cookies del navegador está desactivada por defecto. Si la
activas, las cookies se utilizan sólo para el proceso de importación
solicitado. Pulsaria no debe copiar las cookies a SQLite, a su configuración,
a logs ni a servidores remotos.

No actives esta opción en un equipo compartido sin entender el riesgo de
exponer una sesión del navegador.

## Finalidades

Las finalidades del tratamiento local son:

- ejecutar las funciones que solicitas;
- conservar tu biblioteca local;
- transcribir e indexar contenido;
- permitir búsquedas y síntesis locales;
- mostrar estados y errores necesarios para operar la aplicación;
- guardar preferencias y aceptación de políticas en el dispositivo.

No se utilizará automáticamente el contenido de tu biblioteca para entrenar
modelos remotos ni se enviará a servicios cloud. Una solicitud manual de
Gemini es una excepción opt-in y queda bajo tu control.

## Derechos y solicitudes

Si posteriormente Pulsaria recibe datos personales directamente como parte de
un canal de soporte, responderá las solicitudes de acceso, rectificación,
cancelación u oposición conforme a la legislación aplicable.

Solicitud de privacidad y derechos ARCO: COMPLETAR ANTES DEL RELEASE.

No envíes vídeos, transcripciones, cookies ni información confidencial por
issues públicos de GitHub.

## Seguridad y conservación

Pulsaria aplica medidas técnicas razonables para reducir exposición local,
evita registrar contenido completo en errores y mantiene la confidencialidad
de la información a la que tenga acceso por soporte. Debes proteger tu equipo,
cuenta de Windows, copias de seguridad y carpetas de datos.

La conservación local depende de tus preferencias y del espacio disponible.
Las copias de seguridad y su eliminación son responsabilidad del usuario.

## Cambios

Este aviso podrá actualizarse junto con nuevas versiones. La versión
española es la referencia para usuarios en México; la versión inglesa es una
traducción informativa.
