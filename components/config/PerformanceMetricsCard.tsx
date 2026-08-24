'use client';
import { SystemMetrics } from '../../types/semanticConfig';
import { FaGaugeHigh, FaBolt } from 'react-icons/fa6';

export default function PerformanceMetricsCard({ metrics }: { metrics: SystemMetrics | null }) {
  if (!metrics) return null;

  return (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-xl relative overflow-hidden h-full flex flex-col hover:border-[#8a5cff]/30 transition-all duration-300">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#8a5cff]/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="flex justify-between items-start mb-5 z-10">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FaGaugeHigh className="text-[#8a5cff]" size={15} />
          Telemetria y Latencia
        </h2>
        <div className="text-[11px] text-white/40 font-mono font-bold bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
          {metrics.total_queries_run} Consultas
        </div>
      </div>

      <div className="space-y-4 flex-1">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-white/60 font-medium">Carga Inicial de Modelo</span>
            <span className="font-mono text-white/90 font-bold">{metrics.model_load_time_ms.toFixed(0)} ms</span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-[#8a5cff] rounded-full" style={{ width: `${Math.min((metrics.model_load_time_ms / 1000) * 100, 100)}%` }} />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-white/60 font-medium">Latencia Media ONNX</span>
            <span className="font-mono text-[#25f4ee] font-bold">{metrics.average_onnx_time_ms.toFixed(2)} ms</span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-[#25f4ee] rounded-full" style={{ width: `${Math.min((metrics.average_onnx_time_ms / 50) * 100, 100)}%` }} />
          </div>
          <p className="text-[9px] text-white/30 text-right font-mono">Objetivo: &lt;50ms</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-white/60 font-medium">Busqueda Vectorial SQLite</span>
            <span className="font-mono text-emerald-400 font-bold">{metrics.average_db_time_ms.toFixed(2)} ms</span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min((metrics.average_db_time_ms / 2) * 100, 100)}%` }} />
          </div>
          <p className="text-[9px] text-white/30 text-right font-mono">Objetivo: &lt;1ms</p>
        </div>

        <div className="space-y-1.5 pt-3 border-t border-white/5">
          <div className="flex justify-between text-xs items-center">
            <span className="text-white/80 font-bold flex items-center gap-1.5">
              <FaBolt size={10} className="text-[#fe2c55]" />
              Latencia Total End-to-End
            </span>
            <span className={`font-mono font-black text-sm ${metrics.average_query_time_ms < 300 ? 'text-emerald-400' : 'text-red-400'}`}>
              {metrics.average_query_time_ms.toFixed(1)} ms
            </span>
          </div>
          <p className="text-[9px] text-white/30 text-right font-mono">SLA Garantizado: &lt;300ms</p>
        </div>
      </div>
    </div>
  );
}
