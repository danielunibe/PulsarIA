'use client';
import { useRef, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Link as LinkIcon, FileText, Upload } from 'lucide-react';
import { useLinkProcessor } from '@/hooks/use-link-processor';
import { cn } from '@/lib/utils';
import { FaLink, FaFileLines, FaCloudArrowUp, FaPlus, FaTrash, FaRocket } from 'react-icons/fa6';

// ── Solid Icons (Filled) & Native Icons ──
const SolidLinkIcon = () => <FaLink size={14} />;
const SolidFileIcon = () => <FaFileLines size={14} />;
const NativeUploadIcon = () => (
    <div className="relative w-11 h-7 flex items-center justify-center scale-90">
        <div className="absolute inset-0 bg-[#25f4ee] rounded-[0.4rem] translate-x-[-3px]"></div>
        <div className="absolute inset-0 bg-[#fe2c55] rounded-[0.4rem] translate-x-[3px]"></div>
        <div className="absolute inset-0 bg-white rounded-[0.4rem] flex items-center justify-center shadow-[0_0_10px_rgba(255,255,255,0.5)]">
            <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2h7z" />
            </svg>
        </div>
    </div>
);

export function AddLinks() {
    const {
        activeTab, setActiveTab,
        linkText, setLinkText,
        file, setFile,
        status,
        stats,
        validLinks,
        hasData,
        handleProcessData,
        handleFinalProcess,
        handleDownloadFile
    } = useLinkProcessor();

    // Estado local para manejar múltiples filas de enlaces
    const [localLinks, setLocalLinks] = useState<string[]>(['']);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sincronizar responsivamente para que el botón aparezca al escribir
    useEffect(() => {
        const text = localLinks.filter(l => l.trim().length > 0).join('\n');
        setLinkText(text);
    }, [localLinks, setLinkText]);

    const hasLocalData = localLinks.some(l => l.trim().length > 0) || file !== null;
    const handleUnifiedProcess = async () => {
        if (!hasData) return;
        
        // Sincronizar linkText justo antes de procesar
        setLinkText(localLinks.join('\n'));
        
        // Fase 1: Análisis (local)
        await handleProcessData();
    };

    // Efecto para disparar el procesamiento real cuando los links están validados (status ready)
    useEffect(() => {
        if (status === 'ready' && validLinks.length > 0) {
            handleFinalProcess();
        }
    }, [status, validLinks, handleFinalProcess]);

    const handleAddRow = () => {
        if (status === 'idle') {
            setLocalLinks([...localLinks, '']);
        }
    };

    const handleUpdateRow = (index: number, value: string) => {
        setLocalLinks(prev => {
            const newer = [...prev];
            newer[index] = value;
            return newer;
        });
    };

    const handleRemoveRow = (index: number) => {
        if (localLinks.length > 1 && status === 'idle') {
            setLocalLinks(prev => prev.filter((_, i) => i !== index));
        }
    };

    return (
        <motion.div
            className="w-full flex flex-col gap-2.5 flex-shrink-0 font-sans"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >

            {/* Main AddLinks Panel: Estilo Neón Esmeralda Sutil */}
            <section
                className="relative overflow-hidden flex flex-col gap-4 p-5 rounded-[24px] transition-all duration-500"
                style={{
                    backgroundColor: 'rgba(10, 12, 20, 0.85)', // More opaque, less glass
                    backdropFilter: 'blur(40px)',
                    WebkitBackdropFilter: 'blur(40px)',
                    border: '5px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 30px rgba(254,44,85,0.15)',
                }}
            >
                {/* Background colorized glows — Much more prominent now */}
                <div className="absolute -top-10 -right-10 w-48 h-48 bg-[#fe2c55] opacity-40 blur-[70px] pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-[#25f4ee] opacity-30 blur-[60px] pointer-events-none" />

                {/* Visual Accent: Top-right vibrant dot */}
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#fe2c55] shadow-[0_0_15px_#fe2c55] animate-pulse pointer-events-none" />

                {/* Header — Branding Integrado (Destacado) */}
                <header className="flex items-center justify-between gap-2 px-1 relative z-10 mb-1">
                    <div className="flex flex-col">
                        <span className="font-extrabold uppercase tracking-[0.35em] text-[12px] text-white/40 mb-1">
                            Pulsar Eventide
                        </span>
                        <h1 className="font-bold tracking-tight leading-none text-[18px] sm:text-[22px]">
                            <span style={{ color: '#fe2c55', filter: 'drop-shadow(0 2px 10px rgba(254,44,85,0.5))' }}>TikTok</span>{' '}
                            <span style={{ color: '#10b981', filter: 'drop-shadow(0 2px 10px rgba(16,185,129,0.5))' }}>Processor</span>
                        </h1>
                    </div>
                </header>

                {/* Tab switcher */}
                <div
                    role="tablist"
                    className="p-1 xl:p-1.5 rounded-[16px] flex w-full relative z-10 overflow-hidden"
                    style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.3)'
                    }}
                >
                    {/* Sliding indicator - Neón Violeta/Magenta — Motion layoutId */}
                    <motion.div
                        className="absolute top-1 xl:top-1.5 left-1 xl:left-1.5 w-[calc(50%-4px)] xl:w-[calc(50%-6px)] h-[calc(100%-8px)] xl:h-[calc(100%-12px)] rounded-[12px]"
                        layoutId="tab-indicator"
                        animate={{
                            x: activeTab === 'file' ? 'calc(100% + 4px)' : '0%',
                        }}
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        style={{
                            background: 'rgba(139, 92, 246, 0.25)',
                            border: '1px solid rgba(139, 92, 246, 0.6)',
                            boxShadow: 'inset 0 0 10px rgba(139, 92, 246, 0.4), 0 0 15px rgba(139, 92, 246, 0.3)',
                        }}
                    />
                    <button
                        onClick={() => status === 'idle' && setActiveTab('link')}
                        className={cn("flex-1 relative z-10 py-[8px] text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-2 transition-colors duration-200",
                            activeTab === 'link' ? 'text-white drop-shadow-md' : 'text-white/40 hover:text-white/70')}
                    >
                        <SolidLinkIcon /> Enlace
                    </button>
                    <button
                        onClick={() => status === 'idle' && setActiveTab('file')}
                        className={cn("flex-1 relative z-10 py-[8px] text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-2 transition-colors duration-200",
                            activeTab === 'file' ? 'text-white drop-shadow-md' : 'text-white/40 hover:text-white/70')}
                    >
                        <SolidFileIcon /> Subir
                    </button>
                </div>

                {/* Input panels — Auto-height for compactness */}
                <div className="relative w-full overflow-hidden">

                    {/* Link panel */}
                    <div className={cn(
                        "w-full transition-all duration-300 z-10 flex flex-col gap-2",
                        activeTab === 'link' ? 'opacity-100 translate-y-0' : 'hidden opacity-0 translate-y-2'
                    )}>
                        <div className="w-full relative overflow-hidden flex flex-col gap-2 custom-scrollbar overflow-y-auto pr-1 max-h-[100px]">
                            {localLinks.map((link, idx) => (
                                <div key={idx} className="w-full">
                                    <input
                                        type="text"
                                        value={link}
                                        onChange={(e) => handleUpdateRow(idx, e.target.value)}
                                        placeholder="Pegar enlace de TikTok..."
                                        className="w-full bg-white/5 border border-white/10 rounded-[12px] px-4 py-2.5 text-[12px] text-white/90 outline-none focus:border-[#fe2c55]/50 transition-all font-medium"
                                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Botón Añadir Otro Link */}
                        <button
                            onClick={handleAddRow}
                            className="w-full h-8 flex items-center justify-center gap-2 rounded-[12px] bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all shrink-0"
                            style={{ borderStyle: 'dashed' }}
                        >
                            <FaPlus size={10} /> Añadir otro link
                        </button>
                    </div>

                    {/* File panel */}
                    <div className={cn(
                        "w-full transition-all duration-300 z-10",
                        activeTab === 'file' ? 'opacity-100 translate-y-0' : 'hidden opacity-0 -translate-y-2'
                    )}>
                        <div
                            className="w-full h-[80px] flex items-center justify-center gap-3 cursor-pointer group relative overflow-hidden transition-all duration-300 hover:border-[#25f4ee]/40"
                            style={{
                                background: 'rgba(0,0,0,0.4)',
                                borderRadius: '16px',
                                border: '1px solid rgba(37,244,238,0.2)', // Cyan hint on upload border
                                boxShadow: 'inset 0 4px 15px rgba(0,0,0,0.7)',
                            }}
                            onClick={() => status === 'idle' && fileInputRef.current?.click()}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".csv, .txt"
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] || null)}
                            />
                            {/* Eliminado container extra para dejar lucir el icono nativo puro */}
                            <div className="transition-all duration-500 group-hover:scale-110 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                                <NativeUploadIcon />
                            </div>
                            <div className="flex flex-col relative z-10 pb-1 pt-1">
                                <span className={cn("text-[12px] font-bold tracking-wider uppercase truncate max-w-[140px] drop-shadow-md transition-colors", file ? 'text-[#10b981]' : 'text-white/90 group-hover:text-white')}>
                                    {file ? file.name : 'Subir Archivo'}
                                </span>
                                <span className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">Formatos .CSV o .TXT</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action button — Rediseñado para máximo impacto */}
                <div className={cn("overflow-hidden transition-all duration-500 ease-in-out relative z-10 w-full", hasLocalData && status === 'idle' ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0')}>
                    <motion.button
                        onClick={handleUnifiedProcess}
                        className="w-full relative flex items-center justify-center gap-3 text-white text-[12px] sm:text-[13px] font-black tracking-[0.15em] uppercase py-4 rounded-[18px] group"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        style={{
                            background: 'linear-gradient(135deg, #fe2c55 0%, #8a5cff 100%)',
                            border: '1px solid rgba(255,255,255,0.25)',
                            boxShadow: '0 10px 35px -5px rgba(254,44,85,0.5), inset 0 0 20px rgba(255,255,255,0.2)',
                            textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                        }}
                    >
                        {/* Shine Effect */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity bg-gradient-to-r from-transparent via-white to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] duration-1000" />

                        <FaRocket className="text-[16px] animate-bounce-slow" />
                        <span>Procesar Contenido</span>
                    </motion.button>
                </div>
            </section>
        </motion.div>
    );
}
