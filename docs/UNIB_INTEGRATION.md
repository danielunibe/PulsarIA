# Documentación de Integración UNIB — Pulsar Eventide

## 1. ¿Qué es UNIB?

UNIB (Universal Neural Identity Binding) es un **formato experimental de memoria semántica textual** diseñado para asistentes de IA personales. A diferencia de lo que podría inferirse, UNIB **NO es un gestor multimedia**, ni un contenedor de videos, ni un sistema de organización de archivos binarios.

UNIB Core v0.0 define:
- Un formato de texto plano `.unib` (no `.unibe`, que es un nombre histórico del brainstorming)
- Sintaxis de triples semánticos: `subject > relation > object`
- Sistema de pesos: `?` (confidence/confianza), `!` (importance/importancia)
- Metadata key-value: `{st:confirmed;privacy:0}`
- Fuente de dato: `^user`, `^chat`, `^inferred`, `^system`, `^doc`

## 2. ¿Qué NO es UNIB?

- NO es un contenedor de video/audio/imagen
- NO almacena archivos binarios
- NO es una base de datos multimedia
- NO es un reemplazo del modelo de datos de Pulsar
- NO define entidades de video, playlist, creator, tag, asset

## 3. Arquitectura de Integración

```
┌─────────────────────────────────────────────────────────────┐
│                    PULSAR EVENTIDE                          │
│  (Dueño del dominio multimedia)                             │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Downloader  │  │   Library   │  │   Metadata DB        │  │
│  │ (videos)    │  │ (filesystem)│  │ (SQLite)             │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘  │
│         │                │                                   │
│         ▼                ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              PulsarSemanticLayer (Adapter)              │ │
│  │  Traduce: Video/Playlist/Asset → Entidades UNIB         │ │
│  └────────────────────────┬────────────────────────────────┘ │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              UNIB Representation (.unib)                │ │
│  │  - Índice semántico portable                            │ │
│  │  - Referencias a assets (NO contiene los archivos)      │ │
│  │  - Triples: video:1 > downloaded_from > source:tiktok   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 4. Entidades Semanticas

| Entidad | Propósito | Ejemplo ID |
|---------|-----------|------------|
| `asset` | Archivo binario (video, audio) | `asset:1` |
| `video` | Recurso de video | `video:1` |
| `audio` | Recurso de audio | `audio:1` |
| `image` | Thumbnail/imagen | `image:1` |
| `source` | Fuente externa (URL, plataforma) | `source:a1b2c3` |
| `creator` | Autor/creador | `creator:a1b2c3` |
| `tag` | Etiqueta semántica | `tag:rust` |
| `playlist` | Playlist de Pulsar | `playlist:10` |
| `collection` | Colección semántica | `collection:design` |
| `thumbnail` | Thumbnail asociado | `thumbnail:1` |
| `transcript` | Transcripción de audio | `transcript:1` |
| `project` | Proyecto/ámbito | `project:pulsar` |

## 5. Relaciones

| Relación | Subject | Object | Descripción |
|----------|---------|--------|-------------|
| `uploaded_by` | video | creator | Video subido por creador |
| `downloaded_from` | video | source | Video descargado de fuente |
| `tagged_with` | video/media | tag | Etiqueta semántica aplicada |
| `part_of_playlist` | video | playlist | Video pertenece a playlist |
| `part_of_collection` | video/playlist | collection | Pertenece a colección |
| `contains_media` | playlist/collection | video | Contiene recurso |
| `references_asset` | video | asset | Referencia al archivo binario |
| `has_thumbnail` | video | thumbnail | Thumbnail asociado |
| `has_transcript` | video | transcript | Transcripción asociada |
| `has_duration` | video | literal | Duración en segundos |
| `published_at` | video | event | Fecha de publicación |
| `related_to` | cualquiera | cualquiera | Relación débil |
| `similar_to` | video | video | Similitud semántica |

## 6. Pesos Semánticos

| Peso | Símbolo | Rango | Uso |
|------|---------|-------|-----|
| Confidence | `?` | 0.0 - 1.0 | Certeza del dato |
| Importance | `!` | 0.0 - 1.0 | Prioridad operativa |
| Emotional Affinity | `~e` | -1.0 - 1.0 | Cercanía emocional |
| Active Attitude | `~a` | -1.0 - 1.0 | Actitud contextual |

## 7. Estructura Física de .unib

```
.unib
├── Headers
│   ├── @unib:0.0
│   ├── @owner:@user:h
│   ├── @lang:es
│   ├── @mode:media
│   └── @created:2026-08-22
└── Memories (una por línea)
    └── [V#media] @video_1:video > downloaded_from > @source_tiktok:source ?0.99 !0.8 {st:confirmed} ^user.
```

**Reglas:**
- Una memoria por línea
- Termina con punto `.` obligatorio
- Comentarios con `//`
- Líneas vacías ignoradas
- Headers con `@` al inicio

## 8. Flujo de Creación

```text
URL TikTok
    ↓
Pulsar Downloader
    ↓
video.mp4 (en filesystem)
    ↓
Metadata Extractor (yt-dlp + Whisper)
    ↓
Pulsar Media Entity (SQLite)
    ↓
Semantic Adapter (UnibAdapter)
    ↓
Entidades UNIB + Triples
    ↓
UNIB Serializer
    ↓
.unib (índice semántico)
    ↓
Semantic Storage (library/semantic/video-1.unib)
```

## 9. Flujo de Importación

```text
.unib
    ↓
UNIB Parser
    ↓
UNIB Validator
    ↓
Semantic Graph (entidades + triples)
    ↓
Semantic Index
    ↓
Pulsar Library (referencias)
```

## 10. Asset Strategy

**Los archivos multimedia NUNCA se almacenan dentro de .unib.**

Estrategia:
- `.unib` contiene solo referencias semánticas
- Assets permanecen en `library/videos/`, `library/audio/`, `library/thumbnails/`
- Referencia por `assetId` y `path` relativo
- Checksum para integridad

## 11. Compatibilidad

- Formato: UNIB v0.0 Draft
- Extensión oficial: `.unib`
- Extensión aceptada por compatibilidad: `.unibe`
- Codificación: UTF-8
- Fin de línea: LF o CRLF

## 12. Limitaciones

- UNIB Core v0.0 es experimental, no productivo
- No hay empaquetado oficial (setup.py, pyproject.toml)
- No hay soporte multimedia nativo
- No hay API REST/GraphQL
- Parser es síncrono y en memoria
- No hay streaming ni procesamiento distribuido

## 13. Componentes Reutilizados de UNIB Core

- Regex de parsing de memoria
- Validación de entidades y pesos
- Sistema de metadata key-value
- Máquina de estados (confirmed, candidate, etc.)
- Cálculo de score

## 14. Componentes Nuevos en Pulsar

- UnibAdapter (mapeo Pulsar → UNIB)
- SemanticStorage (persistencia en filesystem)
- SemanticIndex (índice en memoria)
- SemanticPipeline (flujo completo)
- Entidades multimedia (video, asset, source, creator, tag, playlist)
- Relaciones multimedia (uploaded_by, downloaded_from, tagged_with, etc.)

## 15. Rollback

Para deshabilitar la capa semántica:
1. Eliminar carpeta `semantic/`
2. Eliminar imports de `semantic/` en el codebase
3. Pulsar continúa funcionando sin la capa semántica (additive, no invasivo)

## 16. Próximos Pasos

1. Integrar `SemanticPipeline` en el flujo de descarga de Pulsar
2. Agregar UI para visualizar semantic info en `ExpandedVideoModal`
3. Implementar comando Tauri `export_semantic` / `import_semantic`
4. Agregar `semantic/` a `.gitignore` si se desea excluir índices locales
