'use client';

import Image from 'next/image';
import { useI18n } from '@/lib/i18n';

export type GlobalSection = 'home' | 'profiles' | 'activity' | 'library' | 'magazines' | 'settings';

interface RailButtonProps {
    section: GlobalSection;
    label: string;
    activeSection: GlobalSection;
    onNavigate: (section: GlobalSection) => void;
    artwork?: string;
    activityCount?: number;
}

interface RailActionProps {
    label: string;
    artwork: string;
    onClick: () => void;
    pressed?: boolean;
}

function RailButton({
    section,
    label,
    activeSection,
    onNavigate,
    artwork,
    activityCount = 0,
}: RailButtonProps) {
    const { t } = useI18n();
    const isActive = activeSection === section;

    return (
        <button
            type="button"
            className={`pulsaria-nav-item${isActive ? ' pulsaria-nav-item--active' : ''}`}
            aria-label={label}
            data-tooltip={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(section)}
        >
            {artwork ? (
                <Image src={artwork} alt="" aria-hidden="true" width={46} height={46} unoptimized draggable={false} className="pulsaria-nav-item__artwork" />
            ) : null}
            {section === 'activity' && activityCount > 0 && (
                <span className="pulsaria-nav-item__badge" aria-label={t('navPendingActivityCount', { count: activityCount })}>
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
            data-tooltip={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate('home')}
        >
            <Image src="/icons/menu/dreamcore-v2/home.png" alt="" aria-hidden="true" width={46} height={46} unoptimized draggable={false} className="pulsaria-nav-item__artwork" />
        </button>
    );
}

function RailAction({ label, artwork, onClick, pressed }: RailActionProps) {
    return (
        <button
            type="button"
            className={`pulsaria-nav-item${pressed ? ' pulsaria-nav-item--active' : ''}`}
            aria-label={label}
            data-tooltip={label}
            aria-pressed={pressed}
            onClick={onClick}
        >
            <Image src={artwork} alt="" aria-hidden="true" width={46} height={46} unoptimized draggable={false} className="pulsaria-nav-item__artwork" />
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
    const { t } = useI18n();

    return (
        <aside className="cinema-shell-panel pulsaria-nav-rail" aria-label={t('navPrimary')}>
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
            <nav className="pulsaria-nav-rail__nav" aria-label={t('navSections')}>
                <RailAction label={t('navSearch')} onClick={onOpenSearch} artwork="/icons/menu/dreamcore-v2/search.png" />
                <HomeRailButton label={t('navHome')} activeSection={activeSection} onNavigate={onNavigate} />
                <RailButton
                    section="profiles"
                    label={t('navProfiles')}
                    activeSection={activeSection}
                    onNavigate={onNavigate}
                    artwork="/icons/menu/dreamcore-v2/profiles.png"
                />
                <RailButton
                    section="activity"
                    label={t('navActivity')}
                    activeSection={activeSection}
                    onNavigate={onNavigate}
                    artwork="/icons/menu/dreamcore-v2/activity.png"
                    activityCount={activityCount}
                />
                <RailButton
                    section="library"
                    label={t('navPlaylists')}
                    activeSection={activeSection}
                    onNavigate={onNavigate}
                    artwork="/icons/menu/dreamcore-v2/playlist.png"
                />
                <RailButton
                    section="magazines"
                    label={t('navMagazines')}
                    activeSection={activeSection}
                    onNavigate={onNavigate}
                    artwork="/icons/menu/dreamcore-v2/magazines.png"
                />
                <RailButton section="settings" label={t('navSettings')} activeSection={activeSection} onNavigate={onNavigate} artwork="/icons/menu/dreamcore-v2/settings.png" />
            </nav>
            <div className="pulsaria-nav-rail__footer">
                <button
                    type="button"
                    className="pulsaria-nav-cinema"
                    aria-label={canOpenCinema ? t('navCinemaOpen') : t('navCinemaUnavailable')}
                    data-tooltip={canOpenCinema ? t('navCinemaOpen') : t('navCinemaUnavailable')}
                    onClick={onOpenCinema}
                    disabled={!canOpenCinema}
                >
                    <Image src="/icons/menu/dreamcore-v2/cinema.png" alt="" aria-hidden="true" width={46} height={46} unoptimized draggable={false} className="pulsaria-nav-cinema__artwork" />
                </button>
            </div>
        </aside>
    );
}
