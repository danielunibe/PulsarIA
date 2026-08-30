'use client';
import { useMemo, useState } from 'react';

interface JobRecord {
    id: number;
    url: string;
    status: string;
    progress: number;
    created_at: string;
    title?: string;
    author?: string;
    thumbnail?: string;
    duration?: number;
    video_path?: string;
}

/**
 * Props del panel de estadísticas del dashboard.
 * 
 * Muestra métricas de uso: total de videos, duración total indexada,
 * distribución por plataforma, y videos procesados esta semana.
 */
interface StatsPanelProps {
    /** Lista completa de jobs (videos) de la biblioteca */
    jobs: JobRecord[];
}

/**
 * StatsPanel — Panel de métricas de uso del dashboard.
 * 
 * Calcula y muestra:
 * - Total de videos procesados
 * - Duración total de contenido indexado (horas)
 * - Distribución por plataforma (TikTok, YouTube, Instagram, otros)
 * - Videos procesados esta semana
 */
export function StatsPanel({ jobs }: StatsPanelProps) {
    const [now] = useState(() => Date.now());
    const stats = useMemo(() => {
        const completed = jobs.filter(j => j.status === 'complete');
        const total = completed.length;
        const totalDuration = completed.reduce((acc, j) => acc + (j.duration || 0), 0);
        
        // Plataformas
        const platforms = { tiktok: 0, youtube: 0, instagram: 0, generic: 0 };
        completed.forEach(job => {
            const url = job.url || '';
            if (url.includes('tiktok.com')) platforms.tiktok++;
            else if (url.includes('youtube.com') || url.includes('youtu.be')) platforms.youtube++;
            else if (url.includes('instagram.com')) platforms.instagram++;
            else platforms.generic++;
        });
        
        // Videos esta semana
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
        const thisWeek = completed.filter(j => new Date(j.created_at).getTime() > weekAgo).length;
        
        return { total, totalDuration, platforms, thisWeek };
    }, [jobs, now]);

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    const maxPlatform = Math.max(...Object.values(stats.platforms), 1);

    return (
        <div 
            className="flex flex-col gap-3.5 p-4 rounded-[20px] border transition-all"
            style={{
                background: 'rgba(14, 16, 22, 0.75)',
                backdropFilter: 'blur(20px)',
                borderColor: 'rgba(255, 255, 255, 0.08)',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
            }}
        >
            <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white/40">Estadísticas</span>
                <span className="text-[9px] font-mono text-white/30 font-bold">LIBRERÍA</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col p-3 rounded-[14px] bg-black/40 border border-white/5 shadow-inner">
                    <span className="text-white/40 text-[9px] uppercase font-bold tracking-widest mb-1">Total Videos</span>
                    <span className="text-white font-black text-xl leading-none">{stats.total}</span>
                </div>
                <div className="flex flex-col p-3 rounded-[14px] bg-black/40 border border-white/5 shadow-inner">
                    <span className="text-white/40 text-[9px] uppercase font-bold tracking-widest mb-1">Duración</span>
                    <span className="text-white font-black text-xl leading-none truncate">{formatDuration(stats.totalDuration)}</span>
                </div>
            </div>

            <div className="flex flex-col gap-2 p-3 rounded-[14px] bg-black/30 border border-white/5">
                <span className="text-white/40 text-[9px] uppercase font-bold tracking-widest">Plataformas</span>
                {Object.entries(stats.platforms).map(([platform, count]) => (
                    <div key={platform} className="flex items-center gap-2">
                        <span className="text-[10px] text-white/60 w-16 capitalize font-medium">{platform}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div 
                                className="h-full rounded-full transition-all duration-500"
                                style={{ 
                                    width: `${(count / maxPlatform) * 100}%`,
                                    background: platform === 'tiktok' ? '#fe2c55' : 
                                                platform === 'youtube' ? '#ff0000' : 
                                                platform === 'instagram' ? '#e1306c' : '#ffffff'
                                }}
                            />
                        </div>
                        <span className="text-[10px] text-white/40 w-6 text-right font-mono font-bold">{count}</span>
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-[12px] bg-white/[0.02] border border-white/5">
                <span className="text-white/50 text-[10px] uppercase font-bold tracking-wider">Esta semana</span>
                <span className="text-white font-black text-xs font-mono">{stats.thisWeek} videos</span>
            </div>
        </div>
    );
}