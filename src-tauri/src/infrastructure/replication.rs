use metrics::{counter, gauge};
use std::collections::HashMap;
use tokio::sync::RwLock;
use tracing::{info, warn};

// ========================================================================
// PHASE 32: Distributed Replication
// Cada shard tiene una o más réplicas en nodos secundarios.
// Si el nodo primario cae, el coordinador hace failover automático.
//
// Arquitectura:
//   Primary Shard A → Replica A1, Replica A2
//   Primary Shard B → Replica B1
//
// Escenario failover:
//   Primary A offline → Coordinator promueve Replica A1 a Primary
// ========================================================================

#[derive(Debug, Clone, PartialEq)]
pub enum ReplicaState {
    Primary,
    Replica,
    Offline,
}

#[derive(Debug, Clone)]
pub struct ShardReplica {
    pub node_url: String,
    pub shard_id: usize,
    pub state: ReplicaState,
    pub last_heartbeat_secs: u64,
}

impl ShardReplica {
    pub fn new(node_url: &str, shard_id: usize, state: ReplicaState) -> Self {
        Self {
            node_url: node_url.to_string(),
            shard_id,
            state,
            last_heartbeat_secs: 0,
        }
    }

    pub fn is_alive(&self) -> bool {
        self.state != ReplicaState::Offline
    }
}

/// Mapa de replicación: shard_id → Vec<ShardReplica>
pub struct ReplicationMap {
    shards: RwLock<HashMap<usize, Vec<ShardReplica>>>,
    #[allow(dead_code)]
    heartbeat_timeout_secs: u64,
}

impl ReplicationMap {
    pub fn new(heartbeat_timeout_secs: u64) -> Self {
        Self {
            shards: RwLock::new(HashMap::new()),
            heartbeat_timeout_secs,
        }
    }

    /// Registra una réplica para un shard
    pub async fn register_replica(&self, replica: ShardReplica) {
        let shard_id = replica.shard_id;
        let mut shards = self.shards.write().await;
        shards.entry(shard_id).or_default().push(replica);

        let replica_count: usize = shards.values().map(|v| v.len()).sum();
        gauge!("replication_total_replicas").set(replica_count as f64);
        info!("Réplica registrada para shard {}", shard_id);
    }

    /// Retorna la URL activa para un shard (primary si disponible, sino primer replica viva)
    pub async fn get_active_url(&self, shard_id: usize) -> Option<String> {
        let shards = self.shards.read().await;
        let replicas = shards.get(&shard_id)?;

        // 1. Intentar Primary primero
        if let Some(primary) = replicas
            .iter()
            .find(|r| r.state == ReplicaState::Primary && r.is_alive())
        {
            return Some(primary.node_url.clone());
        }

        // 2. Failover a primera réplica viva
        warn!(
            "Shard {} — Primary offline, haciendo failover a réplica",
            shard_id
        );
        counter!("replication_failovers_total").increment(1);
        replicas
            .iter()
            .find(|r| r.state == ReplicaState::Replica && r.is_alive())
            .map(|r| r.node_url.clone())
    }

    /// Marca un nodo como Offline (llamado por heartbeat monitor)
    pub async fn mark_offline(&self, node_url: &str) {
        let mut shards = self.shards.write().await;
        for replicas in shards.values_mut() {
            for r in replicas.iter_mut() {
                if r.node_url == node_url {
                    r.state = ReplicaState::Offline;
                    warn!("Nodo {} marcado como OFFLINE", node_url);
                    counter!("replication_nodes_offline_total").increment(1);
                }
            }
        }
        let online: usize = shards
            .values()
            .flat_map(|v| v.iter())
            .filter(|r| r.is_alive())
            .count();
        gauge!("replication_nodes_online").set(online as f64);
    }

    /// Promueve la primera réplica viva de un shard a Primary
    pub async fn promote_replica(&self, shard_id: usize) -> Option<String> {
        let mut shards = self.shards.write().await;
        let replicas = shards.get_mut(&shard_id)?;

        // Degradar primaries existentes (deben estar offline)
        for r in replicas.iter_mut() {
            if r.state == ReplicaState::Primary {
                r.state = ReplicaState::Offline;
            }
        }

        // Promover la primera réplica viva
        if let Some(new_primary) = replicas
            .iter_mut()
            .find(|r| r.state == ReplicaState::Replica)
        {
            new_primary.state = ReplicaState::Primary;
            let url = new_primary.node_url.clone();
            counter!("replication_promotions_total").increment(1);
            info!("Shard {} — promovido nuevo Primary: {}", shard_id, url);
            return Some(url);
        }

        warn!(
            "Shard {} — no hay réplicas disponibles para promover",
            shard_id
        );
        None
    }
}
