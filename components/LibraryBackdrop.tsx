'use client';

import dynamic from 'next/dynamic';
import { AuroraBackground } from '@/components/AuroraBackground';

const ColorBends = dynamic(
    () => import('@/components/ColorBends').then((module) => module.ColorBends),
    { ssr: false },
);

export function LibraryBackdrop({ theme, scrollY }: { theme: string; scrollY: number }) {
    return (
        <div className="pulsaria-library-backdrop" aria-hidden="true">
            {theme === 'chromatic' && (
                <div
                    className="absolute inset-[-10%] h-[120%] w-[120%] bg-[#0a0a0a]"
                    style={{
                        transform: `translateY(${-scrollY}px) scale(1.1)`,
                        transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                >
                    <ColorBends
                        colors={['#ff5c7a', '#8a5cff', '#00ffd1']}
                        rotation={0}
                        speed={0.2}
                        scale={1}
                        frequency={1}
                        warpStrength={1}
                        mouseInfluence={0.5}
                        parallax={0.25}
                        noise={0.1}
                        transparent
                        autoRotate={0}
                    />
                </div>
            )}

            {theme === 'carbon' && (
                <div className="absolute inset-0 overflow-hidden bg-[#09090b]">
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `radial-gradient(ellipse 120% 80% at 20% 10%, rgba(32, 32, 36, 0.70) 0%, transparent 60%), radial-gradient(ellipse 100% 70% at 80% 90%, rgba(20, 20, 24, 0.85) 0%, transparent 60%), radial-gradient(ellipse 80% 80% at 50% 50%, rgba(14, 14, 16, 0.95) 0%, #070708 100%)`,
                        }}
                    />
                    <div
                        className="absolute inset-0"
                        style={{ background: 'radial-gradient(ellipse 90% 85% at 50% 50%, transparent 40%, rgba(5, 5, 6, 0.88) 100%)' }}
                    />
                </div>
            )}

            {theme === 'aurora' && <AuroraBackground contained />}

            {theme === 'oled' && (
                <div className="absolute inset-0 bg-[#010103]">
                    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,255,255,0.02) 0%, transparent 70%)' }} />
                </div>
            )}

            {theme === 'cyberpunk' && (
                <div className="absolute inset-0 bg-[#080512]">
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: 'radial-gradient(ellipse 65% 55% at 15% 20%, rgba(168,85,247,0.2) 0%, transparent 55%), radial-gradient(ellipse 70% 60% at 85% 80%, rgba(236,72,153,0.18) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 50% 60%, rgba(37,244,238,0.12) 0%, transparent 60%)',
                        }}
                    />
                </div>
            )}

            {theme === 'solar' && (
                <div className="absolute inset-0 bg-[#0d0705]">
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: 'radial-gradient(ellipse 70% 60% at 20% 20%, rgba(234, 88, 12, 0.22) 0%, transparent 60%), radial-gradient(ellipse 65% 55% at 85% 85%, rgba(245, 158, 11, 0.18) 0%, transparent 55%), radial-gradient(ellipse 80% 70% at 50% 50%, rgba(69, 10, 10, 0.28) 0%, #080403 100%)',
                        }}
                    />
                </div>
            )}
        </div>
    );
}
