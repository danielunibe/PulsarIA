'use client';
import { ModelStatus } from '../../types/semanticConfig';

interface Props {
  status: ModelStatus | null;
  actions: { reloadModel: () => Promise<void> };
}

export default function ModelStatusCard({ status, actions }: Props) {
  if (!status) return null;

  return (
    <div className="bg-[#12141D] border border-gray-800 rounded-xl p-5 shadow-lg flex flex-col relative overflow-hidden group">
      {/* Glassmorphic Highlights */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all"></div>
      
      <div className="flex justify-between items-start mb-6 z-10">
        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Model Status
        </h2>
        <button 
          onClick={actions.reloadModel}
          className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-md border border-gray-700 transition flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reload Native
        </button>
      </div>

      <div className="space-y-4 z-10">
        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
          <div className="text-gray-500 font-medium">Model Name</div>
          <div className="text-gray-200 font-mono truncate" title="sentence-transformers/all-MiniLM-L6-v2">all-MiniLM-L6-v2</div>

          <div className="text-gray-500 font-medium">Model Path</div>
          <div className="text-gray-200 font-mono text-xs truncate" title={status.model_path}>{status.model_path}</div>
          
          <div className="text-gray-500 font-medium">Runtime Layer</div>
          <div className="text-indigo-400 font-mono font-medium">{status.runtime}</div>

          <div className="text-gray-500 font-medium">Output Dimensions</div>
          <div className="text-gray-200 font-mono">{status.dimensions} <span className="text-gray-500">Vector</span></div>

          <div className="text-gray-500 font-medium">Tokenizer</div>
          <div className="text-gray-200">HuggingFace Bindings</div>

          <div className="text-gray-500 font-medium">Memory Usage</div>
          <div className="text-cyan-400 font-mono">{status.memory_usage}</div>
        </div>

        <div className="pt-4 mt-2 border-t border-gray-800/50 flex items-center justify-between">
          <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Cold Start Penalty</span>
          <span className="text-xs text-emerald-400 font-mono bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">ELIMINATED / HOT</span>
        </div>
      </div>
    </div>
  );
}
