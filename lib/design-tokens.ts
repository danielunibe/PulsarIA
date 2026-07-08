// ================================================================
// DESIGN TOKENS — Pulsar Eventide
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

// ── Escala Tipográfica ────────────────────────────────────────
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

// ── Bordes Estándar ───────────────────────────────────────────
export const BORDER = {
    default: `1px solid #252525`,
    subtle: `1px solid rgba(255,255,255,0.04)`,
    accent: `1px solid rgba(254,44,85,0.25)`,
} as const;

// ── Utilidades de Sombra Dinámica (con colores variables) ─────
export const dynamicGlow = (color: string, alpha = 0.3) =>
    `0 0 16px ${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;

export const dynamicNmRaised = (hovered: boolean) =>
    hovered ? SHADOW.nmHover : SHADOW.nmRaised;
