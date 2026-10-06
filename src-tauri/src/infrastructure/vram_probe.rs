//! # VRAM Probe (metodo declarado, nunca estimado)
//!
//! Preferencia: 1) `nvidia-smi` (GPU_SMI, HIGH) 2) memoria de proceso
//! (PROCESS_MEMORY, MEDIUM) 3) UNAVAILABLE (NONE). Si una metrica no es
//! confiable es `None`, nunca un numero inventado.

use crate::domain::benchmark::MemoryMetrics;

#[derive(Debug, Clone, Default)]
pub struct VramSnapshot {
    pub total_mb: Option<u64>,
    pub free_mb: Option<u64>,
    pub used_mb: Option<u64>,
}

fn smi_path() -> Option<std::path::PathBuf> {
    let system = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
    let candidate = std::path::PathBuf::from(format!("{system}\\System32\\nvidia-smi.exe"));
    if candidate.is_file() {
        return Some(candidate);
    }
    if which_nvidia_smi() {
        return Some(std::path::PathBuf::from("nvidia-smi"));
    }
    None
}

fn hidden_command(program: &std::path::Path) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    crate::process_control::hide_std_command(&mut command);
    command
}

fn which_nvidia_smi() -> bool {
    let mut cmd = std::process::Command::new("nvidia-smi");
    crate::process_control::hide_std_command(&mut cmd);
    cmd.arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn parse_smi(stdout: &str) -> VramSnapshot {
    // Espera: "8192 MiB, 6400 MiB, 1792 MiB" (total, free, used)
    let nums: Vec<u64> = stdout
        .split(|c: char| !c.is_ascii_digit())
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse::<u64>().ok())
        .collect();
    if nums.len() >= 3 {
        VramSnapshot {
            total_mb: Some(nums[0]),
            free_mb: Some(nums[1]),
            used_mb: Some(nums[2]),
        }
    } else {
        VramSnapshot::default()
    }
}

/// Snapshot puntual de VRAM via nvidia-smi. `None` si no disponible.
pub fn snapshot_vram() -> Option<VramSnapshot> {
    let smi = smi_path()?;
    let out = hidden_command(&smi)
        .args([
            "--query-gpu=memory.total,memory.free,memory.used",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let snap = parse_smi(&String::from_utf8_lossy(&out.stdout));
    if snap.total_mb.is_none() {
        return None;
    }
    Some(snap)
}

pub fn gpu_name() -> String {
    smi_path()
        .and_then(|smi| {
            hidden_command(&smi)
                .args(["--query-gpu=name", "--format=csv,noheader"])
                .output()
                .ok()
        })
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Poller de pico VRAM en hilo dedicado (no bloquea el runtime async).
/// Si nvidia-smi no existe, `peak_used_mb()` devuelve `None` (N/A honesto).
pub struct PeakPoller {
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
    handle: Option<std::thread::JoinHandle<Vec<u64>>>,
}

impl PeakPoller {
    pub fn start(interval_ms: u64) -> Self {
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = stop.clone();
        let handle = std::thread::spawn(move || {
            let mut samples = Vec::new();
            while !flag.load(std::sync::atomic::Ordering::Relaxed) {
                if let Some(s) = snapshot_vram().and_then(|s| s.used_mb) {
                    samples.push(s);
                }
                std::thread::sleep(std::time::Duration::from_millis(interval_ms));
            }
            samples
        });
        Self {
            stop,
            handle: Some(handle),
        }
    }

    pub fn stop(mut self) -> Option<u64> {
        self.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        self.handle
            .take()
            .and_then(|h| h.join().ok())
            .and_then(|v| v.into_iter().max())
    }
}

/// Construye MemoryMetrics desde snapshots. Metodo GPU_SMI/HIGH si hay datos.
pub fn memory_metrics_from_snapshots(
    before: &Option<VramSnapshot>,
    peak_used: Option<u64>,
    after: &Option<VramSnapshot>,
) -> MemoryMetrics {
    match before {
        Some(b) if b.total_mb.is_some() => MemoryMetrics {
            measurement_method: "GPU_SMI".to_string(),
            gpu_name: gpu_name(),
            total_vram_mb: b.total_mb,
            free_vram_before_mb: b.free_mb,
            used_vram_before_mb: b.used_mb,
            used_vram_peak_mb: peak_used.or(b.used_mb),
            free_vram_after_mb: after.as_ref().and_then(|a| a.free_mb),
            confidence: "HIGH".to_string(),
        },
        _ => MemoryMetrics {
            measurement_method: "UNAVAILABLE".to_string(),
            gpu_name: gpu_name(),
            confidence: "NONE".to_string(),
            ..Default::default()
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_smi_numbers() {
        let s = parse_smi("8192 MiB, 6400 MiB, 1792 MiB\n");
        assert_eq!(s.total_mb, Some(8192));
        assert_eq!(s.free_mb, Some(6400));
        assert_eq!(s.used_mb, Some(1792));
    }

    #[test]
    fn test_parse_smi_garbage_is_empty() {
        let s = parse_smi("no driver");
        assert_eq!(s.total_mb, None);
    }

    #[test]
    fn test_unavailable_metrics_have_none_confidence() {
        let m = memory_metrics_from_snapshots(&None, None, &None);
        assert_eq!(m.measurement_method, "UNAVAILABLE");
        assert_eq!(m.confidence, "NONE");
        assert_eq!(m.used_vram_peak_mb, None);
    }

    #[test]
    fn test_poller_returns_option_without_panic() {
        let p = PeakPoller::start(50);
        std::thread::sleep(std::time::Duration::from_millis(120));
        let _peak: Option<u64> = p.stop();
    }
}
