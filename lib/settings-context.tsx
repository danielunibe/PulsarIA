'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// ============================================================
// SettingsContext — Sistema Global de Ajustes
// Guarda las preferencias del sistema aparte del tema visual:
// formatos habilitados y directorio de salida.
// ============================================================

export type AppTheme = 'carbon' | 'chromatic' | 'aurora' | 'oled' | 'cyberpunk';

export interface SystemSettings {
    formats: string[];
    folder: string;
    theme: AppTheme;
}

interface SettingsContextValue {
    settings: SystemSettings;
    updateSettings: (newSettings: Partial<SystemSettings>) => void;
}

const defaultSettings: SystemSettings = {
    formats: ['mp4', 'mp3', 'txt'],
    theme: 'carbon',
    folder: typeof window !== 'undefined' && navigator.platform.includes('Win')
        ? `C:\\Users\\${(navigator as any)?.userAgentData?.platform || 'User'}\\Downloads\\Pulsar`
        : '~/Downloads/Pulsar',
};

const SettingsContext = createContext<SettingsContextValue>({
    settings: defaultSettings,
    updateSettings: () => { },
});

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
    const [isInitialized, setIsInitialized] = useState(false);

    // Cargar desde localStorage al montar (solo en cliente)
    useEffect(() => {
        try {
            const saved = localStorage.getItem('pulsar-settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                setSettings({ ...defaultSettings, ...parsed });
            }
        } catch (e) {
            console.error('Error loading settings:', e);
        } finally {
            setIsInitialized(true);
        }
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
