import { useState, useEffect, useRef } from 'react';
import { AddLinks } from './AddLinks';
import { QueueSection } from './QueueSection';
import { FaServer } from 'react-icons/fa6';

export interface SidebarProps {
    activeTab?: 'dashboard' | 'semantic-config';
    onTabChange?: (tab: 'dashboard' | 'semantic-config') => void;
}

export function Sidebar({ activeTab = 'dashboard', onTabChange }: SidebarProps) {
    const asideRef = useRef<HTMLDivElement>(null);
    const [sidebarWidth, setSidebarWidth] = useState(390);

    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            for (let entry of entries) {
                setSidebarWidth(entry.contentRect.width);
            }
        });

        if (asideRef.current) {
            observer.observe(asideRef.current);
        }

        return () => observer.disconnect();
    }, []);

    // El factor de escala se reduce conforme el sidebar se hace más pequeño
    // Base: 390px -> Scale 1.0. A 280px -> Scale ~0.72
    const baseWidth = 390;
    const contentScale = Math.max(0.70, Math.min(1, sidebarWidth / baseWidth));
    
    // El padding y gap también se reducen proporcionalmente
    const dynamicPadding = Math.max(12, Math.min(24, (sidebarWidth / baseWidth) * 24));
    const dynamicGap = Math.max(12, Math.min(32, (sidebarWidth / baseWidth) * 32));

    return (
        <aside
            ref={asideRef}
            className="w-[24vw] min-w-[280px] max-w-[420px] h-full flex-shrink-0 relative overflow-visible z-20 backdrop-blur-[80px]"
            style={{
                background: 'var(--surface-sidebar)',
                borderRight: '1px solid rgba(255,255,255,0.04)',
                boxShadow: '10px 0 30px rgba(0,0,0,0.6)',
                transition: 'width 0.1s ease-out'
            }}
        >
            <div 
                className="flex flex-col gap-2 pt-4 px-2 xl:px-4 pb-0 h-full origin-top"
                style={{ 
                    transform: `scale(${contentScale})`,
                    width: `${100 / contentScale}%`
                }}
            >
                {/* Content */}
                <div 
                    className="flex-1 flex flex-col overflow-y-auto overflow-x-visible pt-1 pb-10 relative z-10 custom-scrollbar" 
                    style={{ 
                        gap: `${dynamicGap}px`,
                        padding: `0 ${dynamicPadding}px`,
                        margin: `0 -${dynamicPadding}px` 
                    }}
                >
                    {/* Navigation Tabs */}
                    <div className="flex bg-black/40 border border-white/5 rounded-xl p-1 gap-1 relative z-10 mx-1">
                        <button
                            onClick={() => onTabChange?.('dashboard')}
                            className={`flex-1 py-2 px-3 text-xs font-bold tracking-widest uppercase rounded-lg transition-all ${
                                activeTab === 'dashboard'
                                    ? 'bg-[#fe2c55]/20 text-white shadow-[0_0_15px_rgba(254,44,85,0.3)] border border-[#fe2c55]/30'
                                    : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                            }`}
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => onTabChange?.('semantic-config')}
                            className={`flex-1 py-2 px-3 flex items-center justify-center gap-2 text-xs font-bold tracking-widest uppercase rounded-lg transition-all ${
                                activeTab === 'semantic-config'
                                    ? 'bg-[#25f4ee]/20 text-white shadow-[0_0_15px_rgba(37,244,238,0.3)] border border-[#25f4ee]/30'
                                    : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                            }`}
                        >
                            <FaServer size={12} className={activeTab === 'semantic-config' ? 'text-[#25f4ee]' : ''} />
                            Engine
                        </button>
                    </div>

                    {/* Dashboard specific panels */}
                    {activeTab === 'dashboard' && (
                        <>
                            <AddLinks />
                            <QueueSection />
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
}
