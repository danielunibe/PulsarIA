// ============================================================
// InactiveCardShell — UI Mate Translucido Premium
// ============================================================

import { TIKTOK_LOGO_PATH } from '@/types';
import { FaHeart, FaCommentDots, FaBookmark, FaShare } from 'react-icons/fa6';

const icons = [FaHeart, FaCommentDots, FaBookmark, FaShare];

interface InactiveCardShellProps {
    hovered: boolean;
    slotIndex?: number;
}

export function InactiveCardShell({ hovered }: InactiveCardShellProps) {
    return (
        <div
            className="absolute inset-0 flex flex-col justify-between p-7 z-[6] pointer-events-none transition-colors duration-[800ms] delay-200"
            style={{
                color: hovered ? 'rgba(140, 140, 140, 0.3)' : 'rgba(100, 100, 100, 0.15)',
                transitionDuration: hovered ? '300ms' : '800ms',
                transitionDelay: hovered ? '0ms' : '200ms',
            }}
        >
            {/* Header: Logo */}
            <div className="flex justify-center">
                <svg
                    className="w-10 h-10 fill-current"
                    viewBox="0 0 24 24"
                    style={{
                        filter: hovered
                            ? 'drop-shadow(1.5px 0px 0px var(--tt-pink-30)) drop-shadow(-1.5px 0px 0px var(--tt-cyan-30))'
                            : 'drop-shadow(1px 1px 1px #000)',
                        transition: hovered ? 'filter 0.3s ease, fill 0.3s ease' : 'filter 0.8s ease 0.2s, fill 0.8s ease 0.2s',
                    }}
                >
                    <path d={TIKTOK_LOGO_PATH} />
                </svg>
            </div>

            {/* Sidebar: Interactive Icons */}
            <div className="absolute right-5 bottom-[60px] flex flex-col gap-6">
                {icons.map((Icon, idx) => (
                    <Icon
                        key={idx}
                        className="w-[28px] h-[28px]"
                        style={{
                            color: 'currentColor',
                            filter: hovered
                                ? 'drop-shadow(1.5px 0px 0px var(--tt-pink-30)) drop-shadow(-1.5px 0px 0px var(--tt-cyan-30))'
                                : 'drop-shadow(1px 1px 1px #000)',
                            transition: hovered ? 'filter 0.3s ease, color 0.3s ease' : 'filter 0.8s ease 0.2s, color 0.8s ease 0.2s',
                        }}
                    />
                ))}
            </div>

            {/* Footer: Skeleton Bars */}
            <div className="flex flex-col gap-2.5 w-[60%]">
                <SkeletonBar width="40%" hovered={hovered} />
                <SkeletonBar width="75%" hovered={hovered} />
                <SkeletonBar width="100%" hovered={hovered} />
            </div>
        </div>
    );
}

function SkeletonBar({ width, hovered }: { width: string, hovered: boolean }) {
    return (
        <div
            className="h-[7px] rounded bg-black/40 relative overflow-hidden"
            style={{ boxShadow: 'inset 1px 1px 2px #000', width }}
        >
            <div
                className="absolute inset-y-0 left-0 bg-current transition-opacity"
                style={{
                    opacity: hovered ? 0.7 : 0.1,
                    transitionDuration: hovered ? '300ms' : '800ms',
                    transitionDelay: hovered ? '0ms' : '200ms',
                    width: '100%'
                }}
            />
        </div>
    );
}

