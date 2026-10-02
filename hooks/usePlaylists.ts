'use client';

import { useCallback, useEffect, useState } from 'react';
import type { JobRecord } from '@/hooks/use-jobs';

export interface PlaylistRecord {
  id: number;
  name: string;
  description: string | null;
  cover_job_id: number | null;
  auto_generated: boolean;
  topic_keywords: string;
  color: string;
  created_at: string;
  kind?: 'manual' | 'legacy_auto' | 'smart' | string;
  sort_mode?: string;
  smart_query?: string | null;
  smart_filters_json?: string | null;
  item_count: number;
}

export interface SourceCollectionRecord {
  id: number;
  profile_source_id: number;
  channel_kind: string;
  name: string;
  username: string | null;
  display_name: string | null;
  enabled: boolean;
  status: string;
  item_count: number | null;
  last_sync_at: string | null;
}

export interface SourceContentItem {
  id: number;
  platform: string;
  platform_content_id: string;
  canonical_url: string;
  author_id: string | null;
  author_handle: string | null;
  title: string | null;
  published_at: string | null;
  discovered_at: string;
  updated_at: string;
  availability: string;
  job_id: number | null;
}

export interface PlaylistContentView extends JobRecord {
  content_id: number;
  job_id: number | null;
  availability: string;
}

/** Source groupings and manual playlists share the same projected card model. */
export type SourceContentView = PlaylistContentView;

export type PlaylistLoadState = 'loading' | 'ready' | 'error';

import { REST_API_BASE } from '@/lib/api-config';
import { apiFetch, isNativeShell, localApiErrorMessage } from '@/lib/api-client';

async function restRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${REST_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`REST ${path} failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(`Tauri invoke failed for ${command}: ${String(error)}`);
  }
}

function playlistErrorMessage(value: unknown): string {
  return localApiErrorMessage(value, 'No se pudo completar la operación de playlist.');
}

function logPlaylistFailure(operation: string, value: unknown): void {
  const message = value instanceof Error ? value.message : String(value ?? '');
  const expectedBrowserBoundary = !isNativeShell()
    && /failed to fetch|fetch failed|networkerror|network request failed|load failed|econnrefused|connection refused|\b(?:401|403)\b/i.test(message);
  const log = expectedBrowserBoundary ? console.warn : console.error;
  log(`${operation}:`, value);
}

/**
 * Hook para gestionar playlists de videos.
 * 
 * Proporciona CRUD completo de playlists: listar, crear, agregar/quitar videos,
 * eliminar, y auto-generar playlists por clustering temático.
 * 
 * Usa Tauri IPC como canal principal y REST como fallback.
 * 
 * @returns Objeto con playlists, items seleccionados, callbacks y estado de carga
 */
export function usePlaylists() {
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<PlaylistLoadState>('loading');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [playlistItems, setPlaylistItems] = useState<PlaylistContentView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sourceCollections, setSourceCollections] = useState<SourceCollectionRecord[]>([]);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const fetchPlaylists = useCallback(async () => {
    setLoading(true);
    setStatus('loading');
    try {
      let data: PlaylistRecord[];
      try {
        data = await tauriInvoke<PlaylistRecord[]>('get_playlists');
      } catch {
        data = await restRequest<PlaylistRecord[]>('/playlists');
      }
      setPlaylists(data);
      setError(null);
      setStatus('ready');
    } catch (fetchError) {
      logPlaylistFailure('fetchPlaylists failed', fetchError);
      setError(playlistErrorMessage(fetchError));
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPlaylistItems = useCallback(async (playlistId: number) => {
    try {
      let items: PlaylistContentView[];
      try {
        try {
          items = await tauriInvoke<PlaylistContentView[]>('get_playlist_content_items', { playlistId });
        } catch {
          items = await restRequest<PlaylistContentView[]>(`/playlists/${playlistId}/content`);
        }
      } catch {
        let legacyItems: JobRecord[];
        try {
          legacyItems = await tauriInvoke<JobRecord[]>('get_playlist_items', { playlistId });
        } catch {
          legacyItems = await restRequest<JobRecord[]>(`/playlists/${playlistId}/items`);
        }
        items = legacyItems.map((item) => ({
          ...item,
          content_id: item.id,
          job_id: item.id,
          availability: 'available',
        }));
      }
      setPlaylistItems(items);
    } catch (fetchItemsError) {
      logPlaylistFailure('fetchPlaylistItems failed', fetchItemsError);
      setPlaylistItems([]);
      setError(playlistErrorMessage(fetchItemsError));
    }
  }, []);

  const fetchSourceCollections = useCallback(async () => {
    setSourceLoading(true);
    try {
      let data: SourceCollectionRecord[];
      try {
        data = await tauriInvoke<SourceCollectionRecord[]>('get_source_collections');
      } catch {
        data = await restRequest<SourceCollectionRecord[]>('/source-collections');
      }
      setSourceCollections(data);
      setSourceError(null);
    } catch (fetchError) {
      logPlaylistFailure('fetchSourceCollections failed', fetchError);
      setSourceCollections([]);
      setSourceError(playlistErrorMessage(fetchError));
    } finally {
      setSourceLoading(false);
    }
  }, []);

  const createPlaylist = useCallback(
    async (name: string, description?: string, color?: string) => {
      try {
        let id: number;
        try {
          id = await tauriInvoke<number>('create_playlist', { name, description, color });
        } catch {
          const response = await restRequest<{ id: number }>('/playlists', {
            method: 'POST',
            body: JSON.stringify({ name, description, color }),
          });
          id = response.id;
        }
        await fetchPlaylists();
        setError(null);
        return id;
      } catch (createError) {
        logPlaylistFailure('createPlaylist failed', createError);
        setError(playlistErrorMessage(createError));
        return null;
      }
    },
    [fetchPlaylists],
  );

  const addToPlaylist = useCallback(
    async (playlistId: number, jobId: number) => {
      try {
        try {
          await tauriInvoke<void>('add_to_playlist', { playlistId, jobId });
        } catch {
          await restRequest<void>(`/playlists/${playlistId}/items`, {
            method: 'POST',
            body: JSON.stringify({ job_id: jobId }),
          });
        }
        if (selectedPlaylistId === playlistId) await fetchPlaylistItems(playlistId);
        await fetchPlaylists();
        setError(null);
      } catch (addError) {
        logPlaylistFailure('addToPlaylist failed', addError);
        setError(playlistErrorMessage(addError));
      }
    },
    [fetchPlaylistItems, fetchPlaylists, selectedPlaylistId],
  );

  const addContentToPlaylist = useCallback(
    async (playlistId: number, contentId: number) => {
      try {
        try {
          await tauriInvoke<void>('add_to_playlist', { playlistId, contentId });
        } catch {
          await restRequest<void>(`/playlists/${playlistId}/items`, {
            method: 'POST',
            body: JSON.stringify({ content_id: contentId }),
          });
        }
        if (selectedPlaylistId === playlistId) await fetchPlaylistItems(playlistId);
        await fetchPlaylists();
        setError(null);
      } catch (addError) {
        logPlaylistFailure('addContentToPlaylist failed', addError);
        setError(playlistErrorMessage(addError));
      }
    },
    [fetchPlaylistItems, fetchPlaylists, selectedPlaylistId],
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: number, jobId: number) => {
      try {
        try {
          await tauriInvoke<void>('remove_from_playlist', { playlistId, jobId });
        } catch {
          await restRequest<void>(`/playlists/${playlistId}/items/${jobId}`, { method: 'DELETE' });
        }
        if (selectedPlaylistId === playlistId) await fetchPlaylistItems(playlistId);
        await fetchPlaylists();
        setError(null);
      } catch (removeError) {
        logPlaylistFailure('removeFromPlaylist failed', removeError);
        setError(playlistErrorMessage(removeError));
      }
    },
    [fetchPlaylistItems, fetchPlaylists, selectedPlaylistId],
  );

  const removeContentFromPlaylist = useCallback(
    async (playlistId: number, contentId: number) => {
      try {
        try {
          await tauriInvoke<void>('remove_from_playlist', { playlistId, contentId });
        } catch {
          await restRequest<void>(`/playlists/${playlistId}/content/${contentId}`, { method: 'DELETE' });
        }
        if (selectedPlaylistId === playlistId) await fetchPlaylistItems(playlistId);
        await fetchPlaylists();
        setError(null);
      } catch (removeError) {
        logPlaylistFailure('removeContentFromPlaylist failed', removeError);
        setError(playlistErrorMessage(removeError));
      }
    },
    [fetchPlaylistItems, fetchPlaylists, selectedPlaylistId],
  );

  const deletePlaylist = useCallback(
    async (playlistId: number) => {
      try {
        try {
          await tauriInvoke<void>('delete_playlist', { playlistId });
        } catch {
          await restRequest<void>(`/playlists/${playlistId}`, { method: 'DELETE' });
        }
        await fetchPlaylists();
        setError(null);
      } catch (deleteError) {
        logPlaylistFailure('deletePlaylist failed', deleteError);
        setError(playlistErrorMessage(deleteError));
        return;
      }

      if (selectedPlaylistId === playlistId) {
        setSelectedPlaylistId(null);
        setPlaylistItems([]);
      }
    },
    [fetchPlaylists, selectedPlaylistId],
  );

  const selectPlaylist = useCallback(
    async (id: number | null) => {
      setSelectedPlaylistId(id);
      if (id === null) setPlaylistItems([]);
      else await fetchPlaylistItems(id);
    },
    [fetchPlaylistItems],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void fetchPlaylists();
      void fetchSourceCollections();
    });
    return () => {
      active = false;
    };
  }, [fetchPlaylists, fetchSourceCollections]);

  return {
    playlists,
    loading,
    selectedPlaylistId,
    playlistItems,
    error,
    status,
    ready: status === 'ready',
    fetchPlaylists,
    sourceCollections,
    sourceLoading,
    sourceError,
    fetchSourceCollections,
    createPlaylist,
    addToPlaylist,
    addContentToPlaylist,
    removeFromPlaylist,
    removeContentFromPlaylist,
    deletePlaylist,
    selectPlaylist,
  };
}
