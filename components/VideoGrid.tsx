'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import { VideoCard } from '@/components/VideoCard';
import { MOCK_ACTIVE_VIDEOS } from '@/lib/mock-data';
import type { JobRecord as SharedJobRecord } from '@/hooks/use-jobs';
import type { CinemaVideo, VideoData } from '@/types';

const ExpandedVideoModal = dynamic(
    () => import('@/components/ExpandedVideoModal').then((mod) => mod.ExpandedVideoModal),
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
    /** Evita mostrar demos durante la primera reconciliación con SQLite. */
    jobsLoading?: boolean;
    /** Evita mostrar demos cuando la biblioteca no pudo reconciliarse. */
    jobsReady?: boolean;
    /** Filtrar por estado de retención: 'keep', 'online' */
    keepStatusFilter?: string;
    /** Filtro heredado; el MVP solo admite TikTok. */
    platformFilter?: string;
    /** Colección visible ya ordenada y con assets listos para el modo Cinema */
    onVisibleVideosChange?: (videos: CinemaVideo[]) => void;
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
    audio_path?: string;
    transcript_path?: string;
    poster_path?: string;
    source_state?: SourceState;
    favorite?: boolean;
    pinned?: boolean;
    protected?: boolean;
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
}: {
    job: UiJobRecord;
    thumbnail?: string;
    sourceState: Exclude<SourceState, 'local'>;
    layout: 'grid' | 'list' | 'compact';
    onOpen: () => void;
}) {
    const stateLabel = sourceState === 'unavailable' ? 'Fuente no disponible' : 'Online · ficha conservada';
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`Abrir ficha de ${job.title || `job ${job.id}`}`}
            className={`group relative w-full overflow-hidden border border-white/10 bg-[#0d1118] text-left shadow-[0_18px_40px_rgba(0,0,0,.24)] transition duration-300 hover:-translate-y-1 hover:border-[#25f4ee]/40 ${layout === 'list' ? 'aspect-[16/7] min-h-[190px] sm:min-h-[220px]' : layout === 'compact' ? 'aspect-[3/4]' : 'aspect-[9/16]'}`}
            style={{
                borderRadius: '20px',
                backgroundImage: thumbnail
                    ? `linear-gradient(180deg, rgba(7,10,16,.08), rgba(7,10,16,.94)), url(${thumbnail})`
                    : 'radial-gradient(circle at 30% 20%, rgba(37,244,238,.18), transparent 36%), linear-gradient(145deg, #171d2a, #080a10)',
                backgroundPosition: 'center',
                backgroundSize: 'cover',
            }}
        >
            <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" aria-hidden="true" />
            <span className="absolute left-4 top-4 rounded-full border border-[#25f4ee]/30 bg-[#071316]/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#25f4ee] backdrop-blur-md">
                {stateLabel}
            </span>
            <span className="absolute bottom-0 left-0 right-0 flex flex-col gap-1.5 p-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">{job.author ? `@${job.author}` : 'TikTok'}</span>
                <span className="line-clamp-2 text-sm font-bold leading-tight text-white/95">{job.title || job.url || `Video #${job.id}`}</span>
                <span className="text-[10px] text-white/45">Transcript y ficha locales · abre la fuente original desde el detalle</span>
            </span>
        </button>
    );
}


const isRealJobRecord = (job: SharedJobRecord | VideoData): job is SharedJobRecord =>
    'status' in job;

export function VideoGrid({
    activeVideoId,
    onVideoPlayStart,
    onVideoPlayStop,
    sortKey,
    playlistId,
    layout = 'grid',
    columns = 0,
    onJobsChange,
    keepStatusFilter,
    platformFilter,
    jobs: controlledJobs,
    jobsLoading = false,
    jobsReady = true,
    onVisibleVideosChange,
}: VideoGridProps) {

    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [localJobs, setLocalJobs] = useState<SharedJobRecord[]>([]);
    const [playlistJobs, setPlaylistJobs] = useState<SharedJobRecord[]>([]);
    const [resolvedAssets, setResolvedAssets] = useState<Record<number, { thumb?: string; video?: string }>>({});
    const [containerWidth, setContainerWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const jobs = controlledJobs ?? localJobs;
    const sourceJobs = playlistId ? playlistJobs : jobs;
    const isCompleted = (job: SharedJobRecord) => ['complete', 'completed'].includes(job.status.toLowerCase());
    const isError = (job: SharedJobRecord) => ['error', 'failed', 'failure', 'cancelled', 'canceled'].includes(job.status.toLowerCase());
    const normalizedPlatformFilter = (platformFilter ?? 'all').toLowerCase();

    // PagePanel controla qué estados aparecen en la biblioteca; la cola sigue mostrando el progreso completo.
    // Bug #5 FIX: Error jobs are ALWAYS visible in the grid
    const visibleJobs = sourceJobs
        .filter((job) => {
            const uiJob = job as UiJobRecord;
            const isJobError = isError(job);
            const sourceState = sourceStateForJob(uiJob);
            // La galería solo contiene medios terminados; el pipeline vive en la cola.
            const statusVisible = isCompleted(job) && !isJobError;
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
                if (playlistId) {
            try {
                let items: SharedJobRecord[];
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    items = await invoke<SharedJobRecord[]>('get_playlist_items', { playlistId });
                } catch {
                    const { REST_API_BASE } = await import('@/lib/api-config');
                    const response = await fetch(`${REST_API_BASE}/playlists/${playlistId}/items`);
                    if (!response.ok) throw new Error(`Playlist request failed with status ${response.status}`);
                    items = await response.json() as SharedJobRecord[];
                }
                setPlaylistJobs(items);
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
                const response = await fetch(`${REST_API_BASE}/jobs`);
                if (response.ok) data = await response.json();
            } catch { /* sin conexion */ }
        }
        setLocalJobs(data);
        if (onJobsChange) onJobsChange(data);
        setPlaylistJobs([]);
    }, [controlledJobs, onJobsChange, playlistId]);

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
        if (playlistId || !controlledJobs) {
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
        if (!controlledJobs && !playlistId) {
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

        const fallbackInterval = (!controlledJobs && !playlistId) ? setInterval(fetchJobs, 3000) : undefined;

        return () => {
                        active = false;
            clearTimeout(timer);
            if (fallbackInterval) clearInterval(fallbackInterval);

            observer.disconnect();
            unlistenProgress?.();
            unlistenIndexed?.();
        };
    }, [controlledJobs, fetchJobs, playlistId]);

    // Resolver assets cada vez que cambian los jobs
    useEffect(() => {
        const sourceJobs = playlistId ? playlistJobs : jobs;
        let active = true;
        queueMicrotask(() => {
            if (active && sourceJobs.length > 0) void resolveAssets(sourceJobs);
        });
        return () => {
            active = false;
        };
    }, [jobs, playlistId, playlistJobs, resolveAssets]);

    const formatDuration = (seconds?: number) => {
        if (!seconds) return '00:00';
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // -- Lista a renderizar: jobs completados reales
        const sortedJobs = [...visibleJobs].sort((a, b) => {

            const aDate = Date.parse(a.created_at || '') || a.id;
      const bDate = Date.parse(b.created_at || '') || b.id;
      switch (sortKey) {
        case 'date_asc':  return aDate - bDate;
        case 'date_desc': return bDate - aDate;
        case 'title':     return (a.title || '').localeCompare(b.title || '', 'es');
        case 'duration':  return (b.duration || 0) - (a.duration || 0);
        default:          return bDate - aDate;
      }

    });
    // Las demos locales solo ocupan el lienzo cuando todavía no existe ningún
    // trabajo real. En cuanto SQLite devuelve una fila (aunque esté fallida),
    // la biblioteca vuelve a representar únicamente el estado real.
    const isDemoMode = !playlistId && !jobsLoading && jobsReady && jobs.length === 0;
    const renderList = isDemoMode ? MOCK_ACTIVE_VIDEOS : sortedJobs;
    const showEmptyState = !playlistId && !isDemoMode && !jobsLoading && jobsReady && renderList.length === 0;

    // El padre conserva una instantánea de la misma colección que ve el usuario.
    // La clave evita un ciclo de renders cuando el array calculado cambia de referencia.
    const cinemaSnapshotKeyRef = useRef('');
    useEffect(() => {
        const snapshot = renderList.map((job: SharedJobRecord | VideoData) => {
            const isRealJob = 'status' in job;
            const uiJob = isRealJob ? job as UiJobRecord : null;
            const assets = isRealJob ? resolvedAssets[job.id] : undefined;
            const sourceState = uiJob ? sourceStateForJob(uiJob) : 'local';
            return {
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
            } satisfies CinemaVideo;
        });
        const snapshotKey = JSON.stringify(snapshot);
        if (snapshotKey === cinemaSnapshotKeyRef.current) return;
        cinemaSnapshotKeyRef.current = snapshotKey;
        onVisibleVideosChange?.(snapshot);
    }, [onVisibleVideosChange, renderList, resolvedAssets]);

    return (
        <motion.div
            style={{ padding: `${SPACING}px` }}
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
                        : `repeat(${columns || 'auto-fill'}, minmax(${layout === 'compact' ? 160 : CARD_MIN_WIDTH}px, 1fr))`,
                    flexDirection: layout === 'list' ? 'column' : undefined,
                    gap: containerWidth < 800 ? '16px' : `${SPACING}px`,

                    justifyContent: 'center',
                    paddingBottom: '80px'
                }}
            >
                {/* -- Tarjetas de videos completados o mocks -- */}
                                {renderList.map((job: SharedJobRecord | VideoData, idx: number) => {
                    const isRealJob = 'status' in job;
                    const uiJob = isRealJob ? job as UiJobRecord : null;
                    const assets = isRealJob ? resolvedAssets[job.id] : undefined;
                    const thumbnailSrc = isRealJob ? assets?.thumb : job.thumb;
                    const videoSrc = isRealJob ? assets?.video : job.videoSrc;
                    const isPlaying = activeVideoId === job.id;
                    const sourceState = uiJob ? sourceStateForJob(uiJob) : 'local';
                    if (uiJob && !videoSrc && (sourceState === 'online' || sourceState === 'unavailable')) {
                        return (
                            <motion.div
                                key={job.id}
                                layoutId={`video-card-${job.id}`}
                                initial={{ opacity: 0, y: 24 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                    duration: 0.45,
                                    ease: [0.22, 1, 0.36, 1],
                                    delay: isInitialLoad ? idx * 0.05 : 0,
                                }}
                                style={{ position: 'relative' }}
                            >
                                <OnlineLibraryCard
                                    job={uiJob}
                                    thumbnail={thumbnailSrc}
                                    sourceState={sourceState}
                                    layout={layout}
                                    onOpen={() => onVideoPlayStart(job.id)}
                                />
                            </motion.div>
                        );
                    }
                    return (

                        <motion.div
                            key={job.id}
                            layoutId={`video-card-${job.id}`}
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                duration: 0.45,
                                ease: [0.22, 1, 0.36, 1],
                                delay: isInitialLoad ? idx * 0.05 : 0
                            }}
                            style={{ position: 'relative' }}
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
                            />

                        </motion.div>
                    );
                })}

                {showEmptyState && (
                    <div className="col-span-full flex min-h-[240px] flex-col items-center justify-center rounded-[24px] border border-white/5 bg-white/[0.02] px-6 py-10 text-center backdrop-blur-md">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-white/50 border border-white/10 mb-3">
                            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                <path d="M10 18a7.952 7.952 0 0 0 4.897-1.688l4.396 4.396 1.414-1.414-4.396-4.396A7.952 7.952 0 0 0 18 10c0-4.411-3.589-8-8-8s-8 3.589-8 8 3.589 8 8 8zm0-14c3.309 0 6 2.691 6 6s-2.691 6-6 6-6-2.691-6-6 2.691-6 6-6z" />
                            </svg>
                        </div>
                        <p className="text-sm font-semibold text-white/80">Biblioteca vacía o sin coincidencias</p>
                        <p className="mt-1 max-w-sm text-xs text-white/40 leading-relaxed">
                            Agrega URLs de video desde la barra superior para iniciar la descarga, transcripción e indexación semántica.
                        </p>
                    </div>
                )}
            </div>

            {/* -- Modal expandido -- */}
            {activeVideoId !== null && (() => {
                const allAvailableJobs = playlistId ? [...playlistJobs, ...jobs] : jobs;
                const activeJob = allAvailableJobs.find(j => j.id === activeVideoId);
                const activeMock = isDemoMode
                    ? MOCK_ACTIVE_VIDEOS.find(video => video.id === activeVideoId)
                    : undefined;
                if (!activeJob && !activeMock) return null;

                let videoData: UiVideoData;
                if (activeJob) {
                    const uiJob = activeJob as UiJobRecord;
                    const assets = resolvedAssets[activeJob.id];
                    const sourceState = sourceStateForJob(uiJob);
                    videoData = {
                        id: activeJob.id,
                        title: activeJob.title || activeJob.url,
                        author: activeJob.author || 'Unknown',
                        duration: formatDuration(activeJob.duration),
                        tags: [] as string[],
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
                } else {
                    if (!activeMock) return null;
                    videoData = activeMock;
                }

                return (
                    <ExpandedVideoModal
                        key={`expanded-video-modal-${activeVideoId}`}
                        video={videoData}
                        onClose={() => onVideoPlayStop(activeVideoId)}
                    />
                );
            })()}
        </motion.div>
    );
}
