'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { FaCamera, FaClock, FaFilm, FaPlay, FaTriangleExclamation } from '@/components/icon-library';
import { useI18n } from '@/lib/i18n';
import {
  fetchMagazineSourceMedia,
  formatTimestamp,
  resolveAssetUrl,
  type MagazineEvidenceRecord,
  type MagazineSourceMedia,
  type MagazineSourceRecord,
} from '@/lib/magazines';

/**
 * EvidenceSourceInspector — inspector de fuentes del Reader editorial.
 *
 * Resuelve `Evidence → Source → Media` por IPC y reproduce con el mecanismo
 * canónico de Pulsaria (`<video>` + `convertFileSrc`, seek por `currentTime`
 * en `loadedmetadata` con clamp, mismo patrón que `ExpandedVideoModal`).
 * Sin video local declara honestamente que la reproducción no está
 * disponible; nunca inventa una ruta.
 */

interface EvidenceSourceInspectorProps {
  articleId: string;
  evidence: MagazineEvidenceRecord;
  sources: MagazineSourceRecord[];
  onClose: () => void;
}

function sourceStateLabel(sourceState: string, jobStatus: string, locale: 'es-MX' | 'en-US' = 'es-MX'): string {
  const en = locale === 'en-US';
  if (sourceState === 'local') return en ? 'Local' : 'Local';
  if (sourceState === 'online') return en ? 'Online · entry retained' : 'Online · ficha conservada';
  if (sourceState === 'unavailable') return en ? 'Unavailable · entry retained' : 'No disponible · ficha conservada';
  return `${sourceState} · job ${jobStatus}`;
}

function ResolvedImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void resolveAssetUrl(path).then((resolved) => {
      if (live) setUrl(resolved ?? null);
    });
    return () => {
      live = false;
    };
  }, [path]);
  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-white/[0.03] text-white/25 ${className ?? ''}`}>
        <FaCamera size={18} />
      </div>
    );
  }
  return (
    <span className="relative block h-56 w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <Image src={url} alt={alt} fill unoptimized sizes="(max-width: 720px) 100vw, 640px" className="object-contain" />
    </span>
  );
}

function SourceVideo({
  media,
  startSec,
  endSec,
}: {
  media: MagazineSourceMedia;
  startSec: number | null;
  endSec: number | null;
}) {
  const { t, locale } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void resolveAssetUrl(media.video_path).then((resolved) => {
      if (live) setVideoUrl(resolved ?? null);
    });
    void resolveAssetUrl(media.poster_path).then((resolved) => {
      if (live) setPosterUrl(resolved ?? null);
    });
    return () => {
      live = false;
    };
  }, [media.video_path, media.poster_path]);

  useEffect(() => {
    if (startSec === null || !Number.isFinite(startSec)) return;
    const element = videoRef.current;
    if (!element) return;
    const seek = () => {
      const requested = Math.max(0, startSec);
      const limit =
        Number.isFinite(element.duration) && element.duration > 0 ? element.duration : requested;
      element.currentTime = Math.min(requested, limit);
    };
    if (element.readyState >= 1) seek();
    element.addEventListener('loadedmetadata', seek);
    return () => element.removeEventListener('loadedmetadata', seek);
  }, [startSec, videoUrl]);

  if (!media.video_path || !videoUrl) {
    return (
      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center flex flex-col items-center gap-2">
        <FaFilm size={20} className="text-white/25" />
        <p className="text-xs text-white/70 font-medium">{t('inspectorNoPlayback')}</p>
        <p className="text-[11px] text-white/40">
          {sourceStateLabel(media.source_state, media.job_status, locale)} · {t('inspectorNoLocalFile')}
        </p>
      </div>
    );
  }

  const playSegment = () => {
    const element = videoRef.current;
    if (!element) return;
    if (startSec !== null && Number.isFinite(startSec)) {
      element.currentTime = Math.max(0, startSec);
    }
    void element.play().catch(() => {
      /* el navegador puede exigir gesto adicional; el control nativo queda */
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          poster={posterUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="w-full max-h-[320px] bg-black"
        />
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-white/45 font-mono">
          {formatTimestamp(startSec)}
          {endSec !== null && Number.isFinite(endSec) ? ` — ${formatTimestamp(endSec)}` : ''}
          {media.duration_secs !== null && Number.isFinite(media.duration_secs)
            ? ` · ${t('inspectorTotal', { time: formatTimestamp(media.duration_secs) })}`
            : ''}
        </span>
        {startSec !== null && Number.isFinite(startSec) && (
          <button
            type="button"
            onClick={playSegment}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-[11px] font-semibold flex items-center gap-1.5 transition-all"
          >
            <FaPlay size={10} />
            {t('inspectorPlaySegment')}
          </button>
        )}
      </div>
    </div>
  );
}

export function EvidenceSourceInspector({
  articleId,
  evidence,
  sources,
  onClose,
}: EvidenceSourceInspectorProps) {
  const { t, locale } = useI18n();
  const [media, setMedia] = useState<MagazineSourceMedia | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setIsLoading(true);
    setLoadError(null);
    setMedia(null);
    fetchMagazineSourceMedia(evidence.job_id)
      .then((resolved) => {
        if (!live) return;
        if (!resolved) {
          setLoadError(t('inspectorSourceGone', { id: evidence.job_id }));
          return;
        }
        setMedia(resolved);
      })
      .catch((error: unknown) => {
        if (live) setLoadError(error instanceof Error ? error.message : t('inspectorResolveError'));
      })
      .finally(() => {
        if (live) setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [evidence.job_id, articleId, t]);

  const source = sources.find((candidate) => candidate.id === evidence.source_id)
    ?? sources.find((candidate) => candidate.job_id === evidence.job_id);

  return (
    <section
      aria-label={t('inspectorTitle')}
      className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.04] p-4 md:p-5 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-sky-300/80">
            {t('inspectorOriginalSource')} · job {evidence.job_id}
          </span>
          <span className="text-sm font-semibold text-white/90">
            {media?.title ?? t('inspectorResolving')}
          </span>
          {media && (
            <span className="text-[11px] text-white/45">
              {[media.author, media.platform, sourceStateLabel(media.source_state, media.job_status, locale)]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
          {source?.citation_label && (
            <span className="text-[11px] text-white/45 font-mono">{source.citation_label}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/15 border border-white/10 text-white/70 hover:text-white text-[11px] font-medium transition-all shrink-0"
        >
          {t('inspectorClose')}
        </button>
      </div>

      {isLoading ? (
        <div className="h-44 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
      ) : loadError ? (
        <p className="text-xs text-rose-300/90">{loadError}</p>
      ) : media ? (
        <>
          <SourceVideo media={media} startSec={evidence.timestamp_start} endSec={evidence.timestamp_end} />
          {evidence.keyframe_path && (
            <figure className="flex flex-col gap-1.5">
              <ResolvedImage
                path={evidence.keyframe_path}
                alt={t('inspectorKeyframeAlt', { id: evidence.id })}
                className="rounded-xl border border-white/10 max-h-56 w-auto self-start object-contain bg-black"
              />
              <figcaption className="text-[10px] text-white/35 flex items-center gap-1.5">
                <FaCamera size={10} />
                {t('inspectorKeyframeSaved')}
                {evidence.timestamp_start !== null && Number.isFinite(evidence.timestamp_start)
                  ? ` · ${formatTimestamp(evidence.timestamp_start)}`
                  : ''}
              </figcaption>
            </figure>
          )}
          {evidence.transcript_text && (
            <blockquote className="border-l-2 border-sky-400/40 pl-3 py-1 text-[13px] text-white/75 italic leading-relaxed">
              “{evidence.transcript_text}”
            </blockquote>
          )}
          <div className="flex items-center gap-2 text-[11px] text-white/40 font-mono flex-wrap">
            <span className="flex items-center gap-1">
              <FaClock size={10} />
              {formatTimestamp(evidence.timestamp_start)}
              {evidence.timestamp_end !== null && Number.isFinite(evidence.timestamp_end)
                ? ` — ${formatTimestamp(evidence.timestamp_end)}`
                : ''}
            </span>
            <span>·</span>
            <span>{t('inspectorEvidenceRef', { id: evidence.id })}</span>
            <span>·</span>
            <span>{t('inspectorConfidence', { pct: Math.round(evidence.confidence * 100) })}</span>
          </div>
        </>
      ) : null}
    </section>
  );
}
