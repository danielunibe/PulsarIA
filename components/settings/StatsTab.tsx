import React from 'react';
import { SectionCard, SectionTitle, StorageStatusUi, PurgeCandidateUi, PurgePreviewUi, formatStorageBytes, BYTES_PER_GIB } from './types';
import { useI18n } from '@/lib/i18n';
import { FaChartSimple, FaHardDrive, FaTrashCan, FaArrowRotateLeft, FaStar, FaThumbtack, FaCheck } from '@/components/icon-library';
import { RetentionPolicy, StorageIntent } from '@/lib/settings-context';

interface StatsTabProps {
    stats: {
        total: number;
        totalDuration: number;
        thisWeek: number;
    };
    formatDuration: (seconds: number) => string;
    storageStatus: StorageStatusUi | null;
    storageStateClass: string;
    storageStateLabel: string;
    storageBusy: boolean;
    storageMessage: string | null;
    storageError: string | null;
    refreshStorageStatus: () => Promise<void>;
    folder: string;
    retention: RetentionPolicy;
    handleRetentionChange: (policy: RetentionPolicy) => void;
    retentionPreviewPending: boolean;
    setRetention: (policy: RetentionPolicy) => void;
    setRetentionPreviewPending: (val: boolean) => void;
    purgePreview: PurgePreviewUi | null;
    setPurgePreview: (val: PurgePreviewUi | null) => void;
    storageCandidates: PurgeCandidateUi[];
    purgeSelection: number[];
    setPurgeSelection: React.Dispatch<React.SetStateAction<number[]>>;
    storageIntent: StorageIntent;
    setStorageIntent: (intent: StorageIntent) => void;
    quotaBytes: number;
    setQuotaBytes: (bytes: number) => void;
    reserveBytes: number;
    setReserveBytes: (bytes: number) => void;
    handlePreviewPurge: () => Promise<void>;
    lastPurgeId: number | null;
    handleUndoPurge: () => Promise<void>;
    trashConfirming: boolean;
    setTrashConfirming: (val: boolean) => void;
    handleEmptyTrash: () => Promise<void>;
    purgeConfirming: boolean;
    setPurgeConfirming: (val: boolean) => void;
    handleApplyPurge: () => Promise<void>;
    selectedPurgeBytes: number;
    isTauri: boolean;
    t: (key: any, params?: any) => string;
}

export function StatsTab({
    stats,
    formatDuration,
    storageStatus,
    storageStateClass,
    storageStateLabel,
    storageBusy,
    storageMessage,
    storageError,
    refreshStorageStatus,
    folder,
    retention,
    handleRetentionChange,
    retentionPreviewPending,
    setRetention,
    setRetentionPreviewPending,
    purgePreview,
    setPurgePreview,
    storageCandidates,
    purgeSelection,
    setPurgeSelection,
    storageIntent,
    setStorageIntent,
    quotaBytes,
    setQuotaBytes,
    reserveBytes,
    setReserveBytes,
    handlePreviewPurge,
    lastPurgeId,
    handleUndoPurge,
    trashConfirming,
    setTrashConfirming,
    handleEmptyTrash,
    purgeConfirming,
    setPurgeConfirming,
    handleApplyPurge,
    selectedPurgeBytes,
    isTauri,
    t,
}: StatsTabProps) {
    const { locale } = useI18n();
    const reasonLabel = (reason: string): string => {
        switch (reason) {
            case 'online-source':
                return t('stReasonOnline');
            case 'unprotected':
                return t('stReasonUnprotected');
            case 'no-plays':
                return t('stReasonNoPlays');
            case 'no-opens':
                return t('stReasonNoOpens');
            case 'no-hits':
                return t('stReasonNoHits');
            case 'stale-access':
                return t('stReasonStale');
            default:
                return reason;
        }
    };
    return (
        <div className="flex flex-col gap-4">
            {/* Métricas de la Biblioteca */}
            <SectionCard className="flex flex-col gap-3">
                <SectionTitle icon={FaChartSimple} label={t('stMetrics')} />
                <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-[16px] bg-black/40 p-3.5 shadow-inner">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-white/40">{t('stTotalVideos')}</span>
                        <span className="mt-1 block text-xl font-black tracking-tight text-white">{stats.total}</span>
                        <span className="mt-1 block text-[9px] text-white/30">{t('stIndexed')}</span>
                    </div>
                    <div className="rounded-[16px] bg-black/40 p-3.5 shadow-inner">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-white/40">{t('stTotalDuration')}</span>
                        <span className="mt-1 block text-xl font-black tracking-tight text-[#25f4ee]">{formatDuration(stats.totalDuration)}</span>
                        <span className="mt-1 block text-[9px] text-white/30">{t('stAvailableContent')}</span>
                    </div>
                    <div className="rounded-[16px] bg-black/40 p-3.5 shadow-inner">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-white/40">{t('stThisWeek')}</span>
                        <span className="mt-1 block text-xl font-black tracking-tight text-emerald-400">+{stats.thisWeek}</span>
                        <span className="mt-1 block text-[9px] text-white/30">{t('stNewVideos')}</span>
                    </div>
                    <div className="rounded-[16px] bg-black/40 p-3.5 shadow-inner">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-white/40">{t('stTopSource')}</span>
                        <span className="mt-1 block text-xl font-black tracking-tight text-[#fe2c55]">{t('stTikTok')}</span>
                        <span className="mt-1 block text-[9px] text-white/30">{t('stDirectSync')}</span>
                    </div>
                </div>
            </SectionCard>

            {/* Estado de Almacenamiento & Cuotas */}
            <SectionCard className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                    <SectionTitle icon={FaHardDrive} label={t('stStorage')} />
                    <span className={`rounded-full px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${storageStateClass}`}>
                        {storageStateLabel}
                    </span>
                </div>
                <p className="text-[10px] leading-relaxed text-white/45">
                    {t('stStorageDesc')}
                </p>

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-[14px] bg-black/35 p-3 shadow-inner">
                        <span className="block text-[9px] text-white/35">{t('stFreeSpace')}</span>
                        <span className="font-mono text-sm font-bold text-white">{formatStorageBytes(storageStatus?.freeBytes, locale)}</span>
                        <span className="block text-[8px] text-white/25">{t('stOf', { value: formatStorageBytes(storageStatus?.totalBytes, locale) })}</span>
                    </div>
                    <div className="rounded-[14px] bg-black/35 p-3 shadow-inner">
                        <span className="block text-[9px] text-white/35">{t('stMediaUsage')}</span>
                        <span className="font-mono text-sm font-bold text-white">{formatStorageBytes(storageStatus?.usedMediaBytes, locale)}</span>
                        <span className="block text-[8px] text-white/25">{t('stQuota', { value: formatStorageBytes(storageStatus?.quotaBytes, locale) })}</span>
                    </div>
                    <div className="rounded-[14px] bg-black/35 p-3 shadow-inner">
                        <span className="block text-[9px] text-white/35">{t('stMinReserve')}</span>
                        <span className="font-mono text-sm font-bold text-white">{formatStorageBytes(storageStatus?.reserveBytes, locale)}</span>
                        <span className="block text-[8px] text-white/25">{t('stOsMargin')}</span>
                    </div>
                    <div className="rounded-[14px] bg-black/35 p-3 shadow-inner">
                        <span className="block text-[9px] text-white/35">{t('stTrash')}</span>
                        <span className="font-mono text-sm font-bold text-white">{formatStorageBytes(storageStatus?.trashBytes, locale)}</span>
                        <span className="block text-[8px] text-white/25">{t('stRecoverable')}</span>
                    </div>
                </div>

                <div className="rounded-[12px] bg-black/25 px-3 py-2 text-[10px] text-white/40 shadow-inner">
                    <span className="text-white/25">{t('stMediaPath')} </span>
                    <span className="font-mono text-white/60">{storageStatus?.rootPath || folder}</span>
                </div>

                {storageMessage && <p role="status" className="text-[10px] leading-relaxed text-[#25f4ee]">{storageMessage}</p>}
                {storageError && <p role="alert" className="text-[10px] leading-relaxed text-[#fe2c55]">{storageError}</p>}

                <div className="flex flex-wrap gap-2 pt-1">
                    <button
                        type="button"
                        disabled={storageBusy}
                        onClick={() => void refreshStorageStatus()}
                        className="rounded-[12px] bg-white/10 hover:bg-white/15 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white/70 hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
                    >
                        {t('stRefreshUsage')}
                    </button>
                </div>
            </SectionCard>

            {/* Política de Retención e Intención */}
            <SectionCard className="flex flex-col gap-4">
                <SectionTitle icon={FaHardDrive} label={t('stRetention')} />
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        aria-pressed={retention === 'keep'}
                        onClick={() => handleRetentionChange('keep')}
                        className={`rounded-[14px] p-3 text-left transition-all cursor-pointer ${
                            retention === 'keep'
                                ? 'bg-emerald-500/15 text-white shadow-[0_2px_12px_rgba(16,185,129,0.15)]'
                                : 'bg-white/[0.025] hover:bg-white/[0.05] text-white/60'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{t('stKeepLocal')}</span>
                            {retention === 'keep' && <FaCheck size={10} className="text-emerald-400" />}
                        </div>
                        <span className="mt-1 block text-[10px] text-white/40">{t('stKeepLocalDesc')}</span>
                    </button>

                    <button
                        type="button"
                        aria-pressed={retention === 'online'}
                        onClick={() => handleRetentionChange('online')}
                        className={`rounded-[14px] p-3 text-left transition-all cursor-pointer ${
                            retention === 'online'
                                ? 'bg-emerald-500/15 text-white shadow-[0_2px_12px_rgba(16,185,129,0.15)]'
                                : 'bg-white/[0.025] hover:bg-white/[0.05] text-white/60'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{t('stOnlineOnly')}</span>
                            {retention === 'online' && <FaCheck size={10} className="text-emerald-400" />}
                        </div>
                        <span className="mt-1 block text-[10px] text-white/40">{t('stOnlineOnlyDesc')}</span>
                    </button>
                </div>

                {retentionPreviewPending && (
                    <div className="rounded-[14px] bg-amber-400/10 p-3 shadow-inner text-[10px] text-amber-200 flex flex-col gap-2">
                        <span>{t('stSwitchedOnline')}</span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setRetentionPreviewPending(false);
                                    void handlePreviewPurge();
                                }}
                                className="rounded-[10px] bg-amber-400/20 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-200 hover:bg-amber-400/30 transition-colors cursor-pointer"
                            >
                                {t('stPreviewPurge')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setRetention('keep');
                                    setRetentionPreviewPending(false);
                                }}
                                className="rounded-[10px] bg-white/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-white/60 hover:text-white transition-colors cursor-pointer"
                            >
                                {t('stRevertKeep')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Ajustes de Cuota e Intención */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <div className="rounded-[14px] bg-black/35 p-3 shadow-inner flex flex-col gap-1.5">
                        <label htmlFor="settings-storage-intent" className="text-[9px] font-bold uppercase tracking-wider text-white/40">{t('stIntent')}</label>
                        <select
                            id="settings-storage-intent"
                            value={storageIntent}
                            onChange={(e) => setStorageIntent(e.target.value as StorageIntent)}
                            className="w-full rounded-xl bg-black/50 px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer"
                        >
                            <option value="balanced">{t('stBalanced')}</option>
                            <option value="knowledge">{t('stKnowledge')}</option>
                            <option value="archive">{t('stArchive')}</option>
                        </select>
                    </div>

                    <div className="rounded-[14px] bg-black/35 p-3 shadow-inner flex flex-col gap-1.5">
                        <label htmlFor="settings-quota-gib" className="text-[9px] font-bold uppercase tracking-wider text-white/40">{t('stQuotaGib')}</label>
                        <input
                            id="settings-quota-gib"
                            type="number"
                            min="0"
                            max="2048"
                            step="1"
                            value={quotaBytes === 0 ? '' : Math.round(quotaBytes / BYTES_PER_GIB)}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setQuotaBytes(Number.isFinite(val) && val > 0 ? Math.round(val * BYTES_PER_GIB) : 0);
                            }}
                            placeholder={t('stNoLimit')}
                            className="w-full rounded-xl bg-black/50 px-2.5 py-1.5 text-xs font-mono text-white outline-none placeholder:text-white/20"
                        />
                    </div>

                    <div className="rounded-[14px] bg-black/35 p-3 shadow-inner flex flex-col gap-1.5">
                        <label htmlFor="settings-reserve-gib" className="text-[9px] font-bold uppercase tracking-wider text-white/40">{t('stReserveGib')}</label>
                        <input
                            id="settings-reserve-gib"
                            type="number"
                            min="0"
                            max="500"
                            step="1"
                            value={reserveBytes === 0 ? '' : Math.round(reserveBytes / BYTES_PER_GIB)}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setReserveBytes(Number.isFinite(val) && val > 0 ? Math.round(val * BYTES_PER_GIB) : 0);
                            }}
                            placeholder="5"
                            className="w-full rounded-xl bg-black/50 px-2.5 py-1.5 text-xs font-mono text-white outline-none placeholder:text-white/20"
                        />
                    </div>
                </div>
            </SectionCard>

            {/* Purga Inteligente & Papelera */}
            <SectionCard className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <SectionTitle icon={FaTrashCan} label={t('stSmartPurge')} />
                    {lastPurgeId && (
                        <button
                            type="button"
                            disabled={storageBusy}
                            onClick={() => void handleUndoPurge()}
                            className="flex items-center gap-1.5 rounded-[10px] bg-[#25f4ee]/15 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-[#25f4ee] hover:bg-[#25f4ee]/25 transition-colors cursor-pointer"
                        >
                            <FaArrowRotateLeft size={8} /> {t('stUndoPurge')}
                        </button>
                    )}
                </div>

                <p className="text-[10px] leading-relaxed text-white/45">
                    {t('stSmartPurgeDesc')}
                </p>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={storageBusy}
                        onClick={() => void handlePreviewPurge()}
                        className="rounded-[12px] bg-amber-400/15 hover:bg-amber-400/25 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-amber-200 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                        {storageBusy ? t('stCalculating') : t('stPreviewCandidates')}
                    </button>

                    {(storageStatus?.trashBytes ?? 0) > 0 && !trashConfirming && (
                        <button
                            type="button"
                            disabled={storageBusy}
                            onClick={() => setTrashConfirming(true)}
                            className="rounded-[12px] bg-[#fe2c55]/15 hover:bg-[#fe2c55]/25 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#fe2c55] transition-colors disabled:opacity-40 cursor-pointer"
                        >
                            {t('stEmptyTrash', { value: formatStorageBytes(storageStatus?.trashBytes, locale) })}
                        </button>
                    )}

                    {trashConfirming && (
                        <div className="flex items-center gap-2 rounded-[12px] bg-[#fe2c55]/20 px-3 py-1.5 shadow-inner">
                            <span className="text-[9px] font-bold text-[#fe2c55]">{t('stConfirmDelete')}</span>
                            <button
                                type="button"
                                onClick={() => void handleEmptyTrash()}
                                className="rounded-[8px] bg-[#fe2c55] px-2 py-1 text-[8px] font-black uppercase text-white hover:bg-[#fe2c55]/80"
                            >
                                {t('stYesEmpty')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setTrashConfirming(false)}
                                className="rounded-[8px] bg-white/10 px-2 py-1 text-[8px] font-black uppercase text-white/60 hover:text-white"
                            >
                                {t('stCancel')}
                            </button>
                        </div>
                    )}
                </div>

                {/* Previsualización de Purga */}
                {purgePreview && (
                    <div className="flex flex-col gap-3 rounded-[16px] bg-black/40 p-3.5 shadow-inner">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-xs font-bold text-white">
                                    {storageCandidates.length} {t('stFilesScanned')}
                                </span>
                                <span className="block text-[9px] text-white/40">
                                    {t('stSelectedForPurge', { count: purgeSelection.length, value: formatStorageBytes(selectedPurgeBytes, locale) })}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const selectable = storageCandidates.filter(c => !c.protected).map(c => c.jobId);
                                        setPurgeSelection(prev => prev.length === selectable.length ? [] : selectable);
                                    }}
                                    className="rounded-[8px] bg-white/10 px-2 py-1 text-[8px] font-black uppercase text-white/70 hover:text-white"
                                >
                                    {purgeSelection.length > 0 ? t('stDeselect') : t('stAll')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPurgePreview(null)}
                                    className="rounded-[8px] bg-white/5 px-2 py-1 text-[8px] font-black uppercase text-white/40 hover:text-white"
                                >
                                    {t('stClose')}
                                </button>
                            </div>
                        </div>

                        {purgePreview.message && (
                            <p className="text-[9px] text-white/50 leading-relaxed">{purgePreview.message}</p>
                        )}

                        {/* Candidates List */}
                        <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                            {storageCandidates.map(candidate => {
                                const selected = purgeSelection.includes(candidate.jobId);
                                return (
                                    <div
                                        key={candidate.jobId}
                                        className={`flex gap-2 rounded-[12px] p-2.5 transition-all ${
                                            candidate.protected
                                                ? 'bg-emerald-400/10 opacity-75'
                                                : selected
                                                ? 'bg-amber-400/15 shadow-[0_2px_10px_rgba(251,191,36,0.15)]'
                                                : 'bg-black/30'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            disabled={candidate.protected}
                                            checked={selected}
                                            onChange={() => {
                                                if (candidate.protected) return;
                                                setPurgeSelection(prev =>
                                                    prev.includes(candidate.jobId)
                                                        ? prev.filter(id => id !== candidate.jobId)
                                                        : [...prev, candidate.jobId]
                                                );
                                            }}
                                            className="h-3.5 w-3.5 accent-amber-400 mt-0.5 cursor-pointer disabled:opacity-30"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="truncate text-[10px] font-bold text-white/90">{candidate.title}</span>
                                                {candidate.favorite && <FaStar size={8} className="text-amber-300" />}
                                                {candidate.pinned && <FaThumbtack size={8} className="text-[#25f4ee]" />}
                                                {candidate.protected && (
                                                    <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.2 text-[7px] font-bold text-emerald-300">
                                                        {t('stProtected')}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-[8px] text-white/40 mt-0.5">
                                                <span className="font-mono text-white/60">{formatStorageBytes(candidate.mediaBytes, locale)}</span>
                                                {candidate.reasons.length > 0 && (
                                                    <span>· {candidate.reasons.map(reasonLabel).join(', ')}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Apply Purge CTA */}
                        {purgeSelection.length > 0 && !purgeConfirming && (
                            <button
                                type="button"
                                disabled={storageBusy}
                                onClick={() => setPurgeConfirming(true)}
                                className="w-full rounded-[12px] bg-amber-400/20 hover:bg-amber-400/30 py-2.5 text-[10px] font-black uppercase tracking-wider text-amber-200 transition-colors cursor-pointer"
                            >
                                {t('stMoveToTrash', { count: purgeSelection.length, value: formatStorageBytes(selectedPurgeBytes, locale) })}
                            </button>
                        )}

                        {purgeConfirming && (
                            <div className="flex flex-col gap-2 rounded-[14px] bg-amber-400/15 p-3 shadow-inner">
                                <span className="text-[10px] font-bold text-amber-200">
                                    {t('stConfirmMove', { count: purgeSelection.length })}
                                </span>
                                <span className="text-[9px] text-white/50">{t('stRestorable')}</span>
                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        disabled={storageBusy}
                                        onClick={() => void handleApplyPurge()}
                                        className="flex-1 rounded-[10px] bg-amber-400 py-2 text-[9px] font-black uppercase tracking-wider text-black hover:bg-amber-300 transition-colors"
                                    >
                                        {t('stConfirmPurge')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPurgeConfirming(false)}
                                        className="rounded-[10px] bg-white/10 px-4 py-2 text-[9px] font-black uppercase text-white/60 hover:text-white"
                                    >
                                        {t('stCancel')}
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
