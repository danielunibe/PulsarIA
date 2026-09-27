'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface CardTiltState {
    /** Inclinación X en grados (-max a +max) */
    x: number;
    /** Inclinación Y en grados (-max a +max) */
    y: number;
    /** Coordenada X del brillo en porcentaje (0 a 100) */
    glareX: number;
    /** Coordenada Y del brillo en porcentaje (0 a 100) */
    glareY: number;
}

/**
 * Hook de inclinación 3D y reflejo especular ultra-suave y estabilizado.
 * Calcula las coordenadas relativas respecto a un contenedor exterior inmóvil
 * para evitar oscilaciones o saltos bruscos cuando la tarjeta interior se transforma.
 */
export function useCardTilt(maxTilt = 5.0) {
    const [tilt, setTilt] = useState<CardTiltState | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const frameRef = useRef<number | null>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
        const target = containerRef.current || e.currentTarget;
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const clientX = e.clientX;
        const clientY = e.clientY;

        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
            const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
            const y = Math.max(0, Math.min(rect.height, clientY - rect.top));

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const normX = (x - centerX) / centerX;
            const normY = (y - centerY) / centerY;

            setTilt({
                x: Number((-normY * maxTilt).toFixed(2)),
                y: Number((normX * maxTilt).toFixed(2)),
                glareX: Number(((x / rect.width) * 100).toFixed(1)),
                glareY: Number(((y / rect.height) * 100).toFixed(1)),
            });
        });
    }, [maxTilt]);

    const handleMouseLeave = useCallback(() => {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        setTilt(null);
    }, []);

    useEffect(() => {
        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, []);

    return {
        containerRef,
        tilt,
        isHovered: tilt !== null,
        handleMouseMove,
        handleMouseLeave,
    };
}

