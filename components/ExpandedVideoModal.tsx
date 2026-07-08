'use client';
import { motion } from 'motion/react';
import type { VideoData } from '@/types';
import {
    FaXmark, FaVideo, FaMusic, FaFileLines, FaDownload,
    FaPlay, FaPause, FaLanguage, FaBrain, FaWandMagicSparkles,
    FaBolt, FaCheckDouble, FaClock
} from 'react-icons/fa6';
import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// ============================================================
// ExpandedVideoModal — Content Controller Pro (Compact Design)
// ============================================================

interface ExpandedVideoModalProps {
    video: VideoData;
    onClose: () => void;
}

const mockTranscript = [
    { time: '00:00 - 00:05', text: 'Bienvenidos a este nuevo tutorial de IA que revolucionará tu flujo de trabajo.' },
    { time: '00:05 - 00:09', text: 'Hoy nos enfocaremos en herramientas de automatización y generación de contenido masivo.' },
    { time: '00:09 - 00:15', text: 'Presta mucha atención a cómo se integran estos modelos complejos en el dashboard.' }
];

export function ExpandedVideoModal({ video, onClose }: ExpandedVideoModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [mounted, setMounted] = useState(false);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(true);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState('00:00.000');
    const [duration, setDuration] = useState('00:00.000');

    // Engine Toggles State
    const [toggles, setToggles] = useState({
        translate: true,
        sentiment: false,
        highlights: true,
    });

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted && videoRef.current) {
            videoRef.current.play().then(() => setIsPlaying(true)).catch((e) => {
                console.error('Autoplay prevented:', e);
                setIsPlaying(false);
            });
        }
    }, [video, mounted]);

    if (!mounted) return null;

    const formatPreciseTime = (seconds: number) => {
        if (isNaN(seconds)) return '00:00.000';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const current = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        setCurrentTime(formatPreciseTime(current));
        setProgress(dur > 0 ? (current / dur) * 100 : 0);
    };

    const handleLoadedMetadata = () => {
        if (!videoRef.current) return;
        setDuration(formatPreciseTime(videoRef.current.duration));
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play();
            setIsPlaying(true);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!videoRef.current) return;
        const seekTime = (Number(e.target.value) / 100) * videoRef.current.duration;
        videoRef.current.currentTime = seekTime;
        setProgress(Number(e.target.value));
    };

    return createPortal(
        <motion.div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-6 pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
        >
            <motion.div
                className="absolute inset-0 bg-black/70 backdrop-blur-2xl"
                onClick={onClose}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
            />

            <div className="relative w-full max-w-7xl h-[85vh] max-h-[900px] flex items-center justify-center gap-6 z-10">

                {/* Left Panel: Expanded Video Player using layoutId */}
                <motion.div
                    layoutId={`video-card-${video.id}`}
                    className="h-full aspect-[9/16] shrink-0 relative rounded-2xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.8)] border-[2px] border-white/10 bg-black"
                >
                    <video
                        ref={videoRef}
                        src={video.videoSrc}
                        className="absolute inset-0 w-full h-full object-cover bg-black z-[1]"
                        autoPlay
                        loop
                        playsInline
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                    />
                </motion.div>

                {/* Right Panel: Content Controller Pro Console (Compact) */}
                <motion.div
                    className="w-[500px] xl:w-[600px] shrink-0 h-full flex flex-col justify-start p-5 rounded-2xl border-[1px] border-white/10 relative overflow-hidden"
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 30 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
                    style={{
                        background: 'linear-gradient(145deg, rgba(20, 20, 20, 0.95), rgba(10, 10, 10, 0.98))',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.05)'
                    }}
                >
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-50 w-8 h-8 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-[#fe2c55] hover:border-[#fe2c55] transition-all duration-300 hover:scale-110 shadow-lg"
                    >
                        <FaXmark size={14} />
                    </button>

                    {/* Contenedor Flex para estirar y contraer dinámicamente sus hijos */}
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-3.5 h-full">

                        {/* 1. Header (Minimalist Metadata) */}
                        <div className="flex flex-col gap-0.5 pr-10 shrink-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="px-1.5 py-0.5 rounded-sm bg-[#fe2c55]/20 text-[#fe2c55] text-[9px] font-bold uppercase tracking-wider border border-[#fe2c55]/30">
                                    Auditoría Activa
                                </span>
                                <span className="text-white/40 text-[10px] font-mono">{video.author}</span>
                            </div>
                            <h2 className="text-white font-extrabold text-xl leading-snug line-clamp-2">
                                {video.title}
                            </h2>
                        </div>

                        {/* 2. Live Metrics Dashboard */}
                        <div className="grid grid-cols-3 gap-2 shrink-0">
                            <div className="flex flex-col p-2.5 rounded-lg bg-white/5 border border-white/5 backdrop-blur-sm">
                                <span className="text-white/50 text-[9px] uppercase font-bold tracking-widest mb-0.5 flex items-center gap-1.5"><FaLanguage className="text-[#25f4ee]" size={10} /> Idioma</span>
                                <span className="text-white font-mono text-sm font-bold">Inglés (US)</span>
                            </div>
                            <div className="flex flex-col p-2.5 rounded-lg bg-white/5 border border-white/5 backdrop-blur-sm">
                                <span className="text-white/50 text-[9px] uppercase font-bold tracking-widest mb-0.5 flex items-center gap-1.5"><FaCheckDouble className="text-[#00ffd1]" size={10} /> Precisión</span>
                                <span className="text-white font-mono text-sm font-bold">98.5%</span>
                            </div>
                            <div className="flex flex-col p-2.5 rounded-lg bg-white/5 border border-white/5 backdrop-blur-sm">
                                <span className="text-white/50 text-[9px] uppercase font-bold tracking-widest mb-0.5 flex items-center gap-1.5"><FaBolt className="text-[#fe2c55]" size={10} /> BPM</span>
                                <span className="text-white font-mono text-sm font-bold">142 PPM</span>
                            </div>
                        </div>

                        {/* 3. Advanced Playback Engine */}
                        <div className="bg-black/40 p-3 rounded-xl border border-white/10 flex items-center gap-3 shadow-inner shrink-0">
                            <button
                                onClick={togglePlay}
                                className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-tr from-[#fe2c55] to-[#ff3b64] shadow-[0_0_15px_rgba(254,44,85,0.4)] flex items-center justify-center text-white hover:scale-105 transition-transform"
                            >
                                {isPlaying ? <FaPause size={14} /> : <FaPlay size={14} className="ml-1" />}
                            </button>

                            <span className="text-[#25f4ee] font-mono text-xs shrink-0 font-bold bg-[#25f4ee]/10 px-1.5 py-0.5 rounded-md">{currentTime}</span>

                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={progress}
                                onChange={handleSeek}
                                className="flex-1 accent-[#25f4ee] h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer hover:accent-white transition-all"
                            />

                            <span className="text-white/50 font-mono text-xs shrink-0 px-1.5">{duration}</span>
                        </div>

                        {/* 4. AI Engine Toggles */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                            <h4 className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-0.5 ml-1">Motores de Procesamiento</h4>

                            <div className="flex items-center justify-between p-2.5 rounded-lg bg-gradient-to-r from-white/5 to-transparent border border-white/5 hover:border-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center ${toggles.translate ? 'bg-[#25f4ee]/20 text-[#25f4ee]' : 'bg-white/5 text-white/50'}`}>
                                        <FaLanguage size={12} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-white text-xs font-bold leading-none">Traducción Automática (ES)</span>
                                        <span className="text-white/40 text-[9px] mt-0.5">Subtítulos en tiempo real</span>
                                    </div>
                                </div>
                                <div
                                    className={`w-9 h-5 shrink-0 rounded-full p-0.5 cursor-pointer transition-colors ${toggles.translate ? 'bg-[#25f4ee]' : 'bg-white/20'}`}
                                    onClick={() => setToggles(p => ({ ...p, translate: !p.translate }))}
                                >
                                    <motion.div
                                        className="w-4 h-4 rounded-full bg-white shadow-sm"
                                        animate={{ x: toggles.translate ? 16 : 0 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-lg bg-gradient-to-r from-white/5 to-transparent border border-white/5 hover:border-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center ${toggles.sentiment ? 'bg-[#8a5cff]/20 text-[#8a5cff]' : 'bg-white/5 text-white/50'}`}>
                                        <FaBrain size={12} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-white text-xs font-bold leading-none">Análisis de Sentimiento</span>
                                        <span className="text-white/40 text-[9px] mt-0.5">Tono y emociones del speaker</span>
                                    </div>
                                </div>
                                <div
                                    className={`w-9 h-5 shrink-0 rounded-full p-0.5 cursor-pointer transition-colors ${toggles.sentiment ? 'bg-[#8a5cff]' : 'bg-white/20'}`}
                                    onClick={() => setToggles(p => ({ ...p, sentiment: !p.sentiment }))}
                                >
                                    <motion.div
                                        className="w-4 h-4 rounded-full bg-white shadow-sm"
                                        animate={{ x: toggles.sentiment ? 16 : 0 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-lg bg-gradient-to-r from-white/5 to-transparent border border-white/5 hover:border-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center ${toggles.highlights ? 'bg-[#fe2c55]/20 text-[#fe2c55]' : 'bg-white/5 text-white/50'}`}>
                                        <FaWandMagicSparkles size={12} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-white text-xs font-bold leading-none">Auto-Highlights (Viral)</span>
                                        <span className="text-white/40 text-[9px] mt-0.5">Extracción de momentos clave</span>
                                    </div>
                                </div>
                                <div
                                    className={`w-9 h-5 shrink-0 rounded-full p-0.5 cursor-pointer transition-colors ${toggles.highlights ? 'bg-[#fe2c55]' : 'bg-white/20'}`}
                                    onClick={() => setToggles(p => ({ ...p, highlights: !p.highlights }))}
                                >
                                    <motion.div
                                        className="w-4 h-4 rounded-full bg-white shadow-sm"
                                        animate={{ x: toggles.highlights ? 16 : 0 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 5. Translation & Subtitle Timeline - Flexible Box */}
                        <div className="flex flex-col gap-1.5 flex-1 min-h-[100px]">
                            <h4 className="text-white/60 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                <FaClock size={10} /> Auditoría de Transcripción
                            </h4>
                            <div className="bg-black/50 border border-white/5 rounded-xl p-3 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 shadow-inner">
                                {mockTranscript.map((segment, idx) => (
                                    <div key={idx} className="flex gap-3 p-1.5 rounded-md hover:bg-white/5 transition-colors cursor-pointer group">
                                        <span className="text-[#25f4ee] font-mono text-[9px] font-bold mt-0.5 whitespace-nowrap opacity-80 group-hover:opacity-100">
                                            {segment.time}
                                        </span>
                                        <p className="text-white/80 text-[11px] leading-snug group-hover:text-white">
                                            {segment.text}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 6. Compact Action Hub (Downloads) */}
                        <div className="grid grid-cols-3 gap-2 mt-auto pt-3 border-t border-white/5 shrink-0">
                            <button className="flex justify-center items-center gap-2 py-2.5 rounded-lg bg-[#fe2c55]/10 border border-[#fe2c55]/30 hover:bg-[#fe2c55]/20 transition-all group">
                                <FaVideo className="text-[#fe2c55] group-hover:scale-110 transition-transform" size={14} />
                                <div className="flex flex-col items-start leading-none">
                                    <span className="text-white font-bold text-[10px] uppercase tracking-wide">Video</span>
                                    <span className="text-white/50 text-[8px] mt-0.5">MP4</span>
                                </div>
                            </button>
                            <button className="flex justify-center items-center gap-2 py-2.5 rounded-lg bg-[#25f4ee]/10 border border-[#25f4ee]/30 hover:bg-[#25f4ee]/20 transition-all group">
                                <FaMusic className="text-[#25f4ee] group-hover:scale-110 transition-transform" size={14} />
                                <div className="flex flex-col items-start leading-none">
                                    <span className="text-white font-bold text-[10px] uppercase tracking-wide">Audio</span>
                                    <span className="text-white/50 text-[8px] mt-0.5">MP3</span>
                                </div>
                            </button>
                            <button className="flex justify-center items-center gap-2 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
                                <FaFileLines className="text-white/80 group-hover:scale-110 transition-transform group-hover:text-white" size={14} />
                                <div className="flex flex-col items-start leading-none">
                                    <span className="text-white font-bold text-[10px] uppercase tracking-wide">Texto</span>
                                    <span className="text-white/50 text-[8px] mt-0.5">TXT</span>
                                </div>
                            </button>
                        </div>

                    </div>
                </motion.div>

            </div>
        </motion.div>,
        document.body
    );
}
