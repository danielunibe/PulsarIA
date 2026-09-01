'use client';

import React from 'react';
import { motion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import Image from 'next/image';
import { FaVideo, FaMusic, FaFileLines, FaDownload, FaWaveSquare, FaClosedCaptioning, FaDatabase } from 'react-icons/fa6';

const MILESTONES = [
    { id: 'MP4', label: 'Video', color: '#3b82f6', icon: <FaVideo className="w-full h-full" />, phaseIcon: <FaDownload className="w-full h-full" /> },
    { id: 'MP3', label: 'Audio', color: '#f59e0b', icon: <FaMusic className="w-full h-full" />, phaseIcon: <FaWaveSquare className="w-full h-full" /> },
    { id: 'TXT', label: 'Texto', color: '#10b981', icon: <FaFileLines className="w-full h-full" />, phaseIcon: <FaClosedCaptioning className="w-full h-full" /> },
] as const;

const PHASES = [
    { key: 'downloading', label: 'Descarga', color: '#25f4ee', icon: <FaDownload size={8} /> },
    { key: 'extracting_audio', label: 'Audio', color: '#f59e0b', icon: <FaWaveSquare size={8} /> },
    { key: 'transcribing', label: 'Transcripción', color: '#8a5cff', icon: <FaClosedCaptioning size={8} /> },
    { key: 'indexing', label: 'Indexado', color: '#10b981', icon: <FaDatabase size={8} /> },
] as const;

export interface TikTokProcessorProps {
    title?: string;
    author?: string;
    duration?: string;
    thumbnailUrl?: string;
    currentStepId?: 'MP4' | 'MP3' | 'TXT' | 'complete';
    stepProgress?: number;
    className?: string;
}

/** Monitor de procesamiento. Conserva la composición MP4/MP3/TXT original. */
export const TikTokProcessor = React.memo(function TikTokProcessor({
    title,
    author,
    duration,
    thumbnailUrl,
    currentStepId = 'MP4',
    stepProgress = 0,
    className = '',
}: TikTokProcessorProps) {
    const activeMilestone = MILESTONES.find((milestone) => milestone.id === currentStepId) || MILESTONES[0];
    const activeIndex = Math.max(0, MILESTONES.findIndex((milestone) => milestone.id === currentStepId));
    const safeProgress = Math.min(Math.max(stepProgress, 0), 100);
    const globalProgress = Math.min(100, Math.round(((activeIndex * 100) + safeProgress) / MILESTONES.length));
    const isGettingMetadata = !title || title.trim() === '' || title === '\u00a0';
    const displayTitle = isGettingMetadata ? 'Obteniendo metadatos' : title;
    const currentPhaseIndex = currentStepId === 'MP4' ? 0 : currentStepId === 'MP3' ? 1 : currentStepId === 'TXT' ? 2 : 3;
    const currentPhase = PHASES[currentPhaseIndex];

    return (
        <motion.article
            className={`relative w-full overflow-hidden rounded-[20px] border font-sans ${className}`}
            style={{
                minHeight: 164,
                borderColor: 'rgba(255,255,255,.06)',
                backgroundColor: 'rgba(10,12,18,.70)',
                backdropFilter: 'blur(20px)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,.08), 0 10px 30px rgba(0,0,0,.5)',
            }}
        >
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[20px]">
                {thumbnailUrl ? (
                    <Image src={thumbnailUrl} alt="" fill unoptimized sizes="400px" className="object-cover opacity-80 saturate-[1.2] contrast-[1.05] mix-blend-lighten" />
                ) : (
                    <div className="absolute inset-0 animate-[shimmerBg_8s_ease_infinite]" style={{ background: 'linear-gradient(125deg,rgba(254,44,85,.12),rgba(138,92,255,.10),rgba(37,244,238,.12))', backgroundSize: '200% 200%' }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-[#06080f]/60 via-[#06080f]/40 to-[#06080f]/60" />
            </div>

            <div className="relative z-10 flex w-full items-stretch gap-3 p-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-white" style={{ textShadow: '0 2px 6px rgba(0,0,0,.9)' }}>
                            {displayTitle}
                            {isGettingMetadata && <span className="ml-2 text-[10px] font-medium text-[#8a5cff] opacity-80">Cargando...</span>}
                        </h3>
                        <div className="flex items-center gap-2 truncate text-[10px] text-white/70" style={{ textShadow: '0 1px 3px rgba(0,0,0,.9)' }}>
                            <span className="max-w-[140px] truncate font-medium">{author || 'Pulsar Engine'}</span>
                            <span className="shrink-0 font-mono font-light text-white/80">{duration || '--:--'}</span>
                        </div>
                    </div>

                    <div className="border-t border-white/[.05] pt-1">
                        <div className="flex items-center gap-1.5">
                            {PHASES.map((phase, index) => {
                                const isPast = index < currentPhaseIndex;
                                const isActive = index === currentPhaseIndex;
                                return <div key={phase.key} className="h-[3px] min-w-0 flex-1 rounded-full" title={phase.label} aria-label={phase.label} style={{ backgroundColor: isPast ? phase.color : isActive ? `${phase.color}80` : 'rgba(255,255,255,.10)', boxShadow: isActive ? `0 0 8px ${phase.color}35` : 'none' }} />;
                            })}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="truncate text-[8px] font-black uppercase tracking-[.12em]" style={{ color: currentPhase.color }}>{currentPhase.label}</span>
                            <span className="shrink-0 font-mono text-[8px] text-white/55">{safeProgress}%</span>
                        </div>
                    </div>
                </div>

                <div className="relative flex w-[120px] shrink-0 flex-col items-center justify-between">
                    <div className="relative flex h-[88px] w-full flex-col justify-between overflow-hidden rounded-[18px] p-2.5" style={{ background: 'linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.01))', boxShadow: `inset 0 1px 1px rgba(255,255,255,.2), inset 0 0 0 1px rgba(255,255,255,.08), 0 12px 32px rgba(0,0,0,.5), 0 0 30px ${activeMilestone.color}15` }}>
                        <motion.div className="absolute left-0 top-0 z-0 h-full rounded-[16px] mix-blend-screen" animate={{ width: `${globalProgress}%` }} transition={{ duration: .6, ease: [0.22, 1, 0.36, 1] }} style={{ backgroundColor: `${activeMilestone.color}30` }} />
                        <div className="relative z-10 flex items-center justify-between px-1">
                            <span className="text-[9px] font-black uppercase leading-none tracking-widest" style={{ color: activeMilestone.color }}>{activeMilestone.id}</span>
                            <NumberFlow value={Math.floor(globalProgress)} suffix="%" className="font-mono text-[13px] font-bold leading-none text-white" trend={1} />
                        </div>
                        <div className="relative z-10 flex items-center justify-center py-2"><div className="flex h-[24px] w-[24px] items-center justify-center rounded-[8px]" style={{ backgroundColor: `${activeMilestone.color}25`, border: `1px solid ${activeMilestone.color}40`, color: activeMilestone.color }}>{activeMilestone.phaseIcon}</div></div>
                        <div className="relative z-10 grid w-full grid-cols-3 items-center gap-1 px-1 pb-0.5">
                            {MILESTONES.map((milestone, index) => {
                                const isPast = index < activeIndex;
                                const isActive = index === activeIndex;
                                return <div key={milestone.id} className="flex min-w-0 flex-col items-center gap-0.5" style={{ opacity: isActive || isPast ? 1 : .2, color: isActive || isPast ? milestone.color : '#fff' }}><div className="flex h-[14px] w-[14px] items-center justify-center rounded-[4px]" style={{ backgroundColor: isActive || isPast ? `${milestone.color}20` : 'transparent', border: isActive ? `1px solid ${milestone.color}` : isPast ? `1px solid ${milestone.color}40` : '1px solid rgba(255,255,255,.1)' }}>{milestone.icon}</div><span className="text-[7px] font-black leading-none tracking-normal">{milestone.id}</span></div>;
                            })}
                        </div>
                    </div>
                    <div className="mt-2 w-full">
                        <div className="mb-1 flex items-center justify-between font-mono text-[8px]"><span className="text-white/40">Progreso de fase</span><span className="tabular-nums text-white/80">{safeProgress}%</span></div>
                        <div className="h-[3px] overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full" animate={{ width: `${safeProgress}%` }} style={{ background: `linear-gradient(90deg,${activeMilestone.color},${activeMilestone.color}dd)` }} /></div>
                    </div>
                </div>
            </div>

            <style jsx>{`@keyframes shimmerBg { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }`}</style>
        </motion.article>
    );
});
