'use client';
import { SystemMetrics } from '../../types/semanticConfig';

export default function PerformanceMetricsCard({ metrics }: { metrics: SystemMetrics | null }) {
  if (!metrics) return null;

  return (
    <div className="bg-[#12141D] border border-gray-800 rounded-xl p-5 shadow-lg relative overflow-hidden h-full flex flex-col">
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>
      
      <div className="flex justify-between items-start mb-6 z-10">
        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Telemetry
        </h2>
        <div className="text-xs text-gray-500 font-mono">
          {metrics.total_queries_run} Queries Total
        </div>
      </div>

      <div className="space-y-4 flex-1">
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Model Load Time</span>
            <span className="font-mono text-gray-200">{metrics.model_load_time_ms.toFixed(0)} ms</span>
          </div>
          <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full bg-indigo-500 rounded-full`} style={{ width: `${Math.min((metrics.model_load_time_ms / 1000) * 100, 100)}%` }} />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Avg ONNX Latency</span>
            <span className="font-mono text-cyan-400">{metrics.average_onnx_time_ms.toFixed(2)} ms</span>
          </div>
          <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full bg-cyan-400 rounded-full`} style={{ width: `${Math.min((metrics.average_onnx_time_ms / 50) * 100, 100)}%` }} />
          </div>
          <p className="text-[10px] text-gray-600 text-right mt-0.5">Target: &lt;50ms</p>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Avg SQLite Search</span>
            <span className="font-mono text-emerald-400">{metrics.average_db_time_ms.toFixed(2)} ms</span>
          </div>
          <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full bg-emerald-400 rounded-full`} style={{ width: `${Math.min((metrics.average_db_time_ms / 2) * 100, 100)}%` }} />
          </div>
          <p className="text-[10px] text-gray-600 text-right mt-0.5">Target: &lt;1ms</p>
        </div>

        <div className="space-y-1 pt-2 border-t border-gray-800/50">
          <div className="flex justify-between text-sm">
            <span className="text-gray-300 font-medium">Avg Total Latency</span>
            <span className={`font-mono font-bold ${metrics.average_query_time_ms < 300 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {metrics.average_query_time_ms.toFixed(1)} ms
            </span>
          </div>
           <p className="text-[10px] text-gray-600 text-right mt-0.5">SLA Target: &lt;300ms</p>
        </div>
      </div>
    </div>
  );
}
