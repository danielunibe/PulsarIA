# Pulsaria — Auditoría AAA Completa
> Revisado: **2026-09-12** | Estabilización y certificación local ejecutadas ✅  
> Esta auditoría conserva los hallazgos históricos de 2026-09-06, pero el estado vigente es el cierre de estabilización documentado en la sección siguiente.

---

## Cierre de estabilización — 2026-09-12

### Resultado ejecutivo

**PASS para el MVP local automatizado y el bundle de depuración NSIS/MSI.**  
**PARTIAL para una release AAA pública:** todavía falta firmar/publicar el updater, hacer la aceptación visual en una ventana nativa instalada en un equipo objetivo y resolver 2 vulnerabilidades de producción cuya corrección disponible requiere migrar a Next 16.3.5 (salto mayor). La evidencia live y la aceptación nativa se mantienen separadas del smoke automatizado.

| Gate | Estado | Evidencia actual |
|---|---|---|
| Frontend | **PASS** | `npm run lint`, `npm run typecheck` y `npm run build` sin errores; export estático Next 15.5.25: 129 kB / 241 kB first load |
| Python portable y contratos | **PASS** | `npm run test:python`: 18 pruebas, 0 fallos, 1 skip live intencional sin URL |
| Rust | **PASS** | `cargo check`, `cargo fmt -- --check`, `cargo clippy --all-targets -- -D warnings` y `cargo test`: 34/34 pruebas (LLM local, storage, migración y loopback incluidos) |
| Bundle de recursos | **PASS** | Manifiesto reproducible 56/56; Python, workers canónicos, ONNX, Whisper tiny, FFmpeg, FFprobe y licencia presentes y hasheados |
| Auditoría de dependencias | **PARTIAL** | `npm audit --omit=dev`: 2 hallazgos de producción (1 moderado en Next y 1 alto en PostCSS anidado); `fixAvailable` requiere Next 16.3.5 |
| Instaladores | **PASS QA** | NSIS `pulsaria_0.1.0_x64-setup.exe` y MSI `pulsaria_0.1.0_x64_en-US.msi` reconstruidos por `tauri build --debug`; hashes vigentes abajo |
| Instalación NSIS aislada | **PASS** | NSIS vigente instalado silenciosamente en temporal: recursos 8/8, manifest 56/56, `/health` antes/después del reinicio y desinstalación con código 0 |
| Pipeline live | **PASS** | `verify-installed-bundle.ps1 -Configuration debug -RunLive` contra NSIS `B19946…`: ingest `job_id=1`, estado `complete`, progreso 100, MP4 2,953,029 bytes, MP3 60,936 bytes, análisis visual e instructivo presentes y job visible tras reinicio |
| API empaquetada | **PASS parcial** | `/health` 200 antes/después del reinicio y `/api/v1/ingest` completó un job live en NSIS `B19946…`; deduplicación negativa/positiva y búsqueda posterior requieren escenarios adicionales |
| UI manual | **PASS parcial** | Onboarding revisado en 1280×800, 860×640, 520×720 y 360×720; composición abierta a pantalla completa de una columna sin caja, aurora compartida desenfocada, slider, cambio de modelo, foco por teclado y estado de éxito comprobados en el preview |
| Firma / updater público | **BLOCKED_EXTERNAL** | updater desactivado de forma segura hasta contar con endpoint publicado, clave pública Tauri y secretos de firma externos |
| Aceptación visual nativa instalada | **BLOCKED_EXTERNAL** | El host de automatización no expuso la ventana nativa (`apps: []`); sí se verificó el proceso y su API desde el bundle, pero falta la captura asistida en el equipo objetivo |

### Reparaciones aplicadas en esta ronda

- Se añadió `canonical_url` con migración v4, backup previo y deduplicación indexada para no crear jobs duplicados por parámetros de tracking.
- La cola ahora aplica capacidad/backpressure y propaga los errores de persistencia de estados, progreso y resultado.
- La recomputación de embeddings reemplaza únicamente los embeddings en una transacción; conserva segmentos de transcripción y no deja el índice parcialmente escrito.
- Se dejaron de descartar silenciosamente filas corruptas en búsquedas, segmentos y playlists.
- La API de loopback acepta la UI sin JWT obligatorio, pero sigue validando tokens proporcionados y aplica rate limiting; los límites de query y URL quedaron acotados.
- Se rechazaron URLs con userinfo/credenciales y se endureció el servidor estático contra traversal, métodos no soportados y fallback incorrecto de assets.
- La UI desactiva `Procesar contenido` cuando todos los enlaces son inválidos y vuelve a mostrar el panel de Playlists conectado a sus callbacks reales.
- El runner de pruebas elige el Python portable del proyecto de forma determinista.
- El secreto JWT por defecto se genera con aleatoriedad del sistema por sesión; no se escribe en configuración, base de datos ni logs.
- El updater quedó explícitamente desactivado mientras no exista configuración de distribución firmada; `createUpdaterArtifacts` ya no intenta firmar artefactos con una clave ausente.
- La admisión de trabajos ya no mantiene el mutex de jobs a través de `await`, el pool no bloquea su mutex al crear un proceso Python y el servidor de métricas degrada con logging si su puerto está ocupado.
- La inferencia ONNX trunca entradas al máximo de 512 posiciones conservando los tokens especiales; se ajustó el mínimo visual a 860x640 y la confirmación de eliminación de fuentes ahora es accesible y no depende de `window.confirm`.
- La pantalla de primer arranque se adaptó al contenido solicitado en `ProcessingSetupModal.tsx`: composición abierta de una columna sin caja envolvente, título que no se parte artificialmente, hardware detectado, prioridad rapidez/precisión, explicación del modelo local y CTA conectado al flujo nativo existente. El fondo usa el `AuroraBackground` compartido bajo una capa translúcida con `backdrop-filter`; el foco del slider se indica en el control y no con una cápsula alrededor de toda la pantalla. El CSS específico vive en `ProcessingSetupModal.module.css` para que el empaquetado no dependa de utilidades Tailwind no generadas.
- La cancelación de preparación invalida la continuación de guardado antes de `set_processing_settings`, limpia el PID aun cuando el proceso hijo falle al esperar y deja el onboarding abierto para reintentar. Whisper Tiny queda seleccionado por defecto para garantizar primer arranque offline; la recomendación de hardware se muestra sin activar Small/Medium automáticamente, y esos modelos solo se eligen mediante una acción explícita.
- La migración de SQLite quedó en esquema v6 con backup previo, rutas durable para transcripts, artifacts, métricas de interés y estado `local|online|unavailable`. La cuota mide video/audio/staging/cachés reales; la purga solo considera medios online no protegidos, exige selección y confirmación, mueve a papelera interna y deja transcript, segmentos, embeddings, metadata y artifacts intactos.
- El pipeline usa `.pulsaria/staging` para trabajos incompletos y `media/<job_id>` para medios finalizados. Conserva un poster y hasta cinco keyframes deterministas; las capturas manuales se guardan como JPEG protegido, con límite de 10 por job y 2 MiB por captura.
- La persistencia de resultados de workers ahora es atómica; el scheduler excluye jobs con claim activo; las sincronizaciones de colecciones vacías/parciales registran fallo y backoff; el estado de readiness del gateway se expone en Salud; los embeddings requieren 384 dimensiones finitas; y el pool de workers tiene límites configurables.
- La integración de IA generativa usa `generate_local_response` por Tauri IPC y un modelo GGUF verificado; no lee claves cloud ni envía fragmentos a un proveedor remoto. El cliente aplica límites de contexto/tokens, timeout y errores accionables sin registrar el contenido.
- El contrato del LLM local cubre preparación bajo demanda, descarga reanudable, verificación SHA-256, sidecar loopback y rechazo desde navegador sin shell nativo.
- `npm run verify:frontend-secrets` inspecciona `app`, `components`, `hooks`, `lib`, `out` y `.next` y bloquea credenciales cloud, endpoints remotos y patrones `AIza...`.
- El updater ahora tiene un contrato único en `hooks/use-updater.ts` con comprobación manual, confirmación antes de instalar, progreso y estados tipados; `@tauri-apps/plugin-updater` quedó fijado a 2.11.0 y el capability expone solo check/download-and-install. La configuración base permanece inactiva hasta inyectar una clave pública válida y secretos externos.
- Se retiró el comando IPC antiguo `check_for_updates`, se añadió `scripts/verify-release-artifacts.ps1`, se generó el runbook `docs/RELEASE_PUBLICA.md` y el workflow `.github/workflows/release.yml` queda preparado para Environment `release`, firma Tauri, Authenticode, `latest.json`, publicación y limpieza efímera.
- El gateway valida `PULSAR_API_HOST` antes de enlazar y rechaza cualquier valor que no sea `127.0.0.1`; `scripts/verify-api-loopback.ps1` convierte esa política en un gate ejecutable. No se habilita exposición LAN ni IPv6 externo.

### Evidencia adicional de instalación limpia — 2026-09-12

- Los artefactos vigentes quedaron identificados por hash SHA-256: NSIS `440,556,589` bytes (`B19946BC6ED263610B562A9C1E506AF06EE209F59E97AAC872225FFAC9AE68BF`) y MSI `563,684,455` bytes (`B0895F597D6C7F16899DF6354D46CE832DD0277C026750A77E00F64F82F4E47D`).
- El NSIS vigente se ejecutó silenciosamente en un directorio temporal aislado y produjo `pulsaria.exe`, desinstalador, runtime Python, workers y modelos ONNX/Whisper en sus rutas canónicas. El manifest instalado validó 56/56 archivos, incluidos FFmpeg, FFprobe y licencia.
- El ejecutable instalado arrancó con `PULSAR_DATA_DIR` y `PULSAR_DOWNLOAD_DIR` temporales. `/health` respondió `ok` antes y después de reiniciar; la instalación y desinstalación devolvieron código 0 y la limpieza temporal terminó en `true`.
- El smoke live vigente sí se repitió contra NSIS `B19946…` usando la URL pública de prueba configurada en el script. El job `1` terminó `complete` al 100%, generó MP4 de 2,953,029 bytes y MP3 de 60,936 bytes, conservó análisis visual/instructivo y siguió visible tras reiniciar la aplicación. La prueba no equivale a una release firmada.
- `npm audit --omit=dev` sigue devolviendo 2 vulnerabilidades de producción: una moderada en Next y una alta en PostCSS anidado; el fix disponible exige Next 16.3.5 y se mantiene reservado para una migración aislada.
- El smoke final del bundle vigente con hash NSIS `B19946BC6ED263610B562A9C1E506AF06EE209F59E97AAC872225FFAC9AE68BF` terminó con instalación 0, manifest/recursos 56/56, health/restart `ok`, ingest live `job_id=1` en estado `complete`, MP4 de 2,953,029 bytes, MP3 de 60,936 bytes, análisis visual/instructivo presentes, desinstalación 0 y limpieza temporal correcta.
- La aceptación visual nativa no pudo ejecutarse en este host porque el automatizador no expone aplicaciones Windows Tauri (`apps: []`); el proceso y la API instalada sí fueron verificados.
- La prueba es reproducible con `npm run verify:installed`; para repetir también el flujo live se usa `pwsh -File scripts/verify-installed-bundle.ps1 -RunLive` con una URL autorizada/accesible.

### Cómo interpretar el resultado

Los instaladores de depuración son artefactos de QA, no una publicación firmada. El éxito de la descarga live demuestra que el pipeline actual funciona con una URL accesible en esta sesión, pero no garantiza disponibilidad futura de todos los videos ni sustituye la prueba con cookies autorizadas cuando un contenido sea restringido. Los registros de jobs antiguos con errores se conservaron para no alterar datos personales ni historial.

Las secciones H-01 a H-18 que siguen son el diagnóstico original. Antes de ejecutar sus instrucciones, contrastarlas con este cierre: varias ya están resueltas y se mantienen abajo como trazabilidad histórica, no como backlog vigente.

---

## Cómo usar este documento

Cada hallazgo incluye:
- **Archivo(s) afectado(s)** con número de línea exacto
- **Diagnóstico** claro del problema
- **Instrucción de corrección** precisa, lista para aplicar
- **Prioridad**: 🔴 Crítico · 🟠 Alto · 🟡 Medio · 🟢 Bajo

---

## Estado histórico de la auditoría inicial — no sustituye el cierre vigente

La tabla siguiente conserva la fotografía de la auditoría original para trazabilidad de los hallazgos H-01 a H-18. El resultado vigente está únicamente en **Cierre de estabilización — 2026-09-12** al inicio de este documento; no interpretar esta tabla histórica como un backlog sin verificar.

| Capa | Estado | Evidencia |
|---|---|---|
| Rust backend (`cargo check`) | ✅ Sin errores ni warnings | Finished dev profile en 1.7s |
| Rust tests (`cargo test`) | ✅ 18/18 pasando | 0 failed, 0 ignored |
| TypeScript (`tsc --noEmit`) | ✅ Sin errores | |
| ESLint | ✅ Sin errores | |
| Python tests | ✅ 8/8 OK (1 skipped live) | |
| Next.js build | ✅ 217 kB primer bundle | Export estático OK |
| Bundle resource contract | ✅ 11 workers canónicos mapeados | |
| **Funcionalidad end-to-end** | ⚠️ No validada en hardware real | Ver H-01 |
| **Modelo ONNX en bundle** | 🔴 No incluido | Ver H-01 |
| **daemon.py** | 🔴 Referenciado pero inexistente | Ver H-02 |
| **JWT_SECRET** | 🔴 Valor inseguro por defecto | Ver H-03 |
| **Accesibilidad ARIA** | 🔴 No implementada | Ver H-12 |
| **Thumbnails de demo** | 🟠 .jpg no verificados | Ver H-11 |

---

## CRÍTICOS 🔴

---

### H-01 — El modelo ONNX no está en el bundle — búsqueda semántica falla en producción

**Archivos:**
- `src-tauri/src/main.rs` líneas 96-102
- `src-tauri/tauri.conf.json` sección `bundle.resources`

**Diagnóstico:** `resolve_model_dir()` busca `model.onnx` y `tokenizer.json`. Si no existen, el motor ONNX arranca como `None` y todos los comandos de búsqueda semántica (`search_transcripts`, `rebuild_index`, `recompute_embeddings`) devuelven resultados vacíos sin error visible para el usuario.

**Corrección paso a paso:**
```
PASO 1 — Generar el modelo:
  python python-workers/prepare_whisper_model.py --export-onnx
  O manualmente:
  pip install sentence-transformers optimum[onnxruntime]
  python -c "
  from optimum.exporters.onnx import main_export
  main_export('sentence-transformers/all-MiniLM-L6-v2', output='src-tauri/resources/models', task='feature-extraction')
  "

PASO 2 — Crear el directorio:
  mkdir src-tauri\resources\models

PASO 3 — Verificar archivos resultantes:
  dir src-tauri\resources\models
  → Debe existir: model.onnx y tokenizer.json

PASO 4 — Añadir a tauri.conf.json en "bundle.resources":
  "resources/models": "resources/models"

PASO 5 — Añadir a .gitignore (los archivos son grandes):
  src-tauri/resources/models/*.onnx
  src-tauri/resources/models/tokenizer.json

PASO 6 — En CI/CD, descargar el modelo antes de tauri build:
  Añadir al pipeline: python prepare_whisper_model.py --export-onnx
```

---

### H-02 — `daemon.py` referenciado en tauri.conf.json pero no existe

**Archivo:** `src-tauri/tauri.conf.json` línea 25

**Diagnóstico:** La línea `"../python-workers/daemon.py": "resources/python-workers/daemon.py"` referencia un archivo que no existe en el repositorio. Esto causará que `tauri build` falle al generar el instalador NSIS/MSI.

**Corrección — Opción A (crear el archivo):**
```python
# Crear: python-workers/daemon.py
"""
daemon.py — Punto de entrada del modo demonio.
Alias de main.py para compatibilidad con empaquetado legacy.
"""
from main import main

if __name__ == "__main__":
    main()
```

**Corrección — Opción B (limpiar la referencia):**
```json
// En src-tauri/tauri.conf.json, eliminar la línea:
"../python-workers/daemon.py": "resources/python-workers/daemon.py",
```
Elegir Opción A para mantener compatibilidad hacia atrás.

---

### H-03 — `JWT_SECRET` tiene valor inseguro hardcodeado por defecto

**Archivo:** `src-tauri/src/main.rs` líneas 173-174

**Diagnóstico:**
```rust
.unwrap_or_else(|_| "default_insecure_pulsar_secret".to_string());
```
El gateway REST (:8080) arranca con esta clave conocida si no se define `JWT_SECRET`. Cualquier proceso en la misma máquina puede forjar tokens válidos.

**Corrección:**
```rust
// Reemplazar la función completa en main.rs L173-178:
let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| {
    // Genera un secret aleatorio por sesión en desarrollo.
    // En producción, JWT_SECRET DEBE estar definido en el entorno.
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    std::time::SystemTime::UNIX_EPOCH
        .elapsed()
        .unwrap_or_default()
        .as_nanos()
        .hash(&mut h);
    std::process::id().hash(&mut h);
    format!("pulsaria-{:016x}", h.finish())
});
```
Adicionalmente: generar el secret al instalar (script NSIS) y escribirlo en `%APPDATA%\Pulsaria\.env`.

---

### H-04 — Sin ARIA ni focus traps — el modal es inaccesible con teclado

**Archivo:** `components/ExpandedVideoModal.tsx` línea 55

**Diagnóstico:** El modal no tiene `role="dialog"`, `aria-modal="true"`, ni gestión de foco. Al abrir el modal, el foco no se desplaza al interior; al presionar Tab, el usuario puede navegar a elementos detrás del overlay.

**Corrección:**
```
PASO 1 — Instalar focus-trap-react:
  npm install focus-trap-react
  npm install -D @types/focus-trap-react

PASO 2 — En ExpandedVideoModal.tsx, importar:
  import FocusTrap from 'focus-trap-react';

PASO 3 — Envolver el contenido del modal:
  <FocusTrap focusTrapOptions={{ initialFocus: false, escapeDeactivates: false }}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reproductor y análisis de video"
      ...
    >
      {/* contenido */}
    </div>
  </FocusTrap>

PASO 4 — En Header.tsx, añadir aria-label a botones de ventana:
  <button aria-label="Minimizar ventana" ...>
  <button aria-label="Maximizar ventana" ...>
  <button aria-label="Cerrar ventana" ...>
```

---

## ALTOS 🟠

---

### H-05 — `type: any` en filtro crítico de jobs en page.tsx

**Archivo:** `app/page.tsx` línea 84

**Diagnóstico:** `jobs.filter((j: any) => ...)` rompe la inferencia de tipos. Si `JobRecord` cambia, este código no falla en compilación.

**Corrección:**
```typescript
// Cambiar línea 84:
// ANTES:
const completedJobs = jobs.filter((j: any) =>
    ['complete', 'completed', 'done'].includes(String(j.status).toLowerCase())
    && Boolean(j.video_path)
);

// DESPUÉS:
import type { JobRecord, isCompletedJob } from '@/hooks/use-jobs';
const completedJobs = jobs.filter((j: JobRecord) =>
    isCompletedJob(j) && Boolean(j.video_path)
);
// isCompletedJob ya está exportado en use-jobs.ts línea 49
```

---

### H-06 — `window.confirm()` bloquea el hilo y es experiencia de sistema genérico

**Archivo:** `components/PlaylistsPanel.tsx` línea 59

**Diagnóstico:** `window.confirm()` en Tauri bloquea el proceso WebView y muestra un diálogo nativo del sistema operativo genérico, rompiendo la experiencia visual AAA.

**Corrección:**
```typescript
// 1. Añadir estado de confirmación al componente:
const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

// 2. Reemplazar handleDelete (línea 58-61):
const handleDelete = (id: number, name: string) => {
    setPendingDelete({ id, name });
};

// 3. Añadir al final del JSX (antes del </div> de cierre):
{pendingDelete && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
         role="dialog" aria-modal="true" aria-label="Confirmar eliminación">
        <div className="rounded-2xl p-6 bg-[#0e1017] border border-white/10 shadow-2xl
                        flex flex-col gap-4 max-w-xs w-full mx-4">
            <p className="text-white text-sm font-medium">
                ¿Eliminar la playlist «{pendingDelete.name}»?
            </p>
            <p className="text-white/40 text-xs">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
                <button
                    onClick={() => setPendingDelete(null)}
                    className="flex-1 py-2 rounded-xl text-xs text-white/60 bg-white/5 hover:bg-white/10 transition-colors">
                    Cancelar
                </button>
                <button
                    onClick={() => { void deletePlaylist(pendingDelete.id); setPendingDelete(null); }}
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white
                               bg-[#fe2c55]/80 hover:bg-[#fe2c55] transition-colors">
                    Eliminar
                </button>
            </div>
        </div>
    </div>
)}
```

---

### H-07 — Encoding mojibake en `VideoGrid.tsx` — caracteres corruptos

**Archivo:** `components/VideoGrid.tsx` líneas 56-58

**Diagnóstico:** Los comentarios contienen `id\uFFFDnticos`, `p\uFFFDx` — el archivo tiene caracteres UTF-8 mal leídos como Latin-1.

**Corrección:**
```
PASO 1 — En VS Code: clic en "UTF-8" en la barra inferior
PASO 2 — Seleccionar "Reopen with Encoding" → UTF-8
PASO 3 — Si sigue mal, usar PowerShell:
  $content = Get-Content "components\VideoGrid.tsx" -Raw -Encoding Latin1
  $utf8 = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::Latin1.GetBytes($content))
  Set-Content "components\VideoGrid.tsx" -Value $utf8 -Encoding UTF8

PASO 4 — Corregir manualmente las líneas 56-58:
  // Gap y padding exterior idénticos — espaciado simétrico
  const SPACING = 32;         // px — más separación entre cards
  const CARD_MIN_WIDTH = 200; // Ancho mínimo para que no se encojan
```

---

### H-08 — `JobRecord` definido en tres archivos distintos (duplicación de tipos)

**Archivos:**
- `hooks/use-jobs.ts` líneas 6-23 (canónico)
- `hooks/usePlaylists.ts` líneas 17-28 (subconjunto)
- `components/VideoGrid.tsx` líneas 72+ (subconjunto)

**Diagnóstico:** Si se añade un campo a `JobRecord` (ej. `embed_version`), hay que actualizarlo en tres sitios. La definición en `usePlaylists.ts` además tiene tipos menos estrictos (`duration?: number` vs `duration?: number | null`).

**Corrección:**
```typescript
// En hooks/usePlaylists.ts — eliminar las líneas 17-28 y añadir:
import type { JobRecord } from '@/hooks/use-jobs';
// Usar JobRecord de use-jobs en todos los retornos de playlistItems

// En components/VideoGrid.tsx — eliminar la definición local de JobRecord
// y cambiar la importación existente:
import type { JobRecord as SharedJobRecord } from '@/hooks/use-jobs';
// Reemplazar todos los usos de JobRecord local por SharedJobRecord
```

---

### H-09 — Rutas REST de escritura sin autenticación (ingest, playlists)

**Archivo:** `src-tauri/src/api/gateway.rs`

**Diagnóstico:** `POST /api/v1/ingest` y `DELETE /api/v1/playlists/:id` no requieren token. Cualquier proceso local puede añadir jobs o borrar colecciones.

**Corrección mínima para MVP:**
```rust
// En gateway.rs, el middleware ya está implementado.
// Asegurarse de que se aplica a las rutas de escritura:
let write_routes = Router::new()
    .route("/ingest", post(ingest_handler))
    .route("/playlists", post(create_playlist_handler))
    .route("/playlists/:id", delete(delete_playlist_handler))
    .route("/playlists/:id/items", post(add_to_playlist_handler))
    .route("/playlists/:id/items/:job_id", delete(remove_from_playlist_handler))
    .layer(middleware::from_fn_with_state(
        state.clone(),
        crate::api::middleware::security::jwt_auth_middleware,
    ));
```

---

## MEDIOS 🟡

---

### H-10 — `minWidth/minHeight` rígidos fallan en pantallas con DPI escalado al 150%

**Archivo:** `src-tauri/tauri.conf.json` líneas 51-54

**Diagnóstico:** `minWidth: 1000` son píxeles lógicos. En pantallas 4K con DPI 150%, el sistema puede reportar dimensiones físicas incorrectas, y la ventana puede no caber sin que el usuario pueda redimensionarla.

**Corrección:**
```json
// En tauri.conf.json, "app.windows[0]":
"width": 1280,
"height": 800,
"minWidth": 860,
"minHeight": 640,
"center": true,
"resizable": true
```

---

### H-11 — Thumbnails de videos demo (.jpg) no existen — imágenes rotas

**Archivos:**
- `lib/mock-data.ts` — referencias a `/demo/demo-01.jpg` etc.
- `public/demo/` — solo contiene `.mp4`, no `.jpg`

**Diagnóstico:** Los 6 videos de demo tienen `thumb: '/demo/demo-0X.jpg'` pero no hay archivos `.jpg` en `public/demo/`. Las tarjetas muestran imagen rota.

**Corrección:**
```powershell
# Opción A — Generar thumbnails con ffmpeg (si está instalado):
1..6 | ForEach-Object {
    $i = $_
    ffmpeg -i "public\demo\demo-0$i.mp4" -vframes 1 -q:v 2 "public\demo\demo-0$i.jpg" -y
}

# Opción B — Si ffmpeg no está disponible, usar el video como poster:
# En components/VideoCard.tsx, añadir onError al img de thumbnail:
# <img src={thumb} onError={(e) => { e.currentTarget.style.display='none'; }} />
# Y mostrar el primer frame del video con <video poster={thumb}>
```

---

### H-12 — Modal no maneja transcripción vacía (spinner infinito)

**Archivo:** `components/ExpandedVideoModal.tsx`

**Diagnóstico:** Si `get_transcript` retorna array vacío (video sin Whisper completo), el tab "Transcript" queda en estado de carga indefinido o vacío sin mensaje.

**Corrección:**
```typescript
// Buscar donde se renderiza la lista de transcriptChunks.
// Añadir estado derivado después de la carga:
const transcriptEmpty = !loadingTranscript && !transcriptError && transcriptChunks.length === 0;

// En el JSX del tab transcript, añadir antes de mapear chunks:
{transcriptEmpty && (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/30">
        <FaFileLines size={36} />
        <span className="text-sm font-medium">Sin transcripción disponible</span>
        <span className="text-xs text-center max-w-[200px]">
            El procesamiento de audio puede no haberse completado para este video.
        </span>
    </div>
)}
```

---

### H-13 — Constantes de UI mezcladas en `types/index.ts`

**Archivo:** `types/index.ts` líneas 87-101

**Diagnóstico:** `TT_PINK`, `TT_CYAN`, `NM_SHADOW`, `TIKTOK_ICON_PATHS`, `TIKTOK_COUNTS` son constantes de presentación viviendo en el archivo de tipos. Viola el principio de separación de responsabilidades.

**Corrección:**
```typescript
// 1. Crear lib/design-tokens.ts:
export const TT_PINK = '#fe2c55';
export const TT_CYAN = '#25f4ee';
export const NM_SHADOW = 'drop-shadow(2px 2px 2px #000) drop-shadow(-1px -1px 1px rgba(255,255,255,0.02))';
export const TIKTOK_LOGO_PATH = 'M12.525.02...';
export const TIKTOK_ICON_PATHS = [...] as const;
export const TIKTOK_COUNTS = ['1.2M', '45K', '22K', '12K'] as const;

// 2. En types/index.ts, eliminar esas constantes (líneas 87-101)

// 3. Actualizar imports en Header.tsx y cualquier otro archivo:
import { TT_PINK, TT_CYAN, TIKTOK_LOGO_PATH } from '@/lib/design-tokens';
```

---

### H-14 — Polling de jobs sin backoff — carga continua en SQLite

**Archivo:** `hooks/use-jobs.ts`

**Diagnóstico:** El hook hace polling a intervalo fijo. Cuando no hay trabajos activos, sigue consultando la base de datos cada 2-3 segundos innecesariamente.

**Corrección:**
```typescript
// Reemplazar el intervalo fijo por backoff adaptativo:
// Dentro del useEffect de polling en use-jobs.ts:

let pollInterval = 2000; // Empieza rápido cuando hay actividad
let timerId: ReturnType<typeof setTimeout>;

const poll = async () => {
    await fetchJobs(); // la función existente
    const hasActiveJobs = jobsRef.current.some(j =>
        ['queued', 'downloading', 'transcribing', 'processing', 'retrying'].includes(j.status)
    );
    // Si hay jobs activos: 2s. Si está quieto: incrementar hasta 30s.
    pollInterval = hasActiveJobs
        ? 2000
        : Math.min(pollInterval * 1.5, 30_000);
    timerId = setTimeout(poll, pollInterval);
};

timerId = setTimeout(poll, pollInterval);
return () => clearTimeout(timerId);
```

---

## BAJOS 🟢

---

### H-15 — Directorios `.native-smoke-*` ensucian el repo (no ignorados completamente)

**Archivo:** `.gitignore`

**Corrección:**
```powershell
# Ejecutar desde raíz:
Remove-Item -Recurse -Force .native-smoke-* 2>$null
Remove-Item -Force interactive-inventory-cycle1.txt 2>$null
Remove-Item -Force yt_err.txt 2>$null

# Verificar .gitignore contiene:
.native-smoke*/
yt_err.txt
interactive-inventory-cycle1.txt
```

---

### H-16 — No hay auto-updater configurado (hallazgo histórico; implementación parcial vigente)

**Afecta:** Escalabilidad — los usuarios tendrán que reinstalar manualmente cada versión.

**Corrección:**
```
La base Rust ya registra el plugin y la implementación JavaScript/CI quedó añadida en esta ronda:

PASO 1 — Dependencias y permisos:
  [dependencies]
  tauri-plugin-updater = "2"

PASO 2 — En main.rs, registrar plugin:
  .plugin(tauri_plugin_updater::Builder::new().build())

PASO 3 — Activación de release:
  usar la configuración efímera del workflow con `createUpdaterArtifacts: true`,
  endpoint GitHub y la clave pública real. La configuración base mantiene
  `active: false` y no contiene una clave ficticia.

PASO 4 — Publicar el manifest y las firmas:
  ejecutar `.github/workflows/release.yml` en el Environment `release`.
  La validación está documentada en `docs/RELEASE_PUBLICA.md`.
```

---

### H-17 — `commands.rs` con 2147 líneas — lógica de negocio mezclada con handlers IPC

**Archivo:** `src-tauri/src/commands.rs`

**Diagnóstico:** Según `AGENTS.md`, `commands.rs` debe ser un thin adapter. Actualmente contiene `collection_sync_loop` y lógica de clustering que debería estar en `application/`.

**Corrección (progresiva — no hacer todo de una vez):**
```
Semana 1: Extraer collection_sync_loop → application/collection_service.rs
Semana 2: Extraer auto_cluster_videos lógica → application/clustering_service.rs
Semana 3: Extraer export_library_json → application/export_service.rs
Regla: commands.rs solo debe: validar args → llamar application/ → serializar respuesta
```

---

### H-18 — Faltan metadatos SEO en `app/layout.tsx`

**Archivo:** `app/layout.tsx`

**Diagnóstico:** Sin `<meta description>`, `og:image`, ni viewport correcto. Afecta el modo servidor (`node server.js`).

**Corrección:**
```typescript
// En app/layout.tsx, añadir export de metadata:
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
    title: 'Pulsaria — Biblioteca Multimedia Inteligente',
    description: 'Descarga, transcribe e indexa semánticamente tus videos con IA local. Búsqueda semántica, playlists temáticas y análisis multimodal.',
    keywords: ['TikTok', 'IA', 'transcripción', 'ONNX', 'Whisper', 'búsqueda semántica'],
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    minimumScale: 1,
};
```

---

## Plan de Ejecución por Fases

### FASE 1 — Críticos (bloqueantes para distribución del instalador)
```
[ ] H-01: Incluir model.onnx y tokenizer.json en el bundle
[ ] H-02: Crear python-workers/daemon.py
[ ] H-03: JWT_SECRET robusto en producción
[ ] H-04: Accesibilidad básica ARIA + focus traps
```

### FASE 2 — Altos (antes de mostrar a usuarios externos)
```
[ ] H-05: Eliminar type:any en page.tsx
[ ] H-06: Reemplazar window.confirm con overlay nativo
[ ] H-07: Corregir encoding en VideoGrid.tsx
[ ] H-08: Unificar definición de JobRecord
[ ] H-09: Autenticación en rutas REST de escritura
```

### FASE 3 — Medios (calidad AAA sostenible)
```
[ ] H-10: Ajustar minWidth/minHeight para DPI escalado
[ ] H-11: Generar thumbnails .jpg para demos
[ ] H-12: Manejo de transcripción vacía en modal
[ ] H-13: Mover constantes UI a lib/design-tokens.ts
[ ] H-14: Backoff exponencial en polling de jobs
```

### FASE 4 — Bajos (escalabilidad a largo plazo)
```
[ ] H-15: Limpiar archivos temporales del repo
[~] H-16: Configurar auto-updater de Tauri (código y workflow listos; activación/firma externa pendiente)
[ ] H-17: Refactorizar commands.rs (progresivo)
[ ] H-18: Metadatos SEO en layout.tsx
```

---

## Validación Continua

Después de **cada corrección**, ejecutar el gate completo:

```powershell
npm run verify:mvp
```

Esto valida secuencialmente:
1. `eslint .`
2. `tsc --noEmit`
3. Python tests offline
4. `cargo check` + `cargo test`
5. `next build`
6. Frontera de secretos del frontend y contrato LLM local
7. Contrato de loopback de la API
8. Bundle resource contract

---

## Notas de Arquitectura para Escalabilidad

- **Canal principal = Tauri IPC.** La API REST en :8080 es un gateway secundario para integración con herramientas externas. Documentar esto en ARCHITECTURE.md.
- **El modelo ONNX all-MiniLM-L6-v2 (384 dimensiones)** es el contrato de embeddings. Cambiar de modelo requiere `vacuum_db` + `rebuild_index` para todos los usuarios existentes.
- **SQLite con WAL mode** escala bien hasta ~500K filas en `transcript_embeddings`. Para escalar más allá: migrar a Qdrant o Weaviate con adaptador detrás del puerto `VectorIndex`.
- **El patrón Domain/Ports/Infrastructure** está correctamente implementado. No romperlo al añadir features.

