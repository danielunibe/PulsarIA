'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    FaBookOpen,
    FaBrain,
    FaClock,
    FaArrowRotateLeft,
    FaPlus,
    FaXmark,
    FaCheck,
    FaFilm,
    FaFileLines,
    FaCamera,
    FaWandMagicSparkles,
    FaChevronRight,
    FaFolder
} from '@/components/icon-library';

export interface MagazineVolume {
    id: string;
    volumeNumber: string;
    title: string;
    subtitle: string;
    category: 'recipes' | 'tech' | 'guides' | 'lifestyle';
    color: string;
    accentGlow: string;
    spineGradient: string;
    coverGradient: string;
    articleCount: number;
    videoCount: number;
    lastUpdated: string;
    syncStatus: 'live' | 'compiling' | 'idle';
    syncMessage?: string;
    description: string;
    tags: string[];
}

const DEMO_VOLUMES: MagazineVolume[] = [
    {
        id: 'vol-recipes',
        volumeNumber: 'TOMO I',
        title: 'Recetario & Cocina de Autor',
        subtitle: 'Ingredientes medidos, pasos cronometrados y capturas de emplatado',
        category: 'recipes',
        color: '#ff9a3c',
        accentGlow: 'rgba(255, 154, 60, 0.35)',
        spineGradient: 'linear-gradient(180deg, #d35400 0%, #78281f 100%)',
        coverGradient: 'linear-gradient(145deg, #1e130c 0%, #120b07 100%)',
        articleCount: 14,
        videoCount: 19,
        lastUpdated: 'Hace 3 min',
        syncStatus: 'compiling',
        syncMessage: 'Gemini 3.8 Flash extrayendo ingredientes de @chef.lucas...',
        description: 'Compendio gastronómico automático. Cada video de cocina es analizado por Gemini 3.8 Flash para tabular ingredientes, tiempos de cocción y seleccionar los fotogramas clave de cada paso.',
        tags: ['Gastronomía', 'Repostería', 'Paso a Paso', 'OCR de Textos']
    },
    {
        id: 'vol-tech',
        volumeNumber: 'TOMO II',
        title: 'Code Craft & Dev Architecture',
        subtitle: 'Snippets de código, diagramas y notas de ingeniería extraídas',
        category: 'tech',
        color: '#38bdf8',
        accentGlow: 'rgba(56, 189, 248, 0.35)',
        spineGradient: 'linear-gradient(180deg, #0284c7 0%, #082f49 100%)',
        coverGradient: 'linear-gradient(145deg, #091524 0%, #050b14 100%)',
        articleCount: 9,
        videoCount: 12,
        lastUpdated: 'Hace 22 min',
        syncStatus: 'live',
        description: 'Manual de referencia técnica. Transforma tutoriales rápidos en documentación limpia con bloques de código, comandos terminales y arquitectura de software.',
        tags: ['Rust', 'Next.js', 'IA Local', 'DevOps']
    },
    {
        id: 'vol-guides',
        volumeNumber: 'TOMO III',
        title: 'Guías Visuales & Hacks DIY',
        subtitle: 'Manuales paso a paso con timestamps y fotogramas destacados',
        category: 'guides',
        color: '#34d399',
        accentGlow: 'rgba(52, 211, 153, 0.35)',
        spineGradient: 'linear-gradient(180deg, #059669 0%, #064e3b 100%)',
        coverGradient: 'linear-gradient(145deg, #091f16 0%, #05100c 100%)',
        articleCount: 11,
        videoCount: 15,
        lastUpdated: 'Hoy 14:20',
        syncStatus: 'idle',
        description: 'Guías prácticas de reparación, carpintería y trucos cotidianos organizados en fichas de ejecución inmediata con fotos de herramientas y materiales.',
        tags: ['Tutoriales', 'Lifehacks', 'Herramientas', 'Fotogramas Clave']
    },
    {
        id: 'vol-lifestyle',
        volumeNumber: 'TOMO IV',
        title: 'Biohacking & Fitness Protocols',
        subtitle: 'Rutinas segmentadas por series, descansos y postura correcta',
        category: 'lifestyle',
        color: '#a855f7',
        accentGlow: 'rgba(168, 85, 247, 0.35)',
        spineGradient: 'linear-gradient(180deg, #7e22ce 0%, #3b0764 100%)',
        coverGradient: 'linear-gradient(145deg, #190c24 0%, #0d0614 100%)',
        articleCount: 7,
        videoCount: 10,
        lastUpdated: 'Ayer',
        syncStatus: 'live',
        description: 'Protocolos de entrenamiento y salud. Segmenta repeticiones, identifica posturas mediante visión computacional y sincroniza con notas de cronometraje.',
        tags: ['Entrenamiento', 'Movilidad', 'Nutrición', 'Cronometrado']
    }
];

export function MagazinesBookshelf() {
    const [volumes] = useState<MagazineVolume[]>(DEMO_VOLUMES);
    const [selectedVolume, setSelectedVolume] = useState<MagazineVolume | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => setIsRefreshing(false), 1200);
    };

    return (
        <div className="w-full h-full flex flex-col overflow-y-auto custom-scrollbar p-6 lg:p-8 font-sans select-none relative">
            {/* Ambient Background Lighting */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/[0.08] relative z-10 shrink-0">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2.5">
                        <span className="p-2 rounded-xl bg-white/[0.06] border border-white/10 text-white/80">
                            <FaBookOpen size={18} />
                        </span>
                        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-3">
                            Revistas &amp; Tomos Inteligentes
                            <span className="text-[10px] font-mono tracking-wider font-semibold uppercase px-2.5 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-300">
                                Gemini 3.8 Flash
                            </span>
                        </h1>
                    </div>
                    <p className="text-xs text-white/50 max-w-2xl leading-relaxed">
                        Librero editorial dinámico. Transforma automáticamente videos indexados en volúmenes temáticos: recetas con ingredientes tabulados, guías técnicas cronometradas y galerías de fotogramas clave.
                    </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white text-xs font-medium flex items-center gap-2 transition-all disabled:opacity-50"
                        title="Re-sincronizar librero con videos indexados"
                    >
                        <FaArrowRotateLeft size={12} className={isRefreshing ? 'animate-spin text-sky-400' : 'text-white/60'} />
                        <span>{isRefreshing ? 'Sincronizando...' : 'Actualizar Tomos'}</span>
                    </button>
                    <button
                        type="button"
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-medium flex items-center gap-2 transition-all shadow-sm"
                        title="Crear un nuevo tomo personalizado"
                    >
                        <FaPlus size={12} className="text-white/70" />
                        <span>Nuevo Tomo</span>
                    </button>
                </div>
            </div>

            {/* AI Status Banner */}
            <div className="my-5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex items-center justify-between gap-4 relative z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <div className="flex flex-col">
                        <span className="text-xs font-semibold text-white/90 flex items-center gap-2">
                            Motor Editorial Activo en Tiempo Real
                            <span className="text-[10px] text-white/40 font-mono">· Ingesta continua</span>
                        </span>
                        <span className="text-[11px] text-white/50">
                            A medida que agregas o sincronizas videos, Gemini 3.8 Flash los clasifica y genera fascículos ilustrados con timing exacto.
                        </span>
                    </div>
                </div>
                <div className="hidden sm:flex items-center gap-3 text-xs text-white/50 font-mono">
                    <span>{volumes.length} Tomos</span>
                    <span>·</span>
                    <span>41 Artículos Extraídos</span>
                </div>
            </div>

            {/* Bookshelf Presentation */}
            <div className="flex-1 min-h-0 flex flex-col gap-10 py-4 relative z-10">
                {/* Upper Shelf */}
                <div className="flex flex-col">
                    <div className="flex items-center justify-between pb-3 px-2">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/40 flex items-center gap-2">
                            <FaFolder size={12} />
                            Estantería Principal · Volúmenes Activos
                        </span>
                        <span className="text-[11px] text-white/35 font-mono">Visualización 3D</span>
                    </div>

                    {/* Books Grid on Shelf */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-3 pt-4 pb-6">
                        {volumes.map((volume) => {
                            const isCompiling = volume.syncStatus === 'compiling';
                            const isLive = volume.syncStatus === 'live';

                            return (
                                <motion.div
                                    key={volume.id}
                                    whileHover={{ y: -8, scale: 1.02 }}
                                    transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                                    onClick={() => setSelectedVolume(volume)}
                                    className="cursor-pointer group flex flex-col"
                                >
                                    {/* 3D Book Object */}
                                    <div
                                        className="relative h-72 w-full rounded-2xl overflow-hidden border border-white/10 transition-all flex shadow-[0_15px_35px_rgba(0,0,0,0.6)] group-hover:shadow-[0_20px_45px_rgba(0,0,0,0.8)] group-hover:border-white/20"
                                        style={{
                                            background: volume.coverGradient,
                                        }}
                                    >
                                        {/* Spine (Lomo del libro/tomo) */}
                                        <div
                                            className="w-8 shrink-0 h-full border-r border-white/10 flex flex-col items-center justify-between py-4 shadow-[inset_-3px_0_8px_rgba(0,0,0,0.6)]"
                                            style={{ background: volume.spineGradient }}
                                        >
                                            <span className="text-[9px] font-black tracking-widest text-white/80 uppercase [writing-mode:vertical-lr] rotate-180">
                                                {volume.volumeNumber}
                                            </span>
                                            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                                            <FaBookOpen size={10} className="text-white/60" />
                                        </div>

                                        {/* Front Cover (Portada de la revista) */}
                                        <div className="flex-1 flex flex-col justify-between p-4 relative overflow-hidden">
                                            {/* Decorative Ambient Aura */}
                                            <div
                                                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl opacity-40 group-hover:opacity-70 transition-opacity"
                                                style={{ background: volume.color }}
                                            />

                                            {/* Top Metadata */}
                                            <div className="flex items-start justify-between gap-2 relative z-10">
                                                <span className="text-[9px] font-mono font-bold tracking-wider text-white/50 bg-black/40 px-2 py-0.5 rounded border border-white/5">
                                                    PULSARIA EDITORIAL
                                                </span>
                                                {isCompiling ? (
                                                    <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-amber-300 bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 rounded-full animate-pulse">
                                                        <FaWandMagicSparkles size={9} />
                                                        Compilando
                                                    </span>
                                                ) : isLive ? (
                                                    <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-300 bg-emerald-400/15 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                                        En Vivo
                                                    </span>
                                                ) : null}
                                            </div>

                                            {/* Center Title */}
                                            <div className="my-auto py-2 relative z-10 flex flex-col gap-1.5">
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: volume.color }}>
                                                    {volume.volumeNumber}
                                                </span>
                                                <h3 className="text-base font-extrabold text-white tracking-tight leading-tight group-hover:text-white transition-colors">
                                                    {volume.title}
                                                </h3>
                                                <p className="text-[11px] text-white/55 line-clamp-2 leading-relaxed">
                                                    {volume.subtitle}
                                                </p>
                                            </div>

                                            {/* Footer Badges */}
                                            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-[10px] text-white/50 relative z-10">
                                                <span className="font-mono">{volume.articleCount} fascículos</span>
                                                <span className="text-white/40">{volume.lastUpdated}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Shelf Base Simulation */}
                                    <div className="w-full h-2.5 mt-2 rounded-md bg-gradient-to-r from-white/[0.03] via-white/[0.08] to-white/[0.03] border-t border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]" />

                                    {/* Sub-label under shelf */}
                                    <div className="mt-2 px-1 flex items-center justify-between text-xs">
                                        <span className="text-white/70 font-medium group-hover:text-white transition-colors truncate">
                                            {volume.title}
                                        </span>
                                        <FaChevronRight size={10} className="text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
                                    </div>
                                    {volume.syncMessage && (
                                        <span className="px-1 text-[10px] text-amber-300/80 truncate mt-0.5">
                                            {volume.syncMessage}
                                        </span>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Modal de Detalle / Maqueta de Revista Digital */}
            <AnimatePresence>
                {selectedVolume && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                            className="w-full max-w-4xl max-h-[90vh] rounded-3xl bg-[#0d0f17] border border-white/15 overflow-hidden flex flex-col shadow-[0_30px_90px_rgba(0,0,0,0.95)]"
                        >
                            {/* Modal Header */}
                            <div className="p-5 border-b border-white/10 flex items-center justify-between gap-4 shrink-0 bg-white/[0.02]">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                                        style={{ background: selectedVolume.spineGradient }}
                                    >
                                        <FaBookOpen size={16} />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                                                {selectedVolume.volumeNumber}
                                            </span>
                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                                                Curaduría Gemini 3.8 Flash
                                            </span>
                                        </div>
                                        <h2 className="text-lg font-bold text-white leading-tight">
                                            {selectedVolume.title}
                                        </h2>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setSelectedVolume(null)}
                                    className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
                                >
                                    <FaXmark size={14} />
                                </button>
                            </div>

                            {/* Modal Body: Estructura y Maqueta Editorial */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                                {/* Volume Intro Card */}
                                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col gap-2">
                                    <span className="text-xs font-semibold text-white/90">Estrategia del Tomo</span>
                                    <p className="text-xs text-white/60 leading-relaxed">
                                        {selectedVolume.description}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {selectedVolume.tags.map((tag, idx) => (
                                            <span key={idx} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[11px] text-white/70 font-medium">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Maqueta de Revista Digital */}
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                                            Maqueta Editorial de Fascículo (Estructura en Tiempo Real)
                                        </span>
                                        <span className="text-[11px] text-sky-400 font-mono flex items-center gap-1.5">
                                            <FaBrain size={12} />
                                            Extracción multimodal activa
                                        </span>
                                    </div>

                                    {/* Mockup Page Spread */}
                                    <div className="p-6 rounded-2xl bg-black/40 border border-white/10 flex flex-col gap-5">
                                        {/* Mockup Magazine Header */}
                                        <div className="flex items-center justify-between border-b border-white/10 pb-3 text-xs text-white/40 font-serif italic">
                                            <span>Pulsaria Gourmet &amp; Craft · Fascículo #04</span>
                                            <span>Edición Dinámica Generada</span>
                                        </div>

                                        {/* Content Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                            {/* Left: Keyframe Photo / Visual Evidence */}
                                            <div className="flex flex-col gap-2">
                                                <div className="aspect-[4/5] rounded-xl bg-gradient-to-br from-white/10 via-black/40 to-black/80 border border-white/10 flex flex-col items-center justify-center p-4 text-center relative overflow-hidden">
                                                    <FaCamera size={24} className="text-white/30 mb-2" />
                                                    <span className="text-xs font-bold text-white/70">Fotograma Clave</span>
                                                    <span className="text-[10px] text-white/40 mt-1">Seleccionado por nitidez y contraste visual por Gemini</span>
                                                    <span className="absolute bottom-2 left-2 text-[9px] font-mono text-white/30 bg-black/60 px-1.5 py-0.5 rounded">
                                                        TC: 00:18.4
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-white/40 italic text-center">Figura 1.1 · Emplatado final</span>
                                            </div>

                                            {/* Center: Ingredients / Structured Data */}
                                            <div className="flex flex-col gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                                                    <FaFileLines size={12} />
                                                    <span>Ingredientes / Materiales Tabulados</span>
                                                </div>
                                                <ul className="text-xs text-white/70 space-y-2 leading-relaxed">
                                                    <li className="flex items-center justify-between border-b border-white/5 pb-1">
                                                        <span>• Harina de trigo</span>
                                                        <span className="font-mono text-white/40">250g</span>
                                                    </li>
                                                    <li className="flex items-center justify-between border-b border-white/5 pb-1">
                                                        <span>• Mantequilla sin sal</span>
                                                        <span className="font-mono text-white/40">120g</span>
                                                    </li>
                                                    <li className="flex items-center justify-between border-b border-white/5 pb-1">
                                                        <span>• Azúcar glass</span>
                                                        <span className="font-mono text-white/40">80g</span>
                                                    </li>
                                                    <li className="flex items-center justify-between border-b border-white/5 pb-1">
                                                        <span>• Extracto de vainilla</span>
                                                        <span className="font-mono text-white/40">1 cdta (5ml)</span>
                                                    </li>
                                                </ul>
                                                <div className="mt-auto p-2 rounded-lg bg-amber-400/10 border border-amber-400/20 text-[10px] text-amber-200">
                                                    * Cantidades y unidades calculadas por síntesis de voz y OCR.
                                                </div>
                                            </div>

                                            {/* Right: Step-by-Step Timed Instructions */}
                                            <div className="flex flex-col gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                                <div className="flex items-center gap-2 text-xs font-bold text-sky-300">
                                                    <FaClock size={12} />
                                                    <span>Pasos Cronometrados con Video</span>
                                                </div>
                                                <div className="space-y-2.5 text-xs text-white/70">
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center justify-between text-[10px] font-mono text-sky-400">
                                                            <span>Paso 1: Pomada de mantequilla</span>
                                                            <span className="bg-sky-400/10 px-1 rounded">0:00 - 0:14</span>
                                                        </div>
                                                        <p className="text-[11px] text-white/60 leading-snug">
                                                            Acremar la mantequilla a temperatura ambiente hasta obtener textura suave.
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center justify-between text-[10px] font-mono text-sky-400">
                                                            <span>Paso 2: Integración seca</span>
                                                            <span className="bg-sky-400/10 px-1 rounded">0:15 - 0:38</span>
                                                        </div>
                                                        <p className="text-[11px] text-white/60 leading-snug">
                                                            Tamizar la harina e incorporar en dos tandas sin sobrebatir la masa.
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center justify-between text-[10px] font-mono text-sky-400">
                                                            <span>Paso 3: Horneado &amp; Reposo</span>
                                                            <span className="bg-sky-400/10 px-1 rounded">0:39 - 0:58</span>
                                                        </div>
                                                        <p className="text-[11px] text-white/60 leading-snug">
                                                            Hornear a 180°C durante 12 minutos hasta dorar los bordes.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between shrink-0">
                                <span className="text-xs text-white/50">
                                    Al agregar más videos de este tema, se anexan automáticamente como nuevas páginas del tomo.
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedVolume(null)}
                                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-all"
                                >
                                    Cerrar Vista Previa
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
