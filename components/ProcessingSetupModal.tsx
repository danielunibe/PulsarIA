'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { FaMicrochip, FaMemory, FaGaugeHigh, FaDownload } from 'react-icons/fa6';
import type { HardwareProfile, ProcessingSettings } from '@/hooks/use-processing-settings';
import type { ProcessingQuality } from '@/lib/settings-context';

interface ProcessingSetupModalProps {
  hardware: HardwareProfile;
  processing: ProcessingSettings;
  onSave: (quality: number) => Promise<void>;
}

function formatMemory(bytes: number | null | undefined) {
  if (!bytes) return 'No disponible';
  return `${Math.round(bytes / 1024 / 1024 / 1024)} GB`;
}

function recommendedSlider(profile: ProcessingQuality) {
  return profile === 'fast' ? 25 : profile === 'balanced' ? 58 : 82;
}

export function ProcessingSetupModal({ hardware, processing, onSave }: ProcessingSetupModalProps) {
  const [quality, setQuality] = useState(() => recommendedSlider(hardware.recommended_quality));
  const [saving, setSaving] = useState(false);

  const profile = quality < 35 ? 'fast' : quality < 72 ? 'balanced' : 'high';
  const profileLabel = profile === 'fast' ? 'Rápido' : profile === 'balanced' ? 'Equilibrado' : 'Alta calidad';
  const modelLabel = profile === 'fast' ? 'Whisper tiny' : profile === 'balanced' ? 'Whisper small' : hardware.whisper_gpu_supported ? 'Whisper medium' : 'Whisper small';

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(quality);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-10 flex items-center justify-center bg-black/70 p-6 backdrop-blur-md"
      style={{ zIndex: 1200, top: '40px' }}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="processing-setup-title"
        className="w-full max-w-[560px] rounded-[24px] p-6 text-white"
        initial={{ opacity: 0, y: 18, scale: .98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          zIndex: 1,
          background: 'linear-gradient(145deg, rgba(22, 24, 34, .98), rgba(9, 12, 18, .99))',
          border: '1px solid rgba(255,255,255,.12)',
          boxShadow: '0 30px 90px rgba(0,0,0,.75)',
        }}
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <h2 id="processing-setup-title" className="text-lg font-black tracking-tight">Configura tu análisis local</h2>
            <p className="mt-2 text-xs leading-relaxed text-white/55">Pulsaria detectó tu equipo. Elige si prefieres procesar más rápido o dedicar más tiempo a obtener una transcripción y análisis visual detallados.</p>
          </div>
          <FaGaugeHigh className="mt-1 shrink-0 text-[#25f4ee]" size={22} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-[14px] bg-white/[.04] p-3">
            <div className="flex items-center gap-2 text-white/45"><FaMicrochip size={12} /><span className="text-[9px] font-bold uppercase tracking-wider">CPU</span></div>
            <p className="mt-2 truncate text-xs font-semibold text-white/85" title={hardware.cpu_name}>{hardware.cpu_name}</p>
            <p className="mt-1 text-[10px] text-white/40">{hardware.logical_cores} hilos</p>
          </div>
          <div className="rounded-[14px] bg-white/[.04] p-3">
            <div className="flex items-center gap-2 text-white/45"><FaMemory size={12} /><span className="text-[9px] font-bold uppercase tracking-wider">Memoria</span></div>
            <p className="mt-2 text-xs font-semibold text-white/85">{formatMemory(hardware.ram_bytes)}</p>
            <p className="mt-1 truncate text-[10px] text-white/40">{hardware.gpu_name || 'GPU no detectada'}</p>
          </div>
        </div>

        <div className="mt-5 rounded-[16px] bg-black/25 p-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="processing-quality" className="text-xs font-bold text-white/75">Rapidez ↔ calidad</label>
            <span className="text-xs font-black text-[#25f4ee]">{profileLabel}</span>
          </div>
          <input id="processing-quality" aria-label="Rapidez y calidad del procesamiento" type="range" min="0" max="100" step="1" value={quality} onChange={(event) => setQuality(Number(event.target.value))} className="mt-4 w-full accent-[#25f4ee]" />
          <div className="mt-2 flex justify-between text-[9px] uppercase tracking-wider text-white/35"><span>Rápido</span><span>Más preciso</span></div>
          <div className="mt-4 flex items-center justify-between gap-3 text-[10px] text-white/45">
            <span>{modelLabel} · {hardware.whisper_gpu_supported && profile !== 'fast' ? 'GPU' : 'CPU'}</span>
            {profile !== 'fast' && <span className="flex items-center gap-1.5 text-[#25f4ee]/75"><FaDownload size={9} /> Se prepara al procesar</span>}
          </div>
        </div>

        <button type="button" disabled={saving} onClick={() => void handleSave()} className="mt-5 flex w-full items-center justify-center rounded-[14px] bg-gradient-to-r from-[#fe2c55] to-[#8a5cff] py-3 text-[11px] font-black uppercase tracking-[.14em] text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50">
          {saving ? 'Guardando configuración…' : `Usar ${profileLabel}`}
        </button>
        <p className="mt-3 text-center text-[10px] text-white/35">Puedes cambiar esta preferencia después desde Configuración.</p>
        <span className="sr-only">Configuración actual: {processing.profile}</span>
      </motion.section>
    </div>
  );
}
