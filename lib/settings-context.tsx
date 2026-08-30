'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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

/**
 * Configuración global del sistema de Pulsar Eventide.
 * 
 * Se persiste en `localStorage` del navegador y sincroniza con
 * el backend Rust cuando cambian `folder`, `retention` o `cookiesBrowser`.
 */
export interface SystemSettings {
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
}

interface SettingsContextValue {
    settings: SystemSettings;
    updateSettings: (newSettings: Partial<SystemSettings>) => void;
}

const defaultSettings: SystemSettings = {
    formats: ['mp4', 'mp3', 'txt'],
    theme: 'carbon',
    // Bug #23 FIX: Use reliable fallback; Tauri backend resolves the real default via USERPROFILE/HOME
    folder: '~/Downloads/Pulsar',
    retention: 'keep',
    cookiesBrowser: '',
};

const SettingsContext = createContext<SettingsContextValue>({
    settings: defaultSettings,
    updateSettings: () => { },
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

    // Cargar desde localStorage al montar (solo en cliente)
    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (!active) return;
            try {
                const saved = localStorage.getItem('pulsar-settings');
                if (saved) {
                    const parsed = JSON.parse(saved) as Partial<SystemSettings>;
                    setSettings({ ...defaultSettings, ...parsed });
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

    const updateSettings = (newSettings: Partial<SystemSettings>) => {
        setSettings(prev => {
            const updated = { ...prev, ...newSettings };
            try {
                localStorage.setItem('pulsar-settings', JSON.stringify(updated));
            } catch { /* Ignorar errores de localStorage */ }
            return updated;
        });
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings }}>
            {children}
        </SettingsContext.Provider>
    );
}

export const useSettings = () => useContext(SettingsContext);
