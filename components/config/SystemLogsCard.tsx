'use client';
import { useEffect, useRef } from 'react';
import { LogEntry } from '../../types/semanticConfig';
import { FaTerminal } from 'react-icons/fa6';

export default function SystemLogsCard({ logs }: { logs: LogEntry[] }) {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-xl flex flex-col h-[400px] hover:border-white/20 transition-all duration-300">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FaTerminal className="text-white/60" size={14} />
          Terminal de Eventos
        </h2>
        <span className="flex h-2 w-2 relative mt-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
      </div>

      <div 
        ref={terminalRef}
        className="flex-1 bg-black/60 border border-white/5 rounded-xl p-3 font-mono text-[11px] overflow-y-auto custom-scrollbar flex flex-col gap-1.5 shadow-inner"
      >
        {logs.length === 0 ? (
          <div className="text-white/30 italic mt-auto text-xs">Esperando eventos del pipeline neuronal...</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2.5 text-white/80 hover:bg-white/5 px-1 py-0.5 rounded transition-colors break-words">
              <span className="text-white/30 shrink-0 select-none">[{log.timestamp}]</span>
              <span className={`${
                log.message.includes('Error') || log.message.includes('Failed') 
                  ? 'text-red-400 font-bold' 
                  : log.message.includes('success') || log.message.includes('complete') 
                    ? 'text-emerald-400' 
                    : 'text-white/70'
              }`}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
