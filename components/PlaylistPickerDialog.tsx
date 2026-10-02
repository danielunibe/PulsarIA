'use client';

import { useState } from 'react';
import { FaClose, FaFolder, Loader2 } from '@/components/icon-library';
import { usePlaylists } from '@/hooks/usePlaylists';

interface PlaylistPickerDialogProps {
  jobId?: number;
  contentId?: number;
  onClose: () => void;
}

export function PlaylistPickerDialog({ jobId, contentId, onClose }: PlaylistPickerDialogProps) {
  const { playlists, loading, error, addToPlaylist, addContentToPlaylist } = usePlaylists();
  const [addingId, setAddingId] = useState<number | null>(null);

  const manualPlaylists = playlists.filter((playlist) => {
    const kind = playlist.kind ?? (playlist.auto_generated ? 'legacy_auto' : 'manual');
    return !playlist.auto_generated && kind !== 'legacy_auto' && kind !== 'smart';
  });

  const handleAdd = async (playlistId: number) => {
    setAddingId(playlistId);
    if (contentId !== undefined) await addContentToPlaylist(playlistId, contentId);
    else if (jobId !== undefined) await addToPlaylist(playlistId, jobId);
    setAddingId(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Agregar a playlist"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-[22px] bg-[#14161d]/95 p-5 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#25f4ee]/70">Membership manual</p>
            <h2 className="mt-1 text-base font-semibold text-white/90">Agregar a playlist</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/40">El contenido se mantiene en la biblioteca y solo se crea una relación.</p>
          </div>
          <button type="button" aria-label="Cerrar selector" onClick={onClose} className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white">
            <FaClose size={15} />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-white/45">
              <Loader2 size={15} className="animate-spin" /> Consultando playlists...
            </div>
          )}
          {!loading && manualPlaylists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              disabled={addingId !== null}
              onClick={() => void handleAdd(playlist.id)}
              className="flex items-center gap-3 rounded-[14px] bg-white/[0.035] px-3 py-3 text-left transition-colors hover:bg-white/[0.08] disabled:opacity-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.07] text-white/55">
                {addingId === playlist.id ? <Loader2 size={14} className="animate-spin" /> : <FaFolder size={14} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-white/80">{playlist.name}</span>
                <span className="mt-0.5 block text-[10px] text-white/35">{playlist.item_count} contenidos</span>
              </span>
            </button>
          ))}
          {!loading && manualPlaylists.length === 0 && (
            <p className="rounded-[14px] bg-white/[0.025] px-3 py-5 text-center text-xs text-white/40">Crea primero una playlist manual.</p>
          )}
          {error && <p role="alert" className="text-[10px] text-[#fe2c55]">{error}</p>}
        </div>
      </div>
    </div>
  );
}
