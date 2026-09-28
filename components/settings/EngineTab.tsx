import React from 'react';
import { SectionCard, SectionTitle, CollectionSource, HealthEventRecord, RuntimeHealth } from './types';
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
                    <SectionTitle icon={FaMicrochip} label="Motor Semántico ONNX" />
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-bold flex items-center gap-1.5 ${
                        modelOnline === false
                            ? 'bg-[#fe2c55]/15 text-[#fe2c55]'
                            : 'bg-emerald-500/15 text-emerald-400'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${modelOnline === false ? 'bg-[#fe2c55]' : 'bg-emerald-400 animate-pulse'}`} />
                        {modelOnline === null ? 'COMPROBANDO…' : modelOnline ? 'ONLINE' : 'NO DISPONIBLE'}
                    </span>
                </div>

                {/* Specs Card */}
                <div className="p-3.5 rounded-[16px] bg-black/40 shadow-inner flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white">all-MiniLM-L6-v2</span>
                        <span className="text-[10px] font-mono text-[#25f4ee] font-bold">ONNX Runtime</span>
                    </div>
                    <p className="text-[11px] text-white/50 leading-relaxed">
                        Modelo ONNX local para calcular embeddings densos y buscar por similitud; este runtime usa el proveedor CPU.
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-2 text-[10px] text-white/60">
                        <div><strong className="text-white/80">Dimensión:</strong> 384 dimensiones</div>
                        <div><strong className="text-white/80">Métrica:</strong> Distancia Coseno</div>
                        <div><strong className="text-white/80">Shards HNSW predeterminados:</strong> {defaultHnswShardCount}</div>
                        <div><strong className="text-white/80">Videos completados:</strong> {processedVideoCount}</div>
                    </div>
                </div>

                {/* Slider Umbral Similitud */}
                <div className="p-3.5 rounded-[16px] bg-black/30 shadow-inner flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-white/60">Umbral de Similitud Semántica</span>
                        <span className="text-xs font-mono font-bold text-[#25f4ee]">{(similarityThreshold * 100).toFixed(0)}%</span>
                    </div>
                    <input
                        type="range"
                        aria-label="Umbral de similitud semántica"
                        min="0.2"
                        max="0.9"
                        step="0.05"
                        value={similarityThreshold}
                        onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                        className="w-full accent-[#25f4ee] cursor-pointer"
                    />
                    <span className="text-[9px] text-white/40 leading-tight">
                        Coincidencias con puntuación menor serán descartadas en la búsqueda inteligente.
                    </span>
                </div>
            </SectionCard>

            {/* Análisis Local & Whisper */}
            <SectionCard className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                    <SectionTitle icon={FaMicrochip} label="Análisis Local & Whisper" />
                    <span className="rounded-full bg-[#25f4ee]/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#25f4ee]">
                        {selectedWhisperModel}
                    </span>
                </div>
                <div className="p-3.5 rounded-[16px] bg-black/30 shadow-inner flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-[10px] text-white/55">
                        <span>Rapidez</span>
                        <span className="font-bold text-white/85">{processingQuality < 35 ? 'Rápido (Tiny)' : processingQuality < 72 ? 'Equilibrado (Small)' : 'Alta calidad (Medium)'}</span>
                        <span>Precisión</span>
                    </div>
                    <input
                        aria-label="Rapidez y calidad del procesamiento"
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
                    {processingSetup.hardware?.gpu_name || 'GPU no detectada'} · {processingSetup.hardware?.logical_cores || '—'} hilos · {processingSetup.hardware?.whisper_gpu_supported ? 'Aceleración Whisper GPU disponible' : 'Fallback CPU activo'}
                </div>
            </SectionCard>

            {/* Fuentes Privadas */}
            <SectionCard className="flex flex-col gap-3">
                <SectionTitle icon={FaBrain} label="Fuentes Privadas & Cookies" />
                <select
                    value={cookiesBrowser}
                    onChange={(event) => setCookiesBrowser(event.target.value as typeof cookiesBrowser)}
                    className="w-full bg-black/40 rounded-xl px-3 py-2.5 text-xs text-white/90 outline-none focus:bg-black/60 shadow-inner cursor-pointer"
                >
                    <option value="">Solo fuentes públicas</option>
                    <option value="chrome">Chrome (sesión local)</option>
                    <option value="edge">Edge (sesión local)</option>
                    <option value="firefox">Firefox (sesión local)</option>
                </select>
                <p className="px-1 text-[10px] text-white/40 leading-relaxed">
                    Para likes, favoritos o listas privadas, inicia sesión en el navegador elegido. Pulsaria usa el lector local de yt-dlp y no copia ni almacena contraseñas ni tokens.
                </p>
            </SectionCard>

            {/* Salud y Sincronización */}
            <SectionCard className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <SectionTitle icon={FaTriangleExclamation} label={`${t('health')} y Diagnóstico`} />
                    <button
                        type="button"
                        disabled={healthBusy}
                        onClick={() => void runHealthAction(async () => {
                            const { invoke } = await import('@tauri-apps/api/core');
                            await invoke('repair_library');
                        })}
                        className="rounded-[10px] bg-white/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-white/70 hover:bg-white/15 hover:text-white transition-colors disabled:opacity-40"
                    >
                        Reparar biblioteca
                    </button>
                </div>
                <p className="text-[10px] leading-relaxed text-white/40">
                    Pulsaria comprueba las fuentes activas periódicamente y conserva un registro operativo local sin datos sensibles.
                </p>

                {runtimeHealth && (
                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                        <div className="rounded-[12px] bg-black/35 p-2.5 shadow-inner">
                            <span className="block text-white/35">Whisper</span>
                            <span className={runtimeHealth.model.ready ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>
                                {runtimeHealth.model.model} · {runtimeHealth.model.ready ? 'listo' : 'reparación pendiente'}
                            </span>
                            {!runtimeHealth.model.ready && (
                                <button type="button" disabled={healthBusy} onClick={() => void runHealthAction(async () => { await processingSetup.prepareForQuality(processingQuality); })} className="mt-1 block text-[8px] font-black uppercase tracking-wider text-[#25f4ee] disabled:opacity-40">Preparar modelo</button>
                            )}
                            {processingSetup.preparing && (
                                <button type="button" onClick={() => void processingSetup.cancelPreparation()} className="mt-1 block text-[8px] font-black uppercase tracking-wider text-[#fe2c55]">Cancelar</button>
                            )}
                        </div>
                        <div className="rounded-[12px] bg-black/35 p-2.5 shadow-inner">
                            <span className="block text-white/35">Cola única</span>
                            <span className={runtimeHealth.backpressure_active ? 'font-bold text-amber-400' : 'font-bold text-white/70'}>{runtimeHealth.queue_depth} pendientes</span>
                        </div>
                        <div className="rounded-[12px] bg-black/35 p-2.5 shadow-inner">
                            <span className="block text-white/35">Workers</span>
                            <span className="font-bold text-white/70">{runtimeHealth.worker_capacity} disponibles · {runtimeHealth.idle_workers} en espera</span>
                        </div>
                        <div className="rounded-[12px] bg-black/35 p-2.5 shadow-inner">
                            <span className="block text-white/35">Admisión automática</span>
                            <span className={runtimeHealth.background_admission_paused ? 'font-bold text-amber-300' : 'font-bold text-emerald-300'}>{runtimeHealth.background_admission_paused ? 'pospuesta por política' : 'permitida'}</span>
                        </div>
                        <div className="rounded-[12px] bg-black/35 p-2.5 shadow-inner">
                            <span className="block text-white/35">Gateway local</span>
                            <span className={runtimeHealth.api_ready ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{runtimeHealth.api_ready ? 'disponible' : 'no disponible'}</span>
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
                                    <p className="mt-1 text-[9px] uppercase tracking-wider text-white/35">{source.status || source.source_type} · {source.discovered_count} detectados · {source.consecutive_failures} fallos</p>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${source.active ? 'bg-[#25f4ee]/15 text-[#25f4ee]' : 'bg-white/5 text-white/35'}`}>{source.active ? 'Activa' : 'Pausada'}</span>
                            </div>
                            {source.last_error && <p className="mt-2 text-[9px] leading-relaxed text-[#fe2c55]">{source.last_error}</p>}
                            <div className="mt-2.5 flex gap-2">
                                <button type="button" disabled={healthBusy} onClick={() => void runHealthAction(async () => { const { invoke } = await import('@tauri-apps/api/core'); await invoke('set_collection_source_active', { sourceId: source.id, active: !source.active }); })} className="text-[8px] font-black uppercase tracking-wider text-white/55 hover:text-white transition-colors">{source.active ? 'Pausar' : 'Reactivar'}</button>
                                <button type="button" disabled={healthBusy || !source.active} onClick={() => void runHealthAction(async () => { const { invoke } = await import('@tauri-apps/api/core'); await invoke('sync_collection_source_now', { sourceId: source.id }); })} className="text-[8px] font-black uppercase tracking-wider text-[#25f4ee] hover:text-[#25f4ee]/80 transition-colors disabled:opacity-35">Sincronizar ahora</button>
                                <button type="button" disabled={healthBusy} onClick={() => setPendingSourceDelete(source)} className="ml-auto text-[8px] font-black uppercase tracking-wider text-[#fe2c55] hover:text-[#fe2c55]/80 transition-colors">Eliminar</button>
                            </div>
                        </div>
                    ))}
                    {sources.length === 0 && <p className="rounded-[12px] bg-black/25 p-3 text-center text-[10px] text-white/35 shadow-inner">Pega un perfil, favoritos o colección de TikTok para registrarlo.</p>}
                </div>

                {/* Health Events */}
                <div className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-[12px] bg-black/25 p-2.5 shadow-inner">
                    {healthEvents.slice(0, 12).map((event) => (
                        <div key={event.id} className="flex gap-2 py-1 text-[9px] text-white/55">
                            <span className={event.severity === 'error' ? 'text-[#fe2c55] font-bold' : event.severity === 'warning' ? 'text-amber-400 font-bold' : 'text-[#25f4ee] font-bold'}>{event.severity.toUpperCase()}</span>
                            <span className="min-w-0 flex-1">{event.component}: {event.diagnosis}</span>
                        </div>
                    ))}
                    {healthEvents.length === 0 && <p className="py-2 text-center text-[9px] text-white/30">Sin incidencias registradas.</p>}
                </div>
            </SectionCard>

            {/* Actualizador / Updater */}
            <SectionCard className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                    <SectionTitle icon={FaRotate} label={t('updater')} />
                    <span className="rounded-full bg-[#25f4ee]/15 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#25f4ee]">
                        {updaterBlocked ? 'Bloqueado externamente' : `Firmado · canal ${updaterChannel}`}
                    </span>
                </div>
                <p className="text-[10px] leading-relaxed text-white/45">
                    {updaterBlocked
                        ? 'El actualizador permanecerá bloqueado hasta contar con un manifiesto firmado y artefactos oficiales verificables.'
                        : 'Pulsaria comprueba nuevas versiones automáticamente y solo instala después de tu confirmación.'}
                </p>

                <div className="flex items-center justify-between gap-3 rounded-[14px] bg-black/35 p-3 shadow-inner">
                    <div className="min-w-0" aria-live="polite">
                        <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">Estado</span>
                        <span className="block truncate text-[10px] font-bold text-white/80">
                            {updater.status === 'idle' && 'Sin comprobar'}
                            {updater.status === 'checking' && 'Comprobando…'}
                            {updater.status === 'up-to-date' && 'Pulsaria está actualizado'}
                            {updater.status === 'available' && `Disponible: ${updater.version}`}
                            {updater.status === 'downloading' && `Descargando… ${updater.progress}%`}
                            {updater.status === 'installing' && 'Instalando y preparando reinicio…'}
                            {updater.status === 'blocked-by-active-job' && 'Esperando a que terminen los trabajos activos'}
                            {updater.status === 'error' && 'No se pudo actualizar'}
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
                        {updater.status === 'checking' ? 'Comprobando…' : 'Buscar actualizaciones'}
                    </button>
                </div>

                {updater.status === 'available' && updater.version && !updaterBlocked && (
                    <div className="rounded-[14px] bg-[#25f4ee]/10 p-3.5 shadow-sm">
                        <p className="text-[10px] font-black text-white">Versión {updater.version} disponible</p>
                        <p className="mt-1 text-[9px] leading-relaxed text-white/60">
                            {updater.notes || 'Incluye mejoras de estabilidad y rendimiento.'}
                        </p>
                        {!updateConfirming ? (
                            <button
                                type="button"
                                onClick={() => setUpdateConfirming(true)}
                                className="mt-3 rounded-[10px] bg-[#25f4ee]/20 hover:bg-[#25f4ee]/30 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#25f4ee] transition-colors"
                            >
                                Preparar instalación
                            </button>
                        ) : (
                            <div className="mt-3 rounded-[12px] bg-amber-400/10 p-3 shadow-inner">
                                <p className="text-[9px] leading-relaxed text-amber-200">
                                    Pulsaria descargará la actualización firmada y se reiniciará.
                                </p>
                                <div className="mt-2.5 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setUpdateConfirming(false)}
                                        className="rounded-[8px] bg-white/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-white/60 hover:text-white"
                                    >
                                        Ahora no
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUpdateConfirming(false);
                                            void updater.installUpdate();
                                        }}
                                        className="rounded-[8px] bg-[#25f4ee]/25 hover:bg-[#25f4ee]/35 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-[#25f4ee]"
                                    >
                                        Confirmar e instalar
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
