'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react';
import { FaChevronLeft, FaChevronRight, FaFilm, FaPause, FaPlay, FaVolumeHigh, FaVolumeXmark, FaXmark } from 'react-icons/fa6';
import { toast } from 'sonner';
import type { CinemaVideo } from '@/types';

const ENTER_DURATION_MS = 720;
const EXIT_DURATION_MS = 380;
const DRAG_THRESHOLD_PX = 52;

interface CinemaModeProps {
    videos: CinemaVideo[];
    initialIndex?: number;
    onClose: () => void;
}

type FullscreenKind = 'tauri' | 'document' | 'none';

function circularOffset(itemIndex: number, activeIndex: number, length: number) {
    if (length <= 1) return 0;
    let offset = itemIndex - activeIndex;
    if (offset > length / 2) offset -= length;
    if (offset < -length / 2) offset += length;
    return offset;
}

function sourceLabel(video: CinemaVideo) {
    if (video.videoSrc) return 'Disponible localmente';
    if (video.sourceState === 'online') return 'Ficha conservada · fuente online';
    return 'Ficha conservada · fuente no disponible';
}

export function CinemaMode({ videos, initialIndex = 0, onClose }: CinemaModeProps) {
    const [mounted, setMounted] = useState(false);
    const [phase, setPhase] = useState<'entering' | 'active' | 'exiting'>('entering');
    const [activeIndex, setActiveIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(videos.length - 1, 0)));
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [playbackError, setPlaybackError] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(false);
    const reducedMotionRef = useRef(false);
    const stageRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
    const wheelLockedRef = useRef(false);
    const fullscreenKindRef = useRef<FullscreenKind>('none');
    const previousTauriFullscreenRef = useRef(false);
    const fullscreenRestoredRef = useRef(false);
    const current = videos[activeIndex];

    useEffect(() => {
        setMounted(true);
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const updateMotionPreference = () => {
            reducedMotionRef.current = media.matches;
            setReducedMotion(media.matches);
        };
        updateMotionPreference();
        media.addEventListener('change', updateMotionPreference);
        return () => media.removeEventListener('change', updateMotionPreference);
    }, []);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    const restoreFullscreen = useCallback(async () => {
        if (fullscreenRestoredRef.current) return;
        fullscreenRestoredRef.current = true;

        try {
            if (fullscreenKindRef.current === 'tauri') {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                await getCurrentWindow().setFullscreen(previousTauriFullscreenRef.current);
            } else if (fullscreenKindRef.current === 'document' && document.fullscreenElement) {
                await document.exitFullscreen();
            }
        } catch {
            // The window may already have been restored by the operating system.
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const enterFullscreen = async () => {
            const runtimeWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
            const isTauri = Boolean(runtimeWindow.__TAURI_INTERNALS__)
                || window.location.protocol === 'tauri:'
                || window.location.hostname === 'tauri.localhost';

            if (isTauri) {
                try {
                    const { getCurrentWindow } = await import('@tauri-apps/api/window');
                    const currentWindow = getCurrentWindow();
                    previousTauriFullscreenRef.current = await currentWindow.isFullscreen();
                    if (!previousTauriFullscreenRef.current) await currentWindow.setFullscreen(true);
                    fullscreenKindRef.current = 'tauri';
                } catch {
                    toast.info('Cinema activo dentro de la ventana', {
                        description: 'No se pudo activar el fullscreen nativo, pero la experiencia sigue disponible.',
                        duration: 3500,
                    });
                }
            } else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
                try {
                    await document.documentElement.requestFullscreen();
                    fullscreenKindRef.current = 'document';
                } catch {
                    // CSS immersive fallback is still available in browser preview.
                }
            }

            if (cancelled) return;
            stageRef.current?.focus();
            window.setTimeout(() => {
                if (!cancelled) setPhase('active');
            }, reducedMotionRef.current ? 160 : ENTER_DURATION_MS);
        };

        void enterFullscreen();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (mounted) stageRef.current?.focus();
    }, [mounted]);

    useEffect(() => {
        if (phase !== 'exiting') return;
        const timer = window.setTimeout(() => {
            void restoreFullscreen().finally(onClose);
        }, reducedMotion ? 140 : EXIT_DURATION_MS);
        return () => window.clearTimeout(timer);
    }, [onClose, phase, reducedMotion, restoreFullscreen]);

    useEffect(() => {
        if (current?.id === undefined) return;
        setIsPlaying(false);
        setPlaybackError(false);
        const video = videoRef.current;
        if (video) {
            video.pause();
            video.currentTime = 0;
        }
    }, [current?.id]);

    useEffect(() => () => {
        void restoreFullscreen();
    }, [restoreFullscreen]);

    const requestClose = useCallback(() => {
        if (phase !== 'exiting') {
            setIsPlaying(false);
            setPhase('exiting');
        }
    }, [phase]);

    const move = useCallback((direction: -1 | 1) => {
        if (videos.length <= 1) return;
        setActiveIndex((index) => (index + direction + videos.length) % videos.length);
    }, [videos.length]);

    const togglePlayback = useCallback(() => {
        const video = videoRef.current;
        if (!video || !current?.videoSrc) return;
        if (video.paused) {
            void video.play().then(() => setIsPlaying(true)).catch(() => setPlaybackError(true));
        } else {
            video.pause();
            setIsPlaying(false);
        }
    }, [current?.videoSrc]);

    const toggleMute = useCallback(() => {
        setIsMuted((muted) => {
            if (videoRef.current) videoRef.current.muted = !muted;
            return !muted;
        });
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                requestClose();
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                move(-1);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                move(1);
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                togglePlayback();
            } else if (event.key === 'Home') {
                event.preventDefault();
                setActiveIndex(0);
            } else if (event.key === 'End') {
                event.preventDefault();
                setActiveIndex(Math.max(videos.length - 1, 0));
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [move, requestClose, togglePlayback, videos.length]);

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if ((event.target as HTMLElement).closest('button')) return;
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        const start = pointerStartRef.current;
        pointerStartRef.current = null;
        if (!start) return;
        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;
        if (Math.abs(deltaX) < DRAG_THRESHOLD_PX || Math.abs(deltaX) < Math.abs(deltaY)) return;
        move(deltaX < 0 ? 1 : -1);
    };

    const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (wheelLockedRef.current || Math.max(Math.abs(event.deltaX), Math.abs(event.deltaY)) < 12) return;
        wheelLockedRef.current = true;
        move((event.deltaX || event.deltaY) > 0 ? 1 : -1);
        window.setTimeout(() => { wheelLockedRef.current = false; }, reducedMotion ? 120 : 260);
    };

    if (!mounted || !current || videos.length === 0) return null;

    const visibleCards = videos
        .map((video, index) => ({ video, index, offset: circularOffset(index, activeIndex, videos.length) }))
        .filter(({ offset }) => Math.abs(offset) <= 2)
        .sort((a, b) => a.offset - b.offset);

    const rootClassName = `cinema-root cinema-${phase}${reducedMotion ? ' cinema-reduced-motion' : ''}`;
    const cardStyle = (offset: number): CSSProperties => ({
        '--cinema-offset': offset,
        '--cinema-depth': Math.max(0, 1 - Math.abs(offset) * 0.18),
        '--cinema-opacity': Math.max(0.24, 1 - Math.abs(offset) * 0.31),
    } as CSSProperties);

    return createPortal(
        <div
            ref={stageRef}
            className={rootClassName}
            role="dialog"
            aria-modal="true"
            aria-label="Modo Cinema"
            tabIndex={-1}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { pointerStartRef.current = null; }}
            onWheel={handleWheel}
        >
            <div className="cinema-aura" aria-hidden="true" />
            <div className="cinema-blackout" aria-hidden="true" />

            <header className="cinema-header">
                <div className="cinema-brand">
                    <span className="cinema-brand-mark"><FaFilm size={12} /></span>
                    <span>PULSARIA <em>/ CINEMA</em></span>
                </div>
                <button type="button" className="cinema-close" onClick={requestClose} aria-label="Salir del modo Cinema" title="Salir del modo Cinema">
                    <FaXmark size={14} />
                    <span>Salir</span>
                </button>
            </header>

            <main className="cinema-stage" aria-live="polite">
                <button
                    type="button"
                    className="cinema-nav cinema-nav-left"
                    onClick={() => move(-1)}
                    aria-label="Video anterior"
                    disabled={videos.length <= 1}
                >
                    <FaChevronLeft size={16} />
                </button>

                <div className="cinema-coverflow" aria-label={`Video ${activeIndex + 1} de ${videos.length}`}>
                    {visibleCards.map(({ video, index, offset }) => {
                        const isCurrent = offset === 0;
                        return (
                            <button
                                type="button"
                                key={video.id}
                                className={`cinema-card cinema-card-${isCurrent ? 'current' : 'side'}`}
                                style={cardStyle(offset)}
                                onClick={() => isCurrent ? togglePlayback() : setActiveIndex(index)}
                                aria-label={isCurrent ? `${isPlaying ? 'Pausar' : 'Reproducir'} ${video.title}` : `Ver ${video.title}`}
                            >
                                {isCurrent && video.videoSrc ? (
                                    <video
                                        ref={videoRef}
                                        key={video.id}
                                        className="cinema-media"
                                        src={video.videoSrc}
                                        poster={video.thumb || undefined}
                                        muted={isMuted}
                                        autoPlay
                                        loop
                                        playsInline
                                        onPlay={() => setIsPlaying(true)}
                                        onPause={() => setIsPlaying(false)}
                                        onLoadedData={(event) => {
                                            event.currentTarget.muted = isMuted;
                                            void event.currentTarget.play().catch(() => undefined);
                                        }}
                                        onError={() => setPlaybackError(true)}
                                    />
                                ) : video.thumb ? (
                                    // Tauri asset URLs are resolved at runtime and cannot use Next's image optimizer.
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="cinema-media" src={video.thumb} alt="" draggable={false} />
                                ) : (
                                    <span className="cinema-no-media"><FaFilm size={28} /></span>
                                )}
                                <span className="cinema-card-shade" aria-hidden="true" />
                                {isCurrent && (
                                    <span className="cinema-card-overlay">
                                        <span className={`cinema-play-indicator${isPlaying ? ' is-playing' : ''}`} aria-hidden="true">
                                            {isPlaying ? <FaPause size={18} /> : <FaPlay size={18} />}
                                        </span>
                                        {playbackError && <span className="cinema-error">No se pudo reproducir este archivo</span>}
                                        <span className="cinema-card-copy">
                                            <span className="cinema-card-author">{video.author ? `@${video.author}` : 'TikTok'}</span>
                                            <strong>{video.title || `Video #${video.id}`}</strong>
                                            <small>{sourceLabel(video)}</small>
                                        </span>
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <button
                    type="button"
                    className="cinema-nav cinema-nav-right"
                    onClick={() => move(1)}
                    aria-label="Video siguiente"
                    disabled={videos.length <= 1}
                >
                    <FaChevronRight size={16} />
                </button>
            </main>

            <footer className="cinema-footer">
                <div className="cinema-progress" aria-label={`Video ${activeIndex + 1} de ${videos.length}`}>
                    <span>{String(activeIndex + 1).padStart(2, '0')}</span>
                    <span className="cinema-progress-line"><i style={{ width: `${((activeIndex + 1) / videos.length) * 100}%` }} /></span>
                    <span>{String(videos.length).padStart(2, '0')}</span>
                </div>
                <div className="cinema-controls">
                    <button type="button" onClick={togglePlayback} aria-label={isPlaying ? 'Pausar video' : 'Reproducir video'} title={isPlaying ? 'Pausar' : 'Reproducir'} disabled={!current.videoSrc}>
                        {isPlaying ? <FaPause size={12} /> : <FaPlay size={12} />}
                    </button>
                    <button type="button" onClick={toggleMute} aria-label={isMuted ? 'Activar sonido' : 'Silenciar video'} title={isMuted ? 'Activar sonido' : 'Silenciar video'} disabled={!current.videoSrc}>
                        {isMuted ? <FaVolumeXmark size={13} /> : <FaVolumeHigh size={13} />}
                    </button>
                    <span className="cinema-hint">← → navegar · rueda o arrastre · Esc salir</span>
                </div>
            </footer>
        </div>,
        document.body,
    );
}
