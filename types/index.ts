// ============================================================
// Tipos Globales Centralizados - Pulsar Eventide
// Importar desde aqui en lugar de redefinir en cada componente
// ============================================================

import React from 'react';

// --- Tipos de Video y Queue ---

export type QueueStep = 'MP4' | 'MP3' | 'TXT';

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

export const TT_PINK = '#fe2c55';
export const TT_CYAN = '#25f4ee';
export const NM_SHADOW = 'drop-shadow(2px 2px 2px #000) drop-shadow(-1px -1px 1px rgba(255,255,255,0.02))';

export const TIKTOK_ICON_PATHS = [
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
    'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z',
    'M14 9V5l7 7-7 7v-4.1c-7.1 0-11.7 2.2-15.2 6.9 1.4-7 5.4-13.9 15.2-14.8z',
] as const;

export const TIKTOK_COUNTS = ['1.2M', '45K', '22K', '12K'] as const;

export const TIKTOK_LOGO_PATH =
    'M12.525.02c1.31-.02 2.61-.01 3.91.04.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.95v5.26c.04 2.1-.64 4.25-1.95 5.89-1.31 1.66-3.32 2.72-5.46 2.87-2.14.15-4.3-.39-6.02-1.54-1.72-1.15-2.87-2.93-3.23-5.02-.36-2.09.05-4.28 1.15-6.07 1.1-1.78 2.84-3.05 4.88-3.52 1.05-.24 2.14-.3 3.2-.18V9.13c-.6-.04-1.21-.01-1.8.09-1.12.19-2.18.7-2.98 1.49-.8.79-1.35 1.79-1.57 2.89-.22 1.1.01 2.25.61 3.19.6 1.05 1.61 1.83 2.78 2.18 1.17.35 2.44.25 3.55-.26 1.11-.51 1.99-1.4 2.45-2.49.46-1.09.58-2.33.34-3.48V.02h4.38z';
