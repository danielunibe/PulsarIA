"use client";
import { useState, useRef, useEffect } from "react";
import { FaRobot, FaPaperPlane } from "@/components/icon-library";
import { generateChatResponse } from "@/lib/local-llm";
import { useSettings } from "@/lib/settings-context";
import { getAiProviderConfig } from "@/lib/ai-providers";
import type { JobRecord } from "@/hooks/use-jobs";

interface Message { role: "user" | "assistant"; content: string; }
type ChatJob = JobRecord & { transcript?: string; text?: string };

/**
 * ChatAssistantPanel — Panel de chat RAG (Retrieval-Augmented Generation).
 * 
 * Permite al usuario hacer preguntas en lenguaje natural sobre la
 * biblioteca de videos. La ruta de generación se configura en Ajustes → IA.
 */
export function ChatAssistantPanel({ jobs = [] }: { jobs?: ChatJob[] }) {
  const { settings } = useSettings();
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Hola, soy el asistente de investigación de Pulsaria. Pregúntame sobre tus videos transcritos y te ayudo a encontrar información." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiRoute, setAiRoute] = useState<{ profileId: string; name: string; local: boolean; status: 'loading' | 'ready' | 'error' }>({ profileId: '', name: '', local: false, status: 'loading' });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, loading]);

  useEffect(() => {
    let live = true;
    const loadRoute = () => getAiProviderConfig().then((config) => {
      if (!live) return;
      const profileId = config.assignments.assistantChat;
      if (profileId === config.localProfileId) {
        setAiRoute({ profileId, name: "Llama.cpp", local: true, status: 'ready' });
        return;
      }
      const profile = config.profiles.find((item) => item.profileId === profileId);
      setAiRoute({ profileId, name: profile?.displayName ?? "Perfil sin conexión", local: false, status: 'ready' });
    }).catch(() => {
      if (live) setAiRoute({ profileId: '', name: '', local: false, status: 'error' });
    });
    const onRouteChanged = () => {
      if (live) setAiRoute((current) => ({ ...current, status: 'loading' }));
      void loadRoute();
    };
    void loadRoute();
    window.addEventListener('pulsaria-ai-provider-changed', onRouteChanged);
    return () => {
      live = false;
      window.removeEventListener('pulsaria-ai-provider-changed', onRouteChanged);
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || loading || aiRoute.status !== 'ready') return;
    const query = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setLoading(true);
    try {
      const completed = jobs.filter((j) => j.status === "complete");
      const contextChunks = completed.slice(0, settings.analysisDepth === 'deep' ? 12 : 5).map((j) => `Título: ${j.title || j.url}
${j.transcript || j.text || ""}`).filter(Boolean);
      const response = await generateChatResponse(query, contextChunks, settings.analysisDepth, aiRoute.profileId);
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: `No fue posible generar la respuesta: ${e instanceof Error ? e.message : String(e)}` }]);
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
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Asistente RAG · {settings.analysisDepth === 'deep' ? 'ANÁLISIS PROFUNDO' : 'ESTÁNDAR'}</span>
        </div>
        <span
          title={aiRoute.status === 'ready' && aiRoute.local ? "La consulta y los fragmentos se procesan localmente." : aiRoute.status === 'ready' ? `Al enviar, ${aiRoute.name} recibirá la consulta y los títulos/transcripciones de los videos incluidos.` : 'La asignación se está verificando.'}
          className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${aiRoute.status === 'ready' && aiRoute.local ? 'text-[#8a5cff] bg-[#8a5cff]/10 border-[#8a5cff]/20' : aiRoute.status === 'ready' ? 'text-amber-200 bg-amber-200/[0.08] border-amber-200/20' : 'text-white/50 bg-white/[0.05] border-white/10'}`}
        >
          {aiRoute.status === 'loading' ? 'VERIFICANDO RUTA…' : aiRoute.status === 'error' ? 'RUTA SIN VERIFICAR' : aiRoute.local ? 'IA LOCAL · SIN NUBE' : `NUBE · ${aiRoute.name}`}
        </span>
      </div>
      <p className="px-1 text-[8px] leading-relaxed text-white/35">
        {aiRoute.status === 'loading'
          ? 'Verificando proveedor asignado antes de habilitar el envío.'
          : aiRoute.status === 'error'
            ? 'No se pudo verificar el proveedor asignado. Revisa Ajustes → IA; no se enviará la solicitud.'
            : aiRoute.local
              ? 'Al enviar, la consulta y los títulos/transcripciones disponibles se procesan en este dispositivo.'
              : `Al enviar, ${aiRoute.name} recibe la consulta y los títulos y transcripciones disponibles de hasta ${settings.analysisDepth === 'deep' ? '12' : '5'} videos completados.`}
      </p>

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
          disabled={loading || !input.trim() || aiRoute.status !== 'ready'}
          className="rounded-[12px] bg-[#8a5cff]/25 border border-[#8a5cff]/40 p-2.5 text-[#8a5cff] hover:bg-[#8a5cff]/40 transition-colors disabled:opacity-30 cursor-pointer shadow-sm active:scale-95"
        >
          <FaPaperPlane size={12} />
        </button>
      </div>
    </div>
  );
}
