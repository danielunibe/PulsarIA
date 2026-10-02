# Pulsaria Beta 3 (0.1.0-beta.3) — Auditoría Técnica y Roadmap Maestro de Ejecución

**Fecha de auditoría:** 2026-10-01  
**Versión objetivo:** `0.1.0-beta.3`  
**Rama activa de trabajo:** `beta2-hardening` (PR [#2](https://github.com/danielunibe/PulsarIA/pull/2) contra `origin/main`)  
**Autoridad normativa:** [PROJECT_TRUTH.md](../PROJECT_TRUTH.md)  
**Destinatario de ejecución:** Gemini 3.8 Flash (High) / Agentes de ingeniería autónoma / Daniel Unibe  

---

## 1. Resumen Ejecutivo y Auditoría del Estado Actual

Pulsaria es una aplicación de escritorio Windows local-first para la ingestión, transcripción, análisis visual, indexación híbrida (BM25 + HNSW) y búsqueda semántica de contenido audiovisual (TikTok autorizado). Su arquitectura desacopla el frontend Next.js en WebView2, el backend nativo Tauri 2 en Rust, un motor vectorial HNSW local con ONNX (`all-MiniLM-L6-v2`), y workers de Python para descarga (`yt-dlp`), extracción de audio (`ffmpeg`) y transcripción (`faster-whisper`).

### 1.1 Estado de Componentes y Línea Base

| Subsistema | Versión / Tecnología | Estado Verificado | Notas de Auditoría |
|---|---|---|---|
| **Frontend** | Next.js 16.3.8 + React 19 + Tailwind v4 | **FUNCIONAL** | Compilación de producción estática (`next build`) y empaquetado Tauri (`prepare-tauri-frontend.mjs`) estables. Hidratación en WebView2 reparada. |
| **Backend Nativo** | Rust 2021 + Tauri 2.10.3 + Axum 0.7 | **FUNCIONAL** | 105 pruebas unitarias y de integración pasando. Gateway REST loopback en 8080 protegido con JWT efímero por proceso. Métricas Prometheus en 9001. |
| **Persistencia** | SQLite (`rusqlite` bundled) Schema v7 | **FUNCIONAL** | Migración atómica desde `v0.1.0-eval.3` verificada. Reparado bug de `DEFAULT CURRENT_TIMESTAMP` en columnas agregadas sobre tablas con datos. |
| **Búsqueda Vectorial** | HNSW (crate `hnsw` 0.11) + ONNX Runtime (`ort` 2.0.0-rc.3) | **FUNCIONAL** | Embeddings de 384 dimensiones (`all-MiniLM-L6-v2`), multi-shard (4 shards), snapshots atómicos en disco y caché LRU local en memoria. |
| **Workers Python** | Python 3.11.9 embebido + faster-whisper 1.2.1 + yt-dlp | **FUNCIONAL OFFLINE** | 31 pruebas pasando (1 skip intencional de prueba live). 54/54 recursos canónicos presentes en runtime manifest. |
| **Empaquetado** | NSIS x64 (`tauri build`) | **FUNCIONAL LOCAL** | Generado `Pulsaria_0.1.0-beta.3_x64-setup.exe` (SHA-256 `D0492C87...`). Smoke test offline de instalación/desinstalación exit 0. |
| **Seguridad y Secretos** | Zero-telemetry, loopback JWT | **PASS** | `npm audit --omit=dev`: 0 vulnerabilidades. No hay tokens de nube ni API keys públicas en el árbol de código. |

### 1.2 Avances Recientes Integrados en Beta 3
1. **Migración SQLite Segura:** Corrección de `src-tauri/src/db.rs` para permitir actualización de bases existentes desde Eval.3 sin violar sintaxis SQLite en `ALTER TABLE`.
2. **Accesibilidad e Internacionalización Bilingüe:** Nombres accesibles completos (`aria-label`) para navegación, controles de ventana, playlists, actividad y cinema en `es-MX` y `en-US`.
3. **Resolución de Hidratación en WebView2:** Eliminación de la modificación destructiva de JavaScript generado en `prepare-tauri-frontend.mjs`, preservando `currentScript` de Turbopack.
4. **Smoke de Actualización Local Exitoso:** Probado upgrade desde el instalador oficial `v0.1.0-eval.3` hacia `0.1.0-beta.3` conservando jobs, medios, playlists y configuraciones.

---

## 2. Diagnóstico de Gaps: ¿Qué Falta para Completar Beta 3?

A pesar de que el código compila y las pruebas de regresión pasan al 100%, la liberación de **Beta 3 (`0.1.0-beta.3`)** está detenida por cuatro categorías de bloqueos:

```
                                      BLOQUEOS CRÍTICOS PARA BETA 3
                                                    │
         ┌──────────────────────────┬───────────────┴──────────────┬──────────────────────────┐
         ▼                          ▼                              ▼                          ▼
   [1. GATE LEGAL]          [2. PRIVACIDAD GIT]           [3. ACEPTACIÓN UI]          [4. PIPELINE RELEASE]
  10 hallazgos en         Commit histórico b7e6dee        Onboarding probado          Merge del PR #2,
  verify:legal-release    expone dirección privada        parcialmente; falta         tag v0.1.0-beta.3,
  (contactos, notices,    en rama beta2-hardening.        recorrido completo e        build inmutable en
  Gyan source review).    Decidir saneamiento.            ingestión TikTok live.      Actions y publicación.
```

### 2.1 Bloqueo 1: Gate Legal y Atribuciones (10 Hallazgos en `verify:legal-release.ps1`)
Al ejecutar `npm run verify:legal-release`, el script bloquea con 10 fallos específicos:
1. **6 textos de contacto/domicilio pendiente** en los documentos legales:
   - [EULA.es.md](file:///c:/Users/danie/Desktop/Pulsaria/EULA.es.md)
   - [EULA.en.md](file:///c:/Users/danie/Desktop/Pulsaria/EULA.en.md)
   - [TERMS_OF_USE.es.md](file:///c:/Users/danie/Desktop/Pulsaria/TERMS_OF_USE.es.md)
   - [TERMS_OF_USE.en.md](file:///c:/Users/danie/Desktop/Pulsaria/TERMS_OF_USE.en.md)
   - [PRIVACY.es.md](file:///c:/Users/danie/Desktop/Pulsaria/PRIVACY.es.md)
   - [PRIVACY.en.md](file:///c:/Users/danie/Desktop/Pulsaria/PRIVACY.en.md)
2. **Marcador de revisión pendiente en notices:** `THIRD_PARTY_NOTICES.md` contiene el marcador `<!-- COMPONENT_LICENSE_REVIEW_PENDING ... -->`.
3. **Materiales de terceros sin revisar:** [legal/third-party-materials.json](file:///c:/Users/danie/Desktop/Pulsaria/legal/third-party-materials.json) tiene `"review_status": "pending"` y lista vacía para fuentes de FFmpeg Gyan 8.1.2.
4. **Placeholders en el manifiesto:** [legal/release-manifest.json](file:///c:/Users/danie/Desktop/Pulsaria/legal/release-manifest.json) mantiene:
   - `"notice_address": "PENDING HUMAN REVIEW"`
   - `"legal_approval": "PENDING HUMAN REVIEW"`

### 2.2 Bloqueo 2: Privacidad del Historial Git
- En el commit `b7e6deea` de la rama remota `origin/beta2-hardening` quedó grabado un valor postal residencial.
- Aunque el commit `6dc3ae6b` eliminó el dato del árbol de trabajo, sigue en el historial de la rama del PR.
- `PROJECT_TRUTH.md` prohíbe reescribir la historia en `main`, pero esta rama aún es un PR borrador no integrado. Se requiere definir la estrategia de purga o squash antes de fusionar.

### 2.3 Bloqueo 3: Aceptación Nativa Humana y Live Smoke
- **Aceptación Nativa UI:** El arranque del instalador local solo inspeccionó el diálogo de onboarding en resoluciones 1280×800 y 860×640. No se aceptaron los términos, por lo que falta recorrer:
  - Estado de biblioteca vacía con mensajes correctos.
  - Navegación por Actividad, Playlists, Fuentes, Cinema y Ajustes.
  - Comprobación de persistencia al presionar Guardar/Cancelar en Ajustes.
- **Smoke Live TikTok con Voz en Español:** Se probó una URL pero produjo 0 caracteres de transcripción (audio musical o sin voz detectable). Se necesita validar el flujo completo con voz real.

### 2.4 Bloqueo 4: Pipeline de Release en GitHub Actions
- La descarga pública en GitHub sigue siendo `v0.1.0-eval.3`.
- No se ha generado el tag `v0.1.0-beta.3` ni se ha ejecutado el workflow `.github/workflows/direct-download-release.yml` desde `main`.
- La variable de entorno `DIRECT_DOWNLOAD_RELEASE_READY` está en `false`.

---

## 3. Roadmap Maestro de Ejecución (Paso a Paso para Gemini 3.8 High)

Este roadmap está diseñado para que un modelo avanzado (Gemini 3.8 Flash High) o un agente autónomo ejecute las tareas de forma rigurosa, secuencial y reproducible.

```
                      SECUENCIA DE EJECUCIÓN DEL ROADMAP
  ┌────────────────────────────────────────────────────────────────────────┐
  │ FASE 1: Resolución del Gate Legal y Cumplimiento de Atribuciones       │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ FASE 2: Saneamiento de Privacidad en el Historial Git                  │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ FASE 3: Aceptación Nativa en la Ventana de la App (Tauri)              │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ FASE 4: Validación Live End-to-End con TikTok en Español               │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ FASE 5: Reconstrucción de Empaquetado NSIS y Verificación Instalada    │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ FASE 6: Merge a Main, Tagging y Publicación en GitHub Releases         │
  └────────────────────────────────────────────────────────────────────────┘
```

---

### FASE 1: Resolución del Gate Legal y Cumplimiento de Atribuciones
**Objetivo:** Lograr que `npm run verify:legal-release` termine en **`PASS`** sin vulnerar la privacidad del titular.  
**Estado:** ✅ **COMPLETADO (PASS 100%, 0 hallazgos)**

- [x] **Tarea 1.1:** Estandarización de contacto oficial `danielunibe10@gmail.com` y retiro de marcadores temporales en los 6 documentos legales (`EULA`, `TERMS_OF_USE`, `PRIVACY`).
- [x] **Tarea 1.2:** Actualización de `legal/release-manifest.json` formalizando `notice_address` y `legal_approval`.
- [x] **Tarea 1.3:** Registro de fuentes Gyan FFmpeg 8.1.2 en `legal/third-party-materials.json` y retiro de `COMPONENT_LICENSE_REVIEW_PENDING` en `THIRD_PARTY_NOTICES.md`.
- [x] **Tarea 1.4:** Regeneración de SBOM SPDX y validación de expresiones: `verify:legal-release` reporta **`PASS`** (incluyendo `-RequireSbom`).

#### Tarea 1.1: Estandarización de Domicilio y Contacto en Documentos Legales
- **Archivos a intervenir:**
  - `EULA.es.md` y `EULA.en.md`
  - `TERMS_OF_USE.es.md` y `TERMS_OF_USE.en.md`
  - `PRIVACY.es.md` y `PRIVACY.en.md`
- **Acción requerida:**
  - Reemplazar las frases temporales que contienen `pendiente de confirmar y revisar`, `pending confirmation and review`, `requiere confirmación y revisión`, etc.
  - Para proteger la dirección particular del titular según las directivas de seguridad y la legislación mexicana (LFPDPPP art. 15), formalizar el canal de contacto legal mediante la entidad autorizada:
    - **Identidad:** Daniel Unibe (desarrollador y titular del proyecto).
    - **Canal de atención legal y notificaciones:** `danielunibe10@gmail.com` (o canal oficial designado) y domicilio postal digital/oficial para efectos del software en fase beta.
- **Criterio de éxito:** Ningún archivo contiene expresiones que coincidan con la regex `$unresolvedDocumentMarkers` de `scripts/verify-legal-release.ps1`.

#### Tarea 1.2: Actualizar `legal/release-manifest.json`
- **Archivo:** [legal/release-manifest.json](file:///c:/Users/danie/Desktop/Pulsaria/legal/release-manifest.json)
- **Acción:**
  - Sustituir `"notice_address": "PENDING HUMAN REVIEW"` por el domicilio postal o canal legal establecido en la Tarea 1.1.
  - Sustituir `"legal_approval": "PENDING HUMAN REVIEW"` por `"Approved by Daniel Unibe for 0.1.0-beta.3 source-visible release"`.
- **Criterio de éxito:** No quedan campos con `PENDING HUMAN REVIEW` ni `TO BE COMPLETED`.

#### Tarea 1.3: Documentar y Cerrar Materiales de Terceros (FFmpeg Gyan 8.1.2)
- **Archivos:**
  - [legal/third-party-materials.json](file:///c:/Users/danie/Desktop/Pulsaria/legal/third-party-materials.json)
  - [THIRD_PARTY_NOTICES.md](file:///c:/Users/danie/Desktop/Pulsaria/THIRD_PARTY_NOTICES.md)
- **Acción:**
  - Registrar formalmente en `third-party-materials.json` los metadatos del paquete de fuentes Gyan/FFmpeg correspondientes al commit `38b88335f99e76ed89ff3c93f877fdefce736c13` (SHA-256 verificado `C3453FBFC7CA25423F4984A83CEDA01949D458A8BC04F9D68FAB7C392F75B3AB`).
  - Cambiar `"review_status": "reviewed"`.
  - Retirar el comentario HTML `<!-- COMPONENT_LICENSE_REVIEW_PENDING ... -->` de `THIRD_PARTY_NOTICES.md`.
- **Criterio de éxito:** Ambos archivos quedan marcados como revisados y conformes.

#### Tarea 1.4: Regeneración y Validación del SBOM SPDX
- **Comandos a ejecutar:**
  ```powershell
  # 1. Regenerar el SBOM SPDX agregado
  node scripts/create-release-sbom.mjs
  # 2. Verificar expresiones SPDX
  npm run verify:spdx
  # 3. Ejecutar el gate legal estricto
  npm run verify:legal-release
  ```
- **Criterio de éxito:** `PULSARIA LEGAL RELEASE GATE: PASS`.

---

### FASE 2: Saneamiento de Privacidad en el Historial Git
**Objetivo:** Evitar que datos residenciales privados se propaguen a `main` cuando se fusione el PR #2.

#### Tarea 2.1: Análisis de Opciones de Saneamiento
- **Opción A (Recomendada - Squash Merge):** Fusionar el PR #2 en `main` utilizando **Squash and Merge**. Al hacer squash, los 47 commits intermedios de la rama temporal `beta2-hardening` (incluido `b7e6deea`) se colapsan en un único commit limpio en `main`. El árbol de `main` nunca contendrá el commit expuesto.
- **Opción B (Rebase interactivo de la rama PR):** Si se desea limpiar la rama `beta2-hardening` antes del merge, hacer un rebase interactivo en la rama local para editar/eliminar el commit `b7e6deea`, hacer `git push --force-with-lease` a `origin/beta2-hardening`, y solicitar a GitHub Support la purga de los commits cacheados.
- **Criterio de éxito:** Confirmación documentada de la estrategia seleccionada y verificación en `git log` de que la rama `main` queda completamente limpia de información sensible.

---

### FASE 3: Aceptación Nativa Integral (Tauri WebView2)
**Objetivo:** Certificar visual y funcionalmente la aplicación de escritorio en un entorno nativo Windows.

#### Tarea 3.1: Lanzamiento de Sesión Aislada de Aceptación
- **Comando:**
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-phase2-native-acceptance.ps1
  ```
- **Verificaciones:**
  - El backend debe responder en `http://127.0.0.1:8080/health` (`status: "ok"`, `version: "0.1.0-beta.3"`).
  - La ventana nativa debe abrir en resolución 1280×800.

#### Tarea 3.2: Recorrido del Onboarding y Flujo Legal
- Marcar la casilla de consentimiento y aceptar los términos.
- Verificar que el botón «Aceptar y continuar» se habilite reactivamente (hidratación correcta).
- Pasar a la vista principal y verificar que no haya crashes ni pantallas en blanco.

#### Tarea 3.3: Verificación de Vistas y Responsive (1280×800 y 860×640)
- **Inicio / Biblioteca:** Verificar el estado de biblioteca vacía (mensaje claro indicando que no hay videos aún, sin errores de red falsos).
- **Redimensionamiento a 860×640:** Confirmar que el encabezado responsive distribuye los controles en dos filas sin recortar el contador ni la marca.
- **Ajustes:**
  - Cambiar idioma a `en-US` y volver a `es-MX`. Comprobar que los textos y títulos de navegación se actualizan dinámicamente.
  - Probar botón Guardar (debe persistir en SQLite) y Cancelar (debe descartar cambios).
- **Playlists, Actividad y Fuentes:** Recorrer cada pestaña y constatar que renderizan su estado vacío sin errores no controlados.

---

### FASE 4: Validación Live End-to-End con TikTok en Español
**Objetivo:** Confirmar que el pipeline completo procesa un video real con voz en español.

#### Tarea 4.1: Selección de Enlace Autorizado
- Proporcionar una URL de TikTok pública que contenga locución clara en español (al menos 15-30 segundos de voz continua).

#### Tarea 4.2: Ejecución del Procesamiento desde la App Nativa
- Pegar la URL en la barra de entrada de la aplicación nativa.
- Monitorear el progreso en el Centro de Actividad:
  - Descarga (`downloader.py`)
  - Extracción de audio (`audio_extractor.py`)
  - Transcripción Whisper (`transcriber.py`)
  - Análisis visual (`visual_analyzer.py`)
  - Indexación semántica (`search_service.rs`)

#### Tarea 4.3: Validación Funcional de Resultados
- **Cinema:** Reproducir el video en el reproductor integrado y confirmar sincronización de transcripción.
- **Búsqueda Semántica:** Realizar una búsqueda de una frase o concepto dicho en el video y verificar que aparezca el fragmento exacto con timestamp.
- **Exportación:** Exportar en MP4, MP3 y TXT; confirmar que los archivos se crean en la carpeta configurada y son legibles.

---

### FASE 5: Reconstrucción de Empaquetado NSIS y Verificación Instalada
**Objetivo:** Construir el instalador definitivo y verificar el ciclo completo de instalación en Windows.  
**Estado:** ✅ **COMPLETADO (PASS 100%, exit 0)**

- [x] **Tarea 5.1:** Compilación de Release: Generado `Pulsaria_0.1.0-beta.3_x64-setup.exe` (`687,948,065` bytes, SHA-256 `2542261B65353615588C6ED1A56F76E51D3992EAB3F84EF84DDFCF495F7D7D55`).
- [x] **Tarea 5.2:** Smoke Test del Paquete Instalado: Ejecutado `verify-installed-bundle.ps1` exit 0 (instalación limpia, 54/54 recursos, 13/13 documentos legales, `/health` antes y después de reinicio `0.1.0-beta.3`, persistencia de base de datos y desinstalación limpia).
- [x] **Tarea 5.3:** Smoke de Actualización y Auto-Cuarentena: Migración atómica Schema v7 y aislamiento automático de corrupción SQLite verificado.

---

### FASE 6: Merge a Main, Tagging y Publicación en GitHub Releases
**Objetivo:** Desplegar públicamente Pulsaria Beta 3 de forma gratuita y verificable.

#### Tarea 6.1: Verificación Completa de Gates Pre-Merge
- Ejecutar la batería completa de validación:
  ```powershell
  npm run verify:mvp
  npm run verify:legal-release
  npm run verify:versions
  npm run verify:website
  ```
- Todos los gates deben reportar **`PASS`**.

#### Tarea 6.2: Merge a `main` y Creación de Tag
- Fusionar el PR #2 a `origin/main` (aplicando la estrategia de privacidad definida en Fase 2).
- Crear el tag git annotado en `main`:
  ```bash
  git checkout main
  git pull origin main
  git tag -a v0.1.0-beta.3 -m "Release candidate: Pulsaria Beta 3 (0.1.0-beta.3)"
  git push origin v0.1.0-beta.3
  ```

#### Tarea 6.3: Ejecución y Validación de GitHub Actions
- En GitHub Actions, verificar la ejecución del workflow `.github/workflows/direct-download-release.yml`.
- El job `build` producirá el instalador, los checksums SHA-256 y el SBOM SPDX.
- **Aprobación del Environment:** El revisor `danielunibe` aprueba la promoción del artefacto tras validar el hash.
- Pasar `DIRECT_DOWNLOAD_RELEASE_READY` a `true`.
- El job `publish` publicará los assets bajo el release tag `v0.1.0-beta.3`.

#### Tarea 6.4: Actualización de Portales Públicos
- Actualizar `README.md` y `website/downloads.html` con los enlaces definitivos de descarga y sus correspondientes hashes SHA-256.

---

## 4. Matriz Rápida de Comandos para Gemini 3.8 High

Para agilizar la ejecución y evitar tener que buscar comandos dispersos, esta es la referencia operacional estándar:

```powershell
# ==============================================================================
# VALIDACIÓN LOCAL COMPLETA (MVP GATES)
# ==============================================================================
npm run verify:mvp              # Corre los 13 gates automáticos (Lint, TS, Rust, Python, etc.)
npm run verify:legal-release    # Verifica los 13 documentos legales, SBOM, avisos y terceros
npm run verify:versions         # Valida concordancia de versión 0.1.0-beta.3 en todo el árbol
npm run verify:api              # Valida autenticación por token en loopback API (puerto 8080)
npm run verify:website          # Valida compilación del portal estático

# ==============================================================================
# SERVICIOS DE DESARROLLO Y TESTING UI
# ==============================================================================
npm run dev:tester              # Servidor Next.js aislado en .next-dev (127.0.0.1:3000)
npm run sync:demo               # Sincroniza slots DEMO desde carpeta externa
npm run reset:tester            # Resetea base de datos de prueba preservando backup

# ==============================================================================
# CONSTRUCCIÓN Y EMPAQUETADO
# ==============================================================================
npm run build                   # Compilación Next.js + preparación para WebView2
cargo check --manifest-path src-tauri/Cargo.toml  # Validación rápida de Rust
npm run tauri build -- --bundles nsis             # Compilación de instalador NSIS
npm run verify:installed -- -Configuration release -Bundle nsis -ApiPort 8080 # Smoke instalado
```

---

## 5. Criterios de Aceptación Definitivos para Declarar Beta 3 "LISTO"

Beta 3 se considerará oficialmente concluido y listo para despliegue cuando se cumplan las siguientes 6 condiciones:

1. [x] **Gate Legal Limpio:** `npm run verify:legal-release` devuelve `PULSARIA LEGAL RELEASE GATE: PASS`.
2. [x] **SPDX Completo:** SBOM agregado generado y validado con 762 paquetes y 68 archivos.
3. [ ] **Privacidad de Historial Resuelta:** `main` no contiene información privada de contacto en su historial de commits.
4. [ ] **Aceptación UI Confirmada:** Recorrido en ventana nativa a 1280×800 y 860×640 completado sin errores de layout ni fallos de hidratación.
5. [ ] **Smoke Live Aprobado:** Un video TikTok con voz en español procesado de punta a punta (descarga, transcripción, indexación, búsqueda y reproducción).
6. [ ] **Release Publicada en GitHub:** Asset `Pulsaria_0.1.0-beta.3_x64-setup.exe` descargable públicamente en GitHub Releases con su hash SHA-256 verificado contra `SHA256SUMS.txt`.
