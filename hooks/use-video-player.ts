'use client';
import { useRef, useState, useEffect, useCallback } from 'react';

type PreviewOwner = symbol;

let activePreview: { owner: PreviewOwner; stop: () => void } | null = null;

// ============================================================
// useVideoPlayer — Hook de Reproducción de Video
// Extraído de VideoCard.tsx para separar lógica de presentación
// ============================================================

/**
 * Opciones del hook useVideoPlayer.
 */
interface UseVideoPlayerOptions {
    /** Si esta card está activa (seleccionada) */
    isActive: boolean;
    /** Si el video se está reproduciendo en modo expandido */
    isFullPlaying: boolean;
    /** URL del archivo de video (local o remoto) */
    videoSrc?: string;
    /** Callback cuando inicia la reproducción */
    onPlayStart?: () => void;
    /** Callback cuando se detiene la reproducción */
    onPlayStop?: () => void;
    /** Permite reproducir el video después de mantener el cursor encima. */
    hoverAutoplay?: boolean;
    /** Mide el primer frame cuando el navegador expone requestVideoFrameCallback. */
    onFirstFrame?: (durationMs: number) => void;
}

/**
 * Hook de reproducción de video para VideoCard.
 * 
 * Extraído de VideoCard.tsx para separar lógica de presentación.
 * Maneja: hover play, drag & drop, upload de video local,
 * control de play/pause, y cleanup de object URLs.
 */
export function useVideoPlayer({
    isActive,
    isFullPlaying,
    videoSrc,
    onPlayStart,
    onPlayStop,
    hoverAutoplay = true,
    onFirstFrame,
}: UseVideoPlayerOptions) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const previewOwnerRef = useRef<PreviewOwner>(Symbol('video-preview'));
    const previewStartedAtRef = useRef<number | null>(null);
    const firstFrameReportedRef = useRef(false);

    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [hovered, setHovered] = useState(false);
    const [isHoverPlaying, setIsHoverPlaying] = useState(false);
    const [isInViewport, setIsInViewport] = useState(false);

    useEffect(() => {
        const node = containerRef.current;
        if (!node || typeof IntersectionObserver === 'undefined') {
            setIsInViewport(true);
            return;
        }
        const observer = new IntersectionObserver(([entry]) => setIsInViewport(entry.isIntersecting), {
            rootMargin: '160px 0px',
            threshold: 0.01,
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    // Pausa automática cuando el padre desactiva isFullPlaying
    useEffect(() => {
        if (!isFullPlaying && videoRef.current) {
            videoRef.current.pause();
        }
    }, [isFullPlaying]);

    // Cleanup de timer al desmontar
    useEffect(() => {
        const owner = previewOwnerRef.current;
        const objectUrl = videoUrl;
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            if (activePreview?.owner === owner) activePreview = null;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [videoUrl]);

    const reportFirstFrame = useCallback(() => {
        if (firstFrameReportedRef.current || previewStartedAtRef.current === null) return;
        firstFrameReportedRef.current = true;
        onFirstFrame?.(Math.max(0, performance.now() - previewStartedAtRef.current));
    }, [onFirstFrame]);

    const stopHoverPreview = useCallback(() => {
        setIsHoverPlaying(false);
        if (videoRef.current && !isFullPlaying) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
        previewStartedAtRef.current = null;
        firstFrameReportedRef.current = false;
        if (activePreview?.owner === previewOwnerRef.current) activePreview = null;
    }, [isFullPlaying]);

    const handleUpload = useCallback((file: File | null | undefined) => {
        if (!file || !file.type.startsWith('video/')) return;
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(URL.createObjectURL(file));
    }, [videoUrl]);

    const handleRemove = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(null);
    }, [videoUrl]);

    const handleMouseEnter = useCallback(() => {
        setHovered(true);
        if (hoverAutoplay && isActive && videoSrc && !isFullPlaying && isInViewport) {
            hoverTimeoutRef.current = setTimeout(() => {
                activePreview?.stop();
                activePreview = { owner: previewOwnerRef.current, stop: stopHoverPreview };
                setIsHoverPlaying(true);
                previewStartedAtRef.current = performance.now();
                firstFrameReportedRef.current = false;
                if (videoRef.current) {
                    videoRef.current.muted = true;
                    videoRef.current.play().then(() => {
                        const video = videoRef.current;
                        if (!video) return;
                        if ('requestVideoFrameCallback' in video) {
                            video.requestVideoFrameCallback(() => reportFirstFrame());
                        } else {
                            requestAnimationFrame(reportFirstFrame);
                        }
                    }).catch((err: unknown) => console.warn('Hover autoplay blocked:', err));
                }
            }, 500);
        }
    }, [hoverAutoplay, isActive, videoSrc, isFullPlaying, isInViewport, reportFirstFrame, stopHoverPreview]);

    const handleMouseLeave = useCallback(() => {
        setHovered(false);
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        if (isActive && !isFullPlaying && videoRef.current) {
            stopHoverPreview();
        }
    }, [isActive, isFullPlaying, stopHoverPreview]);

    const handlePlayClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        activePreview?.stop();
        setIsHoverPlaying(false);
        onPlayStart?.();
        if (videoRef.current) {
            videoRef.current.muted = false;
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch((err: unknown) => console.warn('Video play failed:', err));
        }
    }, [onPlayStart]);

    const handleCardClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!isActive) return;
        if (isFullPlaying) {
            e.stopPropagation();
            onPlayStop?.();
            videoRef.current?.pause();
            return;
        }
        onPlayStart?.();
    }, [isActive, isFullPlaying, onPlayStart, onPlayStop]);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        handleUpload(e.dataTransfer.files[0]);
    }, [handleUpload]);

    return {
        // Refs
        videoRef,
        containerRef,
        inputRef,
        // State
        videoUrl,
        hovered,
        isHoverPlaying,
        isInViewport,
        // Handlers
        handleUpload,
        handleRemove,
        handleMouseEnter,
        handleMouseLeave,
        handlePlayClick,
        handleCardClick,
        handleDragOver,
        handleDrop,
    };
}
