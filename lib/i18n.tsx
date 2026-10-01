'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useSettings, type Locale } from '@/lib/settings-context';

const translations = {
  'es-MX': {
    language: 'Idioma', spanish: 'Español', english: 'English', firstLaunch: 'Primer arranque',
    skipIntro: 'Saltar bienvenida', skipIntroHint: 'También puedes pulsar Escape para continuar',
    onboardingStageWelcome: 'Bienvenida', onboardingStageEquipment: 'Equipo', onboardingStageLanguage: 'Idioma', onboardingStagePreferences: 'Preferencias', onboardingStageStorage: 'Almacenamiento', onboardingStageModel: 'Modelo local',
    onboardingStep: 'Paso', onboardingStepCounter: 'Paso {current} de {total}', onboardingProgress: 'Progreso de configuración', onboardingRuntimeInitialDescription: 'Comprobamos el equipo y los recursos locales. Esta verificación no envía tus archivos a la nube.', onboardingRuntimeNeedsAttention: 'Requiere atención', onboardingRuntimeReady: 'Recursos locales listos',
    onboardingPostpone: 'Posponer', onboardingResume: 'Continuar configuración', onboardingResumeDescription: 'La biblioteca sigue disponible. Puedes retomar la preparación cuando quieras.',
    onboardingRuntimeTimeoutTitle: 'La comprobación está tardando más de lo esperado', onboardingRuntimeTimeoutDescription: 'No significa que el runtime esté dañado. Puedes volver a comprobarlo o continuar después; la biblioteca seguirá disponible.',
    onboardingRuntimeErrorTitle: 'No pudimos verificar algunos recursos', onboardingRuntimeErrorDescription: 'La interfaz sigue disponible. Revisa las comprobaciones que fallaron o pospón la preparación.', onboardingRuntimeCheckingTitle: 'Verificando tu instalación', onboardingRuntimeTimeoutStatus: 'Comprobación agotó el tiempo de espera',
    onboardingStorageChecking: 'Midiendo el almacenamiento local…', onboardingStorageTimeout: 'La comprobación de almacenamiento superó los 30 segundos. Puedes reintentar o posponer la configuración.', onboardingStorageCheckError: 'No se pudo verificar la carpeta de medios. Revisa la ruta y vuelve a comprobar.',
    onboardingChecking: 'Comprobando…', onboardingRetryCheck: 'Reintentar comprobación', onboardingContinueToVideo: 'Agregar mi primer video',
    onboardingFirstVideoAccepted: 'Pulsaria aceptó el enlace. El estado y el resultado aparecerán desde la cola real.', onboardingFirstVideoProcessing: 'El primer video está en proceso. Puedes seguir usando Pulsaria mientras termina.', onboardingFirstVideoAwaitLibrary: 'El trabajo terminó; estamos verificando que el elemento ya aparezca en la biblioteca.', onboardingFirstVideoReady: 'Tu primer video terminó correctamente y ya aparece en la biblioteca.', onboardingFirstVideoFailed: 'El primer video no pudo completarse. Revisa el trabajo en Actividad para ver el error o reintentarlo.', onboardingIngestUnavailable: 'La preparación de los recursos locales sigue pendiente. Puedes retomar la guía; la biblioteca permanece disponible.',
    onboardingRuntimeResource: 'Recurso comprobado', onboardingRuntimePath: 'Ruta', onboardingRuntimeMissingAction: 'El paquete no incluye todos los archivos declarados. La comprobación muestra cuáles faltan; corrige el paquete y vuelve a comprobar.',
    onboardingRuntimeManifestAction: 'El manifiesto del runtime no coincide con los recursos instalados. Corrige el manifiesto o el mapeo del paquete y vuelve a comprobar.',
    onboardingRuntimeImportAction: 'Los archivos existen, pero Python no pudo importarlos. Revisa el error de importación y las dependencias del runtime; después vuelve a comprobar.',
    chooseLanguage: 'Elige el idioma de Pulsaria',
    chooseLanguageDescription: 'Puedes cambiarlo después desde Ajustes. Tus transcripciones permanecerán en el idioma original del video.',
    continue: 'Continuar', back: 'Atrás', settings: 'Configuración', close: 'Cerrar',
    queue: 'Cola', activity: 'Actividad', playlists: 'Playlists', search: 'Buscar', library: 'Biblioteca', local: 'Local',
    navPrimary: 'Navegación principal', navSections: 'Secciones globales', navSearch: 'Buscar en la biblioteca', navHome: 'Inicio · Kiosco',
    navProfiles: 'Perfiles de TikTok', navActivity: 'Actividad · Historial', navPlaylists: 'Playlists', navSettings: 'Ajustes',
    navPendingActivityCount: '{count} actividades pendientes', navCinemaOpen: 'Abrir Cinema a pantalla completa', navCinemaUnavailable: 'Cinema no disponible: agrega un video primero',
    windowMinimize: 'Minimizar', windowRestore: 'Restaurar ventana', windowMaximize: 'Maximizar ventana', windowClose: 'Cerrar',
    clearSearch: 'Limpiar búsqueda', openCinema: 'Abrir modo Cinema', noVideosCinema: 'No hay videos visibles para Cinema',
    cinemaPrev: 'Video anterior', cinemaNext: 'Video siguiente', cinemaPlay: 'Reproducir video', cinemaPause: 'Pausar video',
    cinemaMute: 'Silenciar', cinemaUnmute: 'Activar sonido', cinemaAutoAdvance: 'Avance automático', cinemaExit: 'Salir del modo Cinema',
    cinemaHint: '← → navegar · rueda o arrastre · ↑ ↓ volumen · Esc salir', cinemaNoSource: 'Ficha conservada · fuente no disponible', cinemaOnline: 'Ficha conservada · fuente online', cinemaLocal: 'Disponible localmente',
    sortBy: 'Ordenar por', columns: 'Columnas', onlyCompleted: 'Solo completados',
    recent: 'Más recientes', oldest: 'Más antiguos', byName: 'Por nombre', byDuration: 'Por duración',
    contentSource: 'Fuente de contenido', link: 'Enlace', file: 'Archivo', addLink: 'Añadir otro enlace',
    linkAccepted: 'Recibido por Pulsaria',
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
    noResults: 'No hay resultados', searchConnectionError: 'No se pudo conectar con la biblioteca local. Comprueba que Pulsaria siga ejecutándose e inténtalo de nuevo.', demoContent: 'Contenido de demostración',
    libraryEmptyTitle: 'Tu biblioteca todavía no tiene videos', libraryEmptyDescription: 'Agrega contenido desde las pestañas Enlace o Archivo para empezar.',
    libraryWaitingTitle: 'Tus videos todavía no aparecen en la biblioteca', libraryWaitingDescription: 'Revisa Actividad para conocer el estado de cada trabajo y reintentar si algo falló.',
    libraryFilteredTitle: 'No hay videos visibles con la selección actual', libraryFilteredDescription: 'Revisa Filtros o Actividad para ver qué trabajos siguen en curso.',
    demoLibraryNotice: 'Las tarjetas con la etiqueta DEMO son ejemplos temporales: no se guardan en tu biblioteca ni cuentan como videos descargados.',
    localPrivacy: 'Tus archivos permanecen en tu equipo.',
    panelControl: 'Panel de control', globalConfig: 'Configuración global', general: 'General',
    stats: 'Métricas', engine: 'Motor', ai: 'IA', storage: 'Almacenamiento', health: 'Salud',
    updater: 'Actualizaciones', saveFolder: 'Carpeta de guardado', systemStorage: 'Almacenamiento del sistema',
    libraryMetrics: 'Métricas de la biblioteca', cancel: 'Cancelar', closeSettings: 'Cerrar configuración', uiErrorTitle: 'Esta sección necesita recuperarse', uiErrorDescription: 'Pulsaria encontró un error visual. Puedes reintentar la sección o recargar la aplicación.', reloadApp: 'Recargar aplicación',
  },
  'en-US': {
    language: 'Language', spanish: 'Español', english: 'English', firstLaunch: 'First launch',
    skipIntro: 'Skip welcome', skipIntroHint: 'You can also press Escape to continue',
    onboardingStageWelcome: 'Welcome', onboardingStageEquipment: 'Device', onboardingStageLanguage: 'Language', onboardingStagePreferences: 'Preferences', onboardingStageStorage: 'Storage', onboardingStageModel: 'Local model',
    onboardingStep: 'Step', onboardingStepCounter: 'Step {current} of {total}', onboardingProgress: 'Setup progress', onboardingRuntimeInitialDescription: 'We check your device and local resources. This check does not send your files to the cloud.', onboardingRuntimeNeedsAttention: 'Needs attention', onboardingRuntimeReady: 'Local resources ready',
    onboardingPostpone: 'Do this later', onboardingResume: 'Continue setup', onboardingResumeDescription: 'Your library remains available. You can resume setup whenever you are ready.',
    onboardingRuntimeTimeoutTitle: 'The check is taking longer than expected', onboardingRuntimeTimeoutDescription: 'This does not mean the runtime is broken. You can check again or continue later; your library will remain available.',
    onboardingRuntimeErrorTitle: 'We could not verify some resources', onboardingRuntimeErrorDescription: 'The interface is still available. Review failed checks or postpone setup.', onboardingRuntimeCheckingTitle: 'Checking your installation', onboardingRuntimeTimeoutStatus: 'Check timed out',
    onboardingStorageChecking: 'Measuring local storage…', onboardingStorageTimeout: 'The storage check exceeded 30 seconds. You can retry or postpone setup.', onboardingStorageCheckError: 'The media folder could not be verified. Check the path and try again.',
    onboardingChecking: 'Checking…', onboardingRetryCheck: 'Check again', onboardingContinueToVideo: 'Add my first video',
    onboardingFirstVideoAccepted: 'Pulsaria accepted the link. Its status and result will come from the real queue.', onboardingFirstVideoProcessing: 'Your first video is processing. You can keep using Pulsaria while it finishes.', onboardingFirstVideoAwaitLibrary: 'The job finished; we are verifying that the item now appears in your library.', onboardingFirstVideoReady: 'Your first video completed successfully and is now in the library.', onboardingFirstVideoFailed: 'Your first video could not be completed. Open Activity to see the error or retry the job.', onboardingIngestUnavailable: 'Local resource setup is still pending. You can resume the guide; your library remains available.',
    onboardingRuntimeResource: 'Checked resource', onboardingRuntimePath: 'Path', onboardingRuntimeMissingAction: 'The package does not include every declared file. The check lists what is missing; correct the package and check again.',
    onboardingRuntimeManifestAction: 'The runtime manifest does not match the installed resources. Correct the manifest or package mapping and check again.',
    onboardingRuntimeImportAction: 'The files exist, but Python could not import them. Review the import error and runtime dependencies, then check again.',
    chooseLanguage: 'Choose your Pulsaria language',
    chooseLanguageDescription: 'You can change it later from Settings. Your transcripts remain in the original language of the video.',
    continue: 'Continue', back: 'Back', settings: 'Settings', close: 'Close',
    queue: 'Queue', activity: 'Activity', playlists: 'Playlists', search: 'Search', library: 'Library', local: 'Local',
    navPrimary: 'Main navigation', navSections: 'Global sections', navSearch: 'Search the library', navHome: 'Home · Kiosk',
    navProfiles: 'TikTok profiles', navActivity: 'Activity · History', navPlaylists: 'Playlists', navSettings: 'Settings',
    navPendingActivityCount: '{count} pending activities', navCinemaOpen: 'Open Cinema full screen', navCinemaUnavailable: 'Cinema unavailable: add a video first',
    windowMinimize: 'Minimize', windowRestore: 'Restore window', windowMaximize: 'Maximize window', windowClose: 'Close',
    clearSearch: 'Clear search', openCinema: 'Open Cinema mode', noVideosCinema: 'No visible videos for Cinema',
    cinemaPrev: 'Previous video', cinemaNext: 'Next video', cinemaPlay: 'Play video', cinemaPause: 'Pause video',
    cinemaMute: 'Mute', cinemaUnmute: 'Unmute', cinemaAutoAdvance: 'Auto-advance', cinemaExit: 'Exit Cinema mode',
    cinemaHint: '← → navigate · wheel or drag · ↑ ↓ volume · Esc exit', cinemaNoSource: 'Kept entry · source unavailable', cinemaOnline: 'Kept entry · source online', cinemaLocal: 'Available locally',
    sortBy: 'Sort by', columns: 'Columns', onlyCompleted: 'Completed only',
    recent: 'Most recent', oldest: 'Oldest', byName: 'By name', byDuration: 'By duration',
    contentSource: 'Content source', link: 'Link', file: 'File', addLink: 'Add another link',
    linkAccepted: 'Accepted by Pulsaria',
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
    noResults: 'No results', searchConnectionError: 'Could not connect to the local library. Make sure Pulsaria is still running and try again.', demoContent: 'Demo content',
    libraryEmptyTitle: 'There are no videos in your library yet', libraryEmptyDescription: 'Add content from the Link or File tabs to get started.',
    libraryWaitingTitle: 'Your videos are not in the library yet', libraryWaitingDescription: 'Check Activity for each job status and retry if something failed.',
    libraryFilteredTitle: 'No videos are visible with the current selection', libraryFilteredDescription: 'Check Filters or Activity to see which jobs are still running.',
    demoLibraryNotice: 'Cards labeled DEMO are temporary examples. They are not saved to your library or counted as downloaded videos.',
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
