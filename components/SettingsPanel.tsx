import { useCallback, useState, useEffect, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { SHADOW, SURFACE, ACCENT } from '@/lib/design-tokens';
import { useSettings, AppTheme, RetentionPolicy } from '@/lib/settings-context';
import { useI18n } from '@/lib/i18n';
import { isTauriRuntime, useProcessingSettings } from '@/hooks/use-processing-settings';
import { useUpdater } from '@/hooks/use-updater';
import type { JobRecord } from '@/hooks/use-jobs';
import { cancelLocalLlmDownload, ensureLocalLlm, getLocalLlmStatus, type LocalLlmStatus } from '@/lib/local-llm';

import { 
    FaXmark, 
    FaDownload, 
    FaFolder, 
    FaCheck, 
    FaFilm, 
    FaMusic, 
    FaFileLines, 
    FaPalette,
    FaChartSimple,
    FaMicrochip,
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
} from 'react-icons/fa6';

// ── Solid Icons (Filled) ──
const SolidXIcon = () => <FaXmark size={18} />;
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
            className={cn('rounded-[20px] p-4 border transition-all', className)}
            style={{
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(18, 20, 26, 0.75)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)'
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

type SettingsTab = 'general' | 'stats' | 'engine' | 'ai';

interface SettingsPanelProps {
    onClose: () => void;
    jobs?: JobRecord[];
    onPlaylistSelect?: (id: number | null) => void;
}

interface CollectionSource {
    id: number;
    url: string;
    source_type: string;
    active: boolean;
    last_success_at?: string | null;
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
    } catch {
        return null;
    }
}

export function SettingsPanel({ onClose, jobs = [], onPlaylistSelect }: SettingsPanelProps) {
    const { settings, updateSettings } = useSettings();
    const { locale, setLocale, t } = useI18n();
    const processingSetup = useProcessingSettings();
    const updater = useUpdater();

    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [formats, setFormats] = useState<string[]>(settings.formats);
    const [folder, setFolder] = useState(settings.folder);
    const [selectedTheme, setSelectedTheme] = useState<AppTheme>(settings.theme || 'carbon');
    const [retention, setRetention] = useState<RetentionPolicy>(settings.retention || 'keep');
    const [cookiesBrowser, setCookiesBrowser] = useState<typeof settings.cookiesBrowser>(settings.cookiesBrowser || '');
    const [processingQuality, setProcessingQuality] = useState(settings.processingQuality);
    const [videoFit, setVideoFit] = useState(settings.videoFit);
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
            setSelectedTheme(settings.theme || 'carbon');
            setRetention(settings.retention || 'keep');
            setCookiesBrowser(settings.cookiesBrowser || '');
            setProcessingQuality(settings.processingQuality);
            setVideoFit(settings.videoFit);
        });
        return () => {
            active = false;
        };
    }, [settings]);

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
        const rawStatus = await invokeOptionalCommand<unknown>('get_storage_status');
        const nextStatus = normalizeStorageStatus(rawStatus);
        if (nextStatus) {
            setStorageStatus(nextStatus);
            setStorageError(null);
            return;
        }
        setStorageStatus(null);
        setStorageMessage('El shell nativo actual todavía no expone la medición detallada de cuota; no se ha eliminado ningún archivo.');
    }, []);

    const handlePreviewPurge = async () => {
        setStorageBusy(true);
        setStorageError(null);
        setStorageMessage(null);
        try {
            const rawPreview = await invokeOptionalCommand<unknown>('preview_media_purge');
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
            await invoke('undo_media_purge', { purgeId: lastPurgeId });
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
            const rawFreed = await invoke<unknown>('empty_media_trash');
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

    useEffect(() => {
        if (activeTab !== 'general' || !isTauriRuntime()) return;
        queueMicrotask(() => { void refreshStorageStatus(); });
    }, [activeTab, refreshStorageStatus]);

    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (active) void refreshHealth().catch(() => {});
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
                savedProcessing = await invoke<SavedProcessingSettings>('save_mvp_settings', {
                    input: {
                        downloadDir: folder,
                        retention,
                        browser: cookiesBrowser,
                        formats,
                        minScore: similarityThreshold,
                        quality: processingQuality,
                        videoFit,
                    },
                });
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
            className="absolute inset-0 z-50 flex flex-col font-sans"
            style={{ background: '#0e1017' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-[9px] text-white/40">
                        <span>PANEL DE CONTROL</span>
                    </div>
                    <h2 className="text-base font-black tracking-tight leading-tight text-white">
                        CONFIGURACIÓN <span className="text-[var(--accent-primary)]">GLOBAL</span>
                    </h2>
                </div>
                                <button
                    type="button"
                    aria-label="Cerrar configuración"
                    onClick={onClose}

                    className="w-9 h-9 rounded-[12px] flex items-center justify-center transition-all border border-white/10 bg-white/[0.04] hover:bg-[#fe2c55]/20 hover:border-[#fe2c55]/40 text-white/60 hover:text-white cursor-pointer"
                >
                    <SolidXIcon />
                </button>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="px-5 pb-3">
                <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-black/50 border border-white/10">
                                        <button
                        type="button"
                        aria-pressed={activeTab === 'general'}
                        onClick={() => setActiveTab('general')}

                        className={`py-2 px-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'general'
                                ? 'bg-white/10 text-white border border-white/20 shadow-sm'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                        }`}
                    >
                        <FaSliders size={11} />
                        <span className="truncate">General</span>
                    </button>
                                        <button
                        type="button"
                        aria-pressed={activeTab === 'stats'}
                        onClick={() => setActiveTab('stats')}

                        className={`py-2 px-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'stats'
                                ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/40 shadow-sm'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                        }`}
                    >
                        <FaChartSimple size={11} />
                        <span className="truncate">Stats</span>
                    </button>
                                        <button
                        type="button"
                        aria-pressed={activeTab === 'engine'}
                        onClick={() => setActiveTab('engine')}

                        className={`py-2 px-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'engine'
                                ? 'bg-[#25f4ee]/20 text-[#25f4ee] border border-[#25f4ee]/40 shadow-sm'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                        }`}
                    >
                        <FaMicrochip size={11} />
                        <span className="truncate">Engine</span>
                    </button>
                                        <button
                        type="button"
                        aria-pressed={activeTab === 'ai'}
                        onClick={() => setActiveTab('ai')}

                        className={`py-2 px-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            activeTab === 'ai'
                                ? 'bg-[#8a5cff]/20 text-[#8a5cff] border border-[#8a5cff]/40 shadow-sm'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                        }`}
                    >
                        <FaBrain size={11} />
                        <span className="truncate">AI</span>
                    </button>
                </div>
            </div>

            {/* Divider */}
            <div className="mx-5 h-px bg-white/5" />

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 custom-scrollbar">

                {/* TAB: GENERAL (Temas, Formatos, Carpeta) */}
                {activeTab === 'general' && (
                    <>
                        <SectionCard>
                            <SectionTitle icon={SolidLanguageIcon} label={t('language')} />
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    ['es-MX', t('spanish')],
                                    ['en-US', t('english')],
                                ] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        aria-pressed={locale === value}
                                        onClick={() => setLocale(value)}
                                        className="rounded-[12px] border px-3 py-2 text-left text-[10px] font-bold transition"
                                        style={{
                                            borderColor: locale === value ? '#25f4ee' : 'rgba(255,255,255,0.1)',
                                            background: locale === value ? 'rgba(37,244,238,0.12)' : 'rgba(255,255,255,0.03)',
                                            color: locale === value ? '#25f4ee' : 'rgba(255,255,255,0.7)',
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-[10px] leading-relaxed text-white/40">{t('chooseLanguageDescription')}</p>
                        </SectionCard>

                        {/* Visual Themes Selection */}
                        <SectionCard className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <SectionTitle icon={SolidPaletteIcon} label="Tema de Fondo" />
                                <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
                                    {THEME_OPTIONS.length} opciones
                                </span>
                            </div>

                            <div className="flex flex-col gap-2">
                                {THEME_OPTIONS.map(theme => {
                                    const isSelected = selectedTheme === theme.id;
                                    return (
                                        <button
                                            key={theme.id}
                                            type="button"
                                            onClick={() => handleSelectTheme(theme.id)}
                                            className="group relative flex items-center justify-between p-3 rounded-[16px] transition-all duration-300 border text-left overflow-hidden cursor-pointer"
                                            style={{
                                                background: isSelected
                                                    ? 'rgba(255,255,255,0.06)'
                                                    : 'rgba(255,255,255,0.02)',
                                                borderColor: isSelected
                                                    ? theme.borderColor
                                                    : 'rgba(255,255,255,0.06)',
                                                boxShadow: isSelected
                                                    ? `0 0 20px -5px ${theme.accentColor}40, inset 0 1px 1px rgba(255,255,255,0.15)`
                                                    : 'none',
                                            }}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div
                                                    className="w-10 h-10 rounded-[10px] shrink-0 border relative overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105"
                                                    style={{
                                                        background: theme.gradient,
                                                        borderColor: isSelected ? theme.borderColor : 'rgba(255,255,255,0.1)',
                                                        boxShadow: isSelected ? `0 0 12px ${theme.accentColor}50` : '0 2px 8px rgba(0,0,0,0.5)',
                                                    }}
                                                >
                                                    <div
                                                        className="w-2.5 h-2.5 rounded-full"
                                                        style={{
                                                            background: theme.accentColor,
                                                            boxShadow: `0 0 8px ${theme.accentColor}`,
                                                        }}
                                                    />
                                                </div>

                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span
                                                            className="font-bold text-xs leading-tight"
                                                            style={{
                                                                color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)',
                                                            }}
                                                        >
                                                            {theme.name}
                                                        </span>
                                                        {theme.badge && (
                                                            <span
                                                                className="px-1.5 py-0.5 rounded-[4px] text-[8px] font-black tracking-wider uppercase"
                                                                style={{
                                                                    background: isSelected
                                                                        ? `${theme.accentColor}25`
                                                                        : 'rgba(255,255,255,0.05)',
                                                                    color: isSelected
                                                                        ? theme.accentColor
                                                                        : 'rgba(255,255,255,0.4)',
                                                                    border: `1px solid ${isSelected ? theme.accentColor + '50' : 'rgba(255,255,255,0.08)'}`,
                                                                }}
                                                            >
                                                                {theme.badge}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-white/40 leading-snug mt-0.5 truncate max-w-[200px]">
                                                        {theme.desc}
                                                    </span>
                                                </div>
                                            </div>

                                            <div
                                                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 ml-2 transition-all duration-300"
                                                style={{
                                                    background: isSelected ? theme.accentColor : 'rgba(255,255,255,0.04)',
                                                    border: `1px solid ${isSelected ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                                    boxShadow: isSelected ? `0 0 10px ${theme.accentColor}80` : 'inset 0 1px 2px rgba(0,0,0,0.5)',
                                                }}
                                            >
                                                {isSelected && <FaCheck size={10} color="#000000" className="font-bold" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </SectionCard>

                        {/* Formatos de Descarga */}
                        <SectionCard className="flex flex-col gap-6">
                            <SectionTitle icon={SolidDownloadIcon} label="Formatos de Descarga" />

                            {FORMAT_CATEGORIES.map(category => {
                                const CategoryIcon = category.icon;
                                return (
                                    <div key={category.title} className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between px-1">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-5 h-5 rounded-[6px] flex items-center justify-center"
                                                    style={{
                                                        background: `${category.options[0].color}18`,
                                                        boxShadow: `0 0 8px ${category.options[0].color}25`,
                                                        color: category.options[0].color,
                                                    }}
                                                >
                                                    <CategoryIcon size={11} />
                                                </div>
                                                <span className="font-black tracking-[0.2em] uppercase text-[10px] text-white/50">
                                                    {category.title}
                                                </span>
                                            </div>
                                            <span className="text-[9px] font-bold opacity-30 tracking-widest uppercase">{category.options.length} opciones</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            {category.options.map(fmt => {
                                                const on = formats.includes(fmt.id);
                                                return (
                                                                                                        <button
                                                        type="button"
                                                        key={fmt.id}
                                                        aria-pressed={on}
                                                        onClick={() => toggleFormat(fmt.id)}

                                                        className="group relative flex flex-col items-start p-3 rounded-[16px] transition-all duration-300 border overflow-hidden cursor-pointer"
                                                        style={{
                                                            background: on
                                                                ? `linear-gradient(135deg, ${fmt.color}15, ${fmt.color}05)`
                                                                : 'rgba(255,255,255,0.02)',
                                                            borderColor: on ? `${fmt.color}40` : 'rgba(255,255,255,0.05)',
                                                            boxShadow: on ? `0 8px 20px -8px ${fmt.color}40` : 'none',
                                                        }}
                                                    >
                                                        <div className="flex items-center justify-between w-full mb-2">
                                                            <div
                                                                className="px-2 py-0.5 rounded-[6px] font-black text-[9px] tracking-wider"
                                                                style={{
                                                                    background: on ? fmt.color : 'rgba(255,255,255,0.05)',
                                                                    color: on ? '#fff' : 'rgba(255,255,255,0.4)',
                                                                }}
                                                            >
                                                                {fmt.label}
                                                            </div>
                                                            <div
                                                                className="w-4 h-4 rounded-full flex items-center justify-center"
                                                                style={{
                                                                    background: on ? fmt.color : 'rgba(255,255,255,0.05)',
                                                                    border: `1px solid ${on ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`,
                                                                }}
                                                            >
                                                                {on && <FaCheck size={10} color="#fff" />}
                                                            </div>
                                                        </div>
                                                        <span className="block font-bold text-[11px] text-left text-white/80">
                                                            {fmt.desc}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </SectionCard>

                        <SectionCard>
                            <SectionTitle icon={SolidDownloadIcon} label="Retención de Archivos" />
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { id: 'keep' as const, label: 'Conservar local', description: 'Reproduce desde este equipo', color: '#10b981' },
                                    { id: 'online' as const, label: 'Solo online', description: 'Conserva conocimiento; limita medios grandes', color: '#25f4ee' },
                                ]).map((option) => {
                                    const selected = retention === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => setRetention(option.id)}
                                            className="p-3 rounded-[14px] border text-left transition-all"
                                            style={{
                                                background: selected ? `${option.color}12` : 'rgba(255,255,255,0.02)',
                                                borderColor: selected ? `${option.color}55` : 'rgba(255,255,255,0.08)',
                                            }}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] font-bold text-white/90">{option.label}</span>
                                                <span className={`w-2 h-2 rounded-full ${selected ? 'opacity-100' : 'opacity-25'}`} style={{ background: option.color }} />
                                            </div>
                                            <span className="block mt-1 text-[9px] leading-relaxed text-white/45">{option.description}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-2 px-1 text-[10px] text-white/40 leading-relaxed">
                                La opción «Solo online» mantiene metadata, transcript, segmentos, embeddings y artifacts. Cualquier retiro de video/audio debe aparecer en una previsualización y pedir confirmación; nunca se purga conocimiento en silencio.
                            </p>
                        </SectionCard>

                        <SectionCard className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                                <SectionTitle icon={FaHardDrive} label="Cuota y medios grandes" />
                                <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider ${storageStateClass}`}>
                                    {storageStateLabel}
                                </span>
                            </div>
                            <p className="text-[10px] leading-relaxed text-white/45">
                                La cuota solo cuenta video, audio, staging, archivos .part y cachés grandes. SQLite, backups, transcript, embeddings, metadata, poster, keyframes y capturas protegidas quedan fuera.
                            </p>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <div className="rounded-[12px] border border-white/5 bg-black/30 p-2.5">
                                    <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">Espacio libre</span>
                                    <span className="mt-1 block text-xs font-bold text-white/80">{formatStorageBytes(storageStatus?.freeBytes)}</span>
                                </div>
                                <div className="rounded-[12px] border border-white/5 bg-black/30 p-2.5">
                                    <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">Uso de medios</span>
                                    <span className="mt-1 block text-xs font-bold text-white/80">{formatStorageBytes(storageStatus?.usedMediaBytes)}</span>
                                </div>
                                <div className="rounded-[12px] border border-white/5 bg-black/30 p-2.5">
                                    <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">Reserva</span>
                                    <span className="mt-1 block text-xs font-bold text-white/80">{formatStorageBytes(storageStatus?.reserveBytes)}</span>
                                </div>
                                <div className="rounded-[12px] border border-amber-400/10 bg-amber-400/[.03] p-2.5">
                                    <span className="block text-[8px] font-black uppercase tracking-wider text-amber-200/45">Papelera reversible</span>
                                    <span className="mt-1 block text-xs font-bold text-amber-100/80">{formatStorageBytes(storageStatus?.trashBytes)}</span>
                                </div>
                            </div>

                            <div className="rounded-[12px] border border-white/5 bg-black/20 px-3 py-2">
                                <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">Ruta de medios</span>
                                <span className="mt-1 block break-all font-mono text-[10px] text-white/65">{storageStatus?.rootPath || folder}</span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={storageBusy || !isTauriRuntime()}
                                    onClick={() => { void refreshStorageStatus(); }}
                                    className="rounded-[10px] border border-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white/65 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    {storageBusy ? 'Consultando…' : 'Actualizar uso'}
                                </button>
                                <button
                                    type="button"
                                    disabled={storageBusy}
                                    onClick={() => { void handlePreviewPurge(); }}
                                    className="rounded-[10px] border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-amber-200 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    <FaTrashCan className="mr-1 inline" size={10} />
                                    Previsualizar purga
                                </button>
                                {lastPurgeId && (
                                    <button
                                        type="button"
                                        disabled={storageBusy}
                                        onClick={() => { void handleUndoPurge(); }}
                                        className="rounded-[10px] border border-[#25f4ee]/25 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#25f4ee] transition hover:bg-[#25f4ee]/10 disabled:opacity-35"
                                    >
                                        <FaArrowRotateLeft className="mr-1 inline" size={10} />
                                        Deshacer última purga
                                    </button>
                                )}
                                <button
                                    type="button"
                                    disabled={!isTauriRuntime() || storageBusy || !(storageStatus?.trashBytes && storageStatus.trashBytes > 0)}
                                    onClick={() => setTrashConfirming(true)}
                                    className="rounded-[10px] border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-amber-200 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    <FaTrashCan className="mr-1 inline" size={10} />
                                    Vaciar papelera
                                </button>
                            </div>

                            {trashConfirming && (
                                <div className="rounded-[11px] border border-amber-400/25 bg-amber-400/5 p-2.5">
                                    <p className="text-[9px] leading-relaxed text-amber-100/80">
                                        Esta acción eliminará definitivamente los medios que ya están en la papelera y hará que sus purgas dejen de ser recuperables. No tocará transcript, segmentos, embeddings, metadata ni artifacts. ¿Confirmas?
                                    </p>
                                    <div className="mt-2 flex gap-2">
                                        <button type="button" onClick={() => setTrashConfirming(false)} className="rounded-[8px] border border-white/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-white/55 hover:text-white">Ahora no</button>
                                        <button type="button" disabled={storageBusy} onClick={() => { void handleEmptyTrash(); }} className="rounded-[8px] bg-amber-400/20 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-amber-100 hover:bg-amber-400/30 disabled:opacity-35">Eliminar definitivamente</button>
                                    </div>
                                </div>
                            )}

                            {!isTauriRuntime() && (
                                <p className="rounded-[10px] border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[9px] leading-relaxed text-amber-200/75">
                                    La medición y la purga requieren el shell nativo. En navegador no se borrará ningún archivo.
                                </p>
                            )}
                            {storageMessage && <p role="status" className="rounded-[10px] border border-[#25f4ee]/15 bg-[#25f4ee]/5 px-3 py-2 text-[9px] leading-relaxed text-[#25f4ee]/80">{storageMessage}</p>}
                            {storageError && <p role="alert" className="rounded-[10px] border border-[#fe2c55]/25 bg-[#fe2c55]/10 px-3 py-2 text-[9px] leading-relaxed text-[#fe2c55]">{storageError}</p>}

                            {purgePreview && (
                                <div className="rounded-[14px] border border-amber-400/20 bg-black/25 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-amber-200">Vista previa de candidatos</p>
                                            <p className="mt-1 text-[9px] leading-relaxed text-white/45">{purgePreview.message || 'Revisa los elementos concretos antes de continuar.'}</p>
                                        </div>
                                        <span className="shrink-0 font-mono text-[9px] text-amber-200/80">{formatStorageBytes(selectedPurgeBytes)}</span>
                                    </div>
                                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                                        {storageCandidates.length > 0 ? storageCandidates.map((candidate) => {
                                            const selected = purgeSelection.includes(candidate.jobId);
                                            return (
                                                <label key={candidate.jobId} className={`flex gap-2 rounded-[11px] border p-2.5 ${candidate.protected ? 'border-emerald-400/20 bg-emerald-400/5 opacity-70' : selected ? 'border-amber-400/30 bg-amber-400/5' : 'border-white/5 bg-black/20'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selected}
                                                        disabled={candidate.protected}
                                                        onChange={() => setPurgeSelection((current) => selected ? current.filter((id) => id !== candidate.jobId) : [...current, candidate.jobId])}
                                                        className="mt-0.5 accent-amber-400"
                                                    />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center justify-between gap-2">
                                                            <span className="truncate text-[10px] font-bold text-white/80">{candidate.title}</span>
                                                            <span className="shrink-0 font-mono text-[9px] text-amber-200/80">{formatStorageBytes(candidate.mediaBytes)}</span>
                                                        </span>
                                                        <span className="mt-1 block text-[8px] leading-relaxed text-white/40">Job #{candidate.jobId} · interés explicable {candidate.interestScore}</span>
                                                        <span className="mt-1 block text-[8px] leading-relaxed text-white/45">{candidate.reasons.join(' · ')}</span>
                                                        <span className="mt-1 flex flex-wrap gap-1.5 text-[8px] font-bold uppercase tracking-wider">
                                                            {candidate.favorite && <span className="text-amber-300"><FaStar className="mr-0.5 inline" size={8} />Favorito</span>}
                                                            {candidate.pinned && <span className="text-[#25f4ee]"><FaThumbtack className="mr-0.5 inline" size={8} />Fijado</span>}
                                                            {candidate.protected && <span className="text-emerald-300"><FaShieldHalved className="mr-0.5 inline" size={8} />Protegido</span>}
                                                            <span className="text-white/35">{candidate.transcriptAvailable ? 'Ficha + transcript' : 'Ficha disponible'}</span>
                                                        </span>
                                                    </span>
                                                </label>
                                            );
                                        }) : (
                                            <p className="rounded-[10px] border border-white/5 bg-black/20 p-3 text-center text-[9px] text-white/40">No hay candidatos visibles. La aplicación conservará la ficha y el conocimiento local.</p>
                                        )}
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-[9px] text-white/45">{purgeSelection.length} seleccionado(s) · {purgePreview.native ? 'motor nativo' : 'modo informativo'}</span>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => { setPurgePreview(null); setPurgeSelection([]); setPurgeConfirming(false); }} className="rounded-[9px] border border-white/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-white/55 hover:text-white">Cerrar</button>
                                            <button type="button" disabled={!purgePreview.native || purgeSelection.length === 0 || storageBusy} onClick={() => setPurgeConfirming(true)} className="rounded-[9px] bg-amber-400/15 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-amber-200 hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-35">Revisar y confirmar</button>
                                        </div>
                                    </div>
                                    {purgeConfirming && (
                                        <div className="mt-3 rounded-[10px] border border-amber-400/25 bg-amber-400/5 p-2.5">
                                            <p className="text-[9px] leading-relaxed text-amber-100/80">Se moverán únicamente los {purgeSelection.length} medios seleccionados a la papelera interna. No se tocarán transcript, segmentos, embeddings, metadata ni artifacts. ¿Confirmas?</p>
                                            <div className="mt-2 flex gap-2">
                                                <button type="button" onClick={() => setPurgeConfirming(false)} className="rounded-[8px] border border-white/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-white/55 hover:text-white">Ahora no</button>
                                                <button type="button" disabled={storageBusy} onClick={() => { void handleApplyPurge(); }} className="rounded-[8px] bg-amber-400/20 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-amber-100 hover:bg-amber-400/30 disabled:opacity-35">Confirmar purga reversible</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                                <SectionTitle icon={FaBrain} label="IA local" />
                                <span className="rounded-full border border-[#8a5cff]/25 bg-[#8a5cff]/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#c4b5fd]">Sin nube</span>
                            </div>
                            <p className="text-[10px] leading-relaxed text-white/50">
                                La síntesis y el chat usan un sidecar local de llama.cpp. El modelo se descarga sólo después de una acción explícita; tus transcripciones y fragmentos no se envían a un LLM remoto.
                            </p>
                            <div className="flex items-center justify-between gap-3 rounded-[11px] border border-white/5 bg-black/25 px-3 py-2 text-[9px]">
                                <span className="text-white/40">Estado</span>
                                <span className="font-mono font-bold text-[#c4b5fd]">{localLlmStatus?.state || 'comprobando…'}</span>
                            </div>
                            {localLlmStatus && localLlmStatus.totalBytes > 0 && localLlmStatus.state === 'downloading' && (
                                <div className="rounded-[11px] border border-[#8a5cff]/20 bg-black/25 px-3 py-2 text-[9px] text-white/60">
                                    Descargando {formatStorageBytes(localLlmStatus.bytesDownloaded)} de {formatStorageBytes(localLlmStatus.totalBytes)}
                                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#8a5cff] transition-all" style={{ width: `${Math.min(100, (localLlmStatus.bytesDownloaded / localLlmStatus.totalBytes) * 100)}%` }} /></div>
                                </div>
                            )}
                            {localLlmMessage && <p role="status" className="text-[9px] leading-relaxed text-[#25f4ee]/80">{localLlmMessage}</p>}
                            {localLlmStatus?.errorCode && <p role="alert" className="text-[9px] leading-relaxed text-amber-200/80">Código de estado: {localLlmStatus.errorCode}</p>}
                            <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={!isTauriRuntime() || localLlmBusy || localLlmStatus?.state === 'ready'} onClick={() => void prepareLocalLlm()} className="rounded-[9px] border border-[#8a5cff]/35 bg-[#8a5cff]/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-[#c4b5fd] hover:bg-[#8a5cff]/20 disabled:cursor-not-allowed disabled:opacity-35">
                                    {localLlmBusy ? 'Preparando…' : localLlmStatus?.state === 'ready' ? 'Modelo listo' : 'Preparar modelo local'}
                                </button>
                                {localLlmStatus?.state === 'downloading' && <button type="button" onClick={() => void cancelLocalLlm()} className="rounded-[9px] border border-amber-300/25 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-amber-200 hover:bg-amber-300/10">Cancelar descarga</button>}
                            </div>
                        </SectionCard>

                        <SectionCard className="flex flex-col gap-4">
                            <SectionTitle icon={FaShieldHalved} label="Documentos legales" />
                            <p className="text-[10px] leading-relaxed text-white/45">Consulta las condiciones del beta, privacidad, contenido autorizado, seguridad y avisos de terceros antes de distribuir o utilizar Pulsaria.</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-2 text-[9px] font-bold text-[#25f4ee]">
                                <a href="https://github.com/danielunibe/PulsarIA/blob/main/EULA.es.md" target="_blank" rel="noreferrer" className="underline decoration-[#25f4ee]/40 underline-offset-2">EULA</a>
                                <a href="https://github.com/danielunibe/PulsarIA/blob/main/PRIVACY.es.md" target="_blank" rel="noreferrer" className="underline decoration-[#25f4ee]/40 underline-offset-2">Privacidad</a>
                                <a href="https://github.com/danielunibe/PulsarIA/blob/main/CONTENT_POLICY.es.md" target="_blank" rel="noreferrer" className="underline decoration-[#25f4ee]/40 underline-offset-2">Contenido</a>
                                <a href="https://github.com/danielunibe/PulsarIA/blob/main/SECURITY.md" target="_blank" rel="noreferrer" className="underline decoration-[#25f4ee]/40 underline-offset-2">Seguridad</a>
                            </div>
                        </SectionCard>

                        <SectionCard className="flex flex-col gap-4">
                            <div className="flex items-center justify-between gap-3">
                                <SectionTitle icon={FaMicrochip} label="Análisis Local" />
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[#25f4ee]/70">
                                    {selectedWhisperModel}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-white/55">
                                <span>Rapidez</span>
                                <span className="font-bold text-white/80">{processingQuality < 35 ? 'Rápido' : processingQuality < 72 ? 'Equilibrado' : 'Alta calidad'}</span>
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
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    aria-pressed={videoFit === 'cover'}
                                    onClick={() => setVideoFit('cover')}
                                    className={`rounded-[12px] px-3 py-2 text-[10px] font-bold transition-colors ${videoFit === 'cover' ? 'bg-[#25f4ee]/15 text-[#25f4ee]' : 'bg-white/[.03] text-white/45 hover:text-white/75'}`}
                                >
                                    Rellenar video
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={videoFit === 'contain'}
                                    onClick={() => setVideoFit('contain')}
                                    className={`rounded-[12px] px-3 py-2 text-[10px] font-bold transition-colors ${videoFit === 'contain' ? 'bg-[#25f4ee]/15 text-[#25f4ee]' : 'bg-white/[.03] text-white/45 hover:text-white/75'}`}
                                >
                                    Mostrar completo
                                </button>
                            </div>
                            <p className="text-[10px] leading-relaxed text-white/40">
                                {processingSetup.hardware?.gpu_name || 'GPU no detectada'} · {processingSetup.hardware?.logical_cores || '—'} hilos · {processingSetup.hardware?.whisper_gpu_supported ? 'Aceleración Whisper disponible' : 'Fallback CPU activo'}
                            </p>
                        </SectionCard>

                        <SectionCard>
                            <SectionTitle icon={FaBrain} label="Fuentes Privadas" />
                            <select
                                value={cookiesBrowser}
                                onChange={(event) => setCookiesBrowser(event.target.value as typeof cookiesBrowser)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white/90 outline-none focus:border-[#8a5cff]/50 transition-colors cursor-pointer"
                            >
                                <option value="">Solo fuentes públicas</option>
                                <option value="chrome">Chrome (sesión local)</option>
                                <option value="edge">Edge (sesión local)</option>
                                <option value="firefox">Firefox (sesión local)</option>
                            </select>
                            <p className="mt-2 px-1 text-[10px] text-white/40 leading-relaxed">
                                Para likes, favoritos o playlists privadas, inicia sesión en el navegador elegido. Pulsaria usa el lector local de yt-dlp y no copia ni guarda las cookies.
                            </p>
                        </SectionCard>

                        <SectionCard>
                            <div className="flex items-center justify-between gap-3">
                                <SectionTitle icon={FaTriangleExclamation} label="Salud y sincronización" />
                                <button
                                    type="button"
                                    disabled={healthBusy}
                                    onClick={() => void runHealthAction(async () => {
                                        const { invoke } = await import('@tauri-apps/api/core');
                                        await invoke('repair_library');
                                    })}
                                    className="rounded-[9px] border border-white/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-white/55 hover:text-white disabled:opacity-40"
                                >
                                    Reparar biblioteca
                                </button>
                            </div>
                            <p className="mb-3 text-[10px] leading-relaxed text-white/40">Pulsaria se ejecuta en la bandeja, revisa las fuentes activas cada 15 minutos y conserva un diagnóstico sin cookies ni secretos.</p>
                            {runtimeHealth && (
                                <div className="mb-3 grid grid-cols-2 gap-2 text-[9px]">
                                    <div className="rounded-[10px] bg-black/30 p-2">
                                        <span className="block text-white/35">Whisper</span>
                                        <span className={runtimeHealth.model.ready ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{runtimeHealth.model.model} · {runtimeHealth.model.ready ? 'listo' : 'requiere reparación'}</span>
                                        {!runtimeHealth.model.ready && (
                                            <button type="button" disabled={healthBusy} onClick={() => void runHealthAction(async () => { await processingSetup.prepareForQuality(processingQuality); })} className="mt-1 block text-[8px] font-black uppercase tracking-wider text-[#25f4ee] disabled:opacity-40">Preparar modelo</button>
                                        )}
                                        {processingSetup.preparing && (
                                            <button type="button" onClick={() => void processingSetup.cancelPreparation()} className="mt-1 block text-[8px] font-black uppercase tracking-wider text-[#fe2c55]">Cancelar</button>
                                        )}
                                    </div>
                                    <div className="rounded-[10px] bg-black/30 p-2">
                                        <span className="block text-white/35">Cola única</span>
                                        <span className={runtimeHealth.backpressure_active ? 'font-bold text-amber-400' : 'font-bold text-white/70'}>{runtimeHealth.queue_depth} pendientes</span>
                                    </div>
                                    <div className="rounded-[10px] bg-black/30 p-2">
                                        <span className="block text-white/35">Workers</span>
                                        <span className="font-bold text-white/70">{runtimeHealth.worker_capacity} disponibles · {runtimeHealth.idle_workers} en espera</span>
                                    </div>
                                    <div className="rounded-[10px] bg-black/30 p-2">
                                        <span className="block text-white/35">Inicio Windows</span>
                                        <span className={runtimeHealth.autostart_enabled ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{runtimeHealth.autostart_enabled ? 'activo' : 'no disponible'}</span>
                                    </div>
                                    <div className="rounded-[10px] bg-black/30 p-2">
                                        <span className="block text-white/35">Gateway local</span>
                                        <span className={runtimeHealth.api_ready ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{runtimeHealth.api_ready ? 'disponible' : 'no disponible'}</span>
                                        {runtimeHealth.api_error && <span className="mt-1 block text-[8px] leading-relaxed text-[#fe2c55]">{runtimeHealth.api_error}</span>}
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col gap-2">
                                {sources.map((source) => (
                                    <div key={source.id} className="rounded-[12px] border border-white/8 bg-black/30 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-[10px] font-bold text-white/80" title={source.url}>{source.url}</p>
                                                <p className="mt-1 text-[9px] uppercase tracking-wider text-white/35">{source.source_type} · {source.discovered_count} detectados · {source.consecutive_failures} fallos</p>
                                            </div>
                                            <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${source.active ? 'bg-[#25f4ee]/10 text-[#25f4ee]' : 'bg-white/5 text-white/35'}`}>{source.active ? 'Activa' : 'Pausada'}</span>
                                        </div>
                                        {source.last_error && <p className="mt-2 text-[9px] leading-relaxed text-[#fe2c55]">{source.last_error}</p>}
                                        <div className="mt-2 flex gap-2">
                                            <button type="button" disabled={healthBusy} onClick={() => void runHealthAction(async () => { const { invoke } = await import('@tauri-apps/api/core'); await invoke('set_collection_source_active', { sourceId: source.id, active: !source.active }); })} className="text-[8px] font-black uppercase tracking-wider text-white/55 hover:text-white">{source.active ? 'Pausar' : 'Reactivar'}</button>
                                            <button type="button" disabled={healthBusy || !source.active} onClick={() => void runHealthAction(async () => { const { invoke } = await import('@tauri-apps/api/core'); await invoke('sync_collection_source_now', { sourceId: source.id }); })} className="text-[8px] font-black uppercase tracking-wider text-[#25f4ee] disabled:opacity-35">Sincronizar ahora</button>
                                            <button type="button" disabled={healthBusy} onClick={() => setPendingSourceDelete(source)} className="ml-auto text-[8px] font-black uppercase tracking-wider text-[#fe2c55]">Eliminar</button>
                                        </div>
                                    </div>
                                ))}
                                {sources.length === 0 && <p className="rounded-[12px] border border-white/5 bg-black/20 p-3 text-center text-[10px] text-white/35">Pega un perfil, favoritos, Me gusta o colección de TikTok para registrarlo.</p>}
                            </div>
                            <div className="mt-3 max-h-32 space-y-1 overflow-y-auto rounded-[12px] bg-black/25 p-2">
                                {healthEvents.slice(0, 12).map((event) => (
                                    <div key={event.id} className="flex gap-2 border-b border-white/5 py-1.5 text-[9px] last:border-0">
                                        <span className={event.severity === 'error' ? 'text-[#fe2c55]' : event.severity === 'warning' ? 'text-amber-400' : 'text-[#25f4ee]'}>{event.severity.toUpperCase()}</span>
                                        <span className="min-w-0 flex-1 text-white/55">{event.component}: {event.diagnosis}</span>
                                    </div>
                                ))}
                                {healthEvents.length === 0 && <p className="py-2 text-center text-[9px] text-white/30">Sin incidencias registradas.</p>}
                            </div>
                        </SectionCard>

                        <SectionCard className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                                <SectionTitle icon={FaRotate} label="Actualizaciones" />
                                <span className="rounded-full border border-[#25f4ee]/25 bg-[#25f4ee]/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#25f4ee]">
                                    Firmadas
                                </span>
                            </div>
                            <p className="text-[10px] leading-relaxed text-white/45">
                                Busca manualmente nuevas versiones publicadas en GitHub Releases. La instalación valida la firma Tauri y reinicia Pulsaria en Windows; no se realizan comprobaciones automáticas.
                            </p>

                            {!updater.isNative && (
                                <p className="rounded-[10px] border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[9px] leading-relaxed text-amber-300/80">
                                    Las actualizaciones solo están disponibles desde la aplicación de escritorio nativa.
                                </p>
                            )}

                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0" aria-live="polite">
                                    <span className="block text-[9px] font-black uppercase tracking-wider text-white/35">Estado</span>
                                    <span className="block truncate text-[10px] font-bold text-white/75">
                                        {updater.status === 'idle' && 'Sin comprobar'}
                                        {updater.status === 'checking' && 'Comprobando…'}
                                        {updater.status === 'up-to-date' && 'Pulsaria está actualizado'}
                                        {updater.status === 'available' && `Disponible: ${updater.version}`}
                                        {updater.status === 'downloading' && `Descargando… ${updater.progress}%`}
                                        {updater.status === 'installing' && 'Instalando y preparando reinicio…'}
                                        {updater.status === 'error' && 'No se pudo actualizar'}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    disabled={!updater.isNative || updater.status === 'checking' || updater.status === 'downloading' || updater.status === 'installing'}
                                    onClick={() => {
                                        setUpdateConfirming(false);
                                        void updater.checkForUpdate();
                                    }}
                                    className="shrink-0 rounded-[10px] border border-[#25f4ee]/30 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#25f4ee] transition hover:bg-[#25f4ee]/10 disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    {updater.status === 'checking' ? 'Comprobando…' : 'Buscar actualizaciones'}
                                </button>
                            </div>

                            {updater.status === 'available' && updater.version && (
                                <div className="rounded-[12px] border border-[#25f4ee]/20 bg-[#25f4ee]/5 p-3">
                                    <p className="text-[10px] font-black text-white">Versión {updater.version} disponible</p>
                                    <p className="mt-1 text-[9px] leading-relaxed text-white/50">
                                        {updater.notes || 'Incluye mejoras de estabilidad y seguridad.'}
                                    </p>
                                    {!updateConfirming ? (
                                        <button
                                            type="button"
                                            onClick={() => setUpdateConfirming(true)}
                                            className="mt-3 rounded-[9px] bg-[#25f4ee]/15 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#25f4ee] transition hover:bg-[#25f4ee]/25"
                                        >
                                            Preparar instalación
                                        </button>
                                    ) : (
                                        <div className="mt-3 rounded-[10px] border border-amber-400/20 bg-amber-400/5 p-2.5">
                                            <p className="text-[9px] leading-relaxed text-amber-200/80">
                                                Pulsaria descargará la actualización firmada y se reiniciará. Guarda cualquier trabajo abierto antes de continuar.
                                            </p>
                                            <div className="mt-2 flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setUpdateConfirming(false)}
                                                    className="rounded-[8px] border border-white/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-white/55 transition hover:text-white"
                                                >
                                                    Ahora no
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setUpdateConfirming(false);
                                                        void updater.installUpdate();
                                                    }}
                                                    className="rounded-[8px] bg-[#25f4ee]/20 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-[#25f4ee] transition hover:bg-[#25f4ee]/30"
                                                >
                                                    Confirmar e instalar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {(updater.status === 'downloading' || updater.status === 'installing') && (
                                <div className="rounded-[10px] bg-black/30 p-2.5" aria-live="polite">
                                    <div className="mb-1 flex items-center justify-between text-[9px] text-white/45">
                                        <span>{updater.status === 'installing' ? 'Instalando' : 'Descargando'}</span>
                                        <span className="font-mono text-[#25f4ee]">{updater.progress}%</span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                        <div className="h-full rounded-full bg-[#25f4ee] transition-[width]" style={{ width: `${Math.max(2, updater.progress)}%` }} />
                                    </div>
                                </div>
                            )}

                            {updater.error && (
                                <p role="alert" className="rounded-[10px] border border-[#fe2c55]/25 bg-[#fe2c55]/10 px-3 py-2 text-[9px] leading-relaxed text-[#fe2c55]">
                                    {updater.error}
                                </p>
                            )}
                        </SectionCard>

                        {/* Save Folder */}
                        <SectionCard>

                            <SectionTitle icon={SolidFolderIcon} label="Carpeta de Guardado" />
                            <div
                                className="flex items-center gap-2 px-3 py-2.5 rounded-[12px] bg-black/40 border border-white/10"
                            >
                                <div className="flex-shrink-0 flex items-center justify-center text-white/40">
                                    <SolidFolderIcon />
                                </div>
                                <input
                                    type="text"
                                    value={folder}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFolder(e.target.value)}
                                    className="flex-1 bg-transparent outline-none font-mono text-xs text-white"
                                    placeholder="~/Descargas/TikTok"
                                />
                            </div>
                            <p className="mt-2 px-1 text-[10px] text-white/40 leading-relaxed">
                                Los videos procesados se almacenan automáticamente en este directorio.
                            </p>
                        </SectionCard>
                    </>
                )}

                {/* TAB: ESTADÍSTICAS */}
                {activeTab === 'stats' && (
                    <SectionCard className="flex flex-col gap-4">
                        <SectionTitle icon={FaChartSimple} label="Métricas de la Biblioteca" />

                        <div className="grid grid-cols-2 gap-2.5">
                            <div className="flex flex-col p-3 rounded-[14px] bg-black/40 border border-white/5 shadow-inner">
                                <span className="text-white/40 text-[9px] uppercase font-bold tracking-widest mb-1">Total Videos</span>
                                <span className="text-white font-black text-2xl leading-none">{stats.total}</span>
                            </div>
                            <div className="flex flex-col p-3 rounded-[14px] bg-black/40 border border-white/5 shadow-inner">
                                <span className="text-white/40 text-[9px] uppercase font-bold tracking-widest mb-1">Duración Total</span>
                                <span className="text-white font-black text-2xl leading-none truncate">{formatDuration(stats.totalDuration)}</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3.5 rounded-[14px] bg-black/30 border border-white/5">
                            <span className="text-white/40 text-[9px] uppercase font-bold tracking-widest">Fuente del MVP</span>
                            <span className="text-[#fe2c55] text-xs font-black tracking-wider">TIKTOK</span>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-[12px] bg-white/[0.02] border border-white/5">
                            <span className="text-white/50 text-[10px] uppercase font-bold tracking-wider">Actividad esta semana</span>
                            <span className="text-emerald-400 font-black text-sm font-mono">+{stats.thisWeek} videos</span>
                        </div>
                    </SectionCard>
                )}

                {/* TAB: MOTOR SEMÁNTICO (ENGINE) */}
                {activeTab === 'engine' && (
                    <SectionCard className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <SectionTitle icon={FaMicrochip} label="Motor Semántico ONNX" />
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border flex items-center gap-1 ${
                                modelOnline === false
                                    ? 'bg-[#fe2c55]/10 text-[#fe2c55] border-[#fe2c55]/30'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}>
                                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${modelOnline === false ? 'bg-[#fe2c55]' : 'bg-emerald-400'}`} />

                                                                {modelOnline === null ? 'COMPROBANDO...' : modelOnline ? 'ONLINE' : 'NO DISPONIBLE'}

                            </span>
                        </div>

                        {/* Model Specs Card */}
                        <div className="p-3.5 rounded-[14px] bg-black/40 border border-[#25f4ee]/20 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-white">all-MiniLM-L6-v2</span>
                                <span className="text-[10px] font-mono text-[#25f4ee]">ONNX Runtime</span>
                            </div>
                            <p className="text-[11px] text-white/50 leading-relaxed">
                                Pipeline neuronal acelerado por CPU/GPU para cálculo de embeddings densos y búsqueda vectorial instantánea.
                            </p>
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[10px] text-white/60">
                                <div><strong className="text-white/80">Dimensión:</strong> 384 dimensiones</div>
                                <div><strong className="text-white/80">Métrica:</strong> Distancia Coseno</div>
                                <div><strong className="text-white/80">Shards HNSW:</strong> {hnswShards} particiones</div>
                                <div><strong className="text-white/80">Embeddings:</strong> {stats.total} vectores</div>
                            </div>
                        </div>

                        {/* Similarity Threshold Slider */}
                        <div className="p-3.5 rounded-[14px] bg-black/30 border border-white/5 flex flex-col gap-2.5">
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
                )}

                {/* TAB: INTELIGENCIA ARTIFICIAL & CLUSTERS (AI) */}
                {activeTab === 'ai' && (
                    <SectionCard className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <SectionTitle icon={FaBrain} label="Clustering & Grafos IA" />
                                                        <button
                                type="button"
                                aria-label="Ejecutar clustering"
                                onClick={runClustering}

                                disabled={clusteringLoading}
                                className="px-3 py-1 rounded-[10px] bg-[#8a5cff]/20 hover:bg-[#8a5cff]/30 text-[#8a5cff] border border-[#8a5cff]/40 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                            >
                                <FaPlay size={8} />
                                {clusteringLoading ? 'Agrupando...' : 'Ejecutar'}
                            </button>
                        </div>

                        <p className="text-[11px] text-white/50 leading-relaxed">
                            Crea colecciones automáticamente por similitud de transcripciones o usando una condición escrita por ti.
                        </p>
                        {clusteringError && (
                            <div role="alert" className="rounded-xl border border-[#fe2c55]/30 bg-[#fe2c55]/10 px-3 py-2 text-[10px] text-[#fe2c55]">
                                No se pudo ejecutar el clustering: {clusteringError}
                            </div>
                        )}

                        <div className="p-3.5 rounded-[14px] bg-black/30 border border-white/5 flex flex-col gap-2.5">
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

                        <label className="flex items-center justify-between gap-3 p-3.5 rounded-[14px] bg-black/30 border border-white/5 text-[10px] uppercase font-bold tracking-wider text-white/60">
                            Tamaño mínimo del cluster
                            <input
                                type="number"
                                aria-label="Tamaño mínimo del cluster"
                                min="2"
                                max="50"
                                value={clusterMinSize}
                                onChange={(e) => setClusterMinSize(Math.min(50, Math.max(2, Number(e.target.value) || 2)))}
                                className="w-16 rounded-lg bg-black/50 border border-white/10 px-2 py-1 text-right text-xs font-mono text-white outline-none focus:border-[#8a5cff]/50"
                            />
                        </label>

                        <label className="flex flex-col gap-2 p-3.5 rounded-[14px] bg-black/30 border border-white/5 text-[10px] uppercase font-bold tracking-wider text-white/60">
                            Condición opcional
                            <input
                                type="text"
                                aria-label="Condición para organizar videos"
                                value={organizationCondition}
                                onChange={(e) => setOrganizationCondition(e.target.value)}
                                placeholder="Ej. videos sobre diseño y tecnología"
                                className="rounded-[10px] bg-black/50 border border-white/10 px-3 py-2 text-[11px] font-medium normal-case tracking-normal text-white outline-none focus:border-[#8a5cff]/50"
                            />
                        </label>

                        {/* Clusters List */}

                        <div className="flex flex-col gap-2">
                            <span className="text-[9px] uppercase font-bold tracking-widest text-white/40">
                                Grupos Semánticos Detectados ({clustersList.length})
                            </span>
                            {clustersList.length > 0 ? (
                                clustersList.map((group, idx) => (
                                    <div key={idx} className="p-3 rounded-[12px] bg-black/40 border border-[#8a5cff]/20 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-[8px] bg-[#8a5cff]/15 flex items-center justify-center text-[#8a5cff] font-bold text-xs">
                                                #{idx + 1}
                                            </div>
                                            <span className="text-xs font-bold text-white truncate">{group.name}</span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="text-[10px] font-mono text-[#8a5cff] font-bold">{group.count} videos</span>
                                            {group.playlistId && <button type="button" onClick={() => { onPlaylistSelect?.(group.playlistId ?? null); onClose(); }} className="rounded-[8px] border border-[#25f4ee]/30 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-[#25f4ee] transition hover:bg-[#25f4ee]/10">Ver</button>}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-4 rounded-[12px] bg-black/20 border border-white/5 text-center text-[10px] text-white/40">
                                                                        Presiona «Ejecutar» para descubrir clusters temáticos en tu biblioteca.

                                </div>
                            )}
                        </div>
                    </SectionCard>
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
                                            Cancelar
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

                                <button
                    type="button"
                    onClick={() => { void handleSave(); }}

                    className="w-full py-2.5 rounded-[12px] font-black tracking-[0.15em] uppercase text-white transition-all active:scale-[0.98] cursor-pointer"
                    style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))',
                        border: '1px solid rgba(255,255,255,0.2)',
                        boxShadow: `0 4px 15px rgba(0,0,0,0.5)`,
                        fontSize: '12px',
                    }}
                >
                    Guardar Cambios
                </button>
            </div>
        </div>
    );
}

