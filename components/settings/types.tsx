import React from 'react';
import { cn } from '@/lib/utils';
import { SHADOW, ACCENT } from '@/lib/design-tokens';
import { AppTheme } from '@/lib/settings-context';
import { FaFilm, FaMusic, FaFileLines } from '@/components/icon-library';

export const BYTES_PER_GIB = 1024 ** 3;

export function formatStorageBytes(bytes: number | null | undefined) {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return 'No medido';
    if (bytes >= BYTES_PER_GIB) return `${(bytes / BYTES_PER_GIB).toFixed(bytes >= 10 * BYTES_PER_GIB ? 0 : 1)} GiB`;
    return `${Math.max(0, Math.round(bytes / 1024 / 1024))} MiB`;
}

export interface ThemeOption {
    id: AppTheme;
    name: string;
    fullBg: string;
    accentGlow: string;
    borderActive: string;
    checkColor: string;
    badge?: string;
    desc?: string;
    gradient?: string;
    accentColor?: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
    {
        id: 'carbon',
        name: 'Gris Carbón',
        badge: 'Alternativo',
        desc: 'Grafito oscuro mate de alta legibilidad y elegancia sobria',
        fullBg: 'linear-gradient(145deg, #373b44 0%, #1e2128 50%, #111317 100%)',
        accentGlow: '0 0 24px 2px rgba(148, 163, 184, 0.4)',
        borderActive: 'rgba(255, 255, 255, 0.9)',
        checkColor: 'bg-white text-neutral-950',
        gradient: 'radial-gradient(ellipse at top left, #1e2026 0%, #121316 70%, #0a0b0d 100%)',
        accentColor: '#94a3b8',
    },
    {
        id: 'chromatic',
        name: 'Pulsaria',
        badge: 'Predeterminado',
        desc: 'Ondas WebGL multicromáticas vibrantes en tiempo real',
        fullBg: 'linear-gradient(135deg, #1d4ed8 0%, #a855f7 32%, #ec4899 65%, #f43f5e 100%)',
        accentGlow: '0 0 24px 2px rgba(244, 63, 94, 0.5)',
        borderActive: 'rgba(255, 255, 255, 0.95)',
        checkColor: 'bg-white text-rose-600',
        gradient: 'linear-gradient(135deg, rgba(254,44,85,0.7) 0%, rgba(138,92,255,0.7) 50%, rgba(37,244,238,0.7) 100%)',
        accentColor: '#fe2c55',
    },
    {
        id: 'aurora',
        name: 'Aurora Boreal',
        badge: 'Luz Ambiental',
        desc: 'Suaves estelas boreales con animación fluida',
        fullBg: 'linear-gradient(135deg, #064e3b 0%, #0d9488 38%, #10b981 72%, #06b6d4 100%)',
        accentGlow: '0 0 24px 2px rgba(45, 212, 191, 0.5)',
        borderActive: 'rgba(255, 255, 255, 0.95)',
        checkColor: 'bg-white text-teal-800',
        gradient: 'radial-gradient(ellipse at 30% 30%, rgba(37,244,238,0.4) 0%, rgba(254,44,85,0.3) 60%, #06080f 100%)',
        accentColor: '#25f4ee',
    },
    {
        id: 'oled',
        name: 'Negro Puro',
        badge: 'Máximo Contraste',
        desc: 'Negro absoluto ultra limpio optimizado para OLED',
        fullBg: 'linear-gradient(160deg, #1f2026 0%, #0b0c0e 45%, #000000 100%)',
        accentGlow: '0 0 24px 2px rgba(255, 255, 255, 0.3)',
        borderActive: 'rgba(255, 255, 255, 0.9)',
        checkColor: 'bg-white text-black',
        gradient: 'linear-gradient(180deg, #09090b 0%, #000000 100%)',
        accentColor: '#ffffff',
    },
    {
        id: 'cyberpunk',
        name: 'Obsidiana Neón',
        badge: 'Espacio Neón',
        desc: 'Nebulosa violeta profunda con destellos galácticos',
        fullBg: 'linear-gradient(135deg, #1e0d36 0%, #581c87 35%, #9333ea 70%, #c084fc 100%)',
        accentGlow: '0 0 24px 2px rgba(192, 132, 252, 0.5)',
        borderActive: 'rgba(255, 255, 255, 0.95)',
        checkColor: 'bg-white text-purple-900',
        gradient: 'linear-gradient(135deg, #240b36 0%, #0e051a 100%)',
        accentColor: '#c084fc',
    },
    {
        id: 'solar',
        name: 'Atardecer Ámbar',
        badge: 'Cálido Solar',
        desc: 'Gradiente de calidez solar profundo y rico',
        fullBg: 'linear-gradient(135deg, #450a0a 0%, #991b1b 30%, #ea580c 68%, #f59e0b 100%)',
        accentGlow: '0 0 24px 2px rgba(245, 158, 11, 0.5)',
        borderActive: 'rgba(255, 255, 255, 0.95)',
        checkColor: 'bg-white text-amber-700',
        gradient: 'linear-gradient(135deg, #450a0a 0%, #ea580c 100%)',
        accentColor: '#f59e0b',
    },
];

export const FORMAT_CATEGORIES = [
    {
        title: 'Video',
        icon: FaFilm,
        options: [
            { id: 'mp4', label: 'MP4', desc: 'Video standard', color: '#3b82f6' },
            { id: 'mkv', label: 'MKV', desc: 'Matroska Video', color: '#3b82f6' },
            { id: 'webm', label: 'WEBM', desc: 'Web Media', color: '#3b82f6' },
            { id: 'mov', label: 'MOV', desc: 'QuickTime Movie', color: '#3b82f6' },
        ]
    },
    {
        title: 'Audio',
        icon: FaMusic,
        options: [
            { id: 'wav', label: 'WAV', desc: 'Lossless Audio', color: '#f59e0b' },
            { id: 'mp3', label: 'MP3', desc: 'Compressed Audio', color: '#f59e0b' },
            { id: 'flac', label: 'FLAC', desc: 'Free Lossless', color: '#f59e0b' },
            { id: 'ogg', label: 'OGG', desc: 'Ogg Vorbis', color: '#f59e0b' },
            { id: 'm4a', label: 'M4A', desc: 'Apple Audio', color: '#f59e0b' },
        ]
    },
    {
        title: 'Texto',
        icon: FaFileLines,
        options: [
            { id: 'txt', label: 'TXT', desc: 'Plain Text', color: '#10b981' },
            { id: 'srt', label: 'SRT', desc: 'Subtitles', color: '#10b981' },
            { id: 'vtt', label: 'VTT', desc: 'Web Video Text', color: '#10b981' },
            { id: 'json', label: 'JSON', desc: 'Data Format', color: '#10b981' },
        ]
    }
];

export function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            className={cn('rounded-[20px] p-4 transition-all', className)}
            style={{
                border: 'none',
                background: 'rgba(18, 20, 26, 0.75)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            }}
        >
            {children}
        </div>
    );
}

export function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
    return (
        <div className="flex items-center gap-2 mb-3">
            <div
                className="w-5 h-5 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--accent-primary)] shadow-sm"
                style={{ background: ACCENT.primary12, boxShadow: SHADOW.nmInset }}
            >
                <Icon />
            </div>
            <span className="font-black tracking-[0.2em] uppercase" style={{ fontSize: 'var(--text-micro)', color: 'var(--text-ghost)' }}>
                {label}
            </span>
        </div>
    );
}

export type SettingsTab = 'general' | 'stats' | 'engine' | 'ai' | 'performance';

export interface CollectionSource {
    id: number;
    url: string;
    profile_url?: string;
    platform?: string;
    source_type: string;
    username?: string | null;
    display_name?: string | null;
    status?: string;
    active: boolean;
    last_success_at?: string | null;
    last_sync_at?: string | null;
    next_sync_at?: string | null;
    discovered_count: number;
    consecutive_failures: number;
    last_error?: string | null;
}

export interface HealthEventRecord {
    id: number;
    created_at: string;
    component: string;
    severity: string;
    diagnosis: string;
    action?: string | null;
    result?: string | null;
}

export interface RuntimeHealth {
    model: { model: string; ready: boolean; status: string; message?: string | null };
    queue_depth: number;
    backpressure_active: boolean;
    worker_capacity: number;
    idle_workers: number;
    processing_paused?: boolean;
    background_admission_paused?: boolean;
    autostart_enabled: boolean;
    api_ready: boolean;
    api_error?: string | null;
}

export type StorageState = 'ok' | 'quota-near' | 'quota-exceeded' | 'disk-low' | 'path-error' | 'unknown';

export interface StorageStatusUi {
    rootPath: string;
    totalBytes: number | null;
    freeBytes: number | null;
    quotaBytes: number | null;
    usedMediaBytes: number | null;
    stagedBytes: number | null;
    trashBytes: number | null;
    reserveBytes: number | null;
    state: StorageState;
}

export interface PurgeCandidateUi {
    jobId: number;
    title: string;
    mediaBytes: number;
    interestScore: number;
    reasons: string[];
    protected: boolean;
    favorite?: boolean;
    pinned?: boolean;
    transcriptAvailable?: boolean;
    sourceState?: string;
}

export interface PurgePreviewUi {
    candidates: PurgeCandidateUi[];
    purgeId?: string;
    message?: string;
    native: boolean;
}
