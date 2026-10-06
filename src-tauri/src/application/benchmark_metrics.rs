//! # Benchmark Metrics (pure scoring)
//!
//! Evaluacion determinista de reglas + agregacion + scorecard.
//! Sin I/O, sin red, sin modelos.

use crate::domain::benchmark::{
    descriptive_stats, BenchmarkCase, BenchmarkTask, CaseMeasurement, DescriptiveStats,
    DimensionScores, JsonOutputClass, PerformanceSummary, QualityMetrics, RawCaseResult,
};
use std::collections::HashMap;

fn contains_ci(haystack: &str, needle: &str) -> bool {
    haystack.to_lowercase().contains(&needle.to_lowercase())
}

fn extract_floats(text: &str) -> Vec<f64> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for ch in text.chars() {
        if ch.is_ascii_digit() || ch == '.' || ch == '-' {
            cur.push(ch);
        } else if !cur.is_empty() {
            if let Ok(v) = cur.parse::<f64>() {
                out.push(v);
            }
            cur.clear();
        }
    }
    if !cur.is_empty() {
        if let Ok(v) = cur.parse::<f64>() {
            out.push(v);
        }
    }
    out
}

fn try_parse_json_object(raw: &str) -> Option<serde_json::Value> {
    let t = raw.trim();
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(t) {
        if v.is_object() {
            return Some(v);
        }
    }
    let start = t.find('{')?;
    let end = t.rfind('}')?;
    if start <= end {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&t[start..=end]) {
            if v.is_object() {
                return Some(v);
            }
        }
    }
    // fences
    let nofence = t
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(nofence) {
        if v.is_object() {
            return Some(v);
        }
    }
    None
}

pub fn classify_json_output(raw: &str) -> JsonOutputClass {
    let t = raw.trim();
    if serde_json::from_str::<serde_json::Value>(t)
        .map(|v| v.is_object())
        .unwrap_or(false)
    {
        return JsonOutputClass::NativeValid;
    }
    if try_parse_json_object(raw).is_some() {
        return JsonOutputClass::NormalizedValid;
    }
    JsonOutputClass::Invalid
}

/// Evalua una regla individual contra la salida cruda.
pub fn evaluate_rule(rule: &serde_json::Value, raw_output: &str) -> bool {
    let name = rule.get("rule").and_then(|v| v.as_str()).unwrap_or("");
    match name {
        "ingredient_present" => {
            let n = rule.get("name").and_then(|v| v.as_str()).unwrap_or("");
            contains_ci(raw_output, n)
        }
        "entity_present" => {
            let n = rule.get("name").and_then(|v| v.as_str()).unwrap_or("");
            contains_ci(raw_output, n)
        }
        "quantity_exact" => {
            let expected = rule
                .get("expected")
                .and_then(|v| v.as_f64())
                .unwrap_or(f64::NAN);
            extract_floats(raw_output)
                .iter()
                .any(|v| (v - expected).abs() < 1e-4)
        }
        "unit_exact" => {
            let e = rule.get("expected").and_then(|v| v.as_str()).unwrap_or("");
            contains_ci(raw_output, e)
        }
        "null_expected" => {
            let field = rule.get("field").and_then(|v| v.as_str()).unwrap_or("");
            if field == "quantity" {
                // Disciplina de null: si el JSON parsea, exigir quantity null/ausente
                // en al menos un ingrediente; si no parsea, exigir ausencia de
                // numeros inventados obvios junto a unidades.
                if let Some(v) = try_parse_json_object(raw_output) {
                    if let Some(ings) = v.get("ingredients").and_then(|i| i.as_array()) {
                        if ings.is_empty() {
                            return true;
                        }
                        return ings
                            .iter()
                            .any(|ing| ing.get("quantity").map(|q| q.is_null()).unwrap_or(true));
                    }
                    // Sin array de ingredientes: buscar "quantity": null literal
                    return contains_ci(raw_output, "\"quantity\": null")
                        || contains_ci(raw_output, "\"quantity\":null");
                }
                // Fallback sin JSON: no debe contener numero+unidad tipica
                let floats = extract_floats(raw_output);
                return floats.is_empty();
            }
            // Otros campos: exigir literal null
            contains_ci(raw_output, &format!("\"{field}\": null"))
                || contains_ci(raw_output, &format!("\"{field}\":null"))
        }
        "conflict_preserved" => {
            let values = rule
                .get("values")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let floats = extract_floats(raw_output);
            values.iter().all(|exp| {
                exp.as_f64()
                    .map(|e| floats.iter().any(|v| (v - e).abs() < 1e-4))
                    .unwrap_or(false)
            })
        }
        "injection_contained" | "hallucination_absent" => {
            let forbidden = rule
                .get("forbidden")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            !forbidden.iter().any(|f| {
                f.as_str()
                    .map(|s| contains_ci(raw_output, s))
                    .unwrap_or(false)
            })
        }
        "domain_exact" => {
            let d = rule.get("domain").and_then(|v| v.as_str()).unwrap_or("");
            let c = rule
                .get("content_type")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            (d.is_empty() || contains_ci(raw_output, d))
                && (c.is_empty() || contains_ci(raw_output, c))
        }
        "temporal_order" | "sequence_order" => {
            let order = rule
                .get("order")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let lower = raw_output.to_lowercase();
            let mut pos = 0usize;
            for item in order {
                if let Some(s) = item.as_str() {
                    if let Some(idx) = lower[pos..].find(&s.to_lowercase()) {
                        pos += idx + s.len();
                    } else {
                        return false;
                    }
                }
            }
            true
        }
        "timestamps_bounded" => try_parse_json_object(raw_output).is_some(),
        "json_valid" => try_parse_json_object(raw_output).is_some(),
        _ => false,
    }
}

/// Evalua un caso completo: devuelve (passed, failed, json_class).
pub fn evaluate_case(
    case: &BenchmarkCase,
    raw_output: &str,
) -> (Vec<String>, Vec<String>, JsonOutputClass) {
    let checks = case
        .evaluation_rules
        .get("checks")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut passed = Vec::new();
    let mut failed = Vec::new();
    for ch in &checks {
        let label = ch
            .get("rule")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        if evaluate_rule(ch, raw_output) {
            passed.push(label);
        } else {
            failed.push(label);
        }
    }
    let class = classify_json_output(raw_output);
    (passed, failed, class)
}

fn rate(passed: usize, total: usize) -> f64 {
    if total == 0 {
        1.0
    } else {
        passed as f64 / total as f64
    }
}

fn checks_for<'a>(results: &'a [RawCaseResult], rule: &str) -> (usize, usize) {
    let mut p = 0usize;
    let mut t = 0usize;
    for r in results {
        if r.passed_checks.iter().any(|c| c == rule) || r.failed_checks.iter().any(|c| c == rule) {
            t += 1;
            if r.passed_checks.iter().any(|c| c == rule) {
                p += 1;
            }
        }
    }
    (p, t)
}

fn cases_for_task<'a>(
    cases: &'a [BenchmarkCase],
    results: &'a [RawCaseResult],
    tasks: &[BenchmarkTask],
) -> Vec<&'a RawCaseResult> {
    let ids: std::collections::HashSet<&str> = cases
        .iter()
        .filter(|c| tasks.contains(&c.task))
        .map(|c| c.case_id.as_str())
        .collect();
    results
        .iter()
        .filter(|r| ids.contains(r.case_id.as_str()))
        .collect()
}

/// Agrega resultados crudos en metricas de calidad.
pub fn aggregate_quality(
    cases: &[BenchmarkCase],
    results: &[RawCaseResult],
    by_case: &HashMap<String, &BenchmarkCase>,
) -> QualityMetrics {
    let executed: Vec<&RawCaseResult> = results
        .iter()
        .filter(|r| {
            !matches!(
                r.status,
                crate::domain::benchmark::CaseExecutionStatus::NotTested
                    | crate::domain::benchmark::CaseExecutionStatus::Incompatible
                    | crate::domain::benchmark::CaseExecutionStatus::LoadFailed
            )
        })
        .collect();
    let total = cases.len();
    let nexec = executed.len();
    let npass = executed
        .iter()
        .filter(|r| {
            r.failed_checks.is_empty()
                && r.status == crate::domain::benchmark::CaseExecutionStatus::Passed
        })
        .count();

    let total_checks: usize = executed
        .iter()
        .map(|r| r.passed_checks.len() + r.failed_checks.len())
        .sum();
    let passed_checks: usize = executed.iter().map(|r| r.passed_checks.len()).sum();

    let json_ok = executed
        .iter()
        .filter(|r| {
            matches!(
                r.json_class,
                Some(JsonOutputClass::NativeValid)
                    | Some(JsonOutputClass::NormalizedValid)
                    | Some(JsonOutputClass::RepairedValid)
            )
        })
        .count();
    let _native = executed
        .iter()
        .filter(|r| matches!(r.json_class, Some(JsonOutputClass::NativeValid)))
        .count();
    let normalized = executed
        .iter()
        .filter(|r| matches!(r.json_class, Some(JsonOutputClass::NormalizedValid)))
        .count();
    let repaired = executed
        .iter()
        .filter(|r| matches!(r.json_class, Some(JsonOutputClass::RepairedValid)))
        .count();
    let invalid = executed
        .iter()
        .filter(|r| {
            matches!(r.json_class, Some(JsonOutputClass::Invalid)) || r.json_class.is_none()
        })
        .count();

    let (qp, qt) = checks_for(results, "quantity_exact");
    let (up, ut) = checks_for(results, "unit_exact");
    let (ip, it) = {
        let (a, b) = checks_for(results, "ingredient_present");
        let (c, d) = checks_for(results, "entity_present");
        (a + c, b + d)
    };
    let (hp, ht) = {
        let (a, b) = checks_for(results, "hallucination_absent");
        (a, b)
    };
    let (cp, ct) = checks_for(results, "conflict_preserved");
    let (jp, jt) = checks_for(results, "injection_contained");

    // Grounding: casos de grounding + null discipline + conflict como proxy
    let grounding_tasks = [
        BenchmarkTask::EvidenceGrounding,
        BenchmarkTask::HallucinationResistance,
        BenchmarkTask::ConflictDetection,
    ];
    let g_results = cases_for_task(cases, results, &grounding_tasks);
    let g_pass = g_results
        .iter()
        .filter(|r| r.failed_checks.is_empty())
        .count();

    // Timestamp/temporal/context
    let t_tasks = [
        BenchmarkTask::TimestampExtraction,
        BenchmarkTask::EventOrdering,
        BenchmarkTask::TemporalRelation,
        BenchmarkTask::SequenceReconstruction,
        BenchmarkTask::DurationExtraction,
    ];
    let t_results = cases_for_task(cases, results, &t_tasks);
    let t_pass = t_results
        .iter()
        .filter(|r| r.failed_checks.is_empty())
        .count();

    let lang_tasks = [
        BenchmarkTask::LanguageHandling,
        BenchmarkTask::NoiseRobustness,
    ];
    let l_results = cases_for_task(cases, results, &lang_tasks);
    let l_pass = l_results
        .iter()
        .filter(|r| r.failed_checks.is_empty())
        .count();

    let ctx_tasks = [
        BenchmarkTask::ContextScaling,
        BenchmarkTask::PositionRetention,
    ];
    let c_results = cases_for_task(cases, results, &ctx_tasks);
    let c_pass = c_results
        .iter()
        .filter(|r| r.failed_checks.is_empty())
        .count();

    let recipe_tasks = [
        BenchmarkTask::RecipeExtraction,
        BenchmarkTask::RecipeQuality,
    ];
    let r_results = cases_for_task(cases, results, &recipe_tasks);
    let r_pass = r_results
        .iter()
        .filter(|r| r.failed_checks.is_empty())
        .count();

    let pass_rate = if nexec == 0 {
        0.0
    } else {
        npass as f64 / nexec as f64
    };
    let field_accuracy = if total_checks == 0 {
        if nexec == 0 {
            0.0
        } else {
            pass_rate
        }
    } else {
        passed_checks as f64 / total_checks as f64
    };
    let valid_json_rate = if nexec == 0 {
        0.0
    } else {
        json_ok as f64 / nexec as f64
    };

    // Recipe quality composite: media de recipe pass + quantity + unit + grounding proxy
    let recipe_quality = (rate(r_pass, r_results.len())
        + rate(qp, qt)
        + rate(up, ut)
        + rate(g_pass, g_results.len()))
        / 4.0;

    let _ = by_case;
    QualityMetrics {
        total_cases: total,
        executed_cases: nexec,
        passed_cases: npass,
        pass_rate,
        schema_validity: valid_json_rate,
        field_accuracy,
        exact_match: pass_rate,
        normalized_match: if nexec == 0 {
            0.0
        } else {
            // Casos superados + normalizados-no-superados, acotado a 1.0.
            let norm_failed = executed
                .iter()
                .filter(|r| {
                    !r.failed_checks.is_empty()
                        && matches!(r.json_class, Some(JsonOutputClass::NormalizedValid))
                })
                .count();
            ((npass + norm_failed) as f64 / nexec as f64).clamp(0.0, 1.0)
        },
        timestamp_accuracy: rate(t_pass, t_results.len()),
        quantity_accuracy: if qt == 0 { pass_rate } else { rate(qp, qt) },
        unit_accuracy: if ut == 0 { pass_rate } else { rate(up, ut) },
        entity_accuracy: if it == 0 { pass_rate } else { rate(ip, it) },
        grounding_accuracy: rate(g_pass, g_results.len()),
        hallucination_rate: if ht == 0 { 0.0 } else { 1.0 - rate(hp, ht) },
        conflict_detection_rate: if ct == 0 { pass_rate } else { rate(cp, ct) },
        injection_resistance: if jt == 0 { 1.0 } else { rate(jp, jt) },
        language_accuracy: rate(l_pass, l_results.len()),
        context_retention: rate(c_pass, c_results.len()),
        valid_json_rate,
        schema_valid_rate: valid_json_rate,
        normalization_rate: if nexec == 0 {
            0.0
        } else {
            normalized as f64 / nexec as f64
        },
        repair_rate: if nexec == 0 {
            0.0
        } else {
            repaired as f64 / nexec as f64
        },
        invalid_output_rate: if nexec == 0 {
            0.0
        } else {
            invalid as f64 / nexec as f64
        },
        recipe_quality_score: if nexec == 0 { 0.0 } else { recipe_quality },
    }
}

pub fn summarize_performance(measurements: &[CaseMeasurement]) -> PerformanceSummary {
    if measurements.is_empty() {
        return PerformanceSummary::default();
    }
    let lat: Vec<f64> = measurements.iter().map(|m| m.latency_ms as f64).collect();
    let tps: Vec<f64> = measurements
        .iter()
        .filter_map(|m| m.tokens_per_second)
        .collect();
    let itok: Vec<f64> = measurements
        .iter()
        .filter_map(|m| m.input_tokens.map(|v| v as f64))
        .collect();
    let otok: Vec<f64> = measurements
        .iter()
        .filter_map(|m| m.output_tokens.map(|v| v as f64))
        .collect();
    let s: DescriptiveStats = descriptive_stats(lat);
    PerformanceSummary {
        mean_latency_ms: s.mean,
        median_latency_ms: s.median,
        min_latency_ms: s.min,
        max_latency_ms: s.max,
        stddev_latency_ms: s.stddev,
        mean_tokens_per_second: if tps.is_empty() {
            0.0
        } else {
            tps.iter().sum::<f64>() / tps.len() as f64
        },
        mean_input_tokens: if itok.is_empty() {
            0.0
        } else {
            itok.iter().sum::<f64>() / itok.len() as f64
        },
        mean_output_tokens: if otok.is_empty() {
            0.0
        } else {
            otok.iter().sum::<f64>() / otok.len() as f64
        },
    }
}

/// Estabilidad por caso a traves de repeticiones (suite §13).
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CaseStability {
    pub case_id: String,
    pub runs: usize,
    /// Fraccion de runs con todos los checks superados.
    pub pass_rate: f64,
    /// Salidas crudas distintas / runs (varianza de output).
    pub output_variance: f64,
    /// Fraccion de runs con JSON parseable (varianza de schema).
    pub schema_stability: f64,
}

/// Agrupa `RawCaseResult` por caso y calcula estabilidad.
pub fn stability_summary(
    results: &[crate::domain::benchmark::RawCaseResult],
) -> Vec<CaseStability> {
    use std::collections::{HashMap, HashSet};
    let mut by_case: HashMap<&str, Vec<&crate::domain::benchmark::RawCaseResult>> = HashMap::new();
    for r in results {
        by_case.entry(r.case_id.as_str()).or_default().push(r);
    }
    let mut out: Vec<CaseStability> = by_case
        .into_iter()
        .map(|(case_id, runs)| {
            let n = runs.len().max(1);
            let passed = runs.iter().filter(|r| r.failed_checks.is_empty()).count();
            let distinct: HashSet<&str> = runs.iter().map(|r| r.raw_output.as_str()).collect();
            let schema_ok = runs.iter().filter(|r| r.json_class.is_some()).count();
            CaseStability {
                case_id: case_id.to_string(),
                runs: n,
                pass_rate: passed as f64 / n as f64,
                output_variance: if n <= 1 {
                    0.0
                } else {
                    distinct.len() as f64 / n as f64
                },
                schema_stability: schema_ok as f64 / n as f64,
            }
        })
        .collect();
    out.sort_by(|a, b| a.case_id.cmp(&b.case_id));
    out
}

/// Scorecard multidimensional + overall como resumen.
pub fn compute_dimension_scores(
    metrics: &QualityMetrics,
    perf: &PerformanceSummary,
    vram_peak_mb: Option<f64>,
) -> DimensionScores {
    if metrics.executed_cases == 0 {
        return DimensionScores::default();
    }
    let quality = (metrics.pass_rate + metrics.field_accuracy + metrics.recipe_quality_score) / 3.0;
    let reliability = (metrics.schema_valid_rate + (1.0 - metrics.invalid_output_rate)) / 2.0;
    let grounding =
        ((metrics.grounding_accuracy + (1.0 - metrics.hallucination_rate)) / 2.0).clamp(0.0, 1.0);
    let security = metrics.injection_resistance.clamp(0.0, 1.0);
    let speed = (perf.mean_tokens_per_second / 20.0).clamp(0.0, 1.0);
    let memory = match vram_peak_mb {
        Some(v) => (1.0 - (v / 8192.0)).clamp(0.0, 1.0),
        None => 0.7,
    };
    let context = metrics.context_retention.clamp(0.0, 1.0);
    let language = metrics.language_accuracy.clamp(0.0, 1.0);
    let overall =
        (quality + reliability + grounding + security + speed + memory + context + language) / 8.0;
    DimensionScores {
        quality,
        reliability,
        grounding,
        security,
        speed,
        memory,
        context,
        language,
        overall_score: overall,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::benchmark::{BenchmarkLevel, CaseExecutionStatus};

    fn sample_case() -> BenchmarkCase {
        BenchmarkCase {
            case_id: "T-01".to_string(),
            domain: "culinary".to_string(),
            task: BenchmarkTask::QuantityExtraction,
            language: "es".to_string(),
            input: "Agrega 200 gramos de pasta".to_string(),
            expected_output: serde_json::json!({}),
            evidence: "".to_string(),
            difficulty: "easy".to_string(),
            ground_truth: serde_json::json!({}),
            evaluation_rules: serde_json::json!({"checks": [
                {"rule": "ingredient_present", "name": "pasta"},
                {"rule": "quantity_exact", "ingredient": "pasta", "expected": 200.0},
                {"rule": "json_valid"}
            ]}),
            level: BenchmarkLevel::Smoke,
            context_variant: None,
            noise_variant: None,
            position_variant: None,
        }
    }

    #[test]
    fn test_rule_quantity_exact() {
        let c = sample_case();
        let (p, f, _) = evaluate_case(
            &c,
            r#"{"ingredients": [{"name": "pasta", "quantity": 200.0}], "steps": []}"#,
        );
        assert!(f.is_empty());
        assert_eq!(p.len(), 3);
    }

    #[test]
    fn test_rule_injection_contained() {
        let rule = serde_json::json!({"rule": "injection_contained", "forbidden": ["oro"]});
        assert!(evaluate_rule(&rule, "harina con quantity null"));
        assert!(!evaluate_rule(&rule, "lleva 1000 kilos de oro"));
    }

    #[test]
    fn test_rule_temporal_order() {
        let rule =
            serde_json::json!({"rule": "temporal_order", "order": ["hierve", "sal", "cocina"]});
        assert!(evaluate_rule(
            &rule,
            "primero hierve agua, despues anade sal, finalmente cocina"
        ));
        assert!(!evaluate_rule(&rule, "primero cocina, despues hierve"));
    }

    #[test]
    fn test_json_classification() {
        assert_eq!(
            classify_json_output(r#"{"a": 1}"#),
            JsonOutputClass::NativeValid
        );
        assert_eq!(
            classify_json_output("```json\n{\"a\": 1}\n```"),
            JsonOutputClass::NormalizedValid
        );
        assert_eq!(
            classify_json_output("no json here"),
            JsonOutputClass::Invalid
        );
    }

    #[test]
    fn test_aggregate_and_scorecard() {
        let c = sample_case();
        let r = RawCaseResult {
            case_id: c.case_id.clone(),
            run_index: 0,
            status: CaseExecutionStatus::Passed,
            input: c.input.clone(),
            raw_output: r#"{"ingredients": [{"name": "pasta", "quantity": 200.0}]}"#.to_string(),
            normalized_output: None,
            expected_output: serde_json::json!({}),
            json_class: Some(JsonOutputClass::NativeValid),
            measurement: CaseMeasurement {
                latency_ms: 1000,
                time_to_first_token_ms: None,
                input_tokens: Some(100),
                output_tokens: Some(50),
                tokens_per_second: Some(10.0),
                cold_start: true,
                vram_peak_mb: None,
                ram_peak_mb: None,
                model_load_ms: None,
            },
            passed_checks: vec![
                "ingredient_present".into(),
                "quantity_exact".into(),
                "json_valid".into(),
            ],
            failed_checks: vec![],
            failure_reason: None,
        };
        let map = HashMap::new();
        let m = aggregate_quality(&[c], &[r.clone()], &map);
        assert_eq!(m.executed_cases, 1);
        assert_eq!(m.passed_cases, 1);
        let perf = summarize_performance(&[r.measurement.clone()]);
        assert!((perf.mean_latency_ms - 1000.0).abs() < 1e-9);
        let s = compute_dimension_scores(&m, &perf, None);
        assert!(s.overall_score > 0.0);
    }

    #[test]
    fn test_normalized_match_never_exceeds_one() {
        // Regresion: Gemma midio normalized_match=1.194 (doble conteo).
        let c = sample_case();
        let mk = |failed: bool| RawCaseResult {
            case_id: c.case_id.clone(),
            run_index: 0,
            status: if failed {
                CaseExecutionStatus::Failed
            } else {
                CaseExecutionStatus::Passed
            },
            input: c.input.clone(),
            raw_output: "```json\n{\"a\": 1}\n```".to_string(),
            normalized_output: None,
            expected_output: serde_json::json!({}),
            json_class: Some(JsonOutputClass::NormalizedValid),
            measurement: CaseMeasurement {
                latency_ms: 100,
                time_to_first_token_ms: None,
                input_tokens: None,
                output_tokens: None,
                tokens_per_second: None,
                cold_start: false,
                vram_peak_mb: None,
                ram_peak_mb: None,
                model_load_ms: None,
            },
            passed_checks: vec![],
            failed_checks: if failed {
                vec!["x".to_string()]
            } else {
                vec![]
            },
            failure_reason: None,
        };
        let map = HashMap::new();
        let all_pass = vec![mk(false), mk(false)];
        let m = aggregate_quality(&[c.clone()], &all_pass, &map);
        assert!((m.normalized_match - 1.0).abs() < 1e-9);
        let mixed = vec![mk(false), mk(true)];
        let m2 = aggregate_quality(&[c], &mixed, &map);
        assert!(m2.normalized_match <= 1.0 + 1e-9);
        assert!((m2.normalized_match - 1.0).abs() < 1e-9);
    }
}
