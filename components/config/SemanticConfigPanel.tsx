'use client';
import { useSemanticConfig } from '@/hooks/useSemanticConfig';
import ModelStatusCard from '@/components/config/ModelStatusCard';
import DatabaseStatusCard from '@/components/config/DatabaseStatusCard';
import SearchParametersCard from '@/components/config/SearchParametersCard';
import PerformanceMetricsCard from '@/components/config/PerformanceMetricsCard';
import PipelineDebugPanel from '@/components/config/PipelineDebugPanel';
import SystemLogsCard from '@/components/config/SystemLogsCard';
import { FaServer, FaRotate, FaTriangleExclamation } from 'react-icons/fa6';

export default function SemanticConfigPanel() {
  const config = useSemanticConfig();

  if (config.isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-black/60 backdrop-blur-2xl border border-white/10 shadow-2xl">
          <div className="w-10 h-10 border-3 border-[#25f4ee]/30 border-t-[#25f4ee] rounded-full animate-spin" />
          <p className="text-white/60 font-mono text-xs uppercase tracking-widest">Sincronizando Core Nativo Rust...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen text-white/90 p-6 md:p-8 overflow-y-auto custom-scrollbar">
      
      {/* Header Area */}
      <div className="flex flex-col mb-8 gap-2">
        <div className="flex items-center gap-3">
          <div className="h-7 w-1.5 rounded-full bg-gradient-to-b from-[#fe2c55] to-[#25f4ee]" />
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <span>Operador de Inteligencia</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#fe2c55] via-[#8a5cff] to-[#25f4ee]">
              Semantica ONNX
            </span>
          </h1>
          {config.modelStatus?.loaded ? (
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-mono font-bold border border-emerald-500/30 flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              ONLINE
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-mono font-bold border border-red-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              OFFLINE
            </span>
          )}
        </div>
        <p className="text-white/50 text-xs md:text-sm max-w-2xl pl-4">
          Panel de control y telemetria para el pipeline neuronal de embeddings acelerado por ONNX Runtime (<code className="text-[#25f4ee] font-mono">ort</code>) y persistencia SQLite vectorizada.
        </p>
      </div>

      {/* Failure Banner */}
      {!config.modelStatus?.loaded && (
        <div className="mb-8 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <FaTriangleExclamation className="text-red-400 mt-1 shrink-0" size={18} />
            <div>
              <h3 className="text-red-400 font-bold text-sm">Modelo de embeddings no cargado en memoria</h3>
              <p className="text-red-400/80 text-xs mt-0.5">La busqueda semantica se encuentra inactiva. Verifica la presencia de model.onnx en assets/models/all-MiniLM-L6-v2.</p>
            </div>
          </div>
          <button 
            onClick={config.actions.reloadModel}
            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl transition-all border border-red-500/30 text-xs font-bold flex items-center gap-2"
          >
            <FaRotate size={12} />
            Reintentar Carga
          </button>
        </div>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (Main Configs) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ModelStatusCard status={config.modelStatus} actions={config.actions} />
            <SearchParametersCard config={config.searchConfig} actions={config.actions} />
          </div>
          
          <PipelineDebugPanel actions={config.actions} />
          <DatabaseStatusCard status={config.dbStatus} actions={config.actions} />
        </div>

        {/* Right Column (Metrics & Logs) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <PerformanceMetricsCard metrics={config.metrics} />
          <SystemLogsCard logs={config.logs} />
        </div>

      </div>
    </div>
  );
}
