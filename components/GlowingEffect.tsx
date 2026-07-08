'use client';
import { useCallback, useEffect, useRef } from 'react';
import { motion } from 'motion/react';

// ============================================================
// GlowingEffect — Aceternity UI style, optimizado para 60fps
// - requestAnimationFrame para throttling del mouse
// - will-change solo en hover (evita memory overhead)
// - Colores TikTok: Cyan (#25f4ee) + Magenta (#fe2c55)
// ============================================================

interface GlowingEffectProps {
    children: React.ReactNode;
    className?: string;
    glowRadius?: number;
    color?: 'cyan' | 'magenta' | 'both';
    disabled?: boolean;
}

export function GlowingEffect({
    children,
    className = '',
    glowRadius = 200,
    color = 'both',
    disabled = false,
}: GlowingEffectProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const glowRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number>(0);
    const isHoveredRef = useRef(false);

    const gradient =
        color === 'cyan'
            ? `radial-gradient(${glowRadius}px circle at var(--gx) var(--gy), rgba(37,244,238,0.45) 0%, transparent 70%)`
            : color === 'magenta'
                ? `radial-gradient(${glowRadius}px circle at var(--gx) var(--gy), rgba(254,44,85,0.45) 0%, transparent 70%)`
                : `radial-gradient(${glowRadius}px circle at var(--gx) var(--gy), rgba(37,244,238,0.3) 0%, rgba(254,44,85,0.25) 40%, transparent 70%)`;

    const updateGlow = useCallback((x: number, y: number) => {
        const el = glowRef.current;
        if (!el) return;
        el.style.setProperty('--gx', `${x}px`);
        el.style.setProperty('--gy', `${y}px`);
        el.style.opacity = '1';
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!containerRef.current || disabled) return;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            updateGlow(e.clientX - rect.left, e.clientY - rect.top);
        });
    }, [disabled, updateGlow]);

    const handleMouseEnter = useCallback(() => {
        isHoveredRef.current = true;
        const el = containerRef.current;
        if (el) el.style.willChange = 'transform';
    }, []);

    const handleMouseLeave = useCallback(() => {
        isHoveredRef.current = false;
        const el = containerRef.current;
        if (el) el.style.willChange = 'auto';
        cancelAnimationFrame(rafRef.current);
        if (glowRef.current) glowRef.current.style.opacity = '0';
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || disabled) return;
        el.addEventListener('mousemove', handleMouseMove, { passive: true });
        el.addEventListener('mouseenter', handleMouseEnter, { passive: true });
        el.addEventListener('mouseleave', handleMouseLeave, { passive: true });
        return () => {
            el.removeEventListener('mousemove', handleMouseMove);
            el.removeEventListener('mouseenter', handleMouseEnter);
            el.removeEventListener('mouseleave', handleMouseLeave);
            cancelAnimationFrame(rafRef.current);
        };
    }, [handleMouseMove, handleMouseEnter, handleMouseLeave, disabled]);

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Glow layer — follows mouse via CSS vars */}
            <div
                ref={glowRef}
                aria-hidden="true"
                className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-300"
                style={{
                    opacity: 0,
                    background: gradient,
                    '--gx': '50%',
                    '--gy': '50%',
                    zIndex: 3,
                    mixBlendMode: 'screen',
                } as React.CSSProperties}
            />
            {/* Static rim glow on hover */}
            <motion.div
                aria-hidden="true"
                className="absolute inset-0 rounded-[inherit] pointer-events-none"
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                style={{
                    boxShadow: 'inset 0 0 0 1px rgba(37,244,238,0.2)',
                    zIndex: 2,
                }}
            />
            {/* Levitation motion wrapper */}
            <motion.div
                className="w-full h-full"
                whileHover={{ y: -6 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 320, damping: 24, mass: 0.8 }}
            >
                {children}
            </motion.div>
        </div>
    );
}
