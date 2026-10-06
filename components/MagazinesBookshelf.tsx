'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { KioscoReader } from '@/components/KioscoReader';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { coverArtSVG, hashSeed, hexToHue, timeAgo } from '@/lib/kiosco';
import {
    FaBookOpen,
    FaMagnifyingGlass,
    FaClock,
    FaArrowRotateLeft,
    FaPlus,
    FaXmark,
    FaFileLines,
    FaChevronRight,
    FaFolder,
    FaWandMagicSparkles,
} from '@/components/icon-library';
import {
    fetchMagazineArticles,
    fetchMagazineChapters,
    fetchMagazineCompilations,
    fetchMagazineVolumes,
    fetchGeminiStatus,
    compileMagazineSource,
    compileMultiSourceEditorial,
    fetchMagazineCompilationCandidate,
    retryMagazineCompilation,
    filterMagazineVolumes,
    latestCompilation,
    presentArticleType,
    presentCompilationState,
    presentEditorialState,
    type MagazineArticleRecord,
    type MagazineChapterRecord,
    type MagazineCompilationRecord,
    type MagazineEvidenceTarget,
    type MagazineVolumeView,
    type NewVolumeCandidate,
} from '@/lib/magazines';

/**
 * Librero de Revistas & Tomos Inteligentes.
 *
 * Lee los tomos desde SQLite a través de IPC (`get_magazine_volumes`) y
 * refleja el estado REAL de las compilaciones editoriales por tomo
 * (`get_magazine_compilations`). Compilar (`compile_magazine_source`)
 * requiere la app de escritorio y clave Gemini en el proceso nativo; sin
 * ella el backend falla cerrado con un mensaje accionable.
 * Fuera del shell nativo se muestra vista previa marcada, sin inventar datos.
 */

type PreviewText = (key: TranslationKey, params?: Record<string, string | number>) => string;

const PREVIEW_VOLUME_DEFS = [
    {
        id: 'vol-recipes',
        numeral: 'I',
        titleKey: 'shelfPrevTitle1',
        subtitleKey: 'shelfPrevSubtitle1',
        descriptionKey: 'shelfPrevDesc1',
        category: 'recipes',
        color: '#ff9a3c',
        accentGlow: 'rgba(255, 154, 60, 0.35)',
        spineGradient: 'linear-gradient(180deg, #d35400 0%, #78281f 100%)',
        coverGradient: 'linear-gradient(145deg, #1e130c 0%, #120b07 100%)',
    },
    {
        id: 'vol-tech',
        numeral: 'II',
        titleKey: 'shelfPrevTitle2',
        subtitleKey: 'shelfPrevSubtitle2',
        descriptionKey: 'shelfPrevDesc2',
        category: 'tech',
        color: '#38bdf8',
        accentGlow: 'rgba(56, 189, 248, 0.35)',
        spineGradient: 'linear-gradient(180deg, #0284c7 0%, #082f49 100%)',
        coverGradient: 'linear-gradient(145deg, #091524 0%, #050b14 100%)',
    },
    {
        id: 'vol-guides',
        numeral: 'III',
        titleKey: 'shelfPrevTitle3',
        subtitleKey: 'shelfPrevSubtitle3',
        descriptionKey: 'shelfPrevDesc3',
        category: 'guides',
        color: '#34d399',
        accentGlow: 'rgba(52, 211, 153, 0.35)',
        spineGradient: 'linear-gradient(180deg, #059669 0%, #064e3b 100%)',
        coverGradient: 'linear-gradient(145deg, #091f16 0%, #05100c 100%)',
    },
    {
        id: 'vol-lifestyle',
        numeral: 'IV',
        titleKey: 'shelfPrevTitle4',
        subtitleKey: 'shelfPrevSubtitle4',
        descriptionKey: 'shelfPrevDesc4',
        category: 'lifestyle',
        color: '#a855f7',
        accentGlow: 'rgba(168, 85, 247, 0.35)',
        spineGradient: 'linear-gradient(180deg, #7e22ce 0%, #3b0764 100%)',
        coverGradient: 'linear-gradient(145deg, #190c24 0%, #0d0614 100%)',
    },
] as const;

/** Volúmenes de vista previa localizados (solo fuera del shell nativo). */
function buildPreviewVolumes(t: PreviewText): MagazineVolumeView[] {
    return PREVIEW_VOLUME_DEFS.map((def) => ({
        id: def.id,
        volumeNumber: t('shelfVolumeLabel', { numeral: def.numeral }),
        title: t(def.titleKey),
        subtitle: t(def.subtitleKey),
        category: def.category,
        color: def.color,
        accentGlow: def.accentGlow,
        spineGradient: def.spineGradient,
        coverGradient: def.coverGradient,
        articleCount: 0,
        videoCount: 0,
        editorialState: 'published',
        description: t(def.descriptionKey) as string,
        updatedAt: '',
    }));
}

/** Insignia honesta del estado de compilación: siempre proviene del backend. */
function compilationBadge(compilation: MagazineCompilationRecord, locale: 'es-MX' | 'en-US' = 'es-MX'): {
    dot: string;
    text: string;
    label: string;
} {
    const base = presentCompilationState(compilation.status, locale);
    const progress = compilation.status === 'processing' ? ` ${compilation.progress}%` : '';
    switch (compilation.status) {
        case 'completed':
            return { dot: 'bg-emerald-400', text: 'text-emerald-300/80', label: base };
        case 'processing':
        case 'queued':
            return { dot: 'bg-sky-400 animate-pulse', text: 'text-sky-300/80', label: `${base}${progress}` };
        case 'requires_review':
            return { dot: 'bg-amber-400', text: 'text-amber-300/80', label: base };
        case 'failed':
        case 'cancelled':
            return { dot: 'bg-rose-400', text: 'text-rose-300/80', label: base };
        default:
            return { dot: 'bg-white/25', text: 'text-white/35', label: base };
    }
}

export function MagazinesBookshelf() {
    const { t, locale } = useI18n();
    const [volumes, setVolumes] = useState<MagazineVolumeView[]>([]);
    const [isPreview, setIsPreview] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedVolume, setSelectedVolume] = useState<MagazineVolumeView | null>(null);
    const [selectedArticles, setSelectedArticles] = useState<MagazineArticleRecord[]>([]);
    const [isLoadingArticles, setIsLoadingArticles] = useState(false);
    const [volumeChapters, setVolumeChapters] = useState<MagazineChapterRecord[]>([]);
    const [isLoadingChapters, setIsLoadingChapters] = useState(false);
    const [reader, setReader] = useState<{
        articleId: string;
        target: MagazineEvidenceTarget | null;
    } | null>(null);
    const [readerVolume, setReaderVolume] = useState<MagazineVolumeView | null>(null);
    const [hoveredVolume, setHoveredVolume] = useState<MagazineVolumeView | null>(null);
    const [openingVolumeId, setOpeningVolumeId] = useState<string | null>(null);
    const openTimerRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (openTimerRef.current) clearTimeout(openTimerRef.current);
    }, []);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [compilationsByVolume, setCompilationsByVolume] = useState<Record<string, MagazineCompilationRecord[]>>({});
    const [geminiReady, setGeminiReady] = useState<boolean | null>(null);
    const [compileJobId, setCompileJobId] = useState('');
    const [isCompiling, setIsCompiling] = useState(false);
    const [compileFeedback, setCompileFeedback] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<
        Array<{ compilationId: number; volumeId: string; candidate: NewVolumeCandidate }>
    >([]);

    const loadCompilations = useCallback(async (volumeIds: string[]) => {
        const entries = await Promise.all(
            volumeIds.map(async (volumeId) => {
                try {
                    const rows = await fetchMagazineCompilations(volumeId);
                    return [volumeId, rows] as const;
                } catch {
                    return [volumeId, []] as const;
                }
            }),
        );
        const dict: Record<string, MagazineCompilationRecord[]> = Object.fromEntries(entries);
        setCompilationsByVolume(dict);

        // Descubrir candidatos a nuevos tomos propuestos en las compilaciones recientes
        const discovered: Array<{ compilationId: number; volumeId: string; candidate: NewVolumeCandidate }> = [];
        for (const [volId, rows] of entries) {
            for (const row of rows.slice(0, 3)) {
                try {
                    const cand = await fetchMagazineCompilationCandidate(row.id);
                    if (cand && !discovered.some((d) => d.compilationId === row.id)) {
                        discovered.push({ compilationId: row.id, volumeId: volId, candidate: cand });
                    }
                } catch {
                    // sin candidato
                }
            }
        }
        setCandidates(discovered);
    }, []);

    const previewVolumes = useMemo(() => buildPreviewVolumes(t), [t]);

    const loadVolumes = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const live = await fetchMagazineVolumes();
            setVolumes(live);
            setIsPreview(false);
            void loadCompilations(live.map((volume) => volume.id));
            fetchGeminiStatus()
                .then((ready) => setGeminiReady(ready))
                .catch(() => setGeminiReady(false));
        } catch (error) {
            setGeminiReady(null);
            setCompilationsByVolume({});
            if (error instanceof Error && error.message === 'preview-without-native-shell') {
                setVolumes(previewVolumes);
                setIsPreview(true);
            } else {
                setVolumes(previewVolumes);
                setIsPreview(true);
                setLoadError(t('shelfLoadError'));
            }
        } finally {
            setIsLoading(false);
        }
    }, [loadCompilations, previewVolumes, t]);

    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (active) void loadVolumes();
        });
        return () => {
            active = false;
        };
    }, [loadVolumes]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        void loadVolumes().finally(() => setIsRefreshing(false));
    }, [loadVolumes]);

    const openVolume = useCallback((volume: MagazineVolumeView) => {
        // Transición de apertura del librero vivo: la revista se eleva y
        // se disuelve antes de abrir su modal. Se cancela cualquier
        // apertura previa para no abrir un tomo obsoleto con doble clic.
        if (openTimerRef.current) clearTimeout(openTimerRef.current);
        setOpeningVolumeId(volume.id);
        openTimerRef.current = window.setTimeout(() => {
            openTimerRef.current = null;
            setSelectedVolume(volume);
            setOpeningVolumeId(null);
        }, 340);
        setSelectedArticles([]);
        setVolumeChapters([]);
        setCompileJobId('');
        setCompileFeedback(null);
        if (isPreview) return;
        setIsLoadingArticles(true);
        fetchMagazineArticles(volume.id)
            .then(setSelectedArticles)
            .catch(() => setSelectedArticles([]))
            .finally(() => setIsLoadingArticles(false));
        setIsLoadingChapters(true);
        fetchMagazineChapters(volume.id)
            .then(setVolumeChapters)
            .catch(() => setVolumeChapters([]))
            .finally(() => setIsLoadingChapters(false));
    }, [isPreview]);

    const openArticle = useCallback(
        (volume: MagazineVolumeView, articleId: string, target: MagazineEvidenceTarget | null = null) => {
            setReaderVolume(volume);
            setReader({ articleId, target });
            setSelectedVolume(null);
        },
        [],
    );

    const closeReader = useCallback(() => {
        setReader(null);
        // Regresar: Artículo ← Tomo ← Librero (se reabre el tomo de origen).
        if (readerVolume) {
            openVolume(readerVolume);
        }
    }, [readerVolume, openVolume]);

    // Tilt 3D premium en la portada (solo puntero fino, sin reduced-motion).
    const handleBookTilt = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        event.currentTarget.style.setProperty('--tilt-y', `${(px * 7).toFixed(2)}deg`);
        event.currentTarget.style.setProperty('--tilt-x', `${(-py * 7).toFixed(2)}deg`);
    }, []);

    const resetBookTilt = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        event.currentTarget.style.removeProperty('--tilt-x');
        event.currentTarget.style.removeProperty('--tilt-y');
    }, []);

    const refreshVolumeData = useCallback(async (volume: MagazineVolumeView) => {
        try {
            const [articles, compilations, live, chapters] = await Promise.all([
                fetchMagazineArticles(volume.id),
                fetchMagazineCompilations(volume.id),
                fetchMagazineVolumes(),
                fetchMagazineChapters(volume.id),
            ]);
            setSelectedArticles(articles);
            setCompilationsByVolume((prev) => ({ ...prev, [volume.id]: compilations }));
            setVolumes(live);
            setVolumeChapters(chapters);
        } catch {
            /* la vista conserva los últimos datos leídos */
        }
    }, []);

    const handleCompile = useCallback(async () => {
        if (!selectedVolume || isCompiling) return;
        const jobIds = compileJobId
            .split(/[,\s]+/)
            .map((s) => Number.parseInt(s.trim(), 10))
            .filter((n) => Number.isInteger(n) && n > 0);

        if (jobIds.length === 0) {
            setCompileFeedback(t('shelfCompileAskIds'));
            return;
        }
        setIsCompiling(true);
        setCompileFeedback(null);
        try {
            const outcome =
                jobIds.length === 1
                    ? await compileMagazineSource(jobIds[0], selectedVolume.id)
                    : await compileMultiSourceEditorial(jobIds, selectedVolume.id);

            const article = outcome.article_id ? ` · ${t('shelfOutcomeArticle', { id: outcome.article_id })}` : '';
            const version = outcome.version ? ` v${outcome.version}` : '';
            const conflicts = outcome.conflict_count > 0
                ? ` · ${outcome.conflict_count === 1
                    ? t('magazineConflictCountOne', { count: 1 })
                    : t('magazineConflictCountMany', { count: outcome.conflict_count })}`
                : '';
            const candidateInfo = outcome.candidate
                ? ` · ${t('shelfOutcomeCandidate', { title: outcome.candidate.suggested_title })}`
                : '';
            const unchanged = outcome.unchanged ? ` ${t('shelfOutcomeUnchanged')}` : '';

            if (outcome.candidate) {
                setCandidates((prev) => {
                    const filtered = prev.filter((c) => c.compilationId !== outcome.compilation_id);
                    return [
                        ...filtered,
                        {
                            compilationId: outcome.compilation_id,
                            volumeId: selectedVolume.id,
                            candidate: outcome.candidate!,
                        },
                    ];
                });
            }

            setCompileFeedback(
                `${presentCompilationState(outcome.status, locale)}${unchanged}${article}${version}${conflicts}${candidateInfo}. ${outcome.message}`,
            );
            await refreshVolumeData(selectedVolume);
        } catch (error) {
            setCompileFeedback(
                error instanceof Error ? error.message : t('shelfCompileFailed'),
            );
            try {
                const compilations = await fetchMagazineCompilations(selectedVolume.id);
                setCompilationsByVolume((prev) => ({ ...prev, [selectedVolume.id]: compilations }));
            } catch {
                /* sin compilaciones legibles */
            }
        } finally {
            setIsCompiling(false);
        }
    }, [selectedVolume, isCompiling, compileJobId, refreshVolumeData, t, locale]);

    const handleRetry = useCallback(async (compilationId: number) => {
        if (!selectedVolume || isCompiling) return;
        setIsCompiling(true);
        setCompileFeedback(null);
        try {
            const outcome = await retryMagazineCompilation(compilationId);
            setCompileFeedback(
                `${presentCompilationState(outcome.status, locale)}. ${outcome.message}`,
            );
            await refreshVolumeData(selectedVolume);
        } catch (error) {
            setCompileFeedback(
                error instanceof Error ? error.message : t('shelfRetryFailed'),
            );
        } finally {
            setIsCompiling(false);
        }
    }, [selectedVolume, isCompiling, refreshVolumeData, t, locale]);

    const filteredVolumes = useMemo(
        () => filterMagazineVolumes(volumes, searchQuery),
        [volumes, searchQuery],
    );

    const totalArticles = useMemo(
        () => volumes.reduce((sum, volume) => sum + volume.articleCount, 0),
        [volumes],
    );
    const totalSources = useMemo(
        () => volumes.reduce((sum, volume) => sum + volume.videoCount, 0),
        [volumes],
    );

    const modalLatest = !selectedVolume || isPreview
        ? null
        : latestCompilation(compilationsByVolume[selectedVolume.id] ?? []);
    const modalRetryable = modalLatest !== null
        && (modalLatest.status === 'failed'
            || modalLatest.status === 'cancelled'
            || modalLatest.status === 'requires_review');

    return (
        <div className="w-full h-full flex flex-col overflow-y-auto custom-scrollbar p-4 lg:p-6 font-sans select-none relative">
            {/* Ambient Background Lighting */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/[0.08] relative z-10 shrink-0">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2.5">
                        <span className="p-2 rounded-xl bg-white/[0.06] border border-white/10 text-white/80">
                            <FaBookOpen size={18} />
                        </span>
                        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-3">
                            {t('shelfTitle')}
                            <span className="text-[10px] font-mono tracking-wider font-semibold uppercase px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-white/60">
                                {t('shelfPhase')}
                            </span>
                            {isPreview && (
                                <span className="text-[10px] font-mono tracking-wider font-semibold uppercase px-2.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-300">
                                    {t('shelfPreviewBadge')}
                                </span>
                            )}
                        </h1>
                    </div>
                    <p className="text-xs text-white/50 max-w-2xl leading-relaxed">
                        {t('shelfDescription')}
                    </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white/70 focus-within:border-white/25 transition-all">
                        <FaMagnifyingGlass size={12} className="text-white/40 shrink-0" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder={t('shelfSearchPlaceholder')}
                            aria-label={t('shelfSearchLabel')}
                            className="bg-transparent outline-none text-xs placeholder:text-white/30 w-36 md:w-44"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={isRefreshing || isLoading}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white text-xs font-medium flex items-center gap-2 transition-all disabled:opacity-50"
                        title={t('shelfReread')}
                    >
                        <FaArrowRotateLeft size={12} className={isRefreshing ? 'animate-spin text-sky-400' : 'text-white/60'} />
                        <span>{isRefreshing ? t('shelfReading') : t('shelfRefresh')}</span>
                    </button>
                    <button
                        type="button"
                        disabled
                        className="px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-white/35 text-xs font-medium flex items-center gap-2 cursor-not-allowed"
                        title={t('shelfNewVolumeLater')}
                    >
                        <FaPlus size={12} />
                        <span>{t('shelfNewVolume')}</span>
                    </button>
                </div>
            </div>

            {/* Reader (Artículo ← Tomo ← Librero) o estantería */}
            {reader && readerVolume ? (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-4 relative z-10">
                    <KioscoReader
                        volume={readerVolume}
                        articleId={reader.articleId}
                        initialTarget={reader.target}
                        onBack={closeReader}
                    />
                </div>
            ) : (
                <>
            {/* Status Banner */}
            <div className="my-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex items-center justify-between gap-4 relative z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isPreview ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPreview ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    </span>
                    <div className="flex flex-col">
                        <span className="text-xs font-semibold text-white/90 flex items-center gap-2">
                            {isPreview
                                ? t('shelfPreviewNoEngine')
                                : t('shelfSynced')}
                            <span className="text-[10px] text-white/40 font-mono">· SQLite</span>
                        </span>
                        <span className="text-[11px] text-white/50">
                            {isPreview
                                ? t('shelfOpenDesktop')
                                : loadError
                                    ?? (geminiReady === null
                                        ? t('shelfConsulting')
                                        : geminiReady
                                            ? t('shelfEngineReady')
                                            : t('shelfEngineNoKey'))}
                        </span>
                    </div>
                </div>
                <div className="hidden sm:flex items-center gap-3 text-xs text-white/50 font-mono">
                    <span>{t('shelfCountVolumes', { count: volumes.length })}</span>
                    <span>·</span>
                    <span>{t('shelfCountArticles', { count: totalArticles })}</span>
                    <span>·</span>
                    <span>{t('shelfCountSources', { count: totalSources })}</span>
                </div>
            </div>

            {/* Bookshelf Presentation */}
            <div className="flex-1 min-h-0 flex flex-col gap-6 py-3 relative z-10">
                <div className="flex flex-col">
                    <div className="flex items-center justify-between pb-3 px-2">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/40 flex items-center gap-2">
                            <FaFolder size={12} />
                            {t('shelfMainShelf')}
                        </span>
                        <span className="text-[11px] text-white/35 font-mono">
                            {isLoading ? t('shelfReading') : t('shelfVisibleCount', { count: filteredVolumes.length })}
                        </span>
                    </div>

                    {/* Tip de sala + caption viva con datos reales del tomo */}
                    <p className={`text-center font-mono text-[10px] tracking-[0.26em] uppercase text-white/40 transition-opacity duration-500 px-3 ${hoveredVolume ? 'opacity-0' : 'opacity-100'}`}>
                        {t('shelfPickHint')}
                    </p>
                    <div
                        aria-live="polite"
                        className={`mx-auto flex items-center gap-3.5 px-[18px] py-2.5 rounded-[10px] max-w-[94vw] overflow-hidden border border-white/10 bg-[#100e16]/90 font-mono text-[11px] tracking-[0.06em] text-white/50 transition-all duration-300 whitespace-nowrap ${hoveredVolume ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#e2607f] shrink-0 animate-pulse" />
                        {hoveredVolume && (
                            <>
                                <b className="text-white font-medium tracking-[0.1em]">{hoveredVolume.title}</b>
                                <em className="not-italic text-white/30">{hoveredVolume.volumeNumber}</em>
                                <em className="not-italic text-white/30">{hoveredVolume.category}</em>
                                <em className="not-italic text-white/30">
                                    {hoveredVolume.articleCount === 1 ? t('shelfArticleOne', { count: 1 }) : t('shelfArticleMany', { count: hoveredVolume.articleCount })} · {hoveredVolume.videoCount === 1 ? t('magazineSourceOne', { count: 1 }) : t('magazineSourceMany', { count: hoveredVolume.videoCount })}
                                </em>
                                <em className="not-italic text-white/30">{t('shelfUpdatedAt', { time: timeAgo(hoveredVolume.updatedAt, locale) })}</em>
                            </>
                        )}
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-3 pt-4 pb-6">
                            {[0, 1, 2, 3].map((skeleton) => (
                                <div key={skeleton} className="h-72 w-full rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
                            ))}
                        </div>
                    ) : filteredVolumes.length === 0 ? (
                        <div className="mx-3 mb-6 p-10 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center flex flex-col items-center gap-2">
                            <FaBookOpen size={22} className="text-white/25" />
                            <p className="text-sm text-white/70 font-medium">
                                {searchQuery.trim()
                                    ? t('shelfEmptySearch', { query: searchQuery.trim() })
                                    : t('shelfEmptyShelf')}
                            </p>
                            <p className="text-[11px] text-white/40">
                                {searchQuery.trim()
                                    ? t('shelfEmptySearchHint')
                                    : t('shelfSeedHint')}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-3 pt-4 pb-6">
                            {filteredVolumes.map((volume, cardIndex) => {
                                const latest = isPreview
                                    ? null
                                    : latestCompilation(compilationsByVolume[volume.id] ?? []);
                                const badge = latest
                                    ? compilationBadge(latest, locale)
                                    : {
                                        dot: 'bg-white/25',
                                        text: 'text-white/35',
                                        label: isPreview ? t('shelfPreviewBadge') : t('shelfNoCompilations'),
                                    };
                                const coverHue = hexToHue(volume.color);
                                const coverSeed = hashSeed(volume.id);
                                return (
                                <motion.div
                                    key={volume.id}
                                    initial={{ opacity: 0, y: 26 }}
                                    whileHover={{ y: -8, scale: 1.02 }}
                                    transition={{ type: 'spring', stiffness: 350, damping: 25, delay: (cardIndex % 8) * 0.05 }}
                                    onClick={() => openVolume(volume)}
                                    onMouseEnter={() => setHoveredVolume(volume)}
                                    onMouseLeave={() => setHoveredVolume((current) => current?.id === volume.id ? null : current)}
                                    onFocus={() => setHoveredVolume(volume)}
                                    onBlur={() => setHoveredVolume((current) => current?.id === volume.id ? null : current)}
                                    animate={openingVolumeId === volume.id ? { opacity: 0, y: -30, scale: 1.16 } : { opacity: 1, y: 0, scale: 1 }}
                                    className="cursor-pointer group flex flex-col"
                                >
                                    {/* 3D Book Object */}
                                    <div
                                        onMouseMove={handleBookTilt}
                                        onMouseLeave={resetBookTilt}
                                        className="relative h-72 w-full rounded-2xl overflow-hidden border border-white/10 transition-all flex shadow-[0_15px_35px_rgba(0,0,0,0.6)] group-hover:shadow-[0_20px_45px_rgba(0,0,0,0.8)] group-hover:border-white/20"
                                        style={{
                                            background: volume.coverGradient,
                                            transform: 'perspective(900px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))',
                                        }}
                                    >
                                        {/* Spine (Lomo del libro/tomo) */}
                                        <div
                                            className="w-8 shrink-0 h-full border-r border-white/10 flex flex-col items-center justify-between py-4 shadow-[inset_-3px_0_8px_rgba(0,0,0,0.6)]"
                                            style={{ background: volume.spineGradient }}
                                        >
                                            <span className="text-[9px] font-black tracking-widest text-white/80 uppercase [writing-mode:vertical-lr] rotate-180">
                                                {volume.volumeNumber}
                                            </span>
                                            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                                            <FaBookOpen size={10} className="text-white/60" />
                                        </div>

                                        {/* Front Cover (Portada de la revista) */}
                                        <div className="flex-1 flex flex-col justify-between p-4 relative overflow-hidden">
                                            {/* Arte procedural de portada (semilla del tomo) */}
                                            <div
                                                aria-hidden="true"
                                                className="absolute inset-0 opacity-45 group-hover:opacity-60 transition-opacity pointer-events-none [&>svg]:h-full [&>svg]:w-full"
                                                dangerouslySetInnerHTML={{ __html: coverArtSVG(coverSeed, coverHue) }}
                                            />
                                            <div
                                                aria-hidden="true"
                                                className="absolute inset-0 pointer-events-none"
                                                style={{ background: 'linear-gradient(180deg, rgba(8,6,14,0.42) 0%, rgba(8,6,14,0.05) 40%, rgba(6,4,12,0.78) 100%)' }}
                                            />
                                            {/* Decorative Ambient Aura */}
                                            <div
                                                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl opacity-40 group-hover:opacity-70 transition-opacity"
                                                style={{ background: volume.color }}
                                            />

                                            {/* Top Metadata */}
                                            <div className="flex items-start justify-between gap-2 relative z-10">
                                                <span className="text-[9px] font-mono font-bold tracking-wider text-white/50 bg-black/40 px-2 py-0.5 rounded border border-white/5">
                                                    PULSARIA EDITORIAL
                                                </span>
                                                <span className="text-[9px] font-mono font-bold text-white/60 bg-white/[0.07] border border-white/10 px-2 py-0.5 rounded-full">
                                                    {presentEditorialState(volume.editorialState, locale)}
                                                </span>
                                            </div>

                                            {/* Center Title */}
                                            <div className="my-auto py-2 relative z-10 flex flex-col gap-1.5">
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: volume.color }}>
                                                    {volume.volumeNumber}
                                                </span>
                                                <h3 className="text-base font-extrabold text-white tracking-tight leading-tight group-hover:text-white transition-colors">
                                                    {volume.title}
                                                </h3>
                                                <p className="text-[11px] text-white/55 line-clamp-2 leading-relaxed">
                                                    {volume.subtitle}
                                                </p>
                                            </div>

                                            {/* Footer Badges */}
                                            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-[10px] text-white/50 relative z-10">
                                                <span className="font-mono">
                                                    {volume.articleCount === 1 ? t('shelfArticleOne', { count: 1 }) : t('shelfArticleMany', { count: volume.articleCount })} · {volume.videoCount === 1 ? t('magazineSourceOne', { count: 1 }) : t('magazineSourceMany', { count: volume.videoCount })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Shelf Base Simulation */}
                                    <div className="w-full h-2.5 mt-2 rounded-md bg-gradient-to-r from-white/[0.03] via-white/[0.08] to-white/[0.03] border-t border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]" />

                                    {/* Sub-label under shelf */}
                                    <div className="mt-2 px-1 flex items-center justify-between text-xs">
                                        <span className="text-white/70 font-medium group-hover:text-white transition-colors truncate">
                                            {volume.title}
                                        </span>
                                        <FaChevronRight size={10} className="text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
                                    </div>
                                    <div className="mt-1 px-1 flex items-center gap-1.5 text-[10px] font-mono">
                                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                                        <span className={badge.text}>{badge.label}</span>
                                    </div>
                                </motion.div>
                                );
                            })}
                        </div>
                    )}

                    {/* Propuestas Editoriales: Candidatos a Nuevos Tomos (Fase 4) */}
                    {candidates.length > 0 && (
                        <div className="flex flex-col gap-3 pt-6 border-t border-white/[0.08]">
                            <div className="flex items-center justify-between px-2">
                                <span className="text-xs font-bold uppercase tracking-[0.16em] text-amber-400/90 flex items-center gap-2">
                                    <FaWandMagicSparkles size={12} className="text-amber-400" />
                                    {t('shelfProposals')}
                                </span>
                                <span className="text-[11px] text-amber-300/60 font-mono">
                                    {candidates.length === 1 ? t('shelfProposalOne', { count: 1 }) : t('shelfProposalMany', { count: candidates.length })}
                                </span>
                            </div>
                            <p className="text-xs text-white/50 px-2 max-w-3xl leading-relaxed">
                                {t('shelfProposalsDesc1')}
                                <strong className="text-white/80 font-medium ml-1">
                                    {t('shelfProposalsDesc2')}
                                </strong>{t('shelfProposalsDesc3')}
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-2 pt-2">
                                {candidates.map(({ compilationId, candidate }) => (
                                    <div
                                        key={compilationId}
                                        className="p-4 rounded-2xl bg-amber-500/[0.04] border border-amber-500/20 hover:border-amber-500/35 transition-all flex flex-col justify-between gap-3 relative overflow-hidden"
                                    >
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/25 text-amber-300">
                                                    {t('shelfSuggestedCandidate')}
                                                </span>
                                                <span className="text-[10px] font-mono text-white/40">
                                                    {t('shelfConfidence', { pct: Math.round((candidate.confidence ?? 0.85) * 100) })}
                                                </span>
                                            </div>
                                            <h4 className="text-sm font-bold text-white tracking-tight">
                                                {candidate.suggested_title}
                                            </h4>
                                            <p className="text-xs text-white/60 leading-relaxed line-clamp-3">
                                                {candidate.rationale}
                                            </p>
                                        </div>

                                        <div className="pt-2 border-t border-white/[0.06] flex flex-col gap-1 text-[11px] text-white/40 font-mono">
                                            <div className="flex items-center justify-between">
                                                <span>{t('shelfCategory')}: <span className="text-white/70">{candidate.suggested_category}</span></span>
                                                {candidate.suggested_chapter && (
                                                    <span>{t('shelfChapter')}: <span className="text-white/70">{candidate.suggested_chapter}</span></span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-white/30 truncate">
                                                {t('shelfSupportSources')}: Jobs #{candidate.supporting_job_ids.join(', #')}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
                </>
            )}

            {/* Volume Detail Modal */}
            <AnimatePresence>
                {selectedVolume && !reader && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                            className="w-full max-w-3xl max-h-[90vh] rounded-3xl bg-[#0d0f17] border border-white/15 overflow-hidden flex flex-col shadow-[0_30px_90px_rgba(0,0,0,0.95)]"
                        >
                            {/* Modal Header */}
                            <div className="p-5 border-b border-white/10 flex items-center justify-between gap-4 shrink-0 bg-white/[0.02]">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                                        style={{ background: selectedVolume.spineGradient }}
                                    >
                                        <FaBookOpen size={16} />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                                                {selectedVolume.volumeNumber}
                                            </span>
                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                                                {presentEditorialState(selectedVolume.editorialState, locale)}
                                            </span>
                                        </div>
                                        <h2 className="text-lg font-bold text-white leading-tight">
                                            {selectedVolume.title}
                                        </h2>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setSelectedVolume(null)}
                                    className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
                                    aria-label={t('shelfCloseDetail')}
                                >
                                    <FaXmark size={14} />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
                                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col gap-2">
                                    <span className="text-xs font-semibold text-white/90">{t('shelfAboutVolume')}</span>
                                    <p className="text-xs text-white/60 leading-relaxed">
                                        {selectedVolume.description}
                                    </p>
                                    <span className="text-[11px] text-white/40 font-mono">
                                        {selectedVolume.articleCount === 1 ? t('shelfArticleOne', { count: 1 }) : t('shelfArticleMany', { count: selectedVolume.articleCount })} · {selectedVolume.videoCount === 1 ? t('magazineSourceOne', { count: 1 }) : t('magazineSourceMany', { count: selectedVolume.videoCount })} · {selectedVolume.category}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                                            {t('shelfEditorialBuild')}
                                        </span>
                                        {modalLatest && (
                                            <span className="text-[11px] text-white/40 font-mono">
                                                #{modalLatest.id} · {presentCompilationState(modalLatest.status, locale)}
                                                {modalLatest.status === 'processing' ? ` · ${modalLatest.progress}%` : ''}
                                            </span>
                                        )}
                                    </div>

                                    {isPreview ? (
                                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                                            <p className="text-xs text-white/60">
                                                {t('shelfPreviewCompile')}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-3">
                                            <p className="text-[11px] text-white/50 leading-relaxed">
                                                {modalLatest
                                                    ? (modalLatest.error_message ?? modalLatest.message ?? t('shelfNoEngineMsg'))
                                                    : t('shelfEmptyCompile')}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={compileJobId}
                                                    onChange={(event) => setCompileJobId(event.target.value)}
                                                    placeholder={t('shelfJobIdsPlaceholder')}
                                                    aria-label={t('shelfJobIdsLabel')}
                                                    disabled={isCompiling}
                                                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-black/40 border border-white/10 outline-none text-xs text-white placeholder:text-white/30 focus:border-white/25 disabled:opacity-50"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => void handleCompile()}
                                                    disabled={isCompiling}
                                                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-all disabled:opacity-50 shrink-0"
                                                    title={t('shelfCompileTitle')}
                                                >
                                                    {isCompiling ? t('shelfCompiling') : t('shelfCompile')}
                                                </button>
                                                {modalRetryable && modalLatest && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleRetry(modalLatest.id)}
                                                        disabled={isCompiling}
                                                        className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white text-xs font-medium flex items-center gap-2 transition-all disabled:opacity-50 shrink-0"
                                                        title={t('shelfRetryTitle')}
                                                    >
                                                        <FaArrowRotateLeft size={11} className={isCompiling ? 'animate-spin' : ''} />
                                                        <span>{t('shelfRetry')}</span>
                                                    </button>
                                                )}
                                            </div>
                                            {compileFeedback && (
                                                <p className="text-[11px] text-white/60 leading-relaxed break-words">
                                                    {compileFeedback}
                                                </p>
                                            )}
                                            {geminiReady === false && (
                                                <p className="text-[11px] text-amber-300/80">
                                                    {t('shelfNoGemini')}
                                                </p>
                                            )}

                                            {/* Propuesta de nuevo tomo detectada en este tomo (Fase 4) */}
                                            {candidates.filter((c) => c.volumeId === selectedVolume.id).map(({ compilationId, candidate }) => (
                                                <div
                                                    key={compilationId}
                                                    className="p-3.5 rounded-2xl bg-amber-500/[0.05] border border-amber-500/25 flex flex-col gap-1.5"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-mono font-bold uppercase text-amber-300 flex items-center gap-1.5">
                                                            <FaWandMagicSparkles size={11} />
                                                            {t('shelfSuggestionFound')}
                                                        </span>
                                                        <span className="text-[10px] font-mono text-white/40">
                                                            {t('shelfConfidence', { pct: Math.round((candidate.confidence ?? 0.85) * 100) })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs font-semibold text-white">
                                                        {t('shelfNewVolumeProposal', { title: candidate.suggested_title })}
                                                    </p>
                                                    <p className="text-[11px] text-white/60 leading-relaxed">
                                                        {candidate.rationale}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                                            {t('shelfChapters')}
                                        </span>
                                        <span className="text-[11px] text-white/40 font-mono">
                                            {isLoadingChapters ? t('shelfReading') : `${volumeChapters.length}`}
                                        </span>
                                    </div>

                                    {isPreview ? (
                                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                                            <p className="text-xs text-white/60">
                                                {t('shelfPreviewChapters')}
                                            </p>
                                        </div>
                                    ) : isLoadingChapters ? (
                                        <div className="h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
                                    ) : volumeChapters.length === 0 ? (
                                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                                            <p className="text-xs text-white/60">
                                                {t('shelfEmptyChapters')}
                                            </p>
                                        </div>
                                    ) : (
                                        <ol className="flex flex-col gap-1.5">
                                            {volumeChapters.map((chapter) => {
                                                const count = selectedArticles.filter(
                                                    (article) => article.chapter_id === chapter.id,
                                                ).length;
                                                return (
                                                    <li
                                                        key={chapter.id}
                                                        className="px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3"
                                                    >
                                                        <span className="text-[11px] font-mono font-bold text-white/40 shrink-0">
                                                            {String(chapter.ordinal + 1).padStart(2, '0')}
                                                        </span>
                                                        <span className="flex flex-col min-w-0">
                                                            <span className="text-[13px] font-semibold text-white/85 truncate">
                                                                {chapter.title}
                                                            </span>
                                                            {chapter.description && (
                                                                <span className="text-[11px] text-white/40 truncate">
                                                                    {chapter.description}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="ml-auto text-[11px] text-white/35 font-mono shrink-0">
                                                            {count === 1 ? t('shelfArticleOne', { count: 1 }) : t('shelfArticleMany', { count })}
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                            {selectedArticles.filter((article) => article.chapter_id === null
                                                || article.chapter_id === undefined).length > 0 && (
                                                <li className="px-4 py-2 rounded-xl bg-white/[0.01] border border-dashed border-white/10 flex items-center justify-between">
                                                    <span className="text-xs text-white/50">{t('shelfNoChapter')}</span>
                                                    <span className="text-[11px] text-white/35 font-mono">
                                                        {selectedArticles.filter((article) => article.chapter_id === null
                                                            || article.chapter_id === undefined).length}
                                                    </span>
                                                </li>
                                            )}
                                        </ol>
                                    )}
                                </div>

                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                                            {t('shelfVolumeArticles')}
                                        </span>
                                        <span className="text-[11px] text-white/40 font-mono">
                                            {isLoadingArticles ? t('shelfReading') : t('shelfVisibleCount', { count: selectedArticles.length })}
                                        </span>
                                    </div>

                                    {isPreview ? (
                                        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
                                            <p className="text-xs text-white/60">
                                                {t('shelfPreviewArticles')}
                                            </p>
                                        </div>
                                    ) : isLoadingArticles ? (
                                        <div className="flex flex-col gap-2">
                                            {[0, 1].map((skeleton) => (
                                                <div key={skeleton} className="h-16 rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
                                            ))}
                                        </div>
                                    ) : selectedArticles.length === 0 ? (
                                        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center flex flex-col items-center gap-2">
                                            <FaFileLines size={18} className="text-white/25" />
                                            <p className="text-xs text-white/60">
                                                {t('shelfEmptyArticles')}
                                            </p>
                                        </div>
                                    ) : (
                                        <ul className="flex flex-col gap-2">
                                            {selectedArticles.map((article) => (
                                                <li key={article.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => selectedVolume && openArticle(selectedVolume, article.id)}
                                                        className="w-full text-left p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] flex flex-col gap-1 transition-all"
                                                    >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[13px] font-semibold text-white/90 truncate">
                                                            {article.title}
                                                        </span>
                                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-white/60 shrink-0">
                                                            {presentEditorialState(article.editorial_state, locale)} · v{article.active_version}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-white/50 line-clamp-2 leading-relaxed">
                                                        {article.summary}
                                                    </p>
                                                    <span className="text-[10px] text-white/35 font-mono flex items-center gap-1.5">
                                                        <FaClock size={10} />
                                                        {presentArticleType(article.article_type, locale)} · {t('shelfOpenReader')}
                                                        <FaChevronRight size={9} className="text-white/25" />
                                                    </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between shrink-0">
                                <span className="text-xs text-white/50">
                                    {t('shelfTapHint')}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedVolume(null)}
                                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-all"
                                >
                                    {t('kioscoClose')}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
