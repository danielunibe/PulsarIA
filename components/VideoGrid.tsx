'use client';
import { useState, useEffect, useCallback, useRef, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import { VideoCard } from '@/components/VideoCard';
import type { JobRecord as SharedJobRecord } from '@/hooks/use-jobs';
import type { PlaylistContentView, SourceContentView } from '@/hooks/usePlaylists';
import type { CinemaVideo, VideoData } from '@/types';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import { useDemoMedia } from '@/hooks/use-demo-media';
/** Preferred grid density for decorative slots around actual visible content. */
const INACTIVE_SLOTS_COUNT = 12;

const ExpandedVideoModal = dynamic(
    () => import('@/components/ExpandedVideoModal').then((mod) => mod.ExpandedVideoModal),
    { ssr: false }
);
const DemoVideoDetailModal = dynamic(
    () => import('@/components/DemoVideoDetailModal').then((mod) => mod.DemoVideoDetailModal),
    { ssr: false }
);

/**
 * Props del componente VideoGrid.
 *
 * Grid dinámico que muestra videos procesados (jobs completados) junto con
 * slots decorativos vacíos para mantener el layout. Soporta múltiples
 * modos de visualización (grid/list/compact) y filtrado por estado,
 * plataforma y política de retención.
 */
interface VideoGridProps {
    /** ID del video que se está reproduciendo actualmente, o null */
    activeVideoId: number | null;
    /** Callback cuando se inicia la reproducción de un video */
    onVideoPlayStart: (id: number) => void;
    /** Callback cuando se detiene la reproducción de un video */
    onVideoPlayStop: (id: number) => void;
    /** Clave de ordenamiento: 'date_desc', 'date_asc', 'title', 'duration' */
    sortKey?: string;
    /** ID de playlist para filtrar videos (si se muestra una playlist específica) */
    playlistId?: number;
    /** Agrupación confirmada de perfil/canal para filtrar contenido remoto. */
    sourceCollection?: {
        sourceId: number;
        channelKind: string;
    };
    /** Modo de visualización: 'grid' (auto-columnas), 'list' (una columna), 'compact' (cards pequeñas) */
    layout?: 'grid' | 'list' | 'compact';
    /** Número fijo de columnas (0 = auto basado en ancho de ventana) */
    columns?: 0 | 2 | 3 | 4;
    /** Si es true, oculta jobs en estado 'error' o 'queued' */
    showOnlyCompleted?: boolean;
    /** Si es true, muestra solo jobs con errores */
    showErrors?: boolean;
    /** Callback que notifica al padre cuando cambia la lista de jobs */
    onJobsChange?: (jobs: SharedJobRecord[]) => void;
    /** Fuente de trabajos compartida por la página principal */
    jobs?: SharedJobRecord[];
    /** Evita mostrar contenido durante la primera reconciliación con SQLite. */
    jobsLoading?: boolean;
    /** Evita mostrar contenido cuando la biblioteca no pudo reconciliarse. */
    jobsReady?: boolean;
    /** Recuento canónico de elementos reales de la biblioteca. */
    libraryItemCount?: number;
    /** Trabajos activos o pendientes que se consultan desde Actividad. */
    activityItemCount?: number;
    /** Filtrar por estado de retención: 'keep', 'online' */
    keepStatusFilter?: string;
    /** Filtro heredado; el MVP solo admite TikTok. */
    platformFilter?: string;
    /** Colección visible para Cinema; los assets pueden resolverse después del primer render. */
    onVisibleVideosChange?: (videos: CinemaVideo[]) => void;
    /** Abre Cinema desde la ficha activa, conservando el contrato de la biblioteca. */
    onOpenCinemaAt?: (videoId: number) => void;
    /** Capa opt-in de preview local, fuera de SQLite. */
    showDemoVideos?: boolean;
    /** Reproduce videos reales al mantener el cursor encima. */
    hoverAutoplay?: boolean;
    /** Abre el menú contextual correspondiente a una tarjeta real o DEMO. */
    onContextMenu?: (event: ReactMouseEvent<HTMLElement>, video: (SharedJobRecord & { content_id?: number }) | VideoData) => void;
}

// Gap y padding exterior idénticos — espaciado simétrico en todas las direcciones
const SPACING = 32;        // px — más separación entre cards
const CARD_MIN_WIDTH = 200; // Ancho mínimo para que no se encojan

interface ProgressEvent {
    job: number;
    step: string;
    progress: number;
}

// -- Convierte una ruta local de archivo a una URL que Tauri puede renderizar
// Usa convertFileSrc si está disponible (app Tauri), de lo contrario usa asset.localhost
async function toAssetUrl(localPath: string | undefined): Promise<string | undefined> {
    if (!localPath) return undefined;
    // Si ya es URL http/https, devolver tal cual
    if (localPath.startsWith('http://') || localPath.startsWith('https://')) return localPath;
    try {
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        return convertFileSrc(localPath);
    } catch {
        return undefined;
    }
}

type SourceState = 'local' | 'online' | 'unavailable';

type UiJobRecord = SharedJobRecord & {
    content_id?: number;
    audio_path?: string;
    transcript_path?: string;
    poster_path?: string;
    source_state?: SourceState;
    favorite?: boolean;
    pinned?: boolean;
    protected?: boolean;
    source_availability?: string;
};

type UiVideoData = VideoData & {
    sourceState?: SourceState;
    transcriptAvailable?: boolean;
    keepStatus?: string;
    favorite?: boolean;
    pinned?: boolean;
    protected?: boolean;
};

function sourceStateForJob(job: UiJobRecord): SourceState {
    // A durable local video is authoritative for the card state. The
    // retention preference `online` does not mean that an already-downloaded
    // file disappeared; it only controls what can be purged later.
    if (job.video_path) return 'local';
    if (job.source_state === 'unavailable') return 'unavailable';
    if (job.source_state === 'online' || job.keep_status === 'online') return 'online';
    return 'unavailable';
}

function hasKnowledgeRecord(job: UiJobRecord) {
    return Boolean(job.transcript_path || job.visual_analysis || job.instructional_guide || job.thumbnail);
}

function OnlineLibraryCard({
    job,
    thumbnail,
    sourceState,
    layout,
    onOpen,
    onContextMenu,
}: {
    job: UiJobRecord;
    thumbnail?: string;
    sourceState: Exclude<SourceState, 'local'>;
    layout: 'grid' | 'list' | 'compact';
    onOpen: () => void;
    onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
}) {
    const [isHovered, setIsHovered] = useState(false);
    const stateLabel = job.source_availability === 'pending'
        ? 'Pendiente de ingestión'
        : sourceState === 'unavailable'
            ? 'Fuente no disponible'
            : 'Online · ficha conservada';
    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onContextMenu={(event) => {
                if (!onContextMenu) return;
                event.preventDefault();
                event.stopPropagation();
                onContextMenu(event);
            }}
            className="relative w-full group/card-wrapper"
        >
            {/* Sombra de levitación terrestre física */}
            <div
                aria-hidden="true"
                className="absolute -bottom-2.5 left-[8%] right-[8%] h-6 rounded-full pointer-events-none transition-all duration-300 z-0"
                style={{
                    opacity: isHovered ? 0.6 : 0,
                    transform: isHovered ? 'scale(1) translateY(8px)' : 'scale(0.75) translateY(0)',
                    filter: isHovered ? 'blur(16px)' : 'blur(8px)',
                    background: 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.95) 0%, rgba(10, 10, 12, 0.5) 55%, transparent 80%)',
                }}
            />

            <button
                type="button"
                onClick={onOpen}
                aria-label={`Abrir ficha de ${job.title || `job ${job.id}`}`}
                className={`group relative w-full overflow-hidden text-left video-card-levitate cursor-pointer ${layout === 'list' ? 'aspect-[16/7] min-h-[190px] sm:min-h-[220px]' : layout === 'compact' ? 'aspect-[3/4]' : 'aspect-[9/16]'}`}
                style={{
                    borderRadius: '18px',
                    background: isHovered
                        ? 'rgba(28, 28, 34, 0.78)'
                        : 'rgba(20, 20, 24, 0.58)',
                    backdropFilter: 'blur(32px) saturate(180%) contrast(105%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(180%) contrast(105%)',
                    border: 0,
                    boxShadow: isHovered
                        ? '0 24px 50px -10px rgba(0, 0, 0, 0.82), 0 10px 22px -5px rgba(0, 0, 0, 0.55)'
                        : '0 8px 24px -6px rgba(0, 0, 0, 0.5)',
                    transform: isHovered ? 'translateY(-6px) scale(1.025)' : 'translateY(0) scale(1)',
                    transition: 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.25s ease, background 0.25s ease',
                    transformOrigin: 'center center',
                    willChange: 'transform, box-shadow',
                }}
            >
                {thumbnail ? (
                    <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-[1.03] opacity-70"
                        style={{ backgroundImage: `url(${thumbnail})` }}
                    />
                ) : (
                    <div
                        className="absolute inset-0 opacity-40"
                        style={{
                            backgroundImage: 'linear-gradient(145deg, #202024, #0c0c0e)',
                        }}
                    />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/68 via-black/12 to-transparent" aria-hidden="true" />

                {/* macOS Liquid Glass Specular Reflection Highlight */}
                <div
                    className="absolute inset-0 pointer-events-none z-[3] opacity-75 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.04) 38%, transparent 72%)',
                    }}
                />

                <div className="relative z-10 p-3.5 flex justify-between items-start">
                    <span
                        className="rounded-full px-3 py-1 text-[10px] font-semibold tracking-wide text-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.3)]"
                        style={{
                            background: 'rgba(255, 255, 255, 0.12)',
                            backdropFilter: 'blur(24px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                            border: '1px solid rgba(255, 255, 255, 0.22)',
                        }}
                    >
                        {stateLabel}
                    </span>
                </div>

                <div
                    className="relative z-10 m-3 p-3.5 rounded-[16px] shadow-[0_12px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.22)] flex flex-col gap-1 transition-all duration-300 group-hover:bg-[rgba(16,19,30,0.68)] group-hover:border-white/25"
                    style={{
                        background: 'rgba(14, 17, 26, 0.55)',
                        backdropFilter: 'blur(30px) saturate(190%)',
                        WebkitBackdropFilter: 'blur(30px) saturate(190%)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                    }}
                >
                    <span className="text-[10px] font-bold tracking-wider uppercase text-[#25f4ee] drop-shadow-[0_0_8px_rgba(37,244,238,0.35)] truncate">
                        {job.author ? `@${job.author}` : 'TikTok'}
                    </span>
                    <span className="line-clamp-2 text-xs sm:text-[13px] font-medium leading-snug text-white/95">
                        {job.title || job.url || `Video #${job.id}`}
                    </span>
                    <span className="text-[10px] text-white/50">Transcript y ficha locales</span>
                </div>
            </button>
        </div>
    );
}


const isRealJobRecord = (job: SharedJobRecord | VideoData): job is SharedJobRecord =>
    'status' in job;

function stableDemoId(slotId: string): number {
    let hash = 0;
    for (const character of slotId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return 100000 + (hash % 899999);
}

function playlistContentViewToJob(item: PlaylistContentView): SharedJobRecord {
    const completed = ['complete', 'completed', 'done'].includes(item.status.toLowerCase());
    return {
        ...item,
        content_id: item.content_id,
        source_availability: completed ? item.availability : 'pending',
    } as SharedJobRecord & { source_availability?: string };
}

export function VideoGrid({
    activeVideoId,
    onVideoPlayStart,
    onVideoPlayStop,
    sortKey,
    playlistId,
    sourceCollection,
    layout = 'grid',
    columns = 0,
    showOnlyCompleted = true,
    showErrors = false,
    onJobsChange,
    keepStatusFilter,
    platformFilter,
    jobs: controlledJobs,
    jobsLoading = false,
    jobsReady = true,
    libraryItemCount,
    activityItemCount = 0,
    onVisibleVideosChange,
    onOpenCinemaAt,
    showDemoVideos = false,
    hoverAutoplay = true,
    onContextMenu,
}: VideoGridProps) {

    const { t } = useI18n();
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [activeDemoDetail, setActiveDemoDetail] = useState<VideoData | null>(null);
    const demoDetailTriggerRef = useRef<HTMLElement | null>(null);
    const [localJobs, setLocalJobs] = useState<SharedJobRecord[]>([]);
    const [playlistJobs, setPlaylistJobs] = useState<SharedJobRecord[]>([]);
    const [resolvedAssets, setResolvedAssets] = useState<Record<number, { thumb?: string; video?: string }>>({});
    const [containerWidth, setContainerWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const collectionSelected = playlistId !== undefined || sourceCollection !== undefined;
    const { items: demoMedia } = useDemoMedia(showDemoVideos && !collectionSelected);

    const jobs = controlledJobs ?? localJobs;
    const realLibraryItemCount = libraryItemCount ?? jobs.length;
    const sourceJobs = collectionSelected ? playlistJobs : jobs;
    const isCompleted = (job: SharedJobRecord) => ['complete', 'completed'].includes(job.status.toLowerCase());
    const isError = (job: SharedJobRecord) => ['error', 'failed', 'failure', 'cancelled', 'canceled'].includes(job.status.toLowerCase());
    const normalizedPlatformFilter = (platformFilter ?? 'all').toLowerCase();

    // PagePanel controla qué estados aparecen en la biblioteca; la cola sigue mostrando el progreso completo.
    const visibleJobs = sourceJobs
        .filter((job) => {
            const uiJob = job as UiJobRecord;
            const isJobError = isError(job);
            const sourceState = sourceStateForJob(uiJob);
            // La galería solo contiene medios terminados; el pipeline vive en la cola.
            const nonErrorVisible = showOnlyCompleted
                ? isCompleted(job)
                : isCompleted(job) || uiJob.source_availability === 'pending';
            const statusVisible = isJobError ? showErrors : nonErrorVisible;
            const effectiveKeepStatus = job.keep_status || (sourceState === 'online' ? 'online' : undefined);
            const keepVisible = (keepStatusFilter ?? 'all') === 'all'
                || effectiveKeepStatus === (keepStatusFilter ?? 'all');
            const jobPlatform = job.platform?.toLowerCase() ?? '';
            const platformVisible = normalizedPlatformFilter === 'all'
                || jobPlatform === normalizedPlatformFilter
                || job.url.toLowerCase().includes(normalizedPlatformFilter);
            // A completed row can remain useful as a transcript-only/online
            // card after the large media has been released. Only hide rows
            // that have neither local media nor a durable knowledge record.
            return statusVisible
                && keepVisible
                && platformVisible
                && Boolean(job.status)
                && (Boolean(job.video_path) || sourceState !== 'local' || hasKnowledgeRecord(uiJob));
        });

    // Cálculo de columnas basado en el ancho real, salvo cuando el usuario fija un número.
    const autoColumns = Math.max(1, Math.floor((containerWidth + SPACING) / (CARD_MIN_WIDTH + SPACING)));
    const currentColumns = layout === 'list' ? 1 : columns || autoColumns;

    // -- Fetching de jobs: primero Tauri IPC, si falla usa la REST API --
    const fetchJobs = useCallback(async () => {
        if (collectionSelected) {
            try {
                if (playlistId !== undefined) {
                    try {
                        let views: PlaylistContentView[];
                        try {
                            const { invoke } = await import('@tauri-apps/api/core');
                            views = await invoke<PlaylistContentView[]>('get_playlist_content_items', { playlistId });
                        } catch {
                            const { REST_API_BASE } = await import('@/lib/api-config');
                            const response = await apiFetch(`${REST_API_BASE}/playlists/${playlistId}/content`);
                            if (!response.ok) throw new Error(`Playlist content request failed with status ${response.status}`);
                            views = await response.json() as PlaylistContentView[];
                        }
                        setPlaylistJobs(views.map(playlistContentViewToJob));
                    } catch {
                        // Keep the historical route as a compatibility
                        // adapter for a backend that predates the canonical
                        // content projection.
                        let items: SharedJobRecord[];
                        try {
                            const { invoke } = await import('@tauri-apps/api/core');
                            items = await invoke<SharedJobRecord[]>('get_playlist_items', { playlistId });
                        } catch {
                            const { REST_API_BASE } = await import('@/lib/api-config');
                            const response = await apiFetch(`${REST_API_BASE}/playlists/${playlistId}/items`);
                            if (!response.ok) throw new Error(`Playlist request failed with status ${response.status}`);
                            items = await response.json() as SharedJobRecord[];
                        }
                        setPlaylistJobs(items);
                    }
                } else if (sourceCollection) {
                    let items: SourceContentView[];
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        items = await invoke<SourceContentView[]>('get_source_collection_content_items', {
                            sourceId: sourceCollection.sourceId,
                            channelKind: sourceCollection.channelKind,
                            limit: 500,
                        });
                    } catch {
                        const { REST_API_BASE } = await import('@/lib/api-config');
                        const response = await apiFetch(
                            `${REST_API_BASE}/source-collections/${sourceCollection.sourceId}/${encodeURIComponent(sourceCollection.channelKind)}/items`,
                        );
                        if (!response.ok) throw new Error(`Source collection request failed with status ${response.status}`);
                        items = await response.json() as SourceContentView[];
                    }
                    setPlaylistJobs(items.map(playlistContentViewToJob));
                }
            } catch {
                setPlaylistJobs([]);
            }
            return;
        }

        if (controlledJobs) return;

        let data: SharedJobRecord[] = [];
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            data = await invoke('get_jobs');
        } catch {
            try {
                const { REST_API_BASE } = await import('@/lib/api-config');
                const response = await apiFetch(`${REST_API_BASE}/jobs`);
                if (response.ok) data = await response.json();
            } catch { /* sin conexion */ }
        }
        setLocalJobs(data);
        if (onJobsChange) onJobsChange(data);
        setPlaylistJobs([]);
    }, [collectionSelected, controlledJobs, onJobsChange, playlistId, sourceCollection]);

    // -- Resolver rutas locales de assets de manera asíncrona
    const resolveAssets = useCallback(async (list: SharedJobRecord[]) => {
        const updates: Record<number, { thumb?: string; video?: string }> = {};
        await Promise.all(list.map(async (job) => {
            const uiJob = job as UiJobRecord;
            const [thumb, video] = await Promise.all([
                toAssetUrl(uiJob.poster_path || uiJob.thumbnail),
                toAssetUrl(job.video_path),
            ]);
            updates[job.id] = { thumb, video };
        }));
        setResolvedAssets(prev => ({ ...prev, ...updates }));
    }, []);

        useEffect(() => {
        const timer = setTimeout(() => setIsInitialLoad(false), 2000);
        let active = true;
        if (collectionSelected || !controlledJobs) {
            queueMicrotask(() => {
                if (active) void fetchJobs();
            });
        }

        // Resize observer para responsividad

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        if (containerRef.current) observer.observe(containerRef.current);

        // Escuchar eventos Tauri si están disponibles
        let unlistenProgress: (() => void) | undefined;
        let unlistenIndexed: (() => void) | undefined;
        // The main library is reconciled by useJobs. A selected playlist only
        // needs one derived membership fetch; it must not create a second
        // polling loop or duplicate Tauri event listeners.
        if (!controlledJobs && !collectionSelected) {
            (async () => {
                try {
                    const { listen } = await import('@tauri-apps/api/event');
                    unlistenProgress = await listen<ProgressEvent>('job_progress', () => { fetchJobs(); });
                    unlistenIndexed = await listen<number>('media_indexed', () => { fetchJobs(); });
                } catch {
                    // No disponible fuera de Tauri; silencioso.
                }
            })();
        }

        const fallbackInterval = (!controlledJobs && !collectionSelected) ? setInterval(fetchJobs, 3000) : undefined;

        return () => {
                        active = false;
            clearTimeout(timer);
            if (fallbackInterval) clearInterval(fallbackInterval);

            observer.disconnect();
            unlistenProgress?.();
            unlistenIndexed?.();
        };
    }, [collectionSelected, controlledJobs, fetchJobs]);

    // Resolver assets cada vez que cambian los jobs
    useEffect(() => {
        const sourceJobs = collectionSelected ? playlistJobs : jobs;
        let active = true;
        queueMicrotask(() => {
            if (active && sourceJobs.length > 0) void resolveAssets(sourceJobs);
        });
        return () => {
            active = false;
        };
    }, [collectionSelected, jobs, playlistJobs, resolveAssets]);

    const formatDuration = (seconds?: number) => {
        if (!seconds) return '00:00';
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // -- Lista a renderizar: jobs completados reales
    const sortedJobs = useMemo(() => [...visibleJobs].sort((a, b) => {

            const aDate = Date.parse(a.created_at || '') || a.id;
      const bDate = Date.parse(b.created_at || '') || b.id;
      switch (sortKey) {
        case 'date_asc':  return aDate - bDate;
        case 'date_desc': return bDate - aDate;
        case 'title':     return (a.title || '').localeCompare(b.title || '', 'es');
        case 'duration':  return (b.duration || 0) - (a.duration || 0);
        default:          return bDate - aDate;
      }

    }), [sortKey, visibleJobs]);
    const demoVideos = useMemo<VideoData[]>(() => demoMedia.map((item) => ({
        id: stableDemoId(item.slotId),
        slotId: item.slotId,
        title: item.label,
        author: 'DEMO',
        duration: '—',
        tags: ['DEMO'],
        thumb: item.imageSrc,
        videoSrc: item.videoSrc || '',
        mediaKind: item.mediaKind,
        demoLabel: item.mediaKind === 'image' ? 'DEMO · Imagen temporal' : 'DEMO',
        isDemo: true,
        sourceState: 'local',
    })), [demoMedia]);
    // Demo assets are deliberately appended outside the jobs collection. They
    // never enter SQLite, playlists, search results, counters, or queue state.
    const renderList = useMemo<Array<SharedJobRecord | VideoData>>(() => collectionSelected
        ? sortedJobs
        : [...sortedJobs, ...demoVideos], [collectionSelected, demoVideos, sortedJobs]);
    const confirmedEmptyLibrary = !collectionSelected
        && jobsReady
        && !jobsLoading
        && realLibraryItemCount === 0
        && activityItemCount === 0;
    const waitingForFirstLibraryItem = !collectionSelected
        && jobsReady
        && !jobsLoading
        && realLibraryItemCount === 0
        && activityItemCount > 0;
    const noVisibleLibraryItems = !collectionSelected
        && jobsReady
        && !jobsLoading
        && realLibraryItemCount > 0
        && sortedJobs.length === 0;
    // Decorative slots only fill space around visible content. They must not
    // imply an empty library while its connection is unavailable or loading.
    const placeholderCount = layout === 'list'
        ? 0
        : (jobsLoading || !jobsReady || renderList.length === 0
            || (!collectionSelected && realLibraryItemCount === 0)
            ? 0
            : Math.max(0, INACTIVE_SLOTS_COUNT - renderList.length));

    // El padre conserva una instantánea de la misma colección que ve el usuario.
    // La clave evita un ciclo de renders cuando el array calculado cambia de referencia.
    const cinemaSnapshotKeyRef = useRef('');
    useEffect(() => {
        const snapshot = renderList.flatMap((job: SharedJobRecord | VideoData) => {
            const isRealJob = 'status' in job;
            const uiJob = isRealJob ? job as UiJobRecord : null;
            const assets = isRealJob ? resolvedAssets[job.id] : undefined;
            const sourceState = uiJob ? sourceStateForJob(uiJob) : 'local';
            const mediaKind = isRealJob ? 'video' : (job.mediaKind ?? 'video');
            const video = {
                id: job.id,
                title: job.title || (isRealJob ? job.url : 'Untitled'),
                author: job.author || 'Unknown',
                duration: isRealJob ? formatDuration(job.duration) : job.duration,
                tags: isRealJob ? [] : job.tags,
                thumb: (isRealJob ? assets?.thumb : job.thumb) || '',
                videoSrc: (isRealJob ? assets?.video : job.videoSrc) || '',
                originalUrl: isRealJob ? job.url : job.originalUrl,
                visualAnalysis: isRealJob ? job.visual_analysis : job.visualAnalysis,
                instructionalGuide: isRealJob ? job.instructional_guide : job.instructionalGuide,
                sourceState,
                mediaKind,
                slotId: isRealJob ? undefined : job.slotId,
                demoLabel: isRealJob ? undefined : job.demoLabel,
                isDemo: !isRealJob && job.isDemo === true,
            } satisfies CinemaVideo;
            // Cinema también debe poder abrir fichas cuya fuente está online o
            // no disponible. El estado de la fuente se muestra dentro del
            // reproductor y evita que el botón quede bloqueado mientras la
            // conversión de una ruta local termina de resolverse.
            return [video];
        });
        const snapshotKey = JSON.stringify(snapshot);
        if (snapshotKey === cinemaSnapshotKeyRef.current) return;
        cinemaSnapshotKeyRef.current = snapshotKey;
        onVisibleVideosChange?.(snapshot);
    }, [onVisibleVideosChange, renderList, resolvedAssets]);

    return (
        <motion.div
            style={{
                position: 'relative',
                zIndex: 1,
                width: '100%',
                minHeight: 'max-content',
                padding: `${SPACING}px 32px 160px`,
                overflow: 'visible',
            }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
            <div
                ref={containerRef}
                className="video-grid-container"
                style={{
                    display: layout === 'list' ? 'flex' : 'grid',

                    marginTop: '12px',
                    gridTemplateColumns: layout === 'list'
                        ? undefined
                        : `repeat(${currentColumns}, minmax(${layout === 'compact' ? 160 : CARD_MIN_WIDTH}px, 1fr))`,
                    flexDirection: layout === 'list' ? 'column' : undefined,
                    gap: containerWidth < 800 ? '16px' : `${SPACING}px`,

                    justifyContent: 'center',
                    alignItems: 'start',
                    minHeight: 'max-content',
                    minWidth: 0,
                    width: '100%',
                    overflow: 'visible',
                }}
            >
                {(confirmedEmptyLibrary || waitingForFirstLibraryItem || noVisibleLibraryItems) && (
                    <section className="pulsaria-library-context pulsaria-library-context--empty" role="status">
                        <h2>
                            {confirmedEmptyLibrary
                                ? t('libraryEmptyTitle')
                                : waitingForFirstLibraryItem
                                    ? t('libraryWaitingTitle')
                                    : t('libraryFilteredTitle')}
                        </h2>
                        <p>
                            {confirmedEmptyLibrary
                                ? t('libraryEmptyDescription')
                                : waitingForFirstLibraryItem
                                    ? t('libraryWaitingDescription')
                                    : t('libraryFilteredDescription')}
                        </p>
                    </section>
                )}
                {demoVideos.length > 0 && (
                    <aside className="pulsaria-library-context pulsaria-library-context--demo" role="note">
                        {t('demoLibraryNotice')}
                    </aside>
                )}
                {/* -- Tarjetas de videos completados o mocks -- */}
                                {renderList.map((job: SharedJobRecord | VideoData, idx: number) => {
                    const isRealJob = 'status' in job;
                    const uiJob = isRealJob ? job as UiJobRecord : null;
                    const assets = isRealJob ? resolvedAssets[job.id] : undefined;
                    const thumbnailSrc = isRealJob ? assets?.thumb : job.thumb;
                    const videoSrc = isRealJob ? assets?.video : job.videoSrc;
                    const isPlaying = activeVideoId === job.id;
                    const sourceState = uiJob ? sourceStateForJob(uiJob) : 'local';
                    const mediaKind = isRealJob ? 'video' : (job.mediaKind ?? 'video');
                    const isStaticDemo = !isRealJob && job.isDemo === true && mediaKind === 'image';
                    if (uiJob && !videoSrc && (sourceState === 'online' || sourceState === 'unavailable')) {
                        return (
                            <motion.div
                                key={job.id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                    duration: 0.35,
                                    ease: [0.22, 1, 0.36, 1],
                                    delay: isInitialLoad ? Math.min(idx * 0.04, 0.4) : 0,
                                }}
                                className="relative z-0 hover:z-30"
                            >
                                <OnlineLibraryCard
                                    job={uiJob}
                                    thumbnail={thumbnailSrc}
                                    sourceState={sourceState}
                                    layout={layout}
                                    onOpen={() => onVideoPlayStart(job.id)}
                                    onContextMenu={(event) => onContextMenu?.(event, job as SharedJobRecord & { content_id?: number })}
                                />
                            </motion.div>
                        );
                    }
                    return (

                        <motion.div
                            key={job.id}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                duration: 0.35,
                                ease: [0.22, 1, 0.36, 1],
                                delay: isInitialLoad ? Math.min(idx * 0.04, 0.4) : 0,
                            }}
                            className="relative z-0 hover:z-30"
                        >
                            <VideoCard
                                id={job.id}
                                isActive={Boolean(videoSrc)}
                                layout={layout}
                                title={job.title || (isRealJob ? job.url : 'Untitled')}
                                author={job.author || 'Unknown'}
                                duration={isRealJob ? formatDuration(job.duration) : job.duration}
                                tags={isRealJob ? [] : job.tags}
                                thumb={thumbnailSrc}
                                videoSrc={videoSrc}
                                url={isRealJob ? job.url : ""}
                                isFullPlaying={isPlaying}
                                onPlayStart={() => onVideoPlayStart(job.id)}
                                onPlayStop={() => onVideoPlayStop(job.id)}
                                keepStatus={isRealJob ? job.keep_status : undefined}
                                onlineOnly={isRealJob && sourceState === 'online' && !videoSrc}
                                mediaKind={mediaKind}
                                isDemo={!isRealJob && job.isDemo === true}
                                demoLabel={!isRealJob ? job.demoLabel : undefined}
                                hoverAutoplay={hoverAutoplay}
                                onPreviewClick={isStaticDemo ? (trigger) => {
                                    demoDetailTriggerRef.current = trigger;
                                    setActiveDemoDetail(job as VideoData);
                                } : undefined}
                                onContextMenu={(event) => onContextMenu?.(event, job as SharedJobRecord & { content_id?: number })}
                            />

                        </motion.div>
                    );
                })}

                {Array.from({ length: placeholderCount }, (_, index) => (
                    <motion.div
                        key={`placeholder-${renderList.length}-${index}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24) }}
                        className="relative z-0"
                        aria-hidden="true"
                    >
                        <VideoCard
                            isActive={false}
                            layout={layout}
                            slotIndex={renderList.length + index}
                        />
                    </motion.div>
                ))}
            </div>

            {/* -- Modal expandido -- */}
            {activeVideoId !== null && (() => {
                const allAvailableJobs = collectionSelected ? [...playlistJobs, ...jobs] : jobs;
                const activeJob = allAvailableJobs.find(j => j.id === activeVideoId);
                if (!activeJob) return null;

                const uiJob = activeJob as UiJobRecord;
                const assets = resolvedAssets[activeJob.id];
                const sourceState = sourceStateForJob(uiJob);
                const videoData: UiVideoData = {
                    id: activeJob.id,
                    title: activeJob.title || activeJob.url,
                    author: activeJob.author || 'Unknown',
                    duration: formatDuration(activeJob.duration),
                    tags: [],
                    thumb: assets?.thumb || '',
                    videoSrc: assets?.video || '',
                    originalUrl: activeJob.url,
                    visualAnalysis: activeJob.visual_analysis,
                    instructionalGuide: activeJob.instructional_guide,
                    sourceState,
                    transcriptAvailable: Boolean(uiJob.transcript_path || activeJob.visual_analysis || activeJob.instructional_guide),
                    keepStatus: activeJob.keep_status,
                    favorite: uiJob.favorite,
                    pinned: uiJob.pinned,
                    protected: uiJob.protected,
                };

                return (
                    <ExpandedVideoModal
                        key={`expanded-video-modal-${activeVideoId}`}
                        video={videoData}
                        onClose={() => onVideoPlayStop(activeVideoId)}
                        onOpenCinema={onOpenCinemaAt ? () => onOpenCinemaAt(activeVideoId) : undefined}
                    />
                );
            })()}
            {activeDemoDetail && (
                <DemoVideoDetailModal
                    video={activeDemoDetail}
                    onClose={() => setActiveDemoDetail(null)}
                    returnFocusRef={demoDetailTriggerRef}
                />
            )}
        </motion.div>
    );
}
