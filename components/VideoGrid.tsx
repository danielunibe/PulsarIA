'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { VideoCard } from '@/components/VideoCard';
import { ExpandedVideoModal } from '@/components/ExpandedVideoModal';
import { INACTIVE_SLOTS_COUNT, MOCK_ACTIVE_VIDEOS } from '@/lib/mock-data';

interface VideoGridProps {
    activeVideoId: number | null;
    onVideoPlayStart: (id: number) => void;
    onVideoPlayStop: (id: number) => void;
}

// Gap y padding exterior idénticos → espaciado simétrico en todas las direcciones
const SPACING = 32;        // px — más separación entre cards
const CARD_MIN_WIDTH = 200; // Ancho mínimo deseado para que no se "encojan"

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

// ── Convierte una ruta local de archivo a una URL que Tauri puede renderizar
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

export function VideoGrid({ activeVideoId, onVideoPlayStart, onVideoPlayStop }: VideoGridProps) {
    const [hoveredGlobalIndex, setHoveredGlobalIndex] = useState<number | null>(null);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [jobs, setJobs] = useState<JobRecord[]>([]);
    const [resolvedAssets, setResolvedAssets] = useState<Record<number, { thumb?: string; video?: string }>>({});
    const [containerWidth, setContainerWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Solo mostrar trabajos completados en la Librería de Videos
    const completedJobs = jobs.filter(j => j.status === 'complete');

    // Cálculo dinámico de columnas basándonos en el ancho del contenedor
    const currentColumns = Math.max(1, Math.floor((containerWidth + SPACING) / (CARD_MIN_WIDTH + SPACING)));

    // ── Fetching de jobs: primero Tauri IPC, si falla usa la REST API ──
    const fetchJobs = useCallback(async () => {
        let data: JobRecord[] = [];
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            data = await invoke('get_jobs');
        } catch {
            // Fallback: REST API (funciona en navegador y en Tauri)
            try {
                const response = await fetch('http://localhost:8080/api/v1/jobs');
                if (response.ok) data = await response.json();
            } catch { /* sin conexion */ }
        }
        setJobs(data);
    }, []);

    // ── Resolver rutas locales de assets de manera asíncrona
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

        // Escuchar eventos Tauri si están disponibles
        let unlistenProgress: (() => void) | undefined;
        let unlistenIndexed: (() => void) | undefined;
        (async () => {
            try {
                const { listen } = await import('@tauri-apps/api/event');
                unlistenProgress = await listen<ProgressEvent>('job_progress', () => { fetchJobs(); });
                unlistenIndexed = await listen<number>('media_indexed', () => { fetchJobs(); });
            } catch {
                // No disponible fuera de Tauri — silencioso
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

    // ── Función de animación tipo Mac Dock
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

    // ── Lista a renderizar: jobs completados o mocks si no hay ninguno aún
    const renderList = completedJobs.length > 0 ? completedJobs : MOCK_ACTIVE_VIDEOS;
    const inactiveSlotsCount = Math.max(0, INACTIVE_SLOTS_COUNT - renderList.length);

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
                    display: 'grid',
                    marginTop: '24px',
                    gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}px, 250px))`,
                    gap: containerWidth < 800 ? '16px' : `${SPACING}px`,
                    justifyContent: 'center',
                    paddingBottom: '80px'
                }}
            >
                {/* ── Tarjetas de videos completados o mocks ── */}
                {renderList.map((job: any, idx: number) => {
                    const isRealJob = 'status' in job;
                    const assets = isRealJob ? resolvedAssets[job.id] : undefined;
                    const thumbnailSrc = isRealJob ? assets?.thumb : job.thumb;
                    const videoSrc = isRealJob ? assets?.video : job.videoSrc;
                    const isPlaying = activeVideoId === job.id;

                    return (
                        <motion.div
                            key={`job-${job.id}`}
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
                                isActive={isRealJob}
                                title={job.title || (isRealJob ? job.url : 'Untitled')}
                                author={job.author || 'Unknown'}
                                duration={isRealJob ? formatDuration(job.duration) : job.duration}
                                tags={job.tags || []}
                                thumb={thumbnailSrc}
                                videoSrc={videoSrc}
                                isFullPlaying={isPlaying}
                                onPlayStart={() => onVideoPlayStart(job.id)}
                                onPlayStop={() => onVideoPlayStop(job.id)}
                            />
                        </motion.div>
                    );
                })}

                {/* ── Slots vacíos ── */}
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

            {/* ── Modal expandido ── */}
            <AnimatePresence>
                {activeVideoId !== null && (() => {
                    const activeJob = jobs.find(j => j.id === activeVideoId);
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
                            key="expanded-video-modal"
                            video={videoData}
                            onClose={() => onVideoPlayStop(activeVideoId)}
                        />
                    );
                })()}
            </AnimatePresence>
        </motion.div>
    );
}
