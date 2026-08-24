import { useState } from 'react';

export type Platform = 'tiktok' | 'youtube' | 'instagram' | 'generic';

const PLATFORM_REGEXES: Record<Platform, RegExp> = {
  tiktok:   /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i,
  youtube:  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/i,
  instagram:/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\//i,
  generic:  /^https?:\/\/.{5,}/i,
};

const PLAYLIST_REGEX = /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/playlists?\//i;

export function isPlaylistUrl(url: string): boolean {
    return PLAYLIST_REGEX.test(url);
}

export function detectPlatform(url: string): Platform {
  if (PLATFORM_REGEXES.tiktok.test(url)) return 'tiktok';
  if (PLATFORM_REGEXES.youtube.test(url)) return 'youtube';
  if (PLATFORM_REGEXES.instagram.test(url)) return 'instagram';
  if (PLATFORM_REGEXES.generic.test(url)) return 'generic';
  return 'generic';
}

function isValidUrl(url: string): boolean {
  return Object.values(PLATFORM_REGEXES).some(rx => rx.test(url));
}

export type Status = 'idle' | 'analyzing' | 'ready' | 'processing' | 'done';

export function useLinkProcessor() {
    const [activeTab, setActiveTab] = useState<'link' | 'file'>('link');
    const [linkText, setLinkText] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<Status>('idle');
    const [stats, setStats] = useState({ total: 0, valid: 0, invalid: 0 });
    const [validLinks, setValidLinks] = useState<string[]>([]);

    const parseLinksData = (text: string) => {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        const validList: string[] = [];
        let invalidCount = 0;
        lines.forEach(line => {
            if (isValidUrl(line)) validList.push(line);
            else invalidCount++;
        });
        return { total: validList.length + invalidCount, validCount: validList.length, invalidCount, validList };
    };

    const handleProcessData = async () => {
        setStatus('analyzing');
        let rawText = "";

        if (activeTab === 'file' && file) {
            try {
                rawText = await file.text();
            } catch (error) {
                console.error("Error reading file", error);
                resetUI();
                return;
            }
        } else {
            rawText = linkText;
        }

        const result = parseLinksData(rawText);
        setValidLinks(result.validList);

        if (result.total === 0) {
            setStats({ total: 0, valid: 0, invalid: 0 });
            setStatus('ready');
            return;
        }

        // Animation simulation
        let currentCount = 0;
        const steps = 40;
        const increment = result.total / steps;

        const counter = setInterval(() => {
            currentCount += increment;
            if (currentCount >= result.total) {
                clearInterval(counter);
                setStats({ total: result.total, valid: result.validCount, invalid: result.invalidCount });
                setStatus('ready');
            } else {
                const ratio = currentCount / result.total;
                setStats({
                    total: Math.floor(currentCount),
                    valid: Math.floor(result.validCount * ratio),
                    invalid: Math.floor(result.invalidCount * ratio)
                });
            }
        }, 30);
    };

    const handleFinalProcess = async () => {
        setStatus('processing');

        let tauriInvoke: any = null;
        try {
            if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
                const { invoke } = await import('@tauri-apps/api/core');
                tauriInvoke = invoke;
            }
        } catch (e) {
            console.log("Tauri core not available, falling back to fetch.");
        }

        let processedCount = 0;
        for (const url of validLinks) {
            let jobCreated = false;
            try {
                if (tauriInvoke) {
                    await tauriInvoke('add_job', { url });
                    jobCreated = true;
                    console.log("Job queued successfully via Tauri for", url);
                } else {
                    console.log("Attempting native fetch to Axum API for", url);
                    try {
                        const response = await fetch('http://localhost:8080/api/v1/ingest', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url })
                        });
                        if (response.ok) {
                            const data = await response.json();
                            jobCreated = true;
                            console.log("Job queued successfully via Fetch. Job ID:", data.job_id);
                        } else {
                            console.error("Fetch ingest failed:", await response.text());
                        }
                    } catch (fetchError) {
                        console.error("Network error during fetch ingest:", fetchError);
                    }
                }
            } catch (e) {
                console.error("Failed to add job:", e);
            }

            // Always dispatch client event so QueueSection reacts instantly
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('pulsar_job_created', { 
                    detail: { url, timestamp: Date.now() } 
                }));
            }

            processedCount++;
            setStats(prev => ({
                ...prev,
                valid: Math.max(0, validLinks.length - processedCount)
            }));
        }

        setStatus('done');
        setTimeout(() => {
            resetUI();
        }, 800);
    };

    const handleDownloadFile = () => {
        if (validLinks.length === 0) return;
        const content = validLinks.join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tiktok_links_${new Date().getTime()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resetUI();
    };

    const resetUI = () => {
        setLinkText('');
        setFile(null);
        setStatus('idle');
        setStats({ total: 0, valid: 0, invalid: 0 });
        setValidLinks([]);
    };

    const hasData = linkText.trim().length > 0 || file !== null;

    return {
        activeTab, setActiveTab,
        linkText, setLinkText,
        file, setFile,
        status,
        stats,
        validLinks,
        hasData,
        handleProcessData,
        handleFinalProcess,
        handleDownloadFile
    };
}
