import type { JobActivityEvent, JobRecord, PendingJob } from '@/hooks/use-jobs';

export type ActivityFilter = 'all' | 'active' | 'queued' | 'completed' | 'errors';

export interface ActivityPresentation {
  label: string;
  shortLabel: string;
  tone: 'accent' | 'cyan' | 'muted' | 'success' | 'error' | 'warning';
  stage: number;
  determinate: boolean;
}

const COMPLETE = new Set(['complete', 'completed', 'done']);
const ERRORS = new Set(['error', 'error_dlq', 'failed', 'failure', 'cancelled', 'canceled']);
const QUEUED = new Set(['queued', 'pending', 'metadata']);

/** One mapping for raw queue states; visual components never switch on them. */
export function presentActivityStatus(status: string, progress = 0): ActivityPresentation {
  switch (status.toLowerCase()) {
    case 'queued':
    case 'pending':
      return { label: 'En cola', shortLabel: 'COLA', tone: 'muted', stage: 1, determinate: false };
    case 'metadata':
      return { label: 'Preparando', shortLabel: 'PREPARANDO', tone: 'cyan', stage: 2, determinate: progress > 0 };
    case 'downloading':
      return { label: 'Descargando', shortLabel: 'DESCARGANDO', tone: 'cyan', stage: 3, determinate: progress > 0 };
    case 'processing':
    case 'extracting_audio':
      return { label: 'Procesando', shortLabel: 'PROCESANDO', tone: 'cyan', stage: 4, determinate: progress > 0 };
    case 'transcribing':
      return { label: 'Transcribiendo', shortLabel: 'TRANSCRIBIENDO', tone: 'accent', stage: 5, determinate: progress > 0 };
    case 'indexing':
      return { label: 'Indexando', shortLabel: 'INDEXANDO', tone: 'accent', stage: 6, determinate: progress > 0 };
    case 'retrying':
      return { label: 'Reintentando', shortLabel: 'REINTENTANDO', tone: 'warning', stage: 4, determinate: false };
    case 'retryable':
      return { label: 'No enviado', shortLabel: 'REINTENTAR', tone: 'error', stage: 0, determinate: false };
    case 'complete':
    case 'completed':
    case 'done':
      return { label: 'Listo', shortLabel: 'LISTO', tone: 'success', stage: 7, determinate: true };
    case 'error':
    case 'error_dlq':
    case 'failed':
    case 'failure':
    case 'cancelled':
    case 'canceled':
      return { label: 'Necesita atención', shortLabel: 'ERROR', tone: 'error', stage: 0, determinate: false };
    default:
      return { label: 'Procesando', shortLabel: 'PROCESANDO', tone: 'cyan', stage: 4, determinate: progress > 0 };
  }
}

export function isActivityError(status: string): boolean {
  return ERRORS.has(status.toLowerCase());
}

export function isActivityComplete(status: string): boolean {
  return COMPLETE.has(status.toLowerCase());
}

export function isActivityQueued(status: string): boolean {
  return QUEUED.has(status.toLowerCase());
}

export function matchesActivityFilter(job: JobRecord | PendingJob, filter: ActivityFilter): boolean {
  if ('clientId' in job) return filter === 'all' || filter === 'active' || filter === 'queued';
  if (filter === 'all') return true;
  if (filter === 'errors') return isActivityError(job.status);
  if (filter === 'completed') return isActivityComplete(job.status);
  if (filter === 'queued') return isActivityQueued(job.status);
  return !isActivityComplete(job.status) && !isActivityError(job.status);
}

export function activityTitle(job: JobRecord | PendingJob, fallback = 'Nuevo elemento') {
  const title = job.title?.trim();
  if (title && !/^https?:\/\//i.test(title)) return title;
  try {
    const url = new URL(job.url);
    const path = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
      .replace(/[-_]+/g, ' ').trim();
    return path || url.hostname.replace(/^www\./i, '') || fallback;
  } catch {
    return fallback;
  }
}

export function activityOrigin(job: JobRecord | PendingJob): string {
  try {
    const hostname = new URL(job.url).hostname.replace(/^www\./i, '').toLowerCase();
    if (hostname.includes('tiktok')) return 'TikTok · Enlace';
    return hostname || 'Enlace';
  } catch {
    return 'Enlace';
  }
}

export function eventLabel(event: JobActivityEvent): string {
  return presentActivityStatus(event.status, event.progress).label;
}

export function relativeActivityTime(value: string): string {
  const timestamp = Date.parse(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  if (!Number.isFinite(timestamp)) return value;
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `Hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  return new Date(timestamp).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

export const PIPELINE_STAGES = ['Descubierto', 'En cola', 'Descargando', 'Procesando', 'Transcribiendo', 'Indexando', 'Biblioteca'];
