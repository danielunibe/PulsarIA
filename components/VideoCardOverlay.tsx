'use client';

import { cn } from '@/lib/utils';
import { FaPlay } from 'react-icons/fa6';

// ============================================================
// VideoCardOverlay — Minimalista
// Reducción: de 9 elementos simultáneos a 3-4
// En reposo: solo play + título
// En hover: aparecen tags y autor
// Sidebar icons eliminados (decorativos, no funcionales)
// Vinyl eliminado
// ============================================================

/**
 * Props del overlay de VideoCard.
 * 
 * Muestra información superpuesta sobre la tarjeta de video:
 * título, autor, tags, waveform de audio animado, y botón de play.
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
}

/**
 * VideoCardOverlay — Overlay minimalista sobre VideoCard.
 * 
 * En reposo: muestra solo play + título.
 * En hover: aparecen tags y autor.
 * Cuando reproduce: muestra waveform de audio animado.
 */
export function VideoCardOverlay({
    author,
    title,
    tags = [],
    isFullPlaying,
    onPlayClick,
}: VideoCardOverlayProps) {
    return (
        <>
            <div
                className="absolute inset-0 z-20 flex flex-col justify-between pointer-events-none"
            >
                {/* Gradientes Protectores Transparentes */}
                <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none opacity-80" />
                <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/50 to-transparent pointer-events-none opacity-60" />
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
