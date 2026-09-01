'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import { VideoCard } from '@/components/VideoCard';
import { MOCK_ACTIVE_VIDEOS, INACTIVE_SLOTS_COUNT } from '@/lib/mock-data';
import { FaFolderOpen } from 'react-icons/fa6';
import type { JobRecord as SharedJobRecord } from '@/hooks/use-jobs';

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
    onJobsChange?: (jobs: JobRecord[]) => void;
    /** Fuente de trabajos compartida por la página principal */
    jobs?: SharedJobRecord[];
    /** Filtrar por estado de retención: 'keep', 'online' */
    keepStatusFilter?: string;
    /** Filtrar por plataforma: 'tiktok', 'youtube', etc. */
    platformFilter?: string;
}

// Gap y padding exterior id�nticos ? espaciado sim�trico en todas las direcciones
const SPACING = 32;        // px � m�s separaci�n entre cards
const CARD_MIN_WIDTH = 200; // Ancho m�nimo deseado para que no se  encojan

interface ProgressEvent {
    job: number;
    step: string;
    progress: number;
}

/**
 * Registro de un job (video) con sus metadatos de media.
 * 
 * Coincide con la estructura `JobRecord` del backend Rust (db.rs).
 * Se obtiene mediante el comando Tauri `get_jobs` o el endpoint REST `/api/v1/jobs`.
 */
interface JobRecord {
    /** ID autoincremental del job */
    id: number;
    /** URL original del video */
    url: string;
    /** Estado actual: 'queued', 'downloading', 'metadata', 'transcribing', 'indexing', 'processing', 'complete', 'error' */
    status: string;
    /** Progreso del pipeline (0-100) */
    progress: number;
    /** Timestamp de creación del job (ISO 8601) */
    created_at: string;
    /** Título del video (extraído por yt-dlp) */
    title?: string;
    /** Autor/creador del video */
    author?: string;
    /** URL o path local de la miniatura del video */
    thumbnail?: string;
    /** Duración del video en segundos */
    duration?: number;
    /** Path local al archivo de video procesado */
    video_path?: string;
    /** Mensaje de error si el job falló */
    error_message?: string;
    /** Resultados del análisis visual (JSON serializado) */
    visual_analysis?: string;
    /** Instructivo audiovisual generado por IA */
    instructional_guide?: string;
    /** Poltica de retencin del archivo: 'keep' o 'online' */
    keep_status?: string;
    /** Plataforma de origen: 'tiktok', 'youtube', etc. */
    platform?: string;
}

// -- Convierte una ruta local de archivo a una URL que Tauri puede renderizar
// Usa convertFileSrc si est� disponible (app Tauri), de lo contrario usa asset.localhost
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
}: VideoGridProps) {

    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [localJobs, setLocalJobs] = useState<JobRecord[]>([]);
    const [playlistJobs, setPlaylistJobs] = useState<JobRecord[]>([]);
    const [resolvedAssets, setResolvedAssets] = useState<Record<number, { thumb?: string; video?: string }>>({});
    const [containerWidth, setContainerWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const jobs = controlledJobs ?? localJobs;
    const sourceJobs = playlistId ? playlistJobs : jobs;
    const isCompleted = (job: JobRecord) => ['complete', 'completed'].includes(job.status.toLowerCase());
    const isError = (job: JobRecord) => ['error', 'failed', 'failure', 'cancelled', 'canceled'].includes(job.status.toLowerCase());
    const normalizedPlatformFilter = (platformFilter ?? 'all').toLowerCase();

    // PagePanel controla qué estados aparecen en la biblioteca; la cola sigue mostrando el progreso completo.
    // Bug #5 FIX: Error jobs are ALWAYS visible in the grid
    const visibleJobs = sourceJobs
        .filter((job) => {
            const isJobError = isError(job);
            // La galería solo contiene medios terminados; el pipeline vive en la cola.
            const statusVisible = isCompleted(job) && !isJobError;
            const keepVisible = (keepStatusFilter ?? 'all') === 'all'
                || job.keep_status === (keepStatusFilter ?? 'all');
            const jobPlatform = job.platform?.toLowerCase() ?? '';
            const platformVisible = normalizedPlatformFilter === 'all'
                || jobPlatform === normalizedPlatformFilter
                || job.url.toLowerCase().includes(normalizedPlatformFilter);
            // A completed row without a local video is stale metadata, not a
            // playable gallery item. Keeping it out avoids a blank card that
            // reports a video but cannot reproduce anything.
            const onlineOnly = job.keep_status === 'online';
            return statusVisible
                && keepVisible
                && platformVisible
                && Boolean(job.status)
                && (Boolean(job.video_path) || onlineOnly);
        });

    // Cálculo de columnas basado en el ancho real, salvo cuando el usuario fija un número.
    const autoColumns = Math.max(1, Math.floor((containerWidth + SPACING) / (CARD_MIN_WIDTH + SPACING)));
    const currentColumns = layout === 'list' ? 1 : columns || autoColumns;

    // -- Fetching de jobs: primero Tauri IPC, si falla usa la REST API --
    const fetchJobs = useCallback(async () => {
                if (playlistId) {
            try {
                let items: JobRecord[];
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    items = await invoke<JobRecord[]>('get_playlist_items', { playlistId });
                } catch {
                    const { REST_API_BASE } = await import('@/lib/api-config');
                    const response = await fetch(`${REST_API_BASE}/playlists/${playlistId}/items`);
                    if (!response.ok) throw new Error(`Playlist request failed with status ${response.status}`);
                    items = await response.json() as JobRecord[];
                }
                setPlaylistJobs(items);
            } catch {
                setPlaylistJobs([]);
            }
            return;
        }

        if (controlledJobs) return;

        let data: JobRecord[] = [];
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

    // -- Resolver rutas locales de assets de manera as�ncrona
    const resolveAssets = useCallback(async (list: JobRecord[]) => {
        const updates: Record<number, { thumb?: string; video?: string }> = {};
        await Promise.all(list.map(async (job) => {
            const [thumb, video] = await Promise.all([
                toAssetUrl(job.thumbnail),
                toAssetUrl(job.video_path),
            ]);
            updates[job.id] = { thumb, video };
        }));
        setResolvedAssets(prev => ({ ...prev, ...updates }));
    }, []);

        useEffect(() => {
        const timer = setTimeout(() => setIsInitialLoad(false), 2000);
        let active = true;
        if (!controlledJobs || playlistId) {
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

        // Escuchar eventos Tauri si est�n disponibles
        let unlistenProgress: (() => void) | undefined;
        let unlistenIndexed: (() => void) | undefined;
        if (!controlledJobs || playlistId) {
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

        const fallbackInterval = (!controlledJobs || playlistId) ? setInterval(fetchJobs, 3000) : undefined;

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
    const isDemoMode = !playlistId && jobs.length === 0;
    const renderList = isDemoMode ? MOCK_ACTIVE_VIDEOS : sortedJobs;
    const showEmptyState = !isDemoMode && !playlistId && renderList.length === 0;
    const inactiveSlotsCount = Math.max(0, INACTIVE_SLOTS_COUNT - renderList.length);

    return (
        <motion.div
            style={{ padding: `${SPACING}px` }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
            {/* Banner de Modo Demo */}
            {isDemoMode && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full mb-6 p-5 rounded-[22px] relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4"
                    style={{
                        background: 'linear-gradient(135deg, rgba(138,92,255,0.12) 0%, rgba(37,244,238,0.08) 50%, rgba(254,44,85,0.12) 100%)',
                        border: '1px solid rgba(138, 92, 255, 0.25)',
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
                    }}
                >
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-[14px] bg-[#8a5cff]/20 border border-[#8a5cff]/40 flex items-center justify-center relative shadow-lg">
                            <FaFolderOpen size={18} className="text-[#25f4ee]" />
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-black text-white tracking-wide uppercase">
                                    Modo Demostración Activo
                                </h3>
                                <span className="text-[9px] font-mono font-bold text-[#25f4ee] px-2 py-0.5 rounded-full bg-[#25f4ee]/15 border border-[#25f4ee]/30">
                                    6 VIDEOS PRECARGADOS
                                </span>
                            </div>
                            <p className="text-xs text-white/70 font-medium leading-relaxed mt-0.5">
                                Mostrando clips interactivos con análisis visual, guías instruccionales y búsqueda semántica listos para explorar.
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}

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
                                {renderList.map((job: any, idx: number) => {
                    const isRealJob = 'status' in job;
                    const assets = isRealJob ? resolvedAssets[job.id] : undefined;
                    const thumbnailSrc = isRealJob ? assets?.thumb : job.thumb;
                    const videoSrc = isRealJob ? assets?.video : job.videoSrc;
                    const isPlaying = activeVideoId === job.id;
                    const onlineOnly = isRealJob && job.keep_status === 'online';

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
                                isActive={Boolean(videoSrc) || onlineOnly}
                                layout={layout}
                                title={job.title || (isRealJob ? job.url : 'Untitled')}
                                author={job.author || 'Unknown'}
                                duration={isRealJob ? formatDuration(job.duration) : job.duration}
                                tags={job.tags || []}
                                thumb={thumbnailSrc}
                                videoSrc={videoSrc}
                                url={job.url}
                                isFullPlaying={isPlaying}
                                onPlayStart={() => onVideoPlayStart(job.id)}
                                onPlayStop={() => onVideoPlayStop(job.id)}
                                keepStatus={job.keep_status}
                                onlineOnly={onlineOnly}
                            />

                        </motion.div>
                    );
                })}

                {showEmptyState && (
                    <div className="col-span-full flex min-h-28 items-center justify-center rounded-[20px] bg-white/[0.015] px-6 text-center">
                        <div>
                            <p className="text-xs font-semibold text-white/55">Sin videos disponibles todavía</p>
                            <p className="mt-1 text-[11px] text-white/30">Los trabajos detenidos quedan en la cola para reintentarse.</p>
                        </div>
                    </div>
                )}

                {/* -- Slots vac�os -- */}
                {Array.from({ length: inactiveSlotsCount }).map((_, i) => {
                    const globalIdx = renderList.length + i;
                    return (
                        <motion.div
                            key={`inactive-${i}`}
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                duration: 0.45,
                                ease: [0.22, 1, 0.36, 1],
                                delay: isInitialLoad ? globalIdx * 0.05 : 0
                            }}
                            style={{ position: 'relative' }}
                        >
                                                        <VideoCard isActive={false} slotIndex={i} layout={layout} />

                        </motion.div>
                    );
                })}
            </div>

            {/* -- Modal expandido -- */}
                        <>

                {activeVideoId !== null && (() => {
                    const allAvailableJobs = playlistId ? [...playlistJobs, ...jobs] : jobs;
                    const activeJob = allAvailableJobs.find(j => j.id === activeVideoId);
                    const mockVideo = MOCK_ACTIVE_VIDEOS.find(m => m.id === activeVideoId);

                    if (!activeJob && !mockVideo) return null;

                    let videoData;
                    if (activeJob) {
                        const assets = resolvedAssets[activeJob.id];
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
                        };
                    } else if (mockVideo) {
                        videoData = mockVideo;
                    } else {
                        return null;
                    }

                    return (
                        <ExpandedVideoModal
                            key={`expanded-video-modal-${activeVideoId}`}
                            video={videoData}
                            onClose={() => onVideoPlayStop(activeVideoId)}
                        />
                    );
                })()}
                        </>

        </motion.div>
    );
}
