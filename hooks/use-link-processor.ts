import { useState } from 'react';

const TIKTOK_REGEX = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i;

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
            if (TIKTOK_REGEX.test(line)) validList.push(line);
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
            try {
                if (tauriInvoke) {
                    await tauriInvoke('add_job', { url });
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
            processedCount++;
            setStats(prev => ({
                ...prev,
                valid: Math.max(0, validLinks.length - processedCount)
            }));
        }

        setStatus('done');
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('jobs-added'));
        }
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
