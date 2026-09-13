"use client";
import { useState, useRef, useEffect } from "react";
import { FaRobot, FaPaperPlane } from "react-icons/fa6";
import { generateChatResponse } from "@/lib/local-llm";
import type { JobRecord } from "@/hooks/use-jobs";

interface Message { role: "user" | "assistant"; content: string; }
type ChatJob = JobRecord & { transcript?: string; text?: string };

/**
 * ChatAssistantPanel — Panel de chat RAG (Retrieval-Augmented Generation).
 * 
 * Permite al usuario hacer preguntas en lenguaje natural sobre la
 * biblioteca de videos. Usa un modelo local como motor de generación
 * y envía los primeros 5 videos procesados al sidecar local.
 */
export function ChatAssistantPanel({ jobs = [] }: { jobs?: ChatJob[] }) {
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Hola, soy el asistente de investigación de Pulsaria. Pregúntame sobre tus videos transcritos y te ayudo a encontrar información." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const query = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setLoading(true);
    try {
      const completed = jobs.filter((j) => j.status === "complete");
      const contextChunks = completed.slice(0, 5).map((j) => `Título: ${j.title || j.url}
${j.transcript || j.text || ""}`).filter(Boolean);
      const response = await generateChatResponse(query, contextChunks);
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Hubo un error al generar la respuesta." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="flex flex-col gap-3 p-4 rounded-[20px] border transition-all"
      style={{
        background: 'rgba(14, 16, 22, 0.75)',
        backdropFilter: 'blur(20px)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      }}
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-[6px] bg-[#8a5cff]/20 flex items-center justify-center text-[#8a5cff]">
            <FaRobot size={11} />
          </div>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Asistente RAG</span>
        </div>
        <span
          title="La síntesis usa un modelo local. Los fragmentos no se envían a un servicio cloud."
          className="text-[8px] font-mono text-[#8a5cff] font-bold px-1.5 py-0.5 rounded bg-[#8a5cff]/10 border border-[#8a5cff]/20"
        >
          IA LOCAL · SIN NUBE
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-[140px] max-h-[220px] flex flex-col gap-2 pr-1 custom-scrollbar">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`max-w-[88%] rounded-[14px] px-3 py-2 text-[11px] leading-relaxed ${
              msg.role === "user" 
                ? "self-end bg-[#fe2c55]/20 text-white border border-[#fe2c55]/30 shadow-[0_2px_10px_rgba(254,44,85,0.15)]" 
                : "self-start bg-black/40 text-white/85 border border-white/10"
            }`}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="self-start bg-black/40 text-white/50 border border-white/10 rounded-[14px] px-3 py-2 text-[11px] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#8a5cff] animate-ping" />
            <span>Analizando transcripciones...</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }} 
          placeholder="Pregunta sobre los videos..." 
          className="flex-1 rounded-[12px] bg-black/40 border border-white/10 px-3 py-2.5 text-[11px] text-white placeholder:text-white/30 outline-none focus:border-[#8a5cff]/50 transition-colors font-medium" 
        />
        <button 
          onClick={handleSend} 
          disabled={loading || !input.trim()} 
          className="rounded-[12px] bg-[#8a5cff]/25 border border-[#8a5cff]/40 p-2.5 text-[#8a5cff] hover:bg-[#8a5cff]/40 transition-colors disabled:opacity-30 cursor-pointer shadow-sm active:scale-95"
        >
          <FaPaperPlane size={12} />
        </button>
      </div>
    </div>
  );
}
