'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { TikTokProcessor } from './TikTokProcessor';
import { useSettings } from '@/lib/settings-context';

// ============================================================
// GlassPillLoader — Componente de Carga Premium (User Provided)
// Design: Gradient Aura, Glass Pill, Tabular Numbers
// ============================================================
function GlassPillLoader({ percentage }: { percentage: number }) {
    return (
        <div className="relative inline-flex items-center justify-center px-3 py-1 rounded-[10px] overflow-hidden group">
            {/* Aura de gradiente difuminado en el fondo */}
            <div
                className="absolute inset-0 z-0 animate-[flowAura_6s_linear_infinite] opacity-60"
                style={{
                    background: 'linear-gradient(90deg, #612c3f, #46305c, #28364a, #46305c, #612c3f)',
                    backgroundSize: '200% 100%',
                    filter: 'blur(8px)',
                }}
            />

            {/* Contenedor principal translúcido */}
            <div
                className="absolute inset-0 z-10 rounded-[10px] border border-white/10 backdrop-blur-[10px]"
                style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    boxShadow: `
                        inset 0 1px 4px rgba(255, 255, 255, 0.05),
                        inset 0 -1px 6px rgba(0, 0, 0, 0.3)
                    `
                }}
            />

            {/* Contenido inline */}
            <div className="relative z-20 flex items-center gap-2">
                <div className="flex items-baseline text-[#f0f0f0]">
                    <span className="text-[13px] font-bold tabular-nums tracking-tighter">
                        {percentage}
                    </span>
                    <span className="text-[9px] font-medium ml-0.5 opacity-80">%</span>
                </div>
                <div
                    className="text-[8px] font-black text-white/50 tracking-[1px] uppercase leading-none mt-0.5"
                >
                    PROGRESO
                </div>
            </div>

            <style jsx>{`
                @keyframes flowAura {
                    0% { background-position: 200% 0; }
                    100% { background-position: 0% 0; }
                }
            `}</style>
        </div>
    );
}

// ============================================================
// Mapa de metadatos para cada formato de archivo
// ============================================================
const FORMAT_META: Record<string, { label: string; color: string; step: number }> = {
    // Video — paso 1
    mp4:  { label: 'MP4',  color: '#3b82f6', step: 1 },
    mkv:  { label: 'MKV',  color: '#3b82f6', step: 1 },
    webm: { label: 'WEBM', color: '#3b82f6', step: 1 },
    mov:  { label: 'MOV',  color: '#3b82f6', step: 1 },
    // Audio — paso 2
    mp3:  { label: 'MP3',  color: '#f59e0b', step: 2 },
    wav:  { label: 'WAV',  color: '#f59e0b', step: 2 },
    flac: { label: 'FLAC', color: '#f59e0b', step: 2 },
    ogg:  { label: 'OGG',  color: '#f59e0b', step: 2 },
    m4a:  { label: 'M4A',  color: '#f59e0b', step: 2 },
    // Texto — paso 3
    txt:  { label: 'TXT',  color: '#10b981', step: 3 },
    srt:  { label: 'SRT',  color: '#10b981', step: 3 },
    vtt:  { label: 'VTT',  color: '#10b981', step: 3 },
    json: { label: 'JSON', color: '#10b981', step: 3 },
};

// Badge de un formato de descarga para el panel de cola
function FormatBadge({ fmt }: { fmt: string }) {
    const meta = FORMAT_META[fmt];
    if (!meta) return null;
    return (
        <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-[5px]"
            style={{
                background: `${meta.color}18`,
                border: `1px solid ${meta.color}35`,
                color: meta.color,
            }}
        >
            <span className="text-[8px] font-black tracking-wider">{meta.label}</span>
        </div>
    );
}

// ============================================================
// QueueSection — Cola de Procesamiento con Motion v12
// ============================================================

export function QueueSection() {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const { settings } = useSettings();

    const fetchTasks = useCallback(async () => {
        try {
            let data: any[] = [];
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                data = await invoke('get_jobs');
            } catch {
                try {
                    const { REST_API_BASE } = await import('@/lib/api-config');
                    const response = await fetch(`${REST_API_BASE}/jobs`);
                    if (response.ok) data = await response.json();
                } catch {
                    // ignore
                }
            }
            if (data && Array.isArray(data)) {
                setTasks(data);
            }
        } catch (error) {
            console.error("Error polling jobs:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (active) void fetchTasks();
        });
        const interval = setInterval(fetchTasks, 2000);

        let unlistenProgress: (() => void) | undefined;
        let unlistenNotify: (() => void) | undefined;
        let unlistenIndexed: (() => void) | undefined;

        import('@tauri-apps/api/event').then(({ listen }) => {
            const safeListen = (event: string, cb: () => void, setter: (fn: () => void) => void) => {
                try { listen(event, cb).then(setter).catch(() => {}); } catch {}
            };
            safeListen('job_progress', () => { fetchTasks(); }, fn => { unlistenProgress = fn; });
            safeListen('job_completed_notify', () => { fetchTasks(); }, fn => { unlistenNotify = fn; });
            safeListen('media_indexed', () => { fetchTasks(); }, fn => { unlistenIndexed = fn; });
        }).catch(() => {});

        const handleCustomJob = (e: any) => {
            const url = e.detail?.url;
            const realJobId = e.detail?.job_id;
            if (url) {
                // Bug #7 FIX: Use real job_id from backend if available
                setTasks(prev => {
                    const tempId = realJobId || Date.now();
                    // Don't create a duplicate if the real job already exists
                    if (realJobId && prev.some(t => t.id === realJobId)) return prev;
                    const cleanName = url.replace(/https?:\/\/(www\.)?tiktok\.com\/@?/, '').split('?')[0] || 'TikTok Video';
                    return [
                        {
                            id: tempId,
                            url,
                            status: 'queued',
                            progress: 0,
                            title: `TikTok: ${cleanName}`,
                            author: 'Pulsar Engine',
                            created_at: new Date().toISOString()
                        },
                        ...prev
                    ];
                });
            }
            // Bug #7 FIX: Let the 2s interval reconcile — no immediate fetch that races
        };

        window.addEventListener('pulsar_job_created', handleCustomJob);

                return () => {
            active = false;
            clearInterval(interval);

            unlistenProgress?.();
            unlistenNotify?.();
            unlistenIndexed?.();
            window.removeEventListener('pulsar_job_created', handleCustomJob);
        };
    }, [fetchTasks]);

    // Solo mostrar las tareas en progreso (no las completadas, que ya van al Grid)
        const isTaskError = (task: any) => ['error', 'error_dlq', 'failed', 'failure', 'cancelled', 'canceled'].includes(String(task.status).toLowerCase());
    const activeTasks = tasks.filter(t => t.status !== 'complete' && t.status !== 'completed' && t.status !== 'done');

    const remainingPercentage = tasks.length > 0 ? Math.round((activeTasks.length / tasks.length) * 100) : 0;

    // Ordenar los formatos activos por paso (video → audio → texto)
    const sortedFormats = [...settings.formats].sort((a, b) => {
        const stepA = FORMAT_META[a]?.step ?? 99;
        const stepB = FORMAT_META[b]?.step ?? 99;
        return stepA - stepB;
    });

    const stageProgress = useMemo(() => {
                if (activeTasks.length === 0) return 0;
        let total = 0;
        for (const task of activeTasks) {
            if (isTaskError(task)) continue;
            switch (task.status) {

                case 'queued':
                case 'downloading':
                    total += Math.min(task.progress, 40);
                    break;
                case 'processing':
                    total += 40 + Math.min(Math.max(task.progress - 40, 0), 20);
                    break;
                case 'transcribing':
                    total += 60 + Math.min(Math.max(task.progress - 60, 0), 30);
                    break;
                case 'indexing':
                    total += 90 + Math.min(Math.max(task.progress - 90, 0), 10);
                    break;
                default:
                    total += task.progress;
            }
        }
        return Math.round(total / activeTasks.length);
    }, [activeTasks]);

    const currentStage = useMemo(() => {
                if (activeTasks.length === 0) return 'Idle';
        const minTask = activeTasks.reduce((min, t) => t.progress < min.progress ? t : min, activeTasks[0]);
        if (isTaskError(minTask)) return 'Error';
        switch (minTask.status) {

            case 'queued':
            case 'downloading':
                return 'Descargando';
            case 'processing':
                return 'Audio';
            case 'transcribing':
                return 'Transcribiendo';
            case 'indexing':
                return 'Indexando';
            default:
                return 'Procesando';
        }
    }, [activeTasks]);

    return (
        <div className="flex flex-col min-h-0 relative z-10 w-full font-sans gap-4">
            {/* Cabecera de la Cola */}
            <motion.div
                className="flex flex-col gap-3 px-1"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
                {/* Fila 1: Título y porcentaje — con más espacio */}
                <div className="flex items-start justify-between gap-4 pt-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${activeTasks.length > 0 ? 'bg-[#8a5cff] shadow-[0_0_10px_#8a5cff] animate-pulse' : 'bg-white/20'}`} />
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <h2 className="text-[11px] font-black uppercase tracking-[0.18em] truncate text-white/70">
                                Cola de Procesamiento
                            </h2>
                            {activeTasks.length > 0 && (
                                <span className="text-[10px] font-medium text-[#8a5cff] font-mono">
                                    {currentStage}
                                </span>
                            )}
                        </div>
                    </div>
                    {activeTasks.length > 0 && (
                        <GlassPillLoader percentage={stageProgress} />
                    )}
                </div>

                {/* Fila 2: Badges de formatos activos — más espacio */}
                {sortedFormats.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className="text-[9px] font-bold text-white/30 uppercase tracking-wider shrink-0">Formatos:</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {sortedFormats.map((fmt, i) => {
                                const meta = FORMAT_META[fmt];
                                const prevMeta = i > 0 ? FORMAT_META[sortedFormats[i - 1]] : null;
                                const newStep = prevMeta && meta && prevMeta.step !== meta.step;
                                return (
                                    <div key={fmt} className="flex items-center gap-1">
                                        {newStep && (
                                            <span className="text-[9px] text-white/25 font-bold">→</span>
                                        )}
                                        <FormatBadge fmt={fmt} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Barra de progreso por etapas — más alto y espaciado */}
                {activeTasks.length > 0 && (
                    <div className="flex items-center gap-2 w-full pt-1">
                        {[
                            { label: 'Descargando', threshold: 0 },
                            { label: 'Audio', threshold: 40 },
                            { label: 'Transcribiendo', threshold: 60 },
                            { label: 'Indexando', threshold: 90 },
                        ].map((stage, i) => {
                            const prevThreshold = i === 0 ? 0 : [0, 40, 60, 90][i - 1];
                            const isActive = stageProgress >= stage.threshold;
                            const isCurrent = !isActive && stageProgress >= prevThreshold;
                            return (
                                <div
                                    key={stage.label}
                                    className={`flex-1 h-[4px] rounded-full transition-all duration-500 relative ${
                                        isActive ? 'bg-[#8a5cff] shadow-[0_0_8px_#8a5cff]' : isCurrent ? 'bg-[#8a5cff]/40' : 'bg-white/10'
                                    }`}
                                    title={stage.label}
                                >
                                    {isCurrent && (
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[8px] h-[8px] rounded-full bg-[#8a5cff] shadow-[0_0_10px_#8a5cff] animate-ping" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </motion.div>

            {/* Lista de Tareas en Cola — más gap entre cards */}
            <div className="w-full flex flex-col min-h-0">
                <div
                    ref={scrollContainerRef}
                    className="w-full flex flex-col gap-3.5 relative z-10 queue-scrollbar"
                >
                    {activeTasks.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center justify-center py-8 px-4 rounded-[20px] border border-dashed border-white/10 bg-white/[0.01] gap-2"
                        >
                            <span className="text-[24px]">🎬</span>
                            <p className="text-[11px] font-black uppercase tracking-widest text-white/40 text-center">Cola Libre</p>
                            <p className="text-[10px] text-white/25 text-center leading-snug">Pega un enlace arriba para descargar y procesar</p>
                        </motion.div>
                    ) : (
                        activeTasks.map((task, idx) => {
                            const displayTitle = task.title || null;
                            const thumbnailSrc = task.thumbnail
                                ? (task.thumbnail.startsWith('http')
                                    ? task.thumbnail
                                    : undefined)
                                : undefined;

                            return (
                            <motion.div
                                className="w-full flex-shrink-0 relative"
                                key={task.id}
                                layout
                                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{
                                    opacity: 0,
                                    scale: 0.85,
                                    y: -20,
                                    filter: 'blur(6px)',
                                }}
                                transition={{
                                    duration: 0.4,
                                    delay: idx * 0.04,
                                    ease: [0.22, 1, 0.36, 1],
                                }}
                            >
                                <TikTokProcessor 
                                    title={displayTitle || ''}
                                    author={task.author || (displayTitle ? 'Pulsar Engine' : '')} 
                                    thumbnailUrl={thumbnailSrc}
                                    duration={task.duration ? String(task.duration) : '--:--'}
                                    currentStepId={
                                        task.status === 'queued' ? 'MP4' : 
                                        task.status === 'downloading' ? 'MP4' :
                                        task.status === 'processing' ? 'MP3' : 
                                        task.status === 'transcribing' || task.status === 'indexing' ? 'TXT' : 'MP4'
                                    }
                                    stepProgress={isTaskError(task) ? 0 : task.progress}
                                />
                                {isTaskError(task) && (
                                    <div role="alert" className="mt-2 rounded-[12px] border border-[#fe2c55]/30 bg-[#fe2c55]/10 px-3 py-2.5 text-[10px] text-[#fe2c55] leading-relaxed">
                                        {task.error_message || 'No se pudo completar este contenido. Revisa los requisitos del worker y vuelve a intentarlo.'}
                                    </div>
                                )}
                            </motion.div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
