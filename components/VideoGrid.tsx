'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'motion/react';
import { VideoCard } from '@/components/VideoCard';
import { INACTIVE_SLOTS_COUNT, MOCK_ACTIVE_VIDEOS } from '@/lib/mock-data';
import { FaFolderOpen } from 'react-icons/fa6';

const ExpandedVideoModal = dynamic(
    () => import('@/components/ExpandedVideoModal').then((mod) => mod.ExpandedVideoModal),
    { ssr: false }
);

interface VideoGridProps {
    activeVideoId: number | null;
    onVideoPlayStart: (id: number) => void;
    onVideoPlayStop: (id: number) => void;
    sortKey?: string;
    playlistId?: number;
    layout?: 'grid' | 'list' | 'compact';
    columns?: 0 | 2 | 3 | 4;
    showOnlyCompleted?: boolean;
    showErrors?: boolean;
    onJobsChange?: (jobs: JobRecord[]) => void;
    keepStatusFilter?: string;
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

interface JobRecord {
    id: number;
    url: string;
    status: string;
    progress: number;
    created_at: string;
    title?: string;
    author?: string;
    thumbnail?: string;
    duration?: number;
    video_path?: string;
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

export function VideoGrid({ activeVideoId, onVideoPlayStart, onVideoPlayStop, sortKey, playlistId, onJobsChange, keepStatusFilter, platformFilter }: VideoGridProps) {
    const [hoveredGlobalIndex, setHoveredGlobalIndex] = useState<number | null>(null);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [jobs, setJobs] = useState<JobRecord[]>([]);
    const [playlistJobs, setPlaylistJobs] = useState<JobRecord[]>([]);
    const [resolvedAssets, setResolvedAssets] = useState<Record<number, { thumb?: string; video?: string }>>({});
    const [containerWidth, setContainerWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Solo mostrar trabajos completados en la Librer�a de Videos
    const completedJobs = (playlistId ? playlistJobs.filter(j => j.status === 'complete') : jobs.filter(j => j.status === 'complete'))
    .filter(j => (keepStatusFilter ?? 'all') === 'all' || (j as any).keep_status === (keepStatusFilter ?? 'all'))
    .filter(j => (platformFilter ?? 'all') === 'all' || (j as any).platform === (platformFilter ?? 'all') || (j.url || '').includes(platformFilter ?? 'all'));

    // C�lculo din�mico de columnas bas�ndonos en el ancho del contenedor
    const currentColumns = Math.max(1, Math.floor((containerWidth + SPACING) / (CARD_MIN_WIDTH + SPACING)));

    // -- Fetching de jobs: primero Tauri IPC, si falla usa la REST API --
    const fetchJobs = useCallback(async () => {
        if (playlistId) {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const items = await invoke<JobRecord[]>('get_playlist_items', { playlistId });
                setPlaylistJobs(items);
                if (onJobsChange) onJobsChange(items);
            } catch {
                setPlaylistJobs([]);
            }
            return;
        }
        let data: JobRecord[] = [];
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            data = await invoke('get_jobs');
        } catch {
            try {
                const response = await fetch('http://localhost:8080/api/v1/jobs');
                if (response.ok) data = await response.json();
            } catch { /* sin conexion */ }
        }
        setJobs(data);
        if (onJobsChange) onJobsChange(data);
        setPlaylistJobs([]);
    }, [playlistId]);

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
        fetchJobs();

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
        (async () => {
            try {
                const { listen } = await import('@tauri-apps/api/event');
                unlistenProgress = await listen<ProgressEvent>('job_progress', () => { fetchJobs(); });
                unlistenIndexed = await listen<number>('media_indexed', () => { fetchJobs(); });
            } catch {
                // No disponible fuera de Tauri � silencioso
            }
        })();

        const fallbackInterval = setInterval(fetchJobs, 3000);

        return () => {
            clearTimeout(timer);
            clearInterval(fallbackInterval);
            observer.disconnect();
            unlistenProgress?.();
            unlistenIndexed?.();
        };
    }, [fetchJobs]);

    // Resolver assets cada vez que cambian los jobs
    useEffect(() => {
        if (jobs.length > 0) resolveAssets(jobs);
    }, [jobs, resolveAssets]);

    // -- Funci�n de animaci�n tipo Mac Dock
    const getCardAnimation = (idx: number, isInitial: boolean) => {
        const isMedium = containerWidth < 1100;
        const isSmall = containerWidth < 800;

        let baseScale = 1;
        if (isSmall) baseScale = 0.88;
        else if (isMedium) baseScale = 0.94;

        const hoverScale = isSmall ? 0.96 : (isMedium ? 1.02 : 1.08);
        const hoverY = isSmall ? -5 : -12;
        const pushX = isSmall ? 25 : 48; // Aumentado de 28 a 48 para evitar solapamiento

        const base = isInitial
            ? { opacity: 0, y: 32, scale: baseScale * 0.96 }
            : { opacity: 1, y: 0, scale: baseScale, x: 0, zIndex: 1 };

        if (hoveredGlobalIndex === null) return base;

        if (hoveredGlobalIndex === idx) {
            return { opacity: 1, y: hoverY, scale: hoverScale, x: 0, zIndex: 10 };
        }

        const hoveredRow = Math.floor(hoveredGlobalIndex / currentColumns);
        const currentRow = Math.floor(idx / currentColumns);
        if (hoveredRow !== currentRow) return { ...base, opacity: 0.8 };
        if (idx < hoveredGlobalIndex) return { opacity: 1, y: 0, scale: baseScale, x: -pushX, zIndex: 1 };
        if (idx > hoveredGlobalIndex) return { opacity: 1, y: 0, scale: baseScale, x: pushX, zIndex: 1 };
        return base;
    };

    const formatDuration = (seconds?: number) => {
        if (!seconds) return '00:00';
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // -- Lista a renderizar: jobs completados reales
    const sortedJobs = [...completedJobs].sort((a, b) => {
      switch (sortKey) {
        case 'date_asc':  return a.id - b.id;
        case 'date_desc': return b.id - a.id;
        case 'title':     return (a.title || '').localeCompare(b.title || '');
        case 'duration':  return (b.duration || 0) - (a.duration || 0);
        default:          return b.id - a.id;
      }
    });
    const showEmptyState = sortedJobs.length === 0;
    const renderList = sortedJobs;
    const inactiveSlotsCount = showEmptyState ? 8 : Math.max(0, INACTIVE_SLOTS_COUNT - renderList.length);

    return (
        <motion.div
            style={{ padding: `${SPACING}px` }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
            {/* Nota de Estado Vacío: No hay videos completados */}
            {showEmptyState && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full mb-6 p-6 rounded-[24px] relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-5"
                    style={{
                        background: 'linear-gradient(135deg, rgba(254,44,85,0.08) 0%, rgba(37,244,238,0.06) 50%, rgba(138,92,255,0.08) 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(24px)',
                        boxShadow: '0 12px 35px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
                    }}
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-[16px] bg-white/5 border border-white/10 flex items-center justify-center relative shadow-lg">
                            <div className="absolute inset-0 bg-[#fe2c55]/20 rounded-[16px] blur-sm animate-pulse" />
                            <FaFolderOpen size={22} className="text-[#fe2c55] relative z-10" />
                        </div>
                        <div className="flex flex-col">
                            <h3 className="text-base font-black text-white tracking-wide uppercase flex items-center gap-2">
                                <span>No hay videos completados</span>
                                <span className="text-[9px] font-mono text-[#25f4ee] px-2 py-0.5 rounded-full bg-[#25f4ee]/10 border border-[#25f4ee]/20">
                                    BIBLIOTECA VACÍA
                                </span>
                            </h3>
                            <p className="text-xs text-white/60 font-medium leading-relaxed max-w-xl mt-0.5">
                                Aún no has procesado ningún video. Pega un enlace de TikTok en el panel izquierdo y haz clic en <span className="text-white font-bold">Procesar Contenido</span> para iniciar la descarga, transcripción e indexado con IA.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 font-mono">
                            0 VIDEOS LISTOS
                        </span>
                    </div>
                </motion.div>
            )}

            <div
                ref={containerRef}
                className="video-grid-container"
                style={{
                    display: 'grid',
                    marginTop: '12px',
                    gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}px, 1fr))`,
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

                    return (
                        <motion.div
                            key={job.id}
                            layoutId={`video-card-${job.id}`}
                            initial={getCardAnimation(idx, true)}
                            animate={getCardAnimation(idx, false)}
                            transition={{
                                type: 'spring',
                                stiffness: 450,
                                damping: 35,
                                mass: 0.8,
                                delay: isInitialLoad && hoveredGlobalIndex === null ? idx * 0.05 : 0
                            }}
                            onMouseEnter={() => setHoveredGlobalIndex(idx)}
                            onMouseLeave={() => setHoveredGlobalIndex(null)}
                            style={{ position: 'relative' }}
                        >
                            <VideoCard
                                id={job.id}
                                isActive={isRealJob}
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
                                keepStatus={(job as any).keep_status}
                            />
                        </motion.div>
                    );
                })}

                {/* -- Slots vac�os -- */}
                {Array.from({ length: inactiveSlotsCount }).map((_, i) => {
                    const globalIdx = renderList.length + i;
                    return (
                        <motion.div
                            key={`inactive-${i}`}
                            initial={getCardAnimation(globalIdx, true)}
                            animate={getCardAnimation(globalIdx, false)}
                            transition={{
                                type: 'spring',
                                stiffness: 450,
                                damping: 35,
                                mass: 0.8,
                                delay: isInitialLoad && hoveredGlobalIndex === null ? globalIdx * 0.05 : 0
                            }}
                            onMouseEnter={() => setHoveredGlobalIndex(globalIdx)}
                            onMouseLeave={() => setHoveredGlobalIndex(null)}
                            style={{ position: 'relative' }}
                        >
                            <VideoCard isActive={false} slotIndex={i} />
                        </motion.div>
                    );
                })}
            </div>

            {/* -- Modal expandido -- */}
            <AnimatePresence>
                {activeVideoId !== null && (() => {
                    const allAvailableJobs = playlistId ? [...playlistJobs, ...jobs] : jobs;
                    const activeJob = allAvailableJobs.find(j => j.id === activeVideoId);
                    if (!activeJob) return null;
                    const assets = resolvedAssets[activeJob.id];
                    const videoData = {
                        id: activeJob.id,
                        title: activeJob.title || activeJob.url,
                        author: activeJob.author || 'Unknown',
                        duration: formatDuration(activeJob.duration),
                        tags: [] as string[],
                        thumb: assets?.thumb || '',
                        videoSrc: assets?.video || ''
                    };
                    return (
                        <ExpandedVideoModal
                            key={`expanded-video-modal-${activeVideoId}`}
                            video={videoData}
                            onClose={() => onVideoPlayStop(activeVideoId)}
                        />
                    );
                })()}
            </AnimatePresence>
        </motion.div>
    );
}
