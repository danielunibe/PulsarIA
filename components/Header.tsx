'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { TT_PINK, TT_CYAN, TIKTOK_LOGO_PATH } from '@/types';
import { FaMagnifyingGlass, FaXmark, FaListUl, FaGear, FaClock, FaCalendarDay, FaArrowDownAZ, FaStopwatch, FaFolder, FaBox } from 'react-icons/fa6';
import { toast } from 'sonner';

const TikTokIcon = ({ size = 28, className = "" }: { size?: number, className?: string }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        style={{
            fill: 'rgba(255,255,255,0.8)',
            filter: `drop-shadow(2px 0px 0px ${TT_PINK}40) drop-shadow(-2px 0px 0px ${TT_CYAN}40)`,
        }}
    >
        <path d={TIKTOK_LOGO_PATH} />
    </svg>
);

const SearchIcon = () => <FaMagnifyingGlass size={15} />;
const XIcon = () => <FaXmark size={13} />;
const SortIcon = () => <FaListUl size={15} />;
const SettingsIcon = () => <FaGear size={15} />;
const ClockFillIcon = () => <FaClock size={14} />;
const CalendarFillIcon = () => <FaCalendarDay size={14} />;
const SortAlphaIcon = () => <FaArrowDownAZ size={14} />;
const TimerFillIcon = () => <FaStopwatch size={14} />;
const FolderFillIcon = () => <FaFolder size={14} />;
const BoxFillIcon = () => <FaBox size={14} />;

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

interface HeaderProps {
    onOpenSettings: () => void;
    activeCount?: number;
    onSearchSubmit?: (query: string) => void;
    onSearchClear?: () => void;
    onSortChange?: (key: string) => void;
    sortKey?: string;
}

export function Header({ onOpenSettings, activeCount = 0, onSearchSubmit, onSearchClear, onSortChange, sortKey }: HeaderProps) {
    const [searchOpen, setSearchOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);
    const activeSort = sortKey || 'date_desc';
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const sortRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (searchOpen) setTimeout(() => inputRef.current?.focus(), 100);
    }, [searchOpen]);

    useEffect(() => {
        if (!searchOpen) return;
        const timer = setTimeout(() => {
            if (query === '' && document.activeElement !== inputRef.current) setSearchOpen(false);
        }, 3000);
        return () => clearTimeout(timer);
    }, [searchOpen, query]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // -- Debounced semantic search: fire automatically 800ms after the user
    // stops typing a 3+ character query. Clearing the field resets the search.
    const onSearchSubmitRef = useRef(onSearchSubmit);
    const onSearchClearRef = useRef(onSearchClear);
    useEffect(() => {
        onSearchSubmitRef.current = onSearchSubmit;
        onSearchClearRef.current = onSearchClear;
    }, [onSearchSubmit, onSearchClear]);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = query.trim();
        if (trimmed.length === 0) {
            onSearchClearRef.current?.();
            return;
        }
        if (trimmed.length < 3) return;
        debounceRef.current = setTimeout(() => {
            onSearchSubmitRef.current?.(query);
        }, 800);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]);

    return (
        <div className="w-full px-8 pt-5 pb-3 flex items-center justify-between sticky top-0 z-40 self-start pointer-events-none">
            <div
                onClick={() => {
                    if (activeCount === 0) {
                        toast.info("No hay videos completados", {
                            description: "Pega un enlace en el panel izquierdo para comenzar a descargar y procesar.",
                            duration: 4000
                        });
                    } else {
                        toast.success("Biblioteca de TikTok", {
                            description: `${activeCount} videos completados y listos en la biblioteca.`,
                            duration: 3500
                        });
                    }
                }}
                className="h-10 flex items-center gap-2.5 px-4 pointer-events-auto relative overflow-hidden group shadow-lg drop-shadow-[0_0_15px_rgba(254,44,85,0.4)] cursor-pointer"
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
                <span className="font-black tracking-[0.2em] uppercase text-white drop-shadow-md relative z-10" style={{ fontSize: '12px', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                    {activeCount} TIKTOKS
                </span>
            </div>

            <div className="flex items-center gap-3 pointer-events-auto">
                {/* Simplified Intelligent AI Search Bar */}
                <div 
                    className="relative flex items-center h-10 px-3.5 rounded-[14px] transition-all duration-300 w-60 sm:w-80 md:w-96 focus-within:w-72 sm:focus-within:w-96 md:focus-within:w-[420px] focus-within:border-[#8a5cff]/50 focus-within:shadow-[0_0_20px_rgba(138,92,255,0.2)]"
                    style={{
                        ...btnBase,
                        justifyContent: 'flex-start',
                        gap: '10px',
                        cursor: 'text'
                    }}
                    onClick={() => inputRef.current?.focus()}
                >
                    <span className="flex-shrink-0 flex items-center text-[#8a5cff] drop-shadow-[0_0_8px_rgba(138,92,255,0.4)]">
                        <SearchIcon />
                    </span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === 'Enter' && onSearchSubmit) {
                                onSearchSubmit(query);
                            }
                        }}
                        placeholder="Búsqueda inteligente con IA (temas, conceptos, transcripciones)..."
                        className="flex-1 bg-transparent outline-none font-medium text-xs text-white placeholder-white/40 min-w-0"
                    />
                    {query.trim().length > 0 && (
                        <button
                            onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                setQuery('');
                                if (onSearchClear) onSearchClear();
                            }}
                            className="text-white/40 hover:text-white transition-colors cursor-pointer bg-transparent border-none p-1 flex-shrink-0"
                        >
                            <XIcon />
                        </button>
                    )}
                    <span className="hidden sm:inline-block text-[8px] font-mono font-bold uppercase tracking-wider text-[#8a5cff] bg-[#8a5cff]/10 px-1.5 py-0.5 rounded border border-[#8a5cff]/20">
                        IA RAG
                    </span>
                </div>

                <div ref={sortRef} className="relative">
                    <motion.button
                        onClick={() => setSortOpen(o => !o)}
                        style={{
                            ...btnBase,
                            width: '40px',
                            border: sortOpen ? '1px solid rgba(37,244,238,0.45)' : btnBase.border,
                            background: sortOpen ? 'rgba(5,15,15,0.8)' : btnBase.background,
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        animate={sortOpen
                            ? { boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.8), 0 0 12px rgba(37,244,238,0.2)' }
                            : { boxShadow: btnBase.boxShadow as string }
                        }
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        className="group"
                    >
                        <motion.span
                            animate={{ rotate: sortOpen ? 180 : 0, color: sortOpen ? '#25f4ee' : 'rgba(255,255,255,0.5)' }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            style={{ display: 'flex', filter: sortOpen ? 'drop-shadow(0 0 8px rgba(37,244,238,0.6))' : 'none' }}
                        >
                            <SortIcon />
                        </motion.span>
                    </motion.button>

                    <AnimatePresence>
                        {sortOpen && (
                            <motion.div
                                className="absolute top-full right-0 mt-2 w-52 overflow-hidden z-50"
                                initial={{ opacity: 0, y: -8, scale: 0.96, transformOrigin: 'top right' }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                                style={{
                                    background: 'rgba(5,7,12,0.95)',
                                    backdropFilter: 'blur(40px)',
                                    borderRadius: '16px',
                                    border: '1px solid rgba(37,244,238,0.12)',
                                    boxShadow: '0 20px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(37,244,238,0.06), inset 0 1px 0 rgba(255,255,255,0.06)',
                                }}
                            >
                                <div className="px-4 py-2.5 border-b border-white/[0.04]">
                                    <span className="font-bold uppercase tracking-[0.22em] text-white/35" style={{ fontSize: '9px' }}>Ordenar por</span>
                                </div>
                                {SORT_OPTIONS.map((opt, idx) => (
                                    <motion.button
                                        key={opt.id}
                                        onClick={() => {
                                            onSortChange?.(opt.id);
                                            setSortOpen(false);
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.04, type: 'spring', stiffness: 400, damping: 26 }}
                                        whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)', x: 2 }}
                                        style={{
                                            color: activeSort === opt.id ? '#25f4ee' : 'rgba(255,255,255,0.65)',
                                            cursor: 'pointer',
                                            border: 'none',
                                            background: 'transparent',
                                        }}
                                    >
                                        <span
                                            style={{
                                                color: activeSort === opt.id ? '#25f4ee' : 'rgba(255,255,255,0.4)',
                                                filter: activeSort === opt.id ? 'drop-shadow(0 0 6px rgba(37,244,238,0.6))' : 'none',
                                            }}
                                        >
                                            <opt.Icon />
                                        </span>
                                        <span className={cn('font-semibold tracking-wide flex-1', activeSort === opt.id ? 'text-[#25f4ee]' : '')} style={{ fontSize: '12px' }}>{opt.label}</span>
                                        {activeSort === opt.id && (
                                            <motion.div
                                                layoutId="sort-active"
                                                className="w-1.5 h-1.5 rounded-full"
                                                style={{ background: '#25f4ee', boxShadow: '0 0 8px #25f4ee' }}
                                            />
                                        )}
                                    </motion.button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <motion.button
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
    );
}
