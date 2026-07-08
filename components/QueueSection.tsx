'use client';
import { useState, useEffect, useRef } from 'react';
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
                    RESTANTE
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

    const fetchTasks = async () => {
        try {
            // Intento de fetch nativo al motor Axum
            const response = await fetch('http://localhost:8080/api/v1/jobs');
            if (response.ok) {
                const data = await response.json();
                setTasks(data);
            }
        } catch (error) {
            console.error("Error polling jobs:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 3000); // Polling cada 3s
        return () => clearInterval(interval);
    }, []);

    // Solo mostrar las tareas en progreso (no las completadas, que ya van al Grid)
    const activeTasks = tasks.filter(t => t.status !== 'complete' && t.status !== 'done');
    const remainingPercentage = tasks.length > 0 ? Math.round((activeTasks.length / tasks.length) * 100) : 0;

    // Ordenar los formatos activos por paso (video → audio → texto)
    const sortedFormats = [...settings.formats].sort((a, b) => {
        const stepA = FORMAT_META[a]?.step ?? 99;
        const stepB = FORMAT_META[b]?.step ?? 99;
        return stepA - stepB;
    });

    return (
        <div className="flex-1 flex flex-col min-h-0 relative z-10 w-full font-sans">
            {/* Cabecera Flotante (Glassmorphism), para que las tarjetas pasen por debajo */}
            <motion.div
                className="absolute top-0 left-0 right-0 z-20 pb-2 pt-1 flex flex-col gap-1.5 px-1"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
                {/* Fila 1: Título y porcentaje */}
                <div className="flex items-center justify-between">
                    <div className="flex-shrink-0">
                        <h1
                            className="text-[11px] font-black uppercase tracking-[0.25em] whitespace-nowrap"
                            style={{
                                color: 'rgba(255,255,255,0.3)',
                                letterSpacing: '0.22em',
                            }}
                        >
                            Cola de Procesamiento
                        </h1>
                    </div>
                    <GlassPillLoader percentage={remainingPercentage} />
                </div>

                {/* Fila 2: Badges de formatos activos ordenados por pipeline */}
                {sortedFormats.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                        {/* Separadores de paso con flecha entre grupos */}
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
            </motion.div>

            {/* Lista Scrollable */}
            <div className="flex-1 relative min-h-0 w-full queue-wrapper flex flex-col">
                <div
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto min-h-0 pb-8 pt-[72px] px-1 flex flex-col gap-[20px] queue-scrollbar relative z-10"
                >
                    <AnimatePresence mode="popLayout">
                        {activeTasks.length === 0 && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col items-center justify-center py-8 gap-2"
                            >
                                <span className="text-[28px]">🎬</span>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-white/20 text-center">Cola vacía</p>
                                <p className="text-[9px] text-white/15 text-center">Pega un link de TikTok arriba para empezar</p>
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
