'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EvidenceSourceInspector } from '@/components/EvidenceSourceInspector';
import { useI18n } from '@/lib/i18n';
import {
  fetchMagazineArticleDetails,
  formatTimestamp,
  presentArticleType,
  presentEditorialState,
  presentEvidenceKind,
  type MagazineArticleDetails,
  type MagazineEvidenceRecord,
  type MagazineEvidenceTarget,
  type MagazineVolumeView,
} from '@/lib/magazines';
import {
  coverArtSVG,
  flipMax,
  flipStep,
  hashSeed,
  KIOSCO_FLIP_MS,
  paginateBlocks,
  softArtSVG,
  timeAgo,
  type KioscoBlock,
} from '@/lib/kiosco';
import styles from '@/components/KioscoMagazine.module.css';

/**
 * KioscoReader — lector con page-flip sobre datos reales.
 *
 * Lógica portada de la referencia Kiosco Vivo: spread doble/simple
 * responsive, hoja con giro 3D (`rotateY`), animación de apertura desde
 * portada y de cierre, navegación por teclado/táctil, control de tamaño
 * de texto, contador y etiqueta "actualizada hace…".
 *
 * Las páginas se construyen con el artículo real (contenido estructurado
 * paginado, evidencia, fuentes, conflictos, versiones). Sin contenido
 * inventado: vacíos y errores son estados explícitos.
 */

interface KioscoReaderProps {
  volume: MagazineVolumeView;
  articleId: string;
  initialTarget?: MagazineEvidenceTarget | null;
  onBack: () => void;
}

type PageKind =
  | 'cover'
  | 'index'
  | 'content'
  | 'evidence'
  | 'sources'
  | 'conflicts'
  | 'versions'
  | 'colophon';

interface KioscoPage {
  kind: PageKind;
  section: string;
  blocks?: KioscoBlock[];
  evidenceStart?: number;
  first?: boolean;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function normalizeBlock(value: unknown): KioscoBlock | null {
  if (typeof value === 'string') {
    return value.trim() ? { kind: 'text', text: value } : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const kind = (asString(record.kind) ?? asString(record.type) ?? 'text').toLowerCase();
  const block: KioscoBlock = { kind };
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

export interface KioscoRecipeLabels {
  ingredientsTitle: string;
  stepsTitle: string;
}

function parseBlocks(raw: string, labels: KioscoRecipeLabels): KioscoBlock[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return raw.trim() ? [{ kind: 'text', text: raw }] : [];
  }
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => normalizeBlock(item))
      .filter((block): block is KioscoBlock => block !== null);
  }
  const root = asRecord(parsed);
  if (!root) return [];
  if (Array.isArray(root.blocks)) {
    return (root.blocks as unknown[])
      .map((item) => normalizeBlock(item))
      .filter((block): block is KioscoBlock => block !== null);
  }
  const blocks: KioscoBlock[] = [];
  const recipeLabels = labels;
  if (Array.isArray(root.ingredients)) {
    blocks.push({ kind: 'ingredients', title: recipeLabels.ingredientsTitle, items: root.ingredients as unknown[] });
  }
  if (Array.isArray(root.steps)) {
    blocks.push({ kind: 'steps', title: recipeLabels.stepsTitle, steps: root.steps as unknown[] });
  }
  for (const [key, entry] of Object.entries(root)) {
    if (['yield', 'servings', 'ingredients', 'steps'].includes(key)) continue;
    const block = normalizeBlock(entry);
    if (block) {
      if (!block.title) block.title = key;
      blocks.push(block);
    }
  }
  return blocks;
}

function BlockView({ block }: { block: KioscoBlock }) {
  const { t } = useI18n();
  switch (block.kind) {
    case 'heading':
    case 'title':
    case 'subtitle':
      return <h3 className={styles.hl} style={{ fontSize: '1.4em' }}>{block.text ?? block.title}</h3>;
    case 'ingredients':
    case 'list':
    case 'items':
    case 'bullets':
    case 'materials': {
      const items = (block.items ?? []).map(itemText).filter(Boolean);
      if (items.length === 0) return null;
      return (
        <div>
          {block.title && <p className={styles.ki}>{block.title}</p>}
          <div className={styles.toc}>
            {items.map((item, index) => (
              <div key={index}><b>{pad(index + 1)}</b><i>{item}</i></div>
            ))}
          </div>
        </div>
      );
    }
    case 'steps':
    case 'instructions':
    case 'procedure': {
      const steps = block.steps ?? block.items ?? [];
      if (steps.length === 0) return null;
      return (
        <div>
          {block.title && <p className={styles.ki}>{block.title}</p>}
          <div className={styles.body}>
            {steps.map((step, index) => (
              <p key={index}><strong>{index + 1}. </strong>{itemText(step) || t('magazineStepFallback', { index: index + 1 })}</p>
            ))}
          </div>
        </div>
      );
    }
    case 'code':
    case 'snippet':
    case 'command': {
      const code = block.code ?? block.text;
      if (!code) return null;
      return (
        <div>
          <p className={styles.ki}>{block.language ?? block.title ?? t('magazineCode')}</p>
          <pre className={styles.body} style={{ whiteSpace: 'pre-wrap', fontSize: '0.8em' }}>{code}</pre>
        </div>
      );
    }
    case 'quote':
    case 'citation':
      return block.text ? (
        <blockquote className={styles.pq}>{block.text}</blockquote>
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
        <div>
          {block.title && <p className={styles.ki}>{block.title}</p>}
          {block.text && <p className={styles.body}>{block.text}</p>}
          {entries.length > 0 && block.title && (
            <div className={styles.body}>
              {entries.map((entry, index) => (
                <p key={index}>{entry}</p>
              ))}
            </div>
          )}
        </div>
      );
    }
    default:
      return block.text ? <div className={styles.body}><p>{block.text}</p></div> : null;
  }
}

export function KioscoReader({ volume, articleId, initialTarget, onBack }: KioscoReaderProps) {
  const { t, locale } = useI18n();
  const [details, setDetails] = useState<MagazineArticleDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(true);
  const [single, setSingle] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [inspectorEvidence, setInspectorEvidence] = useState<MagazineEvidenceRecord | null>(null);
  const [liveLabel, setLiveLabel] = useState('');
  const [leaf, setLeaf] = useState<{ front: number; back: number } | null>(null);
  const [turning, setTurning] = useState(false);
  const [bumpKey, setBumpKey] = useState(0);

  const leafRef = useRef<HTMLDivElement | null>(null);
  const touchXRef = useRef<number | null>(null);
  const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idxRef = useRef(0);
  const busyRef = useRef(true);
  const singleRef = useRef(false);
  const pagesRef = useRef<KioscoPage[]>([]);
  const closingRef = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const seed = useMemo(() => hashSeed(articleId), [articleId]);
  const hue = useMemo(() => seed % 360, [seed]);
  const recipeLabels = useMemo<KioscoRecipeLabels>(
    () => ({
      ingredientsTitle: t('magazineIngredients'),
      stepsTitle: t('magazineSteps'),
    }),
    [t],
  );
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const flipMs = reducedMotion ? 1 : KIOSCO_FLIP_MS;

  idxRef.current = idx;
  busyRef.current = busy;
  singleRef.current = single;

  /* Carga real del artículo (una llamada IPC agregada). */
  useEffect(() => {
    let live = true;
    setIsLoading(true);
    setLoadError(null);
    setDetails(null);
    setIdx(0);
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

  /* Páginas desde el contenido real. */
  const pages = useMemo<KioscoPage[]>(() => {
    if (!details) return [];
    const sectionLabel = (kind: PageKind): string => {
      switch (kind) {
        case 'cover':
          return t('kioscoSectionCover');
        case 'index':
          return t('kioscoIndex');
        case 'content':
          return details.article.title;
        case 'evidence':
          return t('magazineEvidence');
        case 'sources':
          return t('magazineSources');
        case 'conflicts':
          return t('magazineConflicts');
        case 'versions':
          return t('magazineVersions');
        case 'colophon':
          return t('kioscoColophon');
      }
    };
    const list: KioscoPage[] = [{ kind: 'cover', section: sectionLabel('cover') }];
    const blocks = parseBlocks(details.article.structured_content_json, recipeLabels);
    const contentPages = paginateBlocks(blocks);
    list.push({ kind: 'index', section: sectionLabel('index') });
    contentPages.forEach((group, groupIndex) => {
      list.push({ kind: 'content', section: details.article.title, blocks: group, first: groupIndex === 0 });
    });
    if (details.evidence.length > 0) {
      for (let start = 0; start < details.evidence.length; start += 2) {
        list.push({ kind: 'evidence', section: sectionLabel('evidence'), evidenceStart: start });
      }
    }
    list.push({ kind: 'sources', section: sectionLabel('sources') });
    if (details.conflicts.length > 0) list.push({ kind: 'conflicts', section: sectionLabel('conflicts') });
    if (details.versions.length > 1) list.push({ kind: 'versions', section: sectionLabel('versions') });
    list.push({ kind: 'colophon', section: sectionLabel('colophon') });
    return list;
  }, [details, recipeLabels, t]);
  pagesRef.current = pages;

  const step = flipStep(single);
  const maxIndex = flipMax(pages.length, single);

  /* Salto inicial a la evidencia enlazada. */
  useEffect(() => {
    if (!details || !initialTarget || pages.length === 0) return;
    const evIndex = details.evidence.findIndex((item) => item.id === initialTarget.evidenceId);
    if (evIndex < 0) return;
    const contentCount = pages.filter((page) => page.kind === 'content').length;
    const pageIndex = 2 + contentCount + Math.floor(evIndex / 2);
    if (pageIndex < pages.length) {
      const target = single ? pageIndex : Math.min(pageIndex - (pageIndex % 2 === 0 ? 0 : 1), Math.max(0, pages.length - 2));
      setIdx(clamp(target, 0, Math.max(0, pages.length - 1)));
    }
  }, [details, initialTarget, pages, single]);

  /* Responsive simple/doble. */
  useEffect(() => {
    const query = () => setSingle(window.innerWidth < 760);
    query();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      query();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setIdx((current) => clamp(current, 0, flipMax(pagesRef.current.length, window.innerWidth < 760)));
      }, 170);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (timer) clearTimeout(timer);
    };
  }, []);

  /* Etiqueta viva desde updated_at real. */
  useEffect(() => {
    if (!details) return;
    const update = () => setLiveLabel(`${t('kioscoUpdated')} ${timeAgo(details.article.updated_at, locale)}`);
    update();
    const timer = window.setInterval(update, 15000);
    return () => window.clearInterval(timer);
  }, [details, locale, t]);

  /* Animación de apertura: la portada gira y revela la página 0. */
  useEffect(() => {
    if (!details || pages.length === 0) return;
    setBusy(true);
    setIdx(0);
    const openTimer = window.setTimeout(() => {
      setLeaf({ front: -1, back: 0 });
      setTurning(true);
      requestAnimationFrame(() => {
        if (leafRef.current) leafRef.current.style.transform = 'rotateY(-180deg)';
      });
      window.setTimeout(() => {
        setLeaf(null);
        setTurning(false);
        setBusy(false);
      }, flipMs + 40);
    }, 60);
    return () => window.clearTimeout(openTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details !== null, pages.length]);

  const finalizeFlip = useCallback((target: number) => {
    window.setTimeout(() => {
      setIdx(target);
      setLeaf(null);
      setTurning(false);
      setBusy(false);
      if (leafRef.current) leafRef.current.style.transform = 'rotateY(0deg)';
    }, flipMs + 30);
  }, [flipMs]);

  const flip = useCallback((direction: -1 | 1) => {
    const current = idxRef.current;
    const isSingle = singleRef.current;
    const total = pagesRef.current.length;
    if (busyRef.current || closingRef.current || total === 0) return;
    const target = current + direction * flipStep(isSingle);
    if (target < 0 || target > flipMax(total, isSingle)) {
      // Rebote de borde sin remontar el spread.
      setBumpKey(1);
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
      bumpTimerRef.current = setTimeout(() => setBumpKey(0), 420);
      return;
    }
    setBusy(true);
    setTurning(true);
    const leafNode = leafRef.current;
    if (direction > 0) {
      setLeaf({ front: isSingle ? current : current + 1, back: target });
      if (leafNode) {
        leafNode.style.transition = 'none';
        leafNode.style.transform = 'rotateY(0deg)';
        void leafNode.offsetWidth;
        leafNode.style.transition = '';
      }
      requestAnimationFrame(() => {
        if (leafRef.current) leafRef.current.style.transform = 'rotateY(-180deg)';
      });
    } else {
      setLeaf({ front: target, back: current });
      if (leafNode) {
        leafNode.style.transition = 'none';
        leafNode.style.transform = 'rotateY(-180deg)';
        void leafNode.offsetWidth;
        leafNode.style.transition = '';
      }
      requestAnimationFrame(() => {
        if (leafRef.current) leafRef.current.style.transform = 'rotateY(0deg)';
      });
    }
    finalizeFlip(target);
  }, [finalizeFlip]);

  const closeReader = useCallback(() => {
    if (busyRef.current || closingRef.current) return;
    closingRef.current = true;
    setBusy(true);
    setTurning(true);
    setLeaf({ front: -1, back: idxRef.current });
    const leafNode = leafRef.current;
    if (leafNode) {
      leafNode.style.transition = 'none';
      leafNode.style.transform = 'rotateY(-180deg)';
      void leafNode.offsetWidth;
      leafNode.style.transition = '';
    }
    requestAnimationFrame(() => {
      if (leafRef.current) leafRef.current.style.transform = 'rotateY(0deg)';
    });
    window.setTimeout(() => onBackRef.current(), flipMs + 90);
  }, [flipMs]);

  /* Teclado: flechas + Escape. */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {      if (inspectorEvidence) {
        if (event.key === 'Escape') setInspectorEvidence(null);
        return;
      }
      if (event.key === 'Escape') closeReader();
      else if (event.key === 'ArrowRight') {
        event.preventDefault();
        flip(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        flip(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
    };
  }, [flip, closeReader, inspectorEvidence]);

  const renderPage = useCallback((pageIndex: number): React.ReactNode => {
    const page = pagesRef.current[pageIndex];
    if (!details) return null;
    if (pageIndex === -1 || page?.kind === 'cover') {
      return (
        <div className={styles.coverface}>
          <div className={styles.cvBg} style={{ background: `linear-gradient(168deg, hsl(${hue} 34% 22%), hsl(${hue} 26% 12%) 62%, hsl(${hue} 30% 16%))` }} />
          <div className={styles.cvArt} style={{ opacity: 0.62 }} dangerouslySetInnerHTML={{ __html: coverArtSVG(seed, hue) }} />
          <div className={styles.cvVeil} />
          <div className={styles.cvTop}>
            <span className={styles.cvLive}><i />{t('kioscoCoverLive')}</span>
            <span className={styles.cvCode}>{volume.volumeNumber}</span>
          </div>
          <div className={styles.cvMast}>
            <b>{details.article.title}</b>
            <span>{presentArticleType(details.article.article_type, locale)}</span>
          </div>
          <div className={styles.cvBot}>
            <div className={styles.cvRow}>
              <span>{volume.title}</span>
              <span>v{details.article.active_version}</span>
            </div>
            <div className={styles.bar}><i style={{ width: '100%' }} /></div>
          </div>
          <div className={styles.foil} aria-hidden="true" />
        </div>
      );
    }
    if (!page) return null;
    const shell = (inner: React.ReactNode) => (
      <div className={styles.pgIn}>
        <header className={styles.pf}>{volume.title} · {volume.volumeNumber}</header>
        <div className={`${styles.pb}${page.first ? ` ${styles.dropcap}` : ''}`}>{inner}</div>
        <footer className={styles.pft}>
          <span>{page.section}</span>
          <span className={styles.num}>{pad(pageIndex + 1)}</span>
        </footer>
      </div>
    );
    switch (page.kind) {
      case 'index': {
        const contentCount = pagesRef.current.filter((p) => p.kind === 'content').length;
        const rows: Array<[string, string, string]> = [
          [t('magazineContent'), details.article.title, t('kioscoPages', { count: contentCount })],
          [t('magazineEvidence'), t('kioscoTraceablePieces', { count: details.evidence.length }), `${details.evidence.length}`],
          [t('magazineSources'), t('kioscoLinked', { count: details.sources.length }), `${details.sources.length}`],
          [t('magazineConflicts'), details.conflicts.length > 0 ? t('kioscoToResolveCount', { count: details.conflicts.length }) : t('kioscoNone'), `${details.conflicts.length}`],
          [t('magazineVersions'), t('kioscoActiveVersion', { version: details.article.active_version }), `${details.versions.length}`],
        ];
        return shell(
          <>
            <p className={styles.ki}>{t('kioscoIndex')}</p>
            <h2 className={styles.hl}>{t('kioscoInArticle')}</h2>
            <div className={styles.toc}>
              {rows.map(([label, text, count]) => (
                <div key={label}><b>{count}</b><i>{text}</i><em>{label}</em></div>
              ))}
            </div>
          </>,
        );
      }
      case 'content':
        return shell(
          <>
            {(page.blocks ?? []).map((block, index) => (
              <BlockView key={index} block={block} />
            ))}
            {(page.blocks ?? []).length === 0 && (
              <p className={styles.body}>{t('kioscoEmptyPage')}</p>
            )}
          </>,
        );
      case 'evidence': {
        const items = details.evidence.slice(page.evidenceStart ?? 0, (page.evidenceStart ?? 0) + 2);
        return shell(
          <>
            <p className={styles.ki}>{t('kioscoTraceable')}</p>
            <h2 className={styles.hl} style={{ fontSize: '1.5em' }}>{t('kioscoSustains')}</h2>
            {items.map((item) => (
              <div key={item.id} className={styles.evCard}>
                {item.transcript_text && <q>{item.transcript_text}</q>}
                {item.extracted_fact && <p>{item.extracted_fact}</p>}
                <div className={styles.evMeta}>
                  <span>{presentEvidenceKind(item.evidence_kind, locale)}</span>
                  {(item.timestamp_start !== null && item.timestamp_start !== undefined) && (
                    <span>{formatTimestamp(item.timestamp_start)}</span>
                  )}
                  <span>{Math.round(item.confidence * 100)}%</span>
                  <button type="button" className={styles.evBtn} onClick={() => setInspectorEvidence(item)}>
                    {t('magazineViewSource')}
                  </button>
                </div>
              </div>
            ))}
          </>,
        );
      }
      case 'sources':
        return shell(
          <>
            <p className={styles.ki}>{t('magazineSources')}</p>
            <h2 className={styles.hl} style={{ fontSize: '1.5em' }}>{t('kioscoSourceVideos')}</h2>
            {details.sources.length === 0 ? (
              <p className={styles.body}>{t('magazineNoSources')}</p>
            ) : (
              <div className={styles.toc}>
                {details.sources.map((source) => (
                  <div key={source.id}>
                    <b>#{source.job_id}</b>
                    <i>{source.citation_label ?? source.source_role}</i>
                    <em>{source.source_role}</em>
                  </div>
                ))}
              </div>
            )}
          </>,
        );
      case 'conflicts':
        return shell(
          <>
            <p className={styles.ki}>{t('magazineConflicts')}</p>
            <h2 className={styles.hl} style={{ fontSize: '1.5em' }}>{t('kioscoToResolve')}</h2>
            <div className={styles.body}>
              {details.conflicts.map((conflict) => (
                <p key={conflict.id}>
                  <strong>{conflict.fact_key}:</strong> {conflict.description} ({conflict.resolution_state})
                </p>
              ))}
            </div>
          </>,
        );
      case 'versions':
        return shell(
          <>
            <p className={styles.ki}>{t('magazineVersions')}</p>
            <h2 className={styles.hl} style={{ fontSize: '1.5em' }}>{t('kioscoHistory')}</h2>
            <div className={styles.toc}>
              {details.versions.map((version) => (
                <div key={version.id}>
                  <b>v{version.version_number}</b>
                  <i>{version.change_summary ?? version.title}</i>
                  <em>{timeAgo(version.created_at, locale)}</em>
                </div>
              ))}
            </div>
          </>,
        );
      case 'colophon':
      default:
        return shell(
          <>
            <p className={styles.ki}>{t('kioscoColophon')}</p>
            <div className={styles.body}>
              <p>{t('kioscoColophonP1')}</p>
              <p>{t('kioscoColophonP2')}</p>
            </div>
            <div className={styles.rule} />
            <p className={styles.credit} style={{ textAlign: 'center' }}>
              {volume.volumeNumber} · v{details.article.active_version} · {presentEditorialState(details.article.editorial_state, locale)}
            </p>
            <figure style={{ margin: '1em 0 0', height: '7em', overflow: 'hidden', borderRadius: 2 }} aria-hidden="true">
              <span dangerouslySetInnerHTML={{ __html: softArtSVG(seed + 7, hue) }} style={{ display: 'block', height: '100%' }} />
            </figure>
          </>,
        );
    }
  }, [details, hue, seed, volume, t, locale]);

  const total = pages.length;
  const counter = total === 0
    ? '—'
    : single
      ? pad(idx + 1)
      : `${pad(idx + 1)}–${pad(Math.min(idx + 2, total))}`;
  const progressPct = total <= 1 ? 100 : Math.round(((idx + step) / total) * 100);

  if (isLoading) {
    return (
      <div className={styles.reader} aria-label={t('kioscoLoadingArticle')}>
        <div className={styles.stage}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 620, width: '100%', margin: '0 auto' }}>
            <div style={{ height: 36, borderRadius: 10 }} className={styles.shimmer} />
            <div style={{ height: 402, borderRadius: 8 }} className={styles.shimmer} />
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !details) {
    return (
      <div className={styles.reader}>
        <div className={styles.stage}>
          <div className={styles.topbar}>
            <b>{volume.title}</b>
            <span className={styles.sp} />
            <button type="button" className={styles.xbtn} onClick={onBack} aria-label={t('kioscoClose')}>×</button>
          </div>
          <p style={{ color: '#a49cb0', fontSize: 13, textAlign: 'center' }}>
            {t('magazineOpenError')} {loadError ?? t('magazineNoData')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.reader} role="dialog" aria-modal="false" aria-label={t('kioscoReaderTitle', { title: details.article.title })}>
      <div className={styles.stage}>
        <div className={styles.topbar}>
          <b>{details.article.title}</b>
          <span className={styles.sub}>{volume.volumeNumber} · {presentArticleType(details.article.article_type, locale)} · v{details.article.active_version} · {presentEditorialState(details.article.editorial_state, locale)}</span>
          <span className={styles.sp} />
          <span className={styles.livetag}><i />{liveLabel || t('kioscoUpdatedEmpty')}</span>
          <span className={styles.rctl}>
            <button type="button" onClick={() => setFontScale((v) => clamp(Math.round((v - 0.08) * 100) / 100, 0.85, 1.5))} title={t('kioscoDecreaseText')} aria-label={t('kioscoDecreaseText')}>A−</button>
            <button type="button" onClick={() => setFontScale((v) => clamp(Math.round((v + 0.08) * 100) / 100, 0.85, 1.5))} title={t('kioscoIncreaseText')} aria-label={t('kioscoIncreaseText')}>A+</button>
            <button type="button" className={styles.xbtn} onClick={closeReader} aria-label={t('kioscoCloseReader')}>×</button>
          </span>
        </div>

        <div
          className={styles.spreadwrap}
          onTouchStart={(event) => {
            touchXRef.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            if (touchXRef.current === null) return;
            const endX = event.changedTouches[0]?.clientX ?? touchXRef.current;
            const dx = endX - touchXRef.current;
            touchXRef.current = null;
            if (Math.abs(dx) > 48) flip(dx < 0 ? 1 : -1);
          }}
        >
          <div
            className={`${styles.spread}${single ? ` ${styles.single}` : ''}${bumpKey > 0 ? ` ${styles.bump}` : ''}`}
            style={{ '--kiosco-u': `${(16 * fontScale).toFixed(2)}px` } as React.CSSProperties}
          >
            <div className={`${styles.pg} ${styles.pgLeft}`}>
              {!single && (
                <div key={`l-${idx}`} className={styles.pageSwap} style={{ position: 'absolute', inset: 0 }}>
                  {renderPage(idx)}
                </div>
              )}
              <span className={styles.pgSpine} />
            </div>
            <div className={`${styles.pg} ${styles.pgRight}`}>
              <div key={`r-${single ? idx : idx + 1}`} className={styles.pageSwap} style={{ position: 'absolute', inset: 0 }}>
                {renderPage(single ? idx : idx + 1)}
              </div>
              <span className={styles.pgSpine} />
            </div>
            {leaf && (
              <div ref={leafRef} className={`${styles.leaf} ${styles.on}${turning ? ` ${styles.turning}` : ''}`} aria-hidden="true">
                <div className={`${styles.pg} ${styles.leafFront}`}>
                  {renderPage(leaf.front)}
                  <div className={styles.shade} />
                </div>
                <div className={`${styles.pg} ${styles.leafBack}`}>
                  {renderPage(leaf.back)}
                  <div className={styles.shade} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.nav}>
          <button type="button" onClick={() => flip(-1)} disabled={idx <= 0} aria-label={t('kioscoPrevPage')}>
            <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <span className={styles.ctr}><b>{counter}</b> / <span>{pad(Math.max(1, total))}</span></span>
          <button type="button" onClick={() => flip(1)} disabled={idx >= maxIndex} aria-label={t('kioscoNextPage')}>
            <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct} aria-label={t('kioscoReadingProgress')}>
          <i style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {inspectorEvidence && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(6,5,10,.9)', overflowY: 'auto', padding: 24 }}
          role="dialog"
          aria-modal="true"
          aria-label={t('kioscoEvidenceSource')}
          onClick={(event) => {
            if (event.target === event.currentTarget) setInspectorEvidence(null);
          }}
        >
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <EvidenceSourceInspector
              articleId={details.article.id}
              evidence={inspectorEvidence}
              sources={details.sources}
              onClose={() => setInspectorEvidence(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
