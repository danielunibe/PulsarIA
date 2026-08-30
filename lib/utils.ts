/**
 * Combina clases de Tailwind CSS de forma segura.
 * 
 * Utiliza `clsx` para manejar clases condicionales y `tailwind-merge`
 * para resolver conflictos entre clases de Tailwind (ej. si se pasa
 * `bg-red-500 bg-blue-500`, mantiene solo `bg-blue-500`).
 * 
 * @param inputs - Clases CSS, objetos condicionales, arrays, etc.
 * @returns String de clases combinadas y deduplicadas
 * 
 * @example
 * ```tsx
 * cn('px-4 py-2', isActive && 'bg-blue-500', className)
 * // → 'px-4 py-2 bg-blue-500 [className]'
 * ```
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
