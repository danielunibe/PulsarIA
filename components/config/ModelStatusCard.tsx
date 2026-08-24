'use client';
import { ModelStatus } from '../../types/semanticConfig';
import { FaBrain, FaRotate, FaCube } from 'react-icons/fa6';

interface Props {
  status: ModelStatus | null;
  actions: { reloadModel: () => Promise<void> };
}

export default function ModelStatusCard({ status, actions }: Props) {
  if (!status) return null;

  return (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-xl flex flex-col relative overflow-hidden group hover:border-[#25f4ee]/30 transition-all duration-300">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#25f4ee]/10 rounded-full blur-3xl group-hover:bg-[#25f4ee]/20 transition-all pointer-events-none" />
      
      <div className="flex justify-between items-start mb-5 z-10">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FaBrain className="text-[#25f4ee]" size={16} />
          Estado del Modelo ONNX
        </h2>
        <button 
          onClick={actions.reloadModel}
          className="text-xs bg-white/5 hover:bg-white/10 text-white/80 hover:text-white px-3 py-1.5 rounded-xl border border-white/10 transition-all flex items-center gap-1.5 font-bold"
        >
          <FaRotate size={10} />
          Recargar
        </button>
      </div>

      <div className="space-y-3 z-10">
        <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs">
          <div className="text-white/40 font-medium">Modelo</div>
          <div className="text-white font-mono truncate font-bold" title="sentence-transformers/all-MiniLM-L6-v2">
            all-MiniLM-L6-v2
          </div>

          <div className="text-white/40 font-medium">Ubicacion</div>
          <div className="text-white/80 font-mono text-[11px] truncate" title={status.model_path}>
            {status.model_path}
          </div>
          
          <div className="text-white/40 font-medium">Runtime Nativo</div>
          <div className="text-[#25f4ee] font-mono font-bold">{status.runtime}</div>

          <div className="text-white/40 font-medium">Dimension Vectorial</div>
          <div className="text-white font-mono font-bold">
            {status.dimensions} <span className="text-white/40 font-normal">floats</span>
          </div>

          <div className="text-white/40 font-medium">Tokenizador</div>
          <div className="text-white/90">HuggingFace Bindings</div>

          <div className="text-white/40 font-medium">Uso de Memoria</div>
          <div className="text-emerald-400 font-mono font-bold">{status.memory_usage}</div>
        </div>

        <div className="pt-3 mt-1 border-t border-white/5 flex items-center justify-between">
          <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Inferencia CPU</span>
          <span className="text-[10px] text-[#25f4ee] font-mono bg-[#25f4ee]/10 px-2 py-0.5 rounded-md border border-[#25f4ee]/20 font-bold">
            WARMED UP / HOT
          </span>
        </div>
      </div>
    </div>
  );
}
