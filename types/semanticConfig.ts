export interface ModelStatus {
  loaded: boolean;
  dimensions: number;
  runtime: string;
  model_path: string;
  memory_usage: string;
}

export interface DbStatus {
  db_path: string;
  indexed_videos: number;
  transcript_chunks: number;
  health_status: string;
}

export interface SearchConfig {
  min_score: number;
  max_results: number;
  similarity_metric: string;
  chunk_size: number;
  chunk_overlap: number;
}

export interface SystemMetrics {
  average_query_time_ms: number;
  average_onnx_time_ms: number;
  average_db_time_ms: number;
  model_load_time_ms: number;
  total_queries_run: number;
}

export interface DebugSearchResult {
  results: {
    video_id: number;
    title: string | null;
    thumbnail: string | null;
    matched_text: string;
    chunk_index: number;
    similarity_score: number;
  }[];
  embedding_time_ms: number;
  onnx_inference_time_ms: number;
  sqlite_search_time_us: number;
  total_time_ms: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
}
