'use client';
import { DbStatus } from '../../types/semanticConfig';
import { FaDatabase, FaWrench, FaTrashCan } from 'react-icons/fa6';

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
    <div className="bg-black/40 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-xl relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-all pointer-events-none" />
      
      <div className="flex justify-between items-start mb-5 z-10 relative">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FaDatabase className="text-emerald-400" size={15} />
          Almacenamiento SQLite & Indices
        </h2>
        
        <span className="px-2.5 py-0.5 rounded-lg border text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
          {status.health_status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5 relative z-10">
        <div className="bg-black/40 border border-white/5 rounded-xl p-3 text-center">
          <div className="text-xl font-mono font-black text-emerald-400 mb-0.5">{status.indexed_videos}</div>
          <div className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Videos Indexados</div>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-xl p-3 text-center">
          <div className="text-xl font-mono font-black text-[#25f4ee] mb-0.5">{status.transcript_chunks}</div>
          <div className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Chunks de Embedding</div>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-xl p-3 text-center flex flex-col justify-center items-center">
          <div className="text-xs font-mono font-bold text-white/90 truncate w-full px-1" title={status.db_path}>
            library.db
          </div>
          <div className="text-[9px] text-white/40 uppercase tracking-widest font-bold mt-0.5">SQLite WAL</div>
        </div>
      </div>

      <div className="border-t border-white/5 pt-4 relative z-10">
        <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2.5 flex items-center gap-1.5">
          <FaWrench size={10} /> Mantenimiento de Biblioteca
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={actions.rebuildIndex}
            className="flex-1 min-w-[120px] text-xs bg-white/5 hover:bg-white/10 text-white/80 hover:text-white px-3 py-2 rounded-xl border border-white/10 transition-all font-bold"
          >
            Reconstruir Indices
          </button>
          <button 
            onClick={actions.vacuumDb}
            className="flex-1 min-w-[120px] text-xs bg-white/5 hover:bg-white/10 text-white/80 hover:text-white px-3 py-2 rounded-xl border border-white/10 transition-all font-bold"
          >
            Compactar (Vacuum)
          </button>
          <button 
            onClick={actions.recomputeEmbeddings}
            className="w-full text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 rounded-xl border border-red-500/30 transition-all font-bold mt-0.5 flex items-center justify-center gap-2"
          >
            <FaTrashCan size={11} />
            Recomputar Todos los Embeddings
          </button>
        </div>
      </div>
    </div>
  );
}
