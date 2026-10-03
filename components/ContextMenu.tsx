'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    FaArrowUpRightFromSquare,
    FaEyeSlash,
    FaGear,
    FaPlay,
    FaCopy,
    FaArrowDownWideShort,
    FaPlaylist,
    FaXmark,
} from '@/components/icon-library';

export type PulsariaContextMenuKind = 'real-card' | 'demo-card' | 'empty' | 'shell';

export type PulsariaContextMenuAction =
    | 'open'
    | 'cinema'
    | 'copy-url'
    | 'add-to-playlist'
    | 'demo-preview'
    | 'hide-demos'
    | 'quick-settings'
    | 'sort-recent';

interface ContextMenuItem {
    id: PulsariaContextMenuAction | 'separator';
    label?: string;
    description?: string;
    Icon?: typeof FaPlay;
    destructive?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    kind: PulsariaContextMenuKind;
    onAction: (action: PulsariaContextMenuAction) => void;
    onClose: () => void;
}

const MENU_ITEMS: Record<PulsariaContextMenuKind, ContextMenuItem[]> = {
    'real-card': [
        { id: 'open', label: 'Abrir ficha', description: 'Ver el contenido de la biblioteca', Icon: FaArrowUpRightFromSquare },
        { id: 'cinema', label: 'Abrir en Cinema', description: 'Continuar en vista inmersiva', Icon: FaPlay },
        { id: 'copy-url', label: 'Copiar enlace', description: 'Copiar la URL canónica', Icon: FaCopy },
        { id: 'add-to-playlist', label: 'Agregar a playlist', description: 'Guardar este contenido en una agrupación manual', Icon: FaPlaylist },
    ],
    'demo-card': [
        { id: 'demo-preview', label: 'Abrir preview DEMO', description: 'Vista estática o video del slot', Icon: FaPlay },
        { id: 'hide-demos', label: 'Ocultar ejemplos DEMO', description: 'Desactivar la capa temporal', Icon: FaEyeSlash },
    ],
    empty: [
        { id: 'quick-settings', label: 'Ajustes rápidos', description: 'Autoplay, píldora, tema y DEMO', Icon: FaGear },
        { id: 'sort-recent', label: 'Ordenar por recientes', description: 'Aplicar el orden de la biblioteca', Icon: FaArrowDownWideShort },
    ],
    shell: [
        { id: 'quick-settings', label: 'Ajustes rápidos', description: 'Preferencias visuales del shell', Icon: FaGear },
        { id: 'hide-demos', label: 'Ocultar ejemplos DEMO', description: 'Desactivar la capa temporal', Icon: FaEyeSlash },
    ],
};

function menuTitle(kind: PulsariaContextMenuKind) {
    switch (kind) {
        case 'real-card': return 'Biblioteca';
        case 'demo-card': return 'Preview temporal';
        case 'shell': return 'Pulsaria';
        default: return 'Espacio de trabajo';
    }
}

export function ContextMenu({ x, y, kind, onAction, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ left: x, top: y });
    const items = MENU_ITEMS[kind];

    useLayoutEffect(() => {
        const element = menuRef.current;
        if (!element) return;
        const margin = 12;
        setPosition({
            left: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - element.offsetWidth - margin)),
            top: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - element.offsetHeight - margin)),
        });
        const first = element.querySelector<HTMLButtonElement>('[role="menuitem"]');
        first?.focus();
    }, [x, y]);

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) onClose();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            const menuItems = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
            if (menuItems.length === 0) return;

            const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
            let nextIndex = currentIndex;
            if (event.key === 'ArrowDown') nextIndex = currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0;
            if (event.key === 'ArrowUp') nextIndex = currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = menuItems.length - 1;
            if (nextIndex !== currentIndex) {
                event.preventDefault();
                menuItems[nextIndex]?.focus();
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            role="menu"
            aria-label={`${menuTitle(kind)}: menú contextual`}
            data-context-menu="true"
            data-kind={kind}
            className="pulsaria-context-menu fixed z-[120] font-sans"
            style={{ left: position.left, top: position.top }}
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="pulsaria-context-menu__items">
                {items.map((item) => {
                    if (item.id === 'separator') return <div key="separator" className="pulsaria-context-menu__divider" />;
                    const Icon = item.Icon;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            data-action={item.id}
                            className={`pulsaria-context-menu__item${item.destructive ? ' is-destructive' : ''}`}
                            onClick={() => onAction(item.id as PulsariaContextMenuAction)}
                        >
                            <span className="pulsaria-context-menu__item-icon">
                                {Icon && <Icon size={14} />}
                            </span>
                            <span className="pulsaria-context-menu__item-copy">
                                <span className="pulsaria-context-menu__item-label">{item.label}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
