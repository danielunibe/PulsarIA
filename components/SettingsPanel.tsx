import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { SHADOW, SURFACE, ACCENT } from '@/lib/design-tokens';
import { useSettings } from '@/lib/settings-context';
import { FaXmark, FaDownload, FaFolder, FaCheck, FaFilm, FaMusic, FaFileLines } from 'react-icons/fa6';

// ── Solid Icons (Filled) ──
const SolidXIcon = () => <FaXmark size={18} />;
const SolidDownloadIcon = () => <FaDownload size={18} />;
const SolidFolderIcon = () => <FaFolder size={11} />;
const SolidCheckIcon = () => <FaCheck size={18} />;

// ============================================================
// SettingsPanel — Panel Lateral de Configuración
// Design System: SURFACE.card para SectionCard,
//               var(--radius-lg) para cards y panel,
//               var(--text-micro|sm)/var(--text-muted|ghost) para texto
// ============================================================
// ============================================================

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

// ── Reutilizable: Sección card con el mismo sistema de sombras ──
export function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            className={cn('rounded-[24px] p-4', className)}
            style={{ border: '5px solid rgba(255,255,255,0.1)', background: SURFACE.card, boxShadow: SHADOW.card }}
        >
            {children}
        </div>
    );
}

// ── Reutilizable: Encabezado de sección unificado ───────────────
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

export function SettingsPanel({ onClose }: { onClose: () => void }) {
    const { settings, updateSettings } = useSettings();

    // Estado pendiente hasta que se da click a "Guardar Cambios"
    const [formats, setFormats] = useState<string[]>(settings.formats);
    const [folder, setFolder] = useState(settings.folder);

    // Sincronizar el panel con los ajustes globales si estos cambian (e.g. al cargar desde localStorage al montar)
    useEffect(() => {
        setFormats(settings.formats);
        setFolder(settings.folder);
    }, [settings]);

    const toggleFormat = (id: string) => {
        setFormats(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
    };

    return (
        <div
            className="absolute inset-0 z-50 flex flex-col"
            style={{ background: 'var(--surface-sidebar)' }}
        >
            {/* Header — mismo estilo que el branding del sidebar */}
            <div className="flex items-center justify-between px-5 py-4">
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-widest" style={{ fontSize: 'var(--text-micro)', color: 'var(--text-ghost)' }}>
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shadow-[0_0_6px_rgba(249,42,78,0.8)]" />
                        <span>CONFIGURACIÓN</span>
                    </div>
                    <h2 className="text-base font-black tracking-tight italic leading-tight drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]" style={{ color: 'var(--text-default)' }}>
                        AJUSTES <span className="text-[var(--accent-primary)] drop-shadow-[0_0_10px_rgba(249,44,85,0.4)]">DEL SISTEMA</span>
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center transition-all border border-[var(--surface-border)] bg-gradient-to-b from-[#2a2a2a] to-[#111] hover:from-[var(--accent-primary-20)] hover:border-[rgba(254,44,85,0.5)] group"
                    style={{ boxShadow: SHADOW.nmRaised }}
                >
                    <div className="transition-colors group-hover:text-[var(--accent-primary)] flex items-center justify-center p-0" style={{ color: 'var(--text-muted)' }}>
                        <SolidXIcon />
                    </div>
                </button>
            </div>

            {/* Divider */}
            <div className="mx-5 h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--surface-border), transparent)' }} />

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 scrollbar-none">

                {/* Categorized Formats - with SectionCard background restored */}
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
                                        <span className="font-black tracking-[0.2em] uppercase text-[10px]" style={{ color: 'var(--text-ghost)' }}>
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
                                                key={fmt.id}
                                                onClick={() => toggleFormat(fmt.id)}
                                                className="group relative flex flex-col items-start p-3 rounded-[20px] transition-all duration-300 border overflow-hidden"
                                                style={{
                                                    background: on
                                                        ? `linear-gradient(135deg, ${fmt.color}15, ${fmt.color}05)`
                                                        : 'rgba(255,255,255,0.02)',
                                                    borderColor: on ? `${fmt.color}40` : 'rgba(255,255,255,0.05)',
                                                    boxShadow: on ? `0 8px 20px -8px ${fmt.color}40` : 'none',
                                                }}
                                            >
                                                {/* Glow effect when active */}
                                                {on && (
                                                    <div
                                                        className="absolute -top-10 -right-10 w-20 h-20 blur-2xl opacity-20 pointer-events-none"
                                                        style={{ background: fmt.color }}
                                                    />
                                                )}

                                                <div className="flex items-center justify-between w-full mb-2">
                                                    <div
                                                        className="px-2 py-0.5 rounded-[6px] font-black text-[9px] tracking-wider"
                                                        style={{
                                                            background: on ? fmt.color : 'rgba(255,255,255,0.05)',
                                                            color: on ? '#fff' : 'rgba(255,255,255,0.4)',
                                                            boxShadow: on ? `0 0 10px ${fmt.color}60` : 'none'
                                                        }}
                                                    >
                                                        {fmt.label}
                                                    </div>

                                                    <div
                                                        className="w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300"
                                                        style={{
                                                            background: on ? fmt.color : 'rgba(255,255,255,0.05)',
                                                            border: `1px solid ${on ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`,
                                                            boxShadow: on ? `inset 0 1px 2px rgba(255,255,255,0.4)` : 'inset 0 1px 2px rgba(0,0,0,0.5)',
                                                        }}
                                                    >
                                                        {on && <FaCheck size={10} color="#fff" />}
                                                    </div>
                                                </div>

                                                <div className="text-left w-full">
                                                    <span className="block font-bold text-[11px] leading-tight" style={{ color: on ? 'var(--text-default)' : 'var(--text-muted)' }}>
                                                        {fmt.desc}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </SectionCard>

                {/* Save Folder */}
                <SectionCard>
                    <SectionTitle icon={SolidFolderIcon} label="Carpeta de Guardado" />
                    <div
                        className="flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-md)]"
                        style={{ background: SURFACE.base, boxShadow: SHADOW.nmInset, border: 'var(--border-default)' }}
                    >
                        <div className="flex-shrink-0 flex items-center justify-center" style={{ color: 'var(--text-ghost)' }}>
                            <SolidFolderIcon />
                        </div>
                        <input
                            type="text"
                            value={folder}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFolder(e.target.value)}
                            className="flex-1 bg-transparent outline-none font-mono"
                            style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}
                            placeholder="~/Descargas/TikTok"
                        />
                        <button
                            className="font-bold uppercase tracking-wider px-2 py-1 rounded-[var(--radius-sm)] transition-all active:scale-95"
                            style={{ background: SURFACE.card, color: ACCENT.primary, border: 'var(--border-default)', boxShadow: SHADOW.nmRaised, fontSize: 'var(--text-micro)' }}
                        >
                            Cambiar
                        </button>
                    </div>
                    <p className="mt-2 px-1 leading-relaxed" style={{ fontSize: 'var(--text-micro)', color: 'var(--text-ghost)' }}>
                        Los videos descargados se guardarán en esta carpeta automáticamente.
                    </p>
                </SectionCard>
            </div>

            {/* Footer CTA */}
            <div className="px-5 py-4 border-t border-[var(--surface-border)]">
                <button
                    onClick={() => {
                        updateSettings({ formats, folder });
                        onClose();
                    }}
                    className="w-full py-2.5 rounded-[var(--radius-md)] font-black tracking-[0.15em] uppercase text-white transition-all active:scale-[0.98]"
                    style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))',
                        border: '1px solid rgba(255,255,255,0.2)',
                        boxShadow: `4px 4px 10px rgba(0,0,0,0.5), inset 1px 1px 2px rgba(255,255,255,0.3)`,
                        fontSize: 'var(--text-sm)',
                    }}
                >
                    Guardar Cambios
                </button>
            </div>
        </div>
    );
}
