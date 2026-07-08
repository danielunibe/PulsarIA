'use client';
import { useState, useEffect } from 'react';
import { SearchConfig } from '../../types/semanticConfig';

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
    setTimeout(() => setIsSaving(false), 500); // UI feedback
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(localConfig);

  return (
    <div className="bg-[#12141D] border border-gray-800 rounded-xl p-5 shadow-lg flex flex-col relative overflow-hidden group">
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl group-hover:bg-cyan-500/10 transition-all"></div>
      
      <div className="flex justify-between items-start mb-6 z-10">
        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Search Parameters
        </h2>
        <button 
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={`text-xs px-4 py-1.5 rounded-md border transition-all flex items-center gap-1.5 font-medium
            ${hasChanges && !isSaving 
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
              : 'bg-gray-800/50 text-gray-500 border-gray-800 cursor-not-allowed'
            }`}
        >
          {isSaving ? 'Saving...' : 'Apply Config'}
        </button>
      </div>

      <div className="space-y-4 z-10">
        <div className="grid grid-cols-2 items-center gap-4">
          <label className="text-sm text-gray-400 font-medium">Min Similarity Score</label>
          <input 
            type="number" 
            step="0.01" 
            min="0" 
            max="1"
            value={localConfig.min_score}
            onChange={(e) => setLocalConfig({...localConfig, min_score: parseFloat(e.target.value)})}
            className="bg-black/50 border border-gray-700 rounded p-1.5 text-sm text-gray-200 outline-none focus:border-cyan-500 transition-colors font-mono"
          />

          <label className="text-sm text-gray-400 font-medium">Max Limit (Top K)</label>
          <input 
            type="number" 
            min="1" 
            max="100"
            value={localConfig.max_results}
            onChange={(e) => setLocalConfig({...localConfig, max_results: parseInt(e.target.value)})}
            className="bg-black/50 border border-gray-700 rounded p-1.5 text-sm text-gray-200 outline-none focus:border-cyan-500 transition-colors font-mono"
          />

          <label className="text-sm text-gray-400 font-medium">Chunk Size (Words)</label>
          <input 
            type="number" 
            value={localConfig.chunk_size}
            onChange={(e) => setLocalConfig({...localConfig, chunk_size: parseInt(e.target.value)})}
            className="bg-black/50 border border-gray-700 rounded p-1.5 text-sm text-gray-200 outline-none focus:border-cyan-500 transition-colors font-mono"
          />

          <label className="text-sm text-gray-400 font-medium">Chunk Overlap</label>
          <input 
            type="number" 
            value={localConfig.chunk_overlap}
            onChange={(e) => setLocalConfig({...localConfig, chunk_overlap: parseInt(e.target.value)})}
            className="bg-black/50 border border-gray-700 rounded p-1.5 text-sm text-gray-200 outline-none focus:border-cyan-500 transition-colors font-mono"
          />
          
          <label className="text-sm text-gray-400 font-medium">Internal Metric</label>
          <div className="text-sm text-gray-500 font-mono bg-black/30 p-1.5 rounded border border-gray-800/50">
            {localConfig.similarity_metric}
          </div>
        </div>
      </div>
    </div>
  );
}
