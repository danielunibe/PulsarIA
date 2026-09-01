'use client';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { TT_PINK, TT_CYAN, TIKTOK_LOGO_PATH } from '@/types';
import { 
    FaMagnifyingGlass, 
    FaXmark, 
    FaLayerGroup,
    FaGear, 
    FaClock, 
    FaCalendarDay, 
    FaArrowDownAZ, 
    FaStopwatch, 
    FaTableCells, 
    FaListUl, 
    FaGrip,
    FaCheck,
    FaFilter,
    FaWindowMinimize,
    FaWindowMaximize,
    FaWindowRestore,
    FaXmark as FaClose
} from 'react-icons/fa6';
import { toast } from 'sonner';
import { type PageConfig, type GridLayout, type GridColumns, type SortKey } from './PagePanel';

const TikTokIcon = ({ size = 28, className = "" }: { size?: number, className?: string }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        style={{
            fill: 'rgba(255,255,255,0.85)',
            filter: `drop-shadow(2px 0px 0px ${TT_PINK}40) drop-shadow(-2px 0px 0px ${TT_CYAN}40)`,
        }}
    >
        <path d={TIKTOK_LOGO_PATH} />
    </svg>
);

const SearchIcon = () => <FaMagnifyingGlass size={14} />;
const XIcon = () => <FaXmark size={12} />;
const ViewOrganizationIcon = () => <FaLayerGroup size={14} />;
const SettingsIcon = () => <FaGear size={15} />;
const ClockFillIcon = () => <FaClock size={13} />;
const CalendarFillIcon = () => <FaCalendarDay size={13} />;
const SortAlphaIcon = () => <FaArrowDownAZ size={13} />;
const TimerFillIcon = () => <FaStopwatch size={13} />;
const MinimizeIcon = () => <FaWindowMinimize size={12} />;
const MaximizeIcon = () => <FaWindowMaximize size={12} />;
const RestoreIcon = () => <FaWindowRestore size={12} />;
const CloseIcon = () => <FaClose size={12} />;

const SORT_OPTIONS = [
    { id: 'date_desc', label: 'Más Recientes', Icon: ClockFillIcon },
    { id: 'date_asc', label: 'Más Antiguos', Icon: CalendarFillIcon },
    { id: 'title', label: 'Por Nombre', Icon: SortAlphaIcon },
    { id: 'duration', label: 'Por Duración', Icon: TimerFillIcon },
];

const btnBase: React.CSSProperties = {
    height: '40px',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(30px)',
    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2), inset 0 0 0 1px rgba(255,255,255,0.05), 0 8px 16px rgba(0,0,0,0.5)',
    cursor: 'pointer',
    transform: 'scale(1)',
};

export type SearchMode = 'literal' | 'semantic';

/**
 * Props del componente Header.
 */
interface HeaderProps {
    /** Callback para abrir el panel de Settings */
    onOpenSettings: () => void;
    /** Número de videos activos */
    activeCount?: number;
    /** Si los jobs se están cargando inicialmente */
    isLoading?: boolean;
    /** Callback cuando el usuario envía una búsqueda */
    onSearchSubmit?: (query: string, mode?: SearchMode) => void;
    /** Callback cuando el usuario limpia la búsqueda */
    onSearchClear?: () => void;
    /** Configuración actual de presentación y filtros de biblioteca */
    pageConfig?: PageConfig;
    /** Callback para actualizar la configuración de vista */
    onPageConfigChange?: (config: PageConfig) => void;
    /** Callback cuando cambia el criterio de ordenamiento */
    onSortChange?: (key: string) => void;
    /** Clave de ordenamiento actual */
    sortKey?: string;
    /** Modo de búsqueda actual */
    searchMode?: SearchMode;
    /** Callback para cambiar modo de búsqueda */
    onSearchModeChange?: (mode: SearchMode) => void;
}

function useWindowControls() {
    const [isMaximized, setIsMaximized] = useState(false);

    const minimize = async () => {
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const window = getCurrentWindow();
            await window.minimize();
        } catch (e) {
            console.warn('Window minimize failed:', e);
        }
    };

    const maximize = async () => {
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const window = getCurrentWindow();
            // Read the native state at click time. React state may still reflect
            // the previous window size when the user clicks twice quickly.
            const currentlyMaximized = await window.isMaximized();
            if (currentlyMaximized) {
                await window.unmaximize();
                setIsMaximized(false);
            } else {
                await window.maximize();
                setIsMaximized(true);
            }
        } catch (e) {
            console.warn('Window maximize failed:', e);
        }
    };

    const close = async () => {
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const window = getCurrentWindow();
            await window.close();
        } catch (e) {
            console.warn('Window close failed:', e);
        }
    };

    const startDragging = async () => {
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const window = getCurrentWindow();
            await window.startDragging();
        } catch (e) {
            console.warn('Window drag failed:', e);
        }
    };

    // Listen for maximize/unmaximize events
    useEffect(() => {
        let unlistenResize: (() => void) | undefined;
        let active = true;
        void (async () => {
            try {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                const currentWindow = getCurrentWindow();
                if (active) setIsMaximized(await currentWindow.isMaximized());
                unlistenResize = await currentWindow.onResized(async () => {
                    if (active) setIsMaximized(await currentWindow.isMaximized());
                });
            } catch {
                // La ejecución web no tiene controles nativos.
            }
        })();
        return () => {
            active = false;
            unlistenResize?.();
        };
    }, []);

    return { isMaximized, minimize, maximize, close, startDragging };
}

/** Barra de título nativa sin decoraciones de Windows. Vive en el shell raíz. */
export function WindowTitlebar() {
    const dragRef = useRef<HTMLDivElement>(null);
    const { isMaximized, minimize, maximize, close, startDragging } = useWindowControls();

    return (
        <div
            ref={dragRef}
            className="w-full h-10 shrink-0 flex items-center justify-between px-4 app-drag-region"
            style={{
                position: 'relative',
                zIndex: 100,
                background: 'rgba(10, 11, 16, 0.78)',
                backdropFilter: 'blur(40px)',
                WebkitBackdropFilter: 'blur(40px)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                userSelect: 'none',
            }}
            onDoubleClick={(event) => {
                if (event.target === event.currentTarget) void maximize();
            }}
            onMouseDown={(event) => {
                // Only the empty titlebar surface drags. Without this guard,
                // pressing a control also starts a drag and steals the click.
                if (event.button === 0 && event.target === event.currentTarget) {
                    void startDragging();
                }
            }}
        >
            <div className="flex items-center gap-2.5 pointer-events-none">
                <TikTokIcon size={18} className="drop-shadow-[0_0_8px_rgba(254,44,85,0.5)]" />
                <span className="font-black tracking-[0.15em] uppercase text-white/90 text-[11px]">PULSARIA</span>
            </div>

            <div className="flex items-center gap-1 pointer-events-auto app-no-drag">
                <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); void minimize(); }} title="Minimizar" aria-label="Minimizar" className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer app-no-drag">
                    <MinimizeIcon />
                </button>
                <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); void maximize(); }} title={isMaximized ? 'Restaurar' : 'Maximizar'} aria-label={isMaximized ? 'Restaurar ventana' : 'Maximizar ventana'} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer app-no-drag">
                    {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
                </button>
                <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); void close(); }} title="Cerrar" aria-label="Cerrar" className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-[#fe2c55] hover:bg-[#fe2c55]/10 transition-colors cursor-pointer app-no-drag">
                    <CloseIcon />
                </button>
            </div>
        </div>
    );
}

export function Header({
    onOpenSettings,
    activeCount = 0,
    onSearchSubmit,
    onSearchClear,
    pageConfig,
    onPageConfigChange,
    onSortChange,
    sortKey,
    searchMode = 'literal',
    isLoading = false,
}: HeaderProps) {
    const [viewMenuOpen, setViewMenuOpen] = useState(false);
    const activeSort = sortKey || pageConfig?.sortKey || 'date_desc';
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Cerrar menú al hacer clic fuera
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setViewMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Debounced search
    const onSearchSubmitRef = useRef(onSearchSubmit);
    const onSearchClearRef = useRef(onSearchClear);
    const searchModeRef = useRef<SearchMode>(searchMode);
    useEffect(() => {
        onSearchSubmitRef.current = onSearchSubmit;
        onSearchClearRef.current = onSearchClear;
        searchModeRef.current = searchMode;
    }, [onSearchSubmit, onSearchClear, searchMode]);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = query.trim();
        if (trimmed.length === 0) {
            onSearchClearRef.current?.();
            return;
        }
        if (trimmed.length < 2) return;
        debounceRef.current = setTimeout(() => {
            onSearchSubmitRef.current?.(query, searchModeRef.current);
        }, 600);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]);

    const updateConfig = (partial: Partial<PageConfig>) => {
        if (pageConfig && onPageConfigChange) {
            onPageConfigChange({ ...pageConfig, ...partial });
        }
        if (partial.sortKey && onSortChange) {
            onSortChange(partial.sortKey);
        }
    };

    return (
        <div className="w-full sticky top-0 z-50 pointer-events-none">
            {/* Header Content — Search, View/Sort, Settings */}
            <div className="w-full px-8 pt-4 pb-3 flex items-center justify-between sticky top-0 z-40 self-start pointer-events-none">
                {/* 1. Contador de Tiktoks */}
                <div
                    onClick={() => {
                        if (activeCount === 0) {
                            toast.info("Biblioteca vacía", {
                                description: "Pega un enlace en el panel izquierdo para procesar tu primer video.",
                                duration: 3500
                            });
                        } else {
                            toast.success("Biblioteca de TikTok", {
                                description: `${activeCount} videos disponibles para consulta.`,
                                duration: 3000
                            });
                        }
                    }}
                    className="h-10 flex items-center gap-2.5 px-4 pointer-events-auto relative overflow-hidden group shadow-lg cursor-pointer"
                    style={{
                        ...btnBase,
                        background: 'linear-gradient(135deg, rgba(254,44,85,0.2) 0%, rgba(37,244,238,0.2) 100%)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        boxShadow: 'inset 0 4px 15px rgba(0,0,0,0.5), inset 0 0 20px rgba(254,44,85,0.1)',
                    }}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] duration-1000 transition-all pointer-events-none" />
                    <div className="absolute top-0 bottom-0 left-0 w-[2px] bg-[#fe2c55] shadow-[0_0_10px_#fe2c55]" />
                    <div className="absolute top-0 bottom-0 right-0 w-[2px] bg-[#25f4ee] shadow-[0_0_10px_#25f4ee]" />
                    <div className="flex items-center justify-center relative scale-[1.05]">
                        <TikTokIcon size={20} className="relative z-10" />
                    </div>
                    <span className="font-black tracking-[0.2em] uppercase text-white drop-shadow-md relative z-10 text-[12px]">
                        {isLoading ? '...' : `${activeCount} TIKTOKS`}
                    </span>
                </div>

                {/* 2. Barra de Búsqueda TikTok Pink + Botón de Vista y Orden + Configuración */}
                <div className="flex items-center gap-3 pointer-events-auto">
                    {/* Search Bar TikTok Pink Estilizada y Simple */}
                    <div 
                        className="group/search relative flex items-center h-10 px-3 rounded-[14px] transition-[width] duration-300 w-10 hover:w-80 focus-within:w-80 cursor-text overflow-hidden"
                        style={{
                            height: '40px',
                            justifyContent: 'flex-start',
                            gap: '10px',
                            border: 'none',
                            background: '#fe2c55',
                            boxShadow: 'none',
                        }}
                        onClick={() => inputRef.current?.focus()}
                    >
                        <span className="flex-shrink-0 flex items-center text-white">
                            <SearchIcon />
                        </span>
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                if (e.key === 'Enter' && onSearchSubmit) {
                                    if (debounceRef.current) clearTimeout(debounceRef.current);
                                    onSearchSubmit(query, searchMode);
                                }
                            }}
                            placeholder="Buscar por contenido, autor, tema o transcripción..."
                            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-white placeholder-white/75 outline-none opacity-0 pointer-events-none transition-opacity duration-200 group-hover/search:opacity-100 group-hover/search:pointer-events-auto group-focus-within/search:opacity-100 group-focus-within/search:pointer-events-auto"
                        />
                        {query.trim().length > 0 && (
                            <button
                                type="button"
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setQuery('');
                                    if (onSearchClear) onSearchClear();
                                }}
                                className="flex-shrink-0 cursor-pointer border-none bg-transparent p-1 text-white/80 transition-colors hover:text-white"
                                title="Limpiar búsqueda"
                            >
                                <XIcon />
                            </button>
                        )}
                    </div>

                    {/* Botón y Menú Unificado: Vista y Ordenamiento */}
                    <div ref={menuRef} className="relative">
                        <motion.button
                            type="button"
                            onClick={() => setViewMenuOpen(o => !o)}
                            title="Opciones de visualización y ordenamiento"
                            style={{
                                ...btnBase,
                                width: '40px',
                                border: viewMenuOpen ? '1px solid rgba(37,244,238,0.5)' : btnBase.border,
                                background: viewMenuOpen ? 'rgba(8,18,22,0.85)' : btnBase.background,
                            }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            animate={viewMenuOpen
                                ? { boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.8), 0 0 14px rgba(37,244,238,0.25)' }
                                : { boxShadow: btnBase.boxShadow as string }
                            }
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            className="group"
                        >
                            <motion.span
                                animate={{ rotate: 0, color: viewMenuOpen ? '#25f4ee' : 'rgba(255,255,255,0.6)' }}
                                transition={{ duration: 0.2 }}
                                style={{ display: 'flex', filter: viewMenuOpen ? 'drop-shadow(0 0 8px rgba(37,244,238,0.6))' : 'none' }}
                            >
                                <ViewOrganizationIcon />
                            </motion.span>
                        </motion.button>

                        {/* Popover / Menú Desplegable de Vista y Filtros */}
                        {viewMenuOpen && (
                            <motion.div
                                className="absolute top-full right-0 mt-2 w-64 p-3.5 overflow-hidden z-50 flex flex-col gap-3 font-sans"
                                initial={{ opacity: 0, y: -8, scale: 0.96, transformOrigin: 'top right' }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                                style={{
                                    background: 'rgba(8, 10, 16, 0.96)',
                                    backdropFilter: 'blur(40px)',
                                    borderRadius: '18px',
                                    border: '1px solid rgba(37,244,238,0.18)',
                                    boxShadow: '0 25px 50px rgba(0,0,0,0.8), 0 0 0 1px rgba(37,244,238,0.08), inset 0 1px 0 rgba(255,255,255,0.08)',
                                }}
                            >
                                {/* Cabecera del Menú */}
                                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                                    <div className="flex items-center gap-2">
                                        <ViewOrganizationIcon />
                                        <span className="font-bold uppercase tracking-[0.2em] text-white/50 text-[10px]">
                                            Vista y Ordenamiento
                                        </span>
                                    </div>
                                </div>

                                {/* 1. Selector de Disposición (Layout) */}
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
                                        Disposición
                                    </span>
                                    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5">
                                        {[
                                            { id: 'grid', label: 'Grid', icon: FaTableCells },
                                            { id: 'list', label: 'Lista', icon: FaListUl },
                                            { id: 'compact', label: 'Compacto', icon: FaGrip },
                                        ].map(opt => {
                                            const Icon = opt.icon;
                                            const isSelected = (pageConfig?.layout || 'grid') === opt.id;
                                            return (
                                                <button
                                                    type="button"
                                                    key={opt.id}
                                                    onClick={() => updateConfig({ layout: opt.id as GridLayout })}
                                                    className={`py-1.5 px-1 flex items-center justify-center gap-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-[#25f4ee]/20 text-[#25f4ee] border border-[#25f4ee]/40 shadow-[0_0_10px_rgba(37,244,238,0.2)]'
                                                            : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                                                    }`}
                                                >
                                                    <Icon size={10} />
                                                    <span>{opt.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 2. Columnas en Pantalla (si el layout es Grid) */}
                                {(pageConfig?.layout || 'grid') === 'grid' && (
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
                                            Columnas
                                        </span>
                                        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5">
                                            {([0, 2, 3, 4] as GridColumns[]).map(col => {
                                                const isSelected = (pageConfig?.columns ?? 0) === col;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={col}
                                                        onClick={() => updateConfig({ columns: col })}
                                                        className={`py-1 text-[10px] font-mono font-bold rounded-lg transition-all cursor-pointer ${
                                                            isSelected
                                                                ? 'bg-[#8a5cff]/20 text-[#8a5cff] border border-[#8a5cff]/40 shadow-[0_0_10px_rgba(138,92,255,0.25)]'
                                                                : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                                                        }`}
                                                    >
                                                        {col === 0 ? 'Auto' : `${col} Col`}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 3. Criterio de Orden */}
                                <div className="flex flex-col gap-1.5 pt-1 border-t border-white/[0.04]">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
                                        Ordenar Por
                                    </span>
                                    <div className="flex flex-col gap-0.5">
                                        {SORT_OPTIONS.map(opt => {
                                            const isSelected = activeSort === opt.id;
                                            return (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    onClick={() => updateConfig({ sortKey: opt.id as SortKey })}
                                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                                                        isSelected 
                                                            ? 'bg-white/[0.06] text-[#25f4ee]' 
                                                            : 'text-white/60 hover:text-white hover:bg-white/[0.03]'
                                                    }`}
                                                >
                                                    <span className={isSelected ? 'text-[#25f4ee]' : 'text-white/40'}>
                                                        <opt.Icon />
                                                    </span>
                                                    <span className="text-xs font-semibold flex-1">
                                                        {opt.label}
                                                    </span>
                                                    {isSelected && (
                                                        <div className="w-1.5 h-1.5 rounded-full bg-[#25f4ee] shadow-[0_0_6px_#25f4ee]" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 4. Filtro Rápido: Solo Completados */}
                                <div className="pt-2 border-t border-white/[0.04]">
                                    <button
                                        type="button"
                                        onClick={() => updateConfig({ showOnlyCompleted: !(pageConfig?.showOnlyCompleted ?? true) })}
                                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 text-left transition-all cursor-pointer"
                                    >
                                        <div className="flex items-center gap-2">
                                            <FaFilter size={10} className="text-white/40" />
                                            <span className="text-xs font-medium text-white/80">
                                                Solo completados
                                            </span>
                                        </div>
                                        <div 
                                            className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all ${
                                                pageConfig?.showOnlyCompleted ?? true
                                                    ? 'bg-[#10b981]/20 border-[#10b981]/50 text-[#10b981]'
                                                    : 'border-white/20 bg-black/40'
                                            }`}
                                        >
                                            {(pageConfig?.showOnlyCompleted ?? true) && <FaCheck size={9} />}
                                        </div>
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* 3. Botón de Configuración */}
                    <motion.button
                        type="button"
                        onClick={onOpenSettings}
                        title="Configuración y Ajustes"
                        style={{
                            ...btnBase,
                            height: '40px',
                            padding: '0 14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 100%)',
                            border: '1px solid rgba(255,255,255,0.22)',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.25)',
                        }}
                        whileHover={{
                            scale: 1.04,
                            borderColor: 'rgba(37,244,238,0.6)',
                            boxShadow: '0 0 20px rgba(37,244,238,0.3), inset 0 1px 2px rgba(255,255,255,0.4)',
                        }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        className="group cursor-pointer"
                    >
                        <motion.span
                            style={{ color: '#ffffff', display: 'flex' }}
                            whileHover={{ rotate: 90, color: '#25f4ee' }}
                            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                            className="drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                        >
                            <SettingsIcon />
                        </motion.span>
                        <span className="hidden md:inline text-xs font-bold text-white tracking-wider uppercase drop-shadow-sm">
                            Configuración
                        </span>
                    </motion.button>
                </div>
            </div>
        </div>
    );
}
