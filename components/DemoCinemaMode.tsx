'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CinemaVideo } from '@/types';
import { FaChevronLeft, FaChevronRight, FaPause, FaPlay, FaXmark } from '@/components/icon-library';

interface DemoCinemaModeProps {
    videos: CinemaVideo[];
    initialVideoId?: number;
    onClose: () => void;
}

/**
 * Cinema lane for the opt-in DEMO collection. It deliberately treats images
 * as static previews and only creates a media player when a slot has a real
 * MP4/WebM resource.
 */
export function DemoCinemaMode({ videos, initialVideoId, onClose }: DemoCinemaModeProps) {
    const initialIndex = Math.max(0, videos.findIndex((video) => video.id === initialVideoId));
    const [index, setIndex] = useState(initialIndex);
    const videoRef = useRef<HTMLVideoElement>(null);
    const selected = videos[index] ?? videos[0];
    const isVideo = selected?.mediaKind === 'video' && Boolean(selected.videoSrc);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        setPlaying(false);
        videoRef.current?.pause();
    }, [index]);

    const canGoBack = videos.length > 1;
    const move = (direction: -1 | 1) => {
        setIndex((current) => (current + direction + videos.length) % videos.length);
    };

    const label = useMemo(() => selected?.isDemo ? (selected.demoLabel || 'DEMO') : 'BIBLIOTECA', [selected]);

    if (!selected) return null;

    const togglePlayback = () => {
        const element = videoRef.current;
        if (!element) return;
        if (element.paused) {
            void element.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        } else {
            element.pause();
            setPlaying(false);
        }
    };

    return (
        <div className="demo-cinema fixed inset-0 z-[9999] flex min-h-screen flex-col overflow-hidden bg-[#050506] text-white">
            <div className="demo-cinema__atmosphere" aria-hidden="true" />
            <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">Pulsaria Cinema</p>
                    <p className="mt-1 text-xs text-white/55">Preview local · {index + 1} / {videos.length}</p>
                </div>
                <button type="button" onClick={onClose} aria-label="Cerrar Cinema" className="demo-cinema__button">
                    <FaXmark size={15} />
                </button>
            </header>

            <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center gap-4 px-4 pb-8 sm:px-10">
                {canGoBack && (
                    <button type="button" onClick={() => move(-1)} aria-label="Preview anterior" className="demo-cinema__button shrink-0">
                        <FaChevronLeft size={16} />
                    </button>
                )}

                <section className="demo-cinema__frame relative flex h-[min(78vh,760px)] w-[min(58vw,440px)] min-w-[260px] max-w-[88vw] items-center justify-center overflow-hidden rounded-[28px] border border-white/15 bg-black/50 shadow-2xl">
                    {isVideo ? (
                        <video
                            ref={videoRef}
                            src={selected.videoSrc}
                            poster={selected.thumb || undefined}
                            className="h-full w-full object-contain"
                            playsInline
                            muted
                            loop
                            onPlay={() => setPlaying(true)}
                            onPause={() => setPlaying(false)}
                        />
                    ) : (
                        <div
                            role="img"
                            aria-label={selected.title}
                            className="h-full w-full bg-contain bg-center bg-no-repeat"
                            style={{ backgroundImage: `url(${selected.thumb})` }}
                        />
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-5 pt-20">
                        <span className="inline-flex rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/80 backdrop-blur-xl">{label}</span>
                        <h1 className="mt-3 text-lg font-bold text-white">{selected.title}</h1>
                        {selected.isDemo && selected.mediaKind === 'image' && <p className="mt-1 text-xs text-white/55">Imagen temporal · sin reproducción</p>}
                    </div>
                    {isVideo && (
                        <button type="button" onClick={togglePlayback} aria-label={playing ? 'Pausar video' : 'Reproducir video'} className="demo-cinema__play absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                            {playing ? <FaPause size={17} /> : <FaPlay size={17} />}
                        </button>
                    )}
                </section>

                {canGoBack && (
                    <button type="button" onClick={() => move(1)} aria-label="Preview siguiente" className="demo-cinema__button shrink-0">
                        <FaChevronRight size={16} />
                    </button>
                )}
            </main>

            <div className="relative z-10 flex justify-center pb-8">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-white/45 backdrop-blur-xl">
                    <span>{selected.isDemo ? 'Demo aislado' : 'Biblioteca real'}</span>
                    {isVideo && <span className="text-emerald-300/80">Video disponible</span>}
                </div>
            </div>
        </div>
    );
}
