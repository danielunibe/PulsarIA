# Instalar Pulsaria en Windows

Pulsaria es una beta para Windows x64. Descarga siempre desde la
[página oficial de GitHub Releases](https://github.com/danielunibe/PulsarIA/releases)
y verifica el SHA-256 publicado con el mismo archivo.

## Descarga pública actual: Eval.3

La versión pública verificada es `v0.1.0-eval.3`:

- [Instalador NSIS (.exe)](https://github.com/danielunibe/PulsarIA/releases/download/v0.1.0-eval.3/Pulsaria_0.1.0_x64-setup.exe)
- [Instalador MSI](https://github.com/danielunibe/PulsarIA/releases/download/v0.1.0-eval.3/Pulsaria_0.1.0_x64_en-US.msi)

En PowerShell, compara los archivos descargados con `SHA256SUMS.txt` de esa
release:

```powershell
Get-FileHash .\Pulsaria_0.1.0_x64-setup.exe -Algorithm SHA256
Get-FileHash .\Pulsaria_0.1.0_x64_en-US.msi -Algorithm SHA256
```

```text
NSIS: 1ABD7589C2E8943AEFC1AC8484B2133312D54C18F58BA306DC869031FB9551EF
MSI:  F092CDFA6DC736F13FEF8B17302B81E1BB181796639D68676F7244154DDCB2F4
```

1. Ejecuta el `.exe` o `.msi` que descargaste de la release oficial.
2. Sigue el instalador y abre Pulsaria desde el acceso creado.
3. Lee y acepta los avisos que aparecen en el primer inicio antes de importar
   contenido.

No se requieren Node.js, Rust, Python, FFmpeg ni FFprobe globales. El instalador
incluye los recursos de runtime aprobados para esta versión. Windows puede
mostrar SmartScreen porque Eval.3 no está firmada con Authenticode.

## Beta 4

`0.1.0-beta.4` está en preparación y todavía no tiene una descarga pública. Al
publicarse, su instalador NSIS `.exe`, hashes, SBOM y procedencia estarán juntos
en la página de esa release. No ejecutes un build local o un artifact candidato
de Actions como si fuera el instalador público aprobado. Consulta las [notas de
Beta 4](BETA4_RELEASE_NOTES.md) y su [aceptación](BETA4_ACCEPTANCE.md).

## Datos y uso responsable

Haz respaldo de los datos que quieras conservar antes de actualizar. Las pruebas
de Beta 4 se realizan con una biblioteca sintética y no deben modificar una
biblioteca personal. Procesa únicamente contenido propio o para el que tengas
autorización; el acceso a fuentes depende de la plataforma y de tu sesión.

Más información: [privacidad](../PRIVACY.es.md), [contenido](../CONTENT_POLICY.es.md),
[términos](../TERMS_OF_USE.es.md) y [EULA](../EULA.es.md).
