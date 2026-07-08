'use client';
import { useEffect, useRef } from 'react';
import { LogEntry } from '../../types/semanticConfig';

export default function SystemLogsCard({ logs }: { logs: LogEntry[] }) {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-[#12141D] border border-gray-800 rounded-xl p-5 shadow-lg flex flex-col h-[400px]">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          System Terminal
        </h2>
        <span className="flex h-2 w-2 relative mt-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
      </div>

      <div 
        ref={terminalRef}
        className="flex-1 bg-[#090A0F] border border-gray-800/80 rounded-lg p-3 font-mono text-[11px] overflow-y-auto custom-scrollbar flex flex-col gap-1"
      >
        {logs.length === 0 ? (
          <div className="text-gray-600 italic mt-auto">Awaiting system events...</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-3 text-gray-300 hover:bg-gray-800/40 px-1 rounded transition-colors break-words">
              <span className="text-gray-500 shrink-0 select-none">[{log.timestamp}]</span>
              <span className={`${log.message.includes('Error') || log.message.includes('Failed') ? 'text-red-400' : 
                          log.message.includes('success') ? 'text-emerald-400' : 'text-gray-300'}`}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
