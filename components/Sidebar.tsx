'use client';

import { useState } from 'react';
import { FaLayerGroup, FaListUl } from 'react-icons/fa6';
import { AddLinks } from './AddLinks';
import { QueueSection } from './QueueSection';
import { PlaylistsPanel } from './PlaylistsPanel';
import type { JobRecord, PendingJob } from '@/hooks/use-jobs';
import { useI18n } from '@/lib/i18n';

/**
 * Props del componente Sidebar — panel lateral izquierdo de Pulsaria.
 * 
 * Contiene: Ingesta & Cola (AddLinks + QueueSection) y Playlists (colecciones temáticas).
 */
export interface SidebarProps {
    jobs: JobRecord[];
    pending: PendingJob[];
    globalProgress: number;
    onSubmitLinks: (urls: string[]) => Promise<void>;
    onRetryJob: (jobId: number) => Promise<void>;
    onRetryPending: (clientId: string) => Promise<void>;
    onPlaylistSelect?: (id: number | null) => void;
    selectedPlaylistId?: number | null;
}

export function Sidebar({
    jobs,
    pending,
    globalProgress,
    onSubmitLinks,
    onRetryJob,
    onRetryPending,
    onPlaylistSelect,
    selectedPlaylistId,
}: SidebarProps) {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<'queue' | 'playlists'>('queue');

    const activeQueueCount =
        pending.length +
        jobs.filter((j) =>
            ['queued', 'downloading', 'transcribing', 'processing', 'retrying'].includes(j.status)
        ).length;

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
            {/* Segmented Navigation Capsule Switch */}
            <div className="px-4 pt-4 pb-1">
                <div className="flex items-center p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-md">
                    <button
                        type="button"
                        onClick={() => setActiveTab('queue')}
                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                            activeTab === 'queue'
                                ? 'bg-gradient-to-r from-[#fe2c55]/20 to-[#8a5cff]/20 text-white border border-white/10 shadow-lg'
                                : 'text-white/60 hover:text-white/90 hover:bg-white/[0.02]'
                        }`}
                    >
                        <FaLayerGroup size={12} className={activeTab === 'queue' ? 'text-[#fe2c55]' : 'text-white/40'} />
                        <span>{t('queue')}</span>
                        {activeQueueCount > 0 && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-[#fe2c55] text-white shadow-[0_0_8px_rgba(254,44,85,0.6)] animate-pulse">
                                {activeQueueCount}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('playlists')}
                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                            activeTab === 'playlists'
                                ? 'bg-gradient-to-r from-[#8a5cff]/20 to-[#25f4ee]/20 text-white border border-white/10 shadow-lg'
                                : 'text-white/60 hover:text-white/90 hover:bg-white/[0.02]'
                        }`}
                    >
                        <FaListUl size={12} className={activeTab === 'playlists' ? 'text-[#8a5cff]' : 'text-white/40'} />
                        <span>{t('playlists')}</span>
                        {selectedPlaylistId !== null && selectedPlaylistId !== undefined && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#25f4ee] shadow-[0_0_6px_#25f4ee]" />
                        )}
                    </button>
                </div>
            </div>

            {/* Scrollable Column Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 flex flex-col gap-5 custom-scrollbar">
                {activeTab === 'queue' ? (
                    <>
                        <AddLinks onSubmitLinks={onSubmitLinks} />
                        <QueueSection
                            jobs={jobs}
                            pending={pending}
                            globalProgress={globalProgress}
                            onRetryJob={onRetryJob}
                            onRetryPending={onRetryPending}
                        />
                    </>
                ) : (
                    onPlaylistSelect && (
                        <PlaylistsPanel
                            onPlaylistSelect={onPlaylistSelect}
                            selectedPlaylistId={selectedPlaylistId ?? null}
                        />
                    )
                )}
            </div>
        </aside>
    );
}
