# Pulsaria — base canónica

Este documento define cómo mantener una sola fuente funcional para Pulsaria.
La autoridad técnica sigue siendo `PROJECT_TRUTH.md`; este archivo describe la
operación diaria de consolidación.

## Línea activa

`main` es la única rama que recibe desarrollo nuevo y la única base aceptable
para una release. Las ramas históricas y experimentales se conservan como
referencia, pero no son fuentes activas ni se deben usar para publicar.

No se borran ramas ni se reescribe la historia para lograr esta política. Una
limpieza futura de referencias remotas requiere una revisión independiente.

## Fuentes funcionales

| Área | Fuente única |
| --- | --- |
| Interfaz | `app/`, `components/`, `hooks/`, `lib/`, `types/` |
| Tauri/Rust | `src-tauri/src/` |
| Workers | `python-workers/` |
| Semántica | `semantic/` |
| SDK | `sdk/typescript/` |
| Runtime de distribución | Preparado externamente bajo `src-tauri/resources/` |

Los workers y modelos del runtime son artefactos derivados o de release. No se
deben editar dentro de `src-tauri/resources/` ni duplicar bajo otra raíz.

## Antes de integrar cambios

```powershell
git status --short --branch
npm run verify:canonical
git diff --check
```

Clasifica cada modificación local antes de crear el commit. Conserva cambios
del usuario y elimina únicamente duplicados confirmados por comparación de
contenido y consumidores reales.

## Gate de publicación

Una clonación limpia de `main` debe pasar el verificador canónico, los gates de
frontend/Rust/Python y el smoke de instalación antes de crear un tag. Los
artefactos generados, firmas y runtime externo no se convierten en fuentes del
repositorio.
