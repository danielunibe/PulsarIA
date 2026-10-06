//! # Magazine & Editorial Service
//!
//! Orquestación de persistencia, validación de contratos, trazabilidad
//! y gestión de versiones para Revistas y Tomos Inteligentes en Pulsaria.

use crate::domain::editorial::{
    validate_editorial_contract, ArticleType, CompilationTaskState, ConflictResolutionState,
    ContractValidationError, EditorialArticlePayload, EditorialState, EvidenceKind,
    MagazineArticleDetails, MagazineArticleRecord, MagazineArticleVersionRecord,
    MagazineChapterRecord, MagazineCompilationRecord, MagazineConflictRecord,
    MagazineEvidenceRecord, MagazineSourceMedia, MagazineSourceRecord, MagazineVolumeRecord,
    SourceRole,
};
use rusqlite::{params, Connection, OptionalExtension, Result, Transaction};

/// Agrega una columna a una tabla editorial solo si aún no existe.
/// Patrón espejo de `ensure_column` en `db.rs` (introspección por PRAGMA),
/// localizado aquí para no acoplar el esquema editorial al núcleo.
fn ensure_magazine_column(
    transaction: &Transaction<'_>,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<()> {
    let mut exists_stmt = transaction.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = exists_stmt.query_map([], |row| row.get::<_, String>(1))?;
    for known in columns {
        if known? == column {
            return Ok(());
        }
    }
    transaction.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
        [],
    )?;
    Ok(())
}

/// Inicializa el esquema SQLite para el subsistema editorial y siembra los tomos canónicos.
pub fn init_magazine_schema(transaction: &Transaction<'_>) -> Result<()> {
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS magazine_volumes (
            id TEXT PRIMARY KEY,
            volume_number TEXT NOT NULL,
            title TEXT NOT NULL,
            subtitle TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '#ff9a3c',
            accent_glow TEXT NOT NULL DEFAULT 'rgba(255, 154, 60, 0.35)',
            spine_gradient TEXT NOT NULL DEFAULT 'linear-gradient(180deg, #d35400 0%, #78281f 100%)',
            cover_gradient TEXT NOT NULL DEFAULT 'linear-gradient(145deg, #1e130c 0%, #120b07 100%)',
            hero_frame_path TEXT,
            editorial_state TEXT NOT NULL DEFAULT 'published',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS magazine_chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            volume_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            ordinal INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(volume_id) REFERENCES magazine_volumes(id) ON DELETE CASCADE
        )",
        [],
    )?;

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS magazine_articles (
            id TEXT PRIMARY KEY,
            volume_id TEXT NOT NULL,
            chapter_id INTEGER,
            title TEXT NOT NULL,
            article_type TEXT NOT NULL DEFAULT 'recipe',
            summary TEXT NOT NULL DEFAULT '',
            structured_content_json TEXT NOT NULL DEFAULT '{}',
            editorial_state TEXT NOT NULL DEFAULT 'published',
            active_version INTEGER NOT NULL DEFAULT 1,
            hero_frame_path TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(volume_id) REFERENCES magazine_volumes(id) ON DELETE CASCADE,
            FOREIGN KEY(chapter_id) REFERENCES magazine_chapters(id) ON DELETE SET NULL
        )",
        [],
    )?;

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS magazine_article_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id TEXT NOT NULL,
            version_number INTEGER NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            structured_content_json TEXT NOT NULL,
            editorial_notes_json TEXT,
            change_summary TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(article_id, version_number),
            FOREIGN KEY(article_id) REFERENCES magazine_articles(id) ON DELETE CASCADE
        )",
        [],
    )?;

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS magazine_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id TEXT NOT NULL,
            job_id INTEGER NOT NULL,
            content_id INTEGER,
            source_role TEXT NOT NULL DEFAULT 'primary',
            citation_label TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(article_id, job_id),
            FOREIGN KEY(article_id) REFERENCES magazine_articles(id) ON DELETE CASCADE,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY(content_id) REFERENCES content_items(id) ON DELETE SET NULL
        )",
        [],
    )?;

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS magazine_evidence (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id TEXT NOT NULL,
            source_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            evidence_kind TEXT NOT NULL DEFAULT 'timestamp',
            timestamp_start REAL,
            timestamp_end REAL,
            keyframe_path TEXT,
            transcript_text TEXT,
            extracted_fact TEXT,
            confidence REAL NOT NULL DEFAULT 0.9,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(article_id) REFERENCES magazine_articles(id) ON DELETE CASCADE,
            FOREIGN KEY(source_id) REFERENCES magazine_sources(id) ON DELETE CASCADE,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS magazine_conflicts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id TEXT NOT NULL,
            fact_key TEXT NOT NULL,
            description TEXT NOT NULL,
            evidence_a_id INTEGER NOT NULL,
            evidence_b_id INTEGER NOT NULL,
            resolution_state TEXT NOT NULL DEFAULT 'unresolved',
            resolution_notes TEXT,
            resolved_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(article_id) REFERENCES magazine_articles(id) ON DELETE CASCADE,
            FOREIGN KEY(evidence_a_id) REFERENCES magazine_evidence(id) ON DELETE CASCADE,
            FOREIGN KEY(evidence_b_id) REFERENCES magazine_evidence(id) ON DELETE CASCADE
        )",
        [],
    )?;

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS magazine_compilations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            volume_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            progress INTEGER NOT NULL DEFAULT 0,
            message TEXT,
            error_message TEXT,
            started_at DATETIME,
            finished_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(volume_id) REFERENCES magazine_volumes(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Fase 2 (motor editorial) y Fase 4 (multi-fuente & candidate proposals):
    // la compilación registra QUÉ fuentes se compilan y DÓNDE debe persistirse
    // el resultado. Columnas anulables para no romper filas legadas.
    for (column, definition) in [
        ("job_id", "INTEGER"),
        ("target_chapter_id", "INTEGER"),
        ("update_article_id", "TEXT"),
        ("job_ids_json", "TEXT"),
        ("candidate_json", "TEXT"),
    ] {
        ensure_magazine_column(transaction, "magazine_compilations", column, definition)?;
    }

    for index_stmt in [
        "CREATE INDEX IF NOT EXISTS idx_mag_vol_cat ON magazine_volumes(category)",
        "CREATE INDEX IF NOT EXISTS idx_mag_chap_vol ON magazine_chapters(volume_id, ordinal ASC)",
        "CREATE INDEX IF NOT EXISTS idx_mag_art_vol ON magazine_articles(volume_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_mag_art_chap ON magazine_articles(chapter_id)",
        "CREATE INDEX IF NOT EXISTS idx_mag_art_state ON magazine_articles(editorial_state)",
        "CREATE INDEX IF NOT EXISTS idx_mag_src_art ON magazine_sources(article_id)",
        "CREATE INDEX IF NOT EXISTS idx_mag_src_job ON magazine_sources(job_id)",
        "CREATE INDEX IF NOT EXISTS idx_mag_evi_art ON magazine_evidence(article_id)",
        "CREATE INDEX IF NOT EXISTS idx_mag_evi_src ON magazine_evidence(source_id)",
        "CREATE INDEX IF NOT EXISTS idx_mag_evi_job ON magazine_evidence(job_id)",
        "CREATE INDEX IF NOT EXISTS idx_mag_conf_art ON magazine_conflicts(article_id)",
        "CREATE INDEX IF NOT EXISTS idx_mag_comp_vol ON magazine_compilations(volume_id, created_at DESC)",
    ] {
        transaction.execute(index_stmt, [])?;
    }

    // Sembrar tomos canónicos si la tabla está vacía
    let volume_count: i64 =
        transaction.query_row("SELECT COUNT(*) FROM magazine_volumes", [], |row| {
            row.get(0)
        })?;

    if volume_count == 0 {
        let default_volumes = [
            (
                "vol-recipes",
                "TOMO I",
                "Recetario & Cocina de Autor",
                "Ingredientes medidos, pasos cronometrados y capturas de emplatado",
                "recipes",
                "Compendio gastronómico automático. Cada video de cocina es analizado para tabular ingredientes, tiempos de cocción y seleccionar los fotogramas clave de cada paso.",
                "#ff9a3c",
                "rgba(255, 154, 60, 0.35)",
                "linear-gradient(180deg, #d35400 0%, #78281f 100%)",
                "linear-gradient(145deg, #1e130c 0%, #120b07 100%)",
            ),
            (
                "vol-tech",
                "TOMO II",
                "Code Craft & Dev Architecture",
                "Snippets de código, diagramas y notas de ingeniería extraídas",
                "tech",
                "Manual de referencia técnica. Transforma tutoriales rápidos en documentación limpia con bloques de código, comandos terminales y arquitectura de software.",
                "#38bdf8",
                "rgba(56, 189, 248, 0.35)",
                "linear-gradient(180deg, #0284c7 0%, #082f49 100%)",
                "linear-gradient(145deg, #091524 0%, #050b14 100%)",
            ),
            (
                "vol-guides",
                "TOMO III",
                "Guías Visuales & Hacks DIY",
                "Manuales paso a paso con timestamps y fotogramas destacados",
                "guides",
                "Guías prácticas de reparación, carpintería y trucos cotidianos organizados en fichas de ejecución inmediata con fotos de herramientas y materiales.",
                "#34d399",
                "rgba(52, 211, 153, 0.35)",
                "linear-gradient(180deg, #059669 0%, #064e3b 100%)",
                "linear-gradient(145deg, #091f16 0%, #05100c 100%)",
            ),
            (
                "vol-lifestyle",
                "TOMO IV",
                "Biohacking & Fitness Protocols",
                "Rutinas segmentadas por series, descansos y postura correcta",
                "lifestyle",
                "Protocolos de entrenamiento y salud. Segmenta repeticiones, identifica posturas mediante visión computacional y sincroniza con notas de cronometraje.",
                "#a855f7",
                "rgba(168, 85, 247, 0.35)",
                "linear-gradient(180deg, #7e22ce 0%, #3b0764 100%)",
                "linear-gradient(145deg, #190c24 0%, #0d0614 100%)",
            ),
        ];

        for (id, num, title, subtitle, cat, desc, col, glow, spine, cover) in default_volumes {
            transaction.execute(
                "INSERT INTO magazine_volumes
                    (id, volume_number, title, subtitle, category, description, color, accent_glow, spine_gradient, cover_gradient, editorial_state)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'published')",
                params![id, num, title, subtitle, cat, desc, col, glow, spine, cover],
            )?;
        }
    }

    Ok(())
}

// ========================================================================
// CONSULTAS Y OPERACIONES EDITORIALES
// ========================================================================

/// Lista todos los volúmenes editoriales con sus conteos agregados de artículos y fuentes.
pub fn list_magazine_volumes(conn: &Connection) -> Result<Vec<MagazineVolumeRecord>> {
    let mut stmt = conn.prepare(
        "SELECT 
            v.id, v.volume_number, v.title, v.subtitle, v.category, v.description,
            v.color, v.accent_glow, v.spine_gradient, v.cover_gradient,
            v.hero_frame_path, v.editorial_state,
            COALESCE(COUNT(DISTINCT a.id), 0) AS article_count,
            COALESCE(COUNT(DISTINCT s.job_id), 0) AS source_count,
            v.created_at, v.updated_at
         FROM magazine_volumes v
         LEFT JOIN magazine_articles a ON a.volume_id = v.id
         LEFT JOIN magazine_sources s ON s.article_id = a.id
         GROUP BY v.id
         ORDER BY v.rowid ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        let state_str: String = row.get(11)?;
        let editorial_state = state_str
            .parse::<EditorialState>()
            .unwrap_or(EditorialState::Published);

        Ok(MagazineVolumeRecord {
            id: row.get(0)?,
            volume_number: row.get(1)?,
            title: row.get(2)?,
            subtitle: row.get(3)?,
            category: row.get(4)?,
            description: row.get(5)?,
            color: row.get(6)?,
            accent_glow: row.get(7)?,
            spine_gradient: row.get(8)?,
            cover_gradient: row.get(9)?,
            hero_frame_path: row.get(10)?,
            editorial_state,
            article_count: row.get(12)?,
            source_count: row.get(13)?,
            created_at: row.get(14)?,
            updated_at: row.get(15)?,
        })
    })?;

    let mut volumes = Vec::new();
    for row in rows {
        volumes.push(row?);
    }
    Ok(volumes)
}

/// Obtiene un volumen editorial específico por ID.
pub fn get_magazine_volume(
    conn: &Connection,
    volume_id: &str,
) -> Result<Option<MagazineVolumeRecord>> {
    let mut stmt = conn.prepare(
        "SELECT 
            v.id, v.volume_number, v.title, v.subtitle, v.category, v.description,
            v.color, v.accent_glow, v.spine_gradient, v.cover_gradient,
            v.hero_frame_path, v.editorial_state,
            COALESCE(COUNT(DISTINCT a.id), 0) AS article_count,
            COALESCE(COUNT(DISTINCT s.job_id), 0) AS source_count,
            v.created_at, v.updated_at
         FROM magazine_volumes v
         LEFT JOIN magazine_articles a ON a.volume_id = v.id
         LEFT JOIN magazine_sources s ON s.article_id = a.id
         WHERE v.id = ?1
         GROUP BY v.id",
    )?;

    let volume = stmt
        .query_row(params![volume_id], |row| {
            let state_str: String = row.get(11)?;
            let editorial_state = state_str
                .parse::<EditorialState>()
                .unwrap_or(EditorialState::Published);

            Ok(MagazineVolumeRecord {
                id: row.get(0)?,
                volume_number: row.get(1)?,
                title: row.get(2)?,
                subtitle: row.get(3)?,
                category: row.get(4)?,
                description: row.get(5)?,
                color: row.get(6)?,
                accent_glow: row.get(7)?,
                spine_gradient: row.get(8)?,
                cover_gradient: row.get(9)?,
                hero_frame_path: row.get(10)?,
                editorial_state,
                article_count: row.get(12)?,
                source_count: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })
        .optional()?;

    Ok(volume)
}

/// Crea o actualiza un tomo editorial personalizado.
pub fn create_magazine_volume(conn: &Connection, volume: &MagazineVolumeRecord) -> Result<()> {
    conn.execute(
        "INSERT INTO magazine_volumes
            (id, volume_number, title, subtitle, category, description, color, accent_glow, spine_gradient, cover_gradient, hero_frame_path, editorial_state)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            subtitle = excluded.subtitle,
            category = excluded.category,
            description = excluded.description,
            color = excluded.color,
            accent_glow = excluded.accent_glow,
            spine_gradient = excluded.spine_gradient,
            cover_gradient = excluded.cover_gradient,
            hero_frame_path = coalesce(excluded.hero_frame_path, magazine_volumes.hero_frame_path),
            editorial_state = excluded.editorial_state,
            updated_at = CURRENT_TIMESTAMP",
        params![
            volume.id,
            volume.volume_number,
            volume.title,
            volume.subtitle,
            volume.category,
            volume.description,
            volume.color,
            volume.accent_glow,
            volume.spine_gradient,
            volume.cover_gradient,
            volume.hero_frame_path,
            volume.editorial_state.as_str()
        ],
    )?;
    Ok(())
}

/// Lista los artículos de un volumen específico.
pub fn list_magazine_articles(
    conn: &Connection,
    volume_id: &str,
) -> Result<Vec<MagazineArticleRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, volume_id, chapter_id, title, article_type, summary,
                structured_content_json, editorial_state, active_version,
                hero_frame_path, created_at, updated_at
         FROM magazine_articles
         WHERE volume_id = ?1
         ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map(params![volume_id], |row| {
        let type_str: String = row.get(4)?;
        let state_str: String = row.get(7)?;

        let article_type = type_str
            .parse::<ArticleType>()
            .unwrap_or(ArticleType::Recipe);
        let editorial_state = state_str
            .parse::<EditorialState>()
            .unwrap_or(EditorialState::Published);

        Ok(MagazineArticleRecord {
            id: row.get(0)?,
            volume_id: row.get(1)?,
            chapter_id: row.get(2)?,
            title: row.get(3)?,
            article_type,
            summary: row.get(5)?,
            structured_content_json: row.get(6)?,
            editorial_state,
            active_version: row.get(8)?,
            hero_frame_path: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    })?;

    let mut articles = Vec::new();
    for row in rows {
        articles.push(row?);
    }
    Ok(articles)
}

/// Lista los capítulos de un volumen en orden editorial.
pub fn list_magazine_chapters(
    conn: &Connection,
    volume_id: &str,
) -> Result<Vec<MagazineChapterRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, volume_id, title, description, ordinal, created_at, updated_at
         FROM magazine_chapters
         WHERE volume_id = ?1
         ORDER BY ordinal ASC, id ASC",
    )?;

    let rows = stmt.query_map(params![volume_id], |row| {
        Ok(MagazineChapterRecord {
            id: row.get(0)?,
            volume_id: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            ordinal: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;

    let mut chapters = Vec::new();
    for row in rows {
        chapters.push(row?);
    }
    Ok(chapters)
}

/// Crea un capítulo dentro de un volumen existente. Sin ordinal explícito,
/// se anexa al final de la secuencia editorial del tomo.
pub fn create_magazine_chapter(
    conn: &Connection,
    volume_id: &str,
    title: &str,
    description: Option<&str>,
    ordinal: Option<i32>,
) -> std::result::Result<MagazineChapterRecord, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("chapter title cannot be empty".to_string());
    }

    let volume_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM magazine_volumes WHERE id = ?1)",
            params![volume_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !volume_exists {
        return Err(format!("magazine volume '{volume_id}' does not exist"));
    }

    let next_ordinal: i32 = match ordinal {
        Some(explicit) => explicit,
        None => conn
            .query_row(
                "SELECT COALESCE(MAX(ordinal), -1) + 1 FROM magazine_chapters WHERE volume_id = ?1",
                params![volume_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?,
    };

    conn.execute(
        "INSERT INTO magazine_chapters (volume_id, title, description, ordinal)
         VALUES (?1, ?2, ?3, ?4)",
        params![volume_id, title, description, next_ordinal],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, volume_id, title, description, ordinal, created_at, updated_at
         FROM magazine_chapters WHERE id = ?1",
        params![id],
        |row| {
            Ok(MagazineChapterRecord {
                id: row.get(0)?,
                volume_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                ordinal: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Obtiene los detalles completos de un artículo editorial incluyendo sus fuentes,
/// evidencias trazables, versiones previas y conflictos.
pub fn get_magazine_article_details(
    conn: &Connection,
    article_id: &str,
) -> Result<Option<MagazineArticleDetails>> {
    let article_row = conn
        .query_row(
            "SELECT id, volume_id, chapter_id, title, article_type, summary,
                    structured_content_json, editorial_state, active_version,
                    hero_frame_path, created_at, updated_at
             FROM magazine_articles
             WHERE id = ?1",
            params![article_id],
            |row| {
                let type_str: String = row.get(4)?;
                let state_str: String = row.get(7)?;

                let article_type = type_str
                    .parse::<ArticleType>()
                    .unwrap_or(ArticleType::Recipe);
                let editorial_state = state_str
                    .parse::<EditorialState>()
                    .unwrap_or(EditorialState::Published);

                Ok(MagazineArticleRecord {
                    id: row.get(0)?,
                    volume_id: row.get(1)?,
                    chapter_id: row.get(2)?,
                    title: row.get(3)?,
                    article_type,
                    summary: row.get(5)?,
                    structured_content_json: row.get(6)?,
                    editorial_state,
                    active_version: row.get(8)?,
                    hero_frame_path: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        )
        .optional()?;

    let Some(article) = article_row else {
        return Ok(None);
    };

    // Obtener fuentes
    let mut sources_stmt = conn.prepare(
        "SELECT id, article_id, job_id, content_id, source_role, citation_label, created_at
         FROM magazine_sources
         WHERE article_id = ?1
         ORDER BY id ASC",
    )?;
    let sources = sources_stmt
        .query_map(params![article_id], |row| {
            let role_str: String = row.get(4)?;
            let source_role = role_str
                .parse::<SourceRole>()
                .unwrap_or(SourceRole::Primary);
            Ok(MagazineSourceRecord {
                id: row.get(0)?,
                article_id: row.get(1)?,
                job_id: row.get(2)?,
                content_id: row.get(3)?,
                source_role,
                citation_label: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    // Obtener evidencia granular
    let mut evidence_stmt = conn.prepare(
        "SELECT id, article_id, source_id, job_id, evidence_kind, timestamp_start,
                timestamp_end, keyframe_path, transcript_text, extracted_fact,
                confidence, created_at
         FROM magazine_evidence
         WHERE article_id = ?1
         ORDER BY id ASC",
    )?;
    let evidence = evidence_stmt
        .query_map(params![article_id], |row| {
            let kind_str: String = row.get(4)?;
            let evidence_kind = kind_str
                .parse::<EvidenceKind>()
                .unwrap_or(EvidenceKind::Timestamp);
            Ok(MagazineEvidenceRecord {
                id: row.get(0)?,
                article_id: row.get(1)?,
                source_id: row.get(2)?,
                job_id: row.get(3)?,
                evidence_kind,
                timestamp_start: row.get(5)?,
                timestamp_end: row.get(6)?,
                keyframe_path: row.get(7)?,
                transcript_text: row.get(8)?,
                extracted_fact: row.get(9)?,
                confidence: row.get(10)?,
                created_at: row.get(11)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    // Obtener historial de versiones
    let mut versions_stmt = conn.prepare(
        "SELECT id, article_id, version_number, title, summary,
                structured_content_json, editorial_notes_json, change_summary, created_at
         FROM magazine_article_versions
         WHERE article_id = ?1
         ORDER BY version_number ASC",
    )?;
    let versions = versions_stmt
        .query_map(params![article_id], |row| {
            Ok(MagazineArticleVersionRecord {
                id: row.get(0)?,
                article_id: row.get(1)?,
                version_number: row.get(2)?,
                title: row.get(3)?,
                summary: row.get(4)?,
                structured_content_json: row.get(5)?,
                editorial_notes_json: row.get(6)?,
                change_summary: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    // Obtener conflictos
    let mut conflicts_stmt = conn.prepare(
        "SELECT id, article_id, fact_key, description, evidence_a_id, evidence_b_id,
                resolution_state, resolution_notes, resolved_at, created_at
         FROM magazine_conflicts
         WHERE article_id = ?1
         ORDER BY id ASC",
    )?;
    let conflicts = conflicts_stmt
        .query_map(params![article_id], |row| {
            let state_str: String = row.get(6)?;
            let resolution_state = state_str
                .parse::<ConflictResolutionState>()
                .unwrap_or(ConflictResolutionState::Unresolved);
            Ok(MagazineConflictRecord {
                id: row.get(0)?,
                article_id: row.get(1)?,
                fact_key: row.get(2)?,
                description: row.get(3)?,
                evidence_a_id: row.get(4)?,
                evidence_b_id: row.get(5)?,
                resolution_state,
                resolution_notes: row.get(7)?,
                resolved_at: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    Ok(Some(MagazineArticleDetails {
        article,
        sources,
        evidence,
        versions,
        conflicts,
    }))
}

/// Valida rigurosamente un payload editorial y lo persiste atómicamente en la base de datos,
/// creando el artículo, versión 1, fuentes, evidencias trazables y conflictos detectados.
pub fn create_article_from_contract(
    conn: &mut Connection,
    volume_id: &str,
    chapter_id: Option<i64>,
    payload: &EditorialArticlePayload,
    hero_frame_path: Option<String>,
) -> std::result::Result<MagazineArticleDetails, String> {
    // 1. Validar contrato de esquema formal
    validate_editorial_contract(payload).map_err(|e: ContractValidationError| e.to_string())?;

    // 2. Verificar que el volumen existe
    let volume_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM magazine_volumes WHERE id = ?1)",
            params![volume_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if !volume_exists {
        return Err(format!("magazine volume '{volume_id}' does not exist"));
    }

    // 2b. Si se indica capítulo, debe existir y pertenecer al mismo volumen.
    if let Some(chapter_id) = chapter_id {
        let chapter_ok: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM magazine_chapters WHERE id = ?1 AND volume_id = ?2)",
                params![chapter_id, volume_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !chapter_ok {
            return Err(format!(
                "magazine chapter '{chapter_id}' does not exist in volume '{volume_id}'"
            ));
        }
    }

    // 3. Ejecutar transacción atómica
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let article_id = format!(
        "art-{}-{}",
        volume_id,
        chrono::Utc::now().timestamp_millis()
    );

    let content_json_str = serde_json::to_string(&payload.content).map_err(|e| e.to_string())?;
    let notes_json_str =
        serde_json::to_string(&payload.editorial_notes).map_err(|e| e.to_string())?;

    // Inserción de Artículo (Estado inicial = Published si no hay conflictos, o RequiresReview si hay)
    let initial_state = if payload.conflicts.is_empty() {
        EditorialState::Published
    } else {
        EditorialState::RequiresReview
    };

    tx.execute(
        "INSERT INTO magazine_articles
            (id, volume_id, chapter_id, title, article_type, summary, structured_content_json, editorial_state, active_version, hero_frame_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)",
        params![
            article_id,
            volume_id,
            chapter_id,
            payload.title,
            payload.article_type.as_str(),
            payload.summary,
            content_json_str,
            initial_state.as_str(),
            hero_frame_path
        ],
    )
    .map_err(|e| format!("failed to insert magazine_article: {e}"))?;

    // Inserción de Versión 1
    tx.execute(
        "INSERT INTO magazine_article_versions
            (article_id, version_number, title, summary, structured_content_json, editorial_notes_json, change_summary)
         VALUES (?1, 1, ?2, ?3, ?4, ?5, 'Publicación inicial generada por motor editorial')",
        params![
            article_id,
            payload.title,
            payload.summary,
            content_json_str,
            notes_json_str
        ],
    )
    .map_err(|e| format!("failed to insert magazine_article_version: {e}"))?;

    // Inserción de Fuentes
    let mut source_map = std::collections::HashMap::new();
    for src in &payload.sources {
        // Enlazar content_id si existe para este job_id en Pulsaria
        let content_id: Option<i64> = tx
            .query_row(
                "SELECT id FROM content_items WHERE job_id = ?1 LIMIT 1",
                params![src.job_id],
                |row| row.get(0),
            )
            .optional()
            .unwrap_or(None);

        tx.execute(
            "INSERT INTO magazine_sources
                (article_id, job_id, content_id, source_role, citation_label)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                article_id,
                src.job_id,
                content_id,
                src.role.as_str(),
                src.citation
            ],
        )
        .map_err(|e| format!("failed to insert magazine_source: {e}"))?;

        let source_db_id = tx.last_insert_rowid();
        source_map.insert(src.job_id, source_db_id);
    }

    // Inserción de Evidencias Trazables
    let mut evidence_db_ids = Vec::with_capacity(payload.evidence.len());
    for ev in &payload.evidence {
        // La validación del contrato ya exige que cada evidencia declare su
        // fuente; este guardado evita un FK opaco (source_id = 0) si el
        // contrato llegara a relajarse en el futuro.
        let source_id = match source_map.get(&ev.job_id).copied() {
            Some(id) => id,
            None => {
                return Err(format!(
                    "evidence references job_id {} which is not declared in sources list",
                    ev.job_id
                ));
            }
        };
        tx.execute(
            "INSERT INTO magazine_evidence
                (article_id, source_id, job_id, evidence_kind, timestamp_start, timestamp_end, keyframe_path, transcript_text, extracted_fact, confidence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                article_id,
                source_id,
                ev.job_id,
                ev.kind.as_str(),
                ev.timestamp_start,
                ev.timestamp_end,
                ev.keyframe_path,
                ev.transcript_text,
                ev.fact,
                ev.confidence
            ],
        )
        .map_err(|e| format!("failed to insert magazine_evidence: {e}"))?;

        evidence_db_ids.push(tx.last_insert_rowid());
    }

    // Inserción de Conflictos
    for conf in &payload.conflicts {
        let ev_a_id = evidence_db_ids[conf.evidence_a_index];
        let ev_b_id = evidence_db_ids[conf.evidence_b_index];

        tx.execute(
            "INSERT INTO magazine_conflicts
                (article_id, fact_key, description, evidence_a_id, evidence_b_id, resolution_state)
             VALUES (?1, ?2, ?3, ?4, ?5, 'unresolved')",
            params![
                article_id,
                conf.fact_key,
                conf.description,
                ev_a_id,
                ev_b_id
            ],
        )
        .map_err(|e| format!("failed to insert magazine_conflict: {e}"))?;
    }

    // Actualizar timestamp del tomo
    tx.execute(
        "UPDATE magazine_volumes SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![volume_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    // Recuperar detalles completos construidos
    get_magazine_article_details(conn, &article_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "could not reload created magazine article".to_string())
}

/// Añade una nueva versión a un artículo existente sin sobrescribir el historial.
pub fn add_article_version(
    conn: &mut Connection,
    article_id: &str,
    title: &str,
    summary: &str,
    structured_content_json: &str,
    editorial_notes_json: Option<&str>,
    change_summary: Option<&str>,
) -> std::result::Result<MagazineArticleVersionRecord, String> {
    let current_version: i32 = conn
        .query_row(
            "SELECT active_version FROM magazine_articles WHERE id = ?1",
            params![article_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("article not found: {e}"))?;

    let new_version = current_version + 1;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO magazine_article_versions
            (article_id, version_number, title, summary, structured_content_json, editorial_notes_json, change_summary)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            article_id,
            new_version,
            title,
            summary,
            structured_content_json,
            editorial_notes_json,
            change_summary
        ],
    )
    .map_err(|e| e.to_string())?;

    let version_id = tx.last_insert_rowid();

    tx.execute(
        "UPDATE magazine_articles SET
            active_version = ?1,
            title = ?2,
            summary = ?3,
            structured_content_json = ?4,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?5",
        params![
            new_version,
            title,
            summary,
            structured_content_json,
            article_id
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(MagazineArticleVersionRecord {
        id: version_id,
        article_id: article_id.to_string(),
        version_number: new_version,
        title: title.to_string(),
        summary: summary.to_string(),
        structured_content_json: structured_content_json.to_string(),
        editorial_notes_json: editorial_notes_json.map(|s| s.to_string()),
        change_summary: change_summary.map(|s| s.to_string()),
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Resuelve un conflicto entre evidencias de fuentes contradictorias.
pub fn resolve_magazine_conflict(
    conn: &Connection,
    conflict_id: i64,
    resolution_state: ConflictResolutionState,
    resolution_notes: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE magazine_conflicts SET
            resolution_state = ?1,
            resolution_notes = ?2,
            resolved_at = CURRENT_TIMESTAMP
         WHERE id = ?3",
        params![resolution_state.as_str(), resolution_notes, conflict_id],
    )?;
    Ok(())
}

/// Mueve el estado editorial de un artículo validando la máquina de estados.
/// No escribe contenido: solo avanza o retrocede el ciclo de vida editorial.
pub fn update_magazine_article_state(
    conn: &Connection,
    article_id: &str,
    next: EditorialState,
) -> std::result::Result<(), String> {
    let current_str: String = conn
        .query_row(
            "SELECT editorial_state FROM magazine_articles WHERE id = ?1",
            params![article_id],
            |row| row.get(0),
        )
        .map_err(|_| format!("magazine article '{article_id}' does not exist"))?;
    let current: EditorialState = current_str.parse().map_err(|e: String| e)?;
    if !current.can_transition_to(next) {
        return Err(format!("illegal editorial transition: {current} -> {next}"));
    }
    conn.execute(
        "UPDATE magazine_articles
         SET editorial_state = ?1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2",
        params![next.as_str(), article_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Mueve el estado editorial de un tomo validando la misma máquina de estados.
pub fn update_magazine_volume_state(
    conn: &Connection,
    volume_id: &str,
    next: EditorialState,
) -> std::result::Result<(), String> {
    let current_str: String = conn
        .query_row(
            "SELECT editorial_state FROM magazine_volumes WHERE id = ?1",
            params![volume_id],
            |row| row.get(0),
        )
        .map_err(|_| format!("magazine volume '{volume_id}' does not exist"))?;
    let current: EditorialState = current_str.parse().map_err(|e: String| e)?;
    if !current.can_transition_to(next) {
        return Err(format!("illegal editorial transition: {current} -> {next}"));
    }
    conn.execute(
        "UPDATE magazine_volumes
         SET editorial_state = ?1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2",
        params![next.as_str(), volume_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ========================================================================
// COMPILACIONES EDITORIALES (magazine_compilations)
// ------------------------------------------------------------------------
// Cola propia del subsistema editorial, separada a propósito de la tabla
// `jobs` de ingestión: los jobs descargan y transcriben videos (QueueService
// + workers Python); las compilaciones registran el trabajo futuro del motor
// editorial (Gemini u offline) sobre evidencia ya indexada. El punto de
// integración entre ambas colas queda documentado y pendiente de fase
// posterior; no se reutiliza QueueService para no acoplar ciclos de vida
// distintos en esta fase fundacional.
// ========================================================================

fn compilation_record_from_row(row: &rusqlite::Row<'_>) -> Result<MagazineCompilationRecord> {
    let status_str: String = row.get(2)?;
    let status = status_str
        .parse::<CompilationTaskState>()
        .unwrap_or(CompilationTaskState::Queued);
    Ok(MagazineCompilationRecord {
        id: row.get(0)?,
        volume_id: row.get(1)?,
        status,
        progress: row.get(3)?,
        message: row.get(4)?,
        error_message: row.get(5)?,
        started_at: row.get(6)?,
        finished_at: row.get(7)?,
        created_at: row.get(8)?,
    })
}

/// Encola una compilación editorial para un volumen. Parte en `queued`.
pub fn create_magazine_compilation(
    conn: &Connection,
    volume_id: &str,
) -> std::result::Result<MagazineCompilationRecord, String> {
    let volume_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM magazine_volumes WHERE id = ?1)",
            params![volume_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !volume_exists {
        return Err(format!("magazine volume '{volume_id}' does not exist"));
    }
    conn.execute(
        "INSERT INTO magazine_compilations (volume_id, status, progress)
         VALUES (?1, 'queued', 0)",
        params![volume_id],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    get_magazine_compilation(conn, id)
}

/// Encola una compilación editorial ligada a una fuente concreta (job) y a
/// su destino editorial. `update_article_id` reserva la compilación para
/// generar una NUEVA VERSIÓN en lugar de un artículo nuevo.
pub fn create_magazine_compilation_for_source(
    conn: &Connection,
    volume_id: &str,
    job_id: i64,
    target_chapter_id: Option<i64>,
    update_article_id: Option<&str>,
) -> std::result::Result<MagazineCompilationRecord, String> {
    let volume_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM magazine_volumes WHERE id = ?1)",
            params![volume_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !volume_exists {
        return Err(format!("magazine volume '{volume_id}' does not exist"));
    }
    let job_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM jobs WHERE id = ?1)",
            params![job_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !job_exists {
        return Err(format!("editorial source job '{job_id}' does not exist"));
    }
    conn.execute(
        "INSERT INTO magazine_compilations
            (volume_id, job_id, target_chapter_id, update_article_id, status, progress)
         VALUES (?1, ?2, ?3, ?4, 'queued', 0)",
        params![volume_id, job_id, target_chapter_id, update_article_id],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    get_magazine_compilation(conn, id)
}

/// Lee una compilación por id. Base del polling honesto de la UI.
pub fn get_magazine_compilation(
    conn: &Connection,
    compilation_id: i64,
) -> std::result::Result<MagazineCompilationRecord, String> {
    conn.query_row(
        "SELECT id, volume_id, status, progress, message, error_message,
                started_at, finished_at, created_at
         FROM magazine_compilations WHERE id = ?1",
        params![compilation_id],
        compilation_record_from_row,
    )
    .map_err(|_| format!("magazine compilation '{compilation_id}' does not exist"))
}

/// Lee los parámetros de fuente de una compilación (job + destino).
/// Las filas legadas de Fase 1 no tienen fuente: devuelven `None`.
pub fn get_compilation_source(
    conn: &Connection,
    compilation_id: i64,
) -> std::result::Result<Option<(i64, Option<i64>, Option<String>)>, String> {
    let (job_id, chapter_id, update_article): (Option<i64>, Option<i64>, Option<String>) = conn
        .query_row(
            "SELECT job_id, target_chapter_id, update_article_id
             FROM magazine_compilations WHERE id = ?1",
            params![compilation_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| format!("magazine compilation '{compilation_id}' does not exist"))?;
    Ok(job_id.map(|job| (job, chapter_id, update_article)))
}

/// Encola una compilación editorial multi-fuente ligada a un conjunto de jobs.
pub fn create_magazine_compilation_for_multi_source(
    conn: &Connection,
    volume_id: &str,
    job_ids: &[i64],
    target_chapter_id: Option<i64>,
    update_article_id: Option<&str>,
) -> std::result::Result<MagazineCompilationRecord, String> {
    if job_ids.is_empty() {
        return Err("multi-source compilation requires at least one source job".to_string());
    }
    let volume_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM magazine_volumes WHERE id = ?1)",
            params![volume_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !volume_exists {
        return Err(format!("magazine volume '{volume_id}' does not exist"));
    }
    for &job_id in job_ids {
        let job_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM jobs WHERE id = ?1)",
                params![job_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !job_exists {
            return Err(format!("editorial source job '{job_id}' does not exist"));
        }
    }
    let primary_job = job_ids[0];
    let job_ids_json = serde_json::to_string(job_ids).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO magazine_compilations
            (volume_id, job_id, job_ids_json, target_chapter_id, update_article_id, status, progress)
         VALUES (?1, ?2, ?3, ?4, ?5, 'queued', 0)",
        params![volume_id, primary_job, job_ids_json, target_chapter_id, update_article_id],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    get_magazine_compilation(conn, id)
}

/// Actualiza el proposal de NewVolumeCandidate persistido en una compilación.
pub fn update_magazine_compilation_candidate(
    conn: &Connection,
    compilation_id: i64,
    candidate_json: Option<&str>,
) -> std::result::Result<(), String> {
    conn.execute(
        "UPDATE magazine_compilations SET candidate_json = ?1 WHERE id = ?2",
        params![candidate_json, compilation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Recupera la propuesta de NewVolumeCandidate persistida en una compilación.
pub fn get_compilation_candidate(
    conn: &Connection,
    compilation_id: i64,
) -> std::result::Result<Option<crate::domain::editorial::NewVolumeCandidate>, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT candidate_json FROM magazine_compilations WHERE id = ?1",
            params![compilation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    match raw {
        Some(text) => serde_json::from_str(&text).map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

/// Recupera los job_ids asociados a una compilación (multi-fuente o legado).
pub fn get_compilation_job_ids(
    conn: &Connection,
    compilation_id: i64,
) -> std::result::Result<Vec<i64>, String> {
    let (job_id, job_ids_json): (Option<i64>, Option<String>) = conn
        .query_row(
            "SELECT job_id, job_ids_json FROM magazine_compilations WHERE id = ?1",
            params![compilation_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("magazine compilation '{compilation_id}' does not exist"))?;
    if let Some(json) = job_ids_json {
        if let Ok(ids) = serde_json::from_str::<Vec<i64>>(&json) {
            if !ids.is_empty() {
                return Ok(ids);
            }
        }
    }
    Ok(job_id.into_iter().collect())
}

/// Adjunta fuentes y evidencias de una compilación a un artículo preexistente (versiones incrementales).
pub fn attach_sources_and_evidence_to_article(
    conn: &Connection,
    article_id: &str,
    payload: &EditorialArticlePayload,
) -> std::result::Result<(), String> {
    for src in &payload.sources {
        let content_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM content_items WHERE job_id = ?1 LIMIT 1",
                params![src.job_id],
                |row| row.get(0),
            )
            .optional()
            .unwrap_or(None);

        conn.execute(
            "INSERT INTO magazine_sources
                (article_id, job_id, content_id, source_role, citation_label)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(article_id, job_id) DO UPDATE SET
                citation_label = COALESCE(excluded.citation_label, magazine_sources.citation_label)",
            params![
                article_id,
                src.job_id,
                content_id,
                src.role.as_str(),
                src.citation
            ],
        )
        .map_err(|e| format!("failed to insert or update magazine_source: {e}"))?;
    }

    let mut stmt = conn
        .prepare("SELECT job_id, id FROM magazine_sources WHERE article_id = ?1")
        .map_err(|e| e.to_string())?;
    let source_map: std::collections::HashMap<i64, i64> = stmt
        .query_map(params![article_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut evidence_db_ids = Vec::with_capacity(payload.evidence.len());
    for ev in &payload.evidence {
        let source_id = match source_map.get(&ev.job_id).copied() {
            Some(id) => id,
            None => {
                return Err(format!(
                    "evidence references job_id {} which is not declared in sources list",
                    ev.job_id
                ));
            }
        };

        let existing_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM magazine_evidence
                 WHERE article_id = ?1 AND source_id = ?2 AND evidence_kind = ?3
                   AND IFNULL(timestamp_start, -1.0) = IFNULL(?4, -1.0)
                   AND IFNULL(timestamp_end, -1.0) = IFNULL(?5, -1.0)
                   AND IFNULL(extracted_fact, '') = IFNULL(?6, '')
                 LIMIT 1",
                params![
                    article_id,
                    source_id,
                    ev.kind.as_str(),
                    ev.timestamp_start,
                    ev.timestamp_end,
                    ev.fact
                ],
                |row| row.get(0),
            )
            .optional()
            .unwrap_or(None);

        let evi_id = match existing_id {
            Some(id) => id,
            None => {
                conn.execute(
                    "INSERT INTO magazine_evidence
                        (article_id, source_id, job_id, evidence_kind, timestamp_start, timestamp_end, keyframe_path, transcript_text, extracted_fact, confidence)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        article_id,
                        source_id,
                        ev.job_id,
                        ev.kind.as_str(),
                        ev.timestamp_start,
                        ev.timestamp_end,
                        ev.keyframe_path,
                        ev.transcript_text,
                        ev.fact,
                        ev.confidence
                    ],
                )
                .map_err(|e| format!("failed to insert magazine_evidence: {e}"))?;
                conn.last_insert_rowid()
            }
        };
        evidence_db_ids.push(evi_id);
    }

    for conf in &payload.conflicts {
        if conf.evidence_a_index >= evidence_db_ids.len()
            || conf.evidence_b_index >= evidence_db_ids.len()
        {
            continue;
        }
        let ev_a_id = evidence_db_ids[conf.evidence_a_index];
        let ev_b_id = evidence_db_ids[conf.evidence_b_index];

        let conflict_exists: bool = conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM magazine_conflicts
                    WHERE article_id = ?1 AND fact_key = ?2 AND evidence_a_id = ?3 AND evidence_b_id = ?4
                 )",
                params![article_id, conf.fact_key, ev_a_id, ev_b_id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !conflict_exists {
            conn.execute(
                "INSERT INTO magazine_conflicts
                    (article_id, fact_key, description, evidence_a_id, evidence_b_id, resolution_state)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'unresolved')",
                params![article_id, conf.fact_key, conf.description, ev_a_id, ev_b_id],
            )
            .map_err(|e| format!("failed to insert magazine_conflict: {e}"))?;
        }
    }

    Ok(())
}

/// Compara el contenido propuesto con la versión activa de un artículo.
/// `serde_json::Value` serializa con claves ordenadas, por lo que la
/// comparación de cadenas es canónica: contenido idéntico ⇒ sin versión nueva.
pub fn article_content_matches(
    conn: &Connection,
    article_id: &str,
    title: &str,
    summary: &str,
    content: &serde_json::Value,
) -> std::result::Result<bool, String> {
    let (current_title, current_summary, current_content): (String, String, String) = conn
        .query_row(
            "SELECT title, summary, structured_content_json
             FROM magazine_articles WHERE id = ?1",
            params![article_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| format!("magazine article '{article_id}' does not exist"))?;
    if current_title != title || current_summary != summary {
        return Ok(false);
    }
    let canonical = serde_json::to_string(content).map_err(|e| e.to_string())?;
    let current_canonical: serde_json::Value = serde_json::from_str(&current_content)
        .map_err(|e| format!("stored article content is corrupt: {e}"))?;
    Ok(serde_json::to_string(&current_canonical).map_err(|e| e.to_string())? == canonical)
}

// ========================================================================
// SOURCE RESOLUTION (Fase 3: Reader → Evidence → Source → Media)
// ------------------------------------------------------------------------
// Capa clara entre React y SQLite: el frontend pide el medio por job_id y
// recibe todo lo necesario para reproducir o declarar honestamente que la
// reproducción no está disponible. Misma regla que `VideoGrid`.
// ========================================================================

/// Resuelve el medio original de un job para el inspector de fuentes.
/// `None` si el job no existe; nunca inventa rutas.
pub fn resolve_source_media(
    conn: &Connection,
    job_id: i64,
) -> Result<Option<MagazineSourceMedia>, String> {
    let row: Option<(
        String,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = conn
        .query_row(
            "SELECT j.url, j.canonical_url, j.status,
                    m.title, m.author, m.platform, m.duration,
                    m.video_path, m.poster_path, m.source_state
             FROM jobs j
             LEFT JOIN media m ON m.job_id = j.id
             WHERE j.id = ?1",
            params![job_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(row.map(
        |(
            url,
            canonical_url,
            job_status,
            title,
            author,
            platform,
            duration,
            video_path,
            poster_path,
            source_state,
        )| MagazineSourceMedia {
            job_id,
            url,
            canonical_url,
            title,
            author,
            platform,
            duration_secs: duration.map(|secs| secs as f64),
            video_path: video_path.filter(|path| !path.is_empty()),
            poster_path: poster_path.filter(|path| !path.is_empty()),
            source_state: source_state.unwrap_or_else(|| "local".to_string()),
            job_status,
        },
    ))
}

/// Lista las compilaciones de un volumen, más recientes primero.
pub fn list_magazine_compilations(
    conn: &Connection,
    volume_id: &str,
) -> Result<Vec<MagazineCompilationRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, volume_id, status, progress, message, error_message,
                started_at, finished_at, created_at
         FROM magazine_compilations
         WHERE volume_id = ?1
         ORDER BY created_at DESC, id DESC",
    )?;
    let rows = stmt.query_map(params![volume_id], compilation_record_from_row)?;
    let mut compilations = Vec::new();
    for row in rows {
        compilations.push(row?);
    }
    Ok(compilations)
}

/// Actualiza el progreso/estado de una compilación. Los estados terminales
/// (`completed`, `failed`, `cancelled`) solo pueden volver a `queued`
/// (reintento explícito); cualquier otro avance es libre.
pub fn update_magazine_compilation(
    conn: &Connection,
    compilation_id: i64,
    status: CompilationTaskState,
    progress: i32,
    message: Option<&str>,
    error_message: Option<&str>,
) -> std::result::Result<MagazineCompilationRecord, String> {
    let current_str: String = conn
        .query_row(
            "SELECT status FROM magazine_compilations WHERE id = ?1",
            params![compilation_id],
            |row| row.get(0),
        )
        .map_err(|_| format!("magazine compilation '{compilation_id}' does not exist"))?;
    let current: CompilationTaskState = current_str.parse().map_err(|e: String| e)?;
    let current_is_terminal = matches!(
        current,
        CompilationTaskState::Completed
            | CompilationTaskState::Failed
            | CompilationTaskState::Cancelled
    );
    if current_is_terminal && !matches!(status, CompilationTaskState::Queued) {
        return Err(format!(
            "illegal compilation transition: {current} -> {status} (terminal states only return to queued)"
        ));
    }
    let progress = progress.clamp(0, 100);
    conn.execute(
        "UPDATE magazine_compilations SET
            status = ?1,
            progress = ?2,
            message = ?3,
            error_message = ?4,
            started_at = CASE
                WHEN ?1 = 'processing' AND started_at IS NULL THEN CURRENT_TIMESTAMP
                ELSE started_at END,
            finished_at = CASE
                WHEN ?1 IN ('completed', 'failed', 'cancelled') THEN CURRENT_TIMESTAMP
                WHEN ?1 IN ('queued', 'processing') THEN NULL
                ELSE finished_at END
         WHERE id = ?5",
        params![
            status.as_str(),
            progress,
            message,
            error_message,
            compilation_id
        ],
    )
    .map_err(|e| e.to_string())?;
    // Marcar require-review también actualiza el tomo para que el librero
    // refleje actividad editorial sin consultar compilaciones.
    if matches!(
        status,
        CompilationTaskState::Processing | CompilationTaskState::RequiresReview
    ) {
        let _ = conn.execute(
            "UPDATE magazine_volumes SET updated_at = CURRENT_TIMESTAMP
             WHERE id = (SELECT volume_id FROM magazine_compilations WHERE id = ?1)",
            params![compilation_id],
        );
    }
    conn.query_row(
        "SELECT id, volume_id, status, progress, message, error_message,
                started_at, finished_at, created_at
         FROM magazine_compilations WHERE id = ?1",
        params![compilation_id],
        compilation_record_from_row,
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::editorial::{
        EditorialConfidencePayload, EditorialConflictPayload, EditorialEvidencePayload,
        EditorialSourcePayload,
    };
    use std::collections::HashMap;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE jobs (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 url TEXT NOT NULL,
                 canonical_url TEXT,
                 status TEXT NOT NULL DEFAULT 'completed',
                 progress INTEGER NOT NULL DEFAULT 100,
                 retry_count INTEGER NOT NULL DEFAULT 0,
                 error_message TEXT,
                 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
             );
              CREATE TABLE content_items (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  platform TEXT NOT NULL,
                  platform_content_id TEXT NOT NULL,
                  canonical_url TEXT,
                  author_id TEXT,
                  author_handle TEXT,
                  title TEXT,
                  published_at DATETIME,
                  discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  availability TEXT NOT NULL DEFAULT 'available',
                  job_id INTEGER,
                  UNIQUE(platform, platform_content_id),
                  FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL
              );
              CREATE TABLE media (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  job_id INTEGER NOT NULL UNIQUE,
                  title TEXT,
                  author TEXT,
                  platform TEXT,
                  duration INTEGER,
                  video_path TEXT,
                  poster_path TEXT,
                  source_state TEXT NOT NULL DEFAULT 'local',
                  FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
              );",
        )
        .unwrap();

        let tx = conn.unchecked_transaction().unwrap();
        init_magazine_schema(&tx).unwrap();
        tx.commit().unwrap();
        conn
    }

    #[test]
    fn test_init_magazine_schema_and_canonical_seeds() {
        let conn = setup_test_db();
        let volumes = list_magazine_volumes(&conn).unwrap();

        assert_eq!(
            volumes.len(),
            4,
            "Debe sembrar exactamente los 4 tomos canónicos"
        );
        assert_eq!(volumes[0].id, "vol-recipes");
        assert_eq!(volumes[0].volume_number, "TOMO I");
        assert_eq!(volumes[0].category, "recipes");
        assert_eq!(volumes[0].article_count, 0);
        assert_eq!(volumes[0].source_count, 0);

        assert_eq!(volumes[1].id, "vol-tech");
        assert_eq!(volumes[1].volume_number, "TOMO II");
        assert_eq!(volumes[2].id, "vol-guides");
        assert_eq!(volumes[2].volume_number, "TOMO III");
        assert_eq!(volumes[3].id, "vol-lifestyle");
        assert_eq!(volumes[3].volume_number, "TOMO IV");
    }

    #[test]
    fn test_create_article_from_contract_and_traceability() {
        let mut conn = setup_test_db();

        // Insertar job base simulado
        conn.execute(
            "INSERT INTO jobs (id, url, status) VALUES (42, 'https://www.tiktok.com/@chef/video/12345', 'completed')",
            [],
        )
        .unwrap();

        let payload = EditorialArticlePayload {
            schema_version: "1.0".to_string(),
            article_type: ArticleType::Recipe,
            title: "Salsa Pomodoro Napolitana".to_string(),
            summary: "Extracción técnica de reducción de tomates San Marzano con aceite de oliva."
                .to_string(),
            content: serde_json::json!({
                "yield": "4 porciones",
                "ingredients": [
                    { "name": "Tomates San Marzano", "amount": "800g" },
                    { "name": "Aceite de Oliva Extra Virgen", "amount": "40ml" }
                ],
                "steps": [
                    { "step": 1, "instruction": "Calentar el aceite a fuego medio", "tc": "00:05" },
                    { "step": 2, "instruction": "Sofreír el ajo aplastado", "tc": "00:18" }
                ]
            }),
            sources: vec![EditorialSourcePayload {
                job_id: 42,
                role: SourceRole::Primary,
                citation: Some("@chef_napoli".to_string()),
            }],
            evidence: vec![
                EditorialEvidencePayload {
                    job_id: 42,
                    kind: EvidenceKind::Timestamp,
                    timestamp_start: Some(0.0),
                    timestamp_end: Some(12.5),
                    keyframe_path: Some("data/keyframes/42_01.jpg".to_string()),
                    transcript_text: Some(
                        "Ponemos cuatro cucharadas de aceite de oliva".to_string(),
                    ),
                    fact: Some("40ml aceite de oliva".to_string()),
                    confidence: 0.96,
                },
                EditorialEvidencePayload {
                    job_id: 42,
                    kind: EvidenceKind::Ocr,
                    timestamp_start: Some(13.0),
                    timestamp_end: Some(25.0),
                    keyframe_path: Some("data/keyframes/42_02.jpg".to_string()),
                    transcript_text: Some("Texto en pantalla: 50ml aceite".to_string()),
                    fact: Some("50ml aceite en texto".to_string()),
                    confidence: 0.88,
                },
            ],
            conflicts: vec![EditorialConflictPayload {
                fact_key: "cantidad_aceite".to_string(),
                description: "Audio indica 40ml pero texto superpuesto indica 50ml".to_string(),
                evidence_a_index: 0,
                evidence_b_index: 1,
            }],
            confidence: EditorialConfidencePayload {
                overall: 0.92,
                sections: HashMap::new(),
            },
            editorial_notes: vec!["Conflicto de cantidad detectado entre audio y OCR".to_string()],
            candidate_volume: None,
        };

        // Crear artículo desde el contrato
        let details = create_article_from_contract(
            &mut conn,
            "vol-recipes",
            None,
            &payload,
            Some("data/keyframes/42_hero.jpg".to_string()),
        )
        .unwrap();

        // 1. Validar estado inicial condicionado por el conflicto
        assert_eq!(
            details.article.editorial_state,
            EditorialState::RequiresReview
        );
        assert_eq!(details.article.active_version, 1);
        assert_eq!(details.sources.len(), 1);
        assert_eq!(details.sources[0].job_id, 42);

        // 2. Trazabilidad: La evidencia apunta al job 42 y a timestamps precisos
        assert_eq!(details.evidence.len(), 2);
        assert_eq!(details.evidence[0].timestamp_start, Some(0.0));
        assert_eq!(details.evidence[0].timestamp_end, Some(12.5));

        // 3. Conflictos: 1 conflicto no resuelto
        assert_eq!(details.conflicts.len(), 1);
        assert_eq!(
            details.conflicts[0].resolution_state,
            ConflictResolutionState::Unresolved
        );

        // 4. Resolver conflicto
        let conflict_id = details.conflicts[0].id;
        resolve_magazine_conflict(
            &conn,
            conflict_id,
            ConflictResolutionState::ResolvedA,
            Some("Se prefiere la indicación de voz del chef"),
        )
        .unwrap();

        let reloaded = get_magazine_article_details(&conn, &details.article.id)
            .unwrap()
            .unwrap();
        assert_eq!(
            reloaded.conflicts[0].resolution_state,
            ConflictResolutionState::ResolvedA
        );
        assert_eq!(
            reloaded.conflicts[0].resolution_notes.as_deref(),
            Some("Se prefiere la indicación de voz del chef")
        );

        // 5. Verificar que el tomo ahora registra 1 artículo y 1 fuente
        let volumes = list_magazine_volumes(&conn).unwrap();
        let recipes_volume = volumes.iter().find(|v| v.id == "vol-recipes").unwrap();
        assert_eq!(recipes_volume.article_count, 1);
        assert_eq!(recipes_volume.source_count, 1);
    }

    #[test]
    fn test_article_versioning_immutability() {
        let mut conn = setup_test_db();

        conn.execute(
            "INSERT INTO jobs (id, url, status) VALUES (99, 'https://www.tiktok.com/@tech/video/99', 'completed')",
            [],
        )
        .unwrap();

        let payload = EditorialArticlePayload {
            schema_version: "1.0".to_string(),
            article_type: ArticleType::Technical,
            title: "Configuración Rust Tokio v1".to_string(),
            summary: "Arquitectura inicial del runtime asíncrono.".to_string(),
            content: serde_json::json!({ "threads": 4 }),
            sources: vec![EditorialSourcePayload {
                job_id: 99,
                role: SourceRole::Primary,
                citation: None,
            }],
            evidence: vec![],
            conflicts: vec![],
            confidence: EditorialConfidencePayload {
                overall: 1.0,
                sections: HashMap::new(),
            },
            editorial_notes: vec![],
            candidate_volume: None,
        };

        let initial =
            create_article_from_contract(&mut conn, "vol-tech", None, &payload, None).unwrap();
        assert_eq!(initial.article.active_version, 1);

        // Crear Versión 2
        let v2 = add_article_version(
            &mut conn,
            &initial.article.id,
            "Configuración Rust Tokio v2 (Optimizado)",
            "Actualización tras nuevas métricas de concurrencia.",
            "{\"threads\": 8, \"work_stealing\": true}",
            Some("[\"Revisado por benchmark local\"]"),
            Some("Aumentado pool de workers a 8"),
        )
        .unwrap();

        assert_eq!(v2.version_number, 2);

        // Verificar detalles completos
        let details = get_magazine_article_details(&conn, &initial.article.id)
            .unwrap()
            .unwrap();

        assert_eq!(details.article.active_version, 2);
        assert_eq!(
            details.article.title,
            "Configuración Rust Tokio v2 (Optimizado)"
        );
        assert_eq!(
            details.versions.len(),
            2,
            "Debe preservar ambas versiones en el historial"
        );
        assert_eq!(details.versions[0].version_number, 1);
        assert_eq!(details.versions[1].version_number, 2);
    }

    fn minimal_payload(title: &str) -> EditorialArticlePayload {
        EditorialArticlePayload {
            schema_version: "1.0".to_string(),
            article_type: ArticleType::Guide,
            title: title.to_string(),
            summary: "Resumen mínimo de prueba.".to_string(),
            content: serde_json::json!({ "blocks": [] }),
            sources: vec![],
            evidence: vec![],
            conflicts: vec![],
            confidence: EditorialConfidencePayload {
                overall: 1.0,
                sections: HashMap::new(),
            },
            editorial_notes: vec![],
            candidate_volume: None,
        }
    }

    #[test]
    fn test_chapters_crud_and_ordering() {
        let conn = setup_test_db();

        // Sin capítulos al inicio
        assert!(list_magazine_chapters(&conn, "vol-guides")
            .unwrap()
            .is_empty());

        // Título vacío rechazado
        assert!(create_magazine_chapter(&conn, "vol-guides", "   ", None, None).is_err());
        // Volumen inexistente rechazado
        assert!(create_magazine_chapter(&conn, "vol-missing", "Título", None, None).is_err());

        // Ordinales automáticos secuenciales
        let first =
            create_magazine_chapter(&conn, "vol-guides", "Herramientas", None, None).unwrap();
        assert_eq!(first.ordinal, 0);
        let second =
            create_magazine_chapter(&conn, "vol-guides", "Técnicas", Some("Desc"), None).unwrap();
        assert_eq!(second.ordinal, 1);
        assert_eq!(second.description.as_deref(), Some("Desc"));

        let chapters = list_magazine_chapters(&conn, "vol-guides").unwrap();
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title, "Herramientas");
        assert_eq!(chapters[1].title, "Técnicas");
    }

    #[test]
    fn test_article_rejects_foreign_chapter() {
        let mut conn = setup_test_db();
        let chapter = create_magazine_chapter(&conn, "vol-tech", "Rust", None, None).unwrap();

        // El capítulo pertenece a vol-tech: usarlo desde vol-recipes debe fallar.
        let err = create_article_from_contract(
            &mut conn,
            "vol-recipes",
            Some(chapter.id),
            &minimal_payload("Artículo con capítulo ajeno"),
            None,
        )
        .unwrap_err();
        assert!(
            err.contains("does not exist in volume"),
            "error inesperado: {err}"
        );

        // Capítulo inexistente también falla.
        let err = create_article_from_contract(
            &mut conn,
            "vol-recipes",
            Some(99999),
            &minimal_payload("Artículo con capítulo fantasma"),
            None,
        )
        .unwrap_err();
        assert!(
            err.contains("does not exist in volume"),
            "error inesperado: {err}"
        );

        // Capítulo del mismo volumen sí se acepta.
        let chapter = create_magazine_chapter(&conn, "vol-recipes", "Salsas", None, None).unwrap();
        let details = create_article_from_contract(
            &mut conn,
            "vol-recipes",
            Some(chapter.id),
            &minimal_payload("Artículo con capítulo propio"),
            None,
        )
        .unwrap();
        assert_eq!(details.article.chapter_id, Some(chapter.id));
    }

    #[test]
    fn test_evidence_without_declared_source_is_rejected() {
        let mut conn = setup_test_db();
        let mut payload = minimal_payload("Evidencia huérfana");
        payload.evidence = vec![EditorialEvidencePayload {
            job_id: 7,
            kind: EvidenceKind::TranscriptSegment,
            timestamp_start: Some(1.0),
            timestamp_end: Some(2.0),
            keyframe_path: None,
            transcript_text: Some("texto".to_string()),
            fact: Some("dato".to_string()),
            confidence: 0.9,
        }];

        // Sin fuentes declaradas, el contrato debe rechazar la evidencia.
        let err =
            create_article_from_contract(&mut conn, "vol-tech", None, &payload, None).unwrap_err();
        assert!(
            err.contains("not declared in sources"),
            "error inesperado: {err}"
        );
    }

    #[test]
    fn test_editorial_state_transitions_enforced() {
        let mut conn = setup_test_db();
        let details = create_article_from_contract(
            &mut conn,
            "vol-tech",
            None,
            &minimal_payload("Estados"),
            None,
        )
        .unwrap();
        let article_id = details.article.id.clone();

        // published -> updating es legal; draft directo desde published no existe.
        update_magazine_article_state(&conn, &article_id, EditorialState::Updating).unwrap();
        // updating -> published es legal.
        update_magazine_article_state(&conn, &article_id, EditorialState::Published).unwrap();
        // published -> draft es ilegal.
        let err =
            update_magazine_article_state(&conn, &article_id, EditorialState::Draft).unwrap_err();
        assert!(
            err.contains("illegal editorial transition"),
            "error inesperado: {err}"
        );
        // Artículo inexistente.
        assert!(
            update_magazine_article_state(&conn, "art-missing", EditorialState::Draft).is_err()
        );

        // Tomos usan la misma máquina de estados.
        update_magazine_volume_state(&conn, "vol-tech", EditorialState::Archived).unwrap();
        let err =
            update_magazine_volume_state(&conn, "vol-tech", EditorialState::Published).unwrap_err();
        assert!(
            err.contains("illegal editorial transition"),
            "error inesperado: {err}"
        );
    }

    #[test]
    fn test_compilation_lifecycle_and_terminal_guard() {
        let conn = setup_test_db();

        // Volumen inexistente rechazado.
        assert!(create_magazine_compilation(&conn, "vol-missing").is_err());

        let created = create_magazine_compilation(&conn, "vol-recipes").unwrap();
        assert_eq!(created.status, CompilationTaskState::Queued);
        assert_eq!(created.progress, 0);

        // Avance a processing con progreso.
        let running = update_magazine_compilation(
            &conn,
            created.id,
            CompilationTaskState::Processing,
            40,
            Some("indexando evidencia"),
            None,
        )
        .unwrap();
        assert_eq!(running.status, CompilationTaskState::Processing);
        assert_eq!(running.progress, 40);
        assert!(running.started_at.is_some());

        // Cierre terminal con clamp de progreso y marca de fin.
        let done = update_magazine_compilation(
            &conn,
            created.id,
            CompilationTaskState::Completed,
            500,
            None,
            None,
        )
        .unwrap();
        assert_eq!(done.progress, 100);
        assert!(done.finished_at.is_some());

        // Estado terminal no puede avanzar salvo reintento a queued.
        assert!(update_magazine_compilation(
            &conn,
            created.id,
            CompilationTaskState::Processing,
            10,
            None,
            None
        )
        .is_err());
        let retried = update_magazine_compilation(
            &conn,
            created.id,
            CompilationTaskState::Queued,
            0,
            Some("reintento manual"),
            None,
        )
        .unwrap();
        assert_eq!(retried.status, CompilationTaskState::Queued);
        assert!(retried.finished_at.is_none());

        let history = list_magazine_compilations(&conn, "vol-recipes").unwrap();
        assert_eq!(history.len(), 1);
    }

    #[test]
    fn test_resolve_source_media_with_local_video() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO jobs (id, url, canonical_url, status)
             VALUES (21, 'https://www.tiktok.com/@chef/video/21', 'tiktok:video:21', 'completed')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO media (job_id, title, author, platform, duration, video_path, source_state)
             VALUES (21, 'Salsa', '@chef', 'tiktok', 80, '/videos/21.mp4', 'local')",
            [],
        )
        .unwrap();

        let media = resolve_source_media(&conn, 21)
            .unwrap()
            .expect("el job 21 debe resolverse");
        assert_eq!(media.job_id, 21);
        assert_eq!(media.video_path.as_deref(), Some("/videos/21.mp4"));
        assert_eq!(media.duration_secs, Some(80.0));
        assert_eq!(media.source_state, "local");
        assert_eq!(media.job_status, "completed");
        assert_eq!(media.canonical_url.as_deref(), Some("tiktok:video:21"));
    }

    #[test]
    fn test_resolve_source_media_without_media_row() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO jobs (id, url, status)
             VALUES (22, 'https://www.tiktok.com/@x/video/22', 'completed')",
            [],
        )
        .unwrap();

        // Sin fila en media: se resuelve la ficha, sin video reproducible.
        let media = resolve_source_media(&conn, 22)
            .unwrap()
            .expect("el job 22 debe resolverse sin fila media");
        assert!(media.video_path.is_none());
        assert_eq!(media.duration_secs, None);
    }

    #[test]
    fn test_resolve_source_media_missing_job_returns_none() {
        let conn = setup_test_db();
        assert!(resolve_source_media(&conn, 404).unwrap().is_none());
    }
}
