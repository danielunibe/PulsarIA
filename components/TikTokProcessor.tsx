'use client';
import React from 'react';
import { motion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import Image from 'next/image';
import { FaVideo, FaMusic, FaFileLines, FaDownload, FaWaveSquare, FaClosedCaptioning, FaDatabase } from 'react-icons/fa6';

// ============================================================================
// Datos Estáticos (Iconos Sólidos Premium)
// ============================================================================
const MILESTONES = [
    {
        id: 'MP4', label: 'Video', color: '#3b82f6',
        icon: <FaVideo className="w-full h-full" />,
        phaseIcon: <FaDownload className="w-full h-full" />
    },
    {
        id: 'MP3', label: 'Audio', color: '#f59e0b',
        icon: <FaMusic className="w-full h-full" />,
        phaseIcon: <FaWaveSquare className="w-full h-full" />
    },
    {
        id: 'TXT', label: 'Texto', color: '#10b981',
        icon: <FaFileLines className="w-full h-full" />,
        phaseIcon: <FaClosedCaptioning className="w-full h-full" />
    }
];

const PHASES = [
    { key: 'downloading', label: 'Descarga', color: '#25f4ee', icon: <FaDownload size={8} /> },
    { key: 'extracting_audio', label: 'Audio', color: '#f59e0b', icon: <FaWaveSquare size={8} /> },
    { key: 'transcribing', label: 'Transcripción', color: '#8a5cff', icon: <FaClosedCaptioning size={8} /> },
    { key: 'indexing', label: 'Indexado', color: '#10b981', icon: <FaDatabase size={8} /> },
];

export interface TikTokProcessorProps {
    /** Título del video en procesamiento */
    title?: string;
    /** Autor/creador del video */
    author?: string;
    /** Duración formateada del video (ej. '0:45') */
    duration?: string;
    /** URL del thumbnail del video */
    thumbnailUrl?: string;
    /** Fase actual del pipeline: 'MP4' (descarga), 'MP3' (audio), 'TXT' (transcripción), 'complete' */
    currentStepId?: 'MP4' | 'MP3' | 'TXT' | 'complete';
    /** Progreso de la fase actual (0-100) */
    stepProgress?: number;
    /** Clases CSS adicionales */
    className?: string;
}

/**
 * TikTokProcessor — Componente de monitoreo visual del pipeline con diseño limpio y estructurado.
 */
export const TikTokProcessor = React.memo(function TikTokProcessor({
    title, author, duration, thumbnailUrl, currentStepId = 'MP4', stepProgress = 0, className = ""
}: TikTokProcessorProps) {
    const activeMilestone = MILESTONES.find(m => m.id === currentStepId) || MILESTONES[0];
    const activeIndex = MILESTONES.findIndex(m => m.id === currentStepId);
    const safeProgress = Math.min(Math.max(stepProgress, 0), 100);
    const globalProgress = Math.min(100, Math.round(((activeIndex * 100) + safeProgress) / MILESTONES.length));

    const isGettingMetadata = !title || title.trim() === '' || title === '\u00a0';
    const displayTitle = isGettingMetadata ? 'Obteniendo metadatos' : title;

    return (
        <motion.div
            className={`w-full relative rounded-[20px] group font-sans overflow-hidden ${className}`}
            style={{
                border: '1px solid rgba(255, 255, 255, 0.06)',
                boxShadow: `inset 0 1px 1px rgba(255,255,255,0.08), 0 10px 30px 0 rgba(0, 0, 0, 0.5)`,
                backgroundColor: 'rgba(10, 12, 18, 0.7)',
                backdropFilter: 'blur(20px)',
            }}
            whileHover={{ scale: 1.005, y: -2 }}
            whileTap={{ scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
            {/* Imagen de fondo / Thumbnail o Arte Generativo */}
            <div className="absolute inset-0 z-0 pointer-events-none rounded-[20px] overflow-hidden">
                {thumbnailUrl ? (
                    <Image
                        src={thumbnailUrl}
                        alt={title || "TikTok Thumbnail"}
                        fill
                        className="object-cover opacity-[0.8] saturate-[1.2] contrast-[1.05] mix-blend-lighten"
                        sizes="(max-width: 768px) 100vw, 400px"
                    />
                ) : (
                    <div 
                        className="absolute inset-0 animate-[shimmerBg_8s_ease_infinite]"
                        style={{
                            background: 'linear-gradient(125deg, rgba(254,44,85,0.12) 0%, rgba(138,92,255,0.1) 50%, rgba(37,244,238,0.12) 100%)',
                            backgroundSize: '200% 200%',
                        }}
                    />
                )}
                {/* Tinte oscuro para legibilidad */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#06080f]/60 via-[#06080f]/40 to-[#06080f]/60" />
            </div>

            {/* Tarjeta Principal — Estructura limpia en 2 columnas */}
            <div className="relative z-10 w-full p-3.5 flex gap-3 items-stretch">
                
                {/* COLUMNA IZQUIERDA: Información del video + Pipeline steps */}
                <div className="flex-1 min-w-0 flex flex-col gap-3">
                    
                    {/* Título y metadatos */}
                    <div className="flex flex-col gap-1.5">
                        <h3
                            className="text-[13px] font-semibold text-white leading-snug line-clamp-2 tracking-tight"
                            style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9), 0 0 15px rgba(0,0,0,0.7)' }}
                        >
                            {displayTitle}
                            {isGettingMetadata && (
                                <span className="inline-flex items-center gap-1 ml-2 text-[10px] font-medium text-[#8a5cff] opacity-80">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#8a5cff] animate-pulse" />
                                    Cargando...
                                </span>
                            )}
                        </h3>

                        <div
                            className="flex items-center gap-2 text-[10px] text-white/70 truncate"
                            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                        >
                            <span className="truncate max-w-[140px] font-medium">{author || 'Pulsar Engine'}</span>
                            <span className="opacity-50 text-white font-light shrink-0">•</span>
                            <span className="opacity-80 text-white font-light shrink-0 font-mono">{duration || '--:--'}</span>
                        </div>
                    </div>

                    {/* Pipeline Steps — Visualización horizontal clara */}
                    <div className="pt-1 border-t border-white/[0.05]">
                        <div className="flex items-center gap-1.5">
                            {PHASES.map((phase, idx) => {
                                const stepMap: Record<string, number> = { 'MP4': 0, 'MP3': 1, 'TXT': 2, 'complete': 3 };
                                const currentPhaseIndex = stepMap[currentStepId] ?? 0;
                                const isPast = idx < currentPhaseIndex;
                                const isActive = idx === currentPhaseIndex;
                                const isFuture = idx > currentPhaseIndex;
                                
                                return (
                                    <div key={phase.key} className="flex items-center gap-1.5 flex-1 min-w-0">
                                        {/* Conector entre fases */}
                                        {idx > 0 && (
                                            <div
                                                className="flex-1 h-[2px] rounded-full transition-colors duration-300 shrink-0 min-w-[20px]"
                                                style={{
                                                    backgroundColor: isPast ? phase.color : isActive ? `${phase.color}60` : 'rgba(255,255,255,0.08)',
                                                    boxShadow: isActive ? `0 0 6px ${phase.color}80` : 'none',
                                                }}
                                            />
                                        )}
                                        
                                        {/* Fase actual */}
                                        <div className="flex flex-col items-center gap-1 shrink-0" style={{ minWidth: '60px' }}>
                                            <div
                                                className={`w-[10px] h-[10px] rounded-full transition-all duration-300 flex-shrink-0 ${
                                                    isActive ? 'phase-active-ping' : ''
                                                }`}
                                                style={{
                                                    backgroundColor: isPast || isActive ? phase.color : 'rgba(255,255,255,0.15)',
                                                    boxShadow: isPast || isActive ? `0 0 10px ${phase.color}60` : 'none',
                                                    border: isActive ? `2px solid ${phase.color}` : 'none',
                                                }}
                                                title={phase.label}
                                            />
                                            <span className={`text-[8px] font-bold uppercase tracking-wider text-center leading-none transition-colors ${
                                                isPast ? `text-${phase.color.replace('#', '')}` : 
                                                isActive ? `text-${phase.color.replace('#', '')} font-black` : 
                                                'text-white/25'
                                            }`}>
                                                {phase.label}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* COLUMNA DERECHA: Panel de Progreso Glassmorphism */}
                <div className="relative flex flex-col items-center justify-between shrink-0 w-[120px]">
                    <div
                        className="relative flex flex-col justify-between w-full h-[88px] rounded-[18px] overflow-hidden backdrop-blur-[40px] p-2.5"
                        style={{
                            background: `linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)`,
                            boxShadow: `inset 0 1px 1px rgba(255,255,255,0.2), inset 0 0 0 1px rgba(255,255,255,0.08), 0 12px 32px rgba(0,0,0,0.5), 0 0 40px ${activeMilestone.color}15`
                        }}
                    >
                        {/* Llenado de Progreso Global con Mezcla Glass */}
                        <motion.div
                            className="absolute top-0 left-0 h-full z-0 mix-blend-screen rounded-[16px]"
                            animate={{ width: `${globalProgress}%` }}
                            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                            style={{ backgroundColor: `${activeMilestone.color}30` }}
                        />

                        {/* Fila Superior: ID de Fase + % Tabular */}
                        <div className="relative z-10 flex justify-between items-center px-1">
                            <span
                                className="text-[9px] font-black uppercase tracking-widest leading-none drop-shadow-md"
                                style={{ color: activeMilestone.color }}
                            >
                                {activeMilestone.id}
                            </span>
                            <NumberFlow
                                value={Math.floor(globalProgress)}
                                suffix="%"
                                className="text-[13px] font-mono font-bold text-white leading-none drop-shadow-md"
                                trend={1}
                            />
                        </div>

                        {/* Icono de formato grande centrado */}
                        <div className="relative z-10 flex justify-center items-center py-2">
                            <div 
                                className={`w-[24px] h-[24px] rounded-[8px] flex items-center justify-center transition-all duration-300 ${
                                    activeIndex >= 0 ? '' : 'opacity-25 grayscale'
                                }`}
                                style={{ 
                                    backgroundColor: `${activeMilestone.color}25`,
                                    border: `1px solid ${activeMilestone.color}40`,
                                    boxShadow: `0 0 16px ${activeMilestone.color}30`,
                                }}
                            >
                                {activeMilestone.phaseIcon}
                            </div>
                        </div>

                        {/* Secuencia de Iconos de Formato (MP4 → MP3 → TXT) */}
                        <div className="relative z-10 flex justify-between items-center px-1.5 pb-0.5">
                            {MILESTONES.map((m, idx) => {
                                const isPast = idx < activeIndex;
                                const isActive = idx === activeIndex;
                                const isFuture = idx > activeIndex;

                                return (
                                    <div
                                        key={m.id}
                                        className={`flex flex-col items-center gap-0.5 transition-all duration-300 ${
                                            isActive 
                                                ? 'scale-105' 
                                                : isFuture 
                                                    ? 'opacity-20 grayscale' 
                                                    : 'opacity-100'
                                        }`}
                                        style={{ minWidth: '28px' }}
                                    >
                                        <div 
                                            className={`w-[14px] h-[14px] rounded-[4px] flex items-center justify-center transition-all duration-300 ${
                                                isActive ? 'scale-115 drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' : ''
                                            }`}
                                            style={{ 
                                                color: isActive || isPast ? m.color : '#ffffff',
                                                backgroundColor: isActive || isPast ? `${m.color}20` : 'transparent',
                                                border: isActive ? `1px solid ${m.color}` : isPast ? `1px solid ${m.color}40` : '1px solid rgba(255,255,255,0.1)',
                                            }}
                                        >
                                            {m.icon}
                                        </div>
                                        <span className={`text-[7px] font-black uppercase tracking-wider leading-none ${
                                            isActive ? `text-${m.color.replace('#', '')} font-black` : 
                                            isPast ? `text-${m.color.replace('#', '')}` : 
                                            'text-white/20'
                                        }`}>
                                            {m.id}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Progress bar del step actual debajo del panel */}
                    <div className="mt-2 w-full">
                        <div className="flex items-center justify-between text-[8px] font-mono mb-1">
                            <span className="text-white/40">Progreso de fase</span>
                            <span className="text-white/80 tabular-nums">{safeProgress}%</span>
                        </div>
                        <div className="h-[3px] rounded-full bg-white/10 overflow-hidden">
                            <motion.div
                                className="h-full rounded-full transition-all duration-500 ease-out"
                                animate={{ width: `${safeProgress}%` }}
                                style={{ 
                                    background: `linear-gradient(90deg, ${activeMilestone.color}, ${activeMilestone.color}dd)`,
                                    boxShadow: `0 0 8px ${activeMilestone.color}60`,
                                }}
                            />
                        </div>
                    </div>
                </div>

            </div>
            
            <style jsx>{`
                @keyframes phasePing {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.4); opacity: 0.7; }
                }
                .phase-active-ping {
                    animation: phasePing 1.5s ease-in-out infinite;
                }
                @keyframes shimmerBg {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
            `}</style>
        </motion.div>
    );
});