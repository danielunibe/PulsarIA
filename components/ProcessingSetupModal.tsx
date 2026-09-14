'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  FaCheck,
  FaDownload,
  FaGaugeHigh,
  FaMemory,
  FaMicrochip,
  FaShieldHalved,
} from 'react-icons/fa6';
import type { HardwareProfile, ProcessingSettings, SetupSaveOptions, WhisperModelStatus } from '@/hooks/use-processing-settings';
import { isTauriRuntime } from '@/hooks/use-processing-settings';
import { useSettings, type ProcessingQuality } from '@/lib/settings-context';
import { useI18n } from '@/lib/i18n';
import { AuroraBackground } from '@/components/AuroraBackground';
import styles from './ProcessingSetupModal.module.css';

interface ProcessingSetupModalProps {
  hardware?: HardwareProfile | null;
  processing?: ProcessingSettings | null;
  modelStatus?: WhisperModelStatus | null;
  loading?: boolean;
  initializationError?: string | null;
  onSave: (quality: number, setup?: SetupSaveOptions) => Promise<ProcessingSettings | null>;
  onCancelPreparation: () => Promise<void>;
  onRetry?: () => Promise<void> | void;
  onDismiss?: () => void;
  preparationError?: string | null;
}

type SetupProfile = 'fast' | 'balanced' | 'high';
type SetupIntent = 'knowledge' | 'balanced' | 'archive';
type SetupStep = 'runtime' | 'welcome' | 'hardware' | 'language' | 'intent' | 'storage' | 'model' | 'success';
type IntentQuestionIndex = 0 | 1 | 2 | 3;
type PlaybackAnswer = 'yes' | 'not-needed';
type PriorityAnswer = 'knowledge' | 'videos';
type VolumeAnswer = 'occasional' | 'regular' | 'high';

interface SetupAnswers {
  offlinePlayback: PlaybackAnswer;
  priority: PriorityAnswer;
  volume: VolumeAnswer;
  intent: SetupIntent;
  mediaRoot: string;
  quotaGiB: number;
}

interface RuntimePreflight {
  ok?: boolean;
  ready?: boolean;
  message?: string | null;
  missing?: string[];
  checks?: Record<string, boolean>;
}

interface StorageStatus {
  rootPath: string;
  totalBytes: number | null;
  freeBytes: number | null;
  quotaBytes: number | null;
  usedMediaBytes: number | null;
  stagedBytes: number | null;
  reserveBytes: number | null;
  state: 'ok' | 'quota-near' | 'quota-exceeded' | 'disk-low' | 'path-error' | 'unknown';
}

interface StorageRecommendation {
  intent: SetupIntent;
  quotaBytes: number;
  reserveBytes: number;
  retention: 'keep' | 'online';
  formats: string[];
  reason: string;
}

const GIB = 1024 ** 3;
const DEFAULT_MEDIA_ROOT = '%USERPROFILE%\\Downloads\\Pulsaria';

const SETUP_STEPS: Array<{ id: Exclude<SetupStep, 'runtime' | 'success'>; label: string }> = [
  { id: 'welcome', label: 'Bienvenida' },
  { id: 'hardware', label: 'Equipo' },
  { id: 'language', label: 'Idioma' },
  { id: 'intent', label: 'Intención 1' },
  { id: 'intent', label: 'Intención 2' },
  { id: 'intent', label: 'Intención 3' },
  { id: 'storage', label: 'Almacenamiento' },
  { id: 'model', label: 'Modelo local' },
];

function formatMemory(bytes: number | null | undefined) {
  if (!bytes) return 'No disponible';
  const value = bytes / GIB;
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} GB`;
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return 'No medido';
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(bytes >= 10 * GIB ? 0 : 1)} GiB`;
  return `${Math.max(0, Math.round(bytes / 1024 / 1024))} MiB`;
}

function profileForQuality(quality: number): SetupProfile {
  return quality < 35 ? 'fast' : quality < 72 ? 'balanced' : 'high';
}

function profileLabel(profile: SetupProfile) {
  return profile === 'fast' ? 'Rápido' : profile === 'balanced' ? 'Equilibrado' : 'Alta calidad';
}

function modelForQuality(quality: number): 'tiny' | 'small' | 'medium' {
  return quality < 35 ? 'tiny' : quality < 72 ? 'small' : 'medium';
}

function modelQuality(model: 'tiny' | 'small' | 'medium') {
  return model === 'tiny' ? 25 : model === 'small' ? 58 : 82;
}

function deriveIntent(answers: Pick<SetupAnswers, 'offlinePlayback' | 'priority' | 'volume'>): SetupIntent {
  if (answers.priority === 'knowledge') return 'knowledge';
  if (answers.offlinePlayback === 'yes' || answers.volume === 'high') return 'archive';
  return 'balanced';
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizePreflight(value: unknown): RuntimePreflight | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const checksValue = raw.checks;
  const checks = checksValue && typeof checksValue === 'object'
    ? Object.fromEntries(
      Object.entries(checksValue as Record<string, unknown>)
        .filter(([, check]) => typeof check === 'boolean'),
    ) as Record<string, boolean>
    : undefined;
  return {
    ok: typeof raw.ok === 'boolean' ? raw.ok : undefined,
    ready: typeof raw.ready === 'boolean' ? raw.ready : undefined,
    message: typeof raw.message === 'string' ? raw.message : null,
    missing: stringList(raw.missing ?? raw.missing_resources),
    checks,
  };
}

function normalizeStorageStatus(value: unknown): StorageStatus | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const stateValue = String(raw.state ?? 'unknown');
  const allowedStates = new Set<StorageStatus['state']>([
    'ok',
    'quota-near',
    'quota-exceeded',
    'disk-low',
    'path-error',
    'unknown',
  ]);
  return {
    rootPath: String(raw.rootPath ?? raw.root_path ?? DEFAULT_MEDIA_ROOT),
    totalBytes: finiteNumber(raw.totalBytes ?? raw.total_bytes),
    freeBytes: finiteNumber(raw.freeBytes ?? raw.free_bytes),
    quotaBytes: finiteNumber(raw.quotaBytes ?? raw.quota_bytes),
    usedMediaBytes: finiteNumber(raw.usedMediaBytes ?? raw.used_media_bytes),
    stagedBytes: finiteNumber(raw.stagedBytes ?? raw.staged_bytes),
    reserveBytes: finiteNumber(raw.reserveBytes ?? raw.reserve_bytes),
    state: allowedStates.has(stateValue as StorageStatus['state'])
      ? stateValue as StorageStatus['state']
      : 'unknown',
  };
}

function normalizeRecommendation(value: unknown, fallback: StorageRecommendation): StorageRecommendation {
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Record<string, unknown>;
  const quotaBytes = finiteNumber(raw.quotaBytes ?? raw.quota_bytes);
  const reserveBytes = finiteNumber(raw.reserveBytes ?? raw.reserve_bytes);
  const retention = raw.retention === 'online' ? 'online' : raw.retention === 'keep' ? 'keep' : fallback.retention;
  const formats = stringList(raw.formats);
  return {
    intent: raw.intent === 'knowledge' || raw.intent === 'archive' || raw.intent === 'balanced'
      ? raw.intent
      : fallback.intent,
    quotaBytes: quotaBytes && quotaBytes > 0 ? quotaBytes : fallback.quotaBytes,
    reserveBytes: reserveBytes && reserveBytes > 0 ? reserveBytes : fallback.reserveBytes,
    retention,
    formats: formats.length > 0 ? formats : fallback.formats,
    reason: typeof raw.reason === 'string' && raw.reason.trim().length > 0 ? raw.reason : fallback.reason,
  };
}

function recommendationFor(intent: SetupIntent, freeBytes: number | null): StorageRecommendation {
  const knownFree = freeBytes !== null && freeBytes > 0;
  const reserveBytes = knownFree ? Math.max(2 * GIB, freeBytes * 0.1) : 2 * GIB;
  const safeBytes = knownFree ? Math.max(0, freeBytes - reserveBytes) : null;
  const requestedBytes = intent === 'knowledge'
    ? clampNumber((freeBytes ?? 20 * GIB) * 0.05, 1 * GIB, 10 * GIB)
    : intent === 'balanced'
      ? clampNumber((freeBytes ?? 50 * GIB) * 0.2, 10 * GIB, 50 * GIB)
      : clampNumber((freeBytes ?? 100 * GIB) * 0.4, 25 * GIB, 200 * GIB);
  const quotaBytes = safeBytes === null ? requestedBytes : Math.min(requestedBytes, safeBytes);
  const lowDisk = safeBytes !== null && safeBytes < 1 * GIB;
  return {
    intent,
    quotaBytes: Math.max(0, Math.floor(quotaBytes)),
    reserveBytes: Math.floor(reserveBytes),
    retention: intent === 'knowledge' ? 'online' : 'keep',
    formats: ['mp4', 'mp3', 'txt'],
    reason: !knownFree
      ? 'La cuota es una recomendación provisional; el motor nativo validará espacio, permisos y reserva antes de descargar.'
      : lowDisk
        ? 'El espacio seguro disponible es menor que 1 GiB. Libera espacio o cambia de unidad antes de iniciar descargas.'
        : `Se reserva ${formatBytes(reserveBytes)} para Windows y se limita el uso a medios grandes; transcripts, embeddings y ficha quedan fuera de la cuota.`,
  };
}

async function optionalInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

function commandErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || fallback;
}

function defaultAnswers(): SetupAnswers {
  return {
    offlinePlayback: 'not-needed',
    priority: 'knowledge',
    volume: 'regular',
    intent: 'knowledge',
    mediaRoot: DEFAULT_MEDIA_ROOT,
    quotaGiB: 5,
  };
}

export function ProcessingSetupModal({
  hardware,
  processing,
  modelStatus,
  loading = false,
  initializationError,
  onSave,
  onCancelPreparation,
  onRetry,
  onDismiss,
  preparationError,
}: ProcessingSetupModalProps) {
  const { settingsInitialized, localeSelected } = useSettings();
  const { locale, setLocale, t } = useI18n();
  // Whisper Tiny is the only model guaranteed to be bundled for offline
  // first-run. Hardware recommendations remain visible, but must not silently
  // opt the user into downloading or preparing Small/Medium.
  const [quality, setQuality] = useState(() => (
    processing?.configured && processing.whisper_model
      ? modelQuality(processing.whisper_model)
      : 25
  ));
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [savedProcessing, setSavedProcessing] = useState<ProcessingSettings | null>(null);
  const [step, setStep] = useState<SetupStep>('runtime');
  const [intentQuestion, setIntentQuestion] = useState<IntentQuestionIndex>(0);
  const [answers, setAnswers] = useState<SetupAnswers>(defaultAnswers);
  const [preflight, setPreflight] = useState<RuntimePreflight | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [nativeRecommendation, setNativeRecommendation] = useState<StorageRecommendation | null>(null);
  const [optionalLoading, setOptionalLoading] = useState(false);
  const [hardwareDetailsOpen, setHardwareDetailsOpen] = useState(false);
  const userAdjustedQuality = useRef(false);
  const userAdjustedQuota = useRef(false);
  const intentOverridden = useRef(false);
  const setupStarted = useRef(false);
  const reducedMotion = useReducedMotion();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusKeyRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const cancelRef = useRef(onCancelPreparation);
  const dismissRef = useRef(onDismiss);

  const hasSetupData = Boolean(hardware && processing);
  const fallbackRecommendation = useMemo(
    () => recommendationFor(answers.intent, storageStatus?.freeBytes ?? null),
    [answers.intent, storageStatus?.freeBytes],
  );
  const recommendation = nativeRecommendation ?? fallbackRecommendation;
  const quotaGiB = answers.quotaGiB;
  const availableSafeBytes = storageStatus?.freeBytes !== null && storageStatus?.freeBytes !== undefined
    ? Math.max(0, storageStatus.freeBytes - (storageStatus.reserveBytes ?? recommendation.reserveBytes))
    : null;
  const lowDisk = storageStatus?.state === 'disk-low'
    || storageStatus?.state === 'path-error'
    || (availableSafeBytes !== null && availableSafeBytes < GIB);
  const mediaRootInvalid = !answers.mediaRoot.trim() || storageStatus?.state === 'path-error';
  const quotaInvalid = lowDisk || quotaGiB < 1;
  const missingResources = preflight?.missing ?? [];
  const preflightPending = isTauriRuntime() && hasSetupData && (optionalLoading || preflight === null);
  const preflightBlocked = preflightPending
    || missingResources.length > 0
    || preflight?.ok === false
    || preflight?.ready === false;
  const profile = profileForQuality(quality);
  const displayProfile = savedProcessing?.profile ?? profile;
  const selectedProfileLabel = profileLabel(displayProfile);
  const selectedModel = savedProcessing?.whisper_model ?? (modelForQuality(quality) === 'medium' && !hardware?.whisper_gpu_supported ? 'small' : modelForQuality(quality));
  const modelLabel = `Whisper ${selectedModel}`;
  const deviceLabel = savedProcessing
    ? savedProcessing.device === 'cuda' ? 'GPU' : 'CPU'
    : hardware?.whisper_gpu_supported && profile !== 'fast' ? 'GPU' : 'CPU';
  const displayQuality = savedProcessing?.quality ?? quality;
  const qualityDescription = displayProfile === 'fast'
    ? 'Resultados ágiles para revisar muchas piezas.'
    : displayProfile === 'balanced'
      ? 'Un punto medio para el uso diario.'
      : 'Más detalle en transcripción y análisis visual.';
  const hardwareSummary = hardware?.whisper_gpu_supported
    ? 'Tu equipo puede mantener el análisis local con aceleración de GPU.'
    : 'El análisis local funcionará en CPU, con prioridad en estabilidad y privacidad.';
  const rangeBackground = `linear-gradient(90deg, #25f4ee 0%, #8a5cff ${quality}%, rgba(255,255,255,.14) ${quality}%, rgba(255,255,255,.14) 100%)`;
  const targetModel = modelForQuality(quality);
  const effectiveTargetModel = targetModel === 'medium' && !hardware?.whisper_gpu_supported ? 'small' : targetModel;
  const modelReadyForSelection = savedProcessing
    ? Boolean(modelStatus?.ready && modelStatus.model === savedProcessing.whisper_model)
    : Boolean(modelStatus?.ready && modelStatus.model === effectiveTargetModel);
  const effectiveStep: SetupStep = !hasSetupData || loading || initializationError
    ? 'runtime'
    : step === 'runtime'
      ? !localeSelected ? 'welcome' : processing?.configured ? 'model' : 'welcome'
      : step;
  const stepIndex = effectiveStep === 'intent'
    ? 3 + Math.min(intentQuestion, 2)
    : Math.max(0, SETUP_STEPS.findIndex((item) => item.id === effectiveStep));
  const suggestedIntent = deriveIntent(answers);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    cancelRef.current = onCancelPreparation;
  }, [onCancelPreparation]);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!completed) return;
    const timer = window.setTimeout(() => dismissRef.current?.(), 1500);
    return () => window.clearTimeout(timer);
  }, [completed]);

  useEffect(() => {
    if (!hardware || userAdjustedQuality.current || completed) return;
    if (processing?.configured && processing.whisper_model) {
      setQuality(modelQuality(processing.whisper_model));
    }
  }, [completed, hardware, processing?.configured, processing?.whisper_model]);

  useEffect(() => {
    if (!hasSetupData) {
      setupStarted.current = false;
      setStep('runtime');
      setIntentQuestion(0);
      return;
    }
    if (!setupStarted.current) {
      setupStarted.current = true;
      setStep(!settingsInitialized || !localeSelected ? 'welcome' : processing?.configured ? 'model' : 'welcome');
    }
  }, [hasSetupData, localeSelected, processing?.configured, settingsInitialized]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pulsaria-mvp-setup');
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<SetupAnswers>;
      setAnswers((current) => ({
        ...current,
        offlinePlayback: parsed.offlinePlayback === 'yes' || parsed.offlinePlayback === 'not-needed'
          ? parsed.offlinePlayback
          : current.offlinePlayback,
        priority: parsed.priority === 'knowledge' || parsed.priority === 'videos' ? parsed.priority : current.priority,
        volume: parsed.volume === 'occasional' || parsed.volume === 'regular' || parsed.volume === 'high'
          ? parsed.volume
          : current.volume,
        intent: parsed.intent === 'knowledge' || parsed.intent === 'balanced' || parsed.intent === 'archive'
          ? parsed.intent
          : current.intent,
        mediaRoot: typeof parsed.mediaRoot === 'string' && parsed.mediaRoot.trim() ? parsed.mediaRoot : current.mediaRoot,
        quotaGiB: typeof parsed.quotaGiB === 'number' && Number.isFinite(parsed.quotaGiB)
          ? clampNumber(parsed.quotaGiB, 1, 200)
          : current.quotaGiB,
      }));
      if (parsed.intent === 'knowledge' || parsed.intent === 'balanced' || parsed.intent === 'archive') {
        intentOverridden.current = true;
      }
      if (typeof parsed.quotaGiB === 'number') userAdjustedQuota.current = true;
    } catch {
      // A corrupt browser preference should never block the native setup.
    }
  }, []);

  useEffect(() => {
    if (!isTauriRuntime() || !hasSetupData) return;
    let active = true;
    setPreflight(null);
    setStorageStatus(null);
    setOptionalLoading(true);
    void Promise.all([
      optionalInvoke<unknown>('get_runtime_preflight'),
      optionalInvoke<unknown>('get_storage_status', { path: answers.mediaRoot }),
    ]).then(([rawPreflight, rawStorage]) => {
      if (!active) return;
      setPreflight(normalizePreflight(rawPreflight) ?? {
        ok: false,
        ready: false,
        message: 'El shell nativo no devolvió un preflight verificable. Reinstala Pulsaria para reparar el runtime.',
      });
      const nextStorage = normalizeStorageStatus(rawStorage);
      setStorageStatus(nextStorage);
      if (nextStorage?.rootPath && answers.mediaRoot === DEFAULT_MEDIA_ROOT && !userAdjustedQuota.current) {
        setAnswers((current) => ({ ...current, mediaRoot: nextStorage.rootPath }));
      }
    }).catch((error) => {
      if (!active) return;
      setPreflight({
        ok: false,
        ready: false,
        message: commandErrorMessage(error, 'No se pudieron verificar los recursos o la carpeta de medios. Comprueba permisos y reinstala el runtime si es necesario.'),
      });
      setStorageStatus(null);
    }).finally(() => {
      if (active) setOptionalLoading(false);
    });
    return () => {
      active = false;
    };
  }, [answers.mediaRoot, hasSetupData]);

  useEffect(() => {
    if (!isTauriRuntime() || !hasSetupData) return;
    let active = true;
    setNativeRecommendation(null);
    void optionalInvoke<unknown>('recommend_storage_setup', {
      intent: answers.intent,
      path: answers.mediaRoot,
    }).then((raw) => {
      if (!active || !raw) return;
      const normalized = normalizeRecommendation(raw, fallbackRecommendation);
      setNativeRecommendation(normalized);
      if (!userAdjustedQuota.current) {
        setAnswers((current) => ({ ...current, quotaGiB: Math.max(1, Math.floor(normalized.quotaBytes / GIB)) }));
      }
    }).catch(() => {
      // The storage status/preflight effect remains authoritative and blocks
      // saving when the path cannot be measured. The local recommendation is
      // only a display fallback and must not hide that error.
    });
    return () => {
      active = false;
    };
  }, [answers.intent, answers.mediaRoot, fallbackRecommendation, hasSetupData]);

  useEffect(() => {
    if (!storageStatus || userAdjustedQuota.current) return;
    if (fallbackRecommendation.quotaBytes > 0) {
      setAnswers((current) => ({ ...current, quotaGiB: Math.max(1, Math.floor(fallbackRecommendation.quotaBytes / GIB)) }));
    }
  }, [fallbackRecommendation, storageStatus]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const focusFirst = () => {
      const first = dialog.querySelector<HTMLElement>(focusableSelector);
      (first ?? dialog).focus({ preventScroll: true });
    };
    focusFirst();

    const siblings = Array.from(overlay.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map((element) => ({
        element,
        hadInert: element.hasAttribute('inert'),
        hadAriaHidden: element.getAttribute('aria-hidden'),
      }));
    for (const { element } of siblings) {
      (element as HTMLElement & { inert?: boolean }).inert = true;
      element.setAttribute('aria-hidden', 'true');
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (savingRef.current) void cancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      for (const { element, hadInert, hadAriaHidden } of siblings) {
        const typedElement = element as HTMLElement & { inert?: boolean };
        typedElement.inert = hadInert;
        if (hadAriaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', hadAriaHidden);
      }
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const focusKey = `${effectiveStep}:${effectiveStep === 'intent' ? intentQuestion : ''}`;
    if (previousFocusKeyRef.current === null) {
      previousFocusKeyRef.current = focusKey;
      return;
    }
    if (previousFocusKeyRef.current === focusKey) return;
    previousFocusKeyRef.current = focusKey;
    dialogRef.current?.querySelector<HTMLElement>('[data-setup-step-heading="true"]')?.focus({ preventScroll: true });
  }, [effectiveStep, intentQuestion]);

  const updateAnswers = (patch: Partial<SetupAnswers>) => {
    setAnswers((current) => {
      const next = { ...current, ...patch };
      return intentOverridden.current
        ? next
        : { ...next, intent: deriveIntent(next) };
    });
  };

  const persistSetupPreferences = () => {
    try {
      localStorage.setItem('pulsaria-mvp-setup', JSON.stringify({
        ...answers,
        quotaGiB,
        quotaBytes: quotaGiB * GIB,
        retention: recommendation.retention,
        formats: recommendation.formats,
        localLlm: 'on-demand-local-only',
      }));
    } catch {
      // Settings remain usable if localStorage is unavailable.
    }
  };

  const handleSave = async (qualityOverride?: number) => {
    if (!hasSetupData || preflightBlocked || lowDisk || quotaGiB < 1) return;
    const selectedQuality = qualityOverride ?? quality;
    setSaving(true);
    setLocalError(null);
    try {
      const saved = await onSave(selectedQuality, {
        downloadDir: answers.mediaRoot,
        retention: recommendation.retention,
        browser: '',
        formats: recommendation.formats,
        minScore: 0.45,
        intent: answers.intent,
        quotaBytes: quotaGiB * GIB,
        reserveBytes: recommendation.reserveBytes,
      });
      // A cancelled native preparation returns null. Keep the wizard open so
      // the user can choose another model or try again.
      if (!saved) return;
      persistSetupPreferences();
      setSavedProcessing(saved);
      setQuality(saved.quality);
      userAdjustedQuality.current = true;
      setCompleted(true);
      setStep('success');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const nextStep = () => {
    if (effectiveStep === 'welcome') {
      setStep('hardware');
    } else if (effectiveStep === 'hardware') {
      setStep('language');
      setIntentQuestion(0);
    } else if (effectiveStep === 'language') {
      setStep(processing?.configured ? 'model' : 'intent');
      setIntentQuestion(0);
    } else if (effectiveStep === 'intent') {
      if (intentQuestion < 3) {
        setIntentQuestion((current) => (current + 1) as IntentQuestionIndex);
      } else {
        setStep('storage');
      }
    }
    else if (effectiveStep === 'storage') setStep('model');
    else if (effectiveStep === 'model') void handleSave();
  };

  const previousStep = () => {
    if (effectiveStep === 'welcome') return;
    if (effectiveStep === 'hardware') {
      setStep('welcome');
      return;
    }
    if (effectiveStep === 'language') {
      setStep('hardware');
      return;
    }
    if (effectiveStep === 'intent') {
      if (intentQuestion > 0) setIntentQuestion((current) => (current - 1) as IntentQuestionIndex);
      return;
    }
    if (effectiveStep === 'storage') {
      setStep('intent');
      setIntentQuestion(3);
    }
    if (effectiveStep === 'model') setStep('storage');
  };

  const runtimeStatusLabel = preflightBlocked
    ? (preflightPending ? 'Comprobando recursos locales' : 'Requiere atención')
    : optionalLoading || loading
      ? 'Comprobando recursos locales'
      : 'Recursos locales listos';

  return (
    <div
      ref={overlayRef}
      data-processing-setup-overlay="true"
      className={`${styles.overlay} fixed inset-0 overflow-y-auto`}
      style={{
        zIndex: 1200,
        background: 'rgba(4, 6, 12, .42)',
        backdropFilter: 'blur(18px) saturate(1.18)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.18)',
      }}
    >
      <AuroraBackground contained />
      <div aria-hidden="true" className={`${styles.vignette} pointer-events-none absolute inset-0`} />

      <div className={styles.stage}>
        <motion.section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          aria-busy={loading || saving}
          aria-labelledby="processing-setup-title"
          aria-describedby="processing-setup-description"
          className={styles.dialog}
          initial={reducedMotion ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : .42, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="sr-only" aria-live="polite">
            {completed ? 'Configuración local lista.' : loading ? 'Comprobando el equipo y los recursos locales.' : ''}
          </p>

          {effectiveStep !== 'runtime' && effectiveStep !== 'success' && (
            <div className={styles.wizardHeader}>
              <div>
                <p className={styles.eyebrow}><span className={styles.eyebrowDot} />Primer arranque · Configuración guiada</p>
                <h2 id="processing-setup-title" className={styles.title}>
                  Prepara tu <span className={styles.titleAccent}>espacio local</span>
                </h2>
                <p id="processing-setup-description" className={styles.lede}>
                  Configura Pulsaria paso a paso. Puedes cambiar estas opciones después desde Ajustes.
                </p>
              </div>
              <div className={styles.stepCounter} aria-label={`Paso ${stepIndex + 1} de ${SETUP_STEPS.length}`}>
                <span>Paso</span>
                <strong>{Math.max(1, stepIndex + 1).toString().padStart(2, '0')}</strong>
                <small>/ {SETUP_STEPS.length.toString().padStart(2, '0')}</small>
              </div>
              <ol className={styles.stepRail} aria-label="Progreso de configuración">
                {SETUP_STEPS.map((item, index) => (
                  <li key={`${item.id}-${index}`} className={styles.stepItem} data-active={index <= stepIndex} data-current={index === stepIndex} aria-current={index === stepIndex ? 'step' : undefined}>
                    <span className={styles.stepDot}>{index < stepIndex ? <FaCheck size={8} /> : index + 1}</span>
                    <span>{item.label}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {preflightBlocked && effectiveStep !== 'runtime' && effectiveStep !== 'success' && (
            <div role="alert" className={styles.preflightBanner}>
              <FaTriangleExclamationFallback />
              <div>
                <strong>Faltan recursos locales</strong>
                <p>{preflight?.message || 'El asistente no guardará una configuración que pueda dejar el motor en un estado incompleto.'}</p>
                {missingResources.length > 0 && <span>{missingResources.join(' · ')}</span>}
              </div>
            </div>
          )}

          {effectiveStep === 'runtime' && (
            <div className={styles.statusState}>
              <div className={styles.statusMark} aria-hidden="true"><FaMicrochip size={20} /></div>
              <p className={styles.eyebrow}>Primer arranque · Recursos locales</p>
              <h2 id="processing-setup-title" className={styles.titleSmall}>
                {initializationError ? 'No pudimos iniciar el motor' : 'Verificando tu instalación'}
              </h2>
              <p id="processing-setup-description" className={styles.ledeSmall}>
                {initializationError
                  ? 'La interfaz está lista, pero necesitamos volver a consultar el hardware y la configuración local antes de continuar.'
                  : 'Comprobamos hardware, Python embebido, modelos locales y almacenamiento. Esta verificación no envía tus archivos a la nube.'}
              </p>
              <div className={styles.runtimeStatus} role="status">
                <span className={styles.statusPulse} />
                <span>{initializationError ? 'No disponible' : runtimeStatusLabel}</span>
              </div>
              {initializationError && <p role="alert" className={styles.errorMessage}>{initializationError}</p>}
              {preflight?.checks && (
                <div className={styles.checkList} aria-label="Comprobación de recursos">
                  {Object.entries(preflight.checks).map(([name, ok]) => (
                    <span key={name} data-ok={ok}>{ok ? <FaCheck size={9} /> : <FaTriangleExclamationFallback />}{name}</span>
                  ))}
                </div>
              )}
              {onRetry && (
                <button type="button" className={styles.saveButton} onClick={() => void onRetry()} disabled={loading}>
                  {loading ? 'Comprobando…' : 'Reintentar comprobación'}
                </button>
              )}
            </div>
          )}

          {effectiveStep !== 'runtime' && effectiveStep !== 'success' && (
            <div className={styles.layout}>
              <div className={styles.controls}>
                {effectiveStep === 'welcome' && (
                  <div className={styles.welcomeStep}>
                    <p className={styles.sectionEyebrow}>Primer arranque · Espacio local</p>
                    <h3 data-setup-step-heading="true" tabIndex={-1} className={styles.titleSmall}>Tu biblioteca empieza aquí</h3>
                    <p className={styles.ledeSmall}>Pulsaria organiza tus videos, audio y conocimiento en este equipo. Primero revisaremos su capacidad y después podrás elegir cómo quieres trabajar.</p>
                  </div>
                )}

                {effectiveStep === 'hardware' && (
                  <div className={styles.hardwareStep}>
                    <div className={styles.hardwareHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Capacidad de tu equipo</p>
                        <p className={styles.hardwareCompactSummary}>
                          {hardware?.logical_cores ?? '—'} hilos · {formatMemory(hardware?.ram_bytes)} RAM · {hardware?.whisper_gpu_supported ? 'GPU + CPU' : 'CPU local'}
                        </p>
                      </div>
                      <div className={styles.hardwareActions}>
                        <span className={styles.localBadge}><FaShieldHalved size={9} /> Local</span>
                        <button type="button" className={styles.detailsToggle} aria-expanded={hardwareDetailsOpen} onClick={() => setHardwareDetailsOpen((open) => !open)}>
                          {hardwareDetailsOpen ? 'Ocultar detalles' : 'Ver detalles'}
                        </button>
                      </div>
                    </div>
                    <h3 data-setup-step-heading="true" tabIndex={-1} className={styles.controlTitle}>Conoce el equipo que usará Pulsaria</h3>
                    <p className={styles.controlDescription}>El procesamiento principal se realiza localmente. Estas métricas solo sirven para recomendarte una configuración inicial.</p>
                    {hardwareDetailsOpen && (
                      <>
                        <div className={styles.stats}>
                          <div className={styles.stat}>
                            <div className={styles.statLabel}><FaMicrochip size={12} /><span>CPU</span></div>
                            <p className={styles.statValue} title={hardware?.cpu_name || undefined}>{hardware?.cpu_name || 'No disponible'}</p>
                            <p className={styles.statMeta}>{hardware?.logical_cores ?? '—'} hilos disponibles</p>
                          </div>
                          <div className={styles.stat}>
                            <div className={styles.statLabel}><FaMemory size={12} /><span>Memoria</span></div>
                            <p className={styles.statValue}>{formatMemory(hardware?.ram_bytes)} RAM</p>
                            <p className={styles.statMeta}>{hardware?.vram_bytes ? `${formatMemory(hardware.vram_bytes)} VRAM` : 'GPU no detectada'}</p>
                          </div>
                          <div className={styles.stat}>
                            <div className={styles.statLabel}><FaGaugeHigh size={12} /><span>Capacidad</span></div>
                            <p className={styles.statValue}>{hardware?.whisper_gpu_supported ? 'GPU + CPU' : 'CPU local'}</p>
                            <p className={styles.statMeta}>Sugerencia: {profileLabel(hardware?.recommended_quality ?? 'balanced')}</p>
                          </div>
                        </div>
                        <p className={styles.hardwareSummary}>{hardwareSummary}</p>
                        <div className={styles.privacyNote}>
                          <FaShieldHalved size={13} />
                          <p><strong>Privacidad por defecto.</strong> Whisper, transcripción, embeddings y ficha se procesan en este equipo. Gemini solo puede enviar hasta cinco fragmentos a Google cuando solicites una síntesis.</p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {effectiveStep === 'language' && (
                  <div className={styles.stepContent}>
                    <p className={styles.sectionEyebrow}>{t('firstLaunch')} · {t('language')}</p>
                    <h3 data-setup-step-heading="true" tabIndex={-1} className={styles.controlTitle}>{t('chooseLanguage')}</h3>
                    <p className={styles.controlDescription}>{t('chooseLanguageDescription')}</p>
                    <div className={styles.optionGrid} role="radiogroup" aria-label={t('language')}>
                      {([
                        ['es-MX', t('spanish'), locale === 'en-US' ? 'Interface in Spanish' : 'Interfaz en español'],
                        ['en-US', t('english'), locale === 'en-US' ? 'Interface in English' : 'Interfaz en inglés'],
                      ] as const).map(([value, label, description]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={locale === value}
                          onClick={() => { setLocale(value); setStep('intent'); setIntentQuestion(0); }}
                          className={styles.optionCard}
                          data-selected={locale === value}
                        >
                          <span className={styles.choiceMark}>{locale === value && <FaCheck size={9} />}</span>
                          <span><strong>{label}</strong><small>{description}</small></span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {effectiveStep === 'intent' && (
                  <div className={styles.stepContent}>
                    <p className={styles.sectionEyebrow}>2 · Intención</p>
                    {intentQuestion < 3 ? (
                      <>
                        <p className={styles.questionCounter} aria-live="polite">
                          Pregunta {String(intentQuestion + 1).padStart(2, '0')} / 03
                        </p>
                        <h3 data-setup-step-heading="true" tabIndex={-1} className={styles.controlTitle}>
                          {intentQuestion === 0
                            ? '¿Necesitas reproducir videos sin conexión?'
                            : intentQuestion === 1
                              ? '¿Qué te importa más?'
                              : '¿Qué volumen esperas descargar?'}
                        </h3>
                        <p className={styles.controlDescription}>
                          {intentQuestion === 0
                            ? 'Esto define cuánto espacio conviene reservar para medios locales.'
                            : intentQuestion === 1
                              ? 'Tus respuestas calculan un perfil explicable; podrás cambiarlo antes de guardar.'
                              : 'Indica el ritmo esperado para ajustar una cuota segura.'}
                        </p>

                        <div className={styles.questionList}>
                          {intentQuestion === 0 && (
                            <fieldset className={styles.questionBlock}>
                              <legend className="sr-only">¿Necesitas reproducir videos sin conexión?</legend>
                              <div className={styles.optionGrid} role="radiogroup">
                                {[
                                  ['yes', 'Sí, con frecuencia', 'Conserva una reserva de video local.'],
                                  ['not-needed', 'No es prioridad', 'Prioriza transcript, búsqueda y análisis.'],
                                ].map(([value, label, description]) => (
                                  <button key={value} type="button" role="radio" aria-checked={answers.offlinePlayback === value} aria-label={`${label}. ${description}`} onClick={() => { updateAnswers({ offlinePlayback: value as PlaybackAnswer }); setIntentQuestion(1); }} className={styles.optionCard} data-selected={answers.offlinePlayback === value}>
                                    <span className={styles.choiceMark}>{answers.offlinePlayback === value && <FaCheck size={9} />}</span>
                                    <span><strong>{label}</strong><small>{description}</small></span>
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                          )}

                          {intentQuestion === 1 && (
                            <fieldset className={styles.questionBlock}>
                              <legend className="sr-only">¿Qué te importa más?</legend>
                              <div className={styles.optionGrid} role="radiogroup">
                                {[
                                  ['knowledge', 'Conocimiento', 'Transcript, búsqueda y análisis durables.'],
                                  ['videos', 'Conservar videos', 'Medios locales disponibles sin red.'],
                                ].map(([value, label, description]) => (
                                  <button key={value} type="button" role="radio" aria-checked={answers.priority === value} aria-label={`${label}. ${description}`} onClick={() => { updateAnswers({ priority: value as PriorityAnswer }); setIntentQuestion(2); }} className={styles.optionCard} data-selected={answers.priority === value}>
                                    <span className={styles.choiceMark}>{answers.priority === value && <FaCheck size={9} />}</span>
                                    <span><strong>{label}</strong><small>{description}</small></span>
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                          )}

                          {intentQuestion === 2 && (
                            <fieldset className={styles.questionBlock}>
                              <legend className="sr-only">¿Qué volumen esperas descargar?</legend>
                              <div className={styles.optionGrid} role="radiogroup">
                                {[
                                  ['occasional', 'Ocasional', 'Pocas piezas y revisiones puntuales.'],
                                  ['regular', 'Regular', 'Uso frecuente con cuota moderada.'],
                                  ['high', 'Alto', 'Muchas piezas o biblioteca de archivo.'],
                                ].map(([value, label, description]) => (
                                  <button key={value} type="button" role="radio" aria-checked={answers.volume === value} aria-label={`${label}. ${description}`} onClick={() => { updateAnswers({ volume: value as VolumeAnswer }); setIntentQuestion(3); }} className={styles.optionCard} data-selected={answers.volume === value}>
                                    <span className={styles.choiceMark}>{answers.volume === value && <FaCheck size={9} />}</span>
                                    <span><strong>{label}</strong><small>{description}</small></span>
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className={styles.questionCounter} aria-live="polite">Perfil recomendado</p>
                        <h3 data-setup-step-heading="true" tabIndex={-1} className={styles.controlTitle}>Confirma tu perfil de uso</h3>
                        <p className={styles.controlDescription}>Puedes aceptar la sugerencia o elegir otro perfil antes de configurar el almacenamiento.</p>

                        <div className={styles.recommendationStrip}>
                          <span className={styles.recommendationKicker}>Perfil sugerido</span>
                          <strong>{suggestedIntent === 'knowledge' ? 'Knowledge' : suggestedIntent === 'balanced' ? 'Balanced' : 'Archive'}</strong>
                          <p>{suggestedIntent === 'knowledge' ? 'Conserva el conocimiento y mantiene los medios sujetos a cuota.' : suggestedIntent === 'balanced' ? 'Equilibra video local y espacio disponible.' : 'Da prioridad a la reproducción offline y a una cuota amplia.'}</p>
                        </div>

                        <div className={styles.profileGrid} role="radiogroup" aria-label="Perfil de almacenamiento">
                          {[
                            ['knowledge', 'Knowledge', 'Transcript y búsqueda', 'Solo medios grandes entran en la retención online.'],
                            ['balanced', 'Balanced', 'Equilibrio', 'Conserva video dentro de una cuota moderada.'],
                            ['archive', 'Archive', 'Offline primero', 'Cuota amplia para conservar biblioteca local.'],
                          ].map(([value, label, short, description]) => (
                            <button key={value} type="button" role="radio" aria-checked={answers.intent === value} onClick={() => { intentOverridden.current = true; updateAnswers({ intent: value as SetupIntent }); setStep('storage'); }} className={styles.profileCard} data-selected={answers.intent === value}>
                              <span className={styles.choiceMark}>{answers.intent === value && <FaCheck size={9} />}</span>
                              <strong>{label}</strong>
                              <span>{short}</span>
                              <small>{description}</small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {effectiveStep === 'storage' && (
                  <div className={styles.stepContent}>
                    <p className={styles.sectionEyebrow}>3 · Almacenamiento</p>
                    <h3 data-setup-step-heading="true" tabIndex={-1} className={styles.controlTitle}>Define una cuota segura</h3>
                    <p className={styles.controlDescription}>Solo cuenta video, audio, staging y cachés grandes. Transcript, segmentos, embeddings, metadata y capturas quedan fuera.</p>

                    <div className={styles.storagePanel}>
                      <div className={styles.storageMetricGrid}>
                        <div className={styles.storageMetric}><span>Espacio libre</span><strong>{formatBytes(storageStatus?.freeBytes)}</strong></div>
                        <div className={styles.storageMetric}><span>Reserva de seguridad</span><strong>{formatBytes(storageStatus?.reserveBytes ?? recommendation.reserveBytes)}</strong></div>
                        <div className={styles.storageMetric}><span>Uso de medios</span><strong>{formatBytes(storageStatus?.usedMediaBytes)}</strong></div>
                      </div>
                      <label className={styles.storageField} htmlFor="setup-media-root">
                        <span>Carpeta de medios</span>
                        <input id="setup-media-root" type="text" value={answers.mediaRoot} onChange={(event) => updateAnswers({ mediaRoot: event.target.value })} aria-invalid={mediaRootInvalid} aria-describedby="setup-storage-status" />
                      </label>
                      <label className={styles.storageField} htmlFor="setup-quota">
                        <span>Cuota para medios grandes (GiB)</span>
                        <div className={styles.storageInputWrap}>
                          <input id="setup-quota" type="number" min="1" max="200" step="1" value={quotaGiB} onChange={(event) => { userAdjustedQuota.current = true; updateAnswers({ quotaGiB: clampNumber(Number(event.target.value) || 1, 1, 200) }); }} aria-invalid={quotaInvalid} aria-describedby="setup-storage-status" />
                          <span>GiB</span>
                        </div>
                      </label>
                      <p id="setup-storage-status" className={styles.storageReason}>{recommendation.reason}</p>
                      {lowDisk && <p id="setup-storage-error" role="alert" className={styles.warningMessage}>No se habilitarán nuevas descargas hasta liberar espacio o elegir otra unidad. La purga nunca será automática.</p>}
                      {optionalLoading && <p role="status" className={styles.statusMessage}>Midiendo el disco con el shell nativo…</p>}
                    </div>

                    <div className={styles.retentionSummary}>
                      <span>Perfil {answers.intent}</span>
                      <strong>{recommendation.retention === 'online' ? 'Retención de conocimiento' : 'Conservar medios locales'}</strong>
                      <small>{recommendation.retention === 'online' ? 'Cualquier retiro de video/audio deberá mostrar candidatos y pedir confirmación.' : 'La cuota limita medios grandes; los datos de conocimiento no se purgan.'}</small>
                    </div>
                  </div>
                )}

                {effectiveStep === 'model' && (
                  <div className={styles.stepContent}>
                    <p className={styles.sectionEyebrow}>4 · Modelo local</p>
                    <h3 data-setup-step-heading="true" tabIndex={-1} className={styles.controlTitle}>Elige tu nivel de análisis</h3>
                    <p className={styles.controlDescription}>Whisper tiny viene incluido para arrancar offline. Small y medium son opcionales y se preparan solo cuando confirmas.</p>

                    <div className={styles.modelGrid} role="radiogroup" aria-label="Modelo local">
                      {[
                        ['tiny', 'Incluido', 'Arranque offline', 'Rápido y siempre disponible.'],
                        ['small', 'Opcional', 'Más detalle', 'Recomendado para uso diario.'],
                        ['medium', 'Opcional', 'Máximo detalle', hardware?.whisper_gpu_supported ? 'Aprovecha la GPU detectada.' : 'Requiere GPU en este MVP.'],
                      ].map(([model, badge, label, description]) => {
                        const typedModel = model as 'tiny' | 'small' | 'medium';
                        const disabled = typedModel === 'medium' && !hardware?.whisper_gpu_supported;
                        return (
                          <button key={model} type="button" role="radio" disabled={disabled || saving} aria-checked={selectedModel === typedModel} onClick={() => { if (!disabled) { userAdjustedQuality.current = true; setQuality(modelQuality(typedModel)); void handleSave(modelQuality(typedModel)); } }} className={styles.modelCard} data-selected={selectedModel === typedModel} data-disabled={disabled}>
                            <span className={styles.modelTopline}><strong>Whisper {model}</strong><small>{badge}</small></span>
                            <span>{label}</span>
                            <small>{description}</small>
                            {selectedModel === typedModel && <span className={styles.modelCheck}><FaCheck size={9} /></span>}
                          </button>
                        );
                      })}
                    </div>

                    <div className={styles.controlHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Ajuste fino</p>
                        <h3 className={styles.controlTitle}>Rapidez ↔ precisión</h3>
                      </div>
                      <div className={styles.profileValue}><span>{selectedProfileLabel}</span><small>{displayQuality}%</small></div>
                    </div>
                    <div className={styles.rangeBlock}>
                      <div className={styles.rangeShell}>
                        <div aria-hidden="true" className={styles.rangeFill} style={{ background: rangeBackground }} />
                        <input id="processing-quality" aria-label="Prioridad entre rapidez y precisión" aria-valuetext={`${selectedProfileLabel}: ${modelLabel}, ${displayQuality}%`} type="range" min="0" max="100" step="1" value={quality} disabled={saving || completed} onChange={(event) => { userAdjustedQuality.current = true; setQuality(Number(event.target.value)); }} className={`${styles.range} relative z-[1] w-full`} />
                      </div>
                      <div className={styles.rangeLabels}><span>Rapidez</span><span>Equilibrado</span><span>Precisión</span></div>
                    </div>
                    <div className={styles.profileDetail}>
                      <div><p className={styles.modelName}>{modelLabel} <span>· {deviceLabel}</span></p><p className={styles.qualityDescription}>{qualityDescription}</p></div>
                      <div className={styles.downloadNote}><FaDownload size={10} /><span>{modelReadyForSelection ? 'Modelo listo' : 'Se prepara al confirmar'}</span></div>
                    </div>

                    {(localError || preparationError) && <p role="alert" className={styles.errorMessage}>{localError || preparationError}</p>}
                    <div className={styles.confirmationSummary}>
                      <span>Listo para guardar</span>
                      <p><strong>{answers.intent}</strong> · {quotaGiB} GiB · {recommendation.retention === 'online' ? 'retención de conocimiento' : 'medios locales'} · {answers.mediaRoot}</p>
                    </div>
                  </div>
                )}

                {['welcome', 'hardware', 'storage'].includes(effectiveStep) && (
                  <div className={styles.navigation} data-first-step={effectiveStep === 'welcome'}>
                    {effectiveStep !== 'welcome' && <button type="button" onClick={previousStep} disabled={saving} className={styles.backButton}>{t('back')}</button>}
                    <button type="button" onClick={nextStep} disabled={saving || preflightBlocked || (effectiveStep === 'storage' && (lowDisk || quotaGiB < 1))} className={styles.saveButton}>
                      {effectiveStep === 'welcome' ? 'Comenzar' : t('continue')}
                    </button>
                  </div>
                )}
                {effectiveStep === 'model' && !completed && (
                  <div className={styles.navigation}>
                    <button type="button" onClick={previousStep} disabled={saving} className={styles.backButton}>{t('back')}</button>
                    <button type="button" onClick={() => void handleSave()} disabled={saving || preflightBlocked || lowDisk || quotaGiB < 1} className={styles.saveButton}>
                      {saving ? 'Preparando modelo…' : 'Guardar y preparar modelo'}
                    </button>
                  </div>
                )}
                {['language', 'intent'].includes(effectiveStep) && (
                  <div className={`${styles.navigation} ${styles.backOnlyNavigation}`}>
                    <button type="button" onClick={previousStep} disabled={saving} className={styles.backButton}>{t('back')}</button>
                  </div>
                )}
                {saving && <button type="button" onClick={() => void onCancelPreparation()} className={styles.cancelButton}>Cancelar preparación</button>}
              </div>
            </div>
          )}

          {effectiveStep === 'success' && (
            <div className={styles.successState}>
              <div className={styles.successMark}><FaCheck size={22} /></div>
              <p className={styles.eyebrow}>Configuración guardada</p>
              <h2 id="processing-setup-title" className={styles.titleSmall}>Tu motor local está listo</h2>
              <p id="processing-setup-description" className={styles.ledeSmall}>Whisper {savedProcessing?.whisper_model || selectedModel} quedó seleccionado. La cuota y la retención se conservaron como preferencias del asistente; cualquier purga deberá ser explícita y segura.</p>
              <div className={styles.successSummary}><span>{answers.intent}</span><span>{quotaGiB} GiB para medios</span><span>IA local bajo demanda</span></div>
            </div>
          )}

          {effectiveStep !== 'runtime' && <p className={styles.footnote}>Tus archivos permanecen en tu equipo. El modelo generativo local no se descarga ni se ejecuta automáticamente.</p>}
          {processing && <span className="sr-only">Configuración actual: {processing.profile}, modelo {processing.whisper_model}</span>}
        </motion.section>
      </div>
    </div>
  );
}

function FaTriangleExclamationFallback() {
  return <span aria-hidden="true" className={styles.warningIcon}>!</span>;
}
