'use client';
import { useState } from 'react';
import { DebugSearchResult } from '../../types/semanticConfig';

interface Props {
  actions: { debugSearch: (query: string) => Promise<DebugSearchResult> };
}

const EXAMPLE_QUERIES = [
  "video sobre marketing",
  "como crecer en tiktok",
  "ideas de contenido viral"
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
    } catch (err: any) {
      setError(err?.toString() || "Unknown error occurred");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="bg-[#12141D] border border-gray-800 rounded-xl p-5 shadow-lg flex flex-col">
      <div className="flex justify-between items-start mb-6">
        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          Pipeline Debugger
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
            placeholder="Type a query to run through the Semantic Pipeline..."
            className="flex-1 bg-black/40 border border-gray-700/80 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/30 transition-all font-mono placeholder:font-sans"
          />
          <button
            onClick={() => handleSearch()}
            disabled={isSearching || !query.trim()}
            className="bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 px-6 py-2.5 rounded-lg border border-fuchsia-500/30 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSearching ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : "Execute"}
          </button>
        </div>

        {/* Quick Example Chips */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 font-medium py-1">Examples:</span>
          {EXAMPLE_QUERIES.map(q => (
            <button
              key={q}
              onClick={() => handleSearch(q)}
              className="text-xs bg-gray-800/40 hover:bg-gray-700 text-gray-400 px-2.5 py-1 rounded-md border border-gray-700 transition"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Results Area */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg font-mono">
            Error: {error}
          </div>
        )}

        {debugResult && (
          <div className="mt-6 flex flex-col gap-4">
            
            {/* Latency Breakdown Bar */}
            <div className="grid grid-cols-4 gap-2 bg-black/30 p-3 rounded-lg border border-gray-800">
              <div className="text-center border-r border-gray-800">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Embedding</div>
                <div className="font-mono text-cyan-400">{debugResult.embedding_time_ms.toFixed(2)}ms</div>
              </div>
              <div className="text-center border-r border-gray-800">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">ONNX Infer.</div>
                <div className="font-mono text-indigo-400">{debugResult.onnx_inference_time_ms.toFixed(2)}ms</div>
              </div>
              <div className="text-center border-r border-gray-800">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">SQLite Find</div>
                <div className="font-mono text-emerald-400">{(debugResult.sqlite_search_time_us / 1000).toFixed(4)}ms</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Total Wait</div>
                <div className="font-mono text-white">{debugResult.total_time_ms.toFixed(2)}ms</div>
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
              <div className="text-xs text-gray-500 font-medium sticky top-0 bg-[#12141D] py-1 border-b border-gray-800 mb-2">
                Top {debugResult.results.length} Matches
              </div>
              
              {debugResult.results.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm italic">No transcripts met the minimum similarity threshold.</div>
              ) : debugResult.results.map((res, i) => (
                <div key={i} className="p-3 rounded-lg bg-gray-800/30 border border-gray-800/60 flex flex-col gap-1.5 hover:bg-gray-800/50 transition">
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-gray-200 text-sm line-clamp-1 flex-1">
                      {res.title || `Video ID: ${res.video_id}`}
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded ml-3 border ${res.similarity_score > 0.6 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : res.similarity_score > 0.4 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                      Score: {res.similarity_score.toFixed(3)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 italic line-clamp-2 leading-relaxed">
                    "...{res.matched_text}..."
                  </div>
                  <div className="flex gap-2 text-[10px] text-gray-600 font-mono mt-1">
                    <span>Chunk: #{res.chunk_index}</span>
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
