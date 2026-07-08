import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  ModelStatus, DbStatus, SearchConfig, 
  SystemMetrics, LogEntry, DebugSearchResult 
} from '../types/semanticConfig';

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
      const [model, db, config, mets] = await Promise.all([
        invoke<ModelStatus>('get_model_status'),
        invoke<DbStatus>('get_db_status'),
        invoke<SearchConfig>('get_search_config'),
        invoke<SystemMetrics>('get_system_metrics'),
      ]);
      
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
    fetchAllStates();

    const unlistenLogs = listen<string>('system-log', (event) => {
      setLogs(prevLogs => {
        const newLog: LogEntry = {
          id: crypto.randomUUID(),
          timestamp: new Date().toLocaleTimeString(),
          message: event.payload
        };
        // Keep last 100 logs to prevent memory leaks
        return [...prevLogs, newLog].slice(-100);
      });
    });

    return () => {
      unlistenLogs.then(f => f());
    };
  }, [fetchAllStates]);

  // Actions
  const reloadModel = async () => {
    await invoke('reload_model');
    await fetchAllStates();
  };

  const updateSearchConfig = async (configUpdate: Partial<SearchConfig>) => {
    if (!searchConfig) return;
    const merged = { ...searchConfig, ...configUpdate };
    
    await invoke('update_search_config', {
      minScore: merged.min_score,
      maxResults: merged.max_results,
      chunkSize: merged.chunk_size,
      chunkOverlap: merged.chunk_overlap
    });
    
    await fetchAllStates();
  };

  const rebuildIndex = async () => {
    await invoke('rebuild_index');
  };

  const vacuumDb = async () => {
    await invoke('vacuum_db');
  };

  const recomputeEmbeddings = async () => {
    await invoke('recompute_embeddings');
  };

  const debugSearch = async (query: string): Promise<DebugSearchResult> => {
    const result = await invoke<DebugSearchResult>('debug_search_transcripts', { query });
    // Refresh metrics after a native debug search
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
