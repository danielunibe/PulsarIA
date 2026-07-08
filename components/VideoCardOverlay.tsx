'use client';

import { cn } from '@/lib/utils';
import { TT_PINK, TT_CYAN, TIKTOK_LOGO_PATH } from '@/types';
import { FaPlay } from 'react-icons/fa6';

// ============================================================
// VideoCardOverlay — Minimalista
// Reducción: de 9 elementos simultáneos a 3-4
// En reposo: solo play + título
// En hover: aparecen tags y autor
// Sidebar icons eliminados (decorativos, no funcionales)
// Vinyl eliminado
// ============================================================

interface VideoCardOverlayProps {
    author?: string;
    title?: string;
    tags?: string[];
    isFullPlaying: boolean;
    iconTransition: string;
    onPlayClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

// Waveform minimalista (3 barras en lugar de 5)
function AudioWaveform() {
    return (
        <div className="flex items-end gap-[3px] h-[14px]" aria-label="Reproduciendo">
            {[1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="w-[3px] rounded-full"
                    style={{
                        background: '#fe2c55',
                        animation: `waveBar ${0.7 + i * 0.2}s ease-in-out infinite alternate`,
                        animationDelay: `${i * 0.15}s`,
                        height: '14px',
                        transformOrigin: 'bottom',
                    }}
                />
            ))}
        </div>
    );
}

export function VideoCardOverlay({
    author,
    title,
    tags = [],
    isFullPlaying,
    iconTransition,
    onPlayClick,
}: VideoCardOverlayProps) {
    return (
        <>
            {/* Waveform — solo visible al reproducir */}
            {isFullPlaying && (
                <div className="absolute top-4 left-4 z-40 flex items-center gap-2 pointer-events-none">
                    <AudioWaveform />
                </div>
            )}

            <div
                className="absolute inset-0 z-20 flex flex-col justify-between pointer-events-none"
            >
                {/* Gradientes Protectores Transparentes */}
                <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none opacity-80" />
                <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/50 to-transparent pointer-events-none opacity-60" />
                {/* Top: TikTok logo — pequeño y sutil */}
                <div className="flex justify-end p-5 relative z-30">
                    <svg
                        style={{
                            width: '20px',
                            height: '20px',
                            fill: 'rgba(255,255,255,0.4)',
                            filter: `drop-shadow(1px 0px 0px ${TT_PINK}50) drop-shadow(-1px 0px 0px ${TT_CYAN}50)`,
                            transition: iconTransition,
                        }}
                        viewBox="0 0 24 24"
                    >
                        <path d={TIKTOK_LOGO_PATH} />
                    </svg>
                </div>

                {/* Centro: Play button */}
                <div className={cn(
                    "flex-1 flex items-center justify-center transition-all duration-300",
                    isFullPlaying ? "opacity-0 scale-75 pointer-events-none" : "opacity-100 scale-100"
                )}>
                    <button
                        onClick={onPlayClick}
                        className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer pointer-events-auto"
                        style={{
                            background: 'rgba(255,255,255,0.12)',
                            backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        }}
                    >
                        <FaPlay className="w-8 h-8 text-white/95 ml-1" />
                    </button>
                </div>

                {/* Bottom: solo título + autor (sin tags para reducir ruido) */}
                <div className="flex flex-col gap-1.5 p-5 relative z-30 transition-opacity duration-300">
                    {author && (
                        <span
                            className="text-[10px] font-bold tracking-wider uppercase"
                            style={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
                        >
                            {author}
                        </span>
                    )}
                    {title && (
                        <h3
                            className="font-semibold leading-tight line-clamp-2"
                            style={{ fontSize: 'var(--text-base)', color: 'rgba(255,255,255,0.95)', textShadow: '0 2px 5px rgba(0,0,0,0.8)' }}
                        >
                            {title}
                        </h3>
                    )}
                </div>
            </div>
        </>
    );
}
