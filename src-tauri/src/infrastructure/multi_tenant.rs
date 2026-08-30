use metrics::{counter, gauge};
use std::collections::HashMap;
use tokio::sync::RwLock;
use tracing::{info, warn};

// ========================================================================
// PHASE 26: Multi-Tenant Engine
// Cada cliente tiene aislamiento completo de índice, caché y configuración.
//
// Arquitectura:
//   API Gateway → Tenant Router → Tenant-Scoped Services
//
// El tenant_id se extrae del JWT claim "sub" o del header X-Tenant-ID.
//
// Cada tenant tiene:
//   - namespace en Redis cache  (pulsar:tenant_id:cache:hash)
//   - partición dedicada en HNSW (podría ser un shard separado)
//   - configuración independiente (shard_count, TTL, rate limits)
// ========================================================================

#[derive(Debug, Clone)]
pub struct TenantConfig {
    pub tenant_id: String,
    pub shard_count: usize,
    pub cache_ttl_secs: u64,
    pub rate_limit_per_sec: f32,
    pub max_results: usize,
}

impl TenantConfig {
    pub fn default_for(tenant_id: &str) -> Self {
        Self {
            tenant_id: tenant_id.to_string(),
            shard_count: 2,
            cache_ttl_secs: 3600,
            rate_limit_per_sec: 10.0,
            max_results: 10,
        }
    }
}

/// Registro centralizado de tenants activos
pub struct TenantRegistry {
    tenants: RwLock<HashMap<String, TenantConfig>>,
}

impl TenantRegistry {
    pub fn new() -> Self {
        Self {
            tenants: RwLock::new(HashMap::new()),
        }
    }

    /// Registra un nuevo tenant (en prod: desde DB o admin API)
    pub async fn register(&self, config: TenantConfig) {
        let tenant_id = config.tenant_id.clone();
        let mut tenants = self.tenants.write().await;
        tenants.insert(tenant_id.clone(), config);
        gauge!("tenants_active").set(tenants.len() as f64);
        info!("Tenant registrado: {}", tenant_id);
    }

    /// Obtiene la configuración de un tenant o retorna la default
    pub async fn get_or_default(&self, tenant_id: &str) -> TenantConfig {
        let tenants = self.tenants.read().await;
        tenants.get(tenant_id).cloned().unwrap_or_else(|| {
            warn!(
                "Tenant '{}' no registrado — usando configuración por defecto",
                tenant_id
            );
            counter!("tenant_unknown_requests_total").increment(1);
            TenantConfig::default_for(tenant_id)
        })
    }

    pub async fn remove(&self, tenant_id: &str) {
        let mut tenants = self.tenants.write().await;
        tenants.remove(tenant_id);
        gauge!("tenants_active").set(tenants.len() as f64);
        info!("Tenant eliminado: {}", tenant_id);
    }

    pub async fn count(&self) -> usize {
        self.tenants.read().await.len()
    }
}

/// Genera el namespace de Redis para un tenant específico
/// Garantiza aislamiento total entre tenants en la caché compartida.
pub fn tenant_cache_namespace(tenant_id: &str, base_key: &str) -> String {
    format!("pulsar:{}:{}", tenant_id, base_key)
}

/// Extrae el tenant_id desde un JWT claim o header
pub fn extract_tenant_id(jwt_sub: Option<&str>, tenant_header: Option<&str>) -> String {
    tenant_header.or(jwt_sub).unwrap_or("default").to_string()
}
