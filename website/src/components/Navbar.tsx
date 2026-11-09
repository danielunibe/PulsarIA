import React, { useEffect, useState } from 'react';
import { GithubIcon, PulsarTikTokBadgeIcon } from './SvgIcons';
import { RELEASE_CANONICA } from '../data/pulsariaData';

export const Navbar: React.FC = () => {
  const [isStuck, setIsStuck] = useState(false);
  const [isLight, setIsLight] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setIsStuck(y > 24);

      const themed = Array.from(
        document.querySelectorAll<HTMLElement>('[data-nav]')
      );
      let currentTheme = 'dark';
      for (const section of themed) {
        if (section.offsetTop <= y + 80) {
          currentTheme = section.dataset.nav || 'dark';
        }
      }
      setIsLight(currentTheme === 'light');
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetId: string
  ) => {
    e.preventDefault();
    setIsMenuOpen(false);
    const el = document.querySelector(targetId);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const navClasses = `nav ${isStuck ? 'stuck' : ''} ${isLight ? 'lt' : ''}`;
  const menuClasses = `mobile-menu ${isMenuOpen ? 'on' : ''} ${
    isLight ? 'lt' : 'dk'
  }`;

  return (
    <>
      <header className={navClasses} id="nav">
        <div className="nav-wrap nav-in">
          <a
            href="#top"
            className="brand"
            onClick={(e) => handleNavClick(e, '#top')}
            aria-label="Pulsaria - Inicio"
          >
            <PulsarTikTokBadgeIcon className="w-[30px] h-[30px] shrink-0" />
            <div className="flex items-center gap-2">
              <span className="wm">Pulsaria</span>
              <span className="tt-tag">Escritorio</span>
            </div>
          </a>

          <div className="nav-links-desktop">
            <a
              className="nl"
              href="#manifiesto"
              onClick={(e) => handleNavClick(e, '#manifiesto')}
            >
              Manifiesto
            </a>
            <a
              className="nl"
              href="#biblioteca"
              onClick={(e) => handleNavClick(e, '#biblioteca')}
            >
              Biblioteca
            </a>
            <a
              className="nl"
              href="#pipeline"
              onClick={(e) => handleNavClick(e, '#pipeline')}
            >
              Pipeline
            </a>
            <a
              className="nl"
              href="#clusters"
              onClick={(e) => handleNavClick(e, '#clusters')}
            >
              Colecciones
            </a>
            <a
              className="nl"
              href="#recuperas"
              onClick={(e) => handleNavClick(e, '#recuperas')}
            >
              Búsqueda
            </a>
            <a
              className="nl"
              href="#privacidad"
              onClick={(e) => handleNavClick(e, '#privacidad')}
            >
              Privacidad
            </a>
          </div>

          <div className="nav-actions">
            <a
              className="dl tt-btn"
              id="navDl"
              href={RELEASE_CANONICA}
              target="_blank"
              rel="noopener noreferrer"
              title="Descargar Pulsaria para Windows x64"
            >
              <GithubIcon className="w-4 h-4 shrink-0" />
              <span>
                  <span className="hidden sm:inline">Descarga Windows</span>
                <span className="sm:hidden">Descargar</span>
              </span>
            </a>

            <button
              className={`burger ${isMenuOpen ? 'on' : ''}`}
              id="burger"
              aria-label="Menú"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <div className={menuClasses} id="mobileMenu">
        <a href="#manifiesto" onClick={(e) => handleNavClick(e, '#manifiesto')}>
          Manifiesto
        </a>
        <a href="#biblioteca" onClick={(e) => handleNavClick(e, '#biblioteca')}>
          Biblioteca
        </a>
        <a href="#pipeline" onClick={(e) => handleNavClick(e, '#pipeline')}>
          Pipeline de procesamiento
        </a>
        <a href="#clusters" onClick={(e) => handleNavClick(e, '#clusters')}>
          Colecciones semánticas
        </a>
        <a href="#recuperas" onClick={(e) => handleNavClick(e, '#recuperas')}>
          Búsqueda literal & semántica
        </a>
        <a href="#privacidad" onClick={(e) => handleNavClick(e, '#privacidad')}>
          Privacidad local
        </a>
        <a href="#specs" onClick={(e) => handleNavClick(e, '#specs')}>
          Especificaciones
        </a>
        <div className="pt-3">
          <a
            className="btn tt-btn w-full justify-center"
            href={RELEASE_CANONICA}
            target="_blank"
            rel="noopener noreferrer"
          >
            <GithubIcon className="w-4 h-4" />
            <span>Descargar Pulsaria para Windows</span>
          </a>
        </div>
      </div>
    </>
  );
};
