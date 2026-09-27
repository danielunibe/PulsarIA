'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ProcessingQuality, useSettings, VideoFit } from '@/lib/settings-context';
import {
  readOnboardingDraft,
  writeOnboardingDraft,
  type OnboardingDraft,
} from '@/lib/onboarding-draft';

const RUNTIME_CHECK_TIMEOUT_MS = 30_000;

export interface RuntimeResourceCheck {
  name: string;
  path: string;
  required: boolean;
  available: boolean;
  message: string;
}

export interface RuntimePreflight {
  ready: boolean;
  offline_ready?: boolean;
  resources: RuntimeResourceCheck[];
  checks: Record<string, boolean>;
  missing: string[];
  message: string;
}

export interface HardwareProfile {
  cpu_name: string;
  logical_cores: number;
  ram_bytes: number;
  gpu_name?: string | null;
  vram_bytes?: number | null;
  whisper_gpu_supported: boolean;
  recommended_quality: ProcessingQuality;
}

export interface ProcessingSettings {
  quality: number;
  profile: ProcessingQuality;
  whisper_model: 'tiny' | 'small' | 'medium';
  device: 'cpu' | 'cuda';
  compute_type: 'int8' | 'float16' | 'int8_float16';
  video_fit: VideoFit;
  configured: boolean;
}

export interface WhisperModelStatus {
  model: string;
  ready: boolean;
  status: string;
  revision?: string | null;
  path: string;
  message?: string | null;
}

export type LocalModelPhase = 'idle' | 'downloading' | 'verifying' | 'preparing' | 'validating' | 'ready' | 'error' | 'cancelled';

export type LocalModelErrorCode =
  | 'network_error' | 'timeout' | 'insufficient_space' | 'permission_denied'
  | 'invalid_path' | 'download_failed' | 'verification_failed' | 'corrupt_model'
  | 'preparation_failed' | 'validation_failed' | 'model_already_preparing'
  | 'process_crashed' | 'cancelled' | 'unknown';

export interface LocalModelError {
  code: LocalModelErrorCode;
  message: string;
  retryable: boolean;
}

export interface LocalModelSetupState {
  phase: LocalModelPhase;
  model: 'tiny' | 'small' | 'medium';
  progress: number | null;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
  etaSeconds?: number | null;
  subphase?: string | null;
  message?: string | null;
  failedPhase?: LocalModelPhase | null;
  error?: LocalModelError | null;
}

export interface SetupSaveOptions {
  downloadDir?: string;
  retention?: 'keep' | 'online';
  browser?: '' | 'chrome' | 'edge' | 'firefox';
  formats?: string[];
  minScore?: number;
  intent?: 'knowledge' | 'balanced' | 'archive';
  quotaBytes?: number;
  reserveBytes?: number;
}

export function isTauriRuntime() {
  if (typeof window === 'undefined') return false;
  const runtimeWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
  return Boolean(runtimeWindow.__TAURI_INTERNALS__)
    || window.location.protocol === 'tauri:'
    || window.location.hostname === 'tauri.localhost';
}

export function useProcessingSettings() {
  const { updateSettings } = useSettings();
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [processing, setProcessing] = useState<ProcessingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [modelStatus, setModelStatus] = useState<WhisperModelStatus | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeTimedOut, setRuntimeTimedOut] = useState(false);
  const [runtimePreflight, setRuntimePreflight] = useState<RuntimePreflight | null>(null);
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [initialDraft] = useState(readOnboardingDraft);
  const [setupPreferencesReady, setSetupPreferencesReady] = useState(Boolean(initialDraft?.preferencesSaved));
  const [setupPostponed, setSetupPostponed] = useState(Boolean(initialDraft?.postponed));
  const [modelSetupState, setModelSetupState] = useState<LocalModelSetupState | null>(null);
  const preparationRequestRef = useRef(0);
  const refreshRequestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setLoading(false);
      return;
    }
    const requestId = ++refreshRequestRef.current;
    setLoading(true);
    setInitializationError(null);
    setRuntimeTimedOut(false);
    setRuntimePreflight(null);
    setRuntimeReady(false);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const loadRuntime = async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        const [detectedHardware, persistedSettings] = await Promise.all([
          invoke<HardwareProfile>('get_hardware_profile'),
          invoke<ProcessingSettings>('get_processing_settings'),
        ]);
        const runtime = await invoke<RuntimePreflight>('get_runtime_preflight');
        if (!runtime.ready) {
          return { detectedHardware, persistedSettings, runtime, detectedModel: null, reconciledState: null };
        }
        const detectedModel = await invoke<WhisperModelStatus>('get_whisper_model_status', {
          model: persistedSettings.whisper_model,
        });
        const reconciledState = await invoke<LocalModelSetupState>('get_local_model_state', {
          model: persistedSettings.whisper_model,
        });
        return { detectedHardware, persistedSettings, runtime, detectedModel, reconciledState };
      };
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('PULSAR_RUNTIME_CHECK_TIMEOUT')), RUNTIME_CHECK_TIMEOUT_MS);
      });
      const result = await Promise.race([loadRuntime(), timeout]);
      if (requestId !== refreshRequestRef.current) return;
      setHardware(result.detectedHardware);
      setProcessing(result.persistedSettings);
      setRuntimePreflight(result.runtime);
      if (!result.runtime.ready) {
        setRuntimeReady(false);
        setInitializationError(result.runtime.message || 'La comprobación local detectó recursos que necesitan atención.');
        return;
      }
      setModelStatus(result.detectedModel);
      setModelSetupState(result.reconciledState);
      setRuntimeReady(true);
      updateSettings({
        processingQuality: result.persistedSettings.quality,
        processingProfile: result.persistedSettings.profile,
        videoFit: result.persistedSettings.video_fit,
      });
    } catch (error) {
      if (requestId !== refreshRequestRef.current) return;
      setRuntimeReady(false);
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'PULSAR_RUNTIME_CHECK_TIMEOUT') {
        setRuntimeTimedOut(true);
        setInitializationError(null);
      } else {
        setInitializationError(message || 'No se pudo inicializar el motor local.');
      }
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (requestId === refreshRequestRef.current) setLoading(false);
    }
  }, [updateSettings]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(({ listen }) => listen<LocalModelSetupState>('local-model-state', (event) => {
      setModelSetupState(event.payload);
    })).then((dispose) => { unlisten = dispose; });
    return () => { unlisten?.(); };
  }, []);

  const prepareForQuality = useCallback(async (quality: number) => {
    if (!isTauriRuntime()) return null;
    const { invoke } = await import('@tauri-apps/api/core');
    const requestId = preparationRequestRef.current + 1;
    preparationRequestRef.current = requestId;
    const normalizedQuality = Math.max(0, Math.min(100, Math.round(quality)));
    const targetModel: ProcessingSettings['whisper_model'] = normalizedQuality < 35
      ? 'tiny'
      : normalizedQuality < 72
        ? 'small'
        : hardware?.whisper_gpu_supported ? 'medium' : 'small';
    setPreparing(true);
    setPreparationError(null);
    try {
      const prepared = await invoke<WhisperModelStatus>('prepare_whisper_model', { model: targetModel });
      if (requestId !== preparationRequestRef.current) {
        throw new Error('PULSAR_PREPARATION_CANCELLED');
      }
      setModelStatus(prepared);
      return prepared;
    } catch (error) {
      if (requestId !== preparationRequestRef.current) {
        const cancelledError = new Error('PULSAR_PREPARATION_CANCELLED');
        setPreparationError('La preparación del modelo fue cancelada.');
        throw cancelledError;
      }
      const message = error instanceof Error ? error.message : String(error);
      setPreparationError(message);
      throw error;
    } finally {
      setPreparing(false);
    }
  }, [hardware?.whisper_gpu_supported]);

  const save = useCallback(async (quality: number, videoFit: VideoFit, setup?: SetupSaveOptions) => {
    if (!isTauriRuntime()) {
      const normalizedQuality = Math.max(0, Math.min(100, Math.round(quality)));
      const profile: ProcessingQuality = normalizedQuality < 35 ? 'fast' : normalizedQuality < 72 ? 'balanced' : 'high';
      updateSettings({ processingQuality: normalizedQuality, processingProfile: profile, videoFit });
      return null;
    }
    // Preparing small/medium is best effort. The native command keeps the
    // bundled tiny model as a local fallback so an unavailable download never
    // blocks saving settings or adding a video to the queue.
    const requestId = preparationRequestRef.current + 1;
    try {
      await prepareForQuality(quality);
      if (requestId !== preparationRequestRef.current) {
        setPreparationError('La preparación del modelo fue cancelada.');
        return null;
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'PULSAR_PREPARATION_CANCELLED') {
        return null;
      }
      setPreparationError(null);
    }
    if (requestId !== preparationRequestRef.current) {
      setPreparationError('La preparación del modelo fue cancelada.');
      return null;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    const normalizedQuality = Math.max(0, Math.min(100, Math.round(quality)));
    const next = setup
      ? await invoke<ProcessingSettings>('save_mvp_settings', {
        input: {
          downloadDir: setup.downloadDir || '',
          retention: setup.retention || 'keep',
          browser: setup.browser || '',
          formats: setup.formats?.length ? setup.formats : ['mp4', 'mp3', 'txt'],
          minScore: setup.minScore ?? 0.45,
          quality: normalizedQuality,
          videoFit,
          intent: setup.intent,
          quotaBytes: setup.quotaBytes,
          reserveBytes: setup.reserveBytes,
        },
      })
      : await invoke<ProcessingSettings>('set_processing_settings', { quality: normalizedQuality, videoFit });
    setProcessing(next);
    // set_processing_settings may transparently fall back from small/medium
    // to the bundled tiny model. Refresh the actual selected model status so
    // the first-run assistant can close after that fallback instead of
    // remaining stuck on a stale failed download state.
    let effectiveStatus: WhisperModelStatus | null = null;
    try {
      const nextStatus = await invoke<WhisperModelStatus>('get_whisper_model_status', {
        model: next.whisper_model,
      });
      effectiveStatus = nextStatus;
      setModelStatus(nextStatus);
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : 'No se pudo verificar el modelo local después de guardar la configuración.',
      );
    }
    if (!effectiveStatus.ready) {
      throw new Error(effectiveStatus.message || 'El modelo local todavía no está listo.');
    }
    updateSettings({
      processingQuality: next.quality,
      processingProfile: next.profile,
      videoFit: next.video_fit,
      ...(setup?.downloadDir ? { folder: setup.downloadDir } : {}),
      ...(setup?.retention ? { retention: setup.retention } : {}),
      ...(setup?.formats?.length ? { formats: setup.formats } : {}),
      ...(setup?.intent ? { storageIntent: setup.intent } : {}),
      ...(typeof setup?.quotaBytes === 'number' ? { quotaBytes: setup.quotaBytes } : {}),
      ...(typeof setup?.reserveBytes === 'number' ? { reserveBytes: setup.reserveBytes } : {}),
    });
    setPreparationError(null);
    setInitializationError(null);
    setSetupCompleted(true);
    setSetupPreferencesReady(true);
    setSetupPostponed(false);
    return next;
  }, [prepareForQuality, updateSettings]);

  const cancelPreparation = useCallback(async () => {
    if (!isTauriRuntime()) return;
    // Invalidate the save continuation before asking Rust to terminate the
    // child process. Even if taskkill reports a race with process exit, the
    // pending save will not continue into set_processing_settings.
    preparationRequestRef.current += 1;
    const { invoke } = await import('@tauri-apps/api/core');
    let cancelled = false;
    try {
      await invoke('cancel_whisper_model_preparation');
      cancelled = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPreparationError(message || 'No se pudo detener la preparación del modelo.');
    } finally {
      setPreparing(false);
      if (cancelled) setPreparationError('La preparación del modelo fue cancelada.');
    }
  }, []);

  const recoverModel = useCallback(async (mode: 'retry' | 'repair') => {
    if (!isTauriRuntime() || !processing?.whisper_model) return null;
    const { invoke } = await import('@tauri-apps/api/core');
    setPreparationError(null);
    const command = mode === 'repair' ? 'repair_local_model' : 'retry_local_model_setup';
    try {
      const result = await invoke<WhisperModelStatus>(command, { model: processing.whisper_model });
      setModelStatus(result);
      return result;
    } catch (error) {
      setPreparationError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, [processing?.whisper_model]);

  const postponeSetup = useCallback((progress: Pick<OnboardingDraft, 'answers' | 'step' | 'intentQuestion'>) => {
    const currentDraft = readOnboardingDraft();
    writeOnboardingDraft({
      schemaVersion: 1,
      answers: progress.answers,
      step: progress.step,
      intentQuestion: progress.intentQuestion,
      postponed: true,
      preferencesSaved: setupPreferencesReady || Boolean(currentDraft?.preferencesSaved),
    });
    setSetupPostponed(true);
    setSetupCompleted(false);
  }, [setupPreferencesReady]);

  const resumeSetup = useCallback(() => {
    const currentDraft = readOnboardingDraft();
    if (currentDraft?.postponed) writeOnboardingDraft({ ...currentDraft, postponed: false });
    setSetupPostponed(false);
    setSetupCompleted(false);
  }, []);

  const dismissSetup = useCallback(() => {
    const currentDraft = readOnboardingDraft();
    if (currentDraft) {
      writeOnboardingDraft({ ...currentDraft, step: 'success', postponed: false, preferencesSaved: true });
    }
    setSetupCompleted(false);
    setSetupPreferencesReady(true);
    setSetupPostponed(false);
  }, []);

  const needsSetup = isTauriRuntime() && !setupCompleted && Boolean(
    !setupPreferencesReady || (processing && (!processing.configured || !modelStatus?.ready)),
  );

  return {
    hardware,
    processing,
    modelStatus,
    modelSetupState,
    preparing,
    preparationError,
    initializationError,
    loading,
    isNative: isTauriRuntime(),
    runtimeReady,
    runtimeTimedOut,
    runtimePreflight,
    needsSetup,
    setupPostponed,
    showSetup: isTauriRuntime() && Boolean(setupCompleted || (!setupPostponed && (loading || initializationError || runtimeTimedOut || needsSetup))),
    postponeSetup,
    resumeSetup,
    dismissSetup,
    refresh,
    save,
    prepareForQuality,
    cancelPreparation,
    retryModel: () => recoverModel('retry'),
    repairModel: () => recoverModel('repair'),
  };
}
