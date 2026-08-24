'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FaPlus, FaListUl } from 'react-icons/fa6';
import { PlaylistCard } from './PlaylistCard';
import { usePlaylists } from '@/hooks/usePlaylists';

interface PlaylistsPanelProps {
  onPlaylistSelect: (id: number | null) => void;
  selectedPlaylistId: number | null;
}

export function PlaylistsPanel({ onPlaylistSelect, selectedPlaylistId }: PlaylistsPanelProps) {
  const {
    playlists, loading, createPlaylist, deletePlaylist, selectPlaylist
  } = usePlaylists();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const PLAYLIST_COLORS = ['#fe2c55', '#8a5cff', '#25f4ee', '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#f97316'];
  const [selectedColor, setSelectedColor] = useState(PLAYLIST_COLORS[1]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createPlaylist(newName.trim(), newDesc.trim() || undefined, selectedColor);
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
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] text-[10px] font-bold tracking-wider uppercase text-[#8a5cff] bg-[#8a5cff]/10 hover:bg-[#8a5cff]/20 border border-[#8a5cff]/30 transition-all cursor-pointer"
        >
          <FaPlus size={9} />
          <span>Nueva</span>
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
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
      </AnimatePresence>

      {/* Playlist list */}
      <div className="flex flex-col gap-2">
        {playlists.map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            isSelected={playlist.id === selectedPlaylistId}
            onSelect={() => handleSelect(playlist.id)}
            onDelete={() => deletePlaylist(playlist.id)}
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
    </div>
  );
}
