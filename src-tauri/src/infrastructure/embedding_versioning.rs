use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

// ========================================================================
// PHASE 24: Embedding Versioning
// Evita vector drift cuando se cambia el modelo ONNX.
//
// Problema: Embeddings del modelo v1 no son comparables con v2.
// Solución: Cada vector almacena su versión. Puedes:
//   - Reindexar gradualmente (por lotes)
//   - Rechazar queries si hay mismatch de versión
//   - Ejecutar transición con doble índice (old + new)
// ========================================================================

/// Metadatos de versión asociados a un embedding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingMetadata {
    pub model_name: String,
    pub model_version: String,
    pub dimensions: usize,
    pub indexed_at: u64, // Unix timestamp
    pub tenant_id: Option<String>,
}

impl EmbeddingMetadata {
    pub fn new(model_name: &str, model_version: &str, dimensions: usize) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        Self {
            model_name: model_name.to_string(),
            model_version: model_version.to_string(),
            dimensions,
            indexed_at: now,
            tenant_id: None,
        }
    }

    pub fn with_tenant(mut self, tenant_id: &str) -> Self {
        self.tenant_id = Some(tenant_id.to_string());
        self
    }
}

/// Registrador de versiones de modelo activo
pub struct EmbeddingVersionRegistry {
    current_version: String,
    current_model: String,
    dimensions: usize,
}

impl EmbeddingVersionRegistry {
    pub fn new(model_name: &str, version: &str, dimensions: usize) -> Self {
        info!("EmbeddingVersionRegistry: modelo={} v={} dims={}", model_name, version, dimensions);
        Self {
            current_version: version.to_string(),
            current_model: model_name.to_string(),
            dimensions,
        }
    }

    /// Verifica si un vector viejo es compatible con los índices actuales
    pub fn is_compatible(&self, meta: &EmbeddingMetadata) -> bool {
        let compatible = meta.model_name == self.current_model
            && meta.model_version == self.current_version
            && meta.dimensions == self.dimensions;

        if !compatible {
            warn!(
                "VERSION MISMATCH: vector={}/{} != current={}/{} — este vector necesita reindexarse",
                meta.model_name, meta.model_version,
                self.current_model, self.current_version
            );
        }
        compatible
    }

    /// Crea los metadatos para un nuevo embedding
    pub fn create_metadata(&self) -> EmbeddingMetadata {
        EmbeddingMetadata::new(&self.current_model, &self.current_version, self.dimensions)
    }

    /// Migrar a nuevo modelo: retorna true si la transición requiere reindex completo
    pub fn migrate(&mut self, new_model: &str, new_version: &str) -> bool {
        let needs_reindex = new_model != self.current_model;
        
        info!("Migración de modelo: {}/{} → {}/{}  (reindex={})",
            self.current_model, self.current_version,
            new_model, new_version, needs_reindex);

        self.current_model = new_model.to_string();
        self.current_version = new_version.to_string();
        needs_reindex
    }
}
