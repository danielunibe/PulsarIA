/**
 * @module design-tokens
 * 
 * Design tokens de Pulsaria — constantes TypeScript que reflejan
 * los CSS custom properties definidos en `globals.css`.
 * 
 * **Uso:** Usar estos tokens para valores dinámicos en JavaScript
 * (ej. sombras con colores variables, cálculos de estilos inline).
 * Para CSS estático, usar directamente `var(--token-name)`.
 * 
 * **Tema:** Oscuro premium con glassmorphism.
 * - Background base: `#0a0a0a` con aurora WebGL animada
 * - Superficies: `rgba(10,12,20,0.85)` con `backdrop-filter: blur(40px)`
 * - Bordes: `rgba(255,255,255,0.08)` a `rgba(255,255,255,0.1)`
 */

// ================================================================
// DESIGN TOKENS — Pulsaria
// Constantes TypeScript que reflejan los CSS custom properties.
// Usar para valores dinámicos (ej. shadows con colores variables).
// Para CSS estático, usar directamente var(--token-name).
// ================================================================

// ── Superficies ──────────────────────────────────────────────
export const SURFACE = {
    deep: '#040404',
    base: '#0a0a0a',
    raised: '#161616',
    float: '#1e1e1e',
    border: '#252525',
    input: '#111111',
    card: 'linear-gradient(145deg, #1e1e1e, #141414)',
    sidebar: 'linear-gradient(180deg, #181818 0%, #0a0a0a 100%)',
} as const;

// ── Colores de Acento ─────────────────────────────────────────
export const ACCENT = {
    primary: '#fe2c55',
    cyan: '#25f4ee',
    success: '#10b981',
    primary8: 'rgba(254,44,85,0.08)',
    primary12: 'rgba(254,44,85,0.12)',
    primary20: 'rgba(254,44,85,0.20)',
    primary30: 'rgba(254,44,85,0.30)',
    cyanGlow: 'rgba(37,244,238,0.25)',
} as const;

// ── Colores de Texto ──────────────────────────────────────────
export const TEXT = {
    ghost: 'rgba(255,255,255,0.20)',
    muted: 'rgba(255,255,255,0.45)',
    default: 'rgba(255,255,255,0.75)',
    strong: 'rgba(255,255,255,0.95)',
} as const;

// ── Escala Tipografica ────────────────────────────────────────
export const SIZE = {
    micro: '10px',
    sm: '11px',
    base: '13px',
    md: '15px',
    lg: '17px',
} as const;

// ── Border Radius ─────────────────────────────────────────────
export const RADIUS = {
    sm: '8px',
    md: '14px',
    lg: '20px',
    xl: '28px',
    card: '24px',
} as const;

// ── Sistema de Sombras ────────────────────────────────────────
export const SHADOW = {
    nmInset: 'inset 2px 2px 5px rgba(0,0,0,0.8), inset -1px -1px 2px rgba(255,255,255,0.04)',
    nmRaised: '3px 3px 8px rgba(0,0,0,0.6), -2px -2px 5px rgba(255,255,255,0.04), inset 1px 1px 1px rgba(255,255,255,0.08)',
    nmHover: '3px 3px 8px rgba(0,0,0,0.6), -2px -2px 5px rgba(255,255,255,0.04), 0 0 15px rgba(254,44,85,0.3)',
    card: '0 20px 50px rgba(0,0,0,0.8), inset 0 1px 2px rgba(255,255,255,0.03)',
    glowPink: '0 0 16px rgba(254,44,85,0.35)',
    glowCyan: '0 0 16px rgba(37,244,238,0.25)',
    button: '3px 3px 8px rgba(0,0,0,0.6), -2px -2px 5px rgba(255,255,255,0.04), inset 0 1px 1px rgba(255,255,255,0.08)',
} as const;

// ── Bordes Estandar ───────────────────────────────────────────
export const BORDER = {
    default: `1px solid #252525`,
    subtle: `1px solid rgba(255,255,255,0.04)`,
    accent: `1px solid rgba(254,44,85,0.25)`,
} as const;

// ── Utilidades de Sombra Dinamica (con colores variables) ─────
export const dynamicGlow = (color: string, alpha = 0.3) =>
    `0 0 16px ${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;

export const dynamicNmRaised = (hovered: boolean) =>
    hovered ? SHADOW.nmHover : SHADOW.nmRaised;

// ── Constantes de Diseno del Proyecto ────────────────────────

export const TT_PINK = '#fe2c55';
export const TT_CYAN = '#25f4ee';
export const NM_SHADOW = 'drop-shadow(2px 2px 2px #000) drop-shadow(-1px -1px 1px rgba(255,255,255,0.02))';

export const TIKTOK_ICON_PATHS = [
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
    'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z',
    'M14 9V5l7 7-7 7v-4.1c-7.1 0-11.7 2.2-15.2 6.9 1.4-7 5.4-13.9 15.2-14.8z',
] as const;

export const TIKTOK_COUNTS = ['1.2M', '45K', '22K', '12K'] as const;

export const TIKTOK_LOGO_PATH =
    'M12.525.02c1.31-.02 2.61-.01 3.91.04.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.95v5.26c.04 2.1-.64 4.25-1.95 5.89-1.31 1.66-3.32 2.72-5.46 2.87-2.14.15-4.3-.39-6.02-1.54-1.72-1.15-2.87-2.93-3.23-5.02-.36-2.09.05-4.28 1.15-6.07 1.1-1.78 2.84-3.05 4.88-3.52 1.05-.24 2.14-.3 3.2-.18V9.13c-.6-.04-1.21-.01-1.8.09-1.12.19-2.18.7-2.98 1.49-.8.79-1.35 1.79-1.57 2.89-.22 1.1.01 2.25.61 3.19.6 1.05 1.61 1.83 2.78 2.18 1.17.35 2.44.25 3.55-.26 1.11-.51 1.99-1.4 2.45-2.49.46-1.09.58-2.33.34-3.48V.02h4.38z';
