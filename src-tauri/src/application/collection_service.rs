//! Servicio de sincronizaci\u00f3n de colecciones.
//!
//! Extrae la l\u00f3gica de polling y despacho de colecciones de commands.rs,
//! dejando ese m\u00f3dulo como thin adapter seg\u00fan AGENTS.md.

use crate::application::queue_service::QueueService;
use crate::db;
use std::sync::Arc;

fn mark_source_sync_failed(
    db: &Arc<std::sync::Mutex<rusqlite::Connection>>,
    source_id: i64,
    error: &str,
    app_handle: &tauri::AppHandle,
) {
    match db.lock() {
        Ok(connection) => {
            if let Err(state_error) =
                db::mark_collection_source_failed(&connection, source_id, error)
            {
                crate::commands::emit_log(
                    app_handle,
                    format!("Collection failure state update failed: {}", state_error),
                );
            }
            if let Err(event_error) = db::insert_health_event(
                &connection,
                "tiktok_sync",
                "error",
                error,
                Some("retry_with_backoff"),
                Some("scheduled"),
            ) {
                crate::commands::emit_log(
                    app_handle,
                    format!(
                        "Collection health event persistence failed: {}",
                        event_error
                    ),
                );
            }
        }
        Err(_) => crate::commands::emit_log(
            app_handle,
            "Collection failure state could not lock the database".into(),
        ),
    }
}

/// Sincroniza todas las colecciones activas que tengan el timer vencido.
///
/// # Errores
/// Registra errores individuales por fuente pero no propaga fallos globales —
/// una colecci\u00f3n rota no debe bloquear las dem\u00e1s.
pub async fn sync_due_collections(
    db: Arc<std::sync::Mutex<rusqlite::Connection>>,
    queue: Arc<QueueService>,
    app_handle: tauri::AppHandle,
) {
    let sources = match db.lock() {
        Ok(connection) => match db::get_collection_sources_to_sync(&connection) {
            Ok(sources) => sources,
            Err(error) => {
                crate::commands::emit_log(
                    &app_handle,
                    format!("Collection sync lookup failed: {}", error),
                );
                return;
            }
        },
        Err(_) => {
            crate::commands::emit_log(
                &app_handle,
                "Collection sync could not lock the database".into(),
            );
            return;
        }
    };

    for source in sources {
        match db.lock() {
            Ok(connection) => {
                if let Err(error) = db::mark_collection_source_attempt(&connection, source.id) {
                    crate::commands::emit_log(
                        &app_handle,
                        format!(
                            "Collection sync state update failed for {}: {}",
                            source.url, error
                        ),
                    );
                }
            }
            Err(_) => {
                crate::commands::emit_log(
                    &app_handle,
                    format!(
                        "Collection sync could not lock the database for {}",
                        source.url
                    ),
                );
            }
        }
        let collection_urls = queue
            .expand_collection_with_browser(&source.url, source.browser.as_deref())
            .await;
        let collection_urls = match collection_urls {
            Ok(urls) => urls,
            Err(error) => {
                crate::commands::emit_log(
                    &app_handle,
                    format!("Collection sync failed for {}: {}", source.url, error),
                );
                mark_source_sync_failed(&db, source.id, &error, &app_handle);
                continue;
            }
        };

        if collection_urls.is_empty() {
            let error = "La fuente no devolvió videos accesibles";
            crate::commands::emit_log(
                &app_handle,
                format!("Collection sync failed for {}: {}", source.url, error),
            );
            mark_source_sync_failed(&db, source.id, error, &app_handle);
            continue;
        }

        let mut queued = 0usize;
        let mut failures = Vec::new();
        for video_url in collection_urls.into_iter().take(200) {
            let job_id = match db.lock() {
                Ok(connection) => match db::find_job_id_by_url(&connection, &video_url) {
                    Ok(Some(_)) => None,
                    Ok(None) => match db::insert_job(&connection, &video_url) {
                        Ok(job_id) => Some(job_id),
                        Err(error) => {
                            failures.push(format!("insert failed: {}", error));
                            crate::commands::emit_log(
                                &app_handle,
                                format!("Collection job insert failed: {}", error),
                            );
                            None
                        }
                    },
                    Err(error) => {
                        crate::commands::emit_log(
                            &app_handle,
                            format!("Collection job insert failed: {}", error),
                        );
                        None
                    }
                },
                Err(_) => {
                    failures.push("database lock failed while inserting a collection job".into());
                    None
                }
            };

            if let Some(job_id) = job_id {
                match queue
                    .dispatch_with_browser(job_id, video_url.clone(), source.browser.clone())
                    .await
                {
                    Ok(()) => queued += 1,
                    Err(error) => {
                        failures.push(format!("dispatch failed for {}: {}", video_url, error));
                        if let Ok(connection) = db.lock() {
                            if let Err(state_error) =
                                db::update_job_error(&connection, job_id, "error", &error)
                            {
                                crate::commands::emit_log(
                                    &app_handle,
                                    format!(
                                        "Collection job error persistence failed: {}",
                                        state_error
                                    ),
                                );
                            }
                        }
                    }
                }
            }
        }

        if failures.is_empty() {
            if let Ok(connection) = db.lock() {
                if let Err(error) =
                    db::mark_collection_source_synced(&connection, source.id, queued)
                {
                    crate::commands::emit_log(
                        &app_handle,
                        format!("Collection success state update failed: {}", error),
                    );
                }
            }
            crate::commands::emit_log(
                &app_handle,
                format!("Collection sync complete: {} new jobs queued", queued),
            );
        } else {
            let summary = format!(
                "Collection sync partially failed after {} new jobs: {}",
                queued,
                failures.into_iter().take(3).collect::<Vec<_>>().join("; ")
            );
            crate::commands::emit_log(&app_handle, summary.clone());
            mark_source_sync_failed(&db, source.id, &summary, &app_handle);
        }
    }
}

/// Loop infinito de sincronizaci\u00f3n de colecciones con intervalo de 15 minutos.
/// Diseñado para ejecutarse como tarea de fondo en `tokio::spawn`.
pub async fn start_collection_sync_loop(
    db: Arc<std::sync::Mutex<rusqlite::Connection>>,
    queue: Arc<QueueService>,
    app_handle: tauri::AppHandle,
) {
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(15 * 60)).await;
        sync_due_collections(db.clone(), queue.clone(), app_handle.clone()).await;
    }
}
