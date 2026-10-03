'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ============================================================
// SettingsContext — Sistema Global de Ajustes
// Guarda las preferencias del sistema aparte del tema visual:
// formatos habilitados y directorio de salida.
// ============================================================

/**
 * Temas visuales disponibles para la aplicación.
 * 
 * - `chromatic`: Tema Pulsaria con los acentos de marca (default)
 * - `carbon`: Tema oscuro premium con glassmorphism
 * - `aurora`: Tema inspirado en la aurora boreal
 * - `oled`: Tema puro negro para pantallas OLED
 * - `cyberpunk`: Tema futurista con neón
 * - `solar`: Tema cálido de atardecer ámbar
 */
export type AppTheme = 'carbon' | 'chromatic' | 'aurora' | 'oled' | 'cyberpunk' | 'solar';

/**
 * Política de retención de archivos de video procesados.
 * 
 * - `keep`: Conservar archivos locales (video, audio, transcripción)
 * - `online`: Eliminar archivos locales tras procesar, conservar solo la ficha
 */
export type RetentionPolicy = 'keep' | 'online';
export type ProcessingQuality = 'fast' | 'balanced' | 'high';
export type VideoFit = 'cover' | 'contain';
export type SubtitleStyle = 'auto' | 'karaoke' | 'minimal' | 'cinematic';
export type PlaybackProfile = 'efficient' | 'intelligent' | 'maximum' | 'gpu-experimental';
export type PerformanceMode = 'intelligent' | 'efficient' | 'maximum';
export type AnalysisDepth = 'standard' | 'deep';
export type StorageIntent = 'knowledge' | 'balanced' | 'archive';
export type Locale = 'es-MX' | 'en-US';

/**
 * Configuración global del sistema de Pulsaria.
 * 
 * Se persiste en `localStorage` del navegador y sincroniza con
 * el backend Rust cuando cambian `folder`, `retention` o `cookiesBrowser`.
 */
export interface SystemSettings {
    /** Idioma de la interfaz; el contenido original no se traduce automáticamente. */
    locale: Locale;
    /** Formatos de archivo habilitados para descarga (ej. ['mp4', 'mp3', 'txt']) */
    formats: string[];
    /** Directorio de destino para videos procesados */
    folder: string;
    /** Tema visual de la aplicación */
    theme: AppTheme;
    /** Política de retención de archivos */
    retention: RetentionPolicy;
    /** Navegador del cual extraer cookies para fuentes restringidas (''=deshabilitado) */
    cookiesBrowser: '' | 'chrome' | 'edge' | 'firefox';
    /** Intensidad global del pipeline local (0-100). */
    processingQuality: number;
    /** Perfil derivado del deslizador de calidad. */
    processingProfile: ProcessingQuality;
    /** Preferencia de encuadre en el reproductor ampliado. */
    videoFit: VideoFit;
    /** Perfil de uso que guía la cuota y retención de medios grandes. */
    storageIntent: StorageIntent;
    /** Cuota de medios grandes elegida por el usuario, en bytes. */
    quotaBytes: number;
    /** Reserva mínima de espacio libre, en bytes. */
    reserveBytes: number;
    /** Muestra la cápsula de TikToks en la barra superior. */
    showTikTokPill: boolean;
    /** Versiona las preferencias visuales para no heredar ocultamientos de builds antiguas. */
    visualPreferencesVersion: number;
    subtitleEnabled: boolean;
    subtitleStyle: SubtitleStyle;
    playbackProfile: PlaybackProfile;
    gpuEnhancementEnabled: boolean;
    /** Governor local de recursos GPU/CPU. */
    performanceMode: PerformanceMode;
    backgroundProcessing: boolean;
    startInBackground: boolean;
    idleThresholdSeconds: number;
    acOnlyForMaximum: boolean;
    preferredAdapterId: string | null;
    analysisDepth: AnalysisDepth;
    performanceProfileVersion: number;
    lastVerifiedAccelerators: string | null;
    /** Reproduce videos locales al mantener el cursor sobre una tarjeta. */
    hoverAutoplay: boolean;
    /** Muestra la capa opt-in de material DEMO local. */
    showDemoVideos: boolean;
    /** Oculta la ventana en la bandeja al cerrarla en Tauri. */
    keepInTrayOnClose: boolean;
    /** Umbral de similitud mínima para búsqueda semántica (0.1 - 0.95). */
    minScore: number;
}

interface SettingsContextValue {
    settings: SystemSettings;
    updateSettings: (newSettings: Partial<SystemSettings>) => void;
    settingsInitialized: boolean;
    localeSelected: boolean;
}

interface NativeSettingsResponse {
    settings: {
        schemaVersion: number;
        locale: Locale;
        theme: AppTheme;
        downloadDir: string;
        formats: string[];
        retention: RetentionPolicy;
        cookiesBrowser: SystemSettings['cookiesBrowser'];
        processingQuality: number;
        processingProfile: ProcessingQuality;
        videoFit: VideoFit;
        storageIntent: StorageIntent;
        quotaBytes: number;
        reserveBytes: number;
        minScore: number;
        keepInTrayOnClose?: boolean;
        subtitleEnabled?: boolean;
        subtitleStyle?: SubtitleStyle;
        playbackProfile?: PlaybackProfile;
        gpuEnhancementEnabled?: boolean;
        performanceMode?: PerformanceMode;
        backgroundProcessing?: boolean;
        startInBackground?: boolean;
        idleThresholdSeconds?: number;
        acOnlyForMaximum?: boolean;
        preferredAdapterId?: string | null;
        analysisDepth?: AnalysisDepth;
        performanceProfileVersion?: number;
        lastVerifiedAccelerators?: string | null;
    };
    source: 'native' | 'migrated' | 'default' | string;
}

const defaultSettings: SystemSettings = {
    locale: 'es-MX',
    formats: ['mp4', 'mp3', 'txt'],
    theme: 'chromatic',
    // Rust expands USERPROFILE/HOME and creates the .pulsaria/media layout.
    folder: '%USERPROFILE%\\Downloads\\Pulsaria',
    retention: 'keep',
    cookiesBrowser: '',
    processingQuality: 78,
    processingProfile: 'high',
    videoFit: 'contain',
    storageIntent: 'knowledge',
    quotaBytes: 5 * 1024 ** 3,
    reserveBytes: 2 * 1024 ** 3,
    showTikTokPill: true,
    visualPreferencesVersion: 1,
    subtitleEnabled: true,
    subtitleStyle: 'auto',
    playbackProfile: 'intelligent',
    gpuEnhancementEnabled: false,
    performanceMode: 'intelligent',
    backgroundProcessing: true,
    startInBackground: false,
    idleThresholdSeconds: 60,
    acOnlyForMaximum: true,
    preferredAdapterId: null,
    analysisDepth: 'standard',
    performanceProfileVersion: 1,
    lastVerifiedAccelerators: null,
    hoverAutoplay: true,
    showDemoVideos: false,
    keepInTrayOnClose: true,
    minScore: 0.45,
};

function profileForQuality(quality: number): ProcessingQuality {
    return quality < 35 ? 'fast' : quality < 72 ? 'balanced' : 'high';
}

function normalizeSettings(value: unknown): SystemSettings {
    const candidate = typeof value === 'object' && value !== null
        ? value as Record<string, unknown>
        : {};
    const quality = typeof candidate.processingQuality === 'number' && Number.isFinite(candidate.processingQuality)
        ? Math.max(0, Math.min(100, Math.round(candidate.processingQuality)))
        : defaultSettings.processingQuality;
    const formats = Array.isArray(candidate.formats)
        ? [...new Set(candidate.formats.filter((format): format is string => typeof format === 'string' && format.trim().length > 0))]
        : defaultSettings.formats;
    const theme: AppTheme = ['carbon', 'chromatic', 'aurora', 'oled', 'cyberpunk', 'solar'].includes(String(candidate.theme))
        ? candidate.theme as AppTheme
        : defaultSettings.theme;
    const retention: RetentionPolicy = candidate.retention === 'online' || candidate.retention === 'keep'
        ? candidate.retention
        : defaultSettings.retention;
    const cookiesBrowser: SystemSettings['cookiesBrowser'] = candidate.cookiesBrowser === 'chrome'
        || candidate.cookiesBrowser === 'edge'
        || candidate.cookiesBrowser === 'firefox'
        ? candidate.cookiesBrowser
        : '';
    const videoFit: VideoFit = candidate.videoFit === 'contain' || candidate.videoFit === 'cover'
        ? candidate.videoFit
        : defaultSettings.videoFit;
    const storageIntent: StorageIntent = candidate.storageIntent === 'archive'
        || candidate.storageIntent === 'balanced'
        || candidate.storageIntent === 'knowledge'
        ? candidate.storageIntent
        : defaultSettings.storageIntent;
    const quotaBytes = typeof candidate.quotaBytes === 'number' && Number.isFinite(candidate.quotaBytes)
        ? Math.max(0, Math.floor(candidate.quotaBytes))
        : defaultSettings.quotaBytes;
    const reserveBytes = typeof candidate.reserveBytes === 'number' && Number.isFinite(candidate.reserveBytes)
        ? Math.max(0, Math.floor(candidate.reserveBytes))
        : defaultSettings.reserveBytes;
    const folder = typeof candidate.folder === 'string' && candidate.folder.trim().length > 0
        ? candidate.folder
        : defaultSettings.folder;
    const visualPreferencesVersion = typeof candidate.visualPreferencesVersion === 'number'
        ? Math.max(1, Math.floor(candidate.visualPreferencesVersion))
        : 0;
    // Builds anteriores podían persistir la cápsula oculta aunque todavía no
    // existiera el ajuste explícito. Beta 2 la vuelve a mostrar una vez; a
    // partir de la versión 1 se respeta el toggle del usuario.
    const showTikTokPill = visualPreferencesVersion >= 1 ? candidate.showTikTokPill !== false : true;
    const hoverAutoplay = candidate.hoverAutoplay !== false;
    const showDemoVideos = candidate.showDemoVideos === true;
    const keepInTrayOnClose = candidate.keepInTrayOnClose !== false;
    const subtitleEnabled = candidate.subtitleEnabled !== false;
    const subtitleStyle: SubtitleStyle = ['auto', 'karaoke', 'minimal', 'cinematic'].includes(String(candidate.subtitleStyle))
        ? candidate.subtitleStyle as SubtitleStyle : defaultSettings.subtitleStyle;
    const legacyPlayback = String(candidate.playbackProfile);
    const playbackProfile: PlaybackProfile = legacyPlayback === 'gpu-experimental'
        ? 'intelligent'
        : ['efficient', 'intelligent', 'maximum'].includes(legacyPlayback)
            ? legacyPlayback as PlaybackProfile
            : defaultSettings.playbackProfile;
    const gpuEnhancementEnabled = false;
    const performanceMode: PerformanceMode = ['intelligent', 'efficient', 'maximum'].includes(String(candidate.performanceMode))
        ? candidate.performanceMode as PerformanceMode
        : legacyPlayback === 'gpu-experimental'
            ? 'intelligent'
            : legacyPlayback === 'efficient' || legacyPlayback === 'maximum'
                ? legacyPlayback
                : defaultSettings.performanceMode;
    const idleThresholdSeconds = typeof candidate.idleThresholdSeconds === 'number' && Number.isFinite(candidate.idleThresholdSeconds)
        ? Math.max(15, Math.min(86_400, Math.round(candidate.idleThresholdSeconds)))
        : defaultSettings.idleThresholdSeconds;
    const analysisDepth: AnalysisDepth = candidate.analysisDepth === 'deep' ? 'deep' : 'standard';
    const preferredAdapterId = typeof candidate.preferredAdapterId === 'string' && candidate.preferredAdapterId.trim()
        ? candidate.preferredAdapterId
        : null;
    const minScore = typeof candidate.minScore === 'number' && Number.isFinite(candidate.minScore)
        ? Math.max(0.1, Math.min(0.95, candidate.minScore))
        : defaultSettings.minScore;

    return {
        locale: candidate.locale === 'en-US' ? 'en-US' : defaultSettings.locale,
        formats: formats.length > 0 ? formats : [...defaultSettings.formats],
        folder,
        theme,
        retention,
        cookiesBrowser,
        processingQuality: quality,
        processingProfile: profileForQuality(quality),
        videoFit,
        storageIntent,
        quotaBytes,
        reserveBytes,
        showTikTokPill,
        visualPreferencesVersion: 1,
        hoverAutoplay,
        showDemoVideos,
        keepInTrayOnClose,
        subtitleEnabled,
        subtitleStyle,
        playbackProfile,
        gpuEnhancementEnabled,
        performanceMode,
        backgroundProcessing: candidate.backgroundProcessing !== false,
        startInBackground: candidate.startInBackground === true,
        idleThresholdSeconds,
        acOnlyForMaximum: candidate.acOnlyForMaximum !== false,
        preferredAdapterId,
        analysisDepth,
        performanceProfileVersion: typeof candidate.performanceProfileVersion === 'number'
            ? Math.max(1, Math.floor(candidate.performanceProfileVersion))
            : defaultSettings.performanceProfileVersion,
        lastVerifiedAccelerators: typeof candidate.lastVerifiedAccelerators === 'string'
            ? candidate.lastVerifiedAccelerators
            : null,
        minScore,
    };
}

const SettingsContext = createContext<SettingsContextValue>({
    settings: defaultSettings,
    updateSettings: () => { },
    settingsInitialized: false,
    localeSelected: false,
});

/**
 * Proveedor del contexto de configuración global.
 * 
 * Carga la configuración desde `localStorage` al montar y la persiste
 * automáticamente cuando cambia. Proporciona `settings` y `updateSettings`
 * a todos los componentes hijos.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
    const [isInitialized, setIsInitialized] = useState(false);
    const [localeSelected, setLocaleSelected] = useState(false);

    // The native snapshot is authoritative in Tauri. localStorage is only a
    // browser cache and a one-time migration source for profiles created by
    // older frontend-only builds.
    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (!active) return;
            const load = async () => {
                let localCandidate: Record<string, unknown> | null = null;
                try {
                    const saved = localStorage.getItem('pulsar-settings');
                    if (saved) localCandidate = JSON.parse(saved) as Record<string, unknown>;
                } catch (error) {
                    console.error('Error loading cached settings:', error);
                }

                const runtimeWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
                const native = Boolean(runtimeWindow.__TAURI_INTERNALS__)
                    || window.location.protocol === 'tauri:'
                    || window.location.hostname === 'tauri.localhost';
                if (native) {
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        const response = await invoke<NativeSettingsResponse>('get_app_settings');
                        let next = normalizeSettings({
                            locale: response.settings.locale,
                            theme: response.settings.theme,
                            folder: response.settings.downloadDir,
                            formats: response.settings.formats,
                            retention: response.settings.retention,
                            cookiesBrowser: response.settings.cookiesBrowser,
                            processingQuality: response.settings.processingQuality,
                            processingProfile: response.settings.processingProfile,
                            videoFit: response.settings.videoFit,
                            storageIntent: response.settings.storageIntent,
                            quotaBytes: response.settings.quotaBytes,
                            reserveBytes: response.settings.reserveBytes,
                            showTikTokPill: localCandidate?.showTikTokPill,
                            visualPreferencesVersion: localCandidate?.visualPreferencesVersion,
                            subtitleEnabled: response.settings.subtitleEnabled ?? localCandidate?.subtitleEnabled,
                            subtitleStyle: response.settings.subtitleStyle ?? localCandidate?.subtitleStyle,
                            playbackProfile: response.settings.playbackProfile ?? localCandidate?.playbackProfile,
                            gpuEnhancementEnabled: response.settings.gpuEnhancementEnabled ?? localCandidate?.gpuEnhancementEnabled,
                            performanceMode: response.settings.performanceMode ?? localCandidate?.performanceMode,
                            backgroundProcessing: response.settings.backgroundProcessing ?? localCandidate?.backgroundProcessing,
                            startInBackground: response.settings.startInBackground ?? localCandidate?.startInBackground,
                            idleThresholdSeconds: response.settings.idleThresholdSeconds ?? localCandidate?.idleThresholdSeconds,
                            acOnlyForMaximum: response.settings.acOnlyForMaximum ?? localCandidate?.acOnlyForMaximum,
                            preferredAdapterId: response.settings.preferredAdapterId ?? localCandidate?.preferredAdapterId,
                            analysisDepth: response.settings.analysisDepth ?? localCandidate?.analysisDepth,
                            performanceProfileVersion: response.settings.performanceProfileVersion ?? localCandidate?.performanceProfileVersion,
                            lastVerifiedAccelerators: response.settings.lastVerifiedAccelerators ?? localCandidate?.lastVerifiedAccelerators,
                            hoverAutoplay: localCandidate?.hoverAutoplay,
                            showDemoVideos: localCandidate?.showDemoVideos,
                            keepInTrayOnClose: response.settings.keepInTrayOnClose,
                            minScore: response.settings.minScore ?? (typeof localCandidate?.minScore === 'number' ? localCandidate.minScore : undefined),
                        });
                        if (response.source === 'default' && localCandidate) {
                            next = normalizeSettings({ ...next, ...localCandidate });
                            try {
                                await invoke('save_app_settings', {
                                    settings: {
                                        ...response.settings,
                                        ...next,
                                        schemaVersion: response.settings.schemaVersion,
                                        downloadDir: next.folder,
                                        cookiesBrowser: next.cookiesBrowser,
                                        processingQuality: next.processingQuality,
                                        processingProfile: next.processingProfile,
                                        storageIntent: next.storageIntent,
                                        quotaBytes: next.quotaBytes,
                                        reserveBytes: next.reserveBytes,
                                        minScore: response.settings.minScore,
                                        source: 'native',
                                    },
                                });
                            } catch (error) {
                                console.error('Could not migrate cached settings to native storage:', error);
                            }
                        }
                        if (active) {
                            setSettings(next);
                            setLocaleSelected(Boolean(localCandidate?.locale) || response.source !== 'default');
                            localStorage.setItem('pulsar-settings', JSON.stringify(next));
                        }
                        return;
                    } catch (error) {
                        console.error('Error loading native settings:', error);
                    }
                }
                try {
                    if (localCandidate) {
                        setSettings(normalizeSettings(localCandidate));
                        setLocaleSelected(localCandidate.locale === 'es-MX' || localCandidate.locale === 'en-US');
                    }
                } finally {
                    if (active) setIsInitialized(true);
                }
            };
            void load().finally(() => {
                if (active) setIsInitialized(true);
            });
        });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', settings.theme);
        }
    }, [settings.theme]);

    const updateSettings = useCallback((newSettings: Partial<SystemSettings>) => {
        if (newSettings.locale === 'es-MX' || newSettings.locale === 'en-US') {
            setLocaleSelected(true);
        }
        setSettings(prev => {
            const updated = normalizeSettings({ ...prev, ...newSettings });
            try {
                localStorage.setItem('pulsar-settings', JSON.stringify(updated));
            } catch { /* Ignorar errores de localStorage */ }
            return updated;
        });
    }, []);

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, settingsInitialized: isInitialized, localeSelected }}>
            {children}
        </SettingsContext.Provider>
    );
}

export const useSettings = () => useContext(SettingsContext);
