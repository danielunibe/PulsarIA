import React, { useEffect, useState } from 'react';
import { SectionCard, SectionTitle, formatStorageBytes } from './types';
import { FaBrain, FaPlay, FaShieldHalved, FaWandMagicSparkles } from '@/components/icon-library';
import { JobRecord } from '@/hooks/use-jobs';
import { LocalLlmStatus } from '@/lib/local-llm';
import { toast } from 'sonner';

interface AiTabProps {
    localLlmStatus: LocalLlmStatus | null;
    localLlmBusy: boolean;
    localLlmMessage: string | null;
    prepareLocalLlm: () => Promise<void>;
    cancelLocalLlm: () => Promise<void>;
    isTauri: boolean;
    clusterThreshold: number;
    setClusterThreshold: (val: number) => void;
    clusterMinSize: number;
    setClusterMinSize: (val: number) => void;
    organizationCondition: string;
    setOrganizationCondition: (val: string) => void;
    clustersList: Array<{ count: number; jobs: JobRecord[]; playlistId?: number; name: string; keywords: string[] }>;
    clusteringLoading: boolean;
    clusteringError: string | null;
    runClustering: () => void;
    onPlaylistSelect?: (id: number | null) => void;
    onClose: () => void;
}

export function AiTab({
    localLlmStatus,
    localLlmBusy,
    localLlmMessage,
    prepareLocalLlm,
    cancelLocalLlm,
    isTauri,
    clusterThreshold,
    setClusterThreshold,
    clusterMinSize,
    setClusterMinSize,
    organizationCondition,
    setOrganizationCondition,
    clustersList,
    clusteringLoading,
    clusteringError,
    runClustering,
    onPlaylistSelect,
    onClose,
}: AiTabProps) {
    const [geminiActive, setGeminiActive] = useState<boolean | null>(null);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [isSavingKey, setIsSavingKey] = useState(false);

    useEffect(() => {
        if (!isTauri) return;
        let live = true;
        import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke<boolean>('get_gemini_status')
                .then((status) => { if (live) setGeminiActive(status); })
                .catch(() => { if (live) setGeminiActive(false); });
        });
        return () => { live = false; };
    }, [isTauri]);

    const handleSaveKey = async () => {
        const trimmedKey = apiKeyInput.trim();
        if (!isTauri || !trimmedKey) return;
        setIsSavingKey(true);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('set_gemini_api_key', { apiKey: trimmedKey });
            const status = await invoke<boolean>('get_gemini_status');
            setGeminiActive(status);
            setApiKeyInput('');
            toast.success(status ? 'Clave de Gemini configurada en memoria para esta sesión' : 'Clave de Gemini eliminada de la sesión');
        } catch (error) {
            toast.error(`Error al actualizar clave: ${error}`);
        } finally {
            setIsSavingKey(false);
        }
    };
    return (
        <div className="flex flex-col gap-4">
            {/* IA Local llama.cpp */}
            <SectionCard className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                    <SectionTitle icon={FaBrain} label="IA Local Privada" />
                    <span className="rounded-full bg-[#8a5cff]/15 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#c4b5fd]">
                        Modelo local
                    </span>
                </div>
                <p className="text-[10px] leading-relaxed text-white/50">
                    El asistente y la síntesis de esta sección usan un modelo local de llama.cpp, que se descarga solo tras tu confirmación. Si solicitas la síntesis opcional con Gemini desde una búsqueda, hasta cinco fragmentos relevantes se envían a Google.
                </p>

                <div className="flex items-center justify-between gap-3 rounded-[14px] bg-black/35 px-3.5 py-2.5 text-[9px] shadow-inner">
                    <span className="text-white/40">Estado del motor local</span>
                    <span className="font-mono font-bold text-[#c4b5fd]">{localLlmStatus?.state || 'comprobando…'}</span>
                </div>

                {localLlmStatus && localLlmStatus.totalBytes > 0 && localLlmStatus.state === 'downloading' && (
                    <div className="rounded-[14px] bg-black/35 p-3 text-[9px] text-white/60 shadow-inner">
                        Descargando {formatStorageBytes(localLlmStatus.bytesDownloaded)} de {formatStorageBytes(localLlmStatus.totalBytes)}
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div
                                className="h-full rounded-full bg-[#8a5cff] transition-all"
                                style={{ width: `${Math.min(100, (localLlmStatus.bytesDownloaded / localLlmStatus.totalBytes) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {localLlmMessage && <p role="status" className="text-[9px] leading-relaxed text-[#25f4ee]/80">{localLlmMessage}</p>}
                {localLlmStatus?.errorCode && <p role="alert" className="text-[9px] leading-relaxed text-amber-200/80">Código de estado: {localLlmStatus.errorCode}</p>}

                <div className="flex flex-wrap gap-2 pt-1">
                    <button
                        type="button"
                        disabled={!isTauri || localLlmBusy || localLlmStatus?.state === 'ready'}
                        onClick={() => void prepareLocalLlm()}
                        className="rounded-[12px] bg-[#8a5cff]/20 hover:bg-[#8a5cff]/30 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#c4b5fd] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        {localLlmBusy ? 'Preparando…' : localLlmStatus?.state === 'ready' ? 'Modelo listo' : 'Preparar modelo local'}
                    </button>
                    {localLlmStatus?.state === 'downloading' && (
                        <button
                            type="button"
                            onClick={() => void cancelLocalLlm()}
                            className="rounded-[12px] bg-amber-300/15 hover:bg-amber-300/25 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-amber-200 transition-colors"
                        >
                            Cancelar descarga
                        </button>
                    )}
                </div>
            </SectionCard>

            {/* Síntesis Nube Gemini */}
            <SectionCard className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                    <SectionTitle icon={FaWandMagicSparkles} label="Síntesis Nube Opcional (Gemini)" />
                    <span className={`rounded-full px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                        geminiActive
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-white/10 text-white/40'
                    }`}>
                        {geminiActive ? 'Activa en memoria' : 'No configurada'}
                    </span>
                </div>
                <p className="text-[10px] leading-relaxed text-white/50">
                    Opcional y manual. Si configuras una clave para tu sesión o mediante la variable de entorno <code className="font-mono text-white/80 bg-black/40 px-1 py-0.5 rounded">PULSAR_GOOGLE_API_KEY</code>, podrás solicitar respuestas avanzadas de Gemini desde el buscador Spotlight.
                </p>
                <div className="flex items-center gap-2 rounded-[14px] bg-black/35 p-2 shadow-inner">
                    <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder={geminiActive ? '•••••••••••••••• (configurada)' : 'Ingresa clave para esta sesión…'}
                        className="flex-1 bg-transparent px-2 text-xs font-mono text-white outline-none placeholder:text-white/25"
                    />
                    <button
                        type="button"
                        onClick={handleSaveKey}
                        disabled={isSavingKey || !apiKeyInput.trim()}
                        className="rounded-xl bg-white/10 hover:bg-white/15 px-3 py-1.5 text-[9px] font-bold text-white transition-all cursor-pointer disabled:opacity-40"
                    >
                        {isSavingKey ? 'Guardando…' : 'Establecer'}
                    </button>
                    {geminiActive && (
                        <button
                            type="button"
                            onClick={async () => {
                                if (!isTauri) return;
                                try {
                                    setApiKeyInput('');
                                    const { invoke } = await import('@tauri-apps/api/core');
                                    await invoke('set_gemini_api_key', { apiKey: '' });
                                    setGeminiActive(false);
                                    toast.success('Clave eliminada de la sesión');
                                } catch (error) {
                                    toast.error(`Error al actualizar clave: ${error instanceof Error ? error.message : String(error)}`);
                                }
                            }}
                            className="rounded-xl bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1.5 text-[9px] font-bold text-rose-400 transition-all cursor-pointer"
                        >
                            Quitar
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2 text-[9px] text-white/40">
                    <FaShieldHalved size={10} className="text-[#25f4ee]" />
                    <span>La clave nunca se persiste en disco ni se incluye en backups o telemetría.</span>
                </div>
            </SectionCard>

            {/* Clustering Semántico & Grafos */}
            <SectionCard className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <SectionTitle icon={FaBrain} label="Clustering & Grafos IA" />
                    <button
                        type="button"
                        aria-label="Ejecutar clustering"
                        onClick={runClustering}
                        disabled={clusteringLoading}
                        className="px-3.5 py-1.5 rounded-[12px] bg-[#8a5cff]/20 hover:bg-[#8a5cff]/30 text-[#8a5cff] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                        <FaPlay size={8} />
                        {clusteringLoading ? 'Agrupando…' : 'Ejecutar'}
                    </button>
                </div>

                <p className="text-[11px] text-white/50 leading-relaxed">
                    Organiza automáticamente colecciones temáticas por cercanía semántica entre transcripciones o especificando un criterio directo.
                </p>

                {clusteringError && (
                    <div role="alert" className="rounded-[12px] bg-[#fe2c55]/15 px-3 py-2 text-[10px] text-[#fe2c55]">
                        No se pudo ejecutar el clustering: {clusteringError}
                    </div>
                )}

                {/* Afinidad Slider */}
                <div className="p-3.5 rounded-[16px] bg-black/35 shadow-inner flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-white/60">Afinidad Mínima del Cluster</span>
                        <span className="text-xs font-mono font-bold text-[#8a5cff]">{(clusterThreshold * 100).toFixed(0)}%</span>
                    </div>
                    <input
                        type="range"
                        aria-label="Afinidad mínima del cluster"
                        min="0.5"
                        max="0.95"
                        step="0.05"
                        value={clusterThreshold}
                        onChange={(e) => setClusterThreshold(parseFloat(e.target.value))}
                        className="w-full accent-[#8a5cff] cursor-pointer"
                    />
                </div>

                {/* Tamaño Mínimo */}
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-[16px] bg-black/35 shadow-inner text-[10px] uppercase font-bold tracking-wider text-white/60 cursor-pointer">
                    <span>Tamaño mínimo del cluster</span>
                    <input
                        type="number"
                        aria-label="Tamaño mínimo del cluster"
                        min="2"
                        max="50"
                        value={clusterMinSize}
                        onChange={(e) => setClusterMinSize(Math.min(50, Math.max(2, Number(e.target.value) || 2)))}
                        className="w-16 rounded-xl bg-black/50 px-2.5 py-1 text-right text-xs font-mono text-white outline-none focus:bg-black/70 shadow-inner"
                    />
                </label>

                {/* Condición Opcional */}
                <label className="flex flex-col gap-2 p-3.5 rounded-[16px] bg-black/35 shadow-inner text-[10px] uppercase font-bold tracking-wider text-white/60 cursor-pointer">
                    <span>Condición opcional de agrupación</span>
                    <input
                        type="text"
                        aria-label="Condición para organizar videos"
                        value={organizationCondition}
                        onChange={(e) => setOrganizationCondition(e.target.value)}
                        placeholder="Ej. videos sobre tecnología y diseño"
                        className="rounded-xl bg-black/50 px-3 py-2 text-[11px] font-medium normal-case tracking-normal text-white outline-none focus:bg-black/70 placeholder:text-white/20 shadow-inner"
                    />
                </label>

                {/* Clusters List */}
                <div className="flex flex-col gap-2 pt-1">
                    <span className="text-[9px] uppercase font-bold tracking-widest text-white/40">
                        Grupos Semánticos Detectados ({clustersList.length})
                    </span>
                    {clustersList.length > 0 ? (
                        clustersList.map((group, idx) => (
                            <div key={idx} className="p-3 rounded-[14px] bg-black/35 shadow-inner flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-6 h-6 rounded-[8px] bg-[#8a5cff]/15 shrink-0 flex items-center justify-center text-[#8a5cff] font-bold text-xs">
                                        #{idx + 1}
                                    </div>
                                    <span className="text-xs font-bold text-white truncate">{group.name}</span>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <span className="text-[10px] font-mono text-[#8a5cff] font-bold">{group.count} videos</span>
                                    {group.playlistId && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onPlaylistSelect?.(group.playlistId ?? null);
                                                onClose();
                                            }}
                                            className="rounded-[8px] bg-[#25f4ee]/15 hover:bg-[#25f4ee]/25 px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-[#25f4ee] transition-colors cursor-pointer"
                                        >
                                            Ver
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="p-4 rounded-[14px] bg-black/20 text-center text-[10px] text-white/40 shadow-inner">
                            Presiona «Ejecutar» para descubrir agrupaciones temáticas basadas en tus transcripciones.
                        </div>
                    )}
                </div>
            </SectionCard>
        </div>
    );
}
