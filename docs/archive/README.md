# Archivo histórico de documentación

`PROJECT_TRUTH.md` es la única autoridad técnica y operativa actual. Los
documentos de este archivo conservan investigación, especificaciones, auditorías
y evidencias anteriores; no describen por sí solos las funciones ni el estado
de la descarga actual.

## Organización

- [`beta3/`](beta3/) conserva aceptación, notas, reportes y evidencia de builds
  locales de Beta 3. Ningún hash de esa carpeta identifica el candidato Beta 4.
- [`internal-2026/`](internal-2026/) conserva auditorías, planes, informes,
  experimentos y documentación de implementación anteriores.
- `internal-2026/audit_2026/` y `internal-2026/audits/` guardan los ciclos de
  auditoría y planes de fases reemplazados.

## Registro de archivo — 2026-10-09

Durante la preparación de Beta 4 se movieron, sin borrar su contenido ni su
historial, las auditorías y reportes internos obsoletos que antes aparecían en
`docs/`, junto con el expediente Beta 3. Sus nombres se conservaron para que
Git registre cada movimiento y los enlaces locales se actualizaron donde fue
posible. Punto de partida: `d743d1d5d06f1f43fc49eb0f3c672149b9ce5d91`.

Los documentos legales (`LICENSE`, EULA, privacidad, política de contenido,
copyright/takedown y avisos de terceros) permanecen en sus ubicaciones vigentes:
son avisos de producto, no reportes históricos. Los recursos de compilación,
código, assets y trazabilidad tampoco se eliminaron.

Los documentos archivados solo deben cambiar para corregir referencias
históricas o preservar evidencia. Si un informe contradice código, pruebas
reproducidas o `PROJECT_TRUTH.md`, prevalece el estado actual.
