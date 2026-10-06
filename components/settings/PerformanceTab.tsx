'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { AnalysisDepth, PerformanceMode } from '@/lib/settings-context';
import { FaBolt, FaCheck, FaMicrochip, FaRotate, FaTriangleExclamation } from '@/components/icon-library';
import { SectionCard, SectionTitle, formatStorageBytes } from './types';
import { useI18n } from '@/lib/i18n';

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

function stateLabel(state: CapabilityStateUi, t: (key: 'perfStatusDetected' | 'perfStatusAvailable' | 'perfStatusVerified' | 'perfStatusActive' | 'perfStatusFallback' | 'perfStatusDown') => string) {
    return {
        detected: t('perfStatusDetected'),
        available: t('perfStatusAvailable'),
        verified: t('perfStatusVerified'),
        active: t('perfStatusActive'),
        fallback: t('perfStatusFallback'),
        unavailable: t('perfStatusDown'),
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
    const { t, locale } = useI18n();
    return (
        <div className="flex flex-col gap-4">
            <SectionCard className="flex flex-col gap-3">
                <SectionTitle icon={FaMicrochip} label={t('perfTitle')} />
                <p className="text-[10px] leading-relaxed text-white/45">
                    {t('perfTitleDesc')}
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
                            {value === 'intelligent' ? t('perfSmart') : value === 'efficient' ? t('perfEfficient') : t('perfMax')}
                        </button>
                    ))}
                </div>
                <p className="text-[10px] text-white/35">{t('perfApplyOnSave')}</p>
                <div className="rounded-xl bg-black/30 p-3 text-[10px] text-white/60">
                    <div className="flex items-center justify-between gap-2">
                        <span>{t('perfEffective')}</span>
                        <strong className="text-white">{policy?.effectiveProfile ?? t('perfPending')}</strong>
                    </div>
                    <p className="mt-1 text-white/40">{policy?.reason ?? t('perfOpenNative')}</p>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-black/30 p-3">
                    <span><span className="block text-xs font-bold text-white/85">{t('perfBackground')}</span><span className="mt-0.5 block text-[10px] text-white/40">{t('perfBackgroundDesc')}</span></span>
                    <input type="checkbox" checked={backgroundProcessing} onChange={(event) => setBackgroundProcessing(event.target.checked)} className="h-4 w-4 accent-[#25f4ee]" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-black/30 p-3">
                    <span><span className="block text-xs font-bold text-white/85">{t('perfAcOnly')}</span><span className="mt-0.5 block text-[10px] text-white/40">{t('perfAcOnlyDesc')}</span></span>
                    <input type="checkbox" checked={acOnlyForMaximum} onChange={(event) => setAcOnlyForMaximum(event.target.checked)} className="h-4 w-4 accent-[#25f4ee]" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-black/30 p-3">
                    <span><span className="block text-xs font-bold text-white/85">{t('perfIdleThreshold')}</span><span className="mt-0.5 block text-[10px] text-white/40">{t('perfIdleThresholdDesc')}</span></span>
                    <input type="number" min={15} max={86400} value={idleThresholdSeconds} onChange={(event) => setIdleThresholdSeconds(Math.max(15, Math.min(86400, Number(event.target.value) || 60)))} className="w-20 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-right text-xs text-white" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <label className="rounded-xl bg-black/30 p-3">
                        <span className="block text-[10px] font-bold text-white/70">{t('perfAdapter')}</span>
                        <select value={preferredAdapterId ?? ''} onChange={(event) => setPreferredAdapterId(event.target.value || null)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#12141a] px-2 py-1.5 text-[10px] text-white">
                            <option value="">{t('perfAuto')}</option>
                            {(status?.adapters ?? []).map((adapter) => <option key={adapter.id} value={adapter.id}>{adapter.name}</option>)}
                        </select>
                    </label>
                    <label className="rounded-xl bg-black/30 p-3">
                        <span className="block text-[10px] font-bold text-white/70">{t('perfLocalAi')}</span>
                        <select value={analysisDepth} onChange={(event) => setAnalysisDepth(event.target.value as AnalysisDepth)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#12141a] px-2 py-1.5 text-[10px] text-white">
                            <option value="standard">{t('perfStandard')}</option>
                            <option value="deep">{t('perfDeep')}</option>
                        </select>
                    </label>
                </div>
                <p className="text-[10px] text-white/35">{t('perfHiddenStart')}: {startInBackground ? t('perfOn') : t('perfHiddenStartOff')}.</p>
            </SectionCard>

            <SectionCard className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <SectionTitle icon={FaBolt} label={t('perfDiagnostics')} />
                    <span className={`text-[10px] font-bold ${isTauri ? 'text-emerald-300' : 'text-white/35'}`}>{isTauri ? t('perfShellNative') : t('perfShellBrowser')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-xl bg-black/30 p-3"><span className="text-white/40">{t('perfPower')}</span><strong className="mt-1 block text-white">{status?.powerSource ?? t('settingsNotMeasured')}</strong></div>
                    <div className="rounded-xl bg-black/30 p-3"><span className="text-white/40">{t('perfUser')}</span><strong className="mt-1 block text-white">{status?.userState ?? t('settingsNotMeasured')}</strong></div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!isTauri || benchmarkBusy} onClick={onBenchmark} className="rounded-xl bg-[#25f4ee]/15 px-3 py-2 text-[10px] font-bold text-[#25f4ee] disabled:cursor-not-allowed disabled:opacity-40">{benchmarkBusy ? t('perfChecking') : t('perfCheckAccel')}</button>
                    <button type="button" disabled={!isTauri || benchmarkBusy} onClick={onReset} className="flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-[10px] font-bold text-white/65 disabled:cursor-not-allowed disabled:opacity-40"><FaRotate size={10} /> {t('perfResetLearning')}</button>
                </div>
                {status?.adapters.map((adapter) => (
                    <div key={adapter.id} className="rounded-xl border border-white/[0.07] bg-black/25 p-3 text-[10px]">
                        <div className="flex items-center justify-between gap-2"><strong className="text-white">{adapter.name}</strong><span className={stateClass(adapter.state)}>{stateLabel(adapter.state, t)}</span></div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-white/40"><span>{adapter.vendor}</span><span>{adapter.dedicated ? t('perfDedicated') : t('perfIntegrated')}</span><span>{t('perfVram', { value: formatStorageBytes(adapter.vramTotalBytes, locale) })}</span>{adapter.driver && <span>{t('perfDriver', { value: adapter.driver })}</span>}</div>
                    </div>
                ))}
                <div className="flex flex-col gap-2">
                    {(status?.capabilities ?? []).map((capability) => (
                        <div key={capability.name} className="rounded-xl bg-black/25 p-3">
                            <div className="flex items-center justify-between gap-2"><span className="text-white/75">{capability.name}</span><span className={`font-bold ${stateClass(capability.state)}`}>{capability.state === 'verified' || capability.state === 'active' ? <FaCheck size={10} className="inline mr-1" /> : capability.state === 'fallback' ? <FaTriangleExclamation size={10} className="inline mr-1" /> : null}{stateLabel(capability.state, t)}</span></div>
                            {capability.reason && <p className="mt-1 text-[9px] leading-relaxed text-white/38">{capability.reason}</p>}
                        </div>
                    ))}
                </div>
                {status?.fallbackReason && <p className="rounded-xl bg-amber-400/[0.08] p-3 text-[10px] leading-relaxed text-amber-200/80">{status.fallbackReason}</p>}
                {policy && <p className="text-[10px] text-white/38">{t('perfGpuLine', { gpu: policy.maxGpuTasks, whisper: policy.whisperComputeType, llm: policy.llmGpuLayers ? t('perfLlmLayers', { llm: policy.llmGpuLayers }) : t('perfCpuLine') })}.</p>}
            </SectionCard>
        </div>
    );
}
