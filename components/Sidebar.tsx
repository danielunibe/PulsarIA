'use client';

import type { ComponentType } from 'react';
import Image from 'next/image';
import { FaMagnifyingGlass } from '@/components/icon-library';

export type GlobalSection = 'home' | 'profiles' | 'activity' | 'library' | 'settings';

type RailIcon = ComponentType<{ size?: number; className?: string }>;

interface RailButtonProps {
    section: GlobalSection;
    label: string;
    activeSection: GlobalSection;
    onNavigate: (section: GlobalSection) => void;
    Icon?: RailIcon;
    artwork?: string;
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
    artwork,
    activityCount = 0,
}: RailButtonProps) {
    const isActive = activeSection === section;

    return (
        <button
            type="button"
            className={`pulsaria-nav-item${isActive ? ' pulsaria-nav-item--active' : ''}`}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(section)}
        >
            {artwork ? (
                <Image src={artwork} alt="" aria-hidden="true" width={24} height={24} unoptimized draggable={false} className="pulsaria-nav-item__artwork" />
            ) : Icon ? (
                <Icon size={16} className="pulsaria-nav-item__icon" />
            ) : null}
            {section === 'activity' && activityCount > 0 && (
                <span className="pulsaria-nav-item__badge" aria-label={`${activityCount} actividades pendientes`}>
                    {activityCount > 99 ? '99+' : activityCount}
                </span>
            )}
        </button>
    );
}

function HomeRailButton({
    label,
    activeSection,
    onNavigate,
}: {
    label: string;
    activeSection: GlobalSection;
    onNavigate: (section: GlobalSection) => void;
}) {
    const isActive = activeSection === 'home';

    return (
        <button
            type="button"
            className={`pulsaria-nav-item${isActive ? ' pulsaria-nav-item--active' : ''}`}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate('home')}
        >
            <Image src="/icons/menu/home.webp" alt="" aria-hidden="true" width={24} height={24} unoptimized draggable={false} className="pulsaria-nav-item__artwork" />
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
                <HomeRailButton label="Inicio · Kiosco" activeSection={activeSection} onNavigate={onNavigate} />
                <RailButton
                    section="profiles"
                    label="Perfiles TikTok"
                    activeSection={activeSection}
                    onNavigate={onNavigate}
                    artwork="/icons/menu/profiles.webp"
                />
                <RailButton
                    section="activity"
                    label="Actividad · Historial"
                    activeSection={activeSection}
                    onNavigate={onNavigate}
                    artwork="/icons/menu/activity.webp"
                    activityCount={activityCount}
                />
                <RailButton
                    section="library"
                    label="Playlists"
                    activeSection={activeSection}
                    onNavigate={onNavigate}
                    artwork="/icons/menu/playlist.webp"
                />
                <RailButton section="settings" label="Ajustes" activeSection={activeSection} onNavigate={onNavigate} artwork="/icons/menu/settings.webp" />
            </nav>
            <div className="pulsaria-nav-rail__footer">
                <button
                    type="button"
                    className="pulsaria-nav-cinema"
                    aria-label={canOpenCinema ? 'Abrir Cinema a pantalla completa' : 'Cinema no disponible: agrega un video primero'}
                    onClick={onOpenCinema}
                    disabled={!canOpenCinema}
                >
                    <Image src="/icons/menu/cinema.webp" alt="" aria-hidden="true" width={40} height={40} unoptimized draggable={false} className="pulsaria-nav-cinema__artwork" />
                </button>
            </div>
        </aside>
    );
}
