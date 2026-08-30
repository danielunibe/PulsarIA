'use client';
import { motion } from 'motion/react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { FaListUl, FaWandMagicSparkles, FaTrash } from 'react-icons/fa6';
import type { PlaylistRecord } from '@/hooks/usePlaylists';

/**
 * Props de la tarjeta individual de playlist.
 * 
 * Muestra el nombre, descripción, keywords temáticas, badge "Auto"
 * y thumbnail de portada de una playlist.
 */
interface PlaylistCardProps {
  /** Datos de la playlist */
  playlist: PlaylistRecord;
  /** Si esta playlist está actualmente seleccionada */
  isSelected: boolean;
  /** Callback para seleccionar/deseleccionar la playlist */
  onSelect: () => void;
  /** Callback para eliminar la playlist */
  onDelete: () => void;
  /** URL del thumbnail de portada (opcional) */
  coverThumb?: string;
}

/**
 * PlaylistCard — Tarjeta individual de una playlist.
 * 
 * Renderiza una card con: thumbnail de portada (o bloque de color),
 * nombre, descripción corta, keywords temáticas, badge "Auto" si
 * fue generada automáticamente, y botón de eliminar.
 */
export function PlaylistCard({ playlist, isSelected, onSelect, onDelete, coverThumb }: PlaylistCardProps) {
  const keywords = (() => {
    try { 
      return (JSON.parse(playlist.topic_keywords || '[]') as string[]) || []; 
    } catch { 
      return []; 
    }
  })();

  const color = playlist.color || '#8a5cff';

  return (
    <motion.div
      whileHover={{ scale: 1.015, y: -1 }}
      whileTap={{ scale: 0.98 }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={onSelect}
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className="relative flex items-center gap-3 p-3 rounded-2xl cursor-pointer group transition-all duration-300"
      style={{
        background: isSelected
          ? `${color}18`
          : 'rgba(255,255,255,0.02)',
        border: isSelected
          ? `1px solid ${color}50`
          : '1px solid rgba(255,255,255,0.06)',
        boxShadow: isSelected
          ? `0 0 20px ${color}25`
          : 'none',
      }}
    >
      {/* Cover thumbnail or color block */}
      <div
        className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden shadow-md"
        style={{ 
          background: coverThumb ? 'transparent' : `${color}25`, 
          border: `1px solid ${color}40` 
        }}
      >
        {coverThumb ? (
          // Las portadas pueden proceder de cualquier proveedor de thumbnails.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverThumb} alt="" className="w-full h-full object-cover" />
        ) : (
          <FaListUl size={14} style={{ color }} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-white/90 truncate">{playlist.name}</span>
          {playlist.auto_generated && (
            <FaWandMagicSparkles size={10} className="text-[#8a5cff] flex-shrink-0" title="Auto-generada" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-white/40">{playlist.item_count} video{playlist.item_count !== 1 ? 's' : ''}</span>
          {keywords.slice(0, 2).map(k => (
            <span 
              key={k} 
              className="text-[9px] px-1.5 py-0.5 rounded-md font-medium"
              style={{ background: `${color}20`, color }}
            >
              #{k}
            </span>
          ))}
        </div>
      </div>

      {/* Delete button */}
      <button
        type="button"
        aria-label={`Eliminar playlist ${playlist.name}`}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10"
        title="Eliminar playlist"
      >
        <FaTrash size={11} />
      </button>
    </motion.div>
  );
}
