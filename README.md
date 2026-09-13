# Pulsaria

Pulsaria es un MVP local-first para Windows que procesa contenido audiovisual
autorizado, genera transcripciones y análisis local, e indexa la biblioteca
para búsqueda literal y semántica.

La definición técnica y operativa vigente está en
[PROJECT_TRUTH.md](PROJECT_TRUTH.md). Ese documento define la arquitectura
canónica, el runtime externo, los gates, las ramas, los artefactos y el orden
de evolución. Este README no duplica esas decisiones.

## Inicio rápido

Requisitos: Node.js 20+, Rust/Cargo y Python 3.10+.

```powershell
npm install
pip install -r python-workers/requirements.txt
npm run tauri dev
```

Para build instalada se requiere preparar primero el runtime externo con
`scripts/prepare-runtime.ps1`. No se aceptan ejecutables descubiertos por
`PATH` como sustituto del runtime aprobado.

## Validación

```powershell
npm run verify:mvp
npm run verify:canonical
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:python
```

El alcance legal y las condiciones de uso se encuentran en `LICENSE`, los
documentos EULA/privacidad, `CONTENT_POLICY.es.md` y
`THIRD_PARTY_NOTICES.md`.
