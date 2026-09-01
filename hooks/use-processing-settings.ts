'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProcessingQuality, useSettings, VideoFit } from '@/lib/settings-context';

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

function isTauriRuntime() {
  return typeof window !== 'undefined'
    && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function useProcessingSettings() {
  const { updateSettings } = useSettings();
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [processing, setProcessing] = useState<ProcessingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setLoading(false);
      return;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const [detectedHardware, persistedSettings] = await Promise.all([
        invoke<HardwareProfile>('get_hardware_profile'),
        invoke<ProcessingSettings>('get_processing_settings'),
      ]);
      setHardware(detectedHardware);
      setProcessing(persistedSettings);
      updateSettings({
        processingQuality: persistedSettings.quality,
        processingProfile: persistedSettings.profile,
        videoFit: persistedSettings.video_fit,
      });
    } catch {
      // La vista web no tiene hardware ni configuración nativa.
    } finally {
      setLoading(false);
    }
  }, [updateSettings]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const save = useCallback(async (quality: number, videoFit: VideoFit) => {
    if (!isTauriRuntime()) {
      const normalizedQuality = Math.max(0, Math.min(100, Math.round(quality)));
      const profile: ProcessingQuality = normalizedQuality < 35 ? 'fast' : normalizedQuality < 72 ? 'balanced' : 'high';
      updateSettings({ processingQuality: normalizedQuality, processingProfile: profile, videoFit });
      return null;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    const next = await invoke<ProcessingSettings>('set_processing_settings', {
      quality: Math.max(0, Math.min(100, Math.round(quality))),
      videoFit,
    });
    setProcessing(next);
    updateSettings({
      processingQuality: next.quality,
      processingProfile: next.profile,
      videoFit: next.video_fit,
    });
    return next;
  }, [updateSettings]);

  return {
    hardware,
    processing,
    loading,
    isNative: isTauriRuntime(),
    needsSetup: isTauriRuntime() && Boolean(processing && !processing.configured),
    refresh,
    save,
  };
}
