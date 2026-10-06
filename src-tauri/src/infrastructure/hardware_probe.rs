//! # Hardware Probe (deteccion real, sin hardcodear)
//!
//! Detecta lo que el OS/runtime permite y deja `unknown` / `None` (N/A)
//! en todo lo no medible de forma confiable. La medicion real manda;
//! este modulo nunca inventa VRAM, GPU ni versiones.

use crate::domain::benchmark::HardwareProfile;

fn cpu_label() -> String {
    let arch = std::env::consts::ARCH.to_string();
    let cores = num_cpus::get();
    format!("{arch} ({cores} threads)")
}

#[cfg(windows)]
fn total_ram_mb() -> Option<u64> {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    unsafe {
        let mut status: MEMORYSTATUSEX = std::mem::zeroed();
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if GlobalMemoryStatusEx(&mut status) != 0 {
            Some(status.ullTotalPhys / 1024 / 1024)
        } else {
            None
        }
    }
}

#[cfg(not(windows))]
fn total_ram_mb() -> Option<u64> {
    None
}

fn llama_version_probe() -> String {
    let bin = crate::runtime::binary("llama-server.exe");
    if !bin.is_file() {
        let alt = crate::runtime::binary("llama-server");
        if !alt.is_file() {
            return "unknown".to_string();
        }
        return run_version_probe(&alt);
    }
    run_version_probe(&bin)
}

fn run_version_probe(bin: &std::path::Path) -> String {
    let mut cmd = std::process::Command::new(bin);
    crate::process_control::hide_std_command(&mut cmd);
    match cmd.arg("--version").output() {
        Ok(out) => {
            let raw = format!(
                "{}\n{}",
                String::from_utf8_lossy(&out.stdout),
                String::from_utf8_lossy(&out.stderr)
            );
            let line = raw
                .lines()
                .map(|l| l.trim())
                .find(|l| !l.is_empty())
                .unwrap_or("");
            if line.is_empty() {
                "unknown".to_string()
            } else {
                line.chars().take(120).collect()
            }
        }
        Err(_) => "unknown".to_string(),
    }
}

/// Detecta el perfil de hardware real del host de benchmark.
pub fn detect_hardware_profile() -> HardwareProfile {
    HardwareProfile {
        cpu: cpu_label(),
        gpu: std::env::var("PULSARIA_GPU_LABEL").unwrap_or_else(|_| "unknown".to_string()),
        vram_mb: std::env::var("PULSARIA_VRAM_MB")
            .ok()
            .and_then(|v| v.parse::<u64>().ok()),
        ram_mb: total_ram_mb(),
        os: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        runtime: "llama-server".to_string(),
        llama_version: llama_version_probe(),
        threads: Some(num_cpus::get() as u32),
        context_size: Some(4096),
        batch_size: None,
        gpu_layers: None,
        quantization: "unknown".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_probe_never_panics_and_reports_os() {
        let p = detect_hardware_profile();
        assert!(!p.os.is_empty());
        assert!(!p.cpu.is_empty());
    }
}
