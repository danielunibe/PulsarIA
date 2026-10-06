'use client';

import { motion, useReducedMotion } from 'motion/react';
import Image from 'next/image';
import FocusTrap from 'focus-trap-react';
import type { VideoData } from '@/types';
import {
    FaXmark, FaVideo, FaMusic, FaFileLines, FaDownload,
    FaPlay, FaPause, FaLanguage, FaBrain, FaWandMagicSparkles,
    FaBolt, FaCheckDouble, FaClock, FaCopy, FaShareNodes,
    FaMagnifyingGlass, FaVolumeHigh, FaVolumeXmark, FaExpand,
    FaTerminal, FaCode, FaCheck, FaRotateLeft, FaStar, FaThumbtack,
    FaCamera, FaFilm
} from '@/components/icon-library';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useSemanticIO } from '@/hooks/useSemanticIO';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';

// ============================================================
// ExpandedVideoModal — AAA Multimodal Knowledge Hub
// Pulsaria Ultra-Performance Inspector
// ============================================================

/**
 * Props del modal expandido de video — hub de conocimiento multimodal.
 * 
 * Muestra el video con reproductor, transcripción sincronizada,
 * análisis de IA (toggles mock), exportación UNIB, y búsqueda
 * semántica inline.
 */
interface ExpandedVideoModalProps {
    /** Datos del video a mostrar (de tipo VideoData del backend) */
    video: ExpandedVideoData;
    /** Callback para cerrar el modal */
    onClose: () => void;
    /** Abre el modo Cinema en este video (opcional; oculta el boton si no viene) */
    onOpenCinema?: () => void;
    /** Timestamp del momento que originó la apertura desde una búsqueda. */
    initialTime?: number;
    /** Indica si una tarjeta de biblioteca con el mismo layoutId origina la apertura. */
    sourceLayout?: boolean;
}

type SourceState = 'local' | 'online' | 'unavailable';
type DetailTab = 'transcript' | 'karaoke' | 'intel' | 'tools';
const DETAIL_TAB_ORDER: DetailTab[] = ['transcript', 'karaoke', 'intel', 'tools'];

type ExpandedVideoData = VideoData & {
    sourceState?: SourceState;
    transcriptAvailable?: boolean;
    keepStatus?: string;
    favorite?: boolean;
    pinned?: boolean;
    protected?: boolean;
};

interface TranscriptWord {
    word: string;
    start: number;
    end: number;
}

interface TranscriptChunk {
    chunk_index: number;
    chunk_text: string;
    start: number;
    end: number;
    words?: TranscriptWord[];
}

interface MediaArtifact {
    id: number;
    job_id: number;
    kind: 'poster' | 'keyframe' | 'screenshot' | string;
    path: string;
    timestamp?: number;
    label?: string;
    protected: boolean;
    size_bytes: number;
    created_at: string;
}

interface GeneratedOutput {
    id: number;
    jobId: number;
    category: string;
    format: string;
    path: string;
    sizeBytes: number;
    validated: boolean;
    label: string;
}

function isNativeShell(): boolean {
    if (typeof window === 'undefined') return false;
    return '__TAURI_INTERNALS__' in window
        || window.location.protocol === 'tauri:'
        || window.location.hostname === 'tauri.localhost';
}

async function resolveArtifactUrl(path: string): Promise<string | undefined> {
    if (/^(https?:\/\/|data:)/i.test(path)) return path;
    try {
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        return convertFileSrc(path);
    } catch {
        return undefined;
    }
}

/**
 * ExpandedVideoModal — Modal de reproducción y análisis detallado.
 * 
 * Features:
 * - Reproductor de video con controles (play/pause, volumen, velocidad, fullscreen)
 * - Transcripción sincronizada con timestamps (click para saltar al segundo)
 * - Tabs: Transcripción, Inteligencia, Exportar, Semántica
 * - Exportación a formato UNIB (.unib)
 * - Importación de archivos UNIB existentes
 * - Búsqueda semántica inline sobre la transcripción
 */
export function ExpandedVideoModal({ video, onClose, onOpenCinema, initialTime, sourceLayout = true }: ExpandedVideoModalProps) {
    const { t } = useI18n();
    const reducedMotion = useReducedMotion() ?? false;
    const videoRef = useRef<HTMLVideoElement>(null);
    const playButtonRef = useRef<HTMLButtonElement | null>(null);
    const muteFadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const semanticInputRef = useRef<HTMLInputElement>(null);
    const [mounted, setMounted] = useState(false);
    const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
    const [loadingTranscript, setLoadingTranscript] = useState(Boolean(video.id));
    const [transcriptError, setTranscriptError] = useState<string | null>(null);
    const [transcriptLoadAttempt, setTranscriptLoadAttempt] = useState(0);
    const [activeTab, setActiveTab] = useState<DetailTab>('transcript');
    const [filterQuery, setFilterQuery] = useState('');
    const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
    const handleTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
        const currentIndex = DETAIL_TAB_ORDER.indexOf(activeTab);
        let nextTab: DetailTab | undefined;
        if (event.key === 'ArrowRight') nextTab = DETAIL_TAB_ORDER[(currentIndex + 1) % DETAIL_TAB_ORDER.length];
        else if (event.key === 'ArrowLeft') nextTab = DETAIL_TAB_ORDER[(currentIndex - 1 + DETAIL_TAB_ORDER.length) % DETAIL_TAB_ORDER.length];
        else if (event.key === 'Home') nextTab = DETAIL_TAB_ORDER[0];
        else if (event.key === 'End') nextTab = DETAIL_TAB_ORDER[DETAIL_TAB_ORDER.length - 1];
        if (!nextTab) return;
        event.preventDefault();
        setActiveTab(nextTab);
        document.getElementById(`video-detail-tab-${nextTab}`)?.focus();
    }, [activeTab]);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState('0:00');
    const [duration, setDuration] = useState('0:00');
    const [rawDuration, setRawDuration] = useState(0);
    const [rawCurrentTime, setRawCurrentTime] = useState(0);
    const [isMuted, setIsMuted] = useState(true);
    const [playbackError, setPlaybackError] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [favorite, setFavorite] = useState(Boolean(video.favorite));
    const [pinned, setPinned] = useState(Boolean(video.pinned));
    const [artifacts, setArtifacts] = useState<MediaArtifact[]>([]);
    const [artifactUrls, setArtifactUrls] = useState<Record<number, string>>({});
    const [generatedOutputs, setGeneratedOutputs] = useState<GeneratedOutput[]>([]);
    const [generatedOutputUrls, setGeneratedOutputUrls] = useState<Record<number, string>>({});
    const [savingFrame, setSavingFrame] = useState(false);

    useEffect(() => {
        if (initialTime === undefined || !Number.isFinite(initialTime)) return;
        const seekToMatch = () => {
            const element = videoRef.current;
            if (!element) return;
            const requestedTime = Math.max(0, initialTime);
            const duration = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : requestedTime;
            element.currentTime = Math.min(requestedTime, duration);
            setRawCurrentTime(element.currentTime);
        };
        const element = videoRef.current;
        if (!element) return;
        if (element.readyState >= 1) seekToMatch();
        element.addEventListener('loadedmetadata', seekToMatch);
        return () => element.removeEventListener('loadedmetadata', seekToMatch);
    }, [initialTime, video.videoSrc]);

    const { exportSemantic, importSemantic, downloadUnib, exporting, importing, error: semanticError, exportedContent } = useSemanticIO();

    const sourceState: SourceState = video.sourceState || (video.videoSrc ? 'local' : 'unavailable');
    const transcriptOnly = !video.videoSrc;
    const sourceStateLabel = sourceState === 'local'
        ? t('detailSourceLocal')
        : sourceState === 'online'
            ? t('detailSourceOnline')
            : t('detailSourceUnavailable');

    const recordAccess = useCallback(async (event: 'open' | 'play' | 'search') => {
        if (!isNativeShell()) return;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('record_media_access', { jobId: video.id, accessKind: event });
        } catch {
            // Older shells may not expose access telemetry yet. Playback and
            // transcript-only inspection remain fully usable.
        }
    }, [video.id]);

    // Engine Toggles State
    const [toggles, setToggles] = useState({
        translate: true,
        sentiment: true,
        highlights: true,
    });

    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (active) setMounted(true);
        });
        return () => {
            active = false;
        };
    }, []);

    // Al cerrar, el foco vuelve a la tarjeta que abrió el modal.
    useEffect(() => {
        const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return () => {
            try {
                trigger?.focus({ preventScroll: true });
            } catch {
                /* el disparador ya no existe */
            }
            if (muteFadeRef.current) clearInterval(muteFadeRef.current);
        };
    }, []);

    // Al abrir, el foco va al control de reproducir (diálogo operativo).
    useEffect(() => {
        if (!mounted) return;
        const timer = window.setTimeout(() => {
            try {
                playButtonRef.current?.focus({ preventScroll: true });
            } catch {
                /* sin foco disponible */
            }
        }, reducedMotion ? 100 : 320);
        return () => window.clearTimeout(timer);
    }, [mounted, reducedMotion]);

    useEffect(() => {
        setFavorite(Boolean(video.favorite));
        setPinned(Boolean(video.pinned));
    }, [video.favorite, video.id, video.pinned]);

    const loadArtifacts = useCallback(async () => {
        if (!isNativeShell()) return;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const [next, nextOutputs] = await Promise.all([
                invoke<MediaArtifact[]>('get_job_artifacts', { jobId: video.id }),
                invoke<GeneratedOutput[]>('get_generated_outputs', { jobId: video.id }),
            ]);
            const urls = await Promise.all(next.map(async (artifact) => {
                const url = await resolveArtifactUrl(artifact.path);
                return [artifact.id, url] as const;
            }));
            setArtifacts(next);
            setArtifactUrls(Object.fromEntries(urls.filter(([, url]) => Boolean(url)) as Array<[string | number, string]>));
            const outputUrls = await Promise.all(nextOutputs.map(async (output) => [output.id, await resolveArtifactUrl(output.path)] as const));
            setGeneratedOutputs(nextOutputs);
            setGeneratedOutputUrls(Object.fromEntries(outputUrls.filter(([, url]) => Boolean(url)) as Array<[string | number, string]>));
        } catch {
            // Artifact rendering is additive; transcript and metadata remain usable
            // when an older native shell does not expose this command yet.
            setArtifacts([]);
            setArtifactUrls({});
            setGeneratedOutputs([]);
            setGeneratedOutputUrls({});
        }
    }, [video.id]);

    useEffect(() => {
        void loadArtifacts();
    }, [loadArtifacts]);

    useEffect(() => {
        void recordAccess('open');
    }, [recordAccess]);

    // Load transcript from SQLite backend via Tauri invoke
    useEffect(() => {
        if (!video.id) {
            setLoadingTranscript(false);
            setTranscriptChunks([]);
            setTranscriptError(null);
            return;
        }
        let cancelled = false;
        setLoadingTranscript(true);
        setTranscriptError(null);
        void (async () => {
            try {
                let segments: Array<{ chunk_index: number; chunk_text: string; start: number; end: number; words?: TranscriptWord[] }>;
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    segments = await invoke('get_transcript', { jobId: video.id });
                } catch {
                    const { REST_API_BASE } = await import('@/lib/api-config');
                    const response = await apiFetch(`${REST_API_BASE}/jobs/${video.id}/transcript`);
                    if (!response.ok) throw new Error(`Transcript request failed with status ${response.status}`);
                    segments = await response.json() as Array<{ chunk_index: number; chunk_text: string; start: number; end: number; words?: TranscriptWord[] }>;
                }

                const mapped: TranscriptChunk[] = segments.map((s) => ({
                    chunk_index: s.chunk_index,
                    chunk_text: s.chunk_text,
                    start: s.start,
                    end: s.end,
                    words: Array.isArray(s.words) ? s.words : undefined
                }));
                if (!cancelled) {
                    setTranscriptChunks(mapped);
                    setTranscriptError(null);
                }
            } catch (error) {
                console.error('Failed to load transcript:', error);
                if (!cancelled) {
                    setTranscriptChunks([]);
                    setTranscriptError(error instanceof Error ? error.message : String(error));
                }
            } finally {
                if (!cancelled) setLoadingTranscript(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [video.id, transcriptLoadAttempt]);

    const playVideo = useCallback((forceMute = false) => {
        const element = videoRef.current;
        if (!element) return;
        if (forceMute) {
            element.muted = true;
            setIsMuted(true);
        }
        void element.play()
            .then(() => {
                setPlaybackError(false);
                setIsPlaying(true);
                void recordAccess('play');
            })
            .catch(() => setIsPlaying(false));
    }, [recordAccess]);

    useEffect(() => {
        const element = videoRef.current;
        if (!element || !video.videoSrc) {
            setIsPlaying(false);
            return;
        }
        setPlaybackError(false);
        element.muted = true;
        setIsMuted(true);
        playVideo(true);
        return () => element.pause();
    }, [playVideo, video.videoSrc]);

    const togglePlay = useCallback(() => {
        const element = videoRef.current;
        if (!element) return;
        if (!element.paused) {
            element.pause();
            setIsPlaying(false);
        } else {
            void element.play().then(() => {
                setIsPlaying(true);
                void recordAccess('play');
            }).catch(() => setIsPlaying(false));
        }
    }, [recordAccess]);

    const openOriginal = useCallback(async () => {
        const url = video.originalUrl;
        if (!url) return;
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:') throw new Error('Unsupported URL protocol');
        } catch {
            toast.error('La URL original no es segura o está incompleta.');
            return;
        }
        try {
            const { open } = await import('@tauri-apps/plugin-shell');
            await open(url);
        } catch {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }, [video.originalUrl]);

    const toggleMute = useCallback(() => {
        const element = videoRef.current;
        if (!element) return;
        const willUnmute = element.muted;
        element.muted = !element.muted;
        setIsMuted(element.muted);
        // Continuidad con Cinema: al activar el sonido sube con rampa
        // progresiva en vez de entrar de golpe.
        if (willUnmute) {
            if (muteFadeRef.current) clearInterval(muteFadeRef.current);
            const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (reduced) {
                element.volume = 1;
                muteFadeRef.current = null;
                return;
            }
            element.volume = 0;
            let step = 0;
            const steps = 20;
            muteFadeRef.current = setInterval(() => {
                step += 1;
                const t = Math.min(1, step / steps);
                const eased = t * t * (3 - 2 * t);
                try {
                    element.volume = Math.round(eased * 100) / 100;
                } catch {
                    /* elemento ya no disponible */
                }
                if (t >= 1 && muteFadeRef.current) {
                    clearInterval(muteFadeRef.current);
                    muteFadeRef.current = null;
                }
            }, 45);
        } else if (muteFadeRef.current) {
            clearInterval(muteFadeRef.current);
            muteFadeRef.current = null;
        }
    }, []);

    const updateProtection = useCallback(async (kind: 'favorite' | 'pinned') => {
        if (!isNativeShell()) {
            toast.info('La protección se guarda desde la biblioteca local de Pulsaria.');
            return;
        }
        const nextFavorite = kind === 'favorite' ? !favorite : favorite;
        const nextPinned = kind === 'pinned' ? !pinned : pinned;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('set_media_protection', {
                jobId: video.id,
                favorite: nextFavorite,
                pinned: nextPinned,
                protected: null,
            });
            setFavorite(nextFavorite);
            setPinned(nextPinned);
            toast.success(kind === 'favorite'
                ? (nextFavorite ? 'Marcado como favorito' : 'Favorito retirado')
                : (nextPinned ? 'Video fijado' : 'Video desfijado'));
        } catch (error) {
            toast.error(`No se pudo actualizar la protección: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [favorite, pinned, video.id]);

    const saveCurrentFrame = useCallback(async () => {
        if (!isNativeShell()) {
            toast.info('Las capturas manuales requieren la aplicación de escritorio.');
            return;
        }
        const element = videoRef.current;
        if (!element || !element.videoWidth || !element.videoHeight) {
            toast.error('El video aún no tiene un frame disponible para capturar.');
            return;
        }
        setSavingFrame(true);
        try {
            const scale = Math.min(1, 1280 / element.videoWidth);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(element.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(element.videoHeight * scale));
            const context = canvas.getContext('2d');
            if (!context) throw new Error('No se pudo preparar el lienzo de captura');
            context.drawImage(element, 0, 0, canvas.width, canvas.height);

            let blob: Blob | null = null;
            for (const quality of [0.84, 0.74, 0.64, 0.54, 0.44]) {
                const candidate = await new Promise<Blob | null>((resolve) => {
                    canvas.toBlob(resolve, 'image/jpeg', quality);
                });
                if (candidate && candidate.size <= 2 * 1024 * 1024) {
                    blob = candidate;
                    break;
                }
                blob = candidate;
            }
            if (!blob || blob.size > 2 * 1024 * 1024) {
                throw new Error('La captura supera el límite de 2 MiB');
            }
            const buffer = await blob.arrayBuffer();
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('save_video_frame', {
                jobId: video.id,
                bytes: Array.from(new Uint8Array(buffer)),
                timestamp: rawCurrentTime,
                label: null,
            });
            await loadArtifacts();
            toast.success('Captura protegida guardada', { description: 'El límite es de 10 capturas por job.' });
        } catch (error) {
            toast.error(`No se pudo guardar la captura: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setSavingFrame(false);
        }
    }, [loadArtifacts, rawCurrentTime, video.id]);

    // Keyboard Shortcuts (Space, Escape, M, Arrows)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === ' ' && document.activeElement?.tagName !== 'INPUT') {
                e.preventDefault();
                togglePlay();
            } else if (e.key === 'm' || e.key === 'M') {
                if (document.activeElement?.tagName !== 'INPUT') {
                    toggleMute();
                }
            } else if (e.key === 'ArrowLeft' && document.activeElement?.tagName !== 'INPUT') {
                if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
            } else if (e.key === 'ArrowRight' && document.activeElement?.tagName !== 'INPUT') {
                if (videoRef.current) videoRef.current.currentTime = Math.min(rawDuration, videoRef.current.currentTime + 5);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, rawDuration, toggleMute, togglePlay]);

    const formatCleanTime = (seconds: number) => {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const formatPreciseTime = (seconds: number) => {
        if (isNaN(seconds) || seconds < 0) return '00:00.000';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const current = videoRef.current.currentTime;
        const dur = videoRef.current.duration || rawDuration;
        setRawCurrentTime(current);
        setCurrentTime(formatCleanTime(current));
        setProgress(dur > 0 ? (current / dur) * 100 : 0);
    };

    const handleLoadedMetadata = () => {
        if (!videoRef.current) return;
        const dur = videoRef.current.duration;
        setRawDuration(dur);
        setDuration(formatCleanTime(dur));
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!videoRef.current) return;
        const seekTime = (Number(e.target.value) / 100) * (videoRef.current.duration || rawDuration);
        videoRef.current.currentTime = seekTime;
        setProgress(Number(e.target.value));
    };

    const seekToSecond = (sec: number) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = sec;
        if (!isPlaying) {
            videoRef.current.play().then(() => setIsPlaying(true)).catch((error) => {
                console.warn('Video autoplay was blocked:', error);
                setIsPlaying(false);
            });
        }
    };

    const cyclePlaybackRate = () => {
        if (!videoRef.current) return;
        const rates = [1, 1.25, 1.5, 2];
        const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
        const newRate = rates[nextIdx];
        videoRef.current.playbackRate = newRate;
        setPlaybackRate(newRate);
        toast.info(t('detailPlaybackSpeed', { speed: newRate }), { duration: 1500 });
    };

    // Full text calculation
    const fullTranscriptText = useMemo(() => {
        return transcriptChunks.map(c => c.chunk_text).join(' ');
    }, [transcriptChunks]);

    const visualAnalysis = useMemo(() => {
        if (!video.visualAnalysis) return null;
        try {
            return JSON.parse(video.visualAnalysis) as {
                analysis_mode?: string;
                frame_count?: number;
                successful_frame_count?: number;
                frames?: Array<{ timestamp?: number; status?: string; ocr_text?: string }>;
            };
        } catch {
            return null;
        }
    }, [video.visualAnalysis]);

    // Filtered chunks
    const filteredChunks = useMemo(() => {
        if (!filterQuery.trim()) return transcriptChunks;
        const q = filterQuery.toLowerCase();
        return transcriptChunks.filter(c => c.chunk_text.toLowerCase().includes(q));
    }, [transcriptChunks, filterQuery]);

    // Karaoke: nivel palabra cuando Whisper lo entregó, si no degradado a chunk.
    const hasWordLevel = useMemo(
        () => transcriptChunks.some((chunk) => Array.isArray(chunk.words) && chunk.words.length > 0),
        [transcriptChunks],
    );

    const activeKaraokeIndex = useMemo(() => {
        if (transcriptOnly || transcriptChunks.length === 0) return -1;
        return transcriptChunks.findIndex((chunk) => rawCurrentTime >= chunk.start && rawCurrentTime <= chunk.end);
    }, [transcriptOnly, transcriptChunks, rawCurrentTime]);

    const karaokeChunkRefs = useRef(new Map<number, HTMLDivElement>());
    const karaokeListRef = useRef<HTMLDivElement | null>(null);

    // Auto-scroll estilo Apple Music: sigue la línea activa dentro del panel,
    // sin mover el scroll de la página o del modal.
    useEffect(() => {
        if (activeTab !== 'karaoke' || activeKaraokeIndex < 0) return;
        const node = karaokeChunkRefs.current.get(activeKaraokeIndex);
        const container = karaokeListRef.current;
        if (!node || !container) return;
        const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
            const nodeRect = node.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const top = nodeRect.top - containerRect.top + container.scrollTop
                - container.clientHeight / 2 + nodeRect.height / 2;
            container.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
        } catch {
            /* contenedor sin scroll disponible */
        }
    }, [activeTab, activeKaraokeIndex]);

    // Export JSON payload
    const exportPayload = useMemo(() => {
        return {
            source: "pulsaria",
            version: "1.0",
            video_id: video.id,
            url: video.originalUrl || video.videoSrc || "",
            platform: "tiktok",
            source_state: sourceState,
            metadata: {
                title: video.title || `Video #${video.id}`,
                author: video.author || "Desconocido",
                duration: video.duration,
                tags: video.tags || [],
                thumbnail: video.thumb
            },
            content: {
                summary: `Ficha estructurada del video '${video.title}'. Procesado por Pulsaria.`,
                topics: video.tags?.length ? video.tags : ["Audiovisual", "TikTok", "Pulsar"],
                intent: "Ingesta y Análisis de Conocimiento",
                full_transcript: fullTranscriptText,
                segments: transcriptChunks.map(c => ({
                    start: c.start,
                    end: c.end,
                    text: c.chunk_text
                }))
            },
            embeddings_metadata: {
                model: "all-MiniLM-L6-v2",
                dimensions: 384,
                total_chunks: transcriptChunks.length
            },
            julia_ready: true
        };
    }, [sourceState, video, fullTranscriptText, transcriptChunks]);

    const handleSemanticImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const content = await file.text();
            const imported = await importSemantic(content);
            if (imported) toast.success(t('detailUnibImported'));
        } catch (error) {
            console.error('Failed to import UNIB:', error);
            toast.error(t('detailUnibImportError'));
        }
    };

    const verifyPersistedJob = async () => {
        try {
            let jobs: Array<{ id: number }>;
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                jobs = await invoke<Array<{ id: number }>>('get_jobs');
            } catch {
                const { REST_API_BASE } = await import('@/lib/api-config');
                const response = await apiFetch(`${REST_API_BASE}/jobs`);
                if (!response.ok) throw new Error(`Jobs request failed with status ${response.status}`);
                jobs = await response.json() as Array<{ id: number }>;
            }
            if (jobs.some((job) => job.id === video.id)) {
                toast.success(t('detailDataCheckSuccess'), { description: t('detailDataCheckSuccessDescription', { id: video.id }) });
            } else {
                toast.error(t('detailDataCheckMissing'));
            }
        } catch (error) {
            console.error('Failed to verify saved video data:', error);
            toast.error(t('detailDataCheckError'));
        }
    };

    const copyToClipboard = async (text: string, format: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedFormat(format);
            toast.success(t('detailCopySuccess', { format }), {
                description: t('detailCopySuccessDescription', { count: text.length })
            });
            setTimeout(() => setCopiedFormat(null), 2500);
        } catch {
            toast.error(t('detailCopyError'));
        }
    };

    const copyTranscript = () => copyToClipboard(fullTranscriptText, t('detailPlainTextFormat'));

    if (!mounted) return null;

    return createPortal(
        <motion.div
            className="pulsaria-modal-backdrop fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6 pointer-events-auto backdrop-blur-2xl bg-black/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0.12 : 0.3, ease: 'easeOut' }}
            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <FocusTrap focusTrapOptions={{ initialFocus: false, escapeDeactivates: false }}>
            <motion.div
                layoutId={sourceLayout && !reducedMotion ? `video-card-${video.id}` : undefined}
                role="dialog"
                aria-modal="true"
                aria-label={t('detailDialogLabel')}
                className="pulsaria-detail-modal w-full max-w-[1240px] h-[88vh] min-h-0 max-h-[calc(100vh-2rem)] rounded-3xl overflow-hidden flex flex-col md:flex-row shadow-[0_25px_80px_rgba(0,0,0,0.9)] border border-white/10 relative"
                style={{
                    background: 'linear-gradient(145deg, rgba(16,18,27,0.98) 0%, rgba(8,10,15,0.99) 100%)',
                    boxShadow: '0 30px 90px rgba(0,0,0,0.9)'
                }}
                initial={reducedMotion ? { opacity: 0 } : { scale: 0.95, y: 20, opacity: 0 }}
                animate={reducedMotion ? { opacity: 1 } : { scale: 1, y: 0, opacity: 1 }}
                exit={reducedMotion ? { opacity: 0 } : { scale: 0.95, y: 20, opacity: 0 }}
                transition={reducedMotion
                    ? { duration: 0.12, ease: 'easeOut' }
                    : { type: 'spring', damping: 28, stiffness: 350 }}
            >
                {/* ── Left Column: Video Cinema Player ── */}
                <div className="pulsaria-detail-media-pane w-full md:w-[48%] h-[42%] min-h-0 md:h-full flex flex-col bg-black/60 relative border-r border-white/10 p-5 shrink-0 overflow-hidden">
                    {/* Compact metadata header */}
                    <div className="flex items-center justify-between gap-3 mb-3.5 shrink-0">
                        <div className="flex items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-wide backdrop-blur-md ${sourceState === 'local' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : sourceState === 'online' ? 'border-sky-400/20 bg-sky-400/10 text-sky-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-200'}`}>
                                {sourceStateLabel}
                            </span>
                            <span className="text-[11px] font-mono text-white/40 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/5">
                                #{video.id}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                aria-label={favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                                aria-pressed={favorite}
                                onClick={() => { void updateProtection('favorite'); }}
                                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all ${favorite ? 'border-amber-400/30 bg-amber-400/15 text-amber-300' : 'border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/10 hover:text-white'}`}
                                title={favorite ? 'Quitar favorito' : 'Marcar favorito'}
                            >
                                <FaStar size={11} />
                            </button>
                            <button
                                type="button"
                                aria-label={pinned ? 'Desfijar video' : 'Fijar video'}
                                aria-pressed={pinned}
                                onClick={() => { void updateProtection('pinned'); }}
                                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all ${pinned ? 'border-sky-400/30 bg-sky-400/15 text-sky-300' : 'border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/10 hover:text-white'}`}
                                title={pinned ? 'Desfijar video' : 'Fijar video'}
                            >
                                <FaThumbtack size={11} />
                            </button>
                        </div>
                    </div>

                    {/* Video Player Shell with Ambient Glow */}
                    <div className="pulsaria-detail-video-viewport group/viewport flex-1 min-h-0 rounded-2xl overflow-hidden relative bg-black/90 flex items-center justify-center shadow-2xl border border-white/[0.06]">
                        {/* Ambient Backdrop Blur: el propio video tiñe el fondo, cero bandas negras */}
                        {video.thumb && (
                            <div
                                aria-hidden="true"
                                className="absolute inset-0 bg-cover bg-center filter blur-3xl scale-125 opacity-65 transition-opacity duration-700 pointer-events-none select-none"
                                style={{ backgroundImage: `url(${video.thumb})` }}
                            />
                        )}

                        {video.videoSrc ? (
                            <>
                            <video
                                ref={videoRef}
                                src={video.videoSrc}
                                poster={video.thumb}
                                className="pulsaria-detail-video relative z-10 block h-full w-full rounded-xl object-contain transition-all"
                                playsInline
                                loop
                                autoPlay
                                muted={isMuted}
                                onTimeUpdate={handleTimeUpdate}
                                onLoadedMetadata={handleLoadedMetadata}
                                onCanPlay={() => playVideo(true)}
                                onError={() => {
                                    setPlaybackError(true);
                                    setIsPlaying(false);
                                }}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onClick={togglePlay}
                            />
                            {/* Capa hover-reveal: solo aparece con cursor o foco, sale elegante */}
                            <div
                                aria-hidden="true"
                                className="pulsaria-detail-veil pointer-events-none absolute inset-0 z-20 flex items-center justify-center opacity-0 translate-y-1 transition-all duration-300 ease-out group-hover/viewport:opacity-100 group-hover/viewport:translate-y-0 group-focus-within/viewport:opacity-100 group-focus-within/viewport:translate-y-0"
                            >
                                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                                    {isPlaying ? <FaPause size={18} /> : <FaPlay size={18} className="ml-1" />}
                                </span>
                            </div>
                            </>
                        ) : (
                            <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden p-8 text-center">
                                <div className="flex max-w-sm flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/55 p-6 backdrop-blur-md">
                                    <FaVideo size={28} className="text-white/30" />
                                    <p className="text-xs font-semibold text-white/80">
                                        {sourceState === 'online' ? 'El medio local está fuera de esta cuota.' : 'La fuente remota no está disponible localmente.'}
                                    </p>
                                    <p className="text-[11px] leading-relaxed text-white/50">La ficha, el transcript y los timestamps permanecen disponibles. No se redescarga nada automáticamente.</p>
                                    {video.originalUrl && (
                                    <button
                                        type="button"
                                        onClick={() => void openOriginal()}
                                        className="px-3.5 py-1.5 rounded-lg bg-white/10 border border-white/15 text-white text-xs font-medium hover:bg-white/20 transition-all"
                                    >
                                        Abrir en TikTok
                                    </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {playbackError && video.videoSrc && <div className="mt-2 shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-center text-[9px] font-bold uppercase tracking-wider text-white/55">Video no disponible</div>}

                    {/* Controles estilo Apple fuera del lienzo de video */}
                    {video.videoSrc && (
                        <div className="pulsaria-detail-controls mt-3 shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-3 flex flex-col gap-2">
                            {/* Seekbar */}
                            <div className="flex items-center gap-2.5">
                                <span className="text-white/80 font-mono text-[11px] font-medium shrink-0">{currentTime}</span>
                                <input
                                    type="range"
                                    aria-label="Posición del video"
                                    min="0"
                                    max="100"
                                    value={progress}
                                    onChange={handleSeek}
                                    className="flex-1 accent-white h-1 bg-white/15 rounded-full appearance-none cursor-pointer hover:h-1.5 transition-all"
                                />
                                <span className="text-white/40 font-mono text-[11px] shrink-0">{duration}</span>
                            </div>

                            {/* Control Bar */}
                            <div className="flex items-center justify-between pt-0.5">
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        aria-label="Guardar captura del frame actual"
                                        onClick={() => { void saveCurrentFrame(); }}
                                        disabled={savingFrame}
                                        className="w-7 h-7 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all disabled:opacity-40"
                                        title="Guardar captura protegida"
                                    >
                                        <FaCamera size={11} />
                                    </button>
                                    <button
                                        type="button"
                                        ref={playButtonRef}
                                        aria-label={isPlaying ? 'Pausar video' : 'Reproducir video'}
                                        onClick={togglePlay}
                                        className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/15 flex items-center justify-center transition-all shadow-sm"
                                    >
                                        {isPlaying ? <FaPause size={11} /> : <FaPlay size={11} className="ml-0.5" />}
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={isMuted ? 'Activar sonido' : 'Silenciar video'}
                                        onClick={toggleMute}
                                        className="w-7 h-7 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all"
                                    >
                                        {isMuted ? <FaVolumeXmark size={11} className="text-red-400" /> : <FaVolumeHigh size={11} />}
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Cambiar velocidad de reproducción"
                                        onClick={cyclePlaybackRate}
                                        className="px-2 h-7 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-white/80 text-[10px] font-mono font-semibold transition-all"
                                    >
                                        {playbackRate}x
                                    </button>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        aria-label="Reiniciar video"
                                        onClick={() => seekToSecond(0)}
                                        className="w-7 h-7 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all"
                                        title="Reiniciar Video"
                                    >
                                        <FaRotateLeft size={11} />
                                    </button>
                                    {onOpenCinema && (
                                        <button
                                            type="button"
                                            aria-label="Abrir en modo Cinema"
                                            onClick={onOpenCinema}
                                            className="w-7 h-7 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all"
                                            title="Abrir en modo Cinema"
                                        >
                                            <FaFilm size={11} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Video Info Summary Footer */}
                    <div className="pulsaria-detail-meta mt-3 pt-3 border-t border-white/[0.08] flex flex-col gap-1 shrink-0">
                        <h3 className="text-white font-semibold text-sm truncate" title={video.title}>
                            {video.title || `TikTok Video #${video.id}`}
                        </h3>
                        <div className="flex items-center justify-between text-xs text-white/50">
                            <span className="truncate">Por <strong className="text-white/80 font-medium">@{video.author || "desconocido"}</strong></span>
                            <span className="shrink-0 text-[10px] bg-white/[0.04] px-2 py-0.5 rounded border border-white/5 font-mono text-white/60">
                                {video.duration}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Right Column: AAA Inspector, Transcript & Export ── */}
                <div className="pulsaria-detail-inspector w-full md:w-[52%] h-[58%] min-h-0 md:h-full flex flex-col p-5 bg-[#0b0d14]/95 overflow-hidden relative">
                    {/* Header Action Row */}
                    <div className="pulsaria-detail-inspector-header flex min-w-0 items-center justify-between gap-3 pb-3 border-b border-white/[0.08] shrink-0">
                        {/* Tab Switcher - Apple Segmented Control */}
                        <div role="tablist" aria-label={t('detailTabsLabel')} className="pulsaria-detail-tabs flex min-w-0 max-w-full shrink overflow-x-auto bg-white/[0.05] p-1 rounded-xl border border-white/[0.08] gap-1">
                            <button
                                type="button"
                                id="video-detail-tab-transcript"
                                role="tab"
                                aria-selected={activeTab === 'transcript'}
                                aria-controls="video-detail-panel-transcript"
                                tabIndex={activeTab === 'transcript' ? 0 : -1}
                                onClick={() => setActiveTab('transcript')}
                                onKeyDown={handleTabKeyDown}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
                                    activeTab === 'transcript'
                                        ? 'bg-white/15 text-white shadow-sm font-semibold'
                                        : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                                }`}
                            >
                                <FaFileLines size={11} className={activeTab === 'transcript' ? 'text-white' : 'text-white/40'} />
                                {t('detailTranscriptTab')}
                            </button>
                            <button
                                type="button"
                                id="video-detail-tab-karaoke"
                                role="tab"
                                aria-selected={activeTab === 'karaoke'}
                                aria-controls="video-detail-panel-karaoke"
                                tabIndex={activeTab === 'karaoke' ? 0 : -1}
                                onClick={() => setActiveTab('karaoke')}
                                onKeyDown={handleTabKeyDown}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
                                    activeTab === 'karaoke'
                                        ? 'bg-white/15 text-white shadow-sm font-semibold'
                                        : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                                }`}
                            >
                                <FaMusic size={11} className={activeTab === 'karaoke' ? 'text-white' : 'text-white/40'} />
                                {t('detailSyncedTextTab')}
                                {!loadingTranscript && transcriptChunks.length > 0 && (
                                    <span
                                        title={hasWordLevel ? 'Sincronía por palabra' : 'Sincronía por línea'}
                                        aria-label={hasWordLevel ? 'Sincronía por palabra' : 'Sincronía por línea'}
                                        className={`h-1.5 w-1.5 rounded-full ${hasWordLevel ? 'bg-[#25f4ee] shadow-[0_0_8px_rgba(37,244,238,0.8)]' : 'bg-white/30'}`}
                                    />
                                )}
                            </button>
                            <button
                                type="button"
                                id="video-detail-tab-intel"
                                role="tab"
                                aria-selected={activeTab === 'intel'}
                                aria-controls="video-detail-panel-intel"
                                tabIndex={activeTab === 'intel' ? 0 : -1}
                                onClick={() => setActiveTab('intel')}
                                onKeyDown={handleTabKeyDown}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
                                    activeTab === 'intel'
                                        ? 'bg-white/15 text-white shadow-sm font-semibold'
                                        : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                                }`}
                            >
                                <FaBrain size={11} className={activeTab === 'intel' ? 'text-white' : 'text-white/40'} />
                                {t('detailAnalysisTab')}
                            </button>
                            <button
                                type="button"
                                id="video-detail-tab-tools"
                                role="tab"
                                aria-selected={activeTab === 'tools'}
                                aria-controls="video-detail-panel-tools"
                                tabIndex={activeTab === 'tools' ? 0 : -1}
                                onClick={() => setActiveTab('tools')}
                                onKeyDown={handleTabKeyDown}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
                                    activeTab === 'tools'
                                        ? 'bg-white/15 text-white shadow-sm font-semibold'
                                        : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                                }`}
                            >
                                <FaShareNodes size={11} className={activeTab === 'tools' ? 'text-white' : 'text-white/40'} />
                                {t('detailToolsTab')}
                            </button>
                        </div>

                        {/* Close Modal Button */}
                        <button
                            type="button"
                            aria-label={t('detailClose')}
                            onClick={onClose}
                            className="w-8 h-8 shrink-0 rounded-full bg-white/[0.05] hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
                            title={t('detailCloseHint')}
                        >
                            <FaXmark size={13} />
                        </button>
                    </div>

                    {/* Tab 1: Synchronized Transcript */}
                    {activeTab === 'transcript' && (
                        <div id="video-detail-panel-transcript" role="tabpanel" aria-labelledby="video-detail-tab-transcript" tabIndex={0} className="flex-1 flex flex-col min-h-0 pt-4 overflow-hidden">
                            {/* Search & Copy Bar */}
                            <div className="flex items-center gap-2 mb-3 shrink-0">
                                <div className="flex-1 relative">
                                    <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs" />
                                    <input
                                        type="text"
                                        placeholder={t('detailFilterTranscript')}
                                        value={filterQuery}
                                        onChange={(e) => setFilterQuery(e.target.value)}
                                        className="w-full pl-8 pr-3 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25 focus:bg-white/[0.06] transition-all"
                                    />
                                    {filterQuery && (
                                        <button
                                            type="button"
                                            aria-label={t('detailClearTranscriptFilter')}
                                            onClick={() => setFilterQuery('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs"
                                        >
                                            <FaXmark size={10} />
                                        </button>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    aria-label={t('detailCopyTranscript')}
                                    onClick={copyTranscript}
                                    disabled={loadingTranscript || !fullTranscriptText}
                                    className="px-3 py-2 bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 rounded-xl text-xs font-medium text-white/90 flex items-center gap-1.5 shrink-0 transition-all disabled:cursor-not-allowed disabled:opacity-45"
                                    title={t('detailCopyTranscript')}
                                >
                                    {copiedFormat === t('detailPlainTextFormat') ? <FaCheck className="text-emerald-400" size={11} /> : <FaCopy size={11} />}
                                    {t('detailCopyTranscript')}
                                </button>
                            </div>

                            {transcriptError && (
                                <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] leading-relaxed text-red-200">
                                    <span>{t('detailTranscriptLoadError')}</span>
                                    <button type="button" onClick={() => setTranscriptLoadAttempt((attempt) => attempt + 1)} className="shrink-0 rounded-lg bg-red-400/10 px-2.5 py-1.5 font-semibold text-red-100 hover:bg-red-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/60">
                                        {t('detailTranscriptRetry')}
                                    </button>
                                </div>
                            )}
                            {transcriptOnly && !transcriptError && (
                                <div className="mb-3 rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-[10px] leading-relaxed text-sky-200">
                                    {t('detailTranscriptNoLocalVideo')}
                                </div>
                            )}

                            {/* Transcript Chunks List */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2 rounded-2xl bg-black/30 border border-white/5 p-3">
                                {loadingTranscript ? (
                                    <div className="flex flex-col gap-2" role="status" aria-live="polite" aria-label={t('detailTranscriptLoading')}>
                                        <div className="pulsaria-shimmer h-12 rounded-xl" />
                                        <div className="pulsaria-shimmer h-12 rounded-xl" />
                                        <div className="pulsaria-shimmer h-12 w-3/4 rounded-xl" />
                                        <span className="text-xs text-white/55">{t('detailTranscriptLoading')}</span>
                                    </div>
                                ) : transcriptError ? null : filteredChunks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-white/40 text-xs gap-2">
                                        <FaFileLines size={24} className="text-white/20" />
                                        {filterQuery.trim()
                                            ? <span>{t('detailTranscriptFilterNoResults', { query: filterQuery })}</span>
                                            : transcriptChunks.length === 0
                                                ? <span>{t('detailTranscriptEmpty')}</span>
                                                : <span>{t('detailTranscriptNoMatches')}</span>
                                        }
                                    </div>
                                ) : (
                                    filteredChunks.map((chunk) => {
                                        const isChunkActive = !transcriptOnly && rawCurrentTime >= chunk.start && rawCurrentTime <= chunk.end;
                                        return (
                                            <motion.button
                                                type="button"
                                                key={chunk.chunk_index}
                                                onClick={() => seekToSecond(chunk.start)}
                                                disabled={transcriptOnly}
                                                aria-label={`Ir al segmento ${chunk.chunk_index + 1}, desde ${formatPreciseTime(chunk.start)}`}
                                                className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-1.5 ${transcriptOnly ? 'cursor-default opacity-90' : 'cursor-pointer'} ${
                                                    isChunkActive
                                                        ? 'bg-white/10 border-white/20 shadow-sm'
                                                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
                                                }`}
                                                whileHover={{ scale: 1.005 }}
                                                whileTap={{ scale: 0.995 }}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[10px] font-mono font-medium ${isChunkActive ? 'text-white' : 'text-white/40'}`}>
                                                        {formatCleanTime(chunk.start)} → {formatCleanTime(chunk.end)}
                                                    </span>
                                                    <span className="text-[9px] font-medium text-white/30">
                                                        #{chunk.chunk_index + 1}
                                                    </span>
                                                </div>
                                                <p className={`text-xs leading-relaxed ${isChunkActive ? 'text-white font-medium' : 'text-white/70'}`}>
                                                    {chunk.chunk_text}
                                                </p>
                                            </motion.button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tab Karaoke: letra sincronizada estilo Apple Music */}
                    {activeTab === 'karaoke' && (
                        <div id="video-detail-panel-karaoke" role="tabpanel" aria-labelledby="video-detail-tab-karaoke" tabIndex={0} className="flex-1 flex flex-col min-h-0 pt-4 overflow-hidden">
                            <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                                    {t('karaokeHint')}
                                </p>
                                <span className="text-[10px] font-mono text-white/40">
                                    {activeKaraokeIndex >= 0
                                        ? t('karaokeLineCounter', { current: activeKaraokeIndex + 1, total: transcriptChunks.length })
                                        : t('karaokeLinesTotal', { total: transcriptChunks.length })}
                                </span>
                            </div>
                            {transcriptError && (
                                <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] leading-relaxed text-red-200">
                                    <span>{t('detailTranscriptLoadError')}</span>
                                    <button type="button" onClick={() => setTranscriptLoadAttempt((attempt) => attempt + 1)} className="shrink-0 rounded-lg bg-red-400/10 px-2.5 py-1.5 font-semibold text-red-100 hover:bg-red-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/60">
                                        {t('detailTranscriptRetry')}
                                    </button>
                                </div>
                            )}
                            {transcriptOnly && !transcriptError && (
                                <div className="mb-3 rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-[10px] leading-relaxed text-sky-200">
                                    {t('karaokeTranscriptOnly')}
                                </div>
                            )}
                            {!hasWordLevel && transcriptChunks.length > 0 && !transcriptError && (
                                <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] leading-relaxed text-white/50">
                                    {t('karaokeNoWordLevel')}
                                </div>
                            )}
                            <div ref={karaokeListRef} className="pulsaria-karaoke-list flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2 rounded-2xl bg-black/30 border border-white/5 p-4" role="list" aria-label="Letra sincronizada">
                                {loadingTranscript ? (
                                    <div className="flex flex-col gap-2" role="status" aria-live="polite" aria-label={t('detailTranscriptLoading')}>
                                        <div className="pulsaria-shimmer h-14 rounded-xl" />
                                        <div className="pulsaria-shimmer h-14 rounded-xl" />
                                        <div className="pulsaria-shimmer h-14 w-2/3 rounded-xl" />
                                        <span className="text-xs text-white/55">{t('detailTranscriptLoading')}</span>
                                    </div>
                                ) : transcriptError ? null : transcriptChunks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-white/40 text-xs gap-2">
                                        <FaMusic size={24} className="text-white/20" />
                                        <span>{t('detailTranscriptEmpty')}</span>
                                    </div>
                                ) : (
                                    transcriptChunks.map((chunk, chunkIndex) => {
                                        const isActive = chunkIndex === activeKaraokeIndex;
                                        const progress = chunk.end > chunk.start
                                            ? Math.min(1, Math.max(0, (rawCurrentTime - chunk.start) / (chunk.end - chunk.start)))
                                            : 0;
                                        const words = Array.isArray(chunk.words) ? chunk.words : [];
                                        return (
                                            <div
                                                key={chunk.chunk_index}
                                                ref={(node) => {
                                                    if (node) karaokeChunkRefs.current.set(chunkIndex, node);
                                                    else karaokeChunkRefs.current.delete(chunkIndex);
                                                }}
                                                role="listitem"
                                                aria-current={isActive ? 'true' : undefined}
                                                className={`pulsaria-karaoke-line rounded-xl border px-4 py-3 transition-all duration-300 ${isActive ? 'is-active' : ''}`}
                                            >
                                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                                    <span className="text-[10px] font-mono text-white/35">
                                                        {formatCleanTime(chunk.start)} → {formatCleanTime(chunk.end)}
                                                    </span>
                                                    {isActive && !transcriptOnly && (
                                                        <span className="h-1.5 flex-1 max-w-24 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progreso de la línea">
                                                            <span className="block h-full rounded-full bg-gradient-to-r from-[#fe2c55] to-[#25f4ee]" style={{ width: `${Math.round(progress * 100)}%` }} />
                                                        </span>
                                                    )}
                                                </div>
                                                {words.length > 0 ? (
                                                    <p className="pulsaria-karaoke-words text-[15px] leading-[2]">
                                                        {words.map((word, wordIndex) => {
                                                            const spoken = !transcriptOnly && rawCurrentTime >= word.start;
                                                            return (
                                                                <button
                                                                    key={`${word.start}-${word.end}-${wordIndex}`}
                                                                    type="button"
                                                                    disabled={transcriptOnly}
                                                                    onClick={() => seekToSecond(word.start)}
                                                                    title={transcriptOnly ? t('karaokeNoVideo') : t('karaokeSkipWord', { word: word.word, time: formatPreciseTime(word.start) })}
                                                                    aria-label={transcriptOnly ? word.word : t('karaokeSkipWord', { word: word.word, time: formatPreciseTime(word.start) })}
                                                                    className={`pulsaria-karaoke-word ${spoken ? 'is-spoken' : ''} ${transcriptOnly ? 'cursor-default' : 'cursor-pointer'}`}
                                                                >
                                                                    {word.word}
                                                                </button>
                                                            );
                                                        })}
                                                    </p>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        disabled={transcriptOnly}
                                                        onClick={() => seekToSecond(chunk.start)}
                                                        title={transcriptOnly ? t('karaokeNoVideo') : t('karaokeSkipLine', { line: chunkIndex + 1 })}
                                                        aria-label={t('karaokeSkipLine', { line: chunkIndex + 1 })}
                                                        className={`w-full text-left text-[15px] leading-[2] transition-colors ${transcriptOnly ? 'cursor-default text-white/60' : 'cursor-pointer'} ${isActive ? 'text-white font-semibold' : 'text-white/45 hover:text-white/80'}`}
                                                    >
                                                        {chunk.chunk_text}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tab 2: AI Intelligence & Multimodal Summary */}
                    {activeTab === 'intel' && (
                        <div id="video-detail-panel-intel" role="tabpanel" aria-labelledby="video-detail-tab-intel" tabIndex={0} className="flex-1 flex flex-col min-h-0 pt-4 overflow-y-auto custom-scrollbar gap-4 pr-1">
                            {/* Instructivo audiovisual persistido */}
                            <div className="p-4 rounded-2xl bg-black/40 border border-[#8a5cff]/30 flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-bold text-[#8a5cff] uppercase tracking-widest">Instructivo audiovisual</span>
                                    <span className="text-[9px] text-white/40 uppercase">Fuente local</span>
                                </div>
                                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-white/75 font-sans max-h-48 overflow-y-auto custom-scrollbar">
                                    {video.instructionalGuide || 'Este job aún no tiene un instructivo persistido. Ejecuta el procesamiento audiovisual para generarlo.'}
                                </pre>
                            </div>

                            {visualAnalysis && (
                                <div className="p-4 rounded-2xl bg-black/40 border border-[#25f4ee]/20 flex flex-col gap-2">
                                    <span className="text-[10px] font-bold text-[#25f4ee] uppercase tracking-widest">Evidencia visual</span>
                                    <div className="grid grid-cols-2 gap-2 text-[10px] text-white/60">
                                        <span>Modo: <strong className="text-white/85">{visualAnalysis.analysis_mode || 'local'}</strong></span>
                                        <span>Keyframes: <strong className="text-white/85">{visualAnalysis.successful_frame_count ?? 0}/{visualAnalysis.frame_count ?? 0}</strong></span>
                                    </div>
                                    {visualAnalysis.frames?.some((frame) => frame.ocr_text) && (
                                        <p className="text-[10px] text-white/55">OCR: {visualAnalysis.frames.filter((frame) => frame.ocr_text).map((frame) => frame.ocr_text).join(' | ')}</p>
                                    )}
                                </div>
                            )}

                            {artifacts.length > 0 && (
                                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-col gap-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[10px] font-bold text-white/55 uppercase tracking-widest">Artifacts locales</span>
                                        <span className="text-[9px] text-white/35">{artifacts.length} conservados</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {artifacts.map((artifact) => (
                                            <figure key={artifact.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                                                {artifactUrls[artifact.id] ? (
                                                    <div className="relative aspect-video w-full">
                                                        <Image
                                                            src={artifactUrls[artifact.id]}
                                                            alt={artifact.label || `${artifact.kind} del job ${video.id}`}
                                                            fill
                                                            unoptimized
                                                            sizes="(max-width: 640px) 50vw, 33vw"
                                                            className="object-cover"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="flex aspect-video items-center justify-center text-[9px] text-white/35">Sin vista previa</div>
                                                )}
                                                <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5 text-[9px] text-white/55">
                                                    <span className="truncate">{artifact.label || (artifact.kind === 'keyframe' ? 'Keyframe' : artifact.kind === 'screenshot' ? 'Captura protegida' : 'Poster')}</span>
                                                    {artifact.protected && <span className="shrink-0 text-emerald-300">Protegida</span>}
                                                </figcaption>
                                            </figure>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {generatedOutputs.length > 0 && (
                                <div className="p-4 rounded-2xl bg-black/40 border border-[#25f4ee]/20 flex flex-col gap-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[10px] font-bold text-[#25f4ee] uppercase tracking-widest">Salidas seleccionadas</span>
                                        <span className="text-[9px] text-white/35">{generatedOutputs.length} validadas</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {generatedOutputs.map((output) => (
                                            <a
                                                key={output.id}
                                                href={generatedOutputUrls[output.id] || '#'}
                                                download
                                                aria-disabled={!generatedOutputUrls[output.id]}
                                                className={`rounded-xl border px-3 py-2 text-[9px] transition ${generatedOutputUrls[output.id] ? 'border-[#25f4ee]/25 bg-[#25f4ee]/5 text-white/80 hover:bg-[#25f4ee]/10' : 'pointer-events-none border-white/5 text-white/30'}`}
                                            >
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="font-black uppercase tracking-wider">{output.format}</span>
                                                    <span className={output.validated ? 'text-emerald-300' : 'text-amber-300'}>{output.validated ? 'OK' : 'Revisar'}</span>
                                                </span>
                                                <span className="mt-1 block truncate text-white/45">{output.label}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Multimodal Badges */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-white/40 uppercase">Vector Dimension</span>
                                    <span className="text-lg font-black text-[#25f4ee]">384-D</span>
                                    <span className="text-[9px] text-white/40">all-MiniLM-L6-v2</span>
                                </div>
                                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-white/40 uppercase">Chunks Indexados</span>
                                    <span className="text-lg font-black text-[#fe2c55]">{transcriptChunks.length}</span>
                                    <span className="text-[9px] text-white/40">150 chars / 50 overlap</span>
                                </div>
                                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-white/40 uppercase">Exportar UNIB</span>
                                    <span className="text-lg font-black text-emerald-400">READY</span>
                                    <span className="text-[9px] text-white/40">Protocol v1.0</span>
                                </div>
                            </div>

                            {/* Extracted Topics */}
                            <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-col gap-2">
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Temas Detectados</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {video.tags?.length ? (
                                        video.tags.map((t, idx) => (
                                            <span key={idx} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-white/80">
                                                #{t}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-white/40">Sin etiquetas persistidas para este job.</span>
                                    )}
                                </div>
                            </div>

                            {/* Processing Toggles */}
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Capas de Inteligencia</span>
                                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#25f4ee]/20 text-[#25f4ee] flex items-center justify-center">
                                            <FaLanguage size={14} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-white">Transcripción Fonética</span>
                                            <span className="text-[10px] text-white/40">Faster-Whisper con segmentación temporal</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-[#25f4ee]/10 text-[#25f4ee]">ACTIVO</span>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#8a5cff]/20 text-[#8a5cff] flex items-center justify-center">
                                            <FaBrain size={14} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-white">Embeddings Densos Sharded</span>
                                            <span className="text-[10px] text-white/40">4 shards HNSW con similitud Coseno</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-[#8a5cff]/10 text-[#8a5cff]">INDEXADO</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'tools' && (
                        <div id="video-detail-panel-tools" role="tabpanel" aria-labelledby="video-detail-tab-tools" tabIndex={0} className="flex-1 min-h-0 pt-4 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1">
                            <p className="shrink-0 text-xs leading-relaxed text-white/55">{t('detailToolsIntro')}</p>

                            <section className="flex min-h-[210px] flex-col rounded-2xl border border-white/10 bg-black/30 p-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="text-xs font-semibold text-white/85">{t('detailJsonHeading')}</h3>
                                        <p className="mt-1 text-[10px] leading-relaxed text-white/45">{t('detailJsonDescription')}</p>
                                    </div>
                                    <button
                                        type="button"
                                        aria-label={t('detailCopyJson')}
                                        onClick={() => copyToClipboard(JSON.stringify(exportPayload, null, 2), 'JSON')}
                                        className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#8a5cff]/15 px-3 py-2 text-xs font-semibold text-[#c8b5ff] transition-colors hover:bg-[#8a5cff]/25"
                                    >
                                        {copiedFormat === 'JSON' ? <FaCheck size={12} /> : <FaCopy size={12} />}
                                        {t('detailCopyJson')}
                                    </button>
                                </div>
                                <div className="min-h-36 flex-1 overflow-auto rounded-xl bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-[#9ef5f2] select-all">
                                    <pre>{JSON.stringify(exportPayload, null, 2)}</pre>
                                </div>
                            </section>

                            <section className="flex min-h-[250px] flex-col rounded-2xl border border-white/10 bg-black/30 p-3">
                                <div className="mb-2">
                                    <h3 className="text-xs font-semibold text-white/85">{t('detailUnibHeading')}</h3>
                                    <p className="mt-1 text-[10px] leading-relaxed text-white/45">{t('detailUnibDescription')}</p>
                                </div>
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        aria-label={t('detailExportUnib')}
                                        onClick={async () => {
                                            if (!video.id) return;
                                            await exportSemantic(video.id);
                                        }}
                                        disabled={exporting}
                                        className="min-h-10 rounded-lg bg-[#25f4ee]/10 px-3 py-2 text-xs font-semibold text-[#8df5f2] transition-colors hover:bg-[#25f4ee]/20 disabled:opacity-50"
                                    >
                                        {exporting ? t('detailUnibExporting') : t('detailExportUnib')}
                                    </button>
                                    <input
                                        ref={semanticInputRef}
                                        type="file"
                                        accept=".unib,.txt"
                                        onChange={handleSemanticImport}
                                        className="hidden"
                                        aria-label={t('detailSelectUnib')}
                                    />
                                    <button
                                        type="button"
                                        aria-label={t('detailImportUnib')}
                                        onClick={() => semanticInputRef.current?.click()}
                                        disabled={importing}
                                        className="min-h-10 rounded-lg bg-[#8a5cff]/10 px-3 py-2 text-xs font-semibold text-[#c8b5ff] transition-colors hover:bg-[#8a5cff]/20 disabled:opacity-50"
                                    >
                                        {importing ? t('detailUnibImporting') : t('detailImportUnib')}
                                    </button>
                                    {exportedContent && (
                                        <button
                                            type="button"
                                            aria-label={t('detailDownloadUnib')}
                                            onClick={downloadUnib}
                                            className="min-h-10 rounded-lg bg-white/[0.08] px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/[0.14]"
                                        >
                                            {t('detailDownloadUnib')}
                                        </button>
                                    )}
                                </div>
                                {semanticError && <p role="alert" className="mb-2 text-xs text-red-300">{semanticError}</p>}
                                <div className="min-h-24 flex-1 overflow-auto rounded-xl bg-black/30 p-3">
                                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-white/65">
                                        {exportedContent || t('detailUnibPlaceholder')}
                                    </pre>
                                </div>
                            </section>

                            <div className="grid shrink-0 grid-cols-1 gap-2 pb-1 sm:grid-cols-2">
                                <button
                                    type="button"
                                    aria-label={t('detailMarkdownCopy')}
                                    onClick={() => {
                                        const md = `# ${video.title || 'Video'}\n**Autor:** @${video.author}\n**Duración:** ${video.duration}\n\n## ${t('detailTranscriptTab')}\n${fullTranscriptText}`;
                                        copyToClipboard(md, 'Markdown');
                                    }}
                                    className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/[0.1]"
                                >
                                    <FaCode size={12} />
                                    {t('detailMarkdownCopy')}
                                </button>
                                <button
                                    type="button"
                                    aria-label={t('detailDataCheckButton')}
                                    onClick={() => { void verifyPersistedJob(); }}
                                    className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/[0.1]"
                                >
                                    <FaCheckDouble size={12} />
                                    {t('detailDataCheckButton')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
            </FocusTrap>
        </motion.div>,
        document.body
    );
}
