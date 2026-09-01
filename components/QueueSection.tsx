'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { TikTokProcessor } from './TikTokProcessor';
import { useSettings } from '@/lib/settings-context';
import { isCompletedJob, isFailedJob, resolveAssetUrl, type JobRecord, type PendingJob } from '@/hooks/use-jobs';

interface QueueSectionProps {
  jobs: JobRecord[];
  pending: PendingJob[];
  globalProgress: number;
  onRetryJob: (jobId: number) => Promise<void>;
  onRetryPending: (clientId: string) => Promise<void>;
}

const FORMAT_META: Record<string, { label: string; color: string; step: number }> = {
  mp4: { label: 'MP4', color: '#3b82f6', step: 1 },
  mkv: { label: 'MKV', color: '#3b82f6', step: 1 },
  webm: { label: 'WEBM', color: '#3b82f6', step: 1 },
  mov: { label: 'MOV', color: '#3b82f6', step: 1 },
  mp3: { label: 'MP3', color: '#f59e0b', step: 2 },
  wav: { label: 'WAV', color: '#f59e0b', step: 2 },
  flac: { label: 'FLAC', color: '#f59e0b', step: 2 },
  ogg: { label: 'OGG', color: '#f59e0b', step: 2 },
  m4a: { label: 'M4A', color: '#f59e0b', step: 2 },
  txt: { label: 'TXT', color: '#10b981', step: 3 },
  srt: { label: 'SRT', color: '#10b981', step: 3 },
  vtt: { label: 'VTT', color: '#10b981', step: 3 },
  json: { label: 'JSON', color: '#10b981', step: 3 },
};

function GlobalProgress({ percentage }: { percentage: number }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-[10px] border border-white/10 bg-white/[.04] px-2.5 py-1.5">
      <span className="font-mono text-[12px] font-bold tabular-nums text-white">{percentage}%</span>
      <span className="text-[8px] font-black uppercase tracking-[.12em] text-white/45">Progreso</span>
    </div>
  );
}

function stageFor(status: string): 'MP4' | 'MP3' | 'TXT' | 'complete' {
  switch (status.toLowerCase()) {
    case 'processing':
    case 'extracting_audio':
      return 'MP3';
    case 'transcribing':
    case 'indexing':
      return 'TXT';
    case 'complete':
    case 'completed':
    case 'done':
      return 'complete';
    default:
      return 'MP4';
  }
}

function taskKey(task: JobRecord | PendingJob) {
  return 'jobId' in task && task.jobId ? `job-${task.jobId}` : 'id' in task ? `job-${task.id}` : `pending-${task.clientId}`;
}

export function QueueSection({ jobs, pending, globalProgress, onRetryJob, onRetryPending }: QueueSectionProps) {
  const { settings } = useSettings();
  const [resolvedThumbs, setResolvedThumbs] = useState<Record<string, string | undefined>>({});
  const [retryingKey, setRetryingKey] = useState<string | null>(null);

  const activeJobs = useMemo(() => jobs.filter((job) => !isCompletedJob(job) && !isFailedJob(job)), [jobs]);
  const boundIds = useMemo(() => new Set(pending.map((item) => item.jobId).filter((id): id is number => typeof id === 'number')), [pending]);
  const tasks = useMemo<Array<JobRecord | PendingJob>>(() => [
    ...pending.filter((item) => item.status !== 'retryable' && (!item.jobId || !jobs.some((job) => job.id === item.jobId))),
    ...activeJobs.filter((job) => !boundIds.has(job.id)),
  ], [activeJobs, boundIds, jobs, pending]);
  const failedJobs = useMemo(() => jobs.filter(isFailedJob), [jobs]);
  const retryablePending = useMemo(() => pending.filter((item) => item.status === 'retryable'), [pending]);

  useEffect(() => {
    let active = true;
    void Promise.all(tasks.map(async (task) => {
      const key = taskKey(task);
      const source = 'thumbnail' in task ? task.thumbnail : undefined;
      return [key, await resolveAssetUrl(source)] as const;
    })).then((entries) => {
      if (active) setResolvedThumbs((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => { active = false; };
  }, [tasks]);

  const formats = [...settings.formats].sort((a, b) => (FORMAT_META[a]?.step ?? 99) - (FORMAT_META[b]?.step ?? 99));
  if (tasks.length === 0 && failedJobs.length === 0 && retryablePending.length === 0) return null;

  return (
    <section className="flex min-h-0 w-full flex-col gap-3 font-sans">
      {tasks.length > 0 && <div className="flex flex-col gap-3 px-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate text-[11px] font-black uppercase tracking-[.16em] text-white/75">Cola de procesamiento</h2>
            <span className="shrink-0 text-[9px] font-mono text-white/35">{tasks.length}</span>
          </div>
          <GlobalProgress percentage={globalProgress} />
        </div>

        {formats.length > 0 && <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          <span className="mr-1 text-[8px] font-bold uppercase tracking-wider text-white/30">Formatos</span>
          {formats.map((format) => {
            const meta = FORMAT_META[format];
            if (!meta) return null;
            return <span key={format} className="rounded-[5px] border px-1.5 py-0.5 text-[8px] font-black tracking-wider" style={{ color: meta.color, borderColor: `${meta.color}45`, background: `${meta.color}15` }}>{meta.label}</span>;
          })}
        </div>}

        <div className="grid grid-cols-4 gap-1 px-0.5" aria-label="Fases del procesamiento">
          {['Descarga', 'Audio', 'Transcripción', 'Indexado'].map((label, index) => <span key={label} className={`h-1 rounded-full ${index === 0 ? 'bg-[#25f4ee]' : index < Math.ceil(globalProgress / 25) ? 'bg-[#8a5cff]/70' : 'bg-white/10'}`} title={label} />)}
        </div>
      </div>}

      <div className="flex min-h-0 w-full flex-col gap-2.5">
        {tasks.map((task) => {
          const isPending = 'clientId' in task;
          const status = isPending ? task.status : task.status;
          const title = task.title || ('url' in task ? task.url : 'Preparando enlace');
          return (
            <motion.div key={taskKey(task)} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <TikTokProcessor
                title={title}
                author={isPending ? 'Enlace pendiente' : task.author || 'Pulsaria Engine'}
                duration={!isPending && task.duration ? String(task.duration) : '--:--'}
                thumbnailUrl={resolvedThumbs[taskKey(task)]}
                currentStepId={stageFor(status)}
                stepProgress={task.progress || 0}
              />
            </motion.div>
          );
        })}
        {(failedJobs.length > 0 || retryablePending.length > 0) && (
          <div className="flex flex-col gap-2" aria-label="Trabajos que se pueden reintentar">
            {[...failedJobs.map((job) => ({ key: `failed-${job.id}`, title: job.title || job.url, onRetry: () => onRetryJob(job.id) })), ...retryablePending.map((item) => ({ key: `retry-${item.clientId}`, title: item.url, onRetry: () => onRetryPending(item.clientId) }))].map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-[14px] border border-white/[.08] bg-white/[.025] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold text-white/70">{item.title}</p>
                </div>
                <button
                  type="button"
                  disabled={retryingKey !== null}
                  onClick={() => {
                    setRetryingKey(item.key);
                    void item.onRetry().catch(() => undefined).finally(() => setRetryingKey(null));
                  }}
                  className="shrink-0 rounded-[10px] border border-white/15 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-white/65 transition hover:border-[#25f4ee]/40 hover:text-[#25f4ee] disabled:cursor-wait disabled:opacity-45"
                >
                  {retryingKey === item.key ? 'Reintentando…' : 'Reintentar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
