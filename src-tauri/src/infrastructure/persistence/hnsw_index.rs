use crate::domain::ports::VectorIndex;
use hnsw::{Hnsw, Searcher};
use metrics::{gauge, histogram};
use rand_core::SeedableRng;
use rand_pcg::Pcg64;
use serde::{Deserialize, Serialize};
use space::Metric;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::sync::{Arc, RwLock};

// ========================================================================
// INFRASTRUCTURE: HNSW Vector Index (En memoria)
// Búsqueda ultrarrápida (O(log N)) para embeddings generados localmente.
// Aisla la complejidad matemática del dominio.
// ========================================================================

use serde_big_array::BigArray;

const DIMS: usize = 384; // all-MiniLM-L6-v2 size

#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub struct Vector(#[serde(with = "BigArray")] pub [f32; DIMS]);

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Euclidean;

impl Metric<Vector> for Euclidean {
    type Unit = u32;

    #[inline]
    fn distance(&self, a: &Vector, b: &Vector) -> u32 {
        let mut dist = 0.0;
        for i in 0..DIMS {
            let diff = a.0[i] - b.0[i];
            dist += diff * diff;
        }
        // Multiplicamos para mapear float a u32 sin perder precisión esencial
        (dist.sqrt() * 1_000_000.0) as u32
    }
}

pub struct HnswVectorIndex {
    // Usamos espacio Euclidiano y Pcg64 para el PRNG embebido en HNSW
    // 12 (M) = Conexiones por nodo en cada capa. 24 (M0) = Conexiones en capa base.
    index: Arc<RwLock<Hnsw<Euclidean, Vector, Pcg64, 12, 24>>>,

    // Mapeo Rápido: ID_Interno_HNSW -> (job_id, chunk_index)
    metadata: Arc<RwLock<HashMap<usize, (i64, i64)>>>,
}

#[derive(Serialize, Deserialize)]
struct IndexSnapshot {
    hnsw: Hnsw<Euclidean, Vector, Pcg64, 12, 24>,
    metadata: HashMap<usize, (i64, i64)>,
}

#[derive(Serialize)]
struct IndexSnapshotRef<'a> {
    hnsw: &'a Hnsw<Euclidean, Vector, Pcg64, 12, 24>,
    metadata: &'a HashMap<usize, (i64, i64)>,
}

impl Default for HnswVectorIndex {
    fn default() -> Self {
        Self {
            index: Arc::new(RwLock::new(Hnsw::new_prng(
                Euclidean,
                Pcg64::seed_from_u64(42),
            ))),
            metadata: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

impl HnswVectorIndex {
    pub fn new() -> Self {
        Self::default()
    }
}

impl VectorIndex for HnswVectorIndex {
    fn insert(
        &self,
        _internal_id: usize,
        job_id: i64,
        chunk_index: i64,
        embedding: &[f32],
    ) -> Result<(), String> {
        if embedding.len() != DIMS {
            return Err(format!(
                "Vector dimension mismatch: expected {}, got {}",
                DIMS,
                embedding.len()
            ));
        }

        let mut arr = [0.0; DIMS];
        arr.copy_from_slice(embedding);

        // Bug #64 FIX: Hold metadata write lock across check+insert to prevent TOCTOU.
        // Without this, two threads could both pass the duplicate check and insert
        // the same (job_id, chunk_index) concurrently.
        let mut meta_guard = self
            .metadata
            .write()
            .map_err(|_| "Poison error HNSW metadata")?;
        if meta_guard
            .values()
            .any(|(stored_job, stored_chunk)| *stored_job == job_id && *stored_chunk == chunk_index)
        {
            return Ok(());
        }

        let mut index_guard = self.index.write().map_err(|_| "Poison error HNSW index")?;

        // HNSW asigna el identificador real del nodo. El ID compuesto del
        // dominio no coincide necesariamente con ese índice secuencial.
        let mut searcher = Searcher::default();
        let node_id = index_guard.insert(Vector(arr), &mut searcher);

        meta_guard.insert(node_id, (job_id, chunk_index));

        Ok(())
    }

    fn search(&self, query_vec: &[f32], limit: usize) -> Result<Vec<(usize, f32)>, String> {
        if query_vec.len() != DIMS {
            return Err("Invalid query vector dimension".into());
        }
        if limit == 0 {
            return Ok(Vec::new());
        }

        let mut arr = [0.0; DIMS];
        arr.copy_from_slice(query_vec);

        let index_guard = self
            .index
            .read()
            .map_err(|_| "Poison error HNSW index read")?;
        let mut searcher = Searcher::default();
        let search_limit = limit.max(24);
        let mut dest = vec![
            space::Neighbor {
                index: 0,
                distance: 0
            };
            search_limit
        ];
        index_guard.nearest(&Vector(arr), search_limit, &mut searcher, &mut dest);

        // Los embeddings están normalizados. Para vectores unitarios se cumple
        // cosine = 1 - euclidean_distance² / 2.
        let results = dest
            .into_iter()
            .take(limit)
            .map(|neighbor| {
                let distance = neighbor.distance as f32 / 1_000_000.0;
                let similarity = (1.0 - (distance * distance) / 2.0).clamp(-1.0, 1.0);
                (neighbor.index, similarity)
            })
            .collect();

        Ok(results)
    }

    fn get_chunk_info(&self, internal_id: usize) -> Result<(i64, i64), String> {
        let meta_guard = self
            .metadata
            .read()
            .map_err(|_| "Poison error HNSW metadata read")?;
        if let Some(info) = meta_guard.get(&internal_id) {
            Ok(*info)
        } else {
            Err(format!("Metadata for ID {} not found", internal_id))
        }
    }

    fn snapshot_index(&self, file_path: &str) -> Result<(), String> {
        let start_time = std::time::Instant::now();

        let index_guard = self
            .index
            .read()
            .map_err(|_| "Poison error HNSW index read")?;
        let meta_guard = self
            .metadata
            .read()
            .map_err(|_| "Poison error HNSW metadata read")?;

        gauge!("index_size_vectors").set(meta_guard.len() as f64);

        if let Some(parent) = std::path::Path::new(file_path).parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create snapshot dir: {}", e))?;
        }

        let temp_file_path = format!("{}.tmp", file_path);
        let file = File::create(&temp_file_path)
            .map_err(|e| format!("Failed to create snapshot temp file: {}", e))?;
        let writer = BufWriter::new(file);

        let snapshot = IndexSnapshotRef {
            hnsw: &index_guard,
            metadata: &meta_guard,
        };

        bincode::serialize_into(writer, &snapshot).map_err(|e| {
            let _ = std::fs::remove_file(&temp_file_path); // Cleanup temp file on failure
            format!("Failed to serialize index: {}", e)
        })?;

        // Atomic rename para evitar corrupción (Protección contra Test 4 - Hard Crashing)
        std::fs::rename(&temp_file_path, file_path)
            .map_err(|e| format!("Failed to commit snapshot file atomically: {}", e))?;

        histogram!("index_snapshot_seconds").record(start_time.elapsed().as_secs_f64());
        tracing::info!(
            "HNSW Index snapshot completed en {:.2?} ({} vectores)",
            start_time.elapsed(),
            meta_guard.len()
        );
        Ok(())
    }

    fn load_index(&self, file_path: &str) -> Result<(), String> {
        if !std::path::Path::new(file_path).exists() {
            tracing::info!(
                "No existe snapshot de HNSW Index en {} - Se arranca vacío.",
                file_path
            );
            return Ok(());
        }

        let file =
            File::open(file_path).map_err(|e| format!("Failed to open snapshot file: {}", e))?;
        let reader = BufReader::new(file);

        let snapshot: IndexSnapshot = bincode::deserialize_from(reader)
            .map_err(|e| format!("Failed to deserialize index: {}", e))?;

        let mut index_guard = self
            .index
            .write()
            .map_err(|_| "Poison error HNSW index write")?;
        *index_guard = snapshot.hnsw;

        let mut meta_guard = self
            .metadata
            .write()
            .map_err(|_| "Poison error HNSW metadata write")?;
        *meta_guard = snapshot.metadata;

        gauge!("index_size_vectors").set(meta_guard.len() as f64);
        tracing::info!(
            "HNSW Index restaurado desde disco con éxito ({} vectores)",
            meta_guard.len()
        );

        Ok(())
    }
}
