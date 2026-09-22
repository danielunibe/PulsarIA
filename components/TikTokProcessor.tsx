'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import {
    FaClosedCaptioning,
    FaDatabase,
    FaDownload,
    FaFileLines,
    FaMusic,
    FaVideo,
    FaWaveSquare,
} from '@/components/icon-library';

const MILESTONES = [
    { id: 'MP4', label: 'Video', color: '#3b82f6', icon: FaVideo },
    { id: 'MP3', label: 'Audio', color: '#f59e0b', icon: FaMusic },
    { id: 'TXT', label: 'Texto', color: '#10b981', icon: FaFileLines },
] as const;

const PHASES = [
    { label: 'Descarga', color: '#ffffff', icon: FaDownload },
    { label: 'Audio', color: '#f59e0b', icon: FaWaveSquare },
    { label: 'Transcripción', color: '#e2e8f0', icon: FaClosedCaptioning },
    { label: 'Indexado', color: '#10b981', icon: FaDatabase },
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

/** Compact processing card shown below the link form. */
export const TikTokProcessor = React.memo(function TikTokProcessor({
    title,
    author,
    duration,
    thumbnailUrl,
    currentStepId = 'MP4',
    stepProgress = 0,
    className = '',
}: TikTokProcessorProps) {
    const activeIndex = Math.max(0, MILESTONES.findIndex((milestone) => milestone.id === currentStepId));
    const safeProgress = Math.min(100, Math.max(0, stepProgress));
    const totalProgress = currentStepId === 'complete'
        ? 100
        : Math.min(100, Math.round(((activeIndex * 100) + safeProgress) / MILESTONES.length));
    const phaseIndex = currentStepId === 'MP4' ? 0 : currentStepId === 'MP3' ? 1 : currentStepId === 'TXT' ? 2 : 3;
    const phase = PHASES[phaseIndex];
    const PhaseIcon = phase.icon;
    const displayTitle = title?.trim() || 'Obteniendo metadatos';

    return (
        <motion.article className={`processor-card ${className}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} layout>
            <div className="processor-card__wash" aria-hidden="true">
                <div className="processor-card__blur" style={{ backgroundImage: `url(${thumbnailUrl || '/pulsaria-icon.png'})` }} />
                {thumbnailUrl ? (
                    <Image src={thumbnailUrl} alt="" fill unoptimized sizes="180px" className="processor-card__thumb" />
                ) : (
                    <Image src="/pulsaria-icon.png" alt="" fill unoptimized sizes="180px" className="processor-card__fallback" />
                )}
                <div className="processor-card__wash-fade" />
            </div>

            <div className="processor-card__copy">
                <h3 title={displayTitle}>{displayTitle}</h3>
                <p><span>{author || 'Pulsaria Engine'}</span><span>{duration || '--:--'}</span></p>
                <div className="processor-card__phases" aria-label="Etapas de procesamiento">
                    {MILESTONES.map((milestone, index) => {
                        const Icon = milestone.icon;
                        const active = currentStepId === 'complete' || index <= activeIndex;
                        return (
                            <span key={milestone.id} className={active ? 'is-active' : ''} style={{ '--phase-color': milestone.color } as React.CSSProperties}>
                                <Icon size={11} />{milestone.id}
                            </span>
                        );
                    })}
                </div>
                <div className="processor-card__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={totalProgress} aria-label="Progreso de procesamiento">
                    <motion.span animate={{ width: `${totalProgress}%` }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} style={{ background: phase.color }} />
                </div>
            </div>

            <div className="processor-card__status" style={{ '--phase-color': phase.color } as React.CSSProperties}>
                <div className="processor-card__status-top"><strong>{currentStepId === 'complete' ? 'LISTO' : MILESTONES[activeIndex]?.id || 'MP4'}</strong><b>{Math.round(safeProgress)}%</b></div>
                <PhaseIcon size={24} />
                <span>{currentStepId === 'complete' ? 'Procesado' : phase.label}</span>
                <small>Progreso de fase <b>{Math.round(safeProgress)}%</b></small>
            </div>
        </motion.article>
    );
});
