# Next 16 / PostCSS — resultado de la migración aislada

## Alcance

La prueba se ejecutó en el worktree externo:

```text
C:\Users\danie\Desktop\Pulsaria-next16-security-migration
```

Rama: `codex/next16-security-migration`  
Base: `b95a971c` (`chore: checkpoint pre-stabilization workspace`)

La base no contiene los cambios no confirmados de la estabilización actual. Por seguridad no se copió el worktree sucio ni se modificó la rama `codex/pulsaria-mvp-stabilization`. Esta diferencia impide promover automáticamente la rama experimental como reemplazo de la estable.

## Cambios probados en la rama aislada

- `next` `16.3.5`;
- `@next/eslint-plugin-next` `16.3.5`;
- `eslint-config-next` `16.3.5` para conservar el preset de lint del checkpoint;
- `postcss` `8.5.28`;
- `@next/swc-win32-x64-msvc` `16.3.5`;
- override compatible de `qs` `6.16.0` para eliminar la vulnerabilidad transitoria restante;
- eliminación de `eslint` desde `next.config.ts`, porque Next 16 ya no acepta esa propiedad;
- actualización automática de `tsconfig.json` de Next 16 (`jsx: react-jsx` y `.next/dev/types`).

La corrección de dependencias se hizo con `npm audit fix` sin `--force` y un override compatible en la rama aislada. No se trasladó a la rama estable.

## Evidencia

| Gate | Resultado | Observación |
|---|---|---|
| `npm run lint` | PASS | ESLint terminó sin errores |
| `npx tsc --noEmit` | PASS | TypeScript terminó sin errores |
| `npm run build` | PASS | Next 16.3.5 generó export estático `/` y `/_not-found` |
| `npm audit --omit=dev` | PASS | 0 vulnerabilidades después de la corrección no forzada |
| `cargo check` | BLOCKED | El checkpoint no contiene `src-tauri/resources/bin`, requerido por `tauri.conf.json` |
| `cargo test` | BLOCKED | No se ejecutó después del fallo de build del checkpoint |
| `npm run verify:mvp` | BLOCKED | El script todavía no existe en el checkpoint base |
| `npm run verify:installed` | BLOCKED | El script y los artefactos instalados pertenecen a la estabilización no confirmada |

## Decisión

La migración demuestra que Next 16.3.5 conserva la compilación/exportación frontend tras retirar la opción `eslint`, pero no es todavía un candidato AAA. El audit cero de esa rama no es equivalente al audit de la estabilización vigente porque el punto de partida, dependencias y recursos empaquetados son distintos.

Para promoverla se necesita un checkpoint limpio que incluya la estabilización vigente, repetir la migración sobre ese checkpoint y obtener PASS en `npm run verify:mvp`, `cargo check`, `cargo test`, `npm run build`, `npm audit --omit=dev` y `npm run verify:installed`. No se debe hacer merge ni reemplazar Next 15.5.25 en estable hasta entonces.
