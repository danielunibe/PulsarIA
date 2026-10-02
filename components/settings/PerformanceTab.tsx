'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { AnalysisDepth, PerformanceMode } from '@/lib/settings-context';
import { FaBolt, FaCheck, FaMicrochip, FaRotate, FaTriangleExclamation } from '@/components/icon-library';
import { SectionCard, SectionTitle } from './types';

export type CapabilityStateUi = 'detected' | 'available' | 'verified' | 'active' | 'fallback' | 'unavailable';

export interface AccelerationStatusUi {
    generatedAt: string;
    adapters: Array<{
        id: string;
        name: string;
        vendor: string;
        dedicated: boolean;
        driver?: string | null;
        vramTotalBytes?: number | null;
        vramUsedBytes?: number | null;
        vramAvailableBytes?: number | null;
        temperatureC?: number | null;
        utilizationPercent?: number | null;
        state: CapabilityStateUi;
        source: string;
    }>;
    powerSource: string;
    userState: string;
    idleSeconds: number;
    currentMode: PerformanceMode;
    activeAdapterId?: string | null;
    capabilities: Array<{
        name: string;
        state: CapabilityStateUi;
        reason?: string | null;
        runtimeVersion?: string | null;
        measuredMs?: number | null;
    }>;
    runtimeManifestSha256?: string | null;
    fallbackReason?: string | null;
}

export interface PerformancePolicyUi {
    mode: PerformanceMode;
    effectiveProfile: string;
    userState: string;
    powerSource: string;
    maxGpuTasks: number;
    backgroundAllowed: boolean;
    whisperComputeType: string;
    llmGpuLayers: number;
    reason: string;
    updatedAt: string;
}

interface PerformanceTabProps {
    isTauri: boolean;
    mode: PerformanceMode;
    setMode: (mode: PerformanceMode) => void;
    backgroundProcessing: boolean;
    setBackgroundProcessing: Dispatch<SetStateAction<boolean>>;
    idleThresholdSeconds: number;
    setIdleThresholdSeconds: Dispatch<SetStateAction<number>>;
    acOnlyForMaximum: boolean;
    setAcOnlyForMaximum: Dispatch<SetStateAction<boolean>>;
    preferredAdapterId: string | null;
    setPreferredAdapterId: Dispatch<SetStateAction<string | null>>;
    analysisDepth: AnalysisDepth;
    setAnalysisDepth: Dispatch<SetStateAction<AnalysisDepth>>;
    startInBackground: boolean;
    status: AccelerationStatusUi | null;
    policy: PerformancePolicyUi | null;
    benchmarkBusy: boolean;
    onBenchmark: () => void;
    onReset: () => void;
}

function formatBytes(value?: number | null) {
    if (!value || !Number.isFinite(value)) return 'No medido';
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GiB`;
    return `${Math.round(value / 1024 ** 2)} MiB`;
}

function stateLabel(state: CapabilityStateUi) {
    return {
        detected: 'Detectado',
        available: 'Disponible',
        verified: 'Verificado',
        active: 'Activo',
        fallback: 'Fallback',
        unavailable: 'No disponible',
    }[state];
}

function stateClass(state: CapabilityStateUi) {
    if (state === 'verified' || state === 'active') return 'text-emerald-300';
    if (state === 'fallback') return 'text-amber-300';
    if (state === 'unavailable') return 'text-white/35';
    return 'text-[#25f4ee]';
}

export function PerformanceTab({
    isTauri,
    mode,
    setMode,
    backgroundProcessing,
    setBackgroundProcessing,
    idleThresholdSeconds,
    setIdleThresholdSeconds,
    acOnlyForMaximum,
    setAcOnlyForMaximum,
    preferredAdapterId,
    setPreferredAdapterId,
    analysisDepth,
    setAnalysisDepth,
    startInBackground,
    status,
    policy,
    benchmarkBusy,
    onBenchmark,
    onReset,
}: PerformanceTabProps) {
    return (
        <div className="flex flex-col gap-4">
            <SectionCard className="flex flex-col gap-3">
                <SectionTitle icon={FaMicrochip} label="Aceleración y rendimiento" />
                <p className="text-[10px] leading-relaxed text-white/45">
                    Pulsaria verifica cada backend antes de activarlo. Una GPU detectada no se presenta como RTX activa si el runtime no ha ejecutado una prueba real.
                </p>
                <div className="grid grid-cols-3 gap-2">
                    {(['intelligent', 'efficient', 'maximum'] as PerformanceMode[]).map((value) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={mode === value}
                            onClick={() => setMode(value)}
                            className={`rounded-xl px-2 py-3 text-[10px] font-bold transition-colors ${mode === value ? 'bg-[#25f4ee]/15 text-[#25f4ee] border border-[#25f4ee]/25' : 'bg-white/[0.03] text-white/50 border border-transparent hover:bg-white/[0.06]'}`}
                        >
                            {value === 'intelligent' ? 'Inteligente' : value === 'efficient' ? 'Eficiente' : 'Máximo'}
                        </button>
                    ))}
                </div>
                <p className="text-[10px] text-white/35">El modo elegido se aplica al guardar los cambios.</p>
                <div className="rounded-xl bg-black/30 p-3 text-[10px] text-white/60">
                    <div className="flex items-center justify-between gap-2">
                        <span>Estado efectivo</span>
                        <strong className="text-white">{policy?.effectiveProfile ?? 'Pendiente'}</strong>
                    </div>
                    <p className="mt-1 text-white/40">{policy?.reason ?? 'Abre Pulsaria como aplicación nativa para consultar AC/batería, inactividad y runtime.'}</p>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-black/30 p-3">
                    <span><span className="block text-xs font-bold text-white/85">Procesamiento en segundo plano</span><span className="mt-0.5 block text-[10px] text-white/40">Se admite cuando el equipo está inactivo y la política lo permite.</span></span>
                    <input type="checkbox" checked={backgroundProcessing} onChange={(event) => setBackgroundProcessing(event.target.checked)} className="h-4 w-4 accent-[#25f4ee]" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-black/30 p-3">
                    <span><span className="block text-xs font-bold text-white/85">Máximo solo con corriente</span><span className="mt-0.5 block text-[10px] text-white/40">Evita cargas largas cuando Windows informa batería.</span></span>
                    <input type="checkbox" checked={acOnlyForMaximum} onChange={(event) => setAcOnlyForMaximum(event.target.checked)} className="h-4 w-4 accent-[#25f4ee]" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-black/30 p-3">
                    <span><span className="block text-xs font-bold text-white/85">Umbral de inactividad</span><span className="mt-0.5 block text-[10px] text-white/40">Segundos sin entrada antes de admitir el perfil de fondo.</span></span>
                    <input type="number" min={15} max={86400} value={idleThresholdSeconds} onChange={(event) => setIdleThresholdSeconds(Math.max(15, Math.min(86400, Number(event.target.value) || 60)))} className="w-20 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-right text-xs text-white" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <label className="rounded-xl bg-black/30 p-3">
                        <span className="block text-[10px] font-bold text-white/70">Adaptador preferido</span>
                        <select value={preferredAdapterId ?? ''} onChange={(event) => setPreferredAdapterId(event.target.value || null)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#12141a] px-2 py-1.5 text-[10px] text-white">
                            <option value="">Automático</option>
                            {(status?.adapters ?? []).map((adapter) => <option key={adapter.id} value={adapter.id}>{adapter.name}</option>)}
                        </select>
                    </label>
                    <label className="rounded-xl bg-black/30 p-3">
                        <span className="block text-[10px] font-bold text-white/70">IA local</span>
                        <select value={analysisDepth} onChange={(event) => setAnalysisDepth(event.target.value as AnalysisDepth)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#12141a] px-2 py-1.5 text-[10px] text-white">
                            <option value="standard">Análisis estándar</option>
                            <option value="deep">Análisis profundo</option>
                        </select>
                    </label>
                </div>
                <p className="text-[10px] text-white/35">Inicio oculto con Windows: {startInBackground ? 'activado' : 'desactivado'}.</p>
            </SectionCard>

            <SectionCard className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <SectionTitle icon={FaBolt} label="Diagnóstico verificable" />
                    <span className={`text-[10px] font-bold ${isTauri ? 'text-emerald-300' : 'text-white/35'}`}>{isTauri ? 'Shell nativo' : 'Solo navegador'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-xl bg-black/30 p-3"><span className="text-white/40">Energía</span><strong className="mt-1 block text-white">{status?.powerSource ?? 'No medido'}</strong></div>
                    <div className="rounded-xl bg-black/30 p-3"><span className="text-white/40">Usuario</span><strong className="mt-1 block text-white">{status?.userState ?? 'No medido'}</strong></div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!isTauri || benchmarkBusy} onClick={onBenchmark} className="rounded-xl bg-[#25f4ee]/15 px-3 py-2 text-[10px] font-bold text-[#25f4ee] disabled:cursor-not-allowed disabled:opacity-40">{benchmarkBusy ? 'Comprobando…' : 'Comprobar aceleración'}</button>
                    <button type="button" disabled={!isTauri || benchmarkBusy} onClick={onReset} className="flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-[10px] font-bold text-white/65 disabled:cursor-not-allowed disabled:opacity-40"><FaRotate size={10} /> Restablecer aprendizaje</button>
                </div>
                {status?.adapters.map((adapter) => (
                    <div key={adapter.id} className="rounded-xl border border-white/[0.07] bg-black/25 p-3 text-[10px]">
                        <div className="flex items-center justify-between gap-2"><strong className="text-white">{adapter.name}</strong><span className={stateClass(adapter.state)}>{stateLabel(adapter.state)}</span></div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-white/40"><span>{adapter.vendor}</span><span>{adapter.dedicated ? 'Dedicada' : 'Integrada'}</span><span>VRAM {formatBytes(adapter.vramTotalBytes)}</span>{adapter.driver && <span>Driver {adapter.driver}</span>}</div>
                    </div>
                ))}
                <div className="flex flex-col gap-2">
                    {(status?.capabilities ?? []).map((capability) => (
                        <div key={capability.name} className="rounded-xl bg-black/25 p-3">
                            <div className="flex items-center justify-between gap-2"><span className="text-white/75">{capability.name}</span><span className={`font-bold ${stateClass(capability.state)}`}>{capability.state === 'verified' || capability.state === 'active' ? <FaCheck size={10} className="inline mr-1" /> : capability.state === 'fallback' ? <FaTriangleExclamation size={10} className="inline mr-1" /> : null}{stateLabel(capability.state)}</span></div>
                            {capability.reason && <p className="mt-1 text-[9px] leading-relaxed text-white/38">{capability.reason}</p>}
                        </div>
                    ))}
                </div>
                {status?.fallbackReason && <p className="rounded-xl bg-amber-400/[0.08] p-3 text-[10px] leading-relaxed text-amber-200/80">{status.fallbackReason}</p>}
                {policy && <p className="text-[10px] text-white/38">GPU: hasta {policy.maxGpuTasks} tarea pesada simultánea · Whisper: {policy.whisperComputeType} · LLM: {policy.llmGpuLayers ? `${policy.llmGpuLayers} capas` : 'CPU'}.</p>}
            </SectionCard>
        </div>
    );
}
