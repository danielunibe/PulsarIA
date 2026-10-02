'use client';

import { CinemaPlayback } from '@/components/CinemaPlayback';
import type { CinemaVideo } from '@/types';

interface CinemaModeProps {
    videos: CinemaVideo[];
    initialVideoId?: number;
    onClose: () => void;
}
export function CinemaMode(props: CinemaModeProps) {
    return <CinemaPlayback {...props} />;
}
