'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useSettings, type Locale } from '@/lib/settings-context';

const translations = {
  'es-MX': {
    language: 'Idioma', spanish: 'Español', english: 'English', firstLaunch: 'Primer arranque',
    skipIntro: 'Saltar bienvenida', skipIntroHint: 'También puedes pulsar Escape para continuar',
    onboardingStageWelcome: 'Bienvenida', onboardingStageEquipment: 'Equipo', onboardingStageLanguage: 'Idioma', onboardingStagePreferences: 'Preferencias', onboardingStageStorage: 'Almacenamiento', onboardingStageModel: 'Modelo local',
    onboardingPhaseBoot: 'Primer arranque', onboardingPhasePreferences: 'Tus preferencias', onboardingPhasePreparation: 'Plan de preparación', onboardingPhaseTimeline: 'Fases de configuración',
    onboardingStep: 'Paso', onboardingStepCounter: 'Paso {current} de {total}', onboardingProgress: 'Progreso de configuración', onboardingRuntimeInitialDescription: 'Comprobamos el equipo y los recursos locales. Esta verificación no envía tus archivos a la nube.', onboardingRuntimeNeedsAttention: 'Requiere atención', onboardingRuntimeReady: 'Recursos locales listos',
    onboardingPostpone: 'Posponer', onboardingResume: 'Continuar configuración', onboardingResumeDescription: 'La biblioteca sigue disponible. Puedes retomar la preparación cuando quieras.',
    onboardingRuntimeTimeoutTitle: 'La comprobación está tardando más de lo esperado', onboardingRuntimeTimeoutDescription: 'No significa que el runtime esté dañado. Puedes volver a comprobarlo o continuar después; la biblioteca seguirá disponible.',
    onboardingRuntimeErrorTitle: 'No pudimos verificar algunos recursos', onboardingRuntimeErrorDescription: 'La interfaz sigue disponible. Revisa las comprobaciones que fallaron o pospón la preparación.', onboardingRuntimeCheckingTitle: 'Verificando tu instalación', onboardingRuntimeTimeoutStatus: 'Comprobación agotó el tiempo de espera',
    onboardingStorageChecking: 'Midiendo el almacenamiento local…', onboardingStorageTimeout: 'La comprobación de almacenamiento superó los 30 segundos. Puedes reintentar o posponer la configuración.', onboardingStorageCheckError: 'No se pudo verificar la carpeta de medios. Revisa la ruta y vuelve a comprobar.',
    onboardingChecking: 'Comprobando…', onboardingRetryCheck: 'Reintentar comprobación', onboardingContinueToVideo: 'Agregar mi primer video',    onboardingFirstVideoAccepted: 'Pulsaria aceptó el enlace. El estado y el resultado aparecerán desde la cola real.', onboardingFirstVideoProcessing: 'El primer video está en proceso. Puedes seguir usando Pulsaria mientras termina.', onboardingFirstVideoAwaitLibrary: 'El trabajo terminó; estamos verificando que el elemento ya aparezca en la biblioteca.', onboardingFirstVideoReady: 'Tu primer video terminó correctamente y ya aparece en la biblioteca.', onboardingFirstVideoFailed: 'El primer video no pudo completarse. Revisa el trabajo en Actividad para ver el error o reintentarlo.', onboardingIngestUnavailable: 'La preparación de los recursos locales sigue pendiente. Puedes retomar la guía; la biblioteca permanece disponible.',
    onboardingRuntimeResource: 'Recurso comprobado', onboardingRuntimePath: 'Ruta', onboardingRuntimeMissingAction: 'El paquete no incluye todos los archivos declarados. La comprobación muestra cuáles faltan; corrige el paquete y vuelve a comprobar.',
    onboardingRuntimeManifestAction: 'El manifiesto del runtime no coincide con los recursos instalados. Corrige el manifiesto o el mapeo del paquete y vuelve a comprobar.',
    onboardingRuntimeImportAction: 'Los archivos existen, pero Python no pudo importarlos. Revisa el error de importación y las dependencias del runtime; después vuelve a comprobar.',
    chooseLanguage: 'Elige el idioma de Pulsaria',
    chooseLanguageDescription: 'Puedes cambiarlo después desde Ajustes. Tus transcripciones permanecerán en el idioma original del video.',
    continue: 'Continuar', back: 'Atrás', settings: 'Configuración', close: 'Cerrar',
    queue: 'Cola', activity: 'Actividad', playlists: 'Playlists', search: 'Buscar', library: 'Biblioteca', local: 'Local',
    navPrimary: 'Navegación principal', navSections: 'Secciones globales', navSearch: 'Buscar en la biblioteca', navHome: 'Inicio · Kiosco',
    navProfiles: 'Perfiles de TikTok', navActivity: 'Actividad · Historial', navPlaylists: 'Playlists', navMagazines: 'Revistas · Tomos', navSettings: 'Ajustes',
    navPendingActivityCount: '{count} actividades pendientes', navCinemaOpen: 'Abrir Cinema a pantalla completa', navCinemaUnavailable: 'Cinema no disponible: agrega un video primero',
    windowMinimize: 'Minimizar', windowRestore: 'Restaurar ventana', windowMaximize: 'Maximizar ventana', windowClose: 'Cerrar',
    clearSearch: 'Limpiar búsqueda', openCinema: 'Abrir modo Cinema', noVideosCinema: 'No hay videos visibles para Cinema',
    cinemaPrev: 'Video anterior', cinemaNext: 'Video siguiente', cinemaPlay: 'Reproducir video', cinemaPause: 'Pausar video',
    cinemaMute: 'Silenciar', cinemaUnmute: 'Activar sonido', cinemaAutoAdvance: 'Avance automático', cinemaExit: 'Salir del modo Cinema',
    cinemaHint: '← → navegar · rueda o arrastre · ↑ ↓ volumen · Esc salir', cinemaNoSource: 'Ficha conservada · fuente no disponible', cinemaOnline: 'Ficha conservada · fuente online', cinemaLocal: 'Disponible localmente',
    karaokeHint: 'Karaoke · toca una palabra para saltar', karaokeLineCounter: 'línea {current} de {total}', karaokeLinesTotal: '{total} líneas', karaokeNoWordLevel: 'Este video no trae marcas por palabra: el resaltado sigue por línea completa.', karaokeEmpty: 'Este video no tiene transcripción disponible.', karaokeLoading: 'Cargando letra y marcas temporales…', karaokeTranscriptOnly: 'Modo transcript-only: la letra se puede leer, pero no hay un video local al que saltar.', karaokeSkipWord: 'Saltar a "{word}" en {time}', karaokeSkipLine: 'Saltar a la línea {line}', karaokeNoVideo: 'Sin video local',
    detailDialogLabel: 'Reproductor y detalles del video', detailTabsLabel: 'Secciones de detalles del video', detailTranscriptTab: 'Transcripción', detailSyncedTextTab: 'Texto sincronizado', detailAnalysisTab: 'Análisis', detailToolsTab: 'Herramientas', detailClose: 'Cerrar detalles del video', detailCloseHint: 'Cerrar (Escape)',
    detailFilterTranscript: 'Buscar una palabra en la transcripción…', detailClearTranscriptFilter: 'Quitar filtro de transcripción', detailCopyTranscript: 'Copiar transcripción', detailTranscriptLoading: 'Cargando transcripción…', detailTranscriptLoadError: 'No se pudo cargar la transcripción. Inténtalo de nuevo.', detailTranscriptRetry: 'Reintentar', detailTranscriptNoLocalVideo: 'La transcripción conserva sus marcas de tiempo, pero no hay un video local para reproducir o buscar.', detailTranscriptEmpty: 'Este video todavía no tiene una transcripción disponible.', detailTranscriptFilterNoResults: 'No se encontraron fragmentos para «{query}».', detailTranscriptNoMatches: 'No hay fragmentos que coincidan con el filtro.',
    detailSourceLocal: 'Disponible localmente', detailSourceOnline: 'Online · ficha conservada', detailSourceUnavailable: 'Fuente no disponible · ficha conservada', detailPlaybackSpeed: 'Velocidad: {speed}x', detailPlainTextFormat: 'Texto', detailCopySuccess: 'Copiado: {format}', detailCopySuccessDescription: '{count} caracteres listos para pegar.', detailCopyError: 'No se pudo copiar al portapapeles.',
    detailToolsIntro: 'Exporta los datos o comprueba la ficha guardada de este video.', detailJsonHeading: 'Datos del video (JSON)', detailJsonDescription: 'Consulta o copia los metadatos y la transcripción estructurada.', detailCopyJson: 'Copiar JSON', detailMarkdownCopy: 'Copiar como Markdown', detailDataCheckButton: 'Comprobar datos guardados', detailUnibHeading: 'Índice semántico UNIB', detailUnibDescription: 'Exporta, importa o descarga un índice portátil de referencias. No incluye el archivo de video.', detailExportUnib: 'Exportar .unib', detailImportUnib: 'Importar .unib', detailDownloadUnib: 'Descargar .unib', detailSelectUnib: 'Elegir archivo UNIB', detailUnibPlaceholder: 'Exporta un archivo .unib para mostrar aquí su contenido.', detailUnibExporting: 'Exportando…', detailUnibImporting: 'Importando…', detailUnibImported: 'UNIB importado. La transcripción y la búsqueda semántica se actualizaron.', detailUnibImportError: 'No se pudo leer el archivo UNIB.', detailDataCheckSuccess: 'Video encontrado en la biblioteca local', detailDataCheckSuccessDescription: 'El video #{id} aparece en la biblioteca local.', detailDataCheckMissing: 'No se encontró este video en la biblioteca local.', detailDataCheckError: 'No se pudieron comprobar los datos guardados.',
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
    onboardingPhaseBoot: 'First boot', onboardingPhasePreferences: 'Your preferences', onboardingPhasePreparation: 'Preparation plan', onboardingPhaseTimeline: 'Setup phases',
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
    navProfiles: 'TikTok profiles', navActivity: 'Activity · History', navPlaylists: 'Playlists', navMagazines: 'Magazines · Volumes', navSettings: 'Settings',
    navPendingActivityCount: '{count} pending activities', navCinemaOpen: 'Open Cinema full screen', navCinemaUnavailable: 'Cinema unavailable: add a video first',
    windowMinimize: 'Minimize', windowRestore: 'Restore window', windowMaximize: 'Maximize window', windowClose: 'Close',
    clearSearch: 'Clear search', openCinema: 'Open Cinema mode', noVideosCinema: 'No visible videos for Cinema',
    cinemaPrev: 'Previous video', cinemaNext: 'Next video', cinemaPlay: 'Play video', cinemaPause: 'Pause video',
    cinemaMute: 'Mute', cinemaUnmute: 'Unmute', cinemaAutoAdvance: 'Auto-advance', cinemaExit: 'Exit Cinema mode',
    cinemaHint: '← → navigate · wheel or drag · ↑ ↓ volume · Esc exit', cinemaNoSource: 'Kept entry · source unavailable', cinemaOnline: 'Kept entry · source online', cinemaLocal: 'Available locally',
    karaokeHint: 'Karaoke · tap a word to seek', karaokeLineCounter: 'line {current} of {total}', karaokeLinesTotal: '{total} lines', karaokeNoWordLevel: 'This video has no word-level marks: highlighting follows whole lines.', karaokeEmpty: 'This video has no available transcript.', karaokeLoading: 'Loading lyrics and time marks…', karaokeTranscriptOnly: 'Transcript-only mode: lyrics remain readable, but there is no local video to seek.', karaokeSkipWord: 'Seek to "{word}" at {time}', karaokeSkipLine: 'Seek to line {line}', karaokeNoVideo: 'No local video',
    detailDialogLabel: 'Video player and details', detailTabsLabel: 'Video detail sections', detailTranscriptTab: 'Transcript', detailSyncedTextTab: 'Synced text', detailAnalysisTab: 'Analysis', detailToolsTab: 'Tools', detailClose: 'Close video details', detailCloseHint: 'Close (Escape)',
    detailFilterTranscript: 'Find a word in the transcript…', detailClearTranscriptFilter: 'Clear transcript filter', detailCopyTranscript: 'Copy transcript', detailTranscriptLoading: 'Loading transcript…', detailTranscriptLoadError: 'The transcript could not be loaded. Try again.', detailTranscriptRetry: 'Try again', detailTranscriptNoLocalVideo: 'The transcript keeps its timestamps, but there is no local video to play or seek.', detailTranscriptEmpty: 'This video does not have a transcript yet.', detailTranscriptFilterNoResults: 'No segments found for “{query}”.', detailTranscriptNoMatches: 'No transcript segments match this filter.',
    detailSourceLocal: 'Available locally', detailSourceOnline: 'Online · details retained', detailSourceUnavailable: 'Source unavailable · details retained', detailPlaybackSpeed: 'Playback speed: {speed}x', detailPlainTextFormat: 'Plain text', detailCopySuccess: 'Copied: {format}', detailCopySuccessDescription: '{count} characters are ready to paste.', detailCopyError: 'Could not copy to the clipboard.',
    detailToolsIntro: 'Export data or check the saved details for this video.', detailJsonHeading: 'Video data (JSON)', detailJsonDescription: 'Review or copy the metadata and structured transcript.', detailCopyJson: 'Copy JSON', detailMarkdownCopy: 'Copy as Markdown', detailDataCheckButton: 'Check saved data', detailUnibHeading: 'UNIB semantic index', detailUnibDescription: 'Export, import, or download a portable reference index. It does not include the video file.', detailExportUnib: 'Export .unib', detailImportUnib: 'Import .unib', detailDownloadUnib: 'Download .unib', detailSelectUnib: 'Choose a UNIB file', detailUnibPlaceholder: 'Export a .unib file to show its contents here.', detailUnibExporting: 'Exporting…', detailUnibImporting: 'Importing…', detailUnibImported: 'UNIB imported. The transcript and semantic search were updated.', detailUnibImportError: 'The UNIB file could not be read.', detailDataCheckSuccess: 'Video found in your local library', detailDataCheckSuccessDescription: 'Video #{id} is saved in your local library.', detailDataCheckMissing: 'This video was not found in your local library.', detailDataCheckError: 'Saved video data could not be checked.',
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
