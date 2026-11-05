# Checkout freeze — 2026-09-13

## Authority

- Checkout de implementación: `codex/pulsaria-mvp-stabilization`.
- Punta observada al iniciar la consolidación: `b95a971c55fec741e231d45e94314f8a13702820`.
- Remoto: `https://github.com/danielunibe/PulsarIA.git`.
- Punta previa de `main`: `2c5725134b77be9c4c229ec4f2be79f392f77d75`.
- No se ejecutaron `reset`, `clean`, `checkout --`, force push ni reescritura.

## Inventario congelado

Al iniciar había 211 entradas locales de Git, 66 rutas no trackeadas y
aproximadamente 709 MB de contenido no trackeado. También existían recursos
generados y datos locales fuera de la fuente funcional: `src-tauri/resources`
(aprox. 5.144 archivos y 1,09 GB), `data/` y `target-tauri/`. Estos datos no
se consideran código canónico ni se eliminan automáticamente.

La copia de seguridad verificable está fuera del repositorio en:

```text
C:\Users\danie\AppData\Local\Temp\Pulsaria-freeze-20260913-0130
```

Incluye `working-tree.diff`, `untracked-files.zip`, inventarios de rutas,
referencias Git, y copias de las raíces de modelos retiradas. Los hashes
registrados en `SHA256SUMS.txt` incluyen:

- `working-tree.diff`: `1BF40E263F8E482C90ED814379D10AE6F7F82EE6099204942105C5AFE624D47B`
- `untracked-files.zip`: `D0E2A18854E1C6DBCB338F40041ADADD249E06BB47BDBD917E94729FEBA58D46`

Los cambios eliminados del índice corresponden a runtime/modelos generados o
copias funcionales duplicadas; sus archivos físicos aprobados se conservaron
para las pruebas locales y/o en el respaldo.

## Ramas auditadas

`chestnut-dugout` tenía dos commits exclusivos: `9447a3e7` (pipeline metadata)
y `a662fa74` (gitignore/modelos). Se revisaron con `git show` y `git patch-id
--stable`. El primer cambio ya está representado por contratos posteriores del
checkout actual; el segundo introduce precisamente copias que la política
canónica elimina. Por eso no se hizo cherry-pick duplicado.

Las ramas `master`, `chestnut-dugout`, `codex/next16-security-migration`,
`codex/pulsaria-mvp-stabilization`, `feat/frontend-integration` y la punta
previa de `main` se mantienen intactas y recibirán tags `archive/*` antes de la
publicación.

## Clasificación

| Clase | Política |
| --- | --- |
| Código funcional | Se conserva en las rutas canónicas de `PROJECT_TRUTH.md`. |
| Runtime, modelos y binarios | Se conserva localmente como staging; se retira del índice y se prepara como artefacto externo. |
| Datos, logs y caches | Permanecen locales, ignorados y fuera del historial. |
| Documentación normativa | Solo `PROJECT_TRUTH.md`. |
| Legal | Se conserva separado por obligación funcional. |
| Auditorías/planes/reportes | Históricos; catalogados en `docs/archive/README.md`. |
