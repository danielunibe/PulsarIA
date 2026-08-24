'use client';
import { useState, useCallback } from 'react';

export interface SemanticIOState {
  exporting: boolean;
  importing: boolean;
  error: string | null;
  exportedContent: string | null;
}

export function useSemanticIO() {
  const [state, setState] = useState<SemanticIOState>({
    exporting: false,
    importing: false,
    error: null,
    exportedContent: null,
  });

  const exportSemantic = useCallback(async (jobId: number): Promise<string | null> => {
    setState(s => ({ ...s, exporting: true, error: null, exportedContent: null }));
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const content = await invoke<string>('export_semantic', { jobId });
      setState(s => ({ ...s, exporting: false, exportedContent: content }));
      return content;
    } catch (e) {
      setState(s => ({ ...s, exporting: false, error: String(e) }));
      return null;
    }
  }, []);

  const importSemantic = useCallback(async (content: string): Promise<boolean> => {
    setState(s => ({ ...s, importing: true, error: null }));
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('import_semantic', { content });
      setState(s => ({ ...s, importing: false }));
      return true;
    } catch (e) {
      setState(s => ({ ...s, importing: false, error: String(e) }));
      return false;
    }
  }, []);

  const clearError = useCallback(() => setState(s => ({ ...s, error: null })), []);

  const downloadUnib = useCallback(() => {
    if (!state.exportedContent) return;
    const blob = new Blob([state.exportedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `video-${Date.now()}.unib`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [state.exportedContent]);

  return {
    ...state,
    exportSemantic,
    importSemantic,
    clearError,
    downloadUnib,
  };
}