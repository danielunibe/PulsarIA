import React from 'react';
import { GithubIcon } from './SvgIcons';
import {
  CURRENT_CANDIDATE,
  CURRENT_PUBLIC_RELEASE,
  PROJECT_URL,
  RELEASE_CANONICA,
  RELEASES_URL,
} from '../data/pulsariaData';

interface DownloadSectionProps {
  onOpenWhatsNew: () => void;
}

export const DownloadSection: React.FC<DownloadSectionProps> = ({ onOpenWhatsNew }) => (
  <section className="relative py-24 sm:py-32 bg-[#040406] text-white border-b border-white/[0.08]" id="descargar" data-nav="dark">
    <div className="max-w-5xl mx-auto px-4 sm:px-8">
      <div className="border border-white/10 rounded-2xl p-8 sm:p-12 bg-[#08080c]">
        <span className="text-[11px] font-mono tracking-[0.24em] uppercase text-[#25F4EE] block mb-4">Pulsaria para Windows x64</span>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Prueba la aplicación de escritorio</h2>
            <p className="text-sm sm:text-base text-white/70 leading-relaxed">
              La descarga pública documentada en el proyecto es <strong>{CURRENT_PUBLIC_RELEASE}</strong>.
              La candidata <strong>{CURRENT_CANDIDATE}</strong> continúa en preparación y no se enlaza como instalador publicado.
            </p>
            <p className="text-sm text-white/55 leading-relaxed mt-4">
              Eval.3 es una prerelease sin firma Authenticode ni updater público. Consulta la release y sus avisos antes de instalar.
            </p>
          </div>
          <div className="flex flex-col gap-3 shrink-0">
            <a href={RELEASE_CANONICA} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-white text-black font-bold text-sm hover:bg-neutral-200 transition-all">
              <GithubIcon className="w-4 h-4 text-black" />
              Ver descarga y release
              <span aria-hidden="true">↗</span>
            </a>
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="text-center text-sm text-[#25F4EE] hover:underline">Todas las versiones</a>
            <a href={`${PROJECT_URL}/blob/main/docs/INSTALL-WINDOWS.md`} target="_blank" rel="noopener noreferrer" className="text-center text-sm text-[#25F4EE] hover:underline">Guía de instalación</a>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs text-white/55">
          <span>Verifica la versión y el SHA-256 publicados en la release.</span>
          <button type="button" onClick={onOpenWhatsNew} className="text-[#25F4EE] hover:underline">Estado de la versión</button>
        </div>
      </div>
    </div>
  </section>
);
