# Pulsaria — estado Beta 4

Actualizado: 2026-10-12. El estado normativo y la evidencia más reciente están
en [PROJECT_TRUTH.md](../PROJECT_TRUTH.md).

## Preparación técnica

- Candidato: `0.1.0-beta.4`, rama local `codex/pulsaria-beta4-prep`, basada en
  `d743d1d5d06f1f43fc49eb0f3c672149b9ce5d91`.
- La CI de GitHub para el commit base pasó en [run 37821192428](https://github.com/danielunibe/PulsarIA/actions/runs/37821192428).
- Contrato de versión y estructura canónica en la rama candidata: PASS.
- Gate estructural de materiales para candidato: PASS. No significa aprobación
  legal para publicar.
- MVP local después de reparar Perfiles: **PASS 13/13**, 282 pruebas Rust ejecutadas y seis ignoradas;
  31 pruebas Python PASS y una live omitida. Las dos pruebas de inferencia real
  se ejecutaron aisladas.
- Regresiones de frontend, perfiles y release: 25 casos Node y 23 PowerShell PASS. Se corrigieron
  selección y protección del instalador, staging, BOM, hashing y desinstalación
  del bootstrap; ver [evidencia](./BETA4_REPAIR_EVIDENCE.md).
- Perfiles: registro sin descarga, consulta limitada y explícita, referencias
  sin job cuando se desactiva descarga automática, selección perfil/canal hacia
  biblioteca, conteos persistidos y estados reales. Se conservan pausa,
  configuración duplicada y borradores durante el gate de derechos. Evidencia:
  [reparación de Perfiles](./BETA4_PROFILE_REPAIR_EVIDENCE.md).
- Runtime 54/54, SPDX agregado, materiales del candidato y auditoría npm de
  producción: PASS; cero vulnerabilidades de producción.
- NSIS anterior a la reparación de Perfiles: **PASS build**. El archivo mide 692,197,765 bytes,
  SHA-256 `01C0A3282D4447B03D75A1E82EAA627FFAFB48F181F8D4352353E752A83607A6`,
  sin Authenticode. El ejecutable Release pasó arranque/reinicio con datos
  temporales, API protegida y SQLite íntegra. El smoke instalado y la aceptación
  visual del artifact final siguen pendientes.
- Pruebas del gate de contacto: 7/7 PASS. La prueba de publicación completa
  queda **BLOCKED** mientras `public_contact_review_status` sea `pending`.
- La siguiente verificación de CI se ejecutará sobre la rama con todos los
  cambios de Beta 4.

## Gates externos pendientes

| Gate | Estado | Evidencia necesaria |
| --- | --- | --- |
| TikTok desde UI/IPC | BLOCKED_EXTERNAL | URL autorizada con voz clara en español y transcripción reconocible en la app instalada |
| Instalador NSIS exacto | PENDIENTE | Artifact de Actions, nombre, tamaño, SHA-256, run ID y artifact ID |
| Host Windows limpio | PENDIENTE | Instalación nueva, upgrade desde Eval.3, reinicio y desinstalación con datos sintéticos |
| Aceptación humana nativa | PENDIENTE | Recorrido a 1280×800 y 860×640, teclado, foco, actividad, biblioteca, búsqueda, Cinema y exportación |
| Contacto y revisión legal | BLOCKED_EXTERNAL | Aprobación externa de nombre, ciudad y correo como método de notificación; no se publica domicilio postal |
| Materiales/licencias del artifact | PENDIENTE | Revisión del SBOM, avisos y fuentes/build de terceros ligados al candidato exacto |
| Publicación en GitHub | BLOCKED | Aprobación del hash exacto, revisión del Environment y `DIRECT_DOWNLOAD_RELEASE_READY=true` |

La descarga pública permanece en Eval.3 hasta cerrar estos gates. No se ha
creado un tag Beta 4 ni publicado un instalador candidato. El NSIS local y su
smoke técnico se registran en [evidencia](./BETA4_REPAIR_EVIDENCE.md) y no sustituyen
el artifact de Actions. El perfil personal de
AppData está fuera de alcance y no se ha tocado.

## Evidencia Beta 3

La aceptación y los builds locales de Beta 3 se conservaron en
[`docs/archive/beta3/`](archive/beta3/); son antecedentes, no pruebas de Beta 4.
