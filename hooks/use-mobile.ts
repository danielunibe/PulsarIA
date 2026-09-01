import * as React from "react"

const MOBILE_BREAKPOINT = 768;

/**
 * Hook para detectar si el viewport actual es de dispositivo móvil.
 * 
 * Usa `window.matchMedia` para escuchar cambios en el tamaño de
 * la ventana. Retorna `true` si el ancho es menor a 768px.
 * 
 * @returns `true` si el viewport es de móvil, `false` si es desktop/tablet
 */
export function useIsMobile() {
    const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

    React.useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
        const onChange = () => {
            setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
        }
        mql.addEventListener("change", onChange)
        // Defer the first synchronization until after the effect commits.
        queueMicrotask(onChange)
        return () => mql.removeEventListener("change", onChange)
    }, [])

    return !!isMobile
}
