'use client';

import { motion } from 'motion/react';
import { FaLayerGroup, FaUser } from '@/components/icon-library';
import type { SourceCollectionRecord } from '@/hooks/usePlaylists';

const CHANNEL_LABELS: Record<string, string> = {
  posts: 'Publicaciones',
  saved: 'Guardados',
  favorites: 'Favoritos',
  reposts: 'Reposts',
};

function channelLabel(kind: string): string {
  return CHANNEL_LABELS[kind] ?? kind;
}

interface SourceCollectionCardProps {
  collection: SourceCollectionRecord;
  isSelected: boolean;
  onSelect: () => void;
}

export function SourceCollectionCard({
  collection,
  isSelected,
  onSelect,
}: SourceCollectionCardProps) {
  const confirmedCount = collection.item_count !== null;
  const statusLabel = collection.status === 'error'
    ? 'No disponible'
    : confirmedCount
      ? `${collection.item_count} contenidos`
      : 'Sin confirmar';

  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.99 }}
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`w-full text-left rounded-[15px] px-3 py-2.5 transition-all border-0 ${
        isSelected ? 'bg-[#25f4ee]/10 shadow-[0_0_24px_rgba(37,244,238,0.08)]' : 'bg-white/[0.025] hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-[11px] flex items-center justify-center ${isSelected ? 'bg-[#25f4ee]/15 text-[#25f4ee]' : 'bg-white/[0.07] text-white/45'}`}>
          <FaLayerGroup size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-white/85">{collection.name}</span>
            <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-white/30">{channelLabel(collection.channel_kind)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/40">
            <FaUser size={10} />
            <span className="truncate">{collection.username || collection.display_name || 'Perfil confirmado'}</span>
            <span className="text-white/20">·</span>
            <span className={collection.status === 'error' ? 'text-[#fe2c55]/80' : ''}>{statusLabel}</span>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

