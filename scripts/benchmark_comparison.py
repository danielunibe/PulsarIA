#!/usr/bin/env python3
"""
Pulsar Eventide — Pipeline Comparison Benchmark
Sprint Hardening — Área A2

Compara las 4 estrategias de query del Adaptive Query Planner:
  - cache_only   : solo Redis (0ms ideal)
  - vector_only  : HNSW sin reranker
  - hybrid       : BM25 + HNSW + RRF
  - full_rerank  : vector + cross-encoder reranker

Genera benchmark_comparison.csv con latencias y recall por pipeline.

Uso:
    python scripts/benchmark_comparison.py \
        --endpoint http://localhost:8080 \
        --api-key YOUR_KEY
"""

import argparse
import csv
import json
import math
import statistics
import time
from dataclasses import dataclass, asdict, fields
from typing import Callable

import requests

# ─── Argumentos ──────────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser(description="Pulsar Pipeline Comparison Benchmark")
    p.add_argument("--endpoint", default="http://localhost:8080")
    p.add_argument("--api-key",  default="secret_pulsar_key")
    p.add_argument("--queries",  type=int, default=30, help="Queries por pipeline")
    p.add_argument("--top-k",    type=int, default=10)
    p.add_argument("--out",      default="benchmark_comparison.csv")
    return p.parse_args()

# ─── Queries de prueba con ground truth sintético ────────────────────────
EVAL_QUERIES = [
    ("how does tokio async runtime handle tasks",       [1, 2, 3]),
    ("vector similarity search nearest neighbor hnsw",  [4, 5, 6]),
    ("semantic search transformer model embeddings",    [7, 8, 9]),
    ("rate limiting token bucket algorithm",            [10, 11, 12]),
    ("circuit breaker pattern fault tolerance",         [13, 14, 15]),
    ("distributed consensus raft protocol",             [16, 17, 18]),
    ("product quantization vector compression",         [19, 20, 21]),
    ("redis cache invalidation strategy",               [22, 23, 24]),
    ("shard balancing load distribution hot spot",      [25, 26, 27]),
    ("jwt authentication bearer token middleware",      [28, 29, 30]),
]

# ─── Métricas ─────────────────────────────────────────────────────────────
def recall_at_k(results: list, relevant: set, k: int) -> float:
    if not relevant: return 0.0
    hits = sum(1 for r in results[:k] if r in relevant)
    return hits / len(relevant)

def mrr(results: list, relevant: set) -> float:
    for i, r in enumerate(results):
        if r in relevant:
            return 1.0 / (i + 1)
    return 0.0

def ndcg_at_k(results: list, relevant: set, k: int) -> float:
    dcg  = sum(1.0 / math.log2(i + 2) for i, r in enumerate(results[:k]) if r in relevant)
    idcg = sum(1.0 / math.log2(i + 2) for i in range(min(len(relevant), k)))
    return dcg / idcg if idcg > 0 else 0.0

# ─── Cliente HTTP ─────────────────────────────────────────────────────────
class PulsarClient:
    def __init__(self, endpoint: str, api_key: str):
        self.base    = endpoint
        self.headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    def search(self, query: str, top_k: int, use_hybrid: bool, use_reranker: bool) -> tuple[list[int], float]:
        body = {"query": query, "top_k": top_k, "use_hybrid": use_hybrid, "use_reranker": use_reranker}
        t0 = time.monotonic()
        try:
            r = requests.post(f"{self.base}/api/v1/search", json=body, headers=self.headers, timeout=5)
            latency = (time.monotonic() - t0) * 1000
            ids = [x.get("jobId", x.get("job_id", 0)) for x in (r.json() if r.ok else [])]
            return ids, latency
        except Exception:
            return [], (time.monotonic() - t0) * 1000

# ─── Pipeline configs ─────────────────────────────────────────────────────
PIPELINES = [
    {"name": "vector_only",  "use_hybrid": False, "use_reranker": False},
    {"name": "hybrid",       "use_hybrid": True,  "use_reranker": False},
    {"name": "full_rerank",  "use_hybrid": True,  "use_reranker": True},
    # cache_only: repetir la misma query para forzar cache hit
    {"name": "cache_only",   "use_hybrid": False, "use_reranker": False, "_cache_warm": True},
]

# ─── Main ────────────────────────────────────────────────────────────────
def run_pipeline(client: PulsarClient, pipeline: dict, queries: list, top_k: int) -> dict:
    latencies, r10s, mrrs, ndcgs = [], [], [], []
    name        = pipeline["name"]
    use_hybrid  = pipeline["use_hybrid"]
    use_reranker= pipeline["use_reranker"]
    warm_cache  = pipeline.get("_cache_warm", False)

    for query, relevant_ids in queries:
        rel = set(relevant_ids)

        if warm_cache:
            # Primera llamada para poblar cache
            client.search(query, top_k, use_hybrid, use_reranker)

        results, latency = client.search(query, top_k, use_hybrid, use_reranker)
        latencies.append(latency)
        r10s.append(recall_at_k(results, rel, 10))
        mrrs.append(mrr(results, rel))
        ndcgs.append(ndcg_at_k(results, rel, 10))

    def safe_pct(vals, p):
        s = sorted(vals)
        idx = int(len(s) * p / 100)
        return s[min(idx, len(s)-1)] if s else 0.0

    return {
        "pipeline":     name,
        "queries":      len(queries),
        "recall_at_10": round(statistics.mean(r10s),  4),
        "mrr":          round(statistics.mean(mrrs),  4),
        "ndcg_at_10":   round(statistics.mean(ndcgs), 4),
        "latency_avg":  round(statistics.mean(latencies), 1),
        "latency_p50":  round(safe_pct(latencies, 50), 1),
        "latency_p95":  round(safe_pct(latencies, 95), 1),
        "latency_p99":  round(safe_pct(latencies, 99), 1),
    }

def main():
    args    = parse_args()
    client  = PulsarClient(args.endpoint, args.api_key)
    queries = (EVAL_QUERIES * math.ceil(args.queries / len(EVAL_QUERIES)))[:args.queries]

    print(f"\n{'='*70}")
    print(f"  Pulsar Pipeline Comparison — {len(queries)} queries per pipeline")
    print(f"  Endpoint: {args.endpoint}")
    print(f"{'='*70}\n")

    results = []
    for pipeline in PIPELINES:
        print(f"  ▶ Running pipeline: {pipeline['name']} ...")
        row = run_pipeline(client, pipeline, queries, args.top_k)
        results.append(row)
        print(f"    recall@10={row['recall_at_10']:.3f}  MRR={row['mrr']:.3f}  "
              f"p95={row['latency_p95']:.0f}ms")

    # Imprimir tabla comparativa
    print(f"\n{'='*70}")
    print(f"  {'Pipeline':<14} {'recall@10':>10} {'MRR':>8} {'nDCG@10':>9} {'p50(ms)':>9} {'p95(ms)':>9}")
    print(f"  {'-'*14} {'-'*10} {'-'*8} {'-'*9} {'-'*9} {'-'*9}")
    for r in results:
        suffix = " ✅" if r["recall_at_10"] >= 0.80 and r["mrr"] >= 0.35 else ""
        print(f"  {r['pipeline']:<14} {r['recall_at_10']:>10.3f} {r['mrr']:>8.3f} "
              f"{r['ndcg_at_10']:>9.3f} {r['latency_p50']:>9.0f} {r['latency_p95']:>9.0f}{suffix}")
    print(f"{'='*70}\n")

    # Exportar CSV
    with open(args.out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

    print(f"  📊 Comparativa guardada en: {args.out}")

    # Exportar JSON también
    json_out = args.out.replace(".csv", ".json")
    with open(json_out, "w") as f:
        json.dump(results, f, indent=2)
    print(f"  📄 JSON guardado en: {json_out}")

if __name__ == "__main__":
    main()
