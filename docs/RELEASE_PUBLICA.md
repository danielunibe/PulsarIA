# Pulsaria — runbook de release pública

Este runbook define el cierre de `0.1.0` como baseline, `0.1.1-rc.1` como candidato y `0.1.1` como release estable para `danielunibe/PulsarIA`. La aplicación sigue siendo desktop-first y el gateway REST permanece enlazado exclusivamente a `127.0.0.1`.

## Estado de esta fase

| Gate | Estado actual | Qué falta para marcarlo PASS |
|---|---|---|
| Frontend, Rust, Python y recursos fuente | PASS local | Manifest de 56 archivos, FFmpeg/FFprobe y `FFMPEG-LICENSE.txt` verificados; el bundle debug vigente ya fue reconstruido |
| Smoke del bundle instalado | PASS QA | NSIS vigente `B19946…`: instalación, recursos 8/8, manifest 56/56, health, ingest live completo, reinicio y desinstalación; repetir con build release firmado antes de publicar |
| Contrato LLM local | PASS local | Repetir descarga, integridad y sidecar en el candidato de release |
| Updater JavaScript | Implementado, inactivo | Clave pública Tauri, clave privada en GitHub Environment y `latest.json` publicado |
| Aceptación visual Tauri | BLOCKED_EXTERNAL | Capturas asistidas en el equipo objetivo a 1280×800 y 860×640 |
| Next/PostCSS | PASS parcial aislado | Next 16.3.5 y audit 0 demostrados en el experimento; repetir sobre un checkpoint limpio con la estabilización vigente antes de promover |
| Firma Authenticode | Pendiente externo | Certificado PFX temporal, timestamp server y verificación válida |

La aceptación visual nativa no se considera demostrada por `next build`, una captura del navegador o un smoke HTTP. Debe completarse con el ejecutable instalado y conservar las capturas sanitizadas junto con la hoja de evidencia.

## Preflight local

Desde la raíz del repositorio:

```powershell
npm ci
npm run verify:mvp
npm run verify:api
npm run verify:frontend-secrets
npm audit --omit=dev
```

El contrato de recursos se genera y verifica por separado para que un binario ausente no quede oculto por un build exitoso:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-runtime-manifest.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-runtime-manifest.ps1
```

El manifest exige Python embebido, módulos críticos, workers, ONNX/MiniLM, Whisper tiny, `ffmpeg.exe`, `ffprobe.exe` y la evidencia local de licencia dentro de `resources/`. No se acepta un ejecutable del `PATH` ni se descarga/copia FFprobe automáticamente. En el checkout actual la verificación fuente devuelve `PASS`; el bundle instalado solo puede marcarse `PASS` después de reconstruirlo con el manifest y repetir `scripts/verify-installed-bundle.ps1`.

El gate de artefactos se ejecuta después de un build release que haya producido los archivos del updater:

```powershell
npm run verify:release-artifacts -- -ArtifactRoot target-tauri\release\bundle -RequireAuthenticode
```

El workflow genera en `RUNNER_TEMP` el overlay de Tauri con la clave pública, el endpoint y la firma Authenticode; no se debe versionar un overlay con valores reales.

No se debe usar `npm audit fix --force` sobre la rama estable. Si la migración de Next 16 rompe la exportación estática, Tauri o el smoke instalado, se conserva Next 15.5.25 en estable y se documenta el bloqueo.

## Fase 1 — aceptación visual nativa

1. Instalar el NSIS firmado en un usuario/perfil de prueba limpio. No reutilizar el perfil productivo ni borrar sus datos.
2. Registrar sistema operativo, escala DPI, hash SHA-256 del instalador y versión instalada.
3. Capturar el primer arranque en 1280×800 y repetir en el mínimo 860×640.
4. Verificar que el onboarding no muestra una tarjeta central, mantiene una sola columna, no corta el CTA y deja ver el Aurora animado detrás de la capa translúcida/desenfocada.
5. Completar Tab, Shift+Tab, Enter, Espacio, Escape y scroll vertical. El foco debe ser visible y no debe escapar al contenido detrás del onboarding.
6. Ejecutar preparación, cancelación, reintento y finalización del modelo. Capturar cada estado y el estado de éxito.

Hoja mínima de evidencia:

| Caso | Resolución/DPI | Interacción | Resultado | Captura |
|---|---|---|---|---|
| Primer arranque | 1280×800 / ____% | abrir onboarding | PASS/FAIL | `native-first-run-1280.png` |
| Viewport mínimo | 860×640 / ____% | scroll y CTA | PASS/FAIL | `native-min-860.png` |
| Teclado/foco | ____ / ____% | Tab, Enter, Escape | PASS/FAIL | `native-keyboard.png` |
| Preparación | ____ / ____% | iniciar y completar | PASS/FAIL | `native-preparing.png`, `native-success.png` |
| Cancelación | ____ / ____% | cancelar y reintentar | PASS/FAIL | `native-cancel.png` |

Actualizar el registro histórico en `docs/archive/AUDITORIA_AAA.md` con esos resultados solo después de revisar las capturas. Si falla alguna composición, corregir de forma localizada `components/ProcessingSetupModal.tsx` o `components/ProcessingSetupModal.module.css`, reconstruir y repetir el smoke instalado.

## Fase 2 — LLM local y privacidad

El contrato único es `get_local_llm_status`, `ensure_local_llm`, `cancel_local_llm_download` y `generate_local_response` por Tauri IPC. El frontend nunca llama directamente al puerto del sidecar. `llama-server.exe` se inicia sólo durante una generación, escucha en `127.0.0.1` y recibe un modelo GGUF previamente descargado y verificado.

La UI informa que la IA local es opcional. La preparación comienza sólo después de pulsar el botón correspondiente, admite reanudación mediante archivo parcial y sólo marca el modelo como listo después de comprobar tamaño y SHA-256. La transcripción enviada al sidecar no se persiste ni se escribe en logs.

Gates obligatorios:

- `npm run verify:local-llm` valida el manifiesto, licencia declarada y sidecar incluido;
- `npm run verify:legal-release` bloquea credenciales, endpoints cloud, documentos incompletos y artefactos privados;
- el modelo se descarga exclusivamente por HTTPS desde los hosts fijados;
- un archivo truncado, alterado o de revisión incorrecta no se carga;
- el navegador sin shell nativo muestra la función como no disponible;
- un sidecar caído produce un error visible, no una respuesta simulada;
- `cargo test --manifest-path src-tauri/Cargo.toml` y la captura de red confirman el límite local.

## Fase 3 — migración aislada

La prueba inicial en `codex/next16-security-migration` demostró lint, typecheck, export estático y audit 0 sobre su checkpoint frontend, pero quedó bloqueada para Tauri porque ese checkpoint no contiene los recursos `src-tauri/resources/bin` ni los scripts de estabilización. El resultado completo está en `docs/NEXT16_MIGRATION.md`. La promoción sigue pendiente: la siguiente rama debe partir de un checkpoint limpio que incluya la estabilización actual, sin incluir cambios no relacionados del worktree compartido. En el worktree aislado:

```powershell
npm ci
npm install next@16.3.5 @next/eslint-plugin-next@16.3.5 --save-exact
# Fijar aquí las versiones compatibles verificadas de PostCSS y del adaptador Tailwind.
npm run lint
npm run typecheck
npm run test:python
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
npm audit --omit=dev
npm run verify:installed
```

PostCSS y el adaptador Tailwind deben fijarse a las versiones compatibles verificadas que resuelvan los advisories reales, regenerar `package-lock.json` y quedar revisados en el diff. No se debe dejar un placeholder de versión en el manifiesto. React 19 y `output: export` son contratos que no se pueden retirar.

La promoción exige cero vulnerabilidades de producción y todos los gates PASS. El script `scripts/set-release-version.mjs` sincroniza `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `Cargo.toml` y `Cargo.lock` en el runner a partir del tag, sin crear commits ni tags automáticamente.

## Fase 4 — updater y firma

La UI usa `@tauri-apps/plugin-updater` con comprobación manual. Los estados son `idle`, `checking`, `up-to-date`, `available`, `downloading`, `installing` y `error`. `downloadAndInstall` valida la firma Tauri antes de instalar; en Windows reinicia la aplicación mediante el flujo del plugin. No se habilitan downgrades silenciosos.

Endpoint estable:

```text
https://github.com/danielunibe/PulsarIA/releases/latest/download/latest.json
```

Endpoint del candidato:

```text
https://github.com/danielunibe/PulsarIA/releases/download/v0.1.1-rc.1/latest.json
```

Crear el GitHub Actions Environment protegido llamado `release`. Guardar como secretos únicamente:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
WINDOWS_CERTIFICATE_BASE64
WINDOWS_CERTIFICATE_PASSWORD
WINDOWS_TIMESTAMP_URL
```

Guardar la clave pública como variable no secreta del Environment (`TAURI_UPDATER_PUBLIC_KEY`) o versionarla en la configuración una vez que se haya generado. La clave privada, el PFX y sus contraseñas nunca se escriben en el repositorio, en los logs, en los artefactos ni en argumentos visibles.

`.github/workflows/release.yml`:

- corre en `windows-latest`, por tag `v*` o manualmente;
- sincroniza la versión del tag y ejecuta `npm ci`;
- ejecuta `npm run verify:mvp`, `npm run verify:api` y `npm audit --omit=dev`;
- genera NSIS/MSI release y artefactos updater con `createUpdaterArtifacts: true`;
- firma updater con `TAURI_SIGNING_PRIVATE_KEY` y Authenticode mediante PFX temporal;
- verifica `.exe`, `.msi`, `latest.json` y `.sig` antes de publicar;
- publica con `GITHUB_TOKEN` y elimina el PFX en `finally`.

El workflow falla cerrado si faltan las credenciales, la clave pública o cualquier firma. No se debe ejecutar una publicación real desde este host mientras esos valores no estén disponibles.

## Fase 5 — RC, firma inválida y rollback

Para `v0.1.1-rc.1`:

1. Construir con el endpoint fijo del candidato.
2. Instalar la baseline firmada `0.1.0` en una máquina aislada.
3. Buscar manualmente la actualización, confirmar instalación y verificar progreso/reinicio.
4. Confirmar que SQLite, configuración, biblioteca, archivos locales, backups HNSW y datos del usuario sobreviven.
5. Probar sin actualización, endpoint inaccesible, `latest.json` inválido, descarga interrumpida, firma inválida y artefacto alterado.

En el caso de firma inválida, el resultado obligatorio es rechazo visible, permanencia de la versión anterior y cero ejecución de un instalador no verificado. Para rollback se restaura el último instalador firmado y se verifica la integridad de SQLite/HNSW y de los datos del usuario. El updater no debe ofrecer downgrade silencioso.

Solo después de cerrar el RC se publica `v0.1.1` con el endpoint estable.

## API y JWT

El gateway usa `127.0.0.1` por contrato. `scripts/verify-api-loopback.ps1` y las pruebas Rust comprueban el rechazo de `0.0.0.0`, direcciones LAN, `::` y `::1`. `/health` permanece disponible localmente y las demás rutas siguen pasando por el middleware de rate limiting/JWT opcional de desktop.

Si una futura versión pretende enlazar fuera de loopback, debe negarse a iniciar salvo que implemente simultáneamente:

- `JWT_SECRET` fuerte, explícito y fuera del repositorio;
- JWT obligatorio en toda ruta excepto salud;
- CORS con allowlist explícita;
- rate limiting activo;
- configuración pública separada de la configuración desktop.

Hasta que esos requisitos se validen, no se debe cambiar `API_BIND_HOST` ni exponer el gateway a LAN/IPv6 externo.
