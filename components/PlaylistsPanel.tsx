'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import { FaPlus, FaFolder, FaTrash } from '@/components/icon-library';
import { PlaylistCard } from './PlaylistCard';
import { SourceCollectionCard } from './SourceCollectionCard';
import { usePlaylists } from '@/hooks/usePlaylists';
import type { SourceCollectionRecord } from '@/hooks/usePlaylists';

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
  /** Selecciona una agrupación confirmada de perfil/canal. */
  onSourceCollectionSelect?: (collection: SourceCollectionRecord | null) => void;
  /** Agrupación de fuente actualmente seleccionada, o null. */
  selectedSourceCollection?: SourceCollectionRecord | null;
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
export function PlaylistsPanel({
  onPlaylistSelect,
  selectedPlaylistId,
  onSourceCollectionSelect,
  selectedSourceCollection = null,
}: PlaylistsPanelProps) {
  const {
    playlists,
    loading,
    ready,
    error,
    fetchPlaylists,
    createPlaylist,
    deletePlaylist,
    selectPlaylist,
    playlistItems,
    removeFromPlaylist,
    removeContentFromPlaylist,
    sourceCollections,
    sourceLoading,
    sourceError,
    fetchSourceCollections,
  } = usePlaylists();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const PLAYLIST_COLORS = ['#fe2c55', '#8a5cff', '#25f4ee', '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#f97316'];
  const [selectedColor, setSelectedColor] = useState(PLAYLIST_COLORS[1]);
  const [collectionFilter, setCollectionFilter] = useState<'all' | 'manual' | 'source'>('all');
  const manualPlaylists = playlists.filter((playlist) => playlist.kind !== 'legacy_auto' && !playlist.auto_generated);
  const legacyPlaylists = playlists.filter((playlist) => playlist.kind === 'legacy_auto' || playlist.auto_generated);

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
    onSourceCollectionSelect?.(null);
    onPlaylistSelect(nextId);
  };

  const handleSourceSelect = (collection: SourceCollectionRecord) => {
    const nextCollection = selectedSourceCollection?.id === collection.id ? null : collection;
    void selectPlaylist(null);
    onPlaylistSelect(null);
    onSourceCollectionSelect?.(nextCollection);
  };

  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  const handleDelete = (id: number, name: string) => {
    setPendingDelete({ id, name });
  };

  return (
    <div 
      className="flex flex-col gap-3.5 p-4 rounded-[20px] transition-all border-0"
      style={{
        background: 'rgba(14, 16, 22, 0.75)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-[6px] bg-white/10 flex items-center justify-center text-white/80">
            <FaFolder size={10} />
          </div>
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white/50">Playlists</span>
        </div>
        <button
          type="button"
          aria-expanded={isCreating}
          onClick={() => setIsCreating(!isCreating)}
          disabled={!ready || loading}
          title={!ready ? 'Conecta con el motor local para crear playlists.' : undefined}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] text-[10px] font-bold tracking-wider uppercase text-white/90 bg-white/10 hover:bg-white/20 transition-all cursor-pointer border-0 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FaPlus size={9} />
          <span>Nueva</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-[11px] bg-white/[0.035] p-1">
        {([
          ['all', 'Todo'],
          ['manual', 'Playlists'],
          ['source', 'Fuentes'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={collectionFilter === value}
            onClick={() => setCollectionFilter(value)}
            className={`rounded-[8px] px-2 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors ${collectionFilter === value ? 'bg-white/10 text-white/80' : 'text-white/35 hover:text-white/60'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border-0 bg-[#fe2c55]/10 px-3 py-2 text-[10px] leading-relaxed text-[#fe2c55]">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => void fetchPlaylists()} className="shrink-0 rounded-md bg-white/[.07] px-2 py-1 font-bold text-white/75 hover:bg-white/10">Actualizar</button>
        </div>
      )}

      {/* Create form */}
      <>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-2.5 p-3 rounded-[16px] bg-white/[0.03] border-0 overflow-hidden"
          >
            <input
              type="text"
              aria-label="Nombre de la playlist"
              placeholder="Nombre de la playlist..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-black/40 border-0 text-white placeholder-white/30 focus:outline-none"
            />
            <input
              type="text"
              aria-label="Descripción de la playlist"
              placeholder="Descripcion..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-black/40 border-0 text-white placeholder-white/30 focus:outline-none"
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

      {/* Manual playlist list */}
      {(collectionFilter === 'all' || collectionFilter === 'manual') && (
        <div className="flex flex-col gap-2">
          <div className="px-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/30">Playlists manuales</div>
          {manualPlaylists.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              isSelected={playlist.id === selectedPlaylistId}
              onSelect={() => handleSelect(playlist.id)}
              onDelete={() => handleDelete(playlist.id, playlist.name)}
            />
          ))}

          {!loading && ready && !error && manualPlaylists.length === 0 && !isCreating && (
            <div className="text-center py-6 px-3 rounded-[16px] border border-dashed border-white/10 bg-white/[0.01]">
              <FaFolder size={20} className="mx-auto text-white/20 mb-2" />
              <p className="text-xs text-white/40 font-medium">No hay playlists creadas</p>
              <p className="text-[10px] text-white/25 mt-1">Crea una para organizar tus videos por temas</p>
            </div>
          )}

          {selectedPlaylistId !== null && playlistItems.length > 0 && (
            <div className="mt-1 flex flex-col gap-1.5 rounded-[15px] bg-black/15 p-2">
              <div className="px-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/25">Memberships</div>
              {playlistItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-[10px] bg-white/[0.025] px-2 py-2">
                  <span className="min-w-0 flex-1 truncate text-[10px] text-white/55">{item.title || item.url}</span>
                  <button
                    type="button"
                    aria-label={`Quitar ${item.title || item.url} de la playlist`}
                    onClick={() => void (item.job_id !== null
                      ? removeFromPlaylist(selectedPlaylistId, item.job_id)
                      : removeContentFromPlaylist(selectedPlaylistId, item.content_id))}
                    className="shrink-0 rounded-md p-1 text-white/30 transition-colors hover:bg-[#fe2c55]/10 hover:text-[#fe2c55]"
                  >
                    <FaTrash size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {collectionFilter === 'all' && legacyPlaylists.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="px-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/30">Clustering legado</div>
          {legacyPlaylists.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              isSelected={playlist.id === selectedPlaylistId}
              onSelect={() => handleSelect(playlist.id)}
              onDelete={() => handleDelete(playlist.id, playlist.name)}
            />
          ))}
        </div>
      )}

      {/* Confirmed profile/channel groupings are read-only projections. */}
      {(collectionFilter === 'all' || collectionFilter === 'source') && (
        <div className="flex flex-col gap-2">
          <div className="px-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/30">Fuentes confirmadas</div>
          {sourceError && (
            <div role="alert" className="flex items-center gap-3 rounded-xl bg-[#f59e0b]/10 px-3 py-2 text-[10px] leading-relaxed text-[#f59e0b]/90">
              <span className="min-w-0 flex-1">{sourceError}</span>
              <button type="button" onClick={() => void fetchSourceCollections()} className="shrink-0 rounded-md bg-white/[.07] px-2 py-1 font-bold text-white/75 hover:bg-white/10">Reintentar</button>
            </div>
          )}
          {sourceCollections.map((collection) => (
            <SourceCollectionCard
              key={collection.id}
              collection={collection}
              isSelected={selectedSourceCollection?.id === collection.id}
              onSelect={() => handleSourceSelect(collection)}
            />
          ))}
          {!sourceLoading && !sourceError && sourceCollections.length === 0 && (
            <div className="rounded-[16px] bg-white/[0.02] px-3 py-5 text-center">
              <p className="text-xs text-white/40 font-medium">No hay canales confirmados</p>
              <p className="mt-1 text-[10px] text-white/25">Las fuentes aparecerán después de confirmar un perfil.</p>
            </div>
          )}
        </div>
      )}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             role="dialog" aria-modal="true" aria-label="Confirmar eliminación">
          <div className="rounded-2xl p-6 bg-[#141416] border border-white/10 shadow-2xl flex flex-col gap-4 max-w-xs w-full mx-4">
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
