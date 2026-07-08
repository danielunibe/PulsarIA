'use client';
import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { VideoGrid } from '@/components/VideoGrid';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ColorBends } from '@/components/ColorBends';
import SemanticConfigPanel from '@/components/config/SemanticConfigPanel';
import { toast } from 'sonner';
import { INACTIVE_SLOTS_COUNT } from '@/lib/mock-data';
import { useScrollParallax } from '@/hooks/useScrollParallax';

// ============================================================
// Dashboard Principal — Pulsar Eventide
// Toast system: Sonner (global via layout.tsx Toaster)
// ============================================================

interface SemanticSearchResult {
    video_id: number;
    title: string | null;
    thumbnail: string | null;
    matched_text: string;
    similarity_score: number;
}

export default function Page() {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [activeVideoId, setActiveVideoId] = useState<number | null>(null);
    const [jobCount, setJobCount] = useState(0);
    const [basePath, setBasePath] = useState('');

    const [searchResults, setSearchResults] = useState<SemanticSearchResult[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    
    type AppTab = 'dashboard' | 'semantic-config';
    const [activeTab, setActiveTab] = useState<AppTab>('dashboard');

    // Add scroll parallax hook
    const scrollY = useScrollParallax(0.2);

    useEffect(() => {
        // --- PHASE 1 SYSTEM VALIDATION: AUTO QUEUE TEST LINK ---
        const runTest = async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                console.log("Adding Test Job...");
                const testUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
                // const jobId = await invoke('add_job', { url: testUrl });
                // toast.success(`Pipeline Test Started! Job ID: ${jobId}`);
            } catch (e) {
                console.log("Not in Tauri environment or error:", e);
            }
        };
        setTimeout(runTest, 1000);

        const fetchInitData = async () => {
            try {
                let data: any[] = [];
                // Intentar Tauri primero, luego REST API
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    data = await invoke('get_jobs');
                } catch {
                    const response = await fetch('http://localhost:8080/api/v1/jobs');
                    if (response.ok) data = await response.json();
                }
                // Contar solo los completados para el badge del header
                const completed = data.filter((j: any) => j.status === 'complete');
                setJobCount(completed.length > 0 ? completed.length : (data.length > 0 ? data.length : 3));
            } catch (e) {
                setJobCount(3); // fallback browser sin backend
            }
        };
        fetchInitData();
        const interval = setInterval(fetchInitData, 3000);
        return () => clearInterval(interval);
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
            return;
        }
        setIsSearching(true);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const results: SemanticSearchResult[] = await invoke('search_transcripts', { query });
            setSearchResults(results);
        } catch (e) {
            console.error("Search failed:", e);
            toast.error("Error en la búsqueda semántica. Asegúrate de que Python está corriendo.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleClearSearch = () => {
        setSearchResults(null);
    };

    const getLocalFileSrc = (localRelativePath?: string | null) => {
        if (!localRelativePath || !basePath) return undefined;
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
            {/* New Advanced WebGL Background (User Provided) */}
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

            <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Main Content Area */}
            <main className="flex-1 h-full overflow-y-auto custom-scrollbar flex flex-col min-w-0 p-[5px] pl-0 relative z-10">
                <Header
                    onOpenSettings={() => setSettingsOpen(true)}
                    activeCount={jobCount}
                    onSearchSubmit={handleSearch}
                    onSearchClear={handleClearSearch}
                />

                {activeTab === 'semantic-config' ? (
                    <SemanticConfigPanel />
                ) : isSearching ? (
                    <div className="w-full h-full flex items-center justify-center">
                        <div className="text-white/60 font-medium tracking-widest text-sm flex items-center gap-3">
                            <span className="w-4 h-4 rounded-full border-2 border-[#25f4ee] border-t-transparent animate-spin"></span>
                            VECTORIZANDO Y BUSCANDO...
                        </div>
                    </div>
                ) : searchResults ? (
                    <div className="px-8 py-4">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="h-6 w-1 rounded-full bg-gradient-to-b from-[#fe2c55] to-[#25f4ee]"></div>
                            <h2 className="text-xl font-bold text-white tracking-wide">Resultados de Inteligencia <span className="text-[#25f4ee]">Semántica</span></h2>
                        </div>
                        <div className="flex flex-col gap-3">
                            {searchResults.map((result, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => handlePlayStart(result.video_id)}
                                    className="flex items-start gap-4 p-4 rounded-xl cursor-pointer group transition-all duration-300 relative overflow-hidden"
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 30px rgba(0,0,0,0.5)',
                                    }}
                                >
                                    {/* Hover gradient bleed */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#fe2c55]/0 via-[#fe2c55]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

                                    <div className="w-24 h-36 rounded-lg overflow-hidden shrink-0 shadow-lg border border-white/10 relative">
                                        <img
                                            src={getLocalFileSrc(result.thumbnail) || 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?q=80&w=100&auto=format&fit=crop'}
                                            alt={result.title || 'Video'}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0 py-1">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="font-bold text-white/90 text-[15px] truncate max-w-[70%]">{result.title || `Tarea #${result.video_id}`}</h3>
                                            <span className="text-xs font-black tracking-wider text-[#25f4ee] px-2.5 py-1 rounded-md bg-[#25f4ee]/10 border border-[#25f4ee]/20">
                                                SIMILITUD {(result.similarity_score * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="mt-3">
                                            <p className="text-[13px] text-white/60 leading-relaxed font-medium line-clamp-3">
                                                "... {result.matched_text} ..."
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {searchResults.length === 0 && (
                                <div className="text-center py-20 text-white/40">No se encontraron resultados semánticos para esta consulta.</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <VideoGrid
                        activeVideoId={activeVideoId}
                        onVideoPlayStart={handlePlayStart}
                        onVideoPlayStop={handlePlayStop}
                    />
                )}
            </main>

            {/* Settings backdrop */}
            <div
                className="fixed inset-0 transition-all duration-300"
                style={{
                    zIndex: 40,
                    background: settingsOpen ? 'rgba(0,0,0,0.5)' : 'transparent',
                    backdropFilter: settingsOpen ? 'blur(4px)' : 'none',
                    pointerEvents: settingsOpen ? 'auto' : 'none',
                }}
                onClick={() => setSettingsOpen(false)}
            />

            {/* Settings slide-in panel */}
            <div
                className="fixed top-0 right-0 h-full w-[380px] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                    zIndex: 50,
                    transform: settingsOpen ? 'translateX(0)' : 'translateX(100%)',
                    boxShadow: settingsOpen ? '-10px 0 40px rgba(0,0,0,0.6)' : 'none',
                    background: 'var(--surface-sidebar)',
                    borderLeft: '1px solid rgba(255,255,255,0.08)',
                }}
            >
                <SettingsPanel onClose={() => setSettingsOpen(false)} />
            </div>
        </div>
    );
}
