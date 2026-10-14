'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EvidenceSourceInspector } from '@/components/EvidenceSourceInspector';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import {
  fetchMagazineArticles,
  fetchMagazineArticleDetails,
  fetchMagazineChapters,
  formatTimestamp,
  contentItemText,
  parseStructuredBlocks,
  presentArticleType,
  presentEditorialState,
  presentEvidenceKind,
  type MagazineArticleDetails,
  type MagazineArticleRecord,
  type MagazineChapterRecord,
  type MagazineEvidenceRecord,
  type MagazineVolumeView,
  type RecipeBlockLabels,
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
  isPreview: boolean;
  onBack: () => void;
}

type PageKind =
  | 'index'
  | 'content'
  | 'evidence'
  | 'sources'
  | 'conflicts'
  | 'versions'
  | 'colophon'
  | 'status';

const MAGAZINE_CATEGORY_KEYS: Record<string, TranslationKey> = {
  recipes: 'magazineCategoryRecipes',
  tech: 'magazineCategoryTech',
  guides: 'magazineCategoryGuides',
  lifestyle: 'magazineCategoryLifestyle',
};

type VolumeIndexEntry =
  | { kind: 'chapter'; id: string; title: string }
  | { kind: 'article'; id: string; article: MagazineArticleRecord };

interface KioscoPage {
  kind: PageKind;
  section: string;
  blocks?: KioscoBlock[];
  evidenceStart?: number;
  first?: boolean;
  indexEntries?: VolumeIndexEntry[];
  status?: 'loading' | 'error';
  error?: string;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* Contenido estructurado: parser único en `@/lib/magazines` (parseStructuredBlocks). */

function BlockView({ block }: { block: KioscoBlock }) {
  const { t } = useI18n();
  switch (block.kind) {
    case 'heading':
    case 'title':
    case 'subtitle':
      return <h3 className={`${styles.hl} ${styles.hlSm}`}>{block.text ?? block.title}</h3>;
    case 'ingredients':
    case 'list':
    case 'items':
    case 'bullets':
    case 'materials': {
      const items = (block.items ?? []).map(contentItemText).filter(Boolean);
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
              <p key={index}><strong>{index + 1}. </strong>{contentItemText(step) || t('magazineStepFallback', { index: index + 1 })}</p>
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
        ? rows.map(contentItemText).filter(Boolean)
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

export function KioscoReader({ volume, isPreview, onBack }: KioscoReaderProps) {
  const { t, locale } = useI18n();
  const [articles, setArticles] = useState<MagazineArticleRecord[]>([]);
  const [chapters, setChapters] = useState<MagazineChapterRecord[]>([]);
  const [isLoadingVolume, setIsLoadingVolume] = useState(true);
  const [articleListError, setArticleListError] = useState<string | null>(null);
  const [chapterListError, setChapterListError] = useState<string | null>(null);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [details, setDetails] = useState<MagazineArticleDetails | null>(null);
  const [isLoadingArticle, setIsLoadingArticle] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [articleRetry, setArticleRetry] = useState(0);
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
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const indexArticleButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const touchXRef = useRef<number | null>(null);
  const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFinishTimerRef = useRef<number | null>(null);
  const listRequestRef = useRef(0);
  const idxRef = useRef(0);
  const busyRef = useRef(true);
  const singleRef = useRef(false);
  const activeArticleIdRef = useRef<string | null>(null);
  const pagesRef = useRef<KioscoPage[]>([]);
  const closingRef = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  idxRef.current = idx;
  busyRef.current = busy;
  singleRef.current = single;
  activeArticleIdRef.current = activeArticleId;

  const seed = useMemo(() => hashSeed(volume.id), [volume.id]);
  const hue = useMemo(() => seed % 360, [seed]);
  const coverSvg = useMemo(() => coverArtSVG(seed, hue), [seed, hue]);
  const colophonSvg = useMemo(() => softArtSVG(seed + 7, hue), [seed, hue]);
  const coverBg = useMemo(
    () => 'linear-gradient(168deg, hsl(' + hue + ' 34% 22%), hsl(' + hue + ' 26% 12%) 62%, hsl(' + hue + ' 30% 16%))',
    [hue],
  );
  const recipeLabels = useMemo<RecipeBlockLabels>(
    () => ({
      yieldTitle: t('magazineYield'),
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

  const loadVolumeContents = useCallback(async () => {
    const sequence = ++listRequestRef.current;
    setIsLoadingVolume(true);
    setArticles([]);
    setChapters([]);
    setArticleListError(null);
    setChapterListError(null);

    if (isPreview) {
      setIsLoadingVolume(false);
      return;
    }

    try {
      const [articleResult, chapterResult] = await Promise.allSettled([
        fetchMagazineArticles(volume.id),
        fetchMagazineChapters(volume.id),
      ]);
      if (sequence !== listRequestRef.current) return;

      if (articleResult.status === 'fulfilled') {
        setArticles(articleResult.value);
      } else {
        setArticleListError(
          articleResult.reason instanceof Error
            ? articleResult.reason.message
            : t('magazineArticleListLoadError'),
        );
      }

      if (chapterResult.status === 'fulfilled') {
        setChapters(chapterResult.value);
      } else {
        setChapterListError(
          chapterResult.reason instanceof Error
            ? chapterResult.reason.message
            : t('magazineChapterLoadError'),
        );
      }
    } finally {
      if (sequence === listRequestRef.current) setIsLoadingVolume(false);
    }
  }, [isPreview, t, volume.id]);

  useEffect(() => {
    void loadVolumeContents();
    return () => {
      listRequestRef.current += 1;
    };
  }, [loadVolumeContents]);

  useEffect(() => {
    let live = true;
    if (!activeArticleId) {
      setDetails(null);
      setArticleError(null);
      setIsLoadingArticle(false);
      return () => {
        live = false;
      };
    }

    setDetails(null);
    setArticleError(null);
    setIsLoadingArticle(true);
    fetchMagazineArticleDetails(activeArticleId, locale)
      .then((loaded) => {
        if (!live) return;
        if (loaded.article.id !== activeArticleId) {
          setArticleError(t('magazineLoadError'));
          setIsLoadingArticle(false);
          return;
        }
        setDetails(loaded);
        setIsLoadingArticle(false);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setArticleError(error instanceof Error ? error.message : t('magazineLoadError'));
        setIsLoadingArticle(false);
      });

    return () => {
      live = false;
    };
  }, [activeArticleId, articleRetry, locale, t]);

  const indexEntries = useMemo<VolumeIndexEntry[]>(() => {
    const entries: VolumeIndexEntry[] = [];
    const assignedArticles = new Set<string>();

    if (!chapterListError) {
      for (const chapter of chapters) {
        entries.push({
          kind: 'chapter',
          id: String(chapter.id),
          title: chapter.title,
        });
        for (const article of articles) {
          if (article.chapter_id === chapter.id) {
            entries.push({ kind: 'article', id: article.id, article });
            assignedArticles.add(article.id);
          }
        }
      }
    }

    const uncategorized = chapterListError
      ? articles
      : articles.filter((article) => !assignedArticles.has(article.id));
    if (!chapterListError && uncategorized.length > 0) {
      entries.push({ kind: 'chapter', id: 'uncategorized', title: t('shelfNoChapter') });
    }
    for (const article of uncategorized) {
      entries.push({ kind: 'article', id: article.id, article });
    }
    return entries;
  }, [articles, chapterListError, chapters, t]);

  const indexPageEntries = useMemo(() => {
    const chunks: VolumeIndexEntry[][] = [];
    for (let start = 0; start < indexEntries.length; start += 6) {
      chunks.push(indexEntries.slice(start, start + 6));
    }
    return chunks.length > 0 ? chunks : [[]];
  }, [indexEntries]);

  const activeDetails = details?.article.id === activeArticleId ? details : null;

  const pages = useMemo<KioscoPage[]>(() => {
    const list: KioscoPage[] = indexPageEntries.map((entries) => ({
        kind: 'index' as const,
        section: t('kioscoIndex'),
        indexEntries: entries,
      }));

    if (!activeArticleId) return list;
    if (isLoadingArticle) {
      list.push({ kind: 'status', section: t('magazineContent'), status: 'loading' });
      return list;
    }
    if (articleError) {
      list.push({ kind: 'status', section: t('magazineContent'), status: 'error', error: articleError });
      return list;
    }
    if (!activeDetails) return list;

    const blocks = parseStructuredBlocks(
      activeDetails.article.structured_content_json,
      recipeLabels,
      { textFallback: true },
    ).blocks;
    const contentPages = paginateBlocks(blocks);
    const safeContentPages = contentPages.length > 0 ? contentPages : [[]];
    safeContentPages.forEach((group, groupIndex) => {
      list.push({
        kind: 'content',
        section: activeDetails.article.title,
        blocks: group,
        first: groupIndex === 0,
      });
    });
    if (activeDetails.evidence.length > 0) {
      for (let start = 0; start < activeDetails.evidence.length; start += 2) {
        list.push({
          kind: 'evidence',
          section: t('magazineEvidence'),
          evidenceStart: start,
        });
      }
    }
    list.push({ kind: 'sources', section: t('magazineSources') });
    if (activeDetails.conflicts.length > 0) {
      list.push({ kind: 'conflicts', section: t('magazineConflicts') });
    }
    if (activeDetails.versions.length > 1) {
      list.push({ kind: 'versions', section: t('magazineVersions') });
    }
    list.push({ kind: 'colophon', section: t('kioscoColophon') });
    return list;
  }, [
    activeArticleId,
    activeDetails,
    articleError,
    indexPageEntries,
    isLoadingArticle,
    recipeLabels,
    t,
  ]);
  pagesRef.current = pages;

  const step = flipStep(single);
  const maxIndex = flipMax(pages.length, single);

  const openIndexPageForArticle = useCallback((articleId: string | null) => {
    if (!articleId) return 0;
    const pageIndex = pagesRef.current.findIndex(
      (page) => page.kind === 'index'
        && page.indexEntries?.some((entry) => entry.kind === 'article' && entry.id === articleId),
    );
    return pageIndex >= 0 ? pageIndex : 0;
  }, []);

  const selectArticle = useCallback((article: MagazineArticleRecord, pageIndex: number) => {
    setActiveArticleId(article.id);
    setDetails(null);
    setArticleError(null);
    setIsLoadingArticle(true);
    setIdx(pageIndex);
  }, []);

  const retryArticle = useCallback(() => {
    setArticleRetry((value) => value + 1);
  }, []);

  const backToIndex = useCallback(() => {
    setInspectorEvidence(null);
    const articleId = activeArticleIdRef.current;
    setIdx(openIndexPageForArticle(articleId));
    if (articleId) {
      window.requestAnimationFrame(() => indexArticleButtonRefs.current.get(articleId)?.focus());
    }
  }, [openIndexPageForArticle]);

  useEffect(() => {
    if (!activeArticleId) return;
    if (isLoadingArticle) {
      const statusPageIndex = pages.findIndex((page) => page.kind === 'status');
      if (statusPageIndex >= 0) setIdx(statusPageIndex);
      return;
    }
    if (activeDetails) {
      const contentPageIndex = pages.findIndex((page) => page.kind === 'content');
      if (contentPageIndex >= 0) setIdx(contentPageIndex);
      requestAnimationFrame(() => articleHeadingRef.current?.focus());
    }
  }, [activeArticleId, activeDetails, isLoadingArticle, pages]);

  const articleHeadingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  /* Responsive page spread; keep the index visible after a narrow resize. */
  useEffect(() => {
    const updateLayout = () => {
      const nextSingle = window.innerWidth < 760;
      setSingle(nextSingle);
      setIdx((current) => clamp(current, 0, flipMax(pagesRef.current.length, nextSingle)));
    };
    updateLayout();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(updateLayout, 170);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (timer) clearTimeout(timer);
    };
  }, []);

  /* Open the physical cover once the volume index has loaded. */
  const didOpenRef = useRef(false);
  useEffect(() => {
    if (isLoadingVolume || didOpenRef.current) return;
    didOpenRef.current = true;
    const firstVisiblePage = 0;
    setBusy(true);
    setIdx(firstVisiblePage);
    const openTimer = window.setTimeout(() => {
      setLeaf({ front: -1, back: firstVisiblePage });
      setTurning(true);
      requestAnimationFrame(() => {
        if (leafRef.current) leafRef.current.style.transform = 'rotateY(-180deg)';
      });
      openFinishTimerRef.current = window.setTimeout(() => {
        openFinishTimerRef.current = null;
        setLeaf(null);
        setTurning(false);
        setBusy(false);
      }, flipMs + 40);
    }, 60);
    return () => {
      window.clearTimeout(openTimer);
      if (openFinishTimerRef.current !== null) {
        window.clearTimeout(openFinishTimerRef.current);
        openFinishTimerRef.current = null;
      }
    };
  }, [flipMs, isLoadingVolume]);

  useEffect(() => {
    if (!activeDetails) return;
    const update = () => setLiveLabel(t('kioscoUpdated') + ' ' + timeAgo(activeDetails.article.updated_at, locale));
    update();
    const timer = window.setInterval(update, 15000);
    return () => window.clearInterval(timer);
  }, [activeDetails, locale, t]);

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
    if (closingRef.current) return;
    if (busyRef.current) {
      closingRef.current = true;
      onBackRef.current();
      return;
    }
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (inspectorEvidence) {
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
  }, [closeReader, flip, inspectorEvidence]);

  const renderPage = useCallback((pageIndex: number): React.ReactNode => {
    if (pageIndex === -1) {
      const category = volume.category.toLowerCase();
      const categoryKey = Object.prototype.hasOwnProperty.call(MAGAZINE_CATEGORY_KEYS, category)
        ? MAGAZINE_CATEGORY_KEYS[category]
        : undefined;
      return (
        <div className={styles.coverface}>
          <div className={styles.cvBg} style={{ background: volume.coverGradient || coverBg }} />
          <div className={styles.cvArt} style={{ opacity: 0.62 }} dangerouslySetInnerHTML={{ __html: coverSvg }} />
          <div className={styles.cvVeil} />
          <div className={styles.cvTop}>
            <span className={styles.cvCode}>{volume.volumeNumber}</span>
            <span className={styles.cvCode}>{presentEditorialState(volume.editorialState, locale)}</span>
          </div>
          <div className={styles.cvMast}>
            <b>{volume.title}</b>
            <span>{volume.subtitle}</span>
          </div>
          {volume.description && <p className={styles.cvDescription}>{volume.description}</p>}
          <div className={styles.cvBot}>
            <div className={styles.cvRow}>
              <span>{t('shelfCategory')} · {categoryKey ? t(categoryKey) : volume.category.replace(/[-_]+/g, ' ')}</span>
              <span>{t('shelfArticleMany', { count: volume.articleCount })}</span>
            </div>
            <div className={styles.bar}><i style={{ width: '100%' }} /></div>
          </div>
          <div className={styles.foil} aria-hidden="true" />
        </div>
      );
    }

    const page = pagesRef.current[pageIndex];
    if (!page) return null;
    const active = activeDetails;
    const shell = (inner: React.ReactNode) => (
      <div className={styles.pgIn}>
        <header className={styles.pf}>{volume.title} · {volume.volumeNumber}</header>
        <div className={styles.pb + (page.first ? ' ' + styles.dropcap : '')}>{inner}</div>
        <footer className={styles.pft}>
          <span>{page.section}</span>
          <span className={styles.num}>{pad(pageIndex + 1)}</span>
        </footer>
      </div>
    );

    switch (page.kind) {
      case 'index':
        return shell(
          <>
            <p className={styles.ki}>{t('kioscoIndex')}</p>
            {isLoadingVolume ? (
              <p className={styles.body} role="status">{t('kioscoLoadingVolume')}</p>
            ) : articleListError ? (
              <div className={styles.readerStatus} role="alert">
                <p>{t('magazineArticleListLoadError')}</p>
                <button type="button" onClick={() => void loadVolumeContents()}>{t('kioscoRetry')}</button>
              </div>
            ) : (
              <>
                {chapterListError && (
                  <p className={styles.readerNote} role="alert">{t('magazineChapterLoadError')}</p>
                )}
                {isPreview ? (
                  <p className={styles.body}>{t('shelfPreviewArticles')}</p>
                ) : articles.length === 0 ? (
                  <p className={styles.body}>{t('shelfEmptyArticles')}</p>
                ) : (
                  <div className={styles.indexList}>
                    {(page.indexEntries ?? []).map((entry) => {
                      if (entry.kind === 'chapter') {
                        return <h3 key={'chapter-' + entry.id} className={styles.indexChapter}>{entry.title}</h3>;
                      }
                      return (
                        <button
                          key={entry.article.id}
                          ref={(node) => {
                            if (node) indexArticleButtonRefs.current.set(entry.article.id, node);
                            else indexArticleButtonRefs.current.delete(entry.article.id);
                          }}
                          type="button"
                          className={styles.indexArticle}
                          onClick={() => selectArticle(entry.article, pageIndex)}
                        >
                          <span className={styles.indexArticleTitle}>{entry.article.title}</span>
                          <span className={styles.indexArticleMeta}>
                            {presentArticleType(entry.article.article_type, locale)}
                            {' · '}
                            {presentEditorialState(entry.article.editorial_state, locale)}
                            {' · v'}
                            {entry.article.active_version}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>,
        );
      case 'content':
        return shell(
          <>
            {page.first && active && (
              <h2 ref={articleHeadingRef} tabIndex={-1} className={styles.hl + ' ' + styles.hlSm}>
                {active.article.title}
              </h2>
            )}
            {(page.blocks ?? []).map((block, index) => (
              <BlockView key={index} block={block} />
            ))}
            {(page.blocks ?? []).length === 0 && (
              <p className={styles.body}>{t('kioscoEmptyPage')}</p>
            )}
          </>,
        );
      case 'status':
        return shell(
          <div className={styles.readerStatus} role={page.status === 'error' ? 'alert' : 'status'}>
            {page.status === 'loading' ? (
              <p>{t('kioscoLoadingArticle')}</p>
            ) : (
              <>
                <p>{page.error || t('magazineLoadError')}</p>
                <button type="button" onClick={retryArticle}>{t('kioscoRetry')}</button>
              </>
            )}
          </div>,
        );
      case 'evidence': {
        if (!active) return shell(<p className={styles.body}>{t('kioscoEmptyPage')}</p>);
        const items = active.evidence.slice(page.evidenceStart ?? 0, (page.evidenceStart ?? 0) + 2);
        return shell(
          <>
            <p className={styles.ki}>{t('kioscoTraceable')}</p>
            <h2 className={styles.hl + ' ' + styles.hlMd}>{t('kioscoSustains')}</h2>
            {items.map((item) => (
              <div key={item.id} className={styles.evCard}>
                {item.transcript_text && <q>{item.transcript_text}</q>}
                {item.extracted_fact && <p>{item.extracted_fact}</p>}
                <div className={styles.evMeta}>
                  <span>{presentEvidenceKind(item.evidence_kind, locale)}</span>
                  {item.timestamp_start !== null && item.timestamp_start !== undefined && (
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
            <h2 className={styles.hl + ' ' + styles.hlMd}>{t('kioscoSourceVideos')}</h2>
            {!active || active.sources.length === 0 ? (
              <p className={styles.body}>{t('magazineNoSources')}</p>
            ) : (
              <div className={styles.toc}>
                {active.sources.map((source) => (
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
            <h2 className={styles.hl + ' ' + styles.hlMd}>{t('kioscoToResolve')}</h2>
            <div className={styles.body}>
              {active?.conflicts.map((conflict) => (
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
            <h2 className={styles.hl + ' ' + styles.hlMd}>{t('kioscoHistory')}</h2>
            <div className={styles.toc}>
              {active?.versions.map((version) => (
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
              {volume.volumeNumber}
              {active ? ' · v' + active.article.active_version + ' · ' + presentEditorialState(active.article.editorial_state, locale) : ''}
            </p>
            <figure style={{ margin: '1em 0 0', height: '7em', overflow: 'hidden', borderRadius: 2 }} aria-hidden="true">
              <span dangerouslySetInnerHTML={{ __html: colophonSvg }} style={{ display: 'block', height: '100%' }} />
            </figure>
          </>,
        );
    }
  }, [
    activeDetails,
    articles.length,
    articleListError,
    chapterListError,
    colophonSvg,
    coverBg,
    coverSvg,
    isLoadingVolume,
    isPreview,
    loadVolumeContents,
    locale,
    retryArticle,
    selectArticle,
    t,
    volume,
  ]);

  const total = pages.length;
  const counter = total === 0
    ? '—'
    : single
      ? pad(idx + 1)
      : pad(idx + 1) + '–' + pad(Math.min(idx + 2, total));
  const progressPct = total <= 1 ? 100 : Math.round(((idx + step) / total) * 100);
  return (
    <section className={styles.reader} aria-label={t('kioscoReaderTitle', { title: volume.title })}>
      <div className={styles.stage}>
        <div className={styles.topbar}>
          <span className={styles.sp} />
          {isPreview && <span className={styles.previewTag}>{t('shelfPreviewBadge')}</span>}
          {liveLabel && <span className={styles.livetag}><i />{liveLabel}</span>}
          <span className={styles.rctl}>
            {activeArticleId && (
              <button type="button" className={styles.indexBtn} onClick={backToIndex} aria-label={t('kioscoBackToIndex')}>
                {t('kioscoIndex')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setFontScale((value) => clamp(Math.round((value - 0.08) * 100) / 100, 0.85, 1.5))}
              title={t('kioscoDecreaseText')}
              aria-label={t('kioscoDecreaseText')}
            >
              A−
            </button>
            <button
              type="button"
              onClick={() => setFontScale((value) => clamp(Math.round((value + 0.08) * 100) / 100, 0.85, 1.5))}
              title={t('kioscoIncreaseText')}
              aria-label={t('kioscoIncreaseText')}
            >
              A+
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.xbtn}
              onClick={closeReader}
              aria-label={t('kioscoCloseReader')}
            >
              ×
            </button>
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
            className={styles.spread + (single ? ' ' + styles.single : '') + (bumpKey > 0 ? ' ' + styles.bump : '')}
            style={{ '--kiosco-u': (16 * fontScale).toFixed(2) + 'px' } as React.CSSProperties}
          >
            <div className={styles.pg + ' ' + styles.pgLeft}>
              {!single && (
                <div key={'l-' + idx} className={styles.pageSwap} style={{ position: 'absolute', inset: 0 }}>
                  {renderPage(idx)}
                </div>
              )}
              <span className={styles.pgSpine} />
            </div>
            <div className={styles.pg + ' ' + styles.pgRight}>
              <div key={'r-' + (single ? idx : idx + 1)} className={styles.pageSwap} style={{ position: 'absolute', inset: 0 }}>
                {renderPage(single ? idx : idx + 1)}
              </div>
              <span className={styles.pgSpine} />
            </div>
            {leaf && (
              <div ref={leafRef} className={styles.leaf + ' ' + styles.on + (turning ? ' ' + styles.turning : '')} aria-hidden="true">
                <div className={styles.pg + ' ' + styles.leafFront}>
                  {renderPage(leaf.front)}
                  <div className={styles.shade} />
                </div>
                <div className={styles.pg + ' ' + styles.leafBack}>
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
          <span className={styles.ctr} aria-live="polite">
            <b>{counter}</b> / <span>{pad(Math.max(1, total))}</span>
          </span>
          <button type="button" onClick={() => flip(1)} disabled={idx >= maxIndex} aria-label={t('kioscoNextPage')}>
            <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct} aria-label={t('kioscoReadingProgress')}>
          <i style={{ width: progressPct + '%' }} />
        </div>
      </div>

      {inspectorEvidence && activeDetails && (
        <div
          className={styles.inspectorOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={t('kioscoEvidenceSource')}
          onClick={(event) => {
            if (event.target === event.currentTarget) setInspectorEvidence(null);
          }}
        >
          <div className={styles.inspectorContent}>
            <EvidenceSourceInspector
              articleId={activeDetails.article.id}
              evidence={inspectorEvidence}
              sources={activeDetails.sources}
              onClose={() => setInspectorEvidence(null)}
            />
          </div>
        </div>
      )}
    </section>
  );
}
