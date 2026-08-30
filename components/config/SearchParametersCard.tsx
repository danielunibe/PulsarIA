'use client';

import { useState } from 'react';
import { SearchConfig } from '../../types/semanticConfig';
import { FaSliders } from 'react-icons/fa6';

interface Props {
  config: SearchConfig | null;
  actions: {
    updateSearchConfig: (config: Partial<SearchConfig>) => Promise<void>;
  };
}

type SearchConfigDraft = Partial<SearchConfig>;

export default function SearchParametersCard({ config, actions }: Props) {
  const [draft, setDraft] = useState<SearchConfigDraft>({});
  const [isSaving, setIsSaving] = useState(false);

  if (!config) return null;

  // Derivar el valor visible de las props y de los cambios locales evita una
  // sincronización imperativa prop -> state y mantiene el componente actualizado
  // si el backend cambia la configuración después del primer render.
  const localConfig: SearchConfig = { ...config, ...draft };
  const hasChanges = Object.keys(draft).length > 0;

  const updateField = <K extends keyof SearchConfig>(key: K, value: SearchConfig[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setIsSaving(true);
    try {
      await actions.updateSearchConfig(draft);
      setDraft({});
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-xl flex flex-col relative overflow-hidden group hover:border-[#25f4ee]/30 transition-all duration-300">
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-[#25f4ee]/5 rounded-full blur-3xl group-hover:bg-[#25f4ee]/15 transition-all pointer-events-none" />

      <div className="flex justify-between items-start mb-5 z-10">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FaSliders className="text-[#25f4ee]" size={15} />
          Parámetros de Búsqueda
        </h2>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={`text-xs px-3.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 font-bold ${
            hasChanges && !isSaving
              ? 'bg-[#25f4ee]/20 text-[#25f4ee] border-[#25f4ee]/40 hover:bg-[#25f4ee]/30 shadow-[0_0_12px_rgba(37,244,238,0.3)]'
              : 'bg-white/5 text-white/30 border-white/5 cursor-not-allowed'
          }`}
        >
          {isSaving ? 'Guardando...' : hasChanges ? 'Aplicar Cambios' : 'Sincronizado'}
        </button>
      </div>

      <div className="space-y-3 z-10">
        <div className="grid grid-cols-2 items-center gap-3 text-xs">
          <label className="text-white/60 font-medium" htmlFor="min-score">Puntuación mínima</label>
          <input
            id="min-score"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={localConfig.min_score}
            onChange={(event) => updateField('min_score', Number(event.target.value))}
            className="bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white font-mono outline-none focus:border-[#25f4ee]/50 transition-colors"
          />

          <label className="text-white/60 font-medium" htmlFor="max-results">Límite Top-K</label>
          <input
            id="max-results"
            type="number"
            min="1"
            max="100"
            value={localConfig.max_results}
            onChange={(event) => updateField('max_results', Number(event.target.value))}
            className="bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white font-mono outline-none focus:border-[#25f4ee]/50 transition-colors"
          />

          <label className="text-white/60 font-medium" htmlFor="chunk-size">Tamaño de chunk (tokens)</label>
          <input
            id="chunk-size"
            type="number"
            min="1"
            value={localConfig.chunk_size}
            onChange={(event) => updateField('chunk_size', Number(event.target.value))}
            className="bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white font-mono outline-none focus:border-[#25f4ee]/50 transition-colors"
          />

          <label className="text-white/60 font-medium" htmlFor="chunk-overlap">Solapamiento de tokens</label>
          <input
            id="chunk-overlap"
            type="number"
            min="0"
            value={localConfig.chunk_overlap}
            onChange={(event) => updateField('chunk_overlap', Number(event.target.value))}
            className="bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white font-mono outline-none focus:border-[#25f4ee]/50 transition-colors"
          />

          <span className="text-white/60 font-medium">Métrica interna</span>
          <div className="text-xs text-[#25f4ee] font-mono font-bold bg-white/[0.03] p-2 rounded-lg border border-white/5">
            {localConfig.similarity_metric} (coseno normalizado)
          </div>
        </div>
      </div>
    </div>
  );
}
