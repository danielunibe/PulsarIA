import React from 'react';
import { SPECS_ROWS } from '../data/pulsariaData';

export const SpecsSection: React.FC = () => (
  <section className="relative py-28 sm:py-36 bg-[#050508] text-white border-b border-white/[0.08]" id="specs" data-nav="dark">
    <div className="max-w-7xl mx-auto px-4 sm:px-8">
      <div className="max-w-3xl mb-14">
        <span className="text-[11px] font-mono tracking-[0.24em] uppercase text-[#25F4EE] block mb-4">Alcance del producto</span>
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.08] mb-5">Lo que Pulsaria hace y las condiciones que importan.</h2>
        <p className="text-base sm:text-lg text-white/70 leading-relaxed">Resumen basado en el estado operativo y la documentación del proyecto. No incluye cifras de rendimiento ni requisitos mínimos no verificados.</p>
      </div>
      <div className="border-t border-white/10 divide-y divide-white/10">
        {SPECS_ROWS.map((row) => (
          <div key={row.label} className="py-6 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-3 md:gap-8">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#25F4EE]">{row.label}</h3>
            <p className="text-sm text-white/75 leading-relaxed">{row.text}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
