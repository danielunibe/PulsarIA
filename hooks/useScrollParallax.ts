import { useState, useEffect } from 'react';

/**
 * Hook de parallax suave basado en scroll.
 * 
 * Escucha el evento de scroll del elemento `<main>` y retorna
 * un offset numérico que se puede usar para mover elementos
 * con un efecto de profundidad (parallax).
 * 
 * @param speed - Velocidad del parallax (default: 0.5). Valores más altos = más movimiento.
 * @returns Offset de scroll multiplicado por la velocidad
 */
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
