'use client';
import React from 'react';
import { motion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import Image from 'next/image';
import { FaVideo, FaMusic, FaFileLines } from 'react-icons/fa6';

// ============================================================================
// Datos Estáticos (Iconos Sólidos Premium)
// ============================================================================
const MILESTONES = [
    {
        id: 'MP4', label: 'Video', color: '#3b82f6',
        icon: <FaVideo className="w-full h-full" />
    },
    {
        id: 'MP3', label: 'Audio', color: '#f59e0b',
        icon: <FaMusic className="w-full h-full" />
    },
    {
        id: 'TXT', label: 'Texto', color: '#10b981',
        icon: <FaFileLines className="w-full h-full" />
    }
];

const PHASES = [
    { key: 'downloading', label: 'Descarga', color: '#25f4ee' },
    { key: 'extracting_audio', label: 'Audio', color: '#f59e0b' },
    { key: 'transcribing', label: 'Transcripción', color: '#8a5cff' },
    { key: 'complete', label: 'Indexado', color: '#10b981' },
];

export interface TikTokProcessorProps {
    title?: string;
    author?: string;
    duration?: string;
    thumbnailUrl?: string;
    currentStepId?: 'MP4' | 'MP3' | 'TXT' | 'complete';
    stepProgress?: number;
    className?: string;
}

// ============================================================================
// Componente Principal: Procesador (Glassmorphism Espacial)
// ============================================================================
export const TikTokProcessor = React.memo(function TikTokProcessor({
    title, author, duration, thumbnailUrl, currentStepId = 'MP4', stepProgress = 0, className = ""
}: TikTokProcessorProps) {
    const activeMilestone = MILESTONES.find(m => m.id === currentStepId) || MILESTONES[0];
    const activeIndex = MILESTONES.findIndex(m => m.id === currentStepId);
    const safeProgress = Math.min(Math.max(stepProgress, 0), 100);
    const globalProgress = Math.min(100, ((activeIndex * 100) + safeProgress) / MILESTONES.length);

    const colorHex = activeMilestone.color;

    return (
        <motion.div
            className={`w-full relative rounded-[20px] group font-sans ${className}`}
            style={{
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: `inset 0 1px 1px rgba(255,255,255,0.1), 0 8px 24px 0 rgba(0, 0, 0, 0.4)`,
                backgroundColor: 'rgba(10, 12, 18, 0.65)',
                backdropFilter: 'blur(16px)',
            }}
            whileHover={{ scale: 1.01, y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >

            <div className="absolute inset-0 z-0 pointer-events-none rounded-[20px] overflow-hidden">
                {thumbnailUrl && (
                    <Image
                        src={thumbnailUrl}
                        alt={title || "TikTok Thumbnail"}
                        fill
                        className="object-cover opacity-[0.85] saturate-[1.3] contrast-[1.1] mix-blend-lighten"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                )}
                {/* Tinte oscuro uniforme solo para separar el fondo, sin ser un degradado denso */}
                <div className="absolute inset-0 bg-[#06080f]/40" />
            </div>

            {/* Tarjeta Principal estandarizada a padding 10px y gap 10px */}
            <div className="relative z-10 w-full p-[10px] flex gap-[10px] items-center">

                {/* 1. Área de Contenido Central (Textos con Drop Shadow Nítido) */}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 pl-1">
                    <h3
                        className="text-[12px] sm:text-[13px] font-semibold text-white leading-tight line-clamp-2 tracking-tight pr-2"
                        style={{ textShadow: '0 2px 4px rgba(0,0,0,1), 0 4px 10px rgba(0,0,0,1), 0 0 15px rgba(0,0,0,0.8)' }}
                    >
                        {title}
                    </h3>

                    <div
                        className="flex items-center text-[10px] sm:text-[11px] text-white/95 truncate tracking-wide mt-0.5"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,1), 0 3px 8px rgba(0,0,0,0.9)' }}
                    >
                        <span className="truncate max-w-[100px] sm:max-w-[120px] font-medium">{author}</span>
                        <span className="mx-1.5 opacity-60 text-white font-light">•</span>
                        <span className="opacity-100 text-white font-light">{duration}</span>
                    </div>
                </div>

                {/* 2. Panel de Progreso */}
                <div className="relative flex items-center shrink-0">
                    <div
                        className="relative flex flex-col justify-between w-[96px] sm:w-[104px] h-[64px] sm:h-[68px] rounded-[18px] overflow-hidden backdrop-blur-[40px]"
                        style={{
                            background: `linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.01) 100%)`,
                            boxShadow: `inset 0 1px 1px rgba(255,255,255,0.3), inset 0 0 0 1px rgba(255,255,255,0.1), 0 12px 32px rgba(0,0,0,0.5), 0 0 40px ${activeMilestone.color}20`
                        }}
                    >
                        {/* Llenado de Progreso */}
                        <motion.div
                            className="absolute top-0 left-0 h-full z-0 mix-blend-screen"
                            animate={{ width: `${globalProgress}%` }}
                            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                            style={{ backgroundColor: `${activeMilestone.color}35` }}
                        />

                        {/* Fila Superior */}
                        <div className="relative z-10 flex justify-between items-start px-3 pt-3">
                            <span
                                className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest leading-none drop-shadow-md"
                                style={{ color: activeMilestone.color }}
                            >
                                {activeMilestone.id}
                            </span>
                            <NumberFlow
                                value={Math.floor(globalProgress)}
                                suffix="%"
                                className="text-[14px] sm:text-[16px] font-mono font-bold text-white leading-none drop-shadow-md"
                                trend={1}
                            />
                        </div>

                        {/* Indicador de fases del pipeline */}
                        <div className="relative z-10 flex items-center justify-center gap-1 px-3 pb-2">
                            {PHASES.map((phase, idx) => {
                                const stepMap: Record<string, number> = { 'MP4': 0, 'MP3': 1, 'TXT': 2, 'complete': 3 };
                                const currentPhaseIndex = stepMap[currentStepId] ?? 0;
                                const isPast = idx < currentPhaseIndex;
                                const isActive = idx === currentPhaseIndex;
                                const isFuture = idx > currentPhaseIndex;
                                
                                return (
                                    <div key={phase.key} className="flex items-center">
                                        <div
                                            className={`w-[10px] h-[10px] rounded-full ${isActive ? 'phase-active-ping' : ''}`}
                                            style={{
                                                backgroundColor: isPast || isActive ? phase.color : 'rgba(255,255,255,0.15)',
                                                boxShadow: isActive ? `0 0 8px ${phase.color}` : 'none',
                                            }}
                                            title={phase.label}
                                        />
                                        {idx < PHASES.length - 1 && (
                                            <div
                                                className="w-[12px] h-[2px] mx-0.5"
                                                style={{
                                                    backgroundColor: isPast ? phase.color : 'rgba(255,255,255,0.15)',
                                                }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Secuencia de Iconos */}
                        <div className="relative z-10 flex justify-between items-center px-3.5 pb-3 mt-auto">
                            {MILESTONES.map((m, idx) => {
                                const isPast = idx < activeIndex;
                                const isActive = idx === activeIndex;

                                return (
                                    <div
                                        key={m.id}
                                        className={`flex items-center justify-center ${isActive ? 'w-[18px] h-[18px] sm:w-[20px] sm:h-[20px] scale-110 drop-shadow-[0_0_12px_rgba(255,255,255,0.8)] animate-pulse' :
                                            isPast ? 'w-[14px] h-[14px] sm:w-[16px] sm:h-[16px] opacity-100 drop-shadow-[0_0_8px_currentColor]' :
                                                'w-[14px] h-[14px] sm:w-[16px] sm:h-[16px] opacity-20 grayscale'
                                            }`}
                                        style={{ color: isActive || isPast ? m.color : '#ffffff' }}
                                    >
                                        {m.icon}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

            </div>
            <style jsx>{`
                @keyframes phasePing {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.3); opacity: 0.7; }
                }
                .phase-active-ping {
                    animation: phasePing 1.5s ease-in-out infinite;
                }
            `}</style>
        </motion.div>
    );
});