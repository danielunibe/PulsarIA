import { useState, useEffect, useCallback } from 'react';
import { 
  ModelStatus, DbStatus, SearchConfig, 
  SystemMetrics, LogEntry, DebugSearchResult 
} from '../types/semanticConfig';

/**
 * Hook para gestionar la configuración y estado del motor semántico.
 * 
 * Obtiene y actualiza el estado del modelo ONNX, la base de datos,
 * la configuración de búsqueda, las métricas del sistema y los logs
 * en tiempo real.
 * 
 * Funciona tanto en modo Tauri (invoke IPC) como en navegador standalone
 * (con datos de fallback mockeados para desarrollo).
 * 
 * @returns Objeto con estados, callbacks de acción, y logs en vivo
 */
export function useSemanticConfig() {
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [searchConfig, setSearchConfig] = useState<SearchConfig | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllStates = useCallback(async () => {
    try {
      setIsLoading(true);
      let model: ModelStatus | null = null;
      let db: DbStatus | null = null;
      let config: SearchConfig | null = null;
      let mets: SystemMetrics | null = null;

      try {
        const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
        [model, db, config, mets] = await Promise.all([
          tauriInvoke<ModelStatus>('get_model_status'),
          tauriInvoke<DbStatus>('get_db_status'),
          tauriInvoke<SearchConfig>('get_search_config'),
          tauriInvoke<SystemMetrics>('get_system_metrics'),
        ]);
      } catch {
        // Fallback para ejecución en navegador web standalone (localhost)
        model = {
          loaded: true,
          dimensions: 384,
          runtime: 'ONNX Runtime (DirectML / CPU)',
          model_path: 'assets/models/all-MiniLM-L6-v2/model.onnx',
          memory_usage: '~90MB',
        };
        db = {
          db_path: 'data/library.db',
          indexed_videos: 0,
          transcript_chunks: 0,
          health_status: 'Healthy',
        };
        config = {
          min_score: 0.35,
          max_results: 10,
          similarity_metric: 'Cosine',
          chunk_size: 150,
          chunk_overlap: 50,
        };
        mets = {
          average_query_time_ms: 14.2,
          average_onnx_time_ms: 8.5,
          average_db_time_ms: 3.1,
          model_load_time_ms: 120.0,
          total_queries_run: 0,
        };
      }
      
      setModelStatus(model);
      setDbStatus(db);
      setSearchConfig(config);
      setMetrics(mets);
    } catch (error) {
      console.error("Failed to fetch semantic config states:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void fetchAllStates(); });

    let unlistenFn: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen: tauriListen }) => {
      tauriListen<string>('system-log', (event) => {
        setLogs(prevLogs => {
          const newLog: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString(),
            message: event.payload
          };
          return [...prevLogs, newLog].slice(-100);
        });
      }).then(fn => { unlistenFn = fn; }).catch(() => {});
    }).catch(() => {});

    return () => {
      unlistenFn?.();
    };
  }, [fetchAllStates]);

  // Actions
  const reloadModel = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reload_model');
    } catch {}
    await fetchAllStates();
  };

  const updateSearchConfig = async (configUpdate: Partial<SearchConfig>) => {
    if (!searchConfig) return;
    const merged = { ...searchConfig, ...configUpdate };
    
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('update_search_config', {
        minScore: merged.min_score,
        maxResults: merged.max_results,
        chunkSize: merged.chunk_size,
        chunkOverlap: merged.chunk_overlap
      });
    } catch {
      setSearchConfig(merged);
    }
    
    await fetchAllStates();
  };

  const rebuildIndex = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('rebuild_index');
    } catch {}
  };

  const vacuumDb = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('vacuum_db');
    } catch {}
  };

  const recomputeEmbeddings = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('recompute_embeddings');
    } catch {}
  };

  const debugSearch = async (query: string): Promise<DebugSearchResult> => {
    // Bug #20 FIX: No mock data — throw error when backend unavailable
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<DebugSearchResult>('debug_search_transcripts', { query });
    const mets = await invoke<SystemMetrics>('get_system_metrics');
    setMetrics(mets);
    return result;
  };

  return {
    modelStatus,
    dbStatus,
    searchConfig,
    metrics,
    logs,
    isLoading,
    actions: {
      reloadModel,
      updateSearchConfig,
      rebuildIndex,
      vacuumDb,
      recomputeEmbeddings,
      debugSearch,
      refresh: fetchAllStates
    }
  };
}
