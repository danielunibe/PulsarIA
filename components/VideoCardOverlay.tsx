'use client';

import { cn } from '@/lib/utils';
import { FaPlay } from '@/components/icon-library';
import { TikTokIcon } from './Header';

// ============================================================
// VideoCardOverlay — macOS 27 Liquid Glassmorphism Edition
// ============================================================

/**
 * Props del overlay de VideoCard.
 */
interface VideoCardOverlayProps {
    /** Autor del video */
    author?: string;
    /** Título del video */
    title?: string;
    /** Tags/categorías del video */
    tags?: string[];
    /** Si el video se está reproduciendo actualmente */
    isFullPlaying: boolean;
    /** Callback al hacer click en el botón de play */
    onPlayClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    /** Demo cards must never be presented as TikTok content. */
    isDemo?: boolean;
    demoLabel?: string;
}

/**
 * VideoCardOverlay — Elementos flotantes con glassmorfismo líquido estilo macOS.
 */
export function VideoCardOverlay({
    author,
    title,
    tags = [],
    isFullPlaying,
    onPlayClick,
    isDemo = false,
    demoLabel = 'DEMO',
}: VideoCardOverlayProps) {
    return (
        <div className="absolute inset-0 z-20 flex flex-col justify-between pointer-events-none">
            {/* Top: Capsule badge estilo macOS Glass */}
            <div className="relative z-30 p-3.5 flex items-center justify-between">
                <div
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold text-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    style={{
                        background: 'rgba(22, 22, 26, 0.72)',
                        backdropFilter: 'blur(20px) saturate(140%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                    }}
                >
                    {!isDemo && <TikTokIcon size={12} className="drop-shadow-sm" />}
                    <span className="tracking-wide text-[10px]">{isDemo ? demoLabel : 'TikTok'}</span>
                </div>
            </div>

            {/* Centro: Botón Play flotante (Liquid Glass Disc de macOS) */}
            <div className={cn(
                "flex-1 flex items-center justify-center transition-all duration-300",
                isFullPlaying ? "opacity-0 scale-75 pointer-events-none" : "opacity-100 scale-100"
            )}>
                <button
                    type="button"
                    onClick={onPlayClick}
                    aria-label="Reproducir video"
                    className="w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer pointer-events-auto shadow-[0_12px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.28)] group/play"
                    style={{
                        background: 'rgba(28, 28, 32, 0.75)',
                        backdropFilter: 'blur(24px) saturate(140%)',
                        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
                        border: '1px solid rgba(255, 255, 255, 0.20)',
                    }}
                >
                    <FaPlay className="w-5 h-5 text-white ml-0.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] transition-transform group-hover/play:scale-105" />
                </button>
            </div>

            {/* Bottom: Dock flotante de cristal esmerilado macOS */}
            <div
                className="relative z-30 m-3 p-3.5 rounded-[16px] shadow-[0_12px_28px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.16)] flex flex-col gap-1 transition-all duration-300 group-hover:bg-[rgba(26,26,30,0.85)] group-hover:border-white/20"
                style={{
                    background: 'rgba(18, 18, 21, 0.72)',
                    backdropFilter: 'blur(24px) saturate(140%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(140%)',
                    border: '1px solid rgba(255, 255, 255, 0.10)',
                }}
            >
                {author && (
                    <span
                        className="text-[10px] font-bold tracking-wider uppercase text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate"
                    >
                        @{author.replace(/^@/, '')}
                    </span>
                )}
                {title && (
                    <h3
                        className="font-medium text-xs sm:text-[13px] leading-snug line-clamp-2 text-white/95"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                    >
                        {title}
                    </h3>
                )}
            </div>
        </div>
    );
}
