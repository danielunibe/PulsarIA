import { useCallback, useState, useEffect, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';
import { SHADOW, SURFACE, ACCENT } from '@/lib/design-tokens';
import { useSettings, AppTheme, RetentionPolicy, StorageIntent, PerformanceMode, AnalysisDepth } from '@/lib/settings-context';
import { useI18n } from '@/lib/i18n';
import { isTauriRuntime, useProcessingSettings } from '@/hooks/use-processing-settings';
import { useUpdater } from '@/hooks/use-updater';
import { isCompletedJob, isFailedJob, type JobRecord } from '@/hooks/use-jobs';
import { cancelLocalLlmDownload, ensureLocalLlm, getLocalLlmStatus, type LocalLlmStatus } from '@/lib/local-llm';
import { GeneralTab } from './settings/GeneralTab';
import { EngineTab } from './settings/EngineTab';
import { AiTab } from './settings/AiTab';
import { StatsTab } from './settings/StatsTab';
import { PerformanceTab, type AccelerationStatusUi, type PerformancePolicyUi } from './settings/PerformanceTab';
import type { PageConfig } from './PagePanel';
import type { SearchMode } from './Header';

import { 
    FaDownload, 
    FaFolder, 
    FaCheck, 
    FaFilm, 
    FaMusic, 
    FaFileLines, 
    FaPalette,
    FaChartSimple,
    FaMicrochip,
    FaBolt,
    FaBrain,
    FaRotate,
    FaPlay,
    FaTriangleExclamation,
    FaSliders,
    FaHardDrive,
    FaTrashCan,
    FaArrowRotateLeft,
    FaShieldHalved,
    FaStar,
    FaThumbtack,
    FaLanguage,
} from '@/components/icon-library';

// ── Solid Icons (Filled) ──
const SolidDownloadIcon = () => <FaDownload size={18} />;
const SolidFolderIcon = () => <FaFolder size={11} />;
const SolidPaletteIcon = () => <FaPalette size={13} />;
const SolidLanguageIcon = () => <FaLanguage size={13} />;
const SolidCheckIcon = () => <FaCheck size={18} />;

/**
 * Opciones de tema visual disponibles para la aplicación.
 * Cada tema define gradientes, colores de borde y acentos.
 */
const THEME_OPTIONS: Array<{
    id: AppTheme;
    name: string;
    badge?: string;
    desc: string;
    gradient: string;
    borderColor: string;
    accentColor: string;
}> = [
    {
        id: 'carbon',
        name: 'Gris Carbón',
        badge: 'Predeterminado',
        desc: 'Grafito oscuro mate de alta legibilidad y elegancia sobria',
        gradient: 'radial-gradient(ellipse at top left, #1e2026 0%, #121316 70%, #0a0b0d 100%)',
        borderColor: 'rgba(255,255,255,0.18)',
        accentColor: '#94a3b8',
    },
    {
        id: 'chromatic',
        name: 'Pulsar Chromatic',
        badge: 'Fondo Actual',
        desc: 'Ondas WebGL multicromáticas vibrantes en tiempo real',
        gradient: 'linear-gradient(135deg, rgba(254,44,85,0.7) 0%, rgba(138,92,255,0.7) 50%, rgba(37,244,238,0.7) 100%)',
        borderColor: 'rgba(254,44,85,0.4)',
        accentColor: '#fe2c55',
    },
    {
        id: 'aurora',
        name: 'Aurora Boreal',
        badge: 'Luz Ambiental',
        desc: 'Suaves estelas boreales TikTok con animación fluida',
        gradient: 'radial-gradient(ellipse at 30% 30%, rgba(37,244,238,0.4) 0%, rgba(254,44,85,0.3) 60%, #06080f 100%)',
        borderColor: 'rgba(37,244,238,0.4)',
        accentColor: '#25f4ee',
    },
    {
        id: 'oled',
        name: 'Negro Puro (OLED)',
        badge: 'Máximo Contraste',
        desc: 'Negro absoluto ultra limpio optimizado para OLED',
        gradient: 'linear-gradient(180deg, #09090b 0%, #000000 100%)',
        borderColor: 'rgba(255,255,255,0.1)',
        accentColor: '#ffffff',
    },
    {
        id: 'cyberpunk',
        name: 'Obsidiana Cyberpunk',
        badge: 'Espacio Neón',
        desc: 'Nebulosa violeta profunda con destellos galácticos',
        gradient: 'linear-gradient(135deg, #240b36 0%, #0e051a 100%)',
        borderColor: 'rgba(168,85,247,0.4)',
        accentColor: '#c084fc',
    },
    {
        id: 'solar',
        name: 'Atardecer Ámbar',
        badge: 'Cálido Solar',
        desc: 'Gradiente solar profundo y discreto',
        gradient: 'linear-gradient(135deg, #450a0a 0%, #ea580c 100%)',
        borderColor: 'rgba(245,158,11,0.4)',
        accentColor: '#f59e0b',
    },
];

const FORMAT_CATEGORIES = [
    {
        title: 'Video',
        icon: FaFilm,
        options: [
            { id: 'mp4', label: 'MP4', desc: 'Video standard', color: '#3b82f6' },
            { id: 'mkv', label: 'MKV', desc: 'Matroska Video', color: '#3b82f6' },
            { id: 'webm', label: 'WEBM', desc: 'Web Media', color: '#3b82f6' },
            { id: 'mov', label: 'MOV', desc: 'QuickTime Movie', color: '#3b82f6' },
        ]
    },
    {
        title: 'Audio',
        icon: FaMusic,
        options: [
            { id: 'wav', label: 'WAV', desc: 'Lossless Audio', color: '#f59e0b' },
            { id: 'mp3', label: 'MP3', desc: 'Compressed Audio', color: '#f59e0b' },
            { id: 'flac', label: 'FLAC', desc: 'Free Lossless', color: '#f59e0b' },
            { id: 'ogg', label: 'OGG', desc: 'Ogg Vorbis', color: '#f59e0b' },
            { id: 'm4a', label: 'M4A', desc: 'Apple Audio', color: '#f59e0b' },
        ]
    },
    {
        title: 'Text',
        icon: FaFileLines,
        options: [
            { id: 'txt', label: 'TXT', desc: 'Plain Text', color: '#10b981' },
            { id: 'srt', label: 'SRT', desc: 'Subtitles', color: '#10b981' },
            { id: 'vtt', label: 'VTT', desc: 'Web Video Text', color: '#10b981' },
            { id: 'json', label: 'JSON', desc: 'Data Format', color: '#10b981' },
        ]
    }
];

export function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            className={cn('rounded-[20px] p-4 border-0 transition-all', className)}
            style={{
                border: 'none',
                background: 'rgba(18, 20, 26, 0.75)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}
        >
            {children}
        </div>
    );
}

export function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
    return (
        <div className="flex items-center gap-2 mb-3">
            <div
                className="w-5 h-5 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--accent-primary)]"
                style={{ background: ACCENT.primary12, boxShadow: SHADOW.nmInset }}
            >
                <Icon />
            </div>
            <span className="font-black tracking-[0.2em] uppercase" style={{ fontSize: 'var(--text-micro)', color: 'var(--text-ghost)' }}>
                {label}
            </span>
        </div>
    );
}

type SettingsTab = 'general' | 'stats' | 'engine' | 'ai' | 'performance';

export interface SettingsPanelProps {
    onClose: () => void;
    jobs?: JobRecord[];
    onPlaylistSelect?: (id: number | null) => void;
    embedded?: boolean;
    onReviewConsent?: () => void;
    pageConfig?: PageConfig;
    onPageConfigChange?: (config: PageConfig) => void;
    searchMode?: SearchMode;
    onSearchModeChange?: (mode: SearchMode) => void;
}

interface CollectionSource {
    id: number;
    url: string;
    profile_url?: string;
    platform?: string;
    source_type: string;
    username?: string | null;
    display_name?: string | null;
    status?: string;
    active: boolean;
    last_success_at?: string | null;
    last_sync_at?: string | null;
    next_sync_at?: string | null;
    discovered_count: number;
    consecutive_failures: number;
    last_error?: string | null;
}

interface HealthEventRecord {
    id: number;
    created_at: string;
    component: string;
    severity: string;
    diagnosis: string;
    action?: string | null;
    result?: string | null;
}

interface RuntimeHealth {
    model: { model: string; ready: boolean; status: string; message?: string | null };
    queue_depth: number;
    backpressure_active: boolean;
    worker_capacity: number;
    idle_workers: number;
    processing_paused?: boolean;
    background_admission_paused?: boolean;
    autostart_enabled: boolean;
    api_ready: boolean;
    api_error?: string | null;
}

type SavedProcessingSettings = {
    quality: number;
    profile: 'fast' | 'balanced' | 'high';
    video_fit: 'cover' | 'contain';
};

type StorageState = 'ok' | 'quota-near' | 'quota-exceeded' | 'disk-low' | 'path-error' | 'unknown';

interface StorageStatusUi {
    rootPath: string;
    totalBytes: number | null;
    freeBytes: number | null;
    quotaBytes: number | null;
    usedMediaBytes: number | null;
    stagedBytes: number | null;
    trashBytes: number | null;
    reserveBytes: number | null;
    state: StorageState;
}

interface PurgeCandidateUi {
    jobId: number;
    title: string;
    mediaBytes: number;
    interestScore: number;
    reasons: string[];
    protected: boolean;
    favorite?: boolean;
    pinned?: boolean;
    transcriptAvailable?: boolean;
    sourceState?: string;
}

interface PurgePreviewUi {
    candidates: PurgeCandidateUi[];
    purgeId?: string;
    message?: string;
    native: boolean;
}

type StorageAwareJob = JobRecord & {
    audio_path?: string;
    transcript_path?: string;
    source_state?: string;
    media_bytes?: number;
    video_size_bytes?: number;
    audio_size_bytes?: number;
    last_accessed_at?: string;
    downloaded_at?: string;
    play_count?: number;
    open_count?: number;
    search_hit_count?: number;
    favorite?: boolean;
    pinned?: boolean;
    protected?: boolean;
};

const BYTES_PER_GIB = 1024 ** 3;

function formatStorageBytes(bytes: number | null | undefined) {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return 'No medido';
    if (bytes >= BYTES_PER_GIB) return `${(bytes / BYTES_PER_GIB).toFixed(bytes >= 10 * BYTES_PER_GIB ? 0 : 1)} GiB`;
    return `${Math.max(0, Math.round(bytes / 1024 / 1024))} MiB`;
}

function optionalJobNumber(job: StorageAwareJob, keys: Array<keyof StorageAwareJob>) {
    for (const key of keys) {
        const value = job[key];
        if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
    }
    return 0;
}

function jobSourceState(job: StorageAwareJob) {
    if (job.video_path) return 'local';
    if (job.source_state === 'unavailable') return 'unavailable';
    if (job.source_state === 'online' || job.keep_status === 'online') return 'online';
    return 'unavailable';
}

function fallbackPurgeCandidates(jobs: JobRecord[]): PurgeCandidateUi[] {
    const now = Date.now();
    return (jobs as StorageAwareJob[])
        .filter((job) => {
            const sourceState = jobSourceState(job);
            const isProtected = Boolean(job.favorite || job.pinned || job.protected);
            return sourceState === 'online' && !isProtected;
        })
        .map((job) => {
            const reportedMediaBytes = optionalJobNumber(job, ['media_bytes']);
            const mediaBytes = reportedMediaBytes > 0
                ? reportedMediaBytes
                : optionalJobNumber(job, ['video_size_bytes']) + optionalJobNumber(job, ['audio_size_bytes']);
            const playCount = optionalJobNumber(job, ['play_count']);
            const openCount = optionalJobNumber(job, ['open_count']);
            const searchHits = optionalJobNumber(job, ['search_hit_count']);
            const lastAccess = job.last_accessed_at ? Date.parse(job.last_accessed_at) : NaN;
            const ageDays = Number.isFinite(lastAccess) ? Math.max(0, (now - lastAccess) / 86_400_000) : 365;
            const recencyScore = Math.max(0, 30 - Math.min(30, ageDays));
            const interestScore = Math.round(playCount * 100 + openCount * 10 + searchHits * 5 + recencyScore);
            const reasons = ['Fuente marcada online', 'No está protegido'];
            if (playCount === 0) reasons.push('Sin reproducciones registradas');
            if (openCount === 0) reasons.push('Sin aperturas de ficha registradas');
            if (searchHits === 0) reasons.push('Sin coincidencias seleccionadas');
            if (ageDays > 30) reasons.push('Último acceso antiguo o no registrado');
            return {
                jobId: job.id,
                title: job.title || job.url || `Job #${job.id}`,
                mediaBytes,
                interestScore,
                reasons,
                protected: false,
                favorite: Boolean(job.favorite),
                pinned: Boolean(job.pinned),
                transcriptAvailable: Boolean(job.transcript_path || job.instructional_guide || job.visual_analysis),
                sourceState: jobSourceState(job),
                lastAccess: Number.isFinite(lastAccess) ? lastAccess : Number.POSITIVE_INFINITY,
                downloadedAt: job.downloaded_at ? Date.parse(job.downloaded_at) : Number.POSITIVE_INFINITY,
            };
        })
        .sort((a, b) => a.interestScore - b.interestScore || a.lastAccess - b.lastAccess || a.downloadedAt - b.downloadedAt || a.jobId - b.jobId)
        .map(({ lastAccess: _lastAccess, downloadedAt: _downloadedAt, ...candidate }) => candidate);
}

function normalizeStorageStatus(value: unknown): StorageStatusUi | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const state = String(raw.state ?? 'unknown').replaceAll('_', '-') as StorageState;
    const validStates: StorageState[] = ['ok', 'quota-near', 'quota-exceeded', 'disk-low', 'path-error', 'unknown'];
    return {
        rootPath: String(raw.rootPath ?? raw.root_path ?? 'Carpeta no disponible'),
        totalBytes: typeof (raw.totalBytes ?? raw.total_bytes) === 'number' ? raw.totalBytes as number ?? raw.total_bytes as number : null,
        freeBytes: typeof (raw.freeBytes ?? raw.free_bytes) === 'number' ? raw.freeBytes as number ?? raw.free_bytes as number : null,
        quotaBytes: typeof (raw.quotaBytes ?? raw.quota_bytes) === 'number' ? raw.quotaBytes as number ?? raw.quota_bytes as number : null,
        usedMediaBytes: typeof (raw.usedMediaBytes ?? raw.used_media_bytes) === 'number' ? raw.usedMediaBytes as number ?? raw.used_media_bytes as number : null,
        stagedBytes: typeof (raw.stagedBytes ?? raw.staged_bytes) === 'number' ? raw.stagedBytes as number ?? raw.staged_bytes as number : null,
        trashBytes: typeof (raw.trashBytes ?? raw.trash_bytes) === 'number' ? raw.trashBytes as number ?? raw.trash_bytes as number : null,
        reserveBytes: typeof (raw.reserveBytes ?? raw.reserve_bytes) === 'number' ? raw.reserveBytes as number ?? raw.reserve_bytes as number : null,
        state: validStates.includes(state) ? state : 'unknown',
    };
}

function normalizePurgeCandidate(value: unknown): PurgeCandidateUi | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const jobId = typeof raw.jobId === 'number' ? raw.jobId : typeof raw.job_id === 'number' ? raw.job_id : null;
    if (jobId === null) return null;
    const reasons = Array.isArray(raw.reasons)
        ? raw.reasons.filter((reason): reason is string => typeof reason === 'string')
        : [];
    return {
        jobId,
        title: String(raw.title ?? `Job #${jobId}`),
        mediaBytes: typeof raw.mediaBytes === 'number' ? raw.mediaBytes : typeof raw.media_bytes === 'number' ? raw.media_bytes : 0,
        interestScore: typeof raw.interestScore === 'number' ? raw.interestScore : typeof raw.interest_score === 'number' ? raw.interest_score : 0,
        reasons,
        protected: Boolean(raw.protected || raw.favorite || raw.pinned),
        favorite: Boolean(raw.favorite),
        pinned: Boolean(raw.pinned),
        transcriptAvailable: Boolean(raw.transcriptAvailable ?? raw.transcript_available),
        sourceState: typeof raw.sourceState === 'string' ? raw.sourceState : typeof raw.source_state === 'string' ? raw.source_state : undefined,
    };
}

function normalizePurgePreview(value: unknown): PurgePreviewUi | null {
    const raw = Array.isArray(value)
        ? { candidates: value }
        : value && typeof value === 'object'
            ? value as Record<string, unknown>
            : null;
    if (!raw) return null;
    const candidates = Array.isArray(raw.candidates)
        ? raw.candidates.map(normalizePurgeCandidate).filter((candidate): candidate is PurgeCandidateUi => Boolean(candidate))
        : [];
    return {
        candidates,
        purgeId: typeof raw.purgeId === 'string' ? raw.purgeId : typeof raw.purge_id === 'string' ? raw.purge_id : undefined,
        message: typeof raw.message === 'string' ? raw.message : undefined,
        native: true,
    };
}

async function invokeOptionalCommand<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
    if (!isTauriRuntime()) return null;
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<T>(command, args);
    } catch (error) {
        if (isTauriRuntime()) throw error;
        return null;
    }
}

export function SettingsPanel({
    onClose,
    jobs = [],
    onPlaylistSelect,
    embedded = false,
    onReviewConsent,
    pageConfig,
    onPageConfigChange,
    searchMode,
    onSearchModeChange,
}: SettingsPanelProps) {
    const { settings, updateSettings } = useSettings();
    const { locale, setLocale, t } = useI18n();
    const processingSetup = useProcessingSettings();
    const hasActiveJob = jobs.some((job) => !isCompletedJob(job) && !isFailedJob(job));
    const updater = useUpdater({ hasActiveJob });
    const updaterBlocked = process.env.NEXT_PUBLIC_PULSARIA_UPDATER_ENABLED !== 'true';
    const updaterChannel = process.env.NEXT_PUBLIC_PULSARIA_UPDATE_CHANNEL === 'rc' ? 'RC' : 'estable';

    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [formats, setFormats] = useState<string[]>(settings.formats);
    const [folder, setFolder] = useState(settings.folder);
    const [selectedTheme, setSelectedTheme] = useState<AppTheme>(settings.theme || 'chromatic');
    const [retention, setRetention] = useState<RetentionPolicy>(settings.retention || 'keep');
    const [cookiesBrowser, setCookiesBrowser] = useState<typeof settings.cookiesBrowser>(settings.cookiesBrowser || '');
    const [processingQuality, setProcessingQuality] = useState(settings.processingQuality);
    const [videoFit, setVideoFit] = useState(settings.videoFit);
    const [storageIntent, setStorageIntent] = useState(settings.storageIntent);
    const [quotaBytes, setQuotaBytes] = useState(settings.quotaBytes);
    const [reserveBytes, setReserveBytes] = useState(settings.reserveBytes);
    const [showTikTokPill, setShowTikTokPill] = useState(settings.showTikTokPill);
    const [hoverAutoplay, setHoverAutoplay] = useState(settings.hoverAutoplay);
    const [showDemoVideos, setShowDemoVideos] = useState(settings.showDemoVideos);
    const [autostartEnabled, setAutostartEnabled] = useState(false);
    const [keepInTrayOnClose, setKeepInTrayOnClose] = useState(settings.keepInTrayOnClose);
    const [subtitleEnabled, setSubtitleEnabled] = useState(settings.subtitleEnabled);
    const [subtitleStyle, setSubtitleStyle] = useState(settings.subtitleStyle);
    const [playbackProfile, setPlaybackProfile] = useState(settings.playbackProfile);
    const [gpuEnhancementEnabled, setGpuEnhancementEnabled] = useState(settings.gpuEnhancementEnabled);
    const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(settings.performanceMode);
    const [backgroundProcessing, setBackgroundProcessing] = useState(settings.backgroundProcessing);
    const [startInBackground, setStartInBackground] = useState(settings.startInBackground);
    const [idleThresholdSeconds, setIdleThresholdSeconds] = useState(settings.idleThresholdSeconds);
    const [acOnlyForMaximum, setAcOnlyForMaximum] = useState(settings.acOnlyForMaximum);
    const [preferredAdapterId, setPreferredAdapterId] = useState<string | null>(settings.preferredAdapterId);
    const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>(settings.analysisDepth);
    const [lastVerifiedAccelerators, setLastVerifiedAccelerators] = useState<string | null>(settings.lastVerifiedAccelerators);
    const [accelerationStatus, setAccelerationStatus] = useState<AccelerationStatusUi | null>(null);
    const [performancePolicy, setPerformancePolicy] = useState<PerformancePolicyUi | null>(null);
    const [benchmarkBusy, setBenchmarkBusy] = useState(false);
    const initialSettingsRef = useRef(settings);
    const selectedWhisperModel = processingQuality < 35
        ? 'tiny'
        : processingQuality < 72
            ? 'small'
            : processingSetup.hardware?.whisper_gpu_supported
                ? 'medium'
                : 'small';

    // Engine & Model State
    const [modelOnline, setModelOnline] = useState<boolean | null>(null);
    const [similarityThreshold, setSimilarityThreshold] = useState(0.45);
    const [hnswShards] = useState(4);
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const [sources, setSources] = useState<CollectionSource[]>([]);
    const [healthEvents, setHealthEvents] = useState<HealthEventRecord[]>([]);
    const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth | null>(null);
    const [healthBusy, setHealthBusy] = useState(false);
    const [pendingSourceDelete, setPendingSourceDelete] = useState<CollectionSource | null>(null);
    const [updateConfirming, setUpdateConfirming] = useState(false);
    const [storageStatus, setStorageStatus] = useState<StorageStatusUi | null>(null);
    const [storageBusy, setStorageBusy] = useState(false);
    const [storageMessage, setStorageMessage] = useState<string | null>(null);
    const [storageError, setStorageError] = useState<string | null>(null);
    const [purgePreview, setPurgePreview] = useState<PurgePreviewUi | null>(null);
    const [purgeSelection, setPurgeSelection] = useState<number[]>([]);
    const [purgeConfirming, setPurgeConfirming] = useState(false);
    const [lastPurgeId, setLastPurgeId] = useState<number | null>(null);
    const [trashConfirming, setTrashConfirming] = useState(false);
    const [retentionPreviewPending, setRetentionPreviewPending] = useState(false);
    const [localLlmStatus, setLocalLlmStatus] = useState<LocalLlmStatus | null>(null);
    const [localLlmBusy, setLocalLlmBusy] = useState(false);
    const [localLlmMessage, setLocalLlmMessage] = useState<string | null>(null);

    // AI Cluster State
    const [clusterThreshold, setClusterThreshold] = useState(0.70);
    const [clusterMinSize, setClusterMinSize] = useState(2);
    const [clustersList, setClustersList] = useState<Array<{ count: number; jobs: JobRecord[]; playlistId?: number; name: string; keywords: string[] }>>([]);
    const [clusteringLoading, setClusteringLoading] = useState(false);
    const [clusteringError, setClusteringError] = useState<string | null>(null);
    const [organizationCondition, setOrganizationCondition] = useState('');

    const [now] = useState(() => Date.now());

    const refreshLocalLlm = useCallback(async () => {
        try {
            setLocalLlmStatus(await getLocalLlmStatus());
        } catch {
            setLocalLlmMessage('No se pudo consultar el estado de la IA local.');
        }
    }, []);

    useEffect(() => {
        void refreshLocalLlm();
    }, [refreshLocalLlm]);

    useEffect(() => {
        let mounted = true;
        let unlisten: (() => void) | undefined;
        void (async () => {
            if (!isTauriRuntime()) return;
            const { listen } = await import('@tauri-apps/api/event');
            if (!mounted) return;
            unlisten = await listen<LocalLlmStatus>('local-llm-progress', (event) => setLocalLlmStatus(event.payload));
        })();
        return () => {
            mounted = false;
            unlisten?.();
        };
    }, []);

    useEffect(() => {
        if (localLlmStatus?.state !== 'downloading') return;
        const timer = window.setInterval(() => void refreshLocalLlm(), 1000);
        return () => window.clearInterval(timer);
    }, [localLlmStatus?.state, refreshLocalLlm]);

    const refreshAcceleration = useCallback(async () => {
        if (!isTauriRuntime()) return;
        try {
            const [status, policy] = await Promise.all([
                invokeOptionalCommand<AccelerationStatusUi>('get_acceleration_status'),
                invokeOptionalCommand<PerformancePolicyUi>('get_performance_policy'),
            ]);
            if (status) setAccelerationStatus(status);
            if (policy) setPerformancePolicy(policy);
        } catch (error) {
            setSettingsError(error instanceof Error ? error.message : String(error));
        }
    }, []);

    useEffect(() => {
        if (activeTab !== 'performance') return;
        void refreshAcceleration();
    }, [activeTab, refreshAcceleration]);

    useEffect(() => {
        let mounted = true;
        let unlisten: (() => void) | undefined;
        void (async () => {
            if (!isTauriRuntime()) return;
            const { listen } = await import('@tauri-apps/api/event');
            if (!mounted) return;
            unlisten = await listen<AccelerationStatusUi>('acceleration-status-changed', (event) => {
                if (mounted) setAccelerationStatus(event.payload);
            });
        })();
        return () => {
            mounted = false;
            unlisten?.();
        };
    }, []);

    const runAccelerationBenchmark = async () => {
        if (!isTauriRuntime() || benchmarkBusy) return;
        setBenchmarkBusy(true);
        setSettingsError(null);
        try {
            const report = await invokeOptionalCommand<{ status: AccelerationStatusUi }>(
                'run_acceleration_benchmark',
                { samplePath: null },
            );
            if (report?.status) {
                setAccelerationStatus(report.status);
                setLastVerifiedAccelerators(JSON.stringify(report));
                const policy = await invokeOptionalCommand<PerformancePolicyUi>('get_performance_policy');
                if (policy) setPerformancePolicy(policy);
            }
        } catch (error) {
            setSettingsError(error instanceof Error ? error.message : String(error));
        } finally {
            setBenchmarkBusy(false);
        }
    };

    const resetPerformanceProfile = async () => {
        if (!isTauriRuntime()) return;
        try {
            await invokeOptionalCommand('reset_performance_profile');
            setLastVerifiedAccelerators(null);
            await refreshAcceleration();
        } catch (error) {
            setSettingsError(error instanceof Error ? error.message : String(error));
        }
    };

    const changePerformanceMode = (mode: PerformanceMode) => {
        setPerformanceMode(mode);
        setPlaybackProfile(mode);
        if (!isTauriRuntime()) return;
        void invokeOptionalCommand<PerformancePolicyUi>('set_performance_policy', {
            input: {
                mode,
                backgroundProcessing,
                startInBackground: autostartEnabled,
                idleThresholdSeconds,
                acOnlyForMaximum,
                preferredAdapterId,
                analysisDepth,
            },
        }).then((policy) => {
            if (policy) setPerformancePolicy(policy);
        }).catch((error) => {
            setSettingsError(error instanceof Error ? error.message : String(error));
        });
    };

    const prepareLocalLlm = async () => {
        if (!isTauriRuntime() || localLlmBusy) return;
        setLocalLlmBusy(true);
        setLocalLlmMessage(null);
        try {
            setLocalLlmStatus(await ensureLocalLlm());
            setLocalLlmMessage('Modelo local verificado y disponible.');
        } catch {
            await refreshLocalLlm();
            setLocalLlmMessage('La preparación del modelo local no terminó. Revisa el estado e inténtalo de nuevo.');
        } finally {
            setLocalLlmBusy(false);
        }
    };

    const cancelLocalLlm = async () => {
        await cancelLocalLlmDownload();
        await refreshLocalLlm();
        setLocalLlmBusy(false);
        setLocalLlmMessage('Descarga cancelada; el archivo parcial puede reanudarse después.');
    };

    useEffect(() => {

        let active = true;
        queueMicrotask(() => {
            if (!active) return;
            setFormats(settings.formats);
            setFolder(settings.folder);
            setSelectedTheme(settings.theme || 'chromatic');
            setRetention(settings.retention || 'keep');
            setRetentionPreviewPending(false);
            setCookiesBrowser(settings.cookiesBrowser || '');
            setProcessingQuality(settings.processingQuality);
            setVideoFit(settings.videoFit);
            setStorageIntent(settings.storageIntent);
            setQuotaBytes(settings.quotaBytes);
            setReserveBytes(settings.reserveBytes);
            setShowTikTokPill(settings.showTikTokPill);
            setHoverAutoplay(settings.hoverAutoplay);
            setShowDemoVideos(settings.showDemoVideos);
            setKeepInTrayOnClose(settings.keepInTrayOnClose);
            setSubtitleEnabled(settings.subtitleEnabled);
            setSubtitleStyle(settings.subtitleStyle);
            setPlaybackProfile(settings.playbackProfile);
            setGpuEnhancementEnabled(settings.gpuEnhancementEnabled);
            setPerformanceMode(settings.performanceMode);
            setBackgroundProcessing(settings.backgroundProcessing);
            setStartInBackground(settings.startInBackground);
            setIdleThresholdSeconds(settings.idleThresholdSeconds);
            setAcOnlyForMaximum(settings.acOnlyForMaximum);
            setPreferredAdapterId(settings.preferredAdapterId);
            setAnalysisDepth(settings.analysisDepth);
            setLastVerifiedAccelerators(settings.lastVerifiedAccelerators);
        });
        return () => {
            active = false;
        };
    }, [settings]);

    useEffect(() => {
        if (!isTauriRuntime()) return;
        let active = true;
        void (async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const response = await invoke<{ autostartEnabled: boolean; settings: { minScore: number; storageIntent: StorageIntent; quotaBytes: number; reserveBytes: number } }>('get_app_settings');
                if (!active) return;
                setAutostartEnabled(response.autostartEnabled);
                setStartInBackground(response.autostartEnabled);
                setSimilarityThreshold(response.settings.minScore);
                setStorageIntent(response.settings.storageIntent);
                setQuotaBytes(response.settings.quotaBytes);
                setReserveBytes(response.settings.reserveBytes);
            } catch (error) {
                if (active) setSettingsError(error instanceof Error ? error.message : String(error));
            }
        })();
        return () => { active = false; };
    }, [settings.storageIntent]);

    const refreshHealth = async () => {
        if (!isTauriRuntime()) return;
        const { invoke } = await import('@tauri-apps/api/core');
        const [nextSources, nextEvents, nextRuntime] = await Promise.all([
            invoke<CollectionSource[]>('get_collection_sources'),
            invoke<HealthEventRecord[]>('get_health_events', { limit: 50 }),
            invoke<RuntimeHealth>('get_runtime_health'),
        ]);
        setSources(nextSources);
        setHealthEvents(nextEvents);
        setRuntimeHealth(nextRuntime);
    };

    const refreshStorageStatus = useCallback(async () => {
        if (!isTauriRuntime()) return;
        const rawStatus = await invokeOptionalCommand<unknown>('get_storage_status', { path: folder });
        const nextStatus = normalizeStorageStatus(rawStatus);
        if (nextStatus) {
            setStorageStatus(nextStatus);
            setStorageError(null);
            return;
        }
        setStorageStatus(null);
        setStorageMessage('El shell nativo actual todavía no expone la medición detallada de cuota; no se ha eliminado ningún archivo.');
    }, [folder]);

    const handlePreviewPurge = async () => {
        setStorageBusy(true);
        setStorageError(null);
        setStorageMessage(null);
        try {
            const rawPreview = await invokeOptionalCommand<unknown>('preview_media_purge', { path: folder });
            const nativePreview = normalizePurgePreview(rawPreview);
            if (nativePreview) {
                setPurgePreview(nativePreview);
                setPurgeSelection(nativePreview.candidates.filter((candidate) => !candidate.protected).map((candidate) => candidate.jobId));
                setStorageMessage(nativePreview.message || 'Vista previa calculada por el motor local. Selecciona elementos concretos antes de confirmar.');
                return;
            }

            const fallbackCandidates = fallbackPurgeCandidates(jobs);
            setPurgePreview({
                candidates: fallbackCandidates,
                native: false,
                message: 'Vista informativa basada en los datos visibles; el shell actual no expone preview_media_purge, por lo que esta pantalla no puede borrar nada.',
            });
            setPurgeSelection(fallbackCandidates.filter((candidate) => !candidate.protected).map((candidate) => candidate.jobId));
            setStorageMessage(fallbackCandidates.length > 0
                ? 'Se encontraron candidatos orientativos. La purga permanece bloqueada hasta que exista el comando nativo y una confirmación explícita.'
                : 'No hay candidatos online no protegidos con tamaño reportado. No se ha eliminado ningún archivo.');
        } finally {
            setStorageBusy(false);
        }
    };

    const handleApplyPurge = async () => {
        if (purgeSelection.length === 0) {
            setStorageError('Selecciona al menos un elemento de la vista previa.');
            return;
        }
        if (!isTauriRuntime()) {
            setStorageError('La purga de medios requiere el shell nativo; no se eliminó nada.');
            return;
        }
        setStorageBusy(true);
        setStorageError(null);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const result = await invoke<unknown>('apply_media_purge', {
                jobIds: purgeSelection,
                reason: 'Purga manual confirmada por el usuario',
                path: folder,
            });
            // Rust returns one action per selected job. Keep the last action
            // id as the immediate undo target and never pretend a browser
            // fallback performed a destructive operation.
            const actions = Array.isArray(result) ? result : [result];
            const rawResult = actions.at(-1);
            const rawAction = rawResult && typeof rawResult === 'object'
                ? rawResult as Record<string, unknown>
                : {};
            const rawPurgeId = rawAction.purgeId ?? rawAction.purge_id;
            const numericPurgeId = typeof rawPurgeId === 'number'
                ? rawPurgeId
                : typeof rawPurgeId === 'string' ? Number(rawPurgeId) : NaN;
            setLastPurgeId(Number.isSafeInteger(numericPurgeId) ? numericPurgeId : null);
            setPurgePreview(null);
            setPurgeSelection([]);
            setPurgeConfirming(false);
            setStorageMessage('Medios enviados a la papelera interna. El transcript, embeddings, metadata y artifacts no se tocaron.');
            await refreshStorageStatus();
        } catch (error) {
            setStorageError(`La purga no está disponible en este shell; no se eliminó nada. ${error instanceof Error ? error.message : ''}`.trim());
        } finally {
            setStorageBusy(false);
        }
    };

    const handleUndoPurge = async () => {
        if (lastPurgeId === null || !isTauriRuntime()) {
            setStorageError('No hay una purga nativa recuperable en esta sesión.');
            return;
        }
        setStorageBusy(true);
        setStorageError(null);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('undo_media_purge', { purgeId: lastPurgeId, path: folder });
            setLastPurgeId(null);
            setStorageMessage('La última purga se deshizo correctamente.');
            await refreshStorageStatus();
        } catch (error) {
            setStorageError(`No se pudo deshacer la purga; tus datos no se modificaron. ${error instanceof Error ? error.message : ''}`.trim());
        } finally {
            setStorageBusy(false);
        }
    };

    const handleEmptyTrash = async () => {
        if (!isTauriRuntime()) {
            setStorageError('Vaciar la papelera requiere el shell nativo; no se eliminó nada.');
            return;
        }
        setStorageBusy(true);
        setStorageError(null);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const rawFreed = await invoke<unknown>('empty_media_trash', { path: folder });
            const freedBytes = typeof rawFreed === 'number' ? rawFreed : Number(rawFreed);
            setLastPurgeId(null);
            setTrashConfirming(false);
            setStorageMessage(Number.isFinite(freedBytes) && freedBytes > 0
                ? `Papelera vaciada: ${formatStorageBytes(freedBytes)} liberados. El transcript, embeddings, metadata y artifacts permanecen intactos.`
                : 'La papelera interna ya estaba vacía. No se modificó el conocimiento local.');
            await refreshStorageStatus();
        } catch (error) {
            setStorageError(`No se pudo vaciar la papelera; no se eliminaron datos. ${error instanceof Error ? error.message : ''}`.trim());
        } finally {
            setStorageBusy(false);
        }
    };

    const handleRetentionChange = (nextRetention: RetentionPolicy) => {
        if (nextRetention === retention) return;
        setRetention(nextRetention);
        if (nextRetention !== 'online') {
            setRetentionPreviewPending(false);
            setPurgePreview(null);
            setPurgeSelection([]);
            return;
        }

        // Changing the global policy must surface the same explainable
        // preview used by manual purge. It never deletes media: the user is
        // only acknowledging which existing online candidates are eligible.
        if (settings.retention !== 'online') {
            setRetentionPreviewPending(true);
            setPurgePreview(null);
            setPurgeSelection([]);
            void handlePreviewPurge();
        }
    };

    useEffect(() => {
        if (activeTab !== 'general' || !isTauriRuntime()) return;
        queueMicrotask(() => { void refreshStorageStatus(); });
    }, [activeTab, refreshStorageStatus]);

    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (active) void refreshHealth().catch((error) => console.warn('Initial health refresh failed:', error));
        });
        return () => {
            active = false;
        };
    }, []);

    const runHealthAction = async (action: () => Promise<void>) => {
        setHealthBusy(true);
        setSettingsError(null);
        try {
            await action();
            await refreshHealth();
        } catch (error) {
            setSettingsError(error instanceof Error ? error.message : String(error));
        } finally {
            setHealthBusy(false);
        }
    };

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                // In browser mode (no Tauri), use settings defaults
                if (!isTauriRuntime()) {
                    if (active) setModelOnline(false);
                    return;
                }
                const { invoke } = await import('@tauri-apps/api/core');
                const [downloadDir, modelStatus, searchConfig] = await Promise.all([
                    invoke<string>('get_download_dir'),
                    invoke<{ loaded: boolean }>('get_model_status'),
                    invoke<{ min_score: number }>('get_search_config'),
                ]);
                if (!active) return;
                setFolder(downloadDir);
                setModelOnline(modelStatus.loaded);
                setSimilarityThreshold(searchConfig.min_score);
            } catch (error) {
                if (active) {
                    setModelOnline(false);
                    setSettingsError(error instanceof Error ? error.message : String(error));
                }
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    // Format stats
    const stats = useMemo(() => {
        const completed = jobs.filter(j => j.status === 'complete' || j.status === 'completed');
        const total = completed.length;
        const totalDuration = completed.reduce((acc, j) => acc + (j.duration || 0), 0);
        
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
        const thisWeek = completed.filter(j => new Date(j.created_at || now).getTime() > weekAgo).length;

        return { total, totalDuration, thisWeek };
    }, [jobs, now]);

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    const toggleFormat = (id: string) => {
        setFormats(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
    };

    const handleSelectTheme = (themeId: AppTheme) => {
        setSelectedTheme(themeId);
        updateSettings({ theme: themeId });
    };

    const handleCancel = () => {
        updateSettings(initialSettingsRef.current);
        setShowTikTokPill(initialSettingsRef.current.showTikTokPill);
        setHoverAutoplay(initialSettingsRef.current.hoverAutoplay);
        setShowDemoVideos(initialSettingsRef.current.showDemoVideos);
        onClose();
    };

    const runClustering = async () => {
        setClusteringLoading(true);
        setClusteringError(null);
        try {
            if (!isTauriRuntime()) {
                setClusteringError('Clustering requires the Tauri desktop app');
                return;
            }
            const { invoke } = await import('@tauri-apps/api/core');
            let result: number[][];
            if (organizationCondition.trim()) {
                const matches: Array<{ video_id: number }> = await invoke('search_transcripts', {
                    query: organizationCondition.trim(),
                    limit: 100,
                });
                const jobIds = [...new Set(matches.map((match) => match.video_id))];
                result = jobIds.length >= clusterMinSize ? [jobIds] : [];
            } else {
                result = await invoke('auto_cluster_videos', {
                    threshold: clusterThreshold,
                    minClusterSize: clusterMinSize,
                });
            }

            const stopWords = new Set(['para', 'sobre', 'como', 'con', 'una', 'los', 'las', 'del', 'por', 'video', 'the', 'and', 'this', 'from']);
            const groups = result.map((jobIds, idx) => {
                const matched = jobIds
                    .map(id => jobs.find(j => j.id === id))
                    .filter((job): job is JobRecord => Boolean(job));
                const wordCounts = new Map<string, number>();
                matched.forEach((job) => String(job.title || '').toLowerCase().split(/[^a-záéíóúñ0-9]+/i).filter((word) => word.length > 3 && !stopWords.has(word)).forEach((word) => wordCounts.set(word, (wordCounts.get(word) || 0) + 1)));
                const keywords = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([word]) => word);
                const name = keywords.length > 0 ? `Colección IA · ${keywords.join(' / ')}` : `Colección IA ${idx + 1}`;
                return { count: matched.length, jobs: matched, name, keywords, jobIds };
            }).filter(g => g.jobs.length > 0);

            if (groups.length > 0) {
                const persisted: Array<{ id: number; name: string; auto_generated: boolean }> = await invoke('replace_ai_playlists', {
                    groups: groups.map((group, idx) => ({
                        name: group.name,
                        description: organizationCondition.trim() || 'Organizada por similitud semántica y transcripción.',
                        color: ['#8a5cff', '#25f4ee', '#fe2c55'][idx % 3],
                        cover_job_id: group.jobIds[0] ?? null,
                        topic_keywords: group.keywords,
                        job_ids: group.jobIds,
                    })),
                });
                const playlistByName = new Map(persisted.filter((playlist) => playlist.auto_generated).map((playlist) => [playlist.name, playlist.id]));
                setClustersList(groups.map((group) => ({ ...group, playlistId: playlistByName.get(group.name) })));
            } else {
                setClustersList([]);
            }
        } catch (error) {
            setClustersList([]);
            setClusteringError(error instanceof Error ? error.message : String(error));
        } finally {
            setClusteringLoading(false);
        }
    };

    const handleSave = async () => {
        if (retentionPreviewPending) {
            setActiveTab('general');
            setStorageError('Revisa la previsualización y confirma el cambio a «Solo online» antes de guardar. Esta confirmación no elimina medios.');
            return;
        }
        setSettingsError(null);
        try {
            const isNative = isTauriRuntime();
            let savedProcessing: SavedProcessingSettings | null = null;
            if (isNative) {
                // Descargar un modelo grande es opcional. Si la red o el
                // modelo no están disponibles, Rust persiste el fallback tiny
                // y la biblioteca sigue siendo utilizable.
                try {
                    await processingSetup.prepareForQuality(processingQuality);
                } catch {
                    // save_mvp_settings aplica el fallback local verificable.
                }
                const { invoke } = await import('@tauri-apps/api/core');
                const processing = processingSetup.processing;
                const nativeSettings = await invoke<{
                    processingQuality: number;
                    processingProfile: 'fast' | 'balanced' | 'high';
                    videoFit: 'cover' | 'contain';
                }>('save_app_settings', {
                    settings: {
                        schemaVersion: 1,
                        source: 'native',
                        locale,
                        theme: selectedTheme,
                        downloadDir: folder,
                        formats,
                        retention,
                        cookiesBrowser,
                        processingQuality,
                        processingProfile: processing?.profile ?? (processingQuality < 35 ? 'fast' : processingQuality < 72 ? 'balanced' : 'high'),
                        whisperModel: processing?.whisper_model ?? selectedWhisperModel,
                        device: processing?.device ?? 'cpu',
                        computeType: processing?.compute_type ?? 'int8',
                        videoFit,
                        storageIntent,
                        quotaBytes,
                        reserveBytes,
                        minScore: similarityThreshold,
                        maxResults: 10,
                        similarityMetric: 'Cosine',
                        chunkSize: 150,
                        chunkOverlap: 50,
                        autostartEnabled,
                        keepInTrayOnClose,
                        updaterStatus: 'BLOCKED_EXTERNAL',
                        subtitleEnabled,
                        subtitleStyle,
                        playbackProfile,
                        gpuEnhancementEnabled,
                        performanceMode,
                        backgroundProcessing,
                        startInBackground: autostartEnabled,
                        idleThresholdSeconds,
                        acOnlyForMaximum,
                        preferredAdapterId,
                        analysisDepth,
                        performanceProfileVersion: settings.performanceProfileVersion,
                        lastVerifiedAccelerators,
                    },
                });
                await invoke<boolean>('set_autostart', { enabled: autostartEnabled });
                savedProcessing = {
                    quality: nativeSettings.processingQuality,
                    profile: nativeSettings.processingProfile,
                    video_fit: nativeSettings.videoFit,
                };
                await processingSetup.refresh();
            }

            updateSettings({
                formats,
                folder,
                theme: selectedTheme,
                retention,
                cookiesBrowser,
                processingQuality: savedProcessing?.quality ?? processingQuality,
                processingProfile: savedProcessing?.profile ?? (processingQuality < 35 ? 'fast' : processingQuality < 72 ? 'balanced' : 'high'),
                videoFit: savedProcessing?.video_fit ?? videoFit,
                storageIntent,
                quotaBytes,
                reserveBytes,
                showTikTokPill,
                hoverAutoplay,
                showDemoVideos,
                keepInTrayOnClose,
                subtitleEnabled,
                subtitleStyle,
                playbackProfile,
                gpuEnhancementEnabled,
                performanceMode,
                backgroundProcessing,
                startInBackground: autostartEnabled,
                idleThresholdSeconds,
                acOnlyForMaximum,
                preferredAdapterId,
                analysisDepth,
                performanceProfileVersion: settings.performanceProfileVersion,
                lastVerifiedAccelerators,
            });
            onClose();
        } catch (error) {
            setSettingsError(error instanceof Error ? error.message : String(error));
        }
    };

    const storageCandidates = purgePreview?.candidates ?? [];
    const selectedPurgeBytes = storageCandidates
        .filter((candidate) => purgeSelection.includes(candidate.jobId))
        .reduce((total, candidate) => total + Math.max(0, candidate.mediaBytes), 0);
    const storageStateLabel = storageStatus?.state === 'quota-exceeded'
        ? 'Cuota excedida'
        : storageStatus?.state === 'quota-near'
            ? 'Cerca de la cuota'
            : storageStatus?.state === 'disk-low'
                ? 'Disco bajo'
                : storageStatus?.state === 'path-error'
                    ? 'Ruta no disponible'
                    : storageStatus
                        ? 'Dentro de la cuota'
                        : 'Medición pendiente';
    const storageStateClass = storageStatus?.state === 'ok'
        ? 'text-emerald-400'
        : storageStatus?.state === 'quota-near' || storageStatus?.state === 'disk-low'
            ? 'text-amber-300'
            : storageStatus?.state === 'quota-exceeded' || storageStatus?.state === 'path-error'
                ? 'text-[#fe2c55]'
                : 'text-white/45';

    return (
        <div
            className={embedded ? "pulsaria-settings-shell flex-1 flex flex-col font-sans min-h-0 relative overflow-hidden" : "pulsaria-settings-shell absolute inset-0 z-50 flex flex-col font-sans"}
            style={{ background: embedded ? 'transparent' : '#0e1017' }}
        >
            {/* Header */}
            <div className={`pulsaria-settings-header flex items-center justify-between ${embedded ? 'px-4 pt-3 pb-2' : 'px-5 pt-4 pb-3'}`}>
                <h2 className="text-base font-black tracking-tight leading-tight text-white">
                    {t('settings')}
                </h2>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className={`pulsaria-settings-nav ${embedded ? "px-4 pb-2" : "px-5 pb-3"}`}>
                <div role="tablist" aria-label="Secciones de ajustes" className="pulsaria-settings-seg grid grid-cols-5 gap-1 p-1 rounded-xl bg-black/40 border border-white/[0.04]" data-active={activeTab}>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'general'}
                        onClick={() => setActiveTab('general')}
                        className={`pulsaria-settings-tab py-1.5 px-1 flex flex-row items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'general'
                                ? 'bg-white/12 text-white shadow-sm border border-white/15'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <FaSliders size={11} />
                        <span className="truncate">{t('general')}</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'engine'}
                        onClick={() => setActiveTab('engine')}
                        className={`pulsaria-settings-tab py-1.5 px-1 flex flex-row items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'engine'
                                ? 'bg-white/12 text-white shadow-sm border border-white/15'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <FaMicrochip size={11} />
                        <span className="truncate">{t('engine')}</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'ai'}
                        onClick={() => setActiveTab('ai')}
                        className={`pulsaria-settings-tab py-1.5 px-1 flex flex-row items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'ai'
                                ? 'bg-white/12 text-white shadow-sm border border-white/15'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <FaBrain size={11} />
                        <span className="truncate">{t('ai')}</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'performance'}
                        onClick={() => setActiveTab('performance')}
                        className={`pulsaria-settings-tab py-1.5 px-1 flex flex-row items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'performance'
                                ? 'bg-white/12 text-white shadow-sm border border-white/15'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <FaBolt size={11} />
                        <span className="truncate">Rendimiento</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'stats'}
                        onClick={() => setActiveTab('stats')}
                        className={`pulsaria-settings-tab py-1.5 px-1 flex flex-row items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'stats'
                                ? 'bg-white/12 text-white shadow-sm border border-white/15'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <FaHardDrive size={11} />
                        <span className="truncate">{t('stats')}</span>
                    </button>
                </div>
            </div>

            {/* Divider */}
            <div className={`pulsaria-settings-divider ${embedded ? 'mx-4' : 'mx-5'} h-px bg-white/[0.04]`} />

            {/* Scrollable content */}
            <div className={`pulsaria-settings-content flex-1 overflow-y-auto ${embedded ? 'px-4 py-3' : 'px-5 py-4'} flex flex-col gap-4 custom-scrollbar`}>

                {activeTab === 'general' && (
                    <GeneralTab
                        locale={locale}
                        setLocale={setLocale}
                        t={t}
                        selectedTheme={selectedTheme}
                        handleSelectTheme={handleSelectTheme}
                        formats={formats}
                        toggleFormat={toggleFormat}
                        videoFit={videoFit}
                        setVideoFit={setVideoFit}
                        folder={folder}
                        setFolder={setFolder}
                        autostartEnabled={autostartEnabled}
                        setAutostartEnabled={(enabled) => { setAutostartEnabled(enabled); setStartInBackground(enabled); }}
                        keepInTrayOnClose={keepInTrayOnClose}
                        setKeepInTrayOnClose={setKeepInTrayOnClose}
                        isTauri={isTauriRuntime()}
                        onReviewConsent={onReviewConsent}
                        subtitleEnabled={subtitleEnabled}
                        setSubtitleEnabled={setSubtitleEnabled}
                        subtitleStyle={subtitleStyle}
                        setSubtitleStyle={setSubtitleStyle}
                        playbackProfile={playbackProfile}
                        setPlaybackProfile={(profile) => {
                            setPlaybackProfile(profile);
                            if (profile !== 'gpu-experimental') setPerformanceMode(profile);
                        }}
                        gpuEnhancementEnabled={gpuEnhancementEnabled}
                        setGpuEnhancementEnabled={setGpuEnhancementEnabled}
                        showTikTokPill={showTikTokPill}
                        setShowTikTokPill={setShowTikTokPill}
                        hoverAutoplay={hoverAutoplay}
                        setHoverAutoplay={setHoverAutoplay}
                         showDemoVideos={showDemoVideos}
                         setShowDemoVideos={setShowDemoVideos}
                         pageConfig={pageConfig}
                         onPageConfigChange={onPageConfigChange}
                         searchMode={searchMode}
                         onSearchModeChange={onSearchModeChange}
                     />
                )}

                {activeTab === 'performance' && (
                    <PerformanceTab
                        isTauri={isTauriRuntime()}
                        mode={performanceMode}
                        setMode={changePerformanceMode}
                        backgroundProcessing={backgroundProcessing}
                        setBackgroundProcessing={setBackgroundProcessing}
                        idleThresholdSeconds={idleThresholdSeconds}
                        setIdleThresholdSeconds={setIdleThresholdSeconds}
                        acOnlyForMaximum={acOnlyForMaximum}
                        setAcOnlyForMaximum={setAcOnlyForMaximum}
                        preferredAdapterId={preferredAdapterId}
                        setPreferredAdapterId={setPreferredAdapterId}
                        analysisDepth={analysisDepth}
                        setAnalysisDepth={setAnalysisDepth}
                        startInBackground={startInBackground}
                        status={accelerationStatus}
                        policy={performancePolicy}
                        benchmarkBusy={benchmarkBusy}
                        onBenchmark={runAccelerationBenchmark}
                        onReset={resetPerformanceProfile}
                    />
                )}

                {activeTab === 'engine' && (
                    <EngineTab
                        modelOnline={modelOnline}
                        hnswShards={hnswShards}
                        statsTotal={stats.total}
                        similarityThreshold={similarityThreshold}
                        setSimilarityThreshold={setSimilarityThreshold}
                        selectedWhisperModel={selectedWhisperModel}
                        processingQuality={processingQuality}
                        setProcessingQuality={setProcessingQuality}
                        processingSetup={processingSetup}
                        cookiesBrowser={cookiesBrowser}
                        setCookiesBrowser={setCookiesBrowser}
                        runtimeHealth={runtimeHealth}
                        healthBusy={healthBusy}
                        runHealthAction={runHealthAction}
                        sources={sources}
                        setPendingSourceDelete={setPendingSourceDelete}
                        healthEvents={healthEvents}
                        updater={updater}
                        updaterBlocked={updaterBlocked}
                        updaterChannel={updaterChannel}
                        updateConfirming={updateConfirming}
                        setUpdateConfirming={setUpdateConfirming}
                        t={t}
                    />
                )}

                {activeTab === 'ai' && (
                    <AiTab
                        localLlmStatus={localLlmStatus}
                        localLlmBusy={localLlmBusy}
                        localLlmMessage={localLlmMessage}
                        prepareLocalLlm={prepareLocalLlm}
                        cancelLocalLlm={cancelLocalLlm}
                        isTauri={isTauriRuntime()}
                        clusterThreshold={clusterThreshold}
                        setClusterThreshold={setClusterThreshold}
                        clusterMinSize={clusterMinSize}
                        setClusterMinSize={setClusterMinSize}
                        organizationCondition={organizationCondition}
                        setOrganizationCondition={setOrganizationCondition}
                        clustersList={clustersList}
                        clusteringLoading={clusteringLoading}
                        clusteringError={clusteringError}
                        runClustering={runClustering}
                        onPlaylistSelect={onPlaylistSelect}
                        onClose={onClose}
                    />
                )}

                {activeTab === 'stats' && (
                    <StatsTab
                        stats={stats}
                        formatDuration={formatDuration}
                        storageStatus={storageStatus}
                        storageStateClass={storageStateClass}
                        storageStateLabel={storageStateLabel}
                        storageBusy={storageBusy}
                        storageMessage={storageMessage}
                        storageError={storageError}
                        refreshStorageStatus={refreshStorageStatus}
                        folder={folder}
                        retention={retention}
                        handleRetentionChange={handleRetentionChange}
                        retentionPreviewPending={retentionPreviewPending}
                        setRetention={setRetention}
                        setRetentionPreviewPending={setRetentionPreviewPending}
                        purgePreview={purgePreview}
                        setPurgePreview={setPurgePreview}
                        storageCandidates={storageCandidates}
                        purgeSelection={purgeSelection}
                        setPurgeSelection={setPurgeSelection}
                        storageIntent={storageIntent}
                        setStorageIntent={setStorageIntent}
                        quotaBytes={quotaBytes}
                        setQuotaBytes={setQuotaBytes}
                        reserveBytes={reserveBytes}
                        setReserveBytes={setReserveBytes}
                        handlePreviewPurge={handlePreviewPurge}
                        lastPurgeId={lastPurgeId}
                        handleUndoPurge={handleUndoPurge}
                        trashConfirming={trashConfirming}
                        setTrashConfirming={setTrashConfirming}
                        handleEmptyTrash={handleEmptyTrash}
                        purgeConfirming={purgeConfirming}
                        setPurgeConfirming={setPurgeConfirming}
                        handleApplyPurge={handleApplyPurge}
                        selectedPurgeBytes={selectedPurgeBytes}
                        isTauri={isTauriRuntime()}
                        t={t}
                    />
                )}
            </div>

                        {pendingSourceDelete && (
                            <div
                                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="confirm-source-delete-title"
                            >
                                <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-white/10 bg-[#0e1017] p-6 shadow-2xl">
                                    <div>
                                        <h3 id="confirm-source-delete-title" className="text-sm font-bold text-white">¿Eliminar esta fuente?</h3>
                                        <p className="mt-2 break-words text-xs leading-relaxed text-white/45">
                                            {pendingSourceDelete.url}
                                        </p>
                                        <p className="mt-2 text-xs leading-relaxed text-white/55">
                                            Los videos existentes se conservarán; solo se detendrá la sincronización de esta fuente.
                                        </p>
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setPendingSourceDelete(null)}
                                            className="flex-1 rounded-xl bg-white/5 py-2 text-xs text-white/60 transition-colors hover:bg-white/10"
                                        >
                                            {t('cancel')}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={healthBusy}
                                            onClick={() => {
                                                const sourceId = pendingSourceDelete.id;
                                                setPendingSourceDelete(null);
                                                void runHealthAction(async () => {
                                                    const { invoke } = await import('@tauri-apps/api/core');
                                                    await invoke('delete_collection_source', { sourceId });
                                                });
                                            }}
                                            className="flex-1 rounded-xl bg-[#fe2c55]/80 py-2 text-xs font-bold text-white transition-colors hover:bg-[#fe2c55] disabled:opacity-40"
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Footer CTA */}
            <div className="px-5 py-4 border-t border-white/10">
                {settingsError && (
                    <div role="alert" className="mb-3 rounded-xl border border-[#fe2c55]/30 bg-[#fe2c55]/10 px-3 py-2 text-[10px] leading-relaxed text-[#fe2c55]">
                        No se pudo guardar la configuración: {settingsError}
                    </div>
                )}

                <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => { void handleSave(); }}

                    className="w-full py-2.5 rounded-[12px] font-black tracking-[0.15em] uppercase text-white transition-all active:scale-[0.98] cursor-pointer"
                    style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))',
                        border: 'none',
                        boxShadow: `0 4px 15px rgba(0,0,0,0.5)`,
                        fontSize: '12px',
                    }}
                >
                    Guardar Cambios
                </button>
                <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded-[12px] border-0 bg-white/5 px-4 text-[10px] font-black uppercase tracking-wider text-white/55 transition hover:bg-white/10 hover:text-white"
                >
                    {t('cancel')}
                </button>
                </div>
            </div>
        </div>
    );
}
