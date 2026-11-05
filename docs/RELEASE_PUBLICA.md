# Procedimiento de release público

Este runbook describe el proceso protegido para crear y publicar una versión
prerelease de Pulsaria. No concede aprobación legal ni de producto. La versión
pública actual y el estado real de los gates están en el README y
[`PROJECT_TRUTH.md`](../PROJECT_TRUTH.md).

## Estado de Beta 4

`v0.1.0-beta.4` es una candidata en preparación. Después de integrar y validar
su fuente en `main`, se puede crear el tag y despachar el workflow para construir
y conservar el candidato de Actions. El build usa el gate de materiales
`-CandidateOnly`, incluida la preparación de sus activos; admite la revisión de
contacto pendiente. La publicación queda detenida por el Environment protegido
y el gate público de contacto. La variable de GitHub
`DIRECT_DOWNLOAD_RELEASE_READY` debe permanecer `false` hasta que el hash exacto
haya pasado los casos de [`BETA4_ACCEPTANCE.md`](./BETA4_ACCEPTANCE.md) y las
aprobaciones requeridas estén registradas.

## Secuencia protegida

1. Integrar en `main` el código, la versión coordinada, las notas, los avisos
   legales y el plan de aceptación revisados. Confirmar CI verde sobre el
   commit final y un árbol de trabajo limpio. Registrar la aceptación del
   instalador cuando el build produzca el candidato exacto.
2. Completar los gates automatizados del workflow
   [`direct-download-release.yml`](../.github/workflows/direct-download-release.yml):
   versiones, runtime fijado, accesibilidad, iconos, SPDX/SBOM, avisos de
   terceros, revisión legal de materiales, modelo local, MVP, API y auditoría
   de dependencias.
3. Crear en `main` el tag anotado de la versión revisada, por ejemplo
   `v0.1.0-beta.4`. El tag debe apuntar a un commit ya integrado y coincidir con
   la versión de todos los manifiestos.
4. Despachar el workflow protegido desde `main` con
   `DIRECT_DOWNLOAD_RELEASE_READY=false`. Conservar el artefacto de Actions con
   su ID, ejecución, commit y hashes; instalar y aceptar ese mismo artefacto en
   el host Windows x64 limpio. El job `publish` permanece a la espera de la
   revisión del Environment. No reconstruir después de aprobarlo.
5. Registrar la revisión legal y las aprobaciones humanas para el hash exacto.
   Solo entonces, el responsable autorizado cambia
   `DIRECT_DOWNLOAD_RELEASE_READY` a `true` y aprueba el Environment
   `direct-download`.
6. El job de publicación vuelve a verificar el tag, el commit, la aprobación y
   los activos descargados por ID. Publica una GitHub prerelease con el
   instalador NSIS `.exe`, `SHA256SUMS.txt`, SBOM SPDX, avisos de terceros y
   procedencia. No reconstruye el instalador.
7. Descargar los activos publicados y verificar sus hashes contra el artefacto
   aceptado. Confirmar en GitHub que título, notas, versión y activos coinciden
   exactamente con el candidato aprobado. Después se puede volver a
   `DIRECT_DOWNLOAD_RELEASE_READY=false`.

## Comprobaciones manuales del artefacto

- Ejecutar instalación nueva y actualización desde Eval.3 con datos sintéticos
  en un perfil de Windows aislado.
- Para el smoke automatizado de instalación nueva, usar una cuenta o VM sin
  Pulsaria registrada y pasar `-InstallerPath` y `-ExpectedSha256` del candidato.
  El script rechaza instalaciones existentes antes de instalar o desinstalar;
  un directorio temporal por sí solo no aísla el registro ni los accesos de NSIS.
- La revisión del contacto debe figurar aprobada en la fuente del candidato
  final publicable. Un candidato con contacto pendiente sirve para ensayo y
  revisión. Si el manifiesto cambia tras construirlo, se genera otro artefacto
  y se repite su aceptación; no se modifica el tag ni se reutiliza un hash
  aceptado de una fuente anterior.
- Completar los casos de interfaz, teclado, idioma, ingestión, errores y
  reintentos, búsqueda, biblioteca, playlists, Cinema, exportación, ajustes,
  reinicio y preservación de datos definidos en
  [`BETA4_ACCEPTANCE.md`](./BETA4_ACCEPTANCE.md).
- Registrar la URL de prueba autorizada, el entorno, el resultado, la hora,
  el ID de ejecución, el commit del tag y el SHA-256 del `.exe`. No incluir
  biblioteca personal, AppData ni medios privados en la evidencia pública.
- Inspeccionar el `.exe` en un Windows x64 limpio sin herramientas de
  desarrollo globales. Confirmar que la publicación describe con claridad que
  el instalador beta no incluye Authenticode ni actualizaciones automáticas.

## Recuperación y límites

- Si cambia el código fuente, se reconstruye el artefacto, o difiere cualquier
  hash, invalidar la aceptación previa y repetir las comprobaciones sobre el
  nuevo artefacto inmutable.
- Si falla un gate, no crear la release pública. Corregir la causa en código o
  materiales, repetir el pipeline y registrar nueva evidencia.
- No omitir las aprobaciones del Environment, la revisión legal, la aceptación
  humana del artefacto, el control de `DIRECT_DOWNLOAD_RELEASE_READY` ni la
  verificación final de los activos públicos.
- La publicación es una prerelease gratuita. No etiquetarla como estable,
  firmada, compatible con descarga irrestricta de plataformas ni provista de
  updater público.
