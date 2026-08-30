'use client';
import { useState, useCallback } from 'react';

/**
 * Estado del hook de I/O semántica (export/import UNIB).
 */
export interface SemanticIOState {
  /** Si está exportando un video a formato UNIB */
  exporting: boolean;
  /** Si está importando un archivo UNIB */
  importing: boolean;
  /** Mensaje de error, o null si no hay error */
  error: string | null;
  /** Contenido exportado listo para descargar */
  exportedContent: string | null;
}

/**
 * Hook para operaciones de importación/exportación UNIB.
 * 
 * Proporciona funciones para:
 * - Exportar un video a formato .unib (para Julia)
 * - Importar un archivo .unib existente a la biblioteca
 * - Descargar el contenido exportado como archivo
 * 
 * Usa Tauri IPC (`export_semantic`, `import_semantic`) como canal.
 */
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