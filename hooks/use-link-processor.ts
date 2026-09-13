'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Plataforma de origen detectada a partir de la URL del video.
 * 
 * - `tiktok`: Videos de TikTok (www.tiktok.com, vm.tiktok.com, vt.tiktok.com)
 * - `generic`: URL no soportada por el MVP
 */
export type Platform = 'tiktok' | 'generic';

const PLATFORM_REGEXES: Record<Platform, RegExp> = {
  tiktok: /https:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i,
  generic: /^https?:\/\/.{5,}/i,
};

const PLAYLIST_REGEX = /https:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/playlists?\//i;

/**
 * Determina si una URL es una playlist de TikTok.
 * 
 * Las playlists de TikTok siguen el patrón: `tiktok.com/@username/playlists/...`
 * Se distinguen de videos individuales porque son colecciones de múltiples videos.
 * 
 * @param url - URL a evaluar
 * @returns `true` si la URL es una playlist de TikTok
 */
export function isPlaylistUrl(url: string): boolean {
  return PLAYLIST_REGEX.test(url);
}

/**
 * Detecta la plataforma de origen de un video a partir de su URL.
 * 
 * Solo TikTok forma parte del MVP; cualquier otra URL retorna `generic`.
 * 
 * @param url - URL del video a analizar
 * @returns La plataforma detectada
 */
export function detectPlatform(url: string): Platform {
  if (PLATFORM_REGEXES.tiktok.test(url)) return 'tiktok';
  return 'generic';
}

function isValidUrl(url: string): boolean {
  return PLATFORM_REGEXES.tiktok.test(url);
}

type LinkStats = { total: number; valid: number; invalid: number };

/**
 * Estados del procesador de links.
 * 
 * - `idle`: Sin datos ingresados
 * - `analyzing`: Analizando/validando los links ingresados
 * - `ready`: Links validados, listos para enviar al backend
 * - `processing`: Pipeline en ejecución (descarga → transcripción → indexación)
 * - `done`: Procesamiento completado exitosamente
 */
export type Status = 'idle' | 'analyzing' | 'ready' | 'processing' | 'done';

/**
 * Hook personalizado para gestionar el procesamiento de links de videos.
 * 
 * Maneja el ciclo completo: validación de URLs, parsing de archivos
 * (.txt/.csv), envío al backend via Tauri IPC, y monitoreo del estado.
 * 
 * @returns Objeto con estado del procesador, callbacks y datos procesados
 * 
 * @example
 * ```tsx
 * const { activeTab, status, validLinks, handleProcessData, handleFinalProcess } = useLinkProcessor();
 * ```
 */
export function useLinkProcessor() {
  const [activeTab, setActiveTab] = useState<'link' | 'file'>('link');
  const [linkText, setLinkText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [stats, setStats] = useState<LinkStats>({ total: 0, valid: 0, invalid: 0 });
  const [validLinks, setValidLinks] = useState<string[]>([]);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const analysisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetUI = useCallback(() => {
    if (analysisTimerRef.current) {
      clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
    setLinkText('');
    setFile(null);
    setStatus('idle');
    setStats({ total: 0, valid: 0, invalid: 0 });
    setValidLinks([]);
    setProcessingError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (analysisTimerRef.current) clearInterval(analysisTimerRef.current);
    };
  }, []);

  const parseLinksData = useCallback((text: string) => {
    const lines = [...new Set(
      text
        .split(/\r?\n|,|;/)
        .map((line) => line.trim())
        .filter(Boolean),
    )];
    const validList: string[] = [];
    let invalidCount = 0;

    for (const line of lines) {
      if (isValidUrl(line)) validList.push(line);
      else invalidCount += 1;
    }

    return {
      total: validList.length + invalidCount,
      validCount: validList.length,
      invalidCount,
      validList,
    };
  }, []);

  const handleProcessData = useCallback(
    async (textOverride?: string) => {
      setProcessingError(null);
      setStatus('analyzing');
      let rawText = textOverride ?? linkText;

      if (textOverride === undefined && activeTab === 'file' && file) {
        try {
          rawText = await file.text();
        } catch (error) {
          console.error('Error reading link file', error);
          setProcessingError('No se pudo leer el archivo. Selecciona un TXT o CSV accesible.');
          setStatus('idle');
          return;
        }
      }

      const result = parseLinksData(rawText);
      setValidLinks(result.validList);

      if (analysisTimerRef.current) clearInterval(analysisTimerRef.current);
      if (result.total === 0) {
        setStats({ total: 0, valid: 0, invalid: 0 });
        if (activeTab === 'file' && file) {
          setProcessingError('El archivo no contiene enlaces. Añade al menos una URL HTTPS y vuelve a intentarlo.');
        }
        setStatus('idle');
        return;
      }

      let currentCount = 0;
      const steps = 40;
      const increment = result.total / steps;
      analysisTimerRef.current = setInterval(() => {
        currentCount += increment;
        if (currentCount >= result.total) {
          if (analysisTimerRef.current) clearInterval(analysisTimerRef.current);
          analysisTimerRef.current = null;
          setStats({ total: result.total, valid: result.validCount, invalid: result.invalidCount });
          setStatus(result.validCount > 0 ? 'ready' : 'idle');
          return;
        }

        const ratio = currentCount / result.total;
        setStats({
          total: Math.floor(currentCount),
          valid: Math.floor(result.validCount * ratio),
          invalid: Math.floor(result.invalidCount * ratio),
        });
      }, 30);
    },
    [activeTab, file, linkText, parseLinksData],
  );

  const handleFinalProcess = useCallback(
    async (onComplete?: () => void) => {
      setProcessingError(null);
      setStatus('processing');
      type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
      let tauriInvoke: TauriInvoke | null = null;

      try {
        if (typeof window !== 'undefined' && (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
          const { invoke } = await import('@tauri-apps/api/core');
          tauriInvoke = <T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args);
        }
      } catch (error) {
        console.warn('Tauri core not available; falling back to the REST gateway.', error);
      }

      const linksToProcess = [...validLinks];
      let processedCount = 0;
      const failedUrls: string[] = [];

      for (const url of linksToProcess) {
        let jobCreated = false;
        try {
          if (tauriInvoke) {
            const returnedJobId = await tauriInvoke<number>('add_job', { url });
            jobCreated = true;
            // Bug #3 FIX: Pass the real job_id to the frontend
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('pulsar_job_created', {
                        detail: { url, job_id: returnedJobId, timestamp: Date.now() },
                    }),
                );
            }
          } else {
            const { REST_API_BASE } = await import('@/lib/api-config');
            const response = await fetch(`${REST_API_BASE}/ingest`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url }),
            });
            if (!response.ok) {
              throw new Error(`REST ingest failed with status ${response.status}`);
            }
            jobCreated = true;
          }
        } catch (error) {
          console.error('Failed to add job', { url, error });
          failedUrls.push(url);
        }

        // Bug #3 FIX: Event already dispatched above with real job_id (Tauri path)
        // Only dispatch for REST fallback path
        if (jobCreated && !tauriInvoke && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('pulsar_job_created', {
              detail: { url, job_id: null, timestamp: Date.now() },
            }),
          );
        }

        processedCount += 1;
        setStats((previous) => ({
          ...previous,
          valid: Math.max(0, linksToProcess.length - processedCount),
        }));
      }

      if (failedUrls.length > 0) {
        setProcessingError(
          `${failedUrls.length} enlace${failedUrls.length === 1 ? '' : 's'} no pudo${failedUrls.length === 1 ? '' : 'ieron'} entrar a la cola. Revisa el gateway y vuelve a intentarlo.`,
        );
        setStatus('idle');
        return;
      }

      setStatus('done');
      window.setTimeout(() => {
        resetUI();
        onComplete?.();
      }, 800);
    },
    [resetUI, validLinks],
  );

  const handleDownloadFile = useCallback(() => {
    if (validLinks.length === 0) return;
    const content = validLinks.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `pulsar_links_${Date.now()}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    resetUI();
  }, [resetUI, validLinks]);

  const hasData = linkText.trim().length > 0 || file !== null;

  return {
    activeTab,
    setActiveTab,
    linkText,
    setLinkText,
    file,
    setFile,
    status,
    stats,
    validLinks,
    processingError,
    hasData,
    handleProcessData,
    handleFinalProcess,
    handleDownloadFile,
  };
}
