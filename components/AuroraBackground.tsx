'use client';

// ============================================================
// AuroraBackground — Aceternity UI Aurora Style (colores TikTok)
// Reemplaza el canvas WebGL por CSS puro de alta performance.
// Fixed positioning: mismo comportamiento que el anterior.
// ============================================================

/**
 * AuroraBackground — Fondo aurora animado con CSS puro.
 * 
 * Reemplaza el canvas WebGL por CSS puro de alta performance.
 * Usa dos capas de gradientes radiales con animación en
 * direcciones opuestas para crear profundidad.
 * 
 * Colores: cian (#25f4ee), magenta (#fe2c55), violeta (#8b5cf6)
 * sobre fondo oscuro (#06080f).
 */
export function AuroraBackground() {
    return (
        <div
            className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden"
            style={{ zIndex: -10, backgroundColor: '#06080f' }}
            aria-hidden="true"
        >
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage: [
                        `radial-gradient(ellipse 70% 55% at 15% 45%, rgba(37,244,238,0.40) 0%, transparent 55%)`,
                        `radial-gradient(ellipse 65% 50% at 82% 58%, rgba(254,44,85,0.36) 0%, transparent 50%)`,
                        `radial-gradient(ellipse 55% 45% at 50% 10%, rgba(139,92,246,0.18) 0%, transparent 60%)`,
                    ].join(', '),
                    backgroundSize: '300% 300%',
                    animation: 'aurora 18s ease-in-out infinite alternate',
                    willChange: 'background-position',
                    transform: 'translateZ(0)',
                }}
            />

            {/* Capa 2 — Movimiento contra-fase para profundidad */}
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage: [
                        `radial-gradient(ellipse 50% 40% at 78% 20%, rgba(37,244,238,0.26) 0%, transparent 60%)`,
                        `radial-gradient(ellipse 60% 45% at 22% 75%, rgba(254,44,85,0.28) 0%, transparent 55%)`,
                    ].join(', '),
                    backgroundSize: '260% 260%',
                    animation: 'aurora 24s ease-in-out infinite alternate-reverse',
                    mixBlendMode: 'screen',
                    opacity: 0.9,
                    willChange: 'background-position',
                    transform: 'translateZ(0)',
                }}
            />

            {/* Viñeta oscura — menos agresiva para no tapar aurora */}
            <div
                className="absolute inset-0"
                style={{
                    background: 'radial-gradient(ellipse 90% 80% at 50% 50%, transparent 20%, rgba(6,8,15,0.65) 100%)',
                }}
            />
        </div>
    );
}

