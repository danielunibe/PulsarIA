'use client';
import { cn } from '@/lib/utils';
import { useVideoPlayer } from '@/hooks/use-video-player';
import { VideoCardOverlay } from '@/components/VideoCardOverlay';
import { InactiveCardShell } from '@/components/InactiveCardShell';
import type { VideoCardProps } from '@/types';
import { toast } from 'sonner';
import { useCallback, useState } from 'react';
import { useSettings } from '@/lib/settings-context';

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
    mediaKind = 'video',
    isDemo = false,
    demoLabel = 'DEMO',
    hoverAutoplay = true,
    onPreviewClick,
    onContextMenu,
}: VideoCardProps & {
    slotIndex?: number;
    url?: string;
    keepStatus?: string;
    layout?: 'grid' | 'list' | 'compact';
    onlineOnly?: boolean;
}) {

    const isStaticDemo = isDemo && mediaKind === 'image';
    const { settings } = useSettings();
    const reportFirstFrame = useCallback((durationMs: number) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pulsaria-video-first-frame', { detail: durationMs }));
        }
    }, []);

    const {
        videoRef,
        containerRef,
        videoUrl,
        hovered,
        isHoverPlaying,
        isInViewport,
        handleMouseEnter,
        handleMouseLeave,
        handlePlayClick,
        handleCardClick,
    } = useVideoPlayer({ isActive: isActive && !isStaticDemo, isFullPlaying, videoSrc, onPlayStart, onPlayStop, hoverAutoplay, onFirstFrame: reportFirstFrame });

    // Derived display values
    const activeVideoRenderSrc = isActive ? videoSrc : videoUrl;
    const [failedVideoSrc, setFailedVideoSrc] = useState<string | null>(null);
    const videoLoadFailed = Boolean(activeVideoRenderSrc && failedVideoSrc === activeVideoRenderSrc);
    const canInteract = isActive && !isStaticDemo && !videoLoadFailed;
    const canOpenStaticPreview = isStaticDemo && Boolean(thumb) && Boolean(onPreviewClick);

    // La card conserva una elevación suave; no inclina ni gira el contenido.
    // El movimiento 3D hacía que las fichas se sintieran inestables al pasar
    // el cursor, especialmente en ventanas compactas.
    const isElevated = hovered;

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
            ref={containerRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onContextMenu={(event) => {
                if (!onContextMenu) return;
                event.preventDefault();
                event.stopPropagation();
                onContextMenu(event);
            }}
            className="relative w-full group/card-wrapper"
        >
            {/* Sombra de levitación terrestre física y elegante (Apple depth) */}
            <div
                aria-hidden="true"
                className={cn(
                    "absolute -bottom-2.5 left-[8%] right-[8%] h-6 rounded-full pointer-events-none transition-all duration-300 z-0",
                    isElevated
                        ? "opacity-60 scale-100 blur-xl translate-y-2"
                        : "opacity-0 scale-75 blur-md translate-y-0"
                )}
                style={{
                    background: 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.95) 0%, rgba(10, 10, 12, 0.5) 55%, transparent 80%)',
                }}
            />

            {/* Tarjeta de video con expansión hover estable */}
            <div
                role={canOpenStaticPreview ? 'button' : undefined}
                tabIndex={canOpenStaticPreview ? 0 : undefined}
                aria-label={canOpenStaticPreview ? `Abrir ficha de ${title || 'muestra'}` : undefined}
                aria-haspopup={canOpenStaticPreview ? 'dialog' : undefined}
                className={cn(
                    'w-full relative overflow-hidden flex-shrink-0 group video-slot-premium video-card-levitate',
                    layout === 'list' ? 'aspect-[16/7] min-h-[190px] sm:min-h-[220px]' : layout === 'compact' ? 'aspect-[3/4]' : 'aspect-[9/16]',
                    canInteract || canOpenStaticPreview ? 'cursor-pointer' : 'cursor-default',
                    canOpenStaticPreview ? 'demo-preview-card' : ''
                )}
                style={{
                    borderRadius: '18px',
                    background: isElevated
                        ? 'rgba(28, 28, 34, 0.82)'
                        : 'rgba(18, 18, 22, 0.62)',
                    backdropFilter: 'blur(30px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(30px) saturate(150%)',
                    border: 0,
                    boxShadow: isElevated
                        ? '0 24px 50px -10px rgba(0, 0, 0, 0.82), 0 10px 22px -5px rgba(0, 0, 0, 0.55)'
                        : '0 8px 24px -6px rgba(0, 0, 0, 0.55)',
                    transform: isElevated ? 'translateY(-6px) scale(1.025)' : 'translateY(0) scale(1)',
                    transition: 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.25s ease, background 0.25s ease',
                    transformOrigin: 'center center',
                    willChange: 'transform, box-shadow',
                }}
                onClick={canInteract ? (e) => {
                    if (onlineOnly) {
                        openOriginal(e);
                        return;
                    }
                    handleCardClick(e);
                } : canOpenStaticPreview ? (e) => {
                    e.stopPropagation();
                    onPreviewClick?.(e.currentTarget);
                } : undefined}
                onKeyDown={canOpenStaticPreview ? (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    onPreviewClick?.(event.currentTarget);
                } : undefined}
            >
                {/* Thumbnail Image con transición suave en hover */}
                {(isActive || isStaticDemo) && thumb && (
                    <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                        style={{
                            backgroundImage: `url(${thumb})`,
                        }}
                    />
                )}

                {/* Dark gradient overlay for text readability */}
                {(isActive || isStaticDemo) && (
                    <div
                        className={cn(
                            'absolute inset-0 z-[2] bg-gradient-to-t from-black/68 via-black/12 to-transparent transition-opacity duration-300',
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
                {!isActive && !isStaticDemo && !videoUrl && (
                    <InactiveCardShell hovered={hovered} slotIndex={slotIndex} />
                )}

                {/* Video Player (active prop OR uploaded file) */}
                {activeVideoRenderSrc && mediaKind === 'video' && !onlineOnly && isInViewport && (
                    <video
                        ref={videoRef}
                        src={activeVideoRenderSrc}
                        poster={thumb || undefined}
                        preload="metadata"
                        className={cn(
                            'absolute inset-0 w-full h-full z-[5] transition-opacity duration-300',
                            settings.videoFit === 'contain' ? 'object-contain' : 'object-cover',
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
                {isStaticDemo && (
                    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 rounded-2xl bg-black/55 px-3 py-2 backdrop-blur-xl">
                        <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/90">{demoLabel}</span>
                        <span className="mt-1 block text-[11px] text-white/60">Imagen temporal · preview estático</span>
                    </div>
                )}

                {canInteract && !onlineOnly && (
                    <VideoCardOverlay
                        author={author}
                        title={title}
                        tags={tags}
                        isFullPlaying={isFullPlaying}
                        onPlayClick={handlePlayClick}
                        isDemo={isDemo}
                        demoLabel={demoLabel}
                    />
                )}
            </div>
        </div>
    );
}
