'use client';

import { motion } from 'motion/react';
import type { VideoData } from '@/types';
import {
    FaXmark, FaVideo, FaMusic, FaFileLines, FaDownload,
    FaPlay, FaPause, FaLanguage, FaBrain, FaWandMagicSparkles,
    FaBolt, FaCheckDouble, FaClock, FaCopy, FaShareNodes,
    FaMagnifyingGlass, FaVolumeHigh, FaVolumeXmark, FaExpand,
    FaTerminal, FaCode, FaCheck, FaRotateLeft
} from 'react-icons/fa6';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useSemanticIO } from '@/hooks/useSemanticIO';

// ============================================================
// ExpandedVideoModal — AAA Multimodal Knowledge Hub
// Pulsar Eventide Ultra-Performance Inspector
// ============================================================

/**
 * Props del modal expandido de video — hub de conocimiento multimodal.
 * 
 * Muestra el video con reproductor, transcripción sincronizada,
 * análisis de IA (toggles mock), exportación UNIB, y búsqueda
 * semántica inline.
 */
interface ExpandedVideoModalProps {
    /** Datos del video a mostrar (de tipo VideoData del backend) */
    video: VideoData;
    /** Callback para cerrar el modal */
    onClose: () => void;
}

interface TranscriptChunk {
    chunk_index: number;
    chunk_text: string;
    start: number;
    end: number;
}

/**
 * ExpandedVideoModal — Modal de reproducción y análisis detallado.
 * 
 * Features:
 * - Reproductor de video con controles (play/pause, volumen, velocidad, fullscreen)
 * - Transcripción sincronizada con timestamps (click para saltar al segundo)
 * - Tabs: Transcripción, Inteligencia, Exportar, Semántica
 * - Exportación a formato UNIB (.unib)
 * - Importación de archivos UNIB existentes
 * - Búsqueda semántica inline sobre la transcripción
 */
export function ExpandedVideoModal({ video, onClose }: ExpandedVideoModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const semanticInputRef = useRef<HTMLInputElement>(null);
    const [mounted, setMounted] = useState(false);
    const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
    const [loadingTranscript, setLoadingTranscript] = useState(false);
    const [transcriptError, setTranscriptError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'transcript' | 'intel' | 'export' | 'semantic'>('transcript');
    const [filterQuery, setFilterQuery] = useState('');
    const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(true);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState('00:00.000');
    const [duration, setDuration] = useState('00:00.000');
    const [rawDuration, setRawDuration] = useState(0);
    const [rawCurrentTime, setRawCurrentTime] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);

    const { exportSemantic, importSemantic, downloadUnib, exporting, importing, error: semanticError, exportedContent } = useSemanticIO();

    // Engine Toggles State
    const [toggles, setToggles] = useState({
        translate: true,
        sentiment: true,
        highlights: true,
    });

    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (active) setMounted(true);
        });
        return () => {
            active = false;
        };
    }, []);

    // Load transcript from SQLite backend via Tauri invoke
    useEffect(() => {
        if (!video.id) return;
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            setLoadingTranscript(true);
            void (async () => {
                try {
                    let segments: Array<{ chunk_index: number; chunk_text: string; start: number; end: number }>;
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        segments = await invoke('get_transcript', { jobId: video.id });
                    } catch {
                        const { REST_API_BASE } = await import('@/lib/api-config');
                        const response = await fetch(`${REST_API_BASE}/jobs/${video.id}/transcript`);
                        if (!response.ok) throw new Error(`Transcript request failed with status ${response.status}`);
                        segments = await response.json() as Array<{ chunk_index: number; chunk_text: string; start: number; end: number }>;
                    }

                    const mapped: TranscriptChunk[] = segments.map((s) => ({
                        chunk_index: s.chunk_index,
                        chunk_text: s.chunk_text,
                        start: s.start,
                        end: s.end
                    }));
                    if (!cancelled) {
                        setTranscriptChunks(mapped);
                        setTranscriptError(null);
                    }
                } catch (error) {
                    console.error('Failed to load transcript:', error);
                    if (!cancelled) {
                        setTranscriptChunks([]);
                        setTranscriptError(error instanceof Error ? error.message : String(error));
                    }
                } finally {
                    if (!cancelled) setLoadingTranscript(false);
                }
            })();
        });

        return () => {
            cancelled = true;
        };
    }, [video.id]);

    useEffect(() => {
        const element = videoRef.current;
        if (!element || !video.videoSrc) {
            setIsPlaying(false);
            return;
        }
        element.muted = false;
        void element.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        return () => element.pause();
    }, [video.videoSrc]);

    const togglePlay = useCallback(() => {
        const element = videoRef.current;
        if (!element) return;
        if (!element.paused) {
            element.pause();
            setIsPlaying(false);
        } else {
            void element.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        }
    }, []);

    const openOriginal = useCallback(async () => {
        const url = video.originalUrl;
        if (!url) return;
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:') throw new Error('Unsupported URL protocol');
        } catch {
            toast.error('La URL original no es segura o está incompleta.');
            return;
        }
        try {
            const { open } = await import('@tauri-apps/plugin-shell');
            await open(url);
        } catch {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }, [video.originalUrl]);

    const toggleMute = useCallback(() => {
        const element = videoRef.current;
        if (!element) return;
        element.muted = !element.muted;
        setIsMuted(element.muted);
    }, []);

    // Keyboard Shortcuts (Space, Escape, M, Arrows)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === ' ' && document.activeElement?.tagName !== 'INPUT') {
                e.preventDefault();
                togglePlay();
            } else if (e.key === 'm' || e.key === 'M') {
                if (document.activeElement?.tagName !== 'INPUT') {
                    toggleMute();
                }
            } else if (e.key === 'ArrowLeft' && document.activeElement?.tagName !== 'INPUT') {
                if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
            } else if (e.key === 'ArrowRight' && document.activeElement?.tagName !== 'INPUT') {
                if (videoRef.current) videoRef.current.currentTime = Math.min(rawDuration, videoRef.current.currentTime + 5);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, rawDuration, toggleMute, togglePlay]);

    const formatPreciseTime = (seconds: number) => {
        if (isNaN(seconds) || seconds < 0) return '00:00.000';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const current = videoRef.current.currentTime;
        const dur = videoRef.current.duration || rawDuration;
        setRawCurrentTime(current);
        setCurrentTime(formatPreciseTime(current));
        setProgress(dur > 0 ? (current / dur) * 100 : 0);
    };

    const handleLoadedMetadata = () => {
        if (!videoRef.current) return;
        const dur = videoRef.current.duration;
        setRawDuration(dur);
        setDuration(formatPreciseTime(dur));
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!videoRef.current) return;
        const seekTime = (Number(e.target.value) / 100) * (videoRef.current.duration || rawDuration);
        videoRef.current.currentTime = seekTime;
        setProgress(Number(e.target.value));
    };

    const seekToSecond = (sec: number) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = sec;
        if (!isPlaying) {
            videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
    };

    const cyclePlaybackRate = () => {
        if (!videoRef.current) return;
        const rates = [1, 1.25, 1.5, 2];
        const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
        const newRate = rates[nextIdx];
        videoRef.current.playbackRate = newRate;
        setPlaybackRate(newRate);
        toast.info(`Velocidad: ${newRate}x`, { duration: 1500 });
    };

    // Full text calculation
    const fullTranscriptText = useMemo(() => {
        return transcriptChunks.map(c => c.chunk_text).join(' ');
    }, [transcriptChunks]);

    const visualAnalysis = useMemo(() => {
        if (!video.visualAnalysis) return null;
        try {
            return JSON.parse(video.visualAnalysis) as {
                analysis_mode?: string;
                frame_count?: number;
                successful_frame_count?: number;
                frames?: Array<{ timestamp?: number; status?: string; ocr_text?: string }>;
            };
        } catch {
            return null;
        }
    }, [video.visualAnalysis]);

    // Filtered chunks
    const filteredChunks = useMemo(() => {
        if (!filterQuery.trim()) return transcriptChunks;
        const q = filterQuery.toLowerCase();
        return transcriptChunks.filter(c => c.chunk_text.toLowerCase().includes(q));
    }, [transcriptChunks, filterQuery]);

    // Export JSON payload
    const exportPayload = useMemo(() => {
        return {
            source: "pulsar-eventide",
            version: "1.0",
            video_id: video.id,
            url: video.originalUrl || video.videoSrc || "",
            platform: "tiktok",
            metadata: {
                title: video.title || `Video #${video.id}`,
                author: video.author || "Desconocido",
                duration: video.duration,
                tags: video.tags || [],
                thumbnail: video.thumb
            },
            content: {
                summary: `Ficha estructurada del video '${video.title}'. Procesado por Pulsar Eventide.`,
                topics: video.tags?.length ? video.tags : ["Audiovisual", "TikTok", "Pulsar"],
                intent: "Ingesta y Análisis de Conocimiento",
                full_transcript: fullTranscriptText,
                segments: transcriptChunks.map(c => ({
                    start: c.start,
                    end: c.end,
                    text: c.chunk_text
                }))
            },
            embeddings_metadata: {
                model: "all-MiniLM-L6-v2",
                dimensions: 384,
                total_chunks: transcriptChunks.length
            },
            julia_ready: true
        };
    }, [video, fullTranscriptText, transcriptChunks]);

    const handleSemanticImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const content = await file.text();
            const imported = await importSemantic(content);
            if (imported) toast.success('UNIB importado: transcript y búsqueda semántica reindexados');
        } catch (error) {
            toast.error(`No se pudo leer el archivo .unib: ${String(error)}`);
        }
    };

    const verifyPersistedJob = async () => {
        try {
            let jobs: Array<{ id: number }>;
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                jobs = await invoke<Array<{ id: number }>>('get_jobs');
            } catch {
                const { REST_API_BASE } = await import('@/lib/api-config');
                const response = await fetch(`${REST_API_BASE}/jobs`);
                if (!response.ok) throw new Error(`Jobs request failed with status ${response.status}`);
                jobs = await response.json() as Array<{ id: number }>;
            }
            if (jobs.some((job) => job.id === video.id)) {
                toast.success('Ficha confirmada en SQLite', { description: `Job #${video.id} existe en la biblioteca local.` });
            } else {
                toast.error('La ficha no aparece en SQLite');
            }
        } catch (error) {
            toast.error(`No se pudo comprobar SQLite: ${String(error)}`);
        }
    };

    const copyToClipboard = async (text: string, format: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedFormat(format);
            toast.success(`Copiado al portapapeles (${format})`, {
                description: `${text.length} caracteres listos para usar.`
            });
            setTimeout(() => setCopiedFormat(null), 2500);
        } catch (e) {
            toast.error("Error al copiar al portapapeles");
        }
    };

    if (!mounted) return null;

    return createPortal(
        <motion.div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6 pointer-events-auto backdrop-blur-2xl bg-black/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <motion.div
                className="w-full max-w-[1240px] h-[88vh] min-h-[600px] max-h-[920px] rounded-3xl overflow-hidden flex flex-col md:flex-row shadow-[0_25px_80px_rgba(0,0,0,0.9)] border border-white/10 relative"
                style={{
                    background: 'linear-gradient(145deg, rgba(16,18,27,0.98) 0%, rgba(8,10,15,0.99) 100%)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 30px 90px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.15)'
                }}
                initial={{ scale: 0.95, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 20, opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            >
                {/* ── Left Column: Video Cinema Player ── */}
                <div className="w-full md:w-[48%] h-full flex flex-col bg-black/60 relative border-r border-white/10 p-5 shrink-0 overflow-hidden">
                    {/* Top Meta Header */}
                    <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#fe2c55] shadow-[0_0_8px_#fe2c55]" />
                            <span className="text-[11px] font-black tracking-widest text-[#fe2c55] uppercase">
                                PULSAR MULTIMODAL
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-white/50 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                                #{video.id}
                            </span>
                        </div>
                    </div>

                    {/* Video Player Shell */}
                    <div className="flex-1 rounded-2xl overflow-hidden relative bg-black flex items-center justify-center border border-white/10 shadow-2xl group">
                        {video.videoSrc ? (
                            <video
                                ref={videoRef}
                                src={video.videoSrc}
                                poster={video.thumb}
                                className="w-full h-full object-contain"
                                playsInline
                                loop
                                autoPlay
                                onTimeUpdate={handleTimeUpdate}
                                onLoadedMetadata={handleLoadedMetadata}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onClick={togglePlay}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                                <FaVideo size={32} className="text-white/25" />
                                <p className="text-xs text-white/60">El archivo local no está retenido.</p>
                                {video.originalUrl && (
                                    <button
                                        type="button"
                                        onClick={() => void openOriginal()}
                                        className="px-3 py-2 rounded-xl bg-[#25f4ee]/10 border border-[#25f4ee]/30 text-[#25f4ee] text-xs font-bold hover:bg-[#25f4ee]/20 transition-colors"
                                    >
                                        Ver fuente original
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Central Play/Pause Watermark indicator */}
                        {video.videoSrc && <>
                            {!isPlaying && (
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.5, opacity: 0 }}
                                    className="absolute w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white cursor-pointer shadow-2xl hover:scale-110 transition-transform"
                                    onClick={togglePlay}
                                >
                                    <FaPlay size={20} className="ml-1 text-[#25f4ee]" />
                                </motion.div>
                            )}
                        </>}

                        {/* Bottom Overlay Controls */}
                        {video.videoSrc && <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col gap-2.5 opacity-90 group-hover:opacity-100 transition-opacity">
                            {/* Seekbar */}
                            <div className="flex items-center gap-3">
                                <span className="text-[#25f4ee] font-mono text-[11px] font-bold shrink-0">{currentTime}</span>
                                                                    <input
                                        type="range"
                                        aria-label="Posición del video"
                                        min="0"

                                    max="100"
                                    value={progress}
                                    onChange={handleSeek}
                                    className="flex-1 accent-[#25f4ee] h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer hover:h-2 transition-all"
                                />
                                <span className="text-white/60 font-mono text-[11px] shrink-0">{duration}</span>
                            </div>

                            {/* Control Bar */}
                            <div className="flex items-center justify-between pt-1">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        aria-label={isPlaying ? 'Pausar video' : 'Reproducir video'}
                                        onClick={togglePlay}
                                        className="w-8 h-8 rounded-lg bg-white/10 hover:bg-[#fe2c55]/20 hover:text-[#fe2c55] border border-white/10 flex items-center justify-center text-white transition-all"
                                    >
                                        {isPlaying ? <FaPause size={12} /> : <FaPlay size={12} className="ml-0.5" />}
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={isMuted ? 'Activar sonido' : 'Silenciar video'}
                                        onClick={toggleMute}
                                        className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white transition-all"
                                    >
                                        {isMuted ? <FaVolumeXmark size={12} className="text-red-400" /> : <FaVolumeHigh size={12} />}
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Cambiar velocidad de reproducción"
                                        onClick={cyclePlaybackRate}
                                        className="px-2.5 h-8 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white text-[11px] font-mono font-bold transition-all"
                                    >
                                        {playbackRate}x
                                    </button>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        aria-label="Reiniciar video"
                                        onClick={() => seekToSecond(0)}
                                        className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white transition-all"
                                        title="Reiniciar Video"
                                    >
                                        <FaRotateLeft size={11} />
                                    </button>
                                </div>
                            </div>
                        </div>}
                    </div>

                    {/* Video Info Summary Footer */}
                    <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-1.5 shrink-0">
                        <h3 className="text-white font-bold text-sm truncate" title={video.title}>
                            {video.title || `TikTok Video #${video.id}`}
                        </h3>
                        <div className="flex items-center justify-between text-xs text-white/50">
                            <span className="truncate">Por <strong className="text-white/80">@{video.author || "desconocido"}</strong></span>
                            <span className="shrink-0 text-[11px] bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono">
                                Duración: {video.duration}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Right Column: AAA Inspector, Transcript & Export ── */}
                <div className="w-full md:w-[52%] h-full flex flex-col p-5 bg-[#0b0d14]/90 overflow-hidden relative">
                    {/* Header Action Row */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
                        {/* Tab Switcher */}
                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 gap-1">
                            <button
                                type="button"
                                aria-pressed={activeTab === 'transcript'}
                                onClick={() => setActiveTab('transcript')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                                    activeTab === 'transcript'
                                        ? 'bg-[#25f4ee]/20 text-[#25f4ee] border border-[#25f4ee]/30 shadow-[0_0_12px_rgba(37,244,238,0.2)]'
                                        : 'text-white/50 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <FaFileLines size={11} />
                                Transcripción
                            </button>
                            <button
                                type="button"
                                aria-pressed={activeTab === 'intel'}
                                onClick={() => setActiveTab('intel')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                                    activeTab === 'intel'
                                        ? 'bg-[#fe2c55]/20 text-[#fe2c55] border border-[#fe2c55]/30 shadow-[0_0_12px_rgba(254,44,85,0.2)]'
                                        : 'text-white/50 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <FaBrain size={11} />
                                Ficha IA
                            </button>
                            <button
                                type="button"
                                aria-pressed={activeTab === 'export'}
                                onClick={() => setActiveTab('export')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                                    activeTab === 'export'
                                        ? 'bg-[#8a5cff]/20 text-[#8a5cff] border border-[#8a5cff]/30 shadow-[0_0_12px_rgba(138,92,255,0.2)]'
                                        : 'text-white/50 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <FaCode size={11} />
                                Exportar JSON
                            </button>
                            <button
                                type="button"
                                aria-pressed={activeTab === 'semantic'}
                                onClick={() => setActiveTab('semantic')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                                    activeTab === 'semantic'
                                        ? 'bg-[#25f4ee]/20 text-[#25f4ee] border border-[#25f4ee]/30 shadow-[0_0_12px_rgba(37,244,238,0.2)]'
                                        : 'text-white/50 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <FaShareNodes size={11} />
                                Semantic
                            </button>
                        </div>

                        {/* Close Modal Button */}
                        <button
                            type="button"
                            aria-label="Cerrar reproductor"
                            onClick={onClose}
                            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-[#fe2c55]/20 hover:text-[#fe2c55] border border-white/10 flex items-center justify-center text-white/70 hover:scale-105 transition-all"
                            title="Cerrar (Esc)"
                        >
                            <FaXmark size={14} />
                        </button>
                    </div>

                    {/* Tab 1: Synchronized Transcript */}
                    {activeTab === 'transcript' && (
                        <div className="flex-1 flex flex-col min-h-0 pt-4 overflow-hidden">
                            {/* Search & Copy Bar */}
                            <div className="flex items-center gap-2.5 mb-3 shrink-0">
                                <div className="flex-1 relative">
                                    <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs" />
                                    <input
                                        type="text"
                                        placeholder="Filtrar palabras en la transcripción..."
                                        value={filterQuery}
                                        onChange={(e) => setFilterQuery(e.target.value)}
                                        className="w-full pl-8 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#25f4ee]/50"
                                    />
                                    {filterQuery && (
                                        <button
                                            type="button"
                                            aria-label="Limpiar filtro de transcripción"
                                            onClick={() => setFilterQuery('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs"
                                        >
                                            <FaXmark size={10} />
                                        </button>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    aria-label="Copiar transcripción completa"
                                    onClick={() => copyToClipboard(fullTranscriptText, 'Texto')}
                                    className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shrink-0 transition-all active:scale-95"
                                    title="Copiar transcripción completa"
                                >
                                    {copiedFormat === 'Texto' ? <FaCheck className="text-emerald-400" size={12} /> : <FaCopy size={12} />}
                                    Copiar
                                </button>
                            </div>

                            {transcriptError && (
                                <div role="alert" className="mb-3 rounded-xl border border-[#fe2c55]/30 bg-[#fe2c55]/10 px-3 py-2 text-[10px] leading-relaxed text-[#fe2c55]">
                                    No se pudo cargar la transcripción: {transcriptError}
                                </div>
                            )}

                            {/* Transcript Chunks List */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2 rounded-2xl bg-black/30 border border-white/5 p-3">
                                {loadingTranscript ? (
                                    <div className="flex items-center justify-center h-full text-white/40 text-xs gap-2">
                                        <span className="w-4 h-4 rounded-full border-2 border-[#25f4ee] border-t-transparent animate-spin" />
                                        Cargando transcripción y marcas temporales...
                                    </div>
                                ) : filteredChunks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-white/40 text-xs gap-2">
                                        <FaFileLines size={24} className="text-white/20" />
                                        {filterQuery.trim()
                                            ? <span>No se encontraron fragmentos para &quot;{filterQuery}&quot;.</span>
                                            : transcriptChunks.length === 0
                                                ? <span>Este video no tiene transcripción disponible. Puede que no contenga audio con diálogo.</span>
                                                : <span>No hay fragmentos que coincidan con la búsqueda.</span>
                                        }
                                    </div>
                                ) : (
                                    filteredChunks.map((chunk) => {
                                        const isChunkActive = rawCurrentTime >= chunk.start && rawCurrentTime <= chunk.end;
                                        return (
                                            <motion.button
                                                type="button"
                                                key={chunk.chunk_index}
                                                onClick={() => seekToSecond(chunk.start)}
                                                aria-label={`Ir al segmento ${chunk.chunk_index + 1}, desde ${formatPreciseTime(chunk.start)}`}
                                                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                                                    isChunkActive
                                                        ? 'bg-[#25f4ee]/15 border-[#25f4ee]/40 shadow-[0_0_15px_rgba(37,244,238,0.15)]'
                                                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                                                }`}
                                                whileHover={{ scale: 1.01 }}
                                                whileTap={{ scale: 0.99 }}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[10px] font-mono font-black ${isChunkActive ? 'text-[#25f4ee]' : 'text-white/40'}`}>
                                                        {formatPreciseTime(chunk.start)} → {formatPreciseTime(chunk.end)}
                                                    </span>
                                                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/30">
                                                        Chunk #{chunk.chunk_index + 1}
                                                    </span>
                                                </div>
                                                <p className={`text-xs leading-relaxed ${isChunkActive ? 'text-white font-medium' : 'text-white/70'}`}>
                                                    {chunk.chunk_text}
                                                </p>
                                            </motion.button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tab 2: AI Intelligence & Multimodal Summary */}
                    {activeTab === 'intel' && (
                        <div className="flex-1 flex flex-col min-h-0 pt-4 overflow-y-auto custom-scrollbar gap-4 pr-1">
                            {/* Instructivo audiovisual persistido */}
                            <div className="p-4 rounded-2xl bg-black/40 border border-[#8a5cff]/30 flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-bold text-[#8a5cff] uppercase tracking-widest">Instructivo audiovisual</span>
                                    <span className="text-[9px] text-white/40 uppercase">Fuente local</span>
                                </div>
                                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-white/75 font-sans max-h-48 overflow-y-auto custom-scrollbar">
                                    {video.instructionalGuide || 'Este job aún no tiene un instructivo persistido. Ejecuta el procesamiento audiovisual para generarlo.'}
                                </pre>
                            </div>

                            {visualAnalysis && (
                                <div className="p-4 rounded-2xl bg-black/40 border border-[#25f4ee]/20 flex flex-col gap-2">
                                    <span className="text-[10px] font-bold text-[#25f4ee] uppercase tracking-widest">Evidencia visual</span>
                                    <div className="grid grid-cols-2 gap-2 text-[10px] text-white/60">
                                        <span>Modo: <strong className="text-white/85">{visualAnalysis.analysis_mode || 'local'}</strong></span>
                                        <span>Keyframes: <strong className="text-white/85">{visualAnalysis.successful_frame_count ?? 0}/{visualAnalysis.frame_count ?? 0}</strong></span>
                                    </div>
                                    {visualAnalysis.frames?.some((frame) => frame.ocr_text) && (
                                        <p className="text-[10px] text-white/55">OCR: {visualAnalysis.frames.filter((frame) => frame.ocr_text).map((frame) => frame.ocr_text).join(' | ')}</p>
                                    )}
                                </div>
                            )}

                            {/* Multimodal Badges */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-white/40 uppercase">Vector Dimension</span>
                                    <span className="text-lg font-black text-[#25f4ee]">384-D</span>
                                    <span className="text-[9px] text-white/40">all-MiniLM-L6-v2</span>
                                </div>
                                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-white/40 uppercase">Chunks Indexados</span>
                                    <span className="text-lg font-black text-[#fe2c55]">{transcriptChunks.length}</span>
                                    <span className="text-[9px] text-white/40">150 chars / 50 overlap</span>
                                </div>
                                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-white/40 uppercase">Exportar UNIB</span>
                                    <span className="text-lg font-black text-emerald-400">READY</span>
                                    <span className="text-[9px] text-white/40">Protocol v1.0</span>
                                </div>
                            </div>

                            {/* Extracted Topics */}
                            <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-col gap-2">
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Temas Detectados</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {video.tags?.length ? (
                                        video.tags.map((t, idx) => (
                                            <span key={idx} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-white/80">
                                                #{t}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-white/40">Sin etiquetas persistidas para este job.</span>
                                    )}
                                </div>
                            </div>

                            {/* Processing Toggles */}
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Capas de Inteligencia</span>
                                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#25f4ee]/20 text-[#25f4ee] flex items-center justify-center">
                                            <FaLanguage size={14} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-white">Transcripción Fonética</span>
                                            <span className="text-[10px] text-white/40">Faster-Whisper con segmentación temporal</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-[#25f4ee]/10 text-[#25f4ee]">ACTIVO</span>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#8a5cff]/20 text-[#8a5cff] flex items-center justify-center">
                                            <FaBrain size={14} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-white">Embeddings Densos Sharded</span>
                                            <span className="text-[10px] text-white/40">4 shards HNSW con similitud Coseno</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-[#8a5cff]/10 text-[#8a5cff]">INDEXADO</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab 3: Export JSON */}
                    {activeTab === 'export' && (
                        <div className="flex-1 flex flex-col min-h-0 pt-4 overflow-hidden">
                            <div className="flex items-center justify-between mb-3 shrink-0">
                                <span className="text-[11px] font-bold text-white/60">
                                    Payload estructurado listo para exportar:
                                </span>
                                <button
                                    type="button"
                                    aria-label="Copiar JSON de exportación"
                                    onClick={() => copyToClipboard(JSON.stringify(exportPayload, null, 2), 'JSON')}
                                    className="px-3 py-1.5 bg-[#8a5cff]/20 hover:bg-[#8a5cff]/30 border border-[#8a5cff]/40 text-[#8a5cff] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                                >
                                    {copiedFormat === 'JSON' ? <FaCheck size={12} /> : <FaCopy size={12} />}
                                    Copiar JSON
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/60 border border-white/10 rounded-2xl p-4 font-mono text-[11px] text-[#25f4ee] leading-relaxed select-all">
                                <pre>{JSON.stringify(exportPayload, null, 2)}</pre>
                            </div>
                        </div>
                    )}
                    {activeTab === 'semantic' && (
                        <div className="flex-1 flex flex-col min-h-0 pt-4 overflow-hidden">
                            <div className="flex items-center gap-2 mb-3 shrink-0">
                                <button
                                    type="button"
                                    aria-label="Exportar índice semántico UNIB"
                                    onClick={async () => {
                                        if (!video.id) return;
                                        await exportSemantic(video.id);
                                    }}
                                    disabled={exporting}
                                    className="px-3 py-2 rounded-lg bg-[#25f4ee]/10 hover:bg-[#25f4ee]/20 border border-[#25f4ee]/30 text-[#25f4ee] text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    {exporting ? 'Exportando...' : 'Exportar .unib'}
                                </button>
                                <input
                                    ref={semanticInputRef}
                                    type="file"
                                    accept=".unib,.txt"
                                    onChange={handleSemanticImport}
                                    className="hidden"
                                    aria-label="Seleccionar archivo UNIB"
                                />
                                <button
                                    type="button"
                                    aria-label="Importar índice semántico UNIB"
                                    onClick={() => semanticInputRef.current?.click()}
                                    disabled={importing}
                                    className="px-3 py-2 rounded-lg bg-[#8a5cff]/10 hover:bg-[#8a5cff]/20 border border-[#8a5cff]/30 text-[#8a5cff] text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    {importing ? 'Importando...' : 'Importar .unib'}
                                </button>
                                {exportedContent && (
                                    <button
                                        type="button"
                                        aria-label="Descargar índice semántico UNIB"
                                        onClick={downloadUnib}
                                        className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs font-bold transition-all"
                                    >
                                        Descargar .unib
                                    </button>
                                )}
                                {semanticError && (
                                    <span role="alert" className="text-xs text-red-400">{semanticError}</span>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/20 rounded-xl border border-white/5 p-3">
                                <pre className="text-[11px] text-white/70 font-mono whitespace-pre-wrap">
                                    {exportedContent || '// Presiona "Exportar .unib" para generar el índice semántico de este video.\n// El archivo .unib es un índice portable de referencias, no contiene el video.'}
                                </pre>
                            </div>
                        </div>
                    )}

                    {/* Bottom Quick Actions Hub */}
                    <div className="pt-4 mt-auto border-t border-white/10 grid grid-cols-4 gap-2 shrink-0">
                        <button
                            type="button"
                            aria-label="Copiar transcripción como texto plano"
                            onClick={() => copyToClipboard(fullTranscriptText, 'Texto Plano')}
                            className="flex flex-col items-center justify-center py-2.5 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all group"
                        >
                            <FaFileLines size={13} className="text-white/70 group-hover:scale-110 transition-transform mb-1" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Copiar TXT</span>
                        </button>
                        <button
                            type="button"
                            aria-label="Copiar transcripción como Markdown"
                            onClick={() => {
                                const md = `# ${video.title || 'Video'}\n**Autor:** @${video.author}\n**Duración:** ${video.duration}\n\n## Transcripción\n${fullTranscriptText}`;
                                copyToClipboard(md, 'Markdown');
                            }}
                            className="flex flex-col items-center justify-center py-2.5 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all group"
                        >
                            <FaCode size={13} className="text-[#25f4ee] group-hover:scale-110 transition-transform mb-1" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Markdown</span>
                        </button>
                        <button
                            type="button"
                            aria-label="Copiar payload de exportación"
                            onClick={() => copyToClipboard(JSON.stringify(exportPayload, null, 2), 'Exportar')}
                            className="flex flex-col items-center justify-center py-2.5 px-2 rounded-xl bg-[#8a5cff]/10 hover:bg-[#8a5cff]/20 border border-[#8a5cff]/30 text-[#8a5cff] transition-all group"
                        >
                            <FaShareNodes size={13} className="group-hover:scale-110 transition-transform mb-1" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Exportar</span>
                        </button>
                        <button
                            type="button"
                            aria-label="Verificar índice y persistencia SQLite"
                            onClick={() => { void verifyPersistedJob(); }}
                            className="flex flex-col items-center justify-center py-2.5 px-2 rounded-xl bg-[#fe2c55]/10 hover:bg-[#fe2c55]/20 border border-[#fe2c55]/30 text-[#fe2c55] transition-all group"
                        >
                            <FaCheckDouble size={13} className="group-hover:scale-110 transition-transform mb-1" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Verificar índice</span>
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
}
