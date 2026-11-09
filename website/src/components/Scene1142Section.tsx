import React, { useEffect, useRef, useState, useCallback } from 'react';

type ItemType = 'like' | 'save' | 'repost' | 'note';

interface ThoughtItem {
  type: ItemType;
  t: string;
  a: string;
}

const ICON: Record<ItemType, (s: number) => string> = {
  like: (s) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  save: (s) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3.5 7 3.5V5c0-1.1-.9-2-2-2z"/></svg>`,
  repost: (s) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  note: (s) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3" fill="currentColor" stroke="none"/><circle cx="18" cy="16" r="3" fill="currentColor" stroke="none"/></svg>`,
};

const COLOR: Record<ItemType, string> = {
  like: '#fe2c55',
  save: '#ffd43b',
  repost: '#25f4ee',
  note: '#25f4ee',
};

const LABEL: Record<ItemType, string> = {
  like: 'LIKE',
  save: 'GUARDAR',
  repost: 'REPOSTEAR',
  note: 'PULSARIA',
};

const E: Record<'like' | 'save' | 'repost', Array<{ t: string; a: string }>> = {
  like: [
    {
      t: '🍳 Di like a la receta de tortillas... total, nunca la voy a hacer pero se veía fácil.',
      a: 'Mañana empiezo la dieta.',
    },
    {
      t: '🐕 El perro saludando con la pata me ganó... yo también quiero que alguien llegue a casa así.',
      a: 'Solo yo sé por qué.',
    },
    {
      t: '📚 Le di like al tutorial de Excel... como si fuera a verlo otra vez en mi vida.',
      a: 'Me gusta creer que cambiaré.',
    },
    {
      t: '🎵 Esa canción me gustó tanto que la busqué 3 veces... y sigo sin saber el nombre.',
      a: 'Así es mi memoria.',
    },
    {
      t: '😂 El meme era literalmente yo un lunes... sin filtro, sin edición, sin ganas de nada.',
      a: 'Yo me entiendo perfecto.',
    },
  ],
  save: [
    {
      t: '💼 Guardé el template de CV... como si mañana fuera a sentarme a hacerlo de verdad.',
      a: 'Me lo prometo a mí mismo.',
    },
    {
      t: '🧘 Guardé la rutina de yoga... para el día que decida cambiar mi vida a las 6am.',
      a: 'Nunca va a llegar ese día.',
    },
    {
      t: '🍝 El hack de cocina para cuando viva solo... ya vivo solo y sigo pidiendo delivery.',
      a: 'Me conozco demasiado bien.',
    },
    {
      t: '💰 Los tips de ahorro... como si ver el video me hiciera gastar menos.',
      a: 'Yo sé cómo funciono.',
    },
    {
      t: '📖 Guardé el booktok completo... total, voy a seguir scrolleando en vez de leer.',
      a: 'Me tengo paciencia.',
    },
  ],
  repost: [
    {
      t: '🔄 Reposteé el meme sin contexto... porque yo sé lo que significa, nadie más.',
      a: 'Mi humor es para mí.',
    },
    {
      t: '🎶 La canción random para que vean que tengo gustos... aunque nadie me va a preguntar.',
      a: 'Me hago espacio así.',
    },
    {
      t: '🏆 Reposteo para que se note que lo vi primero... yo compito conmigo mismo.',
      a: 'Yo contra mi feed.',
    },
    {
      t: '📱 El clip gracioso tres veces... porque yo soy mi propia audiencia.',
      a: 'Me guardo en mi timeline.',
    },
    {
      t: '🎭 Reposteo la frase profunda... como si yo fuera así en la vida real.',
      a: 'Me proyecto lo que quiero ser.',
    },
  ],
};

const INTRO: ThoughtItem = {
  type: 'note',
  t: '📱 Abro TikTok a las 11pm... y cuando miro la hora son las 3am.',
  a: 'Así empieza otra noche.',
};

const CLOSE: ThoughtItem = {
  type: 'note',
  t: '💭 Quince videos después sigo sin recordar nada... solo sé que pasaron 4 horas.',
  a: 'Mi memoria es así.',
};

function buildSequence(): ThoughtItem[] {
  const bag: Array<'like' | 'save' | 'repost'> = [];
  const seq: ThoughtItem[] = [];
  const ix = { like: 0, save: 0, repost: 0 };

  for (let i = 0; i < 15; i++) {
    if (!bag.length) {
      bag.push('like', 'save', 'repost');
      for (let j = 2; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [bag[j], bag[k]] = [bag[k], bag[j]];
      }
    }
    const ty = bag.pop()!;
    const e = E[ty][ix[ty]++];
    seq.push({ type: ty, t: e.t, a: e.a });
  }
  return seq;
}

export const Scene1142Section: React.FC = () => {
  const [ALL] = useState<ThoughtItem[]>(() => {
    const seq = buildSequence();
    return [INTRO, ...seq, CLOSE];
  });

  const TOTAL = ALL.length;
  const [baseTime] = useState<number>(() => Date.now());
  const [pos, setPos] = useState<number>(0);

  const posRef = useRef<number>(0);
  posRef.current = pos;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const clockPrevRef = useRef<HTMLDivElement | null>(null);
  const clockActiveRef = useRef<HTMLDivElement | null>(null);
  const clockNextRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sIRef = useRef<HTMLSpanElement | null>(null);
  const sLRef = useRef<HTMLSpanElement | null>(null);
  const typedRef = useRef<HTMLSpanElement | null>(null);
  const caretRef = useRef<HTMLSpanElement | null>(null);

  const animatingRef = useRef<boolean>(false);
  const swapRef = useRef<NodeJS.Timeout | null>(null);
  const typeGenRef = useRef<number>(0);
  const typingTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  const clearTypingTimeouts = useCallback(() => {
    typingTimeoutsRef.current.forEach((tid) => clearTimeout(tid));
    typingTimeoutsRef.current = [];
  }, []);

  const timeStr = useCallback(
    (idx: number): string => {
      if (idx < 0 || idx >= TOTAL) return '';
      const d = new Date(baseTime + idx * 60000);
      const h = String(d.getHours() % 12 || 12).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    },
    [baseTime, TOTAL]
  );

  const updateClocks = useCallback(() => {
    const curr = posRef.current;
    if (clockPrevRef.current) clockPrevRef.current.textContent = timeStr(curr - 1);
    if (clockActiveRef.current) clockActiveRef.current.textContent = timeStr(curr);
    if (clockNextRef.current) clockNextRef.current.textContent = timeStr(curr + 1);
  }, [timeStr]);

  const fit = useCallback(() => {
    const wrapEl = wrapRef.current;
    const txtEl = wrapEl?.querySelector('#thoughtText') as HTMLElement | null;
    if (!wrapEl || !txtEl) return;

    const currPos = posRef.current;
    const s = ALL[currPos];
    if (!s) return;

    const totalLen = s.t.length + s.a.length;
    const baseFs = Math.min(36, Math.max(19, window.innerWidth * 0.026));
    const targetFs = totalLen > 115 ? Math.max(18, baseFs - 4) : baseFs;
    txtEl.style.fontSize = `${targetFs}px`;
  }, [ALL]);

  const paintThought = useCallback(
    (animate = true) => {
      const sI = sIRef.current;
      const sL = sLRef.current;
      const typed = typedRef.current;
      const caret = caretRef.current;
      if (!sI || !sL || !typed || !caret) return;

      const currPos = posRef.current;
      const s = ALL[currPos];
      if (!s) return;

      sI.innerHTML = ICON[s.type](22);
      sI.style.color = COLOR[s.type];
      sL.textContent = LABEL[s.type];
      sL.style.color = COLOR[s.type];

      // Fijar tamaño de fuente de forma estable y única antes de escribir
      fit();

      clearTypingTimeouts();
      const gen = ++typeGenRef.current;
      typed.innerHTML = '';

      if (!animate) {
        typed.innerHTML = `${s.t} <span class="accent">${s.a}</span>`;
        return;
      }

      caret.classList.remove('hidden');

      const wordsT = s.t.trim().split(/\s+/);
      const wordsA = s.a.trim().split(/\s+/);
      const tokens: Array<{ w: string; cls: string | null }> = [];
      wordsT.forEach((w) => tokens.push({ w, cls: null }));
      wordsA.forEach((w) => tokens.push({ w, cls: 'accent' }));

      let i = 0;
      let accentSpan: HTMLSpanElement | null = null;

      const pauseFor = (w: string, isAccentStart: boolean): number => {
        if (isAccentStart) return 180;
        if (/\.\.\./.test(w)) return 110;
        if (/[,;:]/.test(w)) return 55;
        if (/[.!?]$/.test(w)) return 70;
        return 22 + Math.random() * 18;
      };

      const typeNext = () => {
        if (gen !== typeGenRef.current) return;
        if (i >= tokens.length) {
          const tid = setTimeout(() => {
            if (gen === typeGenRef.current) {
              caret.classList.add('hidden');
              // Transición automática al siguiente pensamiento tras una pausa de lectura
              const autoAdvanceTid = setTimeout(() => {
                if (gen === typeGenRef.current) {
                  step(1);
                }
              }, 2800);
              typingTimeoutsRef.current.push(autoAdvanceTid);
            }
          }, 350);
          typingTimeoutsRef.current.push(tid);
          return;
        }

        const tk = tokens[i];
        const isAccentStart = tk.cls === 'accent' && i === wordsT.length;

        const span = document.createElement('span');
        span.className = 'w' + (tk.cls ? ' ' + tk.cls : '');
        span.textContent = tk.w + (i < tokens.length - 1 ? '\u00A0' : '');

        if (tk.cls === 'accent') {
          if (!accentSpan) {
            accentSpan = document.createElement('span');
            accentSpan.className = 'accent';
            typed.appendChild(accentSpan);
          }
          accentSpan.appendChild(span);
        } else {
          typed.appendChild(span);
        }

        i++;
        const pause = pauseFor(tk.w, isAccentStart);
        const tid = setTimeout(typeNext, pause);
        typingTimeoutsRef.current.push(tid);
      };

      typeNext();
    },
    [ALL, clearTypingTimeouts, fit]
  );

  const render = useCallback(
    (dir: number) => {
      if (animatingRef.current) return;
      animatingRef.current = true;

      if (swapRef.current) clearTimeout(swapRef.current);
      typeGenRef.current++;
      clearTypingTimeouts();

      const clockNext = clockNextRef.current;
      const clockPrev = clockPrevRef.current;
      const wrap = wrapRef.current;
      const track = trackRef.current;
      const sI = sIRef.current;

      const curr = posRef.current;
      if (dir > 0 && clockNext) clockNext.textContent = timeStr(curr);
      else if (clockPrev) clockPrev.textContent = timeStr(curr);

      if (wrap) {
        wrap.classList.remove('out-up', 'out-down');
        wrap.classList.add(dir > 0 ? 'out-up' : 'out-down');
      }

      if (track) {
        track.style.transition = 'transform .18s cubic-bezier(.22,.9,.25,1)';
        track.style.transform = dir > 0 ? 'translateY(-200%)' : 'translateY(0%)';
      }

      swapRef.current = setTimeout(() => {
        if (track) {
          track.style.transition = 'none';
          track.style.transform = 'translateY(-100%)';
        }
        updateClocks();
        if (track) {
          void track.offsetHeight;
          track.style.transition = 'transform .18s cubic-bezier(.22,.9,.25,1)';
        }

        paintThought(true);

        if (sI) {
          sI.classList.remove('pop');
          void sI.offsetWidth;
          sI.classList.add('pop');
        }

        if (wrap) {
          wrap.classList.remove('out-up', 'out-down');
        }

        setTimeout(() => {
          animatingRef.current = false;
        }, 80);
      }, 200);
    },
    [clearTypingTimeouts, paintThought, timeStr, updateClocks]
  );

  const step = useCallback(
    (dir: number) => {
      const current = posRef.current;
      let p = current + dir;
      if (p >= TOTAL) p = 0;
      else if (p < 0) p = TOTAL - 1;
      posRef.current = p;
      setPos(p);
      render(dir);
    },
    [TOTAL, render]
  );

  // Inicialización y eventos
  useEffect(() => {
    updateClocks();
    paintThought(true);
    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = 'translateY(-100%)';
    }

    const handleResize = () => fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (swapRef.current) clearTimeout(swapRef.current);
      clearTypingTimeouts();
    };
  }, [fit, paintThought, updateClocks, clearTypingTimeouts]);

  return (
    <section
      className="cintilla-section darkbg"
      id="cintilla"
      data-nav="dark"
      aria-label="Pulsaria — Secuencia autónoma y diálogo interior"
    >
      <main id="stage" ref={stageRef}>
        <section>
          <div id="reel">
            <div id="reelTrack" ref={trackRef}>
              <div className="cell">
                <div className="cellBox side" id="boxPrev">
                  <div className="clock" id="clockPrev" ref={clockPrevRef} />
                </div>
              </div>
              <div className="cell">
                <div className="cellBox active" id="boxActive">
                  <div className="clock" id="clockActive" ref={clockActiveRef} />
                </div>
              </div>
              <div className="cell">
                <div className="cellBox side" id="boxNext">
                  <div className="clock" id="clockNext" ref={clockNextRef} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="thoughtSide">
          <div id="frame" ref={frameRef}>
            <div id="thoughtWrap" ref={wrapRef}>
              <div id="stamp">
                <span id="stampIcon" ref={sIRef} />
                <span id="stampLabel" ref={sLRef} />
              </div>
              <p id="thoughtText">
                <span id="typed" ref={typedRef} />
                <span id="caret" ref={caretRef} />
              </p>
            </div>
          </div>
        </section>
      </main>
    </section>
  );
};
