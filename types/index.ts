// ============================================================
// Tipos Globales Centralizados - Pulsaria
// Importar desde aqui en lugar de redefinir en cada componente
// ============================================================

import React from 'react';

// --- Tipos de Video y Queue ---

export type QueueStep = 'MP4' | 'MP3' | 'TXT';

export type SetupIntent = 'knowledge' | 'balanced' | 'archive';
export type SourceState = 'local' | 'online' | 'unavailable';

export interface StorageRecommendation {
    intent: SetupIntent;
    quotaBytes: number;
    reserveBytes: number;
    retention: 'keep' | 'online';
    formats: string[];
    reason: string;
}

export interface StorageStatus {
    rootPath: string;
    totalBytes: number;
    freeBytes: number;
    quotaBytes: number;
    usedMediaBytes: number;
    stagedBytes: number;
    trashBytes: number;
    reserveBytes: number;
    state: 'ok' | 'quota-near' | 'quota-exceeded' | 'disk-low' | 'path-error';
}

export interface PurgeCandidate {
    jobId: number;
    title: string;
    mediaBytes: number;
    interestScore: number;
    reasons: string[];
    protected: boolean;
}

export interface QueueItem {
    id: number;
    title: string;
    author: string;
    duration: string;
    step: QueueStep;
    progress: number;
    completed: string[];
    done: boolean;
    thumb?: string;
    isWaiting?: boolean;
}

// Datos de un video activo en el Dashboard
export interface VideoData {
    id: number;
    title: string;
    author: string;
    duration: string;
    tags: string[];
    thumb: string;
    videoSrc: string;
    originalUrl?: string;
    visualAnalysis?: string;
    instructionalGuide?: string;
    /** Estado de disponibilidad del medio y su ficha persistida. */
    sourceState?: SourceState;
    /** Demo assets are self-contained and have no SQLite transcript record. */
    isDemo?: boolean;
}

export type CinemaSourceState = 'local' | 'online' | 'unavailable';

export interface CinemaVideo extends VideoData {
    sourceState?: CinemaSourceState;
}

// --- Props de Componentes ---

export interface VideoCardProps {
    isActive?: boolean;
    title?: string;
    author?: string;
    duration?: string;
    tags?: string[];
    thumb?: string;
    id?: number;
    videoSrc?: string;
    isFullPlaying?: boolean;
    onPlayStart?: () => void;
    onPlayStop?: () => void;
}

// --- Tipos de TikTokProcessor ---

export type MilestoneId = 'MP4' | 'MP3' | 'TXT';

export interface FormatBadgeProps {
    label: string;
    icon: React.ReactNode;
    isProcessing: boolean;
    isCompleted: boolean;
    color: string;
}

export interface TikTokProcessorProps {
    title?: string;
    author?: string;
    duration?: string;
    thumbnailUrl?: string;
    currentStepId?: MilestoneId;
    stepProgress?: number;
    completedSteps?: string[];
    isFinished?: boolean;
    className?: string;
}

// --- Tipos de Filtrado ---

export type Platform = 'tiktok' | 'youtube' | 'instagram' | 'all';

// --- Constantes de Diseno del Proyecto ---
