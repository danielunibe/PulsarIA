'use client';

import { motion } from 'motion/react';
import { FaTableCells, FaListUl, FaGrip, FaArrowDownWideShort, FaCheck, FaSliders, FaFilter } from 'react-icons/fa6';

export type GridLayout = 'grid' | 'list' | 'compact';
export type GridColumns = 2 | 3 | 4 | 0; // 0 = auto
export type SortKey = 'date_desc' | 'date_asc' | 'title' | 'duration';

/**
 * Configuración de presentación de la biblioteca de videos.
 * 
 * Controla cómo se muestra el VideoGrid: layout, columnas,
 * ordenamiento, filtros visuales. Se persiste en `localStorage`.
 */
export interface PageConfig {
  /** Modo de visualización: 'grid' (auto-columnas), 'list' (una columna), 'compact' (cards pequeñas) */
  layout: GridLayout;
  /** Número fijo de columnas (0 = auto basado en ancho de ventana) */
  columns: GridColumns;
  /** Clave de ordenamiento */
  sortKey: SortKey;
  /** Si es true, oculta jobs que no están en estado 'complete' */
  showOnlyCompleted: boolean;
  /** Si es true, muestra solo jobs con errores */
  showErrors: boolean;
  /** Filtrar por estado de retención: 'keep', 'online', o 'all' */
  keepStatusFilter?: string;
  /** Filtrar por plataforma: 'tiktok', 'youtube', etc., o 'all' */
  platformFilter?: string;
}

const DEFAULT_CONFIG: PageConfig = {
  layout: 'grid',
  columns: 0,
  sortKey: 'date_desc',
  showOnlyCompleted: true, // Bug #57 FIX: Must match page.tsx DEFAULT_PAGE_CONFIG
  showErrors: false,
  keepStatusFilter: 'all',
  platformFilter: 'all',
};

interface PagePanelProps {
  config: PageConfig;
  onChange: (config: PageConfig) => void;
}

/**
 * PagePanel — Panel de configuración de presentación de la biblioteca.
 * 
 * Permite al usuario controlar: modo de visualización (grid/list/compact),
 * número de columnas, ordenamiento, filtros de plataforma y retención.
 * Todo el estado se persiste en `localStorage`.
 */
export function PagePanel({ config, onChange }: PagePanelProps) {
  const update = (partial: Partial<PageConfig>) => onChange({ ...config, ...partial });

  return (
    <div 
      className="flex flex-col gap-3.5 p-4 rounded-[20px] border transition-all font-sans"
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
          <div className="w-5 h-5 rounded-[6px] bg-[#00d4aa]/20 flex items-center justify-center text-[#00d4aa]">
            <FaSliders size={10} />
          </div>
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white/50">
            Vista de Biblioteca
          </span>
        </div>
        <span className="text-[9px] font-mono text-[#00d4aa] font-bold">GRID</span>
      </div>

      {/* Layout Mode Selector */}
      <div className="flex flex-col gap-2 p-3 rounded-2xl bg-black/40 border border-white/5 shadow-inner">
        <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold flex items-center gap-1.5">
          <FaGrip size={10} /> Disposicion
        </label>
        <div className="flex gap-1.5 p-1 rounded-xl bg-white/[0.03] border border-white/5">
          {[
            { id: 'grid', label: 'Grid', icon: FaTableCells },
            { id: 'list', label: 'Lista', icon: FaListUl },
            { id: 'compact', label: 'Compacto', icon: FaGrip },
          ].map(opt => {
            const Icon = opt.icon;
            const isSelected = config.layout === opt.id;
            return (
              <button
                type="button"
                key={opt.id}
                aria-pressed={isSelected}
                onClick={() => update({ layout: opt.id as GridLayout })}
                className={`flex-1 py-2 px-2 flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-wider rounded-lg transition-all ${
                  isSelected
                    ? 'bg-[#00d4aa]/20 text-[#00d4aa] border border-[#00d4aa]/30 shadow-[0_0_12px_rgba(0,212,170,0.2)]'
                    : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <Icon size={11} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Columns Selector */}
      {config.layout === 'grid' && (
        <div className="flex flex-col gap-2 p-3 rounded-2xl bg-black/40 border border-white/5 shadow-inner">
          <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
            Columnas en Pantalla
          </label>
          <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-white/[0.03] border border-white/5">
            {([0, 2, 3, 4] as GridColumns[]).map(col => {
              const isSelected = config.columns === col;
              return (
                <button
                  type="button"
                  key={col}
                  aria-pressed={isSelected}
                  onClick={() => update({ columns: col })}
                  className={`py-1.5 text-[11px] font-mono font-bold rounded-lg transition-all ${
                    isSelected
                      ? 'bg-[#25f4ee]/20 text-[#25f4ee] border border-[#25f4ee]/30 shadow-[0_0_10px_rgba(37,244,238,0.2)]'
                      : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                  }`}
                >
                  {col === 0 ? 'Auto' : `${col} Col`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sort Selector */}
      <div className="flex flex-col gap-2 p-3 rounded-2xl bg-black/40 border border-white/5 shadow-inner">
        <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold flex items-center gap-1.5">
          <FaArrowDownWideShort size={10} /> Criterio de Orden
        </label>
        <select
          value={config.sortKey}
          onChange={e => update({ sortKey: e.target.value as SortKey })}
          className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white/90 outline-none focus:border-[#00d4aa]/50 transition-colors cursor-pointer"
        >
          <option value="date_desc">Fecha (mas reciente primero)</option>
          <option value="date_asc">Fecha (mas antiguo primero)</option>
          <option value="title">Titulo Alfabetico (A-Z)</option>
          <option value="duration">Duracion (mas largo primero)</option>
        </select>
      </div>

      {/* Filters and Visibility Toggles */}
      <div className="flex flex-col gap-2.5 p-3 rounded-2xl bg-black/40 border border-white/5 shadow-inner">
        <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold flex items-center gap-1.5">
          <FaFilter size={10} /> Filtros de Visualizacion
        </label>

        {[
          { key: 'showOnlyCompleted', label: 'Solo videos completados', desc: 'Oculta tareas en progreso' },
          { key: 'showErrors', label: 'Mostrar registros de error', desc: 'Permite inspeccionar descargas fallidas' },
          { key: 'keepStatusFilter', label: `Retención: ${(config.keepStatusFilter ?? 'all') === 'all' ? 'Todas' : (config.keepStatusFilter ?? 'keep') === 'keep' ? 'Conservados' : 'Online'}` },
          { key: 'platformFilter', label: `Plataforma: ${(config.platformFilter ?? 'all') === 'all' ? 'Todas' : (config.platformFilter ?? 'all').toUpperCase()}` },
        ].map(({ key, label, desc }) => {
          const isChecked = key === 'keepStatusFilter'
            ? (config[key as keyof PageConfig] as string) !== 'all'
            : key === 'platformFilter'
              ? (config[key as keyof PageConfig] as string) !== 'all'
              : (config[key as keyof PageConfig] as boolean);

          const handleClick = () => {
            if (key === 'keepStatusFilter') {
              const current = config[key as keyof PageConfig] as string;
              const next = current === 'all' ? 'keep' : current === 'keep' ? 'online' : 'all';
              update({ keepStatusFilter: next });
            } else if (key === 'platformFilter') {
              const current = (config[key as keyof PageConfig] as string);
              const next = current === 'all' ? 'tiktok' : current === 'tiktok' ? 'youtube' : current === 'youtube' ? 'instagram' : 'all';
              update({ platformFilter: next });
            } else {
              update({ [key]: !isChecked });
            }
          };

          return (
            <button
              type="button"
              key={key}
              aria-pressed={isChecked}
              onClick={handleClick}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-all cursor-pointer select-none text-left"
            >
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white/90">{label}</span>
                <span className="text-[9px] text-white/40">{desc}</span>
              </div>
              <span
                aria-hidden="true"
                className={`w-9 h-5 rounded-full p-0.5 transition-colors relative shrink-0 ${
                  isChecked ? 'bg-[#00d4aa]' : 'bg-white/20'
                }`}
              >
                                  <motion.span
                  className="block w-4 h-4 rounded-full bg-white shadow-md"

                  animate={{ x: isChecked ? 16 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
