'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import { FaPlus, FaListUl } from 'react-icons/fa6';
import { PlaylistCard } from './PlaylistCard';
import { usePlaylists } from '@/hooks/usePlaylists';

/**
 * Props del panel de playlists temáticas.
 * 
 * Muestra la lista de playlists (manuales y auto-generadas), permite
 * crear nuevas playlists, y navegar a los videos de cada una.
 */
interface PlaylistsPanelProps {
  /** Callback para seleccionar/deseleccionar una playlist */
  onPlaylistSelect: (id: number | null) => void;
  /** ID de la playlist actualmente seleccionada, o null */
  selectedPlaylistId: number | null;
}

/**
 * PlaylistsPanel — Panel de colecciones temáticas de videos.
 * 
 * Features:
 * - Lista de playlists con conteo de videos y badge "Auto"
 * - Creación manual de playlists con nombre, descripción y color
 * - Selección/deselección de playlist (filtra el VideoGrid)
 * - Eliminación de playlists con confirmación
 */
export function PlaylistsPanel({ onPlaylistSelect, selectedPlaylistId }: PlaylistsPanelProps) {
  const {
    playlists, loading, error, createPlaylist, deletePlaylist, selectPlaylist
  } = usePlaylists();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const PLAYLIST_COLORS = ['#fe2c55', '#8a5cff', '#25f4ee', '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#f97316'];
  const [selectedColor, setSelectedColor] = useState(PLAYLIST_COLORS[1]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const playlistId = await createPlaylist(newName.trim(), newDesc.trim() || undefined, selectedColor);
    if (playlistId === null) return;
    setNewName('');
    setNewDesc('');
    setSelectedColor(PLAYLIST_COLORS[1]);
    setIsCreating(false);
  };

  const handleSelect = async (id: number) => {
    const nextId = id === selectedPlaylistId ? null : id;
    await selectPlaylist(nextId);
    onPlaylistSelect(nextId);
  };

  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  const handleDelete = (id: number, name: string) => {
    setPendingDelete({ id, name });
  };

  return (
    <div 
      className="flex flex-col gap-3.5 p-4 rounded-[20px] border transition-all"
      style={{
        background: 'rgba(14, 16, 22, 0.75)',
        backdropFilter: 'blur(20px)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-[6px] bg-[#8a5cff]/20 flex items-center justify-center text-[#8a5cff]">
            <FaListUl size={10} />
          </div>
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white/50">Playlists</span>
        </div>
        <button
          type="button"
          aria-expanded={isCreating}
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] text-[10px] font-bold tracking-wider uppercase text-[#8a5cff] bg-[#8a5cff]/10 hover:bg-[#8a5cff]/20 border border-[#8a5cff]/30 transition-all cursor-pointer"
        >
          <FaPlus size={9} />
          <span>Nueva</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-[#fe2c55]/30 bg-[#fe2c55]/10 px-3 py-2 text-[10px] leading-relaxed text-[#fe2c55]">
          No se pudo completar la operación de playlist: {error}
        </div>
      )}

      {/* Create form */}
      <>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-2.5 p-3 rounded-[16px] bg-white/[0.03] border border-white/10 overflow-hidden"
          >
            <input
              type="text"
              placeholder="Nombre de la playlist..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#8a5cff]/60"
            />
            <input
              type="text"
              placeholder="Descripcion..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#8a5cff]/60"
            />
            {/* Color picker */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/40">Color:</span>
              <div className="flex items-center gap-1.5">
                {PLAYLIST_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Seleccionar color ${c}`}
                    aria-pressed={selectedColor === c}
                    onClick={() => setSelectedColor(c)}
                    className={`w-4 h-4 rounded-full transition-transform ${selectedColor === c ? 'scale-125 ring-2 ring-white/50' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-2.5 py-1 text-xs text-white/50 hover:text-white/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="px-3 py-1 text-xs font-bold text-white bg-[#8a5cff] hover:bg-[#8a5cff]/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
              >
                Crear
              </button>
            </div>
          </motion.div>
        )}
      </>

      {/* Playlist list */}
      <div className="flex flex-col gap-2">
        {playlists.map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            isSelected={playlist.id === selectedPlaylistId}
            onSelect={() => handleSelect(playlist.id)}
            onDelete={() => handleDelete(playlist.id, playlist.name)}
          />
        ))}

        {!loading && playlists.length === 0 && !isCreating && (
          <div className="text-center py-6 px-3 rounded-[16px] border border-dashed border-white/10 bg-white/[0.01]">
            <FaListUl size={20} className="mx-auto text-white/20 mb-2" />
            <p className="text-xs text-white/40 font-medium">No hay playlists creadas</p>
            <p className="text-[10px] text-white/25 mt-1">Crea una para organizar tus videos por temas</p>
          </div>
        )}
      </div>
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             role="dialog" aria-modal="true" aria-label="Confirmar eliminación">
          <div className="rounded-2xl p-6 bg-[#0e1017] border border-white/10 shadow-2xl flex flex-col gap-4 max-w-xs w-full mx-4">
            <p className="text-white text-sm font-medium">
              ¿Eliminar la playlist «{pendingDelete.name}»?
            </p>
            <p className="text-white/40 text-xs">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingDelete(null)}
                className="flex-1 py-2 rounded-xl text-xs text-white/60 bg-white/5 hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { void deletePlaylist(pendingDelete.id); setPendingDelete(null); }}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-[#fe2c55]/80 hover:bg-[#fe2c55] transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
