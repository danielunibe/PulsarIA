'use client';

import { useMemo } from 'react';
import {
  activityOrigin,
  activityTitle,
  isActivityComplete,
  isActivityError,
  presentActivityStatus,
  relativeActivityTime,
} from '@/lib/activity';
import type { JobRecord, PendingJob } from '@/hooks/use-jobs';
import {
  FaArrowUpRightFromSquare,
  FaCheck,
  FaInfo,
  FaRotate,
  FaTriangleExclamation,
  FaWaveSquare,
} from '@/components/icon-library';

interface NotificationsPopoverProps {
  jobs: JobRecord[];
  pending: PendingJob[];
  onRetryJob: (jobId: number) => Promise<void>;
  onRetryPending: (clientId: string) => Promise<void>;
  onOpenLibrary?: (jobId: number) => void;
}

type NotificationItem =
  | { kind: 'job'; value: JobRecord }
  | { kind: 'pending'; value: PendingJob };

function notificationTime(item: NotificationItem) {
  return item.kind === 'job' ? relativeActivityTime(item.value.created_at) : 'Ahora';
}

function notificationTitle(item: NotificationItem) {
  return activityTitle(item.value, item.kind === 'pending' ? 'Enlace recibido' : 'Nuevo elemento');
}

function NotificationRow({
  item,
  onRetryJob,
  onRetryPending,
  onOpenLibrary,
}: {
  item: NotificationItem;
  onRetryJob: (jobId: number) => Promise<void>;
  onRetryPending: (clientId: string) => Promise<void>;
  onOpenLibrary?: (jobId: number) => void;
}) {
  const job = item.kind === 'job' ? item.value : null;
  const presentation = presentActivityStatus(item.value.status, item.value.progress);
  const complete = job ? isActivityComplete(job.status) : false;
  const error = item.kind === 'pending'
    ? item.value.status === 'retryable'
    : isActivityError(item.value.status);
  const progress = complete ? 100 : Math.max(0, Math.min(100, item.value.progress));

  return (
    <article className={`notification-item ${error ? 'is-error' : complete ? 'is-complete' : ''}`}>
      <div className="notification-item-icon" aria-hidden="true">
        {error ? <FaTriangleExclamation size={14} /> : complete ? <FaCheck size={14} /> : <FaRotate className="notification-spin" size={14} />}
      </div>
      <div className="notification-item-body">
        <div className="notification-item-heading">
          <strong title={notificationTitle(item)}>{notificationTitle(item)}</strong>
          <span>{notificationTime(item)}</span>
        </div>
        <div className="notification-item-meta">
          <span>{activityOrigin(item.value)}</span>
          <span className={`notification-item-status ${error ? 'error' : complete ? 'success' : ''}`}>{presentation.shortLabel}</span>
        </div>
        {presentation.determinate && (
          <div className="notification-progress" aria-label={`${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        {error && (
          <p className="notification-item-error">
            {item.kind === 'pending' ? item.value.error || 'No se pudo enviar el enlace.' : item.value.error_message || 'El trabajo necesita atención.'}
          </p>
        )}
        <div className="notification-item-actions">
          {complete && job && onOpenLibrary && (
            <button type="button" onClick={() => onOpenLibrary(job.id)}>
              <FaArrowUpRightFromSquare size={12} /> Abrir en Biblioteca
            </button>
          )}
          {item.kind === 'pending' && item.value.status === 'retryable' && (
            <button type="button" onClick={() => void onRetryPending(item.value.clientId)}>
              <FaRotate size={12} /> Reintentar
            </button>
          )}
          {item.kind === 'job' && isActivityError(item.value.status) && (
            <button type="button" onClick={() => void onRetryJob(item.value.id)}>
              <FaRotate size={12} /> Reintentar
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function NotificationsPopover({
  jobs,
  pending,
  onRetryJob,
  onRetryPending,
  onOpenLibrary,
}: NotificationsPopoverProps) {
  const items = useMemo<NotificationItem[]>(() => [
    ...pending.map((value) => ({ kind: 'pending' as const, value })),
    ...jobs
      .slice()
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
      .slice(0, 7)
      .map((value) => ({ kind: 'job' as const, value })),
  ].slice(0, 8), [jobs, pending]);

  const attentionCount = pending.length + jobs.filter((job) => !isActivityComplete(job.status)).length;

  return (
    <section className="notification-popover" role="region" aria-labelledby="activity-title">
      <div className="notification-popover-header">
        <div>
          <span className="notification-kicker"><FaWaveSquare size={11} /> Centro de actividad</span>
          <h2 id="activity-title">Actividad</h2>
        </div>
        <span className="notification-count" aria-label={`${attentionCount} cambios pendientes`}>{attentionCount}</span>
      </div>
      <p className="notification-popover-help">Estados reales de la cola y del procesamiento local.</p>
      {items.length === 0 ? (
        <div className="notification-empty">
          <FaInfo size={16} />
          <span>No hay cambios nuevos. Pulsaria está al día.</span>
        </div>
      ) : (
        <div className="notification-list" aria-live="polite">
          {items.map((item) => (
            <NotificationRow
              key={item.kind === 'job' ? `job-${item.value.id}` : `pending-${item.value.clientId}`}
              item={item}
              onRetryJob={onRetryJob}
              onRetryPending={onRetryPending}
              onOpenLibrary={onOpenLibrary}
            />
          ))}
        </div>
      )}
    </section>
  );
}
