'use client';

import { useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { motion } from 'motion/react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { TIKTOK_LOGO_PATH } from '@/lib/design-tokens';
import {
    FaMinus,
    FaSquare,
    FaClone,
    FaXmark as FaClose,
} from '@/components/icon-library';
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

const MinimizeIcon = () => <FaMinus size={14} />;
const MaximizeIcon = () => <FaSquare size={13} />;
const RestoreIcon = () => <FaClone size={14} />;
const CloseIcon = () => <FaClose size={14} />;

const btnBase: CSSProperties = {
    height: '40px',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
    border: 'none',
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(30px)',
    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.08), 0 6px 14px rgba(0,0,0,0.28)',
    cursor: 'pointer',
    transform: 'scale(1)',
};

export type SearchMode = 'literal' | 'semantic';

interface HeaderProps {
    activeCount?: number;
    isLoading?: boolean;
    onOpenSearch?: () => void;
    showTikTokPill?: boolean;
    onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
}

function useWindowControls() {
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
}: HeaderProps) {
    const { t } = useI18n();
    const { isMaximized, minimize, maximize, close, windowAction } = useWindowControls();

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
                if (!(target instanceof Element) || !target.closest('button, input, a, [data-no-drag], .app-no-drag')) void maximize();
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
            <div aria-hidden="true" className="absolute inset-x-0 top-0 pointer-events-none select-none overflow-hidden" style={{ height: '96px', zIndex: 0 }}>
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(8, 10, 15, 0.88) 0%, rgba(8, 10, 15, 0.68) 34%, rgba(8, 10, 15, 0.22) 76%, transparent 100%)' }} />
                <div className="absolute inset-0" style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', maskImage: 'linear-gradient(to bottom, black 0%, black 48%, rgba(0, 0, 0, 0.6) 74%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 48%, rgba(0, 0, 0, 0.6) 74%, transparent 100%)' }} />
                <div className="absolute inset-0" style={{ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', maskImage: 'linear-gradient(to bottom, black 0%, black 34%, rgba(0, 0, 0, 0.5) 62%, transparent 88%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 34%, rgba(0, 0, 0, 0.5) 62%, transparent 88%)' }} />
                <div className="absolute inset-0" style={{ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', maskImage: 'linear-gradient(to bottom, black 0%, black 20%, rgba(0, 0, 0, 0.4) 46%, transparent 74%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 20%, rgba(0, 0, 0, 0.4) 46%, transparent 74%)' }} />
                <div className="absolute inset-0" style={{ backdropFilter: 'blur(36px)', WebkitBackdropFilter: 'blur(36px)', maskImage: 'linear-gradient(to bottom, black 0%, rgba(0, 0, 0, 0.7) 18%, transparent 48%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, rgba(0, 0, 0, 0.7) 18%, transparent 48%)' }} />
            </div>

            <div className="w-full min-w-0 px-6 pt-3 pb-3 flex items-center justify-between relative z-10 self-start pointer-events-none">
                <div className="min-w-0 flex flex-1 items-center gap-2.5 overflow-visible pointer-events-auto">
                    <div className="flex items-center gap-2.5" aria-label="Pulsaria">
                        <span className="text-sm font-black tracking-[0.18em] text-white/90">Pulsaria</span>
                    </div>
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
                        className="group header-control header-control--pill absolute left-1/2 top-3 flex h-[38px] -translate-x-1/2 items-center gap-2 rounded-[13px] px-3.5 pointer-events-auto select-none"
                        style={{ ...btnBase, height: '38px', borderRadius: '13px', background: 'linear-gradient(135deg, rgba(254,44,85,0.2) 0%, rgba(37,244,238,0.2) 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 18px rgba(0,0,0,0.28)' }}
                    >
                        <span className="flex items-center justify-center"><TikTokIcon size={19} /></span>
                        <span className="font-black tracking-[0.16em] uppercase text-white/90 relative z-10 text-[11px] whitespace-nowrap">
                            {isLoading ? 'TIKTOKS...' : `${activeCount} TIKTOKS`}
                        </span>
                    </button>
                )}

                <div className="absolute right-6 top-3 flex shrink-0 items-center gap-2 pointer-events-auto app-no-drag">
                    <div className="mx-0.5 h-4 w-px bg-white/10" aria-hidden="true" />
                    <motion.button
                        type="button"
                        onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
                        onClick={(event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); void minimize(); }}
                        title="Minimizar"
                        aria-label="Minimizar"
                        style={{ width: '38px', height: '38px', borderRadius: '13px', border: 0, background: 'linear-gradient(145deg, rgba(74,222,128,0.14), rgba(20,43,32,0.28))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 24px rgba(0,0,0,0.28)', padding: 0 }}
                        animate={windowAction === 'minimize' ? { scale: [1, 0.82, 1] } : { scale: 1 }}
                        transition={{ duration: 0.28 }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.95 }}
                        className="group header-control header-control--green flex items-center justify-center text-emerald-300/75 transition-colors hover:text-emerald-100 cursor-pointer app-no-drag header-tone-button"
                    >
                        <MinimizeIcon />
                    </motion.button>
                    <motion.button
                        type="button"
                        onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
                        onClick={(event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); void maximize(); }}
                        title={isMaximized ? 'Restaurar' : 'Maximizar'}
                        aria-label={isMaximized ? 'Restaurar ventana' : 'Maximizar ventana'}
                        style={{ width: '38px', height: '38px', borderRadius: '13px', border: 0, background: 'linear-gradient(145deg, rgba(74,222,128,0.14), rgba(20,43,32,0.28))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 24px rgba(0,0,0,0.28)', padding: 0 }}
                        animate={windowAction === 'maximize' ? { scale: [1, 1.16, 1] } : { scale: 1 }}
                        transition={{ duration: 0.28 }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.95 }}
                        className="group header-control header-control--green flex items-center justify-center text-emerald-300/75 transition-colors hover:text-emerald-100 cursor-pointer app-no-drag header-tone-button"
                    >
                        {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
                    </motion.button>
                    <motion.button
                        type="button"
                        onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
                        onClick={(event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); void close(); }}
                        title="Cerrar"
                        aria-label="Cerrar"
                        style={{ width: '38px', height: '38px', borderRadius: '13px', border: 0, background: 'linear-gradient(145deg, rgba(74,222,128,0.14), rgba(20,43,32,0.28))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 24px rgba(0,0,0,0.28)', padding: 0 }}
                        animate={windowAction === 'close' ? { scale: [1, 0.82, 1] } : { scale: 1 }}
                        transition={{ duration: 0.28 }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.95 }}
                        className="group header-control header-control--green flex items-center justify-center text-emerald-300/75 transition-colors hover:text-emerald-100 cursor-pointer app-no-drag header-tone-button"
                    >
                        <CloseIcon />
                    </motion.button>
                </div>
            </div>
        </div>
    );
}
