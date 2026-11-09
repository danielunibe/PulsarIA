import React, { useEffect, useRef } from 'react';

const LEAD_WORDS = [
  { text: 'Pulsaria', bold: true },
  { text: 'es' },
  { text: 'una' },
  { text: 'biblioteca' },
  { text: 'audiovisual' },
  { text: 'local-first:' },
  { text: 'conserva' },
  { text: 'medios,' },
  { text: 'transcripciones' },
  { text: 'y' },
  { text: 'referencias' },
  { text: 'que' },
  { text: 'decides' },
  { text: 'guardar,' },
  { text: 'para' },
  { text: 'consultarlos' },
  { text: 'por' },
  { text: 'texto' },
  { text: 'y' },
  { text: 'significado' },
  { text: 'desde' },
  { text: 'la' },
  { text: 'aplicación' },
  { text: 'de' },
  { text: 'escritorio.' },
];

export const ManifestoSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const emoEyeRef = useRef<HTMLSpanElement | null>(null);
  const pdotRef = useRef<HTMLSpanElement | null>(null);
  const fxRef = useRef<HTMLDivElement | null>(null);
  const backLayerRef = useRef<HTMLDivElement | null>(null);
  const frontLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sec = sectionRef.current;
    const hero = heroRef.current;
    const emo = emoEyeRef.current;
    const pdot = pdotRef.current;
    const fx = fxRef.current;
    const back = backLayerRef.current;
    const front = frontLayerRef.current;

    if (!sec || !hero || !emo || !pdot || !fx || !back || !front) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Medición para morph de 👀 → pdot
    const measure = () => {
      if (!emo || !pdot) return;
      const er = emo.getBoundingClientRect();
      const pr = pdot.getBoundingClientRect();
      emo.style.setProperty(
        '--tx',
        (pr.left + pr.width / 2 - (er.left + er.width / 2)).toFixed(1) + 'px'
      );
      emo.style.setProperty(
        '--ty',
        (pr.top + pr.height / 2 - (er.top + er.height / 2)).toFixed(1) + 'px'
      );
      emo.style.setProperty(
        '--ds',
        (pr.width / (er.width * 0.18)).toFixed(3)
      );
    };

    window.addEventListener('resize', measure);
    const measureTimer = setTimeout(measure, 120);

    // Seguimiento del cursor + parallax
    let track = true;
    const handleMouseMove = (e: MouseEvent) => {
      if (!sec) return;
      const secRect = sec.getBoundingClientRect();
      const inView =
        secRect.top < window.innerHeight && secRect.bottom > 0;
      if (!inView) return;

      const dx = e.clientX / window.innerWidth - 0.5;
      const dy = e.clientY / window.innerHeight - 0.5;
      if (hero) {
        hero.style.setProperty('--hx', (dx * 4).toFixed(1) + 'px');
        hero.style.setProperty('--hy', (dy * 3.5).toFixed(1) + 'px');
      }
      if (track && emo) {
        emo.style.marginLeft = (dx * 14).toFixed(1) + 'px';
        emo.style.marginTop = (dy * 10).toFixed(1) + 'px';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    const stopTrackTimer = setTimeout(() => {
      track = false;
    }, 1600);

    // Pulso suave donde aterriza el punto
    let pulseTimer: NodeJS.Timeout | null = null;
    if (!reduce) {
      pulseTimer = setTimeout(() => {
        if (!pdot || !fx || !sec) return;
        const r = pdot.getBoundingClientRect();
        const secRect = sec.getBoundingClientRect();
        const p = document.createElement('div');
        p.className = 'pulse';
        p.style.left = r.left - secRect.left + r.width / 2 + 'px';
        p.style.top = r.top - secRect.top + r.height / 2 + 'px';
        fx.appendChild(p);
        setTimeout(() => {
          p.remove();
        }, 1200);
      }, 2580);
    }

    // Spawner de iconos y hashtags animados
    const ICONS: Record<string, string> = {
      like: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
      save: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
      repost:
        '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7z"/><path d="M17 17H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>',
      comment:
        '<path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.8 1.6 5.3 4 6.9V22l3.3-1.8c.9.2 1.8.4 2.7.4 5.5 0 10-3.9 10-8.9S17.5 3 12 3z"/>',
      hash: '<path d="M9.5 3 7.5 21 M16.5 3 14.5 21 M4 8.5h16 M3.5 15.5h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    };
    const KEYS = ['like', 'save', 'repost', 'comment', 'hash'];
    const HTAGS = [
      '#baile',
      '#aprende',
      '#skincare',
      '#receta',
      '#gaming',
      '#lofi',
      '#pov',
      '#fyp',
    ];

    interface Candidate {
      tag: boolean;
      word: string | null;
      fs: number;
      w: number;
      h: number;
      dur: number;
      x0: number;
      amp: number;
      sd: number;
      sdel: number;
      rd: number;
      rdel: number;
      r: number;
      o: number;
      bl: number;
      front: boolean;
      s: number;
      pt?: number;
    }

    const GAP = 56;
    const MAX = 20;
    const TRAVEL = 1.35;
    const BANDS = 4;
    let bandIdx = 0;
    let actives: Candidate[] = [];

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const nowS = () => performance.now() / 1000;

    const getPos = (ic: Candidate, t: number): [number, number] | null => {
      const p = (t - ic.s) / ic.dur;
      if (p < 0 || p > 1) return null;
      const heightRef = sec.clientHeight || window.innerHeight;
      return [
        ic.x0 - ic.amp * Math.cos((Math.PI * (t - ic.s - ic.sdel)) / ic.sd),
        heightRef - p * TRAVEL * heightRef + ic.h / 2,
      ];
    };

    const freePath = (c: Candidate, t0: number) => {
      let t = Math.max(c.s, t0);
      const end = c.s + c.dur;
      while (t <= end) {
        const pc = getPos(c, t);
        if (pc) {
          for (let i = 0; i < actives.length; i++) {
            const pa = getPos(actives[i], t);
            if (
              pa &&
              Math.abs(pc[0] - pa[0]) < (actives[i].w + c.w) / 2 + GAP &&
              Math.abs(pc[1] - pa[1]) < (actives[i].h + c.h) / 2 + GAP
            ) {
              return false;
            }
          }
        }
        t += 0.4;
      }
      return true;
    };

    const makeCandidate = (seed: boolean): Candidate => {
      const isTag = Math.random() < 0.3;
      let w = 0;
      let h = 0;
      let fs = 0;
      let word: string | null = null;
      if (isTag) {
        fs = rnd(13, 30);
        word = HTAGS[(Math.random() * HTAGS.length) | 0];
        w = word.length * fs * 0.62;
        h = fs * 1.5;
      } else {
        const isF = Math.random() < 0.45;
        w = h = isF ? rnd(22, 74) : rnd(50, 130);
      }
      const dur = w < 90 ? rnd(16, 26) : rnd(22, 34);
      const b = bandIdx % BANDS;
      bandIdx++;
      const widthRef = sec.clientWidth || window.innerWidth;
      const mPct = (w / 2 / widthRef) * 100 + 1;
      let lo = Math.max(1, b * 25 + mPct);
      let hi = Math.min(99, (b + 1) * 25 - mPct);
      if (hi <= lo) {
        lo = 1 + mPct;
        hi = 99 - mPct;
      }
      return {
        tag: isTag,
        word,
        fs,
        w,
        h,
        dur,
        x0: (rnd(lo, hi) / 100) * widthRef,
        amp: rnd(6, 26),
        sd: rnd(4, 7.5),
        sdel: -rnd(0, 7),
        rd: rnd(6, 10),
        rdel: -rnd(0, 9),
        r: isTag ? rnd(2, 7) : rnd(4, 14),
        o: w < 90 ? rnd(0.3, 0.55) : rnd(0.05, 0.13),
        bl: w < 90 ? 0 : rnd(1.5, 3),
        front: w < 90 ? Math.random() < 0.7 : Math.random() < 0.25,
        s: nowS() + (seed ? -rnd(0, dur) : 0),
      };
    };

    const commit = (c: Candidate) => {
      const el = document.createElement('div');
      el.className = 'rise';
      const widthRef = sec.clientWidth || window.innerWidth;
      el.style.left = ((c.x0 / widthRef) * 100).toFixed(2) + '%';
      el.style.width = c.w.toFixed(0) + 'px';
      el.style.setProperty('--dur', c.dur.toFixed(2) + 's');
      el.style.setProperty('--del', (c.s - nowS()).toFixed(2) + 's');
      el.style.setProperty('--sd', c.sd.toFixed(2) + 's');
      el.style.setProperty('--sdel', c.sdel.toFixed(2) + 's');
      el.style.setProperty('--rd', c.rd.toFixed(2) + 's');
      el.style.setProperty('--rdel', c.rdel.toFixed(2) + 's');
      el.style.setProperty('--amp', c.amp.toFixed(1) + 'px');
      el.style.setProperty('--r', c.r.toFixed(1) + 'deg');
      el.style.setProperty('--o', c.o.toFixed(2));
      el.style.setProperty('--bl', c.bl.toFixed(1) + 'px');

      el.innerHTML =
        '<div class="sway"><div class="rot">' +
        (c.tag
          ? '<span class="htag" style="font-size:' +
            c.fs.toFixed(1) +
            'px">' +
            c.word +
            '</span>'
          : '<svg viewBox="0 0 24 24" fill="currentColor">' +
            ICONS[KEYS[(Math.random() * KEYS.length) | 0]] +
            '</svg>') +
        '</div></div>';

      el.addEventListener('animationend', (ev) => {
        if (ev.animationName === 'riseUp') {
          const ix = actives.indexOf(c);
          if (ix > -1) actives.splice(ix, 1);
          el.remove();
        }
      });

      el.addEventListener('mouseenter', () => {
        c.pt = nowS();
      });

      el.addEventListener('mouseleave', () => {
        if (c.pt) {
          c.s += nowS() - c.pt;
          c.pt = 0;
        }
      });

      el.addEventListener('click', () => {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      });

      (c.front ? front : back).appendChild(el);
      actives.push(c);
    };

    const trySpawn = (seed: boolean) => {
      for (let a = 0; a < 12; a++) {
        const c = makeCandidate(seed);
        if (freePath(c, nowS())) {
          commit(c);
          return true;
        }
      }
      return false;
    };

    let spawnInterval: NodeJS.Timeout | null = null;
    if (!reduce) {
      for (let i = 0; i < 12; i++) {
        trySpawn(true);
      }
      spawnInterval = setInterval(() => {
        if (document.hidden) return;
        const t = nowS();
        actives = actives.filter((a) => t < a.s + a.dur + 0.2);
        if (actives.length < MAX) {
          trySpawn(false);
        }
      }, 700);
    }

    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(measureTimer);
      clearTimeout(stopTrackTimer);
      if (pulseTimer) clearTimeout(pulseTimer);
      if (spawnInterval) clearInterval(spawnInterval);
      if (back) back.innerHTML = '';
      if (front) front.innerHTML = '';
      if (fx) fx.innerHTML = '';
      actives = [];
    };
  }, []);

  return (
    <section
      className="manif-seq seq"
      id="manifiesto"
      data-nav="light"
      ref={sectionRef}
    >
      <div className="aurora" />
      <div className="vignette" />
      <div className="layer back" ref={backLayerRef} aria-hidden="true" />

      <div className="manif-stage" ref={heroRef} id="hero">
        <h2 className="manif-title" id="h1">
          {/* actores emoji */}
          <span className="emo" id="emoEye" ref={emoEyeRef} aria-hidden="true">
            👀
          </span>
          <span className="emo" id="emoBoom" aria-hidden="true">
            🤯
          </span>
          <span className="emo" id="emoThink" aria-hidden="true">
            💭
          </span>

          <span className="lw">
            <span className="l1">
              <span className="wv">Vemos</span>{' '}
              <span className="wd">
                <span className="b" style={{ '--i': 0 } as React.CSSProperties}>
                  d
                </span>
                <span className="b" style={{ '--i': 1 } as React.CSSProperties}>
                  e
                </span>
                <span className="b" style={{ '--i': 2 } as React.CSSProperties}>
                  m
                </span>
                <span className="b" style={{ '--i': 3 } as React.CSSProperties}>
                  a
                </span>
                <span className="b" style={{ '--i': 4 } as React.CSSProperties}>
                  s
                </span>
                <span className="b" style={{ '--i': 5 } as React.CSSProperties}>
                  i
                </span>
                <span
                  className="x"
                  style={{ '--j': 0, '--mw': '.34em' } as React.CSSProperties}
                >
                  i
                </span>
                <span
                  className="x"
                  style={{ '--j': 1, '--mw': '.34em' } as React.CSSProperties}
                >
                  i
                </span>
                <span
                  className="x"
                  style={{ '--j': 2, '--mw': '.34em' } as React.CSSProperties}
                >
                  i
                </span>
                <span
                  className="x"
                  style={{ '--j': 3, '--mw': '.34em' } as React.CSSProperties}
                >
                  i
                </span>
                <span className="b" style={{ '--i': 6 } as React.CSSProperties}>
                  a
                </span>
                <span
                  className="x"
                  style={{ '--j': 4, '--mw': '.58em' } as React.CSSProperties}
                >
                  a
                </span>
                <span
                  className="x"
                  style={{ '--j': 5, '--mw': '.58em' } as React.CSSProperties}
                >
                  a
                </span>
                <span className="b" style={{ '--i': 7 } as React.CSSProperties}>
                  d
                </span>
                <span className="b" style={{ '--i': 8 } as React.CSSProperties}>
                  o
                </span>
              </span>
              <span className="pdot" id="pdot" ref={pdotRef} />
            </span>
          </span>

          <span className="lw l2">
            <span className="wr">Recordamos</span>{' '}
            <span className="hl">
              muy poco
              <span
                className="spk"
                style={
                  {
                    '--d': '5.2s',
                    left: '-.55em',
                    top: '-.35em',
                  } as React.CSSProperties
                }
              >
                ✨
              </span>
              <span
                className="spk"
                style={
                  {
                    '--d': '5.4s',
                    right: '-.55em',
                    top: '-.3em',
                  } as React.CSSProperties
                }
              >
                ✨
              </span>
            </span>
            <span className="pdot" id="dot2" />
          </span>
        </h2>

        <p className="lead" id="lead">
          <span className="lead-backplate" id="manifLeadBadge">
            {LEAD_WORDS.map((item, idx) => (
              <span
                key={idx}
                className="w"
                style={{ '--k': idx } as React.CSSProperties}
              >
                {item.bold ? <b>{item.text}</b> : item.text}{' '}
              </span>
            ))}
          </span>
        </p>
      </div>

      <div className="layer front" ref={frontLayerRef} aria-hidden="true" />
      <div id="fx" ref={fxRef} />
      <div className="grain" />
    </section>
  );
};
