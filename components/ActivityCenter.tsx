'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  activityOrigin,
  activityTitle,
  eventLabel,
  isActivityComplete,
  isActivityError,
  matchesActivityFilter,
  PIPELINE_STAGES,
  presentActivityStatus,
  relativeActivityTime,
  type ActivityFilter,
} from '@/lib/activity';
import { localApiErrorMessage } from '@/lib/api-client';
import {
  fetchJobActivity,
  type JobActivityEvent,
  type JobRecord,
  type PendingJob,
} from '@/hooks/use-jobs';

interface ActivityCenterProps {
  jobs: JobRecord[];
  pending: PendingJob[];
  loading: boolean;
  ready: boolean;
  error: string | null;
  globalProgress: number;
  onRefresh: () => void;
  onRetryJob: (jobId: number) => Promise<void>;
  onRetryPending: (clientId: string) => Promise<void>;
  onOpenLibrary?: (jobId: number) => void;
}

const TONE_CLASS = {
  accent: 'text-[#fe2c55] border-[#fe2c55]/35 bg-[#fe2c55]/[.08]',
  cyan: 'text-[#65e6e0] border-[#65e6e0]/30 bg-[#65e6e0]/[.07]',
  muted: 'text-white/55 border-white/10 bg-white/[.035]',
  success: 'text-[#9ee6bd] border-[#9ee6bd]/25 bg-[#9ee6bd]/[.07]',
  error: 'text-[#ff8299] border-[#fe2c55]/35 bg-[#fe2c55]/[.09]',
  warning: 'text-[#ffd27d] border-[#ffd27d]/25 bg-[#ffd27d]/[.07]',
} as const;

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: 'all', label: 'Todo' },
  { id: 'active', label: 'Activos' },
  { id: 'queued', label: 'En cola' },
  { id: 'completed', label: 'Completados' },
  { id: 'errors', label: 'Errores' },
];

function titleFor(job: JobRecord | PendingJob) {
  return activityTitle(job, 'Preparando enlace');
}

function sortRank(job: JobRecord | PendingJob) {
  if ('clientId' in job) return 1;
  if (isActivityError(job.status)) return 0;
  if (!isActivityComplete(job.status)) return 1;
  return 2;
}

function toneFor(status: string, progress: number) {
  return TONE_CLASS[presentActivityStatus(status, progress).tone];
}

function ActivityRow({
  job,
  selected,
  onSelect,
  onRetry,
}: {
  job: JobRecord | PendingJob;
  selected: boolean;
  onSelect: () => void;
  onRetry?: () => void;
}) {
  const isPending = 'clientId' in job;
  const presentation = presentActivityStatus(job.status, job.progress);
  const hasProgress = presentation.determinate && (presentation.label === 'Listo' || job.progress > 0);
  const progress = presentation.label === 'Listo' ? 100 : Math.max(0, Math.min(100, job.progress));

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onSelect}
      className={`w-full rounded-[14px] border px-3 py-3 text-left transition-colors ${selected ? 'border-white/20 bg-white/[.075]' : 'border-white/[.07] bg-black/10 hover:bg-white/[.045]'}`}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border text-[10px] font-black ${toneFor(job.status, job.progress)}`}>
          {isPending ? '·' : presentation.label === 'Listo' ? '✓' : presentation.label === 'Necesita atención' ? '!' : '›'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] font-semibold text-white/90">{titleFor(job)}</span>
            {!isPending && hasProgress && <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/60">{progress}%</span>}
          </span>
          <span className="mt-1 flex items-center justify-between gap-2 text-[9px]">
            <span className="truncate text-white/40">{activityOrigin(job)}{isPending ? ' · enviando' : ''}</span>
            <span className={`shrink-0 font-black uppercase tracking-[.12em] ${TONE_CLASS[presentation.tone].split(' ')[0]}`}>{presentation.shortLabel}</span>
          </span>
          {hasProgress && !isPending && (
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[.08]" aria-label={`${progress}%`}>
              <span className={`block h-full rounded-full ${presentation.tone === 'accent' ? 'bg-[#fe2c55]' : 'bg-[#65e6e0]'}`} style={{ width: `${progress}%` }} />
            </span>
          )}
          {!isPending && isActivityError(job.status) && job.error_message && (
            <span className="mt-2 block truncate text-[10px] text-[#ff8299]/75">{job.error_message}</span>
          )}
          {isPending && job.status === 'retryable' && (
            <span className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[#ff8299]/75">
              <span className="truncate">No se pudo enviar el enlace.</span>
              {onRetry && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onRetry(); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); onRetry(); } }} className="shrink-0 font-black uppercase tracking-wider text-[#ff8299]">Reintentar</span>}
            </span>
          )}
        </span>
      </div>
    </motion.button>
  );
}

function Inspector({
  job,
  events,
  loading,
  error,
  onRetry,
  onRetryEvents,
  onOpenLibrary,
}: {
  job: JobRecord | null;
  events: JobActivityEvent[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onRetryEvents: () => void;
  onOpenLibrary: () => void;
}) {
  if (!job) {
    return <div className="flex h-full items-center justify-center px-5 text-center text-[11px] leading-relaxed text-white/35">Selecciona un trabajo para inspeccionar su estado real y su historial.</div>;
  }

  const presentation = presentActivityStatus(job.status, job.progress);
  const isError = isActivityError(job.status);
  const isComplete = isActivityComplete(job.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 custom-scrollbar">
      <div className="border-b border-white/[.08] pb-4">
        <p className="truncate text-[13px] font-semibold text-white/90">{titleFor(job)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-[.12em] ${TONE_CLASS[presentation.tone]}`}>{presentation.label}</span>
          <span className="text-[9px] text-white/35">{activityOrigin(job)}</span>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-b border-white/[.08] py-4 text-[10px]">
        <dt className="text-white/35">Trabajo</dt><dd className="text-right font-mono text-white/65">#{job.id}</dd>
        <dt className="text-white/35">Creado</dt><dd className="text-right text-white/65">{relativeActivityTime(job.created_at)}</dd>
        <dt className="text-white/35">Reintentos</dt><dd className="text-right font-mono text-white/65">{job.retry_count ?? 0}</dd>
        <dt className="text-white/35">URL original</dt><dd className="truncate text-right text-white/65" title={job.url}>{job.url}</dd>
      </dl>

      <div className="border-b border-white/[.08] py-4">
        <p className="mb-3 text-[9px] font-black uppercase tracking-[.16em] text-white/35">Pipeline real</p>
        <div className="flex flex-col gap-2">
          {PIPELINE_STAGES.map((stage, index) => {
            const reached = isComplete || (presentation.stage > 0 && index < presentation.stage);
            const current = !isComplete && !isError && index === presentation.stage;
            return <div key={stage} className="flex items-center gap-2 text-[10px]">
              <span className={`h-1.5 w-1.5 rounded-full ${reached ? 'bg-[#9ee6bd]' : current ? 'bg-[#65e6e0] shadow-[0_0_8px_rgba(101,230,224,.8)]' : 'bg-white/15'}`} />
              <span className={reached || current ? 'text-white/75' : 'text-white/30'}>{stage}</span>
              {current && <span className="ml-auto text-[9px] uppercase tracking-wider text-[#65e6e0]">actual</span>}
            </div>;
          })}
        </div>
      </div>

      {isError && (
        <div className="border-b border-white/[.08] py-4">
          <p className="text-[10px] font-semibold text-[#ff8299]">{job.error_message || 'Pulsaria no pudo completar este trabajo.'}</p>
          <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-[#fe2c55]/35 bg-[#fe2c55]/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#ff8299] hover:bg-[#fe2c55]/20">Reintentar</button>
        </div>
      )}
      {isComplete && (
        <button type="button" onClick={onOpenLibrary} className="my-4 rounded-lg border border-white/15 bg-white/[.06] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white/75 hover:bg-white/10">Abrir en Biblioteca</button>
      )}

      <div className="pt-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[9px] font-black uppercase tracking-[.16em] text-white/35">Timeline persistida</p>
          {loading && <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />}
        </div>
        {error ? (
          <div role="alert" className="text-[10px] leading-relaxed text-[#ff8299]">
            <p>{error}</p>
            <button type="button" onClick={onRetryEvents} className="mt-2 rounded-md bg-[#fe2c55]/10 px-2.5 py-1.5 font-bold text-[#ff9bad] hover:bg-[#fe2c55]/20">Reintentar historial</button>
          </div>
        ) : events.length === 0 && !loading ? (
          <p className="text-[10px] leading-relaxed text-white/35">Este trabajo no tiene transiciones históricas persistidas. Se muestra únicamente el estado actual del registro.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map((event) => (
              <div key={event.id} className="relative pl-4">
                <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-white/45" />
                <p className="text-[10px] text-white/70">{eventLabel(event)}{event.progress > 0 ? ` · ${event.progress}%` : ''}</p>
                <p className="mt-0.5 font-mono text-[9px] text-white/30">{event.created_at}</p>
                {event.error_code && <p className="mt-1 font-mono text-[9px] text-[#ff8299]/75">{event.error_code}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityCenter({ jobs, pending, loading, ready, error, globalProgress, onRefresh, onRetryJob, onRetryPending, onOpenLibrary }: ActivityCenterProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [events, setEvents] = useState<JobActivityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsRetry, setEventsRetry] = useState(0);
  const allJobs = useMemo<Array<JobRecord | PendingJob>>(() => [...pending, ...jobs], [jobs, pending]);
  const visibleJobs = useMemo(() => allJobs
    .filter((job) => matchesActivityFilter(job, filter))
    .sort((a, b) => {
      const rank = sortRank(a) - sortRank(b);
      if (rank !== 0) return rank;
      if ('created_at' in a && 'created_at' in b) return Date.parse(b.created_at) - Date.parse(a.created_at);
      return 0;
    }), [allJobs, filter]);
  const selectedJob = jobs.find((job) => job.id === selectedId) ?? null;
  const processingCount = jobs.filter((job) => !isActivityComplete(job.status) && !isActivityError(job.status) && !['queued', 'metadata'].includes(job.status.toLowerCase())).length;
  const queuedCount = pending.length + jobs.filter((job) => ['queued', 'metadata'].includes(job.status.toLowerCase())).length;
  const completedCount = jobs.filter((job) => isActivityComplete(job.status)).length;

  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      setEventsError(null);
      return;
    }
    let mounted = true;
    setEventsLoading(true);
    setEventsError(null);
    void fetchJobActivity(selectedId)
      .then((next) => { if (mounted) setEvents(next); })
      .catch((historyError: unknown) => {
        if (mounted) {
          setEvents([]);
          setEventsError(localApiErrorMessage(historyError, 'No se pudo cargar el historial de este trabajo.'));
        }
      })
      .finally(() => { if (mounted) setEventsLoading(false); });
    return () => { mounted = false; };
  }, [selectedId, jobs, eventsRetry]);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 font-sans">
      <div className="px-1">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-white/35">Pulsaria</p><h2 className="mt-1 text-[19px] font-semibold tracking-tight text-white/90">Actividad</h2></div>
          <div className="text-right"><p className="font-mono text-[12px] text-white/75">{ready ? `${globalProgress}%` : '—'}</p><p className="text-[8px] uppercase tracking-[.12em] text-white/30">promedio activo</p></div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-y border-white/[.08] py-2.5">
          <div><p className="font-mono text-[15px] text-[#65e6e0]">{ready ? processingCount : '—'}</p><p className="text-[8px] uppercase tracking-wider text-white/30">Procesando</p></div>
          <div><p className="font-mono text-[15px] text-white/70">{ready ? queuedCount : '—'}</p><p className="text-[8px] uppercase tracking-wider text-white/30">En cola</p></div>
          <div><p className="font-mono text-[15px] text-[#9ee6bd]">{ready ? completedCount : '—'}</p><p className="text-[8px] uppercase tracking-wider text-white/30">Completados</p></div>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto px-1 pb-1 custom-scrollbar" role="tablist" aria-label="Filtrar actividad">
        {FILTERS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)} className={`whitespace-nowrap rounded-md px-2 py-1.5 text-[9px] font-bold transition-colors ${filter === item.id ? 'bg-white/10 text-white/90' : 'text-white/35 hover:text-white/70'}`}>{item.label}</button>)}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-1 custom-scrollbar">
        {loading && !ready && <p role="status" className="py-2 text-center text-[10px] text-white/45">Conectando con la actividad local…</p>}
        {!loading && !ready && <div role="alert" className="rounded-xl bg-[#fe2c55]/10 px-3 py-3 text-[10px] leading-relaxed text-[#ff9bad]">
          <p>{error || 'No pudimos consultar la actividad local.'}</p>
          <button type="button" onClick={onRefresh} className="mt-2 rounded-md bg-white/[.07] px-2.5 py-1.5 font-bold text-white/75 hover:bg-white/10">Reintentar conexión</button>
        </div>}
        {visibleJobs.length === 0 && ready
          ? <div className="flex flex-1 items-center justify-center px-5 text-center"><p className="text-[11px] leading-relaxed text-white/40">No hay trabajos para este filtro.<br /><span className="text-white/25">La actividad aparecerá aquí cuando agregues un enlace.</span></p></div>
          : visibleJobs.map((job) => <ActivityRow key={'clientId' in job ? job.clientId : job.id} job={job} selected={'id' in job && job.id === selectedId} onSelect={() => 'id' in job ? setSelectedId(job.id) : undefined} onRetry={'clientId' in job && job.status === 'retryable' ? () => void onRetryPending(job.clientId) : undefined} />)}
      </div>
      {selectedJob && <div className="max-h-[58%] min-h-[260px] border-t border-white/[.09] pt-3"><Inspector job={selectedJob} events={events} loading={eventsLoading} error={eventsError} onRetryEvents={() => setEventsRetry((value) => value + 1)} onRetry={() => void onRetryJob(selectedJob.id)} onOpenLibrary={() => onOpenLibrary?.(selectedJob.id)} /></div>}
    </section>
  );
}
