# Pulsaria Beta 2 — evidencia de integración y validación

Fecha de verificación: 2026-09-19 (hora local del checkout)

## Alcance canónico

La implementación se realizó sobre `C:\Users\danie\Desktop\Pulsaria`, rama
`main`. El contenido de `pulsaria.zip` se utilizó únicamente como referencia
visual y funcional: no se extrajo encima del checkout ni se dejó como segundo
frontend activo.

La fuente activa es `app/`, `components/`, `hooks/`, `lib/`, `types/`,
`semantic/`, `sdk/typescript/`, `src-tauri/src/` y `python-workers/`. La
biblioteca real continúa dependiendo de SQLite/backend; `public/demo` y los
fixtures no se usan como contenido visible de usuario.

## Perfil TESTER DEV — 2026-09-20

La iteración diaria queda separada de la validación nativa mediante:

```powershell
npm run dev:tester
```

El launcher verifica que todas las fuentes de versión coincidan en
`0.1.0-beta.2`, fija `127.0.0.1:3000`, usa `.next-dev`, rechaza el fallback a
`3001` y espera los marcadores del checkout canónico antes de declararse listo.
El perfil `tester-dev` ofrece hot reload del frontend sin compilar Tauri/Rust ni
generar instaladores. La ventana nativa se valida aparte con `npm run tauri dev`
y el bundle de release solo se regenera explícitamente con `npm run tauri build`.

Validación ejecutada después de activar este perfil:

| Comprobación | Estado | Evidencia |
| --- | --- | --- |
| Contrato de versión | PASS | `npm run verify:versions`; ocho fuentes coinciden en `0.1.0-beta.2` |
| Estructura canónica | PASS | `npm run verify:canonical`; sin segundo frontend ni copias duplicadas de workers |
| TypeScript | PASS | `npm run typecheck` |
| ESLint | PASS | `npm run lint` |
| Servidor tester | PASS | HTTP 200 en `127.0.0.1:3000` con marcadores `beta2-canonical`, `0.1.0-beta.2` y `tester-dev` |
| Formato del diff | PASS | `git diff --check` sin errores de whitespace |

En este perfil, si Tauri no está ejecutándose, las llamadas IPC/REST del
backend pueden registrar `Failed to fetch`; el frontend lo presenta como
backend local no disponible. Esto no convierte el modo tester en una simulación
de biblioteca ni autoriza datos demo.

## Gates reproducibles

| Gate | Estado | Evidencia |
| --- | --- | --- |
| MVP automatizado | PASS | `npm run verify:mvp`: 13/13 |
| Next/frontend | PASS | Next.js 16.3.5; lint, TypeScript y build de producción incluidos en 13/13 |
| Rust | PASS | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo check` y `cargo test`: 74 tests PASS |
| Python | PASS parcial | 27 tests PASS y 1 skip live intencional |
| Canonicalidad | PASS | `npm run verify:canonical`; no hay segundo frontend funcional |
| Iconos | PASS | `npm run verify:icons`; PNG web y assets Tauri derivan de `C:\Users\danie\Downloads\icono pulsaria .png` |
| Accesibilidad frontend | PASS | `npm run verify:frontend-a11y` |
| Runtime | PASS | `npm run verify-runtime-manifest.ps1`: 51/51 recursos canónicos |
| Dependencias de producción | PASS | `npm audit --omit=dev`: 0 vulnerabilidades |
| Locale | PASS | `scripts/verify-locale.ps1` incluido en `verify:mvp` |
| Bundle Tauri Release | PASS técnico | `npm run tauri build` generó EXE, NSIS y MSI desde el árbol final; el ejecutable Release arrancó y expuso API `8080` y métricas `9001` |

## Artefactos Release de la comprobación anterior

Estos artefactos corresponden a la build técnica previa con versión nativa
`0.1.0-2`. Después se sincronizó la fuente canónica a `0.1.0-beta.2` para el
perfil TESTER DEV; por tanto, no deben presentarse como el bundle actual hasta
ejecutar una nueva build Tauri explícita.

| Artefacto | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `target-tauri/release/pulsaria.exe` | 58,118,144 | `9ABEF5C95486288EC5A37E381ADC239B06A76AE1A1B14BCA8DC59EF3EDF33070` | `NotSigned` |
| `target-tauri/release/bundle/nsis/Pulsaria_0.1.0-2_x64-setup.exe` | 583,907,806 | `6E63CAEBEE2598F73E486AF36F124034F91DDEA8BB1FDB07CCDE4328B51BCA57` | `NotSigned` |
| `target-tauri/release/bundle/msi/Pulsaria_0.1.0-2_x64_en-US.msi` | 713,158,206 | `F0508BE80272C402E817884224F6083851F16CF522487036B4514DFA8C831737` | `NotSigned` |

`npm run verify:release-artifacts` confirma el runtime 51/51, pero termina en
`BLOCKED_EXTERNAL` porque el repositorio no contiene `latest.json`, archivos
`.sig` ni `SHA256SUMS.txt` de un updater público. No se fabricaron esos
metadatos ni se presentó el resultado como un release firmado.

## Validación web observada

El preview canónico respondió HTTP 200 en `127.0.0.1:3000` y mostró:

- una única barra principal con la caja Pulsaria, el icono canónico y los
  controles accesibles de ventana;
- consentimiento legal desmarcado y envío bloqueado hasta aceptar;
- rechazo visible de URL externa sin marcarla como trabajo completado;
- error de navegador 401/403 presentado como backend local no disponible, sin
  convertirlo en una biblioteca vacía engañosa;
- Cinema deshabilitado cuando no existen vídeos reales;
- Ajustes organizados en General, Motor, IA y Métricas;
- estados vacíos sin vídeos remotos, usuarios ficticios, estadísticas
  aleatorias ni títulos de demostración.

El launcher de desarrollo queda fijado a `127.0.0.1:3000`, usa `.next-dev`,
verifica el marcador `beta2-canonical` y falla si el puerto está ocupado; no
realiza fallback silencioso a `3001`. Una invocación explícita con otro puerto
también se rechaza antes de iniciar Next.js; el smoke canónico devolvió HTTP
200 y el marcador esperado, y después se cerró sin dejar listeners en `3000` o
`3001`.

## Validación nativa y límites honestos

`npm run tauri dev` compiló y ejecutó correctamente
`target-tauri/debug/pulsaria.exe`. Durante la prueba, el frontend respondió
HTTP 200 en `127.0.0.1:3000`, la API ocupó `127.0.0.1:8080` y métricas ocupó
`127.0.0.1:9001`. La primera ejecución reveló una divergencia de hidratación
en `LegalConsentModal`; se corrigió haciendo estable la detección del shell
Tauri durante el primer render. La segunda ejecución no volvió a reportar
`Hydration failed`. También se sustituyó `THREE.Clock` por `THREE.Timer` para
eliminar el warning deprecado del fondo WebGL.

El arranque técnico nativo queda `PASS`. La aceptación visual nativa de la
ventana se mantiene `BLOCKED_EXTERNAL` en esta sesión porque el inspector
asistido no expone una ventana Tauri para captura; el preview web no se
presenta como sustituto de esa evidencia.

También permanecen fuera del control del repositorio:

- certificado Authenticode y firma de ejecutable/instalador;
- updater público con `latest.json`, firmas y endpoint HTTPS;
- instalación limpia/elevada y smoke físico en Windows;
- smoke live con una URL TikTok autorizada;
- aprobación legal y publicación externa.

No se eliminaron bases de datos, medios, runtime, modelos ni configuraciones
del usuario. Tampoco se ejecutaron `git reset`, `git clean`, stash global,
commit ni push.
