import { useState, useEffect, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { SHADOW, SURFACE, ACCENT } from '@/lib/design-tokens';
import { useSettings, AppTheme, RetentionPolicy } from '@/lib/settings-context';
import { useProcessingSettings } from '@/hooks/use-processing-settings';

import { 
    FaXmark, 
    FaDownload, 
    FaFolder, 
    FaCheck, 
    FaFilm, 
    FaMusic, 
    FaFileLines, 
    FaPalette,
    FaChartSimple,
    FaMicrochip,
    FaBrain,
    FaRotate,
    FaPlay,
    FaTriangleExclamation,
    FaSliders
} from 'react-icons/fa6';

// ── Solid Icons (Filled) ──
const SolidXIcon = () => <FaXmark size={18} />;
const SolidDownloadIcon = () => <FaDownload size={18} />;
const SolidFolderIcon = () => <FaFolder size={11} />;
const SolidPaletteIcon = () => <FaPalette size={13} />;
const SolidCheckIcon = () => <FaCheck size={18} />;

/**
 * Opciones de tema visual disponibles para la aplicación.
 * Cada tema define gradientes, colores de borde y acentos.
 */
const THEME_OPTIONS: Array<{
    id: AppTheme;
    name: string;
    badge?: string;
    desc: string;
    gradient: string;
    borderColor: string;
    accentColor: string;
}> = [
    {
        id: 'carbon',
        name: 'Gris Carbón',
        badge: 'Predeterminado',
        desc: 'Grafito oscuro mate de alta legibilidad y elegancia sobria',
        gradient: 'radial-gradient(ellipse at top left, #1e2026 0%, #121316 70%, #0a0b0d 100%)',
        borderColor: 'rgba(255,255,255,0.18)',
        accentColor: '#94a3b8',
    },
    {
        id: 'chromatic',
        name: 'Pulsar Chromatic',
        badge: 'Fondo Actual',
        desc: 'Ondas WebGL multicromáticas vibrantes en tiempo real',
        gradient: 'linear-gradient(135deg, rgba(254,44,85,0.7) 0%, rgba(138,92,255,0.7) 50%, rgba(37,244,238,0.7) 100%)',
        borderColor: 'rgba(254,44,85,0.4)',
        accentColor: '#fe2c55',
    },
    {
        id: 'aurora',
        name: 'Aurora Boreal',
        badge: 'Luz Ambiental',
        desc: 'Suaves estelas boreales TikTok con animación fluida',
        gradient: 'radial-gradient(ellipse at 30% 30%, rgba(37,244,238,0.4) 0%, rgba(254,44,85,0.3) 60%, #06080f 100%)',
        borderColor: 'rgba(37,244,238,0.4)',
        accentColor: '#25f4ee',
    },
    {
        id: 'oled',
        name: 'Negro Puro (OLED)',
        badge: 'Máximo Contraste',
        desc: 'Negro absoluto ultra limpio optimizado para OLED',
        gradient: 'linear-gradient(180deg, #09090b 0%, #000000 100%)',
        borderColor: 'rgba(255,255,255,0.1)',
        accentColor: '#ffffff',
    },
    {
        id: 'cyberpunk',
        name: 'Obsidiana Cyberpunk',
        badge: 'Espacio Neón',
        desc: 'Nebulosa violeta profunda con destellos galácticos',
        gradient: 'linear-gradient(135deg, #240b36 0%, #0e051a 100%)',
        borderColor: 'rgba(168,85,247,0.4)',
        accentColor: '#c084fc',
    },
];

const FORMAT_CATEGORIES = [
    {
        title: 'Video',
        icon: FaFilm,
        options: [
            { id: 'mp4', label: 'MP4', desc: 'Video standard', color: '#3b82f6' },
            { id: 'mkv', label: 'MKV', desc: 'Matroska Video', color: '#3b82f6' },
            { id: 'webm', label: 'WEBM', desc: 'Web Media', color: '#3b82f6' },
            { id: 'mov', label: 'MOV', desc: 'QuickTime Movie', color: '#3b82f6' },
        ]
    },
    {
        title: 'Audio',
        icon: FaMusic,
        options: [
            { id: 'wav', label: 'WAV', desc: 'Lossless Audio', color: '#f59e0b' },
            { id: 'mp3', label: 'MP3', desc: 'Compressed Audio', color: '#f59e0b' },
            { id: 'flac', label: 'FLAC', desc: 'Free Lossless', color: '#f59e0b' },
            { id: 'ogg', label: 'OGG', desc: 'Ogg Vorbis', color: '#f59e0b' },
            { id: 'm4a', label: 'M4A', desc: 'Apple Audio', color: '#f59e0b' },
        ]
    },
    {
        title: 'Text',
        icon: FaFileLines,
        options: [
            { id: 'txt', label: 'TXT', desc: 'Plain Text', color: '#10b981' },
            { id: 'srt', label: 'SRT', desc: 'Subtitles', color: '#10b981' },
            { id: 'vtt', label: 'VTT', desc: 'Web Video Text', color: '#10b981' },
            { id: 'json', label: 'JSON', desc: 'Data Format', color: '#10b981' },
        ]
    }
];

export function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            className={cn('rounded-[20px] p-4 border transition-all', className)}
            style={{
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(18, 20, 26, 0.75)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)'
            }}
        >
            {children}
        </div>
    );
}

export function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
    return (
        <div className="flex items-center gap-2 mb-3">
            <div
                className="w-5 h-5 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--accent-primary)]"
                style={{ background: ACCENT.primary12, boxShadow: SHADOW.nmInset }}
            >
                <Icon />
            </div>
            <span className="font-black tracking-[0.2em] uppercase" style={{ fontSize: 'var(--text-micro)', color: 'var(--text-ghost)' }}>
                {label}
            </span>
        </div>
    );
}

type SettingsTab = 'general' | 'stats' | 'engine' | 'ai';

interface SettingsPanelProps {
    onClose: () => void;
    jobs?: any[];
    onPlaylistSelect?: (id: number | null) => void;
}

export function SettingsPanel({ onClose, jobs = [], onPlaylistSelect }: SettingsPanelProps) {
    const { settings, updateSettings } = useSettings();
    const processingSetup = useProcessingSettings();

    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [formats, setFormats] = useState<string[]>(settings.formats);
    const [folder, setFolder] = useState(settings.folder);
    const [selectedTheme, setSelectedTheme] = useState<AppTheme>(settings.theme || 'carbon');
    const [retention, setRetention] = useState<RetentionPolicy>(settings.retention || 'keep');
    const [cookiesBrowser, setCookiesBrowser] = useState<typeof settings.cookiesBrowser>(settings.cookiesBrowser || '');
    const [processingQuality, setProcessingQuality] = useState(settings.processingQuality);
    const [videoFit, setVideoFit] = useState(settings.videoFit);
    const selectedWhisperModel = processingQuality < 35
        ? 'tiny'
        : processingQuality < 72
            ? 'small'
            : processingSetup.hardware?.whisper_gpu_supported
                ? 'medium'
                : 'small';

    // Engine & Model State
    const [modelOnline, setModelOnline] = useState<boolean | null>(null);
    const [similarityThreshold, setSimilarityThreshold] = useState(0.45);
    const [hnswShards] = useState(4);
    const [settingsError, setSettingsError] = useState<string | null>(null);

    // AI Cluster State
    const [clusterThreshold, setClusterThreshold] = useState(0.70);
    const [clusterMinSize, setClusterMinSize] = useState(2);
    const [clustersList, setClustersList] = useState<Array<{ count: number; jobs: any[]; playlistId?: number; name: string; keywords: string[] }>>([]);
    const [clusteringLoading, setClusteringLoading] = useState(false);
    const [clusteringError, setClusteringError] = useState<string | null>(null);
    const [organizationCondition, setOrganizationCondition] = useState('');

    const [now] = useState(() => Date.now());

    useEffect(() => {

        let active = true;
        queueMicrotask(() => {
            if (!active) return;
            setFormats(settings.formats);
            setFolder(settings.folder);
            setSelectedTheme(settings.theme || 'carbon');
            setRetention(settings.retention || 'keep');
            setCookiesBrowser(settings.cookiesBrowser || '');
            setProcessingQuality(settings.processingQuality);
            setVideoFit(settings.videoFit);
        });
        return () => {
            active = false;
        };
    }, [settings]);

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                // In browser mode (no Tauri), use settings defaults
                if (typeof window === 'undefined' || !(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
                    if (active) setModelOnline(false);
                    return;
                }
                const { invoke } = await import('@tauri-apps/api/core');
                const [downloadDir, modelStatus, searchConfig] = await Promise.all([
                    invoke<string>('get_download_dir'),
                    invoke<{ loaded: boolean }>('get_model_status'),
                    invoke<{ min_score: number }>('get_search_config'),
                ]);
                if (!active) return;
                setFolder(downloadDir);
                setModelOnline(modelStatus.loaded);
                setSimilarityThreshold(searchConfig.min_score);
            } catch (error) {
                if (active) {
                    setModelOnline(false);
                    setSettingsError(error instanceof Error ? error.message : String(error));
                }
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    // Format stats
    const stats = useMemo(() => {
        const completed = jobs.filter(j => j.status === 'complete' || j.status === 'completed');
        const total = completed.length;
        const totalDuration = completed.reduce((acc, j) => acc + (j.duration || 0), 0);
        
        const platforms = { tiktok: 0, youtube: 0, instagram: 0, generic: 0 };
        completed.forEach(job => {
            const url = job.url || '';
            if (url.includes('tiktok.com')) platforms.tiktok++;
            else if (url.includes('youtube.com') || url.includes('youtu.be')) platforms.youtube++;
            else if (url.includes('instagram.com')) platforms.instagram++;
            else platforms.generic++;
        });
        
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
        const thisWeek = completed.filter(j => new Date(j.created_at || now).getTime() > weekAgo).length;

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

    const toggleFormat = (id: string) => {
        setFormats(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
    };

    const handleSelectTheme = (themeId: AppTheme) => {
        setSelectedTheme(themeId);
        updateSettings({ theme: themeId });
    };

    const runClustering = async () => {
        setClusteringLoading(true);
        setClusteringError(null);
        try {
            if (typeof window === 'undefined' || !(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
                setClusteringError('Clustering requires the Tauri desktop app');
                return;
            }
            const { invoke } = await import('@tauri-apps/api/core');
            let result: number[][];
            if (organizationCondition.trim()) {
                const matches: Array<{ video_id: number }> = await invoke('search_transcripts', {
                    query: organizationCondition.trim(),
                    limit: 100,
                });
                const jobIds = [...new Set(matches.map((match) => match.video_id))];
                result = jobIds.length >= clusterMinSize ? [jobIds] : [];
            } else {
                result = await invoke('auto_cluster_videos', {
                    threshold: clusterThreshold,
                    minClusterSize: clusterMinSize,
                });
            }

            const stopWords = new Set(['para', 'sobre', 'como', 'con', 'una', 'los', 'las', 'del', 'por', 'video', 'the', 'and', 'this', 'from']);
            const groups = result.map((jobIds, idx) => {
                const matched = jobIds.map(id => jobs.find(j => j.id === id)).filter(Boolean);
                const wordCounts = new Map<string, number>();
                matched.forEach((job) => String(job.title || '').toLowerCase().split(/[^a-záéíóúñ0-9]+/i).filter((word) => word.length > 3 && !stopWords.has(word)).forEach((word) => wordCounts.set(word, (wordCounts.get(word) || 0) + 1)));
                const keywords = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([word]) => word);
                const name = keywords.length > 0 ? `Colección IA · ${keywords.join(' / ')}` : `Colección IA ${idx + 1}`;
                return { count: matched.length, jobs: matched, name, keywords, jobIds };
            }).filter(g => g.jobs.length > 0);

            if (groups.length > 0) {
                const persisted: Array<{ id: number; name: string; auto_generated: boolean }> = await invoke('replace_ai_playlists', {
                    groups: groups.map((group, idx) => ({
                        name: group.name,
                        description: organizationCondition.trim() || 'Organizada por similitud semántica y transcripción.',
                        color: ['#8a5cff', '#25f4ee', '#fe2c55'][idx % 3],
                        cover_job_id: group.jobIds[0] ?? null,
                        topic_keywords: group.keywords,
                        job_ids: group.jobIds,
                    })),
                });
                const playlistByName = new Map(persisted.filter((playlist) => playlist.auto_generated).map((playlist) => [playlist.name, playlist.id]));
                setClustersList(groups.map((group) => ({ ...group, playlistId: playlistByName.get(group.name) })));
            } else {
                setClustersList([]);
            }
        } catch (error) {
            setClustersList([]);
            setClusteringError(error instanceof Error ? error.message : String(error));
        } finally {
            setClusteringLoading(false);
        }
    };

    const handleSave = async () => {
        setSettingsError(null);
        try {
            // Try Tauri IPC first (desktop app)
            let tauriAvailable = false;
            try {
                if (typeof window !== 'undefined' && (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
                    const { invoke } = await import('@tauri-apps/api/core');
                    await Promise.all([
                        invoke('set_download_dir', { path: folder }),
                        invoke('set_default_retention', { retention }),
                        invoke('set_cookie_browser', { browser: cookiesBrowser }),
                        invoke('set_formats', { formats }),
                        invoke('update_search_config', {
                            minScore: similarityThreshold,
                            maxResults: 10,
                            chunkSize: 150,
                            chunkOverlap: 50,
                        }),
                        processingSetup.save(processingQuality, videoFit),
                    ]);
                    tauriAvailable = true;
                }
            } catch {
                // Tauri not available — fall through to local save
            }

            // Always save settings locally (works in both Tauri and browser mode)
            updateSettings({ formats, folder, theme: selectedTheme, retention, cookiesBrowser, processingQuality, videoFit });
            onClose();
        } catch (error) {
            setSettingsError(error instanceof Error ? error.message : String(error));
        }
    };

    return (
        <div
            className="absolute inset-0 z-50 flex flex-col font-sans"
            style={{ background: '#0e1017' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-[9px] text-white/40">
                        <span>PANEL DE CONTROL</span>
                    </div>
                    <h2 className="text-base font-black tracking-tight leading-tight text-white">
                        CONFIGURACIÓN <span className="text-[var(--accent-primary)]">GLOBAL</span>
                    </h2>
                </div>
                                <button
                    type="button"
                    aria-label="Cerrar configuración"
                    onClick={onClose}

                    className="w-9 h-9 rounded-[12px] flex items-center justify-center transition-all border border-white/10 bg-white/[0.04] hover:bg-[#fe2c55]/20 hover:border-[#fe2c55]/40 text-white/60 hover:text-white cursor-pointer"
                >
                    <SolidXIcon />
                </button>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="px-5 pb-3">
                <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-black/50 border border-white/10">
                                        <button
                        type="button"
                        aria-pressed={activeTab === 'general'}
                        onClick={() => setActiveTab('general')}

                        className={`py-2 px-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'general'
                                ? 'bg-white/10 text-white border border-white/20 shadow-sm'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                        }`}
                    >
                        <FaSliders size={11} />
                        <span className="truncate">General</span>
                    </button>
                                        <button
                        type="button"
                        aria-pressed={activeTab === 'stats'}
                        onClick={() => setActiveTab('stats')}

                        className={`py-2 px-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'stats'
                                ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/40 shadow-sm'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                        }`}
                    >
                        <FaChartSimple size={11} />
                        <span className="truncate">Stats</span>
                    </button>
                                        <button
                        type="button"
                        aria-pressed={activeTab === 'engine'}
                        onClick={() => setActiveTab('engine')}

                        className={`py-2 px-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'engine'
                                ? 'bg-[#25f4ee]/20 text-[#25f4ee] border border-[#25f4ee]/40 shadow-sm'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                        }`}
                    >
                        <FaMicrochip size={11} />
                        <span className="truncate">Engine</span>
                    </button>
                                        <button
                        type="button"
                        aria-pressed={activeTab === 'ai'}
                        onClick={() => setActiveTab('ai')}

                        className={`py-2 px-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'ai'
                                ? 'bg-[#8a5cff]/20 text-[#8a5cff] border border-[#8a5cff]/40 shadow-sm'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                        }`}
                    >
                        <FaBrain size={11} />
                        <span className="truncate">AI</span>
                    </button>
                </div>
            </div>

            {/* Divider */}
            <div className="mx-5 h-px bg-white/5" />

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 custom-scrollbar">

                {/* TAB: GENERAL (Temas, Formatos, Carpeta) */}
                {activeTab === 'general' && (
                    <>
                        {/* Visual Themes Selection */}
                        <SectionCard className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <SectionTitle icon={SolidPaletteIcon} label="Tema de Fondo" />
                                <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
                                    {THEME_OPTIONS.length} opciones
                                </span>
                            </div>

                            <div className="flex flex-col gap-2">
                                {THEME_OPTIONS.map(theme => {
                                    const isSelected = selectedTheme === theme.id;
                                    return (
                                        <button
                                            key={theme.id}
                                            type="button"
                                            onClick={() => handleSelectTheme(theme.id)}
                                            className="group relative flex items-center justify-between p-3 rounded-[16px] transition-all duration-300 border text-left overflow-hidden cursor-pointer"
                                            style={{
                                                background: isSelected
                                                    ? 'rgba(255,255,255,0.06)'
                                                    : 'rgba(255,255,255,0.02)',
                                                borderColor: isSelected
                                                    ? theme.borderColor
                                                    : 'rgba(255,255,255,0.06)',
                                                boxShadow: isSelected
                                                    ? `0 0 20px -5px ${theme.accentColor}40, inset 0 1px 1px rgba(255,255,255,0.15)`
                                                    : 'none',
                                            }}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div
                                                    className="w-10 h-10 rounded-[10px] shrink-0 border relative overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105"
                                                    style={{
                                                        background: theme.gradient,
                                                        borderColor: isSelected ? theme.borderColor : 'rgba(255,255,255,0.1)',
                                                        boxShadow: isSelected ? `0 0 12px ${theme.accentColor}50` : '0 2px 8px rgba(0,0,0,0.5)',
                                                    }}
                                                >
                                                    <div
                                                        className="w-2.5 h-2.5 rounded-full"
                                                        style={{
                                                            background: theme.accentColor,
                                                            boxShadow: `0 0 8px ${theme.accentColor}`,
                                                        }}
                                                    />
                                                </div>

                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span
                                                            className="font-bold text-xs leading-tight"
                                                            style={{
                                                                color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)',
                                                            }}
                                                        >
                                                            {theme.name}
                                                        </span>
                                                        {theme.badge && (
                                                            <span
                                                                className="px-1.5 py-0.5 rounded-[4px] text-[8px] font-black tracking-wider uppercase"
                                                                style={{
                                                                    background: isSelected
                                                                        ? `${theme.accentColor}25`
                                                                        : 'rgba(255,255,255,0.05)',
                                                                    color: isSelected
                                                                        ? theme.accentColor
                                                                        : 'rgba(255,255,255,0.4)',
                                                                    border: `1px solid ${isSelected ? theme.accentColor + '50' : 'rgba(255,255,255,0.08)'}`,
                                                                }}
                                                            >
                                                                {theme.badge}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-white/40 leading-snug mt-0.5 truncate max-w-[200px]">
                                                        {theme.desc}
                                                    </span>
                                                </div>
                                            </div>

                                            <div
                                                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 ml-2 transition-all duration-300"
                                                style={{
                                                    background: isSelected ? theme.accentColor : 'rgba(255,255,255,0.04)',
                                                    border: `1px solid ${isSelected ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                                    boxShadow: isSelected ? `0 0 10px ${theme.accentColor}80` : 'inset 0 1px 2px rgba(0,0,0,0.5)',
                                                }}
                                            >
                                                {isSelected && <FaCheck size={10} color="#000000" className="font-bold" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </SectionCard>

                        {/* Formatos de Descarga */}
                        <SectionCard className="flex flex-col gap-6">
                            <SectionTitle icon={SolidDownloadIcon} label="Formatos de Descarga" />

                            {FORMAT_CATEGORIES.map(category => {
                                const CategoryIcon = category.icon;
                                return (
                                    <div key={category.title} className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between px-1">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-5 h-5 rounded-[6px] flex items-center justify-center"
                                                    style={{
                                                        background: `${category.options[0].color}18`,
                                                        boxShadow: `0 0 8px ${category.options[0].color}25`,
                                                        color: category.options[0].color,
                                                    }}
                                                >
                                                    <CategoryIcon size={11} />
                                                </div>
                                                <span className="font-black tracking-[0.2em] uppercase text-[10px] text-white/50">
                                                    {category.title}
                                                </span>
                                            </div>
                                            <span className="text-[9px] font-bold opacity-30 tracking-widest uppercase">{category.options.length} opciones</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            {category.options.map(fmt => {
                                                const on = formats.includes(fmt.id);
                                                return (
                                                                                                        <button
                                                        type="button"
                                                        key={fmt.id}
                                                        aria-pressed={on}
                                                        onClick={() => toggleFormat(fmt.id)}

                                                        className="group relative flex flex-col items-start p-3 rounded-[16px] transition-all duration-300 border overflow-hidden cursor-pointer"
                                                        style={{
                                                            background: on
                                                                ? `linear-gradient(135deg, ${fmt.color}15, ${fmt.color}05)`
                                                                : 'rgba(255,255,255,0.02)',
                                                            borderColor: on ? `${fmt.color}40` : 'rgba(255,255,255,0.05)',
                                                            boxShadow: on ? `0 8px 20px -8px ${fmt.color}40` : 'none',
                                                        }}
                                                    >
                                                        <div className="flex items-center justify-between w-full mb-2">
                                                            <div
                                                                className="px-2 py-0.5 rounded-[6px] font-black text-[9px] tracking-wider"
                                                                style={{
                                                                    background: on ? fmt.color : 'rgba(255,255,255,0.05)',
                                                                    color: on ? '#fff' : 'rgba(255,255,255,0.4)',
                                                                }}
                                                            >
                                                                {fmt.label}
                                                            </div>
                                                            <div
                                                                className="w-4 h-4 rounded-full flex items-center justify-center"
                                                                style={{
                                                                    background: on ? fmt.color : 'rgba(255,255,255,0.05)',
                                                                    border: `1px solid ${on ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`,
                                                                }}
                                                            >
                                                                {on && <FaCheck size={10} color="#fff" />}
                                                            </div>
                                                        </div>
                                                        <span className="block font-bold text-[11px] text-left text-white/80">
                                                            {fmt.desc}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </SectionCard>

                        <SectionCard>
                            <SectionTitle icon={SolidDownloadIcon} label="Retención de Archivos" />
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { id: 'keep' as const, label: 'Conservar local', description: 'Reproduce desde este equipo', color: '#10b981' },
                                    { id: 'online' as const, label: 'Solo online', description: 'Borra video, audio y TXT', color: '#25f4ee' },
                                ]).map((option) => {
                                    const selected = retention === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => setRetention(option.id)}
                                            className="p-3 rounded-[14px] border text-left transition-all"
                                            style={{
                                                background: selected ? `${option.color}12` : 'rgba(255,255,255,0.02)',
                                                borderColor: selected ? `${option.color}55` : 'rgba(255,255,255,0.08)',
                                            }}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] font-bold text-white/90">{option.label}</span>
                                                <span className={`w-2 h-2 rounded-full ${selected ? 'opacity-100' : 'opacity-25'}`} style={{ background: option.color }} />
                                            </div>
                                            <span className="block mt-1 text-[9px] leading-relaxed text-white/45">{option.description}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-2 px-1 text-[10px] text-white/40 leading-relaxed">
                                La opción «Solo online» mantiene metadata, transcripción y búsqueda, pero elimina los archivos pesados después de que el job termina.
                            </p>
                        </SectionCard>

                        <SectionCard className="flex flex-col gap-4">
                            <div className="flex items-center justify-between gap-3">
                                <SectionTitle icon={FaMicrochip} label="Análisis Local" />
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[#25f4ee]/70">
                                    {selectedWhisperModel}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-white/55">
                                <span>Rapidez</span>
                                <span className="font-bold text-white/80">{processingQuality < 35 ? 'Rápido' : processingQuality < 72 ? 'Equilibrado' : 'Alta calidad'}</span>
                                <span>Precisión</span>
                            </div>
                            <input
                                aria-label="Rapidez y calidad del procesamiento"
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={processingQuality}
                                onChange={(event) => setProcessingQuality(Number(event.target.value))}
                                className="w-full accent-[#25f4ee] cursor-pointer"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    aria-pressed={videoFit === 'cover'}
                                    onClick={() => setVideoFit('cover')}
                                    className={`rounded-[12px] px-3 py-2 text-[10px] font-bold transition-colors ${videoFit === 'cover' ? 'bg-[#25f4ee]/15 text-[#25f4ee]' : 'bg-white/[.03] text-white/45 hover:text-white/75'}`}
                                >
                                    Rellenar video
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={videoFit === 'contain'}
                                    onClick={() => setVideoFit('contain')}
                                    className={`rounded-[12px] px-3 py-2 text-[10px] font-bold transition-colors ${videoFit === 'contain' ? 'bg-[#25f4ee]/15 text-[#25f4ee]' : 'bg-white/[.03] text-white/45 hover:text-white/75'}`}
                                >
                                    Mostrar completo
                                </button>
                            </div>
                            <p className="text-[10px] leading-relaxed text-white/40">
                                {processingSetup.hardware?.gpu_name || 'GPU no detectada'} · {processingSetup.hardware?.logical_cores || '—'} hilos · {processingSetup.hardware?.whisper_gpu_supported ? 'Aceleración Whisper disponible' : 'Fallback CPU activo'}
                            </p>
                        </SectionCard>

                        <SectionCard>
                            <SectionTitle icon={FaBrain} label="Fuentes Privadas" />
                            <select
                                value={cookiesBrowser}
                                onChange={(event) => setCookiesBrowser(event.target.value as typeof cookiesBrowser)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white/90 outline-none focus:border-[#8a5cff]/50 transition-colors cursor-pointer"
                            >
                                <option value="">Solo fuentes públicas</option>
                                <option value="chrome">Chrome (sesión local)</option>
                                <option value="edge">Edge (sesión local)</option>
                                <option value="firefox">Firefox (sesión local)</option>
                            </select>
                            <p className="mt-2 px-1 text-[10px] text-white/40 leading-relaxed">
                                Para likes, favoritos o playlists privadas, inicia sesión en el navegador elegido. Pulsaria usa el lector local de yt-dlp y no copia ni guarda las cookies.
                            </p>
                        </SectionCard>

                        {/* Save Folder */}
                        <SectionCard>

                            <SectionTitle icon={SolidFolderIcon} label="Carpeta de Guardado" />
                            <div
                                className="flex items-center gap-2 px-3 py-2.5 rounded-[12px] bg-black/40 border border-white/10"
                            >
                                <div className="flex-shrink-0 flex items-center justify-center text-white/40">
                                    <SolidFolderIcon />
                                </div>
                                <input
                                    type="text"
                                    value={folder}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFolder(e.target.value)}
                                    className="flex-1 bg-transparent outline-none font-mono text-xs text-white"
                                    placeholder="~/Descargas/TikTok"
                                />
                            </div>
                            <p className="mt-2 px-1 text-[10px] text-white/40 leading-relaxed">
                                Los videos procesados se almacenan automáticamente en este directorio.
                            </p>
                        </SectionCard>
                    </>
                )}

                {/* TAB: ESTADÍSTICAS */}
                {activeTab === 'stats' && (
                    <SectionCard className="flex flex-col gap-4">
                        <SectionTitle icon={FaChartSimple} label="Métricas de la Biblioteca" />

                        <div className="grid grid-cols-2 gap-2.5">
                            <div className="flex flex-col p-3 rounded-[14px] bg-black/40 border border-white/5 shadow-inner">
                                <span className="text-white/40 text-[9px] uppercase font-bold tracking-widest mb-1">Total Videos</span>
                                <span className="text-white font-black text-2xl leading-none">{stats.total}</span>
                            </div>
                            <div className="flex flex-col p-3 rounded-[14px] bg-black/40 border border-white/5 shadow-inner">
                                <span className="text-white/40 text-[9px] uppercase font-bold tracking-widest mb-1">Duración Total</span>
                                <span className="text-white font-black text-2xl leading-none truncate">{formatDuration(stats.totalDuration)}</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2.5 p-3.5 rounded-[14px] bg-black/30 border border-white/5">
                            <span className="text-white/40 text-[9px] uppercase font-bold tracking-widest">Distribución de Plataformas</span>
                            {Object.entries(stats.platforms).map(([platform, count]) => (
                                <div key={platform} className="flex items-center gap-2">
                                    <span className="text-[11px] text-white/70 w-20 capitalize font-medium">{platform}</span>
                                    <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                        <div 
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ 
                                                width: `${(count / maxPlatform) * 100}%`,
                                                background: platform === 'tiktok' ? '#fe2c55' : 
                                                            platform === 'youtube' ? '#ff0000' : 
                                                            platform === 'instagram' ? '#e1306c' : '#25f4ee'
                                            }}
                                        />
                                    </div>
                                    <span className="text-[11px] text-white/50 w-8 text-right font-mono font-bold">{count}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-[12px] bg-white/[0.02] border border-white/5">
                            <span className="text-white/50 text-[10px] uppercase font-bold tracking-wider">Actividad esta semana</span>
                            <span className="text-emerald-400 font-black text-sm font-mono">+{stats.thisWeek} videos</span>
                        </div>
                    </SectionCard>
                )}

                {/* TAB: MOTOR SEMÁNTICO (ENGINE) */}
                {activeTab === 'engine' && (
                    <SectionCard className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <SectionTitle icon={FaMicrochip} label="Motor Semántico ONNX" />
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border flex items-center gap-1 ${
                                modelOnline === false
                                    ? 'bg-[#fe2c55]/10 text-[#fe2c55] border-[#fe2c55]/30'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}>
                                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${modelOnline === false ? 'bg-[#fe2c55]' : 'bg-emerald-400'}`} />

                                                                {modelOnline === null ? 'COMPROBANDO...' : modelOnline ? 'ONLINE' : 'NO DISPONIBLE'}

                            </span>
                        </div>

                        {/* Model Specs Card */}
                        <div className="p-3.5 rounded-[14px] bg-black/40 border border-[#25f4ee]/20 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-white">all-MiniLM-L6-v2</span>
                                <span className="text-[10px] font-mono text-[#25f4ee]">ONNX Runtime</span>
                            </div>
                            <p className="text-[11px] text-white/50 leading-relaxed">
                                Pipeline neuronal acelerado por CPU/GPU para cálculo de embeddings densos y búsqueda vectorial instantánea.
                            </p>
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[10px] text-white/60">
                                <div><strong className="text-white/80">Dimensión:</strong> 384 dimensiones</div>
                                <div><strong className="text-white/80">Métrica:</strong> Distancia Coseno</div>
                                <div><strong className="text-white/80">Shards HNSW:</strong> {hnswShards} particiones</div>
                                <div><strong className="text-white/80">Embeddings:</strong> {stats.total} vectores</div>
                            </div>
                        </div>

                        {/* Similarity Threshold Slider */}
                        <div className="p-3.5 rounded-[14px] bg-black/30 border border-white/5 flex flex-col gap-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-white/60">Umbral de Similitud Semántica</span>
                                <span className="text-xs font-mono font-bold text-[#25f4ee]">{(similarityThreshold * 100).toFixed(0)}%</span>
                            </div>
                                                        <input
                                type="range"
                                aria-label="Umbral de similitud semántica"
                                min="0.2"
                                max="0.9"
                                step="0.05"

                                value={similarityThreshold}
                                onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                                className="w-full accent-[#25f4ee] cursor-pointer"
                            />
                            <span className="text-[9px] text-white/40 leading-tight">
                                Coincidencias con puntuación menor serán descartadas en la búsqueda inteligente.
                            </span>
                        </div>
                    </SectionCard>
                )}

                {/* TAB: INTELIGENCIA ARTIFICIAL & CLUSTERS (AI) */}
                {activeTab === 'ai' && (
                    <SectionCard className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <SectionTitle icon={FaBrain} label="Clustering & Grafos IA" />
                                                        <button
                                type="button"
                                aria-label="Ejecutar clustering"
                                onClick={runClustering}

                                disabled={clusteringLoading}
                                className="px-3 py-1 rounded-[10px] bg-[#8a5cff]/20 hover:bg-[#8a5cff]/30 text-[#8a5cff] border border-[#8a5cff]/40 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                            >
                                <FaPlay size={8} />
                                {clusteringLoading ? 'Agrupando...' : 'Ejecutar'}
                            </button>
                        </div>

                        <p className="text-[11px] text-white/50 leading-relaxed">
                            Crea colecciones automáticamente por similitud de transcripciones o usando una condición escrita por ti.
                        </p>
                        {clusteringError && (
                            <div role="alert" className="rounded-xl border border-[#fe2c55]/30 bg-[#fe2c55]/10 px-3 py-2 text-[10px] text-[#fe2c55]">
                                No se pudo ejecutar el clustering: {clusteringError}
                            </div>
                        )}

                        <div className="p-3.5 rounded-[14px] bg-black/30 border border-white/5 flex flex-col gap-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-white/60">Afinidad Mínima del Cluster</span>
                                <span className="text-xs font-mono font-bold text-[#8a5cff]">{(clusterThreshold * 100).toFixed(0)}%</span>
                            </div>
                                                        <input
                                type="range"
                                aria-label="Afinidad mínima del cluster"
                                min="0.5"
                                max="0.95"
                                step="0.05"

                                value={clusterThreshold}
                                                                onChange={(e) => setClusterThreshold(parseFloat(e.target.value))}
                                className="w-full accent-[#8a5cff] cursor-pointer"
                            />
                        </div>

                        <label className="flex items-center justify-between gap-3 p-3.5 rounded-[14px] bg-black/30 border border-white/5 text-[10px] uppercase font-bold tracking-wider text-white/60">
                            Tamaño mínimo del cluster
                            <input
                                type="number"
                                aria-label="Tamaño mínimo del cluster"
                                min="2"
                                max="50"
                                value={clusterMinSize}
                                onChange={(e) => setClusterMinSize(Math.min(50, Math.max(2, Number(e.target.value) || 2)))}
                                className="w-16 rounded-lg bg-black/50 border border-white/10 px-2 py-1 text-right text-xs font-mono text-white outline-none focus:border-[#8a5cff]/50"
                            />
                        </label>

                        <label className="flex flex-col gap-2 p-3.5 rounded-[14px] bg-black/30 border border-white/5 text-[10px] uppercase font-bold tracking-wider text-white/60">
                            Condición opcional
                            <input
                                type="text"
                                aria-label="Condición para organizar videos"
                                value={organizationCondition}
                                onChange={(e) => setOrganizationCondition(e.target.value)}
                                placeholder="Ej. videos sobre diseño y tecnología"
                                className="rounded-[10px] bg-black/50 border border-white/10 px-3 py-2 text-[11px] font-medium normal-case tracking-normal text-white outline-none focus:border-[#8a5cff]/50"
                            />
                        </label>

                        {/* Clusters List */}

                        <div className="flex flex-col gap-2">
                            <span className="text-[9px] uppercase font-bold tracking-widest text-white/40">
                                Grupos Semánticos Detectados ({clustersList.length})
                            </span>
                            {clustersList.length > 0 ? (
                                clustersList.map((group, idx) => (
                                    <div key={idx} className="p-3 rounded-[12px] bg-black/40 border border-[#8a5cff]/20 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-[8px] bg-[#8a5cff]/15 flex items-center justify-center text-[#8a5cff] font-bold text-xs">
                                                #{idx + 1}
                                            </div>
                                            <span className="text-xs font-bold text-white truncate">{group.name}</span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="text-[10px] font-mono text-[#8a5cff] font-bold">{group.count} videos</span>
                                            {group.playlistId && <button type="button" onClick={() => { onPlaylistSelect?.(group.playlistId ?? null); onClose(); }} className="rounded-[8px] border border-[#25f4ee]/30 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-[#25f4ee] transition hover:bg-[#25f4ee]/10">Ver</button>}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-4 rounded-[12px] bg-black/20 border border-white/5 text-center text-[10px] text-white/40">
                                                                        Presiona «Ejecutar» para descubrir clusters temáticos en tu biblioteca.

                                </div>
                            )}
                        </div>
                    </SectionCard>
                )}
            </div>

                        {/* Footer CTA */}
            <div className="px-5 py-4 border-t border-white/10">
                {settingsError && (
                    <div role="alert" className="mb-3 rounded-xl border border-[#fe2c55]/30 bg-[#fe2c55]/10 px-3 py-2 text-[10px] leading-relaxed text-[#fe2c55]">
                        No se pudo guardar la configuración: {settingsError}
                    </div>
                )}

                                <button
                    type="button"
                    onClick={() => { void handleSave(); }}

                    className="w-full py-2.5 rounded-[12px] font-black tracking-[0.15em] uppercase text-white transition-all active:scale-[0.98] cursor-pointer"
                    style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))',
                        border: '1px solid rgba(255,255,255,0.2)',
                        boxShadow: `0 4px 15px rgba(0,0,0,0.5)`,
                        fontSize: '12px',
                    }}
                >
                    Guardar Cambios
                </button>
            </div>
        </div>
    );
}

