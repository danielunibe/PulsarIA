'use client';

import { useEffect, useState } from 'react';
import { loadDemoMedia, type DemoMediaItem } from '@/lib/demo-media';

export function useDemoMedia(enabled: boolean) {
    const [items, setItems] = useState<DemoMediaItem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setItems([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        void loadDemoMedia(controller.signal).then((nextItems) => {
            if (!controller.signal.aborted) setItems(nextItems);
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [enabled]);

    return { items, loading };
}
