#!/usr/bin/env python3
"""
Pulsaria — BEIR / MS MARCO Recall Benchmark Runner
Sprint 5, Fase 27

Ejecuta el recall benchmark contra el motor desplegado localmente.

Uso:
    pip install requests beir tqdm
    python scripts/recall_benchmark.py --endpoint http://localhost:8080 --api-key YOUR_KEY

Requiere:
    - Motor Pulsar corriendo en local o Docker
    - Dataset BEIR descargado (por defecto: trec-covid, msmarco)
"""

import argparse
import json
import math
import time
from typing import Any

import requests

# ─── Argumentos CLI ─────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser(description="Pulsar Recall Benchmark")
    p.add_argument("--endpoint", default="http://localhost:8080", help="URL del motor Pulsar")
    p.add_argument("--api-key", default="secret_pulsar_key", help="API Key / JWT")
    p.add_argument("--top-k", type=int, default=10, help="Resultados por query")
    p.add_argument("--max-queries", type=int, default=100, help="Límite de queries a evaluar")
    p.add_argument("--dataset", default="trec-covid", help="Nombre del dataset BEIR")
    return p.parse_args()

# ─── Cliente HTTP mínimo ─────────────────────────────────────────────────
class PulsarHTTPClient:
    def __init__(self, endpoint: str, api_key: str):
        self.base = endpoint
        self.headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    def search(self, query: str, top_k: int) -> list[dict]:
        body = {"query": query, "top_k": top_k, "use_hybrid": True}
        try:
            r = requests.post(f"{self.base}/api/v1/search", json=body, headers=self.headers, timeout=5)
            return r.json() if r.ok else []
        except Exception as e:
            print(f"  ERROR: {e}")
            return []

# ─── Métricas de IR ──────────────────────────────────────────────────────
def recall_at_k(result_ids: list[int], relevant_ids: set[int], k: int) -> float:
    if not relevant_ids:
        return 0.0
    hits = sum(1 for rid in result_ids[:k] if rid in relevant_ids)
    return hits / len(relevant_ids)

def mean_reciprocal_rank(result_ids: list[int], relevant_ids: set[int]) -> float:
    for i, rid in enumerate(result_ids):
        if rid in relevant_ids:
            return 1.0 / (i + 1)
    return 0.0

def ndcg_at_k(result_ids: list[int], relevant_ids: set[int], k: int) -> float:
    dcg = sum(
        1.0 / math.log2(i + 2)
        for i, rid in enumerate(result_ids[:k])
        if rid in relevant_ids
    )
    ideal_count = min(len(relevant_ids), k)
    idcg = sum(1.0 / math.log2(i + 2) for i in range(ideal_count))
    return dcg / idcg if idcg > 0 else 0.0

# ─── Dataset Sintético (fallback sin BEIR instalado) ────────────────────
def load_synthetic_dataset() -> list[dict]:
    """100 pares query/relevantes para validación rápida sin deps externas."""
    base_queries = [
        "how does tokio async runtime work in rust",
        "vector similarity search hnsw algorithm",
        "semantic search embeddings transformer model",
        "distributed system consensus raft protocol",
        "rate limiting token bucket algorithm",
    ]
    dataset = []
    for i, q in enumerate(base_queries * 20):
        dataset.append({
            "query": q,
            "relevant_ids": {i * 100 + j for j in range(3)},
        })
    return dataset

# ─── Main ────────────────────────────────────────────────────────────────
def main():
    args = parse_args()
    client = PulsarHTTPClient(args.endpoint, args.api_key)

    print(f"\n{'='*60}")
    print(f"  Pulsar Recall Benchmark — dataset: {args.dataset}")
    print(f"  Endpoint: {args.endpoint} | top_k={args.top_k}")
    print(f"{'='*60}\n")

    # Cargar dataset (BEIR o sintético)
    try:
        from beir import util
        from beir.datasets.data_loader import GenericDataLoader
        data_path = util.download_and_unzip(args.dataset, "datasets/")
        corpus, queries, qrels = GenericDataLoader(data_folder=data_path).load(split="test")
        query_items = [
            {"query": queries[qid], "relevant_ids": set(qrels[qid].keys())}
            for qid in list(queries.keys())[:args.max_queries]
        ]
        print(f"Dataset BEIR cargado: {len(query_items)} queries")
    except ImportError:
        print("⚠️  BEIR no instalado — usando dataset sintético (pip install beir para datos reales)")
        query_items = load_synthetic_dataset()[:args.max_queries]

    # Ejecutar benchmark
    r10_sum = r50_sum = mrr_sum = ndcg_sum = latency_sum = 0.0
    total = 0

    for item in query_items:
        t0 = time.monotonic()
        results = client.search(item["query"], top_k=max(args.top_k, 50))
        latency_ms = (time.monotonic() - t0) * 1000

        result_ids = [r.get("jobId", r.get("job_id", 0)) for r in results]
        rel = item["relevant_ids"]

        r10_sum  += recall_at_k(result_ids, rel, 10)
        r50_sum  += recall_at_k(result_ids, rel, 50)
        mrr_sum  += mean_reciprocal_rank(result_ids, rel)
        ndcg_sum += ndcg_at_k(result_ids, rel, 10)
        latency_sum += latency_ms
        total += 1

    n = max(total, 1)
    recall10 = r10_sum / n
    recall50 = r50_sum / n
    mrr      = mrr_sum / n
    ndcg     = ndcg_sum / n
    avg_lat  = latency_sum / n

    # Umbrales competitivos
    COMPETITIVE = {"recall@10": 0.80, "mrr": 0.35, "ndcg@10": 0.45}

    print(f"\n{'='*60}")
    print(f"  RESULTADOS ({total} queries)")
    print(f"{'='*60}")
    print(f"  recall@10   : {recall10:.4f}  {'✅' if recall10 >= COMPETITIVE['recall@10'] else '⚠️ '} (target ≥ {COMPETITIVE['recall@10']})")
    print(f"  recall@50   : {recall50:.4f}")
    print(f"  MRR         : {mrr:.4f}      {'✅' if mrr >= COMPETITIVE['mrr'] else '⚠️ '} (target ≥ {COMPETITIVE['mrr']})")
    print(f"  nDCG@10     : {ndcg:.4f}     {'✅' if ndcg >= COMPETITIVE['ndcg@10'] else '⚠️ '} (target ≥ {COMPETITIVE['ndcg@10']})")
    print(f"  avg latency : {avg_lat:.1f}ms")
    print(f"{'='*60}\n")

    passed = recall10 >= COMPETITIVE["recall@10"] and mrr >= COMPETITIVE["mrr"]
    print(f"  VEREDICTO: {'✅ MOTOR COMPETITIVO CON SISTEMAS COMERCIALES' if passed else '⚠️  Motor necesita mejoras de relevancia'}")

    # Exportar resultado JSON para CI/CD
    with open("benchmark_result.json", "w") as f:
        json.dump({
            "recall_at_10": recall10, "recall_at_50": recall50,
            "mrr": mrr, "ndcg_at_10": ndcg, "avg_latency_ms": avg_lat,
            "total_queries": total, "dataset": args.dataset,
        }, f, indent=2)
    print("\n  📄 Resultado guardado en benchmark_result.json")


if __name__ == "__main__":
    main()
