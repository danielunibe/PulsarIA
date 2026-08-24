'use client';
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { FaBrain, FaVideo, FaPlay } from 'react-icons/fa6';

interface ClusterPanelProps {
    onVideoSelect?: (jobId: number) => void;
}

interface ClusterGroup {
    jobs: Array<{ id: number; title?: string; thumbnail?: string; url: string }>;
    similarity: number;
}

export function ClusterPanel({ onVideoSelect }: ClusterPanelProps) {
    const [clusters, setClusters] = useState<ClusterGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [threshold, setThreshold] = useState(0.7);
    const [minSize, setMinSize] = useState(2);

    const loadClusters = async () => {
        setLoading(true);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const result: number[][] = await invoke('auto_cluster_videos', { 
                threshold, 
                minClusterSize: minSize 
            });
            
            const jobsResponse = await fetch('http://localhost:8080/api/v1/jobs');
            const allJobs: any[] = jobsResponse.ok ? await jobsResponse.json() : [];
            
            const groups: ClusterGroup[] = result.map((jobIds) => {
                const jobs = jobIds.map(id => allJobs.find(j => j.id === id)).filter(Boolean);
                return {
                    jobs: jobs.map(j => ({
                        id: j.id,
                        title: j.title || j.url,
                        thumbnail: j.thumbnail,
                        url: j.url
                    })),
                    similarity: threshold
                };
            }).filter(g => g.jobs.length > 0);
            
            setClusters(groups);
        } catch (e) {
            console.error('Failed to load clusters:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadClusters();
    }, []);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <FaBrain size={12} className="text-[#8a5cff]" />
                    <span className="text-[11px] font-black tracking-[0.2em] uppercase text-white/50">Clusters IA</span>
                </div>
                <button
                    onClick={loadClusters}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[10px] font-bold tracking-wider uppercase text-[#8a5cff] hover:bg-[#8a5cff]/10 transition-colors"
                >
                    <FaPlay size={9} /> Agrupar
                </button>
            </div>

            <div className="flex gap-2 px-1">
                <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-white/40 uppercase tracking-wider">Similitud</label>
                    <input
                        type="range"
                        min="0.5"
                        max="0.99"
                        step="0.01"
                        value={threshold}
                        onChange={e => setThreshold(parseFloat(e.target.value))}
                        className="w-24 accent-[#8a5cff]"
                    />
                    <span className="text-[9px] text-white/50">{(threshold * 100).toFixed(0)}%</span>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-white/40 uppercase tracking-wider">Mínimo</label>
                    <select
                        value={minSize}
                        onChange={e => setMinSize(Number(e.target.value))}
                        className="bg-white/5 border border-white/10 rounded-[8px] px-2 py-1 text-[10px] text-white/80 outline-none"
                    >
                        <option value="2">2 videos</option>
                        <option value="3">3 videos</option>
                        <option value="5">5 videos</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-4 text-white/30 text-[11px]">Agrupando...</div>
            ) : clusters.length === 0 ? (
                <div className="text-center py-6 text-white/25 text-[11px]">
                    <FaBrain size={20} className="mx-auto mb-2 text-[#8a5cff]/40" />
                    <p>Sin clusters encontrados.</p>
                    <p className="mt-1">Ajusta la similitud o procesa más videos.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {clusters.map((cluster, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-3 rounded-[12px] bg-white/[0.03] border border-white/[0.07]"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[9px] font-bold text-[#8a5cff] uppercase tracking-wider">
                                    Cluster {idx + 1}
                                </span>
                                <span className="text-[9px] text-white/40">
                                    {cluster.jobs.length} videos · {(cluster.similarity * 100).toFixed(0)}% similitud
                                </span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                {cluster.jobs.map(job => (
                                    <div
                                        key={job.id}
                                        onClick={() => onVideoSelect?.(job.id)}
                                        className="flex items-center gap-2 p-2 rounded-[8px] bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-colors"
                                    >
                                        {job.thumbnail && (
                                            <img src={job.thumbnail} alt="" className="w-8 h-12 rounded-[4px] object-cover" />
                                        )}
                                        <span className="text-[11px] text-white/70 truncate flex-1">{job.title}</span>
                                        <FaPlay size={10} className="text-white/30" />
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
