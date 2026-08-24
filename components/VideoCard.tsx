'use client';
import { cn } from '@/lib/utils';
import { useVideoPlayer } from '@/hooks/use-video-player';
import { VideoCardOverlay } from '@/components/VideoCardOverlay';
import { InactiveCardShell } from '@/components/InactiveCardShell';
import { SHADOW } from '@/lib/design-tokens';
import type { VideoCardProps } from '@/types';
import { useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { detectPlatform } from '@/hooks/use-link-processor';
import { toast } from 'sonner';

// ============================================================
// VideoCard — Componente Principal de Card de Video
//
// Arquitectura: Composición limpia. Este componente es el
// "shell" que coordina:
//   - useVideoPlayer (toda la lógica de reproducción)
//   - VideoCardOverlay  (UI de card activa)
//   - InactiveCardShell (UI fantasma de card vacía)
// ============================================================

export function VideoCard({
    isActive = false,
    id,
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
    keepStatus,
}: VideoCardProps & { slotIndex?: number; url?: string; keepStatus?: string }) {

    const {
        videoRef,
        inputRef,
        videoUrl,
        hovered,
        isHoverPlaying,
        handleUpload,
        handleRemove,
        handleMouseEnter,
        handleMouseLeave,
        handlePlayClick,
        handleCardClick,
        handleDragOver,
        handleDrop,
    } = useVideoPlayer({ isActive, isFullPlaying, videoSrc, onPlayStart, onPlayStop });

    // Derived display values
    const isActiveOrHovered = hovered || isActive;
    const activeVideoRenderSrc = isActive ? videoSrc : videoUrl;
    const iconTransition = isActiveOrHovered ? 'all 0.2s ease' : 'all 1s ease 0.3s';

    const [localKeepStatus, setLocalKeepStatus] = useState<'keep' | 'online'>('keep');
    const currentStatus = keepStatus || localKeepStatus;

    const PLATFORM_ICONS = {
        tiktok:    { label: 'TikTok', color: '#fe2c55', bg: 'rgba(254,44,85,0.15)' },
        youtube:   { label: 'YT',     color: '#ff0000', bg: 'rgba(255,0,0,0.15)' },
        instagram: { label: 'IG',     color: '#e1306c', bg: 'rgba(225,48,108,0.15)' },
        generic:   { label: 'Web',    color: '#ffffff', bg: 'rgba(255,255,255,0.1)' },
    };
    const platform = detectPlatform(url || '');
    const platformMeta = PLATFORM_ICONS[platform] || PLATFORM_ICONS.generic;

    return (
        <div
            className={cn(
                'w-full aspect-[9/16] relative overflow-hidden flex-shrink-0 group transition-all duration-500 will-change-transform video-slot-premium',
                isActive ? 'cursor-pointer' : 'cursor-pointer',
                hovered && !isActive ? '-translate-y-[2px]' : ''
            )}
            style={{
                background: isActive
                    ? `url(${thumb}) center/cover no-repeat`
                    : hovered ? 'linear-gradient(145deg, rgba(25, 25, 25, 0.8), rgba(18, 18, 18, 0.9))' : 'linear-gradient(145deg, rgba(20, 20, 20, 0.75), rgba(13, 13, 13, 0.85))',
                backdropFilter: isActive ? 'none' : 'blur(12px)',
                WebkitBackdropFilter: isActive ? 'none' : 'blur(12px)',
                borderRadius: '24px',
                boxShadow: isActive
                    ? `0 30px 60px rgba(0,0,0,0.9), 0 0 25px rgba(255,255,255,0.1)`
                    : hovered ? '0 15px 30px rgba(0, 0, 0, 0.4), inset 0 0 5px rgba(255, 255, 255, 0.02)' : '0 10px 25px rgba(0, 0, 0, 0.3), inset 0 0 10px rgba(255, 255, 255, 0.01)',
                transition: 'transform 0.5s ease, box-shadow 0.5s ease, background 0.5s ease, border-color 0.4s ease',
            }}
            onClick={(e) => {
                if (!isActive) {
                    toast.info("No hay videos completados", {
                        description: "Pega un enlace en el panel izquierdo y pulsa 'Procesar Contenido' para comenzar.",
                        duration: 4000,
                    });
                    return;
                }
                handleCardClick(e);
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Platform badge */}
            {url && (
                <div
                    className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-[6px] text-[8px] font-black tracking-wider"
                    style={{
                        background: platformMeta.bg,
                        color: platformMeta.color,
                        border: `1px solid ${platformMeta.color}30`,
                    }}
                >
                    {platformMeta.label}
                </div>
            )}

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

            {/* Hidden file input for manual video uploads (inactive cards only) */}
            {!isActive && (
                <input
                    ref={inputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpload(e.target.files?.[0])}
                    onClick={(e: React.MouseEvent<HTMLInputElement>) => e.stopPropagation()}
                />
            )}

            {/* Ghost UI for inactive cards without a video */}
            {!isActive && !videoUrl && <InactiveCardShell hovered={hovered} slotIndex={slotIndex} />}

            {/* Video Player (active prop OR uploaded file) */}
            {activeVideoRenderSrc && (
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
                />
            )}

            {/* Active card TikTok overlay (author, play, tags, sidebar icons) */}
            {isActive && (
                <VideoCardOverlay
                    author={author}
                    title={title}
                    tags={tags}
                    isFullPlaying={isFullPlaying}
                    iconTransition={iconTransition}
                    onPlayClick={handlePlayClick}
                />
            )}

            {/* Remove button for manually uploaded videos */}
            {videoUrl && hovered && !isActive && (
                <button
                    className="absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs z-10 pointer-events-auto transition-all hover:bg-black/90 active:scale-90"
                    style={{
                        background: 'rgba(0,0,0,0.7)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        backdropFilter: 'blur(10px)',
                    }}
                    onClick={handleRemove}
                >
                    <FaXmark className="w-4 h-4" />
                </button>
            )}

            {/* Keep/Online status buttons */}
            {isActive && (
                <div className="absolute top-2 right-2 z-10 flex gap-1">
                    <button
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            setLocalKeepStatus('keep');
                            if (url) {
                                (async () => {
                                    const { invoke } = await import('@tauri-apps/api/core');
                                    invoke('set_video_keep_status', { jobId: id, status: 'keep' }).catch(() => {});
                                })();
                            }
                        }}
                        className={`px-2 py-1 rounded-[6px] text-[8px] font-bold transition-all ${
                            currentStatus === 'keep' 
                                ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' 
                                : 'bg-white/5 text-white/30 border border-white/10'
                        }`}
                    >
                        Conservar
                    </button>
                    <button
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            setLocalKeepStatus('online');
                            if (url) {
                                (async () => {
                                    const { invoke } = await import('@tauri-apps/api/core');
                                    invoke('set_video_keep_status', { jobId: id, status: 'online' }).catch(() => {});
                                })();
                            }
                        }}
                        className={`px-2 py-1 rounded-[6px] text-[8px] font-bold transition-all ${
                            currentStatus === 'online' 
                                ? 'bg-[#25f4ee]/20 text-[#25f4ee] border border-[#25f4ee]/30' 
                                : 'bg-white/5 text-white/30 border border-white/10'
                        }`}
                    >
                        Online
                    </button>
                </div>
            )}

            {/* Delineado Nativo (Outline de 5px)
                Colocado como el último bloque con z-[100] para que la imagen o los controles del video NUNCA se monten sobre los bordes, manteniéndolo siempre encima y visible. */}
            <div
                className={cn(
                    "absolute inset-0 pointer-events-none rounded-[inherit] z-[100] transition-colors duration-400",
                    isActive ? "border-[5px] border-white/25" : hovered ? "border-[5px] border-white/15" : "border-[5px] border-white/5"
                )}
            />
        </div>
    );
}

