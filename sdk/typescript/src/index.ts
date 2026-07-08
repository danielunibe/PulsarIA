import axios, { AxiosInstance } from "axios";

// ============================================================
// Pulsar Eventide — Official TypeScript SDK
// Sprint 5, Fase 28
//
// Usage:
//   const client = new PulsarClient({ endpoint: "http://localhost:8080", apiKey: "..." })
//   const results = await client.search({ query: "machine learning", topK: 10 })
// ============================================================

export interface PulsarClientConfig {
  endpoint: string;
  apiKey: string;
  tenantId?: string;
  timeoutMs?: number;
}

export interface IngestRequest {
  url: string;
  tenantId?: string;
}

export interface SearchRequest {
  query: string;
  topK?: number;
  tenantId?: string;
  useHybrid?: boolean;
  useReranker?: boolean;
}

export interface SearchResult {
  jobId: number;
  chunkIndex: number;
  title: string | null;
  thumbnail: string | null;
  chunkText: string;
  similarityScore: number;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  uptime_secs: number;
  queue_depth: number;
}

export interface JobStatus {
  id: number;
  url: string;
  status: string;
  progress: number;
}

export interface BenchmarkRunOptions {
  queries: Array<{ query: string; relevantIds: number[] }>;
  k?: number;
}

export interface BenchmarkResult {
  totalQueries: number;
  recall_at_10: number;
  recall_at_50: number;
  meanReciprocalRank: number;
  ndcg_at_10: number;
  avgLatencyMs: number;
}

// ─────────────────────────────────────────────────────────────
export class PulsarClient {
  private http: AxiosInstance;
  private tenantId?: string;

  constructor(config: PulsarClientConfig) {
    this.tenantId = config.tenantId;

    this.http = axios.create({
      baseURL: config.endpoint,
      timeout: config.timeoutMs ?? 10_000,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(config.tenantId ? { "X-Tenant-ID": config.tenantId } : {}),
      },
    });

    // Global response interceptor para errores legibles
    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const msg = err.response?.data?.error ?? err.message;
        return Promise.reject(new PulsarError(msg, err.response?.status));
      }
    );
  }

  // ─── Health ───────────────────────────────────────────────
  async health(): Promise<HealthResponse> {
    const { data } = await this.http.get<HealthResponse>("/api/v1/health");
    return data;
  }

  // ─── Ingest ───────────────────────────────────────────────
  /**
   * Ingest a video URL for transcription and indexing.
   * Returns the created job ID.
   */
  async ingest(request: IngestRequest): Promise<{ jobId: number }> {
    const { data } = await this.http.post<{ job_id: number }>("/api/v1/pipeline/ingest", {
      url: request.url,
      tenant_id: request.tenantId ?? this.tenantId,
    });
    return { jobId: data.job_id };
  }

  // ─── Search ───────────────────────────────────────────────
  /**
   * Perform a semantic (or hybrid) search over indexed content.
   * Automatically selects BM25+Vector RRF if useHybrid is true.
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const { data } = await this.http.post<SearchResult[]>("/api/v1/search", {
      query: request.query,
      top_k: request.topK ?? 10,
      tenant_id: request.tenantId ?? this.tenantId,
      use_hybrid: request.useHybrid ?? false,
      use_reranker: request.useReranker ?? true,
    });
    return data;
  }

  // ─── Jobs ─────────────────────────────────────────────────
  async getJobs(): Promise<JobStatus[]> {
    const { data } = await this.http.get<JobStatus[]>("/api/v1/jobs");
    return data;
  }

  // ─── Metrics ─────────────────────────────────────────────
  /** Returns raw Prometheus metrics text */
  async metrics(): Promise<string> {
    const { data } = await this.http.get<string>("/metrics");
    return data;
  }

  // ─── Batch Search ─────────────────────────────────────────
  /**
   * Run multiple searches in parallel.
   * Useful for benchmarking or batch processing.
   */
  async batchSearch(queries: string[], topK: number = 10): Promise<SearchResult[][]> {
    const results = await Promise.allSettled(
      queries.map((q) => this.search({ query: q, topK }))
    );

    return results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      console.warn(`Query [${i}] "${queries[i]}" falló: ${(r.reason as PulsarError).message}`);
      return [];
    });
  }
}

// ─── Error wrapper ────────────────────────────────────────────
export class PulsarError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "PulsarError";
  }
}
