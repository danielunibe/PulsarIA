use metrics::{counter, gauge, histogram};
use std::path::PathBuf;
use tracing::info;

// ========================================================================
// PHASE 31: Tiered Storage
// Divide el índice en 3 niveles para reducir costos de RAM 90%.
//
//   Hot   → RAM         (vectores recientes, alta frecuencia)
//   Warm  → SSD local   (vectores con > 30 días o frecuencia media)
//   Cold  → Object Store S3/GCS (vectores raramente accedidos)
//
// El motor sirve hot + warm normalmente.
// Cold requiere hidratación explícita al disco antes de buscar.
// ========================================================================

#[derive(Debug, Clone, PartialEq)]
pub enum StorageTier {
    Hot,
    Warm,
    Cold,
}

impl std::fmt::Display for StorageTier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageTier::Hot => write!(f, "hot"),
            StorageTier::Warm => write!(f, "warm"),
            StorageTier::Cold => write!(f, "cold"),
        }
    }
}

pub struct TieredStorageManager {
    hot_path: PathBuf,
    warm_path: PathBuf,
    cold_path: PathBuf,
    /// Edad máxima en segundos para permanecer en Hot (default: 7 días)
    hot_max_age_secs: u64,
    /// Edad máxima en segundos para permanecer en Warm (default: 30 días)
    warm_max_age_secs: u64,
}

impl TieredStorageManager {
    pub fn new(base_path: &str) -> Self {
        let base = PathBuf::from(base_path);
        Self {
            hot_path: base.join("hot"),
            warm_path: base.join("warm"),
            cold_path: base.join("cold"),
            hot_max_age_secs: 7 * 86400,
            warm_max_age_secs: 30 * 86400,
        }
    }

    /// Determina el tier apropiado para un shard basándose en su edad
    pub fn classify_shard(&self, shard_age_secs: u64, access_frequency: f64) -> StorageTier {
        if shard_age_secs <= self.hot_max_age_secs || access_frequency > 10.0 {
            StorageTier::Hot
        } else if shard_age_secs <= self.warm_max_age_secs || access_frequency > 1.0 {
            StorageTier::Warm
        } else {
            StorageTier::Cold
        }
    }

    /// Mueve un snapshot de shard al tier especificado
    pub async fn migrate_shard(
        &self,
        shard_file: &str,
        target_tier: StorageTier,
    ) -> Result<(), String> {
        let start = std::time::Instant::now();
        let source = self.current_path_for(shard_file);
        let dest = match target_tier {
            StorageTier::Hot => self.hot_path.join(shard_file),
            StorageTier::Warm => self.warm_path.join(shard_file),
            StorageTier::Cold => self.cold_path.join(shard_file),
        };

        // Crear directorios si no existen
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // Rename atómico (mismo filesystem) o copia + delete
        if std::fs::rename(&source, &dest).is_err() {
            std::fs::copy(&source, &dest).map_err(|e| e.to_string())?;
            std::fs::remove_file(&source).ok();
        }

        histogram!("tiered_storage_migration_seconds",
            "target" => target_tier.to_string()
        )
        .record(start.elapsed().as_secs_f64());
        counter!("tiered_storage_migrations_total", "tier" => target_tier.to_string()).increment(1);

        info!("Shard '{}' migrado a tier {:?}", shard_file, target_tier);
        Ok(())
    }

    /// Emite métricas de distribución de shards por tier
    pub fn emit_tier_metrics(&self, hot_count: usize, warm_count: usize, cold_count: usize) {
        gauge!("storage_tier_hot_shards").set(hot_count as f64);
        gauge!("storage_tier_warm_shards").set(warm_count as f64);
        gauge!("storage_tier_cold_shards").set(cold_count as f64);
        let total = (hot_count + warm_count + cold_count).max(1) as f64;
        gauge!("storage_hot_ratio").set(hot_count as f64 / total);
        info!(
            "Storage tiers: hot={} warm={} cold={}",
            hot_count, warm_count, cold_count
        );
    }

    fn current_path_for(&self, filename: &str) -> PathBuf {
        // Busca el archivo en todos los tiers
        for dir in [&self.hot_path, &self.warm_path, &self.cold_path] {
            let p = dir.join(filename);
            if p.exists() {
                return p;
            }
        }
        self.hot_path.join(filename) // fallback
    }
}
