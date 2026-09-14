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
  item_count: number;
}

import { REST_API_BASE } from '@/lib/api-config';
import { apiFetch } from '@/lib/api-client';

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
  const [loading, setLoading] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [playlistItems, setPlaylistItems] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const errorMessage = (value: unknown) => value instanceof Error ? value.message : String(value);

  const fetchPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      let data: PlaylistRecord[];
      try {
        data = await tauriInvoke<PlaylistRecord[]>('get_playlists');
      } catch {
        data = await restRequest<PlaylistRecord[]>('/playlists');
      }
      setPlaylists(data);
      setError(null);
    } catch (fetchError) {
      console.error('fetchPlaylists failed:', fetchError);
      setError(errorMessage(fetchError));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPlaylistItems = useCallback(async (playlistId: number) => {
    try {
      let items: JobRecord[];
      try {
        items = await tauriInvoke<JobRecord[]>('get_playlist_items', { playlistId });
      } catch {
        items = await restRequest<JobRecord[]>(`/playlists/${playlistId}/items`);
      }
      setPlaylistItems(items);
    } catch (fetchItemsError) {
      console.error('fetchPlaylistItems failed:', fetchItemsError);
      setPlaylistItems([]);
      setError(errorMessage(fetchItemsError));
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
        console.error('createPlaylist failed:', createError);
        setError(errorMessage(createError));
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
        console.error('addToPlaylist failed:', addError);
        setError(errorMessage(addError));
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
        console.error('removeFromPlaylist failed:', removeError);
        setError(errorMessage(removeError));
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
        console.error('deletePlaylist failed:', deleteError);
        setError(errorMessage(deleteError));
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
      if (active) void fetchPlaylists();
    });
    return () => {
      active = false;
    };
  }, [fetchPlaylists]);

  return {
    playlists,
    loading,
    selectedPlaylistId,
    playlistItems,
    error,
    fetchPlaylists,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    selectPlaylist,
  };
}
