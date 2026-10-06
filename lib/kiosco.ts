/**
 * Kiosco Vivo — lógica portada al modo revista de Pulsaria.
 *
 * Origen de la lógica: lector de revistas con librero vivo, spread
 * doble/simple responsive, hoja con flip 3D (`rotateY`), ticks de
 * actualización y arte SVG procedural por semilla.
 *
 * Reglas de Pulsaria que se conservan:
 * - Cero datos inventados: el librero muestra tomos/compilaciones reales
 *   de SQLite; el lector pagina el contenido estructurado real del
 *   artículo (IPC `get_magazine_article_details`).
 * - Los contadores/tiempos "en vivo" derivan de `updated_at`,
 *   compilaciones y versiones reales.
 */

export type KioscoHue = number;

/** PRNG determinista por semilla (misma familia que la referencia). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a | 0) + (0x6d2b79f5 | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla estable desde un id de texto. */
export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/** Canal de matiz con desplazamiento circular. */
export function hueShift(hue: number, offset: number): number {
  return (((Math.round(hue) + offset) % 360) + 360) % 360;
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${hueShift(h, 0)} ${s}% ${l}%)`;
}

/**
 * Arte de portada procedural (4 variantes por `seed % 4`).
 * Devuelve SVG inline como string, sin red ni assets.
 */
export function coverArtSVG(seed: number, hue: number): string {
  const rand = mulberry32(seed);
  const variant = ((seed % 4) + 4) % 4;
  const uid = `k${Math.abs(seed % 100000)}`;
  let defs = '';
  let body = '';
  if (variant === 0) {
    defs = `<linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(hue, 34, 32)}"/><stop offset=".6" stop-color="${hsl(hueShift(hue, 20), 48, 58)}"/><stop offset="1" stop-color="${hsl(hueShift(hue, 36), 54, 76)}"/></linearGradient>`;
    body = `<rect width="100" height="140" fill="url(#${uid})"/>`
      + `<circle cx="50" cy="84" r="26" fill="${hsl(hueShift(hue, 38), 80, 90)}" opacity=".8"/>`;
    for (let i = 0; i < 6; i += 1) {
      body += `<rect x="16" y="${74 + i * 5}" width="68" height="${(1 + i * 0.35).toFixed(2)}" fill="${hsl(hueShift(hue, 20), 48, 40)}" opacity="${(0.4 + i * 0.08).toFixed(2)}"/>`;
    }
  } else if (variant === 1) {
    body = `<rect width="100" height="140" fill="${hsl(hue, 22, 20)}"/>`;
    for (let i = 0; i < 9; i += 1) {
      body += `<circle cx="${(rand() * 100).toFixed(1)}" cy="${(rand() * 140).toFixed(1)}" r="${(10 + rand() * 24).toFixed(1)}" fill="${hsl(hueShift(hue, i * 22), 38, 60)}" opacity="${(0.08 + rand() * 0.14).toFixed(2)}"/>`;
    }
  } else if (variant === 2) {
    defs = `<linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(hueShift(hue, 200), 26, 24)}"/><stop offset="1" stop-color="${hsl(hueShift(hue, 330), 30, 44)}"/></linearGradient>`;
    body = `<rect width="100" height="140" fill="url(#${uid})"/>`;
    for (let i = 0; i < 20; i += 1) {
      body += `<rect x="${(rand() * 30).toFixed(1)}" y="${(8 + i * 6.4).toFixed(1)}" width="${(20 + rand() * 64).toFixed(1)}" height="${(0.9 + rand() * 1.8).toFixed(2)}" fill="${hsl(hueShift(hue, 30), 56, 88)}" opacity="${(0.07 + rand() * 0.24).toFixed(2)}"/>`;
    }
  } else {
    body = `<rect width="100" height="140" fill="${hsl(hue, 20, 17)}"/>`;
    for (let i = 0; i < 6; i += 1) {
      body += `<circle cx="50" cy="72" r="${12 + i * 9}" fill="none" stroke="${hsl(hueShift(hue, i * 18), 38, 68)}" stroke-width="${(0.9 + rand() * 1.5).toFixed(2)}" opacity="${(0.18 + rand() * 0.28).toFixed(2)}"/>`;
    }
    body += `<circle cx="50" cy="72" r="${(8 + rand() * 5).toFixed(1)}" fill="${hsl(hueShift(hue, 36), 72, 84)}" opacity=".7"/>`;
  }
  return `<svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}

/** Arte interior procedural (5 variantes por `seed % 5`). */
export function softArtSVG(seed: number, hue: number): string {
  const rand = mulberry32(seed);
  const variant = ((seed % 5) + 5) % 5;
  const uid = `s${Math.abs(seed % 100000)}`;
  let defs = '';
  let body = '';
  if (variant === 0) {
    defs = `<linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(hue, 32, 32)}"/><stop offset=".55" stop-color="${hsl(hueShift(hue, 18), 44, 58)}"/><stop offset="1" stop-color="${hsl(hueShift(hue, 34), 50, 78)}"/></linearGradient>`;
    body = `<rect width="100" height="100" fill="url(#${uid})"/>`
      + `<circle cx="${(30 + rand() * 40).toFixed(1)}" cy="${(38 + rand() * 14).toFixed(1)}" r="${(11 + rand() * 7).toFixed(1)}" fill="${hsl(hueShift(hue, 38), 72, 88)}" opacity=".72"/>`;
    for (let i = 0; i < 5; i += 1) {
      body += `<rect x="0" y="${62 + i * 8}" width="100" height="${(5 + i * 1.6).toFixed(1)}" fill="${hsl(hueShift(hue, 200), 26, 20 + i * 3)}" opacity="${(0.24 + i * 0.09).toFixed(2)}"/>`;
    }
  } else if (variant === 1) {
    body = `<rect width="100" height="100" fill="${hsl(hue, 24, 24)}"/>`;
    for (let i = 0; i < 7; i += 1) {
      body += `<circle cx="${(rand() * 100).toFixed(1)}" cy="${(rand() * 100).toFixed(1)}" r="${(12 + rand() * 26).toFixed(1)}" fill="${hsl(hueShift(hue, i * 26), 42, 62)}" opacity="${(0.1 + rand() * 0.16).toFixed(2)}"/>`;
    }
  } else if (variant === 2) {
    defs = `<linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(hueShift(hue, 210), 26, 26)}"/><stop offset="1" stop-color="${hsl(hueShift(hue, 340), 30, 46)}"/></linearGradient>`;
    body = `<rect width="100" height="100" fill="url(#${uid})"/>`;
    for (let i = 0; i < 16; i += 1) {
      body += `<rect x="${(rand() * 40).toFixed(1)}" y="${6 + i * 6}" width="${(18 + rand() * 70).toFixed(1)}" height="${(1 + rand() * 2.4).toFixed(2)}" fill="${hsl(hueShift(hue, 30), 60, 88)}" opacity="${(0.08 + rand() * 0.28).toFixed(2)}"/>`;
    }
  } else if (variant === 3) {
    body = `<rect width="100" height="100" fill="${hsl(hue, 20, 18)}"/>`;
    for (let i = 0; i < 6; i += 1) {
      body += `<circle cx="${(45 + rand() * 10).toFixed(1)}" cy="${(48 + rand() * 8).toFixed(1)}" r="${10 + i * 8}" fill="none" stroke="${hsl(hueShift(hue, i * 20), 40, 70)}" stroke-width="${(0.8 + rand() * 1.4).toFixed(2)}" opacity="${(0.2 + rand() * 0.3).toFixed(2)}"/>`;
    }
  } else {
    defs = `<linearGradient id="${uid}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${hsl(hue, 30, 20)}"/><stop offset=".5" stop-color="${hsl(hueShift(hue, 24), 38, 44)}"/><stop offset="1" stop-color="${hsl(hueShift(hue, 190), 26, 66)}"/></linearGradient>`;
    body = `<rect width="100" height="100" fill="url(#${uid})"/>`;
    for (let i = 0; i < 4; i += 1) {
      body += `<polygon points="${-10 + i * 30},100 ${30 + i * 30},100 ${70 + i * 26},-10 ${24 + i * 26},-10" fill="${hsl(hueShift(hue, 40), 50, 86)}" opacity="${(0.05 + i * 0.035).toFixed(2)}"/>`;
    }
  }
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}

/** Matiz aproximado desde un color hexadecimal (`#rrggbb`). */
export function hexToHue(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 24;
  const value = parseInt(match[1], 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 24;
  const delta = max - min;
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return Math.round(((hue * 60) + 360) % 360);
}

/** Tiempo relativo corto (es-MX/en-US) desde un ISO o epoch. */
export function timeAgoEs(value: string | number | null | undefined): string {
  return timeAgo(value, 'es-MX');
}

/** Tiempo relativo corto con idioma base explícito. */
export function timeAgo(
  value: string | number | null | undefined,
  locale: 'es-MX' | 'en-US' = 'es-MX',
): string {
  if (value === null || value === undefined || value === '') return '—';
  const ts = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ts)) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  const prefix = locale === 'en-US' ? '' : 'hace ';
  const suffix = locale === 'en-US' ? ' ago' : '';
  if (seconds < 60) return `${prefix}${seconds} s${suffix}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${prefix}${minutes} min${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${prefix}${hours} h${suffix}`;
  return `${prefix}${Math.floor(hours / 24)} d${suffix}`;
}

/* ---------------- Lógica de flip del spread ---------------- */

/** Paso de página: 1 en simple, 2 en doble. */
export function flipStep(single: boolean): number {
  return single ? 1 : 2;
}

/** Último índice válido del spread. */
export function flipMax(totalPages: number, single: boolean): number {
  return Math.max(0, totalPages - flipStep(single));
}

/** Duración del giro en ms (respeta reduced-motion fuera). */
export const KIOSCO_FLIP_MS = 740;

/* ---------------- Paginación del contenido real ---------------- */

export interface KioscoBlock {
  kind: string;
  text?: string;
  title?: string;
  items?: unknown[];
  steps?: unknown[];
  language?: string;
  code?: string;
  rows?: unknown[];
  path?: string;
  timestamp?: number;
  [key: string]: unknown;
}

function blockWeight(block: KioscoBlock): number {
  const textLength = (block.text ?? block.title ?? '').length;
  const listLength = (block.items ?? block.steps ?? block.rows ?? []).length;
  switch (block.kind) {
    case 'heading':
    case 'title':
      return 2 + Math.ceil(textLength / 120);
    case 'quote':
    case 'citation':
      return 3 + Math.ceil(textLength / 100);
    case 'code':
    case 'snippet':
    case 'command':
      return 4 + Math.ceil(((block.code ?? block.text ?? '').length) / 90);
    case 'figure':
    case 'image':
    case 'keyframe':
    case 'photo':
      return 6;
    case 'ingredients':
    case 'list':
    case 'steps':
      return 2 + listLength * 2;
    default:
      return 2 + Math.ceil(textLength / 140);
  }
}

/**
 * Reparte bloques en páginas de peso acotado (misma idea que el
 * `TOTAL=18` fijo de la referencia, pero con el contenido real).
 */
export function paginateBlocks(blocks: KioscoBlock[], maxWeight = 14): KioscoBlock[][] {
  const pages: KioscoBlock[][] = [];
  let current: KioscoBlock[] = [];
  let weight = 0;
  for (const block of blocks) {
    const cost = blockWeight(block);
    if (current.length > 0 && weight + cost > maxWeight) {
      pages.push(current);
      current = [];
      weight = 0;
    }
    current.push(block);
    weight += cost;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}
