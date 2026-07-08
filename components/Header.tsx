'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { TT_PINK, TT_CYAN, TIKTOK_LOGO_PATH } from '@/types';
import { FaMagnifyingGlass, FaXmark, FaListUl, FaGear, FaClock, FaCalendarDay, FaArrowDownAZ, FaStopwatch, FaFolder, FaBox } from 'react-icons/fa6';

// ============================================================
// Header — Barra Superior del Dashboard
// Iconos: todos filled (no outline)
// ============================================================

// Icono TikTok oficial con efecto cromático
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

// ── Iconos Filled (reemplazando Lucide y Heroicons outline) ──
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
    { id: 'newest', label: 'Más Recientes', Icon: ClockFillIcon },
    { id: 'oldest', label: 'Más Antiguos', Icon: CalendarFillIcon },
    { id: 'name', label: 'Por Nombre', Icon: SortAlphaIcon },
    { id: 'duration', label: 'Por Duración', Icon: TimerFillIcon },
    { id: 'format', label: 'Por Formato', Icon: FolderFillIcon },
    { id: 'size', label: 'Por Tamaño', Icon: BoxFillIcon },
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
}

export function Header({ onOpenSettings, activeCount = 0, onSearchSubmit, onSearchClear }: HeaderProps) {
    const [searchOpen, setSearchOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);
    const [activeSort, setActiveSort] = useState('newest');
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

    return (
        <div className="w-full px-8 pt-5 pb-3 flex items-center justify-between sticky top-0 z-40 self-start pointer-events-none">
            {/* Left: Item count pill — Reestilizado TikTok BrandBoard */}
            <div
                className="h-10 flex items-center gap-2.5 px-4 pointer-events-auto relative overflow-hidden group shadow-lg drop-shadow-[0_0_15px_rgba(254,44,85,0.4)]"
                style={{
                    ...btnBase,
                    background: 'linear-gradient(135deg, rgba(254,44,85,0.2) 0%, rgba(37,244,238,0.2) 100%)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    boxShadow: 'inset 0 4px 15px rgba(0,0,0,0.5), inset 0 0 20px rgba(254,44,85,0.1)',
                }}
            >
                {/* Brillo interno animado estilo TikTok */}
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

            {/* Right: Search, Sort, Settings */}
            <div className="flex items-center gap-2.5 pointer-events-auto">

                {/* Search — con color magenta cuando está activo */}
                <motion.div
                    className="overflow-hidden active:scale-[0.97] group"
                    animate={{ width: searchOpen ? 220 : 40 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                    style={{
                        ...btnBase,
                        justifyContent: searchOpen ? 'flex-start' : 'center',
                        padding: searchOpen ? '0 14px' : '0',
                        gap: searchOpen ? '8px' : '0',
                        boxShadow: searchOpen ? '0 8px 16px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.2)' : '0 8px 16px rgba(0,0,0,0.5)',
                        border: 'none',
                        background: searchOpen ? '#fe2c55' : 'rgba(0,0,0,0.4)', // Fucsia sólido al abrir, glass cerrado.
                        backdropFilter: searchOpen ? 'none' : 'blur(30px)',
                        height: 40,
                        borderRadius: 14,
                    }}
                    onClick={() => { if (!searchOpen) setSearchOpen(true); }}
                >
                    <span
                        className="flex-shrink-0 flex items-center"
                        style={{
                            color: searchOpen ? '#ffffff' : 'rgba(255,255,255,0.5)', // Ícono blanco sobre el rosa
                            filter: 'none',
                            transition: 'color 0.3s ease, filter 0.3s ease',
                        }}
                    >
                        <SearchIcon />
                    </span>
                    <AnimatePresence>
                        {searchOpen && (
                            <motion.div
                                className="flex items-center gap-1.5 flex-1 min-w-0"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                            >
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
                                    placeholder="Buscar videos..."
                                    className="flex-1 bg-transparent outline-none font-bold min-w-0 text-white placeholder-white/50"
                                    style={{ fontSize: '12px' }}
                                />
                                <button
                                    onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        setQuery('');
                                        setSearchOpen(false);
                                        if (onSearchClear) onSearchClear();
                                    }}
                                    className="text-white/60 hover:text-white transition-colors cursor-pointer bg-transparent border-none p-0 flex-shrink-0"
                                >
                                    <XIcon />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Sort */}
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
                                        onClick={() => { setActiveSort(opt.id); setSortOpen(false); }}
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

                {/* Settings */}
                <motion.button
                    onClick={onOpenSettings}
                    style={{ ...btnBase, width: '40px' }}
                    whileHover={{ scale: 1.05, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4), 0 8px 24px rgba(0,0,0,0.6)' }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="group"
                >
                    <motion.span
                        style={{ color: 'rgba(255,255,255,0.5)', display: 'flex' }}
                        whileHover={{ color: 'rgba(255,255,255,0.9)', rotate: 60 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    >
                        <SettingsIcon />
                    </motion.span>
                </motion.button>
            </div>
        </div>
    );
}
