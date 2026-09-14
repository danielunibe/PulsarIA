# Pulsaria

Pulsaria es un MVP local-first para Windows que procesa contenido audiovisual
autorizado, genera transcripciones y análisis local, e indexa la biblioteca
para búsqueda literal y semántica.

La definición técnica y operativa vigente está en
[PROJECT_TRUTH.md](PROJECT_TRUTH.md). Ese documento define la arquitectura
canónica, el runtime externo, los gates, las ramas, los artefactos y el orden
de evolución. Este README no duplica esas decisiones.

## Fuente canónica y distribución

`main` es la única línea activa. Las ramas antiguas se conservan como
referencia histórica y no se utilizan para publicar. La operación de
consolidación está documentada en [docs/CANONICAL_BASE.md](docs/CANONICAL_BASE.md).

La página pública de descargas se publica desde `website/` mediante GitHub
Pages. Los instaladores y sus firmas se distribuyen mediante GitHub Releases;
el updater de escritorio usa únicamente releases firmadas, nunca una rama o
un archivo del árbol fuente.

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

## Releases Windows

La release estable recomendada se publica en
<https://github.com/danielunibe/PulsarIA/releases/latest>. El canal RC es para
pruebas previas y no debe usarse como biblioteca principal sin un respaldo.
