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
 * - `carbon`: Tema oscuro premium con glassmorphism (default)
 * - `chromatic`: Tema con acentos de color más vibrantes
 * - `aurora`: Tema inspirado en la aurora boreal
 * - `oled`: Tema puro negro para pantallas OLED
 * - `cyberpunk`: Tema futurista con neón
 */
export type AppTheme = 'carbon' | 'chromatic' | 'aurora' | 'oled' | 'cyberpunk';

/**
 * Política de retención de archivos de video procesados.
 * 
 * - `keep`: Conservar archivos locales (video, audio, transcripción)
 * - `online`: Eliminar archivos locales tras procesar, conservar solo la ficha
 */
export type RetentionPolicy = 'keep' | 'online';
export type ProcessingQuality = 'fast' | 'balanced' | 'high';
export type VideoFit = 'cover' | 'contain';
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
}

interface SettingsContextValue {
    settings: SystemSettings;
    updateSettings: (newSettings: Partial<SystemSettings>) => void;
    settingsInitialized: boolean;
    localeSelected: boolean;
}

const defaultSettings: SystemSettings = {
    locale: 'es-MX',
    formats: ['mp4', 'mp3', 'txt'],
    theme: 'carbon',
    // Rust expands USERPROFILE/HOME and creates the .pulsaria/media layout.
    folder: '%USERPROFILE%\\Downloads\\Pulsaria',
    retention: 'keep',
    cookiesBrowser: '',
    processingQuality: 78,
    processingProfile: 'high',
    videoFit: 'cover',
    storageIntent: 'knowledge',
    quotaBytes: 5 * 1024 ** 3,
    reserveBytes: 2 * 1024 ** 3,
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
    const theme: AppTheme = ['carbon', 'chromatic', 'aurora', 'oled', 'cyberpunk'].includes(String(candidate.theme))
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
    const videoFit: VideoFit = candidate.videoFit === 'contain' ? 'contain' : 'cover';
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

    // Cargar desde localStorage al montar (solo en cliente)
    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (!active) return;
            try {
                const saved = localStorage.getItem('pulsar-settings');
                if (saved) {
                    const parsed = JSON.parse(saved) as Record<string, unknown>;
                    setSettings(normalizeSettings(parsed));
                    setLocaleSelected(parsed.locale === 'es-MX' || parsed.locale === 'en-US');
                }
            } catch (e) {
                console.error('Error loading settings:', e);
            } finally {
                setIsInitialized(true);
            }
        });
        return () => {
            active = false;
        };
    }, []);

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
