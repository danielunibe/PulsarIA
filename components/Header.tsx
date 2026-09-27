'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { motion } from 'motion/react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { TIKTOK_LOGO_PATH } from '@/lib/design-tokens';
import { FaEye, FaEyeSlash, FaFilter } from '@/components/icon-library';
import { PagePanel, type PageConfig } from '@/components/PagePanel';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

export const TikTokIcon = ({ size = 28, className = '' }: { size?: number; className?: string }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        style={{ fill: 'rgba(255,255,255,0.85)' }}
    >
        <path d={TIKTOK_LOGO_PATH} />
    </svg>
);

export const PulsariaIcon = ({ size = 28, className = '' }: { size?: number; className?: string }) => (
    <Image
        src="/pulsaria-icon.png"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        unoptimized
        loading="eager"
        draggable={false}
        className={cn('pulsaria-mark object-contain', className)}
    />
);

const WindowGlyph = ({ kind }: { kind: 'minimize' | 'maximize' | 'restore' | 'close' }) => (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {kind === 'minimize' && <path d="M4 10h12" />}
        {kind === 'maximize' && <rect x="4.5" y="4.5" width="11" height="11" rx="1.5" />}
        {kind === 'restore' && <path d="M7 5h8v8M5 8v7h8" />}
        {kind === 'close' && <path d="m5 5 10 10M15 5 5 15" />}
    </svg>
);

export type { SearchMode } from '@/lib/unified-search';

interface HeaderProps {
    activeCount?: number;
    isLoading?: boolean;
    onOpenSearch?: () => void;
    showTikTokPill?: boolean;
    onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
    backgroundVisible: boolean;
    onToggleBackground: () => void;
    showDemoVideos: boolean;
    onToggleDemoVideos: () => void;
    onToggleTikTokPill: () => void;
    pageConfig: PageConfig;
    onPageConfigChange: (config: PageConfig) => void;
}

export interface WindowControlsApi {
    isMaximized: boolean;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    windowAction: 'minimize' | 'maximize' | 'close' | null;
}

export function useWindowControls(onClose?: () => Promise<void> | void): WindowControlsApi {
    const [isMaximized, setIsMaximized] = useState(false);
    const [windowAction, setWindowAction] = useState<'minimize' | 'maximize' | 'close' | null>(null);

    const markWindowAction = (action: 'minimize' | 'maximize' | 'close') => {
        setWindowAction(action);
        window.setTimeout(() => setWindowAction(null), 280);
    };

    const reportWindowError = (action: string, error: unknown) => {
        console.warn(`Window ${action} failed:`, error);
        toast.error(`No se pudo ${action} la ventana`, {
            description: 'La ventana nativa no aceptó la acción. Reinicia Pulsaria si persiste.',
            duration: 3500,
        });
    };

    const minimize = async () => {
        markWindowAction('minimize');
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().minimize();
        } catch (error) {
            reportWindowError('minimizar', error);
        }
    };

    const maximize = async () => {
        markWindowAction('maximize');
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const currentWindow = getCurrentWindow();
            await currentWindow.toggleMaximize();
            setIsMaximized(await currentWindow.isMaximized());
        } catch (error) {
            reportWindowError('maximizar', error);
        }
    };

    const close = async () => {
        markWindowAction('close');
        try {
            if (onClose) {
                await onClose();
                return;
            }
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().close();
        } catch (error) {
            reportWindowError('cerrar', error);
        }
    };

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

    return { isMaximized, minimize, maximize, close, windowAction };
}

export function WindowControls({ controls }: { controls: WindowControlsApi }) {
    const { isMaximized, minimize, maximize, close, windowAction } = controls;

    return (
        <div className="pulsaria-window-header__window-controls flex shrink-0 items-center gap-1 pointer-events-auto app-no-drag">
            <motion.button
                type="button"
                onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); void minimize(); }}
                title="Minimizar"
                aria-label="Minimizar"
                style={{ width: '36px', height: '36px', borderRadius: 0, border: 0, background: 'transparent', boxShadow: 'none', padding: 0 }}
                animate={windowAction === 'minimize' ? { scale: [1, 0.82, 1] } : { scale: 1 }}
                transition={{ duration: 0.28 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                className="pulsaria-window-control flex items-center justify-center text-white/55 transition-colors hover:text-white cursor-pointer app-no-drag"
            >
                <WindowGlyph kind="minimize" />
            </motion.button>
            <motion.button
                type="button"
                onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); void maximize(); }}
                title={isMaximized ? 'Restaurar' : 'Maximizar'}
                aria-label={isMaximized ? 'Restaurar ventana' : 'Maximizar ventana'}
                style={{ width: '36px', height: '36px', borderRadius: 0, border: 0, background: 'transparent', boxShadow: 'none', padding: 0 }}
                animate={windowAction === 'maximize' ? { scale: [1, 1.16, 1] } : { scale: 1 }}
                transition={{ duration: 0.28 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                className="pulsaria-window-control flex items-center justify-center text-white/55 transition-colors hover:text-white cursor-pointer app-no-drag"
            >
                <WindowGlyph kind={isMaximized ? 'restore' : 'maximize'} />
            </motion.button>
            <motion.button
                type="button"
                onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); void close(); }}
                title="Cerrar"
                aria-label="Cerrar"
                style={{ width: '36px', height: '36px', borderRadius: 0, border: 0, background: 'transparent', boxShadow: 'none', padding: 0 }}
                animate={windowAction === 'close' ? { scale: [1, 0.82, 1] } : { scale: 1 }}
                transition={{ duration: 0.28 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                className="pulsaria-window-control flex items-center justify-center text-white/55 transition-colors hover:text-rose-200 cursor-pointer app-no-drag"
            >
                <WindowGlyph kind="close" />
            </motion.button>
        </div>
    );
}

function startWindowDrag(event: ReactMouseEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, input, a, [data-no-drag], .app-no-drag')) return;
    void (async () => {
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().startDragging();
        } catch {
            // En navegador no existe una ventana nativa que arrastrar.
        }
    })();
}

export function Header({
    activeCount = 0,
    onOpenSearch,
    isLoading = false,
    showTikTokPill = true,
    onContextMenu,
    backgroundVisible,
    onToggleBackground,
    showDemoVideos,
    onToggleDemoVideos,
    onToggleTikTokPill,
    pageConfig,
    onPageConfigChange,
}: HeaderProps) {
    const { t } = useI18n();
    const windowControls = useWindowControls();
    const [openHeaderPanel, setOpenHeaderPanel] = useState<'visibility' | 'filters' | null>(null);
    const headerToolsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!openHeaderPanel) return;
        const onPointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !headerToolsRef.current?.contains(event.target)) {
                setOpenHeaderPanel(null);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenHeaderPanel(null);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [openHeaderPanel]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                onOpenSearch?.();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onOpenSearch]);

    return (
        <div
            data-tauri-drag-region="true"
            className="app-drag-region pulsaria-window-header w-full sticky top-0 z-50 pointer-events-auto font-sans select-none relative"
            onMouseDown={startWindowDrag}
            onDoubleClick={(event) => {
                const target = event.target;
                if (!(target instanceof Element) || !target.closest('button, input, a, [data-no-drag], .app-no-drag')) void windowControls.maximize();
            }}
            onContextMenu={(event) => {
                const target = event.target;
                if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
                if (!onContextMenu) return;
                event.preventDefault();
                event.stopPropagation();
                onContextMenu(event);
            }}
        >
            <div aria-hidden="true" className="pulsaria-window-header__wash absolute inset-x-0 top-0 pointer-events-none select-none overflow-hidden" style={{ zIndex: 0 }} />

            <div className="pulsaria-window-header__topbar w-full min-w-0 relative z-10 self-start pointer-events-none">
                <div className="pulsaria-window-header__brand min-w-0 flex items-center gap-2.5 overflow-visible pointer-events-auto">
                    <div className="flex items-center gap-2.5" aria-label="Pulsaria">
                        <span className="text-sm font-black tracking-[0.18em] text-white/90">Pulsaria</span>
                    </div>
                </div>

                <div className="pulsaria-window-header__center-tools app-no-drag" ref={headerToolsRef}>
                    <div className="pulsaria-header-tool-buttons">
                        <button
                            type="button"
                            className="pulsaria-header-tool"
                            aria-expanded={openHeaderPanel === 'visibility'}
                            aria-controls="pulsaria-visibility-popover"
                            onClick={() => setOpenHeaderPanel((current) => current === 'visibility' ? null : 'visibility')}
                        >
                            {backgroundVisible || showDemoVideos || showTikTokPill ? <FaEye size={16} /> : <FaEyeSlash size={16} />}
                            <span>Vista</span>
                        </button>
                        <button
                            type="button"
                            className="pulsaria-header-tool"
                            aria-expanded={openHeaderPanel === 'filters'}
                            aria-controls="pulsaria-filter-popover"
                            onClick={() => setOpenHeaderPanel((current) => current === 'filters' ? null : 'filters')}
                        >
                            <FaFilter size={15} />
                            <span>Filtros</span>
                        </button>
                    </div>
                    {showTikTokPill && (
                    <button
                        type="button"
                        onClick={() => {
                            if (activeCount === 0) {
                                toast.info(t('noResults'), { description: t('pasteLinks'), duration: 3500 });
                            } else {
                                toast.success(t('library'), { description: `${activeCount} ${t('library').toLowerCase()}.`, duration: 3000 });
                            }
                        }}
                        aria-label={`${activeCount} TikToks en la biblioteca`}
                        className="pulsaria-window-header__library-pill group header-control header-control--pill flex h-[38px] items-center gap-2 rounded-[13px] px-3.5 pointer-events-auto select-none"
                        style={{ height: '38px', borderRadius: '13px', background: 'linear-gradient(135deg, rgba(254,44,85,0.2) 0%, rgba(37,244,238,0.2) 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 18px rgba(0,0,0,0.28)' }}
                    >
                        <span className="flex items-center justify-center"><TikTokIcon size={19} /></span>
                        <span className="font-black tracking-[0.16em] uppercase text-white/90 relative z-10 text-[11px] whitespace-nowrap">
                            {isLoading ? 'TIKTOKS...' : `${activeCount} TIKTOKS`}
                        </span>
                    </button>
                    )}
                    {openHeaderPanel === 'visibility' && (
                        <div id="pulsaria-visibility-popover" className="pulsaria-header-popover pulsaria-header-visibility-popover" role="group" aria-label="Visibilidad de la interfaz">
                            <span className="pulsaria-header-popover__title">VISIBILIDAD</span>
                            <button type="button" aria-pressed={backgroundVisible} onClick={onToggleBackground} className="pulsaria-header-toggle">
                                <span>Fondo ambiental</span><span className={`pulsaria-header-switch${backgroundVisible ? ' is-on' : ''}`} aria-hidden="true" />
                            </button>
                            <button type="button" aria-pressed={showDemoVideos} onClick={onToggleDemoVideos} className="pulsaria-header-toggle">
                                <span>Videos de ejemplo</span><span className={`pulsaria-header-switch${showDemoVideos ? ' is-on' : ''}`} aria-hidden="true" />
                            </button>
                            <button type="button" aria-pressed={showTikTokPill} onClick={onToggleTikTokPill} className="pulsaria-header-toggle">
                                <span>Contador de TikToks</span><span className={`pulsaria-header-switch${showTikTokPill ? ' is-on' : ''}`} aria-hidden="true" />
                            </button>
                        </div>
                    )}
                    {openHeaderPanel === 'filters' && (
                        <div id="pulsaria-filter-popover" className="pulsaria-header-popover pulsaria-header-filter-popover" aria-label="Filtros de videos">
                            <PagePanel config={pageConfig} onChange={onPageConfigChange} />
                        </div>
                    )}
                </div>

                <WindowControls controls={windowControls} />
            </div>

        </div>
    );
}
