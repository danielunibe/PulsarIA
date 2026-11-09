import React, { useState } from 'react';
import { LibItem } from '../types';
import {
  TikTokLogoIcon,
  CheckIcon,
  HeartIcon,
} from './SvgIcons';

interface LibrarySectionProps {
  items: LibItem[];
  onOpenFicha: (item: LibItem) => void;
  onRetryItem?: (id: string) => void;
  onUpdateImage?: (sceneKey: string, url: string) => void;
  customImages?: Record<string, string>;
}

interface RichVideoModel {
  id: string;
  handle: string;
  creatorName: string;
  caption: string;
  hashtags: string[];
  duration: string;
  likes: string;
  comments: string;
  saves: string;
  shares: string;
  soundTitle: string;
  category: string;
  fileSize: string;
  resolution: string;
  fps: string;
  gradientBg: string;
  transcriptTimeline: {
    time: string;
    text: string;
    isKeyMoment?: boolean;
  }[];
}

const RICH_VIDEOS: RichVideoModel[] = [
  {
    id: 'item-2',
    handle: 'MUESTRA A',
    creatorName: 'Muestra sintética A',
    caption: 'Ficha de ejemplo para ilustrar cómo se presenta un video guardado.',
    hashtags: ['#demostración', '#datos-sintéticos'],
    duration: '00:52',
    likes: '—', comments: '—', saves: '—', shares: '—',
    soundTitle: 'Audio de demostración · sin medio real',
    category: 'Ejemplo sintético', fileSize: 'muestra', resolution: 'muestra', fps: 'no medido',
    gradientBg: 'from-[#450a0a] via-[#1c0606] to-[#0a0505]',
    transcriptTimeline: [
      { time: '00:04', text: 'Texto de ejemplo para mostrar una transcripción.' },
      { time: '00:14', text: 'Este fragmento es sintético y no procede de un video real.', isKeyMoment: true },
      { time: '00:26', text: 'La disponibilidad de transcripción depende del trabajo procesado.' },
    ],
  },
  {
    id: 'item-3',
    handle: 'MUESTRA B',
    creatorName: 'Muestra sintética B',
    caption: 'Un ejemplo sin contenido personal para revisar el diseño del catálogo.',
    hashtags: ['#demostración'],
    duration: '00:58',
    likes: '—', comments: '—', saves: '—', shares: '—',
    soundTitle: 'Audio de demostración · sin medio real',
    category: 'Ejemplo sintético', fileSize: 'muestra', resolution: 'muestra', fps: 'no medido',
    gradientBg: 'from-[#3a200a] via-[#1a1005] to-[#080503]',
    transcriptTimeline: [
      { time: '00:06', text: 'Ejemplo de segmento de transcripción.' },
      { time: '00:22', text: 'Fragmento ilustrativo con marca de tiempo.', isKeyMoment: true },
      { time: '00:38', text: 'El contenido real depende de la fuente procesada.' },
    ],
  },
  {
    id: 'item-1',
    handle: 'MUESTRA C',
    creatorName: 'Muestra sintética C',
    caption: 'Este registro de muestra sirve solo para recorrer el componente.',
    hashtags: ['#demostración'],
    duration: '00:32',
    likes: '—', comments: '—', saves: '—', shares: '—',
    soundTitle: 'Audio de demostración · sin medio real',
    category: 'Ejemplo sintético', fileSize: 'muestra', resolution: 'muestra', fps: 'no medido',
    gradientBg: 'from-[#0a233b] via-[#04111f] to-[#02060b]',
    transcriptTimeline: [
      { time: '00:02', text: 'Fragmento sintético para mostrar el panel de transcripción.' },
      { time: '00:11', text: 'El resaltado de segmento es solo una demostración visual.', isKeyMoment: true },
      { time: '00:22', text: 'No se incluyen medios de usuario en este sitio.' },
    ],
  },
];

export const LibrarySection: React.FC<LibrarySectionProps> = ({
  items,
  onOpenFicha,
}) => {
  const [selectedVideoId, setSelectedVideoId] = useState<string>('item-2');
  const [activeTab, setActiveTab] = useState<'transcript' | 'metadata' | 'export'>('transcript');
  const [isLiked, setIsLiked] = useState<boolean>(true);
  const [isSaved, setIsSaved] = useState<boolean>(true);

  const currentVideo =
    RICH_VIDEOS.find((v) => v.id === selectedVideoId) || RICH_VIDEOS[0];

  return (
    <section
      className="relative py-28 sm:py-36 bg-[#050508] text-white border-b border-white/[0.08]"
      id="biblioteca"
      data-nav="dark"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        {/* Cabecera Editorial — Sin píldoras, tipografía directa */}
        <div className="max-w-3xl mb-14 sm:mb-16">
          <span className="text-[11px] font-mono tracking-[0.24em] uppercase text-[#25F4EE] block mb-4">
            Vista de ejemplo · datos sintéticos
          </span>

          <h2 className="text-3xl sm:text-5xl lg:text-[48px] font-bold tracking-tight text-white leading-[1.08] mb-6">
            Un vistazo a cómo la aplicación organiza una biblioteca audiovisual local.
          </h2>

          <p className="text-base sm:text-lg text-white/70 leading-relaxed font-normal">
            Los paneles siguientes son una maqueta interactiva: no contienen videos, cuentas,
            estadísticas ni transcripciones reales. La biblioteca auténtica está en la aplicación
            de escritorio, no en esta página pública.
          </p>
        </div>

        {/* Chasis de Trabajo de Estudio */}
        <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#07070a]">
          {/* Barra Superior */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-[#090a0f] border-b border-white/10 text-xs font-mono">
            <div className="flex items-center gap-2 text-white/80 font-medium">
              <span className="font-bold text-white">Pulsaria</span>
              <span className="text-white/30">/</span>
              <span className="text-[#25F4EE]">{currentVideo.category}</span>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-white/50">
              <span className="text-white/80">Vista web · datos de muestra</span>
              <span className="hidden sm:inline-block text-white/30">|</span>
              <span className="hidden sm:inline-block text-white/60">Muestra sintética</span>
            </div>
          </div>

          {/* Área de Trabajo de 3 Columnas: Colecciones | Reproductor 9:16 TikTok | Inspector Whisper */}
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[560px]">
            {/* Columna 1: Explorador de Colecciones */}
            <div className="lg:col-span-3 border-r border-white/10 p-5 bg-[#08080c] flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-3">
                  Videos en esta colección
                </div>

                <div className="space-y-2 font-mono">
                  {RICH_VIDEOS.map((v) => {
                    const isSelected = v.id === selectedVideoId;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVideoId(v.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-[#151722] border-[#25F4EE] text-white'
                            : 'bg-transparent border-white/5 hover:border-white/15 text-white/70 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-[#25F4EE]">{v.handle}</span>
                          <span className="text-[10px] text-white/40">{v.duration}</span>
                        </div>
                        <p className="text-xs line-clamp-2 leading-snug mb-2 font-sans font-normal text-white/85">
                          {v.caption}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-white/50">
                          <span>{v.fileSize}</span>
                          <span>·</span>
                          <span className="text-emerald-400">ejemplo</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 text-[11px] font-mono text-white/45">
                Esta maqueta no carga ni reproduce medios reales.
              </div>
            </div>

            {/* Columna 2: Reproductor 9:16 con Elementos UI de TikTok */}
            <div className="lg:col-span-5 p-6 sm:p-8 flex items-center justify-center bg-[#050507] relative overflow-hidden">
              <div className="w-full max-w-[300px] aspect-[9/16] rounded-2xl bg-black border border-white/15 overflow-hidden relative flex flex-col justify-between">
                <div className={`absolute inset-0 bg-gradient-to-b ${currentVideo.gradientBg} opacity-90`} />

                {/* Insignia Superior */}
                <div className="relative z-10 p-3 flex items-center justify-between text-xs font-mono">
                  <span className="text-[10px] text-white/70 font-semibold bg-black/60 px-2 py-0.5 rounded">
                    {currentVideo.resolution}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold bg-black/60 px-2 py-0.5 rounded">
                    {currentVideo.fps}
                  </span>
                </div>

                <div className="relative z-10 m-auto max-w-[78%] rounded-xl border border-white/15 bg-black/65 px-4 py-3 text-center">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-[#25F4EE]">Vista ilustrativa</span>
                  <span className="mt-1 block text-xs text-white/75">Sin video ni audio reales</span>
                </div>

                {/* Acciones TikTok Flotantes */}
                <div className="absolute right-3 bottom-16 z-20 flex flex-col items-center gap-3 text-white">
                  <button
                    type="button"
                    onClick={() => setIsLiked(!isLiked)}
                    className="flex flex-col items-center"
                  >
                    <HeartIcon className="w-6 h-6 text-[#FE2C55]" liked={isLiked} />
                    <span className="text-[9px] font-mono text-white/90">{currentVideo.likes}</span>
                  </button>

                  <div className="flex flex-col items-center text-white/80">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.03 2 11c0 2.87 1.5 5.43 3.86 7.02-.13.82-.47 2.05-1.29 3.2-.23.33-.03.78.36.78 1.95 0 4.14-.94 5.37-1.85.55.1 1.12.15 1.7.15 5.52 0 10-4.03 10-9s-4.48-9-10-9z" />
                    </svg>
                    <span className="text-[9px] font-mono text-white/90">{currentVideo.comments}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsSaved(!isSaved)}
                    className="flex flex-col items-center text-[#25F4EE]"
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                    </svg>
                    <span className="text-[9px] font-mono text-white/90">{currentVideo.saves}</span>
                  </button>
                </div>

                {/* Pie del Video */}
                <div className="relative z-10 p-3 bg-gradient-to-t from-black via-black/80 to-transparent">
                  <div className="font-bold text-xs text-white mb-1">
                    {currentVideo.handle}
                  </div>
                  <p className="text-[11px] text-white/90 line-clamp-2 leading-tight mb-2">
                    {currentVideo.caption}
                  </p>
                  <div className="text-[10px] text-white/60 font-mono mb-2 truncate">
                    ♫ {currentVideo.soundTitle}
                  </div>

                  <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#25F4EE] to-[#FE2C55] w-2/3" />
                  </div>
                </div>
              </div>
            </div>

            {/* Columna 3: Inspector de Transcripción Whisper & Datos */}
            <div className="lg:col-span-4 p-6 border-l border-white/10 bg-[#08080c] flex flex-col justify-between">
              <div>
                <div className="flex border-b border-white/10 pb-3 mb-5 gap-4 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab('transcript')}
                    className={`pb-1 transition-all ${
                      activeTab === 'transcript'
                        ? 'text-[#25F4EE] font-bold border-b-2 border-[#25F4EE]'
                        : 'text-white/40 hover:text-white'
                    }`}
                  >
                    Transcripción
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('metadata')}
                    className={`pb-1 transition-all ${
                      activeTab === 'metadata'
                        ? 'text-[#25F4EE] font-bold border-b-2 border-[#25F4EE]'
                        : 'text-white/40 hover:text-white'
                    }`}
                  >
                    Metadatos
                  </button>
                </div>

                {activeTab === 'transcript' ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">
                      Transcripción ilustrativa
                    </div>
                    {currentVideo.transcriptTimeline.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border ${
                          item.isKeyMoment
                            ? 'bg-white/[0.04] border-[#25F4EE]/40 text-white'
                            : 'border-white/5 text-white/70'
                        }`}
                      >
                        <div className="text-[10px] text-[#25F4EE] mb-1">
                          [{item.time}]
                        </div>
                        <p className="leading-relaxed">{item.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-white/40">Resolución:</span>
                      <span className="text-white">{currentVideo.resolution}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-white/40">Frecuencia:</span>
                      <span className="text-white">{currentVideo.fps}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-white/40">Tamaño en Disco:</span>
                      <span className="text-white">{currentVideo.fileSize}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-white/40">Estado de muestra:</span>
                      <span className="text-white">datos sintéticos</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-white/10 text-xs font-mono text-white/40 flex justify-between">
                <span>Biblioteca de muestra</span>
                <span className="text-[#25F4EE]">Sin medios reales</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
