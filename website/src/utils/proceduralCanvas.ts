import { SceneKey } from '../types';

const PW = 540;
const PH = 960;
const PROC_CACHE: Partial<Record<SceneKey, string>> = {};

const rndSeed = (k: string) => {
  let s = 0;
  for (const c of k) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
};

function drawLG(x: CanvasRenderingContext2D, st: [number, string][]) {
  const g = x.createLinearGradient(0, 0, 0, PH);
  st.forEach((s) => g.addColorStop(s[0], s[1]));
  x.fillStyle = g;
  x.fillRect(0, 0, PW, PH);
}

function drawRB(
  x: CanvasRenderingContext2D,
  px: number,
  py: number,
  r: number,
  col: string,
  al: number
) {
  const g = x.createRadialGradient(px, py, 0, px, py, r);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = al;
  x.fillStyle = g;
  x.beginPath();
  x.arc(px, py, r, 0, 7);
  x.fill();
  x.globalAlpha = 1;
}

function drawFIG(
  x: CanvasRenderingContext2D,
  px: number,
  py: number,
  s: number,
  col: string
) {
  x.fillStyle = col;
  x.beginPath();
  x.arc(px, py - s * 2.1, s * 0.55, 0, 7);
  x.fill();
  x.beginPath();
  x.moveTo(px - s * 0.72, py - s * 1.45);
  x.quadraticCurveTo(px, py - s * 1.9, px + s * 0.72, py - s * 1.45);
  x.lineTo(px + s * 0.55, py + s * 1.7);
  x.lineTo(px - s * 0.55, py + s * 1.7);
  x.closePath();
  x.fill();
}

function drawSOFT(x: CanvasRenderingContext2D, b: number) {
  x.shadowBlur = b;
}

function safeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

const SCENE: Record<SceneKey, (x: CanvasRenderingContext2D) => void> = {
  coreo(x) {
    drawLG(x, [
      [0, '#f6b98a'],
      [0.55, '#ef8f9e'],
      [1, '#d8cbe8'],
    ]);
    drawRB(x, 420, 140, 220, '#fff3d6', 0.55);
    x.fillStyle = 'rgba(255,255,255,.28)';
    x.beginPath();
    x.ellipse(270, 300, 120, 120, 0, Math.PI, 0);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.18)';
    x.fillRect(0, 660, PW, 300);
    drawFIG(x, 90, 600, 52, '#e05a8a');
    drawFIG(x, 180, 592, 54, '#1d6fd6');
    drawFIG(x, 360, 592, 54, '#f4c542');
    drawFIG(x, 450, 600, 52, '#2f9e44');
    drawFIG(x, 270, 636, 68, '#e63946');
    x.fillStyle = 'rgba(255,255,255,.12)';
    for (let i = 0; i < 5; i++) x.fillRect(40 + i * 100, 680, 52, 280);
  },
  serum(x) {
    drawLG(x, [
      [0, '#efe6d8'],
      [1, '#d9c9b4'],
    ]);
    drawRB(x, 120, 120, 180, '#ffe9c9', 0.6);
    drawRB(x, 460, 160, 140, '#7a9b6d', 0.4);
    x.strokeStyle = 'rgba(255,255,255,.5)';
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(0, 192);
    x.lineTo(PW, 192);
    x.moveTo(0, 300);
    x.lineTo(PW, 300);
    x.stroke();
    x.fillStyle = '#3a2a22';
    x.beginPath();
    x.arc(300, 380, 92, 0, 7);
    x.fill();
    x.beginPath();
    x.ellipse(300, 640, 124, 220, 0, 0, 7);
    x.fill();
    x.fillStyle = '#c99b76';
    x.beginPath();
    x.ellipse(192, 704, 52, 68, -0.4, 0, 7);
    x.fill();
    x.beginPath();
    x.ellipse(352, 784, 60, 40, 0.3, 0, 7);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.88)';
    x.beginPath();
    safeRoundRect(x, 192, 592, 104, 224, 16);
    x.fill();
    x.fillStyle = '#9db892';
    x.fillRect(216, 544, 56, 52);
    x.fillStyle = '#fff';
    x.fillRect(230, 516, 28, 32);
    x.fillStyle = '#f6f1e6';
    x.fillRect(204, 652, 80, 104);
  },
  pasillo(x) {
    x.fillStyle = '#6fb4d8';
    x.fillRect(0, 0, PW, 600);
    x.fillStyle = '#5cb85c';
    x.beginPath();
    x.moveTo(0, 600);
    x.quadraticCurveTo(160, 536, 300, 592);
    x.quadraticCurveTo(440, 636, 540, 584);
    x.lineTo(540, 960);
    x.lineTo(0, 960);
    x.closePath();
    x.fill();
    x.fillStyle = '#e8e4da';
    x.beginPath();
    x.moveTo(192, 960);
    x.lineTo(352, 960);
    x.lineTo(292, 600);
    x.lineTo(256, 600);
    x.closePath();
    x.fill();
    const cols = ['#f2b8c6', '#a8d8e8', '#bfe0b0'];
    let r = 0;
    for (let y = 940; y > 600; y -= 48) {
      const w1 = ((960 - y) / 360) * 80 + 16;
      const x1 = 272 - ((960 - y) / 360) * 80 - 8;
      for (let c = 0; c < 4; c++) {
        x.fillStyle = cols[(r + c) % 3];
        x.beginPath();
        x.moveTo(x1 + (c * w1) / 2, y);
        x.lineTo(x1 + ((c + 1) * w1) / 2, y);
        x.lineTo(x1 + ((c + 1) * w1) / 2 - 6, y - 44);
        x.lineTo(x1 + (c * w1) / 2 - 6, y - 44);
        x.closePath();
        x.fill();
      }
      r++;
    }
    x.strokeStyle = '#f5f0e6';
    x.lineWidth = 4;
    [240, 300, 344, 376].forEach((px, i) => {
      const h = 240 - i * 52;
      x.beginPath();
      x.moveTo(px, 600 - i * 8);
      x.lineTo(px, 600 - i * 8 - h);
      x.lineTo(px + 20, 600 - i * 8 - h);
      x.stroke();
      drawRB(x, px + 20, 600 - i * 8 - h, 20, '#eafcff', 0.9);
    });
    x.fillStyle = '#141416';
    x.fillRect(392, 524, 32, 72);
    drawSOFT(x, 32);
    x.fillStyle = '#fff';
    x.beginPath();
    x.ellipse(104, 360, 80, 40, 0, 0, 7);
    x.fill();
    x.beginPath();
    x.ellipse(432, 472, 68, 32, 0, 0, 7);
    x.fill();
    drawSOFT(x, 0);
  },
  abuela(x) {
    drawLG(x, [
      [0, '#f7d9a0'],
      [0.5, '#e8a34a'],
      [0.72, '#c96a3a'],
      [1, '#4a7a44'],
    ]);
    drawRB(x, 424, 240, 160, '#fff2c9', 0.85);
    drawRB(x, 80, 180, 120, '#5c7a44', 0.5);
    drawRB(x, 240, 140, 100, '#4a6a3a', 0.45);
    x.fillStyle = '#4a7a44';
    x.fillRect(0, 660, PW, 300);
    drawFIG(x, 232, 600, 80, '#e8e4da');
    x.strokeStyle = '#c9c9c9';
    x.lineWidth = 10;
    x.beginPath();
    x.moveTo(216, 516);
    x.quadraticCurveTo(192, 600, 208, 680);
    x.stroke();
    x.fillStyle = '#f5f5f5';
    x.beginPath();
    x.arc(376, 664, 44, 0, 7);
    x.fill();
    x.fillStyle = '#222';
    [
      [360, 648],
      [392, 660],
      [372, 684],
    ].forEach((p) => {
      x.beginPath();
      x.arc(p[0], p[1], 10, 0, 7);
      x.fill();
    });
    x.strokeStyle = 'rgba(255,240,200,.6)';
    x.lineWidth = 4;
    x.beginPath();
    x.arc(232, 536, 52, Math.PI * 1.1, Math.PI * 1.9);
    x.stroke();
  },
  cachorro(x) {
    x.fillStyle = '#8fb8de';
    x.fillRect(0, 0, PW, PH);
    for (let px = 0; px < PW; px += 28) {
      drawSOFT(x, 12);
      x.fillStyle = px % 56 ? '#7aa8d0' : '#9cc3e8';
      x.beginPath();
      safeRoundRect(x, px, 0, 20, PH, 12);
      x.fill();
      drawSOFT(x, 0);
    }
    x.fillStyle = '#f5f2ec';
    x.beginPath();
    x.arc(270, 430, 144, 0, 7);
    x.fill();
    x.fillStyle = '#22201e';
    x.beginPath();
    x.ellipse(144, 336, 52, 68, -0.5, 0, 7);
    x.fill();
    x.beginPath();
    x.ellipse(396, 336, 52, 68, 0.5, 0, 7);
    x.fill();
    x.beginPath();
    x.arc(208, 412, 52, 0, 7);
    x.fill();
    x.beginPath();
    x.arc(332, 412, 52, 0, 7);
    x.fill();
    x.fillStyle = '#5b3a21';
    x.beginPath();
    x.arc(208, 416, 20, 0, 7);
    x.fill();
    x.beginPath();
    x.arc(332, 416, 20, 0, 7);
    x.fill();
    x.fillStyle = '#22201e';
    x.beginPath();
    x.ellipse(270, 488, 24, 18, 0, 0, 7);
    x.fill();
    x.fillStyle = '#e88ba0';
    x.beginPath();
    x.ellipse(270, 544, 24, 32, 0, 0, 7);
    x.fill();
    x.strokeStyle = '#9cc3e8';
    x.lineWidth = 68;
    x.beginPath();
    x.moveTo(0, 704);
    x.quadraticCurveTo(270, 636, 540, 704);
    x.stroke();
    x.fillStyle = '#f5f2ec';
    x.beginPath();
    x.arc(192, 688, 48, 0, 7);
    x.fill();
    x.beginPath();
    x.arc(352, 688, 48, 0, 7);
    x.fill();
    x.strokeStyle = '#3a3a3a';
    x.lineWidth = 4;
    [176, 192, 208, 336, 352, 368].forEach((px) => {
      x.beginPath();
      x.moveTo(px, 712);
      x.lineTo(px, 732);
      x.stroke();
    });
  },
  trompo(x) {
    drawLG(x, [
      [0, '#160a10'],
      [1, '#0a0608'],
    ]);
    drawRB(x, 440, 160, 200, '#FE2C55', 0.32);
    drawRB(x, 92, 300, 180, '#25F4EE', 0.22);
    x.strokeStyle = 'rgba(255,255,255,.3)';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(270, 120);
    x.lineTo(270, 660);
    x.stroke();
    [
      [300, 88],
      [360, 104],
      [424, 112],
      [492, 100],
      [556, 80],
    ].forEach((y, i) => {
      x.fillStyle = [
        '#7a3129',
        '#6e2a24',
        '#7a3129',
        '#5c221d',
        '#4a1a16',
      ][i];
      x.beginPath();
      x.ellipse(270, y[0], y[1], 28, 0, 0, 7);
      x.fill();
      x.strokeStyle = 'rgba(232,139,74,.45)';
      x.lineWidth = 3;
      x.beginPath();
      x.ellipse(270, y[0], y[1], 28, 0, Math.PI * 1.05, Math.PI * 1.95);
      x.stroke();
    });
    x.fillStyle = '#e8c34a';
    x.fillRect(252, 240, 36, 28);
    drawFIG(x, 452, 536, 68, '#1a1216');
    x.strokeStyle = '#dfe9ff';
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(412, 476);
    x.lineTo(352, 516);
    x.stroke();
    drawRB(x, 180, 640, 120, '#8a8a92', 0.18);
    x.fillStyle = '#2a1a10';
    x.fillRect(0, 660, PW, 300);
    drawRB(x, 120, 720, 80, '#FE2C55', 0.25);
    drawRB(x, 400, 744, 88, '#25F4EE', 0.2);
  },
  tortillas(x) {
    drawLG(x, [
      [0, '#2b1a10'],
      [1, '#160d07'],
    ]);
    drawRB(x, 270, 120, 260, '#e8a34a', 0.4);
    x.fillStyle = '#241a12';
    x.beginPath();
    x.ellipse(270, 720, 196, 84, 0, 0, 7);
    x.fill();
    x.fillStyle = '#31241a';
    x.beginPath();
    x.ellipse(270, 708, 172, 68, 0, 0, 7);
    x.fill();
    [
      [216, 676, 60],
      [324, 712, 54],
      [264, 756, 50],
    ].forEach((p) => {
      x.fillStyle = '#e8d8b8';
      x.beginPath();
      x.arc(p[0], p[1], p[2], 0, 7);
      x.fill();
      x.fillStyle = 'rgba(160,110,60,.5)';
      x.beginPath();
      x.arc(p[0] - 16, p[1] - 8, 8, 0, 7);
      x.arc(p[0] + 14, p[1] + 10, 6, 0, 7);
      x.fill();
    });
    x.fillStyle = '#c99b76';
    x.beginPath();
    x.ellipse(60, 600, 68, 92, -0.5, 0, 7);
    x.fill();
    x.beginPath();
    x.ellipse(480, 616, 68, 92, 0.5, 0, 7);
    x.fill();
    x.strokeStyle = '#b78760';
    x.lineWidth = 6;
    [36, 52, 68].forEach((o) => {
      x.beginPath();
      x.moveTo(96, 564 + o);
      x.lineTo(148, 580 + o);
      x.stroke();
      x.beginPath();
      x.moveTo(444, 580 + o);
      x.lineTo(392, 596 + o);
      x.stroke();
    });
    x.strokeStyle = 'rgba(255,255,255,.25)';
    x.lineWidth = 8;
    drawSOFT(x, 16);
    x.beginPath();
    x.moveTo(200, 600);
    x.quadraticCurveTo(220, 540, 200, 480);
    x.stroke();
    x.beginPath();
    x.moveTo(300, 592);
    x.quadraticCurveTo(320, 524, 300, 464);
    x.stroke();
    drawSOFT(x, 0);
  },
  study(x) {
    drawLG(x, [
      [0, '#0d0f14'],
      [1, '#0a0c10'],
    ]);
    x.fillStyle = 'rgba(232,195,74,.16)';
    x.beginPath();
    x.moveTo(92, 108);
    x.lineTo(300, 640);
    x.lineTo(20, 640);
    x.closePath();
    x.fill();
    x.fillStyle = '#3a3a40';
    x.fillRect(76, 88, 40, 28);
    x.fillStyle = '#1a1d24';
    x.fillRect(0, 660, PW, 300);
    x.save();
    x.translate(260, 736);
    x.rotate(-0.07);
    x.fillStyle = '#f2f0ea';
    x.beginPath();
    safeRoundRect(x, -124, -80, 248, 168, 8);
    x.fill();
    x.strokeStyle = '#b9b9b4';
    x.lineWidth = 4;
    [-44, -16, 12, 40].forEach((y) => {
      x.beginPath();
      x.moveTo(-100, y);
      x.lineTo(100, y);
      x.stroke();
    });
    x.strokeStyle = 'rgba(37,244,238,.8)';
    x.lineWidth = 10;
    x.beginPath();
    x.moveTo(-92, -16);
    x.lineTo(12, -16);
    x.stroke();
    x.strokeStyle = 'rgba(254,44,85,.7)';
    x.lineWidth = 10;
    x.beginPath();
    x.moveTo(-92, 12);
    x.lineTo(-12, 12);
    x.stroke();
    x.restore();
    x.fillStyle = '#22262e';
    x.beginPath();
    x.arc(432, 684, 34, 0, 7);
    x.fill();
    x.strokeStyle = '#22262e';
    x.lineWidth = 8;
    x.beginPath();
    x.arc(464, 684, 14, 0, 7);
    x.stroke();
    drawRB(x, 460, 240, 80, '#e8c34a', 0.25);
    drawRB(x, 120, 360, 60, '#8a6a3a', 0.2);
  },
  monstera(x) {
    drawLG(x, [
      [0, '#dfe8da'],
      [1, '#b9c9ae'],
    ]);
    drawRB(x, 412, 168, 220, '#fff8e0', 0.65);
    x.fillStyle = '#8a5a33';
    x.fillRect(0, 736, PW, 224);
    x.fillStyle = '#b8623f';
    x.beginPath();
    x.moveTo(204, 600);
    x.lineTo(336, 600);
    x.lineTo(320, 744);
    x.lineTo(220, 744);
    x.closePath();
    x.fill();
    x.fillStyle = '#8a4a2c';
    x.fillRect(196, 584, 148, 24);
    x.fillStyle = '#3a2417';
    x.beginPath();
    x.ellipse(270, 592, 60, 16, 0, 0, 7);
    x.fill();
    const leaf = (
      px: number,
      py: number,
      s: number,
      rot: number,
      col: string
    ) => {
      x.save();
      x.translate(px, py);
      x.rotate(rot);
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(0, s);
      x.quadraticCurveTo(-s * 1.1, s * 0.2, -s * 0.7, -s * 0.5);
      x.quadraticCurveTo(0, -s * 1.2, s * 0.7, -s * 0.5);
      x.quadraticCurveTo(s * 1.1, s * 0.2, 0, s);
      x.fill();
      x.strokeStyle = 'rgba(223,232,218,.85)';
      x.lineWidth = 6;
      [-0.5, 0, 0.5].forEach((a) => {
        x.beginPath();
        x.moveTo(a * s * 0.5, -s * 0.2);
        x.lineTo(a * s * 0.9, s * 0.35);
        x.stroke();
      });
      x.restore();
    };
    x.strokeStyle = '#2f6b3f';
    x.lineWidth = 8;
    x.beginPath();
    x.moveTo(270, 592);
    x.quadraticCurveTo(240, 480, 192, 428);
    x.moveTo(270, 592);
    x.quadraticCurveTo(300, 460, 356, 416);
    x.moveTo(270, 592);
    x.lineTo(264, 480);
    x.stroke();
    leaf(184, 412, 88, -0.5, '#2f6b3f');
    leaf(364, 400, 92, 0.5, '#3a7d4a');
    leaf(264, 464, 80, 0, '#2f6b3f');
    leaf(132, 516, 64, -0.9, '#3a7d4a');
    leaf(412, 524, 64, 0.9, '#2f6b3f');
  },
};

let grainTile: HTMLCanvasElement | null = null;
function getGrain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  if (!x) return c;
  const id = x.createImageData(128, 128);
  const d = id.data;
  const r = rndSeed('grain');
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 46;
    d[i] = d[i + 1] = d[i + 2] = 128 + n;
    d[i + 3] = 26;
  }
  x.putImageData(id, 0, 0);
  grainTile = c;
  return c;
}

export function getProceduralImage(key: SceneKey): string {
  if (PROC_CACHE[key]) return PROC_CACHE[key]!;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = PW;
  c.height = PH;
  const x = c.getContext('2d');
  if (!x) return '';
  const drawFn = SCENE[key] || SCENE.coreo;
  drawFn(x);

  x.save();
  x.globalAlpha = 0.5;
  const p = x.createPattern(getGrain(), 'repeat');
  if (p) {
    x.fillStyle = p;
    x.fillRect(0, 0, PW, PH);
  }
  x.restore();

  const g = x.createRadialGradient(
    PW / 2,
    PH / 2,
    PH * 0.3,
    PW / 2,
    PH / 2,
    PH * 0.72
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.4)');
  x.fillStyle = g;
  x.fillRect(0, 0, PW, PH);

  const url = c.toDataURL('image/jpeg', 0.85);
  PROC_CACHE[key] = url;
  return url;
}
