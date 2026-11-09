import React, { useState } from 'react';
import {
  SearchGlyphIcon,
  AstroCompassIcon,
  HeartIcon,
} from './SvgIcons';

interface SearchSectionProps {
  onOpenPalette: () => void;
}

interface WordToken {
  word: string;
  start: number; // in seconds
  end: number;
  isHit?: boolean;
}

interface MatchCase {
  id: string;
  tag: string;
  userQuery: string;
  videoHandle: string;
  soundTitle: string;
  category: string;
  gradientBg: string;
  durationSec: number;
  totalDurationFormatted: string;
  hitTimestamp: string;
  hitSecond: number;
  matchIndex: number;
  totalMatches: number;
  semanticTokens: {
    queryWord: string;
    spokenWord: string;
    similarity: number;
  }[];
  sentenceSegments: {
    time: string;
    sec: number;
    tokens: WordToken[];
  }[];
  technicalInsight: string;
}

const SEARCH_CASES: MatchCase[] = [
  {
    id: 'cocina',
    tag: 'Idea Difusa · Sin palabras coincidentes',
    userQuery: 'receta para cuando abres el refri y no tienes despensa',
    videoHandle: 'Muestra A',
    soundTitle: 'Audio de demostración · sin medio real',
    category: 'Cocina & Técnicas Tradicionales',
    gradientBg: 'from-[#381c08] via-[#1a0c04] to-[#080402]',
    durationSec: 64,
    totalDurationFormatted: '01:04',
    hitTimestamp: '00:14.28',
    hitSecond: 14.28,
    matchIndex: 1,
    totalMatches: 2,
    semanticTokens: [
      { queryWord: 'despensa', spokenWord: 'alacena', similarity: 97.4 },
      { queryWord: 'refri vacío', spokenWord: 'casi nada', similarity: 93.1 },
      { queryWord: 'receta', spokenWord: 'manjar de domingo', similarity: 89.6 },
    ],
    sentenceSegments: [
      {
        time: '00:06.10',
        sec: 6.1,
        tokens: [
          { word: 'Miren', start: 6.1, end: 6.5 },
          { word: 'bien,', start: 6.5, end: 6.9 },
          { word: 'no', start: 7.0, end: 7.2 },
          { word: 'se', start: 7.2, end: 7.4 },
          { word: 'compliquen', start: 7.4, end: 8.1 },
          { word: 'la', start: 8.1, end: 8.3 },
          { word: 'vida', start: 8.3, end: 8.7 },
          { word: 'entre', start: 8.7, end: 9.0 },
          { word: 'semana.', start: 9.0, end: 9.6 },
        ],
      },
      {
        time: '00:14.28',
        sec: 14.28,
        tokens: [
          { word: '«Si', start: 14.28, end: 14.5 },
          { word: 'hoy', start: 14.5, end: 14.7 },
          { word: 'no', start: 14.7, end: 14.9 },
          { word: 'hay', start: 14.9, end: 15.1 },
          { word: 'casi', start: 15.1, end: 15.4, isHit: true },
          { word: 'nada', start: 15.4, end: 15.8, isHit: true },
          { word: 'en', start: 15.8, end: 16.0 },
          { word: 'la', start: 16.0, end: 16.2 },
          { word: 'alacena,', start: 16.2, end: 16.9, isHit: true },
          { word: 'pon', start: 17.0, end: 17.2 },
          { word: 'dos', start: 17.2, end: 17.4 },
          { word: 'huevos', start: 17.4, end: 17.8, isHit: true },
          { word: 'al', start: 17.8, end: 18.0 },
          { word: 'sartén', start: 18.0, end: 18.4 },
          { word: 'con', start: 18.4, end: 18.6 },
          { word: 'cebolla', start: 18.6, end: 19.1, isHit: true },
          { word: 'dorada', start: 19.1, end: 19.6, isHit: true },
          { word: 'despacio', start: 19.6, end: 20.2 },
          { word: 'a', start: 20.2, end: 20.3 },
          { word: 'fuego', start: 20.3, end: 20.7 },
          { word: 'bajo', start: 20.7, end: 21.1 },
          { word: 'y', start: 21.1, end: 21.3 },
          { word: 'tienes', start: 21.3, end: 21.6 },
          { word: 'un', start: 21.6, end: 21.8 },
          { word: 'manjar', start: 21.8, end: 22.4, isHit: true },
          { word: 'digno', start: 22.4, end: 22.8 },
          { word: 'de', start: 22.8, end: 23.0 },
          { word: 'domingo.»', start: 23.0, end: 23.8 },
        ],
      },
      {
        time: '00:26.50',
        sec: 26.5,
        tokens: [
          { word: 'Tapan', start: 26.5, end: 26.9 },
          { word: 'el', start: 26.9, end: 27.1 },
          { word: 'comal', start: 27.1, end: 27.5 },
          { word: 'dos', start: 27.5, end: 27.8 },
          { word: 'minutos', start: 27.8, end: 28.4 },
          { word: 'para', start: 28.4, end: 28.6 },
          { word: 'que', start: 28.6, end: 28.8 },
          { word: 'la', start: 28.8, end: 29.0 },
          { word: 'yema', start: 29.0, end: 29.4 },
          { word: 'quede', start: 29.4, end: 29.8 },
          { word: 'tiernita.', start: 29.8, end: 30.5 },
        ],
      },
    ],
    technicalInsight: 'Consulta y fragmento inventados para ilustrar el formato. Esta página no ejecuta una búsqueda en Pulsaria.',
  },
  {
    id: 'trompo',
    tag: 'Cita Literal Fonética · Dicha al vuelo',
    userQuery: 'el trompo nunca deja de girar si se detiene pierde',
    videoHandle: 'Muestra B',
    soundTitle: 'Audio de demostración · sin medio real',
    category: 'Oficio & Cocina Urbana',
    gradientBg: 'from-[#420a0a] via-[#1a0505] to-[#070202]',
    durationSec: 48,
    totalDurationFormatted: '00:48',
    hitTimestamp: '00:11.40',
    hitSecond: 11.4,
    matchIndex: 1,
    totalMatches: 3,
    semanticTokens: [
      { queryWord: 'trompo', spokenWord: 'trompo', similarity: 100 },
      { queryWord: 'nunca deja', spokenWord: 'nunca deja', similarity: 100 },
      { queryWord: 'pierde', spokenWord: 'pierde su jugo', similarity: 98.2 },
    ],
    sentenceSegments: [
      {
        time: '00:04.20',
        sec: 4.2,
        tokens: [
          { word: 'Chequen', start: 4.2, end: 4.7 },
          { word: 'la', start: 4.7, end: 4.9 },
          { word: 'lumbre', start: 4.9, end: 5.4 },
          { word: 'del', start: 5.4, end: 5.6 },
          { word: 'pastor,', start: 5.6, end: 6.2 },
          { word: 'pura', start: 6.2, end: 6.5 },
          { word: 'leña', start: 6.5, end: 6.9 },
          { word: 'de', start: 6.9, end: 7.1 },
          { word: 'encino.', start: 7.1, end: 7.7 },
        ],
      },
      {
        time: '00:11.40',
        sec: 11.4,
        tokens: [
          { word: '«El', start: 11.4, end: 11.6, isHit: true },
          { word: 'trompo', start: 11.6, end: 12.1, isHit: true },
          { word: 'nunca', start: 12.1, end: 12.4, isHit: true },
          { word: 'deja', start: 12.4, end: 12.7, isHit: true },
          { word: 'de', start: 12.7, end: 12.9, isHit: true },
          { word: 'girar;', start: 12.9, end: 13.4, isHit: true },
          { word: 'si', start: 13.5, end: 13.7, isHit: true },
          { word: 'se', start: 13.7, end: 13.9, isHit: true },
          { word: 'detiene', start: 13.9, end: 14.4, isHit: true },
          { word: 'un', start: 14.4, end: 14.6 },
          { word: 'minuto,', start: 14.6, end: 15.1 },
          { word: 'la', start: 15.1, end: 15.3 },
          { word: 'capa', start: 15.3, end: 15.7 },
          { word: 'exterior', start: 15.7, end: 16.2 },
          { word: 'pierde', start: 16.2, end: 16.6, isHit: true },
          { word: 'su', start: 16.6, end: 16.8 },
          { word: 'jugo', start: 16.8, end: 17.2, isHit: true },
          { word: 'y', start: 17.2, end: 17.4 },
          { word: 'se', start: 17.4, end: 17.6 },
          { word: 'reseca.', start: 17.6, end: 18.2 },
        ],
      },
      {
        time: '00:22.00',
        sec: 22.0,
        tokens: [
          { word: 'El', start: 22.0, end: 22.2 },
          { word: 'corte', start: 22.2, end: 22.6 },
          { word: 'es', start: 22.6, end: 22.8 },
          { word: 'de', start: 22.8, end: 23.0 },
          { word: 'arriba', start: 23.0, end: 23.4 },
          { word: 'hacia', start: 23.4, end: 23.7 },
          { word: 'abajo,', start: 23.7, end: 24.2 },
          { word: 'tortilla', start: 24.2, end: 24.7 },
          { word: 'doble', start: 24.7, end: 25.1 },
          { word: 'y', start: 25.1, end: 25.3 },
          { word: 'cilantro.', start: 25.3, end: 26.0 },
        ],
      },
    ],
    technicalInsight: 'Ejemplo sintético de una búsqueda textual. No es una transcripción ni una medición de precisión.',
  },
  {
    id: 'neuro',
    tag: 'Concepto Abstracto · Memoria Inconsciente',
    userQuery: 'por qué una canción vieja te hace recordar cosas olvidadas',
    videoHandle: 'Muestra C',
    soundTitle: 'Audio de demostración · sin medio real',
    category: 'Divulgación Científica',
    gradientBg: 'from-[#0a233b] via-[#04111f] to-[#02060b]',
    durationSec: 72,
    totalDurationFormatted: '01:12',
    hitTimestamp: '00:28.15',
    hitSecond: 28.15,
    matchIndex: 1,
    totalMatches: 2,
    semanticTokens: [
      { queryWord: 'canción vieja', spokenWord: 'estímulo auditivo', similarity: 91.5 },
      { queryWord: 'recordar', spokenWord: 'memoria episódica', similarity: 96.2 },
      { queryWord: 'olvidadas', spokenWord: 'hipocampo profundo', similarity: 94.0 },
    ],
    sentenceSegments: [
      {
        time: '00:12.00',
        sec: 12.0,
        tokens: [
          { word: 'Todos', start: 12.0, end: 12.4 },
          { word: 'hemos', start: 12.4, end: 12.7 },
          { word: 'sentido', start: 12.7, end: 13.2 },
          { word: 'ese', start: 13.2, end: 13.5 },
          { word: 'escalofrío', start: 13.5, end: 14.3 },
          { word: 'en', start: 14.3, end: 14.5 },
          { word: 'el', start: 14.5, end: 14.7 },
          { word: 'pecho.', start: 14.7, end: 15.3 },
        ],
      },
      {
        time: '00:28.15',
        sec: 28.15,
        tokens: [
          { word: '«La', start: 28.15, end: 28.35 },
          { word: 'corteza', start: 28.35, end: 28.85, isHit: true },
          { word: 'auditiva', start: 28.85, end: 29.45, isHit: true },
          { word: 'está', start: 29.45, end: 29.75 },
          { word: 'conectada', start: 29.75, end: 30.4 },
          { word: 'sin', start: 30.4, end: 30.6 },
          { word: 'escalas', start: 30.6, end: 31.1 },
          { word: 'al', start: 31.1, end: 31.3 },
          { word: 'hipocampo,', start: 31.3, end: 32.1, isHit: true },
          { word: 'reactivando', start: 32.1, end: 32.8, isHit: true },
          { word: 'la', start: 32.8, end: 33.0 },
          { word: 'memoria', start: 33.0, end: 33.5, isHit: true },
          { word: 'episódica', start: 33.5, end: 34.2, isHit: true },
          { word: 'con', start: 34.2, end: 34.4 },
          { word: 'aromas', start: 34.4, end: 34.9 },
          { word: 'y', start: 34.9, end: 35.1 },
          { word: 'rostros', start: 35.1, end: 35.7 },
          { word: 'que', start: 35.7, end: 35.9 },
          { word: 'creías', start: 35.9, end: 36.4, isHit: true },
          { word: 'perdidos.»', start: 36.4, end: 37.2 },
        ],
      },
      {
        time: '00:44.00',
        sec: 44.0,
        tokens: [
          { word: 'Por', start: 44.0, end: 44.2 },
          { word: 'eso', start: 44.2, end: 44.5 },
          { word: 'la', start: 44.5, end: 44.7 },
          { word: 'música', start: 44.7, end: 45.2 },
          { word: 'es', start: 45.2, end: 45.4 },
          { word: 'el', start: 45.4, end: 45.6 },
          { word: 'ancla', start: 45.6, end: 46.0 },
          { word: 'más', start: 46.0, end: 46.3 },
          { word: 'fuerte.', start: 46.3, end: 47.0 },
        ],
      },
    ],
    technicalInsight: 'Ejemplo sintético para ilustrar una relación semántica. No es una recomendación ni un resultado real.',
  },
];

const AUDIO_WAVE_HEIGHTS = [
  18, 32, 54, 28, 70, 88, 42, 65, 94, 100, 82, 60, 35, 50, 78, 92, 85, 48,
  30, 62, 80, 96, 75, 42, 86, 92, 58, 36, 68, 82, 90, 72, 55, 38, 76, 88,
  70, 46, 32, 58, 74, 88, 64, 40, 24, 16,
];

export const SearchSection: React.FC<SearchSectionProps> = ({
  onOpenPalette,
}) => {
  const [selectedCaseId, setSelectedCaseId] = useState<string>('cocina');
  const [currentPlaySec, setCurrentPlaySec] = useState<number>(14.28);
  const [copiedQuote, setCopiedQuote] = useState<boolean>(false);

  const activeCase =
    SEARCH_CASES.find((c) => c.id === selectedCaseId) || SEARCH_CASES[0];

  const handleSelectCase = (id: string) => {
    const target = SEARCH_CASES.find((c) => c.id === id);
    if (target) {
      setSelectedCaseId(id);
      setCurrentPlaySec(target.hitSecond);
    }
  };

  const handleJumpToWord = (token: WordToken) => {
    setCurrentPlaySec(token.start);
  };

  const handleCopyQuoteWithTimestamp = () => {
    const fullText = activeCase.sentenceSegments
      .map((s) => s.tokens.map((t) => t.word).join(' '))
      .join(' ');
    const citation = `EJEMPLO SINTÉTICO — no es una cita real.\n«${fullText}»\n— Pulsaria, demostración, ${activeCase.hitTimestamp}.`;
    navigator.clipboard.writeText(citation);
    setCopiedQuote(true);
    setTimeout(() => setCopiedQuote(false), 2400);
  };

  const playheadPercent = Math.min(
    100,
    Math.max(0, (currentPlaySec / activeCase.durationSec) * 100)
  );

  return (
    <section
      className="relative py-28 sm:py-36 bg-[#040406] text-white border-b border-white/[0.08]"
      id="recuperas"
      data-nav="dark"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        {/* Cabecera Editorial — Sin píldoras/burbujas, tipografía directa */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-14">
          <div className="max-w-3xl">
            <span className="text-[11px] font-mono tracking-[0.24em] uppercase text-[#25F4EE] block mb-4">
              Búsqueda · interacción de demostración
            </span>

            <h2 className="text-3xl sm:text-5xl lg:text-[48px] font-bold tracking-tight text-white leading-[1.08] mb-6">
              Explora cómo puede verse una búsqueda sobre una biblioteca local.
            </h2>

            <p className="text-base sm:text-lg text-white/70 leading-relaxed font-normal">
              Los controles muestran resultados sintéticos para explicar la búsqueda literal y
              semántica. No consultan el escritorio ni reproducen medios reales. En Pulsaria, los
              resultados dependen de una biblioteca procesada y de los índices disponibles.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
            <button
              type="button"
              onClick={onOpenPalette}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white transition-all"
            >
              <SearchGlyphIcon className="w-3.5 h-3.5 text-[#25F4EE]" />
              <span>Buscador Global</span>
              <span className="text-white/40 text-[10px]">Cmd + K</span>
            </button>
          </div>
        </div>

        {/* Consola de Inspección Multimodal */}
        <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#07070a]">
          {/* Barra de Consulta */}
          <div className="p-6 bg-[#090a0f] border-b border-white/10">
            <div className="text-xs font-mono uppercase tracking-wider text-white/40 mb-3 flex items-center justify-between">
              <span>Consulta en Lenguaje Natural</span>
              <span className="text-emerald-400 font-semibold">
                Resultado simulado · sin consulta en vivo
              </span>
            </div>

            <div className="flex items-center bg-black/60 border border-white/15 rounded-xl px-4 py-3">
              <SearchGlyphIcon className="w-4 h-4 text-[#25F4EE] mr-3 shrink-0" />
              <div className="w-full text-white text-sm sm:text-base font-mono font-medium truncate">
                "{activeCase.userQuery}"
              </div>
              <span className="text-[#25F4EE] font-mono text-xs font-bold shrink-0 ml-2">
                ➔ {activeCase.hitTimestamp}
              </span>
            </div>

            {/* Selector de Casos */}
            <div className="flex flex-wrap items-center gap-2 mt-4 font-mono text-xs">
              <span className="text-white/40 mr-1 text-[11px]">Probar:</span>
              {SEARCH_CASES.map((c) => {
                const isSelected = selectedCaseId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCase(c.id)}
                    className={`px-3 py-1 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-[#25F4EE] text-black font-bold border-[#25F4EE]'
                        : 'bg-white/[0.03] text-white/70 hover:text-white border-white/10'
                    }`}
                  >
                    <span>{c.tag}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Área de Trabajo Dividida */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Columna Izquierda: Video 9:16 y Fotogramas */}
            <div className="lg:col-span-5 p-6 border-r border-white/10 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-4 text-white/70">
                  <div className="font-bold text-white">{activeCase.videoHandle}</div>
                  <span className="text-[11px] text-[#25F4EE]">
                    Resultado de muestra {activeCase.matchIndex} de {activeCase.totalMatches}
                  </span>
                </div>

                {/* Contenedor 9:16 */}
                <div className="w-full max-w-[270px] mx-auto aspect-[9/16] rounded-2xl bg-black border border-white/15 overflow-hidden relative flex flex-col justify-between">
                  <div className={`absolute inset-0 bg-gradient-to-b ${activeCase.gradientBg} opacity-95`} />

                  <div className="relative z-10 p-3 flex items-center justify-between text-xs font-mono">
                    <span className="text-[#25F4EE] font-bold text-[10px]">
                      {currentPlaySec.toFixed(2)}s
                    </span>
                    <span className="text-white/50 text-[10px]">muestra</span>
                  </div>

                  <div className="relative z-10 px-4 my-auto text-center">
                    <div className="p-3 rounded-xl bg-black/80 border border-white/15">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-[#25F4EE] block mb-1">
                        TRANSCRIPCIÓN DE MUESTRA
                      </span>
                      <p className="text-xs font-bold text-white leading-snug">
                        {activeCase.sentenceSegments[1]?.tokens
                          .map((t) => t.word)
                          .slice(0, 10)
                          .join(' ')}
                        ...
                      </p>
                    </div>
                  </div>

                  <div className="relative z-10 p-3 bg-gradient-to-t from-black via-black/80 to-transparent">
                    <div className="text-[11px] font-bold text-white mb-0.5 truncate">
                      {activeCase.videoHandle}
                    </div>
                    <div className="text-[10px] text-white/60 font-mono mb-2 truncate">
                      ♫ {activeCase.soundTitle}
                    </div>

                    <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#25F4EE] to-[#FE2C55]"
                        style={{ width: `${playheadPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Tira de Fotogramas */}
                <div className="mt-5 border-t border-white/10 pt-3">
                  <div className="flex items-center justify-between text-[10px] font-mono text-white/40 mb-2">
                    <span>MARCAS DE TIEMPO · MUESTRA</span>
                    <span className="text-[#25F4EE]">{activeCase.totalDurationFormatted}</span>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5 h-9 font-mono text-[9px]">
                    {['00:04', '00:11', '00:14', '00:26', '00:48'].map((timeLabel, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const seconds = idx === 2 ? activeCase.hitSecond : idx * 12;
                          setCurrentPlaySec(seconds);
                        }}
                        className={`h-full rounded flex items-center justify-center border transition-all ${
                          idx === 2
                            ? 'bg-[#25F4EE]/20 border-[#25F4EE] text-[#25F4EE] font-bold'
                            : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                        }`}
                      >
                        {timeLabel}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPlaySec(activeCase.hitSecond)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-white text-black font-bold text-xs hover:bg-neutral-200 transition-all text-center"
                >
                  Volver al punto de ejemplo
                </button>

                <button
                  type="button"
                  onClick={handleCopyQuoteWithTimestamp}
                  className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-mono text-white/80 transition-all"
                >
                  {copiedQuote ? 'Copiado' : 'Copiar Cita'}
                </button>
              </div>
            </div>

            {/* Columna Derecha: Transcripción Fonética Palabra por Palabra */}
            <div className="lg:col-span-7 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5 font-mono text-xs">
                  <div>
                    <span className="uppercase text-white/40 block text-[10px]">
                      Transcripción ilustrativa
                    </span>
                    <span className="text-white font-medium">
                      Marcas de tiempo de la demostración · sin audio real
                    </span>
                  </div>
                  <span className="text-emerald-400 font-bold">EJEMPLO SINTÉTICO</span>
                </div>

                {/* Espectrograma de Onda Acústica */}
                <div className="mb-6 p-3 rounded-xl bg-black/60 border border-white/10">
                  <div className="flex items-center justify-between text-[10px] font-mono text-white/40 mb-2">
                    <span>VISTA ILUSTRATIVA · SIN AUDIO REAL</span>
                    <span className="text-[#25F4EE]">Aguja: {currentPlaySec.toFixed(2)}s</span>
                  </div>

                  <div
                    className="h-12 flex items-center gap-1 cursor-pointer relative"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const ratio = clickX / rect.width;
                      setCurrentPlaySec(ratio * activeCase.durationSec);
                    }}
                  >
                    {AUDIO_WAVE_HEIGHTS.map((height, i) => {
                      const barRatio = i / AUDIO_WAVE_HEIGHTS.length;
                      const isNearCurrent =
                        Math.abs(barRatio - currentPlaySec / activeCase.durationSec) < 0.04;
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-full transition-all duration-150"
                          style={{
                            height: `${height}%`,
                            backgroundColor: isNearCurrent
                              ? '#25F4EE'
                              : 'rgba(255, 255, 255, 0.16)',
                          }}
                        />
                      );
                    })}

                    <div
                      className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none transition-all duration-100"
                      style={{ left: `${playheadPercent}%` }}
                    />
                  </div>
                </div>

                {/* Transcripción por Chunks */}
                <div className="space-y-3 font-mono text-xs max-h-[260px] overflow-y-auto pr-2">
                  {activeCase.sentenceSegments.map((segment, sIdx) => {
                    const isHitSentence = segment.sec === activeCase.hitSecond;
                    return (
                      <div
                        key={sIdx}
                        className={`p-3 rounded-xl border ${
                          isHitSentence
                            ? 'bg-white/[0.04] border-[#25F4EE]/40'
                            : 'bg-white/[0.01] border-white/5'
                        }`}
                      >
                        <div className="text-[10px] text-white/40 mb-1.5 flex justify-between">
                          <span>[{segment.time}]</span>
                          {isHitSentence && (
                            <span className="text-[#25F4EE] font-bold">EJEMPLO</span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1 leading-relaxed">
                          {segment.tokens.map((token, tIdx) => {
                            const isCurrentWord =
                              currentPlaySec >= token.start && currentPlaySec <= token.end;
                            return (
                              <button
                                key={tIdx}
                                type="button"
                                onClick={() => handleJumpToWord(token)}
                                className={`px-1.5 py-0.5 rounded transition-all ${
                                  isCurrentWord
                                    ? 'bg-white text-black font-extrabold'
                                    : token.isHit
                                    ? 'bg-[#25F4EE]/20 text-[#25F4EE] font-bold'
                                    : 'text-white/80 hover:bg-white/10'
                                }`}
                              >
                                {token.word}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Matriz Semántica */}
              <div className="mt-5 pt-4 border-t border-white/10 font-mono text-xs">
                <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2 flex justify-between">
                  <span>Equivalencias semánticas · muestra estática</span>
                  <span className="text-[#25F4EE]">ejemplo</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                  {activeCase.semanticTokens.map((st, idx) => (
                    <div
                      key={idx}
                      className="p-2 border border-white/10 rounded-lg flex flex-col justify-between"
                    >
                      <div className="flex justify-between text-white/40 text-[10px]">
                        <span>"{st.queryWord}"</span>
                        <span className="text-emerald-400 font-bold">muestra</span>
                      </div>
                      <span className="text-white font-semibold truncate mt-0.5">
                        ➔ "{st.spokenWord}"
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-2.5 text-[11px] text-white/40 leading-relaxed">
                  {activeCase.technicalInsight}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
