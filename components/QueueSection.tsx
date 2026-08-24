'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
                    const response = await fetch('http://localhost:8080/api/v1/jobs');
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
        fetchTasks();
        const interval = setInterval(fetchTasks, 2000);

        let unlistenProgress: (() => void) | undefined;
        let unlistenNotify: (() => void) | undefined;
        let unlistenIndexed: (() => void) | undefined;

        import('@tauri-apps/api/event').then(({ listen }) => {
            listen('job_progress', () => { fetchTasks(); }).then(fn => { unlistenProgress = fn; });
            listen('job_completed_notify', () => { fetchTasks(); }).then(fn => { unlistenNotify = fn; });
            listen('media_indexed', () => { fetchTasks(); }).then(fn => { unlistenIndexed = fn; });
        }).catch(() => {});

        const handleCustomJob = (e: any) => {
            const url = e.detail?.url;
            if (url) {
                setTasks(prev => {
                    const tempId = Date.now();
                    const cleanName = url.replace(/https?:\/\/(www\.)?tiktok\.com\/@?/, '').split('?')[0] || 'TikTok Video';
                    return [
                        {
                            id: tempId,
                            url,
                            status: 'downloading',
                            progress: 15,
                            title: `TikTok: ${cleanName}`,
                            author: 'Pulsar Engine',
                            created_at: new Date().toISOString()
                        },
                        ...prev
                    ];
                });
            }
            setTimeout(fetchTasks, 500);
        };

        window.addEventListener('pulsar_job_created', handleCustomJob);

        return () => {
            clearInterval(interval);
            unlistenProgress?.();
            unlistenNotify?.();
            unlistenIndexed?.();
            window.removeEventListener('pulsar_job_created', handleCustomJob);
        };
    }, [fetchTasks]);

    // Solo mostrar las tareas en progreso (no las completadas, que ya van al Grid)
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
        <div className="flex flex-col min-h-0 relative z-10 w-full font-sans">
            {/* Cabecera de la Cola */}
            <motion.div
                className="pb-2.5 pt-1 flex flex-col gap-2 px-1"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
                {/* Fila 1: Título y porcentaje */}
                <div className="flex items-center justify-between">
                    <div className="flex-shrink-0">
                        <h2
                            className="text-[11px] font-black uppercase tracking-[0.22em] whitespace-nowrap text-white/50"
                        >
                            Cola de Procesamiento — <span className="text-[#8a5cff]">{currentStage}</span>
                        </h2>
                    </div>
                    <GlassPillLoader percentage={stageProgress} />
                </div>

                {/* Fila 2: Badges de formatos activos ordenados por pipeline */}
                {sortedFormats.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {sortedFormats.map((fmt, i) => {
                            const meta = FORMAT_META[fmt];
                            const prevMeta = i > 0 ? FORMAT_META[sortedFormats[i - 1]] : null;
                            const newStep = prevMeta && meta && prevMeta.step !== meta.step;
                            return (
                                <div key={fmt} className="flex items-center gap-1">
                                    {newStep && (
                                        <span className="text-[8px] text-white/20 font-bold">→</span>
                                    )}
                                    <FormatBadge fmt={fmt} />
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Barra de progreso por etapas */}
                {activeTasks.length > 0 && (
                    <div className="flex items-center gap-[3px] w-full mt-0.5">
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
                                    className={`flex-1 h-[3px] rounded-full transition-all duration-500 ${
                                        isActive ? 'bg-[#8a5cff]' : isCurrent ? 'bg-[#8a5cff]/30' : 'bg-white/10'
                                    }`}
                                />
                            );
                        })}
                    </div>
                )}
            </motion.div>

            {/* Lista de Tareas en Cola */}
            <div className="w-full flex flex-col">
                <div
                    ref={scrollContainerRef}
                    className="w-full flex flex-col gap-3 relative z-10"
                >
                    <AnimatePresence mode="popLayout">
                        {activeTasks.length === 0 && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col items-center justify-center py-6 px-4 rounded-[20px] border border-dashed border-white/10 bg-white/[0.01] gap-2"
                            >
                                <span className="text-[24px]">🎬</span>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 text-center">Cola libre</p>
                                <p className="text-[10px] text-white/20 text-center leading-tight">Pega un enlace arriba para descargar y procesar</p>
                            </motion.div>
                        )}
                        {activeTasks.map((task, idx) => {
                            // ── Título: mostrar nombre real o un loading state animado
                            const displayTitle = task.title || null;

                            // ── Thumbnail: si tenemos la ruta y el basePath, construir URL de asset
                            // Por simplicidad, si el thumbnail no es http, puede ser ruta local
                            const thumbnailSrc = task.thumbnail
                                ? (task.thumbnail.startsWith('http')
                                    ? task.thumbnail
                                    : undefined) // rutas locales requieren basePath del Tauri, no disponible aquí
                                : undefined;

                            return (
                            <motion.div
                                className="w-full flex-shrink-0 relative"
                                key={task.id}
                                layout
                                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{
                                    opacity: 0,
                                    scale: 0.85,
                                    y: -30,
                                    rotateX: 15,
                                    filter: 'blur(6px)',
                                    zIndex: -1,
                                }}
                                transition={{
                                    duration: 0.55,
                                    delay: idx * 0.05,
                                    ease: [0.22, 1, 0.36, 1],
                                    layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
                                }}
                                style={{ perspective: 800, transformStyle: 'preserve-3d' }}
                            >
                                {/* Loading shimmer cuando el título no está listo */}
                                {!displayTitle && (
                                    <div className="absolute top-3 left-3 right-[120px] z-20 pointer-events-none">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
                                            <span className="text-[9px] font-bold text-white/30 uppercase tracking-wider animate-pulse">
                                                Obteniendo metadata...
                                            </span>
                                        </div>
                                    </div>
                                )}
                                <TikTokProcessor 
                                    title={displayTitle || '\u00a0'}
                                    author={task.author || (displayTitle ? 'Pulsar Engine' : '')} 
                                    thumbnailUrl={thumbnailSrc}
                                    duration={task.duration ? String(task.duration) : '--:--'}
                                    currentStepId={
                                        task.status === 'queued' ? 'MP4' : 
                                        task.status === 'downloading' ? 'MP4' :
                                        task.status === 'processing' ? 'MP3' : 
                                        task.status === 'transcribing' ? 'TXT' : 'MP4'
                                    }
                                    stepProgress={task.progress}
                                />
                            </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
