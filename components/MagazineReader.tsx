'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  FaArrowLeft,
  FaCamera,
  FaClock,
  FaCode,
  FaEye,
  FaFileLines,
  FaTriangleExclamation,
} from '@/components/icon-library';
import { EvidenceSourceInspector } from '@/components/EvidenceSourceInspector';
import { useI18n } from '@/lib/i18n';
import {
  fetchMagazineArticleDetails,
  formatTimestamp,
  presentArticleType,
  presentEditorialState,
  presentEvidenceKind,
  resolveAssetUrl,
  type MagazineArticleDetails,
  type MagazineEvidenceRecord,
  type MagazineEvidenceTarget,
  type MagazineVolumeView,
} from '@/lib/magazines';

/**
 * MagazineReader — lector editorial de la Fase 3.
 *
 * Circuito completo con datos reales (una sola llamada IPC agregada):
 * Tomo → Artículo → Contenido estructurado → Evidencia → Fuente → Video +
 * timestamp. Sin datos hardcodeados: vacío y error son estados explícitos.
 */

interface MagazineReaderProps {
  volume: MagazineVolumeView;
  articleId: string;
  initialTarget?: MagazineEvidenceTarget | null;
  onBack: () => void;
}

/* ---------------- Contenido estructurado ---------------- */

interface ContentBlock {
  kind: string;
  text?: string;
  title?: string;
  items?: unknown[];
  steps?: unknown[];
  language?: string;
  code?: string;
  rows?: unknown[];
  path?: string;
  timestamp?: number;
  level?: number;
  [key: string]: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function itemText(item: unknown): string {
  if (typeof item === 'string') return item;
  const record = asRecord(item);
  if (!record) return '';
  for (const key of ['instruction', 'text', 'name', 'label', 'title', 'fact', 'value']) {
    const text = asString(record[key]);
    if (text) {
      const amount = asString(record.amount) ?? asString(record.quantity);
      return amount ? `${text} — ${amount}` : text;
    }
  }
  return '';
}

function itemTime(item: unknown): string | null {
  const record = asRecord(item);
  if (!record) return null;
  for (const key of ['tc', 'timestamp', 'time', 'range']) {
    const text = asString(record[key]);
    if (text) return text;
    if (typeof record[key] === 'number' && Number.isFinite(record[key])) {
      return formatTimestamp(record[key] as number);
    }
  }
  const start = typeof record.start === 'number' ? formatTimestamp(record.start) : null;
  const end = typeof record.end === 'number' ? formatTimestamp(record.end) : null;
  if (start && end) return `${start} — ${end}`;
  return start;
}

function normalizeBlock(value: unknown, fallbackKind: string): ContentBlock | null {
  if (typeof value === 'string') {
    return value.trim() ? { kind: 'text', text: value } : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const kind = (asString(record.kind) ?? asString(record.type) ?? fallbackKind).toLowerCase();
  const block: ContentBlock = { kind };
  for (const [key, entry] of Object.entries(record)) {
    if (key === 'kind' || key === 'type') continue;
    if (key === 'text' || key === 'title' || key === 'language' || key === 'code' || key === 'path') {
      const text = asString(entry);
      if (text) (block as Record<string, unknown>)[key] = text;
    } else if (key === 'items' || key === 'steps' || key === 'rows' || key === 'blocks') {
      if (Array.isArray(entry)) (block as Record<string, unknown>)[key] = entry;
    } else if (key === 'timestamp' && typeof entry === 'number') {
      block.timestamp = entry;
    } else if (typeof entry === 'string' || typeof entry === 'number') {
      (block as Record<string, unknown>)[key] = entry;
    }
  }
  return block;
}

export interface MagazineRecipeLabels {
  yieldTitle: string;
  ingredientsTitle: string;
  stepsTitle: string;
}

function parseStructuredContent(
  raw: string,
  labels?: MagazineRecipeLabels,
): { blocks: ContentBlock[]; rawFallback: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { blocks: [], rawFallback: raw };
  }
  if (Array.isArray(parsed)) {
    const blocks = parsed
      .map((item) => normalizeBlock(item, 'text'))
      .filter((block): block is ContentBlock => block !== null);
    return { blocks, rawFallback: blocks.length === 0 ? raw : null };
  }
  const root = asRecord(parsed);
  if (!root) {
    return { blocks: typeof parsed === 'string' ? [{ kind: 'text', text: parsed }] : [], rawFallback: raw };
  }
  if (Array.isArray(root.blocks)) {
    const blocks = (root.blocks as unknown[])
      .map((item) => normalizeBlock(item, 'text'))
      .filter((block): block is ContentBlock => block !== null);
    return { blocks, rawFallback: blocks.length === 0 ? raw : null };
  }
  // Forma plana de receta: { yield, ingredients[], steps[] }.
  const blocks: ContentBlock[] = [];
  const extraEntries = Object.entries(root).filter(
    ([key]) => !['yield', 'servings', 'ingredients', 'steps'].includes(key),
  );
  const yieldText = asString(root.yield) ?? asString(root.servings);
  const recipeLabels = labels ?? { yieldTitle: 'Rinde', ingredientsTitle: 'Ingredientes', stepsTitle: 'Preparación' };
  if (yieldText) blocks.push({ kind: 'data', title: recipeLabels.yieldTitle, text: yieldText });
  if (Array.isArray(root.ingredients)) {
    blocks.push({ kind: 'ingredients', title: recipeLabels.ingredientsTitle, items: root.ingredients as unknown[] });
  }
  if (Array.isArray(root.steps)) {
    blocks.push({ kind: 'steps', title: recipeLabels.stepsTitle, steps: root.steps as unknown[] });
  }
  for (const [key, entry] of extraEntries) {
    const block = normalizeBlock(entry, 'text');
    if (block) {
      if (!block.title) block.title = key;
      blocks.push(block);
    }
  }
  return { blocks, rawFallback: blocks.length === 0 ? raw : null };
}

function BlockFigure({ block }: { block: ContentBlock }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!block.path) return;
    let live = true;
    void resolveAssetUrl(block.path).then((resolved) => {
      if (live) setUrl(resolved ?? null);
    });
    return () => {
      live = false;
    };
  }, [block.path]);
  if (!block.path || !url) return null;
  return (
    <figure className="flex flex-col gap-1.5 my-2">
      {/* URL resuelta async vía resolveAssetUrl (asset local/dinámico, no optimizable por next/image) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={block.title ?? t('magazineFigureAlt')}
        loading="lazy"
        className="rounded-xl border border-white/10 max-h-64 w-auto self-start object-contain bg-black"
      />
      {(block.title || block.timestamp !== undefined) && (
        <figcaption className="text-[11px] text-white/40 flex items-center gap-1.5">
          <FaCamera size={10} />
          {block.title ?? t('magazineFigure')}
          {typeof block.timestamp === 'number' && Number.isFinite(block.timestamp)
            ? ` · ${formatTimestamp(block.timestamp)}`
            : ''}
        </figcaption>
      )}
    </figure>
  );
}

function StructuredBlock({ block }: { block: ContentBlock }) {
  const { t } = useI18n();
  switch (block.kind) {
    case 'heading':
    case 'title':
    case 'subtitle':
      return <h3 className="text-base font-bold text-white/95 mt-5 mb-1">{block.text ?? block.title}</h3>;
    case 'ingredients':
    case 'list':
    case 'items':
    case 'bullets':
    case 'materials': {
      const items = (block.items ?? []).map(itemText).filter(Boolean);
      if (items.length === 0) return null;
      return (
        <div className="my-3">
          {block.title && (
            <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-white/45 mb-2">{block.title}</h4>
          )}
          <ul className="rounded-2xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.06] overflow-hidden">
            {items.map((item, index) => (
              <li key={index} className="px-4 py-2.5 text-[13px] text-white/80 leading-relaxed flex gap-2.5">
                <span className="text-white/30 shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case 'steps':
    case 'instructions':
    case 'procedure': {
      const steps = block.steps ?? block.items ?? [];
      if (steps.length === 0) return null;
      return (
        <div className="my-3">
          {block.title && (
            <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-white/45 mb-2">{block.title}</h4>
          )}
          <ol className="flex flex-col gap-2">
            {steps.map((step, index) => {
              const text = itemText(step) || t('magazineStepFallback', { index: index + 1 });
              const time = itemTime(step);
              return (
                <li
                  key={index}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 flex gap-3"
                >
                  <span className="shrink-0 w-6 h-6 rounded-full bg-white/10 text-white/80 text-[11px] font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <p className="text-[13px] text-white/80 leading-relaxed">{text}</p>
                    {time && (
                      <span className="text-[11px] text-sky-300/70 font-mono flex items-center gap-1">
                        <FaClock size={10} />
                        {time}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      );
    }
    case 'code':
    case 'snippet':
    case 'command': {
      const code = block.code ?? block.text;
      if (!code) return null;
      return (
        <div className="my-3 rounded-xl border border-white/[0.08] bg-black/50 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-white/[0.07] text-[10px] font-mono text-white/40 flex items-center gap-1.5">
            <FaCode size={10} />
            {block.language ?? block.title ?? t('magazineCode')}
          </div>
          <pre className="p-3 text-xs text-white/80 font-mono overflow-x-auto custom-scrollbar">{code}</pre>
        </div>
      );
    }
    case 'quote':
    case 'citation':
      return block.text ? (
        <blockquote className="my-3 border-l-2 border-white/25 pl-4 py-1 text-[14px] text-white/75 italic leading-relaxed">
          “{block.text}”
        </blockquote>
      ) : null;
    case 'warning':
    case 'callout':
    case 'note':
    case 'tip':
      return block.text ? (
        <div className="my-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 flex gap-2.5">
          <FaTriangleExclamation size={14} className="text-amber-300/90 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            {block.title && <span className="text-xs font-bold text-amber-200/90">{block.title}</span>}
            <p className="text-[13px] text-white/75 leading-relaxed">{block.text}</p>
          </div>
        </div>
      ) : null;
    case 'data':
    case 'facts':
    case 'table':
    case 'metadata': {
      const rows = block.rows ?? block.items ?? [];
      const entries = rows.length > 0
        ? rows.map(itemText).filter(Boolean)
        : [block.text ?? ''].filter(Boolean);
      if (entries.length === 0 && !block.title) return null;
      return (
        <div className="my-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          {block.title && !block.text && (
            <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-white/45 mb-1.5">{block.title}</h4>
          )}
          {block.title && block.text && (
            <p className="text-[13px] text-white/80">
              <span className="text-white/45">{block.title}: </span>
              {block.text}
            </p>
          )}
          {entries.length > 0 && (!block.title || rows.length > 0) && (
            <ul className="flex flex-col gap-1">
              {entries.map((entry, index) => (
                <li key={index} className="text-[13px] text-white/80 leading-relaxed">
                  {entry}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case 'figure':
    case 'image':
    case 'keyframe':
    case 'photo':
      return <BlockFigure block={block} />;
    case 'text':
    case 'intro':
    case 'paragraph':
    case 'body':
      return block.text ? (
        <p className="text-[14px] text-white/80 leading-[1.75] my-2">{block.text}</p>
      ) : null;
    default:
      return null;
  }
}

/* ---------------- Timestamps accionables ---------------- */

function TimestampButton({
  value,
  onSeek,
  title,
}: {
  value: number | null | undefined;
  onSeek: () => void;
  title: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return (
    <button
      type="button"
      onClick={onSeek}
      title={title}
      className="font-mono text-sky-300/90 hover:text-sky-200 bg-sky-400/10 hover:bg-sky-400/20 border border-sky-400/20 rounded px-1.5 py-0.5 text-[11px] transition-all"
    >
      {formatTimestamp(value)}
    </button>
  );
}

/* ---------------- Reader ---------------- */

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function MagazineReader({ volume, articleId, initialTarget, onBack }: MagazineReaderProps) {
  const [details, setDetails] = useState<MagazineArticleDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { t, locale } = useI18n();
  const [inspectorEvidence, setInspectorEvidence] = useState<MagazineEvidenceRecord | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(initialTarget?.evidenceId ?? null);
  const recipeLabels = useMemo<MagazineRecipeLabels>(
    () => ({
      yieldTitle: t('magazineYield'),
      ingredientsTitle: t('magazineIngredients'),
      stepsTitle: t('magazineSteps'),
    }),
    [t],
  );

  useEffect(() => {
    let live = true;
    setIsLoading(true);
    setLoadError(null);
    setDetails(null);
    setInspectorEvidence(null);
    fetchMagazineArticleDetails(articleId)
      .then((loaded) => {
        if (live) setDetails(loaded);
      })
      .catch((error: unknown) => {
        if (live) setLoadError(error instanceof Error ? error.message : t('magazineLoadError'));
      })
      .finally(() => {
        if (live) setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [articleId, t]);

  useEffect(() => {
    if (highlightId !== null && details) {
      const timer = window.setTimeout(() => scrollToId(`evidence-${highlightId}`), 350);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [highlightId, details]);

  const evidenceById = useMemo(() => {
    const map = new Map<number, MagazineEvidenceRecord>();
    details?.evidence.forEach((item) => map.set(item.id, item));
    return map;
  }, [details]);

  const openEvidence = (evidence: MagazineEvidenceRecord) => {
    setInspectorEvidence(evidence);
    setHighlightId(evidence.id);
    window.setTimeout(() => scrollToId('source-inspector'), 80);
  };

  const parsedContent = useMemo(
    () => (details ? parseStructuredContent(details.article.structured_content_json, recipeLabels) : null),
    [details, recipeLabels],
  );

  return (
    <div className="w-full flex flex-col gap-5 max-w-3xl mx-auto pb-10">
      {/* Navegación: Artículo ← Tomo ← Librero */}
      <button
        type="button"
        onClick={onBack}
        className="self-start flex items-center gap-2 text-xs text-white/55 hover:text-white transition-all"
      >
        <FaArrowLeft size={12} />
        <span>
          {volume.volumeNumber} · {volume.title}
        </span>
      </button>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <div className="h-9 w-2/3 rounded-xl bg-white/[0.05] animate-pulse" />
          <div className="h-4 w-full rounded-lg bg-white/[0.03] animate-pulse" />
          <div className="h-40 rounded-2xl bg-white/[0.03] animate-pulse" />
        </div>
      ) : loadError || !details ? (
        <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center flex flex-col items-center gap-2">
          <FaFileLines size={22} className="text-white/25" />
          <p className="text-sm text-white/75 font-medium">{t('magazineOpenError')}</p>
          <p className="text-xs text-white/45">{loadError ?? t('magazineNoData')}</p>
        </div>
      ) : (
        <>
          {/* Estados editoriales (§16): published lee normal; el resto se declara */}
          {details.article.editorial_state === 'requires_review' && (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 flex items-start gap-2.5">
              <FaTriangleExclamation size={15} className="text-amber-300 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <p className="text-xs text-amber-100/90 font-semibold">
                  {t('magazinePendingReview')}
                </p>
                <button
                  type="button"
                  onClick={() => scrollToId('reader-conflicts')}
                  className="self-start text-[11px] text-amber-200/80 hover:text-amber-100 underline underline-offset-2"
                >
                  {details.conflicts.length === 1 ? t('magazineViewConflictOne') : t('magazineViewConflictMany', { count: details.conflicts.length })}
                </button>
              </div>
            </div>
          )}
          {(details.article.editorial_state === 'processing'
            || details.article.editorial_state === 'updating') && (
            <div className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] px-4 py-3 text-xs text-sky-100/90">
              {t('magazineUpdating')}
            </div>
          )}
          {details.article.editorial_state === 'failed' && (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-100/90">
              {t('magazineFailed')}
            </div>
          )}
          {(details.article.editorial_state === 'draft'
            || details.article.editorial_state === 'archived') && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/55">
              {t('magazineUnpublished', { state: presentEditorialState(details.article.editorial_state, locale) })}
            </div>
          )}

          {/* Cabecera editorial */}
          <header className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white/70">
                {presentArticleType(details.article.article_type, locale)}
              </span>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-white/55">
                {presentEditorialState(details.article.editorial_state, locale)} · v{details.article.active_version}
              </span>
            </div>
            <h1 className="text-2xl md:text-[28px] font-extrabold text-white tracking-tight leading-tight">
              {details.article.title}
            </h1>
            <p className="text-[14px] text-white/60 leading-relaxed">{details.article.summary}</p>
            <p className="text-[11px] text-white/35 font-mono">
              {details.evidence.length === 1 ? t('magazineEvidenceOne', { count: 1 }) : t('magazineEvidenceMany', { count: details.evidence.length })} ·{' '}
              {details.sources.length === 1 ? t('magazineSourceOne', { count: 1 }) : t('magazineSourceMany', { count: details.sources.length })} ·{' '}
              {details.versions.length === 1 ? t('magazineVersionOne', { count: 1 }) : t('magazineVersionMany', { count: details.versions.length })}
            </p>
          </header>

          <div className="h-px bg-white/[0.08]" />

          {/* Contenido estructurado */}
          <section aria-label={t('magazineContent')} className="flex flex-col">
            {parsedContent && parsedContent.blocks.length > 0 ? (
              parsedContent.blocks.map((block, index) => <StructuredBlock key={index} block={block} />)
            ) : (
              <details className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                <summary className="text-xs text-white/60 cursor-pointer">
                  {t('magazineRawFallback')}
                </summary>
                <pre className="mt-2 text-[11px] text-white/55 font-mono overflow-x-auto custom-scrollbar whitespace-pre-wrap break-words">
                  {parsedContent?.rawFallback ?? details.article.structured_content_json}
                </pre>
              </details>
            )}
          </section>

          <div className="h-px bg-white/[0.08]" />

          {/* Evidencia: capa de confianza */}
          <section aria-label={t('magazineEvidence')} className="flex flex-col gap-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-white/40">
              {t('magazineEvidence')} · {details.evidence.length}
            </h2>
            {details.evidence.length === 0 ? (
              <p className="text-xs text-white/45">
                {t('magazineEvidenceEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {details.evidence.map((item) => {
                  const highlighted = highlightId === item.id;
                  return (
                    <li
                      key={item.id}
                      id={`evidence-${item.id}`}
                      className={`rounded-2xl border p-4 flex flex-col gap-2 transition-all scroll-mt-6 ${
                        highlighted
                          ? 'border-sky-400/40 bg-sky-400/[0.05]'
                          : 'border-white/[0.08] bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/45">
                          {presentEvidenceKind(item.evidence_kind, locale)} · #{item.id}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <TimestampButton
                            value={item.timestamp_start}
                            onSeek={() => openEvidence(item)}
                            title={t('magazineOpenAtTimestamp')}
                          />
                          {item.timestamp_end !== null
                            && Number.isFinite(item.timestamp_end)
                            && item.timestamp_end !== item.timestamp_start && (
                              <>
                                <span className="text-white/25 text-[11px]">—</span>
                                <TimestampButton
                                  value={item.timestamp_end}
                                  onSeek={() => openEvidence(item)}
                                  title={t('magazineOpenAtTimestamp')}
                                />
                              </>
                            )}
                        </span>
                      </div>
                      {item.transcript_text && (
                        <p className="text-[13px] text-white/75 italic leading-relaxed">
                          “{item.transcript_text}”
                        </p>
                      )}
                      {item.extracted_fact && (
                        <p className="text-[13px] text-white/85 leading-relaxed">
                          <span className="text-white/40">{t('magazineFact')}: </span>
                          {item.extracted_fact}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] text-white/35 font-mono">
                          {t('magazineJobMeta', { id: item.job_id, pct: Math.round(item.confidence * 100) })}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEvidence(item)}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/15 border border-white/10 text-white/75 hover:text-white text-[11px] font-semibold flex items-center gap-1.5 transition-all"
                        >
                          <FaEye size={11} />
                          {t('magazineViewSource')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Inspector de fuente (en flujo, sin modal anidado) */}
          {inspectorEvidence && (
            <div id="source-inspector" className="scroll-mt-6">
              <EvidenceSourceInspector
                articleId={details.article.id}
                evidence={evidenceById.get(inspectorEvidence.id) ?? inspectorEvidence}
                sources={details.sources}
                onClose={() => setInspectorEvidence(null)}
              />
            </div>
          )}

          {/* Fuentes */}
          <section aria-label={t('magazineSources')} className="flex flex-col gap-2.5">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-white/40">
              {t('magazineSources')} · {details.sources.length}
            </h2>
            {details.sources.length === 0 ? (
              <p className="text-xs text-white/45">{t('magazineNoSources')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {details.sources.map((source) => {
                  const linked = details.evidence.filter((item) => item.source_id === source.id);
                  const first = linked[0] ?? details.evidence.find((item) => item.job_id === source.job_id);
                  return (
                    <li
                      key={source.id}
                      className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] text-white/85 font-medium">
                          {t('magazineOriginalVideo')} · job {source.job_id}
                        </span>
                        <span className="text-[11px] text-white/40 font-mono">
                          {source.source_role}
                          {source.citation_label ? ` · ${source.citation_label}` : ''} ·{' '}
                          {linked.length === 1 ? t('magazineEvidenceOne', { count: 1 }) : t('magazineEvidenceMany', { count: linked.length })}
                        </span>
                      </div>
                      {first && (
                        <button
                          type="button"
                          onClick={() => openEvidence(evidenceById.get(first.id) ?? first)}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/15 border border-white/10 text-white/75 hover:text-white text-[11px] font-semibold flex items-center gap-1.5 transition-all"
                        >
                          <FaEye size={11} />
                          {t('magazineOpenMedia')}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Conflictos: nunca presentar lo disputado como verdad */}
          {details.conflicts.length > 0 && (
            <section id="reader-conflicts" aria-label={t('magazineConflicts')} className="flex flex-col gap-2.5 scroll-mt-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200/60 flex items-center gap-1.5">
                <FaTriangleExclamation size={12} />
                {t('magazineUnderReview')} · {details.conflicts.length}
              </h2>
              <ul className="flex flex-col gap-2">
                {details.conflicts.map((conflict) => (
                  <li
                    key={conflict.id}
                    className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-4 py-3 flex flex-col gap-1.5"
                  >
                    <span className="text-[11px] font-mono text-amber-200/70">{conflict.fact_key}</span>
                    <p className="text-[13px] text-white/75 leading-relaxed">{conflict.description}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-white/40">
                          {t('magazineState')}: {conflict.resolution_state}
                        {conflict.resolution_notes ? ` · ${conflict.resolution_notes}` : ''}
                      </span>
                      <span className="flex gap-1.5 ml-auto">
                        {(['A', 'B'] as const).map((side) => {
                          const evidenceId = side === 'A' ? conflict.evidence_a_id : conflict.evidence_b_id;
                          const target = evidenceById.get(evidenceId);
                          if (!target) return null;
                          return (
                            <button
                              key={side}
                              type="button"
                              onClick={() => openEvidence(target)}
                              className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-white/65 hover:text-white text-[11px] font-mono transition-all"
                              title={t('magazineOpenEvidenceSide')}
                            >
                              {t('magazineViewSide', { side })}
                            </button>
                          );
                        })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Versiones */}
          <section aria-label={t('magazineVersions')} className="flex flex-col gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-white/40">
              {t('magazineVersionsActive', { version: details.article.active_version })}
            </h2>
            <details className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
              <summary className="text-xs text-white/60 cursor-pointer">
                {details.versions.length === 1 ? t('magazineHistoryOne', { count: 1 }) : t('magazineHistoryMany', { count: details.versions.length })}
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {details.versions.map((version) => (
                  <li key={version.id} className="text-[11px] text-white/50 leading-relaxed">
                    <span className="font-mono text-white/65">v{version.version_number}</span>
                    {' · '}
                    {version.title}
                    {version.change_summary ? ` — ${version.change_summary}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
