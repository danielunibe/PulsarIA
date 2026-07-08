import { useState, useEffect } from 'react';

export function useScrollParallax(speed: number = 0.5) {
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        const handleScroll = (e: Event) => {
            const target = e.target as HTMLElement;
            if (target) {
                setOffset(target.scrollTop * speed);
            }
        };

        // We need to find the scrollable element. In this app it seems to be the <main> tag.
        // However, it's safer to attach it to the element itself or a known selector.
        const scrollable = document.querySelector('main');
        if (scrollable) {
            scrollable.addEventListener('scroll', handleScroll, { passive: true });
            return () => scrollable.removeEventListener('scroll', handleScroll);
        }
    }, [speed]);

    return offset;
}
