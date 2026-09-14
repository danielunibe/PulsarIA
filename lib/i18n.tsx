'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useSettings, type Locale } from '@/lib/settings-context';

const translations = {
  'es-MX': {
    language: 'Idioma', spanish: 'Español', english: 'English', firstLaunch: 'Primer arranque',
    chooseLanguage: 'Elige el idioma de Pulsaria',
    chooseLanguageDescription: 'Puedes cambiarlo después desde Ajustes. Tus transcripciones permanecerán en el idioma original del video.',
    continue: 'Continuar', back: 'Atrás', settings: 'Configuración', close: 'Cerrar',
    queue: 'Cola', playlists: 'Playlists', search: 'Buscar', library: 'Biblioteca', local: 'Local',
    clearSearch: 'Limpiar búsqueda', openCinema: 'Abrir modo Cinema', noVideosCinema: 'No hay videos visibles para Cinema',
    sortBy: 'Ordenar por', columns: 'Columnas', onlyCompleted: 'Solo completados',
    recent: 'Más recientes', oldest: 'Más antiguos', byName: 'Por nombre', byDuration: 'Por duración',
    contentSource: 'Fuente de contenido', link: 'Enlace', file: 'Archivo', addLink: 'Añadir otro enlace',
    pasteLinks: 'Pega enlaces de TikTok: videos, perfiles, favoritos o colecciones. La cola mostrará el proceso en directo.',
    unsupportedLinks: '{count} omitido(s): el MVP admite únicamente enlaces HTTPS de TikTok.',
    urlTooLong: '{count} supera(n) el límite de 2.048 caracteres.', nonHttpsLinks: '{count} requiere(n) HTTPS.', unsupportedPlatformLinks: '{count} pertenece(n) a una plataforma no soportada.', malformedLinks: '{count} tiene(n) un formato no válido.', invalidLinks: '{count} está(n) vacío(s).',
    supportedSources: 'Fuentes compatibles: solo TikTok',
    contentRightsTitle: 'Derechos sobre el contenido',
    contentRightsDescription: 'Pulsaria sólo procesa contenido que tienes derecho, autorización o base legal suficiente para utilizar. Tú debes cumplir los términos de la plataforma y las leyes aplicables.',
    contentRightsAck: 'Confirmo que tengo derechos, autorización o base legal suficiente para procesar estos enlaces.',
    readContentPolicy: 'Leer política de contenido',
    localLlmBadge: 'IA LOCAL · SIN NUBE',
    localLlmUnavailable: 'La IA local no está preparada. Descarga el modelo desde Ajustes cuando quieras usarla.',
    localLlmDownload: 'Preparar modelo local',
    processContent: 'Procesar contenido', sendingToQueue: 'Enviando a la cola…',
    processingQueue: 'Cola de procesamiento', progress: 'Progreso', formats: 'Formatos',
    processingStages: 'Fases del procesamiento', retryableJobs: 'Trabajos que se pueden reintentar',
    pendingLink: 'Enlace pendiente', preparingLink: 'Preparando enlace', retrying: 'Reintentando…', retry: 'Reintentar',
    checking: 'Comprobando…', retryCheck: 'Reintentar comprobación', save: 'Guardar', saved: 'Guardado',
    noResults: 'No hay resultados', demoContent: 'Contenido de demostración',
    localPrivacy: 'Tus archivos permanecen en tu equipo.',
    panelControl: 'Panel de control', globalConfig: 'Configuración global', general: 'General',
    stats: 'Métricas', engine: 'Motor', ai: 'IA', storage: 'Almacenamiento', health: 'Salud',
    updater: 'Actualizaciones', saveFolder: 'Carpeta de guardado', systemStorage: 'Almacenamiento del sistema',
    libraryMetrics: 'Métricas de la biblioteca', cancel: 'Cancelar', closeSettings: 'Cerrar configuración', uiErrorTitle: 'Esta sección necesita recuperarse', uiErrorDescription: 'Pulsaria encontró un error visual. Puedes reintentar la sección o recargar la aplicación.', reloadApp: 'Recargar aplicación',
  },
  'en-US': {
    language: 'Language', spanish: 'Español', english: 'English', firstLaunch: 'First launch',
    chooseLanguage: 'Choose your Pulsaria language',
    chooseLanguageDescription: 'You can change it later from Settings. Your transcripts remain in the original language of the video.',
    continue: 'Continue', back: 'Back', settings: 'Settings', close: 'Close',
    queue: 'Queue', playlists: 'Playlists', search: 'Search', library: 'Library', local: 'Local',
    clearSearch: 'Clear search', openCinema: 'Open Cinema mode', noVideosCinema: 'No visible videos for Cinema',
    sortBy: 'Sort by', columns: 'Columns', onlyCompleted: 'Completed only',
    recent: 'Most recent', oldest: 'Oldest', byName: 'By name', byDuration: 'By duration',
    contentSource: 'Content source', link: 'Link', file: 'File', addLink: 'Add another link',
    pasteLinks: 'Paste TikTok links: videos, profiles, favorites, or collections. The queue will show live progress.',
    unsupportedLinks: '{count} skipped: the MVP accepts HTTPS TikTok links only.',
    urlTooLong: '{count} exceed the 2,048-character limit.', nonHttpsLinks: '{count} require HTTPS.', unsupportedPlatformLinks: '{count} use an unsupported platform.', malformedLinks: '{count} have an invalid format.', invalidLinks: '{count} are empty.',
    supportedSources: 'Supported sources: TikTok only',
    contentRightsTitle: 'Rights in the content',
    contentRightsDescription: 'Pulsaria only processes content that you have the right, authorization, or sufficient legal basis to use. You are responsible for following platform terms and applicable law.',
    contentRightsAck: 'I confirm that I have the rights, authorization, or sufficient legal basis to process these links.',
    readContentPolicy: 'Read content policy',
    localLlmBadge: 'LOCAL AI · NO CLOUD',
    localLlmUnavailable: 'Local AI is not ready. Download the model from Settings when you want to use it.',
    localLlmDownload: 'Prepare local model',
    processContent: 'Process content', sendingToQueue: 'Sending to queue…',
    processingQueue: 'Processing queue', progress: 'Progress', formats: 'Formats',
    processingStages: 'Processing stages', retryableJobs: 'Jobs available for retry',
    pendingLink: 'Pending link', preparingLink: 'Preparing link', retrying: 'Retrying…', retry: 'Retry',
    checking: 'Checking…', retryCheck: 'Check again', save: 'Save', saved: 'Saved',
    noResults: 'No results', demoContent: 'Demo content',
    localPrivacy: 'Your files stay on your computer.',
    panelControl: 'Control panel', globalConfig: 'Global settings', general: 'General', stats: 'Stats',
    engine: 'Engine', ai: 'AI', storage: 'Storage', health: 'Health', updater: 'Updater',
    saveFolder: 'Save folder', systemStorage: 'System storage', libraryMetrics: 'Library metrics',
    cancel: 'Cancel', closeSettings: 'Close settings', uiErrorTitle: 'This section needs recovery', uiErrorDescription: 'Pulsaria found a UI error. You can retry the section or reload the application.', reloadApp: 'Reload application',
  },
} as const;

export type TranslationKey = keyof typeof translations['es-MX'];
type TranslationParams = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(value: string, params?: TranslationParams) {
  if (!params) return value;
  return Object.entries(params).reduce(
    (result, [key, replacement]) => result.replaceAll(`{${key}}`, String(replacement)),
    value,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const locale = settings.locale;

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: (nextLocale) => updateSettings({ locale: nextLocale }),
    t: (key, params) => interpolate(translations[locale][key] ?? translations['es-MX'][key], params),
  }), [locale, updateSettings]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
