'use client';
import { useSemanticConfig } from '@/hooks/useSemanticConfig';
import ModelStatusCard from '@/components/config/ModelStatusCard';
import DatabaseStatusCard from '@/components/config/DatabaseStatusCard';
import SearchParametersCard from '@/components/config/SearchParametersCard';
import PerformanceMetricsCard from '@/components/config/PerformanceMetricsCard';
import PipelineDebugPanel from '@/components/config/PipelineDebugPanel';
import SystemLogsCard from '@/components/config/SystemLogsCard';

export default function SemanticConfigPanel() {
  const config = useSemanticConfig();

  if (config.isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8 bg-[#0B0C10]">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-gray-400 font-mono text-sm">INITIALIZING RUST BACKEND...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#0B0C10] min-h-screen text-gray-200 p-6 md:p-8 overflow-y-auto custom-scrollbar">
      
      {/* Header Area */}
      <div className="flex flex-col mb-8 gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            Semantic Search Operator
          </span>
          {config.modelStatus?.loaded ? (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-mono font-medium border border-emerald-500/20">
              ● ONLINE
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs font-mono font-medium border border-red-500/20">
              ● OFFLINE
            </span>
          )}
        </h1>
        <p className="text-gray-400 text-sm max-w-2xl">
          System control interface for the native Rust-accelerated Semantic Pipeline. 
          Powered by ONNX Runtime (`ort`) and SQLite.
        </p>
      </div>

      {/* Failure Banner */}
      {!config.modelStatus?.loaded && (
        <div className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between shadow-lg shadow-red-500/5">
          <div className="flex items-start gap-4">
            <svg className="w-6 h-6 text-red-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-red-400 font-semibold mb-1">Embedding model not loaded.</h3>
              <p className="text-red-400/80 text-sm">Semantic search is currently disabled. Verify that the ONNX assets exist in `/assets/models/all-MiniLM-L6-v2`.</p>
            </div>
          </div>
          <button 
            onClick={config.actions.reloadModel}
            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors border border-red-500/30 text-sm font-medium whitespace-nowrap"
          >
            Retry Loading
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
