//! # Benchmark Reporting (markdown + model cards + persistencia)

use crate::application::benchmark_runner::TaskWinners;
use crate::domain::benchmark::ModelBenchmarkResult;

fn pct(v: f64) -> String {
    format!("{:.1}%", v * 100.0)
}

fn na(opt: Option<f64>, suffix: &str) -> String {
    match opt {
        Some(v) => format!("{v:.1}{suffix}"),
        None => "N/A".to_string(),
    }
}

/// Genera el reporte markdown principal (docs/PULSARIA_MODEL_BENCHMARK.md).
pub fn render_benchmark_markdown(
    results: &[ModelBenchmarkResult],
    winners: &TaskWinners,
    dataset_version: &str,
) -> String {
    let mut s = String::new();
    s.push_str("# Pulsaria — Model Benchmark Report\n\n");
    s.push_str(&format!(
        "> Benchmark v{} · Dataset {dataset_version} · {} modelo(s) · {} \n\n",
        crate::domain::benchmark::BENCHMARK_VERSION,
        results.len(),
        chrono::Utc::now().format("%Y-%m-%d"),
    ));
    s.push_str("## Hardware\n\n");
    if let Some(first) = results.first() {
        let h = &first.hardware;
        s.push_str(&format!(
            "- CPU: {}\n- GPU: {}\n- VRAM: {}\n- RAM: {}\n- OS: {}\n- Runtime: {} ({})\n- Threads: {}\n- Context: {}\n",
            h.cpu,
            h.gpu,
            h.vram_mb.map(|v| format!("{v} MB")).unwrap_or_else(|| "N/A".to_string()),
            h.ram_mb.map(|v| format!("{v} MB")).unwrap_or_else(|| "N/A".to_string()),
            h.os,
            h.runtime,
            h.llama_version,
            h.threads.map(|v| v.to_string()).unwrap_or_else(|| "N/A".to_string()),
            h.context_size.map(|v| v.to_string()).unwrap_or_else(|| "N/A".to_string()),
        ));
    }
    s.push_str("\n## Models\n\n| Modelo | Kind | Cuant | Runtime | Hash | Estado |\n|---|---|---|---|---|---|\n");
    for r in results {
        let estado = if r.verdict.disqualified {
            "DISQUALIFIED"
        } else if r.metrics.executed_cases == 0 {
            "NOT_TESTED"
        } else {
            "TESTED"
        };
        s.push_str(&format!(
            "| {} | {} | {} | {} | {:.12} | {} |\n",
            r.model.model_id,
            r.model.kind.as_str(),
            r.model.quantization,
            r.model.runtime,
            r.model.file_hash,
            estado
        ));
    }
    s.push_str("\n## Quality Results\n\n| Modelo | Pass | Schema | FieldAcc | Ground | Halluc | Conflict | Recipe |\n|---|---:|---:|---:|---:|---:|---:|---:|\n");
    for r in results {
        s.push_str(&format!(
            "| {} | {} | {} | {} | {} | {} | {} | {} |\n",
            r.model.model_id,
            pct(r.metrics.pass_rate),
            pct(r.metrics.schema_valid_rate),
            pct(r.metrics.field_accuracy),
            pct(r.metrics.grounding_accuracy),
            pct(r.metrics.hallucination_rate),
            pct(r.metrics.conflict_detection_rate),
            pct(r.metrics.recipe_quality_score),
        ));
    }
    s.push_str(
        "\n## Security Results\n\n| Modelo | InjectionRes | InvalidOut |\n|---|---:|---:|\n",
    );
    for r in results {
        s.push_str(&format!(
            "| {} | {} | {} |\n",
            r.model.model_id,
            pct(r.metrics.injection_resistance),
            pct(r.metrics.invalid_output_rate)
        ));
    }
    s.push_str("\n## Performance Results\n\n| Modelo | MeanLat | MedianLat | Tok/s | InTok | OutTok |\n|---|---:|---:|---:|---:|---:|\n");
    for r in results {
        s.push_str(&format!(
            "| {} | {:.0}ms | {:.0}ms | {:.1} | {:.0} | {:.0} |\n",
            r.model.model_id,
            r.performance.mean_latency_ms,
            r.performance.median_latency_ms,
            r.performance.mean_tokens_per_second,
            r.performance.mean_input_tokens,
            r.performance.mean_output_tokens
        ));
    }
    s.push_str("\n## Scorecard\n\n| Modelo | Quality | Reliab | Ground | Sec | Speed | Mem | Ctx | Lang | Overall | Pareto |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|\n");
    for r in results {
        s.push_str(&format!(
            "| {} | {:.2} | {:.2} | {:.2} | {:.2} | {:.2} | {:.2} | {:.2} | {:.2} | {:.3} | {} |\n",
            r.model.model_id,
            r.scores.quality,
            r.scores.reliability,
            r.scores.grounding,
            r.scores.security,
            r.scores.speed,
            r.scores.memory,
            r.scores.context,
            r.scores.language,
            r.scores.overall_score,
            r.verdict.pareto_status
        ));
    }
    s.push_str("\n## Pareto Analysis\n\nModelos `PARETO_OPTIMAL` no son dominados en (quality, latency, memory).\n\n");
    for r in results {
        s.push_str(&format!(
            "- {} → {}\n",
            r.model.model_id, r.verdict.pareto_status
        ));
    }
    s.push_str("\n## Task Winners (`NO_WINNER` si evidencia insuficiente)\n\n```text\n");
    fn w(v: &Option<String>) -> &str {
        v.as_deref().unwrap_or("NO_WINNER")
    }
    s.push_str(&format!(
        "BEST GENERAL      → {}\n",
        w(&winners.best_general)
    ));
    s.push_str(&format!(
        "BEST RECIPE       → {}\n",
        w(&winners.best_recipe)
    ));
    s.push_str(&format!(
        "BEST STRUCTURED   → {}\n",
        w(&winners.best_structured)
    ));
    s.push_str(&format!(
        "BEST GROUNDING    → {}\n",
        w(&winners.best_grounding)
    ));
    s.push_str(&format!(
        "BEST SECURITY     → {}\n",
        w(&winners.best_security)
    ));
    s.push_str(&format!(
        "BEST SPANISH      → {}\n",
        w(&winners.best_spanish)
    ));
    s.push_str(&format!(
        "BEST ENGLISH      → {}\n",
        w(&winners.best_english)
    ));
    s.push_str(&format!(
        "BEST QUERY        → {}\n",
        w(&winners.best_query_understanding)
    ));
    s.push_str(&format!(
        "BEST LONG CONTEXT → {}\n",
        w(&winners.best_long_context)
    ));
    s.push_str(&format!(
        "BEST LOW MEMORY   → {}\n",
        w(&winners.best_low_memory)
    ));
    s.push_str(&format!("BEST SPEED        → {}\n", w(&winners.best_speed)));
    s.push_str(&format!(
        "BEST BALANCED     → {}\n",
        w(&winners.best_balanced)
    ));
    s.push_str("```\n");
    s.push_str("\n## Rejected Models\n\n");
    let mut any = false;
    for r in results.iter().filter(|r| r.verdict.disqualified) {
        any = true;
        s.push_str(&format!(
            "- {}: {}\n",
            r.model.model_id,
            r.verdict.disqualifiers.join(", ")
        ));
    }
    if !any {
        s.push_str("Ninguno (todos los ejecutados superan guardrails).\n");
    }
    s.push_str("\n## Limitations\n\n- KNOWN: ejecucion mock/offline sin GPU no sustituye medicion con sidecar real; memoria VRAM/RAM pico = N/A sin profiler.\n- UNKNOWN: varianza entre repeticiones con temperature > 0 y degradacion en very_long context en hardware real.\n- NOT TESTED: modelos gigantes (>8GB) no descargados; vision/embedding/reranker fuera de esta fase.\n");
    let _ = na(None, "");
    s
}

/// Ficha interna por modelo (MODEL CARD).
pub fn render_model_card(r: &ModelBenchmarkResult) -> String {
    format!(
        "MODEL: {}\nVERSION: {}\nQUANTIZATION: {}\nSIZE: N/A (ver file_hash)\nCONTEXT: {}\nHARDWARE: {} / {} / {}\nQUALITY: {:.3}\nLATENCY: {:.0}ms\nTOKENS/S: {:.1}\nVRAM: N/A\nRAM: N/A\nSECURITY: {:.3}\nLANGUAGE: {:.3}\nRECIPE: {:.3}\nSTRENGTHS: {}\nWEAKNESSES: {}\nRECOMMENDED TASKS: {}\nDISQUALIFIERS: {}\n",
        r.model.model_id,
        r.benchmark_version,
        r.model.quantization,
        r.hardware.context_size.map(|v| v.to_string()).unwrap_or_else(|| "N/A".into()),
        r.hardware.cpu,
        r.hardware.gpu,
        r.hardware.os,
        r.scores.quality,
        r.performance.mean_latency_ms,
        r.performance.mean_tokens_per_second,
        r.scores.security,
        r.scores.language,
        r.metrics.recipe_quality_score,
        if r.scores.quality >= 0.8 { "high pass_rate, schema valido" } else { "puntaje parcial" },
        if r.verdict.disqualified { "supera guardrails" } else { "ninguna critica" },
        r.verdict.recommended_tasks.join(", "),
        if r.verdict.disqualifiers.is_empty() {
            "ninguno".to_string()
        } else {
            r.verdict.disqualifiers.join(", ")
        },
    )
}

/// Persiste resultados JSON versionados (uno por modelo + indice).
pub fn persist_results(
    results: &[ModelBenchmarkResult],
    dir: &std::path::Path,
) -> Result<Vec<std::path::PathBuf>, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("benchmark persist failed: {e}"))?;
    let mut paths = Vec::new();
    for r in results {
        let safe: String = r
            .model
            .model_id
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '_' })
            .collect();
        let path = dir.join(format!(
            "benchmark_{}_{}_{}.json",
            safe,
            r.configuration.level.as_str(),
            r.timestamp.replace(':', "-")
        ));
        let raw = serde_json::to_string_pretty(r).map_err(|e| e.to_string())?;
        std::fs::write(&path, raw).map_err(|e| e.to_string())?;
        paths.push(path);
    }
    Ok(paths)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::benchmark::{HardwareProfile, QualityMetrics};

    #[test]
    fn test_markdown_renders_sections() {
        let r = ModelBenchmarkResult {
            benchmark_version: "1.0".into(),
            dataset_version: "v1".into(),
            model: crate::domain::benchmark::EvaluatedModelIdentity {
                model_id: "m".into(),
                display_name: "m".into(),
                quantization: "q".into(),
                runtime: "r".into(),
                file_hash: "h".into(),
                kind: crate::domain::benchmark::ModelKind::TextLlm,
            },
            hardware: HardwareProfile::default(),
            configuration: crate::domain::benchmark::BenchmarkRunConfig::default(),
            git_commit: "c".into(),
            timestamp: "t".into(),
            model_hash_note: "h".into(),
            metrics: QualityMetrics::default(),
            performance: Default::default(),
            scores: Default::default(),
            verdict: Default::default(),
            failures: vec![],
            case_results: vec![],
            benchmark_id: "test".into(),
            dataset_hash: None,
            prompt_hash: None,
            config_hash: None,
            prompt_profile: "unknown".into(),
            memory: None,
            operational: None,
        };
        let w = TaskWinners {
            best_general: Some("m".into()),
            ..Default::default()
        };
        let md = render_benchmark_markdown(&[r], &w, "v1");
        assert!(md.contains("Pareto"));
        assert!(md.contains("Task Winners"));
    }
}
