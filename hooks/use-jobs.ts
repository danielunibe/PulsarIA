'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { REST_API_BASE } from '@/lib/api-config';

export interface JobRecord {
  id: number;
  url: string;
  status: string;
  progress: number;
  created_at: string;
  title?: string;
  author?: string;
  thumbnail?: string;
  duration?: number;
  video_path?: string;
  keep_status?: string;
  platform?: string;
  error_message?: string;
  visual_analysis?: string;
  instructional_guide?: string;
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
    const response = await fetch(`${REST_API_BASE}/jobs`);
    if (!response.ok) throw new Error(`No se pudo actualizar la biblioteca (${response.status})`);
    return response.json() as Promise<JobRecord[]>;
  }
}

async function enqueueThroughSources(url: string): Promise<number> {
  try {
    return await invokeTauri<number>('add_job', { url });
  } catch (error) {
    if (isNativeShell()) throw error;
    const response = await fetch(`${REST_API_BASE}/ingest`, {
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
  refresh: () => Promise<JobRecord[]>;
  enqueueLinks: (urls: string[]) => Promise<void>;
  retryJob: (jobId: number) => Promise<void>;
  retryPending: (clientId: string) => Promise<void>;
} {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const nextJobs = await fetchJobsFromSources();
      setJobs(nextJobs);
      setPending((current) => current.filter((item) => !item.jobId || !nextJobs.some((job) => job.id === item.jobId)));
      return nextJobs;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void refresh().catch((error) => {
      if (mounted) console.warn('Initial job refresh failed:', error);
    });

    const interval = window.setInterval(() => {
      void refresh().catch((error) => console.warn('Job refresh failed:', error));
    }, 2000);

    let cleanups: Array<() => void> = [];
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      if (!mounted) return;
      const events = ['job_progress', 'job_completed_notify', 'media_indexed'];
      cleanups = await Promise.all(events.map(async (eventName) => {
        try {
          return await listen(eventName, () => { void refresh().catch(() => {}); });
        } catch {
          return () => {};
        }
      }));
    }).catch(() => {});

    return () => {
      mounted = false;
      window.clearInterval(interval);
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
          ? { ...candidate, status: 'retryable', error: error instanceof Error ? error.message : String(error) }
          : candidate));
      }
    }
  }, [refresh]);

  const retryJob = useCallback(async (jobId: number) => {
    try {
      await invokeTauri<void>('retry_job', { jobId });
    } catch (error) {
      if (isNativeShell()) throw error;
      const response = await fetch(`${REST_API_BASE}/jobs/${jobId}/retry`, { method: 'POST' });
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
        ? { ...candidate, status: 'retryable', error: error instanceof Error ? error.message : String(error) }
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

  return { jobs, pending, active, globalProgress, loading, refresh, enqueueLinks, retryJob, retryPending };
}
