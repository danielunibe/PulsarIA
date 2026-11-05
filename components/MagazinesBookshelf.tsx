'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { KioscoReader } from '@/components/KioscoReader';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { coverArtSVG, hashSeed, hexToHue } from '@/lib/kiosco';
import {
    FaArrowRotateLeft,
    FaBookOpen,
    FaChevronRight,
    FaMagnifyingGlass,
} from '@/components/icon-library';
import {
    fetchMagazineVolumes,
    filterMagazineVolumes,
    presentEditorialState,
    type MagazineVolumeView,
} from '@/lib/magazines';

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

/** Volúmenes de vista previa visual; nunca representan datos de SQLite. */
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

export function MagazinesBookshelf() {
    const { t, locale } = useI18n();
    const [volumes, setVolumes] = useState<MagazineVolumeView[]>([]);
    const [isPreview, setIsPreview] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [readerVolume, setReaderVolume] = useState<MagazineVolumeView | null>(null);
    const [openingVolumeId, setOpeningVolumeId] = useState<string | null>(null);
    const [reducedMotion, setReducedMotion] = useState(false);
    const requestSequenceRef = useRef(0);
    const openTimerRef = useRef<number | null>(null);
    const volumeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
    const lastOpenedVolumeIdRef = useRef<string | null>(null);

    const previewVolumes = useMemo(() => buildPreviewVolumes(t), [t]);

    const loadVolumes = useCallback(async () => {
        const sequence = ++requestSequenceRef.current;
        setIsLoading(true);
        setLoadError(null);
        try {
            const loaded = await fetchMagazineVolumes();
            if (sequence !== requestSequenceRef.current) return;
            setVolumes(loaded);
            setIsPreview(false);
        } catch (error) {
            if (sequence !== requestSequenceRef.current) return;
            if (error instanceof Error && error.message === 'preview-without-native-shell') {
                setVolumes(previewVolumes);
                setIsPreview(true);
            } else {
                setVolumes([]);
                setIsPreview(false);
                setLoadError(t('shelfLoadError'));
            }
        } finally {
            if (sequence === requestSequenceRef.current) setIsLoading(false);
        }
    }, [previewVolumes, t]);

    useEffect(() => {
        void loadVolumes();
        return () => {
            requestSequenceRef.current += 1;
            if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
        };
    }, [loadVolumes]);

    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReducedMotion(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);

    const filteredVolumes = useMemo(
        () => filterMagazineVolumes(volumes, searchQuery),
        [volumes, searchQuery],
    );

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await loadVolumes();
        } finally {
            setIsRefreshing(false);
        }
    }, [loadVolumes]);

    const openVolume = useCallback((volume: MagazineVolumeView) => {
        if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
        lastOpenedVolumeIdRef.current = volume.id;
        setOpeningVolumeId(volume.id);
        openTimerRef.current = window.setTimeout(() => {
            openTimerRef.current = null;
            setReaderVolume(volume);
            setOpeningVolumeId(null);
        }, reducedMotion ? 0 : 340);
    }, [reducedMotion]);

    const closeReader = useCallback(() => {
        const volumeId = lastOpenedVolumeIdRef.current;
        setReaderVolume(null);
        window.requestAnimationFrame(() => {
            if (volumeId) volumeButtonRefs.current.get(volumeId)?.focus();
        });
    }, []);

    const handleBookTilt = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        if (reducedMotion) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        event.currentTarget.style.setProperty('--tilt-y', (px * 7).toFixed(2) + 'deg');
        event.currentTarget.style.setProperty('--tilt-x', (-py * 7).toFixed(2) + 'deg');
    }, [reducedMotion]);

    const resetBookTilt = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.currentTarget.style.removeProperty('--tilt-x');
        event.currentTarget.style.removeProperty('--tilt-y');
    }, []);

    if (readerVolume) {
        return (
            <div className="relative h-full min-h-0 w-full overflow-hidden">
                <KioscoReader
                    key={readerVolume.id}
                    volume={readerVolume}
                    isPreview={isPreview}
                    onBack={closeReader}
                />
            </div>
        );
    }

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col overflow-y-auto p-4 font-sans lg:p-6">
            <div className="pointer-events-none absolute left-1/4 top-0 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
            <div className="pointer-events-none absolute right-1/4 top-1/3 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />

            <header className="relative z-10 flex shrink-0 flex-col gap-4 border-b border-white/[0.08] pb-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <span className="rounded-xl bg-white/[0.06] p-2 text-white/80">
                            <FaBookOpen size={18} />
                        </span>
                        <h1 className="text-xl font-bold tracking-tight text-white">
                            {t('shelfTitle')}
                        </h1>
                        {isPreview && (
                            <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-amber-300">
                                {t('shelfPreviewBadge')}
                            </span>
                        )}
                    </div>
                    <p className="max-w-2xl text-xs leading-relaxed text-white/50">
                        {t('shelfDescription')}
                    </p>
                </div>

                <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row xl:w-auto">
                    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/[0.05] px-3.5 py-2 text-white/70 sm:min-w-64 xl:flex-none">
                        <FaMagnifyingGlass size={12} className="shrink-0 text-white/40" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder={t('shelfSearchPlaceholder')}
                            aria-label={t('shelfSearchLabel')}
                            className="w-full bg-transparent text-xs text-white outline-none placeholder:text-white/30"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => void handleRefresh()}
                        disabled={isRefreshing || isLoading}
                        className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white/[0.05] px-3.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.1] disabled:opacity-50"
                        title={t('shelfReread')}
                    >
                        <FaArrowRotateLeft size={12} className={isRefreshing ? 'animate-spin text-sky-400' : 'text-white/60'} />
                        <span>{isRefreshing ? t('shelfReading') : t('shelfRefresh')}</span>
                    </button>
                </div>
            </header>

            {isPreview && (
                <p role="status" className="relative z-10 mt-4 text-xs text-amber-200/70">
                    {t('shelfOpenDesktop')}
                </p>
            )}

            {loadError && (
                <div role="alert" className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-400/[0.08] px-4 py-3 text-xs text-rose-100/80">
                    <span>{loadError}</span>
                    <button
                        type="button"
                        onClick={() => void handleRefresh()}
                        className="rounded-full bg-white/[0.08] px-3 py-1.5 font-semibold text-white hover:bg-white/[0.14]"
                    >
                        {t('shelfRefresh')}
                    </button>
                </div>
            )}

            <section className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 py-5" aria-labelledby="magazine-shelf-heading">
                <div className="flex items-center justify-between gap-4 px-1">
                    <h2 id="magazine-shelf-heading" className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/45">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-300/80" />
                        {t('shelfMainShelf')}
                    </h2>
                    <span className="shrink-0 text-[11px] font-mono text-white/35">
                        {isLoading ? t('shelfReading') : t('shelfVisibleCount', { count: filteredVolumes.length })}
                    </span>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-1 gap-6 px-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label={t('shelfReading')}>
                        {[0, 1, 2, 3].map((item) => (
                            <div key={item} className="h-72 rounded-2xl bg-white/[0.03] animate-pulse" />
                        ))}
                    </div>
                ) : loadError ? null : filteredVolumes.length === 0 ? (
                    <div className="mx-1 flex flex-col items-center gap-2 rounded-2xl bg-white/[0.02] p-10 text-center">
                        <FaBookOpen size={22} className="text-white/25" />
                        <p className="text-sm font-medium text-white/70">
                            {searchQuery.trim()
                                ? t('shelfEmptySearch', { query: searchQuery.trim() })
                                : t('shelfEmptyShelf')}
                        </p>
                        <p className="text-[11px] text-white/40">
                            {searchQuery.trim() ? t('shelfEmptySearchHint') : t('shelfSeedHint')}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-8 px-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {filteredVolumes.map((volume, cardIndex) => {
                            const seed = hashSeed(volume.id);
                            const hue = hexToHue(volume.color);
                            const coverSvg = coverArtSVG(seed, hue);
                            const isOpening = openingVolumeId === volume.id;
                            return (
                                <motion.button
                                    key={volume.id}
                                    ref={(node: HTMLButtonElement | null) => {
                                        if (node) volumeButtonRefs.current.set(volume.id, node);
                                        else volumeButtonRefs.current.delete(volume.id);
                                    }}
                                    type="button"
                                    initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                                    animate={{
                                        opacity: isOpening ? 0 : 1,
                                        y: isOpening ? -20 : 0,
                                        scale: isOpening ? 1.06 : 1,
                                    }}
                                    transition={reducedMotion
                                        ? { duration: 0 }
                                        : { type: 'spring', stiffness: 340, damping: 26, delay: (cardIndex % 8) * 0.04 }}
                                    onClick={() => openVolume(volume)}
                                    onMouseMove={handleBookTilt}
                                    onMouseLeave={resetBookTilt}
                                    onFocus={(event: React.FocusEvent<HTMLButtonElement>) => {
                                        event.currentTarget.style.setProperty('--tilt-x', '0deg');
                                        event.currentTarget.style.setProperty('--tilt-y', '0deg');
                                    }}
                                    className="group w-full rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#100e16]"
                                    aria-label={volume.volumeNumber + ' · ' + volume.title + ' · ' + t('shelfOpenVolume')}
                                >
                                    <span className="relative flex h-72 w-full overflow-hidden rounded-2xl shadow-[0_15px_35px_rgba(0,0,0,0.6)] transition-shadow duration-200 group-hover:shadow-[0_22px_48px_rgba(0,0,0,0.76)]">
                                        <span
                                            aria-hidden="true"
                                            className="z-10 flex w-8 shrink-0 flex-col items-center justify-between border-r border-white/10 py-4 shadow-[4px_0_14px_rgba(0,0,0,0.35)]"
                                            style={{ background: volume.spineGradient }}
                                        >
                                            <span className="h-1 w-4 rounded-full bg-white/25" />
                                            <span className="text-[9px] font-bold tracking-[0.24em] text-white/80 [writing-mode:vertical-rl] rotate-180">
                                                {volume.volumeNumber}
                                            </span>
                                            <span className="h-1 w-4 rounded-full bg-white/25" />
                                        </span>

                                        <span
                                            className="relative flex min-w-0 flex-1 flex-col overflow-hidden p-5"
                                            style={{
                                                background: volume.coverGradient,
                                                transform: 'perspective(900px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))',
                                            }}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="pointer-events-none absolute inset-0 opacity-45 transition-opacity duration-300 group-hover:opacity-70"
                                                dangerouslySetInnerHTML={{ __html: coverSvg }}
                                            />
                                            <span
                                                aria-hidden="true"
                                                className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,6,14,0.42)_0%,rgba(8,6,14,0.05)_40%,rgba(6,4,12,0.82)_100%)]"
                                            />
                                            <span
                                                aria-hidden="true"
                                                className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl opacity-40 transition-opacity duration-300 group-hover:opacity-70"
                                                style={{ background: volume.color }}
                                            />

                                            <span className="relative z-10 flex items-center justify-between gap-2">
                                                <span className="text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-white/55">
                                                    PULSARIA EDITORIAL
                                                </span>
                                                <span className="rounded-full bg-black/20 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.1em] text-white/65">
                                                    {presentEditorialState(volume.editorialState, locale)}
                                                </span>
                                            </span>

                                            <span className="relative z-10 my-auto flex flex-col gap-2 py-3">
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: volume.color }}>
                                                    {volume.volumeNumber}
                                                </span>
                                                <span className="text-base font-extrabold leading-tight tracking-tight text-white">
                                                    {volume.title}
                                                </span>
                                                <span className="line-clamp-2 min-h-[2.6em] text-[11px] leading-relaxed text-white/60">
                                                    {volume.subtitle}
                                                </span>
                                            </span>

                                            <span className="relative z-10 flex items-center justify-between gap-2 border-t border-white/[0.08] pt-3 text-[10px] text-white/55">
                                                <span className="truncate font-mono">
                                                    {volume.articleCount === 1
                                                        ? t('shelfArticleOne', { count: 1 })
                                                        : t('shelfArticleMany', { count: volume.articleCount })}
                                                </span>
                                                <FaChevronRight size={10} className="shrink-0 text-white/55 transition-transform group-hover:translate-x-1" />
                                            </span>
                                        </span>
                                    </span>
                                    <span
                                        aria-hidden="true"
                                        className="mt-2 block h-2.5 w-full rounded-md bg-gradient-to-r from-white/[0.03] via-white/[0.08] to-white/[0.03] shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                                    />
                                </motion.button>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
