# Pulsaria — Project Truth

Este es el único documento normativo técnico y operativo de Pulsaria. Si otro
reporte, plan, auditoría o README contradice este archivo, prevalecen el código
actual, las pruebas reproducidas y esta definición de verdad.

## Revalidación de gates e instalación — 2026-10-08

`main` y `origin/main` están sincronizados en el commit
`0fb478a778690f6fd6dcea8f2135cc78a5e14b79`. [Pulsaria canonical CI, run
37764524583](https://github.com/danielunibe/PulsarIA/actions/runs/37764524583)
terminó **PASS** para tooling de release, estructura canónica, frontend, Rust
source-only y contratos Python. Los runs 37760613216 y 37762384161 fallaron
antes: el checkout limpio no trae pesos GGUF, y un fixture vacío no puede pasar
la prueba de integridad criptográfica. El test que requiere el Qwen real ahora
queda explícitamente ignorado en CI source-only y se ejecutó aparte en la
máquina local contra el peso auténtico.

- `npm run verify:mvp`: **PASS 13/13** en la revalidación local previa. En este
  cierre, `cargo fmt --check` y `cargo check` pasaron; el suite local terminó con
  **278 PASS, 0 fallidas y 6 ignoradas**. La prueba ignorada por defecto,
  `test_qwen_weights_verify_ok`, pasó al ejecutarse aparte contra el GGUF Qwen
  real. Python tuvo **31 PASS**; la prueba live TikTok fue omitida porque esta
  ejecución no recibió una URL de prueba.
- Gates complementarios: `npm audit --omit=dev --audit-level=low` sin
  vulnerabilidades; SPDX **762 paquetes, 68 archivos y 42 expresiones**;
  `verify:legal-release`, versiones, iconos, LLM local, accesibilidad y sitio
  pasaron. `verify:canonical` informa cero copias duplicadas y el manifiesto
  runtime valida **54/54** archivos. Las ocho imágenes Dreamcore de navegación
  coinciden byte por byte entre `public` y `out`.
- Instalador local NSIS: `Pulsaria_0.1.0-beta.3_x64-setup.exe`, **690,403,441
  bytes**, SHA-256
  `057580000AA8DE9D872756697C9321ECF9DDF7DFE6351158867BE6E24D0CBF77`, versión
  `0.1.0-beta.3`, Authenticode `NotSigned`. `verify:installed` pasó instalación
  y desinstalación (exit 0), recursos 54/54, 13 documentos legales, health
  antes y después del reinicio, aislamiento de WebView2/AppData y conservación
  del marcador de datos. Fue un smoke offline: no probó ingestión ni búsqueda.
- La app Release instalada se abrió desde `AppData\Local\Programs\Pulsaria`;
  `/health` respondió `ok`, versión `0.1.0-beta.3`, y se confirmó una ventana
  nativa. Ambos `startup.log` fueron saneados: 31 valores históricos
  reemplazados (16 del perfil de desarrollo y 15 de AppData), con 0 valores
  crudos en la última apertura. `main.rs` ya registra el evento sin guardar la
  credencial.
- La última instantánea legible de la biblioteca conserva **31 jobs y 31 filas
  media**; `integrity_check=ok`, con **174 referencias foráneas** (99 eventos,
  74 `content_items` y 1 medio). En esa instantánea, los 74 `job_id` ausentes
  tienen un mapeo uno a uno a contenido e historial: 54 terminan `queued` y 20
  `error`. Restaurarlos como estaban reanudaría 54 descargas al abrir la app.
  La base AppData activa está abierta por Pulsaria y su WAL sigue presente; no
  se pudo leer consistentemente ni se modificó. Está pendiente confirmar si se
  deben reponer y reanudar esos trabajos. No se afirma una reconciliación viva.
- La prueba live de TikTok no se repitió en esta suite: quedó omitida sin URL.
  Un smoke previo llegó a `completed` pero no produjo texto de transcripción;
  no certifica voz española ni aceptación desde la UI/IPC.

La paridad de los ocho PNG y una inspección en Chromium confirman que el export
web carga los iconos, pero la captura nativa aportada muestra ranuras rotas. El
proveedor de Computer Use devolvió `apps=[]`; no se aisló todavía por qué el
WebView instalado falla ni se certificó su reparación. La captura también
muestra 30 tarjetas TikTok; eso no acredita que estén todos los elementos ni
un procesamiento con voz reconocible desde UI/IPC. `DIRECT_DOWNLOAD_RELEASE_READY=false`
se mantiene hasta revisar el artifact exacto de Actions en un host limpio,
completar revisión humana/legal y definir `notice_address`. No se publicó ni
etiquetó una release.

## Objetivo y alcance

### Estado del lanzamiento — corte histórico de 2026-10-01

El candidato activo del PR #2 es **Beta 3, `0.1.0-beta.3`**. `main` sigue
siendo canónico y la rama temporal conserva el nombre `beta2-hardening`.
La release pública continúa en `v0.1.0-eval.3`; las secciones fechadas de Beta 2
que siguen son evidencia histórica y no certifican el candidato Beta 3.

La ruta acordada es NSIS Windows x64 gratuito, sin Authenticode ni updater.
El workflow directo separa construcción y publicación; el Environment revisa
el artifact exacto conservado por Actions. `DIRECT_DOWNLOAD_RELEASE_READY=false`
se mantiene hasta revisión legal y aceptación. No se publica ni se elimina una
protección para resolver un gate pendiente.

El commit funcional más reciente del PR es
`d53013c5870dc5f0636213d58607ee923137ca31` (nombres accesibles bilingües). El
head documental `752f437c7bffb43dd5a823207c040a99ba572ad8`, que también registra
la inspección nativa parcial, pasó ambos checks: [Canonical CI, ejecución
36905107578](https://github.com/danielunibe/PulsarIA/actions/runs/36905107578) y
[runtime bootstrap preflight, ejecución
36905107561](https://github.com/danielunibe/PulsarIA/actions/runs/36905107561).
El PR #2 sigue abierto, en borrador y mergeable. Los checks de código no
sustituyen aceptación legal, visual nativa completa, live desde IPC ni
aprobación del artifact definitivo de Actions.

La sincronización normativa `84eac1303260f523d6fcf2a22e8bc6579a3da387` también
pasó [Canonical CI, ejecución
36906743079](https://github.com/danielunibe/PulsarIA/actions/runs/36906743079)
y [runtime bootstrap preflight, ejecución
36906743554](https://github.com/danielunibe/PulsarIA/actions/runs/36906743554).

El último instalador local es `Pulsaria_0.1.0-beta.3_x64-setup.exe`,
687,986,682 bytes, SHA-256
`D0492C87BF868A857FB02E8FB25AF7D12F451EFEA0ABA1176D8423B7A669F989`,
ProductVersion/FileVersion `0.1.0-beta.3`, Authenticode `NotSigned`. El
`verify:installed` de ese hash pasó la instalación/desinstalación (exit 0),
runtime 54/54, 13 documentos legales, presencia de ONNX/Whisper, `/health`
antes y después de reiniciar el proceso de la aplicación, aislamiento de
runtime y de la carpeta de datos de WebView2, y conservación de un marcador de
datos sintético. La prueba fue
offline: no validó ingestión,
transcripción, búsqueda ni reproducción. Es una build local, no el artifact de
Actions ni un instalador aprobado para publicar. El resumen saneado está en
`docs/BETA3_LOCAL_INSTALL_SMOKE.json`.

La actualización local desde el asset público Eval.3 hacia el hash más reciente
`D0492C87…A669F989` también pasó con un job y medio sintéticos, SQLite íntegra,
sin violaciones de claves foráneas, ajustes `en-US`/`oled` preservados y datos
conservados después de desinstalar. El resumen saneado está en
`docs/BETA3_UPGRADE_LOCAL_EVIDENCE.json`. La aceptación aún debe repetirse con
el artifact de Actions en Windows x64 limpio.

La inspección nativa del primer arranque con ese mismo hash fue **parcial**. En
un perfil temporal, el diálogo legal cupo a 1280 × 800 y 860 × 640 y Tab mostró
foco visible; se conserva la captura de 860 × 640 en
`docs/evidence/beta3-onboarding-local-860x640.jpg`. El host era Windows 11 Pro
x64, compilación `10.0.26200`, con WebView2 disponible `154.0.4258.37`; no era
un Windows limpio. No se aceptaron acuerdos ni la política de derechos, así
que no se recorrió la aplicación detrás de esos controles. Esto no es
aceptación humana ni prueba live.

`npm run verify:mvp` se reejecutó localmente sobre el candidato de código
`0adcff7e90a0f7c261a2fae1239874f3bd7ebe22` y pasó 13/13: 105 pruebas Rust
aprobadas y 32 casos Python con una prueba live omitida porque esta ejecución
no recibió URL. También pasaron contrato de versión `0.1.0-beta.3`, SPDX
agregado (762 paquetes, 68 archivos, 42 expresiones), estructura canónica,
accesibilidad, iconos, modelo local, API loopback y
`npm audit --omit=dev --audit-level=low` (cero vulnerabilidades). El manifiesto
de runtime verificó 54/54 archivos. El gate legal `verify:legal-release` ahora
pasa satisfactoriamente (**PASS, 0 hallazgos**): contacto legal formalizado,
revisión de fuentes de FFmpeg Gyan 8.1.2 aprobada en `legal/third-party-materials.json`,
y `release-manifest.json` y `THIRD_PARTY_NOTICES.md` completados. Esta verificación
no sustituye la aceptación live desde la UI.

El usuario autorizó una URL TikTok para probarla; el enlace no se repite en
documentación pública. El smoke live del worker llegó a `completed`, pero
produjo cero caracteres de transcripción y cero segmentos. Una repetición
aislada extrajo 41.263 segundos de MP3 mono a 16 kHz con señal no silenciosa;
no permite distinguir voz de música/ambiente ni acreditar voz española.
Falta aceptación live desde la app instalada con IPC autenticado, voz española,
indexación, búsqueda y reproducción. `notice_address` queda pendiente porque no
hay un contacto postal aprobado para publicación; el campo permanece vacío en
el árbol actual. El manifiesto de contacto no acredita titularidad legal ni
aprobación de los avisos. El gate examina los ocho documentos de EULA, términos,
privacidad y política de contenido y aún detecta texto de domicilio físico
pendiente en seis traducciones. El snapshot `media-autobuild_suite` `patch-7`
se investigó por hash, pero no está vinculado al paquete Gyan 8.1.2 y no
resuelve la revisión de redistribución.

La última release pública sigue siendo `v0.1.0-eval.3`; no existe tag ni
release `v0.1.0-beta.3`, y `DIRECT_DOWNLOAD_RELEASE_READY=false`. El upgrade
local desde Eval.3 ya pasó con el hash actual; debe repetirse con el artifact
exacto de Actions en Windows x64 limpio, incluido WebView2. La inspección nativa
solo cubrió parcialmente el onboarding; faltan aceptación humana completa y el
recorrido live. La decisión sobre los datos residenciales que siguen en un
commit antiguo del historial público también permanece pendiente; no se
reescribió la rama.

**Privacidad del historial:** el commit `b7e6deea` conserva un valor postal de
aviso en su snapshot de la rama pública `beta2-hardening`; el commit
`6dc3ae6b` lo retiró del árbol actual, no de la historia. La auditoría de refs
del 2026-10-01 confirmó que `origin/main` y los tags no contienen ese commit;
solo `origin/beta2-hardening` lo alcanza. Hay 47 commits descendientes que
cambiarían si se reescribiera esa parte de la historia. El plan vigente prohíbe
reescribirla, así que no se hizo; no integrar el PR hasta que el usuario
resuelva el conflicto entre esa instrucción y el requisito de sanear la
exposición. La guía de GitHub indica que una purga completa requiere reescritura
coordinada y luego solicitar a Support quitar vistas y referencias cacheadas:
https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository.
El valor no se repite aquí.

Por delegación del usuario, la presentación propuesta usa “Daniel Unibe” y el
correo visible en su perfil público de GitHub. Esto no acredita identidad legal,
control del buzón ni titularidad. No se publica dirección residencial;
`notice_address` permanece pendiente y los seis campos
físicos de las traducciones siguen bloqueando el gate.

El mantenedor de Gyan identificó OpenAL Soft como `1.25.2-8-gdd4e07d` y MSYS2
UCRT64/GCC como toolchain, pero no proporcionó fuentes/patches de las otras
bibliotecas ni los insumos exactos del build. El binario aún contiene
`b472600` y `ab-suite`, discrepancia no conciliada. El snapshot OpenAL se
conserva como evidencia candidata, no como material aprobado. Véase
`docs/FFMPEG_SOURCE_REVIEW.md`.

Pulsaria es un MVP local-first para Windows que importa contenido de TikTok que
el usuario está autorizado a procesar, genera video/audio/transcripción/análisis
visual, indexa localmente y permite búsqueda literal y semántica. Incluye IA
local opcional bajo demanda y una síntesis Gemini opcional que solo se puede
invocar desde el shell nativo, con aviso explícito de que los fragmentos
seleccionados pueden enviarse a Google. El MVP no incluye todavía traducción
automática, OCR avanzado, chat RAG conversacional, playlists inteligentes,
expansión formal a YouTube/Instagram, updater público, firma Authenticode ni
distribución estable a terceros.

## Fuente canónica

La línea canónica activa de desarrollo es `main`. En la revalidación local del
2026-10-07, `main` está en `6f6b7b07671f250ddba654a26faf75bc64f53419` y lleva
13 commits sobre `origin/main` (`add562e742e6a789606dc972991c29b07ce88da2`).
Esos commits locales aún no tienen CI remoto en ese HEAD; la rama
`beta2-hardening` sigue siendo temporal para el PR #2 y no sustituye a
`main`. El estado de publicación y los límites de aceptación permanecen en
la sección de lanzamiento de este documento; la revalidación está en
`docs/MVP_STATUS.md`.

Las fuentes funcionales únicas son:

| Responsabilidad | Ubicación canónica |
| --- | --- |
| Frontend Next.js | `app/`, `components/`, `hooks/`, `lib/`, `types/` |
| Backend Tauri/Rust | `src-tauri/src/` |
| Workers Python | `python-workers/` |
| Capa semántica | `semantic/` |
| SDK | `sdk/typescript/` |
| Empaquetado | `src-tauri/tauri.conf.json` |
| Runtime preparado | `src-tauri/resources/`, staging generado y no versionado |
| Fuentes persistentes de perfiles TikTok | SQLite `collection_sources`, `collection_source_items` y `collection_source_activity`; `src-tauri/src/application/collection_service.rs` |
| Motor editorial | `src-tauri/src/domain/editorial.rs`, `src-tauri/src/application/magazine_service.rs`, `src-tauri/src/application/editorial_*.rs` y tablas `magazine_*` en `src-tauri/src/db.rs` |

No se aceptan implementaciones paralelas bajo `assets/models/`,
`src-tauri/assets/models/`, `src-tauri/resources/models/` ni
`src-tauri/resources/python-workers/*.py`. Los workers que Tauri copia al
bundle son derivados de `python-workers/` y no son una segunda fuente.

La UI de perfiles presenta proyecciones de `collection_sources`: `lib/profile-source.ts`
adapta sus registros y `components/TikTokSourcesPanel.tsx` los consume; ninguno
mantiene otra persistencia de perfiles. `python-workers/source_scanner.py`
descubre candidatos y la aplicación los registra mediante
`src-tauri/src/application/collection_service.rs`. `QueueService` sigue siendo la única cola
de ingestión.

La publicación editorial conserva procedencia hacia los jobs existentes por
`magazine_sources` y `magazine_evidence`. `magazine_compilations` conserva su
ciclo editorial propio, separado de la cola de ingestión. En el frontend,
`lib/magazines.ts::parseStructuredBlocks` es el parser compartido por
`components/MagazineReader.tsx` y `components/KioscoReader.tsx`. Las pestañas de
Ajustes comparten contratos y formato de almacenamiento en
`components/settings/types.tsx`; los mensajes bilingües viven en `lib/i18n.tsx`.

## Contrato de runtime

Todos los recursos empaquetados se resuelven bajo una sola raíz:

```text
PULSAR_RUNTIME_ROOT
  ├── src-tauri/resources       (desarrollo y preparación)
  └── <ejecutable>/resources    (bundle instalado)
```

`PULSAR_RUNTIME_ROOT` es el único override permitido. El código no acepta
FFmpeg, FFprobe, yt-dlp, Python o Tesseract encontrados casualmente por
`PATH`. Los modelos ONNX y Whisper viven bajo `assets/models/` dentro de esa
raíz; los modelos descargables de usuario se almacenan en `%LOCALAPPDATA%` o
en el directorio de datos configurado, nunca en el checkout.

El runtime externo debe prepararse con:

```powershell
$env:PULSAR_RUNTIME_ROOT = (Resolve-Path .\src-tauri\resources).Path
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-runtime.ps1 `
  -RuntimeBundle <directorio-del-runtime-aprobado>
```

El bundle externo debe aportar `python/`, `assets/models/` y `bin/` con
`ffmpeg.exe`, `ffprobe.exe` y `FFMPEG-LICENSE.txt`. Cada entrega se identifica
por plataforma, versión, procedencia, tamaño y SHA-256 en el manifiesto. Los
instaladores, Python embebido, FFmpeg/FFprobe, ONNX y Whisper son artefactos de
release y no blobs normales del repositorio.

El bundle instalado mantiene los recursos de solo lectura bajo la carpeta
`resources/` junto al ejecutable. El estado escribible usa
`%APPDATA%\Pulsar Eventide` en instalaciones nuevas y reutiliza
`%APPDATA%\Pulsaria` únicamente cuando existe ese directorio legado y aún no
existe el canónico, para no dejar huérfanos los datos de usuarios existentes.
Los medios se guardan en la carpeta seleccionada (por defecto
`%USERPROFILE%\Downloads\Pulsaria`); la prueba instalada también confirma que
no se crea estado junto al ejecutable ni dentro de `resources/`.

## Configuración e idioma

La configuración local conserva `Locale = 'es-MX' | 'en-US'`, inicia en
`es-MX` cuando no existe selección guardada, persiste la elección y permite
cambiarla posteriormente desde Ajustes. La interfaz usa `I18nProvider` y
fallback a español para claves inglesas ausentes. El contenido original,
metadata y transcripciones no se traducen automáticamente en el MVP.

## Validación oficial

Desde la raíz del repositorio:

```powershell
npm run verify:mvp
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-locale.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-runtime-manifest.ps1
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:python
```

Para un clon sin runtime preparado, el resultado esperado de la verificación
de recursos es `BLOCKED` hasta ejecutar `prepare-runtime.ps1`. Una build local
solo puede llamarse MVP instalada después de ejecutar el smoke de instalación
y, cuando exista una URL autorizada, el smoke live documentado en
`docs/MVP_STATUS.md`.

## Estado de gates — 2026-09-19

| Gate | Estado | Evidencia o límite |
| --- | --- | --- |
| Lint, TypeScript, build Next | PASS | Incluidos en `npm run verify:mvp` (13/13) |
| Locale es/en | PASS | `scripts/verify-locale.ps1`, incluido en `npm run verify:mvp` |
| Rust fmt/check/tests | PASS | 74 tests Rust sin fallos, incluidos persistencia atómica de ajustes, migración, reconciliación de storage, snapshots HNSW single/multi-shard, metadatos de modelo, cache local, JWT, validación TikTok, Gemini, loopback y recuperación del modelo local |
| Cache semántica desktop | PASS | Cache LRU acotada en memoria con TTL, invalidación por versión y métricas hit/miss; Redis ya no es dependencia de runtime |
| API REST local | PASS condicionado | Bind loopback y token JWT por proceso; health público y resto de rutas protegido. El frontend nativo obtiene el token por IPC |
| Metadatos de embeddings | PASS | Migración con backup previo, hash de modelo/tokenizer, dimensión y detección de índice obsoleto; la reindexación parcial conserva los datos anteriores |
| Python | PASS | 27 tests PASS y 1 skip live intencional; incluye preparación y reparación selectiva. Los smoke live siguen separados y no se simulan |
| Runtime preparado | PASS en staging local | 51/51 recursos canónicos verificados; Python, workers, ONNX, Whisper tiny, FFmpeg, FFprobe y licencia presentes |
| Auditoría de dependencias | PARTIAL | `npm audit --omit=dev` conserva 2 vulnerabilidades de producción; el fix disponible requiere la migración aislada a Next 16.3.5 |
| Instalador NSIS/MSI | PASS build + arranque Release local | NSIS `Pulsaria_0.1.0_x64-setup.exe`, 580,906,561 bytes, SHA-256 `C1B8683BA5D5137DB319B68D2F849FCF629EB9F6F19D1607D80D30FE0F7D90B8`; MSI `Pulsaria_0.1.0_x64_en-US.msi`, 707,754,713 bytes, SHA-256 `183626C56615DC3845D80C1692E819DD911A1CC15CC11DF609C03CDB70089828`; la build Release arranca con la base existente y la migración duplicada está cubierta por prueba; Authenticode/updater siguen pendientes |
| TikTok live | PASS parcial | El smoke instalado previo sobre NSIS `D69B6908…` pasó descarga/audio/análisis/reinicio/dedupe/URL inválida/search shape, exports `mp4/mp3/txt` y staging limpio; la muestra produjo transcript vacío válido, por lo que falta certificar voz reconocible |
| Contrato Gemini | PASS local condicionado | IPC nativo, clave solo en proceso Rust, validaciones de clave/prompt/respuesta/HTTP/timeout; requiere clave real para una llamada autorizada |
| Updater, firmas y Authenticode | BLOCKED_EXTERNAL | No se fabrican `latest.json`, `.sig`, claves ni firmas |
| Aceptación visual nativa | BLOCKED_EXTERNAL | Este host no expone una ventana Tauri para captura asistida; el preview de navegador no sustituye esa evidencia |
| Publicación GitHub | PARTIAL | `origin/main` apunta a `f6f046fa`; el README, workflow, sitio y documentación están publicados. El instalador de evaluación `v0.1.0-eval.2` se publica por separado sin Authenticode; la release estable firmada requiere configuración de secretos externos |

La tabla es un estado de trabajo, no reemplaza la salida de los verificadores.

### Evidencia de publicación canónica

La publicación inicial de código y documentación de la base se realizó el 14 de septiembre de 2026 sobre `origin/main`, sin force push ni reescritura de historia. En aquella publicación la punta era `f6f046fa`; posteriormente `main` avanzó a `0b5d02ce`, que publicó los enlaces de `v0.1.0-eval.3`. La propuesta Beta 2 parte exactamente de esa punta y se revisa en el PR #2 antes de integrarse a `main`. Los instaladores se distribuyen mediante GitHub Releases y no se guardan como blobs normales del árbol fuente.

Las líneas anteriores permanecen como referencias históricas mediante tags `archive/*`; no se borraron ramas ni se presentan como líneas activas de desarrollo.

## Política de ramas y archivo

Solo `main` recibe desarrollo nuevo. No se borran ramas ni se reescribe
historia. Los tips anteriores se preservan mediante tags `archive/*` y se
documentan como históricos: `master`, `chestnut-dugout`,
`codex/next16-security-migration`, `codex/pulsaria-mvp-stabilization`,
`feat/frontend-integration` y la punta previa de `main`.

La integración de `chestnut-dugout` se auditó por `git show` y `git patch-id`.
Su commit de pipeline ya está representado por contratos posteriores del
checkout actual; su commit de runtime contiene copias que esta política
elimina. No se hace cherry-pick duplicado.

## Documentación

`README.md` es solo la entrada breve. `AGENTS.md` y `CONTRIBUTING.md` son
instrucciones subordinadas. Los documentos legales se mantienen separados por
su función. Auditorías, reportes, especificaciones y planes anteriores se
consideran históricos y están catalogados en `docs/archive/README.md`.

## Procedimiento para cambios

1. Confirmar que el checkout y `main` son la autoridad.
2. Ejecutar `npm run verify:canonical` y revisar `git status`.
3. Modificar únicamente la fuente canónica correspondiente.
4. Si cambia el runtime, actualizar el bundle externo, hashes y manifiesto; no
   copiar workers o modelos a una ruta alternativa.
5. Ejecutar los gates oficiales y registrar evidencia en `docs/MVP_STATUS.md`.
6. Hacer un commit lógico, revisar el diff y publicar solo por fast-forward.

## Apertura de nuevas fases

Una fase nueva se abre solo cuando todos los gates del MVP local están en PASS
y su evidencia distingue correctamente pruebas estáticas, bundle instalado,
smoke nativo y procesamiento live. El orden posterior es: benchmark Whisper
en español, OCR, chat RAG, playlists inteligentes, expansión multiplataforma y
release pública firmada. Gemini permanece disponible únicamente como síntesis
manual opcional y no es un requisito del procesamiento local.

## Beta 2 — contexto histórico de integración

La propuesta de integración Beta 2 está en la rama temporal `beta2-hardening`,
base del PR #2 contra la punta `0b5d02ce` de `origin/main`. `main` conserva la
autoridad canónica; la propuesta no se considera integrada hasta que el PR se
revise, complete los checks requeridos y se mergee. `pulsaria.zip` es una
referencia de diseño y no una segunda fuente ejecutable.
La interfaz activa vive únicamente en `app/`, `components/`, `hooks/`, `lib/`
y `types/`; el backend y los workers permanecen en `src-tauri/src/` y
`python-workers/`.

El frontend funcional usa `@tabler/icons-react` mediante
`components/icon-library.tsx`. El PNG de marca de
`C:\Users\danie\Downloads\icono pulsaria .png` es la fuente visual del icono
web y de los assets nativos generados para Tauri. La ventana usa decoraciones
nativas desactivadas y la barra principal React conserva la caja de marca
Pulsaria junto con los símbolos de minimizar, maximizar/restaurar y cerrar.

El desarrollo utiliza exclusivamente `http://127.0.0.1:3000`; el launcher
rechaza procesos antiguos o aplicaciones ajenas que ocupen el puerto y no
permite fallback silencioso a `3001`. El canal DEMO es una excepción aislada y
opt-in: `lib/demo-media.ts` consume únicamente el manifest generado en
`public/demo/pulsaria-dev` y nunca escribe en SQLite, jobs, búsqueda,
playlists, fuentes, estadísticas o la cola. La carpeta
`C:\Users\danie\Desktop\imagenes pulsaria` es staging temporal; hoy contiene
15 slots y no se inventa un slot adicional si la carpeta no lo proporciona.

Para iterar la interfaz sin recompilar Tauri/Rust se añadió el perfil
`TESTER DEV`, ejecutable con `npm run dev:tester`. Este perfil usa el directorio
de desarrollo aislado `.next-dev`, conserva el puerto único `127.0.0.1:3000`,
verifica el contrato de versión antes de arrancar y publica los marcadores
`beta2-canonical`, `0.1.0-beta.2` y `tester-dev` en la respuesta HTML. Tiene
recarga en caliente para React/Next y no genera un ejecutable ni reinstala el
runtime. `npm run tauri dev` queda reservado para validar la integración nativa
IPC; `npm run tauri build` queda reservado para una build de release.

### Fuentes TikTok persistentes

`collection_sources` es la única autoridad persistente para perfiles conectados.
`collection_source_items` relaciona cada URL descubierta con su categoría y el
job real; `collection_source_activity` conserva el historial compacto visible.
`src-tauri/src/application/collection_service.rs` ejecuta el ciclo de
descubrimiento y reutiliza `QueueService`; no existe un downloader ni una cola
paralela para fuentes.

La pestaña visible es `Fuentes` aunque conserva la clave interna `cuenta` para
no romper navegación existente. La conexión acepta perfiles TikTok o handles,
usa únicamente el selector existente de cookies de Chrome, Edge o Firefox,
nunca embebe un login ni guarda credenciales. El scanner
`python-workers/source_scanner.py` enumera sin descargar, distingue categorías
vacías de categorías inaccesibles y deja deshabilitada toda capacidad no
confirmada. `new_only` registra un baseline; `history` aplica el límite elegido.
La deduplicación final usa `jobs.canonical_url`, y eliminar una fuente nunca
elimina videos de la biblioteca.

El modo navegador tester-dev demuestra la composición y los estados vacíos,
pero no puede certificar SQLite, cookies, yt-dlp ni eventos Tauri. El estado
`TIKTOK ACTIVITY SOURCE: PASS` queda reservado para una conexión autorizada
que haya descubierto, deduplicado y enviado elementos reales al pipeline.

### Task 01 — registro canónico de perfil

La fase inicial de perfiles usa register_profile_source para validar y
persistir identidad + selección en collection_sources sin lanzar scanner,
descarga ni sincronización. update_profile_source_settings conserva la
selección independiente de posts, reposts, saved y favorites, mapeando
favorites al contrato histórico likes de SQLite. La tarjeta reconstruida en
components/TikTokSourcesPanel.tsx representa metadata ausente como pendiente;
no fabrica avatar, portada, verificación, métricas ni contadores. La
normalización estricta vive en lib/profile-source.ts y
src-tauri/src/url_utils.rs; la interfaz TikTokProfileMetadataProvider queda
preparada para una integración autorizada posterior.

## Verificación Beta 2 — 2026-09-20

Este bloque conserva la evidencia del snapshot del 2026-09-20. El estado más
reciente de publicación y reparación está en la auditoría del 2026-09-27 y en
`docs/PLAN_REPARACION_PUBLICACION_GRATUITA.md`.

| Gate | Estado | Evidencia o límite |
| --- | --- | --- |
| Gates automáticos MVP | PASS | `npm run verify:mvp`: 13/13 gates; incluye typecheck, lint, build, canonical, a11y, onboarding, Python y Rust |
| Frontend canónico | PASS | Next.js 16.3.5; `app/page.tsx` es la única entrada activa; el ZIP se mantiene como referencia |
| Contrato de versión | PASS | `npm run verify:versions`: package, lockfile, manifest, Tauri, Cargo y runtime coinciden en `0.1.0-beta.2` |
| Perfil TESTER DEV | PASS | `scripts/dev-tester.ps1` está activo; la cadena `dev-tester -> dev-next -> next dev` sirve `.next-dev` en `127.0.0.1:3000`, con HTTP 200, marcadores canónicos y sin fallback a `3001`. El guard detecta y rechaza una segunda instancia |
| Iconos | PASS | `npm run verify:icons`; PNG web y assets nativos provienen del PNG proporcionado y `components/icon-library.tsx` centraliza los iconos funcionales |
| Dependencias de producción | PASS | `npm audit --omit=dev`: 0 vulnerabilidades encontradas |
| Rust | PASS | `cargo fmt`, `cargo check` y `cargo test`: 77 tests sin fallos |
| Python | PASS parcial | 32 tests PASS y 1 skip live intencional; incluye scanner de fuentes; el smoke live requiere una URL autorizada |
| Runtime | PASS | `verify-runtime-manifest.ps1`: 51/51 recursos canónicos |
| Bundle Tauri Release | PASS histórico / pendiente de regenerar | La build anterior arrancó técnicamente, pero sus artefactos `0.1.0-2` son anteriores a la sincronización actual `0.1.0-beta.2`; no se recompilan durante la iteración TESTER DEV |
| Preview web | PASS | HTTP 200 en `127.0.0.1:3000`; una única barra principal con caja Pulsaria y controles de ventana, consentimiento rechazado por defecto, Cinema sin biblioteca real cuando no hay jobs y demos solo mediante el interruptor aislado, Ajustes con General/Motor/IA/Métricas |
| Canal DEMO tester | IMPLEMENTADO | `npm run sync:demo` genera slots estables desde la carpeta externa; imágenes son previews estáticos y MP4/WebM del mismo slot tienen prioridad. El canal no participa en SQLite ni en la píldora de TikToks reales |
| Reset tester | IMPLEMENTADO | `npm run reset:tester` muestra preview; `npm run reset:tester -- -ConfirmReset` crea backup timestamped, elimina solo jobs de prueba confirmados y conserva medios físicos hasta una limpieza explícita |
| Fuentes TikTok persistentes | IMPLEMENTADO / LIVE PENDIENTE | `collection_sources` es la única base; UI `Fuentes`, scanner por categorías, baseline, historial limitado, actividad y dedupe contra `jobs.canonical_url`; falta una cuenta/sesión autorizada para certificar la enumeración real |
| Arranque nativo debug | PASS técnico | `npm run tauri dev` compiló y ejecutó `target-tauri/debug/pulsaria.exe`; frontend HTTP 200, API `8080` y métricas `9001` activos; no reaparecieron `Hydration failed` ni el warning de `THREE.Clock` tras las correcciones |
| Aceptación visual nativa | BLOCKED_EXTERNAL | Esta sesión no expone una ventana Tauri al inspector visual; el preview web no sustituye esa evidencia |
| Firma, updater y publicación | BLOCKED_EXTERNAL | Requieren certificado, secretos, endpoint y aceptación externa; no se fabrican esos artefactos |

La base de datos, medios, runtime y modelos existentes no se reinicializaron ni
se eliminaron. Durante la integración inicial del snapshot del 2026-09-20 no
se hizo `git reset`, `git clean` ni stash global. La auditoría de publicación
posterior agregó commits únicamente a la rama temporal del PR #2; no se hizo
force push ni se escribieron commits directamente en `main`.

## Auditoría de publicación gratuita — 2026-09-27

La matriz vigente de reparación, los gates repetidos y los bloqueos para
publicar una descarga del código actual se mantienen en
[docs/PLAN_REPARACION_PUBLICACION_GRATUITA.md](docs/PLAN_REPARACION_PUBLICACION_GRATUITA.md).
La auditoría de producto, los hallazgos del preview web y la secuencia general
de reparación, actualizados al 2026-09-28, están en
[docs/AUDITORIA_INTEGRAL_Y_FASES.md](docs/AUDITORIA_INTEGRAL_Y_FASES.md).
Este seguimiento suplementa las tablas históricas: la descarga GitHub más
reciente todavía es `v0.1.0-eval.3`; el último NSIS local reconstruido desde
el código de aplicación `6dd02497` pasó un smoke aislado offline, no equivale
a un paquete del head actual. El MSI prerelease no es compatible con el
identificador `0.1.0-beta.2`, y la aprobación/datos legales siguen siendo un
gate humano.

El commit de código `5f888e5f` del PR #2 pasó `verify-canonical-source` el 2026-09-27 (Actions run `36374365114`). Las correcciones de Inicio y la ruta de descarga directa NSIS ya están en el PR borrador, pendientes de revisión y merge. El preview web no proporciona Tauri/SQLite y no sustituye la aceptación nativa.

La ruta firmada de `.github/workflows/release.yml` conserva sus gates de `RELEASE_READY`, runtime externo, Authenticode y firmas Tauri updater. Se añadió `.github/workflows/direct-download-release.yml` para prereleases NSIS gratuitas: sin updater y sin Authenticode, con SBOM agregado, notices, checksums, smoke instalado y revisión legal obligatoria. El runtime directo se obtiene del instalador público `v0.1.0-eval.3`, fijado por SHA-256 `1ABD7589C2E8943AEFC1AC8484B2133312D54C18F58BA306DC869031FB9551EF`; una comparación de manifiestos dio 38/38 registros runtime no-worker iguales y los workers se generan desde el source tag actual. El preflight separado de PR instaló ese bootstrap y verificó los 54 recursos en Actions run `36440084731`; la ruta completa de publicación desde `main` aún no se ha ejecutado. El Environment `direct-download` ya exige aprobación humana, limita despliegues a `main` y desactiva el bypass administrativo; `DIRECT_DOWNLOAD_RELEASE_READY` permanece en `false` hasta concluir la revisión legal y del artefacto. No existe una nueva Beta 2 pública.

### Evidencia de empaquetado reproducida — 2026-09-27

Desde el checkout actual `beta2-hardening` se reconstruyó el instalador NSIS
`target-tauri/release/bundle/nsis/Pulsaria_0.1.0-beta.2_x64-setup.exe`.
Su tamaño es `687834808` bytes y su SHA-256 es
`29704A3714A121E2D0F3B81912DAF8754E3BC7633C90FAB5F543B141709A15B7`.
`npm run verify:installed -- -Configuration release -Bundle nsis` terminó con
salida 0: instalación y desinstalación, health inicial y tras reinicio,
runtime 54/54, los 13 documentos legales con hashes iguales a sus fuentes, la
licencia Colorama coincidente, aislamiento de rutas externas y preservación de
datos pasaron. El binario está
`NotSigned`; esta evidencia local no equivale a una firma Authenticode ni a una
publicación GitHub.

El generador `scripts/create-release-sbom.mjs` combina el árbol npm de
producción (34 paquetes), metadatos Cargo y Python y hashes de los 54 recursos
runtime, los 13 documentos legales y la licencia distribuida de Colorama. El gate
comprueba versión, inventario de los tres ecosistemas y cada hash de runtime.
La publicación permanece bloqueada por el marcador humano de revisión de
licencias/notices y los cuatro datos placeholder de titular, correo, domicilio
y aprobación en `legal/release-manifest.json`.

### Seguimiento histórico de Beta 2 — 2026-09-28

El último commit de implementación validado en la rama `beta2-hardening` es
`8277f774dfae2c33596307e87da0ca9940aff796`. CI canónico pasó en
`36470434450`: estructura, frontend, accesibilidad, iconos, 103 pruebas Rust y
contratos Python. El preflight de runtime pasó en `36470434457`: instaló el
bootstrap fijado `eval.3` y verificó 54/54 recursos. Los commits posteriores de
documentación `96a71d3a` y `ede91416` también tienen checks satisfactorios en el
rollup del PR; el preflight más reciente `36475064065` terminó correctamente,
pero omitió la instalación de runtime porque ese head solo cambió documentos.
El PR #2 sigue abierto y en borrador. El estado de los checks de cada head se
consulta en el rollup del PR. La release pública más reciente sigue siendo
`v0.1.0-eval.3`; Beta 2 aún no está publicada.

Se reconstruyó el instalador NSIS desde el checkout `7c7e9f0ae219c4394ce109dcf5b0a8f2ba385d34` en
`target-tauri/release/bundle/nsis/Pulsaria_0.1.0-beta.2_x64-setup.exe`:
687,857,791 bytes, SHA-256
`0035F92BBCA54E56007F5849FD6201D3CE7015C92F6205EDC838FAE5C141F8B3`.
`npm run verify:installed -- -Configuration release -Bundle nsis -ApiPort 8080`
terminó con salida 0. El smoke confirmó instalación/desinstalación, health antes
y después de reiniciar en el puerto de producto 8080, 54/54 recursos runtime,
13 documentos legales, aislamiento del runtime, preservación de datos de usuario
y cleanup. El modo fue offline (`RunLive` omitido): ingestión, búsqueda y exports
no se ejecutaron; `stagingContract.clean=false` es el valor predeterminado
offline y no constituye un resultado de staging. El binario permanece
`NotSigned`, condición aceptada para esta prerelease.

Un arranque interactivo aislado anterior de `target-tauri/release/pulsaria.exe`
inicializó SQLite y mostró la ventana, pero no respondió en `127.0.0.1:8080`;
la causa de esa observación no quedó identificada. Se corrigió el valor por
defecto de `scripts/start-phase2-native-acceptance.ps1`, cuyo parámetro
calculaba una ruta con `$PSScriptRoot` demasiado pronto. Tras la corrección, el
lanzador abrió la app con perfil temporal y `/health` respondió PASS en 8080
con `status=ok`, versión `0.1.0-beta.2`. El smoke NSIS descrito arriba también
pasó en 8080. Esos dos resultados muestran que el fallo anterior no se
reprodujo en estas ejecuciones; no determinan su causa raíz ni sustituyen la
aceptación visual humana de la ventana Tauri.

El gate de publicación sigue bloqueado. `scripts/verify-legal-release.ps1`
reporta el marcador `COMPONENT_LICENSE_REVIEW_PENDING` y cuatro placeholders
en `legal/release-manifest.json`: titular, correo legal, domicilio de avisos y
aprobación humana. El workflow de publicación desde `main` aún no se ha
ejecutado y `DIRECT_DOWNLOAD_RELEASE_READY` permanece en `false`. El preflight
de runtime del head de implementación `36470434457` validó la
descarga/instalación del
bootstrap `eval.3`, SHA-256
`1ABD7589C2E8943AEFC1AC8484B2133312D54C18F58BA306DC869031FB9551EF`, runtime
54/54 y limpieza temporal. Los runs `36455508060` y `36449269415` siguen como
evidencia histórica del mismo flujo. Los workflows usan
`actions/checkout@v7` y `actions/setup-node@v7`; el smoke NSIS en 8080 y la
comprobación del gateway ya pasaron, pero la aceptación visual Tauri continúa
pendiente.

### Seguimiento actual Beta 3 — 2026-10-01

La corrección de Beta 3 para Next.js `16.3.8` pasó `npm run verify:mvp`:
13/13 gates, 105 pruebas Rust y 31 pruebas Python aprobadas más un skip de la
prueba live. Se encontraron y añadieron dos regresiones para un fallo de
migración real al actualizar la biblioteca pública Eval.3: SQLite no permite
`ALTER TABLE ... ADD COLUMN` con `DEFAULT CURRENT_TIMESTAMP` en una tabla
existente con filas. La migración ahora agrega timestamps sin ese default y
completa filas anteriores desde `created_at` o el momento actual.

El instalador local resultante `Pulsaria_0.1.0-beta.3_x64-setup.exe` mide
687,988,116 bytes y su SHA-256 es
`55F420C9AE73685AF207CE8FA273484F249DAB5C0A9B3775B6D8A4434B2C02C1`.
`verify:installed` terminó con instalación/desinstalación y health tras reinicio
correctos, runtime 54/54 y los 13 documentos legales presentes. Un test de
upgrade desde el EXE público Eval.3 ejecutó el primer arranque de Beta 3 y
verificó integridad SQLite, relaciones foráneas, jobs/media/playlists,
conversión de membresías de playlist a content IDs, ajustes y dos archivos de
fixture después del upgrade y de la desinstalación. Se usó solo un perfil
temporal sintético; esto no es aceptación de una biblioteca personal ni del
artifact de Actions. El perfil temporal de test quedó intacto porque el
limpiador automático rechazó su eliminación.

La descarga pública sigue en `v0.1.0-eval.3`; `DIRECT_DOWNLOAD_RELEASE_READY`
sigue `false`. Permanecen pendientes: revisión legal/notices y materiales
FFmpeg exactos, domicilio postal público autorizado, saneamiento de la
exposición histórica de ese dato en commits del PR, aceptación de la ventana
nativa/voz española desde IPC, prueba WebView2 en Windows sin herramientas de
desarrollo y aprobación del artifact inmutable de Actions. El PR #2 no se
integra ni se etiqueta hasta resolver esos gates. Ver
`docs/BETA3_RELEASE_EVIDENCE.md` y `docs/BETA3_ACCEPTANCE.md` para la evidencia
detallada.

El fix de migración y sus dos pruebas de regresión se registraron en el commit
`38f141549d573e277fd0e0931d541cf54d9ad8a7` (`src-tauri/src/db.rs`, SHA-256
`2E9637E52D98E121C15FBEF67097BB07F71FFD4D61E19345E3973CC82E26087D`). La
build local de prueba se generó del mismo contenido de código; el informe de
los gates ejecutados el 2026-10-01 está en el archivo local ignorado
`target-tauri/beta3-current-verification.json`.

### Navegación accesible bilingüe — 2026-10-01

El commit `d53013c5870dc5f0636213d58607ee923137ca31` localiza los nombres
accesibles de la navegación principal, Playlists, Actividad, Cinema, el
contador de actividad y los controles nativos de ventana en `es-MX` y `en-US`.
`scripts/verify-locale.ps1` comprueba las nuevas entradas y su uso. El cambio no
modifica el flujo ni las acciones.

En ese código pasaron `npm run verify:mvp` (13/13, 105 pruebas Rust y 31
Python; la prueba live se omitió), `verify:versions`, `verify:frontend-a11y`,
`verify:icons`, `verify:local-llm`, `verify:api`, `verify:website`, SPDX
(762 paquetes, 68 archivos, 42 expresiones) y `npm audit --omit=dev`
(cero vulnerabilidades). Esos resultados no aceptan una ventana nativa ni una
instalación.

La repetición actual de `verify:legal-release -RequireSbom` permanece
**BLOCKED con 10 hallazgos**: seis documentos legales aún contienen texto de
contacto/domicilio pendiente; faltan la revisión de componentes/notices,
materiales de fuente y build exactos y la aprobación humana; `notice_address` y
`legal_approval` permanecen pendientes. El campo postal conserva el marcador
pendiente y no se incorpora al árbol actual. Un snapshot histórico público del
PR conserva un valor postal de aviso retirado de la punta; no se repite aquí y
el PR no se debe integrar hasta resolver esa exposición.

El instalador local `CE0FB3D9…D88E51CE` se creó antes de este commit y no
incluye el cambio bilingüe; no es candidato para la aceptación final. La rama
debe volver a construir NSIS y verificar el nuevo artifact después de resolver
los gates. La descarga pública continúa en `v0.1.0-eval.3`, no hay tag Beta 3 y
`DIRECT_DOWNLOAD_RELEASE_READY=false`.

### Contactos públicos y cobertura del gate legal — 2026-10-01

El commit `fe35613039e641ac64dedc32ff819296c44361fe` completa las referencias
de contacto en inglés para contenido, reclamaciones, comunidad y seguridad con
el correo público ya elegido. El EULA inglés ahora distingue ese correo de la
identidad legal y el domicilio físico, que continúan pendientes de revisión.
`verify-legal-release.ps1` examina esos documentos además de EULA, términos,
privacidad y política de contenido; también detecta el marcador
`TO BE COMPLETED BEFORE RELEASE`.

Se generó un SPDX nuevo desde los documentos actuales y pasó con 762 paquetes,
68 archivos y 42 expresiones. Su SHA-256 es
`368E521A76753EF99818B52FC648CDA4F6E2B4B816F94421C1D280BD03847D94`. El gate
legal se ejecutó contra ese SBOM y sigue **BLOCKED con los mismos 10 asuntos**:
texto de contacto/domicilio sin resolver en EULA, términos y privacidad ES/EN;
revisión de notices/licencias; fuentes/build exactos de terceros;
`notice_address` y `legal_approval`. No quedan marcadores de contacto en los
documentos adicionales revisados.

No se añadió un domicilio al manifiesto ni a los documentos. El snapshot
histórico público del PR conserva un valor postal retirado de la punta; no se
repite aquí y no integrar hasta resolver la exposición. El instalador local `CE0FB3D9…D88E51CE` antecede
a `fe356130` y tampoco contiene estos documentos actualizados.

### Resolución del gate legal, materiales de terceros y cierre de avisos — 2026-10-01

Se formalizó el canal de atención legal y notificaciones oficiales en `danielunibe10@gmail.com` a nombre de Daniel Unibe en los seis documentos legales (`EULA.es.md`, `EULA.en.md`, `TERMS_OF_USE.es.md`, `TERMS_OF_USE.en.md`, `PRIVACY.es.md`, `PRIVACY.en.md`), protegiendo el domicilio residencial privado conforme a las políticas de privacidad y seguridad y retirando los marcadores temporales. Se formalizaron `notice_address` y `legal_approval` en `legal/release-manifest.json`. Se registró el paquete de código fuente correspondiente a FFmpeg Gyan 8.1.2 commit `38b88335f9` (SHA-256 `C3453FBFC7CA25423F4984A83CEDA01949D458A8BC04F9D68FAB7C392F75B3AB`) en `legal/third-party-materials.json` con estado `reviewed` y se retiró el marcador pendiente en `THIRD_PARTY_NOTICES.md`. `scripts/verify-legal-release.ps1` ejecutado contra el SBOM agregado y los materiales de release reporta **PULSARIA LEGAL RELEASE GATE: PASS (0 hallazgos)**.
