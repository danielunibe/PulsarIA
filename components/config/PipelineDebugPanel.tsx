'use client';
import { useState } from 'react';
import { DebugSearchResult } from '../../types/semanticConfig';
import { FaTerminal, FaPlay, FaMagnifyingGlass, FaClock } from 'react-icons/fa6';

interface Props {
  actions: { debugSearch: (query: string) => Promise<DebugSearchResult> };
}

const EXAMPLE_QUERIES = [
  "tutorial de rust",
  "estrategia de marketing viral",
  "como programar inteligencia artificial",
  "musica de fondo"
];

export default function PipelineDebugPanel({ actions }: Props) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [debugResult, setDebugResult] = useState<DebugSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (forcedQuery?: string) => {
    const activeQuery = forcedQuery || query;
    if (!activeQuery.trim()) return;

    if (forcedQuery) setQuery(forcedQuery);
    
    setIsSearching(true);
    setError(null);
    try {
      const res = await actions.debugSearch(activeQuery);
      setDebugResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-xl flex flex-col hover:border-[#8a5cff]/30 transition-all duration-300">
      <div className="flex justify-between items-start mb-5">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FaTerminal className="text-[#8a5cff]" size={15} />
          Depurador de Pipeline Neuronal
        </h2>
      </div>

      <div className="space-y-4">
        {/* Search Input */}
        <div className="flex gap-2">
          <input 
            type="text" 
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Introduce una consulta para probar el pipeline semantico..."
            className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#8a5cff]/50 font-mono transition-all"
          />
          <button
            onClick={() => handleSearch()}
            disabled={isSearching || !query.trim()}
            className="bg-[#8a5cff]/20 hover:bg-[#8a5cff]/30 text-[#8a5cff] px-5 py-2.5 rounded-xl border border-[#8a5cff]/40 transition-all text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSearching ? (
              <span className="w-3.5 h-3.5 border-2 border-[#8a5cff] border-t-transparent rounded-full animate-spin" />
            ) : (
              <FaPlay size={10} />
            )}
            Ejecutar
          </button>
        </div>

        {/* Quick Example Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Ejemplos:</span>
          {EXAMPLE_QUERIES.map(q => (
            <button
              key={q}
              onClick={() => handleSearch(q)}
              className="text-[10px] bg-white/5 hover:bg-white/10 text-white/70 hover:text-white px-2.5 py-1 rounded-lg border border-white/5 transition-all"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Results Area */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl font-mono">
            Error: {error}
          </div>
        )}

        {debugResult && (
          <div className="mt-4 flex flex-col gap-3">
            
            {/* Latency Breakdown Bar */}
            <div className="grid grid-cols-4 gap-2 bg-black/50 p-3 rounded-xl border border-white/5">
              <div className="text-center border-r border-white/5">
                <div className="text-[9px] text-white/40 uppercase tracking-widest font-bold mb-0.5">Tokenizar</div>
                <div className="font-mono text-xs text-[#25f4ee] font-bold">{debugResult.embedding_time_ms.toFixed(2)}ms</div>
              </div>
              <div className="text-center border-r border-white/5">
                <div className="text-[9px] text-white/40 uppercase tracking-widest font-bold mb-0.5">ONNX Infer.</div>
                <div className="font-mono text-xs text-[#8a5cff] font-bold">{debugResult.onnx_inference_time_ms.toFixed(2)}ms</div>
              </div>
              <div className="text-center border-r border-white/5">
                <div className="text-[9px] text-white/40 uppercase tracking-widest font-bold mb-0.5">SQLite Find</div>
                <div className="font-mono text-xs text-emerald-400 font-bold">{(debugResult.sqlite_search_time_us / 1000).toFixed(4)}ms</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-white/40 uppercase tracking-widest font-bold mb-0.5">Total</div>
                <div className="font-mono text-xs text-white font-bold">{debugResult.total_time_ms.toFixed(2)}ms</div>
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-2 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
              <div className="text-[10px] text-white/40 uppercase tracking-wider font-bold py-1 border-b border-white/5 flex items-center justify-between">
                <span>Top {debugResult.results.length} Fragmentos Coincidentes</span>
              </div>
              
              {debugResult.results.length === 0 ? (
                <div className="text-center py-6 text-white/40 text-xs italic">
                  Ningun fragmento alcanzo el umbral de similitud minimo.
                </div>
              ) : debugResult.results.map((res, i) => (
                <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-1.5 hover:bg-white/[0.05] transition-all">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-white text-xs line-clamp-1 flex-1">
                      {res.title || `Video ID: ${res.video_id}`}
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-md ml-2 border ${
                      res.similarity_score > 0.6 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                        : res.similarity_score > 0.4 
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
                          : 'bg-white/5 text-white/40 border-white/10'
                    }`}>
                      Score: {res.similarity_score.toFixed(3)}
                    </span>
                  </div>
                  <p className="text-xs text-white/70 italic line-clamp-2 leading-relaxed">
                    «...{res.matched_text}...»
                  </p>
                  <div className="flex gap-2 text-[9px] text-white/30 font-mono mt-0.5">
                    <span>Chunk #{res.chunk_index}</span>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
