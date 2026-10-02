'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import type { CinemaVideo, TranscriptChunk } from '@/types';
import { useSettings } from '@/lib/settings-context';
import { isTauriRuntime } from '@/hooks/use-processing-settings';
import { PulsariaIcon } from '@/components/Header';
import {
    FaBookmark,
    FaChevronLeft,
    FaChevronRight,
    FaClosedCaptioning,
    FaCommentDots,
    FaHeart,
    FaPause,
    FaPlay,
    FaRotate,
    FaShareNodes,
    FaVolumeHigh,
    FaVolumeXmark,
    FaXmark,
} from '@/components/icon-library';

interface CinemaPlaybackProps {
    videos: CinemaVideo[];
    initialVideoId?: number;
    onClose: () => void;
}

interface LocalComment {
    id: string;
    text: string;
    createdAt: string;
}

type StyleVars = CSSProperties & Record<`--${string}`, string | number>;

function formatTime(value: number) {
    if (!Number.isFinite(value)) return '00:00';
    const seconds = Math.max(0, Math.floor(value));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatCount(value: number) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return String(value);
}

function resolveSubtitleStyle(style: string, chunks: TranscriptChunk[], reducedMotion: boolean) {
    if (style !== 'auto') return style;
    if (reducedMotion || chunks.some((chunk) => !chunk.words?.length)) return 'minimal';
    const averageWords = chunks.reduce((sum, chunk) => sum + (chunk.words?.length ?? 0), 0) / Math.max(chunks.length, 1);
    return averageWords >= 5 ? 'karaoke' : 'cinematic';
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function CinemaPlayback({ videos, initialVideoId, onClose }: CinemaPlaybackProps) {
    const { settings, updateSettings } = useSettings();
    const firstIndex = Math.max(0, videos.findIndex((video) => video.id === initialVideoId));
    const [index, setIndex] = useState(firstIndex);
    const [position, setPosition] = useState(firstIndex);
    const [playing, setPlaying] = useState(true);
    const [muted, setMuted] = useState(true);
    const [volume, setVolume] = useState(0.8);
    const [rate, setRate] = useState(1);
    const [autoAdvance, setAutoAdvance] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [commentMap, setCommentMap] = useState<Record<number, LocalComment[]>>({});
    const [liked, setLiked] = useState<Record<number, boolean>>({});
    const [saved, setSaved] = useState<Record<number, boolean>>({});
    const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [progressDragging, setProgressDragging] = useState(false);
    const [progressTip, setProgressTip] = useState('00:00');
    const [progressTipPosition, setProgressTipPosition] = useState(0);
    const [toast, setToast] = useState('');
    const [isIdle, setIsIdle] = useState(false);
    const [failedVideos, setFailedVideos] = useState<Record<number, boolean>>({});
    const [metrics, setMetrics] = useState({ width: 0, height: 0, cardWidth: 0, cardHeight: 0, step: 0 });
    const mediaRefs = useRef<Array<HTMLVideoElement | null>>([]);
    const auroraVideoRef = useRef<HTMLVideoElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const progressTrackRef = useRef<HTMLDivElement>(null);
    const positionRef = useRef(firstIndex);
    const targetRef = useRef(firstIndex);
    const indexRef = useRef(firstIndex);
    const draggingRef = useRef(false);
    const movedRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragStartPositionRef = useRef(firstIndex);
    const lastPointerXRef = useRef(0);
    const lastWheelRef = useRef(0);
    const velocityRef = useRef(0);
    const dragVelocityRef = useRef(0);
    const previousDragPositionRef = useRef(firstIndex);
    const previousDragTimeRef = useRef(0);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const transcriptCacheRef = useRef(new Map<number, TranscriptChunk[]>());
    const current = videos[index] ?? videos[0];
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const activeStyle = resolveSubtitleStyle(settings.subtitleStyle, chunks, reducedMotion);
    const activeChunk = chunks.find((chunk) => currentTime >= chunk.start && currentTime <= chunk.end);
    const comments = current ? commentMap[current.id] ?? [] : [];
    const isPlayable = Boolean(current?.videoSrc) && current?.mediaKind !== 'image';
    const hue = (320 + index * 47) % 360;
    const cardStep = metrics.step || 1;

    const notify = useCallback((message: string) => {
        setToast(message);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(''), 2200);
    }, []);

    const move = useCallback((direction: -1 | 1) => {
        if (!videos.length) return;
        targetRef.current = clamp(Math.round(targetRef.current) + direction, 0, videos.length - 1);
    }, [videos.length]);

    const goTo = useCallback((nextIndex: number) => {
        targetRef.current = clamp(nextIndex, 0, videos.length - 1);
    }, [videos.length]);

    useEffect(() => {
        let animationFrame = 0;
        let lastTime = 0;
        const frame = (now: number) => {
            const previous = lastTime || now;
            lastTime = now;
            const dt = Math.min(0.05, Math.max(0.001, (now - previous) / 1000));
            const target = targetRef.current;
            const positionNow = positionRef.current;
            if (reducedMotion) {
                positionRef.current = target;
                velocityRef.current = 0;
            } else {
                const omega = draggingRef.current ? 34 : 22;
                const x = positionNow - target;
                const decay = Math.exp(-omega * dt);
                const b = velocityRef.current + omega * x;
                const nextX = (x + b * dt) * decay;
                velocityRef.current = (b - omega * (x + b * dt)) * decay;
                if (Math.abs(nextX) < 0.0005 && Math.abs(velocityRef.current) < 0.0005) {
                    positionRef.current = target;
                    velocityRef.current = 0;
                } else {
                    positionRef.current = target + nextX;
                }
            }
            setPosition(positionRef.current);
            const rounded = clamp(Math.round(positionRef.current), 0, videos.length - 1);
            if (rounded !== indexRef.current) {
                indexRef.current = rounded;
                setIndex(rounded);
            }
            animationFrame = requestAnimationFrame(frame);
        };
        animationFrame = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(animationFrame);
    }, [reducedMotion, videos.length]);

    useEffect(() => {
        const measure = () => {
            const card = stageRef.current?.querySelector<HTMLElement>('.cinema-reference__card');
            const width = window.innerWidth;
            const height = window.innerHeight;
            const cardWidth = card?.offsetWidth ?? Math.min(height * (width <= 960 ? 0.4275 : 0.4725), width * 0.5625);
            const cardHeight = card?.offsetHeight ?? height * (width <= 960 ? 0.76 : 0.84);
            setMetrics({ width, height, cardWidth, cardHeight, step: width / 2 + cardWidth * 0.34 });
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [videos.length]);

    useEffect(() => {
        const wake = () => {
            setIsIdle(false);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            idleTimerRef.current = setTimeout(() => setIsIdle(true), 2600);
        };
        const events: Array<keyof WindowEventMap> = ['pointermove', 'pointerdown', 'keydown'];
        events.forEach((event) => window.addEventListener(event, wake));
        wake();
        return () => {
            events.forEach((event) => window.removeEventListener(event, wake));
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!current) return;
        const cached = transcriptCacheRef.current.get(current.id);
        if (cached) {
            setChunks(cached);
            return;
        }
        setChunks([]);
        if (!isTauriRuntime() || current.isDemo) return;
        let active = true;
        void (async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const result = await invoke<TranscriptChunk[]>('get_transcript', { jobId: current.id });
                if (active) {
                    transcriptCacheRef.current.set(current.id, result);
                    setChunks(result);
                }
            } catch {
                if (active) setChunks([]);
            }
        })();
        return () => { active = false; };
    }, [current]);

    useEffect(() => {
        const media = mediaRefs.current[index];
        mediaRefs.current.forEach((otherMedia, mediaIndex) => {
            if (otherMedia && mediaIndex !== index) otherMedia.pause();
        });
        setCurrentTime(0);
        setDuration(0);
        setBuffered(0);
        if (!media) {
            setPlaying(false);
            return;
        }
        media.currentTime = 0;
    }, [current, index]);

    useEffect(() => {
        const echo = auroraVideoRef.current;
        const media = mediaRefs.current[index];
        if (!echo || !media || !isPlayable) {
            echo?.pause();
            return;
        }
        if (echo.src !== media.src) {
            echo.src = media.currentSrc || current.videoSrc;
            echo.load();
        }
        const syncEcho = () => {
            if (media.paused) echo.pause();
            else void echo.play().catch(() => undefined);
            if (Math.abs(echo.currentTime - media.currentTime) > 0.3) {
                try { echo.currentTime = media.currentTime; } catch { /* metadata is not ready yet */ }
            }
        };
        media.addEventListener('play', syncEcho);
        media.addEventListener('pause', syncEcho);
        media.addEventListener('timeupdate', syncEcho);
        syncEcho();
        return () => {
            media.removeEventListener('play', syncEcho);
            media.removeEventListener('pause', syncEcho);
            media.removeEventListener('timeupdate', syncEcho);
            echo.pause();
        };
    }, [current?.videoSrc, index, isPlayable]);

    useEffect(() => {
        const media = mediaRefs.current[index];
        if (!media) return;
        media.muted = muted;
        media.volume = volume;
        media.playbackRate = rate;
        if (playing) void media.play().catch(() => setPlaying(false));
        else media.pause();
    }, [index, muted, playing, rate, volume]);

    useEffect(() => () => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    }, []);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.matches('input, textarea, [contenteditable="true"]') || target?.closest('.cinema-reference__progress')) {
                if (event.key !== 'Escape') return;
            }
            if (event.code === 'Space') { event.preventDefault(); setPlaying((value) => !value); }
            else if (event.key === 'ArrowLeft') move(-1);
            else if (event.key === 'ArrowRight') move(1);
            else if (event.key.toLowerCase() === 'm') setMuted((value) => !value);
            else if (event.key.toLowerCase() === 'l' && current) setLiked((value) => ({ ...value, [current.id]: !value[current.id] }));
            else if (event.key.toLowerCase() === 'f') void document.documentElement.requestFullscreen?.().catch(() => undefined);
            else if (event.key === 'Escape') commentsOpen ? setCommentsOpen(false) : onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [commentsOpen, current, move, onClose]);

    const setProgressFromPointer = (clientX: number) => {
        const media = mediaRefs.current[index];
        const track = progressTrackRef.current;
        if (!media || !track || !media.duration) return;
        const rect = track.getBoundingClientRect();
        const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
        media.currentTime = ratio * media.duration;
    };

    const updateProgressTip = (clientX: number) => {
        const media = mediaRefs.current[index];
        const track = progressTrackRef.current;
        if (!media?.duration || !track) return;
        const rect = track.getBoundingClientRect();
        const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
        setProgressTipPosition(ratio * 100);
        setProgressTip(formatTime(ratio * media.duration));
    };

    const handleStageWheel = (event: WheelEvent<HTMLDivElement>) => {
        if (!(event.target as Element).closest('.cinema-reference__card')) return;
        if (Date.now() - lastWheelRef.current < 450 || Math.abs(event.deltaY) < 20) return;
        event.preventDefault();
        lastWheelRef.current = Date.now();
        move(event.deltaY > 0 ? 1 : -1);
    };

    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if ((event.target as Element).closest('button, input, .cinema-reference__rail, .cinema-reference__drawer, .cinema-reference__progress')) return;
        draggingRef.current = false;
        movedRef.current = false;
        velocityRef.current = 0;
        dragVelocityRef.current = 0;
        dragStartXRef.current = event.clientX;
        lastPointerXRef.current = event.clientX;
        dragStartPositionRef.current = positionRef.current;
        previousDragPositionRef.current = positionRef.current;
        previousDragTimeRef.current = event.timeStamp;
        stageRef.current?.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!stageRef.current?.hasPointerCapture(event.pointerId)) return;
        const dx = event.clientX - dragStartXRef.current;
        if (!draggingRef.current && Math.abs(dx) <= 6) return;
        draggingRef.current = true;
        movedRef.current = true;
        const raw = dragStartPositionRef.current - dx / cardStep;
        const bounded = raw < 0 ? raw * 0.35 : raw > videos.length - 1 ? videos.length - 1 + (raw - (videos.length - 1)) * 0.35 : raw;
        const elapsed = Math.max(1, event.timeStamp - previousDragTimeRef.current);
        dragVelocityRef.current = ((bounded - previousDragPositionRef.current) / elapsed) * 1000;
        previousDragPositionRef.current = bounded;
        previousDragTimeRef.current = event.timeStamp;
        positionRef.current = bounded;
        targetRef.current = bounded;
        lastPointerXRef.current = event.clientX;
    };

    const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (stageRef.current?.hasPointerCapture(event.pointerId)) stageRef.current.releasePointerCapture(event.pointerId);
        if (draggingRef.current) {
            targetRef.current = clamp(Math.round(positionRef.current + dragVelocityRef.current * 0.1), 0, videos.length - 1);
            velocityRef.current = 0;
        }
        draggingRef.current = false;
        dragVelocityRef.current = 0;
        window.setTimeout(() => { movedRef.current = false; }, 0);
    };

    const submitComment = () => {
        const text = commentText.trim();
        if (!text || !current) return;
        const comment: LocalComment = { id: `${Date.now()}`, text, createdAt: 'ahora' };
        setCommentMap((value) => ({ ...value, [current.id]: [comment, ...(value[current.id] ?? [])] }));
        setCommentText('');
        notify('Comentario guardado localmente');
    };

    const shareCurrent = () => {
        const source = current?.originalUrl || current?.videoSrc;
        if (!source) return;
        void navigator.clipboard?.writeText(source).then(() => notify('Enlace copiado')).catch(() => undefined);
    };

    const togglePlayback = () => setPlaying((value) => !value);
    const currentLikes = (liked[current?.id ?? -1] ? 1 : 0);
    const styleVars: StyleVars = {
        '--cinema-hue': hue,
        '--cinema-buffer': `${buffered}%`,
        '--cinema-aurora-width': metrics.cardWidth ? `${metrics.cardWidth * 1.14}px` : 'calc(var(--cinema-cw) * 1.14)',
        '--cinema-aurora-height': metrics.cardHeight ? `${metrics.cardHeight * 1.14}px` : 'calc(var(--cinema-card-height) * 1.14)',
        '--cinema-aurora-x': metrics.width ? `${metrics.width / 2 + (index - position) * cardStep - metrics.cardWidth * 0.57}px` : 'calc(50vw - var(--cinema-cw) * 0.57)',
        '--cinema-aurora-y': metrics.height ? `${metrics.height / 2 - metrics.cardHeight * 0.57}px` : 'calc(50vh - var(--cinema-card-height) * 0.57)',
    };

    if (!current) return null;

    return (
        <div className={`cinema-reference ${isIdle ? 'is-idle' : ''}`} style={styleVars}>
            <div className="cinema-reference__spot" aria-hidden="true" />
            <div className="cinema-reference__floor" aria-hidden="true" />
            <div className="cinema-reference__pool" aria-hidden="true" />
            <div className="cinema-reference__aurora" aria-hidden="true">
                {isPlayable && <video ref={auroraVideoRef} muted playsInline preload="metadata" />}
                <div className="cinema-reference__ribbons"><span /><span /><span /></div>
            </div>
            <div className="cinema-reference__grain" aria-hidden="true" />

            <header className="cinema-reference__header">
                <div className="cinema-reference__brand">
                    <span className="cinema-reference__logo"><PulsariaIcon size={26} /></span>
                    <span className="cinema-reference__brand-name">PULSARIA</span>
                    <span className="cinema-reference__badge">CINEMA</span>
                </div>
            </header>

            <div
                ref={stageRef}
                className="cinema-reference__stage"
                onWheel={handleStageWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                {videos.map((video, cardIndex) => {
                    const offset = cardIndex - position;
                    const distance = Math.abs(offset);
                    const focus = clamp(1 - distance, 0, 1);
                    const scale = (0.9 + 0.1 * focus) * (distance > 1.6 ? 0.94 : 1);
                    const opacity = clamp(0.42 + 0.58 * focus, 0.14, 1);
                    const side = distance > 0.45;
                    const cardStyle: StyleVars = {
                        '--cinema-offset': offset,
                        transform: `translate3d(${offset * cardStep}px, -50%, 0) scale(${scale.toFixed(4)})`,
                        opacity,
                        zIndex: Math.round(focus * 10),
                    };
                    const cardPlayable = Boolean(video.videoSrc) && video.mediaKind !== 'image';
                    return (
                        <article
                            key={`${video.id}-${video.slotId || cardIndex}`}
                            className={`cinema-reference__card ${side ? 'is-side' : ''} ${cardIndex === index ? 'is-current' : ''}`}
                            style={cardStyle}
                            onClick={() => {
                                if (movedRef.current) return;
                                if (cardIndex === index) togglePlayback();
                                else goTo(cardIndex);
                            }}
                            onDoubleClick={() => {
                                if (cardIndex === index) setLiked((value) => ({ ...value, [current.id]: true }));
                            }}
                        >
                            {cardPlayable ? (
                                <video
                                    ref={(node) => { mediaRefs.current[cardIndex] = node; }}
                                    src={video.videoSrc}
                                    poster={video.thumb || undefined}
                                    playsInline
                                    muted
                                    preload={cardIndex === index ? 'auto' : 'metadata'}
                                    className="cinema-reference__media"
                                    onPlay={() => { if (cardIndex === index) setPlaying(true); }}
                                    onPause={() => { if (cardIndex === index) setPlaying(false); }}
                                    onLoadedMetadata={(event) => { if (cardIndex === index) setDuration(event.currentTarget.duration); }}
                                    onLoadedData={() => setFailedVideos((value) => ({ ...value, [video.id]: false }))}
                                    onError={() => setFailedVideos((value) => ({ ...value, [video.id]: true }))}
                                    onTimeUpdate={(event) => { if (cardIndex === index) setCurrentTime(event.currentTarget.currentTime); }}
                                    onProgress={(event) => {
                                        if (cardIndex === index && event.currentTarget.buffered.length && event.currentTarget.duration) setBuffered(event.currentTarget.buffered.end(event.currentTarget.buffered.length - 1) / event.currentTarget.duration * 100);
                                    }}
                                    onEnded={() => {
                                        if (cardIndex !== index) return;
                                        if (autoAdvance && index < videos.length - 1) move(1);
                                        else if (autoAdvance) {
                                            const activeMedia = mediaRefs.current[index];
                                            if (activeMedia) {
                                                activeMedia.currentTime = 0;
                                                void activeMedia.play().catch(() => setPlaying(false));
                                            }
                                        } else setPlaying(false);
                                    }}
                                />
                            ) : (
                                <div className="cinema-reference__media cinema-reference__media-image" style={{ backgroundImage: `url(${video.thumb || '/pulsaria-icon.png'})` }} role="img" aria-label={video.title} />
                            )}
                            <div className="cinema-reference__shade" />
                            {cardIndex === index && (
                                <div className="cinema-reference__card-overlay">
                                    <div className="cinema-reference__card-top"><span>{video.sourceState === 'unavailable' ? 'SIN SEÑAL' : video.sourceState === 'online' ? 'ONLINE' : 'LOCAL'}</span><span>{video.duration || '--:--'}</span></div>
                                    {playing && <span className="cinema-reference__play-indicator" aria-hidden="true"><FaPause size={18} /></span>}
                                    {settings.subtitleEnabled && activeChunk && <div className={`cinema-reference__subtitle style-${activeStyle}`}>
                                        {activeStyle === 'karaoke' && activeChunk.words?.length
                                            ? activeChunk.words.map((word) => <span key={`${word.start}-${word.end}`} className={currentTime >= word.start ? 'is-spoken' : ''}>{word.word} </span>)
                                            : activeChunk.chunk_text}
                                    </div>}
                                    <div className="cinema-reference__card-caption"><strong>{video.title || 'Video sin título'}</strong><span>{video.author ? `@${video.author}` : ''}</span></div>
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>

            <aside className={`cinema-reference__caption ${failedVideos[current.id] ? 'is-errored' : ''}`} aria-live="polite">
                {failedVideos[current.id] ? (
                    <div className="cinema-reference__caption-error">
                        <strong>SIN SEÑAL</strong>
                        <button type="button" onClick={() => {
                            const media = mediaRefs.current[index];
                            if (!media) return;
                            setFailedVideos((value) => ({ ...value, [current.id]: false }));
                            media.load();
                            void media.play().then(() => setPlaying(true)).catch(() => setFailedVideos((value) => ({ ...value, [current.id]: true })));
                        }}>Reintentar</button>
                    </div>
                ) : <div className="cinema-reference__caption-normal">
                    <span className="cinema-reference__handle">@{current.author || 'biblioteca.local'}</span>
                    <h1>{current.title || 'Video sin título'}</h1>
                    <p>{current.visualAnalysis || current.instructionalGuide || 'Sin descripción disponible.'}</p>
                    <small>{current.sourceState === 'unavailable' ? 'Fuente no disponible' : current.sourceState === 'online' ? 'Fuente online' : 'Disponible localmente'}</small>
                </div>}
            </aside>

            <div className="cinema-reference__playback-rail" role="group" aria-label="Controles de reproducción">
                <div className="cinema-reference__rail-group">
                    <button type="button" onClick={() => move(-1)} disabled={index === 0} title="Anterior" aria-label="Video anterior"><FaChevronLeft size={18} /></button>
                    <button type="button" className="is-play" onClick={togglePlayback} disabled={!isPlayable} title="Play / Pausa" aria-label={playing ? 'Pausar' : 'Reproducir'}>{playing ? <FaPause size={17} /> : <FaPlay size={17} />}</button>
                    <button type="button" onClick={() => move(1)} disabled={index === videos.length - 1} title="Siguiente" aria-label="Video siguiente"><FaChevronRight size={18} /></button>
                </div>
                <span className="cinema-reference__separator" />
                <div className="cinema-reference__rail-group">
                    <div className="cinema-reference__volume-wrap">
                        <button type="button" className="cinema-reference__solo" onClick={() => setMuted((value) => !value)} title="Sonido" aria-label={muted ? 'Activar sonido' : 'Silenciar'} aria-pressed={!muted}>{muted ? <FaVolumeXmark size={18} /> : <FaVolumeHigh size={18} />}</button>
                        <span className="cinema-reference__volume-pop"><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => { setVolume(Number(event.target.value)); setMuted(false); }} aria-label="Volumen" /></span>
                    </div>
                    <div className={`cinema-reference__more-wrap ${menuOpen ? 'is-open' : ''}`}>
                        <button type="button" className="cinema-reference__solo" onClick={() => setMenuOpen((value) => !value)} title="Más" aria-label="Más"><span className="cinema-reference__dots">•••</span></button>
                        <div className="cinema-reference__menu">
                            <button type="button" className={autoAdvance ? 'is-on' : ''} onClick={() => setAutoAdvance((value) => !value)} aria-pressed={autoAdvance}><span><FaRotate size={15} />Autoreproducción</span><i /></button>
                            <div className="cinema-reference__menu-separator" />
                            <small>VELOCIDAD</small>
                            <div className="cinema-reference__chips">{[0.75, 1, 1.25, 1.5, 2].map((value) => <button key={value} type="button" className={rate === value ? 'is-on' : ''} onClick={() => { setRate(value); notify(`Velocidad ${value}×`); }}>{value}×</button>)}</div>
                            <button type="button" className={settings.subtitleEnabled ? 'is-on' : ''} onClick={() => updateSettings({ subtitleEnabled: !settings.subtitleEnabled })}><span><FaClosedCaptioning size={15} />Subtítulos</span><i /></button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="cinema-reference__rail cinema-reference__social-rail" role="group" aria-label="Acciones del video">
                <div className="cinema-reference__rail-group">
                    <button type="button" className={liked[current.id] ? 'is-liked' : ''} onClick={() => setLiked((value) => ({ ...value, [current.id]: !value[current.id] }))} title="Me gusta" aria-label={liked[current.id] ? 'Quitar me gusta' : 'Me gusta'} aria-pressed={Boolean(liked[current.id])}><FaHeart size={18} fill={liked[current.id] ? 'currentColor' : 'none'} /><span>{formatCount(currentLikes)}</span></button>
                    <button type="button" onClick={() => setCommentsOpen(true)} title="Comentarios" aria-label="Comentarios" aria-expanded={commentsOpen}><FaCommentDots size={18} /><span>{formatCount(comments.length)}</span></button>
                    <button type="button" onClick={shareCurrent} title="Compartir" aria-label="Compartir"><FaShareNodes size={18} /></button>
                    <button type="button" className={saved[current.id] ? 'is-saved' : ''} onClick={() => { setSaved((value) => ({ ...value, [current.id]: !value[current.id] })); notify(saved[current.id] ? 'Quitado de guardados' : 'Guardado localmente'); }} title="Guardar" aria-label={saved[current.id] ? 'Quitar de guardados' : 'Guardar'} aria-pressed={Boolean(saved[current.id])}><FaBookmark size={18} fill={saved[current.id] ? 'currentColor' : 'none'} /></button>
                </div>
            </div>

            <div
                className="cinema-reference__progress"
                role="slider"
                tabIndex={0}
                aria-label="Progreso del clip"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={duration ? Math.round(currentTime / duration * 100) : 0}
                aria-disabled={!isPlayable}
                onPointerDown={(event) => {
                    if (!isPlayable) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setProgressDragging(true);
                    updateProgressTip(event.clientX);
                    setProgressFromPointer(event.clientX);
                }}
                onPointerMove={(event) => {
                    updateProgressTip(event.clientX);
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) setProgressFromPointer(event.clientX);
                }}
                onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    setProgressDragging(false);
                }}
                onPointerCancel={() => setProgressDragging(false)}
                onKeyDown={(event) => {
                    const media = mediaRefs.current[index];
                    if (!media?.duration) return;
                    if (event.key === 'ArrowRight') { media.currentTime = clamp(media.currentTime + 5, 0, media.duration); event.preventDefault(); }
                    if (event.key === 'ArrowLeft') { media.currentTime = clamp(media.currentTime - 5, 0, media.duration); event.preventDefault(); }
                }}
            >
                <div ref={progressTrackRef} className={`cinema-reference__track ${progressDragging ? 'is-dragging' : ''}`}>
                    <span className="cinema-reference__buffer" />
                    <i style={{ width: `${duration ? currentTime / duration * 100 : 0}%` }} />
                    <b style={{ left: `${duration ? currentTime / duration * 100 : 0}%` }} />
                    <span className="cinema-reference__tip" style={{ left: `${progressTipPosition}%` }}>{progressTip}</span>
                </div>
            </div>

            <div className={`cinema-reference__drawer ${commentsOpen ? 'is-open' : ''}`} aria-hidden={!commentsOpen}>
                <div className="cinema-reference__drawer-head"><span><b>Comentarios</b><small>· {comments.length} locales</small></span><button type="button" onClick={() => setCommentsOpen(false)} title="Cerrar" aria-label="Cerrar comentarios"><FaXmark size={16} /></button></div>
                <div className="cinema-reference__drawer-list">{comments.length === 0 ? <p className="cinema-reference__empty-comments">Sin comentarios locales para este video.</p> : comments.map((comment) => <div className="cinema-reference__comment" key={comment.id}><span className="cinema-reference__avatar">T</span><div><b>@tú</b><p>{comment.text}</p><small>{comment.createdAt}</small></div></div>)}</div>
                <form className="cinema-reference__drawer-foot" onSubmit={(event) => { event.preventDefault(); submitComment(); }}><input value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={140} placeholder="Añade un comentario…" /><button type="submit" aria-label="Enviar comentario"><FaShareNodes size={15} /></button></form>
            </div>

            <button type="button" className="cinema-reference__close" onClick={onClose} title="Salir de Cinema" aria-label="Salir de Cinema"><FaXmark size={15} /><span>ESC</span></button>
            {toast && <div className="cinema-reference__toast" role="status">{toast}</div>}
        </div>
    );
}
