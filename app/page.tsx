'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

import dynamic from 'next/dynamic';
import Image from 'next/image';

import { Sidebar } from '@/components/Sidebar';
import { Header, WindowTitlebar, type SearchMode } from '@/components/Header';

import { VideoGrid } from '@/components/VideoGrid';
import { SettingsPanel } from '@/components/SettingsPanel';
import { toast } from 'sonner';
import { useScrollParallax } from '@/hooks/useScrollParallax';
import { FaMagnifyingGlass, FaArrowLeft, FaBrain } from 'react-icons/fa6';

import { useSettings } from '@/lib/settings-context';
import { useI18n } from '@/lib/i18n';
import { AuroraBackground } from '@/components/AuroraBackground';
import { generateChatResponse } from '@/lib/local-llm';
import { generateGeminiChatResponse } from '@/lib/gemini';
import { useJobs, type JobRecord, isCompletedJob } from '@/hooks/use-jobs';
import { isTauriRuntime, useProcessingSettings } from '@/hooks/use-processing-settings';
import { ProcessingSetupModal } from '@/components/ProcessingSetupModal';
import { CinemaMode } from '@/components/CinemaMode';
import type { PageConfig, SortKey } from '@/components/PagePanel';
import type { CinemaVideo, VideoData } from '@/types';

type SearchVideoDetails = VideoData & {
    sourceState?: 'local' | 'online' | 'unavailable';
    favorite?: boolean;
    pinned?: boolean;
    protected?: boolean;
};

const ColorBends = dynamic(
    () => import('@/components/ColorBends').then((mod) => mod.ColorBends),
    { ssr: false }
);

const ExpandedVideoModal = dynamic(
    () => import('@/components/ExpandedVideoModal').then((mod) => mod.ExpandedVideoModal),
    { ssr: false }
);

interface SemanticSearchResult {

    video_id: number;
    title: string | null;
    thumbnail: string | null;
    matched_text: string;
    similarity_score: number;
}

const DEFAULT_PAGE_CONFIG: PageConfig = {
    layout: 'grid',
    columns: 0,
    sortKey: 'date_desc',
    showOnlyCompleted: true,
    showErrors: false,
    keepStatusFilter: 'all',
    platformFilter: 'all',
};

function formatJobDuration(value: unknown): string {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function loadPageConfig(): PageConfig {
    if (typeof window === 'undefined') return DEFAULT_PAGE_CONFIG;
    try {
        const saved = window.localStorage.getItem('pulsaria.page-config');
        if (!saved) return DEFAULT_PAGE_CONFIG;
        return { ...DEFAULT_PAGE_CONFIG, ...(JSON.parse(saved) as Partial<PageConfig>) };
    } catch {
        return DEFAULT_PAGE_CONFIG;
    }
}

export default function Page() {

    const { settings } = useSettings();
    const { t } = useI18n();
    const processingSetup = useProcessingSettings();
    const activeTheme = settings.theme || 'carbon';
    const [settingsOpen, setSettingsOpen] = useState(false);
    const settingsPanelRef = useRef<HTMLDivElement>(null);
    const [activeVideoId, setActiveVideoId] = useState<number | null>(null);
    const [cinemaOpen, setCinemaOpen] = useState(false);
    const [cinemaVideos, setCinemaVideos] = useState<CinemaVideo[]>([]);
    const {
        jobs,
        pending,
        globalProgress,
        enqueueLinks,
        retryJob,
        retryPending,
        loading: jobsLoading,
        ready: jobsReady,
        error: jobsError,
        refresh: refreshJobs,
    } = useJobs();
    const [basePath, setBasePath] = useState('');

    const completedJobs = jobs.filter((j: JobRecord) => {
        if (!isCompletedJob(j)) return false;
        // A completed job remains a library item when its large media has
        // been released, as long as the durable knowledge/ficha survives.
        return Boolean(
            j.video_path
            || j.keep_status === 'online'
            || j.source_state === 'online'
            || j.source_state === 'unavailable'
            || j.transcript_path
            || j.visual_analysis
            || j.instructional_guide
            || j.thumbnail
        );
    });
    // Failed/queued records are not library videos. Counting them here made
    // the header say "1 TikTok" while the gallery had no playable content.
    const jobCount = jobsReady
        ? completedJobs.length
        : 0;

        const [searchResults, setSearchResults] = useState<SemanticSearchResult[] | null>(null);
    const [searchMode, setSearchMode] = useState<SearchMode>('literal');
    const [searchModeUsed, setSearchModeUsed] = useState<SearchMode | null>(null);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [aiAnswer, setAiAnswer] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [lastSearchQuery, setLastSearchQuery] = useState('');
    const [geminiAnswer, setGeminiAnswer] = useState<string | null>(null);
    const [geminiError, setGeminiError] = useState<string | null>(null);
    const [geminiLoading, setGeminiLoading] = useState(false);

    const [isSearching, setIsSearching] = useState(false);

        const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
    const [pageConfig, setPageConfig] = useState<PageConfig>(loadPageConfig);

    const searchRequestRef = useRef(0);
    const scrollY = useScrollParallax(0.2);

    useEffect(() => {
        try {
            window.localStorage.setItem('pulsaria.page-config', JSON.stringify(pageConfig));
        } catch {
            // El almacenamiento puede estar deshabilitado en una WebView o navegador privado.
        }
    }, [pageConfig]);

    useEffect(() => {
        const panel = settingsPanelRef.current;
        if (!panel) return;
        (panel as HTMLDivElement & { inert: boolean }).inert = !settingsOpen;
    }, [settingsOpen]);

        useEffect(() => {
        (async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                setBasePath(await invoke<string>('get_base_path'));
            } catch {
                // En navegador puro los assets locales no están disponibles.
            }
        })();
    }, []);

    useEffect(() => {
        let mounted = true;
        let unlisten: (() => void) | undefined;
        import('@tauri-apps/api/event').then(({ listen }) => {
            if (!mounted) return;
            return listen<{ title?: string; job_id?: number; jobId?: number }>('job_completed_notify', (event) => {
                    toast.success('Video procesado', {
                        description: event.payload?.title || `Job #${event.payload?.job_id ?? event.payload?.jobId ?? 'desconocido'}`,
                        duration: 5000,
                    });
            }).then((fn) => {
                if (mounted) unlisten = fn;
                else fn();
            }).catch(() => {});
        }).catch(() => {});
        return () => {
            mounted = false;
            unlisten?.();
        };
    }, []);

    const handlePlayStart = useCallback((id: number) => {
        setActiveVideoId(id);
    }, []);

    const handlePlayStop = useCallback((id: number) => {
        if (activeVideoId === id) {
            setActiveVideoId(null);
        }
    }, [activeVideoId]);

        const handlePageConfigChange = useCallback((config: PageConfig) => {
        setPageConfig(config);
    }, []);

    const handleSortChange = useCallback((key: string) => {
        setPageConfig((current) => ({ ...current, sortKey: key as SortKey }));
    }, []);

    const handlePlaylistSelect = useCallback((id: number | null) => {
        setSelectedPlaylistId(id);
        setActiveVideoId(null);
        setCinemaOpen(false);
        setCinemaVideos([]);
        setSearchResults(null);
        setSearchError(null);
        setAiAnswer(null);
        setAiError(null);
        setLastSearchQuery('');
        setGeminiAnswer(null);
        setGeminiError(null);
        setGeminiLoading(false);
    }, []);

    const isSearchView = isSearching || searchResults !== null || searchError !== null || aiAnswer !== null || aiError !== null || geminiAnswer !== null || geminiError !== null;
    const canOpenCinema = !isSearchView && cinemaVideos.length > 0;
    const handleOpenCinema = useCallback(() => {
        if (!canOpenCinema) {
            toast.info(t('noVideosCinema'), {
                description: `${t('clearSearch')} o ${t('processContent').toLowerCase()}.`,
                duration: 3000,
            });
            return;
        }
        setSettingsOpen(false);
        setActiveVideoId(null);
        setCinemaOpen(true);
    }, [canOpenCinema, t]);

    const applyAiResponse = (answer: string) => {
        if (answer.startsWith('No fue posible consultar el modelo local:')) {
            setAiAnswer(null);
            setAiError(answer);
            return;
        }
        setAiError(null);
        setAiAnswer(answer);
    };

    const handleSearch = async (query: string, requestedMode: SearchMode = searchMode) => {
        const requestId = ++searchRequestRef.current;
        const normalizedQuery = query.trim();
        if (!normalizedQuery) {
            setSearchResults(null);
            setAiAnswer(null);
            setAiError(null);
            setLastSearchQuery('');
            setGeminiAnswer(null);
            setGeminiError(null);
            setIsSearching(false);
            return;
        }
                setIsSearching(true);

        setSearchError(null);
        setAiAnswer(null);
        setAiError(null);
        setLastSearchQuery(normalizedQuery);
        setGeminiAnswer(null);
        setGeminiError(null);

        try {
            let results: SemanticSearchResult[];
            const isTauri = typeof window !== 'undefined' && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                results = requestedMode === 'literal'
                    ? await invoke<SemanticSearchResult[]>('search_literal_transcripts', { query: normalizedQuery, limit: 10 })
                    : await invoke<SemanticSearchResult[]>('search_transcripts', { query: normalizedQuery, limit: 10 });
            } else {
                const { REST_API_BASE } = await import('@/lib/api-config');
                const endpoint = requestedMode === 'literal'
                    ? `${REST_API_BASE}/search/literal`
                    : `${REST_API_BASE}/search`;
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: normalizedQuery, limit: 10 }),
                });
                if (!response.ok) throw new Error(`Search failed with status ${response.status}`);
                const payload = await response.json() as { results?: SemanticSearchResult[] };
                results = payload.results ?? [];
            }
                        if (requestId !== searchRequestRef.current) return;
            setSearchResults(results);
            setSearchModeUsed(requestedMode);

            // Synthesize intelligent response with the local model

            if (results && results.length > 0) {
                const context = results.slice(0, 5).map(r => `Título: ${r.title || 'Video'}\nContenido del fragmento: ${r.matched_text}`);
                                generateChatResponse(normalizedQuery, context).then(ans => {
                    if (requestId === searchRequestRef.current) applyAiResponse(ans);
                }).catch((error) => {
                    if (requestId === searchRequestRef.current) setAiError(String(error));
                });

                                toast.success(`Búsqueda ${requestedMode === 'literal' ? 'literal' : 'semántica'} completada: ${results.length} coincidencias`, {
                    description: `Similitud máxima: ${(results[0].similarity_score * 100).toFixed(1)}%`
                });

            } else {
                                    generateChatResponse(normalizedQuery, []).then(ans => {
                        if (requestId === searchRequestRef.current) applyAiResponse(ans);
                    }).catch((error) => {
                        if (requestId === searchRequestRef.current) setAiError(String(error));
                    });

                toast.info("Sin coincidencias en transcripciones");
            }
                } catch (error) {
            console.error("Search failed:", error);
            if (requestId === searchRequestRef.current) {
                setSearchResults([]);
                setSearchError(error instanceof Error ? error.message : String(error));
            }
        } finally {

            if (requestId === searchRequestRef.current) setIsSearching(false);
        }

    };

    const handleGeminiSynthesis = useCallback(async () => {
        if (!lastSearchQuery || geminiLoading) return;
        setGeminiLoading(true);
        setGeminiAnswer(null);
        setGeminiError(null);
        try {
            const context = (searchResults ?? []).slice(0, 5).map((result) => (
                `Título: ${result.title || `Video #${result.video_id}`}\nContenido del fragmento: ${result.matched_text}`
            ));
            const answer = await generateGeminiChatResponse(lastSearchQuery, context);
            setGeminiAnswer(answer);
        } catch (error) {
            setGeminiError(error instanceof Error ? error.message : String(error));
        } finally {
            setGeminiLoading(false);
        }
    }, [geminiLoading, lastSearchQuery, searchResults]);

    const handleClearSearch = useCallback(() => {
        searchRequestRef.current += 1;
                setSearchResults(null);
        setSearchModeUsed(null);
        setSearchError(null);
        setAiAnswer(null);
        setAiError(null);
        setLastSearchQuery('');
        setGeminiAnswer(null);
        setGeminiError(null);
        setGeminiLoading(false);
        setIsSearching(false);
        setActiveVideoId(null);
    }, []);

    const handleSearchResultClick = useCallback((result: SemanticSearchResult) => {
        const job = jobs.find((candidate) => Number(candidate.id) === result.video_id);
        if (!job) {
            toast.error('El video ya no está disponible', {
                description: `No se encontró el job #${result.video_id} en la biblioteca local.`,
            });
            return;
        }
        if (isTauriRuntime()) {
            void import('@tauri-apps/api/core')
                .then(({ invoke }) => invoke('record_media_access', {
                    jobId: result.video_id,
                    accessKind: 'search',
                }))
                .catch(() => {
                    // Search navigation remains usable if telemetry is
                    // unavailable during a browser/native transition.
                });
        }
        setActiveVideoId(result.video_id);
    }, [jobs]);

    const [resolvedSearchVideo, setResolvedSearchVideo] = useState<SearchVideoDetails | null>(null);

    async function toAssetUrl(localPath: string | undefined | null): Promise<string | undefined> {
        if (!localPath) return undefined;
        if (localPath.startsWith('http://') || localPath.startsWith('https://')) return localPath;
        try {
            const { convertFileSrc } = await import('@tauri-apps/api/core');
            return convertFileSrc(localPath);
        } catch {
            return undefined;
        }
    }

    useEffect(() => {
        let cancelled = false;
        async function resolveVideo() {
            const result = searchResults?.find((r) => r.video_id === activeVideoId);
            const job = jobs.find((j) => Number(j.id) === activeVideoId);
            if (!result || !job) {
                if (!cancelled) setResolvedSearchVideo(null);
                return;
            }
            const thumb = await toAssetUrl(job.poster_path || job.thumbnail) || result.thumbnail || '';
            const videoSrc = await toAssetUrl(job.video_path) || '';
            if (!cancelled) {
                setResolvedSearchVideo({
                    id: job.id,
                    title: job.title || result.title || job.url,
                    author: job.author || 'desconocido',
                    duration: formatJobDuration(job.duration),
                    tags: [],
                    thumb,
                    videoSrc,
                    originalUrl: job.url,
                    visualAnalysis: job.visual_analysis,
                    instructionalGuide: job.instructional_guide,
                    sourceState: videoSrc
                        ? 'local'
                        : job.source_state === 'unavailable'
                            ? 'unavailable'
                            : job.source_state === 'online' || job.keep_status === 'online'
                                ? 'online'
                                : 'unavailable',
                    favorite: job.favorite,
                    pinned: job.pinned,
                    protected: job.protected,
                });
            }
        }
        resolveVideo();
        return () => { cancelled = true; };
    }, [activeVideoId, jobs, searchResults]);
    return (

        <div
            className="flex h-screen w-full flex-col font-sans overflow-hidden relative"
            style={{ 
                color: 'var(--text-strong)',
                // Keep the composition usable at the native Tauri minimum;
                // smaller viewports can scroll inside the panels instead of
                // forcing a desktop-only 1000x750 surface.
                minWidth: '860px',
                minHeight: '640px'
            }}
        >
            {/* Background Theme Renderer */}
            {activeTheme === 'chromatic' && (
                <div
                    className="fixed inset-[-10%] w-[120%] h-[120%] z-[-10] pointer-events-none bg-[#0a0a0a]"
                    style={{
                        transform: `translateY(${-scrollY}px) scale(1.1)`,
                        transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)'
                    }}
                >
                    <ColorBends
                        colors={["#ff5c7a", "#8a5cff", "#00ffd1"]}
                        rotation={0}
                        speed={0.2}
                        scale={1}
                        frequency={1}
                        warpStrength={1}
                        mouseInfluence={0.5}
                        parallax={0.25}
                        noise={0.1}
                        transparent={true}
                        autoRotate={0}
                    />
                </div>
            )}

            {activeTheme === 'carbon' && (
                <div className="fixed inset-0 z-[-10] pointer-events-none overflow-hidden bg-[#0a0b0e]">
                    {/* Ultra-smooth Luxury Charcoal Gradient Layers */}
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `
                                radial-gradient(ellipse 120% 80% at 20% 10%, rgba(38, 43, 56, 0.70) 0%, transparent 60%),
                                radial-gradient(ellipse 100% 70% at 80% 90%, rgba(24, 27, 36, 0.85) 0%, transparent 60%),
                                radial-gradient(ellipse 80% 80% at 50% 50%, rgba(17, 19, 25, 0.95) 0%, #07080a 100%)
                            `,
                        }}
                    />
                    {/* Deep Atmospheric Vignette */}
                    <div
                        className="absolute inset-0"
                        style={{
                            background: 'radial-gradient(ellipse 90% 85% at 50% 50%, transparent 40%, rgba(4, 5, 7, 0.88) 100%)'
                        }}
                    />
                </div>
            )}

            {activeTheme === 'aurora' && <AuroraBackground />}

            {activeTheme === 'oled' && (
                <div className="fixed inset-0 z-[-10] pointer-events-none bg-[#010103]">
                    <div
                        className="absolute inset-0"
                        style={{
                            background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,255,255,0.02) 0%, transparent 70%)'
                        }}
                    />
                </div>
            )}

            {activeTheme === 'cyberpunk' && (
                <div className="fixed inset-0 z-[-10] pointer-events-none bg-[#080512]">
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `
                                radial-gradient(ellipse 65% 55% at 15% 20%, rgba(168,85,247,0.2) 0%, transparent 55%),
                                radial-gradient(ellipse 70% 60% at 85% 80%, rgba(236,72,153,0.18) 0%, transparent 55%),
                                radial-gradient(ellipse 50% 40% at 50% 60%, rgba(37,244,238,0.12) 0%, transparent 60%)
                            `,
                        }}
                    />
                </div>
            )}

            {!cinemaOpen && <WindowTitlebar />}

            <div className="flex min-h-0 flex-1 w-full">
                {/* Sidebar Exclusivo Dashboard */}
                <Sidebar
                    jobs={jobs}
                    pending={pending}
                    globalProgress={globalProgress}
                    onSubmitLinks={enqueueLinks}
                    onRetryJob={retryJob}
                    onRetryPending={retryPending}
                    onPlaylistSelect={handlePlaylistSelect}
                    selectedPlaylistId={selectedPlaylistId}
                />

                {/* Main Content Area */}
                <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col min-w-0 relative z-10">
                <Header
                    onOpenSettings={() => setSettingsOpen(true)}
                    activeCount={jobCount}
                    isLoading={jobsLoading}
                    onSearchSubmit={handleSearch}
                    onSearchClear={handleClearSearch}
                    pageConfig={pageConfig}
                    onPageConfigChange={handlePageConfigChange}
                    onSortChange={handleSortChange}
                    sortKey={pageConfig.sortKey}
                    searchMode={searchMode}
                    onSearchModeChange={setSearchMode}
                    onOpenCinema={handleOpenCinema}
                    canOpenCinema={canOpenCinema}
                />

                {!jobsLoading && !jobsReady && (
                    <div role="alert" className="mx-8 mt-2 flex items-center justify-between gap-4 rounded-2xl border border-[#fe2c55]/25 bg-[#fe2c55]/[0.08] px-4 py-3 text-xs text-white/70">
                        <span>{jobsError || 'La biblioteca local no está disponible en este momento.'}</span>
                        <button
                            type="button"
                            onClick={() => void refreshJobs().catch(() => {})}
                            className="shrink-0 font-bold uppercase tracking-wider text-[#25f4ee] hover:text-white"
                        >
                            Reintentar
                        </button>
                    </div>
                )}

                {isSearching ? (
                    <div className="w-full h-full flex items-center justify-center p-8">
                        <div className="p-8 rounded-3xl bg-black/60 backdrop-blur-2xl border border-white/10 flex items-center gap-4 shadow-2xl">
                            <span className="w-6 h-6 rounded-full border-2 border-[#8a5cff] border-t-transparent animate-spin" />
                            <div className="flex flex-col">
                                <span className="text-white font-black text-sm tracking-wider uppercase">Búsqueda Inteligente IA</span>
                                <span className="text-white/40 text-xs font-mono">Inferencia semántica ONNX + síntesis LLM local...</span>
                            </div>
                        </div>
                    </div>
                                ) : (searchResults !== null || searchError !== null || aiAnswer !== null || aiError !== null) ? (

                    <div className="px-8 py-4 flex flex-col gap-5">
                        {/* Search View Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-6 w-1 rounded-full bg-gradient-to-b from-[#fe2c55] via-[#8a5cff] to-[#25f4ee]"></div>
                                <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                                    <span>{t('search')}</span>
                                </h2>
                            </div>
                                                        <button
                                type="button"
                                aria-label="Volver a la biblioteca"
                                onClick={handleClearSearch}
                                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/80 hover:text-white flex items-center gap-2 transition-all cursor-pointer shadow-sm"

                            >
                                <FaArrowLeft size={11} />
                                <span>{t('library')}</span>
                            </button>
                        </div>

                        {searchResults !== null && (
                            <section
                                aria-label="Síntesis opcional con Gemini"
                                className="flex flex-col gap-3 rounded-[20px] border border-[#4285f4]/25 bg-[#4285f4]/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8ab4f8]">Gemini opcional</p>
                                    <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-white/65">
                                        Solo se ejecuta cuando lo solicitas. Si lo activas, los fragmentos seleccionados de esta búsqueda se envían a Google para generar la síntesis y no se guardan como parte de la operación.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleGeminiSynthesis()}
                                    disabled={!isTauriRuntime() || geminiLoading || !lastSearchQuery}
                                    title={isTauriRuntime() ? 'Enviar los fragmentos seleccionados a Gemini' : 'Gemini requiere la aplicación de escritorio'}
                                    className="shrink-0 rounded-xl border border-[#4285f4]/40 bg-[#4285f4]/15 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#b9d4ff] transition-colors hover:bg-[#4285f4]/25 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {geminiLoading ? 'Generando…' : isTauriRuntime() ? 'Sintetizar con Gemini' : 'Solo app de escritorio'}
                                </button>
                            </section>
                        )}

                                                 {searchError && (
                            <div role="alert" className="p-4 rounded-[20px] border border-[#fe2c55]/30 bg-[#fe2c55]/10 text-sm text-[#fe2c55]">
                                No se pudo completar la búsqueda: {searchError}
                            </div>
                        )}

                        {/* AI Synthesized Answer Card */}
                        {aiError && (
                            <div role="alert" className="p-4 rounded-[20px] border border-[#fe2c55]/30 bg-[#fe2c55]/10 text-sm text-[#fe2c55]">
                                La síntesis IA no está disponible: {aiError}
                            </div>
                        )}
                        {geminiError && (
                            <div role="alert" className="p-4 rounded-[20px] border border-[#4285f4]/30 bg-[#4285f4]/10 text-sm text-[#b9d4ff]">
                                No se pudo completar la síntesis opcional de Gemini: {geminiError}
                            </div>
                        )}
                        {geminiAnswer && (
                            <div
                                className="rounded-[20px] border border-[#4285f4]/30 bg-[#101a2b]/85 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-[#4285f4]/40 bg-[#4285f4]/20 text-[#8ab4f8]">
                                        <FaBrain size={14} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black uppercase tracking-wider text-white">Síntesis Gemini solicitada</span>
                                        <span className="text-[9px] font-mono font-bold text-[#8ab4f8]">Fragmentos enviados bajo acción explícita · no persistidos por Pulsaria</span>
                                    </div>
                                </div>
                                <p className="mt-3 pl-1 text-xs font-medium leading-relaxed text-white/90 sm:text-[13px]">{geminiAnswer}</p>
                            </div>
                        )}
                        {aiAnswer && (

                            <div 
                                className="p-5 rounded-[20px] border flex flex-col gap-3 relative overflow-hidden"
                                style={{
                                    background: 'rgba(18, 14, 28, 0.85)',
                                    backdropFilter: 'blur(20px)',
                                    borderColor: 'rgba(138, 92, 255, 0.3)',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 25px rgba(138,92,255,0.1)'
                                }}
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-[10px] bg-[#8a5cff]/20 border border-[#8a5cff]/40 flex items-center justify-center text-[#8a5cff]">
                                        <FaBrain size={14} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black uppercase tracking-wider text-white">
                                            Síntesis de Inteligencia Artificial
                                        </span>
                                        <span className="text-[9px] text-[#8a5cff] font-mono font-bold">
                                            LLM local · los fragmentos no salen del equipo
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs sm:text-[13px] text-white/90 leading-relaxed font-medium pl-1">
                                    {aiAnswer}
                                </p>
                            </div>
                        )}

                        {/* Matched Video Fragments List */}
                        <div className="flex flex-col gap-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 px-1">
                                Coincidencias en Videos ({searchResults?.length || 0})
                            </span>
                            {searchResults && searchResults.map((result, idx) => (
                                                                <button
                                    type="button"
                                    key={idx}
                                    onClick={() => handleSearchResultClick(result)}
                                    className="w-full flex items-start gap-4 p-4 rounded-2xl cursor-pointer group transition-all duration-300 relative overflow-hidden bg-black/40 border border-white/10 hover:border-[#25f4ee]/40 hover:shadow-[0_10px_35px_rgba(37,244,238,0.1)] text-left"
                                >

                                    <div className="w-24 h-36 rounded-xl overflow-hidden shrink-0 shadow-lg border border-white/10 relative bg-black">
                                                                                <Image
                                            src={result.thumbnail || '/demo/demo-01.jpg'}
                                            alt={result.title || 'Video'}
                                            fill
                                            unoptimized
                                            sizes="96px"
                                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                                        />

                                    </div>
                                    <div className="flex-1 min-w-0 py-1">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="font-bold text-white text-base truncate max-w-[70%]">
                                                {result.title || `Video #${result.video_id}`}
                                            </h3>
                                            <span className="text-xs font-black tracking-wider text-[#25f4ee] px-2.5 py-1 rounded-lg bg-[#25f4ee]/10 border border-[#25f4ee]/30 font-mono shadow-[0_0_10px_rgba(37,244,238,0.15)]">
                                                SIMILITUD {(result.similarity_score * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="mt-2">
                                            <p className="text-xs text-white/70 leading-relaxed font-medium line-clamp-3 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                                                                                                «... {result.matched_text} ...»

                                            </p>
                                        </div>
                                    </div>
                                                                </button>
                            ))}

                                                        {searchResults && searchResults.length === 0 && !searchError && !aiAnswer && !aiError && (

                                <div className="text-center py-20 text-white/40 bg-black/30 rounded-3xl border border-white/5 flex flex-col items-center gap-3">
                                    <FaMagnifyingGlass size={32} className="text-white/20" />
                                    <span>No se encontraron fragmentos semánticos para esta consulta.</span>
                                                                        <button
                                        type="button"
                                        onClick={handleClearSearch}
                                        className="text-xs text-[#25f4ee] hover:underline"

                                    >
                                        Limpiar búsqueda
                                    </button>
                                </div>
                            )}
                                                </div>
                        {resolvedSearchVideo && (
                            <ExpandedVideoModal
                                key={`search-expanded-video-modal-${resolvedSearchVideo.id}`}
                                video={resolvedSearchVideo}
                                onClose={() => setActiveVideoId(null)}
                            />
                        )}
                    </div>
                ) : (
                    <>

                        {selectedPlaylistId !== null && (
                            <div className="mx-8 mt-2 mb-1 px-4 py-3 rounded-2xl border border-[#8a5cff]/25 bg-[#8a5cff]/10 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="w-2 h-2 rounded-full bg-[#8a5cff] shadow-[0_0_10px_#8a5cff] shrink-0" />
                                    <span className="text-xs text-white/80 truncate">Mostrando los videos de la playlist seleccionada</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handlePlaylistSelect(null)}
                                    className="text-[10px] font-bold uppercase tracking-wider text-[#25f4ee] hover:text-white transition-colors shrink-0"
                                >
                                    Ver biblioteca completa
                                </button>
                            </div>
                        )}
                        <VideoGrid
                            activeVideoId={activeVideoId}
                            onVideoPlayStart={handlePlayStart}
                            onVideoPlayStop={handlePlayStop}
                            sortKey={pageConfig.sortKey}
                            playlistId={selectedPlaylistId ?? undefined}
                            layout={pageConfig.layout}
                            columns={pageConfig.columns}
                            showOnlyCompleted={pageConfig.showOnlyCompleted}
                            showErrors={pageConfig.showErrors}
                            keepStatusFilter={pageConfig.keepStatusFilter}
                            platformFilter={pageConfig.platformFilter}
                            jobs={jobs}
                            jobsLoading={jobsLoading}
                            jobsReady={jobsReady}
                            onVisibleVideosChange={setCinemaVideos}
                        />
                    </>
                )}

                </main>
            </div>

            {cinemaOpen && (
                <CinemaMode
                    videos={cinemaVideos}
                    initialIndex={0}
                    onClose={() => setCinemaOpen(false)}
                />
            )}

            {/* Settings Modal Backdrop & Panel */}
            <div
                className="fixed inset-x-0 bottom-0 top-10 transition-all duration-300"
                style={{
                    zIndex: 40,
                    top: '40px',
                    background: settingsOpen ? 'rgba(0,0,0,0.6)' : 'transparent',
                    backdropFilter: settingsOpen ? 'blur(6px)' : 'none',
                    pointerEvents: settingsOpen ? 'auto' : 'none',
                }}
                onClick={() => setSettingsOpen(false)}
            />

            <div
                ref={settingsPanelRef}
                className="fixed right-0 bottom-0 top-10 w-[400px] xl:w-[440px] overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                aria-hidden={!settingsOpen}
                style={{
                    zIndex: 50,
                    top: '40px',
                    transform: settingsOpen ? 'translateX(0)' : 'translateX(100%)',
                    boxShadow: settingsOpen ? '-15px 0 60px rgba(0,0,0,0.9)' : 'none',
                    background: '#0e1017',
                    borderLeft: '1px solid rgba(255,255,255,0.12)',
                }}
            >
                            <SettingsPanel onClose={() => setSettingsOpen(false)} jobs={jobs} onPlaylistSelect={handlePlaylistSelect} />
            </div>

            {processingSetup.showSetup && (
                <ProcessingSetupModal
                    hardware={processingSetup.hardware}
                    processing={processingSetup.processing}
                    modelStatus={processingSetup.modelStatus}
                    loading={processingSetup.loading}
                    initializationError={processingSetup.initializationError}
                    preparationError={processingSetup.preparationError}
                    onSave={async (quality, setup) => {
                        return processingSetup.save(quality, settings.videoFit, setup);
                    }}
                    onCancelPreparation={async () => {
                        await processingSetup.cancelPreparation();
                    }}
                    onRetry={processingSetup.refresh}
                    onDismiss={processingSetup.dismissSetup}
                />
            )}
        </div>
    );
}

