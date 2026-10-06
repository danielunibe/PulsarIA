'use client';

import { useState, useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import dynamic from 'next/dynamic';
import Image from 'next/image';

import { Sidebar, type GlobalSection } from '@/components/Sidebar';
import { Header, type SearchMode } from '@/components/Header';
import { AddLinks } from '@/components/AddLinks';
import { QueueSection } from '@/components/QueueSection';
import { ActivityCenter } from '@/components/ActivityCenter';
import { PlaylistsPanel } from '@/components/PlaylistsPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { MagazinesBookshelf } from '@/components/MagazinesBookshelf';
import { SpotlightSearch } from '@/components/SpotlightSearch';
import { LibraryBackdrop } from '@/components/LibraryBackdrop';

import { VideoGrid } from '@/components/VideoGrid';
import { StateDisplay } from '@/components/ui/StateDisplay';
import { toast } from 'sonner';
import { FaMagnifyingGlass, FaArrowLeft, FaBrain } from '@/components/icon-library';

import { useSettings } from '@/lib/settings-context';
import { useI18n } from '@/lib/i18n';
import { generateChatResponse } from '@/lib/local-llm';
import { generateGeminiChatResponse } from '@/lib/gemini';
import { useJobs, type JobRecord, type SubmitLinksResult, isCompletedJob, isFailedJob } from '@/hooks/use-jobs';
import type { SourceCollectionRecord } from '@/hooks/usePlaylists';
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
import { PlaylistPickerDialog } from '@/components/PlaylistPickerDialog';
import {
    formatSearchTimestamp,
    normalizeSearchMode,
    normalizeUnifiedResponse,
    searchModeLabel,
    type QueryContext,
    type UnifiedSearchRequest,
    type UnifiedSearchResponse,
    type UnifiedSearchResultGroup,
} from '@/lib/unified-search';

type SearchVideoDetails = VideoData & {
    sourceState?: 'local' | 'online' | 'unavailable';
    favorite?: boolean;
    pinned?: boolean;
    protected?: boolean;
};

const ExpandedVideoModal = dynamic(
    () => import('@/components/ExpandedVideoModal').then((mod) => mod.ExpandedVideoModal),
    { ssr: false }
);

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
    contentId?: number;
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

function loadSearchModePreference(): SearchMode {
    if (typeof window === 'undefined') return 'smart';
    try {
        return normalizeSearchMode(window.localStorage.getItem('pulsaria.search-mode'));
    } catch {
        return 'smart';
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
    // La ventana nativa es transparente (esquinas redondeadas reales): se
    // marca el documento para que el CSS aplique fondo transparente solo
    // en el shell Tauri; el preview web conserva su fondo sólido.
    useEffect(() => {
        if (typeof document === 'undefined') return;
        document.documentElement.dataset.native = nativeShell ? 'true' : 'false';
    }, [nativeShell]);
    const legalGateReady = !nativeShell || legalConsent.accepted;
    const [welcomeAnimationVisible, setWelcomeAnimationVisible] = useState(false);
    const activeTheme = settings.theme || 'chromatic';
    const [activeSection, setActiveSection] = useState<GlobalSection>('home');
    const [homeResetSignal, setHomeResetSignal] = useState(0);
    const [focusAddLinksSignal, setFocusAddLinksSignal] = useState(0);
    const [firstVideoJobId, setFirstVideoJobId] = useState<number | null>(null);
    const [backgroundVisible, setBackgroundVisible] = useState(true);
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
    const firstVideoJob = firstVideoJobId === null ? null : jobs.find((job) => job.id === firstVideoJobId) ?? null;
    const firstVideoReady = firstVideoJob !== null && completedJobs.some((job) => job.id === firstVideoJob.id);
    // Failed/queued records are not library videos. Counting them here made
    // the header say "1 TikTok" while the gallery had no playable content.
    const jobCount = jobsReady
        ? completedJobs.length
        : 0;
    const activityCount = pending.length + jobs.filter((job) => !['complete', 'completed', 'done'].includes(job.status.toLowerCase())).length;

    const [searchResults, setSearchResults] = useState<UnifiedSearchResultGroup[] | null>(null);
    const [searchResponse, setSearchResponse] = useState<UnifiedSearchResponse | null>(null);
    const [searchContext, setSearchContext] = useState<QueryContext | null>(null);
    const [searchMode, setSearchMode] = useState<SearchMode>('smart');
    const [searchModeHydrated, setSearchModeHydrated] = useState(false);
    const [searchModeUsed, setSearchModeUsed] = useState<SearchMode | null>(null);
    const [searchStartTime, setSearchStartTime] = useState<number | null>(null);
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
    const [selectedSourceCollection, setSelectedSourceCollection] = useState<SourceCollectionRecord | null>(null);
    const [pageConfig, setPageConfig] = useState<PageConfig>(loadPageConfig);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [playlistPickerTarget, setPlaylistPickerTarget] = useState<{ jobId?: number; contentId?: number } | null>(null);

    const searchRequestRef = useRef(0);

    useEffect(() => {
        try {
            window.localStorage.setItem('pulsaria.page-config', JSON.stringify(pageConfig));
        } catch {
            // El almacenamiento puede estar deshabilitado en una WebView o navegador privado.
        }
    }, [pageConfig]);

    useEffect(() => {
        setSearchMode(loadSearchModePreference());
        setSearchModeHydrated(true);
    }, []);

    useEffect(() => {
        if (!searchModeHydrated) return;
        try {
            window.localStorage.setItem('pulsaria.search-mode', searchMode);
        } catch {
            // Search remains usable when preference storage is unavailable.
        }
    }, [searchMode, searchModeHydrated]);

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
        setSelectedSourceCollection(null);
        setActiveVideoId(null);
        setCinemaOpen(false);
        setCinemaPhase('idle');
        setCinemaVideos([]);
        setSearchResults(null);
        setSearchResponse(null);
        setSearchContext(null);
        setSearchStartTime(null);
        setSearchModeUsed(null);
        setSearchError(null);
        setAiAnswer(null);
        setAiError(null);
        setLastSearchQuery('');
        setGeminiAnswer(null);
        setGeminiError(null);
        setGeminiLoading(false);
    }, []);

    const handleSourceCollectionSelect = useCallback((collection: SourceCollectionRecord | null) => {
        setSelectedSourceCollection(collection);
        setSelectedPlaylistId(null);
        setActiveVideoId(null);
        setCinemaOpen(false);
        setCinemaPhase('idle');
        setCinemaVideos([]);
        setSearchResults(null);
        setSearchResponse(null);
        setSearchContext(null);
        setSearchStartTime(null);
        setSearchModeUsed(null);
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
        const transitionDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 760;
        cinemaTransitionTimerRef.current = setTimeout(() => {
            setCinemaPhase('open');
            cinemaTransitionTimerRef.current = null;
        }, transitionDuration);
        void enterCinemaWindowFullscreen();
    }, [canOpenCinema, cinemaOpen, cinemaPhase, enterCinemaWindowFullscreen]);

    const openContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>, kind: PulsariaContextMenuKind, videoId?: number, contentId?: number) => {
        const target = event.target;
        if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, kind, videoId, contentId });
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
                    setSelectedSourceCollection(null);
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
            case 'add-to-playlist':
                if (selected.contentId !== undefined) {
                    setPlaylistPickerTarget({ contentId: selected.contentId });
                    break;
                }
                if (selected.videoId === undefined || selected.videoId < 0) {
                    toast.info('Este contenido todavía no tiene una identidad agregable.');
                    break;
                }
                setPlaylistPickerTarget({ jobId: selected.videoId });
                break;
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
        const transitionDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 460;
        cinemaTransitionTimerRef.current = setTimeout(() => {
            setCinemaOpen(false);
            setCinemaPhase('idle');
            setCinemaInitialVideoId(null);
            cinemaTransitionTimerRef.current = null;
            void restoreCinemaWindow();
        }, transitionDuration);
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
            setSearchResponse(null);
            setSearchContext(null);
            setAiAnswer(null);
            setAiError(null);
            setLastSearchQuery('');
            setGeminiAnswer(null);
            setGeminiError(null);
            setIsSearching(false);
            setSearchStartTime(null);
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
            const request: UnifiedSearchRequest = {
                query: normalizedQuery,
                mode: normalizeSearchMode(requestedMode),
                limit: 10,
                context: searchContext,
            };
            let response: UnifiedSearchResponse;
            const isTauri = typeof window !== 'undefined'
                && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                response = await invoke<UnifiedSearchResponse>('search_library', { request });
            } else {
                const { REST_API_BASE } = await import('@/lib/api-config');
                const rawResponse = await apiFetch(`${REST_API_BASE}/search/unified`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(request),
                });
                if (!rawResponse.ok) throw new Error(`Search failed with status ${rawResponse.status}`);
                response = normalizeUnifiedResponse(await rawResponse.json() as Partial<UnifiedSearchResponse>);
            }
            const normalizedResponse = normalizeUnifiedResponse(response);
            if (requestId !== searchRequestRef.current) return;
            const threshold = typeof settings.minScore === 'number' && Number.isFinite(settings.minScore) ? settings.minScore : 0.45;
            const filteredResults = normalizedResponse.results.filter(
                (result) => result.score >= threshold || result.primaryMoment.representation !== 'summary'
            );
            setSearchResponse({ ...normalizedResponse, results: filteredResults });
            setSearchResults(filteredResults);
            setSearchContext(normalizedResponse.context);
            setSearchModeUsed(normalizedResponse.mode);

            const results = normalizedResponse.results;
            const synthesisContext = results.slice(0, 5).map((result) => (
                `Título: ${result.title || `Video #${result.jobId}`}\nContenido del fragmento: ${result.primaryMoment.excerpt}`
            ));
            generateChatResponse(normalizedQuery, synthesisContext).then((answer) => {
                if (requestId === searchRequestRef.current) applyAiResponse(answer);
            }).catch((error) => {
                if (requestId === searchRequestRef.current) setAiError(String(error));
            });

            if (results.length > 0) {
                const degraded = !normalizedResponse.capabilities.vector && normalizedResponse.mode !== 'exact';
                toast.success(`Búsqueda ${searchModeLabel(normalizedResponse.mode)} completada: ${results.length} videos`, {
                    description: degraded
                        ? 'Coincidencias literales y estructuradas disponibles; el índice conceptual no está activo.'
                        : 'Resultados agrupados por video con momentos accionables.',
                });
            } else {
                toast.info('No se encontraron recuerdos con esos criterios');
            }
        } catch (error) {
            if (error instanceof TypeError) {
                console.warn('Search unavailable: the local library could not be reached.', error);
            } else {
                console.error('Search failed:', error);
            }
            if (requestId === searchRequestRef.current) {
                setSearchResults(null);
                setSearchResponse(null);
                setSearchContext(null);
                setSearchModeUsed(null);
                setSearchError(error instanceof TypeError
                    ? t('searchConnectionError')
                    : error instanceof Error ? error.message : String(error));
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
                `Título: ${result.title || `Video #${result.jobId}`}\nContenido del fragmento: ${result.primaryMoment.excerpt}`
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
        setSearchResponse(null);
        setSearchContext(null);
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
        setSearchStartTime(null);
    }, []);

    const handleOpenSpotlight = useCallback(() => {
        setSpotlightOpen(true);
    }, []);

    const handleCloseSpotlight = useCallback(() => {
        setSpotlightOpen(false);
        // A closed search starts a fresh refinement session. Results can stay
        // visible in the main view, but the next query must not inherit it.
        setSearchContext(null);
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
            setSelectedSourceCollection(null);
        }
    }, [handleClearSearch, handleReturnHome]);

    const enqueueHomeLinks = useCallback(async (urls: string[]): Promise<SubmitLinksResult> => {
        const result = await enqueueLinks(urls);
        if (firstVideoJobId === null) {
            const acceptedJobId = result.accepted.find((item) => typeof item.jobId === 'number')?.jobId;
            if (typeof acceptedJobId === 'number') setFirstVideoJobId(acceptedJobId);
        }
        return result;
    }, [enqueueLinks, firstVideoJobId]);

    const dismissProcessingSetup = processingSetup.dismissSetup;
    const continueToFirstVideo = useCallback(() => {
        dismissProcessingSetup();
        handleGlobalNavigate('home');
        setFocusAddLinksSignal((current) => current + 1);
    }, [dismissProcessingSetup, handleGlobalNavigate]);

    const handleSearchResultClick = useCallback((result: UnifiedSearchResultGroup) => {
        const job = jobs.find((candidate) => Number(candidate.id) === result.jobId);
        if (!job) {
            toast.error('El video ya no está disponible', {
                description: `No se encontró el job #${result.jobId} en la biblioteca local.`,
            });
            return;
        }
        if (isTauriRuntime()) {
            void import('@tauri-apps/api/core')
                .then(({ invoke }) => invoke('record_media_access', {
                    jobId: result.jobId,
                    accessKind: 'search',
                }))
                .catch((error) => {
                    // Search navigation remains usable if telemetry is
                    // unavailable during a browser/native transition.
                    console.warn('Could not record search media access:', error);
                });
        }
        setSearchStartTime(result.primaryMoment.startTime ?? null);
        setActiveVideoId(result.jobId);
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
            const result = searchResults?.find((r) => r.jobId === activeVideoId);
            const job = jobs.find((j) => Number(j.id) === activeVideoId);
            if (!result || !job) {
                if (!cancelled) setResolvedSearchVideo(null);
                return;
            }
            const thumb = await toAssetUrl(job.poster_path || job.thumbnail) || result.primaryMoment.matchThumbnail || result.thumbnail || '';
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
            className="pulsaria-window-frame flex h-screen w-full flex-col font-sans overflow-hidden relative rounded-[22px]"
            style={{ 
                color: 'var(--text-strong)',
                // Keep the composition usable at the native Tauri minimum;
                // smaller viewports can scroll inside the panels instead of
                // forcing a desktop-only 1000x750 surface.
                minWidth: '860px',
                minHeight: '640px'
            }}
        >
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
                    backgroundVisible={backgroundVisible}
                    onToggleBackground={() => setBackgroundVisible((visible) => !visible)}
                    showDemoVideos={settings.showDemoVideos}
                    onToggleDemoVideos={() => updateSettings({ showDemoVideos: !settings.showDemoVideos })}
                    onToggleTikTokPill={() => updateSettings({ showTikTokPill: !settings.showTikTokPill })}
                    pageConfig={pageConfig}
                    onPageConfigChange={handlePageConfigChange}
                    onContextMenu={(event) => openContextMenu(event, 'shell')}
                />

                {/* Transición premium entre pantallas: fundido + elevación leve. */}
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={isSearching ? 'searching' : (searchResults !== null || searchError !== null || aiAnswer !== null || aiError !== null) ? 'search' : activeSection}
                        className="flex min-h-0 min-w-0 flex-1 flex-col"
                        initial={{ opacity: 0, y: 16, scale: 0.992 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.996 }}
                        transition={{
                            duration: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.01 : 0.32,
                            ease: [0.22, 1, 0.36, 1],
                        }}
                    >
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

                    <div className="px-5 py-3 flex flex-col gap-4">
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

                        {searchResults !== null && !searchError && (
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

                        {/* Resultados agrupados por video con provenance y momentos accionables */}
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                                    Recuerdos encontrados ({searchResults?.length || 0})
                                </span>
                                {searchModeUsed && (
                                    <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white/45">
                                        {searchModeLabel(searchModeUsed)}
                                    </span>
                                )}
                            </div>
                            {searchResponse && !searchResponse.capabilities.vector && searchModeUsed !== 'exact' && (
                                <p className="rounded-xl border border-[#f6c453]/20 bg-[#f6c453]/[0.06] px-3 py-2 text-[10px] leading-relaxed text-[#f5d98c]">
                                    El índice conceptual no está disponible; mostramos coincidencias literales y estructuradas sin convertirlo en un error global.
                                </p>
                            )}
                            {searchResults && searchResults.map((result, idx) => (
                                <button
                                    type="button"
                                    key={`${result.jobId}-${idx}`}
                                    onClick={() => handleSearchResultClick(result)}
                                    className="group relative flex w-full items-start gap-4 overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-4 text-left transition-all duration-300 hover:border-[#25f4ee]/40 hover:shadow-[0_10px_35px_rgba(37,244,238,0.1)]"
                                >
                                    <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black shadow-lg">
                                        <Image
                                            src={result.primaryMoment.matchThumbnail || result.thumbnail || '/pulsaria-icon.png'}
                                            alt={result.title || 'Video'}
                                            fill
                                            unoptimized
                                            sizes="96px"
                                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1 py-1">
                                        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                                            <h3 className="max-w-[70%] truncate text-base font-bold text-white">
                                                {result.title || `Video #${result.jobId}`}
                                            </h3>
                                            <span className="rounded-lg border border-[#25f4ee]/25 bg-[#25f4ee]/[0.08] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[#7df8ef]">
                                                {formatSearchTimestamp(result.primaryMoment.startTime) || 'Ficha'}
                                            </span>
                                        </div>
                                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                                            {result.provenance.map((source) => (
                                                <span key={source.representation} className="rounded-md border border-white/[0.10] bg-white/[0.04] px-1.5 py-1 text-[9px] font-bold text-white/55">
                                                    {source.label}
                                                </span>
                                            ))}
                                            {result.relationshipBadges.map((badge) => (
                                                <span key={badge} className="rounded-md border border-[#8a5cff]/25 bg-[#8a5cff]/[0.08] px-1.5 py-1 text-[9px] font-bold text-[#c5b4ff]">
                                                    {badge}
                                                </span>
                                            ))}
                                        </div>
                                        <p className="line-clamp-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-xs font-medium leading-relaxed text-white/70">
                                            «… {result.primaryMoment.excerpt} …»
                                        </p>
                                        {result.moments.length > 1 && (
                                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] font-mono font-bold text-white/45">
                                                <span className="mr-1 uppercase tracking-wider text-white/30">Otros momentos</span>
                                                {result.moments.slice(0, 3).map((moment) => (
                                                    <span key={moment.unitId} className="rounded-md bg-white/[0.06] px-1.5 py-1">
                                                        {formatSearchTimestamp(moment.startTime) || '—'}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}

                            {searchResults && searchResults.length === 0 && !searchError && !aiAnswer && !aiError && (
                                <StateDisplay
                                    variant="empty"
                                    title="No se encontraron recuerdos"
                                    description="Prueba con otros criterios de búsqueda."
                                    actionLabel="Limpiar búsqueda"
                                    onAction={handleClearSearch}
                                    className="col-span-full mx-auto my-8 max-w-md"
                                />
                            )}
                        </div>
                        <AnimatePresence initial={false}>
                            {resolvedSearchVideo && (
                                <ExpandedVideoModal
                                    key={`search-expanded-video-modal-${resolvedSearchVideo.id}`}
                                    video={resolvedSearchVideo}
                                    initialTime={searchStartTime ?? undefined}
                                    sourceLayout={false}
                                    onClose={() => setActiveVideoId(null)}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                ) : activeSection === 'magazines' ? (
                    <div className="flex-1 w-full min-h-0 overflow-hidden flex flex-col">
                        <MagazinesBookshelf />
                    </div>
                ) : activeSection === 'settings' ? (
                    <div className="flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar p-4 lg:p-6 bg-black/40">
                        <div className="w-full max-w-5xl mx-auto">
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
                                setupPending={nativeShell && processingSetup.needsSetup}
                                onResumeSetup={processingSetup.resumeSetup}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="pulsaria-workspace">
                        <aside className="pulsaria-context-pane" aria-label="Panel contextual">
                            {activeSection === 'home' && (
                                <div className="pulsaria-context-pane__scroll custom-scrollbar">
                                    {runtimeResolved && nativeShell && processingSetup.needsSetup && (
                                        <div className="mx-3 mt-3 rounded-2xl bg-white/[0.045] px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#25f4ee]">{t('onboardingResume')}</p>
                                                    <p className="mt-1 text-[11px] leading-relaxed text-white/55">{t('onboardingResumeDescription')}</p>
                                                </div>
                                                <button type="button" onClick={processingSetup.resumeSetup} className="shrink-0 rounded-full bg-[#25f4ee]/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#25f4ee] transition hover:bg-[#25f4ee]/16 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#25f4ee]">
                                                    {t('onboardingResume')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {firstVideoJobId !== null && (
                                        <p role="status" className="mx-3 mt-3 rounded-2xl bg-[#8a5cff]/[0.08] px-4 py-3 text-[11px] leading-relaxed text-white/70 shadow-[0_12px_32px_rgba(0,0,0,0.16)] backdrop-blur-xl">
                                            {firstVideoReady
                                                ? t('onboardingFirstVideoReady')
                                                : firstVideoJob && isFailedJob(firstVideoJob)
                                                    ? t('onboardingFirstVideoFailed')
                                                    : firstVideoJob && isCompletedJob(firstVideoJob)
                                                        ? t('onboardingFirstVideoAwaitLibrary')
                                                        : firstVideoJob
                                                            ? t('onboardingFirstVideoProcessing')
                                                            : t('onboardingFirstVideoAccepted')}
                                        </p>
                                    )}
                                    <AddLinks
                                        mode="ingest"
                                        onSubmitLinks={enqueueHomeLinks}
                                        homeResetSignal={homeResetSignal}
                                        focusSignal={focusAddLinksSignal}
                                        runtimeReady={!nativeShell || processingSetup.runtimeReady}
                                        runtimeIssue={!nativeShell || processingSetup.runtimeReady ? null : t('onboardingIngestUnavailable')}
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
                                    <ActivityCenter
                                        jobs={jobs}
                                        pending={pending}
                                        loading={jobsLoading}
                                        ready={jobsReady}
                                        error={jobsError}
                                        onRetryJob={retryJob}
                                        onRetryPending={retryPending}
                                        onRefresh={() => void refreshJobs()}
                                        globalProgress={globalProgress}
                                        onOpenLibrary={(jobId) => {
                                             handleClearSearch();
                                             setActiveSection('home');
                                             setSelectedPlaylistId(null);
                                             setSelectedSourceCollection(null);
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
                                        onSourceCollectionSelect={handleSourceCollectionSelect}
                                        selectedSourceCollection={selectedSourceCollection}
                                    />
                                </div>
                            )}
                        </aside>

                        <section className="pulsaria-library-stage" aria-label="Biblioteca de videos">
                            <div className="pulsaria-library-stage__content">
                            {!jobsLoading && !jobsReady && (
                                <div className="pulsaria-window-header__status-row" role="alert">
                                    <div className="pulsaria-window-header__status">
                                        <span className="pulsaria-window-header__status-message">
                                            {jobsError || 'No pudimos conectar con la biblioteca local. Comprueba que Pulsaria siga ejecutándose y vuelve a intentarlo.'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => void refreshJobs().catch((error) => console.warn('Manual job refresh failed:', error))}
                                            className="pulsaria-window-header__status-action"
                                        >
                                            Reintentar
                                        </button>
                                    </div>
                                </div>
                            )}
                            {(selectedPlaylistId !== null || selectedSourceCollection !== null) && (
                                <div className="mx-8 mt-2 mb-1 px-4 py-3 rounded-2xl border border-[#8a5cff]/25 bg-[#8a5cff]/10 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="w-2 h-2 rounded-full bg-[#8a5cff] shadow-[0_0_10px_#8a5cff] shrink-0" />
                                        <span className="text-xs text-white/80 truncate">
                                            {selectedSourceCollection
                                                ? `Mostrando ${selectedSourceCollection.name} · ${selectedSourceCollection.channel_kind}`
                                                : 'Mostrando los videos de la playlist seleccionada'}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            handlePlaylistSelect(null);
                                            handleSourceCollectionSelect(null);
                                        }}
                                        className="text-[10px] font-bold uppercase tracking-wider text-[#25f4ee] hover:text-white transition-colors shrink-0"
                                    >
                                        Ver biblioteca completa
                                    </button>
                                </div>
                            )}
                            <div className="pulsaria-library-card-field">
                            {backgroundVisible && <LibraryBackdrop theme={activeTheme} />}
                            <LocalizedErrorBoundary>
                                <VideoGrid
                                    activeVideoId={activeVideoId}
                                    onVideoPlayStart={handlePlayStart}
                                    onVideoPlayStop={handlePlayStop}
                                    sortKey={pageConfig.sortKey}
                                    playlistId={selectedPlaylistId ?? undefined}
                                    sourceCollection={selectedSourceCollection ? {
                                        sourceId: selectedSourceCollection.profile_source_id,
                                        channelKind: selectedSourceCollection.channel_kind,
                                    } : undefined}
                                    layout={pageConfig.layout}
                                    columns={pageConfig.columns}
                                    showOnlyCompleted={pageConfig.showOnlyCompleted}
                                    showErrors={pageConfig.showErrors}
                                    keepStatusFilter={pageConfig.keepStatusFilter}
                                    platformFilter={pageConfig.platformFilter}
                                    jobs={jobs}
                                    jobsLoading={jobsLoading}
                                    jobsReady={jobsReady}
                                    libraryItemCount={jobCount}
                                    activityItemCount={activityCount}
                                    onVisibleVideosChange={setCinemaVideos}
                                    onOpenCinemaAt={handleOpenCinema}
                                    showDemoVideos={settings.showDemoVideos}
                                    hoverAutoplay={settings.hoverAutoplay}
                                    onContextMenu={(event, video) => openContextMenu(
                                        event,
                                        'isDemo' in video && video.isDemo ? 'demo-card' : 'real-card',
                                        video.id,
                                        'content_id' in video ? video.content_id : undefined,
                                    )}
                                />
                            </LocalizedErrorBoundary>
                            </div>
                            </div>
                        </section>
                    </div>
                )}
                    </motion.div>
                </AnimatePresence>

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
                    runtimePreflight={processingSetup.runtimePreflight}
                    runtimeTimedOut={processingSetup.runtimeTimedOut}
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
                    onPostpone={processingSetup.postponeSetup}
                    onContinueFirstVideo={continueToFirstVideo}
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
            {playlistPickerTarget !== null && (
                <PlaylistPickerDialog
                    jobId={playlistPickerTarget.jobId}
                    contentId={playlistPickerTarget.contentId}
                    onClose={() => setPlaylistPickerTarget(null)}
                />
            )}

        </div>
    );
}
