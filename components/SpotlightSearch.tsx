'use client';

import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { FaBrain, FaMagnifyingGlass, FaXmark } from '@/components/icon-library';
import type { SearchMode } from '@/components/Header';
import {
    formatSearchTimestamp,
    representationLabel,
    searchModeLabel,
    type UnifiedSearchResultGroup,
} from '@/lib/unified-search';

interface SpotlightSearchProps {
    open: boolean;
    query: string;
    onQueryChange: (query: string) => void;
    onSubmit: () => void;
    onClear: () => void;
    onClose: () => void;
    searchMode: SearchMode;
    isSearching: boolean;
    searchResults: UnifiedSearchResultGroup[] | null;
    searchError: string | null;
    aiAnswer: string | null;
    aiError: string | null;
    onResultClick: (result: UnifiedSearchResultGroup) => void;
}

export function SpotlightSearch({
    open,
    query,
    onQueryChange,
    onSubmit,
    onClear,
    onClose,
    searchMode,
    isSearching,
    searchResults,
    searchError,
    aiAnswer,
    aiError,
    onResultClick,
}: SpotlightSearchProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const submitRef = useRef(onSubmit);
    const lastSubmittedRef = useRef('');

    useEffect(() => {
        submitRef.current = onSubmit;
    }, [onSubmit]);

    useEffect(() => {
        if (!open) return;
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const frame = window.requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        });
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key !== 'Tab') return;
            const focusable = Array.from(
                overlayRef.current?.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
                ) ?? [],
            );
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('keydown', handleKeyDown);
            previousFocusRef.current?.focus();
            previousFocusRef.current = null;
        };
    }, [onClose, open]);

    useEffect(() => {
        const normalizedQuery = query.trim();
        if (!open || normalizedQuery.length < 2) {
            if (!normalizedQuery) lastSubmittedRef.current = '';
            return;
        }

        const requestKey = `${searchMode}:${normalizedQuery}`;
        if (lastSubmittedRef.current === requestKey) return;
        const timeout = window.setTimeout(() => {
            lastSubmittedRef.current = requestKey;
            submitRef.current();
        }, 520);
        return () => window.clearTimeout(timeout);
    }, [open, query, searchMode]);

    if (!open) return null;

    const hasResults = searchResults !== null;
    const hasFeedback = isSearching || hasResults || Boolean(searchError || aiAnswer || aiError);

    return (
        <div
            ref={overlayRef}
            className="pulsaria-spotlight-overlay fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto px-4 py-[8vh] sm:px-8"
            role="dialog"
            aria-modal="true"
            aria-label="Búsqueda Spotlight"
            aria-describedby="pulsaria-spotlight-description"
            aria-keyshortcuts="Escape"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <p id="pulsaria-spotlight-description" className="sr-only">
                Búsqueda global de Pulsaria. Escribe para buscar automáticamente y usa Escape para volver a la interfaz.
            </p>
            <motion.section
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                className="pulsaria-spotlight-surface w-full max-w-[760px] max-h-[min(76vh,760px)] overflow-hidden rounded-[28px] border border-white/15 bg-[#101116]/90 shadow-[0_30px_100px_rgba(0,0,0,0.68)] backdrop-blur-3xl"
                onMouseDown={(event: ReactMouseEvent<HTMLElement>) => event.stopPropagation()}
                aria-busy={isSearching}
            >
                <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5 sm:px-5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fe2c55]/20 text-[#ff7b91] shadow-[0_0_24px_rgba(254,44,85,0.18)]">
                        <FaMagnifyingGlass size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#ff8da2]">Spotlight</span>
                            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25">Búsqueda global</span>
                        </div>
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(event) => onQueryChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    const normalizedQuery = query.trim();
                                    if (!normalizedQuery) return;
                                    lastSubmittedRef.current = `${searchMode}:${normalizedQuery}`;
                                    onSubmit();
                                }
                            }}
                            type="search"
                            autoComplete="off"
                            placeholder="¿Qué recuerdas?"
                            aria-label="Buscar en tu biblioteca"
                            className="w-full min-w-0 bg-transparent text-base font-medium text-white outline-none placeholder:text-white/35 sm:text-lg"
                        />
                    </div>
                    {query && (
                        <button
                            type="button"
                            onClick={onClear}
                            aria-label="Limpiar búsqueda"
                            title="Limpiar búsqueda"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white"
                        >
                            <FaXmark size={14} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Salir de búsqueda"
                        title="Cerrar (Esc)"
                        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 text-[10px] font-bold uppercase tracking-wider text-white/45 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                    >
                        <span className="hidden sm:inline">Esc</span>
                        <FaXmark size={12} className="sm:hidden" />
                    </button>
                </div>

                <div className="px-4 py-3.5 sm:px-5">
                    {!hasFeedback && (
                        <div className="flex flex-col items-center gap-2 py-9 text-center">
                            <p className="text-sm font-bold text-white/75">Busca cualquier recuerdo de tu biblioteca</p>
                            <p className="max-w-md text-xs leading-relaxed text-white/40">
                                Escribe una consulta para combinar voz, metadata, entidades y enriquecimientos disponibles. El modo {searchModeLabel(searchMode)} se configura en Ajustes.
                            </p>
                            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[10px] font-mono text-white/35">
                                <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1">Ctrl/Cmd + K · abrir</span>
                                <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1">Esc · salir</span>
                            </div>
                        </div>
                    )}

                    {isSearching && (
                        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-4 text-sm text-white/75" role="status" aria-live="polite">
                            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/75 border-t-transparent" />
                            <span>Buscando en la biblioteca…</span>
                        </div>
                    )}

                    {searchError && (
                        <div role="alert" className="rounded-2xl border border-[#fe2c55]/30 bg-[#fe2c55]/10 px-4 py-3 text-xs text-[#ff9bad]">
                            No se pudo completar la búsqueda: {searchError}
                        </div>
                    )}

                    {aiError && (
                        <div role="alert" className="mt-3 rounded-2xl border border-[#fe2c55]/25 bg-[#fe2c55]/[0.08] px-4 py-3 text-xs text-[#ff9bad]">
                            La síntesis IA no está disponible: {aiError}
                        </div>
                    )}

                    {aiAnswer && (
                        <div className="mb-3 rounded-2xl border border-[#8a5cff]/30 bg-[#8a5cff]/[0.10] p-4">
                            <div className="flex items-center gap-2 text-[#c5b4ff]">
                                <FaBrain size={14} />
                                <span className="text-[10px] font-black uppercase tracking-[0.16em]">Síntesis local</span>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-white/85">{aiAnswer}</p>
                        </div>
                    )}

                    {searchResults !== null && !isSearching && !searchError && (
                        <div className="flex flex-col gap-2.5" aria-live="polite">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
                                    Coincidencias · {searchResults.length}
                                </span>
                                <span className="text-[10px] text-white/30">{searchModeLabel(searchMode)}</span>
                            </div>

                            {searchResults.length > 0 ? (
                                <div className="pulsaria-spotlight-results flex max-h-[min(48vh,420px)] flex-col gap-2 overflow-y-auto pr-1">
                                    {searchResults.map((result, index) => (
                                        <button
                                            type="button"
                                            key={`${result.jobId}-${index}`}
                                            onClick={() => onResultClick(result)}
                                            className="group flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-black/25 p-2.5 text-left transition-colors hover:border-[#25f4ee]/35 hover:bg-[#25f4ee]/[0.06]"
                                        >
                                            <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
                                                <Image
                                                    src={result.primaryMoment.matchThumbnail || result.thumbnail || '/pulsaria-icon.png'}
                                                    alt=""
                                                    fill
                                                    unoptimized
                                                    sizes="40px"
                                                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                                                />
                                            </div>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-xs font-bold text-white/90">{result.title || `Video #${result.jobId}`}</span>
                                                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-[#7df8ef]">
                                                    {formatSearchTimestamp(result.primaryMoment.startTime) && (
                                                        <span className="rounded-md bg-[#25f4ee]/[0.10] px-1.5 py-0.5 font-mono">
                                                            {formatSearchTimestamp(result.primaryMoment.startTime)}
                                                        </span>
                                                    )}
                                                    <span>{representationLabel(result.primaryMoment.representation)}</span>
                                                </span>
                                                <span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-white/45">{result.primaryMoment.excerpt}</span>
                                            </span>
                                            <span className="flex max-w-[90px] shrink-0 flex-wrap justify-end gap-1">
                                                {result.moments.length > 1 && (
                                                    <span className="rounded-md border border-white/[0.10] bg-white/[0.05] px-1.5 py-1 text-[9px] font-black text-white/55">
                                                        {result.moments.length} momentos
                                                    </span>
                                                )}
                                                {result.relationshipBadges.slice(0, 2).map((badge) => (
                                                    <span key={badge} className="rounded-md border border-[#8a5cff]/25 bg-[#8a5cff]/[0.08] px-1.5 py-1 text-[8px] font-bold text-[#c5b4ff]">
                                                        {badge}
                                                    </span>
                                                ))}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-8 text-center text-xs text-white/40">
                                    No se encontraron coincidencias en las transcripciones.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </motion.section>
        </div>
    );
}
