'use client';

import type { ComponentType } from 'react';
import Image from 'next/image';
import { FaFolder, FaGear, FaHouse, FaLayerGroup, FaMagnifyingGlass, FaPlay, FaUser, FaWaveSquare } from '@/components/icon-library';

export type GlobalSection = 'home' | 'profiles' | 'activity' | 'library' | 'settings';

type RailIcon = ComponentType<{ size?: number; className?: string }>;

interface RailButtonProps {
    section: GlobalSection;
    label: string;
    activeSection: GlobalSection;
    onNavigate: (section: GlobalSection) => void;
    Icon: RailIcon;
    activityCount?: number;
}

interface RailActionProps {
    label: string;
    Icon: RailIcon;
    onClick: () => void;
    pressed?: boolean;
}

function RailButton({
    section,
    label,
    activeSection,
    onNavigate,
    Icon,
    activityCount = 0,
}: RailButtonProps) {
    const isActive = activeSection === section;

    return (
        <button
            type="button"
            className={`pulsaria-nav-item${isActive ? ' pulsaria-nav-item--active' : ''}`}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            title={label}
            data-tooltip={label}
            onClick={() => onNavigate(section)}
        >
            <Icon size={16} className="pulsaria-nav-item__icon" />
            {section === 'activity' && activityCount > 0 && (
                <span className="pulsaria-nav-item__badge" aria-label={`${activityCount} actividades pendientes`}>
                    {activityCount > 99 ? '99+' : activityCount}
                </span>
            )}
        </button>
    );
}

function RailAction({ label, Icon, onClick, pressed }: RailActionProps) {
    return (
        <button
            type="button"
            className={`pulsaria-nav-item${pressed ? ' pulsaria-nav-item--active' : ''}`}
            aria-label={label}
            aria-pressed={pressed}
            title={label}
            data-tooltip={label}
            onClick={onClick}
        >
            <Icon size={16} className="pulsaria-nav-item__icon" />
        </button>
    );
}

export interface SidebarProps {
    activeSection: GlobalSection;
    onNavigate: (section: GlobalSection) => void;
    activityCount?: number;
    onOpenSearch: () => void;
    onOpenCinema: () => void;
    canOpenCinema: boolean;
    layersVisible: boolean;
    onToggleLayers: () => void;
}

/**
 * Rail global de Pulsaria.
 *
 * El estado de sección vive en app/page.tsx; este componente solo representa
 * los accesos globales y no mezcla navegación con los paneles contextuales.
 */
export function Sidebar({
    activeSection,
    onNavigate,
    activityCount = 0,
    onOpenSearch,
    onOpenCinema,
    canOpenCinema,
    layersVisible,
    onToggleLayers,
}: SidebarProps) {
    return (
        <aside className="cinema-shell-panel pulsaria-nav-rail" aria-label="Navegación principal">
            <div className="pulsaria-nav-rail__brand" aria-label="Pulsaria">
                <Image
                    src="/pulsaria-icon.png"
                    alt="Pulsaria"
                    width={30}
                    height={30}
                    unoptimized
                    priority
                    draggable={false}
                    className="pulsaria-nav-rail__mark"
                />
            </div>
            <nav className="pulsaria-nav-rail__nav" aria-label="Secciones globales">
                <RailAction label="Buscar en la biblioteca" onClick={onOpenSearch} Icon={FaMagnifyingGlass} />
                <span className="pulsaria-nav-rail__divider" aria-hidden="true" />
                <RailButton section="home" label="Inicio" activeSection={activeSection} onNavigate={onNavigate} Icon={FaHouse} />
                <RailButton section="profiles" label="Perfiles" activeSection={activeSection} onNavigate={onNavigate} Icon={FaUser} />
                <RailButton
                    section="activity"
                    label="Actividad"
                    activeSection={activeSection}
                    onNavigate={onNavigate}
                    Icon={FaWaveSquare}
                    activityCount={activityCount}
                />
                <RailButton section="library" label="Biblioteca" activeSection={activeSection} onNavigate={onNavigate} Icon={FaFolder} />
                <span className="pulsaria-nav-rail__divider" aria-hidden="true" />
                <RailAction label="Visualización: alternar capas auxiliares" onClick={onToggleLayers} pressed={layersVisible} Icon={FaLayerGroup} />
                <RailButton section="settings" label="Ajustes" activeSection={activeSection} onNavigate={onNavigate} Icon={FaGear} />
            </nav>
            <div className="pulsaria-nav-rail__footer">
                <button
                    type="button"
                    className="pulsaria-nav-cinema"
                    aria-label="Abrir modo Cinema"
                    title={canOpenCinema ? 'Abrir modo Cinema' : 'No hay videos disponibles para Cinema'}
                    data-tooltip="Abrir modo Cinema"
                    onClick={onOpenCinema}
                    disabled={!canOpenCinema}
                >
                    <span className="pulsaria-nav-cinema__play" aria-hidden="true">
                        <FaPlay size={13} />
                    </span>
                    <span className="pulsaria-nav-cinema__label">Cinema</span>
                </button>
            </div>
        </aside>
    );
}
