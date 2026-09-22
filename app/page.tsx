'use client';

import { useState, useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';

import dynamic from 'next/dynamic';
import Image from 'next/image';

import { Sidebar, type GlobalSection } from '@/components/Sidebar';
import { Header, type SearchMode } from '@/components/Header';
import { AddLinks } from '@/components/AddLinks';
import { QueueSection } from '@/components/QueueSection';
import { NotificationsPopover } from '@/components/NotificationsPopover';
import { PlaylistsPanel } from '@/components/PlaylistsPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { SpotlightSearch } from '@/components/SpotlightSearch';

import { VideoGrid } from '@/components/VideoGrid';
import { toast } from 'sonner';
import { useScrollParallax } from '@/hooks/useScrollParallax';
import { FaMagnifyingGlass, FaArrowLeft, FaBrain } from '@/components/icon-library';

import { useSettings } from '@/lib/settings-context';
import { useI18n } from '@/lib/i18n';
import { AuroraBackground } from '@/components/AuroraBackground';
import { generateChatResponse } from '@/lib/local-llm';
import { generateGeminiChatResponse } from '@/lib/gemini';
import { useJobs, type JobRecord, isCompletedJob } from '@/hooks/use-jobs';
import { isTauriRuntime, useProcessingSettings } from '@/hooks/use-processing-settings';
import { ProcessingSetupModal } from '@/components/ProcessingSetupModal';
import { LegalConsentModal } from '@/components/LegalConsentModal';
import { WelcomeAnimation } from '@/components/WelcomeAnimation';
import { useLegalConsent } from '@/hooks/use-legal-consent';
import { CinemaMode } from '@/components/CinemaMode';
import type { PageConfig, SortKey } from '@/components/PagePanel';
import type { CinemaVideo, VideoData } from '@/types';
import { apiFetch } from '@/lib/api-client';
import { LocalizedErrorBoundary } from '@/components/ErrorBoundary';
import { ContextMenu, type PulsariaContextMenuAction, type PulsariaContextMenuKind } from '@/components/ContextMenu';

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

interface ContextMenuState {
    x: number;
    y: number;
    kind: PulsariaContextMenuKind;
    videoId?: number;
}

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

    const { settings, updateSettings } = useSettings();
    const { t } = useI18n();
    const processingSetup = useProcessingSettings();
    const legalConsent = useLegalConsent();
    // Resolve the native shell only after the first client render. Tauri is
    // detectable from `window`, so reading it during render makes the native
    // client tree differ from the SSR tree and triggers hydration failures.
    const [runtimeResolved, setRuntimeResolved] = useState(false);
    useEffect(() => {
        setRuntimeResolved(true);
    }, []);
    const nativeShell = runtimeResolved && isTauriRuntime();
    const legalGateReady = !nativeShell || legalConsent.accepted;
    const [welcomeAnimationVisible, setWelcomeAnimationVisible] = useState(false);
    const activeTheme = settings.theme || 'chromatic';
    const [activeSection, setActiveSection] = useState<GlobalSection>('home');
    const [homeResetSignal, setHomeResetSignal] = useState(0);
    const [layersVisible, setLayersVisible] = useState(true);
    const [legalReviewOpen, setLegalReviewOpen] = useState(false);
    const [activeVideoId, setActiveVideoId] = useState<number | null>(null);
    const [cinemaOpen, setCinemaOpen] = useState(false);
    const [cinemaPhase, setCinemaPhase] = useState<'idle' | 'entering' | 'open' | 'exiting'>('idle');
    const [cinemaInitialVideoId, setCinemaInitialVideoId] = useState<number | null>(null);
    const [cinemaVideos, setCinemaVideos] = useState<CinemaVideo[]>([]);
    const cinemaTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cinemaNativeFullscreenRef = useRef(false);
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

    useEffect(() => {
        if (!isTauriRuntime() || processingSetup.loading || !processingSetup.runtimeReady || !processingSetup.hardware || !processingSetup.processing) return;
        try {
            if (window.localStorage.getItem('pulsaria.welcome-animation.v1') === 'completed') return;
            setWelcomeAnimationVisible(true);
        } catch {
            setWelcomeAnimationVisible(true);
        }
    }, [processingSetup.hardware, processingSetup.loading, processingSetup.processing, processingSetup.runtimeReady]);

    const finishWelcomeAnimation = useCallback(() => {
        try {
            window.localStorage.setItem('pulsaria.welcome-animation.v1', 'completed');
        } catch {
            // A failed preference write must not trap the user in the animation.
        }
        setWelcomeAnimationVisible(false);
    }, []);

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
    const activityCount = pending.length + jobs.filter((job) => !['complete', 'completed', 'done'].includes(job.status.toLowerCase())).length;

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
    const [spotlightOpen, setSpotlightOpen] = useState(false);
    const [spotlightQuery, setSpotlightQuery] = useState('');

    const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
    const [pageConfig, setPageConfig] = useState<PageConfig>(loadPageConfig);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
        setCinemaPhase('idle');
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
    // Cinema se puede abrir desde la biblioteca, pero no desde una vista de
    // búsqueda. La lista ya incluye fichas online/no disponibles, así que no
    // depende de que la conversión de cada asset local haya terminado.
    const canOpenCinema = !isSearchView && cinemaVideos.length > 0;
    const enterCinemaWindowFullscreen = useCallback(async () => {
        if (!nativeShell) return;
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const currentWindow = getCurrentWindow();
            if (!(await currentWindow.isFullscreen())) {
                await currentWindow.setFullscreen(true);
                cinemaNativeFullscreenRef.current = true;
            }
        } catch (error) {
            // El viewport CSS sigue cubriendo toda la ventana aunque el host
            // no permita fullscreen nativo en una configuración concreta.
            console.warn('Could not enter Cinema fullscreen:', error);
        }
    }, [nativeShell]);

    const restoreCinemaWindow = useCallback(async () => {
        if (!nativeShell || !cinemaNativeFullscreenRef.current) return;
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().setFullscreen(false);
        } catch (error) {
            console.warn('Could not restore the native window after Cinema:', error);
        } finally {
            cinemaNativeFullscreenRef.current = false;
        }
    }, [nativeShell]);

    const handleOpenCinema = useCallback((videoId?: number) => {
        if (!canOpenCinema || cinemaOpen || cinemaPhase !== 'idle') return;
        if (cinemaTransitionTimerRef.current) clearTimeout(cinemaTransitionTimerRef.current);
        setActiveSection('home');
        setActiveVideoId(null);
        setCinemaInitialVideoId(videoId ?? null);
        setCinemaPhase('entering');
        setCinemaOpen(true);
        cinemaTransitionTimerRef.current = setTimeout(() => {
            setCinemaPhase('open');
            cinemaTransitionTimerRef.current = null;
        }, 760);
        void enterCinemaWindowFullscreen();
    }, [canOpenCinema, cinemaOpen, cinemaPhase, enterCinemaWindowFullscreen]);

    const openContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>, kind: PulsariaContextMenuKind, videoId?: number) => {
        const target = event.target;
        if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, kind, videoId });
    }, []);

    const closeContextMenu = useCallback(() => setContextMenu(null), []);

    const handleContextMenuAction = useCallback((action: PulsariaContextMenuAction) => {
        const selected = contextMenu;
        setContextMenu(null);
        if (!selected) return;

        switch (action) {
            case 'open':
                if (selected.videoId !== undefined) {
                    setActiveSection('home');
                    setSelectedPlaylistId(null);
                    setActiveVideoId(selected.videoId);
                }
                break;
            case 'cinema':
            case 'demo-preview':
                handleOpenCinema(selected.videoId);
                break;
            case 'copy-url': {
                const job = selected.videoId === undefined ? undefined : jobs.find((item) => item.id === selected.videoId);
                if (!job?.url) {
                    toast.info('Este preview DEMO no tiene una URL de biblioteca.');
                    break;
                }
                void navigator.clipboard?.writeText(job.url)
                    .then(() => toast.success('Enlace copiado'))
                    .catch(() => toast.error('No se pudo copiar el enlace'));
                break;
            }
            case 'hide-demos':
                updateSettings({ showDemoVideos: false });
                toast.info('Ejemplos DEMO ocultos');
                break;
            case 'quick-settings':
                setSpotlightOpen(false);
                setActiveSection('settings');
                setActiveVideoId(null);
                break;
            case 'sort-recent':
                handleSortChange('date_desc');
                toast.info('Biblioteca ordenada por recientes');
                break;
        }
    }, [contextMenu, handleOpenCinema, handleSortChange, jobs, updateSettings]);

    const handleCloseCinema = useCallback(() => {
        if (cinemaPhase === 'exiting') return;
        if (cinemaTransitionTimerRef.current) clearTimeout(cinemaTransitionTimerRef.current);
        setCinemaPhase('exiting');
        cinemaTransitionTimerRef.current = setTimeout(() => {
            setCinemaOpen(false);
            setCinemaPhase('idle');
            setCinemaInitialVideoId(null);
            cinemaTransitionTimerRef.current = null;
            void restoreCinemaWindow();
        }, 460);
    }, [cinemaPhase, restoreCinemaWindow]);

    useEffect(() => () => {
        if (cinemaTransitionTimerRef.current) clearTimeout(cinemaTransitionTimerRef.current);
    }, []);

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
                const response = await apiFetch(endpoint, {
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
        setSpotlightQuery('');
        setActiveVideoId(null);
    }, []);

    const handleOpenSpotlight = useCallback(() => {
        setSpotlightOpen(true);
    }, []);

    const handleCloseSpotlight = useCallback(() => {
        setSpotlightOpen(false);
    }, []);

    const handleSpotlightQueryChange = useCallback((query: string) => {
        setSpotlightQuery(query);
        if (!query.trim()) handleClearSearch();
    }, [handleClearSearch]);

    const handleReturnHome = useCallback(() => {
        setActiveSection('home');
        setHomeResetSignal((current) => current + 1);
        handlePlaylistSelect(null);
        handleClearSearch();
    }, [handleClearSearch, handlePlaylistSelect]);

    const handleGlobalNavigate = useCallback((section: GlobalSection) => {
        setSpotlightOpen(false);
        if (section === 'home') {
            handleReturnHome();
            return;
        }

        setActiveSection(section);
        setActiveVideoId(null);
        handleClearSearch();
        if (section !== 'library') {
            setSelectedPlaylistId(null);
        }
    }, [handleClearSearch, handleReturnHome]);

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
                .catch((error) => {
                    // Search navigation remains usable if telemetry is
                    // unavailable during a browser/native transition.
                    console.warn('Could not record search media access:', error);
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
    if (cinemaOpen) {
        return (
            <div className={`cinema-transition-host cinema-transition-host--${cinemaPhase}`}>
                <CinemaMode
                    videos={cinemaVideos}
                    initialVideoId={cinemaInitialVideoId ?? undefined}
                    onClose={handleCloseCinema}
                />
                {(cinemaPhase === 'entering' || cinemaPhase === 'exiting') && (
                    <div className="cinema-transition-veil" role="status" aria-live="polite">
                        <span className="sr-only">{cinemaPhase === 'entering' ? 'Entrando en modo Cinema…' : 'Saliendo de modo Cinema…'}</span>
                    </div>
                )}
            </div>
        );
    }

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
                <div className="fixed inset-0 z-[-10] pointer-events-none overflow-hidden bg-[#09090b]">
                    {/* Ultra-smooth Luxury Charcoal Gradient Layers */}
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `
                                radial-gradient(ellipse 120% 80% at 20% 10%, rgba(32, 32, 36, 0.70) 0%, transparent 60%),
                                radial-gradient(ellipse 100% 70% at 80% 90%, rgba(20, 20, 24, 0.85) 0%, transparent 60%),
                                radial-gradient(ellipse 80% 80% at 50% 50%, rgba(14, 14, 16, 0.95) 0%, #070708 100%)
                            `,
                        }}
                    />
                    {/* Deep Atmospheric Vignette */}
                    <div
                        className="absolute inset-0"
                        style={{
                            background: 'radial-gradient(ellipse 90% 85% at 50% 50%, transparent 40%, rgba(5, 5, 6, 0.88) 100%)'
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

            {activeTheme === 'solar' && (
                <div className="fixed inset-0 z-[-10] pointer-events-none bg-[#0d0705]">
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `
                                radial-gradient(ellipse 70% 60% at 20% 20%, rgba(234, 88, 12, 0.22) 0%, transparent 60%),
                                radial-gradient(ellipse 65% 55% at 85% 85%, rgba(245, 158, 11, 0.18) 0%, transparent 55%),
                                radial-gradient(ellipse 80% 70% at 50% 50%, rgba(69, 10, 10, 0.28) 0%, #080403 100%)
                            `,
                        }}
                    />
                </div>
            )}

            {/* Desenfoque progresivo inferior: difumina el contenido detrás sin
                dibujar una línea rígida que recorte la última fila. */}
            <div aria-hidden="true" className="library-bottom-blur" />

            <div
                className={`pulsaria-app-layout flex min-h-0 flex-1 w-full${spotlightOpen ? ' pulsaria-app-layout--spotlight-blurred' : ''}`}
                aria-hidden={spotlightOpen}
            >
                <Sidebar
                    activeSection={activeSection}
                    onNavigate={handleGlobalNavigate}
                    activityCount={activityCount}
                    onOpenSearch={handleOpenSpotlight}
                    onOpenCinema={handleOpenCinema}
                    canOpenCinema={canOpenCinema}
                    layersVisible={layersVisible}
                    onToggleLayers={() => setLayersVisible((visible) => !visible)}
                />

                {/* Main Content Area */}
                <main
                    className="cinema-shell-panel flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain custom-scrollbar flex flex-col relative z-10"
                    onContextMenu={(event) => openContextMenu(event, 'empty')}
                >
                <Header
                    activeCount={jobCount}
                    isLoading={jobsLoading}
                    onOpenSearch={handleOpenSpotlight}
                    showTikTokPill={settings.showTikTokPill}
                    onContextMenu={(event) => openContextMenu(event, 'shell')}
                />

                {!jobsLoading && !jobsReady && (
                    <div className="flex justify-center px-6 pt-3">
                        <div role="alert" className="flex w-full max-w-4xl items-center justify-center gap-4 rounded-full border border-[#fe2c55]/25 bg-[#fe2c55]/[0.08] px-5 py-2.5 text-center text-xs text-white/70 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl max-sm:flex-col max-sm:gap-2">
                            <span className="min-w-0 truncate">{jobsError || 'La biblioteca local no está disponible en este momento.'}</span>
                            <button
                                type="button"
                                onClick={() => void refreshJobs().catch((error) => console.warn('Manual job refresh failed:', error))}
                                className="shrink-0 font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                            >
                                Reintentar
                            </button>
                        </div>
                    </div>
                )}

                {isSearching ? (
                    <div className="w-full h-full flex items-center justify-center p-8">
                        <div className="p-8 rounded-3xl bg-[#141416]/80 backdrop-blur-2xl border border-white/10 flex items-center gap-4 shadow-2xl">
                            <span className="w-6 h-6 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
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
                                <div className="h-6 w-1 rounded-full bg-gradient-to-b from-[#fe2c55] to-white/70"></div>
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
                                        Solo se ejecuta cuando lo solicitas. Si lo activas, hasta cinco fragmentos relevantes de esta búsqueda se envían a Google para generar la síntesis y no se guardan localmente como parte de la operación.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleGeminiSynthesis()}
                                    disabled={!nativeShell || geminiLoading || !lastSearchQuery}
                                    title={nativeShell ? 'Enviar hasta cinco fragmentos relevantes a Gemini' : 'Gemini requiere la aplicación de escritorio'}
                                    className="shrink-0 rounded-xl border border-[#4285f4]/40 bg-[#4285f4]/15 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#b9d4ff] transition-colors hover:bg-[#4285f4]/25 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {geminiLoading ? 'Generando…' : nativeShell ? 'Sintetizar con Gemini' : 'Solo app de escritorio'}
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
                                            src={result.thumbnail || '/pulsaria-icon.png'}
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
                    <div className="pulsaria-workspace">
                        <aside className="pulsaria-context-pane" aria-label="Panel contextual">
                            {activeSection === 'home' && (
                                <div className="pulsaria-context-pane__scroll custom-scrollbar">
                                    <AddLinks
                                        mode="ingest"
                                        onSubmitLinks={enqueueLinks}
                                        homeResetSignal={homeResetSignal}
                                    />
                                    <QueueSection
                                        jobs={jobs}
                                        pending={pending}
                                        globalProgress={globalProgress}
                                        onRetryJob={retryJob}
                                        onRetryPending={retryPending}
                                    />
                                </div>
                            )}

                            {activeSection === 'profiles' && (
                                <div className="pulsaria-context-pane__scroll custom-scrollbar">
                                    <AddLinks mode="profiles" onSubmitLinks={enqueueLinks} />
                                </div>
                            )}

                            {activeSection === 'activity' && (
                                <div id="pulsaria-activity" className="pulsaria-context-pane__scroll custom-scrollbar">
                                    <NotificationsPopover
                                        jobs={jobs}
                                        pending={pending}
                                        onRetryJob={retryJob}
                                        onRetryPending={retryPending}
                                        onOpenLibrary={(jobId) => {
                                            handleClearSearch();
                                            setActiveSection('home');
                                            setSelectedPlaylistId(null);
                                            setActiveVideoId(jobId);
                                        }}
                                    />
                                </div>
                            )}

                            {activeSection === 'library' && (
                                <div className="pulsaria-context-pane__scroll custom-scrollbar">
                                    <PlaylistsPanel
                                        onPlaylistSelect={handlePlaylistSelect}
                                        selectedPlaylistId={selectedPlaylistId}
                                    />
                                </div>
                            )}

                            {activeSection === 'settings' && (
                                <div className="pulsaria-context-pane__settings">
                                    <SettingsPanel
                                        embedded
                                        jobs={jobs}
                                        onPlaylistSelect={handlePlaylistSelect}
                                        pageConfig={pageConfig}
                                        onPageConfigChange={handlePageConfigChange}
                                        searchMode={searchMode}
                                        onSearchModeChange={setSearchMode}
                                        onClose={() => handleGlobalNavigate('home')}
                                        onReviewConsent={() => setLegalReviewOpen(true)}
                                    />
                                </div>
                            )}
                        </aside>

                        <section className="pulsaria-library-stage" aria-label="Biblioteca de videos">
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
                            <LocalizedErrorBoundary>
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
                                    onOpenCinemaAt={handleOpenCinema}
                                    showDemoVideos={settings.showDemoVideos}
                                    hoverAutoplay={settings.hoverAutoplay}
                                    onContextMenu={(event, video) => openContextMenu(event, 'isDemo' in video && video.isDemo ? 'demo-card' : 'real-card', video.id)}
                                />
                            </LocalizedErrorBoundary>
                        </section>
                    </div>
                )}

                </main>
            </div>

            <SpotlightSearch
                open={spotlightOpen}
                query={spotlightQuery}
                onQueryChange={handleSpotlightQueryChange}
                onSubmit={() => void handleSearch(spotlightQuery, searchMode)}
                onClear={handleClearSearch}
                onClose={handleCloseSpotlight}
                searchMode={searchMode}
                isSearching={isSearching}
                searchResults={searchResults}
                searchError={searchError}
                aiAnswer={aiAnswer}
                aiError={aiError}
                onResultClick={(result) => {
                    setSpotlightOpen(false);
                    handleSearchResultClick(result);
                }}
            />

            {welcomeAnimationVisible && <WelcomeAnimation onFinish={finishWelcomeAnimation} />}

            {runtimeResolved && !welcomeAnimationVisible && nativeShell && (legalConsent.loading || legalConsent.needsConsent) && (
                <LegalConsentModal
                    loading={legalConsent.loading}
                    saving={legalConsent.saving}
                    error={legalConsent.error}
                    onAccept={legalConsent.accept}
                />
            )}

            {!welcomeAnimationVisible && legalReviewOpen && !legalConsent.loading && legalConsent.accepted && (
                <LegalConsentModal
                    loading={false}
                    saving={legalConsent.saving}
                    error={legalConsent.error}
                    allowClose
                    onClose={() => setLegalReviewOpen(false)}
                    onAccept={async (locale) => {
                        const accepted = await legalConsent.accept(locale);
                        if (accepted) setLegalReviewOpen(false);
                        return accepted;
                    }}
                />
            )}

            {runtimeResolved && nativeShell && legalGateReady && processingSetup.showSetup && (
                <ProcessingSetupModal
                    hardware={processingSetup.hardware}
                    processing={processingSetup.processing}
                    modelStatus={processingSetup.modelStatus}
                    modelSetupState={processingSetup.modelSetupState}
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
                    onRetryModel={processingSetup.retryModel}
                    onRepairModel={processingSetup.repairModel}
                    onDismiss={processingSetup.dismissSetup}
                />
            )}

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    kind={contextMenu.kind}
                    onAction={handleContextMenuAction}
                    onClose={closeContextMenu}
                />
            )}

        </div>
    );
}
