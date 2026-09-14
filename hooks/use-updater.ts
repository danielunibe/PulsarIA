'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  check,
  type DownloadEvent,
  type Update,
} from '@tauri-apps/plugin-updater';

import { isTauriRuntime } from '@/hooks/use-processing-settings';

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'blocked-by-active-job'
  | 'error';

export type UpdateChannel = 'stable' | 'rc';

export interface UpdatePreferences {
  channel: UpdateChannel;
  automaticChecks: boolean;
  lastCheckedAt: string | null;
}

export interface UpdaterState {
  status: UpdaterStatus;
  isNative: boolean;
  version: string | null;
  currentVersion: string | null;
  notes: string | null;
  progress: number;
  error: string | null;
  channel: UpdateChannel;
  automaticChecks: boolean;
  lastCheckedAt: string | null;
}

const UPDATER_ENABLED = process.env.NEXT_PUBLIC_PULSARIA_UPDATER_ENABLED === 'true';
const UPDATE_CHANNEL: UpdateChannel = process.env.NEXT_PUBLIC_PULSARIA_UPDATE_CHANNEL === 'rc' ? 'rc' : 'stable';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LAST_CHECK_STORAGE_KEY = 'pulsaria.updater.last-checked.v1';

function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || fallback;
}

function progressFromEvent(
  event: DownloadEvent,
  downloadedBytes: number,
  contentLength: number | null,
) {
  if (event.event === 'Started') {
    return { downloadedBytes: 0, progress: 0, contentLength: event.data.contentLength ?? null };
  }
  if (event.event === 'Progress') {
    const nextDownloadedBytes = downloadedBytes + event.data.chunkLength;
    return {
      downloadedBytes: nextDownloadedBytes,
      progress: contentLength && contentLength > 0
        ? Math.min(100, Math.round((nextDownloadedBytes / contentLength) * 100))
        : 0,
      contentLength,
    };
  }
  return { downloadedBytes, progress: 100, contentLength };
}

/**
 * Signed desktop updater state.
 *
 * Detection may happen once per 24 hours when the signed release channel is
 * enabled. Installation is never automatic: the caller must still confirm
 * and the app decides when it is safe to restart.
 */
export function useUpdater(options: { hasActiveJob?: boolean } = {}): UpdaterState & {
  enabled: boolean;
  checkForUpdate: () => Promise<boolean>;
  installUpdate: () => Promise<boolean>;
} {
  const { hasActiveJob = false } = options;
  const [state, setState] = useState<UpdaterState>({
    status: 'idle',
    isNative: isTauriRuntime(),
    version: null,
    currentVersion: null,
    notes: null,
    progress: 0,
    error: null,
    channel: UPDATE_CHANNEL,
    automaticChecks: true,
    lastCheckedAt: null,
  });
  const updateRef = useRef<Update | null>(null);
  const operationRef = useRef(false);

  const markChecked = useCallback(() => {
    const timestamp = new Date().toISOString();
    setState((previous) => ({ ...previous, lastCheckedAt: timestamp }));
    try {
      const current = JSON.parse(window.localStorage.getItem(LAST_CHECK_STORAGE_KEY) || '{}') as Record<string, unknown>;
      window.localStorage.setItem(LAST_CHECK_STORAGE_KEY, JSON.stringify({
        ...current,
        [UPDATE_CHANNEL]: timestamp,
      }));
    } catch {
      // The timestamp is an optimization only. A failed preference write
      // must not affect signed update checks.
    }
  }, []);

  useEffect(() => {
    return () => {
      const update = updateRef.current;
      updateRef.current = null;
      if (update) void update.close().catch(() => {});
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (!isTauriRuntime()) {
      setState((previous) => ({
        ...previous,
        isNative: false,
        status: 'error',
        error: 'La búsqueda de actualizaciones requiere el shell nativo de Pulsaria.',
      }));
      return false;
    }
    if (operationRef.current) return false;

    operationRef.current = true;
    setState((previous) => ({
      ...previous,
      isNative: true,
      status: 'checking',
      error: null,
      progress: 0,
    }));
    try {
      const update = await check({ timeout: 15_000, allowDowngrades: false });
      markChecked();
      const previousUpdate = updateRef.current;
      updateRef.current = update;
      if (previousUpdate && previousUpdate !== update) {
        await previousUpdate.close().catch(() => {});
      }

      if (!update) {
        setState((previous) => ({
          ...previous,
          status: 'up-to-date',
          version: null,
          currentVersion: null,
          notes: null,
          progress: 0,
        }));
        return false;
      }

      setState((previous) => ({
        ...previous,
        status: 'available',
        version: update.version,
        currentVersion: update.currentVersion,
        notes: update.body?.trim() || null,
        progress: 0,
      }));
      return true;
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: 'error',
        error: errorMessage(error, 'No se pudo consultar el endpoint de actualizaciones.'),
      }));
      return false;
    } finally {
      operationRef.current = false;
    }
  }, [markChecked]);

  const installUpdate = useCallback(async () => {
    if (!isTauriRuntime()) {
      setState((previous) => ({
        ...previous,
        isNative: false,
        status: 'error',
        error: 'La instalación requiere el shell nativo de Pulsaria.',
      }));
      return false;
    }
    if (hasActiveJob) {
      setState((previous) => ({
        ...previous,
        status: 'blocked-by-active-job',
        error: 'Guarda o espera a que terminen los trabajos activos antes de instalar una actualización.',
      }));
      return false;
    }
    if (operationRef.current) return false;

    let update = updateRef.current;
    if (!update) {
      const available = await checkForUpdate();
      if (!available) return false;
      update = updateRef.current;
    }
    if (!update) return false;

    operationRef.current = true;
    let downloadedBytes = 0;
    let contentLength: number | null = null;
    setState((previous) => ({
      ...previous,
      status: 'downloading',
      error: null,
      progress: 0,
    }));

    try {
      await update.downloadAndInstall((event) => {
        const next = progressFromEvent(event, downloadedBytes, contentLength);
        downloadedBytes = next.downloadedBytes;
        contentLength = next.contentLength;
        setState((previous) => ({
          ...previous,
          status: event.event === 'Finished' ? 'installing' : 'downloading',
          progress: next.progress,
        }));
      }, {
        timeout: 120_000,
        restartAfterInstall: true,
      });
      setState((previous) => ({ ...previous, status: 'up-to-date', progress: 100 }));
      return true;
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: 'error',
        error: errorMessage(error, 'La actualización no pudo descargarse o instalarse.'),
      }));
      return false;
    } finally {
      operationRef.current = false;
    }
  }, [checkForUpdate, hasActiveJob]);

  useEffect(() => {
    if (!UPDATER_ENABLED || !isTauriRuntime()) return;
    let lastCheckedAt: string | null = null;
    try {
      const current = JSON.parse(window.localStorage.getItem(LAST_CHECK_STORAGE_KEY) || '{}') as Record<string, unknown>;
      lastCheckedAt = typeof current[UPDATE_CHANNEL] === 'string' ? current[UPDATE_CHANNEL] : null;
    } catch {
      // An unreadable optimization timestamp means a check is due.
    }
    if (lastCheckedAt) {
      setState((previous) => ({ ...previous, lastCheckedAt }));
    }
    const elapsed = lastCheckedAt ? Date.now() - Date.parse(lastCheckedAt) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(elapsed) || elapsed >= CHECK_INTERVAL_MS) {
      void checkForUpdate();
    }
  }, [checkForUpdate]);

  return {
    ...state,
    isNative: isTauriRuntime(),
    enabled: UPDATER_ENABLED,
    checkForUpdate,
    installUpdate,
  };
}
