'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { VideoGrid } from '@/components/VideoGrid';
import { SettingsPanel } from '@/components/SettingsPanel';
import { toast } from 'sonner';
import { useScrollParallax } from '@/hooks/useScrollParallax';
import { FaMagnifyingGlass, FaArrowLeft, FaBrain } from 'react-icons/fa6';

import { useSettings } from '@/lib/settings-context';
import { AuroraBackground } from '@/components/AuroraBackground';
import { generateChatResponse } from '@/lib/gemini';

const ColorBends = dynamic(
    () => import('@/components/ColorBends').then((mod) => mod.ColorBends),
    { ssr: false }
);

type SortKey = 'date_desc' | 'date_asc' | 'title' | 'duration';

interface SemanticSearchResult {
    video_id: number;
    title: string | null;
    thumbnail: string | null;
    matched_text: string;
    similarity_score: number;
}

export default function Page() {
    const { settings } = useSettings();
    const activeTheme = settings.theme || 'carbon';
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [activeVideoId, setActiveVideoId] = useState<number | null>(null);
    const [jobCount, setJobCount] = useState(0);
    const [basePath, setBasePath] = useState('');

    const [searchResults, setSearchResults] = useState<SemanticSearchResult[] | null>(null);
    const [aiAnswer, setAiAnswer] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('date_desc');

    const [pageConfig, setPageConfig] = useState({
        layout: 'grid' as 'grid' | 'list' | 'compact',
        columns: 0 as 0 | 2 | 3 | 4,
        sortKey: 'date_desc' as SortKey,
        showOnlyCompleted: false,
        showErrors: false,
        keepStatusFilter: 'all' as string,
        platformFilter: 'all' as string,
    });
    const [allJobs, setAllJobs] = useState<any[]>([]);
    const scrollY = useScrollParallax(0.2);

    useEffect(() => {
        const fetchInitData = async () => {
            try {
                let data: any[] = [];
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    data = await invoke('get_jobs');
                } catch {
                    const response = await fetch('http://localhost:8080/api/v1/jobs');
                    if (response.ok) data = await response.json();
                }
                setAllJobs(data);
                const completed = data.filter((j: any) => j.status === 'complete' || j.status === 'completed');
                setJobCount(completed.length > 0 ? completed.length : data.length);
            } catch {
                setJobCount(0);
            }
        };

        fetchInitData();
        const interval = setInterval(fetchInitData, 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        import('@tauri-apps/api/event').then(({ listen }) => {
            listen('job_completed_notify', (event: any) => {
                toast.success('Video procesado', {
                    description: event.payload?.title || `Job #${event.payload?.job_id}`,
                    duration: 5000,
                });
            }).then((fn) => { unlisten = fn; });
        }).catch(() => {});
        return () => { unlisten?.(); };
    }, []);

    const handlePlayStart = useCallback((id: number) => {
        setActiveVideoId(id);
    }, []);

    const handlePlayStop = useCallback((id: number) => {
        if (activeVideoId === id) {
            setActiveVideoId(null);
        }
    }, [activeVideoId]);

    const handleSearch = async (query: string) => {
        if (!query.trim()) {
            setSearchResults(null);
            setAiAnswer(null);
            return;
        }
        setIsSearching(true);
        setAiAnswer(null);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const results: SemanticSearchResult[] = await invoke('search_transcripts', { query });
            setSearchResults(results);

            // Synthesize intelligent response with Gemini RAG
            if (results && results.length > 0) {
                const context = results.slice(0, 5).map(r => `Título: ${r.title || 'Video'}\nContenido del fragmento: ${r.matched_text}`);
                generateChatResponse(query, context).then(ans => {
                    setAiAnswer(ans);
                }).catch(() => {});
                toast.success(`Búsqueda completada: ${results.length} coincidencias`, {
                    description: `Similitud máxima: ${(results[0].similarity_score * 100).toFixed(1)}%`
                });
            } else {
                generateChatResponse(query, []).then(ans => {
                    setAiAnswer(ans);
                }).catch(() => {});
                toast.info("Sin coincidencias en transcripciones");
            }
        } catch (e: any) {
            console.error("Search failed:", e);
            generateChatResponse(query, []).then(ans => {
                setAiAnswer(ans);
                setSearchResults([]);
            }).catch(() => {});
        } finally {
            setIsSearching(false);
        }
    };

    const handleClearSearch = () => {
        setSearchResults(null);
        setAiAnswer(null);
    };

    const getLocalFileSrc = (localRelativePath?: string | null) => {
        if (!localRelativePath) return undefined;
        if (localRelativePath.startsWith('http://') || localRelativePath.startsWith('https://')) {
            return localRelativePath;
        }
        if (!basePath) return undefined;
        return `http://asset.localhost/${basePath.replace(/\\/g, '/')}/${localRelativePath}`;
    };

    return (
        <div
            className="flex h-screen w-full font-sans overflow-auto relative"
            style={{ 
                color: 'var(--text-strong)',
                minWidth: '1000px',
                minHeight: '750px'
            }}
        >
            {/* Background Theme Renderer */}
            {activeTheme === 'chromatic' && (
                <div
                    className="fixed inset-[-10%] w-[120%] h-[120%] z-[-10] pointer-events-none bg-[#0a0a0a]"
                    style={{
                        transform: `translateY(${-scrollY}px) scale(1.1)`,
                        transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)'
                    }}
                >
                    <ColorBends
                        colors={["#ff5c7a", "#8a5cff", "#00ffd1"]}
                        rotation={0}
                        speed={0.2}
                        scale={1}
                        frequency={1}
                        warpStrength={1}
                        mouseInfluence={0.5}
                        parallax={0.25}
                        noise={0.1}
                        transparent={true}
                        autoRotate={0}
                    />
                </div>
            )}

            {activeTheme === 'carbon' && (
                <div className="fixed inset-0 z-[-10] pointer-events-none overflow-hidden bg-[#0a0b0e]">
                    {/* Ultra-smooth Luxury Charcoal Gradient Layers */}
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `
                                radial-gradient(ellipse 120% 80% at 20% 10%, rgba(38, 43, 56, 0.70) 0%, transparent 60%),
                                radial-gradient(ellipse 100% 70% at 80% 90%, rgba(24, 27, 36, 0.85) 0%, transparent 60%),
                                radial-gradient(ellipse 80% 80% at 50% 50%, rgba(17, 19, 25, 0.95) 0%, #07080a 100%)
                            `,
                        }}
                    />
                    {/* Deep Atmospheric Vignette */}
                    <div
                        className="absolute inset-0"
                        style={{
                            background: 'radial-gradient(ellipse 90% 85% at 50% 50%, transparent 40%, rgba(4, 5, 7, 0.88) 100%)'
                        }}
                    />
                </div>
            )}

            {activeTheme === 'aurora' && <AuroraBackground />}

            {activeTheme === 'oled' && (
                <div className="fixed inset-0 z-[-10] pointer-events-none bg-[#010103]">
                    <div
                        className="absolute inset-0"
                        style={{
                            background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,255,255,0.02) 0%, transparent 70%)'
                        }}
                    />
                </div>
            )}

            {activeTheme === 'cyberpunk' && (
                <div className="fixed inset-0 z-[-10] pointer-events-none bg-[#080512]">
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `
                                radial-gradient(ellipse 65% 55% at 15% 20%, rgba(168,85,247,0.2) 0%, transparent 55%),
                                radial-gradient(ellipse 70% 60% at 85% 80%, rgba(236,72,153,0.18) 0%, transparent 55%),
                                radial-gradient(ellipse 50% 40% at 50% 60%, rgba(37,244,238,0.12) 0%, transparent 60%)
                            `,
                        }}
                    />
                </div>
            )}

            {/* Sidebar Exclusivo Dashboard */}
            <Sidebar jobs={allJobs} />

            {/* Main Content Area */}
            <main className="flex-1 h-full overflow-y-auto custom-scrollbar flex flex-col min-w-0 p-[5px] pl-0 relative z-10">
                <Header
                    onOpenSettings={() => setSettingsOpen(true)}
                    activeCount={jobCount}
                    onSearchSubmit={handleSearch}
                    onSearchClear={handleClearSearch}
                    onSortChange={(key) => setSortKey(key as SortKey)}
                    sortKey={sortKey}
                />

                {isSearching ? (
                    <div className="w-full h-full flex items-center justify-center p-8">
                        <div className="p-8 rounded-3xl bg-black/60 backdrop-blur-2xl border border-white/10 flex items-center gap-4 shadow-2xl">
                            <span className="w-6 h-6 rounded-full border-2 border-[#8a5cff] border-t-transparent animate-spin" />
                            <div className="flex flex-col">
                                <span className="text-white font-black text-sm tracking-wider uppercase">Búsqueda Inteligente IA</span>
                                <span className="text-white/40 text-xs font-mono">Inferencia semántica ONNX + Síntesis Gemini RAG...</span>
                            </div>
                        </div>
                    </div>
                ) : (searchResults !== null || aiAnswer !== null) ? (
                    <div className="px-8 py-4 flex flex-col gap-5">
                        {/* Search View Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-6 w-1 rounded-full bg-gradient-to-b from-[#fe2c55] via-[#8a5cff] to-[#25f4ee]"></div>
                                <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                                    <span>Resultados Inteligentes</span>
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#8a5cff] px-2 py-0.5 rounded bg-[#8a5cff]/10 border border-[#8a5cff]/20">
                                        IA RAG
                                    </span>
                                </h2>
                            </div>
                            <button
                                onClick={handleClearSearch}
                                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/80 hover:text-white flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                            >
                                <FaArrowLeft size={11} />
                                <span>Volver a la Biblioteca</span>
                            </button>
                        </div>

                        {/* AI Synthesized Answer Card */}
                        {aiAnswer && (
                            <div 
                                className="p-5 rounded-[20px] border flex flex-col gap-3 relative overflow-hidden"
                                style={{
                                    background: 'rgba(18, 14, 28, 0.85)',
                                    backdropFilter: 'blur(20px)',
                                    borderColor: 'rgba(138, 92, 255, 0.3)',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 25px rgba(138,92,255,0.1)'
                                }}
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-[10px] bg-[#8a5cff]/20 border border-[#8a5cff]/40 flex items-center justify-center text-[#8a5cff]">
                                        <FaBrain size={14} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black uppercase tracking-wider text-white">
                                            Síntesis de Inteligencia Artificial
                                        </span>
                                        <span className="text-[9px] text-[#8a5cff] font-mono font-bold">
                                            Gemini RAG • Asistente de Investigación
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs sm:text-[13px] text-white/90 leading-relaxed font-medium pl-1">
                                    {aiAnswer}
                                </p>
                            </div>
                        )}

                        {/* Matched Video Fragments List */}
                        <div className="flex flex-col gap-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 px-1">
                                Coincidencias en Videos ({searchResults?.length || 0})
                            </span>
                            {searchResults && searchResults.map((result, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => handlePlayStart(result.video_id)}
                                    className="flex items-start gap-4 p-4 rounded-2xl cursor-pointer group transition-all duration-300 relative overflow-hidden bg-black/40 border border-white/10 hover:border-[#25f4ee]/40 hover:shadow-[0_10px_35px_rgba(37,244,238,0.1)]"
                                >
                                    <div className="w-24 h-36 rounded-xl overflow-hidden shrink-0 shadow-lg border border-white/10 relative bg-black">
                                        <img
                                            src={getLocalFileSrc(result.thumbnail) || 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?q=80&w=100&auto=format&fit=crop'}
                                            alt={result.title || 'Video'}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0 py-1">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="font-bold text-white text-base truncate max-w-[70%]">
                                                {result.title || `Video #${result.video_id}`}
                                            </h3>
                                            <span className="text-xs font-black tracking-wider text-[#25f4ee] px-2.5 py-1 rounded-lg bg-[#25f4ee]/10 border border-[#25f4ee]/30 font-mono shadow-[0_0_10px_rgba(37,244,238,0.15)]">
                                                SIMILITUD {(result.similarity_score * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="mt-2">
                                            <p className="text-xs text-white/70 leading-relaxed font-medium line-clamp-3 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                                                "... {result.matched_text} ..."
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {searchResults && searchResults.length === 0 && !aiAnswer && (
                                <div className="text-center py-20 text-white/40 bg-black/30 rounded-3xl border border-white/5 flex flex-col items-center gap-3">
                                    <FaMagnifyingGlass size={32} className="text-white/20" />
                                    <span>No se encontraron fragmentos semánticos para esta consulta.</span>
                                    <button
                                        onClick={handleClearSearch}
                                        className="text-xs text-[#25f4ee] hover:underline"
                                    >
                                        Limpiar búsqueda
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <VideoGrid
                        activeVideoId={activeVideoId}
                        onVideoPlayStart={handlePlayStart}
                        onVideoPlayStop={handlePlayStop}
                        sortKey={sortKey}
                        layout={pageConfig.layout}
                        columns={pageConfig.columns}
                        showOnlyCompleted={pageConfig.showOnlyCompleted}
                        showErrors={pageConfig.showErrors}
                        keepStatusFilter={pageConfig.keepStatusFilter}
                        platformFilter={pageConfig.platformFilter}
                        onJobsChange={setAllJobs}
                    />
                )}
            </main>

            {/* Settings Modal Backdrop & Panel */}
            <div
                className="fixed inset-0 transition-all duration-300"
                style={{
                    zIndex: 40,
                    background: settingsOpen ? 'rgba(0,0,0,0.6)' : 'transparent',
                    backdropFilter: settingsOpen ? 'blur(6px)' : 'none',
                    pointerEvents: settingsOpen ? 'auto' : 'none',
                }}
                onClick={() => setSettingsOpen(false)}
            />

            <div
                className="fixed top-0 right-0 h-full w-[400px] xl:w-[440px] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden"
                style={{
                    zIndex: 50,
                    transform: settingsOpen ? 'translateX(0)' : 'translateX(100%)',
                    boxShadow: settingsOpen ? '-15px 0 60px rgba(0,0,0,0.9)' : 'none',
                    background: '#0e1017',
                    borderLeft: '1px solid rgba(255,255,255,0.12)',
                }}
            >
                <SettingsPanel onClose={() => setSettingsOpen(false)} jobs={allJobs} />
            </div>
        </div>
    );
}

