//! Verifiable local acceleration inventory and the first performance policy.
//!
//! This module deliberately distinguishes hardware detection from a runtime
//! proof.  Finding an NVIDIA adapter is useful information, but it is not
//! enough to claim that Whisper, FFmpeg or llama.cpp is using CUDA.  The
//! commands below keep those states separate so the UI can explain a fallback
//! instead of displaying a misleading "RTX active" badge.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

fn hidden_command<S: AsRef<OsStr>>(program: S) -> Command {
    let mut command = Command::new(program);
    crate::process_control::hide_std_command(&mut command);
    command
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityState {
    Detected,
    Available,
    Verified,
    Active,
    Fallback,
    Unavailable,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterProfile {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub dedicated: bool,
    pub driver: Option<String>,
    pub vram_total_bytes: Option<u64>,
    pub vram_used_bytes: Option<u64>,
    pub vram_available_bytes: Option<u64>,
    pub temperature_c: Option<f32>,
    pub utilization_percent: Option<f32>,
    pub state: CapabilityState,
    pub source: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityReport {
    pub name: String,
    pub state: CapabilityState,
    pub reason: Option<String>,
    pub runtime_version: Option<String>,
    pub measured_ms: Option<u128>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccelerationStatus {
    pub generated_at: String,
    pub adapters: Vec<AdapterProfile>,
    pub power_source: String,
    pub user_state: String,
    pub idle_seconds: u64,
    pub current_mode: String,
    pub active_adapter_id: Option<String>,
    pub capabilities: Vec<CapabilityReport>,
    pub runtime_manifest_sha256: Option<String>,
    pub fallback_reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkResult {
    pub name: String,
    pub state: CapabilityState,
    pub duration_ms: u128,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccelerationBenchmark {
    pub started_at: String,
    pub finished_at: String,
    pub overall_state: CapabilityState,
    pub results: Vec<BenchmarkResult>,
    pub status: AccelerationStatus,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformancePolicy {
    pub mode: String,
    pub effective_profile: String,
    pub user_state: String,
    pub power_source: String,
    pub max_gpu_tasks: u8,
    pub background_allowed: bool,
    pub whisper_compute_type: String,
    pub llm_gpu_layers: u32,
    pub reason: String,
    pub updated_at: String,
}

#[derive(Clone, Debug)]
struct NvidiaSample {
    index: String,
    name: String,
    memory_total_bytes: Option<u64>,
    memory_used_bytes: Option<u64>,
    driver: Option<String>,
    temperature_c: Option<f32>,
    utilization_percent: Option<f32>,
}

pub fn probe(mode: &str, preferred_adapter_id: Option<&str>) -> AccelerationStatus {
    let started = Instant::now();
    let nvidia = nvidia_samples();
    let mut adapters = dxgi_like_adapters();

    if adapters.is_empty() {
        adapters.extend(nvidia.iter().map(|sample| {
            AdapterProfile {
                id: format!("nvidia-{}", sample.index),
                name: sample.name.clone(),
                vendor: "NVIDIA".into(),
                dedicated: true,
                driver: sample.driver.clone(),
                vram_total_bytes: sample.memory_total_bytes,
                vram_used_bytes: sample.memory_used_bytes,
                vram_available_bytes: sample
                    .memory_total_bytes
                    .zip(sample.memory_used_bytes)
                    .map(|(total, used)| total.saturating_sub(used)),
                temperature_c: sample.temperature_c,
                utilization_percent: sample.utilization_percent,
                state: CapabilityState::Detected,
                source: "nvidia-smi".into(),
            }
        }));
    } else {
        for sample in &nvidia {
            if let Some(adapter) = adapters.iter_mut().find(|adapter| {
                adapter.dedicated
                    && (adapter.name.eq_ignore_ascii_case(&sample.name)
                        || adapter.name.contains(&sample.name)
                        || sample.name.contains(&adapter.name))
            }) {
                adapter.id = format!("nvidia-{}", sample.index);
                adapter.driver = sample.driver.clone().or_else(|| adapter.driver.clone());
                adapter.vram_total_bytes = sample.memory_total_bytes.or(adapter.vram_total_bytes);
                adapter.vram_used_bytes = sample.memory_used_bytes;
                adapter.vram_available_bytes = sample
                    .memory_total_bytes
                    .zip(sample.memory_used_bytes)
                    .map(|(total, used)| total.saturating_sub(used));
                adapter.temperature_c = sample.temperature_c;
                adapter.utilization_percent = sample.utilization_percent;
            }
        }
    }

    let dedicated_adapter = preferred_adapter_id
        .and_then(|preferred| {
            adapters
                .iter()
                .find(|adapter| adapter.id == preferred && adapter.dedicated)
        })
        .or_else(|| adapters.iter().find(|adapter| adapter.dedicated));
    let dedicated_id = dedicated_adapter.map(|adapter| adapter.id.clone());
    let power = power_source();
    let (idle_seconds, user_state) = user_activity();
    let cuda = cuda_probe();
    let cuda_runtime = cuda_runtime_inventory();
    let ffmpeg = ffmpeg_inventory();
    let llama = llama_inventory();

    let whisper = if dedicated_adapter.is_none() {
        CapabilityReport {
            name: "whisper_cuda".into(),
            state: CapabilityState::Unavailable,
            reason: Some("No se detectó un adaptador NVIDIA dedicado.".into()),
            runtime_version: cuda.runtime_version,
            measured_ms: Some(started.elapsed().as_millis()),
        }
    } else if cuda.device_count.unwrap_or(0) == 0 {
        CapabilityReport {
            name: "whisper_cuda".into(),
            state: CapabilityState::Fallback,
            reason: Some(cuda.reason),
            runtime_version: cuda.runtime_version,
            measured_ms: Some(started.elapsed().as_millis()),
        }
    } else if !cuda_runtime.complete {
        CapabilityReport {
            name: "whisper_cuda".into(),
            state: CapabilityState::Fallback,
            reason: Some(format!(
                "CUDA fue detectado por CTranslate2, pero el runtime empaquetado está incompleto: {}.",
                cuda_runtime.missing.join(", ")
            )),
            runtime_version: cuda.runtime_version,
            measured_ms: Some(started.elapsed().as_millis()),
        }
    } else if mode == "efficient" || (mode == "intelligent" && user_state == "active") {
        CapabilityReport {
            name: "whisper_cuda".into(),
            state: CapabilityState::Available,
            reason: Some(
                "Disponible; el perfil actual prioriza la respuesta de la interfaz.".into(),
            ),
            runtime_version: cuda.runtime_version,
            measured_ms: Some(started.elapsed().as_millis()),
        }
    } else {
        CapabilityReport {
            name: "whisper_cuda".into(),
            state: CapabilityState::Available,
            reason: Some(
                "CTranslate2 y el runtime empaquetado están disponibles; falta una transcripción CUDA real para marcarlo verificado.".into(),
            ),
            runtime_version: cuda.runtime_version,
            measured_ms: Some(started.elapsed().as_millis()),
        }
    };

    let ffmpeg_capability = if !ffmpeg.present {
        CapabilityReport {
            name: "ffmpeg_nvdec_nvenc".into(),
            state: CapabilityState::Unavailable,
            reason: Some("No se encontró el FFmpeg empaquetado.".into()),
            runtime_version: ffmpeg.version,
            measured_ms: None,
        }
    } else if ffmpeg.has_nvenc || ffmpeg.has_nvdec {
        CapabilityReport {
            name: "ffmpeg_nvdec_nvenc".into(),
            state: CapabilityState::Available,
            reason: Some("El binario incluye rutas NVDEC/NVENC; la ejecución real se confirma con el benchmark.".into()),
            runtime_version: ffmpeg.version,
            measured_ms: None,
        }
    } else {
        CapabilityReport {
            name: "ffmpeg_nvdec_nvenc".into(),
            state: CapabilityState::Fallback,
            reason: Some("El FFmpeg empaquetado no expone encoders/decoders NVIDIA.".into()),
            runtime_version: ffmpeg.version,
            measured_ms: None,
        }
    };

    let llm_capability = if !llama.present {
        CapabilityReport {
            name: "llm_cuda".into(),
            state: CapabilityState::Unavailable,
            reason: Some("No se encontró llama-server.exe.".into()),
            runtime_version: None,
            measured_ms: None,
        }
    } else if llama.cuda_device {
        CapabilityReport {
            name: "llm_cuda".into(),
            state: CapabilityState::Available,
            reason: Some("El sidecar reporta un dispositivo CUDA; aún falta una generación real para marcarlo activo.".into()),
            runtime_version: llama.version,
            measured_ms: None,
        }
    } else {
        CapabilityReport {
            name: "llm_cuda".into(),
            state: CapabilityState::Fallback,
            reason: Some(llama.reason),
            runtime_version: llama.version,
            measured_ms: None,
        }
    };

    let directml = if adapters.is_empty() {
        CapabilityReport {
            name: "embeddings_gpu".into(),
            state: CapabilityState::Unavailable,
            reason: Some("No hay un adaptador DirectX 12 identificado.".into()),
            runtime_version: None,
            measured_ms: None,
        }
    } else {
        CapabilityReport {
            name: "embeddings_gpu".into(),
            state: CapabilityState::Fallback,
            reason: Some("Hay adaptadores DirectX 12, pero ONNX sigue configurado en CPU hasta verificar un proveedor GPU por benchmark de lotes.".into()),
            runtime_version: None,
            measured_ms: None,
        }
    };

    let mut capabilities = vec![whisper, ffmpeg_capability, llm_capability, directml];
    let fallback_reason = capabilities
        .iter()
        .find(|capability| matches!(capability.state, CapabilityState::Fallback))
        .and_then(|capability| capability.reason.clone());

    for adapter in &mut adapters {
        adapter.state = if adapter.dedicated {
            CapabilityState::Detected
        } else {
            CapabilityState::Available
        };
    }

    // Keep the browser/WebView path explicit: WebGL is not one of the
    // verified audiovisual accelerators reported here.
    capabilities.push(CapabilityReport {
        name: "webview_video_decode".into(),
        state: CapabilityState::Detected,
        reason: Some("La decodificación HTML depende de WebView2 y de la política de Windows; requiere smoke nativo.".into()),
        runtime_version: None,
        measured_ms: None,
    });

    AccelerationStatus {
        generated_at: chrono::Utc::now().to_rfc3339(),
        adapters,
        power_source: power,
        user_state,
        idle_seconds,
        current_mode: mode.to_string(),
        active_adapter_id: dedicated_id,
        capabilities,
        runtime_manifest_sha256: runtime_manifest_sha256(),
        fallback_reason,
    }
}

pub fn benchmark(
    mode: &str,
    preferred_adapter_id: Option<&str>,
    sample_path: Option<&str>,
) -> AccelerationBenchmark {
    let started_at = chrono::Utc::now().to_rfc3339();
    let mut results = Vec::new();
    results.push(benchmark_cuda());
    results.extend(benchmark_ffmpeg(sample_path));
    results.push(benchmark_llama());
    let status = probe(mode, preferred_adapter_id);
    let overall_state = if results
        .iter()
        .any(|result| matches!(result.state, CapabilityState::Verified))
    {
        CapabilityState::Verified
    } else {
        CapabilityState::Fallback
    };
    AccelerationBenchmark {
        started_at,
        finished_at: chrono::Utc::now().to_rfc3339(),
        overall_state,
        results,
        status,
    }
}

pub fn performance_policy(
    mode: &str,
    background_processing: bool,
    ac_only_for_maximum: bool,
    idle_threshold_seconds: u64,
    status: &AccelerationStatus,
) -> PerformancePolicy {
    let is_idle = status.idle_seconds >= idle_threshold_seconds.max(1);
    let on_ac = status.power_source == "ac";
    let resource_pressure = status.adapters.iter().any(|adapter| {
        adapter.dedicated
            && (adapter
                .temperature_c
                .map(|temperature| temperature >= 85.0)
                .unwrap_or(false)
                || adapter
                    .vram_available_bytes
                    .map(|available| available < 512 * 1024 * 1024)
                    .unwrap_or(false))
    });
    let (effective_profile, max_gpu_tasks, whisper_compute_type, llm_gpu_layers, reason) =
        match mode {
            _ if resource_pressure => (
                "safe",
                1,
                "int8",
                0,
                "Presión térmica o de VRAM detectada: se reduce la carga y se usa el fallback seguro.",
            ),
            "efficient" => (
                "efficient",
                1,
                "int8",
                0,
                "Perfil eficiente seleccionado por el usuario.",
            ),
            "maximum" if ac_only_for_maximum && !on_ac => (
                "efficient",
                1,
                "int8",
                0,
                "Máximo está limitado porque el equipo está usando batería.",
            ),
            "maximum" => (
                "maximum",
                1,
                "float16",
                99,
                "Perfil máximo permitido; la concurrencia GPU inicia en una tarea pesada.",
            ),
            _ if is_idle && on_ac => (
                "maximum",
                1,
                "float16",
                99,
                "Equipo inactivo y conectado: se habilita el perfil máximo seguro.",
            ),
            _ if status.power_source == "battery" => (
                "efficient",
                1,
                "int8",
                0,
                "Batería detectada: se reduce el trabajo de fondo para preservar autonomía.",
            ),
            _ => (
                "responsive",
                1,
                "int8_float16",
                0,
                "Usuario activo: se prioriza la fluidez de la interfaz.",
            ),
        };
    let whisper_gpu_ready = status.capabilities.iter().any(|capability| {
        capability.name == "whisper_cuda"
            && matches!(
                capability.state,
                CapabilityState::Verified | CapabilityState::Active
            )
    });
    let llm_gpu_ready = status.capabilities.iter().any(|capability| {
        capability.name == "llm_cuda"
            && matches!(
                capability.state,
                CapabilityState::Verified | CapabilityState::Active
            )
    });
    PerformancePolicy {
        mode: mode.to_string(),
        effective_profile: effective_profile.to_string(),
        user_state: status.user_state.clone(),
        power_source: status.power_source.clone(),
        max_gpu_tasks,
        background_allowed: !resource_pressure
            && background_processing
            && on_ac
            && (is_idle || mode != "intelligent"),
        whisper_compute_type: if whisper_gpu_ready {
            whisper_compute_type.into()
        } else {
            "int8".into()
        },
        llm_gpu_layers: if llm_gpu_ready { llm_gpu_layers } else { 0 },
        reason: reason.into(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    }
}

struct CudaProbe {
    device_count: Option<u32>,
    reason: String,
    runtime_version: Option<String>,
}

struct RuntimeInventory {
    complete: bool,
    missing: Vec<String>,
}

struct FfmpegInventory {
    present: bool,
    has_nvenc: bool,
    has_nvdec: bool,
    version: Option<String>,
}

struct LlamaInventory {
    present: bool,
    cuda_device: bool,
    version: Option<String>,
    reason: String,
}

fn cuda_probe() -> CudaProbe {
    let python = crate::runtime::python_executable();
    if !python.is_file() {
        return CudaProbe {
            device_count: None,
            reason: "No se encontró el Python empaquetado de workers.".into(),
            runtime_version: None,
        };
    }
    let output = hidden_command(python)
        .args([
            "-c",
            "import ctranslate2; print(ctranslate2.get_cuda_device_count())",
        ])
        .output();
    let Ok(output) = output else {
        return CudaProbe {
            device_count: None,
            reason: "No se pudo ejecutar el probe CUDA de CTranslate2.".into(),
            runtime_version: None,
        };
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let device_count = stdout
        .lines()
        .find_map(|line| line.trim().parse::<u32>().ok());
    if let Some(count) = device_count {
        CudaProbe {
            device_count: Some(count),
            reason: if count > 0 {
                "CTranslate2 reportó al menos un dispositivo CUDA.".into()
            } else {
                "CTranslate2 no reportó dispositivos CUDA.".into()
            },
            runtime_version: Some("ctranslate2-probe".into()),
        }
    } else {
        CudaProbe {
            device_count: None,
            reason: format!(
                "El probe CUDA no devolvió un conteo válido: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ),
            runtime_version: None,
        }
    }
}

fn cuda_runtime_inventory() -> RuntimeInventory {
    let root = crate::runtime::path("python/Lib/site-packages");
    let mut names = Vec::new();
    let mut directories = vec![root];
    while let Some(directory) = directories.pop() {
        let Ok(entries) = std::fs::read_dir(directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                directories.push(path);
            } else {
                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_ascii_lowercase();
                if name.ends_with(".dll") {
                    names.push(name);
                }
            }
        }
    }
    let has_cudnn = names.iter().any(|name| name.starts_with("cudnn"));
    let has_cublas = names.iter().any(|name| name.starts_with("cublas"));
    let has_cudart = names.iter().any(|name| name.starts_with("cudart"));
    let mut missing = Vec::new();
    if !has_cublas {
        missing.push("cuBLAS".into());
    }
    if !has_cudart {
        missing.push("CUDA Runtime".into());
    }
    if !has_cudnn {
        missing.push("cuDNN".into());
    }
    RuntimeInventory {
        complete: missing.is_empty(),
        missing,
    }
}

fn ffmpeg_inventory() -> FfmpegInventory {
    let binary = crate::runtime::binary(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    if !binary.is_file() {
        return FfmpegInventory {
            present: false,
            has_nvenc: false,
            has_nvdec: false,
            version: None,
        };
    }
    let version = hidden_command(&binary)
        .arg("-version")
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .and_then(|text| text.lines().next().map(str::to_string));
    let encoders = hidden_command(&binary)
        .args(["-hide_banner", "-encoders"])
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).to_ascii_lowercase())
        .unwrap_or_default();
    let decoders = hidden_command(&binary)
        .args(["-hide_banner", "-decoders"])
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).to_ascii_lowercase())
        .unwrap_or_default();
    FfmpegInventory {
        present: true,
        has_nvenc: encoders.contains("h264_nvenc") || encoders.contains("hevc_nvenc"),
        has_nvdec: decoders.contains("cuvid") || decoders.contains("_nvdec"),
        version,
    }
}

fn llama_inventory() -> LlamaInventory {
    let binary = crate::runtime::binary(if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    });
    if !binary.is_file() {
        return LlamaInventory {
            present: false,
            cuda_device: false,
            version: None,
            reason: "No se encontró el sidecar local de llama.cpp.".into(),
        };
    }
    let output = hidden_command(&binary).arg("--list-devices").output();
    let Ok(output) = output else {
        return LlamaInventory {
            present: true,
            cuda_device: false,
            version: None,
            reason: "No se pudo ejecutar llama-server --list-devices.".into(),
        };
    };
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let lower = combined.to_ascii_lowercase();
    let cuda_device =
        (lower.contains("cuda") || lower.contains("nvidia")) && !lower.contains("(none)");
    LlamaInventory {
        present: true,
        cuda_device,
        version: Some("llama-server-probe".into()),
        reason: if cuda_device {
            "llama-server reportó un dispositivo CUDA.".into()
        } else {
            format!(
                "El sidecar no reportó dispositivos CUDA: {}",
                combined.trim()
            )
        },
    }
}

fn benchmark_cuda() -> BenchmarkResult {
    let started = Instant::now();
    let probe = cuda_probe();
    let runtime = cuda_runtime_inventory();
    if probe.device_count.unwrap_or(0) == 0 {
        return BenchmarkResult {
            name: "whisper_cuda_probe".into(),
            state: CapabilityState::Fallback,
            duration_ms: started.elapsed().as_millis(),
            detail: probe.reason,
        };
    }
    if !runtime.complete {
        return BenchmarkResult {
            name: "whisper_cuda_probe".into(),
            state: CapabilityState::Fallback,
            duration_ms: started.elapsed().as_millis(),
            detail: format!(
                "{} El runtime empaquetado todavía no está completo: {}.",
                probe.reason,
                runtime.missing.join(", ")
            ),
        };
    }
    let Some(model_path) = whisper_model_path() else {
        return BenchmarkResult {
            name: "whisper_cuda_probe".into(),
            state: CapabilityState::Fallback,
            duration_ms: started.elapsed().as_millis(),
            detail: "El runtime CUDA está completo, pero no hay un modelo Whisper local válido para ejecutar una muestra; no se marcará CUDA como verificado.".into(),
        };
    };
    let python = crate::runtime::python_executable();
    let (verified, detail) = run_whisper_cuda_sample(&python, &model_path);
    BenchmarkResult {
        name: "whisper_cuda_probe".into(),
        state: if verified {
            CapabilityState::Verified
        } else {
            CapabilityState::Fallback
        },
        duration_ms: started.elapsed().as_millis(),
        detail,
    }
}

fn whisper_model_path() -> Option<PathBuf> {
    let snapshots =
        crate::runtime::path("assets/models/models--Systran--faster-whisper-tiny/snapshots");
    let entries = std::fs::read_dir(snapshots).ok()?;
    entries.flatten().map(|entry| entry.path()).find(|path| {
        let model = path.join("model.bin");
        let config = path.join("config.json");
        model.is_file()
            && config.is_file()
            && std::fs::metadata(model)
                .map(|metadata| metadata.len() > 1_048_576)
                .unwrap_or(false)
    })
}

fn run_whisper_cuda_sample(python: &Path, model_path: &Path) -> (bool, String) {
    if !python.is_file() {
        return (
            false,
            "No se encontró el Python empaquetado para ejecutar la muestra Whisper CUDA.".into(),
        );
    }
    let script = r#"
import os
import sys
import tempfile
import wave
from faster_whisper import WhisperModel

audio_path = None
try:
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as handle:
        audio_path = handle.name
    with wave.open(audio_path, 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(b'\x00\x00' * 1600)
    model = WhisperModel(sys.argv[1], device='cuda', compute_type='int8_float16')
    segments, _ = model.transcribe(audio_path, beam_size=1, vad_filter=False)
    next(iter(segments), None)
    print('whisper_cuda_sample_ok')
finally:
    if audio_path:
        try:
            os.unlink(audio_path)
        except OSError:
            pass
"#;
    let model_arg = model_path.to_string_lossy().to_string();
    let output = hidden_command(python)
        .args(["-c", script])
        .arg(model_arg)
        .output();
    let Ok(output) = output else {
        return (
            false,
            "No se pudo iniciar el probe de inferencia faster-whisper CUDA.".into(),
        );
    };
    if output.status.success() {
        return (
            true,
            "faster-whisper cargó el modelo local y transcribió una muestra con CUDA int8_float16."
                .into(),
        );
    }
    let stderr = compact_process_detail(&String::from_utf8_lossy(&output.stderr));
    (
        false,
        if stderr.is_empty() {
            "La muestra faster-whisper CUDA no terminó correctamente.".into()
        } else {
            format!("La muestra faster-whisper CUDA falló: {stderr}")
        },
    )
}

fn compact_process_detail(value: &str) -> String {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    compact.chars().take(800).collect()
}

fn benchmark_ffmpeg(sample_path: Option<&str>) -> Vec<BenchmarkResult> {
    let started = Instant::now();
    let binary = crate::runtime::binary(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    if !binary.is_file() {
        return vec![BenchmarkResult {
            name: "ffmpeg_nvenc_encode".into(),
            state: CapabilityState::Fallback,
            duration_ms: started.elapsed().as_millis(),
            detail: "No se encontró el FFmpeg empaquetado.".into(),
        }];
    }
    let output = hidden_command(&binary)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=1280x720:rate=1",
            "-t",
            "0.2",
            "-an",
            "-c:v",
            "h264_nvenc",
            "-pix_fmt",
            "yuv420p",
            "-f",
            "null",
            "-",
        ])
        .output();
    let Ok(output) = output else {
        return vec![BenchmarkResult {
            name: "ffmpeg_nvenc_encode".into(),
            state: CapabilityState::Fallback,
            duration_ms: started.elapsed().as_millis(),
            detail: "No se pudo iniciar la prueba NVENC.".into(),
        }];
    };
    let detail = if output.status.success() {
        "La codificación sintética NVENC terminó correctamente.".into()
    } else {
        format!(
            "NVENC no terminó correctamente: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )
    };
    let mut results = vec![BenchmarkResult {
        name: "ffmpeg_nvenc_encode".into(),
        state: if output.status.success() {
            CapabilityState::Verified
        } else {
            CapabilityState::Fallback
        },
        duration_ms: started.elapsed().as_millis(),
        detail,
    }];
    if let Some(sample_path) = sample_path {
        results.push(benchmark_ffmpeg_decode(&binary, sample_path));
    }
    results
}

fn benchmark_ffmpeg_decode(binary: &Path, sample_path: &str) -> BenchmarkResult {
    let started = Instant::now();
    let path = Path::new(sample_path);
    if !path.is_file() {
        return BenchmarkResult {
            name: "ffmpeg_nvdec_decode".into(),
            state: CapabilityState::Fallback,
            duration_ms: started.elapsed().as_millis(),
            detail: "La muestra local indicada no existe; no se ejecutó NVDEC.".into(),
        };
    }
    let output = hidden_command(binary)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-hwaccel",
            "cuda",
            "-i",
            sample_path,
            "-frames:v",
            "1",
            "-f",
            "null",
            "-",
        ])
        .output();
    let Ok(output) = output else {
        return BenchmarkResult {
            name: "ffmpeg_nvdec_decode".into(),
            state: CapabilityState::Fallback,
            duration_ms: started.elapsed().as_millis(),
            detail: "No se pudo iniciar la prueba NVDEC.".into(),
        };
    };
    BenchmarkResult {
        name: "ffmpeg_nvdec_decode".into(),
        state: if output.status.success() {
            CapabilityState::Verified
        } else {
            CapabilityState::Fallback
        },
        duration_ms: started.elapsed().as_millis(),
        detail: if output.status.success() {
            "La decodificación de un frame local con NVDEC terminó correctamente.".into()
        } else {
            format!(
                "NVDEC no terminó correctamente: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )
        },
    }
}

fn benchmark_llama() -> BenchmarkResult {
    let started = Instant::now();
    let probe = llama_inventory();
    BenchmarkResult {
        name: "llama_cuda_devices".into(),
        state: if probe.cuda_device {
            CapabilityState::Available
        } else {
            CapabilityState::Fallback
        },
        duration_ms: started.elapsed().as_millis(),
        detail: if probe.cuda_device {
            format!(
                "{} Falta una generación local con capas GPU para marcar el LLM como verificado.",
                probe.reason
            )
        } else {
            probe.reason
        },
    }
}

pub(crate) fn runtime_manifest_sha256() -> Option<String> {
    let path = crate::runtime::path("runtime-manifest.json");
    let bytes = std::fs::read(path).ok()?;
    Some(format!("{:x}", Sha256::digest(bytes)))
}

fn nvidia_samples() -> Vec<NvidiaSample> {
    let output = hidden_command("nvidia-smi")
        .args([
            "--query-gpu=index,name,memory.total,memory.used,driver_version,temperature.gpu,utilization.gpu",
            "--format=csv,noheader,nounits",
        ])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let parts: Vec<_> = line.split(',').map(str::trim).collect();
            if parts.len() < 7 {
                return None;
            }
            let mib = |value: &str| value.parse::<u64>().ok().map(|value| value * 1024 * 1024);
            Some(NvidiaSample {
                index: parts[0].to_string(),
                name: parts[1].to_string(),
                memory_total_bytes: mib(parts[2]),
                memory_used_bytes: mib(parts[3]),
                driver: (!parts[4].is_empty()).then(|| parts[4].to_string()),
                temperature_c: parts[5].parse::<f32>().ok(),
                utilization_percent: parts[6].parse::<f32>().ok(),
            })
        })
        .collect()
}

fn dxgi_like_adapters() -> Vec<AdapterProfile> {
    #[cfg(windows)]
    {
        let script = "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterCompatibility,DriverVersion,AdapterRAM | ConvertTo-Json -Compress";
        let output = hidden_command("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output();
        let Ok(output) = output else {
            return Vec::new();
        };
        let value: serde_json::Value = match serde_json::from_slice(&output.stdout) {
            Ok(value) => value,
            Err(_) => return Vec::new(),
        };
        let rows = match value {
            serde_json::Value::Array(rows) => rows,
            serde_json::Value::Object(_) => vec![value],
            _ => Vec::new(),
        };
        return rows
            .into_iter()
            .filter_map(|row| {
                let name = row.get("Name")?.as_str()?.trim().to_string();
                if name.is_empty() {
                    return None;
                }
                let vendor = row
                    .get("AdapterCompatibility")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("Unknown")
                    .trim()
                    .to_string();
                let dedicated = vendor.to_ascii_lowercase().contains("nvidia")
                    || name.to_ascii_lowercase().contains("rtx")
                    || name.to_ascii_lowercase().contains("radeon");
                let id = format!(
                    "{}-{}",
                    vendor.to_ascii_lowercase().replace(' ', "-"),
                    name.to_ascii_lowercase().replace(' ', "-")
                );
                Some(AdapterProfile {
                    id,
                    name,
                    vendor,
                    dedicated,
                    driver: row
                        .get("DriverVersion")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_string),
                    vram_total_bytes: row.get("AdapterRAM").and_then(serde_json::Value::as_u64),
                    vram_used_bytes: None,
                    vram_available_bytes: None,
                    temperature_c: None,
                    utilization_percent: None,
                    state: CapabilityState::Detected,
                    source: "Win32_VideoController".into(),
                })
            })
            .collect();
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[cfg(windows)]
fn power_source() -> String {
    use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut status = SYSTEM_POWER_STATUS {
        ACLineStatus: 255,
        BatteryFlag: 255,
        BatteryLifePercent: 255,
        SystemStatusFlag: 0,
        BatteryLifeTime: 0,
        BatteryFullLifeTime: 0,
    };
    if unsafe { GetSystemPowerStatus(&mut status) } == 0 {
        return "unknown".into();
    }
    match status.ACLineStatus {
        1 => "ac".into(),
        0 => "battery".into(),
        _ => "unknown".into(),
    }
}

#[cfg(not(windows))]
fn power_source() -> String {
    "unknown".into()
}

#[cfg(windows)]
fn user_activity() -> (u64, String) {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    if unsafe { GetLastInputInfo(&mut info) } == 0 {
        return (0, "unknown".into());
    }
    let idle_ms = unsafe { GetTickCount().wrapping_sub(info.dwTime) } as u64;
    let idle_seconds = idle_ms / 1000;
    (
        idle_seconds,
        if idle_seconds >= 60 {
            "idle".into()
        } else {
            "active".into()
        },
    )
}

#[cfg(not(windows))]
fn user_activity() -> (u64, String) {
    (0, "unknown".into())
}

#[cfg(test)]
mod tests {
    use super::{performance_policy, AccelerationStatus, CapabilityState};

    fn status(power_source: &str, user_state: &str, idle_seconds: u64) -> AccelerationStatus {
        AccelerationStatus {
            generated_at: String::new(),
            adapters: Vec::new(),
            power_source: power_source.into(),
            user_state: user_state.into(),
            idle_seconds,
            current_mode: "intelligent".into(),
            active_adapter_id: None,
            capabilities: vec![super::CapabilityReport {
                name: "test".into(),
                state: CapabilityState::Detected,
                reason: None,
                runtime_version: None,
                measured_ms: None,
            }],
            runtime_manifest_sha256: None,
            fallback_reason: None,
        }
    }

    #[test]
    fn intelligent_policy_uses_maximum_only_when_idle_and_on_ac() {
        let idle = performance_policy("intelligent", true, true, 60, &status("ac", "idle", 120));
        assert_eq!(idle.effective_profile, "maximum");
        assert!(idle.background_allowed);
        let active = performance_policy("intelligent", true, true, 60, &status("ac", "active", 2));
        assert_eq!(active.effective_profile, "responsive");
        assert!(!active.background_allowed);
        let battery = performance_policy(
            "intelligent",
            true,
            true,
            60,
            &status("battery", "idle", 120),
        );
        assert_eq!(battery.effective_profile, "efficient");
        assert!(!battery.background_allowed);
    }
}
