import React, { useState } from 'react';
import { INITIAL_CLUSTERS } from '../data/pulsariaData';

export const ClustersSection: React.FC = () => {
  const [selected, setSelected] = useState(INITIAL_CLUSTERS[0]);

  return (
    <section className="relative py-28 sm:py-36 bg-[#060608] text-white border-b border-white/[0.08]" id="clusters" data-nav="dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="max-w-3xl mb-12">
          <span className="text-[11px] font-mono tracking-[0.24em] uppercase text-[#25F4EE] block mb-4">Organización y búsqueda semántica</span>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.08] mb-5">Vuelve a encontrar ideas relacionadas por su significado.</h2>
          <p className="text-base sm:text-lg text-white/70 leading-relaxed">Pulsaria combina búsqueda textual con embeddings e índice vectorial local. Esta ilustración usa temas inventados y solo muestra una posible forma de explorar relaciones; no muestra resultados reales de la app.</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-8 border-b border-white/10 pb-4">
          {INITIAL_CLUSTERS.map((cluster) => (
            <button key={cluster.id} type="button" onClick={() => setSelected(cluster)} aria-pressed={selected.id === cluster.id} className={`px-4 py-2 rounded-xl text-sm transition-all border ${selected.id === cluster.id ? 'bg-white text-black font-semibold border-white' : 'bg-transparent text-white/65 border-white/10 hover:text-white'}`}>
              {cluster.n}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 border border-white/10 rounded-2xl p-6 sm:p-8 min-h-[330px] bg-[#08080c]">
            <div className="text-xs font-mono uppercase tracking-wider text-white/45 mb-6">Mapa conceptual · datos sintéticos</div>
            <div className="relative h-52 sm:h-60 flex items-center justify-center">
              <div className="absolute w-44 h-44 rounded-full border border-dashed border-white/10" />
              <div className="absolute w-64 h-64 rounded-full border border-white/[0.06]" />
              <div className="relative z-10 w-40 rounded-2xl border border-[#25F4EE]/40 bg-[#11171a] p-4 text-center shadow-[0_0_60px_rgba(37,244,238,.08)]">
                <span className="text-[10px] font-mono text-[#25F4EE]">TEMA</span>
                <p className="text-sm font-semibold mt-1">{selected.n}</p>
              </div>
              <span className="absolute left-[6%] top-[13%] rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-xs text-white/80">Fragmento A</span>
              <span className="absolute right-[4%] top-[19%] rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-xs text-white/80">Fragmento B</span>
              <span className="absolute bottom-[3%] left-[36%] rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-xs text-white/80">Fragmento C</span>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true">
                <line x1="20" y1="25" x2="50" y2="50" stroke="rgba(37,244,238,.28)" strokeDasharray="2 2" />
                <line x1="80" y1="28" x2="50" y2="50" stroke="rgba(37,244,238,.28)" strokeDasharray="2 2" />
                <line x1="50" y1="85" x2="50" y2="50" stroke="rgba(37,244,238,.28)" strokeDasharray="2 2" />
              </svg>
            </div>
            <p className="text-xs text-white/40 mt-4">Ilustración de relaciones. No hay puntuaciones, perfiles ni vectores de una biblioteca real.</p>
          </div>

          <aside className="lg:col-span-5 border border-white/10 rounded-2xl p-6 sm:p-8 bg-[#08080c]">
            <div className="text-xs font-mono uppercase tracking-wider text-white/45 mb-3">Ejemplo de tema</div>
            <h3 className="text-2xl font-bold mb-4">{selected.concept}</h3>
            <p className="text-sm text-white/70 leading-relaxed mb-6">{selected.aiReasoning}</p>
            <div className="border-t border-white/10 pt-5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-3">Términos ilustrativos</div>
              <div className="flex flex-wrap gap-2">
                {selected.relatedConcepts?.map((term) => <span key={term} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/70">{term}</span>)}
              </div>
            </div>
            <p className="text-xs text-white/40 mt-8">La disponibilidad y relevancia de resultados dependen del contenido procesado y de que el índice esté preparado.</p>
          </aside>
        </div>
      </div>
    </section>
  );
};
