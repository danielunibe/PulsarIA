# Beta 3 — aceptación del instalador definitivo

Esta lista registra evidencia humana y funcional que los contratos estáticos no pueden sustituir. Estado inicial: **PENDIENTE**. No marcar PASS por abrir un preview web.

## Identificación obligatoria

Registrar nombre del EXE, tamaño, SHA-256, tag `v0.1.0-beta.3`, commit, run ID y artifact ID de Actions, Windows/compilación, fecha y persona que ejecutó la prueba. Conservar capturas y diagnósticos sin datos privados. La aprobación se aplica únicamente a ese hash; reconstruir o cambiar el archivo invalida la aceptación.

## Entorno y protección de datos

- Usar Windows x64 sin Node.js/Rust/Python/FFmpeg globales. Registrar WebView2 existente o su instalación desde el paquete, y si requirió alguna intervención.
- Usar una VM, Windows Sandbox o perfil de prueba. Para actualización, instalar primero `v0.1.0-eval.3`, crear una biblioteca de prueba y documentar el backup; nunca experimentar sobre la biblioteca personal.
- Cerrar las ventanas de prueba y comprobar que 8080/9001 estén libres antes del smoke aislado. No detener procesos ajenos automáticamente.

La aplicación admite `PULSAR_DATA_DIR` como override del directorio de datos. En un perfil de Windows dedicado, el siguiente patrón de PowerShell asigna el override solo al proceso de prueba; conserva su carpeta para revisar SQLite y los archivos creados. Usarlo con la ruta del EXE instalado desde el artifact que se está aceptando, después de comprobar que los puertos indicados están libres:

```powershell
$installerExe = 'C:\ruta\verificada\Pulsaria.exe'
$testData = Join-Path $env:TEMP ("Pulsaria-Beta3-" + [guid]::NewGuid().ToString('N'))
if (-not (Test-Path -LiteralPath $installerExe -PathType Leaf)) { throw 'No se encuentra el EXE instalado.' }
New-Item -ItemType Directory -Path $testData | Out-Null
$hadOverride = Test-Path Env:\PULSAR_DATA_DIR
$previousOverride = $env:PULSAR_DATA_DIR
try {
    $env:PULSAR_DATA_DIR = $testData
    $appProcess = Start-Process -FilePath $installerExe -PassThru
    $appProcess.WaitForExit()
} finally {
    if ($hadOverride) {
        $env:PULSAR_DATA_DIR = $previousOverride
    } else {
        Remove-Item Env:\PULSAR_DATA_DIR -ErrorAction SilentlyContinue
    }
}
Write-Host "Perfil de aceptación conservado en: $testData"
```

No ejecutar el patrón si la ruta de datos, EXE o puertos no coinciden con la sesión aislada prevista. El override no sustituye una VM para verificar WebView2 o instalación limpia.

## Recorrido con resultados esperados

| Prueba | Resultado requerido | Estado inicial |
| --- | --- | --- |
| Instalación nueva y onboarding | Instalación por usuario, primer arranque y consentimiento sin herramientas de desarrollo | Parcial local: el instalador `D0492C87…A669F989` abrió el onboarding; no se aceptaron documentos. Falta repetir con el artifact inmutable de Actions y completar aceptación humana |
| Biblioteca vacía / DEMO | Vacío explicado; DEMO opt-in separado de SQLite y búsqueda | Pendiente |
| 1280 × 800 / 860 × 640 | Cabecera, navegación, Ajustes y acciones visibles sin recortes que impidan uso | Parcial local: el diálogo legal cupo en ambos tamaños; falta aceptar documentos, recorrer el resto de la app y repetir con el artifact de Actions |
| Teclado / foco / idioma | Acciones accesibles, foco visible y cambio persistente es-MX/en-US; comprobar que cambien los nombres accesibles de navegación, Cinema y controles de ventana | Parcial local: Tab movió el foco visible entre enlaces y casilla del diálogo; idioma, Ajustes y recorrido completo pendientes |
| URL autorizada con voz española | Job completado, audio reproducible y transcripción con palabras reconocibles | Pendiente; una repetición del worker extrajo 41.263 s de audio MP3 mono 16 kHz (media −19.0 dB, pico −6.1 dB), pero generó 0 caracteres y segmentos; no confirma si había voz |
| Actividad / fallo / reintento | Estado real, mensaje comprensible y reintento sin progreso inventado | Pendiente |
| URL inválida / duplicado | Rechazo visible; duplicado no crea otro contenido canónico | Pendiente |
| Fuente sin acceso | Error explicado sin simular descubrimiento; biblioteca conservada | Pendiente |
| Búsqueda literal / conceptual | Contenido y procedencia correctos; resultado abre el elemento esperado | Pendiente |
| Biblioteca / Playlists / Fuentes | Creación, consulta y persistencia tras reiniciar | Pendiente |
| Cinema y exportación | Controles operables; MP4/MP3/TXT y formatos de subtítulos que ofrezca el elemento se abren y corresponden al contenido | Pendiente |
| Ajustes Guardar / Cancelar | Guardar persiste; Cancelar conserva la selección anterior | Pendiente |
| Reinicio y actualización desde eval.3 | Datos, ajustes, medios y trabajos conservados sin duplicaciones | PASS local con el hash vigente `D0492C87…A669F989`: 1 job, 1 medio, ajustes `en-US`/`oled`, SQLite íntegra. Artifact de Actions y Windows limpio pendientes |
| Desinstalación | La aplicación se retira y los datos de usuario siguen disponibles según el contrato | PASS local con el hash vigente: biblioteca y ajustes sintéticos conservados tras actualizar y desinstalar; pendiente para artifact de Actions y Windows limpio |

El smoke TikTok se hace desde la app instalada mediante el cliente IPC autenticado. El modo `RunLive` del script legado queda bloqueado con un diagnóstico explícito: recibía un token sin transmitirlo y el token cambia tras cada arranque. El smoke offline sigue disponible. No registrar tokens ni abrir una ruta pública para obtenerlos.

## Aprobación y publicación

1. Resolver revisión legal, datos públicos y materiales de terceros; completar la aceptación humana local y pasar CI del PR final. Solo entonces integrar en `main` y crear el tag aprobado.
2. Ejecutar el workflow directo desde `main`. Descargar el artifact producido por `build` y verificar sus hashes.
3. Completar esta lista con ese instalador, incluidos actualización y prueba live autorizada.
4. El revisor `danielunibe` comprueba identidad/hash, evidencia y documentos antes de habilitar `DIRECT_DOWNLOAD_RELEASE_READY=true` y aprobar el job `publish` del Environment `direct-download`. No desactivar las protecciones.
5. El job publica el mismo artifact y descarga los assets públicos para verificarlos. Si falla, registrar el fallo; no reemplazar los archivos publicados por otro build bajo el mismo tag.
6. Actualizar enlaces de README/sitio y la evidencia de cierre únicamente después de verificar la release pública. Conservar eval.3 como referencia histórica.

## Entradas aún necesarias

Por delegación del usuario, se eligió como presentación pública “Daniel Unibe”, denominación ya usada en el PR #2, y `danielunibe10@gmail.com`, correo que aparece en su perfil público de GitHub. Estos datos no acreditan identidad/titularidad legal ni control del buzón. `notice_address` sigue pendiente hasta aprobar un contacto postal para publicación. El texto vigente de la [LFPDPPP publicado por la Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf), con última reforma publicada el 2025-11-14, exige que el aviso de privacidad incluya la identidad y el domicilio del responsable (art. 15, fracción I). La aplicabilidad concreta a Pulsaria y qué domicilio corresponde requieren revisión legal. El PR público conserva un valor de aviso en un commit histórico que se retiró del árbol actual; el plan vigente prohíbe reescribir la historia y el PR no debe integrarse hasta resolver esa exposición. Siguen pendientes la revisión legal humana y la aprobación de los documentos y materiales de terceros.

El 2026-09-30 el usuario proporcionó y autorizó una URL TikTok para la prueba. Se omite el enlace concreto de esta documentación pública; debe comprobarse si contiene voz en español. Recibirlo no demuestra descarga ni transcripción.

El candidato local con hash `F1515FF7FCBA67EA90832711FE5A6FA2B43B567F7B01ACA9AF45FC69DE3CC212` fue rechazado en inspección nativa por falta de hidratación del frontend. Repetir el recorrido con el instalador corregido; ver `BETA3_RELEASE_EVIDENCE.md`.

La prueba aislada de actualización desde Eval.3 se completó después para el instalador local `55F420C9AE73685AF207CE8FA273484F249DAB5C0A9B3775B6D8A4434B2C02C1`: primer arranque Beta 3, migración SQLite, reinicio y desinstalación conservaron la biblioteca sintética, los ajustes y los archivos. La fila de aceptación final sigue pendiente porque este EXE no es el artifact de Actions y faltan WebView2 en un Windows sin herramientas de desarrollo, recorrido humano de la ventana instalada y el procesamiento TikTok desde IPC nativo.

El 2026-10-01 se reconstruyó un candidato local después de los cambios de idioma y contacto: `Pulsaria_0.1.0-beta.3_x64-setup.exe`, 687,986,682 bytes, SHA-256 `D0492C87BF868A857FB02E8FB25AF7D12F451EFEA0ABA1176D8423B7A669F989`, ProductVersion/FileVersion `0.1.0-beta.3`, Authenticode `NotSigned`. `verify:installed` pasó en modo offline: instalación/desinstalación exit 0, runtime 54/54, 13 documentos legales, modelos ONNX/Whisper, health antes/después de reiniciar el proceso de la aplicación, carpeta de datos de WebView2 aislada y marcador de datos aislados conservado. El registro saneado está en [BETA3_LOCAL_INSTALL_SMOKE.json](BETA3_LOCAL_INSTALL_SMOKE.json). No ejecutó ingestión ni búsqueda, no reinició Windows y no es artifact de Actions; la aceptación de UI, WebView2 en Windows limpio y TikTok por IPC siguen pendientes.

La actualización local más reciente instaló el asset público Eval.3 (`1ABD7589…9551EF`) y después el hash vigente `D0492C87BF868A857FB02E8FB25AF7D12F451EFEA0ABA1176D8423B7A669F989`. El primer arranque Beta 3 conservó 1 job y 1 medio sintéticos, ajustes `en-US`/`oled` y la integridad SQLite; tras desinstalar se volvieron a validar los datos. La carpeta de WebView2 se aisló con `WEBVIEW2_USER_DATA_FOLDER` y el test limpió su perfil temporal. Es evidencia del build local; la aceptación final debe repetirse con el artifact inmutable de Actions en Windows x64 limpio. Ver [BETA3_UPGRADE_LOCAL_EVIDENCE.json](BETA3_UPGRADE_LOCAL_EVIDENCE.json).

### Inspección nativa del primer arranque — 2026-10-01 (PARCIAL)

- Se comprobó de nuevo el instalador local `Pulsaria_0.1.0-beta.3_x64-setup.exe`: **687,986,682 bytes**, SHA-256 **`D0492C87BF868A857FB02E8FB25AF7D12F451EFEA0ABA1176D8423B7A669F989`**, `ProductVersion` `0.1.0-beta.3`. Se instaló en un perfil temporal aislado, con carpeta de descargas, datos de WebView2 y puerto API separados; el endpoint local respondió `status=ok` y `version=0.1.0-beta.3`.
- En la ventana nativa se observó el onboarding a **1280 × 800** y **860 × 640**. El diálogo legal y sus acciones visibles cupieron en ambas resoluciones. Tab mostró el foco en los controles del diálogo; la captura de 860 × 640 está en [evidence/beta3-onboarding-local-860x640.jpg](evidence/beta3-onboarding-local-860x640.jpg).
- La biblioteca temporal estaba vacía y la confirmación de derechos de contenido aparecía detrás del diálogo legal. No se marcaron casillas ni se aceptaron EULA, términos, privacidad o derechos de contenido. Por ello siguen sin probarse las pantallas tras el consentimiento, Ajustes, búsqueda, procesamiento, transcripción, indexación, reproducción, exportación y el TikTok indicado.
- La ventana de prueba se cerró sin aceptar los avisos. El resultado es **parcial y local**: no reemplaza la aceptación humana ni la instalación del artifact inmutable de Actions en un Windows x64 limpio.
