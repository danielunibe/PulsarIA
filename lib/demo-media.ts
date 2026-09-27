'use client';

export type DemoMediaKind = 'image' | 'video';

export interface DemoMediaItem {
    slotId: string;
    label: string;
    imageSrc: string;
    videoSrc?: string;
    mediaKind: DemoMediaKind;
    isDemo: true;
}

interface DemoMediaManifest {
    version: 1;
    source?: string;
    generatedAt?: string;
    items: unknown;
}

const DEMO_MANIFEST_URL = '/demo/pulsaria-dev/demo-slots.json';

function isString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function normalizeItem(value: unknown): DemoMediaItem | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const slotId = isString(candidate.slotId) ? candidate.slotId : null;
    const label = isString(candidate.label) ? candidate.label : null;
    const imageSrc = isString(candidate.imageSrc) ? candidate.imageSrc : null;
    const videoSrc = isString(candidate.videoSrc) ? candidate.videoSrc : undefined;
    const mediaKind = candidate.mediaKind === 'video' && videoSrc ? 'video' : 'image';
    if (!slotId || !label || !imageSrc) return null;
    return { slotId, label, imageSrc, videoSrc, mediaKind, isDemo: true };
}

/**
 * Loads the generated, opt-in demo manifest. A missing manifest is an empty
 * demo lane, never a reason to fabricate library records or remote media.
 */
export async function loadDemoMedia(signal?: AbortSignal): Promise<DemoMediaItem[]> {
    try {
        const response = await fetch(DEMO_MANIFEST_URL, { cache: 'no-store', signal });
        if (!response.ok) return [];
        const manifest = await response.json() as Partial<DemoMediaManifest>;
        if (manifest.version !== 1 || !Array.isArray(manifest.items)) return [];
        return manifest.items.map(normalizeItem).filter((item): item is DemoMediaItem => item !== null);
    } catch {
        return [];
    }
}

export { DEMO_MANIFEST_URL };
