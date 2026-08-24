'use client';
import { useState, useEffect, useCallback } from 'react';

export interface PlaylistRecord {
  id: number;
  name: string;
  description: string | null;
  cover_job_id: number | null;
  auto_generated: boolean;
  topic_keywords: string; // JSON string e.g. "['rust','programacion']"
  color: string;
  created_at: string;
  item_count: number;
}

export interface JobRecord {
  id: number;
  url: string;
  status: string;
  progress: number;
  created_at: string;
  title?: string;
  author?: string;
  thumbnail?: string;
  duration?: number;
  video_path?: string;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
  } catch (e) {
    throw new Error(`Tauri invoke failed for ${command}: ${e}`);
  }
}

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [playlistItems, setPlaylistItems] = useState<JobRecord[]>([]);

  const fetchPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tauriInvoke<PlaylistRecord[]>('get_playlists');
      setPlaylists(data);
    } catch (e) {
      console.error('fetchPlaylists failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const createPlaylist = useCallback(async (name: string, description?: string, color?: string) => {
    try {
      const id = await tauriInvoke<number>('create_playlist', { name, description, color });
      await fetchPlaylists();
      return id;
    } catch {
      const newPl: PlaylistRecord = {
        id: Date.now(),
        name,
        description: description || null,
        cover_job_id: null,
        auto_generated: false,
        topic_keywords: '[]',
        color: color || '#8a5cff',
        created_at: new Date().toISOString(),
        item_count: 0
      };
      setPlaylists(prev => [newPl, ...prev]);
      return newPl.id;
    }
  }, [fetchPlaylists]);

  const addToPlaylist = useCallback(async (playlistId: number, jobId: number) => {
    try {
      await tauriInvoke<void>('add_to_playlist', { playlistId, jobId });
      if (selectedPlaylistId === playlistId) {
        await fetchPlaylistItems(playlistId);
      }
      await fetchPlaylists();
    } catch {
      setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, item_count: p.item_count + 1 } : p));
    }
  }, [selectedPlaylistId, fetchPlaylists]);

  const removeFromPlaylist = useCallback(async (playlistId: number, jobId: number) => {
    try {
      await tauriInvoke<void>('remove_from_playlist', { playlistId, jobId });
      if (selectedPlaylistId === playlistId) {
        await fetchPlaylistItems(playlistId);
      }
      await fetchPlaylists();
    } catch {
      setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, item_count: Math.max(0, p.item_count - 1) } : p));
    }
  }, [selectedPlaylistId, fetchPlaylists]);

  const deletePlaylist = useCallback(async (playlistId: number) => {
    try {
      await tauriInvoke<void>('delete_playlist', { playlistId });
    } catch {
      setPlaylists(prev => prev.filter(p => p.id !== playlistId));
    }
    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId(null);
      setPlaylistItems([]);
    }
    await fetchPlaylists();
  }, [selectedPlaylistId, fetchPlaylists]);

  const fetchPlaylistItems = useCallback(async (playlistId: number) => {
    try {
      const items = await tauriInvoke<JobRecord[]>('get_playlist_items', { playlistId });
      setPlaylistItems(items);
    } catch (e) {
      console.error('fetchPlaylistItems failed:', e);
    }
  }, []);

  const selectPlaylist = useCallback(async (id: number | null) => {
    setSelectedPlaylistId(id);
    if (id !== null) {
      await fetchPlaylistItems(id);
    } else {
      setPlaylistItems([]);
    }
  }, [fetchPlaylistItems]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  return {
    playlists,
    loading,
    selectedPlaylistId,
    playlistItems,
    fetchPlaylists,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    selectPlaylist,
  };
}
