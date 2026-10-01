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
| Instalación nueva y onboarding | Instalación por usuario, primer arranque y consentimiento sin herramientas de desarrollo | Pendiente |
| Biblioteca vacía / DEMO | Vacío explicado; DEMO opt-in separado de SQLite y búsqueda | Pendiente |
| 1280 × 800 / 860 × 640 | Cabecera, navegación, Ajustes y acciones visibles sin recortes que impidan uso | Pendiente |
| Teclado / foco / idioma | Acciones accesibles, foco visible y cambio persistente es-MX/en-US | Pendiente |
| URL autorizada con voz española | Job completado, audio reproducible y transcripción con palabras reconocibles | Pendiente; una repetición del worker extrajo 41.263 s de audio MP3 mono 16 kHz (media −19.0 dB, pico −6.1 dB), pero generó 0 caracteres y segmentos; no confirma si había voz |
| Actividad / fallo / reintento | Estado real, mensaje comprensible y reintento sin progreso inventado | Pendiente |
| URL inválida / duplicado | Rechazo visible; duplicado no crea otro contenido canónico | Pendiente |
| Fuente sin acceso | Error explicado sin simular descubrimiento; biblioteca conservada | Pendiente |
| Búsqueda literal / conceptual | Contenido y procedencia correctos; resultado abre el elemento esperado | Pendiente |
| Biblioteca / Playlists / Fuentes | Creación, consulta y persistencia tras reiniciar | Pendiente |
| Cinema y exportación | Controles operables; MP4/MP3/TXT y formatos de subtítulos que ofrezca el elemento se abren y corresponden al contenido | Pendiente |
| Ajustes Guardar / Cancelar | Guardar persiste; Cancelar conserva la selección anterior | Pendiente |
| Reinicio y actualización desde eval.3 | Datos, ajustes, medios y trabajos conservados sin duplicaciones | Pendiente |
| Desinstalación | La aplicación se retira y los datos de usuario siguen disponibles según el contrato | Pendiente |

El smoke TikTok se hace desde la app instalada mediante el cliente IPC autenticado. El modo `RunLive` del script legado queda bloqueado con un diagnóstico explícito: recibía un token sin transmitirlo y el token cambia tras cada arranque. El smoke offline sigue disponible. No registrar tokens ni abrir una ruta pública para obtenerlos.

## Aprobación y publicación

1. Resolver revisión legal, datos públicos y materiales de terceros; pasar CI del PR final, integrar en `main` y crear el tag aprobado.
2. Ejecutar el workflow directo desde `main`. Descargar el artifact producido por `build` y verificar sus hashes.
3. Completar esta lista con ese instalador, incluidos actualización y prueba live autorizada.
4. El revisor `danielunibe` comprueba identidad/hash, evidencia y documentos antes de habilitar `DIRECT_DOWNLOAD_RELEASE_READY=true` y aprobar el job `publish` del Environment `direct-download`. No desactivar las protecciones.
5. El job publica el mismo artifact y descarga los assets públicos para verificarlos. Si falla, registrar el fallo; no reemplazar los archivos publicados por otro build bajo el mismo tag.
6. Actualizar enlaces de README/sitio y la evidencia de cierre únicamente después de verificar la release pública. Conservar eval.3 como referencia histórica.

## Entradas aún necesarias

Por delegación del usuario, se eligió como presentación pública “Daniel Unibe”, denominación ya usada en el PR #2, y `danielunibe10@gmail.com`, correo que aparece en su perfil público de GitHub. Estos datos no acreditan identidad/titularidad legal ni control del buzón. `notice_address` se mantiene pendiente hasta recibir autorización explícita para publicar un domicilio residencial o hasta definir otro contacto postal publicable. El PR público también conserva el domicilio en un commit histórico que se retiró del árbol actual; el plan vigente prohíbe reescribir la historia y el PR no debe integrarse hasta resolver esa exposición. Siguen pendientes la revisión legal humana y la aprobación de los documentos y materiales de terceros.

El 2026-09-30 el usuario proporcionó y autorizó una URL TikTok para la prueba. Se omite el enlace concreto de esta documentación pública; debe comprobarse si contiene voz en español. Recibirlo no demuestra descarga ni transcripción.

El candidato local con hash `F1515FF7FCBA67EA90832711FE5A6FA2B43B567F7B01ACA9AF45FC69DE3CC212` fue rechazado en inspección nativa por falta de hidratación del frontend. Repetir el recorrido con el instalador corregido; ver `BETA3_RELEASE_EVIDENCE.md`.

La prueba aislada de actualización desde Eval.3 se completó después para el instalador local `55F420C9AE73685AF207CE8FA273484F249DAB5C0A9B3775B6D8A4434B2C02C1`: primer arranque Beta 3, migración SQLite, reinicio y desinstalación conservaron la biblioteca sintética, los ajustes y los archivos. La fila de aceptación final sigue pendiente porque este EXE no es el artifact de Actions y faltan WebView2 en un Windows sin herramientas de desarrollo, recorrido humano de la ventana instalada y el procesamiento TikTok desde IPC nativo.

El 2026-10-01 se reconstruyó un candidato local después de actualizar `THIRD_PARTY_NOTICES.md`: `Pulsaria_0.1.0-beta.3_x64-setup.exe`, 687,973,984 bytes, SHA-256 `CE0FB3D98C5B12B44377CE912E5ED776160473419C8CA3D3799FF376D88E51CE`, Authenticode `NotSigned`. `verify:installed` pasó en modo offline: instalación/desinstalación exit 0, runtime 54/54, 13 documentos legales, salud antes/después de reinicio y conservación del marcador de datos aislados. Este archivo local no es el artifact de Actions. La aceptación de UI, WebView2 en Windows limpio, TikTok por IPC, actualización desde Eval.3 y aprobación humana sigue pendiente para el EXE definitivo.
