# kiloonix.md — Plan de Implementación para Kilo Code
> Proyecto: **Pulsaria** — `c:\Users\danie\Desktop\Pulsaria`  
> Objetivo: Resolver los **3 hallazgos pendientes** que bloquean el MVP público y elevar el proyecto a calidad de distribución.  
> Verificación obligatoria tras cada tarea: `npm run verify:mvp` (debe terminar con `PULSARIA MVP AUTOMATED GATES: PASS`)

---

## Contexto del Proyecto

Pulsaria es una aplicación de escritorio (Rust + Tauri 2 + Next.js 15 + Python workers) que descarga, transcribe e indexa semánticamente videos de TikTok/YouTube usando IA local (Whisper + ONNX embeddings).

**Stack:**
- Frontend: Next.js 15, React 19, TypeScript 5.9, TailwindCSS 4
- Backend: Rust + Tauri 2, SQLite (rusqlite), Axum REST (:8080)
- Workers: Python 3.11, yt-dlp, faster-whisper, Pillow
- Embeddings: ONNX Runtime con all-MiniLM-L6-v2 (384 dims)

**Regla de arquitectura (no violar):**
```
UI (Next.js) → Commands (Tauri IPC) → Application (use cases) → Domain (models, ports) → Infrastructure (DB, Python, HNSW)
```
NO importaciones circulares. `commands.rs` = thin adapters únicamente.

---

## TAREA 1 — Generar e integrar el modelo ONNX de embeddings (CRÍTICO)

**Prioridad:** 🔴 Bloqueante para distribución pública  
**Tiempo estimado:** 45 min

### Diagnóstico

`commands::resolve_model_dir()` en `src-tauri/src/commands.rs` L214 busca `model.onnx` y `tokenizer.json` en varios candidatos:
```
assets/models/all-MiniLM-L6-v2/
src-tauri/assets/models/all-MiniLM-L6-v2/
CARGO_MANIFEST_DIR/resources/assets/models/all-MiniLM-L6-v2/
<exe>/resources/assets/models/all-MiniLM-L6-v2/
```

Si no encuentra ninguno, la búsqueda semántica arranca como `None` sin error visible para el usuario.

### Pasos de implementación

#### Paso 1.1 — Crear el directorio de destino

```powershell
New-Item -ItemType Directory -Force "src-tauri\resources\assets\models\all-MiniLM-L6-v2"
```

#### Paso 1.2 — Exportar el modelo ONNX

Ejecutar el script que ya existe en el proyecto:

```powershell
cd python-workers
pip install optimum[onnxruntime] sentence-transformers --quiet
python -c "
from optimum.exporters.onnx import main_export
main_export(
    'sentence-transformers/all-MiniLM-L6-v2',
    output='../src-tauri/resources/assets/models/all-MiniLM-L6-v2',
    task='feature-extraction',
    opset=17
)
print('ONNX export complete')
"
```

> Si `optimum` no está disponible, usar alternativa con `torch`:
> ```powershell
> pip install torch transformers --quiet
> python -c "
> import torch
> from transformers import AutoTokenizer, AutoModel
> tokenizer = AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')
> model = AutoModel.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')
> dummy = tokenizer('hello world', return_tensors='pt')
> torch.onnx.export(
>     model,
>     (dummy['input_ids'], dummy['attention_mask']),
>     '../src-tauri/resources/assets/models/all-MiniLM-L6-v2/model.onnx',
>     opset_version=17,
>     input_names=['input_ids','attention_mask'],
>     output_names=['last_hidden_state'],
>     dynamic_axes={'input_ids':{0:'batch',1:'seq'},'attention_mask':{0:'batch',1:'seq'}}
> )
> tokenizer.save_pretrained('../src-tauri/resources/assets/models/all-MiniLM-L6-v2')
> print('Manual ONNX export complete')
> "
> ```

#### Paso 1.3 — Verificar archivos resultantes

```powershell
Get-ChildItem "src-tauri\resources\assets\models\all-MiniLM-L6-v2" | Select Name, Length
```

**Debe existir al menos:**
- `model.onnx` (> 20 MB)
- `tokenizer.json` (> 100 KB)

#### Paso 1.4 — Añadir a `.gitignore` (los archivos son grandes)

Verificar que `.gitignore` en la raíz contenga estas líneas (añadir si no están):
```gitignore
src-tauri/resources/assets/models/all-MiniLM-L6-v2/model.onnx
src-tauri/resources/assets/models/all-MiniLM-L6-v2/tokenizer.json
```

#### Paso 1.5 — Actualizar `tauri.conf.json` para incluir el directorio en el bundle

En `src-tauri/tauri.conf.json`, sección `bundle.resources`, verificar/añadir:
```json
"resources/assets/models/all-MiniLM-L6-v2": "resources/assets/models/all-MiniLM-L6-v2"
```

El archivo completo de resources debe quedar así (no modificar las demás líneas):
```json
"resources": {
    "resources/python": "resources/python",
    "../python-workers/main.py": "resources/python-workers/main.py",
    "../python-workers/downloader.py": "resources/python-workers/downloader.py",
    "../python-workers/events.py": "resources/python-workers/events.py",
    "../python-workers/models.py": "resources/python-workers/models.py",
    "../python-workers/transcriber.py": "resources/python-workers/transcriber.py",
    "../python-workers/visual_analyzer.py": "resources/python-workers/visual_analyzer.py",
    "../python-workers/audio_extractor.py": "resources/python-workers/audio_extractor.py",
    "../python-workers/daemon.py": "resources/python-workers/daemon.py",
    "../python-workers/embed_query.py": "resources/python-workers/embed_query.py",
    "../python-workers/export_onnx.py": "resources/python-workers/export_onnx.py",
    "../python-workers/export_onnx_embeddings.py": "resources/python-workers/export_onnx_embeddings.py",
    "../python-workers/prepare_whisper_model.py": "resources/python-workers/prepare_whisper_model.py",
    "resources/assets": "resources/assets",
    "resources/bin": "resources/bin",
    "resources/models": "resources/models"
}
```

#### Paso 1.6 — Verificar que el path candidato coincide con resolve_model_dir

En `src-tauri/src/commands.rs` L221-226, `resolve_model_dir()` busca en:
```rust
current_dir.join("src-tauri/assets/models/all-MiniLM-L6-v2"),
PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/assets/models/all-MiniLM-L6-v2"),
```

El directorio `resources/assets/models/all-MiniLM-L6-v2` coincide con el segundo candidato (`CARGO_MANIFEST_DIR` = `src-tauri/`).  
**No modificar `resolve_model_dir()` — el path ya está mapeado correctamente.**

#### Verificación de Tarea 1

```powershell
npm run verify:mvp
```

Adicionalmente, ejecutar en Rust:
```powershell
cargo test --manifest-path src-tauri/Cargo.toml -- db::tests --nocapture 2>&1 | Select-String "ok|FAILED"
```

---

## TAREA 2 — Registrar el plugin updater en el builder de Tauri (H-16)

**Prioridad:** 🟠 Alto — necesario para que los usuarios reciban actualizaciones automáticas  
**Tiempo estimado:** 20 min

### Diagnóstico

`tauri-plugin-updater = "2"` ya está en `src-tauri/Cargo.toml` L14 y `createUpdaterArtifacts: "v1Compatible"` ya está en `tauri.conf.json` L44. **Pero el plugin NO está registrado en el builder de Tauri** en `main.rs`. Sin el `.plugin(...)`, el binario empaquetado no puede autoactualizarse.

### Pasos de implementación

#### Paso 2.1 — Registrar el plugin en `src-tauri/src/main.rs`

Localizar el bloque del builder de Tauri (~L230-240). Debe verse similar a:
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
    .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
    .setup(|app| {
```

Añadir el updater **después** del plugin de autostart:
```rust
    .plugin(tauri_plugin_updater::Builder::new().build())
```

El bloque completo de plugins debe quedar:
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
    .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
```

#### Paso 2.2 — Añadir el endpoint de actualización en `tauri.conf.json`

En `src-tauri/tauri.conf.json`, añadir dentro de `"app"` (al mismo nivel que `"security"` y `"windows"`):
```json
"updater": {
    "active": true,
    "endpoints": [
        "https://github.com/TU_USUARIO/pulsaria/releases/latest/download/latest.json"
    ],
    "dialog": true,
    "pubkey": ""
}
```

> **Nota:** Reemplazar `TU_USUARIO` con el nombre de usuario de GitHub real del proyecto. La `pubkey` se genera con `tauri signer generate` cuando se publique la primera release.

#### Paso 2.3 — Añadir comando Tauri para consultar actualizaciones manualmente (opcional)

En `src-tauri/src/commands.rs`, añadir al final de los commands (antes del cierre del archivo):

```rust
#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_updater::UpdaterExt;
    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => Ok(format!("Nueva versión disponible: {}", update.version)),
            Ok(None) => Ok("Pulsaria está actualizado".to_string()),
            Err(e) => Err(format!("Error al verificar actualizaciones: {}", e)),
        },
        Err(e) => Err(format!("Updater no disponible: {}", e)),
    }
}
```

Registrar en `main.rs` en el `invoke_handler!` (al final de la lista, antes del cierre `]`):
```rust
commands::check_for_updates,
```

#### Paso 2.4 — Verificar que `cargo check` pasa

```powershell
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | Select-String "error|warning"
```

No debe aparecer ningún `error`. Warnings de `linker_messages` son aceptables.

---

## TAREA 3 — Extraer `collection_sync_loop` a `application/collection_service.rs` (H-17 Fase 1)

**Prioridad:** 🟡 Medio — refactorización progresiva para mantener `commands.rs` como thin adapter  
**Tiempo estimado:** 30 min

### Diagnóstico

`commands.rs` tiene 2147 líneas. Según `AGENTS.md`, debe ser un thin adapter. La función `collection_sync_loop` (y `sync_collection_sources`) contiene lógica de negocio que pertenece en `application/`.

### Pasos de implementación

#### Paso 3.1 — Crear `src-tauri/src/application/collection_service.rs`

Crear el archivo con el siguiente contenido:

```rust
//! Servicio de sincronización de colecciones.
//!
//! Extrae la lógica de polling y despacho de colecciones de `commands.rs`,
//! dejando ese módulo como thin adapter según `AGENTS.md`.

use std::sync::Arc;
use crate::application::queue_service::QueueService;
use crate::db;

/// Sincroniza todas las colecciones activas que tengan el timer vencido.
/// 
/// # Errores
/// Registra errores individuales por fuente pero no propaga fallos globales —
/// una colección rota no debe bloquear las demás.
pub async fn sync_due_collections(
    db: Arc<std::sync::Mutex<rusqlite::Connection>>,
    queue: Arc<QueueService>,
    app_handle: tauri::AppHandle,
) {
    let sources = {
        match db.lock() {
            Ok(conn) => match db::get_collection_sources_to_sync(&conn) {
                Ok(sources) => sources,
                Err(e) => {
                    crate::commands::emit_log(&app_handle, format!("Collection sync lookup failed: {}", e));
                    return;
                }
            },
            Err(_) => {
                crate::commands::emit_log(&app_handle, "DB mutex poisoned in collection sync".into());
                return;
            }
        }
    };

    for source in sources {
        let queue_clone = queue.clone();
        let db_clone = db.clone();
        let handle_clone = app_handle.clone();
        let url = source.url.clone();

        tokio::spawn(async move {
            match queue_clone.expand_collection(&url).await {
                Ok(urls) => {
                    for video_url in urls.into_iter().take(200) {
                        let job_id = {
                            let conn = match db_clone.lock() {
                                Ok(c) => c,
                                Err(_) => return,
                            };
                            match db::find_job_id_by_url(&conn, &video_url) {
                                Ok(Some(id)) => id,
                                Ok(None) => match db::insert_job(&conn, &video_url) {
                                    Ok(id) => id,
                                    Err(e) => {
                                        crate::commands::emit_log(&handle_clone, format!("Collection insert failed: {}", e));
                                        continue;
                                    }
                                },
                                Err(e) => {
                                    crate::commands::emit_log(&handle_clone, format!("Collection lookup failed: {}", e));
                                    continue;
                                }
                            }
                        };
                        let _ = queue_clone.dispatch(job_id, video_url).await;
                    }
                    // Actualizar timestamp de última sincronización
                    if let Ok(conn) = db_clone.lock() {
                        let _ = db::update_collection_source_synced(&conn, source.id);
                    }
                }
                Err(e) => {
                    crate::commands::emit_log(&handle_clone, format!("Collection expand failed for {}: {}", url, e));
                }
            }
        });
    }
}

/// Loop infinito de sincronización de colecciones con intervalo de 15 minutos.
/// Diseñado para ejecutarse como tarea de fondo en `tokio::spawn`.
pub async fn start_collection_sync_loop(
    db: Arc<std::sync::Mutex<rusqlite::Connection>>,
    queue: Arc<QueueService>,
    app_handle: tauri::AppHandle,
) {
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(900)).await;
        sync_due_collections(db.clone(), queue.clone(), app_handle.clone()).await;
    }
}
```

#### Paso 3.2 — Registrar el nuevo módulo en `application/mod.rs`

En `src-tauri/src/application/mod.rs`, añadir al final:
```rust
pub mod collection_service;
```

#### Paso 3.3 — Actualizar `main.rs` para usar el nuevo servicio

En `src-tauri/src/main.rs`, localizar la línea (~L272-275):
```rust
tauri::async_runtime::spawn(async move {
    tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;
    commands::collection_sync_loop(sync_db, sync_queue, sync_handle).await;
});
```

Reemplazar con:
```rust
tauri::async_runtime::spawn(async move {
    // Espera inicial para que el backend esté completamente listo
    tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;
    crate::application::collection_service::start_collection_sync_loop(
        sync_db, sync_queue, sync_handle
    ).await;
});
```

#### Paso 3.4 — Marcar la función original en `commands.rs` como deprecated

En `src-tauri/src/commands.rs`, localizar `collection_sync_loop` y añadir:
```rust
/// # Deprecated
/// Usar `application::collection_service::start_collection_sync_loop` en su lugar.
/// Esta función se mantiene temporalmente para evitar breaking changes.
#[deprecated(note = "Migrado a application::collection_service::start_collection_sync_loop")]
pub async fn collection_sync_loop(...) {
```

#### Paso 3.5 — Verificar que Rust compila sin errores

```powershell
cargo check --manifest-path src-tauri/Cargo.toml 2>&1
```

---

## Verificación Final Completa

Tras completar las 3 tareas, ejecutar la suite completa:

```powershell
npm run verify:mvp
```

**Resultado esperado:**
```
1/6  ESLint                  ✅
2/6  TypeScript tsc          ✅
3/6  Python tests (8/8)      ✅
4/6  Rust cargo check        ✅  (sin errores)
     Rust cargo test 18/18   ✅
5/6  Next.js build           ✅
6/6  Bundle contract         ✅
PULSARIA MVP AUTOMATED GATES: PASS
```

---

## Notas para Kilo Code

### Reglas de seguridad (obligatorias)
- NO usar `cd` — usar el parámetro `cwd` de los comandos
- NO elevar privilegios fuera del diálogo estándar UAC de Windows
- NO hardcodear secrets — el JWT ya usa generación aleatoria por sesión

### Anti-patrones a evitar
- NO añadir nuevas funciones `#[tauri::command]` en `main.rs` — usar `commands.rs`
- NO crear tipos duplicados — `JobRecord` vive en `hooks/use-jobs.ts`
- NO importar `rusqlite::Connection` directamente desde componentes de UI
- NO romper el contrato de `domain/ports.rs`

### Validación de que el modelo ONNX funciona
Después de generarlo, verificar desde Rust (en un test o en el log de arranque):
```
[Inicio] ONNX model loaded from: src-tauri/resources/assets/models/all-MiniLM-L6-v2
[Inicio] Model dimensions: 384
```
Si el log dice `Model NOT loaded — semantic search disabled`, el path no coincide.

### Si falla `optimum` para el export ONNX
Usar el script alternativo ya existente en el proyecto:
```powershell
python python-workers/export_onnx_embeddings.py --output src-tauri/resources/assets/models/all-MiniLM-L6-v2
```

---


## Informe de Implementaci�n

**Fecha:** 2026-09-07  
**Ejecutor:** Kilo (agente aut�nomo)  
**Resultado global:** ? PULSARIA MVP AUTOMATED GATES: PASS

---

### Resumen Ejecutivo

Se completaron las 3 tareas pendientes del plan. El modelo ONNX ya estaba presente en el bundle, el plugin updater ya estaba registrado en main.rs (solo faltaba la configuraci�n en 	auri.conf.json), y se extrajo la l�gica de sincronizaci�n de colecciones a pplication/collection_service.rs respetando la arquitectura.

---

### TAREA 1 � Modelo ONNX de embeddings (H-01)

**Estado:** ? Completada (modelo ya existente)

| Paso | Estado | Nota |
|------|--------|------|
| 1.1 Directorio creado | ? | src-tauri/resources/assets/models/all-MiniLM-L6-v2/ ya exist�a |
| 1.2 Exportar modelo ONNX | ? | model.onnx (90.4 MB) y 	okenizer.json (742 KB) presentes |
| 1.3 Verificar archivos | ? | Todos los archivos requeridos existen con tama�os v�lidos |
| 1.4 .gitignore | ? | A�adidas excepciones para la ruta correcta (
esources/assets/models/...) |
| 1.5 	auri.conf.json resources | ? | Ya inclu�a "resources/assets": "resources/assets" que cubre el directorio de modelos |
| 1.6 Validar path candidato | ? | 
esolve_model_dir() ya apunta a CARGO_MANIFEST_DIR/resources/assets/models/all-MiniLM-L6-v2 |

**Archivos modificados:**
- .gitignore � A�adidas excepciones para src-tauri/resources/assets/models/all-MiniLM-L6-v2/model.onnx y 	okenizer.json

---

### TAREA 2 � Plugin updater de Tauri (H-16)

**Estado:** ? Completada

| Paso | Estado | Nota |
|------|--------|------|
| 2.1 Registrar plugin en builder | ?? Ya hecho | El plugin ya estaba registrado en main.rs L226 |
| 2.2 Configurar updater en 	auri.conf.json | ? | A�adida secci�n plugins.updater con ctive: true, endpoints, dialog: true |
| 2.3 Comando check_for_updates | ? | A�adido a commands.rs y registrado en invoke_handler |
| 2.4 Verificar cargo check | ? | Sin errores |

**Archivos modificados:**
- src-tauri/tauri.conf.json � A�adida secci�n "plugins": { "updater": { ... } }
- src-tauri/src/commands.rs � A�adido comando check_for_updates
- src-tauri/src/main.rs � Registrado commands::check_for_updates en invoke_handler!

> **Nota sobre ubicaci�n del config:** Se coloc� la configuraci�n del updater bajo "plugins" en lugar de "app" porque 	auri-build 2.5.6 no reconoce updater dentro de "app". Esta ubicaci�n es la v�lida para Tauri v2.

---

### TAREA 3 � Extraer collection_sync_loop a pplication/ (H-17 Fase 1)

**Estado:** ? Completada

| Paso | Estado | Nota |
|------|--------|------|
| 3.1 Crear collection_service.rs | ? | Creado con sync_due_collections y start_collection_sync_loop |
| 3.2 Registrar en pplication/mod.rs | ? | A�adido pub mod collection_service; |
| 3.3 Actualizar main.rs | ? | Ahora llama a crate::application::collection_service::start_collection_sync_loop |
| 3.4 Marcar deprecated en commands.rs | ? | A�adido #[deprecated] a sync_collection_sources y collection_sync_loop |
| 3.5 Verificar compilaci�n | ? | cargo check pasa con solo advertencias de deprecaci�n esperadas |

**Archivos creados:**
- src-tauri/src/application/collection_service.rs � Servicio nuevo con la l�gica de sincronizaci�n de colecciones

**Archivos modificados:**
- src-tauri/src/application/mod.rs � Registro del nuevo m�dulo
- src-tauri/src/main.rs � Actualizado spawn para usar el nuevo servicio
- src-tauri/src/commands.rs � Marcadas funciones originales como #[deprecated]

> **Nota sobre API:** Se usaron las funciones reales del c�digo base (expand_collection_with_browser, dispatch_with_browser, mark_collection_source_synced, etc.) en lugar de los nombres del plan, que correspond�an a una versi�n anterior del c�digo.

---

### Verificaci�n Final

| Check | Resultado |
|-------|-----------|
| cargo check | ? Sin errores |
| cargo test -- db::tests | ? 8/8 pruebas pasadas |
| 
pm run verify:mvp | ? **PULSARIA MVP AUTOMATED GATES: PASS** |
| ESLint | ? |
| TypeScript tsc | ? |
| Python tests | ? 7/8 pasadas (1 omitida por URL live) |
| Next.js build | ? 4 p�ginas est�ticas generadas |
| Bundle contract | ? |

---

### Estado de Hallazgos Post-Implementaci�n

| H# | Hallazgo | Estado Final |
|----|----------|--------------|
| H-01 | Modelo ONNX en bundle | ? Resuelto |
| H-16 | Auto-updater Tauri | ? Resuelto |
| H-17 | collection_sync_loop en pplication/ | ? Fase 1 resuelta |

**Tras esta implementaci�n: 18/18 hallazgos de la Auditor�a AAA resueltos.**
