'use client';

import { AddLinks } from './AddLinks';
import { QueueSection } from './QueueSection';

export interface SidebarProps {
    jobs?: any[];
}

export function Sidebar({ jobs = [] }: SidebarProps) {
    return (
        <aside
            className="w-[360px] xl:w-[380px] 2xl:w-[400px] h-full flex-shrink-0 relative overflow-hidden z-20 flex flex-col font-sans"
            style={{
                background: 'rgba(10, 11, 16, 0.85)',
                backdropFilter: 'blur(50px)',
                WebkitBackdropFilter: 'blur(50px)',
                borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                boxShadow: '10px 0 35px rgba(0, 0, 0, 0.6)',
            }}
        >
            {/* Scrollable Column Content — Dashboard Exclusivo */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 flex flex-col gap-4 custom-scrollbar">
                <AddLinks />
                <QueueSection />
            </div>
        </aside>
    );
}

