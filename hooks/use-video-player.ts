'use client';
import { useRef, useState, useEffect, useCallback } from 'react';

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
}: UseVideoPlayerOptions) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [hovered, setHovered] = useState(false);
    const [isHoverPlaying, setIsHoverPlaying] = useState(false);

    // Pausa automática cuando el padre desactiva isFullPlaying
    useEffect(() => {
        if (!isFullPlaying && videoRef.current) {
            videoRef.current.pause();
        }
    }, [isFullPlaying]);

    // Cleanup de timer al desmontar
    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        };
    }, []);

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
        if (isActive && videoSrc && !isFullPlaying) {
            hoverTimeoutRef.current = setTimeout(() => {
                setIsHoverPlaying(true);
                if (videoRef.current) {
                    videoRef.current.muted = true;
                    videoRef.current.play().catch((err: unknown) => console.warn('Hover autoplay blocked:', err));
                }
            }, 500);
        }
    }, [isActive, videoSrc, isFullPlaying]);

    const handleMouseLeave = useCallback(() => {
        setHovered(false);
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        if (isActive && !isFullPlaying && videoRef.current) {
            setIsHoverPlaying(false);
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
    }, [isActive, isFullPlaying]);

    const handlePlayClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
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
        }
    }, [isActive, isFullPlaying, onPlayStop]);

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
        inputRef,
        // State
        videoUrl,
        hovered,
        isHoverPlaying,
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
