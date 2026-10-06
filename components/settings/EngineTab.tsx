import React from 'react';
import { SectionCard, SectionTitle, CollectionSource, HealthEventRecord, RuntimeHealth } from './types';
import { useI18n } from '@/lib/i18n';
import { FaMicrochip, FaTriangleExclamation, FaRotate, FaBrain } from '@/components/icon-library';

interface EngineTabProps {
    modelOnline: boolean | null;
    defaultHnswShardCount: number;
    processedVideoCount: number;
    similarityThreshold: number;
    setSimilarityThreshold: (val: number) => void;
    selectedWhisperModel: string;
    processingQuality: number;
    setProcessingQuality: (val: number) => void;
    processingSetup: {
        hardware?: {
            gpu_name?: string | null;
            logical_cores?: number;
            whisper_gpu_supported?: boolean;
        } | null;
        preparing?: boolean;
        prepareForQuality: (quality: number) => Promise<unknown>;
        cancelPreparation: () => Promise<unknown>;
    };
    setupPending?: boolean;
    onResumeSetup?: () => void;
    cookiesBrowser: '' | 'chrome' | 'edge' | 'firefox';
    setCookiesBrowser: (val: '' | 'chrome' | 'edge' | 'firefox') => void;
    runtimeHealth: RuntimeHealth | null;
    healthBusy: boolean;
    runHealthAction: (action: () => Promise<void>) => Promise<void>;
    sources: CollectionSource[];
    setPendingSourceDelete: (source: CollectionSource | null) => void;
    healthEvents: HealthEventRecord[];
    updater: {
        isNative: boolean;
        status: string;
        version?: string | null;
        notes?: string | null;
        progress: number;
        error?: string | null;
        checkForUpdate: () => Promise<unknown>;
        installUpdate: () => Promise<unknown>;
    };
    updaterBlocked: boolean;
    updaterChannel: string;
    updateConfirming: boolean;
    setUpdateConfirming: (val: boolean) => void;
    t: (key: any, params?: any) => string;
}

export function EngineTab({
    modelOnline,
    defaultHnswShardCount,
    processedVideoCount,
    similarityThreshold,
    setSimilarityThreshold,
    selectedWhisperModel,
    processingQuality,
    setProcessingQuality,
    processingSetup,
    setupPending = false,
    onResumeSetup,
    cookiesBrowser,
    setCookiesBrowser,
    runtimeHealth,
    healthBusy,
    runHealthAction,
    sources,
    setPendingSourceDelete,
    healthEvents,
    updater,
    updaterBlocked,
    updaterChannel,
    updateConfirming,
    setUpdateConfirming,
    t,
}: EngineTabProps) {
    const { locale } = useI18n();
    return (
        <div className="flex flex-col gap-4">
            {setupPending && (
                <section className="rounded-2xl bg-white/[0.045] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                    <p className="text-[11px] leading-relaxed text-white/60">{t('onboardingResumeDescription')}</p>
                    <button type="button" onClick={onResumeSetup} className="mt-3 rounded-full bg-[#25f4ee]/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#25f4ee] transition hover:bg-[#25f4ee]/16 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#25f4ee]">
                        {t('onboardingResume')}
                    </button>
                </section>
            )}
            {/* Motor Semántico ONNX */}
            <SectionCard className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <SectionTitle icon={FaMicrochip} label={t('engOnnx')} />
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-bold flex items-center gap-1.5 ${
                        modelOnline === false
                            ? 'bg-[#fe2c55]/15 text-[#fe2c55]'
                            : 'bg-emerald-500/15 text-emerald-400'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${modelOnline === false ? 'bg-[#fe2c55]' : 'bg-emerald-400 animate-pulse'}`} />
                        {modelOnline === null ? t('engChecking') : modelOnline ? t('engOnline') : t('engOffline')}
                    </span>
                </div>

                {/* Specs Card */}
                <div className="p-3.5 rounded-[16px] bg-black/40 shadow-inner flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white">{t('engOnnxModel')}</span>
                        <span className="text-[10px] font-mono text-[#25f4ee] font-bold">{t('engOnnxRuntime')}</span>
                    </div>
                    <p className="text-[11px] text-white/50 leading-relaxed">
                        {t('engOnnxDesc')}
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-2 text-[10px] text-white/60">
                        <div><strong className="text-white/80">{t('engDim')}</strong> {t('engDimVal')}</div>
                        <div><strong className="text-white/80">{t('engMetric')}</strong> {t('engMetricVal')}</div>
                        <div><strong className="text-white/80">{t('engShards')}</strong> {defaultHnswShardCount}</div>
                        <div><strong className="text-white/80">{t('engCompleted')}</strong> {processedVideoCount}</div>
                    </div>
                </div>

                {/* Slider Umbral Similitud */}
                <div className="p-3.5 rounded-[16px] bg-black/30 shadow-inner flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-white/60">{t('engThreshold')}</span>
                        <span className="text-xs font-mono font-bold text-[#25f4ee]">{(similarityThreshold * 100).toFixed(0)}%</span>
                    </div>
                    <input
                        type="range"
                        aria-label={t('engThreshold')}
                        min="0.2"
                        max="0.9"
                        step="0.05"
                        value={similarityThreshold}
                        onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                        className="w-full accent-[#25f4ee] cursor-pointer"
                    />
                    <span className="text-[9px] text-white/40 leading-tight">
                        {t('engThresholdHint')}
                    </span>
                </div>
            </SectionCard>

            {/* Análisis Local & Whisper */}
            <SectionCard className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                    <SectionTitle icon={FaMicrochip} label={t('engWhisper')} />
                    <span className="rounded-full bg-[#25f4ee]/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#25f4ee]">
                        {selectedWhisperModel}
                    </span>
                </div>
                <div className="p-3.5 rounded-[16px] bg-black/30 shadow-inner flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-[10px] text-white/55">
                        <span>{t('engSpeed')}</span>
                        <span className="font-bold text-white/85">{processingQuality < 35 ? t('engSpeedFast') : processingQuality < 72 ? t('engSpeedBalanced') : t('engSpeedQuality')}</span>
                        <span>{t('engPrecision')}</span>
                    </div>
                    <input
                        aria-label={t('engSpeed')}
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={processingQuality}
                        onChange={(event) => setProcessingQuality(Number(event.target.value))}
                        className="w-full accent-[#25f4ee] cursor-pointer"
                    />
                </div>
                <div className="p-3 rounded-[14px] bg-black/25 text-[10px] leading-relaxed text-white/45 shadow-inner">
                    {processingSetup.hardware?.gpu_name || t('engGpuMissing')} · {processingSetup.hardware?.logical_cores || '—'} {t('engThreads')} · {processingSetup.hardware?.whisper_gpu_supported ? t('engWhisperGpu') : t('engCpuFallback')}
                </div>
            </SectionCard>

            {/* Fuentes Privadas */}
            <SectionCard className="flex flex-col gap-3">
                <SectionTitle icon={FaBrain} label={t('engCookies')} />
                <select
                    value={cookiesBrowser}
                    onChange={(event) => setCookiesBrowser(event.target.value as typeof cookiesBrowser)}
                    className="w-full bg-black/40 rounded-xl px-3 py-2.5 text-xs text-white/90 outline-none focus:bg-black/60 shadow-inner cursor-pointer"
                >
                    <option value="">{t('engPublicOnly')}</option>
                    <option value="chrome">{t('engChrome')}</option>
                    <option value="edge">{t('engEdge')}</option>
                    <option value="firefox">{t('engFirefox')}</option>
                </select>
                <p className="px-1 text-[10px] text-white/40 leading-relaxed">
                    {t('engCookiesNote')}
                </p>
            </SectionCard>

            {/* Salud y Sincronización */}
            <SectionCard className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <SectionTitle icon={FaTriangleExclamation} label={`${t('health')} ${t('engHealthDiag')}`} />
                    <button
                        type="button"
                        disabled={healthBusy}
                        onClick={() => void runHealthAction(async () => {
                            const { invoke } = await import('@tauri-apps/api/core');
                            await invoke('repair_library');
                        })}
                        className="rounded-[10px] bg-white/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-white/70 hover:bg-white/15 hover:text-white transition-colors disabled:opacity-40"
                    >
                        {t('engRepair')}
                    </button>
                </div>
                <p className="text-[10px] leading-relaxed text-white/40">
                    {t('engSourcesNote')}
                </p>

                {runtimeHealth && (
                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                        <div className="rounded-[12px] bg-black/35 p-2.5 shadow-inner">
                            <span className="block text-white/35">Whisper</span>
                            <span className={runtimeHealth.model.ready ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>
                                {runtimeHealth.model.model} · {runtimeHealth.model.ready ? t('engWhisperReady') : t('engWhisperPending')}
                            </span>
                            {!runtimeHealth.model.ready && (
                                <button type="button" disabled={healthBusy} onClick={() => void runHealthAction(async () => { await processingSetup.prepareForQuality(processingQuality); })} className="mt-1 block text-[8px] font-black uppercase tracking-wider text-[#25f4ee] disabled:opacity-40">{t('engPrepareModel')}</button>
                            )}
                            {processingSetup.preparing && (
                                <button type="button" onClick={() => void processingSetup.cancelPreparation()} className="mt-1 block text-[8px] font-black uppercase tracking-wider text-[#fe2c55]">{t('engCancel')}</button>
                            )}
                        </div>
                        <div className="rounded-[12px] bg-black/35 p-2.5 shadow-inner">
                            <span className="block text-white/35">{t('engQueue')}</span>
                            <span className={runtimeHealth.backpressure_active ? 'font-bold text-amber-400' : 'font-bold text-white/70'}>{runtimeHealth.queue_depth} {t('engPending')}</span>
                        </div>
                        <div className="rounded-[12px] bg-black/35 p-2.5 shadow-inner">
                            <span className="block text-white/35">Workers</span>
                            <span className="font-bold text-white/70">{t('engCapacity', { count: runtimeHealth.worker_capacity })} · {t('engWaiting', { count: runtimeHealth.idle_workers })}</span>
                        </div>
                        <div className="rounded-[12px] bg-black/35 p-2.5 shadow-inner">
                            <span className="block text-white/35">{t('engAutoAdmit')}</span>
                            <span className={runtimeHealth.background_admission_paused ? 'font-bold text-amber-300' : 'font-bold text-emerald-300'}>{runtimeHealth.background_admission_paused ? t('engAdmitDelayed') : t('engAdmitAllowed')}</span>
                        </div>
                        <div className="rounded-[12px] bg-black/35 p-2.5 shadow-inner">
                            <span className="block text-white/35">{t('engGateway')}</span>
                            <span className={runtimeHealth.api_ready ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{runtimeHealth.api_ready ? t('engAvailable') : t('engUnavailable')}</span>
                            {runtimeHealth.api_error && <span className="mt-1 block text-[8px] leading-relaxed text-[#fe2c55]">{runtimeHealth.api_error}</span>}
                        </div>
                    </div>
                )}

                {/* Fuentes Monitoreadas */}
                <div className="flex flex-col gap-2">
                    {sources.map((source) => (
                        <div key={source.id} className="rounded-[14px] bg-black/35 p-3 shadow-inner">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate text-[10px] font-bold text-white/80" title={source.profile_url || source.url}>{source.display_name || source.username || source.profile_url || source.url}</p>
                                    <p className="mt-1 text-[9px] uppercase tracking-wider text-white/35">{source.status || source.source_type} · {t('engDetected', { count: source.discovered_count })} · {t('engFailures', { count: source.consecutive_failures })}</p>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${source.active ? 'bg-[#25f4ee]/15 text-[#25f4ee]' : 'bg-white/5 text-white/35'}`}>{source.active ? t('engActive') : t('engPaused')}</span>
                            </div>
                            {source.last_error && <p className="mt-2 text-[9px] leading-relaxed text-[#fe2c55]">{source.last_error}</p>}
                            <div className="mt-2.5 flex gap-2">
                                <button type="button" disabled={healthBusy} onClick={() => void runHealthAction(async () => { const { invoke } = await import('@tauri-apps/api/core'); await invoke('set_collection_source_active', { sourceId: source.id, active: !source.active }); })} className="text-[8px] font-black uppercase tracking-wider text-white/55 hover:text-white transition-colors">{source.active ? t('engPause') : t('engResume')}</button>
                                <button type="button" disabled={healthBusy || !source.active} onClick={() => void runHealthAction(async () => { const { invoke } = await import('@tauri-apps/api/core'); await invoke('sync_collection_source_now', { sourceId: source.id }); })} className="text-[8px] font-black uppercase tracking-wider text-[#25f4ee] hover:text-[#25f4ee]/80 transition-colors disabled:opacity-35">{t('engSyncNow')}</button>
                                <button type="button" disabled={healthBusy} onClick={() => setPendingSourceDelete(source)} className="ml-auto text-[8px] font-black uppercase tracking-wider text-[#fe2c55] hover:text-[#fe2c55]/80 transition-colors">{t('engDelete')}</button>
                            </div>
                        </div>
                    ))}
                    {sources.length === 0 && <p className="rounded-[12px] bg-black/25 p-3 text-center text-[10px] text-white/35 shadow-inner">{t('engRegisterHint')}</p>}
                </div>

                {/* Health Events */}
                <div className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-[12px] bg-black/25 p-2.5 shadow-inner">
                    {healthEvents.slice(0, 12).map((event) => (
                        <div key={event.id} className="flex gap-2 py-1 text-[9px] text-white/55">
                            <span className={event.severity === 'error' ? 'text-[#fe2c55] font-bold' : event.severity === 'warning' ? 'text-amber-400 font-bold' : 'text-[#25f4ee] font-bold'}>{event.severity.toUpperCase()}</span>
                            <span className="min-w-0 flex-1">{event.component}: {event.diagnosis}</span>
                        </div>
                    ))}
                    {healthEvents.length === 0 && <p className="py-2 text-center text-[9px] text-white/30">{t('engNoIncidents')}</p>}
                </div>
            </SectionCard>

            {/* Actualizador / Updater */}
            <SectionCard className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                    <SectionTitle icon={FaRotate} label={t('updater')} />
                    <span className="rounded-full bg-[#25f4ee]/15 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#25f4ee]">
                        {updaterBlocked ? t('engBlockedExternal') : t('engSignedChannel', { channel: updaterChannel })}
                    </span>
                </div>
                <p className="text-[10px] leading-relaxed text-white/45">
                    {updaterBlocked
                        ? t('engUpdaterBlocked')
                        : t('engUpdaterAuto')}
                </p>

                <div className="flex items-center justify-between gap-3 rounded-[14px] bg-black/35 p-3 shadow-inner">
                    <div className="min-w-0" aria-live="polite">
                        <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">{t('engState')}</span>
                        <span className="block truncate text-[10px] font-bold text-white/80">
                            {updater.status === 'idle' && t('engNeverChecked')}
                            {updater.status === 'checking' && t('engCheckingNow')}
                            {updater.status === 'up-to-date' && t('engUpToDate')}
                            {updater.status === 'available' && t('engAvailableVersion', { version: updater.version })}
                            {updater.status === 'downloading' && t('engDownloading', { pct: updater.progress })}
                            {updater.status === 'installing' && t('engInstalling')}
                            {updater.status === 'blocked-by-active-job' && t('engWaitingJobs')}
                            {updater.status === 'error' && t('engUpdateFailed')}
                        </span>
                    </div>
                    <button
                        type="button"
                        disabled={updaterBlocked || !updater.isNative || updater.status === 'checking' || updater.status === 'downloading' || updater.status === 'installing'}
                        onClick={() => {
                            setUpdateConfirming(false);
                            void updater.checkForUpdate();
                        }}
                        className="shrink-0 rounded-[12px] bg-[#25f4ee]/15 hover:bg-[#25f4ee]/25 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#25f4ee] transition-all disabled:opacity-35 cursor-pointer"
                    >
                        {updater.status === 'checking' ? t('engCheckingNow') : t('engCheckUpdates')}
                    </button>
                </div>

                {updater.status === 'available' && updater.version && !updaterBlocked && (
                    <div className="rounded-[14px] bg-[#25f4ee]/10 p-3.5 shadow-sm">
                        <p className="text-[10px] font-black text-white">{t('engVersionAvailable', { version: updater.version })}</p>
                        <p className="mt-1 text-[9px] leading-relaxed text-white/60">
                            {updater.notes || t('engStabilityNote')}
                        </p>
                        {!updateConfirming ? (
                            <button
                                type="button"
                                onClick={() => setUpdateConfirming(true)}
                                className="mt-3 rounded-[10px] bg-[#25f4ee]/20 hover:bg-[#25f4ee]/30 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#25f4ee] transition-colors"
                            >
                                {t('engPrepareInstall')}
                            </button>
                        ) : (
                            <div className="mt-3 rounded-[12px] bg-amber-400/10 p-3 shadow-inner">
                                <p className="text-[9px] leading-relaxed text-amber-200">
                                    {t('engDownloadNote')}
                                </p>
                                <div className="mt-2.5 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setUpdateConfirming(false)}
                                        className="rounded-[8px] bg-white/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-white/60 hover:text-white"
                                    >
                                        {t('engNotNow')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUpdateConfirming(false);
                                            void updater.installUpdate();
                                        }}
                                        className="rounded-[8px] bg-[#25f4ee]/25 hover:bg-[#25f4ee]/35 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-[#25f4ee]"
                                    >
                                        {t('engConfirmInstall')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
