'use client';
import { cn } from '@/lib/utils';
import { useVideoPlayer } from '@/hooks/use-video-player';
import { VideoCardOverlay } from '@/components/VideoCardOverlay';
import { InactiveCardShell } from '@/components/InactiveCardShell';
import type { VideoCardProps } from '@/types';
import { toast } from 'sonner';
import { useState } from 'react';

// ============================================================
// VideoCard — Componente Principal de Card de Video
//
// Arquitectura: Composición limpia. Este componente es el
// "shell" que coordina:
//   - useVideoPlayer (toda la lógica de reproducción)
//   - VideoCardOverlay  (UI de card activa)
//   - InactiveCardShell (UI fantasma de card vacía)
// ============================================================

/**
 * VideoCard — Tarjeta individual de video en el grid de la biblioteca.
 * 
 * Componente principal de composición que coordina:
 * - `useVideoPlayer` (lógica de reproducción)
 * - `VideoCardOverlay` (UI de card activa con hover)
 * - `InactiveCardShell` (UI fantasma de card vacía)
 * 
 * Soporta múltiples layout: grid, list, compact.
 * Muestra título, autor y duración del video sin badges decorativos.
 */
export function VideoCard({
    isActive = false,
    title,
    author,
    tags = [],
    thumb,
    videoSrc,
    isFullPlaying = false,
    onPlayStart,
    onPlayStop,
    slotIndex = 99,
    url,
    layout = 'grid',
    onlineOnly = false,
}: VideoCardProps & {
    slotIndex?: number;
    url?: string;
    keepStatus?: string;
    layout?: 'grid' | 'list' | 'compact';
    onlineOnly?: boolean;
}) {

    const {
        videoRef,
        videoUrl,
        hovered,
        isHoverPlaying,
        handleMouseEnter,
        handleMouseLeave,
        handlePlayClick,
        handleCardClick,
    } = useVideoPlayer({ isActive, isFullPlaying, videoSrc, onPlayStart, onPlayStop });

    // Derived display values
    const isActiveOrHovered = hovered || isActive;
    const activeVideoRenderSrc = isActive ? videoSrc : videoUrl;
    const [failedVideoSrc, setFailedVideoSrc] = useState<string | null>(null);
    const videoLoadFailed = Boolean(activeVideoRenderSrc && failedVideoSrc === activeVideoRenderSrc);
    const canInteract = isActive && !videoLoadFailed;
    const iconTransition = isActiveOrHovered ? 'all 0.2s ease' : 'all 1s ease 0.3s';

    const openOriginal = async (event: React.MouseEvent) => {
        event.stopPropagation();
        if (!url || typeof window === 'undefined') return;

        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:') throw new Error('Unsupported URL protocol');
        } catch {
            toast.error('La URL original no es segura o está incompleta.');
            return;
        }

        try {
            const { open } = await import('@tauri-apps/plugin-shell');
            await open(url);
        } catch {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <div
            className={cn(
                                'w-full relative overflow-hidden flex-shrink-0 group transition-transform duration-500 ease-out video-slot-premium',
                layout === 'list' ? 'aspect-[16/7] min-h-[190px] sm:min-h-[220px]' : layout === 'compact' ? 'aspect-[3/4]' : 'aspect-[9/16]',

                canInteract ? 'cursor-pointer' : 'cursor-default',
                hovered && canInteract ? 'scale-[1.005]' : ''
            )}
            style={{
                                background: isActive && thumb
                    ? `url(${thumb}) center/cover no-repeat`

                    : hovered ? 'linear-gradient(145deg, rgba(25, 25, 25, 0.8), rgba(18, 18, 18, 0.9))' : 'linear-gradient(145deg, rgba(20, 20, 20, 0.75), rgba(13, 13, 13, 0.85))',
                backdropFilter: isActive ? 'none' : 'blur(12px)',
                WebkitBackdropFilter: isActive ? 'none' : 'blur(12px)',
                borderRadius: '20px',
                boxShadow: canInteract
                    ? '0 12px 24px rgba(0,0,0,.34)'
                    : '0 8px 18px rgba(0,0,0,.24)',
                transition: 'transform 0.35s ease, box-shadow 0.35s ease, background 0.5s ease',
            }}
            onClick={canInteract ? (e) => {
                if (onlineOnly) {
                    openOriginal(e);
                    return;
                }
                handleCardClick(e);
            } : undefined}
            onMouseEnter={canInteract ? handleMouseEnter : undefined}
            onMouseLeave={canInteract ? handleMouseLeave : undefined}
        >
{/* Dark gradient overlay for text readability */}
            {isActive && (
                <div
                    className={cn(
                        'absolute inset-0 z-[2] bg-gradient-to-t from-black/90 via-black/20 to-black/40 mix-blend-multiply transition-opacity duration-300',
                        isFullPlaying ? 'opacity-0' : 'opacity-100'
                    )}
                />
            )}

            {/* Paper texture overlay for inactive elements */}
            {!isActive && (
                <div
                    className="absolute inset-0 pointer-events-none z-[1] opacity-30"
                    style={{
                        backgroundImage: `var(--paper-texture-matte)`,
                    }}
                />
            )}

            {/* Ghost UI for inactive cards without a video */}
            {!isActive && !videoUrl && (
                <InactiveCardShell hovered={false} slotIndex={slotIndex} />
            )}

            {/* Video Player (active prop OR uploaded file) */}
                        {activeVideoRenderSrc && !onlineOnly && (

                        <video
                    ref={videoRef}
                    src={activeVideoRenderSrc}
                    className={cn(
                        'absolute inset-0 w-full h-full object-cover z-[5] transition-opacity duration-300',
                        isActive && !isHoverPlaying && !isFullPlaying ? 'opacity-0' : 'opacity-100'
                    )}
                    style={{
                        borderRadius: 'inherit',
                        filter: (!isActive || isHoverPlaying) && !isFullPlaying ? 'brightness(0.8)' : 'brightness(1)',
                    }}
                    loop
                    playsInline
                        muted={isActive ? !isFullPlaying : true}
                        autoPlay={!isActive}
                        onError={() => setFailedVideoSrc(activeVideoRenderSrc ?? null)}
                        />
            )}

            {/* Active card TikTok overlay (author, play, tags, sidebar icons) */}
                        {canInteract && !onlineOnly && (
                <VideoCardOverlay

                    author={author}
                    title={title}
                    tags={tags}
                    isFullPlaying={isFullPlaying}
                    iconTransition={iconTransition}
                    onPlayClick={handlePlayClick}
                />
            )}

        </div>
    );
}

