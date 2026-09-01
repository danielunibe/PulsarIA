'use client';

import { AddLinks } from './AddLinks';
import { QueueSection } from './QueueSection';
import type { JobRecord, PendingJob } from '@/hooks/use-jobs';

/**
 * Props del componente Sidebar — panel lateral izquierdo de Pulsar Eventide.
 * 
 * Contiene: AddLinks (ingesta de enlaces), QueueSection (monitor de progreso de la cola)
 * y PlaylistsPanel (colecciones temáticas).
 */
export interface SidebarProps {
    jobs: JobRecord[];
    pending: PendingJob[];
    globalProgress: number;
    onSubmitLinks: (urls: string[]) => Promise<void>;
    onRetryJob: (jobId: number) => Promise<void>;
    onRetryPending: (clientId: string) => Promise<void>;
}

export function Sidebar({
    jobs,
    pending,
    globalProgress,
    onSubmitLinks,
    onRetryJob,
    onRetryPending,
}: SidebarProps) {
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
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 flex flex-col gap-5 custom-scrollbar">
                <AddLinks onSubmitLinks={onSubmitLinks} />
                <QueueSection
                    jobs={jobs}
                    pending={pending}
                    globalProgress={globalProgress}
                    onRetryJob={onRetryJob}
                    onRetryPending={onRetryPending}
                />
            </div>
        </aside>
    );
}
