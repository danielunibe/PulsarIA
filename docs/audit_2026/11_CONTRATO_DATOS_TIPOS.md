# PULSAR EVENTIDE — AUDITORÍA 11: CONTRATO DE DATOS Y TIPOS
## Especificación de Tipos TypeScript, Structs Rust y Protocolo de Comunicación
### Referencia: docs/audit_2026/00_INDICE_MAESTRO.md | Siguiente: KILOCODE_BASE_DOCUMENT.md

---

## 1. TIPOS COMPARTIDOS TYPESCRIPT / RUST

### 1.1 `JobRecord`
```typescript
// types/index.ts
export interface JobRecord {
    id: number;
    url: string;
    status: 'queued' | 'downloading' | 'extracting_audio' | 'transcribing' | 'complete' | 'error';
    progress: number;
    created_at: string;
    title?: string;
    author?: string;
    thumbnail?: string;
    duration?: number;
    video_path?: string;
    keep_status?: 'keep' | 'online';
    platform?: 'tiktok' | 'youtube' | 'instagram' | 'generic';
}
```

```rust
// src-tauri/src/db.rs
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct JobRecord {
    pub id: i64,
    pub url: String,
    pub status: String,
    pub progress: i32,
    pub created_at: String,
    pub title: Option<String>,
    pub author: Option<String>,
    pub thumbnail: Option<String>,
    pub duration: Option<i32>,
    pub video_path: Option<String>,
    pub keep_status: Option<String>,
    pub platform: Option<String>,
}
```

### 1.2 `PlaylistRecord`
```typescript
export interface PlaylistRecord {
    id: number;
    name: string;
    description?: string;
    cover_job_id?: number;
    auto_generated: boolean;
    topic_keywords: string;
    color: string;
    created_at: string;
    item_count: number;
}
```

```rust
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct PlaylistRecord {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub cover_job_id: Option<i64>,
    pub auto_generated: bool,
    pub topic_keywords: String,
    pub color: String,
    pub created_at: String,
    pub item_count: i64,
}
```

### 1.3 `SearchResult`
```typescript
export interface SearchResult {
    job_id: number;
    title: string | null;
    thumbnail: string | null;
    chunk_text: string;
    chunk_index: number;
    similarity_score: number;
}
```

```rust
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct SearchResult {
    pub job_id: i64,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub chunk_text: String,
    pub chunk_index: i64,
    pub similarity_score: f32,
}
```

---

## 2. EVENTOS IPC TAURI

| Nombre del Evento | Emisor | Payload | Receptor |
|---|---|---|---|
| `job_progress` | `queue.rs` | `{ job: i64, step: string, progress: i32, metadata?: MediaMetadata, text?: string }` | `VideoGrid`, `QueueSection` |
| `media_indexed` | `queue.rs` | `i64` (job_id) | `VideoGrid`, `SemanticConfigPanel` |
| `job_completed_notify` | `queue.rs` | `{ title: string, job_id: i64 }` | `layout.tsx` (Toast) |

---

*Documento Maestro de Ejecución: [KILOCODE_BASE_DOCUMENT.md](KILOCODE_BASE_DOCUMENT.md)*
