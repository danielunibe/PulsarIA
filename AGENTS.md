# Pulsaria — Agent Guide

> Fuente normativa: [PROJECT_TRUTH.md](PROJECT_TRUTH.md). Este archivo solo
> contiene orientación operativa subordinada y no define otra arquitectura.

## Purpose

This document helps AI agents work efficiently in the Pulsaria codebase by providing scoped context, clear boundaries, and fast validation paths.

## Project Structure

```
Pulsaria/
├── src-tauri/           ← Rust + Tauri 2 backend
│   ├── src/
│   │   ├── main.rs      ← Composition root, startup, window and IPC wiring (~767 LOC)
│   │   ├── commands.rs  ← All #[tauri::command] IPC handlers
│   │   ├── db.rs        ← SQLite schema & queries
│   │   ├── domain/      ← Pure domain models & ports
│   │   ├── application/ ← Use cases & orchestration
│   │   ├── infrastructure/ ← External adapters (Python, vector index, OS/runtime)
│   │   ├── api/         ← REST API gateway
│   │   └── ...
│   └── Cargo.toml
├── app/                 ← Next.js 16.3.8 frontend
│   ├── page.tsx         ← Main dashboard
│   ├── components/      ← React components
│   ├── hooks/           ← Custom hooks
│   └── lib/             ← Utilities & contexts
├── python-workers/      ← Python pipeline (yt-dlp, whisper, ffmpeg)
├── semantic/            ← TypeScript UNIB semantic layer
├── sdk/typescript/      ← @pulsar/client SDK
└── PROJECT.manifest.json ← Machine-readable project map
```

## Domain Boundaries

| Domain | Path | Responsibility |
|--------|------|----------------|
| ingestion | `commands.rs` | URL validation, job creation, collection expansion |
| processing | `application/queue_service.rs` | Worker pool, retries, circuit breaker |
| transcription | `infrastructure/workers/python_runner.rs` | Python subprocess management |
| indexing | `application/search_service.rs` | Embeddings, HNSW, BM25, reranker |
| library | `db.rs` | SQLite persistence, migrations, queries |

## Dependency Rules

```
UI (Next.js)
  ↓
Commands (Tauri IPC)
  ↓
Application (use cases)
  ↓
Domain (models, ports)
  ↓
Infrastructure (DB, Python, Redis, HNSW)
```

**NO** cross-domain imports. UI cannot import infrastructure directly.

## Key Contracts

| Contract | Location | Purpose |
|----------|----------|---------|
| `JobRepository` | `domain/ports.rs` | Persistence abstraction |
| `EmbeddingEngine` | `domain/ports.rs` | Embedding generation |
| `VectorIndex` | `domain/ports.rs` | Vector search abstraction |
| `JobMessage` | `domain/models.rs` | Work unit for queue |

## Fast Validation

```bash
# Rust only
cargo check --manifest-path src-tauri/Cargo.toml

# Frontend only
npm run build

# Full stack (run from repository root)
cargo check --manifest-path src-tauri/Cargo.toml && npm run build
```

## Common Tasks

### Add a new Tauri command
1. Add function to `src-tauri/src/commands.rs` with `#[tauri::command]`
2. Add to `invoke_handler` list in `main.rs`
3. Call from frontend via `invoke('command_name', args)`

### Modify database schema
1. Edit `src-tauri/src/db.rs` `init_db()` function
2. Add ALTER TABLE migrations for existing databases
3. Add query functions as needed

### Modify worker pipeline
1. Edit `python-workers/main.py` or submodules
2. Update `PythonWorker::run_pipeline` in `infrastructure/workers/python_runner.rs`
3. Update `ProgressEvent` parsing if event schema changes

## Anti-patterns

- **DON'T** add new `#[tauri::command]` functions to `main.rs` — use `commands.rs`
- **DON'T** create circular imports between application and infrastructure
- **DON'T** define domain types in multiple places — use `domain/models.rs`
- **DON'T** access `rusqlite::Connection` directly from UI components
- **DON'T** hardcode ports/paths — use `data_dir_path()` or env vars

## Large Modules (Snapshot: 2026-09-28; avoid expanding)

| Module | LOC | Why Critical |
|--------|-----|--------------|
| `main.rs` | ~767 | Startup and Tauri composition — keep business logic in application services |
| `commands.rs` | ~5451 | IPC command adapters — keep workflows in application services |
| `db.rs` | ~7583 | SQLite schema, migrations, and queries — split only with clear ownership |
| `application/queue_service.rs` | ~1433 | Queue orchestration — keep worker-specific details behind infrastructure ports |

## Circular Dependencies (Fixed)

| Before | After |
|--------|-------|
| `queue_service.rs` ↔ `python_runner.rs` | `JobMessage` moved to `domain/models.rs` |


## Design Gate

Pulsaria enforces a Design Gate before every major release. The gate uses the Apple Design skill at .agents/skills/apple-design/ as the authoritative auditor. Apple's Human Interface Guidelines (123 pages) are the benchmark; Pulsaria's own design system is the product identity.

### Skill location and references

- **Skill root**: .agents/skills/apple-design/
- **Skill file**: SKILL.md — five-lens audit process (accessibility, platform conventions, visual design & craft, interaction, content/writing)
- **References**: references/hig/*.md (123 pages), references/hig-lookup.md, references/cross-platform.md
- **Design system**: docs/design-system/PULSARIA_DESIGN_SYSTEM.md

### Commands

- **Audit**: .kilo/command/apple-design-review.md
- **Improve**: .kilo/command/apple-design-improve.md

### Workflow

1. **Trigger**: Run apple-design-review against any UI artifact (screenshot, mockup, wireframe, or frontend code).
2. **Audit**: Agent loads the skill in READ-ONLY mode, walks the five lenses, and produces a report with Summary, Critical, Improvements, Craft notes, What works, Platform notes.
3. **Findings**: Report uses severity tags (Critical / High / Medium / Low) and cites specific HIG files and headings.
4. **Approval**: User reviews and approves findings. No code changes are made during the audit.
5. **Implement**: User approves findings, then agent runs apple-design-improve to produce a concrete, sequenced plan (accessibility → conventions → craft → polish).
6. **Execute**: Only after user approval of the improvement plan does the agent modify source code.

### Important rules

- **Skill is an auditor, not an auto-modifier**. The skill inspects and reports; it does not write code.
- **HIG is Apple's authority**, but Pulsaria's design system is the product identity. When guidelines collide with product intent, name the trade-off and recommend.
- **Do not modify skill files**. .agents/skills/apple-design/ is tracked but must remain read-only during reviews.
- **Do not modify source code during audits**. All changes happen only after explicit user approval.
- **Cross-reference**: use docs/design-system/PULSARIA_DESIGN_SYSTEM.md for Pulsaria-specific tokens, themes, and component conventions.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

