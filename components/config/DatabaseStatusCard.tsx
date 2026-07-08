'use client';
import { DbStatus } from '../../types/semanticConfig';

interface Props {
  status: DbStatus | null;
  actions: { 
    rebuildIndex: () => Promise<void>;
    vacuumDb: () => Promise<void>;
    recomputeEmbeddings: () => Promise<void>;
  };
}

export default function DatabaseStatusCard({ status, actions }: Props) {
  if (!status) return null;

  return (
    <div className="bg-[#12141D] border border-gray-800 rounded-xl p-5 shadow-lg relative overflow-hidden group">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-all pointer-events-none"></div>
      
      <div className="flex justify-between items-start mb-6 z-10 relative">
        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
          Database Status
        </h2>
        
        <span className="px-2.5 py-0.5 rounded border text-xs font-mono font-medium 
          bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          {status.health_status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6 relative z-10">
        <div className="bg-black/40 border border-gray-800/60 rounded-lg p-3 text-center">
          <div className="text-2xl font-mono text-emerald-400 mb-1">{status.indexed_videos}</div>
          <div className="text-xs text-gray-400 uppercase tracking-wide">Indexed Videos</div>
        </div>
        <div className="bg-black/40 border border-gray-800/60 rounded-lg p-3 text-center">
          <div className="text-2xl font-mono text-emerald-400 mb-1">{status.transcript_chunks}</div>
          <div className="text-xs text-gray-400 uppercase tracking-wide">Embedding Chunks</div>
        </div>
        <div className="bg-black/40 border border-gray-800/60 rounded-lg p-3 text-center flex flex-col justify-center items-center">
          <div className="text-xs font-mono text-gray-300 truncate w-full px-2" title={status.db_path}>
            library.db
          </div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mt-1">SQLite Backend</div>
        </div>
      </div>

      <div className="border-t border-gray-800/50 pt-5 relative z-10">
        <div className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-3">Maintenance Actions</div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={actions.rebuildIndex}
            className="flex-1 min-w-[120px] text-xs bg-gray-800/50 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-md border border-gray-700 transition"
          >
            Rebuild Index
          </button>
          <button 
            onClick={actions.vacuumDb}
            className="flex-1 min-w-[120px] text-xs bg-gray-800/50 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-md border border-gray-700 transition"
          >
            Vacuum DB
          </button>
          <button 
            onClick={actions.recomputeEmbeddings}
            className="w-full text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 rounded-md border border-red-500/20 transition mt-1"
          >
            Nuke & Recompute All Embeddings
          </button>
        </div>
      </div>
    </div>
  );
}
