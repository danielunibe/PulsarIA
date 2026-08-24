'use client';
import { useState, useEffect } from 'react';
import { SearchConfig } from '../../types/semanticConfig';
import { FaSliders, FaCheck } from 'react-icons/fa6';

interface Props {
  config: SearchConfig | null;
  actions: { 
    updateSearchConfig: (config: Partial<SearchConfig>) => Promise<void> 
  };
}

export default function SearchParametersCard({ config, actions }: Props) {
  const [localConfig, setLocalConfig] = useState<SearchConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (config && !localConfig) {
      setLocalConfig(config);
    }
  }, [config, localConfig]);

  if (!localConfig) return null;

  const handleSave = async () => {
    setIsSaving(true);
    await actions.updateSearchConfig(localConfig);
    setTimeout(() => setIsSaving(false), 500);
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(localConfig);

  return (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-xl flex flex-col relative overflow-hidden group hover:border-[#25f4ee]/30 transition-all duration-300">
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-[#25f4ee]/5 rounded-full blur-3xl group-hover:bg-[#25f4ee]/15 transition-all pointer-events-none" />
      
      <div className="flex justify-between items-start mb-5 z-10">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FaSliders className="text-[#25f4ee]" size={15} />
          Parametros de Busqueda
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
          <label className="text-white/60 font-medium">Min Similarity Score</label>
          <input 
            type="number" 
            step="0.01" 
            min="0" 
            max="1"
            value={localConfig.min_score}
            onChange={(e) => setLocalConfig({...localConfig, min_score: parseFloat(e.target.value)})}
            className="bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white font-mono outline-none focus:border-[#25f4ee]/50 transition-colors"
          />

          <label className="text-white/60 font-medium">Limite Top-K</label>
          <input 
            type="number" 
            min="1" 
            max="100"
            value={localConfig.max_results}
            onChange={(e) => setLocalConfig({...localConfig, max_results: parseInt(e.target.value)})}
            className="bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white font-mono outline-none focus:border-[#25f4ee]/50 transition-colors"
          />

          <label className="text-white/60 font-medium">Chunk Size (Caracteres)</label>
          <input 
            type="number" 
            value={localConfig.chunk_size}
            onChange={(e) => setLocalConfig({...localConfig, chunk_size: parseInt(e.target.value)})}
            className="bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white font-mono outline-none focus:border-[#25f4ee]/50 transition-colors"
          />

          <label className="text-white/60 font-medium">Overlap de Chunks</label>
          <input 
            type="number" 
            value={localConfig.chunk_overlap}
            onChange={(e) => setLocalConfig({...localConfig, chunk_overlap: parseInt(e.target.value)})}
            className="bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white font-mono outline-none focus:border-[#25f4ee]/50 transition-colors"
          />
          
          <label className="text-white/60 font-medium">Metrica Interna</label>
          <div className="text-xs text-[#25f4ee] font-mono font-bold bg-white/[0.03] p-2 rounded-lg border border-white/5">
            {localConfig.similarity_metric} (Coseno Normalizado)
          </div>
        </div>
      </div>
    </div>
  );
}
