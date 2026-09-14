'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { REST_API_BASE } from '@/lib/api-config';
import { apiFetch } from '@/lib/api-client';

export interface JobRecord {
  id: number;
  url: string;
  status: string;
  progress: number;
  retry_count?: number;
  created_at: string;
  title?: string;
  author?: string;
  thumbnail?: string;
  duration?: number;
  video_path?: string;
  audio_path?: string;
  transcript_path?: string;
  keep_status?: string;
  platform?: string;
  error_message?: string;
  visual_analysis?: string;
  instructional_guide?: string;
  video_bytes?: number;
  audio_bytes?: number;
  downloaded_at?: string;
  last_accessed_at?: string;
  play_count?: number;
  open_count?: number;
  search_hit_count?: number;
  favorite?: boolean;
  pinned?: boolean;
  protected?: boolean;
  source_state?: 'local' | 'online' | 'unavailable' | string;
  purged_at?: string;
  purged_reason?: string;
  poster_path?: string;
}

export type PendingJobStatus = 'pending' | 'submitting' | 'retryable';

export interface PendingJob {
  clientId: string;
  jobId?: number;
  url: string;
  status: PendingJobStatus;
  progress: number;
  thumbnail?: string;
  title?: string;
  error?: string;
}

export interface QueueSnapshot {
  jobs: JobRecord[];
  pending: PendingJob[];
  active: Array<JobRecord | PendingJob>;
  globalProgress: number;
  /** True only after a complete, successful reconciliation with the backend. */
  ready: boolean;
}

const COMPLETE_STATUSES = new Set(['complete', 'completed', 'done']);

export function isCompletedJob(job: Pick<JobRecord, 'status'>): boolean {
  return COMPLETE_STATUSES.has(String(job.status).toLowerCase());
}

export function isFailedJob(job: Pick<JobRecord, 'status'>): boolean {
  return new Set(['error', 'error_dlq', 'failed', 'failure', 'cancelled', 'canceled'])
    .has(String(job.status).toLowerCase());
}

export async function resolveAssetUrl(localPath: string | undefined): Promise<string | undefined> {
  if (!localPath) return undefined;
  if (/^https?:\/\//i.test(localPath) || /^data:/i.test(localPath)) return localPath;
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    return convertFileSrc(localPath);
  } catch {
    return undefined;
  }
}

function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window
    || window.location.protocol === 'tauri:'
    || window.location.hostname === 'tauri.localhost';
}

function userFacingError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message.trim() : String(error ?? '').trim();
  const normalized = raw.toLowerCase();
  if (!raw) return fallback;

  if (/failed to fetch|fetch failed|networkerror|network request failed|load failed|econnrefused|connection refused/.test(normalized)) {
    return 'No pudimos conectar con la biblioteca local. Comprueba que Pulsaria siga ejecutándose y vuelve a intentarlo.';
  }

  const status = raw.match(/\b([45]\d{2})\b/)?.[1];
  if (status === '401' || status === '403') {
    return 'La solicitud no fue autorizada por el motor local. Revisa la configuración e inténtalo de nuevo.';
  }
  if (status === '429') {
    return 'El motor local está ocupado. Espera un momento y vuelve a intentarlo.';
  }
  if (status && status.startsWith('5')) {
    return 'El motor local devolvió un error. Revisa Salud y vuelve a intentarlo.';
  }

  return raw;
}

async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

async function fetchJobsFromSources(): Promise<JobRecord[]> {
  try {
    return await invokeTauri<JobRecord[]>('get_jobs');
  } catch (error) {
    // Dentro de la ventana nativa un error de IPC es el error real del
    // backend. No lo ocultamos intentando un REST localhost inexistente.
    if (isNativeShell()) throw error;
  const response = await apiFetch(`${REST_API_BASE}/jobs`);
    if (!response.ok) throw new Error(`No se pudo actualizar la biblioteca (${response.status})`);
    return response.json() as Promise<JobRecord[]>;
  }
}

async function enqueueThroughSources(url: string): Promise<number> {
  try {
    return await invokeTauri<number>('add_job', { url });
  } catch (error) {
    if (isNativeShell()) throw error;
  const response = await apiFetch(`${REST_API_BASE}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) throw new Error(`No se pudo enviar el enlace (${response.status})`);
    const payload = await response.json() as { job_id?: number };
    if (!payload.job_id) throw new Error('El gateway no devolvió un identificador de trabajo');
    return payload.job_id;
  }
}

export function useJobs(): QueueSnapshot & {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<JobRecord[]>;
  enqueueLinks: (urls: string[]) => Promise<void>;
  retryJob: (jobId: number) => Promise<void>;
  retryPending: (clientId: string) => Promise<void>;
} {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextJobs = await fetchJobsFromSources();
      setJobs(nextJobs);
      setReady(true);
      setError(null);
      setPending((current) => current.filter((item) => !item.jobId || !nextJobs.some((job) => job.id === item.jobId)));
      return nextJobs;
    } catch (error) {
      // Never leave a stale completed row in memory after IPC/REST failure.
      // The page uses `ready` to avoid replacing this unknown state with the
      // demo library and to keep the header count honest.
      setJobs([]);
      setReady(false);
      setError(userFacingError(error, 'No se pudo actualizar la biblioteca local.'));
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);
  const jobsRef = useRef(jobs);
jobsRef.current = jobs;

  useEffect(() => {
    let mounted = true;
    void refresh().catch((error) => {
      if (mounted) console.warn('Initial job refresh failed:', error);
    });

    let pollInterval = 2000;
    let timerId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (!mounted) return;
      await refresh().catch((error) => console.warn('Job refresh failed:', error));
      if (!mounted) return;

      const hasActiveJobs = jobsRef.current.some((j) =>
        ['queued', 'downloading', 'transcribing', 'processing', 'retrying'].includes(j.status.toLowerCase())
      );
      pollInterval = hasActiveJobs
        ? 2000
        : Math.min(pollInterval * 1.5, 30_000);
      timerId = setTimeout(poll, pollInterval);
    };

    timerId = setTimeout(poll, pollInterval);

    let cleanups: Array<() => void> = [];
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      if (!mounted) return;
      const events = ['job_progress', 'job_completed_notify', 'media_indexed'];
      const subscriptions = await Promise.all(events.map(async (eventName) => {
        try {
          return await listen(eventName, () => {
            void refresh().catch((error) => console.warn(`Job refresh after ${eventName} failed:`, error));
          });
        } catch (error) {
          console.warn(`Could not subscribe to ${eventName}:`, error);
          return () => {};
        }
      }));
      if (mounted) cleanups = subscriptions;
      else subscriptions.forEach((cleanup) => cleanup());
    }).catch((error) => console.warn('Could not initialize native job events:', error));

    return () => {
      mounted = false;
      clearTimeout(timerId);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [refresh]);
  const enqueueLinks = useCallback(async (urls: string[]) => {
    const uniqueUrls = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
    const now = Date.now();
    const optimistic = uniqueUrls.map((url, index): PendingJob => ({
      clientId: `${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      status: 'submitting',
      progress: 0,
    }));
    setPending((current) => [...optimistic, ...current]);

    for (const item of optimistic) {
      try {
        const jobId = await enqueueThroughSources(item.url);
        setPending((current) => current.map((candidate) => candidate.clientId === item.clientId
          ? { ...candidate, jobId, status: 'pending' }
          : candidate));
        await refresh();
      } catch (error) {
        setPending((current) => current.map((candidate) => candidate.clientId === item.clientId
          ? { ...candidate, status: 'retryable', error: userFacingError(error, 'No se pudo enviar el enlace.') }
          : candidate));
      }
    }
  }, [refresh]);

  const retryJob = useCallback(async (jobId: number) => {
    try {
      await invokeTauri<void>('retry_job', { jobId });
    } catch (error) {
      if (isNativeShell()) throw error;
      const response = await apiFetch(`${REST_API_BASE}/jobs/${jobId}/retry`, { method: 'POST' });
      if (!response.ok) throw new Error(`No se pudo reintentar el trabajo (${response.status})`);
    }
    await refresh();
  }, [refresh]);

  const retryPending = useCallback(async (clientId: string) => {
    const item = pending.find((candidate) => candidate.clientId === clientId);
    if (!item) return;
    setPending((current) => current.map((candidate) => candidate.clientId === clientId
      ? { ...candidate, status: 'submitting', error: undefined }
      : candidate));
    try {
      const jobId = await enqueueThroughSources(item.url);
      setPending((current) => current.map((candidate) => candidate.clientId === clientId
        ? { ...candidate, jobId, status: 'pending' }
        : candidate));
      await refresh();
    } catch (error) {
      setPending((current) => current.map((candidate) => candidate.clientId === clientId
          ? { ...candidate, status: 'retryable', error: userFacingError(error, 'No se pudo enviar el enlace.') }
        : candidate));
    }
  }, [pending, refresh]);

  const activeJobs = useMemo(() => jobs.filter((job) => !isCompletedJob(job) && !isFailedJob(job)), [jobs]);
  const active = useMemo(() => {
    const boundIds = new Set(pending.map((item) => item.jobId).filter((id): id is number => typeof id === 'number'));
    return [
      ...pending.filter((item) => item.status !== 'retryable' && (!item.jobId || !jobs.some((job) => job.id === item.jobId))),
      ...activeJobs.filter((job) => !boundIds.has(job.id)),
    ];
  }, [activeJobs, jobs, pending]);
  const globalProgress = useMemo(() => {
    if (active.length === 0) return 0;
    const total = active.reduce((sum, item) => sum + Math.max(0, Math.min(100, 'progress' in item ? item.progress : 0)), 0);
    return Math.round(total / active.length);
  }, [active]);

  return { jobs, pending, active, globalProgress, ready, loading, error, refresh, enqueueLinks, retryJob, retryPending };
}
